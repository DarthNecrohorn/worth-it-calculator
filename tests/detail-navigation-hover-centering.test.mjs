import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../site-theme-system.css", import.meta.url), "utf8");
const marketsUi = readFileSync(new URL("../markets-ui.js", import.meta.url), "utf8");
const currencyUi = readFileSync(new URL("../currencies-ui.js", import.meta.url), "utf8");
const mainCss = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("detail navigation arrows retain vertical centering when the Custom Theme hover effect is None", () => {
    const globalNoneRule = themeCss.indexOf('html[data-worth-it-custom-theme][data-worth-it-hover-effect="none"] body :is(button,.settings-option):hover:not(:disabled)');
    const navOverride = themeCss.lastIndexOf('html[data-worth-it-custom-theme][data-worth-it-hover-effect="none"] body button:is(');
    assert.ok(globalNoneRule >= 0, "the generic no-hover rule exists");
    assert.ok(navOverride > globalNoneRule, "the narrow arrow override follows the generic rule");

    const requiredArrowSelectors = [
        ".worth-it-market-detail-navigation",
        ".currency-detail-nav",
        ".crypto-detail-nav",
        ".water-levels-detail-nav"
    ];
    const overrideBlock = themeCss.slice(navOverride);
    for (const selector of requiredArrowSelectors) {
        assert.ok(overrideBlock.includes(selector), "missing detail navigation selector: " + selector);
    }

    assert.match(overrideBlock, /transform:\s*translateY\(-50%\)\s*scale\(1\.025\)\s*!important/);
    assert.match(themeCss, /body button:is\([\s\S]*?\.water-levels-detail-nav[\s\S]*?transform:translateY\(-50%\) scale\(1\.025\) !important/);
});

test("the four detail navigation implementations still define their top-half centering anchors", () => {
    assert.match(marketsUi, /\.worth-it-market-detail-navigation\s*\{[\s\S]*?top:50%[\s\S]*?transform:translateY\(-50%\) !important/);
    assert.match(currencyUi, /\.currency-detail-nav\{[^}]*top:50%[^}]*transform:translateY\(-50%\)/);
    assert.match(mainCss, /\.crypto-detail-nav\s*\{[\s\S]*?top:50%[\s\S]*?transform:translateY\(-50%\)/);
    assert.match(mainCss, /\.water-levels-detail-nav\s*\{[\s\S]*?top:50%[\s\S]*?transform:translateY\(-50%\)/);
});

test("the shared theme stylesheet cache version is refreshed for the hover fix", () => {
    assert.match(html, /site-theme-system\.css\?v=[^"']*detail-navigation-hover=20261116a/);
});
