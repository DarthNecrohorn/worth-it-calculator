import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/chat-media.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const SUPABASE_URL = "https://project.supabase.co";
const TOKEN = "test-user-access-token";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const CONVERSATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OBJECT_PATH = USER_ID + "/1790000000000-ab12cd.png";
const ENV = {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key"
};
const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function makeRequest(method, path, options = {}) {
    const headers = new Headers({Origin: options.origin || SITE_ORIGIN});
    if (options.token !== false) headers.set("Authorization", "Bearer " + TOKEN);
    let body;
    if (options.form) {
        body = new FormData();
        body.append("file", options.form.file, options.form.file.name);
        body.append("conversation_id", options.form.conversationId || CONVERSATION_ID);
    }
    return new Request(SITE_ORIGIN + path, {method, headers, body});
}

function mockFetch(options = {}) {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        calls.push({url, method, headers, init});

        if (url.pathname === "/auth/v1/user") {
            return Response.json({id: USER_ID}, {status: options.authFails ? 401 : 200});
        }
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
            const name = url.pathname.split("/").pop();
            if (options.rpcFails) return Response.json({message: "RPC failed"}, {status: 503});
            const expected = options.expectedRpc;
            if (expected && name !== expected) return Response.json(false);
            return Response.json(options.permitted !== false);
        }
        if (url.pathname.includes("/storage/v1/object/sign/worth-it-chat-media/")) {
            return Response.json(
                {signedURL: options.signedURL || ("/object/sign/worth-it-chat-media/" + OBJECT_PATH + "?token=signed-test")},
                {status: options.signFails ? 500 : 200}
            );
        }
        if (url.pathname.includes("/storage/v1/object/worth-it-chat-media/") && method === "DELETE") {
            return new Response(null, {status: options.deleteFails ? 500 : 200});
        }
        if (url.pathname.includes("/storage/v1/object/worth-it-chat-media/") && method === "POST") {
            return Response.json({Key: OBJECT_PATH}, {status: 200});
        }
        throw new Error("Unexpected request: " + method + " " + url.toString());
    };
    return calls;
}

test("GET returns a signed media URL only after object and conversation access is authorized", async () => {
    const calls = mockFetch({expectedRpc: "can_access_worth_it_chat_media_object"});
    const response = await onRequest({
        request: makeRequest("GET", "/api/chat-media?conversation_id=" + CONVERSATION_ID + "&path=" + encodeURIComponent(OBJECT_PATH)),
        env: ENV
    });
    const payload = await response.json();
    const rpc = calls.find(call => call.url.pathname === "/rest/v1/rpc/can_access_worth_it_chat_media_object");
    const signed = calls.find(call => call.url.pathname.includes("/storage/v1/object/sign/"));

    assert.equal(response.status, 200);
    assert.match(payload.url, /object\/sign\/worth-it-chat-media/);
    assert.equal(payload.expires_in, 900);
    assert.ok(rpc);
    assert.equal(JSON.parse(rpc.init.body).p_conversation_id, CONVERSATION_ID);
    assert.equal(JSON.parse(rpc.init.body).p_object_path, OBJECT_PATH);
    assert.ok(signed);
    assert.equal(signed.headers.get("authorization"), "Bearer test-service-role-key");
});

test("GET refuses a user without access and never creates a signed URL", async () => {
    const calls = mockFetch({permitted: false});
    const response = await onRequest({
        request: makeRequest("GET", "/api/chat-media?conversation_id=" + CONVERSATION_ID + "&path=" + encodeURIComponent(OBJECT_PATH)),
        env: ENV
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.match(payload.error, /do not have access/i);
    assert.equal(calls.some(call => call.url.pathname.includes("/storage/v1/object/sign/")), false);
});

test("DELETE checks sender ownership through the object RPC before removing a file", async () => {
    const calls = mockFetch({expectedRpc: "can_delete_worth_it_chat_media_object"});
    const response = await onRequest({
        request: makeRequest("DELETE", "/api/chat-media?conversation_id=" + CONVERSATION_ID + "&path=" + encodeURIComponent(OBJECT_PATH)),
        env: ENV
    });
    const rpc = calls.find(call => call.url.pathname === "/rest/v1/rpc/can_delete_worth_it_chat_media_object");
    const deletion = calls.find(call => call.method === "DELETE" && call.url.pathname.includes("/storage/v1/object/worth-it-chat-media/"));

    assert.equal(response.status, 200);
    assert.ok(rpc);
    assert.ok(deletion);
    assert.equal(deletion.headers.get("authorization"), "Bearer test-service-role-key");
});

test("DELETE cannot remove another user's attachment when the ownership RPC denies access", async () => {
    const calls = mockFetch({permitted: false});
    const response = await onRequest({
        request: makeRequest("DELETE", "/api/chat-media?conversation_id=" + CONVERSATION_ID + "&path=" + encodeURIComponent(OBJECT_PATH)),
        env: ENV
    });

    assert.equal(response.status, 403);
    assert.equal(calls.some(call => call.method === "DELETE" && call.url.pathname.includes("/storage/v1/object/worth-it-chat-media/")), false);
});

test("invalid object paths and unauthenticated requests stop before privileged Storage operations", async () => {
    const invalidCalls = mockFetch();
    const invalid = await onRequest({
        request: makeRequest("GET", "/api/chat-media?conversation_id=" + CONVERSATION_ID + "&path=" + encodeURIComponent(USER_ID + "/../secret.png")),
        env: ENV
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalidCalls.some(call => call.url.pathname.startsWith("/rest/v1/rpc/")), false);

    const unauthenticatedCalls = mockFetch();
    const unauthenticated = await onRequest({
        request: makeRequest("GET", "/api/chat-media?conversation_id=" + CONVERSATION_ID + "&path=" + encodeURIComponent(OBJECT_PATH), {token: false}),
        env: ENV
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticatedCalls.some(call => call.url.pathname.startsWith("/rest/v1/rpc/")), false);
});

test("chat media API rejects untrusted origins before verifying the session", async () => {
    const calls = mockFetch();
    const response = await onRequest({
        request: makeRequest("GET", "/api/chat-media?conversation_id=" + CONVERSATION_ID + "&path=" + encodeURIComponent(OBJECT_PATH), {origin: "https://attacker.example"}),
        env: ENV
    });
    assert.equal(response.status, 403);
    assert.deepEqual(calls, []);
});
test("GET refuses signed URLs that point outside the configured private bucket", async () => {
    const calls = mockFetch({signedURL: "https://attacker.example/storage/v1/object/sign/worth-it-chat-media/" + OBJECT_PATH + "?token=bad"});
    const response = await onRequest({
        request: makeRequest("GET", "/api/chat-media?conversation_id=" + CONVERSATION_ID + "&path=" + encodeURIComponent(OBJECT_PATH)),
        env: ENV
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.match(payload.error, /Could not open this attachment/i);
    assert.equal(calls.some(call => call.url.pathname.includes("/storage/v1/object/sign/")), true);
});

