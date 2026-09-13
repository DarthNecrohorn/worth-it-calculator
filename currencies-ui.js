/* =========================================================
   CURRENCIES UI
   Stable replacement
========================================================= */

const CURRENCIES_API = "/api/currencies";


const EXCLUDED_CURRENCY_CODES = new Set([
    "XAG",
    "XAU",
    "XDR",
    "XPD",
    "XPT"
]);


/*
   Major cards are displayed as:

   USD / HKD
   USD / SGD
   USD / KRW
   USD / ZAR
   USD / NOK
   USD / SEK
   EUR / CZK
*/
const MAJOR_CURRENCY_PAIRS = [
    {
        base: "USD",
        target: "HKD",
        icon: "🇭🇰"
    },
    {
        base: "USD",
        target: "SGD",
        icon: "🇸🇬"
    },
    {
        base: "USD",
        target: "KRW",
        icon: "🇰🇷"
    },
    {
        base: "USD",
        target: "ZAR",
        icon: "🇿🇦"
    },
    {
        base: "USD",
        target: "NOK",
        icon: "🇳🇴"
    },
    {
        base: "USD",
        target: "SEK",
        icon: "🇸🇪"
    },
    {
        base: "EUR",
        target: "CZK",
        icon: "🇨🇿"
    }
];


let currenciesData = [];
let currencyRates = {};
let previousCurrencyRates = {};

let majorRates = {};
let majorPreviousRates = {};

let currenciesInitialized = false;


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


/* =========================================================
   FLAG
========================================================= */

function getCurrencyFlag(code) {

    const countryMap = {

        AED: "ae",
        AFN: "af",
        ALL: "al",
        AMD: "am",
        ANG: "cw",
        AOA: "ao",
        ARS: "ar",
        AUD: "au",
        AWG: "aw",
        AZN: "az",

        BAM: "ba",
        BBD: "bb",
        BDT: "bd",
        BHD: "bh",
        BIF: "bi",
        BMD: "bm",
        BND: "bn",
        BOB: "bo",
        BRL: "br",
        BSD: "bs",
        BTN: "bt",
        BWP: "bw",
        BYN: "by",
        BZD: "bz",

        CAD: "ca",
        CDF: "cd",
        CHF: "ch",
        CLP: "cl",
        CNY: "cn",
        CNH: "cn",
        COP: "co",
        CRC: "cr",
        CUP: "cu",
        CVE: "cv",
        CZK: "cz",

        DJF: "dj",
        DKK: "dk",
        DOP: "do",
        DZD: "dz",

        EGP: "eg",
        ERN: "er",
        ETB: "et",
        EUR: "eu",

        FJD: "fj",
        FKP: "fk",
        FOK: "fo",

        GBP: "gb",
        GEL: "ge",
        GGP: "gg",
        GHS: "gh",
        GIP: "gi",
        GMD: "gm",
        GNF: "gn",
        GTQ: "gt",
        GYD: "gy",

        HKD: "hk",
        HNL: "hn",
        HTG: "ht",
        HUF: "hu",

        IDR: "id",
        ILS: "il",
        IMP: "im",
        INR: "in",
        IQD: "iq",
        IRR: "ir",
        ISK: "is",

        JEP: "je",
        JMD: "jm",
        JOD: "jo",
        JPY: "jp",

        KES: "ke",
        KGS: "kg",
        KHR: "kh",
        KMF: "km",
        KPW: "kp",
        KRW: "kr",
        KWD: "kw",
        KYD: "ky",
        KZT: "kz",

        LAK: "la",
        LBP: "lb",
        LKR: "lk",
        LRD: "lr",
        LSL: "ls",
        LYD: "ly",

        MAD: "ma",
        MDL: "md",
        MGA: "mg",
        MKD: "mk",
        MMK: "mm",
        MNT: "mn",
        MOP: "mo",
        MRO: "mr",
        MRU: "mr",
        MUR: "mu",
        MVR: "mv",
        MWK: "mw",
        MXN: "mx",
        MYR: "my",
        MZN: "mz",

        NAD: "na",
        NGN: "ng",
        NIO: "ni",
        NOK: "no",
        NPR: "np",
        NZD: "nz",

        OMR: "om",

        PAB: "pa",
        PEN: "pe",
        PGK: "pg",
        PHP: "ph",
        PKR: "pk",
        PLN: "pl",
        PYG: "py",

        QAR: "qa",

        RON: "ro",
        RSD: "rs",
        RUB: "ru",
        RWF: "rw",

        SAR: "sa",
        SBD: "sb",
        SCR: "sc",
        SDG: "sd",
        SEK: "se",
        SGD: "sg",
        SHP: "sh",
        SLE: "sl",
        SOS: "so",
        SRD: "sr",
        SSP: "ss",
        STN: "st",
        SVC: "sv",
        SYP: "sy",
        SZL: "sz",

        THB: "th",
        TJS: "tj",
        TMT: "tm",
        TND: "tn",
        TOP: "to",
        TRY: "tr",
        TTD: "tt",
        TWD: "tw",
        TZS: "tz",

        UAH: "ua",
        UGX: "ug",
        USD: "us",
        UYU: "uy",
        UZS: "uz",

        VES: "ve",
        VND: "vn",
        VUV: "vu",

        WST: "ws",

        XCD: "ag",
        XCG: "cw",
        XAF: "cm",
        XOF: "sn",
        XPF: "pf",

        YER: "ye",

        ZAR: "za",
        ZMW: "zm",
        ZWG: "zw"

    };


    const normalizedCode =
        String(code || "")
            .trim()
            .toUpperCase();


    const country =
        countryMap[normalizedCode];


    if (!country) {

        return `
            <span class="currency-card-flag-fallback">
                🌐
            </span>
        `;

    }


    return `
        <img
            class="currency-card-flag-image"
            src="https://flagcdn.com/w80/${country}.png"
            alt=""
            loading="lazy"
        >
    `;

}


