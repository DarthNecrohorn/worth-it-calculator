/* =========================================================
   NEWS QUALITY + TITLE CLEANUP
========================================================= */

function isLowQualityNewsArticle(article) {
    const title = String(article?.title || "").trim();
    const description = String(article?.description || "").trim();
    const text = `${title} ${description}`.toLowerCase();

    if (!title) return true;

    const junkTitlePatterns = [
        /^environmental-management-[a-z0-9-]+$/i,
        /^french-irish-[a-z0-9-]+$/i,
        /^english-[a-z-]+-[a-z0-9]+$/i,
        /^politics-philosophy-economics-[a-z0-9-]+$/i,
        /^accounting-major-[a-z0-9-]+$/i,
        /^social-policy-sociology-[a-z0-9-]+$/i,
        /^law-senior-status-[a-z0-9-]+$/i,
        /^international-business-major-[a-z0-9-]+$/i,
        /^daily buzz:/i,
        /^commission some research$/i,
        /^pacnews one,/i
    ];

    if (junkTitlePatterns.some(pattern => pattern.test(title))) {
        return true;
    }

    if (/\bshort interest\b/i.test(text)) return true;
    if (/\binsider selling\b/i.test(text)) return true;
    if (/\bpatch \d+(?:\.\d+)* .*ptr\b/i.test(title)) return true;
    if (/\bat no reserve\b/i.test(title)) return true;
    if (/\bno reserve\b/i.test(title) && /\b\d{4}\b/.test(title)) return true;

    return false;
}

function cleanNewsTitle(title) {
    let value = String(title || "")
        .replace(/\s+/g, " ")
        .trim();

    if (!value) return "Untitled story";

    const letters = value.replace(/[^A-Za-z]/g, "");
    if (
        letters.length >= 12 &&
        letters === letters.toUpperCase() &&
        letters !== letters.toLowerCase()
    ) {
        value = value
            .toLowerCase()
            .replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix, letter) =>
                prefix + letter.toUpperCase()
            );
    }

    const MAX_LENGTH = 120;

    if (value.length <= MAX_LENGTH) {
        return value;
    }

    const shortened = value.slice(0, MAX_LENGTH);

    const punctuationCut = Math.max(
        shortened.lastIndexOf(". "),
        shortened.lastIndexOf(" — "),
        shortened.lastIndexOf(" – "),
        shortened.lastIndexOf(": "),
        shortened.lastIndexOf(" - ")
    );

    if (punctuationCut >= 55) {
        return shortened.slice(0, punctuationCut).trim();
    }

    const wordCut = shortened.lastIndexOf(" ");
    return (wordCut >= 70 ? shortened.slice(0, wordCut) : shortened).trim() + "…";
}

/* =========================================================
   NEWS CATEGORY RENDER
========================================================= */

