import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const calls = readFileSync(new URL("../chat-enhancements.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../chat-enhancements.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function loadWallpaperGenerator() {
    const start = calls.indexOf("const CHAT_WALLPAPER_MOTIFS =");
    const end = calls.indexOf("\nfunction applyChatWallpaper(contextValue) {", start);
    assert.ok(start >= 0 && end > start, "the wallpaper generator source should be present");
    const sandbox = { GLOBAL_CHAT_ID: "global-chat-test-id" };
    runInNewContext(
        calls.slice(start, end) + "\nglobalThis.__makeConversationWallpaper = makeConversationWallpaper;",
        sandbox,
        { timeout: 1500 }
    );
    return sandbox.__makeConversationWallpaper;
}

function parseEntries(svg, kind) {
    const pattern = kind === "doodle"
        ? /<g data-wallpaper-doodle="1" data-x="([\d.]+)" data-y="([\d.]+)" data-radius="([\d.]+)" data-scale="([\d.]+)" data-color="([^"]+)" data-motif="(\d+)" data-angle="(\d+)"/g
        : /<g data-wallpaper-accent="1" data-x="([\d.]+)" data-y="([\d.]+)" data-radius="([\d.]+)" data-color="([^"]+)" data-geometry="(\d+)" data-scale="([\d.]+)" data-angle="(\d+)"/g;
    return Array.from(svg.matchAll(pattern), match => ({
        x: Number(match[1]),
        y: Number(match[2]),
        radius: Number(match[3]),
        scale: kind === "doodle" ? Number(match[4]) : Number(match[6]),
        color: kind === "doodle" ? match[5] : match[4],
        shape: Number(match[kind === "doodle" ? 6 : 5]),
        angle: Number(match[7])
    }));
}
function assertSeparated(a, b, gap, message) {
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            if (a === b && j <= i) continue;
            const distance = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
            assert.ok(distance + 0.15 >= a[i].radius + b[j].radius + gap,
                message + " (entries " + i + " and " + j + ")");
        }
    }
}

test("wallpaper has a few varied large drawings and smaller unique drawings in the open gaps", () => {
    const makeWallpaper = loadWallpaperGenerator();
    const svg = makeWallpaper({ conversationType: "direct", conversationId: "wallpaper-test" }, "dark", 600);
    assert.match(svg, /width="600" height="900" viewBox="0 0 600 900"/);

    const doodles = parseEntries(svg, "doodle");
    const accents = parseEntries(svg, "accent");
    assert.ok(doodles.length >= 12 && doodles.length <= 34,
        "a conversation tile should contain a dense mix of larger illustrations");
    assert.ok(accents.length >= 45 && accents.length <= 107,
        "smaller illustrations should fill more open gaps without exhausting unique motifs");
    assert.ok(doodles.length + accents.length >= 80,
        "a 600px wallpaper tile should feel noticeably denser than the previous layout");

    const scales = doodles.map(item => item.scale);
    assert.ok(Math.max(...scales) - Math.min(...scales) >= 0.35,
        "large illustrations should have visibly different sizes");
    const allDrawings = doodles.concat(accents);
    assert.equal(new Set(allDrawings.map(item => item.shape)).size, allDrawings.length,
        "large and small motifs must not repeat within a wallpaper tile");
    assert.ok(new Set(allDrawings.map(item => item.color)).size >= 4,
        "nearby drawings should use a variety of colors");
    assert.ok(new Set(allDrawings.map(item => item.angle)).size >= 6,
        "drawings should face different directions instead of standing upright");
    assert.ok(new Set(doodles.map(item => item.y.toFixed(0))).size > doodles.length * 0.8,
        "large drawings should not line up in regular horizontal rows");
    assert.ok(Math.max(...accents.map(item => item.scale)) - Math.min(...accents.map(item => item.scale)) >= 0.08,
        "small illustrations should also vary in size");

    assertSeparated(doodles, doodles, 12, "large drawings must not overlap");
    assertSeparated(doodles, accents, 8, "small drawings must stay out of large illustrations");
    assertSeparated(accents, accents, 6, "small drawings must not overlap each other");

    for (let i = 0; i < doodles.length; i++) {
        for (let j = i + 1; j < doodles.length; j++) {
            if (Math.hypot(doodles[i].x - doodles[j].x, doodles[i].y - doodles[j].y) < 260) {
                assert.notEqual(doodles[i].color, doodles[j].color,
                    "nearby large drawings should not repeat the same color");
            }
        }
    }
});
test("wallpaper avoids horizontal tiling and sizes its generated tile to the message area", () => {
    assert.match(calls, /surface\.clientWidth \|\| window\.innerWidth \|\| 600/);
    assert.match(calls, /surface\.style\.setProperty\("--worthit-chat-wallpaper-size", tileWidth \+ "px " \+ tileHeight \+ "px"\)/);
    assert.match(calls, /new ResizeObserver\(\(\) => applyChatWallpaper\(currentContext \|\| context\(\)\)\)/);
    assert.match(css, /background-repeat:no-repeat,repeat-y!important/);
    assert.match(css, /var\(--worthit-chat-wallpaper-size/);
    const finalWallpaperCss = css.slice(css.lastIndexOf("/* Final chat wallpaper:"));
    assert.match(finalWallpaperCss, /background-image:[\s\S]*var\(--worthit-chat-wallpaper-image,none\)/);
    assert.doesNotMatch(finalWallpaperCss, /data:image\/svg\+xml|310px 370px|260px 320px/);
    assert.match(html, /chat-enhancements\.js\?v=chat-wallpaper-collision-packed-20261030a/);
    assert.match(html, /chat-enhancements\.css\?v=chat-safety-note-wallpaper-density-20261029a/);
});