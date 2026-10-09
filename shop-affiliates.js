/* =====================================================
   WORTH IT — AFFILIATE SHOP DATA
   Only products with a real affiliate URL are published.
===================================================== */

const SHOP_COUNTRIES = [
    { code: "AE", name: "United Arab Emirates" },
    { code: "AU", name: "Australia" },
    { code: "AT", name: "Austria" },
    { code: "BE", name: "Belgium" },
    { code: "BR", name: "Brazil" },
    { code: "BG", name: "Bulgaria" },
    { code: "BN", name: "Brunei" },
    { code: "CA", name: "Canada" },
    { code: "CL", name: "Chile" },
    { code: "CO", name: "Colombia" },
    { code: "HR", name: "Croatia" },
    { code: "CY", name: "Cyprus" },
    { code: "CZ", name: "Czech Republic" },
    { code: "DK", name: "Denmark" },
    { code: "EE", name: "Estonia" },
    { code: "FI", name: "Finland" },
    { code: "FR", name: "France" },
    { code: "DE", name: "Germany" },
    { code: "GR", name: "Greece" },
    { code: "HK", name: "Hong Kong" },
    { code: "HU", name: "Hungary" },
    { code: "IE", name: "Ireland" },
    { code: "IL", name: "Israel" },
    { code: "IT", name: "Italy" },
    { code: "LV", name: "Latvia" },
    { code: "LT", name: "Lithuania" },
    { code: "LU", name: "Luxembourg" },
    { code: "MY", name: "Malaysia" },
    { code: "MT", name: "Malta" },
    { code: "MX", name: "Mexico" },
    { code: "NL", name: "Netherlands" },
    { code: "NZ", name: "New Zealand" },
    { code: "NO", name: "Norway" },
    { code: "PE", name: "Peru" },
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
    { code: "CH", name: "Switzerland" },
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
    { id: "fashion-accessories", label: "Fashion & Accessories", icon: "👗" },
    { id: "education-online-courses", label: "Education & Online Courses", icon: "🎓" }
];

const SHOP_PARTNERS = [
    {
        id: "stylevana",
        name: "Stylevana",
        categoryIds: ["beauty-skincare", "fashion-accessories"],
        icon: "💄",
        status: "products-connected",
        coverage: "48 currently verified shipping destinations",
        note: "Current Shop products use verified Stylevana affiliate links."
    },
    {
        id: "fntcase",
        name: "Shenzhen Feinuote Electronic Technology Co., Ltd.",
        categoryIds: ["phone-accessories"],
        icon: "📱",
        status: "products-connected",
        coverage: "Most of Europe & North America",
        note: "200 products are imported from the approved Awin feed. The merchant describes regional shipping coverage but does not publish a complete country list."
    },
    {
        id: "dowinx-eu",
        name: "Dowinx (EU)",
        categoryIds: ["gaming-office"],
        icon: "🎮",
        status: "products-connected",
        coverage: "Most of Europe",
        note: "183 products are imported from the approved Awin feed. The listed shipping destinations are representative, not an exhaustive country list."
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
        categoryIds: ["personalized-gifts"],
        icon: "🎁",
        status: "products-connected",
        coverage: "Worldwide — most countries",
        note: "200 personalized-gift products are live from the approved Awin feed. Shipping coverage is regional and the representative country list is not exhaustive."
    },
    {
        id: "personalhour",
        name: "PersonalHour",
        categoryIds: ["fitness-wellness"],
        icon: "🧘",
        status: "products-connected",
        coverage: "United States — all 50 states",
        note: "200 fitness, Pilates and wellness products are live from the approved Awin feed. Shipping coverage is based on the merchant's official policy; final delivery options can vary by product."
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
    },
    {
        id: "alison-us-ca",
        name: "Alison US CA",
        categoryIds: ["education-online-courses"],
        icon: "🎓",
        status: "products-connected",
        coverage: "Worldwide digital access",
        note: "200 online-course products are live from the approved Awin feed. This is digital access, not physical shipping."
    }
];

/*
 * Current Stylevana destination coverage verified against
 * Stylevana's country-specific shipping pages on 2026-09-29.
 * This is merchant-level coverage; the checkout remains the
 * final authority for a specific item and address.
 */
const STYLEVANA_SHIPPING_COUNTRIES = [
    "AU", "AT", "BE", "BR", "BN", "BG", "CA", "CL", "CO", "HR",
    "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HK", "HU",
    "IE", "IL", "IT", "LV", "LT", "LU", "MY", "MT", "MX", "NL",
    "NZ", "NO", "PH", "PL", "PT", "RO", "SG", "SK", "SI", "ZA",
    "ES", "SE", "CH", "GB", "AE", "US", "VN", "PE"
];

const affiliateProducts = {

    /* =================================================
       BEAUTY & SKINCARE — STYLEVANA
    ================================================= */

    /* Stylevana products are supplied exclusively by the automatic Awin feed. */
};
