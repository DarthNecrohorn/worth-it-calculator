/* =========================================================
   CURRENCIES API - Frankfurter v2
   Production version with 1-hour Cloudflare caching
========================================================= */

const FRANKFURTER_API = "https://api.frankfurter.dev/v2";

const EXCLUDED_CURRENCY_CODES = new Set([
    "XAG",
    "XAU",
    "XDR",
    "XPD",
    "XPT"
]);

const MAJOR_QUOTES = [
    "USD",
    "HKD",
    "SGD",
    "KRW",
    "ZAR",
    "NOK",
    "SEK",
    "CZK"
];

/* =========================================================
   DATE HELPER
========================================================= */

function getUTCDate(date) {
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}

/* =========================================================
   VALID RATE HELPER
========================================================= */

function isValidRate(item, today = null) {
    if (!item || !item.quote || !item.date) {
        return false;
    }

    if (!Number.isFinite(Number(item.rate))) {
        return false;
    }

    if (today && item.date > today) {
        return false;
    }

    return true;
}

/* =========================================================
   NORMALIZE FRANKFURTER RATES
========================================================= */

function normalizeRatesResponse(data, defaultBase = "EUR") {
    if (!data) return [];

    const results = [];

    /*
       Frankfurter v2 /rates returns:

       [
         {
           date: "2026-09-16",
           base: "EUR",
           quote: "USD",
           rate: 1.17
         }
       ]
    */

    if (Array.isArray(data)) {
        for (const item of data) {
            const quote = String(
                item?.quote ||
                item?.symbol ||
                item?.code ||
                ""
            ).trim().toUpperCase();

            const rate = Number(item?.rate ?? item?.value);

            if (!quote || !item?.date || !Number.isFinite(rate)) {
                continue;
            }

            results.push({
                base: String(item?.base || defaultBase).toUpperCase(),
                quote,
                code: quote,
                symbol: quote,
                rate,
                date: item.date
            });
        }

        return results;
    }

    /*
       Backward-compatible handling in case the provider
       ever returns an object-style response.
    */

    const base = String(
        data.base || defaultBase
    ).trim().toUpperCase();

    if (data.rates && typeof data.rates === "object") {
        const topDate = data.date || getUTCDate(new Date());

        for (const [key, value] of Object.entries(data.rates)) {
            if (value && typeof value === "object") {
                const rowDate = key;

                for (const [quote, rate] of Object.entries(value)) {
                    const q = quote.trim().toUpperCase();
                    const numericRate = Number(rate);

                    if (!Number.isFinite(numericRate)) continue;

                    results.push({
                        base,
                        quote: q,
                        code: q,
                        symbol: q,
                        rate: numericRate,
                        date: rowDate
                    });
                }
            } else {
                const q = key.trim().toUpperCase();
                const numericRate = Number(value);

                if (!Number.isFinite(numericRate)) continue;

                results.push({
                    base,
                    quote: q,
                    code: q,
                    symbol: q,
                    rate: numericRate,
                    date: topDate
                });
            }
        }
    }

    return results;
}

/* =========================================================
   LATEST RATE PER QUOTE
========================================================= */

function latestByQuote(rows, today = null) {
    const result = {};

    if (!Array.isArray(rows)) {
        return result;
    }

    for (const item of rows) {
        if (!isValidRate(item, today)) {
            continue;
        }

        const quote = String(item.quote)
            .trim()
            .toUpperCase();

        if (
            !result[quote] ||
            item.date > result[quote].date
        ) {
            result[quote] = item;
        }
    }

    return result;
}

/* =========================================================
   PREVIOUS RATE PER QUOTE
========================================================= */

