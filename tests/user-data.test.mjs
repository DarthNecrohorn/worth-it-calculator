import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const SUPABASE_URL = "https://example-project.supabase.co";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const USER_TOKEN = "user-access-token-for-tests";
const SERVICE_KEY = "sb_secret_server-only-test-key";
const PUBLISHABLE_KEY = "sb_publishable_test-key";
const source = readFileSync(new URL("../functions/api/user-data.js", import.meta.url), "utf8");
const api = await import("data:text/javascript;base64," + Buffer.from(source, "utf8").toString("base64"));
const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function env() {
    return {
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
        supabase_secret_key: SERVICE_KEY
    };
}

function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Origin", options.origin || SITE_ORIGIN);
    if (options.token !== false) headers.set("Authorization", "Bearer " + USER_TOKEN);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    return new Request(SITE_ORIGIN + path, {
        method: options.method || "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
}

function mockFetch(options = {}) {
    const calls = [];
    const user = {
        id: USER_ID,
        email: "test@example.invalid",
        created_at: "2026-01-01T00:00:00.000Z",
        email_confirmed_at: "2026-01-02T00:00:00.000Z",
        user_metadata: { display_name: "Test User" },
        app_metadata: { provider: "email", providers: ["email"] }
    };

    globalThis.fetch = async (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        calls.push({ url, method, headers, init });

        if (url.origin === SUPABASE_URL && url.pathname === "/auth/v1/user") {
            return Response.json(user, { status: 200 });
        }

        if (url.origin === SUPABASE_URL && url.pathname.startsWith("/auth/v1/admin/users/") && method === "DELETE") {
            if (options.adminDeleteFails) return Response.json({ message: "Simulated Auth deletion failure" }, { status: 500 });
            return Response.json({ id: USER_ID }, { status: 200 });
        }

        if (url.origin === SUPABASE_URL && url.pathname === "/storage/v1/object/list/worth-it-chat-media" && method === "POST") {
            if (options.chatMediaListFails) return Response.json({ message: "Simulated chat media inventory failure" }, { status: 503 });
            return Response.json(options.chatMediaEntries || []);
        }

        if (url.origin === SUPABASE_URL && url.pathname === "/storage/v1/object/worth-it-avatars" && method === "DELETE") {
            if (options.storageDeleteFails) return Response.json({ message: "Simulated storage cleanup failure" }, { status: 500 });
            return new Response(null, { status: 200 });
        }

        if (url.origin === SUPABASE_URL && url.pathname === "/storage/v1/object/worth-it-chat-media" && method === "DELETE") {
            if (options.chatMediaDeleteFails) return Response.json({ message: "Simulated chat media cleanup failure" }, { status: 500 });
            return new Response(null, { status: 200 });
        }

        if (url.origin === SUPABASE_URL && url.pathname === "/rest/v1/rpc/get_worth_it_user_preferences") {
            if (options.preferencesMissing) {
                return new Response(JSON.stringify({
                    code: "PGRST202",
                    message: "Could not find the function public.get_worth_it_user_preferences"
                }), { status: 404, headers: { "Content-Type": "application/json" } });
            }
            return Response.json({
                success: true,
                privacy: {
                    profile_visibility: "friends",
                    profile_discoverable: true,
                    show_online_status: false,
                    show_connections: false
                },
                notifications: {
                    friend_requests: true,
                    follows: false,
                    private_messages: true,
                    group_chats: true,
                    account_activity: true
                }
            });
        }

        if (url.origin === SUPABASE_URL && url.pathname.startsWith("/rest/v1/")) {
            if (method === "DELETE") {
                if (options.feedbackDeleteFails && url.pathname === "/rest/v1/feedback") {
                    return Response.json({ message: "Simulated feedback cleanup failure" }, { status: 500 });
                }
                return new Response(null, { status: 204 });
            }
            if (url.pathname === "/rest/v1/feedback" && Array.isArray(options.feedbackRows)) {
                return Response.json(options.feedbackRows);
            }
            if (url.pathname === "/rest/v1/worth_it_profiles" && Array.isArray(options.profileRows)) {
                return Response.json(options.profileRows);
            }
            return Response.json([]);
        }

        throw new Error("Unexpected fetch in isolated test: " + method + " " + url.toString());
    };

    return calls;
}

test("rejects a foreign Origin before contacting Supabase", async () => {
    const calls = mockFetch();
    const response = await api.onRequestGet({
        request: request("/api/user-data", { origin: "https://attacker.example" }),
        env: env()
    });

    assert.equal(response.status, 403);
    assert.deepEqual(calls, []);
});

test("account deletion requires the exact DELETE confirmation", async () => {
    const calls = mockFetch();
    const response = await api.onRequestPost({
        request: request("/api/user-data", {
            method: "POST",
            body: { action: "delete", confirmation: "delete" }
        }),
        env: env()
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.match(payload.error, /Type DELETE exactly/i);
    assert.equal(calls.filter(call => call.url.pathname.startsWith("/auth/v1/admin/users/")).length, 0);
    assert.equal(calls.filter(call => call.method === "DELETE").length, 0);
});

test("exports settings using the signed-in user's RPC token without exposing the service key", async () => {
    const calls = mockFetch();
    const response = await api.onRequestPost({
        request: request("/api/user-data", {
            method: "POST",
            body: { action: "export" }
        }),
        env: env()
    });
    const bodyText = await response.text();
    const payload = JSON.parse(bodyText);
    const preferenceCall = calls.find(call => call.url.pathname === "/rest/v1/rpc/get_worth_it_user_preferences");

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.export.account.id, USER_ID);
    assert.equal(payload.export.settings_preferences.available, true);
    assert.equal(payload.export.settings_preferences.privacy.profile_visibility, "friends");
    assert.equal(payload.export.settings_preferences.notifications.follows, false);
    assert.ok(preferenceCall, "preferences must be read through the authenticated RPC");
    assert.equal(preferenceCall.method, "POST");
    assert.equal(preferenceCall.headers.get("apikey"), PUBLISHABLE_KEY);
    assert.equal(preferenceCall.headers.get("authorization"), "Bearer " + USER_TOKEN);
    assert.equal(bodyText.includes(SERVICE_KEY), false, "server secret must never be included in the export");
});

test("export remains available before the optional Settings migration is installed", async () => {
    mockFetch({ preferencesMissing: true });
    const response = await api.onRequestPost({
        request: request("/api/user-data", {
            method: "POST",
            body: { action: "export" }
        }),
        env: env()
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.deepEqual(payload.export.settings_preferences, {
        available: false,
        reason: "settings_migration_not_installed"
    });
});


test("does not report deletion success if Supabase Auth refuses to delete the user", async () => {
    const calls = mockFetch({ adminDeleteFails: true });
    const response = await api.onRequestPost({
        request: request("/api/user-data", {
            method: "POST",
            body: { action: "delete", confirmation: "DELETE" }
        }),
        env: env()
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.equal(payload.success, false);
    assert.equal(calls.filter(call => call.url.pathname.startsWith("/auth/v1/admin/users/")).length, 1);
    assert.equal(calls.filter(call => call.method === "DELETE" && call.url.pathname !== "/auth/v1/admin/users/" + USER_ID).length, 0);
});

test("deletes only captured feedback rows and correctly scoped profile assets after Auth confirms deletion", async () => {
    const feedbackRows = [
        { id: 42, type: "suggestion", message: "A user-owned test record", user_id: USER_ID },
        { id: 43, type: "bug", message: "Another user-owned test record", user_id: USER_ID }
    ];
    const profileRows = [{
        user_id: USER_ID,
        avatar_url: SUPABASE_URL + "/storage/v1/object/public/worth-it-avatars/" + USER_ID + "/avatar/test.png",
        banner_url: SUPABASE_URL + "/storage/v1/object/public/worth-it-avatars/" + USER_ID + "/banner/test.png"
    }];
    const chatMediaEntries = [
        { id: "chat-media-object-id", name: "1790000000000-ab12cd.png", metadata: { mimetype: "image/png" } },
        { id: null, name: "nested-folder", metadata: null }
    ];
    const calls = mockFetch({ feedbackRows, profileRows, chatMediaEntries });
    const response = await api.onRequestPost({
        request: request("/api/user-data", {
            method: "POST",
            body: { action: "delete", confirmation: "DELETE" }
        }),
        env: env()
    });
    const payload = await response.json();
    const authDeleteIndex = calls.findIndex(call => call.url.pathname === "/auth/v1/admin/users/" + USER_ID && call.method === "DELETE");
    const feedbackDelete = calls.find(call => call.url.pathname === "/rest/v1/feedback" && call.method === "DELETE");
    const storageDeletes = calls.filter(call => call.url.pathname === "/storage/v1/object/worth-it-avatars" && call.method === "DELETE");
    const chatMediaList = calls.find(call => call.url.pathname === "/storage/v1/object/list/worth-it-chat-media" && call.method === "POST");
    const chatMediaDelete = calls.find(call => call.url.pathname === "/storage/v1/object/worth-it-chat-media" && call.method === "DELETE");

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.deleted, true);
    assert.equal(payload.cleanup_warning, false);
    assert.ok(authDeleteIndex >= 0, "Auth must confirm deletion");
    assert.ok(feedbackDelete, "user-owned feedback IDs must be removed");
    assert.equal(feedbackDelete.url.searchParams.get("id"), "in.(42,43)");
    assert.equal(storageDeletes.length, 2);
    const assetPaths = storageDeletes.map(call => JSON.parse(call.init.body).prefixes[0]).sort();
    assert.deepEqual(assetPaths, [
        USER_ID + "/avatar/test.png",
        USER_ID + "/banner/test.png"
    ].sort());
    assert.ok(chatMediaList, "chat assets must be inventoried before account deletion");
    assert.equal(JSON.parse(chatMediaList.init.body).prefix, USER_ID + "/");
    assert.ok(chatMediaDelete, "chat media must be removed after Auth deletion");
    assert.deepEqual(JSON.parse(chatMediaDelete.init.body).prefixes, [USER_ID + "/1790000000000-ab12cd.png"]);
    assert.equal(calls.some(call => call.url.pathname.includes("another-user")), false);
});

test("rejects encoded nested avatar paths before privileged storage cleanup", async () => {
    const anotherUserId = "99999999-9999-4999-8999-999999999999";
    const profileRows = [{
        user_id: USER_ID,
        avatar_url: SUPABASE_URL + "/storage/v1/object/public/worth-it-avatars/" +
            USER_ID + "/avatar/test%2F..%2F" + anotherUserId + "%2Fbanner%2Fimage.png",
        banner_url: null
    }];
    const calls = mockFetch({ profileRows });
    const response = await api.onRequestPost({
        request: request("/api/user-data", {
            method: "POST",
            body: { action: "delete", confirmation: "DELETE" }
        }),
        env: env()
    });
    const payload = await response.json();
    const deletes = calls.filter(call =>
        call.url.pathname === "/storage/v1/object/worth-it-avatars" && call.method === "DELETE"
    );
    assert.equal(response.status, 200);
    assert.equal(payload.deleted, true);
    assert.equal(deletes.length, 0);
    assert.ok(calls.some(call =>
        call.url.pathname === "/auth/v1/admin/users/" + USER_ID && call.method === "DELETE"
    ));
});

test("surfaces a cleanup warning if profile storage cleanup fails after Auth deletion", async () => {
    const profileRows = [{
        user_id: USER_ID,
        avatar_url: SUPABASE_URL + "/storage/v1/object/public/worth-it-avatars/" + USER_ID + "/avatar/test.png",
        banner_url: null
    }];
    const calls = mockFetch({ profileRows, storageDeleteFails: true });
    const response = await api.onRequestPost({
        request: request("/api/user-data", {
            method: "POST",
            body: { action: "delete", confirmation: "DELETE" }
        }),
        env: env()
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.deleted, true);
    assert.equal(payload.cleanup_warning, true);
    assert.match(payload.warning, /some feedback, profile images, or chat attachments/i);
    assert.ok(calls.some(call => call.url.pathname === "/auth/v1/admin/users/" + USER_ID && call.method === "DELETE"));
});


test("does not delete the Auth account if chat media cannot be inventoried", async () => {
    const calls = mockFetch({ chatMediaListFails: true });
    const response = await api.onRequestPost({
        request: request("/api/user-data", {
            method: "POST",
            body: { action: "delete", confirmation: "DELETE" }
        }),
        env: env()
    });
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.success, false);
    assert.match(payload.error, /Chat attachments could not be inventoried/i);
    assert.equal(calls.filter(call => call.url.pathname.startsWith("/auth/v1/admin/users/") && call.method === "DELETE").length, 0);
});
