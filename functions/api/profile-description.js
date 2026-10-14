const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const CHANGE_WINDOW_MS = 10 * 60 * 1000;
const MAX_DESCRIPTION_LENGTH = 500;

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
function getToken(request) {
    const authorization = request.headers.get("Authorization") || "";
    return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}
function getConfig(env) {
    return {
        supabaseUrl: String(env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
        publishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || "").trim(),
        serviceKey: String(env.supabase_secret_key || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
    };
}
function serviceHeaders(config, extra) {
    const headers = { apikey: config.serviceKey };
    if (!config.serviceKey.startsWith("sb_secret_")) headers.Authorization = "Bearer " + config.serviceKey;
    return Object.assign(headers, extra || {});
}
function isSetupError(details) {
    return /(description|update_worth_it_profile_description|schema cache|could not find the function|column .* does not exist|function .* does not exist)/i.test(String(details || ""));
}
function setupError() {
    return json({
        success: false,
        code: "PROFILE_DESCRIPTION_SETUP_REQUIRED",
        error: "Profile description saving needs a one-time database setup. Run supabase/profile-description.sql in the Supabase SQL Editor, then try again."
    }, 503);
}
async function verifyUser(config, token) {
    const response = await fetch(config.supabaseUrl + "/auth/v1/user", {
        headers: { apikey: config.publishableKey, Authorization: "Bearer " + token, Accept: "application/json" }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? user : null;
}
async function authorizedUser(request, config) {
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceKey) {
        return { error: json({ success: false, error: "The profile service is not configured yet." }, 503) };
    }
    const token = getToken(request);
    if (!token) return { error: json({ success: false, error: "Please sign in to edit your profile description." }, 401) };
    const user = await verifyUser(config, token);
    if (!user) return { error: json({ success: false, error: "Your login session has expired. Please sign in again." }, 401) };
    return { user };
}
async function readProfile(config, userId) {
    const url = config.supabaseUrl + "/rest/v1/worth_it_profiles?user_id=eq." +
        encodeURIComponent(userId) + "&select=user_id,worth_it_id,description,description_changed_at";
    const response = await fetch(url, { headers: serviceHeaders(config, { Accept: "application/json" }) });
    const details = await response.text().catch(() => "");
    if (!response.ok) {
        console.error("Profile description read failed:", response.status, details.slice(0, 400));
        if (isSetupError(details)) return { setupMissing: true };
        throw new Error("Could not load your profile description. Please try again later.");
    }
    let rows;
    try { rows = JSON.parse(details); } catch (_) { throw new Error("Could not read your profile description."); }
    return { profile: Array.isArray(rows) ? rows[0] || null : null };
}
function makeStatus(profile) {
    if (!profile) return json({ success: false, error: "Your Worth It profile could not be found." }, 404);
    const changed = Date.parse(profile.description_changed_at || "");
    const nextMs = Number.isFinite(changed) ? changed + CHANGE_WINDOW_MS : 0;
    const remaining = nextMs - Date.now();
    return json({
        success: true,
        description: String(profile.description || ""),
        changed_at: Number.isFinite(changed) ? new Date(changed).toISOString() : null,
        can_save: !Number.isFinite(changed) || remaining <= 0,
        next_save_at: Number.isFinite(changed) && remaining > 0 ? new Date(nextMs).toISOString() : null,
        remaining_ms: Number.isFinite(changed) ? Math.max(0, remaining) : 0
    });
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": SITE_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }});
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
        console.error("Profile description status request failed:", error);
        return json({ success: false, error: error?.message || "Could not load the description save limit." }, 500);
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
        if (typeof body?.description !== "string") return json({ success: false, code: "INVALID_DESCRIPTION", error: "Enter a profile description first." }, 400);
        const description = body.description.trim();
        if (Array.from(description).length > MAX_DESCRIPTION_LENGTH) {
            return json({ success: false, code: "INVALID_DESCRIPTION", error: "Your description can contain up to 500 characters." }, 400);
        }
        const response = await fetch(config.supabaseUrl + "/rest/v1/rpc/update_worth_it_profile_description", {
            method: "POST",
            headers: serviceHeaders(config, { "Content-Type": "application/json", Accept: "application/json" }),
            body: JSON.stringify({ p_user_id: auth.user.id, p_description: description })
        });
        const details = await response.text().catch(() => "");
        if (!response.ok) {
            console.error("Profile description save RPC failed:", response.status, details.slice(0, 400));
            if (isSetupError(details)) return setupError();
            return json({ success: false, error: "Could not save your description. Please try again later." }, 500);
        }
        let result;
        try { result = JSON.parse(details); } catch (_) { return json({ success: false, error: "Could not read the saved description." }, 500); }
        if (result?.success) return json(result);
        if (result?.code === "PROFILE_DESCRIPTION_COOLDOWN") return json(result, 429);
        if (result?.code === "INVALID_DESCRIPTION") return json(result, 400);
        if (result?.code === "PROFILE_NOT_FOUND") return json(result, 404);
        return json(result && typeof result === "object" ? result : { success: false, error: "Could not save your description." }, 400);
    } catch (error) {
        console.error("Profile description save request failed:", error);
        return json({ success: false, error: error?.message || "Could not save your description." }, 500);
    }
}
