/*
 * ============================================================
 * WORTH IT - VEHICLES API
 * VehiclesDB Open Dataset
 *
 * Supports:
 *   car
 *   motorcycle
 *   moped
 *   van
 *   truck
 *   bus
 *
 * No API key required.
 * VehiclesDB Open Dataset: CC BY 4.0
 * Attribution required on the website.
 * ============================================================
 */

const VEHICLES_DB_URL =
    "https://cdn.jsdelivr.net/gh/vehiclesdb/vehiclesdb@latest/dist/vehicles.json";

const CACHE_TTL = 86400; // 24 hours

const VALID_KINDS = new Set([
    "car",
    "motorcycle",
    "moped",
    "van",
    "truck",
    "bus"
]);

/*
 * ------------------------------------------------------------
 * Response helper
 * ------------------------------------------------------------
 */

function jsonResponse(
    data,
    status = 200,
    cacheSeconds = CACHE_TTL
) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=UTF-8",

                "Cache-Control":
                    `public, max-age=${cacheSeconds}`
            }
        }
    );
}

/*
 * ------------------------------------------------------------
 * Normalization helpers
 * ------------------------------------------------------------
 */

function normalizeKind(kind) {

    if (!kind) {
        return "car";
    }

    const value =
        String(kind)
            .trim()
            .toLowerCase();

    const aliases = {
        car: "car",
        cars: "car",

        motorcycle: "motorcycle",
        motorcycles: "motorcycle",
        bike: "motorcycle",
        bikes: "motorcycle",

        moped: "moped",
        mopeds: "moped",

        van: "van",
        vans: "van",

        truck: "truck",
        trucks: "truck",

        bus: "bus",
        buses: "bus"
    };

    return aliases[value] || "car";
}

function isValidKind(kind) {
    return VALID_KINDS.has(kind);
}

function normalizeText(value) {

    return String(value || "")
        .trim()
        .toLowerCase();
}

function simplifyText(value) {

    return normalizeText(value)
        .replace(/[^a-z0-9]/g, "");
}

/*
 * ------------------------------------------------------------
 * VehiclesDB loader
 * ------------------------------------------------------------
 */

async function loadVehiclesDatabase() {

    const cache =
        caches.default;

    const cacheKey =
        new Request(
            "https://worth-it-internal-cache.local/vehiclesdb/latest.json"
        );

    const cached =
        await cache.match(cacheKey);

    if (cached) {

        try {

            const cachedData =
                await cached.json();

            if (
                cachedData &&
                Array.isArray(cachedData.makes)
            ) {
                return cachedData;
            }

        } catch {

            // Ignore invalid cached data.
        }
    }

    const response =
        await fetch(
            VEHICLES_DB_URL,
            {
                headers: {
                    "Accept": "application/json"
                }
            }
        );

    if (!response.ok) {

        throw new Error(
            `VehiclesDB request failed with status ${response.status}`
        );
    }

    const data =
        await response.json();

    if (
        !data ||
        !Array.isArray(data.makes)
    ) {

        throw new Error(
            "VehiclesDB returned an invalid dataset"
        );
    }

    /*
     * Cache the complete dataset at Cloudflare edge.
     */

    const cacheResponse =
        new Response(
            JSON.stringify(data),
            {
                status: 200,
                headers: {
                    "Content-Type":
                        "application/json; charset=UTF-8",

                    "Cache-Control":
                        `public, max-age=${CACHE_TTL}`
                }
            }
        );

    await cache.put(
        cacheKey,
        cacheResponse
    );

    return data;
}

/*
 * ------------------------------------------------------------
 * Extract models for a specific vehicle kind
 * ------------------------------------------------------------
 */

function getModelsByKind(
    database,
    kind
) {

    if (
        !database ||
        !Array.isArray(database.makes) ||
        !isValidKind(kind)
    ) {
        return [];
    }

    const models = [];

    for (const make of database.makes) {

        if (
            !make ||
            !Array.isArray(make.models)
        ) {
            continue;
        }

        for (const model of make.models) {

            if (!model) {
                continue;
            }

            const modelKind =
                normalizeKind(model.kind);

            if (modelKind !== kind) {
                continue;
            }

            models.push({

                make:
                    make.name || "",

                makeSlug:
                    make.slug || "",

                model:
                    model.name || "",

                modelSlug:
                    model.slug || "",

                kind:
                    modelKind,

                bodyType:
                    model.body_type || null,

                bodyTypes:
                    Array.isArray(model.body_types)
                        ? model.body_types
                        : [],

                globalDecile:
                    model.global_decile ??
                    model.global_popularity_decile ??
                    null,

                availability:
                    Array.isArray(model.availability)
                        ? model.availability
                        : [],

                yearStart:
                    model.year_start ??
                    null,

                yearEnd:
                    model.year_end ??
                    null
            });
        }
    }

    /*
     * Remove duplicate make/model/kind combinations.
     */

    const unique =
        new Map();

    for (const vehicle of models) {

        const key =
            `${simplifyText(vehicle.make)}|` +
            `${simplifyText(vehicle.model)}|` +
            `${vehicle.kind}`;

        if (!unique.has(key)) {
            unique.set(
                key,
                vehicle
            );
        }
    }

    return Array.from(
        unique.values()
    );
}

