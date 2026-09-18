/*
 * ============================================================
 * WORTH IT - VEHICLES UI
 * VehiclesDB + Wikipedia + Wikimedia Commons
 *
 * Supported vehicle categories:
 *   Cars
 *   Motorcycles
 *   Mopeds
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

const VEHICLE_DETAILS_CACHE_VERSION = "v14";

const MAX_SEARCH_RESULTS = 300;

const INITIAL_VISIBLE_ROWS = 3;

const VEHICLE_KINDS = [
    "car",
    "motorcycle",
    "moped",
    "van",
    "truck",
    "bus"
];

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

    moped: {
        icon: "🛵",
        singular: "Moped",
        plural: "Mopeds",
        title: "🛵 Popular Mopeds",
        description:
            "Discover some of the most popular moped models."
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
 * ============================================================
 * IMAGE LAZY-LOAD + CONCURRENCY CONTROL
 * ============================================================
 */

let vehicleImageObserver = null;

const MAX_CONCURRENT_IMAGE_REQUESTS = 3;

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


                        if (
                            make &&
                            model &&
                            kind
                        ) {

                            queueVehicleImageLoad(
                                imageElement,
                                make,
                                model,
                                kind
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
                                normalizeVehicleText(model)
                    ) || null;

                const params =
                    new URLSearchParams({

                        action: "details",

                        make: make,

                        model: model,

                        kind: kind

                    });

                if (catalogVehicle) {

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


                const response =
                    await fetch(
                        `${VEHICLE_API}?${params.toString()}&v=${VEHICLE_DETAILS_CACHE_VERSION}`,
                        {
                            headers: {
                                "Accept":
                                    "application/json"
                            }
                        }
                    );


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


async function loadVehicleCardImage(
    imageElement,
    make,
    model,
    kind
) {

    /*
     * Do not load the image twice.
     */

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


    /*
     * The card may have been removed
     * while the request was running.
     */

    if (
        !imageElement.isConnected
    ) {

        return;

    }


    const image =
        details?.image;


    if (
    !image ||
    !image.url
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
     * Use the direct Wikimedia Commons
     * upload URL returned by our API.
     */

    imageElement.src =
        image.url;

    imageElement.dataset.loaded =
        "true";


    /*
     * Keep useful licensing metadata
     * directly on the image element.
     */

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

}


/*
 * ============================================================
 * LOAD VEHICLESDB CATALOG
 * ============================================================
 */

async function fetchVehicleCatalog(
    kind = "car"
) {

    if (!VEHICLE_KINDS.includes(kind)) {
        kind = "car";
    }

    if (
        vehicleCatalogCache.has(kind)
    ) {
        return vehicleCatalogCache.get(kind);
    }

    if (
        vehicleCatalogLoading.has(kind)
    ) {
        return vehicleCatalogLoading.get(kind);
    }

    const loadingPromise =
        (async () => {

            try {

                const baseUrl =
                    `${VEHICLE_CATALOG_BASE_URL}/${kind}`;

                const [
                    modelsResponse,
                    makesResponse
                ] = await Promise.all([
                    fetch(
                        `${baseUrl}/models.json`,
                        {
                            headers: {
                                "Accept": "application/json"
                            }
                        }
                    ),
                    fetch(
                        `${baseUrl}/makes.json`,
                        {
                            headers: {
                                "Accept": "application/json"
                            }
                        }
                    )
                ]);

                if (
                    !modelsResponse.ok ||
                    !makesResponse.ok
                ) {
                    throw new Error(
                        `VehiclesDB catalog request failed: models=${modelsResponse.status}, makes=${makesResponse.status}`
                    );
                }

                const [
                    modelRecords,
                    makeRecords
                ] = await Promise.all([
                    modelsResponse.json(),
                    makesResponse.json()
                ]);

                if (
                    !Array.isArray(modelRecords) ||
                    !Array.isArray(makeRecords)
                ) {
                    throw new Error(
                        "Invalid VehiclesDB catalog response"
                    );
                }

                const makeMap =
                    new Map(
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

                const vehicles =
                    modelRecords
                        .map(model => {

                            if (!model || !model.name) {
                                return null;
                            }

                            const make =
                                makeMap.get(
                                    String(model.make_id || "")
                                ) || {
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
                                    ? Object.values(
                                        model.popularity.by_country
                                    )
                                        .map(entry => entry?.rank)
                                        .filter(rank => {
                                            const value = Number(rank);
                                            return (
                                                Number.isFinite(value) &&
                                                value > 0
                                            );
                                        })
                                    : [];

                            return {
                                make: make.name,
                                makeSlug: make.slug,
                                model: model.name,
                                modelSlug: model.slug || "",
                                kind: model.kind || kind,
                                bodyType:
                                    Array.isArray(model.body_types) &&
                                    model.body_types.length
                                        ? model.body_types[0]
                                        : null,
                                bodyTypes:
                                    Array.isArray(model.body_types)
                                        ? model.body_types
                                        : [],
                                popularityRanks,
                                globalDecile:
                                    rawDecile,
                                availability:
                                    Array.isArray(model.availability)
                                        ? model.availability.map(item =>
                                            typeof item === "string"
                                                ? item
                                                : item?.country
                                        ).filter(Boolean)
                                        : [],
                                yearStart:
                                    model.year_start ?? null,
                                yearEnd:
                                    model.year_end ?? null
                            };
                        })
                        .filter(Boolean)
                        .filter(vehicle => {

                            const rawDecile =
                                vehicle.globalDecile;

                            return (
                                rawDecile !== null &&
                                rawDecile !== undefined &&
                                String(rawDecile).trim() !== "" &&
                                Number.isFinite(Number(rawDecile)) &&
                                Number(rawDecile) <= 2
                            );
                        });

                /*
                 * Sort only by VehiclesDB's documented global
                 * popularity decile. Ties deliberately retain
                 * the order supplied by VehiclesDB; we do not
                 * invent a second global ranking from country
                 * ranks.
                 */
                vehicles.sort(
                    (a, b) =>
                        getVehiclePopularityValue(a) -
                        getVehiclePopularityValue(b)
                );

                const limitedVehicles =
                    vehicles.slice(
                        0,
                        300
                    );

                vehicleCatalogCache.set(
                    kind,
                    limitedVehicles
                );

                return limitedVehicles;

            } catch (error) {

                console.error(
                    `VehiclesDB catalog error for ${kind}:`,
                    error
                );

                return [];

            } finally {

                vehicleCatalogLoading.delete(
                    kind
                );

            }

        })();

    vehicleCatalogLoading.set(
        kind,
        loadingPromise
    );

    return loadingPromise;
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


function getPopularVehicles(
    vehicles
) {

    if (!Array.isArray(vehicles)) {
        return [];
    }

    /*
     * Keep Popular Vehicles consistent with the catalog sort.
     * Only the documented global popularity decile is used for
     * ordering; tied deciles keep the catalog's original order.
     */
    return [...vehicles].sort(
        (a, b) =>
            getVehiclePopularityValue(a) -
            getVehiclePopularityValue(b)
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

function renderVehicleExpandButton(
    totalVehicles,
    visibleVehicles,
    kind
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
        totalVehicles.length <=
            visibleVehicles.length
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
        () => {

            currentVehicleShowAll =
                true;


            renderVehicleCards(
                totalVehicles,
                kind,
                true
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
     * Comparison system will be connected
     * to these cards later.
     */

    card.dataset.vehicleKind =
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
        kind
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
        ["fuel", "Fuel"],
        ["transmission", "Transmission"],
        ["drivetrain", "Drivetrain"],
        ["horsepower", "Power"],
        ["torque", "Torque"],
        ["weight", "Weight"],
        ["length", "Length"],
        ["width", "Width"],
        ["height", "Height"],
        ["wheelbase", "Wheelbase"],
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

    const details =
        await fetchVehicleDetails(
            vehicle.make,
            vehicle.model,
            kind
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

    renderVehicleDetailsPanel(
        body,
        details,
        vehicle,
        kind
    );

}


function renderVehicleDetailsPanel(
    body,
    details,
    catalogVehicle,
    kind
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
                class="worth-it-vehicle-compare-button${alreadyCompared ? " is-added" : ""}"
                data-vehicle-compare
                data-vehicle-key="${escapeVehicleHtml(compareKey)}"
            >
                ${alreadyCompared ? "✓ Added to compare" : "Add to compare"}
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
                ["fuel", "Fuel"],
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
                ["length", "Length"],
                ["width", "Width"],
                ["height", "Height"],
                ["wheelbase", "Wheelbase"]
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
        "Show less cars";

    button.setAttribute(
        "aria-label",
        "Show less cars"
    );

    button.addEventListener(
        "click",
        () => {

            currentVehicleShowAll =
                false;

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


function updateVehicleFloatingCollapseButton() {

    const button =
        ensureVehicleFloatingCollapseButton();

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

    const sectionTop =
        window.scrollY +
        carsSection.getBoundingClientRect().top;

    const shouldShow =
        window.scrollY >
        sectionTop + 180;

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
        }

        .worth-it-vehicle-compare-button:hover {
            background: rgba(255, 255, 255, 0.14);
        }

        .worth-it-vehicle-compare-button.is-added {
            background: rgba(60, 180, 110, 0.16);
            border-color: rgba(90, 210, 135, 0.38);
        }

        .worth-it-vehicle-source {
            font-size: 0.82rem;
            opacity: 0.7;
        }

        .worth-it-vehicle-source a {
            color: inherit;
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


        .worth-it-vehicle-floating-collapse {
            position: fixed;
            left: 14px;
            top: 50%;
            z-index: 99950;
            transform: translate(-140%, -50%);
            transition: transform 0.22s ease, opacity 0.22s ease;
            opacity: 0;
            pointer-events: none;
            min-height: 42px;
            padding: 0 15px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 12px;
            background: rgba(17, 19, 24, 0.95);
            color: #fff;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
            font-weight: 800;
            cursor: pointer;
        }

        .worth-it-vehicle-floating-collapse.is-visible {
            transform: translate(0, -50%);
            opacity: 1;
            pointer-events: auto;
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

            .worth-it-vehicle-floating-collapse {
                left: 8px;
                top: auto;
                bottom: 92px;
                transform: translateX(-140%);
            }

            .worth-it-vehicle-floating-collapse.is-visible {
                transform: translateX(0);
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

function updateCarsCategoryHeader(
    mode = "popular",
    kind = currentVehicleKind
) {

    const title =
        document.getElementById(
            "carsResultsTitle"
        );


    const description =
        document.getElementById(
            "carsResultsDescription"
        );


    if (
        !title ||
        !description
    ) {

        return;

    }


    const info =
        getVehicleKindInfo(
            kind
        );


    /*
     * Search mode uses a plain description.
     * The popularity note is only relevant to
     * the Popular Vehicles view.
     */

    if (
        mode === "search"
    ) {

        title.textContent =
            `🔍 ${info.plural} Search`;

        description.classList.remove(
            "cars-results-description-with-info"
        );

        description.innerHTML =
            `<span class="cars-results-description-text">${escapeVehicleHtml(
                `Search results from the VehiclesDB ${info.singular.toLowerCase()} catalog.`
            )}</span>`;

        return;

    }


    title.textContent =
        info.title;


    /*
     * Put a small information icon directly beside
     * the Popular Vehicles description. The full note
     * opens as a small accessible popover so the page
     * stays visually clean.
     */

    description.classList.add(
        "cars-results-description-with-info"
    );

    description.innerHTML = `

        <span class="cars-results-description-text">
            ${escapeVehicleHtml(info.description)}
        </span>

        <span class="cars-popularity-info-wrap">

            <button
                type="button"
                class="cars-popularity-info-button"
                aria-label="Popularity information"
                aria-expanded="false"
                aria-controls="carsPopularityTooltip"
                title="Popularity information"
            >
                ⓘ
            </button>

            <span
                id="carsPopularityTooltip"
                class="cars-popularity-tooltip"
                role="tooltip"
                hidden
            >
                <strong>Popularity note</strong>
                <span>${escapeVehicleHtml(VEHICLE_POPULARITY_NOTE)}</span>
            </span>

        </span>

    `;


    const infoButton =
        description.querySelector(
            ".cars-popularity-info-button"
        );


    const infoWrap =
        description.querySelector(
            ".cars-popularity-info-wrap"
        );


    const tooltip =
        description.querySelector(
            ".cars-popularity-tooltip"
        );


    if (
        !infoButton ||
        !infoWrap ||
        !tooltip
    ) {

        return;

    }


    infoButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            const shouldOpen =
                tooltip.hidden;

            tooltip.hidden =
                !shouldOpen;

            infoButton.setAttribute(
                "aria-expanded",
                shouldOpen
                    ? "true"
                    : "false"
            );

            infoWrap.classList.toggle(
                "is-open",
                shouldOpen
            );

        }
    );


    /*
     * Close the popover when the user clicks
     * somewhere else on the page.
     */

    const closePopularityPopover =
        event => {

            if (
                !infoWrap.contains(
                    event.target
                )
            ) {

                tooltip.hidden =
                    true;

                infoButton.setAttribute(
                    "aria-expanded",
                    "false"
                );

                infoWrap.classList.remove(
                    "is-open"
                );

            }

        };


    document.addEventListener(
        "click",
        closePopularityPopover,
        { once: true }
    );

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
                    Loading the latest VehiclesDB catalog.
                </p>

            </div>

        `;

    }


    const vehicles =
        await fetchVehicleCatalog(
            kind
        );


    currentVehicleCatalog =
        vehicles;


    const popularVehicles =
        getPopularVehicles(
            vehicles
        );


    renderVehicleCards(
        popularVehicles,
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


        renderVehicleCards(
            results,
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

    const homePage =
        document.getElementById(
            "homePage"
        );


    if (homePage) {

        homePage.style.display =
            "none";

    }


    document
        .querySelectorAll(".app")
        .forEach(
            x => {

                x.classList.remove(
                    "active"
                );

                x.style.display =
                    "none";

            }
        );


    const sectionsToHide = [

        "weatherSection",
        "newsSection",
        "discountsSection",
        "marketsSection",
        "moneySection"

    ];


    sectionsToHide.forEach(
        id => {

            const element =
                document.getElementById(
                    id
                );


            if (element) {

                element.style.display =
                    "none";

            }

        }
    );


    const settingsPanel =
        document.getElementById(
            "settingsPanel"
        );


    if (settingsPanel) {

        settingsPanel.style.display =
            "none";

    }


    const carsSection =
        document.getElementById(
            "carsSection"
        );


    if (carsSection) {

        carsSection.style.display =
            "block";

    }


    /*
     * Build the six vehicle categories.
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
                    Loading the latest VehiclesDB catalog.
                </p>

            </div>

        `;

    }


    /*
     * Load Cars catalog.
     */

    const vehicles =
        await fetchVehicleCatalog(
            "car"
        );


    currentVehicleCatalog =
        vehicles;


    const popularVehicles =
        getPopularVehicles(
            vehicles
        );


    renderVehicleCards(
        popularVehicles,
        "car",
        false
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

        /*
         * Create the six vehicle categories.
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
