/* =========================================================
   WORTH IT — MARKETS UI

   Data:
     World Bank Commodity Price Data (The Pink Sheet)

   Dynamic features:
     - every commodity returned by /api/markets
     - search
     - dataset-driven categories
     - original important commodities kept first by backend
     - lazy Wikimedia Commons image loading
     - image/licensing validation performed by backend
     - compact modern market cards
     - responsive desktop 2-column / mobile 1-column layout
     - category buttons with icons and hover animation
     - floating "Go back up" button while scrolling
     - search input preserved while filtering

   NOTE:
     Final strict Wikimedia relevance filtering, including the
     strongest URL/title/metadata checks, is completed in
     markets.js. This UI is prepared to consume only images
     returned by that validated backend endpoint.
========================================================= */


/* =========================================================
   MARKET STATE
========================================================= */

let marketsData = [];

let marketsExchangeRate = null;

let marketsCurrentCategory =
    "all";

let marketsCurrentSearch =
    "";

let marketsImageObserver =
    null;

let marketsImageActiveLoads =
    0;


/*
 * Wikimedia currently recommends keeping automated
 * requests to 3 or fewer concurrent requests.
 */
const marketsImageMaxConcurrentLoads =
    3;

const marketsImageQueue =
    [];

const marketsImageCache =
    new Map();

const marketsImageLoading =
    new Set();

const marketsImageFailed =
    new Set();

const MARKETS_UI_VERSION =
    "v9-modern-cards";


/* =========================================================
   MARKETS CARD / GRID / TOOLBAR STYLES
========================================================= */

