import { recordAdminApiUsage } from "../lib/admin-usage.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ADMIN_EMAIL = "pedjasebez3545@gmail.com";

const CANDIDATE_QUERIES = {
    politics: ["politics", "elections"],
    crime: ["crime", "criminal justice"],
    culture: ["culture", "arts"],
    gaming: ["gaming", "video games"],
    nature: ["nature", "wildlife"],
    society: ["society", "community"]
};

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
    return value.startsWith("Bearer ")
        ? value.slice(7).trim()
        : "";
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

    return user?.id &&
        String(user?.email || "").trim().toLowerCase() === ADMIN_EMAIL
        ? user
        : null;
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

function licenseAllowed(article) {
    const license = article?.feed?.license || {};
    const name = clean(license.name).toLowerCase();
    const slug = clean(license.slug).toLowerCase();

    if (
        slug.includes("nc") ||
        name.includes("non-commercial") ||
        name.includes("noncommercial")
    ) return false;

    return (
        slug.includes("public-domain") ||
        slug === "cc0" ||
        name.includes("public domain") ||
        name.includes("cc0") ||
        slug.includes("by") ||
        name.includes("creative commons") ||
        name.includes("attribution")
    );
}

function dedupe(articles) {
    const seen = new Set();
    const out = [];

    for (const article of articles) {
        const key =
            clean(article?.link).toLowerCase() ||
            clean(article?.title).toLowerCase();

        if (!key || seen.has(key)) continue;

        seen.add(key);
        out.push(article);
    }

    return out;
}

async function fetchQuery(query) {
    const url = new URL("https://feed.opennewswire.org/api/articles");

    url.searchParams.set("languages", "en");
    url.searchParams.set("size", "20");
    url.searchParams.set("search", query);

    const started = Date.now();

    const response = await fetch(
        url.toString(),
        {
            headers: {
                "User-Agent": "Worth-It-News-Category-Audit/1.0"
            }
        }
    );

    const raw = await response.text();

    let data;

    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(
            "Invalid JSON from Open Newswire (" +
            response.status +
            ")"
        );
    }

    return {
        query,
        http: response.status,
        elapsedMs: Date.now() - started,
        articles:
            Array.isArray(data?.results)
                ? data.results
                : []
    };
}

export async function onRequestGet(context) {
    const request = context.request;

    const origin =
        request.headers.get("Origin") || "";

    if (
        origin &&
        origin !== SITE_ORIGIN
    ) {
        return json(
            { error: "Forbidden origin." },
            403
        );
    }

    const token =
        tokenFrom(request);

    if (!token) {
        return json(
            { error: "Unauthorized." },
            401
        );
    }

    const user =
        await verifyAdmin(
            context.env,
            token
        );

    if (!user) {
        return json(
            { error: "Forbidden." },
            403
        );
    }

    const started =
        Date.now();

    const results = {};

    const entries =
        Object.entries(
            CANDIDATE_QUERIES
        );

    for (const [category, queries] of entries) {
        const settled =
            await Promise.allSettled(
                queries.map(
                    query =>
                        fetchQuery(query)
                )
            );

        const allAllowed = [];
        const queryResults = [];

        for (let i = 0; i < settled.length; i++) {
            const result = settled[i];
            const query = queries[i];

            if (result.status === "rejected") {
                queryResults.push({
                    query,
                    error:
                        result.reason instanceof Error
                            ? result.reason.message
                            : String(result.reason)
                });
                continue;
            }

            recordAdminApiUsage(
                context,
                {
                    apiKey: "news",
                    provider: "Open Newswire"
                }
            );

            const rawArticles =
                result.value.articles;

            const allowed =
                rawArticles.filter(
                    licenseAllowed
                );

            const unique =
                dedupe(
                    allowed
                );

            allAllowed.push(
                ...unique
            );

            queryResults.push({
                query,
                http:
                    result.value.http,
                elapsedMs:
                    result.value.elapsedMs,
                rawCount:
                    rawArticles.length,
                allowedLicenseCount:
                    allowed.length,
                uniqueCount:
                    unique.length
            });
        }

        const global =
            dedupe(
                allAllowed
            );

        results[category] = {
            queries,
            queryResults,
            uniqueAllowedCandidates:
                global.length,
            titles:
                global.map(
                    article => ({
                        title:
                            clean(article?.title),
                        source:
                            clean(article?.feed?.title),
                        publishedAt:
                            article?.date || "",
                        license:
                            clean(
                                article?.feed?.license?.name ||
                                article?.feed?.license?.slug ||
                                ""
                            ),
                        url:
                            clean(article?.link)
                    })
                )
        };
    }

    return json({
        ok: true,
        diagnostic:
            "Open Newswire candidate category audit",
        generatedAt:
            new Date().toISOString(),
        elapsedMs:
            Date.now() - started,
        upstreamRequestsMade:
            entries.reduce(
                (sum, [, queries]) =>
                    sum + queries.length,
                0
            ),
        categories:
            results,
        note:
            "Read-only diagnostic. No news_articles writes and no /api/news cache changes."
    });
}
