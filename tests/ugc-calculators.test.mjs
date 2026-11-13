import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { onRequestGet, onRequestPost, onRequestOptions, resolveExplicitCurrency, resolveExplicitCurrencies, resolvePromptCountry, resolveRegionalDefaults, createAiUsageCollector, recordAiUsageAttempt, summarizeAiUsage, normalizeDefinition } from "../functions/api/ugc-maker.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const style = read("style.css");
const routing = read("routing.js");
const guest = read("guest-mode.js");
const maker = read("ugc-calculators.js");
const calculatorEngineSource = read("ugc-calculator-engine.js");
const makerApi = read("functions/api/ugc-maker.js");
const profile = read("profile-ui.js");
const chat = read("chat-ui.js");
const community = read("community-features.js");
const economy = read("calc-economy.js");
const calcEconomySource = economy;
const sql = read("supabase/worth-it-ugc-badges.sql");
const makerQuotaSql = read("supabase/worth-it-ugc-maker-generation-refunds.sql");
const manualBuilderSql = read("supabase/worth-it-ugc-manual-builder-ai-costs.sql");
const composableBuilderSql = read("supabase/worth-it-ugc-composable-builder.sql");
const uniqueViewsSql = read("supabase/worth-it-ugc-unique-views.sql");
const creatorLeaderboardsSql = read("supabase/worth-it-creator-leaderboards.sql");
const uniqueViewsFixture = read("tests/fixtures/ugc-unique-views-pre-migration.sql");
const sqlEnhancements = read("supabase/worth-it-ugc-enhancements.sql");
const paginationSql = read("supabase/worth-it-ugc-pagination.sql");
const visibilitySql = read("supabase/worth-it-ugc-visibility-categories-drafts.sql");
const paginationCss = read("ugc-calculators.css");
const webShopCss = read("web-shop.css");
const paginationFixture = read("tests/fixtures/ugc-badges-postgres-smoke.sql");
const publishNotificationsSql = read("supabase/worth-it-ugc-publish-notifications.sql");

const calculatorCurrencyDataSource=read("ugc-calculator-currency-data.js");
const currencySandbox={};
runInNewContext(calculatorCurrencyDataSource,currencySandbox);
const currencyData=currencySandbox.WorthItCalculatorCurrencyData;
if(!Array.isArray(currencyData?.currencies)||!Array.isArray(currencyData?.historicalCurrencies))throw new Error("The shared calculator currency fixture could not be loaded.");
function createCalculatorEngine(){
 const sandbox={};
 runInNewContext(calculatorEngineSource,sandbox);
 return sandbox.WorthItCalculatorEngine.create(currencyData);
}

const profileCardsSql = read("supabase/worth-it-ugc-profile-cards.sql");
const reactionPolicySql = read("supabase/worth-it-ugc-reaction-policy.sql");
const reactionPolicyPrivacySql = read("supabase/worth-it-ugc-reaction-policy-owner-privacy.sql");
const workflow = read(".github/workflows/function-syntax-check.yml");

const previewOrigin = "https://pr-preview.worth-it-calculator.pages.dev";
const validDefinition = {
    title: "Monthly savings growth",
    description: "Estimate savings with monthly deposits.",
    category: "money",
    subcategories: ["budgeting", "saving"],
    inputs: [
        { key: "starting_amount", label: "Starting savings", min: 0, max: 1000000, default: 1000, step: 1, unit: "EUR" },
        { key: "monthly_deposit", label: "Monthly deposit", min: 0, max: 100000, default: 300, step: 1, unit: "EUR" },
        { key: "years", label: "Years", min: 1, max: 80, default: 5, step: 1, unit: "" }
    ],
    results: [
        { label: "Total deposits", expression: "starting_amount + monthly_deposit * 12 * years", format: "currency", currency: "EUR" }
    ]
};

function request(body, options = {}) {
    const origin = options.origin || previewOrigin;
    const headers = new Headers({ Origin: origin, Accept: "application/json" });
    if (options.token) headers.set("Authorization", "Bearer " + options.token);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    return new Request(origin + "/api/ugc-maker", {
        method: options.method || "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

function withFetch(mock, callback, quotaEvents = {}) {
    const previous = globalThis.fetch;
    const defaultRpcResponse = payload => new Response(JSON.stringify(payload), { status: 200 });
    globalThis.fetch = async (url, options) => {
        const path = String(url);
        if (path.endsWith("/rest/v1/rpc/settle_worth_it_ugc_ai_operation")) {
            quotaEvents.settlements = (quotaEvents.settlements || 0) + 1;
            return defaultRpcResponse({ ok: true, settled: true });
        }
        if (path.endsWith("/rest/v1/rpc/refund_worth_it_ugc_ai_operation")) {
            quotaEvents.refunds = (quotaEvents.refunds || 0) + 1;
            return defaultRpcResponse({ ok: true, refunded: true });
        }
        return mock(url, options);
    };
    return Promise.resolve().then(callback).finally(() => { globalThis.fetch = previous; });
}

test("UGC Maker Preview diagnostics verify the exact six-result prompt without reserving AI quota", async () => {
    const prompt=[
        "Create a Monthly Car Ownership Cost Calculator in English.",
        "",
        "Inputs:",
        "- Monthly distance driven (km)",
        "- Fuel consumption (L/100 km)",
        "- Fuel price per liter",
        "- Monthly insurance",
        "- Monthly maintenance/repairs",
        "- Monthly parking",
        "- Monthly tolls",
        "- Optional monthly loan/lease payment (allow 0)",
        "- Comparison period in months (integer, min 1, default 12)",
        "",
        "Results:",
        "- Monthly fuel cost",
        "- Total monthly ownership cost",
        "- Average weekly ownership cost",
        "- Total yearly ownership cost",
        "- Total cost over the selected months",
        "- Cost per kilometer",
        "",
        "Use correct, explicit formulas and avoid double-counting. Allow optional costs to be zero and use positive minimums for required quantities. Keep weekly, monthly and yearly figures mathematically consistent. Use one currency consistently for every monetary input and result; do not convert currencies. Choose realistic defaults and sensible minimums, maximums and steps. Add a concise description of included costs and assumptions."
    ].join("\n");
    const url=new URL(previewOrigin+"/api/ugc-maker");
    url.searchParams.set("diagnostic","coverage");
    url.searchParams.set("prompt",prompt);
    const response=await onRequestGet({request:new Request(url,{headers:{Origin:previewOrigin}})});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.success,true);
    assert.equal(result.diagnostic,"ugc-maker-output-coverage");
    assert.equal(result.build,"2026-11-11-autonomous-quality-v3");
    assert.equal(result.promptLength, prompt.length);
    assert.equal(result.requestedResultItems.length,6);
    assert.deepEqual(result.missingCoverage,[]);
    assert.equal(result.passed,true);

    url.searchParams.set("labels",JSON.stringify([
        "Monthly fuel cost",
        "Total monthly ownership cost",
        "Total cost over the selected months",
        "Cost per kilometer"
    ]));
    const incomplete=await onRequestGet({request:new Request(url,{headers:{Origin:previewOrigin}})});
    const incompleteResult=await incomplete.json();
    assert.equal(incompleteResult.passed,false);
    assert.deepEqual(incompleteResult.missingCoverage,["weekly result","yearly result","total yearly"]);
});

test("UGC AI Creator accepts a 1000-character prompt and rejects 1001 characters", async () => {
    assert.match(html, /id="ugcMakerPrompt"[^>]*maxlength="1000"/);
    assert.ok(maker.includes("if(prompt.length<10||prompt.length>1000)"));
    assert.match(makerApi, /const MAX_PROMPT_CHARS = 1000;/);
    assert.match(makerApi, /10 to 1000 characters/);

    const candidate = structuredClone(validDefinition);
    let providerCalls = 0;
    await withFetch(async url => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        providerCalls++;
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(candidate) } }]
        }), { status: 200 });
    }, async () => {
        const env = { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" };
        const accepted = await onRequestPost({
            request: request({ prompt: "x".repeat(1000) }, { token: "valid-token" }),
            env
        });
        assert.equal(accepted.status, 200, "exactly 1000 characters must be accepted");

        const rejected = await onRequestPost({
            request: request({ prompt: "x".repeat(1001) }, { token: "valid-token" }),
            env
        });
        assert.equal(rejected.status, 400, "1001 characters must be rejected");
        assert.match((await rejected.json()).error, /10 to 1000 characters/);
        assert.equal(providerCalls, 1, "the over-limit prompt must be rejected before any AI provider call");
    });
});

test("AI Maker zeros unprovided monetary defaults but preserves explicitly supplied prices", async () => {
    const definition = {
        title: "Electricity and Water Costs",
        description: "Compare monthly household electricity and water costs.",
        category: "home",
        subcategories: ["utilities-energy", "household-budget"],
        inputs: [
            { key: "electricity_kwh", label: "Monthly electricity usage", min: 10, max: 3000, default: 350, step: 10, unit: "kWh" },
            { key: "electricity_rate", label: "Electricity rate per kWh", min: 1, max: 50, default: 12, step: 0.5, unit: "RSD/kWh" },
            { key: "electricity_fixed", label: "Electricity fixed monthly fee", min: 0, max: 2000, default: 250, step: 10, unit: "RSD" },
            { key: "water_m3", label: "Monthly water consumption", min: 1, max: 100, default: 12, step: 0.5, unit: "m³" },
            { key: "water_rate", label: "Water rate per m3", min: 10, max: 500, default: 95, step: 1, unit: "RSD/m3" },
            { key: "water_fixed", label: "Water fixed monthly fee", min: 0, max: 2000, default: 150, step: 10, unit: "RSD" }
        ],
        results: [
            { label: "Monthly electricity cost", expression: "electricity_kwh*electricity_rate+electricity_fixed", format: "currency", currency: "RSD" },
            { label: "Monthly water cost", expression: "water_m3*water_rate+water_fixed", format: "currency", currency: "RSD" },
            { label: "Electricity share of combined cost", expression: "(electricity_kwh*electricity_rate+electricity_fixed)/max(electricity_kwh*electricity_rate+electricity_fixed+water_m3*water_rate+water_fixed,1)", format: "percent", currency: "RSD" }
        ]
    };
    const generate = async (prompt, generatedDefinition = definition) => {
        const quotaEvents = { refunds: 0, settlements: 0 };
        let result;
        await withFetch(async url => {
            const path = String(url);
            if (path.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
            if (path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
            return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(generatedDefinition) } }] }), { status: 200 });
        }, async () => {
            const response = await onRequestPost({
                request: request({ prompt }, { token: "valid-token" }),
                env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
            });
            assert.equal(response.status, 200);
            result = await response.json();
        }, quotaEvents);
        return result.calculator;
    };
    const withoutPrices = await generate("Electricity vs water consumption at home in Serbia");
    const inputs = Object.fromEntries(withoutPrices.spec.inputs.map(item => [item.key, item]));
    assert.equal(inputs.electricity_kwh.default, 350);
    assert.equal(inputs.water_m3.default, 12);
    for (const key of ["electricity_rate", "electricity_fixed", "water_rate", "water_fixed"]) {
        assert.equal(inputs[key].default, 0, key + " must not receive an invented monetary default");
        assert.equal(inputs[key].min, 0, key + " must allow an unprovided value to remain zero");
    }
    assert.match(withoutPrices.description, /unspecified monetary fields start at zero/i);

    const withOnePrice = await generate("Compare electricity and water costs using 12 RSD per kWh.");
    const onePriceInputs = Object.fromEntries(withOnePrice.spec.inputs.map(item => [item.key, item]));
    assert.equal(onePriceInputs.electricity_rate.default, 12, "the explicitly supplied electricity rate should be preserved");
    for (const key of ["electricity_fixed", "water_rate", "water_fixed"]) {
        assert.equal(onePriceInputs[key].default, 0, key + " must stay zero because the prompt did not supply its value");
        assert.equal(onePriceInputs[key].min, 0, key + " must allow zero");
    }
    assert.match(withOnePrice.description, /unspecified monetary fields start at zero/i);

    const sameUnitDefinition = {
        title: "Fuel Price Comparison",
        description: "Compare editable petrol and diesel prices per liter.",
        category: "cars",
        subcategories: ["fuel-costs"],
        inputs: [
            { key: "petrol_rate", label: "Petrol price per liter", min: 1, max: 500, default: 190, step: 1, unit: "RSD/L" },
            { key: "diesel_rate", label: "Diesel price per liter", min: 1, max: 500, default: 210, step: 1, unit: "RSD/L" }
        ],
        results: [
            { label: "Petrol price", expression: "petrol_rate", format: "unit", currency: "RSD", unit: "RSD/L" },
            { label: "Diesel price", expression: "diesel_rate", format: "unit", currency: "RSD", unit: "RSD/L" }
        ]
    };
    const oneFuelPrice = await generate("Set petrol price to 190 RSD per liter.", sameUnitDefinition);
    const fuelInputs = Object.fromEntries(oneFuelPrice.spec.inputs.map(item => [item.key, item]));
    assert.equal(fuelInputs.petrol_rate.default, 190);
    assert.equal(fuelInputs.diesel_rate.default, 0, "one per-liter price must not prefill another per-liter field");

    const withPrices = await generate("Compare electricity and water costs using 12 RSD per kWh and 95 RSD per m3.");
    const explicitInputs = Object.fromEntries(withPrices.spec.inputs.map(item => [item.key, item]));
    assert.equal(explicitInputs.electricity_rate.default, 12);
    assert.equal(explicitInputs.water_rate.default, 95);
    assert.equal(explicitInputs.electricity_fixed.default, 0, "an explicit unit rate must not authorize an invented fixed fee");
    assert.equal(explicitInputs.water_fixed.default, 0, "an explicit unit rate must not authorize an invented fixed fee");
});

test("short topic prompts are treated as requests for autonomous calculator design", async () => {
    const candidate = structuredClone(validDefinition);
    let generationSystem = "";
    let providerConfig = null;
    await withFetch(async (url, options) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        const body = JSON.parse(options.body);
        generationSystem = body.messages[0].content;
        providerConfig = body;
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(candidate) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Electricity vs water consumption at home in Serbia" }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 200);
        assert.match(generationSystem, /short topic descriptions as intentional requests/i);
        assert.match(generationSystem, /smallest useful set of inputs and result rows/i);
        assert.match(generationSystem, /Never invent current tariffs, fuel prices/i);
        assert.match(generationSystem, /editable input rather than guessing/i);
        assert.match(generationSystem, /Do not reject or overcomplicate a request/i);
        assert.match(generationSystem, /experienced subject-matter analyst and calculator designer/i);
        assert.match(generationSystem, /Every input must have a clear purpose and must be used by at least one result formula/i);
        assert.match(generationSystem, /Maintain dimensional and unit consistency/i);
        assert.match(generationSystem, /model both options symmetrically/i);
        assert.match(generationSystem, /Avoid double-counting overlapping costs/i);
        assert.match(generationSystem, /Only a monetary input that can be unambiguously matched to a concrete amount/i);
        assert.match(generationSystem, /illustrative starting estimates rather than typical national averages/i);
        assert.match(generationSystem, /average effective rate/i);
        assert.match(generationSystem, /do not claim that tiered or seasonal tariffs are calculated/i);
        assert.match(generationSystem, /silently audit it as a calculator designer/i);
        assert.equal(providerConfig.model, "openai/gpt-oss-120b");
        assert.equal(providerConfig.reasoning_effort, "high");
        assert.equal(providerConfig.max_tokens, 8192);
    });
});

test("regional defaults prefer RSD for Serbia, USD for the US, EUR for Bulgaria and USD when country data is unavailable", () => {
    const requestFor = (country, language) => ({
        cf: country ? { country } : {},
        headers: new Headers(language ? { "Accept-Language": language } : {})
    });
    assert.equal(resolveRegionalDefaults(requestFor("RS", "sr-Latn-RS,sr;q=0.9,en;q=0.8")).currency, "RSD");
    assert.equal(resolveRegionalDefaults(requestFor("RS", "sr-Latn-RS")).locale, "sr-Latn-RS");
    assert.equal(resolveRegionalDefaults(requestFor("US", "sr-Latn-RS,en-US;q=0.8")).locale, "sr-Latn-RS", "the browser language preference takes precedence over the country fallback");
    assert.equal(resolveRegionalDefaults(requestFor("US", "en-US")).currency, "USD");
    assert.equal(resolveRegionalDefaults(requestFor("DE", "de-DE")).currency, "EUR");
    assert.equal(resolvePromptCountry("Compare monthly electricity and natural gas costs for a household in Germany."), "DE");
    const GermanyPromptDefaults=resolveRegionalDefaults(requestFor("RS", "en-US"), "Compare monthly electricity and natural gas costs for a household in Germany.");
    assert.equal(GermanyPromptDefaults.country, "DE", "an explicitly named calculator country must override the visitor's country");
    assert.equal(GermanyPromptDefaults.currency, "EUR", "Germany must use EUR even when the visitor is in Serbia");
    assert.equal(GermanyPromptDefaults.locale, "en-US", "country context must not silently change the visitor's chosen number format");
    assert.equal(resolveRegionalDefaults(requestFor("BG", "bg-BG")).currency, "EUR");
    assert.equal(resolveRegionalDefaults({ cf: { country: "RO", continent: "EU" }, headers: new Headers() }).currency, "EUR");
    assert.equal(resolveRegionalDefaults({ cf: { country: "EG", continent: "AF" }, headers: new Headers() }).currency, "USD");
    assert.equal(resolveRegionalDefaults(requestFor("", "en-GB")).currency, "USD");
    assert.equal(resolveRegionalDefaults(requestFor("", "en-GB")).locale, "en-GB");
});

test("AI Maker uses regional currency only as an editable default and never stores or requests a raw IP address", async () => {
    const candidate = structuredClone(validDefinition);
    candidate.inputs[0].unit = "USD";
    candidate.results[0].currency = "USD";
    const req = request({ prompt: "Create a monthly savings calculator." }, { token: "valid-token" });
    Object.defineProperty(req, "cf", { value: { country: "RS" } });
    await withFetch(async (url, options) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        const body = JSON.parse(options.body);
        assert.doesNotMatch(body.messages[0].content, /regional suggestion RSD/i);
        assert.match(body.messages[1].content, /Regional defaults: currency RSD/i);
        assert.match(body.messages[0].content, /same language as the user's prompt when that language is clearly identifiable/i);
        assert.match(body.messages[0].content, /If the prompt has no clear language or is language-neutral\/ambiguous, use English/i);
        assert.match(body.messages[0].content, /Do not use the visitor's country, region or Accept-Language header to choose the language of calculator text/i);
        assert.match(body.messages[0].content, /Accept-Language and regional settings are for number formatting and currency defaults only/i);
        assert.doesNotMatch(JSON.stringify(body), /client.?ip|ip.?address/i);
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(candidate) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: req,
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.regionalDefaults.currency, "RSD");
        assert.equal(result.calculator.spec.inputs[0].unit, "RSD");
        assert.equal(result.calculator.spec.results[0].currency, "RSD");
    });
});

test("a country named in the calculator prompt overrides visitor-region currency defaults", async () => {
    const candidate = structuredClone(validDefinition);
    candidate.inputs[0].unit = "USD";
    candidate.results[0].currency = "USD";
    const req = request({ prompt: "Compare monthly electricity and natural gas costs for a household in Germany." }, { token: "valid-token" });
    req.headers.set("Accept-Language","en-US");
    Object.defineProperty(req, "cf", { value: { country: "RS", continent: "EU" } });
    await withFetch(async (url, options) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        const body = JSON.parse(options.body);
        assert.doesNotMatch(body.messages[0].content, /regional suggestion EUR/i);
        assert.match(body.messages[1].content, /Regional defaults: currency EUR/i);
        assert.match(body.messages[1].content, /currency EUR/i);
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(candidate) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: req,
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.regionalDefaults.country, "DE");
        assert.equal(result.regionalDefaults.currency, "EUR");
        assert.equal(result.regionalDefaults.locale, "en-US");
        assert.equal(result.calculator.spec.inputs[0].unit, "EUR");
        assert.equal(result.calculator.spec.results[0].currency, "EUR");
    });
});

test("an explicit prompt currency overrides the EUR or USD regional suggestion", async () => {
    assert.equal(resolveExplicitCurrency("Show all amounts in RSD."), "RSD");
    assert.equal(resolveExplicitCurrency("Use euros for every result."), "EUR");
    assert.equal(resolveExplicitCurrency("Use U.S. dollars for every result."), "USD");
    assert.equal(resolveExplicitCurrency("Try this calculator."), null, "ordinary English try must not be mistaken for Turkish lira");
    assert.deepEqual(resolveExplicitCurrencies("Compare USD and EUR using an exchange rate."), ["EUR","USD"]);
    assert.equal(resolveExplicitCurrency("Compare USD and EUR using an exchange rate."), null);
    const candidate = structuredClone(validDefinition);
    candidate.inputs[0].unit = "USD";
    candidate.results[0].currency = "USD";
    const req = request({ prompt: "Create a monthly savings calculator. Use RSD for all monetary inputs and results." }, { token: "valid-token" });
    Object.defineProperty(req, "cf", { value: { country: "RS", continent: "EU" } });
    await withFetch(async (url, options) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        const body = JSON.parse(options.body);
        assert.match(body.messages[1].content, /Explicitly requested currencies: RSD/i);
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(candidate) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: req,
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.regionalDefaults.currency, "RSD");
        assert.equal(result.calculator.spec.inputs[0].unit, "RSD");
        assert.equal(result.calculator.spec.results[0].currency, "RSD");
    });
});

