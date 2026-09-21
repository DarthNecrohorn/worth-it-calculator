import { recordAdminApiUsage } from "../lib/admin-usage.js";

/*
 * =========================================================
 * WORTH IT — WEATHER API
 * Visual Crossing Weather API
 *
 * Cloudflare Function
 *
 * Frontend endpoint:
 *   /api/weather?latitude=...&longitude=...&lang=...
 *
 * Environment Secret:
 *   VISUAL_CROSSING_API_KEY
 *
 * Server-side cache:
 *   Fresh cache: 4 hours
 *   Stale fallback cache: 24 hours
 *
 * This backend is matched to the current
 * weather-ui.js frontend.
 * =========================================================
 */


const VISUAL_CROSSING_BASE =
    "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";


/* =========================================================
   CACHE CONFIGURATION
========================================================= */

/*
 * Fresh weather data remains valid for 4 hours.
 */
const WEATHER_CACHE_TTL_SECONDS =
    4 * 60 * 60;


/*
 * Stale fallback is retained for 24 hours.
 *
 * This does NOT delay normal updates.
 * It is used only when a fresh upstream request fails.
 */
const WEATHER_STALE_CACHE_TTL_SECONDS =
    24 * 60 * 60;


/*
 * Coordinates are rounded before becoming part of the
 * cache key.
 *
 * 2 decimal places provide strong cache reuse while still
 * keeping weather results reasonably location-specific.
 */
const WEATHER_CACHE_COORDINATE_DECIMALS =
    2;


/*
 * Bump this whenever the response structure changes.
 *
 * v4 adds:
 *
 *   - precipcover
 *   - moonphase
 *
 * This automatically prevents old v3 cache entries from
 * being reused after deployment.
 */
const WEATHER_CACHE_VERSION =
    "v4";


/* =========================================================
   SUPPORTED LANGUAGES
========================================================= */

const SUPPORTED_WEATHER_LANGUAGES = new Set([

    "ar",
    "bg",
    "cs",
    "da",
    "de",
    "el",
    "en",
    "es",
    "fa",
    "fi",
    "fr",
    "he",
    "hu",
    "it",
    "ja",
    "ko",
    "nl",
    "pl",
    "pt",
    "ru",
    "sk",
    "sr",
    "sv",
    "tr",
    "uk",
    "vi",
    "zh"

]);


/* =========================================================
   IN-FLIGHT REQUEST DEDUPLICATION
========================================================= */

/*
 * When multiple identical requests arrive while this
 * Worker runtime is warm, reuse the same upstream promise.
 *
 * This is an additional protection layer.
 * Cloudflare Cache remains the primary server-side cache.
 */
const inFlightWeatherRequests =
    new Map();


/* =========================================================
   MAIN GET HANDLER
========================================================= */

