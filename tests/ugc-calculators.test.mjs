import test from "node:test";
import assert from "node:assert/strict";
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
const sqlEnhancements = read("supabase/worth-it-ugc-enhancements.sql");
const workflow = read(".github/workflows/function-syntax-check.yml");

const previewOrigin = "https://pr-preview.worth-it-calculator.pages.dev";
const validDefinition = {
    title: "Monthly savings growth",
    description: "Estimate savings with monthly deposits.",
    category: "money",
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

test("the UGC gallery, detail route, maker modal and profile sections are wired", () => {
    for (const id of [
        "ugcCommunitySection", "ugcCalculatorGrid", "ugcCreateButton", "ugcMakerModal",
        "ugcMakerPrompt", "ugcMakerPreview", "ugcMakerQuotaStatus", "ugcDetailSection", "ugcDetailKicker", "ugcDetailCalculatorForm",
        "worthItProfileFavouritesSection", "worthItProfileBadgesSection",
        "worthItProfileNameBadges", "worthItProfileFavouriteCalculators"
    ]) assert.ok(html.includes('id="' + id + '"'), id + " is present in the UI");

    for (const sort of ["latest", "popular", "liked", "favorited", "disliked", "mine", "my-favorites"]) {
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
    assert.ok(maker.includes("const MAX_CALCULATORS=10;"));
    assert.ok(html.includes("You can save up to 10 community calculators"));
    assert.ok(html.includes("Guest 0, Free 1, Premium Lite 2, Premium 3"));
    assert.ok(maker.includes("get_worth_it_my_ugc_calculators"));
    assert.ok(maker.includes("get_worth_it_my_favorite_ugc_calculators"));
    assert.ok(maker.includes("get_worth_it_ugc_creation_quota"));
    assert.ok(maker.includes("switchCalculatorExploreView"));
    assert.ok(html.includes("ugcBackToBasicButton"));
    assert.ok(html.includes("IMPORTANT — PLEASE READ BEFORE USING WORTH IT AI"));
    assert.ok(html.includes("Each successful AI reply costs"));
    assert.ok(maker.includes("update_worth_it_ugc_calculator_description"));
    assert.ok(maker.includes("get_worth_it_ugc_ai_edit_quota"));
    assert.ok(sqlEnhancements.includes("get_worth_it_my_favorite_ugc_calculators"));
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
            const changed={...refined,category:"cars"};
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

test("UGC writes are owner-bound, capped and not directly accessible through public tables", () => {
    assert.match(sql, /char_length\(v_title\) not between 3 and 70/);
    assert.match(sql, /v_count>=10/);
    assert.match(sql, /where id=p_id and owner_user_id=v_user_id/);
    assert.match(sql, /Verify ownership before removing any social data/);
    assert.match(sql, /delete from public\.worth_it_calculator_favorites[\s\S]*?calculator_key='ugc:'\|\|p_id::text/);
    assert.match(sql, /where id=p_id and owner_user_id=v_user_id for update/);
    assert.match(sql, /status='published'/);
    assert.match(sql, /revoke all on private\.worth_it_user_calculators from public, anon, authenticated/i);
    assert.match(sql, /alter table private\.worth_it_user_calculators enable row level security/i);
    assert.match(sql, /revoke all on function public\.save_worth_it_ugc_calculator/);
    assert.match(sql, /grant execute on function public\.save_worth_it_ugc_calculator.*to authenticated/i);
    assert.match(sql, /email_confirmed_at is not null/);
    assert.match(sql, /'is_owner',\(c\.owner_user_id=v_user_id\)/);
    assert.match(read("tests/fixtures/ugc-badges-postgres-smoke.sql"), /Deleting a calculator left orphan favourite rows/);
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
