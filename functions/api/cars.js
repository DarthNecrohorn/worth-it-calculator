/*
 * ============================================================
 * WORTH IT - VEHICLES API
 * VehiclesDB Open Dataset + Wikipedia supplemental data
 *
 * Catalog traffic is served directly from VehiclesDB CDN.
 * This Function is kept lightweight: it does not parse the full
 * VehiclesDB database for normal catalog requests.
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
const MAX_MODELS_PER_KIND = 300; // Keep the catalog focused on popular vehicles
const WIKIPEDIA_CACHE_VERSION = "v15";

const WIKIPEDIA_API =
    "https://en.wikipedia.org/w/api.php";

const WIKIMEDIA_COMMONS_API =
    "https://commons.wikimedia.org/w/api.php";

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

    try {
        await cache.put(
            cacheKey,
            cacheResponse
        );
    } catch (error) {
        console.error(
            "VehiclesDB cache write failed:",
            error
        );
    }

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
                make: make.name || "",
                makeSlug: make.slug || "",
                model: model.name || "",
                modelSlug: model.slug || "",
                kind: modelKind,
                bodyType: model.body_type || null,
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
                    model.year_start ?? null,
                yearEnd:
                    model.year_end ?? null
            });
        }
    }

    const unique = new Map();

    for (const vehicle of models) {

        const key =
            `${simplifyText(vehicle.make)}|` +
            `${simplifyText(vehicle.model)}|` +
            `${vehicle.kind}`;

        if (!unique.has(key)) {
            unique.set(key, vehicle);
        }
    }

    const result = Array.from(unique.values());

    /*
     * VehiclesDB globalDecile is a popularity bucket where
     * lower numbers represent greater popularity. Keep only
     * the most popular models for the requested vehicle kind.
     *
     * This is recalculated whenever the cached VehiclesDB dataset
     * refreshes, so newer popular models can naturally replace
     * less-popular models without maintaining a manual list.
     */
    result.sort((a, b) => {

        const aPopularity = Number(a.globalDecile);
        const bPopularity = Number(b.globalDecile);

        const aValid = Number.isFinite(aPopularity);
        const bValid = Number.isFinite(bPopularity);

        if (aValid && bValid && aPopularity !== bPopularity) {
            return aPopularity - bPopularity;
        }

        if (aValid !== bValid) {
            return aValid ? -1 : 1;
        }

        const makeCompare = a.make.localeCompare(
            b.make,
            undefined,
            { sensitivity: "base" }
        );

        if (makeCompare !== 0) {
            return makeCompare;
        }

        return a.model.localeCompare(
            b.model,
            undefined,
            { sensitivity: "base" }
        );
    });

    return result.slice(0, MAX_MODELS_PER_KIND);
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
            normalizeText(vehicle.make) === targetMake &&
            normalizeText(vehicle.model) === targetModel
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
            simplifyText(vehicle.make) === simplifiedMake &&
            simplifyText(vehicle.model) === simplifiedModel
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
                    vehicleModel.includes(targetModel) ||
                    targetModel.includes(vehicleModel)
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
        make: vehicle.make,
        model: vehicle.model,
        name:
            `${vehicle.make} ${vehicle.model}`,
        year,
        kind: vehicle.kind,
        body_type: vehicle.bodyType,
        body_types: vehicle.bodyTypes,

        base_msrp: null,
        horsepower: null,
        drivetrain: null,
        drive_train: null,
        fuel_type: null,
        fuel: null,
        engine: null,
        transmission: null,
        mpg_combined: null,
        is_electric: false,
        is_plugin_electric: false,

        global_decile: vehicle.globalDecile,
        availability: vehicle.availability,
        year_start: vehicle.yearStart,
        year_end: vehicle.yearEnd,
        make_slug: vehicle.makeSlug,
        model_slug: vehicle.modelSlug
    };
}

/*
 * ------------------------------------------------------------
 * Validate kind
 * ------------------------------------------------------------
 */

function getRequestedKind(requestUrl) {

    const rawKind =
        requestUrl.searchParams.get("kind");

    if (!rawKind) {
        return "car";
    }

    const normalizedRaw =
        String(rawKind)
            .trim()
            .toLowerCase();

    if (!Object.prototype.hasOwnProperty.call(
        VEHICLE_KIND_ALIASES,
        normalizedRaw
    )) {
        return null;
    }

    const kind =
        VEHICLE_KIND_ALIASES[normalizedRaw];

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
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error: "Invalid vehicle kind",
                supportedKinds:
                    Array.from(VALID_KINDS)
            },
            400,
            60
        );
    }

    const make =
        requestUrl.searchParams.get("make");

    const search =
        requestUrl.searchParams.get("search");

    let models =
        getModelsByKind(database, kind);

    if (make) {

        const targetMake =
            normalizeText(make);

        const simplifiedMake =
            simplifyText(make);

        models =
            models.filter(vehicle =>
                normalizeText(vehicle.make) === targetMake ||
                simplifyText(vehicle.make) === simplifiedMake
            );
    }

    if (search) {

        const query =
            normalizeText(search);

        models =
            models.filter(vehicle =>
                normalizeText(
                    `${vehicle.make} ${vehicle.model}`
                ).includes(query)
            );
    }

    models.sort((a, b) => {

        const makeCompare =
            a.make.localeCompare(
                b.make,
                undefined,
                { sensitivity: "base" }
            );

        if (makeCompare !== 0) {
            return makeCompare;
        }

        return a.model.localeCompare(
            b.model,
            undefined,
            { sensitivity: "base" }
        );
    });

    return jsonResponse({
        success: true,
        kind,
        count: models.length,
        vehicles: models,
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
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error: "Invalid vehicle kind",
                supportedKinds:
                    Array.from(VALID_KINDS)
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
                error: "Invalid VehiclesDB dataset"
            },
            500,
            60
        );
    }

    const makes = new Map();

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
                    normalizeKind(model.kind) === kind
            );

        if (!hasKind) {
            continue;
        }

        const name = make.name || "";
        const key = normalizeText(name);

        if (!key) {
            continue;
        }

        if (!makes.has(key)) {

            makes.set(key, {
                name,
                slug: make.slug || "",
                kind
            });
        }
    }

    const result =
        Array.from(makes.values())
            .sort((a, b) =>
                a.name.localeCompare(
                    b.name,
                    undefined,
                    { sensitivity: "base" }
                )
            );

    return jsonResponse({
        success: true,
        kind,
        count: result.length,
        makes: result
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
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error: "Invalid vehicle kind",
                supportedKinds:
                    Array.from(VALID_KINDS)
            },
            400,
            60
        );
    }

    const make =
        requestUrl.searchParams.get("make");

    const model =
        requestUrl.searchParams.get("model");

    const year =
        requestUrl.searchParams.get("year");

    if (!make || !model) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing make or model parameter",
                bestMatch: null
            },
            400,
            60
        );
    }

    const models =
        getModelsByKind(database, kind);

    const vehicle =
        findVehicle(models, make, model);

    if (!vehicle) {

        return jsonResponse(
            {
                success: false,
                error:
                    `No ${kind} found for ${make} ${model}`,
                bestMatch: null
            },
            404,
            300
        );
    }

    return jsonResponse({
        success: true,
        source: "VehiclesDB Open Dataset",
        kind,
        bestMatch:
            createBestMatch(vehicle, year)
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
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error: "Invalid vehicle kind",
                variants: []
            },
            400,
            60
        );
    }

    const make =
        requestUrl.searchParams.get("make");

    const model =
        requestUrl.searchParams.get("model");

    const year =
        requestUrl.searchParams.get("year");

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
        getModelsByKind(database, kind);

    const vehicle =
        findVehicle(models, make, model);

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

    return jsonResponse({
        success: true,
        kind,
        make: vehicle.make,
        model: vehicle.model,
        year: year ? Number(year) : null,
        variants: [],
        bestMatch:
            createBestMatch(vehicle, year)
    });
}

/*
 * ------------------------------------------------------------
 * ACTION: IMAGES
 * ------------------------------------------------------------
 */

