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
        "ugcMakerPrompt", "ugcMakerPreview", "ugcDetailSection", "ugcDetailCalculatorForm",
        "worthItProfileFavouritesSection", "worthItProfileBadgesSection",
        "worthItProfileNameBadges", "worthItProfileFavouriteCalculators"
    ]) assert.ok(html.includes('id="' + id + '"'), id + " is present in the UI");

    for (const sort of ["latest", "popular", "liked", "favorited", "disliked", "mine"]) {
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
    assert.ok(maker.includes("You can create up to 10 community calculators"));
    assert.ok(maker.includes("get_worth_it_my_ugc_calculators"));
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
});

test("UGC writes are owner-bound, capped and not directly accessible through public tables", () => {
    assert.match(sql, /char_length\(v_title\) not between 3 and 70/);
    assert.match(sql, /v_count>=10/);
    assert.match(sql, /where id=p_id and owner_user_id=v_user_id/);
    assert.match(sql, /where id=p_id and owner_user_id=v_user_id for update/);
    assert.match(sql, /status='published'/);
    assert.match(sql, /revoke all on private\.worth_it_user_calculators from public, anon, authenticated/i);
    assert.match(sql, /alter table private\.worth_it_user_calculators enable row level security/i);
    assert.match(sql, /revoke all on function public\.save_worth_it_ugc_calculator/);
    assert.match(sql, /grant execute on function public\.save_worth_it_ugc_calculator.*to authenticated/i);
    assert.match(sql, /email_confirmed_at is not null/);
    assert.match(sql, /'is_owner',\(c\.owner_user_id=v_user_id\)/);
    assert.doesNotMatch(sql, /'owner_user_id',c\.owner_user_id/);
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
