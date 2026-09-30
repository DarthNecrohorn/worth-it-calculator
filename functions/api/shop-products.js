import { recordAdminApiUsage } from "../lib/admin-usage.js";

/* =========================================================
   WORTH IT — AUTOMATIC AWIN SHOP PRODUCT FEED

   Purpose:
     Automatically discover approved Awin advertiser feeds and
     turn their product data into Shop cards.

   Primary Cloudflare secret:
     AWIN_FEED_LIST_URL

   Secret:
     AWIN_FEED_LIST_URL

   The Feed List URL is kept server-side and is never exposed to the browser.

   The public endpoint:
     /api/shop-products

   Safety:
     - Only a fixed allowlist of Worth It partner programmes is used.
     - Only joined/active relationships are accepted.
     - Product URLs come from Awin's feed; no affiliate URLs are invented.
     - Product count is capped to keep the Shop fast.
========================================================= */

const AWIN_FEED_LIST_URL_ENV =
    "AWIN_FEED_LIST_URL";

const MAX_FEED_LIST_BYTES =
    10 * 1024 * 1024;

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
        category: "gaming-office",
        prefer: ["dowinx eu"]
    },
    {
        partnerId: "king-koil",
        match: ["king koil"],
        category: "sleep-mattresses"
    },
    {
        partnerId: "simple-project",
        match: ["shenzhen cangyu", "simple project"],
        category: "bathroom-home",
        shippingFallbackCountries: [
            "US"
        ],
        shippingSourceLabel:
            "Merchant shipping policy",
        shippingNote:
            "Simple Project states that delivery addresses are limited to the United States. Some remote areas, including Alaska, Hawaii and Puerto Rico, may be excluded; final postcode eligibility is checked by the merchant."
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
        category: "family-tech",
        prefer: ["everblog us"]
    },
    {
        partnerId: "getout",
        match: ["getout"],
        category: "family-experiences"
    }
];

