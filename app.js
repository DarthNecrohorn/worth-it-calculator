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
    "sb_publishable_AzgPXyMrDpruSqGt-al9gg_9gsiCopw";


window.supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                flowType: "implicit",
                storage: window.localStorage
            }
        }
    );


let currentAuthUser = null;


/* =========================================================
EARLY AUTH STATE LISTENER
========================================================= */

/*
 * Register this immediately after creating the Supabase client.
 * The listener is registered immediately so account state changes
 * are reflected as soon as Supabase initializes.
 */
window.supabaseClient.auth.onAuthStateChange(
    (event, session) => {

        updateAuthUI(
            session?.user || null
        );


        if (event === "PASSWORD_RECOVERY") {

            setTimeout(() => {
                openAuthModal("reset");
            }, 0);

            return;

        }

        if (event === "SIGNED_IN") {
            closeAuthModal();
        }


        if (
            typeof updateAIChatView ===
            "function"
        ) {

            updateAIChatView();

        }

    }
);


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
        legalWrap.style.display =
            "none";

        legalCheck.checked =
            false;

        btn.style.display =
            "inline-flex";


        btn.onclick =
            handleAuthButton;


        btn.title =
            "Sign in or create a Worth It account";


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
EMAIL / PASSWORD AUTH
========================================================= */

let authModalMode = "signin";

const SUPABASE_TURNSTILE_SITE_KEY =
    "0x4AAAAAAFCI9dgWOsaff0q-";

let authTurnstileWidgetId = null;
let authTurnstileToken = "";
let authModalOpenedAt = 0;

function isTurnstileConfigured() {
    return Boolean(
        SUPABASE_TURNSTILE_SITE_KEY &&
        SUPABASE_TURNSTILE_SITE_KEY !==
            "PASTE_CLOUDFLARE_TURNSTILE_SITE_KEY_HERE"
    );
}

function getAuthTurnstileToken() {
    const field =
        document.querySelector(
            '#authTurnstile input[name="cf-turnstile-response"]'
        );

    return (
        authTurnstileToken ||
        field?.value ||
        ""
    );
}

function resetAuthTurnstile() {
    authTurnstileToken = "";

    if (
        window.turnstile &&
        authTurnstileWidgetId !== null
    ) {
        try {
            window.turnstile.reset(
                authTurnstileWidgetId
            );
        } catch (error) {
            console.warn(
                "Worth It Turnstile reset failed:",
                error
            );
        }
    }
}

function renderAuthTurnstile() {
    const holder = $("authTurnstile");

    if (
        !holder ||
        !isTurnstileConfigured()
    ) {
        return;
    }

    if (!window.turnstile) {
        setTimeout(
            renderAuthTurnstile,
            150
        );
        return;
    }

    if (authTurnstileWidgetId === null) {
        authTurnstileWidgetId =
            window.turnstile.render(
                holder,
                {
                    sitekey:
                        SUPABASE_TURNSTILE_SITE_KEY,
                    theme: "auto",
                    action: "auth",
                    callback: (token) => {
                        authTurnstileToken =
                            token || "";
                    },
                    "expired-callback": () => {
                        authTurnstileToken = "";
                    },
                    "error-callback": () => {
                        authTurnstileToken = "";

                        setAuthStatus(
                            "Security check failed. Please try again.",
                            "error"
                        );
                    }
                }
            );
    } else {
        resetAuthTurnstile();
    }
}

function getAuthHoneypotValue() {
    return (
        $("authWebsite")?.value ||
        ""
    ).trim();
}

function authPassedBasicBotChecks() {
    if (getAuthHoneypotValue()) {
        setAuthStatus(
            "Security check failed. Please try again.",
            "error"
        );

        return false;
    }

    const minimumTime =
        authModalMode === "signup"
            ? 1200
            : 500;

    if (
        authModalOpenedAt &&
        Date.now() - authModalOpenedAt <
            minimumTime
    ) {
        setAuthStatus(
            "Please take a moment and try again.",
            "error"
        );

        return false;
    }

    if (
        isTurnstileConfigured() &&
        !getAuthTurnstileToken()
    ) {
        setAuthStatus(
            "Please complete the security check.",
            "error"
        );

        return false;
    }

    return true;
}


function handleUsernameInput(input) {

    if (!input) return;

    input.value = input.value.slice(0, 20);
    updateUsernameAvailabilityMessage(input);
}


async function checkUsernameAvailability(username) {
    const response = await fetch(
        "/api/auth-username-availability?username=" + encodeURIComponent(username),
        { method: "GET", cache: "no-store" }
    );

    let payload = null;
    try { payload = await response.json(); } catch (error) {}

    if (!response.ok) {
        throw new Error(payload?.error || "Could not check username availability.");
    }

    return {
        available: payload?.available === true,
        valid: payload?.valid !== false
    };
}

