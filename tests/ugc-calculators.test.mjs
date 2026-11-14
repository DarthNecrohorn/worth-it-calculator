import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { onRequestGet, onRequestPost, resolveExplicitCurrency, resolveExplicitCurrencies, resolvePromptCountry, resolveRegionalDefaults, createAiUsageCollector, recordAiUsageAttempt, summarizeAiUsage, summarizeAiCandidateForDiagnostics, normalizeDefinition } from "../functions/api/ugc-maker.js";
import { validateCalculatorForServer } from "../functions/lib/ugc-calculator-validation.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const style = read("style.css");
const routing = read("routing.js");
const guest = read("guest-mode.js");
const maker = read("ugc-calculators.js");
const calculatorEngineSource = read("ugc-calculator-engine.js");
const makerApi = read("functions/api/ugc-maker.js");
const profileAvatarApi = read("functions/api/profile-avatar.js");
const profile = read("profile-ui.js");
const chat = read("chat-ui.js");
const community = read("community-features.js");
const economy = read("calc-economy.js");
const calcEconomySource = economy;
const sql = read("supabase/worth-it-ugc-badges.sql");
const makerQuotaSql = read("supabase/worth-it-ugc-maker-generation-refunds.sql");
const ugcAiDisableSql = read("supabase/worth-it-ugc-ai-creator-disable.sql");
const manualBuilderSql = read("supabase/worth-it-ugc-manual-builder-ai-costs.sql");
const composableBuilderSql = read("supabase/worth-it-ugc-composable-builder.sql");
const v2DatabaseValidatorSql = read("supabase/worth-it-ugc-v2-database-validator.sql");
const v2PersistenceSql = read("supabase/worth-it-ugc-v2-persistence.sql");
const v2RuntimeSql = read("supabase/worth-it-ugc-v2-server-runtime.sql");
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
test("shared unit registry keeps aliases, compound units and derived energy dimensions consistent",()=>{
 const engine=createCalculatorEngine();
 const vectors=[
  ["",{}],["1",{}],["%",{}],["EUR",{"currency:EUR":1}],["USD",{"currency:USD":1}],["RSD",{"currency:RSD":1}],
  ["%/year",{time:-1}],["%/month",{time:-1}],["%/day",{time:-1}],
  ["day",{time:1}],["days",{time:1}],["week",{time:1}],["weeks",{time:1}],["month",{time:1}],["months",{time:1}],
  ["hour",{time:1}],["hours",{time:1}],["hr",{time:1}],["hrs",{time:1}],["h",{time:1}],["minute",{time:1}],["minutes",{time:1}],["second",{time:1}],["seconds",{time:1}],["s",{time:1}],
  ["km",{length:1}],["kilometres",{length:1}],["kilometers",{length:1}],["mile",{length:1}],["miles",{length:1}],["m",{length:1}],["cm",{length:1}],["mm",{length:1}],
  ["m²",{area:1}],["m2",{area:1}],["ft²",{area:1}],["l",{volume:1}],["litres",{volume:1}],["liters",{volume:1}],["m³",{volume:1}],["m3",{volume:1}],["ml",{volume:1}],
  ["kg",{mass:1}],["kilograms",{mass:1}],["g",{mass:1}],["grams",{mass:1}],["tonnes",{mass:1}],
  ["b",{data:1}],["kb",{data:1}],["mb",{data:1}],["gb",{data:1}],["tb",{data:1}],["pb",{data:1}],
  ["Wh",{energy:1}],["kWh",{energy:1}],["MWh",{energy:1}],["MJ",{energy:1}],["W",{power:1}],["kW",{power:1}],
  ["token",{token:1}],["tokens",{token:1}],["items",{count:1}],["vehicles",{count:1}],["period",{}],
  ["l/100 km",{volume:1,length:-1}],["km/h",{length:1,time:-1}],["m/s",{length:1,time:-1}],
  ["m²/pack",{area:1,count:-1}],["kWh/day",{energy:1,time:-1}],["kWh/month",{energy:1,time:-1}],
  ["EUR/kWh",{"currency:EUR":1,energy:-1}],["USD/l",{"currency:USD":1,volume:-1}],["RSD/kg",{"currency:RSD":1,mass:-1}],
  ["USD/hour",{"currency:USD":1,time:-1}],["EUR/person/day",{"currency:EUR":1,count:-1,time:-1}],["USD/token",{"currency:USD":1,token:-1}],
  ["GB/hour",{data:1,time:-1}],["widgets/hour",{"unit:widgets":1,time:-1}],["widgets",{"unit:widgets":1}]
 ];
 for(const [unit,expected] of vectors){
  assert.deepEqual(JSON.parse(JSON.stringify(engine.unitDescriptor(unit).vector)),expected,"unit "+unit);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(engine.unitDescriptor("kW*hour").vector)),{energy:1});
 assert.deepEqual(JSON.parse(JSON.stringify(engine.unitDescriptor("W*hours").vector)),{energy:1});
 const wattHour=engine.combineUnitDescriptors(engine.unitDescriptor("W"),engine.unitDescriptor("hour"),1);
 const kilowattHour=engine.combineUnitDescriptors(engine.unitDescriptor("kW"),engine.unitDescriptor("hour"),1);
 assert.equal(engine.sameUnitDescriptor(engine.unitDescriptor("Wh"),wattHour),true);
 assert.equal(engine.sameUnitDescriptor(engine.unitDescriptor("kWh"),kilowattHour),true);
});

test("v2 formulas validate derived energy, compound rate and opaque unit expressions",()=>{
 const engine=createCalculatorEngine();
 const spec={
  schemaVersion:2,engineVersion:2,
  inputs:[
   {key:"power",label:"Power",type:"number",min:0,max:20,default:2,step:1,unit:"kW",control:"number"},
   {key:"duration",label:"Duration",type:"number",min:0,max:20,default:3,step:1,unit:"hours",control:"number"},
   {key:"storage",label:"Storage",type:"number",min:0,max:100,default:12,step:1,unit:"GB",control:"number"},
   {key:"elapsed",label:"Elapsed",type:"number",min:1,max:20,default:2,step:1,unit:"hour",control:"number"},
   {key:"distance",label:"Distance",type:"number",min:0,max:100,default:10,step:1,unit:"km",control:"number"},
   {key:"widgets",label:"Widgets",type:"number",min:1,max:20,default:4,step:1,unit:"widgets",control:"number"}
  ],
  groups:[],
  results:[
   {key:"energy",label:"Energy",expression:"power * duration",format:"unit",currency:"EUR",unit:"kWh",prefix:"",suffix:"",explanation:"Power multiplied by hours."},
   {key:"storage_rate",label:"Storage rate",expression:"storage / elapsed",format:"unit",currency:"EUR",unit:"GB/hour",prefix:"",suffix:"",explanation:"Storage per elapsed hour."},
   {key:"velocity",label:"Velocity",expression:"distance / elapsed",format:"unit",currency:"EUR",unit:"km/hour",prefix:"",suffix:"",explanation:"Distance per elapsed hour."},
   {key:"widget_rate",label:"Widget rate",expression:"widgets / elapsed",format:"unit",currency:"EUR",unit:"widgets/hour",prefix:"",suffix:"",explanation:"Opaque widget unit per hour."}
  ],
  scenarios:[]
 };
 assert.deepEqual(JSON.parse(JSON.stringify(engine.validateVersionedSpec(spec).errors)),[]);
 const result=engine.evaluateV2TypedResults(spec,{},{});
 assert.deepEqual(JSON.parse(JSON.stringify(result.results.map(item=>item.value))),[6,6,5,2]);
});

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
    assert.doesNotMatch(html, /ugcMakerBillingNotice|Limited AI capacity|ugcMakerPrompt|ugcMakerGenerate/);
    assert.doesNotMatch(maker, /generateWithAI|refreshMakerGenerationQuota|refreshAiEditQuota/);
    assert.match(html, /Manual Builder uses no AI and costs no CALC/);
    assert.match(html, /Manual Builder uses no AI and costs no CALC/);
    assert.match(maker, /24–500 characters/);
});

