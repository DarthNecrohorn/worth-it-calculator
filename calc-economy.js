(function(){
    "use strict";

    const CALCULATOR_COST_MILLI = 100;

    let walletState = null;
    let calculationBusy = false;

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

    async function guestRpc(action,requestId,calculatorType){
        const isRead = action === "balance";
        const response = await fetch("/api/guest-calc",{
            method:isRead ? "GET" : "POST",
            credentials:"same-origin",
            cache:"no-store",
            headers:isRead ? {"Accept":"application/json"} : {
                "Content-Type":"application/json",
                "Accept":"application/json"
            },
            body:isRead ? undefined : JSON.stringify({action,request_id:requestId,...(action === "reserve" ? {calculator_type:calculatorType} : {})})
        });
        const result = await response.json().catch(()=>null);
        if(!result || typeof result !== "object") throw new Error("Guest CALC service returned an invalid response.");
        if(!response.ok && result.code !== "INSUFFICIENT_CALC"){
            throw new Error(result.error || "Guest CALC service is unavailable.");
        }
        return result;
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
        const isPremium = Boolean(state && (state.is_owner || state.premium_plan === "premium" || state.premium_plan === "premium_lite"));
        if(document.documentElement){
            document.documentElement.dataset.worthItPremium = isPremium ? "true" : "false";
            document.documentElement.dataset.worthItSubscription = state?.premium_plan || "free";
        }
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
                const guest = await guestRpc("balance");
                if(guest.ok !== true) throw new Error(guest.error || "Guest CALC wallet could not be loaded.");
                walletState = {
                    ...guest,is_guest:true,is_owner:false,premium_plan:"guest_lite",
                    balance:Number(guest.balance)||0,
                    balance_milli:Number(guest.balance_milli)||0
                };
                setHeaderBalance(walletState);
                setShopBalance(walletState);
                return walletState;
            }
            const state = await rpc("calc_wallet_summary",{});
            if(!state || state.ok !== true) throw new Error("CALC wallet could not be loaded.");
            walletState = {...state,is_guest:false};
            setHeaderBalance(walletState);
            setShopBalance(walletState);
            return walletState;
        }catch(error){
            walletState = null;
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
            "shipTrackingSection","profileSection","discountsSection","worthItProfileDescriptionSection",
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
                const calculatorType = window.WorthItGuestLite?.getActiveCalculator?.() || (kind === "cars" ? "cars" : "");
                if(!window.WorthItGuestLite?.isBillableCalculator?.(calculatorType)){
                    showStatus("Guest Lite can use only the first 50 built-in Worth It calculators. Create an account to use community calculators.",true);
                    if(typeof window.WorthItGuestLite?.showAccountPrompt === "function") window.WorthItGuestLite.showAccountPrompt();
                    return;
                }
                const requestId = uuid();
                const reservation = await guestRpc("reserve",requestId,calculatorType);
                if(!reservation.ok){
                    if(reservation.code === "INSUFFICIENT_CALC"){
                        await refreshWallet();
                        showStatus("Your 0.5 Guest Lite CALC has been used. Your balance resets to 0.5 when you visit again on the next day.",true);
                    }else{
                        showStatus("The guest CALC allowance could not be authorised. Please try again.",true);
                    }
                    return;
                }
                try{
                    original();
                    const success = kind === "generic" ? hasGenericResult(generic) : hasCarResult();
                    if(!success){
                        await guestRpc("refund",requestId);
                        await refreshWallet();
                        return;
                    }
                    const settled = await guestRpc("settle",requestId);
                    if(!settled.ok) throw new Error("Guest CALC calculation could not be confirmed.");
                    await refreshWallet();
                }catch(guestError){
                    try{ await guestRpc("refund",requestId); }catch(refundError){console.error("Guest CALC refund failed:",refundError);}
                    await refreshWallet();
                    throw guestError;
                }
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
        const userId = String(worthItId);
        if(badgeTarget){
            badgeTarget.dataset.worthItId = userId;
            badgeTarget.hidden = true;
        }
        try{
            const badge = await rpc("calc_profile_badge",{p_worth_it_id:Number(worthItId)});
            if(badgeTarget && badgeTarget.dataset.worthItId === userId){
                badgeTarget.textContent = badge === "premium" ? "✧ PREMIUM" :
                    badge === "premium_lite" ? "✦ LITE" :
                    badge === "owner" ? "◆ OWNER" : "";
                badgeTarget.hidden = !badge;
                badgeTarget.dataset.badge = badge || "";
            }
            return badge || null;
        }catch(error){
            if(!isMissingEconomy(error)) console.warn("Premium badge lookup failed:",error);
            if(badgeTarget && badgeTarget.dataset.worthItId === userId) badgeTarget.hidden = true;
            return null;
        }
    }
    window.getWorthItPremiumBadge = refreshPremiumBadge;
    async function getChatMediaLimits(){
        try{
            const limits = await rpc("calc_chat_media_limits",{});
            if(!limits || limits.tier === undefined) throw new Error("Invalid chat media limits.");
            return limits;
        }catch(error){
            if(isMissingEconomy(error)){
                return {tier:"free",image_bytes:5242880,gif_bytes:8388608,video_bytes:15728640};
            }
            throw error;
        }
    }
    window.getWorthItChatMediaLimits = getChatMediaLimits;


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