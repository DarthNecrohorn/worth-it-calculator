const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const USERNAME_PATTERN = /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?$/;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;

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

function configFrom(env) {
    return {
        url: String(env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
        publicKey: String(env.SUPABASE_PUBLISHABLE_KEY || "").trim(),
        serviceKey: String(env.supabase_secret_key || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
    };
}

function tokenFrom(request) {
    const header = request.headers.get("Authorization") || "";
    return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function serviceHeaders(config, extra) {
    const headers = { apikey: config.serviceKey };
    if (!config.serviceKey.startsWith("sb_secret_")) headers.Authorization = "Bearer " + config.serviceKey;
    return Object.assign(headers, extra || {});
}

async function verifyUser(config, token) {
    if (!config.url || !config.publicKey || !config.serviceKey) return { setupError: true };
    if (!token) return { response: json({ success: false, error: "Please sign in to manage your username." }, 401) };
    const response = await fetch(config.url + "/auth/v1/user", {
        headers: { apikey: config.publicKey, Authorization: "Bearer " + token, Accept: "application/json" }
    });
    if (!response.ok) return { response: json({ success: false, error: "Your login session has expired. Please sign in again." }, 401) };
    const user = await response.json();
    if (!user || !user.id) return { response: json({ success: false, error: "Please sign in to manage your username." }, 401) };
    return { user };
}

function usernameValidation(input) {
    const username = String(input || "").trim();
    if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH || !USERNAME_PATTERN.test(username)) {
        return { ok: false, error: "Username must be 3–20 characters, using English letters and numbers, with at most one underscore between them." };
    }
    const normalized = username.toLowerCase().replace(/_/g, "").replace(/[01345789]/g, character => ({
        "0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","8":"b","9":"g"
    }[character] || character));
    const banned = [
        "fuck","shit","bitch","cunt","dick","cock","pussy","whore","slut","bastard",
        "asshole","arsehole","motherfucker","bullshit","dumbass","jackass","nigger",
        "nigga","faggot","retard","retarded","pedo","pedophile","porn","xxx","blowjob",
        "handjob","jizz","rape","rapist","nazi","hitler","kkk"
    ];
    if (banned.some(term => normalized.includes(term))) {
        return { ok: false, error: "This username contains language that isn't allowed on Worth It." };
    }
    const reserved = ["admin","administrator","moderator","mod","staff","support","official","security","owner","root","worthit"];
    if (reserved.some(prefix => normalized === prefix || (normalized.startsWith(prefix) && /^[0-9]+$/.test(normalized.slice(prefix.length))))) {
        return { ok: false, error: "This username is reserved and cannot be used." };
    }
    if ((username.match(/[0-9]/g) || []).length >= 7) {
        return { ok: false, error: "Usernames cannot contain phone numbers or other long numeric identifiers." };
    }
    return { ok: true, username };
}

function setupRequired() {
    return json({
        success: false,
        code: "USERNAME_SETTINGS_SETUP_REQUIRED",
        error: "Username changes need the database setup. Run supabase/username-change-settings.sql in the Supabase SQL Editor, then reload Settings."
    }, 503);
}

function isSetupFailure(details) {
    return /username_changed_at|update_worth_it_username|schema cache|could not find the function|column .* does not exist|function .* does not exist|relation .*usernames.* does not exist|permission denied|insufficient privilege/i.test(String(details || ""));
}

async function getUsernameRow(config, userId) {
    const url = config.url + "/rest/v1/usernames?user_id=eq." + encodeURIComponent(userId) + "&select=username,username_changed_at";
    const response = await fetch(url, {
        headers: serviceHeaders(config, { Accept: "application/json" })
    });
    const details = await response.text().catch(() => "");
    if (!response.ok) {
        if (isSetupFailure(details)) return { setupMissing: true };
        console.error("Username settings read failed:", response.status, details.slice(0, 300));
        throw new Error("Could not load username settings. Please try again later.");
    }
    let rows;
    try { rows = JSON.parse(details); } catch (_) { throw new Error("Could not read username settings."); }
    return { row: Array.isArray(rows) ? rows[0] || null : null };
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
    const request = context.request;
    const origin = request.headers.get("Origin") || "";
    if (origin && origin !== SITE_ORIGIN) return json({ success: false, error: "Forbidden origin." }, 403);

    const config = configFrom(context.env);
    const auth = await verifyUser(config, tokenFrom(request));
    if (auth.setupError) return setupRequired();
    if (auth.response) return auth.response;

    try {
        const result = await getUsernameRow(config, auth.user.id);
        if (result.setupMissing) return setupRequired();
        const row = result.row;
        const confirmed = Boolean(auth.user.email_confirmed_at);
        const changedAt = row && row.username_changed_at ? Date.parse(row.username_changed_at) : NaN;
        const nextAt = Number.isFinite(changedAt) ? changedAt + 14 * 24 * 60 * 60 * 1000 : 0;
        const remaining = nextAt - Date.now();
        return json({
            success: true,
            username: String(auth.user.user_metadata?.username || row?.username || ""),
            email: String(auth.user.email || ""),
            email_verified: confirmed,
            username_changed_at: Number.isFinite(changedAt) ? new Date(changedAt).toISOString() : null,
            can_change: confirmed && (!Number.isFinite(changedAt) || remaining <= 0),
            next_change_at: Number.isFinite(changedAt) && remaining > 0 ? new Date(nextAt).toISOString() : null,
            remaining_ms: Number.isFinite(changedAt) ? Math.max(0, remaining) : 0
        });
    } catch (error) {
        console.error("Username settings status failed:", error);
        return json({ success: false, error: "Could not load username settings. Please try again later." }, 500);
    }
}

export async function onRequestPost(context) {
    const request = context.request;
    const origin = request.headers.get("Origin") || "";
    if (origin && origin !== SITE_ORIGIN) return json({ success: false, error: "Forbidden origin." }, 403);

    const config = configFrom(context.env);
    const auth = await verifyUser(config, tokenFrom(request));
    if (auth.setupError) return setupRequired();
    if (auth.response) return auth.response;
    if (!auth.user.email_confirmed_at) {
        return json({
            success: false,
            code: "EMAIL_VERIFICATION_REQUIRED",
            error: "Verify your email address before changing your username."
        }, 403);
    }

    let body;
    try { body = await request.json(); } catch (_) { return json({ success: false, error: "Invalid request body." }, 400); }
    const validation = usernameValidation(body?.username);
    if (!validation.ok) return json({ success: false, code: "INVALID_USERNAME", error: validation.error }, 400);

    try {
        const response = await fetch(config.url + "/rest/v1/rpc/update_worth_it_username", {
            method: "POST",
            headers: serviceHeaders(config, { "Content-Type": "application/json", Accept: "application/json" }),
            body: JSON.stringify({ p_user_id: auth.user.id, p_username: validation.username })
        });
        const details = await response.text().catch(() => "");
        if (!response.ok) {
            if (isSetupFailure(details)) return setupRequired();
            console.error("Username update RPC failed:", response.status, details.slice(0, 400));
            return json({ success: false, error: "Could not save your username. Please try again later." }, 500);
        }
        let result;
        try { result = JSON.parse(details); } catch (_) { return json({ success: false, error: "Could not read the username update result." }, 500); }
        if (result?.success) return json(result);
        if (result?.code === "USERNAME_COOLDOWN") return json(result, 429);
        if (result?.code === "USERNAME_TAKEN") return json(result, 409);
        if (result?.code === "EMAIL_VERIFICATION_REQUIRED") return json(result, 403);
        if (result?.code === "INVALID_USERNAME") return json(result, 400);
        return json(result && typeof result === "object" ? result : { success: false, error: "Could not save your username." }, 400);
    } catch (error) {
        console.error("Username update failed:", error);
        return json({ success: false, error: "Could not save your username. Please try again later." }, 500);
    }
}
