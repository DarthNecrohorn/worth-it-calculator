/* =========================================================
   WATER LEVELS UI
   Presentation layer only — live API wiring comes next.
========================================================= */

(function(){
    "use strict";

    let initialized = false;
    let activeFilter = "all";

    const placeholderCards = [
        {icon:"🌊", type:"River", title:"Water level station"},
        {icon:"🏞️", type:"River", title:"Water level station"},
        {icon:"💧", type:"River", title:"Water level station"},
        {icon:"🏝️", type:"Lake", title:"Water level station"},
        {icon:"🌊", type:"River", title:"Water level station"},
        {icon:"💧", type:"Lake", title:"Water level station"}
    ];

    function get(id){
        return document.getElementById(id);
    }

    function renderCards(){
        const grid = get("waterLevelsGrid");
        const search = get("waterLevelsSearch");
        const query = (search?.value || "").trim().toLowerCase();

        const filtered = placeholderCards.filter(card => {
            const filterMatch =
                activeFilter === "all" ||
                (activeFilter === "rivers" && card.type === "River") ||
                (activeFilter === "lakes" && card.type === "Lake");

            const searchMatch =
                !query ||
                card.title.toLowerCase().includes(query) ||
                card.type.toLowerCase().includes(query);

            return filterMatch && searchMatch;
        });

        if (!grid) return;

        grid.innerHTML = filtered.length
            ? filtered.map(card => `
                <article class="water-level-card">
                    <div class="water-level-card-top">
                        <div class="water-level-card-icon">${card.icon}</div>
                        <span class="water-level-card-status">API pending</span>
                    </div>
                    <h3>${card.title}</h3>
                    <p class="water-level-card-location">Live station information will appear here.</p>
                    <div class="water-level-card-metrics">
                        <div class="water-level-metric">
                            <span>Water level</span>
                            <strong>—</strong>
                        </div>
                        <div class="water-level-metric">
                            <span>Trend</span>
                            <strong>—</strong>
                        </div>
                        <div class="water-level-metric">
                            <span>Location</span>
                            <strong>—</strong>
                        </div>
                        <div class="water-level-metric">
                            <span>Last update</span>
                            <strong>—</strong>
                        </div>
                    </div>
                </article>
            `).join("")
            : `
                <div class="water-level-empty">
                    No water level stations match your search.
                </div>
            `;

        const count = get("waterLevelsResultsCount");
        if (count) {
            count.textContent =
                `${filtered.length} prepared station card${filtered.length === 1 ? "" : "s"}`;
        }
    }

    function setupFilters(){
        const filters = get("waterLevelsFilters");
        if (!filters || filters.dataset.ready === "true") return;

        filters.dataset.ready = "true";

        filters.addEventListener("click", event => {
            const button = event.target.closest("[data-water-filter]");
            if (!button) return;

            activeFilter = button.dataset.waterFilter || "all";

            filters.querySelectorAll("[data-water-filter]").forEach(item => {
                item.classList.toggle("active", item === button);
            });

            renderCards();
        });
    }

    function setupSearch(){
        const search = get("waterLevelsSearch");
        if (!search || search.dataset.ready === "true") return;

        search.dataset.ready = "true";
        search.addEventListener("input", renderCards);
    }

    function setupRefresh(){
        const refresh = get("waterLevelsRefresh");
        if (!refresh || refresh.dataset.ready === "true") return;

        refresh.dataset.ready = "true";
        refresh.addEventListener("click", () => {
            renderCards();
        });
    }

    function init(){
        if (!get("waterLevelsSection")) return;

        setupFilters();
        setupSearch();
        setupRefresh();
        renderCards();
        initialized = true;
    }

    window.initWaterLevelsUI = init;

    /*
     * Also initialize when the section already exists in the DOM.
     * The navigation can still call initWaterLevelsUI() later; the
     * internal guards keep the event listeners from being duplicated.
     */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
