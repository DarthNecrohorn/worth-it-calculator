/* =========================================================
   WORTH IT — MARKETS
   World Bank Commodity Price Data (Pink Sheet)

   Source:
     World Bank Commodity Markets
     CMO-Historical-Data-Monthly.xlsx

   License:
     Creative Commons Attribution 4.0 (CC BY 4.0)

   No API key required.

   IMPORTANT:
     The World Bank dataset is monthly. This endpoint therefore
     returns the latest available monthly observation and the
     percentage change versus the previous month.

   Endpoint:
     /api/markets
========================================================= */

const WORLD_BANK_MARKETS_PAGE =
    "https://www.worldbank.org/en/research/commodity-markets";

const CACHE_TTL =
    24 * 60 * 60;

const SOURCE_CACHE_TTL =
    24 * 60 * 60;

const CACHE_TIMESTAMP_HEADER =
    "X-Worth-It-Cache-Time";

const WORLD_BANK_XLSX_CACHE_KEY =
    "https://worth-it-internal-cache.local/world-bank-cmo-monthly.xlsx";

const WORLD_BANK_RESULT_CACHE_KEY =
    "https://worth-it-internal-cache.local/world-bank-markets-v1.json";

const METRIC_FACTORS = {
    metricTonToPound:
        1 / 2204.6226218487757
};


/*
 * ---------------------------------------------------------
 * RESPONSE HELPERS
 * ---------------------------------------------------------
 */

