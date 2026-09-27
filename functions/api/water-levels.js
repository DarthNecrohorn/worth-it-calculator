import { recordAdminApiUsage } from "../lib/admin-usage.js";

/* =========================================================
   WORTH IT — WATER LEVELS API
   Copernicus CLMS / CDSE

   GET /api/water-levels?action=stations
   GET /api/water-levels?action=stations&type=river&q=Danube
   GET /api/water-levels?action=details&id=...&type=river&range=MAX

   Required Cloudflare secrets for product details/history:
     CDSE_USERNAME
     CDSE_PASSWORD

   Optional:
     CDSE_ACCESS_TOKEN
========================================================= */

const ODATA_BASE =
    "https://catalogue.dataspace.copernicus.eu/odata/v1/Products";

const CDSE_TOKEN_URL =
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

const CDSE_DOWNLOAD_BASE =
    "https://download.dataspace.copernicus.eu/odata/v1/Products";

const WATER_DATASETS = {
    rivers: "wl-rivers_global_vector_daily_v2",
    lakes: "wl-lakes_global_vector_daily_v2"
};

const WATER_CACHE_VERSION = "v47";

const STATIONS_CACHE_TTL_SECONDS =
    6 * 60 * 60;

const STATIONS_STALE_TTL_SECONDS =
    7 * 24 * 60 * 60;

const PRODUCT_CACHE_TTL_SECONDS =
    6 * 60 * 60;

const PRODUCT_STALE_TTL_SECONDS =
    48 * 60 * 60;

const HISTORY_CACHE_TTL_SECONDS =
    60 * 60;

const HISTORY_STALE_TTL_SECONDS =
    24 * 60 * 60;

const MAX_STATION_RESULTS = 800;
const MAX_HISTORY_POINTS = 1200;
const ODATA_TIMEOUT_MS = 30000;
const DOWNLOAD_TIMEOUT_MS = 60000;

let memoryToken = null;
let memoryTokenExpiresAt = 0;
let tokenPromise = null;

const inFlightRequests = new Map();


/* =========================================================
   MAIN GET HANDLER
========================================================= */

export async function onRequestGet(context) {

    try {

        const url =
            new URL(context.request.url);

        const action =
            String(
                url.searchParams.get("action") || "stations"
            )
            .trim()
            .toLowerCase();

        const forceRefresh =
            url.searchParams.get("refresh") === "1";

        if (action === "stations") {
            return await handleStations(
                context,
                url,
                forceRefresh
            );
        }

        if (action === "nearby") {
            return await handleNearby(
                context,
                url,
                forceRefresh
            );
        }

        if (action === "metadata") {
            return await handleMetadata(
                context,
                url,
                forceRefresh
            );
        }

        if (action === "latest") {
            return await handleLatest(
                context,
                url,
                forceRefresh
            );
        }

        if (action === "details") {
            return await handleDetails(
                context,
                url,
                forceRefresh
            );
        }

        return jsonResponse(
            {
                error: "Unknown water levels action."
            },
            400
        );

    }
    catch (error) {

        console.error(
            "Water levels function error:",
            error
        );

        return jsonResponse(
            {
                error:
                    "Water levels service unavailable.",
                details:
                    error && error.message
                        ? String(error.message).slice(0,500)
                        : "Unknown server error."
            },
            500,
            {
                "Cache-Control":"no-store"
            }
        );

    }

}


/* =========================================================
   STATION LIST / SEARCH
========================================================= */

async function handleStations(
    context,
    url,
    forceRefresh
) {

    const type =
        normalizeStationType(
            url.searchParams.get("type")
        );

    const query =
        normalizeSearchQuery(
            url.searchParams.get("q")
        );

    const country =
        normalizeSearchQuery(
            url.searchParams.get("country")
        );

    let limit =
        Number(
            url.searchParams.get("limit") || 24
        );

    if (
        !Number.isFinite(limit) ||
        limit < 1
    ) {
        limit = 24;
    }

    limit =
        Math.min(
            Math.floor(limit),
            MAX_STATION_RESULTS
        );

    const cacheKey =
        createCacheRequest(
            url,
            [
                "stations",
                WATER_CACHE_VERSION,
                type || "all",
                country.toLowerCase(),
                query.toLowerCase(),
                String(limit)
            ].join("/")
        );

    const cache =
        caches.default;

    if (!forceRefresh) {

        const cached =
            await safeCacheMatch(
                cache,
                cacheKey
            );

        if (cached) {

            return responseWithHeaders(
                cached,
                {
                    "X-Water-Cache":
                        "HIT",
                    "X-Water-Cache-TTL":
                        STATIONS_CACHE_TTL_SECONDS + "s"
                }
            );

        }

    }

    const requestKey =
        cacheKey.url;

    if (inFlightRequests.has(requestKey)) {

        return responseWithHeaders(
            await inFlightRequests.get(requestKey),
            {
                "X-Water-Cache":
                    "IN-FLIGHT"
            }
        );

    }

    const requestPromise =
        (async function(){

    recordAdminApiUsage(context, {
        apiKey: "water-levels",
        provider: "Copernicus CLMS / CDSE"
    });

            const datasets =
                type === "river"
                    ? [
                        ["river", WATER_DATASETS.rivers]
                    ]
                    : type === "lake"
                        ? [
                            ["lake", WATER_DATASETS.lakes]
                        ]
                        : [
                            ["river", WATER_DATASETS.rivers],
                            ["lake", WATER_DATASETS.lakes]
                        ];

            const perDatasetLimit =
                Math.max(
                    8,
                    Math.ceil(
                        limit / datasets.length
                    )
                );

            /*
             * River and lake are independent datasets. One temporary
             * catalogue failure must not take down the entire Water
             * Levels section, so resolve them independently.
             */
            const settled =
                await Promise.allSettled(
                    datasets.map(
                        function(pair) {
                            return searchDatasetProductsUpToLimit({
                                type:
                                    pair[0],
                                datasetId:
                                    pair[1],
                                query,
                                country,
                                limit:
                                    perDatasetLimit
                            });
                        }
                    )
                );

            const successfulResults =
                settled
                    .filter(function(item){
                        return item.status === "fulfilled";
                    })
                    .map(function(item){
                        return Array.isArray(item.value)
                            ? item.value
                            : [];
                    });

            if(!successfulResults.length){
                const failed =
                    settled.find(function(item){
                        return item.status === "rejected";
                    });

                throw (
                    failed &&
                    failed.reason
                        ? failed.reason
                        : new Error(
                            "Copernicus station catalogue is temporarily unavailable."
                        )
                );
            }

            const stations =
                successfulResults
                    .flat()
                    .sort(compareStations)
                    .slice(0, limit);

            const responseBody = {

                ok: true,

                query,

                type,

                country,

                count:
                    stations.length,

                totalCount:
                    successfulResults.reduce(
                        function(total, items) {
                            return total + items.length;
                        },
                        0
                    ),

                datasets: {
                    rivers:
                        WATER_DATASETS.rivers,
                    lakes:
                        WATER_DATASETS.lakes
                },

                stations,

                source: {
                    provider:
                        "Copernicus Land Monitoring Service",
                    catalogue:
                        "Copernicus Data Space Ecosystem OData"
                }

            };

            const response =
                jsonResponse(
                    responseBody,
                    200,
                    {
                        "Cache-Control":
                            "public, max-age=" +
                            STATIONS_CACHE_TTL_SECONDS +
                            ", stale-while-revalidate=" +
                            STATIONS_STALE_TTL_SECONDS,

                        "X-Water-Cache":
                            "MISS",

                        "X-Water-Cache-TTL":
                            STATIONS_CACHE_TTL_SECONDS +
                            "s"
                    }
                );

            await safeCachePut(
                cache,
                cacheKey,
                response.clone()
            );

            return response;

        })();

    inFlightRequests.set(
        requestKey,
        requestPromise
    );

    try {

        return await requestPromise;

    }
    catch (error) {

        const stale =
            await safeCacheMatch(
                cache,
                cacheKey
            );

        if (stale) {

            return responseWithHeaders(
                stale,
                {
                    "X-Water-Cache":
                        "STALE"
                }
            );

        }

        throw error;

    }
    finally {

        inFlightRequests.delete(
            requestKey
        );

    }

}


/* =========================================================
   NEARBY STATION SEARCH
========================================================= */

async function handleNearby(
    context,
    url,
    forceRefresh
){

    const type =
        normalizeStationType(
            url.searchParams.get("type")
        );

    const country =
        normalizeSearchQuery(
            url.searchParams.get("country")
        );

    const latitude =
        Number(
            url.searchParams.get("lat")
        );

    const longitude =
        Number(
            url.searchParams.get("lon")
        );

    let radiusKm =
        Number(
            url.searchParams.get("radiusKm") || 500
        );

    let limit =
        Number(
            url.searchParams.get("limit") || 1000
        );

    if(
        !type ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ){
        return jsonResponse(
            {
                ok:false,
                error:
                    "A valid station type, latitude and longitude are required."
            },
            400,
            {
                "Cache-Control":"no-store"
            }
        );
    }

    radiusKm =
        Math.min(
            10000,
            Math.max(
                25,
                radiusKm
            )
        );

    limit =
        Math.min(
            1000,
            Math.max(
                1,
                Math.floor(limit)
            )
        );

    const datasetId =
        type === "river"
            ? WATER_DATASETS.rivers
            : WATER_DATASETS.lakes;

    const cacheKey =
        createCacheRequest(
            url,
            [
                "nearby",
                WATER_CACHE_VERSION,
                type,
                country.toLowerCase(),
                latitude.toFixed(3),
                longitude.toFixed(3),
                radiusKm.toFixed(0),
                String(limit)
            ].join("/")
        );

    const cache =
        caches.default;

    if(!forceRefresh){
        const cached =
            await cache.match(cacheKey);

        if(cached){
            return responseWithHeaders(
                cached,
                {
                    "X-Water-Cache":"HIT"
                }
            );
        }
    }

    const requestKey =
        cacheKey.url;

    if(inFlightRequests.has(requestKey)){
        return responseWithHeaders(
            await inFlightRequests.get(requestKey),
            {
                "X-Water-Cache":"IN-FLIGHT"
            }
        );
    }

    const requestPromise =
        (async function(){

    recordAdminApiUsage(context, {
        apiKey: "water-levels",
        provider: "Copernicus CLMS / CDSE"
    });

            const stations =
                await searchNearbyDatasetProducts({
                    type,
                    datasetId,
                    country,
                    latitude,
                    longitude,
                    radiusKm,
                    limit
                });

            const response =
                jsonResponse(
                    {
                        ok:true,
                        type,
                        country,
                        latitude,
                        longitude,
                        radiusKm,
                        count:stations.length,
                        stations,
                        source:{
                            provider:
                                "Copernicus Land Monitoring Service",
                            catalogue:
                                "Copernicus Data Space Ecosystem OData",
                            selection:
                                "Geographic proximity search"
                        }
                    },
                    200,
                    {
                        "Cache-Control":
                            "public, max-age=" +
                            STATIONS_CACHE_TTL_SECONDS +
                            ", stale-while-revalidate=" +
                            STATIONS_STALE_TTL_SECONDS,
                        "X-Water-Cache":"MISS"
                    }
                );

            await cache.put(
                cacheKey,
                response.clone()
            );

            return response;

        })();

    inFlightRequests.set(
        requestKey,
        requestPromise
    );

    try{
        return await requestPromise;
    }
    catch(error){
        throw error;
    }
    finally{
        inFlightRequests.delete(
            requestKey
        );
    }

}


/* =========================================================
   PRODUCT METADATA SUMMARY
========================================================= */