test("Manual Builder can be closed only with its X button; backdrop clicks never dismiss it", () => {
    assert.ok(maker.includes('$("ugcMakerClose")?.addEventListener("click",closeMaker);'), "the X button is wired to close the maker");
    assert.ok(!maker.includes('addEventListener("click",event=>{\n  const shouldClose='), "there is no backdrop click-to-close handler");
    assert.ok(!maker.includes('makerBackdropPointerDown'), "there is no pointer-based backdrop dismissal");
    assert.ok(!maker.includes('$("ugcMakerOverlay")?.addEventListener("click"'), "clicking the calculator card never dismisses the maker");
});

test("Manual Builder test mode recalculates locally with the restricted formula engine and never charges CALC", () => {
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
    const localTestCode = maker.slice(maker.indexOf("function refreshMakerTestIfOpen"), maker.indexOf("function describeResultFormula"));
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
        "ugcCommunitySection", "ugcCalculatorGrid", "ugcCreateManualButton", "ugcMakerModal",
        "ugcMakerPreview", "ugcMakerQuotaStatus", "ugcDetailSection", "ugcDetailKicker", "ugcDetailCalculatorForm",
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
    assert.ok(maker.includes("Calculator categories"));
    assert.ok(html.includes("New manual calculator saves are limited per UTC day: Free 1, Premium Lite 2 and Premium 3."));
    assert.ok(maker.includes("get_worth_it_ugc_catalog_page"));
    assert.ok(maker.includes("p_sort:state.sort"));
    assert.ok(maker.includes("p_category:state.category"));
    assert.ok(maker.includes("p_page:currentCatalogPage()"));
    assert.ok(maker.includes("get_worth_it_ugc_creation_quota"));
    assert.ok(maker.includes("switchCalculatorExploreView"));
    assert.ok(html.includes("ugcBackToBasicButton"));
    assert.doesNotMatch(html,/Limited AI capacity|Create with AI|ugcCreateButton|ugcMakerPrompt|ugcMakerGenerate|ugcMakerTargetSchemaVersion/);
    assert.match(html,/id="aiChatNavBtn"/);
    assert.match(html,/id="aiChatOverlay"/);
    assert.match(html,/ai-ui\.js/);
    assert.match(html,/data-theme-preview-view="chat"[^>]*>Community Chat/,"theme preview keeps a Community Chat sample");
    assert.ok(maker.includes("update_worth_it_ugc_calculator_description"));
    assert.doesNotMatch(maker,/get_worth_it_ugc_ai_edit_quota|refreshMakerGenerationQuota/);
    assert.ok(sqlEnhancements.includes("get_worth_it_my_favorite_ugc_calculators"));
    assert.match(profile,/get_worth_it_own_profile/);
    assert.match(profile,/select\("worth_it_id,username,display_name,avatar_url,banner_url,created_at"\)/);
    assert.match(profile,/window\.openWorthItOwnProfileConnections=/);
});

test("UGC enhancement migration enforces private favourites, description cooldown and safe calculator updates", () => {
    assert.match(sqlEnhancements,/where f\.user_id=v_user_id/);
    assert.match(sqlEnhancements,/update_worth_it_ugc_calculator_description/);
    assert.match(sqlEnhancements,/interval '10 minutes'/);
    assert.match(sqlEnhancements,/private\.worth_it_guard_ugc_calculator_update/);
});

test("Subscriptions show only the manual community-calculator save quotas without selling Free", () => {
    const start = html.indexOf('<section id="webShopSubscriptionsPanel"');
    const end = html.indexOf("</section>", start);
    const panel = html.slice(start, end);
    const freeStart = panel.indexOf('class="web-shop-card web-shop-card-free"');
    const liteStart = panel.indexOf('class="web-shop-card web-shop-card-featured"');
    const premiumStart = panel.indexOf('<h4>Premium</h4>');
    const freeCard = panel.slice(freeStart, liteStart);
    assert.ok(freeStart >= 0 && liteStart > freeStart && premiumStart > liteStart);
    assert.match(freeCard, /1 new manually created \(non-AI\) UGC calculator saved per UTC day/);
    assert.match(panel, /2 new manually created \(non-AI\) UGC calculators saved per UTC day/);
    assert.match(panel, /3 new manually created \(non-AI\) UGC calculators saved per UTC day/);
    assert.doesNotMatch(panel, /AI-generated UGC calculator|AI improvement to an existing UGC calculator|Version [12] AI generation|AI generation or improvement costs|AI improvements per UTC day/i);
    assert.doesNotMatch(freeCard, /<button\b/i, "Free is informational and cannot be purchased");
});

test("Manual UGC Builder remains independent of AI and keeps separate daily save limits", () => {
    assert.match(html, /id="ugcCreateManualButton"/);
    assert.doesNotMatch(html, /id="ugcCreateButton"|Create with AI|ugcMakerPrompt|ugcMakerGenerate|ugcMakerTargetSchemaVersion|ugcManualAiImproveButton/);
    assert.match(html, /id="ugcManualMode"/);
    assert.match(html, /id="ugcManualTemplate"/);
    assert.match(html, /id="ugcBlueprintImportPanel"/);
    assert.match(html, /id="ugcMakerVisibilityWrap"/);
    assert.match(maker, /const MANUAL_TEMPLATES=/);
    assert.match(maker, /creationSource:"manual"/);
    assert.match(maker, /function editCalculatorManually/);
    assert.match(maker, /p_source:"manual"/);
    assert.match(maker, /p_ai_request_id:null/);
    assert.doesNotMatch(maker, /generateWithAI|switchManualDraftToAI|Improve with AI|Create with AI/);
    assert.match(manualBuilderSql, /private\.worth_it_ugc_manual_daily_usage/);
    assert.match(manualBuilderSql, /get_worth_it_ugc_creation_quota/);
    assert.match(manualBuilderSql, /manual_non_ai_saves/);
    assert.match(manualBuilderSql, /when 'premium' then 3 when 'premium_lite' then 2 else 1 end/);
    assert.match(ugcAiDisableSql, /revoke all on function public\.reserve_worth_it_ugc_ai_operation\(uuid, text, uuid, integer\) from public, anon, authenticated/i);
    assert.match(ugcAiDisableSql, /revoke all on function public\.reserve_worth_it_ugc_maker_generation_v2\(uuid\) from public, anon, authenticated/i);
});

