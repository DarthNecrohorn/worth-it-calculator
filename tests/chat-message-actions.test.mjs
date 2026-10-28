import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const actionsCss = readFileSync(new URL("../chat-actions.css", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/worth-it-chat-message-actions.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/function-syntax-check.yml", import.meta.url), "utf8");

test("each live message has ChatGPT-like copy, quote and three-dot action controls", () => {
    assert.match(client, /function createWorthItChatMessageActions\(message, mine\)/);
    assert.match(client, /"Copy message", "▢"/);
    assert.match(client, /"Quote in reply", "↩"/);
    assert.match(client, /moreButton\.textContent = "⋯"/);
    assert.match(client, /aria-haspopup", "menu"/);
    assert.match(client, /function closeWorthItChatMessageMenus\(/);
    assert.match(actionsCss, /\.worth-it-chat-message-actions/);
    assert.match(actionsCss, /\.worth-it-chat-message-menu/);
    assert.match(html, /chat-actions\.css\?v=chat-message-actions-20261028a/);
    assert.match(html, /chat-ui\.js\?v=chat-message-actions-20261028a/);
});

test("message menu offers hide-for-me and owner-only delete-for-everyone actions", () => {
    assert.match(client, /addMenuItem\("Hide message for me", \(\) => runWorthItChatMessageAction\("hide", message\)/);
    assert.match(client, /if \(mine\) addMenuItem\("Delete message for everyone"/);
    assert.match(client, /message\.sender_user_id !== chatUser\.id/);
    assert.match(client, /window\.confirm\("Delete this message for everyone/);
    assert.match(client, /function runWorthItChatMessageAction\(/);
    assert.match(client, /delete_worth_it_chat_message/);
    assert.match(client, /hide_worth_it_chat_message/);
    assert.match(client, /The message has been deleted by/);
    assert.match(client, /has deleted a message/);
});

test("pinning a sidebar conversation is persistent, per-user, and places it at the top of its own list", () => {
    assert.match(client, /Pin conversation/);
    assert.match(client, /Unpin conversation/);
    assert.match(client, /set_worth_it_chat_conversation_pinned/);
    assert.ok(client.includes("const friendsForSidebar = chatFriends"));
    assert.ok(client.includes('.filter(conversation => conversation.type === "group" &&'));
    assert.ok(client.includes("Boolean(right.is_pinned)"));
    assert.match(client, /worth-it-chat-pin-indicator/);
    assert.ok(migration.includes("create table if not exists public.worth_it_chat_conversation_pins"));
    assert.match(migration, /set_worth_it_chat_conversation_pinned/);
    assert.ok(migration.includes("pins.user_id = actor_id and pins.conversation_id = c.id"));
    assert.match(migration, /GLOBAL_CHAT_PIN_NOT_SUPPORTED/);
    assert.ok(actionsCss.includes(".worth-it-chat-pin-indicator"));
});

test("conversation history menu supports right-click and mobile long-press without removing other members' messages", () => {
    assert.match(client, /function attachWorthItChatConversationContextHandlers\(/);
    assert.match(client, /addEventListener\("contextmenu"/);
    assert.match(client, /addEventListener\("pointerdown"/);
    assert.match(client, /}, 540\)/);
    assert.match(client, /Delete this conversation history/);
    assert.match(client, /clear_worth_it_chat_history/);
    assert.match(client, /Other members' history is unchanged/);
    assert.match(actionsCss, /\.worth-it-chat-context-menu/);
});

test("message actions migration scopes private deletion state to the requesting user", () => {
    assert.match(migration, /create table if not exists public\.worth_it_chat_message_hides/);
    assert.match(migration, /create table if not exists public\.worth_it_chat_history_clears/);
    assert.match(migration, /enable row level security/);
    assert.match(migration, /revoke all on public\.worth_it_chat_message_hides from public, anon, authenticated/);
    assert.match(migration, /revoke all on public\.worth_it_chat_history_clears from public, anon, authenticated/);
    assert.match(migration, /message_sender is distinct from actor_id/);
    assert.ok(migration.includes("revoke all on public.worth_it_chat_conversation_pins from public, anon, authenticated"));
    assert.match(migration, /set body = ''/);
    assert.match(migration, /set cleared_at = excluded\.cleared_at/);
    assert.match(migration, /hidden_preview\.user_id = actor_id/);
    assert.match(migration, /hc\.user_id = actor_id and hc\.conversation_id = target_id/);
    assert.match(workflow, /tests\/fixtures\/chat-message-actions-postgres-setup\.sql/);
    assert.match(workflow, /tests\/fixtures\/chat-message-actions-postgres-smoke\.sql/);
});
