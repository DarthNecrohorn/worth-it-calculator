import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const profileUi = read("profile-ui.js");
const style = read("style.css");
const html = read("index.html");

test("only the current owner's profile receives the dedicated profile state", () => {
    assert.match(profileUi, /profileSection\.classList\.toggle\("own-profile-view",Boolean\(isOwn\)\)/);
    assert.match(profileUi, /profileSection\.classList\.toggle\("signed-in-other-profile-view",Boolean\(currentUser\)&&!isOwn\)/);
    assert.match(profileUi, /profileSection\.classList\.toggle\("signed-out-profile-view",!currentUser\)/);
});

test("owner profile statistics move left 100px and down 40px only on desktop", () => {
    assert.match(style, /@media \(min-width: 1051px\)\s*\{[\s\S]*?#profileSection\.own-profile-view \.worth-it-profile-social-column \.worth-it-profile-stats\s*\{\s*transform: translate\(-30px, -110px\)/);
    assert.match(style, /@media\(max-width:1050px\)[\s\S]*?\.worth-it-profile-social-column \.worth-it-profile-stats\{transform:none\}/);
});

test("guest and other-member profile stat positions are preserved", () => {
    assert.match(style, /#profileSection\.signed-out-profile-view \.worth-it-profile-social-column \.worth-it-profile-stats\{transform:translate\(10px,10px\)\}/);
    assert.match(style, /#profileSection\.signed-in-other-profile-view \.worth-it-profile-social-column \.worth-it-profile-stats\{transform:translate\(170px,0px\)\}/);
});

test("profile and stylesheet revisions are refreshed for all clients", () => {
    assert.match(html, /own-profile-position-state=20261127a/);
    assert.match(html, /own-profile-stats-ac-flag=20261127a/);
});
