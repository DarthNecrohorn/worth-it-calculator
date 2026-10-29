import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const chat = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const calls = readFileSync(new URL("../chat-enhancements.js", import.meta.url), "utf8");
const ai = readFileSync(new URL("../ai-ui.js", import.meta.url), "utf8");
const polish = readFileSync(new URL("../chat-ux-polish.css", import.meta.url), "utf8");
const baseChatCss = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("each conversation has independent text, reply, and attachment draft state", () => {
    assert.match(chat, /const worthItChatDrafts = new Map\(\)/);
    assert.match(chat, /function worthItChatDraftKey\(userId = chatUser\?\.id, type = activeConversationType, id = activeConversationId\)/);
    assert.match(chat, /function saveActiveWorthItChatDraft\(\)/);
    assert.match(chat, /function restoreWorthItChatDraft\(key\)/);
    assert.match(chat, /saveActiveWorthItChatDraft\(\);\s*closeWorthItChatPickers\(\);\s*activeConversationId = id \|\| null;\s*activeConversationType = type \|\| "global";/);
    assert.match(chat, /restoreWorthItChatDraft\(worthItChatDraftKey\(\)\)/);
    assert.match(chat, /text: String\(input\?\.value \|\| ""\)/);
    assert.match(chat, /mediaFile: pendingMediaFile \|\| null/);
    assert.match(chat, /replyQuote: pendingReplyQuote \? \{ author: pendingReplyQuote.author, text: pendingReplyQuote.text \} : null/);
    assert.match(chat, /if \(previousUserId !== \(chatUser\?\.id \|\| null\)\) clearWorthItChatDrafts\(\)/);
});

test("sending a message snapshots its destination and never submits to the newly active chat after an await", () => {
    assert.match(chat, /const sendUserId = chatUser\.id/);
    assert.match(chat, /const sendConversationType = activeConversationType/);
    assert.match(chat, /const sendConversationId = activeConversationId/);
    assert.match(chat, /const sendDraftKey = worthItChatDraftKey\(sendUserId, sendConversationType, sendConversationId\)/);
    assert.match(chat, /uploadPendingMedia\(draftMediaFile, sendConversationId \|\| WORTH_IT_GLOBAL_CHAT_REALTIME_ID, sendUserId\)/);
    assert.match(chat, /p_conversation_id: sendConversationType === "global" \? null : sendConversationId/);
    assert.match(chat, /storedStillMatchesSentDraft/);
    assert.match(chat, /worthItChatDraftKey\(\) === sendDraftKey && chatUser\?\.id === sendUserId/);
});