const REGION_TO_LOCALE = {
    AU: "en_AU",
    CA: "en_CA",
    US: "en_US",
    GB: "en_GB",
    DE: "de_DE",
    FR: "fr_FR",
    IT: "it_IT",
    ES: "es_ES",
    PT: "pt_PT",
    NL: "nl_NL",
    BE: "nl_BE",
    AT: "de_AT",
    CH: "de_CH",
    DK: "da_DK",
    SE: "sv_SE",
    NO: "no_NO",
    FI: "fi_FI",
    PL: "pl_PL",
    CZ: "cs_CZ",
    SK: "sk_SK",
    HU: "hu_HU",
    RO: "ro_RO"
};

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
    const source =
        String(text || "")
            .replace(/^\uFEFF/, "");

    const firstLine =
        source.split("\n", 1)[0] || "";

    const delimiterCandidates = [
        ",",
        "|",
        ";",
        "\t"
    ];

    const delimiter =
        delimiterCandidates
            .map(
                candidate => ({
                    candidate,
                    count:
                        firstLine.split(candidate).length - 1
                })
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    second.count -
                    first.count
            )[0]
            ?.candidate || ",";

    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < source.length; i++) {
        const char = source[i];

        if (quoted) {
            if (char === '"') {
                if (source[i + 1] === '"') {
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

        if (char === delimiter) {
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
                .replace(/^\uFEFF/, "")
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

function parseEnhancedPrice(value) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
    ) {
        return {
            amount: null,
            currency: ""
        };
    }

    const text =
        normalizeText(value);

    const match =
        text.match(
            /([0-9][0-9.,]*)\s*([A-Z]{3})$/i
        );

    if (!match) {
        const number =
            Number(
                text.replace(/[^0-9.+-]/g, "")
            );

        return {
            amount:
                Number.isFinite(number)
                    ? number
                    : null,
            currency: ""
        };
    }

    const numericText =
        match[1]
            .replace(/,(?=\d{3}(?:\D|$))/g, "")
            .replace(",", ".");

    const amount =
        Number(numericText);

    return {
        amount:
            Number.isFinite(amount)
                ? amount
                : null,
        currency:
            String(match[2]).toUpperCase()
    };
}

function calculateEnhancedPopularity(product) {
    const price =
        Number.isFinite(product.price)
            ? product.price
            : 0;

    const oldPrice =
        Number.isFinite(product.oldPrice)
            ? product.oldPrice
            : price;

    const discount =
        oldPrice > price
            ? ((oldPrice - price) / oldPrice) * 100
            : 0;

    return Math.max(
        0,
        discount * 2
    );
}

function localeFromFeedListRow(
    row
) {
    const language =
        normalizeKey(
            row?.language
        );

    const directMap = {
        english: "en_GB",
        en: "en_GB",
        "en gb": "en_GB",
        "en us": "en_US",
        "en au": "en_AU",
        "en ca": "en_CA",
        german: "de_DE",
        de: "de_DE",
        french: "fr_FR",
        fr: "fr_FR"
    };

    return (
        REGION_TO_LOCALE[
            normalizeText(
                row?.primaryRegion
            ).toUpperCase()
        ] ||
        directMap[language] ||
        "en_GB"
    );
}

function parseAwinFeedList(
    text
) {
    const rows =
        parseCSV(text);

    if (!rows.length) {
        throw new Error(
            "Awin Feed List is empty."
        );
    }

    const sample =
        rows[0] || {};

    if (
        !firstValue(
            sample,
            [
                "advertiser name",
                "advertiser_name"
            ]
        ) ||
        !firstValue(
            sample,
            [
                "feed name",
                "feed_name"
            ]
        ) ||
        !firstValue(
            sample,
            [
                "url",
                "download url",
                "download_url"
            ]
        )
    ) {
        throw new Error(
            "Awin Feed List format was not recognized."
        );
    }

    return rows;
}

async function fetchAwinFeedList(
    feedListUrl,
    signal
) {
    const response =
        await fetch(
            feedListUrl,
            {
                method: "GET",
                signal,
                headers: {
                    "Accept":
                        "text/csv, text/plain, */*",
                    "User-Agent":
                        "Worth-It-Shop/1.0"
                }
            }
        );

    if (!response.ok) {
        const error =
            new Error(
                `Awin Feed List HTTP ${response.status}`
            );

        error.status =
            response.status;

        throw error;
    }

    const contentLength =
        Number(
            response.headers.get(
                "content-length"
            )
        );

    if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_FEED_LIST_BYTES
    ) {
        throw new Error(
            "Awin Feed List is larger than the safe processing limit."
        );
    }

    const text =
        await response.text();

    if (
        new TextEncoder()
            .encode(text)
            .byteLength > MAX_FEED_LIST_BYTES
    ) {
        throw new Error(
            "Awin Feed List is larger than the safe processing limit."
        );
    }

    return parseAwinFeedList(
        text
    );
}

function buildFeedsFromFeedList(
    rows
) {
    return PARTNER_MATCHES
        .map(
            partner => {
                const candidates =
                    rows
                        .map(
                            row => ({
                                advertiserName:
                                    firstValue(
                                        row,
                                        [
                                            "advertiser name",
                                            "advertiser_name"
                                        ]
                                    ),
                                advertiserId:
                                    firstValue(
                                        row,
                                        [
                                            "advertiser id",
                                            "advertiser_id"
                                        ]
                                    ),
                                feedName:
                                    firstValue(
                                        row,
                                        [
                                            "feed name",
                                            "feed_name"
                                        ]
                                    ),
                                primaryRegion:
                                    firstValue(
                                        row,
                                        [
                                            "primary region",
                                            "primary_region"
                                        ]
                                    ),
                                membershipStatus:
                                    firstValue(
                                        row,
                                        [
                                            "membership status",
                                            "membership_status"
                                        ]
                                    ),
                                feedId:
                                    firstValue(
                                        row,
                                        [
                                            "feed id",
                                            "feed_id"
                                        ]
                                    ),
                                language:
                                    firstValue(
                                        row,
                                        [
                                            "language"
                                        ]
                                    ),
                                lastImported:
                                    firstValue(
                                        row,
                                        [
                                            "last imported",
                                            "last_imported"
                                        ]
                                    ),
                                downloadUrl:
                                    firstValue(
                                        row,
                                        [
                                            "url",
                                            "download url",
                                            "download_url"
                                        ]
                                    )
                            })
                        )
                        .filter(
                            candidate => {
                                const normalizedName =
                                    normalizeKey(
                                        candidate.advertiserName
                                    );

                                return (
                                    partner.match.some(
                                        token =>
                                            normalizedName.includes(
                                                normalizeKey(token)
                                            )
                                    ) &&
                                    membershipIsActive(
                                        candidate.membershipStatus
                                    ) &&
                                    /^https?:\/\//i.test(
                                        candidate.downloadUrl
                                    )
                                );
                            }
                        );

                if (!candidates.length) {
                    return null;
                }

                candidates.sort(
                    (
                        first,
                        second
                    ) => {
                        const firstDefault =
                            normalizeKey(
                                first.feedName
                            ) === "default"
                                ? 1
                                : 0;

                        const secondDefault =
                            normalizeKey(
                                second.feedName
                            ) === "default"
                                ? 1
                                : 0;

                        if (
                            firstDefault !==
                            secondDefault
                        ) {
                            return (
                                secondDefault -
                                firstDefault
                            );
                        }

                        return String(
                            second.lastImported
                        ).localeCompare(
                            String(
                                first.lastImported
                            )
                        );
                    }
                );

                const selected =
                    candidates[0];

                return {
                    source:
                        "feed-list",
                    partnerId:
                        partner.partnerId,
                    category:
                        partner.category,
                    advertiserId:
                        selected.advertiserId ||
                        selected.feedId ||
                        "",
                    advertiserName:
                        normalizeText(
                            selected.advertiserName
                        ),
                    primaryRegion:
                        selected.primaryRegion ||
                        null,
                    lastImported:
                        selected.lastImported ||
                        "",
                    currencyCode:
                        "",
                    locale:
                        localeFromFeedListRow(
                            selected
                        ),
                    feedName:
                        selected.feedName ||
                        "",
                    downloadUrl:
                        selected.downloadUrl
                };
            }
        )
        .filter(Boolean);
}

function countryCodesFromLegacyDelivery(
    row
) {
    const raw =
        firstValue(
            row,
            [
                "delivery restrictions",
                "delivery_restrictions",
                "shipping",
                "shipping countries",
                "shipping_countries",
                "delivery country",
                "delivery_country"
            ]
        );

    if (!raw) {
        return [];
    }

    const matches =
        String(raw)
            .toUpperCase()
            .match(
                /\b[A-Z]{2}\b/g
            ) || [];

    return [
        ...new Set(
            matches
        )
    ];
}

function productFromLegacyRecord(
    row,
    feed
) {
    const title =
        firstValue(
            row,
            [
                "product name",
                "product_name",
                "title"
            ]
        );

    const deepLink =
        firstValue(
            row,
            [
                "aw_deep_link",
                "merchant_deep_link",
                "merchant deep link"
            ]
        );

    const image =
        firstValue(
            row,
            [
                "aw_image_url",
                "large_image",
                "merchant_image_url",
                "merchant image url"
            ]
        );

    const priceInfo =
        parseEnhancedPrice(
            firstValue(
                row,
                [
                    "search_price",
                    "store_price",
                    "base_price_amount",
                    "base price amount"
                ]
            )
        );

    const price =
        priceInfo.amount;

    const currency =
        firstValue(
            row,
            [
                "currency",
                "currency_code",
                "currency code"
            ]
        ).toUpperCase() ||
        priceInfo.currency ||
        feed.currencyCode ||
        "USD";

    const oldPriceInfo =
        parseEnhancedPrice(
            firstValue(
                row,
                [
                    "product_price_old",
                    "rrp_price",
                    "base_price_amount",
                    "base price amount"
                ]
            )
        );

    const oldPrice =
        Number.isFinite(
            oldPriceInfo.amount
        ) &&
        Number.isFinite(price) &&
        oldPriceInfo.amount > price
            ? oldPriceInfo.amount
            : price;

    if (
        !title ||
        !deepLink ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !/^https?:\/\//i.test(
            deepLink
        )
    ) {
        return null;
    }

    const partner =
        PARTNER_MATCHES.find(
            item =>
                item.partnerId ===
                feed.partnerId
        );

    if (!partner) {
        return null;
    }

    const merchantCategory =
        normalizeText(
            [
                firstValue(
                    row,
                    [
                        "merchant_category",
                        "merchant category"
                    ]
                ),
                firstValue(
                    row,
                    [
                        "category_name",
                        "category name"
                    ]
                ),
                firstValue(
                    row,
                    [
                        "product_type",
                        "product type"
                    ]
                )
            ]
                .filter(Boolean)
                .join(" ")
        );

    const category =
        inferCategory(
            partner.partnerId,
            merchantCategory,
            merchantCategory,
            title
        );

    let shippingCountries =
        countryCodesFromLegacyDelivery(
            row
        );

    let shippingSourceLabel =
        "Awin product feed";

    let shippingNote =
        "Shipping destinations are taken from the current Awin product feed. Final availability, shipping cost and checkout eligibility can vary by address and merchant.";

    if (!shippingCountries.length) {
        const fallbackCountries =
            Array.isArray(
                partner.shippingFallbackCountries
            )
                ? partner.shippingFallbackCountries
                : [];

        shippingCountries =
            [
                ...new Set(
                    fallbackCountries
                        .map(
                            code =>
                                String(code)
                                    .trim()
                                    .toUpperCase()
                        )
                        .filter(
                            code =>
                                /^[A-Z]{2}$/.test(
                                    code
                                )
                        )
                )
            ];

        shippingSourceLabel =
            partner.shippingSourceLabel ||
            "Merchant shipping policy";

        shippingNote =
            partner.shippingNote ||
            "Shipping destinations are based on the merchant's current shipping policy. Final item availability, shipping cost and checkout eligibility can vary.";
    }

    if (!shippingCountries.length) {
        return null;
    }

    const productId =
        firstValue(
            row,
            [
                "aw_product_id",
                "merchant_product_id",
                "product_id"
            ]
        );

    const product = {
        id:
            productId
                ? `awin-${partner.partnerId}-${productId}`
                : `awin-${partner.partnerId}-${encodeURIComponent(deepLink)}`,

        title,

        price:
            Number(
                price.toFixed(2)
            ),

        oldPrice:
            Number(
                (
                    Number.isFinite(oldPrice)
                        ? oldPrice
                        : price
                ).toFixed(2)
            ),

        currency,

        image,

        affiliateUrl:
            deepLink,

        merchantUrl:
            firstValue(
                row,
                [
                    "merchant_deep_link",
                    "merchant deep link"
                ]
            ),

        store:
            feed.advertiserName,

        partnerId:
            partner.partnerId,

        category,

        stockStatus:
            firstValue(
                row,
                [
                    "stock_status",
                    "stock status",
                    "in_stock",
                    "in stock"
                ]
            ) ||
            "unknown",

        popularityScore:
            0,

        productUpdatedAt:
            firstValue(
                row,
                [
                    "last_updated",
                    "last updated"
                ]
            ) ||
            feed.lastImported ||
            "Latest Awin feed",

        savingsPercent:
            oldPrice > price
                ? Number(
                    (
                        (
                            (oldPrice - price) /
                            oldPrice
                        ) * 100
                    ).toFixed(2)
                )
                : null,

        shippingCountries,

        shippingSourceLabel,

        shippingNote
    };

    product.popularityScore =
        calculateEnhancedPopularity(
            product
        );

    return product;
}

