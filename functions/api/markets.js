/* =========================================================
   WORTH IT — MARKETS API
   World Bank Commodity Price Data (The Pink Sheet)

   Data source:
     World Bank Commodity Markets
     Monthly prices workbook

   License:
     Creative Commons Attribution 4.0 (CC BY 4.0)

   No API key required.

   This version dynamically reads every commodity series that
   exists in the World Bank "Monthly Prices" worksheet.

   It also provides a separate lazy image endpoint:

     /api/markets?action=image&name=Gold&category=precious-metals

   Images are searched on Wikimedia Commons and are accepted only
   when the file has a commercially reusable free/public-domain
   license and the image metadata is relevant to the commodity.

   Unknown / ambiguous licenses are rejected.
========================================================= */

const WORLD_BANK_MARKETS_PAGE =
    "https://www.worldbank.org/en/research/commodity-markets";


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


const WORLD_BANK_XLSX_CACHE_KEY =
    "https://worth-it-internal-cache.local/world-bank-cmo-monthly.xlsx";


const WORLD_BANK_RESULT_CACHE_KEY =
    "https://worth-it-internal-cache.local/world-bank-markets-v4.json";


const WORLD_BANK_PAGE_CACHE_KEY =
    "https://worth-it-internal-cache.local/world-bank-commodity-markets-page-v2";


/* =========================================================
   WIKIMEDIA
========================================================= */

const WIKIMEDIA_API =
    "https://commons.wikimedia.org/w/api.php";


/*
 * Version intentionally bumped from v4 to v5.
 *
 * This invalidates old negative image-cache entries that were
 * generated before the Wikimedia request / license fixes.
 */
