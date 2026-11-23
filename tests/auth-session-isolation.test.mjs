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

test("the standard Sign out button confirms first and then revokes only the current browser session", () => {
    assert.match(html, /id="signOutNavBtn" onclick="signOutUser\(\)"/);
    const start = app.indexOf("async function performSignOutUser()");
    assert.ok(start >= 0, "the confirmed sign-out implementation exists");
    const end = app.indexOf("function signOutUser()", start);
    const body = app.slice(start, end < 0 ? start + 1800 : end);
    assert.match(body, /\.signOut\(\{\s*scope:\s*"local"\s*\}\)/);
    const handlerStart = app.indexOf("function signOutUser()");
    const handlerEnd = app.indexOf("/* =========================================================\nACCOUNT PAGE", handlerStart);
    const handler = app.slice(handlerStart, handlerEnd);
    assert.match(handler, /yesButton\.addEventListener\("click", event => \{[\s\S]*?finish\(true\)/);
    assert.match(handler, /noButton\.addEventListener\("click", event => \{[\s\S]*?finish\(false\)/);
});

test("the hamburger menu overlays header actions instead of overlapping them", () => {
    assert.match(css, /@media\(max-width:1000px\)[\s\S]*?\.nav-links\.open\s*\{[\s\S]*?z-index:\s*800/);
    assert.match(css, /\.nav-links\.open button\s*\{\s*width:\s*100%;/);
    assert.match(html, /style\.css\?v=[^"']+/);
    assert.match(html, /app\.js\?v=auth-email-confirmation-success-20261115a/);
    assert.ok(html.includes("guest-mode.js?v=guest-lite-dialog-polish-20261123a"));
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


test("username login distinguishes only Supabase's explicit unconfirmed-email error and never returns the email", () => {
    assert.match(usernameLogin, /authErrorCode === "email_not_confirmed"/);
    assert.match(usernameLogin, /code: "EMAIL_NOT_CONFIRMED"/);
    assert.match(usernameLogin, /emailProvider: getMailboxProvider\(email\)/);
    assert.match(usernameLogin, /"Incorrect username or password\."/);
    assert.doesNotMatch(usernameLogin, /email:\s*email,/);
});

test("email confirmation guidance gives safe provider-specific inbox links without injecting HTML", () => {
    assert.match(app, /function setAuthEmailConfirmationStatus\(provider = "other", correctCredentials = false\)/);
    assert.match(app, /Your username and password are correct, but you must confirm your email address/);
    assert.match(app, /Your Worth It account has been created\. Confirm your email address to finish signing up/);
    assert.match(app, /https:\/\/mail\.google\.com\/mail\/u\/0\/#inbox/);
    assert.match(app, /https:\/\/outlook\.live\.com\/mail\/0\/inbox/);
    assert.match(app, /https:\/\/outlook\.office\.com\/mail\//);
    assert.match(app, /document\.createElement\("a"\)/);
    assert.match(app, /link\.rel = "noopener noreferrer"/);
    assert.match(app, /error\?\.code === "EMAIL_NOT_CONFIRMED"/);
    assert.match(css, /\.auth-modal-status \.auth-email-inbox-link/);
});


test("Create account close button shifts right 10px and uses the shared site-wide button hover and active effects", () => {
    assert.doesNotMatch(css, /#authModalOverlay\.signup-mode \.auth-modal-card\s*\{[^}]*left:\s*-10px!important/);
    assert.match(html, /id="authModalCloseButton"/);
    assert.match(html, /id="authModalCloseGlyph" aria-hidden="true">✕<\/span>/);
    assert.match(css, /#authModalOverlay\.signup-mode #authModalCloseButton\s*\{[^}]*top:0!important/);
    assert.match(css, /#authModalOverlay\.signup-mode #authModalCloseButton\s*\{[^}]*left:10px!important/);
    assert.match(css, /#authModalOverlay\.signup-mode #authModalCloseButton\s*\{[^}]*transform:translateX\(-10px\)!important/);
    assert.match(css, /#authModalOverlay\.signup-mode #authModalCloseButton:hover,[\s\S]*?transform:translate\(-10px,-2px\) scale\(1\.015\)!important/);
    assert.match(css, /#authModalOverlay\.signup-mode #authModalCloseButton:active\s*\{[^}]*scale\(\.995\)!important/);
    assert.match(css, /#authModalOverlay.signup-mode #authModalCloseGlyph\s*\{[^}]*top:1px!important/);
    assert.match(html, /signup-close-right-standard-hover=20261115b/);
});

test("email confirmation callback clears the one-time session and presents the sign-in flow", () => {
    assert.match(app, /function handleEmailConfirmationLanding\(event, session\)/);
    assert.match(app, /callbackParams\.get\("type"\) !== "signup"/);
    assert.match(app, /window\.history\.replaceState\([\s\S]*?window\.location\.pathname \+ window\.location\.search/);
    assert.match(app, /auth\.signOut\(\{\s*scope:\s*"local"\s*\}\)/);
    assert.match(app, /Your email has been successfully confirmed\. You can now log in to your Worth It account\./);
    assert.match(app, /if \(handleEmailConfirmationLanding\(event, session\)\) \{\s*return;\s*\}/);
    assert.match(html, /app\.js\?v=auth-email-confirmation-success-20261115a/);
});

test("Remember me is opt-in and stores unchecked sign-ins only for the browser session", () => {
    assert.match(app, /const AUTH_REMEMBER_UNTIL_KEY = "worth_it_auth_remember_until_v1"/);
    assert.match(app, /const AUTH_REMEMBER_DURATION_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(app, /storage: worthItAuthStorage/);
    assert.match(app, /storageKey: AUTH_STORAGE_KEY/);
    assert.match(app, /window\.sessionStorage\.setItem\(key, value\)/);
    assert.match(app, /window\.localStorage\.setItem\(key, value\)/);
    assert.match(app, /function setAuthRememberMe\(enabled\)/);
    assert.match(app, /if \(key === AUTH_STORAGE_KEY\)[\s\S]*?removeItem\(AUTH_REMEMBER_UNTIL_KEY\)/);
    assert.match(app, /window\.sessionStorage\.removeItem\(AUTH_STORAGE_KEY\)/);
    assert.match(app, /setAuthRememberMe\(Boolean\(\$\("authRememberMe"\)\?\.checked\)\)/);
    assert.match(html, /id="authRememberMe" name="rememberMe" value="yes"/);
    assert.match(html, /id="authRememberWrap" style="display:none;"/);
    const signInButtonEnd = html.indexOf('id="authSubmitBtn"');
    const rememberRow = html.indexOf('id="authRememberWrap"');
    const statusRow = html.indexOf('id="authModalStatus"');
    assert.ok(signInButtonEnd >= 0 && rememberRow > signInButtonEnd && statusRow > rememberRow);
});

test("Create account modal removes its internal scrollbar and keeps email status between guest and sign-in link", () => {
    const submit = html.indexOf('id="authSubmitBtn"');
    const guestInsert = guest.indexOf('submit.insertAdjacentElement("afterend", choice)');
    const status = html.indexOf('id="authModalStatus"');
    const mode = html.indexOf('id="authModeToggle"');
    assert.ok(submit >= 0 && guestInsert >= 0 && status > submit && mode > status);
    assert.match(css, /#authModalOverlay\.signup-mode \.auth-modal-card\{[\s\S]*?overflow-y:visible!important/);
    assert.match(css, /#authModalOverlay\.signup-mode \.auth-modal-card\{[\s\S]*?max-height:none!important/);
});
