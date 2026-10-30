import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const markets = readFileSync(new URL("../markets-ui.js", import.meta.url), "utf8");
const crypto = readFileSync(new URL("../crypto-ui.js", import.meta.url), "utf8");
const shop = readFileSync(new URL("../shop.js", import.meta.url), "utf8");

test("section scripts have refreshed cache keys for the performance and focus fixes", () => {
    assert.match(html, /shop\.js\?v=shopswitchrender-20261030a/);
    assert.match(html, /markets-ui\.js\?v=markets-detail-controls-20261030a/);
    assert.match(html, /crypto-ui\.js\?v=cryptoswitch-focus-20261030a/);
});

test("Shop keeps its rendered section between visits and does not refetch/rebuild a loaded feed", () => {
    const start = shop.indexOf("window.openShop = function(){");
    const end = shop.indexOf("/* =================================================\n        COMPATIBILITY", start);
    assert.ok(start >= 0 && end > start, "Shop navigation function exists");
    const openShop = shop.slice(start, end);

    assert.match(openShop, /const firstOpen\s*=\s*container\.dataset\.shopInitialized !== "true"/);
    assert.match(openShop, /if\(firstOpen \|\| feedReadyToRender\)\s*\{\s*renderShop\(container\);\s*container\.dataset\.shopInitialized = "true";\s*container\.dataset\.shopFeedNeedsRender = "false";\s*\}/);
    assert.match(openShop, /!automaticShopFeedLoaded[\s\S]*?container\.dataset\.shopFeedLoadPending/);
    assert.match(openShop, /container\.style\.display !== "none"[\s\S]*?shopFeedNeedsRender = "true"/);
    assert.match(openShop, /automaticShopFeedLoaded[\s\S]*?shopFeedNeedsRender === "true"[\s\S]*?renderShop\(container\)/);
    assert.doesNotMatch(openShop, /\n\s*renderShop\(container\);\s*\n\s*container\.style\.display/);
});

test("Crypto binds its global events once and reuses the existing DOM on section re-entry", () => {
    const bindStart = crypto.indexOf("  function bind(){");
    const initStart = crypto.indexOf("  window.initCryptoUI=");
    assert.ok(bindStart >= 0 && initStart > bindStart, "Crypto binding and initializer exist");
    const bind = crypto.slice(bindStart, initStart);

    assert.match(bind, /const section=\$\("cryptoSection"\);\s*if\(!section\|\|section\.dataset\.cryptoBound==="1"\)return;\s*section\.dataset\.cryptoBound="1"/);
    assert.match(crypto, /window\.initCryptoUI=\(\)=>\{bind\(\);if\(!state\.loaded&&!state\.loading\)load\(\);\};/);
    assert.doesNotMatch(crypto, /window\.initCryptoUI=\(\)=>\{bind\(\);if\(!state\.loaded\)load\(\);else\{renderGlobal\(\);renderFilters\(\);render\(\);\}\};/);
    assert.match(crypto, /card\.addEventListener\("click",\(\)=>openDetail\(coin,card\)\)/);
});

test("Markets resolves commodity labels through Wikipedia search before requesting a page summary", async () => {
    const start = markets.indexOf("const marketsWikipediaCache = new Map();");
    const end = markets.indexOf("/*\n * Share the same in-flight request", start);
    assert.ok(start >= 0 && end > start, "Wikipedia summary helper can be isolated");
    const helper = markets.slice(start, end);
    const calls = [];

    const context = {
        fetch: async url => {
            calls.push(String(url));
            if (String(url).includes("/w/api.php?action=query&list=search")) {
                return {
                    ok: true,
                    async json() {
                        return { query: { search: [{ title: "Iron ore" }] } };
                    }
                };
            }
            if (String(url).includes("/page/summary/Iron_ore")) {
                return {
                    ok: true,
                    async json() {
                        return {
                            extract: "Iron ore is a mineral resource.",
                            content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Iron_ore" } }
                        };
                    }
                };
            }
            throw new Error("Unexpected Wikipedia request: " + url);
        }
    };

    vm.runInNewContext(
        helper + "\nglobalThis.__fetchWikipediaSummary = fetchWikipediaSummary;",
        context,
        { timeout: 1000 }
    );

    const result = await context.__fetchWikipediaSummary("Iron ore, cfr spot");
    assert.equal(result.extract, "Iron ore is a mineral resource.");
    assert.equal(calls.length, 2);
    assert.match(calls[0], /w\/api\.php\?action=query&list=search/);
    assert.match(calls[0], /srsearch=Iron%20ore%2C%20cfr%20spot/);
    assert.match(calls[1], /page\/summary\/Iron_ore$/);
    assert.doesNotMatch(calls[0], /page\/summary\/Iron_ore%2C_cfr_spot/);

    await context.__fetchWikipediaSummary("Iron ore, cfr spot");
    assert.equal(calls.length, 2, "a resolved summary is reused from the in-memory cache");
});

test("Markets and Crypto move focus outside their dialogs before setting aria-hidden", () => {
    const marketClose = markets.slice(
        markets.indexOf("function closeMarketDetailModal()"),
        markets.indexOf("function navigateMarketDetail(", markets.indexOf("function closeMarketDetailModal()"))
    );
    assert.match(marketClose, /focusTarget\.focus\(\{preventScroll:true\}\)[\s\S]*?setAttribute\("aria-hidden", "true"\)/);

    const cryptoClose = crypto.slice(
        crypto.indexOf("  function closeDetail()"),
        crypto.indexOf("  function positionCryptoFloatingShowLess(", crypto.indexOf("  function closeDetail()"))
    );
    assert.match(cryptoClose, /focusTarget\?\.focus\?\.\(\{preventScroll:true\}\)[\s\S]*?setAttribute\("aria-hidden","true"\)/);
});


test("Markets detail close glyph moves independently and Go back up arrow follows its label", () => {
    assert.match(markets, /class="worth-it-market-detail-close-symbol" aria-hidden="true">×<\\/span>/);
    assert.match(markets, /\\.worth-it-market-detail-close-symbol\\s*\\{\\s*display:inline-block !important;\\s*transform:translateY\\(-2px\\) !important;/);

    const start = markets.indexOf("function ensureMarketsGoBackUpButton()");
    const end = markets.indexOf("function positionMarketsBackUpButton(", start);
    assert.ok(start >= 0 && end > start, "Markets Go back up button setup exists");
    assert.match(markets.slice(start, end), /button\\.textContent\\s*=\\s*"Go back up ↑"/);
});
