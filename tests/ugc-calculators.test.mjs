import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { onRequestPost, onRequestOptions } from "../functions/api/ugc-maker.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const routing = read("routing.js");
const guest = read("guest-mode.js");
const maker = read("ugc-calculators.js");
const makerApi = read("functions/api/ugc-maker.js");
const profile = read("profile-ui.js");
const chat = read("chat-ui.js");
const community = read("community-features.js");
const economy = read("calc-economy.js");
const sql = read("supabase/worth-it-ugc-badges.sql");
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
const profileCardsSql = read("supabase/worth-it-ugc-profile-cards.sql");
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
        { key: "years", label: "Years", min: 1, max: 80, default: 5, step: 1, unit: "years" }
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

function withFetch(mock, callback) {
    const previous = globalThis.fetch;
    globalThis.fetch = mock;
    return Promise.resolve().then(callback).finally(() => { globalThis.fetch = previous; });
}

test("AI Maker can be closed only with its X button; backdrop clicks never dismiss it", () => {
    assert.ok(maker.includes('$("ugcMakerClose")?.addEventListener("click",closeMaker);'), "the X button is wired to close the maker");
    assert.ok(!maker.includes('addEventListener("click",event=>{\n  const shouldClose='), "there is no backdrop click-to-close handler");
    assert.ok(!maker.includes('makerBackdropPointerDown'), "there is no pointer-based backdrop dismissal");
    assert.ok(!maker.includes('$("ugcMakerOverlay")?.addEventListener("click"'), "clicking the calculator card never dismisses the maker");
});

test("AI Maker test mode recalculates locally with the restricted formula engine and never charges CALC", () => {
    const engineStart = maker.indexOf("function compileExpression");
    const engineEnd = maker.indexOf("async function refreshAiEditQuota", engineStart);
    assert.ok(engineStart >= 0 && engineEnd > engineStart, "the restricted formula engine is present");
    const engineSource = maker.slice(engineStart, engineEnd);
    const engine = runInNewContext(engineSource + "\n({ compileExpression, evaluate, formatResult })");
    const keys = new Set(["current_monthly_cost", "new_monthly_cost", "switching_fee", "period_months"]);
    const values = { current_monthly_cost: 30, new_monthly_cost: 10, switching_fee: 0, period_months: 12 };
    const expressions = [
        "current_monthly_cost * period_months",
        "new_monthly_cost * period_months + switching_fee",
        "current_monthly_cost * period_months - (new_monthly_cost * period_months + switching_fee)",
        "(current_monthly_cost * period_months - (new_monthly_cost * period_months + switching_fee)) / period_months"
    ];
    const results = expressions.map(expression => engine.evaluate(engine.compileExpression(expression, keys), values));
    assert.deepEqual(results, [360, 120, 240, 20], "the same evaluator should calculate the subscription example correctly");

    assert.match(maker, /button\("▶ Test calculator","ugc-maker-test-toggle"/);
    assert.match(maker, /function renderMakerTestPanel\(preserveValues\)/);
    assert.match(maker, /function updateMakerTestResults\(panel\)/);
    assert.match(maker, /control\.addEventListener\("input",\(\)=>updateMakerTestResults\(panel\)\)/);
    assert.match(maker, /compileExpression\(item\.expression,keys\)/);
    assert.match(maker, /evaluate\(ast,values\)/);
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
    assert.match(paginationFixture,/exception when raise_exception then blocked:=true;/);
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
    assert.ok(html.includes("There is no total limit on how many community calculators you can save."));
    assert.ok(html.includes('data-ugc-sort="my-drafts"'));
    assert.ok(maker.includes('state.sort==="my-drafts"'));
    assert.ok(maker.includes("set_worth_it_ugc_visibility"));
    assert.match(maker,/publish_worth_it_ugc_calculator",\{p_id:id,p_visibility:visibility\}/);
    assert.match(maker,/set_worth_it_ugc_visibility",\{p_id:id,p_visibility:target\}/);
    assert.match(maker,/state\.editingId=id;\s*state\.editingVisibility=visibility;/,
        "a saved draft ID is retained if the first publication attempt fails, so retries do not create duplicate calculators");
    assert.ok(html.includes("ugcMakerVisibilityWrap"));
    assert.ok(maker.includes("AI-selected categories"));
    assert.ok(html.includes("Guest 0, Free 1, Premium Lite 2, Premium 3"));
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
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_maker_generation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 10 }), { status: 200 });
        }
        calls++;
        const body = JSON.parse(options.body);
        assert.equal(body.response_format.type, "json_object");
        assert.match(body.messages[0].content, /restricted arithmetic parser/);
        return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(validDefinition) } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a calculator for monthly savings growth." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GROQ_API_KEY: "groq-test" }
        });
        assert.equal(response.status, 200);
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
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_maker_generation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 1, daily_limit: 10 }), { status: 200 });
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
    assert.match(makerApi, /response_format:\s*\{\s*type:\s*"json_object"/);
    const options = await onRequestOptions({ request: new Request(previewOrigin + "/api/ugc-maker", { method: "OPTIONS", headers: { Origin: previewOrigin } }) });
    assert.equal(options.status, 204);
});

