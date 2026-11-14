import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/ai-chat.js";

const PREVIEW_ORIGIN = "https://pr-preview-123.worth-it-calculator.pages.dev";

function createRequest(message, { origin = PREVIEW_ORIGIN, token = "valid-token" } = {}) {
    const headers = new Headers({
        Origin: origin,
        Accept: "text/event-stream",
        "Content-Type": "application/json"
    });
    if (token) headers.set("Authorization", "Bearer " + token);
    return new Request(origin + "/api/ai-chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message, history: [] })
    });
}

async function withFetch(mock, callback) {
    const previous = globalThis.fetch;
    globalThis.fetch = mock;
    try {
        return await callback();
    } finally {
        globalThis.fetch = previous;
    }
}

function sseResponse(events) {
    const body = events.join("\n\n") + "\n\n";
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
        }
    }), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
    });
}

test("AI Chat requires a signed-in Worth It account before contacting a model", async () => {
    let providerCalls = 0;
    await withFetch(async () => {
        providerCalls++;
        throw new Error("A model provider must not be called without authentication.");
    }, async () => {
        const response = await onRequestPost({
            request: createRequest("Hello", { token: "" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "public" }
        });
        assert.equal(response.status, 401);
        assert.match((await response.json()).error, /sign in/i);
        assert.equal(providerCalls, 0);
    });
});

test("AI Chat rejects an untrusted website origin", async () => {
    let providerCalls = 0;
    await withFetch(async () => {
        providerCalls++;
        throw new Error("A model provider must not be called from an untrusted origin.");
    }, async () => {
        const response = await onRequestPost({
            request: createRequest("Hello", { origin: "https://evil.example" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "public" }
        });
        assert.equal(response.status, 403);
        assert.equal(providerCalls, 0);
    });
});

test("AI Chat streams from Gemini first and falls back to low-reasoning Groq without CALC or UGC quota calls", async () => {
    let authCalls = 0;
    let geminiCalls = 0;
    let groqCalls = 0;
    let rpcCalls = 0;
    await withFetch(async (url, options = {}) => {
        const path = String(url);
        if (path.endsWith("/auth/v1/user")) {
            authCalls++;
            assert.equal(options.headers.Authorization, "Bearer valid-token");
            return new Response(JSON.stringify({
                id: "chat-user",
                email_confirmed_at: "2026-01-01T00:00:00Z"
            }), { status: 200 });
        }
        if (path.includes("generativelanguage.googleapis.com")) {
            geminiCalls++;
            assert.match(path, /gemini-3\.8-flash:streamGenerateContent/);
            const request = JSON.parse(options.body);
            assert.equal(request.generationConfig.maxOutputTokens, 700);
            assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, "low");
            return new Response(JSON.stringify({
                error: { code: 503, status: "UNAVAILABLE", message: "Gemini temporarily unavailable." }
            }), { status: 503 });
        }
        if (path.includes("api.groq.com/openai/v1/chat/completions")) {
            groqCalls++;
            const request = JSON.parse(options.body);
            assert.equal(request.model, "openai/gpt-oss-120b");
            assert.equal(request.max_completion_tokens, 700);
            assert.equal(request.reasoning_effort, "low");
            assert.equal(request.include_reasoning, false);
            assert.equal(request.stream, true);
            assert.equal(request.messages.at(-1).content, "Explain why annual fuel cost depends on distance and consumption.");
            return sseResponse([
                "data: " + JSON.stringify({ choices: [{ delta: { content: "Annual fuel cost depends on the distance driven and fuel consumed per kilometre." } }] }),
                "data: [DONE]"
            ]);
        }
        if (path.includes("/rest/v1/rpc/")) {
            rpcCalls++;
            throw new Error("AI Chat must not call CALC or UGC quota RPCs.");
        }
        throw new Error("Unexpected AI Chat request: " + path);
    }, async () => {
        const response = await onRequestPost({
            request: createRequest("Explain why annual fuel cost depends on distance and consumption."),
            env: {
                SUPABASE_URL: "https://supabase.example",
                SUPABASE_PUBLISHABLE_KEY: "publishable",
                GEMINI_API_KEY: "gemini-test",
                GROQ_API_KEY: "groq-test"
            }
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("Content-Type"), /text\/event-stream/i);
        const stream = await response.text();
        assert.match(stream, /"type":"start"/);
        assert.match(stream, /"type":"chunk","provider":"groq"/);
        assert.match(stream, /Annual fuel cost depends on the distance driven/);
        assert.match(stream, /"type":"done","provider":"groq"/);
        assert.equal(authCalls, 1);
        assert.equal(geminiCalls, 1);
        assert.equal(groqCalls, 1);
        assert.equal(rpcCalls, 0);
    });
});

test("AI Chat can stream a successful Gemini response without invoking Groq", async () => {
    let geminiCalls = 0;
    let groqCalls = 0;
    await withFetch(async (url) => {
        const path = String(url);
        if (path.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({
                id: "chat-user",
                email_confirmed_at: "2026-01-01T00:00:00Z"
            }), { status: 200 });
        }
        if (path.includes("generativelanguage.googleapis.com")) {
            geminiCalls++;
            return sseResponse([
                "data: " + JSON.stringify({
                    candidates: [{ content: { parts: [{ text: "Worth It helps compare costs and trade-offs." }] } }]
                })
            ]);
        }
        if (path.includes("api.groq.com")) {
            groqCalls++;
            throw new Error("Groq must not be called after successful Gemini streaming.");
        }
        throw new Error("Unexpected AI Chat request: " + path);
    }, async () => {
        const response = await onRequestPost({
            request: createRequest("What is Worth It?"),
            env: {
                SUPABASE_URL: "https://supabase.example",
                SUPABASE_PUBLISHABLE_KEY: "publishable",
                GEMINI_API_KEY: "gemini-test",
                GROQ_API_KEY: "groq-test"
            }
        });
        assert.equal(response.status, 200);
        const stream = await response.text();
        assert.match(stream, /Worth It helps compare costs and trade-offs/);
        assert.match(stream, /"type":"done","provider":"gemini"/);
        assert.equal(geminiCalls, 1);
        assert.equal(groqCalls, 0);
    });
});
