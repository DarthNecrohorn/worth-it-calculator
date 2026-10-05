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

        const imageDecision =
            article?.newsImage &&
            typeof article.newsImage === "object"
                ? article.newsImage
                : null;

        const image =
            imageDecision?.status === "allowed" &&
            isUsableDirectNewsImage(
                imageDecision.image
            )
                ? 
                    '<div class="news-card-image-loaded">' +
                        '<img class="news-card-image-inner" src="' +
                            escapeNewsHtml(
                                imageDecision.image
                            ) +
                            '" alt="' +
                            escapeNewsHtml(
                                imageDecision.alt ||
                                article.title ||
                                "News image"
                            ) +
                            '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' +
                        '<span class="news-card-image-credit" title="' +
                            escapeNewsHtml(
                                imageDecision.license ||
                                "Commercially permitted source image"
                            ) +
                            '">Source · ' +
                            escapeNewsHtml(
                                imageDecision.license ||
                                "Commercially permitted"
                            ) +
                        '</span>' +
                    '</div>'
                : newsImagePlaceholderHtml(
                    imageDecision
                );


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

        bindNewsImageError(
            card,
            article
        );

    });

}


/* =========================================================
   NEWS IMAGE RESOLVER
========================================================= */

const NEWS_IMAGE_BATCH_ENDPOINT =
    "/api/news-images";

const NEWS_IMAGE_BATCH_SIZE =
    12;

const NEWS_IMAGE_REQUEST_CONCURRENCY =
    4;

const newsImageRequestsInFlight =
    new Set();

const newsImageUsedUrls =
    new Set();

const newsImageReservedKeys =
    new Set();

function isUsableDirectNewsImage(
    value
) {
    return /^https:\/\//i.test(
        String(value || "").trim()
    );
}

function getNewsImageUsageKey(
    imageUrl
) {
    return String(
        imageUrl || ""
    )
        .trim()
        .toLowerCase();
}

function resetNewsImageUsage() {
    newsImageUsedUrls.clear();
    newsImageReservedKeys.clear();

    Object.values(
        newsData || {}
    ).forEach(
        categoryArticles => {

            if (!Array.isArray(categoryArticles)) {
                return;
            }

            categoryArticles.forEach(
                article => {

                    const image =
                        article?.newsImage;

                    if (
                        image?.status === "allowed" &&
                        isUsableDirectNewsImage(
                            image.image
                        )
                    ) {

                        newsImageUsedUrls.add(
                            image.image
                        );

                        newsImageReservedKeys.add(
                            getNewsImageUsageKey(
                                image.image
                            )
                        );

                    }

                }
            );

        }
    );
}

function newsImagePlaceholderHtml(
    decision
) {
    const reason =
        decision?.reason ||
        "Checking the source image and commercial-use license…";

    return (
        '<div class="news-card-image news-card-placeholder news-image-status"' +
        ' data-news-image-state="' +
        escapeNewsHtml(
            decision?.status ||
            "pending"
        ) +
        '">' +
        '<span class="news-card-image-emoji">📰</span>' +
        '<span class="news-card-image-reason">' +
        escapeNewsHtml(reason) +
        '</span>' +
        '</div>'
    );
}

function bindNewsImageError(
    card,
    article
) {
    const image =
        card?.querySelector(
            ".news-card-image-inner"
        );

    if (!image) {
        return;
    }

    image.addEventListener(
        "error",
        () => {

            const decision = {
                status:
                    "unavailable",
                image: "",
                reason:
                    "The licensed source image could not be loaded from the publisher website."
            };

            if (article) {
                article.newsImage =
                    decision;
            }

            const imageBox =
                card.querySelector(
                    ".news-card-image-loaded"
                );

            if (imageBox) {
                imageBox.outerHTML =
                    newsImagePlaceholderHtml(
                        decision
                    );
            }

            writeNewsFeedSnapshot(
                newsFeedAccountScope,
                newsData?.__meta?.generatedAt
            );

        },
        {
            once: true
        }
    );
}


