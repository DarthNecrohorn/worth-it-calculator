import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const markets = readFileSync(new URL("../markets-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("Markets safely handles non-JSON responses and retries transient server failures", () => {
    assert.ok(markets.includes("const MARKETS_RETRY_DELAYS_MS = [700, 1600]"));
    assert.ok(markets.includes("function parseMarketsResponse(response, parsedData)"));
    assert.ok(markets.includes('response.headers.get("Content-Type")'));
    assert.ok(markets.includes("Markets API returned a non-JSON response"));
    assert.ok(markets.includes('cache: attempt === 0 ? "default" : "no-store"'));
    assert.ok(markets.includes("fetchMarketsDatasetWithRetry()"));
    assert.ok(!/const data =\s*await marketResponse\.json\(\)/.test(markets));
});

test("Markets recovery script is cache-busted", () => {
    assert.ok(html.includes("markets-ui.js?v=markets-first-load-retry-20261026a"));
});

test("Recently Viewed and Favorites use two compact columns on mobile", () => {
    const marker = "Mobile car personal lists: show Recently viewed and Favorites in two compact columns.";
    const start = css.lastIndexOf(marker);
    assert.ok(start >= 0, "the final mobile car-list layout override exists");
    const rules = css.slice(start);
    assert.ok(rules.includes("@media (max-width: 640px)"));
    assert.ok(rules.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"));
    assert.ok(rules.includes('.cars-personal-panels[data-active-tab="favorites"] .cars-personal-content'));
    assert.ok(rules.includes("line-clamp: 2"));
    assert.ok(rules.includes("grid-column: 2"));
});

test("the stylesheet version is refreshed for the current UI improvements", () => {
    assert.ok(html.includes("style.css?v=worthit-owned-picker-markets-cars-20261026b"));
});
