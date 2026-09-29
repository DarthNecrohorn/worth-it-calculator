import { recordAdminApiUsage } from "../lib/admin-usage.js";

/* =========================================================
   WORTH IT — AUTOMATIC AWIN SHOP PRODUCT FEED

   Purpose:
     Automatically discover approved Awin advertiser feeds and
     turn their product data into Shop cards.

   Required Cloudflare secret:
     AWIN_API_TOKEN

   The standard Awin Publisher API token is kept server-side and is
   never exposed to the browser.

   The public endpoint:
     /api/shop-products

   Safety:
     - Only a fixed allowlist of Worth It partner programmes is used.
     - Only joined/active relationships are accepted.
     - Product URLs come from Awin's feed; no affiliate URLs are invented.
     - Product count is capped to keep the Shop fast.
========================================================= */

const AWIN_PUBLISHER_ID = "3077319";

const AWIN_API_BASE_URL =
    "https://api.awin.com";

const AWIN_API_TOKEN_ENV =
    "AWIN_API_TOKEN";

const CACHE_TTL_SECONDS =
    6 * 60 * 60;

const MAX_TOTAL_PRODUCTS =
    48;

const MAX_PRODUCTS_PER_PARTNER =
    8;

const MAX_FEED_REQUESTS_PER_RUN =
    5;

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

function createFeedDebug() {
    return {
        recordsSeen: 0,
        validJson: 0,
        errorLines: 0,
        missingShipping: 0,
        productsAccepted: 0,
        directShippingRecords: 0,
        entryShippingRecords: 0,
        deliveryShippingRecords: 0,
        countryValuesFound: 0,
        shippingEmptyStrings: 0,
        shippingArrays: 0,
        shippingObjects: 0,
        shippingOtherValues: 0,
        sampleDetailKeys: [],
        sampleShipping: []
    };
}

function noteFeedDebugShape(
    debug,
    entry,
    details
) {
    if (!debug) {
        return;
    }

    debug.recordsSeen++;

    if (
        !debug.sampleDetailKeys.length &&
        details &&
        typeof details === "object"
    ) {
        debug.sampleDetailKeys =
            Object.keys(details)
                .slice(0, 40);
    }

    const directShipping =
        details?.shipping;

    const entryShipping =
        entry?.shipping;

    const deliveryShipping =
        details?.delivery?.shipping;

    if (
        directShipping !== undefined &&
        directShipping !== null
    ) {
        debug.directShippingRecords++;
    }

    if (
        entryShipping !== undefined &&
        entryShipping !== null
    ) {
        debug.entryShippingRecords++;
    }

    if (
        deliveryShipping !== undefined &&
        deliveryShipping !== null
    ) {
        debug.deliveryShippingRecords++;
    }

    const candidates = [
        directShipping,
        entryShipping,
        deliveryShipping
    ].filter(
        value =>
            value !== undefined &&
            value !== null
    );

    for (const candidate of candidates) {
        let value = candidate;

        if (
            typeof value === "string" &&
            !value.trim()
        ) {
            debug.shippingEmptyStrings++;
        }

        if (Array.isArray(value)) {
            debug.shippingArrays++;
        }
        else if (
            value &&
            typeof value === "object"
        ) {
            debug.shippingObjects++;
        }
        else if (
            value !== undefined &&
            value !== null
        ) {
            debug.shippingOtherValues++;
        }

        if (typeof value === "string") {
            const rawPreview =
                value.slice(0, 500);

            if (
                debug.sampleShipping.length < 5
            ) {
                debug.sampleShipping.push({
                    rawType:
                        "string",
                    rawPreview
                });
            }

            try {
                value = JSON.parse(value);
            }
            catch {
                value = null;
            }
        }

        const list =
            Array.isArray(value)
                ? value
                : value &&
                    typeof value === "object"
                    ? [value]
                    : [];

        for (const item of list) {
            if (item?.country) {
                debug.countryValuesFound++;

                if (
                    debug.sampleShipping.length < 5
                ) {
                    debug.sampleShipping.push({
                        country:
                            String(
                                item.country
                            ),
                        keys:
                            Object.keys(item)
                                .slice(0, 20)
                    });
                }
            }
            else if (
                item &&
                typeof item === "object" &&
                debug.sampleShipping.length < 5
            ) {
                debug.sampleShipping.push({
                    rawType:
                        "object-without-country",
                    keys:
                        Object.keys(item)
                            .slice(0, 20),
                    preview:
                        JSON.stringify(item)
                            .slice(0, 500)
                });
            }
            else if (
                item !== undefined &&
                item !== null &&
                debug.sampleShipping.length < 5
            ) {
                debug.sampleShipping.push({
                    rawType:
                        typeof item,
                    value:
                        String(item)
                            .slice(0, 200)
                });
            }
        }
    }
}

