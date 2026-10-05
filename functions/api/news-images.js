/*
 * WORTH IT — NEWS SOURCE IMAGE RESOLVER
 *
 * Extract the lead image from the original article page.
 * Only explicitly commercially reusable CC/public-domain images are returned.
 */

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_ARTICLES_PER_BATCH = 12;
const MAX_HTML_CHARS = 900000;
const FETCH_TIMEOUT_MS = 6500;

function json(data, status = 200, extraHeaders = {}) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=utf-8",
                "Cache-Control":
                    "no-store",
                ...extraHeaders
            }
        }
    );
}

function normalize(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ");
}

function decodeHtml(value) {
    return normalize(value)
        .replace(/&quot;/gi, '"')
        .replace(/&#34;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

function getAttribute(tag, name) {
    const match =
        String(tag || "").match(
            new RegExp(
                "\\b" +
                name +
                "\\s*=\\s*([\\"'])([\\s\\S]*?)\\1",
                "i"
            )
        );

    return match
        ? decodeHtml(match[2])
        : "";
}

function getMetaValues(html, names) {
    const wanted =
        new Set(
            names.map(
                value =>
                    String(value)
                        .trim()
                        .toLowerCase()
            )
        );

    const out = [];
    const regex =
        /<meta\\b[^>]*>/gi;

    let match;

    while (
        (match = regex.exec(
            String(html || "")
        )) !== null
    ) {

        const tag = match[0];

        const property =
            getAttribute(
                tag,
                "property"
            ).toLowerCase();

        const name =
            getAttribute(
                tag,
                "name"
            ).toLowerCase();

        const key =
            property || name;

        if (
            !wanted.has(key)
        ) {
            continue;
        }

        const content =
            getAttribute(
                tag,
                "content"
            );

        if (content) {
            out.push(content);
        }

    }

    return out;
}

function parseJsonLd(html) {
    const out = [];
    const regex =
        /<script\\b[^>]*type\\s*=\\s*["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi;

    let match;

    while (
        (match = regex.exec(
            String(html || "")
        )) !== null
    ) {

        const raw =
            String(match[1] || "").trim();

        if (!raw) {
            continue;
        }

        try {
            out.push(
                JSON.parse(raw)
            );
        } catch {
            /* Ignore malformed publisher JSON-LD. */
        }

    }

    return out;
}

function walkJson(value, visitor, seen = new Set()) {
    if (
        value === null ||
        value === undefined ||
        typeof value !== "object"
    ) {
        return;
    }

    if (seen.has(value)) {
        return;
    }

    seen.add(value);
    visitor(value);

    if (Array.isArray(value)) {
        value.forEach(
            item =>
                walkJson(
                    item,
                    visitor,
                    seen
                )
        );
        return;
    }

    Object.values(value).forEach(
        child =>
            walkJson(
                child,
                visitor,
                seen
            )
    );
}

function isImageObject(value) {
    const type =
        value?.["@type"];

    const types =
        Array.isArray(type)
            ? type
            : [type];

    return types.some(
        item =>
            String(item || "")
                .toLowerCase()
                .includes("imageobject")
    );
}

function inspectJsonLd(
    blocks,
    articleUrl
) {
    const imageObjects = [];

    blocks.forEach(
        block => {

            walkJson(
                block,
                value => {

                    if (!isImageObject(value)) {
                        return;
                    }

                    const imageUrls = [
                        value.contentUrl,
                        value.url
                    ]
                        .map(
                            item =>
                                resolveImageUrl(
                                    item,
                                    articleUrl
                                )
                        )
                        .filter(Boolean);

                    const license =
                        normalize(
                            value.license
                        );

                    if (
                        imageUrls.length
                    ) {
                        imageObjects.push({
                            images:
                                imageUrls,
                            license
                        });
                    }

                }
            );

        }
    );

    return imageObjects;
}

function licenseKind(value) {
    const text =
        normalize(value)
            .toLowerCase();

    if (!text) {
        return null;
    }

    if (
        text.includes("cc-by-sa") ||
        text.includes("cc by-sa") ||
        text.includes("creativecommons.org/licenses/cc-by-sa")
    ) {
        return "CC BY-SA";
    }

    if (
        text.includes("cc-by-nd") ||
        text.includes("cc by-nd") ||
        text.includes("creativecommons.org/licenses/cc-by-nd")
    ) {
        return "CC BY-ND";
    }

    if (
        text === "cc by" ||
        text === "cc-by" ||
        /creativecommons.org/licenses/cc-by(?:[/?#\\s]|$)/i.test(text)
    ) {
        return "CC BY";
    }

    if (
        text.includes("cc0") ||
        text.includes("public domain") ||
        text.includes("public-domain") ||
        text.includes("creativecommons.org/publicdomain/zero")
    ) {
        return "CC0 / Public Domain";
    }

    if (
        text.includes("non-commercial") ||
        text.includes("noncommercial") ||
        /(?:^|[-\\s])nc(?:[-\\s]|$)/i.test(text)
    ) {
        return "NON-COMMERCIAL";
    }

    return null;
}

function resolveImageUrl(value, articleUrl) {
    const raw =
        normalize(value);

    if (!raw) {
        return "";
    }

    try {
        const resolved =
            new URL(
                raw,
                articleUrl
            );

        return resolved.protocol === "https:"
            ? resolved.toString()
            : "";

    } catch {
        return "";
    }
}

function validateArticleUrl(value) {
    try {
        const url =
            new URL(
                normalize(value)
            );

        if (
            url.protocol !== "https:"
        ) {
            return null;
        }

        const host =
            url.hostname.toLowerCase();

        if (
            host === "localhost" ||
            host.endsWith(".local") ||
            host.endsWith(".internal") ||
            /^127\\./.test(host) ||
            /^10\\./.test(host) ||
            /^192\\.168\\./.test(host) ||
            /^169\\.254\\./.test(host) ||
            /^172\\.(1[6-9]|2[0-9]|3[0-1])\\./.test(host)
        ) {
            return null;
        }

        return url;

    } catch {
        return null;
    }
}

async function inspectArticle(articleUrl) {
    const url =
        validateArticleUrl(
            articleUrl
        );

    if (!url) {
        return {
            status: "unavailable",
            image: "",
            reason:
                "The source article URL is invalid or not a public HTTPS website."
        };
    }

    const cache =
        caches.default;

    const cacheKey =
        new Request(
            "https://worth-it-news-image-cache.local/?article=" +
            encodeURIComponent(
                url.toString()
            )
        );

    try {
        const cached =
            await cache.match(
                cacheKey
            );

        if (cached) {
            return await cached.json();
        }
    } catch {
        /* Continue with the source page. */
    }

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () =>
                controller.abort(),
            FETCH_TIMEOUT_MS
        );

    let result;

    try {

        const response =
            await fetch(
                url.toString(),
                {
                    method: "GET",
                    redirect: "follow",
                    signal:
                        controller.signal,
                    headers: {
                        "Accept":
                            "text/html,application/xhtml+xml",
                        "User-Agent":
                            "Worth-It-News-ImageResolver/1.0 (+https://worth-it-calculator.pages.dev/)"
                    }
                }
            );

        if (
            !response.ok
        ) {

            result = {
                status: "unavailable",
                image: "",
                reason:
                    "The source website could not be checked."
            };

        } else {

            const contentType =
                String(
                    response.headers.get(
                        "content-type"
                    ) || ""
                ).toLowerCase();

            if (
                !contentType.includes("text/html") &&
                !contentType.includes("application/xhtml+xml")
            ) {

                result = {
                    status: "unavailable",
                    image: "",
                    reason:
                        "The source URL did not return an article page."
                };

            } else {

                const html =
                    (
                        await response.text()
                    ).slice(
                        0,
                        MAX_HTML_CHARS
                    );

                const metaImages =
                    getMetaValues(
                        html,
                        [
                            "og:image",
                            "og:image:url",
                            "twitter:image",
                            "twitter:image:src"
                        ]
                    );

                const jsonLdImages =
                    inspectJsonLd(
                        parseJsonLd(html),
                        url.toString()
                    );

                const candidates = [
                    ...metaImages.map(
                        candidate =>
                            resolveImageUrl(
                                candidate,
                                url.toString()
                            )
                    ),
                    ...jsonLdImages.flatMap(
                        item =>
                            item.images
                    )
                ].filter(Boolean);

                const imageUrl =
                    candidates[0] || "";

                if (!imageUrl) {

                    result = {
                        status: "blocked",
                        image: "",
                        reason:
                            "No public lead image was found on the source article."
                    };

                } else {

                    const metaLicenses =
                        getMetaValues(
                            html,
                            [
                                "og:image:license",
                                "image:license",
                                "twitter:image:license"
                            ]
                        );

                    const selectedJsonLdLicenses =
                        jsonLdImages
                            .filter(
                                item =>
                                    item.images.includes(
                                        imageUrl
                                    ) &&
                                    item.license
                            )
                            .map(
                                item =>
                                    item.license
                            );

                    const licenses = [
                        ...metaLicenses,
                        ...selectedJsonLdLicenses
                    ];

                    const allowedLicense =
                        licenses
                            .map(
                                license => ({
                                    raw:
                                        license,
                                    kind:
                                        licenseKind(
                                            license
                                        )
                                })
                            )
                            .find(
                                item =>
                                    [
                                        "CC BY",
                                        "CC BY-SA",
                                        "CC BY-ND",
                                        "CC0 / Public Domain"
                                    ].includes(
                                        item.kind
                                    )
                            );

                    const nonCommercial =
                        licenses.some(
                            license =>
                                licenseKind(
                                    license
                                ) ===
                                "NON-COMMERCIAL"
                        );

                    if (
                        nonCommercial &&
                        !allowedLicense
                    ) {

                        result = {
                            status: "blocked",
                            image: "",
                            reason:
                                "The source image is marked non-commercial."
                        };

                    } else if (
                        !allowedLicense
                    ) {

                        result = {
                            status: "blocked",
                            image: "",
                            reason:
                                "Commercial-use copyright permission for the source image could not be verified."
                        };

                    } else {

                        result = {
                            status: "allowed",
                            image:
                                imageUrl,
                            reason: "",
                            license:
                                allowedLicense.kind,
                            licenseSource:
                                allowedLicense.raw,
                            sourceArticle:
                                url.toString()
                        };

                    }

                }

            }

        }

    } catch (error) {

        result = {
            status: "unavailable",
            image: "",
            reason:
                error?.name === "AbortError"
                    ? "The source website took too long to respond."
                    : "The source website could not be checked."
        };

    } finally {
        clearTimeout(
            timeout
        );
    }

    try {
        await cache.put(
            cacheKey,
            new Response(
                JSON.stringify(result),
                {
                    headers: {
                        "Content-Type":
                            "application/json; charset=utf-8",
                        "Cache-Control":
                            "public, max-age=" +
                            CACHE_TTL_SECONDS
                    }
                }
            )
        );
    } catch {
        /* Cache is an optimization. */
    }

    return result;
}

async function mapWithConcurrency(
    urls,
    concurrency
) {
    const results =
        new Array(
            urls.length
        );

    let nextIndex = 0;

    async function runWorker() {

        while (true) {

            const index =
                nextIndex++;

            if (
                index >= urls.length
            ) {
                return;
            }

            try {
                results[index] =
                    await inspectArticle(
                        urls[index]
                    );
            } catch {
                results[index] = {
                    status: "unavailable",
                    image: "",
                    reason:
                        "The source website could not be checked."
                };
            }

        }

    }

    await Promise.all(
        Array.from(
            {
                length:
                    Math.min(
                        concurrency,
                        urls.length
                    )
            },
            () => runWorker()
        )
    );

    return results;
}

export async function onRequestPost(
    context
) {

    let body;

    try {
        body =
            await context.request.json();
    } catch {
        return json(
            {
                ok: false,
                error:
                    "Invalid JSON request."
            },
            400
        );
    }

    const urls = [
        ...new Set(
            (
                Array.isArray(
                    body?.articles
                )
                    ? body.articles
                    : []
            )
                .map(
                    item =>
                        normalize(
                            typeof item === "string"
                                ? item
                                : item?.url
                        )
                )
                .filter(Boolean)
        )
    ].slice(
        0,
        MAX_ARTICLES_PER_BATCH
    );

    if (!urls.length) {
        return json({
            ok: true,
            results: {}
        });
    }

    const decisions =
        await mapWithConcurrency(
            urls,
            4
        );

    const results = {};
    const usedImages =
        new Set();

    urls.forEach(
        (url, index) => {

            const decision =
                decisions[index];

            if (
                decision?.status === "allowed" &&
                decision?.image
            ) {

                const imageKey =
                    decision.image
                        .trim()
                        .toLowerCase();

                if (
                    usedImages.has(
                        imageKey
                    )
                ) {

                    results[url] = {
                        status: "blocked",
                        image: "",
                        reason:
                            "The same source image was already assigned to another News card."
                    };

                    return;
                }

                usedImages.add(
                    imageKey
                );

            }

            results[url] =
                decision;

        }
    );

    return json({
        ok: true,
        count: urls.length,
        results
    });
}

export async function onRequestGet() {
    return json(
        {
            ok: false,
            error:
                "Use POST /api/news-images."
        },
        405,
        {
            Allow: "POST"
        }
    );
}
