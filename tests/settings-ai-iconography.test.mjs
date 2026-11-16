import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../site-theme-system.css", import.meta.url), "utf8");
const styleCss = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("Settings navigation button uses a crisp theme-aware SVG gear instead of an emoji", () => {
  const start = html.indexOf('<button class="settings-btn"');
  const end = html.indexOf("</button>", start);
  const button = start >= 0 && end > start ? html.slice(start, end + "</button>".length) : "";
  assert.ok(button, "Settings navigation button exists");
  assert.match(button, /aria-label="Settings"/);
  assert.ok(button.includes('<svg class="worth-it-icon worth-it-icon-settings"'));
  assert.ok(button.includes('stroke="currentColor"'));
  assert.doesNotMatch(button, /⚙/u);
});

test("AI Chat robot SVG is visibly larger without changing the launcher button dimensions", () => {
  assert.ok(themeCss.includes(
    ".ai-chat-nav-btn .worth-it-icon{width:clamp(22px,1.55em,26px);height:clamp(22px,1.55em,26px)}"
  ));
  const launcherRule = styleCss.match(/\.ai-chat-nav-btn\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(launcherRule, /\b(?:width|height|min-width|max-width|min-height|max-height)\s*:/);
});
