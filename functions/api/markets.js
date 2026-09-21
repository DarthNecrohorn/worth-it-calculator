/* =========================================================
   WORTH IT — MARKETS API
   Multi-Source Open Commodity Data

   Primary public commodity sources:

     1. World Bank Commodity Prices / Pink Sheet
        https://www.worldbank.org/en/research/commodity-markets
        License: CC BY 4.0

     2. U.S. Geological Survey — Mineral Commodity Summaries
        https://www.usgs.gov/centers/national-minerals-information-center/data
        License: CC0 1.0

     3. U.S. Energy Information Administration (EIA)
        https://www.eia.gov/opendata/
        Public-domain U.S. government data.
        API key is optional for Worth It; EIA source is enabled when
        EIA_API_KEY exists in Cloudflare environment secrets.

     4. USDA National Agricultural Statistics Service (NASS)
        https://www.nass.usda.gov/Quick_Stats/
        Public-domain NASS information may be freely reproduced with
        appropriate USDA-NASS acknowledgment.
        Worth It uses NASS public chart data files, so no USDA
        API key is required.

     5. Voltlas Open Data
        https://voltlas.com/data
        License: CC BY 4.0

   Important design rules:

     - Only sources with terms permitting public/commercial reuse are
       used for the relevant commodity data.
     - Sources are combined, not duplicated.
     - The same commodity from multiple sources is collapsed into a
       single Worth It commodity record.
     - Regional/benchmark variants remain separate when they are
       materially different commodities or benchmarks.
     - MAX_COMMODITIES is a ceiling, never a fake padding target.
     - No commodity is invented just to reach 300 cards.
     - Wikimedia image validation remains completely separate from the
       commodity-data filter. A missing image NEVER removes a commodity.
     - Wikimedia images are accepted only when their own metadata proves
       a commercially reusable license and the relevance filters pass.
     - Source data are cached independently and the merged result is
       refreshed automatically.

   Frontend data endpoint:
     /api/markets

   Lazy Wikimedia image endpoint:
     /api/markets?action=image&name=Gold&category=precious-metals

   Environment secret:
     EIA_API_KEY
========================================================= */

const WORLD_BANK_MARKETS_PAGE =
    "https://www.worldbank.org/en/research/commodity-markets";

const WORLD_BANK_LICENSE_URL =
    "https://creativecommons.org/licenses/by/4.0/";

const USGS_DATA_PAGE =
    "https://www.usgs.gov/centers/national-minerals-information-center/data";

const USGS_LICENSE_URL =
    "https://creativecommons.org/publicdomain/zero/1.0/";

const USGS_SCIENCEBASE_FILE_PREFIX =
    "https://www.sciencebase.gov/catalog/file/get/";

const VOLTLAS_DATA_URL =
    "https://voltlas.com/data/latest.json";

const VOLTLAS_DATA_PAGE =
    "https://voltlas.com/data";

const VOLTLAS_LICENSE_URL =
    "https://creativecommons.org/licenses/by/4.0/";

const EIA_API_BASE =
    "https://api.eia.gov/v2/seriesid/";

const EIA_DATA_PAGE =
    "https://www.eia.gov/opendata/";

const USDA_NASS_DATA_PAGE =
    "https://www.nass.usda.gov/Quick_Stats/";

const USDA_NASS_PRICE_CHART_BASE =
    "https://www.nass.usda.gov/Charts_and_Maps/graphics/data/";

const MAX_COMMODITIES =
    300;


/* =========================================================
   CACHE SETTINGS
========================================================= */

const CACHE_TTL =
    24 * 60 * 60;

const RESULT_CACHE_TTL =
    6 * 60 * 60;

const WORLD_BANK_CACHE_TTL =
    24 * 60 * 60;

const USGS_CACHE_TTL =
    7 * 24 * 60 * 60;

const VOLTLAS_CACHE_TTL =
    6 * 60 * 60;

const EIA_CACHE_TTL =
    2 * 60 * 60;

const USDA_NASS_CACHE_TTL =
    12 * 60 * 60;

const IMAGE_CACHE_TTL =
    7 * 24 * 60 * 60;

const IMAGE_NEGATIVE_CACHE_TTL =
    24 * 60 * 60;

const CACHE_TIMESTAMP_HEADER =
    "X-Worth-It-Cache-Time";

const WORLD_BANK_XLSX_CACHE_KEY =
    "https://worth-it-internal-cache.local/markets-world-bank-monthly-v4.xlsx";

const WORLD_BANK_RESULT_CACHE_KEY =
    "https://worth-it-internal-cache.local/markets-world-bank-v4.json";

const WORLD_BANK_PAGE_CACHE_KEY =
    "https://worth-it-internal-cache.local/markets-world-bank-page-v3";

const VOLTLAS_SOURCE_CACHE_KEY =
    "https://worth-it-internal-cache.local/markets-voltlas-v3.json";

const USGS_SOURCE_CACHE_KEY =
    "https://worth-it-internal-cache.local/markets-usgs-mcs-v2.json";

const USGS_DISCOVERY_CACHE_KEY =
    "https://worth-it-internal-cache.local/markets-usgs-discovery-v2.json";

const EIA_SOURCE_CACHE_PREFIX =
    "https://worth-it-internal-cache.local/markets-eia-series-v3/";

const USDA_NASS_SOURCE_CACHE_KEY =
    "https://worth-it-internal-cache.local/markets-usda-nass-v4.json";

const USDA_NASS_PRICE_FILE_CACHE_PREFIX =
    "https://worth-it-internal-cache.local/markets-usda-nass-price-file-v2/";

const MARKETS_RESULT_CACHE_KEY =
    "https://worth-it-internal-cache.local/markets-multisource-v5.json";


/* =========================================================
   CATEGORY SOURCE MAP

   A source is used only where it actually publishes a suitable
   commodity price/market series. We do not force every source into
   every category when the source does not cover that category.
========================================================= */

const CATEGORY_SOURCE_MAP = {

    "precious-metals": [
        "World Bank Commodity Prices",
        "U.S. Geological Survey, Mineral Commodity Summaries",
        "Voltlas Open Data"
    ],

    "metals-minerals": [
        "World Bank Commodity Prices",
        "U.S. Geological Survey, Mineral Commodity Summaries",
        "Voltlas Open Data"
    ],

    "energy": [
        "World Bank Commodity Prices",
        "U.S. Energy Information Administration",
        "Voltlas Open Data"
    ],

    "fertilizers": [
        "World Bank Commodity Prices",
        "Voltlas Open Data"
    ],

    "agriculture-food": [
        "World Bank Commodity Prices",
        "USDA National Agricultural Statistics Service",
        "Voltlas Open Data"
    ],

    "raw-materials": [
        "World Bank Commodity Prices",
        "USDA National Agricultural Statistics Service",
        "Voltlas Open Data"
    ],

    "other": [
        "World Bank Commodity Prices",
        "U.S. Geological Survey, Mineral Commodity Summaries",
        "U.S. Energy Information Administration",
        "USDA National Agricultural Statistics Service",
        "Voltlas Open Data"
    ]

};

/* =========================================================
   WIKIMEDIA
========================================================= */

const WIKIMEDIA_API =
    "https://commons.wikimedia.org/w/api.php";

const WIKIMEDIA_IMAGE_CACHE_PREFIX =
    "https://worth-it-internal-cache.local/markets-wikimedia-image-v14/";

const MAX_IMAGE_SEARCH_CANDIDATES =
    100;

const IMAGE_SEARCH_PAGE_SIZE =
    20;

