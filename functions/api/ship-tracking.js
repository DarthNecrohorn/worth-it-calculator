import { recordAdminApiUsage } from "../lib/admin-usage.js";

/*
 * =========================================================
 * WORTH IT — SHIP TRACKING API
 * Pelyr OPEN-AIS + EuRIS HTTPS integration
 *
 * Public frontend endpoint:
 *   /api/ship-tracking?action=vessels&bbox=west,south,east,north&max=...
 *   /api/ship-tracking?action=vessel&mmsi=...
 *   /api/ship-tracking?action=track&mmsi=...&from=...&to=...&resolution=...
 *   /api/ship-tracking?action=sources
 *
 * Cloudflare Secrets:
 *   PELYR_API_KEY
 *   EURIS_API_TOKEN
 *
 * The secrets are kept server-side. The browser never receives them.
 * =========================================================
 */

const PELYR_BASE = "https://api.pelyr.com";
const EURIS_BASES = [
    "https://www.eurisportal.eu",
    "https://eurisportal.eu"
];

const VESSEL_CACHE_TTL_SECONDS = 45;
const EURIS_REGION = {
    west: -25,
    south: 33,
    east: 55,
    north: 72
};
const MAX_EURIS_RESULTS = 600;
const EURIS_PAGE_SIZE = 100;
const MAX_EURIS_PAGES =
    Math.ceil(
        MAX_EURIS_RESULTS /
        EURIS_PAGE_SIZE
    );
const DETAIL_CACHE_TTL_SECONDS = 20;
const TRACK_CACHE_TTL_SECONDS = 60;
const SOURCE_CACHE_TTL_SECONDS = 6 * 60 * 60;

const MAX_VESSEL_RESULTS = 1000;

const TRACK_RESOLUTIONS = new Set([
    "1min",
    "5min",
    "15min",
    "1h",
    "6h",
    "1d"
]);

const inFlight = new Map();

let eurisQueryMode = 0;

export async function onRequestGet(context){
    try{
        const url = new URL(context.request.url);
        const action = String(
            url.searchParams.get("action") || "vessels"
        ).trim().toLowerCase();

        const apiKey = String(
            context.env.PELYR_API_KEY || ""
        ).trim();

        const eurisToken = String(
            context.env.EURIS_API_TOKEN || ""
        )
            .replace(/^Bearer\s+/i, "")
            .trim();

        if(
            !apiKey &&
            !eurisToken
        ){
            console.error(
                "Neither PELYR_API_KEY nor EURIS_API_TOKEN is configured."
            );

            return jsonResponse(
                {
                    ok: false,
                    error: {
                        code: "not_configured",
                        message: "Ship tracking service is not configured."
                    }
                },
                500
            );
        }

        if(action === "vessels"){
            return await handleVessels(
                context,
                url,
                apiKey,
                eurisToken
            );
        }

        if(action === "vessel"){
            return await handleVessel(context, url, apiKey);
        }

        if(action === "track"){
            return await handleTrack(context, url, apiKey);
        }

        if(action === "sources"){
            return await handleSources(context, apiKey);
        }

        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "bad_request",
                    message: "Unknown Ship Tracking action."
                }
            },
            400
        );
    }
    catch(error){
        console.error("Ship Tracking API error:", error);

        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "internal_error",
                    message: "Ship tracking service is temporarily unavailable."
                }
            },
            500
        );
    }
}