test("AI Maker preserves all six explicitly requested car-cost results without inventing a weekly-total requirement", async () => {
    const candidate={
        title:"Monthly Car Ownership Cost Calculator",
        description:"Estimate recurring vehicle costs from fuel, insurance, maintenance, parking, tolls and optional financing. Weekly and yearly figures assume monthly costs remain consistent over time.",
        category:"cars",
        subcategories:["car-ownership","fuel-costs"],
        inputs:[
            {key:"monthly_distance_km",label:"Monthly distance driven",min:1,max:10000,default:1200,step:1,unit:"km"},
            {key:"fuel_consumption",label:"Fuel consumption",min:1,max:30,default:7,step:0.1,unit:"L/100 km"},
            {key:"fuel_price_per_liter",label:"Fuel price per liter",min:0.1,max:10,default:1.5,step:0.01,unit:"EUR/L"},
            {key:"monthly_insurance",label:"Monthly insurance",min:0,max:1000,default:50,step:1,unit:"EUR"},
            {key:"monthly_maintenance",label:"Monthly maintenance and repairs",min:0,max:1500,default:75,step:1,unit:"EUR"},
            {key:"monthly_parking",label:"Monthly parking",min:0,max:1000,default:50,step:1,unit:"EUR"},
            {key:"monthly_tolls",label:"Monthly tolls",min:0,max:500,default:20,step:1,unit:"EUR"},
            {key:"monthly_loan_payment",label:"Optional monthly loan or lease payment",min:0,max:5000,default:0,step:1,unit:"EUR"},
            {key:"comparison_months",label:"Comparison period in months",min:1,max:120,default:12,step:1,unit:""}
        ],
        results:[
            {label:"Monthly fuel cost",expression:"monthly_distance_km*fuel_consumption/100*fuel_price_per_liter",format:"currency",currency:"EUR"},
            {label:"Total monthly ownership cost",expression:"monthly_distance_km*fuel_consumption/100*fuel_price_per_liter+monthly_insurance+monthly_maintenance+monthly_parking+monthly_tolls+monthly_loan_payment",format:"currency",currency:"EUR"},
            {label:"Average weekly ownership cost",expression:"(monthly_distance_km*fuel_consumption/100*fuel_price_per_liter+monthly_insurance+monthly_maintenance+monthly_parking+monthly_tolls+monthly_loan_payment)*12/52",format:"currency",currency:"EUR"},
            {label:"Total yearly ownership cost",expression:"(monthly_distance_km*fuel_consumption/100*fuel_price_per_liter+monthly_insurance+monthly_maintenance+monthly_parking+monthly_tolls+monthly_loan_payment)*12",format:"currency",currency:"EUR"},
            {label:"Total cost over selected months",expression:"(monthly_distance_km*fuel_consumption/100*fuel_price_per_liter+monthly_insurance+monthly_maintenance+monthly_parking+monthly_tolls+monthly_loan_payment)*comparison_months",format:"currency",currency:"EUR"},
            {label:"Cost per kilometer",expression:"(monthly_distance_km*fuel_consumption/100*fuel_price_per_liter+monthly_insurance+monthly_maintenance+monthly_parking+monthly_tolls+monthly_loan_payment)/monthly_distance_km",format:"unit",currency:"EUR",unit:"EUR/km"}
        ]
    };
    const requestPrompt=[
        "Create a Monthly Car Ownership Cost Calculator in English.",
        "Inputs: Monthly distance driven (km); Fuel consumption (L/100 km); Fuel price per liter; Monthly insurance; Monthly maintenance/repairs; Monthly parking; Monthly tolls; Optional monthly loan/lease payment (allow 0); Comparison period in months (integer, min 1, default 12).",
        "Results: Monthly fuel cost; Total monthly ownership cost; Average weekly ownership cost; Total yearly ownership cost; Total cost over the selected months; Cost per kilometer.",
        "Use correct, explicit formulas and avoid double-counting. Allow optional costs to be zero and use positive minimums for required quantities. Keep weekly, monthly and yearly figures mathematically consistent. Use one currency consistently for every monetary input and result; do not convert currencies. Choose realistic defaults and sensible minimums, maximums and steps. Add a concise description of included costs and assumptions."
    ].join("\n");
    let providerCalls=0;
    await withFetch(async(url,options)=>{
        const path=String(url);
        if(path.endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation"))return new Response(JSON.stringify({ok:true,requests_used:1,daily_limit:1}),{status:200});
        providerCalls++;
        const providerRequest=JSON.parse(options.body);
        assert.equal(providerRequest.max_tokens,8192);
        const body=providerRequest;
        assert.match(body.messages[0].content,/separate result row for every output explicitly requested/);
        assert.match(body.messages[0].content,/Support up to 20 result rows/);
        assert.match(body.messages[0].content,/genuinely informative description/i);
        assert.match(body.messages[0].content,/140 to 380 characters/);
        assert.match(body.messages[0].content,/time-basis conversions or consistency assumptions/);
        assert.match(body.messages[0].content,/never invent exclusions, data sources, prices, rates, guarantees or unsupported claims/);
        assert.doesNotMatch(body.messages[0].content,/1 to 4 result rows/);
        assert.match(body.messages[1].content,/Explicit result checklist from the user's Results section/);
        const checklistText=body.messages[1].content.toLowerCase().replace(/\bthe\b/g,"").replace(/\s+/g," ");
        for (const label of candidate.results.map(item=>item.label)) assert.ok(checklistText.includes(label.toLowerCase().replace(/\bthe\b/g,"").replace(/\s+/g," ")), "Missing explicit result checklist item: "+label);
        assert.equal((body.messages[1].content.match(/^- /gm)||[]).length,6);
        assert.doesNotMatch(body.messages[1].content,/^- Total weekly ownership cost/im);
        const groqCandidate=structuredClone(candidate);
        delete groqCandidate.category;
        delete groqCandidate.subcategories;
        groqCandidate.classification={category:"cars",subcategories:["car-ownership","fuel-costs"]};
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(groqCandidate)}}]}),{status:200});
    },async()=>{
        const response=await onRequestPost({
            request:request({prompt:requestPrompt},{token:"valid-token"}),
            env:{SUPABASE_URL:"https://supabase.example",SUPABASE_PUBLISHABLE_KEY:"publishable",GROQ_API_KEY:"groq-test"}
        });
        const responseData=await response.clone().json();
        assert.equal(response.status,200,JSON.stringify(responseData));
        const result=await response.json();
        assert.equal(result.success,true);
        assert.equal(result.calculator.spec.results.length,6);
        assert.deepEqual(result.calculator.spec.results.map(item=>item.label),candidate.results.map(item=>item.label));
        assert.equal(providerCalls,1);
    });
});

test("AI Maker rejects omitted requested periods and required calculator inputs", async () => {
    const incomplete = {
        title: "Commute Cost Calculator",
        description: "Estimate commute expenses from distance, fuel use, fuel price and parking assumptions.",
        category: "cars",
        subcategories: ["fuel-costs"],
        inputs: [
            { key: "commuting_days_per_week", label: "Commuting days per week", min: 0, max: 7, default: 5, step: 1, unit: "" },
            { key: "daily_distance_km", label: "Daily round-trip distance", min: 0, max: 1000, default: 30, step: 0.1, unit: "km" },
            { key: "fuel_consumption", label: "Fuel consumption", min: 0, max: 50, default: 7, step: 0.1, unit: "L/100 km" },
            { key: "fuel_price", label: "Fuel price", min: 0, max: 1000, default: 200, step: 0.1, unit: "EUR/L" },
            { key: "daily_parking_cost", label: "Daily parking cost", min: 0, max: 10000, default: 0, step: 0.1, unit: "EUR" }
        ],
        results: [
            { label: "Weekly fuel cost", expression: "commuting_days_per_week*(daily_distance_km*fuel_consumption/100)*fuel_price", format: "currency", currency: "EUR" },
            { label: "Weekly parking cost", expression: "commuting_days_per_week*daily_parking_cost", format: "currency", currency: "EUR" },
            { label: "Total weekly cost", expression: "commuting_days_per_week*((daily_distance_km*fuel_consumption/100)*fuel_price+daily_parking_cost)", format: "currency", currency: "EUR" }
        ]
    };
    await withFetch(async (url, options) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(incomplete) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a commute cost calculator. Inputs: commuting days per week, daily round-trip distance, fuel consumption, fuel price and daily parking cost. Calculate fuel and parking costs, plus total weekly, monthly and yearly expenses." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 422);
        const result = await response.json();
        assert.equal(result.code, "INCOMPLETE_CALCULATOR", JSON.stringify(result));
        assert.match(result.error, /monthly result/i);
        assert.match(result.error, /yearly result/i);
        assert.match(makerApi, /Cover every requested output and time period/);
    });
});

test("AI Maker tests formulas at boundary values and normalizes positive-only inputs", async () => {
    const candidate = structuredClone(validDefinition);
    candidate.inputs[0] = {
        key: "commuting_days_per_week", label: "Commuting days per week",
        min: 0, max: 7, default: 5, step: 1, unit: ""
    };
    candidate.results[0].expression = "monthly_deposit/(years-1)";
    await withFetch(async (url, options) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(candidate) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a savings calculator." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 422);
        assert.match((await response.json()).error, /fails with a default, minimum or maximum input value/i);
    });
});

test("AI Maker catches invalid formulas caused only by paired input extremes", async () => {
    const candidate = structuredClone(validDefinition);
    for (const item of candidate.inputs.slice(0, 2)) {
        item.min = 0;
        item.max = 10;
        item.default = 5;
        item.step = 1;
    }
    candidate.results[0].expression = "sqrt((starting_amount-5)*(monthly_deposit-5)+1)";
    await withFetch(async (url, options) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(candidate) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a savings calculator." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 422);
        assert.match((await response.json()).error, /fails with a default, minimum or maximum input value/i);
    });
});

test("UGC Maker currency consistency warnings ignore physical units such as kWh", () => {
    const start=maker.indexOf("function makerCurrencyWarnings(spec){");
    const end=maker.indexOf("\n}",start)+2;
    assert.ok(start>=0&&end>start,"The currency consistency helper must exist.");
    const helper=runInNewContext(maker.slice(start,end)+"; makerCurrencyWarnings",{CURRENCIES:[["EUR","Euro"],["RSD","Serbian dinar"],["USD","US dollar"]]});
    const utilityWarnings=helper({
        inputs:[{unit:"kWh"},{unit:"m³"},{unit:"RSD"}],
        results:[{format:"currency",currency:"RSD"}]
    });
    assert.deepEqual(Array.from(utilityWarnings),[]);
    const mixedCurrencyWarnings=helper({
        inputs:[{unit:"RSD"},{unit:"EUR"}],
        results:[{format:"currency",currency:"RSD"}]
    });
    assert.deepEqual(Array.from(mixedCurrencyWarnings),["EUR input → RSD result"]);
});

test("UGC Maker exposes editable regional number formatting, currency consistency warnings and free boundary tests", () => {
    assert.match(maker, /Regional suggestion:/);
    assert.match(maker, /Number format/);
    assert.match(maker, /validateMakerSpec/);
    assert.match(maker, /Formula dependencies, unit compatibility and input boundaries were checked/);
    assert.match(calculatorEngineSource, /for\(let left=0;left<inputs.length;left\+\+\)/);
    assert.match(calculatorEngineSource, /maxStepPosition/);
    assert.match(maker, /ugc-maker-test-locale/);
    assert.match(maker, /Currency consistency warning/);
    assert.match(maker, /Free local test · No CALC is charged, no AI request is sent, and nothing is saved/);
    assert.match(html, /AI generation costs 2 CALC for Free, 4 CALC for Premium Lite and 6 CALC for Premium/);
    assert.match(html, /Manual Builder uses no AI and costs no CALC/);
    assert.match(html, /Testing remains free and runs locally in your browser/);
    assert.match(maker, /24–500 characters/);
});

test("AI Maker can be closed only with its X button; backdrop clicks never dismiss it", () => {
    assert.ok(maker.includes('$("ugcMakerClose")?.addEventListener("click",closeMaker);'), "the X button is wired to close the maker");
    assert.ok(!maker.includes('addEventListener("click",event=>{\n  const shouldClose='), "there is no backdrop click-to-close handler");
    assert.ok(!maker.includes('makerBackdropPointerDown'), "there is no pointer-based backdrop dismissal");
    assert.ok(!maker.includes('$("ugcMakerOverlay")?.addEventListener("click"'), "clicking the calculator card never dismisses the maker");
});

