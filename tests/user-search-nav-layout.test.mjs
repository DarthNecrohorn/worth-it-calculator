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
    assert.match(html, /style\.css\?v=search-nav-layout-20261015a/);
});