async function handleMetadata(
    context,
    url,
    forceRefresh
) {

    const productId =
        String(
            url.searchParams.get("id") || ""
        )
        .trim();

    const type =
        normalizeStationType(
            url.searchParams.get("type")
        );

    if (!productId || !type) {
        return jsonResponse(
            {
                ok: false,
                error:
                    "A Copernicus product identifier and dataset type are required."
            },
            400
        );
    }

    recordAdminApiUsage(context, {
        apiKey: "water-levels",
        provider: "Copernicus CLMS / CDSE"
    });

    try {

        /*
         * The station cards only need catalogue metadata. Do not
         * download every full GeoJSON product just to obtain the
         * river/lake name, basin and cell identifier.
         */
        const product =
            await getCatalogueProductMetadata(
                context,
                {
                    productId,
                    type,
                    forceRefresh
                }
            );

        /*
         * The cards already request this metadata for every visible
         * station. Enrich the same response with the latest two
         * Copernicus observations so the card can show the real
         * change immediately, without waiting for IntersectionObserver.
         */
        let latestResult = null;

        try{
            latestResult =
                await getLatestMeasurementByRange(
                    context,
                    {
                        productId,
                        type,
                        forceRefresh
                    }
                );
        }
        catch(error){
            /*
             * Station metadata must remain usable even when the
             * optional live-measurement enrichment is temporarily
             * unavailable. The dedicated /latest endpoint can retry it.
             */
            console.warn(
                "Water-level latest enrichment failed:",
                productId,
                error
            );

            latestResult = null;
        }

        return jsonResponse(
            {
                ok: true,
                productId,
                type,
                station:
                    product.station,
                coordinates:
                    product.coordinates,
                latest:
                    latestResult &&
                    latestResult.latest
                        ? latestResult.latest
                        : null,
                previous:
                    latestResult &&
                    latestResult.previous
                        ? latestResult.previous
                        : null,
                measurementCount:
                    latestResult &&
                    latestResult.measurementCount != null
                        ? latestResult.measurementCount
                        : null,
                source: {
                    provider:
                        "Copernicus Land Monitoring Service",
                    catalogue:
                        "Copernicus Data Space Ecosystem",
                    dataset:
                        type === "river"
                            ? WATER_DATASETS.rivers
                            : WATER_DATASETS.lakes,
                    methodology:
                        "Satellite altimetry"
                }
            },
            200,
            {
                "Cache-Control":
                    "public, max-age=" +
                    PRODUCT_CACHE_TTL_SECONDS +
                    ", stale-while-revalidate=" +
                    PRODUCT_STALE_TTL_SECONDS
            }
        );

    }
    catch (error) {

        console.error(
            "Water metadata request failed:",
            error
        );

        return jsonResponse(
            {
                ok: false,
                error:
                    "Unable to load Copernicus water-level metadata."
            },
            502,
            {
                "Cache-Control":
                    "no-store"
            }
        );

    }

}


/* =========================================================
   FAST CATALOGUE METADATA
========================================================= */

async function getCatalogueProductMetadata(
    context,
    {
        productId,
        type,
        forceRefresh
    }
) {

    const cacheRequest =
        createCacheRequest(
            context.request.url,
            [
                "catalogue-metadata",
                WATER_CACHE_VERSION,
                type,
                productId
            ].join("/")
        );

    const cache =
        caches.default;

    if (!forceRefresh) {

        const cached =
            await cache.match(
                cacheRequest
            );

        if (cached) {
            return await cached.json();
        }

    }

    const requestKey =
        cacheRequest.url;

    if (inFlightRequests.has(requestKey)) {
        return await inFlightRequests.get(requestKey);
    }

    const promise =
        (async function(){

            const encodedId =
                encodeURIComponent(productId);

            const data =
                await fetchJsonWithTimeout(
                    ODATA_BASE +
                        "(" +
                        encodedId +
                        ")?$expand=Attributes",
                    {
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    },
                    ODATA_TIMEOUT_MS
                );

            if (!data || !data.Id) {
                throw new Error(
                    "Copernicus product metadata was not found."
                );
            }

            const station =
                normalizeStation(
                    data,
                    type,
                    type === "river"
                        ? WATER_DATASETS.rivers
                        : WATER_DATASETS.lakes
                );

            if (!station) {
                throw new Error(
                    "Unable to normalize Copernicus product metadata."
                );
            }

            const result = {
                station,
                coordinates:
                    station.coordinates || null,
                contentLength:
                    numberOrNull(
                        data.ContentLength
                    ),
                contentType:
                    firstNonEmpty(
                        data.ContentType,
                        ""
                    )
            };

            await cache.put(
                cacheRequest,
                jsonResponse(
                    result,
                    200,
                    {
                        "Cache-Control":
                            "public, max-age=" +
                            PRODUCT_CACHE_TTL_SECONDS +
                            ", stale-while-revalidate=" +
                            PRODUCT_STALE_TTL_SECONDS
                    }
                )
            );

            return result;

        })();

    inFlightRequests.set(
        requestKey,
        promise
    );

    try {
        return await promise;
    }
    finally {
        inFlightRequests.delete(
            requestKey
        );
    }

}


/* =========================================================
   LATEST MEASUREMENT
========================================================= */

async function handleLatest(
    context,
    url,
    forceRefresh
) {

    const productId =
        String(
            url.searchParams.get("id") || ""
        )
        .trim();

    const type =
        normalizeStationType(
            url.searchParams.get("type")
        );

    if (!productId || !type) {
        return jsonResponse(
            {
                ok: false,
                error:
                    "A Copernicus product identifier and dataset type are required."
            },
            400
        );
    }

    const latestCacheKey =
        createCacheRequest(
            url,
            [
                "latest",
                WATER_CACHE_VERSION,
                type,
                productId
            ].join("/")
        );

    const cache =
        caches.default;

    if(!forceRefresh){

        const cached =
            await cache.match(
                latestCacheKey
            );

        if(cached){
            return responseWithHeaders(
                cached,
                {
                    "X-Water-Cache":
                        "HIT"
                }
            );
        }
    }

    recordAdminApiUsage(context, {
        apiKey: "water-levels",
        provider: "Copernicus CLMS / CDSE"
    });

    try {

        /*
         * IMPORTANT:
         * Do not parse the complete GeoJSON product here.
         * Cloudflare Workers Free has a very small CPU budget per
         * request. CLMS water-level products are time-series files,
         * and the newest observation is at the end of the data array.
         * We therefore request only the tail of the remote object.
         */
        const result =
            await getLatestMeasurementByRange(
                context,
                {
                    productId,
                    type,
                    forceRefresh
                }
            );

        if(
            !result ||
            !result.latest ||
            !Number.isFinite(
                Number(result.latest.height)
            ) ||
            !result.latest.datetime
        ){
            const error =
                new Error(
                    "No usable Copernicus latest water-level measurement was found."
                );

            error.code =
                "CDSE_NO_MEASUREMENT";

            throw error;
        }

        const response =
            jsonResponse(
                {
                    ok: true,
                    productId,
                    type,
                    latest:
                        result.latest,
                    previous:
                        result.previous || null,
                    station:
                        result.station || null,
                    coordinates:
                        result.coordinates || null,
                    measurementCount:
                        result.measurementCount,
                    source: {
                        provider:
                            "Copernicus Land Monitoring Service",
                        catalogue:
                            "Copernicus Data Space Ecosystem",
                        dataset:
                            type === "river"
                                ? WATER_DATASETS.rivers
                                : WATER_DATASETS.lakes,
                        retrieval:
                            "Tail-range read of the latest Copernicus GeoJSON product"
                    }
                },
                200,
                {
                    "Cache-Control":
                        "public, max-age=" +
                        PRODUCT_CACHE_TTL_SECONDS +
                        ", stale-while-revalidate=" +
                        PRODUCT_STALE_TTL_SECONDS,

                    "X-Water-Cache":
                        "MISS"
                }
            );

        await cache.put(
            latestCacheKey,
            response.clone()
        );

        return response;

    }
    catch (error) {

        console.error(
            "Water latest measurement request failed:",
            error
        );

        if(
            error &&
            error.code === "CDSE_CONFIGURATION"
        ){
            return jsonResponse(
                {
                    ok: false,
                    error:
                        "Copernicus download credentials are not configured.",
                    code:
                        "CDSE_CONFIGURATION"
                },
                503,
                {
                    "Cache-Control":
                        "no-store"
                }
            );
        }

        if(
            error &&
            error.code === "CDSE_AUTH"
        ){
            return jsonResponse(
                {
                    ok: false,
                    error:
                        "Copernicus download authentication failed.",
                    code:
                        "CDSE_AUTH",
                    debug:
                        error.details
                            ? String(error.details).slice(0,300)
                            : "CDSE token or download authentication was rejected.",
                    credentialDiagnostics:
                        error.credentialDiagnostics || null
                },
                503,
                {
                    "Cache-Control":
                        "no-store"
                }
            );
        }

        if(
            error &&
            error.code === "CDSE_NO_MEASUREMENT"
        ){
            return jsonResponse(
                {
                    ok: false,
                    error:
                        "No usable latest Copernicus water-level measurement was found.",
                    code:
                        "CDSE_NO_MEASUREMENT"
                },
                502,
                {
                    "Cache-Control":
                        "no-store"
                }
            );
        }

        const rawMessage =
            error &&
            error.message
                ? String(error.message)
                : "";

        const safeDebug =
            rawMessage
                .replace(
                    /Bearer\s+[A-Za-z0-9._~-]+/gi,
                    "Bearer [redacted]"
                )
                .replace(
                    /https?:\/\/[^\s]+/gi,
                    "[url]"
                )
                .slice(0,500);

        return jsonResponse(
            {
                ok: false,
                error:
                    "Unable to load the latest Copernicus water-level measurement.",
                code:
                    "CDSE_LATEST_FAILED",
                debug:
                    safeDebug || "Unknown backend error."
            },
            502,
            {
                "Cache-Control":
                    "no-store"
            }
        );

    }

}


/* =========================================================
   PRODUCT DETAILS + HISTORY
========================================================= */

async function handleDetails(
    context,
    url,
    forceRefresh
) {

    const productId =
        String(
            url.searchParams.get("id") || ""
        )
        .trim();

    const type =
        normalizeStationType(
            url.searchParams.get("type")
        );

    const range =
        normalizeHistoryRange(
            url.searchParams.get("range")
        );

    if (!productId) {

        return jsonResponse(
            {
                error:
                    "A Copernicus product identifier is required."
            },
            400
        );

    }

    if (!type) {

        return jsonResponse(
            {
                error:
                    "A water level dataset type is required."
            },
            400
        );

    }

    const historyCacheKey =
        createCacheRequest(
            url,
            [
                "history",
                WATER_CACHE_VERSION,
                type,
                productId,
                range
            ].join("/")
        );

    const cache =
        caches.default;

    if (!forceRefresh) {

        const cached =
            await cache.match(
                historyCacheKey
            );

        if (cached) {

            return responseWithHeaders(
                cached,
                {
                    "X-Water-Cache":
                        "HIT",
                    "X-Water-Cache-TTL":
                        HISTORY_CACHE_TTL_SECONDS +
                        "s"
                }
            );

        }

    }

    recordAdminApiUsage(context, {
        apiKey: "water-levels",
        provider: "Copernicus CLMS / CDSE"
    });

    try {

        const product =
            await getParsedProduct(
                context,
                {
                    productId,
                    type,
                    forceRefresh
                }
            );

        const detail =
            buildDetailResponse(
                product,
                range
            );

        const response =
            jsonResponse(
                detail,
                200,
                {
                    "Cache-Control":
                        "public, max-age=" +
                        HISTORY_CACHE_TTL_SECONDS +
                        ", stale-while-revalidate=" +
                        HISTORY_STALE_TTL_SECONDS,

                    "X-Water-Cache":
                        "MISS",

                    "X-Water-Cache-TTL":
                        HISTORY_CACHE_TTL_SECONDS +
                        "s"
                }
            );

        await cache.put(
            historyCacheKey,
            response.clone()
        );

        return response;

    }
    catch (error) {

        console.error(
            "Water detail request failed:",
            error
        );

        const stale =
            await cache.match(
                historyCacheKey
            );

        if (stale) {

            return responseWithHeaders(
                stale,
                {
                    "X-Water-Cache":
                        "STALE-ERROR"
                }
            );

        }

        if (
            error &&
            error.code === "CDSE_CONFIGURATION"
        ) {

            return jsonResponse(
                {
                    ok: false,
                    error:
                        "Copernicus download credentials are not configured.",
                    code:
                        "CDSE_CONFIGURATION",
                    setup: {
                        requiredSecrets:
                            [
                                "CDSE_USERNAME",
                                "CDSE_PASSWORD"
                            ],
                        optionalSecret:
                            "CDSE_ACCESS_TOKEN"
                    }
                },
                503,
                {
                    "Cache-Control":
                        "no-store",
                    "X-Water-Cache":
                        "MISS-CONFIG"
                }
            );

        }

        return jsonResponse(
            {
                ok: false,
                error:
                    "Unable to load Copernicus water level product."
            },
            502,
            {
                "Cache-Control":
                    "no-store",
                "X-Water-Cache":
                    "MISS-ERROR"
            }
        );

    }

}