function ensureMarketsCardStyles() {

    if (
        document.getElementById(
            "worthItMarketsCardStyles"
        )
    ) {

        return;

    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "worthItMarketsCardStyles";


    style.textContent = `

        /* ================================
           GRID
        ================================= */

.markets-grid {
    display:grid !important;
    grid-template-columns:
        repeat(2, minmax(0, 1fr)) !important;
    gap:16px !important;
    align-items:stretch !important;
    width:100% !important;
    max-width:none !important;
    margin-left:0 !important;
    margin-right:0 !important;
}


/* ================================
   MARKET CARD
================================= */

.markets-grid .market-card {
    display:grid !important;
    grid-template-columns:
        120px minmax(0, 1fr) !important;
    align-items:stretch !important;
    gap:0 !important;
    width:100% !important;
    max-width:none !important;
    min-width:0 !important;
    min-height:120px !important;
    box-sizing:border-box !important;
    overflow:hidden !important;
    padding:0 !important;

    border:1px solid transparent !important;
    border-radius:15px !important;

    background:
        linear-gradient(
            var(--surface, rgba(128,128,128,.04)),
            var(--surface, rgba(128,128,128,.04))
        ) padding-box,
        linear-gradient(
            120deg,
            rgba(128,128,128,.28),
            rgba(128,128,128,.18)
        ) border-box !important;

    box-shadow:
        0 4px 14px rgba(0,0,0,.055) !important;

    transition:
        transform .18s ease,
        box-shadow .18s ease,
        background .18s ease !important;
}


.markets-grid .market-card:hover {
    transform:
        translateY(-2px)
        scale(1.006) !important;

    background:
        linear-gradient(
            var(--surface, rgba(128,128,128,.04)),
            var(--surface, rgba(128,128,128,.04))
        ) padding-box,
        linear-gradient(
            120deg,
            #7c3aed,
            #2563eb
        ) border-box !important;

    box-shadow:
        0 9px 24px rgba(37,99,235,.12),
        0 4px 14px rgba(124,58,237,.08) !important;
}


.markets-grid
.worth-it-market-image-wrap {
    width:120px !important;
    min-width:120px !important;
    height:100% !important;
    min-height:120px !important;
    border-radius:14px 0 0 14px !important;
    overflow:hidden !important;
    position:relative !important;
    display:grid !important;
    place-items:stretch !important;
}


.markets-grid
.worth-it-market-image-placeholder {
    width:100% !important;
    height:100% !important;
    min-height:120px !important;
    box-sizing:border-box !important;
    grid-area:1 / 1 !important;
    z-index:1 !important;
}


.markets-grid
.worth-it-market-image {
    width:100% !important;
    height:100% !important;
    min-height:120px !important;
    object-fit:cover !important;
    display:block !important;
    grid-area:1 / 1 !important;
    z-index:2 !important;
}


.worth-it-market-card-content {
    min-width:0 !important;
    min-height:120px !important;
    display:flex !important;
    flex-direction:column !important;
    justify-content:flex-start !important;
    gap:6px !important;
    padding:10px 13px !important;
    box-sizing:border-box !important;
}


.worth-it-market-card-content
.market-card-main {
    min-width:0 !important;
}


.worth-it-market-card-content
.market-price {
    min-width:0 !important;
    display:flex !important;
    flex-direction:column !important;
    gap:2px !important;
}


.worth-it-market-card-content
.market-price-eur,
.worth-it-market-card-content
.market-price-usd {
    overflow-wrap:anywhere !important;
    white-space:normal !important;
}


.worth-it-market-card-content
.market-price-eur small,
.worth-it-market-card-content
.market-price-usd small {
    white-space:nowrap !important;
}


.worth-it-market-card-content
.market-movement {
    width:100% !important;
    min-width:0 !important;
    display:flex !important;
    flex-direction:column !important;
    align-items:stretch !important;
    justify-content:flex-start !important;
    gap:3px !important;
    text-align:center !important;
}


.worth-it-market-card-content
.market-movement > strong,
.worth-it-market-card-content
.market-movement > small {
    display:block !important;
    text-align:center !important;
}


.worth-it-market-card-content
.market-movement > strong {
    line-height:1.15 !important;
}


.worth-it-market-card-content
.market-movement > small {
    margin-top:0 !important;
}


.worth-it-market-image-credit {
    min-height:15px !important;
    max-height:30px !important;
    overflow-wrap:anywhere !important;
    overflow:hidden !important;
    display:-webkit-box !important;
    -webkit-box-orient:vertical !important;
    -webkit-line-clamp:2 !important;
    line-height:1.3 !important;
}


.worth-it-market-image-credit a {
    color:inherit !important;
    text-decoration:underline !important;
    text-underline-offset:2px !important;
}


/* ================================
   CARD TYPOGRAPHY
================================= */

.worth-it-market-title {
    display:block !important;
    line-height:1.18 !important;
    font-size:.94rem !important;
    font-weight:800 !important;
    overflow-wrap:anywhere !important;
}


.worth-it-market-category {
    display:block !important;
    margin-top:2px !important;
    opacity:.56 !important;
    font-size:.72rem !important;
    line-height:1.15 !important;
}


/* ================================
   TOOLBAR
================================= */

.worth-it-markets-toolbar {
    width:100% !important;
    margin:0 0 18px !important;
    box-sizing:border-box !important;
}


.worth-it-markets-search-row {
    display:grid !important;
    grid-template-columns:
        minmax(0, 1fr) auto !important;
    gap:10px !important;
    align-items:center !important;
    width:100% !important;
    box-sizing:border-box !important;
}


.worth-it-markets-search-wrap {
    min-width:0 !important;
    width:100% !important;
}


#worthItMarketsSearch {
    display:block !important;
    width:100% !important;
    min-width:0 !important;
    box-sizing:border-box !important;
    padding:11px 13px !important;
    border:1px solid var(--border, rgba(128,128,128,.25)) !important;
    border-radius:12px !important;
    background:var(--surface-soft, rgba(128,128,128,.06)) !important;
    color:var(--text) !important;
    outline:none !important;
    font:inherit !important;
}


#worthItMarketsSearch::placeholder {
    color:var(--text) !important;
    opacity:.52 !important;
}


#worthItMarketsSearch:focus {
    border-color:var(--accent, currentColor) !important;
    box-shadow:0 0 0 3px rgba(127,127,127,.12) !important;
}


.worth-it-markets-count {
    display:block !important;
    font-size:.82rem !important;
    opacity:.65 !important;
    white-space:nowrap !important;
    text-align:right !important;
}


/* ================================
   CATEGORY BUTTONS
================================= */

.worth-it-markets-categories {
    display:grid !important;
    grid-template-columns:
        repeat(8, minmax(0, 1fr)) !important;
    gap:7px !important;
    width:100% !important;
    margin-top:8px !important;
    box-sizing:border-box !important;
}


.worth-it-markets-categories
.worth-it-market-category-button {
    width:100% !important;
    min-width:0 !important;
    min-height:38px !important;
    padding:8px 7px !important;
    border:1px solid transparent !important;
    border-radius:10px !important;

    background:
        linear-gradient(
            var(--surface, transparent),
            var(--surface, transparent)
        ) padding-box,
        linear-gradient(
            120deg,
            var(--border, rgba(128,128,128,.25)),
            var(--border, rgba(128,128,128,.25))
        ) border-box !important;

    color:var(--text) !important;
    cursor:pointer !important;
    font:inherit !important;
    font-size:.76rem !important;
    font-weight:700 !important;
    line-height:1.1 !important;
    text-align:center !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important;
    gap:5px !important;
    box-sizing:border-box !important;
    overflow:hidden !important;

    transition:
        transform .16s ease,
        box-shadow .16s ease,
        background .16s ease !important;
}


.worth-it-markets-categories
.worth-it-market-category-button:hover {
    transform:
        translateY(-1px)
        scale(1.025) !important;

    background:
        linear-gradient(
            var(--surface-soft, rgba(128,128,128,.07)),
            var(--surface-soft, rgba(128,128,128,.07))
        ) padding-box,
        linear-gradient(
            120deg,
            #7c3aed,
            #2563eb
        ) border-box !important;

    box-shadow:
        0 5px 15px rgba(37,99,235,.10),
        0 2px 8px rgba(124,58,237,.08) !important;
}


.worth-it-markets-categories
.worth-it-market-category-button.active {
    font-weight:800 !important;

    background:
        linear-gradient(
            var(--surface-soft, rgba(128,128,128,.12)),
            var(--surface-soft, rgba(128,128,128,.12))
        ) padding-box,
        linear-gradient(
            120deg,
            #7c3aed,
            #2563eb
        ) border-box !important;

    box-shadow:
        0 0 0 1px rgba(88,96,255,.06) !important;
}


.worth-it-market-category-icon {
    flex:0 0 auto !important;
    font-size:.92em !important;
    line-height:1 !important;
}


.worth-it-market-category-label {
    min-width:0 !important;
    overflow:hidden !important;
    text-overflow:ellipsis !important;
    white-space:nowrap !important;
}


/* ================================
   FLOATING GO BACK UP BUTTON
================================= */

.worth-it-markets-back-up {
    position:fixed !important;
    right:max(8px, calc((100vw - 1180px) / 2 - 140px)) !important;
    top:50% !important;
    z-index:9999 !important;

    min-height:46px !important;
    padding:10px 16px !important;

    border:1px solid transparent !important;
    border-radius:12px !important;

    background:
        linear-gradient(
            var(--surface, rgba(20,20,30,.92)),
            var(--surface, rgba(20,20,30,.92))
        ) padding-box,
        linear-gradient(
            120deg,
            rgba(128,128,128,.30),
            rgba(128,128,128,.24)
        ) border-box !important;

    color:var(--text) !important;
    font:inherit !important;
    font-size:.82rem !important;
    font-weight:800 !important;
    cursor:pointer !important;
    white-space:nowrap !important;

    box-shadow:
        0 7px 20px rgba(0,0,0,.12) !important;

    opacity:0 !important;
    visibility:hidden !important;
    pointer-events:none !important;
    transform:
        translateY(-40%)
        scale(.94) !important;

    transition:
        opacity .18s ease,
        visibility .18s ease,
        transform .18s ease,
        box-shadow .18s ease,
        background .18s ease !important;
}


.worth-it-markets-back-up.is-visible {
    opacity:1 !important;
    visibility:visible !important;
    pointer-events:auto !important;
    transform:
        translateY(-50%)
        scale(1) !important;
}


.worth-it-markets-back-up:hover {
    transform:
        translateY(-50%)
        scale(1.045) !important;

    background:
        linear-gradient(
            rgba(124,58,237,.11),
            rgba(37,99,235,.07)
        ) padding-box,
        linear-gradient(
            120deg,
            #7c3aed,
            #2563eb
        ) border-box !important;

    box-shadow:
        0 8px 24px rgba(37,99,235,.15),
        0 3px 11px rgba(124,58,237,.13) !important;
}


/* ================================
   EMPTY / ERROR STATE
================================= */

.markets-grid .worth-it-markets-empty-state,
.markets-grid .worth-it-markets-error-state {
    grid-column:1 / -1 !important;
    width:100% !important;
    box-sizing:border-box !important;
}


.worth-it-markets-empty-state,
.worth-it-markets-error-state {
    padding:20px !important;
    min-height:120px !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important;
    text-align:center !important;
}


.worth-it-markets-state-content {
    min-width:0 !important;
}


.worth-it-markets-state-content strong,
.worth-it-markets-state-content small {
    display:block !important;
}


.worth-it-markets-state-content small {
    margin-top:5px !important;
    opacity:.65 !important;
}


/* ================================
   TABLET
================================= */

@media (max-width:1400px) and (min-width:701px) {

    .worth-it-markets-back-up {
        right:8px !important;
    }

}


/* ================================
   TABLET
================================= */

@media (max-width:1024px) {

    .markets-grid {
        grid-template-columns:
            repeat(2, minmax(0, 1fr)) !important;
        max-width:none !important;
    }


    .worth-it-markets-categories {
        grid-template-columns:
            repeat(4, minmax(0, 1fr)) !important;
    }


    .worth-it-markets-back-up {
        right:14px !important;
    }

}


/* ================================
   MOBILE
================================= */

@media (max-width:700px) {

    .markets-grid {
        grid-template-columns:
            minmax(0, 1fr) !important;
        gap:12px !important;
        max-width:none !important;
    }


    .markets-grid .market-card {
        grid-template-columns:
            105px minmax(0, 1fr) !important;
    }


    .markets-grid
    .worth-it-market-image-wrap {
        width:105px !important;
        min-width:105px !important;
        min-height:116px !important;
    }


    .markets-grid
    .worth-it-market-image-placeholder,
    .markets-grid
    .worth-it-market-image {
        min-height:116px !important;
    }


    .markets-grid .market-card,
    .worth-it-market-card-content {
        min-height:116px !important;
    }


    .worth-it-market-card-content {
        padding:9px 11px !important;
        gap:5px !important;
    }


    .worth-it-markets-search-row {
        grid-template-columns:
            minmax(0, 1fr) auto !important;
    }


    .worth-it-markets-categories {
        grid-template-columns:
            repeat(2, minmax(0, 1fr)) !important;
        gap:7px !important;
    }


    .worth-it-markets-categories
    .worth-it-market-category-button {
        min-height:40px !important;
        font-size:.78rem !important;
    }


    .worth-it-markets-back-up {
        right:8px !important;
        top:50% !important;
        min-height:44px !important;
        padding:10px 14px !important;
        font-size:.80rem !important;
    }

}


@media (max-width:420px) {

    .worth-it-markets-search-row {
        grid-template-columns:1fr !important;
        gap:7px !important;
    }


    .worth-it-markets-count {
        text-align:left !important;
    }


    .markets-grid .market-card {
        grid-template-columns:
            92px minmax(0, 1fr) !important;
    }


    .markets-grid
    .worth-it-market-image-wrap {
        width:92px !important;
        min-width:92px !important;
    }

}

    `;


    document.head.appendChild(
        style
    );
}


/* =========================================================
   HELPERS
========================================================= */

function escapeMarketsHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


function normalizeMarketsSearch(
    value
) {

    return String(
        value || ""
    )
        .toLowerCase()
        .normalize(
            "NFKD"
        )
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /[^a-z0-9]+/g,
            " "
        )
        .trim();
}