function parseLegacyCSVFeed(
    text,
    feed
) {
    return parseCSV(
        text
    )
        .map(
            row =>
                productFromLegacyRecord(
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

async function fetchLegacyFeed(
    feed,
    signal
) {
    const response =
        await fetch(
            feed.downloadUrl,
            {
                method: "GET",
                signal,
                headers: {
                    "Accept":
                        "text/csv, text/plain, application/octet-stream, */*",
                    "User-Agent":
                        "Worth-It-Shop/1.0"
                }
            }
        );

    if (!response.ok) {
        const error =
            new Error(
                `Awin Feed HTTP ${response.status}`
            );

        error.status =
            response.status;

        throw error;
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

    const bytes =
        new Uint8Array(
            await response.arrayBuffer()
        );

    if (
        bytes.byteLength >
        MAX_FEED_BYTES
    ) {
        throw new Error(
            "Feed is larger than the safe processing limit."
        );
    }

    let sourceBytes =
        bytes;

    /*
     * Feed List download URLs commonly request GZIP compression.
     * Detect the gzip file signature so the worker can safely decode
     * the feed whether or not the upstream Content-Encoding header is
     * transparently handled by the runtime.
     */
    if (
        bytes.length >= 2 &&
        bytes[0] === 0x1f &&
        bytes[1] === 0x8b
    ) {
        const decompressed =
            await new Response(
                new Blob([
                    bytes
                ]).stream().pipeThrough(
                    new DecompressionStream(
                        "gzip"
                    )
                )
            ).arrayBuffer();

        sourceBytes =
            new Uint8Array(
                decompressed
            );

        if (
            sourceBytes.byteLength >
            MAX_FEED_BYTES
        ) {
            throw new Error(
                "Decompressed feed is larger than the safe processing limit."
            );
        }
    }

    const text =
        new TextDecoder(
            "utf-8",
            {
                fatal:
                    false
            }
        ).decode(
            sourceBytes
        );

    return parseLegacyCSVFeed(
        text,
        feed
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

    const feedListUrl =
        context.env?.[AWIN_FEED_LIST_URL_ENV];

    if (!feedListUrl) {
        return jsonResponse(
            {
                ok: false,
                configured: false,
                products: [],
                error:
                    "Awin Feed List URL is not configured."
            },
            503
        );
    }

    const debugMode =
        new URL(
            context.request.url
        ).searchParams.get("debug") === "1";

    const cache =
        caches.default;

    const cacheKey =
        new Request(
            "https://worth-it-shop-feed-cache.local/api/shop-products?v=14"
        );

    const cached =
        debugMode
            ? null
            : await cache.match(
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
        const feedListRows =
            await fetchAwinFeedList(
                feedListUrl,
                controller.signal
            );

        const discoveredFeeds =
            buildFeedsFromFeedList(
                feedListRows
            );

        const discoverySource =
            "feed-list";

        const feedListInfo = {
            configured:
                true,
            loaded:
                true,
            rows:
                feedListRows.length,
            matched:
                discoveredFeeds.length,
            fallbackToApi:
                false,
            matchedAdvertisers:
                discoveredFeeds.map(
                    feed =>
                        feed.advertiserName
                )
        };

        const products = [];
        const feedResults = [];

        /*
         * Awin asks publishers to limit Enhanced Feed downloads to
         * no more than 5 requests per minute. Feed results are therefore
         * downloaded sequentially and cached individually for 6 hours.
         */
        let feedRequestsUsed = 0;

        for (
            const feed of discoveredFeeds
        ) {
            const feedCacheKey =
                new Request(
                    `https://worth-it-shop-feed-cache.local/api/feed/feed-list/${feed.advertiserId}/${feed.locale}/v14`
                );

            let feedProducts =
                null;

            let cachedFeedStatus =
                "cache-hit";

            const feedCached =
                debugMode
                    ? null
                    : await cache.match(
                        feedCacheKey
                    );

            if (feedCached) {
                try {
                    const payload =
                        await feedCached.json();

                    if (
                        payload &&
                        Array.isArray(
                            payload.products
                        )
                    ) {
                        /*
                         * An empty array is still a completed feed result.
                         * Reusing it prevents partners without publishable
                         * products from consuming another Awin request on
                         * every page load.
                         */
                        feedProducts =
                            payload.products;

                        if (
                            payload.status ===
                            "feed-not-found"
                        ) {
                            cachedFeedStatus =
                                "feed-not-found-cache";
                        }
                        else if (
                            payload.status ===
                            "unavailable"
                        ) {
                            cachedFeedStatus =
                                "unavailable-cache";
                        }
                    }
                }
                catch {
                    feedProducts =
                        null;
                }
            }

            if (!feedProducts) {
                if (
                    feedRequestsUsed >=
                    MAX_FEED_REQUESTS_PER_RUN
                ) {
                    feedResults.push({
                        advertiserName:
                            feed.advertiserName,
                        advertiserId:
                            feed.advertiserId,
                        locale:
                            feed.locale,
                        status:
                            "rate-limit-batch-deferred",
                        source:
                            "feed-list",
                        feedName:
                            feed.feedName ||
                            "",
                        products:
                            0
                    });

                    continue;
                }

                feedRequestsUsed++;

                try {
                    feedProducts =
                        await fetchLegacyFeed(
                            feed,
                            controller.signal
                        );

                    const feedResponse =
                        jsonResponse(
                            {
                                advertiserName:
                                    feed.advertiserName,
                                advertiserId:
                                    feed.advertiserId,
                                locale:
                                    feed.locale,
                                currencyCode:
                                    feed.currencyCode || "",
                                primaryRegion:
                                    feed.primaryRegion || null,
                                generatedAt:
                                    new Date().toISOString(),
                                products:
                                    feedProducts
                            },
                            200,
                            CACHE_TTL_SECONDS
                        );

                    context.waitUntil(
                        cache.put(
                            feedCacheKey,
                            feedResponse.clone()
                        )
                    );

                    feedResults.push({
                        advertiserName:
                            feed.advertiserName,
                        advertiserId:
                            feed.advertiserId,
                        locale:
                            feed.locale,
                        status:
                            "loaded",
                        source:
                            "feed-list",
                        feedName:
                            feed.feedName ||
                            "",
                        products:
                            feedProducts.length,
                    });
                }
                catch (error) {
                    console.warn(
                        "Awin Feed List product feed failed for " +
                        feed.advertiserName +
                        ":",
                        error
                    );

                    if (feedDebug) {
                        feedDebug.lastError =
                            normalizeText(
                                error?.message ||
                                "Unknown Awin feed error"
                            ).slice(0, 500);
                    }

                    const failureStatus =
                        error?.status === 404
                            ? "feed-not-found"
                            : "unavailable";

                    /*
                     * Only a confirmed 404 is negatively cached.
                     * Temporary upstream failures, rate limits, timeouts
                     * and server errors must be retried on the next run.
                     */
                    if (
                        failureStatus ===
                        "feed-not-found"
                    ) {
                        const negativeCacheResponse =
                            jsonResponse(
                                {
                                    advertiserName:
                                        feed.advertiserName,
                                    advertiserId:
                                        feed.advertiserId,
                                    locale:
                                        feed.locale,
                                    currencyCode:
                                        feed.currencyCode || "",
                                    primaryRegion:
                                        feed.primaryRegion || null,
                                    status:
                                        failureStatus,
                                    products:
                                        [],
                                    generatedAt:
                                        new Date().toISOString()
                                },
                                200,
                                60 * 60
                            );

                        context.waitUntil(
                            cache.put(
                                feedCacheKey,
                                negativeCacheResponse
                            )
                        );
                    }

                    feedResults.push({
                        advertiserName:
                            feed.advertiserName,
                        advertiserId:
                            feed.advertiserId,
                        locale:
                            feed.locale,
                        currencyCode:
                            feed.currencyCode || "",
                        primaryRegion:
                            feed.primaryRegion || null,
                        status:
                            failureStatus,
                        source:
                            "feed-list",
                        feedName:
                            feed.feedName ||
                            "",
                        products:
                            0,
                        ...(debugMode
                            ? {
                                debug:
                                    feedDebug
                            }
                            : {})
                    });

                    continue;
                }
            }
            else {
                feedResults.push({
                    advertiserName:
                        feed.advertiserName,
                    advertiserId:
                        feed.advertiserId,
                    locale:
                        feed.locale,
                    currencyCode:
                        feed.currencyCode || "",
                    primaryRegion:
                        feed.primaryRegion || null,
                    status:
                        cachedFeedStatus,
                    source:
                        "feed-list",
                    feedName:
                        feed.feedName ||
                        "",
                    products:
                        feedProducts.length
                });
            }

            products.push(
                ...feedProducts
            );
        }

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

        const unfinished =
            feedResults.some(
                item =>
                    item.status ===
                    "rate-limit-batch-deferred"
            );

        const response =
            jsonResponse(
                {
                    ok: true,
                    configured: true,
                    generatedAt:
                        new Date().toISOString(),
                    feeds:
                        feedResults,
                    products:
                        finalProducts,
                    ...(debugMode
                        ? {
                            debug: {
                                note:
                                    "Debug mode bypasses Shop caches and fetches up to 5 feeds to inspect product shipping data.",
                                discoverySource,
                                feedList:
                                    feedListInfo
                            }
                        }
                        : {})
                },
                200,
                debugMode
                    ? 0
                    : unfinished
                        ? 0
                        : CACHE_TTL_SECONDS
            );

        if (
            !debugMode &&
            !unfinished
        ) {
            context.waitUntil(
                cache.put(
                    cacheKey,
                    response.clone()
                )
            );
        }

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
            error?.status === 401 ||
            error?.status === 403
                ? 502
                : 502
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
