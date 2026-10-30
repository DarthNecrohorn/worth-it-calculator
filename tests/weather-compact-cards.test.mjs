import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../weather-compact.css", import.meta.url), "utf8");
const weather = readFileSync(new URL("../weather-ui.js", import.meta.url), "utf8");

test("compact Weather styles load after the shared and overlay styles", () => {
    const shared = html.indexOf('href="style.css?v=');
    const sectionThemes = html.indexOf('href="section-themes.css?v=section-themes-20261030a"');
    const overlay = html.indexOf('href="feedback-admin-overlays.css?v=feedback-admin-overlays-20261030b"');
    const compact = html.indexOf('href="weather-compact.css?v=weather-compact-20261030a"');

    assert.ok(shared >= 0 && sectionThemes > shared);
    assert.ok(overlay > sectionThemes && compact > overlay);
});

test("current Weather card uses less padding and tighter condition spacing", () => {
    assert.match(css, /#weatherSection \.weather-card\s*\{[^}]*padding:18px !important;/);
    assert.match(css, /#weatherSection \.weather-main\s*\{[^}]*padding:4px 0 16px !important;/);
    assert.match(css, /#weatherSection \.weather-icon\s*\{[^}]*font-size:50px !important;/);
    assert.match(css, /#weatherSection \.weather-details > div\s*\{[^}]*padding:10px 8px !important;/);
});

test("forecast cards are shorter on desktop and display three columns on phones", () => {
    assert.match(css, /#weatherSection #weatherForecast \.weather-forecast-card\s*\{[^}]*padding:11px 9px !important;/);
    assert.match(css, /#weatherSection #weatherForecast \.weather-forecast-icon\s*\{[^}]*font-size:27px !important;/);
    assert.match(css, /@media \(max-width:760px\)[\s\S]*?#weatherSection #weatherForecast\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\) !important;/);
    assert.match(css, /@media \(max-width:420px\)[\s\S]*?#weatherSection #weatherForecast\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\) !important;/);
    assert.match(css, /#weatherSection #weatherForecast \.weather-forecast-temp strong\s*\{[^}]*font-size:14px;/);
});

test("selected-day details also use a compact responsive grid", () => {
    assert.match(css, /#weatherSection #weatherDayDetails\s*\{[^}]*padding:16px !important;/);
    assert.match(css, /#weatherSection #weatherDayDetails \.weather-detail-item\s*\{[^}]*padding:10px !important;/);
    assert.match(css, /#weatherSection #weatherDayDetails \.weather-details-grid\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(css, /#weatherSection #weatherDayDetails \.weather-details-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\) !important;/);
});

test("all existing forecast values and day selection stay present", () => {
    assert.match(weather, /forecast\.forEach\(\(forecastDay, index\) =>/);
    assert.match(weather, /forecastDay\.tempmax/);
    assert.match(weather, /forecastDay\.tempmin/);
    assert.match(weather, /forecastDay\.precipprob/);
    assert.match(weather, /selectForecastDay\(forecast, index\)/);
    assert.match(weather, /weather-forecast-card/);
});
