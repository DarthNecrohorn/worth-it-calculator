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

function extractResourceCandidates(body) {
    if (!body) return [];

    const candidates = new Set();

    const add = value => {
        if (!value) return;

        const decoded = value
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#x2F;/gi, "/")
            .replace(/&#47;/g, "/");

        if (
            /MCS2026/i.test(decoded) ||
            /Commodities_Data\.csv/i.test(decoded) ||
            /sciencebase\.gov/i.test(decoded) ||
            /data\.usgs\.gov/i.test(decoded)
        ) {
            candidates.add(decoded);
        }
    };

    for (const match of body.matchAll(/https?:[^"'<>\s]+/gi)) add(match[0]);
    for (const match of body.matchAll(/(?:href|src|content|url|downloadurl)\s*=\s*["']([^"']+)["']/gi)) {
        add(match[1]);
    }

    return Array.from(candidates).slice(0, 100);
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

    results.tests.aisResolve = await probe(
        "https://www1.usgs.gov/identifiers/api/resolve/" + encodeURIComponent(USGS_PID),
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
        resourceCandidates: extractResourceCandidates(dataCatalog.body)
    };

    results.tests.metadataXml = {
        url: metadataXml.url,
        status: metadataXml.status,
        ok: metadataXml.ok,
        finalUrl: metadataXml.finalUrl,
        contentType: metadataXml.contentType,
        contentLength: metadataXml.contentLength,
        resourceCandidates: extractResourceCandidates(metadataXml.body)
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
