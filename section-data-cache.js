/* Worth It account-scoped section API cache.
 * Cache only explicitly approved, read-only section datasets. Auth, profile,
 * admin, social and chat endpoints are intentionally excluded.
 */
(function () {
    "use strict";

    const CACHE_PREFIX = "worthit-section-api-v1:";
    const SAVED_AT_HEADER = "X-WorthIt-Section-Cache-Saved-At";
    const STATE_HEADER = "X-WorthIt-Section-Cache";
    const MAX_CACHE_ENTRIES_PER_ACCOUNT = 120;
    const MAX_STALE_FALLBACK_MS = 24 * 60 * 60 * 1000;
    const nativeFetch = window.fetch.bind(window);

    function getSectionCachePolicy(url) {
        if (
            url.origin !== window.location.origin ||
            url.searchParams.get("refresh") === "1"
        ) {
            return null;
        }

        const action = url.searchParams.get("action") || "";

        if (url.pathname === "/api/shop-products" && !action) {
            return { ttlMs: 15 * 60 * 1000 };
        }

        if (url.pathname === "/api/markets" && !action) {
            return { ttlMs: 30 * 60 * 1000 };
        }

        if (url.pathname === "/api/currencies" && !action) {
            return { ttlMs: 15 * 60 * 1000 };
        }

        if (url.pathname === "/api/water-levels") {
            const policies = {
                stations: 2 * 60 * 60 * 1000,
                metadata: 6 * 60 * 60 * 1000,
                latest: 60 * 60 * 1000,
                nearby: 15 * 60 * 1000,
                details: 60 * 60 * 1000
            };

            return policies[action]
                ? { ttlMs: policies[action] }
                : null;
        }

        if (url.pathname === "/api/ship-tracking") {
            const policies = {
                vessels: 30 * 1000,
                vessel: 5 * 60 * 1000,
                track: 60 * 60 * 1000
            };

            return policies[action]
                ? { ttlMs: policies[action] }
                : null;
        }

        // Weather, News, vehicle catalogs and Crypto already have their own
        // browser-side cache strategies; all other endpoints remain untouched.
        return null;
    }

    async function getAccountCacheName() {
        if (
            window.worthItAuthStateResolved !== true &&
            window.worthItAuthReady &&
            typeof window.worthItAuthReady.then === "function"
        ) {
            try {
                await Promise.resolve(window.worthItAuthReady);
            } catch (_) {
                // Use the latest shared UI auth state if initialization failed.
            }
        }

        const userId =
            window.worthItCurrentAuthUser &&
            window.worthItCurrentAuthUser.id;

        const scope = userId
            ? "user-" + String(userId).replace(/[^A-Za-z0-9_-]/g, "_")
            : "guest";

        return CACHE_PREFIX + scope;
    }

    function makeCacheKey(url) {
        return new Request(url.href, { method: "GET" });
    }

    function cloneWithState(response, state) {
        const clone = response.clone();
        const headers = new Headers(clone.headers);
        headers.set(STATE_HEADER, state);

        return new Response(clone.body, {
            status: clone.status,
            statusText: clone.statusText,
            headers
        });
    }

    function makeStoredResponse(response) {
        const clone = response.clone();
        const headers = new Headers(clone.headers);

        headers.set(SAVED_AT_HEADER, String(Date.now()));
        headers.delete(STATE_HEADER);

        // User identity is included in the cache name. Removing Vary avoids
        // browser Cache API misses for rotated per-user Authorization headers.
        headers.delete("Vary");

        return new Response(clone.body, {
            status: clone.status,
            statusText: clone.statusText,
            headers
        });
    }

    async function pruneAccountCache(cache) {
        try {
            const requests = await cache.keys();
            if (requests.length <= MAX_CACHE_ENTRIES_PER_ACCOUNT) return;

            const entries = [];
            for (const request of requests) {
                const response = await cache.match(request);
                const savedAt = Number(
                    response && response.headers.get(SAVED_AT_HEADER)
                );

                entries.push({
                    request,
                    savedAt: Number.isFinite(savedAt) ? savedAt : 0
                });
            }

            entries.sort((a, b) => a.savedAt - b.savedAt);
            const removeCount =
                entries.length - MAX_CACHE_ENTRIES_PER_ACCOUNT;

            await Promise.all(
                entries.slice(0, removeCount).map(entry =>
                    cache.delete(entry.request)
                )
            );
        } catch (_) {
            // Cache pruning is best-effort and must never block a section.
        }
    }

    window.fetch = async function (input, init) {
        const isRequest =
            typeof Request !== "undefined" &&
            input instanceof Request;

        const method = String(
            (init && init.method) ||
            (isRequest && input.method) ||
            "GET"
        ).toUpperCase();

        const cacheMode =
            (init && init.cache) ||
            (isRequest && input.cache) ||
            "default";

        if (
            method !== "GET" ||
            cacheMode !== "default" ||
            !window.caches ||
            typeof window.caches.open !== "function"
        ) {
            return nativeFetch(input, init);
        }

        let url;
        try {
            url = new URL(
                isRequest ? input.url : String(input),
                window.location.origin
            );
        } catch (_) {
            return nativeFetch(input, init);
        }

        const policy = getSectionCachePolicy(url);
        if (!policy) {
            return nativeFetch(input, init);
        }

        let cache;
        let cacheKey;
        let cached = null;
        let cachedAge = -1;

        try {
            cache = await window.caches.open(
                await getAccountCacheName()
            );
            cacheKey = makeCacheKey(url);
            cached = await cache.match(cacheKey) || null;

            if (cached) {
                const savedAt = Number(
                    cached.headers.get(SAVED_AT_HEADER)
                );
                cachedAge = Date.now() - savedAt;

                if (
                    Number.isFinite(cachedAge) &&
                    cachedAge >= 0 &&
                    cachedAge < policy.ttlMs
                ) {
                    return cloneWithState(cached, "HIT");
                }
            }
        } catch (_) {
            // If Cache Storage is unavailable, preserve normal network behavior.
            return nativeFetch(input, init);
        }

        try {
            const response = await nativeFetch(input, init);
            const contentType =
                response.headers.get("Content-Type") || "";

            if (
                response.ok &&
                response.status === 200 &&
                /(?:application\/json|\+json)/i.test(contentType)
            ) {
                try {
                    const stored = makeStoredResponse(response);
                    Promise.resolve(
                        cache.put(cacheKey, stored)
                    ).then(() => pruneAccountCache(cache)).catch(() => {});
                } catch (_) {
                    // Saving a response must not delay or break the section.
                }

                return response;
            }

            if (
                response.status >= 500 &&
                cached &&
                cachedAge >= 0 &&
                cachedAge < MAX_STALE_FALLBACK_MS
            ) {
                return cloneWithState(cached, "STALE-FALLBACK");
            }

            return response;
        } catch (error) {
            if (
                cached &&
                cachedAge >= 0 &&
                cachedAge < MAX_STALE_FALLBACK_MS
            ) {
                return cloneWithState(cached, "STALE-FALLBACK");
            }

            throw error;
        }
    };
})();
