const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ADMIN_EMAIL = "pedjasebez3545@gmail.com";

const API_REGISTRY = [
    {
        key: "weather",
        name: "Weather",
        emoji: "🌤️",
        provider: "Visual Crossing",
        endpoint: "/api/weather",
        category: "Weather",
        quotaType: "daily",
        quotaLimit: 1000,
        quotaLabel: "1,000 records/day"
    },
    {
        key: "news",
        name: "News",
        emoji: "📰",
        provider: "NewsData.io",
        endpoint: "/api/news",
        category: "News",
        quotaType: "daily",
        quotaLimit: 200,
        quotaLabel: "200 credits/day"
    },
    {
        key: "currencies",
        name: "Currencies",
        emoji: "💱",
        provider: "Frankfurter",
        endpoint: "/api/currencies",
        category: "Currencies",
        quotaType: "none",
        quotaLabel: "No monthly/daily quota"
    },
    {
        key: "exchange-rate",
        name: "Exchange Rate",
        emoji: "💱",
        provider: "Frankfurter",
        endpoint: "/api/exchange-rate",
        category: "Shared",
        quotaType: "none",
        quotaLabel: "No monthly/daily quota"
    },
    {
        key: "cars",
        name: "Cars",
        emoji: "🚗",
        provider: "VehiclesDB + Wikidata + DBpedia + Wikipedia + Wikimedia",
        endpoint: "/api/cars",
        category: "Cars",
        quotaType: "none",
        quotaLabel: "No fixed provider quota"
    },
    {
        key: "markets",
        name: "Markets",
        emoji: "📈",
        provider: "World Bank + USGS + EIA + USDA NASS + Voltlas + Wikimedia",
        endpoint: "/api/markets",
        category: "Markets",
        quotaType: "none",
        quotaLabel: "No fixed provider quota"
    },
    {
        key: "crypto",
        name: "Cryptocurrencies",
        emoji: "🪙",
        provider: "CoinMarketCap",
        endpoint: "/api/crypto",
        category: "Crypto",
        quotaType: "dynamic",
        quotaLabel: "15,000 call credits/month · 50 requests/min"
    },
    {
        key: "ai-chat",
        name: "AI Chat",
        emoji: "🤖",
        provider: "Gemini / Groq",
        endpoint: "/api/ai-chat",
        category: "AI",
        quotaType: "dynamic",
        quotaLabel: "Model/plan dependent"
    },
    {
        key: "water-levels",
        name: "Water Levels",
        emoji: "💧",
        provider: "Copernicus CLMS / CDSE",
        endpoint: "/api/water-levels",
        category: "Water",
        quotaType: "dynamic",
        quotaLabel: "Provider dependent"
    },
    {
        key: "ship_tracking",
        name: "Ship Tracking — Pelyr",
        emoji: "🚢",
        provider: "Pelyr OPEN-AIS",
        endpoint: "/api/ship-tracking",
        category: "Ship Tracking",
        quotaType: "dynamic",
        quotaLabel: "Provider dependent"
    },
    {
        key: "ship_tracking_euris",
        name: "Ship Tracking — EuRIS",
        emoji: "🚢",
        provider: "EuRIS",
        endpoint: "/api/ship-tracking",
        category: "Ship Tracking",
        quotaType: "dynamic",
        quotaLabel: "Rate/concurrency limits apply"
    },
    {
        key: "ship_tracking_sources",
        name: "Pelyr Sources",
        emoji: "🛰️",
        provider: "Pelyr OPEN-AIS",
        endpoint: "/api/ship-tracking?action=sources",
        category: "Ship Tracking",
        quotaType: "dynamic",
        quotaLabel: "Provider dependent"
    },
    {
        key: "feedback",
        name: "Feedback",
        emoji: "🐞",
        provider: "Supabase",
        endpoint: "/api/feedback",
        category: "Site",
        quotaType: "dynamic",
        quotaLabel: "Provider dependent"
    },
    {
        key: "vehiclesdb", name: "VehiclesDB", emoji: "🚗",
        provider: "VehiclesDB catalog",
        endpoint: "https://cdn.jsdelivr.net/gh/vehiclesdb/vehiclesdb@latest/dist/vehicles.json",
        category: "Cars", quotaType: "dynamic",
        quotaLabel: "Public data source; provider limits apply",
        trackingMode: "grouped", trackingGroup: "cars"
    },
    {
        key: "wikidata", name: "Wikidata", emoji: "🧬",
        provider: "Wikidata Query Service",
        endpoint: "https://query.wikidata.org/sparql",
        category: "Cars", quotaType: "dynamic",
        quotaLabel: "Provider rate/concurrency limits apply",
        trackingMode: "grouped", trackingGroup: "cars"
    },
    {
        key: "dbpedia", name: "DBpedia", emoji: "📚",
        provider: "DBpedia SPARQL",
        endpoint: "https://dbpedia.org/sparql",
        category: "Cars", quotaType: "dynamic",
        quotaLabel: "Provider rate/concurrency limits apply",
        trackingMode: "grouped", trackingGroup: "cars"
    },
    {
        key: "wikipedia", name: "Wikipedia API", emoji: "📖",
        provider: "MediaWiki API",
        endpoint: "https://en.wikipedia.org/w/api.php",
        category: "Shared", quotaType: "dynamic",
        quotaLabel: "Provider rate limits apply",
        trackingMode: "grouped", trackingGroup: "cars / crypto"
    },
    {
        key: "wikimedia", name: "Wikimedia Commons", emoji: "🖼️",
        provider: "Wikimedia Commons API",
        endpoint: "https://commons.wikimedia.org/w/api.php",
        category: "Shared", quotaType: "dynamic",
        quotaLabel: "Provider rate limits apply",
        trackingMode: "grouped", trackingGroup: "cars / markets / crypto"
    },
    {
        key: "world-bank", name: "World Bank Commodity Data", emoji: "🌍",
        provider: "World Bank",
        endpoint: "https://www.worldbank.org/en/research/commodity-markets",
        category: "Markets", quotaType: "dynamic",
        quotaLabel: "Public data source; provider limits apply",
        trackingMode: "grouped", trackingGroup: "markets"
    },
    {
        key: "usgs", name: "USGS Mineral Data", emoji: "⛏️",
        provider: "USGS NMIC / ScienceBase",
        endpoint: "https://www.usgs.gov/centers/national-minerals-information-center/data",
        category: "Markets", quotaType: "dynamic",
        quotaLabel: "Public data source; provider limits apply",
        trackingMode: "grouped", trackingGroup: "markets"
    },
    {
        key: "eia", name: "EIA", emoji: "⚡",
        provider: "U.S. Energy Information Administration",
        endpoint: "https://api.eia.gov/v2/",
        category: "Markets", quotaType: "dynamic",
        quotaLabel: "Account/provider dependent",
        trackingMode: "grouped", trackingGroup: "markets"
    },
    {
        key: "usda-nass", name: "USDA NASS", emoji: "🌾",
        provider: "USDA National Agricultural Statistics Service",
        endpoint: "https://www.nass.usda.gov/Quick_Stats/",
        category: "Markets", quotaType: "dynamic",
        quotaLabel: "Public data source; provider limits apply",
        trackingMode: "grouped", trackingGroup: "markets"
    },
    {
        key: "voltlas", name: "Voltlas", emoji: "📦",
        provider: "Voltlas commodity data",
        endpoint: "https://voltlas.com/data/latest.json",
        category: "Markets", quotaType: "dynamic",
        quotaLabel: "Provider dependent",
        trackingMode: "grouped", trackingGroup: "markets"
    },
    {
        key: "gemini", name: "Gemini API", emoji: "✨",
        provider: "Google Gemini",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/",
        category: "AI", quotaType: "dynamic",
        quotaLabel: "Project/model/plan dependent",
        trackingMode: "grouped", trackingGroup: "ai-chat"
    },
    {
        key: "groq", name: "Groq API", emoji: "⚙️",
        provider: "Groq",
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        category: "AI", quotaType: "dynamic",
        quotaLabel: "Organization/model/plan dependent",
        trackingMode: "grouped", trackingGroup: "ai-chat"
    },
    {
        key: "supabase-platform", name: "Supabase Platform", emoji: "🟢",
        provider: "Supabase Auth / Database",
        endpoint: "https://supabase.co",
        category: "Site", quotaType: "dynamic",
        quotaLabel: "Project/plan dependent",
        trackingMode: "grouped", trackingGroup: "feedback / auth"
    }
];

