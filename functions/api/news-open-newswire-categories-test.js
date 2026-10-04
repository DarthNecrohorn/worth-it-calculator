export async function onRequestGet({ request }) {
  const started = Date.now();

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

    if (
      slug.includes("nc") ||
      name.includes("non-commercial") ||
      name.includes("noncommercial")
    ) {
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
      ["war", 5], ["conflict", 5], ["attack", 5], ["airstrike", 5],
      ["ceasefire", 5], ["election", 4], ["president", 4], ["prime minister", 4],
      ["government", 3], ["minister", 3], ["parliament", 4], ["diplomatic", 4],
      ["sanction", 4], ["protest", 4], ["refugee", 4], ["immigration", 4],
      ["ukraine", 4], ["russia", 3], ["iran", 3], ["israel", 3], ["palestine", 3],
      ["china", 3], ["united nations", 4], ["nato", 4], ["european union", 4],
      ["europe", 2], ["africa", 2], ["middle east", 4], ["asia", 2]
    ],
    technology: [
      ["artificial intelligence", 6], [" ai ", 4], ["software", 4], ["chip", 4],
      ["semiconductor", 5], ["robot", 5], ["robotics", 5], ["cyber", 5],
      ["cybersecurity", 5], ["smartphone", 4], ["computer", 3], ["internet", 3],
      ["google", 3], ["microsoft", 3], ["apple", 3], ["nvidia", 4], ["openai", 4],
      ["data center", 4], ["quantum", 5], ["startup", 3], ["technology", 4],
      ["tech ", 3], ["platform", 2], ["processor", 4], ["battery technology", 4]
    ],
    business: [
      ["economy", 5], ["economic", 4], ["market", 4], ["stock", 4], ["shares", 4],
      ["company", 3], ["business", 4], ["revenue", 4], ["profit", 4], ["bank", 3],
      ["inflation", 5], ["interest rate", 5], ["trade", 4], ["tariff", 5],
      ["employment", 3], ["unemployment", 4], ["oil price", 4], ["investment", 4],
      ["merger", 5], ["acquisition", 5], ["earnings", 4], ["gdp", 5], ["consumer prices", 4],
      ["retail", 3], ["manufacturing", 3], ["financial", 3]
    ],
    science: [
      ["research", 4], ["researchers", 4], ["scientist", 5], ["scientists", 5],
      ["study", 4], ["discovery", 5], ["nasa", 6], ["space", 5], ["astronom", 5],
      ["planet", 4], ["moon", 4], ["mars", 4], ["telescope", 5], ["physics", 5],
      ["biology", 5], ["genetic", 5], ["fossil", 4], ["species", 4], ["laboratory", 5],
      ["experiment", 5], ["quantum", 5], ["climate science", 5], ["research paper", 5],
      ["scientific", 5], ["geology", 4], ["paleontology", 5]
    ],
    sports: [
      ["football", 5], ["soccer", 5], ["basketball", 5], ["tennis", 5], ["baseball", 5],
      ["cricket", 5], ["rugby", 5], ["golf", 5], ["formula 1", 6], ["f1", 5],
      ["championship", 4], ["tournament", 4], ["league", 4], ["match", 4],
      ["olympic", 5], ["athlete", 5], ["coach", 4], ["goal", 4], ["grand prix", 5],
      ["world cup", 6], ["premier league", 6], ["nfl", 6], ["nba", 6], ["nhl", 6],
      ["mlb", 6], ["uefa", 6], ["fifa", 6]
    ],
    travel: [
      ["travel", 5], ["tourism", 5], ["tourist", 5], ["airline", 5], ["airport", 4],
      ["flight", 4], ["hotel", 4], ["resort", 5], ["destination", 5], ["visa", 4],
      ["cruise", 5], ["vacation", 5], ["holiday", 4], ["passenger", 3],
      ["tour ", 3], ["tourism", 5], ["travelers", 5], ["travellers", 5],
      ["tour operator", 5], ["hospitality", 4]
    ],
    entertainment: [
      ["film", 5], ["movie", 5], ["cinema", 5], ["actor", 4], ["actress", 4],
      ["music", 5], ["singer", 4], ["album", 5], ["concert", 5], ["festival", 4],
      ["television", 4], ["tv series", 5], ["netflix", 5], ["hollywood", 5],
      ["celebrity", 4], ["theatre", 5], ["theater", 5], ["streaming", 4],
      ["director", 4], ["box office", 5], ["grammy", 5], ["emmy", 5]
    ],
    health: [
      ["health", 4], ["hospital", 5], ["doctor", 5], ["medical", 5], ["medicine", 5],
      ["disease", 5], ["cancer", 6], ["vaccine", 5], ["vaccination", 5],
      ["outbreak", 5], ["virus", 5], ["mental health", 6], ["patient", 4],
      ["treatment", 5], ["drug", 4], ["public health", 6], ["measles", 5],
      ["covid", 5], ["nutrition", 4], ["epidemic", 5], ["clinical trial", 6],
      ["healthcare", 5]
    ],
    environment: [
      ["climate", 6], ["climate change", 6], ["global warming", 6], ["wildfire", 6],
      ["hurricane", 6], ["tornado", 5], ["storm", 5], ["flood", 5], ["drought", 5],
      ["earthquake", 4], ["pollution", 5], ["emissions", 5], ["carbon", 4],
      ["renewable", 5], ["biodiversity", 6], ["conservation", 5], ["ecosystem", 5],
      ["environment", 5], ["ocean", 4], ["forest", 4], ["wildlife", 5],
      ["deforestation", 6], ["heatwave", 6], ["heat wave", 6]
    ]
  };

  const negativeSignals = {
    sports: ["policy", "government", "border security", "federal reimbursement", "election"],
    travel: ["forum", "government", "election", "legislation", "reimbursement"],
    entertainment: ["government", "policy", "legislation", "border security", "election"],
    science: ["community", "government", "election", "policy", "reimbursement"],
    business: ["high school", "university", "church", "funeral", "obituary"]
  };

  function sourceInfo(article) {
    const feed = article?.feed || {};
    return {
      name: clean(feed.title || ""),
      url: clean(feed.url || feed.link || ""),
      licenseUrl: clean(feed.licenseUrl || feed.license_url || "")
    };
  }

  function scoreCategory(article, category) {
    const title = clean(article.title).toLowerCase();
    const content = clean(article.content || "").toLowerCase();
    const text = " " + title + " " + content + " ";
    const source = sourceInfo(article);
    const sourceText = (source.name + " " + source.url).toLowerCase();

    let score = 0;
    let titleHits = 0;
    let bodyHits = 0;

    for (const [term, weight] of keywordMap[category]) {
      const normalized = term.startsWith(" ") ? term : term.toLowerCase();
      const hitsTitle = title.includes(normalized.trim());
      const hitsBody = text.includes(normalized);

      if (hitsTitle) {
        score += weight * 2;
        titleHits++;
      }
      if (hitsBody && !hitsTitle) {
        score += weight;
        bodyHits++;
      }
    }

    for (const term of negativeSignals[category] || []) {
      if (text.includes(term)) score -= 4;
    }

    // Strong source/path hints are useful, but never enough on their own.
    if (category === "sports" && /sport|football|soccer|basketball|tennis|cricket/.test(sourceText)) score += 5;
    if (category === "technology" && /tech|technology|ai|science/.test(sourceText)) score += 3;
    if (category === "science" && /science|nasa|space/.test(sourceText)) score += 3;
    if (category === "health" && /health|medical|medicine/.test(sourceText)) score += 3;
    if (category === "environment" && /environment|climate|nature|wildlife/.test(sourceText)) score += 3;
    if (category === "business" && /business|economy|market|finance/.test(sourceText)) score += 3;
    if (category === "travel" && /travel|tourism|tourist/.test(sourceText)) score += 3;
    if (category === "entertainment" && /entertainment|culture|music|film|movie/.test(sourceText)) score += 3;

    return { score, titleHits, bodyHits };
  }

  function classify(article) {
    const scores = Object.fromEntries(
      categories.map(category => [category, scoreCategory(article, category)])
    );

    const ranked = categories
      .map(category => ({ category, ...scores[category] }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const second = ranked[1];

    if (!best || best.score < 7) {
      return { category: null, score: best?.score || 0, secondScore: second?.score || 0, scores };
    }

    // A category should have real evidence, preferably in the headline.
    if (best.titleHits === 0 && best.bodyHits < 2) {
      return { category: null, score: best.score, secondScore: second?.score || 0, scores };
    }

    // Reject close calls unless the winner has a very strong headline signal.
    if (
      second &&
      second.score >= best.score - 2 &&
      best.titleHits === 0
    ) {
      return { category: null, score: best.score, secondScore: second.score, scores };
    }

    return {
      category: best.category,
      score: best.score,
      secondScore: second?.score || 0,
      scores
    };
  }

  function isRoutineOrLowValue(article) {
    const text = (clean(article.title) + " " + clean(article.content || "")).toLowerCase();

    const patterns = [
      /\b(opinion|editorial|commentary|analysis|column)\b/,
      /\b(job|jobs|hiring|vacancy|vacancies|recruiting|recruitment)\b/,
      /\b(webinar|conference|workshop|seminar|event registration)\b/,
      /\b(award|awards|honou?r|appointment|appointed|joins as|names .* as)\b/,
      /\b(fundraiser|fundraising|donation drive|crowdfunding)\b/,
      /\b(obituary|dies at the age|funeral)\b/,
      /\b(real estate listing|property listing|for sale)\b/,
      /\b(sponsored|advertorial|press release|paid content)\b/,
      /\b(how to|guide to|tips for|best .* to)\b/
    ];

    return patterns.some(pattern => pattern.test(text));
  }

  function quality(article, classification) {
    const age = ageHours(article.date);
    const license = normalizeLicense(article);
    const title = clean(article.title);
    const routine = isRoutineOrLowValue(article);

    const reasons = [];
    let score = 0;

    if (age !== null && age <= 24) score += 35;
    else if (age !== null && age <= 48) score += 25;
    else if (age !== null && age <= 72) score += 18;
    else if (age !== null && age <= 96) score += 8;
    else if (age !== null) reasons.push("older-than-96h");
    else reasons.push("no-date");

    if (title.length >= 35 && title.length <= 140) score += 15;
    else if (title.length < 20) reasons.push("very-short-title");

    if (classification.category) score += Math.min(classification.score, 18);
    else reasons.push("weak-category-match");

    if (license.commercial === false) reasons.push("non-commercial-license");
    if (license.commercial === null) reasons.push("unknown-license");
    if (routine) reasons.push("routine-or-low-value");

    const suitable =
      !!article.link &&
      !!classification.category &&
      classification.score >= 7 &&
      age !== null &&
      age <= 96 &&
      license.commercial === true &&
      title.length >= 20 &&
      !routine;

    return { suitable, score, reasons, license };
  }

  async function fetchPage(page) {
    const pageUrl = new URL(apiUrl);
    pageUrl.searchParams.set("page", String(page));

    const response = await fetch(pageUrl, {
      headers: { "User-Agent": "Worth-It-OpenNewswire-Diagnostic/2.0" }
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
      const source = sourceInfo(article);

      all.push({
        id: article.id || null,
        title: clean(article.title),
        link: article.link || "",
        source: source.name,
        sourceUrl: source.url,
        licenseUrl: source.licenseUrl,
        date: article.date || null,
        ageHours: ageHours(article.date),
        license: qualityResult.license.label,
        commercialLicense: qualityResult.license.commercial,
        category: classification.category,
        categoryScore: classification.score,
        secondCategoryScore: classification.secondScore,
        qualityScore: qualityResult.score,
        suitable: qualityResult.suitable,
        rejectionReasons: qualityResult.reasons
      });
    }
  }

  all.sort((a, b) => {
    const ad = a.ageHours ?? 999999;
    const bd = b.ageHours ?? 999999;
    if (ad !== bd) return ad - bd;
    return b.qualityScore - a.qualityScore;
  });

  const analysis = {
    pool: {
      fetched: all.length,
      suitable: all.filter(a => a.suitable).length,
      suitablePercent: all.length
        ? Number((all.filter(a => a.suitable).length / all.length * 100).toFixed(1))
        : 0
    },
    byCategory: Object.fromEntries(
      categories.map(category => {
        const items = all
          .filter(a => a.suitable && a.category === category)
          .sort((a, b) => b.qualityScore - a.qualityScore);

        return [
          category,
          {
            suitable: items.length,
            fresh24h: items.filter(a => a.ageHours !== null && a.ageHours <= 24).length,
            fresh48h: items.filter(a => a.ageHours !== null && a.ageHours <= 48).length,
            top12: items.slice(0, 12)
          }
        ];
      })
    ),
    licenseCounts: all.reduce((out, article) => {
      out[article.license] = (out[article.license] || 0) + 1;
      return out;
    }, {}),
    rejectionCounts: all.reduce((out, article) => {
      for (const reason of article.rejectionReasons) {
        out[reason] = (out[reason] || 0) + 1;
      }
      return out;
    }, {})
  };

  const response = {
    readOnly: true,
    productionNewsSystemTouched: false,
    purpose: "Stronger deterministic Open Newswire category and quality diagnostic; production /api/news is untouched.",
    source: "Open Newswire",
    endpoint: apiUrl.toString(),
    pagesRequested: 5,
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