function updateUsernameAvailabilityMessage(input) {
    const message = $("authUsernameAvailability");
    if (!message || authModalMode !== "signup") return;

    const username = input?.value?.trim() || "";
    const pattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9_]{3,20}$/;

    if (!username) {
        message.textContent = "";
        message.className = "auth-username-availability";
        return;
    }

    if (!/^[A-Za-z0-9_]*$/.test(username)) {
        message.textContent = "Symbols other than _ are not allowed.";
        message.className = "auth-username-availability error";
        return;
    }

    if (username.length < 3 || username.length > 20) {
        message.textContent = "Username must be between 3 and 20 characters.";
        message.className = "auth-username-availability error";
        return;
    }

    if ((username.match(/_/g) || []).length > 1) {
        message.textContent = "Username can contain only one _."; 
        message.className = "auth-username-availability error";
        return;
    }

    if (!pattern.test(username)) {
        message.textContent = "Username must contain at least one letter or number.";
        message.className = "auth-username-availability error";
        return;
    }

    message.textContent = "Checking...";
    message.className = "auth-username-availability checking";

    clearTimeout(updateUsernameAvailabilityMessage.timer);
    updateUsernameAvailabilityMessage.timer = setTimeout(async () => {
        try {
            const result = await checkUsernameAvailability(username);
            if (input.value.trim() !== username || authModalMode !== "signup") return;
            message.textContent = result.available
                ? "✓ Username is available"
                : "This username isn't available";
            message.className = "auth-username-availability " +
                (result.available ? "success" : "error");
        } catch (error) {
            if (input.value.trim() !== username) return;
            message.textContent = "Could not check username availability.";
            message.className = "auth-username-availability error";
        }
    }, 350);
}

function togglePasswordVisibility(inputId) {

    const input =
        $(inputId);

    if (!input) {
        return;
    }

    const button =
        $(inputId + "Toggle");

    const visible =
        input.type === "text";

    input.type =
        visible
            ? "password"
            : "text";

    if (button) {
        button.textContent =
            visible
                ? "🙉"
                : "🙈";

        button.title =
            visible
                ? "Show password"
                : "Hide password";

        button.setAttribute(
            "aria-label",
            visible
                ? "Show password"
                : "Hide password"
        );
    }

}


function setAuthStatus(message = "", type = "") {

    const status =
        $("authModalStatus");

    if (!status) return;

    status.textContent =
        message;

    status.className =
        "auth-modal-status" +
        (type ? " " + type : "");

}


function openAuthModal(mode = "signin") {

    const overlay =
        $("authModalOverlay");

    if (!overlay) return;

    authModalMode =
        ["signin", "signup", "reset", "forgot"].includes(mode)
            ? mode
            : "signin";

    renderAuthModal();

    overlay.classList.add("open");

    overlay.setAttribute(
        "aria-hidden",
        "false"
    );

    authModalOpenedAt =
        Date.now();

    setAuthStatus("");

    setTimeout(() => {
        renderAuthTurnstile();
    }, 0);

    setTimeout(() => {
        if (
            authModalMode === "signup" ||
            authModalMode === "signin"
        ) {
            $("authUsername")?.focus();
        } else {
            $("authEmail")?.focus();
        }
    }, 40);

}


function closeAuthModal() {

    resetAuthTurnstile();

    const legalCheck =
        $("authLegalCheck");

    if (legalCheck) {
        legalCheck.checked =
            false;
    }

    const overlay =
        $("authModalOverlay");

    if (!overlay) return;

    overlay.classList.remove("open");

    overlay.setAttribute(
        "aria-hidden",
        "true"
    );

    setAuthStatus("");

}


/*
 * Backwards-compatible public aliases used by older UI integrations.
 * The canonical functions remain openAuthModal/closeAuthModal.
 */
window.openLoginModal = openAuthModal;
window.closeLoginModal = closeAuthModal;

function switchAuthMode(mode) {

    resetAuthTurnstile();

    const password = $("authPassword");

    const passwordConfirm = $("authPasswordConfirm");

    if (passwordConfirm) {
        passwordConfirm.value = "";
    }

    if (password && mode !== "signin") {
        password.autocomplete = "new-password";
    } else if (password) {
        password.autocomplete = "current-password";
    }

    renderAuthModalMode(mode);

}


function renderAuthModalMode(mode) {

    authModalMode =
        ["signin", "signup", "reset", "forgot"].includes(mode)
            ? mode
            : "signin";

    renderAuthModal();

}


