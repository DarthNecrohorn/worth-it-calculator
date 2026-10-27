import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const markets = readFileSync(new URL("../markets-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

const retryHelperStart = markets.indexOf("const MARKETS_RETRY_DELAYS_MS = [700, 1600];");
const retryHelperEnd = markets.indexOf("async function refreshMarkets()", retryHelperStart);
assert.ok(retryHelperStart >= 0 && retryHelperEnd > retryHelperStart,
    "the standalone Markets retry helpers can be isolated for runtime testing");
const retryHelperSource = markets.slice(retryHelperStart, retryHelperEnd);

function createMarketsRetryHarness(fetchImpl, waits = []) {
    const context = {
        MARKETS_UI_VERSION: "runtime-test",
        fetch: fetchImpl,
        setTimeout(callback, delay) {
            waits.push(delay);
            callback();
            return waits.length;
        }
    };
    vm.runInNewContext(
        retryHelperSource + "\nglobalThis.__testApi = { fetchMarketsDatasetWithRetry, parseMarketsResponse };",
        context,
        { timeout: 1000 }
    );
    return context.__testApi;
}

function marketsResponse(status, body, contentType = "application/json") {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get(name) { return name.toLowerCase() === "content-type" ? contentType : null; } },
        async json() {
            if (body instanceof Error) throw body;
            if (typeof body === "string") return JSON.parse(body);
            return body;
        },
        async text() {
            if (typeof body === "string") return body;
            return JSON.stringify(body);
        }
    };
}


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
    assert.ok(html.includes("markets-ui.js?v=markets-first-load-retry-20261026b"));
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
    assert.ok(html.includes("style.css?v=chat-polling-preserve-dom-20261028a"));
});


test("Markets retry performs a network-only retry after an HTML 503 and then succeeds", async () => {
    const calls = [];
    const waits = [];
    const responses = [
        marketsResponse(503, "<html>temporary upstream failure</html>", "text/html"),
        marketsResponse(200, { success: true, data: { prices: [{ name: "Gold" }] } })
    ];
    const api = createMarketsRetryHarness(async (url, options) => {
        calls.push({ url, options });
        return responses.shift();
    }, waits);

    const result = await api.fetchMarketsDatasetWithRetry();
    assert.equal(result.data.prices[0].name, "Gold");
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /^\/api\/markets\?v=runtime-test$/);
    assert.equal(calls[0].options.cache, "default");
    assert.equal(calls[1].options.cache, "no-store");
    assert.deepEqual(waits, [700]);
});

test("Markets retry does not retry a successful-status HTML response or parse it as JSON", async () => {
    let calls = 0;
    const waits = [];
    const api = createMarketsRetryHarness(async () => {
        calls += 1;
        return marketsResponse(200, "<html>not the API</html>", "text/html");
    }, waits);

    await assert.rejects(api.fetchMarketsDatasetWithRetry(), /non-JSON response \(HTTP 200\)/);
    assert.equal(calls, 1);
    assert.deepEqual(waits, []);
});

test("Markets retry respects backoff for 429 and 500 responses", async () => {
    const calls = [];
    const waits = [];
    const responses = [
        marketsResponse(429, { success: false, error: "rate limited" }),
        marketsResponse(500, { success: false, error: "temporary failure" }),
        marketsResponse(200, { success: true, data: { prices: [] } })
    ];
    const api = createMarketsRetryHarness(async (_url, options) => {
        calls.push(options);
        return responses.shift();
    }, waits);

    const result = await api.fetchMarketsDatasetWithRetry();
    assert.deepEqual(result.data.prices, []);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(item => item.cache), ["default", "no-store", "no-store"]);
    assert.deepEqual(waits, [700, 1600]);
});
