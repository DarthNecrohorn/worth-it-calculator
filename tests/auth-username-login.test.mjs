import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/auth-username-login.js";

const PREVIEW_ORIGIN = "https://preview.worth-it-calculator.pages.dev";

function createDbStub() {
    return {
        prepare(sql) {
            return {
                sql,
                bind(...args) { return { sql, args }; },
                async run() { return { success: true }; }
            };
        },
        async batch() { return []; }
    };
}

async function invokeUsernameLogin(t, email, authPayload) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/auth/v1/admin/users")) {
            return new Response(JSON.stringify({
                users: [{ email, user_metadata: { username: "sampleuser" } }]
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.includes("/auth/v1/token?grant_type=password")) {
            return new Response(JSON.stringify(authPayload), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }
        throw new Error("Unexpected mocked Supabase URL: " + url);
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const request = new Request(PREVIEW_ORIGIN + "/api/auth-username-login", {
        method: "POST",
        headers: {
            Origin: PREVIEW_ORIGIN,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username: "sampleuser",
            password: "Correct-Password-123!",
            captchaToken: "test-turnstile-token"
        })
    });
    const response = await onRequestPost({
        request,
        env: {
            SUPABASE_URL: "https://staging-project.supabase.co",
            SUPABASE_SECRET_KEY: "server-only-staging-secret",
            SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
            DB: createDbStub()
        },
        waitUntil(promise) { void promise; }
    });
    return { response, payload: await response.json(), calls };
}

test("correct username and password with unconfirmed Gmail return the confirmation-specific response", async t => {
    const { response, payload } = await invokeUsernameLogin(
        t,
        "member@gmail.com",
        { code: "email_not_confirmed", message: "Email not confirmed" }
    );
    assert.equal(response.status, 403);
    assert.deepEqual(payload, {
        code: "EMAIL_NOT_CONFIRMED",
        emailProvider: "gmail",
        error: "Your email address must be confirmed before you can sign in."
    });
    assert.equal(JSON.stringify(payload).includes("member@gmail.com"), false);
    assert.equal(JSON.stringify(payload).includes("Correct-Password-123!"), false);
    assert.equal(JSON.stringify(payload).includes("server-only-staging-secret"), false);
});

test("unconfirmed Microsoft consumer addresses receive the Microsoft inbox provider hint", async t => {
    const { response, payload } = await invokeUsernameLogin(
        t,
        "member@outlook.com",
        { code: "email_not_confirmed", message: "Email not confirmed" }
    );
    assert.equal(response.status, 403);
    assert.equal(payload.code, "EMAIL_NOT_CONFIRMED");
    assert.equal(payload.emailProvider, "microsoft");
});

test("wrong credentials stay indistinguishable and do not reveal email provider or confirmation state", async t => {
    const { response, payload } = await invokeUsernameLogin(
        t,
        "member@gmail.com",
        { code: "invalid_credentials", message: "Invalid login credentials" }
    );
    assert.equal(response.status, 401);
    assert.deepEqual(payload, { error: "Incorrect username or password." });
    assert.equal(Object.hasOwn(payload, "emailProvider"), false);
    assert.equal(Object.hasOwn(payload, "code"), false);
});
