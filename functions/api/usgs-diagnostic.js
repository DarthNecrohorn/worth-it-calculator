const USGS_PID = "USGS:69837e43b66b01367d7ec7c7";
const DOI_URL = "https://doi.org/10.5066/P1WKQ63T";

async function probe(url, options = {}) {
    try {
        const response = await fetch(url, {
            redirect: "follow",
            cache: "no-store",
            headers: {
                "User-Agent": "Worth-It-Calculator/USGS-Diagnostic",
                "Accept": options.accept || "*/*"
            }
        });

        const contentType = response.headers.get("content-type");
        const contentLength = response.headers.get("content-length");

        let preview = null;
        if (options.readBody !== false) {
            const body = await response.text();
            preview = body.slice(0, 500);
        }

        return {
            url,
            status: response.status,
            ok: response.ok,
            finalUrl: response.url || url,
            contentType,
            contentLength,
            preview
        };
    } catch (error) {
        return {
            url,
            status: null,
            ok: false,
            finalUrl: null,
            contentType: null,
            contentLength: null,
            preview: null,
            error: error?.message || String(error)
        };
    }
}

export async function onRequestGet() {
    const results = {
        success: true,
        pid: USGS_PID,
        doi: "10.5066/P1WKQ63T",
        tests: {}
    };

    results.tests.aisResolve = await probe(
        "https://www1.usgs.gov/identifiers/api/resolve/" + encodeURIComponent(USGS_PID),
        { readBody: true }
    );

    results.tests.doi = await probe(DOI_URL, { readBody: false });

    results.tests.dataCatalog = await probe(
        "https://data.usgs.gov/datacatalog/data/USGS%3A69837e43b66b01367d7ec7c7",
        { readBody: true }
    );

    results.tests.metadataXml = await probe(
        "https://data.usgs.gov/datacatalog/metadata/USGS.69837e43b66b01367d7ec7c7.xml",
        { accept: "application/xml,text/xml,*/*", readBody: true }
    );

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
