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
     * v4 = stricter category relevance
     */

    const requestUrl =
        new URL(
            context.request.url
        );


    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v4`;


    const cacheKey =
        new Request(
            cacheKeyUrl,
            {
                method: "GET"
            }
        );


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
                "world"

        },


        technology: {

            category:
                "technology"

        },


        business: {

            category:
                "business"

        },


        science: {

            category:
                "science"

        },


        sports: {

            category:
                "sports"

        },


        travel: {

            category:
                "tourism"

        },


        entertainment: {

            category:
                "entertainment"

        },


        gaming: {

            q:
                "(gaming OR \"video games\" OR videogames OR PlayStation OR Xbox OR Nintendo)"

        },


        weird: {

            q:
                "(weird OR strange OR bizarre OR unusual OR odd)"

        },


        awesome: {

            q:
                "(amazing OR incredible OR inspiring OR extraordinary)"

        },


        underrated: {

            q:
                "(underrated OR overlooked OR \"little known\" OR \"hidden gem\")"

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
             * NewsData free response limit.
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
           REMOVE DUPLICATES
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

            }


            return uniqueArticles;

        }


        /* =====================================================
           SPECIAL CATEGORY RELEVANCE
        ===================================================== */

        function isRelevantSpecialCategory(
            article,
            category
        ) {

            const title =
                String(
                    article.title || ""
                )
                    .toLowerCase();


            const description =
                String(
                    article.description || ""
                )
                    .toLowerCase();


            const text =
                `${title} ${description}`;


            const rules = {

                gaming: [
                    "gaming",
                    "video game",
                    "video games",
                    "videogame",
                    "playstation",
                    "xbox",
                    "nintendo",
                    "steam",
                    "gameplay",
                    "esports",
                    "xbox",
                    "ps5",
                    "ps4",
                    "switch"
                ],


                weird: [
                    "weird",
                    "strange",
                    "bizarre",
                    "unusual",
                    "odd",
                    "peculiar",
                    "mysterious",
                    "unexpected"
                ],


                awesome: [
                    "amazing",
                    "incredible",
                    "inspiring",
                    "extraordinary",
                    "remarkable",
                    "spectacular",
                    "astonishing"
                ],


                underrated: [
                    "underrated",
                    "overlooked",
                    "little known",
                    "hidden gem",
                    "unknown",
                    "forgotten"
                ]

            };


            const keywords =
                rules[category] || [];


            return keywords.some(
                keyword =>
                    text.includes(
                        keyword
                    )
            );

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

            let articles = [];


            /*
             * First page.
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


            articles.push(
                ...result.articles
            );


            /*
             * Second page only when
             * necessary.
             */

            if (
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


                    articles.push(
                        ...secondPage.articles
                    );

                } catch (pageError) {

                    console.error(
                        `${category} second page error:`,
                        pageError
                    );

                }

            }


            /*
             * Remove duplicates first.
             */

            articles =
                removeDuplicateArticles(
                    articles
                );


            /*
             * Special categories need
             * additional relevance filtering.
             */

            if (
                [
                    "gaming",
                    "weird",
                    "awesome",
                    "underrated"
                ].includes(
                    category
                )
            ) {

                articles =
                    articles.filter(
                        article =>
                            isRelevantSpecialCategory(
                                article,
                                category
                            )
                    );

            }


            /*
             * Maximum 12.
             *
             * This is NOT a requirement
             * to have 12.
             */

            articles =
                articles.slice(
                    0,
                    12
                );


            return formatArticles(
                articles
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
