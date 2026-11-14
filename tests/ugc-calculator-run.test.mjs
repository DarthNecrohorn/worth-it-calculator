import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequestOptions } from "../functions/api/ugc-calculator-run.js";

const origin = "https://preview.example";
const userToken = "valid-user-jwt";
const serviceSecret = "sb_secret_test_key";
const calculatorId = "11111111-1111-4111-8111-111111111111";

function typedSpec(overrides = {}) {
    return {
        schemaVersion: 2,
        engineVersion: 2,
        inputs: [
            { key: "amount", label: "Amount", type: "number", control: "number", min: 0, max: 1000, default: 10, step: 1, unit: "EUR" },
            { key: "enabled", label: "Enabled", type: "boolean", control: "toggle", default: true },
            { key: "plan", label: "Plan", type: "enum", control: "select", default: "pro", choices: [{ label: "Basic", value: "basic" }, { label: "Pro", value: "pro" }] },
            { key: "start_date", label: "Start date", type: "date", control: "date", default: "2026-01-31" }
        ],
        groups: [],
        results: [
            {
                key: "eligible_amount",
                label: "Eligible amount",
                expression: 'if(and(enabled, eq(plan, "pro")), amount * 2, 0)',
                format: "currency",
                currency: "EUR",
                unit: "",
                prefix: "",
                suffix: "",
                explanation: "Amount is included only for enabled Pro plans."
            }
        ],
        scenarios: [
            { label: "Basic plan", values: { enabled: false, plan: "basic", start_date: "2024-01-31" } }
        ],
        ...overrides
    };
}

