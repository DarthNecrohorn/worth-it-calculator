/* =========================================================
   WORTH IT — MARKETS UI

   Data:
     World Bank Commodity Price Data (The Pink Sheet)

   Dynamic features:
     - every commodity returned by /api/markets
     - search
     - dataset-driven categories
     - original important commodities kept first
     - lazy Wikimedia Commons image loading
     - strict image relevance/license checks on backend
     - no emoji in the image area
     - "Image unavailable" when no valid image exists
     - monthly price movement
     - rectangular responsive cards
     - desktop 3-column / tablet 2-column / mobile 1-column layout
     - toolbar categories aligned to the search field width
     - search input preserved while filtering
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
    "v8-image-cache";


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
        repeat(2, minmax(0, 420px)) !important;
    justify-content:center !important;
    gap:16px !important;
    align-items:stretch !important;
    width:100% !important;
    max-width:856px !important;
    margin-left:auto !important;
    margin-right:auto !important;
}


        .markets-grid .market-card {
            display:grid !important;
            grid-template-columns:
                125px minmax(0, 1fr) !important;
            align-items:stretch !important;
            gap:0 !important;
            width:100% !important;
            max-width:420px !important;
            min-width:0 !important;
            min-height:165px !important;
            box-sizing:border-box !important;
            overflow:hidden !important;
            padding:0 !important;
        }


        .markets-grid
        .worth-it-market-image-wrap {
            width:125px !important;
            min-width:125px !important;
            height:100% !important;
            min-height:165px !important;
            border-radius:12px 0 0 12px !important;
            overflow:hidden !important;
            position:relative !important;
        }

       .markets-grid
            .worth-it-market-image-wrap {
            display:grid !important;
            place-items:stretch !important;
        }

        .markets-grid
        .worth-it-market-image-placeholder {
            width:100% !important;
            height:100% !important;
            min-height:165px !important;
            box-sizing:border-box !important;
        }


        .markets-grid
        .worth-it-market-image {
            width:100% !important;
            height:100% !important;
            min-height:165px !important;
            object-fit:cover !important;
        }


        .worth-it-market-card-content {
            min-width:0 !important;
            min-height:165px !important;
            display:flex !important;
            flex-direction:column !important;
            justify-content:space-between !important;
            gap:11px !important;
            padding:14px 15px !important;
            box-sizing:border-box !important;
        }


        .worth-it-market-card-content
        .market-card-main {
            min-width:0 !important;
        }


        .worth-it-market-card-content
        .market-price {
            min-width:0 !important;
        }


        .worth-it-market-card-content
        .market-price-eur,
        .worth-it-market-card-content
        .market-price-usd {
            overflow-wrap:anywhere !important;
        }


        .worth-it-market-card-content
        .market-movement {
            width:100% !important;
            min-width:0 !important;
        }


        .worth-it-market-image-credit {
            min-height:16px !important;
            overflow-wrap:anywhere !important;
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


        .worth-it-markets-categories {
            display:grid !important;
            grid-template-columns:
                repeat(8, minmax(0, 1fr)) !important;
            gap:8px !important;
            width:100% !important;
            margin-top:8px !important;
            box-sizing:border-box !important;
        }


        .worth-it-markets-categories
        .worth-it-market-category-button {
            width:100% !important;
            min-width:0 !important;
            min-height:38px !important;
            padding:8px 9px !important;
            border:1px solid var(--border, rgba(128,128,128,.25)) !important;
            border-radius:10px !important;
            background:transparent !important;
            color:var(--text) !important;
            cursor:pointer !important;
            font:inherit !important;
            font-size:.80rem !important;
            font-weight:700 !important;
            line-height:1.15 !important;
            text-align:center !important;
            display:flex !important;
            align-items:center !important;
            justify-content:center !important;
            gap:3px !important;
            box-sizing:border-box !important;
            overflow:hidden !important;
        }


        .worth-it-markets-categories
        .worth-it-market-category-button:hover {
            background:var(--surface-soft, rgba(128,128,128,.07)) !important;
        }


        .worth-it-markets-categories
        .worth-it-market-category-button.active {
            background:var(--surface-soft, rgba(128,128,128,.12)) !important;
            font-weight:800 !important;
        }


        .worth-it-market-category-label {
            min-width:0 !important;
            overflow:hidden !important;
            text-overflow:ellipsis !important;
            white-space:nowrap !important;
        }


        .worth-it-market-category-count {
            flex:0 0 auto !important;
            opacity:.6 !important;
            font-size:.78em !important;
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

        @media (max-width:1024px) {

            .markets-grid {
               grid-template-columns:
                  repeat(2, minmax(0, 350px)) !important;
                      max-width:856px !important;
              }


            .worth-it-markets-categories {
                grid-template-columns:
                    repeat(4, minmax(0, 1fr)) !important;
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
                             max-width:350px !important;
                  }


            .markets-grid .market-card {
                grid-template-columns:
                    105px minmax(0, 1fr) !important;
            }


            .markets-grid
            .worth-it-market-image-wrap {
                width:105px !important;
                min-width:105px !important;
            }


            .worth-it-market-card-content {
                padding:13px !important;
                gap:10px !important;
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
                font-size:.79rem !important;
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


function getCategoryMeta(
    category
) {

    const map = {

        all: {
            label:
                "All"
        },

        "precious-metals": {
            label:
                "Precious Metals"
        },

        "metals-minerals": {
            label:
                "Metals & Minerals"
        },

        energy: {
            label:
                "Energy"
        },

        fertilizers: {
            label:
                "Fertilizers"
        },

        "agriculture-food": {
            label:
                "Agriculture & Food"
        },

        "raw-materials": {
            label:
                "Raw Materials"
        },

        other: {
            label:
                "Other"
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


                const count =
                    category === "all"
                        ? marketsData.length
                        : categoryCounts[
                            category
                        ] ||
                        0;


                const active =
                    marketsCurrentCategory ===
                    category;


                return `

                    <button
                        type="button"
                        class="worth-it-market-category-button$${
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
                            class="worth-it-market-category-label"
                        >
                            ${
                                escapeMarketsHtml(
                                    meta.label
                                )
                            }
                        </span>


                        <span
                            class="worth-it-market-category-count"
                        >
                            ${count}
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


            const haystack =
                normalizeMarketsSearch(
                    `${item.name} ${item.code} ${
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
                min-height:165px;
                display:flex;
                align-items:center;
                justify-content:center;
                text-align:center;
                padding:15px;
                box-sizing:border-box;
                opacity:.62;
                font-size:.78rem;
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

    const key =
        getMarketImageCacheKey(
            name
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

            name,

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
            `Market image search failed for ${name}:`,
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


    imageElement.alt =
        name;


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
        config.name;


    const name =
        escapeMarketsHtml(
            rawName
        );


    const symbol =
        escapeMarketsHtml(
            config.symbol
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
                        display:none;
                        width:100%;
                        height:100%;
                        object-fit:cover;
                    "
                >

            </div>


            <div
                class="worth-it-market-card-content"
            >

                <div class="market-card-main">

                    <div>

                        <strong
                            style="
                                display:block;
                                line-height:1.25;
                                overflow-wrap:anywhere;
                            "
                        >
                            ${name}
                        </strong>


                        <small
                            style="
                                display:block;
                                opacity:.62;
                                margin-top:3px;
                            "
                        >
                            ${symbol}
                        </small>


                        <small
                            style="
                                display:block;
                                opacity:.55;
                                margin-top:3px;
                                overflow-wrap:anywhere;
                            "
                        >
                            ${categoryLabel}
                        </small>

                    </div>

                </div>


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
                            margin-top:3px;
                            font-size:.72rem;
                        "
                    >
                        Monthly
                    </small>

                </div>


                <div
                    class="worth-it-market-image-credit"
                    style="
                        font-size:.66rem;
                        opacity:.58;
                        line-height:1.35;
                        min-height:16px;
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
