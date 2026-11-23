import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const community = readFileSync(new URL("../community-features.js", import.meta.url), "utf8");

test("a returning Premium member's saved theme is applied synchronously before first paint", () => {
    const start = html.indexOf("function applyCachedThemeBootSnapshot");
    const end = html.indexOf("    try {", start);
    const boot = html.slice(start, end);
    assert.ok(start >= 0 && end > start, "the synchronous first-paint snapshot reader exists");
    assert.match(boot, /snapshot\.version !== 1/);
    assert.match(boot, /snapshot\.userId !== expectedUserId/);
    assert.match(boot, /\["premium", "premium_lite"\]\.includes\(plan\)/);
    assert.match(boot, /expiresAt > Date\.now\(\)/);
        assert.match(boot, /snapshot\.dataset\.worthItCustomTheme/);
    assert.match(boot, /root\.dataset\.worthItCustomTheme/);
    assert.match(html, /worthItCustomThemeBoot:v1:/);
    assert.match(html, /root\.classList\.add\("worth-it-initial-paint"\)/);
});

test("the early snapshot is only an expiring visual cache, not an entitlement grant", () => {
    const persist = community.match(/function persistThemeBootSnapshot\(value\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.ok(persist, "snapshot persistence function exists");
    assert.match(persist, /!themeEntitlementResolved/);
    assert.match(persist, /!themeEntitled/);
    assert.match(persist, /themePreviewActive/);
    assert.match(persist, /expiresAt<=Date\.now\(\)/);
    assert.match(community, /persistThemeBootSnapshot\(selectedTheme\)/);
});

test("lost Premium access and explicit resets remove the cached theme snapshot", () => {
    const expiry = community.match(/async function clearThemeAfterExpiry\(userId,request\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(expiry, /removeLocal\(scopedKey\(THEME_BOOT_KEY,userId\)\)/);
    const reset = community.match(/async function resetCustomThemeFromSettings\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(reset, /removeLocal\(scopedKey\(THEME_BOOT_KEY,userId\)\)/);
});


test("network and timeout fallbacks never reveal an expired or unverified custom theme", () => {
    const valid = community.match(/function readValidThemeBootSnapshot\(userId\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.ok(valid, "a validated Premium snapshot reader exists");
    assert.match(valid, /snapshot\.userId!==userId/);
    assert.match(valid, /expiry>Date\.now\(\)/);
    assert.match(community, /const validBootSnapshot=readValidThemeBootSnapshot\(userId\)/);
    assert.match(community, /const validBootSnapshot=readValidThemeBootSnapshot\(bootstrapUserId\)/);
    assert.match(community, /validBootSnapshot\?readCachedCustomTheme\(/);
});

test("the Custom Theme script cache key changes with the first-paint bootstrap", () => {
    assert.match(html, /theme-boot-snapshot=20261123a/);
});
