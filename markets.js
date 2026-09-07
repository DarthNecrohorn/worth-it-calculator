/* =========================================================
MARKETS
========================================================= */

const MARKET_CONFIG = {
    GOLD_USD: {
        name: "Gold",
        symbol: "XAU",
        icon: "🥇",
        unit: "USD / troy oz"
    },

    SILVER_USD: {
        name: "Silver",
        symbol: "XAG",
        icon: "🥈",
        unit: "USD / troy oz"
    },

    PLATINUM_USD: {
        name: "Platinum",
        symbol: "XPT",
        icon: "⚪",
        unit: "USD / troy oz"
    },

    PALLADIUM_USD: {
        name: "Palladium",
        symbol: "XPD",
        icon: "⚪",
        unit: "USD / troy oz"
    },

    COPPER_USD: {
        name: "Copper",
        symbol: "COPPER",
        icon: "🟠",
        unit: "USD / lb"
    },

    IRON_ORE_USD: {
        name: "Iron Ore",
        symbol: "IRON",
        icon: "⛓️",
        unit: "USD / metric ton"
    },

    ALUMINUM_USD: {
        name: "Aluminum",
        symbol: "ALUMINUM",
        icon: "🔩",
        unit: "USD / lb"
    },

    WTI_USD: {
        name: "Crude Oil",
        symbol: "WTI",
        icon: "🛢️",
        unit: "USD / barrel"
    },

    NATURAL_GAS_USD: {
        name: "Natural Gas",
        symbol: "NATGAS",
        icon: "🔥",
        unit: "USD / MMBtu"
    }
};


function formatMarketPrice(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return number.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


function formatMarketChange(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    const sign =
        number > 0
            ? "+"
            : "";

    return `${sign}${number.toFixed(2)}%`;
}


function getMarketMovementWidth(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 50;
    }

    return Math.min(
        100,
        Math.max(
            8,
            50 + Math.abs(number) * 10
        )
    );
}


function renderMarkets(data) {

    const grid =
        document.getElementById("materialsGrid");

    if (!grid) return;


    const prices =
        Array.isArray(data?.data?.prices)
            ? data.data.prices
            : [];


    if (!prices.length) {

        grid.innerHTML = `
            <div class="market-card">
                <div class="market-card-main">
                    <div class="market-icon">⚠️</div>
                    <div>
                        <strong>No market data</strong>
                        <small>Unable to load current prices</small>
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
                    item?.changes?.percentage?.["24h"]
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
                getMarketMovementWidth(change);


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

                        <strong>
                            $${formatMarketPrice(item.price)}
                        </strong>

                        <small>
                            ${config.unit}
                        </small>

                    </div>


                    <div
                        class="market-movement ${movementClass}"
                        style="color:var(--market-movement-color);"
                    >

                        <div class="movement-scale">

                            <span
                                style="width:${width}%;"
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


async function refreshMarkets() {

    const grid =
        document.getElementById("materialsGrid");

    if (!grid) return;


    const refreshButton =
        document.querySelector(
            ".markets-refresh-btn"
        );


    if (refreshButton) {

        refreshButton.disabled = true;
        refreshButton.textContent = "↻ Loading...";

    }


    try {

        const response =
            await fetch("/api/markets", {
                method: "GET",
                cache: "no-store"
            });


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data?.error ||
                "Markets API request failed."
            );

        }


        renderMarkets(data);


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
            refreshButton.textContent = "↻ Refresh";

        }

    }

}


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
