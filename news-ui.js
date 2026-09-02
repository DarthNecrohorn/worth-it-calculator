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

    const category =
        container.closest(".news-category");

    if (category) {

        const count =
            category.querySelector(
                ".news-category-header span"
            );

        if (count) {

            const visibleCount =
                Math.min(articles.length, 10);

            count.textContent =
                `${visibleCount} News`;
        }
    }

    container.innerHTML = "";

    articles
        .slice(0, 10)
        .forEach(article => {

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
LOAD NEWS
========================================================= */

async function loadNews() {

    const containers = {

        latest: $("newsLatest"),
        weird: $("newsWeird"),
        awesome: $("newsAwesome"),
        underrated: $("newsUnderrated"),
        world: $("newsWorld")

    };


    Object.values(containers).forEach(container => {

        if (container) {

            container.innerHTML = `
                <div class="news-loading">
                    Loading news...
                </div>
            `;

        }

    });


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


        renderNewsCategory(
            containers.latest,
            data.latest
        );


        renderNewsCategory(
            containers.weird,
            data.weird
        );


        renderNewsCategory(
            containers.awesome,
            data.awesome
        );


        renderNewsCategory(
            containers.underrated,
            data.underrated
        );


        renderNewsCategory(
            containers.world,
            data.world
        );


    } catch (error) {

        console.error(
            "Failed to load news:",
            error
        );


        Object.values(containers).forEach(container => {

            if (container) {

                container.innerHTML = `
                    <div class="news-loading">
                        Failed to load news.
                    </div>
                `;

            }

        });

    }

}


/* =========================================================
NEWS
========================================================= */

function openNews(){

    $("homePage").style.display = "none";

    document.querySelectorAll(".app")
        .forEach(x => x.classList.remove("active"));

    $("weatherSection").style.display = "none";

    const settingsPanel = $("settingsPanel");

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

    loadNews();
}
