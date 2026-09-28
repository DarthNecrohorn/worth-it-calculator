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
        MAP_LOAD_DEBOUNCE_MS: 850,
        MAP_REQUEST_MIN_INTERVAL_MS: 5200,
        MAP_REUSE_CENTER_RATIO: 0.25,
        AUTO_REFRESH_MS: 45000,
        MAP_BASE_REFRESH_MS: 21600000,
        SEARCH_DEBOUNCE_MS: 220,
        REQUEST_TIMEOUT_MS: 20000,
        OVERLAP_DISTANCE_PX: 18,
        CLUSTER_MIN_ZOOM: 3,
        CLUSTER_MAX_DISTANCE_PX: 30,
        /* Marker work is adaptive to the device; no fixed batch is needed here. */
    };

    let map = null;
    let autoRefreshTimer = null;
    let mapBaseRefreshTimer = null;
    let mapLoadTimer = null;
    let searchTimer = null;
    let mapRequestInFlight = false;
    let mapRateLimitUntil = 0;
    let lastSuccessfulViewport = null;
    let selectedMmsi = "";
    let activeFilter = "all";
    let vessels = [];
    let lastViewportKey = "";
    let lastLoadAt = 0;
    let currentRequestController = null;
    let overlapPicker = null;
    let shipCanvasPane = null;
    let shipCanvas = null;
    let shipCanvasContext = null;
    let shipCanvasTooltip = null;
    let shipCanvasItems = [];
    let shipCanvasHitGrid = new Map();
    let shipCanvasRenderToken = 0;
    let shipCanvasRenderFrame = null;
    let shipCanvasHoverFrame = null;
    let shipCanvasPointerEvent = null;
    let shipCanvasHoverMmsi = "";
    let cardRenderSignature = "";
    let cardRenderFrame = null;

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
        setupDetailModal();
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
            closeOverlapPicker();

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

                closeOverlapPicker();
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
    function setupDetailModal(){
        const overlay = get("shipTrackingDetail");

        if(!overlay || overlay.dataset.ready === "true"){
            return;
        }

        overlay.dataset.ready = "true";

        overlay.addEventListener("click", function(event){
            if(event.target === overlay){
                closeDetailModal();
                return;
            }

            const closeButton =
                event.target.closest("#shipTrackingDetailClose");

            if(closeButton && overlay.contains(closeButton)){
                event.preventDefault();
                closeDetailModal();
                return;
            }

            const detailsButton =
                event.target.closest("[data-ship-details]");

            if(detailsButton && overlay.contains(detailsButton)){
                event.preventDefault();

                const mmsi =
                    String(
                        detailsButton.dataset.shipDetails || ""
                    ).trim();

                if(/^\d{9}$/.test(mmsi)){
                    loadVesselDetails(mmsi, true);
                }

                return;
            }

            const trackButton =
                event.target.closest("[data-ship-track]");

            if(trackButton && overlay.contains(trackButton)){
                event.preventDefault();
                loadVesselTrack(
                    trackButton.dataset.shipTrack || ""
                );
            }
        });

        if(document.documentElement.dataset.shipTrackingKeyboard !== "true"){
            document.documentElement.dataset.shipTrackingKeyboard = "true";

            document.addEventListener("keydown", function(event){
                const detail = get("shipTrackingDetail");

                if(
                    event.key === "Escape" &&
                    detail &&
                    detail.classList.contains("open")
                ){
                    closeDetailModal();
                }
            });
        }
    }

    function openDetailModal(){
        const detail = get("shipTrackingDetail");

        if(!detail){
            return;
        }

        detail.hidden = false;
        detail.classList.add("open");
        detail.setAttribute("aria-hidden", "false");

        document.body.classList.add(
            "ship-tracking-modal-open"
        );
    }

    function closeDetailModal(){
        const detail = get("shipTrackingDetail");

        if(!detail){
            return;
        }

        detail.classList.remove("open");
        detail.hidden = true;
        detail.setAttribute("aria-hidden", "true");

        document.body.classList.remove(
            "ship-tracking-modal-open"
        );

        selectedMmsi = "";
        renderMarkers();
    }

    function setDetailContent(content){
        const detail = get("shipTrackingDetail");

        if(!detail){
            return;
        }

        detail.innerHTML =
            '<div class="ship-tracking-detail-card">' +
                content +
            '</div>';

        openDetailModal();

        const card =
            detail.querySelector(".ship-tracking-detail-card");

        if(card){
            card.scrollTop = 0;
        }
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
            zoomAnimation: false,
            fadeAnimation: false,
            markerZoomAnimation: false,
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

        setupShipCanvasLayer();

        map.on("movestart zoomstart", function(){
            closeOverlapPicker();
        });

        map.on("move zoom", function(){
            scheduleShipCanvasDraw();
        });

        map.on("moveend zoomend", function(){
            closeShipCanvasTooltip();
            scheduleShipCanvasDraw();
            scheduleMapLoad(false);
        });

        map.on("resize", function(){
            scheduleShipCanvasDraw();
        });

        window.addEventListener(
            "worthitsettingschange",
            function(){
                scheduleShipCanvasDraw();
            }
        );

        window.setTimeout(function(){
            if(map){
                map.invalidateSize({
                    pan: false
                });
            }
        }, 50);
    }

    let defaultMapLayer = null;
    let satelliteLayer = null;
    let activeBaseMap = "default";

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

            activeBaseMap = "satellite";
        }else{
            if(satelliteLayer){
                map.removeLayer(satelliteLayer);
            }

            activeBaseMap = "default";

            if(defaultMapLayer && !map.hasLayer(defaultMapLayer)){
                defaultMapLayer.addTo(map);
            }

            if(defaultMapLayer){
                defaultMapLayer.bringToBack();
            }
        }

        bringVesselMarkersToFront();
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

        bringVesselMarkersToFront();

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
        scheduleMapLoadAfter(
            force ? 20 : CONFIG.MAP_LOAD_DEBOUNCE_MS,
            Boolean(force)
        );
    }

    function scheduleMapLoadAfter(delay, force){
        window.clearTimeout(mapLoadTimer);

        mapLoadTimer = window.setTimeout(function(){
            loadVisibleVessels(Boolean(force));
        }, Math.max(20, Number(delay) || 20));
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

        if(mapRateLimitUntil > now){
            scheduleMapLoadAfter(
                mapRateLimitUntil - now + 250,
                true
            );
            return;
        }

        if(mapRequestInFlight){
            return;
        }

        if(
            !force &&
            shouldReuseSuccessfulViewport(
                bounds,
                zoom
            )
        ){
            return;
        }

        const elapsedSinceLastRequest =
            now - lastLoadAt;

        if(
            lastLoadAt > 0 &&
            elapsedSinceLastRequest <
                CONFIG.MAP_REQUEST_MIN_INTERVAL_MS
        ){
            scheduleMapLoadAfter(
                CONFIG.MAP_REQUEST_MIN_INTERVAL_MS -
                    elapsedSinceLastRequest +
                    40,
                force
            );
            return;
        }

        lastViewportKey = viewportKey;
        lastLoadAt = now;
        mapRequestInFlight = true;

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

            closeOverlapPicker();
            vessels = data.vessels;

            lastSuccessfulViewport = {
                zoom,
                centerLat: bounds.getCenter().lat,
                centerLon: bounds.getCenter().lng,
                latSpan: Math.abs(
                    bounds.getNorth() -
                    bounds.getSouth()
                ),
                lonSpan: Math.abs(
                    bounds.getEast() -
                    bounds.getWest()
                )
            };

            updateAttribution(data.attributions || []);
            renderVesselView();

            const truncationText =
                data.truncated
                    ? " · View is capped; zoom in for more"
                    : "";

            const sourceStatus =
                data.source_status || {};

            const activeSources =
                Array.isArray(data.sources_used)
                    ? data.sources_used
                    : [];

            const sourceParts = [];

            if(activeSources.includes("Pelyr")){
                sourceParts.push("Pelyr");
            }

            if(activeSources.includes("EuRIS")){
                sourceParts.push("EuRIS");
            }else if(
                sourceStatus.EuRIS &&
                sourceStatus.EuRIS.enabled
            ){
                sourceParts.push(
                    "EuRIS connected · 0 usable vessels"
                );
            }

            const sourceHint =
                sourceParts.length
                    ? "Sources: " + sourceParts.join(" + ")
                    : "Sources: —";

            setStatus(
                data.vessels.length +
                    " live vessel" +
                    (data.vessels.length === 1 ? "" : "s") +
                    " in the current map area" +
                    truncationText,
                sourceHint +
                    " · Updated " +
                    formatTime(data.generated_at)
            );

        }
        catch(error){
            if(error && error.name === "AbortError"){
                return;
            }

            if(error && error.name === "rate_limited"){
                const retryAfterMs =
                    Number(error.retryAfterMs) > 0
                        ? Number(error.retryAfterMs)
                        : 6200;

                mapRateLimitUntil =
                    Math.max(
                        mapRateLimitUntil,
                        Date.now() + retryAfterMs
                    );

                setStatus(
                    getApiErrorMessage(error),
                    "New live requests are paused until the provider cooldown expires."
                );

                scheduleMapLoadAfter(
                    retryAfterMs + 250,
                    true
                );
            }else{
                console.error(
                    "Ship tracking vessel load failed:",
                    error
                );

                setStatus(
                    getApiErrorMessage(error),
                    "The map will keep its last successful data when available."
                );
            }

            if(vessels.length === 0){
                renderVesselCards([]);
            }
        }
        finally{
            window.clearTimeout(timeout);
            currentRequestController = null;
            mapRequestInFlight = false;
        }
    }

    function shouldReuseSuccessfulViewport(bounds, zoom){
        if(
            !lastSuccessfulViewport ||
            !bounds
        ){
            return false;
        }

        if(
            Math.abs(
                Number(zoom) -
                Number(lastSuccessfulViewport.zoom)
            ) >= 0.5
        ){
            return false;
        }

        const center =
            bounds.getCenter();

        const latSpan =
            Math.max(
                0.0001,
                Number(lastSuccessfulViewport.latSpan) || 0.0001
            );

        const lonSpan =
            Math.max(
                0.0001,
                Number(lastSuccessfulViewport.lonSpan) || 0.0001
            );

        const latDelta =
            Math.abs(
                center.lat -
                Number(lastSuccessfulViewport.centerLat)
            );

        const lonDelta =
            Math.abs(
                center.lng -
                Number(lastSuccessfulViewport.centerLon)
            );

        return (
            latDelta <=
                latSpan *
                CONFIG.MAP_REUSE_CENTER_RATIO &&
            lonDelta <=
                lonSpan *
                CONFIG.MAP_REUSE_CENTER_RATIO
        );
    }

    function renderVesselView(){
        const filtered = getFilteredVessels();

        renderMarkers();
        scheduleVesselCards(filtered);
    }

    function scheduleVesselCards(filtered){
        if(
            cardRenderFrame !== null &&
            typeof window.cancelAnimationFrame === "function"
        ){
            window.cancelAnimationFrame(cardRenderFrame);
            cardRenderFrame = null;
        }

        if(
            typeof window.cancelIdleCallback === "function" &&
            typeof window.requestIdleCallback === "function"
        ){
            cardRenderFrame =
                window.requestIdleCallback(
                    function(){
                        cardRenderFrame = null;
                        renderVesselCards(filtered);
                    },
                    {timeout: 300}
                );
            return;
        }

        if(
            typeof window.requestAnimationFrame === "function"
        ){
            cardRenderFrame =
                window.requestAnimationFrame(function(){
                    cardRenderFrame = null;
                    renderVesselCards(filtered);
                });
            return;
        }

        renderVesselCards(filtered);
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

        const input = get("shipTrackingSearch");
        const query = input ? input.value.trim() : "";

        const visible = filtered.slice(
            0,
            CONFIG.MAX_CARD_VESSELS
        );

        const signature =
            activeFilter +
            "|" +
            query +
            "|" +
            visible.map(function(vessel){
                const timestamp =
                    new Date(vessel.ts).getTime();

                return [
                    vessel.mmsi,
                    vessel.name,
                    vessel.type,
                    vessel.nav_status,
                    vessel.sog,
                    vessel.cog,
                    vessel.lat,
                    vessel.lon,
                    vessel.imo,
                    vessel.callsign,
                    vessel.destination,
                    Number.isFinite(timestamp)
                        ? Math.floor(timestamp / 60000)
                        : ""
                ].map(function(value){
                    return String(
                        value == null ? "" : value
                    );
                }).join("~");
            }).join("||");

        if(signature === cardRenderSignature){
            return;
        }

        cardRenderSignature = signature;

        if(filtered.length === 0){
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
        if(!map){
            return;
        }

        const filtered =
            getFilteredVessels();

        scheduleShipCanvasDraw(
            filtered
        );
    }

    function setupShipCanvasLayer(){
        if(
            !map ||
            typeof L === "undefined" ||
            shipCanvas
        ){
            return;
        }

        if(
            typeof map.createPane !== "function"
        ){
            return;
        }

        shipCanvas =
            document.createElement(
                "canvas"
            );

        shipCanvas.style.zIndex =
            "610";

        shipCanvas.className =
            "ship-tracking-vessel-canvas";

        shipCanvas.setAttribute(
            "aria-label",
            "Interactive live vessel positions"
        );

        shipCanvas.tabIndex = -1;

        shipCanvasContext =
            shipCanvas.getContext(
                "2d",
                {
                    alpha: true
                }
            );

        if(!shipCanvasContext){
            shipCanvas = null;
            shipCanvasPane = null;
            return;
        }

        map.getContainer().appendChild(
            shipCanvas
        );

        shipCanvasTooltip =
            document.createElement(
                "div"
            );

        shipCanvasTooltip.className =
            "ship-tracking-canvas-tooltip";

        shipCanvasTooltip.setAttribute(
            "role",
            "tooltip"
        );

        shipCanvasTooltip.hidden = true;

        map.getContainer().appendChild(
            shipCanvasTooltip
        );

        shipCanvas.addEventListener(
            "click",
            function(event){
                const point =
                    getCanvasEventContainerPoint(
                        event
                    );

                const hit =
                    findCanvasVessel(
                        point
                    );

                if(!hit){
                    return;
                }

                if(
                    event.cancelable
                ){
                    event.preventDefault();
                }

                event.stopPropagation();

                handleCanvasVesselClick(
                    hit
                );
            }
        );

        shipCanvas.addEventListener(
            "pointermove",
            function(event){
                if(
                    event.pointerType ===
                    "touch"
                ){
                    return;
                }

                shipCanvasPointerEvent =
                    event;

                if(
                    shipCanvasHoverFrame !==
                    null
                ){
                    return;
                }

                if(
                    typeof window.requestAnimationFrame ===
                    "function"
                ){
                    shipCanvasHoverFrame =
                        window.requestAnimationFrame(
                            updateCanvasHover
                        );
                }else{
                    shipCanvasHoverFrame =
                        window.setTimeout(
                            updateCanvasHover,
                            16
                        );
                }
            }
        );

        shipCanvas.addEventListener(
            "pointerleave",
            function(){
                shipCanvasPointerEvent =
                    null;

                if(shipCanvas){
                    shipCanvas.style.cursor =
                        "";
                }

                closeShipCanvasTooltip();
            }
        );

        shipCanvas.addEventListener(
            "pointercancel",
            function(){
                shipCanvasPointerEvent =
                    null;

                closeShipCanvasTooltip();
            }
        );

        scheduleShipCanvasDraw();
    }

    function scheduleShipCanvasDraw(filtered){
        if(!map || !shipCanvas){
            return;
        }

        if(
            !Array.isArray(filtered)
        ){
            filtered =
                getFilteredVessels();
        }

        const items =
            filtered.filter(function(vessel){
                const lat =
                    Number(vessel.lat);

                const lon =
                    Number(vessel.lon);

                return (
                    Number.isFinite(lat) &&
                    Number.isFinite(lon)
                );
            });

        shipCanvasRenderToken += 1;

        if(
            shipCanvasRenderFrame !==
            null &&
            typeof window.cancelAnimationFrame ===
            "function"
        ){
            window.cancelAnimationFrame(
                shipCanvasRenderFrame
            );

            shipCanvasRenderFrame =
                null;
        }

        const token =
            shipCanvasRenderToken;

        const draw =
            function(){
                shipCanvasRenderFrame =
                    null;

                if(
                    token !==
                    shipCanvasRenderToken
                ){
                    return;
                }

                drawShipCanvas(
                    items
                );
            };

        if(
            typeof window.requestAnimationFrame ===
            "function"
        ){
            shipCanvasRenderFrame =
                window.requestAnimationFrame(
                    draw
                );
        }else{
            shipCanvasRenderFrame =
                window.setTimeout(
                    draw,
                    16
                );
        }
    }

    function getShipCanvasPixelRatio(){
        const dpr =
            Number(
                window.devicePixelRatio
            ) || 1;

        const nav =
            typeof navigator !==
            "undefined"
                ? navigator
                : null;

        const cores =
            nav &&
            Number.isFinite(
                Number(
                    nav.hardwareConcurrency
                )
            )
                ? Number(
                    nav.hardwareConcurrency
                )
                : 8;

        const memory =
            nav &&
            Number.isFinite(
                Number(
                    nav.deviceMemory
                )
            )
                ? Number(
                    nav.deviceMemory
                )
                : 8;

        if(
            cores <= 4 ||
            memory <= 4
        ){
            return Math.min(
                dpr,
                1
            );
        }

        if(
            cores <= 6 ||
            memory <= 8
        ){
            return Math.min(
                dpr,
                1.5
            );
        }

        return Math.min(
            dpr,
            2
        );
    }

    function getShipClusterDistancePx(){
        if(!map){
            return CONFIG.CLUSTER_MAX_DISTANCE_PX;
        }

        const zoom =
            Number(map.getZoom());

        if(!Number.isFinite(zoom)){
            return 24;
        }

        if(zoom >= 12){
            return 16;
        }

        if(zoom >= 10){
            return 18;
        }

        if(zoom >= 8){
            return 21;
        }

        if(zoom >= 6){
            return 25;
        }

        if(zoom >= 4){
            return 28;
        }

        return CONFIG.CLUSTER_MAX_DISTANCE_PX;
    }

    function buildShipCanvasTargets(vesselsToDraw, width, height){
        if(!map || !Array.isArray(vesselsToDraw)){
            return [];
        }

        const projected = [];

        vesselsToDraw.forEach(function(vessel){
            const lat = Number(vessel.lat);
            const lon = Number(vessel.lon);

            if(
                !Number.isFinite(lat) ||
                !Number.isFinite(lon)
            ){
                return;
            }

            const containerPoint =
                map.latLngToContainerPoint([
                    lat,
                    lon
                ]);

            if(
                !containerPoint ||
                !Number.isFinite(containerPoint.x) ||
                !Number.isFinite(containerPoint.y)
            ){
                return;
            }

            if(
                containerPoint.x < -40 ||
                containerPoint.y < -40 ||
                containerPoint.x > width + 40 ||
                containerPoint.y > height + 40
            ){
                return;
            }

            projected.push({
                vessel,
                x: containerPoint.x,
                y: containerPoint.y,
                containerX: containerPoint.x,
                containerY: containerPoint.y
            });
        });

        if(projected.length === 0){
            return [];
        }

        const distance =
            getShipClusterDistancePx();

        const cellSize =
            Math.max(
                16,
                Math.min(
                    CONFIG.CLUSTER_MAX_DISTANCE_PX,
                    distance
                )
            );

        const buckets = new Map();
        const groups = [];

        projected.forEach(function(item){
            const gx =
                Math.floor(
                    item.containerX /
                    cellSize
                );

            const gy =
                Math.floor(
                    item.containerY /
                    cellSize
                );

            let bestGroup = null;
            let bestDistance = Infinity;

            for(let dx=-1;dx<=1;dx++){
                for(let dy=-1;dy<=1;dy++){
                    const bucket =
                        buckets.get(
                            (gx + dx) +
                            ":" +
                            (gy + dy)
                        );

                    if(!bucket){
                        continue;
                    }

                    bucket.forEach(function(group){
                        const deltaX =
                            item.containerX -
                            group.anchorX;

                        const deltaY =
                            item.containerY -
                            group.anchorY;

                        const currentDistance =
                            Math.sqrt(
                                deltaX * deltaX +
                                deltaY * deltaY
                            );

                        if(
                            currentDistance <= distance &&
                            currentDistance < bestDistance
                        ){
                            bestGroup = group;
                            bestDistance = currentDistance;
                        }
                    });
                }
            }

            if(!bestGroup){
                bestGroup = {
                    id: "cluster-" + groups.length,
                    anchorX: item.containerX,
                    anchorY: item.containerY,
                    items: []
                };

                groups.push(bestGroup);

                const key =
                    gx + ":" + gy;

                let bucket =
                    buckets.get(key);

                if(!bucket){
                    bucket = [];
                    buckets.set(key, bucket);
                }

                bucket.push(bestGroup);
            }

            bestGroup.items.push(item);
        });

        return groups.map(function(group){
            if(group.items.length === 1){
                const item =
                    group.items[0];

                return {
                    cluster: false,
                    vessel: item.vessel,
                    mmsi: String(
                        item.vessel.mmsi || ""
                    ).trim(),
                    containerX: item.containerX,
                    containerY: item.containerY,
                    x: item.x,
                    y: item.y,
                    hitRadius: 13
                };
            }

            let sumX = 0;
            let sumY = 0;
            let sumLat = 0;
            let sumLon = 0;

            group.items.forEach(function(item){
                sumX += item.x;
                sumY += item.y;
                sumLat += Number(item.vessel.lat);
                sumLon += Number(item.vessel.lon);
            });

            const count =
                group.items.length;

            return {
                cluster: true,
                clusterId: group.id,
                group: group.items.map(function(item){
                    return item.vessel;
                }),
                count,
                containerX:
                    sumX / count,
                containerY:
                    sumY / count,
                x:
                    sumX / count,
                y:
                    sumY / count,
                lat:
                    sumLat / count,
                lon:
                    sumLon / count,
                hitRadius:
                    Math.min(
                        28,
                        Math.max(
                            18,
                            14 +
                            Math.log10(count) * 7
                        )
                    )
            };
        });
    }

    function drawShipCanvas(vesselsToDraw){
        if(
            !map ||
            !shipCanvas ||
            !shipCanvasContext
        ){
            return;
        }

        const mapSize =
            map.getSize();

        const width =
            Math.max(
                1,
                Math.round(mapSize.x)
            );

        const height =
            Math.max(
                1,
                Math.round(mapSize.y)
            );

        const dpr =
            getShipCanvasPixelRatio();

        const pixelWidth =
            Math.max(
                1,
                Math.round(width * dpr)
            );

        const pixelHeight =
            Math.max(
                1,
                Math.round(height * dpr)
            );

        if(
            shipCanvas.width !==
            pixelWidth
        ){
            shipCanvas.width =
                pixelWidth;
        }

        if(
            shipCanvas.height !==
            pixelHeight
        ){
            shipCanvas.height =
                pixelHeight;
        }

        shipCanvas.style.width =
            width + "px";

        shipCanvas.style.height =
            height + "px";

        const ctx =
            shipCanvasContext;

        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

        ctx.clearRect(
            0,
            0,
            width,
            height
        );

        const rootStyle =
            getComputedStyle(
                document.documentElement
            );

        const normalColor =
            rootStyle
                .getPropertyValue(
                    "--primary2"
                )
                .trim() ||
            "#38bdf8";

        const selectedColor =
            rootStyle
                .getPropertyValue(
                    "--primary"
                )
                .trim() ||
            "#7c5cff";

        const targets =
            buildShipCanvasTargets(
                vesselsToDraw,
                width,
                height
            );

        const items = [];
        const hitGrid = new Map();
        const cellSize = 32;

        targets.forEach(function(target){
            const x = target.x;
            const y = target.y;

            ctx.save();

            if(target.cluster){
                const radius =
                    target.hitRadius - 1;

                ctx.globalAlpha = 0.96;
                ctx.shadowColor =
                    "rgba(0,0,0,.35)";
                ctx.shadowBlur = 5;
                ctx.shadowOffsetY = 1;

                ctx.fillStyle =
                    normalColor;

                ctx.beginPath();
                ctx.arc(
                    x,
                    y,
                    radius,
                    0,
                    Math.PI * 2
                );
                ctx.fill();

                ctx.shadowColor =
                    "rgba(0,0,0,0)";

                ctx.lineWidth = 2;
                ctx.strokeStyle =
                    selectedColor;

                ctx.stroke();

                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.font =
                    target.count >= 100
                        ? "900 11px Arial,sans-serif"
                        : target.count >= 10
                            ? "900 12px Arial,sans-serif"
                            : "900 13px Arial,sans-serif";

                ctx.fillText(
                    String(target.count),
                    x,
                    y
                );
            }else{
                const vessel =
                    target.vessel;

                const selected =
                    selectedMmsi ===
                    target.mmsi;

                const rotation =
                    getVesselArrowRotation(
                        vessel
                    ) *
                    Math.PI /
                    180;

                ctx.translate(x,y);
                ctx.rotate(rotation);

                ctx.globalAlpha =
                    selected
                        ? 1
                        : 0.92;

                ctx.shadowColor =
                    "rgba(0,0,0,.40)";

                ctx.shadowBlur =
                    selected ? 3 : 2;

                ctx.shadowOffsetY =
                    1;

                ctx.fillStyle =
                    selected
                        ? selectedColor
                        : normalColor;

                ctx.textAlign =
                    "center";

                ctx.textBaseline =
                    "middle";

                ctx.font =
                    selected
                        ? "900 20px Arial,sans-serif"
                        : "900 16px Arial,sans-serif";

                ctx.fillText(
                    "➤",
                    0,
                    0
                );

                if(selected){
                    ctx.shadowColor =
                        "rgba(0,0,0,0)";

                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle =
                        selectedColor;

                    ctx.beginPath();
                    ctx.arc(
                        0,
                        0,
                        10,
                        0,
                        Math.PI * 2
                    );
                    ctx.stroke();
                }
            }

            ctx.restore();

            const item = {
                cluster: Boolean(target.cluster),
                vessel: target.vessel || null,
                group: target.group || null,
                clusterId:
                    target.clusterId || "",
                count:
                    Number(target.count) || 0,
                lat:
                    Number(target.lat),
                lon:
                    Number(target.lon),
                mmsi:
                    target.mmsi || "",
                containerX:
                    target.containerX,
                containerY:
                    target.containerY,
                x,
                y,
                hitRadius:
                    target.hitRadius || 13
            };

            items.push(item);

            const gx =
                Math.floor(
                    target.containerX /
                    cellSize
                );

            const gy =
                Math.floor(
                    target.containerY /
                    cellSize
                );

            const key =
                gx + ":" + gy;

            let bucket =
                hitGrid.get(key);

            if(!bucket){
                bucket = [];
                hitGrid.set(
                    key,
                    bucket
                );
            }

            bucket.push(item);
        });

        shipCanvasItems =
            items;

        shipCanvasHitGrid =
            hitGrid;

    }

    function getCanvasEventContainerPoint(event){
        if(
            !map ||
            !event
        ){
            return null;
        }

        if(
            typeof map.mouseEventToContainerPoint ===
            "function"
        ){
            return map.mouseEventToContainerPoint(
                event
            );
        }

        const rect =
            map.getContainer()
                .getBoundingClientRect();

        return {
            x:
                event.clientX -
                rect.left,
            y:
                event.clientY -
                rect.top
        };
    }

    function findCanvasVessel(point){
        if(
            !point ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y)
        ){
            return null;
        }

        const cellSize = 32;
        const gx =
            Math.floor(
                point.x /
                cellSize
            );
        const gy =
            Math.floor(
                point.y /
                cellSize
            );

        let best = null;

        for(let dx=-1;dx<=1;dx++){
            for(let dy=-1;dy<=1;dy++){
                const bucket =
                    shipCanvasHitGrid.get(
                        (gx + dx) +
                        ":" +
                        (gy + dy)
                    );

                if(!bucket){
                    continue;
                }

                bucket.forEach(
                    function(item){
                        const deltaX =
                            item.containerX -
                            point.x;

                        const deltaY =
                            item.containerY -
                            point.y;

                        const distance =
                            Math.sqrt(
                                deltaX * deltaX +
                                deltaY * deltaY
                            );

                        if(
                            distance <=
                            (
                                item.hitRadius ||
                                13
                            ) &&
                            (
                                !best ||
                                distance <
                                best.distance
                            )
                        ){
                            best = {
                                ...item,
                                distance:
                                    distance
                            };
                        }
                    }
                );
            }
        }

        return best;
    }

    function updateCanvasHover(){
        shipCanvasHoverFrame =
            null;

        const event =
            shipCanvasPointerEvent;

        if(!event){
            return;
        }

        const point =
            getCanvasEventContainerPoint(
                event
            );

        const hit =
            findCanvasVessel(
                point
            );

        if(!hit){
            shipCanvasHoverMmsi = "";
            closeShipCanvasTooltip();

            if(shipCanvas){
                shipCanvas.style.cursor = "";
            }

            return;
        }

        if(shipCanvas){
            shipCanvas.style.cursor = "pointer";
        }

        const hoverKey =
            hit.cluster
                ? "cluster:" +
                    String(
                        hit.clusterId ||
                        ""
                    )
                : "vessel:" +
                    String(
                        hit.vessel &&
                        hit.vessel.mmsi ||
                        ""
                    ).trim();

        if(
            shipCanvasHoverMmsi !==
            hoverKey
        ){
            shipCanvasHoverMmsi =
                hoverKey;

            showShipCanvasTooltip(
                hit,
                point
            );
            return;
        }

        positionShipCanvasTooltip(
            point
        );
    }

    function showShipCanvasTooltip(
        target,
        point
    ){
        if(
            !shipCanvasTooltip ||
            !target
        ){
            return;
        }

        if(target.cluster){
            shipCanvasTooltip.innerHTML =
                '<strong>' +
                escapeHtml(
                    String(
                        target.count ||
                        target.group.length
                    ) +
                    " vessels"
                ) +
                '</strong>' +
                '<span>Click to choose a vessel</span>';
        }else{
            const vessel =
                target.vessel || {};

            shipCanvasTooltip.innerHTML =
                '<strong>' +
                escapeHtml(
                    vessel.name ||
                    "Unknown vessel"
                ) +
                '</strong>' +
                '<span>MMSI ' +
                escapeHtml(
                    vessel.mmsi ||
                    ""
                ) +
                '</span>';
        }

        shipCanvasTooltip.hidden =
            false;

        positionShipCanvasTooltip(
            point
        );
    }

    function positionShipCanvasTooltip(
        point
    ){
        if(
            !shipCanvasTooltip ||
            shipCanvasTooltip.hidden ||
            !point
        ){
            return;
        }

        const container =
            map.getContainer();

        const width =
            container.clientWidth;

        const height =
            container.clientHeight;

        const tooltipWidth =
            shipCanvasTooltip.offsetWidth;

        const tooltipHeight =
            shipCanvasTooltip.offsetHeight;

        const margin = 8;

        const left =
            Math.max(
                margin,
                Math.min(
                    width -
                    tooltipWidth -
                    margin,
                    point.x + 12
                )
            );

        const top =
            Math.max(
                margin,
                Math.min(
                    height -
                    tooltipHeight -
                    margin,
                    point.y -
                    tooltipHeight -
                    12
                )
            );

        shipCanvasTooltip.style.left =
            left + "px";

        shipCanvasTooltip.style.top =
            top + "px";
    }

    function closeShipCanvasTooltip(){
        shipCanvasHoverMmsi = "";

        if(
            shipCanvasTooltip
        ){
            shipCanvasTooltip.hidden =
                true;
        }
    }

    function handleCanvasVesselClick(target){
        if(!target){
            return;
        }

        if(target.cluster){
            selectedMmsi = "";
            closeOverlapPicker();

            const group =
                Array.isArray(target.group)
                    ? target.group
                    : [];

            const fallback =
                group.find(function(item){
                    return (
                        item &&
                        Number.isFinite(Number(item.lat)) &&
                        Number.isFinite(Number(item.lon))
                    );
                }) || null;

            const centerVessel = {
                lat:
                    Number.isFinite(Number(target.lat))
                        ? Number(target.lat)
                        : fallback
                            ? Number(fallback.lat)
                            : NaN,
                lon:
                    Number.isFinite(Number(target.lon))
                        ? Number(target.lon)
                        : fallback
                            ? Number(fallback.lon)
                            : NaN
            };

            if(
                !Number.isFinite(centerVessel.lat) ||
                !Number.isFinite(centerVessel.lon) ||
                group.length < 2
            ){
                return;
            }

            openOverlapPicker(
                centerVessel,
                group,
                true
            );

            scheduleShipCanvasDraw();
            return;
        }

        const vessel =
            target.vessel;

        if(!vessel){
            return;
        }

        const filtered =
            getFilteredVessels();

        const overlapping =
            getOverlappingVessels(
                vessel,
                filtered
            );

        if(
            overlapping.length > 1
        ){
            selectedMmsi = "";
            closeOverlapPicker();
            openOverlapPicker(
                vessel,
                overlapping,
                false
            );
            scheduleShipCanvasDraw();
            return;
        }

        selectedMmsi =
            String(vessel.mmsi || "").trim();

        closeOverlapPicker();
        renderMarkers();

        loadVesselDetails(
            vessel.mmsi,
            true
        );
    }

    function bringVesselMarkersToFront(){
        scheduleShipCanvasDraw();
    }

    function getVesselDirection(vessel){
        const heading = Number(vessel && vessel.heading);

        if(
            Number.isFinite(heading) &&
            heading >= 0 &&
            heading < 360
        ){
            return heading;
        }

        const course = Number(vessel && vessel.cog);

        if(
            Number.isFinite(course) &&
            course >= 0 &&
            course < 360
        ){
            return course;
        }

        return null;
    }

    function getVesselArrowRotation(vessel){
        const direction =
            getVesselDirection(vessel);

        return Number.isFinite(direction)
            ? direction - 90
            : -90;
    }

    function getOverlappingVessels(centerVessel, candidates){
        if(
            !map ||
            !centerVessel ||
            !Array.isArray(candidates)
        ){
            return [];
        }

        const centerLat = Number(centerVessel.lat);
        const centerLon = Number(centerVessel.lon);

        if(
            !Number.isFinite(centerLat) ||
            !Number.isFinite(centerLon)
        ){
            return;
        }

        const centerPoint =
            map.latLngToContainerPoint([
                centerLat,
                centerLon
            ]);

        if(
            !centerPoint ||
            !Number.isFinite(centerPoint.x) ||
            !Number.isFinite(centerPoint.y)
        ){
            return [centerVessel];
        }

        return candidates
            .map(function(candidate){
                if(!candidate){
                    return null;
                }

                const candidateLat = Number(candidate.lat);
                const candidateLon = Number(candidate.lon);

                if(
                    !Number.isFinite(candidateLat) ||
                    !Number.isFinite(candidateLon)
                ){
                    return null;
                }

                const point =
                    map.latLngToContainerPoint([
                        candidateLat,
                        candidateLon
                    ]);

                if(
                    !point ||
                    !Number.isFinite(point.x) ||
                    !Number.isFinite(point.y)
                ){
                    return null;
                }

                const dx =
                    point.x - centerPoint.x;

                const dy =
                    point.y - centerPoint.y;

                const distance =
                    Math.sqrt(
                        dx * dx +
                        dy * dy
                    );

                return {
                    vessel: candidate,
                    distance
                };
            })
            .filter(function(item){
                return (
                    item &&
                    Number.isFinite(item.distance) &&
                    item.distance <=
                        CONFIG.OVERLAP_DISTANCE_PX
                );
            })
            .sort(function(a,b){
                return a.distance - b.distance;
            })
            .map(function(item){
                return item.vessel;
            });
    }

    function openOverlapPicker(centerVessel, group, isCluster){
        if(
            !map ||
            !centerVessel ||
            !Array.isArray(group) ||
            group.length < 2
        ){
            return;
        }

        const centerLat = Number(centerVessel.lat);
        const centerLon = Number(centerVessel.lon);

        if(
            !Number.isFinite(centerLat) ||
            !Number.isFinite(centerLon)
        ){
            return;
        }

        const mapElement =
            map.getContainer();

        if(!mapElement){
            return;
        }

        closeOverlapPicker();

        const picker =
            document.createElement("div");

        picker.className =
            "ship-tracking-overlap-picker";

        picker.setAttribute(
            "role",
            "dialog"
        );

        picker.setAttribute(
            "aria-label",
            group.length +
            (
                isCluster
                    ? " vessels in this area"
                    : " vessels at this location"
            )
        );

        picker.innerHTML =
            '<div class="ship-tracking-overlap-head">' +
                '<div>' +
                    '<strong>' +
                        group.length +
                        (
                            isCluster
                                ? ' vessels in this area'
                                : ' vessels at this location'
                        ) +
                    '</strong>' +
                    '<span>Select a vessel</span>' +
                '</div>' +
                '<button type="button" class="ship-tracking-overlap-close" data-overlap-close aria-label="Close">✕</button>' +
            '</div>' +
            '<div class="ship-tracking-overlap-grid">' +
                group.map(function(item){
                    const rotation =
                        getVesselArrowRotation(item);

                    const name =
                        item.name ||
                        "Unknown vessel";

                    return (
                        '<button type="button" class="ship-tracking-overlap-item" data-overlap-mmsi="' +
                            escapeHtml(item.mmsi) +
                            '" title="' +
                            escapeHtml(name) +
                            '">' +
                            '<span class="ship-tracking-overlap-arrow" style="--ship-arrow-rotation:' +
                                rotation.toFixed(2) +
                                'deg;">➤</span>' +
                            '<span class="ship-tracking-overlap-name">' +
                                escapeHtml(name) +
                            '</span>' +
                            '<span class="ship-tracking-overlap-mmsi">' +
                                escapeHtml(item.mmsi.slice(-4)) +
                            '</span>' +
                        '</button>'
                    );
                }).join("") +
            '</div>';

        const point =
            map.latLngToContainerPoint([
                centerLat,
                centerLon
            ]);

        if(
            !point ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y)
        ){
            return;
        }

        picker.style.left =
            point.x + "px";

        picker.style.top =
            point.y + "px";

        picker.addEventListener(
            "wheel",
            function(event){
                /*
                 * Keep the mouse wheel inside the vessel picker.
                 * Otherwise Leaflet receives the bubbled wheel event,
                 * zooms the map, and the picker closes on map movement.
                 */
                event.stopPropagation();
            },
            {
                capture: true,
                passive: true
            }
        );

        ["pointerdown","mousedown","dblclick"].forEach(function(eventName){
            picker.addEventListener(
                eventName,
                function(event){
                    event.stopPropagation();
                },
                {
                    capture: true
                }
            );
        });

        picker.addEventListener(
            "click",
            function(event){
                const closeButton =
                    event.target.closest(
                        "[data-overlap-close]"
                    );

                if(closeButton){
                    event.preventDefault();
                    closeOverlapPicker();
                    return;
                }

                const item =
                    event.target.closest(
                        "[data-overlap-mmsi]"
                    );

                if(!item){
                    return;
                }

                event.preventDefault();

                const mmsi =
                    String(
                        item.dataset.overlapMmsi || ""
                    ).trim();

                closeOverlapPicker();

                if(!/^\d{9}$/.test(mmsi)){
                    return;
                }

                selectedMmsi = mmsi;
                renderMarkers();
                loadVesselDetails(
                    mmsi,
                    true
                );
            }
        );

        mapElement.appendChild(picker);

        overlapPicker = picker;

        requestAnimationFrame(function(){
            if(
                !overlapPicker ||
                overlapPicker !== picker
            ){
                return;
            }

            const width =
                mapElement.clientWidth;

            const height =
                mapElement.clientHeight;

            const margin = 8;
            const pickerWidth =
                picker.offsetWidth;

            const pickerHeight =
                picker.offsetHeight;

            const halfWidth =
                pickerWidth / 2;

            const halfHeight =
                pickerHeight / 2;

            const clampedX =
                Math.max(
                    halfWidth + margin,
                    Math.min(
                        width - halfWidth - margin,
                        point.x
                    )
                );

            const clampedY =
                Math.max(
                    halfHeight + margin,
                    Math.min(
                        height - halfHeight - margin,
                        point.y
                    )
                );

            picker.style.left =
                clampedX + "px";

            picker.style.top =
                clampedY + "px";
        });
    }

    function closeOverlapPicker(){
        if(!overlapPicker){
            return;
        }

        if(
            overlapPicker.parentNode
        ){
            overlapPicker.parentNode.removeChild(
                overlapPicker
            );
        }

        overlapPicker = null;
    }

    function clearMarkers(){
        shipCanvasRenderToken += 1;

        if(
            shipCanvasRenderFrame !== null &&
            typeof window.cancelAnimationFrame ===
            "function"
        ){
            window.cancelAnimationFrame(
                shipCanvasRenderFrame
            );

            shipCanvasRenderFrame = null;
        }

        if(
            shipCanvasHoverFrame !== null &&
            typeof window.cancelAnimationFrame ===
            "function"
        ){
            window.cancelAnimationFrame(
                shipCanvasHoverFrame
            );

            shipCanvasHoverFrame = null;
        }

        shipCanvasPointerEvent = null;
        closeShipCanvasTooltip();

        shipCanvasItems = [];
        shipCanvasHitGrid = new Map();

        if(
            shipCanvasContext &&
            shipCanvas
        ){
            const width =
                shipCanvas.clientWidth ||
                0;

            const height =
                shipCanvas.clientHeight ||
                0;

            if(width > 0 && height > 0){
                shipCanvasContext.clearRect(
                    0,
                    0,
                    width,
                    height
                );
            }
        }

        if(
            cardRenderFrame !== null &&
            typeof window.cancelIdleCallback ===
            "function"
        ){
            window.cancelIdleCallback(
                cardRenderFrame
            );

            cardRenderFrame = null;
        }

        if(
            cardRenderFrame !== null &&
            typeof window.cancelAnimationFrame ===
            "function"
        ){
            window.cancelAnimationFrame(
                cardRenderFrame
            );

            cardRenderFrame = null;
        }
    }

    function findLoadedVessel(mmsi){
        const numericMmsi =
            String(mmsi || "").trim();

        return vessels.find(function(vessel){
            return String(
                vessel && vessel.mmsi || ""
            ).trim() === numericMmsi;
        }) || null;
    }

    async function loadVesselDetails(mmsi, reveal){
        const numericMmsi = String(mmsi || "").trim();

        if(!/^\d{9}$/.test(numericMmsi)){
            return;
        }

        const localVessel =
            findLoadedVessel(
                numericMmsi
            );

        if(localVessel){
            selectedMmsi =
                numericMmsi;

            renderDetail(
                localVessel,
                []
            );

            renderMarkers();

            if(reveal){
                scrollToDetail();
            }

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

            const localVessel =
                findLoadedVessel(
                    numericMmsi
                );

            if(localVessel){
                selectedMmsi =
                    numericMmsi;

                renderDetail(
                    localVessel,
                    []
                );

                renderMarkers();

                if(reveal){
                    scrollToDetail();
                }

                return;
            }

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
        setDetailContent(
            '<div class="ship-tracking-detail-head">' +
                '<div>' +
                    '<span class="ship-tracking-vessel-type">' +
                        escapeHtml(vesselTypeLabel(vessel.type)) +
                    '</span>' +
                    '<h3 id="shipTrackingDetailTitle">' +
                        escapeHtml(vessel.name || "Unknown vessel") +
                    '</h3>' +
                    '<span class="ship-tracking-detail-subtitle">' +
                        'MMSI ' + escapeHtml(vessel.mmsi) +
                    '</span>' +
                '</div>' +
                '<button type="button" class="ship-tracking-detail-close" id="shipTrackingDetailClose" aria-label="Close">✕</button>' +
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
            '</div>'
        );

        if(Array.isArray(attributions) && attributions.length){
            updateAttribution(attributions);
        }
    }

    function renderTrackDetail(mmsi, points){
        const first = points[0];
        const last = points[points.length - 1];

        setDetailContent(
            '<div class="ship-tracking-detail-head">' +
                '<div>' +
                    '<span class="ship-tracking-vessel-type">Recent track</span>' +
                    '<h3 id="shipTrackingDetailTitle">24-hour movement history</h3>' +
                    '<span class="ship-tracking-detail-subtitle">' +
                        'MMSI ' + escapeHtml(mmsi) +
                    '</span>' +
                '</div>' +
                '<button type="button" class="ship-tracking-detail-close" id="shipTrackingDetailClose" aria-label="Close">✕</button>' +
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
            ) +

            '<div class="ship-tracking-detail-actions">' +
                '<button type="button" class="ship-tracking-action-btn" data-ship-details="' +
                    escapeHtml(mmsi) +
                '">Details</button>' +
            '</div>'
        );
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
        setDetailContent(
            '<div class="ship-tracking-detail-loading">' +
                '<span>🚢</span>' +
                '<strong>' +
                    escapeHtml(message) +
                '</strong>' +
            '</div>'
        );
    }

    function showDetailError(message){
        setDetailContent(
            '<div class="ship-tracking-detail-loading">' +
                '<span>⚠️</span>' +
                '<strong>' +
                    escapeHtml(message) +
                '</strong>' +
            '</div>'
        );
    }

    function scrollToDetail(){
        const detail = get("shipTrackingDetail");

        if(!detail){
            return;
        }

        const card =
            detail.querySelector(".ship-tracking-detail-card");

        if(card){
            card.scrollTop = 0;
        }
    }

    function startAutoRefresh(){
        if(autoRefreshTimer){
            return;
        }

        autoRefreshTimer = window.setInterval(function(){
            const section =
                get("shipTrackingSection");

            if(
                !section ||
                section.style.display === "none" ||
                document.visibilityState ===
                    "hidden"
            ){
                return;
            }

            scheduleMapLoad(true);
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

        if(!Number.isFinite(value)){
            return "Vessel";
        }

        if(value === 0){
            return "Type not available";
        }

        if(value >= 1 && value <= 19){
            return "Reserved vessel type";
        }

        if(value >= 20 && value <= 29){
            return "Wing-in-ground craft";
        }

        const exactLabels = {
            30: "Fishing vessel",
            31: "Towing vessel",
            32: "Large towing vessel",
            33: "Dredging / underwater ops",
            34: "Diving operations",
            35: "Military vessel",
            36: "Sailing vessel",
            37: "Pleasure craft",
            38: "Reserved vessel type",
            39: "Reserved vessel type",
            50: "Pilot vessel",
            51: "Search & rescue",
            52: "Tug",
            53: "Port tender",
            54: "Anti-pollution vessel",
            55: "Law enforcement",
            56: "Local vessel",
            57: "Local vessel",
            58: "Medical transport",
            59: "Non-combatant vessel"
        };

        if(Object.prototype.hasOwnProperty.call(exactLabels, value)){
            return exactLabels[value];
        }

        if(value >= 40 && value <= 49){
            return "High-speed craft";
        }

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
            return "Other vessel";
        }

        return "Unknown vessel type";
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

        const retryAfter =
            Number(
                response.headers.get("Retry-After")
            );

        if(
            Number.isFinite(retryAfter) &&
            retryAfter > 0
        ){
            error.retryAfterMs =
                Math.ceil(
                    retryAfter * 1000
                );
        }

        return error;
    }

    function getApiErrorMessage(error){
        if(error && error.name === "rate_limited"){
            const retryAfterSeconds =
                Number(error.retryAfterMs) > 0
                    ? Math.ceil(
                        Number(error.retryAfterMs) /
                        1000
                    )
                    : 6;

            return (
                "Ship tracking is rate limited temporarily. " +
                "Retrying in about " +
                retryAfterSeconds +
                "s."
            );
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