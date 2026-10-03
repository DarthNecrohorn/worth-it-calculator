import { recordAdminApiUsage } from "../lib/admin-usage.js";

/*
 * ============================================================
 * WORTH IT - VEHICLES API
 * VehiclesDB Open Dataset + Wikidata + DBpedia supplemental data
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
const NEGATIVE_WIKIPEDIA_CACHE_TTL = 300; // 5 minutes for temporary no-data results
const MAX_MODELS_PER_KIND = 300; // Keep the catalog focused on popular vehicles
const WIKIDATA_CANDIDATE_LIMIT = 600;
const WIKIDATA_NONCAR_CANDIDATE_LIMIT = 1000;
const DBPEDIA_CANDIDATE_LIMIT = 600;
const DBPEDIA_NONCAR_CANDIDATE_LIMIT = 1000;
const WIKIPEDIA_CACHE_VERSION = "v28";
const WIKIMEDIA_IMAGE_LOOKUP_TIMEOUT_MS = 3500;

const WIKIPEDIA_API =
    "https://en.wikipedia.org/w/api.php";

const WIKIMEDIA_COMMONS_API =
    "https://commons.wikimedia.org/w/api.php";

const WIKIDATA_SPARQL_API =
    "https://query.wikidata.org/sparql";

const WIKIDATA_CACHE_TTL =
    604800;

const WIKIDATA_CLASS_BY_KIND = {
    car: "Q1420",
    motorcycle: "Q34493",
    van: "Q2666883",
    truck: "Q43193",
    bus: "Q5638"
};

const DBPEDIA_SPARQL_API =
    "https://dbpedia.org/sparql";

const DBPEDIA_CACHE_TTL =
    604800;

const DBPEDIA_KIND_TEXT_FILTERS = {
    motorcycle:
        "motorcycle|motorbike|scooter|moped",
    van:
        "van|minivan|light commercial vehicle|panel van|people carrier",
    truck:
        "truck|lorry|heavy goods vehicle|tractor unit|pickup truck",
    bus:
        "bus|coach|minibus|transit bus|double[- ]decker"
};

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
 * WIKIDATA SUPPLEMENTAL CANDIDATES
 * ------------------------------------------------------------
 * Wikidata is used only to find additional vehicle/model candidates.
 * Technical information still comes from Wikipedia and all candidates
 * pass the same frontend quality checks before becoming Popular cards.
 */

async function fetchWikidataCached(
    url
) {

    const cache =
        caches.default;

    const cacheKey =
        new Request(
            "https://worth-it-internal-cache.local/wikidata/" +
            url
        );

    const cached =
        await cache.match(cacheKey);

    if (cached) {
        try {
            return await cached.json();
        } catch {}
    }

    const response =
        await fetch(
            url,
            {
                headers: {
                    "Accept": "application/sparql-results+json",
                    "User-Agent":
                        "Worth It Cars/1.0 (https://worth-it-calculator.pages.dev/)"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            "Wikidata returned " + response.status
        );
    }

    const data = await response.json();

    try {
        await cache.put(
            cacheKey,
            new Response(
                JSON.stringify(data),
                {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "application/json; charset=UTF-8",
                        "Cache-Control":
                            "public, max-age=" + WIKIDATA_CACHE_TTL
                    }
                }
            )
        );
    } catch (error) {
        console.error("Wikidata cache write failed:", error);
    }

    return data;
}

