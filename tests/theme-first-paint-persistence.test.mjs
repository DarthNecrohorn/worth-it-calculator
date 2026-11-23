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
    assert.match(boot, /root\.style\.setProperty\(name, value\)/);
    assert.match(boot, /snapshot\.dataset\.worthItCustomTheme/);
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
    assert.match(reset, /clearLocalThemeState\(userId\)/);
    assert.match(reset, /markThemeResetPending\(knownUserId\)/);
});


test("network and timeout fallbacks never reveal an expired or unverified custom theme", () => {
    const valid = community.match(/function readValidThemeBootSnapshot\(userId\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.ok(valid, "a validated Premium snapshot reader exists");
    assert.match(valid, /snapshot\.userId!==userId/);
    assert.match(valid, /expiry>Date\.now\(\)/);
    assert.match(community, /const validBootSnapshot=readValidThemeBootSnapshot\(userId\)/);
    assert.match(community, /const validBootSnapshot=resetPending\?null:readValidThemeBootSnapshot\(bootstrapUserId\)/);
    assert.match(community, /validBootSnapshot\?readCachedCustomTheme\(/);
});

test("the Custom Theme script cache key changes with the first-paint bootstrap", () => {
    assert.match(html, /theme-boot-snapshot=20261123a/);
});



test("saving a new preset invalidates older theme hydration and prevents concurrent loads", () => {
    assert.match(community, /let themeMutationInProgress = false/);
    assert.match(community, /let themeReloadAfterMutation = false/);
    const loadStart = community.indexOf("async function loadThemeForSession()");
    const loadBody = community.slice(loadStart, loadStart + 280);
    assert.match(loadBody, /themeMutationInProgress/);
    assert.match(loadBody, /themeReloadAfterMutation=true/);
    const saveStart = community.indexOf("async function saveCustomTheme()");
    const resetStart = community.indexOf("async function resetCustomTheme()", saveStart);
    const saveBody = community.slice(saveStart, resetStart);
    assert.match(saveBody, /\+\+themeRequest/);
    assert.match(saveBody, /themeMutationInProgress=true/);
    assert.match(saveBody, /finishThemeMutation\(\)/);
});

test("reset invalidates pending reads, removes both caches, and serializes with saves", () => {
    const resetStart = community.indexOf("async function resetCustomTheme()");
    const accountResetStart = community.indexOf("async function resetCustomThemeFromSettings()", resetStart);
    const resetBody = community.slice(resetStart, accountResetStart);
    assert.ok(resetBody.includes("++themeRequest"));
    assert.ok(resetBody.includes("themeMutationInProgress=true"));
    assert.ok(resetBody.includes("markThemeResetPending(knownUserId)"));
    assert.match(community, /function markThemeResetPending\(userId\)[\s\S]*?clearLocalThemeState\(userId\)/);
    assert.ok(resetBody.includes("finishThemeMutation()"));

    const accountReset = community.slice(accountResetStart, community.indexOf("// UGC cards", accountResetStart));
    assert.ok(accountReset.includes("sb()?.auth?.getSession?.()"));
    assert.ok(accountReset.includes("deleteAndVerifySavedTheme(userId)"));
    assert.ok(accountReset.includes("markThemeResetPending(knownUserId)"));
    assert.ok(accountReset.includes("finishThemeMutation()"));
});

test("theme script cache key is refreshed for the save/reset race fix", () => {
    assert.match(html, /theme-save-race=20261123a/);
});


test("Custom Theme save requires a verified database row and reports unconfirmed writes", () => {
    const saveStart = community.indexOf("async function saveCustomTheme()");
    const resetStart = community.indexOf("async function resetCustomTheme()", saveStart);
    const save = community.slice(saveStart, resetStart);
    assert.match(save, /\.select\("user_id,theme_name,primary_color,secondary_color,hover_color,header_color,theme_config,updated_at"\)/);
    assert.match(save, /\.single\(\)/);
    assert.match(save, /const confirmed=Boolean\(/);
    assert.match(save, /if\(!confirmed\)throw new Error/);
    assert.match(save, /Your latest theme is only a preview\. The account did not confirm that it was saved/);
});

test("Custom Theme reset clears snapshots and restores explicit standard Dark mode without a Premium gate", () => {
    const helperStart = community.indexOf("function applyStandardDarkTheme()");
    const resetStart = community.indexOf("async function resetCustomTheme()");
    const resetEnd = community.indexOf("async function resetCustomThemeFromSettings()", resetStart);
    const helper = community.slice(helperStart, resetStart);
    const reset = community.slice(resetStart, resetEnd);
    assert.match(helper, /applyTheme\(DEFAULT_THEME\)/);
    assert.match(helper, /root\.dataset\.theme="dark"/);
    assert.match(helper, /writeLocal\("worthItTheme","dark"\)/);
    assert.match(reset, /applyStandardDarkTheme\(\)/);
    assert.match(reset, /sb\(\)\?\.auth\?\.getSession\?\.\(\)/);
    assert.match(reset, /deleteAndVerifySavedTheme\(userId\)/);
    assert.doesNotMatch(reset, /if\(!themeEntitled/);
    assert.doesNotMatch(reset, /if\(!themeSettingsOpen/);
    assert.match(reset, /markThemeResetPending\(knownUserId\)/);
    assert.match(reset, /markThemeResetPending\(knownUserId\)/);
});

test("theme script cache key changes for the confirmed-save and unconditional-reset fix", () => {
    assert.match(html, /theme-committed-snapshot=20261123a/);
});


test("first paint does not reveal a cached Custom Theme while its account reset is pending", () => {
    assert.match(html, /const resetPending = localStorage\.getItem\("worthItCustomThemeResetPending:v1:" \+ sessionUserId\) === "1"/);
    assert.match(html, /const snapshot = resetPending \? null/);
    assert.match(html, /if \(!resetPending && !applyCachedThemeBootSnapshot/);
});


test("first-paint cache key changes for the durable pending-reset guard", () => {
    assert.match(html, /theme-committed-snapshot=20261123a/);
});


test("pending reset always wins over cached themes when auth hydration fails or times out", () => {
    const unresolvedStart = community.indexOf("if(!sessionResolved)");
    const unresolvedEnd = community.indexOf("if(!userId)", unresolvedStart);
    const unresolved = community.slice(unresolvedStart, unresolvedEnd);
    assert.match(unresolved, /const resetPending=isThemeResetPending\(bootstrapUserId\)/);
    assert.match(unresolved, /resetPending\?DEFAULT_THEME/);
    const hydrateStart = community.indexOf("async function hydrateInitialThemeBeforePaint()");
    const hydrate = community.slice(hydrateStart, community.indexOf("function releaseInitialThemeCover()", hydrateStart));
    assert.match(hydrate, /const resetPending=isThemeResetPending\(bootstrapUserId\)/);
    assert.match(hydrate, /applyTheme\(resetPending\?DEFAULT_THEME/);
});


test("Custom Theme saves use one secure upsert RPC and independently verify the latest stored palette", () => {
    const saveStart = community.indexOf("async function saveCustomTheme()");
    const resetStart = community.indexOf("async function resetCustomTheme()", saveStart);
    const save = community.slice(saveStart, resetStart);
    assert.match(save, /auth\.getSession\(\)/);
    assert.match(save, /currentUserId!==themeUserId/);
    assert.match(save, /rpc\("save_worth_it_custom_theme",\{p_theme:theme\}\)/);
    assert.match(save, /\.select\("user_id,theme_name,primary_color,secondary_color,hover_color,header_color,theme_config,updated_at"\)/);
    assert.match(save, /\.eq\("user_id",themeUserId\)\.single\(\)/);
    assert.match(save, /The account still returned an older or incomplete Custom Theme after saving/);
    assert.doesNotMatch(save, /themeRemoteAvailable===false/);
    assert.doesNotMatch(save, /saved on this device only/);
});

test("secure Custom Theme save migration authorizes Premium and atomically updates existing rows", () => {
    const sql = readFileSync(new URL("../supabase/worth-it-community-theme-z-save-rpc.sql", import.meta.url), "utf8");
    assert.match(sql, /private\.worth_it_can_save_custom_theme\(\)/);
    assert.match(sql, /security invoker/);
    assert.doesNotMatch(sql, /security definer/);
    assert.match(sql, /on conflict \(user_id\) do update set/);
    assert.match(sql, /theme_config = excluded\.theme_config/);
    assert.match(sql, /grant execute on function public\.save_worth_it_custom_theme\(jsonb\) to authenticated/);
    assert.match(sql, /revoke all on function public\.save_worth_it_custom_theme\(jsonb\) from public, anon/);
    assert.match(sql, /notify pgrst, 'reload schema'/);
});


test("a stale remote theme read cannot roll back a newer independently verified save", () => {
    assert.match(community, /const THEME_COMMIT_KEY = "worthItCustomThemeCommit:v1:"/);
    assert.match(community, /function writeThemeCommit\(userId,updatedAt,theme\)/);
    assert.match(community, /writeThemeCommit\(themeUserId,persisted\.updated_at\|\|saved\.data\?\.updated_at,theme\)/);
    assert.match(community, /\.select\("theme_name,primary_color,secondary_color,hover_color,header_color,theme_config,updated_at"\)/);
    assert.match(community, /sameThemeSnapshot\(remoteTheme,commit\.theme\)/);
    assert.match(community, /A later request can hit a lagging replica\/cache/);
    assert.match(community, /remoteUpdatedAt>commit\.updatedAt/);
    assert.match(community, /writeThemeCommit\(userId,result\.data\.updated_at,remoteTheme\)/);
    const hydrationStart = community.indexOf("async function loadThemeForSession()");
    const hydrationEnd = community.indexOf("function releaseInitialThemeCover()", hydrationStart);
    const hydration = community.slice(hydrationStart, hydrationEnd);
    assert.doesNotMatch(hydration, /removeLocal\(scopedKey\(THEME_COMMIT_KEY,userId\)\)/);
});

test("confirmed Custom Theme saves verify and retain the database update timestamp", () => {
    const saveStart = community.indexOf("async function saveCustomTheme()");
    const resetStart = community.indexOf("async function resetCustomTheme()", saveStart);
    const save = community.slice(saveStart, resetStart);
    assert.match(save, /theme_config,updated_at/);
    assert.match(save, /writeThemeCommit\(themeUserId,persisted\.updated_at\|\|saved\.data\?\.updated_at,theme\)/);
});


test("the last independently verified complete theme snapshot wins over stale or empty later reads", () => {
    assert.match(community, /function writeThemeCommit\(userId,updatedAt,theme\)/);
    assert.match(community, /theme:cleanTheme\(theme\)/);
    assert.match(community, /function sameThemeSnapshot\(left,right\)/);
    assert.match(community, /if\(commit\?\.theme&&!sameThemeSnapshot\(remoteTheme,commit\.theme\)\)/);
    assert.match(community, /if\(commit\?\.theme\)\s*\{[\s\S]*?A temporarily empty\/stale read must not turn a confirmed custom theme into Dark/);
    assert.match(community, /writeThemeCommit\(themeUserId,persisted\.updated_at\|\|saved\.data\?\.updated_at,theme\)/);
});

test("reset and expired entitlement clear the committed theme snapshot", () => {
    const clear = community.match(/function clearLocalThemeState\(userId\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(clear, /removeLocal\(scopedKey\(THEME_COMMIT_KEY,userId\)\)/);
    const expiry = community.match(/async function clearThemeAfterExpiry\(userId,request\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(expiry, /THEME_COMMIT_KEY/);
});