test("native file picker selections remain on the conversation where Upload was opened", () => {
    assert.match(chat, /let pendingFilePickerTarget = null/);
    assert.match(chat, /pendingFilePickerTarget = \{ key: worthItChatDraftKey\(\), userId: chatUser\?\.id \|\| null \}/);
    assert.match(chat, /const target = pendingFilePickerTarget;\s*pendingFilePickerTarget = null;/);
    assert.match(chat, /const targetIsActive = target\.key === worthItChatDraftKey\(\)/);
    assert.match(chat, /if \(!targetIsActive\) \{[\s\S]*?worthItChatDrafts\.set\(target\.key, \{ \.\.\.previous, mediaFile: file, mediaUrl: objectUrl, mediaType: type \}\)/);
    assert.match(chat, /pendingFilePickerTarget = null;\s*for \(const url of urls\)/);
});

test("voice recording stores its originating account and conversation before microphone permission awaits", () => {
    const start = calls.indexOf("async function startVoiceRecording()");
    const end = calls.indexOf("\nfunction stopVoiceRecording()", start);
    assert.ok(start >= 0 && end > start);
    const recorder = calls.slice(start, end);
    assert.ok(recorder.indexOf("audioRecordingContext = {") < recorder.indexOf("await navigator.mediaDevices.getUserMedia"),
        "recording target must be captured before the asynchronous permission request");
    assert.match(recorder, /const recordedFor = audioRecordingContext \? \{ \.\.\.audioRecordingContext \} : null/);
    assert.match(recorder, /worthItChatAttachRecordedAudio\(file, recordedFor\)/);
    assert.match(chat, /window\.worthItChatAttachRecordedAudio = function \(file, targetContext = null\)/);
    assert.match(chat, /const targetKey = worthItChatDraftKey\(target\.userId, target\.conversationType, target\.conversationId\)/);
    assert.match(chat, /worthItChatDrafts\.set\(targetKey, \{ \.\.\.previous, mediaFile: file, mediaUrl: previewUrl, mediaType: "audio" \}\)/);
});

test("opening chat and cancelling a reply do not summon the mobile keyboard", () => {
    const toggleStart = chat.indexOf("window.toggleWorthItChat = async function");
    const toggleEnd = chat.indexOf("\nwindow.shareWorthItGroupInvite", toggleStart);
    const toggle = chat.slice(toggleStart, toggleEnd);
    assert.match(toggle, /if \(!window\.matchMedia\("\(max-width: 540px\)"\)\.matches\)\s*\{\s*\$\("worthItChatInput"\)\?\.focus/);
    const replyCloseStart = chat.indexOf('$("worthItChatReplyCloseBtn")?.addEventListener("click"');
    const replyCloseEnd = chat.indexOf('$("worthItChatHeaderNotifications")', replyCloseStart);
    const replyClose = chat.slice(replyCloseStart, replyCloseEnd);
    assert.match(replyClose, /clearWorthItChatReplyQuote\(\)/);
    assert.doesNotMatch(replyClose, /worthItChatInput.*focus|\.focus\(/);
    assert.match(chat, /window\.visualViewport\?\.addEventListener\("resize", updateWorthItChatVisualViewport\)/);
    assert.match(chat, /--worthit-chat-visible-height/);
    assert.match(polish, /\.is-visual-viewport-adjusted \.worth-it-chat-window/);
    assert.match(polish, /#worthItChatOverlay\.is-visual-viewport-adjusted \.worth-it-chat-compose-wrap\s*\{\s*flex: 0 0 auto !important;/);
});

test("emoji selections keep the unified media picker open unless a picker action closes it", () => {
    const insertStart = chat.indexOf("function insertWorthItChatEmoji(emoji)");
    const insertEnd = chat.indexOf("\nconst WORTH_IT_CHAT_GIF_LIBRARY", insertStart);
    const insert = chat.slice(insertStart, insertEnd);
    assert.doesNotMatch(insert, /closeWorthItChatPickers\(\)/);
    assert.match(insert, /textarea\.setRangeText\(emoji, start, end, "end"\)/);
    assert.match(chat, /function closeWorthItChatPickers\(\)\s*\{[\s\S]*?const picker = \$\("worthItChatMediaPicker"\);[\s\S]*?if \(picker\) picker\.hidden = true;/);
    assert.doesNotMatch(chat, /worthItChatPlusMenu|Only the transient attachment menu closes/);
    assert.match(chat, /\$\("worthItChatMediaClose"\)\?\.addEventListener\("click", closeWorthItChatPickers\)/);
});

test("Worth It AI closes only through explicit close actions, not backdrop clicks", () => {
    const start = ai.indexOf('$("aiChatOverlay")?.addEventListener');
    const end = ai.indexOf("document.addEventListener", start);
    const handler = ai.slice(start, end);
    assert.match(handler, /event\.target === event\.currentTarget/);
    assert.doesNotMatch(handler, /closeAIChat\(\)/);
    assert.match(ai, /function closeAIChat\(\)/);
    assert.match(html, /class="ai-chat-close" onclick="closeAIChat\(\)"/);
});

test("received message bubbles hug short text and wrap long text within the chat width", () => {
    assert.match(polish, /\.worth-it-chat-message:not\(\.is-mine\) \.worth-it-chat-bubble\s*\{[\s\S]*?align-self: flex-start;[\s\S]*?width: fit-content;/);
    assert.match(polish, /\.worth-it-chat-message:not\(\.is-mine\) \.worth-it-chat-bubble\s*\{[\s\S]*?width: fit-content;[\s\S]*?max-width: 100%;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: pre-wrap;/);
    assert.match(baseChatCss, /\.worth-it-chat-bubble\{[^}]*overflow-wrap:anywhere;white-space:pre-wrap/);
});

test("chat wallpaper has more small rotated doodles with per-conversation placement", () => {
    assert.match(calls, /for \(let i = 0; i < 64; i\+\+\)/);
    assert.match(calls, /Math\.floor\(i \/ 8\), col = i % 8/);
    assert.match(calls, /random\(\) \* 34 - 17/);
    assert.match(calls, /scale\(\.62\)/);
    assert.match(calls, /wallpaperSeed\(type \+ ":" \+ String\(contextValue\.conversationId/);
    assert.match(polish, /#worthItChatMessageSearchBtn\s*\{\s*font-size: 26px/);
    assert.match(polish, /\.worth-it-chat-reply-close\s*\{\s*transform: translateY\(-3px\)/);
    assert.match(polish, /\.worth-it-chat-reply-close\s*\{\s*transform: translateY\(-1px\)/);
});

test("the broken audioOnly reference is removed and asset caches point to the new builds", () => {
    assert.doesNotMatch(calls, /audioOnly/);
    assert.match(html, /chat-ui\.js\?v=worthit-gif-plants-20261029d/);
    assert.match(html, /chat-enhancements\.js\?v=worthit-chat-enhancements-20261029f/);
    assert.match(html, /chat-ux-polish\.css\?v=chat-ux-polish-20261029f/);
    assert.match(html, /ai-ui\.js\?v=worthit-ai-overlay-20261029b/);
    assert.match(polish, /#aiChatOverlay \.ai-chat-close\s*\{\s*transform: translateY\(2px\)/);
    assert.match(polish, /#aiChatNavBtn\.ai-chat-nav-btn\s*\{[\s\S]*?width: 42px/);
    assert.match(polish, /#aiChatOverlay \.ai-chat-close/);
});
