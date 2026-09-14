/* =====================================================
    SHOP — WORTH IT AFFILIATE ENGINE
===================================================== */

(function(){

    "use strict";


    /* =================================================
        DEMO / INTERNAL DEAL DATA
    ================================================ */

    const shopItems = [
        {
            id: "kids-building-set",
            title: "Kids Building Set",
            category: "Kids",
            oldPrice: 59.99,
            currency: "$",
            image: "",
            expectedUsage: "100+ sessions",
            costPerUse: 0.40,
            alternative: "$29.99",
            verdict: "Excellent value for educational play",
            updatedAt: "Today",
            stores: [
                { name: "Example Kids", price: 39.99, url: "https://example.com", affiliate: true },
                { name: "Example Toys", price: 42.99, url: "https://example.com", affiliate: true },
                { name: "Example Store", price: 46.99, url: "https://example.com", affiliate: false }
            ]
        },

        {
            id: "wireless-headphones",
            title: "Wireless Headphones",
            category: "Electronics",
            oldPrice: 99.99,
            currency: "$",
            image: "",
            expectedUsage: "500+ hours",
            costPerUse: 0.14,
            alternative: "$54.99",
            verdict: "Strong price for everyday use",
            updatedAt: "Today",
            stores: [
                { name: "Example Store", price: 69.99, url: "https://example.com", affiliate: true },
                { name: "Example Electronics", price: 74.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "smart-watch",
            title: "Smart Watch",
            category: "Electronics",
            oldPrice: 149.99,
            currency: "$",
            image: "",
            expectedUsage: "1,000+ days",
            costPerUse: 0.10,
            alternative: "$89.99",
            verdict: "Good discount for a popular upgrade",
            updatedAt: "Today",
            stores: [
                { name: "Example Shop", price: 99.99, url: "https://example.com", affiliate: true },
                { name: "Example Tech", price: 104.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "running-shoes",
            title: "Running Shoes",
            category: "Fashion",
            oldPrice: 120,
            currency: "$",
            image: "",
            expectedUsage: "150+ runs",
            costPerUse: 0.53,
            alternative: "$69.99",
            verdict: "Very good value at this price",
            updatedAt: "Today",
            stores: [
                { name: "Example Sports", price: 79.99, url: "https://example.com", affiliate: true },
                { name: "Example Fashion", price: 84.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "coffee-machine",
            title: "Coffee Machine",
            category: "Home",
            oldPrice: 199.99,
            currency: "$",
            image: "",
            expectedUsage: "1,500+ uses",
            costPerUse: 0.09,
            alternative: "$119.99",
            verdict: "Great deal for frequent coffee drinkers",
            updatedAt: "Today",
            stores: [
                { name: "Example Home", price: 139.99, url: "https://example.com", affiliate: true },
                { name: "Example Appliances", price: 149.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "gaming-keyboard",
            title: "Gaming Keyboard",
            category: "Gaming",
            oldPrice: 89.99,
            currency: "$",
            image: "",
            expectedUsage: "2,000+ hours",
            costPerUse: 0.03,
            alternative: "$49.99",
            verdict: "Solid upgrade without overspending",
            updatedAt: "Today",
            stores: [
                { name: "Example Gaming", price: 59.99, url: "https://example.com", affiliate: true },
                { name: "Example Tech", price: 64.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "face-care-set",
            title: "Face Care Set",
            category: "Beauty",
            oldPrice: 49.99,
            currency: "$",
            image: "",
            expectedUsage: "60+ uses",
            costPerUse: 0.58,
            alternative: "$27.99",
            verdict: "Good savings on a complete set",
            updatedAt: "Today",
            stores: [
                { name: "Example Beauty", price: 34.99, url: "https://example.com", affiliate: true },
                { name: "Example Care", price: 37.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "yoga-mat",
            title: "Yoga Mat",
            category: "Sports",
            oldPrice: 39.99,
            currency: "$",
            image: "",
            expectedUsage: "200+ workouts",
            costPerUse: 0.14,
            alternative: "$19.99",
            verdict: "Worth it for regular home workouts",
            updatedAt: "Today",
            stores: [
                { name: "Example Fitness", price: 27.99, url: "https://example.com", affiliate: true },
                { name: "Example Sports", price: 29.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "car-phone-holder",
            title: "Car Phone Holder",
            category: "Automotive",
            oldPrice: 29.99,
            currency: "$",
            image: "",
            expectedUsage: "1,000+ trips",
            costPerUse: 0.02,
            alternative: "$14.99",
            verdict: "Small cost with practical everyday value",
            updatedAt: "Today",
            stores: [
                { name: "Example Auto", price: 19.99, url: "https://example.com", affiliate: true },
                { name: "Example Accessories", price: 21.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "travel-backpack",
            title: "Travel Backpack",
            category: "Travel",
            oldPrice: 79.99,
            currency: "$",
            image: "",
            expectedUsage: "300+ trips",
            costPerUse: 0.18,
            alternative: "$44.99",
            verdict: "Good long-term value for frequent travelers",
            updatedAt: "Today",
            stores: [
                { name: "Example Travel", price: 54.99, url: "https://example.com", affiliate: true },
                { name: "Example Bags", price: 59.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "office-chair",
            title: "Office Chair",
            category: "Office",
            oldPrice: 249.99,
            currency: "$",
            image: "",
            expectedUsage: "5,000+ hours",
            costPerUse: 0.04,
            alternative: "$149.99",
            verdict: "Strong value for a long-term purchase",
            updatedAt: "Today",
            stores: [
                { name: "Example Office", price: 179.99, url: "https://example.com", affiliate: true },
                { name: "Example Furniture", price: 189.99, url: "https://example.com", affiliate: true }
            ]
        },

        {
            id: "tool-set",
            title: "Tool Set",
            category: "Tools",
            oldPrice: 119.99,
            currency: "$",
            image: "",
            expectedUsage: "500+ projects",
            costPerUse: 0.17,
            alternative: "$69.99",
            verdict: "Excellent value for a complete starter set",
            updatedAt: "Today",
            stores: [
                { name: "Example Tools", price: 84.99, url: "https://example.com", affiliate: true },
                { name: "Example Hardware", price: 89.99, url: "https://example.com", affiliate: true }
            ]
        }
    ];


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

        return (currency || "$") +
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


        return [
            ...shopItems,
            ...affiliateItems
        ];
    }


    /* =================================================
        OPEN SHOP
    ================================================ */

    window.openShop = function(){

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


        const sectionsToHide = [
            "weatherSection",
            "newsSection",
            "settingsPanel",
            "marketsSection",
            "moneySection"
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
                "shop-section";


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


        const navLinks =
            document.getElementById(
                "navLinks"
            );


        if(navLinks){

            navLinks.classList.remove(
                "open"
            );

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

        const today =
            new Date();


        const dateText =
            today.toLocaleDateString(
                undefined,
                {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                }
            );


        const allItems =
            getAllShopItems();


        const categories = [
            ...new Set(
                allItems
                    .map(
                        deal =>
                            deal.category
                    )
                    .filter(Boolean)
            )
        ];


        const html = `

            <div class="shop-header">

                <div>

                    <h2>
                        🛍️ Today's Shop
                    </h2>

                    <p>

                        Smart deals selected by Worth It

                        <small>
                            Updated
                            ${escapeHTML(dateText)}
                        </small>

                    </p>

                </div>

            </div>


            <div
                class="shop-filters"
                id="shopFiltersContainer"
            >

                <button
                    type="button"
                    class="shop-filter active"
                    data-category="all"
                >
                    All
                </button>


                ${categories
                    .map(
                        category => `

                            <button
                                type="button"
                                class="shop-filter"
                                data-category="${escapeHTML(category)}"
                            >
                                ${escapeHTML(category)}
                            </button>

                        `
                    )
                    .join("")}

            </div>


            <div
                class="shop-grid"
                id="shopGrid"
            >

                ${allItems
                    .map(
                        deal =>
                            createDealCard(deal)
                    )
                    .join("")}

            </div>

        `;


        container.innerHTML =
            html;


        setupShopFilters();

    }


    /* =================================================
        DEAL CARD
    ================================================ */

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
                            BEST PRICE
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

        const savingsHTML = `

            <div class="shop-savings">

                You save

                <strong>

                    ${formatPrice(
                        savings,
                        deal.currency
                    )}

                </strong>

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
                data-category="${escapeHTML(
                    deal.category
                )}"
            >

                <div class="shop-card-image">

                    ${image}


                    <span class="shop-badge">

                        -${discount}%

                    </span>

                </div>


                <div class="shop-card-content">

                    <div class="shop-card-meta">

                        <span class="shop-category">

                            ${escapeHTML(
                                deal.category
                            )}

                        </span>

                    </div>


                    <h3 class="shop-title">

                        ${escapeHTML(
                            deal.title
                        )}

                    </h3>


                    <div class="shop-prices">

                        <span class="shop-old-price">

                            ${formatPrice(
                                deal.oldPrice,
                                deal.currency
                            )}

                        </span>


                        <span class="shop-new-price">

                            ${formatPrice(
                                bestPrice,
                                deal.currency
                            )}

                        </span>

                    </div>


                    ${valueAnalysis}


                    ${savingsHTML}


                    ${verdictHTML}


                    <div class="shop-where-to-buy">

                        <div class="shop-where-title">

                            Where to buy

                        </div>


                        ${bestStoreHTML}


                        ${otherStoresHTML}

                    </div>


                    <div class="shop-updated">

                        ${
                            deal.isAffiliate
                                ? "Affiliate deal • "
                                : "Updated: "
                        }

                        ${escapeHTML(
                            deal.updatedAt ||
                            "Today"
                        )}

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


        if(!filtersContainer){
            return;
        }


        if(filtersContainer._hasClickListener){
            return;
        }


        filtersContainer._hasClickListener =
            true;


        filtersContainer.addEventListener(
            "click",
            function(event){

                const button =
                    event.target.closest(
                        ".shop-filter"
                    );


                if(!button){
                    return;
                }


                const category =
                    button.dataset.category;


                filtersContainer
                    .querySelectorAll(
                        ".shop-filter"
                    )
                    .forEach(btn =>
                        btn.classList.remove(
                            "active"
                        )
                    );


                button.classList.add(
                    "active"
                );


                const grid =
                    document.getElementById(
                        "shopGrid"
                    );


                if(!grid){
                    return;
                }


                const allItems =
                    getAllShopItems();


                const filteredDeals =
                    category === "all"

                        ? allItems

                        : allItems.filter(
                            deal =>
                                deal.category ===
                                category
                        );


                if(!filteredDeals.length){

                    grid.innerHTML = `

                        <article class="shop-card">

                            <div class="shop-card-image">

                                <div class="shop-image-placeholder">
                                    No products
                                </div>

                            </div>


                            <div class="shop-card-content">

                                <h3>
                                    No shop items available right now
                                </h3>

                            </div>

                        </article>

                    `;

                    return;
                }


                grid.innerHTML =
                    filteredDeals
                        .map(
                            deal =>
                                createDealCard(
                                    deal
                                )
                        )
                        .join("");

            }
        );

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
