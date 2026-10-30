import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const style = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const deleteConfirmCss = readFileSync(new URL("../chat-delete-confirm.css", import.meta.url), "utf8");

test("Delete for everyone opens its confirmation above the chat immediately, only for the sender", () => {
    assert.match(client, /if \(mine\) addMenuItem\("Delete message for everyone", \(\) => runWorthItChatMessageAction\("delete", message\), true\)/);
    assert.match(client, /if \(action === "delete" && message\.sender_user_id !== actionUserId\)/);
    assert.match(client, /if \(action === "delete" && message\.sender_user_id !== chatUser\.id\)/);
    assert.match(client, /await confirmWorthItChatMessageDelete\(actionUserId\)/);
    assert.match(client, /overlay\.style\.zIndex = "2147483647"/);
    assert.match(client, /document\.body\.appendChild\(overlay\);\s*cancelButton\.focus\(\)/);
    assert.match(deleteConfirmCss, /z-index:\s*2147483647 !important/);
    assert.match(html, /chat-delete-confirm\.css\?v=chat-delete-confirm-20261028b/);
    assert.match(html, /chat-ui\.js\?v=chat-private-media-signed-access-20261030a/);
});

test("light-theme chat text, sidebar labels and empty states have readable contrast", () => {
    for (const selector of [
        "worth-it-chat-side-heading",
        "worth-it-chat-text-btn",
        "worth-it-chat-person-btn",
        "worth-it-chat-person-info strong",
        "worth-it-chat-person-info small",
        "worth-it-chat-icon-btn",
        "worth-it-chat-empty strong",
        "worth-it-chat-empty p"
    ]) {
        assert.ok(style.includes('html[data-theme="light"] .' + selector), "missing light-theme contrast rule for " + selector);
    }
    assert.match(style, /html\[data-theme="light"\] \.worth-it-chat-category-btn\.is-active[\s\S]*?color: #312e81 !important/);
    assert.match(style, /html\[data-theme="light"\] \.worth-it-chat-media-tab\.is-active[\s\S]*?color: #312e81 !important/);
    assert.match(html, /style\.css\?v=chat-image-lightbox-close-glyph-4px-20261030b/);
});

test("emoji and GIF picker close X glyph moves up two pixels without moving its square", () => {
    assert.match(style, /\.worth-it-chat-picker-close::before\s*\{[^}]*content: "×"[^}]*transform: translateY\(-2px\)/);
    assert.ok(style.includes('.worth-it-chat-picker-close {\n    font-size: 0 !important;'));
    const glyphRule = style.match(/\.worth-it-chat-picker-close::before\s*\{([^}]+)\}/)?.[1] || "";
    assert.match(glyphRule, /font-size: 20px/);
});

test("Sign out requires an explicit Yes; No, Escape and backdrop clicks cancel", () => {
    assert.match(html, /id="signOutNavBtn" onclick="signOutUser\(\)"/);
    assert.match(app, /async function performSignOutUser\(\)\s*\{[\s\S]*?signOut\(\{ scope: "local" \}\)/);
    const start = app.indexOf("function signOutUser() {");
    const end = app.indexOf("/* =========================================================\nACCOUNT PAGE", start);
    assert.ok(start >= 0 && end > start, "the confirmation handler should be present in app.js");
    const handler = app.slice(start, end);
    assert.match(handler, /title\.textContent = "Are you sure you want to sign out\?"/);
    assert.match(handler, /yesButton\.textContent = "Yes"/);
    assert.match(handler, /noButton\.textContent = "No"/);
    assert.match(handler, /yesButton\.addEventListener\("click", event => \{[\s\S]*?finish\(true\)/);
    assert.match(handler, /noButton\.addEventListener\("click", event => \{[\s\S]*?finish\(false\)/);
    assert.match(handler, /if \(event\.key === "Escape"\)[\s\S]*?finish\(false\)/);
    assert.match(handler, /if \(event\.target === overlay\)[\s\S]*?finish\(false\)/);
    assert.match(style, /\.worth-it-signout-confirm-dialog\s*\{[\s\S]*?z-index: 2147483646/);
    assert.match(style, /html\[data-theme="light"\] \.worth-it-signout-confirm-card/);
    assert.match(html, /app\.js\?v=signout-confirmation-20261028a/);
});
