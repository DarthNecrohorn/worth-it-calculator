const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const USERNAME_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9_]{3,20}$/;
const MAX_BODY_BYTES = 12000;

function jsonResponse(data, status = 200) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=utf-8",
                "Cache-Control":
                    "no-store",
                "Access-Control-Allow-Origin":
                    SITE_ORIGIN,
                "Access-Control-Allow-Headers":
                    "Content-Type",
                "Access-Control-Allow-Methods":
                    "POST, OPTIONS"
            }
        }
    );
}

function getClientIp(request) {
    return (
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For") ||
        ""
    ).split(",")[0].trim();
}

async function listUsersPage(
    supabaseUrl,
    supabaseSecret,
    page
) {
    const response =
        await fetch(
            supabaseUrl +
            "/auth/v1/admin/users?page=" +
            encodeURIComponent(page) +
            "&per_page=1000",
            {
                method: "GET",
                headers: {
                    "apikey":
                        supabaseSecret,
                    "Authorization":
                        "Bearer " + supabaseSecret,
                    "Accept":
                        "application/json"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            "Could not inspect the account directory."
        );
    }

    return await response.json();
}

async function findEmailByUsername(
    supabaseUrl,
    supabaseSecret,
    username
) {
    const target =
        username.toLowerCase();

    for (let page = 1; page <= 50; page += 1) {
        const payload =
            await listUsersPage(
                supabaseUrl,
                supabaseSecret,
                page
            );

        const users =
            Array.isArray(payload?.users)
                ? payload.users
                : [];

        const user =
            users.find((candidate) => {
                const stored =
                    candidate?.user_metadata?.username;

                return (
                    typeof stored === "string" &&
                    stored.toLowerCase() === target
                );
            });

        if (user?.email) {
            return user.email;
        }

        if (
            users.length < 1000
        ) {
            break;
        }
    }

    return "";
}

export async function onRequestOptions() {
    return jsonResponse(
        {},
        204
    );
}

export async function onRequestPost(
    context
) {
    const request =
        context.request;

    const env =
        context.env;

    const origin =
        request.headers.get("Origin") || "";

    if (
        origin &&
        origin !== SITE_ORIGIN
    ) {
        return jsonResponse(
            {
                error:
                    "Forbidden origin."
            },
            403
        );
    }

    const supabaseUrl =
        String(
            env.SUPABASE_URL || ""
        ).trim();

    const supabaseSecret =
        String(
            env.SUPABASE_SECRET_KEY ||
            env.SUPABASE_SERVICE_ROLE_KEY ||
            ""
        ).trim();

    const supabasePublishableKey =
        String(
            env.SUPABASE_PUBLISHABLE_KEY || ""
        ).trim();

    if (
        !supabaseUrl ||
        !supabaseSecret ||
        !supabasePublishableKey
    ) {
        return jsonResponse(
            {
                error:
                    "Authentication server configuration is incomplete."
            },
            500
        );
    }

    const contentLength =
        Number(
            request.headers.get(
                "Content-Length"
            ) || 0
        );

    if (
        contentLength > MAX_BODY_BYTES
    ) {
        return jsonResponse(
            {
                error:
                    "Request is too large."
            },
            413
        );
    }

    let body;

    try {
        body =
            await request.json();
    } catch (error) {
        return jsonResponse(
            {
                error:
                    "Invalid request."
            },
            400
        );
    }

    const username =
        typeof body?.username === "string"
            ? body.username.trim()
            : "";

    const password =
        typeof body?.password === "string"
            ? body.password
            : "";

    const captchaToken =
        typeof body?.captchaToken === "string"
            ? body.captchaToken
            : "";

    if (
        !USERNAME_PATTERN.test(
            username
        )
    ) {
        return jsonResponse(
            {
                error:
                    "Incorrect username or password."
            },
            400
        );
    }

    if (
        !password ||
        password.length > 1024
    ) {
        return jsonResponse(
            {
                error:
                    "Incorrect username or password."
            },
            400
        );
    }

    if (!captchaToken) {
        return jsonResponse(
            {
                error:
                    "Please complete the security check."
            },
            400
        );
    }

    try {
        const email =
            await findEmailByUsername(
                supabaseUrl,
                supabaseSecret,
                username
            );

        if (!email) {
            return jsonResponse(
                {
                    error:
                        "Incorrect username or password."
                },
                401
            );
        }

        const authResponse =
            await fetch(
                supabaseUrl +
                "/auth/v1/token?grant_type=password",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                        "apikey":
                            supabasePublishableKey,
                        "Accept":
                            "application/json",
                        ...(getClientIp(request)
                            ? {
                                "Sb-Forwarded-For":
                                    getClientIp(request)
                            }
                            : {})
                    },
                    body: JSON.stringify({
                        email,
                        password,
                        gotrue_meta_security: {
                            captcha_token:
                                captchaToken
                        }
                    })
                }
            );

        const authPayload =
            await authResponse.json();

        if (!authResponse.ok) {
            return jsonResponse(
                {
                    error:
                        "Incorrect username or password."
                },
                401
            );
        }

        return jsonResponse(
            {
                access_token:
                    authPayload.access_token,
                refresh_token:
                    authPayload.refresh_token,
                expires_in:
                    authPayload.expires_in,
                token_type:
                    authPayload.token_type
            },
            200
        );

    } catch (error) {

        console.error(
            "Username authentication error:",
            error
        );

        return jsonResponse(
            {
                error:
                    "Authentication service is temporarily unavailable."
            },
            503
        );
    }
}
