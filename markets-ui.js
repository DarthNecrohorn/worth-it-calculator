/* =========================================================
   WORTH IT — MARKETS UI

   Market data source:
     World Bank Commodity Price Data (The Pink Sheet)

   Market prices are monthly.
   Movement is month-over-month, not 24-hour.
========================================================= */

const MARKET_CONFIG = {

    GOLD_USD: {
        name: "Gold",
        symbol: "XAU",
        icon: "🪙",
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

    COPPER_USD: {
        name: "Copper",
        symbol: "COPPER",
        icon: "🥉",
        eurUnit: "kg",
        usUnit: "lb",
        conversion: 2.20462262185
    },

    IRON_ORE_USD: {
        name: "Iron Ore",
        symbol: "IRON",
        icon: "🪨",
        eurUnit: "metric ton",
        usUnit: "metric ton",
        conversion: 1
    },

    ALUMINUM_USD: {
        name: "Aluminum",
        symbol: "ALUMINUM",
        icon: "📦",
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
    },

    BRENT_CRUDE_USD: {
        name: "Brent Crude",
        symbol: "BRENT",
        icon: "🛢️",
        eurUnit: "liter",
        usUnit: "barrel",
        conversion: 1 / 158.9872949
    },

    COAL_USD: {
        name: "Coal",
        symbol: "COAL",
        icon: "⬛",
        eurUnit: "metric ton",
        usUnit: "metric ton",
        conversion: 1
    },

    NICKEL_USD: {
        name: "Nickel",
        symbol: "NICKEL",
        icon: "🔘",
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
                Date.now() - Number(parsed.timestamp) <
                    EUR_RATE_CACHE_DURATION
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
            Number(data?.rate);

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


function formatMarketPeriod(period) {

    const match =
        String(period || "")
            .match(/^(\d{4})M(\d{2})$/);

    if (!match) {
        return "latest available month";
    }

    const year =
        Number(match[1]);

    const month =
        Number(match[2]);

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
    ) {
        return "latest available month";
    }

    return new Date(
        Date.UTC(
            year,
            month - 1,
            1
        )
    ).toLocaleDateString(
        "en-US",
        {
            month: "long",
            year: "numeric",
            timeZone: "UTC"
        }
    );

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
                            Unable to load World Bank monthly prices
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
                    item?.changes?.monthly?.percent
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
    UPDATED / SOURCE INFORMATION
    ===================================================== */

    const updatedElement =
        document.getElementById(
            "marketsUpdated"
        );

    if (updatedElement) {

        const latestPeriod =
            formatMarketPeriod(
                data?.data?.latest_period
            );

        updatedElement.textContent =
            `Data: ${latestPeriod} · Monthly change · World Bank Pink Sheet · CC BY 4.0`;

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
                            Could not load World Bank market data.
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


/* =========================================================
HOURLY REFRESH

The commodity dataset itself is monthly, but the EUR conversion
rate can change more frequently, so the UI continues refreshing
once per hour.
========================================================= */

setInterval(
    () => {
        refreshMarkets();
    },
    60 * 60 * 1000
);
