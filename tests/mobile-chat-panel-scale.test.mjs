import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("chat expand control is hidden on phones but remains available at desktop widths", () => {
    const mobileRules = css.slice(css.lastIndexOf("COMMUNITY CHAT — LOCK PHONE UI TO THE A− REFERENCE SIZE"));
    assert.match(mobileRules, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-fullscreen-btn\s*\{\s*display: none !important;/);
    assert.match(html, /class="worth-it-chat-icon-btn worth-it-chat-fullscreen-btn"/);
    assert.match(css, /\.worth-it-chat-fullscreen-btn/);
});

test("mobile chat overlay and window render at the A− reference size for every UI scale", () => {
    const mobileRules = css.slice(css.lastIndexOf("COMMUNITY CHAT — LOCK PHONE UI TO THE A− REFERENCE SIZE"));
    assert.match(mobileRules, /html\[data-ui-scale\] \.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\)\s*\{[\s\S]*?width:\s*calc\(100vw \/ 0\.82\) !important;[\s\S]*?height:\s*calc\(100dvh \/ 0\.82\) !important;[\s\S]*?zoom:\s*calc\(0\.82 \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(mobileRules, /html\[data-ui-scale\] \.worth-it-chat-overlay:not\(\.is-fullscreen\):not\(\[hidden\]\) > \.worth-it-chat-window:not\(\.is-fullscreen\)\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?height:\s*100% !important;[\s\S]*?transform:\s*none !important;/);
    assert.match(html, /style\.css\?v=chat-a-minus-phone-desktop-fullscreen-20261023b/);
});
