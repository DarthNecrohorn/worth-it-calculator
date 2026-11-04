(function(){
    "use strict";

    const CALCULATOR_COST_MILLI = 100;

    let walletState = null;
    let calculationBusy = false;
    let calculatorLabelRevision = 0;
    let calculatorLabelObserver = null;
    let activeCalculatorBillingType = "";
    let signedInAccount = false;
    let authResolved = Boolean(window.worthItAuthStateResolved);
    let walletHistory = [];
    let historyFilter = "all";

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
        if(!result || typeof result !== "object") throw new Error("Guest CALC Lite service returned an invalid response.");
        if(!response.ok && result.code !== "INSUFFICIENT_CALC"){
            throw new Error(result.error || "Guest CALC Lite service is unavailable.");
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
        const unit = $("worthItCalcWalletUnit");
        const wipButton = $("worthItWipWalletButton");
        const wipValue = $("worthItWipWalletValue");
        const shopButton = $("worthItWebShopButton");
        const guestView = state ? state.is_guest === true : !signedInAccount;

        // Guests have a separate CALC Lite allowance, but no Web Shop access.
        // Hide the shop entry entirely instead of showing a CALC shop beside
        // the guest balance; the balance control can offer account creation.
        if(shopButton){
            shopButton.hidden = guestView;
            shopButton.style.display = guestView ? "none" : "";
            shopButton.setAttribute("aria-hidden",String(guestView));
        }
        if(button){
            // Keep CALC Lite visible for guests even while the balance is loading
            // or the guest-wallet endpoint is temporarily unavailable. Hide only
            // while a confirmed signed-in account's own wallet is unresolved.
            button.hidden = !state && (!authResolved || signedInAccount);
            button.onclick = guestView
                ? () => window.WorthItGuestLite?.showAccountPrompt?.()
                : () => {
                    const balance = state?.is_owner ? "Your owner CALC access is unlimited." :
                        "You currently have " + Number(state?.balance || 0).toFixed(1) + " CALC. CALC is used for supported calculators and successful AI replies.";
                    if(typeof window.showToast === "function") window.showToast(balance + " Open Web Shop using the separate Web Shop button.");
                };
        }

        if(wipButton){
            const showWip = state ? !state.is_guest : signedInAccount;
            wipButton.hidden = !showWip;
            wipButton.setAttribute("aria-hidden",String(!showWip));
            if(showWip){
                const wip = state ? (state.is_owner ? "∞" : Number(state.wip_balance || 0).toFixed(1)) : "—";
                if(wipValue) wipValue.textContent = wip;
                wipButton.title = !state
                    ? "WIP rewards and balances are waiting for the CALC economy SQL migration in a staging database. No balance is being simulated."
                    : state.is_owner
                        ? "Owner access is unlimited; Premium Lite is not required."
                        : "WIP is earned daily and used only to activate Premium Lite: 40 WIP for 15 days.";
                wipButton.onclick = () => {
                    const balance = state?.is_owner ? "Owner access is unlimited; Premium Lite is not required." :
                        "You currently have " + Number(state?.wip_balance || 0).toFixed(1) + " WIP. Earn 1 WIP daily; 40 WIP activates Premium Lite for 15 days.";
                    if(typeof window.showToast === "function") window.showToast(balance + " Open Web Shop using the separate Web Shop button.");
                };
                wipButton.setAttribute("aria-label",!state
                    ? "WIP balance unavailable until the economy database migration is installed."
                    : state.is_owner
                        ? "Unlimited owner WIP display. Premium Lite is not required."
                        : wip + " WIP available. WIP is used only for Premium Lite, 40 WIP for 15 days.");
            }
        }

        if(!value || !button) return;
        if(!state){
            value.textContent = "—";
            if(unit) unit.textContent = signedInAccount ? "CALC" : "CALC Lite";
            button.setAttribute("aria-label",signedInAccount ? "CALC balance is unavailable" : "CALC Lite balance is temporarily unavailable");
            button.title = signedInAccount
                ? "Your account CALC balance is not available in this Preview until the CALC economy SQL migration is installed in a staging database."
                : "Your Guest Lite CALC Lite balance is temporarily unavailable. The Web Shop is available only to signed-in accounts.";
            return;
        }

        const label = state.is_owner ? "∞" : Number(state.balance || 0).toFixed(1);
        const currency = state.is_guest ? "CALC Lite" : "CALC";
        value.textContent = label;
        if(unit) unit.textContent = currency;
        button.setAttribute("aria-label",state.is_owner
            ? "Unlimited owner CALC balance"
            : label + " " + currency + " available");
        button.title = state.is_guest
            ? "Guest Lite has a separate 0.5 CALC Lite daily allowance. Each supported calculation costs 0.1 CALC Lite. Sign in to access account CALC and WIP balances."
            : "CALC pays for supported calculator and successful AI use. Each paid calculation or successful AI reply costs 0.1 CALC. CALC cannot be used to buy Premium Lite.";
        void updateCalculatorBillingLabels();
    }

    function setShopBalance(state){
        const value = $("webShopBalanceValue");
        const tier = $("webShopBalanceTier");
        if(!value) return;
        value.textContent = state ? (state.is_owner ? "∞" : Number(state.balance || 0).toFixed(1)) : "—";
        const wipValue = $("webShopWipBalanceValue");
        if(wipValue) {
            const wipLabel = state ? (state.is_owner ? "∞" : Number(state.wip_balance || 0).toFixed(1)) : "—";
            wipValue.textContent = wipLabel;
        }
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

    function setHistoryStatus(message,error){
        const status = $("webShopHistoryStatus");
        if(status){
            status.textContent = String(message || "");
            status.classList.toggle("is-error",Boolean(error));
        }
    }

    function formatHistoryAmount(value){
        const number = Number(value || 0);
        const absolute = Math.abs(number).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:3});
        return (number > 0 ? "+" : number < 0 ? "−" : "") + absolute;
    }

    function transactionKindLabel(kind){
        const labels = {
            daily_reward:"Daily reward",
            calculator_spend:"Calculator use",
            ai_chat_spend:"AI reply",
            premium_lite_purchase:"Premium Lite activation",
            refund:"Refund",
            manual_adjustment:"Balance adjustment",
            calc_pack_purchase:"CALC pack"
        };
        return labels[String(kind || "")] || String(kind || "Wallet transaction").replace(/_/g," ");
    }

    function renderTransactionHistory(){
        const host = $("webShopHistoryRows");
        if(!host) return;
        host.replaceChildren();
        const selected = historyFilter === "all" ? walletHistory : walletHistory.filter(row=>String(row.currency || "CALC").toUpperCase() === historyFilter);
        if(!selected.length){
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5;
            cell.className = "web-shop-history-empty";
            cell.textContent = historyFilter === "all" ? "No transactions yet." : "No " + historyFilter + " transactions yet.";
            row.appendChild(cell);
            host.appendChild(row);
            return;
        }
        selected.forEach(item=>{
            const row = document.createElement("tr");
            const date = document.createElement("td");
            const when = item.created_at ? new Date(item.created_at) : null;
            date.textContent = when && !Number.isNaN(when.getTime()) ? when.toLocaleString() : "—";
            const description = document.createElement("td");
            const title = document.createElement("strong");
            title.textContent = transactionKindLabel(item.kind);
            const note = document.createElement("small");
            note.textContent = String(item.description || "");
            description.append(title,note);
            const amount = document.createElement("td");
            amount.className = Number(item.amount || 0) < 0 ? "is-negative" : "is-positive";
            amount.textContent = formatHistoryAmount(item.amount) + " " + String(item.currency || "CALC");
            const balance = document.createElement("td");
            balance.textContent = Number(item.balance_after || 0).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:3}) + " " + String(item.currency || "CALC");
            const status = document.createElement("td");
            status.textContent = ({completed:"Completed",reserved:"Pending",refunded:"Refunded",failed:"Failed"}[String(item.status || "")] || String(item.status || "—"));
            row.append(date,description,amount,balance,status);
            host.appendChild(row);
        });
    }

    async function loadTransactionHistory(){
        const section = $("webShopHistory");
        if(!section) return;
        try{
            const session = await getSession();
            if(!session){
                section.hidden = true;
                walletHistory = [];
                return;
            }
            section.hidden = false;
            setHistoryStatus("Loading your latest transactions…",false);
            const result = await client().rpc("calc_wallet_history",{p_limit:50});
            if(result.error) throw result.error;
            walletHistory = Array.isArray(result.data) ? result.data : [];
            renderTransactionHistory();
            setHistoryStatus(walletHistory.length ? "Showing your latest " + walletHistory.length + " transactions." : "No transactions have been recorded for this account yet.",false);
        }catch(error){
            walletHistory = [];
            renderTransactionHistory();
            setHistoryStatus(/calc_wallet_history|PGRST202|schema cache|could not find the function/i.test(String(error?.message || error))
                ? "Transaction history is not installed in this Preview database yet."
                : "Your transaction history could not be loaded. Please try again.",true);
            console.warn("Worth It transaction history could not be loaded:",error);
        }
    }
    window.refreshWorthItTransactionHistory = loadTransactionHistory;

    async function refreshWallet(){
        let session = null;
        try{
            session = await getSession();
            authResolved = true;
            signedInAccount = Boolean(session);
            if(!session){
                const guest = await guestRpc("balance");
                if(guest.ok !== true) throw new Error(guest.error || "Guest CALC Lite wallet could not be loaded.");
                walletState = {
                    ...guest,is_guest:true,is_owner:false,premium_plan:"guest_lite",
                    currency:guest.currency || "CALC_LITE",
                    balance:Number(guest.balance)||0,
                    balance_milli:Number(guest.balance_milli)||0,
                    wip_balance:0,
                    wip_balance_milli:0
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

    window.refreshWorthItCalcWallet = refreshWallet;

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
        void refreshWallet().then(()=>loadTransactionHistory());
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
                const message = result?.code === "INSUFFICIENT_WIP"
                    ? "You need 40 WIP to activate Premium Lite."
                    : result?.code === "ALREADY_PREMIUM"
                        ? "Your full Premium subscription is already active."
                        : "Premium Lite could not be activated. Please try again.";
                showStatus(message,true);
                return;
            }
            await refreshWallet();
            await loadTransactionHistory();
            showStatus("Premium Lite is active for 15 days. 40 WIP was used; your CALC balance was not changed.",false);
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
                        showStatus("Your 0.5 CALC Lite daily allowance has been used. It resets to 0.5 on your next daily visit.",true);
                    }else{
                        showStatus("Your CALC Lite allowance could not be authorised. Please try again.",true);
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
                    if(!settled.ok) throw new Error("Guest CALC Lite calculation could not be confirmed.");
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
                    showStatus("CALC account billing is not available in this Preview database yet. No calculation was run and no currency was charged.",true);
                    return;
                }
                throw error;
            }
            if(!reservation.ok){
                const code = reservation.result?.code;
                if(code === "INSUFFICIENT_CALC"){
                    await refreshWallet();
                    showStatus("You do not have enough CALC. Open Web Shop to review your balance and available options.",true);
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

    async function updateCalculatorBillingLabels(){
        const revision = ++calculatorLabelRevision;
        const calculatorType = String(activeCalculatorBillingType || window.WorthItGuestLite?.getActiveCalculator?.() || "").toLowerCase();
        if(!window.WorthItGuestLite?.isBillableCalculator?.(calculatorType)) return;

        let session = null;
        try{ session = await getSession(); }catch(_){}
        if(revision !== calculatorLabelRevision) return;

        const state = walletState;
        const isGuest = state ? state.is_guest === true : !session;
        const isOwner = state?.is_owner === true;
        const currency = isGuest ? "CALC Lite" : "CALC";
        const unavailableLabel = "Wallet unavailable · calculation disabled";
        const genericLabel = !state ? unavailableLabel : isOwner ? "Calculate · Free (Owner)" : "Pay 0.1 " + currency + " to calculate";
        const carsLabel = !state ? unavailableLabel : isOwner ? "Compare · Free (Owner)" : "Pay 0.1 " + currency + " to compare";
        const root = calculatorType === "cars" ? $("carsApp") : $("genericApp");
        if(!root) return;

        const selector = calculatorType === "cars"
            ? 'button[onclick*="calculateCars"]'
            : 'button[onclick*="calculateGeneric"]';
        root.querySelectorAll(selector).forEach(button=>{
            button.classList.add("calc-billing-action");
            const nextLabel = calculatorType === "cars" ? carsLabel : genericLabel;
            if(button.textContent.trim() !== nextLabel) button.textContent = nextLabel;
            button.disabled = !state;
            button.setAttribute("aria-label",nextLabel);
            button.title = !state
                ? "This calculator is temporarily disabled because its server-side currency wallet is unavailable. No calculation can run without an authorised wallet."
                : isOwner
                    ? "Owner calculations are unlimited and do not deduct CALC."
                    : "This successful calculation costs 0.1 " + currency + ". Failed calculations are refunded.";
        });
    }

    function scheduleCalculatorBillingLabels(){
        void updateCalculatorBillingLabels();
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

        const genericApp = $("genericApp");
        const carsApp = $("carsApp");
        if(typeof MutationObserver === "function"){
            if(genericApp){
                calculatorLabelObserver = new MutationObserver(scheduleCalculatorBillingLabels);
                calculatorLabelObserver.observe(genericApp,{subtree:true,childList:true});
            }
            if(carsApp){
                const carsObserver = new MutationObserver(scheduleCalculatorBillingLabels);
                carsObserver.observe(carsApp,{subtree:true,childList:true});
            }
        }

        if(typeof window.openCalculator === "function" && !window.openCalculator.__calcBillingLabelUpdate){
            const originalOpenCalculator = window.openCalculator;
            const wrappedOpenCalculator = function(type,...args){
                activeCalculatorBillingType = String(type == null ? "" : type).toLowerCase();
                const result = originalOpenCalculator.apply(this,[type,...args]);
                window.setTimeout(scheduleCalculatorBillingLabels,0);
                return result;
            };
            wrappedOpenCalculator.__calcBillingLabelUpdate = true;
            wrappedOpenCalculator.__calcBillingLabelOriginal = originalOpenCalculator;
            window.openCalculator = wrappedOpenCalculator;
        }
        scheduleCalculatorBillingLabels();
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
                    badge === "premium_lite" ? "✦ PREMIUM LITE" :
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
            $("webShopHistoryCurrency")?.addEventListener("change",event=>{
                historyFilter = ["CALC","WIP"].includes(event.target.value) ? event.target.value : "all";
                renderTransactionHistory();
            });
            $("webShopHistoryRefresh")?.addEventListener("click",()=>void loadTransactionHistory());
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