/* =========================================================
   DATASET SEARCH
========================================================= */

const NEARBY_QUERY_PAGE_SIZE = 200;

function buildNearbyPolygon(
    latitude,
    longitude,
    radiusKm
){
    const earthRadiusKm = 6371;
    const latDelta =
        radiusKm / earthRadiusKm * 180 / Math.PI;

    const cosLat =
        Math.max(
            0.15,
            Math.cos(
                latitude * Math.PI / 180
            )
        );

    const lonDelta =
        radiusKm /
        (
            earthRadiusKm *
            cosLat
        ) *
        180 /
        Math.PI;

    const minLat =
        Math.max(
            -89.9,
            latitude - latDelta
        );

    const maxLat =
        Math.min(
            89.9,
            latitude + latDelta
        );

    const minLon =
        Math.max(
            -179.9,
            longitude - lonDelta
        );

    const maxLon =
        Math.min(
            179.9,
            longitude + lonDelta
        );

    return [
        [minLon,minLat],
        [minLon,maxLat],
        [maxLon,maxLat],
        [maxLon,minLat],
        [minLon,minLat]
    ];
}

async function searchNearbyDatasetProducts({
    type,
    datasetId,
    country,
    latitude,
    longitude,
    radiusKm,
    limit
}){

    const polygon =
        buildNearbyPolygon(
            latitude,
            longitude,
            radiusKm
        );

    const coordinates =
        polygon
            .map(
                function(point){
                    return (
                        point[0] +
                        " " +
                        point[1]
                    );
                }
            )
            .join(",");

    const geometryFilter =
        "OData.CSC.Intersects(" +
        "area=geography'SRID=4326;" +
        "POLYGON((" +
        coordinates +
        "))')";

    /*
     * Country filtering is deliberately handled from the returned
     * coordinates on the client. CLMS OData attribute names are
     * collection-specific; using an assumed "country" attribute can
     * make an otherwise valid geographic query fail.
     */
    const filter =
        [
            "Collection/Name eq 'CLMS'",
            attributeEquals(
                "datasetIdentifier",
                datasetId
            ),
            geometryFilter
        ].join(
            " and "
        );

    const params =
        new URLSearchParams();

    params.set(
        "$filter",
        filter
    );

    /*
     * Nearby station normalization needs CLMS attributes so the response
     * contains the river/lake name, basin and station/cell ID.
     */
    /*
     * Keep catalogue responses smaller while retaining the CLMS
     * attributes required to build a station card.
     */
    params.set(
        "$select",
        [
            "Id",
            "Name",
            "ModificationDate",
            "PublicationDate",
            "ContentDate",
            "GeoFootprint",
            "Online",
            "ContentType"
        ].join(",")
    );

    /*
     * Keep catalogue responses smaller while retaining the CLMS
     * attributes required to build a station card.
     */
    params.set(
        "$select",
        [
            "Id",
            "Name",
            "ModificationDate",
            "PublicationDate",
            "ContentDate",
            "GeoFootprint",
            "Online",
            "ContentType"
        ].join(",")
    );

    params.set(
        "$expand",
        "Attributes"
    );

    params.set(
        "$orderby",
        "ModificationDate desc,Id asc"
    );

    params.set(
        "$top",
        String(
            Math.min(
                NEARBY_QUERY_PAGE_SIZE,
                limit
            )
        )
    );

    const results = [];

    for(
        let offset = 0;
        offset < limit;
        offset += NEARBY_QUERY_PAGE_SIZE
    ){

        const pageParams =
            new URLSearchParams(
                params
            );

        pageParams.set(
            "$top",
            String(
                Math.min(
                    NEARBY_QUERY_PAGE_SIZE,
                    limit - offset
                )
            )
        );

        if(offset > 0){
            pageParams.set(
                "$skip",
                String(offset)
            );
        }

        const data =
            await fetchJsonWithTimeout(
                ODATA_BASE +
                    "?" +
                    pageParams.toString(),
                {
                    headers:{
                        "Accept":
                            "application/json"
                    }
                },
                ODATA_TIMEOUT_MS
            );

        if(
            !data ||
            !Array.isArray(data.value)
        ){
            throw new Error(
                "Invalid Copernicus nearby station response."
            );
        }

        const page =
            data.value
                .map(
                    function(item){
                        return normalizeStation(
                            item,
                            type,
                            datasetId
                        );
                    }
                )
                .filter(Boolean);

        results.push.apply(
            results,
            page
        );

        if(page.length < Math.min(NEARBY_QUERY_PAGE_SIZE,limit-offset)){
            break;
        }
    }

    return results.slice(
        0,
        limit
    );
}

const STATION_QUERY_PAGE_SIZE = 200;

async function searchDatasetProducts({
    type,
    datasetId,
    query,
    country,
    limit,
    offset = 0
}) {

    let filter =
        [
            "Collection/Name eq 'CLMS'",
            attributeEquals(
                "datasetIdentifier",
                datasetId
            )
        ].join(
            " and "
        );

    if (query) {

        const waterBodyAttribute =
            type === "river"
                ? "wlRiverName"
                : "wlLakeName";

        /*
         * Exact water-body/basin matches are checked in addition to
         * partial matches. This improves reliability for common
         * multilingual searches such as Danube/Dunav.
         */
        filter +=
            " and (" +
            [
                "contains(Name,'" +
                    escapeODataString(query) +
                    "')",

                attributeEquals(
                    waterBodyAttribute,
                    query
                ),

                attributeEquals(
                    "wlBasinName",
                    query
                ),

                attributeContains(
                    waterBodyAttribute,
                    query
                ),

                attributeContains(
                    "wlBasinName",
                    query
                )
            ].join(
                " or "
            ) +
            ")";

    }

    const params =
        new URLSearchParams();

    params.set(
        "$filter",
        filter
    );

    params.set(
        "$expand",
        "Attributes"
    );

    params.set(
        "$orderby",
        "ModificationDate desc,Id asc"
    );

    params.set(
        "$top",
        String(
            Math.min(
                STATION_QUERY_PAGE_SIZE,
                Math.max(1, Number(limit) || 1)
            )
        )
    );

    if(Number(offset) > 0){
        params.set(
            "$skip",
            String(
                Math.max(
                    0,
                    Math.floor(
                        Number(offset) || 0
                    )
                )
            )
        );
    }

    const data =
        await fetchJsonWithTimeout(
            ODATA_BASE +
                "?" +
                params.toString(),
            {
                headers: {
                    "Accept":
                        "application/json"
                }
            },
            ODATA_TIMEOUT_MS
        );

    if (
        !data ||
        !Array.isArray(
            data.value
        )
    ) {

        throw new Error(
            "Invalid Copernicus OData station response."
        );

    }

    return data.value
        .map(
            function(item) {
                return normalizeStation(
                    item,
                    type,
                    datasetId
                );
            }
        )
        .filter(Boolean);

}

async function searchDatasetProductsUpToLimit({
    type,
    datasetId,
    query,
    country,
    limit
}) {

    const target =
        Math.max(
            0,
            Math.floor(
                Number(limit) || 0
            )
        );

    if(target === 0){
        return [];
    }

    const results = [];

    for(
        let offset = 0;
        offset < target;
        offset += STATION_QUERY_PAGE_SIZE
    ){

        const pageLimit =
            Math.min(
                STATION_QUERY_PAGE_SIZE,
                target - offset
            );

        const page =
            await searchDatasetProducts({
                type,
                datasetId,
                query,
                country,
                limit:
                    pageLimit,
                offset
            });

        results.push.apply(
            results,
            page
        );

        if(
            page.length <
            pageLimit
        ){
            break;
        }
    }

    return results.slice(
        0,
        target
    );

}


/* =========================================================
   STATION NORMALIZATION
========================================================= */

function normalizeStation(
    product,
    type,
    datasetId
) {

    if (
        !product ||
        !product.Id
    ) {

        return null;

    }

    const attributes =
        normalizeAttributes(
            product.Attributes
        );

    const waterBody =
        attributeValue(
            attributes,
            type === "river"
                ? "wlRiverName"
                : "wlLakeName"
        );

    const basin =
        attributeValue(
            attributes,
            "wlBasinName"
        );

    const country =
        firstNonEmpty(
            attributeValue(attributes,"country"),
            attributeValue(attributes,"wlCountryName")
        );

    const referenceGeoid =
        firstNonEmpty(
            attributeValue(
                attributes,
                "water_surface_reference_name"
            ),
            attributeValue(
                attributes,
                "water_surface_reference_datum_name"
            )
        );

    const referenceDatumAltitude =
        numberOrNull(
            attributeValue(
                attributes,
                "water_surface_reference_datum_altitude"
            )
        );

    const stationId =
        firstNonEmpty(
            attributeValue(attributes,"cellID"),
            attributeValue(attributes,"resource")
        );

    const datasetVersion =
        attributeValue(
            attributes,
            "datasetVersion"
        );

    const updated =
        firstNonEmpty(
            product.ModificationDate,
            product.PublicationDate
        );

    const contentStart =
        product.ContentDate &&
        product.ContentDate.Start
            ? product.ContentDate.Start
            : null;

    const contentEnd =
        product.ContentDate &&
        product.ContentDate.End
            ? product.ContentDate.End
            : null;

    const coordinates =
        extractPointFromGeoFootprint(
            product.GeoFootprint
        );

    const title =
        firstNonEmpty(
            waterBody,
            product.Name,
            type === "river"
                ? "River water-level station"
                : "Lake water-level station"
        );

    const locationParts =
        [
            waterBody,
            basin
        ].filter(Boolean);

    return {

        id:
            String(
                product.Id
            ),

        type,

        datasetId,

        productName:
            String(
                product.Name || ""
            ),

        title,

        waterBody:
            waterBody || "",

        basin:
            basin || "",

        country:
            country || "",

        referenceGeoid:
            referenceGeoid || "",

        referenceDatumAltitude,

        stationId:
            stationId || "",

        coordinates,

        contentStart,

        contentEnd,

        updated:
            updated || "",

        online:
            product.Online !== false,

        contentType:
            product.ContentType || "",

        datasetVersion:
            datasetVersion || "",

        location:
            locationParts.join(
                " · "
            ),

        status:
            product.Online === false
                ? "Offline"
                : "CLMS metadata"

    };

}


/* =========================================================
   LATEST MEASUREMENT — RANGE READ
========================================================= */

const LATEST_RANGE_STEPS = [
    64 * 1024,
    256 * 1024,
    1024 * 1024,
    4 * 1024 * 1024,
    8 * 1024 * 1024
];

