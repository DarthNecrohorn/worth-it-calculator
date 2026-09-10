const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";

const GEMINI_MODEL = "gemini-3.7-flash";
const GROQ_MODEL = "openai/gpt-oss-120b";

const MAX_MESSAGE_CHARS = 1200;
const MAX_HISTORY_ITEMS = 8;
const MAX_OUTPUT_TOKENS = 1000;

const SYSTEM_PROMPT =
"You are Worth It AI, the official assistant for the Worth It decision-calculator website. " +
"Help users with Worth It, its calculators, calculations, costs, savings, purchases, cars, " +
"electric vehicles, gasoline vehicles, loans, investments, salary, technology purchases, " +
"energy, heating, solar panels, profiles, friends, followers, settings, bugs, and suggestions. " +
"Do not act as a general-purpose chatbot. Politely refuse unrelated topics. " +
"Always answer the user's actual question directly before asking for additional information. " +
"For broad, general, or casual questions, give a useful answer immediately and do not ask for detailed numerical inputs. " +
"Do not turn a general question into a calculator questionnaire. " +
"Only ask for additional information when the user explicitly wants a precise calculation, exact comparison, " +
"Worth It score, personalized financial result, or another result that genuinely requires missing inputs. " +
"Support both European and American units and conventions. " +
"Understand and use km and miles, L/100 km and MPG, Celsius and Fahrenheit, " +
"liters and gallons, kilograms and pounds, km/h and mph, kWh/100 km and kWh/100 miles, " +
"and other common metric and imperial units. " +
"When useful, you may show both metric and imperial values so users from different regions can understand them. " +
"Do not assume the user is from the United States or Europe unless the context indicates it. " +
"Respect the units explicitly provided by the user. " +
"Support multiple currencies and currency conventions, including EUR, USD, GBP, RSD, " +
"and other commonly used currencies. " +
"Never assume a currency when the currency is important to the calculation and the user has not provided one. " +
"When comparing currencies, clearly identify the currency used. " +
"Do not invent exchange rates or current prices. " +
"For general questions, keep the answer short, direct, and useful. " +
"For broad comparison questions, summarize the main advantages, disadvantages, costs, and trade-offs without requesting detailed inputs. " +
"If the user asks which option is better, give a conditional recommendation based on the information available instead of immediately asking a long list of questions. " +
"If the available information is insufficient for a definitive recommendation, explain what generally matters most and optionally offer a precise calculation. " +
"For Worth It calculator questions, use the information provided by the user and clearly identify only the inputs that are still required. " +
"Do not invent numerical values, prices, fuel costs, electricity prices, exchange rates, vehicle specifications, salaries, or other factual numbers. " +
"Keep responses concise, practical, and easy to read. " +
"Prefer short paragraphs and bullet points. " +
"For simple comparisons, normally use 3 to 5 short bullet points instead of a table. " +
"When a table is useful, keep it very compact and normally use only the most important 2 to 5 comparison points. " +
"Never create a large table simply to list every possible input, assumption, advantage, disadvantage, or specification. " +
"Do not list all possible calculator inputs unless the user explicitly asks what information is needed. " +
"When a user asks a simple question, answer it simply. " +
"Do not respond to a simple question with a full questionnaire. " +
"Do not ask for purchase price, annual mileage, energy prices, fuel prices, financing, ownership period, location, depreciation, insurance, or other detailed inputs unless the user explicitly requests a precise financial calculation or comparison. " +
"If a precise calculation is requested, ask only for the minimum missing information needed to calculate it. " +
"Be neutral and honest. Do not automatically recommend the more expensive option. " +
"Base recommendations on the user's stated goals, costs, usage, ownership period, and other relevant factors. " +
"Do not make unsupported claims that one option is always better. " +
"If the available information is insufficient for a confident recommendation, say so clearly without turning the response into a questionnaire. " +
"When appropriate, finish by briefly offering a more precise Worth It calculation, but do not pressure the user to provide information.";

function responseJson(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        }
    });
}

