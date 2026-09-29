/* =========================================================
   WORTH IT — SHOP STOCK CHECK
   Server-side merchant availability checker.

   Frontend endpoint:
     /api/shop-stock?url=<merchant-product-url>

   Current supported merchant:
     Stylevana

   The endpoint is intentionally allowlisted to trusted merchant
   hosts so the public API cannot be used as a generic SSRF proxy.
========================================================= */

const ALLOWED_HOSTS = new Set([
    "stylevana.com",
    "www.stylevana.com"
]);

const CACHE_TTL_SECONDS = 30 * 60;
const BROWSER_CACHE_TTL_SECONDS = 5 * 60;

function jsonResponse(data, status = 200, cacheSeconds = 0) {
    const headers = new Headers({
        "Content-Type": "application/json; charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept"
    });

    if (cacheSeconds > 0) {
        headers.set(
            "Cache-Control",
            `public, max-age=${BROWSER_CACHE_TTL_SECONDS}, s-maxage=${cacheSeconds}`
        );
        headers.set(
            "Cloudflare-CDN-Cache-Control",
            `public, max-age=${cacheSeconds}`
        );
    } else {
        headers.set("Cache-Control", "no-store");
    }

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers
        }
    );
}

function normalizeText(value) {
    return String(value || "")
        .replace(/\\u00A0/g, " ")
        .replace(/<script[\\s\\S]*?<\\/script>/gi, " ")
        .replace(/<style[\\s\\S]*?<\\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\\s+/g, " ")
        .trim();
}

function compactText(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
}

function isAllowedMerchantUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);

        if (parsed.protocol !== "https:") {
            return false;
        }

        return ALLOWED_HOSTS.has(
            parsed.hostname.toLowerCase()
        );
    } catch {
        return false;
    }
}

function findLocalProductWindow(html, expectedTitle) {
    const cleanHtml = String(html || "");
    const cleanTitle = compactText(expectedTitle);

    if (!cleanTitle) {
        return cleanHtml.slice(0, 20000);
    }

    const titleWords = cleanTitle
        .split(" ")
        .filter(word => word.length >= 4)
        .slice(0, 10);

    if (!titleWords.length) {
        return cleanHtml.slice(0, 20000);
    }

    const lowerHtml = compactText(cleanHtml);
    const anchor = titleWords
        .slice(0, 6)
        .join(" ");

    const index = lowerHtml.indexOf(anchor);

    if (index < 0) {
        return cleanHtml.slice(0, 20000);
    }

    return lowerHtml.slice(
        Math.max(0, index - 3500),
        index + 7000
    );
}

