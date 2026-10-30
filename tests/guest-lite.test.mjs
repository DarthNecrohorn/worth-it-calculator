import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const guest = readFileSync(new URL("../guest-mode.js", import.meta.url), "utf8");
const guestApi = readFileSync(new URL("../functions/api/guest-calc.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/function-syntax-check.yml", import.meta.url), "utf8");

const restrictedSections = [
    ["Weather", "openWeather"],
    ["News", "openNews"],
    ["Shop", "openDiscounts"],
    ["Compare cars", "openCars"],
    ["Markets", "openMarkets"],
    ["Currencies", "openMoney"],
    ["Cryptocurrencies", "openCrypto"],
    ["Water levels", "openWaterLevels"],
    ["Ship tracking", "openShipTracking"]
];

test("a dedicated Guest Lite explanation contains the required consent checkbox", () => {
    assert.match(html, /id="worthItGuestLimitsOverlay"[^>]*hidden/);
    assert.match(html, /id="worthItGuestLimitsTitle">Continue with limited guest access/);
    assert.match(html, /id="worthItGuestConsentCheck"/);
    assert.match(html, /I agree to these Guest Lite limits and want to continue/);
    assert.match(html, /id="worthItGuestContinueButton" disabled>Continue as a guest/);
    assert.match(guest, /if \(!checkbox\?\.checked\)/);
    assert.match(guest, /setNextPromptAt\(Date\.now\(\) \+ DAY_MS\)/);
});

test("Guest Lite explicitly lists the default calculator catalogue as the only available feature", () => {
    assert.match(html, /first 50 built-in Worth It calculators/);
    assert.match(html, /first 50 built-in Worth It calculators/);
    assert.match(html, /Each calculation costs 0\.1 CALC/);
    assert.match(html, /resets to exactly <strong>0\.5 CALC each day/);
    assert.match(html, /Unused CALC does not roll over or accumulate/);
    assert.match(guest, /const BUILT_IN_CALCULATORS = new Set/);
    assert.match(guest, /GUEST_BILLABLE_CALCULATORS/);
    assert.match(guest, /isBillableCalculator/);
    assert.match(guest, /BUILT_IN_CALCULATORS\.has\(key\)/);
    assert.match(guest, /function guardGenericCalculatorSetup\(\)/);
    assert.match(guest, /window\.setupGeneric = wrapped/);
    assert.match(guest, /guestReturnFocus/);
    assert.match(guest, /User-created and community calculators require a Worth It account/);
});

test("all requested website sections are account-gated", () => {
    for (const [label, opener] of restrictedSections) {
        assert.ok(guest.includes('["' + opener + '"'), label + " must be gated");
    }
    assert.match(html, /Weather, News, Shop, Compare Cars, Markets, Currencies, Cryptocurrencies, Water Levels and Ship Tracking/);
    assert.match(guest, /RESTRICTED_PATHS/);
    assert.match(guest, /restoreHomeIfOnRestrictedPath/);
});

test("AI, search, social actions and all chat types are account-gated", () => {
    for (const name of [
        "openAIChat", "sendAIChatMessage", "openWorthItUserSearch",
        "openWorthItProfile", "performWorthItSocialAction",
        "performWorthItPendingRequestAction", "toggleWorthItNotifications",
        "toggleWorthItChat", "openWorthItGlobalChat", "openWorthItFriendChat",
        "openWorthItGroupChatDialog", "sendWorthItChatMessage",
        "shareWorthItGroupInvite", "acceptWorthItGroupInvite"
    ]) {
        assert.ok(guest.includes('["' + name + '"'), name + " must be gated");
    }
    assert.match(html, /sending messages, joining groups and using group invitations/i);
});

