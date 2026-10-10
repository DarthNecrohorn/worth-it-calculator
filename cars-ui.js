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

const VEHICLE_DATASET_MANIFEST_URL =
    "https://cdn.jsdelivr.net/gh/vehiclesdb/vehiclesdb@latest/manifest.json";

const VEHICLE_DETAILS_CACHE_VERSION = "v29";

const MAX_VEHICLES_PER_CATEGORY = 300;

/*
 * The category landing view is intentionally catalog-first. The first
 * 100 unique vehicles must be visible without waiting for Wikipedia,
 * Wikimedia or supplemental quality checks. Those expensive enrichments
 * are background work only.
 */
const IMMEDIATE_POPULAR_CARD_COUNT = 100;
const IMMEDIATE_POPULAR_CATALOG_TARGET = 140;

const MAX_SEARCH_RESULTS = 600;

const INITIAL_VISIBLE_ROWS = 3;

/*
 * Popular Vehicles quality selection.
 *
 * VehiclesDB provides the popularity candidates, while the
 * details endpoint is used only for a limited number of candidates
 * at a time to keep cards with missing Wikipedia/Wikimedia data
 * out of the Popular Vehicles view.
 */
const POPULAR_CANDIDATE_POOL_SIZE = 2500;
const POPULAR_MIN_VALID_CARDS_PER_CATEGORY = 100;
const POPULAR_CAR_INITIAL_VISIBLE_ROWS = 3;
const POPULAR_CAR_INITIAL_CARD_COUNT = 12;
const POPULAR_CAR_INITIAL_MAX_CHECKS = 250;
const POPULAR_CAR_MAX_NEW_CHECKS = 2400;
const POPULAR_NONCAR_CANDIDATE_POOL_SIZE = 2400;
const POPULAR_NONCAR_BASE_CANDIDATE_LIMIT = 1800;
const POPULAR_NONCAR_SUPPLEMENTAL_CANDIDATE_LIMIT = 2200;
const POPULAR_QUALITY_BATCH_SIZE = 10;
const POPULAR_INITIAL_MAX_CHECKS = 40;
const POPULAR_SHOW_ALL_MAX_NEW_CHECKS = 1500;
const VEHICLE_DETAILS_REQUEST_TIMEOUT_MS = 30000;
const VEHICLE_NONCAR_DETAILS_REQUEST_TIMEOUT_MS = 15000;
const UNIFIED_BACKGROUND_WARMUP_DELAY_MS = 250;
const VEHICLE_FAST_DETAILS_REQUEST_TIMEOUT_MS = 5000;
const VEHICLE_IMAGE_DETAILS_REQUEST_TIMEOUT_MS = 8000;
const POPULAR_NONCAR_PROGRESSIVE_BUDGET_MS = 7000;
const POPULAR_NONCAR_EARLY_BASE_COUNT = 120;
const POPULAR_NONCAR_EARLY_SUPPLEMENTAL_COUNT = 400;
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

const VEHICLE_ALL_KIND = "all";
const MAX_UNIFIED_VEHICLES = 2000;
const UNIFIED_BACKGROUND_CANDIDATE_POOL_LIMIT = 6000;
const VEHICLE_FAVORITES_STORAGE_KEY = "worth-it-vehicle-favorites-v1";
const VEHICLE_RECENT_STORAGE_KEY = "worth-it-vehicle-recent-v1";
const VEHICLE_ACCOUNT_METADATA_KEY = "worth_it_vehicle_lists_v1";
const VEHICLE_RECENT_LIMIT = 8;
const VEHICLE_SEARCH_DEBOUNCE_MS = 120;

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

    all: {
        icon: "🚗",
        singular: "Vehicle",
        plural: "Vehicles",
        title: "🚗 All Vehicles",
        description:
            "Explore up to 2,000 vehicles from the connected VehiclesDB dataset."
    },

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

const vehicleLastUpdatedAt = new Map();

let vehicleDatasetMetaPromise = null;
let vehicleDatasetMeta = null;
let vehicleDetailsDatasetVersion = null;

function formatVehicleDatasetBuiltAt(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }

    return date.toLocaleDateString(
        "en-GB",
        {
            year: "numeric",
            month: "short",
            day: "numeric"
        }
    );
}

function updateCarsCatalogCount(count = null) {
    const element =
        document.getElementById("carsCatalogCount");

    if (!element) return;

    const numericCount =
        Number.isFinite(Number(count))
            ? Math.max(0, Math.floor(Number(count)))
            : 0;

    element.textContent =
        numericCount.toLocaleString("en-US") +
        " vehicles currently available";
}

function updateCarsDatasetStatus() {
    const element =
        document.getElementById("carsLastUpdated");

    if (!element) return;

    if (vehicleDatasetMeta?.builtAt) {
        const version =
            vehicleDatasetMeta.version
                ? " " + vehicleDatasetMeta.version
                : "";

        element.textContent =
            "Dataset updated: " +
            formatVehicleDatasetBuiltAt(
                vehicleDatasetMeta.builtAt
            ) +
            " · VehiclesDB" +
            version +
            " · Updates monthly when new data is released.";

        return;
    }

    element.textContent =
        "Dataset update: checking latest VehiclesDB release…";
}

async function fetchVehicleDatasetMetadata(
    force = false
) {
    if (force) {
        vehicleDatasetMetaPromise = null;
    }

    if (vehicleDatasetMetaPromise) {
        return vehicleDatasetMetaPromise;
    }

    vehicleDatasetMetaPromise =
        (async () => {
            try {
                const response =
                    await fetch(
                        VEHICLE_DATASET_MANIFEST_URL,
                        {
                            cache: "no-store",
                            headers: {
                                "Accept":
                                    "application/json"
                            }
                        }
                    );

                if (!response.ok) {
                    throw new Error(
                        "VehiclesDB manifest request failed"
                    );
                }

                const manifest =
                    await response.json();

                if (
                    !manifest ||
                    !manifest.version ||
                    !manifest.built_at
                ) {
                    throw new Error(
                        "Invalid VehiclesDB manifest"
                    );
                }

                const nextDatasetVersion =
                    String(manifest.version);

                if (
                    vehicleDetailsDatasetVersion &&
                    vehicleDetailsDatasetVersion !== nextDatasetVersion
                ) {
                    vehicleDetailsCache.clear();
                    popularVehicleQualityCache.clear();
                }

                vehicleDetailsDatasetVersion =
                    nextDatasetVersion;

                vehicleDatasetMeta = {
                    version:
                        nextDatasetVersion,
                    builtAt:
                        String(manifest.built_at)
                };

                updateCarsDatasetStatus();

                return vehicleDatasetMeta;

            } catch (error) {
                console.warn(
                    "VehiclesDB dataset metadata lookup failed:",
                    error
                );

                updateCarsDatasetStatus();

                return null;
            }
        })();

    return vehicleDatasetMetaPromise;
}

function setVehicleLastUpdated(kind, value = Date.now()) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return;
    vehicleLastUpdatedAt.set(kind, timestamp);
    try { localStorage.setItem("worthit.cars.lastUpdated."+kind, String(timestamp)); } catch {}
}

function getVehicleLastUpdated(kind) {
    const live = vehicleLastUpdatedAt.get(kind);
    if (Number.isFinite(live)) return live;
    try {
        const saved = Number(localStorage.getItem("worthit.cars.lastUpdated."+kind));
        if (Number.isFinite(saved) && saved > 0) {
            vehicleLastUpdatedAt.set(kind, saved);
            return saved;
        }
    } catch {}
    return null;
}

