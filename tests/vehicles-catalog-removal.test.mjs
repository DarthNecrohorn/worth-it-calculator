import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const routing = readFileSync(new URL("../routing.js", import.meta.url), "utf8");
const calculators = readFileSync(new URL("../calculators.js", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../_redirects", import.meta.url), "utf8");

test("Vehicles catalogue UI, scripts, and API are removed", () => {
    assert.doesNotMatch(html, /id="carsSection"|openCarsFromMenu|cars-ui\.js|cars-levels-ui\.js/);
    assert.doesNotMatch(routing, /["']\/compare-cars["']\s*:/);
    assert.doesNotMatch(redirects, /^\/(?:compare-cars|cars)\/?\s/m);
    assert.equal(existsSync(new URL("../cars-ui.js", import.meta.url)), false);
    assert.equal(existsSync(new URL("../cars-levels-ui.js", import.meta.url)), false);
    assert.equal(existsSync(new URL("../functions/api/cars.js", import.meta.url)), false);
});

test("Car-related calculators, including EV Charging Cost, remain available", () => {
    assert.match(html, /id="carsApp"/);
    assert.match(html, /onclick="openCalculator\('cars'\)"/);
    assert.match(html, /EV Charging Cost/);
    assert.match(calculators, /function calculateCars\s*\(/);
    assert.match(calculators, /function resetCars\s*\(/);
});