test("AI Maker test mode recalculates locally with the restricted formula engine and never charges CALC", () => {
    const engine = createCalculatorEngine();
    const keys = new Set(["current_monthly_cost", "new_monthly_cost", "switching_fee", "period_months"]);
    const values = { current_monthly_cost: 30, new_monthly_cost: 10, switching_fee: 0, period_months: 12 };
    const expressions = [
        "current_monthly_cost * period_months",
        "new_monthly_cost * period_months + switching_fee",
        "current_monthly_cost * period_months - (new_monthly_cost * period_months + switching_fee)",
        "(current_monthly_cost * period_months - (new_monthly_cost * period_months + switching_fee)) / period_months"
    ];
    const results = expressions.map(expression => {
        try {
            return engine.evaluate(engine.compileExpression(expression, keys), values);
        } catch (error) {
            throw new Error("Formula failed: " + expression + " — " + (error?.message || error));
        }
    });
    assert.deepEqual(results, [360, 120, 240, 20], "the same evaluator should calculate the subscription example correctly");

    assert.match(maker, /button\("▶ Test calculator","ugc-maker-test-toggle"/);
    assert.match(maker, /function renderMakerTestPanel\(preserveValues\)/);
    assert.match(maker, /function updateMakerTestResults\(panel\)/);
    assert.match(maker, /control\.addEventListener\("input",\(\)=>updateMakerTestResults\(panel\)\)/);
    assert.match(calculatorEngineSource, /function evaluateFormulaResults\(spec/);
    assert.match(calculatorEngineSource, /function evaluate\(ast,values,groupValues/);
    assert.match(maker, /control\.dataset\.ugcMakerTestKey=String\(item\.key\)/);
    assert.match(maker, /control\.min=String\(item\.min\)/);
    assert.match(maker, /control\.max=String\(item\.max\)/);
    assert.match(maker, /renderMakerTestPanel\(true\)/, "formula edits refresh the open test panel while keeping sample values");
    const localTestCode = maker.slice(maker.indexOf("function refreshMakerTestIfOpen"), maker.indexOf("async function generateWithAI"));
    assert.match(localTestCode, /Free local test/);
    assert.doesNotMatch(localTestCode, /calc_wallet_(?:reserve|settle|refund)|\.rpc\(|fetch\(/, "test mode must never charge CALC or call a server");
    assert.match(paginationCss, /\.ugc-maker-test-panel/);
    assert.match(paginationCss, /\.ugc-maker-test-results-grid/);
});

test("the UGC calculator detail section is outside the home page that is hidden while a calculator is open", () => {
    const homeStart = html.indexOf('<section id="homePage">');
    const detailStart = html.indexOf('<section id="ugcDetailSection"');
    assert.ok(homeStart >= 0 && detailStart >= 0, "both page sections exist");
    const tags = /<\/?section\b[^>]*>/gi;
    tags.lastIndex = homeStart;
    let depth = 0;
    let homeEnd = -1;
    let match;
    while ((match = tags.exec(html))) {
        if (/^<section\b/i.test(match[0])) depth++;
        else depth--;
        if (depth === 0) { homeEnd = tags.lastIndex; break; }
    }
    assert.ok(homeEnd > homeStart && homeEnd < detailStart,
        "hiding #homePage must not hide #ugcDetailSection");
});

test("UGC visibility migration uses the same protected public/private RPC contract as the UI", () => {
    assert.match(visibilitySql,/create or replace function public\.publish_worth_it_ugc_calculator\(p_id uuid,p_visibility text\)/);
    assert.match(visibilitySql,/create or replace function public\.set_worth_it_ugc_visibility\(p_id uuid,p_visibility text\)/);
    assert.match(visibilitySql,/where id=p_id and owner_user_id=v_user_id and status='published'/);
    assert.match(visibilitySql,/NOTIFY pgrst, 'reload schema'/i);
    assert.match(visibilitySql,/using errcode='P0001'/);
    assert.match(paginationFixture,/exception when sqlstate '54000' then blocked:=true;/);
});

test("the UGC gallery, detail route, maker modal and profile sections are wired", () => {
    for (const id of [
        "ugcCommunitySection", "ugcCalculatorGrid", "ugcCreateButton", "ugcMakerModal",
        "ugcMakerPrompt", "ugcMakerPreview", "ugcMakerQuotaStatus", "ugcDetailSection", "ugcDetailKicker", "ugcDetailCalculatorForm",
        "worthItProfileFavouritesSection", "worthItProfileBadgesSection",
        "worthItProfileNameBadges", "worthItProfileFavouriteCalculators"
    ]) assert.ok(html.includes('id="' + id + '"'), id + " is present in the UI");

    for (const sort of ["latest", "popular", "liked", "favorited", "disliked", "mine", "my-drafts", "my-favorites"]) {
        assert.ok(html.includes('data-ugc-sort="' + sort + '"'), sort + " sort tab exists");
    }
    for (const period of ["today", "7d", "14d", "1m", "3m", "6m", "12m", "3y", "6y", "12y"]) {
        assert.ok(html.includes('value="' + period + '"'), period + " time filter exists");
        if (period === "12y") {
            assert.ok(sql.includes("else now()-interval '12 years'"), "12y is the default SQL time window");
        } else {
            assert.ok(sql.includes("when '" + period + "'"), period + " time filter is enforced by SQL");
        }
    }
    assert.ok(routing.includes("/calculator/ugc/"));
    assert.ok(routing.includes("ugc-calculator"));
    assert.ok(guest.includes("/calculator\\/ugc"));
    assert.ok(guest.includes("openWorthItUGCCalculator"));
    assert.doesNotMatch(maker, /MAX_CALCULATORS/);
    assert.doesNotMatch(html, /You can save up to 10 community calculators/);
    assert.ok(html.includes("There is no lifetime limit on saved community calculators."));
    assert.ok(html.includes('data-ugc-sort="my-drafts"'));
    assert.ok(maker.includes('state.sort==="my-drafts"'));
    assert.ok(maker.includes("set_worth_it_ugc_visibility"));
    assert.match(maker,/publish_worth_it_ugc_calculator",\{p_id:id,p_visibility:visibility\}/);
    assert.match(maker,/set_worth_it_ugc_visibility",\{p_id:id,p_visibility:target\}/);
    assert.match(maker,/state\.editingId=id;\s*state\.editingVisibility=visibility;/,
        "a saved draft ID is retained if the first publication attempt fails, so retries do not create duplicate calculators");
    assert.ok(html.includes("ugcMakerVisibilityWrap"));
    assert.ok(maker.includes("AI-selected categories"));
    assert.ok(html.includes("AI generation and AI improvement each have separate daily limits: Guest 0, Free 1, Premium Lite 2 and Premium 3."));
    assert.ok(maker.includes("get_worth_it_ugc_catalog_page"));
    assert.ok(maker.includes("p_sort:state.sort"));
    assert.ok(maker.includes("p_category:state.category"));
    assert.ok(maker.includes("p_page:currentCatalogPage()"));
    assert.ok(maker.includes("get_worth_it_ugc_creation_quota"));
    assert.ok(maker.includes("switchCalculatorExploreView"));
    assert.ok(html.includes("ugcBackToBasicButton"));
    assert.ok(html.includes("IMPORTANT — PLEASE READ BEFORE USING WORTH IT AI"));
    assert.ok(html.includes("Each successful AI reply costs"));
    assert.ok(maker.includes("update_worth_it_ugc_calculator_description"));
    assert.ok(maker.includes("get_worth_it_ugc_ai_edit_quota"));
    assert.ok(sqlEnhancements.includes("get_worth_it_my_favorite_ugc_calculators"));
    assert.match(profile,/get_worth_it_own_profile/);
    assert.match(profile,/select\("worth_it_id,username,display_name,avatar_url,banner_url,created_at"\)/);
    assert.match(profile,/window\.openWorthItOwnProfileConnections=/);
});

test("UGC Maker expands provider output limits and exposes safe result-coverage diagnostics", () => {
    assert.match(makerApi, /max_tokens:8192/);
    assert.match(makerApi, /maxOutputTokens:8192/);
    assert.match(makerApi, /finishReason==="MAX_TOKENS"/);
    assert.match(makerApi, /generatedResultLabels:finalCoverageAttempt\.resultLabels/);
    assert.match(makerApi, /coverageAttempts\.push\(/);
    assert.match(makerApi, /export async function onRequestGet\(context\)/);
});

test("AI Maker requires a confirmed account and emits restricted declarative calculator definitions", async () => {
    let calls = 0;
    await withFetch(async (url) => {
        calls++;
        assert.match(String(url), /\/auth\/v1\/user$/);
        return new Response(JSON.stringify({ id: "user-id" }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a calculator for monthly savings growth." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 403);
        assert.equal((await response.json()).code, "EMAIL_VERIFICATION_REQUIRED");
        assert.equal(calls, 1);
    });

    calls = 0;
    await withFetch(async (url, options) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        calls++;
        const body = JSON.parse(options.body);
        assert.equal(body.response_format.type, "json_schema");
        assert.equal(body.response_format.json_schema.strict, true);
        assert.equal(body.reasoning_effort, "high");
        assert.doesNotMatch(body.messages[0].content,/Regional defaults: currency|regional currency suggestion [A-Z]{3}/);
        assert.match(body.messages[1].content,/Regional defaults: currency [A-Z]{3}/);
        assert.equal(body.response_format.json_schema.schema.type,"object");
        const classificationSchema=body.response_format.json_schema.schema.properties.classification;
        assert.equal(classificationSchema.type,"object");
        assert.deepEqual(classificationSchema.properties.category.enum,["cars","money","technology","home","other"]);
        assert.equal(classificationSchema.properties.subcategories.type,"array");
        const subcategoryEnum=classificationSchema.properties.subcategories.items.enum;
        assert.ok(subcategoryEnum.includes("fuel-costs"));
        assert.ok(subcategoryEnum.includes("budgeting"));
        assert.ok(!Object.hasOwn(classificationSchema,"anyOf"),"Groq schema must not use ambiguous anyOf branches");
        assert.deepEqual(classificationSchema.required,["category","subcategories"]);
        assert.equal(classificationSchema.additionalProperties,false);
        const rootSchema=body.response_format.json_schema.schema;
        assert.ok(rootSchema.required.includes("classification"));
        assert.ok(rootSchema.required.includes("groups"));
        assert.ok(rootSchema.required.includes("scenarios"));
        assert.equal(rootSchema.properties.inputs.maxItems,24);
        const inputSchema=rootSchema.properties.inputs.items;
        assert.deepEqual(inputSchema.properties.control.enum,["number","slider","select","toggle"]);
        assert.ok(inputSchema.required.includes("choices"));
        assert.equal(rootSchema.properties.groups.maxItems,4);
        assert.equal(rootSchema.properties.results.maxItems,20);
        assert.ok(rootSchema.properties.results.items.required.includes("key"));
        assert.equal(rootSchema.properties.scenarios.maxItems,3);
        assert.equal(rootSchema.additionalProperties,false);
        assert.match(body.messages[0].content,/classification object/);
        assert.match(body.messages[0].content,/restricted arithmetic parser/);
        assert.match(body.messages[0].content,/dynamic groups/);
        assert.match(body.messages[0].content,/comparison scenario/);
        assert.match(body.messages[0].content,/sum\(group_key\.field_key\)/);
        assert.match(body.messages[0].content,/earlier result keys/);
        return new Response(JSON.stringify({
            model: "openai/gpt-oss-120b",
            choices: [{ message: { content: JSON.stringify(validDefinition), finish_reason: "stop" } }],
            usage: {
                prompt_tokens: 1200,
                completion_tokens: 650,
                total_tokens: 1850,
                prompt_tokens_details: { cached_tokens: 100 },
                completion_tokens_details: { reasoning_tokens: 200 }
            }
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a calculator for monthly savings growth." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        const responseData=await response.clone().json();
        assert.equal(response.status,200,JSON.stringify(responseData));
        const result = await response.json();
        assert.equal(result.success, true);
        assert.equal(result.calculator.title, validDefinition.title);
        assert.equal(result.calculator.spec.inputs.length, 3);
        assert.deepEqual(result.calculator.spec.subcategories, ["budgeting", "saving"]);
        assert.equal(result.calculator.spec.results[0].expression, "starting_amount + monthly_deposit * 12 * years");
        assert.equal(calls, 1);
    });
});

test("AI Maker rejects unauthenticated, cross-origin and executable formula requests", async () => {
    const unauthorized = await onRequestPost({
        request: request({ prompt: "Create a calculator." }),
        env: {}
    });
    assert.equal(unauthorized.status, 401);

    const forbidden = await onRequestPost({
        request: request({ prompt: "Create a calculator." }, { token: "token", origin: "https://attacker.example" }),
        env: {}
    });
    assert.equal(forbidden.status, 403);

    const malicious = structuredClone(validDefinition);
    malicious.results[0].expression = "starting_amount + window.alert(1)";
    await withFetch(async (url) => {
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(malicious) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a calculator with an injected formula." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 422);
    });

    assert.doesNotMatch(makerApi, /\beval\s*\(/);
    assert.doesNotMatch(makerApi, /new\s+Function\s*\(/);
    assert.match(makerApi, /email_confirmed_at/);
    assert.match(makerApi, /response_format:\s*\{\s*type:\s*"json_schema"/);
    assert.match(makerApi, /reasoning_effort:\s*"high"/);
    assert.match(makerApi, /const GEMINI_MODEL = "gemini-3\.8-flash"/);
    assert.match(makerApi, /thinkingConfig:\s*\{thinkingLevel:\s*"high"\}/);
    assert.match(makerApi, /requireAllInputsUsed:mode==="create"/);
    assert.match(makerApi, /classification:\s*\{\s*type:\s*"object"/);
    assert.match(makerApi, /subcategories:\s*\{\s*type:\s*"array"/);
    assert.doesNotMatch(makerApi, /classification:\s*\{\s*anyOf:/);
    assert.match(makerApi, /parsed\.category=classification\.category/);
    assert.match(makerApi, /Array\.isArray\(classification\.subcategories\)/);
    assert.match(makerApi, /trying strict Groq fallback/);
    assert.match(makerApi, /trying targeted Groq regeneration/);
    const options = await onRequestOptions({ request: new Request(previewOrigin + "/api/ugc-maker", { method: "OPTIONS", headers: { Origin: previewOrigin } }) });
    assert.equal(options.status, 204);
});

test("AI Maker rejects unused inputs in new calculator definitions and refunds the generation quota", async () => {
    const unusedInputDefinition = structuredClone(validDefinition);
    unusedInputDefinition.inputs.push({
        key: "unused_monthly_fee",
        label: "Unused monthly fee",
        min: 0,
        max: 500,
        default: 0,
        step: 1,
        unit: "EUR"
    });
    const quotaEvents = { refunds: 0, settlements: 0 };
    await withFetch(async (url) => {
        const path = String(url);
        if (path.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(unusedInputDefinition) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a monthly savings calculator." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        const result = await response.json();
        assert.equal(response.status, 422);
        assert.equal(result.code, "INVALID_AI_CALCULATOR");
        assert.match(result.error, /unused input fields: Unused monthly fee/i);
        assert.equal(quotaEvents.refunds, 1);
        assert.equal(quotaEvents.settlements, 0);
    }, quotaEvents);
});

test("AI Maker uses Gemini first and Groq as a fallback, with a server-side daily generation quota", async () => {
    const requests = [];
    await withFetch(async (url, options) => {
        requests.push(String(url));
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 2, daily_limit: 1 }), { status: 200 });
        }
        if (String(url).includes("generativelanguage.googleapis.com")) {
            const body = JSON.parse(options.body);
            assert.equal(body.generationConfig.responseMimeType, "application/json");
            assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "high");
            assert.equal(body.generationConfig.maxOutputTokens, 8192);
            assert.equal(String(url).includes("/models/gemini-3.8-flash:generateContent"), true);
            assert.equal(Object.hasOwn(body.generationConfig, "temperature"), false, "Gemini 3 should use its recommended default temperature");
            return new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), { status: 503 });
        }
        assert.match(String(url), /api\.groq\.com\/openai\/v1\/chat\/completions/);
        const body = JSON.parse(options.body);
        assert.equal(body.response_format.type, "json_schema");
        assert.equal(body.response_format.json_schema.strict, true);
        return new Response(JSON.stringify({
            model: "openai/gpt-oss-120b",
            choices: [{ message: { content: JSON.stringify(validDefinition), finish_reason: "stop" } }],
            usage: {
                prompt_tokens: 1200,
                completion_tokens: 650,
                total_tokens: 1850,
                prompt_tokens_details: { cached_tokens: 100 },
                completion_tokens_details: { reasoning_tokens: 200 }
            }
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a calculator for monthly savings growth." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GEMINI_API_KEY: "gemini-test", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 200);
        const generated = await response.json();
        assert.equal(generated.success, true);
        assert.equal(generated.aiUsage.attemptCount, 2);
        assert.deepEqual(generated.aiUsage.attempts.map(item => [item.provider,item.stage,item.success]), [
            ["gemini","initial-generation",false],
            ["groq","provider-fallback",true]
        ]);
        assert.equal(generated.aiUsage.attempts[0].totalTokens, null, "An HTTP failure without usage metadata must remain unknown.");
        assert.equal(generated.aiUsage.attempts[1].inputTokens, 1200);
        assert.equal(generated.aiUsage.attempts[1].outputTokens, 650);
        assert.equal(generated.aiUsage.attempts[1].thinkingTokens, 200);
        assert.equal(generated.aiUsage.totals.totalTokens, 1850);
        assert.equal(generated.aiUsage.totals.requestsWithUsage, 1);
        assert.ok(requests.some(url => url.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")));
        assert.ok(requests.some(url => url.includes("generativelanguage.googleapis.com")));
        assert.ok(requests.some(url => url.includes("api.groq.com/openai/v1/chat/completions")));
    });

    const limitedCalls = [];
    await withFetch(async url => {
        limitedCalls.push(String(url));
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ ok: false, code: "DAILY_LIMIT", daily_limit: 1, requests_used: 1 }), { status: 200 });
        }
        throw new Error("AI provider must not be called after the daily quota is exhausted.");
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a calculator for monthly savings growth." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GEMINI_API_KEY: "gemini-test" }
        });
        assert.equal(response.status, 429);
        assert.equal((await response.json()).code, "DAILY_AI_LIMIT");
        assert.equal(limitedCalls.length, 2);
    });
});



test("AI Maker falls back to strict Groq when Gemini returns mismatched community categories", async () => {
    const quotaEvents={refunds:0,settlements:0};
    const geminiInvalid=structuredClone(validDefinition);
    geminiInvalid.category="cars";
    geminiInvalid.subcategories=["budgeting","saving"];
    const requested=[];
    await withFetch(async (url,options)=>{
        const path=String(url);
        if(path.endsWith("/auth/v1/user")){
            return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        }
        if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")){
            requested.push("reserve");
            return new Response(JSON.stringify({ok:true,requests_used:1,daily_limit:1}),{status:200});
        }
        if(path.includes("generativelanguage.googleapis.com")){
            requested.push("gemini");
            return new Response(JSON.stringify({
                modelVersion:"gemini-3.8-flash-2026-11",
                candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(geminiInvalid)}]}}],
                usageMetadata:{
                    promptTokenCount:3500,
                    candidatesTokenCount:800,
                    thoughtsTokenCount:500,
                    totalTokenCount:4800,
                    cachedContentTokenCount:50
                }
            }),{status:200});
        }
        if(path.includes("api.groq.com/openai/v1/chat/completions")){
            requested.push("groq");
            const body=JSON.parse(options.body);
            assert.equal(body.response_format.type,"json_schema");
            assert.equal(body.response_format.json_schema.strict,true);
            assert.match(body.messages[0].content,/root JSON object must have exactly these keys: title, description, classification, inputs, groups, results and scenarios/);
            const classificationSchema=body.response_format.json_schema.schema.properties.classification;
            assert.deepEqual(classificationSchema.properties.category.enum,["cars","money","technology","home","other"]);
            const subcategoryEnum=classificationSchema.properties.subcategories.items.enum;
            assert.ok(subcategoryEnum.includes("budgeting"));
            assert.ok(subcategoryEnum.includes("fuel-costs"));
            assert.ok(!Object.hasOwn(classificationSchema,"anyOf"));
            assert.match(body.messages[0].content,/subcategories must be an array containing 1 to 3 valid lowercase IDs from the selected category only/);
            const groqDefinition=structuredClone(validDefinition);
            delete groqDefinition.category;
            delete groqDefinition.subcategories;
            groqDefinition.classification={category:"money",subcategories:["budgeting","saving"]};
            return new Response(JSON.stringify({
                model:"openai/gpt-oss-120b",
                choices:[{finish_reason:"stop",message:{content:JSON.stringify(groqDefinition)}}],
                usage:{
                    prompt_tokens:2100,
                    completion_tokens:750,
                    total_tokens:2850,
                    prompt_tokens_details:{cached_tokens:100},
                    completion_tokens_details:{reasoning_tokens:250}
                }
            }),{status:200});
        }
        throw new Error("Unexpected request in category fallback test: "+path);
    },async()=>{
        const response=await onRequestPost({
            request:request({prompt:"Create a calculator for monthly savings growth."},{token:"valid-token"}),
            env:{
                SUPABASE_URL:"https://supabase.example",
                SUPABASE_PUBLISHABLE_KEY:"publishable",
                GEMINI_API_KEY:"gemini-test",
                GROQ_API_KEY:"groq-test"
            }
        });
        const responseBody=await response.clone().json();
        assert.equal(response.status,200,JSON.stringify(responseBody));
        const result=await response.json();
        assert.equal(result.success,true);
        assert.equal(result.calculator.category,"money");
        assert.deepEqual(result.calculator.spec.subcategories,["budgeting","saving"]);
        assert.equal(result.aiUsage.attemptCount,2);
        assert.deepEqual(result.aiUsage.attempts.map(item=>[item.provider,item.stage,item.success]),[
            ["gemini","initial-generation",true],
            ["groq","validation-fallback",true]
        ]);
        assert.equal(result.aiUsage.attempts[0].model,"gemini-3.8-flash-2026-11");
        assert.equal(result.aiUsage.attempts[0].thinkingTokens,500);
        assert.equal(result.aiUsage.attempts[0].cachedInputTokens,50);
        assert.equal(result.aiUsage.attempts[0].uncachedInputTokens,3450);
        assert.equal(result.aiUsage.attempts[0].cacheHitRatePercent,1.43);
        assert.equal(result.aiUsage.attempts[1].thinkingTokens,250);
        assert.equal(result.aiUsage.attempts[1].cachedInputTokens,100);
        assert.equal(result.aiUsage.attempts[1].uncachedInputTokens,2000);
        assert.equal(result.aiUsage.attempts[1].cacheHitRatePercent,4.76);
        assert.deepEqual(result.aiUsage.totals,{
            inputTokens:5600,
            outputTokens:1550,
            thinkingTokens:750,
            totalTokens:7650,
            cachedInputTokens:150,
            uncachedInputTokens:5450,
            cacheHitRatePercent:2.68,
            requestsWithUsage:2,
            totalProviderDurationMs:result.aiUsage.totals.totalProviderDurationMs
        });
        assert.deepEqual(requested,["reserve","gemini","groq"]);
        assert.equal(quotaEvents.refunds||0,0);
        assert.equal(quotaEvents.settlements,1);
    },quotaEvents);
});

// Covers the path where Gemini is unavailable and Groq first returns a valid but incomplete draft.
test("AI Maker runs one targeted Groq coverage repair when Groq is already the Gemini fallback", async () => {
    const quotaEvents={refunds:0,settlements:0};
    const requested=[];
    const incomplete=structuredClone(validDefinition);
    incomplete.inputs=[structuredClone(validDefinition.inputs[1])];
    incomplete.results=[
        {label:"Monthly total",expression:"monthly_deposit*12",format:"currency",currency:"EUR"}
    ];
    const complete=structuredClone(validDefinition);
    complete.inputs=[structuredClone(validDefinition.inputs[1])];
    complete.results=[
        {label:"Weekly total",expression:"monthly_deposit*12/52",format:"currency",currency:"EUR"},
        {label:"Yearly total",expression:"monthly_deposit*12",format:"currency",currency:"EUR"}
    ];
    const asGroqDefinition=definition=>{
        const output=structuredClone(definition);
        delete output.category;
        delete output.subcategories;
        output.classification={category:"money",subcategories:["budgeting","saving"]};
        return output;
    };
    let groqCalls=0;
    await withFetch(async(url,options)=>{
        const path=String(url);
        if(path.endsWith("/auth/v1/user")){
            return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        }
        if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")){
            requested.push("reserve");
            return new Response(JSON.stringify({ok:true,requests_used:1,daily_limit:1}),{status:200});
        }
        if(path.includes("generativelanguage.googleapis.com")){
            requested.push("gemini");
            return new Response(JSON.stringify({error:{code:503,status:"UNAVAILABLE"}}),{status:503});
        }
        if(path.includes("api.groq.com/openai/v1/chat/completions")){
            groqCalls++;
            requested.push("groq-"+groqCalls);
            const body=JSON.parse(options.body);
            assert.equal(body.response_format.type,"json_schema");
            assert.equal(body.response_format.json_schema.strict,true);
            if(groqCalls===1){
                assert.match(body.messages[1].content,/User request:/);
                return new Response(JSON.stringify({
                    choices:[{message:{content:JSON.stringify(asGroqDefinition(incomplete))}}]
                }),{status:200});
            }
            assert.match(body.messages[1].content,/weekly result/);
            assert.match(body.messages[1].content,/yearly result/);
            assert.match(body.messages[1].content,/total weekly/);
            assert.match(body.messages[1].content,/total yearly/);
            return new Response(JSON.stringify({
                choices:[{message:{content:JSON.stringify(asGroqDefinition(complete))}}]
            }),{status:200});
        }
        throw new Error("Unexpected request during Groq fallback coverage repair: "+path);
    },async()=>{
        const response=await onRequestPost({
            request:request({prompt:"Calculate weekly and yearly results and include total weekly and total yearly costs."},{token:"valid-token"}),
            env:{
                SUPABASE_URL:"https://supabase.example",
                SUPABASE_PUBLISHABLE_KEY:"publishable",
                GEMINI_API_KEY:"gemini-test",
                GROQ_API_KEY:"groq-test"
            }
        });
        assert.equal(response.status,200);
        const result=await response.json();
        assert.equal(result.success,true);
        assert.ok(result.calculator.spec.results.some(item=>/weekly/i.test(item.label)&&/total/i.test(item.label)));
        assert.ok(result.calculator.spec.results.some(item=>/yearly/i.test(item.label)&&/total/i.test(item.label)));
        assert.equal(groqCalls,2,"one initial Groq fallback plus exactly one targeted coverage repair are allowed");
        assert.deepEqual(requested,["reserve","gemini","groq-1","groq-2"]);
        assert.equal(quotaEvents.refunds||0,0);
        assert.equal(quotaEvents.settlements,1);
    },quotaEvents);
});

test("AI Maker retries an incomplete Gemini calculator with Groq and includes requested weekly and yearly totals", async () => {
    const quotaEvents={refunds:0,settlements:0};
    const requested=[];
    const incomplete=structuredClone(validDefinition);
    incomplete.inputs=[structuredClone(validDefinition.inputs[1])];
    incomplete.results=[{label:"Monthly total",expression:"monthly_deposit*12",format:"currency",currency:"EUR"}];
    const complete=structuredClone(validDefinition);
    complete.inputs=[structuredClone(validDefinition.inputs[1])];
    complete.results=[
        {label:"Weekly total",expression:"monthly_deposit*12/52",format:"currency",currency:"EUR"},
        {label:"Yearly total",expression:"monthly_deposit*12",format:"currency",currency:"EUR"}
    ];
    await withFetch(async(url,options)=>{
        const path=String(url);
        if(path.endsWith("/auth/v1/user")){
            return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        }
        if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")){
            requested.push("reserve");
            return new Response(JSON.stringify({ok:true,requests_used:1,daily_limit:1}),{status:200});
        }
        if(path.includes("generativelanguage.googleapis.com")){
            requested.push("gemini");
            return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(incomplete)}]}}]}),{status:200});
        }
        if(path.includes("api.groq.com/openai/v1/chat/completions")){
            requested.push("groq");
            const body=JSON.parse(options.body);
            assert.match(body.messages[1].content,/weekly result/);
            assert.match(body.messages[1].content,/yearly result/);
            assert.match(body.messages[1].content,/total weekly/);
            assert.match(body.messages[1].content,/total yearly/);
            const output=structuredClone(complete);
            delete output.category;
            delete output.subcategories;
            output.classification={category:"money",subcategories:["budgeting","saving"]};
            return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}),{status:200});
        }
        throw new Error("Unexpected request during coverage fallback: "+path);
    },async()=>{
        const response=await onRequestPost({
            request:request({prompt:"Calculate weekly and yearly results and include total weekly and total yearly costs."},{token:"valid-token"}),
            env:{
                SUPABASE_URL:"https://supabase.example",
                SUPABASE_PUBLISHABLE_KEY:"publishable",
                GEMINI_API_KEY:"gemini-test",
                GROQ_API_KEY:"groq-test"
            }
        });
        assert.equal(response.status,200);
        const result=await response.json();
        assert.equal(result.success,true);
        assert.ok(result.calculator.spec.results.some(item=>/weekly/i.test(item.label)&&/total/i.test(item.label)));
        assert.ok(result.calculator.spec.results.some(item=>/yearly/i.test(item.label)&&/total/i.test(item.label)));
        assert.deepEqual(requested,["reserve","gemini","groq"]);
        assert.equal(quotaEvents.refunds||0,0);
        assert.equal(quotaEvents.settlements,1);
    },quotaEvents);
});