function countryCodesFromShippingItem(
    item
) {
    const codes = [];

    if (
        typeof item === "string"
    ) {
        const code =
            item
                .trim()
                .toUpperCase();

        if (/^[A-Z]{2}$/.test(code)) {
            codes.push(code);
        }

        return codes;
    }

    if (
        !item ||
        typeof item !== "object"
    ) {
        return codes;
    }

    const directValues = [
        item.country,
        item.country_code,
        item.countryCode
    ];

    for (const value of directValues) {
        if (Array.isArray(value)) {
            for (const nested of value) {
                const code =
                    String(nested || "")
                        .trim()
                        .toUpperCase();

                if (/^[A-Z]{2}$/.test(code)) {
                    codes.push(code);
                }
            }
        }
        else {
            const code =
                String(value || "")
                    .trim()
                    .toUpperCase();

            if (/^[A-Z]{2}$/.test(code)) {
                codes.push(code);
            }
        }
    }

    /*
     * Some feed serializations represent country destinations as
     * object keys, e.g. { "US": {...}, "CA": {...} }.
     * Accept only explicit two-letter ISO-style keys.
     */
    if (!codes.length) {
        for (const key of Object.keys(item)) {
            const code =
                key
                    .trim()
                    .toUpperCase();

            if (/^[A-Z]{2}$/.test(code)) {
                codes.push(code);
            }
        }
    }

    return [
        ...new Set(codes)
    ];
}

function productFromEnhancedRecord(
    entry,
    feed,
    debug = null
) {
    let details =
        entry?.product_details ||
        entry ||
        null;

    if (
        typeof details === "string"
    ) {
        try {
            details =
                JSON.parse(
                    details
                );
        }
        catch {
            return null;
        }
    }

    if (
        !details ||
        typeof details !== "object"
    ) {
        return null;
    }

    if (debug) {
        debug.validJson++;
        noteFeedDebugShape(
            debug,
            entry,
            details
        );
    }

    const basic =
        details.product_basic ||
        details;

    const pricing =
        details.price_and_availability ||
        details;

    const categoryDetails =
        details.product_category ||
        details;

    const title =
        normalizeText(
            basic.title ||
            details.title
        );

    const deepLink =
        normalizeText(
            basic.aw_deep_link ||
            details.aw_deep_link
        );

    const image =
        normalizeText(
            basic.image_link ||
            details.image_link ||
            ""
        );

    const basePrice =
        parseEnhancedPrice(
            pricing.price ||
            details.price
        );

    const salePrice =
        parseEnhancedPrice(
            pricing.sale_price ||
            details.sale_price
        );

    const price =
        Number.isFinite(salePrice.amount) &&
        salePrice.amount > 0
            ? salePrice.amount
            : basePrice.amount;

    const currency =
        salePrice.currency ||
        basePrice.currency ||
        normalizeText(
            pricing.currency ||
            details.currency
        ) ||
        "USD";

    const oldPrice =
        Number.isFinite(basePrice.amount) &&
        Number.isFinite(price) &&
        basePrice.amount > price
            ? basePrice.amount
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
                categoryDetails.google_product_category,
                categoryDetails.google_product_category_id,
                categoryDetails.product_type
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

    /*
     * Awin's Enhanced Feed wraps Google-format delivery data under
     * product_details.delivery.shipping. Some records may expose
     * shipping directly, so accept both documented shapes.
     */
    const delivery =
        details.delivery &&
        typeof details.delivery === "object"
            ? details.delivery
            : entry?.delivery &&
                typeof entry.delivery === "object"
                ? entry.delivery
                : {};

    const shippingCandidates = [
        details.shipping,
        entry?.shipping,
        delivery.shipping
    ].filter(
        value =>
            value !== undefined &&
            value !== null
    );

    const shippingSource = [];

    for (const candidate of shippingCandidates) {
        let value = candidate;

        if (typeof value === "string") {
            try {
                value = JSON.parse(value);
            }
            catch {
                value = null;
            }
        }

        if (Array.isArray(value)) {
            shippingSource.push(
                ...value
            );
        }
        else if (
            value &&
            typeof value === "object"
        ) {
            shippingSource.push(
                value
            );
        }
    }

    const shippingCountries =
        [
            ...new Set(
                shippingSource
                    .flatMap(
                        item =>
                            countryCodesFromShippingItem(
                                item
                            )
                    )
            )
        ];

    if (!shippingCountries.length) {
        if (debug) {
            debug.missingShipping++;
        }

        return null;
    }

    if (debug) {
        debug.productsAccepted++;
    }

    const availability =
        normalizeText(
            pricing.availability ||
            details.availability
        );

    const productId =
        normalizeText(
            basic.id ||
            details.id
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
            normalizeText(
                basic.link ||
                details.link
            ),

        store:
            feed.advertiserName,

        partnerId:
            partner.partnerId,

        category,

        stockStatus:
            availability ||
            "unknown",

        popularityScore:
            0,

        productUpdatedAt:
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

        shippingCountries
    };

    product.popularityScore =
        calculateEnhancedPopularity(
            product
        );

    return product;
}