function detectStock(html, expectedTitle = "") {
    const raw = String(html || "");

    /*
     * Strong structured Magento signals are checked first.
     * These are preferable to generic "Add to cart" text because
     * recommendation widgets can also contain that phrase.
     */
    if (/"is_salable"\\s*:\\s*false/i.test(raw)) {
        return {
            state: "out-of-stock",
            evidence: "is_salable:false"
        };
    }

    if (/"stock_status"\\s*:\\s*["']?0(?:["']|\\b)/i.test(raw)) {
        return {
            state: "out-of-stock",
            evidence: "stock_status:0"
        };
    }

    if (/"is_salable"\\s*:\\s*true/i.test(raw)) {
        return {
            state: "in-stock",
            evidence: "is_salable:true"
        };
    }

    if (/"stock_status"\\s*:\\s*["']?1(?:["']|\\b)/i.test(raw)) {
        return {
            state: "in-stock",
            evidence: "stock_status:1"
        };
    }

    const localWindow =
        findLocalProductWindow(
            raw,
            expectedTitle
        );

    if (/\\bout\\s+of\\s+stock\\b/i.test(localWindow)) {
        return {
            state: "out-of-stock",
            evidence: "Out Of Stock"
        };
    }

    if (/\\bsold\\s+out\\b/i.test(localWindow)) {
        return {
            state: "out-of-stock",
            evidence: "Sold Out"
        };
    }

    if (/\\bcurrently\\s+unavailable\\b/i.test(localWindow)) {
        return {
            state: "out-of-stock",
            evidence: "Currently Unavailable"
        };
    }

    if (/\\b(in\\s+stock|in-stock)\\b/i.test(localWindow)) {
        return {
            state: "in-stock",
            evidence: "In Stock"
        };
    }

    /*
     * Stylevana product pages normally expose an Add to Cart action
     * when an item can be purchased. Only use this fallback after
     * the stronger product-local checks above.
     */
    if (/\\badd\\s+to\\s+cart\\b/i.test(localWindow)) {
        return {
            state: "in-stock",
            evidence: "Add to Cart"
        };
    }

    if (/\\badd\\s+to\\s+bag\\b/i.test(localWindow)) {
        return {
            state: "in-stock",
            evidence: "Add to Bag"
        };
    }

    return {
        state: "unknown",
        evidence: "No reliable stock signal found"
    };
}

function getDateText() {
    return new Date().toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const merchantUrl =
        String(
            url.searchParams.get("url") || ""
        ).trim();

    const expectedTitle =
        String(
            url.searchParams.get("title") || ""
        ).trim();

    if (!merchantUrl) {
        return jsonResponse(
            {
                ok: false,
                error: "Merchant product URL is required."
            },
            400
        );
    }

    if (!isAllowedMerchantUrl(merchantUrl)) {
        return jsonResponse(
            {
                ok: false,
                error: "Merchant host is not supported."
            },
            400
        );
    }

    /*
     * Let Cloudflare cache the merchant check by its exact request URL.
     * The frontend may request multiple products independently without
     * creating a new upstream request inside the cache window.
     */
    try {
        const response = await fetch(
            merchantUrl,
            {
                method: "GET",
                redirect: "follow",
                headers: {
                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language":
                        "en-US,en;q=0.9",
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache"
                }
            }
        );

        if (!response.ok) {
            return jsonResponse(
                {
                    ok: false,
                    state: "unknown",
                    merchant: "Stylevana",
                    storefront: "US",
                    checkedDate: getDateText(),
                    sourceUrl: merchantUrl,
                    evidence: `HTTP ${response.status}`,
                    error:
                        "Merchant page could not be checked reliably."
                },
                200,
                BROWSER_CACHE_TTL_SECONDS
            );
        }

        const contentType =
            String(
                response.headers.get(
                    "content-type"
                ) || ""
            ).toLowerCase();

        if (
            !contentType.includes("text/html") &&
            !contentType.includes("application/xhtml+xml")
        ) {
            return jsonResponse(
                {
                    ok: false,
                    state: "unknown",
                    merchant: "Stylevana",
                    storefront: "US",
                    checkedDate: getDateText(),
                    sourceUrl: merchantUrl,
                    evidence: "Unexpected content type",
                    error:
                        "Merchant page returned an unexpected response."
                },
                200,
                BROWSER_CACHE_TTL_SECONDS
            );
        }

        const html =
            await response.text();

        if (!html || html.length < 500) {
            return jsonResponse(
                {
                    ok: false,
                    state: "unknown",
                    merchant: "Stylevana",
                    storefront: "US",
                    checkedDate: getDateText(),
                    sourceUrl: merchantUrl,
                    evidence: "Empty or incomplete product page",
                    error:
                        "Merchant page was incomplete."
                },
                200,
                BROWSER_CACHE_TTL_SECONDS
            );
        }

        const stock =
            detectStock(
                html,
                expectedTitle
            );

        return jsonResponse(
            {
                ok: stock.state !== "unknown",
                state: stock.state,
                merchant: "Stylevana",
                storefront: "US",
                checkedDate: getDateText(),
                sourceUrl: merchantUrl,
                evidence: stock.evidence
            },
            200,
            CACHE_TTL_SECONDS
        );

    } catch (error) {
        console.warn(
            "Shop stock check failed:",
            error
        );

        return jsonResponse(
            {
                ok: false,
                state: "unknown",
                merchant: "Stylevana",
                storefront: "US",
                checkedDate: getDateText(),
                sourceUrl: merchantUrl,
                evidence: "Fetch failed",
                error:
                    "Merchant stock check failed."
            },
            200,
            BROWSER_CACHE_TTL_SECONDS
        );
    }
}

export async function onRequestOptions() {
    return jsonResponse(
        null,
        204,
        0
    );
}
