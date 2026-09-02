/* =========================================================
   SETTINGS
========================================================= */

function openSettings(){

    $("homePage").style.display = "none";

    document.querySelectorAll(".app")
        .forEach(x => x.classList.remove("active"));

    $("weatherSection").style.display = "none";
    $("newsSection").style.display = "none";

    const settingsPage = $("settingsPage");

    if(!settingsPage){
        console.error("Settings page not found: #settingsPage");
        return;
    }

    settingsPage.style.display = "block";

    $("navLinks").classList.remove("open");

    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "auto";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

window.openSettings = openSettings;

/* =========================================================
   WORTH IT - SETTINGS / SEARCH / FEEDBACK
========================================================= */
(function(){
    "use strict";

    const THEME_KEY = "worthItTheme";
    const UI_SCALE_KEY = "worthItUIScale";
    let feedbackType = "bug";

    const SCALE = {small:.90, normal:1, large:1.10, xl:1.20};

    function setTheme(theme){
        const value = theme === "light" ? "light" : "dark";
        document.documentElement.dataset.theme = value;
        localStorage.setItem(THEME_KEY, value);
        updateSettingsUI();
    }

    function setUIScale(size){
        const value = SCALE[size] ? size : "normal";
        document.documentElement.style.setProperty("--ui-scale", SCALE[value]);
        localStorage.setItem(UI_SCALE_KEY, value);
        updateSettingsUI();
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

    function openTranslateTutorial(){
        $("translateTutorial")?.classList.add("open");
        detectBrowserTab();
    }
    function closeTranslateTutorial(){ $("translateTutorial")?.classList.remove("open"); }
    window.openTranslateTutorial = openTranslateTutorial;
    window.closeTranslateTutorial = closeTranslateTutorial;

    function showTranslateBrowser(kind){
        const map = {chrome:"Chrome", firefox:"Firefox", other:"Other"};
        ["Chrome","Firefox","Other"].forEach(k=>{
            $("translateTab"+k)?.classList.toggle("active", k.toLowerCase() === kind);
        });
        ["Chrome","Firefox","Other"].forEach(k=>{
            $("translateSteps"+k)?.classList.toggle("hidden", k.toLowerCase() !== kind);
        });
    }
    window.showTranslateBrowser = showTranslateBrowser;

    function detectBrowserTab(){
        const ua = navigator.userAgent;
        if(/Firefox/i.test(ua)) showTranslateBrowser("firefox");
        else if(/Edg\//i.test(ua) || /Chrome\//i.test(ua)) showTranslateBrowser("chrome");
        else showTranslateBrowser("other");
    }

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
            await supabaseClient.auth.getSession();

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

window.openAdminFeedback = async function(){
    const overlay = $("adminFeedbackOverlay");
    const status = $("adminFeedbackStatus");
    const list = $("adminFeedbackList");

    if(!overlay || !status || !list) return;

    overlay.classList.add("open");
    status.className = "feedback-status";
    status.textContent = "Loading feedback...";
    list.innerHTML = "";

    try{
        const { data: sessionData } =
            await supabaseClient.auth.getSession();

        const session = sessionData?.session;

        if(!session?.access_token){
            status.className = "feedback-status error";
            status.textContent = "Please sign in.";
            return;
        }

        const r = await fetch("/api/admin-feedback", {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + session.access_token
            }
        });

        const result = await r.json().catch(function(){
            return {};
        });

        if(r.status === 401){
            status.className = "feedback-status error";
            status.textContent = "Please sign in again.";
            return;
        }

        if(r.status === 403){
            status.className = "feedback-status error";
            status.textContent = "Access denied.";
            return;
        }

        if(!r.ok){
            throw new Error(
                result.error || "Could not load feedback."
            );
        }

        const feedback = Array.isArray(result.feedback)
            ? result.feedback
            : [];

        if(!feedback.length){
            status.className = "feedback-status";
            status.textContent = "No feedback yet.";
            list.innerHTML = "";
            return;
        }

        status.className = "feedback-status";
        status.textContent = feedback.length + " feedback item" +
            (feedback.length === 1 ? "" : "s");

        list.innerHTML = feedback.map(function(item){
            const type =
                item.type === "bug"
                    ? "🐞 Bug"
                    : "💡 Suggestion";

            const date = item.created_at
                ? new Date(item.created_at).toLocaleString()
                : "Unknown date";

            const message =
                String(item.message || "")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");

            const page =
                String(item.page || "")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");

            return `
                <div class="admin-feedback-item">
                    <div class="admin-feedback-item-head">
                        <div class="admin-feedback-type">${type}</div>
                        <div class="admin-feedback-date">${date}</div>
                    </div>
                    <div class="admin-feedback-message">${message}</div>
                    <div class="admin-feedback-page">
                        Page: ${page || "Unknown"}
                    </div>
                </div>
            `;
        }).join("");

    }catch(error){
        console.error("Admin feedback load failed:", error);

        status.className = "feedback-status error";
        status.textContent =
            "Could not load feedback.";
    }
};

window.loadAdminFeedback = async function(){
    await window.openAdminFeedback();
};

window.closeAdminFeedback = function(){
    $("adminFeedbackOverlay")?.classList.remove("open");
};

async function updateAdminFeedbackButton(){
    const btn = $("adminFeedbackNavBtn");

    if(!btn) return;

    try{
        const { data } =
            await supabaseClient.auth.getSession();

        const user = data?.session?.user;

        btn.style.display =
            user?.id === "c3560d70-8b68-49f0-b3f1-9e248673553c"
                ? ""
                : "none";

    }catch(error){
        btn.style.display = "none";
    }
}

supabaseClient.auth.onAuthStateChange(function(){
    updateAdminFeedbackButton();
});

updateAdminFeedbackButton();

$("adminFeedbackOverlay")?.addEventListener("click", function(event){
    if(event.target === $("adminFeedbackOverlay")){
        closeAdminFeedback();
    }
});

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