/*
 * ------------------------------------------------------------
 * Find vehicle
 * ------------------------------------------------------------
 */

function findVehicle(
    models,
    make,
    model
) {

    const targetMake =
        normalizeText(make);

    const targetModel =
        normalizeText(model);

    /*
     * 1. Exact match
     */

    const exact =
        models.find(vehicle =>
            normalizeText(vehicle.make) ===
                targetMake &&
            normalizeText(vehicle.model) ===
                targetModel
        );

    if (exact) {
        return exact;
    }

    /*
     * 2. Simplified match
     *
     * Example:
     * Mercedes-Benz
     * Mercedes Benz
     */

    const simplifiedMake =
        simplifyText(make);

    const simplifiedModel =
        simplifyText(model);

    const simplified =
        models.find(vehicle =>
            simplifyText(vehicle.make) ===
                simplifiedMake &&
            simplifyText(vehicle.model) ===
                simplifiedModel
        );

    if (simplified) {
        return simplified;
    }

    /*
     * 3. Partial model match
     *
     * Only allow this when the make itself matches.
     */

    return (
        models.find(vehicle => {

            const vehicleMake =
                normalizeText(vehicle.make);

            const vehicleModel =
                normalizeText(vehicle.model);

            return (
                vehicleMake === targetMake &&
                targetModel &&
                (
                    vehicleModel.includes(
                        targetModel
                    ) ||
                    targetModel.includes(
                        vehicleModel
                    )
                )
            );

        }) || null
    );
}

/*
 * ------------------------------------------------------------
 * Create frontend-compatible vehicle object
 * ------------------------------------------------------------
 */

function createBestMatch(
    vehicle,
    requestedYear
) {

    if (!vehicle) {
        return null;
    }

    let year =
        requestedYear
            ? Number(requestedYear)
            : null;

    if (
        !Number.isFinite(year) ||
        year <= 0
    ) {
        year = null;
    }

    const startYear =
        vehicle.yearStart !== null &&
        vehicle.yearStart !== undefined
            ? Number(vehicle.yearStart)
            : null;

    const endYear =
        vehicle.yearEnd !== null &&
        vehicle.yearEnd !== undefined
            ? Number(vehicle.yearEnd)
            : null;

    /*
     * Keep requested year when possible.
     * If it falls outside the known range,
     * use the nearest valid boundary.
     */

    if (
        year !== null &&
        Number.isFinite(startYear) &&
        year < startYear
    ) {
        year = startYear;
    }

    if (
        year !== null &&
        Number.isFinite(endYear) &&
        year > endYear
    ) {
        year = endYear;
    }

    return {

        /*
         * Basic identity
         */

        make:
            vehicle.make,

        model:
            vehicle.model,

        name:
            `${vehicle.make} ${vehicle.model}`,

        year,

        kind:
            vehicle.kind,

        body_type:
            vehicle.bodyType,

        body_types:
            vehicle.bodyTypes,

        /*
         * Detailed specifications are intentionally null.
         *
         * VehiclesDB Open Dataset is primarily the
         * vehicle identity/catalog layer.
         */

        base_msrp:
            null,

        horsepower:
            null,

        drivetrain:
            null,

        drive_train:
            null,

        fuel_type:
            null,

        fuel:
            null,

        engine:
            null,

        transmission:
            null,

        mpg_combined:
            null,

        is_electric:
            false,

        is_plugin_electric:
            false,

        /*
         * VehiclesDB catalog information
         */

        global_decile:
            vehicle.globalDecile,

        availability:
            vehicle.availability,

        year_start:
            vehicle.yearStart,

        year_end:
            vehicle.yearEnd,

        make_slug:
            vehicle.makeSlug,

        model_slug:
            vehicle.modelSlug
    };
}

/*
 * ------------------------------------------------------------
 * Validate kind
 * ------------------------------------------------------------
 */

function getRequestedKind(requestUrl) {

    const rawKind =
        requestUrl.searchParams.get(
            "kind"
        );

    const kind =
        normalizeKind(rawKind);

    /*
     * Unknown values should not silently become
     * another vehicle category.
     */

    if (
        rawKind &&
        !VALID_KINDS.has(kind) &&
        ![
            "cars",
            "motorcycles",
            "bikes",
            "mopeds",
            "vans",
            "trucks",
            "buses"
        ].includes(
            String(rawKind)
                .trim()
                .toLowerCase()
        )
    ) {

        return null;
    }

    return kind;
}

