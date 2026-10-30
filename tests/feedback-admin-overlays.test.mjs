import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../feedback-admin-overlays.css", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const admin = readFileSync(new URL("../admin-panel.js", import.meta.url), "utf8");
const baseCss = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("feedback/admin overlay styles load after the existing section theme layer", () => {
    const sectionThemes = html.indexOf('href="section-themes.css?v=section-themes-20261030a"');
    const overlayStyles = html.indexOf('href="feedback-admin-overlays.css?v=feedback-admin-overlays-20261030a"');
    assert.ok(sectionThemes >= 0 && overlayStyles > sectionThemes);
    assert.match(html, /settings\.js\?v=feedback-overlay-stay-open-20261030a/);
    assert.match(html, /admin-panel\.js\?v=admin-overlays-stay-open-20261030a/);
});

test("Bugs & Suggestions and Admin Panel overlays cover the global header with blur", () => {
    for (const selector of [".feedback-overlay,", ".admin-panel-overlay {"]) {
        assert.ok(css.includes(selector), `missing overlay selector ${selector}`);
    }
    assert.match(css, /\.feedback-overlay,[\s\S]*?\.admin-panel-overlay\s*\{[\s\S]*?z-index:\s*65000 !important/);
    assert.match(css, /backdrop-filter:\s*blur\(16px\) saturate\(118%\) !important/);
    assert.match(baseCss, /\.nav\s*\{\s*z-index:\s*50000 !important;/);
    assert.match(css, /z-index:\s*65000 !important/);
});

test("clicking outside Bugs & Suggestions no longer closes it; explicit close actions remain", () => {
    assert.doesNotMatch(settings, /feedbackOverlay[^;]{0,100}addEventListener\(["']click["'][\s\S]{0,180}closeFeedback\(/);
    assert.match(settings, /window\.closeFeedback\s*=\s*function\(\)\s*\{[^}]*classList\.remove\(["']open["']\)/);
    assert.match(settings, /if\(e\.key === ["']Escape["']\)\s*\{\s*closeFeedback\(\);/);
    assert.match(html, /class="feedback-close" onclick="closeFeedback\(\)"/);
    assert.match(html, /onclick="closeFeedback\(\)">Cancel<\/button>/);
});

test("clicking outside Admin Panel no longer closes it; X and Escape remain", () => {
    assert.doesNotMatch(admin, /adminPanelOverlay[^;]{0,100}addEventListener\(["']click["'][\s\S]{0,180}closeAdminPanel\(/);
    assert.match(admin, /function closeAdminPanel\(\)\s*\{\s*\$\('adminPanelOverlay'\)\?\.classList\.remove\('open'\);/);
    assert.match(admin, /if\(event\.key === 'Escape' && \$\('adminPanelOverlay'\)\?\.classList\.contains\('open'\)\) closeAdminPanel\(\)/);
    assert.match(html, /class="admin-panel-close"[\s\S]*?onclick="closeAdminPanel\(\)"/);
});

test("Admin Panel destinations and their existing section loading remain intact", () => {
    for (const section of ["feedback", "usage", "platform-usage"]) {
        assert.ok(admin.includes(`data-admin-section=${section}`) || admin.includes(`data-admin-section=\\'${section}\\'`), `missing Admin Panel destination: ${section}`);
    }
    assert.match(admin, /async function showAdminSection\(section\)/);
    assert.match(admin, /await loadFeedback\(\)/);
    assert.match(admin, /await loadUsage\(\)/);
    assert.match(admin, /await loadPlatformUsage\(\)/);
    for (const selector of [
        ".admin-panel-section-button:hover",
        ".admin-panel-section-button[data-admin-section=\"feedback\"] .admin-panel-section-icon",
        ".admin-panel-section-button[data-admin-section=\"usage\"] .admin-panel-section-icon",
        ".admin-panel-section-button[data-admin-section=\"platform-usage\"] .admin-panel-section-icon",
        ".admin-feedback-modern-item",
        ".admin-usage-card",
        ".admin-usage-summary-card"
    ]) {
        assert.ok(css.includes(selector), `missing modern Admin Panel styling: ${selector}`);
    }
});

test("both overlays retain distinct dark and light surfaces", () => {
    assert.match(css, /\.feedback-modal-card\s*\{[\s\S]*?linear-gradient/);
    assert.match(css, /\.admin-panel-card\s*\{[\s\S]*?linear-gradient/);
    assert.match(css, /html\[data-theme="light"\] \.feedback-modal-card/);
    assert.match(css, /html\[data-theme="light"\] \.admin-panel-card/);
});
