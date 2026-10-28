import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const client = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const routing = readFileSync(new URL("../routing.js", import.meta.url), "utf8");
const realtimeCss = readFileSync(new URL("../chat-realtime.css", import.meta.url), "utf8");
const actionsCss = readFileSync(new URL("../chat-actions.css", import.meta.url), "utf8");

function createRoutingHarness(initialPath = "/profile/1", initialState = null) {
    const origin = "https://worth-it-calculator.pages.dev";
    const entries = [{ pathname: initialPath, state: initialState }];
    let index = 0;
    const documentListeners = Object.create(null);
    const windowListeners = Object.create(null);
    const shownViews = [];
    const toPath = target => new URL(target, origin).pathname;

    const location = {
        origin,
        get pathname() { return entries[index].pathname; },
        get search() { return ""; },
        get hash() { return ""; }
    };
    const history = {
        get state() { return entries[index].state; },
        get length() { return entries.length; },
        pushState(state, _title, target) {
            entries.splice(index + 1);
            entries.push({ pathname: toPath(target), state });
            index = entries.length - 1;
        },
        replaceState(state, _title, target) {
            entries[index] = { pathname: toPath(target), state };
        },
        back() {
            if (index <= 0) return;
            index -= 1;
            for (const handler of windowListeners.popstate || []) handler();
        }
    };
    const document = {
        addEventListener(type, handler) {
            (documentListeners[type] ||= []).push(handler);
        },
        getElementById() { return null; },
        querySelectorAll() { return []; },
        documentElement: {
            classList: {
                contains() { return false; },
                remove() {}
            }
        }
    };
    const window = {
        location,
        history,
        addEventListener(type, handler) {
            (windowListeners[type] ||= []).push(handler);
        },
        setTimeout,
        clearTimeout,
        URL,
        showHome() { shownViews.push("home"); },
        openWorthItProfile(id) { shownViews.push("profile:" + id); },
        openWorthItProfileConnections(id, category) { shownViews.push("connections:" + id + ":" + category); },
        hideWorthItProfileSection() {}
    };
    runInNewContext(routing, { window, document, URL });
    return { window, documentListeners, shownViews, location, history };
}

function clickProfileLink(harness, path) {
    const anchor = {
        href: "https://worth-it-calculator.pages.dev" + path,
        target: "",
        hasAttribute() { return false; }
    };
    const event = {
        target: { closest() { return anchor; } },
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault() { this.defaultPrevented = true; }
    };
    harness.documentListeners.click[0](event);
    return event;
}

test("profile navigation keeps links in the SPA and prevents Home content from remaining under a profile URL", () => {
    assert.match(routing, /worthItRoutePath: target/);
    assert.match(routing, /worthItRoutePrevious: previousRoute/);
    assert.match(routing, /previousRoute\.startsWith\("\/"\)/);
    assert.match(routing, /window\.history\.back\(\)/);
    assert.match(routing, /document\.addEventListener\("click", function \(event\)/);
    assert.match(routing, /clicked\.closest\("a\[href\]"\)/);
    assert.match(routing, /window\.openWorthItProfile\(id\)/);
    assert.match(routing, /worthItRoutePath: "\/"/);
    assert.match(routing, /window\.history\.replaceState\([\s\S]*?worthItRoutePath: "\/"/);
    assert.match(html, /onclick="backFromWorthItProfile\(\)">← Back/);
});

test("profile Back restores the previous profile after own -> friend -> own -> Back", () => {
    const app = createRoutingHarness("/profile/1");
    clickProfileLink(app, "/profile/2");
    clickProfileLink(app, "/profile/1");

    app.window.backFromWorthItProfile();

    assert.equal(app.location.pathname, "/profile/2");
    assert.equal(app.shownViews.at(-1), "profile:2");
});

test("a directly opened profile Back changes both the rendered view and URL to Home", () => {
    const app = createRoutingHarness("/profile/2");
    app.window.backFromWorthItProfile();

    assert.equal(app.location.pathname, "/");
    assert.equal(app.shownViews.at(-1), "home");
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

test("typing indicator waits about one second, then uses low-latency broadcast with Presence fallback", () => {
    assert.match(client, /CHAT_TYPING_START_DELAY_MS = 1000/);
    assert.match(client, /chatTypingStartTimer = window\.setTimeout\([\s\S]*?CHAT_TYPING_START_DELAY_MS/);
    assert.match(client, /type: "broadcast",\s*event: "typing"/);
    assert.match(client, /channel\.on\("broadcast", \{event: "typing"\}, event => handleWorthItChatTypingBroadcast\(channel, event\)\)/);
    assert.match(client, /if \(chatTypingActive && chatTypingReadyToPublish\) void publishWorthItChatTyping\(true, channel\)/);
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
    assert.match(html, /chat-ui\.js\?v=chat-media-emoji-20261028b/);
    assert.match(html, /routing\.js\?v=profile-navigation-hardening-20261028b/);
});
