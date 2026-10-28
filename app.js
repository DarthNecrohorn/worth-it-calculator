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
let authMfaLoginInProgress = false;
let authMfaEnforcementCheckInProgress = false;
let authMfaRequired = false;
let authPendingMfaFactorId = "";
let authPendingMfaFactorType = "totp";
let authMfaPendingClient = null;
let authMfaLoginClient = null;

function getAuthMfaLoginClient() {
    if (!authMfaLoginClient) {
        authMfaLoginClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                    flowType: "implicit",
                    storageKey: "worth-it-mfa-pending-auth-token-v1"
                }
            }
        );
    }
    return authMfaLoginClient;
}

/*
 * A temporary login client uses a non-persistent, non-auto-refreshing
 * session. After its verified tokens are handed to the primary client,
 * release the temporary client without calling auth.signOut(): that would
 * revoke the same refresh token now being used by the primary client.
 */
function releaseAuthMfaLoginClient(client) {
    if (!client || client === window.supabaseClient) {
        return;
    }

    if (authMfaPendingClient === client) {
        authMfaPendingClient = null;
    }

    if (authMfaLoginClient === client) {
        authMfaLoginClient = null;
    }
}


/* =========================================================
EARLY AUTH STATE LISTENER
========================================================= */

/*
 * Register this immediately after creating the Supabase client.
 * The listener is registered immediately so account state changes
 * are reflected as soon as Supabase initializes.
 */
window.supabaseClient.auth.onAuthStateChange((event, session) => {
    updateAuthUI(session?.user || null);

    if (event === "PASSWORD_RECOVERY") {
        authMfaRequired = false;
        authPendingMfaFactorId = "";
        authPendingMfaFactorType = "totp";
        const pendingClient = authMfaPendingClient;
        authMfaPendingClient = null;
        try { pendingClient?.auth?.signOut({ scope: "local" }); } catch (_) {}
        setTimeout(() => openAuthModal("reset"), 0);
        return;
    }

    if (event === "SIGNED_IN") {
        if (!authMfaLoginInProgress && !authMfaRequired) closeAuthModal();
    }

    if (
        session?.user &&
        !authMfaLoginInProgress &&
        !authMfaRequired &&
        !authMfaEnforcementCheckInProgress &&
        ["INITIAL_SESSION", "SIGNED_IN"].includes(event)
    ) {
        setTimeout(() => ensureMfaVerificationIfNeeded(window.supabaseClient.auth), 0);
    }

    if (typeof updateAIChatView === "function") updateAIChatView();
});

