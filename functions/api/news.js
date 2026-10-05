import { recordAdminApiUsage } from "../lib/admin-usage.js";

function normalizeNewsImageUrl(value) {

    return String(
        value || ""
    )
        .trim()
        .replace(
            /^http:\/\//i,
            "https://"
        );

}

export async function onRequestGet(context) {

    /* =========================================================
       CACHE
    ========================================================= */

    /*
     * 12 hours.
     *
     * News is served from the Cloudflare cache between refreshes.
     * A longer TTL reduces upstream traffic and D1 usage while
     * still keeping the feed refreshed regularly.
     */

    const CACHE_TTL =
        12 * 60 * 60;


    const cache =
        caches.default;


    /*
     * v13 = Open Newswire multi-query source with a fresh cache namespace.
     *
     * Multiple focused Open Newswire requests may be merged per category.
     */

    const requestUrl =
        new URL(
            context.request.url
        );


    const cacheKeyUrl =
        `${requestUrl.origin}${requestUrl.pathname}/?news-cache=v25`;


    const cacheKey =
        new Request(
            cacheKeyUrl,
            {
                method: "GET"
            }
        );


    const cachedResponse =
        await cache.match(
            cacheKey
        );


    if (cachedResponse) {

const generatedAt =
            new Date().toISOString();

        const response =
            Response.json(
                {
                    ...output,
                    __meta: {
                        generatedAt,
                        cacheTtlSeconds:
                            CACHE_TTL
                    }
                },
                {
                    headers: {

                        "Cache-Control":
                            `public, max-age=0, s-maxage=${CACHE_TTL}`,

                        "X-News-Cache":
                            "MISS",

                        "X-News-Generated-At":
                            generatedAt

                    }
                }
            );


        /* =====================================================
           CLOUDFLARE CACHE
        ===================================================== */

        context.waitUntil(
            cache.put(
                cacheKey,
                response.clone()
            )
        );


        return response;


    } catch (error) {

        console.error(
            "Open Newswire API error:",
            error
        );


        return Response.json(
            {
                error:
                    "Unable to load news."
            },
            {
                status: 500
            }
        );

    }

}