test("internal Gemini profile image and banner moderation stays independent of user CALC billing", () => {
    const start=profileAvatarApi.indexOf("async function moderateAsset(");
    const end=profileAvatarApi.indexOf("\nfunction userFriendlyError",start);
    assert.ok(start>=0 && end>start,"server-side profile asset moderation exists");
    const moderation=profileAvatarApi.slice(start,end);
    assert.match(moderation,/generativelanguage\.googleapis\.com\/v1beta\/models/);
    assert.match(moderation,/You are a strict safety moderator/);
    assert.match(moderation,/decision must be 'allow' or 'reject'/);
    assert.match(html,/Images and GIF frames are sent to Google Gemini for automated safety screening/);
    assert.match(html,/Banners receive the same automatic safety checks as profile pictures/);
    assert.doesNotMatch(moderation,/calc_wallet_|ugc_ai_operation|ugc_maker_generation|reserve_worth_it_ugc/);
});

test("UGC calculator cards show verified original creation source", () => {
    const basicStart=html.indexOf('<section class="section calculator-explore-panel" id="calculators">');
    const communityNav=html.indexOf('id="ugcNavigationActions"',basicStart);
    const basicEnd=html.indexOf("</section>",basicStart);
    const basicPanel=html.slice(basicStart,basicEnd);
    assert.ok(basicStart>=0 && communityNav>basicStart);
    assert.match(basicPanel,/id="ugcCatalogJumpButton"[^>]*>🌐 Community calculators/);
    assert.doesNotMatch(basicPanel,/Create with AI|ugcMakerJumpButton/);
    assert.match(html,/id="ugcCreateManualButton"[^>]*>＋ Create manually/);
    assert.doesNotMatch(html,/id="ugcCreateButton"|Create with AI/);
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
    assert.match(paginationFixture,/A Manual Builder save has incorrect provenance/);
    assert.match(paginationFixture,/database accepted a new AI-sourced UGC calculator/);
    assert.match(manualBuilderSql,/creation_source in \('manual','ai','legacy'\)/);
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


test("Manual Builder converts compatible V1 drafts to typed V2 and preserves safe local-only behavior",()=>{
 const start=maker.indexOf("function cloneCalculatorData(value){");
 const end=maker.indexOf("function changeManualSchemaVersion(definition,version){",start);
 assert.ok(start>=0&&end>start,"The isolated V2 conversion helpers must be present.");
 const sandbox={};
 runInNewContext(maker.slice(start,end)+"\nglobalThis.convertManualDraftToV2=convertManualDraftToV2;",sandbox);
 const converted=sandbox.convertManualDraftToV2({
  title:"Typed migration test",
  description:"A test definition converted from the current numeric manual schema.",
  category:"money",
  spec:{
   inputs:[
    {key:"amount",label:"Amount",min:0,max:1000,default:50,step:1,unit:"EUR",control:"number"},
    {key:"enabled",label:"Enabled",min:0,max:1,default:1,step:1,unit:"",control:"toggle"},
    {key:"tier",label:"Tier",min:1,max:3,default:2,step:1,unit:"",control:"select",choices:[{label:"Basic",value:1},{label:"Pro",value:2},{label:"Team",value:3}]}
   ],
   groups:[{key:"expenses",label:"Expenses",itemLabel:"Expense",minItems:1,maxItems:3,fields:[
    {key:"cost",label:"Cost",min:0,max:1000,default:10,step:1,unit:"EUR"}
   ]}],
   results:[{key:"total",label:"Total",expression:"if(enabled, amount, 0)+sum(expenses.cost)",format:"currency",currency:"EUR",unit:""}],
   scenarios:[{label:"Disabled",values:{amount:20,enabled:0,tier:1}}],
   assumptions:["Test assumption"],subcategories:["household-budget"]
  }
 });
 assert.equal(converted.spec.schemaVersion,2);
 assert.equal(converted.spec.engineVersion,2);
 assert.deepEqual(JSON.parse(JSON.stringify(converted.spec.inputs.map(item=>item.type))),["number","boolean","number"]);
 assert.equal(converted.spec.inputs[1].default,true);
 assert.equal("min" in converted.spec.inputs[1],false);
 assert.deepEqual(JSON.parse(JSON.stringify(converted.spec.inputs[2].choices)),[{label:"Basic",value:1},{label:"Pro",value:2},{label:"Team",value:3}]);
 assert.equal(converted.spec.groups[0].fields[0].type,"number");
 assert.equal(converted.spec.scenarios[0].values.enabled,false);
 const engine=createCalculatorEngine();
 const executionSpec=JSON.parse(JSON.stringify(converted.spec));
 delete executionSpec.assumptions;delete executionSpec.subcategories;
 assert.deepEqual(JSON.parse(JSON.stringify(engine.validateVersionedSpec(executionSpec).errors)),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(converted.spec.assumptions)),["Test assumption"]);
 assert.deepEqual(JSON.parse(JSON.stringify(converted.spec.subcategories)),["household-budget"]);
 const evaluated=engine.evaluateV2TypedResults(executionSpec,{},{expenses:[{cost:15}]});
 assert.equal(evaluated.results[0].value,65);
 const saveStart=maker.indexOf("async function saveMakerDraft(publish){");
 const saveGate=maker.indexOf("if(typedV2&&state.v2PersistenceAvailable!==true)",saveStart);
 const rpc=maker.indexOf('sb().rpc("save_worth_it_ugc_calculator"',saveStart);
 assert.ok(saveGate>=0&&rpc>saveGate,"The database capability gate must run before the V2 persistence RPC.");
 assert.match(maker,/function renderManualV2InputEditor/);
 assert.match(maker,/function renderManualV2GroupEditor/);
 assert.match(maker,/function renderManualV2ScenarioEditor/);
 assert.match(maker,/function renderManualV2ResultEditor/);
 assert.match(maker,/function updateMakerV2TestResults/);
 assert.match(maker,/evaluateV2TypedResults\(spec,values,normalizedGroups\.groups\)/);
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
    assert.match(makerApi, /AI_UGC_CREATOR_DISABLED/);
    assert.match(makerApi, /AI generation and AI improvement for community calculators have been removed/);
    assert.doesNotMatch(makerApi, /export async function onRequestPost\(context\)\s*\{[^}]*generateWithGemini/s);
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
    assert.match(maker, /Currency consistency warning/);
    assert.match(calculatorEngineSource, /function analyseFormulaUnit/);
    assert.match(calculatorEngineSource, /Addition and subtraction require matching units/);
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

test("Manual Builder footer clearly explains its daily manual save limits", () => {
    assert.match(html,/There is no lifetime limit on saved community calculators/);
    assert.match(html,/New manual calculator saves are limited per UTC day: Free 1, Premium Lite 2 and Premium 3/);
    assert.match(html,/editing an existing calculator does not consume another new-save slot/i);
    assert.doesNotMatch(html,/AI-generated calculators do not use it|AI generation and AI improvement each have separate daily limits|Version [12] AI generation or improvement costs|Failed AI operations refund/i);
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


test("Community Discovery sits immediately to the left of Create manually in the UGC header", () => {
    const headerStart = html.indexOf('<header class="ugc-community-header">');
    const headerEnd = html.indexOf('</header>', headerStart);
    const header = html.slice(headerStart, headerEnd);
    const primaryActions = header.slice(header.indexOf('class="ugc-community-header-primary-actions"'));
    assert.ok(primaryActions.indexOf('id="ugcOpenDiscoveryButton"') >= 0);
    assert.ok(primaryActions.indexOf('id="ugcOpenDiscoveryButton"') < primaryActions.indexOf('id="ugcCreateManualButton"'));
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

test("PostgreSQL V2 unit descriptor and migration mirror the shared engine unit registry",()=>{
 assert.match(v2DatabaseValidatorSql,/worth_it_v2_unit_descriptor/);
 assert.match(v2DatabaseValidatorSql,/worth_it_v2_normalize_energy/);
 assert.match(v2DatabaseValidatorSql,/unit_symbols/);
 assert.match(read("tests/fixtures/ugc-v2-database-validator-postgres-smoke.sql"),/v2_unit_registry_smoke/);
 assert.match(read("tests/fixtures/ugc-v2-database-validator-postgres-smoke.sql"),/v2_derived_unit_formula_smoke/);
 assert.match(v2DatabaseValidatorSql,/revoke all on function private\.worth_it_v2_unit_descriptor\(text\) from public,anon,authenticated,service_role/i);
});

test("private PostgreSQL V2 validator is separate from the still-blocked persistence version gate",()=>{
 assert.match(v2DatabaseValidatorSql,/create or replace function private\.worth_it_validate_ugc_v2_spec/);
 assert.match(v2DatabaseValidatorSql,/worth_it_v2_parse_expression/);
 assert.match(v2DatabaseValidatorSql,/revoke all on function private\.worth_it_validate_ugc_v2_spec\(jsonb\) from public,anon,authenticated,service_role/i);
 assert.match(v2DatabaseValidatorSql,/sum_if/);
 assert.match(v2DatabaseValidatorSql,/count_if/);
 assert.match(v2DatabaseValidatorSql,/calendar dates/i);
 assert.match(read("supabase/worth-it-ugc-version-gate.sql"),/Only calculator schema 1 \/ engine 1 can currently be saved or published/);
 assert.match(workflow,/ugc-v2-database-validator-postgres-smoke\.sql/);
});

test("server calculator adapter validates V1 unchanged and evaluates V2 defaults through the shared engine",()=>{
 const engine=createCalculatorEngine();
 const v1={
  version:1,
  inputs:[{key:"amount",label:"Amount",min:0,max:100,default:10,step:1,unit:"",control:"number"}],
  groups:[],
  results:[{key:"double",label:"Double amount",expression:"amount*2",format:"number"}],
  scenarios:[]
 };
 const v1Result=validateCalculatorForServer(engine,v1);
 assert.equal(v1Result.valid,true);
 assert.deepEqual(JSON.parse(JSON.stringify(v1Result.versions)),{schemaVersion:1,engineVersion:1,legacy:true});
 assert.equal(v1Result.defaultEvaluation,null);

 const v2={
  schemaVersion:2,
  engineVersion:2,
  inputs:[
   {key:"quantity",label:"Quantity",type:"number",min:0,max:20,default:2,step:1,unit:"",control:"number"},
   {key:"include",label:"Include",type:"boolean",default:true,control:"toggle"}
  ],
  groups:[],
  results:[{key:"total",label:"Total",expression:"if(include, quantity*3, 0)",format:"number"}],
  scenarios:[]
 };
 const v2Result=validateCalculatorForServer(engine,v2);
 assert.equal(v2Result.valid,true,JSON.stringify(v2Result.errors));
 assert.equal(v2Result.defaultEvaluation.results[0].value,6);

 const overflowingDate={
  schemaVersion:2,
  engineVersion:2,
  inputs:[
   {key:"start_date",label:"Start date",type:"date",default:"9999-12-31",control:"date"},
   {key:"offset",label:"Offset",type:"number",min:0,max:2,default:1,step:1,unit:"day",control:"number"}
  ],
  groups:[],
  results:[{label:"Calendar year",expression:"calendar_year(add_days(start_date, offset))",format:"number"}],
  scenarios:[]
 };
 const rejected=validateCalculatorForServer(engine,overflowingDate);
 assert.equal(rejected.valid,false);
 assert.ok(rejected.errors.some(error=>/outside the supported calendar range/i.test(error)));
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


test("v2 typed formulas evaluate boolean logic, enum comparisons, date operations and typed group aggregates",()=>{
 const engine=createCalculatorEngine();
 const spec={
  schemaVersion:2,engineVersion:2,
  inputs:[
   {key:"base_cost",label:"Base cost",type:"number",min:0,max:10000,default:100,step:1,unit:"EUR",control:"number"},
   {key:"include_tax",label:"Include tax",type:"boolean",default:true,control:"toggle"},
   {key:"tax_rate",label:"Tax rate",type:"number",min:0,max:100,default:20,step:1,unit:"%",control:"number"},
   {key:"plan",label:"Plan",type:"enum",default:"pro",control:"select",choices:[{label:"Basic",value:"basic"},{label:"Pro",value:"pro"}]},
   {key:"start_date",label:"Start date",type:"date",default:"2026-01-31",control:"date"},
   {key:"day_offset",label:"Day offset",type:"number",min:0,max:365,default:7,step:1,unit:"day",control:"number"},
   {key:"month_offset",label:"Month offset",type:"number",min:0,max:24,default:1,step:1,unit:"months",control:"number"}
  ],
  groups:[{
   key:"expenses",label:"Expenses",itemLabel:"Expense",minItems:1,maxItems:6,
   fields:[
    {key:"amount",label:"Amount",type:"number",min:0,max:1000,default:0,step:1,unit:"EUR"},
    {key:"taxable",label:"Taxable",type:"boolean",default:true},
    {key:"kind",label:"Kind",type:"enum",default:"fixed",choices:[{label:"Fixed",value:"fixed"},{label:"Variable",value:"variable"}]},
    {key:"due_date",label:"Due date",type:"date",default:"2026-02-15"}
   ]
  }],
  results:[
   {key:"eligible_expenses",label:"Eligible expenses",expression:"sum_if(expenses.amount, and(expenses.taxable, eq(expenses.kind, \"fixed\")))",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Taxable fixed expenses."},
   {key:"eligible_count",label:"Eligible expense count",expression:"count_if(and(expenses.taxable, eq(expenses.kind, \"fixed\")))",format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Count of taxable fixed expenses."},
   {key:"tax_amount",label:"Tax amount",expression:"if(and(include_tax, eq(plan, \"pro\")), base_cost * tax_rate / 100, 0)",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Tax is applied only when enabled for the selected plan."},
   {key:"final_total",label:"Final total",expression:"base_cost + eligible_expenses + tax_amount",format:"currency",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Base cost plus eligible expenses and tax."},
   {key:"days_to_next_month",label:"Days to next month",expression:"date_diff_days(start_date, add_months(start_date, 1))",format:"unit",currency:"EUR",unit:"days",prefix:"",suffix:"",explanation:"Calendar days until the same day next month, clamped at month end."},
   {key:"custom_day_span",label:"Custom day span",expression:"date_diff_days(start_date, add_days(start_date, day_offset))",format:"unit",currency:"EUR",unit:"days",prefix:"",suffix:"",explanation:"Date difference using a typed whole-day offset."},
   {key:"custom_month_span",label:"Custom month span",expression:"date_diff_days(start_date, add_months(start_date, month_offset))",format:"unit",currency:"EUR",unit:"days",prefix:"",suffix:"",explanation:"Date difference using a typed whole-month offset."},
   {key:"next_month_days",label:"Days in next month",expression:"days_in_month(add_months(start_date, 1))",format:"unit",currency:"EUR",unit:"days",prefix:"",suffix:"",explanation:"Calendar length of the next month."},
   {key:"next_date_year",label:"Next date year",expression:"calendar_year(add_days(start_date, 1))",format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Calendar year after one day."},
   {key:"start_weekday",label:"Start weekday",expression:"weekday(start_date)",format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"ISO weekday number, Monday 1 through Sunday 7."},
   {key:"plan_gate",label:"Pro plan selected",expression:"if(eq(plan, \"pro\"), 1, 0)",format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"A typed enum equality check."},
   {key:"due_after_cutoff",label:"Expenses due after cutoff",expression:"count_if(gt(expenses.due_date, \"2026-02-15\"))",format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Count of group rows after the given date."},
   {key:"date_gate",label:"Next month-end reached",expression:"if(gte(add_months(start_date, 1), \"2026-02-28\"), 1, 0)",format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"A typed date comparison."}
  ],
  scenarios:[{label:"Leap-year case",values:{start_date:"2024-01-31",include_tax:false,plan:"basic"}}]
 };
 assert.deepEqual(JSON.parse(JSON.stringify(engine.validateVersionedSpec(spec).errors)),[]);
 const evaluated=engine.evaluateV2TypedResults(spec,{},{
  expenses:[
   {amount:20,taxable:true,kind:"fixed",due_date:"2026-02-20"},
   {amount:30,taxable:true,kind:"variable",due_date:"2026-02-15"},
   {amount:40,taxable:false,kind:"fixed",due_date:"2026-03-01"},
   {amount:15,taxable:true,kind:"fixed",due_date:"2026-03-10"}
  ]
 });
 const values=Object.fromEntries(evaluated.results.map(item=>[item.key,item.value]));
 assert.equal(values.eligible_expenses,35);
 assert.equal(values.eligible_count,2);
 assert.equal(values.tax_amount,20);
 assert.equal(values.final_total,155);
 assert.equal(values.days_to_next_month,28);
 assert.equal(values.custom_day_span,7);
 assert.equal(values.custom_month_span,28);
 assert.equal(values.next_month_days,28);
 assert.equal(values.next_date_year,2026);
 assert.equal(values.start_weekday,6);
 assert.equal(values.plan_gate,1);
 assert.equal(values.due_after_cutoff,3);
 assert.equal(values.date_gate,1);
 const leap=engine.evaluateV2TypedResults(spec,{start_date:"2024-01-31",include_tax:false,plan:"basic"},{expenses:[
  {amount:20,taxable:true,kind:"fixed",due_date:"2024-03-01"}
 ]});
 const leapValues=Object.fromEntries(leap.results.map(item=>[item.key,item.value]));
 assert.equal(leapValues.days_to_next_month,29);
 assert.equal(leapValues.next_month_days,29);
});

test("v2 typed formula checker rejects invalid boolean logic, enum literals, date offsets and cross-group aggregates",()=>{
 const engine=createCalculatorEngine();
 const base={
  schemaVersion:2,engineVersion:2,
  inputs:[
   {key:"amount",label:"Amount",type:"number",min:0,max:100,default:10,step:1,unit:"EUR",control:"number"},
   {key:"enabled",label:"Enabled",type:"boolean",default:true,control:"toggle"},
   {key:"plan",label:"Plan",type:"enum",default:"basic",control:"select",choices:[{label:"Basic",value:"basic"},{label:"Pro",value:"pro"}]},
   {key:"start_date",label:"Start date",type:"date",default:"2026-01-31",control:"date"}
  ],
  groups:[
   {key:"items",label:"Items",itemLabel:"Item",minItems:1,maxItems:2,fields:[
    {key:"item_amount",label:"Amount",type:"number",min:0,max:100,default:1,step:1,unit:"EUR"},
    {key:"approved",label:"Approved",type:"boolean",default:true},
    {key:"kind",label:"Kind",type:"enum",default:"basic",choices:[{label:"Basic",value:"basic"},{label:"Pro",value:"pro"}]}
   ]},
   {key:"other_items",label:"Other items",itemLabel:"Item",minItems:1,maxItems:2,fields:[
    {key:"other_amount",label:"Amount",type:"number",min:0,max:100,default:1,step:1,unit:"EUR"}
   ]}
  ],
  results:[],
  scenarios:[]
 };
 const invalid=formula=>{
  const spec=structuredClone(base);
  spec.results=[{label:"Invalid formula",expression:formula,format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"Invalid formula fixture."}];
  return engine.validateVersionedSpec(spec).errors;
 };
 assert.ok(invalid("amount + enabled").some(error=>/Arithmetic operators require numeric values/.test(error)));
 assert.ok(invalid("and(enabled, plan)").some(error=>/accepts only boolean/.test(error)));
 assert.ok(invalid("if(enabled, amount, plan)").some(error=>/same supported value type/.test(error)));
 assert.ok(invalid("if(eq(plan, \"enterprise\"), 1, 0)").some(error=>/does not match a declared enum choice/.test(error)))
 assert.ok(invalid("add_days(start_date, 1.5)").some(error=>/offset constants must be whole numbers/.test(error)));
 assert.ok(invalid("date_diff_days(start_date, 12)").some(error=>/requires two calendar dates/.test(error)));
 const crossGroupErrors=invalid("sum_if(items.item_amount, eq(other_items.other_amount, 1))");
 assert.ok(crossGroupErrors.some(error=>/same dynamic group/.test(error)),JSON.stringify(crossGroupErrors));
 assert.ok(invalid("eq(amount, start_date)").some(error=>/same supported type/.test(error)));
 assert.ok(invalid("if(eq(amount, 10), 1, 0)").length===0,"numeric comparison with a unitless literal should inherit the compared value unit");
});

test("v2 typed formula evaluator rejects invalid runtime values and enforces bounded date arithmetic",()=>{
 const engine=createCalculatorEngine();
 const spec={
  schemaVersion:2,engineVersion:2,
  inputs:[
   {key:"amount",label:"Amount",type:"number",min:0,max:100,default:10,step:1,unit:"EUR",control:"number"},
   {key:"start_date",label:"Start date",type:"date",default:"2026-01-31",control:"date"}
  ],
  groups:[],
  results:[
   {key:"month_end",label:"Month end",expression:"add_months(start_date, 1)",format:"number",currency:"EUR",unit:"",prefix:"",suffix:"",explanation:"This intentionally invalid numeric output is rejected."}
  ],
  scenarios:[]
 };
 assert.ok(engine.validateVersionedSpec(spec).errors.some(error=>/Result formulas must return a number/.test(error)));
 spec.results=[
  {key:"month_days",label:"Month days",expression:"days_in_month(add_months(start_date, 1))",format:"unit",currency:"EUR",unit:"days",prefix:"",suffix:"",explanation:"Days in the following calendar month."}
 ];
 assert.equal(engine.evaluateV2TypedResults(spec,{amount:10,start_date:"2026-01-31"}).results[0].value,28);
 assert.throws(()=>engine.evaluateV2TypedResults(spec,{amount:"10"}),/JSON number/);
 assert.throws(()=>engine.evaluateV2TypedResults(spec,{amount:10,start_date:"2026-02-30"}),/valid calendar date/);
});

test("shared server currency metadata loads before the browser formula engine and calculator UI",()=>{
 const currencyIndex=html.indexOf("/ugc-calculator-currency-data.js");
 const engineIndex=html.indexOf("/ugc-calculator-engine.js");
 const makerIndex=html.indexOf("/ugc-calculators.js");
 assert.ok(currencyIndex>=0&&engineIndex>currencyIndex&&makerIndex>engineIndex);
 assert.ok(makerApi.includes('import "../../ugc-calculator-engine.js";'));
 assert.ok(makerApi.includes("validateCalculatorForServer(SERVER_CALCULATOR_ENGINE,spec)"));
    assert.match(makerApi, /validateCalculatorForServer/);
 assert.doesNotMatch(makerApi,/function compileExpression\(/);
 assert.doesNotMatch(makerApi,/function evaluate\(/);
});



test("Typed V2 persistence uses a database capability gate and a strict member runtime without changing V1 evaluation",()=>{
 assert.match(maker,/async function refreshUGCSchemaCapabilities\(\)/);
 assert.match(maker,/rpc\("get_worth_it_ugc_schema_capabilities"\)/);
 assert.match(maker,/function updateV2PersistenceControls\(\)/);
 assert.match(maker,/state\.v2PersistenceAvailable===true/);
 assert.match(maker,/payload\?\.v2_server_runtime===true/);
 assert.match(v2RuntimeSql,/v2_server_runtime/);
 assert.match(maker,/function appendV2RuntimeGroupControls\(host,group\)/);
 assert.match(maker,/function collectV2RuntimeValues\(root,spec\)/);
 const runtimeStart=maker.indexOf("async function runCalculation(calculator){");
 const runtimeEnd=maker.indexOf("\nfunction renderCalculationResults",runtimeStart);
 const memberRuntime=maker.slice(runtimeStart,runtimeEnd);
 assert.match(memberRuntime,/api\/ugc-calculator-run/);
 assert.doesNotMatch(memberRuntime,/evaluateV2TypedResults/);
 assert.match(memberRuntime,/evaluateFormulaResults\(spec,values,groupValues\)/);
 assert.match(v2RuntimeSql,/public\.get_worth_it_ugc_runtime_spec/);
 assert.match(v2RuntimeSql,/grant execute on function public\.get_worth_it_ugc_runtime_spec\(uuid, uuid\)\s+to service_role/);
 assert.match(v2RuntimeSql,/result_item - 'expression'/);
 assert.match(v2RuntimeSql,/require_test_before_reaction/);
 assert.match(maker,/if\(typedV2&&state\.v2PersistenceAvailable!==true\)/);
 assert.match(maker,/typedV2\?validateManualDraftSpec\(specToSave\):validateMakerSpec\(specToSave\)/);
 assert.match(maker,/async function editCalculator\(id\)\{\s*await editCalculatorManually\(id\);\s*\}/);
 assert.match(maker,/async function editCalculatorManually\(id\)/);
 assert.match(v2PersistenceSql,/private\.worth_it_validate_ugc_v2_spec\(p_spec - 'subcategories' - 'assumptions'\)/);
 assert.match(v2PersistenceSql,/public\.get_worth_it_ugc_schema_capabilities/);
 assert.match(v2PersistenceSql,/revoke all on function public\.get_worth_it_ugc_schema_capabilities\(\) from public, anon, service_role/);
 assert.match(workflow,/supabase\/worth-it-ugc-v2-persistence\.sql/);
 assert.match(workflow,/tests\/fixtures\/ugc-v2-persistence-postgres-smoke\.sql/);
});

test("V1 keeps product price-per-unit formulas dimensionally valid after regional currency selection",()=>{
 const definition={
  title:"Small Business Product Profitability",
  description:"Estimate monthly product revenue, variable costs and net profit after fixed business expenses and payment fees.",
  category:"other",
  subcategories:["business"],
  inputs:[
   {key:"purchase_cost_per_unit",label:"Product purchase cost per unit",min:0,max:10000,default:0,step:1,unit:"EUR"},
   {key:"packaging_cost_per_unit",label:"Packaging cost per unit",min:0,max:1000,default:0,step:1,unit:"EUR"},
   {key:"shipping_cost_per_unit",label:"Shipping cost per unit",min:0,max:1000,default:0,step:1,unit:"EUR"},
   {key:"selling_price_per_unit",label:"Selling price per unit",min:0,max:100000,default:0,step:1,unit:"EUR"},
   {key:"processing_fee_percent",label:"Payment processing fee percentage",min:0,max:100,default:0,step:0.1,unit:"%"},
   {key:"marketplace_fee_percentage",label:"Marketplace fee percentage",min:0,max:100,default:0,step:0.1,unit:"%"},
   {key:"monthly_fixed_expenses",label:"Monthly fixed business expenses",min:0,max:1000000,default:0,step:1,unit:"EUR"},
   {key:"expected_monthly_sales_volume",label:"Expected monthly sales volume",min:0,max:1000000,default:100,step:1,unit:"units"}
  ],
  groups:[],
  results:[
   {label:"Monthly Revenue",expression:"selling_price_per_unit*expected_monthly_sales_volume",format:"currency",currency:"EUR"},
   {label:"Monthly Total Variable Costs",expression:"(purchase_cost_per_unit+packaging_cost_per_unit+shipping_cost_per_unit)*expected_monthly_sales_volume",format:"currency",currency:"EUR"},
   {label:"Monthly Net Profit after Fixed Expenses",expression:"selling_price_per_unit*expected_monthly_sales_volume-(purchase_cost_per_unit+packaging_cost_per_unit+shipping_cost_per_unit)*expected_monthly_sales_volume-monthly_fixed_expenses-selling_price_per_unit*expected_monthly_sales_volume*(processing_fee_percent+marketplace_fee_percentage)/100",format:"currency",currency:"EUR"}
  ],
  scenarios:[]
 };
 const normalized=normalizeDefinition(definition,"RSD",{forceCurrency:"RSD",requireAllInputsUsed:true});
 const inputs=Object.fromEntries(normalized.inputs.map(item=>[item.key,item]));
 assert.equal(inputs.purchase_cost_per_unit.unit,"RSD/unit");
 assert.equal(inputs.packaging_cost_per_unit.unit,"RSD/unit");
 assert.equal(inputs.shipping_cost_per_unit.unit,"RSD/unit");
 assert.equal(inputs.selling_price_per_unit.unit,"RSD/unit");
 assert.equal(inputs.monthly_fixed_expenses.unit,"RSD");
 assert.equal(inputs.expected_monthly_sales_volume.unit,"units");
 assert.ok(normalized.results.every(item=>item.currency==="RSD"));
});

test("v2 numeric normalization accepts browser numeric strings but rejects coercible non-numbers",()=>{
 const engine=createCalculatorEngine();
 const definition={type:"number",min:0,max:100,default:1,step:0.5,control:"number"};
 const accepted=[
  [0,0],[12,12],["12",12],[" 12.5 ",12.5],[".5",0.5],["5.",5],["1e2",100],["+2.5",2.5]
 ];
 for(const [raw,expected] of accepted){
  const result=engine.normalizeTypedValue(definition,raw);
  assert.equal(result.valid,true,String(raw));
  assert.equal(result.value,expected,String(raw));
 }
 const rejected=[
  "", " ", "\t\n", [], [1], {}, {value:1}, true, false, null, undefined,
  "0x10", "0b10", "Infinity", "NaN", "1,5", "1 2", "1e309", "--1", "+", ".", "1e"
 ];
 for(const raw of rejected){
  const result=engine.normalizeTypedValue(definition,raw);
  assert.equal(result.valid,false,"Expected "+JSON.stringify(raw)+" to be rejected");
 }
 assert.equal(engine.normalizeTypedValue(definition,NaN).valid,false);
 assert.equal(engine.normalizeTypedValue(definition,Infinity).valid,false);
 assert.equal(engine.normalizeTypedValue(definition,101).valid,false);
 assert.equal(engine.normalizeTypedValue(definition,1.25).valid,false,"step mismatch");
 const select={...definition,control:"select",choices:[{label:"One",value:1},{label:"Two",value:2}]};
 assert.equal(engine.normalizeTypedValue(select,"1").valid,true);
 assert.equal(engine.normalizeTypedValue({...select,choices:[{label:"One",value:"1"},{label:"Two",value:2}]},"1").valid,false,
  "numeric select choices must retain numeric JSON values rather than coercing strings");
 assert.equal(engine.normalizeTypedValue({...definition,min:"0"},"1").valid,false,
  "the numeric definition itself must not rely on string coercion");
});


test("V2 formula parser survives deterministic adversarial and oversized-input corpus",()=>{
 const engine=createCalculatorEngine(),symbols=new Set(["amount","rate","periods"]);
 const groups=null;
 const fragments=["amount","1","0","(",")","+","-","*","/","^",",","if(","and(","true","false",'"x"',"unknown",";","[","]","__proto__","constructor","prototype","NaN","1e309","1e999","9".repeat(480),"sum_if(","items.value","items.enabled","\\\\","<script>","\uD800","\u202E","\u0000","\uFEFF","\u200B","😀"];
 let seed=0x5eed1234;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let index=0;index<600;index++){
  const count=1+(random()%40),source=Array.from({length:count},()=>fragments[random()%fragments.length]).join(index%3===0?" ":"");
  try{
   const ast=engine.compileV2Expression(source,symbols,groups);
   assert.ok(ast&&typeof ast==="object","accepted source must produce an AST");
  }catch(error){
   assert.ok(error&&typeof error.message==="string","parser failures must expose a descriptive error message");
  }
 }
 assert.throws(()=>engine.compileV2Expression("1".repeat(501),symbols,groups),/1–500 characters/);
 assert.throws(()=>engine.compileV2Expression("9".repeat(480),symbols,groups),/invalid syntax|numeric|characters/i,"oversized numeric literals must fail safely");
});

test("v2 formula compiler enforces bounded formula length, nesting and AST node counts",()=>{
 const engine=createCalculatorEngine();
 const symbols=new Set(["amount"]),groups=new Map();
 const exactLength=" ".repeat(250)+"1"+" ".repeat(249);
 assert.equal(exactLength.length,500);
 assert.equal(engine.compileV2Expression(exactLength,symbols,groups).value,1);
 assert.throws(()=>engine.compileV2Expression(exactLength+" ",symbols,groups),/1–500 characters/);
 assert.throws(()=>engine.compileV2Expression(" ".repeat(500),symbols,groups),/1–500 characters/);
 const nesting32="(".repeat(32)+"amount"+")".repeat(32);
 assert.equal(engine.compileV2Expression(nesting32,symbols,groups).name,"amount");
 const nesting33="(".repeat(33)+"amount"+")".repeat(33);
 assert.throws(()=>engine.compileV2Expression(nesting33,symbols,groups),/32-level nesting limit/);
 const nodes255=Array(128).fill("1").join("+");
 assert.equal(engine.compileV2Expression(nodes255,symbols,groups).type,"binary");
 const nodesOverLimit=Array(129).fill("1").join("+");
 assert.throws(()=>engine.compileV2Expression(nodesOverLimit,symbols,groups),/256-node limit/);
 const malformed=["1 +","1.2.3","unknown","amount || 1",'"unterminated','sum()'];
 for(const formula of malformed){
  assert.throws(()=>engine.compileV2Expression(formula,symbols,groups),undefined,formula);
 }
});


test("V2 maximum supported schema shape evaluates 24 inputs, 4 groups, 480 fields, 20 results and 3 scenarios",()=>{
 const engine=createCalculatorEngine();
 const inputs=Array.from({length:24},(_,index)=>({
  key:"input_"+index,label:"Input "+index,type:"number",control:"number",min:0,max:100,default:1,step:1,unit:""
 }));
 const groups=Array.from({length:4},(_,groupIndex)=>({
  key:"group_"+groupIndex,label:"Group "+groupIndex,itemLabel:"Row",minItems:20,maxItems:20,
  fields:Array.from({length:6},(_,fieldIndex)=>({
   key:"g"+groupIndex+"_f"+fieldIndex,label:"Field "+fieldIndex,type:"number",min:0,max:100,default:1,step:1,unit:""
  }))
 }));
 const results=Array.from({length:20},(_,index)=>{
  const groupIndex=index%4,fieldIndex=Math.floor(index/4);
  return {key:"result_"+index,label:"Result "+index,expression:"sum(group_"+groupIndex+".g"+groupIndex+"_f"+fieldIndex+")",format:"number"};
 });
 const scenarios=Array.from({length:3},(_,index)=>({label:"Scenario "+(index+1),values:{["input_"+index]:index+2}}));
 const spec={schemaVersion:2,engineVersion:2,inputs,groups,results,scenarios};
 const validation=engine.validateVersionedSpec(spec);
 assert.equal(validation.errors.length,0,validation.errors.join(" "));
 const rawGroups=Object.fromEntries(groups.map(group=>[group.key,
  Array.from({length:20},()=>Object.fromEntries(group.fields.map(field=>[field.key,1])))
 ]));
 const evaluated=engine.evaluateV2TypedResults(spec,{},rawGroups);
 assert.equal(evaluated.results.length,20);
 assert.equal(evaluated.groups.group_0.length,20);
 assert.equal(evaluated.groups.group_3.length,20);
 assert.ok(evaluated.results.every(item=>item.value===20));
 assert.equal(Object.keys(evaluated.values).length,24);
});

test("V2 statistical aggregations and financial formulas evaluate deterministically with typed units",()=>{
 const engine=createCalculatorEngine();
 const spec={
  schemaVersion:2,engineVersion:2,
  inputs:[
   {key:"principal",label:"Principal",type:"number",control:"number",min:0,max:100000,default:100,step:1,unit:"EUR"},
   {key:"rate",label:"Rate",type:"number",control:"number",min:0,max:1,default:0.1,step:0.01,unit:""},
   {key:"periods",label:"Periods",type:"number",control:"number",min:1,max:100,default:2,step:1,unit:""}
  ],
  groups:[{
   key:"items",label:"Items",itemLabel:"Item",minItems:2,maxItems:10,
   fields:[
    {key:"value",label:"Value",type:"number",min:0,max:1000,default:10,step:1,unit:"EUR"},
    {key:"weight",label:"Weight",type:"number",min:-100,max:100,default:1,step:1,unit:""},
    {key:"score",label:"Score",type:"number",min:0,max:100,default:10,step:1,unit:""}
   ]
  }],
  results:[
   {key:"median_value",label:"Median value",expression:"median(items.value)",format:"unit",unit:"EUR"},
   {key:"p50_value",label:"50th percentile",expression:"percentile(items.value, 50)",format:"unit",unit:"EUR"},
   {key:"weighted_value",label:"Weighted average",expression:"weighted_avg(items.value, items.weight)",format:"unit",unit:"EUR"},
   {key:"score_variance",label:"Score variance",expression:"variance(items.score)",format:"number"},
   {key:"score_stddev",label:"Score standard deviation",expression:"stddev(items.score)",format:"number"},
   {key:"future",label:"Future value",expression:"compound_interest(principal, rate, periods)",format:"unit",unit:"EUR"},
   {key:"present",label:"Present value",expression:"present_value(principal, rate, periods)",format:"unit",unit:"EUR"},
   {key:"payment",label:"Periodic loan payment",expression:"loan_payment(principal, rate, periods)",format:"unit",unit:"EUR"}
  ],
  scenarios:[]
 };
 const validation=engine.validateVersionedSpec(spec);
 assert.equal(validation.errors.length,0,validation.errors.join(" "));
 const result=engine.evaluateV2TypedResults(spec,{},{
  items:[
   {value:10,weight:1,score:2},
   {value:20,weight:3,score:4},
   {value:30,weight:0,score:6}
  ]
 });
 const values=Object.fromEntries(result.results.map(item=>[item.key,item.value]));
 assert.equal(values.median_value,20);
 assert.equal(values.p50_value,20);
 assert.equal(values.weighted_value,17.5);
 assert.equal(values.score_variance,8/3);
 assert.ok(Math.abs(values.score_stddev-Math.sqrt(8/3))<1e-12);
 assert.ok(Math.abs(values.future-121)<1e-10);
 assert.ok(Math.abs(values.present-100/1.21)<1e-12);
 assert.ok(Math.abs(values.payment-(100*0.1/(1-Math.pow(1.1,-2))))<1e-12);
 assert.throws(()=>engine.evaluateV2TypedResults(spec,{},{
  items:[{value:10,weight:-1,score:2},{value:20,weight:3,score:4}]
 }),/weights cannot be negative/);
 assert.throws(()=>engine.evaluateV2TypedResults(spec,{},{
  items:[{value:10,weight:0,score:2},{value:20,weight:0,score:4}]
 }),/positive total weight/);
 assert.throws(()=>engine.evaluateV2TypedResults(spec,{rate:-0.01},{
  items:[{value:10,weight:1,score:2},{value:20,weight:3,score:4}]
 }),/at least 0|minimum|range/i);
 const invalidArity=engine.validateVersionedSpec({...spec,results:[{...spec.results[0],expression:"median(items.value, 2)"}]});
 assert.ok(invalidArity.errors.some(message=>/median\(\).*invalid number of arguments/i.test(message)),invalidArity.errors.join(" "));
});




test("AI UGC Creator GET and POST endpoints are disabled without invoking providers or reservations", async () => {
    const get = await onRequestGet({
        request: new Request(previewOrigin + "/api/ugc-maker?diagnostic=coverage&prompt=Create%20a%20calculator", {
            method: "GET",
            headers: { Origin: previewOrigin }
        }),
        env: {}
    });
    assert.equal(get.status, 410);
    assert.equal((await get.json()).code, "AI_UGC_CREATOR_DISABLED");
    const post = await onRequestPost({
        request: request({ mode: "create", prompt: "Create a calculator for monthly savings growth." }, { token: "valid-token" }),
        env: {}
    });
    assert.equal(post.status, 410);
    assert.equal((await post.json()).code, "AI_UGC_CREATOR_DISABLED");
    assert.match(makerApi, /AI generation and AI improvement for community calculators have been removed/);
});
