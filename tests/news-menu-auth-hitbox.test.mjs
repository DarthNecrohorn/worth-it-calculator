import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const news = readFileSync(new URL("../news-ui.js", import.meta.url), "utf8");

test("choosing a menu section always closes and unlocks the hamburger panel", () => {
    const start = app.indexOf("function closeNavMenuUnlessPreserved(navLinks)");
    assert.ok(start >= 0);
    const end = app.indexOf("\nfunction toggleMenu()", start);
    const body = app.slice(start, end);
    assert.match(body, /navLinks\.classList\.remove\("open"\)/);
    assert.match(body, /delete navLinks\.dataset\.preserveOpen/);
    assert.match(body, /navLinks\.setAttribute\("aria-hidden", "true"\)/);
    assert.match(body, /menuButton\.setAttribute\("aria-expanded", "false"\)/);
    assert.match(body, /--nav-scroll-lock", "0"/);
    assert.doesNotMatch(body, /if \(navLinks\.dataset\.preserveOpen !== "true"\)/);
});

test("open hamburger blocks header actions from receiving clicks behind the dropdown", () => {
    assert.match(css, /#navLinks\.nav-links\.open\s*\{[^}]*z-index:\s*2147483000 !important;[^}]*pointer-events:\s*auto !important;/);
    assert.match(css, /\.nav-inner:has\(> #navLinks\.nav-links\.open\) > \.nav-actions\s*\{\s*pointer-events:\s*none !important;/);
    assert.match(css, /\.nav-inner:has\(> #navLinks\.nav-links\.open\) > \.nav-actions \*\s*\{\s*pointer-events:\s*none !important;/);
    assert.match(html, /style\.css\?v=news-menu-auth-hitbox-20261015b/);
    assert.match(html, /app\.js\?v=news-menu-auth-hitbox-20261015b/);
});

test("the open hamburger shields every header sibling, including Sign out", () => {
    assert.match(css, /\.nav-inner:has\(> #navLinks\.nav-links\.open\) > :not\(#navLinks\):not\(\.menu-btn\):not\(\.logo\),\s*\.nav-inner:has\(> #navLinks\.nav-links\.open\) > :not\(#navLinks\):not\(\.menu-btn\):not\(\.logo\) \*\s*\{\s*pointer-events:\s*none !important;/);
    assert.match(css, /#navLinks\.nav-links\.open button\s*\{[^}]*pointer-events:\s*auto !important;/);
    const nav = html.slice(html.indexOf('<nav class="nav">'), html.indexOf("</nav>"));
    assert.match(nav, /class="signout-nav-btn" id="signOutNavBtn"/);
    assert.match(nav, /<\/div>\s*<button class="signout-nav-btn"/);
    assert.match(html, /style\.css\?v=news-menu-auth-hitbox-20261015b/);
});

test("News section code does not sign out or erase Supabase auth state", () => {
    assert.doesNotMatch(news, /\.auth\.signOut\s*\(/);
    assert.doesNotMatch(news, /localStorage\.removeItem\([^)]*(?:auth-token|supabase)/i);
});


test("News uses the resolved primary auth state for cache scoping without a second auth request", () => {
    const start = news.indexOf("async function getNewsAccountScope()");
    const end = news.indexOf("\nfunction readNewsFeedSnapshot", start);
    assert.ok(start >= 0, "News account-scope helper exists");
    assert.ok(end > start, "News account-scope helper has a clear boundary");
    const body = news.slice(start, end);
    assert.match(body, /window\.worthItAuthReady/);
    assert.match(body, /window\.worthItAuthStateResolved/);
    assert.match(body, /window\.worthItCurrentAuthUser\?\.id/);
    assert.doesNotMatch(body, /\.auth\??\.getUser\s*\(/);
    assert.doesNotMatch(body, /supabaseClient/);
});

test("News rechecks the account scope before reusing its in-memory feed", () => {
    const start = news.indexOf("async function loadNews()");
    const end = news.indexOf("/* =========================================================\n   NEWS", start);
    const body = news.slice(start, end < 0 ? undefined : end);
    assert.ok(start >= 0, "loadNews exists");
    assert.ok(body.indexOf("await getNewsAccountScope()") < body.indexOf("showNewsCategory(\"all\")"));
    assert.match(body, /newsFeedAccountScope !==\s*previousAccountScope/);
    assert.match(body, /newsData = \{\};/);
    assert.match(body, /newsLoadInProgress = false;\s*return;/);
});
