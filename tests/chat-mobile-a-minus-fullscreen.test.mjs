import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("the phone chat is fixed to the A− reference scale for every accessibility setting", () => {
    const start = css.lastIndexOf("COMMUNITY CHAT — LOCK PHONE UI TO THE A− REFERENCE SIZE");
    assert.ok(start >= 0, "the phone-only A− lock rules exist");
    const rules = css.slice(start);
    assert.match(rules, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\)[\s\S]*?width: calc\(100vw \/ 0\.82\) !important;[\s\S]*?height: calc\(100dvh \/ 0\.82\) !important;[\s\S]*?zoom: calc\(0\.82 \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(rules, /\.worth-it-chat-window:not\(\.is-mobile-sidebar\) \.worth-it-chat-main\s*\{[\s\S]*?height: calc\(100dvh \/ 0\.82\) !important;/);
    assert.match(rules, /\.worth-it-chat-fullscreen-btn\s*\{\s*display: none !important;/);
    assert.match(html, /style\.css\?v=chat-a-minus-phone-desktop-fullscreen-20261023b/);
});

test("desktop fullscreen chat expands to fill the viewport and animates smoothly", () => {
    const start = css.lastIndexOf("DESKTOP CHAT FULLSCREEN — TRUE VIEWPORT EXPANSION");
    assert.ok(start >= 0, "the final desktop fullscreen rules exist");
    const rules = css.slice(start);
    assert.match(rules, /@media \(min-width: 761px\)[\s\S]*?\.worth-it-chat-overlay:not\(\[hidden\]\)[\s\S]*?width: calc\(100vw \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height: calc\(100dvh \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(rules, /\.worth-it-chat-overlay\.is-fullscreen:not\(\[hidden\]\)[\s\S]*?padding: 0 !important;[\s\S]*?align-items: stretch !important;[\s\S]*?justify-content: stretch !important;/);
    assert.match(rules, /\.worth-it-chat-overlay\.is-fullscreen:not\(\[hidden\]\) > \.worth-it-chat-window\.is-fullscreen\s*\{[\s\S]*?width: 100% !important;[\s\S]*?height: 100% !important;[\s\S]*?flex: 1 1 auto !important;[\s\S]*?position: relative !important;/);
    assert.match(rules, /width 460ms cubic-bezier\(\.22, \.75, \.18, 1\)/);
    assert.match(rules, /height 460ms cubic-bezier\(\.22, \.75, \.18, 1\)/);
});

test("the fullscreen button remains absent from phone UI markup styling", () => {
    const phoneRule = css.lastIndexOf("⛶ is a desktop-only affordance");
    assert.ok(phoneRule >= 0);
    assert.match(css.slice(phoneRule), /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-fullscreen-btn\s*\{\s*display: none !important;/);
    assert.match(html, /class="worth-it-chat-icon-btn worth-it-chat-fullscreen-btn"[^>]*>⛶</);
});
