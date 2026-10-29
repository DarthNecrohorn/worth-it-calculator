const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";
const STORAGE_BUCKET = "worth-it-avatars";
const CHAT_MEDIA_BUCKET = "worth-it-chat-media";
const PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 20000;

function json(data, status, request) {
    let origin = SITE_ORIGIN;
    try {
        const requested = request?.headers?.get("Origin") || "";
        const requestOrigin = request?.url ? new URL(request.url).origin : SITE_ORIGIN;
        if (requested && requested === requestOrigin) origin = requested;
    } catch (_) {}
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Vary": "Origin"
        }
    });
}

function requestOriginAllowed(request) {
    const origin = request.headers.get("Origin") || "";
    if (!origin) return true;
    try {
        return origin === new URL(request.url).origin || origin === SITE_ORIGIN;
    } catch (_) {
        return false;
    }
}

function getToken(request) {
    const authorization = request.headers.get("Authorization") || "";
    return /^Bearer\s+\S+/i.test(authorization) ? authorization.replace(/^Bearer\s+/i, "").trim() : "";
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
    // Supabase's newer secret keys are API keys and must not be used as Bearer JWTs.
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

async function authorize(context) {
    const request = context.request;
    const config = getConfig(context.env);
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceKey) {
        return { error: json({ success: false, code: "USER_DATA_NOT_CONFIGURED", error: "The account data service is not configured yet." }, 503, request) };
    }
    const token = getToken(request);
    if (!token) {
        return { error: json({ success: false, error: "Sign in to manage your account data." }, 401, request) };
    }
    const user = await verifyUser(config, token);
    if (!user) {
        return { error: json({ success: false, error: "Your login session has expired. Please sign in again." }, 401, request) };
    }
    if (!(user.email_confirmed_at || user.confirmed_at)) {
        return { error: json({ success: false, code: "EMAIL_NOT_CONFIRMED", error: "Confirm your email before managing or exporting account data." }, 403, request) };
    }
    return { config, user, request, token };
}

function isMissingTableError(status, body) {
    return status === 404 || /PGRST205|table .* not found|could not find the table/i.test(String(body || ""));
}

async function readRows(config, table, filters, optional) {
    const rows = [];
    let offset = 0;
    while (true) {
        const params = new URLSearchParams();
        params.set("select", "*");
        Object.entries(filters || {}).forEach(([key, value]) => params.set(key, String(value)));
        const url = config.supabaseUrl + "/rest/v1/" + table + "?" + params.toString();
        const response = await fetch(url, {
            headers: serviceHeaders(config, {
                "Range-Unit": "items",
                "Range": offset + "-" + (offset + PAGE_SIZE - 1)
            })
        });
        const body = await response.text().catch(() => "");
        if (!response.ok) {
            if (optional && isMissingTableError(response.status, body)) return [];
            console.error("Worth It account data query failed:", table, response.status);
            throw new Error("Some account data could not be read. Please try again later.");
        }
        let batch;
        try { batch = JSON.parse(body); } catch (_) {
            throw new Error("The account data response could not be read.");
        }
        if (!Array.isArray(batch)) throw new Error("The account data response was unexpected.");
        // Read one final page at the cap so large exports fail explicitly rather than silently
        // producing an incomplete JSON file.
        if (offset >= MAX_EXPORT_ROWS) {
            if (batch.length) {
                console.error("Worth It account data export exceeds row cap:", table);
                throw new Error("One account-data category exceeds the safe export limit. Contact Worth It support for a complete copy.");
            }
            break;
        }
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        offset += batch.length;
    }
    return rows;
}

async function getProfileAndUsername(config, userId) {
    const [profiles, usernames] = await Promise.all([
        readRows(config, "worth_it_profiles", { user_id: "eq." + userId }),
        readRows(config, "usernames", { user_id: "eq." + userId })
    ]);
    return { profile: profiles[0] || null, username: usernames[0] || null };
}

async function readUserPreferencesForExport(config, accessToken) {
    // Read preferences through the authenticated RPC instead of directly exposing
    // the new preferences table through PostgREST. This keeps exports compatible
    // with projects that require explicit Data API exposure for newly created tables.
    const response = await fetch(config.supabaseUrl + "/rest/v1/rpc/get_worth_it_user_preferences", {
        method: "POST",
        headers: {
            apikey: config.publishableKey,
            Authorization: "Bearer " + accessToken,
            Accept: "application/json",
            "Content-Type": "application/json"
        },
        body: "{}"
    });
    const body = await response.text().catch(() => "");
    if (!response.ok) {
        if (response.status === 404 || /PGRST202|could not find the function .*get_worth_it_user_preferences/i.test(body)) {
            return { available: false, reason: "settings_migration_not_installed" };
        }
        console.error("Worth It account data preferences query failed:", response.status);
        throw new Error("Account settings preferences could not be exported. Please try again later.");
    }
    try {
        const result = JSON.parse(body);
        if (!result || result.success === false) throw new Error("invalid");
        return { available: true, ...result };
    } catch (_) {
        throw new Error("The account settings preferences response could not be read.");
    }
}