async function handleImages(requestUrl) {

    const make =
        requestUrl.searchParams.get("make");

    const model =
        requestUrl.searchParams.get("model");

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
        source: "VehiclesDB Open Dataset",
        make,
        model,
        images: []
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

async function fetchWikipediaCached(url) {

    const cache =
        caches.default;

    const cacheKey =
        new Request(
            `https://worth-it-internal-cache.local/wikipedia/${WIKIPEDIA_CACHE_VERSION}/${url}`
        );

    const cached =
        await cache.match(cacheKey);

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
                    "Accept": "application/json",
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
                    status: 200,
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

function normalizeWikipediaText(value) {

    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeWikipediaLabel(value) {

    return normalizeWikipediaText(value)
        .toLowerCase()
        .replace(/[_]/g, " ")
        .replace(/[:]/g, "")
        .replace(/[–—-]/g, " ")
        .replace(/\s+/g, " ");
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

    const specifications = {};

    for (const field of WIKIPEDIA_SPEC_FIELDS) {
        specifications[field] = "No Information";
    }

    return specifications;
}

/*
 * ------------------------------------------------------------
 * Map Wikipedia infobox labels to our normalized fields.
 * ------------------------------------------------------------
 */

const WIKIPEDIA_FIELD_ALIASES = {
    production: "production",
    years: "production",
    "model years": "production",
    "production years": "production",
    "production date": "production",
    "production period": "production",
    "model year": "production",

    generation: "generation",
    generations: "generation",

    "body style": "bodyType",
    "body styles": "bodyType",
    "body type": "bodyType",
    "body types": "bodyType",
    body: "bodyType",

    engine: "engine",
    engines: "engine",
    motor: "engine",
    motors: "engine",
    "electric motor": "engine",
    "electric motors": "engine",
    "engine type": "engine",
    "motor type": "engine",
    emotor: "engine",

    fuel: "fuel",
    "fuel type": "fuel",
    "fuel types": "fuel",
    "fuel system": "fuel",

    transmission: "transmission",
    transmissions: "transmission",
    gearbox: "transmission",
    gearboxes: "transmission",

    drivetrain: "drivetrain",
    "drive train": "drivetrain",
    "drive type": "drivetrain",
    drive: "drivetrain",
    layout: "drivetrain",
    "drive layout": "drivetrain",
    "wheel drive": "drivetrain",

    power: "horsepower",
    "power output": "horsepower",
    "engine power": "horsepower",
    "motor power": "horsepower",
    "maximum power": "horsepower",
    "max power": "horsepower",
    "peak power": "horsepower",
    horsepower: "horsepower",
    hp: "horsepower",

    torque: "torque",
    "maximum torque": "torque",
    "max torque": "torque",
    "peak torque": "torque",

    "curb weight": "weight",
    "kerb weight": "weight",
    "curb mass": "weight",
    "kerb mass": "weight",
    "gross weight": "weight",
    curbweight: "weight",
    weight: "weight",
    mass: "weight",

    length: "length",
    width: "width",
    height: "height",
    wheelbase: "wheelbase",

    "top speed": "topSpeed",
    "maximum speed": "topSpeed",
    "max speed": "topSpeed",
    topspeed: "topSpeed",

    battery: "battery",
    "battery capacity": "battery",
    "battery pack": "battery",
    "battery energy": "battery",
    "battery size": "battery",

    "electric range": "electricRange",
    "all electric range": "electricRange",
    "all-electric range": "electricRange",
    "driving range": "electricRange",
    "epa range": "electricRange",
    "wltp range": "electricRange",
    range: "electricRange",

    seating: "seating",
    seats: "seating",
    "seating capacity": "seating",
    "number of seats": "seating",
    "seat count": "seating",

    doors: "doors",
    "number of doors": "doors"
};

function getWikipediaSpecificationField(label) {

    const normalized =
        normalizeWikipediaLabel(label);

    return WIKIPEDIA_FIELD_ALIASES[normalized] || null;
}

/*
 * ------------------------------------------------------------
 * Find the complete vehicle infobox in raw wikitext.
 * ------------------------------------------------------------
 */

function extractBalancedWikipediaTemplate(source, start) {

    const input = String(source || "");

    if (
        start < 0 ||
        start >= input.length
    ) {
        return null;
    }

    let depth = 0;

    for (
        let i = start;
        i < input.length - 1;
        i++
    ) {

        const pair =
            input.slice(i, i + 2);

        if (pair === "{{") {
            depth++;
            i++;
            continue;
        }

        if (pair === "}}") {

            depth--;

            if (depth === 0) {
                return input.slice(
                    start,
                    i + 2
                );
            }

            i++;
        }
    }

    return null;
}

function findWikipediaInfoboxes(source) {

    const input = String(source || "");
    const results = [];

    const pattern =
        /\{\{\s*Infobox\s+(automobile|car|vehicle|electric vehicle|road vehicle|motorcycle|motorbike|truck|bus|van|moped|commercial vehicle)\b/gi;

    let match;

    while ((match = pattern.exec(input)) !== null) {

        const infobox =
            extractBalancedWikipediaTemplate(
                input,
                match.index
            );

        if (infobox) {
            results.push(infobox);
        }
    }

    return results;
}

function findWikipediaInfobox(source) {

    const infoboxes =
        findWikipediaInfoboxes(source);

    return infoboxes.length
        ? infoboxes[0]
        : null;
}


/*
 * ------------------------------------------------------------
 * Split raw infobox into top-level fields.
 *
 * The parser does not use line boundaries. This is important
 * because Wikipedia infobox parameters can span multiple lines.
 * ------------------------------------------------------------
 */

function extractWikipediaInfoboxFields(infobox) {

    const fields = {};

    if (!infobox) {
        return fields;
    }

    let templateDepth = 0;
    let linkDepth = 0;
    let fieldStart = -1;

    for (
        let i = 0;
        i < infobox.length - 1;
        i++
    ) {

        const pair =
            infobox.slice(i, i + 2);

        if (pair === "{{") {

            templateDepth++;
            i++;
            continue;
        }

        if (pair === "}}") {

            if (templateDepth === 1) {

                if (fieldStart !== -1) {

                    addWikipediaInfoboxField(
                        fields,
                        infobox.slice(fieldStart, i)
                    );
                }

                fieldStart = -1;
            }

            templateDepth =
                Math.max(0, templateDepth - 1);

            i++;
            continue;
        }

        if (pair === "[[") {

            linkDepth++;
            i++;
            continue;
        }

        if (pair === "]]" ) {

            linkDepth =
                Math.max(0, linkDepth - 1);

            i++;
            continue;
        }

        if (
            infobox[i] === "|" &&
            templateDepth === 1 &&
            linkDepth === 0
        ) {

            if (fieldStart !== -1) {

                addWikipediaInfoboxField(
                    fields,
                    infobox.slice(fieldStart, i)
                );
            }

            fieldStart = i + 1;
        }
    }

    return fields;
}

/*
 * ------------------------------------------------------------
 * Add one raw infobox field.
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
        findTopLevelEquals(segment);

    if (equalsIndex === -1) {
        return;
    }

    const rawKey =
        segment.slice(0, equalsIndex).trim();

    const rawValue =
        segment.slice(equalsIndex + 1).trim();

    if (!rawKey || !rawValue) {
        return;
    }

    const label =
        normalizeWikipediaLabel(rawKey);

    if (!label) {
        return;
    }

    /*
     * Keep the first occurrence only. Some templates contain
     * aliases such as engine/engines or repeated parameters.
     */

    if (!Object.prototype.hasOwnProperty.call(fields, label)) {
        fields[label] = rawValue;
    }
}

/*
 * ------------------------------------------------------------
 * Find the first top-level = in a field.
 * ------------------------------------------------------------
 */

function findTopLevelEquals(text) {

    let templateDepth = 0;
    let linkDepth = 0;

    for (
        let i = 0;
        i < text.length;
        i++
    ) {

        const pair =
            text.slice(i, i + 2);

        if (pair === "{{") {
            templateDepth++;
            i++;
            continue;
        }

        if (pair === "}}") {
            templateDepth =
                Math.max(0, templateDepth - 1);
            i++;
            continue;
        }

        if (pair === "[[") {
            linkDepth++;
            i++;
            continue;
        }

        if (pair === "]]" ) {
            linkDepth =
                Math.max(0, linkDepth - 1);
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
 * Split top-level template arguments.
 * ------------------------------------------------------------
 */

function splitWikipediaTemplateArguments(body) {

    const parts = [];

    let start = 0;
    let templateDepth = 0;
    let linkDepth = 0;

    for (
        let i = 0;
        i < body.length - 1;
        i++
    ) {

        const pair =
            body.slice(i, i + 2);

        if (pair === "{{") {
            templateDepth++;
            i++;
            continue;
        }

        if (pair === "}}") {
            templateDepth =
                Math.max(0, templateDepth - 1);
            i++;
            continue;
        }

        if (pair === "[[") {
            linkDepth++;
            i++;
            continue;
        }

        if (pair === "]]" ) {
            linkDepth =
                Math.max(0, linkDepth - 1);
            i++;
            continue;
        }

        if (
            body[i] === "|" &&
            templateDepth === 0 &&
            linkDepth === 0
        ) {

            parts.push(
                body.slice(start, i)
            );

            start = i + 1;
        }
    }

    parts.push(body.slice(start));

    return parts;
}

/*
 * ------------------------------------------------------------
 * Resolve one innermost Wikipedia template.
 * ------------------------------------------------------------
 */

function replaceInnermostWikipediaTemplate(text) {

    const match =
        text.match(/\{\{([^{}]*)\}\}/);

    if (!match) {
        return text;
    }

    const fullTemplate = match[0];
    const body = match[1];

    const parts =
        splitWikipediaTemplateArguments(body);

    const templateName =
        String(parts.shift() || "")
            .trim()
            .toLowerCase();

    const positional = [];

    for (const part of parts) {

        const cleanPart =
            String(part || "").trim();

        if (!cleanPart) {
            continue;
        }

        if (
            findTopLevelEquals(cleanPart) === -1
        ) {
            positional.push(cleanPart);
        }
    }

    let replacement = "";

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

        } else if (positional.length >= 2) {

            replacement =
                `${positional[0]} ${positional[1]}`;

        } else if (positional.length >= 1) {

            replacement = positional[0];
        }

    } else if (
        [
            "nowrap",
            "small",
            "mono",
            "plainlist",
            "plain list",
            "nowraplinks"
        ].includes(templateName)
    ) {

        replacement = positional.join("; ");

    } else if (
        [
            "unbulleted list",
            "unbulleted",
            "ubl",
            "flatlist",
            "bulleted list"
        ].includes(templateName)
    ) {

        replacement =
            positional
                .map(item =>
                    item
                        .replace(/^[*#;:]\s*/g, "")
                        .trim()
                )
                .filter(Boolean)
                .join("; ");

    } else if (
        positional.length === 1
    ) {

        replacement = positional[0];

    } else if (
        positional.length > 1
    ) {

        /*
         * For unknown simple wrappers, keeping positional text
         * is safer than exposing raw template syntax.
         */

        replacement = positional.join(" ");
    }

    return (
        text.slice(0, match.index) +
        replacement +
        text.slice(
            match.index + fullTemplate.length
        )
    );
}

/*
 * ------------------------------------------------------------
 * Clean a Wikipedia wikitext value.
 * ------------------------------------------------------------
 */

function cleanWikipediaWikitextValue(value) {

    let text =
        String(value || "").trim();

    if (!text) {
        return "No Information";
    }

    /* Remove comments and references. */

    text =
        text.replace(
            /<!--[\s\S]*?-->/g,
            " "
        );

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

    /* HTML line breaks. */

    text =
        text.replace(
            /<br\s*\/?\s*>/gi,
            "; "
        );

    /* Remove remaining HTML tags. */

    text =
        text.replace(
            /<[^>]+>/g,
            " "
        );

    /*
     * Resolve nested templates from the inside out.
     */

    for (
        let pass = 0;
        pass < 30;
        pass++
    ) {

        const next =
            replaceInnermostWikipediaTemplate(text);

        if (next === text) {
            break;
        }

        text = next;
    }

    /* Wiki links with display text. */

    text =
        text.replace(
            /\[\[([^|\]]+)\|([^\]]+)\]\]/g,
            "$2"
        );

    /* Simple wiki links. */

    text =
        text.replace(
            /\[\[([^\]]+)\]\]/g,
            "$1"
        );

    /* External links. */

    text =
        text.replace(
            /\[(?:https?:\/\/|\/\/)[^\s\]]+\s+([^\]]+)\]/gi,
            "$1"
        );

    /* Formatting markup. */

    text =
        text.replace(/'{2,5}/g, "");

    /* Common HTML entities. */

    const entityMap = {
        "&nbsp;": " ",
        "&ndash;": "–",
        "&mdash;": "—",
        "&minus;": "−",
        "&amp;": "&",
        "&quot;": '"',
        "&#39;": "'",
        "&apos;": "'"
    };

    for (
        const [entity, replacement] of Object.entries(entityMap)
    ) {

        text =
            text.replace(
                new RegExp(entity, "gi"),
                replacement
            );
    }

    /* Citation markers such as [1], [2]. */

    text =
        text.replace(
            /\[\s*\d+\s*\]/g,
            ""
        );

    /* List markers. */

    text =
        text.replace(
            /(^|\s)[*#]+\s*/g,
            "$1"
        );

    /* Normalize whitespace/newlines. */

    text =
        text
            .replace(/\s*\n\s*/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    return text || "No Information";
}

/*
 * ------------------------------------------------------------
 * Parse Wikipedia infobox from raw wikitext.
 * ------------------------------------------------------------
 */

function normalizeWikipediaSpecificationValue(
    field,
    value
) {

    let text =
        normalizeWikipediaText(value);

    if (!text) {
        return "";
    }

    /* Remove empty list separators produced by Wikipedia markup. */
    text =
        text
            .replace(/:\s*;/g, ": ")
            .replace(/;\s*;/g, "; ")
            .replace(/^;\s*/g, "")
            .replace(/;\s*$/g, "")
            .replace(/\s+/g, " ")
            .trim();

    /*
     * Some Wikipedia dimension/weight values contain a dangling
     * dash when the second side of a range is intentionally absent.
     * Remove only that dangling dash; never alter a real range.
     * Production dates are preserved exactly because an en dash can
     * legitimately mean "through/present".
     */
    if (field !== "production") {
        text =
            text
                .replace(/\s+[–—-]\s*$/u, "")
                .trim();
    }

    return text;
}

function isUsefulWikipediaValue(value) {

    const normalized =
        normalizeWikipediaText(value);

    return (
        normalized.length > 0 &&
        !/^no information$/i.test(normalized)
    );
}

function setWikipediaSpecificationIfMissing(
    specifications,
    field,
    value
) {

    if (
        !field ||
        !isUsefulWikipediaValue(value)
    ) {
        return;
    }

    const normalizedValue =
        normalizeWikipediaSpecificationValue(
            field,
            value
        );

    if (!normalizedValue) {
        return;
    }

    if (
        !specifications[field] ||
        specifications[field] === "No Information"
    ) {
        specifications[field] =
            normalizedValue;
    }
}

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

        /*
         * Use the page's FIRST vehicle infobox as the family/page
         * infobox. Do not select a later generation infobox merely
         * because it contains more fields: doing that can silently
         * turn a family-level article such as Toyota Prius into a
         * generation-specific result without saying so.
         *
         * Generation-specific data is handled separately by the
         * explicit Wikipedia generation fallback.
         */
        const infobox =
            findWikipediaInfobox(source);

        if (!infobox) {
            return specifications;
        }

        const fields =
            extractWikipediaInfoboxFields(
                infobox
            );

        for (const [label, rawValue] of Object.entries(fields)) {

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

            setWikipediaSpecificationIfMissing(
                specifications,
                field,
                value
            );
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
 * Rendered Wikipedia HTML infobox fallback
 * ------------------------------------------------------------
 *
 * The MediaWiki Parse API can return both the original wikitext
 * and rendered HTML. The HTML fallback lets us read the actual
 * labels/data that Wikipedia renders in the infobox, even when
 * template parameter names vary between articles.
 * ------------------------------------------------------------
 */

function decodeWikipediaHtmlEntities(value) {

    return String(value || "")
        .replace(/&#(\d+);/g, (_, code) => {

            const number = Number(code);

            if (
                !Number.isInteger(number) ||
                number < 0 ||
                number > 0x10FFFF
            ) {
                return _;
            }

            return String.fromCodePoint(number);
        })
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {

            const number =
                Number.parseInt(code, 16);

            if (
                !Number.isInteger(number) ||
                number < 0 ||
                number > 0x10FFFF
            ) {
                return _;
            }

            return String.fromCodePoint(number);
        })
        .replace(/&nbsp;/gi, " ")
        .replace(/&ndash;/gi, "–")
        .replace(/&mdash;/gi, "—")
        .replace(/&minus;/gi, "−")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'");
}

function cleanWikipediaHtmlValue(value) {

    let text =
        String(value || "")
            .replace(
                /<!--[\s\S]*?-->/g,
                " "
            )
            .replace(
                /<ref[^>]*>[\s\S]*?<\/ref>/gi,
                " "
            )
            .replace(
                /<ref[^>]*\/?\s*>/gi,
                " "
            )
            .replace(
                /<br\s*\/?\s*>/gi,
                "; "
            )
            .replace(
                /<\/li>/gi,
                "; "
            )
            .replace(
                /<li\b[^>]*>/gi,
                " "
            )
            .replace(
                /<\/p>/gi,
                "; "
            )
            .replace(
                /<[^>]+>/g,
                " "
            );

    text =
        decodeWikipediaHtmlEntities(text)
            .replace(
                /\[\s*\d+\s*\]/g,
                ""
            )
            .replace(
                /[\u200B-\u200D\uFEFF]/g,
                ""
            )
            .replace(
                /\s*;\s*;/g,
                "; "
            )
            .replace(
                /(?:;\s*){2,}/g,
                "; "
            )
            .replace(
                /(^|\s);\s*/g,
                "$1"
            )
            .replace(
                /\s*;\s*(?=;|$)/g,
                ""
            )
            .replace(
                /(^|\s)[–—-](?=\s*$)/g,
                "$1"
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    return text || "No Information";
}

function extractBalancedHtmlTable(
    html,
    startIndex
) {

    const input = String(html || "");

    if (
        !input ||
        !Number.isInteger(startIndex) ||
        startIndex < 0
    ) {
        return null;
    }

    const tagRegex =
        /<\/?table\b[^>]*>/gi;

    tagRegex.lastIndex = startIndex;

    let depth = 0;
    let started = false;
    let match;

    while ((match = tagRegex.exec(input)) !== null) {

        const tag = match[0];

        if (/^<table\b/i.test(tag)) {
            depth++;
            started = true;
            continue;
        }

        if (/^<\/table\b/i.test(tag)) {

            if (!started) {
                continue;
            }

            depth--;

            if (depth === 0) {
                return input.slice(
                    startIndex,
                    match.index + tag.length
                );
            }
        }
    }

    return null;
}

function findWikipediaInfoboxHtml(html) {

    const input = String(html || "");

    if (!input) {
        return null;
    }

    const tableRegex =
        /<table\b[^>]*>/gi;

    let match;

    while ((match = tableRegex.exec(input)) !== null) {

        const openingTag = match[0];

        const classMatch =
            openingTag.match(
                /\bclass\s*=\s*["']([^"']*)["']/i
            );

        if (
            classMatch &&
            /(^|\s)infobox(?:\s|$)/i.test(
                classMatch[1]
            )
        ) {
            return extractBalancedHtmlTable(
                input,
                match.index
            );
        }
    }

    return null;
}

function extractHtmlRows(html) {

    const rows = [];
    const rowRegex =
        /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;

    let match;

    while ((match = rowRegex.exec(String(html || ""))) !== null) {
        rows.push(match[0]);
    }

    return rows;
}

function extractHtmlCells(row) {

    const cells = [];
    const cellRegex =
        /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

    let match;

    while ((match = cellRegex.exec(String(row || ""))) !== null) {

        cells.push({
            tag: match[1].toLowerCase(),
            attributes: match[2] || "",
            content: match[3] || ""
        });
    }

    return cells;
}

function getHtmlAttribute(
    attributes,
    name
) {

    const pattern =
        new RegExp(
            `\\b${name}\\s*=\\s*["']([^"']*)["']`,
            "i"
        );

    return (
        String(attributes || "")
            .match(pattern)?.[1] ||
        ""
    );
}

function parseWikipediaInfoboxHtml(html) {

    const specifications =
        createEmptyWikipediaSpecifications();

    const infobox =
        findWikipediaInfoboxHtml(html);

    if (!infobox) {
        return specifications;
    }

    try {

        const rows =
            extractHtmlRows(infobox);

        for (const row of rows) {

            const cells =
                extractHtmlCells(row);

            if (!cells.length) {
                continue;
            }

            let labelCell = null;
            let valueCell = null;

            for (const cell of cells) {

                const classes =
                    getHtmlAttribute(
                        cell.attributes,
                        "class"
                    );

                if (
                    /(^|\s)infobox-label(?:\s|$)/i.test(
                        classes
                    )
                ) {
                    labelCell = cell;
                    break;
                }
            }

            if (labelCell) {
                valueCell =
                    cells.find(
                        cell => cell !== labelCell
                    ) || null;
            } else {
                labelCell =
                    cells.find(
                        cell => cell.tag === "th"
                    ) || cells[0];

                valueCell =
                    cells.find(
                        cell => cell !== labelCell
                    ) || null;
            }

            if (!labelCell || !valueCell) {
                continue;
            }

            const label =
                cleanWikipediaHtmlValue(
                    labelCell.content
                );

            const value =
                cleanWikipediaHtmlValue(
                    valueCell.content
                );

            const field =
                getWikipediaSpecificationField(
                    label
                );

            if (
                !field ||
                !isUsefulWikipediaValue(value)
            ) {
                continue;
            }

            setWikipediaSpecificationIfMissing(
                specifications,
                field,
                value
            );
        }

    } catch (error) {

        console.error(
            "Wikipedia rendered HTML infobox parsing error:",
            error
        );
    }

    return specifications;
}

/*
 * ------------------------------------------------------------
 * Parse simple technical HTML tables.
 *
 * This is intentionally conservative. A table is used only when
 * its header row clearly exposes at least two vehicle-related
 * technical columns (for example Engine + Power + Torque). This
 * prevents unrelated Wikipedia tables from being mistaken for
 * vehicle specifications.
 * ------------------------------------------------------------
 */

function addAggregatedWikipediaSpecification(
    specifications,
    field,
    value,
    maxItems = 12,
    maxLength = 1200
) {

    if (
        !field ||
        !isUsefulWikipediaValue(value)
    ) {
        return;
    }

    const cleanValue =
        normalizeWikipediaSpecificationValue(
            field,
            value
        );

    if (!cleanValue) {
        return;
    }

    const current =
        isUsefulWikipediaValue(specifications?.[field])
            ? normalizeWikipediaText(specifications[field])
            : "";

    if (!current) {
        specifications[field] = cleanValue;
        return;
    }

    const existing =
        current
            .split("; ")
            .map(item => item.trim())
            .filter(Boolean);

    const normalizedCurrent =
        new Set(
            existing.map(item => item.toLowerCase())
        );

    if (
        normalizedCurrent.has(
            cleanValue.toLowerCase()
        )
    ) {
        return;
    }

    if (existing.length >= maxItems) {
        return;
    }

    const combined =
        `${current}; ${cleanValue}`;

    specifications[field] =
        combined.length <= maxLength
            ? combined
            : combined.slice(0, maxLength).trim();
}

function parseWikipediaTechnicalTables(html) {

    const specifications =
        createEmptyWikipediaSpecifications();

    const input = String(html || "");

    if (!input) {
        return specifications;
    }

    try {

        const tableOpenRegex =
            /<table\b[^>]*>/gi;

        let match;

        while (
            (match = tableOpenRegex.exec(input)) !== null
        ) {

            const openingTag = match[0];

            const classMatch =
                openingTag.match(
                    /\bclass\s*=\s*["']([^"']*)["']/i
                );

            if (
                classMatch &&
                /(^|\s)infobox(?:\s|$)/i.test(
                    classMatch[1]
                )
            ) {
                continue;
            }

            const table =
                extractBalancedHtmlTable(
                    input,
                    match.index
                );

            if (!table) {
                continue;
            }

            const rows =
                extractHtmlRows(table);

            if (rows.length < 2) {
                continue;
            }

            let headerIndex = -1;
            let headerFields = [];
            let technicalHeaderCount = 0;

            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {

                const cells =
                    extractHtmlCells(rows[rowIndex]);

                if (cells.length < 2) {
                    continue;
                }

                const headers =
                    cells.filter(
                        cell => cell.tag === "th"
                    );

                if (headers.length < 2) {
                    continue;
                }

                const candidateFields =
                    cells.map(cell =>
                        getWikipediaSpecificationField(
                            cleanWikipediaHtmlValue(
                                cell.content
                            )
                        )
                    );

                const candidateTechnicalCount =
                    candidateFields.filter(Boolean).length;

                if (candidateTechnicalCount < 2) {
                    continue;
                }

                headerIndex = rowIndex;
                headerFields = candidateFields;
                technicalHeaderCount = candidateTechnicalCount;
                break;
            }

            if (
                headerIndex === -1 ||
                technicalHeaderCount < 2
            ) {
                continue;
            }

            for (
                let rowIndex = headerIndex + 1;
                rowIndex < rows.length;
                rowIndex++
            ) {

                const cells =
                    extractHtmlCells(rows[rowIndex]);

                if (
                    cells.length < headerFields.length
                ) {
                    continue;
                }

                for (
                    let columnIndex = 0;
                    columnIndex < headerFields.length;
                    columnIndex++
                ) {

                    const field =
                        headerFields[columnIndex];

                    if (!field) {
                        continue;
                    }

                    const cell =
                        cells[columnIndex];

                    if (!cell) {
                        continue;
                    }

                    const value =
                        cleanWikipediaHtmlValue(
                            cell.content
                        );

                    if (!isUsefulWikipediaValue(value)) {
                        continue;
                    }

                    addAggregatedWikipediaSpecification(
                        specifications,
                        field,
                        value
                    );
                }
            }
        }

    } catch (error) {

        console.error(
            "Wikipedia technical table parsing error:",
            error
        );
    }

    return specifications;
}

/*
 * ------------------------------------------------------------
 * Find the latest generation article linked from a vehicle-family
 * Wikipedia page.
 *
 * Example:
 * BMW 3 Series -> Seventh generation -> BMW 3 Series (G20)
 *
 * This is used only when the family page itself does not expose
 * enough technical data. We never guess a generation from a year;
 * we follow Wikipedia's own "Main article" link.
 * ------------------------------------------------------------
 */

function extractWikipediaArticleTitleFromHref(href) {

    let value = String(href || "").trim();

    if (!value) {
        return null;
    }

    value =
        value
            .replace(/^https?:\/\/[^/]+/i, "")
            .replace(/^\/wiki\//i, "");

    if (!value || value.includes(":")) {
        return null;
    }

    try {
        value = decodeURIComponent(value);
    } catch {
        // Keep the original URL fragment if decoding fails.
    }

    value =
        decodeWikipediaHtmlEntities(value)
            .replace(/_/g, " ")
            .trim();

    return value || null;
}

function getGenerationNumber(label) {

    const normalized =
        normalizeWikipediaText(label).toLowerCase();

    const numeric = normalized.match(/\b(\d+)(?:st|nd|rd|th)?\s+generation\b/i);

    if (numeric) {
        const value = Number(numeric[1]);
        return Number.isFinite(value) ? value : 0;
    }

    const ordinals = {
        first: 1,
        second: 2,
        third: 3,
        fourth: 4,
        fifth: 5,
        sixth: 6,
        seventh: 7,
        eighth: 8,
        ninth: 9,
        tenth: 10,
        eleventh: 11,
        twelfth: 12
    };

    const ordinalMatch = normalized.match(
        /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+generation\b/i
    );

    return ordinalMatch
        ? ordinals[ordinalMatch[1].toLowerCase()] || 0
        : 0;
}

function getGenerationYear(label) {

    const match =
        String(label || "").match(/\b((?:19|20)\d{2})\b/);

    if (!match) {
        return 0;
    }

    const year = Number(match[1]);

    return Number.isFinite(year) ? year : 0;
}

function extractGenerationCodes(label) {

    const text = normalizeWikipediaText(label);

    const parenthetical = text.match(/\(([^)]*)\)/);

    if (!parenthetical) {
        return [];
    }

    const beforeYear = parenthetical[1]
        .split(";")[0]
        .trim();

    if (!beforeYear) {
        return [];
    }

    return beforeYear
        .split(/[\/,]/)
        .map(value => value.trim())
        .map(value => value.replace(/\s+/g, " "))
        .filter(value => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value));
}

function extractGenerationSections(html) {

    const input = String(html || "");

    if (!input) {
        return [];
    }

    const headings = [];
    const headingRegex = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;

    let headingMatch;

    while ((headingMatch = headingRegex.exec(input)) !== null) {

        const headingHtml = headingMatch[0];
        const headingText =
            cleanWikipediaHtmlValue(headingHtml);

        if (!/\bgeneration\b/i.test(headingText)) {
            continue;
        }

        headings.push({
            start: headingMatch.index,
            headingHtml,
            headingText,
            generationNumber: getGenerationNumber(headingText),
            year: getGenerationYear(headingText),
            codes: extractGenerationCodes(headingText)
        });
    }

    return headings.map((heading, index) => {

        const sectionStart = heading.start;

        let end = input.length;

        const nextH2Match = input
            .slice(sectionStart + heading.headingHtml.length)
            .match(/<h2\b[^>]*>/i);

        if (nextH2Match) {
            end =
                sectionStart +
                heading.headingHtml.length +
                nextH2Match.index;
        }

        return {
            ...heading,
            sectionHtml: input.slice(sectionStart, end)
        };
    });
}

function isCompatibleGenerationArticleTitle(
    title,
    make,
    model
) {

    const normalizedTitle =
        simplifyText(title || "");

    const normalizedMake =
        simplifyText(make || "");

    const normalizedModel =
        simplifyText(model || "");

    if (
        !normalizedTitle ||
        !normalizedMake ||
        !normalizedModel
    ) {
        return false;
    }

    if (
        !normalizedTitle.includes(normalizedMake) ||
        !normalizedTitle.includes(normalizedModel)
    ) {
        return false;
    }

    /*
     * When the catalog asks for a base model, do not follow a
     * separate plug-in/Prime/PHEV/PHV article just because it is
     * linked from the same generation section. The generation
     * section itself can still supply the shared/base specifications.
     */
    const requestedText =
        normalizeText(`${make} ${model}`);

    const requestedHasVariantMarker =
        /plug[- ]?in|prime|phev|phv/i.test(
            requestedText
        );

    if (!requestedHasVariantMarker) {
        const variantMarker =
            /plug[- ]?in|prime|phev|phv/i;

        if (variantMarker.test(title)) {
            return false;
        }
    }

    return true;
}

function getGenerationSectionMainArticleTitle(
    sectionHtml,
    make,
    model
) {

    const section = String(sectionHtml || "");

    if (!section) {
        return null;
    }

    const hrefRegex =
        /href=["'](\/wiki\/[^"'#]+)["'][^>]*>/gi;

    let hrefMatch;
    const candidates = [];

    while ((hrefMatch = hrefRegex.exec(section)) !== null) {

        const title =
            extractWikipediaArticleTitleFromHref(
                hrefMatch[1]
            );

        if (!title) {
            continue;
        }

        if (
            /^Wikipedia:/i.test(title) ||
            /^Template:/i.test(title) ||
            /^Help:/i.test(title) ||
            /^Category:/i.test(title) ||
            /^File:/i.test(title)
        ) {
            continue;
        }

        const beforeLink =
            section.slice(
                Math.max(0, hrefMatch.index - 300),
                hrefMatch.index
            );

        if (/Main articles?:/i.test(beforeLink)) {
            candidates.push(title);
        }
    }

    if (!candidates.length) {
        return null;
    }

    return (
        candidates.find(title =>
            isCompatibleGenerationArticleTitle(
                title,
                make,
                model
            )
        ) || null
    );
}

function extractGenerationCandidateArticleTitle(
    sectionHtml,
    make,
    model,
    codes
) {

    const section = String(sectionHtml || "");

    if (!section) {
        return null;
    }

    const mainArticle =
        getGenerationSectionMainArticleTitle(
            section,
            make,
            model
        );

    if (mainArticle) {
        return mainArticle;
    }

    const normalizedMake =
        simplifyText(make || "");

    const normalizedModel =
        simplifyText(model || "");

    const normalizedCodes =
        Array.isArray(codes)
            ? codes.map(code => simplifyText(code))
            : [];

    if (!normalizedMake || !normalizedModel) {
        return null;
    }

    const hrefRegex =
        /href=["'](\/wiki\/[^"'#]+)["'][^>]*>/gi;

    let hrefMatch;

    while ((hrefMatch = hrefRegex.exec(section)) !== null) {

        const title =
            extractWikipediaArticleTitleFromHref(
                hrefMatch[1]
            );

        if (!title) {
            continue;
        }

        if (
            /^Wikipedia:/i.test(title) ||
            /^Template:/i.test(title) ||
            /^Help:/i.test(title) ||
            /^Category:/i.test(title) ||
            /^File:/i.test(title)
        ) {
            continue;
        }

        const simplifiedTitle =
            simplifyText(title);

        if (
            !simplifiedTitle.includes(normalizedMake) ||
            !simplifiedTitle.includes(normalizedModel)
        ) {
            continue;
        }

        if (
            normalizedCodes.length &&
            !normalizedCodes.some(code =>
                code && simplifiedTitle.includes(code)
            )
        ) {
            continue;
        }

        return title;
    }

    return null;
}

async function searchWikipediaGenerationByCode(
    make,
    model,
    codes,
    kind
) {

    const candidateCodes =
        Array.isArray(codes)
            ? codes.slice(0, 3)
            : [];

    for (const code of candidateCodes) {

        if (!code) {
            continue;
        }

        try {

            const url = new URL(WIKIPEDIA_API);

            url.searchParams.set("action", "query");
            url.searchParams.set("list", "search");
            url.searchParams.set(
                "srsearch",
                `${make} ${model} ${code}`
            );
            url.searchParams.set("srnamespace", "0");
            url.searchParams.set("srlimit", "10");
            url.searchParams.set("format", "json");
            url.searchParams.set("formatversion", "2");

            const data =
                await fetchWikipediaCached(
                    url.toString()
                );

            const results =
                Array.isArray(data?.query?.search)
                    ? data.query.search
                    : [];

            const makeKey = simplifyText(make);
            const modelKey = simplifyText(model);
            const codeKey = simplifyText(code);

            const ranked =
                results
                    .map(result => {

                        const title =
                            String(result?.title || "");

                        const simplifiedTitle =
                            simplifyText(title);

                        let score = 0;

                        if (
                            makeKey &&
                            simplifiedTitle.includes(makeKey)
                        ) {
                            score += 30;
                        }

                        if (
                            modelKey &&
                            simplifiedTitle.includes(modelKey)
                        ) {
                            score += 40;
                        }

                        if (
                            codeKey &&
                            simplifiedTitle.includes(codeKey)
                        ) {
                            score += 60;
                        }

                        if (
                            simplifiedTitle ===
                            simplifyText(`${make} ${model} (${code})`)
                        ) {
                            score += 100;
                        }

                        if (/\s+\(.*\)$/i.test(title)) {
                            score += 5;
                        }

                        return { title, score };
                    })
                    .filter(item => item.score >= 90)
                    .sort((a, b) => b.score - a.score);

            if (ranked[0]?.title) {
                return ranked[0].title;
            }
        } catch (error) {

            console.error(
                "Wikipedia generation search error:",
                make,
                model,
                code,
                error
            );
        }
    }

    return null;
}

async function resolveLatestGenerationData(
    html,
    make,
    model,
    kind
) {

    const sections =
        extractGenerationSections(html);

    if (!sections.length) {
        return {
            title: null,
            label: null,
            specifications:
                createEmptyWikipediaSpecifications()
        };
    }

    const rankedSections =
        [...sections].sort((a, b) => {

            const generationCompare =
                (b.generationNumber || 0) -
                (a.generationNumber || 0);

            if (generationCompare !== 0) {
                return generationCompare;
            }

            return (b.year || 0) - (a.year || 0);
        });

    const latest = rankedSections[0];

    let title =
        extractGenerationCandidateArticleTitle(
            latest.sectionHtml,
            make,
            model,
            latest.codes
        );

    /*
     * Some current family pages do not include a Main article link
     * in the newest generation section. In that case the generation
     * heading itself gives us a model code such as XW60 or G50.
     * Search Wikipedia by that exact code instead of guessing data.
     */
    if (!title && latest.codes.length) {
        title =
            await searchWikipediaGenerationByCode(
                make,
                model,
                latest.codes,
                kind
            );
    }

    /*
     * The newest generation section may contain its own infobox.
     * This is especially useful for pages such as Toyota Prius,
     * where the latest-generation specs are embedded directly in
     * the family article.
     */
    const generationSpecifications =
        parseWikipediaInfoboxHtml(
            latest.sectionHtml
        );

    return {
        title,
        label: latest.headingText,
        specifications: generationSpecifications
    };
}

function mergeWikipediaSpecifications(
    primary,
    fallback
) {

    const merged =
        createEmptyWikipediaSpecifications();

    for (const field of WIKIPEDIA_SPEC_FIELDS) {

        if (
            isUsefulWikipediaValue(
                primary?.[field]
            )
        ) {
            merged[field] =
                normalizeWikipediaText(
                    primary[field]
                );
            continue;
        }

        if (
            isUsefulWikipediaValue(
                fallback?.[field]
            )
        ) {
            merged[field] =
                normalizeWikipediaText(
                    fallback[field]
                );
        }
    }

    return merged;
}


/*
 * ------------------------------------------------------------
 * Apply generation-specific specifications over family-level data.
 * Production stays family-level; technical fields may be replaced by
 * the newest generation's own Wikipedia infobox data.
 * ------------------------------------------------------------
 */

function mergeWikipediaGenerationSpecifications(
    family,
    generation
) {

    const merged =
        createEmptyWikipediaSpecifications();

    for (const field of WIKIPEDIA_SPEC_FIELDS) {
        if (isUsefulWikipediaValue(family?.[field])) {
            merged[field] =
                normalizeWikipediaSpecificationValue(
                    field,
                    family[field]
                );
        }
    }

    const overrideFields =
        WIKIPEDIA_SPEC_FIELDS.filter(
            field => field !== "production"
        );

    for (const field of overrideFields) {
        if (isUsefulWikipediaValue(generation?.[field])) {
            merged[field] =
                normalizeWikipediaSpecificationValue(
                    field,
                    generation[field]
                );
        }
    }

    return merged;
}

/*
 * ------------------------------------------------------------
 * Infer fuel only from explicit words already present in a real
 * Wikipedia engine/motor description. This does not invent a fuel
 * type from a vehicle's make or model.
 * ------------------------------------------------------------
 */

function inferWikipediaFuel(
    specifications
) {

    if (
        !specifications ||
        isUsefulWikipediaValue(specifications.fuel)
    ) {
        return;
    }

    const engine =
        normalizeWikipediaText(
            specifications.engine
        );

    if (!engine) {
        return;
    }

    const fuels = [];

    const addFuel = value => {
        if (!fuels.includes(value)) {
            fuels.push(value);
        }
    };

    if (/\bpetrol\b|\bgasoline\b|\bgas\b/i.test(engine)) {
        addFuel("Petrol");
    }

    if (/\bdiesel\b/i.test(engine)) {
        addFuel("Diesel");
    }

    if (/\bhydrogen\b/i.test(engine)) {
        addFuel("Hydrogen");
    }

    if (/\bCNG\b|compressed natural gas/i.test(engine)) {
        addFuel("CNG");
    }

    if (/\bLPG\b|liquefied petroleum gas/i.test(engine)) {
        addFuel("LPG");
    }

    if (/\belectric\b|\bEV\b/i.test(engine)) {
        addFuel("Electric");
    }

    if (/\bhybrid\b/i.test(engine)) {
        if (fuels.length) {
            fuels[0] = `${fuels[0]} hybrid`;
        } else {
            addFuel("Hybrid");
        }
    }

    if (fuels.length) {
        specifications.fuel = fuels.join("; ");
    }
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

    if (!make || !model) {
        return null;
    }

    const searches = [
        `${make} ${model} ${kind}`,
        `${make} ${model}`
    ];

    for (const search of searches) {

        try {

            const url =
                new URL(WIKIPEDIA_API);

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
                Array.isArray(data?.query?.search)
                    ? data.query.search
                    : [];

            if (!results.length) {
                continue;
            }

            const normalizedTarget =
                simplifyText(
                    `${make}${model}`
                );

            const exact =
                results.find(result =>
                    simplifyText(result?.title) ===
                    normalizedTarget
                );

            if (exact) {
                return exact.title;
            }

            const normalizedMake =
                simplifyText(make);

            const normalizedModel =
                simplifyText(model);

            const scored =
                results
                    .map(result => {

                        const title =
                            String(result?.title || "");

                        const simplifiedTitle =
                            simplifyText(title);

                        let score = 0;

                        if (
                            normalizedMake &&
                            simplifiedTitle.includes(normalizedMake)
                        ) {
                            score += 30;
                        }

                        if (
                            normalizedModel &&
                            simplifiedTitle.includes(normalizedModel)
                        ) {
                            score += 50;
                        }

                        if (
                            normalizedTarget &&
                            simplifiedTitle.includes(normalizedTarget)
                        ) {
                            score += 30;
                        }

                        /* Prefer normal article titles over disambiguation pages. */

                        if (
                            /\s+\(.*\)$/i.test(title)
                        ) {
                            score -= 15;
                        }

                        return {
                            title,
                            score
                        };
                    })
                    .sort(
                        (a, b) => b.score - a.score
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
 * ============================================================
 * WIKIMEDIA COMMONS COMMERCIAL IMAGE FILTER
 * ============================================================
 *
 * We only accept free licenses that clearly allow commercial use:
 *   - CC0
 *   - Public Domain / Public Domain Mark
 *   - CC BY
 *   - CC BY-SA
 *
 * NonCommercial, No-Derivatives, unknown, missing, or ambiguous
 * licenses are rejected. The allowlist is intentionally strict.
 *
 * This checks the copyright-license metadata supplied by Wikimedia
 * Commons. It does not remove other possible non-copyright legal
 * restrictions (for example trademarks or personality/property rights).
 * ------------------------------------------------------------
 */

function stripHtmlForMetadata(value) {

    return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeLicenseMetadata(value) {

    return stripHtmlForMetadata(value)
        .toLowerCase()
        .replace(/[–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
}

function getCommercialWikimediaLicense(extmetadata) {

    if (!extmetadata || typeof extmetadata !== "object") {
        return null;
    }

    const shortName =
        normalizeLicenseMetadata(
            extmetadata.LicenseShortName?.value
        );

    const usageTerms =
        normalizeLicenseMetadata(
            extmetadata.UsageTerms?.value
        );

    const licenseName =
        normalizeLicenseMetadata(
            extmetadata.License?.value
        );

    const licenseUrl =
        String(
            extmetadata.LicenseUrl?.value ||
            ""
        )
            .trim()
            .toLowerCase();

    const combined =
        [shortName, usageTerms, licenseName, licenseUrl]
            .filter(Boolean)
            .join(" ");

    if (!combined) {
        return null;
    }

    /* Explicitly reject non-commercial licenses and wording. */
    if (
        /non[- ]?commercial/.test(combined) ||
        /no commercial/.test(combined) ||
        /\bcc[- ]?by[- ]?nc(?:[- ]?sa|[- ]?nd)?\b/.test(combined) ||
        /\bby[- ]?nc(?:[- ]?sa|[- ]?nd)?\b/.test(combined)
    ) {
        return null;
    }

    /*
     * Only accept known commercial-use free licenses.
     * Commons accepts CC BY / CC BY-SA / CC0 and public-domain
     * material; the site intentionally does not use ND material.
     */

    const isCcZero =
        /\bcc[- ]?zero\b/.test(combined) ||
        /\bcc0\b/.test(combined) ||
        licenseUrl.includes("creativecommons.org/publicdomain/zero/");

    if (isCcZero) {
        return {
            name: stripHtmlForMetadata(
                extmetadata.LicenseShortName?.value
            ) || "CC0",
            url:
                String(extmetadata.LicenseUrl?.value || "").trim()
        };
    }

    const isPublicDomain =
        /public domain/.test(combined) ||
        /public-domain/.test(combined) ||
        /public domain mark/.test(combined) ||
        /\bpdm\b/.test(combined) ||
        licenseUrl.includes("creativecommons.org/publicdomain/");

    if (isPublicDomain) {
        return {
            name: stripHtmlForMetadata(
                extmetadata.LicenseShortName?.value
            ) || "Public Domain",
            url:
                String(extmetadata.LicenseUrl?.value || "").trim()
        };
    }

    const hasCcBySa =
        /\bcc[- ]?by[- ]?sa(?:[- ]?[0-9.]+)?\b/.test(combined) ||
        licenseUrl.includes("creativecommons.org/licenses/by-sa/");

    if (hasCcBySa) {
        return {
            name: stripHtmlForMetadata(
                extmetadata.LicenseShortName?.value
            ) || "CC BY-SA",
            url:
                String(extmetadata.LicenseUrl?.value || "").trim()
        };
    }

    const hasCcBy =
        /\bcc[- ]?by(?:[- ]?[0-9.]+)?\b/.test(combined) ||
        licenseUrl.includes("creativecommons.org/licenses/by/");

    if (hasCcBy) {
        return {
            name: stripHtmlForMetadata(
                extmetadata.LicenseShortName?.value
            ) || "CC BY",
            url:
                String(extmetadata.LicenseUrl?.value || "").trim()
        };
    }

    /* Unknown/ambiguous license = block. */
    return null;
}

async function getCommercialWikimediaImage(imageTitle) {

    if (!imageTitle) {
        return null;
    }

    let title =
        String(imageTitle || "").trim();

    if (!title) {
        return null;
    }

    if (!/^file:/i.test(title)) {
        title = `File:${title}`;
    }

    try {

        const url =
            new URL(WIKIMEDIA_COMMONS_API);

        url.searchParams.set("action", "query");
        url.searchParams.set("prop", "imageinfo");
        url.searchParams.set("titles", title);
        url.searchParams.set(
            "iiprop",
            "url|extmetadata"
        );
        url.searchParams.set(
            "iiextmetadatafilter",
            "License|LicenseShortName|UsageTerms|LicenseUrl|Artist|Credit"
        );
        url.searchParams.set("iiurlwidth", "1200");
        url.searchParams.set("iilimit", "1");
        url.searchParams.set("format", "json");
        url.searchParams.set("formatversion", "2");

        const data =
            await fetchWikipediaCached(
                url.toString()
            );

        const pages =
            data?.query?.pages;

        const page =
            Array.isArray(pages)
                ? pages[0]
                : Object.values(pages || {})[0];

        const imageInfo =
            Array.isArray(page?.imageinfo)
                ? page.imageinfo[0]
                : null;

        if (!imageInfo?.url) {
            return null;
        }

        const license =
            getCommercialWikimediaLicense(
                imageInfo.extmetadata
            );

        if (!license) {
            console.info(
                "Wikimedia image blocked by commercial-license filter:",
                title
            );
            return null;
        }

        const author =
            stripHtmlForMetadata(
                imageInfo.extmetadata?.Artist?.value ||
                imageInfo.extmetadata?.Credit?.value ||
                ""
            );

        return {
            /* Prefer the 1200px Commons thumbnail for card performance. */
            url:
                imageInfo.thumburl ||
                imageInfo.url,
            source_url:
                imageInfo.descriptionurl ||
                `https://commons.wikimedia.org/wiki/${encodeURIComponent(
                    title.replace(/ /g, "_")
                )}`,
            author: author || null,
            license: license.name,
            license_url: license.url || null
        };

    } catch (error) {

        console.error(
            "Wikimedia Commons image/license lookup failed:",
            title,
            error
        );

        return null;
    }
}

/*
 * ------------------------------------------------------------
 * Get Wikipedia page
 * ------------------------------------------------------------
 */

async function getWikipediaPage(title) {

    if (!title) {
        return null;
    }

    const url =
        new URL(WIKIPEDIA_API);

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
        "thumbnail|name"
    );

    /* Ask Wikipedia PageImages for a free image candidate.
     * We still verify the actual Commons license ourselves. */
    url.searchParams.set(
        "pilicense",
        "free"
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
            : Object.values(pages)[0];

    if (
        !page ||
        page.missing === true
    ) {
        return null;
    }

    return {
        pageId:
            page.pageid || null,

        title:
            page.title || title,

        description:
            normalizeWikipediaText(
                page.extract || ""
            ),

        image:
            page.thumbnail?.source ||
            null,

        imageTitle:
            page.pageimage ||
            null,

        url:
            page.fullurl ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(
                String(
                    page.title || title
                ).replace(/ /g, "_")
            )}`
    };
}

/*
 * ------------------------------------------------------------
 * Get Wikipedia infobox/specification data
 *
 * MediaWiki returns both the original wikitext and rendered HTML.
 * We parse the infobox first, then technical tables, and finally
 * (when necessary) the latest generation article linked by the
 * family page.
 * ------------------------------------------------------------
 */

async function getWikipediaInfoboxData(
    title,
    vehicleContext = null
) {

    if (!title) {
        return {
            specifications:
                createEmptyWikipediaSpecifications(),
            latestGenerationTitle: null,
            latestGenerationLabel: null,
            latestGenerationSpecifications:
                createEmptyWikipediaSpecifications()
        };
    }

    try {

        const url =
            new URL(WIKIPEDIA_API);

        url.searchParams.set("action", "parse");
        url.searchParams.set("page", title);
        url.searchParams.set("prop", "wikitext|text");
        url.searchParams.set("format", "json");
        url.searchParams.set("formatversion", "2");
        url.searchParams.set("redirects", "1");

        const data =
            await fetchWikipediaCached(
                url.toString()
            );

        const parse = data?.parse;

        if (!parse) {

            console.warn(
                "Wikipedia returned no parse data:",
                title
            );

            return {
                specifications:
                    createEmptyWikipediaSpecifications(),
                latestGenerationTitle: null,
                latestGenerationLabel: null,
                latestGenerationSpecifications:
                    createEmptyWikipediaSpecifications()
            };
        }

        const wikitext =
            typeof parse.wikitext === "string"
                ? parse.wikitext
                : parse.wikitext?.["*"] || "";

        const html =
            typeof parse.text === "string"
                ? parse.text
                : parse.text?.["*"] || "";

        const wikitextSpecifications =
            parseWikipediaInfobox(
                wikitext
            );

        const htmlSpecifications =
            parseWikipediaInfoboxHtml(
                html
            );

        /*
         * A page containing generation sections is a family/model-line
         * page. Technical tables on such a page often aggregate older
         * generations, which can create false associations. We therefore
         * use technical tables only on pages that are not clearly family
         * pages; generation-specific articles can still use them safely.
         */
        const generationSections =
            extractGenerationSections(html);

        const tableSpecifications =
            generationSections.length
                ? createEmptyWikipediaSpecifications()
                : parseWikipediaTechnicalTables(html);

        const merged =
            mergeWikipediaSpecifications(
                wikitextSpecifications,
                htmlSpecifications
            );

        const finalSpecifications =
            mergeWikipediaSpecifications(
                merged,
                tableSpecifications
            );

        let latestGeneration = {
            title: null,
            label: null,
            specifications:
                createEmptyWikipediaSpecifications()
        };

        if (
            vehicleContext &&
            generationSections.length
        ) {
            latestGeneration =
                await resolveLatestGenerationData(
                    html,
                    vehicleContext.make,
                    vehicleContext.model,
                    vehicleContext.kind
                );
        }

        return {
            specifications: finalSpecifications,
            latestGenerationTitle:
                latestGeneration.title,
            latestGenerationLabel:
                latestGeneration.label,
            latestGenerationSpecifications:
                latestGeneration.specifications
        };

    } catch (error) {

        console.error(
            "Wikipedia infobox request failed:",
            title,
            error
        );

        return {
            specifications:
                createEmptyWikipediaSpecifications(),
            latestGenerationTitle: null,
            latestGenerationLabel: null,
            latestGenerationSpecifications:
                createEmptyWikipediaSpecifications()
        };
    }
}

/*
 * Compatibility wrapper for any internal caller that only needs
 * specifications.
 */
async function getWikipediaInfobox(title) {

    const result =
        await getWikipediaInfoboxData(title);

    return result.specifications;
}

/*
 * ------------------------------------------------------------
 * Check whether actual technical information exists.
 * ------------------------------------------------------------
 */

function getWikipediaVehicleInformationCount(
    specifications
) {

    if (!specifications) {
        return 0;
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

    return comparisonFields.reduce((count, field) => {

        const value =
            specifications[field];

        return (
            count +
            (
                isUsefulWikipediaValue(value)
                    ? 1
                    : 0
            )
        );
    }, 0);
}

function hasWikipediaVehicleInformation(
    specifications
) {

    return getWikipediaVehicleInformationCount(
        specifications
    ) >= 2;
}

/*
 * ------------------------------------------------------------
 * Create complete "No Information" result
 * ------------------------------------------------------------
 */

function createWikipediaNoInformation(
    make,
    model,
    kind
) {

    return {
        success: true,
        source: {
            catalog: "VehiclesDB Open Dataset",
            information: "Wikipedia"
        },

        make:
            make || "No Information",

        model:
            model || "No Information",

        kind:
            kind || "No Information",

        wikipedia: {
            title: "No Information",
            url: null,
            description: "No Information"
        },

        image: null,

        specifications:
            createEmptyWikipediaSpecifications(),

        comparisonAvailable: false
    };
}

/*
 * ------------------------------------------------------------
 * ACTION: DETAILS
 * ------------------------------------------------------------
 */

async function handleDetails(
    requestUrl
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error: "Invalid vehicle kind"
            },
            400,
            60
        );
    }

    const make =
        requestUrl.searchParams.get("make");

    const model =
        requestUrl.searchParams.get("model");

    if (!make || !model) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing make or model parameter",
                vehicle: null
            },
            400,
            60
        );
    }

    /*
     * The frontend already received this vehicle from the
     * VehiclesDB open catalog. Do not reload and parse the full
     * VehiclesDB dataset for every Wikipedia detail request.
     * Cloudflare Workers Free allows only 10 ms CPU per request.
     */
    let bodyTypes = [];

    const rawBodyTypes =
        requestUrl.searchParams.get("body_types");

    if (rawBodyTypes) {
        try {
            const parsed = JSON.parse(rawBodyTypes);

            if (Array.isArray(parsed)) {
                bodyTypes = parsed;
            }
        } catch {
            bodyTypes = [];
        }
    }

    const rawGlobalDecile =
        requestUrl.searchParams.get("global_decile");

    const globalDecile =
        rawGlobalDecile !== null &&
        rawGlobalDecile !== "" &&
        Number.isFinite(Number(rawGlobalDecile))
            ? Number(rawGlobalDecile)
            : null;

    const vehicle = {
        make,
        model,
        kind,
        bodyType:
            requestUrl.searchParams.get("body_type") ||
            null,
        bodyTypes,
        yearStart:
            requestUrl.searchParams.get("year_start") ||
            null,
        yearEnd:
            requestUrl.searchParams.get("year_end") ||
            null,
        globalDecile
    };

    /* 1. Search Wikipedia. */

    let wikipediaTitle = null;

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

    /* 3. Load article summary/image. */

    let page = null;

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

    /* 4. Parse the real Wikipedia infobox data
     *    from both wikitext and rendered HTML. */

    const wikipediaData =
        await getWikipediaInfoboxData(
            page.title,
            {
                make: vehicle.make,
                model: vehicle.model,
                kind
            }
        );

    let specifications =
        wikipediaData.specifications;

    let specificationSourceTitle =
        page.title;

    /*
     * Prefer the newest generation's own data when the family page
     * identifies one directly. For family pages such as Toyota Prius
     * the latest-generation infobox can be embedded in the family page;
     * for pages such as BMW 3 Series we may need to load the generation
     * article found from Wikipedia's own links or model code.
     */
    if (
        wikipediaData.latestGenerationSpecifications &&
        hasWikipediaVehicleInformation(
            wikipediaData.latestGenerationSpecifications
        )
    ) {

        specifications =
            mergeWikipediaGenerationSpecifications(
                specifications,
                wikipediaData.latestGenerationSpecifications
            );

        if (wikipediaData.latestGenerationTitle) {
            specificationSourceTitle =
                wikipediaData.latestGenerationTitle;
        }
    }

    if (
        wikipediaData.latestGenerationTitle &&
        wikipediaData.latestGenerationTitle !== page.title
    ) {

        try {

            const generationData =
                await getWikipediaInfoboxData(
                    wikipediaData.latestGenerationTitle
                );

            const generationSpecifications =
                generationData.specifications;

            if (
                hasWikipediaVehicleInformation(
                    generationSpecifications
                )
            ) {

                specifications =
                    mergeWikipediaGenerationSpecifications(
                        specifications,
                        generationSpecifications
                    );

                specificationSourceTitle =
                    wikipediaData.latestGenerationTitle;
            }

        } catch (error) {

            console.error(
                "Wikipedia generation fallback failed:",
                wikipediaData.latestGenerationTitle,
                error
            );
        }
    }

    inferWikipediaFuel(specifications);

    if (!isUsefulWikipediaValue(specifications.fuel)) {
        const description =
            normalizeWikipediaText(
                page.description
            );

        if (/battery electric|all-electric|fully electric|electric vehicle/i.test(description)) {
            specifications.fuel = "Electric";
        } else if (/plug-in hybrid/i.test(description)) {
            specifications.fuel = "Plug-in hybrid";
        } else if (/hybrid drivetrain|hybrid vehicle|hybrid car/i.test(description)) {
            specifications.fuel = "Hybrid";
        }
    }

    /*
     * Make the scope explicit when technical values came from a
     * generation-specific Wikipedia article. We do not invent a
     * generation code; we use Wikipedia's exact article title when
     * available, otherwise the exact generation heading from the page.
     */
    if (
        wikipediaData.latestGenerationLabel &&
        !isUsefulWikipediaValue(
            specifications.generation
        )
    ) {
        /*
         * Always use Wikipedia's generation heading for the displayed
         * generation. This prevents a variant article title such as
         * "Toyota Prius Plug-in Hybrid (XW60)" from being reported as
         * the base Prius generation.
         */
        specifications.generation =
            wikipediaData.latestGenerationLabel;
    } else if (
        specificationSourceTitle !== page.title &&
        !isUsefulWikipediaValue(
            specifications.generation
        )
    ) {
        specifications.generation =
            specificationSourceTitle;
    }

    const comparisonAvailable =
        hasWikipediaVehicleInformation(
            specifications
        );

    /*
     * Image licensing is completely independent from vehicle data.
     * A vehicle with useful Wikipedia information stays available even
     * when its image is missing, disallowed, or has an unclear license.
     * In that case the frontend receives image: null and shows
     * “Image unavailable”.
     */
    let commercialImage = null;

    try {

        commercialImage =
            await getCommercialWikimediaImage(
                page.imageTitle
            );

    } catch (error) {

        console.error(
            "Commercial Wikimedia image check failed:",
            page.title,
            error
        );
    }

    /* 5. Return stable frontend response. */

    return jsonResponse(
        {
            success: true,

            source: {
                catalog:
                    "VehiclesDB Open Dataset",
                information:
                    "Wikipedia"
            },

            kind,

            vehicle: {
                make: vehicle.make,
                model: vehicle.model,
                kind: vehicle.kind,
                body_type: vehicle.bodyType,
                body_types: vehicle.bodyTypes,
                year_start: vehicle.yearStart,
                year_end: vehicle.yearEnd,
                global_decile: vehicle.globalDecile
            },

            wikipedia: {
                title: page.title,
                url: page.url,
                description:
                    page.description ||
                    "No Information"
            },

            image:
                commercialImage,

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

/*
 * ------------------------------------------------------------
 * Lightweight catalog redirect
 *
 * The browser now reads VehiclesDB catalog files directly. These
 * redirects keep the old /api/cars models/makes URLs usable without
 * making Cloudflare parse the full 14k+ model database.
 * ------------------------------------------------------------
 */
function redirectToVehiclesDbCatalog(
    requestUrl,
    fileName
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {

        return jsonResponse(
            {
                success: false,
                error: "Invalid vehicle kind",
                supportedKinds:
                    Array.from(VALID_KINDS)
            },
            400,
            60
        );
    }

    const targetUrl =
        `https://cdn.jsdelivr.net/gh/vehiclesdb/vehiclesdb@latest/catalog/${kind}/${fileName}`;

    return new Response(
        null,
        {
            status: 302,
            headers: {
                Location: targetUrl,
                "Cache-Control":
                    `public, max-age=${CACHE_TTL}`
            }
        }
    );
}

/*
 * ------------------------------------------------------------
 * Lightweight vehicle response
 *
 * Legacy consumers can still request /vehicle or /variants without
 * forcing Cloudflare to load the complete VehiclesDB database.
 * The detailed technical data remains the responsibility of the
 * Wikipedia details endpoint below.
 * ------------------------------------------------------------
 */
function createLightweightVehicleFromRequest(
    requestUrl
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {
        return null;
    }

    const make =
        requestUrl.searchParams.get("make") ||
        "";

    const model =
        requestUrl.searchParams.get("model") ||
        "";

    const yearRaw =
        requestUrl.searchParams.get("year");

    let year =
        yearRaw !== null
            ? Number(yearRaw)
            : null;

    if (
        !Number.isFinite(year) ||
        year <= 0
    ) {
        year = null;
    }

    return {
        make,
        model,
        name:
            `${make} ${model}`.trim(),
        year,
        kind,
        body_type: null,
        body_types: [],
        base_msrp: null,
        horsepower: null,
        drivetrain: null,
        drive_train: null,
        fuel_type: null,
        fuel: null,
        engine: null,
        transmission: null,
        mpg_combined: null,
        is_electric: false,
        is_plugin_electric: false
    };
}

/*
 * ============================================================
 * MAIN REQUEST HANDLER
 * ============================================================
 */

export async function onRequestGet(context) {

    try {

        const requestUrl =
            new URL(
                context.request.url
            );

        const action =
            (
                requestUrl.searchParams.get("action") ||
                "models"
            )
                .trim()
                .toLowerCase();

        switch (action) {

            /*
             * Direct redirects avoid parsing the full VehiclesDB
             * catalog inside the Cloudflare Function.
             */
            case "models":
                return redirectToVehiclesDbCatalog(
                    requestUrl,
                    "models.json"
                );

            case "makes":
                return redirectToVehiclesDbCatalog(
                    requestUrl,
                    "makes.json"
                );

            case "vehicle": {

                const vehicle =
                    createLightweightVehicleFromRequest(
                        requestUrl
                    );

                if (!vehicle || !vehicle.make || !vehicle.model) {

                    return jsonResponse(
                        {
                            success: false,
                            error:
                                "Missing make or model parameter",
                            bestMatch: null
                        },
                        400,
                        60
                    );
                }

                return jsonResponse({
                    success: true,
                    source:
                        "VehiclesDB Open Dataset",
                    kind: vehicle.kind,
                    bestMatch: vehicle
                });
            }

            case "variants": {

                const vehicle =
                    createLightweightVehicleFromRequest(
                        requestUrl
                    );

                if (!vehicle || !vehicle.make || !vehicle.model) {

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

                return jsonResponse({
                    success: true,
                    kind: vehicle.kind,
                    make: vehicle.make,
                    model: vehicle.model,
                    year: vehicle.year,
                    variants: [],
                    bestMatch: vehicle
                });
            }

            case "images":
                return handleImages(
                    requestUrl
                );

            case "details":
                return handleDetails(
                    requestUrl
                );

            default:
                return jsonResponse(
                    {
                        success: false,
                        error: "Invalid action",
                        supportedActions: [
                            "makes",
                            "models",
                            "variants",
                            "vehicle",
                            "images",
                            "details"
                        ],
                        supportedKinds:
                            Array.from(VALID_KINDS)
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
