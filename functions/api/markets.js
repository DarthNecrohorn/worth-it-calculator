/* =========================================================
   WORTH IT — MARKETS API
   Voltlas Open Data

   Primary data source:
     Voltlas Open Data
     https://voltlas.com/data/latest.json

   Voltlas publishes the same commodity data used by its site
   as plain JSON.

   No API key required.
   No sign-up required.
   No rate limit stated by Voltlas.

   License:
     Creative Commons Attribution 4.0 (CC BY 4.0)

   Required attribution:
     Data: Voltlas (https://voltlas.com), CC BY 4.0

   Current commodity endpoint:
     /api/markets

   Lazy Wikimedia image endpoint:
     /api/markets?action=image&name=Gold&category=precious-metals

   The commodity dataset is intentionally capped at 300 items
   for the Worth It Markets response. The source itself remains
   dynamic and every usable Voltlas COMMODITIES[] entry is read
   before the final output limit is applied.

   Voltlas commodity fields:
     name
     cat
     price
     unit
     chg
     source
     period
========================================================= */


/* =========================================================
   VOLTLAS
========================================================= */

const VOLTLAS_DATA_URL =
    "https://voltlas.com/data/latest.json";


const VOLTLAS_DATA_PAGE =
    "https://voltlas.com/data";


const VOLTLAS_LICENSE_URL =
    "https://creativecommons.org/licenses/by/4.0/";


/*
 * Maximum number of commodity series returned by Worth It.
 *
 * This is intentionally set to 300 so the Markets frontend can
 * display a much larger dataset when the Voltlas source provides
 * that many usable commodity series.
 */
const MAX_COMMODITIES =
    300;


/* =========================================================
   CACHE SETTINGS
========================================================= */

const CACHE_TTL =
    24 * 60 * 60;

const IMAGE_CACHE_TTL =
    7 * 24 * 60 * 60;

const IMAGE_NEGATIVE_CACHE_TTL =
    24 * 60 * 60;


const CACHE_TIMESTAMP_HEADER =
    "X-Worth-It-Cache-Time";


/*
 * New cache keys intentionally replace the old World Bank cache.
 */
const VOLTLAS_SOURCE_CACHE_KEY =
    "https://worth-it-internal-cache.local/voltlas-commodities-latest-v1.json";


const VOLTLAS_RESULT_CACHE_KEY =
    "https://worth-it-internal-cache.local/voltlas-markets-v1.json";


/* =========================================================
   WIKIMEDIA
========================================================= */

const WIKIMEDIA_API =
    "https://commons.wikimedia.org/w/api.php";


/*
 * Bumped for the current Markets image filtering logic.
 *
 * This invalidates older negative image-cache results generated
 * under previous market-data configurations.
 */
const WIKIMEDIA_IMAGE_CACHE_PREFIX =
    "https://worth-it-internal-cache.local/markets-wikimedia-image-v11/";


const MAX_IMAGE_SEARCH_CANDIDATES =
    100;


const IMAGE_SEARCH_PAGE_SIZE =
    20;


/*
 * Minimum practical image quality for the market cards.
 * Tiny icons/scans and extremely narrow banners are rejected.
 */
const MIN_IMAGE_WIDTH =
    500;


const MIN_IMAGE_HEIGHT =
    250;


const MIN_IMAGE_PIXELS =
    150000;


/*
 * Wikimedia requires an identifying User-Agent for API requests.
 */
const WIKIMEDIA_USER_AGENT =
    "Worth-It-Markets/1.0 (https://github.com/DarthNecrohorn/worth-it-calculator)";


/* =========================================================
   RESPONSE HELPERS
========================================================= */

