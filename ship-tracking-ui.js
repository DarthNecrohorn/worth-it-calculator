/* =========================================================
   WORTH IT — SHIP TRACKING UI
   Live AIS / Pelyr integration
========================================================= */

(function(){
    "use strict";

    const CONFIG = {
        API: "/api/ship-tracking",
        MAX_INITIAL_VESSELS: 800,
        MAX_CARD_VESSELS: 120,
        MIN_MAP_ZOOM: 3,
        MAP_LOAD_DEBOUNCE_MS: 650,
        AUTO_REFRESH_MS: 45000,
        MAP_BASE_REFRESH_MS: 21600000,
        SEARCH_DEBOUNCE_MS: 220,
        REQUEST_TIMEOUT_MS: 20000
    };

    let map = null;
    let markerLayer = null;
    let autoRefreshTimer = null;
    let mapBaseRefreshTimer = null;
    let mapLoadTimer = null;
    let searchTimer = null;
    let selectedMmsi = "";
    let activeFilter = "all";
    let vessels = [];
    let lastViewportKey = "";
    let lastLoadAt = 0;
    let currentRequestController = null;

    function get(id){
        return document.getElementById(id);
    }

    function init(){
        const section = get("shipTrackingSection");
        const mapElement = get("shipTrackingMap");

        if(!section || !mapElement){
            return;
        }

        setupFilters();
        setupSearch();
        setupGridEvents();
        startAutoRefresh();

        /*
         * Leaflet must be initialized only after the section is visible.
         * Ship Tracking is hidden on first page load.
         */
        if(section.style.display !== "none"){
            prepareVisibleMap();
        }
    }

    function prepareVisibleMap(){
        const mapElement = get("shipTrackingMap");

        if(!mapElement){
            return;
        }

        setupMap(mapElement);

        if(!map){
            return;
        }

        window.requestAnimationFrame(function(){
            map.invalidateSize({
                pan: false
            });

            window.setTimeout(function(){
                if(!map){
                    return;
                }

                map.invalidateSize({
                    pan: false
                });

                loadWorldMapLayer();
                scheduleMapLoad(true);
            }, 120);
        });
    }

    function setupFilters(){
        const filters = get("shipTrackingFilters");

        if(!filters || filters.dataset.ready === "true"){
            return;
        }

        filters.dataset.ready = "true";

        filters.addEventListener("click", function(event){
            const button = event.target.closest("[data-ship-filter]");

            if(!button || !filters.contains(button)){
                return;
            }

            activeFilter = button.dataset.shipFilter || "all";

            filters.querySelectorAll("[data-ship-filter]").forEach(function(item){
                const active = item === button;
                item.classList.toggle("active", active);
                item.setAttribute("aria-pressed", active ? "true" : "false");
            });

            renderVesselView();
        });

        filters.querySelectorAll("[data-ship-filter]").forEach(function(button){
            button.setAttribute(
                "aria-pressed",
                button.classList.contains("active") ? "true" : "false"
            );
        });
    }

    function setupSearch(){
        const input = get("shipTrackingSearch");

        if(!input || input.dataset.ready === "true"){
            return;
        }

        input.dataset.ready = "true";

        input.addEventListener("input", function(){
            window.clearTimeout(searchTimer);

            searchTimer = window.setTimeout(function(){
                const query = input.value.trim();

                renderVesselView();

                if(/^\d{9}$/.test(query)){
                    loadVesselDetails(query, false);
                }
            }, CONFIG.SEARCH_DEBOUNCE_MS);
        });
    }

    function setupGridEvents(){
        const grid = get("shipTrackingGrid");

        if(!grid || grid.dataset.ready === "true"){
            return;
        }

        grid.dataset.ready = "true";

        grid.addEventListener("click", function(event){
            const detailsButton = event.target.closest("[data-ship-details]");
            const trackButton = event.target.closest("[data-ship-track]");

            if(detailsButton){
                event.preventDefault();
                loadVesselDetails(detailsButton.dataset.shipDetails || "", true);
                return;
            }

            if(trackButton){
                event.preventDefault();
                loadVesselTrack(trackButton.dataset.shipTrack || "");
            }
        });
    }

    function setupMap(mapElement){
        if(map || typeof L === "undefined"){
            return;
        }

        map = L.map(mapElement, {
            minZoom: 2,
            maxZoom: 18,
            /*
             * Keep latitude inside the Web Mercator world, but allow
             * unlimited horizontal movement so the world can repeat
             * seamlessly from left to right.
             */
            maxBounds: [
                [-85.051129, -720],
                [85.051129, 720]
            ],
            maxBoundsViscosity: 0,
            worldCopyJump: true,
            zoomControl: true,
            zoomSnap: 0.5,
            zoomDelta: 0.5,
            preferCanvas: true
        }).setView([20, 0], 2);

        /*
         * Start with the normal map. Satellite imagery is available as
         * an optional layer and is not loaded until the user selects it.
         */
        addDefaultBaseLayer();
        addBaseMapSwitcher();

        markerLayer = L.layerGroup().addTo(map);

        map.on("moveend zoomend", function(){
            scheduleMapLoad(false);
        });

        window.setTimeout(function(){
            if(map){
                map.invalidateSize({
                    pan: false
                });
            }
        }, 50);
    }

    let defaultMapLayer = null;
    let mediumInfoLayer = null;
    let satelliteLayer = null;
    let infoVectorLayer = null;
    let infoVectorStylePromise = null;
    let infoVectorRequestId = 0;
    let activeBaseMap = "default";
    let markerInfoLevel = "default";

    function addDefaultBaseLayer(){
        if(!map || defaultMapLayer){
            return;
        }

        defaultMapLayer = L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                minZoom: 2,
                maxZoom: 19,
                noWrap: false,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
                crossOrigin: true,
                keepBuffer: 2,
                updateWhenIdle: true,
                updateWhenZooming: false
            }
        ).addTo(map);

        defaultMapLayer.bringToBack();
    }

    function addMediumInfoLayer(){
        /*
         * Kept as a compatibility placeholder. Medium/Nothing now use
         * the OpenFreeMap vector layer so the base-map appearance is not
         * replaced by a gray raster map.
         */
        return;
    }

    function getInfoVectorStyle(level){
        if(infoVectorStylePromise){
            return infoVectorStylePromise.then(function(style){
                return buildInfoVectorStyle(style, level);
            });
        }

        infoVectorStylePromise = fetch(
            "https://tiles.openfreemap.org/styles/liberty",
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                },
                cache: "force-cache"
            }
        ).then(function(response){
            if(!response.ok){
                throw new Error("OpenFreeMap style could not be loaded.");
            }
            return response.json();
        });

        return infoVectorStylePromise.then(function(style){
            return buildInfoVectorStyle(style, level);
        });
    }

    function buildInfoVectorStyle(sourceStyle, level){
        const style = JSON.parse(JSON.stringify(sourceStyle));

        /*
         * Remove every existing symbol layer first. That guarantees
         * Nothing means literally no text/icons and also removes POIs,
         * shops, restaurants, bus stops, road labels, shields, etc.
         */
        style.layers = (style.layers || []).filter(function(layer){
            return layer.type !== "symbol";
        });

        if(level === "nothing"){
            return style;
        }

        const labelPaint = {
            "text-color": "#374151",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.2
        };

        style.layers.push({
            id: "worth-it-medium-place-labels",
            type: "symbol",
            source: "openmaptiles",
            "source-layer": "place",
            minzoom: 1,
            filter: [
                "in",
                ["get", "class"],
                "continent",
                "country",
                "state",
                "province",
                "city",
                "town",
                "village",
                "hamlet"
            ],
            layout: {
                "text-field": [
                    "coalesce",
                    ["get", "name"],
                    ["get", "name:en"]
                ],
                "text-font": ["Noto Sans Regular"],
                "text-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    1, 10,
                    4, 11,
                    7, 12,
                    10, 13,
                    14, 14
                ],
                "text-padding": 2,
                "text-max-width": 8,
                "text-allow-overlap": false
            },
            paint: labelPaint
        });

        style.layers.push({
            id: "worth-it-medium-water-labels",
            type: "symbol",
            source: "openmaptiles",
            "source-layer": "water_name",
            minzoom: 2,
            layout: {
                "text-field": [
                    "coalesce",
                    ["get", "name"],
                    ["get", "name:en"]
                ],
                "text-font": ["Noto Sans Italic"],
                "text-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    2, 10,
                    6, 12,
                    10, 13,
                    14, 14
                ],
                "text-max-width": 8,
                "text-padding": 2
            },
            paint: {
                "text-color": "#4b6ea8",
                "text-halo-color": "#ffffff",
                "text-halo-width": 1
            }
        });

        style.layers.push({
            id: "worth-it-medium-river-labels",
            type: "symbol",
            source: "openmaptiles",
            "source-layer": "waterway",
            minzoom: 5,
            filter: [
                "all",
                ["has", "name"],
                ["in", ["get", "class"], "river", "canal"]
            ],
            layout: {
                "symbol-placement": "line",
                "text-field": [
                    "coalesce",
                    ["get", "name"],
                    ["get", "name:en"]
                ],
                "text-font": ["Noto Sans Italic"],
                "text-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5, 10,
                    9, 11,
                    13, 12,
                    16, 13
                ],
                "text-max-angle": 30,
                "text-padding": 2
            },
            paint: {
                "text-color": "#4b6ea8",
                "text-halo-color": "#ffffff",
                "text-halo-width": 1
            }
        });

        return style;
    }

    function removeInfoVectorLayer(){
        if(map && infoVectorLayer){
            map.removeLayer(infoVectorLayer);
        }
    }

    function applyInfoVectorLayer(level){
        if(!map || activeBaseMap === "satellite"){
            return;
        }

        const requestId = ++infoVectorRequestId;

        if(infoVectorLayer){
            map.removeLayer(infoVectorLayer);
            infoVectorLayer = null;
        }

        if(defaultMapLayer){
            map.removeLayer(defaultMapLayer);
        }

        getInfoVectorStyle(level)
            .then(function(style){
                if(
                    !map ||
                    requestId !== infoVectorRequestId ||
                    activeBaseMap === "satellite" ||
                    markerInfoLevel !== level
                ){
                    return;
                }

                infoVectorLayer = L.maplibreGL({
                    style: style,
                    interactive: false,
                    attribution:
                        "OpenFreeMap © OpenMapTiles Data from OpenStreetMap"
                }).addTo(map);

                if(markerLayer){
                    markerLayer.bringToFront();
                }

                map.invalidateSize({
                    pan: false
                });
            })
            .catch(function(error){
                console.error("Ship tracking info map failed:", error);

                /*
                 * Never leave the normal map blank if the optional
                 * vector information layer cannot be loaded.
                 */
                if(
                    map &&
                    requestId === infoVectorRequestId &&
                    activeBaseMap !== "satellite" &&
                    markerInfoLevel === level
                ){
                    addDefaultBaseLayer();
                    if(markerLayer){
                        markerLayer.bringToFront();
                    }
                }
            });
    }

    function addSatelliteBaseLayer(){
        if(!map){
            return;
        }

        const cacheKey = Date.now();

        satelliteLayer = L.tileLayer(
            "https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/" +
            "MODIS_Terra_CorrectedReflectance_TrueColor/default/" +
            "GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg" +
            "?refresh=" + cacheKey,
            {
                minZoom: 2,
                maxZoom: 18,
                maxNativeZoom: 9,
                noWrap: false,
                subdomains: ["a","b","c"],
                attribution:
                    "Satellite imagery: NASA GIBS / MODIS Terra " +
                    "· Sources: NASA",
                crossOrigin: true,
                keepBuffer: 2,
                updateWhenIdle: true,
                updateWhenZooming: false
            }
        ).addTo(map);

        satelliteLayer.bringToBack();
    }

    function addBaseMapSwitcher(){
        if(!map){
            return;
        }

        const BaseMapSwitcher = L.Control.extend({
            options: {
                position: "topleft"
            },

            onAdd: function(){
                const container =
                    L.DomUtil.create(
                        "div",
                        "leaflet-control ship-tracking-map-switcher"
                    );

                const defaultButton =
                    L.DomUtil.create(
                        "button",
                        "ship-tracking-map-switcher-btn active",
                        container
                    );

                const satelliteButton =
                    L.DomUtil.create(
                        "button",
                        "ship-tracking-map-switcher-btn",
                        container
                    );

                const infoGroup = L.DomUtil.create(
                    "div",
                    "ship-tracking-map-info-options",
                    container
                );

                const infoLabel = L.DomUtil.create(
                    "span",
                    "ship-tracking-map-info-label",
                    infoGroup
                );
                infoLabel.textContent = "Map information";

                const infoOptions = [
                    { value: "default", label: "Default" },
                    { value: "medium", label: "Medium" },
                    { value: "nothing", label: "Nothing" }
                ];

                const infoButtons = infoOptions.map(function(option){
                    const label = L.DomUtil.create(
                        "label",
                        "ship-tracking-map-info-option",
                        infoGroup
                    );
                    const input = L.DomUtil.create(
                        "input",
                        "",
                        label
                    );
                    input.type = "radio";
                    input.name = "ship-tracking-map-info";
                    input.value = option.value;
                    input.checked = option.value === markerInfoLevel;

                    const textNode = L.DomUtil.create(
                        "span",
                        "",
                        label
                    );
                    textNode.textContent = option.label;

                    L.DomEvent.on(input, "change", function(){
                        if(input.checked){
                            setMarkerInfoLevel(option.value);
                        }
                    });

                    return input;
                });

                defaultButton.type = "button";
                satelliteButton.type = "button";

                defaultButton.textContent = "Default map";
                satelliteButton.textContent = "Satellite map";

                defaultButton.setAttribute(
                    "aria-pressed",
                    "true"
                );

                satelliteButton.setAttribute(
                    "aria-pressed",
                    "false"
                );

                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);

                L.DomEvent.on(
                    defaultButton,
                    "click",
                    function(){
                        switchBaseMap("default");
                    }
                );

                L.DomEvent.on(
                    satelliteButton,
                    "click",
                    function(){
                        switchBaseMap("satellite");
                    }
                );

                container._defaultButton = defaultButton;
                container._satelliteButton = satelliteButton;
                container._infoButtons = infoButtons;

                map._shipTrackingBaseMapSwitcher = container;

                return container;
            }
        });

        map.addControl(new BaseMapSwitcher());
    }

    function updateBaseMapSwitcher(){
        const control = map && map._shipTrackingBaseMapSwitcher;

        if(!control){
            return;
        }

        const defaultActive = activeBaseMap === "default";

        control._defaultButton.classList.toggle(
            "active",
            defaultActive
        );

        control._satelliteButton.classList.toggle(
            "active",
            !defaultActive
        );

        control._defaultButton.setAttribute(
            "aria-pressed",
            defaultActive ? "true" : "false"
        );

        control._satelliteButton.setAttribute(
            "aria-pressed",
            defaultActive ? "false" : "true"
        );
    }

    function setMarkerInfoLevel(level){
        if(level !== "default" && level !== "medium" && level !== "nothing"){
            return;
        }

        if(markerInfoLevel === level){
            return;
        }

        markerInfoLevel = level;
        renderMarkers();
    }

    function setMarkerInfoLevel(level){
        if(level !== "default" && level !== "medium" && level !== "nothing"){
            return;
        }

        markerInfoLevel = level;

        if(!map){
            return;
        }

        if(activeBaseMap === "satellite"){
            infoVectorRequestId++;
            removeInfoVectorLayer();

            if(satelliteLayer){
                satelliteLayer.bringToBack();
            }

            if(markerLayer){
                markerLayer.bringToFront();
            }

            renderMarkers();
            return;
        }

        if(level === "default"){
            infoVectorRequestId++;
            removeInfoVectorLayer();

            addDefaultBaseLayer();

            if(defaultMapLayer){
                defaultMapLayer.bringToBack();
            }
        }else{
            applyInfoVectorLayer(level);
        }

        if(markerLayer){
            markerLayer.bringToFront();
        }

        renderMarkers();
        map.invalidateSize({ pan: false });
    }

    function switchBaseMap(mode){
        if(!map){
            return;
        }

        if(mode !== "default" && mode !== "satellite"){
            return;
        }

        if(activeBaseMap === mode){
            return;
        }

        addDefaultBaseLayer();

        if(mode === "satellite"){
            if(!satelliteLayer){
                addSatelliteBaseLayer();
            }else{
                satelliteLayer.addTo(map);
            }

            if(defaultMapLayer){
                map.removeLayer(defaultMapLayer);
            }
            removeInfoVectorLayer();

            activeBaseMap = "satellite";
        }else{
            if(satelliteLayer){
                map.removeLayer(satelliteLayer);
            }

            activeBaseMap = "default";

            // Restore the selected geographic information level.
            setMarkerInfoLevel(markerInfoLevel);
        }

        if(markerLayer){
            markerLayer.bringToFront();
        }

        updateBaseMapSwitcher();
        map.invalidateSize({ pan: false });
    }

    function refreshSatelliteBaseLayer(){
        if(
            !map ||
            activeBaseMap !== "satellite"
        ){
            return;
        }

        const previous = satelliteLayer;

        satelliteLayer = null;
        addSatelliteBaseLayer();

        if(previous){
            map.removeLayer(previous);
        }

        if(markerLayer){
            markerLayer.bringToFront();
        }

        map.invalidateSize({
            pan: false
        });
    }

    let worldMapPromise = null;
    let worldLayer = null;
    let oceanLayer = null;

    function loadWorldMapLayer(){
        /*
         * Base world geography is already provided by the Leaflet
         * raster tile layer in setupMap(). Keep this function so the
         * existing initialization flow remains unchanged.
         */
        if(!map){
            return;
        }

        if(worldLayer){
            return;
        }

        worldLayer = true;
        return Promise.resolve();
    }

    function scheduleMapLoad(force){
        window.clearTimeout(mapLoadTimer);

        mapLoadTimer = window.setTimeout(function(){
            loadVisibleVessels(Boolean(force));
        }, force ? 20 : CONFIG.MAP_LOAD_DEBOUNCE_MS);
    }

    async function loadVisibleVessels(force){
        if(!map){
            return;
        }

        const zoom = map.getZoom();

        if(zoom < CONFIG.MIN_MAP_ZOOM){
            clearMarkers();
            setStatus(
                "Zoom in to load live vessel positions.",
                "Live AIS map is ready · zoom level " + zoom
            );
            renderVesselCards([]);
            lastViewportKey = "";
            return;
        }

        const bounds = map.getBounds();
        const south = bounds.getSouth();
        const west = bounds.getWest();
        const north = bounds.getNorth();
        const east = bounds.getEast();

        if(
            !Number.isFinite(south) ||
            !Number.isFinite(west) ||
            !Number.isFinite(north) ||
            !Number.isFinite(east) ||
            south >= north ||
            west >= east
        ){
            setStatus(
                "This map view crosses the 180° meridian. Move slightly east or west to load vessels.",
                ""
            );
            return;
        }

        const max = getViewportMax(zoom);
        const viewportKey = [
            round(west, 2),
            round(south, 2),
            round(east, 2),
            round(north, 2),
            max
        ].join(",");

        const now = Date.now();

        if(
            !force &&
            viewportKey === lastViewportKey &&
            now - lastLoadAt < 20000
        ){
            return;
        }

        lastViewportKey = viewportKey;
        lastLoadAt = now;

        if(currentRequestController){
            currentRequestController.abort();
        }

        currentRequestController = new AbortController();

        const timeout = window.setTimeout(function(){
            currentRequestController.abort();
        }, CONFIG.REQUEST_TIMEOUT_MS);

        setStatus(
            "Loading live vessels…",
            "Viewport · " + formatViewportSize(bounds)
        );

        try{
            const url =
                CONFIG.API +
                "?action=vessels" +
                "&bbox=" +
                encodeURIComponent(
                    [
                        round(west, 4),
                        round(south, 4),
                        round(east, 4),
                        round(north, 4)
                    ].join(",")
                ) +
                "&max=" +
                encodeURIComponent(max);

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                },
                cache: "no-store",
                signal: currentRequestController.signal
            });

            if(!response.ok){
                const errorBody = await safeJson(response);
                throw createApiError(response, errorBody);
            }

            const data = await response.json();

            if(!data || data.ok !== true || !Array.isArray(data.vessels)){
                throw new Error("Ship tracking response is unavailable.");
            }

            vessels = data.vessels;
            updateAttribution(data.attributions || []);
            renderVesselView();
            renderMarkers();

            const truncationText =
                data.truncated
                    ? " · View is capped; zoom in for more"
                    : "";

            setStatus(
                data.vessels.length +
                    " live vessel" +
                    (data.vessels.length === 1 ? "" : "s") +
                    " in the current map area" +
                    truncationText,
                "Updated " + formatTime(data.generated_at)
            );

        }
        catch(error){
            if(error && error.name === "AbortError"){
                return;
            }

            console.error("Ship tracking vessel load failed:", error);

            setStatus(
                getApiErrorMessage(error),
                "The map will keep its last successful data when available."
            );

            if(vessels.length === 0){
                renderVesselCards([]);
            }
        }
        finally{
            window.clearTimeout(timeout);
            currentRequestController = null;
        }
    }

    function renderVesselView(){
        const filtered = getFilteredVessels();
        renderVesselCards(filtered);
        renderMarkers();
    }

    function getFilteredVessels(){
        const input = get("shipTrackingSearch");
        const query = input ? input.value.trim().toLowerCase() : "";

        return vessels.filter(function(vessel){
            if(!matchesFilter(vessel)){
                return false;
            }

            if(!query){
                return true;
            }

            const haystack = [
                vessel.name,
                vessel.mmsi,
                vessel.imo,
                vessel.callsign,
                vessel.destination
            ]
            .map(function(value){
                return String(value == null ? "" : value).toLowerCase();
            })
            .join(" ");

            return haystack.includes(query);
        });
    }

    function matchesFilter(vessel){
        if(activeFilter === "all"){
            return true;
        }

        const type = Number(vessel.type);

        if(activeFilter === "cargo"){
            return type >= 70 && type <= 79;
        }

        if(activeFilter === "tanker"){
            return type >= 80 && type <= 89;
        }

        if(activeFilter === "passenger"){
            return type >= 60 && type <= 69;
        }

        return !(
            (type >= 60 && type <= 69) ||
            (type >= 70 && type <= 79) ||
            (type >= 80 && type <= 89)
        );
    }

    function renderVesselCards(filtered){
        const grid = get("shipTrackingGrid");

        if(!grid){
            return;
        }

        if(filtered.length === 0){
            const input = get("shipTrackingSearch");
            const query = input ? input.value.trim() : "";

            grid.innerHTML =
                '<div class="ship-tracking-empty">' +
                    '<div class="ship-tracking-empty-icon">🚢</div>' +
                    '<strong>No live vessels match this view</strong>' +
                    '<span>' +
                        (
                            query
                                ? 'No loaded vessel matches "' +
                                    escapeHtml(query) +
                                    '". Pan or zoom the map to search another area.'
                                : 'Move or zoom the map to an area with AIS traffic.'
                        ) +
                    '</span>' +
                '</div>';

            return;
        }

        const visible = filtered.slice(0, CONFIG.MAX_CARD_VESSELS);

        grid.innerHTML = visible.map(function(vessel){
            return createVesselCard(vessel);
        }).join("");
    }

    function createVesselCard(vessel){
        const typeLabel = vesselTypeLabel(vessel.type);
        const status = navStatusLabel(vessel.nav_status);
        const speed = formatKnots(vessel.sog);
        const course = formatDegrees(vessel.cog);
        const position = formatCoordinates(vessel.lat, vessel.lon);
        const freshness = formatRelativeTime(vessel.ts);

        return (
            '<article class="ship-tracking-vessel-card">' +
                '<div class="ship-tracking-vessel-card-head">' +
                    '<div>' +
                        '<span class="ship-tracking-vessel-type">' +
                            escapeHtml(typeLabel) +
                        '</span>' +
                        '<h3>' +
                            escapeHtml(vessel.name || "Unknown vessel") +
                        '</h3>' +
                    '</div>' +
                    '<span class="ship-tracking-vessel-live">● LIVE</span>' +
                '</div>' +

                '<div class="ship-tracking-vessel-metrics">' +
                    metric("Speed", speed) +
                    metric("Course", course) +
                    metric("Status", status) +
                    metric("Position", position) +
                '</div>' +

                '<div class="ship-tracking-vessel-meta">' +
                    '<span>MMSI ' +
                        escapeHtml(vessel.mmsi) +
                    '</span>' +
                    (
                        vessel.imo
                            ? '<span>IMO ' +
                                escapeHtml(vessel.imo) +
                              '</span>'
                            : ""
                    ) +
                    (
                        vessel.callsign
                            ? '<span>' +
                                escapeHtml(vessel.callsign) +
                              '</span>'
                            : ""
                    ) +
                    (
                        vessel.destination
                            ? '<span>→ ' +
                                escapeHtml(vessel.destination) +
                              '</span>'
                            : ""
                    ) +
                '</div>' +

                '<div class="ship-tracking-vessel-actions">' +
                    '<button type="button" class="ship-tracking-action-btn" data-ship-details="' +
                        escapeHtml(vessel.mmsi) +
                    '">View details</button>' +

                    '<button type="button" class="ship-tracking-action-btn ship-tracking-action-secondary" data-ship-track="' +
                        escapeHtml(vessel.mmsi) +
                    '">Recent track</button>' +

                    '<span class="ship-tracking-vessel-time">' +
                        escapeHtml(freshness) +
                    '</span>' +
                '</div>' +
            '</article>'
        );
    }

    function renderMarkers(){
        if(!markerLayer){
            return;
        }

        clearMarkers();

        const filtered = getFilteredVessels();

        filtered.forEach(function(vessel){
            const marker = L.circleMarker(
                [Number(vessel.lat), Number(vessel.lon)],
                {
                    radius: selectedMmsi === String(vessel.mmsi) ? 7 : 5,
                    weight: 1.5,
                    fillOpacity: 0.75,
                    opacity: 0.9
                }
            );

            marker.on("click", function(){
                selectedMmsi = String(vessel.mmsi);
                renderMarkers();
                loadVesselDetails(vessel.mmsi, true);
            });

            marker.bindTooltip(
                escapeHtml(vessel.name || "Unknown vessel") +
                    "<br>MMSI " +
                    escapeHtml(vessel.mmsi),
                {
                    direction: "top",
                    opacity: 0.95
                }
            );

            markerLayer.addLayer(marker);
        });
    }

    function clearMarkers(){
        if(markerLayer){
            markerLayer.clearLayers();
        }
    }

    async function loadVesselDetails(mmsi, reveal){
        const numericMmsi = String(mmsi || "").trim();

        if(!/^\d{9}$/.test(numericMmsi)){
            return;
        }

        if(reveal){
            showDetailLoading("Loading vessel details…");
        }

        try{
            const response = await fetch(
                CONFIG.API +
                "?action=vessel&mmsi=" +
                encodeURIComponent(numericMmsi),
                {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    },
                    cache: "no-store"
                }
            );

            if(!response.ok){
                const body = await safeJson(response);
                throw createApiError(response, body);
            }

            const data = await response.json();

            if(!data || data.ok !== true || !data.vessel){
                throw new Error("Vessel details are unavailable.");
            }

            selectedMmsi = numericMmsi;
            renderDetail(data.vessel, data.attributions || []);
            updateAttribution(data.attributions || []);
            renderMarkers();

            if(reveal){
                scrollToDetail();
            }
        }
        catch(error){
            console.error("Ship tracking vessel detail failed:", error);

            if(reveal){
                showDetailError(getApiErrorMessage(error));
            }
        }
    }

    async function loadVesselTrack(mmsi){
        const numericMmsi = String(mmsi || "").trim();

        if(!/^\d{9}$/.test(numericMmsi)){
            return;
        }

        showDetailLoading("Loading recent vessel track…");

        const to = new Date();
        const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

        try{
            const url =
                CONFIG.API +
                "?action=track" +
                "&mmsi=" +
                encodeURIComponent(numericMmsi) +
                "&from=" +
                encodeURIComponent(from.toISOString()) +
                "&to=" +
                encodeURIComponent(to.toISOString()) +
                "&resolution=1h";

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                },
                cache: "no-store"
            });

            if(!response.ok){
                const body = await safeJson(response);
                throw createApiError(response, body);
            }

            const data = await response.json();

            if(!data || data.ok !== true || !Array.isArray(data.points)){
                throw new Error("Vessel track is unavailable.");
            }

            updateAttribution(data.attributions || []);
            renderTrackDetail(numericMmsi, data.points);
            drawTrack(data.points);
            scrollToDetail();

        }
        catch(error){
            console.error("Ship tracking vessel track failed:", error);
            showDetailError(getApiErrorMessage(error));
        }
    }

    function renderDetail(vessel, attributions){
        const detail = get("shipTrackingDetail");

        if(!detail){
            return;
        }

        detail.hidden = false;
        detail.innerHTML =
            '<div class="ship-tracking-detail-head">' +
                '<div>' +
                    '<span class="ship-tracking-vessel-type">' +
                        escapeHtml(vesselTypeLabel(vessel.type)) +
                    '</span>' +
                    '<h3>' +
                        escapeHtml(vessel.name || "Unknown vessel") +
                    '</h3>' +
                    '<span class="ship-tracking-detail-subtitle">' +
                        'MMSI ' + escapeHtml(vessel.mmsi) +
                    '</span>' +
                '</div>' +
                '<button type="button" class="ship-tracking-detail-close" id="shipTrackingDetailClose">✕</button>' +
            '</div>' +

            '<div class="ship-tracking-detail-grid">' +
                metric("IMO", vessel.imo || "—") +
                metric("Call sign", vessel.callsign || "—") +
                metric("Destination", vessel.destination || "—") +
                metric("ETA", vessel.eta || "—") +
                metric("Speed", formatKnots(vessel.sog)) +
                metric("Course", formatDegrees(vessel.cog)) +
                metric("Heading", formatDegrees(vessel.heading)) +
                metric("Navigation", navStatusLabel(vessel.nav_status)) +
                metric("Position", formatCoordinates(vessel.lat, vessel.lon)) +
                metric("Draft", formatMeters(vessel.draught)) +
                metric("Length", formatMeters(vessel.length)) +
                metric("Beam", formatMeters(vessel.beam)) +
            '</div>' +

            '<div class="ship-tracking-detail-actions">' +
                '<button type="button" class="ship-tracking-action-btn" data-ship-track="' +
                    escapeHtml(vessel.mmsi) +
                '">📈 Load recent 24h track</button>' +
                '<span class="ship-tracking-detail-note">' +
                    'AIS position data is informational and not a navigational aid.' +
                '</span>' +
            '</div>';

        const close = get("shipTrackingDetailClose");

        if(close){
            close.addEventListener("click", function(){
                detail.hidden = true;
                selectedMmsi = "";
                renderMarkers();
            });
        }

        if(Array.isArray(attributions) && attributions.length){
            updateAttribution(attributions);
        }
    }

    function renderTrackDetail(mmsi, points){
        const detail = get("shipTrackingDetail");

        if(!detail){
            return;
        }

        detail.hidden = false;

        const first = points[0];
        const last = points[points.length - 1];

        detail.innerHTML =
            '<div class="ship-tracking-detail-head">' +
                '<div>' +
                    '<span class="ship-tracking-vessel-type">Recent track</span>' +
                    '<h3>24-hour movement history</h3>' +
                    '<span class="ship-tracking-detail-subtitle">' +
                        'MMSI ' + escapeHtml(mmsi) +
                    '</span>' +
                '</div>' +
                '<button type="button" class="ship-tracking-detail-close" id="shipTrackingDetailClose">✕</button>' +
            '</div>' +

            '<div class="ship-tracking-detail-grid">' +
                metric("Track points", String(points.length)) +
                metric("Start", first ? formatRelativeTime(first.ts) : "—") +
                metric("Latest", last ? formatRelativeTime(last.ts) : "—") +
                metric("Resolution", "1 hour") +
                metric("Latest position", last ? formatCoordinates(last.lat, last.lon) : "—") +
                metric("Latest speed", last ? formatKnots(last.sog) : "—") +
            '</div>' +

            (
                points.length
                    ? '<div class="ship-tracking-track-note">The map now shows the recorded positions returned for this vessel.</div>'
                    : '<div class="ship-tracking-track-note">No recorded positions were returned for the selected period.</div>'
            );

        const close = get("shipTrackingDetailClose");

        if(close){
            close.addEventListener("click", function(){
                detail.hidden = true;
            });
        }
    }

    function drawTrack(points){
        if(!map || !Array.isArray(points) || points.length === 0){
            return;
        }

        const latLngs = points
            .map(function(point){
                return [
                    Number(point.lat),
                    Number(point.lon)
                ];
            })
            .filter(function(pair){
                return Number.isFinite(pair[0]) && Number.isFinite(pair[1]);
            });

        if(latLngs.length === 0){
            return;
        }

        if(window.__worthItShipTrackLayer){
            map.removeLayer(window.__worthItShipTrackLayer);
        }

        window.__worthItShipTrackLayer =
            L.polyline(
                latLngs,
                {
                    weight: 3,
                    opacity: 0.85,
                    lineJoin: "round"
                }
            ).addTo(map);

        const bounds = L.latLngBounds(latLngs);

        if(bounds.isValid()){
            map.fitBounds(bounds, {
                padding: [28, 28],
                maxZoom: 10
            });
        }
    }

    function showDetailLoading(message){
        const detail = get("shipTrackingDetail");

        if(!detail){
            return;
        }

        detail.hidden = false;
        detail.innerHTML =
            '<div class="ship-tracking-detail-loading">' +
                '<span>🚢</span>' +
                '<strong>' +
                    escapeHtml(message) +
                '</strong>' +
            '</div>';
    }

    function showDetailError(message){
        const detail = get("shipTrackingDetail");

        if(!detail){
            return;
        }

        detail.hidden = false;
        detail.innerHTML =
            '<div class="ship-tracking-detail-loading">' +
                '<span>⚠️</span>' +
                '<strong>' +
                    escapeHtml(message) +
                '</strong>' +
            '</div>';
    }

    function scrollToDetail(){
        const detail = get("shipTrackingDetail");

        if(detail){
            detail.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    }

    function startAutoRefresh(){
        if(autoRefreshTimer){
            return;
        }

        autoRefreshTimer = window.setInterval(function(){
            if(
                get("shipTrackingSection") &&
                get("shipTrackingSection").style.display !== "none"
            ){
                scheduleMapLoad(true);
            }
        }, CONFIG.AUTO_REFRESH_MS);

        mapBaseRefreshTimer = window.setInterval(function(){
            if(
                get("shipTrackingSection") &&
                get("shipTrackingSection").style.display !== "none"
            ){
                refreshSatelliteBaseLayer();
            }
        }, CONFIG.MAP_BASE_REFRESH_MS);
    }

    function updateAttribution(attributions){
        const target = get("shipTrackingAttributionText");

        if(!target){
            return;
        }

        const unique = [];

        (Array.isArray(attributions) ? attributions : []).forEach(function(item){
            const value = String(item || "").trim();

            if(value && !unique.includes(value)){
                unique.push(value);
            }
        });

        target.textContent =
            unique.length
                ? unique.join(" · ")
                : "AIS source attribution will appear with the live vessel data.";
    }

    function setStatus(primary, secondary){
        const status = get("shipTrackingStatus");
        const hint = document.querySelector(".ship-tracking-status-hint");

        if(status){
            status.textContent = primary || "";
        }

        if(hint){
            hint.textContent = secondary || "";
        }
    }

    function getViewportMax(zoom){
        if(zoom <= 3){
            return 400;
        }

        if(zoom === 4){
            return 650;
        }

        if(zoom === 5){
            return 800;
        }

        return CONFIG.MAX_INITIAL_VESSELS;
    }

    function formatViewportSize(bounds){
        const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth());
        const lonSpan = Math.abs(bounds.getEast() - bounds.getWest());

        return latSpan.toFixed(0) +
            "° × " +
            lonSpan.toFixed(0) +
            "°";
    }

    function metric(label, value){
        return (
            '<div class="ship-tracking-metric">' +
                '<span>' +
                    escapeHtml(label) +
                '</span>' +
                '<strong>' +
                    escapeHtml(value == null ? "—" : value) +
                '</strong>' +
            '</div>'
        );
    }

    function vesselTypeLabel(type){
        const value = Number(type);

        if(value >= 60 && value <= 69){
            return "Passenger";
        }

        if(value >= 70 && value <= 79){
            return "Cargo";
        }

        if(value >= 80 && value <= 89){
            return "Tanker";
        }

        if(value >= 90 && value <= 99){
            return "Other service";
        }

        return Number.isFinite(value)
            ? "AIS type " + value
            : "Vessel";
    }

    function navStatusLabel(status){
        const map = {
            0: "Under way",
            1: "At anchor",
            2: "Not under command",
            3: "Restricted manoeuvrability",
            4: "Constrained by draught",
            5: "Moored",
            6: "Aground",
            7: "Engaged in fishing",
            8: "Under way sailing",
            9: "Reserved",
            10: "Reserved",
            11: "Reserved",
            12: "Reserved",
            13: "Reserved",
            14: "AIS-SART active",
            15: "Not defined"
        };

        const value = Number(status);

        return Object.prototype.hasOwnProperty.call(map, value)
            ? map[value]
            : "—";
    }

    function formatKnots(value){
        const number = Number(value);

        return Number.isFinite(number)
            ? number.toFixed(1) + " kn"
            : "—";
    }

    function formatDegrees(value){
        const number = Number(value);

        return Number.isFinite(number)
            ? Math.round(number) + "°"
            : "—";
    }

    function formatMeters(value){
        const number = Number(value);

        return Number.isFinite(number)
            ? number.toFixed(number >= 100 ? 0 : 1) + " m"
            : "—";
    }

    function formatCoordinates(lat, lon){
        const latitude = Number(lat);
        const longitude = Number(lon);

        if(!Number.isFinite(latitude) || !Number.isFinite(longitude)){
            return "—";
        }

        return (
            latitude.toFixed(4) +
            "°, " +
            longitude.toFixed(4) +
            "°"
        );
    }

    function formatRelativeTime(value){
        const date = new Date(value);

        if(Number.isNaN(date.getTime())){
            return "—";
        }

        const seconds = Math.max(
            0,
            Math.round((Date.now() - date.getTime()) / 1000)
        );

        if(seconds < 60){
            return "Just now";
        }

        const minutes = Math.round(seconds / 60);

        if(minutes < 60){
            return minutes + " min ago";
        }

        const hours = Math.round(minutes / 60);

        if(hours < 24){
            return hours + " h ago";
        }

        return Math.round(hours / 24) + " d ago";
    }

    function formatTime(value){
        const date = new Date(value);

        if(Number.isNaN(date.getTime())){
            return "—";
        }

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }

    function round(value, decimals){
        const factor = Math.pow(10, decimals);

        return Math.round(
            Number(value) * factor
        ) / factor;
    }

    function safeJson(response){
        return response
            .json()
            .catch(function(){
                return null;
            });
    }

    function createApiError(response, body){
        const code =
            body &&
            body.error &&
            typeof body.error.code === "string"
                ? body.error.code
                : "";

        const message =
            body &&
            body.error &&
            typeof body.error.message === "string"
                ? body.error.message
                : "";

        const error = new Error(
            message ||
            "Ship tracking API returned HTTP " +
            response.status
        );

        error.name = code || "ApiError";
        error.status = response.status;
        return error;
    }

    function getApiErrorMessage(error){
        if(error && error.name === "rate_limited"){
            return "Ship tracking is rate limited temporarily. Please wait a moment and keep the map area focused.";
        }

        if(error && error.name === "not_configured"){
            return "Ship tracking API is not configured yet. Add the Pelyr API key in Cloudflare.";
        }

        return (
            error &&
            error.message
                ? error.message
                : "Live AIS vessel data is temporarily unavailable."
        );
    }

    function escapeHtml(value){
        return String(
            value == null
                ? ""
                : value
        )
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    window.initShipTrackingUI = init;
    window.refreshShipTrackingMap = prepareVisibleMap;

    if(document.readyState === "loading"){
        document.addEventListener(
            "DOMContentLoaded",
            init,
            {once: true}
        );
    }else{
        init();
    }

})();