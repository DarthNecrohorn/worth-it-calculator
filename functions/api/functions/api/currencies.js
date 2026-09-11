/* =========================================================
   CURRENCIES API
========================================================= */

export async function onRequest(context) {

    try {

        const response = await fetch(
            "https://api.frankfurter.dev/v2/currencies"
        );

        if (!response.ok) {
            throw new Error(
                `Frankfurter error: ${response.status}`
            );
        }

        const currencies = await response.json();

        return new Response(
            JSON.stringify(currencies),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control":
                        "public, max-age=3600"
                }
            }
        );

    } catch (error) {

        return new Response(
            JSON.stringify({
                error: "Failed to load currencies"
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

    }
}
