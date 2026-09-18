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
 * WIKIPEDIA VEHICLE DETAILS
 *
 * Wikipedia is the only supplemental vehicle information
 * source used by the Cars section.
 *
 * VehiclesDB remains the vehicle catalog source.
 *
 * Wikipedia API is accessed server-side through Cloudflare.
 * Results are cached at the Cloudflare edge.
 * ============================================================
 */

const WIKIPEDIA_API =
    "https://en.wikipedia.org/w/api.php";

const WIKIPEDIA_CACHE_TTL =
    604800; // 7 days


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
        new Request(
            url
        );

    /*
     * Check Cloudflare edge cache first.
     */

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


    /*
     * Request Wikipedia.
     */

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


    /*
     * Store successful response
     * at the Cloudflare edge.
     */

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

function normalizeWikipediaText(
    value
) {

    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();

}


function normalizeWikipediaLabel(
    value
) {

    return normalizeWikipediaText(
        value
    )
        .toLowerCase()
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

    for (
        const field of WIKIPEDIA_SPEC_FIELDS
    ) {

        specifications[field] =
            "No Information";

    }

    return specifications;

}


/*
 * ------------------------------------------------------------
 * Map Wikipedia infobox labels to our fields
 * ------------------------------------------------------------
 */

function getWikipediaSpecificationField(
    label
) {

    const normalized =
        normalizeWikipediaLabel(
            label
        );


    const mappings = {

        "production":
            "production",

        "years":
            "production",

        "model years":
            "production",

        "production years":
            "production",

        "generation":
            "generation",

        "generations":
            "generation",

        "body style":
            "bodyType",

        "body styles":
            "bodyType",

        "body type":
            "bodyType",

        "body types":
            "bodyType",

        "engine":
            "engine",

        "engines":
            "engine",

        "motor":
            "engine",

        "motors":
            "engine",

        "fuel":
            "fuel",

        "fuel type":
            "fuel",

        "fuel types":
            "fuel",

        "fuel system":
            "fuel",

        "transmission":
            "transmission",

        "transmissions":
            "transmission",

        "gearbox":
            "transmission",

        "gearboxes":
            "transmission",

        "drivetrain":
            "drivetrain",

        "drive train":
            "drivetrain",

        "drive type":
            "drivetrain",

        "drive":
            "drivetrain",

        "power":
            "horsepower",

        "power output":
            "horsepower",

        "engine power":
            "horsepower",

        "motor power":
            "horsepower",

        "horsepower":
            "horsepower",

        "hp":
            "horsepower",

        "torque":
            "torque",

        "curb weight":
            "weight",

        "kerb weight":
            "weight",

        "curbweight":
            "weight",

        "weight":
            "weight",

        "mass":
            "weight",

        "length":
            "length",

        "width":
            "width",

        "height":
            "height",

        "wheelbase":
            "wheelbase",

        "top speed":
            "topSpeed",

        "maximum speed":
            "topSpeed",

        "battery":
            "battery",

        "battery capacity":
            "battery",

        "electric range":
            "electricRange",

        "range":
            "electricRange",

        "seating":
            "seating",

        "seats":
            "seating",

        "seating capacity":
            "seating",

        "doors":
            "doors"

    };


    return (
        mappings[normalized] ||
        null
    );

}


/*
 * ------------------------------------------------------------
 * Parse Wikipedia infobox HTML
 * ------------------------------------------------------------
 */

