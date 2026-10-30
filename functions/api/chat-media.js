const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const BUCKET = "worth-it-chat-media";
const IMAGE_LIMIT = 15 * 1024 * 1024;
const GIF_LIMIT = 20 * 1024 * 1024;
const VIDEO_LIMIT = 50 * 1024 * 1024;
const MAX_REQUEST_BYTES = VIDEO_LIMIT + 256 * 1024;
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
    const headers = { "apikey": config.serviceKey };
    if (!config.serviceKey.startsWith("sb_secret_")) headers.Authorization = "Bearer " + config.serviceKey;
    return Object.assign(headers, extra || {});
}
function allowedOrigin(request) {
    const origin = request.headers.get("Origin") || "";
    const requestOrigin = new URL(request.url).origin;
    if (!origin) return requestOrigin === SITE_ORIGIN ? SITE_ORIGIN : "";
    if (origin === SITE_ORIGIN || origin === requestOrigin) return origin;
    return "";
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
function detectMedia(bytes) {
    const starts = (...values) => values.every((value, index) => bytes[index] === value);
    if (starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)) return {mime:"image/png", ext:"png", type:"image"};
    if (starts(0xff,0xd8,0xff)) return {mime:"image/jpeg", ext:"jpg", type:"image"};
    if (starts(0x47,0x49,0x46,0x38,0x37,0x61) || starts(0x47,0x49,0x46,0x38,0x39,0x61)) return {mime:"image/gif", ext:"gif", type:"gif"};
    if (bytes.length >= 12 && starts(0x52,0x49,0x46,0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return {mime:"image/webp", ext:"webp", type:"image"};
    if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return {mime:"video/mp4", ext:"mp4", type:"video"};
    if (starts(0x1a,0x45,0xdf,0xa3)) return {mime:"video/webm", ext:"webm", type:"video"};
    return null;
}

async function authorizeRpc(config, token, functionName, payload) {
    const response = await fetch(config.supabaseUrl + "/rest/v1/rpc/" + functionName, {
        method: "POST",
        headers: {
            "apikey": config.publishableKey,
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(payload),
        cache: "no-store"
    });
    if (!response.ok) {
        // A missing/unavailable RPC is a server configuration failure, not a
        // negative permission decision. Do not misreport it as an access denial.
        throw new Error("Chat media authorization RPC failed with HTTP " + response.status + ".");
    }
    const result = await response.json();
    if (typeof result !== "boolean") {
        throw new Error("Chat media authorization RPC returned an invalid response.");
    }
    return result;
}
function getObjectPath(raw) {
    const path = String(raw || "").trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/[A-Za-z0-9._-]{1,255}$/.test(path) || path.includes("..")) return "";
    return path;
}
function storagePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}
async function getSignedUrl(config, objectPath) {
    const response = await fetch(config.supabaseUrl + "/storage/v1/object/sign/" + BUCKET + "/" + storagePath(objectPath), {
        method: "POST",
        headers: serviceHeaders(config, { "Content-Type": "application/json", "Accept": "application/json" }),
        body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
        cache: "no-store"
    });
    if (!response.ok) return "";
    const payload = await response.json();
    const signedPath = String(payload.signedURL || payload.signedUrl || "");
    if (!signedPath) return "";
    try {
        const project = new URL(config.supabaseUrl);
        let signedUrl;
        if (/^https?:\/\//i.test(signedPath)) signedUrl = new URL(signedPath);
        else if (signedPath.startsWith("/storage/v1/")) signedUrl = new URL(signedPath, project);
        else if (signedPath.startsWith("/")) signedUrl = new URL("/storage/v1" + signedPath, project);
        else signedUrl = new URL("/storage/v1/" + signedPath, project);
        const expectedPath = "/storage/v1/object/sign/" + BUCKET + "/" + storagePath(objectPath);
        if (signedUrl.origin !== project.origin || signedUrl.pathname !== expectedPath) return "";
        signedUrl.hash = "";
        return signedUrl.toString();
    } catch (_) {
        return "";
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = allowedOrigin(request);
    if (!origin) return json({error:"This origin is not allowed."}, 403, SITE_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, {status:204, headers:{
        "Access-Control-Allow-Origin":origin,
        "Access-Control-Allow-Headers":"Content-Type, Authorization",
        "Access-Control-Allow-Methods":"POST, GET, DELETE, OPTIONS",
        "Access-Control-Max-Age":"86400",
        "Vary":"Origin"
    }});
    if (!["POST","GET","DELETE"].includes(request.method)) return json({error:"Method not allowed."}, 405, origin);

    const config = getConfig(env);
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceKey) return json({error:"Chat media is temporarily unavailable."}, 503, origin);
    const token = getToken(request);
    if (!token) return json({error:"Sign in again before accessing chat media."}, 401, origin);
    let user;
    try { user = await verifyUser(config, token); }
    catch (_) { return json({error:"Could not verify your session. Please try again."}, 502, origin); }
    if (!user) return json({error:"Your session has expired. Sign in again."}, 401, origin);

    const url = new URL(request.url);
    if (request.method === "GET" || request.method === "DELETE") {
        const conversationId = String(url.searchParams.get("conversation_id") || "").trim();
        const objectPath = getObjectPath(url.searchParams.get("path"));
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(conversationId) || !objectPath) {
            return json({error:"Invalid chat media reference."}, 400, origin);
        }
        const permissionRpc = request.method === "DELETE"
            ? "can_delete_worth_it_chat_media_object"
            : "can_access_worth_it_chat_media_object";
        let permitted = false;
        try {
            permitted = await authorizeRpc(config, token, permissionRpc, {
                p_conversation_id: conversationId,
                p_object_path: objectPath
            });
        } catch (_) { return json({error:"Could not verify access to this chat attachment."}, 502, origin); }
        if (!permitted) return json({error:"You do not have access to this chat attachment."}, 403, origin);

        if (request.method === "DELETE") {
            let response;
            try {
                response = await fetch(config.supabaseUrl + "/storage/v1/object/" + BUCKET + "/" + storagePath(objectPath), {
                    method:"DELETE", headers:serviceHeaders(config), cache:"no-store"
                });
            } catch (_) { return json({error:"Could not remove this attachment from storage."}, 502, origin); }
            if (!response.ok) return json({error:"Could not remove this attachment from storage."}, 502, origin);
            return json({success:true}, 200, origin);
        }

        let signedUrl = "";
        try { signedUrl = await getSignedUrl(config, objectPath); }
        catch (_) { return json({error:"Could not open this attachment. Please try again."}, 502, origin); }
        if (!signedUrl) return json({error:"Could not open this attachment. Please try again."}, 502, origin);
        return json({url:signedUrl, expires_in:SIGNED_URL_SECONDS}, 200, origin);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength && contentLength > MAX_REQUEST_BYTES) return json({error:"This file is too large. Images are limited to 15 MB, GIFs to 20 MB and videos to 50 MB."}, 413, origin);
    let form;
    try { form = await request.formData(); } catch (_) { return json({error:"Choose a valid image, GIF or video file."}, 400, origin); }
    const conversationId = String(form.get("conversation_id") || "").trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(conversationId)) {
        return json({error:"Open a conversation before uploading media."}, 400, origin);
    }
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || typeof file.size !== "number") return json({error:"Choose an image, GIF or video file."}, 400, origin);
    if (!file.size) return json({error:"This media file is empty."}, 400, origin);
    const claimedMime = String(file.type || "").toLowerCase();
    const video = claimedMime === "video/mp4" || claimedMime === "video/webm";
    const maxBytes = claimedMime === "image/gif" ? GIF_LIMIT : video ? VIDEO_LIMIT : IMAGE_LIMIT;
    if (file.size > maxBytes) return json({error:claimedMime === "image/gif" ? "GIFs must be 20 MB or smaller." : video ? "Videos must be 50 MB or smaller." : "Images must be 15 MB or smaller."}, 413, origin);
    if (!["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm"].includes(claimedMime)) return json({error:"Choose a PNG, JPG, WEBP, GIF, MP4 or WebM file."}, 415, origin);
    let bytes;
    try { bytes = new Uint8Array(await file.slice(0,16).arrayBuffer()); } catch (_) { return json({error:"Could not read this file."}, 400, origin); }
    const detected = detectMedia(bytes);
    if (!detected || detected.mime !== claimedMime) return json({error:"The file contents do not match its selected media type."}, 415, origin);

    let permitted = false;
    try { permitted = await authorizeRpc(config, token, "can_access_worth_it_chat_media", {p_conversation_id:conversationId}); }
    catch (_) { return json({error:"Could not verify access to this conversation."}, 502, origin); }
    if (!permitted) return json({error:"You must be a member of this conversation to upload media."}, 403, origin);

    const objectPath = user.id + "/" + Date.now() + "-" + crypto.randomUUID() + "." + detected.ext;
    let uploadResponse;
    try {
        uploadResponse = await fetch(config.supabaseUrl + "/storage/v1/object/" + BUCKET + "/" + storagePath(objectPath), {
            method:"POST",
            headers:serviceHeaders(config, {"Content-Type":detected.mime,"x-upsert":"false","Cache-Control":"3600"}),
            body:file
        });
    } catch (_) { return json({error:"Could not upload this media. Please try again."}, 502, origin); }
    if (!uploadResponse.ok) {
        let message = "Could not upload this media. Please try again.";
        try {
            const result = await uploadResponse.json();
            if (uploadResponse.status === 413 || /size|large|limit/i.test(String(result.message || result.error || ""))) message = "The storage service rejected this file size. Please try a smaller file.";
        } catch (_) {}
        return json({error:message}, uploadResponse.status === 413 ? 413 : 502, origin);
    }
    // Keep the stable public-object URL shape in the message row for backwards
    // compatibility; reads are routed through this API and signed on demand.
    const stableUrl = config.supabaseUrl + "/storage/v1/object/public/" + BUCKET + "/" + storagePath(objectPath);
    return json({url:stableUrl, type:detected.type}, 200, origin);
}
