import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const routing = readFileSync(new URL("../routing.js", import.meta.url), "utf8");
const realtimeCss = readFileSync(new URL("../chat-realtime.css", import.meta.url), "utf8");
const actionsCss = readFileSync(new URL("../chat-actions.css", import.meta.url), "utf8");

test("profile route history stores its exact predecessor and Back has a safe direct-link fallback", () => {
    assert.match(routing, /worthItRoutePath: target/);
    assert.match(routing, /worthItRoutePrevious: previousRoute/);
    assert.match(routing, /previousRoute\.startsWith\("\/"\)/);
    assert.match(routing, /window\.history\.back\(\)/);
    assert.match(routing, /applyRoute\(window\.location\.pathname, \{ initial: false \}\)/);
    assert.match(html, /onclick="backFromWorthItProfile\(\)">← Back/);
});

test("refreshing a compact chat restores its last size within the current tab", () => {
    assert.match(client, /WORTH_IT_CHAT_FULLSCREEN_PREFERENCE_KEY/);
    assert.match(client, /window\.sessionStorage\.getItem\(WORTH_IT_CHAT_FULLSCREEN_PREFERENCE_KEY\)/);
    assert.match(client, /window\.sessionStorage\.setItem\(WORTH_IT_CHAT_FULLSCREEN_PREFERENCE_KEY, isFullscreen \? "fullscreen" : "compact"\)/);
    assert.match(client, /const preference = getWorthItChatFullscreenPreference\(\);[\s\S]*?setWorthItChatFullscreen\(preference === false \? false : true, \{persist:false\}\)/);

    const refreshHandler = client.match(/window\.refreshWorthItChatData = async function \(\) \{([\s\S]*?)\n\};/);
    assert.ok(refreshHandler, "the manual refresh handler should exist");
    assert.match(refreshHandler[1], /const wasFullscreen = Boolean\(/, "refresh captures the initial panel size");
    assert.match(refreshHandler[1], /setWorthItChatFullscreen\(wasFullscreen, \{persist:false\}\)/, "refresh restores the initial panel size");
});

test("clicking outside the /chat panel does not replace the route with Home", () => {
    assert.match(client, /if \(event\.target !== this\) return;[\s\S]*?if \(isChatRoutePath\(\)\) return;[\s\S]*?showChatOverlay\(false\)/);
});

test("typing publishes immediately while profile identity loads in the background", () => {
    assert.match(client, /if \(typing && !profile && chatOwnProfileLoadedForUser !== user\.id\)\s*\{\s*void getWorthItChatOwnProfile\(\)\.then\(refreshedProfile =>/);
    assert.match(client, /await channel\.track\(\{[\s\S]*?typing: Boolean\(typing\)/);
    assert.doesNotMatch(client, /if \(typing\) profile = await getWorthItChatOwnProfile\(\)/);
});

test("Realtime typing retries after channel errors instead of staying permanently disabled", () => {
    assert.match(client, /chatRealtimeRetryTimer = window\.setTimeout\(\(\) => \{[\s\S]*?stopWorthItChatRealtimeChannel\(\);\s*void syncWorthItChatRealtimeChannel\(\);[\s\S]*?\}, 2200\)/);
    assert.match(client, /status === "CHANNEL_ERROR" \|\| status === "TIMED_OUT" \|\| status === "CLOSED"/);
});

test("typing display has an animated three-dot indicator with reduced-motion support", () => {
    assert.match(client, /worth-it-chat-typing-dots/);
    assert.match(client, /worth-it-chat-typing-dot/);
    assert.match(realtimeCss, /@keyframes worthItChatTypingPulse/);
    assert.match(realtimeCss, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(realtimeCss, /\.worth-it-chat-fullscreen-btn:hover/);
});

test("per-message Copy action uses the two-page SVG icon and retains its text-copy handler", () => {
    assert.match(client, /button\.classList\.add\("worth-it-chat-copy-action"\)/);
    assert.match(client, /class="worth-it-chat-copy-icon"/);
    assert.match(client, /\(\) => copyWorthItChatMessage\(message\)/);
    assert.match(actionsCss, /\.worth-it-chat-copy-icon/);
    assert.match(actionsCss, /\.worth-it-chat-copy-action/);
    assert.match(html, /chat-actions\.css\?v=chat-message-actions-20261028c/);
    assert.match(html, /chat-realtime\.css\?v=chat-realtime-typing-20261028b/);
    assert.match(html, /chat-ui\.js\?v=chat-navigation-typing-ux-20261028a/);
    assert.match(html, /routing\.js\?v=profile-navigation-hardening-20261028a/);
});
