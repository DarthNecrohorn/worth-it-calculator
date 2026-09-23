/*
 * ============================================================
 * WORTH IT - VEHICLES UI
 * VehiclesDB + Wikipedia + Wikimedia Commons
 *
 * Public vehicle categories:
 *   Cars
 *   Motorcycles (includes mopeds)
 *   Vans
 *   Trucks
 *   Buses
 *
 * Uses:
 *   /api/cars?action=models
 *   /api/cars?action=details
 *
 * No API key required in frontend.
 *
 * VehiclesDB Open Dataset: CC BY 4.0
 * Wikimedia Commons images: individual licenses displayed
 * by the API when image metadata is available.
 * ============================================================
 */


/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const VEHICLE_API = "/api/cars";

const VEHICLE_API_VERSION = "v13";

const VEHICLE_CATALOG_BASE_URL =
    "https://cdn.jsdelivr.net/gh/vehiclesdb/vehiclesdb@latest/catalog";

const VEHICLE_DETAILS_CACHE_VERSION = "v19";

const MAX_VEHICLES_PER_CATEGORY = 300;

const MAX_SEARCH_RESULTS = MAX_VEHICLES_PER_CATEGORY;

const INITIAL_VISIBLE_ROWS = 2;

/*
 * Popular Vehicles quality selection.
 *
 * VehiclesDB provides the popularity candidates, while the
 * details endpoint is used only for a limited number of candidates
 * at a time to keep cards with missing Wikipedia/Wikimedia data
 * out of the Popular Vehicles view.
 */
const POPULAR_CANDIDATE_POOL_SIZE = 1000;
const POPULAR_QUALITY_BATCH_SIZE = 10;
const POPULAR_INITIAL_MAX_CHECKS = 40;
const POPULAR_SHOW_ALL_MAX_NEW_CHECKS = 1500;
const VEHICLE_DETAILS_REQUEST_TIMEOUT_MS = 15000;
const POPULAR_MAX_DISPLAY_RESULTS = MAX_VEHICLES_PER_CATEGORY;
const POPULAR_MIN_SPECIFICATION_FIELDS = 2;
const POPULAR_MIN_DESCRIPTION_LENGTH = 60;

const POPULAR_VEHICLE_TYPE_TERMS = {
    car: [
        "car", "automobile", "sedan", "saloon", "hatchback",
        "coupe", "convertible", "cabriolet", "roadster", "wagon",
        "estate", "suv", "crossover", "minivan", "mpv", "pickup"
    ],
    motorcycle: [
        "motorcycle", "motorbike", "scooter", "motorcycle model",
        "motorcycle series", "two-wheeler", "underbone"
    ],
    moped: [
        "moped", "scooter", "motorized bicycle", "motorised bicycle",
        "motor scooter"
    ],
    van: [
        "van", "minivan", "panel van", "cargo van", "microvan",
        "people carrier", "light commercial vehicle"
    ],
    truck: [
        "truck", "lorry", "pickup truck", "heavy truck",
        "commercial truck", "tractor unit", "tractor-trailer"
    ],
    bus: [
        "bus", "coach", "transit bus", "city bus", "double-decker",
        "shuttle bus", "school bus", "minibus"
    ]
};

const POPULAR_VEHICLE_KIND_CONTRADICTION_TERMS = {
    motorcycle: [
        "car", "sedan", "hatchback", "coupe", "suv",
        "sport utility", "van", "truck", "bus", "coach"
    ],
    van: [
        "suv", "sport utility", "crossover", "sedan",
        "hatchback", "coupe", "roadster", "convertible",
        "wagon", "pickup", "motorcycle", "moped",
        "truck", "bus", "coach"
    ],
    truck: [
        "bus", "coach", "sedan", "hatchback", "coupe",
        "roadster", "suv", "sport utility", "motorcycle",
        "moped", "van"
    ],
    bus: [
        "truck", "lorry", "sedan", "hatchback", "coupe",
        "roadster", "suv", "sport utility", "motorcycle",
        "moped", "van"
    ]
};

const POPULAR_NON_VEHICLE_ENTITY_TERMS = [
    "airport", "airline", "airport authority", "iata", "icao",
    "singer", "songwriter", "pianist", "musician", "actor",
    "actress", "politician", "footballer", "basketball player",
    "athlete", "person", "biography", "village", "town", "city",
    "municipality", "river", "lake", "mountain", "university",
    "school", "hospital", "station", "building", "church",
    "film", "movie", "television series", "album", "song",
    "novel", "book", "magazine", "aircraft", "airplane", "helicopter"
];

const POPULAR_NON_VEHICLE_IMAGE_TERMS = [
    "map", "maps", "course", "route", "road map", "weather",
    "forecast", "climate", "airport", "airline", "stadium",
    "building", "church", "university", "school", "hospital",
    "station", "portrait", "person", "people", "singer",
    "actor", "actress", "politician", "athlete", "logo", "flag",
    "coat of arms", "diagram", "chart", "location", "landmark"
];

const VEHICLE_KINDS = [
    "car",
    "motorcycle",
    "van",
    "truck",
    "bus"
];

const VEHICLE_DATA_KINDS = [
    "car",
    "motorcycle",
    "moped",
    "van",
    "truck",
    "bus"
];

const VEHICLE_CATALOG_SOURCE_KINDS = {
    car: ["car"],
    motorcycle: ["motorcycle", "moped"],
    van: ["van"],
    truck: ["truck"],
    bus: ["bus"]
};

const VEHICLE_KIND_INFO = {

    car: {
        icon: "🚗",
        singular: "Car",
        plural: "Cars",
        title: "🚗 Popular Cars",
        description:
            "Discover some of the most popular car models."
    },

    motorcycle: {
        icon: "🏍️",
        singular: "Motorcycle",
        plural: "Motorcycles",
        title: "🏍️ Popular Motorcycles",
        description:
            "Discover some of the most popular motorcycle models."
    },

    van: {
        icon: "🚐",
        singular: "Van",
        plural: "Vans",
        title: "🚐 Popular Vans",
        description:
            "Discover some of the most popular van models."
    },

    truck: {
        icon: "🚚",
        singular: "Truck",
        plural: "Trucks",
        title: "🚚 Popular Trucks",
        description:
            "Discover some of the most popular truck models."
    },

    bus: {
        icon: "🚌",
        singular: "Bus",
        plural: "Buses",
        title: "🚌 Popular Buses",
        description:
            "Discover some of the most popular bus models."
    }

};


const VEHICLE_POPULARITY_NOTE =
    "Vehicle popularity is based on data provided by the VehiclesDB Open Dataset. Because the dataset reflects the countries and sources it covers, the models shown first may not always be the most popular cars worldwide. For a specific make or model, we recommend using the search above.";


/*
 * ============================================================
 * STATE / CACHE
 * ============================================================
 */

const vehicleCatalogCache =
    new Map();

const vehicleCatalogLoading =
    new Map();

const vehicleDetailsCache =
    new Map();

const vehicleDetailsLoading =
    new Map();

let currentVehicleKind =
    "car";

let currentVehicleCatalog =
    [];

let currentVehicleResults =
    [];

let currentVehicleShowAll =
    false;

let currentVehicleMode =
    "popular";

const MAX_COMPARE_VEHICLES =
    3;

const vehicleCompareSelection =
    new Map();

let vehicleModalScrollY =
    0;

/*
 * Per-category state for progressively selecting popular vehicles
 * that have usable Wikipedia + Wikimedia data.
 */
const popularVehicleQualityState =
    new Map();

const popularVehicleQualityCache =
    new Map();

const supplementalVehicleCatalogCache =
    new Map();

const supplementalVehicleCatalogLoading =
    new Map();

const dbpediaVehicleCatalogCache =
    new Map();

const dbpediaVehicleCatalogLoading =
    new Map();

const WIKIDATA_SUPPLEMENTAL_LIMIT =
    600;

const DBPEDIA_SUPPLEMENTAL_LIMIT =
    600;

const VEHICLE_PERSISTENT_CATALOG_VERSION =
    "v2";

const VEHICLE_PERSISTENT_POPULAR_VERSION =
    "v2";

const VEHICLE_PERSISTENT_CATEGORY_TTL_MS =
    7 * 24 * 60 * 60 * 1000;

const VEHICLE_PERSISTENT_CATALOG_LIMIT =
    1200;

const VEHICLE_SUPPLEMENTAL_CATEGORIES = [
    "car",
    "motorcycle",
    "van",
    "truck",
    "bus"
];

/*
 * Per-category progressive display/hydration state.
 * Cards are rendered from the catalog immediately. Wikipedia data is
 * verified in the background, and invalid/no-information records are
 * replaced by the next catalog candidate.
 */
const popularVehicleHydrationState =
    new Map();

const POPULAR_DETAILS_CONCURRENCY = 6;

const POPULAR_NONCAR_DETAILS_CONCURRENCY = 12;
const POPULAR_NONCAR_QUALITY_BATCH_SIZE = 12;
const POPULAR_NONCAR_INITIAL_MAX_CHECKS = 72;

const POPULAR_REFRESH_CARD_COUNT = 8;
const POPULAR_REFRESH_MAX_CHECKS = 96;
const POPULAR_REFRESH_CONCURRENCY = 12;

function getPopularDetailsConcurrency(kind) {
    return kind === "car"
        ? POPULAR_DETAILS_CONCURRENCY
        : POPULAR_NONCAR_DETAILS_CONCURRENCY;
}

function getPopularQualityBatchSize(kind) {
    return kind === "car"
        ? POPULAR_QUALITY_BATCH_SIZE
        : POPULAR_NONCAR_QUALITY_BATCH_SIZE;
}

function getPopularInitialCheckLimit(kind) {
    return kind === "car"
        ? POPULAR_SHOW_ALL_MAX_NEW_CHECKS
        : POPULAR_NONCAR_INITIAL_MAX_CHECKS;
}

function getPopularMaxNewChecks(kind) {
    return kind === "car"
        ? POPULAR_SHOW_ALL_MAX_NEW_CHECKS
        : 2600;
}

/*
 * Persistent browser cache version for account-scoped vehicle
 * metadata/images.
 */
const VEHICLE_PERSISTENT_CACHE_VERSION = "v3";

let vehicleAccountCacheOwnerPromise =
    null;

function hashVehicleCacheOwner(
    value
) {

    const text =
        String(value || "guest");

    let hash = 2166136261;

    for (
        let i = 0;
        i < text.length;
        i++
    ) {

        hash ^=
            text.charCodeAt(i);

        hash =
            Math.imul(
                hash,
                16777619
            );

    }

    return (
        hash >>> 0
    ).toString(16);

}

async function getVehicleAccountCacheOwner() {

    if (
        vehicleAccountCacheOwnerPromise
    ) {

        return vehicleAccountCacheOwnerPromise;

    }

    vehicleAccountCacheOwnerPromise =
        (async () => {

            try {

                if (
                    !window.supabaseClient?.auth
                ) {

                    return "guest";

                }

                const {
                    data
                } =
                    await window.supabaseClient.auth.getSession();

                return hashVehicleCacheOwner(
                    data?.session?.user?.id ||
                    "guest"
                );

            } catch {

                return "guest";

            }

        })();

    return vehicleAccountCacheOwnerPromise;

}


async function readPersistentVehicleCatalog(
    kind
) {

    if (kind === "car") {
        return null;
    }

    try {

        const cache =
            await caches.open(
                "worth-it-cars-catalog-" +
                VEHICLE_PERSISTENT_CATALOG_VERSION
            );

        const response =
            await cache.match(
                "https://worth-it-cars-cache.local/catalog/" +
                kind
            );

        if (!response) {
            return null;
        }

        const payload =
            await response.json();

        const savedAt =
            Number(payload?.savedAt || 0);

        if (
            payload?.version !==
                VEHICLE_PERSISTENT_CATALOG_VERSION ||
            !Array.isArray(payload?.vehicles) ||
            !payload.vehicles.length ||
            !Number.isFinite(savedAt) ||
            Date.now() - savedAt >
                VEHICLE_PERSISTENT_CATEGORY_TTL_MS
        ) {
            return null;
        }

        return payload.vehicles;

    } catch (error) {

        console.warn(
            "Persistent vehicle catalog read skipped:",
            kind,
            error
        );

        return null;

    }

}

async function writePersistentVehicleCatalog(
    kind,
    vehicles
) {

    if (
        kind === "car" ||
        !Array.isArray(vehicles) ||
        !vehicles.length
    ) {
        return;
    }

    try {

        const compactVehicles =
            vehicles
                .slice(
                    0,
                    VEHICLE_PERSISTENT_CATALOG_LIMIT
                )
                .map(vehicle => ({
                    make: vehicle?.make || "",
                    makeSlug: vehicle?.makeSlug || "",
                    model: vehicle?.model || "",
                    modelSlug: vehicle?.modelSlug || "",
                    kind: vehicle?.kind || kind,
                    sourceKind:
                        vehicle?.sourceKind ||
                        vehicle?.kind ||
                        kind,
                    supplementalSource:
                        vehicle?.supplementalSource ||
                        null,
                    wikipediaTitle:
                        vehicle?.wikipediaTitle ||
                        null,
                    bodyType:
                        vehicle?.bodyType ||
                        null,
                    bodyTypes:
                        Array.isArray(vehicle?.bodyTypes)
                            ? vehicle.bodyTypes
                            : [],
                    popularityRanks:
                        Array.isArray(vehicle?.popularityRanks)
                            ? vehicle.popularityRanks
                            : [],
                    globalDecile:
                        vehicle?.globalDecile ??
                        null,
                    availability:
                        Array.isArray(vehicle?.availability)
                            ? vehicle.availability
                            : [],
                    yearStart:
                        vehicle?.yearStart ??
                        null,
                    yearEnd:
                        vehicle?.yearEnd ??
                        null
                }))
                .filter(
                    vehicle =>
                        vehicle.make &&
                        vehicle.model
                );

        const cache =
            await caches.open(
                "worth-it-cars-catalog-" +
                VEHICLE_PERSISTENT_CATALOG_VERSION
            );

        await cache.put(
            "https://worth-it-cars-cache.local/catalog/" +
            kind,
            new Response(
                JSON.stringify({
                    version:
                        VEHICLE_PERSISTENT_CATALOG_VERSION,
                    savedAt:
                        Date.now(),
                    vehicles:
                        compactVehicles
                }),
                {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "application/json; charset=UTF-8"
                    }
                }
            )
        );

    } catch (error) {

        console.warn(
            "Persistent vehicle catalog write skipped:",
            kind,
            error
        );

    }

}

function getVehiclePersistentDetailsKey(
    owner,
    make,
    model,
    kind
) {

    return [
        "worthItVehicleDetails",
        VEHICLE_PERSISTENT_CACHE_VERSION,
        owner,
        normalizeVehicleText(kind),
        normalizeVehicleText(make),
        normalizeVehicleText(model)
    ].join(":");

}

function readPersistentVehicleDetails(
    owner,
    make,
    model,
    kind
) {

    try {

        const raw =
            localStorage.getItem(
                getVehiclePersistentDetailsKey(
                    owner,
                    make,
                    model,
                    kind
                )
            );

        if (!raw) {
            return null;
        }

        const parsed =
            JSON.parse(raw);

        if (
            !parsed ||
            !parsed.specifications
        ) {
            return null;
        }

        return parsed;

    } catch {

        return null;

    }

}

function writePersistentVehicleDetails(
    owner,
    details
) {

    try {

        const make =
            details?.vehicle?.make ||
            details?.make ||
            "";

        const model =
            details?.vehicle?.model ||
            details?.model ||
            "";

        const kind =
            details?.vehicle?.kind ||
            details?.kind ||
            "";

        if (
            !make ||
            !model ||
            !kind
        ) {
            return;
        }

        /*
         * Keep enough metadata for fast card rendering and image reuse,
         * while avoiding storing unnecessarily large raw API responses.
         */
        const compact = {
            success:
                true,

            kind,

            vehicle: {
                make,
                model,
                kind
            },

            wikipedia: {
                title:
                    details?.wikipedia?.title ||
                    "No Information",

                url:
                    details?.wikipedia?.url ||
                    null,

                description:
                    String(
                        details?.wikipedia?.description ||
                        "No Information"
                    ).slice(
                        0,
                        2500
                    )
            },

            image:
                details?.image ||
                null,

            specifications:
                details?.specifications ||
                {},

            comparisonAvailable:
                Boolean(
                    details?.comparisonAvailable
                )
        };

        localStorage.setItem(
            getVehiclePersistentDetailsKey(
                owner,
                make,
                model,
                kind
            ),
            JSON.stringify(
                compact
            )
        );

    } catch (error) {

        /*
         * localStorage quota or serialization problems must never
         * interrupt Cars rendering.
         */
        console.warn(
            "Vehicle persistent cache write skipped:",
            error
        );

    }

}

async function getCachedVehicleImageObjectUrl(
    imageUrl
) {

    const url =
        String(imageUrl || "").trim();

    if (!url) {
        return null;
    }

    try {

        const owner =
            await getVehicleAccountCacheOwner();

        const cache =
            await caches.open(
                `worth-it-cars-images-${VEHICLE_PERSISTENT_CACHE_VERSION}-${owner}`
            );

        const cached =
            await cache.match(
                url
            );

        if (!cached) {
            return null;
        }

        const blob =
            await cached.blob();

        if (!blob || !blob.size) {
            return null;
        }

        return URL.createObjectURL(
            blob
        );

    } catch {

        return null;

    }

}

async function cacheVehicleImageResponse(
    imageUrl
) {

    const url =
        String(imageUrl || "").trim();

    if (!url) {
        return;
    }

    try {

        const owner =
            await getVehicleAccountCacheOwner();

        const cache =
            await caches.open(
                `worth-it-cars-images-${VEHICLE_PERSISTENT_CACHE_VERSION}-${owner}`
            );

        if (
            await cache.match(url)
        ) {

            return;

        }

        const response =
            await fetch(
                url,
                {
                    mode: "cors",
                    credentials: "omit",
                    cache: "force-cache"
                }
            );

        if (
            !response.ok
        ) {

            return;

        }

        await cache.put(
            url,
            response.clone()
        );

    } catch {

        /*
         * Some image hosts may disallow programmatic cross-origin
         * fetching even though normal <img> loading works. Native image
         * loading remains the fallback.
         */

    }

}


/*
 * ============================================================
 * IMAGE LAZY-LOAD + CONCURRENCY CONTROL
 * ============================================================
 */

let vehicleImageObserver = null;

const MAX_CONCURRENT_IMAGE_REQUESTS = 8;

let activeVehicleImageRequests = 0;

const vehicleImageQueue = [];


function processVehicleImageQueue() {

    while (
        activeVehicleImageRequests <
            MAX_CONCURRENT_IMAGE_REQUESTS &&
        vehicleImageQueue.length
    ) {

        const task =
            vehicleImageQueue.shift();

        if (
            !task ||
            !task.imageElement ||
            !task.imageElement.isConnected
        ) {

            continue;

        }

        activeVehicleImageRequests++;

        Promise.resolve(
            loadVehicleCardImage(
                task.imageElement,
                task.make,
                task.model,
                task.kind
            )
        )
            .catch(
                error => {

                    console.error(
                        "Vehicle image loading error:",
                        task.make,
                        task.model,
                        task.kind,
                        error
                    );

                }
            )
            .finally(
                () => {

                    activeVehicleImageRequests--;

                    processVehicleImageQueue();

                }
            );

    }

}


function queueVehicleImageLoad(
    imageElement,
    make,
    model,
    kind
) {

    if (
        !imageElement ||
        imageElement.dataset.loaded === "true" ||
        imageElement.dataset.loaded === "loading" ||
        imageElement.dataset.queued === "true"
    ) {

        return;

    }

    imageElement.dataset.queued =
        "true";


    vehicleImageQueue.push({

        imageElement,
        make,
        model,
        kind

    });


    processVehicleImageQueue();

}


function getVehicleImageObserver() {

    if (
        vehicleImageObserver
    ) {

        return vehicleImageObserver;

    }


    if (
        typeof IntersectionObserver === "undefined"
    ) {

        return null;

    }


    vehicleImageObserver =
        new IntersectionObserver(
            entries => {

                entries.forEach(
                    entry => {

                        if (
                            !entry.isIntersecting
                        ) {

                            return;

                        }


                        const imageElement =
                            entry.target;


                        const make =
                            imageElement.dataset.vehicleMake;

                        const model =
                            imageElement.dataset.vehicleModel;

                        const kind =
                            imageElement.dataset.vehicleKind;

                        const sourceKind =
                            imageElement.dataset.vehicleSourceKind ||
                            kind;


                        if (
                            make &&
                            model &&
                            kind
                        ) {

                            queueVehicleImageLoad(
                                imageElement,
                                make,
                                model,
                                sourceKind
                            );

                        }


                        vehicleImageObserver.unobserve(
                            imageElement
                        );

                    }
                );

            },
            {
                /*
                 * Only start loading images that are
                 * reasonably close to the viewport.
                 *
                 * This prevents hundreds of details
                 * requests from starting at once.
                 */
                rootMargin: "400px 0px"
            }
        );


    return vehicleImageObserver;

}


/*
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

function normalizeVehicleText(value) {

    return String(value || "")
        .trim()
        .toLowerCase();

}


function escapeVehicleHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function getVehicleKindInfo(kind) {

    return (
        VEHICLE_KIND_INFO[kind] ||
        VEHICLE_KIND_INFO.car
    );

}


/*
 * ============================================================
 * VEHICLE DETAILS
 *
 * Loads Wikidata + Wikimedia Commons image data
 * through the Cloudflare API.
 * ============================================================
 */

function getVehicleDetailsCacheKey(
    make,
    model,
    kind
) {

    return [
        normalizeVehicleText(make),
        normalizeVehicleText(model),
        normalizeVehicleText(kind)
    ].join("|");

}


async function fetchVehicleDetailsWithRetry(
    make,
    model,
    kind,
    attempts = 2,
    retryDelayMs = 650
) {

    const maxAttempts =
        Math.max(
            1,
            Number(attempts) || 1
        );

    let lastResult = null;

    for (
        let attempt = 1;
        attempt <= maxAttempts;
        attempt++
    ) {

        lastResult =
            await fetchVehicleDetails(
                make,
                model,
                kind
            );

        if (lastResult) {
            return lastResult;
        }

        if (
            attempt < maxAttempts
        ) {

            await new Promise(
                resolve =>
                    window.setTimeout(
                        resolve,
                        retryDelayMs
                    )
            );

        }

    }

    return lastResult;

}


async function fetchVehicleDetails(
    make,
    model,
    kind
) {

    const cacheKey =
        getVehicleDetailsCacheKey(
            make,
            model,
            kind
        );


    /*
     * Browser memory cache.
     */

    if (
        vehicleDetailsCache.has(cacheKey)
    ) {

        return vehicleDetailsCache.get(
            cacheKey
        );

    }

    /*
     * Persistent account-scoped browser cache.
     * This lets a returning user restore vehicle information without
     * requesting Wikipedia again on every visit.
     */
    const persistentOwner =
        await getVehicleAccountCacheOwner();

    const persistentDetails =
        readPersistentVehicleDetails(
            persistentOwner,
            make,
            model,
            kind
        );

    if (persistentDetails) {

        vehicleDetailsCache.set(
            cacheKey,
            persistentDetails
        );

        return persistentDetails;

    }


    /*
     * Prevent duplicate requests for
     * the same vehicle.
     */

    if (
        vehicleDetailsLoading.has(cacheKey)
    ) {

        return vehicleDetailsLoading.get(
            cacheKey
        );

    }


    const loadingPromise =
        (async () => {

            try {

                const catalogVehicle =
                    currentVehicleCatalog.find(
                        vehicle =>
                            normalizeVehicleText(vehicle?.make) ===
                                normalizeVehicleText(make) &&
                            normalizeVehicleText(vehicle?.model) ===
                                normalizeVehicleText(model) &&
                            normalizeVehicleText(
                                vehicle?.sourceKind ||
                                vehicle?.kind ||
                                kind
                            ) ===
                                normalizeVehicleText(kind)
                    ) || null;

                const params =
                    new URLSearchParams({

                        action: "details",

                        make: make,

                        model: model,

                        kind: kind

                    });

                if (catalogVehicle) {

                    if (catalogVehicle.wikipediaTitle) {
                        params.set(
                            "wikipedia_title",
                            catalogVehicle.wikipediaTitle
                        );
                    }

                    if (catalogVehicle.bodyType) {
                        params.set(
                            "body_type",
                            catalogVehicle.bodyType
                        );
                    }

                    if (Array.isArray(catalogVehicle.bodyTypes)) {
                        params.set(
                            "body_types",
                            JSON.stringify(
                                catalogVehicle.bodyTypes
                            )
                        );
                    }

                    if (
                        catalogVehicle.yearStart !== null &&
                        catalogVehicle.yearStart !== undefined
                    ) {
                        params.set(
                            "year_start",
                            String(catalogVehicle.yearStart)
                        );
                    }

                    if (
                        catalogVehicle.yearEnd !== null &&
                        catalogVehicle.yearEnd !== undefined
                    ) {
                        params.set(
                            "year_end",
                            String(catalogVehicle.yearEnd)
                        );
                    }

                    if (
                        catalogVehicle.globalDecile !== null &&
                        catalogVehicle.globalDecile !== undefined
                    ) {
                        params.set(
                            "global_decile",
                            String(catalogVehicle.globalDecile)
                        );
                    }
                }


                const controller =
                    typeof AbortController !== "undefined"
                        ? new AbortController()
                        : null;

                const timeoutId =
                    controller
                        ? window.setTimeout(
                            () => controller.abort(),
                            VEHICLE_DETAILS_REQUEST_TIMEOUT_MS
                        )
                        : null;

                let response;

                try {

                    response =
                        await fetch(
                            `${VEHICLE_API}?${params.toString()}&v=${VEHICLE_DETAILS_CACHE_VERSION}`,
                            {
                                headers: {
                                    "Accept":
                                        "application/json"
                                },
                                ...(controller
                                    ? { signal: controller.signal }
                                    : {})
                            }
                        );

                } finally {

                    if (timeoutId !== null) {
                        window.clearTimeout(timeoutId);
                    }

                }


                if (!response.ok) {

                    throw new Error(
                        `Vehicle details API returned ${response.status}`
                    );

                }


                const data =
                    await response.json();


                if (
                    !data ||
                    !data.success
                ) {

                    throw new Error(
                        "Invalid vehicle details response"
                    );

                }


                vehicleDetailsCache.set(
                    cacheKey,
                    data
                );

                void getVehicleAccountCacheOwner()
                    .then(
                        owner =>
                            writePersistentVehicleDetails(
                                owner,
                                data
                            )
                    );

                return data;

            } catch (error) {

                console.error(
                    "Vehicle details error:",
                    make,
                    model,
                    kind,
                    error
                );

                /*
                  * Do not cache failed requests.
                  * A later attempt should be allowed to retry.
                                                               */

                return null;

            } finally {

                vehicleDetailsLoading.delete(
                    cacheKey
                );

            }

        })();


    vehicleDetailsLoading.set(
        cacheKey,
        loadingPromise
    );


    return loadingPromise;

}


