/* =========================================================
GLOBAL DOM HELPER
========================================================= */

window.$ = function (id) {
    return document.getElementById(id);
};


/* =========================================================
SUPABASE AUTH
========================================================= */

const SUPABASE_URL =
    "https://diutcnylnubljvpezhmq.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_W9769alA1ckSllKvue4U2Q_TdXpWnjp";


window.supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );


let currentAuthUser = null;


/* =========================================================
USER HELPERS
========================================================= */

function getUserDisplayName(user) {

    return (
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email?.split("@")[0] ||
        "User"
    );

}


function getUserAvatar(user) {

    return (
        user?.user_metadata?.avatar_url ||
        user?.user_metadata?.picture ||
        ""
    );

}


function makeAvatarMarkup(
    user,
    className = "auth-avatar"
) {

    const avatar =
        getUserAvatar(user);


    if (avatar) {

        return `<img
            class="${className}"
            src="${avatar.replaceAll('"', "&quot;")}"
            alt=""
            referrerpolicy="no-referrer"
        >`;

    }


    const initial =
        getUserDisplayName(user)
            .charAt(0)
            .toUpperCase();


    const fallbackClass =
        className.includes("account-head")
            ? "account-head-fallback"
            : "auth-avatar-fallback";


    return `
        <div class="${fallbackClass}">
            ${initial}
        </div>
    `;
}


/* =========================================================
ACCOUNT PANEL
========================================================= */

function closeAccountPanel() {

    const panel = $("accountPanel");

    if (!panel) return;

    panel.classList.remove("open");

    panel.setAttribute(
        "aria-hidden",
        "true"
    );

    /*
     * The mobile panel is temporarily moved outside the zoomed body.
     * Put it back into its original place when it closes so desktop
     * and normal document structure remain unchanged.
     */
    if (panel._worthItOriginalParent) {
        const parent = panel._worthItOriginalParent;
        const next = panel._worthItOriginalNextSibling;

        if (next && next.parentNode === parent) {
            parent.insertBefore(panel, next);
        } else {
            parent.appendChild(panel);
        }

        panel._worthItOriginalParent = null;
        panel._worthItOriginalNextSibling = null;
    }

    panel.classList.remove("mobile-account-portal");

    panel.style.position = "";
    panel.style.left = "";
    panel.style.right = "";
    panel.style.top = "";
    panel.style.width = "";
    panel.style.maxWidth = "";
    panel.style.maxHeight = "";
    panel.style.transform = "";
    panel.style.zoom = "";
}


function positionAccountPanelForMobile() {

    const panel = $("accountPanel");
    const profileBtn = $("profileNavBtn");

    if (!panel || !profileBtn) return;

    /*
     * Desktop/tablet: leave the existing account panel completely
     * untouched.
     */
    if (window.innerWidth > 700) {
        return;
    }

    if (!panel.classList.contains("open")) {
        return;
    }

    /*
     * IMPORTANT:
     *
     * The whole <body> is zoomed for A- / A / A+ / A++.
     * A positioned child inside that zoomed body cannot reliably
     * use viewport coordinates on Android Chrome.
     *
     * For phones we therefore portal ONLY this dropdown to <html>,
     * which is outside the zoomed body. We then apply the selected
     * UI scale directly to the panel itself.
     *
     * Result:
     *   - the panel remains the same visual scale as the rest of UI
     *   - its physical width is constrained to the phone
     *   - it is horizontally centered
     *   - A- and A++ no longer push it off-screen
     */
    if (!panel._worthItOriginalParent) {
        panel._worthItOriginalParent = panel.parentNode;
        panel._worthItOriginalNextSibling = panel.nextSibling;

        document.documentElement.appendChild(panel);
    }

    panel.classList.add("mobile-account-portal");

    const scale =
        Number.parseFloat(
            getComputedStyle(document.documentElement)
                .getPropertyValue("--ui-scale")
        ) || 1;

    const viewportWidth =
        window.visualViewport?.width ||
        document.documentElement.clientWidth ||
        window.innerWidth;

    const profileRect =
        profileBtn.getBoundingClientRect();

    const margin = 10;
    const desiredPhysicalWidth = 380;

    const physicalWidth = Math.min(
        desiredPhysicalWidth,
        Math.max(220, viewportWidth - (margin * 2))
    );

    /*
     * The portal itself is unzoomed. Compensate the panel's CSS
     * dimensions by its own zoom so the final rendered width is
     * exactly the desired physical width.
     */
    panel.style.position = "fixed";
    panel.style.left = "50vw";
    panel.style.right = "auto";
    panel.style.top = (profileRect.bottom + 8) + "px";
    panel.style.transform = "translateX(-50%)";
    panel.style.boxSizing = "border-box";
    panel.style.width = (physicalWidth / scale) + "px";
    panel.style.maxWidth = (physicalWidth / scale) + "px";
    panel.style.zoom = String(scale);

    /*
     * Keep the menu inside the visible vertical area as much as
     * possible. The panel itself scrolls if its contents are taller.
     */
    const top = profileRect.bottom + 8;
    const bottomMargin = 10;
    const availableHeight =
        Math.max(180, window.innerHeight - top - bottomMargin);

    panel.style.maxHeight =
        (availableHeight / scale) + "px";
}