async function handleVessels(
    context,
    url,
    apiKey,
    eurisToken
){
    const bboxText = String(
        url.searchParams.get("bbox") || ""
    ).trim();

    const bboxParts = bboxText
        .split(",")
        .map(Number);

    if(
        bboxParts.length !== 4 ||
        bboxParts.some(function(value){
            return !Number.isFinite(value);
        })
    ){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "invalid_bbox",
                    message: "A valid west,south,east,north bounding box is required."
                }
            },
            400
        );
    }

    const west = bboxParts[0];
    const south = bboxParts[1];
    const east = bboxParts[2];
    const north = bboxParts[3];

    if(
        west < -180 ||
        west > 180 ||
        east < -180 ||
        east > 180 ||
        south < -90 ||
        south > 90 ||
        north < -90 ||
        north > 90 ||
        west >= east ||
        south >= north
    ){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "invalid_bbox",
                    message: "The requested map bounding box is invalid."
                }
            },
            400
        );
    }

    const requestedMax = Number(
        url.searchParams.get("max")
    );

    const max =
        Number.isFinite(requestedMax) &&
        requestedMax > 0
            ? Math.min(
                MAX_VESSEL_RESULTS,
                Math.floor(requestedMax)
            )
            : 400;

    const key =
        "vessels:" +
        [west, south, east, north, max]
            .map(function(value){
                return Number(value).toFixed(3);
            })
            .join(",");

    const cached = await readCache(context, key);

    if(cached){
        return withApiHeaders(
            cached,
            {
                "X-Ship-Tracking-Cache": "HIT"
            }
        );
    }

    const euBbox =
        intersectWithEurisRegion([
            west,
            south,
            east,
            north
        ]);

    const requestKey =
        key;

    const pelyrPromise =
        apiKey
            ? dedupe(
                requestKey,
                async function(){
                    recordAdminApiUsage(context, {
                        apiKey: "ship_tracking",
                        provider: "Pelyr OPEN-AIS"
                    });

                    return await fetchPelyrJson(
                        apiKey,
                        "/v1/vessels?" +
                        new URLSearchParams({
                            bbox: [
                                west,
                                south,
                                east,
                                north
                            ].join(","),
                            max: String(max)
                        }).toString()
                    );
                }
            )
            : Promise.resolve({
                ok: false,
                skipped: true
            });

    const eurisPromise =
        eurisToken && euBbox
            ? dedupe(
                "euris:" + key,
                async function(){
                    recordAdminApiUsage(context, {
                        apiKey: "ship_tracking_euris",
                        provider: "EuRIS"
                    });

                    return await fetchEurisTracks(
                        eurisToken,
                        euBbox,
                        Math.min(
                            MAX_EURIS_RESULTS,
                            max
                        )
                    );
                }
            )
            : Promise.resolve({
                ok: false,
                skipped: true
            });

    const results =
        await Promise.allSettled([
            pelyrPromise,
            eurisPromise
        ]);

    const normalizeSettledSource =
        function(result, providerCode){
            if(
                result.status === "fulfilled"
            ){
                return result.value;
            }

            console.error(
                "Ship Tracking source promise failed:",
                providerCode,
                result.reason
            );

            return {
                ok: false,
                skipped: false,
                status: 502,
                body: {
                    ok: false,
                    error: {
                        code:
                            providerCode +
                            "_internal_error",
                        message:
                            providerCode === "euris"
                                ? "EuRIS is temporarily unavailable."
                                : "Pelyr is temporarily unavailable."
                    }
                }
            };
        };

    const pelyrData =
        normalizeSettledSource(
            results[0],
            "pelyr"
        );

    const eurisData =
        normalizeSettledSource(
            results[1],
            "euris"
        );

    if(
        !pelyrData.ok &&
        !eurisData.ok
    ){
        const failure =
            !pelyrData.skipped
                ? pelyrData
                : eurisData;

        return jsonResponse(
            failure.body || {
                ok: false,
                error: {
                    code: "upstream_unavailable",
                    message: "AIS providers are temporarily unavailable."
                }
            },
            failure.status || 502,
            failure.retryAfterMs > 0
                ? {
                    "Retry-After":
                        String(
                            Math.max(
                                1,
                                Math.ceil(
                                    failure.retryAfterMs / 1000
                                )
                            )
                        )
                }
                : undefined
        );
    }

    let pelyrVessels = [];
    let pelyrTruncated = false;
    let pelyrAttributions = [];

    if(pelyrData.ok){
        const sourceMap =
            await getSourceMap(
                context,
                apiKey
            );

        const normalizedPelyr =
            Array.isArray(
                pelyrData.body.vessels
            )
                ? pelyrData.body.vessels
                    .map(normalizeVessel)
                    .filter(Boolean)
                : [];

        if(sourceMap.ok){
            pelyrAttributions =
                collectAttributions(
                    normalizedPelyr,
                    sourceMap.sources
                );
        }

        pelyrVessels =
            normalizedPelyr.map(function(vessel){
                vessel.provider =
                    "Pelyr";
                vessel.providers =
                    ["Pelyr"];

                return vessel;
            });

        pelyrTruncated =
            Boolean(
                pelyrData.body.truncated
            );
    }

    const eurisRawItems =
        eurisData.ok
            ? extractEurisTrackItems(
                eurisData.body
            )
            : [];

    const eurisVessels =
        eurisRawItems
            .map(normalizeEurisVessel)
            .filter(Boolean);

    const vessels =
        mergeVesselLists(
            pelyrVessels,
            eurisVessels
        );

    const attributions = [
        ...pelyrAttributions
    ];

    if(
        eurisVessels.length > 0 &&
        !attributions.includes(
            "API/Service Tracks_v3 incorporated from EuRIS (eurisportal.eu)"
        )
    ){
        attributions.push(
            "API/Service Tracks_v3 incorporated from EuRIS (eurisportal.eu)"
        );
    }

    const sourcesUsed = [];

    if(pelyrVessels.length){
        sourcesUsed.push("Pelyr");
    }

    if(eurisVessels.length){
        sourcesUsed.push("EuRIS");
    }

    const body = {
        ok: true,
        generated_at:
            pelyrData.ok &&
            pelyrData.body.generated_at
                ? pelyrData.body.generated_at
                : new Date().toISOString(),
        count: vessels.length,
        truncated:
            pelyrTruncated ||
            Boolean(
                eurisData.body &&
                eurisData.body.truncated
            ),
        vessels,
        attributions,
        sources_used: sourcesUsed,
        source_status: {
            Pelyr: {
                enabled: Boolean(apiKey),
                ok: Boolean(pelyrData.ok),
                count: pelyrVessels.length
            },
            EuRIS: {
                enabled: Boolean(eurisToken),
                ok: Boolean(eurisData.ok),
                raw_count: eurisRawItems.length,
                count: eurisVessels.length,
                pages:
                    Number(
                        eurisData.pagination &&
                        eurisData.pagination.pages
                    ) || 0,
                pagination_complete:
                    eurisData.pagination
                        ? Boolean(
                            eurisData.pagination.complete
                        )
                        : false,
                endpoint:
                    eurisData.ok
                        ? String(eurisData.endpoint || "")
                        : "",
                error_code:
                    !eurisData.ok &&
                    !eurisData.skipped &&
                    eurisData.body &&
                    eurisData.body.error
                        ? String(
                            eurisData.body.error.code || ""
                        )
                        : ""
            }
        }
    };

    if(
        eurisData.ok &&
        eurisRawItems.length > 0 &&
        eurisVessels.length === 0
    ){
        console.warn(
            "EuRIS returned track items, but none matched the vessel normalizer.",
            {
                rawCount: eurisRawItems.length
            }
        );
    }

    const response = jsonResponse(body, 200, {
        "Cache-Control":
            "public, max-age=" +
            VESSEL_CACHE_TTL_SECONDS,
        "CDN-Cache-Control":
            "public, max-age=" +
            VESSEL_CACHE_TTL_SECONDS,
        "X-Ship-Tracking-Cache": "MISS"
    });

    await writeCache(
        context,
        key,
        response.clone()
    );

    return response;
}

async function handleVessel(context, url, apiKey){
    const mmsi = String(
        url.searchParams.get("mmsi") || ""
    ).trim();

    if(!/^\d{9}$/.test(mmsi)){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "bad_request",
                    message: "A valid 9-digit MMSI is required."
                }
            },
            422
        );
    }

    const key = "vessel:" + mmsi;

    const cached = await readCache(context, key);

    if(cached){
        return withApiHeaders(
            cached,
            {
                "X-Ship-Tracking-Cache": "HIT"
            }
        );
    }

    const data = await dedupe(
        key,
        async function(){
            recordAdminApiUsage(context, {
                apiKey: "ship_tracking",
                provider: "Pelyr OPEN-AIS"
            });

            return await fetchPelyrJson(
                apiKey,
                "/v1/vessels/" +
                encodeURIComponent(mmsi)
            );
        }
    );

    if(!data.ok){
        return jsonResponse(data.body, data.status);
    }

    const sourceMap = await getSourceMap(context, apiKey);

    if(!sourceMap.ok){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "attribution_unavailable",
                    message: "AIS source attribution could not be resolved."
                }
            },
            502
        );
    }

    const vessel = normalizeVessel(data.body);

    if(!vessel){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "invalid_response",
                    message: "The AIS vessel response was incomplete."
                }
            },
            502
        );
    }

    const body = {
        ok: true,
        vessel,
        attributions: collectAttributions(
            [vessel],
            sourceMap.sources
        )
    };

    const response = jsonResponse(body, 200, {
        "Cache-Control":
            "public, max-age=" +
            DETAIL_CACHE_TTL_SECONDS,
        "CDN-Cache-Control":
            "public, max-age=" +
            DETAIL_CACHE_TTL_SECONDS,
        "X-Ship-Tracking-Cache": "MISS"
    });

    await writeCache(
        context,
        key,
        response.clone()
    );

    return response;
}

