/* =========================================================
   CURRENCIES UI
   Stable replacement with Search & Debounce Optimization
========================================================= */

const CURRENCIES_API = "/api/currencies";

const EXCLUDED_CURRENCY_CODES = new Set([
    "XAG",
    "XAU",
    "XDR",
    "XPD",
    "XPT"
]);

const MAJOR_CURRENCY_PAIRS = [
    { base: "USD", target: "HKD" },
    { base: "USD", target: "SGD" },
    { base: "USD", target: "KRW" },
    { base: "USD", target: "ZAR" },
    { base: "USD", target: "NOK" },
    { base: "USD", target: "SEK" },
    { base: "EUR", target: "CZK" }
];

const COUNTRY_MAP = {
    AED: "ae", AFN: "af", ALL: "al", AMD: "am", ANG: "cw", AOA: "ao", ARS: "ar", AUD: "au", AWG: "aw", AZN: "az",
    BAM: "ba", BBD: "bb", BDT: "bd", BHD: "bh", BIF: "bi", BMD: "bm", BND: "bn", BOB: "bo", BRL: "br", BSD: "bs",
    BTN: "bt", BWP: "bw", BYN: "by", BZD: "bz", CAD: "ca", CDF: "cd", CHF: "ch", CLP: "cl", CNY: "cn", CNH: "cn",
    COP: "co", CRC: "cr", CUP: "cu", CVE: "cv", CZK: "cz", DJF: "dj", DKK: "dk", DOP: "do", DZD: "dz", EGP: "eg",
    ERN: "er", ETB: "et", EUR: "eu", FJD: "fj", FKP: "fk", FOK: "fo", GBP: "gb", GEL: "ge", GGP: "gg", GHS: "gh",
    GIP: "gi", GMD: "gm", GNF: "gn", GTQ: "gt", GYD: "gy", HKD: "hk", HNL: "hn", HTG: "ht", HUF: "hu", IDR: "id",
    ILS: "il", IMP: "im", INR: "in", IQD: "iq", IRR: "ir", ISK: "is", JEP: "je", JMD: "jm", JOD: "jo", JPY: "jp",
    KES: "ke", KGS: "kg", KHR: "kh", KMF: "km", KPW: "kp", KRW: "kr", KWD: "kw", KYD: "ky", KZT: "kz", LAK: "la",
    LBP: "lb", LKR: "lk", LRD: "lr", LSL: "ls", LYD: "ly", MAD: "ma", MDL: "md", MGA: "mg", MKD: "mk", MMK: "mm",
    MNT: "mn", MOP: "mo", MRO: "mr", MRU: "mr", MUR: "mu", MVR: "mv", MWK: "mw", MXN: "mx", MYR: "my", MZN: "mz",
    NAD: "na", NGN: "ng", NIO: "ni", NOK: "no", NPR: "np", NZD: "nz", OMR: "om", PAB: "pa", PEN: "pe", PGK: "pg",
    PHP: "ph", PKR: "pk", PLN: "pl", PYG: "py", QAR: "qa", RON: "ro", RSD: "rs", RUB: "ru", RWF: "rw", SAR: "sa",
    SBD: "sb", SCR: "sc", SDG: "sd", SEK: "se", SGD: "sg", SHP: "sh", SLE: "sl", SOS: "so", SRD: "sr", SSP: "ss",
    STN: "st", SVC: "sv", SYP: "sy", SZL: "sz", THB: "th", TJS: "tj", TMT: "tm", TND: "tn", TOP: "to", TRY: "tr",
    TTD: "tt", TWD: "tw", TZS: "tz", UAH: "ua", UGX: "ug", USD: "us", UYU: "uy", UZS: "uz", VES: "ve", VND: "vn",
    VUV: "vu", WST: "ws", XCD: "ag", XCG: "cw", XAF: "cm", XOF: "sn", XPF: "pf", YER: "ye", ZAR: "za", ZMW: "zm", ZWG: "zw"
};

