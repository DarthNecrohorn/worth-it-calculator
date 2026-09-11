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

    const specialFlags = {
        EUR: "🇪🇺",
        USD: "🇺🇸",
        GBP: "🇬🇧",
        RSD: "🇷🇸",
        CHF: "🇨🇭",
        JPY: "🇯🇵",
        CNY: "🇨🇳",
        CNH: "🇨🇳",
        CAD: "🇨🇦",
        AUD: "🇦🇺",
        NZD: "🇳🇿",
        SEK: "🇸🇪",
        NOK: "🇳🇴",
        DKK: "🇩🇰",
        PLN: "🇵🇱",
        CZK: "🇨🇿",
        HUF: "🇭🇺",
        RON: "🇷🇴",
        BGN: "🇧🇬",
        MKD: "🇲🇰",
        BAM: "🇧🇦",
        TRY: "🇹🇷",
        UAH: "🇺🇦",
        RUB: "🇷🇺",
        ZAR: "🇿🇦",
        HKD: "🇭🇰",
        SGD: "🇸🇬",
        KRW: "🇰🇷",
        INR: "🇮🇳",
        BRL: "🇧🇷",
        MXN: "🇲🇽",
        AED: "🇦🇪",
        SAR: "🇸🇦",
        ILS: "🇮🇱",
        THB: "🇹🇭",
        MYR: "🇲🇾",
        IDR: "🇮🇩",
        PHP: "🇵🇭",
        VND: "🇻🇳",
        PKR: "🇵🇰",
        EGP: "🇪🇬",
        NGN: "🇳🇬",
        KZT: "🇰🇿",
        GEL: "🇬🇪",
        ISK: "🇮🇸",
        CLP: "🇨🇱",
        COP: "🇨🇴",
        PEN: "🇵🇪",
        UYU: "🇺🇾",
        MAD: "🇲🇦"
    };

    return specialFlags[code] || "🌐";
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


            card.innerHTML = `

                <div class="money-card-main">

                    <span class="money-icon">
                        ${pair.icon}
                    </span>

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

                    <strong>
                        ${formatRate(rate)}
                    </strong>

                    <small>
                        Exchange rate
                    </small>

                </div>


                <div class="money-movement">

                    <div class="movement-scale">
                        <span></span>
                    </div>

                    <strong>
                        —
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
                "money-card";


            const rateText =
                code === "EUR"
                    ? "1 EUR = 1 EUR"
                    : Number.isFinite(rate)
                        ? `1 EUR = ${formatRate(rate)} ${code}`
                        : "Exchange rate unavailable";


            card.innerHTML = `

                <div class="money-card-main">

                    <span class="money-icon">
                        ${getCurrencyFlag(code)}
                    </span>

                    <div>

                        <strong>
                            ${currencyEscapeHtml(code)}
                        </strong>

                        <small>
                            ${currencyEscapeHtml(
                                currency.name
                            )}
                        </small>

                    </div>

                </div>


                <div class="money-price">

                    <strong>
                        ${currencyEscapeHtml(
                            currency.symbol || code
                        )}
                    </strong>

                    <small>
                        ${currencyEscapeHtml(
                            rateText
                        )}
                    </small>

                </div>


                <div class="money-movement">

                    <div class="movement-scale">
                        <span></span>
                    </div>

                    <strong>
                        ${Number.isFinite(rate)
                            ? formatRate(rate)
                            : "—"}
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
