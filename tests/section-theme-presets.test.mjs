import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const themes = readFileSync(new URL("../section-themes.css", import.meta.url), "utf8");
const shop = readFileSync(new URL("../shop.js", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const community = readFileSync(new URL("../community-features.js", import.meta.url), "utf8");
const customThemeCss = readFileSync(new URL("../community-features.css", import.meta.url), "utf8");
const siteThemeCss = readFileSync(new URL("../site-theme-system.css", import.meta.url), "utf8");

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

test("custom palette button text uses contrast calculated for its actual surface", () => {
    assert.match(community, /const pageText=accessibleThemeText\(theme\.text,\[theme\.background\]\)/);
    assert.match(community, /--worth-it-primary-readable",accessibleThemeText\(theme\.text,\[activeControlSurface\]\)/);
    assert.match(community, /--worth-it-secondary-readable",accessibleThemeText\(theme\.text,\[secondaryControlSurface\]\)/);
    assert.match(community, /const gradientText=gradientForeground\(theme\.primary,theme\.secondary\)/);
    assert.match(community, /--worth-it-gradient-foreground",gradientText/);
    assert.match(community, /accessibleButtonBackground\(theme\.primary,gradientText\)/);
    assert.match(customThemeCss, /data-worth-it-button-style="outline"[\s\S]*?color:var\(--worth-it-primary-readable\)!important/);
    for (const selector of [".btn-primary",".auth-modal-submit",".shop-buy-button",".shop-deal-button",".worth-it-report-submit",".worth-it-display-name-save"]) {
        assert.ok(customThemeCss.includes(selector), "missing palette-aware CTA foreground: " + selector);
    }
});

test("the saved Custom Theme reaches AI Chat, the Web Shop, every section and profile banners", () => {
    assert.match(community, /const theme=selectedTheme/);
    assert.match(community, /root\.classList\.remove\("worth-it-profile-theme-isolated"\)/);
    assert.match(community, /worthit-theme-change/);
    for (const selector of [
        ".ai-chat-nav-btn",
        ".ai-chat-send",
        ".worth-it-chat-window",
        ".worth-it-chat-messages",
        "#webShopSection",
        ".web-shop-back",
        ".worth-it-profile-section.has-banner",
        ".worth-it-profile-cover.has-banner"
    ]) {
        assert.ok(siteThemeCss.includes(selector), "missing full-site theme target: " + selector);
    }
    assert.match(siteThemeCss, /data-worth-it-button-style="solid"/);
    assert.match(siteThemeCss, /data-worth-it-button-style="outline"/);
    assert.match(siteThemeCss, /data-worth-it-button-style="gradient"/);
    const leaflet = html.indexOf('href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"');
    const finalTheme = html.indexOf('href="site-theme-system.css?v=');
    assert.ok(leaflet >= 0 && finalTheme > leaflet, "the final theme layer loads after all section styles");
});

test("all preset solid and gradient button backgrounds have a contrast-safe foreground fallback", () => {
    assert.match(community, /function accessibleButtonBackground\(background,foreground\)/);
    assert.match(community, /contrastRatio\(foreground,original\)>=4\.5/);
    assert.match(community, /--worth-it-button-primary-background/);
    assert.match(siteThemeCss, /--worth-it-button-primary-background/);
    assert.match(siteThemeCss, /var\(--worth-it-button-primary-background\) !important/);
});
test("hamburger drawer items use the drawer surface contrast rather than header foreground", () => {
    assert.match(siteThemeCss, /#navLinks\.nav-links\s*\{[\s\S]*?color: var\(--text\)[\s\S]*?background: var\(--card-solid\)/);
    assert.match(siteThemeCss, /#navLinks\.nav-links button\s*\{[\s\S]*?color: var\(--text\)/);
    assert.match(siteThemeCss, /\.nav \.logo\s*\{[\s\S]*?color: var\(--worth-it-header-foreground\)/);
});


test("Custom Theme styles sign-out, search, Admin Panel and other modal backdrops and surfaces", () => {
    for (const selector of [
        ".worth-it-signout-confirm-dialog",
        ".worth-it-signout-confirm-card",
        ".worth-it-user-search-overlay",
        ".worth-it-user-search-card",
        ".admin-panel-overlay",
        ".admin-panel-card",
        ".admin-panel-section-button",
        ".admin-panel-inline-button",
        ".worth-it-report-overlay",
        ".worth-it-chat-manage-dialog"
    ]) {
        assert.ok(siteThemeCss.includes(selector), "missing theme coverage for " + selector);
    }
    assert.match(siteThemeCss, /worth-it-signout-confirm-yes[\s\S]*?var\(--worth-it-gradient-foreground\)/);
    assert.match(siteThemeCss, /worth-it-signout-confirm-kicker[\s\S]*?var\(--worth-it-theme-surface-link/);
    assert.match(siteThemeCss, /worth-it-user-search-card[\s\S]*?var\(--worth-it-theme-surface-text/);
    assert.match(siteThemeCss, /admin-panel-card[\s\S]*?var\(--worth-it-theme-surface-text/);
    assert.match(siteThemeCss, /admin-panel-section-button[\s\S]*?var\(--worth-it-primary-readable/);
});

test("Custom Theme calculates surface-specific heading and link contrast for modal surfaces", () => {
    assert.match(community, /const surfaceLink=accessibleThemeText\(theme\.link,\[theme\.surface\]\)/);
    assert.match(community, /--worth-it-theme-surface-link",surfaceLink/);
    assert.match(siteThemeCss, /var\(--worth-it-theme-surface-link,var\(--worth-it-theme-surface-text/);
});

test("Custom Theme calculates separate heading contrast for modal surfaces", () => {
    assert.match(community, /const surfaceHeading=accessibleThemeText\(theme\.heading,\[theme\.surface\]\)/);
    assert.match(community, /--worth-it-theme-surface-heading",surfaceHeading/);
    assert.match(siteThemeCss, /var\(--worth-it-theme-surface-heading,var\(--worth-it-theme-surface-text/);
});

test("Custom Theme hydration preserves the bootstrap account appearance during temporary session or wallet failures", () => {
    assert.match(html, /root\.dataset\.worthItBootUserId = sessionUserId/);
    assert.match(community, /function readCachedCustomTheme\(userId\)/);
    assert.match(community, /const bootstrapUserId=String\(document\.documentElement\?\.dataset\?\.worthItBootUserId\|\|previousThemeUserId\|\|""\)/);
    assert.match(community, /Your current account theme is being kept locally/);
    assert.match(community, /const previousThemeUserId=themeUserId/);
    assert.match(community, /previouslyAppliedTheme=previousThemeUserId===userId\?activeTheme:null/);
    assert.match(community, /function readValidThemeBootSnapshot\(userId\)/);
    assert.match(community, /const validBootSnapshot=readValidThemeBootSnapshot\(userId\)/);
    assert.match(community, /const cachedTheme=validBootSnapshot\?readCachedCustomTheme\(userId\):null/);
    assert.match(community, /validBootSnapshot&&previouslyAppliedTheme&&isCustomTheme\(previouslyAppliedTheme\)/);
    assert.match(community, /applyTheme\(livePreview\|\|retainedTheme\)/);
    assert.match(community, /your current account theme is being kept/);
    assert.match(community, /bootstrapTheme\|\|DEFAULT_THEME/);
    assert.match(community, /if\(initialThemeHydrationPending\|\|document\.hidden\)return;/);
});


test("each of the 30 Custom Theme palettes supplies its own full-site typography combination", () => {
    const presetIds = [
        "midnight","minimal","emerald","sunset","ocean","rose","graphite","lavender-mist",
        "terracotta","matcha","champagne","berry","arctic","retro","royal","mocha","sakura",
        "neon-pulse","cobalt-night","copper-dusk","glacier-blue","citrus-grove","plum-noir",
        "coral-reef","sand-dune","cyberpunk","alpine-meadow","ruby-velvet","indigo-ink","pastel-pop"
    ];
    assert.match(community, /const PRESET_TYPOGRAPHY = Object\.freeze\(/);
    for (const id of presetIds) {
        const key = id.includes("-") ? '"' + id + '":{fontFamily:' : id + ':{fontFamily:';
        assert.ok(community.includes(key), "missing preset typography: " + id);
    }
    assert.match(community, /bodyTextStyle:"neutral"/);
    assert.match(community, /"worthItThemeBodyTextStyle","bodyTextStyle"/);
    assert.match(html, /id="worthItThemeBodyTextStyle"/);
    assert.match(html, /option value="humanist"/);
    assert.match(html, /option value="technical"/);
    assert.match(html, /option value="elegant"/);
    assert.match(community, /humanist:\{family:/);
    assert.match(community, /elegant:\{family:/);
    assert.match(siteThemeCss, /--worth-it-theme-body-font-family/);
    assert.match(siteThemeCss, /--worth-it-theme-body-text-letter-spacing/);
});

test("homepage hero badge follows live and saved Custom Theme text, accent and typography tokens", () => {
    assert.match(html, /<div class="badge">✦ Smart decisions made simple/);
    assert.match(html, /id="zvhDiscoveryEgg"[^>]*>🧟<\/button>/);
    assert.match(siteThemeCss, /html\[data-worth-it-custom-theme\] #homePage \.hero \.badge/);
    assert.match(siteThemeCss, /color: var\(--worth-it-theme-page-text/);
    assert.match(siteThemeCss, /background: color-mix\(in srgb, var\(--bg\) 92%, var\(--primary\)\)/);
    assert.match(siteThemeCss, /font-family: var\(--worth-it-theme-body-font-family/);
});