function previousByQuote(rows, currentMap, today) {
    const grouped = {};

    if (!Array.isArray(rows)) {
        return {};
    }

    for (const item of rows) {
        if (!isValidRate(item, today)) {
            continue;
        }

        const quote = String(item.quote)
            .trim()
            .toUpperCase();

        if (!grouped[quote]) {
            grouped[quote] = [];
        }

        grouped[quote].push(item);
    }

    const result = {};

    for (const [quote, items] of Object.entries(grouped)) {
        const currentItem = currentMap[quote];

        if (!currentItem) {
            continue;
        }

        const currentDate = currentItem.date;

        const previousItems = items
            .filter(item => item.date < currentDate)
            .sort((a, b) =>
                a.date.localeCompare(b.date)
            );

        if (previousItems.length > 0) {
            result[quote] =
                previousItems[previousItems.length - 1];
        }
    }

    return result;
}

/* =========================================================
   FETCH HELPER
========================================================= */

async function safeFetchJson(url) {
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            cf: {
                cacheTtl: 3600,
                cacheEverything: true
            }
        });

        if (!response.ok) {
            console.warn(
                `Frankfurter request failed: ${response.status} ${response.statusText}`
            );

            return null;
        }

        return await response.json();

    } catch (error) {
        console.warn(
            `Frankfurter fetch failed for ${url}:`,
            error
        );

        return null;
    }
}

/* =========================================================
   CURRENCY METADATA
========================================================= */

function normalizeCurrencies(data) {
    const currencies = {};

    if (!data) {
        return currencies;
    }

    /*
       Frankfurter v2 /currencies returns:

       [
         {
           iso_code: "USD",
           name: "United States Dollar",
           ...
         }
       ]
    */

    if (Array.isArray(data)) {
        for (const item of data) {
            const code = String(
                item?.iso_code || ""
            ).trim().toUpperCase();

            const name = String(
                item?.name || code
            ).trim();

            if (!code) {
                continue;
            }

            if (EXCLUDED_CURRENCY_CODES.has(code)) {
                continue;
            }

            currencies[code] = name;
        }

        return currencies;
    }

    /*
       Backward-compatible object format.
    */

    if (typeof data === "object") {
        for (const [code, name] of Object.entries(data)) {
            const cleanCode = code
                .trim()
                .toUpperCase();

            if (EXCLUDED_CURRENCY_CODES.has(cleanCode)) {
                continue;
            }

            currencies[cleanCode] =
                typeof name === "string"
                    ? name
                    : cleanCode;
        }
    }

    return currencies;
}

/* =========================================================
   MAIN API HANDLER
========================================================= */