async function getLatestMeasurementByRange(
    context,
    {
        productId,
        type,
        forceRefresh
    }
) {

    /*
     * Reuse the fast catalogue metadata path for station
     * metadata. This is public OData metadata and avoids
     * downloading the full time-series product.
     */
    const catalogue =
        await getCatalogueProductMetadata(
            context,
            {
                productId,
                type,
                forceRefresh
            }
        );

    const token =
        await getCdseAccessToken(
            context
        );

    let lastError = null;

    const knownNodeUrl =
        buildKnownWaterLevelNodeUrl(
            productId,
            catalogue.station &&
            catalogue.station.productName
        );

    /*
     * Preferred path: download the exact small JSON asset for
     * this station and parse it normally. This avoids Range
     * boundary problems and matches the official CDSE Nodes
     * structure for CLMS Water Level products.
     */
    if(knownNodeUrl){

        try{

            const direct =
                await downloadLatestJsonFromNode(
                    knownNodeUrl,
                    token,
                    productId,
                    type
                );

            if(
                direct &&
                direct.latest &&
                (
                    direct.previous ||
                    Number(direct.measurementCount) <= 1
                )
            ){
                return {
                    latest:
                        direct.latest,
                    previous:
                        direct.previous ||
                        null,
                    station:
                        catalogue.station,
                    coordinates:
                        direct.coordinates ||
                        catalogue.coordinates,
                    measurementCount:
                        direct.measurementCount
                };
            }

        }
        catch(error){

            lastError = error;

            if(
                error &&
                error.code === "CDSE_AUTH"
            ){
                memoryToken = null;
                memoryTokenExpiresAt = 0;
                throw error;
            }

        }

    }

    /*
     * Do not assume that the first JSON node in a CDSE product is the
     * time series. Verify each JSON candidate until one contains actual
     * water-level observations.
     */
    try{

        const discoveredNode =
            await findTimeSeriesGeoJsonNode(
                productId,
                token,
                type
            );

        if(
            discoveredNode &&
            discoveredNode.normalizedProduct &&
            Array.isArray(
                discoveredNode.normalizedProduct.measurements
            ) &&
            discoveredNode.normalizedProduct.measurements.length
        ){

            const measurements =
                discoveredNode.normalizedProduct.measurements;

            return {
                latest:
                    measurements[
                        measurements.length - 1
                    ],

                previous:
                    measurements.length > 1
                        ? measurements[
                            measurements.length - 2
                          ]
                        : null,

                station:
                    catalogue.station,

                coordinates:
                    discoveredNode.normalizedProduct.coordinates ||
                    catalogue.coordinates,

                measurementCount:
                    measurements.length
            };

        }

    }
    catch(error){

        lastError = error;

        if(
            error &&
            error.code === "CDSE_AUTH"
        ){
            memoryToken = null;
            memoryTokenExpiresAt = 0;
            throw error;
        }

    }

    for(
        const rangeBytes of LATEST_RANGE_STEPS
    ){

        try{

            const knownNodeUrl =
                buildKnownWaterLevelNodeUrl(
                    productId,
                    catalogue.station &&
                    catalogue.station.productName
                );

            const result =
                await fetchLatestRangeChunk(
                    productId,
                    token,
                    rangeBytes,
                    knownNodeUrl,
                    catalogue.contentLength
                );

            if(
                result &&
                result.latest
            ){
                return {
                    latest:
                        result.latest,
                    previous:
                        result.previous ||
                        null,
                    station:
                        catalogue.station,
                    coordinates:
                        catalogue.coordinates,
                    measurementCount:
                        null
                };
            }

            if(
                result &&
                result.retryWithLargerRange
            ){
                continue;
            }

            return {
                latest: null,
                station:
                    catalogue.station,
                coordinates:
                    catalogue.coordinates,
                contentLength:
                    catalogue.contentLength,
                measurementCount:
                    0
            };

        }
        catch(error){

            lastError = error;

            /*
             * A 401 means the token is bad/expired. Do not waste
             * the larger range attempts on the same invalid token.
             */
            if(
                error &&
                error.code === "CDSE_AUTH"
            ){
                memoryToken = null;
                memoryTokenExpiresAt = 0;
                break;
            }

        }

    }

    if(lastError){
        throw lastError;
    }

    return {
        latest: null,
        station:
            catalogue.station,
        coordinates:
            catalogue.coordinates,
        measurementCount:
            0
    };

}


async function downloadLatestJsonFromNode(
    productUrl,
    accessToken,
    productId,
    type
) {

    const response =
        await fetchCdseWithRedirects(
            productUrl,
            {
                headers: {
                    "Authorization":
                        "Bearer " +
                        accessToken,
                    "Accept":
                        "application/json,application/geo+json,*/*"
                }
            },
            DOWNLOAD_TIMEOUT_MS
        );

    if(
        response.status === 401 ||
        response.status === 403
    ){
        const error =
            new Error(
                "Copernicus product download authentication failed."
            );

        error.code = "CDSE_AUTH";
        error.status = response.status;

        throw error;
    }

    if(!response.ok){
        const body =
            await safeReadText(response);

        throw new Error(
            "Copernicus station JSON download failed (" +
            response.status +
            "): " +
            body.slice(0,300)
        );
    }

    const contentLength =
        Number(
            response.headers.get("content-length") || 0
        );

    /*
     * A single station product should be a small JSON asset.
     * Refuse unexpectedly huge responses rather than letting a
     * Worker parse an enormous object.
     */
    if(
        contentLength > 8 * 1024 * 1024
    ){
        throw new Error(
            "Copernicus station JSON asset is unexpectedly large."
        );
    }

    const bytes =
        new Uint8Array(
            await response.arrayBuffer()
        );

    if(
        !bytes.length
    ){
        throw new Error(
            "Copernicus station JSON asset is empty."
        );
    }

    const text =
        new TextDecoder().decode(
            bytes
        );

    let payload;

    try{
        payload =
            JSON.parse(text);
    }
    catch(error){
        throw new Error(
            "Copernicus station JSON asset is not valid JSON."
        );
    }

    const normalized =
        normalizeProductPayload(
            payload,
            {
                productId,
                type
            }
        );

    const measurements =
        Array.isArray(
            normalized.measurements
        )
            ? normalized.measurements
            : [];

    if(!measurements.length){
        return {
            latest: null,
            previous: null,
            normalizedProduct:
                normalized,
            coordinates:
                normalized.coordinates ||
                null,
            measurementCount:
                0
        };
    }

    const latestIndex =
        measurements.length - 1;

    return {
        latest:
            measurements[
                latestIndex
            ],
        previous:
            latestIndex > 0
                ? measurements[
                    latestIndex - 1
                  ]
                : null,
        normalizedProduct:
            normalized,
        coordinates:
            normalized.coordinates ||
            null,
        measurementCount:
            measurements.length
    };

}


async function findGeoJsonNode(
    productId,
    accessToken
) {

    const rootUrl =
        CDSE_DOWNLOAD_BASE +
        "(" +
        encodeURIComponent(productId) +
        ")/Nodes";

    const queue = [
        {
            url: rootUrl,
            path: []
        }
    ];

    const seen = new Set();
    let visited = 0;

    while(
        queue.length &&
        visited < 200
    ){

        const current = queue.shift();
        if(!current || !current.url) continue;
        if(seen.has(current.url)) continue;

        seen.add(current.url);
        visited++;

        const response =
            await fetchCdseWithRedirects(
                current.url,
                {
                    headers: {
                        "Authorization":
                            "Bearer " +
                            accessToken,
                        "Accept":
                            "application/json"
                    }
                },
                ODATA_TIMEOUT_MS
            );

        if(
            response.status === 401 ||
            response.status === 403
        ){
            const error =
                new Error(
                    "Copernicus product node listing authentication failed."
                );
            error.code = "CDSE_AUTH";
            throw error;
        }

        if(!response.ok){
            const body =
                await safeReadText(response);

            throw new Error(
                "Copernicus product node listing failed (" +
                response.status +
                "): " +
                body.slice(0,300)
            );
        }

        const data =
            await response.json();

        const nodes =
            Array.isArray(data && data.result)
                ? data.result
                : Array.isArray(data && data.value)
                    ? data.value
                    : [];

        for(
            const node of nodes
        ){

            const name =
                firstNonEmpty(
                    node && node.Name,
                    node && node.name,
                    node && node.Id,
                    node && node.id
                );

            if(!name) continue;

            const lower =
                name.toLowerCase();

            const childPath =
                current.path.concat(name);

            if(
                lower.endsWith(".geojson") ||
                lower.endsWith(".json")
            ){
                const nodeUrl =
                    CDSE_DOWNLOAD_BASE +
                    "(" +
                    encodeURIComponent(productId) +
                    ")" +
                    childPath.map(function(part){
                        return "/Nodes(" +
                            encodeURIComponent(part) +
                            ")";
                    }).join("");

                return {
                    url:
                        nodeUrl +
                        "/$value",
                    name,
                    path:
                        childPath,
                    contentLength:
                        numberOrNull(
                            node && node.ContentLength
                        )
                };
            }

            const childUri =
                node &&
                node.Nodes &&
                node.Nodes.uri
                    ? String(node.Nodes.uri)
                    : "";

            const childUrl =
                childUri ||
                (
                    node &&
                    Number(node.ChildrenNumber) > 0
                        ? CDSE_DOWNLOAD_BASE +
                            "(" +
                            encodeURIComponent(productId) +
                            ")" +
                            childPath.map(function(part){
                                return "/Nodes(" +
                                    encodeURIComponent(part) +
                                    ")";
                            }).join("") +
                            "/Nodes"
                        : ""
                );

            if(
                childUrl &&
                Number(node.ChildrenNumber) !== 0
            ){
                queue.push({
                    url: childUrl,
                    path: childPath
                });
            }
        }
    }

    return null;
}


/* =========================================================
   TIME-SERIES JSON NODE DISCOVERY
========================================================= */

async function findTimeSeriesGeoJsonNode(
    productId,
    accessToken,
    type
) {

    const rootUrl =
        CDSE_DOWNLOAD_BASE +
        "(" +
        encodeURIComponent(productId) +
        ")/Nodes";

    const queue = [
        {
            url: rootUrl,
            path: []
        }
    ];

    const seen = new Set();
    let visited = 0;
    let jsonCandidates = 0;

    const MAX_JSON_CANDIDATES = 24;

    while(
        queue.length &&
        visited < 200 &&
        jsonCandidates < MAX_JSON_CANDIDATES
    ){

        const current =
            queue.shift();

        if(
            !current ||
            !current.url ||
            seen.has(current.url)
        ){
            continue;
        }

        seen.add(
            current.url
        );

        visited++;

        const response =
            await fetchCdseWithRedirects(
                current.url,
                {
                    headers: {
                        "Authorization":
                            "Bearer " +
                            accessToken,
                        "Accept":
                            "application/json"
                    }
                },
                ODATA_TIMEOUT_MS
            );

        if(
            response.status === 401 ||
            response.status === 403
        ){

            const error =
                new Error(
                    "Copernicus product node listing authentication failed."
                );

            error.code =
                "CDSE_AUTH";

            throw error;

        }

        if(!response.ok){

            try{
                await response.body?.cancel();
            }
            catch(error){}

            continue;

        }

        const data =
            await response.json().catch(function(){
                return null;
            });

        const nodes =
            Array.isArray(
                data &&
                data.result
            )
                ? data.result
                : Array.isArray(
                    data &&
                    data.value
                )
                    ? data.value
                    : [];

        for(
            const node of nodes
        ){

            const name =
                firstNonEmpty(
                    node && node.Name,
                    node && node.name,
                    node && node.Id,
                    node && node.id
                );

            if(!name){
                continue;
            }

            const lower =
                String(name).toLowerCase();

            const childPath =
                current.path.concat(
                    name
                );

            if(
                lower.endsWith(".geojson") ||
                lower.endsWith(".json")
            ){

                jsonCandidates++;

                const nodeUrl =
                    CDSE_DOWNLOAD_BASE +
                    "(" +
                    encodeURIComponent(productId) +
                    ")" +
                    childPath.map(function(part){
                        return "/Nodes(" +
                            encodeURIComponent(part) +
                            ")";
                    }).join("") +
                    "/$value";

                try{

                    const parsed =
                        await downloadLatestJsonFromNode(
                            nodeUrl,
                            accessToken,
                            productId,
                            type
                        );

                    const normalizedProduct =
                        parsed &&
                        parsed.normalizedProduct
                            ? parsed.normalizedProduct
                            : null;

                    if(
                        normalizedProduct &&
                        Array.isArray(
                            normalizedProduct.measurements
                        ) &&
                        normalizedProduct.measurements.length
                    ){

                        return {
                            url:
                                nodeUrl,

                            name,

                            path:
                                childPath,

                            contentLength:
                                numberOrNull(
                                    node &&
                                    node.ContentLength
                                ),

                            normalizedProduct
                        };

                    }

                }
                catch(error){

                    if(
                        error &&
                        error.code === "CDSE_AUTH"
                    ){
                        throw error;
                    }

                }

                continue;

            }

            const childUri =
                node &&
                node.Nodes &&
                node.Nodes.uri
                    ? String(
                        node.Nodes.uri
                    )
                    : "";

            const childUrl =
                childUri ||
                (
                    node &&
                    Number(
                        node.ChildrenNumber
                    ) > 0
                        ? CDSE_DOWNLOAD_BASE +
                            "(" +
                            encodeURIComponent(productId) +
                            ")" +
                            childPath.map(function(part){
                                return "/Nodes(" +
                                    encodeURIComponent(part) +
                                    ")";
                            }).join("") +
                            "/Nodes"
                        : ""
                );

            if(
                childUrl &&
                Number(
                    node.ChildrenNumber
                ) !== 0
            ){

                queue.push({
                    url:
                        childUrl,
                    path:
                        childPath
                });

            }

        }

    }

    return null;

}


