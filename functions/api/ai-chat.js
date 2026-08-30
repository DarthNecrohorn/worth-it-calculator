const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ALLOWED_ORIGIN = SITE_ORIGIN;

const GEMINI_MODEL = "gemini-3.7-flash";
const GROK_MODEL = "grok-4.6";

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
    "subscribe",
    "subscription",
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
    "friends",
    "followers",
    "following",
    "profile",
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

const SYSTEM_PROMPT = `
You are Worth It AI, the official assistant for the Worth It decision-calculator website.

Your job is strictly limited to helping users with:
- the Worth It website
- its calculators
- calculations
- calculator inputs
- formulas used by the calculators
- cost comparisons
- savings comparisons
- purchase decisions
- cars
- money calculations
- technology purchase calculations
- home-cost calculations
- account features
- profile features
- friends/followers/following features
- website settings
- bugs and suggestions related to Worth It

Do NOT act as a general-purpose chatbot.

Do NOT answer:
- general politics
- news
- entertainment
- unrelated coding questions
- unrelated programming
- medical questions
- legal questions
- unrelated personal advice
- unrelated trivia
- requests unrelated to Worth It

For an off-topic question, politely explain that you only help with Worth It and its calculators.

Do not claim access to:
- private databases
- Supabase tables
- Cloudflare settings
- GitHub repositories
- private user data
- hidden website infrastructure

unless the user explicitly provides that information in the conversation.

Do not invent numerical values.

When a calculation requires user inputs, explain which inputs are needed.

Keep answers concise, useful and practical.

You are not a replacement for professional financial advice.
`;

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
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

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
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.2
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
            `Gemini HTTP ${response.status}`
        );

        error.status = response.status;

        throw error;
    }

    const text = extractGeminiText(data);

    if (!text) {
        throw new Error(
            "Gemini returned an empty response."
        );
    }

    return text;
}

async function callGrok(apiKey, messages) {
    const url =
        "https://api.x.ai/v1/chat/completions";

    const body = {
        model: GROK_MODEL,

        messages,

        temperature: 0.2,

        max_tokens: MAX_OUTPUT_TOKENS
    };

    const response = await fetch(url, {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },

        body: JSON.stringify(body)
    });

    const data =
        await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(
            data?.error?.message ||
            `Grok HTTP ${response.status}`
        );

        error.status = response.status;

        throw error;
    }

    const text =
        String(
            data?.choices?.[0]?.message?.content || ""
        ).trim();

    if (!text) {
        throw new Error(
            "Grok returned an empty response."
        );
    }

    return text;
}

function shouldFallback(error) {
    const status =
        Number(error?.status || 0);

    return (
        status === 408 ||
        status === 429 ||
        status >= 500
    );
}

export async function onRequestOptions(context) {
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
    const {
        request,
        env
    } = context;

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

    const authorization =
        request.headers.get("Authorization") || "";

    if (
        !authorization.startsWith("Bearer ")
    ) {
        return json(
            {
                error:
                    "Please sign in to use Worth It AI."
            },
            401
        );
    }

    const accessToken =
        authorization
            .slice("Bearer ".length)
            .trim();

    if (!accessToken) {
        return json(
            {
                error:
                    "Please sign in to use Worth It AI."
            },
            401
        );
    }

    /*
     * Verify the Supabase access token
     * using Supabase's /auth/v1/user endpoint.
     */

    const supabaseUrl =
        env.SUPABASE_URL;

    const supabaseKey =
        env.SUPABASE_PUBLISHABLE_KEY;

    if (
        !supabaseUrl ||
        !supabaseKey
    ) {
        return json(
            {
                error:
                    "AI authentication is not configured."
            },
            500
        );
    }

    const userResponse = await fetch(
        `${supabaseUrl}/auth/v1/user`,
        {
            headers: {
                apikey: supabaseKey,
                Authorization:
                    `Bearer ${accessToken}`
            }
        }
    );

    if (!userResponse.ok) {
        return json(
            {
                error:
                    "Your sign-in session is not valid. Please sign in again."
            },
            401
        );
    }

    let body = {};

    try {
        body = await request.json();
    } catch {
        return json(
            {
                error: "Invalid request."
            },
            400
        );
    }

    const message =
        typeof body.message === "string"
            ? body.message.trim()
            : "";

    if (!message) {
        return json(
            {
                error:
                    "Please enter a message."
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
                    `Message is limited to ${MAX_MESSAGE_CHARS} characters.`
            },
            400
        );
    }

    /*
     * Cheap local filter before spending
     * an AI request on clearly unrelated questions.
     */

    if (!looksOnTopic(message)) {
        return json({
            provider: "guard",

            answer:
                "I'm Worth It AI, so I can only help with Worth It, its calculators, calculations, comparisons, costs, savings, and website features. Ask me something related to the site."
        });
    }

    const history =
        normalizeHistory(
            body.history
        );

    /*
     * Gemini uses:
     * user -> user
     * assistant -> model
     */

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

    /*
     * Grok uses standard chat-completion roles.
     */

    const grokMessages = [
        {
            role: "system",

            content:
                SYSTEM_PROMPT
        },

        ...history.map(item => ({
            role: item.role,

            content:
                item.content
        })),

        {
            role: "user",

            content:
                message
        }
    ];

    if (
        !env.GEMINI_API_KEY ||
        !env.XAI_API_KEY
    ) {
        return json(
            {
                error:
                    "AI provider secrets are not configured yet."
            },
            503
        );
    }

    /*
     * Primary provider:
     * Gemini
     */

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
            "Gemini primary request failed:",
            geminiError
        );

        /*
         * Only use Grok when Gemini is temporarily
         * unavailable or rate limited.
         */

        if (
            !shouldFallback(
                geminiError
            )
        ) {
            return json(
                {
                    error:
                        "Gemini is temporarily unavailable. Please try again later."
                },
                503
            );
        }
    }

    /*
     * Backup provider:
     * Grok
     */

    try {
        const answer =
            await callGrok(
                env.XAI_API_KEY,
                grokMessages
            );

        return json({
            provider: "grok",
            answer
        });

    } catch (grokError) {
        console.error(
            "Grok fallback request failed:",
            grokError
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
