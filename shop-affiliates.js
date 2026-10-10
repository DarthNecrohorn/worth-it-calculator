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
        details: "Beauty and skincare products, plus selected fashion items. The current Worth It catalogue uses verified Stylevana affiliate links; destination eligibility can vary by item.",
        note: "Current Shop products use verified Stylevana affiliate links."
    },
    {
        id: "fntcase",
        name: "Shenzhen Feinuote Electronic Technology Co., Ltd.",
        categoryIds: ["phone-accessories"],
        icon: "📱",
        status: "products-connected",
        coverage: "Most of Europe & North America",
        details: "Phone cases and related phone accessories. Worth It imports selected products from the approved Awin feed; shipping is described as regional and the merchant does not publish a complete destination list.",
        note: "200 products are imported from the approved Awin feed. The merchant describes regional shipping coverage but does not publish a complete country list."
    },
    {
        id: "dowinx-eu",
        name: "Dowinx (EU)",
        categoryIds: ["gaming-office"],
        icon: "🎮",
        status: "products-connected",
        coverage: "Most of Europe",
        details: "Gaming and office seating for customers served by the EU programme. Selected products are imported from the approved Awin feed; listed destinations are representative rather than exhaustive.",
        note: "183 products are imported from the approved Awin feed. The listed shipping destinations are representative, not an exhaustive country list."
    },
    {
        id: "king-koil",
        name: "King Koil",
        categoryIds: ["sleep-mattresses"],
        icon: "🛏️",
        status: "ready-to-connect",
        coverage: "Mattresses & sleep products",
        details: "A potential source for mattresses and sleep-related products. Worth It will only list individual items after product information, affiliate tracking and shipping eligibility can be checked.",
        note: "Product availability will be verified item by item."
    },
    {
        id: "simple-project",
        name: "Shenzhen Cangyu Technology Co., Ltd.",
        categoryIds: ["bathroom-home"],
        icon: "🚿",
        status: "ready-to-connect",
        coverage: "Bathroom & home",
        details: "A potential source for bathroom and home products. No items will be listed until usable product data, tracked links and destination rules are verified.",
        note: "Simple Project products will be published only with verified destination rules."
    },
    {
        id: "giftlab",
        name: "Giftlab",
        categoryIds: ["personalized-gifts"],
        icon: "🎁",
        status: "products-connected",
        coverage: "Worldwide — most countries",
        details: "Personalized gifts for different occasions. Worth It currently lists selected products from the approved Awin feed. Shipping coverage is regional, and the displayed destination list is not exhaustive.",
        note: "200 personalized-gift products are live from the approved Awin feed. Shipping coverage is regional and the representative country list is not exhaustive."
    },
    {
        id: "personalhour",
        name: "PersonalHour",
        categoryIds: ["fitness-wellness"],
        icon: "🧘",
        status: "products-connected",
        coverage: "United States — all 50 states",
        details: "Fitness, Pilates and wellness products. Worth It currently lists selected products from the approved Awin feed. The stated US coverage is based on merchant policy; final delivery options may vary by item.",
        note: "200 fitness, Pilates and wellness products are live from the approved Awin feed. Shipping coverage is based on the merchant's official policy; final delivery options can vary by product."
    },
    {
        id: "toputure-us",
        name: "Toputure - US",
        categoryIds: ["fitness-wellness"],
        icon: "🏃",
        status: "offer-pending",
        cardStatus: "Code pending",
        cardSubtitle: "US programme · 10% code pending",
        coverage: "United States (US affiliate programme)",
        market: "United States (US affiliate programme)",
        programStatus: "Joined on Awin; product-feed integration and the discount code are not yet complete.",
        details: "Toputure sells at-home fitness equipment, including walking pads, treadmills and exercise bikes. Its US affiliate programme has welcomed Worth It. Product listings will be added only after product data and verified affiliate links are connected.",
        shopStatusDetail: "No Toputure products are live yet. Worth It has not yet connected product data and verified affiliate links for this programme.",
        specialOffer: {
            title: "Exclusive 10% discount code",
            statusLabel: "Code not issued yet",
            status: "pending",
            description: "Toputure has offered Worth It an exclusive 10% discount code for eligible Toputure products, excluding accessories. The actual code has not yet been issued to Worth It, so customers cannot redeem this offer through Worth It at this time."
        }
    },
    {
        id: "everblog-us",
        name: "Everblog US",
        categoryIds: ["family-tech"],
        icon: "📅",
        status: "ready-to-connect",
        coverage: "United States family calendar",
        details: "A family-tech source focused on calendar and family-organization products. It is being prepared for Worth It; products will be listed only after verified affiliate URLs and suitable product data are available.",
        note: "Awin source joined; products will be published only with verified affiliate URLs."
    },
    {
        id: "getout",
        name: "GetOut",
        categoryIds: ["family-experiences"],
        icon: "👨‍👩‍👧",
        status: "not-published",
        coverage: "Family entertainment & local experiences",
        details: "A family-entertainment and local-experiences source. It is not currently published in Worth It because the programme relationship is not active.",
        note: "Awin source is listed, but the current account relationship is not joined; no products will be published until access is active."
    },
    {
        id: "lunzo-hu",
        name: "Lunzo HU",
        categoryIds: ["fashion-accessories"],
        icon: "🇭🇺",
        status: "ready-to-connect",
        coverage: "Lunzo.hu product catalogue",
        details: "A fashion and accessories catalogue for the Hungarian market. Products will be added only when the feed and trackable affiliate links are available and checked.",
        note: "Awin source joined; product data feed will be used when available."
    },
    {
        id: "lunzo-pl",
        name: "Lunzo PL",
        categoryIds: ["fashion-accessories"],
        icon: "🇵🇱",
        status: "ready-to-connect",
        coverage: "Lunzo.pl product catalogue",
        details: "A fashion and accessories catalogue for the Polish market. Products will be added only when the feed and trackable affiliate links are available and checked.",
        note: "Awin source joined; product data feed will be used when available."
    },
    {
        id: "alison-us-ca",
        name: "Alison US CA",
        categoryIds: ["education-online-courses"],
        icon: "🎓",
        status: "products-connected",
        coverage: "Worldwide digital access",
        details: "Online learning and course products. Worth It currently lists selected products from the approved Awin feed. Access is digital, not physical shipping.",
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