test("AI Maker refunds its reserved daily generation when Gemini and Groq both fail", async () => {
    const quotaEvents = { refunds: 0, settlements: 0 };
    await withFetch(async (url, options) => {
        const path = String(url);
        if (path.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            const reservation = JSON.parse(options.body);
            assert.match(reservation.p_request_id, /^[0-9a-f-]{36}$/i);
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 1 }), { status: 200 });
        }
        if (path.includes("generativelanguage.googleapis.com")) {
            return new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), { status: 503 });
        }
        if (path.includes("api.groq.com/openai/v1/chat/completions")) {
            const body = JSON.parse(options.body);
            assert.equal(body.response_format.type, "json_schema");
            assert.equal(body.response_format.json_schema.strict, true);
            return new Response(JSON.stringify({ error: { code: "json_validate_failed" } }), { status: 400 });
        }
        throw new Error("Unexpected request in provider-failure test: " + path);
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a calculator for monthly savings growth." }, { token: "valid-token" }),
            env: {
                SUPABASE_URL: "https://supabase.example",
                SUPABASE_PUBLISHABLE_KEY: "publishable",
                GEMINI_API_KEY: "gemini-test",
                GROQ_API_KEY: "groq-test"
            }
        });
        assert.equal(response.status, 503);
        const result = await response.json();
        assert.equal(result.code, "AI_PROVIDER_UNAVAILABLE");
        assert.match(result.error, /reserved CALC charge and AI allowance were returned/i);
        assert.equal(quotaEvents.refunds, 1);
        assert.equal(quotaEvents.settlements || 0, 0);
    }, quotaEvents);
});

test("AI improvement preserves saved calculator identity and enforces owner and daily quota checks", async () => {
    const existing = {
        id: "11111111-1111-4111-8111-111111111111",
        is_owner: true,
        title: validDefinition.title,
        description: "Short legacy description.",
        category: validDefinition.category,
        spec: structuredClone(validDefinition)
    };
    existing.spec.inputs[0].unit = "CHF";
    existing.spec.inputs[1].unit = "CHF";
    existing.spec.results[0].currency = "CHF";
    const refined = structuredClone(validDefinition);
    refined.description = existing.description;
    delete refined.inputs[0].unit;
    delete refined.inputs[1].unit;
    delete refined.results[0].currency;
    refined.inputs[0].label = "Starting savings balance";
    refined.inputs[0].max = 2000000;

    const calls = [];
    const quotaEvents = {};
    await withFetch(async (url, options) => {
        const path = String(url);
        calls.push(path);
        if (path.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        }
        if (path.endsWith("/rest/v1/rpc/get_worth_it_ugc_calculator")) {
            return new Response(JSON.stringify(existing),{status:200});
        }
        if (path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ok:true,daily_limit:2,edits_used:1,remaining:1}),{status:200});
        }
        if (path.endsWith("/rest/v1/rpc/settle_worth_it_ugc_ai_operation")) {
            return new Response(JSON.stringify({ok:true}),{status:200});
        }
        if (path.includes("generativelanguage.googleapis.com")) {
            const body=JSON.parse(options.body);
            assert.match(body.systemInstruction.parts[0].text,/preserve the exact title, category, description/i);
            assert.match(body.systemInstruction.parts[0].text,/preserve its existing currency codes and monetary input units/i);
            return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(refined)}]}}]}),{status:200});
        }
        throw new Error("Unexpected AI refinement request: "+path);
    },async()=>{
        const refineRequest=request({mode:"refine",calculator_id:existing.id,prompt:"Improve the calculation assumptions and formulas."},{token:"valid-token"});
        Object.defineProperty(refineRequest,"cf",{value:{country:"RS"}});
        const response=await onRequestPost({
            request:refineRequest,
            env:{SUPABASE_URL:"https://supabase.example",SUPABASE_PUBLISHABLE_KEY:"publishable",GEMINI_API_KEY:"gemini-test"}
        });
        assert.equal(response.status,200);
        const result=await response.json();
        assert.equal(result.mode,"refine");
        assert.equal(result.calculator.title,existing.title);
        assert.equal(result.calculator.description,existing.description);
        assert.equal(result.calculator.category,existing.category);
        assert.equal(result.calculator.spec.inputs[0].label,"Starting savings balance");
        assert.equal(result.calculator.spec.inputs[0].unit,"CHF","omitted units retain their saved currency during refinement");
        assert.equal(result.calculator.spec.results[0].currency,"CHF","omitted result currency retains its saved currency during refinement");
        assert.equal(result.regionalDefaults.currency,"RSD","the Serbian regional default is RSD; the saved calculator's CHF currency remains preserved above");
        assert.equal(quotaEvents.settlements,1,"the AI improvement and CALC reservation must settle once");
    },quotaEvents);

    const deniedCalls=[];
    await withFetch(async url=>{
        const path=String(url);deniedCalls.push(path);
        if(path.endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        if(path.endsWith("/rest/v1/rpc/get_worth_it_ugc_calculator"))return new Response(JSON.stringify({...existing,is_owner:false}),{status:200});
        throw new Error("An edit reservation or AI provider call must not run for a non-owner.");
    },async()=>{
        const response=await onRequestPost({
            request:request({mode:"refine",calculator_id:existing.id,prompt:"Improve it."},{token:"valid-token"}),
            env:{SUPABASE_URL:"https://supabase.example",SUPABASE_PUBLISHABLE_KEY:"publishable",GEMINI_API_KEY:"gemini-test"}
        });
        assert.equal(response.status,403);
        assert.equal((await response.json()).code,"NOT_CALCULATOR_OWNER");
        assert.equal(deniedCalls.length,2);
    });

    const quotaCalls=[];
    await withFetch(async url=>{
        const path=String(url);quotaCalls.push(path);
        if(path.endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        if(path.endsWith("/rest/v1/rpc/get_worth_it_ugc_calculator"))return new Response(JSON.stringify(existing),{status:200});
        if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation"))return new Response(JSON.stringify({ok:false,code:"DAILY_LIMIT",daily_limit:2,edits_used:2,remaining:0}),{status:200});
        throw new Error("AI must not run after the AI edit quota is exhausted.");
    },async()=>{
        const response=await onRequestPost({
            request:request({mode:"refine",calculator_id:existing.id,prompt:"Improve it."},{token:"valid-token"}),
            env:{SUPABASE_URL:"https://supabase.example",SUPABASE_PUBLISHABLE_KEY:"publishable",GEMINI_API_KEY:"gemini-test"}
        });
        assert.equal(response.status,429);
        assert.equal((await response.json()).code,"DAILY_AI_EDIT_LIMIT");
        assert.equal(quotaCalls.length,3);
    });

    const identityCalls=[];
    const identityQuotaEvents={};
    await withFetch(async (url,options)=>{
        const path=String(url);identityCalls.push(path);
        if(path.endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        if(path.endsWith("/rest/v1/rpc/get_worth_it_ugc_calculator"))return new Response(JSON.stringify(existing),{status:200});
        if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation"))return new Response(JSON.stringify({ok:true}),{status:200});
        if(path.includes("generativelanguage.googleapis.com")){
            const changed={...refined,category:"cars",subcategories:["fuel-costs"]};
            return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(changed)}]}}]}),{status:200});
        }
        if(path.endsWith("/rest/v1/rpc/refund_worth_it_ugc_ai_operation"))return new Response(JSON.stringify({ok:true}),{status:200});
        throw new Error("Unexpected request in identity guard test: "+path);
    },async()=>{
        const response=await onRequestPost({
            request:request({mode:"refine",calculator_id:existing.id,prompt:"Turn this into a car calculator."},{token:"valid-token"}),
            env:{SUPABASE_URL:"https://supabase.example",SUPABASE_PUBLISHABLE_KEY:"publishable",GEMINI_API_KEY:"gemini-test"}
        });
        assert.equal(response.status,422);
        assert.equal((await response.json()).code,"CALCULATOR_IDENTITY_CHANGED");
        assert.equal(identityQuotaEvents.refunds,1,"a rejected identity-changing AI improvement must be refunded once");
    },identityQuotaEvents);
});

test("UGC enhancement migration enforces private favourites, description cooldown and AI edit quotas", () => {
    assert.match(sqlEnhancements,/where f\.user_id=v_user_id/);
    assert.match(sqlEnhancements,/update_worth_it_ugc_calculator_description/);
    assert.match(sqlEnhancements,/interval '10 minutes'/);
    assert.match(sqlEnhancements,/get_worth_it_ugc_ai_edit_quota/);
    assert.match(sqlEnhancements,/when 'premium' then 4 when 'premium_lite' then 3 else 2/);
    assert.match(sqlEnhancements,/reserve_worth_it_ugc_ai_edit/);
    assert.match(sqlEnhancements,/refund_worth_it_ugc_ai_edit/);
    assert.match(sqlEnhancements,/private\.worth_it_guard_ugc_calculator_update/);
    assert.match(makerApi,/CALCULATOR_IDENTITY_CHANGED/);
    assert.match(makerApi,/NOT_CALCULATOR_OWNER/);
    assert.match(html,/1 AI improvement to an existing UGC calculator per UTC day/);
});

