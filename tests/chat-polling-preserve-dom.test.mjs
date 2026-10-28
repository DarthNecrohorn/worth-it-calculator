import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");

test("five-second chat polling preserves unchanged message and avatar DOM nodes", () => {
    const match = client.match(/function renderMessages\(scrollToBottom\) \{([\s\S]*?)\n\}\s*async function loadWorthItChatMessages/);
    assert.ok(match, "the message renderer and polling loader should be present");
    const renderMessages = match[1];
    assert.match(client, /function chatMessageRenderSignature\(message\)/);
    assert.match(client, /function createWorthItChatMessageRow\(message\)/);
    assert.match(renderMessages, /previous && previous\.dataset\.worthItMessageSignature === signature/);
    assert.match(renderMessages, /existingRows\.forEach\(row => row\.remove\(\)\)/);
    assert.match(renderMessages, /if \(current !== row\) host\.insertBefore\(row, current\)/);
    assert.doesNotMatch(renderMessages, /^\s*host\.replaceChildren\(\);/);
});

test("chat sidebar lists are only rebuilt when their rendered state changes", () => {
    assert.match(client, /host\.dataset\.worthItChatRenderKey === renderKey/);
    assert.match(client, /directUnread: chatConversations\.filter\(conversation => conversation\.type === "direct"\)/);
    assert.match(client, /conversations: visibleConversations\.map\(conversation =>/);
});

test("Realtime chat has a responsive fallback poll and keeps a five-second safety refresh", () => {
    assert.match(client, /function startWorthItChatPolling\(\)/);
    assert.match(client, /loadWorthItChatMessages\(false\)/);
    assert.match(client, /window\.setInterval\(\(\) => \{/);
    assert.match(client, /\}, 1000\)/);
    assert.match(client, /if \(!chatRealtimeSubscribed \|\| now - chatLastMessagePollAt >= 5000\)/);
    assert.match(client, /now - chatLastSidebarRefreshAt >= 5000/);
});
