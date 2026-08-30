const SITE_ORIGIN = "https://worth-it-calculator.pages.dev";

function responseJson(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        }
    });
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": SITE_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        }
    });
}

export async function onRequestPost(context) {
    const request = context.request;
    const env = context.env;

    try {
        const origin = request.headers.get("Origin") || "";

        if (origin && origin !== SITE_ORIGIN) {
            return responseJson(
                { error: "Forbidden origin." },
                403
            );
        }

        let body;

        try {
            body = await request.json();
        } catch (error) {
            return responseJson(
                { error: "Invalid JSON request." },
                400
            );
        }

        const type =
            body && body.type === "suggestion"
                ? "suggestion"
                : body && body.type === "bug"
                    ? "bug"
                    : "";

        const message =
            body && typeof body.message === "string"
                ? body.message.trim()
                : "";

        const page =
            body && typeof body.page === "string"
                ? body.page.slice(0, 500)
                : "";

        if (!type) {
            return responseJson(
                { error: "Invalid feedback type." },
                400
            );
        }

        if (!message) {
            return responseJson(
                { error: "Please enter a message." },
                400
            );
        }

        if (message.length > 4000) {
            return responseJson(
                { error: "Message is too long." },
                400
            );
        }

        const supabaseUrl =
            String(env.SUPABASE_URL || "").trim();

        const supabaseKey =
            String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();

        if (!supabaseUrl || !supabaseKey) {
            console.error(
                "Supabase environment variables are missing."
            );

            return responseJson(
                { error: "Feedback service is not configured." },
                500
            );
        }

        const supabaseResponse = await fetch(
            supabaseUrl + "/rest/v1/feedback",
            {
                method: "POST",
                headers: {
                    "apikey": supabaseKey,
                    "Authorization": "Bearer " + supabaseKey,
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify({
                    type: type,
                    message: message,
                    page: page || null
                })
            }
        );

        if (!supabaseResponse.ok) {
            const errorText =
                await supabaseResponse.text().catch(function () {
                    return "";
                });

            console.error(
                "Supabase feedback insert failed:",
                supabaseResponse.status,
                errorText
            );

            return responseJson(
                { error: "Could not save feedback." },
                500
            );
        }

        return responseJson(
            { success: true },
            200
        );

    } catch (error) {
        console.error(
            "Unhandled feedback error:",
            error
        );

        return responseJson(
            { error: "Feedback request failed." },
            500
        );
    }
}
