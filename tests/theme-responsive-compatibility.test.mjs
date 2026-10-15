import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");

test("dark/light theme and all four UI sizes initialize before content is painted", () => {
    assert.match(html, /root\.dataset\.theme = localStorage\.getItem\("worthItTheme"\) === "light" \? "light" : "dark"/);
    assert.match(html, /const SCALE = \{small:\.82, normal:1, large:1\.16, xl:1\.32\}/);
    for (const [label, value] of [["A−", "small"], ["A", "normal"], ["A+", "large"], ["A++", "xl"]]) {
        assert.ok(html.includes(`setUIScale('${value}')`), `${label} setting is available`);
    }
    assert.match(settings, /document\.documentElement\.dataset\.theme = value/);
    assert.match(settings, /document\.documentElement\.dataset\.uiScale =\s*value/);
});

test("both themes receive native control palettes and readable semantic status colors", () => {
    assert.match(css, /html\[data-theme="dark"\]\s*\{\s*color-scheme:\s*dark;/);
    assert.match(css, /html\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;/);
    assert.match(css, /html\[data-theme="light"\]\s+select option\s*\{[^}]*color:\s*#0f172a;[^}]*background:\s*#fff;/);
    assert.match(css, /html\[data-theme="light"\] \.account-settings-status\.is-error\s*,[\s\S]*?color:\s*#b91c1c;/);
    assert.ok(css.includes('html[data-theme="light"] .worth-it-chat-compose-status.is-error'));
});

test("responsive guard lets grid/flex content and long labels shrink or wrap", () => {
    const start = css.indexOf("/* SITE-WIDE THEME + RESPONSIVE COMPATIBILITY GUARDS */");
    assert.ok(start >= 0, "site-wide compatibility guard exists");
    const guard = css.slice(start);
    assert.match(guard, /min-width:\s*0/);
    assert.match(guard, /overflow-wrap:\s*anywhere/);
    assert.match(guard, /img:not\(\.leaflet-tile\)/);
    assert.match(guard, /#navLinks\.nav-links\.open button\s*\{[^}]*white-space:\s*normal/);
    assert.match(guard, /\.table-responsive[\s\S]*?overflow-x:\s*auto/);
});

test("A+ and A++ modal and chat dimensions compensate for global UI zoom", () => {
    const start = css.indexOf("/* SITE-WIDE THEME + RESPONSIVE COMPATIBILITY GUARDS */");
    const guard = css.slice(start);
    assert.match(guard, /html\[data-ui-scale="large"\][\s\S]*?max-width:\s*calc\(\(100vw - 24px\) \/ var\(--ui-scale, 1\)\)/);
    assert.match(guard, /height:\s*calc\(100dvh \/ var\(--ui-scale, 1\)\)\s*!important/);
    assert.ok(guard.includes('.worth-it-chat-window:not(.is-fullscreen)'));
    assert.ok(guard.includes('.worth-it-chat-overlay.is-fullscreen'));
});

test("the stylesheet URL is versioned so responsive and theme safeguards are not hidden by browser cache", () => {
    assert.match(html, /style\.css\?v=themeresponsive-20261015a/);
});
