import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const OUTPUT =
  "data/shop-products-awin.json";

const OUTPUT_DIR =
  "data/shop-products-awin";

const MAX_FEED_BYTES = 120 * 1024 * 1024;
const MAX_PRODUCTS_PER_CATEGORY = 200;

/*
 * Central merchant shipping profiles.
 *
 * Stylevana's current official "Where do you ship to?" support page lists
 * the destinations below. This is merchant-level verified coverage, not a
 * promise that every individual SKU is eligible for every destination.
 *
 * Source:
 * https://stylevana.zendesk.com/hc/en-us/articles/43813531311897-Where-do-you-ship-to
 */
const SHIPPING_PROFILES_PATH =
  "data/shop-shipping-profiles.json";

const SHIPPING_PROFILE_DATA =
  JSON.parse(
    await fs.readFile(
      SHIPPING_PROFILES_PATH,
      "utf8"
    )
  );

const SHIPPING_PROFILES =
  SHIPPING_PROFILE_DATA?.profiles || {};

const STYLEVANA_SHIPPING_COUNTRIES =
  Array.isArray(
    SHIPPING_PROFILES.stylevana?.countries
  )
    ? SHIPPING_PROFILES.stylevana.countries
    : [];

const ISO_COUNTRY_CODES = new Set([
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX",
  "AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ",
  "BR","BS","BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK",
  "CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM",
  "DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR",
  "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS",
  "GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","ID","IE","IL","IM","IN",
  "IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN",
  "KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV",
  "LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ",
  "MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI",
  "NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM",
  "PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC",
  "SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV",
  "SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR",
  "TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI",
  "VN","VU","WF","WS","YE","YT","ZA","ZM","ZW"
]);

function extractCountryCodes(value) {
  if (value === undefined || value === null) return [];

  const codes = [];
  const add = code => {
    const normalized = String(code || "").trim().toUpperCase();
    if (ISO_COUNTRY_CODES.has(normalized)) codes.push(normalized);
  };

  const visit = item => {
    if (item === null || item === undefined) return;

    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }

    if (typeof item === "object") {
      for (const key of ["country", "country_code", "countryCode"]) {
        if (item[key]) add(item[key]);
      }
      for (const key of ["shipping", "destinations", "included_destination", "included_country"]) {
        if (item[key]) visit(item[key]);
      }
      return;
    }

    for (const token of String(item).split(/[,;|\s]+/)) {
      const match = token.match(/^[A-Za-z]{2}$/);
      if (match) add(match[0]);
    }
  };

  if (typeof value === "object") {
    visit(value);
    return [...new Set(codes)];
  }

  const text = String(value).trim();
  if (!text) return [];

  try {
    visit(JSON.parse(text));
  } catch {
    visit(text);
  }

  return [...new Set(codes)];
}

function validateShippingProfiles(profiles) {
  if (!profiles || typeof profiles !== "object") {
    throw new Error("Shipping profiles are missing or invalid.");
  }

  for (const [partnerId, profile] of Object.entries(profiles)) {
    const type = String(profile?.type || "");

    if (!["exact", "regional", "digital"].includes(type)) {
      throw new Error(
        `Invalid shipping profile type for ${partnerId}: ${type || "missing"}`
      );
    }

    const countries = Array.isArray(profile?.countries)
      ? profile.countries
      : [];

    const normalized = countries.map(code =>
      String(code || "").trim().toUpperCase()
    );

    if (new Set(normalized).size !== normalized.length) {
      throw new Error(
        `Duplicate shipping countries in profile: ${partnerId}`
      );
    }

    for (const code of normalized) {
      if (!ISO_COUNTRY_CODES.has(code)) {
        throw new Error(
          `Invalid ISO country code in shipping profile ${partnerId}: ${code}`
        );
      }
    }

    if (type === "exact" && !normalized.length) {
      throw new Error(
        `Exact shipping profile has no countries: ${partnerId}`
      );
    }

    if (type === "digital" && normalized.length) {
      throw new Error(
        `Digital availability profile should not contain physical shipping countries: ${partnerId}`
      );
    }

    if (!String(profile?.sourceLabel || "").trim()) {
      throw new Error(
        `Shipping profile has no source label: ${partnerId}`
      );
    }

    if (!String(profile?.note || "").trim()) {
      throw new Error(
        `Shipping profile has no note: ${partnerId}`
      );
    }
  }
}

