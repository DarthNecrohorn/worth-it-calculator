import test from "node:test";
import assert from "node:assert/strict";
import { isWorthItAdminRequest } from "../functions/lib/admin-auth.js";

const ADMIN_EMAIL = "pedjasebez3545@gmail.com";
const env = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key"
};

async function withFetch(fetchImpl, callback) {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try { return await callback(); }
    finally { globalThis.fetch = original; }
}

function context(token = "test-session") {
    return {
        env,
        request: new Request("https://worth-it-calculator.pages.dev/api/admin-platform-usage", {
            headers: token ? { Authorization: "Bearer " + token } : {}
        })
    };
}

test("shared admin authorization requires the correct email and a confirmed email address", async () => {
    const unconfirmed = await withFetch(async () => new Response(JSON.stringify({
        id: "admin-user",
        email: ADMIN_EMAIL,
        email_confirmed_at: null,
        confirmed_at: null
    }), { status: 200 }), () => isWorthItAdminRequest(context()));
    assert.equal(unconfirmed, false);

    const verified = await withFetch(async () => new Response(JSON.stringify({
        id: "admin-user",
        email: ADMIN_EMAIL,
        email_confirmed_at: "2026-10-29T00:00:00.000Z"
    }), { status: 200 }), () => isWorthItAdminRequest(context()));
    assert.equal(verified, true);

    const otherEmail = await withFetch(async () => new Response(JSON.stringify({
        id: "other-user",
        email: "not-admin@example.com",
        email_confirmed_at: "2026-10-29T00:00:00.000Z"
    }), { status: 200 }), () => isWorthItAdminRequest(context()));
    assert.equal(otherEmail, false);
});

test("shared admin authorization denies requests without a bearer token", async () => {
    let called = false;
    const result = await withFetch(async () => {
        called = true;
        return new Response("{}", { status: 200 });
    }, () => isWorthItAdminRequest(context("")));
    assert.equal(result, false);
    assert.equal(called, false);
});
