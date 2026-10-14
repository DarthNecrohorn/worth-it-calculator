/* Worth It public user search — exact Worth It ID or partial username. */
(function () {
    "use strict";
    const $ = id => document.getElementById(id);
    const sb = () => window.supabaseClient || null;
    let searchTimer = null, requestVersion = 0, isOpen = false;
    function setStatus(message, isError) {
        const status = $("worthItUserSearchStatus");
        if (!status) return;
        status.textContent = message || "";
        status.classList.toggle("is-error", Boolean(isError));
    }
    function emptyResult(message) {
        const host = $("worthItUserSearchResults");
        if (!host) return;
        host.replaceChildren();
        const empty = document.createElement("div");
        empty.className = "worth-it-user-search-empty";
        empty.textContent = message;
        host.appendChild(empty);
    }
    function initials(person) {
        const name = String(person?.display_name || person?.username || "W").trim();
        return name.split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "W";
    }
    function openProfile(id, event) {
        event?.preventDefault?.();
        const worthItId = Number(id);
        if (!Number.isSafeInteger(worthItId) || worthItId < 1) return;
        closeSearch();
        if (typeof window.openWorthItProfile === "function") window.openWorthItProfile(worthItId);
        else window.location.href = "/profile/" + worthItId;
    }
    function renderResults(rows) {
        const host = $("worthItUserSearchResults");
        if (!host) return;
        host.replaceChildren();
        if (!rows.length) { emptyResult("No users found. Check the ID or try a different username."); return; }
        rows.forEach(person => {
            const id = Number(person?.worth_it_id);
            if (!Number.isSafeInteger(id) || id < 1) return;
            const link = document.createElement("a");
            link.className = "worth-it-user-search-result";
            link.href = "/profile/" + id;
            link.addEventListener("click", event => openProfile(id, event));
            const avatar = document.createElement("span");
            avatar.className = "worth-it-user-search-avatar";
            const url = typeof person.avatar_url === "string" && /^https?:\/\//i.test(person.avatar_url) ? person.avatar_url : "";
            if (url) {
                const img = document.createElement("img");
                img.src = url; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
                img.addEventListener("error", () => {
                    img.remove();
                    avatar.insertBefore(document.createTextNode(initials(person)), avatar.querySelector(".worth-it-presence-indicator"));
                }, {once:true});
                avatar.appendChild(img);
            } else avatar.textContent = initials(person);
            if (typeof window.renderWorthItPresenceIndicator === "function") window.renderWorthItPresenceIndicator(avatar, person);
            const info = document.createElement("span"); info.className = "worth-it-user-search-result-info";
            const name = document.createElement("strong"); name.textContent = person.display_name || person.username || "Worth It member";
            const username = document.createElement("small"); username.textContent = (person.username ? "@" + person.username + " · " : "") + "Worth It ID " + id;
            const presence = document.createElement("small"); presence.className = "worth-it-user-search-presence"; presence.dataset.worthItPresenceId = String(id);
            presence.textContent = window.getWorthItPresenceInfo ? window.getWorthItPresenceInfo(person).label : "";
            info.append(name, username, presence); link.append(avatar, info);
            link.setAttribute("aria-label", "Open profile for " + (person.display_name || person.username || "Worth It member") + ", Worth It ID " + id);
            host.appendChild(link);
        });
    }
    async function runSearch() {
        const version = ++requestVersion;
        const query = String($("worthItUserSearchInput")?.value || "").trim().replace(/^@/, "").trim();
        if (!query) { setStatus("Start typing to find a Worth It member.", false); emptyResult("Search by unique Worth It ID or username."); return; }
        if (!/^\d+$/.test(query) && query.length < 2) { setStatus("Enter an ID or at least two username characters.", false); emptyResult("Type a little more to search usernames."); return; }
        if (query.length > 50) { setStatus("Search terms must be 50 characters or fewer.", true); emptyResult("Shorten your search and try again."); return; }
        const client = sb();
        if (!client) { setStatus("The search service is not ready. Refresh the page and try again.", true); emptyResult("Search is temporarily unavailable."); return; }
        setStatus("Searching…", false); emptyResult("Looking for matching profiles…");
        try {
            const result = await client.rpc("search_worth_it_public_profiles", {p_query:query,p_limit:20});
            if (version !== requestVersion || !isOpen) return;
            if (result.error) {
                const message = String(result.error.message || result.error.details || "");
                if (/search_worth_it_public_profiles|does not exist|schema cache|could not find/i.test(message)) setStatus("User search is not set up yet. Apply supabase/worth-it-presence-and-read-receipts.sql in Supabase.", true);
                else setStatus("The search could not be completed. Please try again.", true);
                emptyResult("Search is temporarily unavailable."); return;
            }
            const rows = Array.isArray(result.data) ? result.data : [];
            setStatus(rows.length === 1 ? "1 profile found." : rows.length + " profiles found.", false);
            renderResults(rows);
            if (typeof window.refreshWorthItPresenceDisplay === "function") window.refreshWorthItPresenceDisplay();
        } catch (_) {
            if (version !== requestVersion || !isOpen) return;
            setStatus("The search could not be completed. Please try again.", true); emptyResult("Search is temporarily unavailable.");
        }
    }
    function queueSearch() {
        if (searchTimer !== null) window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => { searchTimer = null; runSearch(); }, 220);
    }
    function openSearch(event) {
        event?.preventDefault?.(); event?.stopPropagation?.();
        const dialog = $("worthItUserSearchDialog");
        if (!dialog) return;
        if (dialog.parentElement !== document.body) document.body.appendChild(dialog);
        isOpen = true; dialog.hidden = false; dialog.setAttribute("aria-hidden", "false");
        const input = $("worthItUserSearchInput"); if (input) input.value = "";
        requestVersion++; setStatus("Start typing to find a Worth It member.", false);
        emptyResult("Search by unique Worth It ID or username.");
        window.setTimeout(() => input?.focus(), 20);
    }
    function closeSearch() {
        isOpen = false; requestVersion++;
        if (searchTimer !== null) window.clearTimeout(searchTimer);
        searchTimer = null;
        const dialog = $("worthItUserSearchDialog");
        if (dialog) { dialog.hidden = true; dialog.setAttribute("aria-hidden", "true"); }
        $("worthItUserSearchBtn")?.focus({preventScroll:true});
    }
    window.openWorthItUserSearch = openSearch;
    window.closeWorthItUserSearch = closeSearch;
    $("worthItUserSearchInput")?.addEventListener("input", queueSearch);
    $("worthItUserSearchInput")?.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); if (searchTimer !== null) window.clearTimeout(searchTimer); searchTimer = null; runSearch(); }
    });
    $("worthItUserSearchCloseBtn")?.addEventListener("click", closeSearch);
    $("worthItUserSearchDialog")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeSearch(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && isOpen) closeSearch(); });
})();