const TURN_CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;

function json(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Vary": "Origin",
            "Access-Control-Allow-Origin": origin || "null",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": "GET, OPTIONS"
        }
    });
}
function allowedOrigin(request) {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const host = requestUrl.hostname.toLowerCase();
    const isWorthItPreview = host === "worth-it-calculator.pages.dev" || host.endsWith(".worth-it-calculator.pages.dev");
    if (!isWorthItPreview) return "";
    if (!origin) return requestUrl.origin;
    return origin === requestUrl.origin ? origin : "";
}
function getToken(request) {
    const authorization = request.headers.get("Authorization") || "";
    return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}
function getConfig(env) {
    return {
        supabaseUrl: String(env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
        publishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || "").trim(),
        turnKeyId: String(env.CLOUDFLARE_TURN_KEY_ID || "").trim(),
        turnKeyToken: String(env.CLOUDFLARE_TURN_KEY_API_TOKEN || "").trim()
    };
}
async function verifyUser(config, token) {
    const response = await fetch(config.supabaseUrl + "/auth/v1/user", {
        headers: {
            "apikey": config.publishableKey,
            "Authorization": "Bearer " + token,
            "Accept": "application/json"
        }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? user : null;
}
async function verifyFriendDirectConversation(config, token, conversationId) {
    const headers = {
        "apikey": config.publishableKey,
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };
    const chatsResponse = await fetch(config.supabaseUrl + "/rest/v1/rpc/get_worth_it_chat_conversations", {
        method: "POST", headers, body: "{}"
    });
    if (!chatsResponse.ok) return false;
    const chats = await chatsResponse.json();
    if (!Array.isArray(chats) || !chats.some(chat =>
        String(chat?.id || "") === conversationId && chat?.type === "direct"
    )) return false;
    const accessResponse = await fetch(config.supabaseUrl + "/rest/v1/rpc/can_access_worth_it_chat_media", {
        method: "POST", headers, body: JSON.stringify({ p_conversation_id: conversationId })
    });
    if (!accessResponse.ok) return false;
    return (await accessResponse.json()) === true;
}
function filterIceServers(input) {
    if (!Array.isArray(input)) return [];
    return input.map(server => {
        const urls = (Array.isArray(server?.urls) ? server.urls : [server?.urls])
            .filter(url => typeof url === "string"
                && /^(stun|turns?):/i.test(url)
                && !/:53(?:\?|$)/i.test(url));
        if (!urls.length) return null;
        const entry = { urls };
        if (typeof server.username === "string") entry.username = server.username;
        if (typeof server.credential === "string") entry.credential = server.credential;
        return entry;
    }).filter(Boolean);
}
export async function onRequest(context) {
    const { request, env } = context;
    const origin = allowedOrigin(request);
    if (!origin) return json({ error: "This origin is not allowed." }, 403);
    if (request.method === "OPTIONS") return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Max-Age": "86400",
            "Vary": "Origin"
        }
    });
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405, origin);

    const config = getConfig(env);
    if (!config.supabaseUrl || !config.publishableKey) {
        return json({ error: "Call authentication is temporarily unavailable." }, 503, origin);
    }
    if (!config.turnKeyId || !config.turnKeyToken) {
        return json({ error: "A TURN relay has not been configured for calls yet." }, 503, origin);
    }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(config.turnKeyId) || config.turnKeyToken.length > 256) {
        return json({ error: "The TURN relay configuration is invalid." }, 503, origin);
    }

    const token = getToken(request);
    if (!token) return json({ error: "Sign in before requesting call credentials." }, 401, origin);
    let user;
    try { user = await verifyUser(config, token); }
    catch (_) { return json({ error: "Could not verify your session." }, 502, origin); }
    if (!user) return json({ error: "Your session has expired. Sign in again." }, 401, origin);

    const conversationId = new URL(request.url).searchParams.get("conversationId") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
        return json({ error: "A valid private friend conversation is required." }, 400, origin);
    }
    let isFriendConversation;
    try { isFriendConversation = await verifyFriendDirectConversation(config, token, conversationId); }
    catch (_) { return json({ error: "Could not verify the friend conversation." }, 502, origin); }
    if (!isFriendConversation) return json({ error: "Calls are available only in a private chat with an accepted friend." }, 403, origin);

    let response;
    try {
        response = await fetch(
            "https://rtc.live.cloudflare.com/v1/turn/keys/" + encodeURIComponent(config.turnKeyId) + "/credentials/generate-ice-servers",
            {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + config.turnKeyToken,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS })
            }
        );
    } catch (_) {
        return json({ error: "The call relay could not be reached. Try again." }, 502, origin);
    }
    if (!response.ok) {
        // Avoid reflecting upstream details or secrets to the browser.
        return json({ error: "Could not issue temporary call relay credentials." }, 502, origin);
    }
    let result;
    try { result = await response.json(); }
    catch (_) { return json({ error: "The call relay returned an invalid response." }, 502, origin); }
    const iceServers = filterIceServers(result?.iceServers);
    const hasRelay = iceServers.some(server => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return Boolean(server.username && server.credential && urls.some(url => /^turns?:/i.test(url)));
    });
    if (!hasRelay) return json({ error: "The call relay did not return usable TURN credentials." }, 502, origin);
    return json({ iceServers, expiresInSeconds: TURN_CREDENTIAL_TTL_SECONDS }, 200, origin);
}
