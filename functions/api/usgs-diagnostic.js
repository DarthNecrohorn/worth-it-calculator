const USGS_PID = "USGS:69837e43b66b01367d7ec7c7";
const DOI_URL = "https://doi.org/10.5066/P1WKQ63T";

async function fetchText(url, accept = "*/*") {
    try {
        const response = await fetch(url, {
            redirect: "follow",
            cache: "no-store",
            headers: {
                "User-Agent": "Worth-It-Calculator/USGS-Diagnostic",
                "Accept": accept
            }
        });

        const body = await response.text();

        return {
            url,
            status: response.status,
            ok: response.ok,
            finalUrl: response.url || url,
            contentType: response.headers.get("content-type"),
            contentLength: response.headers.get("content-length"),
            body
        };
    } catch (error) {
        return {
            url,
            status: null,
            ok: false,
            finalUrl: null,
            contentType: null,
            contentLength: null,
            body: "",
            error: error?.message || String(error)
        };
    }
}

function decodeXml(value) {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x2F;/gi, "/")
        .replace(/&#47;/g, "/")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

function extractResourceCandidates(body) {
    if (!body) return [];

    const candidates = new Set();

    const add = value => {
        if (!value) return;

        const decoded = decodeXml(value.trim());

        if (
            /MCS2026/i.test(decoded) ||
            /Commodities_Data\.csv/i.test(decoded) ||
            /sciencebase\.gov/i.test(decoded) ||
            /data\.usgs\.gov/i.test(decoded) ||
            /doi\.org/i.test(decoded)
        ) {
            candidates.add(decoded);
        }
    };

    for (const match of body.matchAll(/https?:[^"'<>\s]+/gi)) add(match[0]);
    for (const match of body.matchAll(/(?:href|src|content|url|downloadurl|linkage)\s*=\s*["']([^"']+)["']/gi)) {
        add(match[1]);
    }

    return Array.from(candidates).slice(0, 100);
}

function decodeDataUriScript(value) {
    if (!value || !value.startsWith("data:text/javascript;base64,")) return "";
    try {
        return atob(value.slice("data:text/javascript;base64,".length));
    } catch {
        return "";
    }
}

function extractScriptClues(scripts) {
    const clues = new Set();
    const patterns = [
        /https?:\/\/[^"'\s)]+/gi,
        /(?:fetch|axios|XMLHttpRequest)\s*\([^)]{0,300}/gi,
        /(?:\/api\/|graphql|download|resource|metadata|datacatalog|search)[^"'\s]{0,250}/gi
    ];

    for (const script of scripts || []) {
        const decoded = decodeDataUriScript(script);
        if (!decoded) continue;

        for (const pattern of patterns) {
            for (const match of decoded.matchAll(pattern)) {
                clues.add(match[0].slice(0, 500));
                if (clues.size >= 100) return Array.from(clues);
            }
        }
    }

    return Array.from(clues);
}

function extractContextMatches(scripts, html) {
    const targets = [
        "api/identifiers",
        "mcs2026",
        "Commodities_Data",
        "download",
        "fetch(",
        ".csv",
        ".then("
    ];

    const contexts = [];
    const sources = [
        { source: "html", text: html || "" },
        ...(scripts || []).map((script, index) => ({
            source: "script-" + index,
            text: decodeDataUriScript(script)
        }))
    ];

    for (const { source, text } of sources) {
        if (!text) continue;

        for (const target of targets) {
            let offset = 0;
            let count = 0;

            while (count < 20) {
                const index = text.toLowerCase().indexOf(target.toLowerCase(), offset);
                if (index === -1) break;

                const start = Math.max(0, index - 800);
                const end = Math.min(text.length, index + target.length + 1200);

                contexts.push({
                    source,
                    target,
                    context: text.slice(start, end)
                });

                offset = index + target.length;
                count++;
                if (contexts.length >= 100) return contexts;
            }
        }
    }

    return contexts;
}

function extractHtmlDetails(html) {
    if (!html) {
        return {
            scripts: [],
            links: [],
            snippets: []
        };
    }

    const scripts = new Set();
    const links = new Set();
    const snippets = [];

    for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
        scripts.add(decodeXml(match[1]));
    }

    for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)) {
        const value = decodeXml(match[1]);
        if (/download|file|data|metadata|api|csv|zip/i.test(value)) {
            links.add(value);
        }
    }

    for (const pattern of [
        /MCS2026[^\n]{0,500}/gi,
        /Commodities_Data\.csv[^\n]{0,500}/gi,
        /download[^\n]{0,500}/gi,
        /api[^\n]{0,500}/gi,
        /entity[^\n]{0,500}/gi
    ]) {
        for (const match of html.matchAll(pattern)) {
            snippets.push(match[0].slice(0, 1000));
            if (snippets.length >= 50) break;
        }
        if (snippets.length >= 50) break;
    }

    return {
        scripts: Array.from(scripts).slice(0, 100),
        links: Array.from(links).slice(0, 100),
        snippets: Array.from(new Set(snippets)).slice(0, 50)
    };
}

function extractDistributionDetails(xml) {
    if (!xml) {
        return {
            sections: [],
            urls: [],
            fileNames: [],
            relevantLines: []
        };
    }

    const sections = [];
    const urls = new Set();
    const fileNames = new Set();
    const relevantLines = [];

    const distributionMatch = xml.match(/<distinfo[\s\S]*?<\/distinfo>/i);
    if (distributionMatch) sections.push(decodeXml(distributionMatch[0]));

    for (const match of xml.matchAll(/https?:[^"'<>\s]+/gi)) {
        const url = decodeXml(match[0]);
        urls.add(url);
    }

    for (const match of xml.matchAll(/<[^>]*(?:linkage|networka|networkr|onlink|name|title)[^>]*>([\s\S]*?)<\//gi)) {
        const value = decodeXml(match[1].replace(/<[^>]+>/g, "").trim());
        if (!value) continue;

        if (
            /MCS2026/i.test(value) ||
            /Commodities_Data\.csv/i.test(value) ||
            /\.csv(?:$|\?)/i.test(value) ||
            /\.zip(?:$|\?)/i.test(value) ||
            /sciencebase\.gov/i.test(value) ||
            /data\.usgs\.gov/i.test(value) ||
            /doi\.org/i.test(value)
        ) {
            relevantLines.push(value);
        }

        if (/\.csv(?:$|\?)/i.test(value) || /\.zip(?:$|\?)/i.test(value)) {
            fileNames.add(value);
        }
    }

    for (const line of xml.split(/\r?\n/)) {
        if (
            /MCS2026/i.test(line) ||
            /Commodities_Data\.csv/i.test(line) ||
            /<distinfo/i.test(line) ||
            /<stdorder/i.test(line) ||
            /<networkr/i.test(line) ||
            /<networka/i.test(line) ||
            /<linkage/i.test(line)
        ) {
            relevantLines.push(decodeXml(line.trim()));
        }
    }

    return {
        sections: sections.slice(0, 5),
        urls: Array.from(urls).slice(0, 100),
        fileNames: Array.from(fileNames).slice(0, 100),
        relevantLines: Array.from(new Set(relevantLines)).slice(0, 200)
    };
}

async function probe(url, options = {}) {
    const result = await fetchText(url, options.accept || "*/*");
    const body = result.body;

    return {
        url: result.url,
        status: result.status,
        ok: result.ok,
        finalUrl: result.finalUrl,
        contentType: result.contentType,
        contentLength: result.contentLength,
        preview: options.readBody === false ? null : body.slice(0, 500)
    };
}

export async function onRequestGet() {
    const results = {
        success: true,
        pid: USGS_PID,
        doi: "10.5066/P1WKQ63T",
        tests: {}
    };

    const dataCatalogUrl =
        "https://data.usgs.gov/datacatalog/data/USGS%3A69837e43b66b01367d7ec7c7";
    const metadataUrl =
        "https://data.usgs.gov/datacatalog/metadata/USGS.69837e43b66b01367d7ec7c7.xml";

    const dataCatalog = await fetchText(dataCatalogUrl, "text/html,*/*");
    const metadataXml = await fetchText(
        metadataUrl,
        "application/xml,text/xml,*/*"
    );

    const htmlDetails = extractHtmlDetails(dataCatalog.body);

    results.tests.aisResolve = await probe(
        "https://www1.usgs.gov/identifiers/api/resolve/" + encodeURIComponent(USGS_PID),
        { readBody: true }
    );

    results.tests.aisIdentifierApi = await probe(
        "https://www1.usgs.gov/identifiers/api/identifiers/" + encodeURIComponent(USGS_PID),
        { readBody: true }
    );

    results.tests.doi = await probe(DOI_URL, { readBody: false });

    results.tests.dataCatalog = {
        url: dataCatalog.url,
        status: dataCatalog.status,
        ok: dataCatalog.ok,
        finalUrl: dataCatalog.finalUrl,
        contentType: dataCatalog.contentType,
        contentLength: dataCatalog.contentLength,
        resourceCandidates: extractResourceCandidates(dataCatalog.body),
        htmlDetails,
        scriptClues: extractScriptClues(htmlDetails.scripts),
        contextMatches: extractContextMatches(htmlDetails.scripts, dataCatalog.body)
    };

    results.tests.metadataXml = {
        url: metadataXml.url,
        status: metadataXml.status,
        ok: metadataXml.ok,
        finalUrl: metadataXml.finalUrl,
        contentType: metadataXml.contentType,
        contentLength: metadataXml.contentLength,
        resourceCandidates: extractResourceCandidates(metadataXml.body),
        distribution: extractDistributionDetails(metadataXml.body)
    };

    results.tests.legacyScienceBase = await probe(
        "https://www.sciencebase.gov/catalog/item/69837e43b66b01367d7ec7c7?format=json",
        { accept: "application/json,*/*", readBody: true }
    );

    return new Response(JSON.stringify(results, null, 2), {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}