async function ensureMfaVerificationIfNeeded(authClient, options) {
    const pendingLogin = Boolean(options?.pendingLogin);
    const failClosed = (message, error) => {
        throw (error || new Error(message));
    };

    // Ignore a duplicate notification while an MFA transition is already running.
    if (authMfaRequired || authMfaLoginInProgress || authMfaEnforcementCheckInProgress) {
        return false;
    }
    authMfaEnforcementCheckInProgress = true;
    try {
        if (!authClient?.mfa) {
            return failClosed("Two-factor verification is unavailable. Please try signing in again.");
        }

        const assurance = await authClient.mfa.getAuthenticatorAssuranceLevel();
        if (assurance?.error) {
            return failClosed("Could not verify the account's sign-in security level. Please try again.", assurance.error);
        }

        const levels = assurance?.data;
        const validLevels = new Set(["aal1", "aal2"]);
        if (!validLevels.has(levels?.currentLevel) || !validLevels.has(levels?.nextLevel)) {
            return failClosed("Could not determine the account's required sign-in security level.");
        }
        if (levels.currentLevel === "aal2" || levels.nextLevel !== "aal2") {
            return false;
        }

        const list = await authClient.mfa.listFactors();
        if (list?.error) {
            return failClosed("Could not load a verified two-factor method. Please try again.", list.error);
        }

        const totp = (list.data?.totp || []).find(item => item.status === "verified");
        const phone = (list.data?.phone || []).find(item => item.status === "verified");
        const factor = totp || phone;
        if (!factor?.id) {
            return failClosed("Two-factor authentication is required, but no verified method could be loaded. Please try signing in again.");
        }

        // A restored AAL1 session must not remain usable while a second factor
        // is requested. Discard it locally and restart through the temporary
        // sign-in client, which does not persist a session until AAL2 succeeds.
        if (!pendingLogin) {
            const signedOut = await authClient.signOut({ scope: "local" });
            if (signedOut?.error) {
                return failClosed("For safety, Worth It could not reset this session for two-factor verification. Please sign out and sign in again.", signedOut.error);
            }
            authPendingMfaFactorId = "";
            authPendingMfaFactorType = "totp";
            authMfaPendingClient = null;
            authMfaRequired = false;
            updateAuthUI(null);
            openAuthModal("signin");
            setAuthStatus(
                "This session needs a fresh sign-in to complete two-factor verification. Sign in again with your username and password.",
                "error"
            );
            return false;
        }

        authPendingMfaFactorId = factor.id;
        authPendingMfaFactorType = factor.factor_type || (totp ? "totp" : "phone");
        authMfaPendingClient = options?.pendingClient || null;
        if (!authMfaPendingClient) {
            authPendingMfaFactorId = "";
            return failClosed("The secure sign-in session could not be prepared. Please try again.");
        }

        authMfaRequired = true;
        openAuthModal("mfa");
        const subtitle = $("authModalSubtitle");
        if (subtitle) {
            subtitle.textContent = authPendingMfaFactorType === "phone"
                ? "Enter the verification code sent to your verified phone to complete sign-in."
                : "Enter the current 6-digit code from your authenticator app to complete sign-in.";
        }
        setAuthStatus(authPendingMfaFactorType === "phone"
            ? "Two-factor authentication is enabled. Enter the code sent to your phone."
            : "Two-factor authentication is enabled. Enter the current code from your authenticator app.", "");
        return true;
    } catch (error) {
        if (pendingLogin) throw error;

        // A persisted AAL1 session must not silently continue if the required
        // MFA step cannot be evaluated. Sign out locally and require a fresh login.
        authMfaRequired = false;
        authPendingMfaFactorId = "";
        authPendingMfaFactorType = "totp";
        const pendingClient = authMfaPendingClient;
        authMfaPendingClient = null;
        try {
            if (pendingClient && pendingClient !== window.supabaseClient) {
                await pendingClient.auth.signOut({ scope: "local" });
            }
        } catch (_) {}
        try {
            await window.supabaseClient.auth.signOut({ scope: "local" });
        } catch (_) {}
        updateAuthUI(null);
        openAuthModal("signin");
        setAuthStatus(
            "We couldn't confirm your account's sign-in security level. You have been signed out for safety. Please sign in again.",
            "error"
        );
        return false;
    } finally {
        authMfaEnforcementCheckInProgress = false;
    }
}


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
 * Keep the account dropdown below both header rows and inside the viewport.
 * The body uses CSS zoom for accessibility scaling, so convert measured
 * viewport geometry back to the dropdown's CSS coordinate space.
 */
function positionAccountPanelForMobile() {

    const panel = $("accountPanel");
    const wrap = $("authWrap");

    if (!panel || !wrap || !panel.classList.contains("open")) return;

    const wrapRect = wrap.getBoundingClientRect();
    const secondaryRow = document.querySelector(".nav-secondary-row");
    const secondaryRect = secondaryRow
        ? secondaryRow.getBoundingClientRect()
        : null;
    const headerBottom = Math.max(
        wrapRect.bottom,
        secondaryRect ? secondaryRect.bottom : wrapRect.bottom
    );

    const bodyZoom = Number.parseFloat(getComputedStyle(document.body).zoom);
    const rootScale = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")
    );
    const scale = Number.isFinite(bodyZoom) && bodyZoom > 0
        ? bodyZoom
        : (Number.isFinite(rootScale) && rootScale > 0 ? rootScale : 1);
    const gap = 8;

    // Absolute positioning is relative to #authWrap, but measured rectangles
    // are viewport-relative. This places the menu directly under row two.
    const top = Math.max(0, (headerBottom - wrapRect.top + gap) / scale);
    panel.style.setProperty("--account-panel-top", top + "px");

    // Reserve space for the header and a small bottom margin so short screens
    // can scroll the menu internally rather than clipping it at the viewport.
    const availableHeight = Math.max(
        80,
        (window.innerHeight - headerBottom - gap - 12) / scale
    );
    panel.style.setProperty(
        "--account-panel-available-height",
        availableHeight + "px"
    );
}

// Recalculate after rotation, viewport resizing, or mobile browser chrome changes.
window.addEventListener("resize", positionAccountPanelForMobile);
window.addEventListener("orientationchange", positionAccountPanelForMobile);
if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", positionAccountPanelForMobile);
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

function isWorthItEmailVerified(user) {
    return Boolean(user && (user.email_confirmed_at || user.confirmed_at));
}

