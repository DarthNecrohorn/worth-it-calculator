const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        }
    });
}
function tokenFrom(request) {
    const value = request.headers.get("Authorization") || "";
    return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
async function verifyUser(env, token) {
    const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const key = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
    if (!url || !key) throw new Error("Supabase is not configured.");
    const response = await fetch(url + "/auth/v1/user", {
        headers: { apikey: key, Authorization: "Bearer " + token, Accept: "application/json" }
    });
    if (!response.ok) return null;
    return response.json();
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": SITE_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    }});
}
export async function onRequestPost({ request, env }) {
    try {
        const origin = request.headers.get("Origin") || "";
        if (origin && origin !== SITE_ORIGIN) return json({ error: "Forbidden origin." }, 403);
        const token = tokenFrom(request);
        if (!token) return json({ error: "Sign in to report a user." }, 401);
        const user = await verifyUser(env, token);
        if (!user?.id) return json({ error: "Your session is invalid or expired." }, 401);
        if (!(user.email_confirmed_at || user.confirmed_at)) {
            return json({ error: "Confirm your email before reporting users.", code: "EMAIL_NOT_CONFIRMED" }, 403);
        }
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
        const targetId = Number(body?.target_worth_it_id);
        const reason = String(body?.reason || "").trim();
        const details = String(body?.details || "").trim();
        if (!Number.isSafeInteger(targetId) || targetId < 1) return json({ error: "Invalid profile." }, 400);
        if (details.length > 1000) return json({ error: "Details must be 1,000 characters or fewer." }, 400);

        const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
        const key = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
        const response = await fetch(url + "/rest/v1/rpc/submit_worth_it_user_report", {
            method: "POST",
            headers: {
                apikey: key, Authorization: "Bearer " + token,
                "Content-Type": "application/json", Accept: "application/json"
            },
            body: JSON.stringify({
                p_target_worth_it_id: targetId,
                p_reason: reason,
                p_details: details
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = String(result.message || result.details || "");
            if (response.status === 401 || response.status === 403 || result.code === "42501") {
                return json({ error: "Confirm your email and sign in before reporting users.", code: "EMAIL_NOT_CONFIRMED" }, 403);
            }
            if (result.code === "P0001") return json({ error: "Daily report limit reached. You can submit up to five reports per day.", code: "REPORT_DAILY_LIMIT" }, 429);
            if (result.code === "23505") return json({ error: "You have already reported this user today.", code: "REPORT_DUPLICATE" }, 409);
            if (result.code === "P0002") return json({ error: "This profile could not be found." }, 404);
            if (result.code === "22023") return json({ error: message || "Please check the report details." }, 400);
            console.error("User report RPC failed:", response.status, result.code || "unknown");
            return json({ error: "Could not submit this report. Please try again later." }, 500);
        }
        return json({ success: true, reports_remaining: Number(result?.reports_remaining ?? 0) }, 200);
    } catch (error) {
        console.error("User report request failed:", error);
        return json({ error: "The reporting service is temporarily unavailable." }, 503);
    }
}
