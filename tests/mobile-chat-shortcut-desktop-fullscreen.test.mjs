import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("the header chat shortcut is hidden on phones and remains available on desktop", () => {
    assert.match(html, /class="worth-it-chat-nav-wrap" id="worthItChatNavWrap"/);
    const start = css.lastIndexOf("Mobile-only: remove the header 💬 shortcut on phones; desktop remains unchanged.");
    assert.ok(start >= 0, "the final mobile chat shortcut rule exists");
    const rules = css.slice(start);
    assert.match(rules, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-nav-wrap\s*\{\s*display: none !important;/);
    assert.match(rules, /\.worth-it-chat-fullscreen-btn\s*\{\s*display: none !important;/);
    assert.doesNotMatch(rules, /@media \(min-width: 761px\)[\s\S]*?\.worth-it-chat-nav-wrap\s*\{\s*display: none !important;/);
    assert.match(html, /style\.css\?v=mobile-chat-shortcut-desktop-fullscreen-20261025b/);
    assert.doesNotMatch(rules, /(?:zoom\s*:\s*0\.82|--ui-scale\s*:\s*0\.82|data-ui-scale\s*=\s*"small")/i, "mobile chat rules must not force the whole page or panel to A−");
});

test("desktop fullscreen chat fills the viewport with a smooth transition", () => {
    const start = css.lastIndexOf("Desktop fullscreen chat: expand the overlay and its in-flow window to the viewport.");
    assert.ok(start >= 0, "the final desktop fullscreen rules exist");
    const rules = css.slice(start);
    assert.match(rules, /@media \(min-width: 761px\)[\s\S]*?\.worth-it-chat-overlay:not\(\[hidden\]\)[\s\S]*?width: calc\(100vw \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height: calc\(100dvh \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(rules, /\.worth-it-chat-overlay\.is-fullscreen:not\(\[hidden\]\)[\s\S]*?align-items: stretch !important;[\s\S]*?justify-content: stretch !important;/);
    assert.match(rules, /\.worth-it-chat-overlay\.is-fullscreen:not\(\[hidden\]\) > \.worth-it-chat-window\.is-fullscreen\s*\{[\s\S]*?position: relative !important;[\s\S]*?width: 100% !important;[\s\S]*?height: 100% !important;/);
    assert.match(rules, /width 460ms cubic-bezier\(\.22, \.75, \.18, 1\)/);
    assert.match(rules, /height 460ms cubic-bezier\(\.22, \.75, \.18, 1\)/);
    assert.match(rules, /@media \(prefers-reduced-motion: reduce\)/);
});
