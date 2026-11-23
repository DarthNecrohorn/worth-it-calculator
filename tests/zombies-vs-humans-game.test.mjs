import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../zombies-vs-humans.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../zombies-vs-humans.css", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/worth-it-zombies-vs-humans.sql", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../_redirects", import.meta.url), "utf8");

test("the secret entry is positioned immediately after Ship Tracking in both navigation menus", () => {
    const ship = html.indexOf('onclick="openShipTrackingFromMenu()"');
    const secret = html.indexOf('id="zvhNavEntry"');
    const moreShip = html.indexOf('onclick="openShipTrackingFromMenu()"', ship + 1);
    const moreSecret = html.indexOf('id="zvhMoreMenuEntry"');
    assert.ok(ship >= 0 && secret > ship);
    assert.ok(moreShip > ship && moreSecret > moreShip);
    assert.match(html.slice(ship, secret), /Ship tracking/);
    assert.match(html.slice(moreShip, moreSecret), /Ship tracking/);
    assert.match(html, /id="zvhNavEntry"[^>]*hidden/);
    assert.match(html, /id="zvhMoreMenuEntry"[^>]*hidden/);
});

test("the game has its own routed app section, menu asset references and a canonical URL", () => {
    assert.match(html, /<section class="app zvh-section" id="zvhGameSection"/);
    assert.match(html, /zombies-vs-humans\.css\?v=/);
    assert.match(html, /zombies-vs-humans\.js\?v=/);
    assert.match(html, /id="zvhStartRun"/);
    assert.match(redirects, /\/zombiesvshumans\/ \/zombiesvshumans 301/);
    assert.match(js, /const ROUTE = "\/zombiesvshumans"/);
});

test("the zombie discovery button sits beside the hero slogan and unlocks the game", () => {
    assert.ok(html.includes('✦ Smart decisions made simple <button type="button" id="zvhDiscoveryEgg"'));
    assert.ok(html.includes('id="zvhDiscoveryEgg"') && html.includes("hidden>🧟</button>"));
    assert.ok(css.includes(".zvh-discovery-egg{position:relative;display:inline-grid"));
    assert.ok(css.includes(".zvh-discovery-egg[hidden]{display:none!important}"));
    assert.ok(js.includes("function unlockGame()"));
    assert.ok(js.includes("profile.unlocked=true"));
    assert.ok(js.includes("if(profile.unlocked)return"));
    assert.ok(js.includes('const EGG_ID = "zvhDiscoveryEgg";'));
    assert.ok(js.includes("discovery.hidden=visible"));
    assert.ok(js.includes('$(EGG_ID)?.addEventListener("click",unlockGame)'));
    assert.ok(!js.includes("scheduleEgg("));
    assert.ok(!js.includes("IS_PAGES_PREVIEW"));
    assert.ok(html.includes("zvh-controls-animation-abilities-20261123g"));
    assert.ok(js.includes('STORAGE_PREFIX = "worthItZvhSave:v1:"'));
    assert.ok(js.includes('zvhNavEntry","zvhMoreMenuEntry'));
});
test("Zombie mode has orders and progressively stronger human military attackers", () => {
    for (const order of ["follow", "attack", "smash"]) assert.ok(html.includes('data-zvh-order="'+order+'"'));
    for (const type of ["civilian", "police", "soldier", "tank", "heli"]) assert.ok(js.includes(type+":{"));
    assert.match(js, /Math\.floor\(run\.elapsed\/28\)\+1/);
    assert.match(js, /function updateAI\(dt\)/);
    assert.match(js, /function convertHuman/);
    assert.match(js, /function destroyProp/);
});

test("Human mode supports paid follower recruitment and increasingly dangerous zombie classes", () => {
    assert.match(html, /id="zvhHireAlly"/);
    assert.match(js, /function hireAlly\(\)/);
    assert.match(js, /profile\.coins<90/);
    for (const type of ["walker", "runner", "brute", "armored", "boss"]) assert.ok(js.includes(type+":{"));
});

test("the game has separate mode maps, upgrade catalogues and local save isolation from CALC", () => {
    for (const id of ["city", "mall", "industrial", "safehouse", "military", "metro"]) assert.ok(js.includes('id:"'+id+'"'));
    assert.match(js, /upgradeCatalog = \{/);
    assert.match(html, /All purchases use Zombies vs Humans coins/);
    assert.match(js, /TABLE = "worth_it_zvh_game_saves"/);
    assert.match(js, /Math\.max\(0,Math\.min\(10000000/);
});

test("PC controls can be remapped uniquely and mobile horde commands are visible",()=>{
  for(const id of ["zvhKeyFollow","zvhKeyAttack","zvhKeySmash","zvhKeySpecial","zvhTouchFollow","zvhTouchAttack","zvhTouchSmash","zvhTouchSpecial"])assert.ok(html.includes('id="'+id+'"'));
  assert.match(js,/const validKeys=/);assert.match(js,/That key is already assigned/);assert.match(js,/bindings\.special/);
});
test("actors animate limbs, zombies reach forward, armed humans carry guns and projectiles glow",()=>{
  assert.match(js,/const stride=moving\?Math\.sin\(phase\)/);assert.match(js,/if\(armed\)/);assert.match(js,/b\.radius\*2\.6/);assert.match(js,/WEAK HOWL/);
});
test("maps draw roads and spawn wrecked or burning vehicles",()=>{assert.match(js,/Broad asphalt avenues/);assert.match(js,/burning:vehicle/);assert.match(js,/p\.scorch/);});
test("PC controls are explained below the game and update when bindings change",()=>{assert.match(html,/id="zvhPcKeyGuide"/);assert.match(css,/\.zvh-pc-key-guide/);assert.match(js,/function updatePcKeyGuide\(/);assert.match(js,/HORDE · FOLLOW/);});
test("each human-mode zombie class has a distinct combat ability",()=>{for(const ability of ["LUNGE BITE","RUSH","GROUND SLAM","IRON PLATING","SUMMON"])assert.ok(js.includes(ability));assert.match(js,/enemy\.lungeTime/);assert.match(js,/enemy\.slamWindup/);assert.match(js,/enemy\.armorUntil/);assert.match(js,/MUTANT OVERLORD · SUMMONING/);});
test("starter zombie howl provides a weak but real temporary horde buff",()=>{assert.match(js,/WEAK HOWL/);assert.match(js,/rallyUntil/);assert.match(js,/rallied\?1\.18:1/);assert.match(js,/rallied\?2:0/);});
test("the game contains touch controls and configurable visual effects", () => {
    assert.match(html, /id="zvhJoystick"/);
    assert.match(html, /id="zvhTouchAttack"/);
    assert.match(html, /id="zvhTouchSpecial"/);
    assert.match(html, /id="zvhGoreToggle"/);
    assert.match(css, /@media\(max-width:600px\)/);
});

test("the cloud save table is private, row-scoped and explicitly exposed only to authenticated users", () => {
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /grant select, insert, update .* to authenticated/i);
    assert.match(sql, /revoke all privileges .* from public, anon, authenticated/i);
    assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql, /on delete cascade/i);
    assert.doesNotMatch(sql, /grant .* to anon/i);
});

test("the game source parses as a standalone browser script", () => {
    assert.doesNotThrow(() => new vm.Script(js, { filename: "zombies-vs-humans.js" }));
});
