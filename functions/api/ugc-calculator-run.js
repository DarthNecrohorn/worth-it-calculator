import "../../ugc-calculator-currency-data.js";
import "../../ugc-calculator-engine.js";
import { validateCalculatorForServer } from "../lib/ugc-calculator-validation.js";

const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const MAX_BODY_CHARS = 65536;
const engineApi = globalThis.WorthItCalculatorEngine;
const currencyData = globalThis.WorthItCalculatorCurrencyData;
if (engineApi?.apiVersion !== 1 || !currencyData?.currencies || !currencyData?.historicalCurrencies) {
    throw new Error("The shared Worth It calculator engine or currency metadata could not be loaded.");
}
const ENGINE = engineApi.create(currencyData);

function responseJson(body, status, origin) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "Access-Control-Allow-Origin": origin || SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Vary": "Origin"
        }
    });
}

function allowedOrigin(request) {
    const origin = request.headers.get("Origin") || "";
    if (!origin) return { allowed: true, origin: SITE_ORIGIN };
    try {
        const requestOrigin = new URL(request.url).origin;
        return { allowed: origin === requestOrigin || origin === SITE_ORIGIN, origin: origin === requestOrigin || origin === SITE_ORIGIN ? origin : SITE_ORIGIN };
    } catch (_) {
        return { allowed: false, origin: SITE_ORIGIN };
    }
}

function namedKey(value) {
    if (typeof value === "string") {
        const raw = value.trim();
        if (!raw) return "";
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                const selected = parsed.default;
                return typeof selected === "string" ? selected.trim() : "";
            }
        } catch (_) {}
        return raw;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return typeof value.default === "string" ? value.default.trim() : "";
    }
    return "";
}

function getConfig(env) {
    return {
        base: String(env.SUPABASE_URL || "").trim().replace(/\/+$/, ""),
        publishableKey:
            namedKey(env.SUPABASE_PUBLISHABLE_KEY) ||
            namedKey(env.SUPABASE_PUBLISHABLE_KEYS) ||
            namedKey(env.SUPABASE_ANON_KEY),
        serviceKey:
            namedKey(env.supabase_secret_key) ||
            namedKey(env.SUPABASE_SECRET_KEY) ||
            namedKey(env.SUPABASE_SERVICE_ROLE_KEY) ||
            namedKey(env.SUPABASE_SECRET_KEYS)
    };
}

function bearerToken(request) {
    const header = request.headers.get("Authorization") || "";
    const match = header.match(/^Bearer\s+(\S+)$/i);
    return match ? match[1] : "";
}

async function readJson(response) {
    return response.json().catch(() => null);
}

async function verifyUser(config, token) {
    const response = await fetch(config.base + "/auth/v1/user", {
        method: "GET",
        headers: {
            apikey: config.publishableKey,
            Authorization: "Bearer " + token,
            Accept: "application/json"
        },
        cache: "no-store"
    });
    const data = await readJson(response);
    if (!response.ok || !data?.id) return null;
    return data;
}

function normalizeRpcObject(value) {
    return Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === "object"
        ? value[0]
        : value;
}

async function rpc(config, functionName, payload, options = {}) {
    const admin = options.admin === true;
    const key = admin ? config.serviceKey : config.publishableKey;
    const headers = new Headers({
        apikey: key,
        "Content-Type": "application/json",
        Accept: "application/json"
    });
    if (admin) {
        // New Supabase secret keys are opaque API keys, not JWTs.
        if (!key.startsWith("sb_secret_")) headers.set("Authorization", "Bearer " + key);
    } else {
        headers.set("Authorization", "Bearer " + options.token);
    }
    const response = await fetch(config.base + "/rest/v1/rpc/" + encodeURIComponent(functionName), {
        method: "POST",
        headers,
        body: JSON.stringify(payload || {}),
        cache: "no-store"
    });
    const data = await readJson(response);
    if (!response.ok) {
        const error = new Error(String(data?.message || data?.details || data?.hint || "The calculator service could not complete this request."));
        error.status = response.status;
        error.code = String(data?.code || "");
        throw error;
    }
    return normalizeRpcObject(data);
}

function executableSpec(storedSpec) {
    if (!storedSpec || typeof storedSpec !== "object" || Array.isArray(storedSpec)) {
        throw new Error("The stored V2 calculator definition is unavailable.");
    }
    if (storedSpec.schemaVersion !== 2 || storedSpec.engineVersion !== 2) {
        throw new Error("Only an exact V2 typed calculator can use server calculation.");
    }
    const spec = { ...storedSpec };
    delete spec.assumptions;
    delete spec.subcategories;
    return spec;
}

