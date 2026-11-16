import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../site-theme-system.css", import.meta.url), "utf8");

test("Settings navigation button uses a crisp theme-aware SVG gear instead of an emoji", () => {
  const button = html.match(/<button class="settings-btn"[^>]*>[\\s\\S]*?<\\/button>/)?.[0] || "";
  assert.match(button, /aria-label="Settings"/);
  assert.match(button, /<svg class="worth-it-icon worth-it-icon-settings"/);
  assert.match(button, /stroke="currentColor"/);
  assert.doesNotMatch(button, /⚙️?/);
});

test("AI Chat robot SVG is visibly larger without changing the launcher button dimensions", () => {
  assert.match(themeCss, /\.ai-chat-nav-btn \.worth-it-icon\\{width:clamp\\(22px,1\.55em,26px\\);height:clamp\\(22px,1\.55em,26px\\)\\}/);
  assert.doesNotMatch(themeCss, /\.ai-chat-nav-btn\\s*\\{[^}]*width:/s);
});