function renderAuthModal() {

    const title =
        $("authModalTitle");

    const subtitle =
        $("authModalSubtitle");

    const usernameWrap =
        $("authUsernameWrap");

    const confirmWrap =
        $("authPasswordConfirmWrap");

    const usernameInput =
        $("authUsername");

    const emailInput =
        $("authEmail");

    const passwordInput =
        $("authPassword");

    const confirmInput =
        $("authPasswordConfirm");

    const emailWrap =
        $("authEmailWrap");

    const passwordLabel =
        $("authPasswordLabel");

    const submit =
        $("authSubmitBtn");

    const toggle =
        $("authModeToggle");

    const forgot =
        $("authForgotPassword");

    const legalWrap =
        $("authLegalWrap");

    const legalCheck =
        $("authLegalCheck");

    const authOverlay =
        $("authModalOverlay");

    authOverlay?.classList.toggle(
        "signup-mode",
        authModalMode === "signup"
    );

    if (
        !title ||
        !subtitle ||
        !usernameWrap ||
        !confirmWrap ||
        !usernameInput ||
        !emailInput ||
        !passwordInput ||
        !confirmInput ||
        !emailWrap ||
        !passwordLabel ||
        !submit ||
        !toggle ||
        !forgot ||
        !legalWrap ||
        !legalCheck
    ) {
        return;
    }


    if (authModalMode === "signup") {

        title.textContent =
            "Create your Worth It account";

        subtitle.textContent =
            "Create an account with your email and password.";

        usernameWrap.style.display =
            "block";

        emailWrap.style.display =
            "block";

        confirmWrap.style.display =
            "block";

        usernameInput.required =
            true;

        emailInput.required =
            true;

        passwordInput.required =
            true;

        confirmInput.required =
            true;

        passwordInput.autocomplete =
            "new-password";

        confirmInput.autocomplete =
            "new-password";

        passwordLabel.textContent =
            "Password";

        submit.textContent =
            "Create account";

        toggle.innerHTML =
            'Already have an account? <button type="button" class="auth-modal-link" onclick="switchAuthMode(&quot;signin&quot;)">Sign in</button>';

        forgot.style.display =
            "none";

        legalWrap.style.display =
            "block";

    } else if (authModalMode === "forgot") {
        legalWrap.style.display =
            "none";

        legalCheck.checked =
            false;

        title.textContent =
            "Reset your Worth It password";

        subtitle.textContent =
            "Enter the email address linked to your account.";

        usernameWrap.style.display =
            "none";

        emailWrap.style.display =
            "block";

        confirmWrap.style.display =
            "none";

        usernameInput.required =
            false;

        emailInput.required =
            true;

        passwordInput.required =
            false;

        confirmInput.required =
            false;

        passwordInput.value =
            "";

        passwordLabel.textContent =
            "Password";

        submit.textContent =
            "Send reset link";

        toggle.innerHTML =
            '<button type="button" class="auth-modal-link" onclick="switchAuthMode(&quot;signin&quot;)">Back to sign in</button>';

        forgot.style.display =
            "none";


    } else if (authModalMode === "reset") {
        legalWrap.style.display =
            "none";

        legalCheck.checked =
            false;

        title.textContent =
            "Set a new password";

        subtitle.textContent =
            "Choose a new password for your Worth It account.";

        usernameWrap.style.display =
            "none";

        emailWrap.style.display =
            "block";

        confirmWrap.style.display =
            "none";

        usernameInput.required =
            false;

        emailInput.required =
            true;

        passwordInput.required =
            true;

        confirmInput.required =
            false;

        passwordInput.autocomplete =
            "new-password";

        confirmInput.autocomplete =
            "new-password";

        passwordLabel.textContent =
            "New password";

        submit.textContent =
            "Update password";

        toggle.innerHTML =
            '<button type="button" class="auth-modal-link" onclick="switchAuthMode(&quot;signin&quot;)">Back to sign in</button>';

        forgot.style.display =
            "none";

    } else {

        title.textContent =
            "Sign in to Worth It";

        subtitle.textContent =
            "Use your Worth It username and password.";

        usernameWrap.style.display =
            "block";

        emailWrap.style.display =
            "none";

        confirmWrap.style.display =
            "none";

        usernameInput.required =
            true;

        emailInput.required =
            false;

        passwordInput.required =
            true;

        confirmInput.required =
            false;

        passwordInput.autocomplete =
            "current-password";

        confirmInput.autocomplete =
            "new-password";

        passwordLabel.textContent =
            "Password";

        submit.textContent =
            "Sign in";

        toggle.innerHTML =
            'Don&#39;t have an account? <button type="button" class="auth-modal-link" onclick="switchAuthMode(&quot;signup&quot;)">Create account</button>';

        forgot.style.display =
            "inline-flex";

    }

}


