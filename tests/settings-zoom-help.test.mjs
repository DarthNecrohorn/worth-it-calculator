import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("old UI scale preference is cleared and the site starts at standard A size", () => {
    assert.match(html, /localStorage\.removeItem\("worthItUIScale"\)/);
    assert.match(html, /dataset\.uiScale = "normal"/);
    assert.match(html, /setProperty\("--ui-scale", "1"\)/);
    assert.match(settings, /function setUIScale\(\)\s*\{[\s\S]*?setProperty\("--ui-scale", "1"\)/);
    assert.doesNotMatch(html, /id="size(?:Small|Normal|Large|XL)Btn"/);
    assert.doesNotMatch(html, /id="settingsPageSize(?:Small|Normal|Large|XL)Btn"/);
    assert.doesNotMatch(settings, /sizeSmallBtn|settingsPageSizeSmallBtn/);
    assert.match(css, /zoom:\s*var\(--ui-scale,1\)/);
    assert.doesNotMatch(css, /COMMUNITY CHAT — LOCK PHONE PANEL TO THE A− SCALE/);
});

test("compact and full Settings explain mouse, keyboard-only, and phone zoom", () => {
    assert.equal((html.match(/How to zoom in/g) || []).length, 2);
    assert.equal((html.match(/Computer with a mouse/g) || []).length, 2);
    assert.equal((html.match(/Keyboard only \(no mouse\)/g) || []).length, 2);
    assert.equal((html.match(/Phone or tablet/g) || []).length, 2);
    assert.equal((html.match(/pinch apart to zoom in/g) || []).length, 2);
    assert.match(html, /Ctrl<\/kbd>\s*\+\s*<kbd>0<\/kbd> to reset zoom/);
    assert.match(html, /style\.css\?v=browser-zoom-help-20261025a/);
});