/*
 * ============================================================
 * VEHICLE CARD IMAGE
 * ============================================================
 */

function createVehicleImageElement(
    vehicle,
    kind
) {

    const image =
        document.createElement("img");

    image.className =
        "car-card-image";

    image.alt =
        `${vehicle.make || ""} ${vehicle.model || ""}`.trim();

    image.loading =
        "lazy";

    image.decoding =
        "async";

    image.dataset.vehicleMake =
        vehicle.make || "";

    image.dataset.vehicleModel =
        vehicle.model || "";

    image.dataset.vehicleKind =
        kind;

    image.dataset.vehicleSourceKind =
        vehicle.sourceKind ||
        kind;

    image.style.width =
        "100%";

    image.style.height =
        "180px";

    image.style.display =
        "block";

    image.style.objectFit =
        "cover";

    image.style.borderRadius =
        "12px 12px 0 0";

    image.style.background =
        "rgba(128,128,128,0.10)";

    image.style.opacity =
        "0";

    image.style.transition =
        "opacity 0.2s ease";


    image.addEventListener(
        "load",
        () => {

            image.style.opacity =
                "1";

        }
    );


    image.addEventListener(
        "error",
        () => {

            showVehicleImagePlaceholder(
                image
            );

        }
    );


    return image;

}


function createVehicleImagePlaceholder(
    vehicle,
    kind,
    message = "Loading image..."
) {
    const info = getVehicleKindInfo(kind);

    const placeholder = document.createElement("div");

    placeholder.className = "car-card-image-placeholder";
    placeholder.style.width = "100%";
    placeholder.style.height = "180px";
    placeholder.style.display = "flex";
    placeholder.style.alignItems = "center";
    placeholder.style.justifyContent = "center";
    placeholder.style.flexDirection = "column";
    placeholder.style.gap = "8px";
    placeholder.style.borderRadius = "12px 12px 0 0";
    placeholder.style.background = "rgba(128,128,128,0.10)";

    placeholder.innerHTML = `
        <div style="font-size:2.2rem;opacity:0.75;">
            ${info.icon}
        </div>
        <small
            class="car-image-loading-text"
            style="font-size:0.75rem;opacity:0.55;"
        >
            ${message}
        </small>
    `;

    return placeholder;
}

function showVehicleImagePlaceholder(
    image
) {

    const parent =
        image.parentNode;

    if (!parent) {

        return;

    }

    const kind =
        image.dataset.vehicleKind || "car";

    const existingPlaceholder =
        parent.querySelector(
            ".car-card-image-placeholder"
        );

    if (existingPlaceholder) {

        existingPlaceholder.innerHTML = `
            <div style="font-size:2.2rem;opacity:0.75;">
                ${getVehicleKindInfo(kind).icon}
            </div>

            <small
                class="car-image-loading-text"
                style="font-size:0.75rem;opacity:0.55;"
            >
                Image unavailable
            </small>
        `;

    }

    image.remove();

}


function updateVehicleCardInformationPreview(
    imageElement,
    details
) {

    const card =
        imageElement?.closest(
            ".car-card"
        );

    if (!card) {
        return;
    }

    const content =
        card.querySelector(
            ".car-card-content"
        );

    if (!content) {
        return;
    }

    let preview =
        content.querySelector(
            ".car-card-info-preview"
        );

    if (!preview) {

        preview =
            document.createElement(
                "small"
            );

        preview.className =
            "car-card-info-preview";

        content.appendChild(
            preview
        );
    }

    if (!details) {

        preview.textContent =
            "No Information";
        preview.removeAttribute("title");

        return;

    }

    const specifications =
        details?.specifications ||
        {};

    const candidates = [
        ["fuel", specifications.fuel],
        ["power", specifications.horsepower],
        ["engine", specifications.engine],
        ["battery", specifications.battery],
        ["range", specifications.electricRange],
        ["payload", specifications.payload],
        ["cargo", specifications.cargoCapacity],
        ["seats", specifications.seating],
        ["economy", specifications.fuelEconomy]
    ];

    const values =
        candidates
            .filter(([, value]) =>
                isUsefulVehicleDetailValue(value)
            )
            .slice(0, 3)
            .map(([, value]) =>
                String(value).trim()
            );

    const description =
        String(
            details?.wikipedia?.description ||
            ""
        ).trim();

    if (values.length) {
        preview.textContent =
            values.join(" • ");
        preview.removeAttribute("title");
        return;
    }

    if (description && !/^no information$/i.test(description)) {
        preview.textContent =
            description.length > 110
                ? `${description.slice(0, 107).trimEnd()}…`
                : description;
        preview.title =
            description;
        return;
    }

    preview.textContent =
        "No Information";
    preview.removeAttribute("title");

}

async function loadVehicleCardImage(
    imageElement,
    make,
    model,
    kind
) {

    if (
        imageElement.dataset.loaded === "true"
    ) {
        return;
    }

    imageElement.dataset.loaded =
        "loading";

    imageElement.dataset.queued =
        "false";

    const details =
        await fetchVehicleDetails(
            make,
            model,
            kind
        );

    updateVehicleCardInformationPreview(
        imageElement,
        details
    );

    if (
        !imageElement.isConnected
    ) {
        return;
    }

    const image =
        details?.image;

    const imageIsRelevant =
        hasPopularVehicleImageRelevance(
            details,
            {
                make,
                model
            }
        );

    if (
        !image ||
        !image.url ||
        !imageIsRelevant
    ) {

        const parent =
            imageElement.parentNode;

        if (parent) {

            const existingPlaceholder =
                parent.querySelector(
                    ".car-card-image-placeholder"
                );

            if (existingPlaceholder) {

                existingPlaceholder.innerHTML = `
                    <div style="font-size:2.2rem;opacity:0.75;">
                        ${getVehicleKindInfo(kind).icon}
                    </div>

                    <small
                        class="car-image-loading-text"
                        style="font-size:0.75rem;opacity:0.55;"
                    >
                        Image unavailable
                    </small>
                `;

            }

            imageElement.remove();

        }

        return;

    }

    /*
     * Start the persistent-cache lookup and the native image request in
     * parallel. The browser does not wait for Cache Storage before starting
     * the image, which is much faster on a cold page.
     */
    const cachedObjectUrlPromise =
        getCachedVehicleImageObjectUrl(
            image.url
        );

    if (
        !imageElement.isConnected
    ) {
        return;
    }

    imageElement.src =
        image.url;

    imageElement.dataset.loaded =
        "true";

    void cachedObjectUrlPromise
        .then(
            cachedObjectUrl => {

                if (!cachedObjectUrl) {
                    return;
                }

                if (
                    !imageElement.isConnected
                ) {

                    try {
                        URL.revokeObjectURL(
                            cachedObjectUrl
                        );
                    } catch {}

                    return;
                }

                /*
                 * If the native request already produced the image, keep it.
                 * Otherwise the account-scoped cached object URL can avoid a
                 * second network transfer.
                 */
                if (
                    imageElement.complete &&
                    imageElement.naturalWidth > 0
                ) {

                    try {
                        URL.revokeObjectURL(
                            cachedObjectUrl
                        );
                    } catch {}

                    return;
                }

                imageElement.src =
                    cachedObjectUrl;

                imageElement.dataset.cached =
                    "true";

                imageElement.addEventListener(
                    "load",
                    () => {

                        try {
                            URL.revokeObjectURL(
                                cachedObjectUrl
                            );
                        } catch {}

                    },
                    {
                        once: true
                    }
                );

            }
        );

    if (image.author) {
        imageElement.dataset.imageAuthor =
            image.author;
    }

    if (image.license) {
        imageElement.dataset.imageLicense =
            image.license;
    }

    if (image.license_url) {
        imageElement.dataset.imageLicenseUrl =
            image.license_url;
    }

    if (image.source_url) {
        imageElement.dataset.imageSourceUrl =
            image.source_url;
    }

    /*
     * Cache the same URL separately in the background. A CORS failure here
     * must never delay or break the visible image.
     */
    void cacheVehicleImageResponse(
        image.url
    );

}


/*
 * ============================================================
 * LOAD VEHICLESDB CATALOG
 * ============================================================
 */

async function fetchVehicleCatalogSource(
    sourceKind
) {

    const baseUrl =
        VEHICLE_CATALOG_BASE_URL +
        "/" +
        sourceKind;

    for (let attempt = 1; attempt <= 2; attempt++) {

        try {

            const [modelsResponse, makesResponse] = await Promise.all([
                fetch(
                    baseUrl + "/models.json",
                    { headers: { "Accept": "application/json" } }
                ),
                fetch(
                    baseUrl + "/makes.json",
                    { headers: { "Accept": "application/json" } }
                )
            ]);

            if (!modelsResponse.ok || !makesResponse.ok) {
                throw new Error(
                    "VehiclesDB catalog request failed for " + sourceKind
                );
            }

            const [modelRecords, makeRecords] = await Promise.all([
                modelsResponse.json(),
                makesResponse.json()
            ]);

            if (!Array.isArray(modelRecords) || !Array.isArray(makeRecords)) {
                throw new Error("Invalid VehiclesDB catalog response");
            }

            const makeMap = new Map(
                makeRecords
                    .filter(make => make && make.id)
                    .map(make => [
                        String(make.id),
                        {
                            name: make.name || "",
                            slug: make.slug || ""
                        }
                    ])
            );

            return modelRecords
                .map(model => {
                    if (!model || !model.name) {
                        return null;
                    }

                    const make =
                        makeMap.get(String(model.make_id || "")) || {
                            name:
                                model.make_name ||
                                model.make ||
                                model.make_id ||
                                "",
                            slug:
                                model.make_slug ||
                                ""
                        };

                    const rawDecile =
                        model?.popularity?.global_decile ??
                        model?.global_decile ??
                        model?.global_popularity_decile ??
                        null;

                    const popularityRanks =
                        model?.popularity?.by_country
                            ? Object.values(model.popularity.by_country)
                                .map(entry => entry?.rank)
                                .filter(rank =>
                                    Number.isFinite(Number(rank)) &&
                                    Number(rank) > 0
                                )
                            : [];

                    return {
                        make: make.name,
                        makeSlug: make.slug,
                        model: model.name,
                        modelSlug: model.slug || "",
                        kind: sourceKind,
                        sourceKind,
                        bodyType:
                            Array.isArray(model.body_types) && model.body_types.length
                                ? model.body_types[0]
                                : null,
                        bodyTypes: Array.isArray(model.body_types) ? model.body_types : [],
                        popularityRanks,
                        globalDecile: rawDecile,
                        availability:
                            Array.isArray(model.availability)
                                ? model.availability
                                    .map(item =>
                                        typeof item === "string" ? item : item?.country
                                    )
                                    .filter(Boolean)
                                : [],
                        yearStart: model.year_start ?? null,
                        yearEnd: model.year_end ?? null
                    };
                })
                .filter(Boolean);

        } catch (error) {

            if (attempt === 2) {
                console.error(
                    "VehiclesDB source catalog failed for " + sourceKind + ":",
                    error
                );
                return [];
            }

            await new Promise(
                resolve => window.setTimeout(resolve, 250)
            );

        }
    }

    return [];

}

async function fetchFreshVehicleCatalog(
    kind
) {

    const sourceKinds =
        VEHICLE_CATALOG_SOURCE_KINDS[kind] ||
        [kind];

    const sourceCatalogs =
        await Promise.all(
            sourceKinds.map(
                sourceKind =>
                    fetchVehicleCatalogSource(
                        sourceKind
                    )
            )
        );

    const merged =
        new Map();

    for (
        const vehicle
        of sourceCatalogs.flat()
    ) {

        const key =
            normalizeVehicleText(
                vehicle.make
            ) +
            "|" +
            normalizeVehicleText(
                vehicle.model
            );

        if (!merged.has(key)) {

            merged.set(
                key,
                {
                    ...vehicle,
                    kind,
                    sourceKind:
                        vehicle.sourceKind ||
                        kind
                }
            );

        }

    }

    const vehicles =
        Array.from(
            merged.values()
        );

    vehicles.sort(
        (a, b) =>
            getVehiclePopularityValue(a) -
            getVehiclePopularityValue(b)
    );

    return vehicles;

}

async function refreshVehicleCatalogInBackground(
    kind
) {

    if (kind === "car") {
        return;
    }

    try {

        const freshVehicles =
            await fetchFreshVehicleCatalog(
                kind
            );

        if (!freshVehicles.length) {
            return;
        }

        vehicleCatalogCache.set(
            kind,
            freshVehicles
        );

        void writePersistentVehicleCatalog(
            kind,
            freshVehicles
        );

        if (
            currentVehicleKind === kind &&
            currentVehicleMode === "popular"
        ) {

            currentVehicleCatalog =
                freshVehicles;

            void continueStablePopularVehicleLoading(
                kind,
                freshVehicles
            );

        }

    } catch (error) {

        console.warn(
            "Background vehicle catalog refresh failed:",
            kind,
            error
        );

    }

}

async function fetchVehicleCatalog(
    kind = "car"
) {

    if (!VEHICLE_KINDS.includes(kind)) {
        kind = "car";
    }

    if (vehicleCatalogCache.has(kind)) {
        return vehicleCatalogCache.get(kind);
    }

    if (vehicleCatalogLoading.has(kind)) {
        return vehicleCatalogLoading.get(kind);
    }

    const loadingPromise =
        (async () => {

            if (kind !== "car") {

                const savedCatalog =
                    await readPersistentVehicleCatalog(
                        kind
                    );

                if (
                    Array.isArray(savedCatalog) &&
                    savedCatalog.length
                ) {

                    vehicleCatalogCache.set(
                        kind,
                        savedCatalog
                    );

                    void refreshVehicleCatalogInBackground(
                        kind
                    );

                    return savedCatalog;

                }

            }

            const vehicles =
                await fetchFreshVehicleCatalog(
                    kind
                );

            if (
                kind !== "car" &&
                vehicles.length
            ) {

                void writePersistentVehicleCatalog(
                    kind,
                    vehicles
                );

            }

            return vehicles;

        })().finally(
            () => {
                vehicleCatalogLoading.delete(
                    kind
                );
            }
        );

    vehicleCatalogLoading.set(
        kind,
        loadingPromise
    );

    return loadingPromise;

}

/*
 * ============================================================
 * SUPPLEMENTAL WIKIDATA CANDIDATES
 * ============================================================
 */

async function fetchSupplementalVehicleCatalog(
    kind
) {

    if (!VEHICLE_SUPPLEMENTAL_CATEGORIES.includes(kind)) {
        return [];
    }

    if (supplementalVehicleCatalogCache.has(kind)) {
        return supplementalVehicleCatalogCache.get(kind);
    }

    if (supplementalVehicleCatalogLoading.has(kind)) {
        return supplementalVehicleCatalogLoading.get(kind);
    }

    const loadingPromise =
        (async () => {

            try {

                const params =
                    new URLSearchParams({
                        action: "wikidata",
                        kind
                    });

                const response =
                    await fetch(
                        VEHICLE_API + "?" + params.toString(),
                        {
                            headers: {
                                "Accept": "application/json"
                            }
                        }
                    );

                if (!response.ok) {
                    return [];
                }

                const data =
                    await response.json();

                const vehicles =
                    Array.isArray(data?.vehicles)
                        ? data.vehicles
                        : [];

                supplementalVehicleCatalogCache.set(kind, vehicles);
                return vehicles;

            } catch (error) {

                console.warn(
                    "Supplemental Wikidata catalog failed for " + kind + ":",
                    error
                );

                return [];

            } finally {
                supplementalVehicleCatalogLoading.delete(kind);
            }

        })();

    supplementalVehicleCatalogLoading.set(kind, loadingPromise);
    return loadingPromise;

}


async function fetchDbpediaVehicleCatalog(
    kind
) {

    if (
        !VEHICLE_SUPPLEMENTAL_CATEGORIES.includes(
            kind
        )
    ) {
        return [];
    }

    if (dbpediaVehicleCatalogCache.has(kind)) {
        return dbpediaVehicleCatalogCache.get(kind);
    }

    if (dbpediaVehicleCatalogLoading.has(kind)) {
        return dbpediaVehicleCatalogLoading.get(kind);
    }

    const loadingPromise =
        (async () => {

            try {

                const params =
                    new URLSearchParams({
                        action: "dbpedia",
                        kind
                    });

                const response =
                    await fetch(
                        VEHICLE_API +
                        "?" +
                        params.toString(),
                        {
                            headers: {
                                "Accept":
                                    "application/json"
                            }
                        }
                    );

                if (!response.ok) {
                    return [];
                }

                const data =
                    await response.json();

                const vehicles =
                    Array.isArray(data?.vehicles)
                        ? data.vehicles
                        : [];

                dbpediaVehicleCatalogCache.set(
                    kind,
                    vehicles
                );

                return vehicles;

            } catch (error) {

                console.warn(
                    "Supplemental DBpedia catalog failed:",
                    kind,
                    error
                );

                return [];

            } finally {

                dbpediaVehicleCatalogLoading.delete(
                    kind
                );

            }

        })();

    dbpediaVehicleCatalogLoading.set(
        kind,
        loadingPromise
    );

    return loadingPromise;

}

function mergeSupplementalVehicleCatalog(
    kind,
    supplementalVehicles
) {

    const baseVehicles =
        Array.isArray(vehicleCatalogCache.get(kind))
            ? vehicleCatalogCache.get(kind)
            : [];

    const merged = new Map();

    for (const vehicle of [...baseVehicles, ...(supplementalVehicles || [])]) {

        if (!vehicle?.make || !vehicle?.model) continue;

        const key =
            normalizeVehicleText(vehicle.make) +
            "|" +
            normalizeVehicleText(vehicle.model);

        if (!merged.has(key)) {

            merged.set(key, {
                ...vehicle,
                kind,
                sourceKind: vehicle.sourceKind || kind,
                globalDecile:
                    vehicle.globalDecile ??
                    999
            });

        }
    }

    const mergedVehicles = Array.from(merged.values());

    mergedVehicles.sort(
        (a, b) =>
            getVehiclePopularityValue(a) -
            getVehiclePopularityValue(b)
    );

    vehicleCatalogCache.set(kind, mergedVehicles);

    return mergedVehicles;

}

async function enrichVehicleCategoryWithSupplementalSources(
    kind
) {

    const [
        wikidata,
        dbpedia
    ] =
        await Promise.all([
            fetchSupplementalVehicleCatalog(
                kind
            ),
            fetchDbpediaVehicleCatalog(
                kind
            )
        ]);

    const supplemental =
        [
            ...(Array.isArray(wikidata)
                ? wikidata.slice(
                    0,
                    WIKIDATA_SUPPLEMENTAL_LIMIT
                )
                : []),
            ...(Array.isArray(dbpedia)
                ? dbpedia.slice(
                    0,
                    DBPEDIA_SUPPLEMENTAL_LIMIT
                )
                : [])
        ];

    if (!supplemental.length) {
        return;
    }

    const mergedCatalog =
        mergeSupplementalVehicleCatalog(
            kind,
            supplemental
        );

    void writePersistentVehicleCatalog(
        kind,
        mergedCatalog
    );

    if (
        currentVehicleKind === kind &&
        currentVehicleMode === "popular"
    ) {

        currentVehicleCatalog =
            mergedCatalog;

        void continueStablePopularVehicleLoading(
            kind,
            mergedCatalog
        );

    }

}

/*
 * ============================================================
 * POPULARITY
 *
 * VehiclesDB uses global_decile.
 *
 * Lower decile = greater popularity.
 * ============================================================
 */

function getVehiclePopularityValue(
    vehicle
) {

    const rawDecile =
        vehicle?.globalDecile;

    if (
        rawDecile === null ||
        rawDecile === undefined ||
        String(rawDecile).trim() === ""
    ) {

        return 999;

    }

    const value =
        Number(rawDecile);

    return Number.isFinite(value)
        ? value
        : 999;

}


const VEHICLE_KIND_BODY_TYPE_TERMS = {
    motorcycle: [
        "motorcycle", "motorbike", "scooter", "underbone",
        "moped", "motor scooter", "motorized bicycle",
        "motorised bicycle", "trike", "two-wheeler"
    ],
    moped: [
        "moped", "scooter", "motor scooter",
        "motorized bicycle", "motorised bicycle"
    ],
    van: [
        "van", "minivan", "panel van", "cargo van",
        "microvan", "people carrier"
    ],
    truck: [
        "truck", "lorry", "pickup", "heavy truck",
        "tractor unit", "tractor-trailer"
    ],
    bus: [
        "bus", "coach", "transit bus", "city bus",
        "double-decker", "minibus", "shuttle bus"
    ]
};

function normalizeCatalogBodyType(
    value
) {

    return normalizePopularQualityText(
        value
    );
}

function getCatalogVehicleBodyTypes(
    vehicle
) {

    return [
        ...(Array.isArray(vehicle?.bodyTypes)
            ? vehicle.bodyTypes
            : []),
        ...(vehicle?.bodyType
            ? [vehicle.bodyType]
            : [])
    ]
        .map(normalizeCatalogBodyType)
        .filter(Boolean);
}

