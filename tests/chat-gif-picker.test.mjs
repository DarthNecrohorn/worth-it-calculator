import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const polish = readFileSync(new URL("../chat-ux-polish.css", import.meta.url), "utf8");
const encodedLibrary = readFileSync(new URL("../assets/worth-it-chat-gifs/library.base64.txt", import.meta.url), "utf8").trim();
const library = Buffer.from(encodedLibrary, "base64");
const originalGifAssets = [...client.matchAll(
    /\{ id: "([^"]+)", title: "([^"]+)", keywords: "([^"]*)", type: "(gif|sticker)", offset: (\d+), length: (\d+) \}/g
)].map(match => ({
    id: match[1],
    title: match[2],
    type: match[4],
    offset: Number(match[5]),
    length: Number(match[6])
}));

test("the chat composer uploads directly and exposes GIF, sticker and emoji actions", () => {
    assert.match(html, /id="worthItChatPlusBtn"[^>]+aria-label="Upload a file"/);
    assert.match(html, /id="worthItChatFileInput"/);
    assert.doesNotMatch(html, /worthItChatPlusMenu|worthItChatUploadAction/);
    assert.match(html, /id="worthItChatGifAction"[^>]+data-worth-it-chat-open-media="gif"/);
    assert.match(html, /id="worthItChatStickerAction"[^>]+data-worth-it-chat-open-media="sticker"/);
    assert.match(html, /id="worthItChatEmojiAction"[^>]+data-worth-it-chat-open-media="emoji"/);
    assert.match(html, /id="worthItChatMediaPicker"[^>]+role="dialog"/);
    assert.match(html, /id="worthItChatMediaTabs"[^>]+role="tablist"/);
    for (const tab of ["gif", "sticker", "emoji"]) assert.match(html, new RegExp('data-worth-it-chat-media-tab="' + tab + '"'));
    assert.match(html, /id="worthItChatEmojiGrid"/);
    assert.match(html, /id="worthItChatEmojiCategories"[^>]+role="tablist"/);
    assert.match(html, /Original Worth It animations\. No external GIF provider or API key required\./);
    assert.match(client, /function insertWorthItChatEmoji\(/);
    assert.match(client, /function appendWorthItChatTextWithFlags\(/);
    assert.match(client, /worth-it-chat-message-flag/);
    assert.match(client, /flagcdn\.com/);
    assert.match(client, /function renderWorthItChatEmojiCategories\(/);
    assert.match(client, /function loadWorthItChatGifResults\(/);
    assert.match(client, /function selectWorthItChatGif\(/);
    assert.match(html, /chat-ui\.js\?v=chat-media-lightbox-20261029a/);
    assert.match(html, /style\.css\?v=chat-media-lightbox-20261029a/);
});

test("signed-in chat refresh keeps the initial session-restoration state instead of flashing the sign-in prompt", () => {
    assert.match(client, /let chatAuthResolutionComplete = Boolean\(window\.worthItAuthStateResolved\)/);
    assert.match(client, /if \(!chatUser && !chatAuthResolutionComplete\) \{[\s\S]*?host\.setAttribute\("aria-busy", "true"\);[\s\S]*?return;/);
    assert.match(client, /window\.worthItAuthReady/);
    assert.match(client, /window\.worthItCurrentAuthUser/);
    assert.match(client, /event === "INITIAL_SESSION" && !window\.worthItAuthStateResolved/);
    assert.doesNotMatch(client, /sb\(\)\.auth\.getSession\(\)\.then/);
});

test("the emoji picker has categories and a large locally searchable emoji library", () => {
    for (const category of ["faces", "people", "animals", "plants", "food", "activities", "travel", "objects", "symbols", "flags"]) {
        assert.match(client, new RegExp('addWorthItChatEmojiGroup\\("' + category + '"'));
    }
    assert.match(html, /placeholder="Search emoji…"/);
    assert.match(client, /WORTH_IT_CHAT_EMOJI_KEYWORDS/);
    assert.match(client, /worthItChatEmojiCategory/);
    assert.match(css, /\.worth-it-chat-emoji-grid[\s\S]*?overflow-y: auto/);
    assert.match(css, /\.worth-it-chat-emoji-categories[\s\S]*?overflow-x: auto/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-picker-panel:not\(\[hidden\]\)[\s\S]*?position: fixed !important/);
});

test("plants are separate from Animals and appear immediately before Food", () => {
    const categories = client.slice(client.indexOf("const WORTH_IT_CHAT_EMOJI_CATEGORIES = ["), client.indexOf("const WORTH_IT_CHAT_EMOJI_OPTIONS"));
    assert.match(categories, /id: "animals"[\s\S]*?id: "plants"[\s\S]*?id: "food"/);
    const animals = client.match(/addWorthItChatEmojiGroup\("animals", "([^"]+)"\);/)?.[1] || "";
    const plants = client.match(/addWorthItChatEmojiGroup\("plants", "([^"]+)"\);/)?.[1] || "";
    for (const emoji of ["🌵", "🌲", "🌳", "🌴", "🌱", "🌿", "🪴", "🌹", "🌻", "🌷", "🪷", "🪻"]) {
        assert.ok(!animals.includes(emoji), emoji + " must not be in Animals");
        assert.ok(plants.includes(emoji), emoji + " should be in Plants");
    }
    assert.ok(plants.trim().split(/\s+/).length >= 25, "Plants should contain a generous range of emojis");
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
    assert.equal(library.length, originalGifAssets.reduce((total, asset) => total + asset.length, 0), "the complete media bundle must exactly match the manifest");
    assert.ok(library.length > 300_000, "the library should contain the expanded original animation set");
});

test("each curated original animation has a valid GIF signature and stays within the chat limit", () => {
    for (const asset of originalGifAssets) {
        const bytes = library.subarray(asset.offset, asset.offset + asset.length);
        assert.equal(bytes.length, asset.length, asset.id + " has an invalid offset or length");
        assert.ok(bytes.length > 100, asset.id + " looks unexpectedly small");
        assert.ok(bytes.length <= 20 * 1024 * 1024, asset.id + " exceeds the chat GIF limit");
        const signature = bytes.subarray(0, 6).toString("ascii");
        assert.ok(signature === "GIF87a" || signature === "GIF89a", asset.id + " is not a valid GIF");
        assert.equal(bytes.at(-1), 0x3b, asset.id + " must end with the GIF trailer byte");
        assert.equal(bytes.readUInt16LE(6), 128, asset.id + " should use a crisp 128px canvas");
        assert.equal(bytes.readUInt16LE(8), 128, asset.id + " should use a crisp 128px canvas");
        assert.match(client, new RegExp('id: "' + asset.id + '"'));
        assert.match(client, new RegExp('offset: ' + asset.offset + ', length: ' + asset.length));
    }
    assert.equal(originalGifAssets.length, 24, "the library should contain many more original animations");
    assert.equal(originalGifAssets.filter(asset => asset.type === "gif").length, 12);
    assert.equal(originalGifAssets.filter(asset => asset.type === "sticker").length, 12);
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
    assert.match(client, /function openWorthItChatFilePicker\(\)/);
    assert.match(client, /function showWorthItChatMediaTab\(tab/);
    assert.match(client, /pendingFilePickerTarget = \{ key: worthItChatDraftKey\(\), userId: chatUser\?\.id \|\| null \}/);

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

test("the media picker follows the right-side actions and the composer keeps every action on one responsive row", () => {
    const dock = html.indexOf('id="worthItChatPickerDock"');
    const textarea = html.indexOf('id="worthItChatInput"');
    const send = html.indexOf('id="worthItChatSendBtn"');
    const gifAction = html.indexOf('id="worthItChatGifAction"');
    const stickerAction = html.indexOf('id="worthItChatStickerAction"');
    const emojiAction = html.indexOf('id="worthItChatEmojiAction"');
    const voice = html.indexOf('id="worthItChatVoiceBtn"');
    const picker = html.indexOf('id="worthItChatMediaPicker"');
    const gifView = html.indexOf('id="worthItChatGifPicker"');
    const emojiView = html.indexOf('id="worthItChatEmojiPicker"');
    assert.ok(dock >= 0 && textarea > dock && gifAction > textarea &&
        stickerAction > gifAction && emojiAction > stickerAction && voice > emojiAction &&
        send > voice && picker > send && gifView > picker && emojiView > gifView);
    const sendButton = html.slice(send, html.indexOf("</button>", send) + "</button>".length);
    assert.match(sendButton, /\shidden(?:\s|>)/, "Send starts hidden until a draft needs it");
    assert.ok(!html.slice(dock, textarea).includes('id="worthItChatMediaPicker"'),
        "the media popup must not be nested inside the narrow upload dock");

    const desktopStart = css.lastIndexOf("@media (min-width: 761px) {");
    const desktopEnd = css.indexOf("\n}", desktopStart);
    assert.ok(desktopStart >= 0 && desktopEnd > desktopStart);
    const rules = css.slice(desktopStart, desktopEnd);
    assert.ok(rules.includes("width: min(440px, calc(100% - 24px), calc(100vw - 32px)) !important;"));
    assert.ok(rules.includes("min-width: min(360px, calc(100% - 24px)) !important;"));
    assert.ok(rules.includes("height: min(440px, calc(70vh - 16px)) !important;"));
    assert.match(polish, /\.worth-it-chat-compose\s*\{[\s\S]*?flex-wrap: nowrap !important/);
    assert.match(polish, /@media \(max-width: 540px\)[\s\S]*?\.worth-it-chat-compose #worthItChatSendBtn[\s\S]*?font-size: 0 !important/);
    assert.match(polish, /\.worth-it-chat-compose #worthItChatSendBtn\[hidden\][\s\S]*?#worthItChatVoiceBtn\[hidden\][\s\S]*?display: none !important/);
    assert.match(polish, /\.worth-it-chat-compose \.worth-it-chat-voice-btn[\s\S]*?flex: 0 0 36px/);
    assert.match(polish, /\.worth-it-chat-picker-view\[hidden\]\s*\{\s*display: none !important/);
});


test("typing swaps the voice button for Send and clearing the draft restores the microphone", () => {
    const action = client.match(/function updateWorthItChatComposerAction\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(action, /String\(input\.value \|\| ""\)\.trim\(\)/);
    assert.match(action, /pendingMediaFile/);
    assert.match(action, /pendingReplyQuote/);
    assert.match(action, /sendButton\.hidden = !showSend/);
    assert.match(action, /voiceButton\.hidden = showSend/);
    const inputHandler = client.slice(client.indexOf('$("worthItChatInput")?.addEventListener("input"'), client.indexOf('$("worthItChatInput")?.addEventListener("scroll"'));
    assert.match(inputHandler, /updateWorthItChatComposerAction\(\)/);
    assert.match(polish, /#worthItChatSendBtn\[hidden\][\s\S]*?#worthItChatVoiceBtn\[hidden\][\s\S]*?display:\s*none !important/);
});

test("the unified media tabs select GIFs, stickers or the existing categorized emoji library", () => {
    const emojiStart = client.indexOf("function renderWorthItChatEmojiCategories() {");
    const emojiEnd = client.indexOf("\nfunction renderWorthItChatEmojiGrid", emojiStart);
    const tabsStart = client.indexOf("function showWorthItChatMediaTab(tab");
    const tabsEnd = client.indexOf("\nconst WORTH_IT_CHAT_EMOJI_KEYWORDS", tabsStart);
    assert.ok(emojiStart >= 0 && emojiEnd > emojiStart && tabsStart >= 0 && tabsEnd > tabsStart);
    const emojiHandler = client.slice(emojiStart, emojiEnd);
    const tabsHandler = client.slice(tabsStart, tabsEnd);
    assert.ok(emojiHandler.includes('button.addEventListener("click", event => {'));
    assert.ok(emojiHandler.includes("worthItChatEmojiCategory = category.id;"));
    assert.ok(tabsHandler.includes("worthItChatGifCategory = tab;"));
    assert.ok(tabsHandler.includes('gifPanel.hidden = tab === "emoji";'));
    assert.ok(tabsHandler.includes('emojiPanel.hidden = tab !== "emoji";'));
    assert.match(tabsHandler, /loadWorthItChatGifResults\(search\?\.value \|\| ""\)/);
    assert.ok(client.includes('data-worth-it-chat-media-tab'));
    assert.doesNotMatch(client, /worthItChatPlusMenu|worthItChatUploadAction/);
    assert.match(client, /function openWorthItChatGifPicker\(\)\s*\{\s*showWorthItChatMediaTab\("gif", true\)/);
    assert.match(client, /function openWorthItChatStickerPicker\(\)\s*\{\s*showWorthItChatMediaTab\("sticker", true\)/);
    assert.match(client, /function openWorthItChatEmojiPicker\(\)\s*\{\s*showWorthItChatMediaTab\("emoji", true\)/);
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

test("opening the emoji tab renders the existing emoji categories and grid", () => {
    const openHandler = client.match(/function openWorthItChatEmojiPicker\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(openHandler, /showWorthItChatMediaTab\("emoji", true\)/);
    const mediaHandler = client.match(/function showWorthItChatMediaTab\(tab, resetSearch = false\) \{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(mediaHandler, /renderWorthItChatEmojiCategories\(\)/);
    assert.match(mediaHandler, /renderWorthItChatEmojiGrid\(search\?\.value \|\| ""\)/);

    const categoryHandler = client.match(/worthItChatEmojiCategory = category\.id;([\s\S]{0,180})/)?.[1] || "";
    assert.equal((categoryHandler.match(/renderWorthItChatEmojiCategories\(\)/g) || []).length, 1,
        "changing emoji category should rebuild the category controls exactly once");
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
    assert.match(html, /chat-ui\.js\?v=chat-media-lightbox-20261029a/);
    assert.match(html, /style\.css\?v=chat-media-lightbox-20261029a/);
});


test("composer media actions use restrained hover and click motion and the emoji glyph cycles briefly", () => {
    assert.match(polish, /\.worth-it-chat-media-trigger:hover/);
    assert.match(polish, /\.worth-it-chat-compose \.worth-it-chat-voice-btn:hover/);
    assert.match(polish, /@keyframes worthItChatActionTap/);
    assert.match(client, /function animateWorthItChatActionTap\(button\)/);
    assert.match(client, /function animateWorthItChatEmojiButton\(\)/);
    assert.match(client, /const frames = \["😎", "🤩", "🥳", "😄", "😀"\]/);
    assert.match(client, /\$\("worthItChatEmojiAction"\)\?\.addEventListener\("mouseenter", animateWorthItChatEmojiButton\)/);
    assert.match(client, /\$\("worthItChatEmojiAction"\)\?\.addEventListener\("click", animateWorthItChatEmojiButton\)/);
    assert.match(client, /\$\("worthItChatEmojiAction"\)\?\.addEventListener\("click", openWorthItChatEmojiPicker\)/);
});

test("scrolling into older messages reveals Travel back to present and smoothly returns to the newest messages", () => {
    assert.match(html, /id="worthItChatTravelPresentBtn"[^>]*>Travel back to present <span aria-hidden="true">↓<\/span><\/button>/);
    assert.match(client, /function updateWorthItChatTravelPresentButton\(\)/);
    assert.match(client, /distanceFromBottom > 80/);
    assert.match(client, /addEventListener\("scroll", updateWorthItChatTravelPresentButton/);
    assert.match(client, /messages\.scrollTo\(\{[\s\S]*?top: messages\.scrollHeight,[\s\S]*?behavior: prefersReducedMotion \? "auto" : "smooth"/);
    assert.match(polish, /button\.worth-it-chat-travel-present:not\(\[disabled\]\):hover/);
    assert.match(polish, /@keyframes worthItChatTravelArrive/);
});
