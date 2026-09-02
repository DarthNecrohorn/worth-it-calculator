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

    const panel =
        $("accountPanel");

    if (!panel) return;

    panel.classList.remove("open");

    panel.setAttribute(
        "aria-hidden",
        "true"
    );
}


function toggleAccountPanel() {

    if (!currentAuthUser) return;

    const panel =
        $("accountPanel");

    if (!panel) return;

    const open =
        panel.classList.toggle("open");

    panel.setAttribute(
        "aria-hidden",
        String(!open)
    );
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


        if (
            wrap &&
            !wrap.contains(event.target)
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


/* =========================================================
CALCULATOR NAVIGATION
========================================================= */

function openCalculator(type) {

    const homePage =
        document.getElementById("homePage");

    const weatherSection =
        document.getElementById("weatherSection");

    const newsSection =
        document.getElementById("newsSection");

    const settingsPage =
        document.getElementById("settingsPage");

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


    if (settingsPage) {

        settingsPage.style.display =
            "none";

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
    const homePage = document.getElementById("homePage");
    const weatherSection = document.getElementById("weatherSection");
    const newsSection = document.getElementById("newsSection");
    const settingsPanel = document.getElementById("settingsPanel");

    // Sakrij sve aplikacije
    document.querySelectorAll(".app").forEach(app => {
        app.classList.remove("active");
        app.style.display = "none";
    });

    // Sakrij posebne sekcije
    if (weatherSection) weatherSection.style.display = "none";
    if (newsSection) newsSection.style.display = "none";
    if (settingsPanel) settingsPanel.style.display = "none";

    // Prikaži početnu stranicu
    if (homePage) {
        homePage.style.display = "block";
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

window.showHome = showHome;


ffunction showCategory(category) {
    showHome();

    const calculators = document.getElementById("calculators");
    const filter = document.getElementById("categoryFilter");

    if (!calculators) return;

    // Postavi kategoriju u dropdown
    if (filter) {
        filter.value = category;
    }

    // Prikaži samo kalkulatore iz izabrane kategorije
    const cards = document.querySelectorAll(".calc-card");

    cards.forEach(card => {
        const cardCategory = card.getAttribute("data-category");

        if (cardCategory === category) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    });

    // Skroluj do kalkulatora
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
    const settingsPanel = document.getElementById("settingsPanel");

    if (!settingsPanel) return;

    const isHidden =
        settingsPanel.style.display === "none" ||
        getComputedStyle(settingsPanel).display === "none";

    settingsPanel.style.display = isHidden
        ? "block"
        : "none";
}

window.toggleSettings = toggleSettings;
