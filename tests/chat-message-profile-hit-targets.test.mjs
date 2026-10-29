import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const polish = readFileSync(new URL("../chat-ux-polish.css", import.meta.url), "utf8");

test("message avatar profile link and presence status use independent, precise controls", () => {
    const helperStart = client.indexOf("function makeWorthItChatMessageAvatar(message)");
    const rowStart = client.indexOf("function createWorthItChatMessageRow(message)");
    assert.ok(helperStart >= 0 && rowStart > helperStart, "message-avatar helper should be defined before message row rendering");
    const helper = client.slice(helperStart, rowStart);
    assert.match(helper, /const avatar = makeAvatar\(message\)/);
    assert.match(helper, /const indicator = avatar\.querySelector\(":scope > \.worth-it-presence-indicator"\)/);
    assert.match(helper, /indicator\.remove\(\)/, "the status control must be detached from the avatar profile link");
    assert.match(helper, /makeChatProfileLink\([\s\S]*?"worth-it-chat-message-avatar-link"[\s\S]*?avatar/);
    assert.match(helper, /wrapper\.appendChild\(profileLink\)/);
    assert.match(helper, /if \(indicator\) wrapper\.appendChild\(indicator\)/, "status is a sibling of the profile link, not a nested interactive control");

    const rowEnd = client.indexOf("\nfunction ", rowStart + 1);
    const row = client.slice(rowStart, rowEnd < 0 ? undefined : rowEnd);
    assert.match(row, /row\.appendChild\(makeWorthItChatMessageAvatar\(message\)\)/);
    assert.match(row, /makeChatProfileLink\(message, "worth-it-chat-message-name"/);
    assert.doesNotMatch(row, /row\.appendChild\(makeAvatar\(message\)\)/);
});

test("message-only avatar, status dot and display-name hit targets scale for desktop and phones", () => {
    assert.match(polish, /\.worth-it-chat-message \.worth-it-chat-message-avatar-wrap\s*\{[\s\S]*?width: 40px !important;[\s\S]*?height: 40px !important;/);
    assert.match(polish, /\.worth-it-chat-message-avatar-wrap > \.worth-it-presence-indicator\s*\{[\s\S]*?width: 17px !important;[\s\S]*?height: 17px !important;/);
    assert.match(polish, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-message \.worth-it-chat-message-avatar-wrap\s*\{[\s\S]*?width: 34px !important;[\s\S]*?height: 34px !important;/);
    assert.match(polish, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-message \.worth-it-chat-message-avatar-link \.worth-it-chat-person-avatar\s*\{[\s\S]*?display: grid !important;/);
    assert.match(polish, /\.worth-it-chat-message-name\s*\{[\s\S]*?width: fit-content !important;[\s\S]*?padding: 0 !important;[\s\S]*?font-size: 13px !important;/);
    assert.match(polish, /@media \(max-width: 760px\)[\s\S]*?\.worth-it-chat-message \.worth-it-chat-message-name\s*\{[\s\S]*?font-size: 12px !important;/);
    assert.match(html, /chat-ui\.js\?v=chat-gif-style-refresh-20261029a/);
    assert.match(html, /chat-ux-polish\.css\?v=chat-message-profile-hit-targets-20261029a/);
});

test("existing private, global and group conversations share the same message renderer", () => {
    assert.match(client, /function createWorthItChatMessageRow\(message\)/);
    assert.match(client, /function renderMessages\(/);
    assert.match(client, /createWorthItChatMessageRow\(message\)/);
});
