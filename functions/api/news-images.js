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
    const input =
        String(tag || "");

    const lower =
        input.toLowerCase();

    const needle =
        String(name || "").toLowerCase() +
        "=";

    const index =
        lower.indexOf(
            needle
        );

    if (index < 0) {
        return "";
    }

    const rest =
        input.slice(
            index + needle.length
        ).trimStart();

    if (!rest) {
        return "";
    }

    const quote =
        rest.charAt(0);

    if (
        quote === '"' ||
        quote === "'"
    ) {

        const endIndex =
            rest.indexOf(
                quote,
                1
            );

        if (endIndex >= 0) {
            return decodeHtml(
                rest.slice(
                    1,
                    endIndex
                )
            );
        }

    }

    return decodeHtml(
        rest.split(/\s+/)[0]
    );
}


function getFirstSrcsetUrl(value, articleUrl) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const first = raw
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)[0] || "";

    const candidate = first
        .replace(/\s+(?:\d+(?:\.\d+)?x|\d+w)$/i, "")
        .trim();

    return resolveImageUrl(
        candidate,
        articleUrl
    );
}

function extractEnclosingFigure(html, index) {
    const input = String(html || "");
    const open = input.lastIndexOf("<figure", index);
    const close = input.lastIndexOf("</figure", index);

    if (open < 0 || close > open) {
        return "";
    }

    const end = input.indexOf("</figure", index);
    if (end < 0) {
        return "";
    }

    return input.slice(
        open,
        end + 8
    );
}

function extractEnclosingPicture(html, index) {
    const input = String(html || "");
    const open = input.lastIndexOf("<picture", index);
    const close = input.lastIndexOf("</picture", index);

    if (open < 0 || close > open) {
        return "";
    }

    const end = input.indexOf("</picture", index);
    if (end < 0) {
        return "";
    }

    return input.slice(
        open,
        end + 9
    );
}

function getImageTagCandidates(
    html,
    articleUrl
) {
    const out = [];
    const input = String(html || "");
    const regex = /<img\b[^>]*>/gi;
    let match;

    while (
        (match = regex.exec(input)) !== null
    ) {
        const tag = match[0];
        const index = match.index;

        const className =
            getAttribute(
                tag,
                "class"
            ).toLowerCase();

        const id =
            getAttribute(
                tag,
                "id"
            ).toLowerCase();

        const alt =
            getAttribute(
                tag,
                "alt"
            );

        const title =
            getAttribute(
                tag,
                "title"
            );

        const width =
            Number.parseInt(
                getAttribute(
                    tag,
                    "width"
                ),
                10
            );

        const height =
            Number.parseInt(
                getAttribute(
                    tag,
                    "height"
                ),
                10
            );

        if (
            Number.isFinite(width) &&
            width > 0 &&
            width < 140
        ) {
            continue;
        }

        if (
            Number.isFinite(height) &&
            height > 0 &&
            height < 140
        ) {
            continue;
        }

        const identity =
            (
                className +
                " " +
                id +
                " " +
                alt +
                " " +
                title
            ).toLowerCase();

        if (
            /(logo|favicon|sprite|avatar|icon|emoji|tracking|pixel|advert|adsbygoogle)/i.test(
                identity
            )
        ) {
            continue;
        }

        const urls = [
            getAttribute(
                tag,
                "src"
            ),
            getAttribute(
                tag,
                "data-src"
            ),
            getAttribute(
                tag,
                "data-original"
            ),
            getAttribute(
                tag,
                "data-lazy-src"
            ),
            getAttribute(
                tag,
                "data-lazyload"
            ),
            getAttribute(
                tag,
                "data-image"
            ),
            getFirstSrcsetUrl(
                getAttribute(
                    tag,
                    "srcset"
                ),
                articleUrl
            ),
            getFirstSrcsetUrl(
                getAttribute(
                    tag,
                    "data-srcset"
                ),
                articleUrl
            )
        ]
            .map(
                value =>
                    resolveImageUrl(
                        value,
                        articleUrl
                    )
            )
            .filter(Boolean);

        const picture =
            extractEnclosingPicture(
                input,
                index
            );

        if (picture) {
            urls.push(
                ...[
                    ...Array.from(
                        picture.matchAll(
                            /<(?:source|img)\b[^>]*>/gi
                        )
                    )
                ]
                    .map(
                        sourceMatch => {
                            const sourceTag =
                                sourceMatch[0];

                            return [
                                getAttribute(
                                    sourceTag,
                                    "src"
                                ),
                                getAttribute(
                                    sourceTag,
                                    "data-src"
                                ),
                                getFirstSrcsetUrl(
                                    getAttribute(
                                        sourceTag,
                                        "srcset"
                                    ),
                                    articleUrl
                                ),
                                getFirstSrcsetUrl(
                                    getAttribute(
                                        sourceTag,
                                        "data-srcset"
                                    ),
                                    articleUrl
                                )
                            ]
                                .map(
                                    value =>
                                        resolveImageUrl(
                                            value,
                                            articleUrl
                                        )
                                )
                                .filter(Boolean);
                        }
                    )
                    .flat()
            );
        }

        const uniqueUrls = [
            ...new Set(
                urls
                    .map(
                        value =>
                            String(
                                value || ""
                            ).trim()
                    )
                    .filter(Boolean)
            )
        ];

        if (!uniqueUrls.length) {
            continue;
        }

        const figure =
            extractEnclosingFigure(
                input,
                index
            );

        const figureCaptionMatch =
            figure.match(
                /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i
            );

        const figureCaption =
            figureCaptionMatch
                ? decodeHtml(
                    figureCaptionMatch[1]
                )
                : "";

        const licenseHints = [
            getAttribute(
                tag,
                "data-license"
            ),
            getAttribute(
                tag,
                "data-image-license"
            ),
            getAttribute(
                tag,
                "data-rights"
            ),
            getAttribute(
                tag,
                "data-image-rights"
            ),
            getAttribute(
                tag,
                "data-copyright"
            ),
            figureCaption
        ]
            .map(
                value =>
                    normalize(value)
            )
            .filter(Boolean);

        const credit =
            normalize(
                getAttribute(
                    tag,
                    "data-credit"
                ) ||
                getAttribute(
                    tag,
                    "data-image-credit"
                ) ||
                figureCaption
            );

        out.push({
            images: uniqueUrls,
            licenses: licenseHints,
            credit
        });

        if (out.length >= 50) {
            break;
        }
    }

    return out;
}