function getWikidataWikipediaTitle(articleUrl) {

    const raw = String(articleUrl || "").trim();

    if (!raw) return null;

    const match = raw.match(/\/wiki\/([^#?]+)$/i);

    if (!match) return null;

    try {
        return decodeURIComponent(match[1]).replace(/_/g, " ");
    } catch {
        return match[1].replace(/_/g, " ");
    }
}

async function handleWikidataCandidates(
    requestUrl
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind) {
        return jsonResponse(
            {
                success: false,
                error: "Invalid vehicle kind",
                vehicles: []
            },
            400,
            60
        );
    }

    const classId =
        WIKIDATA_CLASS_BY_KIND[kind];

    if (!classId) {
        return jsonResponse({
            success: true,
            kind,
            source: "Wikidata",
            count: 0,
            vehicles: []
        });
    }

    const candidateLimit =
        kind === "car"
            ? WIKIDATA_CANDIDATE_LIMIT
            : WIKIDATA_NONCAR_CANDIDATE_LIMIT;

    const query =
        "SELECT ?item ?itemLabel ?manufacturerLabel ?article ?description WHERE {" +
        " ?item wdt:P31/wdt:P279* wd:" + classId + "." +
        " ?item wdt:P176 ?manufacturer." +
        " ?article schema:about ?item;" +
        " schema:isPartOf <https://en.wikipedia.org/>." +
        " OPTIONAL { ?item schema:description ?description." +
        " FILTER(LANG(?description)=\"en\") }" +
        " SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". }" +
        "} LIMIT " + candidateLimit;

    const url =
        new URL(WIKIDATA_SPARQL_API);

    url.searchParams.set("query", query);
    url.searchParams.set("format", "json");

    try {

        const data =
            await fetchWikidataCached(
                url.toString()
            );

        const bindings =
            Array.isArray(data?.results?.bindings)
                ? data.results.bindings
                : [];

        const seen = new Set();
        const vehicles = [];

        for (const binding of bindings) {

            const make =
                String(binding?.manufacturerLabel?.value || "").trim();
            const model =
                String(binding?.itemLabel?.value || "").trim();
            const wikipediaTitle =
                getWikidataWikipediaTitle(
                    binding?.article?.value
                );

            if (!make || !model || !wikipediaTitle) continue;

            const key =
                make.toLowerCase() + "|" + model.toLowerCase();

            if (seen.has(key)) continue;
            seen.add(key);

            vehicles.push({
                make,
                model,
                kind,
                sourceKind: kind,
                supplementalSource: "wikidata",
                wikipediaTitle,
                bodyType: null,
                bodyTypes: [],
                popularityRanks: [],
                globalDecile: 999,
                availability: [],
                yearStart: null,
                yearEnd: null
            });

            if (vehicles.length >= candidateLimit) {
                break;
            }
        }

        return jsonResponse(
            {
                success: true,
                kind,
                source: "Wikidata",
                count: vehicles.length,
                vehicles
            },
            200,
            WIKIDATA_CACHE_TTL
        );

    } catch (error) {

        console.error("Wikidata candidate lookup failed:", kind, error);

        return jsonResponse(
            {
                success: false,
                error: "Wikidata candidate lookup failed",
                vehicles: []
            },
            200,
            300
        );
    }
}


/*
 * ------------------------------------------------------------
 * DBPEDIA SUPPLEMENTAL CANDIDATES
 * ------------------------------------------------------------
 * DBpedia is used only as another candidate-discovery source.
 * Technical information remains Wikipedia-based and every candidate
 * is checked by the same frontend quality/category validation.
 */

async function fetchDbpediaCached(
    url
) {

    const cache =
        caches.default;

    const cacheKey =
        new Request(
            "https://worth-it-internal-cache.local/dbpedia/" +
            url
        );

    const cached =
        await cache.match(cacheKey);

    if (cached) {

        try {
            return await cached.json();
        } catch {}
    }

    const response =
        await fetch(
            url,
            {
                headers: {
                    "Accept":
                        "application/sparql-results+json",
                    "User-Agent":
                        "Worth It Cars/1.0 (https://worth-it-calculator.pages.dev/)"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            "DBpedia returned " + response.status
        );
    }

    const data =
        await response.json();

    try {
        await cache.put(
            cacheKey,
            new Response(
                JSON.stringify(data),
                {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "application/sparql-results+json; charset=UTF-8",
                        "Cache-Control":
                            "public, max-age=" +
                            DBPEDIA_CACHE_TTL
                    }
                }
            )
        );
    } catch (error) {
        console.error(
            "DBpedia cache write failed:",
            error
        );
    }

    return data;
}

function getDbpediaWikipediaTitle(resourceUrl) {

    const raw =
        String(resourceUrl || "").trim();

    const match =
        raw.match(
            /\/resource\/([^#?]+)$/i
        );

    if (!match) {
        return null;
    }

    try {
        return decodeURIComponent(
            match[1]
        )
            .replace(/_/g, " ")
            .trim();
    } catch {
        return match[1]
            .replace(/_/g, " ")
            .trim();
    }
}

function splitDbpediaVehicleTitle(title) {

    const cleanTitle =
        String(title || "")
            .replace(
                /\s+\((?:motorcycle|motorbike|scooter|moped|van|truck|lorry|bus|coach|vehicle)\)$/i,
                ""
            )
            .trim();

    const words =
        cleanTitle
            .split(/\s+/)
            .filter(Boolean);

    if (words.length < 2) {
        return {
            make: words[0] || "",
            model: ""
        };
    }

    const twoWordMakeHints = [
        "royal enfield",
        "land rover",
        "aston martin",
        "alfa romeo",
        "rolls royce",
        "harley davidson",
        "harley-davidson",
        "general motors",
        "tata motors",
        "ashok leyland",
        "daewoo motors",
        "freightliner trucks",
        "mercedes benz",
        "mercedes-benz"
    ];

    const normalizedTitle =
        cleanTitle
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const hintedMake =
        twoWordMakeHints.find(
            hint =>
                normalizedTitle === hint ||
                normalizedTitle.startsWith(
                    hint + " "
                )
        );

    const makeWordCount =
        hintedMake
            ? 2
            : 1;

    return {
        make:
            words.slice(
                0,
                makeWordCount
            ).join(" "),
        model:
            words
                .slice(makeWordCount)
                .join(" ")
    };
}

async function handleDbpediaCandidates(
    requestUrl
) {

    const kind =
        getRequestedKind(requestUrl);

    if (!kind || kind === "car") {

        return jsonResponse(
            {
                success: true,
                kind,
                source: "DBpedia",
                count: 0,
                vehicles: []
            },
            200,
            DBPEDIA_CACHE_TTL
        );
    }

    const textFilter =
        DBPEDIA_KIND_TEXT_FILTERS[kind];

    if (textFilter === undefined) {

        return jsonResponse(
            {
                success: false,
                error:
                    "DBpedia does not provide this vehicle kind",
                vehicles: []
            },
            400,
            60
        );
    }

    const typeClause =
        kind === "motorcycle"
            ? "?item a dbo:Motorcycle."
            : "?item a dbo:MeanOfTransportation.";

    const abstractFilter =
        textFilter
            ? " FILTER(REGEX(LCASE(STR(?abstract)), \"" +
              textFilter +
              "\"))"
            : "";

    const candidateLimit =
        kind === "car"
            ? DBPEDIA_CANDIDATE_LIMIT
            : DBPEDIA_NONCAR_CANDIDATE_LIMIT;

    const query =
        "SELECT ?item ?itemLabel ?manufacturerLabel WHERE {" +
        " " + typeClause +
        " ?item dbo:manufacturer ?manufacturer." +
        " ?item rdfs:label ?itemLabel." +
        " ?item dbo:abstract ?abstract." +
        " ?manufacturer rdfs:label ?manufacturerLabel." +
        " FILTER(LANG(?itemLabel)=\"en\")" +
        " FILTER(LANG(?abstract)=\"en\")" +
        " FILTER(LANG(?manufacturerLabel)=\"en\")" +
        abstractFilter +
        "} ORDER BY LCASE(STR(?itemLabel))" +
        " LIMIT " +
        candidateLimit;

    const url =
        new URL(DBPEDIA_SPARQL_API);

    url.searchParams.set("query", query);
    url.searchParams.set("format", "json");

    try {

        const data =
            await fetchDbpediaCached(
                url.toString()
            );

        const bindings =
            Array.isArray(data?.results?.bindings)
                ? data.results.bindings
                : [];

        const seen =
            new Set();

        const vehicles = [];

        for (const binding of bindings) {

            const wikipediaTitle =
                getDbpediaWikipediaTitle(
                    binding?.item?.value
                );

            if (!wikipediaTitle) {
                continue;
            }

            const splitTitle =
                splitDbpediaVehicleTitle(
                    wikipediaTitle
                );

            if (
                !splitTitle.make ||
                !splitTitle.model
            ) {
                continue;
            }

            const key =
                splitTitle.make.toLowerCase() +
                "|" +
                splitTitle.model.toLowerCase();

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            vehicles.push({
                make: splitTitle.make,
                model: splitTitle.model,
                kind,
                sourceKind: kind,
                supplementalSource: "dbpedia",
                wikipediaTitle,
                dbpediaManufacturer:
                    String(
                        binding?.manufacturerLabel?.value ||
                        ""
                    ).trim() || null,
                bodyType: null,
                bodyTypes: [],
                popularityRanks: [],
                globalDecile: 998,
                availability: [],
                yearStart: null,
                yearEnd: null
            });

            if (
                vehicles.length >=
                candidateLimit
            ) {
                break;
            }
        }

        return jsonResponse(
            {
                success: true,
                kind,
                source: "DBpedia",
                count: vehicles.length,
                vehicles
            },
            200,
            DBPEDIA_CACHE_TTL
        );

    } catch (error) {

        console.error(
            "DBpedia candidate lookup failed:",
            kind,
            error
        );

        return jsonResponse(
            {
                success: false,
                error:
                    "DBpedia candidate lookup failed",
                vehicles: []
            },
            200,
            300
        );
    }
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
    "engineDisplacement",
    "fuel",
    "fuelEconomy",
    "fuelTank",
    "transmission",
    "drivetrain",
    "horsepower",
    "torque",
    "weight",
    "payload",
    "cargoCapacity",
    "length",
    "width",
    "height",
    "wheelbase",
    "groundClearance",
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
    "engine displacement": "engineDisplacement",
    displacement: "engineDisplacement",
    "engine size": "engineDisplacement",
    "cylinder displacement": "engineDisplacement",
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

    "fuel economy": "fuelEconomy",
    "fuel consumption": "fuelEconomy",
    consumption: "fuelEconomy",
    economy: "fuelEconomy",
    mpg: "fuelEconomy",
    "mpg combined": "fuelEconomy",
    "fuel mileage": "fuelEconomy",

    "fuel tank": "fuelTank",
    "fuel tank capacity": "fuelTank",
    "tank capacity": "fuelTank",

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

    payload: "payload",
    "maximum payload": "payload",
    "max payload": "payload",
    "payload capacity": "payload",

    "cargo capacity": "cargoCapacity",
    "cargo volume": "cargoCapacity",
    "load volume": "cargoCapacity",
    "trunk volume": "cargoCapacity",
    "boot volume": "cargoCapacity",

    length: "length",
    width: "width",
    height: "height",
    wheelbase: "wheelbase",

    "ground clearance": "groundClearance",
    "ride height": "groundClearance",

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

const WIKIPEDIA_KIND_SEARCH_TERMS = {
    car: [
        "car", "automobile", "sedan", "hatchback", "coupe",
        "convertible", "wagon", "estate", "suv", "crossover",
        "mpv", "pickup"
    ],
    motorcycle: [
        "motorcycle", "motorbike", "scooter", "underbone",
        "two-wheeler"
    ],
    moped: [
        "moped", "scooter", "motorized bicycle",
        "motorised bicycle", "motor scooter"
    ],
    van: [
        "van", "minivan", "panel van", "cargo van",
        "microvan", "people carrier", "light commercial vehicle",
        "commercial vehicle", "multi-purpose vehicle", "mpv"
    ],
    truck: [
        "truck", "lorry", "pickup truck", "heavy truck",
        "heavy goods vehicle", "tractor unit"
    ],
    bus: [
        "bus", "coach", "transit bus", "city bus",
        "double-decker", "shuttle bus", "school bus",
        "minibus", "public transport", "passenger transport"
    ]
};

const WIKIPEDIA_KIND_CONTRADICTION_TERMS = {
    motorcycle: [
        "bus", "coach", "truck", "lorry", "van", "sedan",
        "hatchback", "coupe", "suv", "sport utility vehicle"
    ],
    moped: [
        "bus", "coach", "truck", "lorry", "van", "sedan",
        "hatchback", "coupe", "suv", "sport utility vehicle"
    ],
    van: [
        "bus", "coach", "truck", "lorry", "sedan", "hatchback",
        "coupe", "roadster", "suv", "sport utility vehicle",
        "crossover", "convertible", "wagon", "pickup",
        "motorcycle", "moped"
    ],
    truck: [
        "bus", "coach", "sedan", "hatchback", "coupe", "roadster",
        "suv", "sport utility vehicle", "motorcycle", "moped", "van"
    ],
    bus: [
        "truck", "lorry", "sedan", "hatchback", "coupe", "roadster",
        "suv", "sport utility vehicle", "motorcycle", "moped", "van"
    ],
    car: [
        "bus", "coach", "truck", "lorry", "motorcycle", "moped"
    ]
};

function normalizeWikipediaSearchText(
    value
) {

    return String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function wikipediaTextContainsTerm(
    text,
    term
) {

    const normalizedTerm =
        normalizeWikipediaSearchText(term);

    if (!normalizedTerm) {
        return false;
    }

    const escapedParts =
        normalizedTerm
            .split(/\s+/)
            .map(part =>
                part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            );

    return new RegExp(
        `(?:^|\\s)${escapedParts.join("\\s+")}(?=\\s|$)`,
        "i"
    ).test(
        String(text || "")
    );
}
function getWikipediaKindEvidenceScore(
    title,
    snippet,
    kind
) {

    const text =
        normalizeWikipediaSearchText(
            `${title || ""} ${snippet || ""}`
        );

    const terms =
        WIKIPEDIA_KIND_SEARCH_TERMS[kind] ||
        [];

    const contradictions =
        WIKIPEDIA_KIND_CONTRADICTION_TERMS[kind] ||
        [];

    let positive = 0;
    let negative = 0;

    for (const term of terms) {
        if (
            wikipediaTextContainsTerm(
                text,
                term
            )
        ) {
            positive++;
        }
    }

    for (const term of contradictions) {
        if (
            wikipediaTextContainsTerm(
                text,
                term
            )
        ) {
            negative++;
        }
    }

    return {
        positive,
        negative,
        score:
            positive * 45 -
            negative * 30
    };
}

function hasWikipediaKindEvidence(
    title,
    snippet,
    kind
) {

    if (
        !kind ||
        kind === "car"
    ) {
        return true;
    }

    const evidence =
        getWikipediaKindEvidenceScore(
            title,
            snippet,
            kind
        );

    return (
        evidence.positive > 0 &&
        evidence.score > 0
    );
}

/*
 * Wikipedia summaries for commercial vehicles and two-wheelers often
 * omit the exact category word from the short search snippet. Do not
 * reject a real make/model page solely for that reason.
 *
 * A category conflict becomes a hard rejection only when the page has
 * no positive evidence for the requested kind and contains multiple
 * explicit signals for another vehicle kind.
 */
function hasStrongWikipediaKindContradiction(
    title,
    snippet,
    kind
) {

    if (
        !kind ||
        kind === "car"
    ) {
        return false;
    }

    const text =
        normalizeWikipediaSearchText(
            `${title || ""} ${snippet || ""}`
        );

    const positiveTerms =
        WIKIPEDIA_KIND_SEARCH_TERMS[kind] ||
        [];

    const contradictionTerms =
        WIKIPEDIA_KIND_CONTRADICTION_TERMS[kind] ||
        [];

    const positiveCount =
        positiveTerms.filter(term =>
            wikipediaTextContainsTerm(
                text,
                term
            )
        ).length;

    const contradictionCount =
        contradictionTerms.filter(term =>
            wikipediaTextContainsTerm(
                text,
                term
            )
        ).length;

    const titleText =
        normalizeWikipediaSearchText(
            title || ""
        );

    const titleContradictionCount =
        contradictionTerms.filter(term =>
            wikipediaTextContainsTerm(
                titleText,
                term
            )
        ).length;

    /*
     * A single mention of another vehicle type in a descriptive article
     * is not enough to reject a valid page. Explicit vehicle-kind wording
     * in the title remains a hard signal, while body-text conflicts need
     * at least two independent terms.
     */
    return (
        positiveCount === 0 &&
        (
            titleContradictionCount >= 1 ||
            contradictionCount >= 2
        )
    );
}


async function resolveWikipediaTitleFromWikidata(
    make,
    model,
    kind
) {

    const classId =
        WIKIDATA_CLASS_BY_KIND[kind];

    if (
        !classId ||
        !make ||
        !model
    ) {
        return null;
    }

    const runQuery = async (
        labelFilter,
        manufacturerFilter
    ) => {

        const query =
            "SELECT ?article ?itemLabel ?manufacturerLabel WHERE {" +
            " ?item wdt:P31/wdt:P279* wd:" +
            classId +
            "." +
            " ?item wdt:P176 ?manufacturer." +
            " ?item rdfs:label ?itemLabel." +
            " ?manufacturer rdfs:label ?manufacturerLabel." +
            " ?article schema:about ?item;" +
            " schema:isPartOf <https://en.wikipedia.org/>." +
            " FILTER(LANG(?itemLabel)=\"en\")" +
            " FILTER(LANG(?manufacturerLabel)=\"en\")" +
            " FILTER(" +
            labelFilter +
            ")" +
            " FILTER(" +
            manufacturerFilter +
            ")" +
            "} LIMIT 8";

        const url =
            new URL(
                WIKIDATA_SPARQL_API
            );

        url.searchParams.set(
            "query",
            query
        );

        url.searchParams.set(
            "format",
            "json"
        );

        const data =
            await fetchWikidataCached(
                url.toString()
            );

        return Array.isArray(
            data?.results?.bindings
        )
            ? data.results.bindings
            : [];

    };

    try {

        const escapedModel =
            String(model)
                .replace(/\\/g, "\\\\")
                .replace(/"/g, "\\\"");

        const escapedMake =
            String(make)
                .replace(/\\/g, "\\\\")
                .replace(/"/g, "\\\"");

        /*
         * First try the exact Wikidata model + manufacturer labels.
         */
        let bindings =
            await runQuery(
                'LCASE(STR(?itemLabel)) = LCASE("' +
                    escapedModel +
                    '")',
                'LCASE(STR(?manufacturerLabel)) = LCASE("' +
                    escapedMake +
                    '")'
            );

        /*
         * Then allow the Wikidata item label to contain the requested
         * model and the manufacturer label to contain the make. This
         * handles catalog abbreviations such as "TGL" vs "MAN TGL"
         * while retaining the vehicle-class constraint and requiring an
         * English Wikipedia sitelink.
         */
        if (!bindings.length) {

            bindings =
                await runQuery(
                    'CONTAINS(LCASE(STR(?itemLabel)), LCASE("' +
                        escapedModel +
                        '"))',
                    'CONTAINS(LCASE(STR(?manufacturerLabel)), LCASE("' +
                        escapedMake +
                        '"))'
                );

        }

        const requestedModelKey =
            simplifyText(
                model
            );

        const requestedMakeKey =
            simplifyText(
                make
            );

        const candidates =
            bindings
                .map(binding => {

                    const title =
                        getWikidataWikipediaTitle(
                            binding?.article?.value
                        );

                    const itemLabel =
                        String(
                            binding?.itemLabel?.value ||
                            ""
                        ).trim();

                    const manufacturerLabel =
                        String(
                            binding?.manufacturerLabel?.value ||
                            ""
                        ).trim();

                    const itemKey =
                        simplifyText(
                            itemLabel
                        );

                    const manufacturerKey =
                        simplifyText(
                            manufacturerLabel
                        );

                    let score = 0;

                    if (
                        itemKey ===
                        requestedModelKey
                    ) {
                        score += 200;
                    }

                    if (
                        requestedModelKey &&
                        itemKey.includes(
                            requestedModelKey
                        )
                    ) {
                        score += 80;
                    }

                    if (
                        manufacturerKey ===
                        requestedMakeKey
                    ) {
                        score += 120;
                    }

                    if (
                        requestedMakeKey &&
                        manufacturerKey.includes(
                            requestedMakeKey
                        )
                    ) {
                        score += 50;
                    }

                    return {
                        title,
                        score
                    };

                })
                .filter(candidate =>
                    Boolean(candidate.title)
                )
                .sort(
                    (a, b) =>
                        b.score - a.score
                );

        return candidates[0]?.title || null;

    } catch (error) {

        console.warn(
            "Wikidata Wikipedia-title fallback failed:",
            make,
            model,
            kind,
            error
        );

        return null;

    }

}


function getVehicleWikipediaSearchVariants(
    make,
    model
) {

    const rawModel =
        String(model || "")
            .replace(/\s+/g, " ")
            .trim();

    const spacedCodeModel =
        rawModel
            .replace(/([A-Za-z])(?=\d)/g, "$1 ")
            .replace(/(\d)(?=[A-Za-z])/g, "$1 ")
            .replace(/\s+/g, " ")
            .trim();

    const variants = [
        `${make} ${rawModel}`.trim(),
        `${make} ${spacedCodeModel}`.trim(),
        `${rawModel} ${make}`.trim(),
        `${spacedCodeModel} ${make}`.trim()
    ];

    return Array.from(
        new Set(
            variants.filter(Boolean)
        )
    );
}

function getWikipediaVehicleIdentityScore(
    title,
    make,
    model
) {

    const titleKey =
        simplifyText(title);

    const makeKey =
        simplifyText(make);

    const modelKey =
        simplifyText(model);

    if (
        !titleKey ||
        !modelKey
    ) {
        return 0;
    }

    let score = 0;

    if (
        titleKey ===
        simplifyText(
            `${make} ${model}`
        )
    ) {
        score += 180;
    }

    if (
        titleKey.includes(
            modelKey
        )
    ) {
        score += 90;
    }

    if (
        makeKey &&
        titleKey.includes(
            makeKey
        )
    ) {
        score += 40;
    }

    const modelTokens =
        normalizeWikipediaSearchText(
            model
        )
            .split(/\s+/)
            .filter(token =>
                token.length >= 2
            );

    if (modelTokens.length) {

        const matchedTokens =
            modelTokens.filter(token =>
                wikipediaTextContainsTerm(
                    normalizeWikipediaSearchText(
                        title
                    ),
                    token
                )
            ).length;

        score += Math.round(
            70 *
            (
                matchedTokens /
                modelTokens.length
            )
        );
    }

    return score;
}

function isWikipediaVehicleTitlePlausible(
    title,
    make,
    model,
    kind,
    supportingText = ""
) {

    const identityScore =
        getWikipediaVehicleIdentityScore(
            title,
            make,
            model
        );

    if (
        identityScore >= 70
    ) {
        return !hasStrongWikipediaKindContradiction(
            title,
            supportingText,
            kind
        );
    }

    /*
     * Family/range articles are common for commercial vehicles. A valid
     * article may be titled "MAN TG-range" while its lead explicitly
     * identifies the requested TGL model. Accept this only when the
     * manufacturer is present in the title and the requested model is
     * represented in the supporting text.
     */
    const titleText =
        normalizeWikipediaSearchText(
            title || ""
        );

    const supporting =
        normalizeWikipediaSearchText(
            supportingText || ""
        );

    const makeText =
        normalizeWikipediaSearchText(
            make || ""
        );

    const modelTokens =
        normalizeWikipediaSearchText(
            model || ""
        )
            .split(/\s+/)
            .filter(token =>
                token.length >= 2
            );

    const makeInTitle =
        Boolean(
            makeText &&
            titleText.includes(
                makeText
            )
        );

    const modelMatches =
        modelTokens.filter(token =>
            wikipediaTextContainsTerm(
                supporting,
                token
            )
        ).length;

    const minimumModelMatches =
        modelTokens.length <= 1
            ? 1
            : Math.max(
                1,
                Math.ceil(
                    modelTokens.length * 0.5
                )
            );

    return (
        makeInTitle &&
        modelMatches >= minimumModelMatches &&
        !hasStrongWikipediaKindContradiction(
            title,
            supportingText,
            kind
        )
    );
}


async function searchWikipediaVehicle(
    make,
    model,
    kind
) {

    if (!make || !model) {
        return null;
    }

    const exactName =
        `${make} ${model}`.trim();

    const titleVariants =
        getVehicleWikipediaSearchVariants(
            make,
            model
        );

    const searches =
        Array.from(
            new Set(
                titleVariants.flatMap(
                    variant => [
                        `"${variant}" ${kind}`,
                        `"${variant}" vehicle`,
                        variant,
                        `${variant} ${kind}`
                    ]
                )
            )
        );

    const normalizedTarget =
        simplifyText(
            exactName
        );

    const normalizedMake =
        simplifyText(make);

    const normalizedModel =
        simplifyText(model);

    /*
     * FAST PATH: try the exact make + model title first.
     *
     * Most real VehiclesDB records map directly to an English Wikipedia
     * article. This avoids a separate Wikipedia search request and lets the
     * normal cached page lookup handle redirects/disambiguation.
     */
    try {

        const exactPage =
            await getWikipediaPage(
                exactName
            );

        if (
            exactPage?.title
        ) {

            const exactTitleKey =
                simplifyText(
                    exactPage.title
                );

            const hasMake =
                normalizedTarget.includes(
                    normalizedMake
                ) &&
                exactTitleKey.includes(
                    normalizedMake
                );

            const hasModel =
                normalizedTarget.includes(
                    normalizedModel
                ) &&
                exactTitleKey.includes(
                    normalizedModel
                );

            if (
                hasMake &&
                hasModel &&
                !hasStrongWikipediaKindContradiction(
                    exactPage.title,
                    exactPage.description,
                    kind
                )
            ) {

                return exactPage.title;

            }

        }

    } catch (error) {

        console.warn(
            "Wikipedia exact-title fast path failed:",
            exactName,
            error
        );

    }

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
                "8"
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

            const candidates =
                results
                    .map(result => {

                        const title =
                            String(
                                result?.title || ""
                            ).trim();

                        const snippet =
                            String(
                                result?.snippet || ""
                            );

                        const simplifiedTitle =
                            simplifyText(
                                title
                            );

                        let score = 0;

                        if (
                            simplifiedTitle ===
                            normalizedTarget
                        ) {
                            score += 180;
                        }

                        if (
                            normalizedTarget &&
                            simplifiedTitle.includes(
                                normalizedTarget
                            )
                        ) {
                            score += 90;
                        }

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
                            score += 55;
                        }

                        const kindEvidence =
                            getWikipediaKindEvidenceScore(
                                title,
                                snippet,
                                kind
                            );

                        score +=
                            kindEvidence.score;

                        if (
                            /\s+\(.*\)$/i.test(title)
                        ) {
                            score -= 20;
                        }

                        if (
                            kind !== "car" &&
                            hasStrongWikipediaKindContradiction(
                                title,
                                snippet,
                                kind
                            )
                        ) {
                            score -= 180;
                        }

                        return {
                            title,
                            snippet,
                            score,
                            kindEvidence
                        };
                    })
                    .sort(
                        (a, b) =>
                            b.score - a.score
                    );

            for (const candidate of candidates) {

                if (
                    !isWikipediaVehicleTitlePlausible(
                        candidate.title,
                        make,
                        model,
                        kind,
                        candidate.snippet
                    )
                ) {
                    continue;
                }

                if (
                    kind !== "car" &&
                    hasStrongWikipediaKindContradiction(
                        candidate.title,
                        candidate.snippet,
                        kind
                    )
                ) {
                    continue;
                }

                const hasFamilyModelEvidence =
                    candidate.kindEvidence &&
                    candidate.kindEvidence.positive > 0 &&
                    isWikipediaVehicleTitlePlausible(
                        candidate.title,
                        make,
                        model,
                        kind,
                        candidate.snippet
                    );

                if (
                    candidate.score >= 75 ||
                    (
                        hasFamilyModelEvidence &&
                        candidate.score >= 30
                    )
                ) {
                    return candidate.title;
                }
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

function normalizeVehicleImageMatchText(
    value
) {

    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function isVehicleImageUrlMatchingName(
    imageUrl,
    make,
    model
) {

    const urlValue =
        String(imageUrl || "").trim();

    const vehicleName =
        normalizeVehicleImageMatchText(
            `${make || ""} ${model || ""}`
        );

    if (
        !urlValue ||
        !vehicleName
    ) {
        return false;
    }

    let pathname = "";

    try {

        pathname =
            decodeURIComponent(
                new URL(urlValue).pathname
            );

    } catch {

        pathname =
            urlValue.split("?")[0];

    }

    const normalizedPath =
        normalizeVehicleImageMatchText(
            pathname
        );

    if (
        !normalizedPath
    ) {
        return false;
    }

    const escapedVehicleName =
        vehicleName.replace(
            /[.*+?^\${}()|[\]\\]/g,
            "\\$&"
        );

    const pattern =
        new RegExp(
            `(?:^|\\s)${escapedVehicleName}`,
            "i"
        );

    return pattern.test(
        normalizedPath
    );
}


function createCommercialWikimediaImageFromInfo(
    imageInfo,
    title,
    make,
    model,
    kind = "car",
    identityVerified = false,
    requireFilenameIdentity = false
) {

    if (!imageInfo?.url) {
        return null;
    }

    if (
        requireFilenameIdentity &&
        !isVehicleImageUrlMatchingName(
            imageInfo.url,
            make,
            model
        )
    ) {
        return null;
    }

    const license =
        getCommercialWikimediaLicense(
            imageInfo.extmetadata
        );

    if (!license) {
        return null;
    }

    const author =
        stripHtmlForMetadata(
            imageInfo.extmetadata?.Artist?.value ||
            imageInfo.extmetadata?.Credit?.value ||
            ""
        );

    return {
        url:
            imageInfo.thumburl ||
            imageInfo.url,
        source_url:
            imageInfo.descriptionurl ||
            ("https://commons.wikimedia.org/wiki/" +
                encodeURIComponent(
                    String(title || "").replace(/ /g, "_")
                )),
        author:
            author || null,
        license:
            license.name,
        license_url:
            license.url || null,
        identity_verified:
            Boolean(identityVerified),

        source_provider:
            "Wikimedia Commons"
    };
}

function isCommercialWikimediaSearchResultRelevant(
    title,
    imageInfo,
    make,
    model
) {

    const titleText =
        normalizeVehicleImageMatchText(
            title
        );

    const makeText =
        normalizeVehicleImageMatchText(
            make
        );

    const modelText =
        normalizeVehicleImageMatchText(
            model
        );

    if (
        !titleText ||
        !makeText ||
        !modelText
    ) {
        return false;
    }

    const hasExactFileName =
        isVehicleImageUrlMatchingName(
            imageInfo?.url,
            make,
            model
        );

    const hasIdentityInFileTitle =
        titleText.includes(makeText) &&
        titleText.includes(modelText);

    return (
        hasExactFileName ||
        hasIdentityInFileTitle
    );
}

async function searchCommercialWikimediaImage(
    make,
    model,
    kind = "car"
) {

    const searchText =
        (String(make || "") + " " + String(model || ""))
            .replace(/\s+/g, " ")
            .trim();

    if (!searchText) {
        return null;
    }

    try {

        const url =
            new URL(WIKIMEDIA_COMMONS_API);

        url.searchParams.set("action", "query");
        url.searchParams.set("generator", "search");
        url.searchParams.set("gsrsearch", "\"" + searchText + "\"");
        url.searchParams.set("gsrnamespace", "6");
        url.searchParams.set("gsrlimit", "12");
        url.searchParams.set("prop", "imageinfo");
        url.searchParams.set(
            "iiprop",
            "url|extmetadata"
        );
        url.searchParams.set(
            "iiextmetadatafilter",
            "License|LicenseShortName|UsageTerms|LicenseUrl|Artist|Credit"
        );
        url.searchParams.set("iiurlwidth", "1200");
        url.searchParams.set("format", "json");
        url.searchParams.set("formatversion", "2");

        const data =
            await fetchWikipediaCached(
                url.toString()
            );

        const pages =
            Array.isArray(data?.query?.pages)
                ? data.query.pages
                : Object.values(
                    data?.query?.pages || {}
                );

        for (const page of pages) {

            const title =
                String(
                    page?.title || ""
                ).trim();

            const imageInfo =
                Array.isArray(page?.imageinfo)
                    ? page.imageinfo[0]
                    : null;

            if (
                !title ||
                !imageInfo?.url ||
                !isCommercialWikimediaSearchResultRelevant(
                    title,
                    imageInfo,
                    make,
                    model
                )
            ) {
                continue;
            }

            const image =
                createCommercialWikimediaImageFromInfo(
                    imageInfo,
                    title,
                    make,
                    model,
                    kind,
                    true,
                    false
                );

            if (image?.url) {
                return image;
            }
        }

    } catch (error) {

        console.error(
            "Wikimedia Commons vehicle image search failed:",
            make,
            model,
            kind,
            error
        );

    }

    return null;
}


async function getCommercialWikimediaImage(
    imageTitle,
    make,
    model,
    kind = "car"
) {

    if (!imageTitle) {
        return null;
    }

    let title =
        String(imageTitle || "").trim();

    if (!title) {
        return null;
    }

    if (!/^file:/i.test(title)) {
        title = "File:" + title;
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

        /*
         * This is the lead image attached to the exact Wikipedia article
         * that already passed make/model/category checks. The Commons
         * filename itself does not need to repeat the vehicle name.
         */
        return createCommercialWikimediaImageFromInfo(
            imageInfo,
            title,
            make,
            model,
            kind,
            true,
            false
        );

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

        const parsedTechnicalTables =
            parseWikipediaTechnicalTables(html);

        /*
         * Family/model-line pages can contain generation sections. We still
         * parse their technical tables as a last-resort fallback when the
         * infobox itself yields no usable technical fields.
         */
        const tableSpecifications =
            generationSections.length
                ? createEmptyWikipediaSpecifications()
                : parsedTechnicalTables;

        const merged =
            mergeWikipediaSpecifications(
                wikitextSpecifications,
                htmlSpecifications
            );

        let finalSpecifications =
            mergeWikipediaSpecifications(
                merged,
                tableSpecifications
            );

        /*
         * Some family pages hide useful numbers in technical tables rather
         * than the infobox. Use those tables only when the normal result
         * still has no usable information.
         */
        if (
            generationSections.length &&
            !hasWikipediaVehicleInformation(
                finalSpecifications
            )
        ) {
            finalSpecifications =
                mergeWikipediaSpecifications(
                    finalSpecifications,
                    parsedTechnicalTables
                );
        }

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
        "bodyType",
        "production",
        "engine",
        "engineDisplacement",
        "fuel",
        "fuelEconomy",
        "fuelTank",
        "transmission",
        "drivetrain",
        "horsepower",
        "torque",
        "weight",
        "payload",
        "cargoCapacity",
        "length",
        "width",
        "height",
        "wheelbase",
        "groundClearance",
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


/*
 * ------------------------------------------------------------
 * SECONDARY PUBLIC VEHICLE SOURCES
 * ------------------------------------------------------------
 * FuelEconomy.gov:
 *   Official U.S. DOE/EPA public vehicle data for passenger cars.
 *
 * Openverse:
 *   Openly licensed image discovery fallback. Because Openverse
 *   aggregates third-party media, license metadata is independently
 *   filtered here before an image is accepted.
 * ------------------------------------------------------------
 */

async function fetchExternalJsonWithTimeout(
    url,
    timeoutMs = 2200
) {

    const controller =
        typeof AbortController !== "undefined"
            ? new AbortController()
            : null;

    const timer =
        setTimeout(
            () => {
                try {
                    controller?.abort();
                } catch {}
            },
            timeoutMs
        );

    try {

        const response =
            await fetch(
                url,
                {
                    headers: {
                        "Accept":
                            "application/json"
                    },
                    ...(controller
                        ? {
                            signal:
                                controller.signal
                        }
                        : {})
                }
            );

        if (!response.ok) {

            throw new Error(
                "External source returned HTTP " +
                response.status
            );
        }

        return await response.json();

    } finally {

        clearTimeout(
            timer
        );

    }

}

function normalizeExternalMenuItems(
    data
) {

    const raw =
        Array.isArray(data?.menuItem)
            ? data.menuItem
            : (
                data?.menuItem
                    ? [data.menuItem]
                    : []
            );

    return raw
        .map(item => ({
            text:
                String(
                    item?.text ||
                    item?.name ||
                    ""
                ).trim(),
            value:
                String(
                    item?.value ||
                    item?.id ||
                    ""
                ).trim()
        }))
        .filter(item =>
            item.text &&
            item.value
        );

}

function chooseFuelEconomyModel(
    menuItems,
    requestedModel
) {

    const target =
        simplifyText(
            requestedModel
        );

    if (!target) {
        return null;
    }

    const targetTokens =
        normalizeWikipediaSearchText(
            requestedModel
        )
            .split(/\s+/)
            .filter(Boolean);

    const candidates =
        menuItems
            .map(item => {

                const key =
                    simplifyText(
                        item.text
                    );

                let score = 0;

                if (
                    key === target
                ) {
                    score += 250;
                }

                if (
                    key.includes(target) ||
                    target.includes(key)
                ) {
                    score += 100;
                }

                score +=
                    targetTokens.filter(token =>
                        key.includes(
                            simplifyText(token)
                        )
                    ).length * 20;

                return {
                    ...item,
                    score
                };

            })
            .sort(
                (a, b) =>
                    b.score - a.score
            );

    return (
        candidates[0] &&
        candidates[0].score >= 90
    )
        ? candidates[0]
        : null;

}

function normalizeFuelEconomyVehicle(
    data,
    make,
    model,
    year
) {

    if (!data || typeof data !== "object") {
        return null;
    }

    const returnedMake =
        String(
            data.make ||
            data.makeDisplay ||
            ""
        ).trim();

    const returnedModel =
        String(
            data.model ||
            data.modelName ||
            ""
        ).trim();

    const requestedMakeKey =
        simplifyText(make);

    const requestedModelKey =
        simplifyText(model);

    const returnedMakeKey =
        simplifyText(returnedMake);

    const returnedModelKey =
        simplifyText(returnedModel);

    if (
        !returnedModelKey ||
        !requestedModelKey ||
        (
            !returnedModelKey.includes(
                requestedModelKey
            ) &&
            !requestedModelKey.includes(
                returnedModelKey
            )
        )
    ) {
        return null;
    }

    if (
        requestedMakeKey &&
        returnedMakeKey &&
        !returnedMakeKey.includes(
            requestedMakeKey
        ) &&
        !requestedMakeKey.includes(
            returnedMakeKey
        )
    ) {
        return null;
    }

    const toNumber =
        value => {

            const number =
                Number(value);

            return Number.isFinite(number)
                ? number
                : null;

        };

    const result = {
        source:
            "FuelEconomy.gov / U.S. DOE + EPA",

        year:
            toNumber(
                data.year
            ) ??
            toNumber(
                year
            ),

        make:
            returnedMake ||
            make,

        model:
            returnedModel ||
            model,

        fuelType:
            String(
                data.fuelType ||
                data.fuelType1 ||
                ""
            ).trim() ||
            null,

        cityMpg:
            toNumber(
                data.city08
            ),

        highwayMpg:
            toNumber(
                data.highway08
            ),

        combinedMpg:
            toNumber(
                data.comb08 ??
                data.combined08
            ),

        annualFuelCost:
            toNumber(
                data.annualFuelCost
            ),

        co2TailpipeGpm:
            toNumber(
                data.co2TailpipeGpm ??
                data.co2Tailpipe
            ),

        rangeMiles:
            toNumber(
                data.range ??
                data.rangeA
            ),

        vehicleId:
            toNumber(
                data.id ??
                data.vehicleId
            )
    };

    if (
        result.fuelType ||
        result.cityMpg !== null ||
        result.highwayMpg !== null ||
        result.combinedMpg !== null ||
        result.annualFuelCost !== null ||
        result.co2TailpipeGpm !== null ||
        result.rangeMiles !== null
    ) {
        return result;
    }

    return null;

}

async function getFuelEconomyVehicle(
    make,
    model,
    year
) {

    const requestedYear =
        Math.trunc(
            Number(year)
        );

    if (
        !make ||
        !model ||
        !Number.isFinite(requestedYear) ||
        requestedYear < 1984
    ) {
        return null;
    }

    try {

        /*
         * Resolve the model through the official EPA menu first.
         * The options endpoint expects the exact menu model name,
         * e.g. "Civic 4Dr" rather than the generic "Civic".
         */
        const modelMenuUrl =
            "https://www.fueleconomy.gov/ws/rest/vehicle/menu/model" +
            "?year=" +
            encodeURIComponent(
                String(requestedYear)
            ) +
            "&make=" +
            encodeURIComponent(
                String(make)
            ) +
            "&format=json";

        const modelMenu =
            await fetchExternalJsonWithTimeout(
                modelMenuUrl,
                1400
            );

        const modelItems =
            normalizeExternalMenuItems(
                modelMenu
            );

        const modelMatch =
            chooseFuelEconomyModel(
                modelItems,
                model
            );

        if (!modelMatch) {
            return null;
        }

        const optionsUrl =
            "https://www.fueleconomy.gov/ws/rest/vehicle/menu/options" +
            "?year=" +
            encodeURIComponent(
                String(requestedYear)
            ) +
            "&make=" +
            encodeURIComponent(
                String(make)
            ) +
            "&model=" +
            encodeURIComponent(
                String(modelMatch.text)
            ) +
            "&format=json";

        const optionsData =
            await fetchExternalJsonWithTimeout(
                optionsUrl,
                1400
            );

        const options =
            normalizeExternalMenuItems(
                optionsData
            );

        const option =
            options.find(
                item =>
                    /^\d+$/.test(
                        item.value
                    )
            );

        if (!option) {
            return null;
        }

        const vehicleUrl =
            "https://www.fueleconomy.gov/ws/rest/vehicle/" +
            encodeURIComponent(
                option.value
            ) +
            "?format=json";

        const vehicleData =
            await fetchExternalJsonWithTimeout(
                vehicleUrl,
                1600
            );

        return normalizeFuelEconomyVehicle(
            vehicleData,
            make,
            model,
            requestedYear
        );

    } catch (error) {

        console.warn(
            "FuelEconomy.gov lookup failed:",
            make,
            model,
            year,
            error
        );

        return null;

    }

}

function chooseFuelEconomyYear(
    vehicle
) {

    const currentYear =
        new Date().getUTCFullYear();

    const years =
        [
            vehicle?.yearEnd,
            vehicle?.yearStart,
            currentYear
        ]
            .map(value =>
                Number(value)
            )
            .filter(value =>
                Number.isFinite(value) &&
                value >= 1984 &&
                value <= currentYear
            );

    return years.length
        ? Math.trunc(
            years[0]
        )
        : null;

}

function isOpenverseCommercialLicense(
    result
) {

    const license =
        String(
            result?.license ||
            ""
        )
            .trim()
            .toLowerCase();

    const licenseUrl =
        String(
            result?.license_url ||
            ""
        )
            .trim()
            .toLowerCase();

    if (
        /\b(?:nc|non[- ]?commercial)\b/i.test(
            license
        ) ||
        /(?:by[- ]?nc|non[- ]?commercial)/i.test(
            licenseUrl
        )
    ) {
        return false;
    }

    if (
        /\b(?:nd|no[- ]?derivatives)\b/i.test(
            license
        ) ||
        /(?:by[- ]?nd)/i.test(
            licenseUrl
        )
    ) {
        return false;
    }

    if (
        /^(?:cc0|zero|pd|pdm|public[- ]?domain)$/i.test(
            license
        )
    ) {
        return true;
    }

    if (
        /^cc[- ]?by(?:[- ]?4\.0|[- ]?3\.0|)?$/i.test(
            license
        ) ||
        /^cc[- ]?by[- ]?sa(?:[- ]?4\.0|[- ]?3\.0|)?$/i.test(
            license
        )
    ) {
        return true;
    }

    return (
        /creativecommons\.org\/publicdomain/i.test(
            licenseUrl
        ) ||
        /creativecommons\.org\/licenses\/by(?:\/|$)/i.test(
            licenseUrl
        ) ||
        /creativecommons\.org\/licenses\/by-sa(?:\/|$)/i.test(
            licenseUrl
        )
    );

}

function getOpenverseIdentityScore(
    result,
    make,
    model
) {

    const title =
        String(
            result?.title ||
            ""
        );

    const tags =
        Array.isArray(result?.tags)
            ? result.tags
                .map(tag =>
                    typeof tag === "string"
                        ? tag
                        : tag?.name
                )
                .filter(Boolean)
                .join(" ")
            : "";

    const haystack =
        simplifyText(
            title +
            " " +
            tags
        );

    const makeKey =
        simplifyText(
            make
        );

    const modelKey =
        simplifyText(
            model
        );

    if (
        !makeKey ||
        !modelKey ||
        !haystack
    ) {
        return 0;
    }

    let score = 0;

    if (
        haystack.includes(
            makeKey
        )
    ) {
        score += 80;
    }

    if (
        haystack.includes(
            modelKey
        )
    ) {
        score += 120;
    }

    if (
        haystack.includes(
            makeKey +
            modelKey
        )
    ) {
        score += 80;
    }

    return score;

}

async function searchOpenverseVehicleImage(
    make,
    model,
    kind
) {

    const query =
        (
            String(make || "") +
            " " +
            String(model || "")
        )
            .replace(/\s+/g, " ")
            .trim();

    if (!query) {
        return null;
    }

    try {

        const url =
            new URL(
                "https://api.openverse.org/v1/images/"
            );

        url.searchParams.set(
            "q",
            query
        );

        url.searchParams.set(
            "page_size",
            "12"
        );

        url.searchParams.set(
            "mature",
            "false"
        );

        const data =
            await fetchExternalJsonWithTimeout(
                url.toString(),
                2200
            );

        const candidates =
            (
                Array.isArray(
                    data?.results
                )
                    ? data.results
                    : []
            )
                .map(result => ({
                    result,
                    score:
                        getOpenverseIdentityScore(
                            result,
                            make,
                            model
                        )
                }))
                .filter(item =>
                    item.score >= 200 &&
                    isOpenverseCommercialLicense(
                        item.result
                    )
                )
                .sort(
                    (a, b) =>
                        b.score - a.score
                );

        for (
            const item of candidates
        ) {

            const result =
                item.result;

            /*
             * Openverse exposes url as the media URL and thumbnail as a
             * thumbnail representation. Prefer the source media URL.
             */
            const imageUrl =
                String(
                    result?.url ||
                    result?.thumbnail ||
                    ""
                ).trim();

            if (!imageUrl) {
                continue;
            }

            return {
                url:
                    imageUrl,

                source_url:
                    result?.foreign_landing_url ||
                    result?.landing_url ||
                    result?.detail_url ||
                    "https://openverse.org/",

                author:
                    String(
                        result?.creator ||
                        ""
                    ).trim() ||
                    null,

                license:
                    String(
                        result?.license ||
                        "Open license"
                    ).trim(),

                license_url:
                    String(
                        result?.license_url ||
                        ""
                    ).trim() ||
                    null,

                identity_verified:
                    true,

                source_provider:
                    "Openverse",

                source_kind:
                    kind || null
            };

        }

    } catch (error) {

        console.warn(
            "Openverse vehicle image lookup failed:",
            make,
            model,
            kind,
            error
        );

    }

    return null;

}


function createCatalogFallbackSpecifications(
    vehicle
) {

    const specifications =
        createEmptyWikipediaSpecifications();

    const bodyTypes =
        Array.isArray(vehicle?.bodyTypes)
            ? vehicle.bodyTypes
                .map(value => String(value || "").trim())
                .filter(Boolean)
            : [];

    const bodyType =
        String(
            vehicle?.bodyType ||
            bodyTypes[0] ||
            ""
        ).trim();

    if (bodyType) {
        specifications.bodyType = bodyType;
    }

    const yearStart =
        String(vehicle?.yearStart || "").trim();
    const yearEnd =
        String(vehicle?.yearEnd || "").trim();

    if (yearStart && yearEnd) {
        specifications.production =
            yearStart === yearEnd
                ? yearStart
                : yearStart + "–" + yearEnd;
    } else if (yearStart) {
        specifications.production =
            yearStart + "–present";
    } else if (yearEnd) {
        specifications.production =
            "through " + yearEnd;
    }

    return specifications;
}

function mergeCatalogFallbackSpecifications(
    specifications,
    vehicle
) {

    const merged = {
        ...createEmptyWikipediaSpecifications(),
        ...(specifications || {})
    };

    const fallback =
        createCatalogFallbackSpecifications(
            vehicle
        );

    for (const field of ["bodyType", "production"]) {
        if (
            !isUsefulWikipediaValue(merged[field]) &&
            isUsefulWikipediaValue(fallback[field])
        ) {
            merged[field] = fallback[field];
        }
    }

    return merged;
}

function createWikipediaNoInformation(
    make,
    model,
    kind,
    image = null,
    informationSource = "Wikipedia"
) {

    return {
        success: true,
        source: {
            catalog: "VehiclesDB Open Dataset",
            information: informationSource
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

        image,

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

    /*
     * 1. Resolve Wikipedia.
     *
     * Wikidata supplemental candidates already include an exact English
     * Wikipedia sitelink, so use it directly when available. VehiclesDB
     * candidates continue through the normal fast Wikipedia resolver.
     */
    let wikipediaTitle =
        String(
            requestUrl.searchParams.get("wikipedia_title") ||
            ""
        ).trim() ||
        null;

    if (!wikipediaTitle) {

        try {

            wikipediaTitle =
                await searchWikipediaVehicle(
                    vehicle.make,
                    vehicle.model,
                    kind
                );

            if (!wikipediaTitle) {
                wikipediaTitle =
                    await resolveWikipediaTitleFromWikidata(
                        vehicle.make,
                        vehicle.model,
                        kind
                    );
            }

        } catch (error) {

            console.error(
                "Wikipedia vehicle search failed:",
                error
            );
        }

    }

    if (!wikipediaTitle) {

        let fallbackImage = null;

        if (
            requestUrl.searchParams.get("image_only") === "1" ||
            requestUrl.searchParams.get("fast") !== "1"
        ) {
            try {
                fallbackImage =
                    await searchCommercialWikimediaImage(
                        vehicle.make,
                        vehicle.model,
                        vehicle.kind
                    );

                if (!fallbackImage) {
                    fallbackImage =
                        await searchOpenverseVehicleImage(
                            vehicle.make,
                            vehicle.model,
                            vehicle.kind
                        );
                }
            } catch (error) {
                console.error(
                    "Fallback Commons image lookup failed:",
                    vehicle.make,
                    vehicle.model,
                    vehicle.kind,
                    error
                );
            }
        }

        return jsonResponse(
            createWikipediaNoInformation(
                vehicle.make,
                vehicle.model,
                kind,
                fallbackImage,
                fallbackImage
                    ? "Wikimedia Commons"
                    : "Wikipedia"
            ),
            200,
            NEGATIVE_WIKIPEDIA_CACHE_TTL
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

        let fallbackImage = null;

        if (
            requestUrl.searchParams.get("image_only") === "1" ||
            requestUrl.searchParams.get("fast") !== "1"
        ) {
            try {
                fallbackImage =
                    await searchCommercialWikimediaImage(
                        vehicle.make,
                        vehicle.model,
                        vehicle.kind
                    );

                if (!fallbackImage) {
                    fallbackImage =
                        await searchOpenverseVehicleImage(
                            vehicle.make,
                            vehicle.model,
                            vehicle.kind
                        );
                }
            } catch (error) {
                console.error(
                    "Fallback Commons image lookup after page failure failed:",
                    vehicle.make,
                    vehicle.model,
                    vehicle.kind,
                    error
                );
            }
        }

        return jsonResponse(
            createWikipediaNoInformation(
                vehicle.make,
                vehicle.model,
                kind,
                fallbackImage,
                fallbackImage
                    ? "Wikimedia Commons"
                    : "Wikipedia"
            ),
            200,
            NEGATIVE_WIKIPEDIA_CACHE_TTL
        );
    }

    /*
     * Reject redirects/search results that ended on a different model.
     * A family-level page is acceptable when the requested model is
     * visibly represented in the page title; unrelated redirects are not.
     */
    if (
        !isWikipediaVehicleTitlePlausible(
            page.title,
            vehicle.make,
            vehicle.model,
            kind,
            page.description
        )
    ) {

        let fallbackImage = null;

        if (
            requestUrl.searchParams.get("image_only") === "1" ||
            requestUrl.searchParams.get("fast") !== "1"
        ) {
            try {
                fallbackImage =
                    await searchCommercialWikimediaImage(
                        vehicle.make,
                        vehicle.model,
                        vehicle.kind
                    );

                if (!fallbackImage) {
                    fallbackImage =
                        await searchOpenverseVehicleImage(
                            vehicle.make,
                            vehicle.model,
                            vehicle.kind
                        );
                }
            } catch (error) {
                console.error(
                    "Fallback Commons image lookup after identity rejection failed:",
                    vehicle.make,
                    vehicle.model,
                    vehicle.kind,
                    error
                );
            }
        }

        return jsonResponse(
            createWikipediaNoInformation(
                vehicle.make,
                vehicle.model,
                kind,
                fallbackImage,
                fallbackImage
                    ? "Wikimedia Commons"
                    : "Wikipedia"
            ),
            200,
            NEGATIVE_WIKIPEDIA_CACHE_TTL
        );
    }

    /*
     * The Wikipedia search is already type-aware. Keep the same guard
     * at the detail stage so a cached/redirected page from another
     * vehicle kind can never be presented as the requested type.
     */
    /*
     * Do not reject a real vehicle article just because the short
     * Wikipedia summary does not contain a category keyword. The
     * VehiclesDB catalog already selected the vehicle kind; technical
     * data + make/model identity are validated by the frontend.
     *
     * Only an obvious strong category contradiction is rejected here.
     */
    if (
        kind !== "car" &&
        (
            hasStrongWikipediaKindContradiction(
                page.title,
                page.description,
                kind
            ) ||
            (
                kind === "bus" &&
                /(?:light commercial vehicle|\bvan\b|\bpanel van\b|\bcargo van\b|\bminivan\b|\btruck\b|\blorry\b|\bpickup\b|\bmotorcycle\b|\bmoped\b)/i.test(
                    String(page.description || "")
                ) &&
                !/(?:\bbus\b|\bcoach\b|minibus|transit bus|city bus|double-decker|shuttle bus|school bus)/i.test(
                    String(page.description || "")
                )
            )
        )
    ) {

        return jsonResponse(
            createWikipediaNoInformation(
                vehicle.make,
                vehicle.model,
                kind
            ),
            200,
            NEGATIVE_WIKIPEDIA_CACHE_TTL
        );
    }

    /*
     * Fast quality mode is used only by the Popular Vehicles candidate
     * scanner for non-car categories. It needs a reliable Wikipedia
     * identity/description but does not need the full infobox parser or
     * Wikimedia license lookup before a card can qualify.
     *
     * The normal details endpoint remains unchanged for vehicle cards,
     * comparison and detail views.
     */

    /*
     * Lightweight image mode for category cards. The browser only needs
     * the commercial Wikimedia image at this stage; parsing Wikipedia's
     * full infobox and generation/specification tables would unnecessarily
     * delay the image. Full technical details remain on the normal path.
     */
    if (
        requestUrl.searchParams.get("image_only") === "1"
    ) {

        let image = null;

        try {
            image = await getCommercialWikimediaImage(
                page.imageTitle,
                vehicle.make,
                vehicle.model,
                vehicle.kind
            );

            if (!image) {
                image =
                    await searchCommercialWikimediaImage(
                        vehicle.make,
                        vehicle.model,
                        vehicle.kind
                    );
            }

            if (!image) {
                image =
                    await searchOpenverseVehicleImage(
                        vehicle.make,
                        vehicle.model,
                        vehicle.kind
                    );
            }
        } catch (error) {
            console.error(
                "Lightweight vehicle image lookup failed:",
                vehicle.make,
                vehicle.model,
                error
            );
        }

        return jsonResponse(
            {
                success: true,
                source: {
                    catalog: "VehiclesDB Open Dataset",
                    information: "Wikimedia Commons"
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
                    description: page.description || "No Information"
                },
                image,
                external: {
                    fuelEconomy: null
                },
                specifications: createEmptyWikipediaSpecifications(),
                comparisonAvailable: false
            },
            200,
            WIKIPEDIA_CACHE_TTL
        );
    }

    if (
        requestUrl.searchParams.get("fast") === "1"
    ) {

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
                image: null,
                external: {
                    fuelEconomy: null
                },
                specifications:
                    createEmptyWikipediaSpecifications(),
                comparisonAvailable: false
            },
            200,
            WIKIPEDIA_CACHE_TTL
        );

    }


    /*
     * 4. Load technical Wikipedia data and the Wikimedia image/license
     *    check in parallel. The two operations are independent.
     */
    const wikipediaDataPromise =
        getWikipediaInfoboxData(
            page.title,
            {
                make: vehicle.make,
                model: vehicle.model,
                kind
            }
        );

    const fuelEconomyYear =
        chooseFuelEconomyYear(
            vehicle
        );

    const fuelEconomyPromise =
        kind === "car" &&
        fuelEconomyYear
            ? Promise.race([
                getFuelEconomyVehicle(
                    vehicle.make,
                    vehicle.model,
                    fuelEconomyYear
                ),
                new Promise(
                    resolve =>
                        setTimeout(
                            () => resolve(null),
                            1800
                        )
                )
            ])
            : Promise.resolve(null);

    const commercialImagePromise =
        (async () => {

            const directImage =
                await getCommercialWikimediaImage(
                    page.imageTitle,
                    vehicle.make,
                    vehicle.model,
                    vehicle.kind
                );

            if (directImage) {
                return directImage;
            }

            const wikimediaImage =
                await searchCommercialWikimediaImage(
                    vehicle.make,
                    vehicle.model,
                    vehicle.kind
                );

            if (wikimediaImage) {
                return wikimediaImage;
            }

            return await searchOpenverseVehicleImage(
                vehicle.make,
                vehicle.model,
                vehicle.kind
            );

        })().catch(
            error => {

                console.error(
                    "Commercial Wikimedia image check failed:",
                    page.title,
                    error
                );

                return null;

            }
        );

    /*
     * Image/license validation is deliberately secondary to the vehicle
     * information itself. Do not make Wikipedia specifications wait on a
     * slow Wikimedia Commons request. A fast Commons response is still
     * included; otherwise the vehicle can render with an image placeholder
     * and the technical data can still qualify it for Popular.
     */
    const imageLookupTimeoutMs =
        kind === "motorcycle" ||
        kind === "van" ||
        kind === "truck"
            ? 5000
            : WIKIMEDIA_IMAGE_LOOKUP_TIMEOUT_MS;

    const commercialImageWithTimeout =
        Promise.race([
            commercialImagePromise,
            new Promise(
                resolve =>
                    setTimeout(
                        () => resolve(null),
                        imageLookupTimeoutMs
                    )
            )
        ]);

    const [
        wikipediaData,
        initialCommercialImage,
        fuelEconomy
    ] = await Promise.all([
        wikipediaDataPromise,
        commercialImageWithTimeout,
        fuelEconomyPromise
    ]);

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


    /*
     * A source/catalog can occasionally mislabel a vehicle class.
     * Wikipedia body-style information is authoritative enough to
     * stop obvious cross-category leaks such as a truck shown as a bus.
     */
    if (kind !== "car") {

        const bodyTypeText =
            normalizeWikipediaSearchText(
                specifications?.bodyType || ""
            );

        const kindBodyTypeContradictions = {
            motorcycle: [
                "car", "sedan", "hatchback", "coupe", "suv",
                "sport utility", "van", "truck", "bus"
            ],
            van: [
                "suv", "sport utility", "crossover", "sedan",
                "hatchback", "coupe", "roadster", "convertible",
                "wagon", "pickup", "motorcycle", "moped",
                "truck", "bus"
            ],
            truck: [
                "suv", "sport utility", "sedan", "hatchback",
                "coupe", "roadster", "convertible", "wagon",
                "motorcycle", "moped", "bus", "van"
            ],
            bus: [
                "suv", "sport utility", "sedan", "hatchback",
                "coupe", "roadster", "convertible", "wagon",
                "motorcycle", "moped", "truck", "van"
            ]
        };

        const kindBodyTypeExpected = {
            motorcycle: [
                "motorcycle", "motorbike", "scooter",
                "underbone", "moped", "two-wheeler"
            ],
            van: [
                "van", "minivan", "panel van", "cargo van",
                "microvan", "people carrier",
                "light commercial vehicle", "mpv"
            ],
            truck: [
                "truck", "lorry", "pickup truck",
                "heavy truck", "tractor unit"
            ],
            bus: [
                "bus", "coach", "minibus",
                "transit bus", "city bus",
                "double-decker", "shuttle bus"
            ]
        };

        const contradictions =
            kindBodyTypeContradictions[kind] ||
            [];

        const expected =
            kindBodyTypeExpected[kind] ||
            [];

        const hasExpectedKind =
            expected.some(
                term =>
                    bodyTypeText.includes(
                        normalizeWikipediaSearchText(term)
                    )
            );

        const hasContradictoryKind =
            contradictions.some(
                term =>
                    bodyTypeText.includes(
                        normalizeWikipediaSearchText(term)
                    )
            );

        /*
         * A body-style field can legitimately contain several forms,
         * such as "van / minibus". Accept it when the requested kind
         * is explicitly present. Only reject an exclusive contradiction.
         */
        if (
            bodyTypeText &&
            !hasExpectedKind &&
            hasContradictoryKind
        ) {

            return jsonResponse(
                createWikipediaNoInformation(
                    vehicle.make,
                    vehicle.model,
                    kind
                ),
                200,
                NEGATIVE_WIKIPEDIA_CACHE_TTL
            );
        }
    }

    /*
     * Retain authoritative VehiclesDB body type and production range when
     * Wikipedia does not expose structured values for them.
     */
    specifications =
        mergeCatalogFallbackSpecifications(
            specifications,
            vehicle
        );

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
     * A missing/disallowed image never removes a vehicle with useful
     * Wikipedia technical information from Popular.
     */
    const commercialImage =
        initialCommercialImage;

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

            external: {
                fuelEconomy
            },

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

    recordAdminApiUsage(context, {
        apiKey: "cars",
        provider: "VehiclesDB + Wikidata + DBpedia + Wikipedia + Wikimedia Commons"
    });

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

            case "wikidata":
                return handleWikidataCandidates(
                    requestUrl
                );

            case "dbpedia":
                return handleDbpediaCandidates(
                    requestUrl
                );

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
                            "details",
                            "wikidata",
                            "dbpedia"
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