function renderNewsCategory(
    container,
    articles,
    limit = null
) {

    if (!container) return;


    if (!Array.isArray(articles) || !articles.length) {

        container.innerHTML = `
            <div class="news-loading">
                No stories available.
            </div>
        `;

        return;
    }


    /*
     * All News = no limit.
     * Individual categories = maximum 12.
     */

    const visibleArticles =
        limit === null
            ? articles
            : articles.slice(0, limit);


    const category =
        container.closest(".news-category");


    if (category) {

        const count =
            category.querySelector(
                ".news-category-header span"
            );


        if (count) {

            count.textContent =
                `${visibleArticles.length} stories`;

        }

    }


    container.innerHTML = "";


    visibleArticles.forEach(article => {

        const card =
            document.createElement("article");


        card.className =
            "news-card";


        const articleUrl =
            String(
                article?.url || ""
            ).trim();


        card.dataset.newsUrl =
            articleUrl;

        const image =
            isUsableDirectNewsImage(
                article?.image
            )
                ? `
                    <img
                        class="news-card-image"
                        src="${escapeNewsHtml(article.image)}"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerpolicy="no-referrer"
                        onerror="this.outerHTML='<div class=&quot;news-card-image news-card-placeholder news-image-pending&quot; data-news-image-state=&quot;pending&quot;>📰</div>'"
                    >
                `
                : `
                    <div
                        class="news-card-image news-card-placeholder news-image-pending"
                        data-news-image-state="pending"
                    >
                        📰
                    </div>
                `;


        const source =
            article.source ||
            "Unknown source";


        const title =
            cleanNewsTitle(article.title);


        const description =
            article.description ||
            "";


        const time =
            article.publishedAt
                ? formatNewsTime(article.publishedAt)
                : "";


        card.innerHTML = `

            <a
                href="${escapeNewsHtml(article.url || "#")}"
                target="_blank"
                rel="noopener noreferrer"
            >

                ${image}

                <div class="news-card-source">
                    ${escapeNewsHtml(source)}
                </div>

                <div class="news-card-title">
                    ${escapeNewsHtml(title)}
                </div>

                <div class="news-card-description">
                    ${escapeNewsHtml(description)}
                </div>

                <div class="news-card-time">
                    ${escapeNewsHtml(time)}
                </div>

            </a>

        `;


        container.appendChild(card);

    });

}


/* =========================================================
   NEWS IMAGE RESOLVER
========================================================= */

const NEWS_OPENVERSE_ENDPOINT =
    "https://api.openverse.org/v1/images/";

const NEWS_IMAGE_CACHE_KEY =
    "worth-it-news-images-v1";

const NEWS_IMAGE_MAX_CONCURRENT =
    3;

const NEWS_IMAGE_MIN_WIDTH =
    640;

const NEWS_IMAGE_MIN_HEIGHT =
    360;

const NEWS_IMAGE_ALLOWED_LICENSES =
    new Set([
        "by",
        "by-sa",
        "by-nd",
        "cc0",
        "pdm"
    ]);

const NEWS_IMAGE_CATEGORY_QUERIES = {
    world:
        "world news current events",

    technology:
        "technology innovation computer",

    business:
        "business economy finance",

    science:
        "science research discovery",

    sports:
        "sports competition athlete",

    crime:
        "crime police investigation court",

    entertainment:
        "entertainment film music television",

    culture:
        "art culture museum heritage",

    health:
        "health medicine healthcare",

    environment:
        "environment nature conservation",

    food:
        "food restaurant cooking",

    education:
        "education school university"
};

const newsImageMemoryCache =
    new Map();

const newsImageInFlight =
    new Map();

const newsImageQueue =
    [];

let newsImageActiveRequests =
    0;

const newsImageUsedUrls =
    new Set();

let newsImageLocalStorageLoaded =
    false;


function isUsableDirectNewsImage(
    value
) {

    const url =
        String(
            value || ""
        ).trim();

    return (
        /^https:\/\//i.test(url) &&
        !/^data:/i.test(url) &&
        !/^blob:/i.test(url)
    );

}


function normalizeNewsImageLicense(
    value
) {

    return String(
        value || ""
    )
        .trim()
        .toLowerCase()
        .replace(
            /\s+/g,
            "-"
        )
        .replace(
            /-\d+(?:\.\d+)?$/,
            ""
        );

}


function isGoodOpenverseImage(
    item
) {

    if (!item) {
        return false;
    }

    if (
        item.watermarked === true ||
        item.mature === true ||
        item.sensitive_image === true
    ) {
        return false;
    }

    const license =
        normalizeNewsImageLicense(
            item.license
        );

    if (
        !NEWS_IMAGE_ALLOWED_LICENSES.has(
            license
        )
    ) {
        return false;
    }

    const width =
        Number(
            item.width || 0
        );

    const height =
        Number(
            item.height || 0
        );

    if (
        width > 0 &&
        height > 0
    ) {

        if (
            width < NEWS_IMAGE_MIN_WIDTH ||
            height < NEWS_IMAGE_MIN_HEIGHT
        ) {
            return false;
        }

        const ratio =
            width / height;

        if (
            ratio < 0.75 ||
            ratio > 2.25
        ) {
            return false;
        }

    }

    const imageUrl =
        String(
            item.thumbnail ||
            item.url ||
            ""
        ).trim();

    if (
        !/^https:\/\//i.test(
            imageUrl
        )
    ) {
        return false;
    }

    const title =
        String(
            item.title || ""
        ).toLowerCase();

    if (
        /\b(logo|icon|screenshot|watermark|banner ad|advertisement)\b/.test(
            title
        )
    ) {
        return false;
    }

    return true;

}


