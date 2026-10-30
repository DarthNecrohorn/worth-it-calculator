(function(){
    "use strict";

    const OWNER_EMAIL = "pedjasebez3545@gmail.com";
    const GUEST_STORAGE_KEY = "worthItGuestCalcWalletV1";
    const GUEST_DAILY_MILLI = 500;
    const CALCULATOR_COST_MILLI = 100;
    const PREMIUM_LITE_COST = 75000;

    let walletState = null;
    let economyReady = false;
    let calculationBusy = false;
    let badgeRequestSequence = 0;

    const $ = id => document.getElementById(id);
    const client = () => window.supabaseClient || null;

    function utcDay(){
        return new Date().toISOString().slice(0,10);
    }

    function uuid(){
        if(window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){
            const r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 3 | 8)).toString(16);
        });
    }

    function guestWallet(){
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) || "null"); } catch (_) {}
        const today = utcDay();
        if(!stored || stored.date !== today || !Number.isFinite(Number(stored.balance_milli))){
            stored = {date:today,balance_milli:GUEST_DAILY_MILLI};
            try { localStorage.setItem(GUEST_STORAGE_KEY,JSON.stringify(stored)); } catch (_) {}
        }
        stored.balance_milli = Math.max(0,Math.min(GUEST_DAILY_MILLI,Math.floor(Number(stored.balance_milli))));
        return stored;
    }

    function saveGuestWallet(wallet){
        const next = {date:utcDay(),balance_milli:Math.max(0,Math.min(GUEST_DAILY_MILLI,Math.floor(Number(wallet.balance_milli)||0)))};
        try { localStorage.setItem(GUEST_STORAGE_KEY,JSON.stringify(next)); } catch (_) {}
        return next;
    }

    async function getSession(){
        const sb = client();
        if(!sb || !sb.auth) return null;
        const result = await sb.auth.getSession();
        if(result.error) throw result.error;
        return result.data && result.data.session ? result.data.session : null;
    }

    async function rpc(name,args){
        const sb = client();
        if(!sb || typeof sb.rpc !== "function") throw new Error("Account service is not ready.");
        const result = await sb.rpc(name,args || {});
        if(result.error) throw result.error;
        return Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : result.data;
    }

    function isMissingEconomy(error){
        const message = String(error && (error.message || error.details || error.code) || "");
        return /calc_wallet_|PGRST202|could not find the function|schema cache|does not exist/i.test(message);
    }

    function setHeaderBalance(state){
        const value = $("worthItCalcWalletValue");
        const button = $("worthItCalcWalletButton");
        if(!value || !button) return;
        if(!state){
            value.textContent = "—";
            button.setAttribute("aria-label","CALC balance is unavailable");
            return;
        }
        const label = state.is_owner ? "∞" : Number(state.balance || 0).toFixed(1);
        value.textContent = label;
        button.setAttribute("aria-label",state.is_owner ? "Unlimited owner CALC balance" : label + " CALC available");
    }

    function setShopBalance(state){
        const value = $("webShopBalanceValue");
        const tier = $("webShopBalanceTier");
        if(!value) return;
        value.textContent = state ? (state.is_owner ? "∞" : Number(state.balance || 0).toFixed(1)) : "—";
        if(tier) tier.textContent = state ? (state.is_owner ? "OWNER ACCESS" : state.premium_plan === "premium" ? "PREMIUM" : state.premium_plan === "premium_lite" ? "PREMIUM LITE" : state.is_guest ? "GUEST LITE" : "FREE ACCOUNT") : "BALANCE UNAVAILABLE";
    }

    function showStatus(message,error){
        const status = $("webShopStatus");
        if(status){
            status.textContent = String(message || "");
            status.classList.toggle("is-error",Boolean(error));
        }
        if(typeof window.showToast === "function" && message) window.showToast(String(message));
    }

    async function refreshWallet(){
        try{
            const session = await getSession();
            if(!session){
                const guest = guestWallet();
                walletState = {
                    is_guest:true,is_owner:false,premium_plan:"guest_lite",
                    balance:guest.balance_milli/1000,balance_milli:guest.balance_milli
                };
                setHeaderBalance(walletState);
                setShopBalance(walletState);
                economyReady = true;
                return walletState;
            }
            const state = await rpc("calc_wallet_summary",{});
            if(!state || state.ok !== true) throw new Error("CALC wallet could not be loaded.");
            walletState = {...state,is_guest:false};
            economyReady = true;
            setHeaderBalance(walletState);
            setShopBalance(walletState);
            return walletState;
        }catch(error){
            walletState = null;
            economyReady = false;
            setHeaderBalance(null);
            setShopBalance(null);
            if(!isMissingEconomy(error)) console.warn("CALC wallet refresh failed:",error);
            return null;
        }
    }

    function setCalcShopCategory(category){
        const selected = category === "subscriptions" ? "subscriptions" : "currency";
        document.querySelectorAll("[data-webshop-category]").forEach(button=>{
            const active = button.getAttribute("data-webshop-category") === selected;
            button.classList.toggle("active",active);
            button.setAttribute("aria-selected",active ? "true" : "false");
        });
        $("webShopCurrencyPanel")?.toggleAttribute("hidden",selected !== "currency");
        $("webShopSubscriptionsPanel")?.toggleAttribute("hidden",selected !== "subscriptions");
    }
    window.setCalcShopCategory = setCalcShopCategory;

    function setWebShopTheme(theme){
        const section = $("webShopSection");
        if(!section) return;
        const selected = theme === "light" ? "light" : "dark";
        section.setAttribute("data-ws-theme",selected);
        try { localStorage.setItem("worthItWebShopTheme",selected); } catch (_) {}
        const button = $("webShopThemeToggle");
        if(button){
            button.textContent = selected === "dark" ? "☀️ Light theme" : "🌙 Dark theme";
            button.setAttribute("aria-label","Switch Web Shop to " + (selected === "dark" ? "light" : "dark") + " theme");
        }
    }
    window.toggleWebShopTheme = function(){
        const section = $("webShopSection");
        setWebShopTheme(section?.getAttribute("data-ws-theme") === "dark" ? "light" : "dark");
    };

    function openWebShop(category){
        const section = $("webShopSection");
        if(!section) return;
        document.documentElement.classList.remove("settings-open");
        if(typeof window.hideWaterLevelsSection === "function") window.hideWaterLevelsSection();
        if(typeof window.hideShipTrackingSection === "function") window.hideShipTrackingSection();
        if(typeof window.hideWorthItProfileSection === "function") window.hideWorthItProfileSection();

        [
            "homePage","cryptoSection","waterLevelsSection","marketsSection","moneySection",
            "currenciesApp","settingsPanel","settingsPage","weatherSection","newsSection",
            "shipTrackingSection","profileSection","worthItProfileDescriptionSection",
            "worthItProfileConnectionsPage","accountProfilePanel","securitySettingsPanel",
            "privacySettingsPanel","notificationSettingsPanel","yourDataSettingsPanel",
            "appearanceSettingsPanel","shopSection"
        ].forEach(id=>{
            const node = $(id);
            if(node) node.style.display = "none";
        });
        document.querySelectorAll(".app").forEach(app=>{
            app.classList.remove("active");
            app.style.display = "none";
        });
        section.style.display = "block";
        section.classList.add("active");
        setWebShopTheme((function(){try{return localStorage.getItem("worthItWebShopTheme")||"dark";}catch(_){return "dark";}})());
        setCalcShopCategory(category || "currency");
        document.documentElement.style.overflowY = "auto";
        document.body.style.overflowY = "auto";
        if(typeof window.closeNavMenuUnlessPreserved === "function"){
            const nav = $("navLinks");
            if(nav) window.closeNavMenuUnlessPreserved(nav);
        }
        void refreshWallet();
        window.scrollTo({top:0,behavior:"smooth"});
    }
    window.openWebShop = openWebShop;

    async function buyPremiumLite(){
        const button = $("buyPremiumLiteButton");
        if(button) button.disabled = true;
        try{
            const session = await getSession();
            if(!session){
                if(typeof window.openAuthModal === "function") window.openAuthModal("signup");
                else if(typeof window.showToast === "function") window.showToast("Create a Worth It account to buy Premium Lite.");
                return;
            }
            const result = await rpc("calc_buy_premium_lite",{p_request_id:uuid()});
            if(!result || result.ok !== true){
                const message = result?.code === "INSUFFICIENT_CALC"
                    ? "You need 75 CALC to activate Premium Lite."
                    : result?.code === "ALREADY_PREMIUM"
                        ? "Your full Premium subscription is already active."
                        : "Premium Lite could not be activated. Please try again.";
                showStatus(message,true);
                return;
            }
            await refreshWallet();
            showStatus("Premium Lite is active for 15 days. Thank you for supporting Worth It.",false);
        }catch(error){
            showStatus(isMissingEconomy(error) ? "The CALC wallet database setup is still pending." : "Premium Lite could not be activated. Please try again.",true);
            console.error("Premium Lite purchase failed:",error);
        }finally{
            if(button) button.disabled = false;
        }
    }
    window.buyPremiumLite = buyPremiumLite;

    async function reserveSpend(reason){
        const requestId = uuid();
        const result = await rpc("calc_wallet_reserve",{p_request_id:requestId,p_reason:reason});
        if(!result || result.ok !== true) return {ok:false,result,requestId};
        return {ok:true,result,requestId,owner:result.unlimited_balance === true};
    }

    async function settleSpend(requestId){
        const result = await rpc("calc_wallet_settle",{p_request_id:requestId});
        if(!result || result.ok !== true) throw new Error("CALC transaction could not be confirmed.");
        return result;
    }

    async function refundSpend(requestId){
        try { await rpc("calc_wallet_refund",{p_request_id:requestId}); }
        catch(error){ console.error("CALC refund failed and needs reconciliation:",error); }
    }

    function hasGenericResult(node){
        return Boolean(node && node.classList.contains("active") && String(node.textContent||"").trim());
    }

    function hasCarResult(){
        const wrap = $("carResults");
        const winner = $("carWinner");
        return Boolean(wrap && wrap.style.display !== "none" && String(winner?.textContent||"").trim());
    }

    async function runCalculator(original,kind){
        if(calculationBusy) return;
        calculationBusy = true;
        const generic = kind === "generic" ? $("genericResult") : null;
        const cars = kind === "cars" ? $("carResults") : null;
        if(generic){ generic.innerHTML = ""; generic.classList.remove("active"); }
        if(cars){
            cars.style.display = "none";
            if($("carWinner")) $("carWinner").textContent = "";
        }
        try{
            const session = await getSession();
            if(!session){
                const guest = guestWallet();
                if(guest.balance_milli < CALCULATOR_COST_MILLI){
                    showStatus("Your 0.5 Guest Lite CALC for today has been used. Sign in to receive 1 CALC each day.",true);
                    return;
                }
                original();
                const success = kind === "generic" ? hasGenericResult(generic) : hasCarResult();
                if(!success) return;
                guest.balance_milli -= CALCULATOR_COST_MILLI;
                const saved = saveGuestWallet(guest);
                walletState = {...walletState,balance:saved.balance_milli/1000,balance_milli:saved.balance_milli};
                setHeaderBalance(walletState);
                setShopBalance(walletState);
                return;
            }

            let reservation;
            try{
                reservation = await reserveSpend("calculator");
            }catch(error){
                if(isMissingEconomy(error)){
                    original();
                    showStatus("CALC is being configured. This calculation was not charged.",false);
                    return;
                }
                throw error;
            }
            if(!reservation.ok){
                const code = reservation.result?.code;
                if(code === "INSUFFICIENT_CALC"){
                    await refreshWallet();
                    showStatus("You do not have enough CALC. Open Web Shop to earn or purchase more.",true);
                    openWebShop("currency");
                }else{
                    showStatus("The calculation could not be authorised. Please try again.",true);
                }
                return;
            }
            try{
                original();
                const success = kind === "generic" ? hasGenericResult(generic) : hasCarResult();
                if(!success){
                    await refundSpend(reservation.requestId);
                    await refreshWallet();
                    return;
                }
                await settleSpend(reservation.requestId);
                await refreshWallet();
            }catch(error){
                await refundSpend(reservation.requestId);
                await refreshWallet();
                throw error;
            }
        }catch(error){
            console.error("CALC-protected calculation failed:",error);
            showStatus("The CALC wallet is temporarily unavailable. No currency was charged.",true);
        }finally{
            calculationBusy = false;
        }
    }

    function installCalculatorBilling(){
        if(typeof window.calculateGeneric === "function" && !window.calculateGeneric.__calcWalletWrapped){
            const original = window.calculateGeneric;
            const wrapped = function(){ return runCalculator(original,"generic"); };
            wrapped.__calcWalletWrapped = true;
            window.calculateGeneric = wrapped;
        }
        if(typeof window.calculateCars === "function" && !window.calculateCars.__calcWalletWrapped){
            const original = window.calculateCars;
            const wrapped = function(){ return runCalculator(original,"cars"); };
            wrapped.__calcWalletWrapped = true;
            window.calculateCars = wrapped;
        }
    }

    async function refreshPremiumBadge(worthItId,target){
        const badgeTarget = target || null;
        if(!worthItId || !client()) return null;
        const sequence = ++badgeRequestSequence;
        try{
            const badge = await rpc("calc_profile_badge",{p_worth_it_id:Number(worthItId)});
            if(badgeTarget && sequence === badgeRequestSequence){
                badgeTarget.textContent = badge === "premium" ? "✧ PREMIUM" :
                    badge === "premium_lite" ? "✦ LITE" :
                    badge === "owner" ? "◆ OWNER" : "";
                badgeTarget.hidden = !badge;
                badgeTarget.dataset.badge = badge || "";
            }
            return badge || null;
        }catch(error){
            if(!isMissingEconomy(error)) console.warn("Premium badge lookup failed:",error);
            if(badgeTarget) badgeTarget.hidden = true;
            return null;
        }
    }
    window.getWorthItPremiumBadge = refreshPremiumBadge;

    function init(){
        installCalculatorBilling();
        const section = $("webShopSection");
        if(section){
            section.style.display = "none";
            setWebShopTheme((function(){try{return localStorage.getItem("worthItWebShopTheme")||"dark";}catch(_){return "dark";}})());
            section.querySelectorAll("[data-webshop-category]").forEach(button=>{
                button.addEventListener("click",()=>setCalcShopCategory(button.getAttribute("data-webshop-category")));
            });
        }
        if(client()?.auth){
            client().auth.onAuthStateChange(()=>{ void refreshWallet(); });
        }
        Promise.resolve(window.worthItAuthReady).catch(()=>{}).then(()=>refreshWallet()).catch(()=>{});
        window.addEventListener("focus",()=>{ void refreshWallet(); });
        window.addEventListener("pageshow",()=>{ void refreshWallet(); });
        document.addEventListener("visibilitychange",()=>{ if(!document.hidden) void refreshWallet(); });
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
    else init();
})();