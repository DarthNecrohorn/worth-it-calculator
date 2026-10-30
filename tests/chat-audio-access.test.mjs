import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/chat-audio.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const SUPABASE_URL = "https://project.supabase.co";
const TOKEN = "test-user-access-token";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const CONVERSATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OBJECT_PATH = USER_ID + "/1790000000000-voice-test.webm";
const ENV = {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key"
};
const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function makeRequest(options = {}) {
    const url = new URL("/api/chat-audio", SITE_ORIGIN);
    url.searchParams.set("conversation_id", options.conversationId || CONVERSATION_ID);
    url.searchParams.set("path", options.path || OBJECT_PATH);
    return new Request(url, {
        method: "GET",
        headers: {
            Origin: options.origin || SITE_ORIGIN,
            Authorization: "Bearer " + TOKEN
        }
    });
}

function mockFetch(options = {}) {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        calls.push({ url, method, init });

        if (url.pathname === "/auth/v1/user") {
            return Response.json({ id: USER_ID }, { status: options.authStatus || 200 });
        }
        if (url.pathname === "/rest/v1/rpc/can_access_worth_it_chat_audio_object") {
            return Response.json(
                options.rpcResult === undefined ? true : options.rpcResult,
                { status: options.rpcStatus || 200 }
            );
        }
        if (url.pathname.includes("/storage/v1/object/sign/worth-it-chat-audio/")) {
            return Response.json({
                signedURL: options.signedURL ||
                    ("/object/sign/worth-it-chat-audio/" + OBJECT_PATH + "?token=signed-test")
            }, { status: options.signStatus || 200 });
        }
        throw new Error("Unexpected request: " + method + " " + url.toString());
    };
    return calls;
}

test("GET returns a signed voice URL from the configured project after authorization", async () => {
    const calls = mockFetch();
    const response = await onRequest({
        request: makeRequest(),
        env: ENV
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.url,
        SUPABASE_URL + "/storage/v1/object/sign/worth-it-chat-audio/" +
        OBJECT_PATH + "?token=signed-test"
    );
    assert.equal(payload.expires_in, 900);
    assert.ok(calls.some(call =>
        call.url.pathname === "/rest/v1/rpc/can_access_worth_it_chat_audio_object"
    ));
    assert.ok(calls.some(call =>
        call.url.pathname === "/storage/v1/object/sign/worth-it-chat-audio/" + OBJECT_PATH
    ));
});

test("GET reports authorization RPC failures as server errors and does not sign", async () => {
    const calls = mockFetch({ rpcStatus: 503 });
    const response = await onRequest({
        request: makeRequest(),
        env: ENV
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.match(payload.error, /Could not verify access to this voice message/i);
    assert.equal(calls.some(call => call.url.pathname.includes("/storage/v1/object/sign/")), false);
});

test("GET rejects non-boolean authorization RPC responses", async () => {
    const calls = mockFetch({ rpcResult: { allowed: true } });
    const response = await onRequest({
        request: makeRequest(),
        env: ENV
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.match(payload.error, /Could not verify access to this voice message/i);
    assert.equal(calls.some(call => call.url.pathname.includes("/storage/v1/object/sign/")), false);
});

test("GET refuses a denied user and never creates a signed URL", async () => {
    const calls = mockFetch({ rpcResult: false });
    const response = await onRequest({
        request: makeRequest(),
        env: ENV
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.match(payload.error, /do not have access/i);
    assert.equal(calls.some(call => call.url.pathname.includes("/storage/v1/object/sign/")), false);
});

test("GET refuses a signed URL from an untrusted origin", async () => {
    const calls = mockFetch({
        signedURL: "https://attacker.example/storage/v1/object/sign/worth-it-chat-audio/" +
            OBJECT_PATH + "?token=not-trusted"
    });
    const response = await onRequest({
        request: makeRequest(),
        env: ENV
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.match(payload.error, /Could not open this voice message/i);
    assert.equal(calls.some(call => call.url.pathname.includes("/storage/v1/object/sign/")), true);
});

test("GET refuses a signed URL for a different bucket or object path", async () => {
    const calls = mockFetch({
        signedURL: "/object/sign/other-bucket/" + OBJECT_PATH + "?token=wrong-bucket"
    });
    const response = await onRequest({
        request: makeRequest(),
        env: ENV
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.match(payload.error, /Could not open this voice message/i);
    assert.equal(calls.some(call => call.url.pathname.includes("/storage/v1/object/sign/")), true);
});