function makeRequest(body, options = {}) {
    const headers = new Headers({
        Origin: options.origin || origin,
        Accept: "application/json"
    });
    if (options.token !== null) headers.set("Authorization", "Bearer " + (options.token || userToken));
    return new Request(origin + "/api/ugc-calculator-run", {
        method: options.method || "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

function config(serviceKey = serviceSecret) {
    return {
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
        SUPABASE_SECRET_KEY: serviceKey
    };
}

function response(payload, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function withFetch(mock, callback) {
    const previous = globalThis.fetch;
    globalThis.fetch = mock;
    return Promise.resolve().then(callback).finally(() => { globalThis.fetch = previous; });
}

const body = (overrides = {}) => ({
    calculator_id: calculatorId,
    values: { amount: 17, enabled: true, plan: "pro", start_date: "2026-02-01" },
    groups: {},
    ...overrides
});

test("V2 runtime verifies the user, loads the private definition, calculates on the server and settles CALC", async () => {
    const spec = typedSpec();
    const calls = [];
    await withFetch(async (url, options) => {
        const path = String(url);
        calls.push({ path, options });
        if (path.endsWith("/auth/v1/user")) return response({ id: "user-123", email: "member@example.test" });
        if (path.endsWith("/rest/v1/rpc/get_worth_it_ugc_runtime_spec")) {
            assert.equal(options.headers.get("apikey"), serviceSecret);
            assert.equal(options.headers.get("Authorization"), null, "new secret keys must not be sent as JWTs");
            const args = JSON.parse(options.body);
            assert.equal(args.p_id, calculatorId);
            assert.equal(args.p_user_id, "user-123");
            return response({ spec, usage_price_milli: 250 });
        }
        if (path.endsWith("/rest/v1/rpc/calc_wallet_reserve")) {
            assert.equal(options.headers.get("apikey"), "sb_publishable_test_key");
            assert.equal(options.headers.get("Authorization"), "Bearer " + userToken);
            const args = JSON.parse(options.body);
            assert.equal(args.p_reason, "calculator");
            assert.equal(args.p_calculator_id, calculatorId);
            assert.match(args.p_request_id, /^[0-9a-f-]{36}$/i);
            return response({ ok: true, usage_price_milli: 250 });
        }
        if (path.endsWith("/rest/v1/rpc/calc_wallet_settle")) {
            assert.match(JSON.parse(options.body).p_request_id, /^[0-9a-f-]{36}$/i);
            return response({ ok: true, status: "completed" });
        }
        throw new Error("Unexpected request: " + path);
    }, async () => {
        const result = await onRequestPost({
            request: makeRequest(body()),
            env: config()
        });
        const data = await result.json();
        assert.equal(result.status, 200, JSON.stringify(data));
        assert.equal(data.success, true);
        assert.equal(data.usage_price_milli, 250);
        assert.equal(data.results[0].value, 34);
        assert.equal(data.results[0].expression, undefined);
        assert.equal(data.scenario_comparisons[0].results[0].value, 0);
        assert.deepEqual(calls.map(item => item.path.split("/").pop()), [
            "user", "get_worth_it_ugc_runtime_spec", "calc_wallet_reserve", "calc_wallet_settle"
        ]);
    });
});

test("V2 runtime rejects invalid typed input before reserving or charging CALC", async () => {
    const spec = typedSpec();
    const calls = [];
    await withFetch(async (url, options) => {
        const path = String(url);
        calls.push(path);
        if (path.endsWith("/auth/v1/user")) return response({ id: "user-123" });
        if (path.endsWith("/rest/v1/rpc/get_worth_it_ugc_runtime_spec")) return response({ spec, usage_price_milli: 250 });
        throw new Error("CALC must not be reserved for invalid input: " + path);
    }, async () => {
        const result = await onRequestPost({
            request: makeRequest(body({ values: { amount: "17", enabled: true, plan: "pro", start_date: "2026-02-01" } })),
            env: config()
        });
        const data = await result.json();
        assert.equal(result.status, 422);
        assert.equal(data.code, "INVALID_CALCULATOR_INPUT");
        assert.equal(calls.length, 2);
    });
});

test("V2 runtime rejects tampered stored formulas before reserving CALC", async () => {
    const spec = typedSpec();
    spec.results[0].expression = "amount * enabled";
    let reservations = 0;
    await withFetch(async (url) => {
        const path = String(url);
        if (path.endsWith("/auth/v1/user")) return response({ id: "user-123" });
        if (path.endsWith("/rest/v1/rpc/get_worth_it_ugc_runtime_spec")) return response({ spec, usage_price_milli: 250 });
        if (path.endsWith("/rest/v1/rpc/calc_wallet_reserve")) reservations++;
        throw new Error("Unexpected request: " + path);
    }, async () => {
        const result = await onRequestPost({ request: makeRequest(body()), env: config() });
        const data = await result.json();
        assert.equal(result.status, 422);
        assert.equal(data.code, "INVALID_STORED_CALCULATOR");
        assert.equal(reservations, 0);
    });
});

test("V2 runtime refunds a CALC reservation when settlement cannot be confirmed", async () => {
    const spec = typedSpec();
    const calls = [];
    await withFetch(async (url, options) => {
        const path = String(url);
        calls.push(path);
        if (path.endsWith("/auth/v1/user")) return response({ id: "user-123" });
        if (path.endsWith("/rest/v1/rpc/get_worth_it_ugc_runtime_spec")) return response({ spec, usage_price_milli: 250 });
        if (path.endsWith("/rest/v1/rpc/calc_wallet_reserve")) return response({ ok: true, usage_price_milli: 250 });
        if (path.endsWith("/rest/v1/rpc/calc_wallet_settle")) return response({ ok: false });
        if (path.endsWith("/rest/v1/rpc/calc_wallet_refund")) return response({ ok: true, refunded: true });
        throw new Error("Unexpected request: " + path);
    }, async () => {
        const result = await onRequestPost({ request: makeRequest(body()), env: config() });
        const data = await result.json();
        assert.equal(result.status, 502);
        assert.equal(data.code, "CALC_SETTLEMENT_FAILED");
        assert.ok(calls.some(path => path.endsWith("/rpc/calc_wallet_refund")));
    });
});

test("V2 runtime fails closed when the service secret or user session is unavailable", async () => {
    const noSecret = await onRequestPost({
        request: makeRequest(body()),
        env: { SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable" }
    });
    assert.equal(noSecret.status, 503);
    assert.equal((await noSecret.json()).code, "CALCULATOR_RUNTIME_NOT_CONFIGURED");

    const noSession = await onRequestPost({
        request: makeRequest(body(), { token: null }),
        env: config()
    });
    assert.equal(noSession.status, 401);
});

test("V2 runtime accepts legacy service-role JWTs with both service headers", async () => {
    const legacyKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature";
    const spec = typedSpec();
    await withFetch(async (url, options) => {
        const path = String(url);
        if (path.endsWith("/auth/v1/user")) return response({ id: "user-123" });
        if (path.endsWith("/rest/v1/rpc/get_worth_it_ugc_runtime_spec")) {
            assert.equal(options.headers.get("apikey"), legacyKey);
            assert.equal(options.headers.get("Authorization"), "Bearer " + legacyKey);
            return response({ spec, usage_price_milli: 250 });
        }
        if (path.endsWith("/rest/v1/rpc/calc_wallet_reserve")) return response({ ok: true, usage_price_milli: 250 });
        if (path.endsWith("/rest/v1/rpc/calc_wallet_settle")) return response({ ok: true });
        throw new Error("Unexpected request: " + path);
    }, async () => {
        const result = await onRequestPost({ request: makeRequest(body()), env: config(legacyKey) });
        assert.equal(result.status, 200);
    });
});

test("V2 runtime rejects cross-origin calls and provides a same-origin preflight response", async () => {
    const denied = await onRequestPost({
        request: makeRequest(body(), { origin: "https://attacker.example" }),
        env: config()
    });
    assert.equal(denied.status, 403);

    const preflight = await onRequestOptions({
        request: new Request(origin + "/api/ugc-calculator-run", { method: "OPTIONS", headers: { Origin: origin } })
    });
    assert.equal(preflight.status, 200);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
});
