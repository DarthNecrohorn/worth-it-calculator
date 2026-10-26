import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const markets = readFileSync(new URL("../markets-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("Markets safely handles non-JSON responses and retries transient server failures", () => {
    assert.match(markets, /const MARKETS_RETRY_DELAYS_MS = \\[700, 1600\\]/);
    assert.match(markets, /function parseMarketsResponse\\(response, parsedData\\)/);
    assert.match(markets, /response\\.headers\\.get\\("Content-Type"\\)/);
    assert.match(markets, /Markets API returned a non-JSON response/);
    assert.match(markets, /cache: attempt === 0 \\? "default" : "no-store"/);
    assert.match(markets, /fetchMarketsDatasetWithRetry\\(\\)/);
    assert.doesNotMatch(markets, /const data =\\s*await marketResponse\\.json\\(\\)/);
});

test("Markets recovery script is cache-busted", () => {
    assert.match(html, /markets-ui\\.js\\?v=markets-first-load-retry-20261026a/);
});

test("Recently Viewed and Favorites use two compact columns on mobile", () => {
    const marker = "Mobile car personal lists: show Recently viewed and Favorites in two compact columns.";
    const start = css.lastIndexOf(marker);
    assert.ok(start >= 0, "the final mobile car-list layout override exists");
    const rules = css.slice(start);
    assert.match(rules, /@media \\(max-width: 640px\\)/);
    assert.match(rules, /\\.cars-personal-panels \\.cars-personal-content,[\\s\\S]*?grid-template-columns: repeat\\(2, minmax\\(0, 1fr\\)\\)/);
    assert.match(rules, /\\.cars-personal-panels\\[data-active-tab="favorites"\\] \\.cars-personal-content/);
    assert.match(rules, /\\.cars-personal-item-copy strong[\\s\\S]*?line-clamp: 2/);
    assert.match(rules, /\\.cars-personal-item-action[\\s\\S]*?grid-column: 2/);
});

test("the stylesheet version is refreshed for the current UI improvements", () => {
    assert.match(html, /style\\.css\\?v=worthit-owned-picker-markets-cars-20261026a/);
});
