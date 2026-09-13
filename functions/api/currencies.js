/* =========================================================
   CURRENCIES API
   Stable version

   - Loads full currency list
   - Loads current EUR rates
   - Fills missing current rates
   - Uses direct pair lookup when needed
   - Keeps Major currency rates reliable
   - Loads historical data for movement %
   - Loads previous observation per currency
   - Ignores future dates
   - Excludes precious metals / SDR
========================================================= */

const FRANKFURTER_API =
    "https://api.frankfurter.dev/v2";


const EXCLUDED_CURRENCY_CODES =
    new Set([
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
   VALID RATE
========================================================= */

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

        const quote =
            String(item.quote)
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
   PREVIOUS OBSERVATION PER QUOTE
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

        const quote =
            String(item.quote)
                .trim()
                .toUpperCase();

        if (!grouped[quote]) {
            grouped[quote] = [];
        }

        grouped[quote].push(item);

    }

    const result = {};

    for (const quote of Object.keys(grouped)) {

        const rowsForQuote =
            grouped[quote].sort(
                (a, b) =>
                    a.date.localeCompare(b.date)
            );

        const uniqueDates = [
            ...new Set(
                rowsForQuote.map(
                    row => row.date
                )
            )
        ].sort();

        if (uniqueDates.length < 2) {
            continue;
        }

        const previousDate =
            uniqueDates[
                uniqueDates.length - 2
            ];

        const previousRow =
            rowsForQuote
                .filter(
                    row =>
                        row.date === previousDate
                )
                .at(-1);

        if (previousRow) {
            result[quote] = previousRow;
        }

    }

    return result;

}


/* =========================================================
   FETCH QUOTES IN BATCHES
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

    const cleanQuotes = [
        ...new Set(
            (quotes || [])
                .map(
                    code =>
                        String(code || "")
                            .trim()
                            .toUpperCase()
                )
                .filter(Boolean)
                .filter(
                    code =>
                        code !== base
                )
                .filter(
                    code =>
                        !EXCLUDED_CURRENCY_CODES.has(code)
                )
        )
    ];

    if (!cleanQuotes.length) {
        return [];
    }

    const results = [];

    /*
       Frankfurter accepts multiple quotes.
       Keep requests reasonably small.
    */
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
        params.set("quotes", chunk.join(","));

        if (from) {
            params.set("from", from);
        }

        if (to) {
            params.set("to", to);
        }

        try {

            const response =
                await fetch(
                    `${FRANKFURTER_API}/rates?${params.toString()}`,
                    {
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );

            if (!response.ok) {
                console.warn(
                    "Frankfurter batch HTTP error:",
                    response.status
                );
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
                error
            );

        }

    }

    return results;

}


/* =========================================================
   FETCH ONE CURRENT PAIR
========================================================= */

