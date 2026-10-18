import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const chat = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("Community Chat exposes an accessible fullscreen toggle in its header", () => {
    const header = html.match(/<header class="worth-it-chat-header">([\s\S]*?)<\/header>/);
    assert.ok(header, "Community Chat header exists");
    assert.match(header[1], /id="worthItChatFullscreenBtn"/);
    assert.match(header[1], /onclick="toggleWorthItChatFullscreen\(event\)"/);
    assert.match(header[1], /aria-label="Expand chat"/);
    assert.match(header[1], /aria-pressed="false"/);
    assert.match(html, /src="\/chat-ui\.js\?v=communityfullscreen20261018a"/);
});

test("fullscreen toggle updates the overlay, window and accessible button state together", () => {
    assert.match(chat, /function setWorthItChatFullscreen\(enabled\)/);
    assert.match(chat, /window\.toggleWorthItChatFullscreen = function \(event\)/);
    assert.match(chat, /overlay\.classList\.toggle\("is-fullscreen", isFullscreen\)/);
    assert.match(chat, /windowNode\.classList\.toggle\("is-fullscreen", isFullscreen\)/);
    assert.match(chat, /button\.setAttribute\("aria-pressed", String\(isFullscreen\)\)/);
    assert.match(chat, /setWorthItChatFullscreen\(!overlay\.classList\.contains\("is-fullscreen"\)\)/);
});

test("closing Community Chat clears fullscreen state before the next opening", () => {
    const start = chat.indexOf("function showChatOverlay(open, options)");
    const end = chat.indexOf("function setAuthState", start);
    assert.ok(start >= 0 && end > start, "showChatOverlay block exists");
    assert.match(chat.slice(start, end), /setWorthItChatFullscreen\(false\)/);
});

test("fullscreen uses the existing viewport-pinned CSS rules", () => {
    assert.match(css, /\.worth-it-chat-overlay\.is-fullscreen\s*\{/);
    assert.match(css, /\.worth-it-chat-overlay\.is-fullscreen > \.worth-it-chat-window\.is-fullscreen/);
    assert.match(css, /inset:\s*0\s*!important/);
    assert.match(css, /height:\s*100dvh\s*!important/);
});
