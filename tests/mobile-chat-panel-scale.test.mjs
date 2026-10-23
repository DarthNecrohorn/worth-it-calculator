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

test("mobile chat overlay and window compensate for the A+/A++ page zoom", () => {
    const mobileRules = css.slice(css.lastIndexOf("Mobile Community Chat: keep the same viewport footprint"));
    assert.match(mobileRules, /\.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\)\s*\{[\s\S]*?width:\s*calc\(100vw \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height:\s*calc\(100dvh \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(mobileRules, /\.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\) > \.worth-it-chat-window:not\(\.is-fullscreen\)\s*\{[\s\S]*?width:\s*calc\(100vw \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height:\s*calc\(100dvh \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?transform:\s*none !important;/);
    assert.match(html, /style\.css\?v=mobile-chat-panel-a-baseline-20261023b/);
});


test("A+ and A++ mobile chat content matches the A-size panel and viewport origin", () => {
    const marker = "A+ / A++ mobile chat panel: match A scale on phones only.";
    const start = css.lastIndexOf(marker);
    assert.ok(start >= 0, "the A-size mobile chat scale lock exists");
    const rules = css.slice(start);

    assert.match(rules, /@media \(max-width: 760px\)/);
    assert.match(rules, /html\[data-ui-scale="large"\] \.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\),[\s\S]*?html\[data-ui-scale="xl"\] \.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\)\s*\{[\s\S]*?top: 0 !important;[\s\S]*?left: 0 !important;[\s\S]*?width: 100vw !important;[\s\S]*?height: 100dvh !important;[\s\S]*?zoom: calc\(1 \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(rules, /html\[data-ui-scale="large"\][\s\S]*?\.worth-it-chat-window:not\(\.is-fullscreen\),[\s\S]*?html\[data-ui-scale="xl"\][\s\S]*?\.worth-it-chat-window:not\(\.is-fullscreen\)\s*\{[\s\S]*?width: 100% !important;[\s\S]*?height: 100% !important;/);
    assert.doesNotMatch(rules, /html\[data-ui-scale="small"\]/);
    assert.match(html, /style\.css\?v=mobile-chat-panel-a-baseline-20261023b/);
});
