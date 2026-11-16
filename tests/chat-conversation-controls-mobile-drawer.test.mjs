import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const chat = read("chat-ui.js");
const enhancements = read("chat-enhancements.js");
const css = read("chat-actions.css");

test("mobile chat arrow opens the conversation drawer and the back arrow returns to the active chat", () => {
    assert.match(html, /id="worthItChatMobileListBtn" onclick="showWorthItChatSidebar\(\)"[^>]*>❯<\/button>/);
    assert.match(html, /class="worth-it-chat-icon-btn worth-it-chat-mobile-close" onclick="hideWorthItChatSidebar\(\)"[^>]*>❮<\/button>/);
    assert.match(html, /id="worthItChatSidebar"/);
    assert.match(chat, /window\.showWorthItChatSidebar = function \(\)[\s\S]*?classList\.add\("is-mobile-sidebar"\)/);
    assert.match(chat, /window\.hideWorthItChatSidebar = function \(\)[\s\S]*?classList\.remove\("is-mobile-sidebar"\)/);
    assert.match(chat, /worthItChatMobileListBtn[\s\S]*?setAttribute\("aria-expanded", "true"\)/);
    assert.match(chat, /worthItChatMobileListBtn[\s\S]*?setAttribute\("aria-expanded", "false"\)/);
});

test("mobile drawer slides in from the right without replacing the active conversation", () => {
    assert.match(css, /@media \(max-width: 540px\)[\s\S]*?\.worth-it-chat-window \.worth-it-chat-sidebar[\s\S]*?transform: translateX\(102%\)/);
    assert.match(css, /\.worth-it-chat-window\.is-mobile-sidebar \.worth-it-chat-sidebar[\s\S]*?transform: translateX\(0\)/);
    assert.match(css, /\.worth-it-chat-window\.is-mobile-sidebar \.worth-it-chat-main::after/);
    assert.match(css, /\.worth-it-chat-window\.is-mobile-sidebar \.worth-it-chat-main \{?[^}]*display: flex/s);
});

test("only Global and Group chats show the notification toggle; Private Chat does not", () => {
    assert.match(chat, /const available = Boolean\(chatUser && chatKey && activeConversationType !== "direct"\)/);
    assert.match(chat, /activeConversationType !== "direct"[\s\S]*?worthItChatAudioCallBtn[\s\S]*?button\.hidden = true/);
});

test("Call and Video Call remain limited to accepted one-to-one chats and hidden buttons stay hidden", () => {
    assert.match(enhancements, /const direct = Boolean\(currentContext\?\.userId && currentContext\?\.conversationType === "direct"\s*&& currentContext\?\.isFriend && currentContext\?\.conversationId\)/);
    assert.match(enhancements, /if \(button\) button\.hidden = !direct/);
    assert.match(css, /\.worth-it-chat-icon-btn\[hidden\],[\s\S]*?\.worth-it-chat-enhancement-btn\[hidden\]\s*\{\s*display: none !important;/);
});

test("the mobile chat controls are scoped to Chat and do not change the site navigation", () => {
    assert.match(html, /id="worthItChatMobileListBtn"/);
    assert.match(html, /id="worthItChatSidebar"/);
    assert.doesNotMatch(html, /id="worthItChatMobileListBtn"[^>]*☰/);
    assert.match(css, /@media \(max-width: 540px\)/);
});

// Keep these contracts focused on the Chat interface; the site navigation remains outside the change.
