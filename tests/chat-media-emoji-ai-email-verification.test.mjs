import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const chat = readFileSync(new URL("../chat-ui.js", import.meta.url), "utf8");
const ai = readFileSync(new URL("../ai-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("Worth It local GIF previews avoid blob-only image URLs and keep attachment bytes validated", () => {
    assert.match(chat, /data:image\/gif;base64,/);
    assert.match(chat, /signature !== "GIF87a" && signature !== "GIF89a"/);
    assert.match(chat, /new File\(\[asset\.blob\], "worth-it-" \+ item\.id \+ "\.gif"/);
    assert.match(html, /chat-ui\.js\?v=chat-media-emoji-20261029a/);
});

test("Plants contains an expanded selection separate from Animals and before Food", () => {
    const plants = chat.match(/addWorthItChatEmojiGroup\("plants", "([^"]+)"\);/)?.[1] || "";
    const animals = chat.match(/addWorthItChatEmojiGroup\("animals", "([^"]+)"\);/)?.[1] || "";
    assert.ok(plants.trim().split(/\s+/).length >= 40);
    for (const emoji of ["🌱", "🌿", "🌳", "🌷", "🌻", "🪻", "🪸", "🍄"]) assert.ok(plants.includes(emoji));
    for (const emoji of ["🌱", "🌿", "🌳", "🌷", "🌻"]) assert.ok(!animals.includes(emoji));
});

test("AI overlay stays above the header, uses a desktop offset and fills the phone viewport", () => {
    assert.match(css, /\.ai-chat-overlay\.open \.ai-chat-card\s*\{[^}]*transform: translateY\(40px\)/);
    assert.match(css, /\.ai-chat-overlay\s*\{[^}]*backdrop-filter: blur\(14px\)/);
    assert.match(css, /\.ai-chat-overlay\s*\{[^}]*z-index: 2147483646/);
    assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.ai-chat-overlay\.open \.ai-chat-card\s*\{[\s\S]*?width: calc\(100vw - 24px\)/);
    assert.match(html, /style\.css\?v=user-reports-email-gate-20261029c/);
});

test("unverified accounts get guest privileges, a daily resend button and email-app shortcut", () => {
    assert.match(app, /function isWorthItEmailVerified\(user\)/);
    assert.match(app, /user\.email_confirmed_at \|\| user\.confirmed_at/);
    assert.match(app, /function updateWorthItEmailVerificationGate\(user\)/);
    assert.match(app, /window\.worthItPendingEmailUser = sessionUser && !currentAuthUser \? sessionUser : null/);
    assert.match(app, /window\.requestWorthItEmailVerification = function\(user\)/);
    assert.match(app, /Do not interrupt ordinary browsing/);
    assert.match(app, /document\.addEventListener\("focusin"/);
    assert.match(app, /resend-email-confirmation/);
    assert.match(app, /worthItEmailResendNextAllowedAtV1/);
    assert.match(app, /https:\/\/mail\.google\.com\//);
    assert.match(app, /https:\/\/outlook\.live\.com\/mail\//);
    assert.match(chat, /!window\.isWorthItEmailVerified\(window\.worthItCurrentAuthUser \|\| chatUser\)/);
    assert.match(ai, /!window\.isWorthItEmailVerified\(window\.worthItCurrentAuthUser \|\| currentAuthUser\)/);
    assert.match(css, /\.worth-it-email-gate\s*\{[\s\S]*?position: fixed[\s\S]*?pointer-events: none/);
    assert.match(css, /\.worth-it-email-gate-card\s*\{[\s\S]*?pointer-events: auto/);
    assert.match(html, /app\.js\?v=action-triggered-email-gate-20261029c/);
    assert.match(html, /ai-ui\.js\?v=email-verification-20261028a/);
});
