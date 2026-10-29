import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestPost } from "../functions/api/user-reports.js";
import { onRequestGet } from "../functions/api/admin-user-reports.js";

const migration = readFileSync(new URL("../supabase/migrations/20261029110213_add_user_reports_and_daily_limit.sql", import.meta.url), "utf8");
const profile = readFileSync(new URL("../profile-ui.js", import.meta.url), "utf8");
const admin = readFileSync(new URL("../admin-panel.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "test-key" };
function request(body = {}, token = "test-token") {
    return new Request("https://worth-it-calculator.pages.dev/api/user-reports", {
        method: "POST",
        headers: { Origin: "https://worth-it-calculator.pages.dev", Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}
async function withFetch(mock, fn) {
    const original = globalThis.fetch;
    globalThis.fetch = mock;
    try { return await fn(); } finally { globalThis.fetch = original; }
}

test("report API rejects unconfirmed users before calling the database", async () => {
    let rpcCalled = false;
    const response = await withFetch(async url => {
        assert.match(String(url), /\/auth\/v1\/user$/);
        return new Response(JSON.stringify({ id: "u1", email: "new@example.com", email_confirmed_at: null }), { status: 200 });
    }, () => onRequestPost({ request: request({ target_worth_it_id: 7, reason: "spam" }), env }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "EMAIL_NOT_CONFIRMED");
    assert.equal(rpcCalled, false);
});

test("report API submits only through the database-enforced report RPC", async () => {
    const urls = [];
    const response = await withFetch(async (input, init = {}) => {
        const url = String(input); urls.push(url);
        if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1", email: "verified@example.com", email_confirmed_at: "2026-10-29T00:00:00Z" }), { status: 200 });
        if (url.endsWith("/rest/v1/rpc/submit_worth_it_user_report")) {
            assert.equal(JSON.parse(init.body).p_target_worth_it_id, 7);
            return new Response(JSON.stringify({ success: true, reports_remaining: 3 }), { status: 200 });
        }
        throw new Error("Unexpected URL " + url);
    }, () => onRequestPost({ request: request({ target_worth_it_id: 7, reason: "spam", details: "Repeated scam links" }), env }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reports_remaining, 3);
    assert.ok(urls.some(url => url.endsWith("/rest/v1/rpc/submit_worth_it_user_report")));
});

test("report API maps the server-enforced daily cap to HTTP 429", async () => {
    const response = await withFetch(async input => {
        if (String(input).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1", email: "verified@example.com", email_confirmed_at: "2026-10-29T00:00:00Z" }), { status: 200 });
        return new Response(JSON.stringify({ code: "P0001", message: "Daily report limit reached." }), { status: 400 });
    }, () => onRequestPost({ request: request({ target_worth_it_id: 7, reason: "spam" }), env }));
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "REPORT_DAILY_LIMIT");
});

test("admin reports API rejects non-admin users before reading report rows", async () => {
    const response = await withFetch(async input => {
        if (String(input).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u2", email: "member@example.com", email_confirmed_at: "2026-10-29T00:00:00Z" }), { status: 200 });
        throw new Error("Reports should not be queried for a non-admin");
    }, () => onRequestGet({ request: new Request("https://worth-it-calculator.pages.dev/api/admin-user-reports", { headers: { Origin: "https://worth-it-calculator.pages.dev", Authorization: "Bearer test-token" } }), env }));
    assert.equal(response.status, 403);
});

test("report database migration enforces confirmation, five-per-day limit, duplicate/self-report rejection and admin-only reads", () => {
    assert.match(migration, /email_confirmed_at is not null/i);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /report_count >= 5/);
    assert.match(migration, /no_self_report/);
    assert.match(migration, /already reported this user today/i);
    assert.match(migration, /Only Worth It admin can read user reports/);
    assert.match(migration, /revoke all on function public\.submit_worth_it_user_report/);
    assert.match(migration, /grant execute on function public\.submit_worth_it_user_report.*authenticated/i);
});

test("every non-own profile has a report action and Admin Panel includes User Reports", () => {
    assert.match(profile, /worthItProfileReportAction/);
    assert.match(profile, /\/api\/user-reports/);
    assert.match(admin, /data-admin-section="user-reports"/);
    assert.match(admin, /\/api\/admin-user-reports/);
    assert.match(html, /id="worthItProfileReportAction"/);
    assert.match(app, /requestWorthItEmailVerification/);
});
