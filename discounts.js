/* =====================================================
   DISCOUNTS
===================================================== */

(function(){

    "use strict";

    /* =================================================
       TEST DEAL DATA
       Ovo ćemo kasnije zameniti pravim dnevnim podacima.
    ================================================= */

    const discounts = [

    {
        title: "Wireless Headphones",
        store: "Example Store",
        category: "Electronics",
        oldPrice: 99.99,
        price: 69.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Smart Watch",
        store: "Example Shop",
        category: "Electronics",
        oldPrice: 149.99,
        price: 99.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Running Shoes",
        store: "Example Sports",
        category: "Fashion",
        oldPrice: 120,
        price: 79.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Coffee Machine",
        store: "Example Home",
        category: "Home",
        oldPrice: 199.99,
        price: 139.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Gaming Keyboard",
        store: "Example Gaming",
        category: "Gaming",
        oldPrice: 89.99,
        price: 59.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Face Care Set",
        store: "Example Beauty",
        category: "Beauty",
        oldPrice: 49.99,
        price: 34.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Yoga Mat",
        store: "Example Fitness",
        category: "Sports",
        oldPrice: 39.99,
        price: 27.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Car Phone Holder",
        store: "Example Auto",
        category: "Automotive",
        oldPrice: 29.99,
        price: 19.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Travel Backpack",
        store: "Example Travel",
        category: "Travel",
        oldPrice: 79.99,
        price: 54.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Office Chair",
        store: "Example Office",
        category: "Office",
        oldPrice: 249.99,
        price: 179.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Kids Building Set",
        store: "Example Kids",
        category: "Kids",
        oldPrice: 59.99,
        price: 39.99,
        currency: "$",
        image: "",
        url: "https://example.com"
    },

    {
        title: "Tool Set",
        store: "Example Tools",
        category: "Tools",
        oldPrice: 119.99,
        price: 84.99,
        currency: "$",
        image: "",
        url: "https://example.com"
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


    function formatPrice(value, currency){

        return (
            currency || "$"
        ) + Number(value).toFixed(2);

    }


    /* =================================================
   OPEN DISCOUNTS
================================================= */

window.openDiscounts = function(){

    /* ---------------------------------------------
       HIDE OTHER SECTIONS
    --------------------------------------------- */

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


    /* ---------------------------------------------
       GET / CREATE DISCOUNTS SECTION
    --------------------------------------------- */

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


    /* ---------------------------------------------
       RENDER
    --------------------------------------------- */

    renderDiscounts(
        container
    );


    /* ---------------------------------------------
       SHOW
    --------------------------------------------- */

    container.style.display =
        "block";


    /* ---------------------------------------------
       CLOSE NAVIGATION
    --------------------------------------------- */

    const navLinks =
        document.getElementById(
            "navLinks"
        );

    if(navLinks){
        navLinks.classList.remove("open");
    }


    /* ---------------------------------------------
       SCROLL TO TOP
    --------------------------------------------- */

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


        let html = `

            <div class="discounts-header">

                <div>

                    <h2>
                        🏷️ Today's Discounts
                    </h2>

                    <p>
                        Today's selected deals
                    </p>

                    <small>
                        Updated ${dateText}
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

    ${[
        ...new Set(
            discounts
                .map(deal => deal.category)
                .filter(Boolean)
        )
    ]
        .map(category => `

            <button
                type="button"
                class="discount-filter"
                data-category="${category}"
            >
                ${category}
            </button>

        `)
        .join("")}

</div>


            <div
                class="discounts-grid"
                id="discountsGrid"
            >

        `;


        discounts
        .forEach(
          deal => {

            html +=
                createDealCard(
                    deal
                );

        }
    );


        html += `

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

        const discount =
            calculateDiscount(
                deal.oldPrice,
                deal.price
            );


        const image =
            deal.image
            ? `
                <img
                    src="${deal.image}"
                    alt="${deal.title}"
                    class="discount-image"
                >
              `
            : `
                <div class="discount-image-placeholder">
                    🛍️
                </div>
              `;


        return `

            <article
                class="discount-card"
                data-category="${deal.category}"
            >

                <div class="discount-card-image">

                    ${image}

                    <span class="discount-badge">
                        -${discount}%
                    </span>

                </div>


                <div class="discount-card-content">

                    <div class="discount-store">
                        ${deal.store}
                    </div>


                    <h3>
                        ${deal.title}
                    </h3>


                    <div class="discount-category">
                        ${deal.category}
                    </div>


                    <div class="discount-prices">

                        <span class="discount-old-price">
                            ${formatPrice(
                                deal.oldPrice,
                                deal.currency
                            )}
                        </span>

                        <span class="discount-new-price">
                            ${formatPrice(
                                deal.price,
                                deal.currency
                            )}
                        </span>

                    </div>


                    <a
                        href="${deal.url}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="discount-deal-button"
                    >
                        View Deal →
                    </a>

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


                   const visibleDeals =
                       category === "all"
                       ? filteredDeals
                       : filteredDeals.slice(
                       0,
                       8
                 );

                   if(category !== "all"){

                       const missing =
                       8 - visibleDeals.length;

                       for(let i = 0; i < missing; i++){

                       visibleDeals.push(null);

                       }

                 }
                   
                    grid.innerHTML = "";


                    visibleDeals.forEach(
                        deal => {

                            grid.innerHTML +=
                                createDealCard(
                                    deal
                                );

                        }
                    );

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
