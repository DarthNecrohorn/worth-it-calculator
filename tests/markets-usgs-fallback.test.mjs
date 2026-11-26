import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const marketsApi = readFileSync(new URL("../functions/api/markets.js", import.meta.url), "utf8");

test("Markets falls back to the bundled reviewed USGS snapshot when live ScienceBase release loading fails", () => {
    assert.match(marketsApi, /async function loadUSGSDatasetMultiSource\([\s\S]*?getUSGSReleaseInfoMultiSource\(cache\)[\s\S]*?catch \(error\)[\s\S]*?USGS_MCS_SNAPSHOT_URL/);
    assert.match(marketsApi, /bundled 2026 snapshot failed/);
    assert.match(marketsApi, /MCS2026_Commodities_Data\.csv/);
});
