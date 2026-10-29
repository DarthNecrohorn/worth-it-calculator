import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const chat = read("chat-ui.js");
const client = read("chat-enhancements.js");
const css = read("chat-enhancements.css");
const style = read("style.css");
const audioApi = read("functions/api/chat-audio.js");
const mediaApi = read("functions/api/chat-media.js");
const sql = read("supabase/worth-it-chat-enhancements.sql");
const callReliabilitySql = read("supabase/worth-it-chat-call-reliability.sql");
const workflow = read(".github/workflows/function-syntax-check.yml");
const app = read("app.js");
const usernameAvailability = read("functions/api/auth-username-availability.js");
const accountUsernameApi = read("functions/api/account-username.js");
const settings = read("settings.js");

test("chat enhancement controls are present, accessible, and loaded separately", () => {
    for (const id of [
        "worthItChatMessageSearchBtn", "worthItChatSearchPanel", "worthItChatMessageSearchForm",
        "worthItChatMessageSearchInput", "worthItChatSearchResults", "worthItChatSafetyNote", "worthItChatSafetyNoteDismissBtn", "worthItChatVoiceBtn",
        "worthItChatReplyPreview", "worthItChatReplyAuthor", "worthItChatReplyText",
        "worthItChatReplyCloseBtn", "worthItChatAudioCallBtn", "worthItChatVideoCallBtn",
        "worthItChatCallOverlay", "worthItChatCallAcceptBtn", "worthItChatCallRejectBtn",
        "worthItChatCallEndBtn", "worthItChatCallMuteBtn", "worthItChatCallMuteLabel",
        "worthItChatCallSpeakerBtn", "worthItChatCallCameraBtn",
        "worthItChatRemoteVideo", "worthItChatLocalVideo", "worthItChatRemoteAudio"
    ]) assert.match(html, new RegExp('id="' + id + '"'), "missing chat UI element " + id);
    assert.match(html, /chat-enhancements\.css\?v=chat-safety-note-wallpaper-density-20261029a/);
    assert.match(html, /chat-enhancements\.js\?v=chat-wallpaper-more-dense-20261029a/);
    assert.match(css, /WORTH IT Chat additions|Worth It Chat additions/);
    assert.match(css, /worth-it-chat-reply-preview/);
    assert.match(css, /worth-it-chat-call-overlay/);
    assert.match(css, /data:image\/svg\+xml/);
});


test("the chat safety reminder can be dismissed for 24 hours and returns automatically", () => {
    assert.match(html, /id="worthItChatSafetyNote" role="note" hidden/);
    assert.match(html, /id="worthItChatSafetyNoteDismissBtn" aria-label="Dismiss chat safety reminder" title="Hide for 24 hours"/);
    assert.match(client, /function setupDailyChatSafetyNotice\(\)/);
    assert.match(client, /const storageKey = "worthItChatSafetyNoteDismissedAt"/);
    assert.match(client, /const dayMs = 24 \* 60 \* 60 \* 1000/);
    assert.match(client, /window\.setTimeout\(syncVisibility, dayMs \+ 25\)/);
    assert.match(css, /\.worth-it-chat-safety-note-close/);
    assert.match(client, /window\.addEventListener\("storage"/);
});

test("the jump-to-present control is hidden while message search is active", () => {
    assert.match(chat, /const isMessageSearchOpen = Boolean\(searchPanel && !searchPanel\.hidden\)/);
    assert.match(chat, /!isMessageSearchOpen &&/);
    assert.match(chat, /document\.addEventListener\("worthitchatsearchvisibilitychange", updateWorthItChatTravelPresentButton\)/);
    assert.match(client, /document\.dispatchEvent\(new Event\("worthitchatsearchvisibilitychange"\)\)/);
});

test("voice recording errors preserve the recording target before cleanup clears it", () => {
    assert.match(client, /function isCurrentVoiceRecordingContext\(recordedFor\)/);
    const errorHandler = client.match(/audioRecorder\.onerror = \(\) => \{([\s\S]*?)\n        \};/)?.[1] || "";
    assert.match(errorHandler, /const failedFor = audioRecordingContext \? \{ \.\.\.audioRecordingContext \} : null/);
    assert.ok(errorHandler.indexOf("const failedFor") < errorHandler.indexOf("stopVoiceRecordingResources()"));
    assert.match(errorHandler, /isCurrentVoiceRecordingContext\(failedFor\)/);
    const catchHandler = client.match(/\} catch \(error\) \{([\s\S]*?)\n    \}\n\}\nfunction stopVoiceRecording/)?.[1] || "";
    assert.match(catchHandler, /const failedFor = audioRecordingContext \? \{ \.\.\.audioRecordingContext \} : null/);
    assert.match(catchHandler, /isCurrentVoiceRecordingContext\(failedFor\)/);
});

