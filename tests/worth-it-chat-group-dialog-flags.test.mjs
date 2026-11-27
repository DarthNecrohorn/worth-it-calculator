import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const chat = read("chat-ui.js");
const style = read("style.css");
const acFlag = read("assets/chat-ac-flag-20261127.svg");

test("group member settings stay above the Chat navigation stacking context", () => {
    assert.match(chat, /if \(dialog\.parentElement !== document\.body\) document\.body\.appendChild\(dialog\);/);
    assert.match(style, /\.nav\s*\{\s*z-index:\s*50000 !important;\s*\}/);
    assert.match(style, /\/\* This dialog is portaled to body[\s\S]*?\.worth-it-chat-manage-dialog\s*\{\s*z-index:\s*60000 !important;\s*\}/);
    assert.match(html, /id="worthItChatGroupManageDialog"/);
});

test("flag preview is painted above the transparent textarea without intercepting input", () => {
    assert.match(style, /\.worth-it-chat-compose \.worth-it-chat-input-preview-wrap textarea\s*\{[^}]*z-index:\s*1/);
    assert.match(style, /\.worth-it-chat-input-preview\s*\{[^}]*z-index:\s*2/);
    assert.match(style, /\.worth-it-chat-input-preview\s*\{[^}]*pointer-events:\s*none/);
    assert.match(chat, /appendWorthItChatTextWithFlags\(preview, value, \{ loading: "eager" \}\)/);
    assert.match(chat, /appendWorthItChatTextWithFlags\(preview, value\.slice\(0, caretPosition\), \{ loading: "eager" \}\)/);
    assert.match(chat, /appendWorthItChatTextWithFlags\(preview, value\.slice\(caretPosition\), \{ loading: "eager" \}\)/);
    // The real textarea continues to receive focus and selection changes.
    assert.match(chat, /textarea\.setRangeText\(emoji, start, end, "end"\)/);
    assert.match(chat, /textarea\.focus\(\{ preventScroll: true \}\)/);
});

test("Ascension Island AC uses a dedicated SVG in the picker, composer, and sent messages", () => {
    assert.match(chat, /function worthItChatFlagImageUrl\(flagCode\)/);
    assert.match(chat, /if \(code === "ac"\)\s*\{\s*return "\/assets\/chat-ac-flag-20261127\.svg";\s*\}/);
    assert.equal((chat.match(/worthItChatFlagImageUrl\(flagCode\)/g) || []).length, 3);
    assert.match(acFlag, /viewBox="0 0 64 48"/);
    assert.ok(acFlag.includes("CC BY-SA 4.0"), "AC flag attribution should retain its license notice");
    assert.match(acFlag, /translate\(-4 -16\) scale\(1 1\.2\)/);
    assert.match(style, /\.worth-it-chat-emoji-flag\s*\{[^}]*width:\s*1\.2em[^}]*height:\s*\.9em/);
    assert.match(style, /\.worth-it-chat-message-flag\s*\{[^}]*width:\s*1\.2em[^}]*height:\s*\.9em/);
    assert.match(chat, /flagImage\.loading = flagCode === "ac" \? "eager" : "lazy";/);
    assert.match(chat, /addWorthItChatEmojiGroup\("flags",[\s\S]*?🇦🇨/);
});

test("chat assets use a new cache key for the fixes", () => {
    assert.match(html, /style\.css\?[^"]*chat-group-dialog-flags=20261127a/);
    assert.match(html, /chat-ui\.js\?[^"]*group-settings-flag-preview=20261127a/);
});