function toggleAccountPanel() {

    if (!currentAuthUser) return;

    const panel =
        $("accountPanel");

    if (!panel) return;

    /*
     * On phones, portal the panel BEFORE the click event reaches the
     * document-level outside-click handler. This prevents the handler
     * from immediately closing the newly opened panel after it is moved
     * outside #authWrap.
     */
    if (
        window.innerWidth <= 700 &&
        !panel._worthItOriginalParent
    ) {
        panel._worthItOriginalParent = panel.parentNode;
        panel._worthItOriginalNextSibling = panel.nextSibling;
        document.documentElement.appendChild(panel);
        panel.classList.add("mobile-account-portal");
    }

    const open =
        panel.classList.toggle("open");

    panel.setAttribute(
        "aria-hidden",
        String(!open)
    );

    if (open) {
        positionAccountPanelForMobile();
    } else {
        closeAccountPanel();
    }
}


/* =========================================================
AUTH UI
========================================================= */

function updateAuthUI(user) {

    currentAuthUser =
        user || null;


    const btn =
        $("authBtn");

    const icon =
        $("authIcon");

    const label =
        $("authLabel");

    const profileBtn =
        $("profileNavBtn");

    const profileIcon =
        $("profileNavIcon");

    const panel =
        $("accountPanel");

    const signOutBtn =
        $("signOutNavBtn");


    if (
        !btn ||
        !icon ||
        !label ||
        !profileBtn ||
        !profileIcon ||
        !signOutBtn
    ) {
        return;
    }


    if (user) {

        btn.style.display =
            "none";


        profileBtn.style.display =
            "inline-flex";


        profileBtn.title =
            `Open profile for ${getUserDisplayName(user)}`;


        profileBtn.setAttribute(
            "aria-label",
            `Open profile for ${getUserDisplayName(user)}`
        );


        profileIcon.innerHTML =
            makeAvatarMarkup(
                user,
                "auth-avatar"
            );


        if ($("accountHeadAvatar")) {

            $("accountHeadAvatar").innerHTML =
                makeAvatarMarkup(
                    user,
                    "account-head-avatar"
                );

        }


        if ($("accountName")) {

            $("accountName").textContent =
                getUserDisplayName(user);

        }


        if ($("accountEmail")) {

            $("accountEmail").textContent =
                user.email || "";

        }


        if (panel) {

            panel.style.display =
                "";

            closeAccountPanel();

        }


        signOutBtn.style.display =
            "inline-flex";


    } else {

        btn.style.display =
            "inline-flex";


        btn.onclick =
            handleAuthButton;


        btn.title =
            "Sign in with Google";


        icon.textContent =
            "🔐";


        label.textContent =
            "Sign in";


        profileBtn.style.display =
            "none";


        profileIcon.innerHTML =
            "👤";


        closeAccountPanel();


        signOutBtn.style.display =
            "none";


        if ($("accountHeadAvatar")) {

            $("accountHeadAvatar").innerHTML =
                "";

        }


        if ($("accountName")) {

            $("accountName").textContent =
                "Account";

        }


        if ($("accountEmail")) {

            $("accountEmail").textContent =
                "";

        }

    }

}


/* =========================================================
SIGN IN
========================================================= */

async function handleAuthButton() {

    if (currentAuthUser) {

        toggleAccountPanel();

        return;
    }


    try {

        const { error } =
            await window.supabaseClient.auth
                .signInWithOAuth({

                    provider: "google",

                    options: {

                        redirectTo:
                            `${window.location.origin}/`

                    }

                });


        if (error) {

            console.error(
                "Supabase Google sign-in error:",
                error
            );


            if (
                typeof showToast ===
                "function"
            ) {

                showToast(
                    "Could not start Google sign-in."
                );

            }

        }


    } catch (error) {

        console.error(
            "Supabase Google sign-in error:",
            error
        );


        if (
            typeof showToast ===
            "function"
        ) {

            showToast(
                "Could not start Google sign-in."
            );

        }

    }

}


