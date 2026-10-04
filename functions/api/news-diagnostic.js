import { recordAdminApiUsage } from "../lib/admin-usage.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ADMIN_EMAIL = "pedjasebez3545@gmail.com";

function json(data, status = 200) {
    return new Response(
        JSON.stringify(data, null, 2),
        {
            status,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": SITE_ORIGIN,
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "GET, OPTIONS"
            }
        }
    );
}

function tokenFrom(request) {
    const value = request.headers.get("Authorization") || "";
    if (!value.startsWith("Bearer ")) return "";
    return value.slice(7).trim();
}

async function verifyAdmin(env, token) {
    const supabaseUrl = String(env.SUPABASE_URL || "").trim();
    const supabaseKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();

    if (!supabaseUrl || !supabaseKey || !token) return null;

    const response = await fetch(
        supabaseUrl + "/auth/v1/user",
        {
            headers: {
                "apikey": supabaseKey,
                "Authorization": "Bearer " + token,
                "Accept": "application/json"
            }
        }
    );

    if (!response.ok) return null;

    const user = await response.json();

    if (
        !user?.id ||
        String(user?.email || "").trim().toLowerCase() !== ADMIN_EMAIL
    ) {
        return null;
    }

    return user;
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, OPTIONS"
        }
    });
}

function clean(value) {
    return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeTitle(title) {
    return clean(title)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\b(reuters|ap|associated press|breaking|update|news)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function titleSimilarity(titleA, titleB) {
    const wordsA = new Set(
        normalizeTitle(titleA).split(" ").filter(word => word.length >= 4)
    );
    const wordsB = new Set(
        normalizeTitle(titleB).split(" ").filter(word => word.length >= 4)
    );

    if (!wordsA.size || !wordsB.size) return 0;

    let commonWords = 0;

    for (const word of wordsA) {
        if (wordsB.has(word)) commonWords++;
    }

    return commonWords / Math.max(wordsA.size, wordsB.size);
}

function removeDuplicates(articles) {
    const out = [];
    const seenUrls = new Set();
    const seenTitles = [];

    for (const article of articles) {
        const url = clean(article?.link).toLowerCase();
        const title = normalizeTitle(article?.title);

        if (url && seenUrls.has(url)) continue;

        let duplicate = false;

        for (const existing of seenTitles) {
            if (titleSimilarity(title, existing) >= 0.65) {
                duplicate = true;
                break;
            }
        }

        if (duplicate) continue;

        if (url) seenUrls.add(url);
        if (title) seenTitles.push(title);
        out.push(article);
    }

    return out;
}

function licenseAllowed(article) {
    const license = article?.feed?.license || {};
    const name = clean(license.name).toLowerCase();
    const slug = clean(license.slug).toLowerCase();

    if (
        slug.includes("nc") ||
        name.includes("non-commercial") ||
        name.includes("noncommercial")
    ) return false;

    if (
        slug.includes("public-domain") ||
        slug === "cc0" ||
        name.includes("public domain") ||
        name.includes("cc0")
    ) return true;

    if (
        slug.includes("by") ||
        name.includes("creative commons") ||
        name.includes("attribution")
    ) return true;

    return false;
}

function getPrimaryNewsCategory(article) {
    const title = clean(article?.title).toLowerCase();
    const description = clean(article?.content).toLowerCase();
    const text = title + " " + description;

    const rules = {
        world: [
            "war","conflict","ceasefire","diplomacy","diplomatic","election",
            "president","prime minister","foreign minister","parliament",
            "government","sanctions","treaty","geopolit","protest","coup",
            "military","border dispute","international","congress","senate",
            "political","policy","campaign","candidate","ballot","voters",
            "congressional race","congressional district","midterm","lawmaker",
            "governor","minister","legislation","referendum"
        ],
        technology: [
            "technology","tech","software","artificial intelligence","ai",
            "cybersecurity","cyber attack","chip","chips","semiconductor",
            "robot","robotics","smartphone","computer","internet","app",
            "cloud computing","data center","quantum computing","biometric",
            "digital platform","machine learning","programming","developer"
        ],
        business: [
            "business","economy","economic","markets","market","stocks","shares",
            "finance","financial","investment","investors","company","companies",
            "merger","acquisition","trade","tariff","bank","banking","jobs",
            "employment","inflation","interest rates","earnings","revenue",
            "industry","corporate","manufacturing","fuel economy","tax"
        ],
        science: [
            "science","scientist","scientists","research","researchers","study",
            "discovery","discovered","experiment","astronomy","planet","galaxy",
            "space mission","nasa","biology","genetics","physics","chemistry",
            "species","ecosystem","laboratory","clinical trial","scientific"
        ],
        sports: [
            "sports","sport","football","soccer","basketball","baseball","tennis",
            "cricket","rugby","hockey","golf","boxing","formula 1","grand prix",
            "fifa","uefa","nfl","nba","nhl","mlb","championship","tournament",
            "league","playoffs","world cup","athlete","coach","transfer","match",
            "season","games","game"
        ],
        travel: [
            "tourism","tourist","travel industry","travel advisory","travel warning",
            "airline","airport","flight","hotel","resort","destination","cruise",
            "vacation","holiday","hospitality","tour operator","travel disruption",
            "travel restrictions","visa","traveler","travellers","lodging","passenger"
        ],
        entertainment: [
            "entertainment","movie","movies","film","films","cinema","music",
            "concert","singer","album","actor","actress","celebrity","director",
            "hollywood","television","tv series","streaming","festival",
            "box office","premiere","performance","artist","show"
        ],
        lifestyle: [
            "lifestyle","fashion","wellness","beauty","skincare","makeup","cosmetics",
            "relationships","dating","home decor","interior design","home improvement",
            "fitness","parenting","family life","personal style","self-care","hobbies",
            "leisure","personal finance","shopping","consumer trends"
        ],
        health: [
            "health","healthcare","health care","medical","medicine","disease",
            "illness","hospital","doctor","doctors","patient","patients","vaccine",
            "vaccination","virus","infection","outbreak","treatment","therapy",
            "diagnosis","mental health","public health","clinical","pregnant",
            "pregnancy","medication","symptoms","ptsd","post-traumatic stress",
            "trauma","weight loss","weight-loss","diet drinks","prenatal","adhd"
        ],
        environment: [
            "environment","climate change","global warming","greenhouse gas",
            "emissions","pollution","wildfire","drought","flood","storm surge",
            "permafrost","conservation","biodiversity","renewable energy",
            "clean energy","ecosystem","wetland","ocean warming","deforestation",
            "wildlife","habitat","carbon","sustainability","endangered species",
            "food waste"
        ],
        food: [
            "food","restaurant","cooking","recipe","chef","cuisine","meal","dish",
            "grocery","supermarket","food safety","food prices","ingredients",
            "bakery","coffee","wine","beer","dining","kitchen","menu","appetite",
            "flavor"
        ],
        education: [
            "education","school","schools","university","universities","college",
            "colleges","student","students","teacher","teachers","classroom",
            "curriculum","literacy","scholarship","campus","academic","school district",
            "higher education","learning","lesson","degree","faculty"
        ]
    };

    let bestCategory = "";
    let bestScore = 0;
    let bestTitleScore = 0;
    const scores = {};

    for (const [category, terms] of Object.entries(rules)) {
        let titleScore = 0;
        let bodyScore = 0;

        for (const term of terms) {
            const escaped = term.replace(/[.*+?^{}()|[\]\\]/g, "\\$&");
            const pattern = new RegExp(
                "(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)",
                "i"
            );

            if (pattern.test(title)) titleScore++;
            if (pattern.test(text)) bodyScore++;
        }

        const score = (titleScore * 8) + (bodyScore * 2);

        scores[category] = {
            titleScore,
            bodyScore,
            score
        };

        if (
            score > bestScore ||
            (score === bestScore && titleScore > bestTitleScore)
        ) {
            bestCategory = category;
            bestScore = score;
            bestTitleScore = titleScore;
        }
    }

    if (
        title.includes("environmental") ||
        title.includes("river cleanup") ||
        title.includes("power plant emissions") ||
        title.includes("fossil fuel companies")
    ) return { category: "environment", reason: "headline override" };

    if (
        title.includes("hybrid aggression") ||
        title.includes("hybrid warfare") ||
        title.includes("cyberattacks")
    ) return { category: "world", reason: "headline override" };

    if (
        title.includes("vaccinated") &&
        (
            title.includes("lion") ||
            title.includes("tamarin") ||
            title.includes("wildlife") ||
            title.includes("animal")
        )
    ) return { category: "environment", reason: "headline override" };

    if (
        title.includes("testosterone") &&
        (
            text.includes("menopause") ||
            text.includes("symptoms") ||
            text.includes("women")
        )
    ) return { category: "health", reason: "headline override" };

    if (
        title.includes("study") &&
        (
            title.includes("diet drinks") ||
            title.includes("weight loss")
        )
    ) return { category: "health", reason: "headline override" };

    if (title.includes("mangrove")) {
        return { category: "environment", reason: "headline override" };
    }

    if (title.includes("isle royale") && title.includes("wolf")) {
        return { category: "environment", reason: "headline override" };
    }

    if (title.includes("pileup") || title.includes("vehicle pileup")) {
        return { category: "world", reason: "headline override" };
    }

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
        return { category: "lifestyle", reason: "headline override" };
    }

    return {
        category: bestScore >= 4 ? bestCategory : "",
        reason: bestScore >= 4 ? "score" : "below threshold",
        bestScore,
        bestTitleScore,
        scores
    };
}

function travelDetails(article) {
    const title = clean(article?.title).toLowerCase();
    const description = clean(article?.content).toLowerCase();

    const strongTerms = [
        "tourism","tourist","travel industry","travel advisory","travel warning",
        "airline","airport","flight","hotel","resort","destination","cruise",
        "vacation","holiday","hospitality","tour operator","travel disruption",
        "travel restrictions"
    ];

    const secondaryTerms = [
        "traveler","travellers","travelers","visa","border","lodging",
        "passenger","tourism sector","visitor"
    ];

    const falsePositivePatterns = [
        "space travel","space traveler","space traveller","nasa","astronaut",
        "airport sabotage","airport parking","airport attack","airport incident",
        "detained at airport","arrested at airport","political researcher",
        "undocumented migrants","refugees","legal status","migration policy",
        "child abduction","traveled to","travelled to","travels to","travels from",
        "traveling to","travelling to","traveling from","travelling from"
    ];

    const matchedStrong = strongTerms.filter(
        term => title.includes(term) || description.includes(term)
    );

    const matchedSecondary = secondaryTerms.filter(
        term => title.includes(term) || description.includes(term)
    );

    const matchedFalsePositive = falsePositivePatterns.filter(
        pattern => title.includes(pattern)
    );

    const relevant =
        matchedFalsePositive.length === 0 &&
        (
            matchedStrong.length >= 1 ||
            (
                matchedSecondary.length >= 1 &&
                (
                    title.includes("travel") ||
                    description.includes("travel") ||
                    title.includes("tourism") ||
                    description.includes("tourism") ||
                    title.includes("visa") ||
                    description.includes("visa")
                )
            )
        );

    return {
        relevant,
        matchedStrong,
        matchedSecondary,
        matchedFalsePositive
    };
}

async function fetchQuery(query) {
    const url = new URL("https://feed.opennewswire.org/api/articles");
    url.searchParams.set("languages", "en");
    url.searchParams.set("size", "60");
    url.searchParams.set("search", query);

    const started = Date.now();

    const response = await fetch(
        url.toString(),
        {
            headers: {
                "User-Agent": "Worth-It-News-Diagnostic/1.0"
            }
        }
    );

    const rawText = await response.text();

    let data = null;

    try {
        data = JSON.parse(rawText);
    } catch {
        throw new Error(
            "Open Newswire returned invalid JSON (" + response.status + ")"
        );
    }

    return {
        query,
        http: response.status,
        elapsedMs: Date.now() - started,
        raw: Array.isArray(data?.results) ? data.results : [],
        pagination: data?.pagination || null
    };
}

function summarizeArticle(article, category, query) {
    const classifier = getPrimaryNewsCategory(article);
    const travel = category === "travel"
        ? travelDetails(article)
        : null;

    const accepted =
        category === "travel"
            ? classifier.category === "travel" && travel.relevant
            : classifier.category === "lifestyle";

    return {
        title: clean(article?.title),
        source: clean(article?.feed?.title),
        publishedAt: article?.date || "",
        query,
        classifierCategory: classifier.category || null,
        classifierReason: classifier.reason,
        classifierScores: classifier.scores || null,
        travelCheck: travel,
        accepted,
        url: clean(article?.link),
        license: clean(
            article?.feed?.license?.name ||
            article?.feed?.license?.slug ||
            ""
        )
    };
}

export async function onRequestGet(context) {
    try {
    const request = context.request;

    const origin = request.headers.get("Origin") || "";
    if (origin && origin !== SITE_ORIGIN) {
        return json({ error: "Forbidden origin." }, 403);
    }

    const token = tokenFrom(request);
    if (!token) {
        return json({ error: "Unauthorized." }, 401);
    }

    const user = await verifyAdmin(context.env, token);
    if (!user) {
        return json({ error: "Forbidden." }, 403);
    }

    const selected = String(
        new URL(request.url).searchParams.get("category") || "both"
    ).toLowerCase();

    const categoryQueries = {
        travel: [
            "travel",
            "tourism",
            "airline",
            "airport",
            "hotel",
            "destination",
            "cruise",
            "hospitality"
        ],
        lifestyle: [
            "lifestyle",
            "fashion",
            "beauty"
        ]
    };

    const requestedCategories =
        selected === "travel"
            ? ["travel"]
            : selected === "lifestyle"
                ? ["lifestyle"]
                : ["travel", "lifestyle"];

    const started = Date.now();
    const diagnostics = {};

    for (const category of requestedCategories) {
        const queries = categoryQueries[category];
        const queryResults = [];
        const allAllowed = [];

        for (const query of queries) {
            let result;

            try {
                result = await fetchQuery(query);

                recordAdminApiUsage(context, {
                    apiKey: "news",
                    provider: "Open Newswire"
                });
            } catch (error) {
                queryResults.push({
                    query,
                    error: error instanceof Error
                        ? error.message
                        : String(error)
                });
                continue;
            }

            const allowed = result.raw.filter(licenseAllowed);
            const unique = removeDuplicates(allowed);

            const accepted = unique.filter(article =>
                summarizeArticle(article, category, query).accepted
            );

            const rejected = unique.filter(article =>
                !summarizeArticle(article, category, query).accepted
            );

            allAllowed.push(...unique);

            queryResults.push({
                query,
                http: result.http,
                elapsedMs: result.elapsedMs,
                rawCount: result.raw.length,
                allowedLicenseCount: allowed.length,
                uniqueCount: unique.length,
                passCurrentFilterCount: accepted.length,
                rejectedCount: rejected.length,
                accepted: accepted.map(article =>
                    summarizeArticle(article, category, query)
                ),
                rejected: rejected.map(article =>
                    summarizeArticle(article, category, query)
                )
            });
        }

        const globalMap = new Map();

        for (const article of allAllowed) {
            const key =
                clean(article?.link).toLowerCase() ||
                normalizeTitle(article?.title);

            if (!globalMap.has(key)) {
                globalMap.set(key, article);
            }
        }

        const globalUnique = [...globalMap.values()];

        const globalAccepted = globalUnique.filter(article => {
            const classifier = getPrimaryNewsCategory(article);

            if (category === "travel") {
                return classifier.category === "travel" &&
                    travelDetails(article).relevant;
            }

            return classifier.category === "lifestyle";
        });

        const globalRejected = globalUnique.filter(article => {
            const classifier = getPrimaryNewsCategory(article);

            if (category === "travel") {
                return !(classifier.category === "travel" &&
                    travelDetails(article).relevant);
            }

            return classifier.category !== "lifestyle";
        });

        diagnostics[category] = {
            requestedQueries: queries.length,
            queries: queryResults,
            global: {
                allowedUniqueCandidates: globalUnique.length,
                passCurrentFilter: globalAccepted.length,
                rejectedByClassifierOrFilter: globalRejected.length,
                accepted: globalAccepted.map(article =>
                    summarizeArticle(article, category, "global")
                ),
                rejected: globalRejected.map(article =>
                    summarizeArticle(article, category, "global")
                )
            }
        };
    }

    return json({
        ok: true,
        diagnostic: "Open Newswire travel/lifestyle candidate analysis",
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        note: "Read-only diagnostic. It does not write to news_articles or change /api/news cache.",
        upstreamRequestsMade: Object.values(diagnostics)
            .reduce((sum, category) => sum + category.queries.length, 0),
        diagnostics
    });
    } catch (error) {
        return json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null
        }, 500);

}
