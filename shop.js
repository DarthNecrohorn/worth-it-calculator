/* =====================================================
    SHOP — WORTH IT AFFILIATE ENGINE
===================================================== */

(function(){

    "use strict";

    const shopItems = [];

    /* =================================================
        HELPERS
    ================================================ */

    function calculateDiscount(oldPrice, price){

        if(
            !Number.isFinite(oldPrice) ||
            !Number.isFinite(price) ||
            oldPrice <= 0
        ){
            return 0;
        }

        return Math.round(
            ((oldPrice - price) / oldPrice) * 100
        );
    }


    function calculateSavings(oldPrice, price){

        if(
            !Number.isFinite(oldPrice) ||
            !Number.isFinite(price)
        ){
            return 0;
        }

        return Math.max(
            0,
            oldPrice - price
        );
    }


    function formatPrice(value, currency){

        const currencyMap = {
            USD: "$",
            EUR: "€",
            GBP: "£",
            CAD: "C$",
            AUD: "A$",
            NZD: "NZ$",
            SGD: "S$",
            HKD: "HK$",
            JPY: "¥",
            CNY: "¥",
            KRW: "₩",
            PLN: "zł",
            CZK: "Kč",
            HUF: "Ft",
            NOK: "kr",
            SEK: "kr",
            DKK: "kr",
            CHF: "CHF ",
            ZAR: "R",
            BRL: "R$",
            MXN: "MX$"
        };

        const rawCurrency =
            String(currency || "$").trim().toUpperCase();

        const prefix =
            currencyMap[rawCurrency] ||
            (rawCurrency.length === 3
                ? rawCurrency + " "
                : rawCurrency);

        if (Number(value) === 0) {
            return "Free";
        }

        return prefix +
            Number(value).toFixed(2);
    }


    function getStores(deal){

        if(!Array.isArray(deal.stores)){
            return [];
        }

        return deal.stores
            .filter(
                store =>
                    store &&
                    Number.isFinite(store.price)
            )
            .sort(
                (a, b) =>
                    a.price - b.price
            );
    }


    function getBestStore(deal){

        const stores =
            getStores(deal);

        return stores.length
            ? stores[0]
            : null;
    }


    function escapeHTML(value){

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    const shopViewState = {
        category: "all",
        country: "all",
        query: "",
        sort: "featured"
    };

    const MAX_SHOP_PRODUCTS_PER_CATEGORY = 200;

    let automaticShopProducts = [];
    let automaticShopFeedLoaded = false;
    let automaticShopFeedLoading = false;
    let automaticShopFeedPromise = null;

    let shopShippingProfiles = {};
    let shopShippingProfilesLoaded = false;
    let shopShippingProfilesPromise = null;

    async function loadShopShippingProfiles(){

        if(shopShippingProfilesLoaded){
            return true;
        }

        if(shopShippingProfilesPromise){
            return shopShippingProfilesPromise;
        }

        shopShippingProfilesPromise =
            (async function(){

                try{

                    const response =
                        await fetch(
                            "/data/shop-shipping-profiles.json",
                            {
                                method: "GET",
                                cache: "no-store",
                                headers: {
                                    "Accept": "application/json"
                                }
                            }
                        );

                    if(!response.ok){
                        return false;
                    }

                    const data =
                        await response.json();

                    shopShippingProfiles =
                        data &&
                        data.profiles &&
                        typeof data.profiles === "object"
                            ? data.profiles
                            : {};

                    shopShippingProfilesLoaded =
                        true;

                    return true;

                }
                catch(error){

                    console.warn(
                        "Shop shipping profiles unavailable:",
                        error
                    );

                    return false;

                }

            })();

        return shopShippingProfilesPromise;
    }

    function getEffectiveShippingProfile(product, shippingCountries){

        const profile =
            product?.partnerId
                ? shopShippingProfiles[product.partnerId]
                : null;

        const sourceLabel =
            String(
                product?.shippingSourceLabel || ""
            );

        const hasProductLevelData =
            product?.shippingCoverageType === "exact" &&
            sourceLabel === "Awin product shipping data";

        if(
            profile &&
            !hasProductLevelData
        ){
            return {
                coverageType:
                    profile.type ||
                    "exact",
                coverageLabel:
                    profile.coverageLabel ||
                    "",
                countries:
                    Array.isArray(profile.countries)
                        ? profile.countries
                        : shippingCountries,
                sourceLabel:
                    profile.sourceLabel ||
                    sourceLabel ||
                    "Merchant shipping coverage",
                sourceUrl:
                    profile.sourceUrl ||
                    product?.shippingSourceUrl ||
                    "",
                verifiedAt:
                    profile.verifiedAt ||
                    product?.shippingVerifiedAt ||
                    "",
                note:
                    profile.note ||
                    product?.shippingNote ||
                    "Final destination eligibility is confirmed by the merchant at checkout."
            };
        }

        return {
            coverageType:
                product?.shippingCoverageType ||
                (
                    shippingCountries.length
                        ? "exact"
                        : "unknown"
                ),
            coverageLabel:
                product?.shippingCoverageLabel ||
                "",
            countries:
                shippingCountries,
            sourceLabel:
                product?.shippingSourceLabel ||
                "Awin product feed",
            sourceUrl:
                product?.shippingSourceUrl ||
                "",
            verifiedAt:
                product?.shippingVerifiedAt ||
                "",
            note:
                product?.shippingNote ||
                "Shipping availability is determined by the current product or merchant shipping data. Final eligibility can vary at checkout."
        };
    }

    function getPartner(deal){
        if(!deal || !deal.partnerId || !Array.isArray(SHOP_PARTNERS)){
            return null;
        }

        return SHOP_PARTNERS.find(
            partner => partner.id === deal.partnerId
        ) || null;
    }

    function getPartnerShippingCoverage(partnerId, items){
        const countries = new Set();
        const regionalLabels = new Set();
        const digitalLabels = new Set();
        const coverageLabels = new Set();

        items
            .filter(
                deal =>
                    deal?.partnerId === partnerId
            )
            .forEach(
                deal => {
                    normalizeCountries(deal)
                        .forEach(
                            code =>
                                countries.add(code)
                        );

                    const availability =
                        deal?.availability;

                    const coverageLabel =
                        String(
                            availability?.coverageLabel || ""
                        ).trim();

                    if(
                        availability?.coverageType === "regional" &&
                        coverageLabel
                    ){
                        regionalLabels.add(coverageLabel);
                    }
                    else if(
                        availability?.coverageType === "digital" &&
                        coverageLabel
                    ){
                        digitalLabels.add(coverageLabel);
                    }
                    else if(coverageLabel){
                        coverageLabels.add(coverageLabel);
                    }
                }
            );

        const profile =
            shopShippingProfiles[partnerId];

        if(
            profile &&
            countries.size === 0 &&
            regionalLabels.size === 0 &&
            digitalLabels.size === 0 &&
            coverageLabels.size === 0
        ){
            (Array.isArray(profile.countries)
                ? profile.countries
                : []
            ).forEach(
                code => {
                    const normalized =
                        String(code || "")
                            .trim()
                            .toUpperCase();

                    if(/^[A-Z]{2}$/.test(normalized)){
                        countries.add(normalized);
                    }
                }
            );

            const profileCoverageLabel =
                String(profile.coverageLabel || "").trim();

            if(profile.type === "regional" && profileCoverageLabel){
                regionalLabels.add(profileCoverageLabel);
            }
            else if(profile.type === "digital" && profileCoverageLabel){
                digitalLabels.add(profileCoverageLabel);
            }
            else if(profileCoverageLabel){
                coverageLabels.add(profileCoverageLabel);
            }
        }

        return {
            countryCount:
                countries.size,
            regionalLabels:
                [...regionalLabels],
            digitalLabels:
                [...digitalLabels],
            coverageLabels:
                [...coverageLabels]
        };
    }


    function getPartnerCoverageText(partner, items){
        const shippingCoverage =
            getPartnerShippingCoverage(partner.id, items);

        if(partner.cardSubtitle){
            return partner.cardSubtitle;
        }

        if(shippingCoverage.digitalLabels.length){
            return shippingCoverage.digitalLabels.join(" / ");
        }

        if(shippingCoverage.regionalLabels.length){
            return shippingCoverage.regionalLabels.join(" / ") +
                (shippingCoverage.countryCount > 0
                    ? " · " + shippingCoverage.countryCount + " listed destinations"
                    : "");
        }

        if(shippingCoverage.coverageLabels.length){
            return shippingCoverage.coverageLabels.join(" / ");
        }

        if(shippingCoverage.countryCount > 0){
            return shippingCoverage.countryCount +
                " currently represented shipping destination" +
                (shippingCoverage.countryCount === 1 ? "" : "s");
        }

        if(partner.status === "not-published"){
            return "No verified shipping destinations — programme not published";
        }

        return partner.coverage || "Shipping details not verified yet";
    }

    function getPartnerDetailsHTML(partner, allItems){
        const productCount =
            allItems.filter(deal => deal?.partnerId === partner.id).length;

        const categoryNames =
            (Array.isArray(partner.categoryIds) ? partner.categoryIds : [])
                .map(id => getCategoryDefinition(id)?.label)
                .filter(Boolean)
                .join(", ") || "Not yet assigned";

        const coverage =
            partner.market ||
            getPartnerCoverageText(partner, allItems);

        const description =
            partner.details ||
            partner.note ||
            "Worth It is reviewing this affiliate source before publishing products.";

        const programmeStatus =
            partner.programStatus ||
            (productCount > 0
                ? "Products connected"
                : partner.status === "not-published"
                    ? "Not currently published"
                    : "Products being curated");

        const shopStatus =
            productCount > 0
                ? productCount + " curated product" +
                    (productCount === 1 ? "" : "s") +
                    " currently available in Worth It Shop."
                : partner.shopStatusDetail ||
                    "No products from this source are currently listed in Worth It Shop.";

        const specialOfferHTML =
            partner.specialOffer
                ? '<section class="shop-partner-special-offer">' +
                    '<div class="shop-partner-special-offer-head">' +
                        '<h4>' + escapeHTML(partner.specialOffer.title || "Special offer") + '</h4>' +
                        '<span>' + escapeHTML(partner.specialOffer.statusLabel || "Offer details pending") + '</span>' +
                    '</div>' +
                    '<p>' + escapeHTML(partner.specialOffer.description || "") + '</p>' +
                  '</section>'
                : "";

        return [
            '<div class="shop-partner-detail-summary">',
                '<p id="shopPartnerModalIntro">' + escapeHTML(description) + '</p>',
            '</div>',
            '<div class="shop-partner-detail-grid">',
                '<div class="shop-partner-detail-item">',
                    '<span class="shop-partner-detail-label">Category</span>',
                    '<strong>' + escapeHTML(categoryNames) + '</strong>',
                '</div>',
                '<div class="shop-partner-detail-item">',
                    '<span class="shop-partner-detail-label">Market / coverage</span>',
                    '<strong>' + escapeHTML(coverage) + '</strong>',
                '</div>',
                '<div class="shop-partner-detail-item">',
                    '<span class="shop-partner-detail-label">Programme status</span>',
                    '<strong>' + escapeHTML(programmeStatus) + '</strong>',
                '</div>',
                '<div class="shop-partner-detail-item">',
                    '<span class="shop-partner-detail-label">Worth It Shop</span>',
                    '<strong>' + escapeHTML(shopStatus) + '</strong>',
                '</div>',
            '</div>',
            specialOfferHTML,
            '<p class="shop-partner-modal-disclosure">Worth It may earn a commission when you buy through an affiliate link. Product availability, prices, shipping eligibility and offer terms can change. Confirm the final details with the retailer before purchasing.</p>'
        ].join("");
    }

    function setupShopPartnerDetails(container, allItems){
        const overlay =
            container.querySelector("#shopPartnerModal");

        const dialog =
            overlay?.querySelector(".shop-partner-modal");

        const body =
            overlay?.querySelector("#shopPartnerModalBody");

        const title =
            overlay?.querySelector("#shopPartnerModalTitle");

        const icon =
            overlay?.querySelector("#shopPartnerModalIcon");

        const closeButton =
            overlay?.querySelector("[data-shop-partner-close='true']");

        if(!overlay || !dialog || !body || !title || !closeButton){
            return;
        }

        let lastTrigger = null;

        function closeModal(){
            overlay.hidden = true;
            overlay.classList.remove("open");
            overlay.setAttribute("aria-hidden", "true");
            document.body.classList.remove("shop-partner-modal-open");

            if(lastTrigger && lastTrigger.isConnected){
                lastTrigger.focus();
            }

            lastTrigger = null;
        }

        function openModal(partnerId, trigger){
            const partner =
                SHOP_PARTNERS.find(item => item.id === partnerId);

            if(!partner){
                return;
            }

            lastTrigger = trigger;
            title.textContent = partner.name;
            if(icon){
                icon.textContent = partner.icon || "🏷️";
            }

            body.innerHTML =
                getPartnerDetailsHTML(partner, allItems);

            overlay.hidden = false;
            overlay.classList.add("open");
            overlay.setAttribute("aria-hidden", "false");
            document.body.classList.add("shop-partner-modal-open");
            closeButton.focus();
        }

        container
            .querySelectorAll("[data-shop-partner-id]")
            .forEach(button => {
                button.addEventListener("click", function(){
                    openModal(button.dataset.shopPartnerId, button);
                });
            });

        closeButton.addEventListener("click", closeModal);

        overlay.addEventListener("click", function(event){
            if(event.target === overlay){
                closeModal();
            }
        });

        dialog.addEventListener("keydown", function(event){
            if(event.key === "Escape"){
                event.preventDefault();
                closeModal();
                return;
            }

            if(event.key === "Tab"){
                const focusable =
                    Array.from(
                        dialog.querySelectorAll(
                            "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
                        )
                    );

                if(!focusable.length){
                    return;
                }

                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if(event.shiftKey && document.activeElement === first){
                    event.preventDefault();
                    last.focus();
                }
                else if(!event.shiftKey && document.activeElement === last){
                    event.preventDefault();
                    first.focus();
                }
            }
        });
    }

    function getCategoryDefinition(categoryId){
        if(!categoryId || !Array.isArray(SHOP_CATEGORIES)){
            return null;
        }

        return SHOP_CATEGORIES.find(
            category => category.id === categoryId
        ) || null;
    }

    function getCountryDefinition(countryCode){
        if(!countryCode || !Array.isArray(SHOP_COUNTRIES)){
            return null;
        }

        const code =
            String(countryCode)
                .trim()
                .toUpperCase();

        if(!/^[A-Z]{2}$/.test(code)){
            return null;
        }

        const known =
            SHOP_COUNTRIES.find(
                country => country.code === code
            );

        if(known){
            return known;
        }

        let name = code;

        try{
            if(
                typeof Intl !== "undefined" &&
                typeof Intl.DisplayNames === "function"
            ){
                const displayNames =
                    new Intl.DisplayNames(
                        ["en"],
                        {
                            type: "region"
                        }
                    );

                name =
                    displayNames.of(code) ||
                    code;
            }
        }
        catch{
            name = code;
        }

        return {
            code,
            name
        };
    }

    function getCountryFlag(countryCode){
        if(!/^[A-Z]{2}$/.test(String(countryCode || ""))){
            return "🌍";
        }

        return String(countryCode)
            .split("")
            .map(
                letter =>
                    String.fromCodePoint(
                        127397 + letter.charCodeAt(0)
                    )
            )
            .join("");
    }

    function normalizeCountries(deal){
        const countries =
            Array.isArray(
                deal?.availability?.countries
            )
                ? deal.availability.countries
                : [];

        return [
            ...new Set(
                countries
                    .map(
                        code =>
                            String(code)
                                .trim()
                                .toUpperCase()
                    )
                    .filter(
                        code =>
                            /^[A-Z]{2}$/.test(code)
                    )
            )
        ];
    }

    function getCountryOptions(items){
        const codes = new Set();

        items.forEach(deal => {
            normalizeCountries(deal).forEach(code => codes.add(code));
        });

        return [...codes]
            .map(code => getCountryDefinition(code))
            .filter(Boolean)
            .sort(
                (a, b) =>
                    a.name.localeCompare(
                        b.name,
                        undefined,
                        { sensitivity: "base" }
                    )
            );
    }

    function getUniqueProductCountries(items){
        const codes = new Set();

        items.forEach(deal => {
            normalizeCountries(deal).forEach(code => codes.add(code));
        });

        return codes.size;
    }

    function getCategoryProductCount(items, categoryId){
        return items.filter(
            deal => deal.category === categoryId
        ).length;
    }

    function sortShopItems(items){
        const sorted = [...items];

        if(shopViewState.sort === "price"){
            return sorted.sort(
                (a, b) =>
                    (getBestStore(a)?.price ?? Number.POSITIVE_INFINITY) -
                    (getBestStore(b)?.price ?? Number.POSITIVE_INFINITY)
            );
        }

        if(shopViewState.sort === "discount"){
            return sorted.sort(
                (a, b) => {
                    const aStore = getBestStore(a);
                    const bStore = getBestStore(b);

                    return (
                        calculateDiscount(
                            b.oldPrice,
                            bStore ? bStore.price : 0
                        ) -
                        calculateDiscount(
                            a.oldPrice,
                            aStore ? aStore.price : 0
                        )
                    );
                }
            );
        }

        if(shopViewState.sort === "az"){
            return sorted.sort(
                (a, b) =>
                    String(a.title || "").localeCompare(
                        String(b.title || ""),
                        undefined,
                        { sensitivity: "base" }
                    )
            );
        }

        return sorted.sort(
            (a, b) => {
                const aStore = getBestStore(a);
                const bStore = getBestStore(b);

                const discountDiff =
                    calculateDiscount(
                        b.oldPrice,
                        bStore ? bStore.price : 0
                    ) -
                    calculateDiscount(
                        a.oldPrice,
                        aStore ? aStore.price : 0
                    );

                return (
                    discountDiff ||
                    String(a.title || "").localeCompare(
                        String(b.title || ""),
                        undefined,
                        { sensitivity: "base" }
                    )
                );
            }
        );
    }

    function getFilteredShopItems(allItems){
        const query =
            String(shopViewState.query || "")
                .trim()
                .toLowerCase();

        const filtered = allItems.filter(
            deal => {
                if(
                    shopViewState.category !== "all" &&
                    deal.category !== shopViewState.category
                ){
                    return false;
                }

                if(
                    shopViewState.country !== "all" &&
                    !normalizeCountries(deal).includes(
                        shopViewState.country
                    )
                ){
                    return false;
                }

                if(!query){
                    return true;
                }

                const searchable = [
                    deal.title,
                    deal.store,
                    deal.categoryLabel,
                    getPartner(deal)?.name
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return searchable.includes(query);
            }
        );

        const sorted =
            sortShopItems(filtered);

        const limited = [];

        const categoryCounts =
            new Map();

        for(const deal of sorted){
            const category =
                deal.category || "other";

            const count =
                categoryCounts.get(category) || 0;

            if(
                count >=
                MAX_SHOP_PRODUCTS_PER_CATEGORY
            ){
                continue;
            }

            categoryCounts.set(
                category,
                count + 1
            );

            limited.push(deal);
        }

        return limited;
    }

    function getAvailabilityHTML(deal){

        const availability =
            deal?.availability;

        const countryCodes =
            normalizeCountries(deal);

        if(!availability){
            return `
                <div class="shop-availability">
                    <div class="shop-availability-head">
                        <div>
                            <span class="shop-info-label">🌍 Ships to</span>
                            <strong>No Information</strong>
                        </div>
                    </div>
                </div>
            `;
        }

        if(availability.type === "service"){
            const serviceArea =
                Array.isArray(availability.states) &&
                availability.states.length
                    ? `${availability.states.length} supported areas`
                    : "Supported service area";

            return `
                <div class="shop-availability shop-availability-service">
                    <div class="shop-availability-head">
                        <div>
                            <span class="shop-info-label">📍 Availability</span>
                            <strong>${escapeHTML(serviceArea)}</strong>
                        </div>
                        <span class="shop-availability-verified">✓ Verified</span>
                    </div>
                    <p class="shop-availability-note">
                        ${escapeHTML(availability.note || "Service availability is determined by the merchant.")}
                    </p>
                </div>
            `;
        }

        const coverageType =
            availability.coverageType ||
            "exact";

        const sourceLabel =
            availability.sourceLabel
                ? escapeHTML(availability.sourceLabel)
                : availability.verifiedDate
                    ? `✓ Verified ${escapeHTML(availability.verifiedDate)}`
                    : "From merchant feed";

        if(
            coverageType === "digital"
        ){
            return `
                <div class="shop-availability shop-availability-service">
                    <div class="shop-availability-head">
                        <div>
                            <span class="shop-info-label">🌐 Access</span>
                            <strong>${escapeHTML(
                                availability.coverageLabel ||
                                "Worldwide digital access"
                            )}</strong>
                        </div>
                        <span class="shop-availability-verified">${sourceLabel}</span>
                    </div>

                    <p class="shop-availability-note">
                        ${escapeHTML(
                            availability.note ||
                            "This programme provides digital access rather than physical shipping."
                        )}
                    </p>
                </div>
            `;
        }

        if(
            coverageType === "regional" &&
            !countryCodes.length
        ){
            return `
                <div class="shop-availability">
                    <div class="shop-availability-head">
                        <div>
                            <span class="shop-info-label">🌍 Ships to</span>
                            <strong>${escapeHTML(
                                availability.coverageLabel ||
                                "Regional shipping coverage"
                            )}</strong>
                        </div>
                        <span class="shop-availability-verified">${sourceLabel}</span>
                    </div>

                    <p class="shop-availability-note">
                        ${escapeHTML(
                            availability.note ||
                            "The merchant publishes regional shipping coverage rather than a complete country list. Final destination eligibility is confirmed at checkout."
                        )}
                    </p>
                </div>
            `;
        }

        if(!countryCodes.length){
            return `
                <div class="shop-availability">
                    <div class="shop-availability-head">
                        <div>
                            <span class="shop-info-label">🌍 Ships to</span>
                            <strong>No Information</strong>
                        </div>
                    </div>
                </div>
            `;
        }

        const countryChips =
            countryCodes
                .map(
                    code => `
                        <span
                            class="shop-country-chip"
                            title="${escapeHTML(getCountryDefinition(code)?.name || code)}"
                        >
                            ${getCountryFlag(code)}
                            <span>${escapeHTML(getCountryDefinition(code)?.name || code)}</span>
                        </span>
                    `
                )
                .join("");

        const countryDetails =
            countryCodes.length > 8
                ? `
                    <details class="shop-country-details">
                        <summary>${
                            coverageType === "regional"
                                ? `See listed destinations (${countryCodes.length})`
                                : `See all ${countryCodes.length} destinations`
                        }</summary>
                        <div class="shop-country-list">
                            ${countryCodes
                                .map(
                                    code => `
                                        <span class="shop-country-chip shop-country-chip-full">
                                            ${getCountryFlag(code)}
                                            <span>${escapeHTML(getCountryDefinition(code)?.name || code)}</span>
                                        </span>
                                    `
                                )
                                .join("")}
                        </div>
                    </details>
                `
                : "";

        if(coverageType === "regional"){
            const coverageLabel =
                availability.coverageLabel ||
                "Regional shipping coverage";

            return `
                <div class="shop-availability">
                    <div class="shop-availability-head">
                        <div>
                            <span class="shop-info-label">🌍 Ships to</span>
                            <strong>${escapeHTML(coverageLabel)}</strong>
                        </div>
                        <span class="shop-availability-verified">${sourceLabel}</span>
                    </div>

                    ${
                        countryCodes.length
                            ? `
                                <div class="shop-country-summary">
                                    ${countryChips}
                                </div>
                                ${countryDetails}
                            `
                            : ""
                    }

                    <p class="shop-availability-note">
                        ${escapeHTML(
                            availability.note ||
                            "The merchant publishes regional shipping coverage rather than a complete country list. Final destination eligibility is confirmed at checkout."
                        )}
                    </p>
                </div>
            `;
        }

        return `
            <div class="shop-availability">
                <div class="shop-availability-head">
                    <div>
                        <span class="shop-info-label">🌍 Ships to</span>
                        <strong>${countryCodes.length === 1 ? "1 country" : `${countryCodes.length} countries`}</strong>
                    </div>
                    <span class="shop-availability-verified">${sourceLabel}</span>
                </div>

                <div class="shop-country-summary">
                    ${countryChips}
                </div>

                ${countryDetails}

                <p class="shop-availability-note">
                    ${escapeHTML(
                        availability.note ||
                        "Final destination eligibility is confirmed by the merchant at checkout."
                    )}
                </p>
            </div>
        `;
    }


    function getDeliveryHTML(deal){

        if(!deal?.delivery?.note){
            return "";
        }

        return `
            <div class="shop-delivery">
                <span class="shop-delivery-icon">🚚</span>
                <div>
                    <span class="shop-info-label">Delivery</span>
                    <p>${escapeHTML(deal.delivery.note)}</p>
                </div>
            </div>
        `;
    }

    function renderShopGrid(){
        const container =
            document.getElementById("shopSection");

        const grid =
            document.getElementById("shopGrid");

        if(!container || !grid){
            return;
        }

        const allItems = getAllShopItems();
        const filteredItems = getFilteredShopItems(allItems);

        if(!filteredItems.length){
            const countryLabel =
                shopViewState.country !== "all"
                    ? getCountryDefinition(
                        shopViewState.country
                    )?.name || shopViewState.country
                    : "all destinations";

            grid.innerHTML = `
                <div class="shop-empty-state">
                    <div class="shop-empty-icon">🛍️</div>
                    <h3>No curated products found</h3>
                    <p>
                        We currently do not have a verified offer matching
                        your filters for <strong>${escapeHTML(countryLabel)}</strong>.
                        More products are added only after their affiliate
                        links and availability are verified.
                    </p>
                    <button
                        type="button"
                        class="shop-reset-btn"
                        data-shop-reset="true"
                    >
                        Reset filters
                    </button>
                </div>
            `;

            return;
        }

        grid.innerHTML =
            filteredItems
                .map(deal => createDealCard(deal))
                .join("");

        container
            .querySelectorAll(".shop-result-count")
            .forEach(node => {
                node.textContent =
                    `${filteredItems.length} ${filteredItems.length === 1 ? "product" : "products"}`;
            });

    }


    /* =================================================
        STABLE WORTH IT SCORE GENERATOR
    ================================================ */

    function getDealScore(deal){

        if(deal._cachedScore !== undefined){
            return deal._cachedScore;
        }

        let hash = 0;

        const str =
            deal.id ||
            deal.title ||
            "default";

        for(let i = 0; i < str.length; i++){

            hash =
                (hash << 5) -
                hash +
                str.charCodeAt(i);

            hash |= 0;
        }

        deal._cachedScore =
            Math.abs(hash) % 2 === 0
                ? 10
                : 0;

        return deal._cachedScore;
    }


    /* =================================================
        GET ALL SHOP ITEMS
    ================================================ */

    function getAutomaticShopItems(){

        if(!Array.isArray(automaticShopProducts) || !automaticShopProducts.length){
            return [];
        }

        return automaticShopProducts
            .map(product => {

                if(
                    !product ||
                    !product.title ||
                    !product.affiliateUrl ||
                    !Number.isFinite(Number(product.price))
                ){
                    return null;
                }

                const category =
                    product.category ||
                    "other";

                const shippingCountries =
                    Array.isArray(
                        product.shippingCountries
                    )
                        ? [
                            ...new Set(
                                product.shippingCountries
                                    .map(
                                        code =>
                                            String(code)
                                                .trim()
                                                .toUpperCase()
                                    )
                                    .filter(
                                        code =>
                                            /^[A-Z]{2}$/.test(
                                                code
                                            )
                                    )
                            )
                        ]
                        : [];

                const effectiveShipping =
                    getEffectiveShippingProfile(
                        product,
                        shippingCountries
                    );

                const explicitServiceAvailability =
                    product?.availability?.type === "service"
                        ? product.availability
                        : null;

                const explicitShippingAvailability =
                    product?.availability?.type === "shipping"
                        ? product.availability
                        : null;

                const resolvedShippingAvailability =
                    effectiveShipping.coverageType !== "unknown"
                        ? {
                            type: "shipping",
                            coverageType:
                                effectiveShipping.coverageType,
                            coverageLabel:
                                effectiveShipping.coverageLabel,
                            countries:
                                effectiveShipping.countries,
                            sourceLabel:
                                effectiveShipping.sourceLabel,
                            sourceUrl:
                                effectiveShipping.sourceUrl,
                            verifiedAt:
                                effectiveShipping.verifiedAt,
                            note:
                                effectiveShipping.note
                        }
                        : null;

                const availability =
                    explicitServiceAvailability ||
                    resolvedShippingAvailability ||
                    explicitShippingAvailability ||
                    (
                        typeof shopPartnerAvailability !== "undefined"
                            ? shopPartnerAvailability[product.partnerId]
                            : null
                    ) ||
                    null;

                const currency =
                    product.currency ||
                    "$";

                const price =
                    Number(product.price);

                const oldPrice =
                    Number.isFinite(Number(product.oldPrice)) &&
                    Number(product.oldPrice) > price
                        ? Number(product.oldPrice)
                        : price;

                const isOnDiscount =
                    product.isOnDiscount === true ||
                    oldPrice > price;

                return {
                    id:
                        product.id ||
                        `awin-${product.partnerId || "partner"}-${product.title}`,

                    title:
                        product.title,

                    category:
                        category,

                    categoryLabel:
                        getCategoryDefinition(category)?.label ||
                        category,

                    partnerId:
                        product.partnerId ||
                        null,

                    availability:
                        availability,

                    delivery:
                        product.delivery ||
                        null,

                    oldPrice:
                        oldPrice,

                    isOnDiscount:
                        isOnDiscount,

                    savings:
                        isOnDiscount
                            ? Number(
                                (
                                    oldPrice -
                                    price
                                ).toFixed(2)
                            )
                            : 0,

                    currency:
                        currency,

                    image:
                        product.image ||
                        "",

                    expectedUsage:
                        "",

                    costPerUse:
                        null,

                    alternative:
                        "",

                    verdict:
                        "Popular affiliate product selected from an approved Awin partner feed.",

                    updatedAt:
                        product.productUpdatedAt ||
                        "Latest Awin feed",

                    isAffiliate:
                        true,

                    stores: [
                        {
                            name:
                                product.store ||
                                "Merchant",

                            price:
                                price,

                            url:
                                product.affiliateUrl,

                            affiliate:
                                true
                        }
                    ]
                };
            })
            .filter(Boolean);
    }

    async function getShopAccessToken(){

        try{

            const client =
                window.supabaseClient;

            if(
                !client ||
                !client.auth
            ){
                return "";
            }

            const result =
                await client.auth.getSession();

            return (
                result?.data?.session?.access_token ||
                ""
            );

        }
        catch(error){

            console.warn(
                "Shop could not read the current account session:",
                error
            );

            return "";
        }
    }

    async function loadAutomaticShopProducts(){

        if(
            automaticShopFeedLoaded ||
            automaticShopFeedLoading
        ){
            return automaticShopFeedPromise;
        }

        automaticShopFeedLoading = true;

        automaticShopFeedPromise =
            (async function(){

                try{

                    await loadShopShippingProfiles();

                    const accessToken =
                        await getShopAccessToken();

                    const headers = {
                        "Accept": "application/json"
                    };

                    if(accessToken){
                        headers.Authorization =
                            "Bearer " + accessToken;
                    }

                    const response =
                        await fetch(
                            "/api/shop-products",
                            {
                                method: "GET",
                                cache: "no-store",
                                headers:
                                    headers
                            }
                        );

                    if(!response.ok){
                        return false;
                    }

                    const data =
                        await response.json();

                    if(
                        !data ||
                        !Array.isArray(data.products) ||
                        !data.products.length
                    ){
                        return false;
                    }

                    automaticShopProducts =
                        data.products;

                    automaticShopFeedLoaded =
                        true;

                    return true;

                }
                catch(error){

                    console.warn(
                        "Automatic Awin Shop feed unavailable:",
                        error
                    );

                    return false;

                }
                finally{

                    automaticShopFeedLoading =
                        false;

                }

            })();

        return automaticShopFeedPromise;
    }


    function getAllShopItems(){

        const affiliateItems = [];

        Object.keys(affiliateProducts).forEach(
            category => {

                const products =
                    Array.isArray(
                        affiliateProducts[category]
                    )
                        ? affiliateProducts[category]
                        : [];


                products.forEach(product => {

                    if(
                        !product ||
                        !product.title ||
                        !product.affiliateUrl ||
                        !Number.isFinite(product.price)
                    ){
                        return;
                    }


                    const safeCategory =
                        product.category ||
                        category;


                    const generatedId =
                        `affiliate-${safeCategory
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, "")}-${product.title
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, "")}`;


                    affiliateItems.push({

                        id:
                            product.id ||
                            generatedId,

                        title:
                            product.title,

                        category:
                            safeCategory,

                        categoryLabel:
                            product.categoryLabel ||
                            getCategoryDefinition(safeCategory)?.label ||
                            safeCategory,

                        partnerId:
                            product.partnerId ||
                            null,

                        availability:
                            product.availability || null,

                        delivery:
                            product.delivery || null,

                        oldPrice:
                            Number.isFinite(product.oldPrice)
                                ? product.oldPrice
                                : product.price,

                        currency:
                            product.currency ||
                            "$",

                        image:
                            product.image ||
                            "",

                        expectedUsage:
                            product.expectedUsage ||
                            "",

                        costPerUse:
                            product.costPerUse != null
                                ? product.costPerUse
                                : null,

                        alternative:
                            product.alternative ||
                            "",

                        verdict:
                            product.verdict ||
                            "Affiliate deal available from this store.",

                        updatedAt:
                            product.updatedAt ||
                            "Today",

                        isAffiliate:
                            true,

                        stores: [
                            {
                                name:
                                    product.store ||
                                    "Store",

                                price:
                                    product.price,

                                url:
                                    product.affiliateUrl,

                                affiliate:
                                    true
                            }
                        ]

                    });

                });

            }
        );


        const automaticItems =
            getAutomaticShopItems();

        const automaticPartnerIds =
            new Set(
                automaticItems
                    .map(
                        deal => deal.partnerId
                    )
                    .filter(Boolean)
            );

        const fallbackAffiliateItems =
            affiliateItems.filter(
                deal =>
                    !deal.partnerId ||
                    !automaticPartnerIds.has(
                        deal.partnerId
                    )
            );

        return [
            ...shopItems,
            ...automaticItems,
            ...fallbackAffiliateItems
        ];
    }


    /* =================================================
        OPEN SHOP
    ================================================ */

        document.documentElement.classList.remove("settings-open");

window.openShop = function(){

        if (typeof window.hideShipTrackingSection === "function") {
            window.hideShipTrackingSection();
        }

        if (typeof window.hideWaterLevelsSection === "function") {
            window.hideWaterLevelsSection();
        }

        const homePage =
            document.getElementById(
                "homePage"
            );


        if(homePage){
            homePage.style.display =
                "none";
        }


        document
            .querySelectorAll(".app")
            .forEach(x => {

                x.classList.remove("active");
                x.style.display = "none";

            });


        if (typeof window.hideCarsNavigationUi === "function") {
            window.hideCarsNavigationUi();
        }

        const sectionsToHide = [
            "weatherSection",
            "newsSection",
            "settingsPanel",
            "marketsSection",
            "moneySection",
            "cryptoSection"
        ];


        sectionsToHide.forEach(id => {

            const element =
                document.getElementById(id);

            if(element){
                element.style.display =
                    "none";
            }

        });


        let container =
            document.getElementById(
                "shopSection"
            );


        if(!container){

            container =
                document.createElement(
                    "section"
                );

            container.id =
                "shopSection";

           container.className =
                "shop-section app";

            const footer =
                document.querySelector(
                    "footer"
                );


            if(footer){

                footer.parentNode.insertBefore(
                    container,
                    footer
                );

            }else{

                document.body.appendChild(
                    container
                );

            }
        }


        renderShop(container);

        container.style.display =
            "block";

        loadAutomaticShopProducts()
            .then(loaded => {

                if(
                    loaded &&
                    container.style.display !== "none"
                ){
                    renderShop(container);
                }

            });


        const navLinks =
            document.getElementById(
                "navLinks"
            );


        if(navLinks){
            if(typeof closeNavMenuUnlessPreserved === "function"){
                closeNavMenuUnlessPreserved(navLinks);
            }
        }


        document.documentElement.style.overflowY =
            "auto";

        document.body.style.overflowY =
            "auto";


        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    };


    /* =================================================
        COMPATIBILITY
    ================================================ */

    window.openDiscounts =
        window.openShop;


  /* =================================================
    RENDER SHOP
================================================ */

function renderShop(container){

    const today = new Date();

    const dateText =
        today.toLocaleDateString(
            undefined,
            {
                year: "numeric",
                month: "long",
                day: "numeric"
            }
        );

    const allItems = getAllShopItems();
    const countryOptions = getCountryOptions(allItems);
    const connectedPartnerIds =
        new Set(
            allItems
                .map(deal => deal.partnerId)
                .filter(Boolean)
        );

    const categoriesHTML =
        SHOP_CATEGORIES
            .map(
                category => {
                    const count =
                        getCategoryProductCount(
                            allItems,
                            category.id
                        );

                    return `
                        <button
                            type="button"
                            class="shop-filter${shopViewState.category === category.id ? " active" : ""}${count === 0 ? " disabled" : ""}"
                            data-category="${escapeHTML(category.id)}"
                            ${count === 0 ? "disabled" : ""}
                            title="${count === 0 ? "Products are being curated for this category" : `${count} ${count === 1 ? "product" : "products"}`}"
                        >
                            <span class="shop-filter-icon">${category.icon}</span>
                            <span>${escapeHTML(category.label)}</span>
                            <span class="shop-filter-count">${count}</span>
                        </button>
                    `;
                }
            )
            .join("");

    const countryOptionsHTML =
        countryOptions
            .map(
                country => `
                    <option
                        value="${escapeHTML(country.code)}"
                        ${shopViewState.country === country.code ? "selected" : ""}
                    >
                        ${getCountryFlag(country.code)} ${escapeHTML(country.name)}
                    </option>
                `
            )
            .join("");

    const partnerHTML =
        SHOP_PARTNERS
            .map(
                partner => {
                    const productCount =
                        allItems.filter(
                            deal =>
                                deal.partnerId === partner.id
                        ).length;

                    const shippingCoverage =
                        getPartnerShippingCoverage(
                            partner.id,
                            allItems
                        );

                    const coverageText =
                        getPartnerCoverageText(partner, allItems);

                    const status =
                        productCount > 0
                            ? "Live now"
                            : partner.cardStatus ||
                                (partner.status === "not-published"
                                    ? "Not published"
                                    : "Curating");

                    return `
                        <button type="button" class="shop-partner-card" data-shop-partner-id="${escapeHTML(partner.id)}" data-shop-partner-coverage="${escapeHTML(coverageText)}" aria-haspopup="dialog" aria-controls="shopPartnerModal" aria-label="View details for ${escapeHTML(partner.name)}" title="View partner details">
                            <div class="shop-partner-icon">
                                ${partner.icon}
                            </div>
                            <div class="shop-partner-main">
                                <strong>${escapeHTML(partner.name)}</strong>
                                <span>${escapeHTML(coverageText)}</span>
                            </div>
                            <span class="shop-partner-status ${productCount > 0 ? "live" : partner.status === "offer-pending" ? "pending" : ""}">
                                ${escapeHTML(status)}
                            </span>
                            <span class="shop-partner-open-indicator" aria-hidden="true">↗</span>
                        </button>
                    `;
                }
            )
            .join("");

    container.innerHTML = `
        <div class="shop-hero">
            <div class="shop-hero-copy">
                <div class="shop-eyebrow">
                    CURATED • TRANSPARENT • GLOBAL
                </div>
                <h2>🛍️ Today's Shop</h2>
                <p>
                    Smart deals selected by Worth It —
                    only products with verified affiliate links are published.
                </p>
                <div class="shop-hero-meta">
                    <span>Updated ${escapeHTML(dateText)}</span>
                    <span class="shop-dot">•</span>
                    <span>${allItems.length} curated products</span>
                    <span class="shop-dot">•</span>
                    <span>${connectedPartnerIds.size} live partner store${connectedPartnerIds.size === 1 ? "" : "s"}</span>
                    <span class="shop-dot">•</span>
                    <span>${getUniqueProductCountries(allItems)} shipping destinations represented</span>
                </div>
            </div>

            <div class="shop-trust-box">
                <div class="shop-trust-icon">✓</div>
                <div>
                    <strong>Worth It picks first</strong>
                    <span>
                        We do not publish a product just because a merchant pays a higher commission.
                    </span>
                </div>
            </div>
        </div>

        <div class="shop-controls">
            <label class="shop-search-box">
                <span>⌕</span>
                <input
                    id="shopSearchInput"
                    type="search"
                    value="${escapeHTML(shopViewState.query)}"
                    placeholder="Search products, stores..."
                    autocomplete="off"
                >
            </label>

            <label class="shop-select-box">
                <span>🌍</span>
                <select id="shopCountrySelect">
                    <option value="all">🌍 All destinations</option>
                    ${countryOptionsHTML}
                </select>
            </label>

            <label class="shop-select-box">
                <span>↕</span>
                <select id="shopSortSelect">
                    <option value="featured" ${shopViewState.sort === "featured" ? "selected" : ""}>Featured</option>
                    <option value="discount" ${shopViewState.sort === "discount" ? "selected" : ""}>Biggest discount</option>
                    <option value="price" ${shopViewState.sort === "price" ? "selected" : ""}>Lowest price</option>
                    <option value="az" ${shopViewState.sort === "az" ? "selected" : ""}>A–Z</option>
                </select>
            </label>

            <div class="shop-control-result">
                <span class="shop-result-count">${allItems.length} ${allItems.length === 1 ? "product" : "products"}</span>
            </div>
        </div>

        <div class="shop-section-heading">
            <div>
                <h3>Shop by category</h3>
                <p>Categories follow the affiliate stores we have selected and are safe to expand over time.</p>
            </div>
        </div>

        <div class="shop-filters" id="shopFiltersContainer">
            <button
                type="button"
                class="shop-filter${shopViewState.category === "all" ? " active" : ""}"
                data-category="all"
            >
                <span class="shop-filter-icon">✨</span>
                <span>All</span>
            </button>
            ${categoriesHTML}
        </div>

        <div class="shop-partners">
            <div class="shop-partners-heading">
                <div>
                    <h3>Affiliate sources we're curating</h3>
                    <p>
                        A category becomes live only after we have a real tracked product link and verified destination information.
                    </p>
                </div>
                <span>${SHOP_PARTNERS.length} sources</span>
            </div>
            <div class="shop-partners-grid">
                ${partnerHTML}
            </div>
        </div>

        <div class="shop-grid" id="shopGrid"></div>

        <div class="shop-footer-note">
            <strong>Affiliate transparency:</strong>
            Worth It may earn a commission when you buy through an affiliate link.
            Prices, stock, shipping costs and destination eligibility can change at the merchant.
            Always confirm the final details at checkout.
        </div>

        <div class="shop-partner-modal-overlay" id="shopPartnerModal" hidden aria-hidden="true">
            <div class="shop-partner-modal" role="dialog" aria-modal="true" aria-labelledby="shopPartnerModalTitle" aria-describedby="shopPartnerModalIntro" tabindex="-1">
                <div class="shop-partner-modal-header">
                    <div class="shop-partner-modal-brand">
                        <div class="shop-partner-modal-icon" id="shopPartnerModalIcon" aria-hidden="true">🤝</div>
                        <div class="shop-partner-modal-title-wrap">
                            <span>Affiliate programme</span>
                            <h3 id="shopPartnerModalTitle">Partner details</h3>
                        </div>
                    </div>
                    <button type="button" class="shop-partner-modal-close" data-shop-partner-close="true" aria-label="Close partner details">×</button>
                </div>
                <div class="shop-partner-modal-body" id="shopPartnerModalBody"></div>
            </div>
        </div>
    `;

    setupShopFilters();
    renderShopGrid();
    setupShopPartnerDetails(container, allItems);
}

    /* =================================================
        DEAL CARD
    ================================================ */

    function getAffiliatePickHTML(deal){

        if(!deal?.isAffiliate){
            return "";
        }

        return `
            <div class="shop-affiliate-pick">
                <span class="shop-affiliate-pick-icon">★</span>
                <div>
                    <strong>Popular affiliate pick</strong>
                    <small>Selected from popular products in our affiliate programs • May be out of stock</small>
                </div>
            </div>
        `;
    }

    function createDealCard(deal){

        const stores =
            getStores(deal);


        const bestStore =
            getBestStore(deal);


        const bestPrice =
            bestStore
                ? bestStore.price
                : 0;


        const discount =
            calculateDiscount(
                deal.oldPrice,
                bestPrice
            );


        const savings =
            calculateSavings(
                deal.oldPrice,
                bestPrice
            );

        const isOnDiscount =
            discount > 0;

        const isFreeDigital =
            deal?.shippingCoverageType === "digital" &&
            Number(bestPrice) === 0;


        const partner =
            getPartner(deal);

        const category =
            getCategoryDefinition(
                deal.category
            );

        const availabilityHTML =
            getAvailabilityHTML(deal);

        const deliveryHTML =
            getDeliveryHTML(deal);

        const affiliatePickHTML =
            getAffiliatePickHTML(deal);

        /* ---------------------------------------------
            IMAGE
        --------------------------------------------- */

        const image =
            deal.image

                ? `

                    <img
                        src="${escapeHTML(deal.image)}"
                        alt="${escapeHTML(deal.title)}"
                        class="shop-image"
                        loading="lazy"
                    >

                `

                : `

                    <div class="shop-image-placeholder shop-affiliate-placeholder">

                        <span>
                            🛍️
                        </span>

                    </div>

                `;


        /* ---------------------------------------------
            SCORE
        --------------------------------------------- */

        const score =
            deal.isAffiliate
                ? null
                : getDealScore(deal);


        /* ---------------------------------------------
            BEST STORE
        --------------------------------------------- */

        let bestStoreHTML =
            "";


        if(bestStore){

            bestStoreHTML = `

                <div class="shop-best-price-box">

                    <div class="shop-best-price-info">

                        <span class="shop-best-label">
                              ${deal.isAffiliate ? "" : "BEST PRICE"}
                        </span>

                        <strong>
                            ${escapeHTML(
                                bestStore.name
                            )}
                        </strong>

                    </div>


                    <div class="shop-best-price-right">

                        <strong class="shop-best-price">

                            ${formatPrice(
                                bestStore.price,
                                deal.currency
                            )}

                        </strong>


                        <a
                            href="${escapeHTML(
                                bestStore.url || "#"
                            )}"
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            class="shop-buy-button shop-buy-button-primary"
                        >
                            Buy →
                        </a>

                    </div>

                </div>

            `;
        }


        /* ---------------------------------------------
            OTHER STORES
        --------------------------------------------- */

        const otherStores =
            stores.slice(1, 4);


        let otherStoresHTML =
            "";


        if(otherStores.length){

            otherStoresHTML = `

                <div class="shop-other-stores">

                    <div class="shop-other-title">
                        Other options
                    </div>


                    ${otherStores
                        .map(store => {

                            const storeUrl =
                                store.url
                                    ? escapeHTML(
                                        store.url
                                    )
                                    : "#";


                            return `

                                <div class="shop-store-row">

                                    <strong class="shop-store-name">

                                        ${escapeHTML(
                                            store.name
                                        )}

                                    </strong>


                                    <div class="shop-store-action">

                                        <strong class="shop-store-price">

                                            ${formatPrice(
                                                store.price,
                                                deal.currency
                                            )}

                                        </strong>


                                        <a
                                            href="${storeUrl}"
                                            target="_blank"
                                            rel="noopener noreferrer sponsored"
                                            class="shop-buy-button"
                                        >
                                            Buy →
                                        </a>

                                    </div>

                                </div>

                            `;

                        })
                        .join("")}

                </div>

            `;
        }


        /* ---------------------------------------------
            VALUE ANALYSIS
        --------------------------------------------- */

        const valueAnalysis =
            deal.isAffiliate

                ? ""

                : `

                    <div class="shop-value-analysis">

                        <div class="shop-analysis-row">

                            <span>
                                Expected usage
                            </span>

                            <strong>

                                ${
                                    deal.expectedUsage
                                        ? escapeHTML(
                                            deal.expectedUsage
                                        )
                                        : "—"
                                }

                            </strong>

                        </div>


                        <div class="shop-analysis-row">

                            <span>
                                Cost per use
                            </span>

                            <strong>

                                ${
                                    deal.costPerUse != null
                                        ? `~${formatPrice(
                                            deal.costPerUse,
                                            deal.currency
                                        )}`
                                        : "—"
                                }

                            </strong>

                        </div>


                        <div class="shop-analysis-row">

                            <span>
                                Alternative
                            </span>

                            <strong>

                                ${
                                    deal.alternative
                                        ? escapeHTML(
                                            deal.alternative
                                        )
                                        : "—"
                                }

                            </strong>

                        </div>


                        <div class="shop-score-row">

                            <span>
                                Worth It Score
                            </span>

                            <strong>

                                ${
                                    score !== null
                                        ? `${score}/10`
                                        : "—"
                                }

                            </strong>

                        </div>

                    </div>

                `;


        /* ---------------------------------------------
            SAVINGS
        --------------------------------------------- */

        const savingsHTML = isFreeDigital ? "" : `

            <div class="shop-savings">

                <span>

                    You save

                </span>

                <strong>

                    ${formatPrice(
                        savings,
                        deal.currency
                    )}

                </strong>

                <span class="shop-discount-status ${isOnDiscount ? "on-discount" : "not-on-discount"}">

                    ${isOnDiscount ? "On discount" : "Not on discount"}

                </span>

            </div>

        `;


        /* ---------------------------------------------
            VERDICT
        --------------------------------------------- */

        const verdictHTML =
            deal.isAffiliate

                ? `

                    <div class="shop-verdict">

                        <div class="shop-verdict-title">
                            Affiliate offer
                        </div>


                        <p>

                            Available from
                            ${escapeHTML(
                                bestStore
                                    ? bestStore.name
                                    : "this store"
                            )}

                        </p>

                    </div>

                `

                : `

                    <div class="shop-verdict">

                        <div class="shop-verdict-title">
                            ✓ Our verdict
                        </div>


                        <p>

                            ${escapeHTML(
                                deal.verdict ||
                                "Good value at this price."
                            )}

                        </p>

                    </div>

                `;


        /* ---------------------------------------------
            FINAL CARD
        --------------------------------------------- */

        return `

            <article
                class="shop-card ${deal.isAffiliate ? "shop-affiliate-card" : ""}"
                data-product-id="${escapeHTML(deal.id || "")}"
                data-category="${escapeHTML(
                    deal.category
                )}"
                data-partner="${escapeHTML(
                    deal.partnerId || ""
                )}"
            >

                <div class="shop-card-image">

                    ${image}


                    <span class="shop-badge">

                        ${discount > 0 ? `-${discount}%` : "Offer"}

                    </span>

                    ${partner
                        ? `
                            <span class="shop-partner-badge">
                                ${partner.icon}
                                ${escapeHTML(partner.name)}
                            </span>
                        `
                        : ""}

                </div>


                <div class="shop-card-content">

                    <div class="shop-card-meta">

                        <span class="shop-category">

                            ${category?.icon || "🛍️"}

                            ${escapeHTML(
                                deal.categoryLabel ||
                                category?.label ||
                                deal.category ||
                                "Shop"
                            )}

                        </span>

                    </div>


                    <h3 class="shop-title">

                        ${escapeHTML(
                            deal.title
                        )}

                    </h3>


                    <div class="shop-prices">

                        <span class="shop-old-price" style="${isFreeDigital ? "display:none;" : ""}">

                            ${formatPrice(
                                deal.oldPrice,
                                deal.currency
                            )}

                        </span>


                        <span class="shop-new-price">

                            ${isFreeDigital ? "Free course" : formatPrice(
                                bestPrice,
                                deal.currency
                            )}

                        </span>

                    </div>


                    ${valueAnalysis}


                    ${savingsHTML}


                    ${affiliatePickHTML}


                    <button
                        type="button"
                        class="shop-details-toggle"
                        data-shop-details-toggle="true"
                        aria-expanded="false"
                    >
                        <span>View details</span>
                        <span class="shop-details-chevron">↓</span>
                    </button>


                    <div
                        class="shop-card-details"
                        data-shop-details
                        hidden
                    >


                    ${availabilityHTML}


                    ${deliveryHTML}


                    ${verdictHTML}


                    <div class="shop-where-to-buy">

                        <div class="shop-where-title">

                            Where to buy

                        </div>


                        ${bestStoreHTML}


                        ${otherStoresHTML}

                    </div>


                    <div class="shop-updated">

                        <span>
                            ${deal.isAffiliate ? "Price checked" : "Updated"}
                        </span>

                        <strong>
                            ${escapeHTML(
                                deal.updatedAt ||
                                "Today"
                            )}
                        </strong>

                    </div>

                    ${deal.isAffiliate
                        ? `
                            <div class="shop-affiliate-disclosure">
                                <span>Affiliate link</span>
                                <span>•</span>
                                <span>Worth It may earn a commission</span>
                            </div>

                            <div class="shop-card-footer-note">
                                Prices, stock and shipping can change at the merchant checkout.
                            </div>
                        `
                        : ""}

                    </div>

                </div>

            </article>

        `;
    }


    /* =================================================
        FILTERS
    ================================================ */

    function setupShopFilters(){

        const filtersContainer =
            document.getElementById(
                "shopFiltersContainer"
            );

        const shopSection =
            document.getElementById(
                "shopSection"
            );

        if(!filtersContainer || !shopSection){
            return;
        }

        if(!filtersContainer._hasClickListener){
            filtersContainer._hasClickListener = true;

            filtersContainer.addEventListener(
                "click",
                function(event){

                    const button =
                        event.target.closest(
                            ".shop-filter"
                        );

                    if(!button || button.disabled){
                        return;
                    }

                    shopViewState.category =
                        button.dataset.category || "all";

                    filtersContainer
                        .querySelectorAll(".shop-filter")
                        .forEach(btn =>
                            btn.classList.remove("active")
                        );

                    button.classList.add("active");

                    renderShopGrid();
                }
            );
        }

        if(!shopSection._hasShopControlListeners){
            shopSection._hasShopControlListeners = true;

            shopSection.addEventListener(
                "input",
                function(event){
                    if(
                        event.target &&
                        event.target.id === "shopSearchInput"
                    ){
                        shopViewState.query =
                            event.target.value || "";

                        renderShopGrid();
                    }
                }
            );

            shopSection.addEventListener(
                "change",
                function(event){
                    if(
                        event.target &&
                        event.target.id === "shopCountrySelect"
                    ){
                        shopViewState.country =
                            event.target.value || "all";

                        renderShopGrid();
                        return;
                    }

                    if(
                        event.target &&
                        event.target.id === "shopSortSelect"
                    ){
                        shopViewState.sort =
                            event.target.value || "featured";

                        renderShopGrid();
                    }
                }
            );

            shopSection.addEventListener(
                "click",
                function(event){

                    const detailsToggle =
                        event.target.closest(
                            "[data-shop-details-toggle='true']"
                        );

                    if(detailsToggle){
                        const card =
                            detailsToggle.closest(".shop-card");

                        const details =
                            card?.querySelector("[data-shop-details]");

                        if(details){
                            const opening = details.hidden;

                            details.hidden = !opening;
                            detailsToggle.setAttribute(
                                "aria-expanded",
                                String(opening)
                            );

                            const label =
                                detailsToggle.querySelector("span");

                            const chevron =
                                detailsToggle.querySelector(
                                    ".shop-details-chevron"
                                );

                            if(label){
                                label.textContent =
                                    opening
                                        ? "Hide details"
                                        : "View details";
                            }

                            if(chevron){
                                chevron.textContent =
                                    opening ? "↑" : "↓";
                            }

                            if(card){
                                card.classList.toggle(
                                    "shop-card-expanded",
                                    opening
                                );
                            }
                        }

                        return;
                    }

                    const resetButton =
                        event.target.closest(
                            "[data-shop-reset='true']"
                        );

                    if(!resetButton){
                        return;
                    }

                    shopViewState.category = "all";
                    shopViewState.country = "all";
                    shopViewState.query = "";
                    shopViewState.sort = "featured";

                    renderShop(
                        document.getElementById(
                            "shopSection"
                        )
                    );
                }
            );
        }
    }


    /* =================================================
        CLOSE SHOP
    ================================================ */

    window.closeShop = function(){

        const container =
            document.getElementById(
                "shopSection"
            );


        if(container){

            container.style.display =
                "none";

        }

    };


    /* =================================================
        COMPATIBILITY
    ================================================ */

    window.closeDiscounts =
        window.closeShop;


})();