/* =========================================================
SIGN OUT
========================================================= */

async function signOutUser() {

    try {

        const { error } =
            await window.supabaseClient.auth
                .signOut();


        if (error) {

            console.error(
                "Supabase sign-out error:",
                error
            );


            if (
                typeof showToast ===
                "function"
            ) {

                showToast(
                    "Could not sign out."
                );

            }

            return;
        }


        closeAccountPanel();


        if (
            typeof showToast ===
            "function"
        ) {

            showToast(
                "Signed out."
            );

        }


    } catch (error) {

        console.error(
            "Supabase sign-out error:",
            error
        );


        if (
            typeof showToast ===
            "function"
        ) {

            showToast(
                "Could not sign out."
            );

        }

    }

}


/* =========================================================
ACCOUNT PAGE
========================================================= */

function closeAccountPage() {

    $("accountPageOverlay")
        ?.classList.remove("open");

}


function renderAccountPageAvatar(user) {

    if (!user) return;


    const holder =
        $("accountPageAvatar");


    if (!holder) return;


    const avatar =
        getUserAvatar(user);


    if (avatar) {

        holder.innerHTML =
            `<img
                class="account-page-avatar"
                src="${avatar.replaceAll('"', "&quot;")}"
                alt=""
                referrerpolicy="no-referrer"
            >`;


    } else {

        holder.innerHTML =
            `<div class="account-page-avatar-fallback">
                ${getUserDisplayName(user)
                    .charAt(0)
                    .toUpperCase()}
            </div>`;

    }

}


function openAccountInfo(
    section = "profile"
) {

    closeAccountPanel();


    if (!currentAuthUser) {

        if (
            typeof showToast ===
            "function"
        ) {

            showToast(
                "Please sign in first."
            );

        }

        return;
    }


    const overlay =
        $("accountPageOverlay");

    const title =
        $("accountPageTitle");

    const email =
        $("accountPageEmail");

    const content =
        $("accountPageContent");


    if (
        !overlay ||
        !title ||
        !email ||
        !content
    ) {
        return;
    }


    renderAccountPageAvatar(
        currentAuthUser
    );


    email.textContent =
        currentAuthUser.email || "";


    if ($("accountPageFriends")) {

        $("accountPageFriends").textContent =
            "0";

    }


    if ($("accountPageFollowers")) {

        $("accountPageFollowers").textContent =
            "0";

    }


    if ($("accountPageFollowing")) {

        $("accountPageFollowing").textContent =
            "0";

    }


    const name =
        getUserDisplayName(
            currentAuthUser
        );


    if (section === "profile") {

        title.textContent =
            name;


        content.innerHTML =
            `<strong>👤 Your profile</strong><br>
            <span>
                Welcome to your Worth It profile.
                Your account is connected and ready
                for the social features.
            </span>`;


    } else if (section === "friends") {

        title.textContent =
            "Friends";


        content.innerHTML =
            `<strong>🤝 No friends yet</strong><br>
            <span>
                Your friends list is empty.
                Friends will appear here once you add people.
            </span>`;


    } else if (section === "followers") {

        title.textContent =
            "Followers";


        content.innerHTML =
            `<strong>👥 No followers yet</strong><br>
            <span>
                People who follow your profile
                will appear here.
            </span>`;


    } else if (section === "following") {

        title.textContent =
            "Following";


        content.innerHTML =
            `<strong>➕ Not following anyone yet</strong><br>
            <span>
                Profiles you follow will appear here.
            </span>`;


    } else {

        title.textContent =
            name;


        content.innerHTML =
            `<strong>👤 Your profile</strong><br>
            <span>
                Your profile is ready.
            </span>`;

    }


    overlay.classList.add("open");

}


/* =========================================================
GLOBAL AUTH FUNCTIONS
========================================================= */

window.closeAccountPage =
    closeAccountPage;

window.handleAuthButton =
    handleAuthButton;

window.signOutUser =
    signOutUser;

window.openAccountInfo =
    openAccountInfo;

window.toggleAccountPanel =
    toggleAccountPanel;

window.updateAuthUI =
    updateAuthUI;


/* =========================================================
SUPABASE AUTH STATE
========================================================= */

