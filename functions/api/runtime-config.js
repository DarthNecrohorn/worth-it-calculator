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

export async function onRequestGet({ env }) {
    const supabaseUrl = String(env?.SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const publishableKey = String(env?.SUPABASE_PUBLISHABLE_KEY || "").trim();

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
