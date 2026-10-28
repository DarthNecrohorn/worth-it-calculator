import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const routing = readFileSync(new URL("../routing.js", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../_redirects", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

const sections = [
    { key: "account", path: "/settings/account", panel: "accountProfilePanel", card: "settingsAccount", fn: "openSettingsAccount" },
    { key: "security", path: "/settings/security", panel: "securitySettingsPanel", card: "settingsSecurity", fn: "openSettingsSecurity" },
    { key: "privacy", path: "/settings/privacy", panel: "privacySettingsPanel", card: "settingsPrivacy", fn: "openSettingsPrivacy" },
    { key: "notifications", path: "/settings/notifications", panel: "notificationSettingsPanel", card: "settingsNotifications", fn: "openSettingsNotifications" },
    { key: "data", path: "/settings/data", panel: "yourDataSettingsPanel", card: "settingsData", fn: "openSettingsData" }
];

const appearance = {
    key: "appearance",
    path: "/settings/appearance",
    panel: "appearanceSettingsPanel",
    fn: "openSettingsAppearance"
};

function elementTagWithId(source, id) {
    const tag = source.match(new RegExp('<(section|div|article)[^>]*id="' + id + '"[^>]*>', "i"));
    assert.ok(tag, "Expected element #" + id);
    return tag[0];
}

test("opening /settings shows five category cards and Appearance & Accessibility below them", () => {
    const settingsPage = elementTagWithId(html, "settingsPage");
    assert.match(settingsPage, /class="worth-it-settings-page"/i);
    assert.match(settings, /function openFullSettings\(\)\s*\{\s*renderWorthItSettingsView\(""\);\s*\}/);
    assert.match(html, /class="worth-it-settings-grid" aria-label="Settings categories"/);
    for (const section of sections) {
        assert.match(elementTagWithId(html, section.panel), /\bhidden\b/, section.panel + " must be hidden in initial markup");
        assert.ok(elementTagWithId(html, section.card), "Missing category card " + section.card);
    }
    assert.doesNotMatch(html, /id="settingsAppearance"/, "Appearance is a control panel, not a sixth overview card");
    assert.doesNotMatch(elementTagWithId(html, appearance.panel), /\bhidden\b/, "Appearance controls stay visible on the overview");
    assert.doesNotMatch(html.match(/<p class="worth-it-settings-roadmap"[^>]*>/)?.[0] || "", /\bhidden\b/, "Overview caveat text stays visible");
    assert.match(elementTagWithId(html, "settingsSectionNav"), /\bhidden\b/, "Section navigation is hidden on the overview");
});

test("each of the five overview cards opens its own URL-backed section", () => {
    for (const section of sections) {
        const card = elementTagWithId(html, section.card);
        assert.match(card, new RegExp('data-settings-target="' + section.panel + '"'), section.card + " points to its panel");
        assert.match(settings, new RegExp('(?:^|\\n)\\s*' + section.key + ':\\s*\\{[\\s\\S]{0,240}?path: "' + section.path.replaceAll("/", "\\/") + '"'));
        assert.match(settings, new RegExp('openFunction: "' + section.fn + '"'));
        assert.match(settings, new RegExp('function ' + section.fn + '\\(\\)\\s*\\{\\s*renderWorthItSettingsView\\("' + section.key + '"\\);\\s*\\}'));
        assert.match(routing, new RegExp('"' + section.path.replaceAll("/", "\\/") + '": "' + section.fn + '"'));
    }
});

test("dedicated section URLs support direct navigation and browser back/forward", () => {
    assert.match(routing, /function resolveRoute\(path\)/);
    assert.match(routing, /Object\.prototype\.hasOwnProperty\.call\(SECTION_PATHS, path\)/);
    assert.match(routing, /window\.addEventListener\("popstate"/);
    assert.match(settings, /openSettingsCategory = function\(panelId\)/);
    assert.match(settings, /window\[config\.openFunction\]\(\)/);
    assert.match(html, /onclick="openFullSettings\(\)">← Back to Settings/);
    for (const path of ["/settings", ...sections.map(section => section.path), appearance.path]) {
        assert.ok(routing.includes('"' + path + '"'), "Missing route " + path);
    }
    assert.match(routing, /"\/settings\/appearance": "openSettingsAppearance"/);
});

test("only the selected detail section appears; Appearance remains on the overview", () => {
    assert.match(css, /\.worth-it-settings-page \[hidden\][^{]*\{display:none!important\}/);
    assert.match(settings, /if \(hero\) hero\.hidden = !overview/);
    assert.match(settings, /if \(grid\) grid\.hidden = !overview/);
    assert.match(settings, /if \(panel\) panel\.hidden = section \? key !== section : key !== "appearance"/);
    assert.match(settings, /if \(roadmap\) roadmap\.hidden = !overview/);
});

test("the navigation assets are cache-busted together", () => {
    assert.match(html, /style\.css\?v=[^"']+/);
    assert.match(html, /settings\.js\?v=settings-navigation-20261015a/);
    assert.match(html, /routing\.js\?v=profile-back-route-20261028a/);
});


test("profile Back returns to the previous in-app route instead of forcing Home", () => {
    const profileStart = html.indexOf('<section id="profileSection"');
    assert.ok(profileStart >= 0, "Profile section should exist");
    const profileEnd = html.indexOf("</section>", profileStart);
    const profileMarkup = html.slice(profileStart, profileEnd);
    assert.match(profileMarkup, /onclick="backFromWorthItProfile\(\)">← Back/);
    assert.doesNotMatch(profileMarkup, /onclick="showHome\(\)">← Back/);
    assert.match(routing, /window\.backFromWorthItProfile = function \(\)/);
    assert.match(routing, /window\.history\.back\(\)/);
    assert.match(routing, /showHome\.call\(window\)/);
});

test("direct route refreshes rely on automatic SPA fallback without proxying through /index.html", () => {
    assert.doesNotMatch(redirects, /^\S+\s+\S+\s+200$/m);
    assert.doesNotMatch(redirects, /^\/chat(?:\/\*)?\s+\/index\.html\s+200$/m);
    assert.doesNotMatch(redirects, /^\/settings(?:\/\*)?\s+\/index\.html\s+200$/m);
    assert.match(routing, /"\/settings": "openFullSettings"/);
    assert.match(routing, /"\/settings\/privacy": "openSettingsPrivacy"/);
    assert.match(routing, /const initialPath = normalizePath\(window\.location\.pathname\)/);
    assert.match(routing, /applyRoute\(initialPath, \{ initial: true \}\)/);
});;
