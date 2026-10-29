const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ADMIN_EMAIL = "pedjasebez3545@gmail.com";
function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: {
        "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": SITE_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
    }});
}
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": SITE_ORIGIN,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
    }});
}
export async function onRequestGet({ request, env }) {
    try {
        const origin = request.headers.get("Origin") || "";
        if (origin && origin !== SITE_ORIGIN) return json({ error: "Forbidden origin." }, 403);
        const authorization = request.headers.get("Authorization") || "";
        if (!/^Bearer\s+\S+/i.test(authorization)) return json({ error: "Unauthorized." }, 401);
        const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
        const key = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
        if (!url || !key) return json({ error: "Supabase is not configured." }, 503);
        const userResponse = await fetch(url + "/auth/v1/user", {
            headers: { apikey: key, Authorization: authorization, Accept: "application/json" }
        });
        if (!userResponse.ok) return json({ error: "Invalid or expired session." }, 401);
        const user = await userResponse.json();
        if (!(user.email_confirmed_at || user.confirmed_at)) return json({ error: "Email confirmation is required." }, 403);
        if (String(user.email || "").trim().toLowerCase() !== ADMIN_EMAIL) return json({ error: "Forbidden." }, 403);
        const reportsResponse = await fetch(url + "/rest/v1/worth_it_user_reports?select=id,reporter_user_id,reporter_worth_it_id,reported_user_id,reported_worth_it_id,reported_username,reason,details,status,created_at&order=created_at.desc&limit=500", {
            headers: { apikey: key, Authorization: authorization, Accept: "application/json" }
        });
        if (!reportsResponse.ok) {
            console.error("Admin user reports query failed:", reportsResponse.status);
            return json({ error: "Could not load user reports. Ensure the user-report migration is applied." }, 500);
        }
        const reports = await reportsResponse.json();
        return json({ success: true, reports: Array.isArray(reports) ? reports : [] });
    } catch (error) {
        console.error("Admin user reports request failed:", error);
        return json({ error: "Could not load user reports." }, 500);
    }
}
