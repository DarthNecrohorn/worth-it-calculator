const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";

const GEMINI_MODEL = "gemini-3.7-flash";
const GROQ_MODEL = "openai/gpt-oss-120b";

const MAX_MESSAGE_CHARS = 1200;
const MAX_HISTORY_ITEMS = 8;
const MAX_OUTPUT_TOKENS = 500;

const SYSTEM_PROMPT =
"You are Worth It AI, the official assistant for the Worth It decision-calculator website. " +
"Help users with Worth It, its calculators, calculations, costs, savings, purchases, cars, " +
"electric vehicles, gasoline vehicles, loans, investments, salary, technology purchases, " +
"energy, heating, solar panels, profiles, friends, followers, settings, bugs, and suggestions. " +
"Do not act as a general-purpose chatbot. Politely refuse unrelated topics. " +
"Do not invent numerical values. " +
"If a calculation requires information from the user, clearly state which inputs are needed. " +
"Keep responses concise and useful. " +
"You are not a replacement for professional financial advice.";

function responseJson(data, status) {
return new Response(
JSON.stringify(data),
{
status: status || 200,
headers: {
"Content-Type": "application/json; charset=utf-8",
"Cache-Control": "no-store",
"Access-Control-Allow-Origin": SITE_ORIGIN,
"Access-Control-Allow-Headers": "Content-Type, Authorization",
"Access-Control-Allow-Methods": "POST, OPTIONS"
}
}
);
}

function getToken(request) {
const authorization = request.headers.get("Authorization");

```
if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
) {
    return "";
}

return authorization.slice(7).trim();
```

}

function normalizeHistory(history) {
if (!Array.isArray(history)) {
return [];
}

```
return history
    .slice(-MAX_HISTORY_ITEMS)
    .filter(
        item =>
            item &&
            (item.role === "user" ||
                item.role === "assistant") &&
            typeof item.content === "string"
    )
    .map(item => ({
        role: item.role,
        content: item.content.slice(
            0,
            MAX_MESSAGE_CHARS
        )
    }));
```

}

async function verifySupabaseUser(env, token) {
const supabaseUrl =
String(env.SUPABASE_URL || "").trim();

```
const supabaseKey =
    String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();

if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is missing.");
}

if (!supabaseKey) {
    throw new Error(
        "SUPABASE_PUBLISHABLE_KEY is missing."
    );
}

const response = await fetch(
    supabaseUrl + "/auth/v1/user",
    {
        method: "GET",
        headers: {
            apikey: supabaseKey,
            Authorization: "Bearer " + token,
            Accept: "application/json"
        }
    }
);

if (!response.ok) {
    const text = await response.text();

    console.error(
        "Supabase verification failed:",
        response.status,
        text
    );

    return null;
}

const user = await response.json();

if (!user || !user.id) {
    return null;
}

return user;
```

}

async function callGemini(apiKey, contents) {
const url =
"https://generativelanguage.googleapis.com/v1beta/models/" +
encodeURIComponent(GEMINI_MODEL) +
":generateContent";

```
const requestBody = {
    system_instruction: {
        parts: [
            {
                text: SYSTEM_PROMPT
            }
        ]
    },
    contents: contents,
    generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS
    }
};

const response = await fetch(
    url,
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
        },
        body: JSON.stringify(requestBody)
    }
);

const data = await response.json().catch(() => ({}));

if (!response.ok) {
    const error = new Error(
        data &&
        data.error &&
        data.error.message
            ? data.error.message
            : "Gemini request failed."
    );

    error.status = response.status;
    error.provider = "gemini";

    throw error;
}

const parts =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    Array.isArray(data.candidates[0].content.parts)
        ? data.candidates[0].content.parts
        : [];

const answer = parts
    .map(part =>
        part && typeof part.text === "string"
            ? part.text
            : ""
    )
    .join("\n")
    .trim();

if (!answer) {
    const error =
        new Error(
            "Gemini returned an empty response."
        );

    error.status = 502;
    error.provider = "gemini";

    throw error;
}

return answer;
```

}

async function callGroq(apiKey, messages) {
const response = await fetch(
"https://api.groq.com/openai/v1/chat/completions",
{
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: "Bearer " + apiKey
},
body: JSON.stringify({
model: GROQ_MODEL,
messages: messages,
max_tokens: MAX_OUTPUT_TOKENS
})
}
);

```
const data = await response.json().catch(() => ({}));

if (!response.ok) {
    const error = new Error(
        data &&
        data.error &&
        data.error.message
            ? data.error.message
            : "Groq request failed."
    );

    error.status = response.status;
    error.provider = "groq";

    throw error;
}

const answer =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    typeof data.choices[0].message.content === "string"
        ? data.choices[0].message.content.trim()
        : "";

if (!answer) {
    const error =
        new Error(
            "Groq returned an empty response."
        );

    error.status = 502;
    error.provider = "groq";

    throw error;
}

return answer;
```

}

function shouldUseGroq(error) {
const status =
Number(
error && error.status
? error.status
: 0
);

```
return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
);
```

}

export async function onRequestOptions() {
return new Response(
null,
{
status: 204,
headers: {
"Access-Control-Allow-Origin": SITE_ORIGIN,
"Access-Control-Allow-Headers":
"Content-Type, Authorization",
"Access-Control-Allow-Methods":
"POST, OPTIONS"
}
}
);
}

export async function onRequestPost(context) {
try {
const request = context.request;
const env = context.env;

```
    const origin =
        request.headers.get("Origin") || "";

    if (
        origin &&
        origin !== SITE_ORIGIN
    ) {
        return responseJson(
            {
                error: "Forbidden origin."
            },
            403
        );
    }

    const token = getToken(request);

    if (!token) {
        return responseJson(
            {
                error:
                    "Please sign in to use Worth It AI."
            },
            401
        );
    }

    const user =
        await verifySupabaseUser(
            env,
            token
        );

    if (!user) {
        return responseJson(
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
        return responseJson(
            {
                error:
                    "Invalid JSON request."
            },
            400
        );
    }

    const message =
        typeof body.message === "string"
            ? body.message.trim()
            : "";

    if (!message) {
        return responseJson(
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
        return responseJson(
            {
                error:
                    "Message is too long."
            },
            400
        );
    }

    const history =
        normalizeHistory(
            body.history
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

            return responseJson(
                {
                    provider: "gemini",
                    answer: answer
                },
                200
            );
        } catch (error) {
            console.error(
                "Gemini request failed:",
                error
            );

            if (!shouldUseGroq(error)) {
                return responseJson(
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
        return responseJson(
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

        return responseJson(
            {
                provider: "groq",
                answer: answer
            },
            200
        );
    } catch (error) {
        console.error(
            "Groq request failed:",
            error
        );

        return responseJson(
            {
                error:
                    "Both AI providers are temporarily unavailable. Please try again later."
            },
            503
        );
    }
} catch (error) {
    console.error(
        "Unhandled ai-chat error:",
        error
    );

    return responseJson(
        {
            error:
                "AI request failed. Please try again."
        },
        500
    );
}
```

}
