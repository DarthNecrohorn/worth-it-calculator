import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const chat = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const calls = readFileSync(new URL("../chat-enhancements.js", import.meta.url), "utf8");
const ai = readFileSync(new URL("../ai-ui.js", import.meta.url), "utf8");
const polish = readFileSync(new URL("../chat-ux-polish.css", import.meta.url), "utf8");
const enhancementCss = readFileSync(new URL("../chat-enhancements.css", import.meta.url), "utf8");
const baseChatCss = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("emoji and upload glyph alignment changes do not resize their button frames", () => {
    assert.ok(html.includes('id="worthItChatEmojiAction" data-worth-it-chat-open-media="emoji" aria-label="Emoji" title="Emoji" aria-controls="worthItChatMediaPicker" aria-expanded="false">😀</button>'));
    assert.match(chat, /button\.textContent = frames\[index\+\+\]/);
    assert.match(chat, /button\.textContent = "😀"/);
    assert.ok(html.includes('id="worthItChatPlusBtn" title="Upload a file" aria-label="Upload a file" aria-controls="worthItChatFileInput"><span class="worth-it-chat-upload-glyph" aria-hidden="true">＋</span></button>'));
    assert.match(polish, /#worthItChatEmojiAction\s*\{\s*font-size: 22px !important;\s*line-height: 1 !important;/);
    assert.match(polish, /@media \(max-width: 540px\)\s*\{\s*#worthItChatEmojiAction\s*\{\s*font-size: 20px !important;/);
    assert.match(polish, /@media \(max-width: 350px\)\s*\{\s*#worthItChatEmojiAction\s*\{\s*font-size: 18px !important;/);
    assert.match(polish, /\.worth-it-chat-upload-glyph\s*\{\s*position: relative !important;\s*top: -1px !important;\s*display: inline-block !important;/);
    assert.match(polish, /\.worth-it-chat-compose #worthItChatPlusBtn\.worth-it-chat-attach-btn\s*\{[\s\S]*?width: 36px !important;[\s\S]*?height: 36px !important;/);
    assert.match(polish, /@media \(max-width: 540px\)[\s\S]*?\.worth-it-chat-compose #worthItChatPlusBtn\.worth-it-chat-attach-btn\s*\{[\s\S]*?width: 32px !important;[\s\S]*?height: 34px !important;/);
});
 
test("each conversation has independent text, reply, and attachment draft state", () => {
    assert.match(chat, /const worthItChatDrafts = new Map\(\)/);
    assert.match(chat, /function worthItChatDraftKey\(userId = chatUser\?\.id, type = activeConversationType, id = activeConversationId\)/);
    assert.match(chat, /function saveActiveWorthItChatDraft\(\)/);
    assert.match(chat, /function restoreWorthItChatDraft\(key\)/);
    assert.match(chat, /const nextType = type \|\| "global";[\s\S]*?const nextId = id \|\| null;[\s\S]*?saveActiveWorthItChatDraft\(\);\s*closeWorthItChatPickers\(\);\s*activeConversationId = nextId;\s*activeConversationType = nextType;/);
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


test("message profile links target the avatar and display name while timestamps stay readable", () => {
    const avatarStart = chat.indexOf("function makeWorthItChatMessageAvatar(message)");
    const rowStart = chat.indexOf("function createWorthItChatMessageRow(message)");
    const avatarHelper = chat.slice(avatarStart, rowStart);
    const render = chat.slice(rowStart, chat.indexOf("\nfunction updateWorthItChatTravelPresentButton()", rowStart));
    assert.ok(avatarHelper.includes('makeChatProfileLink('));
    assert.ok(avatarHelper.includes('"worth-it-chat-message-avatar-link"'));
    assert.ok(avatarHelper.includes("indicator.remove()"));
    assert.ok(avatarHelper.includes("wrapper.appendChild(profileLink)"));
    assert.ok(avatarHelper.includes("if (indicator) wrapper.appendChild(indicator)"));
    assert.ok(render.includes("row.appendChild(makeWorthItChatMessageAvatar(message));"));
    assert.ok(render.includes('makeChatProfileLink(message, "worth-it-chat-message-name"'));
    assert.ok(polish.includes("width: fit-content !important;"));
    assert.ok(polish.includes("align-self: flex-start !important;"));
    assert.ok(polish.includes("padding: 0 !important;"));
    assert.ok(polish.includes("font-size: 11px !important;"));
    assert.ok(polish.includes("color: #475569 !important;"));
});

test("returning from a profile restores the same private conversation id and resumes polling", () => {
    const start = chat.indexOf("async function routeWorthItChatFromLocation()");
    const end = chat.indexOf("\nfunction ", start + 10);
    const router = chat.slice(start, end);
    assert.ok(router.includes("profileReturnConversation && currentBrowserLocation() === profileReturnConversation.path"));
    assert.ok(router.includes("startWorthItChatPolling();"));
    assert.ok(router.includes("await refreshWorthItChatData();"));
    assert.ok(router.includes("|| previous.person || null"));
    assert.ok(router.includes('await activateConversation(previous.id, "direct"'));
    const activateStart = chat.indexOf("async function activateConversation(id, type, title, person, inviteToken)");
    const activateEnd = chat.indexOf("\nwindow.showWorthItChatSidebar", activateStart);
    const activate = chat.slice(activateStart, activateEnd);
    assert.ok(activate.includes("await syncWorthItChatRealtimeChannel();"));
    assert.ok(activate.includes("await loadWorthItChatMessages(true, true);"));
    const foregroundStart = chat.indexOf("function refreshWorthItChatOnForeground()");
    const foreground = chat.slice(foregroundStart, foregroundStart + 900);
    assert.ok(foreground.includes("void loadWorthItChatMessages(false, true)"));
});

test("travel back to present hover stays centered and scales without directional movement", () => {
    assert.match(polish, /button\.worth-it-chat-travel-present:not\(\[disabled\]\):hover,\s*button\.worth-it-chat-travel-present:not\(\[disabled\]\):focus-visible\s*\{\s*transform:\s*translateX\(-50%\)\s*scale\(1\.045\);/);
    assert.match(polish, /button\.worth-it-chat-travel-present:not\(\[disabled\]\):active\s*\{\s*transform:\s*translateX\(-50%\)\s*scale\(\.96\);/);
    assert.doesNotMatch(polish, /\.worth-it-chat-travel-present:hover span|\.worth-it-chat-travel-present:focus-visible span/);
    assert.doesNotMatch(polish, /transform:\s*translateX\(-50%\)\s+translateY\(-3px\)\s+scale\(1\.025\)/);
});

test("private and group deep links do not render Global Chat while auth is resolving", () => {
     assert.match(chat, /if \(!chatAuthResolutionComplete\)\s*\{[\s\S]*?host\.replaceChildren\(\);[\s\S]*?host\.setAttribute\("aria-busy", "true"\)/);
     assert.match(chat, /routeHost\?\.removeAttribute\("aria-busy"\)/);
   });
 
 test("message search hides the jump-to-present button until the search panel closes", () => {
    assert.match(chat, /const isMessageSearchOpen = Boolean\(searchPanel && !searchPanel\.hidden\)/);
    assert.match(chat, /!isMessageSearchOpen &&/);
    assert.match(chat, /document\.addEventListener\("worthitchatsearchvisibilitychange", updateWorthItChatTravelPresentButton\)/);
    assert.match(calls, /document\.dispatchEvent\(new Event\("worthitchatsearchvisibilitychange"\)\)/);
});

test("chat wallpaper uses collision-safe random placement, varied sizes and scattered accents", () => {
    assert.match(calls, /const CHAT_WALLPAPER_EXTRA_MOTIFS = \[/);
    assert.match(calls, /CHAT_WALLPAPER_ALL_MOTIFS = CHAT_WALLPAPER_MOTIFS\.concat\(CHAT_WALLPAPER_EXTRA_MOTIFS\)/);
    assert.match(calls, /function makeConversationWallpaper\(contextValue, theme, requestedWidth\)/);
    assert.match(calls, /const canvasWidth = Math\.max\(600, Math\.min\(2400/);
    assert.match(calls, /const canvasHeight = Math\.round\(canvasWidth \* 1\.5\)/);
    assert.match(calls, /const scales = Array\.from/);
    assert.match(calls, /scales\[0\] = \.98 \+ random\(\) \* \.13/);
    assert.match(calls, /scales\[1\] = \.84 \+ random\(\) \* \.12/);
    assert.match(calls, /function collides\(candidate\)/);
    assert.match(calls, /candidate\.radius \+ existing\.radius \+ requiredGap/);
    assert.match(calls, /const usedMotifs = new Set\(\)/);
    assert.match(calls, /const targetCount = Math\.max\(14, Math\.min\(34, Math\.round\(canvasWidth \/ 36\)\)\)/);
    assert.match(calls, /const targetAccents = Math\.min\(\s*CHAT_WALLPAPER_ALL_MOTIFS\.length - targetCount,\s*Math\.max\(68, Math\.round\(canvasWidth \/ 7\.5\)\)\s*\)/);
    assert.match(calls, /const scale = \.14 \+ random\(\) \* \.18/);
    assert.match(calls, /data-wallpaper-doodle="1"/);
    assert.match(calls, /data-wallpaper-accent="1"/);
    assert.match(calls, /candidate\.radius \+ existing\.radius \+ requiredGap/);
    assert.match(calls, /candidate\.radius \+ existing\.radius \+ requiredGap/);
    assert.match(calls, /const CHAT_WALLPAPER_GEOMETRIES = \[/);
    assert.match(calls, /const smallOpacity = theme === "light" \? "\.52" : "\.43"/);
    assert.match(calls, /wallpaperThemeObserver\.observe/);
    assert.match(calls, /wallpaperSurfaceObserver\.observe\(wallpaperSurface\)/);
    assert.match(calls, /surface\.style\.setProperty\("--worthit-chat-wallpaper-size"/);
    assert.match(enhancementCss, /var\(--worthit-chat-wallpaper-size,900px 1350px\)!important/);
    assert.match(enhancementCss, /var\(--worthit-chat-wallpaper-size,600px 900px\)!important/);
    assert.match(enhancementCss, /background-repeat:no-repeat,repeat-y!important/);
    assert.match(enhancementCss, /background-attachment:scroll,scroll!important;/);
    assert.doesNotMatch(enhancementCss, /background-attachment:\s*scroll\s*,\s*local/);
    assert.match(polish, /#worthItChatMessageSearchBtn\s*\{\s*font-size: 26px/);
    assert.ok(html.includes('id="worthItChatMessageSearchBtn" title="Search messages in this conversation" aria-label="Search messages" aria-expanded="false" aria-controls="worthItChatSearchPanel"><span class="worth-it-chat-search-glyph" aria-hidden="true">⌕</span></button>'));
    assert.match(polish, /\.worth-it-chat-search-glyph\s*\{\s*position: relative !important;\s*top: -2px !important;\s*display: inline-block !important;/);
    assert.match(polish, /\.worth-it-chat-reply-close\s*\{\s*transform: translateY\(-3px\)/);
    assert.match(polish, /\.worth-it-chat-reply-close\s*\{\s*transform: translateY\(-1px\)/);
});

test("the broken audioOnly reference is removed and asset caches point to the new builds", () => {
    assert.doesNotMatch(calls, /audioOnly/);
    assert.match(html, /chat-ui\.js\?v=chat-private-media-signed-access-20261030a/);
    assert.match(html, /chat-enhancements\.js\?v=chat-wallpaper-collision-packed-20261030a/);
    assert.match(html, /chat-enhancements\.css\?v=chat-safety-note-wallpaper-density-20261029a/);
    assert.match(enhancementCss, /background-repeat:no-repeat,repeat-y!important/);
    assert.match(html, /chat-ux-polish\.css\?v=chat-message-profile-hit-targets-20261029a/);
    assert.match(html, /ai-ui\.js\?v=worthit-ai-overlay-20261029b/);
    assert.match(polish, /#aiChatOverlay \.ai-chat-close\s*\{\s*transform: translateY\(2px\)/);
    assert.match(polish, /#aiChatNavBtn\.ai-chat-nav-btn\s*\{[\s\S]*?width: 42px/);
    assert.match(polish, /#aiChatOverlay \.ai-chat-close/);
});


test("refreshing a conversation keeps its existing message elements until fresh rows arrive", () => {
    const activate = chat.match(/async function activateConversation\(id, type, title, person, inviteToken\) \{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(activate, /const sameConversation = activeConversationType === nextType/);
    assert.match(activate, /if \(!sameConversation\) \{\s*chatMessages = worthItChatMessageCache\.has\(nextKey\)/);
    assert.match(activate, /renderMessages\(\);\s*await syncWorthItChatRealtimeChannel\(\);\s*await loadWorthItChatMessages\(true, true\)/);
    const loader = chat.match(/async function loadWorthItChatMessages\(scrollToBottom, force = false\) \{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(loader, /if \(result\.error\) \{ setStatus\(rpcError\(result\.error\), true\); return; \}/);
    assert.match(loader, /cacheWorthItChatMessages\(worthItChatMessageCacheKey\(requestUserId, conversationType, conversationId\), rows\)/);
});