export async function onRequestGet(context) {

    recordAdminApiUsage(context, {
        apiKey: "weather",
        provider: "Visual Crossing"
    });

    try {

        const url =
            new URL(
                context.request.url
            );


        /* =================================================
           COORDINATES
        ================================================= */

        const latitude =
            Number(
                url.searchParams.get(
                    "latitude"
                )
            );


        const longitude =
            Number(
                url.searchParams.get(
                    "longitude"
                )
            );


        /* =================================================
           VALIDATE COORDINATES
        ================================================= */

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {

            return jsonResponse(
                {
                    error:
                        "Valid latitude and longitude are required."
                },
                400
            );

        }


        if (
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {

            return jsonResponse(
                {
                    error:
                        "Latitude or longitude is out of range."
                },
                400
            );

        }


        /* =================================================
           API KEY
        ================================================= */

        const apiKey =
            context.env
                .VISUAL_CROSSING_API_KEY;


        if (!apiKey) {

            console.error(
                "VISUAL_CROSSING_API_KEY is not configured."
            );


            return jsonResponse(
                {
                    error:
                        "Weather service is not configured."
                },
                500
            );

        }


        /* =================================================
           LANGUAGE
        ================================================= */

        const requestedLanguage =
            normalizeWeatherLanguage(
                url.searchParams.get(
                    "lang"
                )
            );


        /*
         * Default to English when the browser language is
         * not one of the supported Visual Crossing languages.
         */
        const language =
            requestedLanguage ||
            "en";


        /* =================================================
           NORMALIZED CACHE COORDINATES
        ================================================= */

        const cacheLatitude =
            roundCoordinate(
                latitude
            );


        const cacheLongitude =
            roundCoordinate(
                longitude
            );


        /* =================================================
           CACHE KEYS
        ================================================= */

        const cacheKeyId =
            createWeatherCacheKeyId(

                cacheLatitude,

                cacheLongitude,

                language

            );


        const freshCacheKey =
            createCacheRequest(

                context.request.url,

                `fresh/${cacheKeyId}`

            );


        const staleCacheKey =
            createCacheRequest(

                context.request.url,

                `stale/${cacheKeyId}`

            );


        const cache =
            caches.default;


        /* =================================================
           1. FRESH CACHE LOOKUP
        ================================================= */

        const cachedResponse =
            await cache.match(
                freshCacheKey
            );


        if (cachedResponse) {

            return responseWithHeaders(

                cachedResponse,

                {

                    "X-Weather-Cache":
                        "HIT",

                    "X-Weather-Cache-TTL":
                        `${WEATHER_CACHE_TTL_SECONDS}s`

                }

            );

        }


        /* =================================================
           2. IN-FLIGHT DEDUPLICATION
        ================================================= */

        const inFlightKey =
            cacheKeyId;


        let weatherResult;


        if (
            inFlightWeatherRequests.has(
                inFlightKey
            )
        ) {

            weatherResult =
                await inFlightWeatherRequests.get(
                    inFlightKey
                );

        }
        else {

            const requestPromise =
                fetchFreshWeatherData({

                    latitude,

                    longitude,

                    language,

                    apiKey

                });


            inFlightWeatherRequests.set(

                inFlightKey,

                requestPromise

            );


            try {

                weatherResult =
                    await requestPromise;

            }
            finally {

                inFlightWeatherRequests.delete(
                    inFlightKey
                );

            }

        }


        /* =================================================
           3. UPSTREAM SUCCESS
        ================================================= */

        if (
            weatherResult &&
            weatherResult.result
        ) {

            const response =
                jsonResponse(

                    weatherResult.result,

                    200,

                    {

                        /*
                         * Browser freshness:
                         * 4 hours.
                         */
                        "Cache-Control":
                            `public, max-age=${WEATHER_CACHE_TTL_SECONDS}`,

                        /*
                         * CDN / Cloudflare cache freshness:
                         * 4 hours.
                         */
                        "CDN-Cache-Control":
                            `public, max-age=${WEATHER_CACHE_TTL_SECONDS}`,

                        /*
                         * Useful for debugging cache behavior.
                         */
                        "X-Weather-Cache":
                            "MISS-ORIGIN"

                    }

                );


            const staleResponse =
                cloneResponseWithHeaders(

                    response.clone(),

                    {

                        "Cache-Control":
                            `public, max-age=${WEATHER_STALE_CACHE_TTL_SECONDS}`,

                        "CDN-Cache-Control":
                            `public, max-age=${WEATHER_STALE_CACHE_TTL_SECONDS}`,

                        "X-Weather-Cache":
                            "STALE-BACKUP"

                    }

                );


            /*
             * Store the 4-hour fresh cache.
             */
            context.waitUntil(

                cache.put(

                    freshCacheKey,

                    response.clone()

                )

            );


            /*
             * Store an independent longer-lived backup cache.
             */
            context.waitUntil(

                cache.put(

                    staleCacheKey,

                    staleResponse.clone()

                )

            );


            return response;

        }


        /* =================================================
           4. STALE CACHE FALLBACK
        ================================================= */

        const staleCachedResponse =
            await cache.match(
                staleCacheKey
            );


        if (staleCachedResponse) {

            console.warn(
                "Visual Crossing unavailable. " +
                "Serving stale weather cache."
            );


            return responseWithHeaders(

                staleCachedResponse,

                {

                    /*
                     * Do not allow browsers to keep stale
                     * fallback data for another full 24 hours.
                     */
                    "Cache-Control":
                        "public, max-age=300",

                    "CDN-Cache-Control":
                        "public, max-age=300",

                    "X-Weather-Cache":
                        "STALE"

                }

            );

        }


        /* =================================================
           5. UPSTREAM FAILURE WITHOUT CACHE
        ================================================= */

        const upstreamStatus =
            weatherResult &&
            Number.isFinite(
                Number(
                    weatherResult.status
                )
            )
                ? Number(
                    weatherResult.status
                )
                : null;


        return jsonResponse(

            {

                error:
                    "Weather service request failed.",

                status:
                    upstreamStatus

            },

            502,

            {

                "Cache-Control":
                    "no-store",

                "X-Weather-Cache":
                    "MISS-ERROR"

            }

        );

    }
    catch (error) {

        console.error(
            "Weather function error:",
            error
        );


        return jsonResponse(

            {
                error:
                    "Weather service unavailable."
            },

            500

        );

    }

}


/* =========================================================
   FETCH FRESH WEATHER DATA
========================================================= */

async function fetchFreshWeatherData({

    latitude,

    longitude,

    language,

    apiKey

}) {

    try {

        /* =================================================
           LOCATION
        ================================================= */

        const location =
            `${latitude},${longitude}`;


        /* =================================================
           VISUAL CROSSING REQUEST
        ================================================= */

        const params =
            new URLSearchParams({

                unitGroup:
                    "metric",

                lang:
                    language,

                include:
                    "current,days",

                elements:
                    [

                        /*
                         * Daily date.
                         */
                        "datetime",

                        /*
                         * Temperatures.
                         */
                        "temp",
                        "tempmax",
                        "tempmin",

                        /*
                         * Feels like.
                         */
                        "feelslike",

                        /*
                         * Humidity.
                         */
                        "humidity",

                        /*
                         * Wind.
                         */
                        "windspeed",
                        "windgust",
                        "winddir",

                        /*
                         * Weather description.
                         */
                        "conditions",
                        "description",
                        "icon",

                        /*
                         * Precipitation.
                         */
                        "precipprob",
                        "precip",
                        "precipcover",
                        "preciptype",

                        /*
                         * Astronomy.
                         */
                        "sunrise",
                        "sunset",
                        "moonphase",

                        /*
                         * Additional detailed data.
                         */
                        "cloudcover",
                        "visibility",
                        "pressure",
                        "dew",
                        "uvindex",
                        "solarenergy"

                    ].join(","),

                iconSet:
                    "icons2",

                key:
                    apiKey,

                contentType:
                    "json"

            });


        const apiUrl =
            `${VISUAL_CROSSING_BASE}/` +
            `${encodeURIComponent(location)}` +
            `?${params.toString()}`;


        /* =================================================
           UPSTREAM REQUEST
        ================================================= */

        const response =
            await fetch(

                apiUrl,

                {

                    method:
                        "GET",

                    headers: {

                        "Accept":
                            "application/json"

                    }

                }

            );


        if (!response.ok) {

            const errorText =
                await safeReadText(
                    response
                );


            console.error(

                "Visual Crossing error:",

                response.status,

                errorText

            );


            return {

                result:
                    null,

                status:
                    response.status

            };

        }


        const data =
            await response.json();


        /* =================================================
           VALIDATE RESPONSE
        ================================================= */

        if (

            !data ||

            !data.currentConditions ||

            !Array.isArray(data.days) ||

            data.days.length === 0

        ) {

            console.error(
                "Invalid Visual Crossing response."
            );


            return {

                result:
                    null,

                status:
                    502

            };

        }


        /* =================================================
           CURRENT CONDITIONS
        ================================================= */

        const current =
            data.currentConditions;


        /* =================================================
           DAILY FORECAST
        ================================================= */

        const days =
            data.days

                /*
                 * Preserve up to 15 daily records.
                 */
                .slice(
                    0,
                    15
                )

                .map(

                    day => ({

                        datetime:
                            day.datetime ??
                            null,

                        datetimeEpoch:
                            numberOrNull(
                                day.datetimeEpoch
                            ),

                        temp:
                            numberOrNull(
                                day.temp
                            ),

                        tempmax:
                            numberOrNull(
                                day.tempmax
                            ),

                        tempmin:
                            numberOrNull(
                                day.tempmin
                            ),

                        feelslike:
                            numberOrNull(
                                day.feelslike
                            ),

                        humidity:
                            numberOrNull(
                                day.humidity
                            ),

                        windspeed:
                            numberOrNull(
                                day.windspeed
                            ),

                        windgust:
                            numberOrNull(
                                day.windgust
                            ),

                        winddir:
                            numberOrNull(
                                day.winddir
                            ),

                        conditions:
                            stringOrEmpty(
                                day.conditions
                            ),

                        description:
                            stringOrEmpty(
                                day.description
                            ),

                        icon:
                            stringOrEmpty(
                                day.icon
                            ),

                        precipprob:
                            numberOrNull(
                                day.precipprob
                            ),

                        precip:
                            numberOrNull(
                                day.precip
                            ),

                        precipcover:
                            numberOrNull(
                                day.precipcover
                            ),

                        preciptype:
                            normalizePrecipitationTypes(
                                day.preciptype
                            ),

                        sunrise:
                            stringOrNull(
                                day.sunrise
                            ),

                        sunset:
                            stringOrNull(
                                day.sunset
                            ),

                        moonphase:
                            numberOrNull(
                                day.moonphase
                            ),

                        cloudcover:
                            numberOrNull(
                                day.cloudcover
                            ),

                        visibility:
                            numberOrNull(
                                day.visibility
                            ),

                        pressure:
                            numberOrNull(
                                day.pressure
                            ),

                        dew:
                            numberOrNull(
                                day.dew
                            ),

                        uvindex:
                            numberOrNull(
                                day.uvindex
                            ),

                        solarenergy:
                            numberOrNull(
                                day.solarenergy
                            )

                    })

                );


        /* =================================================
           RESPONSE
        ================================================= */

        const result = {

            latitude:
                numberOrNull(
                    data.latitude
                ),

            longitude:
                numberOrNull(
                    data.longitude
                ),

            resolvedAddress:
                stringOrEmpty(
                    data.resolvedAddress
                ),

            address:
                stringOrEmpty(
                    data.address
                ),

            timezone:
                stringOrEmpty(
                    data.timezone
                ),

            tzoffset:
                numberOrNull(
                    data.tzoffset
                ),

            currentConditions: {

                datetime:
                    stringOrNull(
                        current.datetime
                    ),

                datetimeEpoch:
                    numberOrNull(
                        current.datetimeEpoch
                    ),

                temp:
                    numberOrNull(
                        current.temp
                    ),

                feelslike:
                    numberOrNull(
                        current.feelslike
                    ),

                humidity:
                    numberOrNull(
                        current.humidity
                    ),

                dew:
                    numberOrNull(
                        current.dew
                    ),

                windspeed:
                    numberOrNull(
                        current.windspeed
                    ),

                windgust:
                    numberOrNull(
                        current.windgust
                    ),

                winddir:
                    numberOrNull(
                        current.winddir
                    ),

                conditions:
                    stringOrEmpty(
                        current.conditions
                    ),

                description:
                    stringOrEmpty(
                        current.description
                    ),

                icon:
                    stringOrEmpty(
                        current.icon
                    ),

                precipprob:
                    numberOrNull(
                        current.precipprob
                    ),

                precip:
                    numberOrNull(
                        current.precip
                    ),

                cloudcover:
                    numberOrNull(
                        current.cloudcover
                    ),

                visibility:
                    numberOrNull(
                        current.visibility
                    ),

                pressure:
                    numberOrNull(
                        current.pressure
                    ),

                uvindex:
                    numberOrNull(
                        current.uvindex
                    ),

                solarenergy:
                    numberOrNull(
                        current.solarenergy
                    )

            },

            days,

            attribution: {

                text:
                    "Weather Data Provided by Visual Crossing",

                url:
                    "https://www.visualcrossing.com/"

            }

        };


        return {

            result,

            status:
                200

        };

    }
    catch (error) {

        console.error(

            "Visual Crossing fetch error:",

            error

        );


        return {

            result:
                null,

            status:
                502

        };

    }

}


/* =========================================================
   PRECIPITATION TYPES
========================================================= */

function normalizePrecipitationTypes(

    value

){

    if(
        !Array.isArray(value)
    ){

        return [];

    }


    return value

        .map(

            item =>
                String(
                    item || ""
                )
                .trim()
                .toLowerCase()

        )

        .filter(Boolean);

}


/* =========================================================
   CACHE KEY ID
========================================================= */

function createWeatherCacheKeyId(

    latitude,

    longitude,

    language

) {

    return [

        WEATHER_CACHE_VERSION,

        latitude.toFixed(
            WEATHER_CACHE_COORDINATE_DECIMALS
        ),

        longitude.toFixed(
            WEATHER_CACHE_COORDINATE_DECIMALS
        ),

        language

    ]

    .join("_")

    /*
     * Keep the key URL-safe.
     */
    .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
    );

}


