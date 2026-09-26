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

const WATER_CACHE_VERSION = "v10";

const STATIONS_CACHE_TTL_SECONDS =
    2 * 60 * 60;

const STATIONS_STALE_TTL_SECONDS =
    48 * 60 * 60;

const PRODUCT_CACHE_TTL_SECONDS =
    6 * 60 * 60;

const PRODUCT_STALE_TTL_SECONDS =
    48 * 60 * 60;

const HISTORY_CACHE_TTL_SECONDS =
    60 * 60;

const HISTORY_STALE_TTL_SECONDS =
    24 * 60 * 60;

const MAX_STATION_RESULTS = 48;
const MAX_HISTORY_POINTS = 1200;
const ODATA_TIMEOUT_MS = 20000;
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
                    "Water levels service unavailable."
            },
            500
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
                query.toLowerCase(),
                String(limit)
            ].join("/")
        );

    const cache =
        caches.default;

    if (!forceRefresh) {

        const cached =
            await cache.match(
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

            const results =
                await Promise.all(
                    datasets.map(
                        function(pair) {
                            return searchDatasetProducts({
                                type:
                                    pair[0],
                                datasetId:
                                    pair[1],
                                query,
                                limit:
                                    perDatasetLimit
                            });
                        }
                    )
                );

            const stations =
                results
                    .flat()
                    .sort(compareStations)
                    .slice(0, limit);

            const responseBody = {

                ok: true,

                query,

                type,

                count:
                    stations.length,

                totalCount:
                    results.reduce(
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

    try {

        return await requestPromise;

    }
    catch (error) {

        const stale =
            await cache.match(
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

        return jsonResponse(
            {
                ok: true,
                productId,
                type,
                station:
                    product.station,
                coordinates:
                    product.coordinates,
                measurementCount:
                    null,
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
                    station.coordinates || null
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

        return jsonResponse(
            {
                ok: true,
                productId,
                type,
                latest:
                    result.latest || null,
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
                    PRODUCT_STALE_TTL_SECONDS
            }
        );

    }
    catch (error) {

        console.error(
            "Water latest measurement request failed:",
            error
        );

        return jsonResponse(
            {
                ok: false,
                error:
                    "Unable to load the latest Copernicus water-level measurement."
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

async function searchDatasetProducts({
    type,
    datasetId,
    query,
    limit
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

        filter +=
            " and (" +
            [
                "contains(Name,'" +
                    escapeODataString(query) +
                    "')",

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
        "ModificationDate desc"
    );

    params.set(
        "$top",
        String(limit)
    );

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
    1024 * 1024
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

    for(
        const rangeBytes of LATEST_RANGE_STEPS
    ){

        try{

            const result =
                await fetchLatestRangeChunk(
                    productId,
                    token,
                    rangeBytes
                );

            if(
                result &&
                result.latest
            ){
                return {
                    latest:
                        result.latest,
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


async function fetchLatestRangeChunk(
    productId,
    accessToken,
    rangeBytes
) {

    const hosts = [
        CDSE_DOWNLOAD_BASE,
        ODATA_BASE
    ];

    let lastError = null;

    for(
        const base of hosts
    ){

        const productUrl =
            base +
            "(" +
            encodeURIComponent(productId) +
            ")/$value";

        try{

            const response =
                await fetchWithTimeout(
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
                                "bytes=-" +
                                String(rangeBytes)
                        },
                        redirect:
                            "follow"
                    },
                    DOWNLOAD_TIMEOUT_MS
                );

            if(
                response.status === 401 ||
                response.status === 403
            ){
                const text =
                    await safeReadText(response);

                const error =
                    new Error(
                        "Copernicus product download authentication failed."
                    );

                error.code = "CDSE_AUTH";
                error.status = response.status;
                error.details = text.slice(0,300);

                throw error;
            }

            if(
                response.status >= 500
            ){
                const text =
                    await safeReadText(response);

                lastError =
                    new Error(
                        "Copernicus latest measurement download failed (" +
                        response.status +
                        "): " +
                        text.slice(0,300)
                    );

                continue;
            }

            if(
                !response.ok &&
                response.status !== 206
            ){
                const text =
                    await safeReadText(response);

                lastError =
                    new Error(
                        "Copernicus latest measurement request failed (" +
                        response.status +
                        "): " +
                        text.slice(0,300)
                    );

                continue;
            }

            const contentType =
                String(
                    response.headers.get("content-type") || ""
                ).toLowerCase();

            const contentRange =
                String(
                    response.headers.get("content-range") || ""
                );

            const contentLength =
                Number(
                    response.headers.get("content-length") || 0
                );

            if(
                response.status === 200 &&
                contentLength > 0 &&
                contentLength > 2 * 1024 * 1024
            ){
                lastError =
                    new Error(
                        "Copernicus product endpoint ignored the Range request for a large product."
                    );
                continue;
            }

            const bytes =
                new Uint8Array(
                    await response.arrayBuffer()
                );

            if(
                !bytes.length
            ){
                return {
                    latest: null,
                    retryWithLargerRange: true
                };
            }

            if(
                !(
                    contentType.includes("json") ||
                    contentType.includes("geo+json") ||
                    looksLikeJson(bytes)
                )
            ){
                lastError =
                    new Error(
                        "Copernicus water-level product is not returned as a JSON/GeoJSON payload."
                    );
                continue;
            }

            const text =
                new TextDecoder().decode(
                    bytes
                );

            const latest =
                extractLatestMeasurementFromTail(
                    text
                );

            if(latest){
                return {
                    latest,
                    retryWithLargerRange: false
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

            return {
                latest: null,
                retryWithLargerRange: false
            };

        }
        catch(error){

            if(
                error &&
                error.code === "CDSE_AUTH"
            ){
                throw error;
            }

            lastError = error;
        }

    }

    if(lastError){
        throw lastError;
    }

    throw new Error(
        "Copernicus water-level product could not be downloaded."
    );

}


function extractLatestMeasurementFromTail(
    text
) {

    const source =
        String(
            text || ""
        );

    if(!source){
        return null;
    }

    /*
     * CLMS water-level measurement objects are flat JSON objects.
     * Extract complete objects that contain the current height
     * field, then use the last one in the tail.
     */
    const pattern =
        /\{[^{}]*(?:"water_surface_height_above_reference_datum"|"WaterSurfaceHeightAboveReferenceDatum")\s*:\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)[^{}]*\}/gi;

    let match = null;
    let candidate = null;

    while(
        (match = pattern.exec(source)) !== null
    ){
        candidate = match;
    }

    if(
        !candidate
    ){
        return null;
    }

    const objectText =
        candidate[0];

    let object = null;

    try{
        object =
            JSON.parse(
                objectText
            );
    }
    catch(error){
        /*
         * Fall back to key-level extraction for JSON fragments
         * that contain escaped/unusual formatting.
         */
    }

    if(object){
        const normalized =
            normalizeMeasurement(object);

        if(
            Number.isFinite(normalized.height) &&
            normalized.datetime
        ){
            return normalized;
        }
    }

    const height =
        numberOrNull(
            candidate[1]
        );

    const datetimeMatch =
        objectText.match(
            /["'](?:Datetime|datetime|DateTime|dateTime|timestamp)["']\s*:\s*["']([^"']+)["']/
        );

    const uncertaintyMatch =
        objectText.match(
            /["'](?:water_surface_height_uncertainty|associated_uncertainty|uncertainty)["']\s*:\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/i
        );

    if(
        !Number.isFinite(height) ||
        !datetimeMatch
    ){
        return null;
    }

    return {
        identifier: "",
        time: null,
        datetime:
            datetimeMatch[1],
        height,
        uncertainty:
            uncertaintyMatch
                ? numberOrNull(uncertaintyMatch[1])
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

                throw new Error(
                    "Copernicus authentication failed."
                );

            }

            const data =
                await response.json();

            if (
                !data ||
                !data.access_token
            ) {

                throw new Error(
                    "Copernicus authentication returned no access token."
                );

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
        await fetchWithTimeout(
            productUrl,
            {
                headers: {
                    "Authorization":
                        "Bearer " +
                        accessToken,
                    "Accept":
                        "application/geo+json,application/json,application/zip,*/*"
                },
                redirect:
                    "follow"
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
                bytes
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

    function collectMeasurementData(value){
        if(!value) return;

        if(Array.isArray(value)){
            value.forEach(function(item){
                if(item && typeof item === "object"){
                    rawMeasurements.push(item);
                }
            });
            return;
        }

        if(
            value &&
            typeof value === "object"
        ){
            if(Array.isArray(value.data)){
                collectMeasurementData(value.data);
            }
            if(Array.isArray(value.Data)){
                collectMeasurementData(value.Data);
            }
            if(Array.isArray(value.measurements)){
                collectMeasurementData(value.measurements);
            }
            if(Array.isArray(value.Measurements)){
                collectMeasurementData(value.Measurements);
            }
        }
    }

    featureList.forEach(function(item){
        collectMeasurementData(item);
    });

    collectMeasurementData(payload && payload.data);
    collectMeasurementData(payload && payload.Data);
    collectMeasurementData(payload && payload.measurements);
    collectMeasurementData(payload && payload.Measurements);

    const measurements =
        rawMeasurements
            .map(
                normalizeMeasurement
            )
            .filter(
                function(item) {
                    return (
                        Number.isFinite(item.height) &&
                        item.datetime
                    );
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
                item.identifier,
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
                item.satellite,
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
    bytes
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

    if (endRecord >= 0) {

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

        for (
            let index = 0;
            index < entries &&
            offset + 46 <= bytes.length;
            index++
        ) {

            if (
                view.getUint32(
                    offset,
                    true
                ) !== 0x02014b50
            ) {

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
                        localHeaderOffset
                    }
                );

            }

            offset +=
                46 +
                nameLength +
                extraLength +
                commentLength;

        }

    }

    return await extractFirstLocalJson(
        bytes,
        view
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