async function handleTrack(context, url, apiKey){
    const mmsi = String(
        url.searchParams.get("mmsi") || ""
    ).trim();

    if(!/^\d{9}$/.test(mmsi)){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "bad_request",
                    message: "A valid 9-digit MMSI is required."
                }
            },
            422
        );
    }

    const requestedResolution = String(
        url.searchParams.get("resolution") || "1h"
    ).trim();

    if(!TRACK_RESOLUTIONS.has(requestedResolution)){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "invalid_resolution",
                    message: "Unsupported track resolution."
                }
            },
            400
        );
    }

    const now = new Date();

    const requestedFrom = String(
        url.searchParams.get("from") || ""
    ).trim();

    const requestedTo = String(
        url.searchParams.get("to") || ""
    ).trim();

    const from =
        requestedFrom ||
        new Date(
            now.getTime() -
            24 * 60 * 60 * 1000
        ).toISOString();

    const to =
        requestedTo ||
        now.toISOString();

    if(
        !isIsoUtc(from) ||
        !isIsoUtc(to) ||
        new Date(from).getTime() >= new Date(to).getTime()
    ){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "invalid_time_range",
                    message: "Track times must be valid ISO 8601 UTC values."
                }
            },
            400
        );
    }

    const key =
        "track:" +
        [
            mmsi,
            from,
            to,
            requestedResolution
        ].join(":");

    const cached = await readCache(context, key);

    if(cached){
        return withApiHeaders(
            cached,
            {
                "X-Ship-Tracking-Cache": "HIT"
            }
        );
    }

    const data = await dedupe(
        key,
        async function(){
            recordAdminApiUsage(context, {
                apiKey: "ship_tracking",
                provider: "Pelyr OPEN-AIS"
            });

            const query = new URLSearchParams({
                from,
                to,
                resolution: requestedResolution
            });

            return await fetchPelyrJson(
                apiKey,
                "/v1/vessels/" +
                encodeURIComponent(mmsi) +
                "/track?" +
                query.toString()
            );
        }
    );

    if(!data.ok){
        return jsonResponse(data.body, data.status);
    }

    const sourceMap = await getSourceMap(context, apiKey);

    if(!sourceMap.ok){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "attribution_unavailable",
                    message: "AIS source attribution could not be resolved."
                }
            },
            502
        );
    }

    const points = Array.isArray(data.body.points)
        ? data.body.points
            .map(normalizeTrackPoint)
            .filter(Boolean)
        : [];

    const attributions = collectTrackAttributions(
        points,
        sourceMap.sources
    );

    const body = {
        ok: true,
        mmsi,
        from: data.body.from || from,
        to: data.body.to || to,
        resolution:
            data.body.resolution ||
            requestedResolution,
        count: points.length,
        points,
        attributions
    };

    const response = jsonResponse(body, 200, {
        "Cache-Control":
            "public, max-age=" +
            TRACK_CACHE_TTL_SECONDS,
        "CDN-Cache-Control":
            "public, max-age=" +
            TRACK_CACHE_TTL_SECONDS,
        "X-Ship-Tracking-Cache": "MISS"
    });

    await writeCache(
        context,
        key,
        response.clone()
    );

    return response;
}

async function handleSources(context, apiKey){
    const key = "sources";

    const cached = await readCache(context, key);

    if(cached){
        return withApiHeaders(
            cached,
            {
                "X-Ship-Tracking-Cache": "HIT"
            }
        );
    }

    const sourceMap = await getSourceMap(
        context,
        apiKey,
        true
    );

    if(!sourceMap.ok){
        return jsonResponse(
            {
                ok: false,
                error: {
                    code: "attribution_unavailable",
                    message: "AIS source directory is temporarily unavailable."
                }
            },
            502
        );
    }

    const response = jsonResponse(
        {
            ok: true,
            generated_at:
                sourceMap.generated_at ||
                null,
            sources:
                sourceMap.sources
        },
        200,
        {
            "Cache-Control":
                "public, max-age=" +
                SOURCE_CACHE_TTL_SECONDS,
            "CDN-Cache-Control":
                "public, max-age=" +
                SOURCE_CACHE_TTL_SECONDS,
            "X-Ship-Tracking-Cache": "MISS"
        }
    );

    await writeCache(
        context,
        key,
        response.clone()
    );

    return response;
}

async function getSourceMap(context, apiKey, force){
    const key = "sources";

    if(!force){
        const cached = await readCache(context, key);

        if(cached){
            try{
                const body = await cached.clone().json();

                return {
                    ok: true,
                    generated_at: body.generated_at,
                    sources: body.sources || []
                };
            }
            catch(error){
                console.warn(
                    "Ship Tracking source cache parse failed:",
                    error
                );
            }
        }
    }

    const inFlightKey = "upstream:sources";

    const data = await dedupe(
        inFlightKey,
        async function(){
            recordAdminApiUsage(context, {
                apiKey: "ship_tracking_sources",
                provider: "Pelyr OPEN-AIS"
            });

            return await fetchPelyrJson(
                apiKey,
                "/v1/sources"
            );
        }
    );

    if(!data.ok){
        return {
            ok: false
        };
    }

    const sources = Array.isArray(data.body.sources)
        ? data.body.sources
            .map(function(item){
                if(!item || typeof item !== "object"){
                    return null;
                }

                return {
                    id: String(item.id || ""),
                    license: String(item.license || ""),
                    source: String(item.source || ""),
                    attribution: String(item.attribution || "")
                };
            })
            .filter(function(item){
                return Boolean(item && item.id);
            })
        : [];

    const normalizedBody = {
        ok: true,
        generated_at: data.body.generated_at || null,
        sources
    };

    /*
     * The source directory changes rarely. Cache the normalized
     * copy so vessel/detail/track requests do not repeatedly spend
     * the provider's 1-request/minute sources budget.
     */
    await writeCache(
        context,
        key,
        jsonResponse(
            normalizedBody,
            200,
            {
                "Cache-Control":
                    "public, max-age=" +
                    SOURCE_CACHE_TTL_SECONDS,
                "CDN-Cache-Control":
                    "public, max-age=" +
                    SOURCE_CACHE_TTL_SECONDS
            }
        )
    );

    return {
        ok: true,
        generated_at: normalizedBody.generated_at,
        sources: normalizedBody.sources
    };
}

function intersectWithEurisRegion(bbox){
    if(
        !Array.isArray(bbox) ||
        bbox.length !== 4
    ){
        return null;
    }

    const west =
        Math.max(
            Number(bbox[0]),
            EURIS_REGION.west
        );

    const south =
        Math.max(
            Number(bbox[1]),
            EURIS_REGION.south
        );

    const east =
        Math.min(
            Number(bbox[2]),
            EURIS_REGION.east
        );

    const north =
        Math.min(
            Number(bbox[3]),
            EURIS_REGION.north
        );

    if(
        ![
            west,
            south,
            east,
            north
        ].every(Number.isFinite) ||
        west >= east ||
        south >= north
    ){
        return null;
    }

    return {
        west,
        south,
        east,
        north
    };
}

