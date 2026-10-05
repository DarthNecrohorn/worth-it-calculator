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
     markets.js. This UI consumes images returned by that
     validated backend endpoint, but an image is NOT required
     for a commodity card to exist.
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

const marketsWikipediaCache = new Map();
const marketsWikipediaQueue = [];
let marketsWikipediaActive = 0;
const MARKETS_WIKIPEDIA_CONCURRENCY = 3;
async function fetchWikipediaSummary(title) {
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) return null;
    const key = cleanTitle.toLowerCase();
    if (marketsWikipediaCache.has(key)) return marketsWikipediaCache.get(key);
    try {
        let result = null;
        const response = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(cleanTitle.replace(/\s+/g, "_")));
        if (response.ok) {
            const data = await response.json();
            if (data?.extract && data?.content_urls?.desktop?.page) result = {extract:data.extract,url:data.content_urls.desktop.page};
        }
        if (!result) {
            const search = await fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(cleanTitle) + "&utf8=1&format=json&origin=*");
            const data = search.ok ? await search.json() : null;
            const hit = data?.query?.search?.[0];
            if (hit?.title) {
                const fallback = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(hit.title.replace(/\s+/g, "_")));
                if (fallback.ok) {
                    const info = await fallback.json();
                    if (info?.extract && info?.content_urls?.desktop?.page) result = {extract:info.extract,url:info.content_urls.desktop.page};
                }
            }
        }
        marketsWikipediaCache.set(key,result);
        return result;
    } catch { marketsWikipediaCache.set(key,null); return null; }
}
function queueMarketWikipedia(card) {
    if (!card || card.dataset.wikipediaLoaded === "1" || card.dataset.wikipediaQueued === "1") return;
    card.dataset.wikipediaQueued = "1";
    marketsWikipediaQueue.push(card);
    processMarketWikipediaQueue();
}
function processMarketWikipediaQueue() {
    while (marketsWikipediaActive < MARKETS_WIKIPEDIA_CONCURRENCY && marketsWikipediaQueue.length) {
        const card = marketsWikipediaQueue.shift();
        marketsWikipediaActive++;
        fetchWikipediaSummary(card.dataset.marketWikipediaTitle || card.dataset.marketName || "").then(info => {
            const description=card.querySelector(".worth-it-market-wikipedia-description");
            const link=card.querySelector(".worth-it-market-wikipedia-link");
            if (!description || !link) return;
            if (info?.extract && info?.url) { description.textContent=info.extract; description.classList.add("is-loaded"); link.href=info.url; link.classList.add("is-loaded"); }
            else { description.textContent="Wikipedia information is currently unavailable."; description.classList.add("is-loaded"); link.classList.add("is-unavailable"); }
            card.dataset.wikipediaLoaded="1";
        }).finally(()=>{marketsWikipediaActive--;processMarketWikipediaQueue();});
    }
}
function initialiseMarketWikipediaObserver() {
    const grid=document.getElementById("materialsGrid"); if(!grid)return;
    const cards=grid.querySelectorAll('.market-card[data-market-card="true"]');
    if(!("IntersectionObserver" in window)){cards.forEach(queueMarketWikipedia);return;}
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){queueMarketWikipedia(entry.target);observer.unobserve(entry.target);}}),{rootMargin:"500px 0px",threshold:0.01});
    cards.forEach(card=>observer.observe(card));
}

const marketsImageFailed =
    new Set();

/*
 * Share the same in-flight request when the same commodity is
 * encountered more than once during image loading.
 */
const marketsImagePromiseCache =
    new Map();

/*
 * Persistent authenticated-account image state.
 */
const marketsAccountImageCache =
    new Map();

const marketsImageReasonCache =
    new Map();

let marketsAccountImageCacheLoaded =
    false;

let marketsAccountImageCacheUserId =
    "";

let marketsAccountImageCachePromise =
    null;

const marketsAccountImageSaveQueue =
    new Map();

let marketsAccountImageSaveTimer =
    null;

/*
 * Prevent an older asynchronous render from replacing a newer
 * search/category selection.
 */
let marketsRenderRequestId =
    0;

/*
 * Markets commodity detail modal/navigation state.
 * Navigation follows the currently visible filtered card order.
 */
let marketsDetailNavigationItems = [];
let marketsDetailNavigationIndex = -1;
let marketsLatestPeriod = "";




/*
 * Frontend version used to invalidate older image request URLs.
 *
 * The actual commodity limit is controlled by markets.js.
 * This UI has no separate commodity limit and will render every
 * commodity returned by the backend.
 */
const MARKETS_UI_VERSION =
    "v11-all-commodities";


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
    height:120px !important;
    min-height:120px !important;
    max-height:120px !important;
    box-sizing:border-box !important;
    overflow:hidden !important;
    padding:0 !important;
    align-self:start !important;

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
    height:120px !important;
    min-height:120px !important;
    max-height:120px !important;
    display:flex !important;
    flex-direction:column !important;
    justify-content:flex-start !important;
    gap:6px !important;
    padding:10px 13px !important;
    box-sizing:border-box !important;
    overflow:hidden !important;
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
    position:relative !important;
    top:-28px !important;
    left:8px !important;
    z-index:3 !important;
}


