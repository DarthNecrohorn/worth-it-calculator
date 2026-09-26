/* =========================================================
   WATER LEVELS UI
   Live Copernicus CLMS integration.

   Backend:
     /api/water-levels?action=stations
     /api/water-levels?action=details&id=...&type=river&range=MAX
========================================================= */

(function(){
    "use strict";

    let activeFilter = "all";
    let activeHistoryRange = "MAX";
    let activeStationId = null;
    let activeStation = null;
    let searchTimer = null;
    let stationsRequest = null;
    let stationsRequestTimer = null;
    let stationMetadataRun = 0;

    const stationMetadataCache = new Map();
    const STATION_METADATA_CONCURRENCY = 3;

    const state = {
        stations: [],
        loading: false,
        error: ""
    };

    function get(id){
        return document.getElementById(id);
    }

    function escapeHtml(value){
        return String(value == null ? "" : value)
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");
    }

    function formatNumber(value, decimals){
        const number = Number(value);
        if(!Number.isFinite(number)) return "—";
        return number.toLocaleString(
            undefined,
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: decimals == null ? 2 : decimals
            }
        );
    }

    function formatDate(value){
        if(!value) return "—";

        const date = new Date(value);
        if(Number.isNaN(date.getTime())) return String(value);

        return date.toLocaleString(
            undefined,
            {
                dateStyle:"medium",
                timeStyle:"short"
            }
        );
    }

    function formatCoordinates(coordinates){
        if(
            !coordinates ||
            !Number.isFinite(Number(coordinates.latitude)) ||
            !Number.isFinite(Number(coordinates.longitude))
        ){
            return "—";
        }

        return (
            Number(coordinates.latitude).toFixed(4) +
            "°, " +
            Number(coordinates.longitude).toFixed(4) +
            "°"
        );
    }

    function stationIcon(type){
        return type === "lake" ? "🏝️" : "🏞️";
    }

    function stationTypeLabel(type){
        return type === "lake" ? "Lake" : "River";
    }

    function currentQuery(){
        const input = get("waterLevelsSearch");
        return input ? input.value.trim() : "";
    }

    function filteredStations(){
        const query = currentQuery().toLowerCase();

        return state.stations.filter(function(station){

            const typeOK =
                activeFilter === "all" ||
                (activeFilter === "rivers" && station.type === "river") ||
                (activeFilter === "lakes" && station.type === "lake");

            if(!typeOK) return false;
            if(!query) return true;

            return [
                station.id,
                station.stationId,
                station.title,
                station.productName,
                station.waterBody,
                station.basin,
                station.location,
                station.datasetId
            ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);
        });
    }

    function setResultsText(text){
        const count = get("waterLevelsResultsCount");
        if(count) count.textContent = text;
    }

    function renderLoading(){
        const grid = get("waterLevelsGrid");
        if(!grid) return;

        grid.innerHTML =
            '<div class="water-level-empty">' +
                '<strong>Loading Copernicus water-level stations…</strong>' +
                '<span>Searching the CLMS catalogue and preparing live data.</span>' +
            '</div>';

        setResultsText("Loading live Copernicus stations…");
    }

    function renderError(message){
        const grid = get("waterLevelsGrid");
        if(!grid) return;

        grid.innerHTML =
            '<div class="water-level-empty">' +
                '<strong>Water level data could not be loaded.</strong>' +
                '<span>' + escapeHtml(message || "Please try again.") + '</span>' +
            '</div>';

        setResultsText("Copernicus request failed");
    }

    function metric(label,value){
        return (
            '<div class="water-level-metric">' +
                '<span>' + escapeHtml(label) + '</span>' +
                '<strong>' + escapeHtml(value) + '</strong>' +
            '</div>'
        );
    }

    function cardMetric(label,value,key){
        return (
            '<div class="water-level-metric">' +
                '<span>' + escapeHtml(label) + '</span>' +
                '<strong data-water-card-meta="' +
                    escapeHtml(key) +
                '">' +
                    escapeHtml(value || "—") +
                '</strong>' +
            '</div>'
        );
    }

    function findStationCard(stationId){
        const grid = get("waterLevelsGrid");
        if(!grid) return null;

        const cards = grid.querySelectorAll(
            "[data-water-station-id]"
        );

        for(const card of cards){
            if(card.dataset.waterStationId === String(stationId)){
                return card;
            }
        }

        return null;
    }

    function applyStationMetadata(station,metadata){
        if(!station || !metadata) return;

        const sourceStation = metadata.station || {};
        const latest = metadata.latest || null;

        station.waterBody =
            sourceStation.waterBody || station.waterBody || "";
        station.basin =
            sourceStation.basin || station.basin || "";
        station.stationId =
            sourceStation.stationId || station.stationId || "";
        station.location =
            [
                station.waterBody,
                station.basin,
                sourceStation.country || ""
            ]
            .filter(Boolean)
            .join(" · ");
        station.title =
            station.waterBody || station.title || station.productName;
        station.updated =
            sourceStation.updated || station.updated || "";
        station.coordinates =
            sourceStation.coordinates ||
            metadata.coordinates ||
            station.coordinates;
        station.country = sourceStation.country || station.country || "";
        station.platform = sourceStation.platform || station.platform || "";
        station.processingLevel =
            sourceStation.processingLevel ||
            station.processingLevel ||
            "";
        station.status =
            sourceStation.status || station.status || "CLMS";
        station.latestHeight =
            latest && Number.isFinite(Number(latest.height))
                ? Number(latest.height)
                : null;
        station.latestUncertainty =
            latest && Number.isFinite(Number(latest.uncertainty))
                ? Number(latest.uncertainty)
                : null;
        station.metadataLoaded = true;

        const card = findStationCard(station.id);
        if(!card) return;

        const title = card.querySelector(
            "[data-water-card-title]"
        );
        if(title){
            title.textContent =
                station.title ||
                (station.type === "lake"
                    ? "Lake water-level station"
                    : "River water-level station");
        }

        const location = card.querySelector(
            "[data-water-card-location]"
        );
        if(location){
            location.textContent =
                station.location ||
                "Global Copernicus station";
        }

        const status = card.querySelector(
            "[data-water-card-status]"
        );
        if(status){
            status.textContent =
                station.status || "CLMS metadata";
        }

        const height = card.querySelector(
            "[data-water-card-height]"
        );
        if(height){
            height.textContent =
                station.latestHeight != null
                    ? formatNumber(station.latestHeight,3) + " m"
                    : "—";
        }

        const heightNote = card.querySelector(
            "[data-water-card-height-note]"
        );
        if(heightNote){
            heightNote.textContent =
                station.latestHeight != null
                    ? "Latest available observation"
                    : "Open details for latest measurement";
        }

        const updated = card.querySelector(
            "[data-water-card-updated]"
        );
        if(updated){
            updated.textContent =
                station.updated
                    ? new Date(station.updated).toLocaleDateString()
                    : "—";
        }

        const waterBody = card.querySelector(
            '[data-water-card-meta="waterBody"]'
        );
        if(waterBody){
            waterBody.textContent = station.waterBody || "—";
        }

        const basin = card.querySelector(
            '[data-water-card-meta="basin"]'
        );
        if(basin){
            basin.textContent = station.basin || "—";
        }

        const stationId = card.querySelector(
            '[data-water-card-meta="stationId"]'
        );
        if(stationId){
            stationId.textContent = station.stationId || "—";
        }

        const coordinates = card.querySelector(
            '[data-water-card-meta="coordinates"]'
        );
        if(coordinates){
            coordinates.textContent =
                formatCoordinates(station.coordinates);
        }
    }

    async function loadStationMetadata(stations){
        if(!Array.isArray(stations) || !stations.length){
            return;
        }

        const runId = ++stationMetadataRun;
        let cursor = 0;

        async function worker(){
            while(cursor < stations.length){
                const station = stations[cursor++];
                if(!station || !station.id) continue;

                if(stationMetadataCache.has(station.id)){
                    applyStationMetadata(
                        station,
                        stationMetadataCache.get(station.id)
                    );
                    continue;
                }

                try{
                    const params = new URLSearchParams();
                    params.set("action","metadata");
                    params.set("id",station.id);
                    params.set("type",station.type);

                    const response = await fetch(
                        "/api/water-levels?" + params.toString(),
                        {
                            method:"GET",
                            headers:{"Accept":"application/json"}
                        }
                    );

                    const data = await response.json().catch(function(){
                        return null;
                    });

                    if(
                        !response.ok ||
                        !data ||
                        data.ok === false
                    ){
                        throw new Error(
                            data && data.error
                                ? data.error
                                : "Metadata request failed."
                        );
                    }

                    stationMetadataCache.set(
                        station.id,
                        data
                    );

                    const current = state.stations.find(function(item){
                        return item.id === station.id;
                    });

                    if(current){
                        applyStationMetadata(current,data);
                    }

                }
                catch(error){
                    console.warn(
                        "Water-level station metadata request failed:",
                        station.id,
                        error
                    );
                }
            }
        }

        const workers = [];
        const count = Math.min(
            STATION_METADATA_CONCURRENCY,
            stations.length
        );

        for(let index = 0; index < count; index++){
            workers.push(worker());
        }

        await Promise.all(workers);

        if(runId !== stationMetadataRun){
            return;
        }
    }

    function renderCards(){
        const grid = get("waterLevelsGrid");
        if(!grid) return;

        if(state.loading){
            renderLoading();
            return;
        }

        if(state.error){
            renderError(state.error);
            return;
        }

        const visible = filteredStations();

        if(!visible.length){
            grid.innerHTML =
                '<div class="water-level-empty">' +
                    '<strong>No Copernicus stations match your search.</strong>' +
                    '<span>Try a river, lake, basin, station ID or water-body name.</span>' +
                '</div>';

            setResultsText(
                "0 live station cards"
            );
            return;
        }

        grid.innerHTML = visible.map(function(station){

            const typeLabel =
                stationTypeLabel(station.type);

            const location =
                station.location ||
                station.waterBody ||
                station.basin ||
                "Global Copernicus station";

            return (
                '<article class="water-level-card" data-water-station-id="' +
                    escapeHtml(station.id) +
                '">' +

                    '<div class="water-level-card-top">' +
                        '<div class="water-level-card-icon">' +
                            stationIcon(station.type) +
                        '</div>' +

                        '<span class="water-level-card-type">' +
                            escapeHtml(typeLabel) +
                        '</span>' +

                        '<span class="water-level-card-status" data-water-card-status>' +
                            escapeHtml(station.status || "CLMS") +
                        '</span>' +
                    '</div>' +

                    '<div class="water-level-card-title">' +
                        '<h3 data-water-card-title>' +
                            escapeHtml(
                                station.title ||
                                (typeLabel + " water-level station")
                            ) +
                        '</h3>' +

                        '<p data-water-card-location>' +
                            escapeHtml(location) +
                        '</p>' +
                    '</div>' +

                    '<div class="water-level-card-hero">' +
                        '<div>' +
                            '<span>Water surface height</span>' +
                            '<strong data-water-card-height>—</strong>' +
                            '<small data-water-card-height-note>Open details for latest measurement</small>' +
                        '</div>' +

                        '<div>' +
                            '<span>Last product update</span>' +
                            '<strong data-water-card-updated>' +
                                escapeHtml(
                                    station.updated
                                        ? new Date(station.updated).toLocaleDateString()
                                        : "—"
                                ) +
                            '</strong>' +
                            '<small>Copernicus CLMS</small>' +
                        '</div>' +
                    '</div>' +

                    '<div class="water-level-card-metrics">' +
                        cardMetric(
                            "Water body",
                            station.waterBody || "Loading…",
                            "waterBody"
                        ) +

                        cardMetric(
                            "Basin",
                            station.basin || "Loading…",
                            "basin"
                        ) +

                        cardMetric(
                            "Station / Cell ID",
                            station.stationId || "Loading…",
                            "stationId"
                        ) +

                        cardMetric(
                            "Coordinates",
                            formatCoordinates(station.coordinates),
                            "coordinates"
                        ) +
                    '</div>' +

                    '<div class="water-level-card-meta">' +
                        '<span>' +
                            escapeHtml(typeLabel) +
                        '</span>' +

                        '<span>' +
                            escapeHtml(
                                station.datasetVersion ||
                                "CLMS"
                            ) +
                        '</span>' +
                    '</div>' +

                    '<div class="water-level-card-actions">' +
                        '<button type="button" class="water-level-action" data-water-action="details" data-water-station-id="' +
                            escapeHtml(station.id) +
                        '">View details</button>' +

                        '<button type="button" class="water-level-action secondary" data-water-action="history" data-water-station-id="' +
                            escapeHtml(station.id) +
                        '">History</button>' +
                    '</div>' +

                '</article>'
            );

        }).join("");

        setResultsText(
            visible.length +
            " live Copernicus station" +
            (visible.length === 1 ? "" : "s") +
            " found"
        );

        /* Hydrate visible cards from the actual Copernicus GeoJSON products. */
        void loadStationMetadata(visible);
    }

    async function loadStations(options){
        options = options || {};

        const input =
            get("waterLevelsSearch");

        const query =
            input
                ? input.value.trim()
                : "";

        /*
         * Fetch a single combined Copernicus result set and apply
         * Rivers/Lakes filtering locally. This avoids slow nested
         * OData attribute filters when switching tabs while keeping
         * the exact live Copernicus records.
         */
        const params =
            new URLSearchParams();

        params.set(
            "action",
            "stations"
        );

        params.set(
            "limit",
            "24"
        );

        if(query){
            params.set("q",query);
        }

        if(options.force){
            params.set("refresh","1");
        }

        const requestUrl =
            "/api/water-levels?" +
            params.toString();

        if(stationsRequest){
            try{
                stationsRequest.abort();
            }catch(error){}
        }

        const controller =
            new AbortController();

        stationsRequest =
            controller;

        window.clearTimeout(
            stationsRequestTimer
        );

        stationsRequestTimer =
            window.setTimeout(
                function(){
                    controller.abort();
                },
                25000
            );

        state.loading = true;
        state.error = "";
        renderLoading();

        try{

            const response =
                await fetch(
                    requestUrl,
                    {
                        method:"GET",
                        headers:{
                            "Accept":"application/json"
                        },
                        signal:
                            controller.signal
                    }
                );

            const data =
                await response.json()
                    .catch(function(){
                        return null;
                    });

            /*
             * A newer search/refresh may already own the UI.
             * Never let an older request overwrite its state.
             */
            if(stationsRequest !== controller){
                return;
            }

            if(!response.ok || !data || data.ok === false){
                throw new Error(
                    data &&
                    data.error
                        ? data.error
                        : "The Copernicus water-level endpoint returned an error."
                );
            }

            state.stations =
                Array.isArray(data.stations)
                    ? data.stations
                    : [];

            state.error = "";
            state.loading = false;
            renderCards();

        }catch(error){

            if(
                error &&
                error.name === "AbortError"
            ){
                if(stationsRequest === controller){
                    state.loading = false;
                    state.error =
                        "The Copernicus water-level request timed out. Please try Refresh again.";
                    renderError(state.error);
                }
                return;
            }

            if(stationsRequest !== controller){
                return;
            }

            console.error(
                "Water levels station request failed:",
                error
            );

            state.stations = [];
            state.error =
                error &&
                error.message
                    ? error.message
                    : "Unable to load Copernicus water-level data.";

            state.loading = false;

            renderError(
                state.error
            );

        }finally{

            if(stationsRequest === controller){
                stationsRequest = null;

                window.clearTimeout(
                    stationsRequestTimer
                );

                /*
                 * Success/error branches already render with the
                 * correct loading state. This is only a safety net
                 * for unexpected exits.
                 */
                if(state.loading){
                    state.loading = false;
                }
            }

        }
    }

    function scheduleSearch(){
        window.clearTimeout(
            searchTimer
        );

        searchTimer =
            window.setTimeout(
                function(){
                    loadStations();
                },
                280
            );
    }

    function setDetailText(id,value){
        const node = get(id);
        if(node){
            node.textContent =
                value == null || value === ""
                    ? "—"
                    : String(value);
        }
    }

    function renderHistoryChart(measurements){
        const chart =
            get("waterLevelsHistoryChart");

        if(!chart) return;

        const points =
            Array.isArray(measurements)
                ? measurements.filter(function(item){
                    return (
                        Number.isFinite(Number(item.height)) &&
                        item.datetime
                    );
                })
                : [];

        if(!points.length){
            chart.innerHTML =
                '<div class="water-levels-history-placeholder">' +
                    '<span>📈</span>' +
                    '<strong>No measurements in this range</strong>' +
                    '<small>The selected Copernicus product does not contain a usable time series for this range.</small>' +
                '</div>';
            return;
        }

        const width = 900;
        const height = 270;
        const padLeft = 58;
        const padRight = 18;
        const padTop = 20;
        const padBottom = 42;

        const values =
            points.map(function(item){
                return Number(item.height);
            });

        let min =
            Math.min.apply(null,values);

        let max =
            Math.max.apply(null,values);

        if(min === max){
            min -= 1;
            max += 1;
        }

        const x =
            function(index){
                return (
                    padLeft +
                    (
                        index /
                        Math.max(
                            1,
                            points.length - 1
                        )
                    ) *
                    (
                        width -
                        padLeft -
                        padRight
                    )
                );
            };

        const y =
            function(value){
                return (
                    padTop +
                    (
                        (max - value) /
                        (max - min)
                    ) *
                    (
                        height -
                        padTop -
                        padBottom
                    )
                );
            };

        const path =
            points.map(function(item,index){
                return (
                    (index === 0 ? "M " : "L ") +
                    x(index).toFixed(2) +
                    " " +
                    y(Number(item.height)).toFixed(2)
                );
            }).join(" ");

        const firstDate =
            points[0].datetime;

        const lastDate =
            points[points.length - 1].datetime;

        chart.innerHTML =
            '<div class="water-levels-chart-inner">' +
                '<svg class="water-levels-chart-svg" viewBox="0 0 ' +
                    width + " " + height +
                    '" role="img" aria-label="Water surface height history">' +

                    '<line x1="' + padLeft + '" y1="' + padTop +
                        '" x2="' + padLeft + '" y2="' +
                        (height - padBottom) +
                        '" stroke="currentColor" opacity=".18"/>' +

                    '<line x1="' + padLeft + '" y1="' +
                        (height - padBottom) +
                        '" x2="' +
                        (width - padRight) +
                        '" y2="' +
                        (height - padBottom) +
                        '" stroke="currentColor" opacity=".18"/>' +

                    '<path d="' + path +
                        '" fill="none" stroke="url(#waterGradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +

                    '<defs>' +
                        '<linearGradient id="waterGradient" x1="0" x2="1">' +
                            '<stop offset="0%" stop-color="var(--primary)"/>' +
                            '<stop offset="100%" stop-color="var(--primary2)"/>' +
                        '</linearGradient>' +
                    '</defs>' +

                    '<text x="8" y="' +
                        (padTop + 5) +
                        '" fill="currentColor" opacity=".65" font-size="11">' +
                        escapeHtml(formatNumber(max,2)) +
                    '</text>' +

                    '<text x="8" y="' +
                        (height - padBottom) +
                        '" fill="currentColor" opacity=".65" font-size="11">' +
                        escapeHtml(formatNumber(min,2)) +
                    '</text>' +

                    '<text x="' +
                        padLeft +
                        '" y="' +
                        (height - 12) +
                        '" fill="currentColor" opacity=".65" font-size="10">' +
                        escapeHtml(
                            new Date(firstDate).toLocaleDateString()
                        ) +
                    '</text>' +

                    '<text x="' +
                        (width - padRight) +
                        '" y="' +
                        (height - 12) +
                        '" text-anchor="end" fill="currentColor" opacity=".65" font-size="10">' +
                        escapeHtml(
                            new Date(lastDate).toLocaleDateString()
                        ) +
                    '</text>' +

                '</svg>' +

                '<div class="water-levels-chart-summary">' +
                    '<span>' +
                        points.length +
                        " plotted point" +
                        (points.length === 1 ? "" : "s") +
                    '</span>' +

                    '<span>' +
                        escapeHtml(
                            formatNumber(
                                values[values.length - 1],
                                3
                            )
                        ) +
                        " m latest" +
                    '</span>' +
                '</div>' +
            '</div>';
    }

    function openDetails(station,mode){
        if(!station) return;

        const overlay =
            get("waterLevelsDetailOverlay");

        if(!overlay) return;

        activeStationId =
            station.id;

        activeStation =
            station;

        setDetailText(
            "waterLevelsDetailIcon",
            stationIcon(station.type)
        );

        setDetailText(
            "waterLevelsDetailType",
            stationTypeLabel(station.type) +
            " · Copernicus CLMS"
        );

        setDetailText(
            "waterLevelsDetailTitle",
            station.title ||
            "Water level station"
        );

        setDetailText(
            "waterLevelsDetailStatus",
            "Loading live Copernicus measurements…"
        );

        setDetailText(
            "waterLevelsDetailHeight",
            "—"
        );

        setDetailText(
            "waterLevelsDetailUncertainty",
            "—"
        );

        setDetailText(
            "waterLevelsDetailTrend",
            "—"
        );

        const controls =
            get("waterLevelsHistoryControls");

        if(controls){
            controls.querySelectorAll(
                "[data-water-history]"
            ).forEach(function(button){
                const active =
                    button.dataset.waterHistory ===
                    activeHistoryRange;

                button.classList.toggle(
                    "active",
                    active
                );

                button.setAttribute(
                    "aria-pressed",
                    active ? "true" : "false"
                );
            });
        }

        const chart =
            get("waterLevelsHistoryChart");

        if(chart){
            chart.innerHTML =
                '<div class="water-levels-history-placeholder">' +
                    '<span>💧</span>' +
                    '<strong>Loading measurements…</strong>' +
                    '<small>Fetching the selected Copernicus water-level product.</small>' +
                '</div>';
        }

        overlay.classList.add("open");
        overlay.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.classList.add(
            "water-levels-modal-open"
        );

        loadDetails(
            station,
            mode || "details"
        );
    }

    async function loadDetails(station,mode){
        const params =
            new URLSearchParams();

        params.set(
            "action",
            "details"
        );

        params.set(
            "id",
            station.id
        );

        params.set(
            "type",
            station.type
        );

        params.set(
            "range",
            activeHistoryRange
        );

        try{

            const response =
                await fetch(
                    "/api/water-levels?" +
                    params.toString(),
                    {
                        method:"GET",
                        headers:{
                            "Accept":"application/json"
                        }
                    }
                );

            const data =
                await response.json()
                    .catch(function(){
                        return null;
                    });

            if(!response.ok || !data || data.ok === false){
                throw new Error(
                    data &&
                    data.error
                        ? data.error
                        : "Unable to load Copernicus station details."
                );
            }

            renderDetails(
                data,
                mode
            );

        }catch(error){

            console.error(
                "Water levels details request failed:",
                error
            );

            setDetailText(
                "waterLevelsDetailStatus",
                error.message ||
                "Unable to load water-level details."
            );

            const chart =
                get("waterLevelsHistoryChart");

            if(chart){
                chart.innerHTML =
                    '<div class="water-levels-history-placeholder">' +
                        '<span>⚠️</span>' +
                        '<strong>Measurements unavailable</strong>' +
                        '<small>' +
                            escapeHtml(
                                error.message ||
                                "The Copernicus product could not be loaded."
                            ) +
                        '</small>' +
                    '</div>';
            }

        }
    }

    function renderDetails(
        data,
        mode
    ){

        const station =
            data.station ||
            {};

        const latest =
            data.latest ||
            null;

        const trend =
            data.trend ||
            {};

        setDetailText(
            "waterLevelsDetailStatus",
            "Live Copernicus data · " +
            (data.source &&
             data.source.dataset
                ? data.source.dataset
                : "CLMS")
        );

        setDetailText(
            "waterLevelsDetailHeight",
            latest &&
            Number.isFinite(Number(latest.height))
                ? formatNumber(latest.height,3) + " m"
                : "—"
        );

        setDetailText(
            "waterLevelsDetailUncertainty",
            latest &&
            Number.isFinite(Number(latest.uncertainty))
                ? "± " +
                    formatNumber(
                        latest.uncertainty,
                        3
                    ) +
                    " m"
                : "—"
        );

        setDetailText(
            "waterLevelsDetailTrend",
            trend.available
                ? (
                    formatNumber(
                        trend.millimetersPerYear,
                        1
                    ) +
                    " mm/year"
                )
                : "—"
        );

        const metrics =
            get("waterLevelsDetailMetrics");

        if(metrics){

            metrics.innerHTML = [

                metric(
                    "Station / Cell ID",
                    station.stationId
                ),

                metric(
                    "Water body",
                    station.waterBody
                ),

                metric(
                    "Basin",
                    station.basin
                ),

                metric(
                    "Country",
                    station.country
                ),

                metric(
                    "Coordinates",
                    formatCoordinates(
                        station.coordinates
                    )
                ),

                metric(
                    "Observed",
                    latest
                        ? formatDate(
                            latest.datetime
                        )
                        : "—"
                ),

                metric(
                    "Satellite",
                    latest &&
                    latest.satellite
                        ? latest.satellite
                        : "—"
                ),

                metric(
                    "Satellite cycle",
                    latest &&
                    Number.isFinite(
                        Number(
                            latest.cycleNumber
                        )
                    )
                        ? latest.cycleNumber
                        : "—"
                ),

                metric(
                    "Ground track",
                    latest &&
                    Number.isFinite(
                        Number(
                            latest.groundTrack
                        )
                    )
                        ? latest.groundTrack
                        : "—"
                ),

                metric(
                    "Measurements",
                    station.measurementCount
                ),

                metric(
                    "Selected range",
                    station.selectedMeasurementCount
                ),

                metric(
                    "Reference geoid",
                    station.referenceGeoid
                ),

                metric(
                    "Reference datum altitude",
                    Number.isFinite(
                        Number(
                            station.referenceDatumAltitude
                        )
                    )
                        ? formatNumber(
                            station.referenceDatumAltitude,
                            3
                        ) + " m"
                        : "—"
                ),

                metric(
                    "Coverage start",
                    formatDate(
                        station.coverageStart
                    )
                ),

                metric(
                    "Coverage end",
                    formatDate(
                        station.coverageEnd
                    )
                ),

                metric(
                    "Last product update",
                    formatDate(
                        station.updated
                    )
                ),

                metric(
                    "Processing level",
                    station.processingLevel
                ),

                metric(
                    "Processing mode",
                    station.processingMode ||
                    "Near Real Time"
                ),

                metric(
                    "Operational status",
                    station.status
                ),

                metric(
                    "Source",
                    station.source ||
                    "Satellite altimetry"
                )

            ].join("");

        }

        const note =
            get("waterLevelsDetailHistoryNote");

        if(note){

            note.textContent =
                (mode === "history"
                    ? "Selected range: "
                    : "Showing range: ") +
                activeHistoryRange +
                " · " +
                (
                    data.history &&
                    Number.isFinite(
                        Number(
                            data.history.totalPoints
                        )
                    )
                        ? data.history.totalPoints
                        : 0
                ) +
                " measurement(s).";

        }

        renderHistoryChart(
            data.measurements
        );

        setDetailText(
            "waterLevelsDetailFooter",
            "Source: Copernicus Land Monitoring Service · " +
            "Satellite altimetry · " +
            (
                data.source &&
                data.source.dataset
                    ? data.source.dataset
                    : "CLMS"
            )
        );

    }

    function closeDetails(){
        const overlay =
            get("waterLevelsDetailOverlay");

        if(!overlay) return;

        overlay.classList.remove(
            "open"
        );

        overlay.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.classList.remove(
            "water-levels-modal-open"
        );

        activeStationId = null;
        activeStation = null;
    }

    function setupFilters(){
        const filters =
            get("waterLevelsFilters");

        if(
            !filters ||
            filters.dataset.ready === "true"
        ){
            return;
        }

        filters.dataset.ready = "true";

        filters.querySelectorAll(
            "[data-water-filter]"
        ).forEach(function(button){
            button.setAttribute(
                "aria-pressed",
                button.classList.contains("active")
                    ? "true"
                    : "false"
            );
        });

        filters.addEventListener(
            "click",
            function(event){

                const button =
                    event.target.closest(
                        "[data-water-filter]"
                    );

                if(
                    !button ||
                    !filters.contains(button)
                ){
                    return;
                }

                activeFilter =
                    button.dataset.waterFilter ||
                    "all";

                filters.querySelectorAll(
                    "[data-water-filter]"
                ).forEach(function(item){

                    const active =
                        item === button;

                    item.classList.toggle(
                        "active",
                        active
                    );

                    item.setAttribute(
                        "aria-pressed",
                        active
                            ? "true"
                            : "false"
                    );

                });

                loadStations();

            }
        );
    }

    function setupSearch(){
        const input =
            get("waterLevelsSearch");

        if(
            !input ||
            input.dataset.ready === "true"
        ){
            return;
        }

        input.dataset.ready = "true";

        input.addEventListener(
            "input",
            scheduleSearch
        );

        input.addEventListener(
            "search",
            scheduleSearch
        );
    }

    function setupRefresh(){
        const button =
            get("waterLevelsRefresh");

        if(
            !button ||
            button.dataset.ready === "true"
        ){
            return;
        }

        button.dataset.ready = "true";

        button.addEventListener(
            "click",
            function(){

                loadStations({
                    force:true
                });

                button.classList.remove(
                    "is-refreshing"
                );

                void button.offsetWidth;

                button.classList.add(
                    "is-refreshing"
                );

                window.clearTimeout(
                    button._waterRefreshTimer
                );

                button._waterRefreshTimer =
                    window.setTimeout(
                        function(){
                            button.classList.remove(
                                "is-refreshing"
                            );
                        },
                        600
                    );

            }
        );
    }

    function setupCardActions(){
        const grid =
            get("waterLevelsGrid");

        if(
            !grid ||
            grid.dataset.ready === "true"
        ){
            return;
        }

        grid.dataset.ready = "true";

        grid.addEventListener(
            "click",
            function(event){

                const button =
                    event.target.closest(
                        "[data-water-action]"
                    );

                if(!button) return;

                const station =
                    state.stations.find(
                        function(item){
                            return (
                                item.id ===
                                button.dataset.waterStationId
                            );
                        }
                    );

                if(station){
                    openDetails(
                        station,
                        button.dataset.waterAction
                    );
                }

            }
        );
    }

    function setupDetailModal(){
        const overlay =
            get("waterLevelsDetailOverlay");

        const close =
            get("waterLevelsDetailClose");

        const controls =
            get("waterLevelsHistoryControls");

        if(
            close &&
            close.dataset.ready !== "true"
        ){

            close.dataset.ready = "true";

            close.addEventListener(
                "click",
                closeDetails
            );

        }

        if(
            overlay &&
            overlay.dataset.ready !== "true"
        ){

            overlay.dataset.ready = "true";

            overlay.addEventListener(
                "click",
                function(event){

                    if(
                        event.target === overlay
                    ){
                        closeDetails();
                    }

                }
            );

        }

        if(
            controls &&
            controls.dataset.ready !== "true"
        ){

            controls.dataset.ready = "true";

            controls.querySelectorAll(
                "[data-water-history]"
            ).forEach(function(button){

                button.setAttribute(
                    "aria-pressed",
                    button.classList.contains("active")
                        ? "true"
                        : "false"
                );

            });

            controls.addEventListener(
                "click",
                function(event){

                    const button =
                        event.target.closest(
                            "[data-water-history]"
                        );

                    if(!button) return;

                    activeHistoryRange =
                        button.dataset.waterHistory ||
                        "MAX";

                    controls.querySelectorAll(
                        "[data-water-history]"
                    ).forEach(function(item){

                        const active =
                            item === button;

                        item.classList.toggle(
                            "active",
                            active
                        );

                        item.setAttribute(
                            "aria-pressed",
                            active
                                ? "true"
                                : "false"
                        );

                    });

                    if(activeStation){
                        loadDetails(
                            activeStation,
                            "history"
                        );
                    }

                }
            );

        }

    }

    function setupKeyboard(){
        if(
            document.documentElement.dataset.waterLevelsKeyboard ===
            "true"
        ){
            return;
        }

        document.documentElement.dataset.waterLevelsKeyboard =
            "true";

        document.addEventListener(
            "keydown",
            function(event){

                const overlay =
                    get("waterLevelsDetailOverlay");

                if(
                    event.key === "Escape" &&
                    overlay &&
                    overlay.classList.contains("open")
                ){
                    closeDetails();
                }

            }
        );
    }

    function init(){
        if(
            !get("waterLevelsSection")
        ){
            return;
        }

        setupFilters();
        setupSearch();
        setupRefresh();
        setupCardActions();
        setupDetailModal();
        setupKeyboard();

        if(
            state.stations.length === 0 &&
            !state.loading
        ){
            loadStations();
        }else{
            renderCards();
        }
    }

    window.initWaterLevelsUI =
        init;

    if(
        document.readyState === "loading"
    ){

        document.addEventListener(
            "DOMContentLoaded",
            init,
            {once:true}
        );

    }else{

        init();

    }

})();