const VEHICLE_KIND_BODY_TYPE_CONTRADICTIONS = {
    motorcycle: [
        "car", "sedan", "hatchback", "coupe", "suv",
        "sport utility", "van", "truck", "bus"
    ],
    van: [
        "suv", "sport utility", "crossover", "sedan",
        "hatchback", "coupe", "roadster", "convertible",
        "wagon", "pickup", "motorcycle", "moped", "truck", "bus"
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

function isCatalogVehicleKindCompatible(
    vehicle
) {

    const kind =
        normalizeVehicleText(
            vehicle?.kind
        );

    if (!kind || kind === "car") {
        return true;
    }

    const bodyTypes =
        getCatalogVehicleBodyTypes(
            vehicle
        );

    if (!bodyTypes.length) {
        return true;
    }

    const contradictions =
        VEHICLE_KIND_BODY_TYPE_CONTRADICTIONS[kind] ||
        [];

    if (
        contradictions.some(term =>
            bodyTypes.some(bodyType =>
                bodyType.includes(
                    normalizeCatalogBodyType(term)
                )
            )
        )
    ) {
        return false;
    }

    const expectedTerms =
        VEHICLE_KIND_BODY_TYPE_TERMS[kind] ||
        [];

    return expectedTerms.some(term =>
        bodyTypes.some(bodyType =>
            bodyType.includes(
                normalizeCatalogBodyType(term)
            )
        )
    );
}

function getCatalogVehicleKindPriority(
    vehicle
) {

    const kind =
        normalizeVehicleText(
            vehicle?.kind
        );

    const bodyTypes =
        getCatalogVehicleBodyTypes(
            vehicle
        );

    if (!bodyTypes.length) {
        return 1;
    }

    const expectedTerms =
        VEHICLE_KIND_BODY_TYPE_TERMS[kind] ||
        [];

    return expectedTerms.some(term =>
        bodyTypes.some(bodyType =>
            bodyType.includes(
                normalizeCatalogBodyType(term)
            )
        )
    )
        ? 0
        : 2;
}

function getPopularVehicles(
    vehicles
) {

    if (!Array.isArray(vehicles)) {
        return [];
    }

    const rankedVehicles =
        vehicles
            .filter(
                vehicle =>
                    vehicle &&
                    vehicle.model &&
                    isCatalogVehicleKindCompatible(
                        vehicle
                    )
            )
            .sort(
                (a, b) => {

                    const kindPriorityDifference =
                        getCatalogVehicleKindPriority(a) -
                        getCatalogVehicleKindPriority(b);

                    if (kindPriorityDifference !== 0) {
                        return kindPriorityDifference;
                    }

                    return (
                        getVehiclePopularityValue(a) -
                        getVehiclePopularityValue(b)
                    );

                }
            );

    const hasSupplemental =
        rankedVehicles.some(
            vehicle =>
                Boolean(
                    vehicle?.supplementalSource
                )
        );

    if (!hasSupplemental) {

        return rankedVehicles.slice(
            0,
            POPULAR_CANDIDATE_POOL_SIZE
        );

    }

    const baseVehicles =
        rankedVehicles.filter(
            vehicle =>
                !vehicle?.supplementalSource
        );

    const supplementalVehicles =
        rankedVehicles.filter(
            vehicle =>
                Boolean(
                    vehicle?.supplementalSource
                )
        );

    return [
        ...baseVehicles.slice(
            0,
            900
        ),
        ...supplementalVehicles.slice(
            0,
            1200
        )
    ];

}

function getPopularVehicleQualityKey(
    vehicle,
    kind
) {

    return [
        normalizeVehicleText(vehicle?.make),
        normalizeVehicleText(vehicle?.model),
        normalizeVehicleText(kind)
    ].join("|");
}


function normalizePopularQualityText(value) {

    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

}


function getPopularQualityTokens(value) {

    return normalizePopularQualityText(value)
        .split(/\s+/)
        .filter(token => token.length >= 2);

}


function getPopularVehicleIdentityTokens(
    vehicle
) {

    const rawTokens = [
        vehicle?.make,
        vehicle?.model
    ].flatMap(value =>
        normalizePopularQualityText(value)
            .split(/\s+/)
            .filter(Boolean)
    );

    const stopWords = new Set([
        "and", "the", "series", "class", "model", "type",
        "generation", "mk", "mark", "edition", "version",
        "trim", "plus", "luxury", "design", "sport", "limited"
    ]);

    return Array.from(
        new Set(
            rawTokens.filter(token =>
                (
                    token.length >= 2 ||
                    /^\d$/.test(token)
                ) &&
                !stopWords.has(token)
            )
        )
    );

}


function popularQualityTextContainsToken(
    text,
    token
) {

    return (
        token &&
        new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
    );

}


function hasPopularVehicleIdentityMatch(
    details,
    vehicle
) {

    const wikipediaTitle =
        normalizePopularQualityText(
            details?.wikipedia?.title || ""
        );

    const description =
        normalizePopularQualityText(
            details?.wikipedia?.description || ""
        );

    if (!wikipediaTitle && !description) {
        return false;
    }

    const makeTokens =
        getPopularQualityTokens(vehicle?.make);

    const modelText =
        normalizePopularQualityText(
            vehicle?.model || ""
        );

    const modelTokens =
        getPopularVehicleIdentityTokens(vehicle)
            .filter(token =>
                !makeTokens.includes(token)
            );

    if (!modelText || !modelTokens.length) {
        return false;
    }

    const makeMatchInTitle =
        makeTokens.some(token =>
            popularQualityTextContainsToken(
                wikipediaTitle,
                token
            )
        );

    const makeMatchInDescription =
        makeTokens.some(token =>
            popularQualityTextContainsToken(
                description,
                token
            )
        );

    const modelPhraseInTitle =
        modelText.length >= 3 &&
        wikipediaTitle.includes(modelText);

    const modelPhraseInDescription =
        modelText.length >= 3 &&
        description.includes(modelText);

    const modelMatchesInTitle =
        modelTokens.filter(token =>
            popularQualityTextContainsToken(
                wikipediaTitle,
                token
            )
        );

    const modelMatchesInDescription =
        modelTokens.filter(token =>
            popularQualityTextContainsToken(
                description,
                token
            )
        );

    /*
     * Prefer the Wikipedia title as the strongest identity signal, but
     * do not trust a model-only title when that model can also be the
     * name of a sport, place, event, person, or other entity. A make
     * match in the title, or a make + vehicle-context match in the
     * description, is required for such ambiguous titles.
     */
    const descriptionHasVehicleType =
        VEHICLE_DATA_KINDS.some(candidateKind =>
            POPULAR_VEHICLE_TYPE_TERMS[candidateKind].some(term =>
                description.includes(
                    normalizePopularQualityText(term)
                )
            )
        );

    if (
        modelPhraseInTitle &&
        (
            makeMatchInTitle ||
            (
                makeMatchInDescription &&
                descriptionHasVehicleType
            )
        )
    ) {
        return true;
    }

    if (
        makeMatchInTitle &&
        modelMatchesInTitle.length >= 1
    ) {
        return true;
    }

    if (
        modelTokens.length >= 2 &&
        modelMatchesInTitle.length >= 2
    ) {
        return true;
    }

    /*
     * A description-only match is accepted only when the make and
     * model are both explicitly present. This prevents generic pages
     * such as Pikes Peak International Hill Climb from passing a
     * catalog entry such as "Suzuki Al".
     */
    if (
        modelPhraseInDescription &&
        makeMatchInDescription
    ) {
        return true;
    }

    if (
        makeMatchInDescription &&
        modelMatchesInDescription.length >= 1
    ) {
        return true;
    }

    return (
        modelTokens.length >= 2 &&
        modelMatchesInDescription.length >= 2 &&
        makeMatchInDescription
    );
}


function hasExpectedPopularVehicleKindEvidence(
    details,
    vehicle,
    kind
) {

    if (!kind) {
        return true;
    }

    const title =
        normalizePopularQualityText(
            details?.wikipedia?.title || ""
        );

    const description =
        normalizePopularQualityText(
            details?.wikipedia?.description || ""
        );

    const combinedText =
        `${title} ${description}`.trim();

    if (kind !== "car") {

        const expectedTerms =
            POPULAR_VEHICLE_TYPE_TERMS[kind] ||
            [];

        const contradictionTerms =
            POPULAR_VEHICLE_KIND_CONTRADICTION_TERMS[kind] ||
            [];

        const hasExpectedText =
            expectedTerms.some(term =>
                combinedText.includes(
                    normalizePopularQualityText(term)
                )
            );

        const contradictionCount =
            contradictionTerms.filter(term =>
                combinedText.includes(
                    normalizePopularQualityText(term)
                )
            ).length;

        if (
            !hasExpectedText &&
            contradictionCount >= 1
        ) {
            return false;
        }

    }

    const bodyTypes = [
        ...(Array.isArray(details?.vehicle?.body_types)
            ? details.vehicle.body_types
            : []),
        ...(Array.isArray(vehicle?.bodyTypes)
            ? vehicle.bodyTypes
            : [])
    ]
        .map(value =>
            normalizePopularQualityText(value)
        )
        .filter(Boolean);

    const expectedTerms =
        POPULAR_VEHICLE_TYPE_TERMS[kind] ||
        [];

    const hasExpectedText =
        expectedTerms.some(term =>
            combinedText.includes(
                normalizePopularQualityText(term)
            )
        );

    if (hasExpectedText) {
        return true;
    }

    const bodyTypeText =
        bodyTypes.join(" ");

    const hasExpectedBodyType =
        expectedTerms.some(term =>
            bodyTypeText.includes(
                normalizePopularQualityText(term)
            )
        );

    if (hasExpectedBodyType) {
        return true;
    }

    /*
     * An exact Wikipedia title match is a useful last-resort identity
     * signal for records whose summary omits the vehicle type. Only use
     * it when there is no strong contradiction from another vehicle kind.
     */
    const targetTitle =
        normalizePopularQualityText(
            `${vehicle?.make || ""} ${vehicle?.model || ""}`
        );

    /*
     * VehiclesDB already provides the authoritative category. Some
     * Wikipedia summaries (especially for buses, trucks, vans, mopeds
     * and motorcycles) do not explicitly repeat the vehicle type even
     * though the article contains a real vehicle infobox. In that case,
     * two or more technical specification fields are enough to accept
     * the page once the make/model identity has already matched.
     */
    const technicalSpecificationCount =
        getPopularVehicleSpecificationCount(
            details
        );

    if (
        technicalSpecificationCount >=
        POPULAR_MIN_SPECIFICATION_FIELDS
    ) {
        return true;
    }

    const exactTitle =
        title === targetTitle;

    if (!exactTitle) {
        return false;
    }

    const contradictionTerms = {
        motorcycle: ["bus", "truck", "van", "lorry"],
        moped: ["bus", "truck", "van", "lorry", "sedan", "hatchback", "coupe"],
        van: ["bus", "truck", "sedan", "hatchback", "coupe", "roadster"],
        truck: ["bus", "coach", "sedan", "hatchback", "coupe"],
        bus: ["truck", "lorry", "sedan", "hatchback", "coupe"],
        car: ["bus", "coach", "truck", "lorry", "motorcycle", "moped"]
    };

    const contradictions =
        contradictionTerms[kind] || [];

    return !contradictions.some(term =>
        combinedText.includes(
            normalizePopularQualityText(term)
        )
    );
}


function countPopularVehicleTypeTerms(
    details,
    kind
) {

    const text =
        normalizePopularQualityText(
            `${details?.wikipedia?.title || ""} ${details?.wikipedia?.description || ""}`
        );

    const terms =
        POPULAR_VEHICLE_TYPE_TERMS[kind] ||
        POPULAR_VEHICLE_TYPE_TERMS.car;

    return terms.filter(term =>
        text.includes(
            normalizePopularQualityText(term)
        )
    ).length;

}


function countPopularNonVehicleEntityTerms(
    details
) {

    const text =
        normalizePopularQualityText(
            `${details?.wikipedia?.title || ""} ${details?.wikipedia?.description || ""}`
        );

    return POPULAR_NON_VEHICLE_ENTITY_TERMS.filter(term =>
        text.includes(
            normalizePopularQualityText(term)
        )
    ).length;

}


function getPopularVehicleSpecificationCount(
    details
) {

    const specifications =
        details?.specifications || {};

    const technicalKeys = [
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

    return technicalKeys.reduce(
        (count, key) =>
            count +
            (
                isUsefulVehicleDetailValue(
                    specifications[key]
                )
                    ? 1
                    : 0
            ),
        0
    );

}


function getVehicleImageUrlFilename(
    imageUrl
) {

    const url =
        String(imageUrl || "").trim();

    if (!url) {
        return "";
    }

    try {

        const parsed =
            new URL(url);

        return normalizePopularQualityText(
            decodeURIComponent(
                parsed.pathname
                    .split("/")
                    .pop() || ""
            )
        );

    } catch {

        return normalizePopularQualityText(
            url
                .split("/")
                .pop() || ""
        );

    }
}


function getVehicleImageHostname(
    imageUrl
) {

    try {

        return new URL(
            String(imageUrl || "").trim()
        ).hostname.toLowerCase();

    } catch {

        return "";

    }
}


function isAllowedVehicleImageHost(
    imageUrl
) {

    const hostname =
        getVehicleImageHostname(
            imageUrl
        );

    return Boolean(
        hostname &&
        (
            hostname === "wikimedia.org" ||
            hostname.endsWith(".wikimedia.org") ||
            hostname === "wikipedia.org" ||
            hostname.endsWith(".wikipedia.org")
        )
    );
}


function getVehicleImageIdentityTokens(
    value
) {

    const stopWords = new Set([
        "and", "the", "series", "class", "model", "type",
        "generation", "mk", "mark", "edition", "version",
        "trim", "plus", "luxury", "design", "limited"
    ]);

    return Array.from(
        new Set(
            normalizePopularQualityText(value)
                .split(/\s+/)
                .filter(token => token && !stopWords.has(token))
        )
    );
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


function hasVehicleIdentityInImageFilename(
    imageFilename,
    vehicle
) {

    const filename =
        normalizeVehicleImageMatchText(
            imageFilename
        );

    const vehicleName =
        normalizeVehicleImageMatchText(
            `${vehicle?.make || ""} ${vehicle?.model || ""}`
        );

    if (
        !filename ||
        !vehicleName
    ) {
        return false;
    }

    /*
     * Require the complete make + model name as one contiguous
     * normalized phrase in the image filename.
     *
     * Separators such as spaces, underscores, hyphens and other
     * punctuation are normalized to spaces, so names such as:
     *
     *   BMW 3 Series
     *   BMW_3_Series_2019
     *   BMW-3-Series-Touring
     *
     * all match the same vehicle name.
     *
     * Additional text after the exact vehicle name is allowed.
     * Partial make/model token matches are not accepted.
     */
    const escapedVehicleName =
        vehicleName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

    const pattern =
        new RegExp(
            `(?:^|\\s)${escapedVehicleName}`,
            "i"
        );

    return pattern.test(filename);
}


function hasPopularVehicleImageRelevance(
    details,
    vehicle
) {

    const image =
        details?.image;

    const imageUrl =
        String(image?.url || "").trim();

    if (!imageUrl) {
        return false;
    }

    /*
     * Only accept the Wikimedia/Wikipedia image returned by the API.
     * This prevents unrelated third-party image URLs from entering the
     * final validated vehicle list.
     */
    if (!isAllowedVehicleImageHost(imageUrl)) {
        return false;
    }

    const imageFilename =
        getVehicleImageUrlFilename(
            imageUrl
        );

    if (!imageFilename) {
        return false;
    }

    const nonVehicleImageTerms =
        POPULAR_NON_VEHICLE_IMAGE_TERMS.filter(term =>
            imageFilename.includes(
                normalizePopularQualityText(term)
            )
        );

    /*
     * The direct image URL filename is the primary identity check.
     * A generic source/article URL is not enough to prove that the image
     * itself belongs to the requested vehicle.
     */
    if (
        nonVehicleImageTerms.length > 0
    ) {
        return false;
    }

    return hasVehicleIdentityInImageFilename(
        imageFilename,
        vehicle
    );
}


function hasReliableVehicleWikipediaData(
    details,
    vehicle,
    kind = null
) {

    if (!details) {
        return false;
    }

    const title =
        normalizePopularQualityText(
            details?.wikipedia?.title || ""
        );

    const description =
        String(
            details?.wikipedia?.description || ""
        ).trim();

    if (!title || !description) {
        return false;
    }

    if (
        normalizePopularQualityText(description).length < 40
    ) {
        return false;
    }

    if (!hasPopularVehicleIdentityMatch(details, vehicle)) {
        return false;
    }

    if (
        kind &&
        !hasExpectedPopularVehicleKindEvidence(
            details,
            vehicle,
            kind
        )
    ) {
        return false;
    }

    const nonVehicleEntityTermCount =
        countPopularNonVehicleEntityTerms(
            details
        );

    const vehicleTypeTermCount =
        VEHICLE_KINDS.some(candidateKind =>
            countPopularVehicleTypeTerms(
                details,
                candidateKind
            ) > 0
        );

    /*
     * A matching make/model is required above, but several explicit
     * non-vehicle entity signals without any vehicle terminology are an
     * additional reason to reject the page.
     */
    if (
        nonVehicleEntityTermCount >= 2 &&
        !vehicleTypeTermCount
    ) {
        return false;
    }

    return true;
}


function hasUsablePopularVehicleDetails(
    details,
    vehicle,
    kind
) {

    if (!details) {
        return false;
    }

    const wikipediaUrl =
        details?.wikipedia?.url;

    const description =
        details?.wikipedia?.description;

    if (
        !String(wikipediaUrl || "").trim() ||
        !isUsefulVehicleDetailValue(description)
    ) {
        return false;
    }

    if (
        normalizePopularQualityText(description).length <
        POPULAR_MIN_DESCRIPTION_LENGTH
    ) {
        return false;
    }

    const specificationCount =
        getPopularVehicleSpecificationCount(
            details
        );

    if (
        specificationCount <
        POPULAR_MIN_SPECIFICATION_FIELDS
    ) {
        return false;
    }

    const identityMatch =
        hasPopularVehicleIdentityMatch(
            details,
            vehicle
        );

    if (!identityMatch) {
        return false;
    }

    if (!hasReliableVehicleWikipediaData(details, vehicle, kind)) {
        return false;
    }

    const vehicleTypeTermCount =
        countPopularVehicleTypeTerms(
            details,
            kind
        );

    const nonVehicleEntityTermCount =
        countPopularNonVehicleEntityTerms(
            details
        );

    /*
     * A real vehicle page should either mention the expected vehicle
     * type or expose at least one technical vehicle specification.
     * Strong non-vehicle signals without a vehicle signal are rejected.
     */
    if (
        vehicleTypeTermCount === 0 &&
        specificationCount === 0
    ) {
        return false;
    }

    if (
        nonVehicleEntityTermCount >= 2 &&
        vehicleTypeTermCount === 0
    ) {
        return false;
    }

    /*
     * Image availability is intentionally NOT part of vehicle quality.
     * A missing or blocked Wikimedia image must never discard otherwise
     * reliable Wikipedia data.
     */
    return true;
}


function getPopularVehicleQualityState(
    kind,
    candidates
) {

    const signature =
        candidates
            .map(vehicle =>
                getPopularVehicleQualityKey(
                    vehicle,
                    kind
                )
            )
            .join("||");

    const existing =
        popularVehicleQualityState.get(kind);

    if (existing && existing.candidateSignature === signature) {
        return existing;
    }

    if (existing) {

        const existingValidKeys =
            new Set(
                existing.validVehicles.map(vehicle =>
                    getPopularVehicleQualityKey(vehicle, kind)
                )
            );

        const processedKeys =
            new Set(
                existing.candidates
                    .slice(0, existing.nextIndex)
                    .map(vehicle =>
                        getPopularVehicleQualityKey(vehicle, kind)
                    )
            );

        const preservedValidVehicles =
            candidates.filter(vehicle =>
                existingValidKeys.has(
                    getPopularVehicleQualityKey(vehicle, kind)
                )
            );

        const nextIndex =
            candidates.findIndex(vehicle =>
                !processedKeys.has(
                    getPopularVehicleQualityKey(vehicle, kind)
                )
            );

        const state = {
            candidateSignature: signature,
            candidates,
            nextIndex:
                nextIndex >= 0
                    ? nextIndex
                    : candidates.length,
            validVehicles: preservedValidVehicles,
            checkedCount: existing.checkedCount,
            exhausted: false,
            loadingPromise: null
        };

        popularVehicleQualityState.set(kind, state);
        return state;

    }

    const state = {
        candidateSignature: signature,
        candidates,
        nextIndex: 0,
        validVehicles: [],
        checkedCount: 0,
        exhausted: false,
        loadingPromise: null
    };

    popularVehicleQualityState.set(kind, state);
    return state;
}


async function evaluatePopularVehicleCandidate(
    vehicle,
    kind
) {

    const key =
        getPopularVehicleQualityKey(
            vehicle,
            kind
        );

    if (popularVehicleQualityCache.has(key)) {

        return {
            vehicle,
            usable:
                popularVehicleQualityCache.get(key)
        };

    }

    const detailKind =
        vehicle?.sourceKind ||
        kind;

    /*
     * Non-Car initial loads use a single attempt. Failed requests are not
     * cached as permanent failures and will be retried by the background
     * loader, so one slow/failing request does not hold up the first cards.
     * Cars retain the existing two-attempt behavior.
     */
    const details =
        await fetchVehicleDetailsWithRetry(
            vehicle.make,
            vehicle.model,
            detailKind,
            kind === "car"
                ? 2
                : 1,
            kind === "car"
                ? 650
                : 250
        );

    if (!details) {

        return {
            vehicle,
            usable: null
        };

    }

    const usable =
        hasUsablePopularVehicleDetails(
            details,
            vehicle,
            detailKind
        );

    popularVehicleQualityCache.set(
        key,
        usable
    );

    return {
        vehicle,
        usable
    };

}

async function runPopularVehicleQualityBatch(
    batch,
    kind
) {

    const results =
        new Array(batch.length);

    let cursor = 0;

    const workerCount =
        Math.min(
            getPopularDetailsConcurrency(kind),
            batch.length
        );

    const worker =
        async () => {

            while (
                cursor <
                batch.length
            ) {

                const index =
                    cursor++;

                try {

                    results[index] =
                        await evaluatePopularVehicleCandidate(
                            batch[index],
                            kind
                        );

                } catch (error) {

                    console.warn(
                        "Vehicle quality request failed:",
                        batch[index]?.make,
                        batch[index]?.model,
                        kind,
                        error
                    );

                    results[index] = {
                        vehicle:
                            batch[index],
                        usable: null
                    };

                }

            }

        };

    await Promise.all(
        Array.from(
            { length: workerCount },
            () => worker()
        )
    );

    return results;

}


async function collectFastPopularVehicleInformation(
    kind,
    candidates,
    desiredCount = POPULAR_REFRESH_CARD_COUNT,
    maxChecks = POPULAR_REFRESH_MAX_CHECKS
) {

    const safeCandidates =
        Array.isArray(candidates)
            ? candidates.slice(
                0,
                Math.max(
                    desiredCount,
                    Number(maxChecks) || POPULAR_REFRESH_MAX_CHECKS
                )
            )
            : [];

    if (!safeCandidates.length) {
        return [];
    }

    const targetCount = Math.min(desiredCount, safeCandidates.length);
    const validKeys = new Set();
    let cursor = 0;
    let resolved = false;
    let resolveEarly;
    let rejectEarly;

    const earlyPromise = new Promise((resolve, reject) => {
        resolveEarly = resolve;
        rejectEarly = reject;
    });

    const finish = () => {
        if (resolved) return;
        resolved = true;
        resolveEarly(
            safeCandidates
                .filter(vehicle =>
                    validKeys.has(getPopularVehicleQualityKey(vehicle, kind))
                )
                .slice(0, targetCount)
        );
    };

    const worker = async () => {
        while (!resolved) {
            const index = cursor++;
            if (index >= safeCandidates.length) break;

            const vehicle = safeCandidates[index];
            try {
                const result = await evaluatePopularVehicleCandidate(vehicle, kind);
                if (result?.usable === true) {
                    validKeys.add(getPopularVehicleQualityKey(result.vehicle, kind));
                    if (validKeys.size >= targetCount) finish();
                }
            } catch (error) {
                console.warn(
                    "Fast popular vehicle refresh request failed:",
                    vehicle?.make, vehicle?.model, kind, error
                );
            }
        }
    };

    const workerCount = Math.min(POPULAR_REFRESH_CONCURRENCY, safeCandidates.length);

    void Promise.all(
        Array.from({ length: workerCount }, () => worker())
    ).then(() => {
        if (!resolved) finish();
    }).catch(error => {
        if (!resolved) {
            resolved = true;
            rejectEarly(error);
        }
    });

    return earlyPromise;
}


function mergePopularValidVehiclesIntoState(
    kind,
    candidates,
    vehicles
) {

    if (!Array.isArray(vehicles) || !vehicles.length) return;

    const state = getPopularVehicleQualityState(kind, candidates);
    const existingKeys = new Set(
        state.validVehicles.map(vehicle =>
            getPopularVehicleQualityKey(vehicle, kind)
        )
    );

    for (const vehicle of vehicles) {
        const key = getPopularVehicleQualityKey(vehicle, kind);
        if (!existingKeys.has(key)) {
            state.validVehicles.push(vehicle);
            existingKeys.add(key);
        }
    }

    const validKeys = new Set(
        state.validVehicles.map(vehicle =>
            getPopularVehicleQualityKey(vehicle, kind)
        )
    );

    state.validVehicles = state.candidates.filter(vehicle =>
        validKeys.has(getPopularVehicleQualityKey(vehicle, kind))
    );
}


async function readPersistentPopularVehicles(
    kind
) {

    if (kind === "car") {
        return [];
    }

    try {

        const cache =
            await caches.open(
                "worth-it-cars-popular-" +
                VEHICLE_PERSISTENT_POPULAR_VERSION
            );

        const response =
            await cache.match(
                "https://worth-it-cars-cache.local/popular/" +
                kind
            );

        if (!response) {
            return [];
        }

        const payload =
            await response.json();

        const savedAt =
            Number(payload?.savedAt || 0);

        if (
            payload?.version !==
                VEHICLE_PERSISTENT_POPULAR_VERSION ||
            !Array.isArray(payload?.vehicles) ||
            !Number.isFinite(savedAt) ||
            Date.now() - savedAt >
                VEHICLE_PERSISTENT_CATEGORY_TTL_MS
        ) {
            return [];
        }

        return payload.vehicles;

    } catch (error) {

        console.warn(
            "Persistent popular vehicle cache read skipped:",
            kind,
            error
        );

        return [];

    }

}

async function writePersistentPopularVehicles(
    kind,
    vehicles
) {

    if (
        kind === "car" ||
        !Array.isArray(vehicles) ||
        !vehicles.length
    ) {
        return;
    }

    try {

        const compactVehicles =
            vehicles
                .slice(
                    0,
                    MAX_VEHICLES_PER_CATEGORY
                )
                .map(vehicle => ({
                    make:
                        vehicle?.make || "",
                    model:
                        vehicle?.model || "",
                    kind:
                        vehicle?.kind || kind,
                    sourceKind:
                        vehicle?.sourceKind ||
                        vehicle?.kind ||
                        kind,
                    supplementalSource:
                        vehicle?.supplementalSource ||
                        null,
                    wikipediaTitle:
                        vehicle?.wikipediaTitle ||
                        null,
                    bodyType:
                        vehicle?.bodyType ||
                        null,
                    bodyTypes:
                        Array.isArray(vehicle?.bodyTypes)
                            ? vehicle.bodyTypes
                            : [],
                    globalDecile:
                        vehicle?.globalDecile ??
                        null,
                    availability:
                        Array.isArray(vehicle?.availability)
                            ? vehicle.availability
                            : [],
                    yearStart:
                        vehicle?.yearStart ??
                        null,
                    yearEnd:
                        vehicle?.yearEnd ??
                        null
                }))
                .filter(
                    vehicle =>
                        vehicle.make &&
                        vehicle.model
                );

        const cache =
            await caches.open(
                "worth-it-cars-popular-" +
                VEHICLE_PERSISTENT_POPULAR_VERSION
            );

        await cache.put(
            "https://worth-it-cars-cache.local/popular/" +
            kind,
            new Response(
                JSON.stringify({
                    version:
                        VEHICLE_PERSISTENT_POPULAR_VERSION,
                    savedAt:
                        Date.now(),
                    vehicles:
                        compactVehicles
                }),
                {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "application/json; charset=UTF-8"
                    }
                }
            )
        );

    } catch (error) {

        console.warn(
            "Persistent popular vehicle cache write skipped:",
            kind,
            error
        );

    }

}

async function restorePersistentPopularVehicles(
    kind,
    candidates
) {

    if (
        kind === "car" ||
        !Array.isArray(candidates) ||
        !candidates.length
    ) {
        return 0;
    }

    const stored =
        await readPersistentPopularVehicles(
            kind
        );

    if (!stored.length) {
        return 0;
    }

    const state =
        getPopularVehicleQualityState(
            kind,
            candidates
        );

    const candidateKeys =
        new Set(
            candidates.map(
                vehicle =>
                    getPopularVehicleQualityKey(
                        vehicle,
                        kind
                    )
            )
        );

    const restoredKeys =
        new Set(
            stored
                .map(
                    vehicle =>
                        getPopularVehicleQualityKey(
                            vehicle,
                            kind
                        )
                )
                .filter(
                    key =>
                        candidateKeys.has(key)
                )
        );

    for (const key of restoredKeys) {
        popularVehicleQualityCache.set(
            key,
            true
        );
    }

    state.validVehicles =
        candidates.filter(
            vehicle =>
                restoredKeys.has(
                    getPopularVehicleQualityKey(
                        vehicle,
                        kind
                    )
                )
        );

    return state.validVehicles.length;

}

async function ensurePopularVehicleQuality(
    kind,
    catalogVehicles,
    desiredCount,
    maxNewChecks,
    onProgress = null
) {

    const candidates =
        getPopularVehicles(
            catalogVehicles
        );

    if (!candidates.length) {
        return [];
    }

    const state =
        getPopularVehicleQualityState(
            kind,
            candidates
        );

    if (
        state.validVehicles.length >= desiredCount ||
        state.exhausted
    ) {

        if (
            kind !== "car" &&
            state.validVehicles.length
        ) {
            void writePersistentPopularVehicles(
                kind,
                state.validVehicles
            );
        }

        return state.validVehicles.slice(
            0,
            desiredCount
        );

    }

    if (state.loadingPromise) {

        await state.loadingPromise;

        return state.validVehicles.slice(
            0,
            desiredCount
        );

    }

    state.loadingPromise =
        (async () => {

            let newChecks = 0;

            try {

                while (
                    state.nextIndex <
                        state.candidates.length &&
                    state.validVehicles.length <
                        desiredCount &&
                    newChecks <
                        maxNewChecks
                ) {

                    const batch =
                        state.candidates.slice(
                            state.nextIndex,
                            Math.min(
                                state.nextIndex +
                                    getPopularQualityBatchSize(
                                        kind
                                    ),
                                state.candidates.length
                            )
                        );

                    state.nextIndex +=
                        batch.length;

                    newChecks +=
                        batch.length;

                    state.checkedCount +=
                        batch.length;

                    const results =
                        await runPopularVehicleQualityBatch(
                            batch,
                            kind
                        );

                    for (
                        const result
                        of results
                    ) {

                        if (
                            result.usable !== true
                        ) {
                            continue;
                        }

                        const key =
                            getPopularVehicleQualityKey(
                                result.vehicle,
                                kind
                            );

                        if (
                            !state.validVehicles.some(
                                existing =>
                                    getPopularVehicleQualityKey(
                                        existing,
                                        kind
                                    ) === key
                            )
                        ) {

                            state.validVehicles.push(
                                result.vehicle
                            );

                        }

                    }

                    const validKeys =
                        new Set(
                            state.validVehicles.map(
                                vehicle =>
                                    getPopularVehicleQualityKey(
                                        vehicle,
                                        kind
                                    )
                            )
                        );

                    state.validVehicles =
                        state.candidates.filter(
                            vehicle =>
                                validKeys.has(
                                    getPopularVehicleQualityKey(
                                        vehicle,
                                        kind
                                    )
                                )
                        );

                    if (
                        typeof onProgress === "function"
                    ) {

                        await onProgress(
                            state.validVehicles.slice(),
                            state
                        );

                    }

                }

                if (
                    state.nextIndex >=
                    state.candidates.length
                ) {
                    state.exhausted = true;
                }

            } finally {

                state.loadingPromise =
                    null;

            }

        })();

    await state.loadingPromise;

    if (
        kind !== "car" &&
        state.validVehicles.length
    ) {

        void writePersistentPopularVehicles(
            kind,
            state.validVehicles
        );

    }

    return state.validVehicles.slice(
        0,
        desiredCount
    );

}

/*
 * ============================================================
 * STABLE POPULAR DISPLAY
 *
 * Validate vehicle information first. Only validated vehicles are
 * turned into cards. The first two rows are therefore immutable while
 * details/images continue loading.
 * ============================================================
 */

function getStablePopularDisplayState(
    kind
) {

    return popularVehicleHydrationState.get(
        `stable-display:${kind}`
    ) || null;

}


function hideOrShowStablePopularCards(
    kind,
    showAll = false
) {

    const grid =
        document.getElementById(
            "popularCarsGrid"
        );

    if (!grid) {
        return;
    }

    const cards =
        Array.from(
            grid.querySelectorAll(
                ".car-card[data-popular-stable-card=\"true\"]"
            )
        );

    const visibleLimit =
        Math.max(
            1,
            getVehiclesPerRow() *
            INITIAL_VISIBLE_ROWS
        );

    cards.forEach(
        (card, index) => {

            const shouldShow =
                showAll ||
                index < visibleLimit;

            card.style.display =
                shouldShow
                    ? ""
                    : "none";

            card.dataset.popularDeferred =
                shouldShow
                    ? "false"
                    : "true";

        }
    );

}


function appendStablePopularVehicleCards(
    kind,
    vehicles,
    showAll = false
) {

    const grid =
        document.getElementById(
            "popularCarsGrid"
        );

    if (
        !grid ||
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular"
    ) {
        return;
    }

    const displayState =
        getStablePopularDisplayState(
            kind
        );

    if (!displayState) {
        return;
    }

    displayState.showAll =
        Boolean(showAll);

    const existingCards =
        grid.querySelectorAll(
            ".car-card[data-popular-stable-card=\"true\"]"
        ).length;

    const visibleLimit =
        Math.max(
            1,
            getVehiclesPerRow() *
            INITIAL_VISIBLE_ROWS
        );

    const fragment =
        document.createDocumentFragment();

    let appendedCount = 0;

    for (const vehicle of vehicles) {

        const key =
            getPopularVehicleQualityKey(
                vehicle,
                kind
            );

        if (
            displayState.renderedKeys.has(key)
        ) {
            continue;
        }

        const card =
            createVehicleCard(
                vehicle,
                kind
            );

        card.dataset.popularStableCard =
            "true";

        displayState.renderedKeys.add(
            key
        );

        const shouldShow =
            showAll ||
            (
                existingCards +
                appendedCount
            ) < visibleLimit;

        card.style.display =
            shouldShow
                ? ""
                : "none";

        card.dataset.popularDeferred =
            shouldShow
                ? "false"
                : "true";

        fragment.appendChild(
            card
        );

        appendedCount++;
    }

    if (fragment.childNodes.length) {
        grid.appendChild(
            fragment
        );
    }

    refreshStablePopularResults(
        kind
    );

    hideOrShowStablePopularCards(
        kind,
        showAll
    );

}


function refreshStablePopularResults(
    kind
) {

    const displayState =
        getStablePopularDisplayState(
            kind
        );

    const qualityState =
        popularVehicleQualityState.get(
            kind
        );

    if (
        !displayState ||
        !qualityState
    ) {
        currentVehicleResults = [];
        return;
    }

    currentVehicleResults =
        qualityState.validVehicles.filter(
            vehicle =>
                displayState.renderedKeys.has(
                    getPopularVehicleQualityKey(
                        vehicle,
                        kind
                    )
                )
        );

}


async function continueStablePopularVehicleLoading(
    kind,
    candidates
) {

    try {

        await ensurePopularVehicleQuality(
            kind,
            candidates,
            MAX_VEHICLES_PER_CATEGORY,
            getPopularMaxNewChecks(kind),
            async validVehicles => {

                if (
                    currentVehicleKind !== kind ||
                    currentVehicleMode !== "popular"
                ) {
                    return;
                }

                const currentDisplayState =
                    getStablePopularDisplayState(
                        kind
                    );

                if (!currentDisplayState) {
                    return;
                }

                appendStablePopularVehicleCards(
                    kind,
                    validVehicles,
                    currentDisplayState.showAll
                );

            }
        );

    } catch (error) {

        console.error(
            "Background popular vehicle loading failed:",
            kind,
            error
        );

    }

}


function startStablePopularVehicleDisplay(
    kind,
    showAll = false
) {

    const previous =
        getStablePopularDisplayState(
            kind
        );

    if (previous) {
        previous.cancelled = true;
    }

    const state = {
        kind,
        renderedKeys: new Set(),
        showAll: Boolean(showAll),
        cancelled: false
    };

    popularVehicleHydrationState.set(
        `stable-display:${kind}`,
        state
    );

    return state;

}



async function refreshPopularVehicleCategory(
    kind,
    refreshButton = null
) {

    if (currentVehicleKind !== kind || currentVehicleMode !== "popular") return;

    const grid = document.getElementById("popularCarsGrid");
    if (!grid) return;

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add("is-loading");
    }

    currentVehicleShowAll = false;

    const oldQualityState = popularVehicleQualityState.get(kind);
    const oldValidVehicles = Array.isArray(oldQualityState?.validVehicles)
        ? oldQualityState.validVehicles.slice()
        : [];

    const oldDisplayState = getStablePopularDisplayState(kind);
    if (oldDisplayState) oldDisplayState.cancelled = true;

    const displayState = startStablePopularVehicleDisplay(kind, false);

    /*
     * Refresh must never blank a category while new requests are running.
     * Reuse already validated vehicles immediately, then refresh the
     * catalog/details in the background. This is especially important for
     * smaller categories such as Buses and Trucks.
     */
    const immediateVehicles = oldValidVehicles.slice(
        0,
        POPULAR_REFRESH_CARD_COUNT
    );

    if (immediateVehicles.length) {
        grid.innerHTML = "";
        appendStablePopularVehicleCards(
            kind,
            immediateVehicles,
            false
        );

        hideOrShowStablePopularCards(kind, false);
    }

    try {
        /*
         * Fetch a fresh lightweight catalog. Existing Cards behavior is
         * unchanged; this is only the explicit user-triggered refresh.
         */
        const freshCatalog = await fetchFreshVehicleCatalog(kind);

        if (freshCatalog.length) {
            let refreshedCatalog = freshCatalog;

            const cachedWikidata = supplementalVehicleCatalogCache.get(kind) || [];
            const cachedDbpedia = dbpediaVehicleCatalogCache.get(kind) || [];

            vehicleCatalogCache.set(kind, refreshedCatalog);

            if (kind !== "car" && (cachedWikidata.length || cachedDbpedia.length)) {
                refreshedCatalog = mergeSupplementalVehicleCatalog(
                    kind,
                    [
                        ...cachedWikidata.slice(0, WIKIDATA_SUPPLEMENTAL_LIMIT),
                        ...cachedDbpedia.slice(0, DBPEDIA_SUPPLEMENTAL_LIMIT)
                    ]
                );
            }

            currentVehicleCatalog = refreshedCatalog;
        }

        const candidates = getPopularVehicles(currentVehicleCatalog);

        if (!candidates.length) {
            if (!immediateVehicles.length) {
                grid.innerHTML =
                    '<div class="cars-empty-state">' +
                        '<div class="cars-empty-icon">' +
                            getVehicleKindInfo(kind).icon +
                        '</div>' +
                        '<strong>No vehicle information available</strong>' +
                        '<p>No reliable vehicle information is currently available.</p>' +
                    '</div>';
            }
            return;
        }

        const targetCount = Math.min(
            POPULAR_REFRESH_CARD_COUNT,
            Math.max(
                1,
                getVehiclesPerRow() * INITIAL_VISIBLE_ROWS
            ),
            candidates.length
        );

        const validVehicles = await ensurePopularVehicleQuality(
            kind,
            candidates,
            targetCount,
            kind === "car"
                ? Math.max(POPULAR_SHOW_ALL_MAX_NEW_CHECKS, 48)
                : POPULAR_REFRESH_MAX_CHECKS,
            async nextValidVehicles => {
                if (
                    currentVehicleKind !== kind ||
                    currentVehicleMode !== "popular" ||
                    displayState.cancelled
                ) return;

                const firstEight = nextValidVehicles.slice(
                    0,
                    POPULAR_REFRESH_CARD_COUNT
                );

                if (!firstEight.length) return;

                if (!grid.querySelector('.car-card[data-popular-stable-card="true"]')) {
                    grid.innerHTML = "";
                    appendStablePopularVehicleCards(kind, firstEight, false);
                } else {
                    appendStablePopularVehicleCards(kind, firstEight, false);
                }

                hideOrShowStablePopularCards(kind, false);
            }
        );

        if (
            currentVehicleKind !== kind ||
            currentVehicleMode !== "popular" ||
            displayState.cancelled
        ) return;

        const firstEight = validVehicles.slice(
            0,
            POPULAR_REFRESH_CARD_COUNT
        );

        if (firstEight.length) {
            if (!grid.querySelector('.car-card[data-popular-stable-card="true"]')) {
                grid.innerHTML = "";
            }

            appendStablePopularVehicleCards(kind, firstEight, false);

            const visibleCount = Math.min(
                POPULAR_REFRESH_CARD_COUNT,
                Math.max(1, getVehiclesPerRow() * INITIAL_VISIBLE_ROWS)
            );

            renderVehicleExpandButton(
                firstEight,
                firstEight.slice(0, visibleCount),
                kind,
                stablePopularHasMoreVehicles(kind, visibleCount)
            );

            hideOrShowStablePopularCards(kind, false);

            void continueStablePopularVehicleLoading(kind, candidates);
            void enrichVehicleCategoryWithSupplementalSources(kind);
        }

    } catch (error) {
        console.error("Popular vehicle refresh failed:", kind, error);

        /*
         * Keep already validated cards on screen when a refresh request
         * fails. A refresh must not turn a working category into an empty
         * state because of a temporary network/API problem.
         */
        if (
            !grid.querySelector('.car-card[data-popular-stable-card="true"]') &&
            immediateVehicles.length
        ) {
            appendStablePopularVehicleCards(
                kind,
                immediateVehicles,
                false
            );
            hideOrShowStablePopularCards(kind, false);
        }

    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("is-loading");
        }
    }
}

async function loadAndRenderNonCarPopularVehicles(
    kind,
    showAll = false
) {

    if (
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular"
    ) {
        return;
    }

    const catalogVehicles =
        Array.isArray(currentVehicleCatalog)
            ? currentVehicleCatalog
            : [];

    let candidates =
        getPopularVehicles(
            catalogVehicles
        );

    const grid =
        document.getElementById(
            "popularCarsGrid"
        );

    if (!grid) {
        return;
    }

    if (!candidates.length) {

        grid.innerHTML =
            '<div class="cars-empty-state">' +
            '<div class="cars-empty-icon">' +
            escapeVehicleHtml(
                getVehicleKindInfo(kind).icon
            ) +
            '</div>' +
            '<strong>Loading ' +
            escapeVehicleHtml(
                getVehicleKindInfo(kind).plural.toLowerCase()
            ) +
            '...</strong>' +
            '<p>Preparing vehicle data.</p>' +
            '</div>';

        void enrichVehicleCategoryWithSupplementalSources(
            kind
        ).then(
            () => {
                if (
                    currentVehicleKind === kind &&
                    currentVehicleMode === "popular"
                ) {
                    currentVehicleCatalog =
                        vehicleCatalogCache.get(kind) || [];

                    void loadAndRenderNonCarPopularVehicles(
                        kind,
                        false
                    );
                }
            }
        );

        return;
    }

    await restorePersistentPopularVehicles(
        kind,
        candidates
    );

    candidates =
        getPopularVehicles(
            vehicleCatalogCache.get(kind) ||
            catalogVehicles
        );

    const existingState =
        getStablePopularDisplayState(
            kind
        );

    if (
        showAll &&
        existingState &&
        !existingState.cancelled
    ) {

        existingState.showAll = true;

        hideOrShowStablePopularCards(
            kind,
            true
        );

        const allValid =
            await ensurePopularVehicleQuality(
                kind,
                candidates,
                MAX_VEHICLES_PER_CATEGORY,
                getPopularMaxNewChecks(kind)
            );

        if (
            currentVehicleKind !== kind ||
            currentVehicleMode !== "popular" ||
            existingState.cancelled
        ) {
            return;
        }

        appendStablePopularVehicleCards(
            kind,
            allValid,
            true
        );

        renderVehicleCollapseButton(
            kind
        );

        return;

    }

    const displayState =
        startStablePopularVehicleDisplay(
            kind,
            showAll
        );

    grid.innerHTML = "";

    const initialCount =
        Math.max(
            1,
            getVehiclesPerRow() *
            INITIAL_VISIBLE_ROWS
        );

    const targetCount =
        showAll
            ? MAX_VEHICLES_PER_CATEGORY
            : initialCount;

    const validVehicles =
        await ensurePopularVehicleQuality(
            kind,
            candidates,
            targetCount,
            showAll
                ? getPopularMaxNewChecks(kind)
                : getPopularInitialCheckLimit(kind)
        );

    if (
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular" ||
        displayState.cancelled
    ) {
        return;
    }

    if (!validVehicles.length) {

        grid.innerHTML =
            '<div class="cars-empty-state">' +
            '<div class="cars-empty-icon">' +
            escapeVehicleHtml(
                getVehicleKindInfo(kind).icon
            ) +
            '</div>' +
            '<strong>Still checking ' +
            escapeVehicleHtml(
                getVehicleKindInfo(kind).plural.toLowerCase()
            ) +
            '...</strong>' +
            '<p>Checking Wikipedia and additional open vehicle datasets for reliable information.</p>' +
            '</div>';

        void continueStablePopularVehicleLoading(
            kind,
            candidates
        );

        void enrichVehicleCategoryWithSupplementalSources(
            kind
        );

        return;
    }

    currentVehicleShowAll =
        Boolean(showAll);

    displayState.showAll =
        Boolean(showAll);

    appendStablePopularVehicleCards(
        kind,
        validVehicles,
        showAll
    );

    void writePersistentPopularVehicles(
        kind,
        validVehicles
    );

    if (!showAll) {

        renderVehicleExpandButton(
            validVehicles,
            validVehicles.slice(
                0,
                initialCount
            ),
            kind,
            stateHasMorePopularVehicleCandidates(
                kind
            )
        );

        hideOrShowStablePopularCards(
            kind,
            false
        );

        void continueStablePopularVehicleLoading(
            kind,
            candidates
        );

        void enrichVehicleCategoryWithSupplementalSources(
            kind
        );

    } else {

        hideOrShowStablePopularCards(
            kind,
            true
        );

        renderVehicleCollapseButton(
            kind
        );

    }

}

async function loadAndRenderPopularVehicles(
    kind,
    showAll = false
) {

    if (kind !== "car") {
        return loadAndRenderNonCarPopularVehicles(
            kind,
            showAll
        );
    }

    if (
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular"
    ) {
        return;
    }

    const catalogVehicles =
        Array.isArray(currentVehicleCatalog)
            ? currentVehicleCatalog
            : [];

    const candidates =
        getPopularVehicles(
            catalogVehicles
        ).slice(
            0,
            POPULAR_CANDIDATE_POOL_SIZE
        );

    const grid =
        document.getElementById(
            "popularCarsGrid"
        );

    if (!grid) {
        return;
    }

    if (!candidates.length) {

        renderVehicleCards(
            [],
            kind,
            showAll
        );

        return;
    }

    /*
     * Show All from a populated category: keep already validated cards
     * on screen, reveal them immediately, and finish the background scan.
     */
    const existingDisplayState =
        getStablePopularDisplayState(
            kind
        );

    if (
        showAll &&
        existingDisplayState &&
        !existingDisplayState.cancelled
    ) {

        currentVehicleShowAll = true;
        existingDisplayState.showAll = true;

        hideOrShowStablePopularCards(
            kind,
            true
        );

        const allValidVehicles =
            await ensurePopularVehicleQuality(
                kind,
                candidates,
                Math.min(
                    MAX_VEHICLES_PER_CATEGORY,
                    candidates.length
                ),
                POPULAR_SHOW_ALL_MAX_NEW_CHECKS,
                async validVehicles => {

                    if (
                        currentVehicleKind !== kind ||
                        currentVehicleMode !== "popular"
                    ) {
                        return;
                    }

                    appendStablePopularVehicleCards(
                        kind,
                        validVehicles,
                        true
                    );

                }
            );

        if (
            currentVehicleKind !== kind ||
            currentVehicleMode !== "popular" ||
            existingDisplayState.cancelled
        ) {
            return;
        }

        appendStablePopularVehicleCards(
            kind,
            allValidVehicles,
            true
        );

        hideOrShowStablePopularCards(
            kind,
            true
        );

        refreshStablePopularResults(
            kind
        );

        renderVehicleCollapseButton(
            kind
        );

        return;

    }

    const displayState =
        startStablePopularVehicleDisplay(
            kind,
            showAll
        );

    grid.innerHTML = "";

    const initialCount =
        Math.min(
            MAX_VEHICLES_PER_CATEGORY,
            Math.max(
                1,
                getVehiclesPerRow() *
                INITIAL_VISIBLE_ROWS
            )
        );

    const targetCount =
        showAll
            ? Math.min(
                MAX_VEHICLES_PER_CATEGORY,
                candidates.length
            )
            : initialCount;

    /*
     * Validate before creating cards. The names in the first two rows
     * therefore cannot change because of later image/detail requests.
     */
    const validVehicles =
        await ensurePopularVehicleQuality(
            kind,
            candidates,
            targetCount,
            Math.max(
                POPULAR_SHOW_ALL_MAX_NEW_CHECKS,
                48
            )
        );

    if (
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular" ||
        displayState.cancelled
    ) {
        return;
    }

    if (!validVehicles.length) {

        /*
         * A first Wikipedia/Cloudflare wave can fail transiently, especially
         * when this is the first category opened after a cold page load.
         * Reset only this category's quality state and retry a small fresh
         * window before ever telling the user that the category is empty.
         */
        const retryKey =
            `quality-retry:${kind}`;

        const alreadyRetried =
            popularVehicleHydrationState.get(
                retryKey
            );

        if (!alreadyRetried) {

            popularVehicleHydrationState.set(
                retryKey,
                true
            );

            await new Promise(
                resolve =>
                    window.setTimeout(
                        resolve,
                        900
                    )
            );

            const refreshedCandidates =
                getPopularVehicles(
                    catalogVehicles
                ).slice(
                    0,
                    POPULAR_CANDIDATE_POOL_SIZE
                );

            popularVehicleQualityState.delete(
                kind
            );

            const retryVehicles =
                await ensurePopularVehicleQuality(
                    kind,
                    refreshedCandidates,
                    initialCount,
                    80
                );

            if (
                currentVehicleKind === kind &&
                currentVehicleMode === "popular" &&
                !displayState.cancelled &&
                retryVehicles.length
            ) {

                currentVehicleShowAll =
                    false;

                displayState.showAll =
                    false;

                appendStablePopularVehicleCards(
                    kind,
                    retryVehicles,
                    false
                );

                renderVehicleExpandButton(
                    retryVehicles,
                    retryVehicles.slice(
                        0,
                        initialCount
                    ),
                    kind,
                    stablePopularHasMoreVehicles(
                        kind,
                        initialCount
                    )
                );

                hideOrShowStablePopularCards(
                    kind,
                    false
                );

                void continueStablePopularVehicleLoading(
                    kind,
                    refreshedCandidates
                );

                return;

            }

        }

        grid.innerHTML = `
            <div class="cars-empty-state">
                <div class="cars-empty-icon">
                    ${getVehicleKindInfo(kind).icon}
                </div>
                <strong>
                    No vehicle information available
                </strong>
                <p>
                    No reliable Wikipedia specifications were found in the current VehiclesDB candidates.
                </p>
            </div>
        `;

        currentVehicleResults = [];
        return;

    }

    currentVehicleShowAll =
        Boolean(showAll);

    displayState.showAll =
        Boolean(showAll);

    appendStablePopularVehicleCards(
        kind,
        validVehicles,
        showAll
    );

    if (!showAll) {

        /*
         * Show All remains available immediately; the rest of the category
         * is validated and appended invisibly below the first two rows.
         */
        renderVehicleExpandButton(
            validVehicles,
            validVehicles.slice(
                0,
                initialCount
            ),
            kind,
            stablePopularHasMoreVehicles(
                kind,
                initialCount
            )
        );

        hideOrShowStablePopularCards(
            kind,
            false
        );

        void continueStablePopularVehicleLoading(
            kind,
            candidates
        );

        /*
         * Expand the searchable/popular candidate pool in the background.
         * Existing VehiclesDB cards stay unchanged while Wikidata fills
         * additional candidates at the end of the catalogue.
         */
        void enrichVehicleCategoryWithSupplementalSources(
            kind
        );

    } else {

        hideOrShowStablePopularCards(
            kind,
            true
        );

        renderVehicleCollapseButton(
            kind
        );

    }

}


function stateHasMorePopularVehicleCandidates(
    kind
) {

    const state =
        popularVehicleQualityState.get(kind);

    return Boolean(
        state &&
        !state.exhausted &&
        state.nextIndex < state.candidates.length
    );
}


/*
 * ============================================================
 * SEARCH
 * ============================================================
 */

function searchVehicleCatalog(
    vehicles,
    query
) {

    const normalizedQuery =
        normalizeVehicleText(
            query
        );


    if (!normalizedQuery) {

        return getPopularVehicles(
            vehicles
        );

    }


    const results =
        vehicles.filter(
            vehicle => {

                const text =
                    normalizeVehicleText(
                        `${vehicle.make} ${vehicle.model} ${vehicle.bodyType || ""}`
                    );

                return text.includes(
                    normalizedQuery
                );

            }
        );


    return results.slice(
        0,
        MAX_SEARCH_RESULTS
    );

}


/*
 * ============================================================
 * CALCULATE VEHICLES FOR 3 ROWS
 * ============================================================
 */

function getVehiclesPerRow() {

    const grid =
        document.getElementById(
            "popularCarsGrid"
        );


    if (!grid) {

        return 4;

    }


    const styles =
        window.getComputedStyle(
            grid
        );


    const columns =
        styles.gridTemplateColumns;


    if (
        columns &&
        columns !== "none"
    ) {

        const count =
            columns
                .split(" ")
                .filter(Boolean)
                .length;


        if (count > 0) {

            return count;

        }

    }


    const cards =
        grid.querySelectorAll(
            ".car-card"
        );


    if (cards.length > 1) {

        const firstTop =
            cards[0]
                .getBoundingClientRect()
                .top;


        let count = 0;


        for (
            const card of cards
        ) {

            if (
                Math.abs(
                    card
                        .getBoundingClientRect()
                        .top -
                    firstTop
                ) < 2
            ) {

                count++;

            }

        }


        if (count > 0) {

            return count;

        }

    }


    return 4;

}


function getInitialVehicleLimit(
    vehicles
) {

    if (
        !Array.isArray(vehicles) ||
        !vehicles.length
    ) {

        return 0;

    }


    const perRow =
        getVehiclesPerRow();


    return Math.min(
        vehicles.length,
        perRow * INITIAL_VISIBLE_ROWS
    );

}


/*
 * ============================================================
 * SHOW ALL / SHOW LESS BUTTON
 * ============================================================
 */

function stablePopularHasMoreVehicles(
    kind,
    visibleCount
) {

    const qualityState =
        popularVehicleQualityState.get(
            kind
        );

    if (!qualityState) {
        return false;
    }

    if (
        qualityState.validVehicles.length >
        visibleCount
    ) {
        return true;
    }

    return Boolean(
        !qualityState.exhausted &&
        qualityState.nextIndex <
        qualityState.candidates.length
    );

}


function renderVehicleExpandButton(
    totalVehicles,
    visibleVehicles,
    kind,
    hasMore = false
) {

    const existing =
        document.getElementById(
            "carsVehicleExpandButton"
        );


    if (existing) {

        existing.remove();

    }


    if (
        !Array.isArray(totalVehicles) ||
        (
            totalVehicles.length <=
            visibleVehicles.length &&
            !hasMore
        )
    ) {

        return;

    }


    const info =
        getVehicleKindInfo(
            kind
        );


    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.id =
        "carsVehicleExpandButton";


    wrapper.className =
        "cars-expand-wrapper";


    const button =
        document.createElement(
            "button"
        );


    button.type =
        "button";


    button.className =
        "cars-expand-button";


    button.textContent =
        `Show all ${info.plural.toLowerCase()} ↓`;


    button.addEventListener(
        "click",
        async () => {

            button.disabled = true;
            button.textContent =
                "Loading more vehicles…";

            currentVehicleShowAll =
                true;

            try {

                await loadAndRenderPopularVehicles(
                    kind,
                    true
                );

            } catch (error) {

                console.error(
                    "Show all vehicles error:",
                    error
                );

                currentVehicleShowAll =
                    false;

                button.disabled = false;
                button.textContent =
                    `Show all ${info.plural.toLowerCase()} ↓`;

            }

        }
    );


    wrapper.appendChild(
        button
    );


    const grid =
        document.getElementById(
            "popularCarsGrid"
        );


    if (
        grid &&
        grid.parentNode
    ) {

        grid.parentNode.insertBefore(
            wrapper,
            grid.nextSibling
        );

    }

}


function renderVehicleCollapseButton(
    kind
) {

    const existing =
        document.getElementById(
            "carsVehicleExpandButton"
        );


    if (existing) {

        existing.remove();

    }


    const info =
        getVehicleKindInfo(
            kind
        );


    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.id =
        "carsVehicleExpandButton";


    wrapper.className =
        "cars-expand-wrapper";


    const button =
        document.createElement(
            "button"
        );


    button.type =
        "button";


    button.className =
        "cars-expand-button";


    button.textContent =
        `Show less ${info.plural.toLowerCase()} ↑`;


    button.addEventListener(
        "click",
        () => {

            currentVehicleShowAll =
                false;

            const stableDisplayState =
                getStablePopularDisplayState(
                    kind
                );

            if (
                stableDisplayState
            ) {

                stableDisplayState.showAll =
                    false;

                hideOrShowStablePopularCards(
                    kind,
                    false
                );

                renderVehicleExpandButton(
                    currentVehicleResults,
                    currentVehicleResults.slice(
                        0,
                        Math.max(
                            1,
                            getVehiclesPerRow() *
                            INITIAL_VISIBLE_ROWS
                        )
                    ),
                    kind,
                    stablePopularHasMoreVehicles(
                        kind,
                        Math.max(
                            1,
                            getVehiclesPerRow() *
                            INITIAL_VISIBLE_ROWS
                        )
                    )
                );

                hideVehicleFloatingCollapseButton();
                return;
            }

            renderVehicleCards(
                currentVehicleResults,
                kind,
                false
            );

        }
    );


    wrapper.appendChild(
        button
    );


    const grid =
        document.getElementById(
            "popularCarsGrid"
        );


    if (
        grid &&
        grid.parentNode
    ) {

        grid.parentNode.insertBefore(
            wrapper,
            grid.nextSibling
        );

    }

}


/*
 * ============================================================
 * VEHICLE CARD
 * ============================================================
 */

function createVehicleCard(
    vehicle,
    kind
) {

    const card =
        document.createElement(
            "button"
        );


    card.type =
        "button";


    card.className =
        "car-card";


    const info =
        getVehicleKindInfo(
            kind
        );


    const make =
        escapeVehicleHtml(
            vehicle.make
        );


    const model =
        escapeVehicleHtml(
            vehicle.model
        );


    const bodyType =
        vehicle.bodyType
            ? escapeVehicleHtml(
                vehicle.bodyType
            )
            : "";


    let secondaryText =
        info.singular;


    if (bodyType) {

        secondaryText +=
            ` • ${bodyType}`;

    }

    const yearStart =
        vehicle.yearStart !== null &&
        vehicle.yearStart !== undefined
            ? String(vehicle.yearStart)
            : "";

    const yearEnd =
        vehicle.yearEnd !== null &&
        vehicle.yearEnd !== undefined
            ? String(vehicle.yearEnd)
            : "";

    if (yearStart || yearEnd) {

        const yearText =
            yearStart &&
            yearEnd &&
            yearStart !== yearEnd
                ? `${yearStart}–${yearEnd}`
                : yearStart || yearEnd;

        secondaryText +=
            ` • ${escapeVehicleHtml(yearText)}`;

    }


    /*
     * Image area.
     */

    const imageContainer =
        document.createElement(
            "div"
        );


    imageContainer.className =
        "car-card-image-container";


    imageContainer.style.width =
        "100%";


    imageContainer.style.overflow =
        "hidden";


    /*
     * Placeholder is shown immediately.
     * The real image replaces it once the
     * details API returns.
     */

    const placeholder =
        createVehicleImagePlaceholder(
            vehicle,
            kind
        );


    imageContainer.appendChild(
        placeholder
    );


    /*
     * Real lazy-loading image.
     */

    const image =
        createVehicleImageElement(
            vehicle,
            kind
        );


    image.style.position =
        "absolute";


    image.style.inset =
        "0";


    /*
     * Make the image container relative.
     */

    imageContainer.style.position =
        "relative";


    imageContainer.style.height =
        "180px";


    imageContainer.appendChild(
        image
    );


    /*
     * Hide the image until loaded.
     */

    image.addEventListener(
        "load",
        () => {

            if (
                placeholder.isConnected
            ) {

                placeholder.remove();

            }

        }
    );


    /*
     * Text area.
     */

    const textContainer =
        document.createElement(
            "div"
        );


    textContainer.className =
        "car-card-content";


    textContainer.innerHTML = `

        <strong>
            ${make} ${model}
        </strong>

        <span>
            ${secondaryText}
        </span>

    `;


    card.appendChild(
        imageContainer
    );


    card.appendChild(
        textContainer
    );

    /*
     * The quality scan normally fetched Wikipedia details before the
     * card was created. Reuse that cached response immediately so cards
     * with "Image unavailable" still show useful technical information
     * without waiting for the image observer.
     */
    const cachedDetails =
        vehicleDetailsCache.get(
            getVehicleDetailsCacheKey(
                vehicle.make,
                vehicle.model,
                vehicle.sourceKind || kind
            )
        );

    if (cachedDetails) {

        updateVehicleCardInformationPreview(
            image,
            cachedDetails
        );

    }


    /*
     * Comparison system will be connected
     * to these cards later.
     */

    card.dataset.vehicleKind =
        kind;

    card.dataset.vehicleSourceKind =
        vehicle.sourceKind ||
        kind;


    card.dataset.vehicleMake =
        vehicle.make || "";


    card.dataset.vehicleModel =
        vehicle.model || "";


    /*
     * Clicking a card opens the full vehicle detail panel.
     */

    card.addEventListener(
        "click",
        () => {

            openVehicleDetailsPanel(
                vehicle,
                kind
            );

        }
    );


    /*
     * Register image with IntersectionObserver.
     */

    const observer =
        getVehicleImageObserver();


    if (observer) {

    observer.observe(
        image
    );

} else {

    queueVehicleImageLoad(
        image,
        vehicle.make || "",
        vehicle.model || "",
        vehicle.sourceKind || kind
    );

}

    return card;

}


/*
 * ============================================================
 * RENDER VEHICLES
 * ============================================================
 */

function renderVehicleCards(
    vehicles,
    kind = currentVehicleKind,
    forceShowAll = false
) {

    const grid =
        document.getElementById(
            "popularCarsGrid"
        );


    if (!grid) {

        return;

    }


    /*
     * Remove old Show All / Show Less button.
     */

    const existingExpandButton =
        document.getElementById(
            "carsVehicleExpandButton"
        );


    if (existingExpandButton) {

        existingExpandButton.remove();

    }


    grid.innerHTML =
        "";


    if (
        !Array.isArray(vehicles) ||
        !vehicles.length
    ) {

        const info =
            getVehicleKindInfo(
                kind
            );


        grid.innerHTML = `

            <div class="cars-empty-state">

                <div class="cars-empty-icon">
                    ${info.icon}
                </div>

                <strong>
                    No ${info.plural.toLowerCase()} found
                </strong>

                <p>
                    There are currently no vehicles
                    matching your search.
                </p>

            </div>

        `;


        currentVehicleResults =
            vehicles || [];


        return;

    }


    /*
     * Keep the complete current result set.
     */

    currentVehicleResults =
        vehicles;


    let vehiclesToRender =
        vehicles;


    /*
     * Normal browsing starts with 3 rows.
     */

    if (
        !forceShowAll &&
        !currentVehicleShowAll
    ) {

        const limit =
            getInitialVehicleLimit(
                vehicles
            );


        vehiclesToRender =
            vehicles.slice(
                0,
                limit
            );

    }


    const fragment =
        document.createDocumentFragment();


    for (
        const vehicle of vehiclesToRender
    ) {

        fragment.appendChild(
            createVehicleCard(
                vehicle,
                kind
            )
        );

    }


    grid.appendChild(
        fragment
    );


    /*
     * Add Show All / Show Less only for normal popular browsing.
     * Search results already show all matching results and do not
     * need a collapse control.
     */

    if (currentVehicleMode === "search") {

        currentVehicleShowAll =
            false;

        hideVehicleFloatingCollapseButton();

    } else if (
        currentVehicleShowAll ||
        forceShowAll
    ) {

        currentVehicleShowAll =
            true;

        renderVehicleCollapseButton(
            kind
        );

        updateVehicleFloatingCollapseButton();

    } else {

        renderVehicleExpandButton(
            vehicles,
            vehiclesToRender,
            kind
        );

        hideVehicleFloatingCollapseButton();

    }

}



/*
 * ============================================================
 * DETAIL PANEL + COMPARE SYSTEM
 * ============================================================
 */

function getVehicleCompareKey(
    vehicle,
    kind
) {

    return [
        normalizeVehicleText(vehicle?.make),
        normalizeVehicleText(vehicle?.model),
        normalizeVehicleText(kind)
    ].join("|");

}


function getVehicleSpecificationEntries(
    specifications
) {

    const labels = [
        ["production", "Production"],
        ["generation", "Generation"],
        ["bodyType", "Body type"],
        ["engine", "Engine"],
        ["engineDisplacement", "Engine displacement"],
        ["fuel", "Fuel"],
        ["fuelEconomy", "Fuel economy"],
        ["fuelTank", "Fuel tank"],
        ["transmission", "Transmission"],
        ["drivetrain", "Drivetrain"],
        ["horsepower", "Power"],
        ["torque", "Torque"],
        ["weight", "Weight"],
        ["payload", "Payload"],
        ["cargoCapacity", "Cargo capacity"],
        ["length", "Length"],
        ["width", "Width"],
        ["height", "Height"],
        ["wheelbase", "Wheelbase"],
        ["groundClearance", "Ground clearance"],
        ["topSpeed", "Top speed"],
        ["battery", "Battery"],
        ["electricRange", "Electric range"],
        ["seating", "Seating"],
        ["doors", "Doors"]
    ];

    return labels
        .map(([key, label]) => ({
            key,
            label,
            value:
                isUsefulVehicleDetailValue(
                    specifications?.[key]
                )
                    ? String(specifications[key])
                    : ""
        }))
        .filter(item => item.value);

}


function isUsefulVehicleDetailValue(
    value
) {

    const normalized =
        String(value ?? "").trim();

    return (
        normalized &&
        !/^no information$/i.test(normalized)
    );

}


function createVehicleDetailsModal() {

    let modal =
        document.getElementById(
            "worthItVehicleDetailsModal"
        );

    if (modal) {
        return modal;
    }

    modal =
        document.createElement("div");

    modal.id =
        "worthItVehicleDetailsModal";

    modal.className =
        "worth-it-vehicle-modal";

    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="worth-it-vehicle-modal-backdrop" data-vehicle-modal-close></div>

        <div
            class="worth-it-vehicle-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worthItVehicleModalTitle"
        >
            <button
                type="button"
                class="worth-it-vehicle-modal-close"
                aria-label="Close vehicle details"
                title="Close"
                data-vehicle-modal-close
            >
                ×
            </button>

            <div class="worth-it-vehicle-modal-body" id="worthItVehicleModalBody">
                <div class="worth-it-vehicle-modal-loading">
                    Loading vehicle details…
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll(
        "[data-vehicle-modal-close]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {
                closeVehicleDetailsPanel();
            }
        );

    });

    return modal;

}