function imageUrlKey(value) {
    try {
        const url =
            new URL(
                String(value || "").trim()
            );

        url.hash = "";

        return url.toString();
    } catch {
        return String(value || "")
            .trim()
            .toLowerCase();
    }
}

function collectImageEvidence(
    imageObjects,
    htmlImageObjects,
    targetImage
) {
    const targetKey =
        imageUrlKey(
            targetImage
        );

    const matchingJsonLd =
        imageObjects.filter(
            item =>
                item.images.some(
                    image =>
                        imageUrlKey(
                            image
                        ) === targetKey
                )
        );

    const matchingHtml =
        htmlImageObjects.filter(
            item =>
                item.images.some(
                    image =>
                        imageUrlKey(
                            image
                        ) === targetKey
                )
        );

    return {
        licenses: [
            ...matchingJsonLd.flatMap(
                item =>
                    item.licenses ||
                    (
                        item.license
                            ? [item.license]
                            : []
                    )
            ),
            ...matchingHtml.flatMap(
                item =>
                    item.licenses || []
            )
        ]
            .map(
                value =>
                    normalize(value)
            )
            .filter(Boolean),
        credit:
            matchingJsonLd
                .map(
                    item =>
                        item.creator
                )
                .find(Boolean) ||
            matchingHtml
                .map(
                    item =>
                        item.credit
                )
                .find(Boolean) ||
            ""
    };
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
        /<meta\b[^>]*>/gi;

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
        /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

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

                    if (!imageUrls.length) {
                        return;
                    }

                    const creator =
                        normalize(
                            value.creator?.name ||
                            value.creator ||
                            value.author?.name ||
                            value.author ||
                            value.creditText ||
                            value.copyrightHolder?.name ||
                            value.copyrightHolder ||
                            ""
                        );

                    const licenses = [
                        value.license,
                        value.copyrightNotice
                    ]
                        .map(
                            item =>
                                normalize(item)
                        )
                        .filter(Boolean);

                    imageObjects.push({
                        images: [
                            ...new Set(
                                imageUrls
                            )
                        ],
                        licenses,
                        license:
                            licenses[0] || "",
                        creator
                    });
                }
            );
        }
    );

    return imageObjects;
}

