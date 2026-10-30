import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const news = readFileSync(new URL("../news-ui.js", import.meta.url), "utf8");

const responsiveStart = css.lastIndexOf("RESPONSIVE INFORMATION PANELS + MOBILE AI CHAT");
assert.ok(responsiveStart >= 0, "final responsive detail-panel rules exist");
const responsive = css.slice(responsiveStart);

test("phone AI chat overrides the legacy narrow dialog width and fills the viewport", () => {
    const aiRules = responsive.slice(responsive.lastIndexOf("The phone AI chat must override"));
    assert.match(aiRules, /@media\s*\(max-width:\s*760px\)/);
    assert.match(aiRules, /\.ai-chat-overlay\.open \.ai-chat-card\s*\{[^}]*width:\s*calc\(100vw - 12px\) !important;[^}]*max-width:\s*calc\(100vw - 12px\) !important;[^}]*height:\s*calc\(100dvh - 12px\) !important;[^}]*max-height:\s*calc\(100dvh - 12px\) !important;/);
    assert.match(aiRules, /\.ai-chat-overlay\s*\{[^}]*padding:\s*6px !important;/);
});

test("discovery detail dialogs fit the phone viewport and scroll within their own panel", () => {
    for (const selector of [
        "#cryptoDetailOverlay.open .crypto-detail-card",
        "#currencyDetailModal.is-open .currency-detail-dialog",
        "#worthItMarketDetailModal.is-open .worth-it-market-detail-dialog",
        "#waterLevelsDetailOverlay.open .water-levels-detail-card",
        "#shipTrackingDetail.open .ship-tracking-detail-card",
        "#shopPartnerModal:not([hidden]) .shop-partner-modal"
    ]) {
        assert.ok(responsive.includes(selector), `Missing responsive sizing for ${selector}`);
    }

    assert.match(responsive, /width:\s*calc\(100vw - 20px\) !important;/);
    assert.match(responsive, /max-height:\s*calc\(100dvh - 20px\) !important;/);
    assert.match(responsive, /overflow-y:\s*auto !important;/);
    assert.match(responsive, /overscroll-behavior:\s*contain !important;/);
});

test("weather selected-day information remains full-width and reorganizes its details on phones", () => {
    assert.match(responsive, /#weatherDayDetails\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*900px;/);
    assert.match(responsive, /#weatherDayDetails \.weather-details-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\) !important;/);
    assert.match(responsive, /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*?#weatherDayDetails \.weather-details-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\) !important;/);
});

test("vehicle details retain their sticky-header clearance and internal scrolling", () => {
    assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*?#worthItVehicleDetailsModal\s*\{[^}]*top:\s*calc\(60px \/ var\(--ui-scale, 1\)\)/);
    assert.match(css, /#worthItVehicleDetailsModal\.is-open \.worth-it-vehicle-modal-dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 76px\) !important;[^}]*overflow-y:\s*auto !important;/);
});

test("News story cards continue to open the publisher article safely in a new tab", () => {
    assert.match(news, /href="\$\{escapeNewsHtml\(article\.url \|\| "#"\)\}"[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/);
});

test("the responsive stylesheet cache key is refreshed", () => {
    assert.match(html, /style\.css\?v=detail-panels-overlay-blue-backdrop-20261030a/);
});
