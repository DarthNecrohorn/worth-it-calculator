const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const GIF_LIMIT = 20 * 1024 * 1024;

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

function trustedGifUrl(rawUrl) {
    if (!rawUrl || rawUrl.length > 2048) return null;
    try {
        const url = new URL(rawUrl);
        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            url.port ||
            !/^media\d*\.giphy\.com$/i.test(url.hostname) ||
            !/^\/media\/[a-z0-9]+\/[a-z0-9_.-]+\.gif$/i.test(url.pathname)
        ) return null;
        return url;
    } catch (_) {
        return null;
    }
}

async function readBoundedBody(response) {
    const contentLength = Number(response.headers.get("Content-Length") || 0);
    if (contentLength > GIF_LIMIT) throw new Error("too-large");
    if (!response.body) throw new Error("empty");

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            total += part.value.byteLength;
            if (total > GIF_LIMIT) {
                await reader.cancel();
                throw new Error("too-large");
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
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
    if (!token) return responseJson({ error: "Sign in again before adding a GIF." }, 401, origin);
    try {
        const user = await verifyUser(env, token);
        if (!user) return responseJson({ error: "Your session has expired. Sign in again." }, 401, origin);
    } catch (_) {
        return responseJson({ error: "Could not verify your session. Please try again." }, 502, origin);
    }

    const url = trustedGifUrl(new URL(request.url).searchParams.get("url") || "");
    if (!url) return responseJson({ error: "Choose a GIF from the GIPHY picker." }, 400, origin);

    let upstream;
    try {
        upstream = await fetch(url.href, {
            method: "GET",
            headers: { "Accept": "image/gif" },
            redirect: "error"
        });
    } catch (_) {
        return responseJson({ error: "Could not download that GIF. Please choose another one." }, 502, origin);
    }
    if (!upstream.ok) return responseJson({ error: "That GIF is no longer available. Choose another one." }, 502, origin);
    const contentType = String(upstream.headers.get("Content-Type") || "").toLowerCase();
    if (!contentType.startsWith("image/gif")) {
        return responseJson({ error: "The selected item is not a GIF. Choose another one." }, 415, origin);
    }

    let bytes;
    try {
        bytes = await readBoundedBody(upstream);
    } catch (error) {
        return responseJson({
            error: error?.message === "too-large" ? "GIFs must be 20 MB or smaller." : "Could not read that GIF."
        }, error?.message === "too-large" ? 413 : 502, origin);
    }
    const isGif87 = bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x37 && bytes[5] === 0x61;
    const isGif89 = bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && bytes[4] === 0x39 && bytes[5] === 0x61;
    if (!isGif87 && !isGif89) return responseJson({ error: "The selected file is not a valid GIF." }, 415, origin);

    return new Response(bytes, {
        status: 200,
        headers: {
            "Content-Type": "image/gif",
            "Content-Disposition": 'attachment; filename="chat.gif"',
            "Content-Length": String(bytes.byteLength),
            "Cache-Control": "no-store",
            "Vary": "Origin",
            "Access-Control-Allow-Origin": origin,
            "X-Content-Type-Options": "nosniff"
        }
    });
}