function responseJson(
    data,
    status = 200
) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=utf-8",
                "Cache-Control":
                    "no-store",
                "Access-Control-Allow-Origin":
                    SITE_ORIGIN,
                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization",
                "Access-Control-Allow-Methods":
                    "GET, OPTIONS"
            }
        }
    );
}

function getToken(
    request
) {
    const authorization =
        request.headers.get(
            "Authorization"
        ) || "";

    if (
        !authorization.startsWith(
            "Bearer "
        )
    ) {
        return "";
    }

    return authorization
        .slice(7)
        .trim();
}

async function verifySupabaseUser(
    env,
    token
) {
    const supabaseUrl =
        String(
            env.SUPABASE_URL || ""
        ).trim();

    const supabaseKey =
        String(
            env.SUPABASE_PUBLISHABLE_KEY || ""
        ).trim();

    if (
        !supabaseUrl ||
        !supabaseKey
    ) {
        throw new Error(
            "Supabase environment variables are missing."
        );
    }

    const response =
        await fetch(
            supabaseUrl +
            "/auth/v1/user",
            {
                method:
                    "GET",
                headers: {
                    "apikey":
                        supabaseKey,
                    "Authorization":
                        "Bearer " + token,
                    "Accept":
                        "application/json"
                }
            }
        );

    if (!response.ok) {
        return null;
    }

    const user =
        await response.json();

    if (
        !user?.id
    ) {
        return null;
    }

    return user;
}