async function readUserExport(config, user, accessToken) {
    const profilePromise = getProfileAndUsername(config, user.id);
    const [
        profilesAndUsername, feedback, follows, friends, friendRequests, notifications,
        chatMembers, chatMessages, chatPreferences, dismissedNotifications, shopCache, preferences
    ] = await Promise.all([
        profilePromise,
        readRows(config, "feedback", { user_id: "eq." + user.id }),
        readRows(config, "worth_it_follows", { or: "(follower_user_id.eq." + user.id + ",followed_user_id.eq." + user.id + ")" }),
        readRows(config, "worth_it_friends", { or: "(user_low_id.eq." + user.id + ",user_high_id.eq." + user.id + ")" }),
        readRows(config, "worth_it_friend_requests", { or: "(requester_user_id.eq." + user.id + ",recipient_user_id.eq." + user.id + ")" }),
        readRows(config, "worth_it_social_notifications", { or: "(recipient_user_id.eq." + user.id + ",actor_user_id.eq." + user.id + ")" }),
        readRows(config, "worth_it_chat_members", { user_id: "eq." + user.id }),
        readRows(config, "worth_it_chat_messages", { sender_user_id: "eq." + user.id }),
        readRows(config, "worth_it_chat_notification_preferences", { user_id: "eq." + user.id }),
        readRows(config, "worth_it_notification_dismissals", { user_id: "eq." + user.id }),
        readRows(config, "shop_account_cache", { user_id: "eq." + user.id }, true),
        readUserPreferencesForExport(config, accessToken)
    ]);

    const conversationIds = new Set();
    chatMembers.forEach(row => { if (row.conversation_id) conversationIds.add(String(row.conversation_id)); });
    chatMessages.forEach(row => { if (row.conversation_id) conversationIds.add(String(row.conversation_id)); });

    const ownConversations = await readRows(config, "worth_it_chat_conversations", { created_by: "eq." + user.id }, true);
    ownConversations.forEach(row => { if (row.id) conversationIds.add(String(row.id)); });
    let conversations = [];
    if (conversationIds.size) {
        const ids = Array.from(conversationIds).filter(id => /^[0-9a-f-]{36}$/i.test(id));
        if (ids.length) conversations = await readRows(config, "worth_it_chat_conversations", { id: "in.(" + ids.join(",") + ")" });
    }
    const conversationById = new Map(conversations.map(row => [String(row.id), row]));
    ownConversations.forEach(row => conversationById.set(String(row.id), row));

    return {
        exported_at: new Date().toISOString(),
        service: "Worth It",
        account: {
            id: user.id,
            email: user.email || null,
            phone: user.phone || null,
            created_at: user.created_at || null,
            updated_at: user.updated_at || null,
            last_sign_in_at: user.last_sign_in_at || null,
            email_confirmed_at: user.email_confirmed_at || null,
            phone_confirmed_at: user.phone_confirmed_at || null,
            app_metadata: {
                provider: user.app_metadata?.provider || null,
                providers: Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []
            },
            user_metadata: user.user_metadata || {}
        },
        profile: profilesAndUsername.profile,
        username_record: profilesAndUsername.username,
        feedback_submissions: feedback,
        follows: follows,
        friendships: friends,
        friend_requests: friendRequests,
        social_notifications: notifications,
        chat_memberships: chatMembers,
        chat_conversations: Array.from(conversationById.values()),
        messages_sent_by_you: chatMessages,
        chat_notification_preferences: chatPreferences,
        notification_dismissals: dismissedNotifications,
        shop_account_cache: shopCache,
        settings_preferences: preferences
    };
}

function getStoredAssetPath(config, assetUrl, userId, target) {
    if (typeof assetUrl !== "string" || !assetUrl) return "";
    try {
        const parsed = new URL(assetUrl);
        if (parsed.origin !== new URL(config.supabaseUrl).origin) return "";
        const prefix = "/storage/v1/object/public/" + STORAGE_BUCKET + "/";
        if (!parsed.pathname.startsWith(prefix)) return "";
        const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
        const folder = userId + "/" + target + "/";
        if (!path.startsWith(folder)) return "";
        // These uploads are always stored as one generated filename below the
        // user's avatar/ or banner/ folder. Reject encoded slashes and traversal
        // segments instead of passing a nested path to the privileged delete API.
        const filename = path.slice(folder.length);
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(filename) ||
            filename === "." || filename === "..") return "";
        return path;
    } catch (_) {
        return "";
    }
}

