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


        const image =
            article.image
                ? `
                    <img
                        class="news-card-image"
                        src="${escapeNewsHtml(article.image)}"
                        alt=""
                        loading="lazy"
                    >
                `
                : `
                    <div class="news-card-image news-card-placeholder">
                        📰
                    </div>
                `;


        const source =
            article.source ||
            "Unknown source";


        const title =
            article.title ||
            "Untitled story";


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

    travel:
        "✈️ Travel",

    entertainment:
        "🎬 Entertainment",

    lifestyle:
        "🌿 Lifestyle"

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

function openNews() {

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


    $("navLinks").classList.remove(
        "open"
    );


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
