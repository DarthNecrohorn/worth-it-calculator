import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const community = readFileSync(new URL("../community-features.js", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../site-theme-system.css", import.meta.url), "utf8");

test("homepage Start calculating and Calculator glows use the active Custom Theme palette", () => {
    assert.match(html, /class="btn btn-primary"[^>]*>[\s\S]*?Start calculating/);
    assert.match(html, /class="btn btn-secondary"[^>]*>[\s\S]*?Calculator/);
    assert.match(themeCss, /#homePage \.hero-actions > \.btn-primary/);
    assert.match(themeCss, /#homePage \.hero-calculator-action > \.btn-secondary/);
    assert.match(themeCss, /0 10px 28px color-mix\(in srgb, var\(--primary\) 28%, transparent\)/);
    assert.match(themeCss, /data-worth-it-button-style="solid"/);
    assert.match(themeCss, /data-worth-it-button-style="outline"/);
    assert.match(themeCss, /data-worth-it-button-style="gradient"/);
});

test("chat Travel back to present remains centred and only scales on hover", () => {
    assert.match(html, /class="worth-it-chat-travel-present" id="worthItChatTravelPresentBtn"/);
    assert.match(themeCss, /button\.worth-it-chat-travel-present:not\(\[disabled\]\):hover[\s\S]*?transform: translateX\(-50%\) scale\(1\.045\) !important/);
    assert.match(themeCss, /button\.worth-it-chat-travel-present:not\(\[disabled\]\):active[\s\S]*?transform: translateX\(-50%\) scale\(\.96\) !important/);
    assert.match(themeCss, /#worthItChatTravelPresentBtn:not\(\[disabled\]\):hover[\s\S]*?transform: translateX\(-50%\) scale\(1\.045\) !important/);
    assert.match(themeCss, /#worthItChatTravelPresentBtn:not\(\[disabled\]\):active[\s\S]*?transform: translateX\(-50%\) scale\(\.96\) !important/);
    assert.ok(
        themeCss.lastIndexOf("#worthItChatTravelPresentBtn:not([disabled]):hover") >
        themeCss.lastIndexOf('data-worth-it-hover-effect="none"'),
        "ID-specific anchor override must come after the generic Custom Theme hover rules"
    );
});

test("Reset settings permanently removes the current account's saved Custom Theme", () => {
    assert.match(settings, /resetWorthItCustomThemeFromSettings \|\| window\.resetWorthItCustomTheme/);
    assert.match(settings, /if \(customThemeReset\) \{[\s\S]*?setTheme\("dark"\)/);
    assert.match(settings, /updateWorthItAppearanceModeControls\?\.\(\)/);
    assert.match(community, /async function resetCustomThemeFromSettings\(\)/);
    const reset = community.match(/async function resetCustomThemeFromSettings\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.ok(reset, "settings reset handler is present");
    assert.match(reset, /sb\(\)\?\.auth\?\.getSession\?\.\(\)/);
    assert.match(reset, /deleteAndVerifySavedTheme\(userId\)/);
    assert.match(reset, /clearLocalThemeState\(userId\)/);
    assert.match(community, /async function deleteAndVerifySavedTheme\(userId\)/);
    assert.match(reset, /themePreviewActive=false/);
    assert.match(reset, /applyStandardDarkTheme\(\)/);
    assert.match(community, /window\.resetWorthItCustomThemeFromSettings=resetCustomThemeFromSettings/);
});

test("resetting the theme re-enables Dark and Light controls", () => {
    assert.match(community, /window\.updateWorthItAppearanceModeControls=updateAppearanceModeControls/);
    assert.match(community, /button\.disabled=custom/);
    assert.match(settings, /window\.updateWorthItAppearanceModeControls\?\.\(\)/);
});


test("Restore default theme always applies standard Dark and removes the account theme", () => {
    const helperStart = community.indexOf("function applyStandardDarkTheme()");
    const resetStart = community.indexOf("async function resetCustomTheme()");
    const resetEnd = community.indexOf("async function resetCustomThemeFromSettings()", resetStart);
    const helper = community.slice(helperStart, resetStart);
    const reset = community.slice(resetStart, resetEnd);
    assert.ok(helper.includes("applyTheme(DEFAULT_THEME)"));
    assert.ok(helper.includes('root.dataset.theme="dark"'));
    assert.ok(helper.includes('writeLocal("worthItTheme","dark")'));
    assert.ok(reset.includes("applyStandardDarkTheme()"));
    assert.ok(reset.includes("sb()?.auth?.getSession?.()"));
    assert.ok(reset.includes("deleteAndVerifySavedTheme(userId)"));
    assert.match(community, /async function deleteAndVerifySavedTheme\(userId\)/);
    assert.ok(!reset.includes("if(!themeEntitled"));
    assert.ok(!reset.includes("if(!themeSettingsOpen"));
    assert.ok(reset.includes("markThemeResetPending(knownUserId)"));
    assert.ok(reset.includes("clearLocalThemeState(knownUserId)") || reset.includes("clearLocalThemeState(userId)"));
});

test("Custom Theme Save confirms the exact row returned by Supabase before reporting success", () => {
    const saveStart = community.indexOf("async function saveCustomTheme()");
    const resetStart = community.indexOf("async function resetCustomTheme()", saveStart);
    const save = community.slice(saveStart, resetStart);
    assert.ok(save.includes('rpc("save_worth_it_custom_theme",{p_theme:theme})'));
    assert.ok(save.includes('.select("user_id,theme_name,primary_color,secondary_color,hover_color,header_color,theme_config")'));
    assert.ok(save.includes('.single()'));
    assert.ok(save.includes('const verified=await sb().from("worth_it_user_themes")'));
    assert.ok(save.includes("const confirmed=Boolean("));
    assert.ok(save.includes("if(!confirmed)throw new Error"));
    assert.ok(save.includes("Custom Theme saved to your account."));
    assert.ok(save.includes("Custom Theme was not saved."));
});


test("both reset entry points persist a pending reset before clearing local theme state", () => {
    assert.match(community, /const THEME_RESET_PENDING_KEY = "worthItCustomThemeResetPending:v1:"/);
    assert.match(community, /function markThemeResetPending\(userId\)/);
    assert.match(community, /localStorage\.setItem\(key,"1"\)/);
    for (const name of ["resetCustomTheme", "resetCustomThemeFromSettings"]) {
        const start = community.indexOf(`async function ${name}()`);
        const end = community.indexOf("\n}", start);
        const body = community.slice(start, end);
        assert.match(body, /markThemeResetPending\(/);
        assert.match(body, /clearLocalThemeState\(/);
        assert.match(body, /applyStandardDarkTheme\(\)/);
    }
});

test("pending reset is retried before any saved account theme can be hydrated", () => {
    const loadStart = community.indexOf("async function loadThemeForSession()");
    const loadEnd = community.indexOf("function releaseInitialThemeCover()", loadStart);
    const load = community.slice(loadStart, loadEnd);
    assert.match(load, /if\(isThemeResetPending\(userId\)\)/);
    assert.match(load, /await deleteAndVerifySavedTheme\(userId\)/);
    assert.match(load, /clearThemeResetPending\(userId\)/);
    assert.match(load, /Pending Worth It Custom Theme reset could not be confirmed/);
    assert.match(html, /const resetPending = localStorage\.getItem\("worthItCustomThemeResetPending:v1:" \+ sessionUserId\) === "1"/);
    assert.match(html, /resetPending \? null : JSON\.parse/);
});

test("reset deletion is read-after-write verified instead of trusting an RLS-filtered empty delete", () => {
    const helper = community.match(/async function deleteAndVerifySavedTheme\(userId\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(helper, /\.delete\(\)\.eq\("user_id",userId\)\.select\("user_id"\)/);
    assert.match(helper, /\.select\("user_id"\)\.eq\("user_id",userId\)\.maybeSingle\(\)/);
    assert.match(helper, /remaining\.data\?\.user_id===userId/);
});

test("a pending account reset blocks a new save until the reset is resolved", () => {
    const saveStart = community.indexOf("async function saveCustomTheme()");
    const resetStart = community.indexOf("async function resetCustomTheme()", saveStart);
    assert.match(community.slice(saveStart, resetStart), /isThemeResetPending\(themeUserId\)/);
    assert.match(community, /clearThemeResetPending\(themeUserId\)/);
});


test("reset safeguard is verified in persistent or session storage before local caches are cleared", () => {
    const helperStart = community.indexOf("function markThemeResetPending(userId)");
    const helperEnd = community.indexOf("function clearThemeResetPending(userId)", helperStart);
    const helper = community.slice(helperStart, helperEnd);
    assert.match(helper, /localStorage\.setItem\(key,"1"\)/);
    assert.match(helper, /localStorage\.getItem\(key\)==="1"/);
    assert.match(helper, /sessionStorage\.setItem\(key,"1"\)/);
    assert.match(helper, /if\(!persisted\)return false/);
    assert.match(helper, /clearLocalThemeState\(userId\)/);
    assert.match(html, /sessionStorage\.getItem\("worthItCustomThemeResetPending:v1:" \+ sessionUserId\)/);
});
