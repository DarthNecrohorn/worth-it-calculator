import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("user search remains independent beside the brand and outside account controls", () => {
    const logoStart = html.indexOf('<a href="#" class="logo"');
    const logoEnd = html.indexOf("</a>", logoStart);
    const searchStart = html.indexOf('id="worthItUserSearchBtn"');
    const navActionsStart = html.indexOf('<div class="nav-actions">');
    const authStart = html.indexOf('<div class="auth-wrap" id="authWrap">');
    assert.ok(logoStart >= 0 && logoEnd > logoStart, "Expected the brand anchor");
    assert.ok(searchStart > logoEnd && searchStart < navActionsStart, "User search is by the brand, outside both utility rows");
    assert.ok(authStart > navActionsStart, "Account controls remain in the primary utility row");
    assert.doesNotMatch(html.slice(navActionsStart, authStart), /worth-it-user-search-btn/);
});

test("logged-out Sign in gets its own width and no longer overlaps Search", () => {
    assert.match(app, /btn\.style\.display\s*=\s*"inline-flex"/);
    assert.match(app, /btn\.style\.display\s*=\s*"none"/);
    assert.match(css, /\.auth-wrap:has\(> #authBtn:not\(\[style\*="display: none"\]\)\)\s*\{[^}]*width:max-content !important;[^}]*\}/);
    assert.match(css, /\.auth-wrap:has\(> #authBtn:not\(\[style\*="display: none"\]\)\) > #authBtn\s*\{[^}]*position:relative !important;[^}]*right:auto !important;[^}]*\}/);
    assert.match(css, /\.auth-wrap:has\(> #authBtn:not\(\[style\*="display: none"\]\)\) > #authBtn:hover,[\s\S]*?transform:translateY\(-2px\) !important;/);
});

test("the signed-in profile/avatar layout remains on its existing CSS path", () => {
    assert.match(css, /\.auth-wrap\{position:relative;display:flex;align-items:center;gap:8px;flex:0 0 44px;width:44px;height:44px\}/);
    assert.match(css, /\.auth-wrap:has\(> #authBtn:not\(\[style\*="display: none"\]\)\)/);
    assert.match(html, /style\.css\?v=[^"']+/);
});


test("header utility controls are arranged in two right-aligned rows", () => {
    const navStart = html.indexOf('<nav class="nav">');
    const navEnd = html.indexOf("</nav>", navStart);
    const nav = html.slice(navStart, navEnd);
    const topStart = nav.indexOf('<div class="nav-top-row">');
    const secondStart = nav.indexOf('<div class="nav-secondary-row">');
    assert.ok(topStart >= 0 && secondStart > topStart, "both header rows exist in order");

    const topRow = nav.slice(topStart, secondStart);
    assert.ok(!topRow.includes('id="worthItUserSearchBtn"'), "user search stays beside the brand, not in the top-right row");
    assert.ok(nav.indexOf('id="worthItUserSearchBtn"') < topStart, "user search appears before the top-right stack");
    for (const id of [
        "worthItNotificationBell",
        "worthItChatNavBtn",
        "profileNavBtn",
        "aiChatNavBtn"
    ]) {
        assert.ok(topRow.includes('id="' + id + '"'), id + " stays in the top row");
    }
    const aiPosition = topRow.indexOf('id="aiChatNavBtn"');
    const profilePosition = topRow.indexOf('id="profileNavBtn"');
    assert.ok(aiPosition >= 0 && profilePosition > aiPosition, "AI Chat appears before the profile on the top row");
    assert.match(css, /\.nav-top-row \.nav-actions > \.ai-chat-nav-btn\s*\{\s*order:\s*2 !important;/);
    assert.match(css, /\.nav-top-row \.nav-actions > \.auth-wrap\s*\{\s*order:\s*3 !important;/);

    const secondaryRow = nav.slice(secondStart);
    for (const id of ["adminPanelButton", "signOutNavBtn"]) {
        assert.ok(secondaryRow.includes('id="' + id + '"'), id + " moves to the lower row");
    }
    assert.ok(secondaryRow.includes('class="feedback-nav-btn"'), "Bugs & Suggestions is in the lower row");
    assert.ok(secondaryRow.includes('class="settings-btn"'), "Settings is in the lower row");
    assert.match(css, /\.nav-right-stack\s*\{[^}]*flex-direction:\s*column/);
    assert.match(css, /\.nav-secondary-row\s*\{[^}]*justify-content:\s*flex-end/);
});


test("profile dropdown opens below the secondary header row and stays in the viewport", () => {
    assert.match(app, /function positionAccountPanelForMobile\(\)[\s\S]*?const secondaryRow = document\.querySelector\("\.nav-secondary-row"\)/);
    assert.match(app, /panel\.style\.setProperty\("--account-panel-top", top \+ "px"\)/);
    assert.match(app, /--account-panel-available-height/);
    assert.match(app, /visualViewport\.addEventListener\("resize", positionAccountPanelForMobile\)/);
    assert.match(css, /\.nav-top-row \.nav-actions \.auth-wrap \.account-panel\s*\{[\s\S]*?left: auto !important;[\s\S]*?right: 0 !important;[\s\S]*?top: var\(--account-panel-top,[\s\S]*?width: min\(290px, calc\(\(100vw - 20px\) \/ var\(--ui-scale, 1\)\)\) !important;[\s\S]*?max-height: var\(--account-panel-available-height,[\s\S]*?overflow: auto !important;/);
    assert.match(html, /style\.css\?v=mobile-chat-panel-a-minus-fix-20261024a/);
});
