import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/worth-it-settings-privacy-notifications.sql", import.meta.url), "utf8");

function section(startMarker, endMarker) {
    const start = sql.indexOf(startMarker);
    assert.notEqual(start, -1, "Missing SQL section: " + startMarker);
    const end = endMarker ? sql.indexOf(endMarker, start + startMarker.length) : sql.length;
    assert.ok(end > start, "Could not determine SQL section after: " + startMarker);
    return sql.slice(start, end);
}

test("the migration has balanced PostgreSQL dollar-quote blocks and transaction boundaries", () => {
    const lines = sql.split(/\r?\n/).map(line => line.trim());
    const openers = lines.filter(line => line === "as $$" || line === "do $$").length;
    const closers = lines.filter(line => line === "$$;").length;

    assert.equal(lines.filter(line => line === "$;").length, 0);
    assert.equal(openers, closers);
    assert.equal(lines[0], "-- Worth It account Settings: persistent privacy and in-app notification preferences.");
    assert.ok(lines.includes("begin;"));
    assert.ok(lines.includes("commit;"));
});

test("preferences are stored behind RLS and accessible only through authenticated functions", () => {
    assert.match(sql, /alter table public\.worth_it_user_preferences enable row level security;/i);
    assert.match(sql, /revoke all on public\.worth_it_user_preferences from public, anon, authenticated;/i);
    const getter = section("create or replace function public.get_worth_it_user_preferences()", "create or replace function public.save_worth_it_user_preferences");
    const saver = section("create or replace function public.save_worth_it_user_preferences", "-- This check is used by the public profile view");
    assert.match(getter, /actor_id uuid := auth\.uid\(\)/i);
    assert.match(getter, /if actor_id is null then/i);
    assert.match(saver, /if actor_id is null then/i);
    assert.match(sql, /grant execute on function public\.get_worth_it_user_preferences\(\) to authenticated;/i);
    assert.match(sql, /grant execute on function public\.save_worth_it_user_preferences\(jsonb, jsonb\) to authenticated;/i);
});

test("the public profile view hides inaccessible profiles and masks last-seen timestamps", () => {
    const view = section("create or replace view public.worth_it_public_profiles", "grant select on public.worth_it_public_profiles");
    assert.match(view, /case when coalesce\(p\.show_online_status, true\) then wp\.last_seen_at else null end as last_seen_at/i);
    assert.match(view, /where public\.can_view_worth_it_profile\(wp\.user_id\)/i);
});

test("profile search respects profile visibility and discoverability", () => {
    const search = section("create or replace function public.search_worth_it_public_profiles", "revoke all on function public.search_worth_it_public_profiles");
    assert.match(search, /from public\.worth_it_public_profiles p/i);
    assert.match(search, /coalesce\(prefs\.profile_discoverable, true\)/i);
    assert.match(sql, /grant execute on function public\.search_worth_it_public_profiles\(text, integer\) to anon, authenticated/i);
});

test("profile stats and connection RPCs enforce view and connection privacy", () => {
    const stats = section("create or replace function public.get_worth_it_profile_stats", "create or replace function public.get_worth_it_profile_connections");
    const connections = section("create or replace function public.get_worth_it_profile_connections", "-- Do not expose relationship/request state");
    const socialContext = section("create or replace function public.get_worth_it_profile_social_context", "-- Notification preferences control");
    assert.match(stats, /not public\.can_view_worth_it_profile\(target_user_id\)/i);
    assert.match(stats, /'hidden', true/i);
    assert.match(connections, /not public\.can_view_worth_it_profile\(target_user_id\)/i);
    assert.match(connections, /coalesce\(show_connections, true\)/i);
    assert.match(connections, /and public\.can_view_worth_it_profile\(p\.user_id\)/i);
    assert.match(connections, /case when coalesce\(prefs\.show_online_status, true\) then p\.last_seen_at else null end/i);
    assert.match(socialContext, /not public\.can_view_worth_it_profile\(target_user_id\)/i);
});

test("chat friend lists, conversation member lists, and messages all respect hidden presence", () => {
    const conversations = section("create or replace function public.get_worth_it_chat_conversations()", "-- Keep direct-chat presence private");
    const friends = section("create or replace function public.get_worth_it_chat_friends()", "create or replace function public.get_worth_it_chat_messages");
    const messages = section("create or replace function public.get_worth_it_chat_messages", "commit;");
    for (const [name, body] of [["conversations", conversations], ["friends", friends], ["messages", messages]]) {
        assert.match(body, /left join public\.worth_it_user_preferences prefs on prefs\.user_id = p\.user_id/i, name + " must read member preferences");
        assert.match(body, /case\s+when\s+coalesce\(prefs\.show_online_status, true\)\s+then p\.last_seen_at\s+else null\s+end/i, name + " must mask last-seen timestamps");
        assert.match(body, /'show_online_status', coalesce\(prefs\.show_online_status, true\)/i, name + " should expose the visibility flag");
    }
});

test("notification categories are checked before feed items are returned", () => {
    const friendNotifications = section("create or replace function public.get_worth_it_pending_friend_request_notifications()", "create or replace function public.get_worth_it_social_notifications");
    const socialNotifications = section("create or replace function public.get_worth_it_social_notifications()", "-- Presence preferences must also apply");
    const follow = section("create or replace function public.follow_worth_it_user", "create or replace function public.get_worth_it_pending_friend_request_notifications");
    assert.match(friendNotifications, /notify_friend_requests = false/i);
    assert.match(socialNotifications, /coalesce\(prefs\.notify_follows, true\)/i);
    assert.match(socialNotifications, /coalesce\(prefs\.notify_account_activity, true\)/i);
    assert.match(follow, /notify_follows = false/i);
});