async function fetchEurisTracks(token, bbox, max){
    if(!token || !bbox){
        return {
            ok: false,
            skipped: true,
            status: 0
        };
    }

    /*
     * EuRIS currently documents Tracks_v3 at
     * /api/v3/tracks/bounding-box on www.eurisportal.eu.
     * Some traffic/API deployments have historically exposed
     * the same services through the /visuris prefix, and the
     * apex host can route differently from the www host.
     *
     * We therefore keep a very small, deterministic fallback
     * list.  We never fan out all requests in parallel:
     * 404 advances to the next route/host, 400 advances to
     * the next query shape, and auth/rate/server errors stop
     * immediately.
     */
    const endpoints = [];

    EURIS_BASES.forEach(function(base){
        endpoints.push(
            {
                base,
                version: "Tracks_v2",
                path: "/visuris/api/TracksV2/GetTracksByBBoxV2"
            },
            {
                base,
                version: "Tracks_v2_legacy",
                path: "/visuris/api/TracksV2/GetTracksByBBox"
            },
            {
                base,
                version: "Tracks_v3",
                path: "/api/v3/tracks/bounding-box"
            },
            {
                base,
                version: "Tracks_v3_visuris",
                path: "/visuris/api/v3/tracks/bounding-box"
            }
        );
    });

    const buildQuery = function(endpoint, bboxValue, limit, queryIndex){
        if(
            endpoint.version === "Tracks_v2" ||
            endpoint.version === "Tracks_v2_legacy"
        ){
            return new URLSearchParams({
                minLat: Number(bboxValue.south).toFixed(6),
                maxLat: Number(bboxValue.north).toFixed(6),
                minLon: Number(bboxValue.west).toFixed(6),
                maxLon: Number(bboxValue.east).toFixed(6),
                pageSize:
                    String(
                        Math.min(
                            EURIS_PAGE_SIZE,
                            limit
                        )
                    )
            });
        }

        if(queryIndex === 1){
            return new URLSearchParams({
                minLongitude: String(bboxValue.west),
                minLatitude: String(bboxValue.south),
                maxLongitude: String(bboxValue.east),
                maxLatitude: String(bboxValue.north),
                "$top": String(limit)
            });
        }

        if(queryIndex === 2){
            return new URLSearchParams({
                minLon: String(bboxValue.west),
                minLat: String(bboxValue.south),
                maxLon: String(bboxValue.east),
                maxLat: String(bboxValue.north),
                "$top": String(limit)
            });
        }

        if(queryIndex === 3){
            return new URLSearchParams({
                minX: String(bboxValue.west),
                minY: String(bboxValue.south),
                maxX: String(bboxValue.east),
                maxY: String(bboxValue.north),
                "$top": String(limit)
            });
        }

        return new URLSearchParams({
            west: String(bboxValue.west),
            south: String(bboxValue.south),
            east: String(bboxValue.east),
            north: String(bboxValue.north),
            "$top": String(limit)
        });
    };

    let lastFailure = null;
    let attempts = 0;

    /*
     * Prefer the last known-good query shape when an isolate
     * already has one.  A parameter-validation failure (400)
     * automatically rotates through the other documented/legacy
     * naming conventions.
     */
    const queryIndexes =
        endpoint => (
            endpoint.version === "Tracks_v2" ||
            endpoint.version === "Tracks_v2_legacy"
                ? [0]
                : [eurisQueryMode, 0, 1, 2, 3]
                    .filter(function(value, index, array){
                        return (
                            Number.isInteger(value) &&
                            value >= 0 &&
                            value < 4 &&
                            array.indexOf(value) === index
                        );
                    })
        );

    for(
        let endpointIndex = 0;
        endpointIndex < endpoints.length;
        endpointIndex++
    ){
        const endpoint =
            endpoints[endpointIndex];

        const indexes =
            queryIndexes(endpoint);

        for(
            let preferenceIndex = 0;
            preferenceIndex < indexes.length;
            preferenceIndex++
        ){
            const queryIndex =
                indexes[preferenceIndex];

            const query =
                buildQuery(
                    endpoint,
                    bbox,
                    max,
                    queryIndex
                );

            let response;
            attempts += 1;

            try{
                response = await fetch(
                    endpoint.base +
                    endpoint.path +
                    "?" +
                    query.toString(),
                    {
                        method: "GET",
                        redirect: "follow",
                        headers: {
                            "Authorization":
                                "Bearer " + token,
                            "Accept":
                                "application/json",
                            "Origin":
                                "https://www.eurisportal.eu",
                            "Referer":
                                "https://www.eurisportal.eu/",
                            "X-Requested-With":
                                "XMLHttpRequest"
                        }
                    }
                );
            }
            catch(error){
                console.error(
                    "EuRIS network request failed:",
                    error
                );

                return {
                    ok: false,
                    status: 502,
                    attempts,
                    body: {
                        ok: false,
                        error: {
                            code: "euris_unavailable",
                            message: "EuRIS is temporarily unavailable."
                        }
                    }
                };
            }

            const retryAfter =
                Number(
                    response.headers.get("Retry-After")
                );

            if(response.ok){
                const body =
                    await response
                        .json()
                        .catch(function(){
                            return null;
                        });

                if(
                    body &&
                    typeof body === "object"
                ){
                    let finalBody =
                        body;

                    let pagination =
                        {
                            pages: 1,
                            complete: true,
                            truncated: false,
                            error_code: ""
                        };

                    if(
                        endpoint.version === "Tracks_v2" ||
                        endpoint.version === "Tracks_v2_legacy"
                    ){
                        const paginated =
                            await paginateEurisPages(
                                endpoint,
                                endpoint.base +
                                    endpoint.path +
                                    "?" +
                                    query.toString(),
                                body,
                                token,
                                max,
                                attempts
                            );

                        finalBody =
                            paginated.body;

                        pagination =
                            paginated.pagination;

                        attempts =
                            paginated.attempts;
                    }

                    if(
                        endpoint.version === "Tracks_v3" ||
                        endpoint.version === "Tracks_v3_visuris"
                    ){
                        eurisQueryMode = queryIndex;
                    }

                    return {
                        ok: true,
                        status: 200,
                        attempts,
                        body: finalBody,
                        endpoint:
                            endpoint.version,
                        base:
                            endpoint.base,
                        path:
                            endpoint.path,
                        query_mode:
                            queryIndex,
                        pagination
                    };
                }

                lastFailure = {
                    ok: false,
                    status: 502,
                    attempts,
                    body: {
                        ok: false,
                        error: {
                            code: "euris_invalid_response",
                            message: "EuRIS returned an invalid vessel response."
                        }
                    }
                };

                break;
            }

            const errorBody =
                await response
                    .json()
                    .catch(function(){
                        return null;
                    });

            lastFailure = {
                ok: false,
                status: response.status,
                retryAfterMs:
                    Number.isFinite(retryAfter) && retryAfter > 0
                        ? Math.ceil(retryAfter * 1000)
                        : 0,
                attempts,
                endpoint:
                    endpoint.version,
                base:
                    endpoint.base,
                path:
                    endpoint.path,
                query_mode:
                    queryIndex,
                body: {
                    ok: false,
                    error: {
                        code:
                            errorBody &&
                            errorBody.error &&
                            typeof errorBody.error.code === "string"
                                ? errorBody.error.code
                                : "euris_http_" + response.status,
                        message:
                            errorBody &&
                            errorBody.error &&
                            typeof errorBody.error.message === "string"
                                ? errorBody.error.message
                                : "EuRIS vessel request failed."
                    }
                }
            };

            /*
             * 404: this route/host combination is not exposed;
             * move directly to the next route.  This keeps the
             * fallback cheap instead of trying four query shapes.
             *
             * 400: the route exists, but the bbox parameter names
             * are not accepted; try the next shape.
             *
             * 401/403/429/5xx and other errors stop immediately so
             * we do not create a request storm against EuRIS.
             */
            if(response.status === 404){
                break;
            }

            if(response.status !== 400){
                return lastFailure;
            }
        }
    }

    return lastFailure || {
        ok: false,
        status: 502,
        attempts,
        body: {
            ok: false,
            error: {
                code: "euris_unavailable",
                message: "EuRIS vessel data is temporarily unavailable."
            }
        }
    };
}

