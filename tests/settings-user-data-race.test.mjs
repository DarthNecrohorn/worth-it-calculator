import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const helperStart = settings.indexOf("async function requestUserDataApi(action)");
const helperEnd = settings.indexOf("window.loadYourDataSettings =", helperStart);
const exportStart = settings.indexOf("window.downloadWorthItDataExport = async function()");
const exportEnd = settings.indexOf("window.deleteWorthItAccount = async function()", exportStart);
const deleteStart = exportEnd;
const deleteEnd = settings.indexOf("window.openSettingsCategory = function(panelId)", deleteStart);

assert.notEqual(helperStart, -1, "account data API helper should exist");
assert.notEqual(helperEnd, -1, "account data API helper boundary should exist");
assert.notEqual(exportStart, -1, "export function should exist");
assert.notEqual(exportEnd, -1, "export function boundary should exist");
assert.notEqual(deleteEnd, -1, "delete function boundary should exist");

const helper = settings.slice(helperStart, helperEnd);
const exporter = settings.slice(exportStart, exportEnd);
const deleter = settings.slice(deleteStart, deleteEnd);

test("account data API binds requests to the authenticated user and reports account switches", () => {
    assert.match(helper, /const requestUserId = session\?\.user\?\.id \|\| ""/);
    assert.match(helper, /currentUserId = latestSessionResult\?\.data\?\.session\?\.user\?\.id \|\| ""/);
    assert.match(helper, /accountChanged: currentUserId !== requestUserId/);
});

test("a stale export response cannot download another account's data after a switch", () => {
    assert.match(exporter, /if \(result\.accountChanged\)[\s\S]*?No file was downloaded/);
    assert.ok(exporter.indexOf("if (result.accountChanged)") < exporter.indexOf("const blob = new Blob"));
});

test("deleting one account never signs out a different account that is now active", () => {
    assert.match(deleter, /result\.currentUserId && result\.currentUserId !== result\.requestUserId/);
    assert.ok(
        deleter.indexOf("result.currentUserId && result.currentUserId !== result.requestUserId") <
        deleter.indexOf('signOut?.({ scope: "local" })'),
        "check the current account before signing out"
    );
    assert.match(deleter, /Your current browser session belongs to a different account, so that account remains signed in/);
});
