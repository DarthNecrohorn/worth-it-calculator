export async function onRequestGet(context) {
    const cache = caches.default;

    const cacheUrl = new URL(context.request.url);
    cacheUrl.search = "";

    const cacheRequest = new Request(cacheUrl.toString(), {
        method: "GET"
    });

    // Proveri Cloudflare cache.
    const cachedResponse = await cache.match(cacheRequest);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const response = await fetch(
            "https://api.frankfurter.app/latest?from=USD&to=EUR",
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return new Response(
                JSON.stringify({
                    error: "Unable to load USD to EUR exchange rate."
                }),
                {
                    status: response.status,
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        const rate = Number(data?.rates?.EUR);

        if (!Number.isFinite(rate) || rate <= 0) {
            return new Response(
                JSON.stringify({
                    error: "Invalid USD to EUR exchange rate."
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

        const result = new Response(
            JSON.stringify({
                base: "USD",
                target: "EUR",
                rate: rate,
                date: data.date
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=3600",
                    "Cloudflare-CDN-Cache-Control": "max-age=3600"
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
            "Exchange rate API error:",
            error
        );

        return new Response(
            JSON.stringify({
                error: "Unable to load exchange rate."
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
