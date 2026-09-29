import { recordAdminApiUsage } from "../lib/admin-usage.js";

/* =========================================================
   WORTH IT — AUTOMATIC AWIN SHOP PRODUCT FEED

   Purpose:
     Automatically discover approved Awin advertiser feeds and
     turn their product data into Shop cards.

   Required Cloudflare secret:
     AWIN_DATAFEED_API_KEY

   The Awin Data Feed List API uses a dedicated data-feed API key.
   This is intentionally kept server-side and is never exposed to
   the browser.

   The public endpoint:
     /api/shop-products

   Safety:
     - Only a fixed allowlist of Worth It partner programmes is used.
     - Only joined/active relationships are accepted.
     - Product URLs come from Awin's feed; no affiliate URLs are invented.
     - Product count is capped to keep the Shop fast.
========================================================= */

const AWIN_FEED_LIST_URL =
    "https://productdata.awin.com/datafeed/list/apikey/";

const CACHE_TTL_SECONDS =
    6 * 60 * 60;

const MAX_TOTAL_PRODUCTS =
    48;

const MAX_PRODUCTS_PER_PARTNER =
    8;

const MAX_FEED_BYTES =
    40 * 1024 * 1024;

const FEED_FETCH_TIMEOUT_MS =
    25000;

/*
 * Only programmes already selected for Worth It Shop are allowed.
 *
 * The matching terms intentionally use stable advertiser names rather
 * than advertiser IDs so the system can discover the current Awin feed
 * automatically from the publisher's feed list.
 */
const PARTNER_MATCHES = [
    {
        partnerId: "stylevana",
        match: ["stylevana"],
        category: "beauty-skincare"
    },
    {
        partnerId: "fntcase",
        match: ["shenzhen feinuote", "fntcase"],
        category: "phone-accessories"
    },
    {
        partnerId: "dowinx-eu",
        match: ["dowinx"],
        category: "gaming-office"
    },
    {
        partnerId: "king-koil",
        match: ["king koil"],
        category: "sleep-mattresses"
    },
    {
        partnerId: "simple-project",
        match: ["shenzhen cangyu", "simple project"],
        category: "bathroom-home"
    },
    {
        partnerId: "giftlab",
        match: ["giftlab"],
        category: "personalized-gifts"
    },
    {
        partnerId: "personalhour",
        match: ["personalhour"],
        category: "fitness-wellness"
    },
    {
        partnerId: "everblog-us",
        match: ["everblog"],
        category: "family-tech"
    },
    {
        partnerId: "getout",
        match: ["getout"],
        category: "family-experiences"
    }
];

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
            `public, max-age=300, s-maxage=${cacheSeconds}`
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

function normalizeText(value) {
    return String(value || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeKey(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function firstValue(row, keys) {
    for (const key of keys) {
        const value = row[key];

        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {
            return String(value).trim();
        }
    }

    return "";
}

function parseNumber(value) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {
        return null;
    }

    const clean = String(value)
        .replace(/[^0-9.+-]/g, "");

    const number = Number(clean);

    return Number.isFinite(number)
        ? number
        : null;
}

function parseBoolean(value) {
    const normalized =
        normalizeKey(value);

    if (
        normalized === "1" ||
        normalized === "true" ||
        normalized === "yes" ||
        normalized === "y"
    ) {
        return true;
    }

    if (
        normalized === "0" ||
        normalized === "false" ||
        normalized === "no" ||
        normalized === "n"
    ) {
        return false;
    }

    return null;
}

/*
 * A small RFC4180-compatible CSV parser. Product feeds can contain
 * commas and quoted descriptions, so simple split(",") is unsafe.
 */
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    quoted = false;
                }
            }
            else {
                field += char;
            }

            continue;
        }

        if (char === '"') {
            quoted = true;
            continue;
        }

        if (char === ",") {
            row.push(field);
            field = "";
            continue;
        }

        if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            continue;
        }

        if (char === "\r") {
            continue;
        }

        field += char;
    }

    row.push(field);

    if (row.some(cell => cell !== "")) {
        rows.push(row);
    }

    if (!rows.length) {
        return [];
    }

    const headers = rows[0].map(
        header =>
            normalizeText(header)
                .replace(/^"|"$/g, "")
                .toLowerCase()
    );

    return rows
        .slice(1)
        .map(values => {
            const object = {};

            headers.forEach(
                (header, index) => {
                    object[header] =
                        values[index] ?? "";
                }
            );

            return object;
        });
}