const MIN_IMAGE_WIDTH =
    500;

const MIN_IMAGE_HEIGHT =
    250;

const MIN_IMAGE_PIXELS =
    150000;

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


    if (
        unit.includes(
            "$/gallon"
        )
    ) {

        return {

            eurUnit:
                "gallon",

            usUnit:
                "gallon",

            conversion:
                1

        };

    }


    if (
        unit.includes(
            "$/bushel"
        )
    ) {

        return {

            eurUnit:
                "bushel",

            usUnit:
                "bushel",

            conversion:
                1

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
   MULTI-SOURCE DATA HELPERS
========================================================= */

function parseDataNumber(
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
            value ??
            ""
        )
            .replace(
                /,/g,
                ""
            )
            .replace(
                /[$€£]/g,
                ""
            )
            .replace(
                /\(([^)]+)\)/g,
                "$1"
            )
            .trim();


    if (
        !normalized ||
        normalized === ".." ||
        normalized === "…" ||
        normalized === "..." ||
        normalized === "—" ||
        normalized === "-" ||
        /^(d|na|n\/a)$/i.test(normalized)
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


function normalizePriceUnit(
    value
) {

    return normalizeText(
        value
    )
        .replace(
            /\s+/g,
            " "
        )
        .replace(
            /^dollars?\s*per\s*barrel$/i,
            "$/bbl"
        )
        .replace(
            /^dollars?\s*per\s*mmbtu$/i,
            "$/MMBtu"
        )
        .replace(
            /^dollars?\s*per\s*troy\s*ounce$/i,
            "$/troy oz"
        )
        .replace(
            /^dollars?\s*per\s*metric\s*ton$/i,
            "$/mt"
        )
        .replace(
            /^dollars?\s*per\s*dry\s*metric\s*ton$/i,
            "$/dmt"
        )
        .replace(
            /^dollars?\s*per\s*kilogram$/i,
            "$/kg"
        )
        .replace(
            /^dollars?\s*per\s*pound$/i,
            "$/lb"
        )
        .replace(
            /^dollars?\s*per\s*liter$/i,
            "$/liter"
        )
        .replace(
            /^dollars?\s*per\s*gallon$/i,
            "$/gallon"
        )
        .replace(
            /^dollars?\s*per\s*bushel$/i,
            "$/bushel"
        )
        .trim();
}


function periodToDate(
    value
) {

    const text =
        normalizeText(
            value
        );


    const isoDailyPeriod =
        text.match(
            /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/
        );


    if (
        isoDailyPeriod
    ) {

        const year =
            Number(
                isoDailyPeriod[1]
            );

        const month =
            Number(
                isoDailyPeriod[2]
            );

        const day =
            Number(
                isoDailyPeriod[3]
            );


        if (
            year >= 1900 &&
            month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= 31
        ) {

            const timestamp =
                Date.UTC(
                    year,
                    month - 1,
                    day
                );

            return {

                period:
                    `${year}M${String(month).padStart(2, "0")}`,

                timestamp

            };

        }

    }


    const monthPeriod =
        text.match(
            /^(\d{4})[-\/]?(\d{1,2})$/
        );


    if (
        monthPeriod
    ) {

        const year =
            Number(
                monthPeriod[1]
            );

        const month =
            Number(
                monthPeriod[2]
            );


        if (
            year >= 1900 &&
            month >= 1 &&
            month <= 12
        ) {

            return {
                period:
                    `${year}M${String(month).padStart(2, "0")}`,
                timestamp:
                    Date.UTC(
                        year,
                        month - 1,
                        1
                    )
            };

        }

    }


    const yearPeriod =
        text.match(
            /^(\d{4})$/
        );


    if (
        yearPeriod
    ) {

        const year =
            Number(
                yearPeriod[1]
            );


        if (
            year >= 1900
        ) {

            return {
                period:
                    String(year),
                timestamp:
                    Date.UTC(
                        year,
                        11,
                        31
                    )
            };

        }

    }


    const dailyPeriod =
        text.match(
            /^(\d{4})(\d{2})(\d{2})$/
        );


    if (
        dailyPeriod
    ) {

        const year =
            Number(
                dailyPeriod[1]
            );

        const month =
            Number(
                dailyPeriod[2]
            );

        const day =
            Number(
                dailyPeriod[3]
            );


        if (
            year >= 1900 &&
            month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= 31
        ) {

            return {
                period:
                    `${year}M${String(month).padStart(2, "0")}`,
                timestamp:
                    Date.UTC(
                        year,
                        month - 1,
                        day
                    )
            };

        }

    }


    return null;
}


function getNassPeriodInfo(
    yearValue,
    referencePeriod
) {

    const year =
        Number(
            yearValue
        );

    if (
        !Number.isFinite(year) ||
        year < 1900
    ) {
        return null;
    }

    const text =
        normalizeSearchText(
            referencePeriod
        );

    const monthMap = {
        jan: 1,
        january: 1,
        feb: 2,
        february: 2,
        mar: 3,
        march: 3,
        apr: 4,
        april: 4,
        may: 5,
        jun: 6,
        june: 6,
        jul: 7,
        july: 7,
        aug: 8,
        august: 8,
        sep: 9,
        september: 9,
        oct: 10,
        october: 10,
        nov: 11,
        november: 11,
        dec: 12,
        december: 12
    };

    const monthKey = Object.keys(monthMap).find(
        key => new RegExp(`\\b${key}\\b`).test(text)
    );

    if (monthKey) {
        const month = monthMap[monthKey];
        return {
            period:
                `${year}M${String(month).padStart(2, "0")}`,
            timestamp:
                Date.UTC(
                    year,
                    month - 1,
                    1
                )
        };
    }

    return {
        period:
            String(year),
        timestamp:
            Date.UTC(
                year,
                11,
                31
            )
    };
}


function getCanonicalDisplayName(
    name
) {

    return normalizeText(
        name
    )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


function makeCommodityRecord(
    {
        codePrefix,
        name,
        category,
        sourceUnit,
        price,
        previousPrice,
        change,
        period,
        source,
        sourceUrl,
        license,
        licenseUrl,
        attribution,
        extra = {}
    }
) {

    const displayUnit =
        normalizePriceUnit(
            sourceUnit
        );


    const parsedPeriod =
        period?.timestamp
            ? period
            : periodToDate(
                period?.period ||
                period
            );


    if (
        !name ||
        !displayUnit ||
        !Number.isFinite(
            Number(price)
        )
    ) {

        return null;

    }


    const safeName =
        getCanonicalDisplayName(
            name
        );


    return {

        code:
            `${codePrefix}_${simplifySearchText(safeName).slice(0, 70).toUpperCase()}`,

        name:
            safeName,

        category,

        category_label:
            categoryLabel(
                category
            ),

        source_unit:
            displayUnit,

        price:
            Number(
                price
            ),

        previous_price:
            Number.isFinite(
                Number(previousPrice)
            )
                ? Number(previousPrice)
                : null,

        changes: {

            monthly: {

                percent:
                    Number.isFinite(
                        Number(change)
                    )
                        ? Number(change)
                        : null

            }

        },

        updated_at:
            parsedPeriod
                ? new Date(
                    parsedPeriod.timestamp
                ).toISOString()
                : null,

        data_period:
            parsedPeriod
                ? parsedPeriod.period
                : null,

        previous_period:
            null,

        display:
            getDisplaySpec(
                displayUnit,
                category
            ),

        source,

        source_url:
            sourceUrl,

        license:
            license ||
            null,

        license_url:
            licenseUrl ||
            null,

        attribution:
            attribution ||
            null,

        ...extra

    };
}


/* =========================================================
   WORLD BANK WRAPPER

   The original World Bank XLSX discovery/parser remains intact.
========================================================= */

async function loadWorldBankMultiSourceDataset(
    cache
) {

    const workbook =
        await loadWorldBankWorkbook(
            cache
        );


    const dataset =
        await parseWorldBankDataset(
            workbook.bytes
        );


    return {

        ...dataset,

        license:
            dataset.license ||
            "CC BY 4.0",

        license_url:
            dataset.license_url ||
            WORLD_BANK_LICENSE_URL,

        attribution:
            dataset.attribution ||
            "Data: World Bank Commodity Markets, CC BY 4.0",

        configured:
            true

    };
}


/* =========================================================
   VOLTLAS
========================================================= */

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
            VOLTLAS_CACHE_TTL
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
                        WIKIMEDIA_USER_AGENT

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
        VOLTLAS_CACHE_TTL
    );
}


async function loadVoltlasDataset(
    cache
) {

    const response =
        await fetchVoltlasSource(
            cache
        );


    const payload =
        await response.json();


    const sourceItems =
        Array.isArray(
            payload?.COMMODITIES
        )
            ? payload.COMMODITIES
            : [];


    const prices = [];

    const seen = new Set();


    for (
        const item of sourceItems
    ) {

        const name =
            normalizeText(
                item?.name
            );

        const price =
            parseDataNumber(
                item?.price
            );

        const unit =
            normalizePriceUnit(
                item?.unit
            );

        const period =
            periodToDate(
                item?.period
            );


        if (
            !name ||
            price === null ||
            !unit
        ) {
            continue;
        }


        const key =
            canonicalCommodityKey(
                name
            );


        if (
            !key ||
            seen.has(key)
        ) {
            continue;
        }


        seen.add(key);


        const category =
            mapVoltlasCategory(
                item
            );


        const change =
            parseDataNumber(
                item?.chg
            );


        const record =
            makeCommodityRecord({

                codePrefix:
                    "VOLT",

                name,

                category,

                sourceUnit:
                    unit,

                price,

                previousPrice:
                    null,

                change,

                period,

                source:
                    "Voltlas Open Data",

                sourceUrl:
                    VOLTLAS_DATA_PAGE,

                license:
                    "CC BY 4.0",

                licenseUrl:
                    VOLTLAS_LICENSE_URL,

                attribution:
                    "Data: Voltlas (https://voltlas.com), CC BY 4.0",

                extra: {

                    voltlas_category:
                        normalizeText(
                            item?.cat
                        ) ||
                        null

                }

            });


        if (
            record
        ) {

            prices.push(
                record
            );

        }

    }


    if (
        !prices.length
    ) {

        throw new Error(
            "Voltlas latest.json contained no usable commodity series."
        );

    }


    return {

        prices,

        source:
            "Voltlas Open Data",

        source_url:
            VOLTLAS_DATA_PAGE,

        license:
            "CC BY 4.0",

        license_url:
            VOLTLAS_LICENSE_URL,

        attribution:
            "Data: Voltlas (https://voltlas.com), CC BY 4.0"

    };
}


/* =========================================================
   USGS — CURRENT RELEASE DISCOVERY
========================================================= */

async function getUSGSReleaseInfoMultiSource(
    cache
) {

    const key =
        new Request(
            USGS_DISCOVERY_CACHE_KEY
        );


    const cached =
        await getFreshCache(
            cache,
            key,
            USGS_CACHE_TTL
        );


    if (
        cached
    ) {

        return cached.json();

    }


    const pageResponse =
        await fetch(
            USGS_DATA_PAGE,
            {
                headers: {
                    "Accept":
                        "text/html,application/xhtml+xml",
                    "User-Agent":
                        WIKIMEDIA_USER_AGENT
                }
            }
        );


    if (
        !pageResponse.ok
    ) {

        throw new Error(
            `USGS NMIC data page failed with status ${pageResponse.status}.`
        );

    }


    const html =
        await pageResponse.text();


    const releaseMatch =
        html.match(
            /Mineral Commodity Summaries\s+(\d{4})\s+Data Release/i
        );


    if (
        !releaseMatch
    ) {

        throw new Error(
            "Unable to discover current USGS MCS release year."
        );

    }


    const year =
        Number(
            releaseMatch[1]
        );


    const releasePage =
        `https://www.usgs.gov/data/mineral-commodity-summaries-${year}-data-release`;


    const releaseResponse =
        await fetch(
            releasePage,
            {
                headers: {
                    "Accept":
                        "text/html,application/xhtml+xml",
                    "User-Agent":
                        WIKIMEDIA_USER_AGENT
                }
            }
        );


    if (
        !releaseResponse.ok
    ) {

        throw new Error(
            `USGS release page failed with status ${releaseResponse.status}.`
        );

    }


    const releaseHtml =
        await releaseResponse.text();


    const doiMatch =
        releaseHtml.match(
            /https:\/\/doi\.org\/(10\.5066\/[A-Z0-9]+)/i
        );


    const doi =
        doiMatch?.[1] ||
        null;


    let scienceBaseItemId =
        null;


    const directScienceBaseMatch =
        releaseHtml.match(
            /sciencebase\.gov\/catalog\/(?:item|file)\/(?:get\/)?([a-f0-9]{24})/i
        );


    scienceBaseItemId =
        directScienceBaseMatch?.[1] ||
        null;


    try {

        if (
            doi
        ) {

            const doiResponse =
                await fetch(
                    `https://doi.org/${doi}`,
                    {
                        redirect:
                            "follow",
                        headers: {
                            "Accept":
                                "text/html,application/xhtml+xml",
                            "User-Agent":
                                WIKIMEDIA_USER_AGENT
                        }
                    }
                );


            const finalUrl =
                doiResponse.url ||
                "";

            const finalHtml =
                await doiResponse.text();


            const itemIdMatch =
                `${finalUrl}\n${finalHtml}`.match(
                    /sciencebase\.gov\/catalog\/(?:item|file)\/([a-f0-9]{24})/i
                );


            scienceBaseItemId =
                itemIdMatch?.[1] ||
                null;

        }

    }
    catch (error) {

        console.warn(
            "USGS ScienceBase item discovery failed:",
            error
        );

    }


    if (
        !scienceBaseItemId &&
        year === 2026
    ) {

        scienceBaseItemId =
            "696a75d5d4be0228872d3bf8";

    }


    if (
        !scienceBaseItemId
    ) {

        throw new Error(
            "Unable to discover current USGS ScienceBase item ID."
        );

    }


    const fileName =
        `MCS${year}_Commodities_Data.csv`;


    const fileUrl =
        `${USGS_SCIENCEBASE_FILE_PREFIX}${scienceBaseItemId}?name=${encodeURIComponent(fileName)}`;


    const result = {

        year,

        doi,

        releasePage,

        scienceBaseItemId,

        fileName,

        fileUrl,

        source:
            `U.S. Geological Survey, Mineral Commodity Summaries`,

        license:
            "CC0 1.0",

        license_url:
            USGS_LICENSE_URL,

        attribution:
            `Data: U.S. Geological Survey, Mineral Commodity Summaries ${year}, CC0 1.0`

    };


    await putTimestampedCache(
        cache,
        key,
        new Response(
            JSON.stringify(
                result
            ),
            {
                status:
                    200,
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        ),
        USGS_CACHE_TTL
    );


    return result;
}


function parseCSVText(
    text
) {

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;


    for (
        let i = 0;
        i < text.length;
        i += 1
    ) {

        const char =
            text[i];


        if (
            inQuotes
        ) {

            if (
                char === '"'
            ) {

                if (
                    text[i + 1] === '"'
                ) {

                    field += '"';
                    i += 1;

                }
                else {

                    inQuotes =
                        false;

                }

            }
            else {

                field +=
                    char;

            }

            continue;

        }


        if (
            char === '"'
        ) {

            inQuotes =
                true;

        }
        else if (
            char === ","
        ) {

            row.push(
                field
            );
            field =
                "";

        }
        else if (
            char === "\n"
        ) {

            row.push(
                field.replace(
                    /\r$/,
                    ""
                )
            );

            rows.push(
                row
            );

            row = [];
            field =
                "";

        }
        else {

            field +=
                char;

        }

    }


    if (
        field.length ||
        row.length
    ) {

        row.push(
            field.replace(
                /\r$/,
                ""
            )
        );

        rows.push(
            row
        );

    }


    return rows;
}


async function fetchUSGSMultiSourceCSV(
    cache,
    release
) {

    const key =
        new Request(
            USGS_SOURCE_CACHE_KEY
        );


    const cached =
        await getFreshCache(
            cache,
            key,
            USGS_CACHE_TTL
        );


    if (
        cached
    ) {

        return cached;

    }


    const response =
        await fetch(
            release.fileUrl,
            {
                headers: {
                    "Accept":
                        "text/csv,text/plain,*/*",
                    "User-Agent":
                        WIKIMEDIA_USER_AGENT
                }
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `USGS commodity CSV failed with status ${response.status}.`
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
        USGS_CACHE_TTL
    );
}


async function loadUSGSDatasetMultiSource(
    cache
) {

    const release =
        await getUSGSReleaseInfoMultiSource(
            cache
        );


    const response =
        await fetchUSGSMultiSourceCSV(
            cache,
            release
        );


    const buffer =
        await response.arrayBuffer();


    const text =
        new TextDecoder(
            "windows-1252"
        ).decode(
            buffer
        );


    const rows =
        parseCSVText(
            text
        );


    if (
        rows.length < 2
    ) {

        throw new Error(
            "USGS commodity CSV is empty."
        );

    }


    const headers =
        rows[0].map(
            value =>
                normalizeSearchText(
                    value
                )
        );


    const headerMap = {
        commodity:
            headers.findIndex(
                value =>
                    value ===
                    "commodity"
            ),
        country:
            headers.findIndex(
                value =>
                    value ===
                    "country"
            ),
        statistics:
            headers.findIndex(
                value =>
                    value ===
                    "statistics"
            ),
        statisticsDetail:
            headers.findIndex(
                value =>
                    value ===
                    "statistics detail"
            ),
        unit:
            headers.findIndex(
                value =>
                    value ===
                    "unit"
            ),
        year:
            headers.findIndex(
                value =>
                    value ===
                    "year"
            ),
        value:
            headers.findIndex(
                value =>
                    value ===
                    "value"
            ),
        notes:
            headers.findIndex(
                value =>
                    value ===
                    "notes"
            )
    };


    if (
        headerMap.commodity < 0 ||
        headerMap.statistics < 0 ||
        headerMap.year < 0 ||
        headerMap.value < 0 ||
        headerMap.unit < 0
    ) {

        throw new Error(
            "USGS CSV header layout is not recognized."
        );

    }


    const candidateMap =
        new Map();


    for (
        let i = 1;
        i < rows.length;
        i += 1
    ) {

        const row =
            rows[i];

        const commodity =
            normalizeText(
                row[
                    headerMap.commodity
                ]
            );

        const statistics =
            normalizeText(
                row[
                    headerMap.statistics
                ]
            );

        const statisticsDetail =
            normalizeText(
                row[
                    headerMap.statisticsDetail
                ]
            );

        const unit =
            normalizeText(
                row[
                    headerMap.unit
                ]
            );

        const year =
            Number(
                normalizeText(
                    row[
                        headerMap.year
                    ]
                )
            );

        const value =
            parseDataNumber(
                row[
                    headerMap.value
                ]
            );

        const country =
            headerMap.country >= 0
                ? normalizeText(
                    row[
                        headerMap.country
                    ]
                )
                : "";

        const notes =
            headerMap.notes >= 0
                ? normalizeText(
                    row[
                        headerMap.notes
                    ]
                )
                : "";


        if (
            !commodity ||
            value === null ||
            !Number.isFinite(year) ||
            !/price/i.test(
                `${statistics} ${statisticsDetail}`
            )
        ) {
            continue;
        }


        const normalizedUnit =
            normalizePriceUnit(
                unit
            );


        if (
            !normalizedUnit ||
            !/\$|dollar|cent|pound|kilogram|metric ton|ounce|barrel|carat|liter|cubic/i.test(
                normalizedUnit
            )
        ) {
            continue;
        }


        const key =
            canonicalCommodityKey(
                commodity
            );


        if (
            !key
        ) {
            continue;
        }


        const previous =
            candidateMap.get(
                key
            );


        const candidate = {
            commodity,
            unit: normalizedUnit,
            value,
            year,
            country,
            notes,
            statistics,
            statisticsDetail
        };


        if (
            !previous ||
            year > previous.year ||
            (
                year === previous.year &&
                /\bunited states\b/i.test(country) &&
                !/\bunited states\b/i.test(previous.country || "")
            )
        ) {

            candidateMap.set(
                key,
                candidate
            );

        }

    }


    const prices = [];


    for (
        const candidate of
            candidateMap.values()
    ) {

        const category =
            categorizeCommodity(
                candidate.commodity
            );


        const record =
            makeCommodityRecord({

                codePrefix:
                    "USGS",

                name:
                    candidate.commodity,

                category,

                sourceUnit:
                    candidate.unit,

                price:
                    candidate.value,

                previousPrice:
                    null,

                change:
                    null,

                period:
                    periodToDate(
                        String(
                            candidate.year
                        )
                    ),

                source:
                    `U.S. Geological Survey, Mineral Commodity Summaries`,

                sourceUrl:
                    release.releasePage,

                license:
                    "CC0 1.0",

                licenseUrl:
                    USGS_LICENSE_URL,

                attribution:
                    release.attribution,

                extra: {
                    usgs_country:
                        candidate.country || null,
                    usgs_statistics:
                        candidate.statistics || null,
                    usgs_statistics_detail:
                        candidate.statisticsDetail || null,
                    usgs_notes:
                        candidate.notes || null,
                    usgs_release_year:
                        release.year
                }

            });


        if (
            record
        ) {

            prices.push(
                record
            );

        }

    }


    if (
        !prices.length
    ) {

        throw new Error(
            "USGS MCS contained no usable mineral price series."
        );

    }


    return {

        prices,

        source:
            "U.S. Geological Survey, Mineral Commodity Summaries",

        source_url:
            release.releasePage,

        license:
            "CC0 1.0",

        license_url:
            USGS_LICENSE_URL,

        attribution:
            release.attribution,

        release_year:
            release.year,

        release_doi:
            release.doi

    };
}


/* =========================================================
   EIA

   EIA's current API requires a user API key. Worth It reads only
   a small set of energy price series, keeping calls low and the
   key server-side in Cloudflare.
========================================================= */

const EIA_PRICE_SERIES = [

    {
        id:
            "PET.RWTC.D",
        name:
            "WTI Crude Oil",
        unit:
            "$/bbl"
    },

    {
        id:
            "PET.RBRTE.D",
        name:
            "Brent Crude Oil",
        unit:
            "$/bbl"
    },

    {
        id:
            "NG.RNGWHHD.D",
        name:
            "Natural Gas, U.S. Henry Hub",
        unit:
            "$/MMBtu"
    },

    {
        id:
            "PET.EMM_EPM0_PTE_NUS_DPG.W",
        name:
            "Gasoline, U.S. All Grades",
        unit:
            "$/gallon"
    },

    {
        id:
            "PET.EMD_EPD2D_PTE_NUS_DPG.W",
        name:
            "Diesel, U.S. No. 2",
        unit:
            "$/gallon"
    },

    {
        id:
            "PET.EMD_EPD2DXL0_PTE_NUS_DPG.W",
        name:
            "Diesel, U.S. Ultra Low Sulfur",
        unit:
            "$/gallon"
    }

];


async function loadEIASeries(
    cache,
    env,
    seriesInfo
) {

    const key =
        new Request(
            `${EIA_SOURCE_CACHE_PREFIX}${encodeURIComponent(seriesInfo.id)}.json`
        );


    const cached =
        await getFreshCache(
            cache,
            key,
            EIA_CACHE_TTL
        );


    if (
        cached
    ) {

        return cached.json();

    }


    const apiKey =
        String(
            env?.EIA_API_KEY ||
            ""
        ).trim();


    if (
        !apiKey
    ) {

        return {
            configured:
                false,
            series:
                seriesInfo,
            data:
                []
        };

    }


    const url =
        new URL(
            `${EIA_API_BASE}${encodeURIComponent(seriesInfo.id)}`
        );


    url.searchParams.set(
        "api_key",
        apiKey
    );

    url.searchParams.set(
        "length",
        "2"
    );


    const response =
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


    if (
        !response.ok
    ) {

        throw new Error(
            `EIA series ${seriesInfo.id} failed with status ${response.status}.`
        );

    }


    const payload =
        await response.json();

    const root =
        payload?.response ||
        payload;

    const rows =
        Array.isArray(
            root?.data
        )
            ? root.data
            : [];


    const result = {
        configured:
            true,
        series:
            seriesInfo,
        data:
            rows
    };


    await putTimestampedCache(
        cache,
        key,
        new Response(
            JSON.stringify(
                result
            ),
            {
                status:
                    200,
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        ),
        EIA_CACHE_TTL
    );


    return result;
}


async function loadEIADataset(
    cache,
    env
) {

    const apiKey =
        String(
            env?.EIA_API_KEY ||
            ""
        ).trim();


    if (
        !apiKey
    ) {

        return {

            prices: [],

            source:
                "U.S. Energy Information Administration",

            source_url:
                EIA_DATA_PAGE,

            license:
                "Public domain",

            license_url:
                "https://www.eia.gov/about/copyrights_reuse.php",

            attribution:
                "Source: U.S. Energy Information Administration",

            configured:
                false

        };

    }


    const results =
        await Promise.all(
            EIA_PRICE_SERIES.map(
                seriesInfo =>
                    loadEIASeries(
                        cache,
                        env,
                        seriesInfo
                    )
            )
        );


    const prices = [];


    for (
        const result of
            results
    ) {

        const rows =
            Array.isArray(
                result?.data
            )
                ? result.data
                : [];


        if (
            !rows.length
        ) {
            continue;
        }


        const sorted =
            [...rows].sort(
                (a, b) =>
                    String(
                        a?.period ||
                        ""
                    ).localeCompare(
                        String(
                            b?.period ||
                            ""
                        )
                    )
            );


        const latest =
            sorted[
                sorted.length - 1
            ];

        const previous =
            sorted.length > 1
                ? sorted[
                    sorted.length - 2
                ]
                : null;

        const price =
            parseDataNumber(
                latest?.value
            );

        const previousPrice =
            parseDataNumber(
                previous?.value
            );


        if (
            price === null
        ) {
            continue;
        }


        const parsedPeriod =
            periodToDate(
                latest?.period
            );


        const previousParsedPeriod =
            periodToDate(
                previous?.period
            );


        const change =
            previousPrice !== null &&
            previousPrice !== 0
                ? (
                    (price - previousPrice) /
                    previousPrice
                ) * 100
                : null;


        const record =
            makeCommodityRecord({

                codePrefix:
                    "EIA",

                name:
                    result.series.name,

                category:
                    "energy",

                sourceUnit:
                    result.series.unit,

                price,

                previousPrice,

                change,

                period:
                    parsedPeriod,

                source:
                    "U.S. Energy Information Administration",

                sourceUrl:
                    EIA_DATA_PAGE,

                license:
                    "Public domain",

                licenseUrl:
                    "https://www.eia.gov/about/copyrights_reuse.php",

                attribution:
                    "Source: U.S. Energy Information Administration",

                extra: {
                    eia_series_id:
                        result.series.id,
                    eia_previous_period:
                        previousParsedPeriod
                            ? previousParsedPeriod.period
                            : null
                }

            });


        if (
            record
        ) {

            prices.push(
                record
            );

        }

    }


    return {

        prices,

        source:
            "U.S. Energy Information Administration",

        source_url:
            EIA_DATA_PAGE,

        license:
            "Public domain",

        license_url:
            "https://www.eia.gov/about/copyrights_reuse.php",

        attribution:
            "Source: U.S. Energy Information Administration",

        configured:
            true

    };
}


/* =========================================================
   USDA NASS

   Public NASS chart data files

   NASS states that most information on its site is public domain
   and may be freely downloaded and reproduced with appropriate
   USDA-NASS acknowledgment.

   The public Quick Stats page also exposes downloadable Quick Stats
   files and public chart data. Worth It uses the small public text
   data files behind the official Prices Received charts rather than
   the Quick Stats API, so no USDA API key is required.

   Current public files used here:

     /Charts_and_Maps/graphics/data/pricecn.txt  -> Corn
     /Charts_and_Maps/graphics/data/pricect.txt  -> Upland Cotton
     /Charts_and_Maps/graphics/data/pricehg.txt  -> Hogs
     /Charts_and_Maps/graphics/data/pricemk.txt  -> Milk
     /Charts_and_Maps/graphics/data/pricesb.txt  -> Soybeans
     /Charts_and_Maps/graphics/data/pricewh.txt  -> Wheat
     /Charts_and_Maps/graphics/data/priceca.txt  -> Cattle group
     /Charts_and_Maps/graphics/data/pricetb.txt  -> Broilers/Turkeys

   These files are intentionally small and public. Each file is
   fetched independently, cached, and parsed into the same normalized
   Worth It commodity record used by the other sources.
========================================================= */

const USDA_NASS_PUBLIC_PRICE_FILES = [

    {
        file:
            "pricecn.txt",

        name:
            "Corn",

        pageUrl:
            "https://www.nass.usda.gov/Charts_and_Maps/Agricultural_Prices/pricecn.php",

        unit:
            "$/bushel",

        category:
            "agriculture-food"
    },

    {
        file:
            "pricect.txt",

        name:
            "Upland Cotton",

        pageUrl:
            "https://www.nass.usda.gov/Charts_and_Maps/Agricultural_Prices/pricect.php",

        unit:
            "$/lb",

        category:
            "agriculture-food"
    },

    {
        file:
            "pricehg.txt",

        name:
            "Hogs",

        pageUrl:
            "https://www.nass.usda.gov/Charts_and_Maps/Agricultural_Prices/pricehg.php",

        unit:
            "$/cwt",

        category:
            "agriculture-food"
    },

    {
        file:
            "pricemk.txt",

        name:
            "Milk",

        pageUrl:
            "https://www.nass.usda.gov/Charts_and_Maps/Agricultural_Prices/pricemk.php",

        unit:
            "$/cwt",

        category:
            "agriculture-food"
    },

    {
        file:
            "pricesb.txt",

        name:
            "Soybeans",

        pageUrl:
            "https://www.nass.usda.gov/Charts_and_Maps/Agricultural_Prices/pricesb.php",

        unit:
            "$/bushel",

        category:
            "agriculture-food"
    },

    {
        file:
            "pricewh.txt",

        name:
            "All Wheat",

        pageUrl:
            "https://www.nass.usda.gov/Charts_and_Maps/Agricultural_Prices/pricewh.php",

        unit:
            "$/bushel",

        category:
            "agriculture-food"
    },

    {
        file:
            "priceca.txt",

        names:
            [
                "All Beef Cattle",
                "Calves",
                "Cows",
                "Steers & Heifers"
            ],

        pageUrl:
            "https://www.nass.usda.gov/Charts_and_Maps/Agricultural_Prices/priceca.php",

        unit:
            "$/cwt",

        category:
            "agriculture-food"
    },

    {
        file:
            "pricetb.txt",

        names:
            [
                "Broilers",
                "Turkeys"
            ],

        pageUrl:
            "https://www.nass.usda.gov/Charts_and_Maps/Agricultural_Prices/pricetb.php",

        unit:
            "$/lb",

        category:
            "agriculture-food"
    }
];


const USDA_NASS_MONTHS = {

    january:
        1,

    february:
        2,

    march:
        3,

    april:
        4,

    may:
        5,

    june:
        6,

    july:
        7,

    august:
        8,

    september:
        9,

    october:
        10,

    november:
        11,

    december:
        12
};


function getNassMonthNumber(
    monthName
) {

    return (
        USDA_NASS_MONTHS[
            normalizeSearchText(
                monthName
            )
        ] ||
        null
    );
}


function getNassChartPeriod(
    year,
    monthName
) {

    const numericYear =
        Number(
            year
        );

    const month =
        getNassMonthNumber(
            monthName
        );


    if (
        !Number.isInteger(
            numericYear
        ) ||
        numericYear < 1900 ||
        !month
    ) {

        return null;

    }


    const timestamp =
        Date.UTC(
            numericYear,
            month - 1,
            1
        );


    return {

        period:
            `${numericYear}M${String(month).padStart(2, "0")}`,

        year:
            numericYear,

        month,

        timestamp
    };
}


function parseNassChartRows(
    text,
    columnCount
) {

    const rows =
        String(
            text ||
            ""
        )
            .split(/\r?\n/);


    const observations = [];

    let currentYear =
        null;


    for (
        const rawLine of
            rows
    ) {

        const line =
            String(
                rawLine ||
                ""
            );


        const match =
            line.match(
                /^\s*(?:(\d{4})\s+)?([A-Za-z]+)\s+[^:]*:\s*(.*)$/
            );


        if (
            !match
        ) {

            continue;

        }


        if (
            match[1]
        ) {

            currentYear =
                Number(
                    match[1]
                );

        }


        if (
            !currentYear
        ) {

            continue;

        }


        const period =
            getNassChartPeriod(
                currentYear,
                match[2]
            );


        if (
            !period
        ) {

            continue;

        }


        const valueTokens =
            String(
                match[3] ||
                ""
            )
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(
                    0,
                    Math.max(
                        1,
                        columnCount
                    )
                );


        const values =
            valueTokens.map(
                token =>
                    parseDataNumber(
                        token
                    )
            );


        while (
            values.length <
            columnCount
        ) {

            values.push(
                null
            );

        }


        observations.push({

            period,

            values
        });

    }


    return observations
        .sort(
            (a, b) =>
                a.period.timestamp -
                b.period.timestamp
        );
}


async function fetchNassPublicPriceFile(
    cache,
    definition
) {

    const url =
        `${USDA_NASS_PRICE_CHART_BASE}${encodeURIComponent(definition.file)}`;


    const key =
        new Request(
            `${USDA_NASS_PRICE_FILE_CACHE_PREFIX}${encodeURIComponent(definition.file)}`
        );


    const cached =
        await getFreshCache(
            cache,
            key,
            USDA_NASS_CACHE_TTL
        );


    if (
        cached
    ) {

        return cached.text();

    }


    const response =
        await fetch(
            url,
            {
                headers: {

                    "Accept":
                        "text/plain,text/*;q=0.9,*/*;q=0.8",

                    "User-Agent":
                        WIKIMEDIA_USER_AGENT
                }
            }
        );


    if (
        !response.ok
    ) {

        throw new Error(
            `NASS public price file ${definition.file} failed with status ${response.status}.`
        );

    }


    const text =
        await response.text();


    await putTimestampedCache(
        cache,
        key,
        new Response(
            text,
            {
                status:
                    200,

                headers: {

                    "Content-Type":
                        "text/plain; charset=UTF-8"
                }
            }
        ),
        USDA_NASS_CACHE_TTL
    );


    return text;
}


async function loadUSDANASSDataset(
    cache
) {

    const prices = [];
    const errors = [];
    const files = [];


    const results =
        await Promise.allSettled(
            USDA_NASS_PUBLIC_PRICE_FILES.map(
                definition =>
                    fetchNassPublicPriceFile(
                        cache,
                        definition
                    )
                        .then(
                            text => ({

                                definition,

                                text
                            })
                        )
            )
        );


    for (
        const result of
            results
    ) {

        if (
            result.status !==
            "fulfilled"
        ) {

            errors.push(
                result.reason?.message ||
                String(
                    result.reason
                )
            );

            continue;

        }


        const definition =
            result.value.definition;

        const text =
            result.value.text;

        const seriesNames =
            Array.isArray(
                definition.names
            )
                ? definition.names
                : [
                    definition.name
                ];

        const observations =
            parseNassChartRows(
                text,
                seriesNames.length
            );


        if (
            !observations.length
        ) {

            errors.push(
                `NASS public price file ${definition.file} contained no recognizable monthly observations.`
            );

            continue;

        }


        files.push({

            file:
                definition.file,

            page_url:
                definition.pageUrl,

            data_url:
                `${USDA_NASS_PRICE_CHART_BASE}${definition.file}`,

            latest_period:
                observations[
                    observations.length - 1
                ].period.period
        });


        for (
            let columnIndex = 0;
            columnIndex <
                seriesNames.length;
            columnIndex += 1
        ) {

            const series =
                observations
                    .filter(
                        observation =>
                            observation.values[
                                columnIndex
                            ] !== null
                    );


            if (
                !series.length
            ) {

                continue;

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

            const price =
                latest.values[
                    columnIndex
                ];

            const previousPrice =
                previous
                    ? previous.values[
                        columnIndex
                    ]
                    : null;


            const change =
                previousPrice !== null &&
                previousPrice !== 0
                    ? (
                        (price - previousPrice) /
                        previousPrice
                    ) * 100
                    : null;

            const record =
                makeCommodityRecord({

                    codePrefix:
                        "NASS",

                    name:
                        seriesNames[
                            columnIndex
                        ],

                    category:
                        definition.category,

                    sourceUnit:
                        definition.unit,

                    price,

                    previousPrice,

                    change,

                    period:
                        latest.period,

                    source:
                        "USDA National Agricultural Statistics Service",

                    sourceUrl:
                        definition.pageUrl,

                    license:
                        "Public domain",

                    licenseUrl:
                        "https://www.nass.usda.gov/Data_and_Statistics/Citation_Request/",

                    attribution:
                        "Source: USDA National Agricultural Statistics Service (NASS)",

                    extra: {

                        usda_data_file:
                            `${USDA_NASS_PRICE_CHART_BASE}${definition.file}`,

                        usda_chart:
                            definition.pageUrl
                    }
                });


            if (
                record
            ) {

                prices.push(
                    record
                );

            }

        }

    }


    return {

        prices,

        source:
            "USDA National Agricultural Statistics Service",

        source_url:
            USDA_NASS_DATA_PAGE,

        license:
            "Public domain",

        license_url:
            "https://www.nass.usda.gov/Data_and_Statistics/Citation_Request/",

        attribution:
            "Source: USDA National Agricultural Statistics Service (NASS)",

        configured:
            true,

        public_files:
            files,

        errors
    };
}


/* =========================================================
   COMMODITY DEDUPLICATION
========================================================= */

const COMMODITY_ALIASES = new Map([

    [
        "aluminium",
        "aluminum"
    ],

    [
        "maize",
        "corn"
    ],

    [
        "corn maize",
        "corn"
    ],

    [
        "soy bean",
        "soybean"
    ],

    [
        "soy beans",
        "soybeans"
    ],

    [
        "brent crude",
        "crude oil brent"
    ],

    [
        "brent crude oil",
        "crude oil brent"
    ],

    [
        "wti crude",
        "crude oil wti"
    ],

    [
        "wti crude oil",
        "crude oil wti"
    ],

    [
        "iron ore cfr spot",
        "iron ore"
    ],

    [
        "gold london",
        "gold"
    ],

    [
        "gold uk",
        "gold"
    ],

    [
        "natural gas us",
        "natural gas u s"
    ],

    [
        "natural gas u s",
        "natural gas u s"
    ]

]);


function canonicalCommodityKey(
    name
) {

    let value =
        normalizeSearchText(
            name
        )
            .replace(
                /\bcommodity\b/g,
                ""
            )
            .replace(
                /\bprice(s)?\b/g,
                ""
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();


    if (
        !value
    ) {

        return "";

    }


    value =
        COMMODITY_ALIASES.get(
            value
        ) ||
        value;


    if (
        /^crude oil brent\b/.test(
            value
        ) ||
        /^brent crude oil\b/.test(
            value
        )
    ) {

        value =
            "crude oil brent";

    }


    if (
        /^crude oil wti\b/.test(
            value
        ) ||
        /^wti crude oil\b/.test(
            value
        )
    ) {

        value =
            "crude oil wti";

    }


    return value;
}


function getRecordPeriodTimestamp(
    record
) {

    const period =
        periodToDate(
            record?.data_period
        );


    return period?.timestamp ||
        (
            record?.updated_at
                ? Date.parse(
                    record.updated_at
                )
                : 0
        ) ||
        0;
}


function sourcePriority(
    source
) {

    const value =
        normalizeSearchText(
            source
        );


    if (
        value.includes(
            "energy information administration"
        )
    ) {

        return 500;

    }


    if (
        value.includes(
            "national agricultural statistics service"
        )
    ) {

        return 450;

    }


    if (
        value.includes(
            "world bank"
        )
    ) {

        return 400;

    }


    if (
        value.includes(
            "geological survey"
        ) ||
        value.includes(
            "usgs"
        )
    ) {

        return 350;

    }


    if (
        value.includes(
            "voltlas"
        )
    ) {

        return 300;

    }


    return 100;
}


function recordsShouldReplace(
    existing,
    candidate
) {

    const existingTimestamp =
        getRecordPeriodTimestamp(
            existing
        );


    const candidateTimestamp =
        getRecordPeriodTimestamp(
            candidate
        );


    if (
        candidateTimestamp !==
        existingTimestamp
    ) {

        return candidateTimestamp >
            existingTimestamp;

    }


    const candidateSourcePriority =
        sourcePriority(
            candidate.source
        );


    const existingSourcePriority =
        sourcePriority(
            existing.source
        );


    if (
        candidateSourcePriority !==
        existingSourcePriority
    ) {

        return candidateSourcePriority >
            existingSourcePriority;

    }


    const candidateChange =
        Number(
            candidate?.changes?.monthly?.percent
        );


    const existingChange =
        Number(
            existing?.changes?.monthly?.percent
        );


    if (
        Number.isFinite(
            candidateChange
        ) &&
        !Number.isFinite(
            existingChange
        )
    ) {

        return true;

    }


    return false;
}


function deduplicateCommodityRecords(
    records
) {

    const map =
        new Map();


    for (
        const record of
            records
    ) {

        const key =
            canonicalCommodityKey(
                record?.name
            );


        if (
            !key
        ) {
            continue;
        }


        const existing =
            map.get(
                key
            );


        if (
            !existing ||
            recordsShouldReplace(
                existing,
                record
            )
        ) {

            map.set(
                key,
                record
            );

        }

    }


    return [
        ...map.values()
    ];
}


/* =========================================================
   FINAL MULTI-SOURCE DATASET
========================================================= */

async function buildCombinedMarketsDataset(
    context
) {

    const cache =
        caches.default;

    const sourceTasks = [

        {
            name:
                "World Bank Commodity Prices",
            promise:
                loadWorldBankMultiSourceDataset(
                    cache
                )
        },

        {
            name:
                "U.S. Geological Survey, Mineral Commodity Summaries",
            promise:
                loadUSGSDatasetMultiSource(
                    cache
                )
        },

        {
            name:
                "U.S. Energy Information Administration",
            promise:
                loadEIADataset(
                    cache,
                    context?.env || {}
                )
        },

        {
            name:
                "USDA National Agricultural Statistics Service",
            promise:
                loadUSDANASSDataset(
                    cache
                )
        },

        {
            name:
                "Voltlas Open Data",
            promise:
                loadVoltlasDataset(
                    cache
                )
        }

    ];


    const settled =
        await Promise.allSettled(
            sourceTasks.map(
                source =>
                    source.promise
            )
        );


    const datasets = [];
    const status = [];
    const errors = [];


    for (
        let i = 0;
        i < settled.length;
        i += 1
    ) {

        const result =
            settled[i];

        const task =
            sourceTasks[i];


        if (
            result.status ===
            "fulfilled"
        ) {

            datasets.push(
                result.value
            );

            status.push({
                source:
                    task.name,
                ok:
                    true,
                configured:
                    result.value?.configured !== false,
                count:
                    Array.isArray(
                        result.value?.prices
                    )
                        ? result.value.prices.length
                        : 0,
                error:
                    null
            });

        }
        else {

            const message =
                result.reason?.message ||
                String(
                    result.reason
                );

            errors.push(
                `${task.name}: ${message}`
            );

            status.push({
                source:
                    task.name,
                ok:
                    false,
                configured:
                    true,
                count:
                    0,
                error:
                    message
            });

        }

    }


    const rawRecords =
        datasets.flatMap(
            dataset =>
                Array.isArray(
                    dataset?.prices
                )
                    ? dataset.prices
                    : []
        );


    if (
        !rawRecords.length
    ) {

        throw new Error(
            "No commodity source returned usable price records."
        );

    }


    const mergedRecords =
        deduplicateCommodityRecords(
            rawRecords
        );


    mergedRecords.sort(
        sortCommodities
    );


    const limited =
        mergedRecords.slice(
            0,
            MAX_COMMODITIES
        );


    const periodCandidates =
        limited
            .map(
                item =>
                    periodToDate(
                        item?.data_period
                    )
            )
            .filter(Boolean)
            .sort(
                (a, b) =>
                    a.timestamp -
                    b.timestamp
            );


    const latestPeriod =
        periodCandidates.length
            ? periodCandidates[
                periodCandidates.length - 1
            ].period
            : null;


    const sourceCounts = {};

    for (
        const item of
            limited
    ) {

        sourceCounts[item.source] =
            (
                sourceCounts[item.source] ||
                0
            ) +
            1;

    }


    const categorySources = {};

    for (
        const category of
            Object.keys(
                CATEGORY_INFO
            )
    ) {

        if (
            category ===
            "all"
        ) {
            continue;
        }

        categorySources[category] =
            CATEGORY_SOURCE_MAP[
                category
            ] || [];

    }


    return {

        prices:
            limited,

        latest_period:
            latestPeriod,

        commodity_count:
            limited.length,

        source_commodity_count:
            mergedRecords.length,

        raw_source_record_count:
            rawRecords.length,

        source_counts:
            sourceCounts,

        source_status:
            status,

        errors,

        category_sources:
            categorySources,

        max_commodities:
            MAX_COMMODITIES,

        source:
            "Worth It Multi-Source Commodity Data",

        sources:
            datasets.map(
                dataset => ({

                    source:
                        dataset.source,

                    source_url:
                        dataset.source_url,

                    license:
                        dataset.license,

                    license_url:
                        dataset.license_url,

                    attribution:
                        dataset.attribution,

                    configured:
                        dataset.configured !== false

                })
            ),

        license_notes: [

            "World Bank Commodity Prices: CC BY 4.0.",

            "USGS Mineral Commodity Summaries: CC0 1.0.",

            "EIA U.S. government data used here: public domain, subject to EIA reuse policy and attribution.",

            "USDA NASS public chart price data used here are public-domain NASS information reproduced with USDA-NASS acknowledgment.",

            "Voltlas Open Data: CC BY 4.0.",

            "Wikimedia Commons images are independently filtered by each file's own license metadata."

        ]

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


    /*
     * Wikimedia often uses standard scientific/common names
     * instead of the exact market-series label. Add well-defined
     * aliases so valid representative images are not rejected
     * purely because the wording differs.
     */
    const normalizedName =
        normalizeSearchText(
            name
        );


    const addAliases =
        aliases => {

            aliases.forEach(
                alias => {

                    const normalizedAlias =
                        normalizeSearchText(alias);

                    if (
                        normalizedAlias &&
                        !tokens.includes(normalizedAlias)
                    ) {

                        tokens.push(
                            normalizedAlias
                        );

                    }

                }
            );

        };


    if (/\bdap\b/.test(normalizedName)) {
        addAliases([
            "diammonium phosphate",
            "phosphate",
            "fertilizer"
        ]);
    }


    if (/\btsp\b/.test(normalizedName)) {
        addAliases([
            "triple superphosphate",
            "superphosphate",
            "phosphate",
            "fertilizer"
        ]);
    }


    if (/\bpotash\b/.test(normalizedName)) {
        addAliases([
            "potassium chloride",
            "potassium",
            "fertilizer"
        ]);
    }


    if (/\blng\b/.test(normalizedName)) {
        addAliases([
            "liquefied natural gas",
            "natural gas"
        ]);
    }


    if (/\blpg\b/.test(normalizedName)) {
        addAliases([
            "liquefied petroleum gas",
            "petroleum gas"
        ]);
    }


    if (/\bnatural gas\b/.test(normalizedName)) {
        addAliases([
            "gas"
        ]);
    }


    if (/\b(all )?beef cattle\b|\bsteers (and|&) heifers\b/.test(normalizedName)) {
        addAliases([
            "cattle",
            "cow",
            "cows"
        ]);
    }


    if (/\bbroilers?\b/.test(normalizedName)) {
        addAliases([
            "chicken",
            "chickens"
        ]);
    }


    if (/\bhogs?\b/.test(normalizedName)) {
        addAliases([
            "pig",
            "pigs",
            "swine"
        ]);
    }


    if (/\bcalves?\b/.test(normalizedName)) {
        addAliases([
            "calf",
            "cattle"
        ]);
    }


    if (/\blamb\b/.test(normalizedName)) {
        addAliases([
            "sheep"
        ]);
    }


    if (/\bgroundnuts?\b/.test(normalizedName)) {
        addAliases([
            "peanut",
            "peanuts"
        ]);
    }


    if (/\bgroundnut oil\b/.test(normalizedName)) {
        addAliases([
            "peanut oil"
        ]);
    }


    if (/\bsoybean oil\b/.test(normalizedName)) {
        addAliases([
            "soybean"
        ]);
    }


    if (/\brapeseed oil\b/.test(normalizedName)) {
        addAliases([
            "rapeseed",
            "canola"
        ]);
    }


    if (/\bsunflower oil\b/.test(normalizedName)) {
        addAliases([
            "sunflower"
        ]);
    }


    if (/\bcoconut oil\b/.test(normalizedName)) {
        addAliases([
            "coconut"
        ]);
    }


    if (/\bpalm kernel oil\b/.test(normalizedName)) {
        addAliases([
            "palm kernel"
        ]);
    }


    if (/\b(sawnwood|logs)\b/.test(normalizedName)) {
        addAliases([
            "wood",
            "timber",
            "lumber"
        ]);
    }


    return [
        ...new Set(
            tokens
        )
    ];
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
            Number(
                imageInfo?.width
            ) ||
            null,

        height:
            Number(
                imageInfo?.height
            ) ||
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
        /\bdap\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "diammonium phosphate",
            "dap fertilizer"
        );

    }


    if (
        /\btsp\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "triple superphosphate",
            "tsp fertilizer"
        );

    }


    if (
        /\bpotash\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "potash fertilizer",
            "potassium chloride"
        );

    }


    if (
        /\blng\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "liquefied natural gas",
            "natural gas"
        );

    }


    if (
        /\bnatural gas\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "natural gas"
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

    if (
        /\blead\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "lead metal",
            "lead mineral"
        );

    }


    if (
        /\btin\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "tin metal",
            "tin mineral"
        );

    }


    if (
        /\bzinc\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "zinc metal",
            "zinc mineral"
        );

    }


    if (
        /\bcotton\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "cotton fiber",
            "cotton plant"
        );

    }


    if (
        /\b(logs|sawnwood)\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "wood logs",
            "lumber wood"
        );

    }


    if (
        /\bplywood\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "plywood sheet"
        );

    }


    if (
        /\brubber\b/.test(
            normalizedBase
        )
    ) {

        searchHints.push(
            "rubber latex",
            "natural rubber"
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
            MARKETS_RESULT_CACHE_KEY
        );


    const cachedResult =
        await getFreshCache(
            cache,
            resultCacheKey,
            RESULT_CACHE_TTL
        );


    if (
        cachedResult
    ) {

        return cachedResult;

    }


    try {

        const parsed =
            await buildCombinedMarketsDataset(
                context
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

                RESULT_CACHE_TTL
            );


        const cachedResponse =
            await putTimestampedCache(
                cache,
                resultCacheKey,
                response,
                RESULT_CACHE_TTL
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
                    "Unable to load multi-source commodity data."

            },

            500,

            0
        );

    }

}