export async function onRequest(context) {

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept"
    };

    /* =====================================================
       CORS PREFLIGHT
    ===================================================== */

    if (context.request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }

    /* =====================================================
       ONLY GET
    ===================================================== */

    if (context.request.method !== "GET") {
        return new Response(
            JSON.stringify({
                error: "Method not allowed"
            }),
            {
                status: 405,
                headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders
                }
            }
        );
    }

    try {

        const url = new URL(
            context.request.url
        );

        const base = (
            url.searchParams.get("base") ||
            "EUR"
        )
            .trim()
            .toUpperCase();

        /* =================================================
           BASIC BASE VALIDATION
        ================================================= */

        if (
            !/^[A-Z]{3}$/.test(base) ||
            EXCLUDED_CURRENCY_CODES.has(base)
        ) {
            return new Response(
                JSON.stringify({
                    error: "Unsupported base currency"
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type":
                            "application/json",
                        ...corsHeaders
                    }
                }
            );
        }

        /* =================================================
           DATE RANGE

           30 days gives us enough room to find the
           previous working day even around weekends
           and holidays.
        ================================================= */

        const now = new Date();

        const today = getUTCDate(now);

        const historicalFromDate = new Date(
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() - 30
            )
        );

        const fromDate =
            getUTCDate(historicalFromDate);

        /* =================================================
           FETCH

           Only TWO requests:
           1. Currency metadata
           2. 30-day rates history

           The latest and previous rates are both
           calculated from the same rates response.
        ================================================= */

        const [
            currenciesRaw,
            historicalRaw
        ] = await Promise.all([

            safeFetchJson(
                `${FRANKFURTER_API}/currencies`
            ),

            safeFetchJson(
                `${FRANKFURTER_API}/rates` +
                `?base=${encodeURIComponent(base)}` +
                `&from=${fromDate}` +
                `&to=${today}`
            )

        ]);

        /* =================================================
           NORMALIZE
        ================================================= */

        const normalizedRates =
            normalizeRatesResponse(
                historicalRaw,
                base
            );

        if (!normalizedRates.length) {
            throw new Error(
                "Unable to retrieve current exchange rates."
            );
        }

        /* =================================================
           CURRENCIES
        ================================================= */

        const currencies =
            normalizeCurrencies(
                currenciesRaw
            );

        /*
           Fallback in case currency metadata fails.
        */

        if (Object.keys(currencies).length === 0) {
            for (const item of normalizedRates) {
                const quote =
                    String(item.quote)
                        .trim()
                        .toUpperCase();

                if (
                    !EXCLUDED_CURRENCY_CODES.has(
                        quote
                    )
                ) {
                    currencies[quote] = quote;
                }
            }
        }

        /* =================================================
           CURRENT + PREVIOUS
        ================================================= */

        const currentMap =
            latestByQuote(
                normalizedRates,
                today
            );

        const previousMap =
            previousByQuote(
                normalizedRates,
                currentMap,
                today
            );

        /* =================================================
           RATES OBJECTS
        ================================================= */

        const rates = {};
        const previousRates = {};

        const ratesList = [];
        const previousRatesList = [];

        for (
            const [quote, item]
            of Object.entries(currentMap)
        ) {

            if (
                EXCLUDED_CURRENCY_CODES.has(
                    quote
                )
            ) {
                continue;
            }

            rates[quote] =
                Number(item.rate);

            ratesList.push(item);
        }

        for (
            const [quote, item]
            of Object.entries(previousMap)
        ) {

            if (
                EXCLUDED_CURRENCY_CODES.has(
                    quote
                )
            ) {
                continue;
            }

            previousRates[quote] =
                Number(item.rate);

            previousRatesList.push(item);
        }

        /* =================================================
           MAJOR CURRENCIES
        ================================================= */

        const majorRates = {};
        const majorPreviousRates = {};

        for (const quote of MAJOR_QUOTES) {

            if (quote === base) {
                continue;
            }

            if (
                rates[quote] !== undefined
            ) {
                majorRates[quote] =
                    rates[quote];
            }

            if (
                previousRates[quote] !== undefined
            ) {
                majorPreviousRates[quote] =
                    previousRates[quote];
            }
        }

        /* =================================================
           DATES
        ================================================= */

        const currentDates = [
            ...new Set(
                ratesList.map(
                    item => item.date
                )
            )
        ].sort();

        const currentDate =
            currentDates.length
                ? currentDates[
                    currentDates.length - 1
                ]
                : today;

        const historicalDates = [
            ...new Set(
                normalizedRates.map(
                    item => item.date
                )
            )
        ].sort();

        const validPreviousDates =
            historicalDates.filter(
                date => date < currentDate
            );

        const previousDate =
            validPreviousDates.length
                ? validPreviousDates[
                    validPreviousDates.length - 1
                ]
                : null;

        /* =================================================
           RESPONSE
        ================================================= */

        const responseData = {
            base,

            currencies,

            rates,

            previousRates,

            ratesList,

            previousRatesList,

            date: currentDate,

            previousDate,

            majorRates,

            majorPreviousRates
        };

        return new Response(
            JSON.stringify(responseData),
            {
                status: 200,
                headers: {
                    "Content-Type":
                        "application/json",

                    "Cache-Control":
                        "public, max-age=3600, s-maxage=3600",

                    ...corsHeaders
                }
            }
        );

    } catch (error) {

        console.error(
            "Currencies API error:",
            error
        );

        return new Response(
            JSON.stringify({
                error:
                    "Failed to load currency data",

                message:
                    error?.message ||
                    "Unknown error"
            }),
            {
                status: 500,
                headers: {
                    "Content-Type":
                        "application/json",

                    "Cache-Control":
                        "no-store",

                    ...corsHeaders
                }
            }
        );
    }
}
