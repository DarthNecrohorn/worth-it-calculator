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
    if (typeof window.loadAccountSettings === "function") window.loadAccountSettings();
    if (typeof window.loadSecuritySettings === "function") window.loadSecuritySettings();
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

    let accountUsernameStatus = null;
    let accountDisplayNameStatus = null;
    let accountSettingsLoadGeneration = 0;

    function accountStatus(id, message, isError) {
        const node = $(id);
        if (!node) return;
        node.textContent = message || "";
        node.classList.toggle("is-error", Boolean(isError));
        node.classList.toggle("is-success", Boolean(message && !isError));
    }

    function formatAccountDate(value) {
        const date = value ? new Date(value) : null;
        return date && Number.isFinite(date.getTime())
            ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
            : "";
    }

    async function getAccountSession() {
        const client = window.supabaseClient;
        if (!client?.auth) return null;
        const result = await client.auth.getSession();
        return result?.data?.session || null;
    }

    async function accountApi(url, options, token) {
        const headers = Object.assign({ Accept: "application/json" }, options?.headers || {}, {
            Authorization: "Bearer " + token
        });
        if (options?.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
        const response = await fetch(url, Object.assign({}, options || {}, { headers }));
        let payload = {};
        try { payload = await response.json(); } catch (_) {}
        return { response, payload };
    }

    function updateAccountSaveButtons() {
        const usernameInput = $("accountUsernameInput");
        const usernameSave = $("accountUsernameSave");
        if (usernameSave && usernameInput) {
            usernameSave.disabled = !accountUsernameStatus ||
                !accountUsernameStatus.success ||
                !accountUsernameStatus.email_verified ||
                !accountUsernameStatus.can_change ||
                usernameInput.value.trim() === accountUsernameStatus.username ||
                !usernameInput.value.trim();
        }
        const displayInput = $("accountDisplayNameInput");
        const displaySave = $("accountDisplayNameSave");
        if (displaySave && displayInput) {
            displaySave.disabled = !accountDisplayNameStatus ||
                !accountDisplayNameStatus.success ||
                !accountDisplayNameStatus.can_change ||
                displayInput.value.trim() === accountDisplayNameStatus.display_name ||
                !displayInput.value.trim();
        }
    }

    window.loadAccountSettings = async function() {
        const generation = ++accountSettingsLoadGeneration;
        const loading = $("accountSettingsLoading");
        const signedOut = $("accountSettingsSignedOut");
        const content = $("accountSettingsContent");
        if (!loading || !signedOut || !content) return;
        loading.hidden = false;
        loading.textContent = "Loading your account settings…";
        signedOut.hidden = true;
        content.hidden = true;
        accountUsernameStatus = null;
        accountDisplayNameStatus = null;

        let session;
        try { session = await getAccountSession(); }
        catch (_) { session = null; }
        if (generation !== accountSettingsLoadGeneration) return;

        if (!session?.user || !session.access_token) {
            loading.hidden = true;
            signedOut.hidden = false;
            return;
        }

        const user = session.user;
        $("accountCurrentEmail").textContent = user.email || "No email address is attached to this account.";
        $("accountEmailVerified").textContent = user.email_confirmed_at ? "Verified" : "Not verified";
        $("accountEmailVerified").classList.toggle("is-success", Boolean(user.email_confirmed_at));
        $("accountEmailVerified").classList.toggle("is-error", !user.email_confirmed_at);
        $("accountNewEmailInput").value = "";
        $("accountEmailStatus").textContent = "Changing your email requires confirmation through Supabase Auth. Your current address remains active until confirmation is completed.";

        loading.hidden = true;
        content.hidden = false;
        $("accountUsernameInput").value = user.user_metadata?.username || "";
        $("accountUsernameCurrent").textContent = "@" + (user.user_metadata?.username || "—");
        $("accountDisplayNameInput").value = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.username || "";
        $("accountDisplayNameCurrent").textContent = $("accountDisplayNameInput").value || "—";
        accountStatus("accountUsernameStatus", "Checking username availability and change limit…", false);
        accountStatus("accountDisplayNameStatus", "Loading display-name change limit…", false);

        const [usernameResult, displayResult] = await Promise.all([
            accountApi("/api/account-username", {}, session.access_token).catch(() => null),
            accountApi("/api/profile-display-name", {}, session.access_token).catch(() => null)
        ]);
        if (generation !== accountSettingsLoadGeneration) return;

        if (usernameResult?.response.ok && usernameResult.payload?.success) {
            accountUsernameStatus = usernameResult.payload;
            $("accountUsernameInput").value = accountUsernameStatus.username || $("accountUsernameInput").value;
            $("accountUsernameCurrent").textContent = "@" + (accountUsernameStatus.username || "—");
            if (!accountUsernameStatus.email_verified) {
                accountStatus("accountUsernameStatus", "Verify your email address before changing your username.", true);
            } else if (!accountUsernameStatus.can_change && accountUsernameStatus.next_change_at) {
                accountStatus("accountUsernameStatus", "You can change your username again after " + formatAccountDate(accountUsernameStatus.next_change_at) + ".", true);
            } else {
                accountStatus("accountUsernameStatus", "Username changes are limited to once every 14 days. Your email must be verified.", false);
            }
        } else if (usernameResult?.payload?.code === "USERNAME_SETTINGS_SETUP_REQUIRED") {
            accountStatus("accountUsernameStatus", "Database setup required: run supabase/username-change-settings.sql in the Supabase SQL Editor, then reload this page.", true);
        } else if (usernameResult?.response.status === 401) {
            accountStatus("accountUsernameStatus", "Your session expired. Sign in again to manage your username.", true);
        } else {
            accountStatus("accountUsernameStatus", usernameResult?.payload?.error || "Username settings could not be loaded. Try refreshing the page.", true);
        }

        if (displayResult?.response.ok && displayResult.payload?.success) {
            accountDisplayNameStatus = displayResult.payload;
            $("accountDisplayNameInput").value = displayResult.payload.display_name || "";
            $("accountDisplayNameCurrent").textContent = displayResult.payload.display_name || "—";
            if (!displayResult.payload.can_change && displayResult.payload.next_change_at) {
                accountStatus("accountDisplayNameStatus", "You can change your display name again after " + formatAccountDate(displayResult.payload.next_change_at) + ".", true);
            } else {
                accountStatus("accountDisplayNameStatus", "Display names can be changed once every 7 days.", false);
            }
        } else if (displayResult?.payload?.code === "DISPLAY_NAME_SETUP_REQUIRED") {
            accountStatus("accountDisplayNameStatus", "Display-name database setup is required. Existing profile editing remains available from your profile page.", true);
        } else {
            accountStatus("accountDisplayNameStatus", displayResult?.payload?.error || "Could not load display-name settings. Existing profile editing remains available from your profile page.", true);
        }
        updateAccountSaveButtons();
    };

    window.saveAccountUsername = async function() {
        const input = $("accountUsernameInput");
        const button = $("accountUsernameSave");
        const username = input?.value?.trim() || "";
        if (!input || !button || button.disabled) return;
        button.disabled = true;
        accountStatus("accountUsernameStatus", "Saving your username…", false);
        try {
            const session = await getAccountSession();
            if (!session?.access_token) throw new Error("Sign in again to change your username.");
            const result = await accountApi("/api/account-username", {
                method: "POST",
                body: JSON.stringify({ username })
            }, session.access_token);
            if (!result.response.ok || !result.payload?.success) {
                accountStatus("accountUsernameStatus", result.payload?.error || "Could not save your username.", true);
                if (result.response.status === 429 && result.payload?.next_change_at) {
                    accountStatus("accountUsernameStatus", "You can change your username again after " + formatAccountDate(result.payload.next_change_at) + ".", true);
                }
                updateAccountSaveButtons();
                return;
            }
            accountUsernameStatus = Object.assign({}, accountUsernameStatus || {}, result.payload, {
                success: true,
                username: result.payload.username || username,
                email_verified: true,
                can_change: false
            });
            if (window.supabaseClient?.auth?.refreshSession) {
                await window.supabaseClient.auth.refreshSession().catch(() => {});
            }
            $("accountUsernameInput").value = accountUsernameStatus.username;
            $("accountUsernameCurrent").textContent = "@" + accountUsernameStatus.username;
            accountStatus("accountUsernameStatus", result.payload.unchanged
                ? "That is already your current username."
                : "Username updated. You can change it again after " + formatAccountDate(result.payload.next_change_at) + ".", false);
            updateAccountSaveButtons();
        } catch (error) {
            accountStatus("accountUsernameStatus", error?.message || "Could not save your username. Please try again.", true);
            updateAccountSaveButtons();
        }
    };

    window.saveAccountDisplayName = async function() {
        const input = $("accountDisplayNameInput");
        const button = $("accountDisplayNameSave");
        const displayName = input?.value?.trim() || "";
        if (!input || !button || button.disabled) return;
        button.disabled = true;
        accountStatus("accountDisplayNameStatus", "Saving your display name…", false);
        try {
            const session = await getAccountSession();
            if (!session?.access_token) throw new Error("Sign in again to change your display name.");
            const result = await accountApi("/api/profile-display-name", {
                method: "POST",
                body: JSON.stringify({ display_name: displayName })
            }, session.access_token);
            if (!result.response.ok || !result.payload?.success) {
                accountStatus("accountDisplayNameStatus", result.payload?.error || "Could not save your display name.", true);
                updateAccountSaveButtons();
                return;
            }
            accountDisplayNameStatus = Object.assign({}, accountDisplayNameStatus || {}, result.payload, {
                success: true,
                display_name: result.payload.display_name || displayName,
                can_change: Boolean(result.payload.can_change)
            });
            $("accountDisplayNameCurrent").textContent = accountDisplayNameStatus.display_name;
            $("accountDisplayNameInput").value = accountDisplayNameStatus.display_name;
            accountStatus("accountDisplayNameStatus", result.payload.unchanged
                ? "That is already your current display name."
                : "Display name updated successfully. Your profile will show the new name.", false);
            updateAccountSaveButtons();
        } catch (error) {
            accountStatus("accountDisplayNameStatus", error?.message || "Could not save your display name.", true);
            updateAccountSaveButtons();
        }
    };

    window.changeAccountEmail = async function() {
        const input = $("accountNewEmailInput");
        const button = $("accountEmailSave");
        const email = input?.value?.trim() || "";
        if (!input || !button || !email) {
            accountStatus("accountEmailStatus", "Enter the new email address first.", true);
            input?.focus();
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            accountStatus("accountEmailStatus", "Enter a valid email address.", true);
            input.focus();
            return;
        }
        const session = await getAccountSession();
        if (!session?.access_token) {
            accountStatus("accountEmailStatus", "Sign in again to change your email address.", true);
            return;
        }
        button.disabled = true;
        accountStatus("accountEmailStatus", "Requesting email change…", false);
        try {
            const client = window.supabaseClient;
            const result = await client.auth.updateUser({ email });
            if (result?.error) throw result.error;
            accountStatus("accountEmailStatus", "Confirmation instructions have been requested. Check your inbox and follow Supabase's confirmation email(s). Your current email remains in use until confirmation finishes.", false);
            input.value = "";
        } catch (error) {
            accountStatus("accountEmailStatus", error?.message || "Could not request the email change. Please try again.", true);
        } finally {
            button.disabled = false;
        }
    };

    window.openOwnWorthItProfileFromSettings = async function() {
        const client = window.supabaseClient;
        if (!client?.auth) {
            if (typeof window.handleAuthButton === "function") window.handleAuthButton();
            return;
        }
        try {
            const { data } = await client.auth.getSession();
            const userId = data?.session?.user?.id;
            if (!userId) {
                if (typeof window.handleAuthButton === "function") window.handleAuthButton();
                return;
            }
            const profileResponse = await client.from("worth_it_profiles").select("worth_it_id").eq("user_id", userId).maybeSingle();
            if (profileResponse?.data?.worth_it_id && typeof window.openWorthItProfile === "function") {
                window.openWorthItProfile(Number(profileResponse.data.worth_it_id));
                return;
            }
            accountStatus("accountDisplayNameStatus", "Your profile link could not be resolved. Open your profile from the navigation menu.", true);
        } catch (_) {
            accountStatus("accountDisplayNameStatus", "Your profile link could not be resolved. Open your profile from the navigation menu.", true);
        }
    };

    let securityLoadGeneration = 0;
    let activeTotpFactorId = "";
    let pendingTotpFactorId = "";
    let enrollmentTotpFactorId = "";
    let enrollmentTotpSecret = "";

    function securityMessage(id, message, isError) {
        const node = $(id);
        if (!node) return;
        node.textContent = message || "";
        node.classList.toggle("is-error", Boolean(isError));
        node.classList.toggle("is-success", Boolean(message && !isError));
    }

    async function currentSecuritySession() {
        const client = window.supabaseClient;
        if (!client?.auth) return null;
        const result = await client.auth.getSession();
        return result?.data?.session || null;
    }

    window.loadSecuritySettings = async function() {
        const generation = ++securityLoadGeneration;
        const loading = $("securitySettingsLoading");
        const signedOut = $("securitySettingsSignedOut");
        const content = $("securitySettingsContent");
        if (!loading || !signedOut || !content) return;

        loading.hidden = false;
        loading.textContent = "Loading security settings…";
        signedOut.hidden = true;
        content.hidden = true;
        activeTotpFactorId = "";
        pendingTotpFactorId = "";

        let session;
        try { session = await currentSecuritySession(); } catch (_) { session = null; }
        if (generation !== securityLoadGeneration) return;
        if (!session?.user || !session.access_token) {
            loading.hidden = true;
            signedOut.hidden = false;
            $("securityMfaBadge").textContent = "Sign in required";
            return;
        }

        loading.hidden = true;
        content.hidden = false;
        $("securityPasswordStatus").textContent = "Account email: " + (session.user.email || "not available") + ".";
        securityMessage("securitySessionsStatus", "The current browser session is active.", false);
        securityMessage("securityMfaStatus", "Checking authenticator status…", false);
        $("securityMfaStart").hidden = true;
        $("securityMfaEnroll").hidden = true;
        $("securityMfaDisable").hidden = true;
        $("securityMfaPending").hidden = true;
        $("securityMfaBadge").textContent = "Checking…";

        try {
            const result = await window.supabaseClient.auth.mfa.listFactors();
            if (generation !== securityLoadGeneration) return;
            if (result?.error) throw result.error;
            const factors = result?.data?.totp || [];
            const active = factors.find(factor => factor.status === "verified");
            const pending = factors.find(factor => factor.status !== "verified");

            if (active) {
                activeTotpFactorId = active.id;
                $("securityMfaBadge").textContent = "Enabled";
                $("securityMfaBadge").classList.add("is-success");
                securityMessage("securityMfaStatus", "Authenticator two-factor authentication is enabled for this account.", false);
                $("securityMfaDisable").hidden = false;
                $("securityMfaDisableButton").disabled = false;
                $("securityMfaStart").hidden = true;
            } else if (pending) {
                pendingTotpFactorId = pending.id;
                $("securityMfaBadge").textContent = "Setup unfinished";
                $("securityMfaBadge").classList.remove("is-success");
                securityMessage("securityMfaStatus", "A previous setup has not been verified. Remove it before starting again.", true);
                $("securityMfaPending").hidden = false;
                $("securityMfaStart").hidden = true;
            } else {
                $("securityMfaBadge").textContent = "Not enabled";
                $("securityMfaBadge").classList.remove("is-success");
                securityMessage("securityMfaStatus", "Two-factor authentication is not enabled. You can set up an authenticator app below.", false);
                $("securityMfaStart").hidden = false;
            }
        } catch (error) {
            $("securityMfaBadge").textContent = "Unavailable";
            $("securityMfaBadge").classList.remove("is-success");
            securityMessage("securityMfaStatus", error?.message || "Could not check authenticator status. Verify that MFA is enabled in Supabase Auth settings.", true);
            $("securityMfaStart").hidden = true;
        }
    };

    window.openPasswordResetFromSettings = async function() {
        let session;
        try { session = await currentSecuritySession(); } catch (_) { session = null; }
        if (!session?.user?.email) {
            securityMessage("securityPasswordStatus", "Sign in again to request a password reset.", true);
            return;
        }
        if (typeof window.openLoginModal !== "function") {
            securityMessage("securityPasswordStatus", "Password reset is unavailable right now. Please use Forgot password on the sign-in screen.", true);
            return;
        }
        window.openLoginModal("forgot");
        window.setTimeout(function() {
            const emailInput = $("authEmail");
            if (emailInput) {
                emailInput.value = session.user.email;
                emailInput.readOnly = true;
            }
            const subtitle = $("authModalSubtitle");
            if (subtitle) subtitle.textContent = "We will send a password-reset link to your verified account email.";
        }, 60);
    };

    window.startTotpEnrollment = async function() {
        const button = $("securityMfaStart");
        if (button) button.disabled = true;
        securityMessage("securityMfaStatus", "Creating a private authenticator setup…", false);
        try {
            const session = await currentSecuritySession();
            if (!session?.access_token) throw new Error("Sign in again to set up two-factor authentication.");
            const result = await window.supabaseClient.auth.mfa.enroll({
                factorType: "totp",
                friendlyName: "Worth It authenticator"
            });
            if (result?.error) throw result.error;
            const factor = result?.data;
            if (!factor?.id || !factor?.totp?.secret || !factor?.totp?.qr_code) {
                throw new Error("Supabase did not return the full authenticator setup information.");
            }
            enrollmentTotpFactorId = factor.id;
            enrollmentTotpSecret = factor.totp.secret;
            const qr = $("securityMfaQr");
            qr.src = factor.totp.qr_code;
            qr.hidden = false;
            $("securityMfaSecret").textContent = enrollmentTotpSecret;
            $("securityMfaEnrollCode").value = "";
            $("securityMfaEnroll").hidden = false;
            $("securityMfaStart").hidden = true;
            $("securityMfaBadge").textContent = "Setup in progress";
            securityMessage("securityMfaStatus", "Scan the QR code or enter the private setup key, then enter the current 6-digit code to verify it.", false);
        } catch (error) {
            securityMessage("securityMfaStatus", error?.message || "Could not start authenticator setup.", true);
            if (button) button.disabled = false;
        }
    };

    window.copyTotpSecret = async function() {
        if (!enrollmentTotpSecret) return;
        try {
            await navigator.clipboard.writeText(enrollmentTotpSecret);
            securityMessage("securityMfaStatus", "Setup key copied. Keep it private and do not share it.", false);
        } catch (_) {
            securityMessage("securityMfaStatus", "Copy is unavailable in this browser. Select the setup key and copy it manually.", true);
        }
    };

    window.verifyTotpEnrollment = async function() {
        const code = ($("securityMfaEnrollCode")?.value || "").replace(/\s/g, "");
        const button = $("securityMfaVerify");
        if (!enrollmentTotpFactorId) {
            securityMessage("securityMfaStatus", "Start authenticator setup first.", true);
            return;
        }
        if (!/^\d{6}$/.test(code)) {
            securityMessage("securityMfaStatus", "Enter the current 6-digit code from your authenticator app.", true);
            $("securityMfaEnrollCode")?.focus();
            return;
        }
        button.disabled = true;
        try {
            const auth = window.supabaseClient.auth;
            const challenge = await auth.mfa.challenge({ factorId: enrollmentTotpFactorId });
            if (challenge?.error) throw challenge.error;
            const result = await auth.mfa.verify({
                factorId: enrollmentTotpFactorId,
                challengeId: challenge.data.id,
                code
            });
            if (result?.error) throw result.error;
            enrollmentTotpFactorId = "";
            enrollmentTotpSecret = "";
            $("securityMfaEnroll").hidden = true;
            $("securityMfaQr").removeAttribute("src");
            $("securityMfaSecret").textContent = "";
            $("securityMfaEnrollCode").value = "";
            securityMessage("securityMfaStatus", "Two-factor authentication is enabled. Store your authenticator safely and keep access to it.", false);
            await window.loadSecuritySettings();
        } catch (error) {
            securityMessage("securityMfaStatus", error?.message || "The code could not be verified. Check the time on your phone and try again.", true);
        } finally {
            button.disabled = false;
        }
    };

    window.cancelTotpEnrollment = async function() {
        const factorId = enrollmentTotpFactorId;
        if (!factorId) {
            $("securityMfaEnroll").hidden = true;
            return;
        }
        const button = $("securityMfaVerify");
        if (button) button.disabled = true;
        try {
            const result = await window.supabaseClient.auth.mfa.unenroll({ factorId });
            if (result?.error) throw result.error;
            enrollmentTotpFactorId = "";
            enrollmentTotpSecret = "";
            $("securityMfaEnroll").hidden = true;
            $("securityMfaQr").removeAttribute("src");
            $("securityMfaSecret").textContent = "";
            securityMessage("securityMfaStatus", "Authenticator setup cancelled.", false);
            await window.loadSecuritySettings();
        } catch (error) {
            securityMessage("securityMfaStatus", error?.message || "Could not cancel setup. Refresh security settings and try again.", true);
        } finally {
            if (button) button.disabled = false;
        }
    };

    window.removePendingTotpEnrollment = async function() {
        if (!pendingTotpFactorId) return;
        try {
            const result = await window.supabaseClient.auth.mfa.unenroll({ factorId: pendingTotpFactorId });
            if (result?.error) throw result.error;
            pendingTotpFactorId = "";
            securityMessage("securityMfaStatus", "Unfinished authenticator setup removed.", false);
            await window.loadSecuritySettings();
        } catch (error) {
            securityMessage("securityMfaStatus", error?.message || "Could not remove the unfinished setup.", true);
        }
    };

    window.disableTotpFactor = async function() {
        if (!activeTotpFactorId) {
            securityMessage("securityMfaStatus", "No verified authenticator factor was found.", true);
            return;
        }
        const code = ($("securityMfaDisableCode")?.value || "").replace(/\s/g, "");
        if (!/^\d{6}$/.test(code)) {
            securityMessage("securityMfaStatus", "Enter a valid 6-digit authenticator code to confirm disabling 2FA.", true);
            $("securityMfaDisableCode")?.focus();
            return;
        }
        if (!window.confirm("Disable authenticator two-factor authentication for this account? This reduces sign-in security.")) return;
        const button = $("securityMfaDisableButton");
        button.disabled = true;
        try {
            const auth = window.supabaseClient.auth;
            const challenge = await auth.mfa.challenge({ factorId: activeTotpFactorId });
            if (challenge?.error) throw challenge.error;
            const verification = await auth.mfa.verify({
                factorId: activeTotpFactorId,
                challengeId: challenge.data.id,
                code
            });
            if (verification?.error) throw verification.error;
            const result = await auth.mfa.unenroll({ factorId: activeTotpFactorId });
            if (result?.error) throw result.error;
            activeTotpFactorId = "";
            $("securityMfaDisableCode").value = "";
            securityMessage("securityMfaStatus", "Authenticator two-factor authentication has been disabled.", false);
            await window.loadSecuritySettings();
        } catch (error) {
            securityMessage("securityMfaStatus", error?.message || "Could not disable 2FA. Check your code and try again.", true);
        } finally {
            button.disabled = false;
        }
    };

    window.signOutOtherSessions = async function() {
        if (!window.confirm("Sign out all other Worth It sessions? This browser will remain signed in.")) return;
        const button = $("securitySignOutOthers");
        button.disabled = true;
        securityMessage("securitySessionsStatus", "Signing out other sessions…", false);
        try {
            const result = await window.supabaseClient.auth.signOut({ scope: "others" });
            if (result?.error) throw result.error;
            securityMessage("securitySessionsStatus", "A sign-out request for other sessions completed. Other access tokens can remain valid until they expire.", false);
        } catch (error) {
            securityMessage("securitySessionsStatus", error?.message || "Could not sign out other sessions. Please try again.", true);
        } finally {
            button.disabled = false;
        }
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

    $("accountUsernameInput")?.addEventListener("input", updateAccountSaveButtons);
    $("accountDisplayNameInput")?.addEventListener("input", updateAccountSaveButtons);
    $("calculatorSearch")?.addEventListener("input", applyFilters);
    $("categoryFilter")?.addEventListener("change", applyFilters);
    $("clearCalculatorFilters")?.addEventListener("click", ()=>{
        if($("calculatorSearch")) $("calculatorSearch").value = "";
        if($("categoryFilter")) $("categoryFilter").value = "all";
        applyFilters();
    });

    $("feedbackOverlay")?.addEventListener("click", e=>{
        if(e.target === e.currentTarget) closeFeedback();
    });
    document.addEventListener("keydown", e=>{
        if(e.key === "Escape"){
            closeFeedback();
        }
    });

    // The browser owns page translation; the website no longer has an internal language system.
    applySettings();
    applyFilters();
})();
