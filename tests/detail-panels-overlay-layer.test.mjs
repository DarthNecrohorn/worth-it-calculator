import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const shop = readFileSync(new URL("../shop.js", import.meta.url), "utf8");
const ships = readFileSync(new URL("../ship-tracking-ui.js", import.meta.url), "utf8");

const marker = css.lastIndexOf("DETAIL PANELS ABOVE THE GLOBAL HEADER");
assert.ok(marker >= 0, "final overlay layering rules exist");
const finalRules = css.slice(marker);

test("all discovery detail panels render above the global header and its menus", () => {
    for (const selector of [
        "#cryptoDetailOverlay.open",
        "#currencyDetailModal.is-open",
        "#worthItMarketDetailModal.is-open",
        "#waterLevelsDetailOverlay.open",
        "#shipTrackingDetail.open",
        "#shopPartnerModal:not([hidden])",
        "#worthItVehicleDetailsModal.is-open"
    ]) {
        assert.ok(finalRules.includes(selector), `Missing overlay layer for ${selector}`);
    }
    assert.match(finalRules, /\.nav\s*\{\s*z-index:\s*12000 !important;/);
    assert.match(finalRules, /z-index:\s*15000 !important;/);
    assert.match(finalRules, /\.more-menu[\s\S]*?\.settings-panel[\s\S]*?z-index:\s*12020 !important;/);
});

test("detail panel backdrop has the blue ambient glow outside the dialog", () => {
    assert.match(finalRules, /radial-gradient\(ellipse at 50% 38%, rgba\(37,99,235/);
    assert.match(finalRules, /backdrop-filter:\s*blur\(9px\)/);
    assert.match(finalRules, /#currencyDetailModal\.is-open \.currency-detail-backdrop\s*\{[\s\S]*?radial-gradient/);
});

test("Shop partner panel ignores backdrop clicks and closes with its X button", () => {
    const setupStart = shop.indexOf("function setupShopPartnerDetails(container, allItems)");
    const closeBinding = shop.indexOf('closeButton.addEventListener("click", closeModal)', setupStart);
    const backdropBinding = shop.indexOf('overlay.addEventListener("click", function(event){', closeBinding);
    const dialogKeydown = shop.indexOf('dialog.addEventListener("keydown"', backdropBinding);

    assert.ok(setupStart >= 0, "Shop partner modal setup exists");
    assert.ok(closeBinding > setupStart, "the explicit X button closes the panel");
    assert.ok(backdropBinding > closeBinding, "the backdrop listener is registered after the close button");
    assert.ok(dialogKeydown > backdropBinding, "the backdrop listener has a bounded handler");

    const backdropHandler = shop.slice(backdropBinding, dialogKeydown);
    assert.match(backdropHandler, /if\s*\(\s*event\.target\s*===\s*overlay\s*\)\s*\{\s*event\.preventDefault\(\);/);
    assert.doesNotMatch(backdropHandler, /closeModal\s*\(/);
});
test("Ship Tracking detail panel is not dismissed by clicking outside its dialog", () => {
    assert.match(ships, /overlay\.addEventListener\("click", function\(event\)\{\s*if\(event\.target === overlay\)\{\s*event\.preventDefault\(\);\s*return;/);
    assert.doesNotMatch(ships, /if\(event\.target === overlay\)\{\s*closeDetailModal\(\);/);
    assert.match(ships, /event\.target\.closest\("#shipTrackingDetailClose"\)/);
});