async function parseWikipediaInfobox(
    html
) {

    const specifications =
        createEmptyWikipediaSpecifications();

    if (!html) {
        return specifications;
    }

    try {

        /*
         * HTMLRewriter is available in the
         * Cloudflare Workers runtime.
         */

        const response =
            new Response(
                html,
                {
                    headers: {
                        "Content-Type":
                            "text/html; charset=UTF-8"
                    }
                }
            );

        let currentRow = null;

        const rows = [];

        const rewriter =
            new HTMLRewriter()

                /*
                 * Find every row inside Wikipedia infobox.
                 */

                .on(
                    "table.infobox tr",
                    {

                        element(element) {

                            currentRow = {
                                label: "",
                                value: ""
                            };

                            rows.push(
                                currentRow
                            );

                            element.onEndTag(
                                () => {

                                    currentRow =
                                        null;

                                }
                            );

                        }

                    }
                )

                /*
                 * Read the <th> label.
                 */

                .on(
                    "table.infobox tr th",
                    {

                        text(text) {

                            if (
                                !currentRow
                            ) {
                                return;
                            }

                            currentRow.label +=
                                text.text;

                        }

                    }
                )

                /*
                 * Read the <td> value.
                 */

                .on(
                    "table.infobox tr td",
                    {

                        text(text) {

                            if (
                                !currentRow
                            ) {
                                return;
                            }

                            currentRow.value +=
                                text.text;

                        }

                    }
                );

        await rewriter.transform(
            response
        ).text();


        /*
         * Convert extracted rows
         * into our normalized specification fields.
         */

        for (
            const row of rows
        ) {

            if (
                !row ||
                !row.label ||
                !row.value
            ) {
                continue;
            }

            const label =
                normalizeWikipediaText(
                    row.label
                );

            const value =
                normalizeWikipediaText(
                    row.value
                )
                    .replace(
                        /\[\s*\d+\s*\]/g,
                        ""
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            if (
                !label ||
                !value
            ) {
                continue;
            }

            const field =
                getWikipediaSpecificationField(
                    label
                );

            if (!field) {
                continue;
            }

            specifications[field] =
                value;

        }

    } catch (error) {

        console.error(
            "Wikipedia infobox parsing error:",
            error
        );

    }

    return specifications;

}


        const rows =
            infobox.querySelectorAll(
                "tr"
            );


        rows.forEach(
            row => {

                const labelElement =
                    row.querySelector(
                        "th"
                    );

                const valueElement =
                    row.querySelector(
                        "td"
                    );


                if (
                    !labelElement ||
                    !valueElement
                ) {

                    return;

                }


                const label =
                    normalizeWikipediaText(
                        labelElement.textContent
                    );


                const value =
                    normalizeWikipediaText(
                        valueElement.textContent
                    );


                if (
                    !label ||
                    !value
                ) {

                    return;

                }


                const field =
                    getWikipediaSpecificationField(
                        label
                    );


                if (!field) {

                    return;

                }


                /*
                 * Remove excessive citation markers
                 * and whitespace.
                 */

                const cleanedValue =
                    value
                        .replace(
                            /\[\s*\d+\s*\]/g,
                            ""
                        )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();


                if (
                    cleanedValue
                ) {

                    specifications[field] =
                        cleanedValue;

                }

            }
        );


    } catch (error) {

        console.error(
            "Wikipedia infobox parsing error:",
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

    if (!make || !model) {

        return null;

    }


    const searches = [
    `${make} ${model} ${kind}`,
    `${make} ${model}`
];


    for (
        const search of searches
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
                "origin",
                "*"
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
             * Prefer exact make + model title.
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


            /*
             * Score search results.
             */

            const normalizedMake =
                simplifyText(make);

            const normalizedModel =
                simplifyText(model);


            const scored =
                results.map(
                    result => {

                        const title =
                            String(
                                result?.title || ""
                            );


                        const simplifiedTitle =
                            simplifyText(
                                title
                            );


                        let score = 0;


                        if (
                            simplifiedTitle.includes(
                                normalizedMake
                            )
                        ) {

                            score += 30;

                        }


                        if (
                            simplifiedTitle.includes(
                                normalizedModel
                            )
                        ) {

                            score += 50;

                        }


                        if (
                            simplifiedTitle.includes(
                                normalizedTarget
                            )
                        ) {

                            score += 30;

                        }


                        return {

                            title,

                            score

                        };

                    }
                )
                .sort(
                    (a, b) =>
                        b.score - a.score
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
        Object.values(
            pages
        )[0];


    if (
        !page ||
        page.missing !== undefined
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

        url:
            page.fullurl ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(
                String(
                    page.title || title
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
            "text"
        );

        url.searchParams.set(
            "format",
            "json"
        );


        const data =
            await fetchWikipediaCached(
                url.toString()
            );


        const html =
            typeof data?.parse?.text ===
                "string"
                ? data.parse.text
                : data?.parse?.text?.["*"];


        return parseWikipediaInfobox(
            html
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
 * Check whether useful information exists
 * ------------------------------------------------------------
 */

function hasWikipediaVehicleInformation(
    specifications
) {

    if (!specifications) {

        return false;

    }


    return Object.values(
        specifications
    ).some(
        value =>
            value &&
            value !== "No Information"
    );

}


/*
 * ------------------------------------------------------------
 * Create a complete "No Information" result
 * ------------------------------------------------------------
 */

function createWikipediaNoInformation(
    make,
    model,
    kind
) {

    return {

        success: true,

        source: "Wikipedia",

        make:
            make || "No Information",

        model:
            model || "No Information",

        kind:
            kind || "No Information",

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
 *
 * /api/cars?action=details
 *   &make=BMW
 *   &model=3%20Series
 *   &kind=car
 *
 * VehiclesDB:
 *   catalog / identity
 *
 * Wikipedia:
 *   description
 *   image
 *   specifications
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


    if (!make || !model) {

        return jsonResponse(
            {
                success: false,

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
     * --------------------------------------------------------
     * 1. Verify vehicle against VehiclesDB.
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
     * --------------------------------------------------------
     * 2. Search Wikipedia.
     * --------------------------------------------------------
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


    /*
     * If no Wikipedia article exists,
     * return explicit No Information.
     */

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
     * --------------------------------------------------------
     * 3. Load Wikipedia page.
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * 4. Load real Wikipedia infobox.
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * 5. Final response.
     * --------------------------------------------------------
     */

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