async function paginateEurisPages(
    endpoint,
    initialUrl,
    firstBody,
    token,
    max,
    attempts
){
    const allItems =
        extractEurisTrackItems(
            firstBody
        );

    const visited =
        new Set([initialUrl]);

    let nextUrl =
        resolveEurisNextPageUrl(
            initialUrl,
            firstBody.nextPageLink ||
                firstBody["@odata.nextLink"] ||
                firstBody.nextLink
        );

    let pageCount = 1;
    let complete = !nextUrl;
    let paginationError = "";

    while(
        nextUrl &&
        allItems.length < max &&
        pageCount < MAX_EURIS_PAGES
    ){
        if(
            visited.has(nextUrl)
        ){
            complete = false;
            paginationError =
                "euris_pagination_cycle";
            break;
        }

        visited.add(nextUrl);
        attempts += 1;

        let response;

        try{
            response = await fetch(
                nextUrl,
                {
                    method: "GET",
                    redirect: "follow",
                    headers: {
                        "Authorization":
                            "Bearer " + token,
                        "Accept":
                            "application/json",
                        "Origin":
                            "https://www.eurisportal.eu",
                        "Referer":
                            "https://www.eurisportal.eu/",
                        "X-Requested-With":
                            "XMLHttpRequest"
                    }
                }
            );
        }
        catch(error){
            console.error(
                "EuRIS pagination request failed:",
                error
            );

            complete = false;
            paginationError =
                "euris_pagination_unavailable";
            break;
        }

        if(!response.ok){
            complete = false;
            paginationError =
                "euris_pagination_http_" +
                response.status;
            break;
        }

        const pageBody =
            await response
                .json()
                .catch(function(){
                    return null;
                });

        if(
            !pageBody ||
            typeof pageBody !== "object"
        ){
            complete = false;
            paginationError =
                "euris_pagination_invalid_response";
            break;
        }

        const pageItems =
            extractEurisTrackItems(
                pageBody
            );

        if(
            pageItems.length
        ){
            allItems.push(
                ...pageItems
            );
        }

        pageCount += 1;

        nextUrl =
            resolveEurisNextPageUrl(
                nextUrl,
                pageBody.nextPageLink ||
                    pageBody["@odata.nextLink"] ||
                    pageBody.nextLink
            );
    }

    if(
        !nextUrl &&
        !paginationError
    ){
        complete = true;
    }

    if(
        nextUrl &&
        allItems.length >= max
    ){
        complete = false;
    }

    if(
        nextUrl &&
        pageCount >= MAX_EURIS_PAGES
    ){
        complete = false;

        if(!paginationError){
            paginationError =
                "euris_pagination_limit";
        }
    }

    const limitedItems =
        allItems.slice(
            0,
            max
        );

    const body = {
        ...firstBody,
        items:
            limitedItems,
        truncated:
            Boolean(
                nextUrl ||
                (
                    Number(firstBody.count) >
                    limitedItems.length
                )
            ),
        nextPageLink:
            nextUrl || null,
        _pagination: {
            pages: pageCount,
            complete,
            truncated:
                Boolean(
                    nextUrl
                ),
            collected:
                limitedItems.length,
            reported_count:
                Number.isFinite(
                    Number(firstBody.count)
                )
                    ? Number(firstBody.count)
                    : null,
            error_code:
                paginationError
        }
    };

    return {
        body,
        attempts,
        pagination: {
            pages: pageCount,
            complete,
            truncated:
                Boolean(
                    nextUrl
                ),
            error_code:
                paginationError
        }
    };
}

function resolveEurisNextPageUrl(
    currentUrl,
    rawNext
){
    if(
        !rawNext
    ){
        return null;
    }

    try{
        const url =
            new URL(
                String(rawNext),
                currentUrl
            );

        const allowed =
            EURIS_BASES.some(function(base){
                return (
                    url.origin ===
                    new URL(base).origin
                );
            });

        if(!allowed){
            console.warn(
                "Rejected EuRIS pagination URL outside EuRIS hosts:",
                url.origin
            );

            return null;
        }

        return url.toString();
    }
    catch(error){
        console.warn(
            "Invalid EuRIS nextPageLink:",
            rawNext
        );

        return null;
    }
}


function extractEurisTrackItems(body){
    if(Array.isArray(body)){
        return body;
    }

    if(
        !body ||
        typeof body !== "object"
    ){
        return [];
    }

    const keys = [
        "value",
        "tracks",
        "items",
        "results",
        "data",
        "vessels",
        "features",
        "rows"
    ];

    for(const key of keys){
        if(Array.isArray(body[key])){
            return body[key];
        }
    }

    if(
        body.data &&
        typeof body.data === "object"
    ){
        return extractEurisTrackItems(
            body.data
        );
    }

    if(
        body.result &&
        typeof body.result === "object"
    ){
        return extractEurisTrackItems(
            body.result
        );
    }

    return [];
}

function firstDefinedValue(objects, names){
    if(!Array.isArray(objects)){
        return null;
    }

    for(const object of objects){
        if(!object || typeof object !== "object"){
            continue;
        }

        for(const name of names){
            if(
                object[name] !== undefined &&
                object[name] !== null &&
                object[name] !== ""
            ){
                return object[name];
            }
        }
    }

    return null;
}

function findNestedValue(root, names, maxDepth = 4){
    const wanted =
        new Set(
            (Array.isArray(names) ? names : [])
                .map(String)
        );

    if(
        !root ||
        typeof root !== "object" ||
        wanted.size === 0
    ){
        return null;
    }

    const queue = [
        {
            value: root,
            depth: 0
        }
    ];

    const seen = new Set();

    while(queue.length){
        const current = queue.shift();
        const object = current.value;
        const depth = current.depth;

        if(
            !object ||
            typeof object !== "object" ||
            seen.has(object)
        ){
            continue;
        }

        seen.add(object);

        for(const key of Object.keys(object)){
            const value = object[key];

            if(
                wanted.has(key) &&
                value !== null &&
                value !== undefined &&
                value !== ""
            ){
                return value;
            }
        }

        if(depth >= maxDepth){
            continue;
        }

        Object.keys(object).forEach(function(key){
            const value = object[key];

            if(
                value &&
                typeof value === "object"
            ){
                queue.push({
                    value,
                    depth: depth + 1
                });
            }
        });
    }

    return null;
}

