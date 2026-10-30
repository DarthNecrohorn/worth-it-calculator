import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("user search sits directly before Notifications in the upper-right utility row", () => {
    const navStart = html.indexOf('<nav class="nav">');
    const navEnd = html.indexOf("</nav>", navStart);
    const nav = html.slice(navStart, navEnd);
    const navActionsStart = nav.indexOf('<div class="nav-actions">');
    const searchStart = nav.indexOf('id="worthItUserSearchBtn"');
    const notificationStart = nav.indexOf('id="worthItNotificationBell"');
    const authStart = nav.indexOf('<div class="auth-wrap" id="authWrap">');

    assert.ok(navActionsStart >= 0, "header utility controls exist");
    assert.ok(searchStart > navActionsStart, "Search is inside the upper-right utility group");
    assert.ok(notificationStart > searchStart, "Search appears to the left of Notifications");
    assert.ok(authStart > notificationStart, "account controls remain after Notifications");
    assert.equal(nav.split('id="worthItUserSearchBtn"').length - 1, 1, "only one Search button exists");
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


test("header utility controls keep Search to the immediate left of Notifications", () => {
    const navStart = html.indexOf('<nav class="nav">');
    const navEnd = html.indexOf("</nav>", navStart);
    const nav = html.slice(navStart, navEnd);
    const topStart = nav.indexOf('<div class="nav-top-row">');
    const secondStart = nav.indexOf('<div class="nav-secondary-row">');
    assert.ok(topStart >= 0 && secondStart > topStart, "both header rows exist in order");

    const topRow = nav.slice(topStart, secondStart);
    const searchPosition = topRow.indexOf('id="worthItUserSearchBtn"');
    const notificationPosition = topRow.indexOf('id="worthItNotificationBell"');
    assert.ok(searchPosition >= 0 && notificationPosition > searchPosition, "Search is directly before the Notifications control");

    for (const id of [
        "worthItChatNavBtn",
        "profileNavBtn",
        "aiChatNavBtn"
    ]) {
        assert.ok(topRow.includes('id="' + id + '"'), id + " stays in the top row");
    }
    const aiPosition = topRow.indexOf('id="aiChatNavBtn"');
    const profilePosition = topRow.indexOf('id="profileNavBtn"');
    assert.ok(aiPosition >= 0 && profilePosition > aiPosition, "AI Chat appears before the profile on the top row");
    assert.match(css, /\.nav-top-row \.nav-actions > \.worth-it-user-search-btn\s*\{\s*order:\s*-1 !important;/);
    assert.match(css, /\.nav-top-row \.nav-actions > \.worth-it-notification-wrap\s*\{\s*order:\s*0 !important;/);
    assert.match(css, /\.nav-top-row \.nav-actions > \.ai-chat-nav-btn\s*\{\s*order:\s*2 !important;/);
    assert.match(css, /\.nav-top-row \.nav-actions > \.auth-wrap\s*\{\s*order:\s*3 !important;/);

    const secondaryRow = nav.slice(secondStart);
    for (const id of ["adminPanelButton", "signOutNavBtn"]) {
        assert.ok(secondaryRow.includes('id="' + id + '"'), id + " stays in the lower row");
    }
    assert.ok(!secondaryRow.includes('class="feedback-nav-btn"'), "Bugs & Suggestions is no longer in the header");
    assert.ok(html.includes('class="hero-feedback-btn"'), "Bugs & Suggestions appears above the Home hero badge");
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
    assert.match(html, /style\.css\?v=[^"']+/);
});