async function fetchLatestRangeFromUrl(
    productUrl,
    accessToken,
    rangeBytes,
    contentLength
) {

    const response =
        await fetchCdseWithRedirects(
            productUrl,
            {
                headers: {
                    "Authorization":
                        "Bearer " +
                        accessToken,
                    "Accept":
                        "application/geo+json,application/json,*/*",
                    "Accept-Encoding":
                        "identity",
                    "Range":
                        Number.isFinite(Number(contentLength)) &&
                        Number(contentLength) > Number(rangeBytes)
                            ? (
                                "bytes=" +
                                String(
                                    Math.max(
                                        0,
                                        Number(contentLength) -
                                        Number(rangeBytes)
                                    )
                                ) +
                                "-"
                              )
                            : (
                                "bytes=-" +
                                String(rangeBytes)
                              )
                }
            },
            DOWNLOAD_TIMEOUT_MS
        );

    if(
        response.status === 401 ||
        response.status === 403
    ){
        const error =
            new Error(
                "Copernicus product download authentication failed."
            );

        error.code = "CDSE_AUTH";
        error.status = response.status;

        try{
            await response.body?.cancel();
        }catch(error){}

        throw error;
    }

    if(
        response.status >= 500
    ){
        const body =
            await safeReadText(response);

        throw new Error(
            "Copernicus latest measurement download failed (" +
            response.status +
            "): " +
            body.slice(0,300)
        );
    }

    if(
        !response.ok &&
        response.status !== 206
    ){
        const body =
            await safeReadText(response);

        throw new Error(
            "Copernicus latest measurement request failed (" +
            response.status +
            "): " +
            body.slice(0,300)
        );
    }

    const contentType =
        String(
            response.headers.get("content-type") || ""
        ).toLowerCase();

    const contentLengthHeader =
        Number(
            response.headers.get("content-length") || 0
        );

    const contentRange =
        String(
            response.headers.get("content-range") || ""
        );

    /*
     * If CDSE ignores Range and starts streaming a large object,
     * do not pull the entire product into Worker memory.
     */
    if(
        response.status === 200 &&
        contentLengthHeader > 2 * 1024 * 1024
    ){
        try{
            await response.body?.cancel();
        }catch(error){}

        const error =
            new Error(
                "Copernicus endpoint ignored the range request for a large product."
            );

        error.code = "CDSE_RANGE_UNSUPPORTED";
        throw error;
    }

    const bytes =
        new Uint8Array(
            await response.arrayBuffer()
        );

    if(!bytes.length){
        return {
            latest: null,
            retryWithLargerRange: true
        };
    }

    const text =
        new TextDecoder().decode(
            bytes
        );

    const latest =
        extractLatestMeasurementFromTail(
            text,
            0
        );

    const previous =
        extractLatestMeasurementFromTail(
            text,
            1
        );

    if(latest){
        /*
         * When Range is partial, keep enlarging it until we can also
         * identify the previous observation. That gives the UI a real
         * centimetre/inch change instead of treating missing data as 0.
         */
        return {
            latest,
            previous,
            retryWithLargerRange:
                !previous &&
                Number(rangeBytes) < (
                    8 * 1024 * 1024
                )
        };
    }

    if(
        response.status === 206 ||
        contentRange
    ){
        return {
            latest: null,
            retryWithLargerRange: true
        };
    }

    /*
     * A small 200 response can still be a complete GeoJSON file.
     * Let the parser inspect it even when Content-Type is generic.
     */
    if(
        contentType.includes("zip") ||
        looksLikeJson(bytes)
    ){
        return {
            latest: null,
            retryWithLargerRange: false
        };
    }

    return {
        latest: null,
        retryWithLargerRange: true
    };
}


function buildKnownWaterLevelNodeUrl(
    productId,
    productName
) {

    const name =
        String(
            productName || ""
        ).trim();

    if(!name){
        return "";
    }

    const folderName =
        name;

    let fileName =
        "";

    if(
        /_geojson$/i.test(name)
    ){
        fileName =
            name.replace(
                /_geojson$/i,
                ""
            ) +
            ".json";
    }
    else if(
        /\.geojson$/i.test(name)
    ){
        fileName =
            name.replace(
                /\.geojson$/i,
                ""
            ) +
            ".json";
    }
    else if(
        /\.json$/i.test(name)
    ){
        fileName =
            name;
    }
    else{
        fileName =
            name +
            ".json";
    }

    return (
        CDSE_DOWNLOAD_BASE +
        "(" +
        encodeURIComponent(productId) +
        ")" +
        "/Nodes(" +
        encodeURIComponent(folderName) +
        ")" +
        "/Nodes(" +
        encodeURIComponent(fileName) +
        ")" +
        "/$value"
    );
}


async function fetchLatestRangeChunk(
    productId,
    accessToken,
    rangeBytes,
    knownNodeUrl,
    contentLength
) {

    if(knownNodeUrl){

        try{

            const knownNodeResult =
                await fetchLatestRangeFromUrl(
                    knownNodeUrl,
                    accessToken,
                    rangeBytes,
                    undefined
                );

            if(
                knownNodeResult &&
                (
                    knownNodeResult.latest ||
                    knownNodeResult.retryWithLargerRange
                )
            ){
                return knownNodeResult;
            }

        }
        catch(error){

            if(
                error &&
                error.code === "CDSE_AUTH"
            ){
                throw error;
            }

            /*
             * Fall back to the root product and recursive node
             * discovery if the predictable CLMS filename is not
             * available at this product.
             */
        }
    }

    const rootUrl =
        CDSE_DOWNLOAD_BASE +
        "(" +
        encodeURIComponent(productId) +
        ")/$value";

    try{

        const rootResult =
            await fetchLatestRangeFromUrl(
                rootUrl,
                accessToken,
                rangeBytes
            );

        if(
            rootResult &&
            rootResult.latest
        ){
            return rootResult;
        }

    }
    catch(error){

        if(
            error &&
            (
                error.code === "CDSE_AUTH"
            )
        ){
            throw error;
        }

        /*
         * Root may be a packaged product, or its download endpoint
         * may ignore Range. Fall through to Nodes.
         */
    }

    const node =
        await findGeoJsonNode(
            productId,
            accessToken
        );

    if(!node){
        return {
            latest: null,
            retryWithLargerRange: false
        };
    }

    return await fetchLatestRangeFromUrl(
        node.url,
        accessToken,
        rangeBytes,
        node.contentLength
    );
}


function extractLatestMeasurementFromTail(
    text,
    occurrenceFromEnd = 0
) {

    const source =
        String(
            text || ""
        );

    if(!source){
        return null;
    }

    /*
     * The CLMS measurement objects are flat JSON objects.
     * Locate the last height field first instead of running a
     * large global regex across the entire range chunk.
     */
    const candidates = [
        '"water_surface_height_above_reference_datum"',
        '"WaterSurfaceHeightAboveReferenceDatum"'
    ];

    const keyPositions = [];

    for(
        const key of candidates
    ){
        let searchFrom = 0;

        while(searchFrom < source.length){
            const position =
                source.indexOf(
                    key,
                    searchFrom
                );

            if(position < 0){
                break;
            }

            keyPositions.push({
                position,
                key
            });

            searchFrom =
                position + key.length;
        }
    }

    keyPositions.sort(function(left,right){
        return left.position - right.position;
    });

    const targetIndex =
        keyPositions.length -
        1 -
        Math.max(
            0,
            Math.floor(
                Number(occurrenceFromEnd) || 0
            )
        );

    if(
        targetIndex < 0 ||
        !keyPositions[targetIndex]
    ){
        return null;
    }

    const keyPosition =
        keyPositions[targetIndex].position;

    const keyName =
        keyPositions[targetIndex].key;

    const colon =
        source.indexOf(
            ":",
            keyPosition + keyName.length
        );

    if(colon < 0){
        return null;
    }

    const valueText =
        source
            .slice(
                colon + 1,
                colon + 160
            )
            .trim();

    const numberMatch =
        valueText.match(
            /^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/
        );

    if(!numberMatch){
        return null;
    }

    const height =
        numberOrNull(
            numberMatch[0]
        );

    if(!Number.isFinite(height)){
        return null;
    }

    /*
     * Find the containing object. If its opening brace is
     * outside the current range, the caller will request a
     * larger range.
     */
    const objectStart =
        source.lastIndexOf(
            "{",
            keyPosition
        );

    const objectEnd =
        source.indexOf(
            "}",
            colon
        );

    if(
        objectStart < 0 ||
        objectEnd < 0 ||
        objectEnd <= objectStart
    ){
        return null;
    }

    const objectText =
        source.slice(
            objectStart,
            objectEnd + 1
        );

    try{

        const object =
            JSON.parse(
                objectText
            );

        const normalized =
            normalizeMeasurement(
                object
            );

        if(
            Number.isFinite(
                normalized.height
            ) &&
            normalized.datetime
        ){
            return normalized;
        }

    }
    catch(error){
        /*
         * The object can start before the byte-range boundary or
         * otherwise be incomplete. Fall back to small key-level
         * extraction from the visible fragment.
         */
    }

    const datetimeMatch =
        objectText.match(
            /"(?:Datetime|datetime|DateTime|dateTime|timestamp)"\s*:\s*"([^"]+)"/
        );

    if(!datetimeMatch){
        return null;
    }

    const uncertaintyMatch =
        objectText.match(
            /"(?:water_surface_height_uncertainty|associated_uncertainty|uncertainty)"\s*:\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/
        );

    return {
        identifier: "",
        time: null,
        datetime:
            datetimeMatch[1],
        height,
        uncertainty:
            uncertaintyMatch
                ? numberOrNull(
                    uncertaintyMatch[1]
                  )
                : null,
        satellite: "",
        groundTrack: null,
        cycleNumber: null
    };

}


/* =========================================================
   PRODUCT RETRIEVAL + PARSING
========================================================= */

async function getParsedProduct(
    context,
    {
        productId,
        type,
        forceRefresh
    }
) {

    const request =
        createCacheRequest(
            context.request.url,
            [
                "product",
                WATER_CACHE_VERSION,
                type,
                productId
            ].join("/")
        );

    const cache =
        caches.default;

    if (!forceRefresh) {

        const cached =
            await cache.match(
                request
            );

        if (cached) {

            return await cached.json();

        }

    }

    const requestKey =
        request.url;

    if (inFlightRequests.has(requestKey)) {

        return await inFlightRequests.get(
            requestKey
        );

    }

    const promise =
        (async function(){

            const token =
                await getCdseAccessToken(
                    context
                );

            /*
             * History/Details must use the same per-station JSON asset
             * as the working latest endpoint. The root product download
             * can be a package/container and may not expose the station
             * time series directly.
             */
            try{
                const catalogue =
                    await getCatalogueProductMetadata(
                        context,
                        {
                            productId,
                            type,
                            forceRefresh
                        }
                    );

                const knownNodeUrl =
                    buildKnownWaterLevelNodeUrl(
                        productId,
                        catalogue.station &&
                        catalogue.station.productName
                    );

                if(knownNodeUrl){
                    const stationProduct =
                        await downloadLatestJsonFromNode(
                            knownNodeUrl,
                            token,
                            productId,
                            type
                        );

                    if(
                        stationProduct &&
                        stationProduct.normalizedProduct &&
                        Array.isArray(
                            stationProduct.normalizedProduct.measurements
                        ) &&
                        stationProduct.normalizedProduct.measurements.length
                    ){
                        const product =
                            stationProduct.normalizedProduct;

                        const response =
                            jsonResponse(
                                product,
                                200,
                                {
                                    "Cache-Control":
                                        "public, max-age=" +
                                        PRODUCT_CACHE_TTL_SECONDS +
                                        ", stale-while-revalidate=" +
                                        PRODUCT_STALE_TTL_SECONDS,
                                    "X-Water-Cache":
                                        "MISS"
                                }
                            );

                        await cache.put(
                            request,
                            response.clone()
                        );

                        return product;
                    }
                }
            }
            catch(error){
                console.warn(
                    "Per-station Water Levels history download failed:",
                    productId,
                    error
                );

                if(
                    error &&
                    error.code === "CDSE_AUTH"
                ){
                    throw error;
                }
            }

            /*
             * Some CLMS products do not expose the station asset at a
             * predictable folder/file name even though the asset is
             * discoverable through the product Nodes tree. Reuse the
             * same recursive node discovery that already powers the
             * working latest-observation path.
             */
            try{
                const discoveredNode =
                    await findTimeSeriesGeoJsonNode(
                        productId,
                        token,
                        type
                    );

                if(
                    discoveredNode &&
                    discoveredNode.normalizedProduct &&
                    Array.isArray(
                        discoveredNode.normalizedProduct.measurements
                    ) &&
                    discoveredNode.normalizedProduct.measurements.length
                ){

                    const product =
                        discoveredNode.normalizedProduct;

                    const response =
                        jsonResponse(
                            product,
                            200,
                            {
                                "Cache-Control":
                                    "public, max-age=" +
                                    PRODUCT_CACHE_TTL_SECONDS +
                                    ", stale-while-revalidate=" +
                                    PRODUCT_STALE_TTL_SECONDS,
                                "X-Water-Cache":
                                    "MISS"
                            }
                        );

                    await cache.put(
                        request,
                        response.clone()
                    );

                    return product;

                }

            }
            catch(error){

                console.warn(
                    "Validated Water Levels history node discovery failed:",
                    productId,
                    error
                );

                if(
                    error &&
                    error.code === "CDSE_AUTH"
                ){
                    throw error;
                }

            }

            /*
             * Preserve the existing root-product fallback for products
             * whose station JSON cannot be discovered as a node.
             */
            const product =
                await downloadAndParseProduct(
                    productId,
                    token,
                    type
                );

            const response =
                jsonResponse(
                    product,
                    200,
                    {
                        "Cache-Control":
                            "public, max-age=" +
                            PRODUCT_CACHE_TTL_SECONDS +
                            ", stale-while-revalidate=" +
                            PRODUCT_STALE_TTL_SECONDS,
                        "X-Water-Cache":
                            "MISS"
                    }
                );

            await cache.put(
                request,
                response.clone()
            );

            return product;

        })();

    inFlightRequests.set(
        requestKey,
        promise
    );

    try {

        return await promise;

    }
    catch (error) {

        const stale =
            await cache.match(
                request
            );

        if (stale) {

            return await stale.json();

        }

        throw error;

    }
    finally {

        inFlightRequests.delete(
            requestKey
        );

    }

}