test("UGC AI Maker quotas enforce per-tier caps and keep the shared cap server-side", () => {
    assert.match(makerQuotaSql, /create table if not exists private\.worth_it_ugc_maker_global_daily_usage/);
    assert.match(makerQuotaSql, /global_daily_limit',\s*100/);
    assert.match(makerQuotaSql, /requests_used < 100/);
    assert.match(makerQuotaSql, /case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end/);
    assert.match(makerQuotaSql, /get_worth_it_ugc_maker_generation_quota/);
    assert.match(makerQuotaSql, /refund_worth_it_ugc_maker_generation_v2/);
    assert.match(makerQuotaSql, /global_remaining/);
    assert.match(makerApi, /GLOBAL_DAILY_AI_LIMIT/);
    assert.match(maker, /refreshMakerGenerationQuota/);
    assert.doesNotMatch(maker, /global_remaining/);
    assert.match(html, /id="ugcMakerGenerationQuotaStatus"/);
    assert.doesNotMatch(html, /system-wide limit of 100 successful new AI generations per UTC day/i, "the internal shared capacity must not be shown to users");
    assert.doesNotMatch(html, /100 successful new UGC calculator generations per UTC day/i);
    assert.doesNotMatch(html, /100 UGC calculators in total are able to get generated a day/i);
    assert.match(paginationCss, /\.ugc-maker-status\.is-generating\{color:var\(--primary2\)/);
    assert.match(paginationCss, /\.ugc-maker-status\.is-error\{color:var\(--danger\)/);
});

test("Subscriptions explain Free, Premium Lite and Premium UGC quotas without selling Free", () => {
    const start = html.indexOf('<section id="webShopSubscriptionsPanel"');
    const end = html.indexOf("</section>", start);
    const panel = html.slice(start, end);
    const freeStart = panel.indexOf('class="web-shop-card web-shop-card-free"');
    const liteStart = panel.indexOf('class="web-shop-card web-shop-card-featured"');
    const premiumStart = panel.indexOf('<h4>Premium</h4>');
    const freeCard = panel.slice(freeStart, liteStart);
    assert.ok(freeStart >= 0 && liteStart > freeStart && premiumStart > liteStart);
    assert.match(freeCard, /1 new AI-generated UGC calculator per UTC day/);
    assert.match(freeCard, /1 AI improvement to an existing UGC calculator per UTC day/);
    assert.match(freeCard, /1 new manually created \(non-AI\) UGC calculator saved per UTC day/);
    assert.match(freeCard, /AI generation costs 2 CALC per successful operation/);
    assert.doesNotMatch(freeCard, /<button\b/i, "Free is informational and cannot be purchased");
    assert.match(panel, /2 new AI-generated UGC calculators per UTC day/);
    assert.match(panel, /2 AI improvements to existing UGC calculators per UTC day/);
    assert.match(panel, /2 new manually created \(non-AI\) UGC calculators saved per UTC day/);
    assert.match(panel, /AI generation costs 4 CALC per successful operation/);
    assert.match(panel, /3 new AI-generated UGC calculators per UTC day/);
    assert.match(panel, /3 AI improvements to existing UGC calculators per UTC day/);
    assert.match(panel, /3 new manually created \(non-AI\) UGC calculators saved per UTC day/);
    assert.match(panel, /AI generation costs 6 CALC per successful operation/);
    assert.doesNotMatch(panel, /100 successful new UGC calculator generations per UTC day/);
});


test("Manual UGC Builder, separate save quota and paid AI operations are secured", () => {
    assert.match(html, /id="ugcCreateManualButton"/);
    assert.match(html, /id="ugcManualMode"/);
    assert.match(html, /id="ugcManualTemplate"/);
    assert.match(html, /id="ugcManualAiImproveButton"/);
    assert.match(maker, /const MANUAL_TEMPLATES=/);
    assert.match(maker, /"simple-cost"/);
    assert.match(maker, /"electricity-cost"/);
    assert.match(maker, /"fuel-cost"/);
    assert.match(maker, /"savings-total"/);
    for (const template of ["unit-price-compare","discount-price","heating-compare","water-cost","flooring-materials","car-ownership-cost","travel-budget","hourly-pay","simple-interest","profit-margin","break-even"]) {
        assert.ok(html.includes('value="' + template + '"'), template + " is available in the template picker");
        assert.ok(maker.includes('"' + template + '"'), template + " has a calculator definition");
    }
    assert.match(html, /id="ugcManualModeHelp"/);
    assert.match(html, /Quick Builder[\s\S]*?Start with a simple, ready-to-edit calculator/);
    assert.match(html, /Template Builder[\s\S]*?Choose a prepared model/);
    assert.match(html, /Advanced Formula Builder[\s\S]*?Build a custom calculation/);
    assert.match(maker, /const active=card\.dataset\.manualModeInfo===\(state\.manualMode\|\|"quick"\)/);
    assert.match(maker, /function editCalculatorManually/);
    assert.match(maker, /titleInput\.disabled=existing/);
    assert.match(maker, /descInput\.disabled=existing/);
    assert.match(maker, /categorySelect\.disabled=Boolean\(state\.editingId\)/);
    assert.match(maker, /10-minute cooldown still applies/);
    assert.match(maker, /function switchManualDraftToAI/);
    assert.match(maker, /p_source:state.creationSource==="manual"\?"manual":"ai"/);
    assert.match(maker, /p_ai_request_id:state.creationSource==="manual"\?null:state.aiOperationId/);
    assert.match(maker, /const specToSave=\{\.\.\.state\.aiDraft\.spec\}/);
    assert.match(maker, /Array\.isArray\(state\.aiDraft\.subcategories\)/);
    assert.match(makerApi, /reserve_worth_it_ugc_ai_operation/);
    assert.match(makerApi, /settle_worth_it_ugc_ai_operation/);
    assert.match(makerApi, /refund_worth_it_ugc_ai_operation/);
    assert.match(makerApi, /operation_id:aiOperationRequestId/);
    assert.match(manualBuilderSql, /private\.worth_it_ugc_manual_daily_usage/);
    assert.match(manualBuilderSql, /subcategories=v_subcategories,spec=p_spec - 'subcategories'/);
    assert.match(manualBuilderSql, /v_source='manual' and cardinality\(v_subcategories\)=0/);
    assert.match(manualBuilderSql, /manual_non_ai_saves/);
    assert.match(manualBuilderSql, /definition_hash/);
    assert.match(manualBuilderSql, /on delete set null/i);
    assert.match(manualBuilderSql, /REQUEST_ID_CONFLICT/);
    assert.match(manualBuilderSql, /kind='ugc_ai_spend' and currency='CALC'/);
    assert.match(manualBuilderSql, /A completed CALC AI-generation transaction is required/);
    assert.match(manualBuilderSql, /A completed CALC AI-improvement transaction is required/);
    assert.match(manualBuilderSql, /when 'premium' then 6000 when 'premium_lite' then 4000 else 2000 end/);
    assert.match(manualBuilderSql, /when 'premium' then 3 when 'premium_lite' then 2 else 1 end/);
    assert.match(calcEconomySource, /ugc_ai_spend:"AI UGC calculator"/);
    assert.match(paginationFixture, /ugc_manual_ai_billing/);
    assert.match(paginationFixture, /Deleting an AI calculator must retain its consumed operation proof/);
    assert.match(workflow, /supabase\/worth-it-ugc-manual-builder-ai-costs\.sql/);
});


test("UGC calculator cards show verified original creation source", () => {
    const basicStart=html.indexOf('<section class="section calculator-explore-panel" id="calculators">');
    const communityNav=html.indexOf('id="ugcNavigationActions"',basicStart);
    const basicEnd=html.indexOf("</section>",basicStart);
    const basicPanel=html.slice(basicStart,basicEnd);
    assert.ok(basicStart>=0 && communityNav>basicStart);
    assert.match(basicPanel,/id="ugcCatalogJumpButton"[^>]*>🌐 Community calculators/);
    assert.doesNotMatch(basicPanel,/Create with AI|ugcMakerJumpButton/);
    assert.match(html,/id="ugcCreateButton"[^>]*>✦ Create with AI/);
    assert.match(maker,/const source=String\(item\.creation_source\|\|""\)/);
    assert.match(maker,/source==="manual"\?"MANUAL":"AI MADE"/);
    assert.match(maker,/item\.creation_source/);
    assert.match(manualBuilderSql,/add column if not exists creation_source text not null default 'legacy'/);
    assert.match(manualBuilderSql,/creation_source in \('manual','ai','legacy'\)/);
    assert.match(manualBuilderSql,/values\(v_user_id,v_title,v_description,v_category,v_subcategories,p_spec - 'subcategories',v_source\)/);
    assert.match(manualBuilderSql,/a\.operation='generation'[\s\S]*?c\.creation_source='legacy'/);
    assert.match(paginationSql,/'creation_source',q\.creation_source/);
    assert.match(paginationSql,/c\.category,c\.creation_source,c\.status/);
    assert.match(paginationSql,/'creation_source',creation_source/);
    assert.match(paginationFixture,/successfully AI-generated calculator must keep AI provenance/);
    assert.match(paginationFixture,/manual calculator must keep manual provenance/);
    assert.match(paginationFixture,/AI improvement must not change the original manual provenance/);
    assert.match(paginationCss,/\.ugc-origin-tag\.is-manual/);
    assert.match(paginationCss,/\.ugc-origin-tag\.is-ai-made/);
});

test("UGC formula engine supports extended math and checks physical and currency dimensions", () => {
    const engine=createCalculatorEngine();
    const keys=new Set(["energy","price","distance","hours","volume"]);
    assert.equal(engine.evaluate(engine.compileExpression("clamp(18, 0, 10)",keys),{}),10);
    assert.equal(engine.evaluate(engine.compileExpression("avg(10, 20, 30)",keys),{}),20);
    assert.equal(engine.evaluate(engine.compileExpression("hypot(3, 4)",keys),{}),5);
    assert.equal(engine.evaluate(engine.compileExpression("mod(17, 5)",keys),{}),2);
    assert.equal(engine.evaluate(engine.compileExpression("round(1.2345, 2)",keys),{}),1.23);
    assert.equal(engine.evaluate(engine.compileExpression("if(gt(energy, 10), 25, 5)",keys),{energy:11}),25);
    assert.equal(engine.evaluate(engine.compileExpression("if(gte(energy, 10), 25, 5)",keys),{energy:10}),25);
    assert.equal(engine.evaluate(engine.compileExpression("and(gt(energy, 0), lt(energy, 20))",keys),{energy:11}),1);
    assert.equal(engine.evaluate(engine.compileExpression("or(lt(energy, 0), eq(energy, 11))",keys),{energy:11}),1);
    assert.equal(engine.evaluate(engine.compileExpression("not(eq(energy, 0))",keys),{energy:11}),1);

    const electricityInputs=[{key:"energy",unit:"kWh"},{key:"price",unit:"EUR/kWh"}];
    const costAst=engine.compileExpression("energy * price",new Set(["energy","price"]));
    const costUnit=engine.analyseFormulaUnit(costAst,electricityInputs);
    assert.doesNotThrow(()=>engine.validateFormulaResultUnit({format:"currency",currency:"EUR"},costUnit));
    assert.throws(()=>engine.validateFormulaResultUnit({format:"currency",currency:"USD"},costUnit),/dimensions|units|currency/i);

    const conditionalAst=engine.compileExpression("if(gt(energy, 10), energy, 0)",new Set(["energy"]));
    const conditionalUnit=engine.analyseFormulaUnit(conditionalAst,[{key:"energy",unit:"kWh"}]);
    assert.doesNotThrow(()=>engine.validateFormulaResultUnit({format:"unit",unit:"kWh"},conditionalUnit));
    const thresholdAst=engine.compileExpression("min(energy, 500)",new Set(["energy"]));
    const thresholdUnit=engine.analyseFormulaUnit(thresholdAst,[{key:"energy",unit:"kWh"}]);
    assert.doesNotThrow(()=>engine.validateFormulaResultUnit({format:"unit",unit:"kWh"},thresholdUnit));

    const velocityAst=engine.compileExpression("distance / hours",new Set(["distance","hours"]));
    const velocityUnit=engine.analyseFormulaUnit(velocityAst,[{key:"distance",unit:"km"},{key:"hours",unit:"hours"}]);
    assert.doesNotThrow(()=>engine.validateFormulaResultUnit({format:"unit",unit:"km/h"},velocityUnit));
    assert.throws(()=>engine.analyseFormulaUnit(
        engine.compileExpression("energy + volume",new Set(["energy","volume"])),
        [{key:"energy",unit:"kWh"},{key:"volume",unit:"L"}]
    ),/matching units/i);

    const invalidCurrencySpec={inputs:[{key:"amount",label:"Amount",min:0,max:100,default:10,step:1,unit:"EUR"}],results:[{label:"Total",expression:"amount",format:"currency",currency:"ZZZ"}]};
    assert.ok(engine.validateMakerSpec(invalidCurrencySpec).errors.some(message=>/ISO 4217/i.test(message)));
});

test("all built-in Manual Builder templates pass formula, unit and boundary validation", () => {
    const templateStart=maker.indexOf("const MANUAL_TEMPLATES={");
    const templateEnd=maker.indexOf("function createManualDraft",templateStart);
    assert.ok(templateStart>=0&&templateEnd>templateStart);
    const engine=createCalculatorEngine();
    const templates=runInNewContext(maker.slice(templateStart,templateEnd)+"\nMANUAL_TEMPLATES");
    const hourly=templates["hourly-pay"];
    const hourlyKeys=new Set(hourly.inputs.map(input=>input.key));
    const hourlyUnits=hourly.results.map(result=>{
        const ast=engine.compileExpression(result.expression,hourlyKeys);
        const unit=engine.analyseFormulaUnit(ast,hourly.inputs);
        return {label:result.label,dimension:engine.unitVectorKey(unit),exact:unit.exact,opaque:unit.opaque};
    });
    const invalid=[];
    for(const [key,template] of Object.entries(templates)){
        const validation=engine.validateMakerSpec({inputs:template.inputs,groups:template.groups||[],results:template.results,scenarios:template.scenarios||[]});
        if(validation.errors.length)invalid.push(key+": "+validation.errors.join(" | "));
    }
    assert.deepEqual(invalid,[], "Template formula/unit validation failures: "+JSON.stringify(invalid)+"; hourly dimensions: "+JSON.stringify(hourlyUnits));
    assert.ok(Object.keys(templates).length>=17,"The template library should contain at least 17 distinct templates.");
});

test("Manual Builder what-if scenarios validate overrides and remain optional for older calculators", () => {
    const engine=createCalculatorEngine();
    const base={
        inputs:[
            {key:"quantity",label:"Quantity",min:1,max:100,default:10,step:1,unit:"units"},
            {key:"price",label:"Price",min:0,max:1000,default:2,step:0.01,unit:"EUR/unit"}
        ],
        results:[{label:"Total",expression:"quantity * price",format:"currency",currency:"EUR"}]
    };
    const baseErrors=Array.from(engine.validateMakerSpec(base).errors);
    assert.equal(baseErrors.length,0,"Base calculator validation: "+baseErrors.join(" | "));
    const valid={...base,scenarios:[{key:"larger",label:"Larger order",values:{quantity:20,price:1.5}}]};
    const validErrors=Array.from(engine.validateMakerSpec(valid).errors);
    assert.equal(validErrors.length,0,"Scenario calculator validation: "+validErrors.join(" | "));
    const invalid={...base,scenarios:[{key:"bad",label:"Out of range",values:{quantity:101,price:2}}]};
    assert.ok(engine.validateMakerSpec(invalid).errors.some(message=>/input range/i.test(message)));
    const tooMany={...base,scenarios:[1,2,3,4].map((n)=>({label:"Scenario "+n,values:{quantity:10+n}}))};
    assert.ok(engine.validateMakerSpec(tooMany).errors.some(message=>/up to 3/i.test(message)));
});


test("Composable Manual Builder supports chained results and bounded dynamic groups", () => {
    const engine=createCalculatorEngine();
    const spec={
        inputs:[{key:"months",label:"Number of periods",min:1,max:60,default:12,step:1,unit:""}],
        groups:[{key:"expenses",label:"Expenses",itemLabel:"Expense",minItems:1,maxItems:10,
            fields:[{key:"amount",label:"Amount",min:0,max:100000,default:10,step:1,unit:"EUR"}]}],
        results:[
            {key:"total_expenses",label:"Total expenses",expression:"sum(expenses.amount)",format:"currency",currency:"EUR"},
            {key:"period_total",label:"Period total",expression:"total_expenses * months / 12",format:"currency",currency:"EUR"},
            {key:"expense_rows",label:"Expense rows",expression:"count(expenses)",format:"number"}
        ]
    };
    const errors=Array.from(engine.validateMakerSpec(spec).errors);
    assert.deepEqual(errors,[],"Valid chained-result and dynamic-group definition: "+errors.join(" | "));
    const calculated=engine.evaluateFormulaResults(spec,{months:12},{expenses:[{amount:12},{amount:18}]});
    assert.deepEqual(Array.from(calculated,result=>result.value),[30,30,2]);
        const groupDefinitions=engine.groupMapForSpec(spec);
    const averageAst=engine.compileExpression("avg(expenses.amount)",new Set(),groupDefinitions);
    assert.equal(engine.evaluate(averageAst,{}, {expenses:[{amount:10},{amount:20}]}),15);
    const forward={...spec,results:[
        {key:"first_result",label:"First",expression:"second_result",format:"number"},
        {key:"second_result",label:"Second",expression:"1",format:"number"}
    ]};
    assert.ok(engine.validateMakerSpec(forward).errors.some(message=>/invalid formula|earlier result/i.test(message)));
    const unknownGroupField={...spec,results:[{...spec.results[0],expression:"sum(expenses.unknown)"}]};
    assert.ok(engine.validateMakerSpec(unknownGroupField).errors.length>0);
    const oversized={...spec,groups:[{...spec.groups[0],maxItems:21}]};
    assert.ok(engine.validateMakerSpec(oversized).errors.some(message=>/1–20 rows/i.test(message)));
    const tooManyResults={...spec,results:Array.from({length:21},(_,index)=>({key:"result_"+index,label:"Result "+index,expression:"1",format:"number"}))};
    assert.ok(engine.validateMakerSpec(tooManyResults).errors.some(message=>/up to 20 results/i.test(message)));
});

test("Composable Manual Builder validates and evaluates all six dynamic expense aggregates with default currency normalization", () => {
    const engine=createCalculatorEngine();
    const spec={
        inputs:[{key:"base_cost",label:"Base cost",min:0,max:1000000,default:30,step:0.01,unit:"EUR"}],
        groups:[{key:"expenses",label:"Extra expenses",itemLabel:"Expense",minItems:1,maxItems:20,
            fields:[{key:"amount",label:"Amount",min:0,max:1000000,default:0,step:0.1,unit:"EUR"}]}],
        results:[
            {key:"expenses_total",label:"Extra expenses total",expression:"sum(expenses.amount)",format:"currency",currency:"EUR"},
            {key:"grand_total",label:"Final total",expression:"base_cost + expenses_total",format:"currency",currency:"EUR"},
            {key:"average_expense",label:"Average expense",expression:"avg(expenses.amount)",format:"currency",currency:"EUR"},
            {key:"minimum_expense",label:"Minimum expense",expression:"min(expenses.amount)",format:"currency",currency:"EUR"},
            {key:"maximum_expense",label:"Maximum expense",expression:"max(expenses.amount)",format:"currency",currency:"EUR"},
            {key:"expense_count",label:"Expense count",expression:"count(expenses)",format:"number"}
        ]
    };
    const errors=Array.from(engine.validateMakerSpec(spec).errors);
    assert.deepEqual(errors,[],"All six results must pass formula and unit validation: "+errors.join(" | "));
    const calculated=engine.evaluateFormulaResults(spec,{base_cost:30},{expenses:[{amount:15},{amount:25}]});
    assert.deepEqual(Array.from(calculated,result=>result.value),[40,70,20,15,25,2]);

    const missingCurrencySpec={
        inputs:spec.inputs,
        groups:spec.groups,
        results:[{...spec.results[2],currency:""}]
    };
    const missingCurrencyErrors=Array.from(engine.validateMakerSpec(missingCurrencySpec).errors);
    assert.deepEqual(missingCurrencyErrors,[],"A blank currency must use the same EUR default shown by the editor.");
    assert.equal(missingCurrencySpec.results[0].currency,"EUR");
    const regionalDefault={format:"currency",currency:""};
    assert.equal(engine.ensureResultCurrency(regionalDefault,"RSD"),"RSD");
    assert.equal(regionalDefault.currency,"RSD");
    const explicitInvalid={format:"currency",currency:"ZZZ"};
    assert.equal(engine.ensureResultCurrency(explicitInvalid,"EUR"),"ZZZ","An explicitly invalid currency must not be silently replaced.");
    assert.match(maker,/ensureResultCurrency\(item,state\.regionalDefaults\?\.currency\|\|"EUR"\)/);
    assert.match(maker,/const invalidCurrency=\(specToSave\.results\|\|\[\]\)/);
});

test("UGC calculator scenarios and advanced input types are validated on the server", () => {
    assert.match(maker,/function renderManualScenarioEditor/);
    assert.match(maker,/function updateMakerTestResults/);
    assert.match(maker,/Compare scenarios/);
    assert.match(maker,/Scenario comparison/);
    assert.match(maker,/controlType==="select"/);
    assert.match(maker,/controlType==="toggle"/);
    assert.match(maker,/controlType==="slider"/);
    assert.match(maker,/Dropdown choices · one label = numeric value per line/);
    assert.match(maker,/up to 3 comparison scenarios/);
    assert.match(maker,/up to 24 fixed inputs/);
    assert.match(maker,/up to 20 results/);
    assert.match(maker,/function renderManualGroupEditor/);
    assert.match(maker,/sum\(group_key\.field_key\)/);
    assert.match(composableBuilderSql,/up to four dynamic input groups/i);
    assert.match(composableBuilderSql,/sum.*count/);
    assert.match(paginationFixture,/Composable Manual Builder/);
    assert.match(maker,/Number with unit/);
    assert.match(calculatorEngineSource,/function analyseFormulaUnit/);
    assert.match(calculatorEngineSource,/Addition and subtraction require matching units/);
    assert.match(calculatorEngineSource,/choose a supported ISO 4217 currency code/);
    assert.match(sql,/jsonb_array_length\(p_spec->'scenarios'\) > 3/);
    assert.match(sql,/comparison scenario value is outside its input range/i);
    assert.match(sql,/comparison scenario value must match one of its dropdown choices/i);
    assert.match(sql,/Comparison scenario names must be unique/i);
    assert.match(sql,/Dropdown inputs require 2 to 12 choices/i);
    assert.match(sql,/Toggle inputs must use 0\/1 values/i);
    assert.match(sql,/coalesce\(v_result->>'format','number'\) not in \('number','currency','percent','unit'\)/);
    assert.match(paginationFixture,/comparison scenario was not preserved/);
    assert.match(paginationFixture,/scenario value outside the input range was accepted/);
    assert.match(paginationCss,/\.ugc-maker-scenario-grid/);
    assert.match(paginationCss,/\.ugc-scenario-public-results/);
});

test("UGC currency choices match the current ISO 4217 list and preserve historical BGN", () => {
    const list=currencyData.currencies;
    const codes=list.map(([code])=>code);
    assert.equal(codes.length,178,"The current ISO 4217 List One snapshot should contain 178 unique codes.");
    assert.equal(new Set(codes).size,178,"Currency codes must be unique.");
    assert.ok(codes.includes("EUR"));
    assert.ok(codes.includes("BHD")&&codes.includes("JPY"));
    assert.ok(!codes.includes("BGN"),"BGN must not appear in the current list after Bulgaria's euro adoption.");
    assert.ok(currencyData.historicalCurrencies.some(([code])=>code==="BGN"));
    assert.match(maker,/minimumFractionDigits:minorUnits,maximumFractionDigits:minorUnits/);
    assert.match(sql,/v_supported_currency_codes constant text\[\]/);
    assert.match(sql,/upper\(coalesce\(v_result->>'currency',''\)\) = any\(v_supported_currency_codes\)/);
    assert.match(sql,/'BGN'/);
});


test("Manual Builder loads the extracted shared v1 engine before its UI adapter",()=>{
    const engineTag=html.indexOf('ugc-calculator-engine.js?v=shared-v1-extraction-20261113a');
    const builderTag=html.indexOf('ugc-calculators.js?v=');
    assert.ok(engineTag>=0&&builderTag>engineTag,"The shared engine must load before the Manual Builder UI.");
    assert.match(maker,/window\.WorthItCalculatorEngine\?\.create/);
    assert.match(maker,/const \{[\s\S]*validateMakerSpec[\s\S]*\}=calculatorEngine/);
    assert.match(calculatorEngineSource,/apiVersion:1/);
    assert.doesNotMatch(calculatorEngineSource,/\beval\s*\(|new\s+Function\s*\(/);
});

test("calculator formulas are declarative and never executed as arbitrary JavaScript", () => {
    assert.match(calculatorEngineSource, /function compileExpression/);
    assert.match(calculatorEngineSource, /function evaluate/);
    assert.match(maker, /calc_wallet_reserve/);
    assert.match(maker, /calc_wallet_settle/);
    assert.match(maker, /calc_wallet_refund/);
    assert.doesNotMatch(maker, /\beval\s*\(/);
    assert.doesNotMatch(maker, /new\s+Function\s*\(/);
    assert.match(sql, /private\.worth_it_validate_ugc_spec/);
    assert.match(sql, /formula contains an unsupported variable or function/i);
    assert.match(sql, /'if','gt','gte','lt','lte','eq','neq','and','or','not'/);
    assert.match(sql, /private\.worth_it_ugc_maker_daily_usage/);
    assert.match(sql, /requests_used\s*<\s*v_limit/);
    assert.match(sql, /v_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end/);
    assert.match(sql, /reserve_worth_it_ugc_maker_generation/);
    assert.match(makerQuotaSql, /worth_it_ugc_maker_generation_reservations/);
    assert.match(makerQuotaSql, /refund_worth_it_ugc_maker_generation_v2/);
    assert.match(makerQuotaSql, /status = 'refunded'/);
    assert.match(makerApi, /reserve_worth_it_ugc_ai_operation/);
    assert.match(makerApi, /refund_worth_it_ugc_ai_operation/);
    assert.match(makerApi, /DAILY_AI_LIMIT/);
    assert.match(makerApi, /GEMINI_API_KEY/);
    assert.match(makerApi, /GROQ_API_KEY/);
});

test("UGC writes are owner-bound with no lifetime cap and private calculators are hidden server-side", () => {
    assert.match(sql, /char_length\(v_title\) not between 3 and 70/);
    assert.doesNotMatch(visibilitySql, /v_count\s*>=\s*10|up to 10 community calculators/i);
    assert.match(visibilitySql, /worth_it_validate_ugc_categories/);
    assert.match(sql, /where id=p_id and owner_user_id=v_user_id/);
    assert.match(sql, /where id=p_id and owner_user_id=v_user_id for update/);
    assert.match(sql, /revoke all on private\.worth_it_user_calculators from public, anon, authenticated/i);
    assert.match(sql, /alter table private\.worth_it_user_calculators enable row level security/i);
    assert.match(sql, /revoke all on function public\.save_worth_it_ugc_calculator/);
    assert.match(sql, /grant execute on function public\.save_worth_it_ugc_calculator.*to authenticated/i);
    assert.match(sql, /email_confirmed_at is not null/);
    assert.match(sql, /'is_owner',\(c\.owner_user_id=v_user_id\)/);
    assert.match(read("supabase/worth-it-ugc-visibility-categories-drafts.sql"), /c\.status='published' and c\.visibility='public'/);
    assert.match(read("supabase/worth-it-ugc-visibility-categories-drafts.sql"), /c\.owner_user_id=v_user_id or \(c\.status='published' and c\.visibility='public'\)/);
    assert.match(read("tests/fixtures/ugc-badges-postgres-smoke.sql"), /The account should be able to save more than ten calculators/);
    assert.match(read("tests/fixtures/ugc-badges-postgres-smoke.sql"), /A non-owner opened a private calculator by direct ID/);
    assert.doesNotMatch(sql, /'owner_user_id',c\.owner_user_id/);
});

test("community creation quotas are enforced by SQL and public IDs begin at 51", () => {
    assert.ok(sql.includes("create sequence if not exists private.worth_it_user_calculator_number_seq") && sql.includes("start with 51 increment by 1 minvalue 51"));
    assert.match(sql, /calculator_number bigint not null/);
    assert.match(sql, /get_worth_it_ugc_creation_quota/);
    assert.ok(sql.includes("pedjasebez3545@gmail.com"));
    assert.match(sql, /when 'premium' then 3 when 'premium_lite' then 2 else 1/);
    assert.match(sql, /creations_used<v_daily_limit/);
    assert.match(sql, /if p_id is null then/);
    assert.match(sql, /returning id,calculator_number into v_id,v_calculator_number/);
    assert.match(sql, /'calculator_number',calculator_number/);
    assert.match(maker, /async function refreshCreationQuota/);
    assert.match(maker, /ugcMakerQuotaStatus/);
    assert.match(maker, /WORTH IT COMMUNITY · CALCULATOR #/);
    assert.match(html, /id="ugcMakerQuotaStatus"/);
    assert.match(html, /id="ugcDetailKicker"/);
});

test("profile favourites are account-owned and profile visibility is respected", () => {
    assert.match(sql, /create table if not exists public\.worth_it_calculator_favorites/i);
    assert.match(sql, /grant select,insert,delete on public\.worth_it_calculator_favorites to authenticated/i);
    assert.match(sql, /using \(\(select auth\.uid\(\)\)=user_id\)/i);
    assert.match(sql, /with check \(\(select auth\.uid\(\)\)=user_id\)/i);
    assert.match(sql, /get_worth_it_profile_favorite_calculators/);
    assert.match(sql, /profile_visibility/);
    assert.match(profile, /get_worth_it_profile_favorite_calculators/);
    assert.match(profile, /loadWorthItProfileFavorites/);
    assert.ok(html.includes(">Favorite Calculators<"));
    assert.match(community, /worth_it_calculator_favorites/);
    assert.match(community, /calc-favorite-toggle/);
    assert.match(community, /#ugcCalculatorGrid/);
});

test("OWNER, PREMIUM, PREMIUM LITE and tenure badges are earned server-side and equipable", () => {
    for (const key of ["owner", "premium", "premium_lite", "member_1m", "member_3m", "member_6m", "member_12m", "member_2y", "member_3y", "member_4y", "member_5y"]) {
        assert.ok(sql.includes("'" + key + "'"), key + " is in the badge system");
    }
    assert.match(sql, /pedjasebez3545@gmail\.com/);
    assert.match(sql, /private\.worth_it_badge_is_earned/);
    assert.match(sql, /set_worth_it_profile_badge_equipped/);
    assert.match(sql, /This badge has not been unlocked/);
    assert.match(sql, /premium_lite.*premium_expires_at/is);
    assert.match(economy, /PREMIUM LITE/);
    assert.match(profile, /set_worth_it_profile_badge_equipped/);
    assert.match(profile, /Unequip/);
    assert.match(profile, /Equip/);
    assert.match(profile, /worthItProfileNameBadges/);
    assert.match(chat, /worth-it-chat-member-badges/);
    assert.match(chat, /loadWorthItPublicBadges/);
});

test("migration and browser scripts are included in CI parsing and regression checks", () => {
    assert.match(workflow, /tests\/ugc-calculators\.test\.mjs/);
    assert.match(workflow, /ugc-calculators\.js/);
    assert.match(workflow, /functions\/api\/ugc-maker\.js/);
    assert.match(workflow, /supabase\/worth-it-ugc-badges\.sql/);
    assert.match(workflow, /ugc-badges-postgres-setup\.sql/);
    assert.match(workflow, /ugc-badges-postgres-smoke\.sql/);
});


test("community calculators use secure 30-item server pagination for every view and category", () => {
    for (const id of ["ugcCategoryFilter","ugcPagination","ugcPagePrevious","ugcPageNext","ugcPageNumber","ugcPageTotal","ugcPageInput"]) {
        assert.ok(html.includes('id="' + id + '"'), id + " exists in the catalogue UI");
    }
    const paginationMarkup = html.match(/<nav id="ugcPagination"[\s\S]*?<\/nav>/)?.[0] || "";
    assert.match(paginationMarkup,/id="ugcPagePrevious"[\s\S]*id="ugcPageNumber"[\s\S]*id="ugcPageTotal"[\s\S]*id="ugcPageNext"[\s\S]*id="ugcPageInput"/);
    assert.doesNotMatch(paginationMarkup,/ugcPageGo|Go to page/);
    assert.match(maker,/function catalogPageKey\(\)/);
    assert.match(maker,/state\.pages\[catalogPageKey\(\)\]/);
    assert.match(maker,/state\.lastPage/);
    assert.match(maker,/function currentCatalogPage\(\)[\s\S]*?remembered\|\|state\.lastPage/);
    assert.match(maker,/nav\.hidden=total===0/);
    const paginationFunction = maker.slice(maker.indexOf("function renderPagination"), maker.indexOf("function goToCatalogPage"));
    assert.match(paginationFunction,/input\.disabled=false/);
    assert.doesNotMatch(paginationFunction,/input\.disabled=pages<=1/);
    assert.match(maker,/ugcPageInput.*addEventListener\("change"/);
    assert.match(paginationCss,/\.ugc-pagination\{[\s\S]*?flex-wrap:nowrap/);
    assert.match(maker,/get_worth_it_ugc_catalog_page/);
    assert.match(maker,/p_category:state\.category/);
    assert.match(maker,/p_page:currentCatalogPage\(\)/);
    assert.match(maker,/function goToCatalogPage\(value\)/);
    assert.match(maker,/function switchCalculatorExploreView\(target\)/);
    assert.match(maker,/to\.style\.transform="translateX\("\+\(direction\*100\)\+"%\)"/);
    assert.match(maker,/from\.style\.transform="translateX\("\+\(-direction\*100\)\+"%\)"/);
    assert.match(paginationCss,/\.calculator-explore-stage>\.calculator-explore-panel\[hidden\][\s\S]*?display:none!important/);
    assert.ok(html.indexOf('id="calculators"')<html.indexOf('id="ugcCommunitySection"'));
    assert.match(paginationSql,/v_page_size integer := 30/);
    assert.match(paginationSql,/limit v_page_size offset v_offset/);
    assert.match(visibilitySql,/worth_it_ugc_category_matches/);
    assert.match(visibilitySql,/p_filter=any/);
    for (const sort of ["latest","popular","liked","favorited","disliked","mine","my-favorites"]) {
        assert.ok(paginationSql.includes("'" + sort + "'"), sort + " has a server-side pagination path");
    }
    assert.ok(visibilitySql.includes("my-drafts"), "my-drafts has a server-side pagination path");
    assert.match(visibilitySql,/elsif v_sort='my-drafts' then/);
    const mineBranch=visibilitySql.slice(visibilitySql.indexOf("if v_sort='mine' then"),visibilitySql.indexOf("elsif v_sort='my-drafts' then"));
    const draftBranch=visibilitySql.slice(visibilitySql.indexOf("elsif v_sort='my-drafts' then"),visibilitySql.indexOf("elsif v_sort='my-favorites' then"));
    assert.equal((mineBranch.match(/c\.status='published'/g)||[]).length,2,"My Calculators count and rows only include published calculators");
    assert.equal((draftBranch.match(/c\.status='draft'/g)||[]).length,2,"My Drafts count and rows only include drafts");
    assert.match(paginationSql,/grant execute on function public\.get_worth_it_ugc_catalog_page\(text,text,text,text,integer\) to authenticated/);
    assert.match(paginationFixture,/The first UGC page must contain exactly 30 items/);
    assert.match(paginationFixture,/UGC category filtering leaked calculators/);
    assert.match(paginationCss,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
    assert.match(paginationCss,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});


test("calculator explorer animates between Basic, UGC and Discovery while restoring one visible panel", () => {
    assert.match(maker, /let pendingExploreTransitionFinish=null/);
    assert.match(maker, /const EXPLORE_VIEWS=\["basic","community","discovery"\]/);
    assert.match(maker, /function explorePanel\(view\)/);
    assert.match(maker, /function reconcileExplorePanels\(\)/);
    assert.match(maker, /pendingExploreTransitionFinish=finish/);
    assert.match(maker, /document\.addEventListener\("visibilitychange"/);
    assert.match(maker, /window\.addEventListener\("pageshow",reconcileExplorePanels\)/);
    assert.match(maker, /window\.addEventListener\("focus",\(\)=>\{reconcileExplorePanels\(\);refreshCreatorDiscoveryWhenVisible\(\);\}\)/);
    assert.match(maker, /panel\.hidden=name!==active;panel\.inert=name!==active/);
    assert.match(maker, /state\[exploreScrollKey\(fromView\)\]=from\.scrollTop/);
    assert.match(maker, /to\.scrollTop=state\[exploreScrollKey\(next\)\]\|\|0/);
    assert.match(maker, /fallbackTimer=window\.setTimeout\(finish,duration\+160\)/);
    assert.match(paginationCss, /visibility:\s*hidden\s*!important/);
    assert.match(paginationCss, /pointer-events:\s*none\s*!important/);
    assert.match(paginationCss, /data-transitioning="true"[\s\S]*?will-change: transform/);
});


test("community catalogue is synchronously reset to Basic on sign-in and sign-out", () => {
    assert.match(maker, /onAuthStateChange\(\(event,session\)=>/);
    assert.match(maker, /state\.session=session\|\|null/);
    assert.match(maker, /state\.userId=state\.session\?\.user\?\.id\|\|""/);
    assert.match(maker, /if\(!state\.userId\|\|accountChanged\)\{\s*setExploreInitialView\("basic"\)/);
    assert.match(maker, /reconcileExplorePanels\(\);\s*const navActions=\$\("ugcNavigationActions"\)/);
    assert.match(maker, /if\(navActions\)navActions\.hidden=!state\.userId/);
    assert.match(maker, /const EXPLORE_VIEWS=\["basic","community","discovery"\]/);
    assert.match(maker, /setExploreInitialView\(window\.location\.pathname\.startsWith\("\/calculator\/ugc\/"\)\?"community":"basic"\)/);
    assert.doesNotMatch(maker, /onAuthStateChange\(async\(\)=>[\s\S]*?await getSession\(\)/);
    assert.match(maker, /ugcDetailCalculatorForm"\)\?\.replaceChildren\(\)/);
});


test("AI Maker taxonomy is AI-assigned, closed-set validated and shown as category chips", () => {
    assert.match(makerApi, /ALLOWED_SUBCATEGORIES/);
    assert.match(makerApi, /Choose 1 to 3 relevant subcategories from the selected primary category only/);
    assert.match(makerApi, /subcategories\.length<1\|\|subcategories\.length>3/);
    assert.match(maker, /getCategoryLabels/);
    assert.match(maker, /ugc-subcategory-chip/);
    assert.match(html, /ugcDetailCategories/);
    assert.match(html, /optgroup label="Cars"/);
    assert.match(html, /optgroup label="Money"/);
});


test("public UGC publications notify current followers and stop after unfollow", () => {
    assert.ok(paginationCss.includes(".ugc-maker-close-glyph{display:block;line-height:1;transform:translateY(-2px)}"));
    assert.ok(publishNotificationsSql.includes("after insert or update of status,visibility"));
    assert.ok(publishNotificationsSql.includes("after delete on public.worth_it_follows"));
    assert.ok(publishNotificationsSql.includes("notification_type='ugc_published'"));
    assert.ok(publishNotificationsSql.includes("f.follower_user_id=actor_id"));
    assert.ok(publishNotificationsSql.includes("f.followed_user_id=n.actor_user_id"));
    assert.ok(publishNotificationsSql.includes("f.created_at<=n.created_at"));
    assert.ok(publishNotificationsSql.includes("c.visibility='public'"));
    assert.ok(publishNotificationsSql.includes("interval '24 hours'"));
    assert.ok(profile.includes('type==="ugc_published"'));
    assert.ok(profile.includes("worth-it-notification-calculator-link"));
    assert.ok(profile.includes('if (action === "follow") await refreshWorthItNotifications(false)'));
    assert.ok(paginationFixture.includes("A follower did not receive the new public UGC calculator notification"));
    assert.ok(paginationFixture.includes("Changing a published calculator to Private did not remove its notification"));
    assert.ok(paginationFixture.includes("Unfollowing did not remove prior UGC publication notifications"));
    assert.ok(paginationFixture.includes("A former follower received a later public UGC publication"));
});


test("UGC calculator cards are square, compact, and do not duplicate the parent category", () => {
    assert.match(maker, /mainCategory=CATEGORY_LABELS\[item\.category\]/);
    assert.match(maker, /getCategoryLabels\(item\)\.filter\(label=>label!==mainCategory\)/);
    assert.match(maker, /ugc-card-more.*Open calculator to see all the info/);
    assert.match(paginationCss, /\.ugc-calculator-card\{[\s\S]*?aspect-ratio:1 \/ 1/);
    assert.match(paginationCss, /-webkit-line-clamp:3/);
    assert.match(paginationCss, /\.ugc-card-head\{[\s\S]*?padding-right:48px/);
});

test("UGC page jump stays editable on a single page and explains unavailable future pages", () => {
    assert.match(maker, /input\.disabled=false/);
    assert.doesNotMatch(maker, /input\.disabled=pages<=1/);
    assert.match(maker, /if\(requested>state\.totalPages\)/);
    assert.match(maker, /More pages will appear when enough community calculators have been published/);
    assert.match(html, /id="ugcPageInput" class="ugc-page-input" type="number"/);
});

test("UGC detail page exposes owner pricing, favourites, and only valid public reactions", () => {
    assert.ok(html.includes('id="ugcDetailUsagePrice"'));
    assert.ok(html.includes('max="0.5"'));
    assert.ok(html.includes('id="ugcDetailSaveUsagePrice"'));
    assert.ok(html.includes('id="ugcDetailFavorite"'));
    assert.match(maker, /set_worth_it_ugc_usage_price/);
    assert.match(maker, /p_calculator_id:calculator\.id/);
    assert.match(maker, /const canReact=!isOwner&&isPublicCalculator&&Boolean\(state\.userId\)/);
    assert.match(maker, /likeButton\.hidden=!isPublicCalculator/);
    assert.match(maker, /likeButton\.disabled=!canReact/);
    assert.match(maker, /dislikeButton\.disabled=!canReact/);
    assert.match(maker, /calculator\.my_reaction==="like"/);
    assert.match(maker, /calculator\.my_reaction==="dislike"/);
    assert.match(maker, /bindWorthItUGCFavoriteButton/);
    assert.ok(community.includes("window.bindWorthItUGCFavoriteButton=function"));
    assert.match(read("supabase/worth-it-ugc-pricing.sql"), /usage_price_milli between 100 and 500/);
    assert.match(read("supabase/worth-it-ugc-pricing.sql"), /drop function if exists public\.calc_wallet_reserve\(uuid, text\)/);
    assert.match(read("supabase/worth-it-ugc-pricing.sql"), /p_calculator_id uuid default null/);
});


test("UGC rating policy is owner-only, defaults on, and requires a completed calculator use", () => {
    assert.ok(html.includes('id="ugcDetailReactionPolicy"'));
    assert.match(html, /id="ugcDetailRequireTestBeforeReaction" checked/);
    assert.ok(html.includes('id="ugcDetailReactionPolicyStatus"'));
    assert.ok(html.includes('id="ugcDetailReactionNote"'));
    assert.ok(maker.includes("policy.hidden=!isOwner"));
    assert.ok(maker.includes("policyInput.checked=calculator.require_test_before_reaction!==false"));
    assert.ok(maker.includes("set_worth_it_ugc_reaction_policy"));
    assert.ok(reactionPolicySql.includes("You must complete one calculation before you can like or dislike this calculator"));
    assert.ok(maker.includes("clearReactionNote()"));
    assert.ok(maker.includes('rpc("set_worth_it_ugc_reaction"'));
    assert.ok(reactionPolicySql.includes("case when c.owner_user_id = v_user_id then"));
    assert.doesNotMatch(reactionPolicySql.slice(reactionPolicySql.indexOf("create or replace function public.get_worth_it_ugc_calculator"), reactionPolicySql.indexOf("create or replace function public.set_worth_it_ugc_reaction_policy")), /'has_used'/);
    assert.ok(reactionPolicyPrivacySql.includes("case when c.owner_user_id = v_user_id then"));
    assert.ok(reactionPolicyPrivacySql.includes("jsonb_build_object('require_test_before_reaction', c.require_test_before_reaction)"));
    assert.ok(reactionPolicyPrivacySql.includes("'{}'::jsonb"));
    assert.ok(reactionPolicySql.includes("require_test_before_reaction boolean not null default true"));
    assert.ok(reactionPolicySql.includes("create table if not exists private.worth_it_calculator_uses"));
    assert.ok(reactionPolicySql.includes("t.status = 'completed'"));
    assert.ok(reactionPolicySql.includes("set_worth_it_ugc_reaction_policy"));
    assert.ok(reactionPolicySql.includes("You must complete one calculation before you can like or dislike this calculator"));
    assert.ok(reactionPolicySql.includes("create or replace function public.calc_wallet_settle"));
    assert.ok(reactionPolicySql.includes("ugc_calculator_id"));
    assert.ok(workflow.includes("supabase/worth-it-ugc-reaction-policy.sql"));
    assert.ok(workflow.includes("supabase/worth-it-ugc-reaction-policy-owner-privacy.sql"));
});

test("square UGC cards use responsive columns and explain creator reaction limits", () => {
    assert.ok(paginationCss.includes(".ugc-calculator-grid{"));
    assert.ok(paginationCss.includes("grid-template-columns:repeat(auto-fit,minmax"));
    assert.ok(html.includes('id="ugcDetailReactionNote"'));
    assert.ok(maker.includes('reactionNote.hidden=!isPublicCalculator||!isOwner'));
});


test("UGC cards use four desktop columns and two phone columns with a true square footprint", () => {
    const responsiveTileCss = paginationCss.slice(paginationCss.lastIndexOf("/* Responsive square UGC catalogue tiles"));
    assert.match(responsiveTileCss, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
    assert.match(responsiveTileCss, /@media\(max-width:900px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
    assert.match(responsiveTileCss, /@media\(max-width:640px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
    assert.match(responsiveTileCss, /min-height:0!important/);
    assert.match(responsiveTileCss, /aspect-ratio:1 \/ 1/);
    assert.match(maker, /const ownerUsername=String\(item\.owner_username\|\|\"\"\)\.trim\(\)\.replace\(\/\^@\+\/\,\"\"\)/);
    assert.ok(maker.includes('ownerLabel=ownerUsername?"Made by @"+ownerUsername:"Made by Worth It member"'));
});

test("UGC detail like and dislike buttons have larger desktop and mobile tap targets", () => {
    const desktop = paginationCss.slice(paginationCss.indexOf(".ugc-detail-reaction-button{"), paginationCss.indexOf(".ugc-detail-reaction-button{") + 360);
    assert.match(desktop, /min-width:136px/);
    assert.match(desktop, /min-height:44px/);
    assert.match(desktop, /font-size:14px/);
    assert.match(paginationCss, /@media\(max-width:640px\)[\s\S]*?\.ugc-detail-reaction-button\{\s*min-width:104px;\s*min-height:38px;\s*padding:7px 10px;\s*font-size:11.5px;/);
});

test("UGC detail favourite stays top-right and reactions align with author and categories", () => {
    const detailHeader = html.match(/<header class="ugc-detail-header">[\s\S]*?<\/header>/)?.[0] || "";
    assert.match(detailHeader, /id="ugcDetailFavorite"/);
    assert.match(detailHeader, /class="ugc-detail-meta-grid"/);
    const ownerPosition = detailHeader.indexOf('id="ugcDetailOwner"');
    const likePosition = detailHeader.indexOf('id="ugcDetailLike"');
    const categoryPosition = detailHeader.indexOf('id="ugcDetailCategories"');
    const dislikePosition = detailHeader.indexOf('id="ugcDetailDislike"');
    const statsPosition = detailHeader.indexOf('id="ugcDetailStats"');
    assert.ok(ownerPosition >= 0 && likePosition > ownerPosition);
    assert.ok(categoryPosition > likePosition && dislikePosition > categoryPosition);
    assert.ok(statsPosition > dislikePosition);
    assert.match(detailHeader, /id="ugcDetailStats"/);
    assert.doesNotMatch(detailHeader, /class="ugc-detail-actions"/);
    assert.doesNotMatch(html.slice(html.indexOf('id="ugcDetailUsagePriceDisplay"')), /id="ugcDetailFavorite"/);
    assert.ok(maker.includes('ownerLabel=ownerUsername?"Made by @"+ownerUsername:"Made by Worth It member"'));
});

test("Public UGC cards keep only the calculator CTA; reactions stay inside the detail page", () => {
    const catalogRenderer = maker.slice(maker.indexOf("function renderCatalog(rows)"), maker.indexOf("function catalogPageKey()"));
    assert.match(catalogRenderer, /button\("Open calculator →"/);
    assert.doesNotMatch(catalogRenderer, /react\(item\.id,"like"\)/);
    assert.doesNotMatch(catalogRenderer, /react\(item\.id,"dislike"\)/);
    assert.match(catalogRenderer, /statItem\("👁"/);
    assert.match(catalogRenderer, /statItem\("👍"/);
    assert.match(catalogRenderer, /statItem\("★"/);
    assert.match(catalogRenderer, /statItem\("👎"/);
    assert.match(maker, /"👍 Like"/);
    assert.match(maker, /"👎 Dislike"/);
    assert.match(paginationCss, /\.ugc-stat-icon\{[\s\S]*?font-size:14px/);
    assert.match(paginationCss, /\.ugc-calculator-card>\.calc-favorite-toggle/);
    assert.match(paginationCss, /\.ugc-card-title\{[\s\S]*?padding-right:44px/);
});

test("UGC Maker offers multi-currency result formatting and selectable measurement units", () => {
    assert.match(maker, /const CURRENCIES=currencyMetadata\.currencies/);
    assert.match(calculatorCurrencyDataSource, /const CURRENCIES=\[/);
    assert.match(calculatorCurrencyDataSource, /\["RSD","Serbian Dinar",2\]/);
    assert.match(maker, /const UNIT_OPTIONS=\[/);
    assert.match(maker, /UNIT_OPTIONS\.forEach/);
    assert.match(maker, /CURRENCIES\.forEach/);
    assert.match(maker, /currencySelect\.value=isKnownCurrency\?currentCurrency:"__custom__"/);
    assert.match(maker, /customCurrency\.maxLength=3/);
    assert.match(maker, /Each result can use a different currency/);
    assert.match(makerApi, /For monetary inputs, set unit to the relevant ISO 4217 currency code/);
    assert.match(makerApi, /Only calculate currency conversion when an exchange rate is supplied/);
});

test("Mobile header uses two aligned rows with economy controls below the logo", () => {
    assert.ok(webShopCss.includes("grid-template-rows:minmax(40px,auto) minmax(40px,auto)"));
    assert.ok(webShopCss.includes(".nav-inner>.logo{\n  grid-column:2;\n  grid-row:1;"));
    assert.ok(webShopCss.includes(".nav-inner>.calc-economy-nav{\n  grid-column:2 / 4;\n  grid-row:2;"));
    assert.ok(webShopCss.includes(".nav-inner>.nav-right-stack>.nav-top-row{\n  grid-column:3 / 5;\n  grid-row:1;"));
    assert.ok(webShopCss.includes("width:auto!important;\n  min-width:0;\n  flex:0 1 auto!important;"));
    assert.ok(webShopCss.includes(".nav-inner>.nav-right-stack>.nav-secondary-row{\n  grid-column:4;\n  grid-row:2;"));
    assert.ok(webShopCss.includes(".calc-shop-nav-label{display:inline!important}"));
    assert.ok(webShopCss.includes(".calc-wip-use{\n  display:block!important;"));
    assert.doesNotMatch(webShopCss, /translate\(-50px,-10px\)|translate\(-20px,-10px\)|translateY\(-40px\)|translateY\(10px\)/);
    assert.ok(webShopCss.includes("body{padding-top:98px!important}"));
});

test("UGC save rejects incomplete custom ISO currency codes before the server write", () => {
    const saveFunction = maker.slice(maker.indexOf("async function saveMakerDraft(publish)"), maker.indexOf("function setExploreInitialView"));
    assert.match(saveFunction, /invalidCurrency=\(specToSave\.results\|\|\[\]\)\.find\(item=>item\.format==="currency"&&!\/\^\[A-Z\]\{3\}\$\//);
    assert.match(saveFunction, /ensureResultCurrency\(normalized,state\.regionalDefaults\?\.currency\|\|"EUR"\)/);
    assert.match(saveFunction, /valid three-letter ISO 4217 currency code/);
    assert.ok(saveFunction.indexOf("invalidCurrency") < saveFunction.indexOf("sb().rpc(\"save_worth_it_ugc_calculator\""));
});



test("Member profile UGC favourites render rich cards with tags, creator and all four statistics", () => {
    assert.match(profile, /function appendProfileUgcStat/);
    assert.match(profile, /PROFILE_UGC_CATEGORY_LABELS/);
    assert.match(profile, /item\.subcategories\)\?item\.subcategories:\[\]/);
    assert.match(profile, /subcategories\.slice\(0,3\)/);
    assert.match(profile, /Made by @/);
    assert.match(profile, /appendProfileUgcStat\(stats,"👁",item\.views,"Views"\)/);
    assert.match(profile, /appendProfileUgcStat\(stats,"👍",item\.likes,"Likes"\)/);
    assert.match(profile, /appendProfileUgcStat\(stats,"★",item\.favorites,"Favourites"\)/);
    assert.match(profile, /appendProfileUgcStat\(stats,"👎",item\.dislikes,"Dislikes"\)/);
    assert.match(profile, /Open calculator →/);
    assert.match(profileCardsSql, /'subcategories',to_jsonb\(c\.subcategories\)/);
    assert.match(profileCardsSql, /'views',\([\s\S]*?private\.worth_it_calculator_views/);
    assert.match(profileCardsSql, /'likes',\([\s\S]*?private\.worth_it_calculator_reactions/);
    assert.match(profileCardsSql, /'dislikes',\([\s\S]*?private\.worth_it_calculator_reactions/);
    assert.match(profileCardsSql, /profile_visibility/);
    assert.match(workflow, /supabase\/worth-it-ugc-profile-cards\.sql/);
    assert.match(paginationCss, /\.worth-it-profile-favourite-owner[\s\S]*?font-size:13px/);
    assert.match(paginationCss, /\.worth-it-profile-ugc-stat-icon[\s\S]*?font-size:16px/);
});

test("UGC catalogue cards show up to three subcategories beside the public number and main category", () => {
    const renderer = maker.slice(maker.indexOf("function renderCatalog(rows)"), maker.indexOf("function catalogPageKey()"));
    assert.match(renderer, /head\.appendChild\(text\("span","ugc-category"/);
    assert.match(renderer, /getCategoryLabels\(item\)\.filter\(label=>label!==mainCategory\)\.slice\(0,3\)/);
    assert.match(renderer, /head\.appendChild\(text\("span","ugc-subcategory-chip",label\)\)/);
    assert.doesNotMatch(renderer, /card\.appendChild\(categoryChips\)/);
    assert.match(paginationCss, /\.ugc-card-head \.ugc-subcategory-chip/);
});

test("UGC card author and statistics share a byline lifted by 20px", () => {
    const renderer = maker.slice(maker.indexOf("function renderCatalog(rows)"), maker.indexOf("function catalogPageKey()"));
    assert.match(renderer, /const byline=document\.createElement\("div"\);byline\.className="ugc-card-byline"/);
    assert.match(renderer, /byline\.appendChild\(owner\)/);
    assert.match(renderer, /byline\.appendChild\(stats\)/);
    assert.match(renderer, /card\.appendChild\(byline\)/);
    assert.match(paginationCss, /\.ugc-card-byline\{[\s\S]*?margin-bottom:-20px[\s\S]*?top:-20px/);
    assert.match(paginationCss, /\.ugc-card-byline \.ugc-card-owner\{[\s\S]*?font-size:12px/);
    assert.match(paginationCss, /\.ugc-card-byline \.ugc-stat-icon\{[\s\S]*?font-size:16px/);
});

test("Phone header controls stay in their assigned rows without pixel-offset transforms", () => {
    assert.ok(webShopCss.includes(".nav-inner>.nav-right-stack>.nav-top-row .ai-chat-nav-btn{"));
    assert.ok(webShopCss.includes(".nav-inner>.nav-right-stack>.nav-top-row>.auth-wrap>.profile-nav-btn{\n  transform:none!important;"));
    assert.ok(webShopCss.includes(".nav-inner>.nav-right-stack>.nav-secondary-row>.signout-nav-btn,"));
    assert.ok(webShopCss.includes("transform:none!important;"));
    assert.doesNotMatch(webShopCss, /translateY\(-40px\)|translateY\(10px\)/);
});

test("Phone catalogue cards replace the long description with the calculator detail prompt", () => {
    assert.match(paginationCss, /@media\(max-width:640px\)[\s\S]*?\.ugc-calculator-card \.ugc-card-description\{display:none!important\}/);
    assert.match(paginationCss, /\.ugc-calculator-card \.ugc-card-more\{[\s\S]*?display:block!important/);
});

test("UGC views count each signed-in account once per calculator for its lifetime", () => {
    assert.match(uniqueViewsSql, /row_number\(\) over \(\s*partition by calculator_id,viewer_user_id/);
    assert.match(uniqueViewsSql, /primary key \(calculator_id,viewer_user_id\)/);
    assert.match(uniqueViewsSql, /on conflict \(calculator_id,viewer_user_id\) do nothing/);
    assert.match(uniqueViewsSql, /visibility='public'/);
    assert.match(uniqueViewsSql, /owner_user_id<>v_user_id/);
    assert.match(uniqueViewsFixture, /2026-10-01 12:00:00\+00/);
    assert.match(uniqueViewsFixture, /2026-10-02 12:00:00\+00/);
    assert.match(maker, /window\.recordWorthItUgcView=async id=>/);
    assert.match(maker, /recorded\?\.success===true&&recorded\.counted===true/);
    assert.match(maker, /if\(state\.activeCalculator&&String\(state\.activeCalculator\.id\)===String\(id\)\)/);
    assert.match(paginationFixture, /A repeat visit by the same account must not increase lifetime views/);
});

test("UGC like and dislike controls are wired, debounced during writes, and support toggling", () => {
    assert.match(maker, /ugcDetailLike"\)\?\.addEventListener\("click",\(\)=>state\.activeId&&react\(state\.activeId,"like"\)\)/);
    assert.match(maker, /ugcDetailDislike"\)\?\.addEventListener\("click",\(\)=>state\.activeId&&react\(state\.activeId,"dislike"\)\)/);
    assert.match(maker, /reactionButtons\.some\(button=>button\.disabled\)/);
    assert.match(maker, /set_worth_it_ugc_reaction/);
    assert.match(sql, /on conflict\(calculator_id,user_id\) do update set reaction=excluded\.reaction/);
    assert.match(paginationFixture, /A repeated dislike removes the current reaction/);
    assert.match(paginationFixture, /Switching from like to dislike did not update the existing reaction/);
});

test("Basic and UGC panels allow page scroll chaining and desktop cards show longer descriptions", () => {
    const scrollAndDesktopPolish = paginationCss.slice(paginationCss.lastIndexOf("/* Let the page continue scrolling"));
    assert.match(scrollAndDesktopPolish, /overscroll-behavior-y:auto!important/);
    assert.match(scrollAndDesktopPolish, /@media\(min-width:701px\)/);
    assert.match(scrollAndDesktopPolish, /display:block!important/);
    assert.match(scrollAndDesktopPolish, /-webkit-line-clamp:unset!important/);
    assert.match(scrollAndDesktopPolish, /overflow:visible!important/);
    assert.match(scrollAndDesktopPolish, /\.ugc-card-byline\{\s*margin-top:0!important/);
    assert.match(scrollAndDesktopPolish, /\.ugc-card-actions\{\s*margin-top:auto/);
});


test("UGC catalogue descriptions use the same 120-character preview and placement on every calculator card", () => {
    const helperStart = maker.indexOf("function cardDescriptionPreview(description){");
    const helperEnd = maker.indexOf("\n}", helperStart) + 2;
    assert.ok(helperStart >= 0 && helperEnd > helperStart, "The shared UGC description preview helper must exist.");
    const preview = runInNewContext("(" + maker.slice(helperStart, helperEnd) + ")");
    const longDescription = "Compare the cost of keeping your current monthly subscription with switching to a cheaper alternative. Enter the current monthly amount and compare it with another plan.";
    assert.equal(
        preview(longDescription),
        "Compare the cost of keeping your current monthly subscription with switching to a cheaper alternative. Enter the current..."
    );
    assert.equal(preview("A short calculator description."), "A short calculator description.");
    assert.ok(maker.includes("const limit=120"));
    assert.ok(maker.includes('replace(/[.!?…]+$/,"")+"..."'));
    assert.ok(maker.includes("descriptionNode.title=fullDescription"));
    assert.ok(maker.includes('description.textContent=calculator.description||"No description provided."'));
    assert.ok(maker.includes("descInput.maxLength=500"));
    assert.ok(html.includes('id="ugcDetailDescriptionInput"') && html.includes('maxlength="500"'));
    assert.ok(sqlEnhancements.includes("char_length(v_description)>500"));
    assert.ok(visibilitySql.includes("char_length(v_description)>500"));
    assert.ok(paginationCss.includes(".ugc-calculator-card .ugc-card-description{\n transform:translateY(0px);\n}"));
    assert.match(paginationCss, /@media\(min-width:701px\)\{\s*\.ugc-calculator-card \.ugc-card-description\{\s*transform:translateY\(-5px\);\s*\}\s*\}/);
    assert.doesNotMatch(paginationCss, /@media\(max-width:700px\)\{[^}]*\.ugc-calculator-card \.ugc-card-description\{[^}]*transform:translateY\(-5px\)/);
    assert.ok(!paginationCss.includes(".ugc-calculator-card.ugc-card-subscription-savings .ugc-card-description"));
});


test("UGC reaction buttons are enabled only for public calculators owned by another account", () => {
    assert.match(visibilitySql, /'visibility',c\.visibility/);
    assert.match(visibilitySql, /c\.owner_user_id=v_user_id or \(c\.status='published' and c\.visibility='public'\)/);
    assert.match(visibilitySql, /status='published' and visibility='public' and owner_user_id<>v_user_id/);
    assert.match(maker, /const canReact=!isOwner&&isPublicCalculator&&Boolean\(state\.userId\)/);
    assert.match(maker, /You created this calculator, so you cannot like or dislike it/);
    assert.match(maker, /active\.likes=Math\.max\(0,Number\(active\.likes\)\|\|0\)/);
    assert.match(maker, /active\.dislikes=Math\.max\(0,Number\(active\.dislikes\)\|\|0\)/);
});

test("UGC views, reactions and favourites refresh their matching statistic counters", () => {
    assert.match(maker, /state\.activeCalculator\.views=Math\.max\(0,Number\(state\.activeCalculator\.views\)\|\|0\)\+1/);
    assert.match(maker, /renderDetailStats\(active\)/);
    assert.match(maker, /calculator\.favorites=Math\.max\(0,Number\(calculator\.favorites\|\|0\)\+\(active\?1:-1\)\)/);
    assert.match(community, /notify\(\)/);
    assert.ok(maker.includes("await Promise.all([loadCatalog(),loadCreatorLeaderboards()]);"));
    assert.match(maker, /if\(state\.activeId===String\(id\)\)await openDetail\(id,\{fromUrl:true\}\)/);
});

test("opening Settings or another page hides UGC detail, and UGC Back restores the previous route", () => {
    assert.match(routing, /name !== "openWorthItUGCCalculator"[\s\S]*?ugcDetail\.hidden = true/);
    assert.match(routing, /route\.kind !== "ugc-calculator"[\s\S]*?ugcDetail\.hidden = true/);
    assert.match(maker, /window\.backFromWorthItRoute\("\/calculators"\)/);
});


test("Subscription Savings keeps its title spacing while descriptions use the shared UGC card position", () => {
    assert.ok(paginationCss.includes(".ugc-calculator-card.ugc-card-subscription-savings .ugc-card-title{"));
    assert.ok(paginationCss.includes("line-height:1.35!important;"));
    assert.ok(paginationCss.includes("padding-bottom:3px;"));
    assert.ok(maker.includes('normalizedCardTitle==="subscription savings calculator"'));
    assert.ok(maker.includes('card.classList.add("ugc-card-subscription-savings")'));
    assert.ok(paginationCss.includes(".ugc-calculator-card .ugc-card-description{\n transform:translateY(0px);\n}"));
    assert.ok(!paginationCss.includes(".ugc-calculator-card.ugc-card-subscription-savings .ugc-card-description"));
});


test("Profile avatar is enlarged on desktop only and keeps mobile dimensions", () => {
    assert.match(style, /@media\(min-width:701px\)[\s\S]*?\.profile-nav-btn > #profileNavIcon\{[\s\S]*?width:40px;[\s\S]*?\.profile-nav-btn \.auth-avatar,[\s\S]*?height:40px;/);
    assert.match(style, /@media\(max-width:700px\)\{\s*\.profile-nav-btn\{\s*width:40px;\s*height:40px;\s*flex-basis:40px;\s*padding:3px;\s*\}\s*\.profile-nav-btn \.auth-avatar,\s*\.profile-nav-btn \.auth-avatar-fallback\{\s*width:32px;\s*height:32px;\s*flex-basis:32px;\s*\}\s*\}/);
});


test("Creator discovery shows Top Creators, Rising Creators and separate public community members", () => {
    assert.ok(html.includes('id="ugcTopCreatorsHeading">🌟 Top Creators'));
    assert.ok(html.includes('id="ugcRisingCreatorsHeading">🚀 Rising Creators'));
    assert.ok(html.includes('id="ugcCommunityMembersHeading">👥 Community Members'));
    assert.ok(html.includes('id="ugcCreatorPeriodFilter"'));
    for (const period of ["7d","30d","6m","12m","3y","5y","10y"]) {
        assert.ok(html.includes('<option value="'+period+'">'));
    }
    assert.ok(!html.includes("Top Calculators"));
    assert.ok(html.includes('data-ugc-sort="liked"')); // Existing catalogue sorting remains unchanged.
});

test("Creator discovery calls the private leaderboard RPC and keeps calculator sorting separate", () => {
    for (const part of [
        'get_worth_it_creator_leaderboards',
        'p_period:state.creatorPeriod',
        'p_top_sort:state.topCreatorSort',
        'p_rising_sort:state.risingCreatorSort',
        'p_member_sort:state.communityMemberSort',
        'creatorRequest',
        'renderCreatorLeaderboards(payload)',
        'CREATOR_PERIODS=["7d","30d","6m","12m","3y","5y","10y"]'
    ]) assert.ok(maker.includes(part), 'Missing creator discovery contract: '+part);
});

test("Creator leaderboard SQL ranks only public profiles and separates non-creators", () => {
    for (const part of [
        'create or replace function public.get_worth_it_creator_leaderboards(',
        "p_member_sort text default 'followers'",
        "coalesce(pref.profile_visibility,'public')='public'",
        'not exists(select 1 from public_calculators c where c.owner_user_id=p.user_id)',
        "'top_creators'",
        "'rising_creators'",
        "'community_members'",
        'revoke all on function public.get_worth_it_creator_leaderboards(text,text,text,text) from public,anon',
        'grant execute on function public.get_worth_it_creator_leaderboards(text,text,text,text) to authenticated'
    ]) assert.ok(creatorLeaderboardsSql.includes(part), 'Missing creator SQL contract: '+part);
});


test("Community Discovery places its heading on the left and back button on the right", () => {
    const headerStart=html.indexOf('<header class="ugc-discovery-page-header">');
    const headerEnd=html.indexOf("</header>",headerStart);
    assert.ok(headerStart>=0&&headerEnd>headerStart);
    const header=html.slice(headerStart,headerEnd);
    assert.ok(header.indexOf('class="ugc-discovery-page-heading"')<header.indexOf('id="ugcBackToUgcButton"'));
    assert.match(paginationCss,/grid-template-columns:minmax\(0,1fr\) auto/);
    assert.match(paginationCss,/\.ugc-discovery-back-button\s*\{[^}]*justify-self:end/s);
    assert.match(paginationCss,/\.ugc-discovery-page-header\{grid-template-columns:minmax\(0,1fr\)/);
});

test("Manual Builder footer clearly separates manual saves from AI quotas and refunds", () => {
    assert.match(html,/There is no lifetime limit on saved community calculators/);
    assert.match(html,/Free members can save 1 new manual calculator, Premium Lite 2 and Premium 3/);
    assert.match(html,/AI-generated calculators do not use it/);
    assert.match(html,/AI generation and AI improvement each have separate daily limits/);
    assert.match(html,/failed AI operations refund both the CALC and the daily AI allowance/);
    assert.match(html,/arbitrary JavaScript is never executed/);
});

test("Community Discovery is a separate slide with 100 ranked profiles and responsive scroll windows", () => {
    const communityStart = html.indexOf('id="ugcCommunitySection"');
    const discoveryStart = html.indexOf('id="ugcCommunityDiscoverySection"');
    const stageEnd = html.indexOf('id="ugcMakerModal"');
    assert.ok(communityStart >= 0 && discoveryStart > communityStart && stageEnd > discoveryStart);
    const communityPanel = html.slice(communityStart, discoveryStart);
    assert.doesNotMatch(communityPanel, /ugc-creator-discovery|ugcTopCreatorsList|ugcRisingCreatorsList|ugcCommunityMembersList/);
    assert.match(html, /id="ugcOpenDiscoveryButton"/);
    assert.match(html, /id="ugcBackToUgcButton"/);
    assert.match(maker, /"ugcCommunityDiscoverySection"/);
    assert.match(maker, /switchCalculatorExploreView\("discovery"\)/);
    assert.match(maker, /switchCalculatorExploreView\("community"\)/);
    assert.match(maker, /window\.setInterval\(refreshCreatorDiscoveryWhenVisible,60000\)/);
    assert.match(maker, /window\.addEventListener\("popstate"/);
    assert.match(paginationCss, /\.ugc-creator-list\{[\s\S]*?max-height:743px[\s\S]*?overflow-y:auto/);
    assert.match(paginationCss, /@media\(max-width:700px\)[\s\S]*?\.ugc-creator-list\{max-height:343px\}/);
    assert.equal((creatorLeaderboardsSql.match(/limit 100/gi) || []).length, 3);
    assert.match(routing, /window\.backFromWorthItProfile[\s\S]*?window\.history\.back\(\)/);
});


test("Community Discovery sits immediately to the left of Create with AI in the UGC header", () => {
    const headerStart = html.indexOf('<header class="ugc-community-header">');
    const headerEnd = html.indexOf('</header>', headerStart);
    const header = html.slice(headerStart, headerEnd);
    const primaryActions = header.slice(header.indexOf('class="ugc-community-header-primary-actions"'));
    assert.ok(primaryActions.indexOf('id="ugcOpenDiscoveryButton"') >= 0);
    assert.ok(primaryActions.indexOf('id="ugcOpenDiscoveryButton"') < primaryActions.indexOf('id="ugcCreateButton"'));
    assert.match(paginationCss, /\.ugc-community-header-primary-actions\{[\s\S]*?display:flex/);
    assert.match(paginationCss, /@media\(max-width:700px\)[\s\S]*?\.ugc-community-header-primary-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.equal((html.match(/id="ugcOpenDiscoveryButton"/g) || []).length, 1);
});


test("Community Discovery searches loaded top-100 results, preserves original ranks and supports secure member follows", () => {
    assert.ok(html.includes('id="ugcDiscoverySearch"'));
    assert.match(maker, /state\.discoverySearch/);
    assert.match(maker, /rows\.map\(\(item,index\)=>\(\{item,index\}\)\)/);
    assert.match(maker, /String\(index\+1\)/);
    assert.match(maker, /kind==="members"&&!item\.is_self/);
    assert.match(maker, /follow_worth_it_user/);
    assert.match(maker, /unfollow_worth_it_user/);
    assert.match(creatorLeaderboardsSql, /'is_self',is_self,'is_following',is_following/);
    assert.match(creatorLeaderboardsSql, /mine\.follower_user_id=v_user_id[\s\S]*?mine\.followed_user_id=p\.user_id/);
});

test("Community Discovery explains ranking formulas and allows scroll chaining from its lists to the page", () => {
    assert.match(html, /How rankings work/);
    assert.match(html, /current followers \(25%\)[\s\S]*?likes in the selected period \(20%\)/);
    assert.match(html, /Breakout combines follower growth \(55%\) and engagement \(45%\)/);
    assert.match(paginationCss, /overscroll-behavior-y:auto/);
    assert.doesNotMatch(paginationCss, /\.ugc-creator-list\{[^}]*overscroll-behavior:contain/);
    assert.match(paginationCss, /\.ugc-creator-follow-button/);
});

test("AI usage diagnostics aggregate every provider attempt without inventing unavailable token counts", () => {
    const usage=createAiUsageCollector();
    recordAiUsageAttempt(usage,{
        provider:"gemini",
        model:"gemini-test",
        stage:"initial-generation",
        success:true,
        durationMs:1200,
        inputTokens:1000,
        outputTokens:400,
        thinkingTokens:250,
        totalTokens:1650,
        cachedInputTokens:50,
        finishReason:"STOP",
        httpStatus:200
    });
    recordAiUsageAttempt(usage,{
        provider:"groq",
        model:"openai/gpt-oss-120b",
        stage:"coverage-repair",
        success:false,
        durationMs:800,
        inputTokens:null,
        outputTokens:null,
        thinkingTokens:null,
        totalTokens:null,
        cachedInputTokens:null,
        finishReason:null,
        httpStatus:503
    });
    const summary=summarizeAiUsage(usage);
    assert.equal(summary.attemptCount,2);
    assert.equal(summary.attempts[1].totalTokens,null);
    assert.equal(summary.attempts[0].uncachedInputTokens,950);
    assert.equal(summary.attempts[0].cacheHitRatePercent,5);
    assert.deepEqual(summary.totals,{
        inputTokens:1000,
        outputTokens:400,
        thinkingTokens:250,
        totalTokens:1650,
        cachedInputTokens:50,
        uncachedInputTokens:950,
        cacheHitRatePercent:5,
        requestsWithUsage:1,
        totalProviderDurationMs:2000
    });

    const partialCache=createAiUsageCollector();
    recordAiUsageAttempt(partialCache,{
        provider:"groq",
        model:"openai/gpt-oss-120b",
        stage:"initial-generation",
        success:true,
        durationMs:900,
        inputTokens:1200,
        outputTokens:600,
        thinkingTokens:300,
        totalTokens:1800,
        cachedInputTokens:null,
        finishReason:"stop",
        httpStatus:200
    });
    const partialSummary=summarizeAiUsage(partialCache);
    assert.equal(partialSummary.attempts[0].uncachedInputTokens,null);
    assert.equal(partialSummary.attempts[0].cacheHitRatePercent,null);
    assert.equal(partialSummary.totals.cachedInputTokens,null);
    assert.equal(partialSummary.totals.uncachedInputTokens,null);
    assert.equal(partialSummary.totals.cacheHitRatePercent,null);

    const unknown=summarizeAiUsage(createAiUsageCollector());
    assert.equal(unknown.attemptCount,0);
    assert.equal(unknown.totals.inputTokens,null);
    assert.equal(unknown.totals.totalTokens,null);
    assert.equal(unknown.totals.uncachedInputTokens,null);
    assert.equal(unknown.totals.cacheHitRatePercent,null);
});



test("versioned calculator schema keeps legacy v1 definitions on the unchanged validator",()=>{
 const engine=createCalculatorEngine();
 assert.deepEqual(JSON.parse(JSON.stringify(engine.resolveCalculatorVersions(validDefinition))),{schemaVersion:1,engineVersion:1,legacy:true});
 assert.deepEqual(engine.validateVersionedSpec(validDefinition),engine.validateMakerSpec(validDefinition));
 const explicitlyVersioned={...structuredClone(validDefinition),schemaVersion:1,engineVersion:1};
 assert.deepEqual(JSON.parse(JSON.stringify(engine.resolveCalculatorVersions(explicitlyVersioned))),{schemaVersion:1,engineVersion:1,legacy:false});
 assert.deepEqual(engine.validateVersionedSpec(explicitlyVersioned),engine.validateMakerSpec(explicitlyVersioned));
 const conflictingLegacyVersion={...explicitlyVersioned,version:2};
 assert.ok(engine.validateVersionedSpec(conflictingLegacyVersion).errors.some(error=>/legacy version field at 1/.test(error)));
 assert.ok(engine.resolveCalculatorVersions(validDefinition).legacy);
});

test("v2 typed schema validates boolean, enum and date inputs and typed dynamic group fields",()=>{
 const engine=createCalculatorEngine();
 const spec={
  schemaVersion:2,
  engineVersion:2,
  inputs:[
   {key:"base_cost",label:"Base cost",type:"number",min:0,max:1000,default:20,step:1,unit:"EUR",control:"number"},
   {key:"include_tax",label:"Include tax",type:"boolean",default:true,control:"toggle"},
   {key:"billing_cycle",label:"Billing cycle",type:"enum",default:"monthly",control:"select",choices:[{label:"Monthly",value:"monthly"},{label:"Annual",value:"annual"}]},
   {key:"start_date",label:"Start date",type:"date",default:"2026-11-13",control:"date",minDate:"2026-01-01",maxDate:"2027-12-31"}
  ],
  groups:[{
   key:"expenses",label:"Extra expenses",itemLabel:"Expense",minItems:1,maxItems:4,
   fields:[
    {key:"amount",label:"Amount",type:"number",min:0,max:1000,default:0,step:1,unit:"EUR"},
    {key:"taxable",label:"Taxable",type:"boolean",default:true},
    {key:"expense_type",label:"Expense type",type:"enum",default:"fixed",choices:[{label:"Fixed",value:"fixed"},{label:"Variable",value:"variable"}]},
    {key:"due_date",label:"Due date",type:"date",default:"2026-11-30"}
   ]
  }],
  results:[{key:"total_cost",label:"Total cost",expression:"base_cost + sum(expenses.amount)",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Base cost plus numeric expense rows."}],
  scenarios:[{label:"Reduced cost",values:{base_cost:15,include_tax:false,billing_cycle:"annual",start_date:"2026-12-01"}}]
 };
 assert.deepEqual(JSON.parse(JSON.stringify(engine.validateVersionedSpec(spec).errors)),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(engine.createDefaultTypedValues(spec))),{
  valid:true,
  values:{base_cost:20,include_tax:true,billing_cycle:"monthly",start_date:"2026-11-13"},
  errors:[]
 });
 const defaults=engine.createDefaultTypedGroupValues(spec);
 assert.equal(defaults.valid,true);
 assert.deepEqual(JSON.parse(JSON.stringify(defaults.groups.expenses)),[{amount:0,taxable:true,expense_type:"fixed",due_date:"2026-11-30"}]);
 const rows=engine.normalizeTypedGroupValues(spec,{expenses:[{amount:42,taxable:false,expense_type:"variable",due_date:"2026-12-15"}]});
 assert.equal(rows.valid,true);
 assert.deepEqual(JSON.parse(JSON.stringify(rows.groups.expenses)),[{amount:42,taxable:false,expense_type:"variable",due_date:"2026-12-15"}]);
});

test("v2 typed schema rejects invalid dates, enum values, mismatched versions and typed formula coercion",()=>{
 const engine=createCalculatorEngine();
 const spec={
  schemaVersion:2,engineVersion:2,
  inputs:[
   {key:"amount",label:"Amount",type:"number",min:0,max:100,default:10,step:1,unit:"EUR",control:"number"},
   {key:"enabled",label:"Enabled",type:"boolean",default:true,control:"toggle"},
   {key:"plan",label:"Plan",type:"enum",default:"basic",control:"select",choices:[{label:"Basic",value:"basic"},{label:"Pro",value:"pro"}]},
   {key:"start_date",label:"Start date",type:"date",default:"2026-11-13",control:"date"}
  ],
  groups:[],
  results:[{key:"total",label:"Total",expression:"amount",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Numeric amount."}],
  scenarios:[]
 };
 const invalidDate=structuredClone(spec);
 invalidDate.inputs[3].default="2026-02-30";
 assert.ok(engine.validateVersionedSpec(invalidDate).errors.some(error=>/real YYYY-MM-DD/.test(error)));
 const invalidEnum=structuredClone(spec);
 invalidEnum.inputs[2].default="enterprise";
 assert.ok(engine.validateVersionedSpec(invalidEnum).errors.some(error=>/enum choices must include the default/.test(error)));
 const blankEnum=structuredClone(spec);
 blankEnum.inputs[2].choices[0].value="   ";
 blankEnum.inputs[2].default="   ";
 assert.ok(engine.validateVersionedSpec(blankEnum).errors.some(error=>/non-empty string value/.test(error)));
 const mismatch=structuredClone(spec);
 mismatch.engineVersion=1;
 assert.ok(engine.validateVersionedSpec(mismatch).errors.some(error=>/version combination is not supported/.test(error)));
 const duplicateScenarios=structuredClone(spec);
 duplicateScenarios.scenarios=[{label:"Same scenario",values:{amount:20}},{label:"same scenario",values:{amount:30}}];
 assert.ok(engine.validateVersionedSpec(duplicateScenarios).errors.some(error=>/Scenario names must be unique/.test(error)));
 const unsafeChoice=structuredClone(spec);
 unsafeChoice.inputs[2].choices[0].formula="amount * 2";
 assert.ok(engine.validateVersionedSpec(unsafeChoice).errors.some(error=>/choice 1 contains unsupported properties/.test(error)));
 const numericStringScenario=structuredClone(spec);
 numericStringScenario.scenarios=[{label:"String number",values:{amount:"20"}}];
 assert.ok(engine.validateVersionedSpec(numericStringScenario).errors.some(error=>/must use a JSON number/.test(error)));
 const outOfRangeChoice=structuredClone(spec);
 outOfRangeChoice.inputs[0].control="select";
 outOfRangeChoice.inputs[0].choices=[{label:"Allowed",value:10},{label:"Outside",value:200}];
 assert.ok(engine.validateVersionedSpec(outOfRangeChoice).errors.some(error=>/outside the numeric input range/.test(error)));
 const coerced=structuredClone(spec);
 coerced.results[0].expression="amount + (enabled * 1)";
 assert.ok(engine.validateVersionedSpec(coerced).errors.length>0,"boolean values must not be silently coerced into numeric formula operands");
 assert.equal(engine.normalizeTypedValue(spec.inputs[1],"true").valid,false);
 assert.equal(engine.normalizeTypedValue(spec.inputs[2],"enterprise").valid,false);
 assert.equal(engine.normalizeTypedValue(spec.inputs[3],"2026-02-30").valid,false);
 assert.equal(engine.normalizeTypedValue(spec.inputs[3],"2026-12-01").valid,true);
});

test("v2 typed dynamic rows reject unknown fields, wrong primitive types and invalid row counts",()=>{
 const engine=createCalculatorEngine();
 const spec={
  schemaVersion:2,engineVersion:2,
  inputs:[{key:"count",label:"Count",type:"number",min:1,max:10,default:1,step:1,unit:"",control:"number"}],
  groups:[{key:"tasks",label:"Tasks",itemLabel:"Task",minItems:1,maxItems:2,fields:[
   {key:"complete",label:"Complete",type:"boolean",default:false},
   {key:"due_date",label:"Due date",type:"date",default:"2026-12-01"}
  ]}],
  results:[{label:"Task count",expression:"count",format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Number of tasks."}],
  scenarios:[]
 };
 assert.deepEqual(JSON.parse(JSON.stringify(engine.validateVersionedSpec(spec).errors)),[]);
 const wrongType=engine.normalizeTypedGroupValues(spec,{tasks:[{complete:1,due_date:"2026-12-01"}]});
 assert.equal(wrongType.valid,false);
 assert.ok(wrongType.errors.some(error=>/Choose true or false/.test(error)));
 const unknown=engine.normalizeTypedGroupValues(spec,{tasks:[{complete:false,due_date:"2026-12-01",script:"alert(1)"}]});
 assert.equal(unknown.valid,false);
 assert.ok(unknown.errors.some(error=>/unknown field: script/.test(error)));
 const tooMany=engine.normalizeTypedGroupValues(spec,{tasks:[
  {complete:false,due_date:"2026-12-01"},
  {complete:true,due_date:"2026-12-02"},
  {complete:false,due_date:"2026-12-03"}
 ]});
 assert.equal(tooMany.valid,false);
 assert.ok(tooMany.errors.some(error=>/1–2 rows/.test(error)));
 const malformedContainer=engine.normalizeTypedGroupValues(spec,[]);
 assert.equal(malformedContainer.valid,false);
 assert.ok(malformedContainer.errors.some(error=>/must be an object/.test(error)));
});

test("AI Creator server uses the shared v1 engine and accepts its expanded safe formula grammar",()=>{
 const definition=normalizeDefinition({
  title:"Capped Unit Cost",
  description:"Calculate a capped unit cost using a safe editable formula and EUR units.",
  category:"money",
  subcategories:["budgeting"],
  inputs:[{key:"unit_cost",label:"Unit cost",min:1,max:100,default:25,step:1,unit:"EUR"}],
  results:[{label:"Capped unit cost",expression:"clamp(unit_cost * 2, 0, 100)",format:"currency",currency:"EUR"}]
 },"EUR",{requireAllInputsUsed:true});
 assert.equal(definition.results[0].expression,"clamp(unit_cost * 2, 0, 100)");
});

test("AI Creator server rejects unit mismatches through the shared engine validator",()=>{
 assert.throws(()=>normalizeDefinition({
  title:"Invalid Unit Formula",
  description:"This definition intentionally combines incompatible units.",
  category:"other",
  subcategories:["general-comparison"],
  inputs:[{key:"distance",label:"Distance",min:1,max:100,default:10,step:1,unit:"km"}],
  results:[{label:"Cost",expression:"distance",format:"currency",currency:"EUR"}]
 },"EUR"),/units do not match|unit|currency/i);
});

test("shared server currency metadata loads before the browser formula engine and calculator UI",()=>{
 const currencyIndex=html.indexOf("/ugc-calculator-currency-data.js");
 const engineIndex=html.indexOf("/ugc-calculator-engine.js");
 const makerIndex=html.indexOf("/ugc-calculators.js");
 assert.ok(currencyIndex>=0&&engineIndex>currencyIndex&&makerIndex>engineIndex);
 assert.ok(makerApi.includes('import "../../ugc-calculator-engine.js";'));
 assert.ok(makerApi.includes("SERVER_CALCULATOR_ENGINE.validateMakerSpec(spec)"));
 assert.doesNotMatch(makerApi,/function compileExpression\(/);
 assert.doesNotMatch(makerApi,/function evaluate\(/);
});



test("AI Creator normalizes dynamic groups, chained results, typed numeric controls and comparison scenarios with the shared engine",()=>{
 const definition=normalizeDefinition({
  title:"Household Expense Calculator",
  description:"Calculate a household purchase total and analyse additional expenses across a simple comparison scenario.",
  category:"home",
  subcategories:["household-budget"],
  inputs:[
   {key:"base_cost",label:"Base cost",min:0,max:1000000,default:30,step:1,unit:"EUR",control:"number",choices:[]},
   {key:"include_tax",label:"Include tax",min:0,max:1,default:1,step:1,unit:"",control:"toggle",choices:[]},
   {key:"tax_rate",label:"Tax rate",min:0,max:100,default:20,step:1,unit:"%",control:"slider",choices:[]},
   {key:"billing_cycle",label:"Billing cycle",min:1,max:12,default:1,step:1,unit:"",control:"select",choices:[{label:"Standard cycle",value:1},{label:"Extended cycle",value:12}]}
  ],
  groups:[{
   key:"expenses",label:"Extra expenses",itemLabel:"Item",minItems:2,maxItems:10,
   fields:[{key:"amount",label:"Amount",min:0,max:1000000,default:0,step:1,unit:"EUR"}]
  }],
  results:[
   {key:"extra_total",label:"Extra expenses total",expression:"sum(expenses.amount)",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Total of all added expense rows."},
   {key:"subtotal",label:"Subtotal",expression:"base_cost + extra_total",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Base cost plus additional expenses."},
   {key:"final_total",label:"Final total",expression:"subtotal + if(include_tax, subtotal * tax_rate / 100, 0)",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Subtotal plus optional tax."},
   {key:"annualized_total",label:"Annualized total",expression:"final_total * billing_cycle",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Final total multiplied by the selected billing periods."}
  ],
  scenarios:[{label:"Lower cost",overrides:[{key:"base_cost",value:20},{key:"include_tax",value:0}]}]
 },"EUR",{requireAllInputsUsed:true});
 assert.equal(definition.groups[0].key,"expenses");
 assert.equal(definition.groups[0].fields[0].unit,"EUR");
 assert.equal(definition.inputs.find(item=>item.key==="include_tax").control,"toggle");
 assert.equal(definition.inputs.find(item=>item.key==="billing_cycle").choices.length,2);
 assert.deepEqual(definition.results.map(item=>item.key),["extra_total","subtotal","final_total","annualized_total"]);
 assert.equal(definition.results[2].expression,"subtotal + if(include_tax, subtotal * tax_rate / 100, 0)");
 assert.deepEqual(definition.scenarios[0].values,{base_cost:20,include_tax:0});
});



test("AI Creator API returns dynamic groups, result chains, percentage rates, dropdowns and scenarios",async()=>{
 const candidate={
  title:"Household Expense Calculator",
  description:"Calculate a household purchase total, add repeated expenses, optionally include tax and compare a lower-cost scenario.",
  classification:{category:"home",subcategories:["household-budget"]},
  inputs:[
   {key:"base_cost",label:"Base cost",min:0,max:1000000,default:30,step:1,unit:"EUR",control:"number",choices:[]},
   {key:"include_tax",label:"Include tax",min:0,max:1,default:1,step:1,unit:"",control:"toggle",choices:[]},
   {key:"tax_rate",label:"Tax rate",min:0,max:100,default:20,step:1,unit:"%",control:"slider",choices:[]},
   {key:"billing_cycle",label:"Billing periods per year",min:1,max:12,default:12,step:1,unit:"",control:"select",choices:[{label:"Monthly",value:1},{label:"Annual",value:12}]}
  ],
  groups:[{
   key:"expenses",label:"Extra expenses",itemLabel:"Item",minItems:1,maxItems:10,
   fields:[{key:"amount",label:"Expense amount",min:0,max:1000000,default:0,step:1,unit:"EUR"}]
  }],
  results:[
   {key:"extra_total",label:"Extra expenses total",expression:"sum(expenses.amount)",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Total of the added expense rows."},
   {key:"subtotal",label:"Subtotal",expression:"base_cost + extra_total",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Base cost plus additional expenses."},
   {key:"final_total",label:"Final total",expression:"subtotal + if(include_tax, subtotal * tax_rate / 100, 0)",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Subtotal plus optional tax."},
   {key:"annualized_total",label:"Annualized total",expression:"final_total * billing_cycle",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Final total multiplied by the selected billing period count."}
  ],
  scenarios:[{label:"Lower cost",overrides:[{key:"base_cost",value:20},{key:"include_tax",value:0}]}]
 };
 let providerCalls=0;
 const quotaEvents={settlements:0};
 await withFetch(async(url,options)=>{
  const path=String(url);
  if(path.endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
  if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_operation"))return new Response(JSON.stringify({ok:true,requests_used:1,daily_limit:1}),{status:200});
  if(path.includes("api.groq.com/openai/v1/chat/completions")){
   providerCalls++;
   const body=JSON.parse(options.body);
   const schema=body.response_format.json_schema.schema;
   assert.equal(schema.properties.groups.maxItems,4);
   assert.equal(schema.properties.results.maxItems,20);
   assert.equal(schema.properties.scenarios.maxItems,3);
   assert.match(body.messages[0].content,/sum\(group_key\.field_key\)/);
   assert.match(body.messages[0].content,/comparison scenario/);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(candidate)}}]}),{status:200});
  }
  throw new Error("Unexpected AI Creator API request: "+path);
 },async()=>{
  const response=await onRequestPost({
   request:request({prompt:"Create a household expense calculator with a base cost of 30 EUR, extra expense rows, an optional tax toggle, a 20 percent tax rate, a billing-cycle choice and a lower-cost scenario."},{token:"valid-token"}),
   env:{SUPABASE_URL:"https://supabase.example",SUPABASE_PUBLISHABLE_KEY:"publishable",GROQ_API_KEY:"groq-test"}
  });
  const responseBody=await response.clone().json();
  assert.equal(response.status,200,JSON.stringify(responseBody));
  assert.equal(responseBody.success,true);
  const spec=responseBody.calculator.spec;
  assert.equal(spec.groups[0].key,"expenses");
  assert.equal(spec.groups[0].fields[0].unit,"EUR");
  assert.equal(spec.inputs.find(item=>item.key==="include_tax").control,"toggle");
  assert.equal(spec.inputs.find(item=>item.key==="tax_rate").unit,"%");
  assert.equal(spec.inputs.find(item=>item.key==="tax_rate").default,20);
  assert.equal(spec.inputs.find(item=>item.key==="billing_cycle").choices.length,2);
  assert.deepEqual(spec.results.map(item=>item.key),["extra_total","subtotal","final_total","annualized_total"]);
  assert.equal(spec.results[2].expression,"subtotal + if(include_tax, subtotal * tax_rate / 100, 0)");
  assert.deepEqual(spec.scenarios[0].values,{base_cost:20,include_tax:0});
  assert.equal(providerCalls,1);
  assert.equal(quotaEvents.settlements,1);
 },quotaEvents);
});