test("AI Maker uses Gemini first and Groq as a fallback, with a server-side daily generation quota", async () => {
    const requests = [];
    await withFetch(async (url, options) => {
        requests.push(String(url));
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_maker_generation")) {
            return new Response(JSON.stringify({ ok: true, requests_used: 2, daily_limit: 10 }), { status: 200 });
        }
        assert.match(String(url), /generativelanguage\.googleapis\.com/);
        const body = JSON.parse(options.body);
        assert.equal(body.generationConfig.responseMimeType, "application/json");
        return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(validDefinition) }] } }]
        }), { status: 200 });
    }, async () => {
        const response = await onRequestPost({
            request: request({ prompt: "Create a calculator for monthly savings growth." }, { token: "valid-token" }),
            env: { SUPABASE_URL: "https://supabase.example", SUPABASE_PUBLISHABLE_KEY: "publishable", GEMINI_API_KEY: "gemini-test" }
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).success, true);
        assert.ok(requests.some(url => url.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_maker_generation")));
        assert.ok(requests.some(url => url.includes("generativelanguage.googleapis.com")));
    });

    const limitedCalls = [];
    await withFetch(async url => {
        limitedCalls.push(String(url));
        if (String(url).endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({ id: "user-id", email_confirmed_at: "2026-01-01T00:00:00Z" }), { status: 200 });
        }
        if (String(url).endsWith("/rest/v1/rpc/reserve_worth_it_ugc_maker_generation")) {
            return new Response(JSON.stringify({ ok: false, code: "DAILY_LIMIT", daily_limit: 10, requests_used: 10 }), { status: 200 });
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

test("AI improvement preserves saved calculator identity and enforces owner and daily quota checks", async () => {
    const existing = {
        id: "11111111-1111-4111-8111-111111111111",
        is_owner: true,
        title: validDefinition.title,
        description: validDefinition.description,
        category: validDefinition.category,
        spec: structuredClone(validDefinition)
    };
    const refined = structuredClone(validDefinition);
    refined.inputs[0].label = "Starting savings balance";
    refined.inputs[0].max = 2000000;

    const calls = [];
    await withFetch(async (url, options) => {
        const path = String(url);
        calls.push(path);
        if (path.endsWith("/auth/v1/user")) {
            return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        }
        if (path.endsWith("/rest/v1/rpc/get_worth_it_ugc_calculator")) {
            return new Response(JSON.stringify(existing),{status:200});
        }
        if (path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_edit")) {
            return new Response(JSON.stringify({ok:true,daily_limit:2,edits_used:1,remaining:1}),{status:200});
        }
        if (path.endsWith("/rest/v1/rpc/settle_worth_it_ugc_ai_edit")) {
            return new Response(JSON.stringify({ok:true}),{status:200});
        }
        if (path.includes("generativelanguage.googleapis.com")) {
            const body=JSON.parse(options.body);
            assert.match(body.systemInstruction.parts[0].text,/preserve the exact title, category, description/i);
            return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(refined)}]}}]}),{status:200});
        }
        throw new Error("Unexpected AI refinement request: "+path);
    },async()=>{
        const response=await onRequestPost({
            request:request({mode:"refine",calculator_id:existing.id,prompt:"Improve the calculation assumptions and formulas."},{token:"valid-token"}),
            env:{SUPABASE_URL:"https://supabase.example",SUPABASE_PUBLISHABLE_KEY:"publishable",GEMINI_API_KEY:"gemini-test"}
        });
        assert.equal(response.status,200);
        const result=await response.json();
        assert.equal(result.mode,"refine");
        assert.equal(result.calculator.title,existing.title);
        assert.equal(result.calculator.description,existing.description);
        assert.equal(result.calculator.category,existing.category);
        assert.equal(result.calculator.spec.inputs[0].label,"Starting savings balance");
        assert.ok(calls.some(path=>path.endsWith("/rest/v1/rpc/settle_worth_it_ugc_ai_edit")));
    });

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
        if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_edit"))return new Response(JSON.stringify({ok:false,code:"DAILY_LIMIT",daily_limit:2,edits_used:2,remaining:0}),{status:200});
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
    await withFetch(async (url,options)=>{
        const path=String(url);identityCalls.push(path);
        if(path.endsWith("/auth/v1/user"))return new Response(JSON.stringify({id:"user-id",email_confirmed_at:"2026-01-01T00:00:00Z"}),{status:200});
        if(path.endsWith("/rest/v1/rpc/get_worth_it_ugc_calculator"))return new Response(JSON.stringify(existing),{status:200});
        if(path.endsWith("/rest/v1/rpc/reserve_worth_it_ugc_ai_edit"))return new Response(JSON.stringify({ok:true}),{status:200});
        if(path.includes("generativelanguage.googleapis.com")){
            const changed={...refined,category:"cars",subcategories:["fuel-costs"]};
            return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(changed)}]}}]}),{status:200});
        }
        if(path.endsWith("/rest/v1/rpc/refund_worth_it_ugc_ai_edit"))return new Response(JSON.stringify({ok:true}),{status:200});
        throw new Error("Unexpected request in identity guard test: "+path);
    },async()=>{
        const response=await onRequestPost({
            request:request({mode:"refine",calculator_id:existing.id,prompt:"Turn this into a car calculator."},{token:"valid-token"}),
            env:{SUPABASE_URL:"https://supabase.example",SUPABASE_PUBLISHABLE_KEY:"publishable",GEMINI_API_KEY:"gemini-test"}
        });
        assert.equal(response.status,422);
        assert.equal((await response.json()).code,"CALCULATOR_IDENTITY_CHANGED");
        assert.ok(identityCalls.some(path=>path.endsWith("/rest/v1/rpc/refund_worth_it_ugc_ai_edit")));
    });
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
    assert.match(html,/Free 2, Premium Lite 3, Premium 4/);
});

