/* =========================================================
   SETTINGS
========================================================= */

function openFullSettings(){
    const settingsPage = document.getElementById("settingsPage");
    if (!settingsPage) {
        console.error("Settings page not found: #settingsPage");
        return;
    }

    const homePage = document.getElementById("homePage");
    if (homePage) homePage.style.display = "none";
    document.querySelectorAll(".app").forEach(function (section) {
        section.classList.remove("active");
        section.style.display = "none";
    });
    [
        "weatherSection", "newsSection", "discountsSection", "marketsSection",
        "moneySection", "cryptoSection", "waterLevelsSection", "shipTrackingSection",
        "profileSection"
    ].forEach(function (id) {
        const section = document.getElementById(id);
        if (section) section.style.display = "none";
    });

    const compactPanel = document.getElementById("settingsPanel");
    if (compactPanel) compactPanel.style.display = "none";
    document.documentElement.classList.remove("settings-open");
    settingsPage.style.display = "block";
    document.getElementById("navLinks")?.classList.remove("open");
    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "auto";
    if (typeof window.updateSettingsUI === "function") window.updateSettingsUI();
    window.scrollTo({ top: 0, behavior: "auto" });
}

window.openFullSettings = openFullSettings;
window.openSettings = openFullSettings;

/* =========================================================
   WORTH IT - SETTINGS / SEARCH / FEEDBACK
========================================================= */
(function(){
    "use strict";

    const THEME_KEY = "worthItTheme";
    const UI_SCALE_KEY = "worthItUIScale";
    let feedbackType = "bug";

    /* Global website scale. Every section inherits this setting. */
    const SCALE = {small:.82, normal:1, large:1.16, xl:1.32};

    function notifySettingsChange(){
        window.dispatchEvent(new CustomEvent("worthitsettingschange", {
            detail: {
                theme: document.documentElement.dataset.theme || "dark",
                scale: Number.parseFloat(
                    getComputedStyle(document.documentElement)
                        .getPropertyValue("--ui-scale")
                ) || 1
            }
        }));
    }

    function setTheme(theme){
        const value = theme === "light" ? "light" : "dark";
        document.documentElement.dataset.theme = value;
        localStorage.setItem(THEME_KEY, value);
        updateSettingsUI();
        notifySettingsChange();
    }

    function setUIScale(size){
        const value = SCALE[size] ? size : "normal";
        const scale = SCALE[value];

        document.documentElement.style.setProperty(
            "--ui-scale",
            scale
        );

        document.documentElement.dataset.uiScale =
            value;

        /*
         * style.css applies --ui-scale to body zoom.
         * Keeping one source of truth avoids an extra inline style update.
         */

        localStorage.setItem(
            UI_SCALE_KEY,
            value
        );

        updateSettingsUI();
        notifySettingsChange();
    }

    function updateSettingsUI(){
        const theme = localStorage.getItem(THEME_KEY) || "dark";
        const size = localStorage.getItem(UI_SCALE_KEY) || "normal";
        $("themeDarkBtn")?.classList.toggle("active", theme === "dark");
        $("themeLightBtn")?.classList.toggle("active", theme === "light");
        $("sizeSmallBtn")?.classList.toggle("active", size === "small");
        $("sizeNormalBtn")?.classList.toggle("active", size === "normal");
        $("sizeLargeBtn")?.classList.toggle("active", size === "large");
        $("sizeXLBtn")?.classList.toggle("active", size === "xl");
        $("settingsPageThemeDarkBtn")?.classList.toggle("active", theme === "dark");
        $("settingsPageThemeLightBtn")?.classList.toggle("active", theme === "light");
        $("settingsPageSizeSmallBtn")?.classList.toggle("active", size === "small");
        $("settingsPageSizeNormalBtn")?.classList.toggle("active", size === "normal");
        $("settingsPageSizeLargeBtn")?.classList.toggle("active", size === "large");
        $("settingsPageSizeXLBtn")?.classList.toggle("active", size === "xl");
    }

    function applySettings(){
        setTheme(localStorage.getItem(THEME_KEY) || "dark");
        setUIScale(localStorage.getItem(UI_SCALE_KEY) || "normal");
    }

    window.setTheme = setTheme;
    window.setUIScale = setUIScale;
    window.updateSettingsUI = updateSettingsUI;
    window.resetSettings = function(){
        localStorage.removeItem(THEME_KEY);
        localStorage.removeItem(UI_SCALE_KEY);
        setTheme("dark");
        setUIScale("normal");
        showToast("Settings reset.");
    };

    function cardType(card){
        const raw = card.querySelector(".open-calc")?.getAttribute("onclick") || "";
        const m = raw.match(/openCalculator\(['\"]([^'\"]+)['\"]\)/);
        return m ? m[1] : null;
    }

    function applyFilters(){
        const q = ($("calculatorSearch")?.value || "").trim().toLowerCase();
        const cat = $("categoryFilter")?.value || "all";
        const grid = $("calculatorGrid");
        if(!grid) return;

        let count = 0;
        grid.querySelectorAll(".calc-card").forEach(card=>{
            const title = (card.querySelector("h3")?.textContent || "").toLowerCase();
            const desc = (card.querySelector("p")?.textContent || "").toLowerCase();
            const ok = (cat === "all" || card.dataset.category === cat) && (!q || title.includes(q) || desc.includes(q));
            card.style.display = ok ? "" : "none";
            if(ok) count++;
        });

        const existing = grid.querySelector(".calc-empty");
        if(existing) existing.remove();
        if(!count){
            const empty = document.createElement("div");
            empty.className = "calc-empty";
            empty.textContent = "No calculators match your search.";
            grid.appendChild(empty);
        }
    }
    window.applyCalculatorFilters = applyFilters;

    window.openFeedback = function(){
        $("feedbackOverlay")?.classList.add("open");
        $("feedbackStatus").textContent = "";
        $("feedbackStatus").className = "feedback-status";
        setFeedbackType("bug");
        $("feedbackMessage")?.focus();
    };
    window.closeFeedback = function(){ $("feedbackOverlay")?.classList.remove("open"); };
    window.setFeedbackType = function(type){
        feedbackType = type === "suggestion" ? "suggestion" : "bug";
        $("feedbackBugBtn")?.classList.toggle("active", feedbackType === "bug");
        $("feedbackSuggestionBtn")?.classList.toggle("active", feedbackType === "suggestion");
    };
    window.submitFeedback = async function(){
    const msg = $("feedbackMessage")?.value.trim() || "";
    const honey = $("feedbackHoneypot")?.value || "";
    const status = $("feedbackStatus");
    const btn = $("feedbackSubmitBtn");

    if(honey) return;

    if(!msg){
        status.className = "feedback-status error";
        status.textContent = "Please enter a message.";
        return;
    }

    btn.disabled = true;
    status.className = "feedback-status";
    status.textContent = "Sending...";

    try{
        const { data: sessionData } =
            await window.supabaseClient.auth.getSession();

        const session = sessionData?.session;

        if(!session?.access_token){
            status.className = "feedback-status error";
            status.textContent = "Please sign in before sending feedback.";
            return;
        }

        const r = await fetch("/api/feedback", {
            method:"POST",
            headers:{
                "Content-Type":"application/json",
                "Authorization":"Bearer " + session.access_token
            },
            body:JSON.stringify({
                type:feedbackType,
                message:msg,
                page:location.pathname
            })
        });

        const result = await r.json().catch(function(){
            return {};
        });

        if(r.status === 429){
            status.className = "feedback-status error";
            status.textContent =
                "Please wait 30 minutes before sending another feedback report.";
            return;
        }

        if(r.status === 401){
            status.className = "feedback-status error";
            status.textContent =
                "Please sign in before sending feedback.";
            return;
        }

        if(!r.ok){
            throw new Error(
                result.message ||
                result.error ||
                "Feedback request failed"
            );
        }

        $("feedbackMessage").value = "";

        status.className = "feedback-status success";

        status.textContent =
            feedbackType === "bug"
                ? "Thanks! Your bug was reported privately."
                : "Thanks! Your suggestion was sent privately.";

    }catch(error){
        status.className = "feedback-status error";
        status.textContent =
            "Could not send feedback. Please try again.";
    }finally{
        btn.disabled = false;
    }
};

    /* Admin Panel functionality lives in admin-panel.js. */

    $("calculatorSearch")?.addEventListener("input", applyFilters);
    $("categoryFilter")?.addEventListener("change", applyFilters);
    $("clearCalculatorFilters")?.addEventListener("click", ()=>{
        if($("calculatorSearch")) $("calculatorSearch").value = "";
        if($("categoryFilter")) $("categoryFilter").value = "all";
        applyFilters();
    });

    $("translateTutorial")?.addEventListener("click", e=>{
        if(e.target === e.currentTarget) closeTranslateTutorial();
    });
    $("feedbackOverlay")?.addEventListener("click", e=>{
        if(e.target === e.currentTarget) closeFeedback();
    });
    document.addEventListener("keydown", e=>{
        if(e.key === "Escape"){
            closeTranslateTutorial();
            closeFeedback();
        }
    });

    // The browser owns page translation; the website no longer has an internal language system.
    applySettings();
    applyFilters();
})();
