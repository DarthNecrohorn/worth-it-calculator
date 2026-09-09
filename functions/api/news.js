export async function onRequestGet(context) {

    const apiKey =
        context.env.NEWSDATA_API_KEY;


    if (!apiKey) {

        return Response.json(
            {
                error:
                    "NEWSDATA_API_KEY is not configured."
            },
            {
                status: 500
            }
        );

    }


    /* =========================================================
       CACHE
    ========================================================= */

    const CACHE_TTL =
        2 * 60 * 60;


    const cache =
        caches.default;


    /*
     * v3 = Gaming + Entertainment
     *       + new All News structure
     */

    const requestUrl =
        new URL(
            context.request.url
        );


    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v3`;


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
        await cache.match(
            cacheKey
        );


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


    /* =========================================================
       NEWS CATEGORIES
    ========================================================= */

    const categories = {

        world: {

            category:
                "world",

            fallback:
                "international OR global OR world"

        },


        technology: {

            category:
                "technology",

            fallback:
                "technology OR tech OR gadgets"

        },


        business: {

            category:
                "business",

            fallback:
                "business OR economy OR finance"

        },


        science: {

            category:
                "science",

            fallback:
                "science OR research OR discovery"

        },


        weird: {

            q:
                "weird OR strange OR unusual"

        },


        awesome: {

            q:
                "amazing OR incredible OR inspiring"

        },


        underrated: {

            q:
                "overlooked OR underrated OR \"little known\""

        },


        sports: {

            category:
                "sports",

            fallback:
                "sports OR football OR basketball OR tennis"

        },


        gaming: {

            q:
                "gaming OR video games OR videogames OR PlayStation OR Xbox OR Nintendo"

        },


        travel: {

            category:
                "tourism",

            fallback:
                "travel OR tourism OR destinations"

        },


        entertainment: {

            category:
                "entertainment",

            fallback:
                "movies OR music OR television OR celebrities"

        }

    };


    try {


        /* =====================================================
           FETCH NEWS
        ===================================================== */

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
             * Keep this at 10 because this
             * works with the free NewsData
             * response limit as well.
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
             * NewsData pagination.
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
                    Array.isArray(
                        data.results
                    )
                        ? data.results
                        : [],

                nextPage:
                    data.nextPage || null

            };

        }


        /* =====================================================
           NORMALIZE TITLE
        ===================================================== */

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


        /* =====================================================
           TITLE SIMILARITY
        ===================================================== */

        function titleSimilarity(
            titleA,
            titleB
        ) {

            const wordsA =
                new Set(
                    normalizeTitle(
                        titleA
                    )
                        .split(" ")
                        .filter(
                            word =>
                                word.length >= 4
                        )
                );


            const wordsB =
                new Set(
                    normalizeTitle(
                        titleB
                    )
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


            let commonWords =
                0;


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


        /* =====================================================
           REMOVE DUPLICATE ARTICLES
        ===================================================== */

        function removeDuplicateArticles(
            articles
        ) {

            const uniqueArticles =
                [];


            const seenUrls =
                new Set();


            const seenTitles =
                [];


            for (
                const article of articles
            ) {

                const articleUrl =
                    (
                        article.link ||
                        ""
                    )
                        .trim()
                        .toLowerCase();


                const articleTitle =
                    normalizeTitle(
                        article.title
                    );


                /*
                 * Duplicate URL.
                 */

                if (
                    articleUrl &&
                    seenUrls.has(
                        articleUrl
                    )
                ) {

                    continue;

                }


                /*
                 * Duplicate / very similar title.
                 */

                let duplicate =
                    false;


                for (
                    const existingTitle
                    of seenTitles
                ) {

                    if (
                        titleSimilarity(
                            articleTitle,
                            existingTitle
                        ) >= 0.65
                    ) {

                        duplicate =
                            true;

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
                 * We only need 12
                 * articles per category.
                 */

                if (
                    uniqueArticles.length >= 12
                ) {

                    break;

                }

            }


            return uniqueArticles;

        }


        /* =====================================================
           FORMAT ARTICLES
        ===================================================== */

        function formatArticles(
            articles
        ) {

            return articles.map(
                article => ({

                    title:
                        article.title ||
                        "",

                    description:
                        article.description ||
                        "",

                    url:
                        article.link ||
                        "",

                    image:
                        article.image_url ||
                        "",

                    publishedAt:
                        article.pubDate ||
                        "",

                    source:
                        article.source_name ||
                        ""

                })
            );

        }


        /* =====================================================
           LOAD CATEGORY
        ===================================================== */

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
             * First duplicate cleanup.
             */

            let uniqueArticles =
                removeDuplicateArticles(
                    articles
                );


            /* =================================================
               SECOND PAGE
            ================================================= */

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


                    uniqueArticles =
                        removeDuplicateArticles(
                            articles
                        );

                } catch (pageError) {

                    console.error(
                        `${category} second page error:`,
                        pageError
                    );

                }

            }


            /* =================================================
               FALLBACK
            ================================================= */

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


                    uniqueArticles =
                        removeDuplicateArticles(
                            articles
                        );


                    /*
                     * Second fallback page.
                     */

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


                            uniqueArticles =
                                removeDuplicateArticles(
                                    articles
                                );

                        } catch (
                            secondFallbackError
                        ) {

                            console.error(
                                `${category} second fallback page error:`,
                                secondFallbackError
                            );

                        }

                    }

                } catch (
                    fallbackError
                ) {

                    console.error(
                        `${category} fallback error:`,
                        fallbackError
                    );

                }

            }


            /*
             * Final maximum:
             * 12 articles per category.
             */

            uniqueArticles =
                uniqueArticles.slice(
                    0,
                    12
                );


            return formatArticles(
                uniqueArticles
            );

        }


        /* =====================================================
           LOAD ALL CATEGORIES
        ===================================================== */

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


        /* =====================================================
           BUILD OUTPUT
        ===================================================== */

        const output =
            Object.fromEntries(
                results
            );


        /*
         * Make sure every category exists.
         */

        Object.keys(
            categories
        )
            .forEach(
                category => {

                    output[category] =
                        Array.isArray(
                            output[category]
                        )
                            ? output[category]
                            : [];

                }
            );


        /* =====================================================
           RESPONSE
        ===================================================== */

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


        /* =====================================================
           CLOUDFLARE CACHE
        ===================================================== */

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
