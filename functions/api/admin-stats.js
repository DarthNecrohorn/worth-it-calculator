const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ADMIN_USER_ID = "c3560d70-8b68-49f0-b3f1-9e248673553c";

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
        key: "feedback",
        name: "Feedback",
        emoji: "🐞",
        provider: "Supabase",
        endpoint: "/api/feedback",
        category: "Site",
        quotaType: "dynamic",
        quotaLabel: "Provider dependent"
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
            user?.id !==
            ADMIN_USER_ID
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

        const discoveredApis =
            totals
                .filter(
                    row =>
                        row?.api_key &&
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
                        null
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

        case "markets":
        case "crypto":
        case "cars":
        case "currencies":
        case "exchange-rate":
        case "feedback":
            return true;

        default:
            return false;
    }
}
