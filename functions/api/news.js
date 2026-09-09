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
     */
    const CACHE_TTL =
        2 * 60 * 60;

    const cache =
        caches.default;


    /*
     * Use a stable cache key for the whole
     * News endpoint.
     *
     * v2 = new News category structure.
     */
    const requestUrl =
        new URL(
            context.request.url
        );

    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v2`;

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


    /*
     * News categories.
     *
     * "all" is NOT requested separately.
     * The frontend combines all returned
     * categories into All News.
     */
    const categories = {

        world: {
            category: "world",
            fallback: "international OR global OR world"
        },

        technology: {
            category: "technology",
            fallback: "technology OR tech OR gadgets"
        },

        business: {
            category: "business",
            fallback: "business OR economy OR finance"
        },

        science: {
            category: "science",
            fallback: "science OR research OR discovery"
        },

        weird: {
            q: "weird OR strange OR unusual"
        },

        awesome: {
            q: "amazing OR incredible OR inspiring"
        },

        underrated: {
            q: "overlooked OR underrated OR \"little known\""
        },

        sports: {
            category: "sports",
            fallback: "sports OR football OR basketball OR tennis"
        },

        automotive: {
            category: "automobiles",
            fallback: "automotive OR cars OR vehicles"
        },

        travel: {
            category: "tourism",
            fallback: "travel OR tourism OR destinations"
        }

    };


    try {


        /* =========================================================
           FETCH NEWS
        ========================================================= */

        async function fetchNews(
            category,
            params,
            page = null
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

            /*
             * NewsData returns up to 10 articles
             * per request.
             */
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


            /*
             * Used when we need a second page
             * to reach 12 unique stories.
             */
            if (page) {

                url.searchParams.set(
                    "page",
                    page
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


            return {

                articles:
                    Array.isArray(data.results)
                        ? data.results
                        : [],

                nextPage:
                    data.nextPage || null

            };

        }


        /* =========================================================
           NORMALIZE TITLE
        ========================================================= */

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


        /* =========================================================
           TITLE SIMILARITY
        ========================================================= */

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


        /* =========================================================
           REMOVE DUPLICATE ARTICLES
        ========================================================= */

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


                /*
                 * We only need 12 unique stories.
                 */
                if (
                    uniqueArticles.length >= 12
                ) {

                    break;

                }

            }


            return uniqueArticles;

        }


        /* =========================================================
           FORMAT ARTICLES
        ========================================================= */

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


        /* =========================================================
           FETCH CATEGORY
        ========================================================= */

        async function loadCategory(
            category,
            settings
        ) {

            /*
             * First request.
             */
            let result =
                await fetchNews(
                    category,
                    {
                        category:
                            settings.category,

                        q:
                            settings.q
                    }
                );


            let articles =
                result.articles;


            /*
             * If the category has fewer than
             * 12 unique stories, try the next
             * NewsData page.
             */
            if (
                articles.length > 0
            ) {

                let uniqueArticles =
                    removeDuplicateArticles(
                        articles
                    );


                if (
                    uniqueArticles.length < 12 &&
                    result.nextPage
                ) {

                    try {

                        const secondPage =
                            await fetchNews(
                                category,
                                {
                                    category:
                                        settings.category,

                                    q:
                                        settings.q
                                },
                                result.nextPage
                            );


                        articles = [
                            ...articles,
                            ...secondPage.articles
                        ];

                    } catch (pageError) {

                        console.error(
                            `${category} second page error:`,
                            pageError
                        );

                    }

                }

            }


            /*
             * Final duplicate removal.
             */
            let uniqueArticles =
                removeDuplicateArticles(
                    articles
                );


            /*
             * Category fallback.
             *
             * Used when the main category
             * returns no useful stories.
             */
            if (
                uniqueArticles.length === 0 &&
                settings.fallback
            ) {

                try {

                    const fallbackResult =
                        await fetchNews(
                            category,
                            {
                                q:
                                    settings.fallback
                            }
                        );


                    articles =
                        fallbackResult.articles;


                    /*
                     * Try second fallback page
                     * if necessary.
                     */
                    if (
                        articles.length > 0
                    ) {

                        uniqueArticles =
                            removeDuplicateArticles(
                                articles
                            );


                        if (
                            uniqueArticles.length < 12 &&
                            fallbackResult.nextPage
                        ) {

                            try {

                                const secondFallbackPage =
                                    await fetchNews(
                                        category,
                                        {
                                            q:
                                                settings.fallback
                                        },
                                        fallbackResult.nextPage
                                    );


                                articles = [
                                    ...articles,
                                    ...secondFallbackPage.articles
                                ];

                            } catch (
                                secondFallbackError
                            ) {

                                console.error(
                                    `${category} second fallback page error:`,
                                    secondFallbackError
                                );

                            }

                        }

                    }


                    uniqueArticles =
                        removeDuplicateArticles(
                            articles
                        );

                } catch (fallbackError) {

                    console.error(
                        `${category} fallback error:`,
                        fallbackError
                    );

                }

            }


            return formatArticles(
                uniqueArticles
            );

        }


        /* =========================================================
           LOAD ALL CATEGORIES
        ========================================================= */

        const results =
            await Promise.all(
                Object.entries(
                    categories
                ).map(
                    async (
                        [
                            category,
                            settings
                        ]
                    ) => {

                        try {

                            const articles =
                                await loadCategory(
                                    category,
                                    settings
                                );


                            return [
                                category,
                                articles
                            ];

                        } catch (error) {

                            console.error(
                                `${category} error:`,
                                error
                            );


                            return [
                                category,
                                []
                            ];

                        }

                    }
                )
            );


        /* =========================================================
           BUILD OUTPUT
        ========================================================= */

        const output =
            Object.fromEntries(
                results
            );


        /*
         * Make absolutely sure every category
         * exists even if NewsData fails.
         */
        Object.keys(categories)
            .forEach(category => {

                output[category] =
                    Array.isArray(
                        output[category]
                    )
                        ? output[category]
                        : [];

            });


        /* =========================================================
           RESPONSE
        ========================================================= */

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
         * Store successful response
         * in Cloudflare cache.
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