function normalizeRuntimeInputs(spec, rawValues, rawGroups) {
    const source = rawValues === undefined || rawValues === null ? {} : rawValues;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new Error("Calculator input values must be an object.");
    }
    const defaults = ENGINE.createDefaultTypedValues(spec);
    if (defaults?.valid !== true) throw new Error("The stored calculator has invalid default input values.");
    const definitions = new Map((spec.inputs || []).map(input => [input.key, input]));
    Object.keys(source).forEach(key => {
        if (!definitions.has(key)) throw new Error("Unknown calculator input: " + key + ".");
    });
    const values = { ...defaults.values };
    Object.entries(source).forEach(([key, rawValue]) => {
        const definition = definitions.get(key);
        // The member runtime sends actual JSON numbers, not numeric strings.
        if (definition.type === "number" && typeof rawValue !== "number") {
            throw new Error(String(definition.label || key) + " must use a JSON number value.");
        }
        const normalized = ENGINE.normalizeTypedValue(definition, rawValue);
        if (normalized?.valid !== true) {
            throw new Error(String(definition.label || key) + ": " + String(normalized?.error || "Invalid value."));
        }
        values[key] = normalized.value;
    });
    const normalizedGroups = ENGINE.normalizeTypedGroupValues(spec, rawGroups);
    if (normalizedGroups?.valid !== true) {
        throw new Error((normalizedGroups?.errors || ["Dynamic group values are invalid."]).slice(0, 3).join(" "));
    }
    return { values, groups: normalizedGroups.groups };
}

function publicResult(item, definition) {
    return {
        key: item.key,
        label: item.label,
        value: item.value,
        format: definition.format || "number",
        currency: definition.currency || "",
        unit: definition.unit || "",
        prefix: definition.prefix || "",
        suffix: definition.suffix || "",
        explanation: String(definition.explanation || "")
    };
}

async function refundReservation(config, token, requestId) {
    try {
        const result = await rpc(config, "calc_wallet_refund", { p_request_id: requestId }, { token });
        return result?.ok === true;
    } catch (_) {
        return false;
    }
}

export async function onRequestOptions(context) {
    const access = allowedOrigin(context.request);
    if (!access.allowed) return responseJson({ success: false, error: "Origin not allowed." }, 403, access.origin);
    return responseJson({ success: true }, 200, access.origin);
}

