import { recordAdminApiUsage } from "../lib/admin-usage.js";

/*
 * =========================================================
 * WORTH IT — SHIP TRACKING API
 * Pelyr OPEN-AIS HTTPS integration
 *
 * Public frontend endpoint:
 *   /api/ship-tracking?action=vessels&bbox=west,south,east,north&max=...
 *   /api/ship-tracking?action=vessel&mmsi=...
 *   /api/ship-tracking?action=track&mmsi=...&from=...&to=...&resolution=...
 *   /api/ship-tracking?action=sources
 *
 * Cloudflare Secret:
 *   PELYR_API_KEY
 *
 * The key is kept server-side. The browser never receives it.
 * =========================================================
 */

const PELYR_BASE = "https://api.pelyr.com";

const VESSEL_CACHE_TTL_SECONDS = 20;
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

export async function onRequestGet(context){
    try{
        const url = new URL(context.request.url);
        const action = String(
            url.searchParams.get("action") || "vessels"
        ).trim().toLowerCase();

        const apiKey = String(
            context.env.PELYR_API_KEY || ""
        ).trim();

        if(!apiKey){
            console.error("PELYR_API_KEY is not configured.");

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
            return await handleVessels(context, url, apiKey);
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

async function handleVessels(context, url, apiKey){
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

    const requestKey = key;

    const data = await dedupe(
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
                    bbox: [west, south, east, north].join(","),
                    max: String(max)
                }).toString()
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

    const vessels = Array.isArray(data.body.vessels)
        ? data.body.vessels
            .map(normalizeVessel)
            .filter(Boolean)
        : [];

    const attributions = collectAttributions(
        vessels,
        sourceMap.sources
    );

    const body = {
        ok: true,
        generated_at: data.body.generated_at || new Date().toISOString(),
        count: vessels.length,
        truncated: Boolean(data.body.truncated),
        vessels,
        attributions
    };

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

    return {
        ok: true,
        generated_at: data.body.generated_at || null,
        sources
    };
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

function asyncDelay(){
    return Promise.resolve();
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