function updateWorthItEmailVerificationGate(user) {
    let overlay = document.getElementById("worthItEmailVerificationGate");
    if (!user || isWorthItEmailVerified(user)) {
        overlay?.remove();
        return;
    }
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "worthItEmailVerificationGate";
    overlay.className = "worth-it-email-gate";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "worthItEmailGateTitle");

    const card = document.createElement("section");
    card.className = "worth-it-email-gate-card";
    const icon = document.createElement("div");
    icon.className = "worth-it-email-gate-icon";
    icon.textContent = "✉";
    const title = document.createElement("h2");
    title.id = "worthItEmailGateTitle";
    title.textContent = "Confirm your email to continue";
    const description = document.createElement("p");
    description.textContent = "We sent a confirmation link to " + (user.email || "your email address") + ". Confirm it from your inbox to unlock messaging and the full Worth It experience.";
    const note = document.createElement("p");
    note.className = "worth-it-email-gate-note";
    note.textContent = "If the link expired or you cannot find the email, request a new one. Check Spam/Junk too.";
    const status = document.createElement("div");
    status.className = "worth-it-email-gate-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "worth-it-email-gate-actions";

    const inbox = document.createElement("a");
    inbox.className = "worth-it-email-gate-primary";
    inbox.textContent = "Open email inbox";
    inbox.href = "mailto:";
    inbox.target = "_blank";
    inbox.rel = "noopener noreferrer";
    const domain = String(user.email || "").split("@")[1]?.toLowerCase() || "";
    if (domain === "gmail.com" || domain === "googlemail.com") inbox.href = "https://mail.google.com/";
    else if (["outlook.com", "hotmail.com", "live.com"].includes(domain)) inbox.href = "https://outlook.live.com/mail/";
    else if (domain === "yahoo.com" || domain.endsWith(".yahoo.com")) inbox.href = "https://mail.yahoo.com/";

    const resend = document.createElement("button");
    resend.type = "button";
    resend.className = "worth-it-email-gate-secondary";
    resend.textContent = "Resend confirmation";
    resend.addEventListener("click", async () => {
        if (!user.email || resend.disabled) return;
        resend.disabled = true;
        status.textContent = "Sending a new confirmation email…";
        status.classList.remove("is-error");
        try {
            const { error } = await window.supabaseClient.auth.resend({
                type: "signup",
                email: user.email,
                options: { emailRedirectTo: window.location.origin + "/" }
            });
            if (error) throw error;
            status.textContent = "A new confirmation email has been requested. Check your inbox and Spam/Junk.";
        } catch (error) {
            status.textContent = error?.message || "Could not resend the email. Please wait a moment and try again.";
            status.classList.add("is-error");
        } finally {
            window.setTimeout(() => { if (resend.isConnected) resend.disabled = false; }, 5000);
        }
    });

    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "worth-it-email-gate-signout";
    signOut.textContent = "Sign out";
    signOut.addEventListener("click", () => {
        overlay.remove();
        if (typeof window.signOutUser === "function") window.signOutUser();
    });

    actions.append(inbox, resend);
    card.append(icon, title, description, note, actions, status, signOut);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    resend.focus();
}
window.isWorthItEmailVerified = isWorthItEmailVerified;

function updateAuthUI(user) {

    currentAuthUser =
        user || null;

    // Share the primary app's authoritative auth state with features that
    // need to gate UI. They should not race a second initial getSession()
    // against the main auth initialization.
    window.worthItCurrentAuthUser = currentAuthUser;
    window.worthItAuthStateResolved = true;
    updateWorthItEmailVerificationGate(currentAuthUser);

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


        // profile-ui.js owns the persisted Worth It profile avatar once loaded.
        // Do not replace it with auth-provider metadata on token refresh / tab return.
        if (!profileIcon.dataset.worthItProfileManaged) {
            profileIcon.innerHTML =
                makeAvatarMarkup(
                    user,
                    "auth-avatar"
                );
        }


        if ($("accountHeadAvatar") && !$("accountHeadAvatar").dataset.worthItProfileManaged) {

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
            "Sign in or create a Worth It account";


        icon.textContent =
            "🔐";


        label.textContent =
            "Sign in";


        profileBtn.style.display =
            "none";


        profileIcon.innerHTML =
            "👤";
        delete profileIcon.dataset.worthItProfileManaged;


        closeAccountPanel();


        signOutBtn.style.display =
            "none";


        if ($("accountHeadAvatar")) {
            $("accountHeadAvatar").innerHTML = "";
            delete $("accountHeadAvatar").dataset.worthItProfileManaged;
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
let authReturnedToSignin = false;

const SUPABASE_TURNSTILE_SITE_KEY =
    "0x4AAAAAAFCI9dgWOsaff0q-";

let authTurnstileWidgetId = null;
let authTurnstileToken = "";
let authModalOpenedAt = 0;
let authTurnstileScriptPromise = null;

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

function loadAuthTurnstileScript() {
    if (window.turnstile) {
        return Promise.resolve(window.turnstile);
    }

    if (authTurnstileScriptPromise) {
        return authTurnstileScriptPromise;
    }

    authTurnstileScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
            "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (window.turnstile) {
                resolve(window.turnstile);
            } else {
                reject(new Error("Turnstile loaded without its API."));
            }
        };
        script.onerror = () => {
            reject(new Error("The Turnstile script request failed."));
        };
        document.head.appendChild(script);
    }).catch((error) => {
        authTurnstileScriptPromise = null;
        throw error;
    });

    return authTurnstileScriptPromise;
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
        loadAuthTurnstileScript()
            .then(() => {
                if (
                    $("authModalOverlay")?.classList.contains("open")
                ) {
                    renderAuthTurnstile();
                }
            })
            .catch((error) => {
                if (
                    $("authModalOverlay")?.classList.contains("open")
                ) {
                    setAuthStatus(
                        "The security check could not be loaded. Check your connection and try again.",
                        "error"
                    );
                }

                console.warn(
                    "Worth It Turnstile could not be loaded:",
                    error
                );
            });
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


