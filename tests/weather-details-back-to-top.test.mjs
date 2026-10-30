import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const weather = readFileSync(new URL("../weather-ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../weather-compact.css", import.meta.url), "utf8");

test("Weather UI cache key is refreshed for the details return-to-top button", () => {
    assert.match(html, /weather-ui\.js\?v=weather-details-back-to-top-20261030a/);
});

test("selected-day details place the return-to-top button between the heading and current weather", () => {
    const renderStart = weather.indexOf("function renderSelectedDayDetails(forecast, index)");
    const renderEnd = weather.indexOf("function createWeatherDetailItem(", renderStart);
    assert.ok(renderStart >= 0 && renderEnd > renderStart, "selected-day detail renderer exists");
    const renderer = weather.slice(renderStart, renderEnd);

    const heading = renderer.indexOf('class="weather-details-title"');
    const button = renderer.indexOf('class="weather-details-back-to-top"');
    const currentWeather = renderer.indexOf('class="weather-details-header-weather"');
    assert.ok(heading >= 0 && button > heading && currentWeather > button);
    assert.match(renderer, /Go back to the top/);
    assert.match(renderer, /aria-label="Go back to the top of the Weather section"/);
});

test("the button scrolls smoothly to the Weather section and accounts for the sticky header", () => {
    assert.match(weather, /function scrollWeatherSectionToTop\(\)/);
    assert.match(weather, /const section = \$\("weatherSection"\)/);
    assert.match(weather, /const navigation = document\.querySelector\("\.nav"\)/);
    assert.match(weather, /getBoundingClientRect\(\)\.height\) \+ 12/);
    assert.match(weather, /window\.scrollY \+ section\.getBoundingClientRect\(\)\.top - headerOffset/);
    assert.match(weather, /window\.scrollTo\(\{\s*top,\s*behavior: reduceMotion \? "auto" : "smooth"/);
    assert.match(weather, /panel\.querySelector\("\.weather-details-back-to-top"\)\?\.addEventListener\(\s*"click",\s*scrollWeatherSectionToTop\s*\)/);
});

test("the control is centered between the title and weather temperature", () => {
    assert.match(css, /#weatherSection #weatherDayDetails \.weather-details-header\s*\{[^}]*display:grid !important;[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\) !important;/);
    assert.match(css, /#weatherSection #weatherDayDetails \.weather-details-back-to-top\s*\{[^}]*justify-self:center;/);
    assert.match(css, /#weatherSection #weatherDayDetails \.weather-details-header-weather\s*\{[^}]*justify-self:end;/);
});

test("the centered button remains compact and readable on small phones", () => {
    assert.match(css, /@media \(max-width:760px\)[\s\S]*?\.weather-details-back-to-top\s*\{[^}]*font-size:10px;/);
    assert.match(css, /@media \(max-width:360px\)[\s\S]*?\.weather-details-back-to-top\s*\{[^}]*font-size:9px;/);
    assert.match(css, /\.weather-details-back-to-top:focus-visible/);
});
