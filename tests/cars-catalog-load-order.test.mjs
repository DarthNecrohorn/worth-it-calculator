import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../cars-ui.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Cars catalog starts its metadata request without waiting for it", () => {
    const start = source.indexOf("async function fetchFreshVehicleCatalog(");
    const end = source.indexOf("async function refreshVehicleCatalogInBackground", start);
    assert.ok(start >= 0 && end > start, "catalog loader is present");
    const loader = source.slice(start, end);
    assert.match(loader, /void fetchVehicleDatasetMetadata\(\);/);
    assert.doesNotMatch(loader, /await fetchVehicleDatasetMetadata\(\);/);
    assert.match(loader, /await Promise\.all\(/, "catalog sources still load concurrently");
});

test("Cars UI cache key is refreshed for the loading optimization", () => {
    assert.match(html, /cars-ui\.js\?v=carsperf20261025b/);
});
