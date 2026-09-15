export async function onRequestGet(context) {
    try {
        const { env, request } = context;

        if (!env.CARSXE_API_KEY) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "CARSXE_API_KEY is not configured"
                }),
                {
                    status: 500,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        const requestUrl = new URL(request.url);
        const action = requestUrl.searchParams.get("action");

        /*
         * =========================
         * IMAGES
         * =========================
         */

        if (action === "images") {

            const make = requestUrl.searchParams.get("make");
            const model = requestUrl.searchParams.get("model");
            const year = requestUrl.searchParams.get("year");

            if (!make || !model) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Missing make or model parameter"
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
            }

            /*
             * Build a clean cache key.
             *
             * The API key is intentionally NOT included
             * in the cache key.
             */

            const cacheKey = new URL(request.url);

            cacheKey.searchParams.set("action", "images");
            cacheKey.searchParams.set("make", make);
            cacheKey.searchParams.set("model", model);

            if (year) {
                cacheKey.searchParams.set("year", year);
            } else {
                cacheKey.searchParams.delete("year");
            }

            /*
             * Remove anything that should not affect
             * the cached result.
             */

            cacheKey.searchParams.delete("key");

            /*
             * Use Cloudflare's edge cache.
             */

            const cache = caches.default;

            const cachedResponse = await cache.match(cacheKey.toString());

            if (cachedResponse) {
                return cachedResponse;
            }

            /*
             * No cached result.
             * Request images from CarsXE.
             */

            const imagesUrl = new URL(
                "https://api.carsxe.com/images"
            );

            imagesUrl.searchParams.set(
                "key",
                env.CARSXE_API_KEY
            );

            imagesUrl.searchParams.set(
                "make",
                make
            );

            imagesUrl.searchParams.set(
                "model",
                model
            );

            if (year) {
                imagesUrl.searchParams.set(
                    "year",
                    year
                );
            }

            /*
             * Only request commercially shareable images.
             */

            imagesUrl.searchParams.set(
                "license",
                "ShareCommercially"
            );

            const response = await fetch(
                imagesUrl.toString()
            );

            const data = await response.json();

            /*
             * Do not cache failed API responses.
             */

            if (!response.ok) {
                return new Response(
                    JSON.stringify(data),
                    {
                        status: response.status,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
            }

            /*
             * Cache successful image results.
             *
             * 7 days is a good starting point.
             */

            const cacheResponse = new Response(
                JSON.stringify(data),
                {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "public, max-age=604800"
                    }
                }
            );

            await cache.put(
                cacheKey.toString(),
                cacheResponse.clone()
            );

            return cacheResponse;
        }

        /*
         * =========================
         * MODELS
         * =========================
         */

        if (action === "models") {

            const make = requestUrl.searchParams.get("make");

            if (!make) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Missing make parameter"
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
            }

            const carsxeUrl = new URL(
                "https://api.carsxe.com/v1/ymm-options"
            );

            carsxeUrl.searchParams.set(
                "key",
                env.CARSXE_API_KEY
            );

            carsxeUrl.searchParams.set(
                "dimension",
                "models"
            );

            carsxeUrl.searchParams.set(
                "make",
                make
            );

            const response = await fetch(
                carsxeUrl.toString()
            );

            const data = await response.json();

            return new Response(
                JSON.stringify(data),
                {
                    status: response.status,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        /*
         * =========================
         * VEHICLE
         * =========================
         */

        if (action === "vehicle") {

            const year = requestUrl.searchParams.get("year");
            const make = requestUrl.searchParams.get("make");
            const model = requestUrl.searchParams.get("model");

            if (!year || !make || !model) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Missing year, make, or model parameter"
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
            }

            const vehicleUrl = new URL(
                "https://api.carsxe.com/v1/ymm"
            );

            vehicleUrl.searchParams.set(
                "key",
                env.CARSXE_API_KEY
            );

            vehicleUrl.searchParams.set(
                "year",
                year
            );

            vehicleUrl.searchParams.set(
                "make",
                make
            );

            vehicleUrl.searchParams.set(
                "model",
                model
            );

            const response = await fetch(
                vehicleUrl.toString()
            );

            const data = await response.json();

            return new Response(
                JSON.stringify(data),
                {
                    status: response.status,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        /*
         * =========================
         * INVALID ACTION
         * =========================
         */

        return new Response(
            JSON.stringify({
                success: false,
                error: "Invalid action"
            }),
            {
                status: 400,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

    } catch (error) {

        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
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
