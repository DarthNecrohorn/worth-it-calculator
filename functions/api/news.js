import { recordAdminApiUsage } from "../lib/admin-usage.js";

export async function onRequestGet(context) {

    const apiKey =
        context.env.NEWSDATA_API_KEY;


    const db =
        context.env.DB;


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


    if (!db) {

        return Response.json(
            {
                error:
                    "D1 database binding DB is not configured."
            },
            {
                status: 500
            }
        );

    }


    /* =========================================================
       CACHE
    ========================================================= */

    /*
     * 4 hours.
     *
     * NewsData is only contacted when the Cloudflare
     * cache expires.
     */

    const CACHE_TTL =
        4 * 60 * 60;


    const cache =
        caches.default;


    /*
     * v10 = optimized NewsData usage.
     *
     * Only one NewsData request is made per category.
     */

    const requestUrl =
        new URL(
            context.request.url
        );


    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v10`;


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
        category: "world",
        q: "international global countries diplomacy geopolitics world events"
    },

    technology: {
        category: "technology",
        q: "technology tech software hardware internet smartphones computers innovation AI artificial intelligence"
    },

    business: {
        category: "business",
        q: "business companies economy markets finance stocks investment trade industry startups"
    },

    science: {
        category: "science",
        q: "science research discoveries space physics biology chemistry astronomy technology experiments"
    },

    sports: {
        category: "sports",
        q: "sports football soccer basketball tennis baseball athletics motorsport championships tournaments"
    },

    travel: {
        category: "tourism",
        q: "travel tourism destinations hotels flights airlines vacation holidays tourism attractions"
    },

    entertainment: {
        category: "entertainment",
        q: "entertainment movies films music celebrities television streaming actors awards concerts"
    },

    lifestyle: {
        category: "lifestyle",
        q: "lifestyle wellness fashion relationships home personal life trends culture leisure"
    },

    health: {
        category: "health",
        q: "health medicine medical healthcare diseases treatments doctors hospitals nutrition wellness"
    },

    environment: {
        category: "environment",
        q: "environment climate nature pollution conservation biodiversity sustainability renewable energy"
    },

    food: {
        category: "food",
        q: "food cooking recipes restaurants cuisine nutrition ingredients chefs dining food industry"
    },

    education: {
        category: "education",
        q: "education schools universities colleges students teachers learning academic research training"
    }
};
    
    try {


        /* =====================================================
           FETCH NEWS
        ===================================================== */

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


            recordAdminApiUsage(context, {
                apiKey: "news",
                provider: "NewsData.io"
            });

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
                        : []

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
                    wordsB.has(
                        word
                    )
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
                    "gamer",
                    "gamers",

                    "video game",
                    "video games",
                    "videogame",

                    "gameplay",

                    "playstation",
                    "xbox",
                    "nintendo",
                    "nintendo switch",

                    "steam",
                    "pc gaming",

                    "esports",

                    "ps5",
                    "ps4",
                    "xbox series",
                    "switch",

                    "console",
                    "consoles",

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
                    "mystery",

                    "unexpected",
                    "unbelievable",
                    "unexplained",

                    "rare",

                    "strange event",
                    "unusual event",

                    "strange discovery",
                    "unusual discovery",

                    "rare discovery",
                    "unexpected discovery"

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

                    "help",
                    "helping",
                    "helped",
                    "helps",

                    "rescue",
                    "rescued",
                    "rescuing",

                    "saving",
                    "saved",
                    "saves",

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

                    "volunteer",
                    "volunteers",
                    "volunteering",

                    "donation",
                    "donations",
                    "donated",

                    "charity",
                    "charities",

                    "reunited",
                    "reunion",

                    "adoption",
                    "adopted",
                    "shelter",

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
                    "under-the-radar",

                    "off the radar",

                    "lesser known",
                    "lesser-known",

                    "unsung",
                    "unsung hero",

                    "obscure",

                    "rarely known",
                    "rarely visited",

                    "overlooked destination",
                    "overlooked place",
                    "overlooked artist",
                    "overlooked game",

                    "hidden destination",
                    "hidden place"

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
           LOAD CATEGORY FROM NEWSDATA
        ===================================================== */

        async function loadCategory(
            category,
            settings
        ) {

            /*
             * IMPORTANT:
             *
             * Only ONE NewsData request per category.
             *
             * Previously this function could request up to
             * four pages, which greatly increased API usage.
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
                Array.isArray(
                    result.articles
                )
                    ? result.articles
                    : [];


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
             * Return the complete result of the
             * single NewsData request.
             *
             * D1 will merge these with the existing
             * persistent article history.
             */

            return formatArticles(
                articles
            );

        }


        /* =====================================================
           REMOVE DUPLICATES FROM FORMATTED ARTICLES
        ===================================================== */

        function removeDuplicateFormattedArticles(
            articles
        ) {

            const uniqueArticles =
                [];


            const seenUrls =
                new Set();


            const seenTitles =
                [];


            for (
                const article
                of articles
            ) {

                const articleUrl =
                    String(
                        article.url || ""
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
           PERSISTENT NEWS HISTORY
        ===================================================== */

        async function persistCategory(
            category,
            freshArticles
        ) {

            /*
             * Get the current persistent
             * history for this category.
             */

            const existingResult =
                await db
                    .prepare(
                        `
                        SELECT
                            category,
                            url,
                            title,
                            description,
                            image,
                            published_at,
                            source,
                            added_at
                        FROM news_articles
                        WHERE category = ?
                        ORDER BY added_at DESC
                        LIMIT 12
                        `
                    )
                    .bind(
                        category
                    )
                    .all();


            const existingRows =
                Array.isArray(
                    existingResult.results
                )
                    ? existingResult.results
                    : [];


            /*
             * Convert D1 rows to the same
             * frontend article structure.
             */

            const existingArticles =
                existingRows.map(
                    row => ({

                        title:
                            row.title ||
                            "",

                        description:
                            row.description ||
                            "",

                        url:
                            row.url ||
                            "",

                        image:
                            row.image ||
                            "",

                        publishedAt:
                            row.published_at ||
                            "",

                        source:
                            row.source ||
                            ""

                    })
                );


            /*
             * Fresh articles first.
             *
             * Existing articles follow.
             *
             * Therefore new discoveries are
             * always considered before old ones.
             */

            const merged =
                removeDuplicateFormattedArticles(
                    [
                        ...freshArticles,
                        ...existingArticles
                    ]
                );


            /*
             * Only the newest 12 survive.
             */

            const finalArticles =
                merged.slice(
                    0,
                    12
                );


            /*
             * Existing URLs.
             *
             * Existing articles must keep
             * their original added_at value.
             */

            const existingUrls =
                new Set(
                    existingRows
                        .map(
                            row =>
                                String(
                                    row.url || ""
                                )
                                    .trim()
                                    .toLowerCase()
                        )
                        .filter(
                            Boolean
                        )
                );


            /* =================================================
               INSERT NEW ARTICLES
            ================================================= */

            const statements =
                [];


            const now =
                Date.now();


            let newArticleIndex =
                0;


            for (
                const article
                of finalArticles
            ) {

                const articleUrl =
                    String(
                        article.url || ""
                    )
                        .trim();


                if (!articleUrl) {

                    continue;

                }


                const normalizedUrl =
                    articleUrl.toLowerCase();


                /*
                 * Existing article:
                 *
                 * do not insert again.
                 * Its original added_at
                 * remains unchanged.
                 */

                if (
                    existingUrls.has(
                        normalizedUrl
                    )
                ) {

                    continue;

                }


                statements.push(
                    db
                        .prepare(
                            `
                            INSERT OR IGNORE INTO news_articles
                            (
                                category,
                                url,
                                title,
                                description,
                                image,
                                published_at,
                                source,
                                added_at
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `
                        )
                        .bind(
                            category,
                            articleUrl,
                            article.title || "",
                            article.description || "",
                            article.image || "",
                            article.publishedAt || "",
                            article.source || "",
                            now - newArticleIndex++
                        )
                );

            }


            /*
             * Execute inserts.
             */

            if (
                statements.length
            ) {

                await db.batch(
                    statements
                );

            }


            /* =================================================
               REMOVE ARTICLES OUTSIDE NEWEST 12
            ================================================= */

            await db
                .prepare(
                    `
                    DELETE FROM news_articles
                    WHERE category = ?
                    AND url NOT IN (
                        SELECT url
                        FROM news_articles
                        WHERE category = ?
                        ORDER BY added_at DESC
                        LIMIT 12
                    )
                    `
                )
                .bind(
                    category,
                    category
                )
                .run();


            /* =================================================
               READ FINAL PERSISTENT STATE
            ================================================= */

            const finalResult =
                await db
                    .prepare(
                        `
                        SELECT
                            title,
                            description,
                            url,
                            image,
                            published_at,
                            source
                        FROM news_articles
                        WHERE category = ?
                        ORDER BY added_at DESC
                        LIMIT 12
                        `
                    )
                    .bind(
                        category
                    )
                    .all();


            const finalRows =
                Array.isArray(
                    finalResult.results
                )
                    ? finalResult.results
                    : [];


            return finalRows.map(
                row => ({

                    title:
                        row.title ||
                        "",

                    description:
                        row.description ||
                        "",

                    url:
                        row.url ||
                        "",

                    image:
                        row.image ||
                        "",

                    publishedAt:
                        row.published_at ||
                        "",

                    source:
                        row.source ||
                        ""

                })
            );

        }


        /* =====================================================
           LOAD + PERSIST ALL CATEGORIES
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

                            /*
                             * Fetch newly discovered
                             * articles from NewsData.
                             *
                             * Exactly ONE API request
                             * for this category.
                             */

                            const freshArticles =
                                await loadCategory(
                                    category,
                                    settings
                                );


                            /*
                             * Merge with persistent
                             * D1 history.
                             */

                            const articles =
                                await persistCategory(
                                    category,
                                    freshArticles
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


                            /*
                             * If NewsData fails,
                             * return existing D1 history.
                             */

                            try {

                                const fallbackResult =
                                    await db
                                        .prepare(
                                            `
                                            SELECT
                                                title,
                                                description,
                                                url,
                                                image,
                                                published_at,
                                                source
                                            FROM news_articles
                                            WHERE category = ?
                                            ORDER BY added_at DESC
                                            LIMIT 12
                                            `
                                        )
                                        .bind(
                                            category
                                        )
                                        .all();


                                const fallbackRows =
                                    Array.isArray(
                                        fallbackResult.results
                                    )
                                        ? fallbackResult.results
                                        : [];


                                return [
                                    category,
                                    fallbackRows.map(
                                        row => ({

                                            title:
                                                row.title ||
                                                "",

                                            description:
                                                row.description ||
                                                "",

                                            url:
                                                row.url ||
                                                "",

                                            image:
                                                row.image ||
                                                "",

                                            publishedAt:
                                                row.published_at ||
                                                "",

                                            source:
                                                row.source ||
                                                ""

                                        })
                                    )
                                ];

                            } catch (
                                fallbackError
                            ) {

                                console.error(
                                    `${category} D1 fallback error:`,
                                    fallbackError
                                );


                                return [
                                    category,
                                    []
                                ];

                            }

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
