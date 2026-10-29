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
const workflow = read(".github/workflows/function-syntax-check.yml");

test("chat enhancement controls are present, accessible, and loaded separately", () => {
    for (const id of [
        "worthItChatMessageSearchBtn", "worthItChatSearchPanel", "worthItChatMessageSearchForm",
        "worthItChatMessageSearchInput", "worthItChatSearchResults", "worthItChatVoiceBtn",
        "worthItChatReplyPreview", "worthItChatReplyAuthor", "worthItChatReplyText",
        "worthItChatReplyCloseBtn", "worthItChatAudioCallBtn", "worthItChatVideoCallBtn",
        "worthItChatCallOverlay", "worthItChatCallAcceptBtn", "worthItChatCallRejectBtn",
        "worthItChatCallEndBtn", "worthItChatCallMuteBtn", "worthItChatCallCameraBtn",
        "worthItChatRemoteVideo", "worthItChatLocalVideo", "worthItChatRemoteAudio"
    ]) assert.match(html, new RegExp('id="' + id + '"'), "missing chat UI element " + id);
    assert.match(html, /chat-enhancements\.css\?v=worthit-chat-enhancements-20261029a/);
    assert.match(html, /chat-enhancements\.js\?v=worthit-chat-enhancements-20261029a/);
    assert.match(css, /WORTH IT Chat additions|Worth It Chat additions/);
    assert.match(css, /worth-it-chat-reply-preview/);
    assert.match(css, /worth-it-chat-call-overlay/);
    assert.match(css, /data:image\/svg\+xml/);
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
    assert.match(upload, /const objectPath = user\.id \+ "\/"/);
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
    assert.match(chat, /pendingReplyQuote = \{ author, text \}/);
    assert.match(chat, /renderWorthItChatReplyPreview\(\)/);
    assert.match(chat, /const replyPrefix = pendingReplyQuote \? "> "/);
    assert.match(chat, /clearWorthItChatReplyQuote\(\)/);
    assert.match(chat, /worth-it-chat-message-reply-quote/);
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
    assert.match(client, /new RTCPeerConnection\(RTC_CONFIG\)/);
    assert.match(client, /getUserMedia\(\{ audio: true, video: type === "video" \}\)/);
    assert.match(client, /p_action: "accept"/);
    assert.match(client, /p_action: "reject"/);
    assert.match(client, /p_action: "end"/);
    assert.match(client, /get_worth_it_incoming_chat_call/);
    assert.match(client, /send_worth_it_chat_call_signal/);
    assert.match(client, /if \(!ctx\?\.userId \|\| ctx\.conversationType !== "direct" \|\| !ctx\.isFriend \|\| !ctx\.conversationId\)/);
});

test("the JavaScript and SQL checks include the new chat feature modules", () => {
    assert.match(workflow, /chat-ui\.js chat-enhancements\.js/);
    assert.match(workflow, /supabase\/worth-it-chat-enhancements\.sql/);
});