function setVehicleModalOpen(
    open
) {

    const modal =
        createVehicleDetailsModal();

    if (open) {

        vehicleModalScrollY =
            window.scrollY ||
            window.pageYOffset ||
            0;

        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");

        document.body.classList.add(
            "worth-it-vehicle-modal-open"
        );

    } else {

        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");

        document.body.classList.remove(
            "worth-it-vehicle-modal-open"
        );

    }

}


function closeVehicleDetailsPanel(restoreScroll = true) {

    const modal =
        document.getElementById(
            "worthItVehicleDetailsModal"
        );

    if (!modal) {
        return;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove(
        "worth-it-vehicle-modal-open"
    );

    if (
        restoreScroll &&
        Number.isFinite(vehicleModalScrollY)
    ) {
        window.scrollTo({
            top: vehicleModalScrollY,
            behavior: "auto"
        });
    }

}


async function openVehicleDetailsPanel(
    vehicle,
    kind
) {

    if (!vehicle) {
        return;
    }

    const modal =
        createVehicleDetailsModal();

    const body =
        modal.querySelector(
            "#worthItVehicleModalBody"
        );

    if (!body) {
        return;
    }

    setVehicleModalOpen(true);

    const info =
        getVehicleKindInfo(kind);

    const title =
        `${vehicle.make || ""} ${vehicle.model || ""}`.trim();

    body.innerHTML = `
        <div class="worth-it-vehicle-detail-loading">
            <div class="worth-it-vehicle-detail-loading-icon">${info.icon}</div>
            <strong>Loading ${escapeVehicleHtml(title)}…</strong>
            <span>Getting the latest available Wikipedia information.</span>
        </div>
    `;

    const detailKind =
        vehicle.sourceKind ||
        kind;

    const details =
        await fetchVehicleDetailsWithRetry(
            vehicle.make,
            vehicle.model,
            detailKind,
            2
        );

    if (
        !modal.classList.contains("is-open")
    ) {
        return;
    }

    if (!details) {

        body.innerHTML = `
            <div class="worth-it-vehicle-detail-loading">
                <div class="worth-it-vehicle-detail-loading-icon">⚠️</div>
                <strong>Vehicle information is unavailable.</strong>
                <span>Please try again.</span>
            </div>
        `;

        return;
    }

    /*
     * Vehicles without reliable Wikipedia information stay visible
     * in the catalog, but clearly show "No Information" and cannot
     * be added to comparison.
     */
    const hasReliableData =
        hasReliableVehicleWikipediaData(
            details,
            vehicle,
            detailKind
        ) &&
        details.comparisonAvailable !== false;

    if (!hasReliableData) {

        const noInformationDetails = {
            ...details,
            wikipedia: {
                ...(details.wikipedia || {}),
                title: title,
                description: "No Information",
                url: ""
            },
            specifications: {},
            image: null,
            comparisonAvailable: false
        };

        renderVehicleDetailsPanel(
            body,
            noInformationDetails,
            vehicle,
            kind,
            false
        );

        return;
    }

    const safeDetails =
        hasPopularVehicleImageRelevance(
            details,
            vehicle
        )
            ? details
            : {
                ...details,
                image: null
            };

    renderVehicleDetailsPanel(
        body,
        safeDetails,
        vehicle,
        kind,
        true
    );

}


function renderVehicleDetailsPanel(
    body,
    details,
    catalogVehicle,
    kind,
    allowCompare = true
) {

    const info =
        getVehicleKindInfo(kind);

    const apiVehicle =
        details.vehicle || catalogVehicle || {};

    const wikipedia =
        details.wikipedia || {};

    const specifications =
        details.specifications || {};

    const entries =
        getVehicleSpecificationEntries(
            specifications
        );

    const compareKey =
        getVehicleCompareKey(
            apiVehicle,
            kind
        );

    const alreadyCompared =
        vehicleCompareSelection.has(compareKey);

    const imageUrl =
        details.image?.url ||
        "";

    const imageHtml =
        imageUrl
            ? `
                <img
                    class="worth-it-vehicle-detail-image"
                    src="${escapeVehicleHtml(imageUrl)}"
                    alt="${escapeVehicleHtml(
                        `${apiVehicle.make || ""} ${apiVehicle.model || ""}`.trim()
                    )}"
                    loading="eager"
                    decoding="async"
                >
            `
            : `
                <div class="worth-it-vehicle-detail-image-placeholder">
                    <span>${info.icon}</span>
                    <small>No image available</small>
                </div>
            `;

    const specsHtml =
        entries.length
            ? `
                <div class="worth-it-vehicle-spec-grid">
                    ${entries.map(entry => `
                        <div class="worth-it-vehicle-spec-item">
                            <span>${escapeVehicleHtml(entry.label)}</span>
                            <strong>${escapeVehicleHtml(entry.value)}</strong>
                        </div>
                    `).join("")}
                </div>
            `
            : `
                <div class="worth-it-vehicle-no-specs">
                    No technical specifications are currently available from Wikipedia.
                </div>
            `;

    body.innerHTML = `
        <div class="worth-it-vehicle-detail-header">
            <div class="worth-it-vehicle-detail-image-wrap">
                ${imageHtml}
            </div>

            <div class="worth-it-vehicle-detail-heading">
                <div class="worth-it-vehicle-detail-kind">
                    ${info.icon} ${escapeVehicleHtml(info.singular)}
                </div>

                <h2 id="worthItVehicleModalTitle">
                    ${escapeVehicleHtml(
                        `${apiVehicle.make || ""} ${apiVehicle.model || ""}`.trim()
                    )}
                </h2>

                <div class="worth-it-vehicle-detail-generation">
                    ${escapeVehicleHtml(
                        isUsefulVehicleDetailValue(specifications.generation)
                            ? specifications.generation
                            : ""
                    )}
                </div>
            </div>
        </div>

        <section class="worth-it-vehicle-detail-section">
            <h3>About this vehicle</h3>
            <p class="worth-it-vehicle-description">
                ${escapeVehicleHtml(
                    wikipedia.description ||
                    "No description is currently available."
                )}
            </p>
        </section>

        <section class="worth-it-vehicle-detail-section">
            <h3>Specifications</h3>
            ${specsHtml}
        </section>

        <div class="worth-it-vehicle-detail-actions">
            <button
                type="button"
                class="worth-it-vehicle-compare-button${alreadyCompared ? " is-added" : ""}${!allowCompare ? " is-disabled" : ""}"
                data-vehicle-compare
                data-vehicle-key="${escapeVehicleHtml(compareKey)}"
                ${allowCompare ? "" : "disabled"}
            >
                ${alreadyCompared
                    ? "✓ Added to compare"
                    : allowCompare
                        ? "Add to compare"
                        : "Not available for comparison"}
            </button>

            <div class="worth-it-vehicle-source">
                ${wikipedia.url
                    ? `<a href="${escapeVehicleHtml(wikipedia.url)}" target="_blank" rel="noopener noreferrer">View on Wikipedia ↗</a>`
                    : "Wikipedia information unavailable"}
            </div>
        </div>
    `;

    const compareButton =
        body.querySelector(
            "[data-vehicle-compare]"
        );

    if (compareButton) {

        compareButton.addEventListener(
            "click",
            () => {

                toggleVehicleCompareSelection(
                    apiVehicle,
                    kind,
                    details,
                    compareButton
                );

            }
        );

    }

}


function toggleVehicleCompareSelection(
    vehicle,
    kind,
    details,
    button
) {

    const key =
        getVehicleCompareKey(
            vehicle,
            kind
        );

    if (
        vehicleCompareSelection.has(key)
    ) {

        vehicleCompareSelection.delete(key);

        if (button) {
            button.classList.remove("is-added");
            button.textContent =
                "Add to compare";
        }

    } else {

        if (
            vehicleCompareSelection.size >=
            MAX_COMPARE_VEHICLES
        ) {

            showVehicleCompareNotice(
                `You can compare up to ${MAX_COMPARE_VEHICLES} vehicles at once.`
            );

            return;
        }

        vehicleCompareSelection.set(
            key,
            {
                key,
                kind,
                vehicle,
                details
            }
        );

        if (button) {
            button.classList.add("is-added");
            button.textContent =
                "✓ Added to compare";
        }

    }

    renderVehicleCompareBar();

}


function showVehicleCompareNotice(
    message
) {

    let notice =
        document.getElementById(
            "worthItVehicleCompareNotice"
        );

    if (!notice) {

        notice =
            document.createElement("div");

        notice.id =
            "worthItVehicleCompareNotice";

        notice.className =
            "worth-it-vehicle-compare-notice";

        document.body.appendChild(notice);

    }

    notice.textContent =
        message;

    notice.classList.add("is-visible");

    window.clearTimeout(
        showVehicleCompareNotice.timeoutId
    );

    showVehicleCompareNotice.timeoutId =
        window.setTimeout(
            () => {
                notice.classList.remove("is-visible");
            },
            2600
        );

}


function renderVehicleCompareBar() {

    let bar =
        document.getElementById(
            "worthItVehicleCompareBar"
        );

    if (!vehicleCompareSelection.size) {

        if (bar) {
            bar.remove();
        }

        renderVehicleCompareSection();

        return;
    }

    if (!bar) {

        bar =
            document.createElement("div");

        bar.id =
            "worthItVehicleCompareBar";

        bar.className =
            "worth-it-vehicle-compare-bar";

        document.body.appendChild(bar);

    }

    const selections =
        Array.from(
            vehicleCompareSelection.values()
        );

    bar.innerHTML = `
        <div class="worth-it-vehicle-compare-bar-inner">
            <div class="worth-it-vehicle-compare-items">
                ${selections.map(item => `
                    <div class="worth-it-vehicle-compare-chip">
                        <span>
                            ${escapeVehicleHtml(
                                `${item.vehicle.make || ""} ${item.vehicle.model || ""}`.trim()
                            )}
                        </span>
                        <button
                            type="button"
                            aria-label="Remove ${escapeVehicleHtml(
                                `${item.vehicle.make || ""} ${item.vehicle.model || ""}`.trim()
                            )} from compare"
                            data-remove-compare="${escapeVehicleHtml(item.key)}"
                        >
                            ×
                        </button>
                    </div>
                `).join("")}
            </div>

            <div class="worth-it-vehicle-compare-bar-actions">
                <span>${selections.length}/${MAX_COMPARE_VEHICLES} selected</span>
                <button
                    type="button"
                    class="worth-it-vehicle-compare-open"
                    data-open-compare
                    ${selections.length < 2 ? "disabled" : ""}
                >
                    Compare vehicles
                </button>
            </div>
        </div>
    `;

    bar.querySelectorAll(
        "[data-remove-compare]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                vehicleCompareSelection.delete(
                    button.dataset.removeCompare
                );

                renderVehicleCompareBar();

                refreshVehicleDetailsCompareButton();

            }
        );

    });

    const openButton =
        bar.querySelector(
            "[data-open-compare]"
        );

    if (openButton) {

        openButton.addEventListener(
            "click",
            () => {
                openVehicleComparisonPanel();
            }
        );

    }

    renderVehicleCompareSection();

}


