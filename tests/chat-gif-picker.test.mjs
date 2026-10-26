import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const encodedLibrary = readFileSync(new URL("../assets/worth-it-chat-gifs/library.base64.txt", import.meta.url), "utf8").trim();
const library = Buffer.from(encodedLibrary, "base64");
const originalGifAssets = [
    { id: "laughing-smile", offset: 0, length: 684, type: "gif" },
    { id: "party-confetti", offset: 684, length: 619, type: "gif" },
    { id: "rocket-launch", offset: 1303, length: 570, type: "gif" },
    { id: "sparkle-burst", offset: 1873, length: 638, type: "sticker" },
    { id: "heart-pulse", offset: 2511, length: 643, type: "sticker" },
    { id: "cat-blink", offset: 3154, length: 619, type: "sticker" }
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
    assert.match(client, /function insertWorthItChatEmoji\(/);
    assert.match(client, /function renderWorthItChatEmojiCategories\(/);
    assert.match(client, /function loadWorthItChatGifResults\(/);
    assert.match(client, /function selectWorthItChatGif\(/);
    assert.match(html, /chat-ui\.js\?v=worthit-owned-media-video-20261026b/);
    assert.match(html, /style\.css\?v=worthit-owned-picker-markets-cars-20261026b/);
});

test("the emoji picker has categories and a large locally searchable emoji library", () => {
    for (const category of ["faces", "people", "animals", "food", "activities", "travel", "objects", "symbols", "flags"]) {
        assert.match(client, new RegExp('addWorthItChatEmojiGroup\\("' + category + '"'));
    }
    assert.match(html, /placeholder="Search emoji…"/);
    assert.match(client, /WORTH_IT_CHAT_EMOJI_KEYWORDS/);
    assert.match(client, /worthItChatEmojiCategory/);
    assert.match(css, /\.worth-it-chat-emoji-grid[\s\S]*?overflow-y: auto/);
    assert.match(css, /\.worth-it-chat-emoji-categories[\s\S]*?overflow-x: auto/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-picker-panel:not\(\[hidden\]\)[\s\S]*?position: fixed !important/);
});

test("GIFs and stickers come only from the local Worth It catalogue", () => {
    const pickerSource = html + "\n" + client;
    assert.doesNotMatch(pickerSource, /GIPHY|giphy\.com|GIPHY_API_KEY|api\/chat-gif-config|api\/chat-gif-download/i);
    assert.match(client, /const WORTH_IT_CHAT_GIF_LIBRARY = \[/);
    assert.match(client, /library\.base64\.txt/);
    assert.match(client, /function isWorthItChatLocalGifItem\(/);
    assert.match(client, /worthItChatGifCategory/);
    assert.match(html, /Original Worth It animations\. No external GIF provider or API key required\./);
    assert.doesNotMatch(html, /Powered by/i);
    assert.equal(encodedLibrary.length % 4, 0, "base64 media bundle length must be valid");
    assert.equal(library.length, 3773, "the original media bundle must have the expected size");
});

test("each curated original animation has a valid GIF signature and stays within the chat limit", () => {
    for (const asset of originalGifAssets) {
        const bytes = library.subarray(asset.offset, asset.offset + asset.length);
        assert.equal(bytes.length, asset.length, asset.id + " has an invalid offset or length");
        assert.ok(bytes.length > 100, asset.id + " looks unexpectedly small");
        assert.ok(bytes.length <= 20 * 1024 * 1024, asset.id + " exceeds the chat GIF limit");
        const signature = bytes.subarray(0, 6).toString("ascii");
        assert.ok(signature === "GIF87a" || signature === "GIF89a", asset.id + " is not a valid GIF");
        assert.match(client, new RegExp('id: "' + asset.id + '"'));
        assert.match(client, new RegExp('offset: ' + asset.offset + ', length: ' + asset.length));
    }
    assert.equal(originalGifAssets.length, 6);
});

test("picker controls use Worth It styling and remain scrollable on mobile", () => {
    assert.match(css, /WORTH IT OWNED CHAT MEDIA PICKER/);
    assert.match(css, /\.worth-it-chat-picker-close[\s\S]*?linear-gradient/);
    assert.match(css, /\.worth-it-chat-gif-search button[\s\S]*?linear-gradient/);
    assert.match(css, /\.worth-it-chat-emoji-grid[\s\S]*?grid-template-columns: repeat\(8, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.worth-it-chat-picker-panel:not\(\[hidden\]\)[\s\S]*?max-height: min\(calc\(62dvh/);
});


test("composer controls are implemented and picker panels have desktop layout", () => {
    assert.match(client, /function closeWorthItChatPickers\(\)/);
    assert.match(client, /function openWorthItChatPlusMenu\(\)/);

    const dock = css.match(/\.worth-it-chat-picker-dock\s*\{([\s\S]*?)\}/)?.[1] || "";
    assert.match(dock, /position:\s*relative/);

    const desktopPanel = css.match(/\.worth-it-chat-picker-panel:not\(\[hidden\]\)\s*\{([\s\S]*?)\}/)?.[1] || "";
    assert.match(desktopPanel, /position:\s*absolute/);
    assert.match(desktopPanel, /display:\s*flex/);
    assert.match(desktopPanel, /max-height:/);
    assert.ok(css.includes("min-height: min(280px, calc(100vh - 32px)) !important;"));
    assert.ok(css.includes("min-height: min(calc(315px / var(--ui-scale, 1)), calc(62dvh / var(--ui-scale, 1))) !important;"));

    const emojiGrid = css.match(/\.worth-it-chat-emoji-grid\s*\{([\s\S]*?)\}/)?.[1] || "";
    assert.match(emojiGrid, /display:\s*grid/);
    assert.match(emojiGrid, /grid-template-columns:/);

    const gifGrid = css.match(/\.worth-it-chat-gif-grid\s*\{([\s\S]*?)\}/)?.[1] || "";
    assert.match(gifGrid, /display:\s*grid/);
    assert.match(gifGrid, /grid-template-columns:/);
});

test("opening the emoji picker renders category controls, and selecting a category renders once", () => {
    const openHandler = client.match(/function openWorthItChatEmojiPicker\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(openHandler, /renderWorthItChatEmojiCategories\(\)/);
    assert.match(openHandler, /renderWorthItChatEmojiGrid\(/);

    const categoryHandler = client.match(/worthItChatEmojiCategory = category\.id;([\s\S]{0,180})/)?.[1] || "";
    assert.equal((categoryHandler.match(/renderWorthItChatEmojiCategories\(\)/g) || []).length, 1,
        "changing category should rebuild the category controls exactly once");
});
