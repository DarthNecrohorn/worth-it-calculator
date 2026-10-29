import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/chat-call-ice.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const BASE_ENV = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    CLOUDFLARE_TURN_KEY_ID: "0123456789abcdef0123456789abcdef",
    CLOUDFLARE_TURN_KEY_API_TOKEN: "turn-key-secret-token"
};
function request({ origin = SITE_ORIGIN, method = "GET", token = "test-session-token", url = SITE_ORIGIN + "/api/chat-call-ice?conversationId=00000000-0000-4000-8000-000000000100" } = {}) {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (token) headers.Authorization = "Bearer " + token;
    return new Request(url, { method, headers });
}
function mockFetch({ validUser = true, relayStatus = 201, payload, friendChat = true, hasAccess = true } = {}) {
    const calls = [];
    const fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify(validUser ? { id: "test-user-id" } : { message: "Invalid JWT" }), {
                status: validUser ? 200 : 401,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (url.endsWith("/rest/v1/rpc/get_worth_it_chat_conversations")) {
            return new Response(JSON.stringify(friendChat ? [{ id: "00000000-0000-4000-8000-000000000100", type: "direct" }] : []), {
                status: 200, headers: { "Content-Type": "application/json" }
            });
        }
        if (url.endsWith("/rest/v1/rpc/can_access_worth_it_chat_media")) {
            return new Response(hasAccess ? "true" : "false", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.includes("/credentials/generate-ice-servers")) {
            return new Response(JSON.stringify(payload || {
                iceServers: [
                    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
                    {
                        urls: [
                            "turn:turn.cloudflare.com:3478?transport=udp",
                            "turn:turn.cloudflare.com:53?transport=udp",
                            "turns:turn.cloudflare.com:443?transport=tcp"
                        ],
                        username: "short-lived-username",
                        credential: "short-lived-credential"
                    }
                ]
            }), { status: relayStatus, headers: { "Content-Type": "application/json" } });
        }
        throw new Error("Unexpected fetch URL: " + url);
    };
    return { fetch, calls };
}
async function withFetch(fetchImpl, callback) {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try { return await callback(); }
    finally { globalThis.fetch = original; }
}

test("call ICE endpoint returns expiring TURN credentials without exposing the long-lived key", async () => {
    const mock = mockFetch();
    const response = await withFetch(mock.fetch, () => onRequest({ request: request(), env: BASE_ENV }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const result = await response.json();
    assert.equal(result.expiresInSeconds, 86400);
    assert.ok(result.iceServers.some(server => server.username === "short-lived-username"));
    assert.ok(result.iceServers.every(server => (Array.isArray(server.urls) ? server.urls : [server.urls]).every(url => !/:53(?:\?|$)/i.test(url))));
    assert.doesNotMatch(JSON.stringify(result), /turn-key-secret-token/);
    const credentialCall = mock.calls.find(call => call.url.includes("/credentials/generate-ice-servers"));
    assert.equal(new Headers(credentialCall.init.headers).get("Authorization"), "Bearer turn-key-secret-token");
    assert.deepEqual(JSON.parse(credentialCall.init.body), { ttl: 86400 });
});

test("call ICE endpoint refuses missing TURN configuration and invalid sessions", async () => {
    const missing = mockFetch();
    const notConfigured = await withFetch(missing.fetch, () => onRequest({
        request: request(), env: { SUPABASE_URL: BASE_ENV.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: BASE_ENV.SUPABASE_PUBLISHABLE_KEY }
    }));
    assert.equal(notConfigured.status, 503);
    assert.equal(missing.calls.length, 0);

    const invalid = mockFetch({ validUser: false });
    const unauthorized = await withFetch(invalid.fetch, () => onRequest({ request: request(), env: BASE_ENV }));
    assert.equal(unauthorized.status, 401);
    assert.equal(invalid.calls.some(call => call.url.includes("/credentials/generate-ice-servers")), false);
});

test("call ICE endpoint rejects cross-origin requests and unsupported methods", async () => {
    const mock = mockFetch();
    const blocked = await withFetch(mock.fetch, () => onRequest({
        request: request({ origin: "https://attacker.example" }), env: BASE_ENV
    }));
    assert.equal(blocked.status, 403);
    assert.equal(mock.calls.length, 0);

    const badMethod = await withFetch(mock.fetch, () => onRequest({
        request: request({ method: "POST" }), env: BASE_ENV
    }));
    assert.equal(badMethod.status, 405);
});

test("call ICE endpoint does not issue credentials for groups or chats without current friendship", async () => {
    for (const setup of [{ friendChat: false }, { hasAccess: false }]) {
        const nonFriend = mockFetch(setup);
        const blocked = await withFetch(nonFriend.fetch, () => onRequest({
            request: request(), env: BASE_ENV
        }));
        assert.equal(blocked.status, 403);
        assert.equal(nonFriend.calls.some(call => call.url.includes("/credentials/generate-ice-servers")), false);
    }
});