function renderVehicleCompareSection() {

    const panel =
        document.getElementById(
            "carsComparePanel"
        );

    if (!panel) {
        return;
    }

    const selections =
        Array.from(
            vehicleCompareSelection.values()
        );

    if (!selections.length) {

        panel.innerHTML = `
            <div class="cars-compare-live-empty">
                <div class="cars-compare-live-icon">⚖️</div>

                <div class="cars-compare-live-empty-copy">
                    <strong>Choose cars to compare</strong>
                    <p>
                        Select up to 3 vehicles and compare their available
                        specifications in one place.
                    </p>
                </div>

                <div class="cars-compare-live-empty-action">
                    <button
                        type="button"
                        class="cars-compare-live-add"
                        data-compare-live-add
                    >
                        Add vehicle
                    </button>
                    <small>
                        Select a vehicle from the list above
                    </small>
                </div>
            </div>
        `;

        const addButton =
            panel.querySelector(
                "[data-compare-live-add]"
            );

        if (addButton) {

            addButton.addEventListener(
                "click",
                () => {

                    const grid =
                        document.getElementById(
                            "popularCarsGrid"
                        );

                    if (grid) {
                        grid.scrollIntoView({
                            behavior: "smooth",
                            block: "center"
                        });
                    }

                }
            );

        }

        return;
    }

    const slots = [];

    for (
        let index = 0;
        index < MAX_COMPARE_VEHICLES;
        index++
    ) {

        const item =
            selections[index];

        if (item) {

            const title =
                `${item.vehicle.make || ""} ${item.vehicle.model || ""}`.trim();

            const info =
                getVehicleKindInfo(
                    item.kind
                );

            const imageUrl =
                item.details?.image?.url || "";

            slots.push(`
                <div
                    class="cars-compare-live-card"
                    data-compare-live-item="${escapeVehicleHtml(item.key)}"
                >
                    <div class="cars-compare-live-card-image">
                        ${imageUrl
                            ? `
                                <img
                                    src="${escapeVehicleHtml(imageUrl)}"
                                    alt="${escapeVehicleHtml(title)}"
                                    loading="lazy"
                                    decoding="async"
                                >
                            `
                            : `
                                <span aria-hidden="true">${info.icon}</span>
                            `
                        }
                    </div>

                    <div class="cars-compare-live-card-body">
                        <small>
                            ${escapeVehicleHtml(info.singular)}
                        </small>
                        <strong>
                            ${escapeVehicleHtml(title)}
                        </strong>
                        <button
                            type="button"
                            class="cars-compare-live-details"
                            data-compare-live-details="${escapeVehicleHtml(item.key)}"
                        >
                            View details →
                        </button>
                    </div>

                    <button
                        type="button"
                        class="cars-compare-live-remove"
                        aria-label="Remove ${escapeVehicleHtml(title)} from compare"
                        title="Remove"
                        data-compare-live-remove="${escapeVehicleHtml(item.key)}"
                    >
                        ×
                    </button>
                </div>
            `);

        } else {

            slots.push(`
                <button
                    type="button"
                    class="cars-compare-live-card cars-compare-live-empty-slot"
                    data-compare-live-add
                >
                    <span
                        class="cars-compare-live-empty-plus"
                        aria-hidden="true"
                    >
                        +
                    </span>
                    <strong>Add another vehicle</strong>
                    <small>
                        Select a vehicle from the list above
                    </small>
                </button>
            `);

        }

    }

    panel.innerHTML = `
        <div class="cars-compare-live">
            <div class="cars-compare-live-header">
                <div>
                    <span class="cars-compare-live-kicker">
                        ⚖️ Your comparison
                    </span>
                    <strong>
                        ${selections.length}/${MAX_COMPARE_VEHICLES} selected
                    </strong>
                </div>

                <button
                    type="button"
                    class="cars-compare-live-clear"
                    data-compare-live-clear
                >
                    Clear all
                </button>
            </div>

            <div class="cars-compare-live-grid">
                ${slots.join("")}
            </div>

            <div class="cars-compare-live-footer">
                <span>
                    ${selections.length < 2
                        ? "Add at least one more vehicle to start comparing."
                        : "Your selected vehicles are ready for a full specification comparison."
                    }
                </span>

                <button
                    type="button"
                    class="cars-compare-live-open"
                    data-compare-live-open
                    ${selections.length < 2 ? "disabled" : ""}
                >
                    ⚖️ Compare vehicles
                </button>
            </div>
        </div>
    `;

    panel.querySelectorAll(
        "[data-compare-live-remove]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                vehicleCompareSelection.delete(
                    button.dataset.compareLiveRemove
                );

                renderVehicleCompareBar();

                refreshVehicleDetailsCompareButton();

            }
        );

    });

    panel.querySelectorAll(
        "[data-compare-live-details]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                const key =
                    button.dataset.compareLiveDetails;

                const item =
                    vehicleCompareSelection.get(key);

                if (item) {
                    openVehicleDetailsPanel(
                        item.vehicle,
                        item.kind
                    );
                }

            }
        );

    });

    panel.querySelectorAll(
        "[data-compare-live-add]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const grid =
                    document.getElementById(
                        "popularCarsGrid"
                    );

                if (grid) {
                    grid.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });
                }

            }
        );

    });

    const clearButton =
        panel.querySelector(
            "[data-compare-live-clear]"
        );

    if (clearButton) {

        clearButton.addEventListener(
            "click",
            () => {

                vehicleCompareSelection.clear();

                renderVehicleCompareBar();

                refreshVehicleDetailsCompareButton();

            }
        );

    }

    const compareButton =
        panel.querySelector(
            "[data-compare-live-open]"
        );

    if (compareButton) {

        compareButton.addEventListener(
            "click",
            () => {
                openVehicleComparisonPanel();
            }
        );

    }

}