const WORTH_IT_USERNAME_BANNED_STEMS = [
    "fuck","shit","bitch","cunt","dick","cock","pussy","whore","slut",
    "bastard","asshole","arsehole","motherfucker","bullshit","dumbass",
    "jackass","nigger","nigga","faggot","retard","retarded","pedo",
    "pedophile","porn","xxx","blowjob","handjob","jizz","rape","rapist",
    "nazi","hitler","kkk"
];

const WORTH_IT_RESERVED_USERNAME_PREFIXES = [
    "admin","administrator","moderator","mod","staff","support",
    "official","security","owner","root","worthit"
];

function normalizeWorthItUsernameForModeration(username) {
    return String(username || "")
        .toLowerCase()
        .replace(/_/g, "")
        .replace(/[01345789]/g, character => ({
            "0":"o","1":"i","3":"e","4":"a","5":"s","7":"t",
            "8":"b","9":"g"
        }[character] || character));
}

function validateWorthItUsernameRules(username) {
    const value = String(username || "").trim();

    if (!/^(?=.*[A-Za-z0-9])[A-Za-z0-9_]{3,20}$/.test(value)) {
        return {
            ok: false,
            message: "Username must be 3–20 characters and use only letters, numbers, and up to one _."
        };
    }

    if ((value.match(/_/g) || []).length > 1) {
        return {
            ok: false,
            message: "Username can contain only one _."
        };
    }

    const normalized =
        normalizeWorthItUsernameForModeration(value);

    if (
        WORTH_IT_USERNAME_BANNED_STEMS.some(
            term => normalized.includes(term)
        )
    ) {
        return {
            ok: false,
            message: "This username contains language that isn't allowed on Worth It."
        };
    }

    if (
        WORTH_IT_RESERVED_USERNAME_PREFIXES.some(prefix =>
            normalized === prefix ||
            normalized.startsWith(prefix + "0") ||
            normalized.startsWith(prefix + "1") ||
            normalized.startsWith(prefix + "2") ||
            normalized.startsWith(prefix + "3") ||
            normalized.startsWith(prefix + "4") ||
            normalized.startsWith(prefix + "5") ||
            normalized.startsWith(prefix + "6") ||
            normalized.startsWith(prefix + "7") ||
            normalized.startsWith(prefix + "8") ||
            normalized.startsWith(prefix + "9")
        )
    ) {
        return {
            ok: false,
            message: "This username is reserved and cannot be used."
        };
    }

    if ((value.match(/[0-9]/g) || []).length >= 7) {
        return {
            ok: false,
            message: "Usernames cannot contain phone numbers or other long numeric identifiers."
        };
    }

    return {
        ok: true,
        message: ""
    };
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
        valid: payload?.valid !== false,
        reason:
            typeof payload?.reason === "string"
                ? payload.reason
                : ""
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

    const usernameRules =
        validateWorthItUsernameRules(username);

    if (!usernameRules.ok) {
        message.textContent =
            usernameRules.message;
        message.className =
            "auth-username-availability error";
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
            message.textContent =
                result.available
                    ? "✓ Username is available"
                    : result.reason ||
                        "This username isn't available";
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

    authReturnedToSignin =
        false;

    const overlay =
        $("authModalOverlay");

    if (!overlay) return;

    authModalMode =
        ["signin", "signup", "reset", "forgot", "mfa"].includes(mode)
            ? mode
            : "signin";

    authReturnedToSignin =
        false;

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


function closeAuthModal(force) {
    if (authMfaRequired && !force) {
        setAuthStatus("Complete two-factor verification to finish signing in, or choose Cancel sign in.", "error");
        return;
    }


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

window.cancelMfaSignIn = async function() {
    authMfaRequired = false;
    authMfaLoginInProgress = false;
    authPendingMfaFactorId = "";
    authPendingMfaFactorType = "totp";
    const pendingClient = authMfaPendingClient;
    authMfaPendingClient = null;
    try { await pendingClient?.auth?.signOut({ scope: "local" }); } catch (_) {}
    try {
        await window.supabaseClient.auth.signOut({ scope: "local" });
    } catch (_) {}
    closeAuthModal(true);
    openAuthModal("signin");
};

function switchAuthMode(mode) {

    authReturnedToSignin =
        authModalMode === "signup" &&
        mode === "signin";

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
        ["signin", "signup", "reset", "forgot", "mfa"].includes(mode)
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

    const passwordWrap =
        $("authPasswordWrap");

    const mfaWrap =
        $("authMfaWrap");

    const mfaInput =
        $("authMfaCode");

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

    authOverlay?.classList.toggle(
        "returned-signin-mode",
        authReturnedToSignin &&
        authModalMode === "signin"
    );

    if (
        !title ||
        !subtitle ||
        !usernameWrap ||
        !confirmWrap ||
        !passwordWrap ||
        !mfaWrap ||
        !mfaInput ||
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


    mfaWrap.style.display = "none";
    mfaInput.required = false;
    passwordWrap.style.display = "block";

    if (authModalMode === "mfa") {
        title.textContent = "Verify two-factor authentication";
        subtitle.textContent = authPendingMfaFactorType === "phone" ? "Enter the verification code sent to your verified phone to complete sign-in." : "Enter the current 6-digit code from your authenticator app to complete sign-in.";
        usernameWrap.style.display = "none";
        emailWrap.style.display = "none";
        passwordWrap.style.display = "none";
        confirmWrap.style.display = "none";
        mfaWrap.style.display = "block";
        mfaInput.required = true;
        mfaInput.value = "";
        usernameInput.required = false;
        emailInput.required = false;
        passwordInput.required = false;
        confirmInput.required = false;
        forgot.style.display = "none";
        legalWrap.style.display = "none";
        legalCheck.checked = false;
        submit.textContent = "Verify code";
        toggle.innerHTML = '<button type="button" class="auth-modal-link" onclick="cancelMfaSignIn()">Cancel sign in</button>';
        return;
    }

    mfaInput.value = "";
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
        passwordWrap.style.display =
            "none";

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

        legalWrap.style.display =
            "none";

        legalCheck.checked =
            false;

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

    if (authModalMode === "signup") {
        const usernameRules =
            validateWorthItUsernameRules(username);

        if (!usernameRules.ok) {
            setAuthStatus(
                usernameRules.message,
                "error"
            );
            return;
        }
    }


    if (authModalMode === "mfa" && !/^\d{6}$/.test(($("authMfaCode")?.value || "").replace(/\s/g, ""))) {
        setAuthStatus("Enter the current 6-digit authenticator code.", "error");
        $("authMfaCode")?.focus();
        return;
    }

    if (
        !password &&
        authModalMode !== "forgot" &&
        authModalMode !== "mfa"
    ) {

        setAuthStatus(
            "Enter your password.",
            "error"
        );

        return;

    }


    if (
        authModalMode === "signup" &&
        password.length < 8
    ) {

        setAuthStatus(
            "Password must be at least 8 characters.",
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
                    : authModalMode === "mfa"
                        ? "Verifying your authenticator code..."
                        : "Signing in..."
    );


    try {

        if (authModalMode === "forgot") {
            await requestPasswordReset();

        } else if (authModalMode === "mfa") {
            if (!authPendingMfaFactorId || !authMfaPendingClient?.auth) {
                throw new Error("The pending sign-in is no longer available. Cancel sign-in and try again.");
            }
            const code = ($("authMfaCode")?.value || "").replace(/\s/g, "");
            const pendingAuth = authMfaPendingClient.auth;
            const challenge = await pendingAuth.mfa.challenge({ factorId: authPendingMfaFactorId });
            if (challenge?.error) throw challenge.error;
            const verification = await pendingAuth.mfa.verify({
                factorId: authPendingMfaFactorId,
                challengeId: challenge.data.id,
                code
            });
            if (verification?.error) throw verification.error;

            const verifiedAssurance = await pendingAuth.mfa.getAuthenticatorAssuranceLevel();
            if (verifiedAssurance?.error) throw verifiedAssurance.error;
            if (verifiedAssurance?.data?.currentLevel !== "aal2") {
                throw new Error("The second factor was not confirmed by Supabase. Please check the code and try again.");
            }

            const pendingResult = await pendingAuth.getSession();
            const verifiedSession = pendingResult?.data?.session;
            if (!verifiedSession?.access_token || !verifiedSession?.refresh_token) {
                throw new Error("The verified session could not be retrieved. Please try signing in again.");
            }

            authMfaLoginInProgress = true;
            const committed = await window.supabaseClient.auth.setSession({
                access_token: verifiedSession.access_token,
                refresh_token: verifiedSession.refresh_token
            });
            authMfaLoginInProgress = false;
            if (committed?.error) throw committed.error;

            authMfaRequired = false;
            authPendingMfaFactorId = "";
            authPendingMfaFactorType = "totp";
            const pendingClientToClear = authMfaPendingClient;
            authMfaPendingClient = null;
            releaseAuthMfaLoginClient(pendingClientToClear);
            $("authMfaCode").value = "";
            closeAuthModal(true);
            showToast("Two-factor verification completed.");
            if (typeof window.loadAccountSettings === "function") window.loadAccountSettings();
            if (typeof window.loadSecuritySettings === "function") window.loadSecuritySettings();
        } else if (authModalMode === "signup") {

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

            authMfaLoginInProgress = true;
            const temporaryAuthClient = getAuthMfaLoginClient();
            const temporaryResult = await temporaryAuthClient.auth.setSession({
                access_token: payload.access_token,
                refresh_token: payload.refresh_token
            });
            authMfaLoginInProgress = false;
            if (temporaryResult?.error) throw temporaryResult.error;

            authMfaPendingClient = temporaryAuthClient;
            const mfaRequired = await ensureMfaVerificationIfNeeded(temporaryAuthClient.auth, { pendingLogin: true, pendingClient: temporaryAuthClient });
            if (mfaRequired) return;

            const temporarySessionResult = await temporaryAuthClient.auth.getSession();
            const temporarySession = temporarySessionResult?.data?.session;
            if (!temporarySession?.access_token || !temporarySession?.refresh_token) {
                throw new Error("Authentication response was incomplete. Please try signing in again.");
            }

            authMfaLoginInProgress = true;
            const committed = await window.supabaseClient.auth.setSession({
                access_token: temporarySession.access_token,
                refresh_token: temporarySession.refresh_token
            });
            authMfaLoginInProgress = false;
            if (committed?.error) throw committed.error;

            authMfaPendingClient = null;
            releaseAuthMfaLoginClient(temporaryAuthClient);
            closeAuthModal();

        }


    } catch (error) {
        authMfaLoginInProgress = false;

        // If the primary sign-in flow failed before the MFA prompt was shown,
        // discard the non-persistent temporary client so it cannot be reused.
        if (authModalMode !== "mfa" && authMfaPendingClient && authMfaPendingClient !== window.supabaseClient) {
            const abandonedMfaClient = authMfaPendingClient;
            authMfaPendingClient = null;
            authMfaRequired = false;
            authPendingMfaFactorId = "";
            authPendingMfaFactorType = "totp";
            try { await abandonedMfaClient.auth.signOut({ scope: "local" }); } catch (_) {}
        }

        console.error(
            "Worth It authentication error:",
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

async function performSignOutUser() {

    try {

        const { error } =
            await window.supabaseClient.auth
                .signOut({ scope: "local" });


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


function signOutUser() {
    if (document.getElementById("worthItSignOutConfirmDialog")) return;

    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.id = "worthItSignOutConfirmDialog";
    overlay.className = "worth-it-signout-confirm-dialog";
    overlay.setAttribute("role", "presentation");

    const card = document.createElement("section");
    card.className = "worth-it-signout-confirm-card";
    card.setAttribute("role", "alertdialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "worthItSignOutConfirmTitle");
    card.tabIndex = -1;

    const kicker = document.createElement("span");
    kicker.className = "worth-it-signout-confirm-kicker";
    kicker.textContent = "WORTH IT · ACCOUNT";
    const title = document.createElement("h2");
    title.id = "worthItSignOutConfirmTitle";
    title.textContent = "Are you sure you want to sign out?";

    const actions = document.createElement("div");
    actions.className = "worth-it-signout-confirm-actions";
    const yesButton = document.createElement("button");
    yesButton.type = "button";
    yesButton.className = "worth-it-signout-confirm-yes";
    yesButton.textContent = "Yes";
    const noButton = document.createElement("button");
    noButton.type = "button";
    noButton.className = "worth-it-signout-confirm-no";
    noButton.textContent = "No";
    actions.append(yesButton, noButton);
    card.append(kicker, title, actions);
    overlay.appendChild(card);

    let finished = false;
    const finish = confirmed => {
        if (finished) return;
        finished = true;
        overlay.remove();
        document.body.classList.remove("worth-it-signout-confirm-open");
        if (confirmed) {
            void performSignOutUser();
        } else if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
            previousFocus.focus();
        }
    };

    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            event.preventDefault();
            finish(false);
        }
    });
    overlay.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
            return;
        }
        if (event.key !== "Tab") return;
        if (event.shiftKey && document.activeElement === yesButton) {
            event.preventDefault();
            noButton.focus();
        } else if (!event.shiftKey && document.activeElement === noButton) {
            event.preventDefault();
            yesButton.focus();
        }
    });
    yesButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
    });
    noButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
    });

    // Inline safety keeps the confirmation above chat and other page overlays
    // even if the user's browser still has an older stylesheet cached.
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483646";
    overlay.style.display = "grid";
    document.body.classList.add("worth-it-signout-confirm-open");
    document.body.appendChild(overlay);
    noButton.focus();
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

window.worthItAuthReady = (async function initializeSupabaseAuth() {

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
            <h3>3. Username Rules</h3>
            <p>Usernames must be appropriate for a general-audience community. Usernames may not contain profanity, sexual content, hate speech, slurs, extremist references, misleading impersonation, staff or official-style names, or personal information such as phone numbers. Usernames must use the allowed format and must be unique.</p>
            <p>Attempting to bypass username filtering by disguising prohibited terms with numbers, underscores, or other variations is also prohibited.</p>

            <h3>4. Worth It Is Not a Dating Platform</h3>
            <p><strong>Dating is not permitted on Worth It.</strong> Worth It is not a dating, matchmaking, romantic, or hookup platform. Do not use profiles or community features to look for dates, romantic partners, or sexual partners.</p>
            <p>Dating and personal relationships are allowed <strong>outside of Worth It</strong>. What consenting adults choose to do outside the website is their own personal matter.</p>
            <h3>5. No Unwanted Sexual or Nude Content</h3>
            <p>Do not send, request, post, upload, or distribute sexual or nude content to other users. This includes unsolicited sexual messages, propositions, requests for nude images, and sexually explicit photographs.</p>
            <p>Sending unsolicited <strong>18+ nude or sexually explicit images</strong> to another user may result in an immediate and permanent ban.</p>
            <p>Any sexual content involving minors is strictly prohibited and may be reported to appropriate authorities where required.</p>
            <h3>6. No Harassment or Repeated Unwanted Messages</h3>
            <p>Do not repeatedly contact someone who has asked you to stop. Repeated inappropriate messages, ban evasion, coordinated harassment, or creating new accounts to continue unwanted contact may result in a permanent ban.</p>
            <h3>7. No Threats, Violence, Illegal Activity, Scams, or Malicious Abuse</h3>
            <p>Threats of violence, credible intimidation, serious illegal activity, fraud, impersonation, phishing, malware, scams, or deliberate abuse of platform functionality are not allowed.</p>
            <h3>8. No Doxxing or Privacy Abuse</h3>
            <p>Do not publish, distribute, threaten to reveal, or otherwise misuse another person's private or sensitive information without appropriate authorization.</p>
            <h3>9. Moderation and Bans</h3>
            <p>Worth It may suspend, restrict, or permanently terminate accounts that violate these rules or create a serious risk to the community or service.</p>
            <p><strong>Worth It is not responsible for losses, inconvenience, or other consequences resulting from a suspension, restriction, or ban, to the extent permitted by applicable law.</strong> We will nevertheless make a genuine effort to be fair, reasonable, and consistent and may consider context, severity, history, intent, evidence, and repeated behavior.</p>
            <h3>10. Owner and Administrative Testing Exception</h3>
            <p>The site owner and authorized administrators may perform controlled tests that would otherwise resemble prohibited activity when needed to test moderation, reports, blocks, bans, safety protections, bugs, or other functionality. This is a limited testing and administration exception and does not permit the owner or administrators to use Worth It as a dating platform.</p>
            <h3>11. Appeals</h3>
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
            <p>When you choose to upload or change a profile picture or profile banner, still images and server-generated contact sheets representing every GIF animation frame are sent to Google Gemini for automated safety screening before publication. Approved files are stored in Supabase Storage and can be viewed by anyone who visits that public profile. Do not upload private or sensitive images. Automated safety checks can make mistakes and are not a guarantee that every harmful image will be detected.</p>
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

const WORTH_IT_LEGAL_PATHS = {
    terms: "/terms-of-use",
    community: "/community-rules",
    privacy: "/privacy-policy",
    cookies: "/cookie-storage-policy",
    affiliate: "/affiliate-disclosure",
    disclaimer: "/disclaimer"
};

function getLegalKeyFromLocation() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const pathMatch = Object.entries(WORTH_IT_LEGAL_PATHS)
        .find(([, legalPath]) => legalPath === path);

    if (pathMatch) return pathMatch[0];

    const queryKey = new URLSearchParams(window.location.search).get("legal");
    return Object.prototype.hasOwnProperty.call(WORTH_IT_LEGAL_DOCUMENTS, queryKey)
        ? queryKey
        : null;
}

function deactivateLegalPage({fromHistory = false} = {}) {
    const overlay = $("legalOverlay");
    if (overlay) {
        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden", "true");
    }

    document.documentElement.classList.remove("legal-open", "legal-page-mode");
}

function openLegalPage(type = "terms", options = {}) {
    const overlay = $("legalOverlay");
    const title = $("legalModalTitle");
    const content = $("legalContent");
    if (!overlay || !title || !content) return;

    const key =
        Object.prototype.hasOwnProperty.call(WORTH_IT_LEGAL_DOCUMENTS, type)
            ? type
            : "terms";
    const legalPath = WORTH_IT_LEGAL_PATHS[key];
    const isAlreadyLegalPage =
        document.documentElement.classList.contains("legal-page-mode") ||
        Boolean(getLegalKeyFromLocation());

    if (!options.fromUrl) {
        if (isAlreadyLegalPage) {
            const oldState = window.history.state || {};
            window.history.replaceState({
                ...oldState,
                worthItLegalRoute: true,
                worthItLegalCanReturn: oldState.worthItLegalCanReturn === true,
                worthItLegalReturnUrl: oldState.worthItLegalReturnUrl || "/"
            }, "", legalPath);
        } else {
            const returnUrl =
                window.location.pathname + window.location.search + window.location.hash;
            window.history.pushState({
                worthItLegalRoute: true,
                worthItLegalCanReturn: true,
                worthItLegalReturnUrl: returnUrl
            }, "", legalPath);
        }
    }

    title.textContent = WORTH_IT_LEGAL_DOCUMENTS[key].title;
    content.innerHTML = WORTH_IT_LEGAL_DOCUMENTS[key].content;

    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("legal-open", "legal-page-mode");

    document.querySelectorAll("[data-legal-tab]").forEach(button => {
        const active = button.getAttribute("data-legal-tab") === key;
        button.classList.toggle("active", active);
        button.setAttribute("aria-current", active ? "page" : "false");
    });

    content.scrollTop = 0;
    window.scrollTo({top:0, behavior:"auto"});
    window.setTimeout(() => {
        content.focus({preventScroll:true});
    }, 0);
}

function closeLegalPage(options = {}) {
    const overlay = $("legalOverlay");
    if (!overlay) return;

    if (!options.fromHistory) {
        const state = window.history.state || {};
        if (state.worthItLegalRoute && state.worthItLegalCanReturn) {
            window.history.back();
            return;
        }

        const url = new URL(window.location.href);
        url.pathname = "/";
        url.searchParams.delete("legal");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }

    deactivateLegalPage(options);
}

window.openLegalPage = openLegalPage;
window.closeLegalPage = closeLegalPage;

window.addEventListener("popstate", () => {
    const key = getLegalKeyFromLocation();
    if (key) {
        openLegalPage(key, {fromUrl:true});
    } else {
        closeLegalPage({fromHistory:true});
    }
});

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        $("legalOverlay")?.classList.contains("open")
    ) {
        closeLegalPage();
    }
});

