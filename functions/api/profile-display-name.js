const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const CHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISPLAY_NAME_LENGTH = 32;

function json(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
    });
}

function getConfig(env) {
    return {
        supabaseUrl: String(env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
        publishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || "").trim(),
        serviceKey: String(env.supabase_secret_key || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
    };
}

function getToken(request) {
    const authorization = request.headers.get("Authorization") || "";
    return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function serviceHeaders(config, extra) {
    const headers = { "apikey": config.serviceKey };
    if (!config.serviceKey.startsWith("sb_secret_")) headers.Authorization = "Bearer " + config.serviceKey;
    return Object.assign(headers, extra || {});
}

function isSetupError(details) {
    return /display_name_changed_at|update_worth_it_display_name|schema cache|could not find the function|column .* does not exist|function .* does not exist/i.test(String(details || ""));
}

function setupError() {
    return json({
        success: false,
        code: "DISPLAY_NAME_SETUP_REQUIRED",
        error: "Display-name editing needs a one-time database setup. Run supabase/display-name-editing.sql in the Supabase SQL Editor, then try again."
    }, 503);
}

async function verifyUser(config, token) {
    const response = await fetch(config.supabaseUrl + "/auth/v1/user", {
        headers: { "apikey": config.publishableKey, "Authorization": "Bearer " + token, "Accept": "application/json" }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? user : null;
}

function validDisplayName(value) {
    const name = String(value || "").trim();
    const length = Array.from(name).length;
    return length >= 1 && length <= MAX_DISPLAY_NAME_LENGTH && !/[\x00-\x1F\x7F]/.test(name);
}

async function readProfile(config, userId) {
    const url = config.supabaseUrl + "/rest/v1/worth_it_profiles?user_id=eq." +
        encodeURIComponent(userId) + "&select=user_id,display_name,display_name_changed_at";
    const response = await fetch(url, { headers: serviceHeaders(config, { "Accept": "application/json" }) });
    const details = await response.text().catch(() => "");
    if (!response.ok) {
        console.error("Display-name profile read failed:", response.status, details.slice(0, 400));
        if (isSetupError(details)) return { setupMissing: true };
        throw new Error("Could not load display-name settings. Please try again later.");
    }
    let rows;
    try { rows = JSON.parse(details); } catch (_) { throw new Error("Could not load display-name settings. Please try again later."); }
    return { profile: Array.isArray(rows) ? rows[0] || null : null };
}

async function authorizedUser(request, config) {
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceKey) {
        return { error: json({ success: false, error: "The profile service is not configured yet." }, 503) };
    }
    const token = getToken(request);
    if (!token) return { error: json({ success: false, error: "Please sign in to change your display name." }, 401) };
    const user = await verifyUser(config, token);
    if (!user) return { error: json({ success: false, error: "Your login session has expired. Please sign in again." }, 401) };
    return { user };
}

function makeStatus(profile) {
    if (!profile) return json({ success: false, error: "Your Worth It profile could not be found." }, 404);
    const changed = Date.parse(profile.display_name_changed_at || "");
    const nextMs = Number.isFinite(changed) ? changed + CHANGE_WINDOW_MS : 0;
    const remaining = nextMs - Date.now();
    return json({
        success: true,
        display_name: String(profile.display_name || ""),
        changed_at: Number.isFinite(changed) ? new Date(changed).toISOString() : null,
        can_change: !Number.isFinite(changed) || remaining <= 0,
        next_change_at: Number.isFinite(changed) && remaining > 0 ? new Date(nextMs).toISOString() : null,
        remaining_ms: Number.isFinite(changed) ? Math.max(0, remaining) : 0
    });
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
    });
}

export async function onRequestGet(context) {
    const request = context.request, config = getConfig(context.env);
    try {
        const origin = request.headers.get("Origin") || "";
        if (origin && origin !== SITE_ORIGIN) return json({ success: false, error: "Forbidden origin." }, 403);
        const auth = await authorizedUser(request, config);
        if (auth.error) return auth.error;
        const result = await readProfile(config, auth.user.id);
        if (result.setupMissing) return setupError();
        return makeStatus(result.profile);
    } catch (error) {
        console.error("Display-name status request failed:", error);
        return json({ success: false, error: error?.message || "Could not load display-name settings." }, 500);
    }
}

export async function onRequestPost(context) {
    const request = context.request, config = getConfig(context.env);
    try {
        const origin = request.headers.get("Origin") || "";
        if (origin && origin !== SITE_ORIGIN) return json({ success: false, error: "Forbidden origin." }, 403);
        const auth = await authorizedUser(request, config);
        if (auth.error) return auth.error;
        let body;
        try { body = await request.json(); } catch (_) { return json({ success: false, error: "Invalid request body." }, 400); }
        const name = String(body?.display_name || "").trim();
        if (!validDisplayName(name)) {
            return json({ success: false, code: "INVALID_DISPLAY_NAME", error: "Enter a display name containing 1–32 characters. Control characters are not allowed." }, 400);
        }
        const response = await fetch(config.supabaseUrl + "/rest/v1/rpc/update_worth_it_display_name", {
            method: "POST",
            headers: serviceHeaders(config, { "Content-Type": "application/json", "Accept": "application/json" }),
            body: JSON.stringify({ p_user_id: auth.user.id, p_display_name: name })
        });
        const details = await response.text().catch(() => "");
        if (!response.ok) {
            console.error("Display-name update RPC failed:", response.status, details.slice(0, 400));
            if (isSetupError(details)) return setupError();
            return json({ success: false, error: "Could not save your display name. Please try again later." }, 500);
        }
        let result;
        try { result = JSON.parse(details); } catch (_) { return json({ success: false, error: "Could not read the update result." }, 500); }
        if (result?.success) return json(result);
        if (result?.code === "DISPLAY_NAME_COOLDOWN") return json(result, 429);
        if (result?.code === "INVALID_DISPLAY_NAME") return json(result, 400);
        if (result?.code === "PROFILE_NOT_FOUND") return json(result, 404);
        return json(result && typeof result === "object" ? result : { success: false, error: "Could not save your display name." }, 400);
    } catch (error) {
        console.error("Display-name update request failed:", error);
        return json({ success: false, error: error?.message || "Could not save your display name." }, 500);
    }
}
