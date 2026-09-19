/*
 * =========================================================
 * WORTH IT — WEATHER API
 * Visual Crossing Weather API
 *
 * Cloudflare Function
 *
 * Frontend endpoint:
 *   /api/weather?latitude=...&longitude=...
 *
 * Environment Secret:
 *   VISUAL_CROSSING_API_KEY
 *
 * This backend is intentionally matched to the current
 * weather-ui.js frontend.
 * =========================================================
 */

const VISUAL_CROSSING_BASE =
    "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";


/* =========================================================
   MAIN GET HANDLER
========================================================= */

export async function onRequestGet(context) {

    try {

        const url =
            new URL(context.request.url);


        const latitude =
            Number(
                url.searchParams.get("latitude")
            );


        const longitude =
            Number(
                url.searchParams.get("longitude")
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
            context.env.VISUAL_CROSSING_API_KEY;


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
           LOCATION

           Visual Crossing accepts latitude,longitude directly.
        ================================================= */

        const location =
            `${latitude},${longitude}`;


        /* =================================================
           VISUAL CROSSING REQUEST

           This matches the fields consumed by the current
           weather-ui.js file.
        ================================================= */

        const params =
            new URLSearchParams({

                unitGroup:
                    "metric",

                include:
                    "current,days",

                elements:
                    [
                        "datetime",
                        "temp",
                        "tempmax",
                        "tempmin",
                        "feelslike",
                        "humidity",
                        "windspeed",
                        "winddir",
                        "conditions",
                        "icon",
                        "precipprob",
                        "sunrise",
                        "sunset"
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
           FETCH VISUAL CROSSING
        ================================================= */

        const response =
            await fetch(
                apiUrl,
                {
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        if (!response.ok) {

            const errorText =
                await response.text();


            console.error(
                "Visual Crossing error:",
                response.status,
                errorText
            );


            return jsonResponse(
                {
                    error:
                        "Weather service request failed.",
                    status:
                        response.status
                },
                502
            );

        }


        const data =
            await response.json();


        /* =================================================
           VALIDATE UPSTREAM RESPONSE
        ================================================= */

        if (
            !data ||
            !data.currentConditions ||
            !Array.isArray(data.days)
        ) {

            console.error(
                "Invalid Visual Crossing response."
            );


            return jsonResponse(
                {
                    error:
                        "Invalid weather data received."
                },
                502
            );

        }


        /* =================================================
           CURRENT CONDITIONS
        ================================================= */

        const current =
            data.currentConditions;


        /* =================================================
           DAILY FORECAST

           Visual Crossing can return the available forecast
           horizon (up to 15 days on the applicable free plan).
           We preserve all returned daily records so the frontend
           can later use 14 days without another API change.
        ================================================= */

        const days =
            data.days
                .slice(0, 15)
                .map(
                    day => ({

                        datetime:
                            day.datetime ?? null,

                        temp:
                            numberOrNull(day.temp),

                        tempmax:
                            numberOrNull(day.tempmax),

                        tempmin:
                            numberOrNull(day.tempmin),

                        feelslike:
                            numberOrNull(day.feelslike),

                        humidity:
                            numberOrNull(day.humidity),

                        windspeed:
                            numberOrNull(day.windspeed),

                        winddir:
                            numberOrNull(day.winddir),

                        conditions:
                            stringOrEmpty(day.conditions),

                        icon:
                            stringOrEmpty(day.icon),

                        precipprob:
                            numberOrNull(day.precipprob),

                        sunrise:
                            stringOrNull(day.sunrise),

                        sunset:
                            stringOrNull(day.sunset)

                    })
                );


        /* =================================================
           RESPONSE

           This structure is intentionally aligned with the
           current weather-ui.js code:

             data.resolvedAddress
             data.timezone
             data.currentConditions.*
             data.days[*].*
        ================================================= */

        const result = {

            latitude:
                numberOrNull(data.latitude),

            longitude:
                numberOrNull(data.longitude),

            resolvedAddress:
                stringOrEmpty(data.resolvedAddress),

            timezone:
                stringOrEmpty(data.timezone),

            currentConditions: {

                datetime:
                    stringOrNull(current.datetime),

                temp:
                    numberOrNull(current.temp),

                feelslike:
                    numberOrNull(current.feelslike),

                humidity:
                    numberOrNull(current.humidity),

                windspeed:
                    numberOrNull(current.windspeed),

                winddir:
                    numberOrNull(current.winddir),

                conditions:
                    stringOrEmpty(current.conditions),

                icon:
                    stringOrEmpty(current.icon),

                precipprob:
                    numberOrNull(current.precipprob)

            },

            days,

            attribution: {

                text:
                    "Weather Data Provided by Visual Crossing",

                url:
                    "https://www.visualcrossing.com/"

            }

        };


        /* =================================================
           CACHE

           10 minutes in browsers/CDN caches.
        ================================================= */

        return jsonResponse(
            result,
            200,
            {
                "Cache-Control":
                    "public, max-age=600, s-maxage=600"
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
   HELPERS
========================================================= */

function numberOrNull(value) {

    const number =
        Number(value);


    return Number.isFinite(number)
        ? number
        : null;

}


function stringOrNull(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }


    const text =
        String(value).trim();


    return text
        ? text
        : null;

}


function stringOrEmpty(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }


    return String(value).trim();

}


function jsonResponse(
    data,
    status = 200,
    extraHeaders = {}
) {

    return new Response(
        JSON.stringify(data),
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