validateShippingProfiles(SHIPPING_PROFILES);

const SHIPPING_PARSER_SMOKE_TESTS = [
  {
    input: "US, CA|GB",
    expected: ["US", "CA", "GB"]
  },
  {
    input: '{"country":"DE"}',
    expected: ["DE"]
  },
  {
    input: {
      shipping: [
        { country: "FR" },
        { country_code: "RS" }
      ]
    },
    expected: ["FR", "RS"]
  }
];

for (const test of SHIPPING_PARSER_SMOKE_TESTS) {
  const actual = extractCountryCodes(test.input);

  if (
    actual.length !== test.expected.length ||
    actual.some(code => !test.expected.includes(code))
  ) {
    throw new Error(
      "Shipping country parser smoke test failed."
    );
  }
}

function resolveProductShipping(row) {
  /*
   * Awin enhanced Google-format feeds support a product-level shipping
   * object with a required ISO country field. Hosted CSV feeds can also
   * expose advertiser-mapped/custom destination fields.
   *
   * Only positive country evidence is used here. Restriction prose alone
   * cannot safely be converted into a complete destination list.
   */
  const candidateKeys = [
    "shipping",
    "shipping_countries",
    "shipping_country",
    "shipping_destination",
    "shipping_destinations",
    "included_destination",
    "included_country",
    "included_countries"
  ];

  const countries = [
    ...new Set(
      candidateKeys.flatMap(key =>
        extractCountryCodes(row[key])
      )
    )
  ];

  if (!countries.length) return null;

  return {
    type: "exact",
    countries,
    coverageLabel: "",
    sourceLabel: "Awin product shipping data",
    sourceUrl: "",
    verifiedAt: "",
    note:
      "Shipping destinations were taken from product-level data supplied through the Awin feed. Merchant checkout restrictions may still apply."
  };
}

function resolveShipping(feed, row) {
  /*
   * One resolver is used for every Awin product. The strongest available
   * source wins:
   *
   *   1) product-level country data,
   *   2) verified merchant profile,
   *   3) explicitly marked exact merchant configuration,
   *   4) unknown.
   *
   * Legacy programme-region fallbacks are deliberately NOT treated as
   * exact country coverage.
   */
  const productShipping = resolveProductShipping(row);

  if (productShipping) {
    return productShipping;
  }

  const profile = SHIPPING_PROFILES[feed.partnerId];

  if (profile) {
    return {
      type: profile.type || "exact",
      countries: [...new Set(profile.countries || [])],
      coverageLabel: profile.coverageLabel || "",
      sourceLabel: profile.sourceLabel,
      sourceUrl: profile.sourceUrl || "",
      verifiedAt: profile.verifiedAt || "",
      note: profile.note
    };
  }

  if (
    feed.shippingCountries?.length &&
    feed.shippingCountriesAreExact === true
  ) {
    return {
      type: "exact-configured",
      countries: [...new Set(feed.shippingCountries)],
      coverageLabel: "",
      sourceLabel: "Merchant shipping configuration",
      sourceUrl: feed.shippingSourceUrl || "",
      verifiedAt: feed.shippingVerifiedAt || "",
      note:
        "This exact country coverage was explicitly configured for the merchant. Final product and checkout eligibility may still vary."
    };
  }

  return {
    type: "unknown",
    countries: [],
    coverageLabel: "",
    sourceLabel: "No verified shipping destination",
    sourceUrl: "",
    verifiedAt: "",
    note:
      "No reliable country-level or regional shipping coverage is available for this product or merchant."
  };
}

/*
 * The importer keeps at most 200 products per Shop category. With the
 * current Shop category set, the resulting snapshot remains well below
 * Cloudflare Pages' 25 MiB single-asset limit.
 */

