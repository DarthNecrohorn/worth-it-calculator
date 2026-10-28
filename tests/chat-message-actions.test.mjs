import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const actionsCss = readFileSync(new URL("../chat-actions.css", import.meta.url), "utf8");
const deleteConfirmCss = readFileSync(new URL("../chat-delete-confirm.css", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/worth-it-chat-message-actions.sql", import.meta.url), "utf8");
const deleteConstraintMigration = readFileSync(new URL("../supabase/worth-it-chat-message-delete-constraint.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/function-syntax-check.yml", import.meta.url), "utf8");

test("Escape closes an open message/conversation menu without closing the entire chat", () => {
    assert.match(client, /const messageMenuOpen = Array\.from\(document\.querySelectorAll\("\.worth-it-chat-message-menu"\)\)\.some\(menu => !menu\.hidden\)/);
    assert.match(client, /const conversationMenuOpen = Boolean\(document\.getElementById\("worthItChatConversationContextMenu"\)\)/);
    assert.match(client, /if \(!messageMenuOpen && !conversationMenuOpen\) return/);
    assert.match(client, /event\.stopImmediatePropagation\(\)/);
    assert.match(client, /closeWorthItChatMessageMenus\(\);\s*closeWorthItChatConversationContextMenu\(\);/);
});

test("each live message has ChatGPT-like copy, quote and three-dot action controls", () => {
    assert.match(client, /function createWorthItChatMessageActions\(message, mine\)/);
    assert.match(client, /"Copy message", "▢"/);
    assert.match(client, /"Quote in reply", "↩"/);
    assert.match(client, /moreButton\.textContent = "⋯"/);
    assert.match(client, /aria-haspopup", "menu"/);
    assert.match(client, /function closeWorthItChatMessageMenus\(/);
    assert.match(actionsCss, /\.worth-it-chat-message-actions/);
    assert.match(actionsCss, /\.worth-it-chat-message-menu/);
    assert.match(html, /chat-actions\.css\?v=chat-message-actions-20261028b/);
    assert.match(html, /chat-ui\.js\?v=chat-realtime-typing-delete-fix-20261028a/);
});

test("message menu offers hide-for-me and owner-only delete-for-everyone actions", () => {
    assert.match(client, /addMenuItem\("Hide message for me", \(\) => runWorthItChatMessageAction\("hide", message\)/);
    assert.match(client, /if \(mine\) addMenuItem\("Delete message for everyone"/);
    assert.match(client, /message\.sender_user_id !== chatUser\.id/);
    assert.match(client, /await confirmWorthItChatMessageDelete\(actionUserId\)/);
    assert.match(client, /setStatus\(action === "delete" \? "Deleting message for everyone/);
    assert.match(client, /try \{\s*await onClick\(\);\s*\} catch \(error\)/);
    assert.doesNotMatch(client, /window\.confirm\("Delete this message for everyone/);
    assert.match(client, /function runWorthItChatMessageAction\(/);
    assert.match(client, /delete_worth_it_chat_message/);
    assert.match(client, /hide_worth_it_chat_message/);
    assert.match(client, /The message has been deleted by/);
    assert.match(client, /This message has been hidden by you \(only you can see this\)\./);
    assert.match(client, /message\.deleted_by_display_name \|\| message\.display_name/);
    assert.match(client, /if \(!message\.is_deleted && !message\.is_hidden_by_me\) stack\.appendChild\(name\)/);
    assert.match(client, /function getOwnedWorthItChatMediaObjectPath/);
    assert.match(client, /media\.origin !== configured\.origin/);
    assert.match(client, /segments\[0\] !== String\(userId\)/);
    assert.match(client, /\.storage\.from\("worth-it-chat-media"\)\.remove\(\[objectPath\]\)/);
    assert.match(client, /attachmentCleanupFailed/);
});

test("stale polling responses cannot restore cleared or deleted messages", () => {
    assert.match(client, /let chatMessageRequestVersion = 0/);
    assert.match(client, /async function loadWorthItChatMessages\(scrollToBottom, force = false\)/);
    assert.match(client, /const requestVersion = \+\+chatMessageRequestVersion/);
    assert.match(client, /if \(requestVersion !== chatMessageRequestVersion\) return/);
    assert.match(client, /if \(!chatUser \|\| chatUser\.id !== requestUserId \|\| chatRouteAccessDenied\) return/);
    assert.equal((client.match(/await loadWorthItChatMessages\(false, true\)/g) || []).length, 3);
    assert.equal((client.match(/await loadWorthItChatMessages\(true, true\)/g) || []).length, 2);
    assert.match(client, /chatMessageRequestVersion \+= 1;\s*chatLoading = false;/);
    assert.match(client, /Invalidate any poll that began before the destructive RPC completed[\s\S]*?renderMessages\(false\);[\s\S]*?storage\.from\("worth-it-chat-media"\)/);
    assert.match(client, /already-started poll repopulate this user's cleared history[\s\S]*?chatMessageRequestVersion \+= 1;\s*chatLoading = false;[\s\S]*?await refreshWorthItChatData\(\)/);
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

test("deleted chat tombstones can clear their body without weakening live-message checks", () => {
    assert.match(deleteConstraintMigration, /drop constraint if exists worth_it_chat_message_not_empty/);
    assert.match(deleteConstraintMigration, /add constraint worth_it_chat_message_not_empty/);
    assert.match(deleteConstraintMigration, /char_length\(btrim\(body\)\) > 0/);
    assert.match(deleteConstraintMigration, /media_url is not null/);
    assert.match(deleteConstraintMigration, /deleted_at is not null/);
    assert.match(deleteConstraintMigration, /begin;[\s\S]*commit;/);
    assert.match(workflow, /supabase\/worth-it-chat-message-delete-constraint\.sql/);
});

test("the sidebar Refresh button calls a real global chat refresh handler", () => {
    assert.match(html, /onclick="refreshWorthItChatData\(\)"/);
    assert.match(client, /window\.refreshWorthItChatData = async function \(\)/);
    assert.match(client, /await refreshWorthItChatData\(\);[\s\S]*?await loadWorthItChatMessages\(false, true\)/);
});

test("message actions migration scopes private deletion state to the requesting user", () => {
    assert.match(migration, /create table if not exists public\.worth_it_chat_message_hides/);
    assert.match(migration, /create table if not exists public\.worth_it_chat_history_clears/);
    assert.match(migration, /enable row level security/);
    assert.match(migration, /revoke all on public\.worth_it_chat_message_hides from public, anon, authenticated/);
    assert.match(migration, /revoke all on public\.worth_it_chat_history_clears from public, anon, authenticated/);
    assert.match(migration, /message_sender is distinct from actor_id/);
    assert.equal((migration.match(/set search_path = ''/g) || []).length, 4, "every new SECURITY DEFINER RPC pins an empty search_path");
    assert.ok(migration.includes("revoke all on public.worth_it_chat_conversation_pins from public, anon, authenticated"));
    assert.match(migration, /set body = ''/);
    assert.match(migration, /set cleared_at = excluded\.cleared_at/);
    assert.match(migration, /hidden_preview\.user_id = actor_id/);
    assert.match(migration, /hc\.user_id = actor_id and hc\.conversation_id = target_id/);
    assert.match(workflow, /tests\/fixtures\/chat-message-actions-postgres-setup\.sql/);
    assert.match(workflow, /tests\/fixtures\/chat-message-actions-postgres-smoke\.sql/);
});


test("delete-for-everyone uses an accessible branded dialog with a per-user skip preference", () => {
    assert.match(client, /const WORTH_IT_CHAT_DELETE_CONFIRM_SKIP_PREFIX = "worth-it-chat-delete-confirm-skip-v1:"/);
    assert.match(client, /window\.localStorage\.getItem\(WORTH_IT_CHAT_DELETE_CONFIRM_SKIP_PREFIX \+ String\(userId\)\) === "1"/);
    assert.match(client, /window\.localStorage\.setItem\(WORTH_IT_CHAT_DELETE_CONFIRM_SKIP_PREFIX \+ String\(userId\), "1"\)/);
    assert.match(client, /function confirmWorthItChatMessageDelete\(userId\)/);
    assert.match(client, /setAttribute\("role", "alertdialog"\)/);
    assert.match(client, /setAttribute\("aria-modal", "true"\)/);
    assert.match(client, /preferenceText\.textContent = "Don't show this again"/);
    assert.match(client, /cancelButton\.addEventListener\("click", \(\) => finish\(false\)\)/);
    assert.match(client, /deleteButton\.addEventListener\("click", \(\) => finish\(true\)\)/);
    assert.match(client, /if \(event\.key === "Escape"\)/);
    assert.match(deleteConfirmCss, /\.worth-it-chat-delete-confirm-dialog/);
    assert.match(deleteConfirmCss, /\.worth-it-chat-delete-confirm-preference/);
    assert.match(deleteConfirmCss, /html\[data-theme="light"\]/);
    assert.match(html, /chat-delete-confirm\.css\?v=chat-delete-confirm-20261028a/);
    assert.match(html, /chat-ui\.js\?v=chat-delete-confirm-20261028a/);
});
