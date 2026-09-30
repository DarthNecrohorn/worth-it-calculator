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
        coverage: "United States family calendar",
        note: "Awin source joined; products will be published only with verified affiliate URLs."
    },
    {
        id: "getout",
        name: "GetOut",
        categoryIds: ["family-experiences"],
        icon: "👨‍👩‍👧",
        status: "not-published",
        coverage: "Family entertainment & local experiences",
        note: "Awin source is listed, but the current account relationship is not joined; no products will be published until access is active."
    },
    {
        id: "lunzo-hu",
        name: "Lunzo HU",
        categoryIds: ["fashion-accessories"],
        icon: "🇭🇺",
        status: "ready-to-connect",
        coverage: "Lunzo.hu product catalogue",
        note: "Awin source joined; product data feed will be used when available."
    },
    {
        id: "lunzo-pl",
        name: "Lunzo PL",
        categoryIds: ["fashion-accessories"],
        icon: "🇵🇱",
        status: "ready-to-connect",
        coverage: "Lunzo.pl product catalogue",
        note: "Awin source joined; product data feed will be used when available."
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

    /* Stylevana products are supplied exclusively by the automatic Awin feed. */
};