const FEEDS = [
  {
    partnerId: "stylevana",
    name: "Stylevana",
    category: "beauty-skincare",
    env: "AWIN_STYLEVANA_FEED_URL",
    shippingCountries: STYLEVANA_SHIPPING_COUNTRIES
  },
  {
    partnerId: "fntcase",
    name: "Shenzhen Feinuote Electronic Technology Co., Ltd.",
    category: "phone-accessories",
    env: "AWIN_FNTCASE_FEED_URL",
    shippingCountries: []
  },
  {
    partnerId: "dowinx-eu",
    name: "Dowinx (EU)",
    category: "gaming-office",
    env: "AWIN_DOWINX_EU_FEED_URL",
    shippingCountries: []
  },
  {
    partnerId: "king-koil",
    name: "King Koil",
    category: "sleep-mattresses",
    env: "AWIN_KING_KOIL_FEED_URL",
    shippingCountries: []
  },
  {
    partnerId: "simple-project",
    name: "Shenzhen Cangyu Technology Co., Ltd.",
    category: "bathroom-home",
    env: "AWIN_SIMPLE_PROJECT_FEED_URL",
    shippingCountries: ["US"]
  },
  {
    partnerId: "giftlab",
    name: "Giftlab",
    category: "personalized-gifts",
    env: "AWIN_GIFTLAB_FEED_URL",
    shippingCountries: []
  },
  {
    partnerId: "personalhour",
    name: "PersonalHour",
    category: "fitness-wellness",
    env: "AWIN_PERSONALHOUR_FEED_URL",
    shippingCountries: []
  },
  {
    partnerId: "everblog-us",
    name: "Everblog US",
    category: "family-tech",
    env: "AWIN_EVERBLOG_US_FEED_URL",
    shippingCountries: ["US"]
  },
  {
    partnerId: "getout",
    name: "GetOut",
    category: "family-experiences",
    env: "AWIN_GETOUT_FEED_URL",
    shippingCountries: []
  },
  {
    partnerId: "lunzo-hu",
    name: "Lunzo HU",
    category: "fashion-accessories",
    env: "AWIN_LUNZO_HU_FEED_URL",
    shippingCountries: ["HU"]
  },
  {
    partnerId: "lunzo-pl",
    name: "Lunzo PL",
    category: "fashion-accessories",
    env: "AWIN_LUNZO_PL_FEED_URL",
    shippingCountries: ["PL"]
  },
  {
    partnerId: "alison-us-ca",
    name: "Alison US CA",
    category: "education-online-courses",
    env: "AWIN_ALISON_US_CA_FEED_URL",
    shippingCountries: []
  }
]

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();
  if (!text) return null;

  const normalized =
    /,\d{1,2}$/.test(text) && !/\.\d/.test(text)
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,(?=\d{3}(?:\D|$))/g, "");

  const number = Number(
    normalized.replace(/[^0-9.+-]/g, "")
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") continue;

    field += char;
  }

  row.push(field);

  if (row.some(cell => cell !== "")) {
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map(header =>
    normalizeText(header).toLowerCase()
  );

  return rows.slice(1).map(values => {
    const object = {};
    headers.forEach((header, index) => {
      object[header] = values[index] ?? "";
    });
    return object;
  });
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }
  return "";
}

function categoryFor(feed, row) {
  const text = normalizeKey(
    [
      row.merchant_category,
      row.category_name,
      row.product_name
    ].join(" ")
  );

  if (
    feed.partnerId === "stylevana" &&
    /(fashion|clothing|apparel|shoes|bags|accessories)/.test(text)
  ) {
    return "fashion-accessories";
  }

  return feed.category;
}