/* =========================================================
   FORMAT RATE
========================================================= */

function formatRate(rate) {

    const number =
        Number(rate);


    if (
        !Number.isFinite(number)
    ) {

        return "—";

    }


    return number.toLocaleString(
        undefined,
        {
            maximumFractionDigits: 6
        }
    );

}


/* =========================================================
   NORMALIZE RATE
========================================================= */

function normalizeRateValue(value) {

    if (
        value &&
        typeof value === "object"
    ) {

        value =
            value.rate;

    }


    const number =
        Number(value);


    if (
        !Number.isFinite(number) ||
        number <= 0
    ) {

        return NaN;

    }


    return number;

}


/* =========================================================
   NORMALIZE RATE MAP
========================================================= */

function normalizeRateMap(data) {

    const result = {};


    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {

        return result;

    }


    Object.keys(data).forEach(
        code => {

            const normalizedCode =
                String(code)
                    .trim()
                    .toUpperCase();


            const rate =
                normalizeRateValue(
                    data[code]
                );


            if (
                normalizedCode &&
                Number.isFinite(rate)
            ) {

                result[normalizedCode] =
                    rate;

            }

        }
    );


    return result;

}


/* =========================================================
   FILTER FIAT CURRENCIES
========================================================= */

function getFiatCurrencies(data) {

    if (!Array.isArray(data)) {
        return [];
    }


    return data
        .filter(
            currency => {

                if (
                    !currency ||
                    !currency.iso_code
                ) {

                    return false;

                }


                const code =
                    String(
                        currency.iso_code
                    )
                        .trim()
                        .toUpperCase();


                return (
                    !EXCLUDED_CURRENCY_CODES.has(
                        code
                    )
                );

            }
        )
        .sort(
            (a, b) =>
                String(a.name || "")
                    .localeCompare(
                        String(b.name || "")
                    )
        );

}


/* =========================================================
   RENDER MAIN UI
========================================================= */

function renderCurrenciesUI() {

    const app =
        document.getElementById(
            "currenciesApp"
        );


    if (!app) {
        return;
    }


    app.innerHTML = `

        <div class="money-block">

            <div class="money-block-header">

                <div>

                    <h3>
                        💱 Currencies
                    </h3>

                    <p>
                        Popular currencies & exchange rates
                    </p>

                </div>

            </div>


            <div class="money-block">

                <div class="money-block-header">

                    <div>

                        <h3>
                            Major currencies
                        </h3>

                        <p>
                            Important currencies from major economies
                        </p>

                    </div>

                </div>


                <div
                    class="money-grid"
                    id="majorCurrenciesGrid"
                >

                    <div class="money-card">
                        Loading exchange rates...
                    </div>

                </div>

            </div>


            <div class="money-block">

                <div class="money-block-header">

                    <div>

                        <h3>
                            All currencies
                        </h3>

                        <p>
                            Browse available fiat currencies
                        </p>

                    </div>

                </div>


                <div class="calculator-toolbar">

                    <div class="calculator-search">

                        <span class="calculator-search-icon">
                            🔎
                        </span>

                        <input
                            type="text"
                            id="currencySearch"
                            placeholder="Search currencies..."
                            autocomplete="off"
                        >

                    </div>

                </div>


                <div
                    class="money-grid"
                    id="allCurrenciesGrid"
                >

                    <div class="money-card">
                        Loading currencies...
                    </div>

                </div>

            </div>


            <div class="money-updated">

                Last updated:

                <span id="moneyLastUpdated">
                    —
                </span>

            </div>

        </div>

    `;


    const search =
        document.getElementById(
            "currencySearch"
        );


    if (search) {

        search.addEventListener(
            "input",
            handleCurrencySearch
        );

    }

}