window.supabaseClient.auth.onAuthStateChange(
    (event, session) => {

        updateAuthUI(
            session?.user || null
        );


        if (
            typeof updateAIChatView ===
            "function"
        ) {

            updateAIChatView();

        }

    }
);


/* =========================================================
INITIALIZE SUPABASE AUTH
========================================================= */

(async function initializeSupabaseAuth() {

    try {

        const {
            data,
            error
        } =
            await window.supabaseClient.auth
                .getSession();


        if (error) {

            console.error(
                "Supabase session error:",
                error
            );


            updateAuthUI(null);

            return;
        }


        updateAuthUI(
            data.session?.user || null
        );


    } catch (error) {

        console.error(
            "Supabase initialization error:",
            error
        );


        updateAuthUI(null);

    }

})();


/* =========================================================
ACCOUNT EVENTS
========================================================= */

document.addEventListener(
    "click",
    event => {

        const wrap =
            $("authWrap");


        const panel =
            $("accountPanel");

        /*
         * On phones the account panel is temporarily portalled
         * outside #authWrap so it can escape the zoomed body.
         * Treat clicks inside that panel as internal clicks too.
         */
        const clickedInsideWrap =
            wrap &&
            wrap.contains(event.target);

        const clickedInsidePanel =
            panel &&
            panel.contains(event.target);

        if (
            wrap &&
            !clickedInsideWrap &&
            !clickedInsidePanel
        ) {

            closeAccountPanel();

        }

    }
);


$("accountPageOverlay")
    ?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                event.currentTarget
            ) {

                closeAccountPage();

            }

        }
    );


document.addEventListener(
    "keydown",
    event => {

        if (event.key === "Escape") {

            closeAccountPage();
            closeAccountPanel();

        }

    }
);


function hideCarsNavigationUi() {

    const carsSection =
        document.getElementById("carsSection");

    if (carsSection) {
        carsSection.style.display = "none";
    }

    const compareBar =
        document.getElementById(
            "worthItVehicleCompareBar"
        );

    if (compareBar) {
        compareBar.remove();
    }

    const floatingCollapse =
        document.getElementById(
            "worthItVehicleFloatingCollapse"
        );

    if (floatingCollapse) {
        floatingCollapse.classList.remove(
            "is-visible"
        );
    }

}

window.hideCarsNavigationUi =
    hideCarsNavigationUi;


/* =========================================================
CALCULATOR NAVIGATION
========================================================= */

function openCalculator(type) {

    hideCarsNavigationUi();

    const homePage =
        document.getElementById("homePage");

    const weatherSection =
        document.getElementById("weatherSection");

    const newsSection =
        document.getElementById("newsSection");

    const settingsPanel =
        document.getElementById("settingsPanel");

    const calculatorApp =
        document.getElementById("calculatorApp");

    const carsApp =
        document.getElementById("carsApp");

    const genericApp =
        document.getElementById("genericApp");

    const carResults =
        document.getElementById("carResults");

    const navLinks =
        document.getElementById("navLinks");

    const discountsSection =
        document.getElementById("discountsSection");

    const marketsSection =
        document.getElementById("marketsSection");

    const moneySection =
        document.getElementById("moneySection");

    if (homePage) {

        homePage.style.display =
            "none";

    }


    if (weatherSection) {

        weatherSection.style.display =
            "none";

    }


    if (newsSection) {

        newsSection.style.display =
            "none";

    }


    if (settingsPanel) {

    settingsPanel.style.display =
        "none";

}

    if (discountsSection) {

    discountsSection.style.display =
        "none";

}

    if (marketsSection) {
    marketsSection.style.display = "none";

}

if (moneySection) {
    moneySection.style.display = "none";

}

    document
        .querySelectorAll(".app")
        .forEach(app => {

            app.classList.remove(
                "active"
            );

            app.style.display =
                "none";

        });


    if (
        type === "basic" ||
        type === "advanced" ||
        type === "scientific"
    ) {

        if (calculatorApp) {

            calculatorApp.style.display =
                "block";

            calculatorApp.classList.add(
                "active"
            );

        }


        if (
            typeof setCalculatorMode ===
            "function"
        ) {

            setCalculatorMode(type);

        }


    } else if (type === "cars") {

        if (carsApp) {

            carsApp.style.display =
                "block";

            carsApp.classList.add(
                "active"
            );

        }


        if (carResults) {

            carResults.style.display =
                "none";

        }


    } else {

        if (genericApp) {

            genericApp.style.display =
                "block";

            genericApp.classList.add(
                "active"
            );

        }


        if (
            typeof setupGeneric ===
            "function"
        ) {

            setupGeneric(type);

        }

    }


    window.scrollTo({

        top: 0,

        behavior: "smooth"

    });


    document.documentElement.style.overflowY =
        "auto";

    document.body.style.overflowY =
        "auto";


    if (navLinks) {

        navLinks.classList.remove(
            "open"
        );

    }

}


