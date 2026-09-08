export async function onRequestGet(context) {
    const apiKey = context.env.OILPRICEAPI_KEY;

    if (!apiKey) {
        return new Response(
            JSON.stringify({
                error: "OILPRICEAPI_KEY is not configured."
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    }

    const codes = [
        "GOLD_USD",
        "SILVER_USD",
        "PLATINUM_USD",
        "PALLADIUM_USD",
        "COPPER_USD",
        "IRON_ORE_USD",
        "ALUMINUM_USD",
        "WTI_USD",
        "NATURAL_GAS_USD"
    ];

    const cache = caches.default;

    const cacheUrl = new URL(context.request.url);
    cacheUrl.search = "";

    const cacheRequest = new Request(
        cacheUrl.toString(),
        {
            method: "GET"
        }
    );

    const cachedResponse =
        await cache.match(cacheRequest);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const response =
            await fetch(
                `https://api.oilpriceapi.com/v1/prices/latest?by_code=${codes.join(",")}`,
                {
                    headers: {
                        "Authorization": `Token ${apiKey}`,
                        "Content-Type": "application/json"
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            return new Response(
                JSON.stringify(data),
                {
                    status: response.status,
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        const result =
            new Response(
                JSON.stringify(data),
                {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "public, max-age=300",
                        "Cloudflare-CDN-Cache-Control": "max-age=300"
                    }
                }
            );

        await cache.put(
            cacheRequest,
            result.clone()
        );

        return result;

    } catch (error) {

        console.error(
            "Markets API error:",
            error
        );

        return new Response(
            JSON.stringify({
                error: "Unable to load market data."
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store"
                }
            }
        );
    }
}
