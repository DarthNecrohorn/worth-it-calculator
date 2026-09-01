export async function onRequestGet(context) {

    const apiKey = context.env.NEWSDATA_API_KEY;

    if (!apiKey) {
        return Response.json(
            {
                error: "NEWSDATA_API_KEY is not configured."
            },
            { status: 500 }
        );
    }

    const categories = {

        latest: {
            q: "news"
        },

        weird: {
            q: "weird OR strange OR unusual"
        },

        awesome: {
            q: "amazing OR incredible OR inspiring"
        },

        underrated: {
            q: "overlooked OR underrated OR little known"
        },

        world: {
            category: "world",
            fallback: "international OR global OR world"
        }

    };

    try {

        const results = await Promise.all(
            Object.entries(categories).map(
                async ([category, settings]) => {

                    async function fetchNews(params) {

                        const url = new URL(
                            "https://newsdata.io/api/1/latest"
                        );

                        url.searchParams.set(
                            "apikey",
                            apiKey
                        );

                        url.searchParams.set(
                            "language",
                            "en"
                        );

                        url.searchParams.set(
                            "size",
                            "10"
                        );

                        url.searchParams.set(
                            "removeduplicate",
                            "1"
                        );

                        if (params.category) {
                            url.searchParams.set(
                                "category",
                                params.category
                            );
                        }

                        if (params.q) {
                            url.searchParams.set(
                                "q",
                                params.q
                            );
                        }

                        const response =
                            await fetch(url.toString());

                        const data =
                            await response.json();

                        if (!response.ok) {
                            throw new Error(
                                `${category} request failed: ${response.status}`
                            );
                        }

                        return Array.isArray(data.results)
                            ? data.results
                            : [];
                    }

                    try {

                        let articles =
                            await fetchNews({
                                category:
                                    settings.category,
                                q:
                                    settings.q
                            });

                        /*
                         * If World category returns no stories,
                         * automatically try a keyword-based fallback.
                         */
                        if (
                            category === "world" &&
                            articles.length === 0 &&
                            settings.fallback
                        ) {

                            articles =
                                await fetchNews({
                                    q: settings.fallback
                                });

                        }

                        /*
                         * Remove duplicate stories.
                         *
                         * Some news providers publish the same
                         * story through multiple sources or feeds.
                         */
                        const uniqueArticles = [];
                        const seenUrls = new Set();
                        const seenTitles = [];

                        function normalizeTitle(title) {

                            return (title || "")
                                .trim()
                                .toLowerCase()
                                .replace(
                                    /[^\p{L}\p{N}\s]/gu,
                                    " "
                                )
                                .replace(
                                    /\b(reuters|ap|associated press|breaking|update|news)\b/g,
                                    ""
                                )
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();
                        }

                        function titleSimilarity(titleA, titleB) {

                            const wordsA =
                                new Set(
                                    normalizeTitle(titleA)
                                        .split(" ")
                                        .filter(
                                            word =>
                                                word.length >= 4
                                        )
                                );

                            const wordsB =
                                new Set(
                                    normalizeTitle(titleB)
                                        .split(" ")
                                        .filter(
                                            word =>
                                                word.length >= 4
                                        )
                                );

                            if (
                                !wordsA.size ||
                                !wordsB.size
                            ) {
                                return 0;
                            }

                            let commonWords = 0;

                            for (const word of wordsA) {

                                if (wordsB.has(word)) {
                                    commonWords++;
                                }

                            }

                            return (
                                commonWords /
                                Math.max(
                                    wordsA.size,
                                    wordsB.size
                                )
                            );
                        }

                        for (const article of articles) {

                            const articleUrl =
                                (article.link || "")
                                    .trim()
                                    .toLowerCase();

                            const articleTitle =
                                normalizeTitle(
                                    article.title
                                );

                            if (
                                articleUrl &&
                                seenUrls.has(articleUrl)
                            ) {
                                continue;
                            }

                            let duplicate = false;

                            for (const existingTitle of seenTitles) {

                                if (
                                    titleSimilarity(
                                        articleTitle,
                                        existingTitle
                                    ) >= 0.65
                                ) {

                                    duplicate = true;
                                    break;

                                }

                            }

                            if (duplicate) {
                                continue;
                            }

                            if (articleUrl) {
                                seenUrls.add(articleUrl);
                            }

                            if (articleTitle) {
                                seenTitles.push(articleTitle);
                            }

                            uniqueArticles.push(article);

                            if (uniqueArticles.length >= 10) {
                                break;
                            }

                        }

                        return [
                            category,
                            uniqueArticles
                                .map(article => ({

                                    title:
                                        article.title || "",

                                    description:
                                        article.description || "",

                                    url:
                                        article.link || "",

                                    image:
                                        article.image_url || "",

                                    publishedAt:
                                        article.pubDate || "",

                                    source:
                                        article.source_name || ""

                                }))
                        ];

                    } catch (error) {

                        console.error(
                            `${category} error:`,
                            error
                        );

                        /*
                         * Extra World fallback if category request fails.
                         */
                        if (
                            category === "world" &&
                            settings.fallback
                        ) {

                            try {

                                const articles =
                                    await fetchNews({
                                        q: settings.fallback
                                    });

                                const uniqueArticles = [];
                                const seenUrls = new Set();
                                const seenTitles = [];

                                function normalizeTitle(title) {

                                    return (title || "")
                                        .trim()
                                        .toLowerCase()
                                        .replace(
                                            /[^\p{L}\p{N}\s]/gu,
                                            " "
                                        )
                                        .replace(
                                            /\b(reuters|ap|associated press|breaking|update|news)\b/g,
                                            ""
                                        )
                                        .replace(
                                            /\s+/g,
                                            " "
                                        )
                                        .trim();
                                }

                                function titleSimilarity(titleA, titleB) {

                                    const wordsA =
                                        new Set(
                                            normalizeTitle(titleA)
                                                .split(" ")
                                                .filter(
                                                    word =>
                                                        word.length >= 4
                                                )
                                        );

                                    const wordsB =
                                        new Set(
                                            normalizeTitle(titleB)
                                                .split(" ")
                                                .filter(
                                                    word =>
                                                        word.length >= 4
                                                )
                                        );

                                    if (
                                        !wordsA.size ||
                                        !wordsB.size
                                    ) {
                                        return 0;
                                    }

                                    let commonWords = 0;

                                    for (const word of wordsA) {

                                        if (wordsB.has(word)) {
                                            commonWords++;
                                        }

                                    }

                                    return (
                                        commonWords /
                                        Math.max(
                                            wordsA.size,
                                            wordsB.size
                                        )
                                    );
                                }

                                for (const article of articles) {

                                    const articleUrl =
                                        (article.link || "")
                                            .trim()
                                            .toLowerCase();

                                    const articleTitle =
                                        normalizeTitle(
                                            article.title
                                        );

                                    if (
                                        articleUrl &&
                                        seenUrls.has(articleUrl)
                                    ) {
                                        continue;
                                    }

                                    let duplicate = false;

                                    for (const existingTitle of seenTitles) {

                                        if (
                                            titleSimilarity(
                                                articleTitle,
                                                existingTitle
                                            ) >= 0.65
                                        ) {

                                            duplicate = true;
                                            break;

                                        }

                                    }

                                    if (duplicate) {
                                        continue;
                                    }

                                    if (articleUrl) {
                                        seenUrls.add(articleUrl);
                                    }

                                    if (articleTitle) {
                                        seenTitles.push(
                                            articleTitle
                                        );
                                    }

                                    uniqueArticles.push(
                                        article
                                    );

                                    if (
                                        uniqueArticles.length >= 10
                                    ) {
                                        break;
                                    }

                                }

                                return [
                                    category,
                                    uniqueArticles
                                        .map(article => ({

                                            title:
                                                article.title || "",

                                            description:
                                                article.description || "",

                                            url:
                                                article.link || "",

                                            image:
                                                article.image_url || "",

                                            publishedAt:
                                                article.pubDate || "",

                                            source:
                                                article.source_name || ""

                                        }))
                                ];

                            } catch (fallbackError) {

                                console.error(
                                    "World fallback error:",
                                    fallbackError
                                );

                            }

                        }

                        return [
                            category,
                            []
                        ];

                    }

                }
            )
        );

        const output =
            Object.fromEntries(results);

        /*
         * Make absolutely sure all five keys exist.
         */
        output.latest =
            Array.isArray(output.latest)
                ? output.latest
                : [];

        output.weird =
            Array.isArray(output.weird)
                ? output.weird
                : [];

        output.awesome =
            Array.isArray(output.awesome)
                ? output.awesome
                : [];

        output.underrated =
            Array.isArray(output.underrated)
                ? output.underrated
                : [];

        output.world =
            Array.isArray(output.world)
                ? output.world
                : [];

        return Response.json(
            output,
            {
                headers: {
                    "Cache-Control": "no-store"
                }
            }
        );

    } catch (error) {

        console.error(
            "NewsData API error:",
            error
        );

        return Response.json(
            {
                error: "Unable to load news."
            },
            { status: 500 }
        );

    }

}