function licenseKind(value) {
    const text =
        normalize(value)
            .toLowerCase()
            .replace(/[\u2010-\u2015]/g, "-");

    if (!text) {
        return null;
    }

    if (
        text.includes("non-commercial") ||
        text.includes("noncommercial") ||
        /(?:^|[-\s_/])nc(?:[-\s_/]|$)/i.test(text)
    ) {
        return "NON-COMMERCIAL";
    }

    if (
        text.includes("cc-by-sa") ||
        text.includes("cc by-sa") ||
        text.includes(
            "creativecommons.org/licenses/cc-by-sa"
        ) ||
        text.includes(
            "creativecommons.org/licenses/by-sa/"
        ) ||
        text.includes(
            "attribution-sharealike"
        )
    ) {
        return "CC BY-SA";
    }

    if (
        text.includes("cc-by-nd") ||
        text.includes("cc by-nd") ||
        text.includes(
            "creativecommons.org/licenses/cc-by-nd"
        ) ||
        text.includes(
            "creativecommons.org/licenses/by-nd/"
        ) ||
        text.includes(
            "attribution-noderivatives"
        ) ||
        text.includes(
            "attribution-no-derivatives"
        )
    ) {
        return "CC BY-ND";
    }

    if (
        text === "cc by" ||
        text === "cc-by" ||
        text.includes(
            "creative commons attribution 4.0"
        ) ||
        text.includes(
            "creative commons attribution 3.0"
        ) ||
        text.includes(
            "creativecommons.org/licenses/cc-by"
        ) ||
        /creativecommons\.org\/licenses\/(?:cc-)?by(?:[/?#\s]|$)/i.test(
            text
        )
    ) {
        return "CC BY";
    }

    if (
        text.includes("cc0") ||
        text.includes("public domain") ||
        text.includes("public-domain") ||
        text.includes("publicdomain") ||
        text.includes(
            "creativecommons.org/publicdomain/zero"
        ) ||
        text.includes(
            "creative commons zero"
        )
    ) {
        return "CC0 / Public Domain";
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
            /^127\./.test(host) ||
            /^10\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^169\.254\./.test(host) ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
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
            "https://worth-it-news-image-cache.local/?v=3&article=" +
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
                    )
                        .map(
                            candidate =>
                                resolveImageUrl(
                                    candidate,
                                    url.toString()
                                )
                        )
                        .filter(Boolean);

                const jsonLdImages =
                    inspectJsonLd(
                        parseJsonLd(html),
                        url.toString()
                    );

                const htmlImageObjects =
                    getImageTagCandidates(
                        html,
                        url.toString()
                    );

                /*
                 * Preserve source lead-image priority:
                 * 1. Open Graph / Twitter lead image
                 * 2. JSON-LD ImageObject
                 * 3. First plausible HTML image
                 *
                 * We only permit a decision when licensing evidence
                 * is attached to that exact selected image.
                 */
                const candidates = [
                    ...metaImages.map(
                        image => ({
                            image,
                            priority: 1
                        })
                    ),
                    ...jsonLdImages.flatMap(
                        item =>
                            item.images.map(
                                image => ({
                                    image,
                                    priority: 2
                                })
                            )
                    ),
                    ...htmlImageObjects.flatMap(
                        item =>
                            item.images.map(
                                image => ({
                                    image,
                                    priority: 3
                                })
                            )
                    )
                ]
                    .sort(
                        (a, b) =>
                            a.priority -
                            b.priority
                    );

                const imageUrl =
                    candidates
                        .map(
                            item =>
                                item.image
                        )
                        .find(Boolean) ||
                    "";

                if (!imageUrl) {

                    result = {
                        status: "blocked",
                        image: "",
                        reason:
                            "No public lead image was found on the source article."
                    };

                } else {

                    /*
                     * Only image-specific license signals count.
                     * A generic page/article CC license does not
                     * automatically grant rights to third-party images.
                     */
                    const imageSpecificMetaLicenses =
                        getMetaValues(
                            html,
                            [
                                "og:image:license",
                                "image:license",
                                "twitter:image:license"
                            ]
                        );

                    const evidence =
                        collectImageEvidence(
                            jsonLdImages,
                            htmlImageObjects,
                            imageUrl
                        );

                    const licenses = [
                        ...imageSpecificMetaLicenses,
                        ...evidence.licenses
                    ]
                        .map(
                            value =>
                                normalize(value)
                        )
                        .filter(Boolean);

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

                    const imageCredit =
                        evidence.credit ||
                        getMetaValues(
                            html,
                            [
                                "og:image:credit",
                                "twitter:image:credit"
                            ]
                        )[0] ||
                        "";

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
                            licenseUrl:
                                /^https:\/\//i.test(
                                    allowedLicense.raw
                                )
                                    ? allowedLicense.raw
                                    : "",
                            credit:
                                normalize(
                                    imageCredit
                                ),
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
