/* =========================================================
   CURRENCIES API - Clean Production Version (1-Hour Cache)
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
   PARSE FRANKFURTER RESPONSE
========================================================= */

function normalizeRatesResponse(data, defaultBase = "EUR") {
    const results = [];

    if (!data) return results;

    const base = data.base || defaultBase;

    if (Array.isArray(data)) {
        return data.map(item => {
            const q = String(item.quote || item.symbol || item.code || "").toUpperCase();
            return {
                base: item.base || base,
                quote: q,
                code: q,
                symbol: q,
                rate: Number(item.rate || item.value),
                date: item.date
            };
        });
    }

    if (data.rates && typeof data.rates === "object") {
        const topDate = data.date || getUTCDate(new Date());

        for (const [key, value] of Object.entries(data.rates)) {
            if (value && typeof value === "object") {
                const rowDate = key;
                for (const [quote, rate] of Object.entries(value)) {
                    const q = quote.toUpperCase();
                    results.push({
                        base: base,
                        quote: q,
                        code: q,
                        symbol: q,
                        rate: Number(rate),
                        date: rowDate
                    });
                }
            } else {
                const q = key.toUpperCase();
                results.push({
                    base: base,
                    quote: q,
                    code: q,
                    symbol: q,
                    rate: Number(value),
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
    if (!Array.isArray(rows)) return result;

    for (const item of rows) {
        if (!isValidRate(item, today)) continue;

        const quote = String(item.quote).trim().toUpperCase();

        if (!result[quote] || item.date > result[quote].date) {
            result[quote] = item;
        }
    }

    return result;
}

/* =========================================================
   PREVIOUS OBSERVATION PER QUOTE
========================================================= */

function previousByQuote(rows, currentMap, today) {
    const grouped = {};
    if (!Array.isArray(rows)) return {};

    for (const item of rows) {
        if (!isValidRate(item, today)) continue;

        const quote = String(item.quote).trim().toUpperCase();
        if (!grouped[quote]) grouped[quote] = [];
        grouped[quote].push(item);
    }

    const result = {};

    for (const [quote, items] of Object.entries(grouped)) {
        const currentItem = currentMap[quote];
        const currentDate = currentItem ? currentItem.date : today;

        const strictPreviousItems = items.filter(item => item.date < currentDate);

        if (strictPreviousItems.length === 0) continue;

        strictPreviousItems.sort((a, b) => a.date.localeCompare(b.date));
        result[quote] = strictPreviousItems[strictPreviousItems.length - 1];
    }

    return result;
}

/* =========================================================
   FETCH HELPER
========================================================= */

async function safeFetchJson(url) {
    try {
        const response = await fetch(url, {
            headers: { "Accept": "application/json" }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (err) {
        console.warn(`Fetch failed for ${url}:`, err);
        return null;
    }
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

    if (context.request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }

    try {
        const url = new URL(context.request.url);
        const base = (url.searchParams.get("base") || "EUR").trim().toUpperCase();

        if (EXCLUDED_CURRENCY_CODES.has(base)) {
            return new Response(
                JSON.stringify({ error: "Unsupported base currency" }),
                { 
                    status: 400, 
                    headers: { 
                        "Content-Type": "application/json",
                        ...corsHeaders
                    } 
                }
            );
        }

        const now = new Date();
        const today = getUTCDate(now);

        const historicalFromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30));
        const fromDate = getUTCDate(historicalFromDate);

        const [currenciesData, currentRaw, historicalRaw] = await Promise.all([
            safeFetchJson(`${FRANKFURTER_API}/currencies`),
            safeFetchJson(`${FRANKFURTER_API}/rates?base=${encodeURIComponent(base)}`),
            safeFetchJson(`${FRANKFURTER_API}/rates?base=${encodeURIComponent(base)}&from=${fromDate}&to=${today}`)
        ]);

        const currentNormalized = normalizeRatesResponse(currentRaw, base);
        const historicalNormalized = normalizeRatesResponse(historicalRaw, base);

        if (!currentNormalized.length) {
            throw new Error("Unable to retrieve current exchange rates.");
        }

        const currencies = {};
        if (currenciesData) {
            for (const [code, name] of Object.entries(currenciesData)) {
                const cleanCode = code.trim().toUpperCase();
                if (!EXCLUDED_CURRENCY_CODES.has(cleanCode)) {
                    currencies[cleanCode] = name;
                }
            }
        } else {
            for (const item of currentNormalized) {
                if (!EXCLUDED_CURRENCY_CODES.has(item.quote)) {
                    currencies[item.quote] = item.quote;
                }
            }
        }

        const currentMap = latestByQuote(currentNormalized, today);
        const previousMap = previousByQuote(historicalNormalized, currentMap, today);

        const rates = {};
        const previousRates = {};
        const ratesList = [];
        const previousRatesList = [];

        for (const [quote, item] of Object.entries(currentMap)) {
            if (EXCLUDED_CURRENCY_CODES.has(quote)) continue;
            rates[quote] = Number(item.rate);
            ratesList.push(item);
        }

        for (const [quote, item] of Object.entries(previousMap)) {
            if (EXCLUDED_CURRENCY_CODES.has(quote)) continue;
            previousRates[quote] = Number(item.rate);
            previousRatesList.push(item);
        }

        const majorRates = {};
        const majorPreviousRates = {};

        for (const quote of MAJOR_QUOTES) {
            if (quote === base) continue;

            if (rates[quote] !== undefined) {
                majorRates[quote] = rates[quote];
            }

            if (previousRates[quote] !== undefined) {
                majorPreviousRates[quote] = previousRates[quote];
            }
        }

        const currentDates = [...new Set(ratesList.map(r => r.date))].sort();
        const currentDate = currentDates.length ? currentDates[currentDates.length - 1] : today;

        const historicalDates = [...new Set(historicalNormalized.map(item => item.date))].sort();
        const validPreviousDates = historicalDates.filter(d => d < currentDate);
        const previousDate = validPreviousDates.length ? validPreviousDates[validPreviousDates.length - 1] : null;

        return new Response(
            JSON.stringify({
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
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=3600",
                    ...corsHeaders
                }
            }
        );

    } catch (error) {
        console.error("Currencies API error:", error);

        return new Response(
            JSON.stringify({
                error: "Failed to load currency data",
                message: error?.message || "Unknown error"
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders
                }
            }
        );
    }
}