function jsonResponse(
    data,
    status = 200,
    cacheSeconds = CACHE_TTL
) {

    const headers =
        new Headers({
            "Content-Type":
                "application/json; charset=UTF-8"
        });


    if (
        cacheSeconds > 0
    ) {

        headers.set(
            "Cache-Control",
            `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`
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


function responseWithCacheTimestamp(
    response,
    cacheSeconds
) {

    const headers =
        new Headers(
            response.headers
        );


    headers.set(
        CACHE_TIMESTAMP_HEADER,
        String(Date.now())
    );


    if (
        cacheSeconds > 0
    ) {

        headers.set(
            "Cache-Control",
            `public, max-age=${cacheSeconds}`
        );

    }


    return new Response(
        response.body,
        {
            status:
                response.status,
            headers
        }
    );
}


function getRequestCacheAgeSeconds(
    response
) {

    const cachedAt =
        Number(
            response.headers.get(
                CACHE_TIMESTAMP_HEADER
            )
        );


    if (
        !Number.isFinite(cachedAt) ||
        cachedAt <= 0
    ) {

        return Infinity;

    }


    return (
        Date.now() -
        cachedAt
    ) / 1000;
}


async function getFreshCache(
    cache,
    key,
    maxAgeSeconds
) {

    const cached =
        await cache.match(
            key
        );


    if (!cached) {

        return null;

    }


    const age =
        getRequestCacheAgeSeconds(
            cached
        );


    if (
        !Number.isFinite(age) ||
        age < 0 ||
        age > maxAgeSeconds
    ) {

        return null;

    }


    return cached;
}


async function putTimestampedCache(
    cache,
    key,
    response,
    maxAgeSeconds
) {

    const cachedResponse =
        responseWithCacheTimestamp(
            response,
            maxAgeSeconds
        );


    await cache.put(
        key,
        cachedResponse.clone()
    );


    return cachedResponse;
}


/* =========================================================
   TEXT / NUMBER HELPERS
========================================================= */

function normalizeText(
    value
) {

    return String(value || "")
        .replace(
            /\u00A0/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


function normalizeSearchText(
    value
) {

    return normalizeText(
        value
    )
        .toLowerCase()
        .normalize(
            "NFKD"
        )
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /[^a-z0-9]+/g,
            " "
        )
        .trim();
}


function simplifySearchText(
    value
) {

    return normalizeSearchText(
        value
    )
        .replace(
            /\s+/g,
            ""
        );
}


function normalizeUnit(
    value
) {

    return normalizeText(
        value
    )
        .toLowerCase()
        .replace(
            /\s+/g,
            ""
        );
}


function parseNumber(
    value
) {

    if (
        typeof value ===
        "number"
    ) {

        return Number.isFinite(
            value
        )
            ? value
            : null;

    }


    const normalized =
        String(
            value ?? ""
        )
            .replace(
                /,/g,
                ""
            )
            .replace(
                /[$€£]/g,
                ""
            )
            .trim();


    if (
        !normalized ||
        normalized ===
            ".." ||
        normalized ===
            "…" ||
        normalized ===
            "..." ||
        normalized ===
            "—" ||
        normalized ===
            "-"
    ) {

        return null;

    }


    const number =
        Number(
            normalized
        );


    return Number.isFinite(
        number
    )
        ? number
        : null;
}


function parsePercent(
    value
) {

    if (
        typeof value ===
        "number"
    ) {

        return Number.isFinite(
            value
        )
            ? value
            : null;

    }


    const normalized =
        String(
            value ?? ""
        )
            .replace(
                /,/g,
                ""
            )
            .replace(
                /%/g,
                ""
            )
            .trim();


    if (!normalized) {

        return null;

    }


    const number =
        Number(
            normalized
        );


    return Number.isFinite(
        number
    )
        ? number
        : null;
}


/* =========================================================
   PERIOD HELPERS
========================================================= */

function normalizeCommodityPeriod(
    value
) {

    const text =
        normalizeText(
            value
        );


    if (!text) {

        return null;

    }


    let match =
        text.match(
            /^(\d{4})M(\d{1,2})$/i
        );


    if (
        match
    ) {

        const year =
            Number(
                match[1]
            );


        const month =
            Number(
                match[2]
            );


        if (
            year >= 1900 &&
            month >= 1 &&
            month <= 12
        ) {

            return {
                period:
                    `${year}M${String(month).padStart(2, "0")}`,

                year,

                month,

                timestamp:
                    Date.UTC(
                        year,
                        month - 1,
                        1
                    )
            };

        }

    }


    match =
        text.match(
            /^(\d{4})-(\d{1,2})$/
        );


    if (
        match
    ) {

        const year =
            Number(
                match[1]
            );


        const month =
            Number(
                match[2]
            );


        if (
            year >= 1900 &&
            month >= 1 &&
            month <= 12
        ) {

            return {
                period:
                    `${year}M${String(month).padStart(2, "0")}`,

                year,

                month,

                timestamp:
                    Date.UTC(
                        year,
                        month - 1,
                        1
                    )
            };

        }

    }


    match =
        text.match(
            /^(\d{4})\/(\d{1,2})$/
        );


    if (
        match
    ) {

        const year =
            Number(
                match[1]
            );


        const month =
            Number(
                match[2]
            );


        if (
            year >= 1900 &&
            month >= 1 &&
            month <= 12
        ) {

            return {
                period:
                    `${year}M${String(month).padStart(2, "0")}`,

                year,

                month,

                timestamp:
                    Date.UTC(
                        year,
                        month - 1,
                        1
                    )
            };

        }

    }


    return null;
}


/* =========================================================
   CATEGORIES
========================================================= */

function categorizeCommodity(
    name
) {

    const value =
        normalizeSearchText(
            name
        );


    if (
        /\b(gold|silver|platinum|palladium|rhodium|iridium|osmium)\b/
            .test(
                value
            )
    ) {

        return "precious-metals";

    }


    if (
        /\b(aluminum|aluminium|copper|lead|nickel|tin|zinc|cobalt|lithium|molybdenum|iron ore|steel|ore|uranium|chromium|manganese)\b/
            .test(
                value
            )
    ) {

        return "metals-minerals";

    }


    if (
        /\b(crude oil|brent|wti|dubai|natural gas|liquefied natural gas|lng|coal|energy|gasoline|petrol|diesel|heating oil|jet fuel|kerosene)\b/
            .test(
                value
            )
    ) {

        return "energy";

    }


    if (
        /\b(urea|dap|tsp|potash|phosphate|fertilizer|fertiliser|ammonia)\b/
            .test(
                value
            )
    ) {

        return "fertilizers";

    }


    if (
        /\b(cocoa|coffee|tea|coconut|groundnut|palm|soybean|soy|maize|corn|rice|wheat|barley|sorghum|sugar|banana|orange|grains|food|meat|beef|lamb|poultry|shrimp|fish|milk|dairy)\b/
            .test(
                value
            )
    ) {

        return "agriculture-food";

    }


    if (
        /\b(cotton|rubber|timber|log|logs|sawnwood|plywood|wood|hides|leather)\b/
            .test(
                value
            )
    ) {

        return "raw-materials";

    }


    return "other";
}


/*
 * Voltlas itself supplies these compact category identifiers:
 *
 *   energy
 *   base
 *   precious
 *   ag
 *
 * Worth It keeps its existing richer category system.
 */
function mapVoltlasCategory(
    item
) {

    const sourceCategory =
        normalizeSearchText(
            item?.cat
        );


    const name =
        normalizeText(
            item?.name
        );


    const nameCategory =
        categorizeCommodity(
            name
        );


    /*
     * Name-based classification wins when it provides a more
     * specific Worth It category such as fertilizers or raw
     * materials.
     */
    if (
        nameCategory !==
        "other"
    ) {

        return nameCategory;

    }


    if (
        sourceCategory ===
            "energy"
    ) {

        return "energy";

    }


    if (
        sourceCategory ===
            "base"
    ) {

        return "metals-minerals";

    }


    if (
        sourceCategory ===
            "precious"
    ) {

        return "precious-metals";

    }


    if (
        sourceCategory ===
            "ag"
    ) {

        return "agriculture-food";

    }


    return "other";
}


const CATEGORY_INFO = {

    all: {
        label:
            "All"
    },

    "precious-metals": {
        label:
            "Precious Metals"
    },

    "metals-minerals": {
        label:
            "Metals & Minerals"
    },

    energy: {
        label:
            "Energy"
    },

    fertilizers: {
        label:
            "Fertilizers"
    },

    "agriculture-food": {
        label:
            "Agriculture & Food"
    },

    "raw-materials": {
        label:
            "Raw Materials"
    },

    other: {
        label:
            "Other"
    }

};


function categoryLabel(
    category
) {

    return (
        CATEGORY_INFO[
            category
        ] ||
        CATEGORY_INFO.other
    ).label;
}


/* =========================================================
   DISPLAY UNITS
========================================================= */

function getDisplaySpec(
    sourceUnit,
    category
) {

    const unit =
        normalizeUnit(
            sourceUnit
        );


    /*
     * $/troy oz
     *
     * Source:
     *   USD per troy ounce
     *
     * EUR:
     *   EUR per gram
     *
     * USD:
     *   USD per troy ounce
     */
    if (
        unit.includes(
            "$/troyoz"
        ) ||
        unit.includes(
            "$/toz"
        )
    ) {

        return {

            eurUnit:
                "g",

            usUnit:
                "troy oz",

            conversion:
                1 / 31.1034768

        };

    }


    /*
     * $/bbl
     */
    if (
        unit.includes(
            "$/bbl"
        )
    ) {

        return {

            eurUnit:
                "liter",

            usUnit:
                "barrel",

            conversion:
                1 / 158.9872949

        };

    }


    /*
     * $/mmbtu
     */
    if (
        unit.includes(
            "$/mmbtu"
        )
    ) {

        return {

            eurUnit:
                "MWh",

            usUnit:
                "MMBtu",

            conversion:
                3.412141633

        };

    }


    /*
     * $/mt
     *
     * Keep the existing Worth It presentation style:
     * EUR uses metric ton and USD uses short ton.
     *
     * The frontend uses the backend-provided display unit and
     * therefore does not apply its extra kg/lb conversion here.
     */
    if (
        unit.includes(
            "$/mt"
        ) ||
        unit.includes(
            "$/metricton"
        )
    ) {

        return {

            eurUnit:
                "metric ton",

            usUnit:
                "short ton",

            conversion:
                1

        };

    }


    /*
     * $/dmt
     */
    if (
        unit.includes(
            "$/dmt"
        )
    ) {

        return {

            eurUnit:
                "metric ton",

            usUnit:
                "short ton",

            conversion:
                1

        };

    }


    /*
     * $/kg
     *
     * EUR: kg
     * USD: lb
     */
    if (
        unit.includes(
            "$/kg"
        )
    ) {

        return {

            eurUnit:
                "kg",

            usUnit:
                "lb",

            conversion:
                1

        };

    }


    /*
     * $/lb
     */
    if (
        unit.includes(
            "$/lb"
        )
    ) {

        return {

            eurUnit:
                "kg",

            usUnit:
                "lb",

            conversion:
                2.20462262185

        };

    }


    /*
     * $/liter
     */
    if (
        unit.includes(
            "$/liter"
        ) ||
        unit.includes(
            "$/l"
        )
    ) {

        return {

            eurUnit:
                "liter",

            usUnit:
                "liter",

            conversion:
                1

        };

    }


    /*
     * $/g
     */
    if (
        unit.includes(
            "$/g"
        )
    ) {

        return {

            eurUnit:
                "g",

            usUnit:
                "g",

            conversion:
                1

        };

    }


    const fallbackUnit =
        sourceUnit

            ? String(
                sourceUnit
            )
                .replace(
                    /^\(\$\/|\)$/g,
                    ""
                )
                .replace(
                    /^\$\/?/,
                    ""
                )
                .trim()

            : "unit";


    return {

        eurUnit:
            fallbackUnit,

        usUnit:
            fallbackUnit,

        conversion:
            1

    };
}


/* =========================================================
   PRIORITY ORDER
========================================================= */

const PRIORITY_NAME_ORDER = [

    "gold",

    "silver",

    "platinum",

    "palladium",

    "copper",

    "iron ore",

    "aluminum",

    "aluminium",

    "brent crude oil",

    "crude oil, brent",

    "wti crude oil",

    "crude oil, wti",

    "natural gas",

    "natural gas, u.s.",

    "coal",

    "nickel"

];


function getPriorityIndex(
    name
) {

    const normalized =
        normalizeSearchText(
            name
        );


    const index =
        PRIORITY_NAME_ORDER.findIndex(
            value => {

                const normalizedValue =
                    normalizeSearchText(
                        value
                    );


                return (
                    normalized ===
                        normalizedValue ||

                    normalized.startsWith(
                        `${normalizedValue} `
                    ) ||

                    normalized.startsWith(
                        `${normalizedValue},`
                    )
                );

            }
        );


    return index >= 0
        ? index
        : 999;
}


function sortCommodities(
    a,
    b
) {

    const priorityDifference =
        getPriorityIndex(
            a.name
        ) -
        getPriorityIndex(
            b.name
        );


    if (
        priorityDifference !==
        0
    ) {

        return priorityDifference;

    }


    const categoryDifference =
        categoryLabel(
            a.category
        ).localeCompare(
            categoryLabel(
                b.category
            ),
            undefined,
            {
                sensitivity:
                    "base"
            }
        );


    if (
        categoryDifference !==
        0
    ) {

        return categoryDifference;

    }


    return String(
        a.name || ""
    ).localeCompare(
        String(
            b.name || ""
        ),
        undefined,
        {
            sensitivity:
                "base"
        }
    );
}


/* =========================================================
   VOLTLAS LOADING
========================================================= */

async function fetchVoltlasSource(
    cache
) {

    const key =
        new Request(
            VOLTLAS_SOURCE_CACHE_KEY
        );


    const cached =
        await getFreshCache(
            cache,
            key,
            CACHE_TTL
        );


    if (
        cached
    ) {

        return cached;

    }


    const response =
        await fetch(
            VOLTLAS_DATA_URL,
            {
                headers: {

                    "Accept":
                        "application/json",

                    "User-Agent":
                        "Worth-It-Markets/1.0 (https://github.com/DarthNecrohorn/worth-it-calculator)"

                }
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `Voltlas latest.json request failed with status ${response.status}.`
        );

    }


    const contentType =
        String(
            response.headers.get(
                "Content-Type"
            ) ||
            ""
        );


    /*
     * Do not fail solely because the upstream server does not
     * provide application/json. The body itself is authoritative.
     */
    void contentType;


    return putTimestampedCache(
        cache,
        key,
        new Response(
            await response.arrayBuffer(),
            {
                status:
                    response.status,

                headers:
                    response.headers
            }
        ),
        CACHE_TTL
    );
}


function normalizeVoltlasCommodity(
    item
) {

    if (
        !item ||
        typeof item !==
            "object"
    ) {

        return null;

    }


    const name =
        normalizeText(
            item.name
        );


    if (
        !name
    ) {

        return null;

    }


    const price =
        parseNumber(
            item.price
        );


    if (
        price === null
    ) {

        return null;

    }


    const sourceUnit =
        normalizeText(
            item.unit
        );


    if (
        !sourceUnit
    ) {

        return null;

    }


    const periodInfo =
        normalizeCommodityPeriod(
            item.period
        );


    const category =
        mapVoltlasCategory(
            item
        );


    const displaySpec =
        getDisplaySpec(
            sourceUnit,
            category
        );


    const change =
        parsePercent(
            item.chg
        );


    const code =
        (
            simplifySearchText(
                name
            )
                .slice(
                    0,
                    80
                ) ||
            `commodity_${Math.random()}`
        )
            .toUpperCase();


    return {

        code,

        name,

        category,

        category_label:
            categoryLabel(
                category
            ),

        source_unit:
            sourceUnit,

        price,

        previous_price:
            null,

        changes: {

            monthly: {

                percent:
                    change

            }

        },

        updated_at:
            periodInfo
                ? new Date(
                    periodInfo.timestamp
                ).toISOString()
                : null,

        data_period:
            periodInfo
                ? periodInfo.period
                : normalizeText(
                    item.period
                ) || null,

        previous_period:
            null,

        display:
            displaySpec,

        source:
            normalizeText(
                item.source
            ) ||
            "Voltlas",

        voltlas_category:
            normalizeText(
                item.cat
            ) ||
            null

    };
}


async function parseVoltlasDataset(
    payload
) {

    const sourceItems =
        Array.isArray(
            payload?.COMMODITIES
        )
            ? payload.COMMODITIES
            : [];


    if (
        !sourceItems.length
    ) {

        throw new Error(
            "Voltlas latest.json contains no COMMODITIES array."
        );

    }


    const seenNames =
        new Set();


    const commodities =
        [];


    for (
        const item of sourceItems
    ) {

        const normalized =
            normalizeVoltlasCommodity(
                item
            );


        if (
            !normalized
        ) {

            continue;

        }


        const nameKey =
            normalizeSearchText(
                normalized.name
            );


        if (
            !nameKey ||
            seenNames.has(
                nameKey
            )
        ) {

            continue;

        }


        seenNames.add(
            nameKey
        );


        commodities.push(
            normalized
        );

    }


    if (
        !commodities.length
    ) {

        throw new Error(
            "Voltlas latest.json contained no usable commodity series."
        );

    }


    commodities.sort(
        sortCommodities
    );


    /*
     * Read the full usable source first, then apply the Worth It
     * output limit.
     */
    const sourceCommodityCount =
        commodities.length;


    const limitedCommodities =
        commodities.slice(
            0,
            MAX_COMMODITIES
        );


    const periodCandidates =
        limitedCommodities
            .map(
                item =>
                    normalizeCommodityPeriod(
                        item.data_period
                    )
            )
            .filter(Boolean);


    let latestPeriod =
        null;


    if (
        periodCandidates.length
    ) {

        periodCandidates.sort(
            (a, b) =>
                a.timestamp -
                b.timestamp
        );


        latestPeriod =
            periodCandidates[
                periodCandidates.length - 1
            ].period;

    }


    return {

        prices:
            limitedCommodities,

        latest_period:
            latestPeriod,

        commodity_count:
            limitedCommodities.length,

        source_commodity_count:
            sourceCommodityCount,

        categories:
            [
                ...new Set(
                    limitedCommodities.map(
                        item =>
                            item.category
                    )
                )
            ],

        source:
            "Voltlas Open Data",

        source_url:
            VOLTLAS_DATA_PAGE,

        data_url:
            VOLTLAS_DATA_URL,

        license:
            "CC BY 4.0",

        license_url:
            VOLTLAS_LICENSE_URL,

        attribution:
            "Data: Voltlas (https://voltlas.com), CC BY 4.0"

    };
}


/* =========================================================
   VOLTLAS RESULT LOADER
========================================================= */

async function loadVoltlasDataset(
    cache
) {

    const response =
        await fetchVoltlasSource(
            cache
        );


    const payload =
        await response.json();


    return parseVoltlasDataset(
        payload
    );
}


/* =========================================================
   WIKIMEDIA IMAGE HELPERS
========================================================= */

function getImageCacheKey(
    name
) {

    const safeName =
        simplifySearchText(
            name
        )
            .slice(
                0,
                120
            );


    return new Request(
        `${WIKIMEDIA_IMAGE_CACHE_PREFIX}${encodeURIComponent(safeName)}`
    );
}


function getMetadataValue(
    extmetadata,
    key
) {

    const value =
        extmetadata?.[key]?.value;


    return normalizeText(
        String(
            value || ""
        )
            .replace(
                /<[^>]*>/g,
                " "
            )
    );
}


function buildCommoditySearchTokens(
    name
) {

    const stopWords =
        new Set([

            "the",

            "of",

            "and",

            "average",

            "avg",

            "index",

            "price",

            "prices",

            "us",

            "u",

            "s",

            "crude",

            "oil"

        ]);


    const tokens =
        normalizeSearchText(
            name
        )
            .split(" ")
            .filter(
                token =>
                    token.length >= 3 &&
                    !stopWords.has(
                        token
                    )
            );


    if (
        tokens.includes(
            "aluminum"
        )
    ) {

        tokens.push(
            "aluminium"
        );

    }


    if (
        tokens.includes(
            "aluminium"
        )
    ) {

        tokens.push(
            "aluminum"
        );

    }


    return [
        ...new Set(
            tokens
        )
    ];
}


function getCommodityBaseName(
    commodityName
) {

    return normalizeText(
        String(
            commodityName ||
                ""
        )
            .split(",")[0]
    );
}


function getCommodityCoreTokens(
    commodityName
) {

    const stopWords =
        new Set([

            "the",

            "of",

            "and",

            "average",

            "avg",

            "index",

            "price",

            "prices",

            "us",

            "u",

            "s",

            "uk",

            "eu",

            "europe",

            "crude",

            "oil"

        ]);


    const tokens =
        normalizeSearchText(
            getCommodityBaseName(
                commodityName
            )
        )
            .split(" ")
            .filter(
                token =>
                    token.length >= 3 &&
                    !stopWords.has(
                        token
                    )
            );


    return [
        ...new Set(
            tokens
        )
    ];
}


function hasCompoundCommodityMatch(
    text,
    commodityName
) {

    const coreTokens =
        getCommodityCoreTokens(
            commodityName
        );


    if (
        !coreTokens.length
    ) {

        return false;

    }


    const normalizedWords =
        normalizeSearchText(
            text
        )
            .split(" ")
            .filter(Boolean);


    return coreTokens.every(
        token => {

            if (
                token ===
                    "aluminum" ||
                token ===
                    "aluminium"
            ) {

                return (
                    normalizedWords.includes(
                        "aluminum"
                    ) ||
                    normalizedWords.includes(
                        "aluminium"
                    )
                );

            }


            return normalizedWords.includes(
                token
            );

        }
    );
}


function hasPersonOrBiographicalContext(
    text
) {

    const normalizedText =
        normalizeSearchText(
            text
        );


    return /\b(portrait|headshot|biography|biographical|person|people|man|woman|boy|girl|actor|actress|singer|musician|politician|professor|historian|journalist|photographer|author|writer|born|died)\b/
        .test(
            normalizedText
        );
}


function hasContextConflict(
    searchableText,
    commodityName
) {

    const text =
        normalizeSearchText(
            searchableText
        );


    const baseName =
        normalizeSearchText(
            getCommodityBaseName(
                commodityName
            )
        );


    const conflictRules = [

        {
            commodity:
                /\bcoffee\b/,
            conflict:
                /\b(coffee machine|coffee maker|espresso machine|coffee grinder)\b/
        },

        {
            commodity:
                /\btea\b/,
            conflict:
                /\b(teacup|tea cup|tea set|tea service)\b/
        },

        {
            commodity:
                /\bpalm oil\b/,
            conflict:
                /\bpalm tree(s)?\b/
        },

        {
            commodity:
                /\bcotton\b/,
            conflict:
                /\b(cotton swab|cotton bud|t shirt|tshirt|shirt|clothing|garment)\b/
        },

        {
            commodity:
                /\bcocoa\b/,
            conflict:
                /\b(chocolate bar|candy bar|wrapper|confectionery)\b/
        }

    ];


    return conflictRules.some(
        rule =>
            rule.commodity.test(
                baseName
            ) &&
            rule.conflict.test(
                text
            )
    );
}


function hasRelevantUrlToken(
    url,
    tokens
) {

    let normalizedUrl =
        "";


    try {

        normalizedUrl =
            simplifySearchText(
                decodeURIComponent(
                    String(
                        url || ""
                    )
                )
            );

    }
    catch {

        normalizedUrl =
            simplifySearchText(
                String(
                    url || ""
                )
            );

    }


    return tokens.some(
        token => {

            const simplifiedToken =
                simplifySearchText(
                    token
                );


            return (
                simplifiedToken.length >= 3 &&
                normalizedUrl.includes(
                    simplifiedToken
                )
            );

        }
    );
}


function hasRelevantTextMatch(
    text,
    tokens
) {

    const normalizedText =
        normalizeSearchText(
            text
        );


    return tokens.some(
        token => {

            const normalizedToken =
                normalizeSearchText(
                    token
                );


            if (
                !normalizedToken
            ) {

                return false;

            }


            return (
                normalizedText
                    .split(" ")
                    .some(
                        word =>
                            word ===
                            normalizedToken
                    ) ||

                normalizedText.includes(
                    normalizedToken
                )
            );

        }
    );
}


function isDisallowedImageDescription(
    value
) {

    const text =
        normalizeSearchText(
            value
        );


    return /\b(logo|icon|map|diagram|chart|graph|flag|coat of arms|symbol|screenshot|poster|book cover)\b/
        .test(
            text
        );
}


/* =========================================================
   LICENSE DETECTION
========================================================= */

function getLicenseKind(
    extmetadata
) {

    const license =
        normalizeSearchText(

            getMetadataValue(
                extmetadata,
                "LicenseShortName"
            ) ||

            getMetadataValue(
                extmetadata,
                "UsageTerms"
            ) ||

            getMetadataValue(
                extmetadata,
                "License"
            )

        );


    if (
        !license
    ) {

        return null;

    }


    if (
        /\bcc by nc\b/.test(
            license
        ) ||

        /\bcreative commons attribution noncommercial\b/
            .test(
                license
            ) ||

        /\bnoncommercial\b/.test(
            license
        ) ||

        /\bnon commercial\b/.test(
            license
        ) ||

        /\bcc by nd\b/.test(
            license
        ) ||

        /\bcreative commons attribution noderivatives\b/
            .test(
                license
            ) ||

        /\bno derivatives\b/.test(
            license
        )
    ) {

        return null;

    }


    if (
        /\bcc0\b/.test(
            license
        ) ||

        /\bpublic domain\b/.test(
            license
        ) ||

        /\bpd\b/.test(
            license
        )
    ) {

        return "Public Domain / CC0";

    }


    if (
        /\bcc by sa\b/.test(
            license
        ) ||

        /\bcreative commons attribution sharealike\b/
            .test(
                license
            ) ||

        /\bcreative commons attribution share alike\b/
            .test(
                license
            )
    ) {

        return "CC BY-SA";

    }


    if (
        /\bcc by\b/.test(
            license
        ) ||

        /\bcreative commons attribution\b/.test(
            license
        )
    ) {

        return "CC BY";

    }


    return null;
}


function hasCommodityFilenameMatch(
    url,
    commodityName
) {

    const fileName =
        (() => {

            try {

                const parsed =
                    new URL(
                        String(
                            url ||
                                ""
                        )
                    );


                const parts =
                    parsed.pathname
                        .split("/")
                        .filter(Boolean);


                return parts.length
                    ? decodeURIComponent(
                        parts[
                            parts.length - 1
                        ]
                    )
                    : "";

            }
            catch {

                return String(
                    url ||
                        ""
                )
                    .split("?")[0]
                    .split("#")[0]
                    .split("/")
                    .filter(Boolean)
                    .pop() ||
                    "";

            }

        })();


    const fileStem =
        normalizeSearchText(
            fileName
                .replace(
                    /\.[a-z0-9]{2,5}$/i,
                    ""
                )
        );


    const coreTokens =
        getCommodityCoreTokens(
            commodityName
        );


    if (
        !fileStem ||
        !coreTokens.length
    ) {

        return false;

    }


    return coreTokens.every(
        token => {

            if (
                token ===
                    "aluminum" ||
                token ===
                    "aluminium"
            ) {

                return (
                    fileStem.includes(
                        "aluminum"
                    ) ||
                    fileStem.includes(
                        "aluminium"
                    )
                );

            }


            return fileStem.includes(
                simplifySearchText(
                    token
                )
            );

        }
    );
}


/* =========================================================
   IMAGE CANDIDATE VALIDATION
========================================================= */

function buildKnownLicenseUrl(
    licenseKind,
    normalizedLicense
) {

    const versionMatch =
        String(
            normalizedLicense || ""
        )
            .match(
                /(?:cc by(?: sa)?|creative commons attribution(?: sharealike)?)[ ]+(\d+)[ ]+(\d+)/i
            );


    if (
        versionMatch
    ) {

        const version =
            `${versionMatch[1]}.${versionMatch[2]}`;


        if (
            licenseKind ===
            "CC BY-SA"
        ) {

            return `https://creativecommons.org/licenses/by-sa/${version}/`;

        }


        if (
            licenseKind ===
            "CC BY"
        ) {

            return `https://creativecommons.org/licenses/by/${version}/`;

        }

    }


    if (
        licenseKind ===
            "Public Domain / CC0" &&
        /\bcc0\b/.test(
            normalizedLicense
        )
    ) {

        return "https://creativecommons.org/publicdomain/zero/1.0/";

    }


    return null;
}


function candidateIsUsable(
    candidate,
    commodityName,
    category
) {

    const title =
        normalizeText(
            candidate?.title
        );


    const imageInfo =
        candidate?.imageinfo?.[0];


    const url =
        String(
            imageInfo?.url ||
                ""
        );


    const descriptionUrl =
        String(
            imageInfo?.descriptionurl ||
                ""
        );


    const extmetadata =
        imageInfo?.extmetadata ||
        {};


    if (
        !url ||
        !/^https?:\/\//i.test(
            url
        )
    ) {

        return null;

    }


    const mime =
        String(
            imageInfo?.mime ||
                ""
        ).toLowerCase();


    if (
        !mime.startsWith(
            "image/"
        ) ||
        mime.includes(
            "svg"
        )
    ) {

        return null;

    }


    const width =
        Number(
            imageInfo?.width
        ) ||
        0;


    const height =
        Number(
            imageInfo?.height
        ) ||
        0;


    const pixelCount =
        width *
        height;


    if (
        width <
            MIN_IMAGE_WIDTH ||
        height <
            MIN_IMAGE_HEIGHT ||
        pixelCount <
            MIN_IMAGE_PIXELS
    ) {

        return null;

    }


    const aspectRatio =
        height > 0
            ? width / height
            : 0;


    if (
        aspectRatio >
            4.5 ||
        aspectRatio <
            (1 / 4.5)
    ) {

        return null;

    }


    const tokens =
        buildCommoditySearchTokens(
            commodityName
        );


    if (
        !tokens.length
    ) {

        return null;

    }


    const searchableText =
        [

            title,

            getMetadataValue(
                extmetadata,
                "ImageDescription"
            ),

            getMetadataValue(
                extmetadata,
                "ObjectName"
            ),

            getMetadataValue(
                extmetadata,
                "Categories"
            )

        ]
            .filter(Boolean)
            .join(" ");


    if (
        !hasRelevantTextMatch(
            searchableText,
            tokens
        )
    ) {

        return null;

    }


    if (
        !hasCompoundCommodityMatch(
            searchableText,
            commodityName
        )
    ) {

        return null;

    }


    if (
        hasContextConflict(
            `${title} ${searchableText}`,
            commodityName
        )
    ) {

        return null;

    }


    if (
        hasPersonOrBiographicalContext(
            `${title} ${searchableText}`
        )
    ) {

        return null;

    }


    if (
        isDisallowedImageDescription(
            `${title} ${searchableText}`
        )
    ) {

        return null;

    }


    const licenseKind =
        getLicenseKind(
            extmetadata
        );


    if (
        !licenseKind
    ) {

        return null;

    }


    const rawLicense =
        normalizeSearchText(

            getMetadataValue(
                extmetadata,
                "LicenseShortName"
            ) ||

            getMetadataValue(
                extmetadata,
                "UsageTerms"
            ) ||

            getMetadataValue(
                extmetadata,
                "License"
            )

        );


    const explicitLicenseUrl =
        normalizeText(
            getMetadataValue(
                extmetadata,
                "LicenseUrl"
            )
        );


    const licenseUrl =
        explicitLicenseUrl ||

        buildKnownLicenseUrl(
            licenseKind,
            rawLicense
        );


    const author =
        normalizeText(

            getMetadataValue(
                extmetadata,
                "Artist"
            ) ||

            getMetadataValue(
                extmetadata,
                "Credit"
            )

        );


    if (
        licenseKind !==
            "Public Domain / CC0" &&
        (
            !author ||
            !licenseUrl
        )
    ) {

        return null;

    }


    const sourceUrl =
        descriptionUrl ||

        `https://commons.wikimedia.org/wiki/${
            encodeURIComponent(
                title
                    .replace(
                        /^File:/i,
                        ""
                    )
                    .replace(
                        / /g,
                        "_"
                    )
            )
        }`;


    let score =
        0;


    if (
        hasRelevantUrlToken(
            url,
            tokens
        )
    ) {

        score +=
            100;

    }


    if (
        hasCommodityFilenameMatch(
            url,
            commodityName
        )
    ) {

        score +=
            30;

    }


    if (
        normalizeSearchText(
            title
        ).includes(
            normalizeSearchText(
                commodityName
            )
        )
    ) {

        score +=
            35;

    }


    if (
        normalizeSearchText(
            getMetadataValue(
                extmetadata,
                "ImageDescription"
            )
        ).includes(
            normalizeSearchText(
                commodityName
            )
        )
    ) {

        score +=
            25;

    }


    if (
        category ===
            "precious-metals" &&
        /gold|silver|platinum|palladium/i
            .test(
                searchableText
            )
    ) {

        score +=
            20;

    }


    if (
        category ===
            "metals-minerals" &&
        /ore|mineral|metal|aluminum|aluminium|copper|nickel|iron|zinc|lead|tin|cobalt|lithium/i
            .test(
                searchableText
            )
    ) {

        score +=
            15;

    }


    return {

        score,

        url,

        thumbnailUrl:
            imageInfo?.thumburl ||
            url,

        width:
            width ||
            null,

        height:
            height ||
            null,

        title:
            title.replace(
                /^File:/i,
                ""
            ),

        author:
            author ||
            "Unknown author",

        license:
            licenseKind,

        license_url:
            licenseUrl ||
            null,

        source_url:
            sourceUrl

    };
}


/* =========================================================
   WIKIMEDIA SEARCH QUERY
========================================================= */

function buildCommoditySearchQueries(
    commodityName,
    category
) {

    const normalizedName =
        normalizeText(
            commodityName
        );


    if (
        !normalizedName
    ) {

        return [];

    }


    const baseName =
        normalizeText(
            normalizedName
                .split(",")[0]
        );


    const normalizedBase =
        normalizeSearchText(
            baseName ||
            normalizedName
        );


    const queries = [];


    /*
     * Exact commodity name first.
     */
    queries.push(
        `"${normalizedName}"`
    );


    /*
     * Standard unquoted search.
     */
    queries.push(
        normalizedName
    );


    /*
     * Base commodity when a regional / market qualifier exists.
     */
    if (
        baseName &&
        normalizeSearchText(
            baseName
        ) !==
        normalizeSearchText(
            normalizedName
        )
    ) {

        queries.push(
            `"${baseName}"`
        );


        queries.push(
            baseName
        );

    }


    /*
     * Useful representative queries.
     */
    if (
        /\bgold\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "gold mineral"
        );

    }


    if (
        /\bsilver\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "silver mineral"
        );

    }


    if (
        /\bplatinum\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "platinum mineral"
        );

    }


    if (
        /\bcopper\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "copper mineral"
        );

    }


    if (
        /\biron ore\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "iron ore"
        );

    }


    if (
        /\bcoal\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "coal"
        );

    }


    if (
        /\bcoffee\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "coffee beans"
        );

    }


    if (
        /\bbanana\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "banana fruit"
        );

    }


    if (
        /\btea\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "tea leaves"
        );

    }


    if (
        /\bwheat\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "wheat grain"
        );

    }


    if (
        /\brice\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "rice grain"
        );

    }


    if (
        /\bsoybean\b/.test(
            normalizedBase
        )
    ) {

        queries.push(
            "soybean"
        );

    }


    /*
     * Metals and precious metals get a mineral fallback.
     */
    if (
        category ===
            "precious-metals" ||
        category ===
            "metals-minerals"
    ) {

        queries.push(
            `${baseName || normalizedName} mineral specimen`
        );


        queries.push(
            `${baseName || normalizedName} mineral`
        );

    }


    /*
     * Energy fallback.
     */
    if (
        category ===
        "energy"
    ) {

        queries.push(
            `${baseName || normalizedName} fuel`
        );

    }


    return [
        ...new Set(
            queries
                .map(
                    query =>
                        normalizeText(
                            query
                        )
                )
                .filter(Boolean)
        )
    ];
}