/* =========================================================
   CREATE SYNTHETIC CACHE REQUEST
========================================================= */

function createCacheRequest(

    originalUrl,

    suffix

) {

    const original =
        new URL(
            originalUrl
        );


    const cacheUrl =
        new URL(

            `${original.origin}/__worth_it_weather_cache/${suffix}`

        );


    return new Request(

        cacheUrl.toString(),

        {

            method:
                "GET"

        }

    );

}


/* =========================================================
   COORDINATE ROUNDING
========================================================= */

function roundCoordinate(

    value

) {

    return Number(

        Number(value).toFixed(

            WEATHER_CACHE_COORDINATE_DECIMALS

        )

    );

}


/* =========================================================
   LANGUAGE NORMALIZATION
========================================================= */

function normalizeWeatherLanguage(

    value

) {

    const raw =
        String(
            value || ""
        )
        .trim()
        .toLowerCase();


    if(!raw){
        return "";
    }


    /*
     * Convert values such as:
     *
     * sr-RS -> sr
     * en-US -> en
     * de-DE -> de
     */
    const language =
        raw.split("-")[0];


    return SUPPORTED_WEATHER_LANGUAGES
        .has(language)

        ? language

        : "";

}


/* =========================================================
   SAFE TEXT READ
========================================================= */

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
   NUMBER HELPER
