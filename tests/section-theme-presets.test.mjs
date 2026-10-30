import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const themes = readFileSync(new URL("../section-themes.css", import.meta.url), "utf8");
const shop = readFileSync(new URL("../shop.js", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");

const palettePairs = [
    ['#marketsSection { --wt-section-accent:#e6b85c;', 'html[data-theme="light"] #marketsSection { --wt-section-accent:#a66b00;'],
    ['#cryptoSection { --wt-section-accent:#42d6a0;', 'html[data-theme="light"] #cryptoSection { --wt-section-accent:#047857;'],
    ['#waterLevelsSection { --wt-section-accent:#45c7d7;', 'html[data-theme="light"] #waterLevelsSection { --wt-section-accent:#0e7490;'],
    ['#moneySection { --wt-section-accent:#69a9ff;', 'html[data-theme="light"] #moneySection { --wt-section-accent:#1d4ed8;'],
    ['#carsSection { --wt-section-accent:#aa91ff;', 'html[data-theme="light"] #carsSection { --wt-section-accent:#6d28d9;'],
    ['#weatherSection { --wt-section-accent:#69bdf1;', 'html[data-theme="light"] #weatherSection { --wt-section-accent:#0369a1;'],
    ['#newsSection { --wt-section-accent:#f59b58;', 'html[data-theme="light"] #newsSection { --wt-section-accent:#c2410c;'],
    ['#shipTrackingSection { --wt-section-accent:#42cbd8;', 'html[data-theme="light"] #shipTrackingSection { --wt-section-accent:#0e7490;'],
    ['#shopSection { --wt-section-accent:#4acb94;', 'html[data-theme="light"] #shopSection { --wt-section-accent:#047857;']
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
    const darkAccents = palettePairs.map(([dark]) => dark.match(/#([a-f0-9]{6})/i)?.[1]?.toLowerCase());
    assert.equal(new Set(darkAccents).size, palettePairs.length, "each section has its own dark accent");

    for (const [dark, light] of palettePairs) {
        assert.ok(themes.includes(dark), `missing dark palette: ${dark}`);
        assert.ok(themes.includes(light), `missing contrast-safe light palette: ${light}`);
    }

    assert.ok(themes.includes("--wt-section-card:linear-gradient("));
    assert.ok(themes.includes("--wt-section-soft:color-mix("));
    assert.ok(themes.includes("html[data-theme=\"light\"] #marketsSection,"));
});

test("Markets no longer paints a large tinted panel behind its cards", () => {
    assert.ok(themes.includes("#marketsSection {\n    background:transparent;\n}"));
    assert.ok(themes.includes("#marketsSection .market-card,"));
    assert.ok(themes.includes("background:var(--wt-section-card);"));
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
    assert.ok(shop.includes('container.id =\n                "shopSection";'));
    assert.ok(themes.includes("#shopSection .shop-card"));
    assert.ok(settings.includes("document.documentElement.dataset.theme = value;"));
});

test("the section theme layer changes visual surfaces only, not layout geometry", () => {
    const layoutProperties = [
        "width:", "min-width:", "max-width:",
        "height:", "min-height:", "max-height:",
        "padding:", "margin:", "display:", "position:",
        "top:", "right:", "bottom:", "left:", "inset:",
        "grid-template-columns:", "grid-template-rows:",
        "flex:", "gap:", "overflow:", "transform:", "z-index:"
    ];
    for (const property of layoutProperties) {
        assert.ok(!themes.includes("\n    " + property), `layout property added: ${property}`);
    }
});
