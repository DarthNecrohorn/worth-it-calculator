/* =========================================================
   CURRENCIES UI
========================================================= */

const CURRENCIES_API = "/api/currencies";

/*
    Currencies that should NOT appear in the
    normal fiat currency list.

    These are metals, commodities or special units
    that already belong elsewhere in the website.
*/
const EXCLUDED_CURRENCY_CODES = new Set([
    "XAG",
    "XAU",
    "XDR",
    "XPD",
    "XPT"
]);


/* =========================================================
   MAJOR CURRENCY PAIRS
========================================================= */

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


/* =========================================================
   STATE
========================================================= */

let currenciesData = [];
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
                        Loading...
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
   LOAD CURRENCIES
========================================================= */

async function loadCurrencies() {

    const allGrid =
        document.getElementById(
            "allCurrenciesGrid"
        );

    if (allGrid) {

        allGrid.innerHTML = `
            <div class="money-card">
                Loading currencies...
            </div>
        `;

    }


    try {

        const response =
            await fetch(CURRENCIES_API);


        if (!response.ok) {

            throw new Error(
                `Currencies API error: ${response.status}`
            );

        }


        const data =
            await response.json();


        currenciesData =
            getFiatCurrencies(data);


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
                new Date().toLocaleTimeString(
                    [],
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                );

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

    }

}


/* =========================================================
   RENDER MAJOR CURRENCIES
========================================================= */

async function renderMajorCurrencies() {

    const grid =
        document.getElementById(
            "majorCurrenciesGrid"
        );

    if (!grid) {
        return;
    }


    grid.innerHTML = "";


    for (
        const pair
        of MAJOR_CURRENCY_PAIRS
    ) {

        const card =
            document.createElement("div");

        card.className =
            "money-card";


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
                        Loading exchange rate...
                    </small>

                </div>

            </div>


            <div class="money-price">

                <strong>
                    —
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


        loadMajorCurrencyRate(
            pair,
            card
        );

    }

}


/* =========================================================
   LOAD MAJOR RATE
========================================================= */

async function loadMajorCurrencyRate(
    pair,
    card
) {

    try {

        const url =
            `https://api.frankfurter.dev/v2/rate/${pair.base}/${pair.target}`;


        const response =
            await fetch(url);


        if (!response.ok) {

            throw new Error(
                `Rate error: ${response.status}`
            );

        }


        const data =
            await response.json();


        const rate =
            Number(data.rate);


        if (!Number.isFinite(rate)) {
            throw new Error(
                "Invalid exchange rate"
            );
        }


        const name =
            currenciesData.find(
                currency =>
                    currency.iso_code === pair.target
            )?.name || pair.target;


        const small =
            card.querySelector(
                ".money-card-main small"
            );

        if (small) {

            small.textContent =
                `${pair.base} / ${name}`;

        }


        const price =
            card.querySelector(
                ".money-price strong"
            );

        if (price) {

            price.textContent =
                rate.toLocaleString(
                    undefined,
                    {
                        maximumFractionDigits: 6
                    }
                );

        }

    } catch (error) {

        console.error(
            `Failed to load ${pair.base}/${pair.target}:`,
            error
        );

    }

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


    currencies.forEach(currency => {

        const card =
            document.createElement("div");

        card.className =
            "money-card";


        card.innerHTML = `

            <div class="money-card-main">

                <span class="money-icon">
                    💱
                </span>

                <div>

                    <strong>
                        ${currencyEscapeHtml(
                            currency.iso_code
                        )}
                    </strong>

                    <small>
                        ${currencyEscapeHtml(
                            currency.name
                        )}
                    </small>

                </div>

            </div>

        `;


        grid.appendChild(card);

    });

}


/* =========================================================
   SEARCH
========================================================= */

function handleCurrencySearch(event) {

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
        currenciesData.filter(currency => {

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

        });


    renderAllCurrencies(
        filtered
    );

}


/* =========================================================
   INIT
========================================================= */

async function initCurrenciesUI() {

    if (currenciesInitialized) {

        renderCurrenciesUI();

        if (currenciesData.length) {

            renderMajorCurrencies();

            renderAllCurrencies(
                currenciesData
            );

        }

        return;

    }


    currenciesInitialized = true;


    renderCurrenciesUI();

    await loadCurrencies();

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
