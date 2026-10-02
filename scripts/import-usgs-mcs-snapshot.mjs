import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const SOURCE_URL =
    "https://www.sciencebase.gov/catalog/file/get/696a75d5d4be0228872d3bf8?name=MCS2026_Commodities_Data.csv";

const OUTPUT_PATH =
    "data/markets/usgs/MCS2026_Commodities_Data.csv";

const META_PATH =
    "data/markets/usgs/MCS2026_Commodities_Data.meta.json";

const EXPECTED_HEADER =
    "MCS chapter,Section,Commodity,Country,Statistics,Statistics_detail,Unit,Year,Value,Notes,Is critical mineral 2025,Other notes";

async function main() {
    const response = await fetch(SOURCE_URL, {
        redirect: "follow",
        headers: {
            "Accept": "text/csv,text/plain,application/octet-stream,*/*",
            "User-Agent":
                "Worth-It-Calculator/USGS-MCS-Refresh (+https://github.com/DarthNecrohorn/worth-it-calculator)"
        }
    });

    if (!response.ok) {
        throw new Error(
            `USGS MCS source download failed with HTTP ${response.status}.`
        );
    }

    const buffer =
        Buffer.from(await response.arrayBuffer());

    if (buffer.length < 2000000) {
        throw new Error(
            `USGS MCS source download is unexpectedly small: ${buffer.length} bytes.`
        );
    }

    const preview =
        buffer
            .subarray(0, 1000)
            .toString("latin1")
            .replace(/^\uFEFF/, "");

    if (!preview.startsWith(EXPECTED_HEADER)) {
        throw new Error(
            "USGS MCS source header did not match the expected 2026 long-form CSV schema."
        );
    }

    const latin1 =
        buffer.toString("latin1");

    if (
        !latin1.includes("Mineral Commodity Summaries") &&
        !latin1.includes("Salient Statistics")
    ) {
        throw new Error(
            "USGS MCS source validation failed: expected MCS content was not found."
        );
    }

    const sha256 =
        createHash("sha256")
            .update(buffer)
            .digest("hex");

    await mkdir(
        "data/markets/usgs",
        { recursive: true }
    );

    let unchanged =
        false;

    try {
        const existing =
            await readFile(OUTPUT_PATH);

        unchanged =
            existing.equals(buffer);

    }
    catch {
        unchanged =
            false;
    }

    if (!unchanged) {
        await writeFile(
            OUTPUT_PATH,
            buffer
        );
    }

    const meta = {
        year: 2026,
        fileName: "MCS2026_Commodities_Data.csv",
        sourceUrl: SOURCE_URL,
        sourcePage:
            "https://www.usgs.gov/data/mineral-commodity-summaries-2026-data-release",
        doi: "10.5066/P1WKQ63T",
        scienceBaseItemId:
            "696a75d5d4be0228872d3bf8",
        bytes: buffer.length,
        sha256,
        fetchedAt:
            new Date().toISOString()
    };

    await writeFile(
        META_PATH,
        JSON.stringify(meta, null, 2) + "\n",
        "utf8"
    );

    console.log(
        JSON.stringify(
            {
                ...meta,
                unchanged
            },
            null,
            2
        )
    );
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