function getNewsImageQuery(
    article,
    category
) {

    const title =
        String(
            article?.title || ""
        )
            .replace(
                /[^a-z0-9\s-]/gi,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    const categoryQuery =
        NEWS_IMAGE_CATEGORY_QUERIES[
            category
        ] ||
        "news current events";

    return (
        title.slice(
            0,
            140
        ) ||
        categoryQuery
    );

}


function readNewsImageCache() {

    if (
        newsImageLocalStorageLoaded
    ) {
        return;
    }

    newsImageLocalStorageLoaded =
        true;

    try {

        const raw =
            localStorage.getItem(
                NEWS_IMAGE_CACHE_KEY
            );

        if (!raw) {
            return;
        }

        const parsed =
            JSON.parse(raw);

        if (
            !parsed ||
            typeof parsed !== "object"
        ) {
            return;
        }

        Object.entries(
            parsed
        ).forEach(
            ([key, value]) => {

                if (
                    value &&
                    Array.isArray(
                        value.images
                    )
                ) {

                    newsImageMemoryCache.set(
                        key,
                        value
                    );

                }

            }
        );

    } catch (error) {

        console.debug(
            "News image cache read skipped:",
            error
        );

    }

}


function writeNewsImageCache() {

    try {

        const entries =
            [...newsImageMemoryCache.entries()]
                .slice(
                    -250
                );

        localStorage.setItem(
            NEWS_IMAGE_CACHE_KEY,
            JSON.stringify(
                Object.fromEntries(
                    entries
                )
            )
        );

    } catch (error) {

        console.debug(
            "News image cache write skipped:",
            error
        );

    }

}


async function searchOpenverseImages(
    query
) {

    const url =
        new URL(
            NEWS_OPENVERSE_ENDPOINT
        );

    url.searchParams.set(
        "q",
        query
    );

    url.searchParams.set(
        "page_size",
        "10"
    );

    url.searchParams.set(
        "mature",
        "false"
    );

    const response =
        await fetch(
            url.toString(),
            {
                headers: {
                    "Accept":
                        "application/json"
                },
                referrerPolicy:
                    "no-referrer"
            }
        );

    if (!response.ok) {
        throw new Error(
            `Openverse image search failed: ${response.status}`
        );
    }

    const data =
        await response.json();

    return (
        Array.isArray(
            data?.results
        )
            ? data.results
            : []
    )
        .filter(
            isGoodOpenverseImage
        )
        .map(
            item => ({
                url:
                    String(
                        item.thumbnail ||
                        item.url ||
                        ""
                    ).trim(),

                title:
                    String(
                        item.title ||
                        ""
                    ).trim(),

                creator:
                    String(
                        item.creator ||
                        ""
                    ).trim(),

                license:
                    String(
                        item.license ||
                        ""
                    ).trim(),

                licenseUrl:
                    String(
                        item.license_url ||
                        item.license_url ||
                        ""
                    ).trim(),

                landingUrl:
                    String(
                        item.foreign_landing_url ||
                        ""
                    ).trim(),

                width:
                    Number(
                        item.width ||
                        0
                    ),

                height:
                    Number(
                        item.height ||
                        0
                    )
            })
        );

}


async function getOpenverseImages(
    query
) {

    readNewsImageCache();

    const cacheKey =
        `search:${query.toLowerCase()}`;

    if (
        newsImageMemoryCache.has(
            cacheKey
        )
    ) {

        return (
            newsImageMemoryCache.get(
                cacheKey
            )?.images ||
            []
        );

    }

    if (
        newsImageInFlight.has(
            cacheKey
        )
    ) {

        return newsImageInFlight.get(
            cacheKey
        );

    }

    const promise =
        searchOpenverseImages(
            query
        )
            .then(
                images => {

                    newsImageMemoryCache.set(
                        cacheKey,
                        {
                            images,
                            savedAt:
                                Date.now()
                        }
                    );

                    writeNewsImageCache();

                    return images;

                }
            )
            .catch(
                error => {

                    newsImageMemoryCache.set(
                        cacheKey,
                        {
                            images: [],
                            savedAt:
                                Date.now()
                        }
                    );

                    writeNewsImageCache();

                    throw error;

                }
            )
            .finally(
                () => {

                    newsImageInFlight.delete(
                        cacheKey
                    );

                }
            );

    newsImageInFlight.set(
        cacheKey,
        promise
    );

    return promise;

}


function pickUnusedNewsImage(
    images
) {

    if (
        !Array.isArray(images) ||
        !images.length
    ) {
        return null;
    }

    return (
        images.find(
            image =>
                image?.url &&
                !newsImageUsedUrls.has(
                    image.url
                )
        ) ||
        images[0] ||
        null
    );

}


function imageCreditText(
    image
) {

    const creator =
        String(
            image?.creator || ""
        ).trim();

    const license =
        String(
            image?.license || ""
        ).trim();

    if (
        creator &&
        license
    ) {
        return `Openverse · ${creator} · ${license}`;
    }

    if (license) {
        return `Openverse · ${license}`;
    }

    return "Openverse";
}


function applyNewsImageToCard(
    card,
    image
) {

    const imageBox =
        card?.querySelector(
            '[data-news-image-state="pending"]'
        );

    if (
        !imageBox ||
        !image?.url
    ) {
        return;
    }

    newsImageUsedUrls.add(
        image.url
    );

    const alt =
        image.title ||
        "Related news image";

    imageBox.classList.remove(
        "news-card-placeholder",
        "news-image-pending"
    );

    imageBox.classList.add(
        "news-card-image-loaded"
    );

    imageBox.removeAttribute(
        "data-news-image-state"
    );

    imageBox.innerHTML = `
        <img
            class="news-card-image-inner"
            src="${escapeNewsHtml(image.url)}"
            alt="${escapeNewsHtml(alt)}"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
        >
        <span
            class="news-card-image-credit"
            title="${escapeNewsHtml(imageCreditText(image))}"
        >
            ${escapeNewsHtml(imageCreditText(image))}
        </span>
    `;

    const imageElement =
        imageBox.querySelector(
            ".news-card-image-inner"
        );

    if (
        imageElement
    ) {

        imageElement.addEventListener(
            "error",
            () => {

                imageBox.classList.remove(
                    "news-card-image-loaded"
                );

                imageBox.classList.add(
                    "news-card-placeholder"
                );

                imageBox.innerHTML =
                    "📰";

                imageBox.dataset.newsImageState =
                    "failed";

            },
            {
                once: true
            }
        );

    }

}


async function resolveNewsImage(
    article,
    category
) {

    const articleKey =
        String(
            article?.url || ""
        )
            .trim()
            .toLowerCase();

    if (!articleKey) {
        return null;
    }

    readNewsImageCache();

    const cacheKey =
        `article:${articleKey}`;

    if (
        newsImageMemoryCache.has(
            cacheKey
        )
    ) {

        return pickUnusedNewsImage(
            newsImageMemoryCache.get(
                cacheKey
            )?.images || []
        );

    }

    try {

        const images =
            await getOpenverseImages(
                getNewsImageQuery(
                    article,
                    category
                )
            );

        if (images.length) {

            newsImageMemoryCache.set(
                cacheKey,
                {
                    images,
                    savedAt:
                        Date.now()
                }
            );

            writeNewsImageCache();

            const selected =
                pickUnusedNewsImage(
                    images
                );

            if (selected) {
                return selected;
            }

        }

    } catch (error) {

        console.debug(
            "Openverse article image skipped:",
            error
        );

    }

    /*
     * One topic-level fallback per category. It is intentionally
     * separate from the article search so the UI still has a visual
     * even when a very specific story has no suitable open image.
     */
    try {

        const fallbackImages =
            await getOpenverseImages(
                NEWS_IMAGE_CATEGORY_QUERIES[
                    category
                ] ||
                "news current events"
            );

        return pickUnusedNewsImage(
            fallbackImages
        );

    } catch (error) {

        console.debug(
            "Openverse topic image skipped:",
            error
        );

        return null;

    }

}


async function hydrateOneNewsImage(
    card,
    article,
    category
) {

    const image =
        await resolveNewsImage(
            article,
            category
        );

    if (
        image
    ) {

        applyNewsImageToCard(
            card,
            image
        );

    } else {

        const imageBox =
            card?.querySelector(
                '[data-news-image-state="pending"]'
            );

        if (imageBox) {

            imageBox.dataset.newsImageState =
                "failed";

        }

    }

}


function processNewsImageQueue() {

    while (
        newsImageActiveRequests <
            NEWS_IMAGE_MAX_CONCURRENT &&
        newsImageQueue.length
    ) {

        const task =
            newsImageQueue.shift();

        newsImageActiveRequests++;

        hydrateOneNewsImage(
            task.card,
            task.article,
            task.category
        )
            .catch(
                error => {

                    console.debug(
                        "News image hydration skipped:",
                        error
                    );

                }
            )
            .finally(
                () => {

                    newsImageActiveRequests--;

                    processNewsImageQueue();

                }
            );

    }

}


function queueNewsImage(
    card,
    article,
    category
) {

    if (
        !card ||
        !article
    ) {
        return;
    }

    const pending =
        card.querySelector(
            '[data-news-image-state="pending"]'
        );

    if (!pending) {
        return;
    }

    newsImageQueue.push({
        card,
        article,
        category
    });

    processNewsImageQueue();

}


function hydrateNewsImages(
    articles,
    category
) {

    if (
        !Array.isArray(articles) ||
        !articles.length
    ) {
        return;
    }

    const cards =
        [
            ...document.querySelectorAll(
                ".news-card[data-news-url]"
            )
        ];

    const byUrl =
        new Map(
            articles.map(
                article => [
                    String(
                        article?.url || ""
                    )
                        .trim()
                        .toLowerCase(),
                    article
                ]
            )
        );

    const loadCard =
        card => {

            const url =
                String(
                    card.dataset.newsUrl || ""
                )
                    .trim()
                    .toLowerCase();

            const article =
                byUrl.get(
                    url
                );

            if (
                article
            ) {

                queueNewsImage(
                    card,
                    article,
                    category
                );

            }

        };

    if (
        "IntersectionObserver" in window
    ) {

        const observer =
            new IntersectionObserver(
                entries => {

                    entries.forEach(
                        entry => {

                            if (
                                !entry.isIntersecting
                            ) {
                                return;
                            }

                            observer.unobserve(
                                entry.target
                            );

                            loadCard(
                                entry.target
                            );

                        }
                    );

                },
                {
                    rootMargin:
                        "700px 0px"
                }
            );

        cards.forEach(
            loadCardObserver => {

                if (
                    loadCardObserver.querySelector(
                        '[data-news-image-state="pending"]'
                    )
                ) {

                    observer.observe(
                        loadCardObserver
                    );

                }

            }
        );

    } else {

        cards
            .slice(
                0,
                12
            )
            .forEach(
                loadCard
            );

    }

}


/* =========================================================
   NEWS HTML ESCAPE
========================================================= */


/* =========================================================
   NEWS HTML ESCAPE
========================================================= */

function escapeNewsHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   NEWS TIME FORMAT
========================================================= */

function formatNewsTime(date) {

    const time =
        new Date(date);


    if (Number.isNaN(time.getTime())) {
        return "";
    }


    return time.toLocaleString(
        "en-US",
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );

}


/* =========================================================
   NEWS DATA
========================================================= */

let newsData = {};


/*
 * Prevent duplicate category event listeners
 * when News is opened multiple times.
 */

let newsCategoryButtonsInitialized =
    false;


/* =========================================================
   NEWS CATEGORY LABELS
========================================================= */

const NEWS_CATEGORY_LABELS = {

    all:
        "📰 All News",

    world:
        "🌍 World",

    technology:
        "💻 Technology",

    business:
        "💼 Business",

    science:
        "🔬 Science",

    weird:
        "🤯 Weird",

    awesome:
        "✨ Awesome",

    underrated:
        "💎 Underrated",

    sports:
        "🏆 Sports",

    gaming:
        "🎮 Gaming",

    crime:
        "🕵️ Crime",

    entertainment:
        "🎬 Entertainment",

    culture:
        "🎨 Culture",

    health:
        "❤️ Health",

    environment:
        "🌱 Environment",

    food:
        "🍽️ Food",

    education:
        "🎓 Education"

};


/* =========================================================
   REMOVE DUPLICATE NEWS
========================================================= */

function removeNewsDuplicates(
    articles
) {

    const seenUrls =
        new Set();


    const seenTitles =
        new Set();


    return articles.filter(article => {

        const url =
            String(article?.url || "")
                .trim()
                .toLowerCase();


        const title =
            String(article?.title || "")
                .trim()
                .toLowerCase();


        /*
         * Remove duplicate URL.
         */

        if (
            url &&
            seenUrls.has(url)
        ) {

            return false;

        }


        /*
         * Remove exact duplicate title.
         */

        if (
            title &&
            seenTitles.has(title)
        ) {

            return false;

        }


        if (url) {

            seenUrls.add(url);

        }


        if (title) {

            seenTitles.add(title);

        }


        return true;

    });

}


/* =========================================================
   RENDER SELECTED NEWS CATEGORY
========================================================= */

function showNewsCategory(
    categoryName
) {

    const grid =
        document.getElementById(
            "newsGrid"
        );


    const title =
        document.getElementById(
            "newsCategoryTitle"
        );


    const count =
        document.getElementById(
            "newsCategoryCount"
        );


    if (!grid) return;


    let articles = [];


    /* =====================================================
       ALL NEWS
    ===================================================== */

    if (
        categoryName === "all"
    ) {

        Object.values(newsData)
            .forEach(categoryArticles => {

                if (
                    Array.isArray(
                        categoryArticles
                    )
                ) {

                    articles.push(
                        ...categoryArticles
                    );

                }

            });


        /*
         * All News:
         * remove duplicates,
         * but DO NOT limit to 12.
         */

        articles =
            removeNewsDuplicates(
                articles
            );

    }


    /* =====================================================
       INDIVIDUAL CATEGORY
    ===================================================== */

    else {

        articles =
            Array.isArray(
                newsData[categoryName]
            )
                ? newsData[categoryName]
                : [];


        /*
         * Individual category:
         * maximum 12 stories.
         */

        articles =
            removeNewsDuplicates(
                articles
            )
            .slice(0, 12);

    }


    /* =====================================================
       NEWS QUALITY FILTER
    ===================================================== */

    articles = articles.filter(
        article => !isLowQualityNewsArticle(article)
    );

    if (categoryName !== "all") {
        articles = articles.slice(0, 12);
    }


    /* =====================================================
       CATEGORY TITLE
    ===================================================== */

    if (title) {

        title.textContent =
            NEWS_CATEGORY_LABELS[
                categoryName
            ] ||
            "📰 News";

    }


    /* =====================================================
       CATEGORY COUNT
    ===================================================== */

    if (count) {

        count.textContent =
            `${articles.length} stories`;

    }


    /* =====================================================
       RENDER
    ===================================================== */

    renderNewsCategory(
        grid,
        articles,
        categoryName === "all"
            ? null
            : 12
    );

    hydrateNewsImages(
        articles,
        categoryName
    );


    /* =====================================================
       ACTIVE BUTTON
    ===================================================== */

    document
        .querySelectorAll(
            ".news-category-btn"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.newsCategory ===
                    categoryName
            );

        });

}