function refreshVehicleDetailsCompareButton() {

    const modal =
        document.getElementById(
            "worthItVehicleDetailsModal"
        );

    if (!modal) {
        return;
    }

    const button =
        modal.querySelector(
            "[data-vehicle-compare]"
        );

    if (!button) {
        return;
    }

    const key =
        button.dataset.vehicleKey || "";

    const isAdded =
        vehicleCompareSelection.has(key);

    button.classList.toggle(
        "is-added",
        isAdded
    );

    button.textContent =
        isAdded
            ? "✓ Added to compare"
            : "Add to compare";

}


function createVehicleComparisonModal() {

    let modal =
        document.getElementById(
            "worthItVehicleComparisonModal"
        );

    if (modal) {
        return modal;
    }

    modal =
        document.createElement("div");

    modal.id =
        "worthItVehicleComparisonModal";

    modal.className =
        "worth-it-vehicle-modal worth-it-vehicle-comparison-modal";

    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
        <div class="worth-it-vehicle-modal-backdrop" data-comparison-modal-close></div>
        <div
            class="worth-it-vehicle-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worthItVehicleComparisonTitle"
        >
            <button
                type="button"
                class="worth-it-vehicle-modal-close"
                aria-label="Close comparison"
                title="Close"
                data-comparison-modal-close
            >
                ×
            </button>
            <div class="worth-it-vehicle-modal-body" id="worthItVehicleComparisonBody"></div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll(
        "[data-comparison-modal-close]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                closeVehicleComparisonPanel();

            }
        );

    });

    return modal;

}


function getVehicleComparisonSections() {

    return [

        {
            title: "General",
            rows: [
                ["production", "Production"],
                ["generation", "Generation"],
                ["bodyType", "Body type"]
            ]
        },

        {
            title: "Engine & Performance",
            rows: [
                ["engine", "Engine"],
                ["engineDisplacement", "Engine displacement"],
                ["fuel", "Fuel"],
                ["fuelEconomy", "Fuel economy"],
                ["fuelTank", "Fuel tank"],
                ["transmission", "Transmission"],
                ["drivetrain", "Drivetrain"],
                ["horsepower", "Power"],
                ["torque", "Torque"],
                ["topSpeed", "Top speed"]
            ]
        },

        {
            title: "Dimensions & Weight",
            rows: [
                ["weight", "Weight"],
                ["payload", "Payload"],
                ["cargoCapacity", "Cargo capacity"],
                ["length", "Length"],
                ["width", "Width"],
                ["height", "Height"],
                ["wheelbase", "Wheelbase"],
                ["groundClearance", "Ground clearance"]
            ]
        },

        {
            title: "Electric & Practical",
            rows: [
                ["battery", "Battery"],
                ["electricRange", "Electric range"],
                ["seating", "Seating"],
                ["doors", "Doors"]
            ]
        }

    ];

}


function normalizeVehicleComparisonValue(value) {

    if (!isUsefulVehicleDetailValue(value)) {
        return "";
    }

    return String(value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

}


function getVehicleComparisonDifferenceState(
    selections,
    key
) {

    const values = selections.map(
        item => normalizeVehicleComparisonValue(
            item.details?.specifications?.[key]
        )
    );

    const presentValues = values.filter(Boolean);

    if (!presentValues.length) {
        return {
            hasDifferences: false,
            cellIsDifferent: values.map(() => false)
        };
    }

    const uniquePresentValues =
        new Set(presentValues);

    const hasDifferences =
        uniquePresentValues.size > 1 ||
        presentValues.length !== values.length;

    if (!hasDifferences) {
        return {
            hasDifferences: false,
            cellIsDifferent: values.map(() => false)
        };
    }

    const frequency =
        new Map();

    presentValues.forEach(value => {
        frequency.set(
            value,
            (frequency.get(value) || 0) + 1
        );
    });

    let mostCommonValue = "";
    let mostCommonCount = 0;

    frequency.forEach((count, value) => {
        if (count > mostCommonCount) {
            mostCommonValue = value;
            mostCommonCount = count;
        }
    });

    const allValuesTie =
        uniquePresentValues.size > 1 &&
        Array.from(frequency.values())
            .every(count => count === mostCommonCount);

    return {
        hasDifferences: true,
        cellIsDifferent: values.map(value => {

            if (!value) {
                return true;
            }

            if (allValuesTie) {
                return true;
            }

            return value !== mostCommonValue;
        })
    };

}


function getVehicleComparisonImageHtml(
    item
) {

    const info =
        getVehicleKindInfo(item.kind);

    const imageUrl =
        item.details?.image?.url || "";

    if (imageUrl) {

        return `
            <img
                class="worth-it-vehicle-comparison-vehicle-image"
                src="${escapeVehicleHtml(imageUrl)}"
                alt="${escapeVehicleHtml(
                    `${item.vehicle.make || ""} ${item.vehicle.model || ""}`.trim()
                )}"
                loading="lazy"
                decoding="async"
            >
        `;

    }

    return `
        <div class="worth-it-vehicle-comparison-vehicle-image-placeholder" aria-hidden="true">
            ${info.icon}
        </div>
    `;

}


function openVehicleComparisonPanel() {

    const selections =
        Array.from(
            vehicleCompareSelection.values()
        );

    if (selections.length < 2) {
        showVehicleCompareNotice(
            "Add at least two vehicles to compare."
        );
        return;
    }

    closeVehicleDetailsPanel(false);

    const modal =
        createVehicleComparisonModal();

    const body =
        modal.querySelector(
            "#worthItVehicleComparisonBody"
        );

    if (!body) {
        return;
    }

    const sections =
        getVehicleComparisonSections();

    const comparisonRows =
        sections
            .map(section => ({
                ...section,
                rows: section.rows.filter(
                    ([key]) =>
                        selections.some(item =>
                            isUsefulVehicleDetailValue(
                                item.details?.specifications?.[key]
                            )
                        )
                )
            }))
            .filter(section => section.rows.length);

    body.innerHTML = `
        <div class="worth-it-vehicle-comparison-heading">
            <div class="worth-it-vehicle-detail-kind">⚖️ Vehicle comparison</div>
            <h2 id="worthItVehicleComparisonTitle">Compare Vehicles</h2>
            <p>Side-by-side information from the available Wikipedia data.</p>
            <div class="worth-it-vehicle-comparison-meta">
                <span>${selections.length}/${MAX_COMPARE_VEHICLES} vehicles selected</span>
                <span>Differences are highlighted</span>
            </div>
        </div>

        <div class="worth-it-vehicle-comparison-table-wrap">
            <table class="worth-it-vehicle-comparison-table">
                <thead>
                    <tr>
                        <th class="worth-it-vehicle-comparison-specification-header">
                            <span>Specification</span>
                        </th>
                        ${selections.map(item => `
                            <th class="worth-it-vehicle-comparison-vehicle-header">
                                <div class="worth-it-vehicle-comparison-vehicle-card">
                                    <div class="worth-it-vehicle-comparison-vehicle-image-wrap">
                                        ${getVehicleComparisonImageHtml(item)}
                                    </div>
                                    <div class="worth-it-vehicle-comparison-vehicle-info">
                                        <div class="worth-it-vehicle-comparison-vehicle-kind">
                                            ${escapeVehicleHtml(
                                                getVehicleKindInfo(item.kind).singular
                                            )}
                                        </div>
                                        <strong>
                                            ${escapeVehicleHtml(
                                                `${item.vehicle.make || ""} ${item.vehicle.model || ""}`.trim()
                                            )}
                                        </strong>
                                    </div>
                                    <button
                                        type="button"
                                        class="worth-it-vehicle-comparison-remove"
                                        aria-label="Remove ${escapeVehicleHtml(
                                            `${item.vehicle.make || ""} ${item.vehicle.model || ""}`.trim()
                                        )} from comparison"
                                        data-comparison-remove="${escapeVehicleHtml(item.key)}"
                                        title="Remove from comparison"
                                    >
                                        ×
                                    </button>
                                </div>
                            </th>
                        `).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${comparisonRows.map(section => `
                        <tr class="worth-it-vehicle-comparison-section-row">
                            <th colspan="${selections.length + 1}">
                                ${escapeVehicleHtml(section.title)}
                            </th>
                        </tr>
                        ${section.rows.map(([key, label]) => {

                            const differenceState =
                                getVehicleComparisonDifferenceState(
                                    selections,
                                    key
                                );

                            return `
                                <tr class="${differenceState.hasDifferences ? "worth-it-vehicle-comparison-different-row" : ""}">
                                    <th class="worth-it-vehicle-comparison-label-cell">
                                        ${escapeVehicleHtml(label)}
                                    </th>
                                    ${selections.map((item, index) => {

                                        const rawValue =
                                            item.details?.specifications?.[key];

                                        const usefulValue =
                                            isUsefulVehicleDetailValue(rawValue)
                                                ? String(rawValue)
                                                : "—";

                                        const cellIsDifferent =
                                            differenceState.cellIsDifferent[index];

                                        return `
                                            <td class="${cellIsDifferent ? "worth-it-vehicle-comparison-different-cell" : ""}">
                                                ${cellIsDifferent ? `<span class="worth-it-vehicle-comparison-difference-dot" aria-hidden="true"></span>` : ""}
                                                <span>${escapeVehicleHtml(usefulValue)}</span>
                                            </td>
                                        `;

                                    }).join("")}
                                </tr>
                            `;

                        }).join("")}
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    body.querySelectorAll(
        "[data-comparison-remove]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                const key =
                    button.dataset.comparisonRemove || "";

                if (key) {
                    vehicleCompareSelection.delete(key);
                }

                const remaining =
                    Array.from(
                        vehicleCompareSelection.values()
                    );

                renderVehicleCompareBar();

                if (remaining.length < 2) {

                    closeVehicleComparisonPanel();

                    if (remaining.length === 1) {
                        showVehicleCompareNotice(
                            "Add one more vehicle to compare."
                        );
                    }

                    return;
                }

                openVehicleComparisonPanel();

            }
        );

    });

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add(
        "worth-it-vehicle-modal-open"
    );

}


