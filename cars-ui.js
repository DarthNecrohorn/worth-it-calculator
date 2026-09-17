/*
 * ============================================================
 * WORTH IT - VEHICLES UI
 * VehiclesDB + Wikidata + Wikimedia Commons
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

const MAX_SEARCH_RESULTS = 100;

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


/*
 * ============================================================
 * IMAGE LAZY-LOAD OBSERVER
 * ============================================================
 */

let vehicleImageObserver = null;


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

                            loadVehicleCardImage(
                                imageElement,
                                make,
                                model,
                                kind
                            );

                        }

                        vehicleImageObserver.unobserve(
                            imageElement
                        );

                    },
                    {
                        rootMargin: "300px 0px"
                    }
                );

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

                const params =
                    new URLSearchParams({

                        action: "details",

                        make: make,

                        model: model,

                        kind: kind

                    });


                const response =
                    await fetch(
                        `${VEHICLE_API}?${params.toString()}`,
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


                if (details) {
             vehicleDetailsCache.set(cacheKey, details);
        }


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
                 * Cache null temporarily in memory
                 * so a broken request is not repeated
                 * continuously while scrolling.
                 */

                vehicleDetailsCache.set(
                    cacheKey,
                    null
                );

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
    kind
) {

    const info =
        getVehicleKindInfo(kind);

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "car-card-image-placeholder";

    wrapper.style.width =
        "100%";

    wrapper.style.height =
        "180px";

    wrapper.style.display =
        "flex";

    wrapper.style.alignItems =
        "center";

    wrapper.style.justifyContent =
        "center";

    wrapper.style.flexDirection =
        "column";

    wrapper.style.gap =
        "8px";

    wrapper.style.borderRadius =
        "12px 12px 0 0";

    wrapper.style.background =
        "rgba(128,128,128,0.10)";

    wrapper.style.fontSize =
        "2.4rem";

    wrapper.innerHTML = `

        <div>
            ${info.icon}
        </div>

        <small
            style="
                font-size:0.75rem;
                opacity:0.65;
            "
        >
            Image unavailable
        </small>

    `;

    return wrapper;

}


function showVehicleImagePlaceholder(
    image
) {

    const parent =
        image.parentNode;

    if (!parent) {

        return;

    }

    const make =
        image.dataset.vehicleMake || "";

    const model =
        image.dataset.vehicleModel || "";

    const kind =
        image.dataset.vehicleKind || "car";

    const placeholder =
        createVehicleImagePlaceholder(
            {
                make: make,
                model: model
            },
            kind
        );

    image.replaceWith(
        placeholder
    );

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

        showVehicleImagePlaceholder(
            imageElement
        );

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

    if (image.licenseUrl) {

        imageElement.dataset.imageLicenseUrl =
            image.licenseUrl;

    }

    if (image.sourceUrl) {

        imageElement.dataset.imageSourceUrl =
            image.sourceUrl;

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

        return vehicleCatalogCache.get(
            kind
        );

    }


    if (
        vehicleCatalogLoading.has(kind)
    ) {

        return vehicleCatalogLoading.get(
            kind
        );

    }


    const loadingPromise =
        (async () => {

            try {

                const params =
                    new URLSearchParams({

                        action: "models",

                        kind: kind

                    });


                const response =
                    await fetch(
                        `${VEHICLE_API}?${params.toString()}`,
                        {
                            headers: {
                                "Accept":
                                    "application/json"
                            }
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        `Vehicles API returned ${response.status}`
                    );

                }


                const data =
                    await response.json();


                if (
                    !data ||
                    !data.success ||
                    !Array.isArray(data.vehicles)
                ) {

                    throw new Error(
                        "Invalid VehiclesDB response"
                    );

                }


                const vehicles =
                    data.vehicles
                        .filter(
                            vehicle =>
                                vehicle &&
                                vehicle.make &&
                                vehicle.model
                        );


                vehicleCatalogCache.set(
                    kind,
                    vehicles
                );


                return vehicles;

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

    const value =
        Number(
            vehicle?.globalDecile
        );

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


    return [...vehicles]
        .sort(
            (a, b) => {

                const popularityDifference =
                    getVehiclePopularityValue(a) -
                    getVehiclePopularityValue(b);


                if (
                    popularityDifference !== 0
                ) {

                    return popularityDifference;

                }


                const makeCompare =
                    String(a.make || "")
                        .localeCompare(
                            String(b.make || ""),
                            undefined,
                            {
                                sensitivity:
                                    "base"
                            }
                        );


                if (
                    makeCompare !== 0
                ) {

                    return makeCompare;

                }


                return String(a.model || "")
                    .localeCompare(
                        String(b.model || ""),
                        undefined,
                        {
                            sensitivity:
                                "base"
                        }
                    );

            }
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
     * Register image with IntersectionObserver.
     */

    const observer =
        getVehicleImageObserver();


    if (observer) {

        observer.observe(
            image
        );

    } else {

        /*
         * Fallback for browsers without
         * IntersectionObserver.
         */

        loadVehicleCardImage(
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
     * Add Show All / Show Less.
     */

    if (
        currentVehicleShowAll ||
        forceShowAll
    ) {

        currentVehicleShowAll =
            true;


        renderVehicleCollapseButton(
            kind
        );

    } else {

        renderVehicleExpandButton(
            vehicles,
            vehiclesToRender,
            kind
        );

    }

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


    if (
        mode === "search"
    ) {

        title.textContent =
            `🔍 ${info.plural} Search`;


        description.textContent =
            `Search results from the VehiclesDB ${info.singular.toLowerCase()} catalog.`;


        return;

    }


    title.textContent =
        info.title;


    description.textContent =
        info.description;

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

window.openCars =
    openCars;


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
