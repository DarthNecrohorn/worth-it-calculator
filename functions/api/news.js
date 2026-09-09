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
     * v6 = expanded category search
     * with improved special-category relevance.
     */

    const requestUrl =
        new URL(
            context.request.url
        );


    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v6`;


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
                "(gaming OR \"video game\" OR \"video games\" OR videogame OR PlayStation OR Xbox OR Nintendo OR \"Nintendo Switch\" OR Steam OR \"PC gaming\" OR gameplay OR esports OR PS5 OR PS4 OR \"Xbox Series\" OR Switch OR \"game developer\" OR \"game studio\" OR \"game release\" OR \"new game\" OR RPG OR Fortnite OR Minecraft OR Roblox OR GTA)"

        },


        weird: {

            q:
                "(weird OR strange OR bizarre OR unusual OR odd OR peculiar OR mysterious OR unexpected OR unbelievable OR \"strange event\" OR \"unusual event\" OR unexplained OR \"strange discovery\" OR \"unusual discovery\")"

        },


        awesome: {

            q:
                "(cute OR adorable OR heartwarming OR \"heart-warming\" OR wholesome OR uplifting OR inspiring OR kindness OR \"kind act\" OR \"acts of kindness\" OR \"good deed\" OR \"good deeds\" OR helping OR helped OR rescue OR rescued OR saving OR saved OR \"good news\" OR \"feel good\" OR \"feel-good\" OR \"happy ending\" OR \"happy story\" OR \"positive story\" OR \"positive news\" OR \"human kindness\" OR \"local hero\" OR hero OR heroes OR cat OR cats OR kitten OR kittens OR dog OR dogs OR puppy OR puppies OR pet OR pets OR animal OR animals OR wildlife)"

        },


        underrated: {

            q:
                "(underrated OR overlooked OR \"little known\" OR \"little-known\" OR \"hidden gem\" OR \"hidden gems\" OR unknown OR forgotten OR \"under the radar\" OR \"off the radar\" OR \"lesser known\" OR \"lesser-known\" OR unsung OR \"unsung hero\")"

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
                    "nintendo switch",

                    "steam",
                    "pc gaming",
                    "gameplay",
                    "esports",

                    "ps5",
                    "ps4",
                    "xbox series",
                    "switch",

                    "game developer",
                    "game studio",
                    "game release",
                    "new game",

                    "rpg",

                    "fortnite",
                    "minecraft",
                    "roblox",
                    "gta"

                ],


                weird: [

                    "weird",
                    "strange",
                    "bizarre",
                    "unusual",
                    "odd",
                    "peculiar",
                    "mysterious",
                    "unexpected",
                    "unbelievable",
                    "unexplained",
                    "strange discovery",
                    "unusual discovery"

                ],


                awesome: [

                    "cute",
                    "adorable",

                    "heartwarming",
                    "heart-warming",
                    "wholesome",
                    "uplifting",
                    "inspiring",

                    "kindness",
                    "kind act",
                    "kindness story",
                    "acts of kindness",

                    "good deed",
                    "good deeds",

                    "helping",
                    "helped",
                    "helps",

                    "rescue",
                    "rescued",
                    "saving",
                    "saved",

                    "good news",
                    "feel good",
                    "feel-good",

                    "happy ending",
                    "happy story",

                    "positive story",
                    "positive news",

                    "human kindness",

                    "local hero",
                    "hero",
                    "heroes",

                    "cat",
                    "cats",
                    "kitten",
                    "kittens",

                    "dog",
                    "dogs",
                    "puppy",
                    "puppies",

                    "pet",
                    "pets",

                    "animal",
                    "animals",

                    "wildlife"

                ],


                underrated: [

                    "underrated",
                    "overlooked",

                    "little known",
                    "little-known",

                    "hidden gem",
                    "hidden gems",

                    "unknown",
                    "forgotten",

                    "under the radar",
                    "off the radar",

                    "lesser known",
                    "lesser-known",

                    "unsung",
                    "unsung hero",

                    "overlooked destination",
                    "overlooked place",
                    "overlooked artist",
                    "overlooked game"

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
             * Second page.
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


                    result.nextPage =
                        secondPage.nextPage ||
                        null;


                } catch (pageError) {

                    console.error(
                        `${category} second page error:`,
                        pageError
                    );

                }

            }


            /*
             * Third page.
             */

            if (
                result.nextPage
            ) {

                try {

                    const thirdPage =
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
                        ...thirdPage.articles
                    );


                    result.nextPage =
                        thirdPage.nextPage ||
                        null;


                } catch (pageError) {

                    console.error(
                        `${category} third page error:`,
                        pageError
                    );

                }

            }


            /*
             * Fourth page.
             *
             * Special categories can
             * need additional results
             * because relevance filtering
             * removes some articles.
             */

            if (
                result.nextPage
            ) {

                try {

                    const fourthPage =
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
                        ...fourthPage.articles
                    );


                } catch (pageError) {

                    console.error(
                        `${category} fourth page error:`,
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
             *
             * Standard NewsData categories
             * are already category-filtered.
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
