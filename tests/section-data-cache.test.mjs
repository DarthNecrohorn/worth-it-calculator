import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const cacheSource = readFileSync(new URL("../section-data-cache.js", import.meta.url), "utf8");

function makeHarness() {
    const accountCaches = new Map();
    const networkRequests = [];

    class MemoryCache {
        constructor() {
            this.responses = new Map();
        }

        async match(request) {
            const response = this.responses.get(request.url);
            return response ? response.clone() : undefined;
        }

        async put(request, response) {
            this.responses.set(request.url, response.clone());
        }

        async keys() {
            return Array.from(this.responses.keys()).map(
                url => new Request(url, { method: "GET" })
            );
        }

        async delete(request) {
            return this.responses.delete(request.url);
        }
    }

    const caches = {
        async open(name) {
            if (!accountCaches.has(name)) {
                accountCaches.set(name, new MemoryCache());
            }
            return accountCaches.get(name);
        }
    };

    const nativeFetch = async (input, init) => {
        const rawUrl = input instanceof Request ? input.url : String(input);
        const url = new URL(rawUrl, "https://worth-it-calculator.pages.dev");
        const method = (init && init.method) || (input instanceof Request && input.method) || "GET";
        networkRequests.push({ url: url.href, method, cache: init && init.cache });

        return new Response(
            JSON.stringify({ fromNetwork: true, url: url.href }),
            {
                status: 200,
                headers: { "Content-Type": "application/json; charset=utf-8" }
            }
        );
    };

    const window = {
        fetch: nativeFetch,
        location: { origin: "https://worth-it-calculator.pages.dev" },
        caches,
        worthItAuthStateResolved: true,
        worthItCurrentAuthUser: { id: "account-one" }
    };

    vm.runInNewContext(cacheSource, {
        window,
        URL,
        Request,
        Response,
        Headers,
        Promise,
        Date,
        Number,
        String,
        Math,
        RegExp,
        console
    });

    return { window, accountCaches, networkRequests };
}

test("account-scoped section cache serves a saved response on repeat requests", async () => {
    const { window, accountCaches, networkRequests } = makeHarness();

    const first = await window.fetch("/api/markets?v=cache-test");
    assert.equal(first.status, 200);
    assert.equal(networkRequests.length, 1);

    const second = await window.fetch("/api/markets?v=cache-test");
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("X-WorthIt-Section-Cache"), "HIT");
    assert.equal(networkRequests.length, 1);
    assert.ok(
        Array.from(accountCaches.keys()).some(key => key.endsWith("user-account-one")),
        "cache namespace should include the active account"
    );
});

test("section datasets are isolated between accounts", async () => {
    const { window, accountCaches, networkRequests } = makeHarness();

    await window.fetch("/api/currencies?base=EUR");
    window.worthItCurrentAuthUser = { id: "account-two" };

    const secondAccountResponse = await window.fetch("/api/currencies?base=EUR");
    assert.equal(secondAccountResponse.headers.get("X-WorthIt-Section-Cache"), null);
    assert.equal(networkRequests.length, 2);
    assert.ok(Array.from(accountCaches.keys()).some(key => key.endsWith("user-account-one")));
    assert.ok(Array.from(accountCaches.keys()).some(key => key.endsWith("user-account-two")));
});

test("auth, private Markets actions and unapproved endpoints are never cached", async () => {
    const { window, networkRequests } = makeHarness();

    await window.fetch("/api/auth-username-login");
    await window.fetch("/api/auth-username-login");
    await window.fetch("/api/markets?action=account-image-cache-get");
    await window.fetch("/api/markets?action=account-image-cache-get");
    await window.fetch("/api/admin-stats");
    await window.fetch("/api/admin-stats");

    assert.equal(networkRequests.length, 6);
    assert.ok(networkRequests.every(item => item.method === "GET"));
});

test("explicit no-store requests, forced water refreshes and third-party fetches bypass the cache", async () => {
    const { window, networkRequests } = makeHarness();

    await window.fetch("/api/water-levels?action=stations");
    await window.fetch("/api/water-levels?action=stations");
    assert.equal(networkRequests.length, 1, "station list should be cached while fresh");

    await window.fetch("/api/water-levels?action=stations&refresh=1");
    await window.fetch("/api/markets?v=cache-test", { cache: "no-store" });
    await window.fetch("https://third-party.example/data.json");
    assert.equal(networkRequests.length, 4);
});

test("the persistent section cache is loaded after primary auth initializes and before section UIs", () => {
    const appIndex = html.indexOf('app.js?v=email-verification-20261029b');
    const cacheIndex = html.indexOf('section-data-cache.js?v=sectioncache20261015a');
    const newsIndex = html.indexOf('news-ui.js?v=newscache20261012a');

    assert.ok(appIndex >= 0, "primary app script exists");
    assert.ok(cacheIndex > appIndex, "cache wrapper loads after primary auth state setup");
    assert.ok(newsIndex > cacheIndex, "cache wrapper loads before section UI scripts");
    assert.match(cacheSource, /window\.worthItCurrentAuthUser/);
    assert.match(cacheSource, /MAX_CACHE_ENTRIES_PER_ACCOUNT = 120/);
    assert.match(cacheSource, /MAX_STALE_FALLBACK_MS = 24 \* 60 \* 60 \* 1000/);
});
