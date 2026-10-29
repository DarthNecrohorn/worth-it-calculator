import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest } from "../functions/api/resend-email-confirmation.js";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const chat = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const profile = readFileSync(new URL("../profile-ui.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../guest-mode.js", import.meta.url), "utf8");
const ai = readFileSync(new URL("../functions/api/ai-chat.js", import.meta.url), "utf8");
const media = readFileSync(new URL("../functions/api/chat-media.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../functions/api/resend-email-confirmation.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261029103234_rate_limit_email_confirmation_resend.sql", import.meta.url), "utf8");
const socialMigration = readFileSync(new URL("../supabase/migrations/20261029104715_require_confirmed_email_for_social_chat_rpc.sql", import.meta.url), "utf8");

test("unverified sessions are represented to the main app as guests while retaining a confirmation notice", () => {
    assert.match(app, /function isWorthItEmailVerified\(user\)/);
    assert.match(app, /user\.email_confirmed_at \|\| user\.confirmed_at/);
    assert.match(app, /currentAuthUser = isWorthItEmailVerified\(sessionUser\) \? sessionUser : null/);
    assert.match(app, /window\.worthItCurrentAuthUser = currentAuthUser/);
    assert.match(app, /window\.worthItPendingEmailUser = sessionUser && !currentAuthUser \? sessionUser : null/);
    assert.match(chat, /const effectiveUser = user && typeof window\.isWorthItEmailVerified/);
    assert.match(profile, /function getVerifiedWorthItProfileUser\(user\)/);
    const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
    assert.match(settings, /function getSettingsAuthSession\(client\)[\s\S]*?window\.isWorthItEmailVerified\(session\.user\)/);
    const admin = readFileSync(new URL("../admin-panel.js", import.meta.url), "utf8");
    assert.match(admin, /window\.isWorthItEmailVerified\(user\)[\s\S]*?ADMIN_EMAIL/);
    assert.match(guest, /function verifiedGuestStateUser\(user\)[\s\S]*?window\.isWorthItEmailVerified\(user\)/);
    assert.match(guest, /setAuthState\(verifiedGuestStateUser\(result\?\.data\?\.session\?\.user \|\| null\), "INITIAL_SESSION"\)/);
    assert.match(guest, /setAuthState\(verifiedGuestStateUser\(session\?\.user \|\| null\), event\)/);
    assert.match(profile, /currentUser=getVerifiedWorthItProfileUser\(data\?\.session\?\.user\|\|null\)/);
    assert.match(ai, /code: "EMAIL_NOT_CONFIRMED"/);
    assert.match(media, /code:"EMAIL_NOT_CONFIRMED"/);
    const feedbackApi = readFileSync(new URL("../functions/api/feedback.js", import.meta.url), "utf8");
    assert.match(feedbackApi, /code: "EMAIL_NOT_CONFIRMED"/);
    const userDataApi = readFileSync(new URL("../functions/api/user-data.js", import.meta.url), "utf8");
    assert.match(userDataApi, /code: "EMAIL_NOT_CONFIRMED"/);
});

test("email resend is performed only by a server endpoint guarded by an atomic 24-hour per-user database claim", () => {
    assert.match(route, /verifyUser\(config, token\)/);
    assert.match(route, /claim_worth_it_email_confirmation_resend/);
    assert.doesNotMatch(route, /release_worth_it_email_confirmation_resend/);
    assert.match(route, /EMAIL_RESEND_RATE_LIMITED/);
    assert.match(route, /auth\/v1\/resend/);
    assert.match(route, /DAY_SECONDS = 24 \* 60 \* 60/);
    assert.match(migration, /interval '24 hours'/);
    assert.match(migration, /primary key references auth\.users\(id\) on delete cascade/);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on function public\.claim_worth_it_email_confirmation_resend\(uuid\) from public, anon, authenticated/i);
    assert.match(migration, /grant execute on function public\.claim_worth_it_email_confirmation_resend\(uuid\) to service_role/i);
    assert.doesNotMatch(app, /supabaseClient\.auth\.resend/);
});

test("private chat and social RPCs require a confirmed Auth user without blocking guest-readable profile context", () => {
    assert.match(socialMigration, /auth\.users AS verified_user/);
    assert.match(socialMigration, /verified_user\.email_confirmed_at IS NOT NULL/);
    assert.match(socialMigration, /ERRCODE = '42501'/);
    assert.match(socialMigration, /Expected 23 protected chat\/social RPCs, found %/);
    for (const rpc of [
        "get_worth_it_chat_conversations",
        "get_worth_it_chat_messages",
        "create_worth_it_group_chat",
        "send_worth_it_friend_request",
        "get_worth_it_social_notifications",
        "worth_it_chat_realtime_topic_authorized"
    ]) assert.ok(socialMigration.includes("'" + rpc + "'"), "email gate includes " + rpc);
    assert.doesNotMatch(socialMigration, /get_worth_it_profile_social_context/);
});