const WIKIMEDIA_IMAGE_CACHE_PREFIX =
    "https://worth-it-internal-cache.local/markets-wikimedia-image-v10/";


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
 *
 * Keep this descriptive and point to the project URL.
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


    if (cacheSeconds > 0) {

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


    if (cacheSeconds > 0) {

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
   TEXT HELPERS
========================================================= */

function normalizeText(
    value
) {

    return String(value || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function normalizeSearchText(
    value
) {

    return normalizeText(
        value
    )
        .toLowerCase()
        .normalize("NFKD")
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


function decodeXmlEntities(
    value
) {

    return String(value || "")
        .replace(
            /&amp;/g,
            "&"
        )
        .replace(
            /&lt;/g,
            "<"
        )
        .replace(
            /&gt;/g,
            ">"
        )
        .replace(
            /&quot;/g,
            '"'
        )
        .replace(
            /&apos;/g,
            "'"
        )
        .replace(
            /&#(\d+);/g,
            (_, decimal) => {

                const codePoint =
                    Number(decimal);


                return Number.isFinite(
                    codePoint
                )
                    ? String.fromCodePoint(
                        codePoint
                    )
                    : _;

            }
        )
        .replace(
            /&#x([0-9a-f]+);/gi,
            (_, hex) => {

                const codePoint =
                    Number.parseInt(
                        hex,
                        16
                    );


                return Number.isFinite(
                    codePoint
                )
                    ? String.fromCodePoint(
                        codePoint
                    )
                    : _;

            }
        );
}


function stripHtml(
    value
) {

    return normalizeText(
        String(value || "")
            .replace(
                /<[^>]*>/g,
                " "
            )
            .replace(
                /&nbsp;/gi,
                " "
            )
    );
}


function escapeRegExp(
    value
) {

    return String(value || "")
        .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
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


/* =========================================================
   ZIP / XLSX HELPERS
========================================================= */

function readUInt16(
    bytes,
    offset
) {

    return (
        bytes[offset] |
        (bytes[offset + 1] << 8)
    ) >>> 0;
}


function readUInt32(
    bytes,
    offset
) {

    return (
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    ) >>> 0;
}


function findEndOfCentralDirectory(
    bytes
) {

    const signature =
        0x06054b50;


    const minimumOffset =
        Math.max(
            0,
            bytes.length - 65557
        );


    for (
        let offset =
            bytes.length - 22;

        offset >= minimumOffset;

        offset -= 1
    ) {

        if (
            readUInt32(
                bytes,
                offset
            ) === signature
        ) {

            return offset;

        }

    }


    throw new Error(
        "Invalid XLSX ZIP: end of central directory not found."
    );
}


async function inflateDeflateRaw(
    bytes
) {

    const stream =
        new Blob([bytes])
            .stream()
            .pipeThrough(
                new DecompressionStream(
                    "deflate-raw"
                )
            );


    return new Uint8Array(
        await new Response(
            stream
        ).arrayBuffer()
    );
}


async function unzipEntries(
    arrayBuffer
) {

    const bytes =
        new Uint8Array(
            arrayBuffer
        );


    const endOffset =
        findEndOfCentralDirectory(
            bytes
        );


    const totalEntries =
        readUInt16(
            bytes,
            endOffset + 10
        );


    const centralDirectoryOffset =
        readUInt32(
            bytes,
            endOffset + 16
        );


    const entries =
        new Map();


    let cursor =
        centralDirectoryOffset;


    const decoder =
        new TextDecoder(
            "utf-8"
        );


    for (
        let index = 0;
        index < totalEntries;
        index += 1
    ) {

        if (
            readUInt32(
                bytes,
                cursor
            ) !== 0x02014b50
        ) {

            throw new Error(
                "Invalid XLSX ZIP: corrupt central directory."
            );

        }


        const compressionMethod =
            readUInt16(
                bytes,
                cursor + 10
            );


        const compressedSize =
            readUInt32(
                bytes,
                cursor + 20
            );


        const fileNameLength =
            readUInt16(
                bytes,
                cursor + 28
            );


        const extraLength =
            readUInt16(
                bytes,
                cursor + 30
            );


        const commentLength =
            readUInt16(
                bytes,
                cursor + 32
            );


        const localHeaderOffset =
            readUInt32(
                bytes,
                cursor + 42
            );


        const fileName =
            decoder.decode(
                bytes.slice(
                    cursor + 46,
                    cursor +
                        46 +
                        fileNameLength
                )
            );


        if (
            readUInt32(
                bytes,
                localHeaderOffset
            ) !== 0x04034b50
        ) {

            throw new Error(
                `Invalid XLSX ZIP: missing local header for ${fileName}.`
            );

        }


        const localFileNameLength =
            readUInt16(
                bytes,
                localHeaderOffset + 26
            );


        const localExtraLength =
            readUInt16(
                bytes,
                localHeaderOffset + 28
            );


        const dataStart =
            localHeaderOffset +
            30 +
            localFileNameLength +
            localExtraLength;


        const compressedData =
            bytes.slice(
                dataStart,
                dataStart +
                    compressedSize
            );


        let data;


        if (
            compressionMethod === 0
        ) {

            data =
                compressedData;

        }
        else if (
            compressionMethod === 8
        ) {

            data =
                await inflateDeflateRaw(
                    compressedData
                );

        }
        else {

            throw new Error(
                `Unsupported XLSX compression method ${compressionMethod}.`
            );

        }


        entries.set(
            fileName,
            data
        );


        cursor +=
            46 +
            fileNameLength +
            extraLength +
            commentLength;

    }


    return entries;
}


function getXmlAttribute(
    tag,
    attributeName
) {

    const pattern =
        new RegExp(
            `${escapeRegExp(attributeName)}=["']([^"']*)["']`,
            "i"
        );


    const match =
        String(tag || "")
            .match(
                pattern
            );


    return match
        ? decodeXmlEntities(
            match[1]
        )
        : null;
}


/* =========================================================
   XLSX WORKBOOK / SHEET
========================================================= */

function resolveWorkbookTarget(
    target
) {

    const cleanTarget =
        String(target || "")
            .replace(
                /^\//,
                ""
            )
            .replace(
                /^\.\//,
                ""
            );


    if (
        cleanTarget.startsWith(
            "xl/"
        )
    ) {

        return cleanTarget;

    }


    return `xl/${cleanTarget}`;
}


function findMonthlyPricesSheet(
    entries
) {

    const workbookBytes =
        entries.get(
            "xl/workbook.xml"
        );


    if (!workbookBytes) {

        throw new Error(
            "XLSX is missing xl/workbook.xml."
        );

    }


    const relsBytes =
        entries.get(
            "xl/_rels/workbook.xml.rels"
        );


    if (!relsBytes) {

        throw new Error(
            "XLSX is missing workbook relationships."
        );

    }


    const workbookXml =
        new TextDecoder("utf-8")
            .decode(
                workbookBytes
            );


    const relsXml =
        new TextDecoder("utf-8")
            .decode(
                relsBytes
            );


    const relationshipMap =
        new Map();


    const relationshipRegex =
        /<Relationship\b[^>]*>/gi;


    for (
        const match of relsXml.matchAll(
            relationshipRegex
        )
    ) {

        const tag =
            match[0];


        const id =
            getXmlAttribute(
                tag,
                "Id"
            );


        const target =
            getXmlAttribute(
                tag,
                "Target"
            );


        if (
            id &&
            target
        ) {

            relationshipMap.set(
                id,
                resolveWorkbookTarget(
                    target
                )
            );

        }

    }


    const sheetRegex =
        /<sheet\b[^>]*>/gi;


    for (
        const match of workbookXml.matchAll(
            sheetRegex
        )
    ) {

        const tag =
            match[0];


        const name =
            getXmlAttribute(
                tag,
                "name"
            );


        const relationshipId =
            getXmlAttribute(
                tag,
                "r:id"
            );


        if (
            normalizeText(name)
                .toLowerCase() ===
                "monthly prices" &&
            relationshipId
        ) {

            const sheetPath =
                relationshipMap.get(
                    relationshipId
                );


            if (sheetPath) {

                return sheetPath;

            }

        }

    }


    throw new Error(
        "XLSX does not contain a Monthly Prices worksheet."
    );
}


/* =========================================================
   SHARED STRINGS / WORKSHEET
========================================================= */

function parseSharedStrings(
    entries
) {

    const bytes =
        entries.get(
            "xl/sharedStrings.xml"
        );


    if (!bytes) {

        return [];

    }


    const xml =
        new TextDecoder("utf-8")
            .decode(
                bytes
            );


    const strings = [];


    const itemRegex =
        /<si\b[^>]*>([\s\S]*?)<\/si>/gi;


    for (
        const match of xml.matchAll(
            itemRegex
        )
    ) {

        const item =
            match[1] ||
            "";


        const textParts = [];


        const textRegex =
            /<t\b[^>]*>([\s\S]*?)<\/t>/gi;


        for (
            const textMatch of item.matchAll(
                textRegex
            )
        ) {

            textParts.push(
                decodeXmlEntities(
                    textMatch[1]
                )
            );

        }


        strings.push(
            textParts.join("")
        );

    }


    return strings;
}


function columnLettersToNumber(
    columnLetters
) {

    let result = 0;


    for (
        const character of String(
            columnLetters || ""
        ).toUpperCase()
    ) {

        const code =
            character.charCodeAt(0) -
            64;


        if (
            code < 1 ||
            code > 26
        ) {

            return -1;

        }


        result =
            result * 26 +
            code;

    }


    return result - 1;
}


function cellReferenceToColumn(
    reference
) {

    const match =
        String(reference || "")
            .match(
                /^([A-Z]+)\d+$/i
            );


    if (!match) {

        return -1;

    }


    return columnLettersToNumber(
        match[1]
    );
}


function parseWorksheetRows(
    xml,
    sharedStrings
) {

    const rows = [];


    const rowRegex =
        /<row\b[^>]*>([\s\S]*?)<\/row>/gi;


    for (
        const rowMatch of xml.matchAll(
            rowRegex
        )
    ) {

        const rowXml =
            rowMatch[1] ||
            "";


        const row =
            new Map();


        const cellRegex =
            /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;


        for (
            const cellMatch of rowXml.matchAll(
                cellRegex
            )
        ) {

            const attributes =
                cellMatch[1] ||
                "";


            const content =
                cellMatch[2] ||
                "";


            const attributeTag =
                `<c ${attributes}>`;


            const reference =
                getXmlAttribute(
                    attributeTag,
                    "r"
                );


            const column =
                cellReferenceToColumn(
                    reference
                );


            if (
                column < 0
            ) {

                continue;

            }


            const type =
                getXmlAttribute(
                    attributeTag,
                    "t"
                );


            const valueMatch =
                content.match(
                    /<v\b[^>]*>([\s\S]*?)<\/v>/i
                );


            let value =
                "";


            if (
                type === "s"
            ) {

                const sharedIndex =
                    Number.parseInt(
                        valueMatch
                            ? valueMatch[1]
                            : "",
                        10
                    );


                value =
                    Number.isInteger(
                        sharedIndex
                    ) &&
                    sharedIndex >= 0 &&
                    sharedIndex <
                        sharedStrings.length

                        ? sharedStrings[
                            sharedIndex
                        ]

                        : "";

            }
            else if (
                type === "inlineStr"
            ) {

                const inlineParts =
                    [];


                const inlineTextRegex =
                    /<t\b[^>]*>([\s\S]*?)<\/t>/gi;


                for (
                    const inlineMatch of content.matchAll(
                        inlineTextRegex
                    )
                ) {

                    inlineParts.push(
                        decodeXmlEntities(
                            inlineMatch[1]
                        )
                    );

                }


                value =
                    inlineParts.join("");

            }
            else {

                value =
                    valueMatch

                        ? decodeXmlEntities(
                            valueMatch[1]
                        )

                        : "";

            }


            row.set(
                column,
                normalizeText(
                    value
                )
            );

        }


        if (
            row.size
        ) {

            rows.push(
                row
            );

        }

    }


    return rows;
}


function rowValues(
    row
) {

    const values = [];


    for (
        const [
            column,
            value
        ] of row.entries()
    ) {

        values[column] =
            value;

    }


    return values;
}


function findHeaderRows(
    rows
) {

    for (
        let index = 0;

        index <
            Math.min(
                rows.length,
                30
            );

        index += 1
    ) {

        const values =
            rowValues(
                rows[index]
            );


        const joined =
            values
                .filter(Boolean)
                .join(" | ")
                .toLowerCase();


        if (
            joined.includes(
                "gold"
            ) &&
            joined.includes(
                "silver"
            ) &&
            joined.includes(
                "platinum"
            ) &&
            joined.includes(
                "crude oil"
            )
        ) {

            return {
                nameRowIndex:
                    index,

                unitRowIndex:
                    index + 1,

                possibleCodeRowIndex:
                    index + 2
            };

        }

    }


    throw new Error(
        "Could not locate World Bank commodity header rows."
    );
}


function buildHeaderInfo(
    rows,
    headerInfo
) {

    const nameRow =
        rowValues(
            rows[
                headerInfo.nameRowIndex
            ] ||
                new Map()
        );


    const unitRow =
        rowValues(
            rows[
                headerInfo.unitRowIndex
            ] ||
                new Map()
        );


    const codeRow =
        headerInfo.codeRowIndex ===
            null ||
        headerInfo.codeRowIndex ===
            undefined

            ? []

            : rowValues(
                rows[
                    headerInfo.codeRowIndex
                ] ||
                    new Map()
            );


    const headers = [];


    const maximumLength =
        Math.max(
            nameRow.length,
            unitRow.length,
            codeRow.length
        );


    for (
        let column = 0;

        column <
            maximumLength;

        column += 1
    ) {

        headers[column] = {

            name:
                normalizeText(
                    nameRow[column]
                ),

            unit:
                normalizeText(
                    unitRow[column]
                ),

            code:
                normalizeText(
                    codeRow[column]
                )

        };

    }


    return headers;
}


function parseNumeric(
    value
) {

    const normalized =
        String(value || "")
            .replace(
                /,/g,
                ""
            )
            .trim();


    if (
        !normalized ||
        normalized === ".." ||
        normalized === "…" ||
        normalized === "..." ||
        normalized === "—" ||
        normalized === "-"
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


function parsePeriod(
    value
) {

    const monthlyMatch =
        String(value || "")
            .trim()
            .match(
                /^(\d{4})M(\d{1,2})$/i
            );


    if (
        monthlyMatch
    ) {

        const year =
            Number(
                monthlyMatch[1]
            );


        const month =
            Number(
                monthlyMatch[2]
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


    const slashMatch =
        String(value || "")
            .trim()
            .match(
                /^(\d{4})\/(\d{1,2})$/
            );


    if (
        slashMatch
    ) {

        const year =
            Number(
                slashMatch[1]
            );


        const month =
            Number(
                slashMatch[2]
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


function countNumericObservations(
    rows,
    column
) {

    let count = 0;


    for (
        const row of rows
    ) {

        const values =
            rowValues(
                row
            );


        if (
            parsePeriod(
                values[0]
            ) &&
            parseNumeric(
                values[column]
            ) !== null
        ) {

            count += 1;

        }

    }


    return count;
}


function buildSeries(
    rows,
    column
) {

    const series = [];


    for (
        const row of rows
    ) {

        const values =
            rowValues(
                row
            );


        const period =
            parsePeriod(
                values[0]
            );


        if (!period) {

            continue;

        }


        const value =
            parseNumeric(
                values[column]
            );


        if (
            value === null
        ) {

            continue;

        }


        series.push({

            ...period,

            value

        });

    }


    series.sort(
        (a, b) =>
            a.timestamp -
            b.timestamp
    );


    return series;
}


function getLatestAndPrevious(
    series
) {

    if (
        !series.length
    ) {

        return {

            latest:
                null,

            previous:
                null,

            change:
                null

        };

    }


    const latest =
        series[
            series.length - 1
        ];


    const previous =
        series.length > 1

            ? series[
                series.length - 2
            ]

            : null;


    const change =
        previous &&
        previous.value !== 0

            ? (
                latest.value /
                previous.value -
                1
            ) * 100

            : null;


    return {

        latest,

        previous,

        change

    };
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
        /\b(gold|silver|platinum|palladium|rhodium)\b/
            .test(value)
    ) {

        return "precious-metals";

    }


    if (
        /\b(aluminum|aluminium|copper|lead|nickel|tin|zinc|molybdenum|iron ore|steel|ore)\b/
            .test(value)
    ) {

        return "metals-minerals";

    }


    if (
        /\b(crude oil|brent|wti|dubai|natural gas|liquefied natural gas|lng|coal|energy)\b/
            .test(value)
    ) {

        return "energy";

    }


    if (
        /\b(urea|dap|tsp|potash|phosphate|fertilizer|fertiliser)\b/
            .test(value)
    ) {

        return "fertilizers";

    }


    if (
        /\b(cocoa|coffee|tea|coconut|groundnut|palm|soybean|soy|maize|corn|rice|wheat|barley|sorghum|sugar|banana|orange|grains|food|meat|beef|lamb|poultry|shrimp|fish)\b/
            .test(value)
    ) {

        return "agriculture-food";

    }


    if (
        /\b(cotton|rubber|timber|log|logs|sawnwood|plywood|wood|hides|leather)\b/
            .test(value)
    ) {

        return "raw-materials";

    }


    return "other";
}


const CATEGORY_INFO = {

    all: {
        label: "All"
    },

    "precious-metals": {
        label: "Precious Metals"
    },

    "metals-minerals": {
        label: "Metals & Minerals"
    },

    energy: {
        label: "Energy"
    },

    fertilizers: {
        label: "Fertilizers"
    },

    "agriculture-food": {
        label: "Agriculture & Food"
    },

    "raw-materials": {
        label: "Raw Materials"
    },

    other: {
        label: "Other"
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


    if (
        unit.includes(
            "$/toz"
        )
    ) {

        return {

            eurUnit:
                "g",

            usUnit:
                "oz",

            conversion:
                1 / 31.1034768

        };

    }


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


    if (
        unit.includes(
            "$/mt"
        )
    ) {

        if (
            category ===
            "metals-minerals"
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


        return {

            eurUnit:
                "metric ton",

            usUnit:
                "metric ton",

            conversion:
                1

        };

    }


    if (
        unit.includes(
            "$/dmt"
        )
    ) {

        return {

            eurUnit:
                "metric ton",

            usUnit:
                "metric ton",

            conversion:
                1

        };

    }


    if (
        unit.includes(
            "$/kg"
        )
    ) {

        return {

            eurUnit:
                "kg",

            usUnit:
                "kg",

            conversion:
                1

        };

    }


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


    const fallbackUnit =
        sourceUnit

            ? sourceUnit
                .replace(
                    /^\(\$\/|\)$/g,
                    ""
                )

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

    "copper",

    "iron ore",

    "aluminum",

    "aluminium",

    "crude oil, wti",

    "natural gas, u.s.",

    "crude oil, brent",

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
            value =>
                normalized === value ||
                normalized.startsWith(
                    `${value} `
                ) ||
                normalized.startsWith(
                    `${value},`
                )
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
        priorityDifference !== 0
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
        categoryDifference !== 0
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
   WORLD BANK LOADING
========================================================= */

async function fetchWorldBankPage(
    cache
) {

    const key =
        new Request(
            WORLD_BANK_PAGE_CACHE_KEY
        );


    const cached =
        await getFreshCache(
            cache,
            key,
            CACHE_TTL
        );


    if (cached) {

        return cached;

    }


    const response =
        await fetch(
            WORLD_BANK_MARKETS_PAGE,
            {
                headers: {

                    "Accept":
                        "text/html,application/xhtml+xml"

                }
            }
        );


    if (!response.ok) {

        throw new Error(
            `World Bank commodity page request failed with status ${response.status}.`
        );

    }


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


async function discoverWorldBankMonthlyUrl(
    cache
) {

    const response =
        await fetchWorldBankPage(
            cache
        );


    const html =
        await response.text();


    const matches =
        [
            ...html.matchAll(
                /href=["']([^"']*CMO-Historical-Data-Monthly\.xlsx[^"']*)["']/gi
            )
        ];


    if (
        !matches.length
    ) {

        throw new Error(
            "Could not find the current World Bank monthly XLSX link."
        );

    }


    return new URL(
        decodeXmlEntities(
            matches[0][1]
        ),
        WORLD_BANK_MARKETS_PAGE
    ).href;
}


async function loadWorldBankWorkbook(
    cache
) {

    const url =
        await discoverWorldBankMonthlyUrl(
            cache
        );


    const cacheKey =
        new Request(
            WORLD_BANK_XLSX_CACHE_KEY
        );


    const cached =
        await getFreshCache(
            cache,
            cacheKey,
            CACHE_TTL
        );


    if (cached) {

        return {

            url,

            bytes:
                await cached.arrayBuffer()

        };

    }


    const response =
        await fetch(
            url,
            {
                headers: {

                    "Accept":
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*"

                }
            }
        );


    if (!response.ok) {

        throw new Error(
            `World Bank monthly XLSX request failed with status ${response.status}.`
        );

    }


    const cachedResponse =
        await putTimestampedCache(
            cache,
            cacheKey,
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


    return {

        url,

        bytes:
            await cachedResponse.arrayBuffer()

    };
}


/* =========================================================
   PARSE WORLD BANK DATA
========================================================= */

async function parseWorldBankDataset(
    arrayBuffer
) {

    const entries =
        await unzipEntries(
            arrayBuffer
        );


    const sheetPath =
        findMonthlyPricesSheet(
            entries
        );


    const sheetBytes =
        entries.get(
            sheetPath
        );


    if (!sheetBytes) {

        throw new Error(
            `World Bank XLSX is missing ${sheetPath}.`
        );

    }


    const sheetXml =
        new TextDecoder("utf-8")
            .decode(
                sheetBytes
            );


    const sharedStrings =
        parseSharedStrings(
            entries
        );


    const rows =
        parseWorksheetRows(
            sheetXml,
            sharedStrings
        );


    const headerInfo =
        findHeaderRows(
            rows
        );


    const possibleCodeRow =
        rows[
            headerInfo.possibleCodeRowIndex
        ] ||
        null;


    const possibleCodeValues =
        rowValues(
            possibleCodeRow ||
                new Map()
        )
            .filter(
                value =>
                    normalizeText(value)
            );


    const isLikelyCodeRow =
        possibleCodeValues.length >= 3 &&
        !parsePeriod(
            rowValues(
                possibleCodeRow ||
                    new Map()
            )[0]
        ) &&
        possibleCodeValues.filter(
            value =>
                /^[A-Z0-9_]{2,40}$/i.test(
                    String(value || "")
                )
        ).length >=
            Math.max(
                3,
                Math.floor(
                    possibleCodeValues.length *
                    0.7
                )
            );


    const effectiveHeaderInfo = {

        ...headerInfo,

        codeRowIndex:
            isLikelyCodeRow

                ? headerInfo.possibleCodeRowIndex

                : null

    };


    const headers =
        buildHeaderInfo(
            rows,
            effectiveHeaderInfo
        );


    const dataStartIndex =
        isLikelyCodeRow

            ? headerInfo.possibleCodeRowIndex + 1

            : headerInfo.unitRowIndex + 1;


    const dataRows =
        rows.slice(
            dataStartIndex
        );


    const commodities = [];


    for (
        let column = 1;

        column < headers.length;

        column += 1
    ) {

        const header =
            headers[column];


        if (!header) {

            continue;

        }


        const name =
            normalizeText(
                header.name
            );


        if (!name) {

            continue;

        }


        const normalizedName =
            name.toLowerCase();


        if (
            normalizedName === "date" ||
            normalizedName === "month"
        ) {

            continue;

        }


        const numericCount =
            countNumericObservations(
                dataRows,
                column
            );


        if (
            numericCount < 2
        ) {

            continue;

        }


        const series =
            buildSeries(
                dataRows,
                column
            );


        const state =
            getLatestAndPrevious(
                series
            );


        if (!state.latest) {

            continue;

        }


        const category =
            categorizeCommodity(
                name
            );


        const displaySpec =
            getDisplaySpec(
                header.unit,
                category
            );


        let code =
            normalizeText(
                header.code
            );


        if (
            !code ||
            !/^[A-Z0-9_]+$/i.test(
                code
            ) ||
            /^(DATE|MONTH)$/i.test(
                code
            )
        ) {

            code =
                simplifySearchText(
                    name
                )
                    .replace(
                        /^\d+/,
                        ""
                    )
                    .slice(
                        0,
                        80
                    ) ||
                `commodity_${column}`;


            code =
                code.toUpperCase();

        }


        commodities.push({

            code,

            name,

            category,

            category_label:
                categoryLabel(
                    category
                ),

            source_unit:
                header.unit ||
                null,

            price:
                state.latest.value,

            previous_price:
                state.previous?.value ??
                null,

            changes: {

                monthly: {

                    percent:
                        state.change

                }

            },

            updated_at:
                new Date(
                    state.latest.timestamp
                ).toISOString(),

            data_period:
                state.latest.period,

            previous_period:
                state.previous?.period ||
                null,

            display:
                displaySpec,

            source:
                "World Bank Commodity Price Data (The Pink Sheet)"

        });

    }


    commodities.sort(
        sortCommodities
    );


    if (
        !commodities.length
    ) {

        throw new Error(
            "World Bank Monthly Prices contained no usable commodity series."
        );

    }


    const latestTimestamp =
        Math.max(
            ...commodities.map(
                item =>
                    new Date(
                        item.updated_at
                    ).getTime()
            )
        );


    const latestDate =
        new Date(
            latestTimestamp
        );


    const period =
        `${latestDate.getUTCFullYear()}M${String(
            latestDate.getUTCMonth() + 1
        ).padStart(2, "0")}`;


    return {

        prices:
            commodities,

        latest_period:
            period,

        commodity_count:
            commodities.length,

        categories:
            [
                ...new Set(
                    commodities.map(
                        item =>
                            item.category
                    )
                )
            ],

        source:
            "World Bank Commodity Price Data (The Pink Sheet)",

        source_url:
            WORLD_BANK_MARKETS_PAGE,

        license:
            "CC BY 4.0"

    };
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


    return stripHtml(
        value
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

            "s"

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
        ).split(",")[0]
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

            "europe"

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


    if (!coreTokens.length) {

        return false;

    }


    const normalizedWords =
        normalizeSearchText(
            text
        )
            .split(" ")
            .filter(Boolean);


    /*
     * Single-word commodities need their commodity term.
     * Multi-word commodities require every meaningful core word.
     * This avoids matching a generic “iron” image to “iron ore”,
     * or a generic “sunflower” image to “sunflower oil”.
     */
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


            if (!normalizedToken) {

                return false;

            }


            return normalizedText
                .split(" ")
                .some(
                    word =>
                        word ===
                        normalizedToken
                ) ||

                normalizedText.includes(
                    normalizedToken
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
        .test(text);
}


/* =========================================================
   LICENSE DETECTION
========================================================= */

function getLicenseKind(
    extmetadata
) {

    /*
     * normalizeSearchText() converts:
     *
     *   CC BY-SA
     * into
     *   cc by sa
     *
     * and:
     *
     *   CC BY-NC
     * into
     *   cc by nc
     *
     * Therefore the license checks below intentionally use
     * the normalized forms.
     */

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


    if (!license) {

        return null;

    }


    /*
     * Non-commercial and no-derivatives licenses are not
     * accepted for the site's commercial use case.
     */

    if (
        /\bcc by nc\b/.test(license) ||
        /\bcreative commons attribution noncommercial\b/.test(license) ||
        /\bnoncommercial\b/.test(license) ||
        /\bnon commercial\b/.test(license) ||

        /\bcc by nd\b/.test(license) ||
        /\bcreative commons attribution noderivatives\b/.test(license) ||
        /\bno derivatives\b/.test(license) ||
        /\bno derivatives\b/.test(license)
    ) {

        return null;

    }


    if (
        /\bcc0\b/.test(license) ||
        /\bpublic domain\b/.test(license) ||
        /\bpublic domain\b/.test(license) ||
        /\bpd\b/.test(license)
    ) {

        return "Public Domain / CC0";

    }


    if (
        /\bcc by sa\b/.test(license) ||
        /\bcreative commons attribution sharealike\b/.test(license) ||
        /\bcreative commons attribution share alike\b/.test(license)
    ) {

        return "CC BY-SA";

    }


    if (
        /\bcc by\b/.test(license) ||
        /\bcreative commons attribution\b/.test(license)
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
        stripHtml(
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
        width * height;


    if (
        width < MIN_IMAGE_WIDTH ||
        height < MIN_IMAGE_HEIGHT ||
        pixelCount < MIN_IMAGE_PIXELS
    ) {

        return null;

    }


    const aspectRatio =
        height > 0
            ? width / height
            : 0;


    if (
        aspectRatio > 4.5 ||
        aspectRatio < (1 / 4.5)
    ) {

        return null;

    }


    const tokens =
        buildCommoditySearchTokens(
            commodityName
        );


    if (!tokens.length) {

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


    /*
     * The image metadata itself must contain at least one
     * relevant commodity token.
     *
     * This replaces the previous requirement that the token
     * had to exist in the actual CDN image URL.
     */

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


    if (!licenseKind) {

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
        stripHtml(
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
        stripHtml(

            getMetadataValue(
                extmetadata,
                "Artist"
            ) ||

            getMetadataValue(
                extmetadata,
                "Credit"
            )

        );


    /*
     * CC BY and CC BY-SA require attribution.
     * If we cannot reliably identify the author/license,
     * reject the image rather than using it anyway.
     */

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


    /*
     * URL relevance is now an additional ranking signal rather
     * than a hard rejection condition.
     */

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

        /ore|mineral|metal|aluminum|aluminium|copper|nickel|iron|zinc|lead|tin/i
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


    if (!normalizedName) {

        return [];

    }


    /*
     * Many World Bank series have market/location qualifiers
     * after a comma, for example:
     *
     *   "Coal, Australian"
     *   "Wheat, US HRW"
     *   "Tea, Colombo"
     *
     * Wikimedia often has a useful representative image under
     * the base commodity name instead of the exact market series.
     */
    const baseName =
        normalizeText(
            normalizedName.split(",")[0]
        );


    const queries = [];


    /*
     * First try the exact commodity name.
     */
    queries.push(
        `"${normalizedName}"`
    );


    /*
     * Add a small set of representative search terms for
     * common World Bank commodity series. These are only search
     * fallbacks; the candidate validator still requires metadata
     * relevance to the actual commodity tokens.
     */
    const normalizedBase =
        normalizeSearchText(
            baseName || normalizedName
        );


    const searchHints = [];


    if (
        /\bgold\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "gold mineral"
        );

    }


    if (
        /\bsilver\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "silver mineral"
        );

    }


    if (
        /\bplatinum\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "platinum mineral"
        );

    }


    if (
        /\bcopper\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "copper mineral"
        );

    }


    if (
        /\biron ore\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "iron ore"
        );

    }


    if (
        /\bcoal\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "coal"
        );

    }


    if (
        /\bcoffee\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "coffee beans"
        );

    }


    if (
        /\bbanana\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "banana fruit"
        );

    }


    if (
        /\btea\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "tea leaves"
        );

    }


    if (
        /\bwheat\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "wheat grain"
        );

    }


    if (
        /\brice\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "rice grain"
        );

    }


    if (
        /\bsoybean\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "soybean"
        );

    }


    searchHints.forEach(
        hint => {

            queries.push(
                hint
            );

        }
    );


    /*
     * Then try the normal unquoted search.
     */
    queries.push(
        normalizedName
    );


    /*
     * Then use the base commodity name when it differs.
     */
    if (
        baseName &&
        normalizeSearchText(baseName) !==
            normalizeSearchText(normalizedName)
    ) {

        queries.push(
            `"${baseName}"`
        );


        queries.push(
            baseName
        );

    }


    /*
     * Precious metals and industrial minerals benefit from
     * a specimen/mineral hint, but this is only a fallback.
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
     * Deduplicate while preserving the preferred order.
     */
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


    /*
     * Try multiple search formulations because Wikimedia search
     * results for market-series names are often sparse.
     *
     * The candidate validator remains the authoritative
     * relevance/license gate.
     */
    for (
        const searchQuery of searchQueries
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


            if (!response.ok) {

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


            if (!pages.length) {

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


                if (title) {

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


    if (cached) {

        const age =
            getRequestCacheAgeSeconds(
                cached
            );


        if (
            Number.isFinite(age) &&
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
            Boolean(image),

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


    if (!name) {

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


    if (
        action ===
        "image"
    ) {

        return handleImageAction(
            context,
            requestUrl
        );

    }


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
            WORLD_BANK_RESULT_CACHE_KEY
        );


    const cachedResult =
        await getFreshCache(
            cache,
            resultCacheKey,
            CACHE_TTL
        );


    if (cachedResult) {

        return cachedResult;

    }


    try {

        const workbook =
            await loadWorldBankWorkbook(
                cache
            );


        const parsed =
            await parseWorldBankDataset(
                workbook.bytes
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
                    "Unable to load World Bank market data."

            },

            500,

            0
        );

    }

}
