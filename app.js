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
                detectSessionInUrl: true,
                storage: window.localStorage
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
}


/*
 * The account dropdown stays inside #authWrap on phones.
 * The mobile CSS positions it from the profile control and keeps
 * it inside the phone viewport while respecting the UI scale.
 */
function positionAccountPanelForMobile() {

    const panel = $("accountPanel");

    if (!panel) return;

    if (
        window.innerWidth > 700 ||
        !panel.classList.contains("open")
    ) {
        return;
    }

    panel.style.removeProperty("display");
    panel.style.removeProperty("visibility");
    panel.style.removeProperty("opacity");
    panel.style.removeProperty("pointer-events");
    panel.style.removeProperty("position");
    panel.style.removeProperty("left");
    panel.style.removeProperty("right");
    panel.style.removeProperty("top");
    panel.style.removeProperty("width");
    panel.style.removeProperty("max-width");
    panel.style.removeProperty("max-height");
    panel.style.removeProperty("transform");
    panel.style.removeProperty("zoom");
    panel.style.removeProperty("z-index");
}


function toggleAccountPanel(event) {

    if (!currentAuthUser) return;

    const panel =
        $("accountPanel");

    if (!panel) return;

    /*
     * IMPORTANT:
     * Stop this profile click from reaching the document-level
     * outside-click handler. The panel stays inside #authWrap.
     */
    if (event?.stopPropagation) {
        event.stopPropagation();
    }

    const open =
        panel.classList.toggle("open");

    panel.setAttribute(
        "aria-hidden",
        String(!open)
    );

    if (open) {
        positionAccountPanelForMobile();
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

    document.documentElement.classList.remove("settings-open");

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

    const cryptoSection =
        document.getElementById("cryptoSection");

    if (cryptoSection) {
        cryptoSection.style.display = "none";
    }

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

if (cryptoSection) {
    cryptoSection.style.display = "none";
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

    document.documentElement.classList.remove("settings-open");

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

    const cryptoSection =
        document.getElementById("cryptoSection");
    
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

if (cryptoSection) {
    cryptoSection.style.display = "none";
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

    document.documentElement.classList.toggle(
        "settings-open",
        isHidden
    );

    window.dispatchEvent(
        new CustomEvent("worthitsettingspanelchange", {
            detail: { open: isHidden }
        })
    );
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

    /*
     * More is a normal navigation menu. Opening it must never
     * start Google authentication or depend on auth state.
     */
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

function openCryptoFromMenu() {
    closeMoreMenu();
    if (typeof window.openCrypto === "function") {
        window.openCrypto();
    }
}

window.openCryptoFromMenu = openCryptoFromMenu;

function openCrypto() {

    document.documentElement.classList.remove("settings-open");

    const carsSection = document.getElementById("carsSection");
    if (carsSection) carsSection.style.display = "none";
    hideCarsNavigationUi();

    const homePage = document.getElementById("homePage");
    const weatherSection = document.getElementById("weatherSection");
    const newsSection = document.getElementById("newsSection");
    const discountsSection = document.getElementById("discountsSection");
    const marketsSection = document.getElementById("marketsSection");
    const moneySection = document.getElementById("moneySection");
    const settingsPanel = document.getElementById("settingsPanel");
    const cryptoSection = document.getElementById("cryptoSection");

    if (homePage) homePage.style.display = "none";
    if (weatherSection) weatherSection.style.display = "none";
    if (newsSection) newsSection.style.display = "none";
    if (discountsSection) discountsSection.style.display = "none";
    if (marketsSection) marketsSection.style.display = "none";
    if (moneySection) moneySection.style.display = "none";

    if (settingsPanel) settingsPanel.style.display = "none";

    document.documentElement.classList.remove("settings-open");

    document.querySelectorAll(".app").forEach(x => {
        x.classList.remove("active");
        x.style.display = "none";
    });

    if (cryptoSection) cryptoSection.style.display = "block";

    const navLinks = document.getElementById("navLinks");
    if (navLinks) navLinks.classList.remove("open");

    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "auto";

    if (typeof initCryptoUI === "function") {
        initCryptoUI();
    }

    window.scrollTo({ top: 0, behavior: "auto" });
}

window.openCrypto = openCrypto;

function openMoneyFromMenu() {
    closeMoreMenu();

    if (typeof window.openMoney === "function") {
        window.openMoney();
    }
}

window.openMoneyFromMenu = openMoneyFromMenu;

function openMarkets() {

    document.documentElement.classList.remove("settings-open");

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

    const cryptoSection =
        document.getElementById("cryptoSection");

    if (cryptoSection) {
        cryptoSection.style.display = "none";
    }

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

    document.documentElement.classList.remove("settings-open");

    const cryptoSection = document.getElementById("cryptoSection");
    if (cryptoSection) cryptoSection.style.display = "none";

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