/* =========================================================
   NEWS CATEGORY BUTTONS
========================================================= */

function initNewsCategoryButtons() {

    if (
        newsCategoryButtonsInitialized
    ) {

        return;

    }


    const buttons =
        document.querySelectorAll(
            ".news-category-btn"
        );


    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const category =
                    button.dataset.newsCategory;


                if (!category) {
                    return;
                }


                showNewsCategory(
                    category
                );

            }
        );

    });


    newsCategoryButtonsInitialized =
        true;

}


/* =========================================================
   LOAD NEWS
========================================================= */

async function loadNews() {

    const grid =
        document.getElementById(
            "newsGrid"
        );


    if (!grid) return;


    grid.innerHTML = `
        <div class="news-loading">
            Loading news...
        </div>
    `;


    try {

        const response =
            await fetch(
                "/api/news"
            );


        if (!response.ok) {

            throw new Error(
                `News API error: ${response.status}`
            );

        }


        const data =
            await response.json();


        newsData =
            data || {};


        /*
         * Show All News by default.
         */

        showNewsCategory(
            "all"
        );


    } catch (error) {

        console.error(
            "Failed to load news:",
            error
        );


        grid.innerHTML = `
            <div class="news-loading">
                Failed to load news.
            </div>
        `;


        const count =
            document.getElementById(
                "newsCategoryCount"
            );


        if (count) {

            count.textContent =
                "";

        }

    }

}