export async function onRequestPost(context) {
    const request = context.request;
    const access = allowedOrigin(request);
    if (!access.allowed) return responseJson({ success: false, error: "Origin not allowed." }, 403, access.origin);
    if (request.method !== "POST") return responseJson({ success: false, error: "Method not allowed." }, 405, access.origin);

    const config = getConfig(context.env || {});
    if (!config.base || !config.publishableKey || !config.serviceKey) {
        return responseJson({
            success: false,
            code: "CALCULATOR_RUNTIME_NOT_CONFIGURED",
            error: "Server calculation is not configured for this environment."
        }, 503, access.origin);
    }

    const token = bearerToken(request);
    if (!token) return responseJson({ success: false, code: "AUTH_REQUIRED", error: "Sign in to calculate." }, 401, access.origin);

    let rawBody;
    try {
        rawBody = await request.text();
    } catch (_) {
        return responseJson({ success: false, code: "INVALID_REQUEST", error: "The calculator request could not be read." }, 400, access.origin);
    }
    if (!rawBody || rawBody.length > MAX_BODY_CHARS) {
        return responseJson({ success: false, code: "REQUEST_TOO_LARGE", error: "The calculator request is empty or too large." }, 413, access.origin);
    }

    let body;
    try {
        body = JSON.parse(rawBody);
    } catch (_) {
        return responseJson({ success: false, code: "INVALID_JSON", error: "The calculator request must be valid JSON." }, 400, access.origin);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return responseJson({ success: false, code: "INVALID_REQUEST", error: "The calculator request must be an object." }, 400, access.origin);
    }
    const unexpected = Object.keys(body).filter(key => !["calculator_id", "values", "groups"].includes(key));
    if (unexpected.length) {
        return responseJson({ success: false, code: "UNSUPPORTED_REQUEST_FIELD", error: "The calculator request contains unsupported fields." }, 400, access.origin);
    }
    const calculatorId = String(body.calculator_id || "").toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(calculatorId)) {
        return responseJson({ success: false, code: "INVALID_CALCULATOR_ID", error: "The calculator ID is invalid." }, 400, access.origin);
    }

    let user;
    try {
        user = await verifyUser(config, token);
    } catch (_) {
        return responseJson({ success: false, code: "AUTH_UNAVAILABLE", error: "Your account could not be verified right now." }, 502, access.origin);
    }
    if (!user?.id) {
        return responseJson({ success: false, code: "INVALID_SESSION", error: "Your login session has expired. Please sign in again." }, 401, access.origin);
    }

    let runtime;
    try {
        runtime = await rpc(config, "get_worth_it_ugc_runtime_spec", {
            p_id: calculatorId,
            p_user_id: user.id
        }, { admin: true });
    } catch (error) {
        const status = error.status === 404 || error.code === "P0002" ? 404 : 502;
        return responseJson({
            success: false,
            code: status === 404 ? "CALCULATOR_NOT_AVAILABLE" : "CALCULATOR_LOOKUP_FAILED",
            error: status === 404 ? "This calculator is not available to this account." : "The calculator could not be loaded for server calculation."
        }, status, access.origin);
    }

    let spec;
    try {
        spec = executableSpec(runtime?.spec);
        const validation = validateCalculatorForServer(ENGINE, spec);
        if (validation.valid !== true) {
            return responseJson({
                success: false,
                code: "INVALID_STORED_CALCULATOR",
                error: "The stored calculator definition failed server validation."
            }, 422, access.origin);
        }
    } catch (error) {
        return responseJson({
            success: false,
            code: "INVALID_STORED_CALCULATOR",
            error: String(error?.message || "The stored calculator definition failed server validation.")
        }, 422, access.origin);
    }

    let normalizedInputs;
    try {
        normalizedInputs = normalizeRuntimeInputs(spec, body.values, body.groups);
    } catch (error) {
        return responseJson({
            success: false,
            code: "INVALID_CALCULATOR_INPUT",
            error: String(error?.message || "The calculator inputs are invalid.")
        }, 422, access.origin);
    }

    const requestId = crypto.randomUUID();
    let reservation;
    try {
        reservation = await rpc(config, "calc_wallet_reserve", {
            p_request_id: requestId,
            p_reason: "calculator",
            p_calculator_id: calculatorId
        }, { token });
    } catch (_) {
        return responseJson({ success: false, code: "CALC_RESERVATION_FAILED", error: "Could not reserve CALC for this calculation." }, 502, access.origin);
    }
    if (!reservation?.ok) {
        const insufficient = reservation?.code === "INSUFFICIENT_CALC";
        return responseJson({
            success: false,
            code: insufficient ? "INSUFFICIENT_CALC" : "CALC_RESERVATION_FAILED",
            error: insufficient ? "Not enough CALC to run this calculator." : "Could not reserve CALC for this calculation.",
            required: reservation?.required,
            balance: reservation?.balance
        }, insufficient ? 402 : 409, access.origin);
    }

    let evaluation;
    let scenarios;
    try {
        evaluation = ENGINE.evaluateV2TypedResults(spec, normalizedInputs.values, normalizedInputs.groups);
        scenarios = (Array.isArray(spec.scenarios) ? spec.scenarios : []).map(scenario => {
            const values = { ...evaluation.values, ...(scenario.values || {}) };
            const result = ENGINE.evaluateV2TypedResults(spec, values, evaluation.groups);
            return {
                label: String(scenario.label || "Alternative"),
                results: result.results.map((item, index) => publicResult(item, spec.results[index]))
            };
        });
    } catch (error) {
        const refunded = await refundReservation(config, token, requestId);
        return responseJson({
            success: false,
            code: refunded ? "CALCULATION_FAILED" : "CALCULATION_FAILED_REFUND_PENDING",
            error: refunded
                ? String(error?.message || "The calculator could not complete this calculation.")
                : "The calculator could not complete this calculation and its CALC refund could not be confirmed."
        }, refunded ? 422 : 502, access.origin);
    }

    try {
        const settled = await rpc(config, "calc_wallet_settle", { p_request_id: requestId }, { token });
        if (!settled?.ok) throw new Error("The CALC transaction could not be confirmed.");
    } catch (_) {
        await refundReservation(config, token, requestId);
        return responseJson({ success: false, code: "CALC_SETTLEMENT_FAILED", error: "The calculation finished, but its CALC transaction could not be confirmed." }, 502, access.origin);
    }

    return responseJson({
        success: true,
        calculator_id: calculatorId,
        usage_price_milli: Number(reservation.usage_price_milli) || Number(runtime.usage_price_milli) || 100,
        results: evaluation.results.map((item, index) => publicResult(item, spec.results[index])),
        scenario_comparisons: scenarios
    }, 200, access.origin);
}
