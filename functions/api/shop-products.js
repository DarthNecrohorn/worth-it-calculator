import { recordAdminApiUsage } from "../lib/admin-usage.js";

/*
 * WORTH IT — Awin Shop Products
 *
 * Awin product feeds are imported by GitHub Actions from the
 * configured GitHub repository secrets. Cloudflare only serves
 * the generated static snapshot from data/shop-products-awin.json.
 *
 * There is no Awin Partner API token, Product Feed API key,
 * Enhanced Feed request, Legacy Feed request, or per-request
 * Awin product/programme limit in this function.
 */

const RESPONSE_CACHE_SECONDS = 300;

async function readImportedAwinProducts(context) {
    try {
        if (!context.env?.ASSETS) {
            return {
                version: "0",
                generatedAt: null,
                feeds: [],
                products: []
            };
        }

        const assetUrl =
            new URL(
                "/data/shop-products-awin.json",
                context.request.url
            );

        const response =
            await context.env.ASSETS.fetch(
                assetUrl
            );

        if (!response.ok) {
            return {
                version: "0",
                generatedAt: null,
                feeds: [],
                products: []
            };
        }

        const payload =
            await response.json();

        return {
            version:
                String(
                    payload?.version || "0"
                ),
            generatedAt:
                payload?.generatedAt || null,
            feeds:
                Array.isArray(payload?.feeds)
                    ? payload.feeds
                    : [],
            products:
                Array.isArray(payload?.products)
                    ? payload.products
                    : []
        };
    }
    catch (error) {
        console.warn(
            "Imported Awin Shop snapshot could not be read:",
            error
        );

        return {
            version: "0",
            generatedAt: null,
            feeds: [],
            products: []
        };
    }
}

function normalizeKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function dedupeProducts(products) {
    const map = new Map();

    for (const product of products) {
        if (!product || typeof product !== "object") {
            continue;
        }

        const key =
            normalizeKey(
                product.id ||
                product.affiliateUrl ||
                [
                    product.partnerId,
                    product.title
                ].join(" ")
            );

        if (!key) {
            continue;
        }

        if (!map.has(key)) {
            map.set(key, product);
        }
    }

    return [...map.values()];
}

function jsonResponse(
    data,
    status = 200,
    cacheSeconds = 0
) {
    const headers = new Headers({
        "Content-Type":
            "application/json; charset=UTF-8",
        "Access-Control-Allow-Origin":
            "*",
        "Access-Control-Allow-Methods":
            "GET, OPTIONS",
        "Access-Control-Allow-Headers":
            "Content-Type, Accept"
    });

    if (cacheSeconds > 0) {
        headers.set(
            "Cache-Control",
            `public, max-age=60, s-maxage=${cacheSeconds}`
        );

        headers.set(
            "Cloudflare-CDN-Cache-Control",
            `public, max-age=${cacheSeconds}`
        );
    }
    else {
        headers.set(
            "Cache-Control",
            "no-store"
        );
    }

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers
        }
    );
}

export async function onRequestGet(context) {
    recordAdminApiUsage(
        context,
        {
            apiKey:
                "shop-affiliate-feed",
            provider:
                "Awin Standard Feeds — GitHub Actions"
        }
    );

    const requestUrl =
        new URL(
            context.request.url
        );

    const debugMode =
        requestUrl.searchParams.get(
            "debug"
        ) === "1";

    const snapshot =
        await readImportedAwinProducts(
            context
        );

    const products =
        dedupeProducts(
            snapshot.products
        );

    const feeds =
        Array.isArray(snapshot.feeds)
            ? snapshot.feeds
            : [];

    const loadedFeedCount =
        feeds.filter(
            feed =>
                feed?.status === "loaded"
        ).length;

    const configured =
        loadedFeedCount > 0 ||
        products.length > 0;

    return jsonResponse(
        {
            ok: true,
            configured,
            source:
                "github-standard-feed-import",
            generatedAt:
                snapshot.generatedAt,
            products,
            feeds,
            ...(debugMode
                ? {
                    debug: {
                        source:
                            "GitHub Actions repository secrets",
                        productCount:
                            products.length,
                        feedCount:
                            feeds.length,
                        loadedFeedCount
                    }
                }
                : {})
        },
        200,
        RESPONSE_CACHE_SECONDS
    );
}

export async function onRequestOptions() {
    return new Response(
        null,
        {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin":
                    "*",
                "Access-Control-Allow-Methods":
                    "GET, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Content-Type, Accept"
            }
        }
    );
}