function closeVehicleComparisonPanel() {

    const modal =
        document.getElementById(
            "worthItVehicleComparisonModal"
        );

    if (!modal) {
        return;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");

    if (
        !document.getElementById(
            "worthItVehicleDetailsModal"
        )?.classList.contains("is-open")
    ) {
        document.body.classList.remove(
            "worth-it-vehicle-modal-open"
        );
    }

}


/*
 * ============================================================
 * STICKY SHOW LESS CONTROL
 * ============================================================
 */

function ensureVehicleFloatingCollapseButton() {

    let button =
        document.getElementById(
            "worthItVehicleFloatingCollapse"
        );

    if (button) {
        return button;
    }

    button =
        document.createElement("button");

    button.id =
        "worthItVehicleFloatingCollapse";

    button.type =
        "button";

    button.className =
        "worth-it-vehicle-floating-collapse";

    button.textContent =
        `Show less ${getVehicleKindInfo(currentVehicleKind).plural.toLowerCase()}`;

    button.setAttribute(
        "aria-label",
        `Show less ${getVehicleKindInfo(currentVehicleKind).plural.toLowerCase()}`
    );

    button.addEventListener(
        "click",
        () => {

            currentVehicleShowAll =
                false;

            const stableDisplayState =
                getStablePopularDisplayState(
                    currentVehicleKind
                );

            if (
                stableDisplayState
            ) {

                stableDisplayState.showAll =
                    false;

                hideOrShowStablePopularCards(
                    currentVehicleKind,
                    false
                );

                renderVehicleExpandButton(
                    currentVehicleResults,
                    currentVehicleResults.slice(
                        0,
                        Math.max(
                            1,
                            getVehiclesPerRow() *
                            INITIAL_VISIBLE_ROWS
                        )
                    ),
                    currentVehicleKind,
                    stablePopularHasMoreVehicles(
                        currentVehicleKind,
                        Math.max(
                            1,
                            getVehiclesPerRow() *
                            INITIAL_VISIBLE_ROWS
                        )
                    )
                );

                hideVehicleFloatingCollapseButton();
                return;

            }

            renderVehicleCards(
                currentVehicleResults,
                currentVehicleKind,
                false
            );

            const carsSection =
                document.getElementById(
                    "carsSection"
                );

            if (carsSection) {

                const rect =
                    carsSection.getBoundingClientRect();

                const top =
                    window.scrollY +
                    rect.top -
                    18;

                window.scrollTo({
                    top: Math.max(0, top),
                    behavior: "smooth"
                });

            }

        }
    );

    document.body.appendChild(button);

    return button;

}


function positionVehicleFloatingCollapseButton(button, anchor) {
    if (!button || !anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const gap = 12;

    let left = anchorRect.right + gap;
    const maxLeft = window.innerWidth - buttonRect.width - gap;

    if (left > maxLeft) {
        left = maxLeft;
    }

    left = Math.max(8, left);

    button.style.setProperty("left", left + "px", "important");
    button.style.setProperty("right", "auto", "important");
}

function updateVehicleFloatingCollapseButton() {

    const button =
        ensureVehicleFloatingCollapseButton();

    if (button) {

        const label =
            `Show less ${getVehicleKindInfo(currentVehicleKind).plural.toLowerCase()}`;

        button.textContent =
            label;

        button.setAttribute(
            "aria-label",
            label
        );

    }

    const carsSection =
        document.getElementById(
            "carsSection"
        );

    if (
        !button ||
        !carsSection ||
        currentVehicleMode !== "popular" ||
        !currentVehicleShowAll
    ) {

        hideVehicleFloatingCollapseButton();
        return;

    }

    const carsVisible =
        window.getComputedStyle(
            carsSection
        ).display !== "none";

    const shouldShow =
        carsVisible &&
        window.scrollY > 280;

    if (shouldShow) {
        const anchor =
            document.getElementById("popularCarsGrid") ||
            document.getElementById("carsContent") ||
            carsSection;

        positionVehicleFloatingCollapseButton(button, anchor);
    }

    button.classList.toggle(
        "is-visible",
        shouldShow
    );

}


function hideVehicleFloatingCollapseButton() {

    const button =
        document.getElementById(
            "worthItVehicleFloatingCollapse"
        );

    if (button) {
        button.classList.remove(
            "is-visible"
        );
    }

}


function injectVehicleUiStyles() {

    if (
        document.getElementById(
            "worthItVehicleUiStyles"
        )
    ) {
        return;
    }

    const style =
        document.createElement("style");

    style.id =
        "worthItVehicleUiStyles";

    style.textContent = `
        body.worth-it-vehicle-modal-open {
            overflow: hidden;
        }

        .worth-it-vehicle-modal {
            position: fixed;
            inset: 0;
            z-index: 99990;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }

        .worth-it-vehicle-modal.is-open {
            display: flex;
        }

        .worth-it-vehicle-modal-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.72);
            backdrop-filter: blur(4px);
        }

        .worth-it-vehicle-modal-dialog {
            position: relative;
            z-index: 1;
            width: min(960px, 100%);
            max-height: min(900px, calc(100vh - 48px));
            overflow: auto;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 20px;
            background: #111318;
            color: #f5f7fa;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }

        .worth-it-vehicle-modal-close {
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 5;
            width: 42px;
            height: 42px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 50%;
            background: rgba(17, 19, 24, 0.86);
            color: #fff;
            font-size: 28px;
            line-height: 1;
            cursor: pointer;
        }

        .worth-it-vehicle-modal-close:hover {
            background: rgba(255, 255, 255, 0.12);
        }

        .worth-it-vehicle-modal-body {
            padding: 28px;
        }

        .cars-results-description-with-info {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            flex-wrap: wrap;
            position: relative;
        }

        .cars-results-description-text {
            display: inline;
        }

        .cars-popularity-info-wrap {
            position: relative;
            display: inline-flex;
            align-items: center;
        }

        .cars-popularity-info-button {
            width: 22px;
            height: 22px;
            padding: 0;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.06);
            color: inherit;
            font-size: 0.78rem;
            font-weight: 800;
            line-height: 1;
            cursor: pointer;
            opacity: 0.78;
            transition:
                opacity 0.16s ease,
                background 0.16s ease,
                border-color 0.16s ease;
        }

        .cars-popularity-info-button:hover,
        .cars-popularity-info-button:focus-visible,
        .cars-popularity-info-wrap.is-open .cars-popularity-info-button {
            opacity: 1;
            background: rgba(255, 255, 255, 0.11);
            border-color: rgba(255, 255, 255, 0.28);
            outline: none;
        }

        .cars-popularity-tooltip {
            position: absolute;
            left: 50%;
            top: calc(100% + 9px);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 7px;
            width: min(360px, calc(100vw - 32px));
            padding: 12px 14px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 11px;
            background: rgba(17, 19, 24, 0.97);
            color: #f5f7fa;
            box-shadow: 0 14px 35px rgba(0, 0, 0, 0.3);
            transform: translateX(-50%);
            font-size: 0.78rem;
            line-height: 1.5;
            text-align: left;
        }

        .cars-popularity-tooltip[hidden] {
            display: none;
        }

        .cars-popularity-tooltip strong {
            font-size: 0.8rem;
        }

        html[data-theme="light"] .cars-popularity-info-button {
            border-color: rgba(0, 0, 0, 0.14);
            background: rgba(0, 0, 0, 0.045);
            color: #16181d;
        }

        html[data-theme="light"] .cars-popularity-info-button:hover,
        html[data-theme="light"] .cars-popularity-info-button:focus-visible,
        html[data-theme="light"] .cars-popularity-info-wrap.is-open .cars-popularity-info-button {
            background: rgba(0, 0, 0, 0.08);
            border-color: rgba(0, 0, 0, 0.22);
        }

        html[data-theme="light"] .cars-popularity-tooltip {
            border-color: rgba(0, 0, 0, 0.1);
            background: rgba(255, 255, 255, 0.98);
            color: #16181d;
            box-shadow: 0 14px 35px rgba(0, 0, 0, 0.16);
        }

        .car-card-info-preview {
            display: block;
            margin-top: 5px;
            overflow: hidden;
            color: var(--muted);
            font-size: 0.72rem;
            line-height: 1.35;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .worth-it-vehicle-detail-header {
            display: grid;
            grid-template-columns: minmax(260px, 42%) 1fr;
            gap: 26px;
            align-items: stretch;
        }

        .worth-it-vehicle-detail-image-wrap {
            min-height: 260px;
            overflow: hidden;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.05);
        }

        .worth-it-vehicle-detail-image {
            display: block;
            width: 100%;
            height: 100%;
            min-height: 260px;
            object-fit: cover;
        }

        .worth-it-vehicle-detail-image-placeholder {
            min-height: 260px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            opacity: 0.65;
            font-size: 1rem;
        }

        .worth-it-vehicle-detail-image-placeholder span {
            font-size: 4rem;
        }

        .worth-it-vehicle-detail-heading {
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 18px 8px 18px 0;
        }

        .worth-it-vehicle-detail-kind {
            font-size: 0.88rem;
            opacity: 0.68;
            margin-bottom: 8px;
        }

        .worth-it-vehicle-detail-heading h2,
        .worth-it-vehicle-comparison-heading h2 {
            margin: 0;
            font-size: clamp(1.8rem, 4vw, 2.65rem);
            line-height: 1.08;
        }

        .worth-it-vehicle-detail-generation {
            min-height: 24px;
            margin-top: 10px;
            color: rgba(255, 255, 255, 0.7);
        }

        .worth-it-vehicle-detail-section {
            margin-top: 28px;
        }

        .worth-it-vehicle-detail-section h3 {
            margin: 0 0 12px;
            font-size: 1.15rem;
        }

        .worth-it-vehicle-description {
            margin: 0;
            line-height: 1.65;
            color: rgba(255, 255, 255, 0.78);
        }

        .worth-it-vehicle-spec-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .worth-it-vehicle-spec-item {
            padding: 13px 14px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.035);
        }

        .worth-it-vehicle-spec-item span {
            display: block;
            margin-bottom: 5px;
            font-size: 0.78rem;
            opacity: 0.6;
        }

        .worth-it-vehicle-spec-item strong {
            display: block;
            line-height: 1.4;
            word-break: break-word;
        }

        .worth-it-vehicle-no-specs,
        .worth-it-vehicle-detail-loading {
            padding: 26px;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.04);
            color: rgba(255, 255, 255, 0.72);
        }

        .worth-it-vehicle-detail-loading {
            min-height: 240px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            text-align: center;
        }

        .worth-it-vehicle-detail-loading-icon {
            font-size: 3rem;
        }

        .worth-it-vehicle-detail-actions {
            display: flex;
            gap: 14px;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .worth-it-vehicle-compare-button {
            min-height: 46px;
            padding: 0 20px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 11px;
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
            font-weight: 700;
            cursor: pointer;
            transition:
                background 0.2s ease,
                border-color 0.2s ease,
                color 0.2s ease,
                transform 0.2s ease,
                box-shadow 0.2s ease;
        }

        .worth-it-vehicle-compare-button:hover {
            background: rgba(255, 255, 255, 0.14);
            border-color: rgba(139, 92, 246, 0.75);
            box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.18);
            transform: scale(1.02);
        }

        .worth-it-vehicle-compare-button.is-added {
            background: rgba(60, 180, 110, 0.16);
            border-color: rgba(90, 210, 135, 0.38);
        }

        /* Light theme */

        html[data-theme="light"] .worth-it-vehicle-compare-button {
            border-color: rgba(0, 0, 0, 0.14);
            background: rgba(0, 0, 0, 0.05);
            color: #171717;
        }

        html[data-theme="light"] .worth-it-vehicle-compare-button:hover {
            background: rgba(0, 0, 0, 0.08);
            border-color: rgba(139, 92, 246, 0.75);
            box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.14);
        }

        html[data-theme="light"] .worth-it-vehicle-compare-button.is-added {
            background: rgba(60, 180, 110, 0.12);
            border-color: rgba(50, 160, 95, 0.45);
            color: #176b3a;
        }

                /* Light theme */

        html[data-theme="light"] .cars-expand-button {
            border-color: rgba(0, 0, 0, 0.14);
            background: rgba(255, 255, 255, 0.96);
            color: #171717;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
        }

        html[data-theme="light"] .cars-expand-button:hover {
            background: rgba(255, 255, 255, 1);
            border-color: rgba(139, 92, 246, 0.75);
            box-shadow:
                0 0 0 2px rgba(139, 92, 246, 0.14),
                0 12px 32px rgba(0, 0, 0, 0.16);
        }

        .worth-it-vehicle-source {
            font-size: 0.82rem;
            opacity: 0.7;
        }

        .worth-it-vehicle-source a {
            color: inherit;
        }

        .cars-compare-placeholder {
            padding: 0;
            border: 0;
            background: transparent;
            color: inherit;
        }

        .cars-compare-live {
            display: flex;
            flex-direction: column;
            gap: 18px;
            padding: 18px;
            border: 1px solid rgba(255, 255, 255, 0.10);
            border-radius: 18px;
            background:
                linear-gradient(
                    180deg,
                    rgba(255, 255, 255, 0.055),
                    rgba(255, 255, 255, 0.025)
                );
            box-shadow: 0 14px 38px rgba(0, 0, 0, 0.10);
        }

        .cars-compare-live-empty {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 20px;
            border: 1px dashed rgba(255, 255, 255, 0.14);
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.025);
            text-align: left;
        }

        .cars-compare-live-icon {
            display: grid;
            place-items: center;
            flex: 0 0 48px;
            width: 48px;
            height: 48px;
            border-radius: 14px;
            background: rgba(124, 58, 237, 0.12);
            font-size: 1.45rem;
        }

        .cars-compare-live-empty strong,
        .cars-compare-live-empty p {
            margin: 0;
        }

        .cars-compare-live-empty p {
            margin-top: 5px;
            color: var(--muted);
            line-height: 1.5;
        }

        .cars-compare-live-empty-copy {
            min-width: 0;
        }

        .cars-compare-live-empty-action {
            display: flex;
            flex: 0 0 auto;
            min-width: 150px;
            margin-left: auto;
            flex-direction: column;
            align-items: flex-end;
            gap: 6px;
            text-align: right;
        }

        .cars-compare-live-empty-action small {
            color: var(--muted);
            font-size: 0.72rem;
        }

        .cars-compare-live-add {
            min-height: 40px;
            padding: 8px 14px;
            border: 1px solid rgba(124, 58, 237, 0.34);
            border-radius: 10px;
            background: linear-gradient(
                135deg,
                rgba(124, 58, 237, 0.17),
                rgba(37, 99, 235, 0.14)
            );
            color: inherit;
            font: inherit;
            font-weight: 800;
            cursor: pointer;
        }

        .cars-compare-live-add:hover {
            border-color: rgba(124, 58, 237, 0.7);
            transform: translateY(-1px);
        }

        .worth-it-vehicle-compare-button.is-disabled,
        .worth-it-vehicle-compare-button:disabled {
            opacity: 0.48;
            cursor: not-allowed;
        }

        .worth-it-vehicle-compare-button.is-disabled:hover,
        .worth-it-vehicle-compare-button:disabled:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.14);
            box-shadow: none;
            transform: none;
        }

        .cars-compare-live-header,
        .cars-compare-live-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
        }

        .cars-compare-live-header > div {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .cars-compare-live-kicker {
            font-size: 0.78rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            opacity: 0.68;
        }

        .cars-compare-live-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
        }

        .cars-compare-live-card {
            position: relative;
            min-width: 0;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 15px;
            background: rgba(255, 255, 255, 0.035);
            color: inherit;
            text-align: left;
        }

        .cars-compare-live-card:not(.cars-compare-live-empty-slot) {
            display: grid;
            grid-template-columns: 92px minmax(0, 1fr);
            min-height: 108px;
        }

        .cars-compare-live-card-image {
            display: grid;
            place-items: center;
            min-height: 108px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.05);
        }

        .cars-compare-live-card-image img {
            display: block;
            width: 100%;
            height: 100%;
            min-height: 108px;
            object-fit: cover;
        }

        .cars-compare-live-card-image span {
            font-size: 2rem;
            opacity: 0.75;
        }

        .cars-compare-live-card-body {
            display: flex;
            min-width: 0;
            flex-direction: column;
            justify-content: center;
            gap: 4px;
            padding: 13px 34px 13px 13px;
        }

        .cars-compare-live-card-body small {
            font-size: 0.72rem;
            opacity: 0.6;
        }

        .cars-compare-live-card-body strong {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .cars-compare-live-details,
        .cars-compare-live-clear,
        .cars-compare-live-open {
            border: 0;
            cursor: pointer;
            font: inherit;
            font-weight: 800;
        }

        .cars-compare-live-details {
            align-self: flex-start;
            padding: 0;
            background: transparent;
            color: inherit;
            opacity: 0.68;
            font-size: 0.76rem;
        }

        .cars-compare-live-details:hover {
            opacity: 1;
        }

        .cars-compare-live-remove {
            position: absolute;
            top: 8px;
            right: 8px;
            display: grid;
            place-items: center;
            width: 24px;
            height: 24px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.42);
            color: #fff;
            font-size: 17px;
            line-height: 1;
            cursor: pointer;
            z-index: 2;
        }

        .cars-compare-live-remove:hover {
            background: rgba(255, 255, 255, 0.16);
        }

        .cars-compare-live-empty-slot {
            display: flex;
            min-height: 108px;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 16px;
            border-style: dashed;
            background: rgba(255, 255, 255, 0.02);
            color: inherit;
            cursor: pointer;
        }

        .cars-compare-live-empty-slot:hover {
            border-color: rgba(124, 58, 237, 0.6);
            background: rgba(124, 58, 237, 0.06);
        }

        .cars-compare-live-empty-plus {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.07);
            font-size: 1.3rem;
        }

        .cars-compare-live-empty-slot small {
            color: var(--muted);
            text-align: center;
        }

        .cars-compare-live-clear {
            padding: 7px 10px;
            border-radius: 9px;
            background: rgba(255, 255, 255, 0.06);
            color: inherit;
            font-size: 0.78rem;
        }

        .cars-compare-live-clear:hover {
            background: rgba(255, 255, 255, 0.11);
        }

        .cars-compare-live-footer {
            padding-top: 2px;
        }

        .cars-compare-live-footer > span {
            min-width: 0;
            color: var(--muted);
            font-size: 0.82rem;
            line-height: 1.45;
        }

        .cars-compare-live-open {
            flex: 0 0 auto;
            min-height: 42px;
            padding: 9px 14px;
            border: 1px solid rgba(124, 58, 237, 0.34);
            border-radius: 10px;
            background: linear-gradient(
                135deg,
                rgba(124, 58, 237, 0.17),
                rgba(37, 99, 235, 0.14)
            );
            color: inherit;
        }

        .cars-compare-live-open:hover:not(:disabled) {
            border-color: rgba(124, 58, 237, 0.7);
            transform: translateY(-1px);
        }

        .cars-compare-live-open:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        html[data-theme="light"] .cars-compare-live,
        html[data-theme="light"] .cars-compare-live-card {
            border-color: rgba(0, 0, 0, 0.09);
            background: rgba(0, 0, 0, 0.025);
        }

        html[data-theme="light"] .cars-compare-live-empty {
            border-color: rgba(0, 0, 0, 0.14);
            background: rgba(0, 0, 0, 0.018);
        }

        html[data-theme="light"] .cars-compare-live-remove {
            background: rgba(255, 255, 255, 0.78);
            color: #171717;
        }

        html[data-theme="light"] .cars-compare-live-clear {
            background: rgba(0, 0, 0, 0.05);
            color: #171717;
        }

        @media (max-width: 760px) {
            .cars-compare-live-grid {
                grid-template-columns: 1fr;
            }

            .cars-compare-live-header,
            .cars-compare-live-footer {
                align-items: flex-start;
                flex-direction: column;
            }

            .cars-compare-live-open {
                width: 100%;
            }

            .cars-compare-live-card:not(.cars-compare-live-empty-slot) {
                grid-template-columns: 82px minmax(0, 1fr);
            }
        }

        .worth-it-vehicle-compare-bar {
            position: fixed;
            left: 16px;
            right: 16px;
            bottom: 16px;
            z-index: 99970;
            pointer-events: auto;
        }

        .worth-it-vehicle-compare-bar-inner {
            display: flex;
            gap: 16px;
            align-items: center;
            justify-content: space-between;
            max-width: 1100px;
            margin: 0 auto;
            padding: 12px 14px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            background: rgba(17, 19, 24, 0.94);
            backdrop-filter: blur(12px);
            box-shadow: 0 16px 50px rgba(0, 0, 0, 0.32);
        }

        .worth-it-vehicle-compare-items {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            min-width: 0;
        }

        .worth-it-vehicle-compare-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 260px;
            padding: 8px 10px 8px 12px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.07);
            font-size: 0.83rem;
        }

        .worth-it-vehicle-compare-chip span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .worth-it-vehicle-compare-chip button {
            width: 22px;
            height: 22px;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: #fff;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
        }

        .worth-it-vehicle-compare-chip button:hover {
            background: rgba(255, 255, 255, 0.11);
        }

        .worth-it-vehicle-compare-bar-actions {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
        }

        .worth-it-vehicle-compare-bar-actions span {
            font-size: 0.78rem;
            opacity: 0.65;
        }

        .worth-it-vehicle-compare-open {
            min-height: 40px;
            padding: 0 16px;
            border: 0;
            border-radius: 10px;
            background: #fff;
            color: #111318;
            font-weight: 800;
            cursor: pointer;
        }

        .worth-it-vehicle-compare-open:disabled {
            cursor: default;
            opacity: 0.45;
        }

        .worth-it-vehicle-comparison-heading p {
            margin: 10px 0 0;
            opacity: 0.68;
        }

        .worth-it-vehicle-comparison-meta {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 14px;
        }

        .worth-it-vehicle-comparison-meta span {
            display: inline-flex;
            align-items: center;
            min-height: 28px;
            padding: 0 10px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.035);
            font-size: 0.76rem;
            opacity: 0.76;
        }

        .worth-it-vehicle-comparison-table-wrap {
            margin-top: 24px;
            overflow: auto;
            max-height: min(620px, calc(100vh - 250px));
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
        }

        .worth-it-vehicle-comparison-table {
            width: max-content;
            min-width: 100%;
            border-collapse: separate;
            border-spacing: 0;
        }

        .worth-it-vehicle-comparison-table th,
        .worth-it-vehicle-comparison-table td {
            padding: 13px 14px;
            border-right: 1px solid rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
            text-align: left;
            vertical-align: top;
        }

        .worth-it-vehicle-comparison-table thead th {
            position: sticky;
            top: 0;
            z-index: 8;
            background: #171a20;
        }

        .worth-it-vehicle-comparison-specification-header {
            left: 0;
            z-index: 10 !important;
            min-width: 150px;
        }

        .worth-it-vehicle-comparison-vehicle-header {
            min-width: 220px;
            width: 220px;
        }

        .worth-it-vehicle-comparison-vehicle-card {
            position: relative;
            display: flex;
            align-items: center;
            gap: 12px;
            min-height: 86px;
            padding-right: 28px;
        }

        .worth-it-vehicle-comparison-vehicle-image-wrap {
            width: 86px;
            height: 68px;
            flex: 0 0 86px;
            overflow: hidden;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.06);
        }

        .worth-it-vehicle-comparison-vehicle-image,
        .worth-it-vehicle-comparison-vehicle-image-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
        }

        .worth-it-vehicle-comparison-vehicle-image {
            object-fit: cover;
        }

        .worth-it-vehicle-comparison-vehicle-image-placeholder {
            font-size: 2rem;
            opacity: 0.72;
        }

        .worth-it-vehicle-comparison-vehicle-info {
            min-width: 0;
        }

        .worth-it-vehicle-comparison-vehicle-info strong {
            display: block;
            line-height: 1.3;
            word-break: break-word;
        }

        .worth-it-vehicle-comparison-vehicle-kind {
            margin-bottom: 5px;
            font-size: 0.72rem;
            font-weight: 500;
            opacity: 0.58;
        }

        .worth-it-vehicle-comparison-remove {
            position: absolute;
            top: 0;
            right: 0;
            width: 26px;
            height: 26px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.06);
            color: #fff;
            cursor: pointer;
            font-size: 17px;
            line-height: 1;
        }

        .worth-it-vehicle-comparison-remove:hover,
        .worth-it-vehicle-comparison-remove:focus-visible {
            background: rgba(255, 255, 255, 0.13);
        }

        .worth-it-vehicle-comparison-table tbody .worth-it-vehicle-comparison-label-cell {
            position: sticky;
            left: 0;
            z-index: 5;
            min-width: 150px;
            background: #111318;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.72);
        }

        .worth-it-vehicle-comparison-section-row th {
            position: sticky;
            left: 0;
            z-index: 4;
            padding: 11px 14px;
            background: #171a20;
            color: rgba(255, 255, 255, 0.86);
            font-size: 0.78rem;
            letter-spacing: 0.03em;
            text-transform: uppercase;
        }

        .worth-it-vehicle-comparison-different-row {
            background: rgba(255, 255, 255, 0.018);
        }

        .worth-it-vehicle-comparison-different-cell {
            position: relative;
            font-weight: 700;
        }

                .worth-it-vehicle-comparison-difference-dot {
            display: inline-block;
            width: 6px;
            height: 6px;
            margin: 0 7px 2px 0;
            border-radius: 50%;
            background: currentColor;
            opacity: 0.7;
        }

                /*
         * Keep the normal Show All / Show Less control aligned to
         * the right edge of the Cars results area, matching the side
         * where users normally scroll.
         */
        .cars-expand-wrapper {
            width: 100%;
            display: flex;
            justify-content: flex-end;
            align-items: center;
            margin-top: 0;
            box-sizing: border-box;
        }

        .cars-expand-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            margin-top: 12px;
            padding: 0 16px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 12px;
            background: rgba(17, 19, 24, 0.95);
            color: #fff;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
            font-weight: 800;
            cursor: pointer;
            transition:
                transform 0.2s ease,
                background 0.2s ease,
                box-shadow 0.2s ease,
                opacity 0.2s ease;
        }

        .cars-expand-button:hover {
            transform: scale(1.04);
            background: rgba(25, 28, 35, 0.98);
            border-color: rgba(139, 92, 246, 0.75);
            box-shadow:
                0 0 0 2px rgba(139, 92, 246, 0.18),
                0 12px 32px rgba(0, 0, 0, 0.34);
        }

        .cars-expand-button:disabled {
            cursor: wait;
            opacity: 0.65;
            transform: none;
        }


        .cars-results-actions {
            position: absolute;
            top: 0;
            right: 0;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            z-index: 2;
        }

        .cars-block-header {
            position: relative;
            padding-right: 100px;
        }

        .cars-refresh-button {
            width: 40px;
            height: 40px;
            padding: 0;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.06);
            color: inherit;
            font-size: 1.28rem;
            font-weight: 800;
            line-height: 1;
            cursor: pointer;
            transition:
                transform 0.16s ease,
                background 0.16s ease,
                border-color 0.16s ease,
                opacity 0.16s ease;
        }

        .cars-refresh-button:hover,
        .cars-refresh-button:focus-visible {
            transform: rotate(-12deg) scale(1.04);
            background: rgba(255, 255, 255, 0.11);
            border-color: rgba(139, 92, 246, 0.65);
            outline: none;
        }

        .cars-refresh-button:disabled {
            cursor: wait;
            opacity: 0.62;
        }

        .cars-refresh-button.is-loading {
            animation: carsRefreshSpin 0.75s linear infinite;
        }

        .cars-refresh-info-wrap {
            position: relative;
            display: inline-flex;
            align-items: center;
        }

        .cars-refresh-info-button {
            flex: 0 0 22px;
        }

        .cars-refresh-tooltip {
            position: absolute;
            top: calc(100% + 9px);
            right: 0;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 7px;
            width: min(390px, calc(100vw - 32px));
            padding: 12px 14px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 11px;
            background: rgba(17, 19, 24, 0.97);
            color: #f5f7fa;
            box-shadow: 0 14px 35px rgba(0, 0, 0, 0.3);
            font-size: 0.78rem;
            line-height: 1.5;
            text-align: left;
        }

        .cars-refresh-tooltip[hidden] {
            display: none;
        }

        .cars-refresh-tooltip strong {
            font-size: 0.8rem;
        }

        @keyframes carsRefreshSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        html[data-theme="light"] .cars-refresh-button {
            border-color: rgba(0, 0, 0, 0.14);
            background: rgba(0, 0, 0, 0.045);
            color: #16181d;
        }

        html[data-theme="light"] .cars-refresh-button:hover,
        html[data-theme="light"] .cars-refresh-button:focus-visible {
            background: rgba(0, 0, 0, 0.08);
            border-color: rgba(124, 58, 237, 0.55);
        }

        @media (max-width: 760px) {
            .cars-block-header {
                padding-right: 92px;
            }

            .cars-results-actions {
                gap: 5px;
            }

            .cars-refresh-button {
                width: 38px;
                height: 38px;
            }

            .cars-refresh-tooltip {
                right: -2px;
            }
        }

        /* Floating Show Less button */
        /*
         * Uses the simple Worth It floating-control style and shares
         * the same position/visibility behavior as the other sections.
         */
        .worth-it-vehicle-floating-collapse {
            position: fixed !important;
            right: max(8px, calc((100vw - 1180px) / 2 - 140px)) !important;
            top: 50% !important;
            z-index: 9999 !important;

            min-height: 56px !important;
            padding: 12px 16px !important;

            border: 1px solid var(--border) !important;
            border-radius: 14px !important;

            background: var(--surface-soft) !important;
            color: var(--text) !important;
            font: inherit !important;
            font-size: .90rem !important;
            font-weight: 900 !important;
            cursor: pointer !important;
            white-space: nowrap !important;

            box-shadow: 0 12px 32px rgba(0,0,0,.22) !important;

            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;

            transform: translateY(-40%) !important;

            transition:
                opacity .20s ease,
                visibility .20s ease,
                transform .20s ease,
                border-color .20s ease,
                background .20s ease !important;
        }

        .worth-it-vehicle-floating-collapse.is-visible {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
            transform: translateY(-50%) !important;
        }

        .worth-it-vehicle-floating-collapse:hover {
            border-color: rgba(124,92,255,.65) !important;
            background: rgba(124,92,255,.10) !important;
            transform: translateY(calc(-50% - 2px)) scale(1.035) !important;
        }

        @media (max-width: 1400px) and (min-width: 701px) {
            .worth-it-vehicle-floating-collapse {
                right: 8px !important;
            }
        }

        @media (max-width: 1024px) {
            .worth-it-vehicle-floating-collapse {
                right: 14px !important;
            }
        }

        @media (max-width: 700px) {
            .worth-it-vehicle-floating-collapse {
                right: 8px !important;
                top: 50% !important;
                min-height: 56px !important;
                padding: 12px 16px !important;
                font-size: .90rem !important;
            }
        }

        html[data-ui-scale="small"] .worth-it-vehicle-floating-collapse {
            min-height: 62px !important;
            padding: 13px 18px !important;
            font-size: 1rem !important;
        }

        html[data-ui-scale="large"] .worth-it-vehicle-floating-collapse {
            right: 4px !important;
            min-height: 46px !important;
            padding: 10px 16px !important;
            font-size: .82rem !important;
        }

        html[data-ui-scale="xl"] .worth-it-vehicle-floating-collapse {
            right: 0 !important;
            min-height: 46px !important;
            padding: 10px 16px !important;
            font-size: .82rem !important;
        }

        .worth-it-vehicle-compare-notice {
            position: fixed;
            left: 50%;
            bottom: 100px;
            z-index: 100000;
            transform: translate(-50%, 20px);
            opacity: 0;
            pointer-events: none;
            padding: 12px 16px;
            border-radius: 10px;
            background: rgba(17, 19, 24, 0.96);
            color: #fff;
            transition: opacity 0.2s ease, transform 0.2s ease;
            box-shadow: 0 12px 35px rgba(0, 0, 0, 0.28);
        }

        .worth-it-vehicle-compare-notice.is-visible {
            opacity: 1;
            transform: translate(-50%, 0);
        }

        @media (max-width: 760px) {
            .worth-it-vehicle-modal {
                padding: 10px;
            }

            .worth-it-vehicle-modal-dialog {
                max-height: calc(100vh - 20px);
                border-radius: 16px;
            }

            .worth-it-vehicle-modal-body {
                padding: 18px;
            }

            .cars-popularity-tooltip {
                left: auto;
                right: 0;
                transform: none;
                width: min(340px, calc(100vw - 32px));
            }

            .worth-it-vehicle-detail-header {
                grid-template-columns: 1fr;
                gap: 16px;
            }

            .worth-it-vehicle-detail-image-wrap,
            .worth-it-vehicle-detail-image,
            .worth-it-vehicle-detail-image-placeholder {
                min-height: 210px;
                height: 210px;
            }

            .worth-it-vehicle-spec-grid {
                grid-template-columns: 1fr;
            }

            .worth-it-vehicle-compare-bar {
                left: 8px;
                right: 8px;
                bottom: 8px;
            }

            .worth-it-vehicle-compare-bar-inner {
                flex-direction: column;
                align-items: stretch;
            }

            .worth-it-vehicle-compare-bar-actions {
                justify-content: space-between;
            }

            .worth-it-vehicle-comparison-table-wrap {
                max-height: calc(100vh - 215px);
            }

            .worth-it-vehicle-comparison-vehicle-header {
                min-width: 200px;
                width: 200px;
            }

            .worth-it-vehicle-comparison-vehicle-card {
                min-height: 76px;
            }

            .worth-it-vehicle-comparison-vehicle-image-wrap {
                width: 70px;
                height: 58px;
                flex-basis: 70px;
            }

            .worth-it-vehicle-comparison-vehicle-image-placeholder {
                font-size: 1.7rem;
            }

            .worth-it-vehicle-comparison-meta {
                margin-top: 12px;
            }

            .worth-it-vehicle-compare-notice {
                left: 12px;
                right: 12px;
                bottom: 150px;
                transform: translateY(20px);
                text-align: center;
            }

            .worth-it-vehicle-compare-notice.is-visible {
                transform: translateY(0);
            }
        }

        html[data-theme="light"] .worth-it-vehicle-modal-dialog,
        html[data-theme="light"] .worth-it-vehicle-compare-bar-inner,
        html[data-theme="light"] .worth-it-vehicle-compare-notice,
        html[data-theme="light"] .worth-it-vehicle-floating-collapse {
            background: #ffffff;
            color: #16181d;
        }

        html[data-theme="light"] .worth-it-vehicle-modal-close,
        html[data-theme="light"] .worth-it-vehicle-compare-chip button {
            background: rgba(0, 0, 0, 0.05);
            color: #16181d;
        }

        html[data-theme="light"] .worth-it-vehicle-description,
        html[data-theme="light"] .worth-it-vehicle-detail-generation,
        html[data-theme="light"] .worth-it-vehicle-spec-item span,
        html[data-theme="light"] .worth-it-vehicle-compare-bar-actions span,
        html[data-theme="light"] .worth-it-vehicle-comparison-table tbody th {
            color: rgba(22, 24, 29, 0.66);
        }

        html[data-theme="light"] .worth-it-vehicle-spec-item,
        html[data-theme="light"] .worth-it-vehicle-no-specs,
        html[data-theme="light"] .worth-it-vehicle-detail-loading,
        html[data-theme="light"] .worth-it-vehicle-detail-image-wrap,
        html[data-theme="light"] .worth-it-vehicle-detail-image-placeholder,
        html[data-theme="light"] .worth-it-vehicle-compare-chip,
        html[data-theme="light"] .worth-it-vehicle-comparison-table-wrap {
            background: rgba(0, 0, 0, 0.035);
            border-color: rgba(0, 0, 0, 0.08);
        }

        html[data-theme="light"] .worth-it-vehicle-comparison-table thead th {
            background: #f4f5f7;
        }

        html[data-theme="light"] .worth-it-vehicle-comparison-meta span,
        html[data-theme="light"] .worth-it-vehicle-comparison-vehicle-image-wrap {
            background: rgba(0, 0, 0, 0.035);
            border-color: rgba(0, 0, 0, 0.08);
        }

        html[data-theme="light"] .worth-it-vehicle-comparison-remove {
            background: rgba(0, 0, 0, 0.05);
            color: #16181d;
            border-color: rgba(0, 0, 0, 0.08);
        }

        html[data-theme="light"] .worth-it-vehicle-comparison-remove:hover,
        html[data-theme="light"] .worth-it-vehicle-comparison-remove:focus-visible {
            background: rgba(0, 0, 0, 0.1);
        }

        html[data-theme="light"] .worth-it-vehicle-comparison-table tbody .worth-it-vehicle-comparison-label-cell {
            background: #ffffff;
            color: rgba(22, 24, 29, 0.66);
        }

        html[data-theme="light"] .worth-it-vehicle-comparison-section-row th {
            background: #f4f5f7;
            color: rgba(22, 24, 29, 0.72);
        }

        html[data-theme="light"] .worth-it-vehicle-compare-open {
            background: #16181d;
            color: #fff;
        }
    `;

    document.head.appendChild(style);

}


function handleVehicleUiEscapeKey(
    event
) {

    if (event.key !== "Escape") {
        return;
    }

    const compareModal =
        document.getElementById(
            "worthItVehicleComparisonModal"
        );

    if (compareModal?.classList.contains("is-open")) {
        closeVehicleComparisonPanel();
        return;
    }

    const detailModal =
        document.getElementById(
            "worthItVehicleDetailsModal"
        );

    if (detailModal?.classList.contains("is-open")) {
        closeVehicleDetailsPanel();
    }

}


function handleVehicleScroll() {

    updateVehicleFloatingCollapseButton();

}


/*
 * ============================================================
 * CATEGORY HEADER
 * ============================================================
 */

function ensureCarsResultsHeaderActions(
    header
) {

    if (!header) return null;

    let actions = header.querySelector(".cars-results-actions");

    const duplicates = header.querySelectorAll(".cars-results-actions");
    duplicates.forEach((element, index) => {
        if (index > 0) element.remove();
    });

    if (!actions) {
        actions = document.createElement("div");
        actions.className = "cars-results-actions";
        header.appendChild(actions);
    }

    actions.innerHTML = "";
    return actions;
}


function renderPopularRefreshControls(
    header,
    kind
) {

    if (!header) return;

    const actions = ensureCarsResultsHeaderActions(header);
    if (!actions) return;

    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "cars-refresh-button";
    refreshButton.setAttribute("aria-label", "Refresh popular vehicles");
    refreshButton.title = "Refresh popular vehicles";
    refreshButton.textContent = "↻";

    const infoWrap = document.createElement("span");
    infoWrap.className = "cars-refresh-info-wrap";

    const infoButton = document.createElement("button");
    infoButton.type = "button";
    infoButton.className = "cars-popularity-info-button cars-refresh-info-button";
    infoButton.setAttribute("aria-label", "Refresh information");
    infoButton.setAttribute("aria-expanded", "false");
    infoButton.setAttribute("aria-controls", "carsRefreshTooltip");
    infoButton.title = "What does Refresh do?";
    infoButton.textContent = "ⓘ";

    const tooltip = document.createElement("span");
    tooltip.id = "carsRefreshTooltip";
    tooltip.className = "cars-refresh-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    tooltip.innerHTML =
        "<strong>Refresh</strong>" +
        "<span>Refreshes the currently selected vehicle category. " +
        "The first 8 cards are shown as soon as reliable information " +
        "is available. Images load separately and never block the cards, " +
        "and existing cached information is reused when possible.</span>";

    infoWrap.appendChild(infoButton);
    infoWrap.appendChild(tooltip);
    actions.appendChild(refreshButton);
    actions.appendChild(infoWrap);

    infoButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        const shouldOpen = tooltip.hidden;
        tooltip.hidden = !shouldOpen;
        infoButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        infoWrap.classList.toggle("is-open", shouldOpen);
    });

    refreshButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        if (refreshButton.disabled) return;

        void refreshPopularVehicleCategory(
            currentVehicleKind,
            refreshButton
        );
    });
}