const initialLegalKey = getLegalKeyFromLocation();
if (initialLegalKey) {
    openLegalPage(initialLegalKey, {fromUrl:true});
}


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
    const settingsPage = document.getElementById("settingsPage");

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

    if (settingsPage) {
        settingsPage.style.display = "none";
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

    /*
     * Once the user explicitly opens the hamburger, keep it open while any
     * section is selected. All section buttons share this guard, so users can
     * move between sections without reopening the menu each time. The
     * hamburger button itself calls toggleMenu() and remains the close control.
     */
    if (
        navLinks.classList.contains("open") &&
        navLinks.dataset.preserveOpen === "true"
    ) {
        return;
    }

    navLinks.classList.remove("open");
    delete navLinks.dataset.preserveOpen;
    navLinks.setAttribute("aria-hidden", "true");

    const menuButton = document.querySelector(".menu-btn");
    if (menuButton) menuButton.setAttribute("aria-expanded", "false");

    document.documentElement.style.setProperty("--nav-scroll-lock", "0");
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
     * The mobile navigation uses one unified menu.
     * Keep the legacy More panel mutually exclusive with it,
     * so the two navigation layers never remain open together.
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

    if(typeof window.stopShipTrackingAutoRefresh === "function"){
        window.stopShipTrackingAutoRefresh();
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

    if (typeof window.refreshMarkets === "function") {
        window.refreshMarkets();
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

if (typeof window.initCurrenciesUI === "function") {
    window.initCurrenciesUI();
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
