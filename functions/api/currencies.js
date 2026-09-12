/* =========================================================
   CURRENCIES API
   Stable version:
   - Loads full currency list
   - Loads current rates
   - Fills missing current rates with explicit quotes
   - Loads previous rates
   - Fills missing previous rates
   - Keeps Major currency history
   - Supports EUR base and other requested bases
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
   HELPERS
========================================================= */

function getUTCDate(date) {

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}


function isValidRate(item, today = null) {

    if (!item) {
        return false;
    }

    if (!item.quote) {
        return false;
    }

    if (!item.date) {
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
   KEEP LATEST ROW FOR EACH QUOTE
========================================================= */

function latestByQuote(rows, today) {

    const result = {};

    if (!Array.isArray(rows)) {
        return result;
    }

    for (const item of rows) {

        if (!isValidRate(item, today)) {
            continue;
        }

        const quote = item.quote;

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
   GET LAST TWO OBSERVATIONS FOR EACH QUOTE
========================================================= */

function previousByQuote(rows, today) {

    const grouped = {};

    if (!Array.isArray(rows)) {
        return {};
    }

    for (const item of rows) {

        if (!isValidRate(item, today)) {
            continue;
        }

        const quote = item.quote;

        if (!grouped[quote]) {
            grouped[quote] = [];
        }

        grouped[quote].push(item);

    }


    const result = {};

    for (const quote of Object.keys(grouped)) {

        const rowsForQuote =
            grouped[quote]
                .sort(
                    (a, b) =>
                        a.date.localeCompare(b.date)
                );


        if (rowsForQuote.length >= 2) {

            result[quote] =
                rowsForQuote[
                    rowsForQuote.length - 2
                ];

        }

    }

    return result;
}


/* =========================================================
   FETCH EXPLICIT QUOTE BATCHES
========================================================= */

async function fetchQuoteBatches(
    base,
    quotes,
    options = {}
) {

    const {
        from = null,
        to = null
    } = options;


    const cleanQuotes =
        [
            ...new Set(
                quotes
                    .map(code =>
                        String(code || "")
                            .trim()
                            .toUpperCase()
                    )
                    .filter(Boolean)
                    .filter(
                        code =>
                            code !== base &&
                            !EXCLUDED_CURRENCY_CODES.has(code)
                    )
            )
        ];


    if (!cleanQuotes.length) {
        return [];
    }


    const results = [];

    /* -----------------------------------------------------
       Keep requests reasonably sized.
    ----------------------------------------------------- */

    const chunkSize = 40;


    for (
        let i = 0;
        i < cleanQuotes.length;
        i += chunkSize
    ) {

        const chunk =
            cleanQuotes.slice(
                i,
                i + chunkSize
            );


        const params =
            new URLSearchParams();

        params.set("base", base);
        params.set(
            "quotes",
            chunk.join(",")
        );


        if (from) {
            params.set("from", from);
        }

        if (to) {
            params.set("to", to);
        }


        try {

            const response =
                await fetch(
                    `${FRANKFURTER_API}/rates?${params.toString()}`
                );


            if (!response.ok) {
                continue;
            }


            const data =
                await response.json();


            if (Array.isArray(data)) {

                results.push(...data);

            }

        } catch (error) {

            console.warn(
                "Frankfurter quote batch failed:",
                chunk,
                error
            );

        }

    }


    return results;
}


/* =========================================================
   FETCH SINGLE RATE FALLBACK
========================================================= */

async function fetchSingleRate(
    base,
    quote
) {

    try {

        const response =
            await fetch(
                `${FRANKFURTER_API}/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`
            );


        if (!response.ok) {
            return null;
        }


        const data =
            await response.json();


        if (
            data &&
            data.quote &&
            Number.isFinite(
                Number(data.rate)
            )
        ) {

            return data;

        }

    } catch (error) {

        console.warn(
            `Single rate failed: ${base}/${quote}`,
            error
        );

    }


    return null;
}


/* =========================================================
   FILL MISSING QUOTES
========================================================= */

async function fillMissingQuotes(
    base,
    requiredQuotes,
    existingRows,
    options = {}
) {

    const existingQuotes =
        new Set(
            existingRows
                .map(item => item?.quote)
                .filter(Boolean)
        );


    const missingQuotes =
        requiredQuotes.filter(
            quote =>
                !existingQuotes.has(quote)
        );


    if (!missingQuotes.length) {
        return existingRows;
    }


    /* -----------------------------------------------------
       FIRST:
       Request all missing currencies in batches.
    ----------------------------------------------------- */

    const batchRows =
        await fetchQuoteBatches(
            base,
            missingQuotes,
            options
        );


    const merged = [
        ...existingRows,
        ...batchRows
    ];


    const mergedQuotes =
        new Set(
            merged
                .map(item => item?.quote)
                .filter(Boolean)
        );


    /* -----------------------------------------------------
       SECOND:
       Try single-pair endpoint for anything still missing.
    ----------------------------------------------------- */

    const stillMissing =
        missingQuotes.filter(
            quote =>
                !mergedQuotes.has(quote)
        );


    for (const quote of stillMissing) {

        const single =
            await fetchSingleRate(
                base,
                quote
            );


        if (single) {

            merged.push(single);

        }

    }


    return merged;
}


/* =========================================================
   FETCH HISTORICAL RANGE
========================================================= */

async function fetchHistorical(
    base,
    from,
    to
) {

    try {

        const params =
            new URLSearchParams();

        params.set("base", base);
        params.set("from", from);
        params.set("to", to);


        const response =
            await fetch(
                `${FRANKFURTER_API}/rates?${params.toString()}`
            );


        if (!response.ok) {
            return [];
        }


        const data =
            await response.json();


        return Array.isArray(data)
            ? data
            : [];

    } catch (error) {

        console.warn(
            "Historical rates failed:",
            error
        );

        return [];

    }

}


/* =========================================================
   MAIN API
========================================================= */

export async function onRequest(context) {

    try {

        const url =
            new URL(
                context.request.url
            );


        const base =
            (
                url.searchParams.get("base") ||
                "EUR"
            )
                .toUpperCase();


        /* =====================================================
           DATES
        ===================================================== */

        const now =
            new Date();


        const today =
            getUTCDate(now);


        const historicalFromDate =
            new Date(now);


        historicalFromDate.setUTCDate(
            historicalFromDate.getUTCDate() - 45
        );


        const fromDate =
            getUTCDate(
                historicalFromDate
            );


        /* =====================================================
           CURRENCY LIST
        ===================================================== */

        const currenciesResponse =
            await fetch(
                `${FRANKFURTER_API}/currencies`
            );


        if (!currenciesResponse.ok) {

            throw new Error(
                `Currencies error: ${currenciesResponse.status}`
            );

        }


        const currencies =
            await currenciesResponse.json();


        /* =====================================================
           AVAILABLE FIAT CURRENCY CODES
        ===================================================== */

        const currencyCodes =
            Object.keys(
                currencies || {}
            )
                .map(code =>
                    String(code)
                        .toUpperCase()
                )
                .filter(
                    code =>
                        code &&
                        !EXCLUDED_CURRENCY_CODES.has(code)
                )
                .filter(
                    code =>
                        code !== base
                );


        /* =====================================================
           CURRENT BROAD REQUEST
        ===================================================== */

        const ratesResponse =
           await fetch(
               `${FRANKFURTER_API}/rates?base=${encodeURIComponent(base)}`
      );


        let broadRates = [];


        if (ratesResponse.ok) {

            const result =
                await ratesResponse.json();


            if (Array.isArray(result)) {

                broadRates = result;

            }

        }


        /* =====================================================
           CURRENT RATES
           Take latest valid observation per quote.
        ===================================================== */

        let currentRateRows =
            Object.values(
                latestByQuote(
                    broadRates,
                    today
                )
            );


        /* =====================================================
           FILL ALL MISSING CURRENT RATES
        ===================================================== */

        currentRateRows =
            await fillMissingQuotes(
                base,
                currencyCodes,
                currentRateRows,
                {
                    from: null,
                    to: null
                }
            );


        /* =====================================================
           NORMALIZE CURRENT RATES
        ===================================================== */

        const currentLatestMap =
            latestByQuote(
                currentRateRows,
                today
            );


        const currentRates =
            Object.values(
                currentLatestMap
            );


        /* =====================================================
           HISTORICAL DATA
        ===================================================== */

        const historicalRates =
            await fetchHistorical(
                base,
                fromDate,
                today
            );


        /* =====================================================
           MAJOR CURRENCIES
           Use historical data for accurate movement.
        ===================================================== */

        const majorRates = {};
        const majorPreviousRates = {};


        for (const quote of MAJOR_QUOTES) {

            if (quote === base) {
                continue;
            }


            const rows =
                historicalRates
                    .filter(
                        item =>
                            item?.quote === quote &&
                            isValidRate(item, today)
                    )
                    .sort(
                        (a, b) =>
                            a.date.localeCompare(
                                b.date
                            )
                    );


            if (!rows.length) {
                continue;
            }


            majorRates[quote] =
                rows[
                    rows.length - 1
                ];


            if (rows.length >= 2) {

                majorPreviousRates[quote] =
                    rows[
                        rows.length - 2
                    ];

            }

        }


        /* =====================================================
           NORMAL HISTORICAL LATEST/PREVIOUS PER QUOTE
        ===================================================== */

        const historicalPreviousMap =
            previousByQuote(
                historicalRates,
                today
            );


        /* =====================================================
           FILL MISSING PREVIOUS RATES
           
           Historical batch may not contain every quote.
           For the missing ones, request a shorter historical
           window explicitly.
        ===================================================== */

        const previousMissingQuotes =
            currencyCodes.filter(
                quote =>
                    !historicalPreviousMap[quote]
            );


        let fallbackPreviousRows = [];


        if (previousMissingQuotes.length) {

            const fallbackHistoricalDate =
                new Date(now);


            fallbackHistoricalDate.setUTCDate(
                fallbackHistoricalDate.getUTCDate() - 10
            );


            const fallbackFromDate =
                getUTCDate(
                    fallbackHistoricalDate
                );


            fallbackPreviousRows =
                await fetchQuoteBatches(
                    base,
                    previousMissingQuotes,
                    {
                        from: fallbackFromDate,
                        to: today
                    }
                );

        }


        const combinedHistoricalRows = [
            ...historicalRates,
            ...fallbackPreviousRows
        ];


        /* =====================================================
           NORMAL CURRENT + PREVIOUS
        ===================================================== */

        const normalizedHistoricalLatest =
            latestByQuote(
                combinedHistoricalRows,
                today
            );


        const normalizedHistoricalPrevious =
            previousByQuote(
                combinedHistoricalRows,
                today
            );


        /* =====================================================
           PREVIOUS RATES ARRAY
        ===================================================== */

        const previousRates =
            Object.values(
                normalizedHistoricalPrevious
            );


        /* =====================================================
           CURRENT DATE
        ===================================================== */

        const allCurrentDates =
            currentRates
                .map(item => item?.date)
                .filter(
                    date =>
                        date &&
                        date <= today
                )
                .sort();


        const currentDate =
            allCurrentDates.length
                ? allCurrentDates[
                    allCurrentDates.length - 1
                ]
                : null;


        /* =====================================================
           PREVIOUS DATE
        ===================================================== */

        const allHistoricalDates =
            combinedHistoricalRows
                .map(item => item?.date)
                .filter(
                    date =>
                        date &&
                        date <= today
                )
                .filter(
                    (value, index, array) =>
                        array.indexOf(value) === index
                )
                .sort();


        const previousDate =
            allHistoricalDates.length >= 2
                ? allHistoricalDates[
                    allHistoricalDates.length - 2
                ]
                : null;


        /* =====================================================
           RESPONSE
        ===================================================== */

        return new Response(

            JSON.stringify({

                base,

                currencies,

                rates:
                    currentRates,

                previousRates,

                date:
                    currentDate,

                previousDate,

                majorRates,

                majorPreviousRates

            }),

            {
                headers: {

                    "Content-Type":
                        "application/json",

                    "Cache-Control":
                        "public, max-age=300",

                    "Access-Control-Allow-Origin":
                        "*"

                }

            }

        );

    } catch (error) {

        console.error(
            "Currencies API failed:",
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

                    "Access-Control-Allow-Origin":
                        "*"

                }

            }

        );

    }

}
