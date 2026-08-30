```javascript
const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ALLOWED_ORIGIN = SITE_ORIGIN;

const GEMINI_MODEL = "gemini-3.7-flash";
const GROQ_MODEL = "openai/gpt-oss-120b";

const MAX_MESSAGE_CHARS = 1200;
const MAX_HISTORY_ITEMS = 8;
const MAX_OUTPUT_TOKENS = 500;

const TOPIC_TERMS = [
    "worth it",
    "calculator",
    "calculate",
    "calculation",
    "cost",
    "price",
    "saving",
    "savings",
    "loan",
    "interest",
    "investment",
    "salary",
    "income",
    "car",
    "cars",
    "electric",
    "ev",
    "gas",
    "fuel",
    "insurance",
    "repair",
    "replace",
    "subscription",
    "subscribe",
    "rent",
    "buy",
    "buying",
    "home",
    "house",
    "mortgage",
    "electricity",
    "energy",
    "solar",
    "heating",
    "phone",
    "pc",
    "computer",
    "monitor",
    "storage",
    "technology",
    "purchase",
    "debt",
    "emergency fund",
    "compound",
    "price increase",
    "profile",
    "friends",
    "followers",
    "following",
    "settings",
    "bug",
    "suggestion",
    "website",
    "site"
];

function json(data, status = 200, extra = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            ...extra
        }
    });
}

function normalizeHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .slice(-MAX_HISTORY_ITEMS)
        .filter(
            item =>
                item &&
                (item.role === "user" || item.role === "assistant") &&
                typeof item.content === "string"
        )
        .map(item => ({
            role: item.role,
            content: item.content.slice(0, MAX_MESSAGE_CHARS)
        }));
}

function looksOnTopic(text) {
    const normalized = text.toLowerCase();

    return TOPIC_TERMS.some(term =>
        normalized.includes(term)
    );
}

const SYSTEM_PROMPT = [
    "You are Worth It AI, the official assistant for the Worth It decision-calculator website.",
    "",
    "Your job is strictly limited to helping users with:",
    "* the Worth It website",
    "* Worth It calculators",
    "* calculator inputs",
    "* mathematical calculations related to the calculators",
    "* formulas used by the calculators",
    "* cost comparisons",
    "* savings comparisons",
    "* purchase decisions",
    "* cars",
    "* electric vehicles",
    "* gasoline vehicles",
    "* money calculations",
    "* saving",
    "* investing",
    "* loans",
    "* income and salary calculations",
    "* technology purchase calculations",
    "* PC upgrades",
    "* phone upgrades",
    "* home-cost calculations",
    "* rent versus buying",
    "* mortgage calculations",
    "* electricity",
    "* energy",
    "* solar panels",
    "* heating",
    "* account features",
    "* profile features",
    "* friends",
    "* followers",
    "* following",
    "* website settings",
    "* bugs and suggestions related to Worth It",
    "",
    "Do NOT act as a general-purpose chatbot.",
    "",
    "Do NOT answer unrelated questions about politics, news, entertainment, medicine, law, unrelated programming, unrelated coding, gaming unrelated to Worth It, general trivia, unrelated personal advice, unrelated products or services, or topics unrelated to Worth It.",
    "",
    "If the user asks an unrelated question, politely explain that you only help with Worth It and its calculators.",
    "",
    "Do not invent numerical values.",
    "",
    "If a calculation requires information from the user, clearly state which inputs are needed.",
    "",
    "When discussing a Worth It calculator, explain calculations in a simple and understandable way.",
    "",
    "You may explain formulas and show arithmetic when that directly relates to Worth It.",
    "",
    "Do not claim access to private databases, private user information, Supabase tables, Cloudflare configuration, GitHub repositories, or hidden infrastructure unless that information is explicitly provided by the user.",
    "",
    "Keep responses concise and useful.",
    "",
    "You are not a replacement for professional financial advice."
].join("\n");

function extractGeminiText(data) {
    const parts =
        data?.candidates?.[0]?.content?.parts || [];

    return parts
        .map(part => part?.text || "")
        .join("\n")
        .trim();
}

async function callGemini(apiKey, contents) {
    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(GEMINI_MODEL) +
        ":generateContent";

    const body = {
        system_instruction: {
            parts: [
                {
                    text: SYSTEM_PROMPT
                }
            ]
        },
        contents,
        generationConfig: {
            maxOutputTokens: MAX_OUTPUT_TOKENS
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
        },
        body: JSON.stringify(body)
    });

    const data =
        await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(
            data?.error?.message ||
            "Gemini request failed with HTTP status " +
                response.status
        );

        error.status = response.status;
        error.provider = "gemini";

        throw error;
    }

    const text = extractGeminiText(data);

    if (!text) {
        const error =
            new Error("Gemini returned an empty response.");

        error.status = 502;
        error.provider = "gemini";

        throw error;
    }

    return text;
}

async function callGroq(apiKey, messages) {
    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + apiKey
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                max_tokens: MAX_OUTPUT_TOKENS
            })
        }
    );

    const data =
        await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(
            data?.error?.message ||
            "Groq request failed with HTTP status " +
                response.status
        );

        error.status = response.status;
        error.provider = "groq";

        throw error;
    }

    const text =
        String(
            data?.choices?.[0]?.message?.content || ""
        ).trim();

    if (!text) {
        const error =
            new Error("Groq returned an empty response.");

        error.status = 502;
        error.provider = "groq";

        throw error;
    }

    return text;
}

function shouldFallback(error) {
    const status = Number(error?.status || 0);

    return (
        status === 408 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    );
}

function getBearerToken(request) {
    const authorization =
        request.headers.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
        return "";
    }

    return authorization
        .slice("Bearer ".length)
        .trim();
}

async function verifySupabaseUser(env, accessToken) {
    if (!env.SUPABASE_URL) {
        throw new Error("SUPABASE_URL is missing.");
    }

    if (!env.SUPABASE_PUBLISHABLE_KEY) {
        throw new Error(
            "SUPABASE_PUBLISHABLE_KEY is missing."
        );
    }

    const supabaseUrl =
        String(env.SUPABASE_URL)
            .trim()
            .replace(/\/+$/, "");

    const response = await fetch(
        supabaseUrl + "/auth/v1/user",
        {
            method: "GET",
            headers: {
                "apikey": env.SUPABASE_PUBLISHABLE_KEY,
                "Authorization": "Bearer " + accessToken,
                "Accept": "application/json"
            }
        }
    );

    const responseText =
        await response.text();

    let data = null;

    try {
        data = responseText
            ? JSON.parse(responseText)
            : null;
    } catch {
        data = null;
    }

    if (!response.ok) {
        console.error(
            "Supabase user verification failed:",
            response.status
        );

        return null;
    }

    if (!data?.id) {
        console.error(
            "Supabase returned a response without a user id."
        );

        return null;
    }

    return data;
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization",
            "Access-Control-Allow-Methods":
                "POST, OPTIONS"
        }
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const origin =
        request.headers.get("Origin") || "";

    if (
        origin &&
        origin !== ALLOWED_ORIGIN
    ) {
        return json(
            {
                error: "Forbidden origin."
            },
            403
        );
    }

    const accessToken =
        getBearerToken(request);

    if (!accessToken) {
        return json(
            {
                error:
                    "Please sign in to use Worth It AI."
            },
            401
        );
    }

    let user;

    try {
        user =
            await verifySupabaseUser(
                env,
                accessToken
            );
    } catch (authError) {
        console.error(
            "Supabase configuration error:",
            authError
        );

        return json(
            {
                error:
                    "Supabase authentication is not configured correctly."
            },
            503
        );
    }

    if (!user) {
        return json(
            {
                error:
                    "Your login session is invalid or expired. Please sign in again."
            },
            401
        );
    }

    let body;

    try {
        body = await request.json();
    } catch {
        return json(
            {
                error: "Invalid JSON request."
            },
            400
        );
    }

    const message =
        typeof body?.message === "string"
            ? body.message.trim()
            : "";

    if (!message) {
        return json(
            {
                error: "Please enter a message."
            },
            400
        );
    }

    if (
        message.length >
        MAX_MESSAGE_CHARS
    ) {
        return json(
            {
                error:
                    "Message is limited to " +
                    MAX_MESSAGE_CHARS +
                    " characters."
            },
            400
        );
    }

    if (!looksOnTopic(message)) {
        return json({
            provider: "guard",
            answer:
                "I'm Worth It AI, so I can only help with Worth It, its calculators, calculations, comparisons, costs, savings, and website features."
        });
    }

    const history =
        normalizeHistory(
            body?.history
        );

    const geminiContents = [
        ...history.map(item => ({
            role:
                item.role === "assistant"
                    ? "model"
                    : "user",
            parts: [
                {
                    text: item.content
                }
            ]
        })),
        {
            role: "user",
            parts: [
                {
                    text: message
                }
            ]
        }
    ];

    const groqMessages = [
        {
            role: "system",
            content: SYSTEM_PROMPT
        },
        ...history.map(item => ({
            role: item.role,
            content: item.content
        })),
        {
            role: "user",
            content: message
        }
    ];

    if (env.GEMINI_API_KEY) {
        try {
            const answer =
                await callGemini(
                    env.GEMINI_API_KEY,
                    geminiContents
                );

            return json({
                provider: "gemini",
                answer
            });
        } catch (geminiError) {
            console.error(
                "Gemini request failed:",
                geminiError
            );

            if (!shouldFallback(geminiError)) {
                return json(
                    {
                        error:
                            "Gemini is temporarily unavailable. Please try again later."
                    },
                    503
                );
            }
        }
    }

    if (!env.GROQ_API_KEY) {
        return json(
            {
                error:
                    "Gemini is unavailable and Groq backup is not configured."
            },
            503
        );
    }

    try {
        const answer =
            await callGroq(
                env.GROQ_API_KEY,
                groqMessages
            );

        return json({
            provider: "groq",
            answer
        });
    } catch (groqError) {
        console.error(
            "Groq fallback request failed:",
            groqError
        );

        return json(
            {
                error:
                    "Both Worth It AI providers are temporarily unavailable. Please try again later."
            },
            503
        );
    }
}
```