/*
 * ------------------------------------------------------------
 * ACTION: MODELS
 *
 * /api/cars?action=models
 * /api/cars?action=models&kind=car
 * /api/cars?action=models&kind=motorcycle
 * /api/cars?action=models&make=BMW
 * /api/cars?action=models&search=Golf
 * ------------------------------------------------------------
 */

async function handleModels(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Invalid vehicle kind",
                supportedKinds:
                    Array.from(
                        VALID_KINDS
                    )
            },
            400,
            60
        );
    }

    const make =
        requestUrl.searchParams.get(
            "make"
        );

    const search =
        requestUrl.searchParams.get(
            "search"
        );

    let models =
        getModelsByKind(
            database,
            kind
        );

    /*
     * Filter by make.
     */

    if (make) {

        const targetMake =
            normalizeText(make);

        const simplifiedMake =
            simplifyText(make);

        models =
            models.filter(vehicle =>
                normalizeText(
                    vehicle.make
                ) === targetMake ||
                simplifyText(
                    vehicle.make
                ) === simplifiedMake
            );
    }

    /*
     * Search make + model.
     */

    if (search) {

        const query =
            normalizeText(search);

        models =
            models.filter(vehicle => {

                const text =
                    normalizeText(
                        `${vehicle.make} ${vehicle.model}`
                    );

                return text.includes(query);
            });
    }

    /*
     * Sort alphabetically.
     */

    models.sort((a, b) => {

        const makeCompare =
            a.make.localeCompare(
                b.make,
                undefined,
                {
                    sensitivity: "base"
                }
            );

        if (makeCompare !== 0) {
            return makeCompare;
        }

        return a.model.localeCompare(
            b.model,
            undefined,
            {
                sensitivity: "base"
            }
        );
    });

    return jsonResponse({

        success: true,

        kind,

        count:
            models.length,

        vehicles:
            models,

        models:
            models

    });
}

/*
 * ------------------------------------------------------------
 * ACTION: MAKES
 *
 * /api/cars?action=makes
 * /api/cars?action=makes&kind=car
 * ------------------------------------------------------------
 */

async function handleMakes(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Invalid vehicle kind",
                supportedKinds:
                    Array.from(
                        VALID_KINDS
                    )
            },
            400,
            60
        );
    }

    if (
        !database ||
        !Array.isArray(database.makes)
    ) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Invalid VehiclesDB dataset"
            },
            500,
            60
        );
    }

    const makes =
        new Map();

    for (const make of database.makes) {

        if (
            !make ||
            !Array.isArray(make.models)
        ) {
            continue;
        }

        const hasKind =
            make.models.some(
                model =>
                    model &&
                    normalizeKind(
                        model.kind
                    ) === kind
            );

        if (!hasKind) {
            continue;
        }

        const name =
            make.name || "";

        const key =
            normalizeText(name);

        if (!key) {
            continue;
        }

        if (!makes.has(key)) {

            makes.set(
                key,
                {
                    name,

                    slug:
                        make.slug || "",

                    kind
                }
            );
        }
    }

    const result =
        Array.from(
            makes.values()
        ).sort((a, b) =>
            a.name.localeCompare(
                b.name,
                undefined,
                {
                    sensitivity: "base"
                }
            )
        );

    return jsonResponse({

        success: true,

        kind,

        count:
            result.length,

        makes:
            result

    });
}

/*
 * ------------------------------------------------------------
 * ACTION: VEHICLE
 *
 * /api/cars?action=vehicle
 *     &make=BMW
 *     &model=3%20Series
 *     &year=2024
 *
 * Optional:
 *     &kind=car
 * ------------------------------------------------------------
 */

async function handleVehicle(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Invalid vehicle kind",
                supportedKinds:
                    Array.from(
                        VALID_KINDS
                    )
            },
            400,
            60
        );
    }

    const make =
        requestUrl.searchParams.get(
            "make"
        );

    const model =
        requestUrl.searchParams.get(
            "model"
        );

    const year =
        requestUrl.searchParams.get(
            "year"
        );

    if (!make || !model) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing make or model parameter",
                bestMatch:
                    null
            },
            400,
            60
        );
    }

    const models =
        getModelsByKind(
            database,
            kind
        );

    const vehicle =
        findVehicle(
            models,
            make,
            model
        );

    if (!vehicle) {

        return jsonResponse(
            {
                success: false,
                error:
                    `No ${kind} found for ${make} ${model}`,
                bestMatch:
                    null
            },
            404,
            300
        );
    }

    const bestMatch =
        createBestMatch(
            vehicle,
            year
        );

    return jsonResponse({

        success: true,

        source:
            "VehiclesDB Open Dataset",

        kind,

        bestMatch

    });
}

