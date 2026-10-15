import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const routing = readFileSync(new URL("../routing.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

const sections = [
    { key: "account", path: "/settings/account", panel: "accountProfilePanel", card: "settingsAccount", fn: "openSettingsAccount" },
    { key: "security", path: "/settings/security", panel: "securitySettingsPanel", card: "settingsSecurity", fn: "openSettingsSecurity" },
    { key: "privacy", path: "/settings/privacy", panel: "privacySettingsPanel", card: "settingsPrivacy", fn: "openSettingsPrivacy" },
    { key: "notifications", path: "/settings/notifications", panel: "notificationSettingsPanel", card: "settingsNotifications", fn: "openSettingsNotifications" },
    { key: "data", path: "/settings/data", panel: "yourDataSettingsPanel", card: "settingsData", fn: "openSettingsData" },
    { key: "appearance", path: "/settings/appearance", panel: "appearanceSettingsPanel", card: "settingsAppearance", fn: "openSettingsAppearance" }
];

function elementTagWithId(source, id) {
    const tag = source.match(new RegExp('<(section|div|article)[^>]*id="' + id + '"[^>]*>', "i"));
    assert.ok(tag, "Expected element #" + id);
    return tag[0];
}

test("opening /settings defaults to the overview and hides all detail panels", () => {
    const settingsPage = elementTagWithId(html, "settingsPage");
    assert.match(settingsPage, /class="worth-it-settings-page"/i);
    assert.match(settings, /function openFullSettings\(\)\s*\{\s*renderWorthItSettingsView\(""\);\s*\}/);
    assert.match(html, /class="worth-it-settings-grid" aria-label="Settings categories"/);
    for (const section of sections) {
        assert.match(elementTagWithId(html, section.panel), /\bhidden\b/, section.panel + " must be hidden in initial markup");
    }
    assert.match(elementTagWithId(html, "settingsSectionNav"), /\bhidden\b/, "section navigation is hidden on the overview");
});

test("each Settings overview card opens a dedicated URL-backed section", () => {
    for (const section of sections) {
        const card = elementTagWithId(html, section.card);
        assert.match(card, new RegExp('data-settings-target="' + section.panel + '"'), section.card + " points to its panel");
        assert.match(settings, new RegExp('(?:^|\\n)\\s*' + section.key + ':\\s*\\{[\\s\\S]{0,240}?path: "' + section.path.replaceAll("/", "\\/") + '"'));
        assert.match(settings, new RegExp('openFunction: "' + section.fn + '"'));
        assert.match(settings, new RegExp('function ' + section.fn + '\\(\\)\\s*\\{\\s*renderWorthItSettingsView\\("' + section.key + '"\\);\\s*\\}'));
        assert.match(routing, new RegExp('"' + section.path.replaceAll("/", "\\/") + '": "' + section.fn + '"'));
    }
});

test("section routing supports direct URLs and browser back/forward navigation", () => {
    assert.match(routing, /function resolveRoute\(pathname\)/);
    assert.match(routing, /Object\.prototype\.hasOwnProperty\.call\(SECTION_PATHS, path\)/);
    assert.match(routing, /window\.addEventListener\("popstate"/);
    assert.match(settings, /function openSettingsCategory\(panelId\)/);
    assert.match(settings, /window\[config\.openFunction\]\(\)/);
    assert.match(html, /onclick="openFullSettings\(\)">← Back to Settings/);
    for (const path of ["/settings", ...sections.map(section => section.path)]) {
        assert.ok(routing.includes('"' + path + '"'), "Missing route " + path);
    }
});

test("hidden Settings views remain hidden despite author display rules", () => {
    assert.match(css, /\.worth-it-settings-page \[hidden\][^{]*\{display:none!important\}/);
    assert.match(settings, /if \(hero\) hero\.hidden = !overview/);
    assert.match(settings, /if \(grid\) grid\.hidden = !overview/);
    assert.match(settings, /if \(panel\) panel\.hidden = key !== section/);
    assert.match(settings, /if \(roadmap\) roadmap\.hidden = true/);
});

test("the new routing assets are cache-busted together", () => {
    assert.match(html, /style\.css\?v=settings-navigation-20261015a/);
    assert.match(html, /settings\.js\?v=settings-navigation-20261015a/);
    assert.match(html, /routing\.js\?v=settings-navigation-20261015a/);
});