/* =========================================================
   LOAD CURRENCIES
========================================================= */

async function loadCurrencies() {

    const allGrid =
        document.getElementById(
            "allCurrenciesGrid"
        );


    const majorGrid =
        document.getElementById(
            "majorCurrenciesGrid"
        );


    try {

        if (allGrid) {

            allGrid.innerHTML = `
                <div class="money-card">
                    Loading currencies...
                </div>
            `;

        }


        if (majorGrid) {

            majorGrid.innerHTML = `
                <div class="money-card">
                    Loading exchange rates...
                </div>
            `;

        }


        const response =
            await fetch(
                `${CURRENCIES_API}?base=EUR`,
                {
                    method: "GET",
                    cache: "no-store",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                `Currencies API error: ${response.status}`
            );

        }


        const data =
            await response.json();


        if (
            !data ||
            typeof data !== "object"
        ) {

            throw new Error(
                "Currencies API returned invalid data."
            );

        }


        /* =====================================================
           CURRENCIES
        ===================================================== */

        currenciesData =
            getFiatCurrencies(
                data.currencies
            );


        /* =====================================================
           CURRENT RATES
        ===================================================== */

        currencyRates = {};


        if (
            Array.isArray(data.rates)
        ) {

            data.rates.forEach(
                item => {

                    const code =
                        String(
                            item?.quote || ""
                        )
                            .trim()
                            .toUpperCase();


                    const rate =
                        normalizeRateValue(
                            item
                        );


                    if (
                        code &&
                        Number.isFinite(rate)
                    ) {

                        currencyRates[code] =
                            rate;

                    }

                }
            );

        }


        /* =====================================================
           PREVIOUS RATES
        ===================================================== */

        previousCurrencyRates = {};


        if (
            Array.isArray(
                data.previousRates
            )
        ) {

            data.previousRates.forEach(
                item => {

                    const code =
                        String(
                            item?.quote || ""
                        )
                            .trim()
                            .toUpperCase();


                    const rate =
                        normalizeRateValue(
                            item
                        );


                    if (
                        code &&
                        Number.isFinite(rate)
                    ) {

                        previousCurrencyRates[code] =
                            rate;

                    }

                }
            );

        }


        /* =====================================================
           MAJOR CURRENT RATES
        ===================================================== */

        majorRates =
            normalizeRateMap(
                data.majorRates
            );


        /* =====================================================
           MAJOR PREVIOUS RATES
        ===================================================== */

        majorPreviousRates =
            normalizeRateMap(
                data.majorPreviousRates
            );


        /*
           API already provides major rates.
           Normal EUR rates are only used as a fallback.
        */

        MAJOR_CURRENCY_PAIRS.forEach(
            pair => {

                const target =
                    String(
                        pair.target
                    )
                        .trim()
                        .toUpperCase();


                if (
                    !Number.isFinite(
                        majorRates[target]
                    )
                ) {

                    const fallback =
                        normalizeRateValue(
                            currencyRates[target]
                        );


                    if (
                        Number.isFinite(
                            fallback
                        )
                    ) {

                        majorRates[target] =
                            fallback;

                    }

                }

            }
        );


        console.log(
            "CURRENCY CURRENT RATES:",
            currencyRates
        );


        console.log(
            "CURRENCY PREVIOUS RATES:",
            previousCurrencyRates
        );


        console.log(
            "CURRENCY MAJOR RATES:",
            majorRates
        );


        console.log(
            "CURRENCY MAJOR PREVIOUS RATES:",
            majorPreviousRates
        );


        console.log(
            "CURRENCY API DATE:",
            data.date
        );


        console.log(
            "CURRENCY PREVIOUS DATE:",
            data.previousDate
        );


        /* =====================================================
           RENDER
        ===================================================== */

        renderMajorCurrencies();


        renderAllCurrencies(
            currenciesData
        );


        const updated =
            document.getElementById(
                "moneyLastUpdated"
            );


        if (updated) {

            updated.textContent =
                data.date || "—";

        }


    } catch (error) {

        console.error(
            "Currencies loading failed:",
            error
        );


        if (allGrid) {

            allGrid.innerHTML = `
                <div class="money-card">
                    Failed to load currencies.
                </div>
            `;

        }


        if (majorGrid) {

            majorGrid.innerHTML = `
                <div class="money-card">
                    Failed to load exchange rates.
                </div>
            `;

        }

    }

}