/*
 * ------------------------------------------------------------
 * ACTION: VARIANTS
 *
 * VehiclesDB Open Dataset does not currently expose
 * populated trim/configuration data in this layer.
 *
 * Therefore variants remain empty.
 * ------------------------------------------------------------
 */

async function handleVariants(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Invalid vehicle kind",
                variants: []
            },
            400,
            60
        );
    }

    const make =
        requestUrl.searchParams.get(
            "make"
        );

    const model =
        requestUrl.searchParams.get(
            "model"
        );

    const year =
        requestUrl.searchParams.get(
            "year"
        );

    if (!make || !model) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing make or model parameter",
                variants: []
            },
            400,
            60
        );
    }

    const models =
        getModelsByKind(
            database,
            kind
        );

    const vehicle =
        findVehicle(
            models,
            make,
            model
        );

    if (!vehicle) {

        return jsonResponse(
            {
                success: false,
                error:
                    `No ${kind} found for ${make} ${model}`,
                variants: []
            },
            404,
            300
        );
    }

    const bestMatch =
        createBestMatch(
            vehicle,
            year
        );

    return jsonResponse({

        success: true,

        kind,

        make:
            vehicle.make,

        model:
            vehicle.model,

        year:
            year
                ? Number(year)
                : null,

        variants: [],

        bestMatch

    });
}

/*
 * ------------------------------------------------------------
 * ACTION: IMAGES
 *
 * VehiclesDB Open Dataset does not provide vehicle images.
 *
 * Return an empty array so the existing frontend continues
 * working without fabricated imagery.
 * ------------------------------------------------------------
 */

async function handleImages(
    requestUrl
) {

    const make =
        requestUrl.searchParams.get(
            "make"
        );

    const model =
        requestUrl.searchParams.get(
            "model"
        );

    if (!make || !model) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing make or model parameter",
                images: []
            },
            400,
            60
        );
    }

    return jsonResponse({

        success: true,

        source:
            "VehiclesDB Open Dataset",

        make,

        model,

        images: []

    });
}

    /*
 * ============================================================
 * WIKIDATA + WIKIMEDIA COMMONS
 * ============================================================
 */

const WIKIDATA_API =
    "https://www.wikidata.org/w/api.php";

const COMMONS_API =
    "https://commons.wikimedia.org/w/api.php";

const WIKIMEDIA_HEADERS = {
    "Accept": "application/json",
    "User-Agent":
        "Worth-It/1.0 (https://worth-it-calculator.pages.dev/)"
};


/*
 * ------------------------------------------------------------
 * Small HTML/entity helpers
 * ------------------------------------------------------------
 */

function stripHtml(value) {

    return String(value || "")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .trim();
}


/*
 * ------------------------------------------------------------
 * Wikidata search
 * ------------------------------------------------------------
 */

async function searchWikidata(
    make,
    model
) {

    const searches = [
        `${make} ${model}`,
        model
    ];

    for (const search of searches) {

        const url =
            new URL(WIKIDATA_API);

        url.searchParams.set(
            "action",
            "wbsearchentities"
        );

        url.searchParams.set(
            "search",
            search
        );

        url.searchParams.set(
            "language",
            "en"
        );

        url.searchParams.set(
            "uselang",
            "en"
        );

        url.searchParams.set(
            "type",
            "item"
        );

        url.searchParams.set(
            "limit",
            "10"
        );

        url.searchParams.set(
            "format",
            "json"
        );

        url.searchParams.set(
            "formatversion",
            "2"
        );

        const response =
            await fetch(
                url.toString(),
                {
                    headers:
                        WIKIMEDIA_HEADERS
                }
            );

        if (!response.ok) {
            continue;
        }

        const data =
            await response.json();

        const results =
            Array.isArray(data?.search)
                ? data.search
                : [];

        const target =
            simplifyText(
                `${make} ${model}`
            );

        /*
         * Prefer exact label.
         */

        const exact =
            results.find(item =>
                simplifyText(
                    item?.label
                ) === target
            );

        if (exact) {
            return exact;
        }

        /*
         * Otherwise prefer a result whose
         * label contains the model name.
         */

        const modelText =
            simplifyText(model);

        const related =
            results.find(item =>
                simplifyText(
                    item?.label
                ).includes(modelText)
            );

        if (related) {
            return related;
        }
    }

    return null;
}


/*
 * ------------------------------------------------------------
 * Get Wikidata entity
 * ------------------------------------------------------------
 */

async function getWikidataEntity(
    entityId
) {

    if (!entityId) {
        return null;
    }

    const url =
        new URL(WIKIDATA_API);

    url.searchParams.set(
        "action",
        "wbgetentities"
    );

    url.searchParams.set(
        "ids",
        entityId
    );

    url.searchParams.set(
        "props",
        "labels|descriptions|claims|sitelinks"
    );

    url.searchParams.set(
        "languages",
        "en"
    );

    url.searchParams.set(
        "languagefallback",
        "1"
    );

    url.searchParams.set(
        "format",
        "json"
    );

    url.searchParams.set(
        "formatversion",
        "2"
    );

    const response =
        await fetch(
            url.toString(),
            {
                headers:
                    WIKIMEDIA_HEADERS
            }
        );

    if (!response.ok) {
        return null;
    }

    const data =
        await response.json();

    return (
        data?.entities?.[entityId] ||
        null
    );
}


