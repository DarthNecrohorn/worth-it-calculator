export async function onRequestGet() {
  const started = Date.now();

  const queries = [
    "travel",
    "tourism",
    "airline",
    "airport",
    "hotel",
    "destination",
    "cruise",
    "hospitality"
  ];

  function clean(value) {
    return String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\\s+/g, " ")
      .trim();
  }

  function ageHours(value) {
    const time = Date.parse(value || "");
    if (!Number.isFinite(time)) return null;
    return Number(Math.max(0, (Date.now() - time) / 3600000).toFixed(2));
  }

  function normalizeLicense(article) {
    const license = article?.feed?.license || {};
    const raw = clean(
      license.name ||
      license.slug ||
      article?.feed?.licenseText ||
      ""
    );
    const slug = clean(license.slug || "").toLowerCase();
    const name = raw.toLowerCase();

    if (
      slug.includes("nc") ||
      name.includes("non-commercial") ||
      name.includes("noncommercial")
    ) {
      return { label: raw || "Unknown", commercial: false };
    }

    if (
      slug.includes("public-domain") ||
      name.includes("public domain") ||
      slug === "cc0" ||
      name.includes("cc0")
    ) {
      return { label: raw || "Public Domain", commercial: true };
    }

    if (
      slug.includes("by") ||
      name.includes("creative commons") ||
      name.includes("attribution")
    ) {
      return { label: raw || "Attribution+", commercial: true };
    }

    return { label: raw || "Unknown", commercial: null };
  }

  function sourceInfo(article) {
    const feed = article?.feed || {};
    return {
      name: clean(feed.title || ""),
      url: clean(feed.url || feed.link || ""),
      licenseUrl: clean(feed.licenseUrl || feed.license_url || "")
    };
  }

  function travelScore(article) {
    const title = clean(article?.title).toLowerCase();
    const body = clean(article?.content || article?.description || "").toLowerCase();
    const text = " " + title + " " + body + " ";
    const source = sourceInfo(article);
    const sourceText = (source.name + " " + source.url).toLowerCase();
    const link = clean(article?.link || "").toLowerCase();

    const terms = [
      ["travel", 6],
      ["tourism", 7],
      ["tourist", 6],
      ["traveler", 6],
      ["travellers", 6],
      ["airline", 7],
      ["airport", 6],
      ["flight", 5],
      ["hotel", 6],
      ["resort", 7],
      ["destination", 7],
      ["cruise", 7],
      ["vacation", 6],
      ["holiday", 5],
      ["hospitality", 5],
      ["tour operator", 7],
      ["rail travel", 6],
      ["railway journey", 5]
    ];

    let score = 0;
    let titleHits = 0;
    let bodyHits = 0;

    for (const [term, weight] of terms) {
      const inTitle = title.includes(term);
      const inBody = text.includes(term);
      if (inTitle) {
        score += weight * 2;
        titleHits++;
      } else if (inBody) {
        score += weight;
        bodyHits++;
      }
    }

    const pathHints = [
      "/travel",
      "/tourism",
      "/tourist",
      "/airline",
      "/airport",
      "/cruise",
      "/hospitality",
      "/hotel"
    ];

    for (const hint of pathHints) {
      if (link.includes(hint)) {
        score += 8;
        break;
      }
    }

    if (
      sourceText.includes("travel") ||
      sourceText.includes("tourism") ||
      sourceText.includes("aviation") ||
      sourceText.includes("hospitality")
    ) {
      score += 3;
    }

    const weakPatterns = [
      "job",
      "jobs",
      "hiring",
      "webinar",
      "conference",
      "workshop",
      "seminar",
      "award",
      "appointed",
      "appointment",
      "obituary",
      "funeral",
      "fundraiser",
      "fundraising",
      "real estate",
      "property listing",
      "opinion",
      "editorial",
      "commentary",
      "analysis"
    ];

    for (const term of weakPatterns) {
      if (text.includes(term)) score -= 5;
    }

    return { score, titleHits, bodyHits };
  }

  const all = new Map();
  const queryResults = [];
  const errors = [];

  for (const query of queries) {
    const t0 = Date.now();
    try {
      const url = new URL("https://feed.opennewswire.org/api/articles");
      url.searchParams.set("languages", "en");
      url.searchParams.set("size", "100");
      url.searchParams.set("search", query);

      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "Worth-It-OpenNewswire-Travel-Diagnostic/1.0" },
        cf: { cacheTtl: 300, cacheEverything: true }
      });

      const text = await response.text();
      if (!response.ok) {
        errors.push({ query, httpStatus: response.status, preview: text.slice(0, 300) });
        queryResults.push({ query, httpStatus: response.status, count: 0, elapsedMs: Date.now() - t0 });
        continue;
      }

      const data = JSON.parse(text);
      const articles = Array.isArray(data?.articles)
        ? data.articles
        : Array.isArray(data?.data)
          ? data.data
          : [];

      for (const article of articles) {
        const key = clean(article?.link || article?.id || article?.title).toLowerCase();
        if (!key || all.has(key)) continue;
        all.set(key, article);
      }

      queryResults.push({
        query,
        httpStatus: response.status,
        count: articles.length,
        elapsedMs: Date.now() - t0
      });
    } catch (error) {
      errors.push({
        query,
        error: error instanceof Error ? error.message : String(error)
      });
      queryResults.push({
        query,
        count: 0,
        elapsedMs: Date.now() - t0
      });
    }
  }

  const analyzed = [...all.values()].map((article) => {
    const license = normalizeLicense(article);
    const source = sourceInfo(article);
    const score = travelScore(article);
    return {
      id: article?.id || "",
      title: clean(article?.title || ""),
      link: clean(article?.link || ""),
      date: article?.date || article?.publishedAt || article?.published_at || "",
      ageHours: ageHours(article?.date || article?.publishedAt || article?.published_at || ""),
      description: clean(article?.content || article?.description || article?.excerpt || "").slice(0, 500),
      source: source.name,
      license: license.label,
      commercial: license.commercial,
      licenseUrl: source.licenseUrl,
      score: score.score,
      titleHits: score.titleHits,
      bodyHits: score.bodyHits
    };
  }).filter((article) => article.title);

  analyzed.sort((a, b) => {
    const ageA = Number.isFinite(a.ageHours) ? a.ageHours : 99999;
    const ageB = Number.isFinite(b.ageHours) ? b.ageHours : 99999;
    const freshA = ageA <= 24 ? 40 : ageA <= 48 ? 25 : ageA <= 96 ? 10 : -20;
    const freshB = ageB <= 24 ? 40 : ageB <= 48 ? 25 : ageB <= 96 ? 10 : -20;
    const usableA = a.commercial === true ? 20 : a.commercial === false ? -30 : -10;
    const usableB = b.commercial === true ? 20 : b.commercial === false ? -30 : -10;
    return (b.score + freshB + usableB) - (a.score + freshA + usableA);
  });

  const suitable = analyzed.filter((article) =>
    article.commercial === true &&
    Number.isFinite(article.ageHours) &&
    article.ageHours <= 96 &&
    article.score >= 12 &&
    (article.titleHits >= 1 || article.bodyHits >= 2)
  );

  const fresh24h = suitable.filter((x) => x.ageHours <= 24).length;
  const fresh48h = suitable.filter((x) => x.ageHours <= 48).length;
  const fresh96h = suitable.filter((x) => x.ageHours <= 96).length;

  const licenseCounts = {};
  for (const article of analyzed) {
    licenseCounts[article.license] = (licenseCounts[article.license] || 0) + 1;
  }

  const sourceMap = new Map();
  for (const article of suitable) {
    const key = article.source || "Unknown";
    const current = sourceMap.get(key) || {
      source: key,
      suitable: 0,
      fresh24h: 0,
      fresh48h: 0,
      fresh96h: 0
    };
    current.suitable++;
    if (article.ageHours <= 24) current.fresh24h++;
    if (article.ageHours <= 48) current.fresh48h++;
    if (article.ageHours <= 96) current.fresh96h++;
    sourceMap.set(key, current);
  }

  const sources = [...sourceMap.values()]
    .sort((a, b) => (b.fresh24h - a.fresh24h) || (b.suitable - a.suitable))
    .slice(0, 30);

  return Response.json({
    ok: true,
    elapsedMs: Date.now() - started,
    generatedAt: new Date().toISOString(),
    source: "Open Newswire",
    queries,
    queryResults,
    fetchedUnique: analyzed.length,
    suitableCount: suitable.length,
    suitablePercent: analyzed.length
      ? Number((suitable.length * 100 / analyzed.length).toFixed(1))
      : 0,
    fresh24h,
    fresh48h,
    fresh96h,
    licenseCounts,
    topSources: sources,
    topSuitable: suitable.slice(0, 50),
    rejectedOrUncertain: analyzed
      .filter((article) => !suitable.includes(article))
      .slice(0, 30),
    errors,
    productionTouched: false
  }, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