test("voice recordings use a private audio bucket and short-lived authenticated URLs", () => {
    assert.match(client, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
    assert.match(client, /new MediaRecorder\(/);
    assert.match(client, /window\.worthItChatPlayVoiceMessage = playPrivateVoiceMessage/);
    assert.match(chat, /fetch\(type === "audio" \? "\/api\/chat-audio" : "\/api\/chat-media"/);
    assert.match(chat, /worthit-audio:/);
    assert.match(audioApi, /const AUDIO_BUCKET = "worth-it-chat-audio"/);
    assert.match(audioApi, /SIGNED_URL_SECONDS = 900/);
    assert.match(audioApi, /can_access_worth_it_chat_media/);
    assert.match(audioApi, /can_access_worth_it_chat_audio_object/);
    assert.match(audioApi, /can_delete_worth_it_chat_audio_object/);
    assert.match(audioApi, /verifyUser\(config, token\)/);
    assert.match(audioApi, /Cache-Control": "no-store"/);
    assert.doesNotMatch(audioApi, /object\/public\/worth-it-chat-audio/);
    assert.match(sql, /'worth-it-chat-audio',[\s\S]*?false,[\s\S]*?10485760/);
    assert.match(sql, /check \(media_type is null or media_type in \('image','gif','video','audio'\)\)/);
    assert.match(sql, /worthit-audio:' \|\| target_id::text \|\| ':' \|\| actor_id::text/);
    assert.match(mediaApi, /const BUCKET = "worth-it-chat-media"/);
});

test("voice uploads are checked against chat membership and never stored in the public media bucket", () => {
    const upload = audioApi.slice(audioApi.indexOf('if (request.method === "POST")'), audioApi.indexOf("conversationId = String(url.searchParams"));
    assert.match(upload, /authorizeRpc\(config, token, "can_access_worth_it_chat_media"/);
    assert.match(upload, /AUDIO_BUCKET/);
    assert.match(upload, /AUDIO_LIMIT/);
    assert.match(upload, /objectPath = user\.id \+ "\/" \+ Date\.now\(\) \+ "-" \+ crypto\.randomUUID\(\)/);
    assert.match(sql, /create or replace function public\.can_access_worth_it_chat_media/);
    assert.match(sql, /if kind = 'direct' then[\s\S]*?worth_it_friends[\s\S]*?user_low_id[\s\S]*?user_high_id/);
});

test("message search is limited to the selected conversation and respects hidden/deleted history", () => {
    assert.match(client, /rpc\("search_worth_it_chat_messages"/);
    assert.match(client, /p_conversation_id: ctx\.conversationId/);
    assert.match(client, /worthItChatShowSearchResult/);
    assert.match(chat, /window\.worthItChatShowSearchResult = function/);
    assert.match(sql, /create or replace function public\.search_worth_it_chat_messages/);
    const searchFn = sql.slice(sql.indexOf("create or replace function public.search_worth_it_chat_messages"));
    assert.match(searchFn, /p_conversation_id uuid/);
    assert.match(searchFn, /p_query text/);
    assert.match(searchFn, /m\.conversation_id=target_id/);
    assert.match(searchFn, /hidden\.message_id is null and m\.deleted_at is null/);
    assert.match(searchFn, /worth_it_chat_history_clears/);
    assert.match(searchFn, /char_length\(term\) < 2 or char_length\(term\) > 100/);
});

test("mobile swipe opens a rich reply preview and the reply is stored with the outgoing message", () => {
    assert.match(client, /function setupSwipeReply\(\)/);
    assert.match(client, /Math\.abs\(dx\) >= 72/);
    assert.match(client, /window\.worthItChatQuoteById/);
    assert.match(chat, /pendingReplyQuote = \{ author, text: compact\.slice\(0, 160\)/);
    assert.match(chat, /renderWorthItChatReplyPreview\(\)/);
    assert.match(chat, /const replyPrefix = draftReplyQuote \? "> "/);
    assert.match(chat, /p_conversation_id: sendConversationType === "global" \? null : sendConversationId/);
    assert.match(chat, /clearWorthItChatReplyQuote\(\)/);
    assert.match(chat, /worth-it-chat-message-reply-quote/);
    assert.match(chat, /audio\.addEventListener\("ended"/);
    assert.match(chat, /audio\.addEventListener\("error"/);
    assert.match(css, /touch-action:pan-y/);
    assert.match(css, /worth-it-chat-reply-accent/);
    assert.match(css, /worth-it-chat-message-reply-quote/);
});

test("audio/video calls are backend-enforced friend-only one-to-one calls", () => {
    for (const rpcName of [
        "start_worth_it_chat_call", "get_worth_it_incoming_chat_call", "get_worth_it_chat_call_state",
        "respond_worth_it_chat_call", "send_worth_it_chat_call_signal"
    ]) assert.ok(sql.includes("function public." + rpcName), "missing call RPC " + rpcName);
    assert.match(sql, /if kind <> 'direct'/);
    assert.match(sql, /kind <> 'direct'/);
    assert.match(sql, /can_access_worth_it_chat_media\(p_conversation_id\)/);
    assert.match(sql, /create table if not exists public\.worth_it_chat_calls/);
    assert.match(sql, /create table if not exists public\.worth_it_chat_call_signals/);
    assert.match(sql, /call_type text not null check \(call_type in \('audio','video'\)\)/);
    assert.match(sql, /unique index if not exists worth_it_chat_calls_one_active_per_conversation_idx/);
    assert.match(sql, /worth-it-user-call:/);
    assert.match(client, /new RTCPeerConnection\(\{ iceServers: Array\.isArray\(iceServers\)/);
    assert.match(client, /async function getCallIceConfig\(conversationId\)/);
    assert.match(client, /fetch\("\/api\/chat-call-ice\?conversationId=/);
    assert.match(client, /relayAvailable: iceConfig\.relayAvailable/);
    assert.match(client, /async function acquireCallMedia\(type\)/);
    assert.match(client, /getUserMedia\(\{ audio: true, video: true \}\)/);
    assert.match(client, /getUserMedia\(\{ audio: true, video: false \}\)/);
    assert.match(client, /addTransceiver\("video", \{ direction: "sendrecv" \}\)/);
    assert.match(client, /Connection briefly interrupted/);
    assert.match(client, /direct media connection failed/);
    assert.match(client, /A TURN relay could not be loaded for this call/);
    assert.match(client, /state\.ended_by_user_id/);
    assert.match(client, /state\.ended_by_name/);
    assert.match(client, /displayName \+ " has ended the call\."/);
    assert.match(client, /endLocalCall\("You ended the call\."\);\s*if \(callId\) void closeCallOnServer\("end", callId\)/);
    assert.match(client, /callPeer\.onicecandidateerror = null/);
    assert.match(client, /try \{ localVideo\.pause\(\); \} catch \(_\) \{\} localVideo\.srcObject = null/);
    assert.match(client, /if \(document\.hidden \|\| incomingPollBusy \|\| activeCall \|\| callSetupInProgress\) return/);
    assert.match(client, /cameraStream\.getTracks\(\)\.forEach\(item => item\.stop\(\)\)/);
    assert.match(client, /incomingPollTimer = window\.setInterval/);
    assert.match(client, /callOverlayCloseTimer = window\.setTimeout/);
    assert.doesNotMatch(client, /incomingCallTimer/);
    assert.match(client, /p_action: "accept"/);
    assert.match(client, /closeCallOnServer\("reject", callId\)/);
    assert.match(client, /async function endCall\(\)\s*\{\s*\/\/ Release camera\/microphone immediately, even if Supabase signaling is slow\./);
    assert.match(client, /get_worth_it_incoming_chat_call/);
    assert.match(client, /send_worth_it_chat_call_signal/);
    assert.match(client, /if \(!ctx\?\.userId \|\| ctx\.conversationType !== "direct" \|\| !ctx\.isFriend \|\| !ctx\.conversationId\)/);
    assert.match(client, /const INCOMING_TICK_MS = 2000/);
    assert.match(client, /await client\.auth\.getSession\(\)/);
    assert.match(client, /const CALL_TICK_MS = 1200/);
    assert.match(client, /if \(document\.hidden \|\| incomingPollBusy/);
    assert.match(sql, /worth_it_chat_calls_caller_active_idx/);
    assert.match(sql, /caller_user_id = actor_id or callee_user_id = actor_id/);
});

test("the JavaScript and SQL checks include the new chat feature modules", () => {
    assert.match(workflow, /chat-ui\.js chat-enhancements\.js/);
    assert.match(workflow, /supabase\/worth-it-chat-enhancements\.sql/);
});

 
test("chat follow-up fixes keep search prefix-only, keep wallpaper stationary while messages scroll, and repair closing focus", () => {
    assert.ok(sql.includes("left(lower(regexp_replace(ltrim(m.body)"));
    assert.ok(sql.includes("normalized_term"));
    assert.match(sql, /notify pgrst, 'reload schema'/i);
    assert.ok(client.includes("statusNode.hidden = !query"));
    assert.ok(client.includes("p_limit: 100"));
    assert.ok(css.includes("background-attachment:scroll,scroll,scroll;"));
    assert.ok(css.includes("background-attachment:scroll,scroll!important;"));
    assert.doesNotMatch(css, /background-attachment:\s*scroll\s*,\s*local/);
    assert.match(css, /\.worth-it-chat-search-results\{[\s\S]*?overflow-y:auto/);
    assert.match(css, /max-height:min\(260px,32vh\)/);
    assert.match(css, /max-height:min\(145px,22dvh\)/);
    assert.match(css, /\.worth-it-chat-search-panel\{\s*position:relative!important/);
    assert.ok(css.includes(".worth-it-chat-messages::before{content:none!important"));
    assert.ok(chat.includes("overlay.contains(document.activeElement)"));
    assert.ok(chat.includes("button.focus({ preventScroll: true })"));
});


test("chat images open in a responsive full-screen viewer and media bubbles do not stretch", () => {
     assert.match(chat, /function openWorthItChatImageLightbox\(src, alt\)/);
     assert.match(chat, /img\.addEventListener\("click", \(\) => openWorthItChatImageLightbox\(message\.media_url, img\.alt\)\)/);
     assert.match(chat, /function handleWorthItChatLightboxKeydown\(event\)/);
     assert.match(style, /\.worth-it-chat-image-lightbox-close/);
     assert.match(style, /\.worth-it-chat-bubble:has\(\.worth-it-chat-media\)\{width:fit-content!important/);
   });
 
 test("chat wallpaper scatters unique motifs with visibly varied sizes", () => {
    assert.match(client, /const CHAT_WALLPAPER_MOTIFS = \[/);
    assert.match(client, /function makeConversationWallpaper\(contextValue, theme, requestedWidth\)/);
    assert.match(client, /function applyChatWallpaper\(contextValue\)/);
    assert.match(client, /const canvasWidth = Math\.max\(600, Math\.min\(2400/);
    assert.match(client, /const canvasHeight = Math\.round\(canvasWidth \* 1\.5\)/);
    assert.match(client, /const targetCount = Math\.max\(10/);
    assert.match(client, /const scales = Array\.from/);
    assert.match(client, /scales\[0\] = \.56 \+ random\(\) \* \.07/);
    assert.match(client, /scales\[1\] = 1\.02 \+ random\(\) \* \.11/);
    assert.match(client, /Math\.hypot\(x - existing\.x, y - existing\.y\) < radius \+ existing\.radius \+ 12/);
    assert.match(client, /const x = margin \+ random\(\) \* Math\.max\(0, canvasWidth - margin \* 2\)/);
    assert.match(client, /const y = margin \+ random\(\) \* Math\.max\(0, canvasHeight - margin \* 2\)/);
    assert.match(client, /const usedMotifs = new Set\(\)/);
    assert.match(client, /data-wallpaper-doodle="1"/);
    assert.match(client, /data-wallpaper-accent="1"/);
    assert.match(client, /CHAT_WALLPAPER_ALL_MOTIFS = CHAT_WALLPAPER_MOTIFS\.concat\(CHAT_WALLPAPER_EXTRA_MOTIFS\)/);
    assert.match(client, /const CHAT_WALLPAPER_GEOMETRIES = \[/);
    assert.match(client, /CHAT_WALLPAPER_LIGHT_PALETTE/);
    assert.match(client, /wallpaperSeed\(key\)/);
    assert.match(client, /wallpaperThemeObserver\.observe/);
    assert.match(client, /wallpaperSurfaceObserver\.observe\(wallpaperSurface\)/);
    assert.match(client, /surface\.style\.setProperty\("--worthit-chat-wallpaper-size"/);
    assert.match(css, /var\(--worthit-chat-wallpaper-image,none\)!important/);
    assert.match(css, /var\(--worthit-chat-wallpaper-size,900px 1350px\)!important/);
    assert.match(css, /background-repeat:no-repeat,repeat-y!important/);
    assert.match(css, /html\[data-theme="light"\] \.worth-it-chat-messages/);
    assert.match(css, /\.worth-it-chat-messages::before,\.worth-it-chat-messages::after\{display:none!important/);
    assert.match(html, /id="worthItChatAudioCallBtn"[^>]*><svg class="worth-it-chat-header-icon"/);
    assert.match(html, /id="worthItChatVideoCallBtn"[^>]*><svg class="worth-it-chat-header-icon"/);
    assert.match(html, /id="worthItChatVoiceBtn"[^>]*><svg class="worth-it-chat-voice-icon"/);
    assert.match(html, /id="worthItChatCallMuteLabel"/);
    assert.match(client, /button\.setAttribute\("aria-pressed", String\(recording\)\)/);
    assert.doesNotMatch(client, /button\.textContent = recording \? "■" : "🎙"/);
});

test("chat doodles and accents stay separated, adapt to both themes and retain visible icon strokes", () => {
    assert.match(client, /const CHAT_WALLPAPER_MOTIFS = \[/);
    assert.match(client, /const CHAT_WALLPAPER_DARK_PALETTE =/);
    assert.match(client, /const CHAT_WALLPAPER_LIGHT_PALETTE =/);
    assert.match(client, /const angle = Math\.floor\(random\(\) \* 360\)/);
    assert.match(client, /const scaleX = random\(\) < \.5 \? -point\.scale : point\.scale/);
    assert.match(client, /const scaleY = random\(\) < \.5 \? -point\.scale : point\.scale/);
    assert.match(client, /const overlaps = placements\.some/);
    assert.match(client, /radius \+ doodle\.radius \+ 12/);
    assert.match(client, /radius \+ existing\.radius \+ 8/);
    assert.match(client, /const targetAccents = Math\.max\(40, Math\.min\(84/);
    assert.match(client, /const scale = \.18 \+ random\(\) \* \.22/);
    assert.match(client, /const opacity = theme === "light" \? "\.44" : "\.36"/);
    assert.match(client, /const smallOpacity = theme === "light" \? "\.52" : "\.43"/);
    assert.match(css, /var\(--worthit-chat-wallpaper-image,none\)!important/);
    assert.match(css, /html\[data-theme="light"\] \.worth-it-chat-messages/);
    assert.match(css, /var\(--worthit-chat-wallpaper-size,600px 900px\)!important/);
    assert.doesNotMatch(css, /background-size:auto,740px 1110px!important/);
    assert.match(css, /background-repeat:no-repeat,repeat-y!important/);
    assert.match(css, /\.worth-it-chat-messages::before,\.worth-it-chat-messages::after\{display:none!important/);
    assert.match(css, /#worthItChatAudioCallBtn>.worth-it-chat-header-icon[\s\S]*?stroke:#c4b5fd!important/);
    assert.match(css, /#worthItChatVoiceBtn>.worth-it-chat-voice-icon[\s\S]*?fill:none!important;stroke:#c4b5fd!important/);
});

test("both call types can boost incoming audio through a GainNode and reset it on hangup", () => {
    assert.match(html, /id="worthItChatCallSpeakerBtn"/);
    assert.match(client, /function ensureRemoteAudioProcessor\(\)/);
    assert.match(client, /remoteAudioContext\.createGain\(\)/);
    assert.match(client, /remoteAudioGain\.gain\.setTargetAtTime\(targetGain/);
    assert.match(client, /function routeRemoteCallAudio\(stream\)/);
    assert.match(client, /routeRemoteCallAudio\(remoteStream\)/);
    assert.match(client, /video\.muted = true/);
    assert.match(client, /function resetRemoteAudioProcessor\(\)/);
    assert.match(client, /worthItChatCallSpeakerBtn.*addEventListener\("click", toggleSpeakerBoost\)/);
    assert.match(client, /resetRemoteAudioProcessor\(\)/);
    assert.match(client, /remoteAudio\.muted = false; remoteAudio\.volume = 1/);
});


test("signup and username changes require a leading English letter", () => {
    const usernameRule = /^(?=.{3,20}$)[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)?$/;
    for (const name of ["Alex", "Alex1", "Alex_Name", "M123"]) assert.equal(usernameRule.test(name), true, name);
    for (const name of ["1Alex", "_Alex", "12_User", "Alex_", "Alex__Name", "A"]) assert.equal(usernameRule.test(name), false, name);
    assert.ok(app.includes("const signupUsernamePattern = /^(?=.{3,20}$)[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)?$/;"));
    assert.ok(usernameAvailability.includes("const USERNAME_PATTERN = /^(?=.{3,20}$)[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)?$/;"));
    assert.ok(accountUsernameApi.includes("const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)?$/;"));
    assert.ok(settings.includes("Username must start with a letter"));
});

test("incoming calls keep polling separately and work outside the open chat", () => {
    assert.match(client, /const INCOMING_TICK_MS = 2000/);
    assert.match(client, /const sessionResult = await client\.auth\.getSession\(\)/);
    assert.match(client, /incomingPollTimer = window\.setInterval/);
    assert.match(client, /callOverlayCloseTimer = window\.setTimeout/);
    assert.doesNotMatch(client, /incomingCallTimer/);
    assert.match(client, /const CALL_TICK_MS = 1200/);
    assert.match(client, /Connection briefly interrupted/);
    assert.match(client, /direct media connection failed/);
});

test("video calls fall back to audio without a camera and allow camera activation later", () => {
    assert.match(client, /async function acquireCallMedia\(type\)/);
    assert.match(client, /getUserMedia\(\{ audio: true, video: false \}\)/);
    assert.match(client, /addTransceiver\("video", \{ direction: "sendrecv" \}\)/);
    assert.match(client, /async function toggleCamera\(\)/);
    assert.match(client, /sender\.replaceTrack\(track\)/);
    assert.match(client, /Camera is unavailable or permission was denied/);
});

test("mute button uses a vector icon and a text label on every desktop/browser", () => {
    assert.match(html, /id="worthItChatCallMuteBtn"[^>]*><svg class="worth-it-chat-control-icon worth-it-chat-mic-icon"/);
    assert.match(html, /id="worthItChatCallMuteLabel">Mute/);
    assert.match(client, /button\.classList\.toggle\("is-muted", audioMuted\)/);
    assert.doesNotMatch(client, /button\.textContent = audioMuted \? "🔇 Unmute" : "🎙 Mute"/);
});


test("call reliability migration returns the display name of the participant who hangs up", () => {
    assert.match(callReliabilitySql, /add column if not exists ended_by_user_id uuid references auth\.users\(id\)/);
    assert.match(callReliabilitySql, /ended_by_user_id=actor_id/);
    assert.match(callReliabilitySql, /'ended_by_user_id',call_row\.ended_by_user_id/);
    assert.match(callReliabilitySql, /'ended_by_name'/);
    assert.match(callReliabilitySql, /get_worth_it_chat_call_state\(uuid,bigint\)/);
});