function parseEnhancedJSONL(
    text,
    feed,
    debug = null
) {
    const products = [];

    for (
        const rawLine of String(text || "").split("\n")
    ) {
        const line =
            rawLine.trim();

        if (!line) {
            continue;
        }

        let entry;

        try {
            entry =
                JSON.parse(line);
        }
        catch {
            continue;
        }

        if (
            entry &&
            typeof entry === "object" &&
            entry.error
        ) {
            if (debug) {
                debug.errorLines++;
            }

            continue;
        }

        const product =
            productFromEnhancedRecord(
                entry,
                feed,
                debug
            );

        if (product) {
            products.push(product);
        }
    }

    return products
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

async function fetchJSON(
    url,
    token,
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
                        "application/json",
                    "Authorization":
                        `Bearer ${token}`,
                    "User-Agent":
                        "Worth-It-Shop/1.0"
                }
            }
        );

    const body =
        await response.text();

    let data = null;

    try {
        data =
            body
                ? JSON.parse(body)
                : null;
    }
    catch {
        data = null;
    }

    if (!response.ok) {
        const error =
            new Error(
                normalizeText(
                    data?.message ||
                    data?.error ||
                    `Upstream HTTP ${response.status}`
                )
            );

        error.status =
            response.status;

        throw error;
    }

    return data;
}

