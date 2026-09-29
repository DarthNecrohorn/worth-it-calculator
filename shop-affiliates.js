/* =====================================================
   WORTH IT — AFFILIATE SHOP DATA
   Only products with a real affiliate URL are published.
===================================================== */

const SHOP_COUNTRIES = [
    { code: "AU", name: "Australia" },
    { code: "BR", name: "Brazil" },
    { code: "BG", name: "Bulgaria" },
    { code: "BN", name: "Brunei" },
    { code: "CA", name: "Canada" },
    { code: "CO", name: "Colombia" },
    { code: "HR", name: "Croatia" },
    { code: "CY", name: "Cyprus" },
    { code: "CZ", name: "Czech Republic" },
    { code: "DK", name: "Denmark" },
    { code: "EE", name: "Estonia" },
    { code: "FI", name: "Finland" },
    { code: "GR", name: "Greece" },
    { code: "HU", name: "Hungary" },
    { code: "IE", name: "Ireland" },
    { code: "IT", name: "Italy" },
    { code: "LV", name: "Latvia" },
    { code: "LT", name: "Lithuania" },
    { code: "MT", name: "Malta" },
    { code: "NL", name: "Netherlands" },
    { code: "NZ", name: "New Zealand" },
    { code: "NO", name: "Norway" },
    { code: "PH", name: "Philippines" },
    { code: "PL", name: "Poland" },
    { code: "PT", name: "Portugal" },
    { code: "RO", name: "Romania" },
    { code: "SG", name: "Singapore" },
    { code: "SK", name: "Slovakia" },
    { code: "SI", name: "Slovenia" },
    { code: "ZA", name: "South Africa" },
    { code: "ES", name: "Spain" },
    { code: "SE", name: "Sweden" },
    { code: "GB", name: "United Kingdom" },
    { code: "US", name: "United States" },
    { code: "VN", name: "Vietnam" }
];

const SHOP_CATEGORIES = [
    { id: "beauty-skincare", label: "Beauty & Skincare", icon: "💄" },
    { id: "phone-accessories", label: "Phone Accessories", icon: "📱" },
    { id: "gaming-office", label: "Gaming & Office", icon: "🎮" },
    { id: "sleep-mattresses", label: "Sleep & Mattresses", icon: "🛏️" },
    { id: "bathroom-home", label: "Bathroom & Home", icon: "🚿" },
    { id: "personalized-gifts", label: "Personalized Gifts", icon: "🎁" },
    { id: "fitness-wellness", label: "Fitness & Wellness", icon: "🧘" },
    { id: "family-experiences", label: "Family & Experiences", icon: "👨‍👩‍👧" },
    { id: "family-tech", label: "Family Tech", icon: "📅" },
    { id: "fashion-accessories", label: "Fashion & Accessories", icon: "👗" }
];

const SHOP_PARTNERS = [
    {
        id: "stylevana",
        name: "Stylevana",
        categoryIds: ["beauty-skincare", "fashion-accessories"],
        icon: "💄",
        status: "products-connected",
        coverage: "35 currently verified shipping destinations",
        note: "Current Shop products use verified Stylevana affiliate links."
    },
    {
        id: "fntcase",
        name: "Shenzhen Feinuote Electronic Technology Co., Ltd.",
        categoryIds: ["phone-accessories"],
        icon: "📱",
        status: "ready-to-connect",
        coverage: "Mobile phone cases & accessories",
        note: "Awin source identified; only products with verified affiliate URLs will be published."
    },
    {
        id: "dowinx-eu",
        name: "Dowinx (EU)",
        categoryIds: ["gaming-office"],
        icon: "🎮",
        status: "ready-to-connect",
        coverage: "European gaming & office chairs",
        note: "Awin source identified; country availability will be attached per product."
    },
    {
        id: "king-koil",
        name: "King Koil",
        categoryIds: ["sleep-mattresses"],
        icon: "🛏️",
        status: "ready-to-connect",
        coverage: "Mattresses & sleep products",
        note: "Product availability will be verified item by item."
    },
    {
        id: "simple-project",
        name: "Shenzhen Cangyu Technology Co., Ltd.",
        categoryIds: ["bathroom-home"],
        icon: "🚿",
        status: "ready-to-connect",
        coverage: "Bathroom & home",
        note: "Simple Project products will be published only with verified destination rules."
    },
    {
        id: "giftlab",
        name: "Giftlab",
        categoryIds: ["personalized-gifts", "fashion-accessories"],
        icon: "🎁",
        status: "ready-to-connect",
        coverage: "Personalized gifts, fashion & accessories",
        note: "Products will be curated before publication."
    },
    {
        id: "personalhour",
        name: "PersonalHour",
        categoryIds: ["fitness-wellness"],
        icon: "🧘",
        status: "ready-to-connect",
        coverage: "Fitness, Pilates & wellness",
        note: "Destination availability will be attached per product."
    },
    {
        id: "everblog-us",
        name: "Everblog US",
        categoryIds: ["family-tech"],
        icon: "📅",
        status: "ready-to-connect",
        coverage: "United States",
        note: "US-focused program; only approved offers will be published."
    },
    {
        id: "getout",
        name: "GetOut",
        categoryIds: ["family-experiences"],
        icon: "👨‍👩‍👧",
        status: "not-published",
        coverage: "Family experiences in supported US states",
        note: "Kept out of Shop until the partnership is accepted and a tracked offer is connected."
    }
];