function findGeoPoint(root){
    if(
        !root ||
        typeof root !== "object"
    ){
        return null;
    }

    const candidates = [
        root.geometry && root.geometry.coordinates,
        root.position && root.position.coordinates,
        root.location && root.location.coordinates,
        root.coordinates
    ];

    for(const coordinates of candidates){
        if(
            Array.isArray(coordinates) &&
            coordinates.length >= 2
        ){
            const lon = Number(coordinates[0]);
            const lat = Number(coordinates[1]);

            if(
                Number.isFinite(lat) &&
                Number.isFinite(lon) &&
                lat >= -90 &&
                lat <= 90 &&
                lon >= -180 &&
                lon <= 180
            ){
                return {
                    lat,
                    lon
                };
            }
        }
    }

    return null;
}



function findAnyMmsi(root, maxDepth = 7){
    if(
        root === null ||
        root === undefined
    ){
        return null;
    }

    const queue = [
        {
            value: root,
            depth: 0
        }
    ];

    const seen = new Set();

    while(queue.length){
        const current = queue.shift();
        const value = current.value;
        const depth = current.depth;

        if(
            value === null ||
            value === undefined
        ){
            continue;
        }

        if(
            typeof value !== "object"
        ){
            const digits =
                String(value)
                    .replace(/[^0-9]/g, "");

            if(
                /^\d{9}$/.test(digits)
            ){
                return digits;
            }

            continue;
        }

        if(seen.has(value)){
            continue;
        }

        seen.add(value);

        const keys = Object.keys(value);

        for(
            let index = 0;
            index < keys.length;
            index += 1
        ){
            const key = keys[index];
            const child = value[key];

            if(
                child === null ||
                child === undefined
            ){
                continue;
            }

            const normalizedKey =
                String(key)
                    .replace(/[^a-z0-9]/gi, "")
                    .toLowerCase();

            if(
                /mmsi/.test(normalizedKey)
            ){
                const digits =
                    String(child)
                        .replace(/[^0-9]/g, "");

                if(
                    /^\d{9}$/.test(digits)
                ){
                    return digits;
                }
            }

            if(
                typeof child !== "object"
            ){
                const digits =
                    String(child)
                        .replace(/[^0-9]/g, "");

                if(
                    /^\d{9}$/.test(digits)
                ){
                    return digits;
                }

                continue;
            }

            if(depth < maxDepth){
                queue.push({
                    value: child,
                    depth: depth + 1
                });
            }
        }
    }

    return null;
}

function findNestedCoordinatePair(root, maxDepth = 7){
    if(
        !root ||
        typeof root !== "object"
    ){
        return null;
    }

    const queue = [
        {
            value: root,
            depth: 0
        }
    ];

    const seen = new Set();

    while(queue.length){
        const current = queue.shift();
        const value = current.value;
        const depth = current.depth;

        if(
            !value ||
            typeof value !== "object" ||
            seen.has(value)
        ){
            continue;
        }

        seen.add(value);

        const keys = Object.keys(value);

        const latKey = keys.find(function(key){
            return /^(lat|latitude|y|positionlat|latitudevalue)$/i.test(
                String(key)
            );
        });

        const lonKey = keys.find(function(key){
            return /^(lon|lng|longitude|x|positionlon|positionlng|longitudevalue)$/i.test(
                String(key)
            );
        });

        if(
            latKey &&
            lonKey
        ){
            const lat = Number(value[latKey]);
            const lon = Number(value[lonKey]);

            if(
                Number.isFinite(lat) &&
                Number.isFinite(lon) &&
                lat >= -90 &&
                lat <= 90 &&
                lon >= -180 &&
                lon <= 180
            ){
                return {
                    lat,
                    lon
                };
            }
        }

        keys.forEach(function(key){
            const child = value[key];

            if(
                depth < maxDepth &&
                child &&
                typeof child === "object"
            ){
                queue.push({
                    value: child,
                    depth: depth + 1
                });
            }
        });
    }

    return null;
}

