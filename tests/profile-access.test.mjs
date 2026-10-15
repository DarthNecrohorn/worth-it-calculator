import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const profileUi = readFileSync(new URL("../profile-ui.js", import.meta.url), "utf8");

test("Settings tries the scoped own-profile RPC first and only falls back for an unapplied migration", () => {
    const rpcIndex = settings.indexOf('client.rpc("get_worth_it_own_profile")');
    const legacyIndex = settings.indexOf('client.from("worth_it_profiles")');
    assert.ok(rpcIndex >= 0, "Settings should use the own-profile RPC");
    assert.ok(legacyIndex > rpcIndex, "legacy table read must only be a fallback");
    assert.match(settings, /PGRST202/);
});

test("profile pages remain compatible before the one-time presence migration is applied", () => {
    assert.match(profileUi, /function isMissingWorthItPresenceColumn\(error\)/);
    assert.match(profileUi, /publicResult\.error&&isMissingWorthItPresenceColumn\(publicResult\.error\)/);
    assert.match(profileUi, /\.select\("worth_it_id,username,display_name,avatar_url,banner_url,created_at,last_seen_at"\)/);
    assert.match(profileUi, /publicResult\.data\.show_online_status=true/);
});

test("profile UI uses the own-profile RPC first and public-profile view for other users", () => {
    const rpcIndex = profileUi.indexOf('sb.rpc("get_worth_it_own_profile")');
    const legacyIndex = profileUi.indexOf('sb.from("worth_it_profiles")');
    assert.ok(rpcIndex >= 0, "profile UI should use the own-profile RPC");
    assert.ok(legacyIndex > rpcIndex, "legacy table read must only be a fallback");
    assert.match(profileUi, /from\("worth_it_public_profiles"\)/);
    assert.match(profileUi, /PGRST202/);
});