/* =========================================================
   NEWS
========================================================= */

    document.documentElement.classList.remove("settings-open");

function openNews() {

    if(typeof window.hideShipTrackingSection === "function"){
        window.hideShipTrackingSection();
    }

    if (typeof window.hideWaterLevelsSection === "function") {
        window.hideWaterLevelsSection();
    }

    if (typeof window.hideCarsNavigationUi === "function") {
        window.hideCarsNavigationUi();
    } else {
        const carsSection =
            document.getElementById("carsSection");

        if (carsSection) {
            carsSection.style.display = "none";
        }
    }

    $("homePage").style.display =
        "none";


    const discountsSection =
        document.getElementById(
            "discountsSection"
        );


    if (discountsSection) {

        discountsSection.style.display =
            "none";

    }


    const cryptoSection =
        document.getElementById("cryptoSection");

    if (cryptoSection) {
        cryptoSection.style.display = "none";
    }

    const marketsSection =
        document.getElementById(
            "marketsSection"
        );


    if (marketsSection) {

        marketsSection.style.display =
            "none";

    }


    const moneySection =
        document.getElementById(
            "moneySection"
        );


    if (moneySection) {

        moneySection.style.display =
            "none";

    }


    document
        .querySelectorAll(".app")
        .forEach(x => {

            x.classList.remove(
                "active"
            );

            x.style.display =
                "none";

        });


    $("weatherSection").style.display =
        "none";


    const settingsPanel =
        $("settingsPanel");


    if (settingsPanel) {

        settingsPanel.style.display =
            "none";

    }


    $("newsSection").style.display =
        "block";


    const navLinks = $("navLinks");
    if(typeof closeNavMenuUnlessPreserved === "function"){
        closeNavMenuUnlessPreserved(navLinks);
    }


    document.documentElement.style.overflowY =
        "auto";

    document.body.style.overflowY =
        "auto";


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });


    initNewsCategoryButtons();

    loadNews();

}