async function deleteStoredAsset(config, objectPath) {
    if (!objectPath) return;
    const response = await fetch(config.supabaseUrl + "/storage/v1/object/" + STORAGE_BUCKET, {
        method: "DELETE",
        headers: serviceHeaders(config, { "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: [objectPath] })
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        if (response.status === 404 && /not found|object/i.test(detail)) return;
        console.error("Worth It account data asset cleanup failed:", response.status);
        throw new Error("Account deletion paused because a profile image could not be removed. Please try again later.");
    }
}

async function listChatMediaPaths(config, userId) {
    const paths = [];
    let offset = 0;

    // Chat uploads are stored as "<auth-user-id>/<filename>" in their own bucket.
    // Enumerate that user's direct files before deleting Auth so a listing failure
    // cannot silently leave the account half-deleted. Folder entries are ignored.
    while (offset <= MAX_EXPORT_ROWS) {
        const response = await fetch(config.supabaseUrl + "/storage/v1/object/list/" + CHAT_MEDIA_BUCKET, {
            method: "POST",
            headers: serviceHeaders(config, { "Content-Type": "application/json" }),
            body: JSON.stringify({
                prefix: userId + "/",
                limit: PAGE_SIZE,
                offset,
                sortBy: { column: "name", order: "asc" }
            })
        });
        const body = await response.text().catch(() => "");
        if (!response.ok) {
            console.error("Worth It chat media inventory failed:", response.status);
            throw new Error("Chat attachments could not be inventoried, so the account was not deleted. Please try again later.");
        }

        let batch;
        try { batch = JSON.parse(body); } catch (_) {
            throw new Error("The chat attachment inventory response could not be read. The account was not deleted.");
        }
        if (!Array.isArray(batch)) {
            throw new Error("The chat attachment inventory response was unexpected. The account was not deleted.");
        }

        for (const item of batch) {
            if (!item || typeof item.name !== "string" ||
                !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(item.name) ||
                item.name === "." || item.name === "..") continue;
            // Storage list responses include folder entries with no object ID or metadata.
            if (item.id == null && item.metadata == null) continue;
            paths.push(userId + "/" + item.name);
        }

        if (offset >= MAX_EXPORT_ROWS && batch.length) {
            throw new Error("There are too many chat attachments to safely process. The account was not deleted.");
        }
        if (batch.length < PAGE_SIZE) break;
        offset += batch.length;
    }
    return Array.from(new Set(paths));
}

async function deleteChatMediaPaths(config, objectPaths) {
    const paths = Array.from(new Set((Array.isArray(objectPaths) ? objectPaths : [])
        .filter(path => typeof path === "string" && path.startsWith("/") === false)));
    for (let i = 0; i < paths.length; i += 1000) {
        const response = await fetch(config.supabaseUrl + "/storage/v1/object/" + CHAT_MEDIA_BUCKET, {
            method: "DELETE",
            headers: serviceHeaders(config, { "Content-Type": "application/json" }),
            body: JSON.stringify({ prefixes: paths.slice(i, i + 1000) })
        });
        if (!response.ok) {
            console.error("Worth It chat media cleanup failed:", response.status);
            throw new Error("Some chat attachments could not be removed.");
        }
    }
}

async function deleteFeedbackSubmissions(config, feedbackRows) {
    const ids = Array.from(new Set((Array.isArray(feedbackRows) ? feedbackRows : [])
        .map(row => String(row?.id ?? ""))
        .filter(id => /^\d+$/.test(id))));
    if (!ids.length) return;

    // Keep DELETE filters bounded, and use IDs captured before Auth deletion because
    // feedback.user_id is intentionally set to NULL by its foreign key on account removal.
    for (let i = 0; i < ids.length; i += 500) {
        const params = new URLSearchParams();
        params.set("id", "in.(" + ids.slice(i, i + 500).join(",") + ")");
        const response = await fetch(config.supabaseUrl + "/rest/v1/feedback?" + params.toString(), {
            method: "DELETE",
            headers: serviceHeaders(config, { "Prefer": "return=minimal" })
        });
        if (!response.ok) {
            console.error("Worth It account feedback cleanup failed:", response.status);
            throw new Error("Some feedback records could not be removed.");
        }
    }
}

async function createSummary(config, user) {
    const data = await getProfileAndUsername(config, user.id);
    const profile = data.profile || {};
    return {
        success: true,
        account: {
            email: user.email || null,
            email_confirmed: Boolean(user.email_confirmed_at),
            created_at: user.created_at || null,
            last_sign_in_at: user.last_sign_in_at || null
        },
        profile: {
            worth_it_id: profile.worth_it_id || null,
            username: data.username?.username || profile.username || user.user_metadata?.username || null,
            display_name: profile.display_name || null,
            description: profile.description || "",
            avatar_set: Boolean(profile.avatar_url),
            banner_set: Boolean(profile.banner_url)
        },
        export_available: true,
        account_deletion_available: true
    };
}

export async function onRequestOptions(context) {
    const request = context?.request;
    if (request && !requestOriginAllowed(request)) return json({ success: false, error: "Forbidden origin." }, 403, request);
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": request?.headers?.get("Origin") || SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Vary": "Origin"
        }
    });
}

