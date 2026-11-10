const PREVIEW_HOST_SUFFIX = ".worth-it-calculator.pages.dev";
const PRODUCTION_PAGES_HOST = "worth-it-calculator.pages.dev";

// This key is public by design: only the Supabase publishable key is sent to browsers.
// Keep the staging project isolated from the Production Pages environment.
const PREVIEW_SUPABASE_CONFIG = Object.freeze({
    url: "https://bhqxeoubhqwfziktbvuh.supabase.co",
    publishableKey: "sb_publishable_omhBqeKf_lFjej21UqZgrQ_le1gp5nY"
});

function jsonScript(source, status = 200) {
    return new Response(source, {
        status,
        headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

function validSupabaseUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" &&
            /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) &&
            url.pathname === "/" &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash;
    } catch (_) {
        return false;
    }
}

function validPublishableKey(value) {
    return /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value);
}

function isPagesPreviewHostname(hostname) {
    const normalized = String(hostname || "").toLowerCase();
    return normalized !== PRODUCTION_PAGES_HOST &&
        normalized.endsWith(PREVIEW_HOST_SUFFIX);
}

export async function onRequestGet({ request, env }) {
    let supabaseUrl;
    let publishableKey;

    let hostname = "";
    try {
        hostname = new URL(request.url).hostname;
    } catch (_) {
        // Missing or invalid request context must not be treated as a Pages Preview.
    }

    if (isPagesPreviewHostname(hostname)) {
        supabaseUrl = PREVIEW_SUPABASE_CONFIG.url;
        publishableKey = PREVIEW_SUPABASE_CONFIG.publishableKey;
    } else {
        // Production (including a future custom production domain) uses its
        // separately configured Cloudflare Production environment variables.
        supabaseUrl = String(env?.SUPABASE_URL || "").trim().replace(/\/+$/, "");
        publishableKey = String(env?.SUPABASE_PUBLISHABLE_KEY || "").trim();
    }

    if (!validSupabaseUrl(supabaseUrl) || !validPublishableKey(publishableKey)) {
        return jsonScript(
            'window.WORTH_IT_SUPABASE_CONFIG_ERROR = "Supabase deployment configuration is missing or invalid. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for this environment."; ',
            503
        );
    }

    const publicConfig = JSON.stringify({
        url: supabaseUrl,
        publishableKey
    }).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

    return jsonScript(
        "window.WORTH_IT_SUPABASE_CONFIG = Object.freeze(" + publicConfig + ");"
    );
}