async function submitAuthForm(event) {

    event?.preventDefault();

    const email =
        $("authEmail")?.value.trim() || "";

    const password =
        $("authPassword")?.value || "";

    const username =
        $("authUsername")?.value.trim() || "";

    const passwordConfirm =
        $("authPasswordConfirm")?.value || "";

    const legalCheck =
        $("authLegalCheck");


    if (!authPassedBasicBotChecks()) {
        return;
    }


    if (
        (authModalMode === "signup" ||
            authModalMode === "reset" ||
            authModalMode === "forgot") &&
        !email
    ) {

        setAuthStatus(
            "Enter your email address.",
            "error"
        );

        return;

    }

    if (
        (authModalMode === "signin" || authModalMode === "signup") &&
        !username
    ) {

        setAuthStatus(
            "Enter your username.",
            "error"
        );

        return;

    }

    const usernamePattern =
        /^(?=.*[A-Za-z0-9])[A-Za-z0-9_]{3,20}$/;

    if ((username.match(/_/g) || []).length > 1) {
        setAuthStatus("Username can contain only one _.", "error");
        return;
    }

    if (
        (authModalMode === "signin" || authModalMode === "signup") &&
        !usernamePattern.test(username)
    ) {

        setAuthStatus(
            "Username must be 3–20 characters, use only letters, numbers, and _, and contain at least one letter or number.",
            "error"
        );

        return;

    }


    if (
        !password &&
        authModalMode !== "forgot"
    ) {

        setAuthStatus(
            "Enter your password.",
            "error"
        );

        return;

    }


    if (
        authModalMode === "signup" &&
        password.length < 6
    ) {

        setAuthStatus(
            "Password must be at least 6 characters.",
            "error"
        );

        return;

    }


    if (
        authModalMode === "signup" &&
        password !== passwordConfirm
    ) {

        setAuthStatus(
            "The two passwords do not match.",
            "error"
        );

        return;

    }


    if (
        authModalMode === "signup" &&
        !legalCheck?.checked
    ) {

        setAuthStatus(
            "You must agree to the Terms of Use and Community Rules before creating an account.",
            "error"
        );

        legalCheck?.focus();

        return;

    }


    const submit =
        $("authSubmitBtn");

    if (submit) {
        submit.disabled = true;
    }


    setAuthStatus(
        authModalMode === "signup"
            ? "Creating account..."
            : authModalMode === "reset"
                ? "Updating password..."
                : authModalMode === "forgot"
                    ? "Sending reset link..."
                    : "Signing in..."
    );


    try {

        if (authModalMode === "signup") {

            const usernameAvailability =
                await checkUsernameAvailability(username);

            if (!usernameAvailability.available) {
                setAuthStatus(
                    "This username isn't available",
                    "error"
                );
                return;
            }

            const {
                data,
                error
            } =
                await window.supabaseClient.auth
                    .signUp({
                        email,
                        password,
                        options: {
                            captchaToken:
                                getAuthTurnstileToken() || undefined,
                            data: {
                                username,
                                full_name: username,
                                terms_version:
                                    WORTH_IT_LEGAL_VERSION,
                                community_rules_version:
                                    WORTH_IT_LEGAL_VERSION,
                                privacy_policy_acknowledged:
                                    true,
                                legal_accepted_at:
                                    new Date().toISOString()
                            },
                            emailRedirectTo:
                                window.location.origin + "/"
                        }
                    });


            if (error) {
                throw error;
            }


            if (data?.session?.user) {

                closeAuthModal();

                return;

            }


            setAuthStatus(
                "Account created. Check your email to confirm your account.",
                "success"
            );


        } else if (authModalMode === "reset") {

            const {
                error
            } =
                await window.supabaseClient.auth
                    .updateUser({
                        password
                    });


            if (error) {
                throw error;
            }


            await window.supabaseClient.auth
                .signOut();


            openAuthModal("signin");

            setAuthStatus(
                "Your password has been updated. Sign in with your new password.",
                "success"
            );


        } else {

            const response =
                await fetch(
                    "/api/auth-username-login",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            username,
                            password,
                            captchaToken:
                                getAuthTurnstileToken() || undefined
                        })
                    }
                );

            let payload = null;

            try {
                payload =
                    await response.json();
            } catch (error) {
                payload = null;
            }

            if (!response.ok) {
                const authError =
                    new Error(
                        payload?.error ||
                        "Incorrect username or password."
                    );

                authError.status =
                    response.status;

                throw authError;
            }

            if (
                !payload?.access_token ||
                !payload?.refresh_token
            ) {
                throw new Error(
                    "Authentication response was incomplete."
                );
            }

            const {
                error
            } =
                await window.supabaseClient.auth
                    .setSession({
                        access_token:
                            payload.access_token,
                        refresh_token:
                            payload.refresh_token
                    });

            if (error) {
                throw error;
            }

            closeAuthModal();

        }


    } catch (error) {

        console.error(
            "Worth It email authentication error:",
            error
        );


        let message =
            error?.message ||
            "Authentication failed.";


        if (
            /email not confirmed/i.test(message)
        ) {

            message =
                "Please confirm your email address before signing in.";

        } else if (
            /invalid login credentials/i.test(message)
        ) {

            message =
                "Incorrect email or password.";

        }


        setAuthStatus(
            message,
            "error"
        );


    } finally {

        resetAuthTurnstile();

        if (submit) {
            submit.disabled = false;
        }

    }

}


