import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const chat = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const profile = readFileSync(new URL("../profile-ui.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../guest-mode.js", import.meta.url), "utf8");
const ai = readFileSync(new URL("../functions/api/ai-chat.js", import.meta.url), "utf8");
const media = readFileSync(new URL("../functions/api/chat-media.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../functions/api/resend-email-confirmation.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261029110000_rate_limit_email_confirmation_resend.sql", import.meta.url), "utf8");

test("unverified sessions are represented to the main app as guests while retaining a confirmation notice", () => {
    assert.match(app, /function isWorthItEmailVerified\(user\)/);
    assert.match(app, /user\.email_confirmed_at \|\| user\.confirmed_at/);
    assert.match(app, /currentAuthUser = isWorthItEmailVerified\(sessionUser\) \? sessionUser : null/);
    assert.match(app, /window\.worthItCurrentAuthUser = currentAuthUser/);
    assert.match(app, /window\.worthItPendingEmailUser = sessionUser && !currentAuthUser \? sessionUser : null/);
    assert.match(chat, /const effectiveUser = user && typeof window\.isWorthItEmailVerified/);
    assert.match(profile, /function getVerifiedWorthItProfileUser\(user\)/);
    assert.match(guest, /const effectiveUser = sessionUser &&[\s\S]*?!window\.isWorthItEmailVerified\(sessionUser\)/);
    assert.match(profile, /currentUser=getVerifiedWorthItProfileUser\(data\?\.session\?\.user\|\|null\)/);
    assert.match(ai, /code: "EMAIL_NOT_CONFIRMED"/);
    assert.match(media, /code:"EMAIL_NOT_CONFIRMED"/);
});

test("email resend is performed only by a server endpoint guarded by an atomic 24-hour per-user database claim", () => {
    assert.match(route, /verifyUser\(config, token\)/);
    assert.match(route, /claim_worth_it_email_confirmation_resend/);
    assert.match(route, /release_worth_it_email_confirmation_resend/);
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
