import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../chat-realtime.css", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/worth-it-chat-realtime.sql", import.meta.url), "utf8");

test("chat message inserts, updates and deletes broadcast only IDs on a private topic", () => {
    assert.match(migration, /create or replace function public\.broadcast_worth_it_chat_message_change\(\)/);
    assert.match(migration, /perform realtime\.send\(/);
    assert.match(migration, /'message_changed'/);
    assert.match(migration, /'worthit-chat:' \|\| target_conversation_id::text/);
    assert.match(migration, /after insert or update or delete[\s\S]*?on public\.worth_it_chat_messages/);
    assert.match(migration, /'conversation_id', target_conversation_id::text[\s\S]*?'message_id', target_message_id[\s\S]*?'operation', TG_OP/);
    assert.match(migration, /true\s*\n\s*\);/);
    assert.doesNotMatch(migration, /jsonb_build_object\([\s\S]{0,250}'body'/);
});
test("Realtime topic authorization restricts private chats to their existing members", () => {
    assert.match(migration, /actor_id uuid := auth\.uid\(\)/);
    assert.match(migration, /worthit-chat:00000000-0000-4000-8000-000000000001/);
    assert.match(migration, /member\.conversation_id = target_id[\s\S]*?member\.user_id = actor_id/);
    assert.match(migration, /revoke all on function public\.worth_it_chat_realtime_topic_authorized\(text\) from public, anon/);
    assert.match(migration, /grant execute on function public\.worth_it_chat_realtime_topic_authorized\(text\) to authenticated/);
    assert.match(migration, /for select[\s\S]*?extension in \('broadcast', 'presence'\)/);
    assert.match(migration, /for insert[\s\S]*?extension in \('broadcast', 'presence'\)/);
    assert.match(migration, /using \([\s\S]*?worth_it_chat_realtime_topic_authorized/);
    assert.match(migration, /with check \([\s\S]*?worth_it_chat_realtime_topic_authorized/);
});
test("active chats use private Broadcast topics for immediate message refresh", () => {
    assert.match(client, /const WORTH_IT_GLOBAL_CHAT_REALTIME_ID = "00000000-0000-4000-8000-000000000001"/);
    assert.match(client, /client\.channel\(topic,[\s\S]*?private: true/);
    assert.match(client, /event: "message_changed"/);
    assert.match(client, /void loadWorthItChatMessages\(false, true\)/);
    assert.match(client, /await syncWorthItChatRealtimeChannel\(\)/);
    assert.match(client, /else stopWorthItChatRealtimeChannel\(\)/);
    assert.match(client, /if \(route\.type === "invalid"\) \{[\s\S]*?stopWorthItChatRealtimeChannel\(\)/);
    assert.match(client, /if \(!chatRealtimeSubscribed \|\| now - chatLastMessagePollAt >= 5000\)/);
    assert.match(client, /now - chatLastSidebarRefreshAt >= 5000/);
    assert.match(html, /chat-realtime\.css\?v=chat-realtime-typing-20261028b/);
    assert.match(html, /chat-ui\.js\?v=chat-gif-preview-fix-20261029a/);
});
test("private and group chats display typing names with a compact overflow message", () => {
    assert.match(client, /channel\.on\("presence", \{event: "sync"\}/);
    assert.match(client, /channel\.on\("presence", \{event: "join"\}/);
    assert.match(client, /channel\.on\("presence", \{event: "leave"\}/);
    assert.match(client, /channel\.track\(\{[\s\S]*?display_name: identity\.display_name[\s\S]*?typing: Boolean\(typing\)/);
    assert.match(client, /names\[0\] \+ " is typing…"/);
    assert.match(client, /names\[0\] \+ " and " \+ names\[1\] \+ " are typing…"/);
    assert.match(client, /names\.join\(", "\) \+ " are typing…"/);
    assert.match(client, /names\.slice\(0, 3\)\.join\(", "\) \+ " and more are typing…"/);
    assert.match(client, /node\.hidden = !message/);
    assert.match(client, /worth-it-chat-typing-dots/);
    assert.match(client, /void getWorthItChatOwnProfile\(\)\.then\(refreshedProfile =>/);
    assert.match(client, /chatRealtimeRetryTimer/);
    assert.match(html, /id="worthItChatTyping" role="status" aria-live="polite" hidden/);
    assert.match(css, /\.worth-it-chat-typing\[hidden\]/);
    assert.match(css, /html\[data-theme="light"\]/);
    assert.match(client, /setTimeout\(\(\) => stopWorthItChatTyping\(true\), 1800\)/);
});
test("delete-for-everyone reports progress and awaits the menu action", () => {
    assert.match(client, /setStatus\(action === "delete" \? "Deleting message for everyone/);
    assert.match(client, /item\.addEventListener\("click", async \(\) =>/);
    assert.match(client, /await onClick\(\)/);
    assert.match(client, /setStatus\(rpcError\(error\), true\)/);
});