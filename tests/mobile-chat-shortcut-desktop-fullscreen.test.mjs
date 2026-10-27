import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("the header chat shortcut remains available on phones and desktop", () => {
    assert.match(html, /class="worth-it-chat-nav-wrap" id="worthItChatNavWrap"/);
    assert.doesNotMatch(css, /Mobile-only: remove the header 💬 shortcut on phones/);
    const mobileRules = css.split("@media (max-width: 760px)").slice(1);
    assert.ok(mobileRules.length > 0, "mobile responsive rules exist");
    for (const rules of mobileRules) {
        assert.doesNotMatch(rules, /\.worth-it-chat-nav-wrap\s*\{\s*display:\s*none\s*!important;/);
    }
    assert.match(html, /style\.css\?v=country-flags-chat-messages-20261027a/);
    const pickerCss = css.slice(css.lastIndexOf("WORTH IT OWNED CHAT MEDIA PICKER"));
    assert.ok(pickerCss.length > 0, "the final Worth It picker rules exist");
    assert.doesNotMatch(pickerCss, /(?:zoom\s*:\s*0\.82|--ui-scale\s*:\s*0\.82|data-ui-scale\s*=\s*"small")/i, "the picker must not force a legacy fixed zoom factor");
});

test("the page has no obsolete accessibility-scale chooser controls", () => {
    const visibleMarkup = html.replace(/<!--[\s\S]*?-->/g, "");
    assert.doesNotMatch(visibleMarkup, /<(?:button|option)\b[^>]*>\s*A(?:−|-|\+|\+\+)\s*<\/(?:button|option)>/i);
    assert.doesNotMatch(visibleMarkup, /(?:id|class)=["'][^"']*(?:ui-scale-control|accessibility-scale-picker|font-size-picker)[^"']*["']/i);
    assert.doesNotMatch(visibleMarkup, /(?:Choose|Select|Change)\s+(?:the\s+)?(?:display|accessibility|text)\s+size/i);
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
