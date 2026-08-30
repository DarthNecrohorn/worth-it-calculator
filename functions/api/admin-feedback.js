const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const ADMIN_USER_ID = "c3560d70-8b68-49f0-b3f1-9e248673553c";

function responseJson(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, OPTIONS"
        }
    });
}

function getToken(request) {
    const authorization = request.headers.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
        return "";
    }

    return authorization.slice(7).trim();
}

async function verifySupabaseUser(env, token) {
    const supabaseUrl =
        String(env.SUPABASE_URL || "").trim();

    const supabaseKey =
        String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();

    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase environment variables are missing.");
    }

    const response = await fetch(
        supabaseUrl + "/auth/v1/user",
        {
            method: "GET",
            headers: {
                "apikey": supabaseKey,
                "Authorization": "Bearer " + token,
                "Accept": "application/json"
            }
        }
    );

    if (!response.ok) {
        return null;
    }

    const user = await response.json();

    if (!user || !user.id) {
        return null;
    }

    return user;
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, OPTIONS"
        }
    });
}

export async function onRequestGet(context) {
    const request = context.request;
    const env = context.env;

    try {
        const origin = request.headers.get("Origin") || "";

        if (origin && origin !== SITE_ORIGIN) {
            return responseJson(
                { error: "Forbidden origin." },
                403
            );
        }

        const token = getToken(request);

        if (!token) {
            return responseJson(
                { error: "Unauthorized." },
                401
            );
        }

        const user = await verifySupabaseUser(env, token);

        if (!user) {
            return responseJson(
                { error: "Invalid or expired session." },
                401
            );
        }

        if (user.id !== ADMIN_USER_ID) {
            return responseJson(
                { error: "Forbidden." },
                403
            );
        }

        const supabaseUrl =
            String(env.SUPABASE_URL || "").trim();

        const supabaseKey =
            String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();

        const response = await fetch(
            supabaseUrl +
            "/rest/v1/feedback?select=id,type,message,page,created_at,user_id&order=created_at.desc",
            {
                method: "GET",
                headers: {
                    "apikey": supabaseKey,
                    "Authorization": "Bearer " + token,
                    "Accept": "application/json"
                }
            }
        );

        if (!response.ok) {
            const errorText =
                await response.text().catch(function () {
                    return "";
                });

            console.error(
                "Supabase admin feedback query failed:",
                response.status,
                errorText
            );

            return responseJson(
                { error: "Could not load feedback." },
                500
            );
        }

        const feedback = await response.json();

        return responseJson(
            {
                success: true,
                feedback: Array.isArray(feedback)
                    ? feedback
                    : []
            },
            200
        );

    } catch (error) {
        console.error(
            "Unhandled admin feedback error:",
            error
        );

        return responseJson(
            { error: "Failed to load feedback." },
            500
        );
    }
}