/* =========================================================
   GET EUR RATE
========================================================= */

function getEURRate(code) {

    const normalizedCode =
        String(code || "")
            .trim()
            .toUpperCase();


    if (!normalizedCode) {
        return NaN;
    }


    if (
        normalizedCode === "EUR"
    ) {

        return 1;

    }


    return normalizeRateValue(
        currencyRates[normalizedCode]
    );

}


/* =========================================================
   GET PREVIOUS EUR RATE
========================================================= */

function getPreviousEURRate(code) {

    const normalizedCode =
        String(code || "")
            .trim()
            .toUpperCase();


    if (!normalizedCode) {
        return NaN;
    }


    if (
        normalizedCode === "EUR"
    ) {

        return 1;

    }


    return normalizeRateValue(
        previousCurrencyRates[
            normalizedCode
        ]
    );

}


/* =========================================================
   GET RATE NUMBER
   Current EUR-based rate first.
   Major rate is fallback only.
========================================================= */

function getRateNumber(code) {

    const normalizedCode =
        String(code || "")
            .trim()
            .toUpperCase();


    if (!normalizedCode) {
        return NaN;
    }


    if (
        normalizedCode === "EUR"
    ) {

        return 1;

    }


    const normalRate =
        normalizeRateValue(
            currencyRates[
                normalizedCode
            ]
        );


    if (
        Number.isFinite(normalRate)
    ) {

        return normalRate;

    }


    const majorRate =
        normalizeRateValue(
            majorRates[
                normalizedCode
            ]
        );


    if (
        Number.isFinite(majorRate)
    ) {

        return majorRate;

    }


    return NaN;

}


/* =========================================================
   GET PREVIOUS RATE NUMBER
========================================================= */

function getPreviousRateNumber(code) {

    const normalizedCode =
        String(code || "")
            .trim()
            .toUpperCase();


    if (!normalizedCode) {
        return NaN;
    }


    if (
        normalizedCode === "EUR"
    ) {

        return 1;

    }


    const normalRate =
        normalizeRateValue(
            previousCurrencyRates[
                normalizedCode
            ]
        );


    if (
        Number.isFinite(normalRate)
    ) {

        return normalRate;

    }


    const majorRate =
        normalizeRateValue(
            majorPreviousRates[
                normalizedCode
            ]
        );


    if (
        Number.isFinite(majorRate)
    ) {

        return majorRate;

    }


    return NaN;

}


/* =========================================================
   GET CROSS RATE
========================================================= */

function getCrossRate(
    base,
    target
) {

    base =
        String(base || "")
            .trim()
            .toUpperCase();


    target =
        String(target || "")
            .trim()
            .toUpperCase();


    if (
        !base ||
        !target
    ) {

        return NaN;

    }


    if (
        base === target
    ) {

        return 1;

    }


    /*
       All API rates are EUR-based.

       Example:

       EUR/USD = 1.17
       EUR/HKD = 9.12

       Therefore:

       USD/HKD =
       EUR/HKD / EUR/USD

       = 9.12 / 1.17
    */

    const baseRate =
        getRateNumber(base);


    const targetRate =
        getRateNumber(target);


    if (
        !Number.isFinite(baseRate) ||
        !Number.isFinite(targetRate)
    ) {

        return NaN;

    }


    if (
        baseRate <= 0 ||
        targetRate <= 0
    ) {

        return NaN;

    }


    const crossRate =
        targetRate /
        baseRate;


    return Number.isFinite(
        crossRate
    )
        ? crossRate
        : NaN;

}


/* =========================================================
   GET CROSS RATE CHANGE
========================================================= */