function toProduct(row, feed, importedAt) {
  const title = normalizeText(
    firstValue(row, ["product_name", "title"])
  );

  const affiliateUrl = normalizeText(
    firstValue(row, [
      "aw_deep_link",
      "awin_deep_link",
      "deep_link"
    ])
  );

  const image = normalizeText(
    firstValue(row, [
      "merchant_image_url",
      "aw_image_url",
      "large_image",
      "aw_thumb_url",
      "image_url",
      "image_link"
    ])
  );

  const feedPrice = parseNumber(
    firstValue(row, ["search_price", "price"])
  );

  const feedSalePrice = parseNumber(
    firstValue(row, ["sale_price"])
  );

  const storePrice = parseNumber(
    firstValue(row, ["store_price"])
  );

  const rrpPrice = parseNumber(
    firstValue(row, [
      "rrp_price",
      "product_price_old"
    ])
  );

  const price =
    Number.isFinite(feedSalePrice) &&
    Number.isFinite(feedPrice) &&
    feedSalePrice > 0 &&
    feedSalePrice < feedPrice
      ? feedSalePrice
      : feedPrice;

  let regularPrice = feedPrice;

  if (
    Number.isFinite(storePrice) &&
    Number.isFinite(price) &&
    storePrice > price
  ) {
    regularPrice = storePrice;
  } else if (
    Number.isFinite(rrpPrice) &&
    Number.isFinite(price) &&
    rrpPrice > price
  ) {
    regularPrice = rrpPrice;
  }

  const onDiscount =
    Number.isFinite(price) &&
    Number.isFinite(regularPrice) &&
    price > 0 &&
    regularPrice > price;

  if (
    !title ||
    !affiliateUrl ||
    !/^https?:\/\//i.test(affiliateUrl) ||
    !image ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return null;
  }

  const oldPrice = onDiscount
    ? regularPrice
    : price;

  const savings =
    onDiscount
      ? oldPrice - price
      : 0;

  const popularityScore =
    onDiscount && oldPrice > 0
      ? ((oldPrice - price) / oldPrice) * 200
      : 0;

  const awProductId = normalizeText(
    firstValue(row, [
      "aw_product_id",
      "merchant_product_id",
      "id"
    ])
  );

  return {
    id:
      awProductId
        ? "awin-" + feed.partnerId + "-" + awProductId
        : "awin-" +
          feed.partnerId +
          "-" +
          encodeURIComponent(affiliateUrl),

    title,
    price: Number(price.toFixed(2)),
    oldPrice: Number(oldPrice.toFixed(2)),
    currency:
      normalizeText(
        firstValue(row, ["currency"])
      ) || "USD",
    image,
    affiliateUrl,
    merchantUrl:
      normalizeText(
        firstValue(row, ["merchant_deep_link"])
      ),
    store: feed.name,
    partnerId: feed.partnerId,
    category: categoryFor(feed, row),
    stockStatus:
      normalizeText(
        firstValue(row, [
          "stock_status",
          "in_stock"
        ])
      ) || "unknown",
    popularityScore,
    productUpdatedAt:
      normalizeText(
        firstValue(row, ["last_updated"])
      ) || importedAt,
    isOnDiscount: onDiscount,
    regularPrice: Number(oldPrice.toFixed(2)),
    salePrice:
      onDiscount
        ? Number(price.toFixed(2))
        : null,
    savings: Number(savings.toFixed(2)),
    savingsPercent:
      onDiscount && oldPrice > 0
        ? Number(
            (savings / oldPrice * 100).toFixed(2)
          )
        : 0,
    salePriceEffectiveDate: null,
    ...(() => {
      const shipping = resolveShipping(feed, row);
      return {
        shippingCountries: shipping.countries,
        shippingCoverageType: shipping.type,
        shippingCoverageLabel: shipping.coverageLabel,
        shippingSourceLabel: shipping.sourceLabel,
        shippingSourceUrl: shipping.sourceUrl,
        shippingVerifiedAt: shipping.verifiedAt,
        shippingNote: shipping.note
      };
    })(),
    awProductId,
    merchantProductId:
      normalizeText(
        firstValue(row, ["merchant_product_id"])
      ),
    brandName:
      normalizeText(
        firstValue(row, [
          "brand_name",
          "brand"
        ])
      )
  };
}

function dedupe(products) {
  const map = new Map();

  for (const product of products) {
    const key =
      normalizeKey(product.affiliateUrl) ||
      normalizeKey(
        [product.partnerId, product.title].join(" ")
      );

    if (!key) continue;

    const existing = map.get(key);

    if (
      !existing ||
      product.popularityScore >
        existing.popularityScore
    ) {
      map.set(key, product);
    }
  }

  return [...map.values()];
}

