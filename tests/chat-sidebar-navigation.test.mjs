import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../chat-actions.css", import.meta.url), "utf8");
const style = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../chat-enhancements.js", import.meta.url), "utf8");

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

test("private chat rows expose a discreet options menu and keep long-press/right-click support", () => {
    assert.match(client, /worth-it-chat-private-item/);
    assert.match(client, /worth-it-chat-private-actions-btn/);
    assert.match(client, /Conversation options for /);
    assert.match(client, /showWorthItChatConversationContextMenu\(contextConversation, rect\.left, rect\.bottom, actions\)/);
    assert.match(client, /attachWorthItChatConversationContextHandlers\(item, contextConversation\)/);
    assert.match(css, /\.worth-it-chat-private-item:hover \.worth-it-chat-private-actions-btn/);
    assert.match(css, /@media\(max-width:760px\), \(hover:none\), \(pointer:coarse\)[\s\S]*?\.worth-it-chat-private-actions-btn\{opacity:\.82\}/);
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


test("mobile chat arrows open and close a sliding chat-list drawer without replacing the active conversation", () => {
    assert.ok(html.includes('id="worthItChatMobileListBtn"'));
    assert.ok(html.includes('aria-label="Open chat list"'));
    assert.ok(html.includes('>❯</button>'));
    assert.ok(html.includes('id="worthItChatMobileSidebarCloseBtn"'));
    assert.ok(html.includes('onclick="hideWorthItChatSidebar()"'));
    assert.ok(html.includes('>❮</button>'));
    assert.ok(client.includes("function setWorthItChatMobileSidebar(open)"));
    assert.ok(client.includes("window.showWorthItChatSidebar = function () { setWorthItChatMobileSidebar(true); };"));
    assert.ok(client.includes("window.hideWorthItChatSidebar = function () {"));
    assert.ok(client.includes("setWorthItChatMobileSidebar(false);"));
    assert.ok(style.includes(".worth-it-chat-window > .worth-it-chat-sidebar"));
    assert.ok(style.includes("transform: translate3d(-102%, 0, 0) !important;"));
    assert.ok(style.includes(".worth-it-chat-window.is-mobile-sidebar > .worth-it-chat-sidebar"));
    assert.ok(style.includes("transform: translate3d(0, 0, 0) !important;"));
});

test("mobile chat header places the active conversation identity beside the drawer arrow", () => {
    const arrowIndex = html.indexOf('id="worthItChatMobileListBtn"');
    const identityIndex = html.indexOf('class="worth-it-chat-header-person"', arrowIndex);
    assert.ok(arrowIndex >= 0 && identityIndex > arrowIndex, "drawer arrow comes immediately before the conversation identity");
    assert.ok(style.includes("grid-template-columns: 34px minmax(0, 1fr) auto !important;"));
    assert.ok(style.includes(".worth-it-chat-header-person.is-global-chat .worth-it-chat-header-avatar,"));
    assert.ok(style.includes(".worth-it-chat-header-person.is-group-chat .worth-it-chat-header-avatar"));
    assert.ok(style.includes("transform: none !important;"));
    assert.ok(client.includes('makeChatProfileLink(person, "worth-it-chat-header-profile-link"'));
});

test("clicking the group name opens the member roster with presence and Owner-only Kick controls", () => {
    assert.ok(client.includes('groupTitleButton.className = "worth-it-chat-group-title-trigger";'));
    assert.ok(client.includes('groupTitleButton.setAttribute("aria-label", "View members of "'));
    assert.ok(client.includes('openWorthItGroupMembers(groupConversation.id);'));
    assert.ok(client.includes('window.getWorthItPresenceInfo(member).label'));
    assert.ok(client.includes("if (conversation.is_creator === true) {"));
    assert.ok(client.includes('kick.className = "worth-it-chat-group-member-kick"'));
});

test("call buttons are limited to direct chats and the notification toggle is absent from private chats", () => {
    assert.ok(enhancements.includes('currentContext?.conversationType === "direct"'));
    assert.ok(enhancements.includes("if (button) button.hidden = !direct;"));
    assert.ok(client.includes("activeConversationType !== \"direct\""));
    assert.ok(style.includes("#worthItChatAudioCallBtn[hidden]"));
    assert.ok(style.includes("#worthItChatVideoCallBtn[hidden]"));
    assert.ok(style.includes("#worthItChatHeaderNotifications[hidden]"));
    assert.ok(style.includes("display: none !important;"));
});