function getCrossRateChange(
    base,
    target
) {

    base =
        String(base || "")
            .trim()
            .toUpperCase();


    target =
        String(target || "")
            .trim()
            .toUpperCase();


    if (
        !base ||
        !target
    ) {

        return NaN;

    }


    if (
        base === target
    ) {

        return 0;

    }


    const currentBase =
        getRateNumber(base);


    const currentTarget =
        getRateNumber(target);


    const previousBase =
        getPreviousRateNumber(base);


    const previousTarget =
        getPreviousRateNumber(target);


    if (
        !Number.isFinite(currentBase) ||
        !Number.isFinite(currentTarget) ||
        !Number.isFinite(previousBase) ||
        !Number.isFinite(previousTarget)
    ) {

        return NaN;

    }


    if (
        currentBase <= 0 ||
        currentTarget <= 0 ||
        previousBase <= 0 ||
        previousTarget <= 0
    ) {

        return NaN;

    }


    const currentCross =
        currentTarget /
        currentBase;


    const previousCross =
        previousTarget /
        previousBase;


    if (
        !Number.isFinite(currentCross) ||
        !Number.isFinite(previousCross) ||
        previousCross <= 0
    ) {

        return NaN;

    }


    return (
        (
            currentCross -
            previousCross
        ) /
        previousCross
    ) * 100;

}


/* =========================================================
   CURRENCY MOVEMENT SCALE
========================================================= */

function getCurrencyMovementWidth(
    value
) {

    const number =
        Number(value);


    if (
        !Number.isFinite(number) ||
        number === 0
    ) {

        return 0;

    }


    return Math.min(
        50,
        Math.max(
            4,
            Math.abs(number) * 10
        )
    );

}


/* =========================================================
   RENDER CURRENCY MOVEMENT
========================================================= */

function renderCurrencyMovement(
    change
) {

    const validChange =
        Number.isFinite(change)
            ? (
                Math.abs(change) < 0.005
                    ? 0
                    : change
            )
            : 0;


    const isUp =
        validChange > 0;


    const isDown =
        validChange < 0;


    const width =
        getCurrencyMovementWidth(
            validChange
        );


    const movementClass =
        isUp
            ? "market-up"
            : isDown
                ? "market-down"
                : "market-flat";


    const arrow =
        isUp
            ? "▲"
            : isDown
                ? "▼"
                : "—";


    const percentage =
        Number.isFinite(change)
            ? (
                Math.abs(change) < 0.005
                    ? "0.00"
                    : (
                        change > 0
                            ? "+"
                            : ""
                    ) +
                    change.toFixed(2)
            )
            : "—";


    return `
        <div
            class="currency-movement ${movementClass}"
            style="
                width:100%;
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
                gap:8px;
                color:var(--market-movement-color);
            "
        >

            <div
                class="currency-movement-line"
                style="
                    position:relative;
                    width:92%;
                    height:3px;
                    background:rgba(128,128,128,.30);
                    border-radius:999px;
                "
            >

                ${
                    isDown
                        ? `
                            <span
                                style="
                                    position:absolute;
                                    height:3px;
                                    width:${width}%;
                                    right:50%;
                                    top:0;
                                    background:currentColor;
                                    border-radius:999px 0 0 999px;
                                "
                            ></span>
                        `
                        : ""
                }


                ${
                    isUp
                        ? `
                            <span
                                style="
                                    position:absolute;
                                    height:3px;
                                    width:${width}%;
                                    left:50%;
                                    top:0;
                                    background:currentColor;
                                    border-radius:0 999px 999px 0;
                                "
                            ></span>
                        `
                        : ""
                }


                <span
                    style="
                        position:absolute;
                        width:9px;
                        height:9px;
                        left:50%;
                        top:50%;
                        transform:translate(-50%,-50%);
                        border-radius:50%;
                        background:currentColor;
                        z-index:2;
                    "
                ></span>

            </div>


            <strong>
                ${arrow} ${percentage}%
            </strong>

        </div>
    `;

}


/* =========================================================
   RENDER MAJOR CURRENCIES
========================================================= */

