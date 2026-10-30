import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const baseline = readFileSync(new URL("../supabase/worth-it-chat-invitation-links.sql", import.meta.url), "utf8");
const hardening = readFileSync(new URL("../supabase/worth-it-chat-invitation-email-verification.sql", import.meta.url), "utf8");

function extractFunction(source, functionName) {
    const marker = "create or replace function public." + functionName;
    const start = source.toLowerCase().indexOf(marker.toLowerCase());
    assert.notEqual(start, -1, "Expected function " + functionName + " to exist.");
    const end = source.indexOf("\n$$;", start);
    assert.notEqual(end, -1, "Expected function " + functionName + " to have a complete dollar-quoted body.");
    return source.slice(start, end + 4);
}

for (const [label, source] of [["baseline invite setup", baseline], ["incremental hardening migration", hardening]]) {
    test(label + " requires verified email before group-invite membership changes", () => {
        const fn = extractFunction(source, "accept_worth_it_group_invite");
        const authGuard = fn.indexOf("if actor_id is null");
        const verifiedGuard = fn.indexOf("email_confirmed_at is not null");
        const inviteLookup = fn.indexOf("select c.id, c.title");
        const membershipWrite = fn.indexOf("insert into public.worth_it_chat_members");

        assert.ok(authGuard >= 0, "Authentication is required.");
        assert.ok(verifiedGuard > authGuard, "Email verification follows authentication.");
        assert.ok(inviteLookup > verifiedGuard, "Verification happens before looking up the invite.");
        assert.ok(membershipWrite > verifiedGuard, "Verification happens before changing membership.");
        assert.match(fn, /raise exception 'Email confirmation required'[\s\S]*?using errcode = '42501'/i);
        assert.match(fn, /set search_path\s*=\s*''/i, "SECURITY DEFINER function pins an empty search_path.");
    });
}

test("invite acceptance is callable by authenticated users only", () => {
    assert.match(hardening, /revoke all on function public\.accept_worth_it_group_invite\(text\) from public, anon/i);
    assert.match(hardening, /grant execute on function public\.accept_worth_it_group_invite\(text\) to authenticated/i);
});

test("group invite preview remains read-only and shareable", () => {
    const preview = extractFunction(baseline, "get_worth_it_group_invite_preview");
    assert.match(baseline, /grant execute on function public\.get_worth_it_group_invite_preview\(text\) to anon, authenticated/i);
    assert.match(preview, /select jsonb_build_object/i);
    assert.doesNotMatch(preview, /\b(insert into|update public\.|delete from)\b/i);
});

test("the incremental hardening is wrapped in a transaction and refreshes the API schema", () => {
    assert.match(hardening, /^\s*--[\s\S]*?begin;/i);
    assert.match(hardening, /notify pgrst, 'reload schema'/i);
    assert.match(hardening, /commit;\s*$/i);
});