/*
 * Cleans display names coming from the dataset.
 *
 * Examples:
 *   "Gold GOLD"                     → "Gold"
 *   "Coal, South African **"        → "Coal, South African"
 *   "** Gold **"                    → "Gold"
 *
 * This is intentionally generic so future additions do not
 * need per-commodity name rules.
 */
function cleanMarketDisplayName(
    value
) {

    let text =
        String(
            value ?? ""
        );


    text =
        text
            .replace(
                /<[^>]*>/g,
                " "
            )
            .replace(
                /\*{2,}/g,
                ""
            )
            .replace(
                /[`_]/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();


    text =
        text.replace(
            /\*+$/g,
            ""
        ).trim();


    if (!text) {

        return "Commodity";

    }


    const words =
        text.split(" ")
            .filter(Boolean);


    if (
        words.length >= 2 &&
        words.length % 2 === 0
    ) {

        const half =
            words.length / 2;

        const firstHalf =
            words
                .slice(0, half)
                .join(" ");

        const secondHalf =
            words
                .slice(half)
                .join(" ");


        if (
            normalizeMarketsSearch(
                firstHalf
            ) ===
            normalizeMarketsSearch(
                secondHalf
            )
        ) {

            return firstHalf;

        }

    }


    return text;
}


function getCategoryMeta(
    category
) {

    const map = {

        all: {
            label:
                "All",
            icon:
                "📊"
        },

        "precious-metals": {
            label:
                "Precious Metals",
            icon:
                "💎"
        },

        "metals-minerals": {
            label:
                "Metals & Minerals",
            icon:
                "🔩"
        },

        energy: {
            label:
                "Energy",
            icon:
                "⚡"
        },

        fertilizers: {
            label:
                "Fertilizers",
            icon:
                "🌱"
        },

        "agriculture-food": {
            label:
                "Agriculture & Food",
            icon:
                "🌾"
        },

        "raw-materials": {
            label:
                "Raw Materials",
            icon:
                "🪵"
        },

        other: {
            label:
                "Other",
            icon:
                "📦"
        }

    };


    return (
        map[
            category
        ] ||
        map.other
    );
}


function getMarketConfigFallback(
    item
) {

    return {

        name:
            item?.name ||
            "Commodity",

        symbol:
            item?.code ||
            "",

        eurUnit:
            item?.display?.eurUnit ||
            "unit",

        usUnit:
            item?.display?.usUnit ||
            "unit",

        conversion:
            Number(
                item?.display?.conversion
            ) ||
            1

    };
}


function formatMarketPrice(
    value
) {

    const number =
        Number(value);


    if (
        !Number.isFinite(
            number
        )
    ) {

        return "—";

    }


    return number.toLocaleString(
        "en-US",
        {

            minimumFractionDigits:
                2,

            maximumFractionDigits:
                2

        }
    );
}


function formatMarketChange(
    value
) {

    const number =
        Number(value);


    if (
        !Number.isFinite(
            number
        )
    ) {

        return "—";

    }


    const sign =
        number > 0
            ? "+"
            : "";


    return (
        `${sign}${number.toFixed(2)}%`
    );
}


function formatMarketPeriod(
    period
) {

    const match =
        String(
            period || ""
        )
            .match(
                /^(\d{4})M(\d{2})$/
            );


    if (!match) {

        return "latest available month";

    }


    const year =
        Number(
            match[1]
        );


    const month =
        Number(
            match[2]
        );


    if (
        !Number.isInteger(
            year
        ) ||
        !Number.isInteger(
            month
        ) ||
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

            month:
                "long",

            year:
                "numeric",

            timeZone:
                "UTC"

        }
    );
}


function getMarketMovementWidth(
    value
) {

    const number =
        Number(value);


    if (
        !Number.isFinite(
            number
        ) ||
        number === 0
    ) {

        return 0;

    }


    return Math.min(
        50,

        Math.max(
            4,
            Math.abs(
                number
            ) * 10
        )
    );
}


function getMarketImageCacheKey(
    name
) {

    return normalizeMarketsSearch(
        name
    );
}


/* =========================================================
   USD → EUR
========================================================= */

const EUR_RATE_CACHE_KEY =
    "worth_it_usd_eur_rate";


const EUR_RATE_CACHE_DURATION =
    60 * 60 * 1000;


async function getUsdToEurRate() {

    try {

        const cached =
            localStorage.getItem(
                EUR_RATE_CACHE_KEY
            );


        if (cached) {

            const parsed =
                JSON.parse(
                    cached
                );


            if (
                Number.isFinite(
                    Number(
                        parsed.rate
                    )
                ) &&
                Date.now() -
                    Number(
                        parsed.timestamp
                    ) <
                    EUR_RATE_CACHE_DURATION
            ) {

                return Number(
                    parsed.rate
                );

            }

        }

    }
    catch (error) {

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

                    method:
                        "GET",

                    cache:
                        "no-store"

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
            !Number.isFinite(
                rate
            ) ||
            rate <= 0
        ) {

            throw new Error(
                "Invalid USD to EUR exchange rate."
            );

        }


        try {

            localStorage.setItem(
                EUR_RATE_CACHE_KEY,
                JSON.stringify(
                    {

                        rate,

                        timestamp:
                            Date.now()

                    }
                )
            );

        }
        catch (error) {

            console.warn(
                "Could not cache EUR rate:",
                error
            );

        }


        return rate;

    }
    catch (error) {

        console.error(
            "USD → EUR exchange rate error:",
            error
        );


        return null;

    }
}


/* =========================================================
   TOOLBAR
========================================================= */

function ensureMarketsToolbar(
    grid
) {

    if (!grid) {

        return null;

    }


    let toolbar =
        document.getElementById(
            "worthItMarketsToolbar"
        );


    if (!toolbar) {

        toolbar =
            document.createElement(
                "div"
            );


        toolbar.id =
            "worthItMarketsToolbar";


        toolbar.className =
            "worth-it-markets-toolbar";


        toolbar.innerHTML = `

            <div
                class="worth-it-markets-search-row"
            >

                <div
                    class="worth-it-markets-search-wrap"
                >

                    <input
                        id="worthItMarketsSearch"
                        type="search"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="Search commodities..."
                        aria-label="Search commodities"
                    >

                </div>


                <span
                    id="worthItMarketsCount"
                    class="worth-it-markets-count"
                ></span>

            </div>


            <div
                id="worthItMarketsCategories"
                class="worth-it-markets-categories"
            ></div>

        `;


        grid.parentNode?.insertBefore(
            toolbar,
            grid
        );


        const searchInput =
            toolbar.querySelector(
                "#worthItMarketsSearch"
            );


        if (searchInput) {

            searchInput.value =
                marketsCurrentSearch;


            searchInput.addEventListener(
                "input",
                () => {

                    marketsCurrentSearch =
                        searchInput.value.trim();


                    renderMarkets();

                }
            );

        }

    }
    else {

        /*
         * The toolbar is intentionally NOT rebuilt on every
         * search/category render. This keeps the input element,
         * caret position and focus stable while filtering.
         */

        const searchInput =
            toolbar.querySelector(
                "#worthItMarketsSearch"
            );


        if (
            searchInput &&
            searchInput.value !== marketsCurrentSearch
        ) {

            searchInput.value =
                marketsCurrentSearch;

        }

    }


    return toolbar;
}


function renderMarketCategoryButtons() {

    const container =
        document.getElementById(
            "worthItMarketsCategories"
        );


    if (!container) {

        return;

    }


    const categoryCounts =
        {};


    marketsData.forEach(
        item => {

            const category =
                item?.category ||
                "other";


            categoryCounts[
                category
            ] =
                (
                    categoryCounts[
                        category
                    ] ||
                    0
                ) + 1;

        }
    );


    const desiredOrder = [

        "all",

        "precious-metals",

        "metals-minerals",

        "energy",

        "fertilizers",

        "agriculture-food",

        "raw-materials",

        "other"

    ];


    const available =
        desiredOrder.filter(
            category =>
                category === "all" ||
                categoryCounts[
                    category
                ] > 0
        );


    if (
        !available.includes(
            marketsCurrentCategory
        )
    ) {

        marketsCurrentCategory =
            "all";

    }


    container.innerHTML =
        available.map(
            category => {

                const meta =
                    getCategoryMeta(
                        category
                    );


                const active =
                    marketsCurrentCategory ===
                    category;


                return `

                    <button
                        type="button"
                        class="worth-it-market-category-button${
                            active
                                ? " active"
                                : ""
                        }"
                        data-market-category="${
                            escapeMarketsHtml(
                                category
                            )
                        }"
                        aria-pressed="${
                            active
                                ? "true"
                                : "false"
                        }"
                        title="${
                            escapeMarketsHtml(
                                meta.label
                            )
                        }"
                    >

                        <span
                            class="worth-it-market-category-icon"
                            aria-hidden="true"
                        >
                            ${meta.icon}
                        </span>


                        <span
                            class="worth-it-market-category-label"
                        >
                            ${
                                escapeMarketsHtml(
                                    meta.label
                                )
                            }
                        </span>

                    </button>

                `;

            }
        ).join("");


    container
        .querySelectorAll(
            "[data-market-category]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const nextCategory =
                            button.dataset.marketCategory ||
                            "all";


                        if (
                            marketsCurrentCategory ===
                            nextCategory
                        ) {

                            return;

                        }


                        marketsCurrentCategory =
                            nextCategory;


                        renderMarkets();

                    }
                );

            }
        );
}


function updateMarketsCount(
    visibleCount,
    totalCount
) {

    const countElement =
        document.getElementById(
            "worthItMarketsCount"
        );


    if (!countElement) {

        return;

    }


    if (
        visibleCount ===
        totalCount
    ) {

        countElement.textContent =
            `${totalCount} commodities`;

    }
    else {

        countElement.textContent =
            `${visibleCount} of ${totalCount} commodities`;

    }
}


/* =========================================================
   FLOATING GO BACK UP
========================================================= */

function ensureMarketsGoBackUpButton() {

    if (
        document.getElementById(
            "worthItMarketsBackUp"
        )
    ) {

        return;

    }


    const button =
        document.createElement(
            "button"
        );


    button.type =
        "button";


    button.id =
        "worthItMarketsBackUp";


    button.className =
        "worth-it-markets-back-up";


    button.textContent =
        "↑ Go back up";


    button.setAttribute(
        "aria-label",
        "Go back up"
    );


    button.addEventListener(
        "click",
        () => {

            window.scrollTo(
                {

                    top:0,

                    behavior:"smooth"

                }
            );

        }
    );


    document.body.appendChild(
        button
    );
}


function updateMarketsGoBackUpButton() {

    const button =
        document.getElementById(
            "worthItMarketsBackUp"
        );


    if (!button) {

        return;

    }


    const marketsSection =
        document.getElementById(
            "marketsSection"
        );


    const marketsVisible =
        marketsSection &&
        window.getComputedStyle(
            marketsSection
        ).display !== "none";


    const shouldShow =
        marketsVisible &&
        window.scrollY > 280;


    button.classList.toggle(
        "is-visible",
        shouldShow
    );
}


/* =========================================================
   FILTERING
========================================================= */

function getFilteredMarkets() {

    const normalizedSearch =
        normalizeMarketsSearch(
            marketsCurrentSearch
        );


    return marketsData.filter(
        item => {

            const categoryMatch =
                marketsCurrentCategory ===
                    "all" ||
                item.category ===
                    marketsCurrentCategory;


            if (!categoryMatch) {

                return false;

            }


            if (!normalizedSearch) {

                return true;

            }


            const cleanName =
                cleanMarketDisplayName(
                    item.name
                );


            const haystack =
                normalizeMarketsSearch(
                    `${cleanName} ${item.name || ""} ${item.code || ""} ${
                        item.category_label || ""
                    }`
                );


            return haystack.includes(
                normalizedSearch
            );

        }
    );
}


/* =========================================================
   IMAGE PLACEHOLDER
========================================================= */

function createMarketImagePlaceholder(
    message =
        "Loading image..."
) {

    return `

        <div
            class="worth-it-market-image-placeholder"
            style="
                width:100%;
                height:100%;
                min-height:120px;
                display:flex;
                align-items:center;
                justify-content:center;
                text-align:center;
                padding:12px;
                box-sizing:border-box;
                opacity:.62;
                font-size:.76rem;
            "
        >

            ${
                escapeMarketsHtml(
                    message
                )
            }

        </div>

    `;
}


function showMarketImageUnavailable(
    imageElement
) {

    if (!imageElement) {

        return;

    }


    const parent =
        imageElement.parentNode;


    if (!parent) {

        return;

    }


    imageElement.remove();


    const placeholder =
        parent.querySelector(
            ".worth-it-market-image-placeholder"
        );


    if (placeholder) {

        placeholder.textContent =
            "Image unavailable";

    }
}


/* =========================================================
   FETCH MARKET IMAGE
========================================================= */

async function fetchMarketImage(
    name,
    category
) {

    const cleanName =
        cleanMarketDisplayName(
            name
        );


    const key =
        getMarketImageCacheKey(
            cleanName
        );


    if (
        marketsImageCache.has(
            key
        )
    ) {

        return marketsImageCache.get(
            key
        );

    }


    if (
        marketsImageFailed.has(
            key
        )
    ) {

        return null;

    }


    if (
        marketsImageLoading.has(
            key
        )
    ) {

        return null;

    }


    marketsImageLoading.add(
        key
    );


    try {

        const params =
            new URLSearchParams(
                {

                    action:
                        "image",

                    name:
                        cleanName,

                    category

                }
            );


        params.set(
            "v",
            MARKETS_UI_VERSION
        );


        const response =
            await fetch(
                `/api/markets?${params.toString()}`,
                {

                    method:
                        "GET",

                    cache:
                        "no-store"

                }
            );


        if (!response.ok) {

            throw new Error(
                `Market image request failed with status ${response.status}.`
            );

        }


        const data =
            await response.json();


        const image =
            data?.found
                ? data.image
                : null;


        if (
            !image ||
            !image.url
        ) {

            marketsImageFailed.add(
                key
            );

            return null;

        }


        marketsImageCache.set(
            key,
            image
        );


        return image;

    }
    catch (error) {

        console.warn(
            `Market image search failed for ${cleanName}:`,
            error
        );


        marketsImageFailed.add(
            key
        );


        return null;

    }
    finally {

        marketsImageLoading.delete(
            key
        );

    }
}


/* =========================================================
   IMAGE QUEUE
========================================================= */

function queueMarketImage(
    imageElement,
    name,
    category
) {

    if (
        !imageElement ||
        !imageElement.isConnected
    ) {

        return;

    }


    if (
        imageElement.dataset
            .marketImageQueued ===
        "true"
    ) {

        return;

    }


    imageElement.dataset
        .marketImageQueued =
        "true";


    marketsImageQueue.push(
        {

            imageElement,

            name,

            category

        }
    );


    processMarketImageQueue();
}


async function processMarketImageQueue() {

    while (
        marketsImageActiveLoads <
            marketsImageMaxConcurrentLoads &&
        marketsImageQueue.length
    ) {

        const job =
            marketsImageQueue.shift();


        if (
            !job?.imageElement?.isConnected
        ) {

            continue;

        }


        marketsImageActiveLoads +=
            1;


        loadMarketCardImage(
            job.imageElement,
            job.name,
            job.category
        )
            .catch(
                error => {

                    console.warn(
                        "Market card image error:",
                        error
                    );

                }
            )
            .finally(
                () => {

                    marketsImageActiveLoads -=
                        1;


                    processMarketImageQueue();

                }
            );

    }
}


/* =========================================================
   IMAGE CREDIT
========================================================= */

function updateMarketImageCredit(
    imageElement,
    image
) {

    const card =
        imageElement?.closest(
            "[data-market-card=\"true\"]"
        );


    if (!card) {

        return;

    }


    const credit =
        card.querySelector(
            ".worth-it-market-image-credit"
        );


    if (!credit) {

        return;

    }


    credit.innerHTML =
        "";


    if (
        image?.source_url
    ) {

        const sourceLink =
            document.createElement(
                "a"
            );


        sourceLink.href =
            image.source_url;

        sourceLink.target =
            "_blank";

        sourceLink.rel =
            "noopener noreferrer";

        sourceLink.textContent =
            "Wikimedia Commons";


        credit.appendChild(
            sourceLink
        );

    }
    else {

        credit.appendChild(
            document.createTextNode(
                "Wikimedia Commons"
            )
        );

    }


    if (
        image?.license_url
    ) {

        credit.appendChild(
            document.createTextNode(
                " · "
            )
        );


        const licenseLink =
            document.createElement(
                "a"
            );


        licenseLink.href =
            image.license_url;

        licenseLink.target =
            "_blank";

        licenseLink.rel =
            "noopener noreferrer";

        licenseLink.textContent =
            image.license ||
            "License";


        credit.appendChild(
            licenseLink
        );

    }
    else if (
        image?.license
    ) {

        credit.appendChild(
            document.createTextNode(
                ` · ${image.license}`
            )
        );

    }


    if (
        image?.author &&
        image.author !==
            "Unknown author"
    ) {

        credit.appendChild(
            document.createTextNode(
                ` · ${image.author}`
            )
        );

    }
}


/* =========================================================
   LOAD CARD IMAGE
========================================================= */

async function loadMarketCardImage(
    imageElement,
    name,
    category
) {

    if (
        !imageElement?.isConnected
    ) {

        return;

    }


    imageElement.dataset
        .marketImageState =
        "loading";


    const image =
        await fetchMarketImage(
            name,
            category
        );


    if (
        !imageElement.isConnected
    ) {

        return;

    }


    const parent =
        imageElement.parentNode;


    if (!parent) {

        return;

    }


    const placeholder =
        parent.querySelector(
            ".worth-it-market-image-placeholder"
        );


    if (!image) {

        imageElement.dataset
            .marketImageState =
            "unavailable";


        imageElement.remove();


        if (placeholder) {

            placeholder.textContent =
                "Image unavailable";

        }


        return;

    }


    const finalUrl =
        image.thumbnailUrl ||
        image.url;


    if (
        !finalUrl
    ) {

        showMarketImageUnavailable(
            imageElement
        );

        return;

    }


    imageElement.alt =
        cleanMarketDisplayName(
            name
        );


    imageElement.loading =
        "eager";


    imageElement.style.display =
        "block";


    imageElement.decoding =
        "async";


    imageElement.style.width =
        "100%";


    imageElement.style.height =
        "100%";


    imageElement.style.objectFit =
        "cover";


    imageElement.style.opacity =
        "0";


    imageElement.style.transition =
        "opacity .2s ease";


    if (
        image.author
    ) {

        imageElement.dataset
            .imageAuthor =
            image.author;

    }


    if (
        image.license
    ) {

        imageElement.dataset
            .imageLicense =
            image.license;

    }


    if (
        image.license_url
    ) {

        imageElement.dataset
            .imageLicenseUrl =
            image.license_url;

    }


    if (
        image.source_url
    ) {

        imageElement.dataset
            .imageSourceUrl =
            image.source_url;

    }


    updateMarketImageCredit(
        imageElement,
        image
    );


    imageElement.onerror =
        () => {

            if (
                imageElement.dataset
                    .marketImageFallback ===
                "used"
            ) {

                showMarketImageUnavailable(
                    imageElement
                );

                return;

            }


            imageElement.dataset
                .marketImageFallback =
                "used";


            if (
                image.url &&
                imageElement.src !==
                    image.url
            ) {

                imageElement.src =
                    image.url;

                return;

            }


            showMarketImageUnavailable(
                imageElement
            );

        };


    imageElement.onload =
        () => {

            imageElement.style.display =
                "block";


            imageElement.style.opacity =
                "1";


            imageElement.dataset
                .marketImageState =
                "loaded";


            if (placeholder) {

                placeholder.remove();

            }

        };


    /*
     * Handlers are installed BEFORE src is assigned.
     */

    imageElement.src =
        finalUrl;
}


/* =========================================================
   IMAGE OBSERVER
========================================================= */

function initialiseMarketImageObserver() {

    if (
        marketsImageObserver
    ) {

        marketsImageObserver.disconnect();

        marketsImageObserver =
            null;

    }


    const wrappers =
        document.querySelectorAll(
            ".worth-it-market-image-wrap"
        );


    if (
        !(
            "IntersectionObserver"
            in window
        )
    ) {

        document
            .querySelectorAll(
                ".worth-it-market-image"
            )
            .forEach(
                image => {

                    queueMarketImage(
                        image,
                        image.dataset
                            .marketName ||
                            "",
                        image.dataset
                            .marketCategory ||
                            "other"
                    );

                }
            );

        return;

    }


    marketsImageObserver =
        new IntersectionObserver(

            entries => {

                entries.forEach(
                    entry => {

                        if (
                            !entry.isIntersecting
                        ) {

                            return;

                        }


                        const wrapper =
                            entry.target;


                        const image =
                            wrapper.querySelector(
                                ".worth-it-market-image"
                            );


                        if (!image) {

                            marketsImageObserver?.unobserve(
                                wrapper
                            );

                            return;

                        }


                        queueMarketImage(
                            image,
                            image.dataset
                                .marketName ||
                                "",
                            image.dataset
                                .marketCategory ||
                                "other"
                        );


                        marketsImageObserver?.unobserve(
                            wrapper
                        );

                    }
                );

            },

            {

                rootMargin:
                    "500px 0px"

            }

        );


    wrappers.forEach(
        wrapper => {

            marketsImageObserver.observe(
                wrapper
            );

        }
    );
}


/* =========================================================
   CARD
========================================================= */

function renderMarketCard(
    item
) {

    const config =
        getMarketConfigFallback(
            item
        );


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
        Number(
            item.price
        );


    const formattedUsdPrice =
        formatMarketPrice(
            usdPrice
        );


    let formattedEurPrice =
        "—";


    const conversion =
        Number(
            item?.display?.conversion
        );


    if (
        Number.isFinite(
            usdPrice
        ) &&
        Number.isFinite(
            marketsExchangeRate
        ) &&
        marketsExchangeRate > 0 &&
        Number.isFinite(
            conversion
        )
    ) {

        const eurPrice =
            usdPrice *
            marketsExchangeRate *
            conversion;


        formattedEurPrice =
            formatMarketPrice(
                eurPrice
            );

    }


    const rawName =
        cleanMarketDisplayName(
            config.name
        );


    const name =
        escapeMarketsHtml(
            rawName
        );


    const category =
        escapeMarketsHtml(
            item.category ||
                "other"
        );


    const categoryLabel =
        escapeMarketsHtml(
            item.category_label ||
            getCategoryMeta(
                item.category
            ).label
        );


    const imageAlt =
        escapeMarketsHtml(
            rawName
        );


    return `

        <div
            class="market-card"
            data-market-card="true"
            data-market-name="${name}"
            data-market-category="${category}"
        >

            <div
                class="worth-it-market-image-wrap"
            >

                ${
                    createMarketImagePlaceholder()
                }


                <img
                    class="worth-it-market-image"
                    data-market-name="${name}"
                    data-market-category="${category}"
                    alt="${imageAlt}"
                    aria-hidden="false"
                    style="
                        width:100%;
                        height:100%;
                        object-fit:cover;
                    "
                >

            </div>


            <div
                class="worth-it-market-card-content"
            >

                <!-- Name + category -->
                <div class="market-card-main">

                    <strong
                        class="worth-it-market-title"
                        title="${name}"
                    >
                        ${name}
                    </strong>


                    <small
                        class="worth-it-market-category"
                    >
                        ${categoryLabel}
                    </small>

                </div>


                <!-- Monthly movement -->
                <div
                    class="market-movement ${movementClass}"
                    style="
                        color:var(--market-movement-color);
                    "
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
                        ${arrow}
                        ${
                            formatMarketChange(
                                change
                            )
                        }
                    </strong>


                    <small
                        style="
                            display:block;
                            opacity:.55;
                            margin-top:0;
                            font-size:.70rem;
                        "
                    >
                        Monthly
                    </small>

                </div>


                <!-- EUR + USD -->
                <div class="market-price">

                    <strong class="market-price-eur">

                        €${formattedEurPrice}

                        <small>
                            /
                            ${
                                escapeMarketsHtml(
                                    config.eurUnit
                                )
                            }
                        </small>

                    </strong>


                    <span class="market-price-usd">

                        $${formattedUsdPrice}

                        <small>
                            /
                            ${
                                escapeMarketsHtml(
                                    config.usUnit
                                )
                            }
                        </small>

                    </span>

                </div>


                <!-- Image attribution -->
                <div
                    class="worth-it-market-image-credit"
                    style="
                        font-size:.61rem;
                        opacity:.58;
                        line-height:1.3;
                        min-height:15px;
                    "
                ></div>

            </div>

        </div>

    `;
}


/* =========================================================
   RENDER
========================================================= */

function renderMarkets() {

    const grid =
        document.getElementById(
            "materialsGrid"
        );


    if (!grid) {

        return;

    }


    ensureMarketsCardStyles();


    ensureMarketsToolbar(
        grid
    );


    renderMarketCategoryButtons();


    const filtered =
        getFilteredMarkets();


    updateMarketsCount(
        filtered.length,
        marketsData.length
    );


    if (
        !filtered.length
    ) {

        grid.innerHTML = `

            <div
                class="market-card worth-it-markets-empty-state"
            >

                <div
                    class="worth-it-markets-state-content"
                >

                    <strong>
                        No commodities found
                    </strong>


                    <small>
                        Try another search or category.
                    </small>

                </div>

            </div>

        `;


        return;

    }


    /*
     * Reset the old image queue before replacing the grid.
     * The image cache itself stays intact.
     */
    marketsImageQueue.length =
        0;


    grid.innerHTML =
        filtered
            .map(
                renderMarketCard
            )
            .join("");


    initialiseMarketImageObserver();
}


/* =========================================================
   ERROR
========================================================= */

function renderMarketsError(
    message
) {

    const grid =
        document.getElementById(
            "materialsGrid"
        );


    if (!grid) {

        return;

    }


    ensureMarketsCardStyles();


    ensureMarketsToolbar(
        grid
    );


    grid.innerHTML = `

        <div
            class="market-card worth-it-markets-error-state"
        >

            <div
                class="worth-it-markets-state-content"
            >

                <strong>
                    Markets unavailable
                </strong>


                <small>
                    ${
                        escapeMarketsHtml(
                            message ||
                            "Could not load World Bank market data."
                        )
                    }
                </small>

            </div>

        </div>

    `;
}


/* =========================================================
   REFRESH
========================================================= */

async function refreshMarkets() {

    const grid =
        document.getElementById(
            "materialsGrid"
        );


    if (!grid) {

        return;

    }


    try {

        const [

            marketResponse,

            exchangeRate

        ] = await Promise.all([

            fetch(
                `/api/markets?v=${MARKETS_UI_VERSION}`,
                {

                    method:
                        "GET",

                    cache:
                        "no-store"

                }
            ),

            getUsdToEurRate()

        ]);


        const data =
            await marketResponse.json();


        if (
            !marketResponse.ok
        ) {

            throw new Error(
                data?.error ||
                "Markets API request failed."
            );

        }


        marketsData =
            Array.isArray(
                data?.data?.prices
            )
                ? data.data.prices
                : [];


        marketsExchangeRate =
            exchangeRate;


        if (
            !marketsData.length
        ) {

            renderMarketsError(
                "No commodity data was returned by the World Bank dataset."
            );


            return;

        }


        renderMarkets();


        const updatedElement =
            document.getElementById(
                "marketsUpdated"
            );


        if (
            updatedElement
        ) {

            const latestPeriod =
                formatMarketPeriod(
                    data?.data?.latest_period
                );


            const count =
                Number(
                    data?.data?.commodity_count
                ) ||
                marketsData.length;


            updatedElement.textContent =
                `Data: ${latestPeriod} · ${count} commodities · Monthly change · World Bank Pink Sheet · CC BY 4.0`;

        }

    }
    catch (error) {

        console.error(
            "Markets frontend error:",
            error
        );


        renderMarketsError(
            "Could not load World Bank market data."
        );

    }
}


/* =========================================================
   GLOBAL
========================================================= */

window.refreshMarkets =
    refreshMarkets;


/* =========================================================
   INITIAL LOAD
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        ensureMarketsCardStyles();
        ensureMarketsGoBackUpButton();

        window.addEventListener(
            "scroll",
            updateMarketsGoBackUpButton,
            { passive:true }
        );

        updateMarketsGoBackUpButton();

        refreshMarkets();

    }
);


/* =========================================================
   HOURLY REFRESH

   The commodity dataset is monthly.
   The hourly refresh mainly keeps the EUR conversion fresh.
========================================================= */

setInterval(
    () => {

        refreshMarkets();

    },

    60 * 60 * 1000
);
