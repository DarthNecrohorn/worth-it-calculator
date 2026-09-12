/* =========================================================
   CURRENCIES UI
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


function getCurrencyFlag(code) {

    const countryMap = {
        AED:"ae",
        AFN:"af",
        ALL:"al",
        AMD:"am",
        ANG:"cw",
        AOA:"ao",
        ARS:"ar",
        AUD:"au",
        AWG:"aw",
        AZN:"az",
        BAM:"ba",
        BBD:"bb",
        BDT:"bd",
        BHD:"bh",
        BIF:"bi",
        BMD:"bm",
        BND:"bn",
        BOB:"bo",
        BRL:"br",
        BSD:"bs",
        BTN:"bt",
        BWP:"bw",
        BYN:"by",
        BZD:"bz",
        CAD:"ca",
        CDF:"cd",
        CHF:"ch",
        CLP:"cl",
        CNY:"cn",
        CNH:"cn",
        COP:"co",
        CRC:"cr",
        CUP:"cu",
        CVE:"cv",
        CZK:"cz",
        DJF:"dj",
        DKK:"dk",
        DOP:"do",
        DZD:"dz",
        EGP:"eg",
        ERN:"er",
        ETB:"et",
        EUR:"eu",
        FJD:"fj",
        FKP:"fk",
        FOK:"fo",
        GBP:"gb",
        GEL:"ge",
        GGP:"gg",
        GHS:"gh",
        GIP:"gi",
        GMD:"gm",
        GNF:"gn",
        GTQ:"gt",
        GYD:"gy",
        HKD:"hk",
        HNL:"hn",
        HTG:"ht",
        HUF:"hu",
        IDR:"id",
        ILS:"il",
        IMP:"im",
        INR:"in",
        IQD:"iq",
        IRR:"ir",
        ISK:"is",
        JEP:"je",
        JMD:"jm",
        JOD:"jo",
        JPY:"jp",
        KES:"ke",
        KGS:"kg",
        KHR:"kh",
        KMF:"km",
        KPW:"kp",
        KRW:"kr",
        KWD:"kw",
        KYD:"ky",
        KZT:"kz",
        LAK:"la",
        LBP:"lb",
        LKR:"lk",
        LRD:"lr",
        LSL:"ls",
        LYD:"ly",
        MAD:"ma",
        MDL:"md",
        MGA:"mg",
        MKD:"mk",
        MMK:"mm",
        MNT:"mn",
        MOP:"mo",
        MRO:"mr",
        MRU:"mr",
        MUR:"mu",
        MVR:"mv",
        MWK:"mw",
        MXN:"mx",
        MYR:"my",
        MZN:"mz",
        NAD:"na",
        NGN:"ng",
        NIO:"ni",
        NOK:"no",
        NPR:"np",
        NZD:"nz",
        OMR:"om",
        PAB:"pa",
        PEN:"pe",
        PGK:"pg",
        PHP:"ph",
        PKR:"pk",
        PLN:"pl",
        PYG:"py",
        QAR:"qa",
        RON:"ro",
        RSD:"rs",
        RUB:"ru",
        RWF:"rw",
        SAR:"sa",
        SBD:"sb",
        SCR:"sc",
        SDG:"sd",
        SEK:"se",
        SGD:"sg",
        SHP:"sh",
        SLE:"sl",
        SOS:"so",
        SRD:"sr",
        SSP:"ss",
        STN:"st",
        SVC:"sv",
        SYP:"sy",
        SZL:"sz",
        THB:"th",
        TJS:"tj",
        TMT:"tm",
        TND:"tn",
        TOP:"to",
        TRY:"tr",
        TTD:"tt",
        TWD:"tw",
        TZS:"tz",
        UAH:"ua",
        UGX:"ug",
        USD:"us",
        UYU:"uy",
        UZS:"uz",
        VES:"ve",
        VND:"vn",
        VUV:"vu",
        WST:"ws",
        XCD:"ag",
        XCG:"cw",
        XAF:"cm",
        XOF:"sn",
        XPF:"pf",
        YER:"ye",
        ZAR:"za",
        ZMW:"zm",
        ZWG:"zw"
    };

    const country = countryMap[code];

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


function formatRate(rate) {

    const number =
        Number(rate);

    if (!Number.isFinite(number)) {
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
   FILTER FIAT CURRENCIES
========================================================= */

