import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");

function section(startText, endText) {
    const start = settings.indexOf(startText);
    const end = settings.indexOf(endText, start);
    assert.notEqual(start, -1, "missing section start: " + startText);
    assert.notEqual(end, -1, "missing section end: " + endText);
    return settings.slice(start, end);
}

test("MFA enrollment never shows a factor secret after the signed-in account changes", () => {
    const enroll = section("window.startTotpEnrollment = async function()", "window.copyTotpSecret =");
    assert.match(settings, /async function securitySessionMatches\(expectedUserId\)/);
    assert.match(enroll, /const session = await currentSecuritySession\(\)/);
    assert.ok(
        enroll.indexOf("if (!await securitySessionMatches(requestUserId))") <
            enroll.indexOf("enrollmentTotpSecret = factor.totp.secret"),
        "verify the account identity before storing or displaying the TOTP secret"
    );
    assert.match(enroll, /enrollmentTotpUserId = requestUserId/);
});

test("MFA verification, cancellation, removal and disable actions are bound to the factor's account", () => {
    const verify = section("window.verifyTotpEnrollment = async function()", "window.cancelTotpEnrollment =");
    const cancel = section("window.cancelTotpEnrollment = async function()", "window.removePendingTotpEnrollment =");
    const removePending = section("window.removePendingTotpEnrollment = async function()", "window.disableTotpFactor =");
    const disable = section("window.disableTotpFactor = async function()", "window.signOutOtherSessions =");

    for (const [name, body, userVar] of [
        ["verify", verify, "enrollmentTotpUserId"],
        ["cancel", cancel, "enrollmentTotpUserId"],
        ["remove pending", removePending, "pendingTotpFactorUserId"],
        ["disable", disable, "activeTotpFactorUserId"]
    ]) {
        assert.match(body, new RegExp("const factorUserId = " + userVar + ";"), name + " should capture its factor owner");
        assert.match(body, /securitySessionMatches\(factorUserId\)/, name + " should validate the current account");
    }
    assert.match(verify, /securitySessionMatches\(factorUserId\)[\s\S]*?auth\.mfa\.verify/);
    assert.match(disable, /securitySessionMatches\(factorUserId\)[\s\S]*?auth\.mfa\.unenroll/);
});

test("account changes clear cached preference values and sensitive MFA setup data", () => {
    const listener = section("let lastSettingsAuthUserId;", "// The browser owns page translation");
    assert.match(listener, /if \(lastSettingsAuthUserId === nextUserId\) return/);
    assert.match(listener, /userPreferencesCache = null/);
    assert.match(listener, /window\.worthItUserPreferences = null/);
    assert.match(listener, /clearTotpEnrollmentUi\(\)/);
    assert.match(listener, /"privacySettingsContent"/);
    assert.match(listener, /"notificationSettingsContent"/);
    assert.match(listener, /window\.setTimeout\(\(\) =>/);
});
