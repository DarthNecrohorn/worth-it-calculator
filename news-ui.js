/* =========================================================
   NEWS CATEGORY RENDER
========================================================= */

function renderNewsCategory(
    container,
    articles
){

    if(!container) return;

    if(!Array.isArray(articles) || !articles.length){

        container.innerHTML = `
            <div class="news-loading">
                No stories available.
            </div>
        `;

        return;
    }

    const category =
        container.closest(".news-category");

    if(category){

        const count =
            category.querySelector(
                ".news-category-header span"
            );

        if(count){

            const visibleCount =
                Math.min(articles.length, 10);

            count.textContent =
                `${visibleCount} News`;
        }

    }

    container.innerHTML = "";

    articles
        .slice(0,10)
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


function escapeNewsHtml(value){

    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}


function formatNewsTime(date){

    const time =
        new Date(date);

    if(Number.isNaN(time.getTime())){
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
