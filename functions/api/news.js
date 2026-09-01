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

    /*
     * Cache News results for 2 hours.
     *
     * This prevents every visitor from triggering
     * new NewsData API requests.
     */
    const CACHE_TTL = 2 * 60 * 60;

    const cache = caches.default;

    /*
     * Use a stable cache key for the whole News endpoint.
     *
     * The API is intentionally cached independently of
     * the incoming query string so ?v=2 does not create
     * a separate cache entry.
     */
    const requestUrl = new URL(context.request.url);

    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v1`;

    const cacheKey =
        new Request(
            cacheKeyUrl,
            {
                method: "GET"
            }
        );

    /*
     * Return cached News data when available.
     */
    const cachedResponse =
        await cache.match(cacheKey);

    if (cachedResponse) {

        const response =
            new Response(
                cachedResponse.body,
                cachedResponse
            );

        response.headers.set(
            "X-News-Cache",
            "HIT"
        );

        return response;
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

        async function fetchNews(
            category,
            params
        ) {

            const url =
                new URL(
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
                await fetch(
                    url.toString()
                );

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

        function normalizeTitle(
            title
        ) {

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

        function titleSimilarity(
            titleA,
            titleB
        ) {

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

            for (
                const word of wordsA
            ) {

                if (
                    wordsB.has(word)
                ) {
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

        function removeDuplicateArticles(
            articles
        ) {

            const uniqueArticles = [];

            const seenUrls =
                new Set();

            const seenTitles = [];

            for (
                const article of articles
            ) {

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

                for (
                    const existingTitle of seenTitles
                ) {

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

                    seenUrls.add(
                        articleUrl
                    );

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

            return uniqueArticles;

        }

        function formatArticles(
            articles
        ) {

            return articles.map(
                article => ({

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

                })
            );

        }

        const results =
            await Promise.all(
                Object.entries(categories).map(
                    async ([category, settings]) => {

                        try {

                            let articles =
                                await fetchNews(
                                    category,
                                    {
                                        category:
                                            settings.category,

                                        q:
                                            settings.q
                                    }
                                );

                            /*
                             * World fallback if the
                             * category returns no stories.
                             */
                            if (
                                category === "world" &&
                                articles.length === 0 &&
                                settings.fallback
                            ) {

                                articles =
                                    await fetchNews(
                                        category,
                                        {
                                            q:
                                                settings.fallback
                                        }
                                    );

                            }

                            const uniqueArticles =
                                removeDuplicateArticles(
                                    articles
                                );

                            return [
                                category,
                                formatArticles(
                                    uniqueArticles
                                )
                            ];

                        } catch (error) {

                            console.error(
                                `${category} error:`,
                                error
                            );

                            /*
                             * Extra World fallback if the
                             * category request itself fails.
                             */
                            if (
                                category === "world" &&
                                settings.fallback
                            ) {

                                try {

                                    const articles =
                                        await fetchNews(
                                            category,
                                            {
                                                q:
                                                    settings.fallback
                                            }
                                        );

                                    const uniqueArticles =
                                        removeDuplicateArticles(
                                            articles
                                        );

                                    return [
                                        category,
                                        formatArticles(
                                            uniqueArticles
                                        )
                                    ];

                                } catch (
                                    fallbackError
                                ) {

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
            Object.fromEntries(
                results
            );

        /*
         * Make absolutely sure all five
         * category keys exist.
         */
        output.latest =
            Array.isArray(
                output.latest
            )
                ? output.latest
                : [];

        output.weird =
            Array.isArray(
                output.weird
            )
                ? output.weird
                : [];

        output.awesome =
            Array.isArray(
                output.awesome
            )
                ? output.awesome
                : [];

        output.underrated =
            Array.isArray(
                output.underrated
            )
                ? output.underrated
                : [];

        output.world =
            Array.isArray(
                output.world
            )
                ? output.world
                : [];

        /*
         * Create the response.
         *
         * s-maxage tells Cloudflare how long
         * the response can stay in shared cache.
         */
        const response =
            Response.json(
                output,
                {
                    headers: {
                        "Cache-Control":
                            `public, max-age=0, s-maxage=${CACHE_TTL}`,

                        "X-News-Cache":
                            "MISS"
                    }
                }
            );

        /*
         * Store the successful response in
         * Cloudflare's cache.
         */
        context.waitUntil(
            cache.put(
                cacheKey,
                response.clone()
            )
        );

        return response;

    } catch (error) {

        console.error(
            "NewsData API error:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to load news."
            },
            {
                status: 500
            }
        );

    }

}