function updateCarsCategoryHeader(
    mode = "popular",
    kind = currentVehicleKind
) {

    const title = document.getElementById("carsResultsTitle");
    const description = document.getElementById("carsResultsDescription");

    if (!title || !description) return;

    const header = title.parentElement;
    if (!header) return;

    const info = getVehicleKindInfo(kind);

    const existingActions = header.querySelectorAll(".cars-results-actions");
    existingActions.forEach(element => element.remove());

    if (mode === "search") {
        title.textContent = "🔍 " + info.plural + " Search";
        description.classList.remove("cars-results-description-with-info");
        description.innerHTML =
            '<span class="cars-results-description-text">' +
            escapeVehicleHtml(
                "Search results from the VehiclesDB " +
                info.singular.toLowerCase() +
                " catalog."
            ) +
            "</span>";
        return;
    }

    title.textContent = info.title;
    renderPopularRefreshControls(header, kind);

    description.classList.add("cars-results-description-with-info");
    description.innerHTML =
        '<span class="cars-results-description-text">' +
        escapeVehicleHtml(info.description) +
        '</span>' +
        '<span class="cars-popularity-info-wrap">' +
            '<button type="button" class="cars-popularity-info-button"' +
                ' aria-label="Popularity information"' +
                ' aria-expanded="false"' +
                ' aria-controls="carsPopularityTooltip"' +
                ' title="Popularity information">' +
                'ⓘ' +
            '</button>' +
            '<span id="carsPopularityTooltip" class="cars-popularity-tooltip"' +
                ' role="tooltip" hidden>' +
                '<strong>Popularity note</strong>' +
                '<span>' + escapeVehicleHtml(VEHICLE_POPULARITY_NOTE) + '</span>' +
            '</span>' +
        '</span>';

    const infoButton = description.querySelector(".cars-popularity-info-button");
    const infoWrap = description.querySelector(".cars-popularity-info-wrap");
    const tooltip = description.querySelector(".cars-popularity-tooltip");

    if (!infoButton || !infoWrap || !tooltip) return;

    infoButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        const shouldOpen = tooltip.hidden;
        tooltip.hidden = !shouldOpen;
        infoButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        infoWrap.classList.toggle("is-open", shouldOpen);
    });


document.addEventListener("click", event => {
        if (!infoWrap.contains(event.target)) {
            tooltip.hidden = true;
            infoButton.setAttribute("aria-expanded", "false");
            infoWrap.classList.remove("is-open");
        }
    }, { once: true });
}

/*
 * ============================================================
 * BACKGROUND VEHICLE CATALOG PRELOAD
 * ============================================================
 */

/*
 * Keep category switching fast. The catalog requests contain only
 * vehicle metadata; Wikipedia/Wikimedia detail/image requests are
 * still started only for the active category.
 */


async function preloadVehicleInformationForCategory(
    kind
) {

    const catalog =
        vehicleCatalogCache.get(kind) || [];

    if (!catalog.length) {
        return;
    }

    const candidates =
        getPopularVehicles(
            catalog
        );

    if (!candidates.length) {
        return;
    }

    const initialCount =
        Math.min(
            8,
            candidates.length
        );

    try {

        /*
         * Warm exactly the amount needed for the first two rows.
         * ensurePopularVehicleQuality shares its in-flight promise with
         * the active category, so a click during this preload waits for
         * the same requests rather than starting duplicates.
         */
        await ensurePopularVehicleQuality(
            kind,
            candidates,
            initialCount,
            48
        );

    } catch (error) {

        console.warn(
            `Background vehicle information preload failed for ${kind}:`,
            error
        );

    }

}


let vehicleCategoryPreloadPromise =
    null;

function preloadVehicleCategoryCatalogs(
    excludeKind = null
) {

    if (
        vehicleCategoryPreloadPromise
    ) {
        return vehicleCategoryPreloadPromise;
    }

    const kindsToPreload =
        VEHICLE_KINDS.filter(
            kind =>
                kind !== excludeKind &&
                !vehicleCatalogCache.has(kind)
        );

    if (!kindsToPreload.length) {
        return Promise.resolve();
    }

    vehicleCategoryPreloadPromise =
        (async () => {

            /*
             * Stage 1: fetch all lightweight VehiclesDB catalogs together.
             */
            await Promise.all(
                kindsToPreload.map(
                    kind =>
                        fetchVehicleCatalog(
                            kind
                        ).catch(
                            error => {

                                console.warn(
                                    `Background catalog preload failed for ${kind}:`,
                                    error
                                );

                                return [];

                            }
                        )
                )
            );

            /*
             * Stage 2: warm the first two rows of vehicle information.
             * Limit this to three categories at once so the active Cars
             * category and visible images are not starved of bandwidth.
             */
            const queue =
                kindsToPreload.slice();

            const worker =
                async () => {

                    while (
                        queue.length
                    ) {

                        const kind =
                            queue.shift();

                        if (!kind) {
                            return;
                        }

                        const catalog =
                            vehicleCatalogCache.get(
                                kind
                            ) || [];

                        if (!catalog.length) {
                            continue;
                        }

                        const candidates =
                            getPopularVehicles(
                                catalog
                            );

                        if (!candidates.length) {
                            continue;
                        }

                        const warmCount =
                            Math.min(
                                8,
                                candidates.length
                            );

                        try {

                            await enrichVehicleCategoryWithSupplementalSources(
                                kind
                            );

                            const refreshedCatalog =
                                vehicleCatalogCache.get(
                                    kind
                                ) ||
                                catalog;

                            const refreshedCandidates =
                                getPopularVehicles(
                                    refreshedCatalog
                                );

                            await ensurePopularVehicleQuality(
                                kind,
                                refreshedCandidates,
                                warmCount,
                                getPopularInitialCheckLimit(kind)
                            );

                        } catch (error) {

                            console.warn(
                                `Background vehicle information preload failed for ${kind}:`,
                                error
                            );

                        }

                    }

                };

            await Promise.all(
                Array.from(
                    {
                        length:
                            Math.min(
                                3,
                                queue.length
                            )
                    },
                    worker
                ).map(
                    task =>
                        task
                )
            );

        })().finally(
            () => {

                vehicleCategoryPreloadPromise =
                    null;

            }
        );

    return vehicleCategoryPreloadPromise;

}



/*
 * ============================================================
 * VEHICLE CATEGORY NAVIGATION
 * ============================================================
 */

function renderVehicleCategoryButtons() {

    const categoryGrid =
        document.querySelector(
            "#carsSection .cars-category-grid"
        );


    if (!categoryGrid) {

        return;

    }


    categoryGrid.innerHTML =
        "";


    for (
        const kind of VEHICLE_KINDS
    ) {

        const info =
            getVehicleKindInfo(
                kind
            );


        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.className =
            "cars-category-card";


        button.dataset.vehicleKind =
            kind;


        button.innerHTML = `

            <span>
                ${info.icon}
            </span>

            <strong>
                ${info.plural}
            </strong>

            <small>
                Explore ${info.plural.toLowerCase()}
            </small>

        `;


        button.addEventListener(
            "click",
            () => {

                filterCarsByCategory(
                    kind
                );

            }
        );


        categoryGrid.appendChild(
            button
        );

    }

}


/*
 * ============================================================
 * LOAD + SHOW CATEGORY
 * ============================================================
 */

async function filterCarsByCategory(
    kind
) {

    if (
        !VEHICLE_KINDS.includes(kind)
    ) {

        kind =
            "car";

    }


    currentVehicleKind =
        kind;


    currentVehicleShowAll =
        false;

    currentVehicleMode =
        "popular";

    popularVehicleHydrationState.delete(
        `quality-retry:${kind}`
    );

    closeVehicleDetailsPanel(false);
    hideVehicleFloatingCollapseButton();


    const info =
        getVehicleKindInfo(
            kind
        );


    updateCarsCategoryHeader(
        "popular",
        kind
    );


    const oldExpandButton =
        document.getElementById(
            "carsVehicleExpandButton"
        );


    if (oldExpandButton) {

        oldExpandButton.remove();

    }


    const grid =
        document.getElementById(
            "popularCarsGrid"
        );


    if (grid) {

        grid.innerHTML = `

            <div class="cars-empty-state">

                <div class="cars-empty-icon">
                    ${info.icon}
                </div>

                <strong>
                    Loading ${info.plural.toLowerCase()}...
                </strong>

                <p>
                    Loading the latest VehiclesDB catalog and checking available vehicle information.
                </p>

            </div>

        `;

    }


    /*
     * Usually this resolves from the background-preloaded catalog
     * immediately, matching the behaviour of the Cars category.
     */
    let vehicles =
        await fetchVehicleCatalog(
            kind
        );

    /*
     * A temporary CDN failure can return an empty result without meaning
     * that the category is actually empty. Try the catalog once more before
     * presenting the user with an empty category.
     */
    if (
        !vehicles.length
    ) {

        await new Promise(
            resolve =>
                window.setTimeout(
                    resolve,
                    350
                )
        );

        if (
            currentVehicleKind !== kind ||
            currentVehicleMode !== "popular"
        ) {
            return;
        }

        vehicles =
            await fetchVehicleCatalog(
                kind
            );

    }

    currentVehicleCatalog =
        vehicles;

    await loadAndRenderPopularVehicles(
        kind,
        false
    );

}


/*
 * ============================================================
 * SEARCH CURRENT CATEGORY
 * ============================================================
 */

function handleVehicleSearch(
    query
) {

    const hasQuery =
        String(query || "").trim();


    currentVehicleShowAll =
        false;

    currentVehicleMode =
        String(query || "").trim()
            ? "search"
            : "popular";

    hideVehicleFloatingCollapseButton();

    const results =
        searchVehicleCatalog(
            currentVehicleCatalog,
            query
        );


    if (hasQuery) {

        updateCarsCategoryHeader(
            "search",
            currentVehicleKind
        );


        renderVehicleCards(
            results,
            currentVehicleKind,
            true
        );

    } else {

        updateCarsCategoryHeader(
            "popular",
            currentVehicleKind
        );

        const grid =
            document.getElementById(
                "popularCarsGrid"
            );

        if (grid) {
            grid.innerHTML = `
                <div class="cars-empty-state">
                    <div class="cars-empty-icon">
                        ${getVehicleKindInfo(currentVehicleKind).icon}
                    </div>
                    <strong>
                        Preparing popular ${getVehicleKindInfo(currentVehicleKind).plural.toLowerCase()}...
                    </strong>
                    <p>
                        Checking the most popular candidates for usable vehicle information.
                    </p>
                </div>
            `;
        }

        void loadAndRenderPopularVehicles(
            currentVehicleKind,
            false
        );

    }

}


/*
 * ============================================================
 * OPEN CARS
 * ============================================================
 */

async function openCars() {

    /*
     * Cars is a standalone top-level section. Hide everything else
     * inside <main> before doing any asynchronous catalog work.
     * This prevents the section we came from from remaining visible
     * above/below Cars while its data is loading.
     */
    const carsSection =
        document.getElementById(
            "carsSection"
        );

    if (!carsSection) {
        return;
    }

    /*
     * Markets and Currencies live outside <main>, so the generic
     * main-children hide below cannot hide them. Explicitly close
     * those sections before showing Cars.
     */
    const marketsSection =
        document.getElementById("marketsSection");

    if (marketsSection) {
        marketsSection.style.display = "none";
    }

    const moneySection =
        document.getElementById("moneySection");

    if (moneySection) {
        moneySection.style.display = "none";
    }

    document
        .querySelectorAll("main > *")
        .forEach(
            element => {

                element.style.display =
                    element === carsSection
                        ? "block"
                        : "none";

            }
        );

    /*
     * Keep the existing safety rule for nested sections as well.
     */
    document
        .querySelectorAll(".app")
        .forEach(
            app => {

                app.classList.remove(
                    "active"
                );

                app.style.display =
                    "none";

            }
        );

    const homePage =
        document.getElementById(
            "homePage"
        );

    if (homePage) {
        homePage.style.display =
            "none";
    }

    const settingsPanel =
        document.getElementById(
            "settingsPanel"
        );

    if (settingsPanel) {
        settingsPanel.style.display =
            "none";
    }

    /*
     * Start Cars at the top immediately, before waiting for any API
     * requests. This is important when Cars was opened from a page
     * where the user was already scrolled far down.
     */
    window.scrollTo({
        top: 0,
        behavior: "auto"
    });

    hideVehicleFloatingCollapseButton();

    /*
     * Restore the live Compare UI when returning to Cars.
     * The selected vehicles are intentionally preserved across
     * section navigation.
     */
    renderVehicleCompareBar();


    /*
     * Build the five public vehicle categories.
     */

    renderVehicleCategoryButtons();


    /*
     * Always start with Cars.
     */

    currentVehicleKind =
        "car";


    currentVehicleCatalog =
        [];


    currentVehicleResults =
        [];


    currentVehicleShowAll =
        false;


    updateCarsCategoryHeader(
        "popular",
        "car"
    );


    const oldExpandButton =
        document.getElementById(
            "carsVehicleExpandButton"
        );


    if (oldExpandButton) {

        oldExpandButton.remove();

    }


    const grid =
        document.getElementById(
            "popularCarsGrid"
        );


    if (grid) {

        grid.innerHTML = `

            <div class="cars-empty-state">

                <div class="cars-empty-icon">
                    🚗
                </div>

                <strong>
                    Loading cars...
                </strong>

                <p>
                    Loading the latest VehiclesDB catalog and checking available vehicle information.
                </p>

            </div>

        `;

    }


    /*
     * Load Cars catalog.
     */

    let vehicles =
        await fetchVehicleCatalog(
            "car"
        );

    if (
        !vehicles.length
    ) {

        await new Promise(
            resolve =>
                window.setTimeout(
                    resolve,
                    350
                )
        );

        if (
            currentVehicleKind !== "car" ||
            currentVehicleMode !== "popular"
        ) {
            return;
        }

        vehicles =
            await fetchVehicleCatalog(
                "car"
            );

    }

    currentVehicleCatalog =
        vehicles;

    await loadAndRenderPopularVehicles(
        "car",
        false
    );

    /*
     * After the visible Cars rows are ready, warm the other categories
     * without competing with the active category's initial requests.
     */
    void preloadVehicleCategoryCatalogs(
        "car"
    );


    /*
     * Scroll to Cars.
     */

    window.scrollTo({

        top: 0,

        behavior: "smooth"

    });

}


/*
 * ============================================================
 * ATTRIBUTION
 * ============================================================
 */

function ensureVehiclesDBAttribution() {

    const carsContent =
        document.getElementById(
            "carsContent"
        );


    if (!carsContent) {

        return;

    }


    if (
        document.getElementById(
            "vehiclesDbAttribution"
        )
    ) {

        return;

    }


    const attribution =
        document.createElement(
            "p"
        );


    attribution.id =
        "vehiclesDbAttribution";


    attribution.className =
        "cars-data-attribution";


    attribution.style.marginTop =
        "24px";


    attribution.style.fontSize =
        "0.85rem";


    attribution.style.opacity =
        "0.7";


    attribution.innerHTML = `

        Vehicle data by

        <a
            href="https://github.com/vehiclesdb/vehiclesdb"
            target="_blank"
            rel="noopener noreferrer"
        >
            VehiclesDB
        </a>

        · CC BY 4.0
        · Supplemental vehicle candidates from
        <a
            href="https://www.wikidata.org/"
            target="_blank"
            rel="noopener noreferrer"
        >
            Wikidata
        </a>
        · CC0
        · Additional candidates from
        <a
            href="https://www.dbpedia.org/"
            target="_blank"
            rel="noopener noreferrer"
        >
            DBpedia
        </a>
        · CC BY-SA

    `;


    carsContent.appendChild(
        attribution
    );

}


/*
 * ============================================================
 * GLOBAL FUNCTIONS
 * ============================================================
 */

function openCarsFromMenu() {

    if (typeof closeMoreMenu === "function") {
        closeMoreMenu();
    }

    return openCars();

}


window.openCars =
    openCars;


window.openCarsFromMenu =
    openCarsFromMenu;


window.filterCarsByCategory =
    filterCarsByCategory;


/*
 * ============================================================
 * INITIALIZATION
 * ============================================================
 */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        injectVehicleUiStyles();
        createVehicleDetailsModal();
        createVehicleComparisonModal();
        ensureVehicleFloatingCollapseButton();

        document.addEventListener(
            "keydown",
            handleVehicleUiEscapeKey
        );

        window.addEventListener(
            "scroll",
            handleVehicleScroll,
            { passive: true }
        );

        window.addEventListener(
            "resize",
            updateVehicleFloatingCollapseButton,
            { passive: true }
        );

        window.addEventListener(
            "worthitsettingschange",
            updateVehicleFloatingCollapseButton
        );

        /*
         * The browser cache is namespaced by the authenticated
         * Supabase user. Reset the cached owner key when account
         * state changes so another Google account never reuses the
         * previous account's image/details cache.
         */
        if (
            window.supabaseClient?.auth
        ) {

            window.supabaseClient.auth.onAuthStateChange(
                () => {

                    vehicleAccountCacheOwnerPromise =
                        null;

                }
            );

        }

        /*
         * Create the five public vehicle categories.
         */

        renderVehicleCategoryButtons();


        /*
         * Add attribution.
         */

        ensureVehiclesDBAttribution();


        /*
         * Search.
         */

        const searchInput =
            document.getElementById(
                "carsSearchInput"
            );


        if (!searchInput) {

            return;

        }


        searchInput.addEventListener(
            "input",
            function () {

                handleVehicleSearch(
                    this.value
                );

            }
        );

    }
);