export async function onRequestOptions() {
    return new Response(
        null,
        {
            status:
                204,
            headers: {
                "Access-Control-Allow-Origin":
                    SITE_ORIGIN,
                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization",
                "Access-Control-Allow-Methods":
                    "GET, OPTIONS"
            }
        }
    );
}

export async function onRequestGet(
    context
) {
    const request =
        context.request;

    const env =
        context.env;

    try {
        const origin =
            request.headers.get(
                "Origin"
            ) || "";

        if (
            origin &&
            origin !== SITE_ORIGIN
        ) {
            return responseJson(
                {
                    error:
                        "Forbidden origin."
                },
                403
            );
        }

        const token =
            getToken(request);

        if (!token) {
            return responseJson(
                {
                    error:
                        "Unauthorized."
                },
                401
            );
        }

        const user =
            await verifySupabaseUser(
                env,
                token
            );

        if (
            String(user?.email || "").trim().toLowerCase() !==
            ADMIN_EMAIL
        ) {
            return responseJson(
                {
                    error:
                        "Forbidden."
                },
                403
            );
        }

        const db =
            env.DB;

        if (!db) {
            return responseJson(
                {
                    error:
                        "D1 database binding DB is not configured."
                },
                500
            );
        }

        const now =
            new Date();

        const today =
            now.toISOString().slice(
                0,
                10
            );

        const monthStart =
            today.slice(
                0,
                8
            ) + "01";

        const yesterdayStart =
            new Date(
                now.getTime() -
                24 * 60 * 60 * 1000
            )
                .toISOString()
                .slice(
                    0,
                    10
                );

        const last30Start =
            new Date(
                now.getTime() -
                29 * 24 * 60 * 60 * 1000
            )
                .toISOString()
                .slice(
                    0,
                    10
                );

        await db
            .prepare(
                "CREATE TABLE IF NOT EXISTS admin_api_usage_totals_v2 (" +
                "api_key TEXT PRIMARY KEY, " +
                "provider TEXT NOT NULL, " +
                "total_requests INTEGER NOT NULL DEFAULT 0, " +
                "first_seen_at TEXT NOT NULL, " +
                "last_seen_at TEXT NOT NULL" +
                ")"
            )
            .run();

        await db
            .prepare(
                "CREATE TABLE IF NOT EXISTS admin_api_usage_daily_v2 (" +
                "api_key TEXT NOT NULL, " +
                "provider TEXT NOT NULL, " +
                "usage_date TEXT NOT NULL, " +
                "requests INTEGER NOT NULL DEFAULT 0, " +
                "PRIMARY KEY (api_key, usage_date)" +
                ")"
            )
            .run();

        const totalResult =
            await db
                .prepare(
                    "SELECT api_key, provider, total_requests, first_seen_at, last_seen_at " +
                    "FROM admin_api_usage_totals_v2 " +
                    "ORDER BY total_requests DESC"
                )
                .all();

        const periodResult =
            await db
                .prepare(
                    "SELECT api_key, usage_date, requests " +
                    "FROM admin_api_usage_daily_v2 " +
                    "WHERE usage_date >= ? " +
                    "ORDER BY usage_date DESC"
                )
                .bind(
                    last30Start
                )
                .all();

        const periodRows =
            Array.isArray(
                periodResult?.results
            )
                ? periodResult.results
                : [];

        const byKey =
            new Map();

        for (const row of periodRows) {
            const key =
                String(
                    row?.api_key || ""
                );

            if (!key) continue;

            const current =
                byKey.get(key) || {
                    today: 0,
                    month: 0,
                    last30Days: 0
                };

            const requests =
                Number(
                    row?.requests
                ) || 0;

            const usageDate =
                String(
                    row?.usage_date || ""
                );

            current.last30Days +=
                requests;

            if (
                usageDate >=
                monthStart
            ) {
                current.month +=
                    requests;
            }

            if (
                usageDate ===
                today
            ) {
                current.today +=
                    requests;
            }

            byKey.set(
                key,
                current
            );
        }

        const totals =
            Array.isArray(
                totalResult?.results
            )
                ? totalResult.results
                : [];

        const usageMap =
            new Map(
                totals.map(
                    row => [
                        String(
                            row?.api_key || ""
                        ),
                        row
                    ]
                )
            );

        const registeredKeys =
            new Set(
                API_REGISTRY.map(
                    api =>
                        api.key
                )
            );

        const deprecatedUsageKeys =
            new Set([
                "ship_tracking_euris_track"
            ]);

        const discoveredApis =
            totals
                .filter(
                    row =>
                        row?.api_key &&
                        !deprecatedUsageKeys.has(
                            String(row.api_key)
                        ) &&
                        !registeredKeys.has(
                            String(
                                row.api_key
                            )
                        )
                )
                .map(
                    row => ({
                        key:
                            String(
                                row.api_key
                            ),
                        name:
                            String(
                                row.api_key
                            ),
                        emoji:
                            getApiEmoji(
                                String(
                                    row.api_key
                                )
                            ),
                        provider:
                            String(
                                row.provider ||
                                "Unknown provider"
                            ),
                        endpoint:
                            "—",
                        category:
                            "Other",
                        quotaType:
                            "dynamic",
                        quotaLabel:
                            "Not configured"
                    })
                );

        const allApiDefinitions =
            API_REGISTRY.concat(
                discoveredApis
            );

        const apis =
            allApiDefinitions.map(api => {
                const row =
                    usageMap.get(
                        api.key
                    ) || null;

                const periods =
                    byKey.get(
                        api.key
                    ) || {
                        today: 0,
                        month: 0,
                        last30Days: 0
                    };

                const todayRemaining =
                    api.quotaType === "daily"
                        ? Math.max(
                            0,
                            Number(api.quotaLimit) -
                            periods.today
                        )
                        : null;

                const monthRemaining =
                    api.key === "weather"
                        ? Math.max(
                            0,
                            30000 -
                            periods.month
                        )
                        : null;

                return {
                    ...api,
                    configured:
                        isApiConfigured(
                            env,
                            api.key
                        ),
                    totalRequests:
                        Number(
                            row?.total_requests
                        ) || 0,
                    todayRequests:
                        periods.today,
                    monthRequests:
                        periods.month,
                    last30DaysRequests:
                        periods.last30Days,
                    todayRemaining,
                    monthRemaining,
                    firstSeenAt:
                        row?.first_seen_at ||
                        null,
                    lastSeenAt:
                        row?.last_seen_at ||
                        null,
                    usageTrackedSeparately:
                        api?.trackingMode !== "grouped"
                };
            });

        return responseJson(
            {
                success:
                    true,
                generatedAt:
                    now.toISOString(),
                tracking:
                    "Worth It upstream/API requests",
                note:
                    "Remaining values use the current provider quota rules and the upstream requests tracked by Worth It since the current tracker was enabled. Provider dashboards may differ when provider-side usage existed before tracking began or when a provider uses model/token-based limits.",
                apis
            },
            200
        );
    }
    catch (error) {
        console.error(
            "Admin API usage stats failed:",
            error
        );

        return responseJson(
            {
                error:
                    "Could not load API usage."
            },
            500
        );
    }
}

