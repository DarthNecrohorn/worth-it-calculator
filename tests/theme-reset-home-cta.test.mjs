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
});

test("Reset settings permanently removes the current account's saved Custom Theme", () => {
    assert.match(settings, /resetWorthItCustomThemeFromSettings \|\| window\.resetWorthItCustomTheme/);
    assert.match(settings, /if \(customThemeReset\) \{[\s\S]*?setTheme\("dark"\)/);
    assert.match(settings, /updateWorthItAppearanceModeControls\?\.\(\)/);
    assert.match(community, /async function resetCustomThemeFromSettings\(\)/);
    const reset = community.match(/async function resetCustomThemeFromSettings\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.ok(reset, "settings reset handler is present");
    assert.match(reset, /sb\(\)\?\.auth\?\.getSession\?\.\(\)/);
    assert.match(reset, /from\("worth_it_user_themes"\)\.delete\(\)\.eq\("user_id",userId\)/);
    assert.match(reset, /removeLocal\(scopedKey\(THEME_KEY,userId\)\)/);
    assert.match(reset, /themePreviewActive=false/);
    assert.match(reset, /applyTheme\(DEFAULT_THEME\)/);
    assert.match(community, /window\.resetWorthItCustomThemeFromSettings=resetCustomThemeFromSettings/);
});

test("resetting the theme re-enables Dark and Light controls", () => {
    assert.match(community, /window\.updateWorthItAppearanceModeControls=updateAppearanceModeControls/);
    assert.match(community, /button\.disabled=custom/);
    assert.match(settings, /window\.updateWorthItAppearanceModeControls\?\.\(\)/);
});