function renderMajorCurrencies() {

    const grid =
        document.getElementById(
            "majorCurrenciesGrid"
        );


    if (!grid) {
        return;
    }


    grid.innerHTML = "";


    MAJOR_CURRENCY_PAIRS.forEach(
        pair => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "money-card";


            const rate =
                getCrossRate(
                    pair.base,
                    pair.target
                );


            const targetCurrency =
                currenciesData.find(
                    currency =>
                        String(
                            currency?.iso_code || ""
                        )
                            .trim()
                            .toUpperCase() ===
                        pair.target
                );


            const targetName =
                targetCurrency?.name ||
                pair.target;


            const change =
                getCrossRateChange(
                    pair.base,
                    pair.target
                );


            card.innerHTML = `

                <div class="money-card-main">

                    <div class="money-icon">

                        ${getCurrencyFlag(
                            pair.target
                        )}

                    </div>


                    <div>

                        <strong>
                            ${currencyEscapeHtml(pair.base)}
                            /
                            ${currencyEscapeHtml(pair.target)}
                        </strong>


                        <small>
                            ${currencyEscapeHtml(pair.base)}
                            /
                            ${currencyEscapeHtml(targetName)}
                        </small>

                    </div>

                </div>


                <div class="money-price">

                    <small>
                        Exchange rate
                    </small>


                    <strong class="major-exchange-rate">

                        ${
                            Number.isFinite(rate)
                                ? `1 ${currencyEscapeHtml(pair.base)} = ${formatRate(rate)} ${currencyEscapeHtml(pair.target)}`
                                : "Exchange rate unavailable"
                        }

                    </strong>

                </div>


                ${renderCurrencyMovement(change)}

            `;


            grid.appendChild(
                card
            );

        }
    );

}


/* =========================================================
   RENDER ALL CURRENCIES
========================================================= */

function renderAllCurrencies(
    currencies
) {

    const grid =
        document.getElementById(
            "allCurrenciesGrid"
        );


    if (!grid) {
        return;
    }


    if (
        !Array.isArray(currencies) ||
        !currencies.length
    ) {

        grid.innerHTML = `
            <div class="money-card">
                No currencies found.
            </div>
        `;

        return;

    }


    grid.innerHTML = "";


    currencies.forEach(
        currency => {

            const code =
                String(
                    currency?.iso_code || ""
                )
                    .trim()
                    .toUpperCase();


            if (!code) {
                return;
            }


            const rate =
                getEURRate(code);


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "money-card";


            const change =
                getCrossRateChange(
                    "EUR",
                    code
                );


            const currencyName =
                currency?.name ||
                code;


            card.innerHTML = `

                <div class="money-card-main">

                    <div class="money-icon">

                        ${getCurrencyFlag(code)}

                    </div>


                    <div>

                        <strong>
                            EUR / ${currencyEscapeHtml(code)}
                        </strong>


                        <small>
                            EUR /
                            ${currencyEscapeHtml(
                                currencyName
                            )}
                        </small>

                    </div>

                </div>


                <div class="money-price">

                    <small>
                        Exchange rate
                    </small>


                    <strong class="major-exchange-rate">

                        ${
                            code === "EUR"
                                ? "1 EUR = 1 EUR"
                                : Number.isFinite(rate)
                                    ? `1 EUR = ${formatRate(rate)} ${currencyEscapeHtml(code)}`
                                    : "Exchange rate unavailable"
                        }

                    </strong>

                </div>


                ${renderCurrencyMovement(change)}

            `;


            grid.appendChild(
                card
            );

        }
    );

}


/* =========================================================
   SEARCH
========================================================= */

function handleCurrencySearch(
    event
) {

    const query =
        String(
            event?.target?.value || ""
        )
            .trim()
            .toLowerCase();


    if (!query) {

        renderAllCurrencies(
            currenciesData
        );

        return;

    }


    const filtered =
        currenciesData.filter(
            currency => {

                const code =
                    String(
                        currency?.iso_code || ""
                    )
                        .toLowerCase();


                const name =
                    String(
                        currency?.name || ""
                    )
                        .toLowerCase();


                const symbol =
                    String(
                        currency?.symbol || ""
                    )
                        .toLowerCase();


                return (
                    code.includes(query) ||
                    name.includes(query) ||
                    symbol.includes(query)
                );

            }
        );


    renderAllCurrencies(
        filtered
    );

}


/* =========================================================
   INIT
========================================================= */

async function initCurrenciesUI() {

    renderCurrenciesUI();


    await loadCurrencies();


    currenciesInitialized =
        true;

}


/* =========================================================
   GLOBAL EXPORTS
========================================================= */

window.initCurrenciesUI =
    initCurrenciesUI;

window.renderCurrenciesUI =
    renderCurrenciesUI;

window.loadCurrencies =
    loadCurrencies;
