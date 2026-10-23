import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("main-header controls are counter-scaled so they keep A-sized physical dimensions", () => {
    const lockStart = css.lastIndexOf("HEADER CONTROL SIZE LOCK — MATCH THE A SETTING");
    assert.ok(lockStart >= 0, "the final header-size lock rules exist");
    const lock = css.slice(lockStart);

    assert.match(lock, /\.nav-inner > \.menu-btn,[\s\S]*?\.nav-secondary-row > button\s*\{\s*zoom:\s*calc\(1\s*\/\s*var\(--ui-scale,\s*1\)\)\s*!important;/);
    assert.doesNotMatch(lock, /\.nav-inner > \.logo\s*,/);
    assert.match(lock, /html\[data-ui-scale\] \.nav-inner > \.menu-btn\s*\{[\s\S]*?width:\s*30px !important;[\s\S]*?height:\s*30px !important;/);
    assert.match(lock, /html\[data-ui-scale\] \.nav-right-stack \.nav-secondary-row > button,[\s\S]*?width:\s*32px !important;[\s\S]*?height:\s*32px !important;/);
    assert.match(css, /body\s*\{[\s\S]*?zoom:\s*var\(--ui-scale,\s*1\)\s*;/);
    assert.match(html, /style\.css\?v=header-controls-locked-a-20261023b/);
});

test("regular mobile header buttons return to the A-size baseline at A+ and A++", () => {
    const lock = css.slice(css.lastIndexOf("HEADER CONTROL SIZE LOCK — MATCH THE A SETTING"));
    assert.match(lock, /@media \(min-width: 381px\) and \(max-width: 900px\)[\s\S]*?width:\s*32px !important;[\s\S]*?height:\s*32px !important;[\s\S]*?font-size:\s*15px !important;/);
    assert.match(lock, /@media \(max-width: 380px\)[\s\S]*?width:\s*27px !important;[\s\S]*?height:\s*27px !important;[\s\S]*?font-size:\s*13px !important;/);
});

test("mobile profile tap target and avatar stay at their A-size dimensions for every UI scale", () => {
    const lock = css.slice(css.lastIndexOf("HEADER CONTROL SIZE LOCK — MATCH THE A SETTING"));
    assert.match(lock, /@media \(min-width: 361px\) and \(max-width: 700px\)[\s\S]*?\.profile-nav-btn[\s\S]*?width:\s*40px !important;[\s\S]*?width:\s*34px !important;/);
    assert.match(lock, /@media \(max-width: 360px\)[\s\S]*?\.profile-nav-btn[\s\S]*?width:\s*36px !important;[\s\S]*?width:\s*30px !important;/);
});


test("phone header controls use scale-adjusted A dimensions instead of inverse zoom", () => {
    const lockStart = css.lastIndexOf("MOBILE HEADER A-SIZE LOCK v2");
    assert.ok(lockStart >= 0, "the corrected mobile lock is the last CSS sizing layer");
    const lock = css.slice(lockStart);

    assert.match(lock, /html\[data-ui-scale\] \.nav-top-row \.nav-actions > \.worth-it-notification-wrap > \.worth-it-notification-bell\s*\{\s*zoom: 1 !important;[\s\S]*?width: calc\(36px \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height: calc\(36px \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(lock, /html\[data-ui-scale\] \.nav-top-row \.nav-actions > \.worth-it-chat-nav-wrap > \.worth-it-chat-nav-btn\s*\{\s*zoom: 1 !important;[\s\S]*?width: calc\(42px \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height: calc\(42px \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(lock, /html\[data-ui-scale\] \.nav-top-row \.nav-actions > \.ai-chat-nav-btn,[\s\S]*?width: calc\(32px \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height: calc\(32px \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(lock, /html\[data-ui-scale\] \.nav-top-row \.nav-actions > \.auth-wrap > \.profile-nav-btn\s*\{\s*zoom: 1 !important;[\s\S]*?width: calc\(40px \/ var\(--ui-scale, 1\)\) !important;[\s\S]*?height: calc\(40px \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(lock, /@media \(max-width: 380px\)[\s\S]*?width: calc\(27px \/ var\(--ui-scale, 1\)\) !important;/);
    assert.match(html, /style\.css\?v=header-controls-locked-a-20261023b/);
});