function getFiatCurrencies(data) {

    if (!Array.isArray(data)) {
        return [];
    }

    return data
        .filter(currency => {

            if (!currency || !currency.iso_code) {
                return false;
            }

            return !EXCLUDED_CURRENCY_CODES.has(
                currency.iso_code
            );

        })
        .sort((a, b) =>
            String(a.name || "").localeCompare(
                String(b.name || "")
            )
        );
}


/* =========================================================
   RENDER MAIN UI
========================================================= */

function renderCurrenciesUI() {

    const app =
        document.getElementById("currenciesApp");

    if (!app) {
        return;
    }

    app.innerHTML = `

        <div class="money-block">

            <div class="money-block-header">
                <div>
                    <h3>💱 Currencies</h3>
                    <p>
                        Popular currencies & exchange rates
                    </p>
                </div>
            </div>


            <!-- MAJOR CURRENCIES -->

            <div class="money-block">

                <div class="money-block-header">
                    <div>
                        <h3>Major currencies</h3>
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


            <!-- ALL CURRENCIES -->

            <div class="money-block">

                <div class="money-block-header">
                    <div>
                        <h3>All currencies</h3>
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
   LOAD CURRENCIES + RATES
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
                `${CURRENCIES_API}?base=EUR`
            );


        if (!response.ok) {

            throw new Error(
                `Currencies API error: ${response.status}`
            );

        }


        const data =
            await response.json();


        currenciesData =
            getFiatCurrencies(
                data.currencies
            );


        currencyRates = {};


        if (Array.isArray(data.rates)) {

            data.rates.forEach(rate => {

                if (
                    rate &&
                    rate.quote &&
                    Number.isFinite(
                        Number(rate.rate)
                    )
                ) {

                    currencyRates[
                        rate.quote
                    ] =
                        Number(rate.rate);

                }

            });

        }

       previousCurrencyRates = {};

if (Array.isArray(data.previousRates)) {

    data.previousRates.forEach(rate => {

        if (
            rate &&
            rate.quote &&
            Number.isFinite(
                Number(rate.rate)
            )
        ) {
            previousCurrencyRates[
                rate.quote
            ] =
                Number(rate.rate);
        }
    });
}

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
   GET CROSS RATE
========================================================= */

function getCrossRate(
    base,
    target
) {

    if (base === target) {
        return 1;
    }


    const baseRate =
        Number(
            currencyRates[base]
        );

    const targetRate =
        Number(
            currencyRates[target]
        );


    if (
        !Number.isFinite(baseRate) ||
        !Number.isFinite(targetRate) ||
        baseRate === 0
    ) {

        return null;

    }


    return targetRate / baseRate;

}

function getCrossRateChange(
    base,
    target
) {

    const currentRate =
        getCrossRate(
            base,
            target
        );

    if (!Number.isFinite(currentRate)) {
        return null;
    }

    const basePrevious =
        Number(
            previousCurrencyRates[base]
        );

    const targetPrevious =
        Number(
            previousCurrencyRates[target]
        );

    if (
        !Number.isFinite(basePrevious) ||
        !Number.isFinite(targetPrevious) ||
        basePrevious === 0
    ) {
        return null;
    }

    const previousRate =
        targetPrevious / basePrevious;

    if (
        !Number.isFinite(previousRate) ||
        previousRate === 0
    ) {
        return null;
    }

    return (
        (currentRate - previousRate) /
        previousRate
    ) * 100;
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
                        currency.iso_code ===
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


            const changeIsUp =
                change > 0;


            const changeIsDown =
                change < 0;


            const movementClass =
                changeIsUp
                    ? "market-up"
                    : changeIsDown
                        ? "market-down"
                        : "market-flat";


            const arrow =
                changeIsUp
                    ? "▲"
                    : changeIsDown
                        ? "▼"
                        : "—";


            const width =
                Number.isFinite(change)
                    ? Math.min(
                        50,
                        Math.max(
                            4,
                            Math.abs(change) * 10
                        )
                    )
                    : 0;


            card.innerHTML = `

                <div class="money-card-main">

                    <div class="money-icon">
                        ${getCurrencyFlag(pair.target)}
                    </div>

                    <div>

                        <strong>
                            ${pair.base} / ${pair.target}
                        </strong>

                        <small>
                            ${pair.base} / ${targetName}
                        </small>

                    </div>

                </div>


                <div class="money-price">

                    <small>
                        Exchange rate
                    </small>

                    <strong>
                        ${formatRate(rate)}
                    </strong>

                </div>


                <div
                    class="market-movement ${movementClass}"
                    style="color:var(--market-movement-color);"
                >

                    <div class="movement-scale">

                        <span
                            class="movement-bar"
                            style="
                                width:${width}%;

                                ${
                                    changeIsUp
                                        ? "left:50%;"
                                        : ""
                                }

                                ${
                                    changeIsDown
                                        ? "right:50%;"
                                        : ""
                                }
                            "
                        ></span>

                    </div>

                    <strong>

                        ${
                            Number.isFinite(change)
                                ? `${arrow} ${change > 0 ? "+" : ""}${change.toFixed(2)}%`
                                : "—"
                        }

                    </strong>

                </div>

            `;


            grid.appendChild(card);

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


    if (!currencies.length) {

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
                currency.iso_code;

            const rate =
                Number(
                    currencyRates[code]
                );


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "currency-card";


            const rateText =
                code === "EUR"
                    ? "1 EUR = 1 EUR"
                    : Number.isFinite(rate)
                        ? `1 EUR = ${formatRate(rate)} ${code}`
                        : "Exchange rate unavailable";


            const change =
                getCrossRateChange(
                    "EUR",
                    code
                );


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
                            EUR / ${currencyEscapeHtml(currency.name || code)}
                        </small>

                    </div>

                </div>


                <div class="money-price">

                    <div class="movement-scale">

                        ${
                            (() => {

                                if (!Number.isFinite(change)) {

                                    return `
                                        <span
                                            class="movement-bar"
                                            style="
                                                left:50%;
                                                width:0;
                                                color:var(--muted);
                                            "
                                        ></span>
                                    `;

                                }


                                const capped =
                                    Math.min(
                                        Math.abs(change),
                                        5
                                    );


                                const width =
                                    (capped / 5) * 50;


                                if (change >= 0) {

                                    return `
                                        <span
                                            class="movement-bar"
                                            style="
                                                left:50%;
                                                width:${width}%;
                                                color:#34d399;
                                            "
                                        ></span>
                                    `;

                                }


                                return `
                                    <span
                                        class="movement-bar"
                                        style="
                                            left:${50 - width}%;
                                            width:${width}%;
                                            color:#fb7185;
                                        "
                                    ></span>
                                `;

                            })()
                        }

                    </div>


                    <small>
                        Exchange rate
                    </small>


                    <strong>
                        ${currencyEscapeHtml(rateText)}
                    </strong>

                </div>


                <div class="money-movement">

                    <strong>
                        ${
                            Number.isFinite(change)
                                ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%`
                                : "—"
                        }
                    </strong>

                </div>

            `;


            grid.appendChild(card);

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
            event.target.value || ""
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
                        currency.iso_code || ""
                    ).toLowerCase();


                const name =
                    String(
                        currency.name || ""
                    ).toLowerCase();


                const symbol =
                    String(
                        currency.symbol || ""
                    ).toLowerCase();


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

    currenciesInitialized = true;

}


/* =========================================================
   GLOBAL EXPORT
========================================================= */

window.initCurrenciesUI =
    initCurrenciesUI;

window.renderCurrenciesUI =
    renderCurrenciesUI;

window.loadCurrencies =
    loadCurrencies;
