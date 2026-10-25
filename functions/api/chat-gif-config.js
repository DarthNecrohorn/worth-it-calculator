const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";

function responseJson(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Vary": "Origin",
            "Access-Control-Allow-Origin": origin || SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, OPTIONS"
        }
    });
}

function allowedOrigin(request) {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const projectHost = requestUrl.protocol === "https:" && (
        requestUrl.hostname === "worth-it-calculator.pages.dev" ||
        requestUrl.hostname.endsWith(".worth-it-calculator.pages.dev")
    );
    if (!origin) return projectHost ? requestUrl.origin : "";
    if (origin === SITE_ORIGIN || origin === requestUrl.origin) return origin;
    return "";
}

function getToken(request) {
    const authorization = request.headers.get("Authorization") || "";
    return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function verifyUser(env, token) {
    const supabaseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
    const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
    if (!supabaseUrl || !publishableKey || !token) return null;

    const response = await fetch(supabaseUrl + "/auth/v1/user", {
        headers: {
            "apikey": publishableKey,
            "Authorization": "Bearer " + token,
            "Accept": "application/json"
        }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? user : null;
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = allowedOrigin(request);
    if (!origin) return responseJson({ error: "This origin is not allowed." }, 403, SITE_ORIGIN);

    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Max-Age": "86400",
                "Vary": "Origin"
            }
        });
    }
    if (request.method !== "GET") return responseJson({ error: "Method not allowed." }, 405, origin);

    const token = getToken(request);
    if (!token) return responseJson({ error: "Sign in again before searching GIFs." }, 401, origin);

    try {
        const user = await verifyUser(env, token);
        if (!user) return responseJson({ error: "Your session has expired. Sign in again." }, 401, origin);
    } catch (_) {
        return responseJson({ error: "Could not verify your session. Please try again." }, 502, origin);
    }

    // GIPHY's browser-search API requires a client-side request. Its public
    // integration key is returned only to a verified signed-in Worth It user.
    const apiKey = String(env.GIPHY_API_KEY || "").trim();
    if (!apiKey) {
        return responseJson({
            error: "GIF search is not configured yet. Add GIPHY_API_KEY to the Worth It Cloudflare Pages environment."
        }, 503, origin);
    }

    return responseJson({ apiKey }, 200, origin);
}