function getToken(request) {
    const authorization =
        request.headers.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
        return "";
    }

    return authorization.slice(7).trim();
}

function normalizeHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .slice(-MAX_HISTORY_ITEMS)
        .filter(function (item) {
            return (
                item &&
                (item.role === "user" ||
                    item.role === "assistant") &&
                typeof item.content === "string"
            );
        })
        .map(function (item) {
            return {
                role: item.role,
                content: item.content.slice(
                    0,
                    MAX_MESSAGE_CHARS
                )
            };
        });
}

async function verifySupabaseUser(env, token) {
    const supabaseUrl =
        String(env.SUPABASE_URL || "").trim();

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
                "apikey": supabaseKey,
                "Authorization": "Bearer " + token,
                "Accept": "application/json"
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
}

function createStreamResponse(stream) {
    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "X-Accel-Buffering": "no"
        }
    });
}

function encodeSSE(data) {
    return "data: " + JSON.stringify(data) + "\n\n";
}

function createSSEWriter(controller) {
    const encoder = new TextEncoder();

    return function (data) {
        controller.enqueue(
            encoder.encode(
                encodeSSE(data)
            )
        );
    };
}

async function streamGemini(apiKey, contents, send) {
    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(GEMINI_MODEL) +
        ":streamGenerateContent?alt=sse";

    const response = await fetch(
        url,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
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
            })
        }
    );

    if (!response.ok || !response.body) {
        const text = await response.text().catch(function () {
            return "";
        });

        let data = {};

        try {
            data = JSON.parse(text);
        } catch (error) {
            data = {};
        }

        const error = new Error(
            data &&
            data.error &&
            data.error.message
                ? data.error.message
                : "Gemini streaming request failed."
        );

        error.status = response.status;

        throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let fullAnswer = "";

    while (true) {
        const result = await reader.read();

        if (result.done) {
            break;
        }

        buffer += decoder.decode(
            result.value,
            {
                stream: true
            }
        );

        const events = buffer.split("\n\n");

        buffer = events.pop() || "";

        for (const event of events) {
            const lines = event.split("\n");

            for (const line of lines) {
                if (!line.startsWith("data:")) {
                    continue;
                }

                const rawData = line.slice(5).trim();

                if (!rawData) {
                    continue;
                }

                let data;

                try {
                    data = JSON.parse(rawData);
                } catch (error) {
                    continue;
                }

                const parts =
                    data &&
                    data.candidates &&
                    data.candidates[0] &&
                    data.candidates[0].content &&
                    Array.isArray(
                        data.candidates[0].content.parts
                    )
                        ? data.candidates[0].content.parts
                        : [];

                const text = parts
                    .map(function (part) {
                        return part &&
                            typeof part.text === "string"
                            ? part.text
                            : "";
                    })
                    .join("");

                if (!text) {
                    continue;
                }

                fullAnswer += text;

                send({
                    type: "chunk",
                    provider: "gemini",
                    text: text
                });
            }
        }
    }

    buffer += decoder.decode();

    if (!fullAnswer.trim()) {
        const error = new Error(
            "Gemini returned an empty response."
        );

        error.status = 502;

        throw error;
    }

    return fullAnswer.trim();
}

