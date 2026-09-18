/*
 * ============================================================
 * WORTH IT - VEHICLES API
 * VehiclesDB Open Dataset + Wikipedia supplemental data
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
 * Wikipedia text: CC BY-SA 4.0
 * Wikimedia images may have individual licenses.
 * Attribution/source information should remain visible on-site.
 * ============================================================
 */

const VEHICLES_DB_URL =
    "https://cdn.jsdelivr.net/gh/vehiclesdb/vehiclesdb@latest/dist/vehicles.json";

const CACHE_TTL = 86400; // 24 hours
const WIKIPEDIA_CACHE_TTL = 604800; // 7 days

const WIKIPEDIA_API =
    "https://en.wikipedia.org/w/api.php";

const VALID_KINDS = new Set([
    "car",
    "motorcycle",
    "moped",
    "van",
    "truck",
    "bus"
]);

const VEHICLE_KIND_ALIASES = {
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

    return VEHICLE_KIND_ALIASES[value] || "car";
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
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
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

function getRequestedKind(
    requestUrl
) {

    const rawKind =
        requestUrl.searchParams.get(
            "kind"
        );

    if (!rawKind) {
        return "car";
    }

    const normalizedRaw =
        String(rawKind)
            .trim()
            .toLowerCase();

    if (
        !Object.prototype.hasOwnProperty.call(
            VEHICLE_KIND_ALIASES,
            normalizedRaw
        )
    ) {
        return null;
    }

    const kind =
        VEHICLE_KIND_ALIASES[
            normalizedRaw
        ];

    return isValidKind(kind)
        ? kind
        : null;
}

/*
 * ------------------------------------------------------------
 * ACTION: MODELS
 * ------------------------------------------------------------
 */

async function handleModels(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(
            requestUrl
        );

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

    if (make) {

        const targetMake =
            normalizeText(make);

        const simplifiedMake =
            simplifyText(make);

        models =
            models.filter(
                vehicle =>
                    normalizeText(
                        vehicle.make
                    ) === targetMake ||
                    simplifyText(
                        vehicle.make
                    ) === simplifiedMake
            );
    }

    if (search) {

        const query =
            normalizeText(search);

        models =
            models.filter(
                vehicle =>
                    normalizeText(
                        `${vehicle.make} ${vehicle.model}`
                    ).includes(query)
            );
    }

    models.sort(
        (a, b) => {

            const makeCompare =
                a.make.localeCompare(
                    b.make,
                    undefined,
                    {
                        sensitivity:
                            "base"
                    }
                );

            if (makeCompare !== 0) {
                return makeCompare;
            }

            return a.model.localeCompare(
                b.model,
                undefined,
                {
                    sensitivity:
                        "base"
                }
            );
        }
    );

    return jsonResponse({

        success:
            true,

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
 * ------------------------------------------------------------
 */

async function handleMakes(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(
            requestUrl
        );

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

    for (
        const make
        of database.makes
    ) {

        if (
            !make ||
            !Array.isArray(
                make.models
            )
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
        ).sort(
            (a, b) =>
                a.name.localeCompare(
                    b.name,
                    undefined,
                    {
                        sensitivity:
                            "base"
                    }
                )
        );

    return jsonResponse({

        success:
            true,

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
 * ------------------------------------------------------------
 */

async function handleVehicle(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(
            requestUrl
        );

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

    return jsonResponse({

        success:
            true,

        source:
            "VehiclesDB Open Dataset",

        kind,

        bestMatch:
            createBestMatch(
                vehicle,
                year
            )

    });
}

/*
 * ------------------------------------------------------------
 * ACTION: VARIANTS
 * ------------------------------------------------------------
 */

async function handleVariants(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(
            requestUrl
        );

    if (!kind) {

        return jsonResponse(
            {
                success: false,

                error:
                    "Invalid vehicle kind",

                variants:
                    []
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

                variants:
                    []
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

                variants:
                    []
            },
            404,
            300
        );
    }

    return jsonResponse({

        success:
            true,

        kind,

        make:
            vehicle.make,

        model:
            vehicle.model,

        year:
            year
                ? Number(year)
                : null,

        variants:
            [],

        bestMatch:
            createBestMatch(
                vehicle,
                year
            )

    });
}

/*
 * ------------------------------------------------------------
 * ACTION: IMAGES
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

                images:
                    []
            },
            400,
            60
        );
    }

    return jsonResponse({

        success:
            true,

        source:
            "VehiclesDB Open Dataset",

        make,

        model,

        images:
            []

    });
}

/*
 * ============================================================
 * WIKIPEDIA VEHICLE DETAILS
 * ============================================================
 */

/*
 * ------------------------------------------------------------
 * Wikipedia cached fetch
 * ------------------------------------------------------------
 */

async function fetchWikipediaCached(
    url
) {

    const cache =
        caches.default;

    const cacheKey =
        new Request(url);

    const cached =
        await cache.match(
            cacheKey
        );

    if (cached) {

        try {

            return await cached.json();

        } catch {

            // Ignore invalid cached response.
        }
    }

    const response =
        await fetch(
            url,
            {
                headers: {

                    "Accept":
                        "application/json",

                    "User-Agent":
                        "Worth It Cars/1.0 (https://worth-it-calculator.pages.dev/)"
                }
            }
        );

    if (!response.ok) {

        throw new Error(
            `Wikipedia returned ${response.status}`
        );
    }

    const data =
        await response.json();

    if (data?.error) {

        throw new Error(
            data.error.info ||
            "Wikipedia API error"
        );
    }

    try {

        const cacheResponse =
            new Response(
                JSON.stringify(data),
                {
                    status:
                        200,

                    headers: {

                        "Content-Type":
                            "application/json; charset=UTF-8",

                        "Cache-Control":
                            `public, max-age=${WIKIPEDIA_CACHE_TTL}`
                    }
                }
            );

        await cache.put(
            cacheKey,
            cacheResponse
        );

    } catch (error) {

        console.error(
            "Wikipedia cache write failed:",
            error
        );
    }

    return data;
}

/*
 * ------------------------------------------------------------
 * Wikipedia text normalization
 * ------------------------------------------------------------
 */

function normalizeWikipediaText(
    value
) {

    return String(value || "")
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

function normalizeWikipediaLabel(
    value
) {

    return normalizeWikipediaText(
        value
    )
        .toLowerCase()

        /*
         * IMPORTANT:
         *
         * Wikipedia commonly uses underscore-separated
         * infobox field names:
         *
         * body_style
         * fuel_type
         * curb_weight
         * electric_range
         *
         * Convert them to the same form as our aliases.
         */

        .replace(
            /[_]/g,
            " "
        )

        .replace(
            /[:]/g,
            ""
        )

        .replace(
            /[–—-]/g,
            " "
        )

        .replace(
            /\s+/g,
            " "
        );
}

/*
 * ------------------------------------------------------------
 * Wikipedia specification fields
 * ------------------------------------------------------------
 */

const WIKIPEDIA_SPEC_FIELDS = [

    "production",
    "generation",
    "bodyType",
    "engine",
    "fuel",
    "transmission",
    "drivetrain",
    "horsepower",
    "torque",
    "weight",
    "length",
    "width",
    "height",
    "wheelbase",
    "topSpeed",
    "battery",
    "electricRange",
    "seating",
    "doors"

];

function createEmptyWikipediaSpecifications() {

    const specifications =
        {};

    for (
        const field
        of WIKIPEDIA_SPEC_FIELDS
    ) {

        specifications[field] =
            "No Information";
    }

    return specifications;
}

/*
 * ------------------------------------------------------------
 * Wikipedia field aliases
 * ------------------------------------------------------------
 */

const WIKIPEDIA_FIELD_ALIASES = {

    production:
        "production",

    years:
        "production",

    "model years":
        "production",

    "production years":
        "production",

    generation:
        "generation",

    generations:
        "generation",

    "body style":
        "bodyType",

    "body styles":
        "bodyType",

    "body type":
        "bodyType",

    "body types":
        "bodyType",

    body:
        "bodyType",

    engine:
        "engine",

    engines:
        "engine",

    motor:
        "engine",

    motors:
        "engine",

    "electric motor":
        "engine",

    "electric motors":
        "engine",

    emotor:
        "engine",

    fuel:
        "fuel",

    "fuel type":
        "fuel",

    "fuel types":
        "fuel",

    "fuel system":
        "fuel",

    transmission:
        "transmission",

    transmissions:
        "transmission",

    gearbox:
        "transmission",

    gearboxes:
        "transmission",

    drivetrain:
        "drivetrain",

    "drive train":
        "drivetrain",

    "drive type":
        "drivetrain",

    drive:
        "drivetrain",

    layout:
        "drivetrain",

    power:
        "horsepower",

    "power output":
        "horsepower",

    "engine power":
        "horsepower",

    "motor power":
        "horsepower",

    horsepower:
        "horsepower",

    hp:
        "horsepower",

    torque:
        "torque",

    "curb weight":
        "weight",

    "kerb weight":
        "weight",

    curbweight:
        "weight",

    weight:
        "weight",

    mass:
        "weight",

    length:
        "length",

    width:
        "width",

    height:
        "height",

    wheelbase:
        "wheelbase",

    "top speed":
        "topSpeed",

    "maximum speed":
        "topSpeed",

    topspeed:
        "topSpeed",

    battery:
        "battery",

    "battery capacity":
        "battery",

    "battery pack":
        "battery",

    "electric range":
        "electricRange",

    range:
        "electricRange",

    "all electric range":
        "electricRange",

    seating:
        "seating",

    seats:
        "seating",

    "seating capacity":
        "seating",

    doors:
        "doors"

};

function getWikipediaSpecificationField(
    label
) {

    const normalized =
        normalizeWikipediaLabel(
            label
        );

    return (
        WIKIPEDIA_FIELD_ALIASES[
            normalized
        ] ||
        null
    );
}

/*
 * ------------------------------------------------------------
 * Find complete vehicle infobox
 * ------------------------------------------------------------
 */

function findWikipediaInfobox(
    source
) {

    const match =
        String(source || "")
            .match(
                /\{\{\s*Infobox\s+(automobile|car|vehicle|motorcycle|motorbike|truck|bus|van|moped)\b/i
            );

    if (
        !match ||
        match.index === undefined
    ) {

        return null;
    }

    const start =
        match.index;

    let depth =
        0;

    for (
        let i = start;
        i < source.length - 1;
        i++
    ) {

        const pair =
            source.slice(
                i,
                i + 2
            );

        if (
            pair === "{{"
        ) {

            depth++;

            i++;

            continue;
        }

        if (
            pair === "}}"
        ) {

            depth--;

            if (
                depth === 0
            ) {

                return source.slice(
                    start,
                    i + 2
                );
            }

            i++;
        }
    }

    return null;
}

/*
 * ------------------------------------------------------------
 * Extract top-level infobox fields
 *
 * This parser intentionally does NOT depend on line breaks.
 * Wikipedia parameters can span multiple lines.
 * ------------------------------------------------------------
 */

function extractWikipediaInfoboxFields(
    infobox
) {

    const fields =
        {};

    if (!infobox) {
        return fields;
    }

    let templateDepth =
        0;

    let linkDepth =
        0;

    let fieldStart =
        -1;

    for (
        let i = 0;
        i < infobox.length - 1;
        i++
    ) {

        const pair =
            infobox.slice(
                i,
                i + 2
            );

        /*
         * Nested template start.
         */

        if (
            pair === "{{"
        ) {

            templateDepth++;

            i++;

            continue;
        }

        /*
         * Template end.
         */

        if (
            pair === "}}"
        ) {

            /*
             * depth 1 is the main infobox.
             * Closing it means the final field must be saved.
             */

            if (
                templateDepth === 1
            ) {

                if (
                    fieldStart !== -1
                ) {

                    addWikipediaInfoboxField(
                        fields,
                        infobox.slice(
                            fieldStart,
                            i
                        )
                    );
                }

                fieldStart =
                    -1;
            }

            templateDepth =
                Math.max(
                    0,
                    templateDepth - 1
                );

            i++;

            continue;
        }

        /*
         * Wiki link start.
         */

        if (
            pair === "[["
        ) {

            linkDepth++;

            i++;

            continue;
        }

        /*
         * Wiki link end.
         */

        if (
            pair === "]]"
        ) {

            linkDepth =
                Math.max(
                    0,
                    linkDepth - 1
                );

            i++;

            continue;
        }

        /*
         * Top-level infobox field separator.
         *
         * A pipe inside {{...}} or [[...]]
         * must be ignored.
         */

        if (
            infobox[i] === "|" &&
            templateDepth === 1 &&
            linkDepth === 0
        ) {

            if (
                fieldStart !== -1
            ) {

                addWikipediaInfoboxField(
                    fields,
                    infobox.slice(
                        fieldStart,
                        i
                    )
                );
            }

            fieldStart =
                i + 1;
        }
    }

    return fields;
}

/*
 * ------------------------------------------------------------
 * Add one infobox field
 * ------------------------------------------------------------
 */

function addWikipediaInfoboxField(
    fields,
    segment
) {

    if (!segment) {
        return;
    }

    const equalsIndex =
        findTopLevelEquals(
            segment
        );

    if (
        equalsIndex === -1
    ) {

        return;
    }

    const rawKey =
        segment
            .slice(
                0,
                equalsIndex
            )
            .trim();

    const rawValue =
        segment
            .slice(
                equalsIndex + 1
            )
            .trim();

    if (
        !rawKey ||
        !rawValue
    ) {

        return;
    }

    const label =
        normalizeWikipediaLabel(
            rawKey
        );

    if (!label) {
        return;
    }

    /*
     * Keep first occurrence.
     */

    if (
        !Object.prototype.hasOwnProperty.call(
            fields,
            label
        )
    ) {

        fields[label] =
            rawValue;
    }
}

/*
 * ------------------------------------------------------------
 * Find first top-level "="
 * ------------------------------------------------------------
 */

function findTopLevelEquals(
    text
) {

    let templateDepth =
        0;

    let linkDepth =
        0;

    for (
        let i = 0;
        i < text.length;
        i++
    ) {

        const pair =
            text.slice(
                i,
                i + 2
            );

        if (
            pair === "{{"
        ) {

            templateDepth++;

            i++;

            continue;
        }

        if (
            pair === "}}"
        ) {

            templateDepth =
                Math.max(
                    0,
                    templateDepth - 1
                );

            i++;

            continue;
        }

        if (
            pair === "[["
        ) {

            linkDepth++;

            i++;

            continue;
        }

        if (
            pair === "]]"
        ) {

            linkDepth =
                Math.max(
                    0,
                    linkDepth - 1
                );

            i++;

            continue;
        }

        if (
            text[i] === "=" &&
            templateDepth === 0 &&
            linkDepth === 0
        ) {

            return i;
        }
    }

    return -1;
}

/*
 * ------------------------------------------------------------
 * Split top-level template arguments
 * ------------------------------------------------------------
 */

function splitWikipediaTemplateArguments(
    body
) {

    const parts =
        [];

    let start =
        0;

    let templateDepth =
        0;

    let linkDepth =
        0;

    for (
        let i = 0;
        i < body.length - 1;
        i++
    ) {

        const pair =
            body.slice(
                i,
                i + 2
            );

        if (
            pair === "{{"
        ) {

            templateDepth++;

            i++;

            continue;
        }

        if (
            pair === "}}"
        ) {

            templateDepth =
                Math.max(
                    0,
                    templateDepth - 1
                );

            i++;

            continue;
        }

        if (
            pair === "[["
        ) {

            linkDepth++;

            i++;

            continue;
        }

        if (
            pair === "]]"
        ) {

            linkDepth =
                Math.max(
                    0,
                    linkDepth - 1
                );

            i++;

            continue;
        }

        if (
            body[i] === "|" &&
            templateDepth === 0 &&
            linkDepth === 0
        ) {

            parts.push(
                body.slice(
                    start,
                    i
                )
            );

            start =
                i + 1;
        }
    }

    parts.push(
        body.slice(
            start
        )
    );

    return parts;
}

/*
 * ------------------------------------------------------------
 * Replace one innermost Wikipedia template
 * ------------------------------------------------------------
 */

function replaceInnermostWikipediaTemplate(
    text
) {

    const match =
        text.match(
            /\{\{([^{}]*)\}\}/
        );

    if (!match) {
        return text;
    }

    const fullTemplate =
        match[0];

    const body =
        match[1];

    const parts =
        splitWikipediaTemplateArguments(
            body
        );

    const templateName =
        String(
            parts.shift() ||
            ""
        )
            .trim()
            .toLowerCase();

    const positional =
        [];

    for (
        const part
        of parts
    ) {

        const cleanPart =
            String(
                part || ""
            ).trim();

        if (!cleanPart) {
            continue;
        }

        if (
            findTopLevelEquals(
                cleanPart
            ) === -1
        ) {

            positional.push(
                cleanPart
            );
        }
    }

    let replacement =
        "";

    /*
     * Unit conversion.
     */

    if (
        templateName === "convert" ||
        templateName === "cvt" ||
        templateName === "convertabr"
    ) {

        if (
            positional.length >= 4 &&
            positional[1] === "-"
        ) {

            replacement =
                `${positional[0]}–${positional[2]} ${positional[3]}`;

        } else if (
            positional.length >= 2
        ) {

            replacement =
                `${positional[0]} ${positional[1]}`;

        } else if (
            positional.length >= 1
        ) {

            replacement =
                positional[0];
        }

    }

    /*
     * Simple wrapper templates.
     */

    else if (
        [
            "nowrap",
            "small",
            "mono",
            "plainlist",
            "plain list",
            "nowraplinks"
        ].includes(
            templateName
        )
    ) {

        replacement =
            positional.join(
                "; "
            );

    }

    /*
     * List templates.
     */

    else if (
        [
            "unbulleted list",
            "unbulleted",
            "ubl",
            "flatlist",
            "bulleted list"
        ].includes(
            templateName
        )
    ) {

        replacement =
            positional
                .map(
                    item =>
                        item
                            .replace(
                                /^[*#;:]\s*/g,
                                ""
                            )
                            .trim()
                )
                .filter(Boolean)
                .join(
                    "; "
                );

    }

    /*
     * Unknown simple wrappers:
     * keep useful positional text instead of
     * exposing raw template markup.
     */

    else if (
        positional.length === 1
    ) {

        replacement =
            positional[0];

    } else if (
        positional.length > 1
    ) {

        replacement =
            positional.join(
                " "
            );
    }

    return (
        text.slice(
            0,
            match.index
        ) +
        replacement +
        text.slice(
            match.index +
            fullTemplate.length
        )
    );
}

/*
 * ------------------------------------------------------------
 * Clean Wikipedia wikitext value
 * ------------------------------------------------------------
 */

function cleanWikipediaWikitextValue(
    value
) {

    let text =
        String(
            value || ""
        ).trim();

    if (!text) {
        return "No Information";
    }

    /*
     * Remove comments.
     */

    text =
        text.replace(
            /<!--[\s\S]*?-->/g,
            " "
        );

    /*
     * Remove reference tags.
     */

    text =
        text.replace(
            /<ref[^>]*>[\s\S]*?<\/ref>/gi,
            " "
        );

    text =
        text.replace(
            /<ref[^>]*\/>/gi,
            " "
        );

    /*
     * Convert line breaks.
     */

    text =
        text.replace(
            /<br\s*\/?\s*>/gi,
            "; "
        );

    /*
     * Remove other HTML tags.
     */

    text =
        text.replace(
            /<[^>]+>/g,
            " "
        );

    /*
     * Resolve nested templates.
     */

    for (
        let pass = 0;
        pass < 30;
        pass++
    ) {

        const next =
            replaceInnermostWikipediaTemplate(
                text
            );

        if (
            next === text
        ) {

            break;
        }

        text =
            next;
    }

    /*
     * Wiki links with display text.
     */

    text =
        text.replace(
            /\[\[([^|\]]+)\|([^\]]+)\]\]/g,
            "$2"
        );

    /*
     * Simple wiki links.
     */

    text =
        text.replace(
            /\[\[([^\]]+)\]\]/g,
            "$1"
        );

    /*
     * External links.
     */

    text =
        text.replace(
            /\[(?:https?:\/\/|\/\/)[^\s\]]+\s+([^\]]+)\]/gi,
            "$1"
        );

    /*
     * Bold / italic.
     */

    text =
        text.replace(
            /'{2,5}/g,
            ""
        );

    /*
     * Common HTML entities.
     */

    const entityMap = {

        "&nbsp;":
            " ",

        "&ndash;":
            "–",

        "&mdash;":
            "—",

        "&minus;":
            "−",

        "&amp;":
            "&",

        "&quot;":
            "\"",

        "&#39;":
            "'",

        "&apos;":
            "'"

    };

    for (
        const [
            entity,
            replacement
        ]
        of Object.entries(
            entityMap
        )
    ) {

        text =
            text.replace(
                new RegExp(
                    entity,
                    "gi"
                ),
                replacement
            );
    }

    /*
     * Citation markers.
     */

    text =
        text.replace(
            /\[\s*\d+\s*\]/g,
            ""
        );

    /*
     * List markers.
     */

    text =
        text.replace(
            /(^|\s)[*#]+\s*/g,
            "$1"
        );

    /*
     * Normalize whitespace.
     */

    text =
        text
            .replace(
                /\s*\n\s*/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    return (
        text ||
        "No Information"
    );
}

/*
 * ------------------------------------------------------------
 * Parse Wikipedia infobox from raw wikitext
 * ------------------------------------------------------------
 */

function parseWikipediaInfobox(
    wikitext
) {

    const specifications =
        createEmptyWikipediaSpecifications();

    if (!wikitext) {
        return specifications;
    }

    try {

        const source =
            String(wikitext)
                .replace(
                    /<!--[\s\S]*?-->/g,
                    ""
                );

        const infobox =
            findWikipediaInfobox(
                source
            );

        if (!infobox) {
            return specifications;
        }

        const fields =
            extractWikipediaInfoboxFields(
                infobox
            );

        for (
            const [
                label,
                rawValue
            ]
            of Object.entries(
                fields
            )
        ) {

            const field =
                getWikipediaSpecificationField(
                    label
                );

            if (!field) {
                continue;
            }

            const value =
                cleanWikipediaWikitextValue(
                    rawValue
                );

            if (
                !value ||
                value ===
                    "No Information"
            ) {

                continue;
            }

            if (
                specifications[field] ===
                    "No Information"
            ) {

                specifications[field] =
                    value;
            }
        }

    } catch (error) {

        console.error(
            "Wikipedia wikitext infobox parsing error:",
            error
        );
    }

    return specifications;
}

/*
 * ------------------------------------------------------------
 * Search Wikipedia
 * ------------------------------------------------------------
 */

async function searchWikipediaVehicle(
    make,
    model,
    kind
) {

    if (
        !make ||
        !model
    ) {

        return null;
    }

    const searches = [

        `${make} ${model} ${kind}`,

        `${make} ${model}`

    ];

    for (
        const search
        of searches
    ) {

        try {

            const url =
                new URL(
                    WIKIPEDIA_API
                );

            url.searchParams.set(
                "action",
                "query"
            );

            url.searchParams.set(
                "list",
                "search"
            );

            url.searchParams.set(
                "srsearch",
                search
            );

            url.searchParams.set(
                "srnamespace",
                "0"
            );

            url.searchParams.set(
                "srlimit",
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

            const data =
                await fetchWikipediaCached(
                    url.toString()
                );

            const results =
                Array.isArray(
                    data?.query?.search
                )
                    ? data.query.search
                    : [];

            if (!results.length) {
                continue;
            }

            const normalizedTarget =
                simplifyText(
                    `${make}${model}`
                );

            /*
             * Exact article title first.
             */

            const exact =
                results.find(
                    result =>
                        simplifyText(
                            result?.title
                        ) ===
                        normalizedTarget
                );

            if (exact) {

                return exact.title;
            }

            const normalizedMake =
                simplifyText(
                    make
                );

            const normalizedModel =
                simplifyText(
                    model
                );

            const scored =
                results
                    .map(
                        result => {

                            const title =
                                String(
                                    result?.title ||
                                    ""
                                );

                            const simplifiedTitle =
                                simplifyText(
                                    title
                                );

                            let score =
                                0;

                            if (
                                normalizedMake &&
                                simplifiedTitle.includes(
                                    normalizedMake
                                )
                            ) {

                                score += 30;
                            }

                            if (
                                normalizedModel &&
                                simplifiedTitle.includes(
                                    normalizedModel
                                )
                            ) {

                                score += 50;
                            }

                            if (
                                normalizedTarget &&
                                simplifiedTitle.includes(
                                    normalizedTarget
                                )
                            ) {

                                score += 30;
                            }

                            /*
                             * Prefer normal articles over
                             * disambiguation-like titles.
                             */

                            if (
                                /\s+\(.*\)$/i.test(
                                    title
                                )
                            ) {

                                score -= 15;
                            }

                            return {
                                title,
                                score
                            };
                        }
                    )
                    .sort(
                        (a, b) =>
                            b.score -
                            a.score
                    );

            if (
                scored[0] &&
                scored[0].score >= 50
            ) {

                return scored[0].title;
            }

        } catch (error) {

            console.error(
                "Wikipedia search error:",
                search,
                error
            );
        }
    }

    return null;
}

/*
 * ------------------------------------------------------------
 * Get Wikipedia page
 * ------------------------------------------------------------
 */

async function getWikipediaPage(
    title
) {

    if (!title) {
        return null;
    }

    const url =
        new URL(
            WIKIPEDIA_API
        );

    url.searchParams.set(
        "action",
        "query"
    );

    url.searchParams.set(
        "prop",
        "extracts|pageimages|info"
    );

    url.searchParams.set(
        "exintro",
        "1"
    );

    url.searchParams.set(
        "explaintext",
        "1"
    );

    url.searchParams.set(
        "piprop",
        "thumbnail"
    );

    url.searchParams.set(
        "pithumbsize",
        "1200"
    );

    url.searchParams.set(
        "inprop",
        "url"
    );

    url.searchParams.set(
        "titles",
        title
    );

    url.searchParams.set(
        "redirects",
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

    const data =
        await fetchWikipediaCached(
            url.toString()
        );

    const pages =
        data?.query?.pages;

    if (!pages) {
        return null;
    }

    const page =
        Array.isArray(pages)
            ? pages[0]
            : Object.values(
                pages
            )[0];

    if (
        !page ||
        page.missing === true
    ) {

        return null;
    }

    return {

        pageId:
            page.pageid ||
            null,

        title:
            page.title ||
            title,

        description:
            normalizeWikipediaText(
                page.extract ||
                ""
            ),

        image:
            page.thumbnail?.source ||
            null,

        url:
            page.fullurl ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(
                String(
                    page.title ||
                    title
                ).replace(
                    / /g,
                    "_"
                )
            )}`
    };
}

/*
 * ------------------------------------------------------------
 * Get Wikipedia infobox
 *
 * IMPORTANT:
 *
 * prop=wikitext retrieves the original page wikitext.
 * We parse that source ourselves.
 * ------------------------------------------------------------
 */

async function getWikipediaInfobox(
    title
) {

    if (!title) {

        return createEmptyWikipediaSpecifications();

    }

    try {

        const url =
            new URL(
                WIKIPEDIA_API
            );

        url.searchParams.set(
            "action",
            "parse"
        );

        url.searchParams.set(
            "page",
            title
        );

        url.searchParams.set(
            "prop",
            "wikitext"
        );

        url.searchParams.set(
            "format",
            "json"
        );

        url.searchParams.set(
            "formatversion",
            "2"
        );

        url.searchParams.set(
            "redirects",
            "1"
        );

        const data =
            await fetchWikipediaCached(
                url.toString()
            );

        const wikitext =
            typeof data?.parse?.wikitext ===
                "string"
                ? data.parse.wikitext
                : data?.parse?.wikitext?.["*"];

        if (!wikitext) {

            console.warn(
                "Wikipedia returned no wikitext:",
                title
            );

            return createEmptyWikipediaSpecifications();
        }

        return parseWikipediaInfobox(
            wikitext
        );

    } catch (error) {

        console.error(
            "Wikipedia infobox request failed:",
            title,
            error
        );

        return createEmptyWikipediaSpecifications();
    }
}

/*
 * ------------------------------------------------------------
 * Check whether actual technical information exists
 * ------------------------------------------------------------
 */

function hasWikipediaVehicleInformation(
    specifications
) {

    if (!specifications) {
        return false;
    }

    const comparisonFields = [

        "engine",
        "fuel",
        "transmission",
        "drivetrain",
        "horsepower",
        "torque",
        "weight",
        "length",
        "width",
        "height",
        "wheelbase",
        "topSpeed",
        "battery",
        "electricRange",
        "seating",
        "doors"

    ];

    return comparisonFields.some(
        field => {

            const value =
                specifications[field];

            return (
                value &&
                value !==
                    "No Information"
            );
        }
    );
}

/*
 * ------------------------------------------------------------
 * Complete "No Information" result
 * ------------------------------------------------------------
 */

function createWikipediaNoInformation(
    make,
    model,
    kind
) {

    return {

        success:
            true,

        source:
            "Wikipedia",

        make:
            make ||
            "No Information",

        model:
            model ||
            "No Information",

        kind:
            kind ||
            "No Information",

        wikipedia: {

            title:
                "No Information",

            url:
                null,

            description:
                "No Information"

        },

        image:
            null,

        specifications:
            createEmptyWikipediaSpecifications(),

        comparisonAvailable:
            false

    };
}

/*
 * ------------------------------------------------------------
 * ACTION: DETAILS
 * ------------------------------------------------------------
 */

async function handleDetails(
    requestUrl,
    database
) {

    const kind =
        getRequestedKind(
            requestUrl
        );

    if (!kind) {

        return jsonResponse(
            {
                success:
                    false,

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

    if (
        !make ||
        !model
    ) {

        return jsonResponse(
            {
                success:
                    false,

                error:
                    "Missing make or model parameter",

                vehicle:
                    null
            },
            400,
            60
        );
    }

    /*
     * 1. Verify vehicle against VehiclesDB.
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
                success:
                    false,

                error:
                    `No ${kind} found for ${make} ${model}`,

                vehicle:
                    null,

                wikipedia:
                    null,

                image:
                    null
            },
            404,
            300
        );
    }

    /*
     * 2. Search Wikipedia.
     */

    let wikipediaTitle =
        null;

    try {

        wikipediaTitle =
            await searchWikipediaVehicle(
                vehicle.make,
                vehicle.model,
                kind
            );

    } catch (error) {

        console.error(
            "Wikipedia vehicle search failed:",
            error
        );
    }

    if (!wikipediaTitle) {

        return jsonResponse(
            createWikipediaNoInformation(
                vehicle.make,
                vehicle.model,
                kind
            ),
            200,
            WIKIPEDIA_CACHE_TTL
        );
    }

    /*
     * 3. Load Wikipedia page.
     */

    let page =
        null;

    try {

        page =
            await getWikipediaPage(
                wikipediaTitle
            );

    } catch (error) {

        console.error(
            "Wikipedia page lookup failed:",
            wikipediaTitle,
            error
        );
    }

    if (!page) {

        return jsonResponse(
            createWikipediaNoInformation(
                vehicle.make,
                vehicle.model,
                kind
            ),
            200,
            WIKIPEDIA_CACHE_TTL
        );
    }

    /*
     * 4. Parse real Wikipedia infobox.
     */

    const specifications =
        await getWikipediaInfobox(
            page.title
        );

    const comparisonAvailable =
        hasWikipediaVehicleInformation(
            specifications
        );

    /*
     * 5. Final response.
     */

    return jsonResponse(
        {

            success:
                true,

            source: {

                catalog:
                    "VehiclesDB Open Dataset",

                information:
                    "Wikipedia"

            },

            kind,

            vehicle: {

                make:
                    vehicle.make,

                model:
                    vehicle.model,

                kind:
                    vehicle.kind,

                body_type:
                    vehicle.bodyType,

                body_types:
                    vehicle.bodyTypes,

                year_start:
                    vehicle.yearStart,

                year_end:
                    vehicle.yearEnd,

                global_decile:
                    vehicle.globalDecile

            },

            wikipedia: {

                title:
                    page.title,

                url:
                    page.url,

                description:
                    page.description ||
                    "No Information"

            },

            image:
                page.image
                    ? {

                        url:
                            page.image,

                        source_url:
                            page.url

                    }
                    : null,

            specifications,

            comparisonAvailable

        },
        200,
        WIKIPEDIA_CACHE_TTL
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
                ) ||
                "models"
            )
                .trim()
                .toLowerCase();

        /*
         * Load VehiclesDB.
         */

        const database =
            await loadVehiclesDatabase();

        /*
         * Route action.
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

                        success:
                            false,

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

                success:
                    false,

                error:
                    error?.message ||
                    "Internal server error"

            },
            500,
            60
        );
    }
}
