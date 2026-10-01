import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const OUTPUT =
  "data/shop-products-awin.json";

const MAX_FEED_BYTES = 120 * 1024 * 1024;

const FEEDS = [
  {
    partnerId: "stylevana",
    advertiserId: "90791",
    name: "Stylevana",
    category: "beauty-skincare",
    env: "AWIN_STYLEVANA_FEED_URL",
    shippingCountries: ["US"]
  },
  {
    partnerId: "dowinx-eu",
    advertiserId: "107524",
    name: "Dowinx (EU)",
    category: "gaming-office",
    env: "AWIN_DOWINX_EU_FEED_URL",
    shippingCountries: ["US"]
  },
  {
    partnerId: "giftlab",
    advertiserId: "95201",
    name: "Giftlab",
    category: "personalized-gifts",
    env: "AWIN_GIFTLAB_FEED_URL",
    shippingCountries: []
  },
  {
    partnerId: "king-koil",
    advertiserId: "115216",
    name: "King Koil",
    category: "sleep-mattresses",
    env: "AWIN_KING_KOIL_FEED_URL",
    shippingCountries: []
  }
];

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
    firstValue(row, ["aw_deep_link"])
  );

  const image = normalizeText(
    firstValue(row, [
      "merchant_image_url",
      "aw_image_url",
      "large_image",
      "aw_thumb_url"
    ])
  );

  const price = parseNumber(
    firstValue(row, ["search_price", "price"])
  );

  const storePrice = parseNumber(
    firstValue(row, ["store_price"])
  );

  const rrpPrice = parseNumber(
    firstValue(row, ["rrp_price"])
  );

  let regularPrice = price;

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
      "merchant_product_id"
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
    shippingCountries:
      feed.shippingCountries,
    shippingSourceLabel:
      feed.shippingCountries.length
        ? "Awin programme region fallback"
        : "No shipping destination in feed",
    shippingNote:
      feed.shippingCountries.length
        ? "This standard Awin feed does not provide product-level shipping destinations. The programme's primary region is shown as a regional fallback; final shipping availability must be confirmed with the merchant."
        : "This standard Awin feed does not provide a country-level shipping destination.",
    awProductId,
    merchantProductId:
      normalizeText(
        firstValue(row, ["merchant_product_id"])
      ),
    brandName:
      normalizeText(
        firstValue(row, ["brand_name"])
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

const finalProducts =
  dedupe(products)
    .sort(
      (a, b) =>
        b.popularityScore -
        a.popularityScore
    );

const output = {
  version: importedAt.replace(/[^0-9]/g, ""),
  generatedAt: importedAt,
  feeds: feedStatus,
  products: finalProducts
};

await fs.mkdir(
  "data",
  { recursive: true }
);

await fs.writeFile(
  OUTPUT,
  JSON.stringify(
    output,
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(
  JSON.stringify(
    {
      output: OUTPUT,
      generatedAt: importedAt,
      feeds: feedStatus,
      products: finalProducts.length
    },
    null,
    2
  )
);