/*
 * Current Stylevana destination coverage verified against
 * Stylevana's country-specific shipping pages on 2026-09-29.
 * This is merchant-level coverage; the checkout remains the
 * final authority for a specific item and address.
 */
const STYLEVANA_SHIPPING_COUNTRIES = [
    "AU", "BR", "BN", "BG", "CA", "CO", "HR", "CY", "CZ", "DK",
    "EE", "FI", "GR", "HU", "IE", "IT", "LV", "LT",
    "MT", "NL", "NZ", "NO", "PH", "PL", "PT", "RO", "SG", "SK",
    "SI", "ZA", "ES", "SE", "GB", "US", "VN"
];

const affiliateProducts = {

    /* =================================================
       BEAUTY & SKINCARE — STYLEVANA
    ================================================= */

    Beauty: [
        {
            id: "skin1004-hyalu-cica-sun-serum",
            title:
                "SKIN1004 Madagascar Centella Hyalu-Cica Water-Fit Sun Serum SPF50+ PA++++ Twin Pack",
            oldPrice: 27.00,
            price: 18.04,
            currency: "$",
            store: "Stylevana",
            partnerId: "stylevana",
            category: "beauty-skincare",
            categoryLabel: "Beauty & Skincare",
            image:
                "https://sv9-cdn.stylevana.com/media/catalog/product/cache/7e00eb21d3013c69d32459d0d98e2fbf/s/k/skin1004-madagascar-centella-hyalu-cica-water-fit-sun-serum-spf50-pa-twin-pack-50ml-2ea-859.jpg",
            affiliateUrl: "https://tidd.ly/46mlVcw",
            availability: {
                type: "shipping",
                countries: STYLEVANA_SHIPPING_COUNTRIES,
                verifiedDate: "2026-09-29",
                note:
                    "Merchant shipping coverage was checked against current Stylevana destination pages. Final item availability, shipping cost and checkout eligibility can vary."
            },
            delivery: {
                note:
                    "Delivery time varies by destination, stock status and shipping method."
            },
            stockStatus: {
                state: "in-stock",
                storefront: "US",
                checkedDate: "2026-09-24"
            },
            updatedAt: "September 29, 2026"
        },

        {
            id: "beauty-of-joseon-relief-sun-set",
            title:
                "BEAUTY OF JOSEON - Relief Sun : Rice + Probiotics / Niacinamide Set SPF50+ PA++++ - 50ml*2",
            oldPrice: 36.00,
            price: 23.40,
            currency: "$",
            store: "Stylevana",
            partnerId: "stylevana",
            category: "beauty-skincare",
            categoryLabel: "Beauty & Skincare",
            image:
                "https://sv9-cdn.stylevana.com/media/catalog/product/cache/7e00eb21d3013c69d32459d0d98e2fbf/b/e/beauty-of-joseon-relief-sun-rice-probiotics-niacinamide-set-spf50-pa-50ml-2-218.png",
            affiliateUrl: "https://tidd.ly/4rcWH9W",
            availability: {
                type: "shipping",
                countries: STYLEVANA_SHIPPING_COUNTRIES,
                verifiedDate: "2026-09-29",
                note:
                    "Merchant shipping coverage was checked against current Stylevana destination pages. Final item availability, shipping cost and checkout eligibility can vary."
            },
            delivery: {
                note:
                    "Delivery time varies by destination, stock status and shipping method."
            },
            updatedAt: "September 29, 2026"
        }
    ]
};
