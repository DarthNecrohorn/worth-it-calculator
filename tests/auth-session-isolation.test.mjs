import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../guest-mode.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const usernameLogin = readFileSync(new URL("../functions/api/auth-username-login.js", import.meta.url), "utf8");

test("MFA sign-in reuses a non-persistent Supabase client isolated from the main session key", () => {
    assert.match(app, /let authMfaLoginClient = null/);
    assert.match(app, /function getAuthMfaLoginClient\(\)[\s\S]*?storageKey:\s*"worth-it-mfa-pending-auth-token-v1"[\s\S]*?return authMfaLoginClient/);
    assert.match(app, /const temporaryAuthClient = getAuthMfaLoginClient\(\)/);
    assert.doesNotMatch(app, /const temporaryAuthClient = window\.supabase\.createClient/);
});

test("Guest Lite reads the resolved primary auth state instead of racing a second initial session read", () => {
    assert.match(app, /window\.worthItCurrentAuthUser = currentAuthUser/);
    assert.match(app, /window\.worthItAuthStateResolved = true/);
    assert.match(guest, /if \(window\.worthItAuthStateResolved\) \{/);
    assert.match(guest, /window\.worthItCurrentAuthUser \|\| null/);
});

test("the standard Sign out button revokes only the current browser session", () => {
    const start = app.indexOf("async function signOutUser()");
    assert.ok(start >= 0, "signOutUser function exists");
    const end = app.indexOf("/*", start + 30);
    const body = app.slice(start, end < 0 ? start + 1600 : end);
    assert.match(body, /\.signOut\(\{\s*scope:\s*"local"\s*\}\)/);
});

test("the hamburger menu overlays header actions instead of overlapping them", () => {
    assert.match(css, /@media\(max-width:1000px\)[\s\S]*?\.nav-links\.open\s*\{[\s\S]*?z-index:\s*800/);
    assert.match(css, /\.nav-links\.open button\s*\{\s*width:\s*100%;/);
    assert.match(html, /style\.css\?v=news-menu-auth-hitbox-20261015a/);
    assert.match(html, /app\.js\?v=news-menu-auth-hitbox-20261015a/);
    assert.match(html, /guest-mode\.js\?v=news-menu-auth-hitbox-20261015a/);
});


test("username login allows production and only the Worth It Pages preview origin pattern", () => {
    assert.match(usernameLogin, /const SITE_ORIGIN = "https:\/\/worth-it-calculator\.pages\.dev"/);
    assert.match(usernameLogin, /PREVIEW_ORIGIN_PATTERN/);
    assert.match(usernameLogin, /worth-it-calculator\\\.pages\\\.dev\$/);
    assert.match(usernameLogin, /function isAllowedOrigin\(origin\)/);
    assert.match(usernameLogin, /origin === SITE_ORIGIN/);
    assert.match(usernameLogin, /PREVIEW_ORIGIN_PATTERN\.test\(origin\)/);
    assert.match(usernameLogin, /!isAllowedOrigin\(origin\)/);
    assert.match(usernameLogin, /onRequestOptions\(context\)/);
    assert.match(usernameLogin, /jsonResponse\(\s*\{\},\s*204,\s*origin \|\| SITE_ORIGIN\s*\)/);
    assert.match(usernameLogin, /"Access-Control-Allow-Origin":\s*origin/);
});