function applyNewsImageDecisionToCard(
    card,
    article,
    decision
) {
    if (!card) {
        return;
    }

    const imageBox =
        card.querySelector(
            '[data-news-image-state]'
        );

    if (!imageBox) {
        return;
    }

    const image =
        String(
            decision?.image || ""
        ).trim();

    if (
        decision?.status === "allowed" &&
        isUsableDirectNewsImage(image)
    ) {

        const imageKey =
            getNewsImageUsageKey(
                image
            );

        if (
            newsImageReservedKeys.has(
                imageKey
            )
        ) {

            const duplicateDecision = {
                status:
                    "blocked",
                image: "",
                reason:
                    "The same source image is already used by another News card in this update."
            };

            article.newsImage =
                duplicateDecision;

            imageBox.outerHTML =
                newsImagePlaceholderHtml(
                    duplicateDecision
                );


        bindNewsImageError(
            card,
            article
        );

            return;

        }

        newsImageUsedUrls.add(
            image
        );

        newsImageReservedKeys.add(
            imageKey
        );

        article.newsImage = {
            ...decision,
            image
        };

        imageBox.outerHTML =
            '<div class="news-card-image-loaded">' +
                '<img ' +
                    'class="news-card-image-inner" ' +
                    'src="' +
                        escapeNewsHtml(image) +
                    '" ' +
                    'alt="' +
                        escapeNewsHtml(
                            article?.title ||
                            "News image"
                        ) +
                    '" ' +
                    'loading="lazy" ' +
                    'decoding="async" ' +
                    'referrerpolicy="no-referrer"' +
                '>' +
                '<span ' +
                    'class="news-card-image-credit" ' +
                    'title="' +
                        escapeNewsHtml(
                            decision?.license ||
                            "Commercially permitted source image"
                        ) +
                    '"' +
                '>' +
                    'Source · ' +
                    escapeNewsHtml(
                        decision?.license ||
                        "Commercially permitted"
                    ) +
                '</span>' +
            '</div>';

        return;
    }

    article.newsImage = {
        ...decision
    };

    imageBox.outerHTML =
        newsImagePlaceholderHtml(
            decision
        );
}

async function requestNewsSourceImages(
    articles
) {
    const urls =
        [
            ...new Set(
                (
                    Array.isArray(articles)
                        ? articles
                        : []
                )
                    .map(
                        article =>
                            String(
                                article?.url || ""
                            ).trim()
                    )
                    .filter(Boolean)
            )
        ].slice(
            0,
            NEWS_IMAGE_BATCH_SIZE
        );

    const pendingUrls =
        urls.filter(
            url =>
                !newsImageRequestsInFlight.has(
                    url.toLowerCase()
                )
        );

    if (!pendingUrls.length) {
        return;
    }

    pendingUrls.forEach(
        url =>
            newsImageRequestsInFlight.add(
                url.toLowerCase()
            )
    );

    try {

        const response =
            await fetch(
                NEWS_IMAGE_BATCH_ENDPOINT,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                        "Accept":
                            "application/json"
                    },
                    body:
                        JSON.stringify({
                            articles:
                                pendingUrls.map(
                                    url => ({
                                        url
                                    })
                                )
                        })
                }
            );

        if (!response.ok) {
            throw new Error(
                "News image resolver error: " +
                response.status
            );
        }

        const payload =
            await response.json();

        const results =
            payload?.results || {};

        const cards =
            new Map();

        document
            .querySelectorAll(
                ".news-card[data-news-url]"
            )
            .forEach(
                card => {

                    const url =
                        String(
                            card.dataset.newsUrl ||
                            ""
                        )
                            .trim()
                            .toLowerCase();

                    if (url) {
                        cards.set(
                            url,
                            card
                        );
                    }

                }
            );

        const articleMap =
            new Map();

        Object.values(
            newsData || {}
        ).forEach(
            categoryArticles => {

                if (!Array.isArray(categoryArticles)) {
                    return;
                }

                categoryArticles.forEach(
                    article => {

                        const url =
                            String(
                                article?.url || ""
                            )
                                .trim()
                                .toLowerCase();

                        if (url) {
                            articleMap.set(
                                url,
                                article
                            );
                        }

                    }
                );

            }
        );

        Object.entries(
            results
        ).forEach(
            ([url, decision]) => {

                const key =
                    String(url)
                        .trim()
                        .toLowerCase();

                const article =
                    articleMap.get(
                        key
                    );

                if (!article) {
                    return;
                }

                applyNewsImageDecisionToCard(
                    cards.get(key),
                    article,
                    decision
                );

            }
        );

        writeNewsFeedSnapshot(
            newsFeedAccountScope,
            newsData?.__meta?.generatedAt
        );

    } catch (error) {

        console.debug(
            "News source image batch skipped:",
            error
        );

    } finally {

        pendingUrls.forEach(
            url =>
                newsImageRequestsInFlight.delete(
                    url.toLowerCase()
                )
        );

    }
}

