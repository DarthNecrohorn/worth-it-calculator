import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("main-header controls use inverse zoom only where the navbar itself is not counter-zoomed", () => {
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

test("A+ and A++ phone controls do not receive a second inverse zoom", () => {
    const fixStart = css.lastIndexOf("MOBILE HEADER DOUBLE-ZOOM FIX — A+ / A++ ONLY");
    assert.ok(fixStart >= 0, "the mobile double-zoom correction exists");
    const fix = css.slice(fixStart);
    assert.match(fix, /html\[data-ui-scale="large"\] \.nav-top-row \.nav-actions > \.ai-chat-nav-btn,[\s\S]*?html\[data-ui-scale="xl"\] \.nav-secondary-row > button\s*\{\s*zoom:\s*1 !important;/);
    assert.match(fix, /html\[data-ui-scale="large"\] \.nav-top-row \.nav-actions > \.auth-wrap,[\s\S]*?width:\s*40px !important;[\s\S]*?flex:\s*0 0 40px !important;/);
    assert.match(fix, /@media \(max-width: 360px\)[\s\S]*?html\[data-ui-scale="large"\] \.nav-top-row \.nav-actions > \.auth-wrap,[\s\S]*?width:\s*36px !important;[\s\S]*?flex:\s*0 0 36px !important;/);
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