function findPartner(advertiserName) {
    const normalized =
        normalizeKey(
            advertiserName
        );

    return PARTNER_MATCHES.find(
        partner =>
            partner.match.some(
                token =>
                    normalized.includes(
                        normalizeKey(token)
                    )
            )
    ) || null;
}

function membershipIsActive(status) {
    const normalized =
        normalizeKey(status);

    return [
        "joined",
        "active",
        "approved",
        "accepted"
    ].includes(normalized);
}

function inferCategory(
    partnerId,
    merchantCategory,
    categoryName,
    productName
) {
    const text =
        normalizeKey(
            [
                merchantCategory,
                categoryName,
                productName
            ].join(" ")
        );

    if (
        partnerId === "stylevana" &&
        /(fashion|clothing|apparel|shoes|bags|accessories)/.test(text)
    ) {
        return "fashion-accessories";
    }

    if (
        partnerId === "giftlab" &&
        /(fashion|clothing|apparel|jewelry|accessories)/.test(text)
    ) {
        return "fashion-accessories";
    }

    const partner =
        PARTNER_MATCHES.find(
            item =>
                item.partnerId === partnerId
        );

    return partner?.category || "other";
}

function normalizeStock(row) {
    const inStock =
        parseBoolean(
            firstValue(
                row,
                [
                    "in_stock",
                    "stock_status"
                ]
            )
        );

    const stockQuantity =
        parseNumber(
            firstValue(
                row,
                [
                    "stock_quantity",
                    "number_available"
                ]
            )
        );

    if (inStock === false) {
        return "out-of-stock";
    }

    if (
        inStock === true ||
        (
            Number.isFinite(stockQuantity) &&
            stockQuantity > 0
        )
    ) {
        return "in-stock";
    }

    return "unknown";
}

function calculatePopularityScore(row) {
    const reviews =
        Math.max(
            0,
            parseNumber(
                firstValue(
                    row,
                    [
                        "reviews",
                        "number_stars"
                    ]
                )
            ) || 0
        );

    const averageRating =
        Math.max(
            0,
            Math.min(
                5,
                parseNumber(
                    firstValue(
                        row,
                        [
                            "average_rating",
                            "rating"
                        ]
                    )
                ) || 0
            )
        );

    const discount =
        Math.max(
            0,
            Math.min(
                100,
                parseNumber(
                    firstValue(
                        row,
                        [
                            "savings_percent"
                        ]
                    )
                ) || 0
            )
        );

    /*
     * Popularity is driven primarily by review volume, with rating and
     * discount acting as secondary signals. This is intentionally not a
     * commission score.
     */
    return (
        Math.log10(
            reviews + 1
        ) * 100 +
        averageRating * 12 +
        discount * 0.35
    );
}