/* =========================================================
   WIKIMEDIA IMAGE SEARCH
========================================================= */

async function searchWikimediaImage(
    commodityName,
    category
) {

    const searchQueries =
        buildCommoditySearchQueries(
            commodityName,
            category
        );


    let checked =
        0;


    let bestCandidate =
        null;


    const seenTitles =
        new Set();


    for (
        const searchQuery of
            searchQueries
    ) {

        if (
            checked >=
            MAX_IMAGE_SEARCH_CANDIDATES
        ) {

            break;

        }


        let offset =
            0;


        let queryHasMore =
            true;


        while (
            queryHasMore &&
            checked <
                MAX_IMAGE_SEARCH_CANDIDATES
        ) {

            const url =
                new URL(
                    WIKIMEDIA_API
                );


            url.searchParams.set(
                "action",
                "query"
            );


            url.searchParams.set(
                "generator",
                "search"
            );


            url.searchParams.set(
                "gsrsearch",
                searchQuery
            );


            url.searchParams.set(
                "gsrnamespace",
                "6"
            );


            url.searchParams.set(
                "gsrlimit",
                String(
                    IMAGE_SEARCH_PAGE_SIZE
                )
            );


            url.searchParams.set(
                "gsrsort",
                "relevance"
            );


            if (
                offset > 0
            ) {

                url.searchParams.set(
                    "gsroffset",
                    String(
                        offset
                    )
                );

            }


            url.searchParams.set(
                "prop",
                "imageinfo"
            );


            url.searchParams.set(
                "iiprop",
                "url|mime|size|extmetadata"
            );


            url.searchParams.set(
                "iiurlwidth",
                "900"
            );


            url.searchParams.set(
                "format",
                "json"
            );


            url.searchParams.set(
                "origin",
                "*"
            );


            url.searchParams.set(
                "maxlag",
                "5"
            );


            let response;


            try {

                response =
                    await fetch(
                        url.href,
                        {
                            headers: {

                                "Accept":
                                    "application/json",

                                "User-Agent":
                                    WIKIMEDIA_USER_AGENT

                            }
                        }
                    );

            }
            catch (error) {

                console.error(
                    "Wikimedia API request failed:",
                    error
                );


                break;

            }


            if (
                !response.ok
            ) {

                console.warn(
                    `Wikimedia API returned HTTP ${response.status} for "${searchQuery}".`
                );


                break;

            }


            const data =
                await response.json();


            if (
                data?.error
            ) {

                console.warn(
                    "Wikimedia API returned an error:",
                    data.error
                );


                break;

            }


            const pages =
                Object.values(
                    data?.query?.pages ||
                        {}
                );


            if (
                !pages.length
            ) {

                break;

            }


            for (
                const page of pages
            ) {

                if (
                    checked >=
                    MAX_IMAGE_SEARCH_CANDIDATES
                ) {

                    break;

                }


                const title =
                    String(
                        page?.title ||
                            ""
                    ).trim();


                if (
                    title &&
                    seenTitles.has(
                        title
                    )
                ) {

                    continue;

                }


                if (
                    title
                ) {

                    seenTitles.add(
                        title
                    );

                }


                checked +=
                    1;


                const candidate =
                    candidateIsUsable(
                        page,
                        commodityName,
                        category
                    );


                if (
                    candidate &&
                    (
                        !bestCandidate ||
                        candidate.score >
                            bestCandidate.score
                    )
                ) {

                    bestCandidate =
                        candidate;

                }

            }


            const nextOffset =
                Number(
                    data?.continue?.gsroffset
                );


            queryHasMore =
                pages.length >=
                    IMAGE_SEARCH_PAGE_SIZE &&

                Number.isFinite(
                    nextOffset
                ) &&

                nextOffset >
                    offset;


            if (
                queryHasMore
            ) {

                offset =
                    nextOffset;

            }

        }

    }


    return bestCandidate;
}


