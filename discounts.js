/* =====================================================
   DISCOUNTS — WORTH IT AFFILIATE ENGINE
===================================================== */

(function(){

    "use strict";


    /* =================================================
       DEAL DATA

       Ovo je trenutno TEST DATA.

       Kasnije:
       Awin Feed/API
              ↓
       Backend
              ↓
       discounts data
              ↓
       ovaj renderer
    ================================================= */

    const discounts = [

        {
            id: "kids-building-set",

            title: "Kids Building Set",

            category: "Kids",

            oldPrice: 59.99,
            currency: "$",

            image: "",

            worthItScore: 9.2,

            verdict:
                "Excellent value for educational play",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Kids",
                    price: 39.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Toys",
                    price: 42.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Store",
                    price: 46.99,
                    url: "https://example.com",
                    affiliate: false
                }

            ]
        },


        {
            id: "wireless-headphones",

            title: "Wireless Headphones",

            category: "Electronics",

            oldPrice: 99.99,
            currency: "$",

            image: "",

            worthItScore: 8.7,

            verdict:
                "Strong price for everyday use",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Store",
                    price: 69.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Electronics",
                    price: 74.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "smart-watch",

            title: "Smart Watch",

            category: "Electronics",

            oldPrice: 149.99,
            currency: "$",

            image: "",

            worthItScore: 8.4,

            verdict:
                "Good discount for a popular upgrade",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Shop",
                    price: 99.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Tech",
                    price: 104.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "running-shoes",

            title: "Running Shoes",

            category: "Fashion",

            oldPrice: 120,
            currency: "$",

            image: "",

            worthItScore: 8.8,

            verdict:
                "Very good value at this price",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Sports",
                    price: 79.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Fashion",
                    price: 84.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "coffee-machine",

            title: "Coffee Machine",

            category: "Home",

            oldPrice: 199.99,
            currency: "$",

            image: "",

            worthItScore: 9.0,

            verdict:
                "Great deal for frequent coffee drinkers",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Home",
                    price: 139.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Appliances",
                    price: 149.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "gaming-keyboard",

            title: "Gaming Keyboard",

            category: "Gaming",

            oldPrice: 89.99,
            currency: "$",

            image: "",

            worthItScore: 8.5,

            verdict:
                "Solid upgrade without overspending",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Gaming",
                    price: 59.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Tech",
                    price: 64.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "face-care-set",

            title: "Face Care Set",

            category: "Beauty",

            oldPrice: 49.99,
            currency: "$",

            image: "",

            worthItScore: 8.1,

            verdict:
                "Good savings on a complete set",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Beauty",
                    price: 34.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Care",
                    price: 37.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "yoga-mat",

            title: "Yoga Mat",

            category: "Sports",

            oldPrice: 39.99,
            currency: "$",

            image: "",

            worthItScore: 8.3,

            verdict:
                "Worth it for regular home workouts",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Fitness",
                    price: 27.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Sports",
                    price: 29.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "car-phone-holder",

            title: "Car Phone Holder",

            category: "Automotive",

            oldPrice: 29.99,
            currency: "$",

            image: "",

            worthItScore: 8.9,

            verdict:
                "Small cost with practical everyday value",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Auto",
                    price: 19.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Accessories",
                    price: 21.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "travel-backpack",

            title: "Travel Backpack",

            category: "Travel",

            oldPrice: 79.99,
            currency: "$",

            image: "",

            worthItScore: 8.6,

            verdict:
                "Good long-term value for frequent travelers",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Travel",
                    price: 54.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Bags",
                    price: 59.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "office-chair",

            title: "Office Chair",

            category: "Office",

            oldPrice: 249.99,
            currency: "$",

            image: "",

            worthItScore: 9.1,

            verdict:
                "Strong value for a long-term purchase",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Office",
                    price: 179.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Furniture",
                    price: 189.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        },


        {
            id: "tool-set",

            title: "Tool Set",

            category: "Tools",

            oldPrice: 119.99,
            currency: "$",

            image: "",

            worthItScore: 8.8,

            verdict:
                "Excellent value for a complete starter set",

            updatedAt: "Today",

            stores: [

                {
                    name: "Example Tools",
                    price: 84.99,
                    url: "https://example.com",
                    affiliate: true
                },

                {
                    name: "Example Hardware",
                    price: 89.99,
                    url: "https://example.com",
                    affiliate: true
                }

            ]
        }

    ];


    /* =================================================
       HELPERS
    ================================================= */

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

        return (
            currency || "$"
        ) + Number(value).toFixed(2);

    }


    function getStores(deal){

        if(
            !Array.isArray(deal.stores)
        ){
            return [];
        }

        return deal.stores
            .filter(
                store =>
                    store &&
                    Number.isFinite(store.price)
            )
            .sort(
                (a,b) =>
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
       OPEN DISCOUNTS
    ================================================= */

    window.openDiscounts = function(){

        const homePage =
            document.getElementById("homePage");

        if(homePage){
            homePage.style.display = "none";
        }


        document
            .querySelectorAll(".app")
            .forEach(x =>
                x.classList.remove("active")
            );


        const weatherSection =
            document.getElementById("weatherSection");

        if(weatherSection){
            weatherSection.style.display = "none";
        }


        const newsSection =
            document.getElementById("newsSection");

        if(newsSection){
            newsSection.style.display = "none";
        }


        const settingsPanel =
            document.getElementById("settingsPanel");

        if(settingsPanel){
            settingsPanel.style.display = "none";
        }


        let container =
            document.getElementById(
                "discountsSection"
            );


        if(!container){

            container =
                document.createElement("section");

            container.id =
                "discountsSection";

            container.className =
                "discounts-section";


            const footer =
                document.querySelector("footer");


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


        renderDiscounts(container);


        container.style.display =
            "block";


        const navLinks =
            document.getElementById("navLinks");

        if(navLinks){
            navLinks.classList.remove("open");
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
       RENDER DISCOUNTS
    ================================================= */

    function renderDiscounts(container){

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


        const categories = [
            ...new Set(
                discounts
                    .map(deal => deal.category)
                    .filter(Boolean)
            )
        ];


        let html = `

            <div class="discounts-header">

                <div>

                    <h2>
                        🏷️ Today's Discounts
                    </h2>

                    <p>
                        Smart deals selected by Worth It
                    </p>

                    <small>
                        Updated ${escapeHTML(dateText)}
                    </small>

                </div>

            </div>


            <div class="discounts-filters">

                <button
                    type="button"
                    class="discount-filter active"
                    data-category="all"
                >
                    All
                </button>

                ${categories
                    .map(category => `

                        <button
                            type="button"
                            class="discount-filter"
                            data-category="${escapeHTML(category)}"
                        >
                            ${escapeHTML(category)}
                        </button>

                    `)
                    .join("")}

            </div>


            <div
                class="discounts-grid"
                id="discountsGrid"
            >

                ${discounts
                    .map(deal =>
                        createDealCard(deal)
                    )
                    .join("")}

            </div>

        `;


        container.innerHTML =
            html;


        setupDiscountFilters();

    }


    /* =================================================
       DEAL CARD
    ================================================= */

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


        const image =
            deal.image

            ? `
                <img
                    src="${escapeHTML(deal.image)}"
                    alt="${escapeHTML(deal.title)}"
                    class="discount-image"
                    loading="lazy"
                >
            `

            : `
                <div class="discount-image-placeholder">
                    🛍️
                </div>
            `;


        const score =
            Number.isFinite(
                deal.worthItScore
            )
                ? deal.worthItScore.toFixed(1)
                : "—";


        /* ---------------------------------------------
           BEST PRICE
        --------------------------------------------- */

        let bestStoreHTML = "";


        if(bestStore){

            bestStoreHTML = `

                <div class="discount-best-price-box">

                    <div class="discount-best-price-info">

                        <span class="discount-best-label">
                            BEST PRICE
                        </span>

                        <strong>
                            ${escapeHTML(
                                bestStore.name
                            )}
                        </strong>

                    </div>


                    <div class="discount-best-price-right">

                        <strong class="discount-best-price">
                            ${formatPrice(
                                bestStore.price,
                                deal.currency
                            )}
                        </strong>


                        <a
                            href="${escapeHTML(
                                bestStore.url
                            )}"
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            class="discount-buy-button discount-buy-button-primary"
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


        let otherStoresHTML = "";


        if(otherStores.length){

            otherStoresHTML = `

                <div class="discount-other-stores">

                    <div class="discount-other-title">
                        Other options
                    </div>


                    ${otherStores
                        .map(store => `

                            <div class="discount-store-row">

                                <strong class="discount-store-name">
                                    ${escapeHTML(
                                        store.name
                                    )}
                                </strong>


                                <div class="discount-store-action">

                                    <strong class="discount-store-price">
                                        ${formatPrice(
                                            store.price,
                                            deal.currency
                                        )}
                                    </strong>


                                    <a
                                        href="${escapeHTML(
                                            store.url
                                        )}"
                                        target="_blank"
                                        rel="noopener noreferrer sponsored"
                                        class="discount-buy-button"
                                    >
                                        Buy →
                                    </a>

                                </div>

                            </div>

                        `)
                        .join("")}

                </div>

            `;

        }


        /* ---------------------------------------------
           CARD
        --------------------------------------------- */

        return `

            <article
                class="discount-card"
                data-category="${escapeHTML(
                    deal.category
                )}"
            >


                <div class="discount-card-image">

                    ${image}


                    <span class="discount-badge">
                        -${discount}%
                    </span>

                </div>


                <div class="discount-card-content">


                    <div class="discount-card-meta">

                        <span class="discount-category">
                            ${escapeHTML(
                                deal.category
                            )}
                        </span>


                        <span class="discount-worth-it">

                            Worth It
                            <strong>
                                ${score}
                            </strong>/10

                        </span>

                    </div>


                    <h3 class="discount-title">

                        ${escapeHTML(
                            deal.title
                        )}

                    </h3>


                    <div class="discount-price-block">

                        <span class="discount-old-price">

                            ${formatPrice(
                                deal.oldPrice,
                                deal.currency
                            )}

                        </span>


                        <span class="discount-new-price">

                            ${formatPrice(
                                bestPrice,
                                deal.currency
                            )}

                        </span>

                    </div>


                    <div class="discount-savings">

                        You save

                        <strong>
                            ${formatPrice(
                                savings,
                                deal.currency
                            )}
                        </strong>

                    </div>


                    <div class="discount-verdict">

                        <div class="discount-verdict-title">

                            ✓ Our verdict

                        </div>


                        <p>

                            ${escapeHTML(
                                deal.verdict ||
                                "Good value at this price."
                            )}

                        </p>

                    </div>


                    <div class="discount-where-to-buy">

                        <div class="discount-where-title">

                            Where to buy

                        </div>


                        ${bestStoreHTML}


                        ${otherStoresHTML}

                    </div>


                    <div class="discount-updated">

                        Updated:
                        ${escapeHTML(
                            deal.updatedAt || "Today"
                        )}

                    </div>


                </div>

            </article>

        `;

    }


    /* =================================================
       FILTERS
    ================================================= */

    function setupDiscountFilters(){

        const buttons =
            document.querySelectorAll(
                ".discount-filter"
            );


        buttons.forEach(
            button => {

                button.addEventListener(
                    "click",
                    function(){

                        const category =
                            this.dataset.category;


                        buttons.forEach(
                            btn =>
                                btn.classList.remove(
                                    "active"
                                )
                        );


                        this.classList.add(
                            "active"
                        );


                        const grid =
                            document.getElementById(
                                "discountsGrid"
                            );


                        if(!grid){
                            return;
                        }


                        const filteredDeals =
                            category === "all"

                                ? discounts

                                : discounts.filter(
                                    deal =>
                                        deal.category === category
                                );


                        if(!filteredDeals.length){

                            grid.innerHTML = `

                                <article class="discount-card">

                                    <div class="discount-card-image">

                                        <div class="discount-image-placeholder">
                                            🛍️
                                        </div>

                                    </div>


                                    <div class="discount-card-content">

                                        <h3>
                                            No discounts available right now
                                        </h3>

                                    </div>

                                </article>

                            `;

                            return;
                        }


                        grid.innerHTML =
                            filteredDeals
                                .map(deal =>
                                    createDealCard(deal)
                                )
                                .join("");

                    }
                );

            }
        );

    }


    /* =================================================
       CLOSE DISCOUNTS
    ================================================= */

    window.closeDiscounts = function(){

        const container =
            document.getElementById(
                "discountsSection"
            );


        if(container){

            container.style.display =
                "none";

        }

    };


})();