async function fetchEnhancedFeed(
    feed,
    token,
    signal,
    debug = null
) {
    const url =
        `${AWIN_API_BASE_URL}/publishers/${AWIN_PUBLISHER_ID}/awinfeeds/download/${feed.advertiserId}-retail-${feed.locale}.jsonl`;

    const response =
        await fetch(
            url,
            {
                method: "GET",
                signal,
                headers: {
                    "Accept":
                        "application/json, application/jsonl, text/plain, */*",
                    "Authorization":
                        `Bearer ${token}`,
                    "User-Agent":
                        "Worth-It-Shop/1.0"
                }
            }
        );

    if (!response.ok) {
        const body =
            await response.text();

        let message =
            `Upstream HTTP ${response.status}`;

        try {
            const parsed =
                JSON.parse(body);

            message =
                normalizeText(
                    parsed?.message ||
                    parsed?.error ||
                    message
                );
        }
        catch {
            // Keep the status-based message.
        }

        const error =
            new Error(message);

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

    return parseEnhancedJSONL(
        text,
        feed,
        debug
    );
}

function scoreProgramMatch(
    program,
    partner
) {
    const name =
        normalizeKey(
            program?.name
        );

    if (!name) {
        return Number.NEGATIVE_INFINITY;
    }

    let score = 0;

    if (
        partner.prefer?.some(
            preferred =>
                name ===
                normalizeKey(
                    preferred
                )
        )
    ) {
        score += 1000;
    }

    if (
        name ===
        normalizeKey(
            partner.partnerId
        )
    ) {
        score += 500;
    }

    score -=
        name.length;

    return score;
}

function pickProgram(
    programs,
    partner
) {
    const candidates =
        programs.filter(
            program => {
                const name =
                    normalizeKey(
                        program?.name
                    );

                return partner.match.some(
                    token =>
                        name.includes(
                            normalizeKey(token)
                        )
                );
            }
        );

    return (
        candidates.sort(
            (
                first,
                second
            ) =>
                scoreProgramMatch(
                    second,
                    partner
                ) -
                scoreProgramMatch(
                    first,
                    partner
                )
        )[0] ||
        null
    );
}

function localeForProgram(
    program
) {
    const countryCode =
        String(
            program?.primaryRegion?.countryCode ||
            ""
        )
            .trim()
            .toUpperCase();

    return (
        REGION_TO_LOCALE[countryCode] ||
        "en_GB"
    );
}

function dedupeProducts(
    products
) {
    const map =
        new Map();

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

    const token =
        context.env?.[AWIN_API_TOKEN_ENV];

    if (!token) {
        return jsonResponse(
            {
                ok: false,
                configured: false,
                products: [],
                error:
                    "Awin API token is not configured."
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
            "https://worth-it-shop-feed-cache.local/api/shop-products?v=8"
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
        const programmesUrl =
            `${AWIN_API_BASE_URL}/publishers/${AWIN_PUBLISHER_ID}/programmes?relationship=joined`;

        const programmeData =
            await fetchJSON(
                programmesUrl,
                token,
                controller.signal
            );

        const programmes =
            Array.isArray(programmeData)
                ? programmeData
                : Array.isArray(
                    programmeData?.programmes
                )
                    ? programmeData.programmes
                    : [];

        const discoveredFeeds =
            PARTNER_MATCHES
                .map(
                    partner => {
                        const program =
                            pickProgram(
                                programmes,
                                partner
                            );

                        if (
                            !program ||
                            !program.id
                        ) {
                            return null;
                        }

                        return {
                            partnerId:
                                partner.partnerId,

                            category:
                                partner.category,

                            advertiserId:
                                String(
                                    program.id
                                ),

                            advertiserName:
                                normalizeText(
                                    program.name
                                ),

                            primaryRegion:
                                program.primaryRegion ||
                                null,

                            lastImported:
                                "",

                            currencyCode:
                                program.currencyCode ||
                                "",

                            locale:
                                localeForProgram(
                                    program
                                )
                        };
                    }
                )
                .filter(Boolean);

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
            const feedDebug =
                debugMode
                    ? createFeedDebug()
                    : null;

            const feedCacheKey =
                new Request(
                    `https://worth-it-shop-feed-cache.local/api/feed/${feed.advertiserId}/${feed.locale}/v8`
                );

            let feedProducts =
                null;

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
                        ) &&
                        payload.products.length
                    ) {
                        feedProducts =
                            payload.products;
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
                        products:
                            0
                    });

                    continue;
                }

                feedRequestsUsed++;

                try {
                    feedProducts =
                        await fetchEnhancedFeed(
                            feed,
                            token,
                            controller.signal,
                            feedDebug
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
                        products:
                            feedProducts.length,
                        ...(debugMode
                            ? {
                                debug:
                                    feedDebug
                            }
                            : {})
                    });
                }
                catch (error) {
                    console.warn(
                        "Awin Enhanced Feed failed for " +
                        feed.advertiserName +
                        ":",
                        error
                    );

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
                            error?.status === 404
                                ? "feed-not-found"
                                : "unavailable",
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
                        "cache-hit",
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
                    publisherId:
                        AWIN_PUBLISHER_ID,
                    feeds:
                        feedResults,
                    products:
                        finalProducts,
                    ...(debugMode
                        ? {
                            debug: {
                                note:
                                    "Debug mode bypasses Shop caches and fetches up to 5 feeds to inspect product shipping data."
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
