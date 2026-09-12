/* =========================================================
MARKETS
========================================================= */

const MARKET_CONFIG = {

    GOLD_USD: {
        name: "Gold",
        symbol: "XAU",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M9 29l5-16h20l5 16H9z"
                      fill="currentColor"
                      opacity=".16"/>
                <path d="M9 29l5-16h20l5 16H9z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M14 13l-3-5h26l-3 5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M17 21h14M15 26h18"
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
                <ellipse cx="24" cy="24" rx="14" ry="17"
                         fill="currentColor"
                         opacity=".14"/>
                <ellipse cx="24" cy="24" rx="14" ry="17"
                         fill="none"
                         stroke="currentColor"
                         stroke-width="2.5"/>
                <ellipse cx="24" cy="24" rx="9" ry="12"
                         fill="none"
                         stroke="currentColor"
                         stroke-width="2"/>
                <path d="M20 18h8M19 24h10M20 30h8"
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
                <path d="M15 12h18l7 9-16 17L8 21l7-9z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M15 12h18l7 9-16 17L8 21l7-9z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M15 12l9 26M33 12l-9 26M8 21h32"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linejoin="round"/>
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
                <path d="M24 7l15 14-15 20L9 21 24 7z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M24 7l15 14-15 20L9 21 24 7z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M9 21h30M24 7v34M16 14l8 7 8-7"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linejoin="round"/>
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
                <path d="M15 15c-5 0-8 4-8 9s3 9 8 9h13c5 0 8-4 8-9s-3-9-8-9H15z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M15 15c-5 0-8 4-8 9s3 9 8 9h13c5 0 8-4 8-9s-3-9-8-9H15z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"/>
                <path d="M15 20h13c2 0 4 2 4 4s-2 4-4 4H15c-2 0-4-2-4-4s2-4 4-4z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"/>
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
                <path d="M8 31l6-16 11-7 13 7 3 13-10 9H17l-9-6z"
                      fill="currentColor"
                      opacity=".16"/>
                <path d="M8 31l6-16 11-7 13 7 3 13-10 9H17l-9-6z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M14 15l7 9 15-9M21 24l-4 13M21 24l20 4"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
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
                <path d="M11 10h26v28H11z"
                      fill="currentColor"
                      opacity=".12"/>
                <path d="M11 10h26v28H11z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M17 10v28M31 10v28M11 18h26M11 30h26"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
                <path d="M17 18l14 12M31 18L17 30"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      opacity=".7"/>
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
                <path d="M24 7c-5 8-12 14-12 22a12 12 0 0024 0c0-8-7-14-12-22z"
                      fill="currentColor"
                      opacity=".16"/>
                <path d="M24 7c-5 8-12 14-12 22a12 12 0 0024 0c0-8-7-14-12-22z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M18 29c1 4 4 6 8 6"
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
                <path d="M25 7c4 7 10 10 10 19 0 8-5 14-12 14S11 34 11 27c0-6 3-10 8-15 1 5 4 7 5 8 2-4 3-7 3-10z"
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
    },

    BRENT_CRUDE_USD: {
        name: "Brent Crude",
        symbol: "BRENT",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M24 6c-5 8-13 15-13 24a13 13 0 0026 0C37 21 29 14 24 6z"
                      fill="currentColor"
                      opacity=".16"/>
                <path d="M24 6c-5 8-13 15-13 24a13 13 0 0026 0C37 21 29 14 24 6z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
            </svg>
        `,
        eurUnit: "liter",
        usUnit: "barrel",
        conversion: 1 / 158.9872949
    },

    GASOLINE_USD: {
        name: "Gasoline",
        symbol: "GASOLINE",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M13 10h19v28H13z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M13 10h19v28H13z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M18 15h9v8h-9z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"/>
                <path d="M32 15h4v15c0 2 2 3 3 3"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "liter",
        usUnit: "gallon",
        conversion: 1 / 3.785411784
    },

    DIESEL_USD: {
        name: "Diesel",
        symbol: "DIESEL",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M13 10h19v28H13z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M13 10h19v28H13z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M18 15h9v8h-9z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"/>
                <path d="M32 15h4v15c0 2 2 3 3 3"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "liter",
        usUnit: "gallon",
        conversion: 1 / 3.785411784
    },

    JET_FUEL_USD: {
        name: "Jet Fuel",
        symbol: "JET FUEL",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M24 7l4 13 13 6-13 2-4 13-4-13-13-2 13-6 4-13z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M24 7l4 13 13 6-13 2-4 13-4-13-13-2 13-6 4-13z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
            </svg>
        `,
        eurUnit: "liter",
        usUnit: "gallon",
        conversion: 1 / 3.785411784
    },

    HEATING_OIL_USD: {
        name: "Heating Oil",
        symbol: "HEATING OIL",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M14 12h20v24H14z"
                      fill="currentColor"
                      opacity=".14"/>
                <path d="M14 12h20v24H14z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M19 12V8h10v4"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M20 20h8M20 25h8M20 30h5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"/>
            </svg>
        `,
        eurUnit: "liter",
        usUnit: "gallon",
        conversion: 1 / 3.785411784
    },

    COAL_USD: {
        name: "Coal",
        symbol: "COAL",
        icon: `
            <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M9 29l7-15 13-5 10 10-5 14-15 5-10-9z"
                      fill="currentColor"
                      opacity=".16"/>
                <path d="M9 29l7-15 13-5 10 10-5 14-15 5-10-9z"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linejoin="round"/>
                <path d="M16 14l8 10 5-15M24 24l-15 5M24 24l10 9"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linejoin="round"/>
            </svg>
        `,
        eurUnit: "metric ton",
        usUnit: "metric ton",
        conversion: 1
    },

    NICKEL_USD: {
    name: "Nickel",
    symbol: "NICKEL",
    icon: `
        <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M10 12h28v24H10z"
                  fill="currentColor"
                  opacity=".14"/>
            <path d="M10 12h28v24H10z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linejoin="round"/>
            <path d="M16 18v12M32 18v12M16 18h16M16 30h16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"/>
        </svg>
    `,
    eurUnit: "kg",
    usUnit: "lb",
    conversion: 2.20462262185
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

    try {

                const [
            marketResponse,
            exchangeRate
        ] = await Promise.all([

            fetch(
                "/api/markets",
                {
                    method: "GET",
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

setInterval(
    () => {
        refreshMarkets();
    },
    60 * 60 * 1000
);