export async function onRequestGet(context) {
    const request = context.request;
    try {
        if (!requestOriginAllowed(request)) return json({ success: false, error: "Forbidden origin." }, 403, request);
        const auth = await authorize(context);
        if (auth.error) return auth.error;

        const action = new URL(request.url).searchParams.get("action") || "summary";
        if (action === "export") {
            const payload = await readUserExport(auth.config, auth.user, auth.token);
            return json({ success: true, export: payload }, 200, request);
        }
        if (action !== "summary") return json({ success: false, error: "Unknown account data action." }, 400, request);
        return json(await createSummary(auth.config, auth.user), 200, request);
    } catch (error) {
        console.error("Worth It account data read failed:", error?.message || "Unknown error");
        return json({ success: false, error: error?.message || "Could not load your account data." }, 500, request);
    }
}

export async function onRequestPost(context) {
    const request = context.request;
    try {
        if (!requestOriginAllowed(request)) return json({ success: false, error: "Forbidden origin." }, 403, request);
        const auth = await authorize(context);
        if (auth.error) return auth.error;

        let body;
        try { body = await request.json(); } catch (_) {
            return json({ success: false, error: "Invalid request body." }, 400, request);
        }
        const action = String(body?.action || "");
        if (action === "export") {
            const payload = await readUserExport(auth.config, auth.user, auth.token);
            return json({ success: true, export: payload }, 200, request);
        }
        if (action !== "delete") return json({ success: false, error: "Unknown account data action." }, 400, request);
        if (String(body?.confirmation || "") !== "DELETE") {
            return json({ success: false, error: "Type DELETE exactly to confirm permanent account deletion." }, 400, request);
        }

        const [profileRows, feedbackRows, chatMediaPaths] = await Promise.all([
            readRows(auth.config, "worth_it_profiles", { user_id: "eq." + auth.user.id }),
            readRows(auth.config, "feedback", { user_id: "eq." + auth.user.id }),
            listChatMediaPaths(auth.config, auth.user.id)
        ]);
        const profile = profileRows[0] || null;
        const avatarPath = getStoredAssetPath(auth.config, profile?.avatar_url, auth.user.id, "avatar");
        const bannerPath = getStoredAssetPath(auth.config, profile?.banner_url, auth.user.id, "banner");
        const deleted = await fetch(auth.config.supabaseUrl + "/auth/v1/admin/users/" + encodeURIComponent(auth.user.id), {
            method: "DELETE",
            headers: serviceHeaders(auth.config, { Accept: "application/json" })
        });
        if (!deleted.ok) {
            const detail = await deleted.text().catch(() => "");
            console.error("Worth It account deletion failed:", deleted.status, detail.slice(0, 300));
            return json({ success: false, error: "Supabase could not delete this account. No success was reported; contact support or try again later." }, 502, request);
        }
        // Clean up personal records and public assets only after Auth confirms deletion.
        // The API reports success only when the account itself is deleted; any secondary
        // cleanup failure is surfaced as a warning rather than being silently ignored.
        let cleanupWarning = false;
        try {
            await deleteFeedbackSubmissions(auth.config, feedbackRows);
        } catch (cleanupError) {
            cleanupWarning = true;
            console.error("Worth It account was deleted but feedback cleanup was incomplete:", cleanupError?.message || "Unknown cleanup error");
        }
        for (const objectPath of new Set([avatarPath, bannerPath].filter(Boolean))) {
            try {
                await deleteStoredAsset(auth.config, objectPath);
            } catch (cleanupError) {
                cleanupWarning = true;
                console.error("Worth It account was deleted but profile asset cleanup was incomplete:", cleanupError?.message || "Unknown storage cleanup error");
            }
        }
        try {
            await deleteChatMediaPaths(auth.config, chatMediaPaths);
        } catch (cleanupError) {
            cleanupWarning = true;
            console.error("Worth It account was deleted but chat media cleanup was incomplete:", cleanupError?.message || "Unknown storage cleanup error");
        }
        return json({
            success: true,
            deleted: true,
            cleanup_warning: cleanupWarning,
            warning: cleanupWarning ? "Your account was deleted, but some feedback, profile images, or chat attachments could not be fully removed. Contact Worth It support." : null
        }, 200, request);
    } catch (error) {
        console.error("Worth It account deletion/data action failed:", error?.message || "Unknown error");
        return json({ success: false, error: error?.message || "The account data request could not be completed." }, 500, request);
    }
}