.worth-it-market-card-content
.market-price-eur,
.worth-it-market-card-content
.market-price-usd {
    display:block !important;
    overflow-wrap:anywhere !important;
    white-space:normal !important;
    font-size:.84rem !important;
    font-weight:800 !important;
    line-height:1.18 !important;
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
   IMAGE-UNAVAILABLE MARKET ART
================================= */

.worth-it-market-image-placeholder.market-image-unavailable {
    position:relative !important;
    overflow:hidden !important;
    justify-content:center !important;
    align-items:center !important;
    flex-direction:column !important;
    gap:5px !important;
    opacity:1 !important;
    color:var(--text) !important;
    border-right:1px solid rgba(128,128,128,.10) !important;
    background:linear-gradient(145deg, rgba(124,58,237,.10), rgba(37,99,235,.06)) !important;
}
.worth-it-market-image-placeholder.market-image-unavailable::before {
    content:"" !important;
    position:absolute !important;
    inset:0 !important;
    opacity:.45 !important;
    pointer-events:none !important;
    background-image:
        radial-gradient(circle at 18% 20%, rgba(255,255,255,.35) 0 2px, transparent 2.5px),
        linear-gradient(135deg, transparent 0 45%, rgba(128,128,128,.10) 45% 46%, transparent 46% 100%) !important;
    background-size:18px 18px, 100% 100% !important;
}
.worth-it-market-image-placeholder .market-image-unavailable-icon,
.worth-it-market-image-placeholder .market-image-unavailable-title,
.worth-it-market-image-placeholder .market-image-unavailable-reason {
    position:relative !important;
    z-index:1 !important;
}
.market-image-unavailable-icon { font-size:1.55rem !important; line-height:1 !important; }
.market-image-unavailable-title {
    font-size:.68rem !important;
    line-height:1.1 !important;
    font-weight:800 !important;
    text-transform:uppercase !important;
    letter-spacing:.045em !important;
}
.market-image-unavailable-reason {
    max-width:100% !important;
    font-size:.56rem !important;
    line-height:1.25 !important;
    opacity:.62 !important;
    text-align:center !important;
    overflow:hidden !important;
    display:-webkit-box !important;
    -webkit-line-clamp:3 !important;
    -webkit-box-orient:vertical !important;
}
.market-image-category-precious-metals { background:linear-gradient(145deg, rgba(212,175,55,.18), rgba(124,58,237,.07)) !important; }
.market-image-category-metals-minerals { background:linear-gradient(145deg, rgba(100,116,139,.17), rgba(37,99,235,.07)) !important; }
.market-image-category-energy { background:linear-gradient(145deg, rgba(245,158,11,.17), rgba(37,99,235,.07)) !important; }
.market-image-category-fertilizers { background:linear-gradient(145deg, rgba(34,197,94,.16), rgba(37,99,235,.06)) !important; }
.market-image-category-agriculture-food { background:linear-gradient(145deg, rgba(132,204,22,.16), rgba(245,158,11,.07)) !important; }
.market-image-category-raw-materials { background:linear-gradient(145deg, rgba(180,83,9,.14), rgba(124,58,237,.07)) !important; }
.market-image-category-other { background:linear-gradient(145deg, rgba(124,58,237,.10), rgba(37,99,235,.08)) !important; }


/* ================================
   MARKET DETAIL MODAL
================================= */

.worth-it-market-detail-modal {
    position:fixed !important;
    inset:0 !important;
    z-index:12000 !important;
    display:none !important;
    align-items:center !important;
    justify-content:center !important;
    padding:20px !important;
    box-sizing:border-box !important;
}

.worth-it-market-detail-modal.is-open {
    display:flex !important;
}

.worth-it-market-detail-backdrop {
    position:absolute !important;
    inset:0 !important;
    background:rgba(5,7,12,.62) !important;
    backdrop-filter:blur(7px) !important;
}

.worth-it-market-detail-dialog {
    position:relative !important;
    z-index:1 !important;
    width:min(760px, calc(100vw - 40px)) !important;
    max-height:min(760px, calc(100vh - 40px)) !important;
    overflow:auto !important;
    border:1px solid transparent !important;
    border-radius:20px !important;
    background:
        linear-gradient(#ffffff, #ffffff) padding-box,
        linear-gradient(120deg, #7c3aed, #2563eb) border-box !important;
    box-shadow:
        0 24px 80px rgba(0,0,0,.28),
        0 8px 30px rgba(37,99,235,.12) !important;
    color:#171923 !important;
}

html[data-theme="dark"] .worth-it-market-detail-dialog {
    background:
        linear-gradient(#171923, #171923) padding-box,
        linear-gradient(120deg, #7c3aed, #2563eb) border-box !important;
    color:#f5f7fa !important;
}

html[data-theme="dark"] .worth-it-market-detail-close {
    background:rgba(255,255,255,.08) !important;
    border-color:rgba(255,255,255,.14) !important;
    color:#fff !important;
}

html[data-theme="dark"] .worth-it-market-detail-stat {
    background:rgba(255,255,255,.055) !important;
    border-color:rgba(255,255,255,.12) !important;
}

html[data-theme="dark"] .worth-it-market-detail-meta div {
    border-bottom-color:rgba(255,255,255,.10) !important;
}

html[data-theme="dark"] .worth-it-market-detail-change {
    background:linear-gradient(120deg, rgba(124,58,237,.18), rgba(37,99,235,.14)) !important;
}

.worth-it-market-detail-close {
    position:absolute !important;
    top:12px !important;
    right:12px !important;
    z-index:4 !important;
    width:42px !important;
    height:42px !important;
    border:1px solid rgba(128,128,128,.22) !important;
    border-radius:50% !important;
    background:var(--surface-soft, rgba(128,128,128,.08)) !important;
    color:var(--text) !important;
    font-size:28px !important;
    line-height:1 !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important;
    padding:0 !important;
    transform:none !important;
    cursor:pointer !important;
    transition:transform .16s ease, background .16s ease, border-color .16s ease !important;
}

.worth-it-market-detail-close:hover,
.worth-it-market-detail-close:focus-visible {
    outline:none !important;
    background:rgba(124,58,237,.14) !important;
    border-color:rgba(124,58,237,.48) !important;
}
.worth-it-market-detail-close:hover {
    transform:scale(1.06) !important;
}

.worth-it-market-detail-body {
    padding:28px !important;
    box-sizing:border-box !important;
}

.worth-it-market-detail-header {
    display:flex !important;
    align-items:flex-start !important;
    justify-content:space-between !important;
    gap:18px !important;
    padding-right:46px !important;
}

.worth-it-market-detail-title {
    margin:0 !important;
    font-size:clamp(1.45rem, 3vw, 2rem) !important;
    line-height:1.1 !important;
    font-weight:850 !important;
}

.worth-it-market-detail-category {
    display:block !important;
    margin-top:6px !important;
    opacity:.62 !important;
    font-size:.82rem !important;
}

.worth-it-market-detail-price-grid {
    display:grid !important;
    grid-template-columns:repeat(2,minmax(0,1fr)) !important;
    gap:10px !important;
    margin-top:22px !important;
}

.worth-it-market-detail-stat {
    padding:14px !important;
    border:1px solid rgba(128,128,128,.16) !important;
    border-radius:14px !important;
    background:var(--surface-soft, rgba(128,128,128,.06)) !important;
}

.worth-it-market-detail-stat small {
    display:block !important;
    margin-bottom:5px !important;
    opacity:.58 !important;
    font-size:.72rem !important;
}

.worth-it-market-detail-stat strong {
    display:block !important;
    font-size:1rem !important;
    line-height:1.25 !important;
}

.worth-it-market-detail-change {
    margin-top:10px !important;
    padding:13px 14px !important;
    border-radius:14px !important;
    background:linear-gradient(120deg, rgba(124,58,237,.09), rgba(37,99,235,.07)) !important;
}

.worth-it-market-detail-meta {
    display:grid !important;
    grid-template-columns:repeat(2,minmax(0,1fr)) !important;
    gap:10px 16px !important;
    margin-top:18px !important;
    font-size:.82rem !important;
}

.worth-it-market-detail-meta div {
    min-width:0 !important;
    padding:10px 0 !important;
    border-bottom:1px solid rgba(128,128,128,.12) !important;
}

.worth-it-market-detail-meta span {
    display:block !important;
    opacity:.55 !important;
    font-size:.7rem !important;
    margin-bottom:3px !important;
}

.worth-it-market-detail-meta strong {
    overflow-wrap:anywhere !important;
}

.worth-it-market-detail-image {
    width:100% !important;
    height:180px !important;
    object-fit:cover !important;
    border-radius:14px !important;
    margin-top:18px !important;
    display:block !important;
}

.worth-it-market-detail-navigation {
    position:fixed !important;
    top:50% !important;
    z-index:12002 !important;
    display:grid !important;
    place-items:center !important;
    width:72px !important;
    height:104px !important;
    padding:0 0 8px !important;
    border:1px solid rgba(255,255,255,.16) !important;
    border-radius:18px !important;
    background:rgba(12,14,19,.82) !important;
    color:#fff !important;
    font-family:Georgia,"Times New Roman",serif !important;
    font-size:64px !important;
    font-weight:700 !important;
    line-height:1 !important;
    cursor:pointer !important;
    transform:translateY(-50%) !important;
    box-shadow:0 14px 36px rgba(0,0,0,.32) !important;
    backdrop-filter:blur(8px) !important;
    transition:transform .15s ease,background .15s ease,border-color .15s ease !important;
}

.worth-it-market-detail-navigation {
    flex-direction:column !important;
    gap:5px !important;
}

.worth-it-market-detail-navigation-key {
    display:block !important;
    font-family:Inter,ui-sans-serif,system-ui,sans-serif !important;
    font-size:16px !important;
    font-weight:800 !important;
    line-height:1 !important;
    opacity:.85 !important;
}

.worth-it-market-detail-navigation-arrow {
    display:block !important;
    font-family:Georgia,"Times New Roman",serif !important;
    font-size:64px !important;
    font-weight:700 !important;
    line-height:.8 !important;
}

.worth-it-market-detail-navigation-previous {
    left:calc(50% - 462px) !important;
}

.worth-it-market-detail-navigation-next {
    right:calc(50% - 462px) !important;
}

@media (max-width:1100px) {
    .worth-it-market-detail-navigation-previous {
        left:6px !important;
    }

    .worth-it-market-detail-navigation-next {
        right:6px !important;
    }
}

.worth-it-market-detail-navigation:hover,
.worth-it-market-detail-navigation:focus-visible {
    background:rgba(124,92,255,.24) !important;
    border-color:rgba(124,92,255,.62) !important;
    outline:none !important;
    transform:translateY(-50%) !important;
}

.worth-it-market-detail-navigation[hidden] {
    display:none !important;
}

html[data-theme="light"] .worth-it-market-detail-navigation {
    border-color:rgba(0,0,0,.12) !important;
    background:rgba(255,255,255,.9) !important;
    color:#16181d !important;
    box-shadow:0 14px 36px rgba(0,0,0,.18) !important;
}

body.worth-it-market-detail-modal-open {
    overflow:hidden !important;
}

@media (max-width:700px) {
    .worth-it-market-detail-modal {
        padding:10px !important;
    }

    .worth-it-market-detail-dialog {
        width:calc(100vw - 20px) !important;
        max-height:calc(100vh - 20px) !important;
        border-radius:16px !important;
    }

    .worth-it-market-detail-body {
        padding:18px !important;
    }

    .worth-it-market-detail-navigation {
        width:58px !important;
        height:88px !important;
        font-size:50px !important;
    }

    .worth-it-market-detail-navigation-key {
        font-size:13px !important;
    }

    .worth-it-market-detail-navigation-arrow {
        font-size:50px !important;
    }

    .worth-it-market-detail-navigation-previous {
        left:4px !important;
    }

    .worth-it-market-detail-navigation-next {
        right:4px !important;
    }

    .worth-it-market-detail-price-grid,
    .worth-it-market-detail-meta {
        grid-template-columns:1fr !important;
    }

    .worth-it-market-detail-image {
        height:150px !important;
    }
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
    z-index:10050 !important;

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
        scale(1.018) !important;
    transform-origin: 50% 50% !important;

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
        height:116px !important;
        min-height:116px !important;
        max-height:116px !important;
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

    /* =========================================================
       ACCESSIBILITY / POSITIONING FOR FLOATING MARKETS CONTROL
       Markets keeps its modern visual style. Only size/position changes.
    ========================================================= */

    .worth-it-markets-back-up {
        min-height:56px !important;
        padding:12px 16px !important;
        font-size:.90rem !important;
    }

    html[data-ui-scale="small"] .worth-it-markets-back-up {
        min-height:62px !important;
        padding:13px 18px !important;
        font-size:1rem !important;
    }

    html[data-ui-scale="large"] .worth-it-markets-back-up,
    html[data-ui-scale="xl"] .worth-it-markets-back-up {
        min-height:46px !important;
        padding:10px 16px !important;
        font-size:.82rem !important;
    }

    html[data-ui-scale="large"] .worth-it-markets-back-up {
        right:4px !important;
    }

    html[data-ui-scale="xl"] .worth-it-markets-back-up {
        right:0 !important;
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

    const rawPeriod =
        String(period || "").trim();

    const match =
        rawPeriod.match(
            /^(\d{4})M(\d{2})$/
        ) ||
        rawPeriod.match(
            /^(\d{4})-(\d{2})(?:-\d{2})?$/
        ) ||
        rawPeriod.match(
            /^(\d{4})\/(\d{2})$/
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
    name,
    category = ""
) {

    return (
        `${normalizeMarketsSearch(name)}::` +
        `${normalizeMarketsSearch(category)}`
    );
}


/* =========================================================
   MARKET DISPLAY UNITS

   EUR uses metric / European display units.
   USD uses US customary display units where a reliable
   commodity-wide conversion exists. Future commodities
   inherit the same conversion rules automatically.
========================================================= */

function normalizeMarketUnitLabel(
    value
) {

    return String(
        value ??
        "unit"
    )
        .replace(
            /^[\s(]+|[\s)]+$/g,
            ""
        )
        .trim() ||
        "unit";
}


function getMarketDisplaySpec(
    item
) {

    const base =
        getMarketConfigFallback(
            item
        );

    const eurUnit =
        normalizeMarketUnitLabel(
            base.eurUnit
        );

    const currentUsUnit =
        normalizeMarketUnitLabel(
            base.usUnit
        );

    let usUnit =
        currentUsUnit;

    let usConversion =
        1;

    /*
     * Metric-ton source prices are presented in short tons for
     * the US line. 1 metric ton = 1.1023113109244 short tons.
     */
    if (
        currentUsUnit.toLowerCase() ===
        "metric ton"
    ) {

        usUnit =
            "short ton";

        usConversion =
            0.90718474;

    }

    /*
     * Kilogram source prices are presented in pounds for the
     * US line. 1 lb = 0.45359237 kg.
     */
    else if (
        currentUsUnit.toLowerCase() ===
        "kg"
    ) {

        usUnit =
            "lb";

        usConversion =
            0.45359237;

    }


    return {

        eurUnit,

        usUnit,

        eurConversion:
            Number(
                base.conversion
            ) > 0
                ? Number(
                    base.conversion
                )
                : 1,

        usConversion

    };
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
    totalCount,
    isResolving = false
) {

    const countElement =
        document.getElementById(
            "worthItMarketsCount"
        );


    if (!countElement) {

        return;

    }


    if (
        isResolving
    ) {

        countElement.textContent =
            "Loading commodities…";

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

                    top:
                        0,

                    behavior:
                        "smooth"

                }
            );

        }
    );


    document.body.appendChild(
        button
    );
}


function positionMarketsBackUpButton(button, anchor) {
    if (!button || !anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const scale =
        Number(
            getComputedStyle(document.documentElement)
                .getPropertyValue("--ui-scale")
        ) || 1;
    const gap = 12;

    let left = (anchorRect.right + gap) / scale;
    const maxLeft =
        (window.innerWidth - buttonRect.width - gap) / scale;

    if (left > maxLeft) left = maxLeft;
    left = Math.max(8 / scale, left);

    button.style.setProperty(
        "left",
        left + "px",
        "important"
    );
    button.style.setProperty(
        "right",
        "auto",
        "important"
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

    if (shouldShow) {
        positionMarketsBackUpButton(
            button,
            document.getElementById("materialsGrid") ||
            marketsSection
        );
    }

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
    message = "Loading image...",
    category = "other",
    reason = ""
) {

    const unavailable =
        message === "Image unavailable";

    const meta =
        getCategoryMeta(
            category
        );

    const categoryClass =
        String(
            category || "other"
        )
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-");

    if (!unavailable) {
        return (
            '<div class="worth-it-market-image-placeholder" ' +
            'style="width:100%;height:100%;min-height:120px;' +
            'display:flex;align-items:center;justify-content:center;' +
            'text-align:center;padding:12px;box-sizing:border-box;' +
            'opacity:.62;font-size:.76rem;">' +
            escapeMarketsHtml(message) +
            '</div>'
        );
    }

    const safeReason =
        escapeMarketsHtml(
            reason ||
            "No suitable image passed the current image checks."
        );

    return (
        '<div class="worth-it-market-image-placeholder ' +
        'market-image-unavailable market-image-category-' +
        escapeMarketsHtml(categoryClass) +
        '" role="img" aria-label="Image unavailable for ' +
        escapeMarketsHtml(meta.label) +
        '" style="width:100%;height:100%;min-height:120px;' +
        'display:flex;box-sizing:border-box;padding:12px;">' +

        '<span class="market-image-unavailable-icon" ' +
        'aria-hidden="true">' +
        escapeMarketsHtml(meta.icon) +
        '</span>' +

        '<small class="market-image-unavailable-reason" ' +
        'title="' + safeReason + '">' +
        safeReason +
        '</small>' +

        '</div>'
    );
}


function showMarketImageUnavailable(
    imageElement
) {

    if (!imageElement) {

        return;

    }

    /*
     * Hide the actual <img> element when Wikimedia has no
     * acceptable image. This prevents the browser from showing
     * the image icon + commodity alt text (for example "DAP")
     * on top of the custom unavailable-image artwork.
     *
     * IMPORTANT:
     * Keep the custom placeholder itself visible.
     */
    imageElement.style.display =
        "none";

    imageElement.style.visibility =
        "hidden";

    const card =
        imageElement.closest(
            "[data-market-card=\"true\"]"
        );


    /*
     * IMPORTANT:
     * A missing Wikimedia image must NOT remove the commodity card.
     *
     * The commodity data comes from World Bank and remains useful
     * even when Wikimedia has no acceptable image.
     */
    if (card) {

        const placeholder =
            card.querySelector(
                ".worth-it-market-image-placeholder"
            );


        if (placeholder) {

            const category =
                imageElement.dataset
                    .marketCategory ||
                "other";

            const reason =
                imageElement.dataset
                    .marketImageReason ||
                marketsImageReasonCache.get(
                    getMarketAccountImageKey(
                        imageElement.dataset.marketName || "",
                        category
                    )
                ) ||
                "No suitable image passed the current image checks.";

            const wrapper =
                document.createElement(
                    "div"
                );

            wrapper.innerHTML =
                createMarketImagePlaceholder(
                    "Image unavailable",
                    category,
                    reason
                );

            const replacement =
                wrapper.firstElementChild;

            if (replacement) {
                placeholder.replaceWith(
                    replacement
                );
            }

            return;

        }


        imageElement.dataset
            .marketImageState =
            "unavailable";


        imageElement.remove();

        return;

    }


    imageElement.remove();
}


/* =========================================================
   ACCOUNT IMAGE CACHE
========================================================= */

function getMarketAccountImageKey(
    name,
    category
) {
    return [
        cleanMarketDisplayName(name)
            .trim()
            .toLowerCase(),
        String(category || "other")
            .trim()
            .toLowerCase()
    ]
        .filter(Boolean)
        .join("|");
}

async function getMarketAuthSession() {
    try {
        if (!window.supabaseClient?.auth) {
            return null;
        }

        const { data, error } =
            await window.supabaseClient.auth.getSession();

        if (error) {
            return null;
        }

        return data?.session || null;

    } catch {
        return null;
    }
}

async function loadMarketAccountImageCache() {

    const session =
        await getMarketAuthSession();

    const userId =
        String(session?.user?.id || "").trim();

    if (!userId) {
        marketsAccountImageCache.clear();
        marketsImageReasonCache.clear();
        marketsAccountImageCacheLoaded = true;
        marketsAccountImageCacheUserId = "";
        return;
    }

    if (
        marketsAccountImageCacheLoaded &&
        marketsAccountImageCacheUserId === userId
    ) {
        return;
    }

    if (
        marketsAccountImageCachePromise &&
        marketsAccountImageCacheUserId === userId
    ) {
        return marketsAccountImageCachePromise;
    }

    marketsAccountImageCache.clear();
    marketsImageReasonCache.clear();
    marketsAccountImageCacheLoaded = false;
    marketsAccountImageCacheUserId = userId;

    marketsAccountImageCachePromise =
        (async () => {

            try {
                const response =
                    await fetch(
                        "/api/markets?action=account-image-cache-get",
                        {
                            method:"GET",
                            cache:"no-store",
                            headers:{
                                "Authorization":
                                    "Bearer " +
                                    session.access_token
                            }
                        }
                    );

                if (!response.ok) {
                    return;
                }

                const data =
                    await response.json();

                const records =
                    Array.isArray(data?.records)
                        ? data.records
                        : [];

                records.forEach(
                    record => {

                        const key =
                            record?.imageKey ||
                            getMarketAccountImageKey(
                                record?.commodityName,
                                record?.category
                            );

                        if (!key) {
                            return;
                        }

                        const image =
                            record?.found &&
                            hasValidMarketImage(record?.image)
                                ? record.image
                                : null;

                        marketsImageCache.set(
                            key,
                            image
                        );

                        if (image) {
                            marketsImageFailed.delete(key);
                        }
                        else {
                            marketsImageFailed.add(key);
                        }

                        if (record?.reason) {
                            marketsImageReasonCache.set(
                                key,
                                String(record.reason)
                            );
                        }
                    }
                );

            }
            catch (error) {
                console.warn(
                    "Markets account image cache load failed:",
                    error
                );
            }
            finally {
                marketsAccountImageCacheLoaded = true;
                marketsAccountImageCachePromise = null;
            }

        })();

    return marketsAccountImageCachePromise;
}

function queueMarketAccountImageSave(
    name,
    category,
    image,
    reason = ""
) {

    if (
        !marketsAccountImageCacheLoaded ||
        !marketsAccountImageCacheUserId
    ) {
        return;
    }

    const key =
        getMarketAccountImageKey(
            name,
            category
        );

    if (!key) {
        return;
    }

    const found =
        hasValidMarketImage(image);

    const record = {
        imageKey:key,
        commodityName:
            cleanMarketDisplayName(name),
        category:category || "other",
        found,
        image:found ? image : null,
        reason:found
            ? ""
            : String(reason || "").slice(0, 500)
    };

    marketsAccountImageCache.set(
        key,
        found ? image : null
    );

    if (found) {
        marketsImageFailed.delete(key);
        marketsImageReasonCache.delete(key);
    }
    else {
        marketsImageFailed.add(key);
        if (record.reason) {
            marketsImageReasonCache.set(key, record.reason);
        }
    }

    marketsAccountImageSaveQueue.set(
        key,
        record
    );

    if (!marketsAccountImageSaveTimer) {
        marketsAccountImageSaveTimer =
            setTimeout(
                flushMarketAccountImageSaveQueue,
                1200
            );
    }
}

async function flushMarketAccountImageSaveQueue() {

    marketsAccountImageSaveTimer = null;

    if (!marketsAccountImageSaveQueue.size) {
        return;
    }

    const session =
        await getMarketAuthSession();

    if (
        !session?.access_token ||
        !session?.user?.id ||
        session.user.id !== marketsAccountImageCacheUserId
    ) {
        return;
    }

    const records =
        Array.from(
            marketsAccountImageSaveQueue.values()
        ).slice(0, 100);

    records.forEach(
        record => {
            marketsAccountImageSaveQueue.delete(record.imageKey);
        }
    );

    try {
        const response =
            await fetch(
                "/api/markets?action=account-image-cache-upsert",
                {
                    method:"POST",
                    cache:"no-store",
                    headers:{
                        "Content-Type":"application/json",
                        "Authorization":
                            "Bearer " +
                            session.access_token
                    },
                    body:
                        JSON.stringify({
                            records
                        })
                }
            );

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

    }
    catch (error) {
        console.warn(
            "Markets account image cache save failed:",
            error
        );

        records.forEach(
            record => {
                marketsAccountImageSaveQueue.set(
                    record.imageKey,
                    record
                );
            }
        );

        if (!marketsAccountImageSaveTimer) {
            marketsAccountImageSaveTimer =
                setTimeout(
                    flushMarketAccountImageSaveQueue,
                    2500
                );
        }
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
            cleanName,
            category
        );


    if (
        marketsAccountImageCacheLoaded &&
        marketsImageCache.has(
            key
        )
    ) {

        return marketsImageCache.get(
            key
        );

    }


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
        marketsImagePromiseCache.has(
            key
        )
    ) {

        return marketsImagePromiseCache.get(
            key
        );

    }


    const requestPromise =
        (async () => {

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

                            category:
                                category ||
                                "other"

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
                    data?.found &&
                    data?.image &&
                    (
                        data.image.url ||
                        data.image.thumbnailUrl
                    )
                        ? data.image
                        : null;


                /*
                 * Cache negative results too. A commodity that the
                 * backend explicitly rejects should not be requested
                 * again on every search/category render.
                 */
                marketsImageCache.set(
                    key,
                    image
                );


                if (!image) {

                    marketsImageFailed.add(
                        key
                    );

                    const reason =
                        String(
                            data?.note ||
                            "No suitable image passed the current image checks."
                        );

                    marketsImageReasonCache.set(
                        key,
                        reason
                    );

                    queueMarketAccountImageSave(
                        cleanName,
                        category,
                        null,
                        reason
                    );

                }
                else {

                    marketsImageFailed.delete(
                        key
                    );

                    marketsImageReasonCache.delete(
                        key
                    );

                    queueMarketAccountImageSave(
                        cleanName,
                        category,
                        image
                    );

                }


                return image;

            }
            catch (error) {

                console.warn(
                    `Market image search failed for ${cleanName}:`,
                    error
                );


                /*
                 * Do not permanently cache transport/API errors as a
                 * negative image result. A later render can retry them.
                 */
                return null;

            }
            finally {

                marketsImageLoading.delete(
                    key
                );


                marketsImagePromiseCache.delete(
                    key
                );

            }

        })();


    marketsImagePromiseCache.set(
        key,
        requestPromise
    );


    return requestPromise;
}


function hasValidMarketImage(
    image
) {

    return Boolean(
        image &&
        (
            image.url ||
            image.thumbnailUrl
        )
    );
}


/* =========================================================
   COMMODITY RESOLUTION
   =========================================================

   IMPORTANT:
   Every commodity returned by the World Bank backend is kept.

   Wikimedia image availability is optional. Images are loaded
   lazily by the image observer below and therefore cannot remove
   the commodity itself from the Markets dataset.

========================================================= */

async function resolveMarketsWithValidImages(
    items,
    requestId
) {

    if (
        requestId !==
        marketsRenderRequestId
    ) {

        return null;

    }


    /*
     * Keep every commodity.
     *
     * The image field starts as null and is filled by the existing
     * lazy image loading system when the card enters the viewport.
     *
     * This preserves the World Bank dataset independently from
     * Wikimedia image availability.
     */
    return items.map(
        item => {

            const category =
                item?.category ||
                "other";

            const cleanName =
                cleanMarketDisplayName(
                    item?.name
                );

            const key =
                getMarketAccountImageKey(
                    cleanName,
                    category
                );

            const cached =
                marketsImageCache.has(key)
                    ? marketsImageCache.get(key)
                    : null;

            return {
                item,
                image:cached || null,
                imageReason:
                    marketsImageReasonCache.get(key) || ""
            };

        }
    );
}


/* =========================================================
   IMAGE QUEUE
========================================================= */

function queueMarketImage(
    imageElement,
    name,
    category,
    imageData = null
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

            category,

            imageData

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
            job.category,
            job.imageData
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
    category,
    preloadedImage = null
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
        preloadedImage ||
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


    if (
        !image ||
        !hasValidMarketImage(image)
    ) {

        imageElement.dataset
            .marketImageState =
            "unavailable";

        imageElement.dataset
            .marketImageReason =
            marketsImageReasonCache.get(
                getMarketAccountImageKey(
                    name,
                    category
                )
            ) ||
            "No suitable image passed the current image checks.";

        showMarketImageUnavailable(
            imageElement
        );


        return;

    }


    const finalUrl =
        image.thumbnailUrl ||
        image.url;


    if (!finalUrl) {

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
                            "other",
                        image.__marketImageData ||
                            null
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
                                "other",
                            image.__marketImageData ||
                                null
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
   MARKET DETAIL MODAL / NAVIGATION
========================================================= */

function createMarketDetailModal() {
    let modal = document.getElementById("worthItMarketDetailModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "worthItMarketDetailModal";
    modal.className = "worth-it-market-detail-modal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="worth-it-market-detail-backdrop" data-market-detail-close></div>

        <div
            class="worth-it-market-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worthItMarketDetailTitle"
        >
            <button
                type="button"
                class="worth-it-market-detail-close"
                aria-label="Close commodity details"
                title="Close"
                data-market-detail-close
            >×</button>

            <div
                class="worth-it-market-detail-body"
                id="worthItMarketDetailBody"
            ></div>
        </div>

        <button
            type="button"
            class="worth-it-market-detail-navigation worth-it-market-detail-navigation-previous"
            data-market-navigation="previous"
            aria-label="Previous commodity — A or ←"
            title="Previous commodity — A or ←"
            hidden
        >
            <span class="worth-it-market-detail-navigation-key">A</span>
            <span class="worth-it-market-detail-navigation-arrow">❮</span>
            <span class="worth-it-market-detail-navigation-key">←</span>
        </button>

        <button
            type="button"
            class="worth-it-market-detail-navigation worth-it-market-detail-navigation-next"
            data-market-navigation="next"
            aria-label="Next commodity — D or →"
            title="Next commodity — D or →"
            hidden
        >
            <span class="worth-it-market-detail-navigation-key">D</span>
            <span class="worth-it-market-detail-navigation-arrow">❯</span>
            <span class="worth-it-market-detail-navigation-key">→</span>
        </button>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll("[data-market-detail-close]").forEach(button => {
        button.addEventListener("click", () => closeMarketDetailModal());
    });

    modal.querySelector('[data-market-navigation="previous"]')?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        navigateMarketDetail("previous");
    });

    modal.querySelector('[data-market-navigation="next"]')?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        navigateMarketDetail("next");
    });

    return modal;
}

function refreshMarketDetailNavigationControls() {
    const modal = document.getElementById("worthItMarketDetailModal");
    if (!modal) return;

    const controls = modal.querySelectorAll("[data-market-navigation]");
    const hasMultiple = marketsDetailNavigationItems.length > 1 &&
        marketsDetailNavigationIndex >= 0;

    controls.forEach(control => {
        control.hidden = !hasMultiple;
    });
}

function getMarketDetailNavigationItems() {
    const grid = document.getElementById("materialsGrid");
    if (!grid) return [];

    return Array.from(
        grid.querySelectorAll('.market-card[data-market-card="true"]')
    )
        .map(card => ({
            item: card._worthItMarketItem || null,
            image: card._worthItMarketImage || null
        }))
        .filter(entry => entry.item);
}

function renderMarketDetail(item, image = null) {
    const modal = createMarketDetailModal();
    const body = modal.querySelector("#worthItMarketDetailBody");
    if (!body) return;

    const config = getMarketConfigFallback(item);
    const displaySpec = getMarketDisplaySpec(item);
    const rawName = cleanMarketDisplayName(config.name);
    const category = item?.category || "other";
    const categoryLabel = item?.category_label || getCategoryMeta(category).label;

    const usdPrice = Number(item?.price);
    const eurPrice =
        Number.isFinite(usdPrice) &&
        Number.isFinite(marketsExchangeRate) &&
        marketsExchangeRate > 0 &&
        Number.isFinite(displaySpec.eurConversion)
            ? usdPrice * marketsExchangeRate * displaySpec.eurConversion
            : null;

    const usdDisplay =
        Number.isFinite(usdPrice)
            ? "$" + formatMarketPrice(usdPrice * displaySpec.usConversion) + " / " + displaySpec.usUnit
            : "—";

    const eurDisplay =
        Number.isFinite(eurPrice)
            ? "€" + formatMarketPrice(eurPrice) + " / " + displaySpec.eurUnit
            : "—";

    const monthlyChange = Number(item?.changes?.monthly?.percent);
    const changeText = formatMarketChange(monthlyChange);
    const changeClass =
        monthlyChange > 0 ? "market-up" :
        monthlyChange < 0 ? "market-down" :
        "market-flat";

    const imageUrl = image?.url || "";
    const imageHtml = imageUrl
        ? `<img class="worth-it-market-detail-image" src="${escapeMarketsHtml(imageUrl)}" alt="${escapeMarketsHtml(rawName)}">`
        : "";

    body.innerHTML = `
        <div class="worth-it-market-detail-header">
            <div>
                <h2 class="worth-it-market-detail-title" id="worthItMarketDetailTitle">
                    ${escapeMarketsHtml(rawName)}
                </h2>
                <span class="worth-it-market-detail-category">
                    ${escapeMarketsHtml(categoryLabel)}
                </span>
            </div>
        </div>

        ${imageHtml}

        <div class="worth-it-market-detail-price-grid">
            <div class="worth-it-market-detail-stat">
                <small>Price in EUR</small>
                <strong>${escapeMarketsHtml(eurDisplay)}</strong>
            </div>
            <div class="worth-it-market-detail-stat">
                <small>Price in USD</small>
                <strong>${escapeMarketsHtml(usdDisplay)}</strong>
            </div>
        </div>

        <div class="worth-it-market-detail-change">
            <small>Monthly change</small>
            <strong class="${changeClass}">
                ${monthlyChange > 0 ? "▲ " : monthlyChange < 0 ? "▼ " : "— "}
                ${escapeMarketsHtml(changeText)}
            </strong>
        </div>

        <div class="worth-it-market-detail-meta">
            <div>
                <span>Latest period</span>
                <strong>${escapeMarketsHtml(formatMarketPeriod(marketsLatestPeriod))}</strong>
            </div>
            <div>
                <span>Commodity code</span>
                <strong>${escapeMarketsHtml(config.symbol || "—")}</strong>
            </div>
            <div>
                <span>EUR unit</span>
                <strong>${escapeMarketsHtml(displaySpec.eurUnit || "—")}</strong>
            </div>
            <div>
                <span>US unit</span>
                <strong>${escapeMarketsHtml(displaySpec.usUnit || "—")}</strong>
            </div>
            <div>
                <span>Category</span>
                <strong>${escapeMarketsHtml(categoryLabel)}</strong>
            </div>
            <div>
                <span>Source</span>
                <strong>World Bank Pink Sheet</strong>
            </div>
        </div>
    `;

    refreshMarketDetailNavigationControls();
}

function openMarketDetailModal(item, image = null) {
    const modal = createMarketDetailModal();
    marketsDetailNavigationItems = getMarketDetailNavigationItems();

    const key = marketsDetailNavigationItems.findIndex(
        entry => entry.item === item
    );

    marketsDetailNavigationIndex =
        key >= 0 ? key : 0;

    renderMarketDetail(item, image);

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("worth-it-market-detail-modal-open");
    refreshMarketDetailNavigationControls();
}

function closeMarketDetailModal() {
    const modal = document.getElementById("worthItMarketDetailModal");
    if (!modal) return;

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("worth-it-market-detail-modal-open");
}

function navigateMarketDetail(direction) {
    if (
        marketsDetailNavigationItems.length < 2 ||
        marketsDetailNavigationIndex < 0
    ) {
        return;
    }

    const offset = direction === "previous" ? -1 : 1;
    const nextIndex =
        (marketsDetailNavigationIndex + offset + marketsDetailNavigationItems.length) %
        marketsDetailNavigationItems.length;

    marketsDetailNavigationIndex = nextIndex;

    const target = marketsDetailNavigationItems[nextIndex];
    if (!target?.item) return;

    renderMarketDetail(target.item, target.image);
}

if (!window.__worthItMarketDetailNavigationBound) {
    window.__worthItMarketDetailNavigationBound = true;

    document.addEventListener("keydown", event => {
        const modal = document.getElementById("worthItMarketDetailModal");
        if (!modal || !modal.classList.contains("is-open")) return;

        const target = event.target;

        if (
            target instanceof HTMLElement &&
            (
                target.isContentEditable ||
                ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
            )
        ) {
            return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const key = String(event.key || "").toLowerCase();

        if (key === "escape") {
            event.preventDefault();
            closeMarketDetailModal();
        } else if (key === "arrowleft" || key === "a") {
            event.preventDefault();
            navigateMarketDetail("previous");
        } else if (key === "arrowright" || key === "d") {
            event.preventDefault();
            navigateMarketDetail("next");
        }
    });
}


/* =========================================================
   CARD
========================================================= */

function renderMarketCard(
    resolved
) {

    const item =
        resolved?.item ||
        {};

    const image =
        resolved?.image ||
        null;

    const imageReason =
        String(
            resolved?.imageReason ||
            ""
        );

    const config =
        getMarketConfigFallback(
            item
        );


    const displaySpec =
        getMarketDisplaySpec(
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


    let formattedEurPrice =
        "—";


    if (
        Number.isFinite(
            usdPrice
        ) &&
        Number.isFinite(
            marketsExchangeRate
        ) &&
        marketsExchangeRate > 0 &&
        Number.isFinite(
            displaySpec.eurConversion
        )
    ) {

        const eurPrice =
            usdPrice *
            marketsExchangeRate *
            displaySpec.eurConversion;


        formattedEurPrice =
            formatMarketPrice(
                eurPrice
            );

    }


    const formattedUsdDisplayPrice =
        Number.isFinite(
            usdPrice
        )
            ? formatMarketPrice(
                usdPrice *
                displaySpec.usConversion
            )
            : "—";


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


    const imageDisplay =
        image
            ? "block"
            : "none";


    const cardHtml = `

        <div
            class="market-card"
            data-market-card="true"
            data-market-name="${name}"
            data-market-category="${category}"
            data-market-wikipedia-title="${name}"
        >

            <div
                class="worth-it-market-image-wrap"
            >

                ${
                    createMarketImagePlaceholder(
                        image
                            ? "Loading image..."
                            : imageReason
                                ? "Image unavailable"
                                : "Loading image...",
                        item.category || "other",
                        imageReason
                    )
                }


                <img
                    class="worth-it-market-image"
                    data-market-name="${name}"
                    data-market-category="${category}"
                    alt="${imageAlt}"
                    aria-hidden="false"
                    data-market-image-reason="${imageReason.replaceAll('"','&quot;')}"
                    style="
                        width:100%;
                        height:100%;
                        object-fit:cover;
                        display:${imageDisplay};
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
                                    displaySpec.eurUnit
                                )
                            }
                        </small>

                    </strong>


                    <strong class="market-price-usd">

                        $${formattedUsdDisplayPrice}

                        <small>
                            /
                            ${
                                escapeMarketsHtml(
                                    displaySpec.usUnit
                                )
                            }
                        </small>

                    </strong>

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

                <div class="worth-it-market-wikipedia"><p class="worth-it-market-wikipedia-description">Loading Wikipedia description…</p><a class="worth-it-market-wikipedia-link" href="#" target="_blank" rel="noopener noreferrer">View on Wikipedia ↗</a></div>

            </div>

        </div>

    `;


    return {

        cardHtml,

        image

    };
}


/* =========================================================
   RENDER
========================================================= */

async function renderMarkets() {

    const grid =
        document.getElementById(
            "materialsGrid"
        );


    if (!grid) {

        return;

    }


    const requestId =
        ++marketsRenderRequestId;


    ensureMarketsCardStyles();


    ensureMarketsToolbar(
        grid
    );


    renderMarketCategoryButtons();


    const filtered =
        getFilteredMarkets();


    updateMarketsCount(
        filtered.length,
        marketsData.length,
        true
    );


    marketsImageQueue.length =
        0;


    if (marketsImageObserver) {

        marketsImageObserver.disconnect();

        marketsImageObserver =
            null;

    }


    if (!filtered.length) {

        updateMarketsCount(
            0,
            marketsData.length
        );


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
     * Keep ALL filtered commodities.
     *
     * The image field is optional and starts as null.
     * Wikimedia images are loaded lazily afterwards by the
     * existing IntersectionObserver / queue system.
     */
    const resolved =
        await resolveMarketsWithValidImages(
            filtered,
            requestId
        );


    if (
        requestId !==
            marketsRenderRequestId ||
        !resolved
    ) {

        return;

    }


    updateMarketsCount(
        resolved.length,
        marketsData.length
    );


    if (!resolved.length) {

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


    const rendered =
        resolved.map(
            renderMarketCard
        );


    grid.innerHTML =
        rendered
            .map(
                item =>
                    item.cardHtml
            )
            .join("");

    const marketCards =
        grid.querySelectorAll(
            '.market-card[data-market-card="true"]'
        );

    marketCards.forEach(
        (card, index) => {
            card._worthItMarketItem =
                resolved[index]?.item || null;

            card._worthItMarketImage =
                rendered[index]?.image || null;
        }
    );


    /*
     * Attach any already-available image object directly to the
     * image element. Normally images are loaded lazily and start
     * with null here.
     */
    const images =
        grid.querySelectorAll(
            ".worth-it-market-image"
        );


    images.forEach(
        (imageElement, index) => {

            imageElement.__marketImageData =
                rendered[index]?.image ||
                null;

        }
    );


    initialiseMarketImageObserver();
    initialiseMarketWikipediaObserver();
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


    marketsRenderRequestId +=
        1;


    marketsImageQueue.length =
        0;


    if (marketsImageObserver) {

        marketsImageObserver.disconnect();

        marketsImageObserver =
            null;

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

        /*
         * Restore the signed-in user's validated image decisions
         * before filtering/rendering. Known image results are
         * therefore reused by category/search filters.
         */
        await loadMarketAccountImageCache();

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


        marketsLatestPeriod =
            String(data?.data?.latest_period || "");

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


        await renderMarkets();


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

        const marketsGrid =
            document.getElementById("materialsGrid");

        if (marketsGrid && !marketsGrid.__worthItMarketDetailBound) {
            marketsGrid.__worthItMarketDetailBound = true;

            marketsGrid.addEventListener("click", event => {
                const card = event.target.closest(
                    '.market-card[data-market-card="true"]'
                );

                if (!card || !marketsGrid.contains(card)) return;

                if (event.target.closest("a, button, input, select, textarea")) {
                    return;
                }

                const item = card._worthItMarketItem;
                if (!item) return;

                event.preventDefault();

                openMarketDetailModal(
                    item,
                    card._worthItMarketImage || null
                );
            });
        }


        window.addEventListener(
            "scroll",
            updateMarketsGoBackUpButton,
            { passive:true }
        );

        window.addEventListener(
            "resize",
            updateMarketsGoBackUpButton,
            { passive:true }
        );

        window.addEventListener(
            "worthitsettingschange",
            updateMarketsGoBackUpButton
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