async function fetchSingleRate(base, quote) {

    try {

        const response =
            await fetch(
                `${FRANKFURTER_API}/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`,
                {
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (!response.ok) {
            return null;
        }

        const data =
            await response.json();

        if (
            data &&
            data.quote &&
            data.date &&
            Number.isFinite(Number(data.rate))
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
   FETCH MULTIPLE SINGLE CURRENT PAIRS
========================================================= */

async function fetchSingleRates(base, quotes) {

    const results = [];

    for (const quote of quotes) {

        const row =
            await fetchSingleRate(
                base,
                quote
            );

        if (row) {
            results.push(row);
        }

    }

    return results;

}


/* =========================================================
   FILL MISSING CURRENT RATES
========================================================= */

async function fillMissingCurrentRates(
    base,
    requiredQuotes,
    existingRows
) {

    const existingMap =
        latestByQuote(
            existingRows
        );

    const missingQuotes =
        requiredQuotes.filter(
            quote =>
                !existingMap[quote]
        );

    if (!missingQuotes.length) {
        return existingRows;
    }

    /*
       First try grouped requests.
    */

    const batchRows =
        await fetchQuoteBatches(
            base,
            missingQuotes
        );

    let merged = [
        ...existingRows,
        ...batchRows
    ];

    /*
       Then identify anything still missing.
    */

    const afterBatchMap =
        latestByQuote(
            merged
        );

    const stillMissing =
        missingQuotes.filter(
            quote =>
                !afterBatchMap[quote]
        );

    /*
       Finally try individual pair requests.
    */

    if (stillMissing.length) {

        const directRows =
            await fetchSingleRates(
                base,
                stillMissing
            );

        merged = [
            ...merged,
            ...directRows
        ];

    }

    return merged;

}


/* =========================================================
   FETCH HISTORICAL DATA
========================================================= */

async function fetchHistorical(
    base,
    from,
    to,
    quotes = null
) {

    try {

        const params =
            new URLSearchParams();

        params.set(
            "base",
            base
        );

        if (
            Array.isArray(quotes) &&
            quotes.length
        ) {
            params.set(
                "quotes",
                quotes.join(",")
            );
        }

        if (from) {
            params.set(
                "from",
                from
            );
        }

        if (to) {
            params.set(
                "to",
                to
            );
        }

        const response =
            await fetch(
                `${FRANKFURTER_API}/rates?${params.toString()}`,
                {
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (!response.ok) {

            console.warn(
                "Historical rates HTTP error:",
                response.status
            );

            return [];

        }

        const data =
            await response.json();

        if (!Array.isArray(data)) {

            console.warn(
                "Historical rates returned non-array:",
                data
            );

            return [];

        }

        return data.filter(
            item =>
                isValidRate(
                    item,
                    to
                )
        );

    } catch (error) {

        console.warn(
            "Historical rates failed:",
            error
        );

        return [];

    }

}


/* =========================================================
   FETCH PREVIOUS RATE BY DATE
========================================================= */

async function fetchPreviousRateByDate(
    base,
    quote,
    today,
    maxDaysBack = 14
) {

    const currentDate =
        new Date(
            `${today}T00:00:00Z`
        );

    for (
        let daysBack = 1;
        daysBack <= maxDaysBack;
        daysBack++
    ) {

        const testDate =
            new Date(currentDate);

        testDate.setUTCDate(
            testDate.getUTCDate() -
            daysBack
        );

        const date =
            getUTCDate(testDate);

        try {

            const params =
                new URLSearchParams();

            params.set(
                "base",
                base
            );

            params.set(
                "quotes",
                quote
            );

            params.set(
                "date",
                date
            );

            const response =
                await fetch(
                    `${FRANKFURTER_API}/rates?${params.toString()}`,
                    {
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );

            if (!response.ok) {
                continue;
            }

            const data =
                await response.json();

            if (!Array.isArray(data)) {
                continue;
            }

            const validRow =
                data.find(
                    row =>
                        isValidRate(
                            row,
                            today
                        ) &&
                        String(row.quote)
                            .trim()
                            .toUpperCase() ===
                        String(quote)
                            .trim()
                            .toUpperCase()
                );

            if (validRow) {
                return validRow;
            }

        } catch (error) {

            console.warn(
                `Previous rate failed: ${base}/${quote} ${date}`,
                error
            );

        }

    }

    return null;

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
                .trim()
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

        /*
           120 days gives enough historical coverage.
        */

        historicalFromDate.setUTCDate(
            historicalFromDate.getUTCDate() - 120
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
                `${FRANKFURTER_API}/currencies`,
                {
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (!currenciesResponse.ok) {

            throw new Error(
                `Currencies error: ${currenciesResponse.status}`
            );

        }

        const currencies =
            await currenciesResponse.json();


        /* =====================================================
           CURRENCY CODES
        ===================================================== */

        const currencyCodes =
            Object.keys(
                currencies || {}
            )
                .map(
                    code =>
                        String(code)
                            .trim()
                            .toUpperCase()
                )
                .filter(Boolean)
                .filter(
                    code =>
                        !EXCLUDED_CURRENCY_CODES.has(code)
                )
                .filter(
                    code =>
                        code !== base
                );


        /* =====================================================
           CURRENT BROAD REQUEST
        ===================================================== */

        let broadCurrentRows = [];

        try {

            const ratesResponse =
                await fetch(
                    `${FRANKFURTER_API}/rates?base=${encodeURIComponent(base)}`,
                    {
                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );

            if (ratesResponse.ok) {

                const result =
                    await ratesResponse.json();

                if (Array.isArray(result)) {
                    broadCurrentRows = result;
                }

            } else {

                console.warn(
                    "Broad current rates HTTP error:",
                    ratesResponse.status
                );

            }

        } catch (error) {

            console.warn(
                "Broad current rates failed:",
                error
            );

        }


        /* =====================================================
           CURRENT RATES
        ===================================================== */

        let currentRateRows =
            Object.values(
                latestByQuote(
                    broadCurrentRows,
                    today
                )
            );


        /* =====================================================
           FILL MISSING CURRENCIES
        ===================================================== */

        currentRateRows =
            await fillMissingCurrentRates(
                base,
                currencyCodes,
                currentRateRows
            );


        /* =====================================================
           CURRENT MAP
        ===================================================== */

        const currentMap =
            latestByQuote(
                currentRateRows,
                today
            );

        const currentRates =
            Object.values(
                currentMap
            );


        /* =====================================================
           MAJOR CURRENCIES
        ===================================================== */

        const majorRates = {};
        const majorPreviousRates = {};

        for (const quote of MAJOR_QUOTES) {

            if (quote === base) {
                continue;
            }

            let current =
                currentMap[quote];

            /*
               If the broad request did not return the
               currency, ask for the pair directly.
            */

            if (!current) {

                current =
                    await fetchSingleRate(
                        base,
                        quote
                    );

            }

            if (
                current &&
                Number.isFinite(
                    Number(current.rate)
                )
            ) {

                majorRates[quote] =
                    Number(current.rate);

            }

        }


        /* =====================================================
           HISTORICAL DATA FOR MAJORS
        ===================================================== */

        let historicalRates =
            await fetchHistorical(
                base,
                fromDate,
                today,
                MAJOR_QUOTES
            );


        /*
           If history is unexpectedly empty or has fewer
           than two dates, retry through batch requests.
        */

        const historicalDatesInitial = [
            ...new Set(
                historicalRates
                    .map(
                        row =>
                            row?.date
                    )
                    .filter(Boolean)
                    .filter(
                        date =>
                            date <= today
                    )
            )
        ].sort();


        if (
            historicalDatesInitial.length < 2
        ) {

            const majorHistoricalFallback =
                await fetchQuoteBatches(
                    base,
                    MAJOR_QUOTES,
                    {
                        from:
                            fromDate,

                        to:
                            today
                    }
                );

            historicalRates = [
                ...historicalRates,
                ...majorHistoricalFallback
            ];

        }


        /* =====================================================
           CLEAN HISTORICAL DATA
        ===================================================== */

        const historicalUniqueMap =
            new Map();

        for (const row of historicalRates) {

            if (
                !isValidRate(
                    row,
                    today
                )
            ) {
                continue;
            }

            const quote =
                String(row.quote)
                    .trim()
                    .toUpperCase();

            const key =
                `${quote}|${row.date}`;

            historicalUniqueMap.set(
                key,
                {
                    ...row,
                    quote
                }
            );

        }

        historicalRates =
            Array.from(
                historicalUniqueMap.values()
            );


        /* =====================================================
           HISTORICAL QUOTE COVERAGE
        ===================================================== */

        const historicalPreviousInitial =
            previousByQuote(
                historicalRates,
                today
            );

        const historicalMissingQuotes =
            currencyCodes.filter(
                quote =>
                    !historicalPreviousInitial[quote]
            );


        if (
            historicalMissingQuotes.length
        ) {

            const historicalFallbackRows =
                await fetchQuoteBatches(
                    base,
                    historicalMissingQuotes,
                    {
                        from:
                            fromDate,

                        to:
                            today
                    }
                );

            historicalRates = [
                ...historicalRates,
                ...historicalFallbackRows
            ];

        }


        /* =====================================================
           CLEAN HISTORICAL DATA AGAIN
        ===================================================== */

        const finalHistoricalMap =
            new Map();

        for (const row of historicalRates) {

            if (
                !isValidRate(
                    row,
                    today
                )
            ) {
                continue;
            }

            const quote =
                String(row.quote)
                    .trim()
                    .toUpperCase();

            const key =
                `${quote}|${row.date}`;

            finalHistoricalMap.set(
                key,
                {
                    ...row,
                    quote
                }
            );

        }

        historicalRates =
            Array.from(
                finalHistoricalMap.values()
            );


        /* =====================================================
           PREVIOUS RATES
        ===================================================== */

        const previousMap =
            previousByQuote(
                historicalRates,
                today
            );

        const previousRates =
            Object.values(
                previousMap
            );


        /* =====================================================
           MAJOR PREVIOUS RATES
        ===================================================== */

        for (const quote of MAJOR_QUOTES) {

            if (quote === base) {
                continue;
            }

            /*
               First use historical data.
            */

            if (previousMap[quote]) {

                majorPreviousRates[quote] =
                    Number(
                        previousMap[quote].rate
                    );

                continue;

            }

            /*
               Fallback to individual previous dates.
            */

            const previous =
                await fetchPreviousRateByDate(
                    base,
                    quote,
                    today,
                    14
                );

            if (
                previous &&
                Number.isFinite(
                    Number(previous.rate)
                )
            ) {

                majorPreviousRates[quote] =
                    Number(previous.rate);

            }

        }


        /* =====================================================
           CURRENT DATE
        ===================================================== */

        const currentDates =
            currentRates
                .map(
                    item =>
                        item?.date
                )
                .filter(
                    date =>
                        date &&
                        date <= today
                )
                .sort();

        const currentDate =
            currentDates.length
                ? currentDates[
                    currentDates.length - 1
                ]
                : null;


        /* =====================================================
           PREVIOUS DATE
        ===================================================== */

        const historicalDates =
            historicalRates
                .map(
                    item =>
                        item?.date
                )
                .filter(
                    date =>
                        date &&
                        date <= today
                )
                .filter(
                    (
                        value,
                        index,
                        array
                    ) =>
                        array.indexOf(value) === index
                )
                .sort();

        const previousDate =
            historicalDates.length >= 2
                ? historicalDates[
                    historicalDates.length - 2
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
