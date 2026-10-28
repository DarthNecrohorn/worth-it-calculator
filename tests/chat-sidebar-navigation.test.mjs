import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../chat-actions.css", import.meta.url), "utf8");

test("Global Chat stays prominent above clearly named Private Chats and Group Chats sections", () => {
    const globalIndex = html.indexOf('id="worthItGlobalChatBtn"');
    const privateIndex = html.indexOf(">PRIVATE CHATS</span>");
    const groupsIndex = html.indexOf(">GROUP CHATS</span>");
    assert.ok(globalIndex >= 0, "Global Chat button exists");
    assert.ok(privateIndex > globalIndex, "Private Chats section follows Global Chat");
    assert.ok(groupsIndex > privateIndex, "Group Chats follows Private Chats");
    assert.match(html, /id="worthItGlobalChatUnreadCount"/);
    assert.match(html, /onclick="openWorthItGroupChatDialog\(\)">＋ New group/);
});

test("one accessible sidebar search filters friends and groups without changing the chat route", () => {
    assert.match(html, /class="worth-it-chat-sidebar-search" role="search"/);
    assert.match(html, /id="worthItChatSidebarSearch"/);
    assert.match(html, /placeholder="Find a friend or group…"/);
    assert.match(html, /aria-label="Find a private or group chat"/);
    assert.match(html, /id="worthItChatSidebarSearchClear"/);
    assert.match(client, /function getWorthItChatSidebarSearchQuery\(/);
    assert.match(client, /function worthItChatSidebarSearchMatches\(/);
    assert.match(client, /friend\.display_name, friend\.username, friend\.worth_it_id/);
    assert.match(client, /worthItChatSidebarSearchMatches\(sidebarQuery, getWorthItChatConversationSearchFields\(conversation\)\)/);
    assert.match(client, /No private chats match your search\./);
    assert.match(client, /No group chats match your search\./);
});

test("typing and clearing the sidebar search rerenders both lists and preserves the query during polling", () => {
    assert.match(client, /worthItChatSidebarSearch.*addEventListener\("input"/);
    assert.match(client, /renderFriends\(\);\s*renderConversations\(\);/);
    assert.match(client, /worthItChatSidebarSearchClear.*addEventListener\("click"/);
    assert.match(client, /search\.dispatchEvent\(new Event\("input", \{bubbles:true\}\)\)/);
    assert.match(client, /userId: chatUser\?\.id \|\| null,\s*sidebarQuery,/);
    assert.match(css, /\.worth-it-chat-sidebar-search:focus-within/);
    assert.match(css, /html\[data-theme="light"\] \.worth-it-chat-sidebar-search/);
    assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.worth-it-chat-sidebar-search/);
});