/*
 * ------------------------------------------------------------
 * Extract simple Wikidata values
 * ------------------------------------------------------------
 */

function getClaimValue(
    entity,
    property
) {

    const claims =
        entity?.claims?.[property];

    if (
        !Array.isArray(claims) ||
        !claims.length
    ) {
        return null;
    }

    const value =
        claims[0]?.mainsnak?.datavalue?.value;

    if (!value) {
        return null;
    }

    if (
        typeof value === "object" &&
        value.id
    ) {
        return value.id;
    }

    return value;
}


async function getWikidataImage(
    entity,
    make,
    model
) {

    const filename =
        entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;

    if (!filename) {
        return null;
    }

    try {

        const params =
            new URLSearchParams({
                action: "query",
                format: "json",
                formatversion: "2",
                titles: `File:${filename}`,
                prop: "imageinfo",
                iiprop: "url|size|mime|extmetadata"
            });

        const response =
            await fetch(
                `${COMMONS_API}?${params.toString()}`,
                {
                    headers:
                        WIKIMEDIA_HEADERS
                }
            );

        if (!response.ok) {
            return null;
        }

        const data =
            await response.json();

        const pages =
            data?.query?.pages || [];

        const page =
            pages[0];

        const info =
            page?.imageinfo?.[0];

        if (!info) {
            return null;
        }

        const metadata =
            info.extmetadata || {};

        const license =
            stripHtml(
                metadata.LicenseShortName?.value ||
                metadata.License?.value ||
                ""
            );

        const author =
            stripHtml(
                metadata.Artist?.value ||
                metadata.Credit?.value ||
                ""
            );

        const licenseUrl =
            stripHtml(
                metadata.LicenseUrl?.value ||
                metadata.LicenseUrl?.url ||
                ""
            );

        /*
         * ----------------------------------------------------
         * License must be commercially acceptable.
         * ----------------------------------------------------
         */

        if (
            !isAcceptedCommonsLicense(
                license,
                licenseUrl
            )
        ) {
            return null;
        }

        /*
         * ----------------------------------------------------
         * Reject obvious non-vehicle imagery.
         *
         * This prevents cases such as:
         * "Musée BMW 259.jpg"
         * where the model name exists in the filename
         * but the actual subject is a building/museum.
         * ----------------------------------------------------
         */

        const filenameText =
            `${filename} ${metadata.ObjectName?.value || ""} ${metadata.ImageDescription?.value || ""}`
                .toLowerCase();

        const rejectedTerms = [
            "museum",
            "musée",
            "musee",
            "building",
            "architecture",
            "facade",
            "façade",
            "house",
            "station",
            "church",
            "castle",
            "palace",
            "office",
            "interior",
            "exterior",
            "monument",
            "statue",
            "sculpture",
            "exhibition hall",
            "showroom building"
        ];

        if (
            rejectedTerms.some(
                term =>
                    filenameText.includes(term)
            )
        ) {
            return null;
        }

        /*
         * ----------------------------------------------------
         * Make/model relevance check.
         * ----------------------------------------------------
         */

        if (
            targetModel &&
            !imageText.includes(targetModel)
        ) {
            return null;
        }

        /*
         * ----------------------------------------------------
         * Basic image validation.
         * ----------------------------------------------------
         */

        const width =
            Number(info.width || 0);

        const height =
            Number(info.height || 0);

        const mime =
            String(
                info.mime || ""
            ).toLowerCase();

        if (
            !mime.startsWith("image/")
        ) {
            return null;
        }

        /*
         * Reject extremely small images.
         */

        if (
            width > 0 &&
            height > 0 &&
            (
                width < 250 ||
                height < 150
            )
        ) {
            return null;
        }

        return {

            filename,

            url:
                info.url ||
                null,

            thumbnail:
                info.thumburl ||
                null,

            width:
                info.width ||
                null,

            height:
                info.height ||
                null,

            mime:
                info.mime ||
                null,

            author:
                author ||
                null,

            license:
                license ||
                null,

            license_url:
                licenseUrl ||
                null,

            source_url:
                `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename).replace(/%2F/g, "/")}`

        };

    } catch (error) {

        console.error(
            "Wikidata/Commons image lookup failed:",
            error
        );

        return null;
    }
}


/*
 * ------------------------------------------------------------
 * Wikimedia Commons image search
 * ------------------------------------------------------------
 */