async function downloadFeed(url) {
  const response = await fetch(url, {
    headers: {
      "Accept":
        "text/csv, text/plain, application/gzip, */*",
      "User-Agent":
        "Worth-It-Shop-Awin-Importer/1.0"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      "HTTP " +
        response.status +
        (body
          ? ": " + normalizeText(body).slice(0, 300)
          : "")
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (buffer.byteLength > MAX_FEED_BYTES) {
    throw new Error(
      "Feed exceeds safe import size."
    );
  }

  if (
    buffer.length >= 2 &&
    buffer[0] === 0x1f &&
    buffer[1] === 0x8b
  ) {
    return gunzipSync(buffer).toString("utf8");
  }

  return buffer.toString("utf8");
}

const importedAt =
  new Date().toISOString();

const products = [];
const feedStatus = [];

for (const feed of FEEDS) {
  const url =
    process.env[feed.env] || "";

  if (!url) {
    feedStatus.push({
      partnerId: feed.partnerId,
      status: "not-configured",
      products: 0
    });
    continue;
  }

  try {
    const csv = await downloadFeed(url);
    const rows = parseCSV(csv);

    const feedProducts = rows
      .map(row =>
        toProduct(
          row,
          feed,
          importedAt
        )
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.popularityScore -
          a.popularityScore
      )
      ;

    products.push(...feedProducts);

    feedStatus.push({
      partnerId: feed.partnerId,
      advertiserId: feed.advertiserId,
      status: "loaded",
      rows: rows.length,
      products: feedProducts.length
    });
  } catch (error) {
    feedStatus.push({
      partnerId: feed.partnerId,
      advertiserId: feed.advertiserId,
      status: "error",
      error: String(
        error?.message || error
      ).slice(0, 500),
      products: 0
    });
  }
}

const rankedProducts =
  dedupe(products)
    .sort(
      (a, b) =>
        b.popularityScore -
        a.popularityScore
    );

/*
 * Keep the catalogue broad across every connected programme while
 * preventing the browser from receiving tens of thousands of products.
 * The limit is per Shop category, not per programme.
 */
const finalProducts = [
  ...new Set(
    rankedProducts.map(
      product =>
        product.category || "other"
    )
  )
]
  .sort()
  .flatMap(
    category =>
      rankedProducts
        .filter(
          product =>
            (product.category || "other") ===
            category
        )
        .slice(
          0,
          MAX_PRODUCTS_PER_CATEGORY
        )
  );

/*
 * With 200 products per category the complete Shop snapshot stays
 * comfortably below the Cloudflare Pages single-asset limit.
 *
 * A single ordinary JSON asset is deliberately used here instead of
 * compressed chunks. Cloudflare Pages and the browser can read it
 * directly with no content-encoding/decompression ambiguity.
 */
await fs.rm(
  OUTPUT_DIR,
  {
    recursive: true,
    force: true
  }
);

await fs.mkdir(
  "data",
  {
    recursive: true
  }
);

const output = {
  version:
    importedAt.replace(
      /[^0-9]/g,
      ""
    ),
  generatedAt:
    importedAt,
  totalProducts:
    finalProducts.length,
  feeds:
    feedStatus,
  products:
    finalProducts
};

await fs.writeFile(
  OUTPUT,
  JSON.stringify(
    output,
    null,
    2
  ) + "\n",
  "utf8"
);

const outputBytes =
  (
    await fs.stat(
      OUTPUT
    )
  ).size;

if (
  outputBytes >=
  25 * 1024 * 1024
) {
  throw new Error(
    "Generated Shop snapshot exceeds the Cloudflare Pages 25 MiB asset limit."
  );
}

console.log(
  JSON.stringify(
    {
      output:
        OUTPUT,
      generatedAt:
        importedAt,
      feeds:
        feedStatus,
      products:
        finalProducts.length,
      bytes:
        outputBytes
    },
    null,
    2
  )
);