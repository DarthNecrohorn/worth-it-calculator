import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const adminPanel = readFileSync(new URL("../admin-panel.js", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const feedbackApi = readFileSync(new URL("../functions/api/feedback.js", import.meta.url), "utf8");
const adminFeedbackApi = readFileSync(new URL("../functions/api/admin-feedback.js", import.meta.url), "utf8");

test("Bugs & Suggestions is visible to all visitors, not gated by the owner role", () => {
    const header = html.match(/<button class="feedback-nav-btn"[^>]*>/);
    const footer = html.match(/<button type="button" class="feedback-trigger"[^>]*>/);

    assert.ok(header, "the header feedback button exists");
    assert.ok(footer, "the footer feedback button exists");
    assert.doesNotMatch(header[0], /style\s*=\s*["'][^"']*display\s*:\s*none/i);
    assert.doesNotMatch(footer[0], /style\s*=\s*["'][^"']*display\s*:\s*none/i);
    assert.match(html, /style\.css\?v=mobile-chat-panel-a-baseline-20261023b/);
    assert.match(html, /admin-panel\.js\?v=feedbackpublic20261023a/);

    assert.match(
        adminPanel,
        /document\.querySelectorAll\('\.feedback-nav-btn, \.feedback-trigger'\)\.forEach\(function\(element\)\{\s*element\.style\.display = '';\s*\}\);/
    );
    assert.doesNotMatch(
        adminPanel,
        /document\.querySelectorAll\('\.feedback-nav-btn, \.feedback-trigger'\)\.forEach\(function\(element\)\{\s*element\.style\.display = admin \? '' : 'none';/
    );
});

test("public feedback submission still requires sign-in and feedback review remains admin-only", () => {
    assert.match(settings, /Please sign in before sending feedback\./);
    assert.match(feedbackApi, /if \(!token\)[\s\S]*?Please sign in to send feedback\./);
    assert.match(adminPanel, /async function showAdminSection\(section\)\{\s*if\(!\(await isAdmin\(\)\)\)\{ closeAdminPanel\(\); return; \}/);
    assert.ok(adminFeedbackApi.includes("const ADMIN_EMAIL ="));
    assert.ok(adminFeedbackApi.includes("!== ADMIN_EMAIL"));
    assert.match(adminFeedbackApi, /\{ error: "Forbidden\." \}[\s\S]*?403/);
});

test("phone profile avatar is larger while A+ and A++ utility rows move left by the requested rendered distance", () => {
    assert.match(css, /\.nav-top-row \.nav-actions \.auth-wrap > \.profile-nav-btn\s*\{[\s\S]*?width: 40px !important;[\s\S]*?height: 40px !important;[\s\S]*?flex: 0 0 40px !important;/);
    assert.match(css, /\.nav-top-row \.nav-actions > \.auth-wrap\s*\{[\s\S]*?width: 40px !important;[\s\S]*?flex: 0 0 40px !important;/);
    assert.match(css, /\.nav-top-row \.nav-actions \.auth-wrap > \.profile-nav-btn > #profileNavIcon\s*\{[\s\S]*?width: 34px !important;[\s\S]*?height: 34px !important;/);
    assert.match(css, /html\[data-ui-scale="large"\] \.nav-top-row \.nav-actions\s*\{\s*left: -4\.31px !important;/);
    assert.match(css, /html\[data-ui-scale="xl"\] \.nav-top-row \.nav-actions\s*\{\s*left: -7\.58px !important;/);
    assert.match(css, /html\[data-ui-scale="large"\] \.nav-top-row \.nav-actions \.auth-wrap > \.profile-nav-btn\s*\{[\s\S]*?width: 34\.5px !important;/);
    assert.match(css, /html\[data-ui-scale="xl"\] \.nav-top-row \.nav-actions \.auth-wrap > \.profile-nav-btn\s*\{[\s\S]*?width: 30\.3px !important;/);
    assert.match(settings, /const SCALE = \{small:\.82, normal:1, large:1\.16, xl:1\.32\}/);
});