function jsonResponse(
    data,
    status = 200,
    cacheSeconds = CACHE_TTL
) {

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=UTF-8",

                "Cache-Control":
                    `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,

                "Cloudflare-CDN-Cache-Control":
                    `public, max-age=${cacheSeconds}`
            }
        }
    );
}


/*
 * ---------------------------------------------------------
 * BASIC TEXT HELPERS
 * ---------------------------------------------------------
 */

function normalizeText(value) {

    return String(value || "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function decodeXmlEntities(value) {

    return String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, decimal) => {

            const codePoint =
                Number(decimal);

            return Number.isFinite(codePoint)
                ? String.fromCodePoint(codePoint)
                : _;

        })
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {

            const codePoint =
                Number.parseInt(hex, 16);

            return Number.isFinite(codePoint)
                ? String.fromCodePoint(codePoint)
                : _;

        });
}


function escapeRegExp(value) {

    return String(value || "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/*
 * ---------------------------------------------------------
 * BINARY HELPERS
 * ---------------------------------------------------------
 */

function readUInt16(bytes, offset) {

    return (
        bytes[offset] |
        (bytes[offset + 1] << 8)
    ) >>> 0;
}


function readUInt32(bytes, offset) {

    return (
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    ) >>> 0;
}


function findEndOfCentralDirectory(bytes) {

    const signature = 0x06054b50;

    const minimumOffset =
        Math.max(
            0,
            bytes.length - 65557
        );

    for (
        let offset = bytes.length - 22;
        offset >= minimumOffset;
        offset -= 1
    ) {

        if (
            readUInt32(bytes, offset) === signature
        ) {
            return offset;
        }

    }

    throw new Error(
        "Invalid XLSX ZIP: end of central directory not found."
    );
}


async function inflateDeflateRaw(bytes) {

    const stream =
        new Blob([bytes])
            .stream()
            .pipeThrough(
                new DecompressionStream(
                    "deflate-raw"
                )
            );

    return new Uint8Array(
        await new Response(stream).arrayBuffer()
    );
}


async function unzipEntries(arrayBuffer) {

    const bytes =
        new Uint8Array(arrayBuffer);

    const endOffset =
        findEndOfCentralDirectory(bytes);

    const totalEntries =
        readUInt16(bytes, endOffset + 10);

    const centralDirectoryOffset =
        readUInt32(bytes, endOffset + 16);

    const entries =
        new Map();

    let cursor =
        centralDirectoryOffset;

    const decoder =
        new TextDecoder("utf-8");

    for (
        let index = 0;
        index < totalEntries;
        index += 1
    ) {

        if (
            readUInt32(bytes, cursor) !== 0x02014b50
        ) {

            throw new Error(
                "Invalid XLSX ZIP: central directory entry is corrupt."
            );

        }

        const compressionMethod =
            readUInt16(bytes, cursor + 10);

        const compressedSize =
            readUInt32(bytes, cursor + 20);

        const fileNameLength =
            readUInt16(bytes, cursor + 28);

        const extraLength =
            readUInt16(bytes, cursor + 30);

        const commentLength =
            readUInt16(bytes, cursor + 32);

        const localHeaderOffset =
            readUInt32(bytes, cursor + 42);

        const fileName =
            decoder.decode(
                bytes.slice(
                    cursor + 46,
                    cursor + 46 + fileNameLength
                )
            );

        const localHeader =
            localHeaderOffset;

        if (
            readUInt32(bytes, localHeader) !== 0x04034b50
        ) {

            throw new Error(
                `Invalid XLSX ZIP: local header missing for ${fileName}.`
            );

        }

        const localFileNameLength =
            readUInt16(
                bytes,
                localHeader + 26
            );

        const localExtraLength =
            readUInt16(
                bytes,
                localHeader + 28
            );

        const dataStart =
            localHeader +
            30 +
            localFileNameLength +
            localExtraLength;

        const compressedData =
            bytes.slice(
                dataStart,
                dataStart + compressedSize
            );

        let data;

        if (compressionMethod === 0) {

            data = compressedData;

        } else if (compressionMethod === 8) {

            data =
                await inflateDeflateRaw(
                    compressedData
                );

        } else {

            throw new Error(
                `Unsupported XLSX compression method ${compressionMethod} for ${fileName}.`
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


function decodeUtf8(bytes) {

    return new TextDecoder("utf-8").decode(
        bytes
    );
}


/*
 * ---------------------------------------------------------
 * XLSX RELATIONSHIPS + SHEET DISCOVERY
 * ---------------------------------------------------------
 */

function resolveWorkbookTarget(target) {

    const cleanTarget =
        String(target || "")
            .replace(/^\//, "")
            .replace(/^\.\//, "");

    if (
        cleanTarget.startsWith("xl/")
    ) {
        return cleanTarget;
    }

    return `xl/${cleanTarget}`;
}


function getXmlAttribute(tag, attributeName) {

    const pattern =
        new RegExp(
            `${escapeRegExp(attributeName)}=["']([^"']*)["']`,
            "i"
        );

    const match =
        String(tag || "").match(pattern);

    return match
        ? decodeXmlEntities(match[1])
        : null;
}


function findMonthlyPricesSheet(
    entries
) {

    const workbookBytes =
        entries.get("xl/workbook.xml");

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
        decodeUtf8(workbookBytes);

    const relsXml =
        decodeUtf8(relsBytes);

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
            getXmlAttribute(tag, "Id");

        const target =
            getXmlAttribute(tag, "Target");

        if (id && target) {

            relationshipMap.set(
                id,
                resolveWorkbookTarget(target)
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
            getXmlAttribute(tag, "name");

        const relationshipId =
            getXmlAttribute(tag, "r:id");

        if (
            name === "Monthly Prices" &&
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
        "XLSX does not contain a Monthly Prices sheet."
    );
}


/*
 * ---------------------------------------------------------
 * SHARED STRINGS
 * ---------------------------------------------------------
 */

function parseSharedStrings(entries) {

    const sharedStringsBytes =
        entries.get(
            "xl/sharedStrings.xml"
        );

    if (!sharedStringsBytes) {
        return [];
    }

    const xml =
        decodeUtf8(sharedStringsBytes);

    const strings = [];

    const itemRegex =
        /<si\b[^>]*>([\s\S]*?)<\/si>/gi;

    for (
        const match of xml.matchAll(
            itemRegex
        )
    ) {

        const item =
            match[1] || "";

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


/*
 * ---------------------------------------------------------
 * WORKSHEET PARSER
 * ---------------------------------------------------------
 */

function columnLettersToNumber(columnLetters) {

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
            result * 26 + code;

    }

    return result - 1;
}


function cellReferenceToColumn(reference) {

    const match =
        String(reference || "")
            .match(/^([A-Z]+)\d+$/i);

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
            rowMatch[1] || "";

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
                cellMatch[1] || "";

            const content =
                cellMatch[2] || "";

            const reference =
                getXmlAttribute(
                    `<c ${attributes}>`,
                    "r"
                );

            const column =
                cellReferenceToColumn(
                    reference
                );

            if (column < 0) {
                continue;
            }

            const type =
                getXmlAttribute(
                    `<c ${attributes}>`,
                    "t"
                );

            const valueMatch =
                content.match(
                    /<v\b[^>]*>([\s\S]*?)<\/v>/i
                );

            let value = "";

            if (type === "s") {

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
                    sharedIndex < sharedStrings.length
                        ? sharedStrings[
                            sharedIndex
                        ]
                        : "";

            } else if (type === "inlineStr") {

                const inlineParts = [];

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

            } else {

                value =
                    valueMatch
                        ? decodeXmlEntities(
                            valueMatch[1]
                        )
                        : "";

            }

            row.set(
                column,
                normalizeText(value)
            );

        }

        if (row.size) {
            rows.push(row);
        }

    }

    return rows;
}


/*
 * ---------------------------------------------------------
 * HEADER + DATA DISCOVERY
 * ---------------------------------------------------------
 */

function rowValues(row) {

    const values = [];

    for (
        const [column, value] of row.entries()
    ) {

        values[column] = value;

    }

    return values;
}


function findHeaderRows(rows) {

    for (
        let index = 0;
        index < Math.min(rows.length, 20);
        index += 1
    ) {

        const values =
            rowValues(rows[index]);

        const joined =
            values
                .filter(Boolean)
                .join(" | ")
                .toLowerCase();

        if (
            joined.includes("gold") &&
            joined.includes("silver") &&
            joined.includes("platinum")
        ) {
            return {
                nameRowIndex: index,
                unitRowIndex:
                    index + 1
            };
        }

    }

    throw new Error(
        "Could not locate the commodity header rows in the World Bank XLSX."
    );
}


function buildColumnHeaders(
    rows,
    headerInfo
) {

    const nameRow =
        rowValues(
            rows[
                headerInfo.nameRowIndex
            ] || new Map()
        );

    const unitRow =
        rowValues(
            rows[
                headerInfo.unitRowIndex
            ] || new Map()
        );

    const headers = [];

    const maximumLength =
        Math.max(
            nameRow.length,
            unitRow.length
        );

    for (
        let column = 0;
        column < maximumLength;
        column += 1
    ) {

        const name =
            normalizeText(
                nameRow[column]
            );

        const unit =
            normalizeText(
                unitRow[column]
            );

        headers[column] =
            [name, unit]
                .filter(Boolean)
                .join(" ");

    }

    return headers;
}


function findColumn(headers, patterns) {

    for (
        let column = 0;
        column < headers.length;
        column += 1
    ) {

        const header =
            String(
                headers[column] || ""
            ).toLowerCase();

        if (
            patterns.some(
                pattern =>
                    pattern.test(header)
            )
        ) {
            return column;
        }

    }

    return -1;
}


function parseNumeric(value) {

    const normalized =
        String(value || "")
            .replace(/,/g, "")
            .trim();

    if (
        !normalized ||
        normalized === "…" ||
        normalized === "..." ||
        normalized === ".." ||
        normalized === "—"
    ) {
        return null;
    }

    const number =
        Number(normalized);

    return Number.isFinite(number)
        ? number
        : null;
}


function parsePeriod(value) {

    const match =
        String(value || "")
            .trim()
            .match(/^(\d{4})M(\d{1,2})$/i);

    if (!match) {
        return null;
    }

    const year =
        Number(match[1]);

    const month =
        Number(match[2]);

    if (
        year < 1900 ||
        month < 1 ||
        month > 12
    ) {
        return null;
    }

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


function buildCommoditySeries(
    rows,
    headers,
    column,
    transform = value => value
) {

    if (column < 0) {
        return [];
    }

    const series = [];

    for (
        const row of rows
    ) {

        const values =
            rowValues(row);

        const period =
            parsePeriod(
                values[0]
            );

        if (!period) {
            continue;
        }

        const rawValue =
            parseNumeric(
                values[column]
            );

        if (rawValue === null) {
            continue;
        }

        const value =
            transform(rawValue);

        if (
            !Number.isFinite(value)
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
            a.timestamp - b.timestamp
    );

    return series;
}


function latestAndPrevious(series) {

    if (
        !Array.isArray(series) ||
        !series.length
    ) {
        return {
            latest: null,
            previous: null,
            change: null
        };
    }

    const latest =
        series[series.length - 1];

    const previous =
        series.length > 1
            ? series[series.length - 2]
            : null;

    const change =
        previous &&
        Number.isFinite(
            previous.value
        ) &&
        previous.value !== 0
            ? (
                (latest.value / previous.value) - 1
            ) * 100
            : null;

    return {
        latest,
        previous,
        change
    };
}


/*
 * ---------------------------------------------------------
 * WORLD BANK CATALOG MAPPING
 * ---------------------------------------------------------
 *
 * These are the series actually present in the Pink Sheet.
 * Palladium and refined petroleum products such as gasoline,
 * diesel, jet fuel and heating oil are NOT part of this dataset.
 * ---------------------------------------------------------
 */

const MARKET_SERIES = [

    {
        code: "GOLD_USD",
        name: "Gold",
        sourcePatterns: [
            /^gold\b/,
            /gold \(\$\/toz/i
        ]
    },

    {
        code: "SILVER_USD",
        name: "Silver",
        sourcePatterns: [
            /^silver\b/,
            /silver \(\$\/toz/i
        ]
    },

    {
        code: "PLATINUM_USD",
        name: "Platinum",
        sourcePatterns: [
            /^platinum\b/,
            /platinum \(\$\/toz/i
        ]
    },

    {
        code: "COPPER_USD",
        name: "Copper",
        sourcePatterns: [
            /^copper\b/,
            /copper \(\$\/mt/i
        ],
        transform:
            value =>
                value * METRIC_FACTORS.metricTonToPound
    },

    {
        code: "IRON_ORE_USD",
        name: "Iron Ore",
        sourcePatterns: [
            /^iron ore\b/,
            /iron ore.*\$\/dmt/i
        ]
    },

    {
        code: "ALUMINUM_USD",
        name: "Aluminum",
        sourcePatterns: [
            /^aluminum\b/,
            /aluminum \(\$\/mt/i
        ],
        transform:
            value =>
                value * METRIC_FACTORS.metricTonToPound
    },

    {
        code: "WTI_USD",
        name: "Crude Oil",
        sourcePatterns: [
            /^crude oil, wti\b/,
            /crude oil, wti.*\$\/bbl/i
        ]
    },

    {
        code: "NATURAL_GAS_USD",
        name: "Natural Gas",
        sourcePatterns: [
            /^natural gas, u\.s\.?\b/,
            /natural gas, u\.s\?.*\$\/mmbtu/i
        ]
    },

    {
        code: "BRENT_CRUDE_USD",
        name: "Brent Crude",
        sourcePatterns: [
            /^crude oil, brent\b/,
            /crude oil, brent.*\$\/bbl/i
        ]
    },

    {
        code: "COAL_USD",
        name: "Coal",
        sourcePatterns: [
            /^coal, australia\b/,
            /coal, australia.*\$\/mt/i
        ]
    },

    {
        code: "NICKEL_USD",
        name: "Nickel",
        sourcePatterns: [
            /^nickel\b/,
            /nickel \(\$\/mt/i
        ],
        transform:
            value =>
                value * METRIC_FACTORS.metricTonToPound
    }
];


/*
 * ---------------------------------------------------------
 * DATASET LOADING
 * ---------------------------------------------------------
 */

async function getFreshCachedResponse(
    cache,
    cacheKey,
    maxAgeSeconds
) {

    const cached =
        await cache.match(
            cacheKey
        );

    if (!cached) {
        return null;
    }

    const cachedAt =
        Number(
            cached.headers.get(
                CACHE_TIMESTAMP_HEADER
            )
        );

    if (
        !Number.isFinite(cachedAt) ||
        cachedAt <= 0
    ) {
        return null;
    }

    const ageSeconds =
        (Date.now() - cachedAt) / 1000;

    if (
        !Number.isFinite(ageSeconds) ||
        ageSeconds < 0 ||
        ageSeconds > maxAgeSeconds
    ) {
        return null;
    }

    return cached;
}


function addCacheTimestamp(
    headers,
    cacheSeconds
) {

    headers.set(
        CACHE_TIMESTAMP_HEADER,
        String(Date.now())
    );

    headers.set(
        "Cache-Control",
        `public, max-age=${cacheSeconds}`
    );

    return headers;
}


async function fetchWithCache(
    request,
    cacheKey,
    cache,
    cacheSeconds
) {

    const cached =
        await getFreshCachedResponse(
            cache,
            cacheKey,
            cacheSeconds
        );

    if (cached) {
        return cached;
    }

    const response =
        await fetch(
            request
        );

    if (!response.ok) {
        throw new Error(
            `World Bank request failed with status ${response.status}.`
        );
    }

    const headers =
        new Headers(
            response.headers
        );

    headers.set(
        CACHE_TIMESTAMP_HEADER,
        String(Date.now())
    );

    headers.set(
        "Cache-Control",
        `public, max-age=${cacheSeconds}`
    );

    const cachedResponse =
        new Response(
            await response.arrayBuffer(),
            {
                status: 200,
                headers
            }
        );

    await cache.put(
        cacheKey,
        cachedResponse.clone()
    );

    return cachedResponse;
}


async function discoverWorldBankMonthlyUrl(cache) {

    const pageCacheKey =
        new Request(
            "https://worth-it-internal-cache.local/world-bank-commodity-markets-page"
        );

    const cachedPage =
        await getFreshCachedResponse(
            cache,
            pageCacheKey,
            SOURCE_CACHE_TTL
        );

    if (cachedPage) {
        return cachedPage;
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

    const html =
        await response.text();

    const matches =
        [...html.matchAll(
            /href=["']([^"']*CMO-Historical-Data-Monthly\.xlsx[^"']*)["']/gi
        )];

    if (!matches.length) {
        throw new Error(
            "Could not find the current World Bank monthly XLSX link."
        );
    }

    const href =
        decodeXmlEntities(
            matches[0][1]
        );

    const absoluteUrl =
        new URL(
            href,
            WORLD_BANK_MARKETS_PAGE
        ).href;

    const resultHeaders =
        addCacheTimestamp(
            new Headers({
                "Content-Type":
                    "application/json; charset=UTF-8"
            }),
            SOURCE_CACHE_TTL
        );

    const result =
        new Response(
            JSON.stringify({
                url: absoluteUrl,
                discoveredAt: new Date().toISOString()
            }),
            {
                headers: resultHeaders
            }
        );

    await cache.put(
        pageCacheKey,
        result.clone()
    );

    return result;
}


async function loadWorldBankWorkbook(
    cache
) {

    const discoveryResponse =
        await discoverWorldBankMonthlyUrl(
            cache
        );

    const discoveryData =
        await discoveryResponse.json();

    if (!discoveryData?.url) {
        throw new Error(
            "World Bank monthly dataset URL is missing."
        );
    }

    const response =
        await fetchWithCache(
            discoveryData.url,
            new Request(
                WORLD_BANK_XLSX_CACHE_KEY
            ),
            cache,
            CACHE_TTL
        );

    return {
        url: discoveryData.url,
        bytes:
            await response.arrayBuffer()
    };
}


/*
 * ---------------------------------------------------------
 * DATASET PARSING
 * ---------------------------------------------------------
 */

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
        entries.get(sheetPath);

    if (!sheetBytes) {
        throw new Error(
            `World Bank XLSX is missing ${sheetPath}.`
        );
    }

    const sheetXml =
        decodeUtf8(sheetBytes);

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
        findHeaderRows(rows);

    const headers =
        buildColumnHeaders(
            rows,
            headerInfo
        );

    const dataRows =
        rows.slice(
            headerInfo.unitRowIndex + 1
        );

    const valuesByCode =
        {};

    for (
        const seriesConfig of MARKET_SERIES
    ) {

        const column =
            findColumn(
                headers,
                seriesConfig.sourcePatterns
            );

        const series =
            buildCommoditySeries(
                dataRows,
                headers,
                column,
                seriesConfig.transform ||
                    (value => value)
            );

        const state =
            latestAndPrevious(
                series
            );

        if (!state.latest) {
            continue;
        }

        valuesByCode[
            seriesConfig.code
        ] = {
            name:
                seriesConfig.name,
            sourceHeader:
                headers[column] || null,
            latest:
                state.latest,
            previous:
                state.previous,
            change:
                state.change
        };

    }

    if (
        !Object.keys(valuesByCode).length
    ) {
        throw new Error(
            "World Bank dataset parsing returned no supported market series."
        );
    }

    const allLatestTimestamps =
        Object.values(valuesByCode)
            .map(item =>
                item.latest?.timestamp
            )
            .filter(Number.isFinite);

    const latestTimestamp =
        allLatestTimestamps.length
            ? Math.max(
                ...allLatestTimestamps
            )
            : null;

    const latestDate =
        Number.isFinite(latestTimestamp)
            ? new Date(latestTimestamp)
            : null;

    const updatedMatch =
        sheetXml.match(
            /Updated on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i
        );

    let sourceUpdatedAt = null;

    if (updatedMatch) {
        const parsedDate =
            new Date(
                updatedMatch[1]
            );

        if (!Number.isNaN(
            parsedDate.getTime()
        )) {
            sourceUpdatedAt =
                parsedDate.toISOString();
        }
    }

    const prices = [];

    for (
        const seriesConfig of MARKET_SERIES
    ) {

        const item =
            valuesByCode[
                seriesConfig.code
            ];

        if (!item) {
            continue;
        }

        prices.push({
            code:
                seriesConfig.code,
            price:
                item.latest.value,
            changes: {
                monthly: {
                    percent:
                        item.change
                }
            },
            updated_at:
                new Date(
                    item.latest.timestamp
                ).toISOString(),
            data_period:
                item.latest.period,
            previous_period:
                item.previous?.period || null,
            previous_price:
                item.previous?.value ?? null,
            source:
                "World Bank Commodity Price Data (The Pink Sheet)",
            source_header:
                item.sourceHeader
        });

    }

    return {
        prices,
        latest_period:
            latestDate
                ? `${latestDate.getUTCFullYear()}M${String(
                    latestDate.getUTCMonth() + 1
                ).padStart(2, "0")}`
                : null,
        source_updated_at:
            sourceUpdatedAt,
        source:
            "World Bank Commodity Price Data (The Pink Sheet)",
        source_url:
            WORLD_BANK_MARKETS_PAGE,
        license:
            "CC BY 4.0"
    };
}


/*
 * ---------------------------------------------------------
 * MAIN HANDLER
 * ---------------------------------------------------------
 */

export async function onRequestGet(
    context
) {

    const cache =
        caches.default;

    const resultCacheKey =
        new Request(
            WORLD_BANK_RESULT_CACHE_KEY
        );

    const cachedResult =
        await getFreshCachedResponse(
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

        const responseData = {
            success: true,
            data: parsed
        };

        const response =
            jsonResponse(
                responseData,
                200,
                CACHE_TTL
            );

        const cachedHeaders =
            addCacheTimestamp(
                new Headers(
                    response.headers
                ),
                CACHE_TTL
            );

        const cachedResponse =
            new Response(
                response.clone().body,
                {
                    status: response.status,
                    headers: cachedHeaders
                }
            );

        await cache.put(
            resultCacheKey,
            cachedResponse.clone()
        );

        return response;

    } catch (error) {

        console.error(
            "Markets API error:",
            error
        );

        console.error(
            "Markets API ERROR MESSAGE:",
            error?.message
        );

        return jsonResponse(
            {
                success: false,
                error:
                    "Unable to load World Bank market data."
            },
            500,
            0
        );
    }
}