/* =========================================================
   CDSE AUTHENTICATION
========================================================= */

async function getCdseAccessToken(
    context
) {

    const now =
        Date.now();

    if (
        memoryToken &&
        memoryTokenExpiresAt >
            now + 60000
    ) {

        return memoryToken;

    }

    if (tokenPromise) {

        return await tokenPromise;

    }

    const staticToken =
        String(
            context.env.CDSE_ACCESS_TOKEN || ""
        )
        .trim();

    if (staticToken) {

        memoryToken =
            staticToken;

        memoryTokenExpiresAt =
            now +
            5 * 60 * 1000;

        return staticToken;

    }

    const username =
        String(
            context.env.CDSE_USERNAME || ""
        )
        .trim();

    const password =
        String(
            context.env.CDSE_PASSWORD || ""
        );

    if (
        !username ||
        !password
    ) {

        const error =
            new Error(
                "Copernicus credentials are not configured."
            );

        error.code =
            "CDSE_CONFIGURATION";

        throw error;

    }

    tokenPromise =
        (async function(){

            const body =
                new URLSearchParams();

            body.set(
                "client_id",
                "cdse-public"
            );

            body.set(
                "grant_type",
                "password"
            );

            body.set(
                "username",
                username
            );

            body.set(
                "password",
                password
            );

            const totp =
                String(
                    context.env.CDSE_TOTP || ""
                ).trim();

            if(totp){
                body.set(
                    "totp",
                    totp
                );
            }

            const response =
                await fetch(
                    CDSE_TOKEN_URL,
                    {
                        method:
                            "POST",
                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded",
                            "Accept":
                                "application/json"
                        },
                        body:
                            body.toString()
                    }
                );

            if (!response.ok) {

                const text =
                    await safeReadText(
                        response
                    );

                console.error(
                    "CDSE authentication failed:",
                    response.status,
                    text.slice(0,500)
                );

                const authError =
                    new Error(
                        "Copernicus authentication failed."
                    );

                authError.code =
                    "CDSE_AUTH";

                authError.status =
                    response.status;

                authError.details =
                    text.slice(0,300);

                authError.credentialDiagnostics = {
                    usernameConfigured:
                        Boolean(username),
                    usernameLength:
                        username.length,
                    passwordConfigured:
                        Boolean(password),
                    passwordLength:
                        password.length,
                    passwordHasLeadingWhitespace:
                        password.length !== password.trimStart().length,
                    passwordHasTrailingWhitespace:
                        password.length !== password.trimEnd().length
                };

                throw authError;

            }

            const data =
                await response.json();

            if (
                !data ||
                !data.access_token
            ) {

                const tokenError =
                    new Error(
                        "Copernicus authentication returned no access token."
                    );

                tokenError.code =
                    "CDSE_AUTH";

                throw tokenError;

            }

            memoryToken =
                String(
                    data.access_token
                );

            const expiresIn =
                Number(
                    data.expires_in || 300
                );

            memoryTokenExpiresAt =
                Date.now() +
                Math.max(
                    60000,
                    (expiresIn - 60) * 1000
                );

            return memoryToken;

        })();

    try {

        return await tokenPromise;

    }
    finally {

        tokenPromise =
            null;

    }

}


/* =========================================================
   DOWNLOAD PRODUCT
========================================================= */

async function downloadAndParseProduct(
    productId,
    accessToken,
    type
) {

    const productUrl =
        CDSE_DOWNLOAD_BASE +
        "(" +
        encodeURIComponent(productId) +
        ")/$value";

    const response =
        await fetchCdseWithRedirects(
            productUrl,
            {
                headers: {
                    "Authorization":
                        "Bearer " +
                        accessToken,
                    "Accept":
                        "application/geo+json,application/json,application/zip,*/*"
                }
            },
            DOWNLOAD_TIMEOUT_MS
        );

    if (!response.ok) {

        const text =
            await safeReadText(
                response
            );

        console.error(
            "CDSE product download failed:",
            response.status,
            text.slice(0,500)
        );

        if (
            response.status === 401
        ) {
            memoryToken = null;
            memoryTokenExpiresAt = 0;
        }

        throw new Error(
            "Copernicus product download failed (" +
            response.status +
            ")."
        );

    }

    const contentType =
        String(
            response.headers.get(
                "content-type"
            ) || ""
        )
        .toLowerCase();

    const bytes =
        new Uint8Array(
            await response.arrayBuffer()
        );

    if (!bytes.byteLength) {

        throw new Error(
            "Copernicus returned an empty product."
        );

    }

    let payload;

    if (
        contentType.includes("json") ||
        contentType.includes("geo+json") ||
        looksLikeJson(bytes)
    ) {

        payload =
            JSON.parse(
                new TextDecoder().decode(
                    bytes
                )
            );

    }
    else {

        if (
            !isZip(bytes)
        ) {

            throw new Error(
                "Unsupported Copernicus water-level product format."
            );

        }

        const extracted =
            await extractJsonFromZip(
                bytes,
                {
                    productId,
                    type
                }
            );

        payload =
            JSON.parse(
                new TextDecoder().decode(
                    extracted
                )
            );

    }

    return normalizeProductPayload(
        payload,
        {
            productId,
            type
        }
    );

}


/* =========================================================
   PRODUCT PAYLOAD NORMALIZATION
========================================================= */

function normalizeProductPayload(
    payload,
    {
        productId,
        type
    }
) {

    let feature =
        null;

    if (
        payload &&
        payload.type === "Feature"
    ) {

        feature =
            payload;

    }
    else if (
        payload &&
        payload.type === "FeatureCollection" &&
        Array.isArray(payload.features) &&
        payload.features.length
    ) {

        feature =
            payload.features[0];

    }

    const properties =
        feature &&
        feature.properties
            ? feature.properties
            : (
                payload &&
                payload.properties
                    ? payload.properties
                    : {}
              );

    const geometry =
        feature &&
        feature.geometry
            ? feature.geometry
            : (
                payload &&
                payload.geometry
                    ? payload.geometry
                    : null
              );

    const featureList =
        payload &&
        payload.type === "FeatureCollection" &&
        Array.isArray(payload.features)
            ? payload.features
            : feature
                ? [feature]
                : [];

    const rawMeasurements = [];

    /*
     * CLMS Water Level files contain a time series under the GeoJSON
     * "data" member, but keep this collector deliberately tolerant:
     * product revisions can wrap the series in different JSON containers.
     *
     * We recognize a measurement by its actual water-level fields instead
     * of depending only on a particular nesting/key name.
     */
    function collectMeasurementData(value, depth = 0){
        if(
            value === null ||
            value === undefined ||
            depth > 10
        ){
            return;
        }

        if(Array.isArray(value)){
            value.forEach(function(item){
                collectMeasurementData(
                    item,
                    depth + 1
                );
            });
            return;
        }

        if(
            typeof value !== "object"
        ){
            return;
        }

        const normalized =
            normalizeMeasurement(
                value
            );

        if(
            Number.isFinite(
                normalized.height
            ) &&
            normalized.datetime
        ){
            rawMeasurements.push(
                value
            );
            return;
        }

        Object.keys(value).forEach(function(key){
            collectMeasurementData(
                value[key],
                depth + 1
            );
        });
    }

    /*
     * This is the actual time-series extraction step. CLMS water-level
     * GeoJSON stores the observations inside nested "data" structures,
     * and some revisions wrap them through additional objects/features.
     * Walking the complete payload also supports FeatureCollection products.
     */
    collectMeasurementData(
        payload
    );

    const measurementSeen = new Set();

    const measurements =
        rawMeasurements
            .map(
                normalizeMeasurement
            )
            .filter(
                function(item) {
                    if(
                        !Number.isFinite(item.height) ||
                        !item.datetime
                    ){
                        return false;
                    }

                    const signature =
                        [
                            item.datetime,
                            item.height,
                            item.identifier || ""
                        ].join("|");

                    if(measurementSeen.has(signature)){
                        return false;
                    }

                    measurementSeen.add(signature);
                    return true;
                }
            )
            .sort(
                compareMeasurements
            );

    const coordinates =
        extractPointCoordinates(
            geometry
        );

    const waterBody =
        firstNonEmpty(
            properties.river,
            properties.lake
        );

    const stationId =
        firstNonEmpty(
            properties.resource,
            productId
        );

    return {

        ok: true,

        productId,

        type,

        station: {

            stationId,

            waterBody:
                waterBody || "",

            basin:
                firstNonEmpty(
                    properties.basin,
                    ""
                ),

            country:
                firstNonEmpty(
                    properties.country,
                    ""
                ),

            coordinates,

            source:
                firstNonEmpty(
                    properties.source,
                    "Derived from satellite altimetry"
                ),

            referenceGeoid:
                firstNonEmpty(
                    properties.water_surface_reference_name,
                    properties.water_surface_reference_datum_name,
                    ""
                ),

            referenceDatumAltitude:
                numberOrNull(
                    properties.water_surface_reference_datum_altitude
                ),

            coverageStart:
                firstNonEmpty(
                    properties.time_coverage_start,
                    ""
                ),

            coverageEnd:
                firstNonEmpty(
                    properties.time_coverage_end,
                    ""
                ),

            updated:
                firstNonEmpty(
                    properties.updated,
                    ""
                ),

            processingLevel:
                firstNonEmpty(
                    properties.processing_level,
                    ""
                ),

            processingMode:
                firstNonEmpty(
                    properties.processing_mode,
                    "Near Real Time"
                ),

            status:
                firstNonEmpty(
                    properties.status,
                    ""
                ),

            platform:
                firstNonEmpty(
                    properties.platform,
                    ""
                ),

            longName:
                firstNonEmpty(
                    properties.long_name,
                    "Lake and River Water Level"
                ),

            missingValue:
                numberOrNull(
                    properties.missing_value
                ),

            comment:
                firstNonEmpty(
                    properties.comment,
                    ""
                ),

            institution:
                firstNonEmpty(
                    properties.institution,
                    ""
                )

        },

        coordinates,

        measurements,

        measurementCount:
            measurements.length

    };

}


/* =========================================================
   MEASUREMENT NORMALIZATION
========================================================= */