async function requestPasswordReset() {

    const email =
        $("authEmail")?.value.trim() || "";


    if (!email) {

        setAuthStatus(
            "Enter your email address first.",
            "error"
        );

        $("authEmail")?.focus();

        return;

    }


    try {

        const {
            error
        } =
            await window.supabaseClient.auth
                .resetPasswordForEmail(
                    email,
                    {
                        redirectTo:
                            window.location.origin + "/",
                        captchaToken:
                            getAuthTurnstileToken() || undefined
                    }
                );


        if (error) {
            throw error;
        }


        setAuthStatus(
            "If an account exists for that email, a password reset link has been sent.",
            "success"
        );


    } catch (error) {

        console.error(
            "Worth It password reset error:",
            error
        );


        setAuthStatus(
            error?.message ||
            "Could not send the password reset email.",
            "error"
        );

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


    openAuthModal("signin");

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

window.openAuthModal =
    openAuthModal;

window.closeAuthModal =
    closeAuthModal;

window.switchAuthMode =
    switchAuthMode;

window.submitAuthForm =
    submitAuthForm;

window.requestPasswordReset =
    requestPasswordReset;

window.signOutUser =
    signOutUser;

window.openAccountInfo =
    openAccountInfo;

window.toggleAccountPanel =
    toggleAccountPanel;

window.updateAuthUI =
    updateAuthUI;


/* =========================================================
INITIAL SESSION
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
    hideWaterLevelsSection();
    hideShipTrackingSection();

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

        closeNavMenuUnlessPreserved(navLinks);

    }

}



/* =========================================================
   LEGAL DOCUMENTS
========================================================= */

const WORTH_IT_LEGAL_VERSION = "2026-10-07";

const WORTH_IT_LEGAL_DOCUMENTS = {
    terms: {
        title: "Terms of Use",
        content: `
            <h3>1. Acceptance</h3>
            <p>By using Worth It or creating an account, you agree to these Terms of Use and the Community Rules.</p>
            <h3>2. The Service</h3>
            <p>Worth It provides calculators, comparisons, informational tools, market and currency data, vehicle information, news-related features, weather and other data features, shopping and affiliate links, and other services that may be added over time.</p>
            <h3>3. Informational Use</h3>
            <p>Calculations, estimates, prices, forecasts, vehicle details, articles, product information, and other results are provided for general informational purposes. We do not guarantee that they are complete, current, accurate, or suitable for your circumstances.</p>
            <h3>4. Accounts</h3>
            <p>You are responsible for the accuracy of your account information and for keeping your credentials secure. Accounts may not be used for fraud, impersonation, abuse, or ban evasion.</p>
            <h3>5. Community Rules</h3>
            <p>When Worth It provides profiles, messaging, comments, ratings, followers, friends, or other community features, you must follow the Community Rules. Dating and sexual solicitation are not permitted on Worth It.</p>
            <h3>6. Moderation and Bans</h3>
            <p>Worth It may restrict, suspend, or permanently terminate accounts when we reasonably believe that these Terms, the Community Rules, applicable law, or platform safety requirements have been violated. Serious misconduct may result in immediate action without a warning.</p>
            <p>Worth It is not responsible for losses, inconvenience, or other consequences resulting from an account suspension, restriction, or ban, to the extent permitted by applicable law. We will make a genuine effort to be fair, reasonable, and consistent when reviewing moderation decisions.</p>
            <h3>7. Owner and Administrative Testing</h3>
            <p>The site owner and authorized administrators may perform controlled tests that would otherwise resemble prohibited activity when reasonably necessary to test moderation, safety, blocking, reporting, account restrictions, bugs, or other website functionality. This limited exception does not grant ordinary users permission to break the Community Rules.</p>
            <h3>8. Third-Party Services</h3>
            <p>Some features depend on third-party services and data providers. Those services may have separate terms, privacy practices, limits, and availability. Worth It does not control independent third-party acts or omissions.</p>
            <h3>9. Affiliate Links</h3>
            <p>Some shopping links may be affiliate links. Worth It or an affiliate partner may receive a commission or other compensation from a qualifying action at no additional cost to you, where applicable.</p>
            <h3>10. Intellectual Property</h3>
            <p>Worth It software, branding, interface, original text, and other original materials are owned by or licensed to Worth It unless otherwise indicated. Protected materials may not be copied or commercially exploited except where permitted by law or authorized by us.</p>
            <h3>11. Availability and Changes</h3>
            <p>Features, data sources, limits, and parts of the service may be changed, suspended, or discontinued as Worth It evolves.</p>
            <h3>12. Disclaimers and Liability</h3>
            <p>To the extent permitted by applicable law, Worth It is provided on an “as is” and “as available” basis. We do not guarantee uninterrupted, error-free, secure, complete, or accurate service.</p>
            <p>To the extent permitted by applicable law, Worth It and its operators will not be liable for indirect, incidental, special, consequential, or similar losses arising from use of the service, reliance on its information, third-party services, or moderation actions. Nothing here excludes liability that cannot lawfully be excluded.</p>
            <h3>13. Privacy</h3>
            <p>Your use of Worth It is also subject to the Privacy Policy and Cookie &amp; Storage Policy.</p>
            <h3>14. Changes</h3>
            <p>We may update these Terms as the service evolves. The current version is the version published on Worth It.</p>
            <p class="legal-final-note"><strong>Use Worth It responsibly and respect other users and the service.</strong></p>
        `
    },
    community: {
        title: "Community Rules",
        content: `
            <h3>1. Respect Everyone</h3>
            <p>No harassment, bullying, personal attacks, directed abuse, degrading insults, threats, intimidation, repeated unwanted contact, or deliberate humiliation and antagonizing.</p>
            <p>Casual profanity is not automatically treated the same as directed abuse, but aggressive, abusive, or repeated swearing at another person is not permitted.</p>
            <h3>2. No Racism, Hate Speech, or Discrimination</h3>
            <p>Worth It has zero tolerance for racism or hateful behavior. No attacks, threats, demeaning content, slurs, hateful stereotypes, or encouragement of hostility based on race, ethnicity, nationality, national origin, religion, sex, gender, sexual orientation, disability, age, or another protected or personal characteristic.</p>
            <h3>3. Worth It Is Not a Dating Platform</h3>
            <p><strong>Dating is not permitted on Worth It.</strong> Worth It is not a dating, matchmaking, romantic, or hookup platform. Do not use profiles or community features to look for dates, romantic partners, or sexual partners.</p>
            <p>Dating and personal relationships are allowed <strong>outside of Worth It</strong>. What consenting adults choose to do outside the website is their own personal matter.</p>
            <h3>4. No Unwanted Sexual or Nude Content</h3>
            <p>Do not send, request, post, upload, or distribute sexual or nude content to other users. This includes unsolicited sexual messages, propositions, requests for nude images, and sexually explicit photographs.</p>
            <p>Sending unsolicited <strong>18+ nude or sexually explicit images</strong> to another user may result in an immediate and permanent ban.</p>
            <p>Any sexual content involving minors is strictly prohibited and may be reported to appropriate authorities where required.</p>
            <h3>5. No Harassment or Repeated Unwanted Messages</h3>
            <p>Do not repeatedly contact someone who has asked you to stop. Repeated inappropriate messages, ban evasion, coordinated harassment, or creating new accounts to continue unwanted contact may result in a permanent ban.</p>
            <h3>6. No Threats, Violence, Illegal Activity, Scams, or Malicious Abuse</h3>
            <p>Threats of violence, credible intimidation, serious illegal activity, fraud, impersonation, phishing, malware, scams, or deliberate abuse of platform functionality are not allowed.</p>
            <h3>7. No Doxxing or Privacy Abuse</h3>
            <p>Do not publish, distribute, threaten to reveal, or otherwise misuse another person's private or sensitive information without appropriate authorization.</p>
            <h3>8. Moderation and Bans</h3>
            <p>Worth It may suspend, restrict, or permanently terminate accounts that violate these rules or create a serious risk to the community or service.</p>
            <p><strong>Worth It is not responsible for losses, inconvenience, or other consequences resulting from a suspension, restriction, or ban, to the extent permitted by applicable law.</strong> We will nevertheless make a genuine effort to be fair, reasonable, and consistent and may consider context, severity, history, intent, evidence, and repeated behavior.</p>
            <h3>9. Owner and Administrative Testing Exception</h3>
            <p>The site owner and authorized administrators may perform controlled tests that would otherwise resemble prohibited activity when needed to test moderation, reports, blocks, bans, safety protections, bugs, or other functionality. This is a limited testing and administration exception and does not permit the owner or administrators to use Worth It as a dating platform.</p>
            <h3>10. Appeals</h3>
            <p>Where an appeal or review process is available, users may request reconsideration. A review does not guarantee that a decision will be reversed.</p>
            <p class="legal-final-note"><strong>Be respectful. Do not harass people, use Worth It for dating or sexual solicitation, send unwanted nude or explicit content, or engage in racism, hate, threats, scams, or serious abuse.</strong></p>
        `
    },
    privacy: {
        title: "Privacy Policy",
        content: `
            <h3>1. What We Collect</h3>
            <p>Depending on the features you use, Worth It may receive information you provide directly, such as your email address, Worth It username, account information, feedback, bug reports, suggestions, and other information you choose to submit.</p>
            <h3>2. Authentication</h3>
            <p>Worth It currently uses email-and-password authentication through Supabase. The authentication session is stored using browser storage so the website can maintain your signed-in state.</p>
            <h3>3. Browser Storage</h3>
            <p>Worth It uses browser storage for legitimate functions such as remembering theme and UI scale preferences, language or translation state, caching certain information, and maintaining authentication state.</p>
            <h3>4. Security</h3>
            <p>Cloudflare Turnstile is used for anti-bot protection on account-related flows where configured. Security services may process technical signals needed to protect the service from automated abuse.</p>
            <h3>5. How Information Is Used</h3>
            <p>Information may be used to provide and secure the service, authenticate accounts, respond to feedback, investigate bugs and abuse, enforce the Terms and Community Rules, maintain the website, and improve reliability and functionality.</p>
            <h3>6. Service Providers</h3>
            <p>Worth It uses third-party infrastructure and service providers, including Supabase for authentication and related account services and Cloudflare for hosting, delivery, and security, as well as providers required for particular site features.</p>
            <h3>7. Affiliate and Merchant Links</h3>
            <p>When you leave Worth It through a merchant or affiliate link, the third party may collect information under its own privacy policy and may use cookies or similar technologies.</p>
            <h3>8. Data Sharing</h3>
            <p>Information may be disclosed when reasonably necessary to operate the service, protect users, comply with legal obligations, investigate abuse, or work with service providers processing information on our behalf. Worth It is not currently designed as an advertising-profile or data-broker service.</p>
            <h3>9. Retention and Your Rights</h3>
            <p>Information may be retained as reasonably necessary for the relevant feature, security, account records, disputes, abuse investigations, legal obligations, and operation of the service. Depending on applicable law, you may have rights to access, correct, delete, restrict, object to, or otherwise control personal information.</p>
            <h3>10. Changes</h3>
            <p>This Privacy Policy may be updated as Worth It evolves or legal requirements change.</p>
            <p class="legal-final-note"><strong>For privacy-related requests, please use the contact or feedback channel made available on Worth It.</strong></p>
        `
    },
    cookies: {
        title: "Cookie & Storage Policy",
        content: `
            <h3>1. Current Approach</h3>
            <p>Worth It currently does not intentionally operate an advertising or analytics cookie system. We are not adding a generic “Accept all cookies” banner merely for necessary functionality.</p>
            <h3>2. Browser Storage</h3>
            <p>Worth It uses local browser storage for legitimate service functions including theme and UI scale preferences, language or translation state, caching certain information, and maintaining the Supabase authentication session.</p>
            <h3>3. Security and Third-Party Technologies</h3>
            <p>Cloudflare Turnstile is used for anti-bot protection where configured. Third-party infrastructure or security services may use cookies, local storage, or other technical signals required to provide their services.</p>
            <h3>4. Affiliate Links</h3>
            <p>After you leave Worth It through an affiliate or merchant link, the destination website or affiliate network may use cookies or similar technologies according to its own policies.</p>
            <h3>5. Clearing Storage</h3>
            <p>You can clear cookies and browser storage through your browser controls. This may sign you out, remove preferences, or clear cached state.</p>
            <h3>6. Future Changes</h3>
            <p>If Worth It later introduces non-essential analytics, advertising, behavioral tracking, or another technology that requires consent, the consent experience and this policy will be updated.</p>
        `
    },
    affiliate: {
        title: "Affiliate Disclosure",
        content: `
            <h3>1. Affiliate Relationships</h3>
            <p>Worth It may participate in affiliate programs, including the Awin affiliate network and participating merchants.</p>
            <h3>2. Compensation</h3>
            <p>Some shopping links may be affiliate links. If you click one and make a qualifying purchase or other qualifying action, Worth It may receive a commission or other compensation at no additional cost to you, where applicable.</p>
            <h3>3. Worth It Picks First</h3>
            <p>Affiliate availability does not automatically make a product a recommendation. Worth It is designed around the principle <strong>“Worth It picks first.”</strong> Affiliate relationships help support the website but do not automatically determine which products are presented.</p>
            <h3>4. Merchant Information</h3>
            <p>Prices, discounts, stock, shipping, ratings, warranties, and other merchant information can change. The merchant website is the final source for current purchase terms.</p>
            <h3>5. No Guarantee</h3>
            <p>An affiliate link does not guarantee the quality, safety, legality, availability, or suitability of a product or merchant.</p>
        `
    },
    disclaimer: {
        title: "Disclaimer",
        content: `
            <h3>1. General Information Only</h3>
            <p>Worth It provides calculators, comparisons, forecasts, data summaries, product information, news-related content, and other tools for general informational and educational purposes.</p>
            <h3>2. Financial Information</h3>
            <p>Calculator outputs and financial comparisons are estimates. They are not financial, investment, tax, accounting, legal, or other professional advice.</p>
            <h3>3. External Data</h3>
            <p>Market prices, exchange rates, weather forecasts, news, vehicle information, water or shipping information, and other external data may be delayed, incomplete, unavailable, or inaccurate.</p>
            <h3>4. Products</h3>
            <p>Product listings, ratings, prices, shipping information, discounts, and availability can change. Verify important purchase information on the merchant website before buying.</p>
            <h3>5. Your Decisions</h3>
            <p>You are responsible for your own decisions and for checking whether a result is appropriate for your circumstances. Using a Worth It calculation or recommendation does not transfer that responsibility to Worth It.</p>
            <h3>6. Third-Party Content</h3>
            <p>Worth It may display, summarize, or link to third-party information. We do not control all third-party content and cannot guarantee its accuracy, legality, or continued availability.</p>
            <p class="legal-final-note"><strong>For decisions with meaningful financial, legal, medical, safety, or other serious consequences, independently verify the information and obtain qualified professional advice where appropriate.</strong></p>
        `
    }
};

function openLegalPage(type = "terms") {
    const overlay = $("legalOverlay");
    const title = $("legalModalTitle");
    const content = $("legalContent");
    if (!overlay || !title || !content) return;

    const key =
        Object.prototype.hasOwnProperty.call(WORTH_IT_LEGAL_DOCUMENTS, type)
            ? type
            : "terms";

    title.textContent =
        WORTH_IT_LEGAL_DOCUMENTS[key].title;

    content.innerHTML =
        WORTH_IT_LEGAL_DOCUMENTS[key].content;

    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("legal-open");

    document.querySelectorAll("[data-legal-tab]").forEach(button => {
        const active =
            button.getAttribute("data-legal-tab") === key;
        button.classList.toggle("active", active);
        button.setAttribute("aria-current", active ? "page" : "false");
    });

    content.scrollTop = 0;
    window.setTimeout(() => {
        content.focus({preventScroll:true});
    }, 0);
}

function closeLegalPage() {
    const overlay = $("legalOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("legal-open");
}

window.openLegalPage = openLegalPage;
window.closeLegalPage = closeLegalPage;

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        $("legalOverlay")?.classList.contains("open")
    ) {
        closeLegalPage();
    }
});


