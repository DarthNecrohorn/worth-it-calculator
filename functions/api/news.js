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

    const CACHE_TTL =
        2 * 60 * 60;


    const cache =
        caches.default;


    /*
     * v8 = persistent D1 News history.
     */

    const requestUrl =
        new URL(
            context.request.url
        );


    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v8`;


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
                "(gaming OR gamer OR gamers OR \"video game\" OR \"video games\" OR videogame OR gameplay OR PlayStation OR Xbox OR Nintendo OR \"Nintendo Switch\" OR Steam OR \"PC gaming\" OR esports OR PS5 OR PS4 OR \"Xbox Series\" OR Switch OR console OR consoles OR \"game developer\" OR \"game studio\" OR \"game release\" OR \"new game\" OR RPG OR Fortnite OR Minecraft OR Roblox OR GTA)"

        },


        weird: {

            q:
                "(weird OR strange OR bizarre OR unusual OR odd OR peculiar OR mysterious OR unexpected OR unbelievable OR unexplained OR rare OR mystery OR \"strange event\" OR \"unusual event\" OR \"strange discovery\" OR \"unusual discovery\" OR \"rare discovery\" OR \"unexpected discovery\")"

        },


        awesome: {

            q:
                "(cute OR adorable OR heartwarming OR \"heart-warming\" OR wholesome OR uplifting OR inspiring OR kindness OR \"kind act\" OR \"acts of kindness\" OR \"good deed\" OR \"good deeds\" OR helping OR helped OR help OR rescue OR rescued OR rescuing OR saving OR saved OR saves OR \"good news\" OR \"feel good\" OR \"feel-good\" OR \"happy ending\" OR \"happy story\" OR \"positive story\" OR \"positive news\" OR \"human kindness\" OR \"local hero\" OR hero OR heroes OR volunteer OR volunteers OR volunteering OR donation OR donations OR donated OR charity OR charities OR reunited OR reunion OR adoption OR adopted OR shelter OR animal OR animals OR wildlife OR cat OR cats OR kitten OR kittens OR dog OR dogs OR puppy OR puppies OR pet OR pets)"

        },


        underrated: {

            q:
                "(underrated OR overlooked OR \"little known\" OR \"little-known\" OR \"hidden gem\" OR \"hidden gems\" OR unknown OR forgotten OR \"under the radar\" OR \"under-the-radar\" OR \"off the radar\" OR \"lesser known\" OR \"lesser-known\" OR unsung OR \"unsung hero\" OR obscure OR \"rarely known\" OR \"rarely visited\" OR \"overlooked destination\" OR \"overlooked place\" OR \"overlooked artist\" OR \"overlooked game\" OR \"hidden destination\" OR \"hidden place\")"

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
             * IMPORTANT:
             *
             * Do NOT slice to 12 here.
             *
             * D1 must receive all newly
             * discovered relevant articles.
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