test("calculator formulas are declarative and never executed as arbitrary JavaScript", () => {
    assert.match(maker, /function compileExpression/);
    assert.match(maker, /function evaluate/);
    assert.match(maker, /calc_wallet_reserve/);
    assert.match(maker, /calc_wallet_settle/);
    assert.match(maker, /calc_wallet_refund/);
    assert.doesNotMatch(maker, /\beval\s*\(/);
    assert.doesNotMatch(maker, /new\s+Function\s*\(/);
    assert.match(sql, /private\.worth_it_validate_ugc_spec/);
    assert.match(sql, /formula contains an unsupported variable or function/i);
    assert.match(sql, /private\.worth_it_ugc_maker_daily_usage/);
    assert.match(sql, /requests_used<10/);
    assert.match(sql, /reserve_worth_it_ugc_maker_generation/);
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


test("calculator explorer settles and restores exactly one visible panel after tab changes", () => {
    assert.match(maker, /let pendingExploreTransitionFinish=null/);
    assert.match(maker, /function reconcileExplorePanels\(\)/);
    assert.match(maker, /pendingExploreTransitionFinish=finish/);
    assert.match(maker, /document\.addEventListener\("visibilitychange"/);
    assert.match(maker, /window\.addEventListener\("pageshow",reconcileExplorePanels\)/);
    assert.match(maker, /window\.addEventListener\("focus",reconcileExplorePanels\)/);
    assert.match(maker, /basic\.hidden=active!=="basic";community\.hidden=active!=="community"/);
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
    assert.match(maker, /communityActive=Boolean\(state\.userId && state\.exploreView==="community"\)/);
    assert.match(maker, /if\(gallery\)gallery\.hidden=!communityActive/);
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
    assert.match(maker, /const CURRENCIES=\[/);
    assert.match(maker, /\["RSD","Serbian dinar"\]/);
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
    assert.match(saveFunction, /invalidCurrency=\(state\.aiDraft\.spec\?\.results\|\|\[\]\)\.find\(item=>item\.format==="currency"&&!\/\^\[A-Z\]\{3\}\$\//);
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


test("UGC catalogue descriptions end with a visible three-dot continuation while detail descriptions stay full", () => {
    assert.match(maker, /function cardDescriptionPreview\(description\)/);
    assert.match(maker, /const limit=150/);
    assert.ok(maker.includes('replace(/[.!?…]+$/,"")+"..."'));
    assert.match(maker, /descriptionNode\.title=fullDescription/);
    assert.match(maker, /description\.textContent=calculator\.description\|\|"No description provided\."/);
    assert.match(maker, /descInput\.maxLength=500/);
    assert.match(html, /id="ugcDetailDescriptionInput"[^>]*maxlength="500"/);
    assert.match(sqlEnhancements, /char_length\(v_description\)>500/);
    assert.match(visibilitySql, /char_length\(v_description\)>500/);
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


test("UGC calculator card title descenders stay visible and the description sits 10px higher", () => {
    assert.ok(paginationCss.includes("@media(min-width:641px){"));
    assert.ok(paginationCss.includes(".ugc-calculator-card .ugc-card-title{"));
    assert.ok(paginationCss.includes("line-height:1.35!important;"));
    assert.ok(paginationCss.includes("padding-bottom:3px;"));
    assert.ok(paginationCss.includes(".ugc-calculator-card .ugc-card-description{\n  margin-top:-10px;"));
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
