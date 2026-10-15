import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("MFA verification hands off the session without signing out the shared refresh token", () => {
    const start = app.indexOf(
        "const committed = await window.supabaseClient.auth.setSession({\n                access_token: verifiedSession.access_token,"
    );
    assert.ok(start >= 0, "verified session handoff exists");

    const end = app.indexOf("closeAuthModal(true);", start);
    assert.ok(end > start, "verified handoff completes");

    const handoff = app.slice(start, end);
    assert.match(handoff, /releaseAuthMfaLoginClient\(pendingClientToClear\)/);
    assert.doesNotMatch(
        handoff,
        /\.auth\.signOut\s*\(/,
        "the temporary client must not revoke tokens after they are installed on the primary client"
    );
});

test("password sign-in hands off the session without signing out the shared refresh token", () => {
    const start = app.indexOf(
        "const committed = await window.supabaseClient.auth.setSession({\n                access_token: temporarySession.access_token,"
    );
    assert.ok(start >= 0, "password session handoff exists");

    const end = app.indexOf("closeAuthModal();", start);
    assert.ok(end > start, "password handoff completes");

    const handoff = app.slice(start, end);
    assert.match(handoff, /releaseAuthMfaLoginClient\(temporaryAuthClient\)/);
    assert.doesNotMatch(
        handoff,
        /\.auth\.signOut\s*\(/,
        "the temporary client must be released from memory, not remotely signed out"
    );
});

test("releasing a temporary auth client drops references without calling Supabase sign-out", () => {
    const start = app.indexOf("function releaseAuthMfaLoginClient(client)");
    const end = app.indexOf("\n\n\n/*", start);
    assert.ok(start >= 0, "temporary client release helper exists");
    assert.ok(end > start, "temporary client release helper has a clear boundary");

    const body = app.slice(start, end);
    assert.match(body, /authMfaPendingClient === client/);
    assert.match(body, /authMfaPendingClient = null/);
    assert.match(body, /authMfaLoginClient === client/);
    assert.match(body, /authMfaLoginClient = null/);
    assert.doesNotMatch(body, /\.auth\.signOut\s*\(/);
});
