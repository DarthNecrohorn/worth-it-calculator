/* Worth It Guest Lite: daily account prompt and explicit access limits. */
(function () {
    "use strict";

    const DAY_MS = 24 * 60 * 60 * 1000;
    const NEXT_PROMPT_KEY = "worthItGuestLiteNextPromptAtV1";
    const LAST_ACCEPTED_KEY = "worthItGuestLiteAcceptedAtV1";
    const AUTH_OVERLAY_ID = "authModalOverlay";
    const GUEST_OVERLAY_ID = "worthItGuestLimitsOverlay";
    const RESTRICTED_PATHS = [
        /^\/weather\/?$/,
        /^\/news\/?$/,
        /^\/shop\/?$/,
        /^\/compare-cars\/?$/,
        /^\/markets\/?$/,
        /^\/currencies\/?$/,
        /^\/cryptocurrencies\/?$/,
        /^\/water-levels\/?$/,
        /^\/ship-tracking\/?$/,
        /^\/profile(?:\/|$)/,
        /^\/chat(?:\/|$)/
    ];

    const BUILT_IN_CALCULATORS = new Set([
        "cars", "savings", "investment", "loan", "purchase", "salary",
        "pc", "phone", "rent", "energy", "solar", "heating",
        "ownership", "usednew", "carrepair", "taxi", "publictransport",
        "creditcard", "debtpayoff", "emergency", "buysubscribe",
        "repairreplace", "fuelcost", "depreciation", "carloan",
        "evcharging", "parkingcost", "inflation", "budget", "networth",
        "discount", "opportunity", "laptopdesktop", "phonerepair",
        "cloudstorage", "internetplan", "appliance", "watercost",
        "heatingcompare", "rentafford", "evhybrid", "carinsurance",
        "compound", "savingsgoal", "priceincrease", "monitorupgrade",
        "storageupgrade", "electricitybill", "renovation", "mortgageafford",
        "basic", "advanced", "scientific"
    ]);

    let authStateKnown = false;
    let isAuthenticated = false;
    let autoPromptActive = false;
    let guestLimitsOpen = false;
    let promptTimer = null;
    let authSubscription = null;

    const $ = id => document.getElementById(id);

    function readTimestamp(key) {
        try {
            const value = Number(window.localStorage.getItem(key));
            return Number.isFinite(value) && value > 0 ? value : 0;
        } catch (_) {
            return 0;
        }
    }

    function writeTimestamp(key, timestamp) {
        try {
            window.localStorage.setItem(key, String(Math.max(0, Number(timestamp) || 0)));
        } catch (_) {
            // Guest Lite should still work when local storage is blocked.
        }
    }

    function nextPromptAt() {
        return readTimestamp(NEXT_PROMPT_KEY);
    }

    function setNextPromptAt(timestamp) {
        writeTimestamp(NEXT_PROMPT_KEY, timestamp);
        scheduleDailyPrompt();
    }

    function authOverlay() {
        return $(AUTH_OVERLAY_ID);
    }

    function isAuthModalOpen() {
        return Boolean(authOverlay()?.classList.contains("open"));
    }

    function isSignupModalOpen() {
        const overlay = authOverlay();
        return Boolean(overlay?.classList.contains("open") && overlay.classList.contains("signup-mode"));
    }

    function closeNavMenus() {
        const nav = $("navLinks");
        if (nav) {
            nav.classList.remove("open");
            nav.removeAttribute("data-preserve-open");
            nav.setAttribute("aria-hidden", "true");
        }
        document.querySelector(".menu-btn")?.setAttribute("aria-expanded", "false");
        if (typeof window.closeMoreMenu === "function") window.closeMoreMenu();
    }

    function isRestrictedPath(pathname) {
        const path = String(pathname || window.location.pathname || "/").replace(/\/+$/, "") || "/";
        return RESTRICTED_PATHS.some(pattern => pattern.test(path));
    }

    function restoreHomeIfOnRestrictedPath() {
        const path = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
        if (!isRestrictedPath(path)) return;
        // Keep the requested chat URL even when auth has expired or is being
        // restored. The sign-in prompt can then return the member to /chat.
        if (/^\/chat(?:\/|$)/.test(path)) return;
        try {
            window.history.replaceState(window.history.state || null, "", "/");
        } catch (_) {}
        if (typeof window.showHome === "function") {
            window.showHome();
        } else {
            const home = $("homePage");
            if (home) home.style.display = "block";
        }
    }

    function installSignupGuestChoice() {
        const overlay = authOverlay();
        const submit = $("authSubmitBtn");
        if (!overlay || !submit) return;

        let choice = $("authGuestContinueButton");
        if (!choice) {
            choice = document.createElement("button");
            choice.type = "button";
            choice.id = "authGuestContinueButton";
            choice.className = "auth-modal-guest-choice";
            choice.textContent = "Or continue as a guest";
            choice.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                if (isAuthenticated) return;
                autoPromptActive = false;
                if (typeof window.closeAuthModal === "function") window.closeAuthModal(true);
                showGuestLimits();
            });
            submit.insertAdjacentElement("afterend", choice);
        }

        choice.hidden = !overlay.classList.contains("signup-mode");
        choice.setAttribute("aria-hidden", String(choice.hidden));
    }

    function showSignupModal(automatic) {
        if (isAuthenticated || !authStateKnown) return;
        const existingOverlay = authOverlay();
        if (isAuthModalOpen() && !isSignupModalOpen()) {
            // Respect an explicit sign-in, password recovery or MFA flow already in progress.
            if (automatic) setNextPromptAt(Date.now() + DAY_MS);
            return;
        }

        autoPromptActive = Boolean(automatic);
        if (automatic) writeTimestamp(NEXT_PROMPT_KEY, Date.now() + DAY_MS);

        if (typeof window.openAuthModal === "function") {
            window.openAuthModal("signup");
        } else {
            const overlay = existingOverlay;
            if (overlay) {
                overlay.classList.add("open", "signup-mode");
                overlay.setAttribute("aria-hidden", "false");
            }
        }
        installSignupGuestChoice();
        window.setTimeout(installSignupGuestChoice, 0);
    }

    function showSignupForRestrictedFeature(reason) {
        if (isAuthenticated) return false;
        if (!authStateKnown) {
            resolveAuthState().then(user => {
                if (!user) showSignupForRestrictedFeature(reason);
            });
            return false;
        }

        if (guestLimitsOpen) closeGuestLimits(false);
        restoreHomeIfOnRestrictedPath();
        closeNavMenus();

        if (nextPromptAt() <= Date.now()) {
            writeTimestamp(NEXT_PROMPT_KEY, Date.now() + DAY_MS);
        }

        if (isSignupModalOpen()) {
            installSignupGuestChoice();
            return false;
        }

        autoPromptActive = false;
        if (typeof window.openAuthModal === "function") {
            window.openAuthModal("signup");
        }
        installSignupGuestChoice();
        window.setTimeout(installSignupGuestChoice, 0);
        if (reason) {
            const subtitle = $("authModalSubtitle");
            if (subtitle && isSignupModalOpen()) {
                subtitle.textContent = reason + " Create an account, or continue with Guest Lite to use only the default calculators.";
            }
        }
        return false;
    }

    function showGuestLimits() {
        if (isAuthenticated) return;
        const overlay = $(GUEST_OVERLAY_ID);
        const checkbox = $("worthItGuestConsentCheck");
        const continueButton = $("worthItGuestContinueButton");
        if (!overlay || !checkbox || !continueButton) {
            showSignupForRestrictedFeature("Guest access has account-based limitations.");
            return;
        }

        guestLimitsOpen = true;
        checkbox.checked = false;
        continueButton.disabled = true;
        overlay.hidden = false;
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("worth-it-guest-dialog-open");
        $("worthItGuestConsentStatus").textContent = "Review the available features and limitations, then check the box to continue.";
        window.setTimeout(() => checkbox.focus(), 30);
    }

    function closeGuestLimits(returnToSignup) {
        const overlay = $(GUEST_OVERLAY_ID);
        guestLimitsOpen = false;
        if (overlay) {
            overlay.hidden = true;
            overlay.setAttribute("aria-hidden", "true");
        }
        document.body.classList.remove("worth-it-guest-dialog-open");

        if (returnToSignup && !isAuthenticated) {
            autoPromptActive = false;
            if (typeof window.openAuthModal === "function") window.openAuthModal("signup");
            installSignupGuestChoice();
            window.setTimeout(installSignupGuestChoice, 0);
        }
    }

    function acceptGuestLimits() {
        if (isAuthenticated) {
            closeGuestLimits(false);
            return;
        }
        const checkbox = $("worthItGuestConsentCheck");
        if (!checkbox?.checked) {
            const status = $("worthItGuestConsentStatus");
            if (status) status.textContent = "Please agree to the Guest Lite limitations before continuing.";
            return;
        }

        writeTimestamp(LAST_ACCEPTED_KEY, Date.now());
        setNextPromptAt(Date.now() + DAY_MS);
        closeGuestLimits(false);
    }

    function verifiedGuestStateUser(user) {
        if (!user) return null;
        if (
            typeof window.isWorthItEmailVerified === "function" &&
            !window.isWorthItEmailVerified(user)
        ) {
            return null;
        }
        return user;
    }

    function resolveAuthState() {
        if (authStateKnown) return Promise.resolve(isAuthenticated);
        if (window.worthItGuestAuthResolution) return window.worthItGuestAuthResolution;

        window.worthItGuestAuthResolution = (async function () {
            try {
                if (window.worthItAuthReady) await Promise.resolve(window.worthItAuthReady).catch(() => {});
                // A SIGNED_IN / SIGNED_OUT event may have arrived while the
                // initial app auth promise was resolving. Trust that newer
                // shared state rather than overwriting it with a stale read.
                if (authStateKnown) return isAuthenticated;

                if (window.worthItAuthStateResolved) {
                    setAuthState(window.worthItCurrentAuthUser || null, "INITIAL_SESSION");
                    return isAuthenticated;
                }

                const auth = window.supabaseClient?.auth;
                if (!auth?.getSession) {
                    setAuthState(null, "AUTH_UNAVAILABLE");
                    return false;
                }
                const result = await auth.getSession();
                setAuthState(verifiedGuestStateUser(result?.data?.session?.user || null), "INITIAL_SESSION");
            } catch (_) {
                setAuthState(null, "AUTH_UNAVAILABLE");
            }
            return isAuthenticated;
        })();
        return window.worthItGuestAuthResolution;
    }

    function setAuthState(user, eventName) {
        const wasKnown = authStateKnown;
        const wasAuthenticated = isAuthenticated;
        authStateKnown = true;
        isAuthenticated = Boolean(user);

        if (isAuthenticated) {
            if (promptTimer !== null) window.clearTimeout(promptTimer);
            promptTimer = null;
            closeGuestLimits(false);
            if (autoPromptActive && isSignupModalOpen() && typeof window.closeAuthModal === "function") {
                window.closeAuthModal(true);
            }
            autoPromptActive = false;
            return;
        }

        if (eventName === "SIGNED_OUT" || (wasKnown && wasAuthenticated && !isAuthenticated)) {
            if (isRestrictedPath(window.location.pathname)) restoreHomeIfOnRestrictedPath();
        }

        if (isRestrictedPath(window.location.pathname)) {
            restoreHomeIfOnRestrictedPath();
            showSignupForRestrictedFeature("This section requires a Worth It account.");
            return;
        }

        scheduleDailyPrompt();
    }

    function scheduleDailyPrompt() {
        if (!authStateKnown || isAuthenticated) return;
        if (promptTimer !== null) window.clearTimeout(promptTimer);
        promptTimer = null;

        const due = nextPromptAt();
        if (due > Date.now()) {
            promptTimer = window.setTimeout(() => {
                promptTimer = null;
                if (authStateKnown && !isAuthenticated) scheduleDailyPrompt();
            }, Math.min(due - Date.now(), DAY_MS));
            return;
        }

        if (isAuthModalOpen()) {
            writeTimestamp(NEXT_PROMPT_KEY, Date.now() + DAY_MS);
            return;
        }

        showSignupModal(true);
    }

    function denyGuestAction(reason) {
        return showSignupForRestrictedFeature(reason || "This feature is available to Worth It account holders.");
    }

    function guardFunction(name, reason) {
        const original = window[name];
        if (typeof original !== "function" || original.__worthItGuestGuard) return;
        const wrapped = function (...args) {
            if (authStateKnown) {
                return isAuthenticated ? original.apply(this, args) : denyGuestAction(reason);
            }
            return resolveAuthState().then(user => {
                if (user) return original.apply(this, args);
                return denyGuestAction(reason);
            });
        };
        wrapped.__worthItGuestGuard = true;
        wrapped.__worthItGuestOriginal = original;
        window[name] = wrapped;
    }

    function guardBuiltInCalculatorOpener() {
        const original = window.openCalculator;
        if (typeof original !== "function" || original.__worthItGuestCalculatorGuard) return;
        const wrapped = function (type, ...args) {
            const key = String(type == null ? "" : type).toLowerCase();
            if (BUILT_IN_CALCULATORS.has(key)) return original.call(this, type, ...args);
            return guardUnknownCalculator(this, original, type, args);
        };
        wrapped.__worthItGuestCalculatorGuard = true;
        window.openCalculator = wrapped;
    }

    function guardUnknownCalculator(context, original, type, args) {
        const reason = "User-created and community calculators require a Worth It account.";
        if (authStateKnown) {
            return isAuthenticated ? original.call(context, type, ...args) : denyGuestAction(reason);
        }
        return resolveAuthState().then(user => user
            ? original.call(context, type, ...args)
            : denyGuestAction(reason));
    }

    function guardUGCButtons(event) {
        if (isAuthenticated) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const selector = [
            "[data-ugc-calculator]",
            "[data-user-generated-calculator]",
            "[data-calculator-origin='user']",
            "[data-calculator-origin='community']",
            "[data-calculator-owner='user']",
            "[data-calculator-type='ugc']",
            "[data-feature='ugc-calculators']",
            "[data-action='create-calculator']",
            "[data-action='open-user-calculator']",
            ".ugc-calculator",
            ".user-generated-calculator",
            "#ugcCalculators",
            "#userGeneratedCalculators",
            "#communityCalculators",
            "#userCalculatorBuilder"
        ].join(",");
        const hit = target.closest(selector);
        if (!hit) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        showSignupForRestrictedFeature("Creating and using user-created calculators requires a Worth It account.");
    }

    const blockedFeatures = [
        ["openWeather", "Weather is available after you create a Worth It account."],
        ["openNews", "News is available after you create a Worth It account."],
        ["openDiscounts", "Shop is available after you create a Worth It account."],
        ["openCars", "Compare cars is available after you create a Worth It account."],
        ["openMarkets", "Markets are available after you create a Worth It account."],
        ["openMoney", "Currencies are available after you create a Worth It account."],
        ["openCrypto", "Cryptocurrency data is available after you create a Worth It account."],
        ["openWaterLevels", "Water levels are available after you create a Worth It account."],
        ["openShipTracking", "Ship tracking is available after you create a Worth It account."],
        ["openAIChat", "Worth It AI Chat requires a Worth It account."],
        ["sendAIChatMessage", "Worth It AI Chat requires a Worth It account."],
        ["openWorthItUserSearch", "Searching for people requires a Worth It account."],
        ["openWorthItProfile", "User profiles and social features require a Worth It account."],
        ["openWorthItProfileConnections", "Friends, followers and following lists require a Worth It account."],
        ["openWorthItProfileConnectionsForCurrent", "Friends, followers and following lists require a Worth It account."],
        ["performWorthItSocialAction", "Friend requests and following require a Worth It account."],
        ["performWorthItPendingRequestAction", "Friend requests require a Worth It account."],
        ["toggleWorthItNotifications", "Notifications require a Worth It account."],
        ["toggleWorthItChat", "Global, private and group chats require a Worth It account."],
        ["openWorthItGlobalChat", "Global Chat requires a Worth It account."],
        ["openWorthItFriendChat", "Private chats require a Worth It account."],
        ["openWorthItGroupChatDialog", "Creating group chats requires a Worth It account."],
        ["sendWorthItChatMessage", "Sending messages requires a Worth It account."],
        ["shareWorthItGroupInvite", "Group invitations require a Worth It account."],
        ["acceptWorthItGroupInvite", "Joining group chats requires a Worth It account."],
        ["performWorthItGroupAction", "Managing group chats requires a Worth It account."],
        ["openWorthItGroupManageDialog", "Managing group chats requires a Worth It account."],
        ["openWorthItChatProfile", "Opening profiles from chat requires a Worth It account."]
    ];

    function installGuards() {
        blockedFeatures.forEach(([name, reason]) => guardFunction(name, reason));
        guardBuiltInCalculatorOpener();

        [
            "openUGCCalculator", "openUserGeneratedCalculator", "openUserCalculator",
            "openCommunityCalculator", "openCommunityCalculators", "openMyCalculators",
            "createUGCCalculator", "createUserCalculator", "createCommunityCalculator",
            "saveUGCCalculator", "publishUGCCalculator", "editUGCCalculator",
            "openCalculatorBuilder", "createCustomCalculator", "saveCustomCalculator",
            "openCustomCalculator", "openCalculatorMarketplace", "openUserCalculatorEditor"
        ].forEach(name => guardFunction(
            name,
            "Creating and using user-created calculators requires a Worth It account."
        ));
    }

    function installModalControls() {
        const overlay = authOverlay();
        if (!overlay) return;

        installSignupGuestChoice();

        const observer = new MutationObserver(() => {
            installSignupGuestChoice();
            if (!overlay.classList.contains("open")) autoPromptActive = false;
        });
        observer.observe(overlay, {attributes:true, attributeFilter:["class"]});

        overlay.addEventListener("click", event => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;

            if (target.closest("#authModeToggle button") &&
                /sign in/i.test(target.closest("#authModeToggle button").textContent || "")) {
                autoPromptActive = false;
            }

            if (target.closest(".auth-modal-close") && autoPromptActive) {
                // The automatic daily prompt has already scheduled the next reminder.
                autoPromptActive = false;
            }
        }, true);

        $("worthItGuestConsentCheck")?.addEventListener("change", event => {
            const button = $("worthItGuestContinueButton");
            if (button) button.disabled = !event.target.checked;
            const status = $("worthItGuestConsentStatus");
            if (status) status.textContent = event.target.checked
                ? "Thanks. You can continue with the default calculators only."
                : "Review the available features and limitations, then check the box to continue.";
        });

        $("worthItGuestContinueButton")?.addEventListener("click", acceptGuestLimits);
        $("worthItGuestCloseBtn")?.addEventListener("click", () => closeGuestLimits(true));
        $("worthItGuestCreateAccountBtn")?.addEventListener("click", () => closeGuestLimits(true));
        $(GUEST_OVERLAY_ID)?.addEventListener("click", event => {
            if (event.target === event.currentTarget) closeGuestLimits(true);
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && guestLimitsOpen) {
                event.preventDefault();
                closeGuestLimits(true);
            }
        });

        document.addEventListener("click", guardUGCButtons, true);
    }

    function subscribeToAuthChanges() {
        const auth = window.supabaseClient?.auth;
        if (!auth?.onAuthStateChange || authSubscription) return;
        const result = auth.onAuthStateChange((event, session) => {
            setAuthState(verifiedGuestStateUser(session?.user || null), event);
        });
        authSubscription = result?.data?.subscription || result?.subscription || true;
    }

    function initialize() {
        installModalControls();
        installGuards();
        subscribeToAuthChanges();

        resolveAuthState().then(() => {
            installSignupGuestChoice();
            if (!isAuthenticated && isRestrictedPath(window.location.pathname)) {
                restoreHomeIfOnRestrictedPath();
                showSignupForRestrictedFeature("This section requires a Worth It account.");
            } else {
                scheduleDailyPrompt();
            }
        });

        window.addEventListener("storage", event => {
            if (event.key === NEXT_PROMPT_KEY && !isAuthenticated) scheduleDailyPrompt();
        });

        window.addEventListener("pageshow", () => {
            if (authStateKnown && !isAuthenticated) scheduleDailyPrompt();
        });

        window.addEventListener("beforeunload", () => {
            if (promptTimer !== null) window.clearTimeout(promptTimer);
        }, {once:true});

        window.WorthItGuestLite = Object.freeze({
            isAuthenticated: () => authStateKnown && isAuthenticated,
            showAccountPrompt: () => showSignupModal(false),
            showGuestLimitations: showGuestLimits,
            getNextPromptAt: nextPromptAt,
            allowedDefaultCalculators: Object.freeze(Array.from(BUILT_IN_CALCULATORS))
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, {once:true});
    } else {
        initialize();
    }
})();