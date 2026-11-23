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
    ["Web Shop", "openWebShop"],
    ["Compare cars", "openCars"],
    ["Markets", "openMarkets"],
    ["Currencies", "openMoney"],
    ["Cryptocurrencies", "openCrypto"],
    ["Water levels", "openWaterLevels"],
    ["Ship tracking", "openShipTracking"]
];

test("Guest Lite limits can be reviewed and continued without obsolete consent or reminder UI", () => {
    assert.match(html, /id="worthItGuestLimitsOverlay"[^>]*hidden/);
    assert.match(html, /id="worthItGuestLimitsTitle">Continue with limited guest access/);
    assert.match(html, /id="worthItGuestContinueButton">Continue as a guest/);
    assert.doesNotMatch(html, /worthItGuestConsentCheck|worthItGuestConsentStatus|I agree to these Guest Lite limits|remind you to create an account again after 24 hours/i);
    assert.doesNotMatch(guest, /worthItGuestConsentCheck|worthItGuestConsentStatus|LAST_ACCEPTED_KEY|writeTimestamp\(LAST_ACCEPTED_KEY/);
    assert.match(guest, /function acceptGuestLimits\(\)[\s\S]*?closeGuestLimits\(false\)/);
});

test("Guest Lite clearly explains its calculator access and daily CALC Lite allowance", () => {
    assert.match(html, /first 50 built-in Worth It calculators/);
    assert.match(html, /Basic, Advanced and Scientific/);
    assert.match(html, /Each paid built-in calculation costs <strong>0\.1 CALC Lite/);
    assert.match(html, /0\.5 CALC Lite per UTC day/);
    assert.match(html, /unused balance does not roll over/);
    assert.match(guest, /const BUILT_IN_CALCULATORS = new Set/);
    assert.match(guest, /GUEST_BILLABLE_CALCULATORS/);
    assert.match(guest, /isBillableCalculator/);
    assert.match(guest, /BUILT_IN_CALCULATORS\.has\(key\)/);
    assert.match(guest, /function guardGenericCalculatorSetup\(\)/);
    assert.match(guest, /window\.setupGeneric = wrapped/);
    assert.match(guest, /guestReturnFocus/);
    assert.match(guest, /User-created and community calculators require a Worth It account/);
});

test("the guest header clearly separates CALC Lite and gates both Web Shop entry points", () => {
    assert.match(html, /id="worthItCalcWalletButton"[^>]*onclick="openWebShop\('currency'\)"/);
    assert.match(html, /id="worthItWebShopButton"[^>]*onclick="openWebShop\('currency'\)"/);
    assert.ok(guest.includes('["openWebShop"'));
    assert.match(guest, /function showSignupForRestrictedFeature/);
    assert.match(guest, /openAuthModal\("signup"\)/);
    assert.match(html, /0\.5 CALC Lite per UTC day and no WIP/);
});

test("all requested website sections are account-gated", () => {
    for (const [label, opener] of restrictedSections) {
        assert.ok(guest.includes('["' + opener + '"'), label + " must be gated");
    }
    assert.match(html, /Weather, News, Shop, Web Shop, Compare Cars, Markets, Currencies, Cryptocurrencies, Water Levels and Ship Tracking/);
    assert.ok(guest.includes('/^\\/web-shop\\/?$/'));
    assert.match(guest, /RESTRICTED_PATHS/);
    assert.match(guest, /restoreHomeIfOnRestrictedPath/);
});

test("Search, social actions and all chat types are account-gated", () => {
    for (const name of [
        "openWorthItUserSearch",
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

test("automatic signup prompts never appear on initial load, refresh or pageshow", () => {
    assert.match(guest, /await Promise\.resolve\(window\.worthItAuthReady\)/);
    assert.match(guest, /function showSignupModal\(automatic\)/);
    assert.match(guest, /if \(isAuthenticated \|\| !authStateKnown\) return/);
    assert.doesNotMatch(guest, /scheduleDailyPrompt|NEXT_PROMPT_KEY|pageshow|worthItGuestLiteNextPromptAtV1/);
    assert.match(guest, /if \(isRestrictedPath\(window\.location\.pathname\)\) \{[\s\S]*?showSignupForRestrictedFeature/);
    assert.match(guest, /showAccountPrompt: \(\) => \{/);
    assert.match(guest, /if \(authStateKnown\) return isAuthenticated \? false : showSignupModal\(false\)/);
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
    assert.match(html, /guest-mode\.js\?v=guest-lite-dialog-polish-20261123a/);
    assert.match(workflow, /guest-mode\.js/);
});


test("mobile calculator catalogue keeps three cards per row and Guest Lite consent never overlays the list", () => {
    const communityCss = readFileSync(new URL("../community-features.css", import.meta.url), "utf8");
    assert.ok(communityCss.includes("grid-template-columns:repeat(3,minmax(0,1fr)) !important"));
    assert.match(communityCss, /\.calc-favorite-icon\s*\{[^}]*translateY\(0px\)/);
    assert.ok(communityCss.includes("grid-template-rows:auto minmax(0,1fr) auto auto auto!important"));
    assert.ok(communityCss.includes("html[data-ui-scale] .worth-it-guest-card"));
    assert.ok(communityCss.includes("overflow-y:auto!important"));
    assert.ok(communityCss.includes("position:static!important"));
    assert.doesNotMatch(html, /worthItGuestConsentCheck|worthItGuestConsentStatus/);
    assert.doesNotMatch(css, /\.worth-it-guest-consent/);
    assert.match(html, /community-features\.css\?v=hamburger-instant-20261105a/);
    assert.match(html, /guest-mode\.js\?v=guest-lite-dialog-polish-20261123a/);
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


test("a temporary Supabase session lookup failure never turns an existing session into a guest signup prompt", () => {
    assert.match(guest, /eventName === "AUTH_UNAVAILABLE"[\s\S]*?return;/);
    assert.match(guest, /if \(user === false\) return denyGuestAction\(reason\)/);
    assert.match(guest, /if \(user === null \|\| !authStateKnown\) return/);
    assert.doesNotMatch(guest, /NEXT_PROMPT_KEY|pageshow|scheduleDailyPrompt/);
    assert.match(app, /failed lookup is not proof that the user is signed out/i);
    assert.match(app, /if \(!window\.worthItAuthStateResolved\) \{[\s\S]*?worthItAuthResolutionFailed = true/);
});
