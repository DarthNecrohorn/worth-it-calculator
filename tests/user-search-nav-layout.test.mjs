import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("user search remains a separate navigation control next to auth", () => {
    const navActionsStart = html.indexOf('<div class="nav-actions">');
    const searchStart = html.indexOf('id="worthItUserSearchBtn"');
    const authStart = html.indexOf('<div class="auth-wrap" id="authWrap">');
    assert.ok(navActionsStart >= 0, "Expected the navigation action row");
    assert.ok(searchStart > navActionsStart, "User search is inside the navigation action row");
    assert.ok(authStart > searchStart, "User search is a separate sibling before the account controls");
    assert.match(html.slice(navActionsStart, authStart), /class="worth-it-user-search-btn"/);
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
    for (const id of [
        "worthItNotificationBell",
        "worthItChatNavBtn",
        "worthItUserSearchBtn",
        "profileNavBtn",
        "aiChatNavBtn"
    ]) {
        assert.ok(topRow.includes('id="' + id + '"'), id + " stays in the top row");
    }

    const secondaryRow = nav.slice(secondStart);
    for (const id of ["adminPanelButton", "signOutNavBtn"]) {
        assert.ok(secondaryRow.includes('id="' + id + '"'), id + " moves to the lower row");
    }
    assert.ok(secondaryRow.includes('class="feedback-nav-btn"'), "Bugs & Suggestions is in the lower row");
    assert.ok(secondaryRow.includes('class="settings-btn"'), "Settings is in the lower row");
    assert.match(css, /\.nav-right-stack\s*\{[^}]*flex-direction:\s*column/);
    assert.match(css, /\.nav-secondary-row\s*\{[^}]*justify-content:\s*flex-end/);
});
