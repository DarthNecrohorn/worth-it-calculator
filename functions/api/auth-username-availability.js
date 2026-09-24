const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const USERNAME_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9_]{3,20}$/;
const MAX_USERNAME_LENGTH = 20;

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, OPTIONS"
        }
    });
}

async function listUsersPage(supabaseUrl, supabaseSecret, page) {
    const response = await fetch(
        supabaseUrl +
        "/auth/v1/admin/users?page=" +
        encodeURIComponent(page) +
        "&per_page=1000",
        {
            method: "GET",
            headers: {
                "apikey": supabaseSecret,
                "Authorization": "Bearer " + supabaseSecret,
                "Accept": "application/json"
            }
        }
    );

    if (!response.ok) {
        throw new Error("Could not inspect the account directory.");
    }

    return await response.json();
}

async function usernameExists(supabaseUrl, supabaseSecret, username) {
    const target = username.toLowerCase();

    for (let page = 1; page <= 50; page += 1) {
        const payload = await listUsersPage(
            supabaseUrl,
            supabaseSecret,
            page
        );

        const users = Array.isArray(payload?.users)
            ? payload.users
            : [];

        const exists = users.some((candidate) => {
            const stored = candidate?.user_metadata?.username;

            return (
                typeof stored === "string" &&
                stored.toLowerCase() === target
            );
        });

        if (exists) return true;
        if (users.length < 1000) break;
    }

    return false;
}

export async function onRequestOptions() {
    return jsonResponse({}, 204);
}

export async function onRequestGet(context) {
    const request = context.request;
    const env = context.env;
    const origin = request.headers.get("Origin") || "";

    if (origin && origin !== SITE_ORIGIN) {
        return jsonResponse({ error: "Forbidden origin." }, 403);
    }

    const username = (
        new URL(request.url).searchParams.get("username") || ""
    ).trim();

    if (!USERNAME_PATTERN.test(username)) {
        return jsonResponse({
            available: false,
            valid: false
        }, 200);
    }

    const supabaseUrl = String(env.SUPABASE_URL || "").trim();
    const supabaseSecret = String(
        env.SUPABASE_SECRET_KEY ||
        env.SUPABASE_SERVICE_ROLE_KEY ||
        ""
    ).trim();

    if (!supabaseUrl || !supabaseSecret) {
        return jsonResponse({
            error: "Authentication server configuration is incomplete."
        }, 500);
    }

    try {
        const exists = await usernameExists(
            supabaseUrl,
            supabaseSecret,
            username
        );

        return jsonResponse({
            available: !exists,
            valid: true
        });
    } catch (error) {
        console.error("Username availability error:", error);

        return jsonResponse({
            error: "Could not check username availability."
        }, 503);
    }
}