async function streamGroq(apiKey, messages, send) {
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
                messages: messages,
                max_tokens: MAX_OUTPUT_TOKENS,
                stream: true
            })
        }
    );

    if (!response.ok || !response.body) {
        const text = await response.text().catch(function () {
            return "";
        });

        let data = {};

        try {
            data = JSON.parse(text);
        } catch (error) {
            data = {};
        }

        const error = new Error(
            data &&
            data.error &&
            data.error.message
                ? data.error.message
                : "Groq streaming request failed."
        );

        error.status = response.status;

        throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let fullAnswer = "";

    while (true) {
        const result = await reader.read();

        if (result.done) {
            break;
        }

        buffer += decoder.decode(
            result.value,
            {
                stream: true
            }
        );

        const events = buffer.split("\n\n");

        buffer = events.pop() || "";

        for (const event of events) {
            const lines = event.split("\n");

            for (const line of lines) {
                if (!line.startsWith("data:")) {
                    continue;
                }

                const rawData = line.slice(5).trim();

                if (!rawData || rawData === "[DONE]") {
                    continue;
                }

                let data;

                try {
                    data = JSON.parse(rawData);
                } catch (error) {
                    continue;
                }

                const text =
                    data &&
                    data.choices &&
                    data.choices[0] &&
                    data.choices[0].delta &&
                    typeof data.choices[0].delta.content === "string"
                        ? data.choices[0].delta.content
                        : "";

                if (!text) {
                    continue;
                }

                fullAnswer += text;

                send({
                    type: "chunk",
                    provider: "groq",
                    text: text
                });
            }
        }
    }

    buffer += decoder.decode();

    if (!fullAnswer.trim()) {
        const error = new Error(
            "Groq returned an empty response."
        );

        error.status = 502;

        throw error;
    }

    return fullAnswer.trim();
}

function shouldUseGroq(error) {
    const status =
        Number(
            error && error.status
                ? error.status
                : 0
        );

    return (
        status === 408 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
    );
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization",
            "Access-Control-Allow-Methods":
                "POST, OPTIONS"
        }
    });
}

export async function onRequestPost(context) {
    const request = context.request;
    const env = context.env;

    try {
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
        } catch (error) {
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

        const geminiContents =
            history.map(function (item) {
                return {
                    role:
                        item.role === "assistant"
                            ? "model"
                            : "user",
                    parts: [
                        {
                            text:
                                item.content
                        }
                    ]
                };
            });

        geminiContents.push({
            role: "user",
            parts: [
                {
                    text: message
                }
            ]
        });

        const groqMessages = [
            {
                role: "system",
                content: SYSTEM_PROMPT
            }
        ];

        history.forEach(function (item) {
            groqMessages.push({
                role: item.role,
                content: item.content
            });
        });

        groqMessages.push({
            role: "user",
            content: message
        });

        const stream = new ReadableStream({
            async start(controller) {
                const send =
                    createSSEWriter(controller);

                try {
                    send({
                        type: "start"
                    });

                    if (env.GEMINI_API_KEY) {
                        try {
                            await streamGemini(
                                env.GEMINI_API_KEY,
                                geminiContents,
                                send
                            );

                            send({
                                type: "done",
                                provider: "gemini"
                            });

                            controller.close();

                            return;
                        } catch (geminiError) {
                            console.error(
                                "Gemini streaming request failed:",
                                geminiError
                            );

                            if (
                                !shouldUseGroq(
                                    geminiError
                                )
                            ) {
                                send({
                                    type: "error",
                                    error:
                                        "Gemini is temporarily unavailable. Please try again later."
                                });

                                controller.close();

                                return;
                            }
                        }
                    }

                    if (!env.GROQ_API_KEY) {
                        send({
                            type: "error",
                            error:
                                "Gemini is unavailable and Groq backup is not configured."
                        });

                        controller.close();

                        return;
                    }

                    try {
                        await streamGroq(
                            env.GROQ_API_KEY,
                            groqMessages,
                            send
                        );

                        send({
                            type: "done",
                            provider: "groq"
                        });

                        controller.close();
                    } catch (groqError) {
                        console.error(
                            "Groq streaming request failed:",
                            groqError
                        );

                        send({
                            type: "error",
                            error:
                                "Both AI providers are temporarily unavailable. Please try again later."
                        });

                        controller.close();
                    }
                } catch (error) {
                    console.error(
                        "Unhandled ai-chat stream error:",
                        error
                    );

                    try {
                        send({
                            type: "error",
                            error:
                                "AI request failed. Please try again."
                        });
                    } catch (sendError) {
                        console.error(
                            "Could not send stream error:",
                            sendError
                        );
                    }

                    controller.close();
                }
            }
        });

        return createStreamResponse(stream);
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
}
