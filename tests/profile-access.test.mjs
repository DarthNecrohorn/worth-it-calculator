import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const profileUi = readFileSync(new URL("../profile-ui.js", import.meta.url), "utf8");

test("Settings resolves the signed-in user's Worth It profile through the own-profile RPC", () => {
    assert.match(settings, /rpc\("get_worth_it_own_profile"\)/);
    assert.doesNotMatch(settings, /from\("worth_it_profiles"\)/);
});

test("profile UI uses the own-profile RPC and public-profile view instead of querying the base table", () => {
    assert.match(profileUi, /rpc\("get_worth_it_own_profile"\)/);
    assert.match(profileUi, /from\("worth_it_public_profiles"\)/);
    assert.doesNotMatch(profileUi, /from\("worth_it_profiles"\)/);
});