async function searchCommonsImage(make, model) {

    if (!make || !model) {
        return null;
    }

    const normalizedMake = simplifyText(make);
    const normalizedModel = simplifyText(model);

    if (!normalizedMake || !normalizedModel) {
        return null;
    }

    /*
     * Extremely strict image matching.
     *
     * Principle:
     * Better no image than a wrong vehicle image.
     */

    const modelTokens =
        normalizedModel
            .split(/\s+/)
            .filter(Boolean);

    const isPurelyNumericModel =
        modelTokens.length === 1 &&
        /^\d+$/.test(modelTokens[0]);

    /*
     * Numeric-only models are too ambiguous for Commons.
     *
     * Examples:
     * BMW 259
     * Porsche 911
     * BMW 3
     *
     * We therefore require a very strong structured match.
     */
    const minimumScore =
        isPurelyNumericModel
            ? 100
            : 90;

    const searchQueries = [
        `"${make}" "${model}"`,
        `${make} ${model}`
    ];

    const candidates = [];

    for (const searchQuery of searchQueries) {

        try {

            const apiUrl =
                new URL(COMMONS_API);

            apiUrl.searchParams.set(
                "action",
                "query"
            );

            apiUrl.searchParams.set(
                "generator",
                "search"
            );

            apiUrl.searchParams.set(
                "gsrsearch",
                searchQuery
            );

            apiUrl.searchParams.set(
                "gsrnamespace",
                "6"
            );

            apiUrl.searchParams.set(
                "gsrlimit",
                "30"
            );

            apiUrl.searchParams.set(
                "prop",
                "imageinfo"
            );

            apiUrl.searchParams.set(
                "iiprop",
                "url|size|mime|extmetadata"
            );

            apiUrl.searchParams.set(
                "iiurlwidth",
                "1200"
            );

            apiUrl.searchParams.set(
                "format",
                "json"
            );

            const response =
                await fetch(
                    apiUrl.toString(),
                    {
                        headers:
                            WIKIMEDIA_HEADERS
                    }
                );

            if (!response.ok) {
                continue;
            }

            const data =
                await response.json();

            const pages =
                Object.values(
                    data?.query?.pages || {}
                );

            for (const page of pages) {

                const imageInfo =
                    page?.imageinfo?.[0];

                if (!imageInfo) {
                    continue;
                }

                const metadata =
                    imageInfo.extmetadata || {};

                const title =
                    String(
                        page.title || ""
                    );

                const filename =
                    title.replace(
                        /^File:/i,
                        ""
                    );

                const objectName =
                    String(
                        metadata.ObjectName?.value ||
                        ""
                    );

                const description =
                    String(
                        metadata.ImageDescription?.value ||
                        ""
                    );

                const searchableText =
                    simplifyText(
                        `${filename} ${objectName} ${description}`
                    );

                /*
                 * Reject obvious non-vehicle / irrelevant content.
                 */
                const forbiddenTerms = [
                    "museum",
                    "musee",
                    "building",
                    "architecture",
                    "facade",
                    "house",
                    "station",
                    "church",
                    "castle",
                    "palace",
                    "office",
                    "interior",
                    "exterior",
                    "monument",
                    "statue",
                    "sculpture",
                    "exhibition hall",
                    "showroom building",
                    "logo",
                    "emblem",
                    "badge",
                    "sign",
                    "poster",
                    "brochure",
                    "magazine",
                    "toy",
                    "model car",
                    "diecast",
                    "miniature"
                ];

                const hasForbiddenTerm =
                    forbiddenTerms.some(
                        term =>
                            searchableText.includes(
                                simplifyText(term)
                            )
                    );

                if (hasForbiddenTerm) {
                    continue;
                }

                /*
                 * Validate image type and dimensions.
                 */
                const mime =
                    String(
                        imageInfo.mime || ""
                    ).toLowerCase();

                if (
                    !mime.startsWith(
                        "image/"
                    )
                ) {
                    continue;
                }

                const width =
                    Number(
                        imageInfo.width || 0
                    );

                const height =
                    Number(
                        imageInfo.height || 0
                    );

                if (
                    width < 250 ||
                    height < 150
                ) {
                    continue;
                }

                /*
                 * Token-based matching.
                 *
                 * This prevents:
                 *
                 * BMW 259
                 *
                 * from matching:
                 *
                 * BMW X2 M35i ... (259)
                 */
                const textTokens =
                    new Set(
                        searchableText
                            .split(/\s+/)
                            .filter(Boolean)
                    );

                const makeMatches =
                    textTokens.has(
                        normalizedMake
                    );

                if (!makeMatches) {
                    continue;
                }

                /*
                 * Full model matching.
                 */
                let modelMatches = false;

                if (
                    !isPurelyNumericModel
                ) {

                    modelMatches =
                        modelTokens.every(
                            token =>
                                textTokens.has(
                                    token
                                )
                        );

                } else {

                    /*
                     * Numeric-only model:
                     *
                     * Require the number to appear
                     * as a standalone token AND
                     * reject filenames where the number
                     * is clearly only a photo/index number.
                     */
                    const modelPattern =
                        new RegExp(
                            `(^|[^0-9])${normalizedModel}([^0-9]|$)`
                        );

                    modelMatches =
                        modelPattern.test(
                            searchableText
                        );

                    if (!modelMatches) {
                        continue;
                    }

                    /*
                     * Numeric-only model names are
                     * inherently ambiguous on Commons.
                     *
                     * Require additional vehicle
                     * context.
                     */
                    const vehicleTerms = [
                        "motorcycle",
                        "motorbike",
                        "bike",
                        "scooter",
                        "moped",
                        "automobile",
                        "car",
                        "sedan",
                        "coupe",
                        "wagon",
                        "hatchback",
                        "suv",
                        "roadster",
                        "vehicle",
                        "touring",
                        "sportbike",
                        "supersport",
                        "enduro",
                        "naked",
                        "cruiser"
                    ];

                    const hasVehicleContext =
                        vehicleTerms.some(
                            term =>
                                searchableText.includes(
                                    simplifyText(term)
                                )
                        );

                    if (
                        !hasVehicleContext
                    ) {
                        continue;
                    }
                }

                if (!modelMatches) {
                    continue;
                }

                /*
                 * Reject obvious competing model names.
                 *
                 * This is particularly important for
                 * broad/numeric searches.
                 */
                const titleText =
                    simplifyText(
                        `${filename} ${objectName}`
                    );

                const score =
                    calculateCommonsVehicleScore(
                        normalizedMake,
                        normalizedModel,
                        titleText,
                        width,
                        height,
                        metadata
                    );

                if (
                    score < minimumScore
                ) {
                    continue;
                }

                const license =
                    String(
                        metadata.LicenseShortName?.value ||
                        metadata.License?.value ||
                        ""
                    );

                if (
                    !isAcceptedCommonsLicense(
                        metadata
                    )
                ) {
                    continue;
                }

                candidates.push({
                    score,
                    title,
                    url:
                        imageInfo.url ||
                        null,
                    thumbnail:
                        imageInfo.thumburl ||
                        imageInfo.url ||
                        null,
                    width,
                    height,
                    mime,
                    author:
                        metadata.Artist?.value ||
                        metadata.Credit?.value ||
                        null,
                    license,
                    license_url:
                        metadata.LicenseUrl?.value ||
                        null,
                    source_url:
                        `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
                });
            }

        } catch (error) {

            console.error(
                "Commons image search failed:",
                error
            );
        }
    }

    if (!candidates.length) {
        return null;
    }

    /*
     * Remove duplicate files.
     */
    const uniqueCandidates =
        Array.from(
            new Map(
                candidates.map(
                    candidate => [
                        candidate.url,
                        candidate
                    ]
                )
            ).values()
        );

    /*
     * Highest score wins, but ONLY after
     * passing all strict validation above.
     */
    uniqueCandidates.sort(
        (a, b) =>
            b.score - a.score
    );

    const bestCandidate =
        uniqueCandidates[0];

    if (
        !bestCandidate ||
        bestCandidate.score <
            minimumScore
    ) {
        return null;
    }

    return bestCandidate;
}

/*
 * ------------------------------------------------------------
 * Accepted Commons licenses
 * ------------------------------------------------------------
 */

function isAcceptedCommonsLicense(
    license,
    licenseUrl
) {

    const text =
        `${license || ""} ${licenseUrl || ""}`
            .toLowerCase();

    if (!text) {
        return false;
    }

    /*
     * CC0 / Public Domain
     */

    if (
        text.includes("cc0") ||
        text.includes("public domain")
    ) {
        return true;
    }

    /*
     * Creative Commons Attribution
     */

    if (
        text.includes("cc by") &&
        !text.includes("nc") &&
        !text.includes("nd")
    ) {
        return true;
    }

    /*
     * Creative Commons Attribution ShareAlike
     */

    if (
        text.includes("cc by-sa") &&
        !text.includes("nc") &&
        !text.includes("nd")
    ) {
        return true;
    }

    return false;
}


/*
 * ------------------------------------------------------------
 * Convert Wikidata image filename to Commons URL
 * ------------------------------------------------------------
 */

function createCommonsFileUrl(
    filename
) {

    if (!filename) {
        return null;
    }

    return (
        "https://commons.wikimedia.org/wiki/Special:Redirect/file/" +
        encodeURIComponent(filename)
    );
}


/*
 * ------------------------------------------------------------
 * ACTION: DETAILS
 *
 * Example:
 *
 * /api/cars?action=details
 *   &make=BMW
 *   &model=3%20Series
 *   &kind=car
 *   &year=2024
 *
 * Combines:
 *   VehiclesDB
 *   Wikidata
 *   Wikimedia Commons
 * ------------------------------------------------------------
 */

async function handleDetails(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Invalid vehicle kind"
            },
            400,
            60
        );
    }

    const make =
        requestUrl.searchParams.get(
            "make"
        );

    const model =
        requestUrl.searchParams.get(
            "model"
        );

    const year =
        requestUrl.searchParams.get(
            "year"
        );

    if (!make || !model) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing make or model parameter"
            },
            400,
            60
        );
    }

    /*
     * --------------------------------------------------------
     * 1. VehiclesDB
     * --------------------------------------------------------
     */

    const models =
        getModelsByKind(
            database,
            kind
        );

    const vehicle =
        findVehicle(
            models,
            make,
            model
        );

    if (!vehicle) {

        return jsonResponse(
            {
                success: false,
                error:
                    `No ${kind} found for ${make} ${model}`,
                vehicle: null,
                wikidata: null,
                image: null
            },
            404,
            300
        );
    }

    const bestMatch =
        createBestMatch(
            vehicle,
            year
        );

    /*
     * --------------------------------------------------------
     * 2. Wikidata
     * --------------------------------------------------------
     */

    let wikidataSearch = null;
    let wikidataEntity = null;

    try {

        wikidataSearch =
            await searchWikidata(
                vehicle.make,
                vehicle.model
            );

        if (wikidataSearch?.id) {

            wikidataEntity =
                await getWikidataEntity(
                    wikidataSearch.id
                );
        }

    } catch (error) {

        console.error(
            "Wikidata lookup failed:",
            error
        );
    }

    /*
     * --------------------------------------------------------
     * 3. Commons
     * --------------------------------------------------------
     */

    let image = null;

    try {

        image =
            await searchCommonsImage(
                vehicle.make,
                vehicle.model
            );

    } catch (error) {

        console.error(
            "Commons lookup failed:",
            error
        );
    }

   /*
 * If Wikidata itself contains an image,
 * verify the Commons license and expose
 * the complete image metadata.
 */

const wikidataImage =
    await getWikidataImage(
        wikidataEntity,
        vehicle.make,
        vehicle.model
    );

   const primaryImage =
    wikidataImage ||
    image ||
    null;
    
    /*
     * --------------------------------------------------------
     * Final response
     * --------------------------------------------------------
     */

    return jsonResponse(
        {

            success: true,

            source: {
                catalog:
                    "VehiclesDB Open Dataset",
                structured_data:
                    "Wikidata",
                media:
                    "Wikimedia Commons"
            },

            kind,

            vehicle:
                bestMatch,

            wikidata: {

                id:
                    wikidataSearch?.id ||
                    null,

                label:
                    wikidataSearch?.label ||
                    null,

                description:
                    wikidataSearch?.description ||
                    null,

                url:
                    wikidataSearch?.id
                        ? `https://www.wikidata.org/wiki/${wikidataSearch.id}`
                        : null,

                image:
                  wikidataImage,

                manufacturer:
                    getClaimValue(
                        wikidataEntity,
                        "P176"
                    ),

                inception:
                    getClaimValue(
                        wikidataEntity,
                        "P571"
                    )
            },

                       image:
                primaryImage

        },
        200,
        86400
    );
}

/*
 * ============================================================
 * MAIN REQUEST HANDLER
 * ============================================================
 */

export async function onRequestGet(
    context
) {

    try {

        const request =
            context.request;

        const requestUrl =
            new URL(
                request.url
            );

        const action =
            (
                requestUrl.searchParams.get(
                    "action"
                ) || "models"
            )
                .trim()
                .toLowerCase();

        /*
         * Load VehiclesDB dataset.
         */

        const database =
            await loadVehiclesDatabase();

        /*
         * Route request.
         */

        switch (action) {

            case "models":

                return handleModels(
                    requestUrl,
                    database
                );

            case "makes":

                return handleMakes(
                    requestUrl,
                    database
                );

            case "vehicle":

                return handleVehicle(
                    requestUrl,
                    database
                );

            case "variants":

                return handleVariants(
                    requestUrl,
                    database
                );

            case "images":

                return handleImages(
                    requestUrl
                );

            case "details":

            return handleDetails(
              requestUrl,
                 database
          );
                
            default:

                return jsonResponse(
                    {
                        success: false,

                        error:
                            "Invalid action",

                        supportedActions: [
                            "makes",
                            "models",
                            "variants",
                            "vehicle",
                            "images",
                            "details"
                        ],

                        supportedKinds:
                            Array.from(
                                VALID_KINDS
                            )
                    },
                    400,
                    60
                );
        }

    } catch (error) {

        console.error(
            "VehiclesDB Cars API error:",
            error
        );

        return jsonResponse(
            {
                success: false,

                error:
                    error?.message ||
                    "Internal server error"
            },
            500,
            60
        );
    }
}
