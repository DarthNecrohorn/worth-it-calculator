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
    assert.match(client, /function appendWorthItChatTextWithFlags\(/);
    assert.match(client, /worth-it-chat-message-flag/);
    assert.match(client, /flagcdn\.com/);
    assert.match(client, /function renderWorthItChatEmojiCategories\(/);
    assert.match(client, /function loadWorthItChatGifResults\(/);
    assert.match(client, /function selectWorthItChatGif\(/);
    assert.match(html, /chat-ui\.js\?v=chat-realtime-typing-delete-fix-20261028a/);
    assert.match(html, /style\.css\?v=chat-polling-preserve-dom-20261028a/);
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

test("desktop picker panels sit outside the narrow attachment dock and have usable width", () => {
    const dock = html.indexOf('id="worthItChatPickerDock"');
    const textarea = html.indexOf('id="worthItChatInput"');
    const send = html.indexOf('id="worthItChatSendBtn"');
    const emoji = html.indexOf('id="worthItChatEmojiPicker"');
    const gif = html.indexOf('id="worthItChatGifPicker"');
    assert.ok(dock >= 0 && textarea > dock && send > textarea && emoji > send && gif > emoji);
    assert.ok(!html.slice(dock, textarea).includes('id="worthItChatEmojiPicker"'),
        "picker panels must not be children of the 42px attachment dock");
    assert.ok(html.slice(send, emoji).includes('</button>\n                            <section class="worth-it-chat-picker-panel'),
        "picker panels should be positioned siblings of the composer controls");

    const desktopStart = css.lastIndexOf("@media (min-width: 761px) {");
    const desktopEnd = css.indexOf("\n}", desktopStart);
    assert.ok(desktopStart >= 0 && desktopEnd > desktopStart);
    const rules = css.slice(desktopStart, desktopEnd);
    assert.ok(rules.includes("width: min(440px, calc(100% - 24px), calc(100vw - 32px)) !important;"));
    assert.ok(rules.includes("min-width: min(360px, calc(100% - 24px)) !important;"));
    assert.ok(rules.includes("height: min(440px, calc(70vh - 16px)) !important;"));
});

test("emoji and GIF category buttons stay inside their picker while their tabs rerender", () => {
    const emojiStart = client.indexOf("function renderWorthItChatEmojiCategories() {");
    const emojiEnd = client.indexOf("\nfunction renderWorthItChatEmojiGrid", emojiStart);
    const gifStart = client.indexOf("function renderWorthItChatGifCategories() {");
    const gifEnd = client.indexOf("\nfunction renderWorthItChatGifResults", gifStart);
    assert.ok(emojiStart >= 0 && emojiEnd > emojiStart && gifStart >= 0 && gifEnd > gifStart);

    const emojiHandler = client.slice(emojiStart, emojiEnd);
    const gifHandler = client.slice(gifStart, gifEnd);
    assert.ok(emojiHandler.includes('button.addEventListener("click", event => {'));
    assert.ok(emojiHandler.includes("worthItChatEmojiCategory = category.id;"));
    assert.ok(gifHandler.includes('button.addEventListener("click", event => {'));
    assert.ok(gifHandler.includes("worthItChatGifCategory = category.id;"));
    assert.ok(gifHandler.includes("loadWorthItChatGifResults("));

    const pathAt = client.indexOf("const eventPath = typeof event.composedPath ===");
    assert.ok(pathAt >= 0);
    const pathCode = client.slice(pathAt, pathAt + 500);
    assert.ok(pathCode.includes("wasInside(dock)"));
    assert.ok(pathCode.includes("wasInside(emojiPicker)"));
    assert.ok(pathCode.includes("wasInside(gifPicker)"));
});

test("chat presence badges sit on the avatar lower-right edge without clipping the image", () => {
    assert.ok(css.includes(".worth-it-chat-person-avatar,\n.worth-it-chat-header-avatar {\n    overflow: visible !important;"));
    assert.ok(css.includes(".worth-it-chat-person-avatar > img,\n.worth-it-chat-header-avatar > img {\n    display: block;\n    border-radius: inherit !important;"));
    const personStart = css.lastIndexOf(".worth-it-chat-person-avatar .worth-it-presence-indicator {");
    const personEnd = css.indexOf("\n}", personStart);
    const headerStart = css.lastIndexOf(".worth-it-chat-header-avatar .worth-it-presence-indicator {");
    const headerEnd = css.indexOf("\n}", headerStart);
    assert.ok(personStart >= 0 && personEnd > personStart && headerStart >= 0 && headerEnd > headerStart);
    assert.ok(css.slice(personStart, personEnd).includes("right: -3px !important;"));
    assert.ok(css.slice(personStart, personEnd).includes("bottom: -3px !important;"));
    assert.ok(css.slice(headerStart, headerEnd).includes("right: -3px !important;"));
    assert.ok(css.slice(headerStart, headerEnd).includes("bottom: -3px !important;"));
});

test("opening the emoji picker renders category controls, and selecting a category renders once", () => {
    const openHandler = client.match(/function openWorthItChatEmojiPicker\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(openHandler, /renderWorthItChatEmojiCategories\(\)/);
    assert.match(openHandler, /renderWorthItChatEmojiGrid\(/);

    const categoryHandler = client.match(/worthItChatEmojiCategory = category\.id;([\s\S]{0,180})/)?.[1] || "";
    assert.equal((categoryHandler.match(/renderWorthItChatEmojiCategories\(\)/g) || []).length, 1,
        "changing category should rebuild the category controls exactly once");
});

test("country flags render visually in the chat composer while typing", () => {
    assert.match(html, /id="worthItChatInputPreview"/);
    assert.match(html, /worth-it-chat-input-preview-wrap/);
    assert.match(client, /function renderWorthItChatComposerPreview\(/);
    assert.match(client, /appendWorthItChatTextWithFlags\(preview, value\.slice\(0, caretPosition\)\)/);
    assert.match(client, /worth-it-chat-composer-caret/);
    assert.match(client, /caretPosition > start && caretPosition < end/);
    assert.match(client, /Intl\.Segmenter/);
    assert.match(client, /🏳️‍⚧️/);
    assert.match(client, /graphemePattern/);
    for (const flag of ["🇷🇸", "🇨🇦", "🇦🇺", "🇳🇿", "🇿🇼", "🇯🇵", "🇧🇷", "🇿🇦"]) assert.ok(client.includes(flag), `missing flag emoji ${flag}`);
    assert.match(client, /rainbow pride LGBTQ LGBT flag/);
    assert.match(client, /transgender trans pride flag/);
    assert.match(client, /addEventListener\("keyup", renderWorthItChatComposerPreview\)/);
    assert.match(client, /addEventListener\("scroll", renderWorthItChatComposerPreview\)/);
    assert.match(css, /\.worth-it-chat-input-preview-wrap/);
    assert.match(css, /caret-color:/);
    assert.match(css, /caret-color: transparent !important/);
    assert.match(css, /\.worth-it-chat-composer-caret[\s\S]*?border-left: 1\.5px solid currentColor/);
    assert.match(css, /textarea::selection[\s\S]*?color: transparent !important[\s\S]*?-webkit-text-fill-color: transparent !important/);
    assert.match(css, /textarea::selection[\s\S]*?background: rgba\(79, 70, 229, \.78\)/);
    assert.match(css, /@media \(max-width: 540px\)[\s\S]*?\.worth-it-chat-input-preview\s*\{\s*font-size: 12px;/);
    assert.match(html, /chat-ui\.js\?v=chat-realtime-typing-delete-fix-20261028a/);
    assert.match(html, /style\.css\?v=chat-polling-preserve-dom-20261028a/);
});