function normalizeEurisVessel(item){
    if(
        !item ||
        typeof item !== "object"
    ){
        return null;
    }

    const position =
        item.position &&
        typeof item.position === "object"
            ? item.position
            : {};

    const vesselData =
        item.vessel &&
        typeof item.vessel === "object"
            ? item.vessel
            : {};

    const shipData =
        item.ship &&
        typeof item.ship === "object"
            ? item.ship
            : {};

    const trackData =
        item.track &&
        typeof item.track === "object"
            ? item.track
            : {};

    const objects = [
        item,
        position,
        vesselData,
        shipData,
        trackData
    ];

    const nested = function(names){
        const direct =
            firstDefinedValue(
                objects,
                names
            );

        return (
            direct !== null
                ? direct
                : findNestedValue(
                    item,
                    names
                )
        );
    };

    const explicitMmsi =
        nested([
            "mmsi",
            "MMSI",
            "Mmsi",
            "mmsiNumber",
            "MmsiNumber",
            "MMSINumber",
            "shipMmsi",
            "ShipMmsi",
            "shipMMSI",
            "ShipMMSI",
            "vesselMmsi",
            "VesselMmsi",
            "vesselMMSI",
            "VesselMMSI",
            "aisMmsi",
            "AisMmsi",
            "AisMMSI"
        ]);

    const trackId =
        nested([
            "trackID",
            "TrackID",
            "trackId",
            "TrackId"
        ]);

    const realMmsi =
        String(explicitMmsi || "").trim();

    const normalizedTrackId =
        trackId !== null &&
        trackId !== undefined &&
        String(trackId).trim()
            ? String(trackId).trim()
            : null;

    const latitudeValue =
        nested([
            "lat",
            "Lat",
            "latitude",
            "Latitude",
            "latitudeDegrees",
            "LatitudeDegrees",
            "latDeg",
            "LatDeg",
            "shipLatitude",
            "ShipLatitude",
            "shipLat",
            "ShipLat",
            "vesselLatitude",
            "VesselLatitude",
            "vesselLat",
            "VesselLat",
            "positionLatitude",
            "PositionLatitude",
            "positionLat",
            "PositionLat",
            "lastLatitude",
            "LastLatitude"
        ]);

    const longitudeValue =
        nested([
            "lon",
            "Lon",
            "longitude",
            "Longitude",
            "longitudeDegrees",
            "LongitudeDegrees",
            "lonDeg",
            "LonDeg",
            "shipLongitude",
            "ShipLongitude",
            "shipLon",
            "ShipLon",
            "vesselLongitude",
            "VesselLongitude",
            "vesselLon",
            "VesselLon",
            "positionLongitude",
            "PositionLongitude",
            "positionLon",
            "PositionLon",
            "lastLongitude",
            "LastLongitude"
        ]);

    let lat =
        latitudeValue === null ||
        latitudeValue === undefined ||
        latitudeValue === ""
            ? NaN
            : Number(latitudeValue);

    let lon =
        longitudeValue === null ||
        longitudeValue === undefined ||
        longitudeValue === ""
            ? NaN
            : Number(longitudeValue);

    if(
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ){
        const point =
            findGeoPoint(item) ||
            findNestedCoordinatePair(item);

        if(point){
            lat = point.lat;
            lon = point.lon;
        }
    }

    if(
        !mmsi &&
        !normalizedTrackId ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
    ){
        return null;
    }

    return {
        id:
            mmsi
                ? "mmsi:" + mmsi
                : normalizedTrackId
                    ? "euris-track:" +
                        normalizedTrackId
                    : "",
        mmsi:
            /^\d{9}$/.test(realMmsi)
                ? realMmsi
                : null,
        real_mmsi:
            /^\d{9}$/.test(realMmsi)
                ? realMmsi
                : null,
        track_id:
            normalizedTrackId,
        lat,
        lon,
        sog:
            normalizeEurisSog(
                nested([
                    "sog",
                    "SOG",
                    "Sog",
                    "speedOverGround",
                    "SpeedOverGround",
                    "speed",
                    "Speed"
                ])
            ).value,
        sog_status:
            normalizeEurisSog(
                nested([
                    "sog",
                    "SOG",
                    "Sog",
                    "speedOverGround",
                    "SpeedOverGround",
                    "speed",
                    "Speed"
                ])
            ).status,
        cog: nullableNumber(
            nested([
                "cog",
                "COG",
                "Cog",
                "courseOverGround",
                "CourseOverGround",
                "course",
                "Course"
            ])
        ),
        heading: nullableNumber(
            nested([
                "heading",
                "Heading",
                "trueHeading",
                "TrueHeading"
            ])
        ),
        nav_status: nullableNumber(
            nested([
                "nav_status",
                "NavStatus",
                "navigationStatus",
                "NavigationStatus"
            ])
        ),
        ts: String(
            nested([
                "ts",
                "Ts",
                "timestamp",
                "Timestamp",
                "lastUpdate",
                "LastUpdate",
                "positionTime",
                "PositionTime",
                "time",
                "Time",
                "updateTime",
                "UpdateTime",
                "posTS",
                "PosTS"
            ]) || new Date().toISOString()
        ),
        plausibility: "",
        flags: [],
        position_license: "",
        name: nullableString(
            nested([
                "name",
                "shipName",
                "ship_name",
                "Name",
                "shipName",
                "ShipName",
                "vesselName",
                "VesselName",
                "ship_name",
                "vessel_name"
            ])
        ),
        type: nullableNumber(
            nested([
                "type",
                "Type",
                "shipType",
                "ShipType",
                "vesselType",
                "VesselType",
                "ship_type",
                "vessel_type"
            ])
        ),
        imo: nullableNumber(
            nested([
                "imo",
                "IMO",
                "imoNumber",
                "ImoNumber"
            ])
        ),
        callsign: nullableString(
            nested([
                "callsign",
                "Callsign",
                "callSign",
                "CallSign"
            ])
        ),
        destination: nullableString(
            nested([
                "destination",
                "Destination",
                "dest",
                "Dest"
            ])
        ),
        draught: nullableNumber(
            nested([
                "draught",
                "Draught",
                "draft",
                "Draft"
            ])
        ),
        eta: nullableString(
            nested([
                "eta",
                "ETA"
            ])
        ),
        length: nullableNumber(
            nested([
                "length",
                "Length",
                "inlen",
                "Inlen",
                "shipLength",
                "ShipLength"
            ])
        ),
        beam: nullableNumber(
            nested([
                "beam",
                "Beam",
                "inbm",
                "Inbm",
                "width",
                "Width",
                "shipWidth",
                "ShipWidth"
            ])
        ),
        static_ts: null,
        static_license: null,
        provider: "EuRIS",
        providers: ["EuRIS"]
    };
}


function normalizeEurisSog(value){
    const number =
        nullableNumber(value);

    if(
        number === null
    ){
        return {
            value: null,
            status: "missing"
        };
    }

    /*
     * AIS SOG is encoded in 0.1-knot steps.
     * 102.2 is the protocol's upper encoded value:
     * 102.2 knots or higher.  102.3 is the "not available"
     * code.  Do not present the upper-bound code as an exact
     * vessel speed.
     */
    if(
        number >= 102.2
    ){
        return {
            value: null,
            status: "upper_limit"
        };
    }

    if(
        number < 0 ||
        !Number.isFinite(number)
    ){
        return {
            value: null,
            status: "invalid"
        };
    }

    return {
        value: number,
        status: "valid"
    };
}

function vesselIdentityKey(vessel){
    if(
        !vessel ||
        typeof vessel !== "object"
    ){
        return "";
    }

    const mmsi =
        String(
            vessel.real_mmsi ||
            vessel.mmsi ||
            ""
        ).trim();

    if(/^\d{9}$/.test(mmsi)){
        return "mmsi:" + mmsi;
    }

    const trackId =
        String(
            vessel.track_id ||
            ""
        ).trim();

    if(
        trackId &&
        String(vessel.provider || "")
            .toLowerCase()
            .includes("euris")
    ){
        return "euris-track:" + trackId;
    }

    return String(
        vessel.id ||
        (
            String(vessel.provider || "unknown") +
            ":" +
            trackId
        )
    ).trim();
}

function mergeVesselLists(primary, secondary){
    const byIdentity = new Map();

    const add = function(vessel){
        if(!vessel){
            return;
        }

        const key =
            vesselIdentityKey(vessel);

        if(!key){
            return;
        }

        const existing =
            byIdentity.get(key);

        if(!existing){
            byIdentity.set(
                key,
                vessel
            );
            return;
        }

        const merged = {
            ...existing
        };

        Object.keys(vessel).forEach(function(keyName){
            const current =
                merged[keyName];

            if(
                current === null ||
                current === undefined ||
                current === ""
            ){
                merged[keyName] =
                    vessel[keyName];
            }
        });

        const providers = [
            ...(Array.isArray(existing.providers)
                ? existing.providers
                : [existing.provider]),
            ...(Array.isArray(vessel.providers)
                ? vessel.providers
                : [vessel.provider])
        ].filter(Boolean);

        merged.providers = [
            ...new Set(
                providers.map(String)
            )
        ];

        merged.provider =
            merged.providers.join(" + ");

        byIdentity.set(
            key,
            merged
        );
    };

    primary.forEach(add);
    secondary.forEach(add);

    return [
        ...byIdentity.values()
    ];
}


