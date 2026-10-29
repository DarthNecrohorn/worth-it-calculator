import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const loaderStart = settings.indexOf("async function loadWorthItUserPreferences(force)");
const loaderEnd = settings.indexOf("function applyPrivacyControls(prefs)", loaderStart);
const saveStart = settings.indexOf("async function persistUserPreferences(which)");
const saveEnd = settings.indexOf("window.loadPrivacySettings =", saveStart);

assert.notEqual(loaderStart, -1, "preference loader should exist");
assert.notEqual(loaderEnd, -1, "preference loader boundary should exist");
assert.notEqual(saveStart, -1, "preference save function should exist");
assert.notEqual(saveEnd, -1, "preference save boundary should exist");

const loader = settings.slice(loaderStart, loaderEnd);
const saver = settings.slice(saveStart, saveEnd);

test("stale preference-load responses cannot overwrite the cache after an account switch or newer request", () => {
    assert.match(settings, /let userPreferencesPromiseUserId = "";/);
    assert.match(settings, /let userPreferencesRequestVersion = 0;/);
    assert.match(loader, /const requestVersion = \+\+userPreferencesRequestVersion/);
    assert.match(loader, /latestUserId !== requestUserId \|\| requestVersion !== userPreferencesRequestVersion/);
    assert.match(loader, /if \(userPreferencesPromise === requestPromise\)/);
});

test("preference saves re-check the current account before updating shared Settings state", () => {
    assert.match(saver, /const latestSessionResult = await getSettingsAuthSession\(client\)/);
    assert.match(saver, /if \(latestUserId !== session\.user\.id\)/);
    assert.match(saver, /window\.worthItUserPreferencesUserId === currentUserId/);
});
