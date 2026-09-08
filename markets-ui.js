/* =========================================================
MARKETS
========================================================= */

const MARKET_CONFIG = {

    GOLD_USD: {
        name: "Gold",
        symbol: "XAU",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M10 17h28l-5 19H15z" fill="currentColor" opacity=".18"/>
                <path d="M10 17h28l-5 19H15z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M14 17l4-7h12l4 7"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M17 24h14M16 29h12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "g",
        usUnit: "oz",
        conversion: 1 / 31.1034768
    },

    SILVER_USD: {
        name: "Silver",
        symbol: "XAG",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M10 17h28l-5 19H15z" fill="currentColor" opacity=".12"/>
                <path d="M10 17h28l-5 19H15z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M14 17l4-7h12l4 7"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M17 24h14M16 29h12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "g",
        usUnit: "oz",
        conversion: 1 / 31.1034768
    },

    PLATINUM_USD: {
        name: "Platinum",
        symbol: "XPT",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M11 16h26l-4 21H15z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M11 16h26l-4 21H15z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M15 16l4-6h10l4 6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M18 23h12M17 29h14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "g",
        usUnit: "oz",
        conversion: 1 / 31.1034768
    },

    PALLADIUM_USD: {
        name: "Palladium",
        symbol: "XPD",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M24 8l14 8-4 21H14l-4-21z"
                      fill="currentColor"
                      opacity=".12"/>
                <path d="M24 8l14 8-4 21H14l-4-21z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M17 18h14M18 25h12M19 31h10"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "g",
        usUnit: "oz",
        conversion: 1 / 31.1034768
    },

    COPPER_USD: {
        name: "Copper",
        symbol: "COPPER",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M10 25c0-7 6-12 14-12s14 5 14 12-6 11-14 11-14-4-14-11z"
                      fill="currentColor"
                      opacity=".16"/>
                <path d="M10 25c0-7 6-12 14-12s14 5 14 12-6 11-14 11-14-4-14-11z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"/>
                <path d="M15 20c4-3 14-3 18 0"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "kg",
        usUnit: "lb",
        conversion: 2.20462262185
    },

    IRON_ORE_USD: {
        name: "Iron Ore",
        symbol: "IRON",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M10 31l7-18 10-4 11 9-5 17-14 3z"
                      fill="currentColor"
                      opacity=".16"/>
                <path d="M10 31l7-18 10-4 11 9-5 17-14 3z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M17 19l8 4 8-5M16 27l8 3 7-3"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"/>
            </svg>
        `,
        eurUnit: "metric ton",
        usUnit: "metric ton",
        conversion: 1
    },

    ALUMINUM_USD: {
        name: "Aluminum",
        symbol: "ALUMINUM",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M13 12h22v24H13z"
                      fill="currentColor"
                      opacity=".12"/>
                <path d="M13 12h22v24H13z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M18 12v24M30 12v24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
                <path d="M13 20h22M13 28h22"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "kg",
        usUnit: "lb",
        conversion: 2.20462262185
    },

    WTI_USD: {
        name: "Crude Oil",
        symbol: "WTI",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M14 11h20v26H14z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M14 11h20v26H14z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M14 17h20M14 31h20"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"/>
                <path d="M19 22h10M19 26h10"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "liter",
        usUnit: "barrel",
        conversion: 1 / 158.9872949
    },

    NATURAL_GAS_USD: {
        name: "Natural Gas",
        symbol: "NATGAS",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M25 7c4 7 10 10 10 19 0 8-5 14-12 14S11 34 11 27c0-6 3-10 8-15 1 5 4 7 5 8 2-4 1-8 1-13z"
                      fill="currentColor"
                      opacity=".18"/>
                <path d="M25 7c4 7 10 10 10 19 0 8-5 14-12 14S11 34 11 27c0-6 3-10 8-15 1 5 4 7 5 8 2-4 1-8 1-13z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M24 25c2 3 3 5 3 7 0 2-1 4-3 4s-4-2-4-5c0-2 1-4 2-6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "MWh",
        usUnit: "MMBtu",
        conversion: 3.412141633
    }

};

/* =========================================================
USD → EUR EXCHANGE RATE
========================================================= */

const EUR_RATE_CACHE_KEY =
    "worth_it_usd_eur_rate";

const EUR_RATE_CACHE_DURATION =
    60 * 60 * 1000; // 1 hour

let usdToEurRate = null;


async function getUsdToEurRate() {

    try {

        const cached =
            localStorage.getItem(
                EUR_RATE_CACHE_KEY
            );

        if (cached) {

            const parsed =
                JSON.parse(cached);

            if (
                Number.isFinite(
                    Number(parsed.rate)
                ) &&
                Date.now() - Number(parsed.timestamp)
                    < EUR_RATE_CACHE_DURATION
            ) {

                return Number(parsed.rate);

            }

        }

    } catch (error) {

        console.warn(
            "Could not read cached EUR rate:",
            error
        );

    }


    try {

          const response =
             await fetch(
             "/api/exchange-rate",
          {
              method: "GET",
              cache: "no-store"
          }
     );


        if (!response.ok) {

            throw new Error(
                "EUR exchange rate request failed."
            );

        }


        const data =
            await response.json();


        const rate =
            Number(
            data?.rate
       );
        
        if (
            !Number.isFinite(rate) ||
            rate <= 0
        ) {

            throw new Error(
                "Invalid USD to EUR exchange rate."
            );

        }


        try {

            localStorage.setItem(
                EUR_RATE_CACHE_KEY,
                JSON.stringify({
                    rate,
                    timestamp: Date.now()
                })
            );

        } catch (error) {

            console.warn(
                "Could not cache EUR rate:",
                error
            );

        }


        return rate;

    } catch (error) {

        console.error(
            "USD → EUR exchange rate error:",
            error
        );

        return null;

    }

}


/* =========================================================
FORMATTING
========================================================= */

function formatMarketPrice(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return number.toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );

}


function formatMarketChange(value) {

    const number =
        Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    const sign =
        number > 0
            ? "+"
            : "";

    return `${sign}${number.toFixed(2)}%`;

}


/* =========================================================
MOVEMENT BAR
========================================================= */

function getMarketMovementWidth(value) {

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
RENDER MARKETS
========================================================= */

function renderMarkets(
    data,
    exchangeRate = null
) {

    const grid =
        document.getElementById(
            "materialsGrid"
        );

    if (!grid) return;


    const prices =
        Array.isArray(
            data?.data?.prices
        )
            ? data.data.prices
            : [];


    if (!prices.length) {

        grid.innerHTML = `
            <div class="market-card">

                <div class="market-card-main">

                    <div class="market-icon">
                        ⚠️
                    </div>

                    <div>

                        <strong>
                            No market data
                        </strong>

                        <small>
                            Unable to load current prices
                        </small>

                    </div>

                </div>

            </div>
        `;

        return;

    }


    grid.innerHTML =
        prices.map(item => {

            const config =
                MARKET_CONFIG[item.code];

            if (!config) {
                return "";
            }


            const change =
                Number(
                    item?.changes?.["24h"]?.percent
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
                getMarketMovementWidth(
                    change
                );


            const usdPrice =
                Number(item.price);


            const formattedUsdPrice =
                formatMarketPrice(
                    usdPrice
                );


            let formattedEurPrice =
                "—";


            if (
                Number.isFinite(usdPrice) &&
                Number.isFinite(exchangeRate) &&
                exchangeRate > 0
            ) {

                const eurPrice =
                usdPrice *
                exchangeRate *
                config.conversion;

                formattedEurPrice =
                    formatMarketPrice(
                        eurPrice
                    );

            }


            return `
                <div class="market-card">

                    <div class="market-card-main">

                        <div class="market-icon">
                            ${config.icon}
                        </div>

                        <div>

                            <strong>
                                ${config.name}
                            </strong>

                            <small>
                                ${config.symbol}
                            </small>

                        </div>

                    </div>


                    <div class="market-price">

                    <strong class="market-price-eur">
                    €${formattedEurPrice}
                    <small>/ ${config.eurUnit}</small>
              </strong>

                    <span class="market-price-usd">
                    $${formattedUsdPrice}
                    <small>/ ${config.usUnit}</small>
              </span>

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

                                    ${changeIsUp
                                        ? "left:50%;"
                                        : ""}

                                    ${changeIsDown
                                        ? "right:50%;"
                                        : ""}
                                "
                            ></span>

                        </div>

                        <strong>
                            ${arrow}
                            ${formatMarketChange(change)}
                        </strong>

                    </div>

                </div>
            `;

        }).join("");


    /* =====================================================
    UPDATED TIME
    ===================================================== */

    const updated =
        data?.data?.prices?.reduce(
            (latest, item) => {

                const time =
                    new Date(
                        item.updated_at || 0
                    ).getTime();

                return time > latest
                    ? time
                    : latest;

            },
            0
        );


    const updatedElement =
        document.getElementById(
            "marketsUpdated"
        );


    if (
        updatedElement &&
        updated
    ) {

        updatedElement.textContent =
            `Updated ${new Date(updated).toLocaleString(
                "en-US",
                {
                    dateStyle: "medium",
                    timeStyle: "short"
                }
            )}`;

    }

}


/* =========================================================
REFRESH MARKETS
========================================================= */

async function refreshMarkets() {
    
    const grid =
        document.getElementById(
            "materialsGrid"
        );

    if (!grid) return;


    const refreshButton =
        document.querySelector(
            ".markets-refresh-btn"
        );


    if (refreshButton) {

        refreshButton.disabled = true;

        refreshButton.textContent =
            "↻ Loading...";

    }


    try {

                const [
            marketResponse,
            exchangeRate
        ] = await Promise.all([

            fetch(
                "/api/markets",
                {
                    method: "GET",
                    cache: "no-store"
                }
            ),

            getUsdToEurRate()

        ]);

        const data =
            await marketResponse.json();
   
        if (!marketResponse.ok) {

            throw new Error(
                data?.error ||
                "Markets API request failed."
            );

        }


        renderMarkets(
            data,
            exchangeRate
        );


    } catch (error) {

        console.error(
            "Markets frontend error:",
            error
        );


        grid.innerHTML = `
            <div class="market-card">

                <div class="market-card-main">

                    <div class="market-icon">
                        ⚠️
                    </div>

                    <div>

                        <strong>
                            Markets unavailable
                        </strong>

                        <small>
                            Could not load current market data.
                        </small>

                    </div>

                </div>

            </div>
        `;

    } finally {

        if (refreshButton) {

            refreshButton.disabled = false;

            refreshButton.textContent =
                "↻ Refresh";

        }

    }

}


/* =========================================================
GLOBAL REFRESH
========================================================= */

window.refreshMarkets =
    refreshMarkets;


/* =========================================================
INITIAL LOAD
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        refreshMarkets();

    }
);
