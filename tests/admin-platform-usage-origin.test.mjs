import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedAdminPlatformOrigin } from "../functions/api/admin-platform-usage.js";

test("production and same-project HTTPS previews are allowed", () => {
    assert.equal(isAllowedAdminPlatformOrigin("https://worth-it-calculator.pages.dev"), true);
    assert.equal(isAllowedAdminPlatformOrigin("https://abc123.worth-it-calculator.pages.dev"), true);
    assert.equal(isAllowedAdminPlatformOrigin("https://feature-branch.worth-it-calculator.pages.dev"), true);
});

test("arbitrary, malformed, and insecure origins are rejected", () => {
    assert.equal(isAllowedAdminPlatformOrigin("https://attacker.example"), false);
    assert.equal(isAllowedAdminPlatformOrigin("https://worth-it-calculator.pages.dev.attacker.example"), false);
    assert.equal(isAllowedAdminPlatformOrigin("http://abc123.worth-it-calculator.pages.dev"), false);
    assert.equal(isAllowedAdminPlatformOrigin("https://abc123.worth-it-calculator.pages.dev:444"), false);
    assert.equal(isAllowedAdminPlatformOrigin("not-a-url"), false);
    assert.equal(isAllowedAdminPlatformOrigin(""), true);
});
