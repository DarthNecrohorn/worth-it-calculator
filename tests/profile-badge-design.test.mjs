import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const profileUi = readFileSync(new URL("../profile-ui.js", import.meta.url), "utf8");
const badgeCss = readFileSync(new URL("../ugc-calculators.css", import.meta.url), "utf8");
const badgeSql = readFileSync(new URL("../supabase/worth-it-profile-badge-milestones.sql", import.meta.url), "utf8");

test("Settings navigation uses a centered, recognisable eight-tooth SVG gear", () => {
  assert.match(html, /worth-it-icon-settings[\s\S]*?M19\.14 12\.94/);
  assert.match(html, /<circle cx="12" cy="12" r="3\.15"/);
  assert.doesNotMatch(html, /worth-it-icon-settings[\s\S]{0,180}translate\(/);
});

test("profile badges render as scalable SVG artwork for subscription and achievement tiers", () => {
  assert.match(profileUi, /function getWorthItBadgeSvgMarkup\(badgeKey\)/);
  for (const key of ["owner", "premium", "premium_lite", "calculator_5", "calculator_10", "member_1m", "member_2m", "member_3m", "member_4m", "member_6m", "member_12m", "member_2y", "member_3y", "member_5y", "member_10y"]) {
    assert.match(profileUi, new RegExp(key + ":"));
  }
  assert.match(profileUi, /icon\.innerHTML=getWorthItBadgeSvgMarkup\(key\)/);
  assert.doesNotMatch(profileUi, /icon\.textContent=String\(badge\?\.icon/);
});

test("profile badges are visibly larger while chat badges keep their compact override", () => {
  assert.match(badgeCss, /\.worth-it-profile-badge-list \.worth-it-member-badge[\s\S]*?min-height:43px/);
  assert.match(badgeCss, /\.worth-it-profile-badge-manage \.worth-it-profile-badge-trigger[\s\S]*?min-height:48px/);
  assert.match(badgeCss, /\.worth-it-profile-name-badges \.worth-it-badge-mark[\s\S]*?width:19px/);
  assert.match(badgeCss, /\.worth-it-chat-member-badges \.worth-it-member-badge\{font-size:8px;padding:2px 6px\}/);
  assert.match(badgeCss, /data-badge="premium_lite"/);
  assert.match(badgeCss, /data-badge="premium"/);
  assert.match(badgeCss, /data-worth-it-custom-theme[\s\S]*?worth-it-badge-icon-svg/);
});

test("2, 3 and 4 month badges are defined, date-gated, and allowed to equip server-side", () => {
  for (const key of ["member_2m", "member_3m", "member_4m"]) {
    assert.match(badgeSql, new RegExp("'" + key + "'"));
    assert.match(badgeSql, new RegExp("when '" + key + "' then v_created_at <= now\\(\\)-interval '[234] months'"));
  }
  assert.match(badgeSql, /'2 MONTHS'/);
  assert.match(badgeSql, /'3 MONTHS'/);
  assert.match(badgeSql, /'4 MONTHS'/);
  assert.match(badgeSql, /if p_badge_key not in \([\s\S]*?'member_2m','member_3m','member_4m'/);
});


test("profile name badges use one consistent slightly larger icon size; chat badges grow evenly", () => {
  assert.match(badgeCss, /\.worth-it-profile-name-badges \.worth-it-badge-mark[\s\S]*?flex:0 0 21px/);
  assert.match(badgeCss, /\.worth-it-chat-member-badges \.worth-it-badge-mark[\s\S]*?flex:0 0 14px/);
  assert.match(badgeCss, /\.worth-it-profile-badge-list \.worth-it-member-badge\[data-badge="owner"\] \.worth-it-badge-mark\{\s*transform:translateY\(-2px\)/);
});