function getApiEmoji(
    apiKey
) {
    const key =
        String(
            apiKey || ""
        )
            .toLowerCase();

    if(key.includes("weather")) return "🌤️";
    if(key.includes("news")) return "📰";
    if(key.includes("currenc") || key.includes("exchange")) return "💱";
    if(key.includes("car") || key.includes("vehicle")) return "🚗";
    if(key.includes("market") || key.includes("commodity")) return "📈";
    if(key.includes("crypto") || key.includes("coinmarketcap")) return "🪙";
    if(key.includes("ai") || key.includes("gemini") || key.includes("groq")) return "🤖";
    if(key.includes("feedback") || key.includes("bug") || key.includes("suggest")) return "🐞";
    if(key.includes("shop") || key.includes("product")) return "🛒";
    if(key.includes("water") || key.includes("copernicus") || key.includes("clms")) return "💧";

    return "🔌";
}

function isApiConfigured(
    env,
    apiKey
) {
    switch (apiKey) {
        case "weather":
            return Boolean(
                String(
                    env.VISUAL_CROSSING_API_KEY || ""
                ).trim()
            );

        case "news":
            return Boolean(
                String(
                    env.NEWSDATA_API_KEY || ""
                ).trim()
            );

        case "ai-chat":
            return Boolean(
                String(
                    env.GEMINI_API_KEY || ""
                ).trim()
            ) || Boolean(
                String(
                    env.GROQ_API_KEY || ""
                ).trim()
            );

        case "ship_tracking":
            return Boolean(
                String(
                    env.PELYR_API_KEY || ""
                ).trim()
            );

        case "ship_tracking_euris":
            return Boolean(
                String(
                    env.EURIS_API_TOKEN || ""
                ).trim()
            );

        case "ship_tracking_sources":
            return Boolean(
                String(
                    env.PELYR_API_KEY || ""
                ).trim()
            );

        case "markets":
        case "crypto":
        case "cars":
        case "currencies":
        case "exchange-rate":
        case "feedback":
        case "water-levels":
            return apiKey === "water-levels"
                ? Boolean(
                    String(env.CDSE_ACCESS_TOKEN || "").trim()
                ) || (
                    Boolean(String(env.CDSE_USERNAME || "").trim()) &&
                    Boolean(String(env.CDSE_PASSWORD || "").trim())
                )
                : true;

        default:
            return false;
    }
}
