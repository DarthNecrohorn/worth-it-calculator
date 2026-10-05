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

let currencyDetailItems = [];
let currencyDetailIndex = -1;
let currencyDetailSource = null;

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
    
            <div id="currencyDetailModal" class="currency-detail-modal" aria-hidden="true">
                <div class="currency-detail-backdrop" data-currency-detail-close></div>
                <button type="button" class="currency-detail-nav currency-detail-nav-prev" id="currencyDetailPrev" aria-label="Previous currency">
                    <span class="currency-detail-nav-key">A</span><span class="currency-detail-nav-arrow currency-detail-nav-chevron">❮</span><span class="currency-detail-nav-arrow currency-detail-nav-main">←</span>
                </button>
                <button type="button" class="currency-detail-nav currency-detail-nav-next" id="currencyDetailNext" aria-label="Next currency">
                    <span class="currency-detail-nav-key">D</span><span class="currency-detail-nav-arrow currency-detail-nav-chevron">❯</span><span class="currency-detail-nav-arrow currency-detail-nav-main">→</span>
                </button>
                <div class="currency-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="currencyDetailTitle">
                    <button type="button" class="currency-detail-close" data-currency-detail-close aria-label="Close">×</button>
                    <div class="currency-detail-content" id="currencyDetailContent"></div>
                </div>
            </div>
            <style id="currency-detail-styles">
                .money-grid .money-card{cursor:pointer}
                .money-grid .money-card:focus-visible{outline:2px solid currentColor;outline-offset:3px}
                .currency-detail-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;z-index:1600}
                .currency-detail-modal.is-open{display:flex}
                .currency-detail-backdrop{position:absolute;inset:0;background:rgba(10,14,24,.62);backdrop-filter:blur(7px)}
                .currency-detail-dialog{position:relative;width:min(650px,calc(100vw - 44px));max-height:min(720px,calc(100vh - 44px));overflow:auto;border:1px solid color-mix(in srgb,var(--border) 82%,transparent);border-radius:22px;background:var(--card-solid,var(--card));box-shadow:0 28px 90px rgba(0,0,0,.34);color:var(--text);z-index:2}
                .currency-detail-close{position:absolute;top:12px;right:12px;width:38px;height:38px;border:1px solid var(--border);border-radius:12px;background:var(--surface-soft);color:var(--text);font-size:25px;line-height:0;cursor:pointer;z-index:3}
                .currency-detail-close:hover{transform:translateY(-1px)}
                .currency-detail-content{padding:34px 34px 30px}
                .currency-detail-heading{display:flex;align-items:center;gap:16px;padding-right:42px;margin-bottom:24px}
                .currency-detail-flag{width:64px;height:44px;border-radius:10px;object-fit:cover;box-shadow:0 5px 18px rgba(0,0,0,.14);background:var(--surface-soft)}
                .currency-detail-title{margin:0;font-size:clamp(1.55rem,3vw,2.15rem);line-height:1.1}
                .currency-detail-subtitle{margin:6px 0 0;color:var(--muted);font-size:.96rem}
                .currency-detail-rate{padding:20px;border:1px solid var(--border);border-radius:16px;background:var(--surface-soft);margin-bottom:16px}
                .currency-detail-rate-label{display:block;color:var(--muted);font-size:.82rem;text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px}
                .currency-detail-rate-value{font-size:clamp(1.25rem,3vw,1.7rem);font-weight:800;line-height:1.25}
                .currency-detail-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px}
                .currency-detail-stat{padding:15px;border:1px solid var(--border);border-radius:14px;background:var(--card)}
                .currency-detail-stat span{display:block;color:var(--muted);font-size:.78rem;margin-bottom:5px}
                .currency-detail-stat strong{font-size:1rem}
                .currency-detail-change{padding:15px 17px;border-radius:14px;border:1px solid var(--border);background:var(--surface-soft)}
                .currency-detail-change span{display:block;color:var(--muted);font-size:.78rem;margin-bottom:4px}
                .currency-detail-change strong{font-size:1.08rem}
                .currency-detail-nav{position:fixed;top:50%;transform:translateY(-50%);width:62px;height:82px;border:1px solid var(--border);border-radius:17px;background:var(--card-solid,var(--card));color:var(--text);box-shadow:0 16px 42px rgba(0,0,0,.22);z-index:3;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}.currency-detail-nav-key{order:1;align-self:center;margin:0;font-size:.82rem;font-weight:800;color:var(--muted)}.currency-detail-nav-chevron{order:2;font-size:34px;line-height:.75;font-weight:400}.currency-detail-nav-main{order:3;font-size:22px;line-height:.8;font-weight:300}
                .currency-detail-nav:hover{transform:translateY(-50%) !important}
                .currency-detail-nav:disabled{opacity:.28;cursor:default}
                .currency-detail-nav:disabled:hover{transform:none !important}
                .currency-detail-nav-prev{left:calc(50% - 390px)}
                .currency-detail-nav-next{right:calc(50% - 390px)}
                
                
                @media(max-width:1050px){
                    .currency-detail-nav-prev{left:8px}.currency-detail-nav-next{right:8px}
                }
                @media(max-width:700px){
                    .currency-detail-modal{padding:10px}
                    .currency-detail-dialog{width:calc(100vw - 20px);max-height:calc(100vh - 20px);border-radius:18px}
                    .currency-detail-content{padding:28px 20px 22px}
                    .currency-detail-heading{gap:12px;margin-bottom:20px}
                    .currency-detail-flag{width:54px;height:38px}
                    .currency-detail-stats{grid-template-columns:1fr}
                    .currency-detail-nav{width:48px;height:66px;border-radius:14px}
                    .currency-detail-nav-prev{left:3px}.currency-detail-nav-next{right:3px}
                    .currency-detail-nav-main{font-size:16px}.currency-detail-nav-chevron{font-size:24px}.currency-detail-nav-key{font-size:.58rem;margin:0}
                }
                @media(max-width:420px){
                    .currency-detail-nav{width:42px;height:60px}
                    .currency-detail-nav-main{font-size:15px}.currency-detail-nav-chevron{font-size:22px}
                    .currency-detail-nav-key{display:none}
                }
                @media(min-width:1200px){html[data-ui-scale="xl"] .currency-detail-dialog{width:min(580px,calc(100vw - 60px))}html[data-ui-scale="xl"] .currency-detail-content{padding:30px 30px 26px}html[data-ui-scale="xl"] .currency-detail-nav-prev{left:calc(50% - 365px)}html[data-ui-scale="xl"] .currency-detail-nav-next{right:calc(50% - 365px)}}\n                @media(prefers-reduced-motion:reduce){
                    .currency-detail-nav,.currency-detail-close{transition:none}
                }
            </style>
    `;

    const search = document.getElementById("currencySearch");
    if (search) {
        search.addEventListener("input", handleCurrencySearch);
    }

    bindCurrencyDetailEvents();
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
   CURRENCY DETAIL PANEL
   Separate visual language from Markets; same navigation principle.
========================================================= */

function getCurrencyDetailName(code) {
    const item = currenciesMap.get(String(code || "").toUpperCase());
    return item?.name || code;
}

function buildCurrencyDetailItems(source, items) {
    currencyDetailSource = source;
    currencyDetailItems = Array.isArray(items) ? items : [];
    currencyDetailIndex = -1;
}

function openCurrencyDetail(index) {
    if (!Array.isArray(currencyDetailItems) || index < 0 || index >= currencyDetailItems.length) return;
    currencyDetailIndex = index;
    const modal = document.getElementById("currencyDetailModal");
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("currency-detail-open");
    renderCurrencyDetail();
}

function closeCurrencyDetail() {
    const modal = document.getElementById("currencyDetailModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("currency-detail-open");
}

function renderCurrencyDetail() {
    const content = document.getElementById("currencyDetailContent");
    if (!content || currencyDetailIndex < 0) return;

    const item = currencyDetailItems[currencyDetailIndex];
    if (!item) return;

    const isMajor = item.kind === "major";
    const code = isMajor ? item.target : item.code;
    const title = isMajor ? `${item.base} / ${item.target}` : `EUR / ${item.code}`;
    const name = isMajor
        ? `${getCurrencyDetailName(item.base)} / ${item.targetName}`
        : item.name;
    const rateText = Number.isFinite(item.rate)
        ? `1 ${item.base || "EUR"} = ${formatRate(item.rate)} ${item.target || item.code}`
        : "Exchange rate unavailable";
    const change = item.change;
    const changeText = Number.isFinite(change)
        ? (Math.abs(change) < 0.005 ? "0.00%" : (change > 0 ? "+" : "") + change.toFixed(2) + "%")
        : "—";
    const movement = Number.isFinite(change)
        ? (change > 0.005 ? "▲ Up" : change < -0.005 ? "▼ Down" : "— Flat")
        : "Unavailable";

    content.innerHTML = `
        <div class="currency-detail-heading">
            ${getCurrencyFlag(code).replace("currency-card-flag-image","currency-detail-flag")}
            <div>
                <h2 class="currency-detail-title" id="currencyDetailTitle">${currencyEscapeHtml(title)}</h2>
                <p class="currency-detail-subtitle">${currencyEscapeHtml(name)}</p>
            </div>
        </div>
        <div class="currency-detail-rate">
            <span class="currency-detail-rate-label">Exchange rate</span>
            <div class="currency-detail-rate-value">${currencyEscapeHtml(rateText)}</div>
        </div>
        <div class="currency-detail-stats">
            <div class="currency-detail-stat">
                <span>Currency code</span>
                <strong>${currencyEscapeHtml(code)}</strong>
            </div>
            <div class="currency-detail-stat">
                <span>Pair</span>
                <strong>${currencyEscapeHtml(isMajor ? `${item.base} / ${item.target}` : "EUR / " + item.code)}</strong>
            </div>
            <div class="currency-detail-stat">
                <span>Direction</span>
                <strong>${currencyEscapeHtml(movement)}</strong>
            </div>
            <div class="currency-detail-stat">
                <span>Current value</span>
                <strong>${Number.isFinite(item.rate) ? currencyEscapeHtml(formatRate(item.rate)) : "—"}</strong>
            </div>
        </div>
        <div class="currency-detail-change">
            <span>Change vs previous available rate</span>
            <strong>${currencyEscapeHtml(changeText)}</strong>
        </div>
    `;

    const prev = document.getElementById("currencyDetailPrev");
    const next = document.getElementById("currencyDetailNext");
    if (prev) {
        prev.disabled = currencyDetailIndex <= 0;
        prev.setAttribute("aria-label", `Previous currency`);
    }
    if (next) {
        next.disabled = currencyDetailIndex >= currencyDetailItems.length - 1;
        next.setAttribute("aria-label", `Next currency`);
    }
}

function navigateCurrencyDetail(direction) {
    if (!document.getElementById("currencyDetailModal")?.classList.contains("is-open")) return;
    const nextIndex = currencyDetailIndex + direction;
    if (nextIndex < 0 || nextIndex >= currencyDetailItems.length) return;
    currencyDetailIndex = nextIndex;
    renderCurrencyDetail();
}

function bindCurrencyDetailEvents() {
    const app = document.getElementById("currenciesApp");
    if (!app || app.dataset.currencyDetailBound === "1") return;
    app.dataset.currencyDetailBound = "1";

    app.addEventListener("click", event => {
        const closeTarget = event.target.closest("[data-currency-detail-close]");
        if (closeTarget) {
            closeCurrencyDetail();
            return;
        }

        if (event.target.closest("#currencyDetailPrev")) {
            navigateCurrencyDetail(-1);
            return;
        }

        if (event.target.closest("#currencyDetailNext")) {
            navigateCurrencyDetail(1);
            return;
        }

        const card = event.target.closest(".money-card");
        if (!card || !app.contains(card)) return;

        if (card.closest("#majorCurrenciesGrid") && card._currencyDetailIndex !== undefined) {
            buildCurrencyDetailItems("major", majorCurrencyDetailItems);
            openCurrencyDetail(card._currencyDetailIndex);
        } else if (card.closest("#allCurrenciesGrid") && card._currencyDetailIndex !== undefined) {
            buildCurrencyDetailItems("all", allCurrencyDetailItems);
            openCurrencyDetail(card._currencyDetailIndex);
        }
    });

    app.addEventListener("keydown", event => {
        if (event.target?.classList?.contains("money-card") && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            const card = event.target;
            if (card.closest("#majorCurrenciesGrid") && card._currencyDetailIndex !== undefined) {
                buildCurrencyDetailItems("major", majorCurrencyDetailItems);
                openCurrencyDetail(card._currencyDetailIndex);
            } else if (card.closest("#allCurrenciesGrid") && card._currencyDetailIndex !== undefined) {
                buildCurrencyDetailItems("all", allCurrencyDetailItems);
                openCurrencyDetail(card._currencyDetailIndex);
            }
        }
    });

    document.addEventListener("keydown", event => {
        const modal = document.getElementById("currencyDetailModal");
        if (!modal?.classList.contains("is-open")) return;

        if (event.key === "Escape") {
            event.preventDefault();
            closeCurrencyDetail();
        } else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
            event.preventDefault();
            navigateCurrencyDetail(-1);
        } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
            event.preventDefault();
            navigateCurrencyDetail(1);
        }
    });
}

let majorCurrencyDetailItems = [];
let allCurrencyDetailItems = [];

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
    majorCurrencyDetailItems = [];

    MAJOR_CURRENCY_PAIRS.forEach(pair => {
        const card = document.createElement("div");
        card.className = "money-card";

        const rate = getCrossRate(pair.base, pair.target);
        const targetCurrency = currenciesMap.get(pair.target);
        const targetName = targetCurrency?.name || pair.target;
        const change = getCrossRateChange(pair.base, pair.target);

        const detailIndex = majorCurrencyDetailItems.length;
        majorCurrencyDetailItems.push({
            kind: "major",
            base: pair.base,
            target: pair.target,
            targetName,
            rate,
            change
        });
        card._currencyDetailIndex = detailIndex;
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `View details for ${pair.base} / ${pair.target}`);

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
    allCurrencyDetailItems = [];

    currencies.forEach(currency => {
        const code = String(currency?.iso_code || currency?.code || "").trim().toUpperCase();
        if (!code) return;

        const rate = getRateNumber(code);
        const change = getCrossRateChange("EUR", code);

        const card = document.createElement("div");
        card.className = "money-card";

        const detailIndex = allCurrencyDetailItems.length;
        allCurrencyDetailItems.push({
            kind: "all",
            code,
            name: currency.name || code,
            rate,
            change
        });
        card._currencyDetailIndex = detailIndex;
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `View details for EUR / ${code}`);

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