test("AI panel stays above the header, remains usable on phones, and does not block the page for email reminders", () => {
    assert.match(css, /\.ai-chat-overlay\s*\{[^}]*z-index:\s*2147483646/);
    assert.match(css, /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.ai-chat-overlay\.open \.ai-chat-card\s*\{[\s\S]*?width:\s*calc\(100vw - 24px\)/);
    assert.match(css, /\.worth-it-email-gate\s*\{[\s\S]*?pointer-events:\s*none/);
    assert.match(css, /\.worth-it-email-gate-card\s*\{[\s\S]*?pointer-events:\s*auto/);
});

test("Bugs & Suggestions is a clear hero action above the Smart decisions badge, not an overcrowded header button", () => {
    const heroStart = html.indexOf('<section class="hero">');
    const feedbackStart = html.indexOf('class="hero-feedback-btn"', heroStart);
    const badgeStart = html.indexOf('class="badge">✦ Smart decisions made simple', heroStart);
    const navEnd = html.indexOf("</nav>");
    assert.ok(heroStart >= 0 && feedbackStart > heroStart && feedbackStart < badgeStart, "hero feedback action appears before the badge");
    assert.ok(feedbackStart > navEnd, "feedback button was moved out of the navigation header");
    assert.match(css, /\.hero-feedback-btn\s*\{/);
});


const resendEnv = {
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key"
};

async function withFetch(fetchImpl, callback) {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try { return await callback(); }
    finally { globalThis.fetch = original; }
}

function resendRequest(token = "test-session", origin = "https://worth-it-calculator.pages.dev") {
    return new Request("https://worth-it-calculator.pages.dev/api/resend-email-confirmation", {
        method: "POST",
        headers: {
            Origin: origin,
            Authorization: "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: "{}"
    });
}

test("resend endpoint atomically claims one daily slot and asks Supabase Auth to resend", async () => {
    const calls = [];
    const mockFetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({
                id: "user-1",
                email: "unverified@example.com",
                email_confirmed_at: null
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url.endsWith("/rest/v1/rpc/claim_worth_it_email_confirmation_resend")) {
            assert.equal(JSON.parse(init.body).p_user_id, "user-1");
            return new Response(JSON.stringify([{ is_allowed: true, retry_after_seconds: 0 }]), {
                status: 200, headers: { "Content-Type": "application/json" }
            });
        }
        if (url.includes("/auth/v1/resend?redirect_to=")) {
            assert.deepEqual(JSON.parse(init.body), { type: "signup", email: "unverified@example.com" });
            assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-session");
            return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        throw new Error("Unexpected request URL: " + url);
    };
    const response = await withFetch(mockFetch, () => onRequest({ request: resendRequest(), env: resendEnv }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.ok(Date.parse(result.next_allowed_at) > Date.now());
    assert.ok(calls.some(call => call.url.endsWith("/rest/v1/rpc/claim_worth_it_email_confirmation_resend")));
    assert.ok(calls.some(call => call.url.includes("/auth/v1/resend?redirect_to=")));
});

test("resend endpoint refuses a second request inside the daily window without sending another email", async () => {
    const calls = [];
    const mockFetch = async input => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-1", email: "unverified@example.com", email_confirmed_at: null }), { status: 200 });
        }
        if (url.endsWith("/rest/v1/rpc/claim_worth_it_email_confirmation_resend")) {
            return new Response(JSON.stringify([{ is_allowed: false, retry_after_seconds: 43200 }]), { status: 200 });
        }
        throw new Error("The email provider must not be called while rate limited: " + url);
    };
    const response = await withFetch(mockFetch, () => onRequest({ request: resendRequest(), env: resendEnv }));
    assert.equal(response.status, 429);
    const result = await response.json();
    assert.equal(result.code, "EMAIL_RESEND_RATE_LIMITED");
    assert.equal(result.retry_after_seconds, 43200);
    assert.ok(!calls.some(url => url.includes("/auth/v1/resend?")));
});

test("resend endpoint refuses already-verified users before consuming a resend slot", async () => {
    const calls = [];
    const mockFetch = async input => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-2", email: "verified@example.com", email_confirmed_at: "2026-10-29T00:00:00.000Z" }), { status: 200 });
        }
        throw new Error("Verified users must not consume a resend slot: " + url);
    };
    const response = await withFetch(mockFetch, () => onRequest({ request: resendRequest(), env: resendEnv }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "EMAIL_ALREADY_CONFIRMED");
    assert.equal(calls.length, 1);
});

test("resend endpoint keeps the daily slot reserved after the provider refuses email delivery", async () => {
    const calls = [];
    const mockFetch = async input => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-1", email: "unverified@example.com", email_confirmed_at: null }), { status: 200 });
        }
        if (url.endsWith("/rest/v1/rpc/claim_worth_it_email_confirmation_resend")) {
            return new Response(JSON.stringify([{ is_allowed: true, retry_after_seconds: 0 }]), { status: 200 });
        }
        if (url.includes("/auth/v1/resend?redirect_to=")) {
            return new Response(JSON.stringify({ code: "email_address_not_authorized", msg: "email_address_not_authorized" }), { status: 403 });
        }
        throw new Error("Unexpected request URL: " + url);
    };
    const response = await withFetch(mockFetch, () => onRequest({ request: resendRequest(), env: resendEnv }));
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.equal(result.code, "EMAIL_PROVIDER_NOT_CONFIGURED");
    assert.ok(Date.parse(result.next_allowed_at) > Date.now());
    assert.ok(!calls.some(url => url.endsWith("/rest/v1/rpc/release_worth_it_email_confirmation_resend")));
});
