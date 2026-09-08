console.log("MARKETS-UI.JS LOADED");

/* =========================================================
MARKETS
========================================================= */

const MARKET_CONFIG = {

    GOLD_USD: {
        name: "Gold",
        symbol: "XAU",
        icon: "🥇",
        eurUnit: "g",
        usUnit: "oz",
        conversion: 1 / 31.1034768
    },

    SILVER_USD: {
        name: "Silver",
        symbol: "XAG",
        icon: "🥈",
        eurUnit: "g",
        usUnit: "oz",
        conversion: 1 / 31.1034768
    },

    PLATINUM_USD: {
        name: "Platinum",
        symbol: "XPT",
        icon: "⚪",
        eurUnit: "g",
        usUnit: "oz",
        conversion: 1 / 31.1034768
    },

    PALLADIUM_USD: {
        name: "Palladium",
        symbol: "XPD",
        icon: "⚪",
        eurUnit: "g",
        usUnit: "oz",
        conversion: 1 / 31.1034768
    },

    COPPER_USD: {
        name: "Copper",
        symbol: "COPPER",
        icon: "🟠",
        eurUnit: "kg",
        usUnit: "lb",
        conversion: 2.20462262185
    },

    IRON_ORE_USD: {
        name: "Iron Ore",
        symbol: "IRON",
        icon: "⛓️",
        eurUnit: "metric ton",
        usUnit: "metric ton",
        conversion: 1
    },

    ALUMINUM_USD: {
        name: "Aluminum",
        symbol: "ALUMINUM",
        icon: "🔩",
        eurUnit: "kg",
        usUnit: "lb",
        conversion: 2.20462262185
    },

    WTI_USD: {
        name: "Crude Oil",
        symbol: "WTI",
        icon: "🛢️",
        eurUnit: "liter",
        usUnit: "barrel",
        conversion: 1 / 158.9872949
    },

    NATURAL_GAS_USD: {
        name: "Natural Gas",
        symbol: "NATGAS",
        icon: "🔥",
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

        console.log("USD → EUR rate:", rate);
        
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

 console.log("refreshMarkets() STARTED");
    
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

        console.log("MARKET RESPONSE URL:", marketResponse.url);
        console.log("MARKET RESPONSE STATUS:", marketResponse.status);

        const data =
            await marketResponse.json();

        console.log("MARKETS API RESPONSE:", data);

        
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