/* =========================================================
   COMMODITY IMAGE CACHE
========================================================= */

async function getCommodityImage(
    cache,
    commodityName,
    category
) {

    const cacheKey =
        getImageCacheKey(
            commodityName
        );


    const cached =
        await cache.match(
            cacheKey
        );


    if (
        cached
    ) {

        const age =
            getRequestCacheAgeSeconds(
                cached
            );


        if (
            Number.isFinite(
                age
            ) &&
            age >= 0
        ) {

            try {

                const cachedData =
                    await cached
                        .clone()
                        .json();


                const maxAge =
                    cachedData?.found
                        ? IMAGE_CACHE_TTL
                        : IMAGE_NEGATIVE_CACHE_TTL;


                if (
                    age <=
                    maxAge
                ) {

                    return cachedData;

                }

            }
            catch {

                /*
                 * Ignore invalid cached image data.
                 */

            }

        }

    }


    const image =
        await searchWikimediaImage(
            commodityName,
            category
        );


    const result = {

        success:
            true,

        found:
            Boolean(
                image
            ),

        image:
            image ||
            null,

        source:
            "Wikimedia Commons",

        note:
            image

                ? "Image passed the commercial-use license and relevance filters."

                : "No image passed the commercial-use and relevance filters."

    };


    const response =
        new Response(
            JSON.stringify(
                result
            ),
            {
                status:
                    200,

                headers: {

                    "Content-Type":
                        "application/json; charset=UTF-8"

                }
            }
        );


    await putTimestampedCache(
        cache,
        cacheKey,
        response,
        image
            ? IMAGE_CACHE_TTL
            : IMAGE_NEGATIVE_CACHE_TTL
    );


    return result;
}