test("the automatic account prompt is delayed until auth state is known and repeats daily", () => {
    assert.match(guest, /await Promise\.resolve\(window\.worthItAuthReady\)/);
    assert.match(guest, /NEXT_PROMPT_KEY = "worthItGuestLiteNextPromptAtV1"/);
    assert.match(guest, /DAY_MS = 24 \* 60 \* 60 \* 1000/);
    assert.match(guest, /window\.setTimeout\(\(\) => \{\s*promptTimer = null;/);
    assert.match(guest, /if \(isAuthenticated\) \{/);
    assert.match(guest, /promptTimer !== null/);
});

test("the signup modal offers Guest Lite only in signup mode", () => {
    assert.match(guest, /Or continue as a guest/);
    assert.match(guest, /overlay\.classList\.contains\("signup-mode"\)/);
    assert.match(css, /\.auth-modal-overlay\.signup-mode \.auth-modal-guest-choice\{display:flex\}/);
    assert.match(guest, /showGuestLimits\(\)/);
});

test("Guest Lite dialog is responsive, theme-aware and the CI checks the new script", () => {
    assert.match(css, /\.worth-it-guest-overlay\[hidden\]\{display:none!important\}/);
    assert.match(css, /@media\(max-width:650px\)/);
    assert.match(css, /\.worth-it-guest-list ul\{font-size:12px/);
    assert.match(css, /html\[data-theme="light"\] \.worth-it-guest-card/);
    assert.match(html, /guest-mode\.js\?v=chat-route-preserve-20261028a/);
    assert.match(workflow, /guest-mode\.js/);
});


test("Guest Lite modal stacks above the sticky header while open", () => {
    assert.match(guest, /document\.body\.classList\.add\("worth-it-guest-dialog-open"\)/);
    assert.match(guest, /document\.body\.classList\.remove\("worth-it-guest-dialog-open"\)/);
    assert.match(css, /body\.worth-it-guest-dialog-open\s+\.nav\s*\{\s*z-index:\s*15040\s*!important;\s*\}/);
    assert.match(css, /\.worth-it-guest-overlay\s*\{[\s\S]*?z-index:\s*15050/);
    assert.match(html, /style\.css\?v=[A-Za-z0-9_-]+/);
});



test("sign-in and account-creation modals stack above the sticky header", () => {
    assert.match(html, /id="authModalOverlay"/);
    assert.match(css, /\.auth-modal-overlay\s*\{[\s\S]*?z-index:\s*1200/);
    assert.match(css, /body:has\(\.auth-modal-overlay\.open\):not\(\.worth-it-guest-dialog-open\)\s+\.nav\s*\{\s*z-index:\s*1190\s*!important;\s*\}/);
    assert.match(html, /style\.css\?v=[A-Za-z0-9_-]+/);
});


test("unauthenticated chat refresh keeps /chat in the address bar while sign-in is requested", () => {
    const restoreStart = guest.indexOf("function restoreHomeIfOnRestrictedPath()");
    const restoreEnd = guest.indexOf("\n    function installSignupGuestChoice()", restoreStart);
    assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, "route guard should exist");
    const guard = guest.slice(restoreStart, restoreEnd);
    const chatGuardIndex = guard.indexOf("chat(?:");
    assert.ok(chatGuardIndex >= 0, "chat has a route-preserving guard");
    const chatGuardReturn = guard.indexOf("return;", chatGuardIndex);
    assert.ok(chatGuardReturn > chatGuardIndex, "chat guard returns before home-reset logic");
    assert.ok(chatGuardReturn < guard.indexOf("window.history.replaceState"), "chat guard preserves the requested URL");
});


test("the guest client and D1 API share exactly the same 50 billable built-in calculator keys", () => {
    const clientBlock = guest.match(/const BUILT_IN_CALCULATORS = new Set\(\[([\s\S]*?)\]\);/);
    const serverBlock = guestApi.match(/const GUEST_CALCULATORS = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(clientBlock && serverBlock, "both allowlists must exist");
    const clientKeys = [...clientBlock[1].matchAll(/"([^"]+)"/g)].map(match => match[1]).filter(key => !["basic","advanced","scientific"].includes(key)).sort();
    const serverKeys = [...serverBlock[1].matchAll(/"([^"]+)"/g)].map(match => match[1]).sort();
    assert.equal(clientKeys.length, 50);
    assert.deepEqual(serverKeys, clientKeys);
});

test("closing Guest Lite and authentication dialogs moves focus before hiding the active dialog", () => {
    assert.match(guest, /overlay\.contains\(document\.activeElement\)[\s\S]*?document\.activeElement\.blur\(\)/);
    assert.match(guest, /guestReturnFocus/);
    assert.match(app, /overlay\.contains\(document\.activeElement\)[\s\S]*?document\.activeElement\.blur\(\)/);
    assert.match(app, /authModalReturnFocus/);
    assert.match(app, /function removeAuthTurnstile\(\)/);
    assert.match(app, /window\.turnstile\.remove\(authTurnstileWidgetId\)/);
});
