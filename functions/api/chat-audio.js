const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const AUDIO_BUCKET = "worth-it-chat-audio";
const AUDIO_LIMIT = 10 * 1024 * 1024;
const SIGNED_URL_SECONDS = 900;

function json(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Vary": "Origin",
            "Access-Control-Allow-Origin": origin || SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS"
        }
    });
}
function getToken(request) {
    const authorization = request.headers.get("Authorization") || "";
    return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}
function getConfig(env) {
    return {
        supabaseUrl: String(env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
        publishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || "").trim(),
        serviceKey: String(env.supabase_secret_key || env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
    };
}
function serviceHeaders(config, extra) {
    const headers = { apikey: config.serviceKey };
    if (!config.serviceKey.startsWith("sb_secret_")) headers.Authorization = "Bearer " + config.serviceKey;
    return Object.assign(headers, extra || {});
}
function allowedOrigin(request) {
    const origin = request.headers.get("Origin") || "";
    const requestOrigin = new URL(request.url).origin;
    if (!origin) return requestOrigin === SITE_ORIGIN ? SITE_ORIGIN : "";
    return origin === SITE_ORIGIN || origin === requestOrigin ? origin : "";
}
async function verifyUser(config, token) {
    const response = await fetch(config.supabaseUrl + "/auth/v1/user", {
        headers: { apikey: config.publishableKey, Authorization: "Bearer " + token, Accept: "application/json" }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? user : null;
}
async function authorizeRpc(config, token, functionName, payload) {
    const response = await fetch(config.supabaseUrl + "/rest/v1/rpc/" + functionName, {
        method: "POST",
        headers: {
            apikey: config.publishableKey,
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify(payload),
        cache: "no-store"
    });
    if (!response.ok) return false;
    return (await response.json()) === true;
}
function canonicalMime(value) {
    return String(value || "").toLowerCase().split(";")[0].trim();
}
function detectAudio(bytes, mime) {
    const starts = (...values) => values.every((value, index) => bytes[index] === value);
    if (mime === "audio/webm" && starts(0x1a, 0x45, 0xdf, 0xa3)) return { mime, ext: "webm" };
    if (mime === "audio/ogg" && starts(0x4f, 0x67, 0x67, 0x53)) return { mime, ext: "ogg" };
    if (mime === "audio/mp4" && bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return { mime, ext: "m4a" };
    if (mime === "audio/mpeg" && (starts(0x49, 0x44, 0x33) || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) return { mime, ext: "mp3" };
    if ((mime === "audio/wav" || mime === "audio/x-wav") && bytes.length >= 12 &&
        starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
        return { mime: "audio/wav", ext: "wav" };
    }
    return null;
}
function getPath(raw) {
    const path = String(raw || "").trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/[A-Za-z0-9._-]+$/.test(path) || path.includes("..")) return "";
    const owner = path.split("/")[0];
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(owner)) return "";
    return path;
}
function storagePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}
async function getSignedUrl(config, path) {
    const response = await fetch(config.supabaseUrl + "/storage/v1/object/sign/" + AUDIO_BUCKET + "/" + storagePath(path), {
        method: "POST",
        headers: serviceHeaders(config, { "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
        cache: "no-store"
    });
    if (!response.ok) return "";
    const payload = await response.json();
    const signedPath = String(payload.signedURL || payload.signedUrl || "");
    if (!signedPath) return "";
    const fullPath = signedPath.startsWith(config.supabaseUrl) ? signedPath
        : signedPath.startsWith("/storage/v1/") ? config.supabaseUrl + signedPath
        : signedPath.startsWith("/") ? config.supabaseUrl + "/storage/v1" + signedPath
        : config.supabaseUrl + "/storage/v1/" + signedPath;
    return fullPath;
}
export async function onRequest(context) {
    const { request, env } = context;
    const origin = allowedOrigin(request);
    if (!origin) return json({ error: "This origin is not allowed." }, 403, SITE_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
            "Access-Control-Max-Age": "86400",
            Vary: "Origin"
        }
    });
    if (!["POST", "GET", "DELETE"].includes(request.method)) return json({ error: "Method not allowed." }, 405, origin);
    const config = getConfig(env);
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceKey) {
        return json({ error: "Private voice messages are temporarily unavailable." }, 503, origin);
    }
    const token = getToken(request);
    if (!token) return json({ error: "Sign in again before accessing a voice message." }, 401, origin);
    let user;
    try { user = await verifyUser(config, token); }
    catch (_) { return json({ error: "Could not verify your session. Please try again." }, 502, origin); }
    if (!user) return json({ error: "Your session has expired. Sign in again." }, 401, origin);

    const url = new URL(request.url);
    let conversationId = "";
    let objectPath = "";
    if (request.method === "POST") {
        const length = Number(request.headers.get("Content-Length") || 0);
        if (length && length > AUDIO_LIMIT + 256 * 1024) return json({ error: "Voice messages must be 10 MB or smaller." }, 413, origin);
        let form;
        try { form = await request.formData(); } catch (_) { return json({ error: "Choose a valid audio recording." }, 400, origin); }
        conversationId = String(form.get("conversation_id") || "").trim();
        const file = form.get("file");
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(conversationId) || !file || typeof file.arrayBuffer !== "function" || !file.size) {
            return json({ error: "A voice recording and open conversation are required." }, 400, origin);
        }
        if (file.size > AUDIO_LIMIT) return json({ error: "Voice messages must be 10 MB or smaller." }, 413, origin);
        const mime = canonicalMime(file.type);
        if (!["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"].includes(mime)) {
            return json({ error: "This browser's recording format is not supported. Try recording again." }, 415, origin);
        }
        let bytes;
        try { bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer()); }
        catch (_) { return json({ error: "Could not read this recording." }, 400, origin); }
        const detected = detectAudio(bytes, mime);
        if (!detected) return json({ error: "The recording data does not match its audio type." }, 415, origin);
        let permitted = false;
        try { permitted = await authorizeRpc(config, token, "can_access_worth_it_chat_media", { p_conversation_id: conversationId }); }
        catch (_) { return json({ error: "Could not verify access to this conversation." }, 502, origin); }
        if (!permitted) return json({ error: "Voice messages are available only to members of this conversation." }, 403, origin);

        objectPath = user.id + "/" + Date.now() + "-" + crypto.randomUUID() + "." + detected.ext;
        let uploadResponse;
        try {
            uploadResponse = await fetch(config.supabaseUrl + "/storage/v1/object/" + AUDIO_BUCKET + "/" + storagePath(objectPath), {
                method: "POST",
                headers: serviceHeaders(config, { "Content-Type": detected.mime, "x-upsert": "false", "Cache-Control": "3600" }),
                body: file
            });
        } catch (_) { return json({ error: "Could not save this voice message. Please try again." }, 502, origin); }
        if (!uploadResponse.ok) return json({ error: "Could not save this voice message. Please try again." }, 502, origin);
        return json({ url: "worthit-audio:" + conversationId + ":" + objectPath, type: "audio" }, 200, origin);
    }

    conversationId = String(url.searchParams.get("conversation_id") || "").trim();
    objectPath = getPath(url.searchParams.get("path"));
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(conversationId) || !objectPath) {
        return json({ error: "Invalid voice message reference." }, 400, origin);
    }
    const permissionRpc = request.method === "DELETE"
        ? "can_delete_worth_it_chat_audio_object"
        : "can_access_worth_it_chat_audio_object";
    let permitted = false;
    try {
        permitted = await authorizeRpc(config, token, permissionRpc, {
            p_conversation_id: conversationId,
            p_object_path: objectPath
        });
    } catch (_) { return json({ error: "Could not verify access to this voice message." }, 502, origin); }
    if (!permitted) return json({ error: "You do not have access to this voice message." }, 403, origin);

    if (request.method === "DELETE") {
        let response;
        try {
            response = await fetch(config.supabaseUrl + "/storage/v1/object/" + AUDIO_BUCKET + "/" + storagePath(objectPath), {
                method: "DELETE", headers: serviceHeaders(config), cache: "no-store"
            });
        } catch (_) { return json({ error: "Could not remove the stored voice file." }, 502, origin); }
        if (!response.ok) return json({ error: "Could not remove the stored voice file." }, 502, origin);
        return json({ success: true }, 200, origin);
    }

    const signedUrl = await getSignedUrl(config, objectPath);
    if (!signedUrl) return json({ error: "Could not open this voice message. Please try again." }, 502, origin);
    return json({ url: signedUrl, expires_in: SIGNED_URL_SECONDS }, 200, origin);
}