function normalizeMeasurement(
    item
) {

    if (!item) {

        return {
            identifier: "",
            time: null,
            datetime: "",
            height: null,
            uncertainty: null,
            satellite: "",
            groundTrack: null,
            cycleNumber: null
        };

    }

    const datetime =
        firstNonEmpty(
            fieldValue(item,[
                "Datetime",
                "datetime",
                "DateTime",
                "dateTime",
                "timestamp"
            ]),
            ""
        );

    const height =
        numberOrNull(
            fieldValue(item,[
                "water_surface_height_above_reference_datum",
                "orthometric_height_of_water_surface_at_reference_position",
                "water_surface_height",
                "waterLevel",
                "WaterSurfaceHeightAboveReferenceDatum"
            ])
        );

    const uncertainty =
        numberOrNull(
            fieldValue(item,[
                "water_surface_height_uncertainty",
                "associated_uncertainty",
                "uncertainty",
                "WaterSurfaceHeightUncertainty"
            ])
        );

    const groundTrack =
        numberOrNull(
            fieldValue(item,[
                "ground-track_number",
                "ground_track_number",
                "groundTrackNumber"
            ])
        );

    const cycleNumber =
        numberOrNull(
            fieldValue(item,[
                "cycle_number",
                "cycleNumber",
                "cycle"
            ])
        );

    return {

        identifier:
            firstNonEmpty(
                fieldValue(
                    item,
                    [
                        "identifier"
                    ]
                ),
                ""
            ),

        time:
            numberOrNull(
                item.time
            ),

        datetime,

        height,

        uncertainty,

        satellite:
            firstNonEmpty(
                fieldValue(
                    item,
                    [
                        "satellite"
                    ]
                ),
                ""
            ),

        groundTrack,

        cycleNumber

    };

}


/* =========================================================
   DETAIL RESPONSE
========================================================= */

function buildDetailResponse(
    product,
    range
) {

    const all =
        Array.isArray(
            product.measurements
        )
            ? product.measurements
            : [];

    const filtered =
        filterHistory(
            all,
            range
        );

    const sampled =
        downsampleMeasurements(
            filtered,
            MAX_HISTORY_POINTS
        );

    const latest =
        all.length
            ? all[all.length - 1]
            : null;

    const previous =
        all.length > 1
            ? all[all.length - 2]
            : null;

    const selectedLatest =
        filtered.length
            ? filtered[filtered.length - 1]
            : latest;

    const trend =
        calculateTrend(
            filtered
        );

    return {

        ok: true,

        range,

        station: {

            ...product.station,

            productId:
                product.productId,

            type:
                product.type,

            measurementCount:
                product.measurementCount,

            selectedMeasurementCount:
                filtered.length,

            coordinates:
                product.coordinates

        },

        latest:
            selectedLatest || null,

        previous:
            previous || null,

        trend,

        measurements:
            sampled,

        history: {

            range,

            availableFrom:
                all.length
                    ? all[0].datetime
                    : null,

            availableTo:
                all.length
                    ? all[all.length - 1].datetime
                    : null,

            points:
                sampled.length,

            totalPoints:
                filtered.length

        },

        source: {

            provider:
                "Copernicus Land Monitoring Service",

            catalogue:
                "Copernicus Data Space Ecosystem",

            dataset:
                product.type === "river"
                    ? WATER_DATASETS.rivers
                    : WATER_DATASETS.lakes,

            methodology:
                "Satellite altimetry"

        }

    };

}


/* =========================================================
   HISTORY RANGE
========================================================= */

function normalizeHistoryRange(
    value
) {

    const normalized =
        String(
            value || "MAX"
        )
        .trim()
        .toUpperCase();

    return (
        normalized === "30D" ||
        normalized === "1Y" ||
        normalized === "MAX"
    )
        ? normalized
        : "MAX";

}

function filterHistory(
    measurements,
    range
) {

    if (
        range === "MAX" ||
        !measurements.length
    ) {

        return measurements.slice();

    }

    const latest =
        parseMeasurementDate(
            measurements[
                measurements.length - 1
            ].datetime
        );

    if (!latest) {

        return measurements.slice();

    }

    const days =
        range === "30D"
            ? 30
            : 365;

    const cutoff =
        new Date(
            latest.getTime() -
            days * 24 * 60 * 60 * 1000
        );

    return measurements.filter(
        function(item) {

            const date =
                parseMeasurementDate(
                    item.datetime
                );

            return (
                date &&
                date >= cutoff
            );

        }
    );

}


/* =========================================================
   DOWNSAMPLING
========================================================= */

function downsampleMeasurements(
    measurements,
    maxPoints
) {

    if (
        measurements.length <= maxPoints
    ) {

        return measurements.slice();

    }

    const result = [];

    const bucketSize =
        (
            measurements.length - 1
        ) /
        (
            maxPoints - 1
        );

    for (
        let index = 0;
        index < maxPoints;
        index++
    ) {

        const position =
            Math.round(
                index * bucketSize
            );

        result.push(
            measurements[
                Math.min(
                    position,
                    measurements.length - 1
                )
            ]
        );

    }

    return result;

}


/* =========================================================
   TREND
========================================================= */

function calculateTrend(
    measurements
) {

    if (
        !Array.isArray(
            measurements
        ) ||
        measurements.length < 2
    ) {

        return {
            available: false,
            metersPerYear: null,
            millimetersPerYear: null
        };

    }

    const first =
        measurements[0];

    const last =
        measurements[
            measurements.length - 1
        ];

    const firstDate =
        parseMeasurementDate(
            first.datetime
        );

    const lastDate =
        parseMeasurementDate(
            last.datetime
        );

    if (
        !firstDate ||
        !lastDate ||
        !Number.isFinite(first.height) ||
        !Number.isFinite(last.height)
    ) {

        return {
            available: false,
            metersPerYear: null,
            millimetersPerYear: null
        };

    }

    const years =
        (
            lastDate.getTime() -
            firstDate.getTime()
        ) /
        (
            365.2425 *
            24 *
            60 *
            60 *
            1000
        );

    if (
        !Number.isFinite(years) ||
        years <= 0
    ) {

        return {
            available: false,
            metersPerYear: null,
            millimetersPerYear: null
        };

    }

    const metersPerYear =
        (
            last.height -
            first.height
        ) /
        years;

    if (
        !Number.isFinite(
            metersPerYear
        )
    ) {

        return {
            available: false,
            metersPerYear: null,
            millimetersPerYear: null
        };

    }

    return {

        available: true,

        metersPerYear,

        millimetersPerYear:
            metersPerYear * 1000,

        method:
            "Linear change between first and last point in selected range"

    };

}


/* =========================================================
   ZIP EXTRACTION — STANDARD DEFLATE/STORED
========================================================= */

async function extractJsonFromZip(
    bytes,
    {
        productId,
        type
    } = {}
) {

    const view =
        new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength
        );

    const endRecord =
        findEndOfCentralDirectory(
            bytes
        );

    const candidateEntries = [];

    function addCandidate(entry){

        if(
            !entry ||
            !entry.fileName ||
            !isJsonFileName(
                entry.fileName
            )
        ){
            return;
        }

        if(
            candidateEntries.length >= 32
        ){
            return;
        }

        candidateEntries.push(
            entry
        );

    }

    if(endRecord >= 0){

        const centralOffset =
            view.getUint32(
                endRecord + 16,
                true
            );

        const entries =
            view.getUint16(
                endRecord + 10,
                true
            );

        let offset =
            centralOffset;

        for(
            let index = 0;
            index < entries &&
            offset + 46 <= bytes.length &&
            candidateEntries.length < 32;
            index++
        ){

            if(
                view.getUint32(
                    offset,
                    true
                ) !== 0x02014b50
            ){
                break;
            }

            const compression =
                view.getUint16(
                    offset + 10,
                    true
                );

            const compressedSize =
                view.getUint32(
                    offset + 20,
                    true
                );

            const nameLength =
                view.getUint16(
                    offset + 28,
                    true
                );

            const extraLength =
                view.getUint16(
                    offset + 30,
                    true
                );

            const commentLength =
                view.getUint16(
                    offset + 32,
                    true
                );

            const localHeaderOffset =
                view.getUint32(
                    offset + 42,
                    true
                );

            const nameBytes =
                bytes.slice(
                    offset + 46,
                    offset + 46 + nameLength
                );

            const fileName =
                new TextDecoder().decode(
                    nameBytes
                );

            addCandidate({
                fileName,
                compression,
                compressedSize,
                localHeaderOffset,
                order:index
            });

            offset +=
                46 +
                nameLength +
                extraLength +
                commentLength;

        }

    }

    if(!candidateEntries.length){

        let offset = 0;
        let order = 0;

        while(
            offset + 30 <= bytes.length &&
            candidateEntries.length < 32
        ){

            const signature =
                view.getUint32(
                    offset,
                    true
                );

            if(
                signature !== 0x04034b50
            ){
                offset += 1;
                continue;
            }

            const compression =
                view.getUint16(
                    offset + 8,
                    true
                );

            const compressedSize =
                view.getUint32(
                    offset + 18,
                    true
                );

            const nameLength =
                view.getUint16(
                    offset + 26,
                    true
                );

            const extraLength =
                view.getUint16(
                    offset + 28,
                    true
                );

            const nameBytes =
                bytes.slice(
                    offset + 30,
                    offset + 30 + nameLength
                );

            const fileName =
                new TextDecoder().decode(
                    nameBytes
                );

            addCandidate({
                fileName,
                compression,
                compressedSize,
                localHeaderOffset:offset,
                order:order++
            });

            offset +=
                Math.max(
                    30 +
                    nameLength +
                    extraLength +
                    compressedSize,
                    1
                );

        }

    }

    if(!candidateEntries.length){

        throw new Error(
            "No GeoJSON/JSON file was found in the Copernicus archive."
        );

    }

    let firstValidJson = null;

    for(
        const entry of candidateEntries
    ){

        try{

            const extracted =
                await extractZipEntry(
                    bytes,
                    view,
                    {
                        compression:
                            entry.compression,
                        compressedSize:
                            entry.compressedSize,
                        localHeaderOffset:
                            entry.localHeaderOffset
                    }
                );

            if(
                !firstValidJson
            ){
                firstValidJson =
                    extracted;
            }

            const text =
                new TextDecoder().decode(
                    extracted
                );

            const payload =
                JSON.parse(
                    text
                );

            const normalized =
                normalizeProductPayload(
                    payload,
                    {
                        productId:
                            String(
                                productId || ""
                            ),
                        type:
                            String(
                                type || ""
                            )
                    }
                );

            if(
                normalized &&
                Array.isArray(
                    normalized.measurements
                ) &&
                normalized.measurements.length
            ){

                return extracted;

            }

        }
        catch(error){

            /* Continue with the next JSON candidate. */

        }

    }

    /*
     * Keep valid metadata-only JSON as the final diagnostic fallback.
     * This preserves real catalogue metadata without inventing a time
     * series when the product genuinely has no usable observations.
     */
    if(firstValidJson){
        return firstValidJson;
    }

    throw new Error(
        "No valid JSON file was found in the Copernicus archive."
    );

}


/* =========================================================
   ZIP ENTRY
========================================================= */

async function extractZipEntry(
    bytes,
    view,
    {
        compression,
        compressedSize,
        localHeaderOffset
    }
) {

    if (
        localHeaderOffset + 30 >
        bytes.length
    ) {

        throw new Error(
            "Invalid ZIP local header."
        );

    }

    if (
        view.getUint32(
            localHeaderOffset,
            true
        ) !== 0x04034b50
    ) {

        throw new Error(
            "Invalid ZIP local file header."
        );

    }

    const fileNameLength =
        view.getUint16(
            localHeaderOffset + 26,
            true
        );

    const extraLength =
        view.getUint16(
            localHeaderOffset + 28,
            true
        );

    const dataStart =
        localHeaderOffset +
        30 +
        fileNameLength +
        extraLength;

    const compressed =
        bytes.slice(
            dataStart,
            dataStart + compressedSize
        );

    if (
        compression === 0
    ) {

        return compressed;

    }

    if (
        compression === 8
    ) {

        return await inflateDeflateRaw(
            compressed
        );

    }

    throw new Error(
        "Unsupported ZIP compression method: " +
        compression
    );

}


/* =========================================================
   LOCAL ZIP FALLBACK
========================================================= */

