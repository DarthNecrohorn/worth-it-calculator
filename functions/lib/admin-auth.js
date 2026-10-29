const ADMIN_EMAIL = "pedjasebez3545@gmail.com";

export async function isWorthItAdminRequest(context) {
    const authorization =
        String(context?.request?.headers?.get("Authorization") || "");

    if (!/^Bearer\s+\S+/i.test(authorization)) {
        return false;
    }

    const env = context?.env || {};
    const projectUrl =
        String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const publishableKey =
        String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();

    if (!projectUrl || !publishableKey) {
        return false;
    }

    try {
        const response = await fetch(
            projectUrl + "/auth/v1/user",
            {
                method: "GET",
                headers: {
                    "apikey": publishableKey,
                    "Authorization": authorization,
                    "Accept": "application/json"
                }
            }
        );

        if (!response.ok) {
            return false;
        }

        const user = await response.json();

        return Boolean(
            user?.email &&
            (user.email_confirmed_at || user.confirmed_at) &&
            String(user.email).trim().toLowerCase() === ADMIN_EMAIL
        );
    } catch {
        return false;
    }
}

export function adminRequiredResponse() {
    return Response.json(
        {
            ok: false,
            error: "Administrator authorization is required."
        },
        {
            status: 401,
            headers: {
                "Cache-Control": "no-store"
            }
        }
    );
}