function productFromRow(
    row,
    feed
) {
    const productName =
        firstValue(
            row,
            [
                "product_name",
                "name",
                "title"
            ]
        );

    const deepLink =
        firstValue(
            row,
            [
                "aw_deep_link",
                "affiliate_deep_link"
            ]
        );

    const merchantLink =
        firstValue(
            row,
            [
                "merchant_deep_link",
                "product_url"
            ]
        );

    const image =
        firstValue(
            row,
            [
                "merchant_image_url",
                "large_image",
                "aw_image_url",
                "image_url"
            ]
        );

    const price =
        parseNumber(
            firstValue(
                row,
                [
                    "search_price",
                    "store_price",
                    "price"
                ]
            )
        );

    const oldPrice =
        parseNumber(
            firstValue(
                row,
                [
                    "product_price_old",
                    "rrp_price",
                    "base_price"
                ]
            )
        );

    if (
        !productName ||
        !deepLink ||
        !image ||
        !Number.isFinite(price) ||
        price <= 0
    ) {
        return null;
    }

    if (!/^https?:\/\//i.test(deepLink)) {
        return null;
    }

    const partner =
        findPartner(
            feed.advertiserName
        );

    if (!partner) {
        return null;
    }

    const category =
        inferCategory(
            partner.partnerId,
            firstValue(row, ["merchant_category"]),
            firstValue(row, ["category_name"]),
            productName
        );

    const savingsPercent =
        parseNumber(
            firstValue(
                row,
                [
                    "savings_percent"
                ]
            )
        );

    const safeOldPrice =
        Number.isFinite(oldPrice) &&
        oldPrice > price
            ? oldPrice
            : price;

    const awProductId =
        firstValue(
            row,
            [
                "aw_product_id",
                "merchant_product_id",
                "product_id"
            ]
        );

    const stockStatus =
        normalizeStock(row);

    return {
        id:
            awProductId
                ? `awin-${partner.partnerId}-${awProductId}`
                : `awin-${partner.partnerId}-${encodeURIComponent(deepLink)}`,

        title:
            productName,

        price:
            Number(price.toFixed(2)),

        oldPrice:
            Number(safeOldPrice.toFixed(2)),

        currency:
            firstValue(
                row,
                ["currency"]
            ) || "$",

        image:
            image,

        affiliateUrl:
            deepLink,

        merchantUrl:
            merchantLink,

        store:
            firstValue(
                row,
                [
                    "merchant_name"
                ]
            ) ||
            feed.advertiserName,

        partnerId:
            partner.partnerId,

        category:
            category,

        stockStatus:
            stockStatus,

        popularityScore:
            calculatePopularityScore(row),

        reviews:
            parseNumber(
                firstValue(
                    row,
                    [
                        "reviews"
                    ]
                )
            ) || 0,

        rating:
            parseNumber(
                firstValue(
                    row,
                    [
                        "average_rating",
                        "rating"
                    ]
                )
            ),

        productUpdatedAt:
            firstValue(
                row,
                [
                    "last_updated"
                ]
            ),

        savingsPercent:
            Number.isFinite(savingsPercent)
                ? savingsPercent
                : null
    };
}

function dedupeProducts(products) {
    const map = new Map();

    for (const product of products) {
        if (!product) {
            continue;
        }

        const key =
            normalizeKey(
                product.affiliateUrl
            ) ||
            normalizeKey(
                [
                    product.partnerId,
                    product.title
                ].join(" ")
            );

        if (!key) {
            continue;
        }

        const existing =
            map.get(key);

        if (
            !existing ||
            product.popularityScore >
                existing.popularityScore
        ) {
            map.set(
                key,
                product
            );
        }
    }

    return [
        ...map.values()
    ];
}

async function fetchText(
    url,
    signal
) {
    const response =
        await fetch(
            url,
            {
                method: "GET",
                signal,
                headers: {
                    "Accept":
                        "text/csv,text/plain,*/*",
                    "User-Agent":
                        "Worth-It-Shop/1.0"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `Upstream HTTP ${response.status}`
        );
    }

    const contentLength =
        Number(
            response.headers.get(
                "content-length"
            )
        );

    if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_FEED_BYTES
    ) {
        throw new Error(
            "Feed is larger than the safe processing limit."
        );
    }

    const text =
        await response.text();

    if (
        new TextEncoder()
            .encode(text)
            .byteLength > MAX_FEED_BYTES
    ) {
        throw new Error(
            "Feed is larger than the safe processing limit."
        );
    }

    return text;
}

function feedDescriptorFromRow(
    row
) {
    const advertiserName =
        firstValue(
            row,
            [
                "advertiser name",
                "advertiser_name",
                "advertiser"
            ]
        );

    const membershipStatus =
        firstValue(
            row,
            [
                "membership status",
                "membership_status",
                "status"
            ]
        );

    const downloadUrl =
        firstValue(
            row,
            [
                "url",
                "download url",
                "download_url"
            ]
        );

    if (
        !advertiserName ||
        !downloadUrl ||
        !membershipIsActive(
            membershipStatus
        )
    ) {
        return null;
    }

    const partner =
        findPartner(
            advertiserName
        );

    if (!partner) {
        return null;
    }

    return {
        advertiserName,
        partnerId:
            partner.partnerId,
        category:
            partner.category,
        downloadUrl,
        lastImported:
            firstValue(
                row,
                [
                    "last imported",
                    "last_imported"
                ]
            ),
        language:
            firstValue(
                row,
                [
                    "language"
                ]
            ),
        vertical:
            firstValue(
                row,
                [
                    "vertical"
                ]
            )
    };
}

