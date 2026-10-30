import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const themes = readFileSync(new URL("../section-themes.css", import.meta.url), "utf8");
const shop = readFileSync(new URL("../shop.js", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");

const sectionIds = [
    "marketsSection",
    "cryptoSection",
    "waterLevelsSection",
    "moneySection",
    "carsSection",
    "weatherSection",
    "newsSection",
    "shipTrackingSection",
    "shopSection"
];

test("section palette stylesheet loads after the existing shared and chat styles", () => {
    const sharedStyle = html.indexOf('href="style.css?v=');
    const chatStyle = html.indexOf('href="chat-realtime.css?v=');
    const sectionStyle = html.indexOf('href="section-themes.css?v=section-themes-20261030a"');
    const leafletStyle = html.indexOf('href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"');

    assert.ok(sharedStyle >= 0 && chatStyle > sharedStyle && sectionStyle > chatStyle);
    assert.ok(leafletStyle > sectionStyle);
});

test("all major dashboard sections have distinct dark and light accent identities", () => {
    const darkAccents = [];
    for (const id of sectionIds) {
        const dark = new RegExp(`#${id}\\s*\\{[^}]*--wt-section-accent:\\s*#[0-9a-f]{6}`, "i");
        const light = new RegExp(`html\\[data-theme="light"\\] #${id}\\s*\\{[^}]*--wt-section-accent:\\s*#[0-9a-f]{6}`, "i");
        assert.match(themes, dark, `${id} has a dark accent`);
        assert.match(themes, light, `${id} has a contrast-safe light accent`);
        const value = themes.match(new RegExp(`#${id}\\s*\\{[^}]*--wt-section-accent:\\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase();
        darkAccents.push(value);
    }
    assert.equal(new Set(darkAccents).size, sectionIds.length, "each section has its own accent colour");
    assert.match(themes, /--wt-section-card:\s*linear-gradient/);
    assert.match(themes, /html\\[data-theme="light"\\][\\s\\S]*?--wt-section-card:\\s*linear-gradient/);
});

test("Markets no longer paints a large tinted panel behind its cards", () => {
    assert.match(themes, /#marketsSection\\s*\\{\\s*background:\\s*transparent;\\s*\\}/);
    assert.match(themes, /#marketsSection \.market-card\\s*,[\\s\\S]*?background:\\s*var\\(--wt-section-card\\)/);
});

test("the section palettes cover their existing card and control components", () => {
    const requiredSelectors = [
        "#marketsSection .market-card",
        "#cryptoSection .crypto-card",
        "#waterLevelsSection .water-level-card",
        "#moneySection .money-card",
        "#carsSection .car-card",
        "#weatherSection .weather-card",
        "#newsSection .news-card",
        "#shopSection .shop-card",
        "#shipTrackingSection .ship-tracking-vessel-card",
        "#marketsSection .worth-it-market-category-button",
        "#cryptoSection .crypto-filters button",
        "#waterLevelsSection .water-levels-filters button",
        "#newsSection .news-category-btn",
        "#shopSection .shop-filter",
        "#shipTrackingSection .ship-tracking-filters button"
    ];
    for (const selector of requiredSelectors) {
        assert.ok(themes.includes(selector), `missing themed selector: ${selector}`);
    }
});

test("Shop's dynamically-created section uses the same palette and global theme switch", () => {
    assert.match(shop, /container\\.id\\s*=\\s*"shopSection"/);
    assert.ok(themes.includes("#shopSection .shop-card"));
    assert.match(settings, /document\\.documentElement\\.dataset\\.theme\\s*=\\s*value/);
});

test("the section theme layer changes visual surfaces only, not layout geometry", () => {
    const layoutProperties = /(?:^|[;{])\\s*(?:width|min-width|max-width|height|min-height|max-height|padding|margin|display|position|top|right|bottom|left|inset|grid-template-columns|grid-template-rows|flex|gap|overflow|transform|z-index)\\s*:/im;
    assert.doesNotMatch(themes, layoutProperties);
});
