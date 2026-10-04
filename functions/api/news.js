import { recordAdminApiUsage } from "../lib/admin-usage.js";

function normalizeNewsImageUrl(value) {

    return String(
        value || ""
    )
        .trim()
        .replace(
            /^http:\/\//i,
            "https://"
        );

}

export async function onRequestGet(context) {

    const db =
        context.env.DB;


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
     * Open Newswire is only contacted when the Cloudflare
     * cache expires.
     */

    const CACHE_TTL =
        4 * 60 * 60;


    const cache =
        caches.default;


    /*
     * v13 = Open Newswire multi-query source with a fresh cache namespace.
     *
     * Multiple focused Open Newswire requests may be merged per category.
     */

    const requestUrl =
        new URL(
            context.request.url
        );


    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v20`;


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
        queries: ["world", "international", "government"]
    },

    technology: {
        queries: ["technology", "software", "artificial intelligence"]
    },

    business: {
        queries: ["business", "economy", "markets"]
    },

    science: {
        queries: ["science", "research", "space"]
    },

    sports: {
        queries: ["sports", "football", "basketball"]
    },

    travel: {
        queries: ["travel", "tourism", "airline", "airport", "hotel", "destination", "cruise", "hospitality"]
    },

    entertainment: {
        queries: ["entertainment", "movies", "music", "celebrity"]
    },

    lifestyle: {
        queries: ["lifestyle", "fashion", "beauty"]
    },

    health: {
        queries: ["health", "medical", "medicine"]
    },

    environment: {
        queries: ["environment", "climate", "wildlife"]
    },

    food: {
        queries: ["food", "restaurant", "cooking"]
    },

    education: {
        queries: ["education", "school", "university"]
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

            const queries =
                Array.isArray(
                    params?.queries
                )
                    ? params.queries
                    : (
                        params?.q
                            ? [params.q]
                            : []
                    );

            if (!queries.length) {

                return {
                    articles: []
                };

            }


            async function fetchQuery(
                query
            ) {

                const url =
                    new URL(
                        "https://feed.opennewswire.org/api/articles"
                    );


                url.searchParams.set(
                    "languages",
                    "en"
                );


                url.searchParams.set(
                    "size",
                    "60"
                );


                url.searchParams.set(
                    "search",
                    query
                );


                recordAdminApiUsage(context, {
                    apiKey: "news",
                    provider: "Open Newswire"
                });


                const response =
                    await fetch(
                        url.toString(),
                        {
                            headers: {
                                "User-Agent":
                                    "Worth-It-News/1.1"
                            }
                        }
                    );


                const rawText =
                    await response.text();


                let data;

                try {

                    data =
                        JSON.parse(
                            rawText
                        );

                } catch (error) {

                    throw new Error(
                        `Open Newswire returned invalid JSON for ${category}/${query}`
                    );

                }


                if (!response.ok) {

                    throw new Error(
                        `${category}/${query} request failed: ${response.status}`
                    );

                }


                return Array.isArray(
                    data?.results
                )
                    ? data.results
                    : [];

            }


            const settled =
                await Promise.allSettled(
                    queries.map(
                        query =>
                            fetchQuery(
                                query
                            )
                    )
                );


            const successfulResults =
                [];

            const errors =
                [];


            settled.forEach(
                (
                    result,
                    index
                ) => {

                    if (
                        result.status === "fulfilled"
                    ) {

                        successfulResults.push(
                            ...result.value
                        );

                    } else {

                        errors.push(
                            {
                                query:
                                    queries[index],

                                error:
                                    result.reason instanceof Error
                                        ? result.reason.message
                                        : String(
                                            result.reason
                                        )
                            }
                        );

                    }

                }
            );


            if (
                !successfulResults.length &&
                errors.length
            ) {

                throw new Error(
                    errors
                        .map(
                            error =>
                                error.error
                        )
                        .join(
                            " | "
                        )
                );

            }


            function cleanText(
                value
            ) {

                return String(
                    value || ""
                )
                    .replace(
                        /<[^>]*>/g,
                        " "
                    )
                    .replace(
                        /&amp;/gi,
                        "&"
                    )
                    .replace(
                        /&quot;/gi,
                        '"'
                    )
                    .replace(
                        /&#39;/gi,
                        "'"
                    )
                    .replace(
                        /&lt;/gi,
                        "<"
                    )
                    .replace(
                        /&gt;/gi,
                        ">"
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            }


            function isAllowedCommercialLicense(
                article
            ) {

                const license =
                    article?.feed?.license || {};

                const name =
                    cleanText(
                        license.name || ""
                    ).toLowerCase();

                const slug =
                    cleanText(
                        license.slug || ""
                    ).toLowerCase();

                if (
                    slug.includes("nc") ||
                    name.includes("non-commercial") ||
                    name.includes("noncommercial")
                ) {

                    return false;

                }

                if (
                    slug.includes("public-domain") ||
                    slug === "cc0" ||
                    name.includes("public domain") ||
                    name.includes("cc0")
                ) {

                    return true;

                }

                if (
                    slug.includes("by") ||
                    name.includes("creative commons") ||
                    name.includes("attribution")
                ) {

                    return true;

                }

                return false;

            }


            const articles =
                successfulResults
                    .filter(
                        isAllowedCommercialLicense
                    )
                    .map(
                        article => {

                            const feed =
                                article?.feed || {};

                            const license =
                                feed.license || {};

                            const content =
                                cleanText(
                                    article?.content || ""
                                );

                            return {

                                title:
                                    cleanText(
                                        article?.title || ""
                                    ),

                                description:
                                    content.slice(
                                        0,
                                        600
                                    ),

                                link:
                                    cleanText(
                                        article?.link || ""
                                    ),

                                image_url:
                                    "",

                                pubDate:
                                    article?.date || "",

                                source_name:
                                    cleanText(
                                        feed.title || ""
                                    ),

                                license:
                                    cleanText(
                                        license.name ||
                                        license.slug ||
                                        ""
                                    ),

                                licenseUrl:
                                    cleanText(
                                        feed.licenseUrl || ""
                                    )

                            };

                        }
                    )
                    .filter(
                        article =>
                            article.title &&
                            article.link
                    );


            return {
                articles
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


        function getPrimaryNewsCategory(
            article
        ) {

            const title = String(article?.title || "").toLowerCase();
            const description = String(article?.description || "").toLowerCase();
            const text = title + " " + description;

            const rules = {
                world: ["war","conflict","ceasefire","diplomacy","diplomatic","election","president","prime minister","foreign minister","parliament","government","sanctions","treaty","geopolit","protest","coup","military","border dispute","international","congress","senate","political","policy","campaign","candidate","ballot","voters","congressional race","congressional district","midterm","lawmaker","governor","minister","legislation","referendum"],
                technology: ["technology","tech","software","artificial intelligence","ai","cybersecurity","cyber attack","chip","chips","semiconductor","robot","robotics","smartphone","computer","internet","app","cloud computing","data center","quantum computing","biometric","digital platform","machine learning","programming","developer"],
                business: ["business","economy","economic","markets","market","stocks","shares","finance","financial","investment","investors","company","companies","merger","acquisition","trade","tariff","bank","banking","jobs","employment","inflation","interest rates","earnings","revenue","industry","corporate","manufacturing","fuel economy","tax"],
                science: ["science","scientist","scientists","research","researchers","study","discovery","discovered","experiment","astronomy","planet","galaxy","space mission","nasa","biology","genetics","physics","chemistry","species","ecosystem","laboratory","clinical trial","scientific"],
                sports: ["sports","sport","football","soccer","basketball","baseball","tennis","cricket","rugby","hockey","golf","boxing","formula 1","grand prix","fifa","uefa","nfl","nba","nhl","mlb","championship","tournament","league","playoffs","world cup","athlete","coach","transfer","match","season","games","game"],
                travel: ["tourism","tourist","travel industry","travel advisory","travel warning","airline","airport","flight","hotel","resort","destination","cruise","vacation","holiday","hospitality","tour operator","travel disruption","travel restrictions","visa","traveler","travellers","lodging","passenger"],
                entertainment: ["entertainment","movie","movies","film","films","cinema","music","concert","singer","album","actor","actress","celebrity","director","hollywood","television","tv series","streaming","festival","box office","premiere","performance","artist","show"],
                lifestyle: ["lifestyle","fashion","wellness","beauty","skincare","makeup","cosmetics","relationships","dating","home decor","interior design","home improvement","fitness","parenting","family life","personal style","self-care","hobbies","leisure","personal finance","shopping","consumer trends"],
                health: ["health","healthcare","health care","medical","medicine","disease","illness","hospital","doctor","doctors","patient","patients","vaccine","vaccination","virus","infection","outbreak","treatment","therapy","diagnosis","mental health","public health","clinical","pregnant","pregnancy","medication","symptoms","ptsd","post-traumatic stress","trauma","weight loss","weight-loss","diet drinks","prenatal","adhd"],
                environment: ["environment","climate change","global warming","greenhouse gas","emissions","pollution","wildfire","drought","flood","storm surge","permafrost","conservation","biodiversity","renewable energy","clean energy","ecosystem","wetland","ocean warming","deforestation","wildlife","habitat","carbon","sustainability","endangered species","food waste"],
                food: ["food","restaurant","cooking","recipe","chef","cuisine","meal","dish","grocery","supermarket","food safety","food prices","ingredients","bakery","coffee","wine","beer","dining","kitchen","menu","appetite","flavor"],
                education: ["education","school","schools","university","universities","college","colleges","student","students","teacher","teachers","classroom","curriculum","literacy","scholarship","campus","academic","school district","higher education","learning","lesson","degree","faculty"]
            };

            let bestCategory = "";
            let bestScore = 0;
            let bestTitleScore = 0;

            for (const [category, terms] of Object.entries(rules)) {

                let titleScore = 0;
                let bodyScore = 0;

                for (const term of terms) {
                    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const pattern = new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i");
                    if (pattern.test(title)) titleScore += 1;
                    if (pattern.test(text)) bodyScore += 1;
                }

                const score = (titleScore * 8) + (bodyScore * 2);

                if (score > bestScore || (score === bestScore && titleScore > bestTitleScore)) {
                    bestCategory = category;
                    bestScore = score;
                    bestTitleScore = titleScore;
                }
            }

            /*
             * Topic-specific headline overrides for common cross-category
             * collisions observed in Open Newswire.
             */
            if (
                title.includes("environmental") ||
                title.includes("river cleanup") ||
                title.includes("power plant emissions") ||
                title.includes("fossil fuel companies")
            ) {
                return "environment";
            }

            if (
                title.includes("hybrid aggression") ||
                title.includes("hybrid warfare") ||
                title.includes("cyberattacks")
            ) {
                return "world";
            }

            if (
                title.includes("vaccinated") &&
                (
                    title.includes("lion") ||
                    title.includes("tamarin") ||
                    title.includes("wildlife") ||
                    title.includes("animal")
                )
            ) {
                return "environment";
            }

            if (
                title.includes("testosterone") &&
                (
                    text.includes("menopause") ||
                    text.includes("symptoms") ||
                    text.includes("women")
                )
            ) {
                return "health";
            }

            if (
                title.includes("study") &&
                (
                    title.includes("diet drinks") ||
                    title.includes("weight loss")
                )
            ) {
                return "health";
            }

            /*
             * Lifestyle headline anchors.
             * Keep clear lifestyle stories out of broader categories.
             */
            if (
                title.includes("fashion") ||
                title.includes("beauty") ||
                title.includes("skincare") ||
                title.includes("makeup") ||
                title.includes("cosmetics") ||
                title.includes("personal style") ||
                title.includes("home decor") ||
                title.includes("interior design") ||
                title.includes("relationships") ||
                title.includes("dating") ||
                title.includes("parenting") ||
                title.includes("self-care") ||
                title.includes("hobbies") ||
                title.includes("leisure")
            ) {
                return "lifestyle";
            }

            /*
             * Specific topic overrides for remaining live-feed collisions.
             */
            if (title.includes("mangrove")) {
                return "environment";
            }

            if (
                title.includes("isle royale") &&
                title.includes("wolf")
            ) {
                return "environment";
            }

            if (
                title.includes("pileup") ||
                title.includes("vehicle pileup")
            ) {
                return "world";
            }


            const titleHas = terms =>
                terms.some(
                    term =>
                        title.includes(term)
                );

            const textHas = terms =>
                terms.some(
                    term =>
                        text.includes(term)
                );

            /*
             * Hard headline anchors. These stop generic terms such as
             * "study", "food", or "director" from overriding the real topic.
             */
            if (
                titleHas([
                    "election",
                    "campaign",
                    "candidate",
                    "ballot",
                    "voters",
                    "congressional race",
                    "congressional district",
                    "midterm",
                    "referendum"
                ])
            ) {
                return "world";
            }

            if (
                titleHas([
                    "greenhouse gas",
                    "greenhouse gases",
                    "climate change",
                    "global warming",
                    "emissions",
                    "permafrost",
                    "wildfire",
                    "conservation",
                    "biodiversity",
                    "endangered species",
                    "wildlife",
                    "habitat",
                    "renewable energy"
                ])
            ) {
                return "environment";
            }

            if (
                titleHas([
                    "ptsd",
                    "post-traumatic stress",
                    "mental health",
                    "vaccination",
                    "vaccine",
                    "pregnancy",
                    "pregnant",
                    "adhd",
                    "weight loss",
                    "weight-loss",
                    "prenatal",
                    "medical",
                    "medicine",
                    "health",
                    "healthcare",
                    "disease",
                    "hospital"
                ])
            ) {
                return "health";
            }

            if (
                titleHas([
                    "artificial intelligence",
                    "cybersecurity",
                    "cyber attack",
                    "software",
                    "semiconductor",
                    "biometric",
                    "data center",
                    "robotics",
                    "smartphone"
                ])
            ) {
                return "technology";
            }

            /*
             * A political story that only scored as Business because words
             * such as economy/manufacturing appeared in the description.
             */
            if (
                bestCategory === "business" &&
                !titleHas([
                    "business","economy","economic","markets","market","stocks",
                    "shares","finance","financial","investment","investors",
                    "company","companies","merger","acquisition","trade","tariff",
                    "bank","banking","jobs","employment","inflation","interest rates",
                    "earnings","revenue","industry","corporate","manufacturing",
                    "fuel economy","tax"
                ]) &&
                textHas([
                    "president","prime minister","governor","senator","lawmaker",
                    "parliament","congress","political","campaign","candidate"
                ])
            ) {
                return "world";
            }

            /*
             * Food insecurity/aid/crisis is World news rather than a food story.
             */
            if (
                bestCategory === "food" &&
                (
                    text.includes("food insecurity") ||
                    text.includes("food security crisis") ||
                    text.includes("food crisis") ||
                    text.includes("food aid") ||
                    text.includes("food assistance")
                ) &&
                !titleHas([
                    "restaurant","cooking","recipe","chef","cuisine","meal","dish",
                    "grocery","supermarket","bakery","coffee","beer","dining"
                ])
            ) {
                return "world";
            }

            /*
             * Food waste articles about emissions/climate belong to Environment.
             */
            if (
                bestCategory === "food" &&
                text.includes("food waste") &&
                textHas([
                    "greenhouse gas",
                    "greenhouse gases",
                    "emissions",
                    "climate change",
                    "global warming",
                    "methane",
                    "carbon"
                ])
            ) {
                return "environment";
            }

            /*
             * Conservation/ecology and medical stories should not be pulled
             * into Science merely because the headline says "study".
             */
            if (
                bestCategory === "science" &&
                titleHas([
                    "endangered species",
                    "wildlife",
                    "habitat",
                    "conservation",
                    "biodiversity",
                    "ecosystem",
                    "permafrost",
                    "emissions",
                    "climate change"
                ])
            ) {
                return "environment";
            }

            if (
                bestCategory === "science" &&
                titleHas([
                    "ptsd",
                    "mental health",
                    "pregnancy",
                    "pregnant",
                    "adhd",
                    "vaccine",
                    "vaccination",
                    "weight loss",
                    "medical",
                    "medicine",
                    "health",
                    "disease",
                    "hospital",
                    "doctor",
                    "trauma"
                ])
            ) {
                return "health";
            }

            return bestScore >= 4 ? bestCategory : "";

        }


        function isRelevantNewsCategory(
            article,
            category
        ) {

            if (category === "travel") {
                return getPrimaryNewsCategory(article) === "travel" && isRelevantTravelArticle(article);
            }

            return getPrimaryNewsCategory(article) === category;

        }

        function isRelevantTravelArticle(
            article
        ) {

            const title =
                String(
                    article?.title || ""
                ).toLowerCase();

            const description =
                String(
                    article?.description || ""
                ).toLowerCase();

            const text =
                `${title} ${description}`;

            const strongTerms = [
                "tourism",
                "tourist",
                "travel industry",
                "travel advisory",
                "travel warning",
                "airline",
                "airport",
                "flight",
                "hotel",
                "resort",
                "destination",
                "cruise",
                "vacation",
                "holiday",
                "hospitality",
                "tour operator",
                "travel disruption",
                "travel restrictions"
            ];

            const secondaryTerms = [
                "traveler",
                "travellers",
                "travellers",
                "visa",
                "border",
                "lodging",
                "passenger",
                "tourism sector",
                "visitor"
            ];

            const falsePositivePatterns = [
                "space travel",
                "space traveler",
                "space traveller",
                "nasa",
                "astronaut",
                "airport sabotage",
                "airport parking",
                "airport attack",
                "airport incident",
                "detained at airport",
                "arrested at airport",
                "political researcher",
                "undocumented migrants",
                "refugees",
                "legal status",
                "migration policy",
                "child abduction",
                "traveled to",
                "travelled to",
                "travels to",
                "travels from",
                "traveling to",
                "travelling to",
                "traveling from",
                "travelling from"
            ];

            if (
                falsePositivePatterns.some(
                    pattern =>
                        title.includes(pattern)
                )
            ) {

                return false;

            }

            const strongHits =
                strongTerms.filter(
                    term =>
                        title.includes(term) ||
                        description.includes(term)
                ).length;

            const secondaryHits =
                secondaryTerms.filter(
                    term =>
                        title.includes(term) ||
                        description.includes(term)
                ).length;

            const commercialTravelTerms = [
                "inn",
                "inns",
                "lodging",
                "hotel",
                "resort",
                "tour operator",
                "hospitality",
                "tourism sector",
                "airline",
                "cruise",
                "vacation",
                "destination"
            ];

            const commercialTravelHits =
                commercialTravelTerms.filter(
                    term =>
                        title.includes(term) ||
                        description.includes(term)
                ).length;

            if (strongHits >= 1) {
                return true;
            }

            return (
                secondaryHits >= 1 &&
                (
                    title.includes("travel") ||
                    description.includes("travel") ||
                    title.includes("tourism") ||
                    description.includes("tourism") ||
                    title.includes("visa") ||
                    description.includes("visa")
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
                        String(
                            article.image_url ||
                            ""
                        ).replace(
                            /^http:\/\//i,
                            "https://"
                        ),

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
           NEWS QUALITY + FRESHNESS
        ===================================================== */

        const NEWS_MAX_AGE_MS =
            96 * 60 * 60 * 1000;

        function articleAgeMs(article) {
            const publishedAt = Date.parse(
                article.publishedAt || article.pubDate || ""
            );
            if (!Number.isFinite(publishedAt)) return 0;
            return Math.max(0, Date.now() - publishedAt);
        }

        function newsQualityScore(article, category) {
            const title = String(article.title || "").trim();
            const description = String(article.description || "").trim();
            const text = (title + " " + description).toLowerCase();
            let score = 50;

            const age = articleAgeMs(article);
            if (age > 0) {
                const hours = age / 3600000;
                if (hours <= 6) score += 28;
                else if (hours <= 24) score += 22;
                else if (hours <= 48) score += 12;
                else if (hours <= 96) score += 3;
                else score -= 30;
            }

            const timelyTerms = [
                "today", "tonight", "latest", "new", "announces",
                "announced", "launches", "launched", "reports",
                "reported", "confirms", "confirmed", "reveals",
                "revealed", "after", "amid", "following", "breaking"
            ];
            score += timelyTerms.reduce((total, term) =>
                total + (text.includes(term) ? 2 : 0), 0);

            const titleWords = title.split(/\s+/).filter(Boolean);
            if (titleWords.length >= 6 && titleWords.length <= 22) score += 8;
            if (titleWords.length < 4) score -= 12;

            const lowValuePatterns = [
                /\bpress release\b/, /\bpress releases\b/, /\bpr newswire\b/,
                /\bgrant (awarded|received|funding)\b/, /\bawarded .*grant\b/,
                /\breceives? \$[\d,.]+[km]?\b/, /\bpartners? with\b/,
                /\bpartnership\b/, /\bstrategic review\b/, /\bappointed interim\b/,
                /\bchief business officer\b/, /\bproven track record\b/,
                /\blong-standing staff\b/, /\bhighlights .* track record\b/,
                /\bwhat sets .* apart\b/, /\bworth a pilot\b/,
                /\bseek(s|ing) .* ideas\b/, /\bdrives? tourist spending\b/,
                /\bmichelin guide recommendations\b/, /\bphoto gallery\b/,
                /\bscoreboard\b/, /\bhigh school .* (wins|upsets|defeats)\b/,
                /\bunder 21 world championship\b/, /\bcar auction\b/,
                /\bat no reserve\b/, /\bdeferred share units\b/,
                /\bstatic gradient survey\b/
            ];
            if (lowValuePatterns.some(pattern => pattern.test(text))) score -= 45;

            const promotionalPatterns = [
                /\b(unmissable|must-see|dream|best in|leading .* center|families weigh)\b/,
                /\b(book now|shop now|learn more)\b/, /\btop \d+\b/,
                /\bhow to .* (save|choose|buy)\b/
            ];
            if (promotionalPatterns.some(pattern => pattern.test(text))) score -= 25;

            const eventTerms = [
                "war", "attack", "crash", "fire", "wildfire", "earthquake",
                "storm", "flood", "election", "government", "president",
                "minister", "sanctions", "tariff", "agreement", "deal",
                "investigation", "court", "law", "ai", "artificial intelligence",
                "space", "nasa", "discovery", "researchers", "scientists",
                "championship", "final", "tournament", "airline", "airport"
            ];
            score += eventTerms.reduce((total, term) =>
                total + (text.includes(term) ? 2 : 0), 0);

            const categoryTerms = {
                world: ["war", "conflict", "election", "diplomacy", "sanctions", "ceasefire", "president", "prime minister", "government", "protest"],
                technology: ["ai", "artificial intelligence", "chip", "robot", "cybersecurity", "software", "smartphone", "space", "data center"],
                business: ["markets", "stocks", "economy", "tariff", "trade", "merger", "acquisition", "investment", "jobs", "interest rates"],
                science: ["discovery", "research", "scientists", "space", "nasa", "planet", "astronomy", "climate", "study"],
                sports: ["final", "championship", "tournament", "record", "transfer", "league", "grand prix", "playoffs"],
                travel: ["airline", "airport", "flight", "border", "visa", "destination", "travel warning"],
                entertainment: ["film", "movie", "music", "concert", "actor", "actress", "album", "festival", "award"],
                health: ["disease", "treatment", "drug", "hospital", "doctors", "study", "outbreak", "vaccine"],
                environment: ["climate", "wildfire", "flood", "storm", "pollution", "emissions", "conservation", "renewable"]
            };
            score += (categoryTerms[category] || []).reduce((total, term) =>
                total + (text.includes(term) ? 3 : 0), 0);
            return score;
        }

        function rankNewsArticles(articles, category) {
            return articles
                .filter(article => {
                    const age = articleAgeMs(article);
                    return !age || age <= NEWS_MAX_AGE_MS;
                })
                .map((article, index) => ({
                    article,
                    index,
                    score: newsQualityScore(article, category)
                }))
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    const dateA = Date.parse(a.article.publishedAt || a.article.pubDate || "") || 0;
                    const dateB = Date.parse(b.article.publishedAt || b.article.pubDate || "") || 0;
                    if (dateB !== dateA) return dateB - dateA;
                    return a.index - b.index;
                })
                .map(item => item.article);
        }

        /* =====================================================
           LOAD CATEGORY FROM OPEN NEWSWIRE
        ===================================================== */

        async function loadCategory(
            category,
            settings
        ) {

            /*
             * IMPORTANT:
             *
             * Only ONE Open Newswire request per category.
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
                            settings.q,

                        queries:
                            settings.queries
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


            articles =
                articles.filter(
                    article =>
                        isRelevantNewsCategory(
                            article,
                            category
                        )
                );

            if (category === "travel") {

                articles =
                    articles.filter(
                        article =>
                            isRelevantTravelArticle(
                                article
                            )
                    );

            }


            /*
             * Rank fresh candidates before they enter D1.
             */

            articles =
                rankNewsArticles(
                    articles,
                    category
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
             * Return the quality-ranked result of the
             * single Open Newswire request.
             *
             * D1 will merge these with the existing
             * persistent article history.
             */

            articles =
                rankNewsArticles(
                    articles,
                    category
                );

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
                        LIMIT 50
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

            const relevantExistingRows =
                existingRows.filter(
                    row =>
                        isRelevantNewsCategory(
                            {
                                title: row.title || "",
                                description: row.description || ""
                            },
                            category
                        )
                );

            const invalidExistingRows =
                existingRows.filter(
                    row =>
                        !isRelevantNewsCategory(
                            {
                                title: row.title || "",
                                description: row.description || ""
                            },
                            category
                        )
                );

            if (invalidExistingRows.length) {
                await db.batch(
                    invalidExistingRows.map(
                        row =>
                            db
                                .prepare(
                                    "DELETE FROM news_articles WHERE category = ? AND url = ?"
                                )
                                .bind(
                                    category,
                                    row.url || ""
                                )
                    )
                );
            }

            const existingArticles =
                relevantExistingRows.map(
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
                            normalizeNewsImageUrl(
                                row.image
                            ),

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
             * Fresh candidates have already been
             * quality-ranked above.
             */

            const merged =
                removeDuplicateFormattedArticles(
                    [
                        ...freshArticles,
                        ...existingArticles
                    ]
                );


            /*
             * Keep the persistent feed current.
             */

            const currentArticles =
                merged.filter(
                    article => {

                        const age =
                            articleAgeMs(
                                article
                            );

                        return (
                            !age ||
                            age <= NEWS_MAX_AGE_MS
                        );

                    }
                );


            /*
             * Rank the combined current pool so that
             * strong fresh stories can outrank mediocre
             * older stories already stored in D1.
             */

            const finalArticles =
                rankNewsArticles(
                    currentArticles,
                    category
                ).slice(
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
                    relevantExistingRows
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
                            normalizeNewsImageUrl(
                                article.image
                            ),
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


            return rankNewsArticles(
                finalRows
                    .filter(
                        row =>
                            isRelevantNewsCategory(
                                {
                                    title: row.title || "",
                                    description: row.description || ""
                                },
                                category
                            )
                    )
                    .map(
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
                            normalizeNewsImageUrl(
                                row.image
                            ),

                        publishedAt:
                            row.published_at ||
                            "",

                        source:
                            row.source ||
                            ""

                    })
                ),
                category
            ).slice(
                0,
                12
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
                             * articles from Open Newswire.
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
                             * If Open Newswire fails,
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


                                const fallbackArticles =
                                    rankNewsArticles(
                                        fallbackRows
                                            .filter(
                                                row =>
                                                    isRelevantNewsCategory(
                                                        {
                                                            title: row.title || "",
                                                            description: row.description || ""
                                                        },
                                                        category
                                                    )
                                            )
                                            .map(
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
                                                    normalizeNewsImageUrl(
                                                        row.image
                                                    ),

                                                publishedAt:
                                                    row.published_at ||
                                                    "",

                                                source:
                                                    row.source ||
                                                    ""

                                            })
                                        ),
                                        category
                                    ).slice(
                                        0,
                                        12
                                    );

                                return [
                                    category,
                                    fallbackArticles
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
            "Open Newswire API error:",
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