let currenciesData = [];
let currenciesMap = new Map();
let currencyRates = {};
let previousCurrencyRates = {};

let majorRates = {};
let majorPreviousRates = {};

let currenciesInitialized = false;
let searchDebounceTimeout = null;

/* =========================================================
   HELPERS
========================================================= */

function currencyEscapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getCurrencyFlag(code) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const country = COUNTRY_MAP[normalizedCode];

    if (!country) {
        return `<span class="currency-card-flag-fallback" aria-hidden="true">🌐</span>`;
    }

    return `<img class="currency-card-flag-image" src="https://flagcdn.com/w80/${country}.png" alt="" aria-hidden="true" loading="lazy">`;
}

function formatRate(rate) {
    const number = Number(rate);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function normalizeRateValue(value) {
    if (value && typeof value === "object") {
        value = value.rate ?? value.value ?? value.amount ?? value.price;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return NaN;
    return number;
}

function normalizeRateMap(data) {
    const result = {};
    if (!data || typeof data !== "object") return result;
    
    if (Array.isArray(data)) {
        data.forEach(item => {
            const code = String(item?.quote || item?.code || item?.iso_code || "").trim().toUpperCase();
            const rate = normalizeRateValue(item);
            if (code && Number.isFinite(rate)) result[code] = rate;
        });
    } else {
        Object.keys(data).forEach(code => {
            const normalizedCode = String(code).trim().toUpperCase();
            const rate = normalizeRateValue(data[code]);
            if (normalizedCode && Number.isFinite(rate)) {
                result[normalizedCode] = rate;
            }
        });
    }
    return result;
}

function getFiatCurrencies(data, ratesMap) {
    let rawList = [];

    if (Array.isArray(data) && data.length > 0) {
        rawList = data;
    } else if (data && typeof data === "object" && Object.keys(data).length > 0) {
        rawList = Object.entries(data).map(([key, val]) => {
            if (val && typeof val === "object") {
                return { iso_code: val.iso_code || val.code || key, name: val.name || key };
            }
            return { iso_code: key, name: String(val) };
        });
    } else if (ratesMap && typeof ratesMap === "object") {
        rawList = Object.keys(ratesMap).map(code => ({ iso_code: code, name: code }));
    }

    const seen = new Set();
    const processed = [];

    for (const item of rawList) {
        let code = "";
        let name = "";

        if (typeof item === "string") {
            code = item.trim().toUpperCase();
            name = code;
        } else {
            code = String(item?.iso_code || item?.code || item?.symbol || item?.quote || "").trim().toUpperCase();
            name = item?.name || code;
        }

        if (!code || EXCLUDED_CURRENCY_CODES.has(code) || seen.has(code)) {
            continue;
        }

        seen.add(code);
        processed.push({
            ...(typeof item === "object" ? item : {}),
            iso_code: code,
            name: name
        });
    }

    return processed.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

/* =========================================================
   RENDER MAIN UI & EVENT BINDING
========================================================= */

function renderCurrenciesUI() {
    const app = document.getElementById("currenciesApp");
    if (!app) return;

    app.innerHTML = `
        <div class="money-container">
            <div class="money-block">
                <div class="money-block-header">
                    <div>
                        <h3>💱 Currencies</h3>
                        <p>Popular currencies & exchange rates</p>
                    </div>
                </div>
            </div>

            <div class="money-block">
                <div class="money-block-header">
                    <div>
                        <h3>Major currencies</h3>
                        <p>Important currencies from major economies</p>
                    </div>
                </div>
                <div class="money-grid" id="majorCurrenciesGrid">
                    <div class="money-card">Loading exchange rates...</div>
                </div>
            </div>

            <div class="money-block">
                <div class="money-block-header">
                    <div>
                        <h3>All currencies</h3>
                        <p>Browse available fiat currencies</p>
                    </div>
                </div>
                <div class="calculator-toolbar">
                    <div class="calculator-search">
                        <span class="calculator-search-icon" aria-hidden="true">🔎</span>
                        <input type="text" id="currencySearch" placeholder="Search currencies..." aria-label="Search currencies" autocomplete="off">
                    </div>
                </div>
                <div class="money-grid" id="allCurrenciesGrid">
                    <div class="money-card">Loading currencies...</div>
                </div>
            </div>

            <div class="money-updated">
                Last updated: <span id="moneyLastUpdated">—</span>
            </div>
        </div>
    `;

    const search = document.getElementById("currencySearch");
    if (search) {
        search.addEventListener("input", handleCurrencySearch);
    }
}

function filterAndRenderCurrencies(queryText) {
    const query = String(queryText || "").trim().toLowerCase();
    if (!query) {
        renderAllCurrencies(currenciesData);
        return;
    }

    const filtered = currenciesData.filter(currency => {
        const code = String(currency.iso_code || currency.code || "").toLowerCase();
        const name = String(currency.name || "").toLowerCase();
        return code.includes(query) || name.includes(query);
    });
    renderAllCurrencies(filtered);
}

function handleCurrencySearch(e) {
    clearTimeout(searchDebounceTimeout);
    const query = e?.target?.value ?? "";

    searchDebounceTimeout = setTimeout(() => {
        filterAndRenderCurrencies(query);
    }, 150);
}

/* =========================================================
   LOAD CURRENCIES API
========================================================= */

async function loadCurrencies() {
    const allGrid = document.getElementById("allCurrenciesGrid");
    const majorGrid = document.getElementById("majorCurrenciesGrid");

    try {
        if (allGrid) allGrid.innerHTML = `<div class="money-card">Loading currencies...</div>`;
        if (majorGrid) majorGrid.innerHTML = `<div class="money-card">Loading exchange rates...</div>`;

        const response = await fetch(`${CURRENCIES_API}?base=EUR`, {
            method: "GET",
            cache: "no-store",
            headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
            throw new Error(`Currencies API error: ${response.status}`);
        }

        const data = await response.json();
        if (!data || typeof data !== "object") {
            throw new Error("Currencies API returned invalid data.");
        }

        currencyRates = normalizeRateMap(data.rates);
        previousCurrencyRates = normalizeRateMap(data.previousRates);
        majorRates = normalizeRateMap(data.majorRates);
        majorPreviousRates = normalizeRateMap(data.majorPreviousRates);

        currenciesData = getFiatCurrencies(data.currencies, currencyRates);
        
        // Optimize lookup by mapping ISO codes directly
        currenciesMap = new Map(currenciesData.map(item => [item.iso_code, item]));

        MAJOR_CURRENCY_PAIRS.forEach(pair => {
            [pair.base, pair.target].forEach(code => {
                const normalized = String(code).trim().toUpperCase();
                if (normalized !== "EUR") {
                    if (!Number.isFinite(majorRates[normalized])) {
                        const fallback = normalizeRateValue(currencyRates[normalized]);
                        if (Number.isFinite(fallback)) majorRates[normalized] = fallback;
                    }
                    if (!Number.isFinite(majorPreviousRates[normalized])) {
                        const prevFallback = normalizeRateValue(previousCurrencyRates[normalized]);
                        if (Number.isFinite(prevFallback)) majorPreviousRates[normalized] = prevFallback;
                    }
                }
            });
        });

        renderMajorCurrencies();

        const currentSearch = document.getElementById("currencySearch");
        if (currentSearch && currentSearch.value.trim() !== "") {
            filterAndRenderCurrencies(currentSearch.value);
        } else {
            renderAllCurrencies(currenciesData);
        }

        const updated = document.getElementById("moneyLastUpdated");
        if (updated) updated.textContent = data.date || "—";

        return true;

    } catch (error) {
        console.error("Currencies loading failed:", error);
        if (allGrid) allGrid.innerHTML = `<div class="money-card">Failed to load currencies.</div>`;
        if (majorGrid) majorGrid.innerHTML = `<div class="money-card">Failed to load exchange rates.</div>`;
        return false;
    }
}

/* =========================================================
   RATES CALCULATIONS
========================================================= */

function getRateNumber(code) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return NaN;
    if (normalizedCode === "EUR") return 1;

    const majorRate = normalizeRateValue(majorRates[normalizedCode]);
    if (Number.isFinite(majorRate)) return majorRate;

    const normalRate = normalizeRateValue(currencyRates[normalizedCode]);
    if (Number.isFinite(normalRate)) return normalRate;

    return NaN;
}

function getPreviousRateNumber(code) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return NaN;
    if (normalizedCode === "EUR") return 1;

    const majorRate = normalizeRateValue(majorPreviousRates[normalizedCode]);
    if (Number.isFinite(majorRate)) return majorRate;

    const normalRate = normalizeRateValue(previousCurrencyRates[normalizedCode]);
    if (Number.isFinite(normalRate)) return normalRate;

    return NaN;
}

function getCrossRate(base, target) {
    base = String(base || "").trim().toUpperCase();
    target = String(target || "").trim().toUpperCase();

    if (!base || !target) return NaN;
    if (base === target) return 1;

    const baseRate = getRateNumber(base);
    const targetRate = getRateNumber(target);

    if (!Number.isFinite(baseRate) || !Number.isFinite(targetRate) || baseRate <= 0 || targetRate <= 0) {
        return NaN;
    }

    const crossRate = targetRate / baseRate;
    return Number.isFinite(crossRate) ? crossRate : NaN;
}

function getCrossRateChange(base, target) {
    base = String(base || "").trim().toUpperCase();
    target = String(target || "").trim().toUpperCase();

    if (!base || !target) return NaN;
    if (base === target) return 0;

    const currentBase = getRateNumber(base);
    const currentTarget = getRateNumber(target);
    const previousBase = getPreviousRateNumber(base);
    const previousTarget = getPreviousRateNumber(target);

    if (!Number.isFinite(currentBase) || !Number.isFinite(currentTarget) || 
        !Number.isFinite(previousBase) || !Number.isFinite(previousTarget) ||
        currentBase <= 0 || currentTarget <= 0 || previousBase <= 0 || previousTarget <= 0) {
        return NaN;
    }

    const currentCross = currentTarget / currentBase;
    const previousCross = previousTarget / previousBase;

    if (!Number.isFinite(currentCross) || !Number.isFinite(previousCross) || previousCross <= 0) {
        return NaN;
    }

    return ((currentCross - previousCross) / previousCross) * 100;
}

/* =========================================================
   MOVEMENT SCALING & RENDERING
========================================================= */

function getCurrencyMovementWidth(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return 0;
    return Math.min(50, Math.max(4, Math.abs(number) * 10));
}

function renderCurrencyMovement(change) {
    const hasValidChange = Number.isFinite(change);
    const validChange = hasValidChange 
        ? (Math.abs(change) < 0.005 ? 0 : change) 
        : 0;

    const isUp = validChange > 0;
    const isDown = validChange < 0;
    const width = getCurrencyMovementWidth(validChange);

    const movementClass = isUp ? "market-up" : isDown ? "market-down" : "market-flat";
    const arrow = isUp ? "▲" : isDown ? "▼" : "—";
    
    let percentageText = "—";
    if (hasValidChange) {
        percentageText = Math.abs(change) < 0.005 ? "0.00%" : (change > 0 ? "+" : "") + change.toFixed(2) + "%";
    }

    const displayLabel = hasValidChange ? `${arrow} ${percentageText}` : "—";

    return `
        <div class="currency-movement ${movementClass}" style="width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:var(--market-movement-color);">
            <div class="currency-movement-line" style="position:relative; width:92%; height:3px; background:rgba(128,128,128,.30); border-radius:999px;">
                ${isDown ? `<span style="position:absolute; height:3px; width:${width}%; right:50%; top:0; background:currentColor; border-radius:999px 0 0 999px;"></span>` : ""}
                ${isUp ? `<span style="position:absolute; height:3px; width:${width}%; left:50%; top:0; background:currentColor; border-radius:0 999px 999px 0;"></span>` : ""}
                <span style="position:absolute; width:9px; height:9px; left:50%; top:50%; transform:translate(-50%,-50%); border-radius:50%; background:currentColor; z-index:2;"></span>
            </div>
            <strong>${displayLabel}</strong>
        </div>
    `;
}

/* =========================================================
   RENDER GRIDS
========================================================= */

function renderMajorCurrencies() {
    const grid = document.getElementById("majorCurrenciesGrid");
    if (!grid) return;

    grid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    MAJOR_CURRENCY_PAIRS.forEach(pair => {
        const card = document.createElement("div");
        card.className = "money-card";

        const rate = getCrossRate(pair.base, pair.target);
        const targetCurrency = currenciesMap.get(pair.target);
        const targetName = targetCurrency?.name || pair.target;
        const change = getCrossRateChange(pair.base, pair.target);

        card.innerHTML = `
            <div class="money-card-main">
                <div class="money-icon">
                    ${getCurrencyFlag(pair.target)}
                </div>
                <div>
                    <strong>${currencyEscapeHtml(pair.base)} / ${currencyEscapeHtml(pair.target)}</strong>
                    <small>${currencyEscapeHtml(pair.base)} / ${currencyEscapeHtml(targetName)}</small>
                </div>
            </div>
            <div class="money-price">
                <small>Exchange rate</small>
                <strong class="major-exchange-rate">
                    ${Number.isFinite(rate) ? `1 ${currencyEscapeHtml(pair.base)} = ${formatRate(rate)} ${currencyEscapeHtml(pair.target)}` : "Exchange rate unavailable"}
                </strong>
            </div>
            ${renderCurrencyMovement(change)}
        `;

        fragment.appendChild(card);
    });

    grid.appendChild(fragment);
}

function renderAllCurrencies(currencies) {
    const grid = document.getElementById("allCurrenciesGrid");
    if (!grid) return;

    if (!Array.isArray(currencies) || !currencies.length) {
        grid.innerHTML = `<div class="money-card">No currencies found.</div>`;
        return;
    }

    grid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    currencies.forEach(currency => {
        const code = String(currency?.iso_code || currency?.code || "").trim().toUpperCase();
        if (!code) return;

        const rate = getRateNumber(code);
        const change = getCrossRateChange("EUR", code);

        const card = document.createElement("div");
        card.className = "money-card";

        card.innerHTML = `
            <div class="money-card-main">
                <div class="money-icon">
                    ${getCurrencyFlag(code)}
                </div>
                <div>
                    <strong>EUR / ${currencyEscapeHtml(code)}</strong>
                    <small>${currencyEscapeHtml(currency.name || code)}</small>
                </div>
            </div>
            <div class="money-price">
                <small>Exchange rate</small>
                <strong class="major-exchange-rate">
                    ${Number.isFinite(rate) ? `1 EUR = ${formatRate(rate)} ${currencyEscapeHtml(code)}` : "Exchange rate unavailable"}
                </strong>
            </div>
            ${renderCurrencyMovement(change)}
        `;

        fragment.appendChild(card);
    });

    grid.appendChild(fragment);
}

/* =========================================================
   INITIALIZATION TRIGGER
========================================================= */

async function initCurrenciesApp() {
    if (currenciesInitialized) return;
    currenciesInitialized = true;

    renderCurrenciesUI();
    const isSuccess = await loadCurrencies();
    
    if (!isSuccess) {
        currenciesInitialized = false;
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCurrenciesApp);
} else {
    initCurrenciesApp();
}
