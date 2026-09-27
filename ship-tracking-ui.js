/* =========================================================
   SHIP TRACKING UI
   Prepared for live AIS / Pelyr OPEN-AIS integration.
========================================================= */

(function(){
    "use strict";

    let activeFilter = "all";
    let searchTimer = null;

    function get(id){
        return document.getElementById(id);
    }

    function setupFilters(){
        const filters = get("shipTrackingFilters");

        if(
            !filters ||
            filters.dataset.ready === "true"
        ){
            return;
        }

        filters.dataset.ready = "true";

        filters.addEventListener(
            "click",
            function(event){
                const button =
                    event.target.closest("[data-ship-filter]");

                if(
                    !button ||
                    !filters.contains(button)
                ){
                    return;
                }

                activeFilter =
                    button.dataset.shipFilter || "all";

                filters.querySelectorAll(
                    "[data-ship-filter]"
                ).forEach(function(item){
                    const active = item === button;

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

                renderEmptyState();
            }
        );

        filters.querySelectorAll(
            "[data-ship-filter]"
        ).forEach(function(button){
            button.setAttribute(
                "aria-pressed",
                button.classList.contains("active")
                    ? "true"
                    : "false"
            );
        });
    }

    function setupSearch(){
        const input = get("shipTrackingSearch");

        if(
            !input ||
            input.dataset.ready === "true"
        ){
            return;
        }

        input.dataset.ready = "true";

        input.addEventListener(
            "input",
            function(){
                window.clearTimeout(searchTimer);

                searchTimer =
                    window.setTimeout(
                        renderEmptyState,
                        220
                    );
            }
        );
    }

    function renderEmptyState(){
        const grid = get("shipTrackingGrid");
        const status = get("shipTrackingStatus");
        const input = get("shipTrackingSearch");

        if(!grid) return;

        const query =
            input
                ? input.value.trim()
                : "";

        grid.innerHTML =
            '<div class="ship-tracking-empty">' +
                '<div class="ship-tracking-empty-icon">🚢</div>' +
                '<strong>Live vessel cards are ready for AIS data</strong>' +
                '<span>' +
                    (
                        query
                            ? 'Your search for "' +
                                escapeHtml(query) +
                                '" will be applied to live vessel data.'
                            : 'No vessel positions are being invented or shown before the live AIS connection is available.'
                    ) +
                '</span>' +
            '</div>';

        if(status){
            status.textContent =
                query
                    ? "Waiting for live AIS vessel data · Search ready"
                    : "Waiting for live AIS vessel data";
        }
    }

    function escapeHtml(value){
        return String(
            value == null
                ? ""
                : value
        )
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }

    function init(){
        if(!get("shipTrackingSection")){
            return;
        }

        setupFilters();
        setupSearch();
        renderEmptyState();
    }

    window.initShipTrackingUI = init;

    if(document.readyState === "loading"){
        document.addEventListener(
            "DOMContentLoaded",
            init,
            {once:true}
        );
    }else{
        init();
    }

})();
