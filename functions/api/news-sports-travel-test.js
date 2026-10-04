export async function onRequestGet() {
  const started = Date.now();

  const sources = [
    {
      id: "predict-game",
      name: "predict.game",
      url: "https://predict.game/api/v1/en/football/news/latest.json",
      license: "CC BY 4.0",
      category: "sports",
    },
    {
      id: "predict-game-f1",
      name: "predict.game F1",
      url: "https://predict.game/api/v1/en/f1/news/latest.json",
      license: "CC BY 4.0",
      category: "sports",
    },
    {
      id: "breaking-travel-news",
      name: "Breaking Travel News",
      url: "https://feeds.feedburner.com/breakingtravelnews/news/tourism",
      license: "UNKNOWN",
      category: "travel",
    },
    {
      id: "breaking-travel-airline",
      name: "Breaking Travel News Airline",
      url: "https://feeds.feedburner.com/breakingtravelnews/news/airline",
      license: "UNKNOWN",
      category: "travel",
    },
  ];

  const results = [];

  for (const source of sources) {
    const t0 = Date.now();
    try {
      const response = await fetch(source.url, {
        headers: { "User-Agent": "Worth-It-News-Source-Diagnostic/1.0" },
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      const text = await response.text();
      const lower = text.toLowerCase();
      const contentType = response.headers.get("content-type") || "";

      let items = [];

      if (source.id.startsWith("predict-game")) {
        const data = JSON.parse(text);
        const raw = Array.isArray(data?.data?.articles)
          ? data.data.articles
          : Array.isArray(data?.data)
            ? data.data
            : [];

        items = raw.map((a) => ({
          title: a.title || a.headline || "",
          link: a.url || a.link || "",
          date: a.date || a.publishedAt || a.published_at || a.published || "",
          description: a.description || a.excerpt || a.summary || "",
        }));
      } else {
        const blocks = extractRssItems(text);
        items = blocks.map((block) => ({
          title: decodeXml(extractXmlTag(block, "title")),
          link: decodeXml(extractXmlTag(block, "link")),
          date: decodeXml(extractXmlTag(block, "pubDate")),
          description: decodeXml(extractXmlTag(block, "description")),
        }));
      }

 items
        .map((item) => ({
          ...item,
          title: clean(item.title),
          link: clean(item.link),
          description: stripHtml(clean(item.description)),
          ageHours: getAgeHours(item.date),
        }))
        .filter((item) => item.title);

      const unique = [];
      const seen = new Set();
      for (const item of normalized) {
        const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
      }

      const fresh24h = unique.filter((x) => Number.isFinite(x.ageHours) && x.ageHours <= 24).length;
      const fresh48h = unique.filter((x) => Number.isFinite(x.ageHours) && x.ageHours <= 48).length;
      const fresh96h = unique.filter((x) => Number.isFinite(x.ageHours) && x.ageHours <= 96).length;

      results.push({
        id: source.id,
        name: source.name,
        category: source.category,
        license: source.license,
        httpStatus: response.status,
        contentType,
        bytes: text.length,
        count: unique.length,
        fresh24h,
        fresh48h,
        fresh96h,
        elapsedMs: Date.now() - t0,
        samples: unique.slice(0, 10),
        note: source.license === "UNKNOWN"
          ? "Feed works, but licensing for republication still needs verification."
          : "Source documents CC BY 4.0 terms; verify article/feed scope before production use.",
      });
    } catch (error) {
      results.push({
        id: source.id,
        name: source.name,
        category: source.category,
        license: source.license,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - t0,
      });
    }
  }

  return Response.json({
    ok: true,
    elapsedMs: Date.now() - started,
    generatedAt: new Date().toISOString(),
    results,
    productionTouched: false,
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function clean(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractRssItems(text) {
  const items = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("<item", cursor);
    if (start === -1) break;

    const end = text.indexOf("</item>", start);
    if (end === -1) break;

    items.push(text.slice(start, end + 7));
    cursor = end + 7;
  }

  return items;
}

function extractXmlTag(block, tagName) {
  const lower = block.toLowerCase();
  const openPrefix = "<" + tagName.toLowerCase();
  const start = lower.indexOf(openPrefix);
  if (start === -1) return "";

  const openEnd = block.indexOf(">", start);
  if (openEnd === -1) return "";

  const close = "</" + tagName.toLowerCase() + ">";
  const end = lower.indexOf(close, openEnd + 1);
  if (end === -1) return "";

  return block.slice(openEnd + 1, end);
}

function decodeXml(value) {
  return clean(value);
}

function getAgeHours(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / 3600000);
}