/* =========================================================
   IMAGE ACTION
========================================================= */

async function handleImageAction(
    context,
    requestUrl
) {

    const name =
        normalizeText(
            requestUrl.searchParams.get(
                "name"
            )
        );


    if (
        !name
    ) {

        return jsonResponse(
            {

                success:
                    false,

                error:
                    "Missing commodity name.",

                image:
                    null

            },

            400,

            0
        );

    }


    const category =
        normalizeText(
            requestUrl.searchParams.get(
                "category"
            )
        ) ||

        categorizeCommodity(
            name
        );


    try {

        const result =
            await getCommodityImage(
                caches.default,
                name,
                category
            );


        return jsonResponse(

            result,

            200,

            result.found
                ? IMAGE_CACHE_TTL
                : IMAGE_NEGATIVE_CACHE_TTL

        );

    }
    catch (error) {

        console.error(
            "Wikimedia image search error:",
            error
        );


        return jsonResponse(
            {

                success:
                    false,

                found:
                    false,

                image:
                    null,

                error:
                    "Unable to search Wikimedia Commons."

            },

            200,

            IMAGE_NEGATIVE_CACHE_TTL
        );

    }
}


/* =========================================================
   MAIN HANDLER
========================================================= */

export async function onRequestGet(
    context
) {

    const requestUrl =
        new URL(
            context.request.url
        );


    const action =
        String(
            requestUrl.searchParams.get(
                "action"
            ) ||
            "data"
        )
            .trim()
            .toLowerCase();


    /* ---------------------------------------------------------
       WIKIMEDIA IMAGE ACTION
    --------------------------------------------------------- */

    if (
        action ===
        "image"
    ) {

        return handleImageAction(
            context,
            requestUrl
        );

    }


    /* ---------------------------------------------------------
       DATA ACTION
    --------------------------------------------------------- */

    if (
        action !==
        "data"
    ) {

        return jsonResponse(
            {

                success:
                    false,

                error:
                    "Unsupported markets action."

            },

            400,

            0
        );

    }


    const cache =
        caches.default;


    const resultCacheKey =
        new Request(
            VOLTLAS_RESULT_CACHE_KEY
        );


    const cachedResult =
        await getFreshCache(
            cache,
            resultCacheKey,
            CACHE_TTL
        );


    if (
        cachedResult
    ) {

        return cachedResult;

    }


    try {

        const parsed =
            await loadVoltlasDataset(
                cache
            );


        const response =
            jsonResponse(
                {

                    success:
                        true,

                    data:
                        parsed

                },

                200,

                CACHE_TTL
            );


        const cachedResponse =
            await putTimestampedCache(
                cache,
                resultCacheKey,
                response,
                CACHE_TTL
            );


        return cachedResponse;

    }
    catch (error) {

        console.error(
            "Markets API error:",
            error
        );


        return jsonResponse(
            {

                success:
                    false,

                error:
                    "Unable to load Voltlas commodity data."

            },

            500,

            0
        );

    }

}
