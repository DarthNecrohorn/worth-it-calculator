import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const assetsDir = fileURLToPath(new URL("../assets/worth-it-chat-gifs/", import.meta.url));
const originalGifFiles = [
    "laughing-smile.gif",
    "party-confetti.gif",
    "rocket-launch.gif",
    "sparkle-burst.gif",
    "heart-pulse.gif",
    "cat-blink.gif",
    "thumbs-up.gif",
    "rainbow-wow.gif",
    "fire-vibes.gif",
    "celebrate-heart.gif"
];

test("the chat composer has an accessible attachment, emoji and owned-media picker", () => {
    assert.match(html, /id="worthItChatPlusBtn"/);
    assert.match(html, /id="worthItChatUploadAction"/);
    assert.match(html, /id="worthItChatEmojiAction"/);
    assert.match(html, /id="worthItChatGifAction"/);
    assert.match(html, /id="worthItChatEmojiGrid"/);
    assert.match(html, /id="worthItChatEmojiCategories"[^>]+role="tablist"/);
    assert.match(html, /id="worthItChatGifCategoryTabs"[^>]+role="tablist"/);
    assert.match(html, /Worth It GIFs &amp; Stickers/);
    assert.match(html, /chat-ui\.js\?v=worthit-owned-picker-20261026a/);
    assert.match(html, /style\.css\?v=worthit-owned-picker-20261026a/);
    assert.match(client, /function insertWorthItChatEmoji\(/);
    assert.match(client, /function renderWorthItChatEmojiCategories\(/);
    assert.match(client, /function loadWorthItChatGifResults\(/);
    assert.match(client, /function selectWorthItChatGif\(/);
});

test("the emoji picker has multiple categories and a large, locally searchable emoji library", () => {
    for (const category of ["faces", "people", "animals", "food", "activities", "travel", "objects", "symbols", "flags"]) {
        assert.match(client, new RegExp('addWorthItChatEmojiGroup\\("' + category + '"'));
    }
    assert.match(client, /Search emoji/);
    assert.match(client, /WORTH_IT_CHAT_EMOJI_KEYWORDS/);
    assert.match(client, /worthItChatEmojiCategory/);
    assert.match(css, /\.worth-it-chat-emoji-grid[\s\S]*?overflow-y: auto/);
    assert.match(css, /\.worth-it-chat-emoji-categories[\s\S]*?overflow-x: auto/);
});

test("GIFs and stickers come only from the local Worth It catalogue", () => {
    const pickerSource = html + "\n" + client;
    assert.doesNotMatch(pickerSource, /GIPHY|giphy\.com|GIPHY_API_KEY|api\/chat-gif-config|api\/chat-gif-download/i);
    assert.match(client, /const WORTH_IT_CHAT_GIF_LIBRARY = \[/);
    assert.match(client, /\/assets\/worth-it-chat-gifs\//);
    assert.match(client, /function isWorthItChatLocalGifUrl\(/);
    assert.match(client, /worthItChatGifCategory/);
    assert.match(html, /Original Worth It animations\. No external GIF provider or API key required\./);
    assert.doesNotMatch(html, /Powered by/i);
});

test("all curated original animations are valid, small GIF files", () => {
    const present = new Set(readdirSync(assetsDir));
    for (const filename of originalGifFiles) {
        assert.ok(present.has(filename), "missing bundled animation: " + filename);
        const path = join(assetsDir, filename);
        const bytes = readFileSync(path);
        assert.ok(bytes.length > 500, filename + " looks unexpectedly small");
        assert.ok(bytes.length <= 20 * 1024 * 1024, filename + " exceeds the chat GIF limit");
        assert.ok(
            bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
            bytes.subarray(0, 6).toString("ascii") === "GIF89a",
            filename + " does not have a valid GIF signature"
        );
        assert.ok(statSync(path).isFile(), filename + " is not a file");
    }
});

test("the picker panel stays fully scrollable and uses Worth It styling on mobile", () => {
    assert.match(css, /WORTH IT OWNED CHAT MEDIA PICKER/);
    assert.match(css, /\.worth-it-chat-picker-close[\s\S]*?linear-gradient/);
    assert.match(css, /\.worth-it-chat-gif-search button[\s\S]*?linear-gradient/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-picker-panel:not\(\[hidden\]\)[\s\S]*?position: fixed !important/);
    assert.match(css, /\.worth-it-chat-emoji-grid[\s\S]*?grid-template-columns: repeat\(8, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.worth-it-chat-picker-panel:not\(\[hidden\]\)[\s\S]*?max-height: min\(calc\(62dvh/);
});
