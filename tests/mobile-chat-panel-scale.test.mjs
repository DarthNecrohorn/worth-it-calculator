import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("chat expand control is hidden on phones but remains available at desktop widths", () => {
    const mobileRules = css.slice(css.lastIndexOf("Mobile Community Chat: keep the same viewport footprint"));
    assert.match(mobileRules, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-fullscreen-btn\s*\{\s*display:\s*none !important;/);
    assert.match(html, /class="worth-it-chat-icon-btn worth-it-chat-fullscreen-btn"/);
    assert.match(css, /\.worth-it-chat-fullscreen-btn/);
});

test("mobile chat overlay and window use the standard page zoom", () => {
    const mobileRules = css.slice(css.lastIndexOf("Mobile Community Chat: keep the same viewport footprint"));
    assert.match(mobileRules, /\.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\)\s*\{[\s\S]*?width:\s*calc\(100vw \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height:\s*calc\(100dvh \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(mobileRules, /\.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\) > \.worth-it-chat-window:not\(\.is-fullscreen\)\s*\{[\s\S]*?width:\s*calc\(100vw \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height:\s*calc\(100dvh \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?transform:\s*none !important;/);
    assert.match(html, /style\.css\?v=[^"']+/);
});