window.openCalculator =
    openCalculator;

function showHome() {

    document.documentElement.classList.remove("settings-open");

    hideCarsNavigationUi();
    hideWaterLevelsSection();
    hideShipTrackingSection();
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

function closeSettings(){
    const settingsPanel =
        document.getElementById("settingsPanel");

    if(!settingsPanel) return;

    settingsPanel.style.display = "none";

    document.documentElement.classList.remove(
        "settings-open"
    );

    window.dispatchEvent(
        new CustomEvent("worthitsettingspanelchange", {
            detail: { open: false }
        })
    );
}

window.closeSettings = closeSettings;

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

function closeNavMenuUnlessPreserved(navLinks) {
    if (!navLinks) return;

    if (navLinks.dataset.preserveOpen !== "true") {
        navLinks.classList.remove("open");
    }
}

function toggleMenu() {
    const navLinks =
        document.getElementById("navLinks");

    if (!navLinks) return;

    const isOpen =
        navLinks.classList.toggle("open");

    if (isOpen) {
        navLinks.dataset.preserveOpen = "true";
    } else {
        delete navLinks.dataset.preserveOpen;
    }

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

    /* More is a normal navigation menu. */
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
function hideWaterLevelsSection() {
    const waterLevelsSection = document.getElementById("waterLevelsSection");
    if (waterLevelsSection) {
        waterLevelsSection.style.display = "none";
    }
}
window.hideWaterLevelsSection = hideWaterLevelsSection;

function hideShipTrackingSection() {
    const shipTrackingSection =
        document.getElementById("shipTrackingSection");

    if(shipTrackingSection){
        shipTrackingSection.style.display = "none";
    }
}
window.hideShipTrackingSection = hideShipTrackingSection;

function openShipTrackingFromMenu(){
    closeMoreMenu();

    if(typeof window.openShipTracking === "function"){
        window.openShipTracking();
    }
}
window.openShipTrackingFromMenu = openShipTrackingFromMenu;

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

function openWaterLevelsFromMenu() {
    closeMoreMenu();

    if (typeof window.openWaterLevels === "function") {
        window.openWaterLevels();
    }
}

window.openWaterLevelsFromMenu = openWaterLevelsFromMenu;

function openWaterLevels() {
    hideShipTrackingSection();

    document.documentElement.classList.remove("settings-open");

    hideCarsNavigationUi();

    /*
     * Reset scroll before changing section visibility. Hiding the
     * current long page first can otherwise trigger browser scroll
     * anchoring and produce a visible bottom-to-top jump.
     */
    const html = document.documentElement;
    const body = document.body;
    const previousScrollBehavior = html.style.scrollBehavior;

    html.style.scrollBehavior = "auto";
    html.scrollTop = 0;
    body.scrollTop = 0;
    window.scrollTo(0, 0);

    const homePage = document.getElementById("homePage");
    const weatherSection = document.getElementById("weatherSection");
    const newsSection = document.getElementById("newsSection");
    const discountsSection = document.getElementById("discountsSection");
    const marketsSection = document.getElementById("marketsSection");
    const moneySection = document.getElementById("moneySection");
    const cryptoSection = document.getElementById("cryptoSection");
    const settingsPanel = document.getElementById("settingsPanel");
    const waterLevelsSection = document.getElementById("waterLevelsSection");

    if (homePage) homePage.style.display = "none";
    if (weatherSection) weatherSection.style.display = "none";
    if (newsSection) newsSection.style.display = "none";
    if (discountsSection) discountsSection.style.display = "none";
    if (marketsSection) marketsSection.style.display = "none";
    if (moneySection) moneySection.style.display = "none";
    if (cryptoSection) cryptoSection.style.display = "none";
    if (settingsPanel) settingsPanel.style.display = "none";

    document.querySelectorAll(".app").forEach(x => {
        x.classList.remove("active");
        x.style.display = "none";
    });

    if (waterLevelsSection) {
        waterLevelsSection.style.display = "block";
    }

    const navLinks = document.getElementById("navLinks");
    if (navLinks) closeNavMenuUnlessPreserved(navLinks);

    html.style.overflowY = "auto";
    body.style.overflowY = "auto";

    if (typeof initWaterLevelsUI === "function") {
        initWaterLevelsUI();
    }

    /* Re-assert the top position after the new section has been laid out. */
    html.scrollTop = 0;
    body.scrollTop = 0;
    window.scrollTo(0, 0);

    window.requestAnimationFrame(function(){
        html.scrollTop = 0;
        body.scrollTop = 0;
        window.scrollTo(0, 0);
        html.style.scrollBehavior = previousScrollBehavior;
    });
}


window.openWaterLevels = openWaterLevels;

function openShipTracking(){

    document.documentElement.classList.remove("settings-open");

    hideCarsNavigationUi();
    hideWaterLevelsSection();

    const homePage = document.getElementById("homePage");
    const weatherSection = document.getElementById("weatherSection");
    const newsSection = document.getElementById("newsSection");
    const discountsSection = document.getElementById("discountsSection");
    const marketsSection = document.getElementById("marketsSection");
    const moneySection = document.getElementById("moneySection");
    const cryptoSection = document.getElementById("cryptoSection");
    const carsSection = document.getElementById("carsSection");
    const settingsPanel = document.getElementById("settingsPanel");
    const shipTrackingSection = document.getElementById("shipTrackingSection");
    const shopSection = document.getElementById("shopSection");

    if(homePage) homePage.style.display = "none";
    if(weatherSection) weatherSection.style.display = "none";
    if(newsSection) newsSection.style.display = "none";
    if(discountsSection) discountsSection.style.display = "none";
    if(marketsSection) marketsSection.style.display = "none";
    if(moneySection) moneySection.style.display = "none";
    if(cryptoSection) cryptoSection.style.display = "none";
    if(carsSection) carsSection.style.display = "none";
    if(settingsPanel) settingsPanel.style.display = "none";
    if(shopSection) shopSection.style.display = "none";

    document.querySelectorAll(".app").forEach(function(x){
        x.classList.remove("active");
        x.style.display = "none";
    });

    if(shipTrackingSection){
        shipTrackingSection.style.display = "block";
    }

    const navLinks = document.getElementById("navLinks");
    if(navLinks) closeNavMenuUnlessPreserved(navLinks);

    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "auto";

    if(typeof window.initShipTrackingUI === "function"){
        window.initShipTrackingUI();
    }

    /*
     * Recalculate Leaflet after the section has become visible.
     */
    if(typeof window.refreshShipTrackingMap === "function"){
        window.refreshShipTrackingMap();
    }

    window.scrollTo({
        top:0,
        behavior:"auto"
    });
}

window.openShipTracking = openShipTracking;

function openCryptoFromMenu() {
    closeMoreMenu();
    if (typeof window.openCrypto === "function") {
        window.openCrypto();
    }
}

window.openCryptoFromMenu = openCryptoFromMenu;

function openCrypto() {
    hideShipTrackingSection();


    document.documentElement.classList.remove("settings-open");
    hideWaterLevelsSection();

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
    if (navLinks) closeNavMenuUnlessPreserved(navLinks);

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
    hideShipTrackingSection();


    document.documentElement.classList.remove("settings-open");
    hideWaterLevelsSection();

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
        closeNavMenuUnlessPreserved(navLinks);
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
    hideShipTrackingSection();


    document.documentElement.classList.remove("settings-open");
    hideWaterLevelsSection();

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
    closeNavMenuUnlessPreserved(navLinks);
}

document.documentElement.style.overflowY = "auto";
document.body.style.overflowY = "auto";

window.scrollTo({
    top: 0,
    behavior: "smooth"
});
}

window.openMoney = openMoney;
