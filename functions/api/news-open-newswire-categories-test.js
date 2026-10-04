export async function onRequestGet({ request }) {
  const started = Date.now();
  const url = new URL(request.url);

  const targets = [30, 50, 100];
  const categories = [
    "world",
    "technology",
    "business",
    "science",
    "sports",
    "travel",
    "entertainment",
    "health",
    "environment"
  ];

  const apiUrl = new URL("https://feed.opennewswire.org/api/articles");
  apiUrl.searchParams.set("languages", "en");
  apiUrl.searchParams.set("size", "100");
  apiUrl.searchParams.set("page", "1");

  function clean(value) {
    return String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ageHours(value) {
    const time = Date.parse(value || "");
    if (!Number.isFinite(time)) return null;
    return Number(((Date.now() - time) / 3600000).toFixed(2));
  }

  function normalizeLicense(article) {
    const license = article?.feed?.license || {};
    const text = clean(
      license.name ||
      license.slug ||
      article?.feed?.licenseText ||
      ""
    );
    const slug = clean(license.slug || "").toLowerCase();
    const name = text.toLowerCase();

    if (slug.includes("nc") || name.includes("non-commercial") || name.includes("noncommercial")) {
      return { label: text || "Unknown", commercial: false };
    }

    if (
      slug.includes("public-domain") ||
      name.includes("public domain") ||
      slug === "cc0" ||
      name.includes("cc0")
    ) {
      return { label: text || "Public Domain", commercial: true };
    }

    if (
      slug.includes("by") ||
      name.includes("creative commons") ||
      name.includes("attribution")
    ) {
      return { label: text || "Attribution+", commercial: true };
    }

    return { label: text || "Unknown", commercial: null };
  }

  const keywordMap = {
    world: [
      ["war", 4], ["conflict", 4], ["attack", 4], ["election", 3], ["president", 3],
      ["government", 2], ["minister", 2], ["parliament", 2], ["diplomatic", 3],
      ["sanction", 3], ["ceasefire", 4], ["protest", 3], ["refugee", 3],
      ["immigration", 3], ["ukraine", 3], ["russia", 2], ["iran", 2], ["israel", 2],
      ["palestine", 2], ["china", 2], ["united nations", 3]
    ],
    technology: [
      ["artificial intelligence", 5], [" ai ", 3], ["software", 3], ["chip", 3],
      ["semiconductor", 4], ["robot", 4], ["cyber", 4], ["smartphone", 3],
      ["computer", 2], ["internet", 2], ["google", 2], ["microsoft", 2],
      ["apple", 2], ["nvidia", 3], ["openai", 3], ["data center", 3],
      ["quantum", 4], ["startup", 2], ["technology", 3], ["tech ", 2]
    ],
    business: [
      ["economy", 4], ["economic", 3], ["market", 3], ["stock", 3], ["shares", 3],
      ["company", 2], ["business", 3], ["revenue", 3], ["profit", 3], ["bank", 2],
      ["inflation", 4], ["interest rate", 4], ["trade", 3], ["tariff", 4],
      ["jobs", 2], ["employment", 2], ["oil price", 3], ["investment", 3],
      ["merger", 4], ["acquisition", 4], ["earnings", 3]
    ],
    science: [
      ["research", 3], ["researchers", 3], ["scientist", 3], ["scientists", 3],
      ["study", 3], ["discovery", 4], ["nasa", 4], ["space", 4], ["astronom", 4],
      ["planet", 3], ["moon", 3], ["mars", 3], ["telescope", 3], ["physics", 4],
      ["biology", 4], ["genetic", 4], ["fossil", 3], ["species", 3], ["laboratory", 3],
      ["experiment", 3], ["quantum", 3]
    ],
    sports: [
      ["football", 4], ["soccer", 4], ["basketball", 4], ["tennis", 4], ["baseball", 4],
      ["cricket", 4], ["rugby", 4], ["golf", 4], ["formula 1", 5], ["f1", 4],
      ["championship", 3], ["tournament", 3], ["league", 3], ["match", 3],
      ["final", 2], ["olympic", 4], ["athlete", 4], ["coach", 3], ["goal", 3],
      ["grand prix", 4]
    ],
    travel: [
      ["travel", 4], ["tourism", 4], ["tourist", 4], ["airline", 4], ["airport", 3],
      ["flight", 3], ["hotel", 3], ["resort", 3], ["destination", 4], ["visa", 3],
      ["border", 2], ["cruise", 4], ["vacation", 4], ["holiday", 3], ["passenger", 2],
      ["tour", 2], ["tourism", 4]
    ],
    entertainment: [
      ["film", 4], ["movie", 4], ["cinema", 4], ["actor", 3], ["actress", 3],
      ["music", 4], ["singer", 3], ["album", 3], ["concert", 4], ["festival", 3],
      ["television", 3], ["tv series", 3], ["netflix", 3], ["hollywood", 4],
      ["celebrity", 3], ["theatre", 3], ["theater", 3], ["book", 2], ["game", 2]
    ],
    health: [
      ["health", 4], ["hospital", 3], ["doctor", 3], ["medical", 4], ["medicine", 4],
      ["disease", 4], ["cancer", 4], ["vaccine", 4], ["vaccination", 4],
      ["outbreak", 4], ["virus", 4], ["mental health", 5], ["patient", 3],
      ["treatment", 4], ["drug", 3], ["public health", 5], ["measles", 4],
      ["covid", 4], ["nutrition", 3]
    ],
    environment: [
      ["climate", 5], ["climate change", 5], ["global warming", 5], ["wildfire", 5],
      ["hurricane", 5], ["tornado", 4], ["storm", 4], ["flood", 4], ["drought", 4],
      ["earthquake", 3], ["pollution", 4], ["emissions", 4], ["carbon", 3],
      ["renewable", 4], ["biodiversity", 5], ["conservation", 4], ["ecosystem", 4],
      ["environment", 4], ["ocean", 3], ["forest", 3], ["wildlife", 4]
    ]
  };

  function scoreCategory(article, category) {
    const text = (
      " " +
      clean(article.title) +
      " " +
      clean(article.content || "") +
      " "
    ).toLowerCase();

    let score = 0;
    for (const [term, weight] of keywordMap[category]) {
      if (text.includes(term)) score += weight;
    }
    return score;
  }

  function classify(article) {
    const scores = Object.fromEntries(
      categories.map(category => [category, scoreCategory(article, category)])
    );
    const ranked = categories
      .map(category => ({ category, score: scores[category] }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const second = ranked[1];

    if (!best || best.score < 4) {
      return { category: null, score: best?.score || 0, scores };
    }

    // Avoid weak/ambiguous assignments where two categories are essentially tied.
    if (second && second.score >= best.score - 1 && second.score >= 4) {
      // Prefer the more distinctive category when a strong signal exists.
      const strong = ranked.find(item => item.score >= 7);
      if (strong) return { category: strong.category, score: strong.score, scores };
    }

    return { category: best.category, score: best.score, scores };
  }

  function quality(article, classification) {
    const age = ageHours(article.date);
    const license = normalizeLicense(article);
    const title = clean(article.title);

    const reasons = [];
    let score = 0;

    if (age !== null && age <= 24) score += 30;
    else if (age !== null && age <= 48) score += 20;
    else if (age !== null && age <= 96) score += 10;
    else if (age !== null) reasons.push("older-than-96h");
    else reasons.push("no-date");

    if (title.length >= 35 && title.length <= 140) score += 15;
    else if (title.length < 20) reasons.push("very-short-title");

    if (classification.category) score += Math.min(classification.score, 15);
    else reasons.push("weak-category-match");

    if (license.commercial === false) reasons.push("non-commercial-license");
    if (license.commercial === null) reasons.push("unknown-license");

    const suitable =
      !!article.link &&
      !!classification.category &&
      classification.score >= 4 &&
      age !== null &&
      age <= 96 &&
      license.commercial !== false &&
      title.length >= 20;

    return { suitable, score, reasons, license };
  }

  async function fetchPage(page) {
    const pageUrl = new URL(apiUrl);
    pageUrl.searchParams.set("page", String(page));

    const response = await fetch(pageUrl, {
      headers: { "User-Agent": "Worth-It-OpenNewswire-Diagnostic/1.0" }
    });

    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      bytes: text.length,
      json
    };
  }

  const pages = [];
  for (let page = 1; page <= 5; page++) {
    const result = await fetchPage(page);
    pages.push({ page, ...result });
    if (!result.ok) break;

    const results = Array.isArray(result.json?.results) ? result.json.results : [];
    if (!results.length) break;
  }

  const all = [];
  const seen = new Set();

  for (const page of pages) {
    const results = Array.isArray(page.json?.results) ? page.json.results : [];
    for (const article of results) {
      const key = article.id || article.link || article.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const classification = classify(article);
      const qualityResult = quality(article, classification);

      all.push({
        id: article.id || null,
        title: clean(article.title),
        link: article.link || "",
        source: clean(article.feed?.title || ""),
        date: article.date || null,
        ageHours: ageHours(article.date),
        license: qualityResult.license.label,
        commercialLicense: qualityResult.license.commercial,
        category: classification.category,
        categoryScore: classification.score,
        qualityScore: qualityResult.score,
        suitable: qualityResult.suitable,
        rejectionReasons: qualityResult.reasons
      });
    }
  }

  all.sort((a, b) => {
    const ad = a.ageHours ?? 999999;
    const bd = b.ageHours ?? 999999;
    return ad - bd;
  });

  const analysis = {};

  for (const target of targets) {
    const sample = all.slice(0, target);
    const suitable = sample.filter(article => article.suitable);

    analysis[target] = {
      fetched: sample.length,
      suitableTotal: suitable.length,
      suitablePercent: sample.length
        ? Number((suitable.length / sample.length * 100).toFixed(1))
        : 0,
      byCategory: Object.fromEntries(
        categories.map(category => {
          const categoryArticles = suitable
            .filter(article => article.category === category)
            .sort((a, b) => b.qualityScore - a.qualityScore);

          return [
            category,
            {
              suitable: categoryArticles.length,
              fresh24h: categoryArticles.filter(a => a.ageHours !== null && a.ageHours <= 24).length,
              sample: categoryArticles.slice(0, 5)
            }
          ];
        })
      ),
      licenseCounts: suitable.reduce((out, article) => {
        out[article.license] = (out[article.license] || 0) + 1;
        return out;
      }, {}),
      rejected: {
        nonCommercial: sample.filter(article => article.rejectionReasons.includes("non-commercial-license")).length,
        unknownLicense: sample.filter(article => article.rejectionReasons.includes("unknown-license")).length,
        weakCategory: sample.filter(article => article.rejectionReasons.includes("weak-category-match")).length,
        old: sample.filter(article => article.rejectionReasons.includes("older-than-96h")).length
      }
    };
  }

  const response = {
    readOnly: true,
    productionNewsSystemTouched: false,
    source: "Open Newswire",
    endpoint: apiUrl.toString(),
    requestedSizes: targets,
    pagesFetched: pages.length,
    pageStatuses: pages.map(page => ({
      page: page.page,
      status: page.status,
      ok: page.ok,
      bytes: page.bytes,
      apiResults: Array.isArray(page.json?.results) ? page.json.results.length : 0,
      pagination: page.json?.pagination || null
    })),
    totalUniqueFetched: all.length,
    categories,
    analysis,
    allArticles: all,
    elapsedMs: Date.now() - started
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
