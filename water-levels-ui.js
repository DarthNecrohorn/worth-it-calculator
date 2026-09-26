/* =========================================================
   WATER LEVELS UI
   Copernicus CLMS-ready presentation layer.
   Live API wiring will replace prepared records later.
========================================================= */

(function(){
    "use strict";

    let activeFilter = "all";
    let activeHistoryRange = "MAX";
    let activeStationId = null;

    const preparedStations = [
        {id:"prepared-river-1",type:"River",icon:"🏞️",title:"River water-level station",description:"Prepared for Copernicus river observations.",keywords:"river station water level basin country copernicus clms"},
        {id:"prepared-river-2",type:"River",icon:"🌊",title:"River water-level station",description:"Prepared for Copernicus river observations.",keywords:"river station water level basin country copernicus clms"},
        {id:"prepared-river-3",type:"River",icon:"💧",title:"River water-level station",description:"Prepared for Copernicus river observations.",keywords:"river station water level basin country copernicus clms"},
        {id:"prepared-river-4",type:"River",icon:"🌊",title:"River water-level station",description:"Prepared for Copernicus river observations.",keywords:"river station water level basin country copernicus clms"},
        {id:"prepared-lake-1",type:"Lake",icon:"🏝️",title:"Lake water-level station",description:"Prepared for Copernicus lake observations.",keywords:"lake station water level basin country copernicus clms"},
        {id:"prepared-lake-2",type:"Lake",icon:"💧",title:"Lake water-level station",description:"Prepared for Copernicus lake observations.",keywords:"lake station water level basin country copernicus clms"}
    ];

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

    function getVisibleStations(){
        const input = get("waterLevelsSearch");
        const query = (input ? input.value : "").trim().toLowerCase();

        return preparedStations.filter(function(station){
            const filterOK =
                activeFilter === "all" ||
                (activeFilter === "rivers" && station.type === "River") ||
                (activeFilter === "lakes" && station.type === "Lake");

            const searchOK =
                !query ||
                [
                    station.id,
                    station.title,
                    station.type,
                    station.description,
                    station.keywords
                ].join(" ").toLowerCase().includes(query);

            return filterOK && searchOK;
        });
    }

    function metric(label,value){
        return (
            '<div class="water-level-metric">' +
                '<span>' + escapeHtml(label) + '</span>' +
                '<strong>' + escapeHtml(value) + '</strong>' +
            '</div>'
        );
    }

    function renderCards(){
        const grid = get("waterLevelsGrid");
        if(!grid) return;

        const visible = getVisibleStations();

        if(!visible.length){
            grid.innerHTML =
                '<div class="water-level-empty">' +
                    '<strong>No prepared stations match your search.</strong>' +
                    '<span>Try a station, river, lake, basin or country name.</span>' +
                '</div>';
        }else{
            grid.innerHTML = visible.map(function(station){
                return (
                    '<article class="water-level-card" data-water-station-id="' + escapeHtml(station.id) + '">' +
                        '<div class="water-level-card-top">' +
                            '<div class="water-level-card-icon">' + escapeHtml(station.icon) + '</div>' +
                            '<span class="water-level-card-type">' + escapeHtml(station.type) + '</span>' +
                            '<span class="water-level-card-status">API pending</span>' +
                        '</div>' +

                        '<div class="water-level-card-title">' +
                            '<h3>' + escapeHtml(station.title) + '</h3>' +
                            '<p>' + escapeHtml(station.description) + '</p>' +
                        '</div>' +

                        '<div class="water-level-card-hero">' +
                            '<div><span>Water surface height</span><strong>—</strong><small>m above reference geoid</small></div>' +
                            '<div><span>Uncertainty</span><strong>—</strong><small>measurement uncertainty</small></div>' +
                        '</div>' +

                        '<div class="water-level-card-metrics">' +
                            metric("Observed","—") +
                            metric("Satellite","—") +
                            metric("Cycle / pass","—") +
                            metric("Observations","—") +
                            metric("Basin","—") +
                            metric("Country","—") +
                        '</div>' +

                        '<div class="water-level-card-meta">' +
                            '<span>Station ID: —</span>' +
                            '<span>Coordinates: —</span>' +
                        '</div>' +

                        '<div class="water-level-card-actions">' +
                            '<button type="button" class="water-level-action" data-water-action="details" data-water-station-id="' + escapeHtml(station.id) + '">View details</button>' +
                            '<button type="button" class="water-level-action secondary" data-water-action="history" data-water-station-id="' + escapeHtml(station.id) + '">History</button>' +
                        '</div>' +
                    '</article>'
                );
            }).join("");
        }

        const count = get("waterLevelsResultsCount");
        if(count){
            count.textContent =
                visible.length +
                " prepared station card" +
                (visible.length === 1 ? "" : "s") +
                " ready for Copernicus data";
        }
    }

    function openDetails(station,mode){
        if(!station) return;

        const overlay = get("waterLevelsDetailOverlay");
        if(!overlay) return;

        activeStationId = station.id;

        const setText = function(id,value){
            const node = get(id);
            if(node) node.textContent = value;
        };

        setText("waterLevelsDetailIcon",station.icon);
        setText("waterLevelsDetailType",station.type + " · Copernicus CLMS");
        setText("waterLevelsDetailTitle",station.title);
        setText("waterLevelsDetailStatus","API pending · UI prepared");
        setText("waterLevelsDetailHeight","—");
        setText("waterLevelsDetailUncertainty","—");
        setText("waterLevelsDetailTrend","—");

        const metrics = get("waterLevelsDetailMetrics");
        if(metrics){
            metrics.innerHTML = [
                metric("Station identifier","—"),
                metric("Water body","—"),
                metric("Basin","—"),
                metric("Country","—"),
                metric("Coordinates","—"),
                metric("Observed","—"),
                metric("Decimal year","—"),
                metric("Satellite","—"),
                metric("Satellite cycle","—"),
                metric("Satellite pass","—"),
                metric("High-frequency observations","—"),
                metric("Reference geoid","—"),
                metric("Reference datum altitude","—"),
                metric("Coverage start","—"),
                metric("Coverage end","—"),
                metric("Last product update","—"),
                metric("Processing level","—"),
                metric("Processing mode","Near Real Time"),
                metric("Operational status","—"),
                metric("Source","Satellite altimetry")
            ].join("");
        }

        const note = get("waterLevelsDetailHistoryNote");
        if(note){
            note.textContent =
                mode === "history"
                    ? "Selected range: " + activeHistoryRange + ". Historical measurements will appear after API connection."
                    : "Historical measurements will appear here after API connection.";
        }

        const controls = get("waterLevelsHistoryControls");
        if(controls){
            controls.querySelectorAll("[data-water-history]").forEach(function(button){
                const active = button.dataset.waterHistory === activeHistoryRange;
                button.classList.toggle("active",active);
                button.setAttribute("aria-pressed",active ? "true" : "false");
            });
        }

        const chart = get("waterLevelsHistoryChart");
        if(chart){
            chart.innerHTML =
                '<div class="water-levels-history-placeholder">' +
                    '<span>📈</span>' +
                    '<strong>Historical time series ready</strong>' +
                    '<small>Water surface height and measurement uncertainty will be plotted after API connection.</small>' +
                '</div>';
        }

        overlay.classList.add("open");
        overlay.setAttribute("aria-hidden","false");
        document.body.classList.add("water-levels-modal-open");
    }

    function closeDetails(){
        const overlay = get("waterLevelsDetailOverlay");
        if(!overlay) return;

        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden","true");
        document.body.classList.remove("water-levels-modal-open");
        activeStationId = null;
    }

    function setupFilters(){
        const filters = get("waterLevelsFilters");
        if(!filters || filters.dataset.ready === "true") return;

        filters.dataset.ready = "true";

        filters.querySelectorAll("[data-water-filter]").forEach(function(button){
            button.setAttribute("aria-pressed",button.classList.contains("active") ? "true" : "false");
        });

        filters.addEventListener("click",function(event){
            const button = event.target.closest("[data-water-filter]");
            if(!button || !filters.contains(button)) return;

            activeFilter = button.dataset.waterFilter || "all";

            filters.querySelectorAll("[data-water-filter]").forEach(function(item){
                const active = item === button;
                item.classList.toggle("active",active);
                item.setAttribute("aria-pressed",active ? "true" : "false");
            });

            renderCards();
        });
    }

    function setupSearch(){
        const input = get("waterLevelsSearch");
        if(!input || input.dataset.ready === "true") return;

        input.dataset.ready = "true";
        input.addEventListener("input",renderCards);
        input.addEventListener("search",renderCards);
    }

    function setupRefresh(){
        const button = get("waterLevelsRefresh");
        if(!button || button.dataset.ready === "true") return;

        button.dataset.ready = "true";

        button.addEventListener("click",function(){
            renderCards();
            button.classList.remove("is-refreshing");
            void button.offsetWidth;
            button.classList.add("is-refreshing");

            window.clearTimeout(button._waterRefreshTimer);
            button._waterRefreshTimer = window.setTimeout(function(){
                button.classList.remove("is-refreshing");
            },600);
        });
    }

    function setupCardActions(){
        const grid = get("waterLevelsGrid");
        if(!grid || grid.dataset.ready === "true") return;

        grid.dataset.ready = "true";

        grid.addEventListener("click",function(event){
            const button = event.target.closest("[data-water-action]");
            if(!button) return;

            const station = preparedStations.find(function(item){
                return item.id === button.dataset.waterStationId;
            });

            if(station){
                openDetails(station,button.dataset.waterAction);
            }
        });
    }

    function setupDetailModal(){
        const overlay = get("waterLevelsDetailOverlay");
        const close = get("waterLevelsDetailClose");
        const controls = get("waterLevelsHistoryControls");

        if(close && close.dataset.ready !== "true"){
            close.dataset.ready = "true";
            close.addEventListener("click",closeDetails);
        }

        if(overlay && overlay.dataset.ready !== "true"){
            overlay.dataset.ready = "true";
            overlay.addEventListener("click",function(event){
                if(event.target === overlay) closeDetails();
            });
        }

        if(controls && controls.dataset.ready !== "true"){
            controls.dataset.ready = "true";

            controls.querySelectorAll("[data-water-history]").forEach(function(button){
                button.setAttribute(
                    "aria-pressed",
                    button.classList.contains("active") ? "true" : "false"
                );
            });

            controls.addEventListener("click",function(event){
                const button = event.target.closest("[data-water-history]");
                if(!button) return;

                activeHistoryRange = button.dataset.waterHistory || "MAX";

                controls.querySelectorAll("[data-water-history]").forEach(function(item){
                    const active = item === button;
                    item.classList.toggle("active",active);
                    item.setAttribute("aria-pressed",active ? "true" : "false");
                });

                const station = preparedStations.find(function(item){
                    return item.id === activeStationId;
                });

                if(station) openDetails(station,"history");
            });
        }
    }

    function setupKeyboard(){
        if(document.documentElement.dataset.waterLevelsKeyboard === "true") return;
        document.documentElement.dataset.waterLevelsKeyboard = "true";

        document.addEventListener("keydown",function(event){
            const overlay = get("waterLevelsDetailOverlay");
            if(event.key === "Escape" && overlay && overlay.classList.contains("open")){
                closeDetails();
            }
        });
    }

    function init(){
        if(!get("waterLevelsSection")) return;

        setupFilters();
        setupSearch();
        setupRefresh();
        setupCardActions();
        setupDetailModal();
        setupKeyboard();
        renderCards();
    }

    window.initWaterLevelsUI = init;

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded",init,{once:true});
    }else{
        init();
    }
})();