async function extractFirstLocalJson(
    bytes,
    view
) {

    let offset = 0;

    while (
        offset + 30 <=
        bytes.length
    ) {

        const signature =
            view.getUint32(
                offset,
                true
            );

        if (
            signature !== 0x04034b50
        ) {

            offset += 1;
            continue;

        }

        const compression =
            view.getUint16(
                offset + 8,
                true
            );

        const compressedSize =
            view.getUint32(
                offset + 18,
                true
            );

        const nameLength =
            view.getUint16(
                offset + 26,
                true
            );

        const extraLength =
            view.getUint16(
                offset + 28,
                true
            );

        const nameBytes =
            bytes.slice(
                offset + 30,
                offset + 30 + nameLength
            );

        const fileName =
            new TextDecoder().decode(
                nameBytes
            );

        if (
            isJsonFileName(
                fileName
            )
        ) {

            return await extractZipEntry(
                bytes,
                view,
                {
                    compression,
                    compressedSize,
                    localHeaderOffset:
                        offset
                }
            );

        }

        offset +=
            Math.max(
                30 +
                nameLength +
                extraLength +
                compressedSize,
                1
            );

    }

    throw new Error(
        "No GeoJSON/JSON file was found in the Copernicus archive."
    );

}


/* =========================================================
   ZIP HELPERS
========================================================= */

function findEndOfCentralDirectory(
    bytes
) {

    const minimum =
        Math.max(
            0,
            bytes.length -
            65557
        );

    for (
        let offset = bytes.length - 22;
        offset >= minimum;
        offset--
    ) {

        if (
            offset < 0
        ) {
            break;
        }

        if (
            bytes[offset] === 0x50 &&
            bytes[offset + 1] === 0x4b &&
            bytes[offset + 2] === 0x05 &&
            bytes[offset + 3] === 0x06
        ) {

            return offset;

        }

    }

    return -1;

}

function isZip(
    bytes
) {

    return (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04
    );

}

function isJsonFileName(
    value
) {

    const name =
        String(
            value || ""
        )
        .trim()
        .toLowerCase();

    return (
        name.endsWith(".geojson") ||
        name.endsWith(".json")
    );

}

async function inflateDeflateRaw(
    bytes
) {

    if (
        typeof DecompressionStream !==
        "function"
    ) {

        throw new Error(
            "Cloudflare runtime does not expose DecompressionStream."
        );

    }

    const stream =
        new Blob([
            bytes
        ])
        .stream()
        .pipeThrough(
            new DecompressionStream(
                "deflate-raw"
            )
        );

    return new Uint8Array(
        await new Response(
            stream
        ).arrayBuffer()
    );

}


/* =========================================================
   ODATA ATTRIBUTE HELPERS
========================================================= */

function normalizeAttributes(
    value
) {

    if (Array.isArray(value)) {
        return value;
    }

    if (
        value &&
        Array.isArray(value.value)
    ) {
        return value.value;
    }

    if (
        value &&
        Array.isArray(value.Items)
    ) {
        return value.Items;
    }

    return [];

}


function attributeEquals(
    name,
    value
) {

    return (
        "Attributes/OData.CSC.StringAttribute/" +
        "any(att:att/Name eq '" +
        escapeODataString(name) +
        "' and att/OData.CSC.StringAttribute/Value eq '" +
        escapeODataString(value) +
        "')"
    );

}

function attributeContains(
    name,
    value
) {

    return (
        "Attributes/OData.CSC.StringAttribute/" +
        "any(att:att/Name eq '" +
        escapeODataString(name) +
        "' and contains(att/OData.CSC.StringAttribute/Value,'" +
        escapeODataString(value) +
        "'))"
    );

}

function attributeValue(
    attributes,
    name
) {

    const wanted =
        String(
            name || ""
        )
        .toLowerCase();

    const match =
        attributes.find(
            function(attribute) {
                return (
                    String(
                        attribute &&
                        attribute.Name || ""
                    )
                    .toLowerCase() ===
                    wanted
                );
            }
        );

    if (!match) {
        return "";
    }

    return String(
        match.Value ??
        ""
    ).trim();

}

function escapeODataString(
    value
) {

    return String(
        value || ""
    ).replace(
        /'/g,
        "''"
    );

}


/* =========================================================
   SEARCH HELPERS
========================================================= */

function normalizeSearchQuery(
    value
) {

    return String(
        value || ""
    )
    .replace(
        /\s+/g,
        " "
    )
    .trim()
    .slice(
        0,
        120
    );

}

function normalizeStationType(
    value
) {

    const normalized =
        String(
            value || ""
        )
        .trim()
        .toLowerCase();

    if (
        normalized === "river" ||
        normalized === "rivers"
    ) {
        return "river";
    }

    if (
        normalized === "lake" ||
        normalized === "lakes"
    ) {
        return "lake";
    }

    return "";

}


/* =========================================================
   GENERIC HELPERS
========================================================= */

function compareStations(
    a,
    b
) {

    const left =
        parseDate(
            a.updated
        )?.getTime() || 0;

    const right =
        parseDate(
            b.updated
        )?.getTime() || 0;

    return right - left;

}

function compareMeasurements(
    a,
    b
) {

    const left =
        parseMeasurementDate(
            a.datetime
        )?.getTime() || 0;

    const right =
        parseMeasurementDate(
            b.datetime
        )?.getTime() || 0;

    return left - right;

}

function parseDate(
    value
) {

    if (!value) {
        return null;
    }

    const date =
        new Date(
            value
        );

    return Number.isFinite(
        date.getTime()
    )
        ? date
        : null;

}

function parseMeasurementDate(
    value
) {

    if (!value) {
        return null;
    }

    const raw =
        String(
            value
        ).trim();

    if (!raw) {
        return null;
    }

    const normalized =
        raw
            .replace(
                /^(\d{4})\/(\d{2})\/(\d{2})/,
                "$1-$2-$3"
            )
            .replace(
                " ",
                "T"
            );

    const date =
        new Date(
            normalized
        );

    return Number.isFinite(
        date.getTime()
    )
        ? date
        : null;

}

function extractPointFromGeoFootprint(
    footprint
) {

    if (
        !footprint ||
        !Array.isArray(
            footprint.coordinates
        )
    ) {
        return null;
    }

    if (
        footprint.type === "Point" &&
        footprint.coordinates.length >= 2
    ) {

        return {
            latitude:
                numberOrNull(
                    footprint.coordinates[1]
                ),
            longitude:
                numberOrNull(
                    footprint.coordinates[0]
                )
        };

    }

    return null;

}

function extractPointCoordinates(
    geometry
) {

    if (
        !geometry ||
        geometry.type !== "Point" ||
        !Array.isArray(
            geometry.coordinates
        )
    ) {
        return null;
    }

    return {
        latitude:
            numberOrNull(
                geometry.coordinates[1]
            ),
        longitude:
            numberOrNull(
                geometry.coordinates[0]
            )
    };

}

function numberOrNull(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number =
        Number(
            value
        );

    return Number.isFinite(
        number
    )
        ? number
        : null;

}

function fieldValue(
    object,
    names
) {

    if(
        !object ||
        typeof object !== "object" ||
        !Array.isArray(names)
    ){
        return undefined;
    }

    const wanted =
        new Set(
            names.map(function(name){
                return String(name).toLowerCase();
            })
        );

    for(
        const key of Object.keys(object)
    ){
        if(
            wanted.has(
                String(key).toLowerCase()
            )
        ){
            return object[key];
        }
    }

    return undefined;
}


function firstDefined(
    ...values
) {

    for (
        const value of values
    ) {

        if (
            value !== null &&
            value !== undefined
        ) {

            return value;

        }

    }

    return undefined;

}

function firstNonEmpty(
    ...values
) {

    for (
        const value of values
    ) {

        const text =
            value === null ||
            value === undefined
                ? ""
                : String(
                    value
                ).trim();

        if (text) {
            return text;
        }

    }

    return "";

}

function looksLikeJson(
    bytes
) {

    if (!bytes.length) {
        return false;
    }

    let index = 0;

    while (
        index < bytes.length &&
        (
            bytes[index] === 0x20 ||
            bytes[index] === 0x09 ||
            bytes[index] === 0x0a ||
            bytes[index] === 0x0d
        )
    ) {

        index++;

    }

    return (
        bytes[index] === 0x7b ||
        bytes[index] === 0x5b
    );

}

async function fetchCdseWithRedirects(
    url,
    options = {},
    timeoutMs = 20000
) {

    let currentUrl =
        String(url);

    for(
        let redirectCount = 0;
        redirectCount < 6;
        redirectCount++
    ){

        const headers =
            new Headers(
                options.headers || {}
            );

        const response =
            await fetchWithTimeout(
                currentUrl,
                {
                    ...options,
                    headers,
                    redirect:
                        "manual"
                },
                timeoutMs
            );

        if(
            response.status < 300 ||
            response.status >= 400
        ){
            return response;
        }

        const location =
            response.headers.get(
                "location"
            );

        if(!location){
            return response;
        }

        const nextUrl =
            new URL(
                location,
                currentUrl
            );

        const hostname =
            nextUrl.hostname.toLowerCase();

        /*
         * Preserve the CDSE bearer token only across official
         * Copernicus Data Space hosts. Never forward secrets to
         * an unrelated redirect target.
         */
        const approvedHost =
            hostname === "dataspace.copernicus.eu" ||
            hostname.endsWith(".dataspace.copernicus.eu") ||
            hostname === "cloudferro.com" ||
            hostname.endsWith(".cloudferro.com");

        if(!approvedHost){
            try{
                await response.body?.cancel();
            }catch(error){}

            throw new Error(
                "Copernicus download redirected to an unapproved host."
            );
        }

        try{
            await response.body?.cancel();
        }catch(error){}

        currentUrl =
            nextUrl.toString();
    }

    throw new Error(
        "Copernicus download followed too many redirects."
    );
}


async function fetchWithTimeout(
    url,
    options = {},
    timeoutMs = 20000
) {

    const controller =
        new AbortController();

    const timer =
        setTimeout(
            function() {
                controller.abort();
            },
            timeoutMs
        );

    try {

        return await fetch(
            url,
            {
                ...options,
                signal:
                    controller.signal
            }
        );

    }
    finally {

        clearTimeout(
            timer
        );

    }

}

async function fetchJsonWithTimeout(
    url,
    options = {},
    timeoutMs = 20000
) {

    const response =
        await fetchWithTimeout(
            url,
            options,
            timeoutMs
        );

    if (!response.ok) {

        const text =
            await safeReadText(
                response
            );

        throw new Error(
            "Copernicus OData request failed (" +
            response.status +
            "): " +
            text.slice(0,300)
        );

    }

    return await response.json();

}

async function safeReadText(
    response
) {

    try {

        return await response.text();

    }
    catch (error) {

        return "";

    }

}


/* =========================================================
   CACHE HELPERS
========================================================= */

function createCacheRequest(
    originalUrl,
    suffix
) {

    const original =
        new URL(
            originalUrl
        );

    const safeSuffix =
        String(
            suffix || ""
        )
        .replace(
            /[^a-zA-Z0-9._/-]/g,
            "_"
        );

    const cacheUrl =
        new URL(
            original.origin +
            "/__worth_it_water_cache/" +
            safeSuffix
        );

    return new Request(
        cacheUrl.toString(),
        {
            method:
                "GET"
        }
    );

}

async function safeCacheMatch(
    cache,
    request
){
    try{
        return await cache.match(request);
    }
    catch(error){
        console.warn(
            "Water Levels Cache API match failed:",
            error
        );
        return null;
    }
}

async function safeCachePut(
    cache,
    request,
    response
){
    try{
        await cache.put(
            request,
            response
        );
        return true;
    }
    catch(error){
        console.warn(
            "Water Levels Cache API put failed:",
            error
        );
        return false;
    }
}


function responseWithHeaders(
    response,
    headers = {}
) {

    const cloned =
        new Headers(
            response.headers
        );

    Object.entries(
        headers
    ).forEach(
        function(pair) {
            cloned.set(
                pair[0],
                String(pair[1])
            );
        }
    );

    return new Response(
        response.body,
        {
            status:
                response.status,
            statusText:
                response.statusText,
            headers:
                cloned
        }
    );

}

function jsonResponse(
    data,
    status = 200,
    extraHeaders = {}
) {

    return new Response(
        JSON.stringify(
            data
        ),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=utf-8",
                "Cache-Control":
                    "no-store",
                ...extraHeaders
            }
        }
    );

}