async function fetchPelyrJson(apiKey, path){
    let response;

    try{
        response = await fetch(
            PELYR_BASE + path,
            {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + apiKey,
                    "Accept": "application/json"
                }
            }
        );
    }
    catch(error){
        console.error(
            "Pelyr network request failed:",
            error
        );

        return {
            ok: false,
            status: 502,
            body: {
                ok: false,
                error: {
                    code: "upstream_unavailable",
                    message: "AIS provider is temporarily unavailable."
                }
            }
        };
    }

    if(!response.ok){
        const retryAfter =
            Number(
                response.headers.get("Retry-After")
            );

        const body = await response
            .json()
            .catch(function(){
                return {
                    error: {
                        code: "upstream_http_" + response.status,
                        message: "AIS provider returned HTTP " + response.status + "."
                    }
                };
            });

        const errorCode =
            body &&
            body.error &&
            typeof body.error.code === "string"
                ? body.error.code
                : "upstream_error";

        return {
            ok: false,
            status: response.status,
            retryAfterMs:
                Number.isFinite(retryAfter) && retryAfter > 0
                    ? Math.ceil(retryAfter * 1000)
                    : 0,
            body: {
                ok: false,
                error: {
                    code: errorCode,
                    message:
                        body &&
                        body.error &&
                        typeof body.error.message === "string"
                            ? body.error.message
                            : "AIS provider request failed."
                }
            }
        };
    }

    const json = await response
        .json()
        .catch(function(){
            return null;
        });

    if(!json || typeof json !== "object"){
        return {
            ok: false,
            status: 502,
            body: {
                ok: false,
                error: {
                    code: "invalid_response",
                    message: "AIS provider returned an invalid response."
                }
            }
        };
    }

    return {
        ok: true,
        status: 200,
        body: json
    };
}

function normalizeVessel(vessel){
    if(!vessel || typeof vessel !== "object"){
        return null;
    }

    const position =
        vessel.position &&
        typeof vessel.position === "object"
            ? vessel.position
            : vessel;

    const staticData =
        vessel.static &&
        typeof vessel.static === "object"
            ? vessel.static
            : {};

    const mmsi = String(
        vessel.mmsi ||
        position.mmsi ||
        ""
    ).trim();

    const lat = Number(position.lat);
    const lon = Number(position.lon);

    if(
        !/^\d{9}$/.test(mmsi) ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ){
        return null;
    }

    return {
        id:
            "mmsi:" +
            mmsi,
        mmsi,
        lat,
        lon,
        sog: nullableNumber(position.sog),
        cog: nullableNumber(position.cog),
        heading: nullableNumber(position.heading),
        nav_status: nullableNumber(position.nav_status),
        ts: String(position.ts || ""),
        plausibility: String(
            position.plausibility || ""
        ),
        flags: Array.isArray(position.flags)
            ? position.flags.map(String)
            : [],
        position_license: String(
            position.license || ""
        ),
        name: nullableString(staticData.name),
        type: nullableNumber(staticData.type),
        imo: nullableNumber(staticData.imo),
        callsign: nullableString(staticData.callsign),
        destination: nullableString(staticData.dest),
        draught: nullableNumber(staticData.draught),
        eta: nullableString(staticData.eta),
        length: nullableNumber(staticData.length),
        beam: nullableNumber(staticData.beam),
        static_ts: nullableString(staticData.ts),
        static_license: nullableString(staticData.license)
    };
}

function normalizeTrackPoint(point){
    if(!point || typeof point !== "object"){
        return null;
    }

    const lat = Number(point.lat);
    const lon = Number(point.lon);

    if(
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ){
        return null;
    }

    return {
        lat,
        lon,
        sog: nullableNumber(point.sog),
        cog: nullableNumber(point.cog),
        heading: nullableNumber(point.heading),
        nav_status: nullableNumber(point.nav_status),
        ts: String(point.ts || ""),
        license: String(point.license || "")
    };
}

function collectAttributions(vessels, sources){
    const foundIds = new Set();

    vessels.forEach(function(vessel){
        if(vessel.position_license){
            foundIds.add(
                String(vessel.position_license)
            );
        }

        if(vessel.static_license){
            foundIds.add(
                String(vessel.static_license)
            );
        }
    });

    return resolveAttributionList(
        foundIds,
        sources
    );
}

function collectTrackAttributions(points, sources){
    const foundIds = new Set();

    points.forEach(function(point){
        if(point.license){
            foundIds.add(String(point.license));
        }
    });

    return resolveAttributionList(
        foundIds,
        sources
    );
}

function resolveAttributionList(ids, sources){
    const values = [];

    ids.forEach(function(id){
        const source = sources.find(function(item){
            return String(item.id) === String(id);
        });

        if(
            source &&
            source.attribution
        ){
            if(!values.includes(source.attribution)){
                values.push(source.attribution);
            }
        }
    });

    return values;
}

function nullableString(value){
    if(value === null || value === undefined){
        return null;
    }

    const text = String(value).trim();

    return text || null;
}

function nullableNumber(value){
    if(value === null || value === undefined || value === ""){
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}

function isIsoUtc(value){
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/.test(
        String(value || "")
    );
}


async function dedupe(key, producer){
    if(inFlight.has(key)){
        return await inFlight.get(key);
    }

    const promise = Promise.resolve()
        .then(producer);

    inFlight.set(key, promise);

    try{
        return await promise;
    }
    finally{
        inFlight.delete(key);
    }
}

function createCacheKeyRequest(request, key){
    const base =
        new URL(request.url);

    base.search = "";
    base.pathname = "/__ship_tracking_cache/" + key;

    return new Request(
        base.toString(),
        {
            method: "GET"
        }
    );
}

async function readCache(context, key){
    try{
        const request = createCacheKeyRequest(
            context.request,
            key
        );

        return await caches.default.match(
            request
        );
    }
    catch(error){
        console.warn(
            "Ship Tracking cache read failed:",
            error
        );

        return null;
    }
}

async function writeCache(context, key, response){
    try{
        const request = createCacheKeyRequest(
            context.request,
            key
        );

        await caches.default.put(
            request,
            response
        );
    }
    catch(error){
        console.warn(
            "Ship Tracking cache write failed:",
            error
        );
    }
}

function withApiHeaders(response, headers){
    const merged = new Headers(
        response.headers
    );

    Object.entries(headers || {}).forEach(function(entry){
        merged.set(
            entry[0],
            entry[1]
        );
    });

    return new Response(
        response.body,
        {
            status: response.status,
            statusText: response.statusText,
            headers: merged
        }
    );
}

function jsonResponse(body, status, headers){
    const responseHeaders = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });

    Object.entries(headers || {}).forEach(function(entry){
        responseHeaders.set(
            entry[0],
            entry[1]
        );
    });

    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: responseHeaders
        }
    );
}