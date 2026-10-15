import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("profile visibility explains that existing public image URLs are not revoked", () => {
    assert.match(html, /Friends only lets accepted friends open it\./i);
    assert.match(html, /Private hides the profile page from everyone except you\./i);
    assert.match(html, /name and avatar may still appear in existing chats/i);
    assert.match(html, /cannot revoke direct image URLs someone already has/i);
});

test("Security settings do not claim project email alerts are already enabled or verified", () => {
    assert.match(html, /Worth It has not verified whether their switches are enabled or whether delivery works/i);
    assert.doesNotMatch(html, /The seven project-level security notification switches have been enabled in Supabase/i);
});