function formatVehicleUpdatedAt(value) {
    if (!value) return "Not checked yet";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not checked yet";
    return date.toLocaleString("en-GB", {year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}

function updateCarsLastUpdated(kind = currentVehicleKind) {
    updateCarsDatasetStatus();
}

const MAX_COMPARE_VEHICLES =
    3;

const vehicleCompareSelection =
    new Map();

let vehicleModalScrollY =
    0;

let vehicleModalNavigationItems = [];
let vehicleModalNavigationIndex = -1;

function getVehicleNavigationKey(vehicle, kind = "") {
    return getVehicleStorageKey(
        vehicle,
        vehicle?.sourceKind || vehicle?.kind || kind || currentVehicleKind
    );
}

function buildVehicleNavigationItem(item, fallbackKind = currentVehicleKind) {
    if (!item) return null;

    return {
        make: item.make || "",
        model: item.model || "",
        sourceKind: item.sourceKind || item.kind || fallbackKind || "",
        kind: item.kind || item.sourceKind || fallbackKind || "",
        bodyType: item.bodyType || item.body_type || "",
        yearStart: item.yearStart ?? item.year_start ?? null,
        yearEnd: item.yearEnd ?? item.year_end ?? null
    };
}

function setVehicleModalNavigation(vehicle, kind, items, index = null) {
    const fallbackItems =
        Array.isArray(items) && items.length
            ? items
            : [vehicle];

    const uniqueItems = [];
    const seen = new Set();

    fallbackItems.forEach(item => {
        const normalized = buildVehicleNavigationItem(item, kind);
        const key = getVehicleNavigationKey(normalized, kind);
        if (!normalized || !key || seen.has(key)) return;

        seen.add(key);
        uniqueItems.push(normalized);
    });

    vehicleModalNavigationItems = uniqueItems;

    const currentKey =
        getVehicleNavigationKey(vehicle, kind);

    const resolvedIndex =
        Number.isInteger(index)
            ? index
            : uniqueItems.findIndex(
                item =>
                    getVehicleNavigationKey(item, item.kind || kind) ===
                    currentKey
            );

    vehicleModalNavigationIndex =
        resolvedIndex >= 0
            ? resolvedIndex
            : uniqueItems.length
                ? 0
                : -1;

    refreshVehicleModalNavigationControls();
}

function refreshVehicleModalNavigationControls() {
    const modal =
        document.getElementById(
            "worthItVehicleDetailsModal"
        );

    if (!modal) return;

    const controls =
        modal.querySelectorAll(
            "[data-vehicle-navigation]"
        );

    const hasMultipleVehicles =
        vehicleModalNavigationItems.length > 1 &&
        vehicleModalNavigationIndex >= 0;

    controls.forEach(control => {
        control.hidden = !hasMultipleVehicles;

        if (!hasMultipleVehicles) {
            return;
        }

        const direction =
            control.dataset.vehicleNavigation;

        const label =
            direction === "previous"
                ? "Previous vehicle — A or ←"
                : "Next vehicle — S or →";

        control.setAttribute(
            "aria-label",
            label
        );
        control.title =
            label;
    });
}

function getVehicleModalNavigationListFromCards() {
    const grid =
        document.getElementById(
            "popularCarsGrid"
        );

    if (!grid) return [];

    return Array.from(
        grid.querySelectorAll(
            '.car-card[data-popular-stable-card="true"]'
        )
    )
        .map(card => card._worthItVehicle)
        .filter(Boolean)
        .map(vehicle =>
            buildVehicleNavigationItem(
                vehicle,
                vehicle.sourceKind || currentVehicleKind
            )
        );
}

function getVehicleModalNavigationTarget(direction) {
    const items =
        vehicleModalNavigationItems;

    if (
        items.length < 2 ||
        vehicleModalNavigationIndex < 0
    ) {
        return null;
    }

    const offset =
        direction === "previous"
            ? -1
            : 1;

    const nextIndex =
        (
            vehicleModalNavigationIndex +
            offset +
            items.length
        ) % items.length;

    return {
        vehicle: items[nextIndex],
        kind:
            items[nextIndex].kind ||
            items[nextIndex].sourceKind ||
            currentVehicleKind,
        items,
        index: nextIndex
    };
}

function navigateVehicleModal(direction) {
    const target =
        getVehicleModalNavigationTarget(direction);

    if (!target) return;

    void openVehicleDetailsPanel(
        target.vehicle,
        target.kind,
        {
            items: target.items,
            index: target.index
        }
    );
}

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
    1000;

const DBPEDIA_SUPPLEMENTAL_LIMIT =
    1000;

const VEHICLE_PERSISTENT_CATALOG_VERSION =
    "v7";

const VEHICLE_PERSISTENT_POPULAR_VERSION =
    "v12";

const VEHICLE_PERSISTENT_CATEGORY_TTL_MS =
    7 * 24 * 60 * 60 * 1000;

const VEHICLE_PERSISTENT_CATALOG_LIMIT =
    2200;

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

const POPULAR_DETAILS_CONCURRENCY = 4;

const POPULAR_NONCAR_DETAILS_CONCURRENCY = 2;
const POPULAR_NONCAR_QUALITY_BATCH_SIZE = 16;
const POPULAR_NONCAR_INITIAL_MAX_CHECKS = 300;

const POPULAR_NONCAR_INITIAL_VISIBLE_ROWS = 3;
const POPULAR_NONCAR_INITIAL_CARD_COUNT = 12;
const POPULAR_NONCAR_REFRESH_CARD_COUNT = 12;

const POPULAR_REFRESH_CARD_COUNT = 12;
const POPULAR_REFRESH_MAX_CHECKS = 320;
const POPULAR_REFRESH_CONCURRENCY = 4;

const PERSISTENT_VEHICLE_DETAILS_MAX_ENTRIES = 600;
const POPULAR_INITIAL_DETAILS_PREFETCH = 6;
const POPULAR_DETAILS_PREFETCH_CONCURRENCY = 3;

/*
 * Temporary HTTP failures from the Cars details endpoint must not be
 * hammered repeatedly by the background quality scanner. A short
 * per-vehicle cooldown keeps the warmup active without generating a
 * burst of identical 502/503/504/429 requests.
 */
const vehicleDetailsTransientFailures =
    new Map();

const VEHICLE_DETAILS_TRANSIENT_COOLDOWN_MS = {
    429: 60 * 1000,
    502: 45 * 1000,
    503: 45 * 1000,
    504: 30 * 1000
};

function getPopularDetailsConcurrency(kind) {
    return kind === "car"
        ? POPULAR_DETAILS_CONCURRENCY
        : POPULAR_NONCAR_DETAILS_CONCURRENCY;
}

function getPopularInitialVisibleRows(kind) {
    return kind === "car"
        ? POPULAR_CAR_INITIAL_VISIBLE_ROWS
        : POPULAR_NONCAR_INITIAL_VISIBLE_ROWS;
}

function getPopularInitialCardCount(
    kind,
    candidatesLength = Infinity
) {

    const desired =
        kind === "car"
            ? POPULAR_CAR_INITIAL_CARD_COUNT
            : POPULAR_NONCAR_INITIAL_CARD_COUNT;

    return Math.min(
        desired,
        Math.max(
            0,
            Number(candidatesLength) || 0
        )
    );
}

function getPopularQualityBatchSize(kind) {
    return kind === "car"
        ? POPULAR_QUALITY_BATCH_SIZE
        : POPULAR_NONCAR_QUALITY_BATCH_SIZE;
}

function getPopularInitialCheckLimit(kind) {
    return kind === "car"
        ? POPULAR_CAR_INITIAL_MAX_CHECKS
        : POPULAR_NONCAR_INITIAL_MAX_CHECKS;
}

function getPopularMaxNewChecks(kind) {
    if (kind === VEHICLE_ALL_KIND) {
        return UNIFIED_BACKGROUND_CANDIDATE_POOL_LIMIT;
    }

    return kind === "car"
        ? POPULAR_CAR_MAX_NEW_CHECKS
        : 3600;
}

function getPopularBackgroundTargetCount(
    kind,
    candidatesLength
) {

    const available =
        Math.max(
            0,
            Number(candidatesLength) || 0
        );

    /*
     * The unified All Vehicles view is capped at 1000 PUBLIC cards,
     * but it must be allowed to keep validating candidates until it
     * can fill that public limit. The old small background target
     * silently stopped the unified list after a small fraction of the
     * connected dataset.
     *
     * Category-specific views keep their existing 100-card target.
     */
    if (kind === VEHICLE_ALL_KIND) {
        return Math.min(
            MAX_UNIFIED_VEHICLES,
            available
        );
    }

    return Math.min(
        MAX_VEHICLES_PER_CATEGORY,
        available,
        POPULAR_MIN_VALID_CARDS_PER_CATEGORY
    );
}

/*
 * Persistent browser cache version for account-scoped vehicle
 * metadata/images.
 */
const VEHICLE_PERSISTENT_CACHE_VERSION = "v14";

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

    try {

        const owner =
            await getVehicleAccountCacheOwner();

        const cache =
            await caches.open(
                "worth-it-cars-catalog-" +
                VEHICLE_PERSISTENT_CATALOG_VERSION
            );

        const response =
            await cache.match(
                "https://worth-it-cars-cache.local/catalog/" +
                owner +
                "/" +
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

        const owner =
            await getVehicleAccountCacheOwner();

        const cache =
            await caches.open(
                "worth-it-cars-catalog-" +
                VEHICLE_PERSISTENT_CATALOG_VERSION
            );

        await cache.put(
            "https://worth-it-cars-cache.local/catalog/" +
            owner +
            "/" +
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

function getVehiclePersistentDetailsCacheUrl(
    owner,
    make,
    model,
    kind
) {
    return (
        "https://worth-it-cars-cache.local/details/" +
        encodeURIComponent(String(owner || "guest")) +
        "/" +
        encodeURIComponent(normalizeVehicleText(kind)) +
        "/" +
        encodeURIComponent(normalizeVehicleText(make)) +
        "/" +
        encodeURIComponent(normalizeVehicleText(model))
    );
}

async function readPersistentVehicleDetails(
    owner,
    make,
    model,
    kind
) {

    const isValidPersistentDetails = parsed => {
        if (!parsed || !parsed.specifications) {
            return false;
        }

        const hasWikipedia =
            Boolean(
                String(parsed?.wikipedia?.title || "").trim() &&
                String(parsed?.wikipedia?.url || "").trim() &&
                String(parsed?.wikipedia?.description || "").trim() &&
                !/^no information$/i.test(
                    String(parsed?.wikipedia?.description || "").trim()
                )
            );

        const hasImage =
            Boolean(
                String(parsed?.image?.url || "").trim()
            );

        if (!hasWikipedia && !hasImage) {
            return false;
        }

        if (
            vehicleDetailsDatasetVersion &&
            parsed.datasetVersion !== vehicleDetailsDatasetVersion
        ) {
            return false;
        }

        return true;
    };

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

        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (isValidPersistentDetails(parsed)) {
                    return parsed;
                }
            } catch {
                /* Try the larger Cache Storage copy below. */
            }
        }
    } catch {
        /* Continue to Cache Storage. */
    }

    try {
        const cache =
            await caches.open(
                "worth-it-cars-details-" +
                VEHICLE_PERSISTENT_CACHE_VERSION +
                "-" +
                String(owner || "guest")
            );

        const response =
            await cache.match(
                getVehiclePersistentDetailsCacheUrl(
                    owner,
                    make,
                    model,
                    kind
                )
            );

        if (!response) {
            return null;
        }

        const parsed =
            await response.json();

        return isValidPersistentDetails(parsed)
            ? parsed
            : null;

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

        if (!make || !model || !kind) {
            return;
        }

        /*
         * Keep enough metadata for fast card rendering and image reuse,
         * while avoiding unnecessarily large raw API responses.
         */
        const compact = {
            success: true,
            datasetVersion:
                vehicleDetailsDatasetVersion ||
                null,
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
                    ).slice(0, 2500)
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

        const storageKey =
            getVehiclePersistentDetailsKey(
                owner,
                make,
                model,
                kind
            );

        const cachePrefix =
            [
                "worthItVehicleDetails",
                VEHICLE_PERSISTENT_CACHE_VERSION,
                String(owner)
            ].join(":") + ":";

        const cacheKeys = [];

        try {

            for (
                let index = 0;
                index < localStorage.length;
                index += 1
            ) {
                const key =
                    localStorage.key(index);

                if (
                    key &&
                    key.startsWith(cachePrefix) &&
                    key !== storageKey
                ) {
                    cacheKeys.push(key);
                }
            }

            while (
                cacheKeys.length >=
                PERSISTENT_VEHICLE_DETAILS_MAX_ENTRIES
            ) {
                localStorage.removeItem(
                    cacheKeys.shift()
                );
            }

            localStorage.setItem(
                storageKey,
                JSON.stringify(compact)
            );

        } catch (error) {

            if (
                error?.name ===
                "QuotaExceededError"
            ) {
                for (const key of cacheKeys) {
                    try {
                        localStorage.removeItem(key);
                    } catch {}
                }

                try {
                    localStorage.setItem(
                        storageKey,
                        JSON.stringify(compact)
                    );
                } catch {
                    /* Cache Storage below is the large persistent layer. */
                }
            }

        }

        /*
         * Cache Storage is the large persistent layer for vehicle details.
         * It is namespaced by the authenticated account owner, so the
         * background validator can retain thousands of verified records.
         */
        void (async () => {
            try {
                const cache =
                    await caches.open(
                        "worth-it-cars-details-" +
                        VEHICLE_PERSISTENT_CACHE_VERSION +
                        "-" +
                        String(owner || "guest")
                    );

                await cache.put(
                    getVehiclePersistentDetailsCacheUrl(
                        owner,
                        make,
                        model,
                        kind
                    ),
                    new Response(
                        JSON.stringify(compact),
                        {
                            status: 200,
                            headers: {
                                "Content-Type":
                                    "application/json; charset=UTF-8"
                            }
                        }
                    )
                );

            } catch {
                /* Persistent Cache Storage is optional. */
            }
        })();

    } catch (error) {

        /*
         * Persistent caching must never interrupt Cars rendering.
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

const MAX_CONCURRENT_IMAGE_REQUESTS = 4;

let activeVehicleImageRequests = 0;

const vehicleImageQueue = [];

/*
 * Background recovery for the first 100 popular cards.
 *
 * Some VehiclesDB records are valid catalog entries but have no useful
 * Wikipedia/Wikimedia match. When that happens, replace the weak card
 * with the next better same-category record instead of leaving a large
 * "Image unavailable" block in the main catalog.
 */
const popularCardRecoveryState =
    new Map();

const POPULAR_CARD_RECOVERY_CONCURRENCY = 1;
const POPULAR_CARD_RECOVERY_MAX_CANDIDATES = 200;
const UNIFIED_CARD_RECOVERY_MAX_CANDIDATES = 1200;
const POPULAR_CARD_RECOVERY_CANDIDATE_WINDOW = 8;


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
                rootMargin: "1200px 0px"
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
    kind,
    mode = "full"
) {

    return [
        normalizeVehicleText(make),
        normalizeVehicleText(model),
        normalizeVehicleText(kind),
        normalizeVehicleText(mode)
    ].join("|");

}


function getVehicleDetailsRequestVersion(
    kind
) {

    return VEHICLE_DETAILS_CACHE_VERSION;

}


async function fetchVehicleDetailsWithRetry(
    make,
    model,
    kind,
    attempts = 2,
    retryDelayMs = 650,
    mode = "full"
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
                kind,
                mode
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
    kind,
    mode = "full"
) {

    const isFastMode =
        mode === "fast";

    const isQualityMode =
        mode === "quality";

    const isImageMode =
        mode === "image";

    const cacheKey =
        getVehicleDetailsCacheKey(
            make,
            model,
            kind,
            mode
        );

    const transientFailure =
        vehicleDetailsTransientFailures.get(
            cacheKey
        );

    if (transientFailure) {
        if (
            Date.now() <
            transientFailure.until
        ) {
            return null;
        }

        vehicleDetailsTransientFailures.delete(
            cacheKey
        );
    }


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
    if (!isFastMode && !isImageMode) {

        const persistentOwner =
            await getVehicleAccountCacheOwner();

        const persistentDetails =
            await readPersistentVehicleDetails(
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

                if (isFastMode) {
                    params.set("fast", "1");
                }

                if (isQualityMode) {
                    params.set("quality", "1");
                }

                if (isImageMode) {
                    params.set("image_only", "1");
                }

                if (vehicleDetailsDatasetVersion) {
                    params.set(
                        "dataset_version",
                        vehicleDetailsDatasetVersion
                    );
                }

                if (catalogVehicle) {

                    const wikipediaTitle =
                        String(
                            catalogVehicle.wikipediaTitle ||
                            getCachedSupplementalWikipediaTitle(
                                make,
                                model,
                                kind
                            ) ||
                            ""
                        ).trim();

                    if (wikipediaTitle) {
                        params.set(
                            "wikipedia_title",
                            wikipediaTitle
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

                const requestTimeoutMs =
                    isImageMode
                        ? VEHICLE_IMAGE_DETAILS_REQUEST_TIMEOUT_MS
                        : (
                            isFastMode
                                ? VEHICLE_FAST_DETAILS_REQUEST_TIMEOUT_MS
                                : (
                                    kind === "car"
                                        ? VEHICLE_DETAILS_REQUEST_TIMEOUT_MS
                                        : VEHICLE_NONCAR_DETAILS_REQUEST_TIMEOUT_MS
                                )
                        );

                const timeoutId =
                    controller
                        ? window.setTimeout(
                            () => controller.abort(),
                            requestTimeoutMs
                        )
                        : null;

                let response;

                try {

                    response =
                        await fetch(
                            `${VEHICLE_API}?${params.toString()}&v=${getVehicleDetailsRequestVersion(kind)}`,
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

                    const error =
                        new Error(
                            `Vehicle details API returned ${response.status}`
                        );

                    error.status = response.status;
                    throw error;

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


                const hasWikipediaPage =
                    Boolean(
                        String(
                            data?.wikipedia?.title || ""
                        ).trim() &&
                        String(
                            data?.wikipedia?.url || ""
                        ).trim() &&
                        String(
                            data?.wikipedia?.description || ""
                        ).trim() &&
                        !/^no information$/i.test(
                            String(
                                data?.wikipedia?.description || ""
                            ).trim()
                        )
                    );

                const hasUsableImage =
                    Boolean(
                        String(
                            data?.image?.url || ""
                        ).trim()
                    );

                /*
                 * Never lock a temporary resolution failure into the
                 * browser memory cache. Successful article/image results
                 * remain cached normally.
                 */
                const cacheableDetails =
                    hasWikipediaPage ||
                    hasUsableImage;

                /*
                 * Never persist a negative "No Information" response.
                 * A temporary Wikipedia/Wikimedia failure must not become
                 * a permanent account cache entry.
                 */
                if (cacheableDetails) {
                    vehicleDetailsCache.set(
                        cacheKey,
                        data
                    );
                }

                if (
                    !isFastMode &&
                    !isImageMode &&
                    cacheableDetails
                ) {
                    void getVehicleAccountCacheOwner()
                        .then(
                            owner =>
                                writePersistentVehicleDetails(
                                    owner,
                                    data
                                )
                        );
                }

                return data;

            } catch (error) {

                const failureStatus =
                    Number(
                        error?.status
                    );

                const transientCooldown =
                    VEHICLE_DETAILS_TRANSIENT_COOLDOWN_MS[
                        failureStatus
                    ];

                if (
                    transientCooldown
                ) {
                    vehicleDetailsTransientFailures.set(
                        cacheKey,
                        {
                            status:
                                failureStatus,
                            until:
                                Date.now() +
                                transientCooldown
                        }
                    );
                }

                /*
                 * Image/detail hydration is best-effort. Temporary
                 * upstream failures are handled by the short cooldown
                 * above and are intentionally not logged as warnings.
                 */
                if (
                    mode !== "image" &&
                    error?.name !== "AbortError" &&
                    !transientCooldown
                ) {
                    console.warn(
                        "Vehicle details request failed:",
                        make,
                        model,
                        kind,
                        error
                    );
                }

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

function setPopularVehicleImageState(
    imageElement,
    state
) {

    const card =
        imageElement?.closest(
            ".car-card"
        );

    if (!card) {
        return;
    }

    card.dataset.imageState =
        state;

    if (
        currentVehicleMode === "popular" &&
        card.dataset.popularStableCard === "true"
    ) {
        reorderPopularVehicleCardsByImageAvailability(
            card.dataset.vehicleKind ||
            currentVehicleKind
        );
    }
}

function reorderPopularVehicleCardsByImageAvailability(
    kind = currentVehicleKind
) {

    if (
        currentVehicleMode !== "popular" ||
        currentVehicleKind !== kind
    ) {
        return;
    }

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
                '.car-card[data-popular-stable-card="true"]'
            )
        );

    const priority = {
        available: 0,
        pending: 1,
        unavailable: 2
    };

    cards
        .map(
            (card, index) => ({
                card,
                index,
                rank:
                    priority[
                        card.dataset.imageState ||
                        "pending"
                    ] ?? 1
            })
        )
        .sort(
            (a, b) =>
                a.rank - b.rank ||
                a.index - b.index
        )
        .forEach(
            entry =>
                grid.appendChild(
                    entry.card
                )
        );

}

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

    image.dataset.vehicleBodyType =
        vehicle.bodyType ||
        "";

    image.dataset.vehicleYearStart =
        vehicle.yearStart !== null &&
        vehicle.yearStart !== undefined
            ? String(vehicle.yearStart)
            : "";

    image.dataset.vehicleYearEnd =
        vehicle.yearEnd !== null &&
        vehicle.yearEnd !== undefined
            ? String(vehicle.yearEnd)
            : "";

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

            setPopularVehicleImageState(
                image,
                "available"
            );

        }
    );


    image.addEventListener(
        "error",
        () => {

            setPopularVehicleImageState(
                image,
                "unavailable"
            );

            const card =
                image.closest(
                    ".car-card"
                );

            if (
                currentVehicleMode === "popular" &&
                card
            ) {
                window.setTimeout(
                    () =>
                        schedulePopularCardRecovery(
                            kind
                        ),
                    0
                );
            }

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
    details,
    catalogVehicle = null
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

    const datasetVehicle = {
        bodyType:
            imageElement?.dataset.vehicleBodyType ||
            "",
        bodyTypes:
            imageElement?.dataset.vehicleBodyType
                ? [imageElement.dataset.vehicleBodyType]
                : [],
        yearStart:
            imageElement?.dataset.vehicleYearStart ||
            "",
        yearEnd:
            imageElement?.dataset.vehicleYearEnd ||
            ""
    };

    const apiVehicle =
        details?.vehicle ||
        catalogVehicle ||
        datasetVehicle;

    const specifications =
        details?.specifications ||
        {};

    /*
     * Comparison availability is a hard quality requirement for
     * popular cards. If the details endpoint says this vehicle cannot
     * be compared, remove the card instead of leaving a dead card in
     * the visible catalog. Recovery will try a more popular candidate.
     */
    const comparisonAvailable =
        details?.comparisonAvailable === true;

    card.dataset.comparisonState =
        comparisonAvailable
            ? "available"
            : "unavailable";

    if (
        details &&
        currentVehicleMode === "popular" &&
        card.dataset.popularStableCard === "true" &&
        !comparisonAvailable
    ) {
        const recoveryKind =
            imageElement?.dataset.vehicleSourceKind ||
            card.dataset.vehicleSourceKind ||
            currentVehicleKind;

        /*
         * Keep the existing card in place until a valid replacement is
         * ready. The recovery queue will replace it, or remove it only
         * after the candidate pool is exhausted.
         */
        window.setTimeout(
            () => schedulePopularCardRecovery(recoveryKind),
            0
        );

        return;
    }

    const fuelEconomy =
        details?.external?.fuelEconomy ||
        null;

    const externalEconomySummary =
        fuelEconomy
            ? [
                fuelEconomy.combinedMpg !== null &&
                fuelEconomy.combinedMpg !== undefined
                    ? "EPA " + fuelEconomy.combinedMpg + " MPG"
                    : "",
                fuelEconomy.fuelType || ""
            ]
                .filter(Boolean)
                .join(" • ")
            : "";

    const technicalCandidates = [
        ["fuel", specifications.fuel],
        ["power", specifications.horsepower],
        ["engine", specifications.engine],
        ["battery", specifications.battery],
        ["range", specifications.electricRange],
        ["payload", specifications.payload],
        ["cargo", specifications.cargoCapacity],
        ["seats", specifications.seating],
        ["economy", specifications.fuelEconomy],
        ["epa", externalEconomySummary]
    ];

    const technicalValues =
        technicalCandidates
            .filter(([, value]) =>
                isUsefulVehicleDetailValue(value)
            )
            .slice(0, 3)
            .map(([, value]) =>
                String(value).trim()
            );

    if (technicalValues.length) {
        card.dataset.infoState = "available";
        preview.textContent =
            technicalValues.join(" • ");
        preview.removeAttribute("title");
        return;
    }

    const description =
        String(
            details?.wikipedia?.description ||
            ""
        ).trim();

    if (
        description &&
        !/^no information$/i.test(
            description
        )
    ) {
        card.dataset.infoState = "available";
        preview.textContent =
            description.length > 110
                ? `${description.slice(0, 107).trimEnd()}…`
                : description;
        preview.title =
            description;
        return;
    }

    /*
     * Catalog metadata is always available and makes every card useful
     * even while Wikipedia is loading or temporarily unavailable.
     */
    const bodyType =
        Array.isArray(apiVehicle?.body_types) &&
        apiVehicle.body_types.length
            ? apiVehicle.body_types[0]
            : (
                apiVehicle?.body_type ||
                catalogVehicle?.bodyType ||
                ""
            );

    const yearStart =
        apiVehicle?.year_start ??
        apiVehicle?.yearStart ??
        catalogVehicle?.yearStart ??
        "";

    const yearEnd =
        apiVehicle?.year_end ??
        apiVehicle?.yearEnd ??
        catalogVehicle?.yearEnd ??
        "";

    const yearText =
        yearStart &&
        yearEnd &&
        String(yearStart) !== String(yearEnd)
            ? `${yearStart}–${yearEnd}`
            : (
                yearStart ||
                yearEnd ||
                ""
            );

    const catalogValues = [
        bodyType,
        yearText
    ]
        .map(value =>
            String(value || "").trim()
        )
        .filter(Boolean);

    if (catalogValues.length) {
        card.dataset.infoState = "catalog";
        preview.textContent =
            catalogValues.join(" • ");
        preview.removeAttribute("title");
        return;
    }

    card.dataset.infoState = "unavailable";
    preview.textContent =
        "Couldn't find informations on wikipedia and online";
    preview.removeAttribute("title");

    if (
        currentVehicleMode === "popular" &&
        card.dataset.popularStableCard === "true"
    ) {
        window.setTimeout(
            () => schedulePopularCardRecovery(
                imageElement?.dataset.vehicleSourceKind ||
                card.dataset.vehicleSourceKind ||
                currentVehicleKind
            ),
            0
        );
    }

}



function updateUnifiedVehicleCardPresentation(
    card
) {

    /*
     * Prices and quick specification chips are intentionally not shown
     * on the unified vehicle cards. Cards stay lightweight; the detail
     * modal contains the full available information.
     */

    if (!card) {
        return;
    }

    const priceElement =
        card.querySelector(
            ".car-card-price-row"
        );

    const quickStatsElement =
        card.querySelector(
            ".car-card-quick-stats"
        );

    if (priceElement) {
        priceElement.remove();
    }

    if (quickStatsElement) {
        quickStatsElement.remove();
    }

}

function hasUnifiedVehicleDisplayInformation(
    details
) {

    if (
        !details ||
        details.success === false
    ) {
        return false;
    }

    const description =
        String(
            details?.wikipedia?.description ||
            ""
        ).trim();

    const hasDescription =
        isUsefulVehicleDetailValue(description) &&
        !/^no information$/i.test(description);

    const specificationCount =
        Object.values(
            details?.specifications || {}
        ).filter(value =>
            isUsefulVehicleDetailValue(value)
        ).length;

    /*
     * Catalog body type/year alone do not count. The card is considered
     * informative only when the details API returned a real description
     * or at least one real technical specification.
     */
    return (
        hasDescription ||
        specificationCount > 0
    );

}

function hasRequiredVehicleCardQuality(
    details,
    vehicle,
    kind
) {

    if (!details || details.success === false) {
        return false;
    }

    const detailKind =
        vehicle?.sourceKind ||
        vehicle?.kind ||
        kind;

    const imageAvailable =
        hasPopularVehicleImageRelevance(
            details,
            vehicle
        );

    const informationAvailable =
        kind === VEHICLE_ALL_KIND
            ? hasUnifiedVehicleDisplayInformation(details)
            : hasUsablePopularVehicleDetails(
                details,
                vehicle,
                detailKind
            );

    const comparisonAvailable =
        details?.comparisonAvailable === true;

    return (
        imageAvailable &&
        informationAvailable &&
        comparisonAvailable
    );
}

function findUnifiedVehicleCard(
    vehicle
) {

    const make =
        normalizeVehicleText(
            vehicle?.make
        );

    const model =
        normalizeVehicleText(
            vehicle?.model
        );

    const sourceKind =
        normalizeVehicleText(
            vehicle?.sourceKind ||
            vehicle?.kind ||
            "car"
        );

    const grid =
        document.getElementById(
            "popularCarsGrid"
        );

    if (!grid) {
        return null;
    }

    return Array.from(
        grid.querySelectorAll(
            '.car-card[data-popular-stable-card="true"]'
        )
    ).find(card =>
        normalizeVehicleText(
            card.dataset.vehicleMake
        ) === make &&
        normalizeVehicleText(
            card.dataset.vehicleModel
        ) === model &&
        normalizeVehicleText(
            card.dataset.vehicleSourceKind
        ) === sourceKind
    ) || null;

}

function applyUnifiedVehicleCardDetailsState(
    card,
    vehicle,
    details
) {

    if (!card) {
        return;
    }

    const infoAvailable =
        hasUnifiedVehicleDisplayInformation(
            details
        );

    const comparisonAvailable =
        details?.comparisonAvailable === true;

    const imageAvailable =
        hasPopularVehicleImageRelevance(
            details,
            vehicle
        );

    card.dataset.infoState =
        infoAvailable
            ? "available"
            : "unavailable";

    card.dataset.comparisonState =
        comparisonAvailable
            ? "available"
            : "unavailable";

    card.dataset.imageState =
        imageAvailable
            ? "available"
            : "unavailable";

    card.dataset.detailsReady =
        "true";

    /*
     * A public Popular card is valid only when it has:
     *   1. reliable vehicle information,
     *   2. a commercially reusable, identity-verified image, and
     *   3. comparison data.
     *
     * Vehicles that fail any of these gates are replaced by recovery
     * rather than being left visible with "No image available" or
     * "Couldn't find information".
     */
    const unifiedCardValid =
        infoAvailable &&
        imageAvailable &&
        comparisonAvailable;

    card.dataset.qualityState =
        unifiedCardValid
            ? "valid"
            : "invalid";

    updateUnifiedVehicleCardPresentation(
        card
    );

    if (unifiedCardValid) {
        card.dataset.recoveryLocked =
            "true";
        return;
    }

    if (
        currentVehicleMode === "popular" &&
        currentVehicleKind === VEHICLE_ALL_KIND
    ) {
        card.dataset.recoveryLocked =
            "false";

        window.setTimeout(
            () =>
                schedulePopularCardRecovery(
                    VEHICLE_ALL_KIND
                ),
            0
        );
    }

}

function getPopularCardRecoveryState(
    kind
) {

    let state =
        popularCardRecoveryState.get(
            kind
        );

    if (
        !state ||
        state.catalogRef !== currentVehicleResults
    ) {

        state = {
            catalogRef: currentVehicleResults,
            pool:
                currentVehicleKind === VEHICLE_ALL_KIND &&
                Array.isArray(vehicleCatalogCache.get(VEHICLE_ALL_KIND))
                    ? (() => {
                        const start =
                            Math.max(
                                1,
                                getInitialVehicleLimit(
                                    Array.isArray(currentVehicleResults)
                                        ? currentVehicleResults
                                        : []
                                )
                            );

                        return vehicleCatalogCache
                            .get(VEHICLE_ALL_KIND)
                            .slice(
                                start,
                                start +
                                UNIFIED_CARD_RECOVERY_MAX_CANDIDATES
                            );
                    })()
                    : (
                        Array.isArray(currentVehicleResults)
                            ? (() => {
                                const start =
                                    Math.max(
                                        1,
                                        getInitialVehicleLimit(
                                            currentVehicleResults
                                        )
                                    );

                                return currentVehicleResults.slice(
                                    start,
                                    start +
                                    (
                                        currentVehicleKind === VEHICLE_ALL_KIND
                                            ? UNIFIED_CARD_RECOVERY_MAX_CANDIDATES
                                            : POPULAR_CARD_RECOVERY_MAX_CANDIDATES
                                    )
                                );
                            })()
                            : []
                    ),
            nextIndex: 0,
            active: 0,
            usedKeys: new Set()
        };

        popularCardRecoveryState.set(
            kind,
            state
        );
    }

    return state;
}

function getPopularCardRecoveryQuality(
    details,
    vehicle
) {

    if (!details) {
        return 0;
    }

    const imageAvailable =
        hasPopularVehicleImageRelevance(
            details,
            vehicle
        );

    const description =
        String(
            details?.wikipedia?.description || ""
        ).trim();

    const hasDescription =
        description.length >= 40 &&
        !/^no information$/i.test(
            description
        );

    if (
        imageAvailable &&
        hasDescription
    ) {
        return 3;
    }

    if (imageAvailable) {
        return 2;
    }

    if (hasDescription) {
        return 1;
    }

    return 0;
}

function findPopularCardRecoveryTarget(
    kind
) {

    const grid =
        document.getElementById(
            "popularCarsGrid"
        );

    if (!grid) {
        return null;
    }

    const cards =
        Array.from(
            grid.querySelectorAll(
                '.car-card[data-popular-stable-card="true"]'
            )
        );

    return cards
        .filter(card => {
            if (
                card.dataset.recoveryLocked === "true" ||
                card.dataset.recoveryQueued === "true"
            ) {
                return false;
            }

            /*
             * Every Popular card now uses the same hard quality gates:
             * reliable information, a commercially reusable image, and
             * comparison data.
             */
            if (kind === VEHICLE_ALL_KIND) {
                /*
                 * Never recover/remove a card while its background details
                 * request is still pending. Only a completed validation may
                 * mark a unified card as bad.
                 */
                if (card.dataset.detailsReady !== "true") {
                    return false;
                }

                return (
                    card.dataset.imageState !== "available" ||
                    card.dataset.infoState !== "available" ||
                    card.dataset.comparisonState !== "available"
                );
            }

            return (
                card.dataset.imageState !== "available" ||
                card.dataset.infoState !== "available" ||
                card.dataset.comparisonState !== "available"
            );
        })
        .sort(
            (a, b) => {
                const aBad =
                    kind === VEHICLE_ALL_KIND
                        ? (
                            a.dataset.detailsReady === "true" &&
                            (
                                a.dataset.imageState !== "available" ||
                                a.dataset.infoState !== "available" ||
                                a.dataset.comparisonState !== "available"
                            )
                        )
                            ? 0
                            : 1
                        : (
                            a.dataset.imageState !== "available" ||
                            a.dataset.infoState !== "available" ||
                            a.dataset.comparisonState !== "available"
                        )
                            ? 0
                            : 1;

                const bBad =
                    kind === VEHICLE_ALL_KIND
                        ? (
                            b.dataset.detailsReady === "true" &&
                            (
                                b.dataset.imageState !== "available" ||
                                b.dataset.infoState !== "available" ||
                                b.dataset.comparisonState !== "available"
                            )
                        )
                            ? 0
                            : 1
                        : (
                            b.dataset.imageState !== "available" ||
                            b.dataset.infoState !== "available" ||
                            b.dataset.comparisonState !== "available"
                        )
                            ? 0
                            : 1;

                return aBad - bBad;
            }
        )[0] || null;
}

async function findNextPopularCardRecoveryCandidate(
    kind
) {

    const state =
        getPopularCardRecoveryState(
            kind
        );

    let bestFallback = null;

    const end =
        Math.min(
            state.pool.length,
            state.nextIndex +
            POPULAR_CARD_RECOVERY_CANDIDATE_WINDOW
        );

    while (
        state.nextIndex < end
    ) {

        const candidate =
            state.pool[
                state.nextIndex++
            ];

        if (
            !candidate?.make ||
            !candidate?.model
        ) {
            continue;
        }

        const key =
            getPopularVehicleQualityKey(
                candidate,
                kind
            );

        if (
            state.usedKeys.has(key)
        ) {
            continue;
        }

        /*
         * Never select a vehicle that is already rendered. Recovery should
         * move forward through the popularity-ordered catalog, not create
         * duplicates in the grid.
         */
        const alreadyRendered =
            Array.from(
                document.querySelectorAll(
                    '#popularCarsGrid .car-card[data-popular-stable-card="true"]'
                )
            ).some(
                existingCard =>
                    getPopularVehicleQualityKey(
                        {
                            make:
                                existingCard.dataset.vehicleMake || "",
                            model:
                                existingCard.dataset.vehicleModel || "",
                            sourceKind:
                                existingCard.dataset.vehicleSourceKind ||
                                kind
                        },
                        existingCard.dataset.vehicleSourceKind || kind
                    ) === key
            );

        if (alreadyRendered) {
            state.usedKeys.add(key);
            continue;
        }

        state.usedKeys.add(key);

        let details = null;

        const candidateKind =
            candidate.sourceKind ||
            candidate.kind ||
            kind;

        /*
         * Recovery must use the same complete response for every vehicle
         * type. The image-only response does not contain comparison data,
         * so using it for buses/vans/trucks/motorcycles makes valid
         * candidates look invalid and causes their cards to disappear.
         */
        const candidateRequestMode = "full";

        try {

            details =
                await fetchVehicleDetailsWithRetry(
                    candidate.make,
                    candidate.model,
                    candidateKind,
                    1,
                    0,
                    candidateRequestMode
                );

        } catch (error) {

            console.warn(
                "Popular card recovery request failed:",
                candidate.make,
                candidate.model,
                kind,
                error
            );

        }

        const imageAvailable =
            hasPopularVehicleImageRelevance(
                details,
                candidate
            );

        const informationAvailable =
            kind === VEHICLE_ALL_KIND
                ? (
                    hasUnifiedVehicleDisplayInformation(details) &&
                    (
                        hasPopularVehicleIdentityMatch(
                            details,
                            candidate
                        ) ||
                        (
                            normalizeVehicleText(
                                details?.vehicle?.make || ""
                            ) === normalizeVehicleText(candidate.make) &&
                            normalizeVehicleText(
                                details?.vehicle?.model || ""
                            ) === normalizeVehicleText(candidate.model)
                        )
                    )
                )
                : hasUsablePopularVehicleDetails(
                    details,
                    candidate,
                    candidateKind
                );

        const imageGate =
            imageAvailable;

        if (
            imageGate &&
            informationAvailable &&
            details?.comparisonAvailable === true
        ) {
            return {
                candidate,
                details,
                quality: 3
            };
        }
    }

    return bestFallback;
}

function replacePopularCardWithRecoveryCandidate(
    card,
    candidate,
    details,
    kind
) {

    if (
        !card ||
        !candidate ||
        !details ||
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular" ||
        !card.isConnected
    ) {
        return false;
    }

    const candidateKind =
        candidate.sourceKind || candidate.kind || kind;

    const replacement =
        createVehicleCard(
            candidate,
            candidateKind
        );

    replacement.dataset.recoveryLocked =
        "true";

    const replacementImage =
        replacement.querySelector(
            ".car-card-image"
        );

    if (replacementImage) {
        updateVehicleCardInformationPreview(
            replacementImage,
            details,
            candidate
        );
    }

    const oldKey =
        normalizeVehicleText(
            card.dataset.vehicleMake || ""
        ) +
        "|" +
        normalizeVehicleText(
            card.dataset.vehicleModel || ""
        );

    const resultIndex =
        currentVehicleResults.findIndex(
            vehicle =>
                normalizeVehicleText(
                    vehicle?.make
                ) +
                "|" +
                normalizeVehicleText(
                    vehicle?.model
                ) === oldKey
        );

    if (resultIndex >= 0) {
        currentVehicleResults[resultIndex] =
            candidate;
    }

    card.replaceWith(
        replacement
    );

    if (replacementImage) {
        queueVehicleImageLoad(
            replacementImage,
            candidate.make,
            candidate.model,
            candidateKind
        );
    }

    if (kind !== VEHICLE_ALL_KIND) {
        reorderPopularVehicleCardsByImageAvailability(
            kind
        );
    }

    return true;
}

function removePopularCardAndRecover(
    card,
    kind
) {

    if (
        !card ||
        !card.isConnected ||
        currentVehicleMode !== "popular"
    ) {
        return false;
    }

    const oldKey =
        normalizeVehicleText(
            card.dataset.vehicleMake || ""
        ) +
        "|" +
        normalizeVehicleText(
            card.dataset.vehicleModel || ""
        );

    if (kind !== VEHICLE_ALL_KIND) {
        currentVehicleResults =
            Array.isArray(currentVehicleResults)
                ? currentVehicleResults.filter(
                    vehicle =>
                        normalizeVehicleText(vehicle?.make) +
                        "|" +
                        normalizeVehicleText(vehicle?.model) !== oldKey
                )
                : [];
    }

    card.remove();

    /*
     * No placeholder is kept. If no suitable candidate exists, the
     * card stays removed and the visible result count becomes smaller.
     */
    window.setTimeout(
        () => schedulePopularCardRecovery(kind),
        0
    );

    return true;
}

function schedulePopularCardRecovery(
    kind
) {

    /*
     * The unified Vehicles view uses one recovery queue for every vehicle
     * type. Individual cards still keep their real sourceKind (car,
     * motorcycle, van, truck, bus), but recovery itself must run against
     * the unified "all" catalog state.
     */
    if (
        currentVehicleKind === VEHICLE_ALL_KIND
    ) {
        kind = VEHICLE_ALL_KIND;
    }

    if (
        currentVehicleMode !== "popular" ||
        currentVehicleKind !== kind
    ) {
        return;
    }

    const state =
        getPopularCardRecoveryState(
            kind
        );

    for (
        let i = 0;
        i < POPULAR_CARD_RECOVERY_CONCURRENCY;
        i++
    ) {

        if (
            state.active >=
            POPULAR_CARD_RECOVERY_CONCURRENCY
        ) {
            break;
        }

        const target =
            findPopularCardRecoveryTarget(
                kind
            );

        if (!target) {
            break;
        }

        target.dataset.recoveryQueued =
            "true";

        state.active++;

        void (async () => {

            try {

                const result =
                    await findNextPopularCardRecoveryCandidate(
                        kind
                    );

                if (
                    result?.candidate &&
                    result?.details
                ) {

                    replacePopularCardWithRecoveryCandidate(
                        target,
                        result.candidate,
                        result.details,
                        kind
                    );

                } else if (target.isConnected) {

                    /*
                     * A failed/empty recovery search is not proof that the
                     * vehicle is invalid. Network timeouts and temporary
                     * API failures must never make a card disappear.
                     * Keep it visible and let a later recovery pass retry.
                     */
                    target.dataset.recoveryQueued = "false";

                }

            } finally {

                state.active--;

                window.setTimeout(
                    () => schedulePopularCardRecovery(kind),
                    0
                );

            }

        })();
    }

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

    const catalogVehicle =
        currentVehicleCatalog.find(
            vehicle =>
                normalizeVehicleText(
                    vehicle?.make
                ) ===
                    normalizeVehicleText(make) &&
                normalizeVehicleText(
                    vehicle?.model
                ) ===
                    normalizeVehicleText(model) &&
                normalizeVehicleText(
                    vehicle?.sourceKind ||
                    vehicle?.kind ||
                    kind
                ) ===
                    normalizeVehicleText(kind)
        ) || null;

    /*
     * Unified Vehicles cards need the complete details response, not the
     * image-only response. The image-only endpoint intentionally omits
     * some fields (notably comparison/Wikipedia data), and treating that
     * partial response as a failed vehicle would incorrectly trigger
     * recovery and make cards disappear.
     *
     * Category-specific legacy views may continue using the lighter image
     * request, but the unified view always hydrates from the full response.
     */
    /*
     * A displayed Popular card must be validated with the complete
     * details response. The image-only response intentionally has
     * comparisonAvailable=false, so using it here could incorrectly
     * evict an otherwise valid card.
     */
    const requestMode = "full";

    const details =
        await fetchVehicleDetailsWithRetry(
            make,
            model,
            kind,
            1,
            0,
            requestMode
        );

    updateVehicleCardInformationPreview(
        imageElement,
        details,
        catalogVehicle
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

        setPopularVehicleImageState(
            imageElement,
            "unavailable"
        );

        const card =
            imageElement.closest(
                ".car-card"
            );

        if (
            currentVehicleMode === "popular" &&
            card
        ) {
            window.setTimeout(
                () =>
                    schedulePopularCardRecovery(
                        kind
                    ),
                0
            );
        }

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

    setPopularVehicleImageState(
        imageElement,
        "pending"
    );

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

    /*
     * VehiclesDB publishes a versioned manifest alongside the rolling
     * @latest catalog. The manifest build date is the dataset update
     * date we display to users; it is not the time our browser fetched it.
     */
    await fetchVehicleDatasetMetadata();

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

        setVehicleLastUpdated(kind);

        if (currentVehicleKind === kind) {
            updateCarsLastUpdated(kind);
        }

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

async function buildFreshUnifiedVehicleCatalog() {

    const catalogs =
        await Promise.all(
            VEHICLE_KINDS.map(
                kind =>
                    fetchFreshVehicleCatalog(kind).catch(error => {
                        console.warn("Unified vehicle source failed:", kind, error);
                        return [];
                    })
            )
        );

    const merged = new Map();

    catalogs.flat().forEach(vehicle => {
        if (!vehicle?.make || !vehicle?.model) return;

        const sourceKind = vehicle.sourceKind || vehicle.kind;
        if (!VEHICLE_KINDS.includes(sourceKind)) return;
        if (!isCatalogVehicleKindCompatible(vehicle)) return;

        const key = normalizeVehicleText(vehicle.make) + "|" +
            normalizeVehicleText(vehicle.model) + "|" + sourceKind;

        if (!merged.has(key)) {
            merged.set(key, { ...vehicle, kind: sourceKind, sourceKind });
        }
    });

    const vehicles = Array.from(merged.values());
    vehicles.sort((a, b) => {
        const popularity = getVehiclePopularityValue(a) - getVehiclePopularityValue(b);
        if (popularity !== 0) return popularity;
        return (String(a.make) + " " + String(a.model)).localeCompare(String(b.make) + " " + String(b.model), undefined, { sensitivity: "base" });
    });

    /*
     * Keep a hidden popularity-ordered verification pool larger than the
     * public 1000-card limit. This gives the quality gate enough candidates
     * to replace entries that lack reliable information or a verified image.
     */
    return vehicles.slice(
        0,
        Math.max(
            UNIFIED_BACKGROUND_CANDIDATE_POOL_LIMIT,
            MAX_UNIFIED_VEHICLES
        )
    );
}

async function fetchUnifiedVehicleCatalog() {
    if (vehicleCatalogCache.has(VEHICLE_ALL_KIND)) {
        return vehicleCatalogCache.get(VEHICLE_ALL_KIND);
    }

    const saved = await readPersistentVehicleCatalog(VEHICLE_ALL_KIND);
    if (Array.isArray(saved) && saved.length) {
        const limited = saved.slice(
            0,
            Math.max(
                UNIFIED_BACKGROUND_CANDIDATE_POOL_LIMIT,
                MAX_UNIFIED_VEHICLES
            )
        );
        vehicleCatalogCache.set(VEHICLE_ALL_KIND, limited);
        void buildFreshUnifiedVehicleCatalog().then(fresh => {
            if (fresh.length) {
                vehicleCatalogCache.set(VEHICLE_ALL_KIND, fresh);
                void writePersistentVehicleCatalog(VEHICLE_ALL_KIND, fresh);
            }
        }).catch(error => console.warn("Background unified catalog refresh failed:", error));
        return limited;
    }

    const fresh = await buildFreshUnifiedVehicleCatalog();
    if (fresh.length) {
        vehicleCatalogCache.set(VEHICLE_ALL_KIND, fresh);
        void writePersistentVehicleCatalog(VEHICLE_ALL_KIND, fresh);
    }
    return fresh;
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

            if (vehicles.length) {
                setVehicleLastUpdated(kind);
                if (currentVehicleKind === kind) {
                    updateCarsLastUpdated(kind);
                }
            }

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

    /*
     * Supplemental sources are discovery/identity helpers only.
     * VehiclesDB remains the sole source of public category membership.
     *
     * In particular, do not merge Wikidata/DBpedia records back into
     * vehicleCatalogCache or continue the old quality scanner here. A
     * broad DBpedia transportation class can legitimately contain both
     * vans and trucks, so merging those candidates is exactly how the
     * category bleed-through occurred.
     */
    await Promise.all([
        fetchSupplementalVehicleCatalog(kind),
        fetchDbpediaVehicleCatalog(kind)
    ]);

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
    car: [
        "sedan", "saloon", "hatchback", "liftback", "fastback",
        "coupe", "convertible", "cabriolet", "roadster",
        "wagon", "estate", "suv", "crossover"
    ],
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
        "microvan", "people carrier", "light commercial vehicle",
        "mpv"
    ],
    truck: [
        "truck", "lorry", "pickup", "pickup truck",
        "heavy truck", "heavy goods vehicle",
        "tractor unit", "tractor-trailer", "light truck",
        "heavy commercial vehicle", "cab over"
    ],
    bus: [
        "bus", "coach", "transit bus", "city bus",
        "double-decker", "single-decker", "single deck",
        "double-decker bus", "articulated bus", "midibus",
        "minibus", "shuttle bus"
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

const VEHICLE_KIND_NAME_CONTRADICTIONS = {
    car: [
        { make: "ford", models: ["f-150", "f150", "f-250", "f250", "f-350", "f350", "ranger"] },
        { make: "mercedes benz", models: ["sprinter", "vito", "citan", "esprinter", "eqv"] },
        { make: "renault", models: ["master", "trafic", "kangoo"] },
        { make: "peugeot", models: ["boxer", "expert", "partner"] },
        { make: "citroen", models: ["jumper", "jumpy", "berlingo"] },
        { make: "fiat", models: ["ducato", "scudo", "doblo"] },
        { make: "volkswagen", models: ["transporter", "caravelle", "multivan", "crafter", "caddy"] },
        { make: "toyota", models: ["hiace", "commuter", "proace"] }
    ],
    van: [
        { make: "ford", models: ["f-150", "f150", "f-250", "f250", "f-350", "f350", "ranger"] },
        { make: "toyota", models: ["hilux", "tacoma", "tundra"] },
        { make: "mitsubishi", models: ["triton", "l200", "canter", "fighter"] },
        { make: "nissan", models: ["navara", "frontier"] },
        { make: "volkswagen", models: ["amarok"] },
        { make: "isuzu", models: ["d-max"] },
        { make: "mazda", models: ["bt-50", "bt50"] },
        { make: "daf", models: ["xf", "xf95", "xf105"] },
        { make: "man", models: ["tgm", "tga", "tgx", "tgs", "tgl", "l2000"] },
        { make: "mercedes benz", models: ["actros", "atego", "arocs", "axor"] }
    ],
    truck: [
        { make: "ford", models: ["transit", "transit connect", "transit custom", "tourneo"] },
        { make: "mercedes benz", models: ["sprinter", "vito", "citan", "esprinter", "eqv", "v-class"] },
        { make: "renault", models: ["master", "trafic", "kangoo"] },
        { make: "peugeot", models: ["boxer", "expert", "partner"] },
        { make: "citroen", models: ["jumper", "jumpy", "berlingo"] },
        { make: "fiat", models: ["ducato", "scudo", "doblo"] },
        { make: "volkswagen", models: ["transporter", "caravelle", "multivan", "crafter", "caddy"] }
    ],
    bus: [
        { make: "ford", models: ["f-150", "f150", "f-250", "f250", "f-350", "f350", "ranger", "transit", "transit connect", "transit custom"] },
        { make: "toyota", models: ["hilux", "tacoma", "tundra", "hiace", "proace"] },
        { make: "mitsubishi", models: ["triton", "l200", "canter", "fighter"] },
        { make: "nissan", models: ["navara", "frontier", "nv200", "nv300", "nv400"] },
        { make: "volkswagen", models: ["amarok", "transporter", "crafter", "caddy"] },
        { make: "isuzu", models: ["d-max", "elf", "n-series", "f-series"] },
        { make: "mazda", models: ["bt-50"] },
        { make: "daf", models: ["xf", "xf95", "xf105", "cf", "lf", "xg"] },
        { make: "man", models: ["tgm", "tga", "tgx", "tgs", "tgl", "l2000"] },
        { make: "iveco", models: ["daily", "eurocargo", "stralis", "s-way", "x-way"] },
        { make: "mercedes benz", models: ["actros", "atego", "arocs", "axor", "sprinter", "vito", "citan"] },
        { make: "volvo", models: ["fh", "fm", "fe", "fl", "fmx"] },
        { make: "scania", models: ["r-series", "s-series", "p-series", "g-series"] },
        { make: "renault", models: ["master", "trafic", "kangoo", "t", "c", "k"] }
    ]
};

function normalizeVehicleNameForCategoryCheck(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[–—]/g, "-")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function hasObviousVehicleNameCategoryContradiction(
    vehicle,
    requestedKind
) {
    const rules =
        VEHICLE_KIND_NAME_CONTRADICTIONS[requestedKind] ||
        [];

    if (!rules.length) return false;

    const make = normalizeVehicleNameForCategoryCheck(vehicle?.make);
    const model = normalizeVehicleNameForCategoryCheck(vehicle?.model);

    if (!make || !model) return false;

    return rules.some(rule => {
        if (make !== normalizeVehicleNameForCategoryCheck(rule.make)) {
            return false;
        }

        return rule.models.some(candidate => {
            const normalizedCandidate =
                normalizeVehicleNameForCategoryCheck(candidate);

            return model === normalizedCandidate ||
                model.startsWith(normalizedCandidate + " ") ||
                model.endsWith(" " + normalizedCandidate);
        });
    });
}
const VEHICLE_KIND_BODY_TYPE_CONTRADICTIONS = {
    car: [
        "van", "minivan", "panel van", "cargo van", "microvan",
        "people carrier", "light commercial vehicle", "mpv",
        "pickup", "pickup truck", "truck", "lorry", "bus",
        "coach", "minibus", "motorcycle", "motorbike", "moped"
    ],
    motorcycle: [
        "car", "sedan", "hatchback", "coupe", "suv",
        "sport utility", "van", "truck", "bus"
    ],
    van: [
        "suv", "sport utility", "crossover", "sedan",
        "hatchback", "coupe", "roadster", "convertible",
        "wagon", "pickup", "pickup truck", "motorcycle", "moped",
        "truck", "lorry", "bus", "coach", "minibus"
    ],
    truck: [
        "suv", "sport utility", "sedan", "hatchback",
        "coupe", "roadster", "convertible", "wagon",
        "motorcycle", "moped", "bus", "coach", "minibus", "van"
    ],
    bus: [
        "suv", "sport utility", "sedan", "hatchback",
        "coupe", "roadster", "convertible", "wagon",
        "motorcycle", "moped", "truck", "lorry", "van",
        "pickup", "pickup truck"
    ]
};

function isCatalogVehicleKindCompatible(
    vehicle
) {

    const kind =
        normalizeVehicleText(
            vehicle?.kind
        );

    if (!kind) {
        return false;
    }

    /*
     * Model-name contradictions are a hard rejection even when
     * VehiclesDB happens to report a misleading body type.
     */
    if (
        hasObviousVehicleNameCategoryContradiction(
            vehicle,
            kind
        )
    ) {
        return false;
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

function getStrictVehicleCategoryCatalog(
    vehicles,
    kind
) {

    if (!Array.isArray(vehicles)) {
        return [];
    }

    const requestedKind =
        normalizeVehicleText(kind);

    if (!VEHICLE_KINDS.includes(requestedKind)) {
        return [];
    }

    const seen = new Set();

    return vehicles.filter(vehicle => {

        if (
            !vehicle?.make ||
            !vehicle?.model
        ) {
            return false;
        }

        /*
         * The VehiclesDB source kind is authoritative. Supplemental
         * Wikidata/DBpedia candidates must never become part of another
         * category's public catalog, even when their text happens to
         * contain overlapping commercial-vehicle terminology.
         */
        const recordKind =
            normalizeVehicleText(
                vehicle?.kind
            );

        const sourceKind =
            normalizeVehicleText(
                vehicle?.sourceKind ||
                recordKind
            );

        const allowedSourceKinds =
            VEHICLE_CATALOG_SOURCE_KINDS[requestedKind] ||
            [requestedKind];

        if (
            recordKind !== requestedKind ||
            !allowedSourceKinds.includes(sourceKind) ||
            vehicle?.supplementalSource ||
            !isCatalogVehicleKindCompatible(vehicle)
        ) {
            return false;
        }

        const key =
            normalizeVehicleText(vehicle.make) +
            "|" +
            normalizeVehicleText(vehicle.model);

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;

    });

}

function getCachedSupplementalWikipediaTitle(
    make,
    model,
    kind
) {

    const targetMake =
        normalizeVehicleText(make);

    const targetModel =
        normalizeVehicleText(model);

    const targetKind =
        normalizeVehicleText(kind);

    if (!targetMake || !targetModel || !targetKind) {
        return null;
    }

    const sources = [
        supplementalVehicleCatalogCache.get(targetKind) || [],
        dbpediaVehicleCatalogCache.get(targetKind) || []
    ];

    for (const source of sources) {
        for (const vehicle of source) {
            if (
                normalizeVehicleText(vehicle?.kind || targetKind) !== targetKind ||
                normalizeVehicleText(vehicle?.make) !== targetMake ||
                normalizeVehicleText(vehicle?.model) !== targetModel
            ) {
                continue;
            }

            const title =
                String(vehicle?.wikipediaTitle || "").trim();

            if (title) {
                return title;
            }
        }
    }

    return null;
}

function getPopularVehicles(
    vehicles,
    kind = null
) {

    if (!Array.isArray(vehicles)) {
        return [];
    }

    const requestedKind =
        normalizeVehicleText(kind);

    const sourceVehicles =
        VEHICLE_KINDS.includes(requestedKind)
            ? getStrictVehicleCategoryCatalog(
                vehicles,
                requestedKind
            )
            : vehicles;

    const filteredVehicles =
        sourceVehicles
            .filter(
                vehicle =>
                    vehicle &&
                    vehicle.model &&
                    isCatalogVehicleKindCompatible(
                        vehicle
                    )
            );

    /*
     * The unified renderer deliberately builds a weighted, cross-kind
     * candidate order before calling this function. Re-sorting that order
     * here by body-type priority was undoing the balancing and pushing
     * motorcycles, vans, trucks and buses behind the car candidates again.
     *
     * Category views still need their normal popularity ordering.
     */
    const rankedVehicles =
        requestedKind === VEHICLE_ALL_KIND
            ? filteredVehicles
            : filteredVehicles.sort(
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

    const isNonCarCatalog =
        rankedVehicles.some(
            vehicle =>
                normalizeVehicleText(
                    vehicle?.kind
                ) !== "car"
        );

    if (!hasSupplemental) {

        return rankedVehicles.slice(
            0,
            isNonCarCatalog
                ? POPULAR_NONCAR_CANDIDATE_POOL_SIZE
                : POPULAR_CANDIDATE_POOL_SIZE
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
            isNonCarCatalog
                ? POPULAR_NONCAR_BASE_CANDIDATE_LIMIT
                : 900
        ),
        ...supplementalVehicles.slice(
            0,
            isNonCarCatalog
                ? POPULAR_NONCAR_SUPPLEMENTAL_CANDIDATE_LIMIT
                : 1200
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


function popularQualityTextContainsTerm(
    text,
    term
) {

    const normalizedTerm =
        normalizePopularQualityText(term);

    if (!normalizedTerm) {
        return false;
    }

    const escapedParts =
        normalizedTerm
            .split(/\s+/)
            .map(part =>
                part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            );

    const pattern =
        escapedParts.join("\\s+");

    return new RegExp(
        `(?:^|\\s)${pattern}(?=\\s|$)`,
        "i"
    ).test(
        String(text || "")
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

    if (!kind || kind === "car") {
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
        title + " " + description;

    const expectedTerms =
        POPULAR_VEHICLE_TYPE_TERMS[kind] ||
        [];

    const contradictionTerms =
        POPULAR_VEHICLE_KIND_CONTRADICTION_TERMS[kind] ||
        [];

    const hasExpectedText =
        expectedTerms.some(term =>
            popularQualityTextContainsTerm(
                combinedText,
                term
            )
        );

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

    const hasExpectedBodyType =
        expectedTerms.some(term =>
            bodyTypes.some(bodyType =>
                popularQualityTextContainsTerm(
                    bodyType,
                    term
                )
            )
        );

    if (hasExpectedText || hasExpectedBodyType) {
        return true;
    }

    /*
     * A catalog record already carries an authoritative VehiclesDB kind.
     * A legitimate Wikipedia article can omit the literal category word
     * (especially for vans, buses and trucks). Preserve the strong identity
     * check and only reject an explicit contradiction.
     */
    if (
        hasPopularVehicleIdentityMatch(
            details,
            vehicle
        ) &&
        !contradictionTerms.some(term =>
            combinedText.includes(
                normalizePopularQualityText(term)
            )
        )
    ) {
        return true;
    }

    const targetTitle =
        normalizePopularQualityText(
            (vehicle?.make || "") + " " + (vehicle?.model || "")
        );

    if (!targetTitle || title !== targetTitle) {
        return false;
    }

    return !contradictionTerms.some(term =>
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
        popularQualityTextContainsTerm(
            text,
            term
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
        popularQualityTextContainsTerm(
            text,
            term
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

    const isVerifiedOpenverseImage =
        image?.identity_verified === true &&
        image?.source_provider === "Openverse" &&
        /^https:\/\//i.test(imageUrl);

    if (
        !isAllowedVehicleImageHost(imageUrl) &&
        !isVerifiedOpenverseImage
    ) {
        return false;
    }

    /*
     * The backend verifies the image against the already-resolved
     * Wikipedia vehicle article or an identity-matched Commons search
     * result. Trust that explicit verification instead of requiring a
     * fragile filename convention in the browser.
     */
    if (
        image?.identity_verified === true
    ) {
        return true;
    }

    /*
     * Backward-compatible fallback for older cached/API responses.
     * Non-car images were already allowed here because their Wikimedia
     * article identity was verified server-side.
     */
    const imageKind =
        normalizeVehicleText(
            details?.kind ||
            vehicle?.kind ||
            ""
        );

    if (imageKind !== "car") {
        return true;
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

    const minimumDescriptionLength =
        kind === "car"
            ? POPULAR_MIN_DESCRIPTION_LENGTH
            : 40;

    if (
        normalizePopularQualityText(description).length <
        minimumDescriptionLength
    ) {
        return false;
    }

    const specificationCount =
        getPopularVehicleSpecificationCount(
            details
        );

    const minimumSpecificationFields = 0;

    if (
        specificationCount <
        minimumSpecificationFields
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
        /*
         * For non-car categories, the catalog kind + make/model identity
         * checks above are already mandatory. Wikipedia infoboxes for
         * buses/vans/trucks/motorcycles are sometimes sparse or formatted
         * in ways that leave zero normalized technical fields, so do not
         * discard the article when its description clearly identifies the
         * requested vehicle type.
         */
        if (
            kind === "car" ||
            !hasExpectedPopularVehicleKindEvidence(
                details,
                vehicle,
                kind
            )
        ) {
            return false;
        }
    }

    if (
        nonVehicleEntityTermCount >= 2 &&
        vehicleTypeTermCount === 0
    ) {
        return false;
    }

    /*
     * Image availability is a hard public-card requirement. The image
     * must have passed the backend commercial-license and identity checks.
     */
    const imageAvailable =
        hasPopularVehicleImageRelevance(
            details,
            vehicle
        );

    const comparisonAvailable =
        details?.comparisonAvailable === true;

    return (
        imageAvailable &&
        comparisonAvailable
    );
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
    /*
     * Candidate qualification must use the complete response so the same
     * commercial-image, information and comparison gates are applied
     * before a vehicle is allowed to occupy a Popular card.
     */
    const evaluationMode = "quality";

    const detailsRetryAttempts =
        detailKind === "car"
            ? 2
            : 2;

    const detailsRetryDelayMs =
        detailKind === "car"
            ? 650
            : 1000;

    const details =
        await fetchVehicleDetailsWithRetry(
            vehicle.make,
            vehicle.model,
            detailKind,
            detailsRetryAttempts,
            detailsRetryDelayMs,
            evaluationMode
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

    const finalUsable =
        usable &&
        hasRequiredVehicleCardQuality(
            details,
            vehicle,
            detailKind
        );

    popularVehicleQualityCache.set(
        key,
        finalUsable
    );

    return {
        vehicle,
        usable: finalUsable,
        details:
            finalUsable
                ? details
                : null
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


function getPopularQualityScanCandidates(
    kind,
    candidates
) {

    const safeCandidates =
        Array.isArray(candidates)
            ? candidates
            : [];

    if (
        kind === "car" ||
        !safeCandidates.some(
            vehicle => Boolean(vehicle?.supplementalSource)
        )
    ) {
        return safeCandidates.slice();
    }

    const baseCandidates =
        safeCandidates.filter(
            vehicle => !vehicle?.supplementalSource
        );

    const supplementalCandidates =
        safeCandidates.filter(
            vehicle => Boolean(vehicle?.supplementalSource)
        );

    const earlyBaseCount =
        Math.min(
            POPULAR_NONCAR_EARLY_BASE_COUNT,
            baseCandidates.length
        );

    const earlySupplementalCount =
        Math.min(
            POPULAR_NONCAR_EARLY_SUPPLEMENTAL_COUNT,
            supplementalCandidates.length
        );

    const ordered = [
        ...baseCandidates.slice(0, earlyBaseCount),
        ...supplementalCandidates.slice(0, earlySupplementalCount),
        ...baseCandidates.slice(earlyBaseCount),
        ...supplementalCandidates.slice(earlySupplementalCount)
    ];

    const seen = new Set();

    return ordered.filter(vehicle => {
        const key =
            getPopularVehicleQualityKey(
                vehicle,
                kind
            );

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}


async function collectFastPopularVehicleInformation(
    kind,
    candidates,
    desiredCount = POPULAR_REFRESH_CARD_COUNT,
    maxChecks = POPULAR_REFRESH_MAX_CHECKS,
    onValid = null,
    timeBudgetMs = POPULAR_NONCAR_PROGRESSIVE_BUDGET_MS
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

    const targetCount =
        Math.min(
            desiredCount,
            safeCandidates.length
        );

    const validKeys =
        new Set();

    let cursor = 0;
    let resolved = false;
    let resolveEarly;

    const earlyPromise =
        new Promise(
            resolve => {
                resolveEarly = resolve;
            }
        );

    let timeoutId = null;

    const getValidVehicles = () =>
        safeCandidates
            .filter(
                vehicle =>
                    validKeys.has(
                        getPopularVehicleQualityKey(
                            vehicle,
                            kind
                        )
                    )
            )
            .slice(
                0,
                targetCount
            );

    const finish = () => {

        if (resolved) {
            return;
        }

        resolved = true;

        if (timeoutId !== null) {
            window.clearTimeout(
                timeoutId
            );
        }

        resolveEarly(
            getValidVehicles()
        );

    };

    const worker =
        async () => {

            while (!resolved) {

                const index =
                    cursor++;

                if (
                    index >=
                    safeCandidates.length
                ) {
                    break;
                }

                const vehicle =
                    safeCandidates[index];

                try {

                    const result =
                        await evaluatePopularVehicleCandidate(
                            vehicle,
                            kind
                        );

                    if (
                        result?.usable === true
                    ) {

                        const key =
                            getPopularVehicleQualityKey(
                                result.vehicle,
                                kind
                            );

                        if (
                            !validKeys.has(
                                key
                            )
                        ) {

                            validKeys.add(
                                key
                            );

                            if (
                                typeof onValid ===
                                "function"
                            ) {

                                try {
                                    onValid(
                                        result.vehicle
                                    );
                                } catch (error) {
                                    console.warn(
                                        "Popular vehicle progressive render callback failed:",
                                        error
                                    );
                                }

                            }

                            if (
                                validKeys.size >=
                                targetCount
                            ) {
                                finish();
                            }

                        }

                    }

                } catch (error) {

                    console.warn(
                        "Fast popular vehicle refresh request failed:",
                        vehicle?.make,
                        vehicle?.model,
                        kind,
                        error
                    );

                }

            }

        };

    const workerCount =
        Math.min(
            POPULAR_REFRESH_CONCURRENCY,
            safeCandidates.length
        );

    timeoutId =
        window.setTimeout(
            finish,
            Math.max(
                500,
                Number(timeBudgetMs) ||
                POPULAR_NONCAR_PROGRESSIVE_BUDGET_MS
            )
        );

    void Promise.all(
        Array.from(
            {
                length:
                    workerCount
            },
            () => worker()
        )
    ).then(
        finish
    ).catch(
        error => {
            console.warn(
                "Fast popular vehicle refresh workers failed:",
                kind,
                error
            );
            finish();
        }
    );

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

    try {
        const owner =
            await getVehicleAccountCacheOwner();

        const cache =
            await caches.open(
                "worth-it-cars-popular-" +
                VEHICLE_PERSISTENT_POPULAR_VERSION
            );

        const response =
            await cache.match(
                "https://worth-it-cars-cache.local/popular/" +
                encodeURIComponent(String(owner || "guest")) +
                "/" +
                encodeURIComponent(String(kind || VEHICLE_ALL_KIND))
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
                VEHICLE_PERSISTENT_POPULAR_VERSION ||
            !Array.isArray(payload?.vehicles) ||
            !payload.vehicles.length ||
            !Number.isFinite(savedAt) ||
            Date.now() - savedAt >
                VEHICLE_PERSISTENT_CATEGORY_TTL_MS
        ) {
            return null;
        }

        return {
            vehicles: payload.vehicles,
            datasetVersion:
                payload?.datasetVersion ||
                null,
            savedAt
        };

    } catch (error) {
        console.warn(
            "Persistent popular vehicle cache read skipped:",
            kind,
            error
        );
        return null;
    }
}

async function writePersistentPopularVehicles(
    kind,
    vehicles
) {

    if (
        !Array.isArray(vehicles) ||
        !vehicles.length
    ) {
        return;
    }

    try {
        const owner =
            await getVehicleAccountCacheOwner();

        const limit =
            kind === VEHICLE_ALL_KIND
                ? MAX_UNIFIED_VEHICLES
                : MAX_VEHICLES_PER_CATEGORY;

        const compactVehicles =
            vehicles
                .slice(0, limit)
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
            encodeURIComponent(String(owner || "guest")) +
            "/" +
            encodeURIComponent(String(kind || VEHICLE_ALL_KIND)),
            new Response(
                JSON.stringify({
                    version:
                        VEHICLE_PERSISTENT_POPULAR_VERSION,
                    datasetVersion:
                        vehicleDetailsDatasetVersion ||
                        null,
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
        !Array.isArray(candidates) ||
        !candidates.length
    ) {
        return 0;
    }

    const storedPayload =
        await readPersistentPopularVehicles(
            kind
        );

    const stored =
        Array.isArray(storedPayload?.vehicles)
            ? storedPayload.vehicles
            : [];

    if (!stored.length) {
        return 0;
    }

    if (
        storedPayload?.datasetVersion &&
        vehicleDetailsDatasetVersion &&
        storedPayload.datasetVersion !==
            vehicleDetailsDatasetVersion
    ) {
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
            catalogVehicles,
            kind
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
            getPopularInitialVisibleRows(kind)
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

    /*
     * Show all can contain hundreds of already-validated cards. Building
     * every DOM node in one synchronous task makes the browser appear frozen
     * for several seconds. Keep the cached data path unchanged, but yield
     * between small DOM batches so the page opens immediately and the cards
     * fill in progressively.
     */
    const appendBatch =
        (batchVehicles, state, initialCardCount) => {

            if (
                currentVehicleKind !== kind ||
                currentVehicleMode !== "popular" ||
                getStablePopularDisplayState(kind) !== state
            ) {
                return;
            }

            const currentGrid =
                document.getElementById(
                    "popularCarsGrid"
                );

            if (!currentGrid) {
                return;
            }

            const existingCards =
                currentGrid.querySelectorAll(
                    ".car-card[data-popular-stable-card=\"true\"]"
                ).length;

            const visibleLimit =
                Math.max(
                    1,
                    getVehiclesPerRow() *
                    getPopularInitialVisibleRows(kind)
                );

            const fragment =
                document.createDocumentFragment();

            let appendedCount = 0;

            for (const vehicle of batchVehicles) {

                const key =
                    getPopularVehicleQualityKey(
                        vehicle,
                        kind
                    );

                if (
                    state.renderedKeys.has(key)
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

                state.renderedKeys.add(
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
                currentGrid.appendChild(
                    fragment
                );
            }

            reorderPopularVehicleCardsByImageAvailability(
                kind
            );

            refreshStablePopularResults(
                kind
            );

            hideOrShowStablePopularCards(
                kind,
                showAll
            );
        };

    /*
     * The initial cached batch is deliberately small. This makes the
     * Show all click visibly respond on the first frame while the remaining
     * cached cards are inserted in idle animation frames.
     */
    if (
        showAll &&
        Array.isArray(vehicles) &&
        vehicles.length > 48
    ) {

        const state =
            displayState;

        const firstBatch =
            vehicles.slice(
                0,
                48
            );

        appendBatch(
            firstBatch,
            state,
            0
        );

        let offset = 48;

        const scheduleNextBatch = () => {

            if (
                currentVehicleKind !== kind ||
                currentVehicleMode !== "popular" ||
                getStablePopularDisplayState(kind) !== state
            ) {
                return;
            }

            if (offset >= vehicles.length) {
                return;
            }

            const batch =
                vehicles.slice(
                    offset,
                    offset + 32
                );

            offset +=
                batch.length;

            appendBatch(
                batch,
                state,
                0
            );

            if (offset < vehicles.length) {
                window.requestAnimationFrame(
                    scheduleNextBatch
                );
            }
        };

        window.requestAnimationFrame(
            scheduleNextBatch
        );

        return;
    }

    appendBatch(
        Array.isArray(vehicles)
            ? vehicles
            : [],
        displayState,
        0
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
            getPopularBackgroundTargetCount(
                kind,
                candidates?.length
            ),
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



async function refreshNonCarPopularCategoryInBackground(
    kind,
    displayState,
    grid
) {

    try {

        const freshCatalog =
            await fetchFreshVehicleCatalog(
                kind
            );

        let refreshedCatalog =
            freshCatalog.length
                ? freshCatalog
                : (
                    Array.isArray(
                        currentVehicleCatalog
                    )
                        ? currentVehicleCatalog
                        : []
                );

        if (freshCatalog.length) {

            vehicleCatalogCache.set(
                kind,
                freshCatalog
            );

            /*
             * Supplemental Wikidata/DBpedia records are discovery helpers
             * only. VehiclesDB remains the public category membership source.
             */
            vehicleCatalogCache.set(
                kind,
                refreshedCatalog
            );

            currentVehicleCatalog =
                refreshedCatalog;

            setVehicleLastUpdated(
                kind
            );

            updateCarsLastUpdated(
                kind
            );

            void writePersistentVehicleCatalog(
                kind,
                refreshedCatalog
            );

        }

        const candidates =
            getPopularVehicles(
                refreshedCatalog,
                kind
            );

        if (!candidates.length) {

            void enrichVehicleCategoryWithSupplementalSources(
                kind
            );

            return;

        }

        /*
         * Start with a fast, independent quality scan. It does not wait
         * for the previous category's long-running loadingPromise.
         */
        const targetCount =
            Math.min(
                POPULAR_NONCAR_REFRESH_CARD_COUNT,
                getPopularInitialCardCount(
                    kind,
                    candidates.length
                ),
                candidates.length
            );

        const scanCandidates =
            getPopularQualityScanCandidates(
                kind,
                candidates
            );

        const progress =
            vehicle => {

                if (
                    currentVehicleKind !== kind ||
                    currentVehicleMode !== "popular" ||
                    displayState.cancelled
                ) {
                    return;
                }

                mergePopularValidVehiclesIntoState(
                    kind,
                    candidates,
                    [vehicle]
                );

                if (
                    !grid.querySelector(
                        '.car-card[data-popular-stable-card="true"]'
                    )
                ) {
                    grid.innerHTML = "";
                }

                appendStablePopularVehicleCards(
                    kind,
                    [vehicle],
                    false
                );

                const state =
                    popularVehicleQualityState.get(
                        kind
                    );

                if (state) {

                    renderVehicleExpandButton(
                        state.validVehicles,
                        state.validVehicles.slice(
                            0,
                            getPopularInitialCardCount(
                                kind,
                                candidates.length
                            )
                        ),
                        kind,
                        stablePopularHasMoreVehicles(
                            kind,
                            getPopularInitialCardCount(
                                kind,
                                candidates.length
                            )
                        )
                    );

                    hideOrShowStablePopularCards(
                        kind,
                        false
                    );

                }

            };

        const fastVehicles =
            await collectFastPopularVehicleInformation(
                kind,
                scanCandidates,
                targetCount,
                POPULAR_REFRESH_MAX_CHECKS,
                progress,
                POPULAR_NONCAR_PROGRESSIVE_BUDGET_MS
            );

        if (
            currentVehicleKind !== kind ||
            currentVehicleMode !== "popular" ||
            displayState.cancelled
        ) {
            return;
        }

        mergePopularValidVehiclesIntoState(
            kind,
            candidates,
            fastVehicles
        );

        if (
            fastVehicles.length &&
            !grid.querySelector(
                '.car-card[data-popular-stable-card="true"]'
            )
        ) {
            grid.innerHTML = "";
        }

        appendStablePopularVehicleCards(
            kind,
            fastVehicles,
            false
        );

        const visibleCount =
            getPopularInitialCardCount(
                kind,
                candidates.length
            );

        const state =
            popularVehicleQualityState.get(
                kind
            );

        if (state) {

            renderVehicleExpandButton(
                state.validVehicles,
                state.validVehicles.slice(
                    0,
                    visibleCount
                ),
                kind,
                stablePopularHasMoreVehicles(
                    kind,
                    visibleCount
                )
            );

            hideOrShowStablePopularCards(
                kind,
                false
            );

        }

        /*
         * Keep scanning the full category after the quick refresh wave.
         * This is what gradually turns a small first result into the
         * larger set requested by the user.
         */
        void continueStablePopularVehicleLoading(
            kind,
            candidates
        );

        void enrichVehicleCategoryWithSupplementalSources(
            kind
        );

    } catch (error) {

        console.warn(
            "Background non-car popular refresh failed:",
            kind,
            error
        );

    }

}


async function refreshCurrentVehicleCategory(
    kind,
    refreshButton = null
) {
    if (currentVehicleKind !== kind) return;

    if (currentVehicleMode === "search") {
        const searchInput = document.getElementById("carsSearchInput");
        const query = searchInput ? searchInput.value.trim() : "";

        if (!query) {
            await refreshPopularVehicleCategory(kind, refreshButton);
            return;
        }

        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.classList.add("is-loading");
        }

        try {
            const freshCatalog = await fetchFreshVehicleCatalog(kind);

            if (freshCatalog.length) {
                /*
                 * Supplemental sources are not public category members.
                 * Search therefore stays inside the refreshed VehiclesDB catalog.
                 */
                const refreshedCatalog = freshCatalog;

                vehicleCatalogCache.set(
                    kind,
                    refreshedCatalog
                );

                currentVehicleCatalog =
                    refreshedCatalog;

                updateCarsLastUpdated(kind);
            }

            /*
             * Search mode intentionally renders every matching row.
             * Refresh therefore rebuilds the entire current search result,
             * rather than only refreshing the first popular cards.
             */
            const refreshedResults =
                searchVehicleCatalog(
                    currentVehicleCatalog,
                    query
                );

            if (
                currentVehicleKind === kind &&
                currentVehicleMode === "search"
            ) {
                renderVehicleCards(
                    refreshedResults,
                    kind,
                    true
                );
            }

        } catch (error) {
            console.error(
                "Vehicle search refresh failed:",
                kind,
                error
            );

            /*
             * Keep the existing search results visible if a refresh
             * request fails.
             */
            if (
                currentVehicleKind === kind &&
                currentVehicleMode === "search"
            ) {
                const currentResults =
                    searchVehicleCatalog(
                        currentVehicleCatalog,
                        query
                    );

                renderVehicleCards(
                    currentResults,
                    kind,
                    true
                );
            }

        } finally {
            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.classList.remove("is-loading");
            }
        }

        return;
    }

    await refreshPopularVehicleCategory(
        kind,
        refreshButton
    );
}



async function prefetchPopularVehicleDetails(
    kind
) {

    const grid =
        document.getElementById("popularCarsGrid");

    if (!grid || currentVehicleKind !== kind || currentVehicleMode !== "popular") {
        return;
    }

    const cards =
        Array.from(
            grid.querySelectorAll(
                '.car-card[data-popular-stable-card="true"]'
            )
        ).slice(0, POPULAR_INITIAL_DETAILS_PREFETCH);

    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < cards.length) {
            const index = nextIndex++;
            const card = cards[index];

            if (
                currentVehicleKind !== kind ||
                currentVehicleMode !== "popular"
            ) {
                return;
            }

            const make =
                card.dataset.vehicleMake || "";
            const model =
                card.dataset.vehicleModel || "";
            const detailKind =
                card.dataset.vehicleSourceKind || kind;

            if (!make || !model) {
                continue;
            }

            try {
                const details =
                    await fetchVehicleDetailsWithRetry(
                        make,
                        model,
                        detailKind,
                        1,
                        0,
                        "full"
                    );

                if (
                    details &&
                    currentVehicleKind === kind &&
                    currentVehicleMode === "popular"
                ) {
                    const image =
                        card.querySelector(".car-card-image");

                    if (image) {
                        updateVehicleCardInformationPreview(
                            image,
                            details
                        );

                        if (details?.image?.url) {
                            image.dataset.loaded = "true";
                            image.dataset.vehicleImageUrl =
                                String(details.image.url);
                            image.src =
                                String(details.image.url);
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    "Initial vehicle detail prefetch failed:",
                    make,
                    model,
                    detailKind,
                    error
                );
            }
        }
    };

    const workerCount =
        Math.min(
            POPULAR_DETAILS_PREFETCH_CONCURRENCY,
            cards.length
        );

    await Promise.all(
        Array.from(
            { length: workerCount },
            () => worker()
        )
    );
}


function preloadPopularVehicleCardInformation(
    kind
) {

    /*
     * Unified Cars cards contain no image elements. Their detail
     * validation is handled by the account-scoped background warmup.
     */
    if (kind === VEHICLE_ALL_KIND) {
        return;
    }

    const grid =
        document.getElementById("popularCarsGrid");

    if (!grid) {
        return;
    }

    const cards =
        Array.from(
            grid.querySelectorAll(
                '.car-card[data-popular-stable-card="true"], .car-card'
            )
        );

    /*
     * Only hydrate rows near the viewport. Deeper cards are handled by
     * the Intersection Observer as the user scrolls, avoiding a burst of
     * 100 detail/image requests when a category opens.
     */
    const visiblePreloadCount =
        Math.min(
            cards.length,
            Math.max(
                1,
                getVehiclesPerRow() *
                getPopularInitialVisibleRows(kind)
            )
        );

    for (const card of cards.slice(0, visiblePreloadCount)) {
        if (
            currentVehicleKind !== kind ||
            currentVehicleMode !== "popular"
        ) {
            return;
        }

        const image =
            card.querySelector(
                ".car-card-image"
            );

        if (!image) {
            continue;
        }

        queueVehicleImageLoad(
            image,
            image.dataset.vehicleMake || card.dataset.vehicleMake || "",
            image.dataset.vehicleModel || card.dataset.vehicleModel || "",
            image.dataset.vehicleSourceKind ||
                card.dataset.vehicleSourceKind ||
                kind
        );
    }

}

async function renderPopularCatalogImmediately(kind, showAll = false) {
    if (
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular"
    ) {
        return;
    }

    const grid =
        document.getElementById("popularCarsGrid");

    if (!grid) {
        return;
    }

    /*
     * Popular cards are now quality-first.
     *
     * Do NOT render raw VehiclesDB candidates and then remove them after
     * Wikipedia/Wikimedia checks finish. That caused cards to disappear
     * underneath the user and made a click open a modal that immediately
     * closed again.
     *
     * Instead, validate candidates in the background first. A vehicle is
     * allowed into the public Popular grid only when it has:
     *   1. reliable vehicle information,
     *   2. an identity-verified, commercially reusable image, and
     *   3. comparison data.
     *
     * This is especially important for buses, vans, trucks and motorcycles,
     * where incomplete catalog metadata can otherwise look like a valid
     * card before the detail request has finished.
     */
    const catalog =
        kind === VEHICLE_ALL_KIND
            ? (
                vehicleCatalogCache.get(
                    VEHICLE_ALL_KIND
                ) ||
                currentVehicleCatalog
            )
            : getStrictVehicleCategoryCatalog(
                currentVehicleCatalog,
                kind
            );

    /*
     * Build a larger validation pool than the public 1000-card limit.
     * For the unified view, scan the categories in a weighted round-robin
     * instead of letting the popularity sort fill the pool almost entirely
     * with cars. This is what allows valid motorcycles, vans, trucks and
     * buses to compete for public slots as well.
     *
     * Each category keeps its original VehiclesDB popularity order.
     * Cars get a larger share because the section is still primarily a
     * Cars/vehicles browser, while every other category gets guaranteed
     * early validation opportunities.
     */
    const unique = [];
    const seen = new Set();

    const candidatePoolLimit =
        kind === VEHICLE_ALL_KIND
            ? UNIFIED_BACKGROUND_CANDIDATE_POOL_LIMIT
            : MAX_UNIFIED_VEHICLES;

    const normalizedCatalog =
        catalog.filter(
            vehicle =>
                vehicle?.make &&
                vehicle?.model &&
                VEHICLE_KINDS.includes(
                    vehicle.sourceKind ||
                    vehicle.kind
                )
        );

    const candidateBuckets =
        kind === VEHICLE_ALL_KIND
            ? VEHICLE_KINDS.reduce(
                (map, sourceKind) => {
                    map.set(
                        sourceKind,
                        normalizedCatalog.filter(
                            vehicle =>
                                (vehicle.sourceKind || vehicle.kind) ===
                                sourceKind
                        )
                    );
                    return map;
                },
                new Map()
            )
            : null;

    if (kind === VEHICLE_ALL_KIND) {
        /*
         * Weighted order: 4 cars, then 1 motorcycle, 1 van, 1 truck,
         * 1 bus. This preserves a strong car presence without allowing
         * cars to starve the commercial/two-wheeler categories.
         */
        const weights = {
            car: 4,
            motorcycle: 1,
            van: 1,
            truck: 1,
            bus: 1
        };

        let bucketIndex = 0;

        while (
            unique.length < candidatePoolLimit &&
            bucketIndex < candidatePoolLimit * 2
        ) {
            let addedThisRound = false;

            for (const sourceKind of VEHICLE_KINDS) {
                const bucket =
                    candidateBuckets.get(sourceKind) || [];

                const takeCount =
                    weights[sourceKind] || 1;

                for (
                    let offset = 0;
                    offset < takeCount &&
                    bucketIndex < candidatePoolLimit * 2;
                    offset++
                ) {
                    const vehicle =
                        bucket.shift();

                    if (!vehicle) {
                        continue;
                    }

                    const key =
                        getPopularVehicleQualityKey(
                            vehicle,
                            kind
                        );

                    if (seen.has(key)) {
                        continue;
                    }

                    seen.add(key);
                    unique.push(vehicle);
                    addedThisRound = true;

                    if (unique.length >= candidatePoolLimit) {
                        break;
                    }
                }

                if (unique.length >= candidatePoolLimit) {
                    break;
                }
            }

            if (!addedThisRound) {
                break;
            }

            bucketIndex++;
        }
    } else {
        for (const vehicle of normalizedCatalog) {
            const key =
                getPopularVehicleQualityKey(
                    vehicle,
                    kind
                );

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            unique.push(vehicle);

            if (unique.length >= candidatePoolLimit) {
                break;
            }
        }
    }

    currentVehicleShowAll =
        Boolean(showAll);

    /*
     * Start with an empty/loading state. No unverified card is inserted
     * into the DOM while the quality scan is running.
     */
    const hasRenderedVehicleCards =
        Boolean(
            grid.querySelector(
                '.car-card[data-popular-stable-card="true"]'
            )
        );

    /*
     * When Show all is requested, never blank an already populated
     * quality-gated grid while persistent data is being restored. The
     * existing verified cards stay visible and the background scanner
     * appends the rest.
     */
    if (!showAll || !hasRenderedVehicleCards) {
        grid.innerHTML =
            '<div class="cars-empty-state">' +
                '<div class="cars-empty-icon">' +
                    getVehicleKindInfo(kind).icon +
                '</div>' +
                '<strong>Checking vehicle information...</strong>' +
                '<p>Only vehicles with reliable information and a verified reusable image will be shown.</p>' +
            '</div>';
    }

    if (!unique.length) {
        currentVehicleResults = [];
        return;
    }

    const initialCount =
        getInitialVehicleLimit(unique);

    const desiredCount =
        showAll
            ? Math.min(
                MAX_UNIFIED_VEHICLES,
                unique.length
            )
            : initialCount;

    /*
     * For the first paint, do enough background checks to fill the visible
     * rows. A failed/slow candidate is simply skipped and the next
     * candidate is checked; it is never rendered and later removed.
     */
    const maxChecks =
        showAll
            ? Math.max(
                getPopularMaxNewChecks(kind),
                desiredCount,
                unique.length
            )
            : Math.max(
                getPopularInitialCheckLimit(kind),
                desiredCount
            );

    startStablePopularVehicleDisplay(
        kind,
        showAll
    );

    /*
     * Returning users can restore the already-verified vehicle list first.
     * The current quality scanner then only has to fill gaps/new candidates.
     */
    const restorePromise =
        restorePersistentPopularVehicles(
            kind,
            unique
        );

    /*
     * "Show all" must never wait for the entire 1000-vehicle quality scan.
     * The initial scan may already be running in the background. Reuse the
     * validated vehicles that are available right now, render them
     * immediately, and let the same quality scanner append further valid
     * vehicles as they finish.
     */
    let validVehicles = [];

    let qualityState =
        popularVehicleQualityState.get(kind);

    const backgroundWarmupActive =
        kind === VEHICLE_ALL_KIND &&
        unifiedVehicleBackgroundWarmupActive;

    if (showAll) {
        /*
         * Show all is intentionally non-blocking. Use every vehicle that
         * the background scanner has already validated without waiting for
         * the persistent restore request to finish.
         */
        validVehicles =
            Array.isArray(qualityState?.validVehicles)
                ? qualityState.validVehicles.slice()
                : [];

        /*
         * On a first-ever visit there may be no background result yet.
         * Do only one small starter batch; never wait for the full 2000.
         */
        if (
            !validVehicles.length &&
            !backgroundWarmupActive
        ) {
            await ensurePopularVehicleQuality(
                kind,
                unique,
                Math.min(
                    desiredCount,
                    Math.max(
                        getPopularInitialCheckLimit(kind),
                        getPopularQualityBatchSize(kind)
                    )
                ),
                Math.min(
                    maxChecks,
                    Math.max(
                        getPopularInitialCheckLimit(kind),
                        getPopularQualityBatchSize(kind)
                    )
                )
            );

            qualityState =
                popularVehicleQualityState.get(kind);

            validVehicles =
                Array.isArray(qualityState?.validVehicles)
                    ? qualityState.validVehicles.slice()
                    : [];
        }
    } else {
        validVehicles =
            await ensurePopularVehicleQuality(
                kind,
                unique,
                desiredCount,
                maxChecks
            );
    }

    if (
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular"
    ) {
        return;
    }

    const displayState =
        getStablePopularDisplayState(kind);

    if (displayState) {
        displayState.showAll =
            Boolean(showAll);
    }

    /*
     * Only validated vehicles reach the DOM. Keep the existing verified
     * cards during Show all expansion; this avoids a visible blank/loading
     * phase while the persistent snapshot is being restored.
     */
    if (!showAll) {
        grid.innerHTML = "";
    } else if (!validVehicles.length) {
        grid.innerHTML =
            '<div class="cars-empty-state">' +
                '<div class="cars-empty-icon">' +
                    getVehicleKindInfo(kind).icon +
                '</div>' +
                '<strong>Checking vehicle information...</strong>' +
                '<p>Only vehicles with reliable information and a verified reusable image will be shown.</p>' +
            '</div>';
    }

    appendStablePopularVehicleCards(
        kind,
        validVehicles,
        showAll
    );

    if (showAll) {
        /*
         * Persistent validation may finish after the first Show all paint.
         * Merge it into the shared quality state and immediately append any
         * additional verified vehicles without blocking the UI.
         */
        void restorePromise.then(() => {
            if (
                currentVehicleKind !== kind ||
                currentVehicleMode !== "popular"
            ) {
                return;
            }

            const restoredState =
                popularVehicleQualityState.get(kind);

            const restoredVehicles =
                Array.isArray(restoredState?.validVehicles)
                    ? restoredState.validVehicles.slice()
                    : [];

            if (!restoredVehicles.length) {
                return;
            }

            appendStablePopularVehicleCards(
                kind,
                restoredVehicles,
                true
            );

            currentVehicleResults =
                restoredVehicles.slice();

            renderVehicleCollapseButton(kind);
        }).catch(error => {
            console.warn(
                "Persistent popular vehicle restore failed:",
                error
            );
        });
    }

    currentVehicleResults =
        validVehicles.slice();

    if (showAll) {
        /*
         * The user gets the already-validated vehicles immediately.
         * continueStablePopularVehicleLoading() below keeps scanning the
         * remaining catalog and appends only vehicles that pass the same
         * quality gate.
         */
        renderVehicleCollapseButton(kind);
    } else {
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
    }

    hideOrShowStablePopularCards(
        kind,
        showAll
    );

    /*
     * Continue validating the remaining catalog in the background. New
     * cards are appended only after they pass the exact same quality gate.
     * This keeps the visible list stable and prevents disappearing cards.
     */
    if (!backgroundWarmupActive) {
        void continueStablePopularVehicleLoading(
            kind,
            unique
        );
    }
}
async function loadAndRenderNonCarPopularVehicles(
    kind,
    showAll = false
) {
    return renderPopularCatalogImmediately(kind, showAll);
}


async function loadAndRenderPopularVehicles(
    kind,
    showAll = false
) {
    return renderPopularCatalogImmediately(kind, showAll);
}

/*
 * ============================================================
 * POPULAR CATEGORY REFRESH
 * ============================================================
 */

async function refreshPopularVehicleCategory(
    kind,
    refreshButton = null
) {

    if (kind === VEHICLE_ALL_KIND) {
        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.classList.add("is-loading");
        }
        try {
            const fresh = await buildFreshUnifiedVehicleCatalog();
            if (fresh.length && currentVehicleKind === VEHICLE_ALL_KIND) {
                vehicleCatalogCache.set(VEHICLE_ALL_KIND, fresh);
                currentVehicleCatalog = fresh;
                void writePersistentVehicleCatalog(VEHICLE_ALL_KIND, fresh);
                await renderPopularCatalogImmediately(VEHICLE_ALL_KIND, false);
            }
        } catch (error) {
            console.warn("Unified vehicle refresh failed:", error);
        } finally {
            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.classList.remove("is-loading");
            }
        }
        return;
    }
    if (
        currentVehicleKind !== kind ||
        currentVehicleMode !== "popular"
    ) {
        return;
    }

    const grid =
        document.getElementById("popularCarsGrid");

    if (!grid) {
        return;
    }

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add("is-loading");
    }

    try {
        /*
         * Never clear the current 100 cards while the network is working.
         * Fetch the lightweight catalog first; the existing UI remains
         * usable if the refresh fails.
         */
        const freshCatalog =
            await fetchFreshVehicleCatalog(kind);

        if (
            freshCatalog.length &&
            currentVehicleKind === kind &&
            currentVehicleMode === "popular"
        ) {
            vehicleCatalogCache.set(
                kind,
                freshCatalog
            );

            currentVehicleCatalog =
                freshCatalog;

            setVehicleLastUpdated(kind);
            updateCarsLastUpdated(kind);
        }

        if (
            currentVehicleKind === kind &&
            currentVehicleMode === "popular"
        ) {
            await renderPopularCatalogImmediately(
                kind,
                false
            );
        }

        /*
         * Supplemental sources and details are deliberately background
         * work. Refresh therefore finishes as soon as the lightweight
         * category catalog is usable.
         */
        void enrichVehicleCategoryWithSupplementalSources(kind);

    } catch (error) {
        console.error(
            "Vehicle category refresh failed:",
            kind,
            error
        );

        /*
         * Preserve the current cards on temporary network/API failures.
         * A refresh must never turn a populated category into an empty
         * state.
         */
        if (
            currentVehicleKind === kind &&
            currentVehicleMode === "popular" &&
            !grid.querySelector(".car-card")
        ) {
            await renderPopularCatalogImmediately(
                kind,
                false
            );
        }

    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("is-loading");
        }
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


/* ============================================================
 * VEHICLE PERSONAL LISTS
 * ============================================================ */

function getVehicleStorageKey(vehicle, kind = currentVehicleKind) {
    return [
        normalizeVehicleText(vehicle?.sourceKind || vehicle?.kind || kind || ""),
        normalizeVehicleText(vehicle?.make || ""),
        normalizeVehicleText(vehicle?.model || "")
    ].filter(Boolean).join("|");
}

function readVehiclePersonalList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeVehiclePersonalList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
}

function getVehicleFavorites() {
    return readVehiclePersonalList(VEHICLE_FAVORITES_STORAGE_KEY);
}

function getVehicleRecent() {
    return readVehiclePersonalList(VEHICLE_RECENT_STORAGE_KEY);
}

function getVehicleAccountLists() {
    try {
        const metadata =
            window.__worthItVehicleAccountLists ||
            window.supabaseClient?.auth?.currentUser?.user_metadata?.[VEHICLE_ACCOUNT_METADATA_KEY];

        return {
            favorites: Array.isArray(metadata?.favorites) ? metadata.favorites : null,
            recent: Array.isArray(metadata?.recent) ? metadata.recent : null
        };
    } catch {
        return { favorites: null, recent: null };
    }
}

const VEHICLE_ACCOUNT_LISTS_SYNC_DEBOUNCE_MS = 2500;
const VEHICLE_ACCOUNT_LISTS_SYNC_RETRY_MS = 60 * 1000;

let vehicleAccountListsSyncPromise = Promise.resolve();
let vehicleAccountListsSyncTimer = null;
let vehicleAccountListsPendingPayload = null;
let vehicleAccountListsLastSignature = "";

async function flushVehicleAccountListsSync() {
    if (vehicleAccountListsSyncTimer !== null) {
        window.clearTimeout(vehicleAccountListsSyncTimer);
        vehicleAccountListsSyncTimer = null;
    }

    const payload = vehicleAccountListsPendingPayload;
    vehicleAccountListsPendingPayload = null;

    if (!payload) return;

    const signature = JSON.stringify(payload);

    if (signature === vehicleAccountListsLastSignature) {
        return;
    }

    vehicleAccountListsSyncPromise =
        vehicleAccountListsSyncPromise
            .catch(() => {})
            .then(async () => {
                try {
                    if (!window.supabaseClient?.auth) {
                        return;
                    }

                    const { data: sessionData } =
                        await window.supabaseClient.auth.getSession();

                    if (!sessionData?.session?.user) {
                        return;
                    }

                    await window.supabaseClient.auth.updateUser({
                        data: {
                            [VEHICLE_ACCOUNT_METADATA_KEY]: payload
                        }
                    });

                    vehicleAccountListsLastSignature = signature;
                } catch (error) {
                    const status =
                        Number(error?.status) ||
                        Number(error?.code) ||
                        0;

                    const message =
                        String(
                            error?.message ||
                            error ||
                            ""
                        );

                    if (
                        status === 429 ||
                        /(?:^|\D)429(?:\D|$)|too many requests/i.test(
                            message
                        )
                    ) {
                        vehicleAccountListsPendingPayload = payload;

                        vehicleAccountListsSyncTimer =
                            window.setTimeout(
                                () => {
                                    void flushVehicleAccountListsSync();
                                },
                                VEHICLE_ACCOUNT_LISTS_SYNC_RETRY_MS
                            );
                    }
                }
            });

    await vehicleAccountListsSyncPromise;
}

async function loadVehicleAccountLists() {
    try {
        if (!window.supabaseClient?.auth) return;

        const { data } = await window.supabaseClient.auth.getSession();
        const metadata = data?.session?.user?.user_metadata?.[VEHICLE_ACCOUNT_METADATA_KEY];

        if (!metadata || typeof metadata !== "object") return;

        const favorites = Array.isArray(metadata.favorites) ? metadata.favorites : [];
        const recent = Array.isArray(metadata.recent) ? metadata.recent.slice(0, VEHICLE_RECENT_LIMIT) : [];

        window.__worthItVehicleAccountLists = { favorites, recent };
        vehicleAccountListsLastSignature =
            JSON.stringify({ favorites, recent });
        writeVehiclePersonalList(VEHICLE_FAVORITES_STORAGE_KEY, favorites);
        writeVehiclePersonalList(VEHICLE_RECENT_STORAGE_KEY, recent);
        renderVehiclePersonalPanels();
        refreshVehicleFavoriteControls();
    } catch {
        /* Local fallback remains available if the account cannot be read. */
    }
}

function saveVehicleAccountLists(favorites, recent) {
    const payload = {
        favorites: Array.isArray(favorites) ? favorites : [],
        recent: Array.isArray(recent)
            ? recent.slice(0, VEHICLE_RECENT_LIMIT)
            : []
    };

    window.__worthItVehicleAccountLists = payload;
    vehicleAccountListsPendingPayload = payload;

    if (vehicleAccountListsSyncTimer !== null) {
        window.clearTimeout(
            vehicleAccountListsSyncTimer
        );
    }

    vehicleAccountListsSyncTimer =
        window.setTimeout(
            () => {
                void flushVehicleAccountListsSync();
            },
            VEHICLE_ACCOUNT_LISTS_SYNC_DEBOUNCE_MS
        );
}

function isVehicleFavorite(vehicle, kind = currentVehicleKind) {
    const key = getVehicleStorageKey(vehicle, kind);
    return getVehicleFavorites().some(item => item?.key === key);
}

function toggleVehicleFavorite(vehicle, kind = currentVehicleKind) {
    const key = getVehicleStorageKey(vehicle, kind);
    const favorites = getVehicleFavorites();
    const index = favorites.findIndex(item => item?.key === key);

    if (index >= 0) {
        favorites.splice(index, 1);
    } else {
        favorites.unshift({
            key,
            make: vehicle?.make || "",
            model: vehicle?.model || "",
            kind: vehicle?.sourceKind || vehicle?.kind || kind || "",
            bodyType: vehicle?.bodyType || "",
            yearStart: vehicle?.yearStart ?? "",
            yearEnd: vehicle?.yearEnd ?? ""
        });
    }

    const recent = getVehicleRecent();
    writeVehiclePersonalList(VEHICLE_FAVORITES_STORAGE_KEY, favorites);
    renderVehiclePersonalPanels();
    refreshVehicleFavoriteControls();
    void saveVehicleAccountLists(favorites, recent);
}

function recordRecentlyViewedVehicle(vehicle, kind = currentVehicleKind) {
    const key = getVehicleStorageKey(vehicle, kind);
    if (!key) return;

    const recent = getVehicleRecent().filter(item => item?.key !== key);

    recent.unshift({
        key,
        make: vehicle?.make || "",
        model: vehicle?.model || "",
        kind: vehicle?.sourceKind || vehicle?.kind || kind || "",
        bodyType: vehicle?.bodyType || "",
        yearStart: vehicle?.yearStart ?? "",
        yearEnd: vehicle?.yearEnd ?? ""
    });

    const trimmedRecent = recent.slice(0, VEHICLE_RECENT_LIMIT);
    writeVehiclePersonalList(VEHICLE_RECENT_STORAGE_KEY, trimmedRecent);
    renderVehiclePersonalPanels();
    void saveVehicleAccountLists(getVehicleFavorites(), trimmedRecent);
}

function ensureVehiclePersonalPanels() {
    const grid = document.getElementById("popularCarsGrid");
    if (!grid || document.getElementById("carsPersonalPanels")) return;

    const wrapper = document.createElement("div");
    wrapper.id = "carsPersonalPanels";
    wrapper.className = "cars-personal-panels";
    wrapper.dataset.activeTab = "recent";
    wrapper.innerHTML =
        '<div class="cars-personal-toolbar">' +
        '<button type="button" class="cars-personal-tab is-active" data-personal-tab="recent">Recently viewed</button>' +
        '<button type="button" class="cars-personal-tab" data-personal-tab="favorites">Favorites</button>' +
        '</div>' +
        '<div class="cars-personal-content" id="carsPersonalContent"></div>';

    grid.parentNode.insertBefore(wrapper, grid);

    wrapper.querySelectorAll("[data-personal-tab]").forEach(button =>
        button.addEventListener("click", () => {
            wrapper.querySelectorAll("[data-personal-tab]").forEach(item =>
                item.classList.toggle("is-active", item === button)
            );
            wrapper.dataset.activeTab = button.dataset.personalTab;
            renderVehiclePersonalPanels();
        })
    );

    renderVehiclePersonalPanels();
}

function renderVehiclePersonalPanels() {
    const wrapper = document.getElementById("carsPersonalPanels");
    const content = document.getElementById("carsPersonalContent");
    if (!wrapper || !content) return;

    const tab = wrapper.dataset.activeTab || "recent";
    const list =
        tab === "favorites"
            ? getVehicleFavorites()
            : getVehicleRecent();

    if (!list.length) {
        content.innerHTML =
            '<div class="cars-personal-empty">' +
            '<span>' + (tab === "favorites" ? "♡" : "↺") + '</span>' +
            '<div><strong>' +
            (tab === "favorites" ? "No favorite vehicles yet" : "No recently viewed vehicles yet") +
            '</strong><p>' +
            (tab === "favorites"
                ? "Open a vehicle and save it to Favorites."
                : "Vehicles you open will appear here for quick access.") +
            '</p></div></div>';
        return;
    }

    content.innerHTML = list.map(item => {
        const label = (item.make + " " + item.model).trim();
        const meta = [
            item.bodyType,
            item.yearStart && item.yearEnd
                ? item.yearStart + "–" + item.yearEnd
                : item.yearStart || item.yearEnd
        ].filter(Boolean).join(" • ");

        return '<button type="button" class="cars-personal-item" data-personal-key="' +
            escapeVehicleHtml(item.key) +
            '">' +
            '<span class="cars-personal-item-icon">' + (tab === "favorites" ? "♥" : "↺") + '</span>' +
            '<span class="cars-personal-item-copy"><strong>' +
            escapeVehicleHtml(label) +
            '</strong><small>' +
            escapeVehicleHtml(meta || "Vehicle") +
            '</small></span>' +
            '<span class="cars-personal-item-action">Open</span></button>';
    }).join("");

    content.querySelectorAll(".cars-personal-item").forEach(button =>
        button.addEventListener("click", () => {
            const item = list.find(entry => entry?.key === button.dataset.personalKey);
            if (!item) return;

            const personalVehicles =
                list.map(entry =>
                    buildVehicleNavigationItem(
                        entry,
                        entry.kind || currentVehicleKind
                    )
                );

            const selectedVehicle =
                buildVehicleNavigationItem(
                    item,
                    item.kind || currentVehicleKind
                );

            const selectedIndex =
                personalVehicles.findIndex(
                    entry =>
                        getVehicleNavigationKey(
                            entry,
                            entry.kind || currentVehicleKind
                        ) ===
                        getVehicleNavigationKey(
                            selectedVehicle,
                            selectedVehicle.kind || currentVehicleKind
                        )
                );

            openVehicleDetailsPanel(
                selectedVehicle,
                item.kind || currentVehicleKind,
                {
                    items: personalVehicles,
                    index: selectedIndex
                }
            );
        })
    );
}

function refreshVehicleFavoriteControls() {
    document.querySelectorAll("[data-vehicle-favorite]").forEach(control => {
        const vehicle = control._worthItVehicle;
        if (!vehicle) return;

        const favorite = isVehicleFavorite(vehicle, control._worthItVehicleKind);
        control.textContent = favorite ? "♥" : "♡";
        control.classList.toggle("is-favorite", favorite);
        control.setAttribute(
            "aria-label",
            favorite ? "Remove from favorites" : "Add to favorites"
        );
        control.title = favorite ? "Remove from favorites" : "Add to favorites";
    });
}

/*
 * ============================================================
 * SEARCH
 * ============================================================
 */

function searchVehicleCatalog(vehicles, query) {
    const normalizedQuery = normalizeVehicleText(query);
    if (!normalizedQuery) return currentVehicleKind === VEHICLE_ALL_KIND ? vehicles.slice(0, MAX_UNIFIED_VEHICLES) : getPopularVehicles(vehicles, currentVehicleKind);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const categoryVehicles = currentVehicleKind === VEHICLE_ALL_KIND ? vehicles : getStrictVehicleCategoryCatalog(vehicles, currentVehicleKind);
    return categoryVehicles.map(vehicle => {
        const make = normalizeVehicleText(vehicle?.make || "");
        const model = normalizeVehicleText(vehicle?.model || "");
        const body = normalizeVehicleText(vehicle?.bodyType || "");
        const full = (make + " " + model + " " + body).trim();
        let score = 0;
        if (full === normalizedQuery) score += 1000;
        if (make === normalizedQuery) score += 850;
        if (model === normalizedQuery) score += 800;
        if (make.startsWith(normalizedQuery)) score += 500;
        if (model.startsWith(normalizedQuery)) score += 450;
        if (full.startsWith(normalizedQuery)) score += 350;
        if (full.includes(normalizedQuery)) score += 250;
        for (const token of tokens) { if (make === token) score += 180; else if (make.startsWith(token)) score += 120; else if (model.startsWith(token)) score += 110; else if (model.includes(token)) score += 80; else if (body.includes(token)) score += 40; }
        return {vehicle, score};
    }).filter(item => item.score > 0).sort((a,b) => b.score - a.score).slice(0, MAX_SEARCH_RESULTS).map(item => item.vehicle);
}
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

    card.dataset.infoState =
        "pending";

    card.dataset.comparisonState =
        "pending";

    card.dataset.imageState =
        currentVehicleMode === "popular"
            ? "pending"
            : "not-required";

    card.dataset.popularStableCard =
        currentVehicleMode === "popular"
            ? "true"
            : "false";

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
     * Popular cards are quality-gated before they reach the DOM. Their
     * full details response is therefore already cached here, including
     * the image that passed the backend's identity/licensing checks.
     * Render that verified image directly instead of showing an emoji
     * placeholder and trying to hydrate it later.
     */
    const cachedDetails =
        vehicleDetailsCache.get(
            getVehicleDetailsCacheKey(
                vehicle.make,
                vehicle.model,
                vehicle.sourceKind || kind,
                "full"
            )
        );

    const verifiedImage =
        currentVehicleMode === "popular" &&
        hasPopularVehicleImageRelevance(
            cachedDetails,
            vehicle
        )
            ? String(cachedDetails.image.url)
            : "";

    const visual =
        verifiedImage
            ? createVehicleImageElement(
                vehicle,
                kind
            )
            : createVehicleImagePlaceholder(
                vehicle,
                kind,
                "Verified image loading..."
            );

    if (verifiedImage) {
        visual.src = verifiedImage;
        visual.dataset.verifiedImage = "true";
        visual.style.opacity = "1";
    }

    const textContainer =
        document.createElement(
            "div"
        );

    textContainer.className =
        "car-card-content";

    textContainer.innerHTML = `
        <strong class="car-card-title">
            ${make} ${model}
        </strong>

        <span class="car-card-meta">
            ${secondaryText}
        </span>

        <span class="car-card-click-hint">
            Click to see more info and compare
        </span>
    `;

    card.appendChild(
        visual
    );

    card.appendChild(
        textContainer
    );

    card.dataset.vehicleKind =
        kind;

    card.dataset.vehicleSourceKind =
        vehicle.sourceKind ||
        kind;

    card.dataset.vehicleMake =
        vehicle.make || "";

    card.dataset.vehicleModel =
        vehicle.model || "";

    if (cachedDetails) {
        applyUnifiedVehicleCardDetailsState(
            card,
            vehicle,
            cachedDetails
        );
    }

    card._worthItVehicle =
        vehicle;

    card._worthItVehicleKind =
        kind;

    card.addEventListener(
        "click",
        event => {
            event.preventDefault();
            event.stopPropagation();

            const navigationItems =
                getVehicleModalNavigationListFromCards();

            const selectedIndex =
                navigationItems.findIndex(
                    item =>
                        getVehicleNavigationKey(
                            item,
                            item.kind || kind
                        ) ===
                        getVehicleNavigationKey(
                            vehicle,
                            kind
                        )
                );

            void openVehicleDetailsPanel(
                vehicle,
                kind,
                {
                    items: navigationItems,
                    index: selectedIndex
                }
            );
        }
    );

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
        ["price", "MSRP / listed price"],
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
        <div class="worth-it-vehicle-modal-backdrop"></div>

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

        <button
            type="button"
            class="worth-it-vehicle-modal-navigation worth-it-vehicle-modal-navigation-previous"
            data-vehicle-navigation="previous"
            aria-label="Previous vehicle — A or ←"
            title="Previous vehicle — A or ←"
            hidden
        >
            <span class="worth-it-vehicle-navigation-key">A</span>
            <span class="worth-it-vehicle-navigation-arrow">❮</span>
            <span class="worth-it-vehicle-navigation-key">←</span>
        </button>

        <button
            type="button"
            class="worth-it-vehicle-modal-navigation worth-it-vehicle-modal-navigation-next"
            data-vehicle-navigation="next"
            aria-label="Next vehicle — D or →"
            title="Next vehicle — D or →"
            hidden
        >
            <span class="worth-it-vehicle-navigation-key">D</span>
            <span class="worth-it-vehicle-navigation-arrow">❯</span>
            <span class="worth-it-vehicle-navigation-key">→</span>
        </button>
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

    modal.querySelector(
        '[data-vehicle-navigation="previous"]'
    )?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            event.stopPropagation();
            navigateVehicleModal("previous");
        }
    );

    modal.querySelector(
        '[data-vehicle-navigation="next"]'
    )?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            event.stopPropagation();
            navigateVehicleModal("next");
        }
    );

    return modal;

}


if (!window.__worthItVehicleDetailsNavigationBound) {
    window.__worthItVehicleDetailsNavigationBound = true;

    document.addEventListener(
        "keydown",
        event => {
            const modal =
                document.getElementById(
                    "worthItVehicleDetailsModal"
                );

            if (
                !modal ||
                !modal.classList.contains("is-open")
            ) {
                return;
            }

            const target =
                event.target;

            if (
                target instanceof HTMLElement &&
                (
                    target.isContentEditable ||
                    ["INPUT", "TEXTAREA", "SELECT"].includes(
                        target.tagName
                    )
                )
            ) {
                return;
            }

            // Browser text-selection shortcuts such as Ctrl+A / Cmd+A
            // must not trigger vehicle navigation while the details modal
            // is open. Only the plain A/D keys are navigation commands.
            if (
                event.ctrlKey ||
                event.metaKey ||
                event.altKey
            ) {
                return;
            }

            const key =
                String(event.key || "").toLowerCase();

            if (
                key === "arrowleft" ||
                key === "a"
            ) {
                event.preventDefault();
                navigateVehicleModal("previous");
            } else if (
                key === "arrowright" ||
                key === "d"
            ) {
                event.preventDefault();
                navigateVehicleModal("next");
            }
        }
    );
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
    kind,
    navigation = null
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

    if (
        navigation &&
        Array.isArray(navigation.items)
    ) {
        setVehicleModalNavigation(
            vehicle,
            kind,
            navigation.items,
            navigation.index
        );
    } else {
        const cardItems =
            getVehicleModalNavigationListFromCards();

        setVehicleModalNavigation(
            vehicle,
            kind,
            cardItems.length
                ? cardItems
                : [vehicle]
        );
    }

    const requestToken =
        String(Date.now()) +
        "-" +
        String(
            Math.random()
                .toString(36)
                .slice(2)
        );

    modal.dataset.vehicleRequestToken =
        requestToken;

    setVehicleModalOpen(true);

    const info =
        getVehicleKindInfo(kind);

    const title =
        `${vehicle.make || ""} ${vehicle.model || ""}`.trim();

    recordRecentlyViewedVehicle(vehicle, kind);

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
        !modal.classList.contains("is-open") ||
        modal.dataset.vehicleRequestToken !==
            requestToken
    ) {
        return;
    }

    if (!details) {

        if (
            currentVehicleKind === VEHICLE_ALL_KIND &&
            currentVehicleMode === "popular"
        ) {
            body.innerHTML = `
                <div class="worth-it-vehicle-detail-loading">
                    <div class="worth-it-vehicle-detail-loading-icon">⚠️</div>
                    <strong>Couldn't find informations on wikipedia and online</strong>
                    <span>No reliable vehicle information was returned. Please try opening this vehicle again later.</span>
                </div>
            `;

            return;
        }

        body.innerHTML = `
            <div class="worth-it-vehicle-detail-loading">
                <div class="worth-it-vehicle-detail-loading-icon">⚠️</div>
                <strong>Couldn't find informations on wikipedia and online</strong>
                <span>No reliable vehicle information was returned.</span>
            </div>
        `;

        return;
    }

    /*
     * A Popular card must never open into a dead/no-information detail
     * panel. If the complete response fails the same image + information
     * + comparison gates used by recovery, mark the card for replacement
     * and stop here.
     */
    if (
        currentVehicleMode === "popular"
    ) {
        const card =
            findUnifiedVehicleCard(vehicle) ||
            Array.from(
                document.querySelectorAll(
                    '.car-card[data-popular-stable-card="true"]'
                )
            ).find(existingCard =>
                normalizeVehicleText(existingCard.dataset.vehicleMake) ===
                    normalizeVehicleText(vehicle.make) &&
                normalizeVehicleText(existingCard.dataset.vehicleModel) ===
                    normalizeVehicleText(vehicle.model) &&
                normalizeVehicleText(existingCard.dataset.vehicleSourceKind) ===
                    normalizeVehicleText(detailKind)
            );

        if (
            card &&
            !hasRequiredVehicleCardQuality(
                details,
                vehicle,
                currentVehicleKind
            )
        ) {
            card.dataset.detailsReady = "true";
            card.dataset.qualityState = "invalid";
            card.dataset.recoveryLocked = "false";

            closeVehicleDetailsPanel();

            window.setTimeout(
                () =>
                    schedulePopularCardRecovery(
                        currentVehicleKind === VEHICLE_ALL_KIND
                            ? VEHICLE_ALL_KIND
                            : detailKind
                    ),
                0
            );

            return;
        }
    }

    const specificationValues =
        Object.values(
            details?.specifications || {}
        )
            .filter(value =>
                isUsefulVehicleDetailValue(value)
            );

    /*
     * The API performs the authoritative make/model/category validation.
     * The frontend quality gate is therefore only for deciding whether
     * there is enough content to render—not for hiding a server-validated
     * article because its title/summary wording is unusual.
     */
    const hasDisplayableData =
        Boolean(
            details?.success !== false &&
            (
                isUsefulVehicleDetailValue(
                    details?.wikipedia?.description
                ) ||
                specificationValues.length > 0 ||
                Boolean(
                    String(
                        details?.image?.url || ""
                    ).trim()
                ) ||
                (
                    isUsefulVehicleDetailValue(
                        details?.wikipedia?.title
                    ) &&
                    Boolean(
                        String(
                            details?.wikipedia?.url || ""
                        ).trim()
                    ) &&
                    !/^no information$/i.test(
                        String(
                            details?.wikipedia?.title || ""
                        ).trim()
                    )
                )
            )
        );

    if (!hasDisplayableData) {

        if (
            currentVehicleKind === VEHICLE_ALL_KIND &&
            currentVehicleMode === "popular"
        ) {
            const noInformationDetails = {
                ...details,
                wikipedia: {
                    ...(details.wikipedia || {}),
                    title:
                        details.wikipedia?.title ||
                        title,
                    description:
                        details.wikipedia?.description ||
                        "Couldn't find informations on wikipedia and online",
                    url:
                        details.wikipedia?.url ||
                        ""
                },
                specifications:
                    details.specifications || {},
                image:
                    hasPopularVehicleImageRelevance(details, vehicle)
                        ? details.image
                        : null,
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

        const noInformationDetails = {
            ...details,
            wikipedia: {
                ...(details.wikipedia || {}),
                title:
                    details.wikipedia?.title ||
                    title,
                description:
                    details.wikipedia?.description ||
                    "Couldn't find informations on wikipedia and online",
                url:
                    details.wikipedia?.url ||
                    ""
            },
            specifications:
                details.specifications || {},
            image:
                hasPopularVehicleImageRelevance(details, vehicle)
                    ? details.image
                    : null,
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
        safeDetails.comparisonAvailable !== false
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

    const catalogBodyType =
        apiVehicle?.body_type ||
        apiVehicle?.bodyType ||
        catalogVehicle?.body_type ||
        catalogVehicle?.bodyType ||
        "";

    const catalogYearStart =
        apiVehicle?.year_start ??
        apiVehicle?.yearStart ??
        catalogVehicle?.year_start ??
        catalogVehicle?.yearStart ??
        "";

    const catalogYearEnd =
        apiVehicle?.year_end ??
        apiVehicle?.yearEnd ??
        catalogVehicle?.year_end ??
        catalogVehicle?.yearEnd ??
        "";

    const catalogProduction =
        catalogYearStart && catalogYearEnd
            ? (
                String(catalogYearStart) === String(catalogYearEnd)
                    ? String(catalogYearStart)
                    : String(catalogYearStart) + "–" + String(catalogYearEnd)
            )
            : catalogYearStart
                ? String(catalogYearStart) + "–present"
                : catalogYearEnd
                    ? "through " + String(catalogYearEnd)
                    : "";

    const fallbackAboutParts = [
        isUsefulVehicleDetailValue(catalogBodyType)
            ? "Body type: " + String(catalogBodyType)
            : "",
        isUsefulVehicleDetailValue(catalogProduction)
            ? "Production: " + String(catalogProduction)
            : ""
    ].filter(Boolean);

    const aboutDescription =
        isUsefulVehicleDetailValue(wikipedia.description)
            ? String(wikipedia.description).trim()
            : fallbackAboutParts.length
                ? fallbackAboutParts.join(" • ")
                : "Couldn't find informations on wikipedia and online";

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

    const imageAttribution =
        details.image &&
        (
            details.image.author ||
            details.image.license ||
            details.image.source_url
        )
            ? `
                <div class="worth-it-vehicle-image-attribution">
                    <span>Image source:</span>
                    ${details.image.author
                        ? `<span>${escapeVehicleHtml(details.image.author)}</span>`
                        : ""}
                    ${details.image.license
                        ? (
                            details.image.license_url
                                ? `<a href="${escapeVehicleHtml(details.image.license_url)}" target="_blank" rel="noopener noreferrer">${escapeVehicleHtml(details.image.license)}</a>`
                                : `<span>${escapeVehicleHtml(details.image.license)}</span>`
                        )
                        : ""}
                    ${details.image.source_url
                        ? `<a href="${escapeVehicleHtml(details.image.source_url)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons ↗</a>`
                        : ""}
                </div>
            `
            : "";

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

    const fuelEconomy =
        details?.external?.fuelEconomy ||
        null;

    const fuelEconomyRows =
        fuelEconomy
            ? [
                fuelEconomy.fuelType
                    ? ["Fuel type", fuelEconomy.fuelType]
                    : null,
                fuelEconomy.cityMpg !== null &&
                fuelEconomy.cityMpg !== undefined
                    ? ["City", String(fuelEconomy.cityMpg) + " MPG"]
                    : null,
                fuelEconomy.highwayMpg !== null &&
                fuelEconomy.highwayMpg !== undefined
                    ? ["Highway", String(fuelEconomy.highwayMpg) + " MPG"]
                    : null,
                fuelEconomy.combinedMpg !== null &&
                fuelEconomy.combinedMpg !== undefined
                    ? ["Combined", String(fuelEconomy.combinedMpg) + " MPG"]
                    : null,
                fuelEconomy.annualFuelCost !== null &&
                fuelEconomy.annualFuelCost !== undefined
                    ? ["Annual fuel cost", "$" + Number(fuelEconomy.annualFuelCost).toLocaleString("en-US")]
                    : null,
                fuelEconomy.co2TailpipeGpm !== null &&
                fuelEconomy.co2TailpipeGpm !== undefined
                    ? ["Tailpipe CO₂", String(fuelEconomy.co2TailpipeGpm) + " g/mi"]
                    : null
            ]
                .filter(Boolean)
            : [];

    const externalHtml =
        fuelEconomyRows.length
            ? '<section class="worth-it-vehicle-detail-section">' +
                '<h3>EPA fuel economy</h3>' +
                '<div class="worth-it-vehicle-spec-grid">' +
                fuelEconomyRows.map(([label, value]) =>
                    '<div class="worth-it-vehicle-spec-item">' +
                    '<span>' + escapeVehicleHtml(label) + '</span>' +
                    '<strong>' + escapeVehicleHtml(String(value)) + '</strong>' +
                    '</div>'
                ).join("") +
                '</div>' +
                '<small style="opacity:0.7;">Source: FuelEconomy.gov / U.S. DOE + EPA</small>' +
                '</section>'
            : "";

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
                    ${fallbackAboutParts.length
                    ? escapeVehicleHtml(fallbackAboutParts.join(" • "))
                    : "Couldn't find informations on wikipedia and online"}
                </div>
            `;

    body.innerHTML = `
        <div class="worth-it-vehicle-detail-header">
            <div class="worth-it-vehicle-detail-image-wrap">
                ${imageHtml}
                ${imageAttribution}
            </div>

            <div class="worth-it-vehicle-detail-heading">
                <div class="worth-it-vehicle-detail-kind">
                    ${escapeVehicleHtml(info.singular)}
                </div>

                <div class="worth-it-vehicle-detail-title-row">
                    <h2 id="worthItVehicleModalTitle">
                        ${escapeVehicleHtml(
                            `${apiVehicle.make || ""} ${apiVehicle.model || ""}`.trim()
                        )}
                    </h2>
                    <button
                        type="button"
                        class="worth-it-vehicle-web-search-button"
                        data-vehicle-web-search
                        aria-label="Search this vehicle on the web"
                        title="Search the web for this vehicle"
                    >
                        🔎
                    </button>
                </div>

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
                    aboutDescription
                )}
            </p>
        </section>

        <section class="worth-it-vehicle-detail-section">
            <h3>Specifications</h3>
            ${specsHtml}
        </section>

        ${externalHtml}

        <div class="worth-it-vehicle-detail-verification">
    <span class="worth-it-vehicle-verified-badge">✓ Verified information</span>
    ${hasPopularVehicleImageRelevance(details, catalogVehicle) ? '<span class="worth-it-vehicle-verified-badge">✓ Verified reusable image</span>' : ""}
</div>

<div class="worth-it-vehicle-detail-actions">
    <button
        type="button"
        class="worth-it-vehicle-favorite-button"
        data-vehicle-detail-favorite
    >
        ${isVehicleFavorite(apiVehicle, kind) ? "♥ Remove from favorites" : "♡ Add to favorites"}
    </button>

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

    const webSearchButton = body.querySelector("[data-vehicle-web-search]");

    if (webSearchButton) {
        webSearchButton.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();

            const vehicleName = `${apiVehicle.make || ""} ${apiVehicle.model || ""}`.trim();

            if (!vehicleName) {
                return;
            }

            const searchQuery = vehicleName + " price and specifications";
            const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(searchQuery);

            window.open(searchUrl, "_blank", "noopener,noreferrer");
        });
    }

    const favoriteButton = body.querySelector("[data-vehicle-detail-favorite]");

    if (favoriteButton) {
        favoriteButton.addEventListener("click", () => {
            toggleVehicleFavorite(apiVehicle, kind);
            const favorite = isVehicleFavorite(apiVehicle, kind);
            favoriteButton.textContent = favorite ? "♥ Remove from favorites" : "♡ Add to favorites";
            favoriteButton.classList.toggle("is-favorite", favorite);
        });
    }

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


function scrollToVehicleCompareSection() {
    const panel =
        document.getElementById("carsComparePanel");

    if (!panel) return;

    const rect =
        panel.getBoundingClientRect();

    window.scrollTo({
        top: Math.max(
            0,
            window.scrollY + rect.top - 24
        ),
        behavior: "smooth"
    });
}

function scrollToCarsSectionTop() {
    const carsSection =
        document.getElementById("carsSection");

    if (!carsSection) return;

    const rect =
        carsSection.getBoundingClientRect();

    window.scrollTo({
        top: Math.max(
            0,
            window.scrollY + rect.top - 18
        ),
        behavior: "smooth"
    });
}

function bindVehicleCompareBackButton(panel) {
    if (!panel) return;

    panel.querySelectorAll(
        "[data-compare-go-back-up]"
    ).forEach(button => {
        button.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();
                scrollToCarsSectionTop();
            }
        );
    });
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

            <div class="cars-compare-navigation">
                <button
                    type="button"
                    class="cars-compare-back-up"
                    data-compare-go-back-up
                >
                    ↑ Go back up
                </button>
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

        bindVehicleCompareBackButton(panel);

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
                <button
                    type="button"
                    class="cars-compare-back-up"
                    data-compare-go-back-up
                >
                    ↑ Go back up
                </button>
            </div>
        </div>
    `;

    bindVehicleCompareBackButton(panel);

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
    const scale =
        Number(
            getComputedStyle(document.documentElement)
                .getPropertyValue("--ui-scale")
        ) || 1;
    const uiScale =
        document.documentElement.getAttribute("data-ui-scale") ||
        "normal";

    const gap =
        uiScale === "xl"
            ? 46
            : uiScale === "large"
                ? 42
                : uiScale === "normal"
                    ? 34
                    : 30;

    let left = (anchorRect.right + gap) / scale;
    const maxLeft =
        (window.innerWidth - buttonRect.width - gap) / scale;

    if (left > maxLeft) {
        left = maxLeft;
    }

    left = Math.max(8 / scale, left);

    button.style.setProperty(
        "left",
        left + "px",
        "important"
    );
    button.style.setProperty(
        "right",
        "auto",
        "important"
    );
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

        /*
         * Vehicle details must stay below the global header so the
         * navigation, Settings, menus and utility controls remain
         * clickable while the details panel is open.
         */
        #worthItVehicleDetailsModal {
            z-index: 1200;
        }

        #worthItVehicleDetailsModal .worth-it-vehicle-modal-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.72);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            user-select: none;
            -webkit-user-select: none;
        }

        .worth-it-vehicle-modal-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.72);
            user-select: none;
            -webkit-user-select: none;
        }

        .worth-it-vehicle-modal-dialog {
            position: relative;
            z-index: 1;
            width: min(960px, 100%);
            max-height: min(900px, calc(100vh - 48px));
            overflow: auto;
            user-select: text;
            -webkit-user-select: text;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 20px;
            background: #111318;
            color: #f5f7fa;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }

        .worth-it-vehicle-modal-navigation {
            position: absolute;
            top: 50%;
            z-index: 6;
            display: grid;
            place-items: center;
            width: 72px;
            height: 104px;
            padding: 0 0 8px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 18px;
            background: rgba(12, 14, 19, 0.82);
            color: #ffffff;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 64px;
            font-weight: 700;
            line-height: 1;
            cursor: pointer;
            transform: translateY(-50%);
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.32);
            backdrop-filter: blur(8px);
            transition:
                transform 0.15s ease,
                background 0.15s ease,
                border-color 0.15s ease;
        }

        .worth-it-vehicle-modal-navigation {
            flex-direction: column;
            gap: 5px;
        }

        .worth-it-vehicle-navigation-key {
            display: block;
            font-family: Inter, ui-sans-serif, system-ui, sans-serif;
            font-size: 16px;
            font-weight: 800;
            line-height: 1;
            letter-spacing: 0;
            opacity: 0.85;
        }

        .worth-it-vehicle-navigation-arrow {
            display: block;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 64px;
            font-weight: 700;
            line-height: 0.8;
        }

        .worth-it-vehicle-modal-navigation-previous {
            left: max(8px, calc(50% - 560px));
        }

        .worth-it-vehicle-modal-navigation-next {
            right: max(8px, calc(50% - 560px));
        }

        .worth-it-vehicle-modal-navigation:hover,
        .worth-it-vehicle-modal-navigation:focus-visible {
            background: rgba(124, 92, 255, 0.24);
            border-color: rgba(124, 92, 255, 0.62);
            outline: none;
            transform: translateY(-50%);
        }

        .worth-it-vehicle-modal-navigation[hidden] {
            display: none;
        }

        html[data-theme="light"] .worth-it-vehicle-modal-navigation {
            border-color: rgba(0, 0, 0, 0.12);
            background: rgba(255, 255, 255, 0.9);
            color: #16181d;
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.18);
        }

        .worth-it-vehicle-modal-close {
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 5;
            display: grid;
            place-items: center;
            width: 42px;
            height: 42px;
            padding: 0 0 2px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
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
            user-select: text;
            -webkit-user-select: text;
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

        .worth-it-vehicle-detail-title-row {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        .worth-it-vehicle-detail-title-row h2 {
            min-width: 0;
            overflow-wrap: anywhere;
        }

        .worth-it-vehicle-web-search-button {
            flex: 0 0 auto;
            width: 42px;
            height: 42px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 11px;
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
            font-size: 1.1rem;
            line-height: 1;
            cursor: pointer;
            transition:
                background 0.2s ease,
                border-color 0.2s ease,
                transform 0.2s ease,
                box-shadow 0.2s ease;
        }

        .worth-it-vehicle-web-search-button:hover {
            background: rgba(255, 255, 255, 0.14);
            border-color: rgba(139, 92, 246, 0.75);
            box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.18);
            transform: scale(1.04);
        }

        .worth-it-vehicle-web-search-button:focus-visible {
            outline: 2px solid rgba(139, 92, 246, 0.9);
            outline-offset: 2px;
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

        .cars-compare-jump-button,
        .cars-compare-back-up {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-height: 38px;
            padding: 8px 12px;
            border: 1px solid rgba(124, 92, 255, 0.35);
            border-radius: 10px;
            background: rgba(124, 92, 255, 0.10);
            color: inherit;
            font-size: 0.82rem;
            font-weight: 800;
            cursor: pointer;
            transition:
                background 0.16s ease,
                border-color 0.16s ease,
                transform 0.16s ease;
        }

        .cars-compare-jump-button:hover,
        .cars-compare-jump-button:focus-visible,
        .cars-compare-back-up:hover,
        .cars-compare-back-up:focus-visible {
            background: rgba(124, 92, 255, 0.18);
            border-color: rgba(124, 92, 255, 0.58);
            outline: none;
            transform: translateY(-1px);
        }

        .cars-compare-navigation {
            display: flex;
            justify-content: center;
            margin-top: 16px;
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
            z-index:10050 !important;

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
            transform: translateY(-50%) scale(1.018) !important;
            transform-origin: 50% 50% !important;
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

            .worth-it-vehicle-modal-navigation {
                width: 58px;
                height: 88px;
                font-size: 50px;
            }

            .worth-it-vehicle-navigation-key {
                font-size: 13px;
            }

            .worth-it-vehicle-navigation-arrow {
                font-size: 50px;
            }

            .worth-it-vehicle-modal-navigation-previous {
                left: 4px;
            }

            .worth-it-vehicle-modal-navigation-next {
                right: 4px;
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

            .worth-it-vehicle-detail-title-row {
                align-items: flex-start;
            }

            .worth-it-vehicle-detail-title-row h2 {
                font-size: clamp(1.55rem, 7vw, 2.1rem);
            }

            .worth-it-vehicle-web-search-button {
                width: 40px;
                height: 40px;
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


function renderPopularRefreshControls(header, kind) {
    if (!header) return;

    const actions = ensureCarsResultsHeaderActions(header);
    if (!actions) return;

    const compareButton = document.createElement("button");
    compareButton.type = "button";
    compareButton.className = "cars-compare-jump-button";
    compareButton.setAttribute("aria-label", "Go to car comparison");
    compareButton.title = "Go down to Compare Cars";
    compareButton.textContent = "⚖️ Compare Cars ↓";
    actions.appendChild(compareButton);

    compareButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        scrollToVehicleCompareSection();
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
        renderPopularRefreshControls(header, kind);
        description.classList.remove("cars-results-description-with-info");
        description.innerHTML =
            '<span class="cars-results-description-text">' +
            escapeVehicleHtml(
                "Search all vehicle types from the connected VehiclesDB catalog."
            ) +
            '</span>';
        updateCarsLastUpdated(kind);
        return;
    }

    title.textContent =
        kind === VEHICLE_ALL_KIND
            ? "🚗 All Vehicles"
            : info.title;
    renderPopularRefreshControls(header, kind);

    description.classList.add("cars-results-description-with-info");
    description.innerHTML =
        '<span class="cars-results-description-text">' +
        escapeVehicleHtml(
            kind === VEHICLE_ALL_KIND
                ? "Up to 2,000 verified cars, motorcycles, vans, trucks and buses from the connected VehiclesDB dataset."
                : info.description
        ) +
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

    updateCarsLastUpdated(kind);

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
 * ACCOUNT CLOUD VEHICLE CACHE
 *
 * D1 is the authoritative cross-device cache for authenticated
 * users. Browser Cache Storage remains the fast local layer.
 * ============================================================
 */

const VEHICLE_ACCOUNT_CLOUD_CACHE_MAX =
    MAX_UNIFIED_VEHICLES;

const VEHICLE_ACCOUNT_CLOUD_CACHE_PAGE_SIZE =
    250;

const VEHICLE_ACCOUNT_CLOUD_CACHE_BATCH_SIZE =
    100;

let vehicleAccountCloudSyncPromise =
    Promise.resolve();

/*
 * Supabase can automatically refresh a session while several vehicle
 * warmup tasks are starting at the same time. Never start more than one
 * refresh request concurrently: doing so can invalidate the previous
 * refresh token and produce a 429/401 cascade.
 */
let vehicleAccountSessionRefreshPromise = null;

async function refreshVehicleAccountSession() {
    if (!window.supabaseClient?.auth) {
        return null;
    }

    if (vehicleAccountSessionRefreshPromise) {
        return vehicleAccountSessionRefreshPromise;
    }

    vehicleAccountSessionRefreshPromise =
        (async () => {
            try {
                const refreshed =
                    await window.supabaseClient.auth.refreshSession();

                return String(
                    refreshed?.data?.session?.access_token || ""
                ).trim() || null;
            } catch {
                return null;
            } finally {
                vehicleAccountSessionRefreshPromise = null;
            }
        })();

    return vehicleAccountSessionRefreshPromise;
}

async function getVehicleAccountAccessToken(
    forceRefresh = false
) {
    try {
        if (!window.supabaseClient?.auth) {
            return null;
        }

        if (forceRefresh) {
            return await refreshVehicleAccountSession();
        }

        const { data } =
            await window.supabaseClient.auth.getSession();

        const token =
            String(
                data?.session?.access_token || ""
            ).trim();

        if (token) {
            return token;
        }

        return await refreshVehicleAccountSession();

    } catch {
        return null;
    }
}

async function readCloudVehicleAccountCache(
    datasetVersion
) {

    const accessToken =
        await getVehicleAccountAccessToken();

    if (!accessToken || !datasetVersion) {
        return [];
    }

    const results = [];
    let offset = 0;

    try {

        while (
            results.length <
            VEHICLE_ACCOUNT_CLOUD_CACHE_MAX
        ) {

            const limit =
                Math.min(
                    VEHICLE_ACCOUNT_CLOUD_CACHE_PAGE_SIZE,
                    VEHICLE_ACCOUNT_CLOUD_CACHE_MAX -
                        results.length
                );

            const response =
                await fetch(
                    VEHICLE_API +
                    "?action=account-cache-get" +
                    "&dataset_version=" +
                    encodeURIComponent(datasetVersion) +
                    "&offset=" +
                    offset +
                    "&limit=" +
                    limit,
                    {
                        method: "GET",
                        headers: {
                            "Accept":
                                "application/json",
                            "Authorization":
                                "Bearer " + accessToken,
                            "X-Supabase-Access-Token":
                                accessToken
                        },
                        cache: "no-store"
                    }
                );

            if (response.status === 401) {
                const refreshedToken =
                    await getVehicleAccountAccessToken(true);

                if (!refreshedToken) {
                    return [];
                }

                const retryResponse =
                    await fetch(
                        VEHICLE_API +
                        "?action=account-cache-get" +
                        "&dataset_version=" +
                        encodeURIComponent(datasetVersion) +
                        "&offset=" +
                        offset +
                        "&limit=" +
                        limit,
                        {
                            method: "GET",
                            headers: {
                                "Accept":
                                    "application/json",
                                "Authorization":
                                    "Bearer " + refreshedToken,
                                "X-Supabase-Access-Token":
                                    refreshedToken
                            },
                            cache: "no-store"
                        }
                    );

                if (!retryResponse.ok) {
                    return [];
                }

                const payload =
                    await retryResponse.json();

                if (
                    !payload?.success ||
                    payload.datasetVersion !==
                        datasetVersion ||
                    !Array.isArray(
                        payload.vehicles
                    )
                ) {
                    return [];
                }

                results.push(
                    ...payload.vehicles
                );

                if (
                    !payload.hasMore ||
                    payload.vehicles.length < limit
                ) {
                    break;
                }

                offset += payload.vehicles.length;
                continue;
            }

            if (!response.ok) {
                return [];
            }

            const payload =
                await response.json();

            if (
                !payload?.success ||
                payload.datasetVersion !==
                    datasetVersion ||
                !Array.isArray(
                    payload.vehicles
                )
            ) {
                return [];
            }

            results.push(
                ...payload.vehicles
            );

            if (
                !payload.hasMore ||
                payload.vehicles.length < limit
            ) {
                break;
            }

            offset +=
                payload.vehicles.length;

        }

        return results.slice(
            0,
            VEHICLE_ACCOUNT_CLOUD_CACHE_MAX
        );

    } catch (error) {

        console.warn(
            "Cloud vehicle account cache read skipped:",
            error
        );

        return [];

    }
}

function queueCloudVehicleAccountCacheUpsert(
    datasetVersion,
    records
) {

    if (
        !datasetVersion ||
        !Array.isArray(records) ||
        !records.length
    ) {
        return vehicleAccountCloudSyncPromise;
    }

    const batches = [];

    for (
        let index = 0;
        index < records.length;
        index += VEHICLE_ACCOUNT_CLOUD_CACHE_BATCH_SIZE
    ) {
        batches.push(
            records.slice(
                index,
                index +
                    VEHICLE_ACCOUNT_CLOUD_CACHE_BATCH_SIZE
            )
        );
    }

    vehicleAccountCloudSyncPromise =
        vehicleAccountCloudSyncPromise
            .catch(() => {})
            .then(async () => {

                const accessToken =
                    await getVehicleAccountAccessToken();

                if (!accessToken) {
                    return;
                }

                for (const batch of batches) {

                    let response =
                        await fetch(
                            VEHICLE_API +
                            "?action=account-cache-upsert",
                            {
                                method: "POST",
                                headers: {
                                    "Accept":
                                        "application/json",
                                    "Content-Type":
                                        "application/json",
                                    "Authorization":
                                        "Bearer " + accessToken,
                                    "X-Supabase-Access-Token":
                                        accessToken
                                },
                                body:
                                    JSON.stringify({
                                        datasetVersion,
                                        records: batch
                                    })
                            }
                        );

                    if (response.status === 401) {
                        const refreshedToken =
                            await getVehicleAccountAccessToken(true);

                        if (!refreshedToken) {
                            return;
                        }

                        response =
                            await fetch(
                                VEHICLE_API +
                                "?action=account-cache-upsert",
                                {
                                    method: "POST",
                                    headers: {
                                        "Accept":
                                            "application/json",
                                        "Content-Type":
                                            "application/json",
                                        "Authorization":
                                            "Bearer " + refreshedToken,
                                        "X-Supabase-Access-Token":
                                            refreshedToken
                                    },
                                    body:
                                        JSON.stringify({
                                            datasetVersion,
                                            records: batch
                                        })
                                }
                            );
                    }

                    if (!response.ok) {
                        return;
                    }

                }

            })
            .catch(error => {

                console.warn(
                    "Cloud vehicle account cache upsert skipped:",
                    error
                );

            });

    return vehicleAccountCloudSyncPromise;
}

async function finalizeCloudVehicleAccountCache(
    datasetVersion
) {

    if (!datasetVersion) {
        return;
    }

    await vehicleAccountCloudSyncPromise;

    const accessToken =
        await getVehicleAccountAccessToken();

    if (!accessToken) {
        return;
    }

    try {

        let response =
            await fetch(
                VEHICLE_API +
                "?action=account-cache-finalize",
                {
                    method: "POST",
                    headers: {
                        "Accept":
                            "application/json",
                        "Content-Type":
                            "application/json",
                        "Authorization":
                            "Bearer " + accessToken,
                        "X-Supabase-Access-Token":
                            accessToken
                    },
                    body:
                        JSON.stringify({
                            datasetVersion
                        })
                }
            );

        if (response.status === 401) {
            const refreshedToken =
                await getVehicleAccountAccessToken(true);

            if (!refreshedToken) {
                return;
            }

            response =
                await fetch(
                    VEHICLE_API +
                    "?action=account-cache-finalize",
                    {
                        method: "POST",
                        headers: {
                            "Accept":
                                "application/json",
                            "Content-Type":
                                "application/json",
                            "Authorization":
                                "Bearer " + refreshedToken,
                            "X-Supabase-Access-Token":
                                refreshedToken
                        },
                        body:
                            JSON.stringify({
                                datasetVersion
                            })
                    }
                );
        }

        if (!response.ok) {
            return;
        }

    } catch (error) {

        console.warn(
            "Cloud vehicle account cache finalize skipped:",
            error
        );

    }
}

async function restoreCloudPopularVehicleSnapshot(
    candidates,
    datasetVersion
) {

    if (
        !Array.isArray(candidates) ||
        !candidates.length ||
        !datasetVersion
    ) {
        return [];
    }

    const records =
        await readCloudVehicleAccountCache(
            datasetVersion
        );

    if (!records.length) {
        return [];
    }

    const candidateMap =
        new Map(
            candidates.map(
                vehicle => [
                    getPopularVehicleQualityKey(
                        vehicle,
                        VEHICLE_ALL_KIND
                    ),
                    vehicle
                ]
            )
        );

    const restored =
        new Set();

    for (
        const record of
        records.sort(
            (a, b) =>
                Number(a?.rankIndex || 0) -
                Number(b?.rankIndex || 0)
        )
    ) {

        const key =
            getPopularVehicleQualityKey(
                record?.vehicle,
                VEHICLE_ALL_KIND
            );

        const candidate =
            candidateMap.get(key);

        if (
            !candidate ||
            restored.has(key)
        ) {
            continue;
        }

        const details =
            record?.details;

        if (
            !hasRequiredVehicleCardQuality(
                details,
                candidate,
                VEHICLE_ALL_KIND
            )
        ) {
            continue;
        }

        vehicleDetailsCache.set(
            getVehicleDetailsCacheKey(
                candidate.make,
                candidate.model,
                candidate.sourceKind ||
                    candidate.kind ||
                    "car",
                "full"
            ),
            details
        );

        popularVehicleQualityCache.set(
            key,
            true
        );

        restored.add(key);
    }

    return candidates.filter(
        vehicle =>
            restored.has(
                getPopularVehicleQualityKey(
                    vehicle,
                    VEHICLE_ALL_KIND
                )
            )
    );
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
        kind === VEHICLE_ALL_KIND
            ? currentVehicleCatalog
            : vehicleCatalogCache.get(kind) || [];

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
    excludeKind = null,
    warmDetails = false
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
 
            /*
             * Do not warm Wikipedia details for other categories while
             * Cars is loading. Catalog prefetch stays lightweight; each
             * category owns its own quality/image workload when opened.
             */
            if (!warmDetails) {
                return;
            }

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
        document.querySelector("#carsSection .cars-category-grid");

    if (categoryGrid) {
        categoryGrid.remove();
    }
}


/*
 * ============================================================
 * LOAD + SHOW CATEGORY
 * ============================================================
 */

async function filterCarsByCategory() {
    await openCars();
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
 * BACKGROUND VEHICLE WARMUP
 *
 * Prepare the unified catalog and account-scoped full details while
 * the user is elsewhere on the site. Cached details are reused later.
 * ============================================================
 */

const UNIFIED_BACKGROUND_WARMUP_BATCH_SIZE = 24;
/*
 * Scan beyond the public 2000-card limit so failed/missing records can
 * be replaced by the next valid popular vehicle.
 */
const UNIFIED_BACKGROUND_WARMUP_MAX_PER_SESSION =
    Math.max(
        MAX_UNIFIED_VEHICLES * 3,
        6000
    );

let unifiedVehicleBackgroundWarmupPromise = null;
let unifiedVehicleBackgroundWarmupActive = false;
let unifiedVehicleBackgroundWarmupRestartRequested = false;
let unifiedVehicleBackgroundWarmupAuthUserId = null;

function buildUnifiedBackgroundWarmupCandidates(
    catalog
) {

    const sourceCatalog =
        Array.isArray(catalog)
            ? catalog
            : [];

    const buckets =
        VEHICLE_KINDS.reduce(
            (map, sourceKind) => {
                map.set(
                    sourceKind,
                    sourceCatalog.filter(
                        vehicle =>
                            (
                                vehicle?.sourceKind ||
                                vehicle?.kind
                            ) === sourceKind &&
                            vehicle?.make &&
                            vehicle?.model
                    )
                );
                return map;
            },
            new Map()
        );

    const weights = {
        car: 4,
        motorcycle: 1,
        van: 1,
        truck: 1,
        bus: 1
    };

    const result = [];
    const seen = new Set();

    while (
        result.length <
            UNIFIED_BACKGROUND_WARMUP_MAX_PER_SESSION
    ) {

        let addedThisRound = false;

        for (const sourceKind of VEHICLE_KINDS) {

            const bucket =
                buckets.get(sourceKind) || [];

            const takeCount =
                weights[sourceKind] || 1;

            for (
                let index = 0;
                index < takeCount;
                index += 1
            ) {

                const vehicle =
                    bucket.shift();

                if (!vehicle) {
                    continue;
                }

                const key =
                    getPopularVehicleQualityKey(
                        vehicle,
                        VEHICLE_ALL_KIND
                    );

                if (seen.has(key)) {
                    continue;
                }

                seen.add(key);
                result.push(vehicle);
                addedThisRound = true;

                if (
                    result.length >=
                    UNIFIED_BACKGROUND_WARMUP_MAX_PER_SESSION
                ) {
                    break;
                }
            }

            if (
                result.length >=
                UNIFIED_BACKGROUND_WARMUP_MAX_PER_SESSION
            ) {
                break;
            }
        }

        if (!addedThisRound) {
            break;
        }
    }

    return result;
}

function getUnifiedBackgroundWarmupPause() {
    return new Promise(resolve => {
        if (
            typeof window.requestIdleCallback ===
            "function"
        ) {
            window.requestIdleCallback(
                () => resolve(),
                { timeout: 1200 }
            );
            return;
        }

        window.setTimeout(
            resolve,
            Math.min(
                UNIFIED_BACKGROUND_WARMUP_DELAY_MS,
                250
            )
        );
    });
}

function canRunUnifiedVehicleBackgroundWarmup() {
    const section =
        document.getElementById("carsSection");

    if (
        !section ||
        section.hidden ||
        document.visibilityState === "hidden"
    ) {
        return false;
    }

    const style = window.getComputedStyle(section);

    return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        section.getClientRects().length > 0
    );
}

async function startUnifiedVehicleBackgroundWarmup() {

    /*
     * Do not run thousands of background detail checks while Cars is
     * hidden or the browser tab is in the background. The next visit
     * can resume from the validated browser/account caches.
     */
    if (!canRunUnifiedVehicleBackgroundWarmup()) {
        return Promise.resolve();
    }

    /*
     * Auth events can arrive while a warmup is still running. Never
     * start a second full catalogue scan until the active run has
     * finished; SIGNED_IN can request one queued run if the account
     * genuinely changed while the current scan was anonymous.
     */
    if (unifiedVehicleBackgroundWarmupActive) {
        return unifiedVehicleBackgroundWarmupPromise ||
            Promise.resolve();
    }

    if (unifiedVehicleBackgroundWarmupPromise) {
        return unifiedVehicleBackgroundWarmupPromise;
    }

    unifiedVehicleBackgroundWarmupActive = true;

    let pausedForVisibility = false;

    unifiedVehicleBackgroundWarmupPromise =
        (async () => {

            try {

                await fetchVehicleDatasetMetadata();

                /*
                 * Start from the account-scoped persistent catalog whenever
                 * one already exists. This lets detail/image warmup continue
                 * immediately on returning visits instead of waiting for a
                 * fresh VehiclesDB download. A fresh dataset check runs in
                 * parallel and replaces the catalog later when available.
                 */
                const savedCatalog =
                    await readPersistentVehicleCatalog(
                        VEHICLE_ALL_KIND
                    );

                const freshCatalogPromise =
                    buildFreshUnifiedVehicleCatalog()
                        .catch(error => {
                            console.warn(
                                "Background fresh unified catalog refresh failed:",
                                error
                            );
                            return [];
                        });

                let warmupCatalog =
                    Array.isArray(savedCatalog) &&
                    savedCatalog.length
                        ? savedCatalog.slice(
                            0,
                            Math.max(
                                UNIFIED_BACKGROUND_CANDIDATE_POOL_LIMIT,
                                MAX_UNIFIED_VEHICLES
                            )
                        )
                        : null;

                if (!warmupCatalog?.length) {
                    warmupCatalog =
                        await freshCatalogPromise;
                }

                if (!warmupCatalog?.length) {
                    return;
                }

                vehicleCatalogCache.set(
                    VEHICLE_ALL_KIND,
                    warmupCatalog
                );

                void writePersistentVehicleCatalog(
                    VEHICLE_ALL_KIND,
                    warmupCatalog
                );

                /*
                 * The current dataset check continues independently. It is
                 * used for the account snapshot and monthly model rotation.
                 */
                const candidates =
                    buildUnifiedBackgroundWarmupCandidates(
                        warmupCatalog
                    );

                if (!candidates.length) {
                    return;
                }

                const storedPayload =
                    await readPersistentPopularVehicles(
                        VEHICLE_ALL_KIND
                    );

                const storedVersion =
                    storedPayload?.datasetVersion ||
                    null;

                const localReusableStoredVehicles =
                    storedVersion &&
                    vehicleDetailsDatasetVersion &&
                    storedVersion ===
                        vehicleDetailsDatasetVersion
                        ? (
                            Array.isArray(
                                storedPayload?.vehicles
                            )
                                ? storedPayload.vehicles
                                : []
                        )
                        : [];

                const freshCatalog =
                    await freshCatalogPromise;

                if (freshCatalog.length) {
                    vehicleCatalogCache.set(
                        VEHICLE_ALL_KIND,
                        freshCatalog
                    );

                    void writePersistentVehicleCatalog(
                        VEHICLE_ALL_KIND,
                        freshCatalog
                    );
                }

                /*
                 * Restore the authenticated cloud snapshot first. This is
                 * the cross-device source and already contains the full
                 * validated details response.
                 */
                const cloudReusableStoredVehicles =
                    await restoreCloudPopularVehicleSnapshot(
                        candidates,
                        vehicleDetailsDatasetVersion
                    );

                const reusableStoredKeys =
                    new Set();

                const cloudReusableStoredKeys =
                    new Set(
                        cloudReusableStoredVehicles.map(
                            vehicle =>
                                getPopularVehicleQualityKey(
                                    vehicle,
                                    VEHICLE_ALL_KIND
                                )
                        )
                    );

                const localMigrationRecords =
                    [];

                const candidateOrder =
                    new Map(
                        candidates.map(
                            (vehicle, index) => [
                                getPopularVehicleQualityKey(
                                    vehicle,
                                    VEHICLE_ALL_KIND
                                ),
                                index
                            ]
                        )
                    );

                const reusableStoredVehicles =
                    [];

                for (
                    const vehicle
                    of cloudReusableStoredVehicles
                ) {

                    const key =
                        getPopularVehicleQualityKey(
                            vehicle,
                            VEHICLE_ALL_KIND
                        );

                    if (
                        !reusableStoredKeys.has(key)
                    ) {
                        reusableStoredKeys.add(key);
                        reusableStoredVehicles.push(
                            vehicle
                        );
                    }

                }

                /*
                 * Local browser cache remains a fallback for records that
                 * have not reached the cloud yet.
                 */
                const localCandidateMap =
                    new Map(
                        candidates.map(
                            vehicle => [
                                getPopularVehicleQualityKey(
                                    vehicle,
                                    VEHICLE_ALL_KIND
                                ),
                                vehicle
                            ]
                        )
                    );

                const persistentOwner =
                    await getVehicleAccountCacheOwner();

                for (
                    const storedVehicle
                    of localReusableStoredVehicles
                ) {

                    const candidate =
                        localCandidateMap.get(
                            getPopularVehicleQualityKey(
                                storedVehicle,
                                VEHICLE_ALL_KIND
                            )
                        );

                    if (!candidate) {
                        continue;
                    }

                    const key =
                        getPopularVehicleQualityKey(
                            candidate,
                            VEHICLE_ALL_KIND
                        );

                    if (
                        reusableStoredKeys.has(key)
                    ) {
                        continue;
                    }

                    const persistentDetails =
                        await readPersistentVehicleDetails(
                            persistentOwner,
                            candidate.make,
                            candidate.model,
                            candidate.sourceKind ||
                                candidate.kind ||
                                "car"
                        );

                    if (
                        persistentDetails &&
                        hasRequiredVehicleCardQuality(
                            persistentDetails,
                            candidate,
                            VEHICLE_ALL_KIND
                        )
                    ) {

                        vehicleDetailsCache.set(
                            getVehicleDetailsCacheKey(
                                candidate.make,
                                candidate.model,
                                candidate.sourceKind ||
                                    candidate.kind ||
                                    "car",
                                "full"
                            ),
                            persistentDetails
                        );

                        reusableStoredKeys.add(key);
                        reusableStoredVehicles.push(
                            candidate
                        );

                        if (
                            !cloudReusableStoredKeys.has(key)
                        ) {
                            localMigrationRecords.push({
                                rankIndex:
                                    candidateOrder.get(key) ??
                                    Number.MAX_SAFE_INTEGER,
                                vehicle:
                                    candidate,
                                details:
                                    persistentDetails
                            });
                        }

                    }

                }

                const candidateKeys =
                    new Set(
                        candidates.map(
                            vehicle =>
                                getPopularVehicleQualityKey(
                                    vehicle,
                                    VEHICLE_ALL_KIND
                                )
                        )
                    );

                if (localMigrationRecords.length) {
                    queueCloudVehicleAccountCacheUpsert(
                        vehicleDetailsDatasetVersion,
                        localMigrationRecords
                    );
                }

                const validKeys =
                    new Set();

                let validVehicles =
                    [];

                for (
                    const vehicle
                    of reusableStoredVehicles
                ) {

                    const key =
                        getPopularVehicleQualityKey(
                            vehicle,
                            VEHICLE_ALL_KIND
                        );

                    if (
                        candidateKeys.has(key) &&
                        !validKeys.has(key)
                    ) {
                        validKeys.add(key);
                        validVehicles.push(vehicle);
                        popularVehicleQualityCache.set(
                            key,
                            true
                        );

                        sortAndTrimUnifiedCatalog();
                    }
                }

                /*
                 * Keep the same balanced order used by the public
                 * Popular/All Vehicles selector.
                 */
                validVehicles.sort(
                    (a, b) =>
                        (
                            candidateOrder.get(
                                getPopularVehicleQualityKey(
                                    a,
                                    VEHICLE_ALL_KIND
                                )
                            ) ??
                            Number.MAX_SAFE_INTEGER
                        ) -
                        (
                            candidateOrder.get(
                                getPopularVehicleQualityKey(
                                    b,
                                    VEHICLE_ALL_KIND
                                )
                            ) ??
                            Number.MAX_SAFE_INTEGER
                        )
                );

                if (validVehicles.length) {
                    void writePersistentPopularVehicles(
                        VEHICLE_ALL_KIND,
                        validVehicles
                    );
                }

                /*
                 * Share the background scanner with the public Popular/All
                 * Vehicles state. This means Show all can immediately use
                 * vehicles that were already validated while the user was
                 * elsewhere on the site instead of starting another scan.
                 */
                const warmupQualityState =
                    getPopularVehicleQualityState(
                        VEHICLE_ALL_KIND,
                        candidates
                    );

                /*
                 * Keep only the most popular validated vehicles.
                 *
                 * Existing cached vehicles remain eligible, but when a
                 * newly verified candidate is more popular than the least
                 * popular vehicle currently in the 1000-item catalog, the
                 * least popular entry is replaced. Because candidates are
                 * ordered by the current VehiclesDB popularity order, the
                 * catalog can evolve on every dataset refresh instead of
                 * permanently freezing its original 1000 entries.
                 */
                function sortAndTrimUnifiedCatalog() {
                    validVehicles.sort(
                        (a, b) =>
                            (
                                candidateOrder.get(
                                    getPopularVehicleQualityKey(
                                        a,
                                        VEHICLE_ALL_KIND
                                    )
                                ) ??
                                Number.MAX_SAFE_INTEGER
                            ) -
                            (
                                candidateOrder.get(
                                    getPopularVehicleQualityKey(
                                        b,
                                        VEHICLE_ALL_KIND
                                    )
                                ) ??
                                Number.MAX_SAFE_INTEGER
                            )
                    );

                    if (
                        validVehicles.length >
                        MAX_UNIFIED_VEHICLES
                    ) {
                        const removed =
                            validVehicles.splice(
                                MAX_UNIFIED_VEHICLES
                            );

                        removed.forEach(vehicle => {
                            const removedKey =
                                getPopularVehicleQualityKey(
                                    vehicle,
                                    VEHICLE_ALL_KIND
                                );

                            validKeys.delete(removedKey);
                        });
                    }
                }

                warmupQualityState.validVehicles =
                    validVehicles.slice();

                updateCarsCatalogCount(
                    validVehicles.length
                );

                warmupQualityState.checkedCount = 0;

                warmupQualityState.nextIndex = 0;

                warmupQualityState.exhausted = false;

                let nextIndex = 0;

                while (
                    nextIndex <
                        candidates.length
                ) {

                    if (!canRunUnifiedVehicleBackgroundWarmup()) {
                        pausedForVisibility = true;
                        return;
                    }

                    const batch = [];

                    while (
                        nextIndex <
                            candidates.length &&
                        batch.length <
                            UNIFIED_BACKGROUND_WARMUP_BATCH_SIZE
                    ) {

                        const vehicle =
                            candidates[nextIndex++];

                        const key =
                            getPopularVehicleQualityKey(
                                vehicle,
                                VEHICLE_ALL_KIND
                            );

                        if (validKeys.has(key)) {
                            continue;
                        }

                        batch.push(vehicle);
                    }

                    if (!batch.length) {
                        continue;
                    }

                    /*
                     * Keep the shared quality state in lock-step with the
                     * background scanner so the active All Vehicles view
                     * can consume results as soon as they are validated.
                     */
                    warmupQualityState.nextIndex =
                        nextIndex;

                    warmupQualityState.checkedCount =
                        nextIndex;

                    const results =
                        await runPopularVehicleQualityBatch(
                            batch,
                            VEHICLE_ALL_KIND
                        );

                    let added = false;
                    let cloudRecords = [];

                    for (const result of results) {

                        if (
                            result?.usable !== true
                        ) {
                            continue;
                        }

                        const vehicle =
                            result.vehicle;

                        const key =
                            getPopularVehicleQualityKey(
                                vehicle,
                                VEHICLE_ALL_KIND
                            );

                        if (validKeys.has(key)) {
                            continue;
                        }

                        validKeys.add(key);
                        validVehicles.push(vehicle);
                        popularVehicleQualityCache.set(
                            key,
                            true
                        );

                        if (
                            result?.details &&
                            result?.usable === true
                        ) {

                            cloudRecords.push({
                                rankIndex:
                                    candidateOrder.get(key) ??
                                    Number.MAX_SAFE_INTEGER,
                                vehicle,
                                details:
                                    result.details
                            });

                        }

                        const cachedDetails =
                            vehicleDetailsCache.get(
                                getVehicleDetailsCacheKey(
                                    vehicle.make,
                                    vehicle.model,
                                    vehicle.sourceKind ||
                                        vehicle.kind ||
                                        "car",
                                    "full"
                                )
                            );

                        if (
                            cachedDetails?.image?.url
                        ) {
                            void cacheVehicleImageResponse(
                                cachedDetails.image.url
                            );
                        }

                        added = true;
                    }

                    if (added) {

                        sortAndTrimUnifiedCatalog();

                        /*
                         * Only sync vehicles that survived the current Top 1000
                         * trim. This keeps rejected/replaced candidates out of
                         * D1 and prevents the background scanner from turning
                         * thousands of checked candidates into database writes.
                         */
                        cloudRecords =
                            cloudRecords.filter(record =>
                                validKeys.has(
                                    getPopularVehicleQualityKey(
                                        record.vehicle,
                                        VEHICLE_ALL_KIND
                                    )
                                )
                            );

                        if (cloudRecords.length) {
                            queueCloudVehicleAccountCacheUpsert(
                                vehicleDetailsDatasetVersion,
                                cloudRecords
                            );
                        }

                        /*
                         * Persist after every successful batch. If the
                         * browser is closed midway, the next visit resumes
                         * from the already verified vehicles instead of
                         * starting over.
                         */
                        await writePersistentPopularVehicles(
                            VEHICLE_ALL_KIND,
                            validVehicles
                        );

                    }

                    /*
                     * Publish the newly validated vehicles to the same
                     * in-memory quality state used by Show all. Never add
                     * anything to the DOM unless the Cars section is open
                     * and Show all is active.
                     */
                    warmupQualityState.validVehicles =
                        validVehicles.slice();

                    updateCarsCatalogCount(
                        validVehicles.length
                    );

                    warmupQualityState.nextIndex =
                        nextIndex;

                    warmupQualityState.checkedCount =
                        nextIndex;

                    if (
                        currentVehicleKind === VEHICLE_ALL_KIND &&
                        currentVehicleMode === "popular"
                    ) {
                        const displayState =
                            getStablePopularDisplayState(
                                VEHICLE_ALL_KIND
                            );

                        if (
                            displayState?.showAll &&
                            added
                        ) {
                            const grid =
                                document.getElementById(
                                    "popularCarsGrid"
                                );

                            if (
                                grid &&
                                !grid.querySelector(
                                    '.car-card[data-popular-stable-card="true"]'
                                )
                            ) {
                                grid.innerHTML = "";
                            }

                            appendStablePopularVehicleCards(
                                VEHICLE_ALL_KIND,
                                validVehicles,
                                true
                            );

                            currentVehicleResults =
                                validVehicles.slice();
                        }
                    }

                    await getUnifiedBackgroundWarmupPause();

                }

                /*
                 * Keep a final 2000-item account-scoped quality snapshot.
                 */
                validVehicles.sort(
                    (a, b) =>
                        (
                            candidateOrder.get(
                                getPopularVehicleQualityKey(
                                    a,
                                    VEHICLE_ALL_KIND
                                )
                            ) ??
                            Number.MAX_SAFE_INTEGER
                        ) -
                        (
                            candidateOrder.get(
                                getPopularVehicleQualityKey(
                                    b,
                                    VEHICLE_ALL_KIND
                                )
                            ) ??
                            Number.MAX_SAFE_INTEGER
                        )
                );

                sortAndTrimUnifiedCatalog();

                validVehicles =
                    validVehicles.slice(
                        0,
                        MAX_UNIFIED_VEHICLES
                    );

                warmupQualityState.validVehicles =
                    validVehicles.slice();

                updateCarsCatalogCount(
                    validVehicles.length
                );

                warmupQualityState.nextIndex =
                    nextIndex;

                warmupQualityState.checkedCount =
                    nextIndex;

                warmupQualityState.exhausted =
                    nextIndex >= candidates.length ||
                    validVehicles.length >= MAX_UNIFIED_VEHICLES;

                const finalValidVehicles =
                    validVehicles.slice(
                        0,
                        MAX_UNIFIED_VEHICLES
                    );

                if (finalValidVehicles.length) {
                    await writePersistentPopularVehicles(
                        VEHICLE_ALL_KIND,
                        finalValidVehicles
                    );
                }

                /*
                 * Finalize the authenticated cloud snapshot only after
                 * the current dataset has been scanned or 2000 valid
                 * vehicles have been collected. Older datasets are then
                 * removed automatically.
                 */
                await finalizeCloudVehicleAccountCache(
                    vehicleDetailsDatasetVersion
                );

                /*
                 * If Cars is already open, update its in-memory catalog.
                 * Do not inject cards into an inactive section; the verified
                 * snapshot is restored instantly the next time Cars opens.
                 */
                if (
                    currentVehicleKind ===
                        VEHICLE_ALL_KIND
                ) {
                    currentVehicleCatalog =
                        freshCatalog;
                }

            } catch (error) {

                console.warn(
                    "Background vehicle warmup failed:",
                    error
                );

            } finally {

                unifiedVehicleBackgroundWarmupActive = false;

                /*
                 * If a real sign-in happened during an anonymous warmup,
                 * run the account-aware pass once after the current pass
                 * settles. Multiple auth notifications are coalesced into
                 * this single queued restart.
                 */
                if (
                    unifiedVehicleBackgroundWarmupRestartRequested
                ) {
                    unifiedVehicleBackgroundWarmupRestartRequested =
                        false;

                    unifiedVehicleBackgroundWarmupPromise = null;

                    window.setTimeout(
                        () => {
                            void startUnifiedVehicleBackgroundWarmup();
                        },
                        0
                    );
                } else if (pausedForVisibility) {
                    /*
                     * Release the fulfilled promise so the next visit to
                     * Cars may continue the warmup rather than reusing a
                     * completed-but-paused promise forever.
                     */
                    unifiedVehicleBackgroundWarmupPromise = null;
                }

            }

        })();

    return unifiedVehicleBackgroundWarmupPromise;
}

/*
 * ============================================================
 * OPEN CARS
 * ============================================================
 */

async function openCars() {

    if(typeof window.hideShipTrackingSection === "function"){
        window.hideShipTrackingSection();
    }

    if (typeof window.hideWaterLevelsSection === "function") {
        window.hideWaterLevelsSection();
    }

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

    const cryptoSection =
        document.getElementById("cryptoSection");

    if (cryptoSection) {
        cryptoSection.style.display = "none";
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


    /* Unified vehicle catalog: no category buttons. */
    renderVehicleCategoryButtons();

        ensureVehiclePersonalPanels();
        renderVehiclePersonalPanels();
        void loadVehicleAccountLists();

    currentVehicleKind = VEHICLE_ALL_KIND;
    currentVehicleCatalog = [];
    currentVehicleResults = [];
    currentVehicleShowAll = false;
    currentVehicleMode = "popular";

    updateCarsCategoryHeader("popular", VEHICLE_ALL_KIND);

    const oldExpandButton =
        document.getElementById("carsVehicleExpandButton");
    if (oldExpandButton) oldExpandButton.remove();

    const grid = document.getElementById("popularCarsGrid");
    if (grid) {
        grid.innerHTML =
            '<div class="cars-empty-state">' +
                '<div class="cars-empty-icon">🚗</div>' +
                '<strong>Loading vehicles...</strong>' +
                '<p>Loading the 2000-vehicle catalog. Returning users can restore previously loaded cards from their account cache.</p>' +
            '</div>';
    }

    const vehicles = await fetchUnifiedVehicleCatalog();

    if (currentVehicleKind !== VEHICLE_ALL_KIND) return;

    currentVehicleCatalog = Array.isArray(vehicles)
        ? vehicles.slice(
            0,
            MAX_UNIFIED_VEHICLES
        )
        : [];
    updateCarsLastUpdated(VEHICLE_ALL_KIND);
    await loadAndRenderPopularVehicles(VEHICLE_ALL_KIND, false);

    /*
     * Begin the optional account-scoped warmup only after Cars has been
     * opened and its first useful view has rendered.
     */
    void startUnifiedVehicleBackgroundWarmup();

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
        · Up to 1,000 verified vehicles are selected and refreshed as the VehiclesDB dataset updates
        · Supplemental candidates from
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
         * state changes so another signed-in account never reuses the
         * previous account's image/details cache.
         */
        if (
            window.supabaseClient?.auth
        ) {

            window.supabaseClient.auth.onAuthStateChange(
                (event, session) => {

                    const nextUserId =
                        session?.user?.id || null;

                    /*
                     * INITIAL_SESSION describes the session already
                     * available when this page loads. Cars warmup is
                     * started on demand when the Cars section is opened,
                     * so this event must not schedule another catalogue pass.
                     */
                    if (event === "INITIAL_SESSION") {
                        unifiedVehicleBackgroundWarmupAuthUserId =
                            nextUserId;

                        /*
                         * The initial session can arrive after the UI
                         * starts. Refresh only the owner lookup; keep the
                         * active warmup lock intact.
                         */
                        vehicleAccountCacheOwnerPromise =
                            null;

                        return;
                    }

                    /*
                     * Token refreshes are routine. They must not start
                     * another full vehicle scan or cloud-cache sync.
                     */
                    if (event === "TOKEN_REFRESHED") {
                        return;
                    }

                    if (event === "SIGNED_IN") {

                        /*
                         * Supabase can notify SIGNED_IN more than once
                         * for the same account. Only a genuinely new
                         * account session needs a warmup pass.
                         */
                        if (
                            !nextUserId ||
                            nextUserId ===
                                unifiedVehicleBackgroundWarmupAuthUserId
                        ) {
                            return;
                        }

                        unifiedVehicleBackgroundWarmupAuthUserId =
                            nextUserId;

                        vehicleAccountCacheOwnerPromise =
                            null;

                        if (unifiedVehicleBackgroundWarmupActive) {
                            unifiedVehicleBackgroundWarmupRestartRequested =
                                true;
                            return;
                        }

                        unifiedVehicleBackgroundWarmupPromise =
                            null;

                        const carsSection =
                            document.getElementById("carsSection");

                        const carsIsVisible =
                            !!carsSection &&
                            !carsSection.hidden &&
                            window.getComputedStyle(carsSection).display !== "none";

                        if (carsIsVisible) {
                            window.setTimeout(
                                () => {
                                    void startUnifiedVehicleBackgroundWarmup();
                                },
                                0
                            );
                        }

                        return;
                    }

                    if (event === "SIGNED_OUT") {

                        unifiedVehicleBackgroundWarmupAuthUserId =
                            null;

                        vehicleAccountCacheOwnerPromise =
                            null;

                        unifiedVehicleBackgroundWarmupRestartRequested =
                            false;

                        /*
                         * Do not release the active-run lock from inside
                         * the auth callback. The running task owns its
                         * lock until its finally block completes.
                         */
                        if (!unifiedVehicleBackgroundWarmupActive) {
                            unifiedVehicleBackgroundWarmupPromise =
                                null;
                        }

                    }

                }
            );

        }

        /*
         * Initialize the unified Vehicles UI without starting a large
         * background catalogue scan on every page visit. The cache
         * warmup starts after the visitor actually opens Cars.
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


        let vehicleSearchTimer = null;

        searchInput.addEventListener("input", function () {
            const value = this.value;
            window.clearTimeout(vehicleSearchTimer);
            vehicleSearchTimer = window.setTimeout(() => handleVehicleSearch(value), VEHICLE_SEARCH_DEBOUNCE_MS);
        });

    }
);