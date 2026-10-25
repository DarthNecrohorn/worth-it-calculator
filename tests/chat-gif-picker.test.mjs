import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest as chatGifConfig } from "../functions/api/chat-gif-config.js";
import { onRequest as chatGifDownload } from "../functions/api/chat-gif-download.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ENV = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    GIPHY_API_KEY: "public-test-giphy-key"
};
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");

function request(path, { origin = SITE_ORIGIN, token = "test-session-token" } = {}) {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (token) headers.Authorization = "Bearer " + token;
    return new Request(SITE_ORIGIN + path, { method: "GET", headers });
}

function mockFetch(remoteResponse = null) {
    const calls = [];
    const fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "test-user" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (url.startsWith("https://media0.giphy.com/")) {
            return remoteResponse || new Response(
                Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00]),
                { status: 200, headers: { "Content-Type": "image/gif" } }
            );
        }
        throw new Error("Unexpected network request: " + url);
    };
    return { fetch, calls };
}

async function withFetch(fetchImpl, callback) {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try { return await callback(); }
    finally { globalThis.fetch = original; }
}

test("the composer exposes upload, emoji and GIF choices from the plus button", () => {
    assert.match(html, /id="worthItChatPlusBtn"/);
    assert.match(html, /id="worthItChatUploadAction"/);
    assert.match(html, /id="worthItChatEmojiAction"/);
    assert.match(html, /id="worthItChatGifAction"/);
    assert.match(html, /id="worthItChatEmojiGrid"/);
    assert.match(html, /id="worthItChatGifGrid"/);
    assert.match(html, /chat-ui\.js\?v=chatemoji-gif-picker-20261025a/);
    assert.match(client, /function insertWorthItChatEmoji\(/);
    assert.match(client, /function loadWorthItChatGifResults\(/);
    assert.match(client, /function selectWorthItChatGif\(/);
});

test("GIPHY configuration is available only to a verified signed-in user", async () => {
    const mock = mockFetch();
    const response = await withFetch(mock.fetch, () =>
        chatGifConfig({ request: request("/api/chat-gif-config"), env: ENV })
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).apiKey, ENV.GIPHY_API_KEY);
    assert.equal(response.headers.get("Cache-Control"), "no-store");

    const unauthenticated = await withFetch(mock.fetch, () =>
        chatGifConfig({ request: request("/api/chat-gif-config", { token: "" }), env: ENV })
    );
    assert.equal(unauthenticated.status, 401);
});

test("the picker reports missing GIPHY configuration without leaking a key", async () => {
    const mock = mockFetch();
    const env = { ...ENV, GIPHY_API_KEY: "" };
    const response = await withFetch(mock.fetch, () =>
        chatGifConfig({ request: request("/api/chat-gif-config"), env })
    );
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.match(payload.error, /GIPHY_API_KEY/);
    assert.equal(payload.apiKey, undefined);
});

test("the GIF download endpoint validates the GIPHY host and GIF signature", async () => {
    const mock = mockFetch();
    const remote = "https://media0.giphy.com/media/AbCd123/giphy-downsized.gif?cid=test";
    const response = await withFetch(mock.fetch, () =>
        chatGifDownload({
            request: request("/api/chat-gif-download?url=" + encodeURIComponent(remote)),
            env: ENV
        })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/gif");
    assert.equal((await response.arrayBuffer()).byteLength, 7);
    assert.equal(mock.calls.filter(call => call.url.startsWith("https://media0.giphy.com/")).length, 1);

    const before = mock.calls.length;
    const blocked = await withFetch(mock.fetch, () =>
        chatGifDownload({
            request: request("/api/chat-gif-download?url=" + encodeURIComponent("https://attacker.example/evil.gif")),
            env: ENV
        })
    );
    assert.equal(blocked.status, 400);
    assert.equal(mock.calls.length, before + 1); // auth check only; no outbound request to the submitted host
});

test("the GIF download endpoint rejects oversized or non-GIF payloads", async () => {
    const tooLargeMock = mockFetch(new Response(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), {
        status: 200,
        headers: { "Content-Type": "image/gif", "Content-Length": String(20 * 1024 * 1024 + 1) }
    }));
    const url = "https://media0.giphy.com/media/AbCd123/giphy.gif";
    const tooLarge = await withFetch(tooLargeMock.fetch, () =>
        chatGifDownload({
            request: request("/api/chat-gif-download?url=" + encodeURIComponent(url)),
            env: ENV
        })
    );
    assert.equal(tooLarge.status, 413);

    const invalidMock = mockFetch(new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "Content-Type": "image/gif" }
    }));
    const invalid = await withFetch(invalidMock.fetch, () =>
        chatGifDownload({
            request: request("/api/chat-gif-download?url=" + encodeURIComponent(url)),
            env: ENV
        })
    );
    assert.equal(invalid.status, 415);
});
