/* =========================================================
   CURRENCIES API - Production Ready Version
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

    // Ako API direktno vrati niz objekata
    if (Array.isArray(data)) {
        return data.map(item => ({
            base: item.base || base,
            quote: String(item.quote || item.symbol || "").toUpperCase(),
            rate: Number(item.rate || item.value),
            date: item.date
        }));
    }

    // Ako API vrati standardni 'rates' objekat
    if (data.rates && typeof data.rates === "object") {
        const topDate = data.date || getUTCDate(new Date());

        for (const [key, value] of Object.entries(data.rates)) {
            if (value && typeof value === "object") {
                // Vremenska serija (Range): key je DATUM, value je { "USD": 1.08, ... }
                const rowDate = key;
                for (const [quote, rate] of Object.entries(value)) {
                    results.push({
                        base: base,
                        quote: quote.toUpperCase(),
                        rate: Number(rate),
                        date: rowDate
                    });
                }
            } else {
                // Pojedinačni odziv: key je VALUTA ("USD"), value je BROJ (1.08)
                results.push({
                    base: base,
                    quote: key.toUpperCase(),
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
   FETCH HELPER WITH ERROR HANDLING
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
    try {
        const url = new URL(context.request.url);
        const base = (url.searchParams.get("base") || "EUR").trim().toUpperCase();

        if (EXCLUDED_CURRENCY_CODES.has(base)) {
            return new Response(
                JSON.stringify({ error: "Unsupported base currency" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const now = new Date();
        const today = getUTCDate(now);

        const historicalFromDate = new Date(now);
        historicalFromDate.setUTCDate(historicalFromDate.getUTCDate() - 30);
        const fromDate = getUTCDate(historicalFromDate);

        /* 1. Učitavanje liste valuta */
        const currenciesData = await safeFetchJson(`${FRANKFURTER_API}/currencies`);
        if (!currenciesData) {
            throw new Error("Neuspešno preuzimanje liste valuta.");
        }

        const currencies = {};
        for (const [code, name] of Object.entries(currenciesData)) {
            const cleanCode = code.trim().toUpperCase();
            if (!EXCLUDED_CURRENCY_CODES.has(cleanCode)) {
                currencies[cleanCode] = name;
            }
        }

        /* 2. Paralelno preuzimanje trenutnih i istorijskih kurseva */
        const [currentRaw, historicalRaw] = await Promise.all([
            safeFetchJson(`${FRANKFURTER_API}/rates?base=${encodeURIComponent(base)}`),
            safeFetchJson(`${FRANKFURTER_API}/rates?base=${encodeURIComponent(base)}&from=${fromDate}&to=${today}`)
        ]);

        const currentNormalized = normalizeRatesResponse(currentRaw, base);
        const historicalNormalized = normalizeRatesResponse(historicalRaw, base);

        /* 3. Obrada trenutnih kurseva */
        const currentMap = latestByQuote(currentNormalized, today);
        const currentRates = Object.values(currentMap).filter(item => !EXCLUDED_CURRENCY_CODES.has(item.quote));

        /* 4. Obrada prethodnih kurseva */
        const previousMap = previousByQuote(historicalNormalized, currentMap, today);
        const previousRates = Object.values(previousMap).filter(item => !EXCLUDED_CURRENCY_CODES.has(item.quote));

        /* 5. Obrada Major kurseva */
        const majorRates = {};
        const majorPreviousRates = {};

        for (const quote of MAJOR_QUOTES) {
            if (quote === base) continue;

            if (currentMap[quote]) {
                majorRates[quote] = Number(currentMap[quote].rate);
            }

            if (previousMap[quote]) {
                majorPreviousRates[quote] = Number(previousMap[quote].rate);
            }
        }

        /* 6. Određivanje tačnih datuma za odgovor */
        const currentDates = [...new Set(currentRates.map(r => r.date))].sort();
        const currentDate = currentDates.length ? currentDates[currentDates.length - 1] : today;
        
        const historicalDates = [...new Set(historicalNormalized.map(item => item.date))].sort();
        const validPreviousDates = historicalDates.filter(d => d < currentDate);
        const previousDate = validPreviousDates.length ? validPreviousDates[validPreviousDates.length - 1] : null;

        /* 7. Odgovor API-ja */
        return new Response(
            JSON.stringify({
                base,
                currencies,
                rates: currentRates,
                previousRates,
                date: currentDate,
                previousDate,
                majorRates,
                majorPreviousRates
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=300",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        );

    } catch (error) {
        console.error("Currencies API failed:", error);

        return new Response(
            JSON.stringify({
                error: "Failed to load currency data",
                message: error?.message || "Unknown error"
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            }
        );
    }
}