========================================================= */

function numberOrNull(

    value

) {

    const number =
        Number(value);


    return Number.isFinite(number)

        ? number

        : null;

}


/* =========================================================
   STRING OR NULL
========================================================= */

function stringOrNull(

    value

) {

    if (

        value === null ||

        value === undefined

    ) {

        return null;

    }


    const text =
        String(
            value
        )
        .trim();


    return text

        ? text

        : null;

}


/* =========================================================
   STRING OR EMPTY
========================================================= */

function stringOrEmpty(

    value

) {

    if (

        value === null ||

        value === undefined

    ) {

        return "";

    }


    return String(
        value
    )
    .trim();

}


/* =========================================================
   RESPONSE BUILDER
========================================================= */

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


/* =========================================================
   RESPONSE HEADER CLONER
========================================================= */

function responseWithHeaders(

    response,

    extraHeaders = {}

) {

    return cloneResponseWithHeaders(

        response,

        extraHeaders

    );

}


/* =========================================================
   CLONE RESPONSE WITH NEW HEADERS
========================================================= */

function cloneResponseWithHeaders(

    response,

    extraHeaders = {}

) {

    const headers =
        new Headers(
            response.headers
        );


    Object.entries(
        extraHeaders
    )
    .forEach(

        ([key, value]) => {

            headers.set(
                key,
                String(value)
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

            headers

        }

    );

}