function hydrateNewsImages(
    articles
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

    const initialCards =
        cards.slice(
            0,
            NEWS_IMAGE_BATCH_SIZE
        );

    const initialArticles =
        initialCards
            .map(
                card =>
                    byUrl.get(
                        String(
                            card.dataset.newsUrl ||
                            ""
                        )
                            .trim()
                            .toLowerCase()
                    )
            )
            .filter(
                article =>
                    article &&
                    !article.newsImage
            );

    if (initialArticles.length) {
        void requestNewsSourceImages(
            initialArticles
        );
    }

    if (
        cards.length <= NEWS_IMAGE_BATCH_SIZE ||
        !("IntersectionObserver" in window)
    ) {
        return;
    }

    const observer =
        new IntersectionObserver(
            entries => {

                const visibleArticles = [];

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

                        const article =
                            byUrl.get(
                                String(
                                    entry.target.dataset.newsUrl ||
                                    ""
                                )
                                    .trim()
                                    .toLowerCase()
                            );

                        if (
                            article &&
                            !article.newsImage
                        ) {
                            visibleArticles.push(
                                article
                            );
                        }

                    }
                );

                if (visibleArticles.length) {
                    void requestNewsSourceImages(
                        visibleArticles
                    );
                }

            },
            {
                rootMargin:
                    "1200px 0px"
            }
        );

    cards.slice(
        NEWS_IMAGE_BATCH_SIZE
    ).forEach(
        card =>
            observer.observe(
                card
            )
    );
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

const NEWS_FEED_CACHE_PREFIX =
    "worth-it-news-feed-v2:";

let newsFeedAccountScope =
    "guest";

function getNewsFeedStorageKey(
    scope
) {
    return NEWS_FEED_CACHE_PREFIX +
        String(
            scope || "guest"
        );
}

async function getNewsAccountScope() {
    try {
        const result =
            await window.supabaseClient?.auth?.getUser();

        const id =
            result?.data?.user?.id;

        return id
            ? "user:" + id
            : "guest";

    } catch (error) {
        console.debug(
            "News account scope unavailable:",
            error
        );
        return "guest";
    }
}

function readNewsFeedSnapshot(
    scope
) {
    try {
        const raw =
            localStorage.getItem(
                getNewsFeedStorageKey(
                    scope
                )
            );

        if (!raw) {
            return null;
        }

        const parsed =
            JSON.parse(raw);

        if (
            !parsed ||
            typeof parsed !== "object" ||
            !parsed.data ||
            typeof parsed.data !== "object"
        ) {
            return null;
        }

        return parsed;

    } catch (error) {
        console.debug(
            "News snapshot read skipped:",
            error
        );
        return null;
    }
}

function writeNewsFeedSnapshot(
    scope,
    generatedAt
) {
    try {
        localStorage.setItem(
            getNewsFeedStorageKey(
                scope
            ),
            JSON.stringify({
                generatedAt:
                    generatedAt ||
                    new Date().toISOString(),
                savedAt:
                    Date.now(),
                data:
                    newsData
            })
        );
    } catch (error) {
        console.debug(
            "News snapshot write skipped:",
            error
        );
    }
}

function seedNewsImageUsageFromSnapshot() {
    newsImageUsedUrls.clear();
    newsImageReservedKeys.clear();

    Object.values(
        newsData || {}
    ).forEach(
        categoryArticles => {

            if (!Array.isArray(categoryArticles)) {
                return;
            }

            categoryArticles.forEach(
                article => {
                    const image =
                        article?.newsImage;

                    if (
                        image?.status === "allowed" &&
                        isUsableDirectNewsImage(
                            image.image
                        )
                    ) {
                        const key =
                            getNewsImageUsageKey(
                                image.image
                            );

                        newsImageUsedUrls.add(
                            image.image
                        );
                        newsImageReservedKeys.add(
                            key
                        );
                    }
                }
            );
        }
    );
}


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

    if (!grid) {
        return;
    }

    newsFeedAccountScope =
        await getNewsAccountScope();

    const snapshot =
        readNewsFeedSnapshot(
            newsFeedAccountScope
        );

    if (snapshot?.data) {

        newsData =
            snapshot.data;

        seedNewsImageUsageFromSnapshot();

        showNewsCategory(
            "all"
        );

    } else {

        grid.innerHTML =
            '<div class="news-loading">Loading news...</div>';

    }

    try {

        const response =
            await fetch(
                "/api/news",
                {
                    cache:
                        "no-store"
                }
            );

        if (!response.ok) {
            throw new Error(
                "News API error: " +
                response.status
            );
        }

        const generatedAt =
            response.headers.get(
                "X-News-Generated-At"
            );

        if (
            snapshot?.generatedAt &&
            generatedAt &&
            snapshot.generatedAt ===
                generatedAt
        ) {
            return;
        }

        const data =
            await response.json();

        if (!data || typeof data !== "object") {
            throw new Error(
                "News API returned invalid data."
            );
        }

        newsData =
            data;

        seedNewsImageUsageFromSnapshot();

        writeNewsFeedSnapshot(
            newsFeedAccountScope,
            newsData?.__meta?.generatedAt ||
                generatedAt ||
                new Date().toISOString()
        );

        showNewsCategory(
            "all"
        );

    } catch (error) {

        console.error(
            "Failed to load news:",
            error
        );

        if (snapshot?.data) {
            return;
        }

        grid.innerHTML =
            '<div class="news-loading">Failed to load news.</div>';

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
