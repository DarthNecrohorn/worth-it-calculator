/* =========================================================
   NEWS CATEGORY RENDER
========================================================= */

function renderNewsCategory(
    container,
    articles
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

    const visibleArticles =
        articles.slice(0, 12);

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
NEWS CATEGORY FILTER
========================================================= */

let newsData = {};


/* =========================================================
NEWS CATEGORY LABELS
========================================================= */

const NEWS_CATEGORY_LABELS = {

    all: "📰 All News",

    world: "🌍 World",

    technology: "💻 Technology",

    business: "💼 Business",

    science: "🔬 Science",

    weird: "🤯 Weird",

    awesome: "✨ Awesome",

    underrated: "💎 Underrated",

    sports: "🏆 Sports",

    automotive: "🚗 Automotive",

    travel: "✈️ Travel"

};


/* =========================================================
RENDER SELECTED NEWS CATEGORY
========================================================= */

function showNewsCategory(categoryName) {

    const grid =
        document.getElementById("newsGrid");

    const title =
        document.getElementById("newsCategoryTitle");

    const count =
        document.getElementById("newsCategoryCount");

    if (!grid) return;


    let articles = [];


    if (categoryName === "all") {

        Object.values(newsData)
            .forEach(categoryArticles => {

                if (Array.isArray(categoryArticles)) {

                    articles.push(
                        ...categoryArticles
                    );

                }

            });

    } else {

        articles =
            Array.isArray(newsData[categoryName])
                ? newsData[categoryName]
                : [];

    }


    /*
       Remove duplicate articles
       when combining "All News".
    */

    const seenUrls =
        new Set();

    articles =
        articles.filter(article => {

            const url =
                article?.url || "";

            if (!url) return true;

            if (seenUrls.has(url)) {
                return false;
            }

            seenUrls.add(url);

            return true;

        });


    /*
       Keep maximum 12 stories.
    */

    articles =
        articles.slice(0, 12);


    if (title) {

        title.textContent =
            NEWS_CATEGORY_LABELS[categoryName] ||
            "📰 News";

    }


    if (count) {

        count.textContent =
            `${articles.length} stories`;

    }


    renderNewsCategory(
        grid,
        articles
    );


    /*
       Update active category button.
    */

    document
        .querySelectorAll(".news-category-btn")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.newsCategory === categoryName
            );

        });

}


/* =========================================================
NEWS CATEGORY BUTTONS
========================================================= */

function initNewsCategoryButtons() {

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

                if (!category) return;

                showNewsCategory(
                    category
                );

            }
        );

    });

}


/* =========================================================
LOAD NEWS
========================================================= */

async function loadNews() {

    const grid =
        document.getElementById("newsGrid");

    if (!grid) return;


    grid.innerHTML = `
        <div class="news-loading">
            Loading news...
        </div>
    `;


    try {

        const response =
            await fetch("/api/news");


        if (!response.ok) {

            throw new Error(
                `News API error: ${response.status}`
            );

        }


        const data =
            await response.json();


        newsData = data || {};


        /*
           Show All News by default.
        */

        showNewsCategory("all");


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
            count.textContent = "";
        }

    }

}


/* =========================================================
NEWS
========================================================= */

function openNews(){

    $("homePage").style.display = "none";


    const discountsSection =
        document.getElementById("discountsSection");

    if(discountsSection){
        discountsSection.style.display = "none";
    }


    const marketsSection =
        document.getElementById("marketsSection");

    if(marketsSection){
        marketsSection.style.display = "none";
    }


    const moneySection =
        document.getElementById("moneySection");

    if(moneySection){
        moneySection.style.display = "none";
    }


    document.querySelectorAll(".app").forEach(x => {
        x.classList.remove("active");
        x.style.display = "none";
    });


    $("weatherSection").style.display = "none";


    const settingsPanel =
        $("settingsPanel");

    if(settingsPanel){
        settingsPanel.style.display = "none";
    }


    $("newsSection").style.display = "block";


    $("navLinks").classList.remove("open");


    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "auto";


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });


    initNewsCategoryButtons();

    loadNews();

}
