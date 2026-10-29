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
        ? /<g data-wallpaper-doodle="1" data-x="([\d.]+)" data-y="([\d.]+)" data-radius="([\d.]+)" data-scale="([\d.]+)" data-color="([^"]+)" data-motif="(\d+)"/g
        : /<g data-wallpaper-accent="1" data-x="([\d.]+)" data-y="([\d.]+)" data-radius="([\d.]+)" data-color="([^"]+)" data-geometry="(\d+)"/g;
    return Array.from(svg.matchAll(pattern), match => ({
        x: Number(match[1]),
        y: Number(match[2]),
        radius: Number(match[3]),
        scale: kind === "doodle" ? Number(match[4]) : null,
        color: kind === "doodle" ? match[5] : match[4],
        shape: Number(match[kind === "doodle" ? 6 : 5])
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

test("wallpaper doodles are visibly different sizes, randomly placed, unique and non-overlapping", () => {
    const makeWallpaper = loadWallpaperGenerator();
    const svg = makeWallpaper({ conversationType: "direct", conversationId: "wallpaper-test" }, "dark", 600);
    assert.match(svg, /width="600" height="900" viewBox="0 0 600 900"/);

    const doodles = parseEntries(svg, "doodle");
    const accents = parseEntries(svg, "accent");
    assert.ok(doodles.length >= 8, "the wallpaper should contain a useful number of large doodles");
    assert.ok(accents.length >= 6, "the wallpaper should include scattered small accents");

    const scales = doodles.map(item => item.scale);
    assert.ok(Math.max(...scales) - Math.min(...scales) >= 0.35,
        "at least one large and one small doodle should be visibly different in scale");
    assert.equal(new Set(doodles.map(item => item.shape)).size, doodles.length,
        "a large motif should not repeat within the same wallpaper tile");
    assert.ok(new Set(doodles.map(item => item.y.toFixed(0))).size > doodles.length * 0.8,
        "doodles should not line up in regular horizontal rows");

    assertSeparated(doodles, doodles, 12, "large doodles must not overlap");
    assertSeparated(doodles, accents, 8, "small accents must not overlap large doodles");
    assertSeparated(accents, accents, 6, "small accents must not overlap each other");

    for (let i = 0; i < doodles.length; i++) {
        for (let j = i + 1; j < doodles.length; j++) {
            if (Math.hypot(doodles[i].x - doodles[j].x, doodles[i].y - doodles[j].y) < 260) {
                assert.notEqual(doodles[i].color, doodles[j].color,
                    "nearby large doodles should not repeat the same color");
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
    assert.match(html, /chat-enhancements\.js\?v=chat-media-lightbox-wallpaper-20261029a/);
    assert.match(html, /chat-enhancements\.css\?v=chat-media-lightbox-wallpaper-20261029a/);
});