import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync(new URL("../settings.js", import.meta.url), "utf8");
const profileUi = readFileSync(new URL("../profile-ui.js", import.meta.url), "utf8");
const community = readFileSync(new URL("../community-features.js", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../site-theme-system.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ugcCss = readFileSync(new URL("../ugc-calculators.css", import.meta.url), "utf8");

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

test("member profiles keep the saved Custom Theme while preserving the uploaded banner underneath content", () => {
    assert.match(community, /const theme=selectedTheme/);
    assert.match(community, /setWorthItProfileThemeIsolation=function\(\)/);
    assert.match(community, /root\.classList\.remove\("worth-it-profile-theme-isolated"\)/);
    assert.match(themeCss, /profile-banner-active/);
    assert.match(themeCss, /worth-it-profile-stat/);
    assert.match(themeCss, /backdrop-filter: blur\(13px\)/);
    assert.match(themeCss, /worth-it-profile-cover\.has-banner/);
});

test("profile sections appear in Friends, Badges, Favorite Calculators order", () => {
    const friends = html.indexOf('id="worthItProfileFriendsPreview"');
    const badges = html.indexOf('id="worthItProfileBadgesSection"');
    const favorites = html.indexOf('id="worthItProfileFavouritesSection"');
    assert.ok(friends >= 0 && badges > friends && favorites > badges);
});

test("badge collections show every badge vertically and use an explicit read-only details dialog", () => {
    assert.match(profileUi, /badges\|\|\[\]\)\.filter\(badge=>badge&&badge\.earned===true&&badge\.equipped===true\)\.slice\(0,1\)/);
    assert.match(profileUi, /manage\.hidden=false/);
    assert.match(profileUi, /createWorthItBadgeTrigger\(badge,false\)/);
    assert.match(profileUi, /canEquip:info\.is_own_profile===true/);
    assert.match(profileUi, /badge\.how_to_get/);
    assert.match(profileUi, /badge\.type/);
    assert.match(profileUi, /badge\.duration/);
    assert.match(profileUi, /set_worth_it_profile_badge_equipped/);
    assert.match(profileUi, /worthItBadgeInfoClose/);
    assert.match(profileUi, /worthItBadgeInfoClose.*addEventListener\("click",closeWorthItBadgeInfo\)/);
    assert.match(html, /id="worthItBadgeInfoOverlay"/);
    assert.match(html, /id="worthItBadgeInfoClose"/);
    assert.match(ugcCss, /\.worth-it-profile-badge-row\.is-locked[\s\S]*?opacity:\.34/);
    assert.match(ugcCss, /backdrop-filter:blur\(14px\)/);
    assert.match(ugcCss, /\.worth-it-badge-info-close/);
    assert.doesNotMatch(ugcCss, /\.worth-it-badge-info-overlay[^}]*cursor:\s*pointer/);
});