async function fetchFeedProducts(
    feed,
    signal
) {
    const csv =
        await fetchText(
            feed.downloadUrl,
            signal
        );

    const rows =
        parseCSV(
            csv
        );

    return rows
        .map(
            row =>
                productFromRow(
                    row,
                    feed
                )
        )
        .filter(Boolean)
        .sort(
            (
                first,
                second
            ) =>
                second.popularityScore -
                first.popularityScore
        )
        .slice(
            0,
            MAX_PRODUCTS_PER_PARTNER
        );
}

export async function onRequestGet(
    context
) {
    recordAdminApiUsage(
        context,
        {
            apiKey:
                "shop-affiliate-feed",
            provider:
                "Awin Product Feeds"
        }
    );

    const apiKey =
        context.env
            .AWIN_DATAFEED_API_KEY;

    if (!apiKey) {
        return jsonResponse(
            {
                ok: false,
                configured: false,
                products: [],
                error:
                    "Awin data feed key is not configured."
            },
            503
        );
    }

    const cache =
        caches.default;

    const cacheKey =
        new Request(
            "https://worth-it-shop-feed-cache.local/api/shop-products?v=1"
        );

    const cached =
        await cache.match(
            cacheKey
        );

    if (cached) {
        return cached;
    }

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () =>
                controller.abort(),
            FEED_FETCH_TIMEOUT_MS
        );

    try {
        const feedListText =
            await fetchText(
                AWIN_FEED_LIST_URL +
                    encodeURIComponent(
                        apiKey
                    ),
                controller.signal
            );

        const feedListRows =
            parseCSV(
                feedListText
            );

        const feeds =
            feedListRows
                .map(
                    row =>
                        feedDescriptorFromRow(
                            row
                        )
                )
                .filter(Boolean);

        const products = [];

        /*
         * Fetch programme feeds in parallel, but never allow one failing
         * advertiser to prevent all other connected advertisers from
         * contributing products.
         */
        const results =
            await Promise.allSettled(
                feeds.map(
                    feed =>
                        fetchFeedProducts(
                            feed,
                            controller.signal
                        )
                )
            );

        results.forEach(
            (
                result,
                index
            ) => {
                if (
                    result.status !==
                    "fulfilled"
                ) {
                    console.warn(
                        "Awin product feed failed for " +
                        feeds[index].advertiserName +
                        ":",
                        result.reason
                    );

                    return;
                }

                products.push(
                    ...result.value
                );
            }
        );

        const finalProducts =
            dedupeProducts(
                products
            )
                .sort(
                    (
                        first,
                        second
                    ) =>
                        second.popularityScore -
                        first.popularityScore
                )
                .slice(
                    0,
                    MAX_TOTAL_PRODUCTS
                )
                .map(
                    product => ({
                        ...product,
                        popularityScore:
                            undefined
                    })
                );

        const response =
            jsonResponse(
                {
                    ok: true,
                    configured: true,
                    generatedAt:
                        new Date().toISOString(),
                    feeds:
                        feeds.map(
                            feed => ({
                                advertiserName:
                                    feed.advertiserName,
                                partnerId:
                                    feed.partnerId,
                                lastImported:
                                    feed.lastImported,
                                language:
                                    feed.language,
                                vertical:
                                    feed.vertical
                            })
                        ),
                    products:
                        finalProducts
                },
                200,
                CACHE_TTL_SECONDS
            );

        context.waitUntil(
            cache.put(
                cacheKey,
                response.clone()
            )
        );

        return response;

    }
    catch (error) {
        console.warn(
            "Awin Shop feed request failed:",
            error
        );

        return jsonResponse(
            {
                ok: false,
                configured: true,
                products: [],
                error:
                    "Awin product feeds could not be loaded."
            },
            502
        );
    }
    finally {
        clearTimeout(
            timeout
        );
    }
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