window.openCalculator =
    openCalculator;

function showHome() {

    hideCarsNavigationUi();
    const homePage = document.getElementById("homePage");
    const weatherSection = document.getElementById("weatherSection");
    const newsSection = document.getElementById("newsSection");
    const settingsPanel = document.getElementById("settingsPanel");

    const discountsSection =
        document.getElementById("discountsSection");

    const marketsSection =
    document.getElementById("marketsSection");

    const moneySection =
    document.getElementById("moneySection");
    
    // Sakrij sve aplikacije
    document.querySelectorAll(".app").forEach(app => {
        app.classList.remove("active");
        app.style.display = "none";
    });

    // Sakrij posebne sekcije
    if (weatherSection) {
        weatherSection.style.display = "none";
    }

    if (newsSection) {
        newsSection.style.display = "none";
    }

    if (settingsPanel) {
        settingsPanel.style.display = "none";
    }

    if (discountsSection) {
        discountsSection.style.display = "none";
    }

    if (marketsSection) {
    marketsSection.style.display = "none";
}

if (moneySection) {
    moneySection.style.display = "none";
}
    
    // Vrati sve calculator kartice
    document.querySelectorAll(".calc-card").forEach(card => {
        card.style.display = "";
    });

    // Vrati category filter na All
    const filter = document.getElementById("categoryFilter");

    if (filter) {
        filter.value = "all";
    }

    // Prikaži početnu stranicu
    if (homePage) {
        homePage.style.display = "block";

        /*
         * Home contains its calculators, how-it-works content and FAQ
         * as nested sections. Cars navigation previously hid all
         * .section elements globally, so explicitly restore Home's
         * own nested sections whenever returning here.
         */
        homePage
            .querySelectorAll(".section")
            .forEach(section => {
                section.style.display = "";
            });
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

window.showHome = showHome;


function showCategory(category) {
    showHome();

    const calculators = document.getElementById("calculators");
    const filter = document.getElementById("categoryFilter");

    if (!calculators) return;

    if (filter) {
        filter.value = category;
    }

    const cards = document.querySelectorAll(".calc-card");

    cards.forEach(card => {
        const cardCategory = card.getAttribute("data-category");

        if (cardCategory === category) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    });

    setTimeout(() => {
        calculators.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, 50);
}
window.showCategory = showCategory;

function scrollToFAQ() {
    showHome();

    const faq = document.getElementById("faq");

    if (!faq) return;

    setTimeout(() => {
        faq.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, 50);
}

window.scrollToFAQ = scrollToFAQ;


function toggleSettings() {
    const settingsPanel =
        document.getElementById("settingsPanel");

    if (!settingsPanel) return;

    const isHidden =
        settingsPanel.style.display === "none" ||
        getComputedStyle(settingsPanel).display === "none";

    settingsPanel.style.display =
        isHidden ? "block" : "none";
}

window.toggleSettings = toggleSettings;

function money(value) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

window.money = money;

function decimal(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return number.toLocaleString("en-US", {
        maximumFractionDigits: 2
    });
}

window.decimal = decimal;

function toggleMenu() {
    const navLinks =
        document.getElementById("navLinks");

    if (!navLinks) return;

    const isOpen =
        navLinks.classList.toggle("open");

    navLinks.setAttribute(
        "aria-hidden",
        String(!isOpen)
    );

    const menuButton =
        document.querySelector(".menu-btn");

    if (menuButton) {
        menuButton.setAttribute(
            "aria-expanded",
            String(isOpen)
        );
    }

    /*
     * The mobile and A+/A++ navigation is one unified menu.
     * The legacy More panel remains available only for A-/A
     * desktop, so never leave both navigation layers open.
     */
    if (isOpen) {
        closeMoreMenu();
    }

    document
        .documentElement
        .style
        .setProperty("--nav-scroll-lock", isOpen ? "1" : "0");
}

window.toggleMenu = toggleMenu;

function closeMoreMenu() {
    const menu = document.getElementById("moreMenu");
    if (!menu) return;

    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
}

function toggleMoreMenu() {
    // Guest → Google login
    if (!currentAuthUser) {
        handleAuthButton();
        return;
    }

    const menu = document.getElementById("moreMenu");
    if (!menu) return;

    const isOpen = menu.classList.contains("open");

    if (isOpen) {
        closeMoreMenu();
    } else {
        menu.classList.add("open");
        menu.setAttribute("aria-hidden", "false");
    }
}

function openDiscountsFromMenu() {
    closeMoreMenu();

    if (typeof window.openDiscounts === "function") {
        window.openDiscounts();
    }
}

window.toggleMoreMenu = toggleMoreMenu;
window.closeMoreMenu = closeMoreMenu;
window.openDiscountsFromMenu = openDiscountsFromMenu;
function openMarketsFromMenu() {
    closeMoreMenu();

    if (typeof window.openMarkets === "function") {
        window.openMarkets();
    }
}

function openCarsFromMenu() {
    closeMoreMenu();

    if (typeof window.openCars === "function") {
        window.openCars();
    }
}

window.openCarsFromMenu = openCarsFromMenu;

window.openMarketsFromMenu = openMarketsFromMenu;

function openMoneyFromMenu() {
    closeMoreMenu();

    if (typeof window.openMoney === "function") {
        window.openMoney();
    }
}

window.openMoneyFromMenu = openMoneyFromMenu;

function openMarkets() {

    hideCarsNavigationUi();

    const carsSection =
        document.getElementById("carsSection");

    if (carsSection) {
        carsSection.style.display = "none";
    }

    const homePage =
        document.getElementById("homePage");

    if (homePage) {
        homePage.style.display = "none";
    }

    document.querySelectorAll(".app").forEach(x => {
        x.classList.remove("active");
        x.style.display = "none";
    });

    const weatherSection =
        document.getElementById("weatherSection");

    if (weatherSection) {
        weatherSection.style.display = "none";
    }

    const newsSection =
        document.getElementById("newsSection");

    if (newsSection) {
        newsSection.style.display = "none";
    }

    const discountsSection =
        document.getElementById("discountsSection");

    if (discountsSection) {
        discountsSection.style.display = "none";
    }

    const settingsPanel =
        document.getElementById("settingsPanel");

    if (settingsPanel) {
        settingsPanel.style.display = "none";
    }

    const marketsSection =
        document.getElementById("marketsSection");

    const moneySection =
    document.getElementById("moneySection");

if (moneySection) {
    moneySection.style.display = "none";
}
    
    if (marketsSection) {
        marketsSection.style.display = "block";
    }

    const navLinks =
        document.getElementById("navLinks");

    if (navLinks) {
        navLinks.classList.remove("open");
    }

    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "auto";

    window.scrollTo({
        top: 0,
        behavior: "auto"
    });
}

window.openMarkets = openMarkets;

function openMoney() {

    hideCarsNavigationUi();

    const carsSection =
        document.getElementById("carsSection");

    if (carsSection) {
        carsSection.style.display = "none";
    }

    const homePage =
        document.getElementById("homePage");

    if (homePage) {
        homePage.style.display = "none";
    }

    document.querySelectorAll(".app").forEach(x => {
        x.classList.remove("active");
        x.style.display = "none";
    });

    const weatherSection =
        document.getElementById("weatherSection");

    if (weatherSection) {
        weatherSection.style.display = "none";
    }

    const newsSection =
        document.getElementById("newsSection");

    if (newsSection) {
        newsSection.style.display = "none";
    }

    const discountsSection =
        document.getElementById("discountsSection");

    if (discountsSection) {
        discountsSection.style.display = "none";
    }

    const settingsPanel =
        document.getElementById("settingsPanel");

    if (settingsPanel) {
        settingsPanel.style.display = "none";
    }

    const marketsSection =
    document.getElementById("marketsSection");

if (marketsSection) {
    marketsSection.style.display = "none";
}

const moneySection =
    document.getElementById("moneySection");

if (moneySection) {
    moneySection.style.display = "block";
}

if (typeof initCurrenciesUI === "function") {
    initCurrenciesUI();
}
    
const navLinks =
    document.getElementById("navLinks");

if (navLinks) {
    navLinks.classList.remove("open");
}

document.documentElement.style.overflowY = "auto";
document.body.style.overflowY = "auto";

window.scrollTo({
    top: 0,
    behavior: "smooth"
});
}

window.openMoney = openMoney;
