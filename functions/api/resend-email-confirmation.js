const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const DAY_SECONDS = 24 * 60 * 60;

function jsonResponse(body, status, origin) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "Vary": "Origin",
            "Access-Control-Allow-Origin": origin || SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        }
    });
}

function allowedOrigin(request) {
    const origin = request.headers.get("Origin") || "";
    const requestOrigin = new URL(request.url).origin;
    if (!origin) return requestOrigin === SITE_ORIGIN ? SITE_ORIGIN : "";
    return origin === SITE_ORIGIN || origin === requestOrigin ? origin : "";
}

function getToken(request) {
    const authorization = request.headers.get("Authorization") || "";
    return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function getConfig(env) {
    return {
        supabaseUrl: String(env.SUPABASE_URL || "").trim().replace(/\/+$/, ""),
        publishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || "").trim(),
        serviceKey: String(env.supabase_secret_key || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
    };
}

function serviceHeaders(config, extra) {
    const headers = { apikey: config.serviceKey, Accept: "application/json" };
    if (!config.serviceKey.startsWith("sb_secret_")) headers.Authorization = "Bearer " + config.serviceKey;
    return Object.assign(headers, extra || {});
}

async function verifyUser(config, token) {
    const response = await fetch(config.supabaseUrl + "/auth/v1/user", {
        headers: {
            apikey: config.publishableKey,
            Authorization: "Bearer " + token,
            Accept: "application/json"
        }
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return user && user.id ? user : null;
}

async function releaseClaim(config, userId) {
    try {
        await fetch(config.supabaseUrl + "/rest/v1/rpc/release_worth_it_email_confirmation_resend", {
            method: "POST",
            headers: serviceHeaders(config, { "Content-Type": "application/json" }),
            body: JSON.stringify({ p_user_id: userId })
        });
    } catch (_) {
        // If the provider request failed, keep any un-released claim rather than
        // risking a burst of duplicate email requests.
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = allowedOrigin(request);
    if (!origin) return jsonResponse({ error: "This origin is not allowed." }, 403, SITE_ORIGIN);

    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Max-Age": "86400",
                "Vary": "Origin"
            }
        });
    }
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, origin);

    const config = getConfig(env);
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceKey) {
        return jsonResponse({ error: "Email confirmation is temporarily unavailable." }, 503, origin);
    }

    const token = getToken(request);
    if (!token) return jsonResponse({ error: "Sign in to request an email confirmation." }, 401, origin);

    let user;
    try {
        user = await verifyUser(config, token);
    } catch (_) {
        return jsonResponse({ error: "Could not verify your session. Please try again." }, 502, origin);
    }
    if (!user) return jsonResponse({ error: "Your session has expired. Please sign in again." }, 401, origin);
    if (user.email_confirmed_at || user.confirmed_at) {
        return jsonResponse({ error: "This email address is already confirmed.", code: "EMAIL_ALREADY_CONFIRMED" }, 409, origin);
    }
    if (!user.email) return jsonResponse({ error: "This account does not have an email address to confirm." }, 400, origin);

    let claimResponse;
    try {
        claimResponse = await fetch(config.supabaseUrl + "/rest/v1/rpc/claim_worth_it_email_confirmation_resend", {
            method: "POST",
            headers: serviceHeaders(config, { "Content-Type": "application/json" }),
            body: JSON.stringify({ p_user_id: user.id })
        });
    } catch (_) {
        return jsonResponse({ error: "Could not check the daily resend limit. Please try again later." }, 503, origin);
    }
    if (!claimResponse.ok) {
        return jsonResponse({ error: "Could not check the daily resend limit. Please try again later." }, 503, origin);
    }

    const claimPayload = await claimResponse.json().catch(() => null);
    const claim = Array.isArray(claimPayload) ? claimPayload[0] : claimPayload;
    if (!claim?.is_allowed) {
        const retrySeconds = Math.max(1, Number(claim?.retry_after_seconds) || DAY_SECONDS);
        return jsonResponse({
            success: false,
            code: "EMAIL_RESEND_RATE_LIMITED",
            error: "A confirmation email can only be requested once every 24 hours for this account.",
            retry_after_seconds: retrySeconds,
            next_allowed_at: new Date(Date.now() + retrySeconds * 1000).toISOString()
        }, 429, origin);
    }

    const emailRedirectTo = new URL("/", origin).toString();
    const resendUrl = config.supabaseUrl + "/auth/v1/resend?redirect_to=" + encodeURIComponent(emailRedirectTo);
    let resendResponse;
    try {
        resendResponse = await fetch(resendUrl, {
            method: "POST",
            headers: {
                apikey: config.publishableKey,
                Authorization: "Bearer " + token,
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ type: "signup", email: user.email })
        });
    } catch (_) {
        await releaseClaim(config, user.id);
        return jsonResponse({ error: "Could not reach the email service. Please try again later." }, 502, origin);
    }

    if (!resendResponse.ok) {
        await releaseClaim(config, user.id);
        const providerBody = await resendResponse.json().catch(() => ({}));
        const providerMessage = String(providerBody.msg || providerBody.message || providerBody.error_description || "");
        if (/email_address_not_authorized/i.test(providerMessage)) {
            return jsonResponse({
                error: "Supabase's default email service cannot send to this address yet. The project owner must configure custom SMTP.",
                code: "EMAIL_PROVIDER_NOT_CONFIGURED"
            }, 502, origin);
        }
        return jsonResponse({
            error: "The email service could not send a confirmation message. Please check your address and try again.",
            code: "EMAIL_RESEND_FAILED"
        }, resendResponse.status === 429 ? 503 : 502, origin);
    }

    return jsonResponse({
        success: true,
        next_allowed_at: new Date(Date.now() + DAY_SECONDS * 1000).toISOString(),
        message: "Confirmation email requested. Check your inbox and Spam/Junk."
    }, 200, origin);
}

export async function onRequestOptions(context) {
    const origin = allowedOrigin(context.request);
    if (!origin) return jsonResponse({ error: "This origin is not allowed." }, 403, SITE_ORIGIN);
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Max-Age": "86400",
            "Vary": "Origin"
        }
    });
}
