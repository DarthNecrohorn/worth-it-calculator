import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const markets = readFileSync(new URL("../markets-ui.js", import.meta.url), "utf8");

test("Markets account image writes pause after an authentication rejection", () => {
    const queueStart = markets.indexOf("function queueMarketAccountImageSave(");
    const queueEnd = markets.indexOf("async function flushMarketAccountImageSaveQueue(", queueStart);
    assert.ok(queueStart >= 0 && queueEnd > queueStart, "image save queue function exists");
    assert.match(
        markets.slice(queueStart, queueEnd),
        /marketsAccountImageSavePausedForAuth/,
        "the queue must stop accepting writes while the current auth session is rejected"
    );

    const postStart = markets.indexOf("async function flushMarketAccountImageSaveQueue(");
    const authFailureStart = markets.indexOf(
        "if (response.status === 401 || response.status === 403)",
        postStart
    );
    const retryThrow = markets.indexOf('throw new Error("HTTP " + response.status);', authFailureStart);
    assert.ok(authFailureStart > postStart && retryThrow > authFailureStart, "POST auth failure branch exists");
    const authFailureBranch = markets.slice(authFailureStart, retryThrow);
    assert.match(authFailureBranch, /pauseMarketAccountImageCacheForAuth\(\)/);
    assert.match(authFailureBranch, /return;/);
    assert.doesNotMatch(
        authFailureBranch,
        /marketsAccountImageSaveQueue\.set|setTimeout/,
        "401/403 must not requeue failed records or schedule another retry"
    );
});

test("Markets account-cache GET rejection also pauses account image writes", () => {
    const action = markets.indexOf('"/api/markets?action=account-image-cache-get"');
    const failure = markets.indexOf("if (!response.ok) {", action);
    const dataStart = markets.indexOf("const data =", failure);
    assert.ok(action >= 0 && failure > action && dataStart > failure, "account cache GET handler exists");
    const branch = markets.slice(failure, dataStart);
    assert.match(branch, /response.status === 401 \|\| response.status === 403/);
    assert.match(branch, /pauseMarketAccountImageCacheForAuth\(\)/);
});

test("a fresh Supabase sign-in or token refresh resumes account image caching", () => {
    assert.match(
        markets,
        /\["SIGNED_IN", "TOKEN_REFRESHED"\][\s\S]*?marketsAccountImageSavePausedForAuth = false/
    );
    assert.match(
        markets,
        /if \(event === "SIGNED_OUT"\)[\s\S]*?pauseMarketAccountImageCacheForAuth\(\)/
    );
});
