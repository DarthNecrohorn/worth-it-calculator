const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

const CATEGORIES = {
  world: '(war OR conflict OR attack OR election OR government OR diplomacy OR sanctions OR geopolitics)',
  technology: '(technology OR "artificial intelligence" OR AI OR software OR hardware OR smartphone OR cybersecurity OR space)',
  business: '(business OR economy OR markets OR finance OR companies OR stocks OR trade OR industry)',
  science: '(science OR research OR discovery OR scientists OR space OR NASA OR physics OR biology)',
  sports: '(football OR soccer OR basketball OR tennis OR baseball OR championship OR tournament OR Olympics)',
  travel: '(travel OR tourism OR airlines OR airports OR flights OR hotels OR destinations)',
  entertainment: '(movies OR film OR music OR celebrities OR television OR streaming OR actors OR awards)',
  health: '(health OR medicine OR medical OR disease OR doctors OR hospitals OR healthcare)',
  environment: '(climate OR environment OR wildfire OR earthquake OR flood OR storm OR pollution OR conservation)'
};

function normalizeArticle(article) {
  const title = String(article?.title || "").trim();
  const url = String(article?.url || "").trim();
  const domain = String(article?.domain || "").trim();
  const seendate = String(article?.seendate || "").trim();

  return {
    title,
    url,
    domain,
    seendate
  };
}

function articleHoursOld(seendate) {
  if (!seendate) return null;

  const match = seendate.match(
    /^(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})Z$/
  );

  if (!match) return null;

  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const timestamp = Date.parse(iso);

  if (!Number.isFinite(timestamp)) return null;

  return Math.max(0, (Date.now() - timestamp) / 3600000);
}

function summarizeArticles(articles) {
  const normalized = articles.map(normalizeArticle);
  const domains = new Set(
    normalized
      .map(article => article.domain)
      .filter(Boolean)
  );

  const fresh6h = normalized.filter(article => {
    const hours = articleHoursOld(article.seendate);
    return hours !== null && hours <= 6;
  }).length;

  const fresh24h = normalized.filter(article => {
    const hours = articleHoursOld(article.seendate);
    return hours !== null && hours <= 24;
  }).length;

  const uniqueTitles = new Set(
    normalized
      .map(article => article.title.toLowerCase())
      .filter(Boolean)
  );

  return {
    returned: normalized.length,
    fresh6h,
    fresh24h,
    uniqueDomains: domains.size,
    uniqueTitles: uniqueTitles.size,
    duplicateTitles: normalized.length - uniqueTitles.size,
    articles: normalized.map(article => ({
      ...article,
      hoursOld: articleHoursOld(article.seendate)
    }))
  };
}

async function fetchGdelt(query) {
  const url = new URL(GDELT_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("maxrecords", "20");
  url.searchParams.set("timespan", "24h");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("format", "json");

  const started = Date.now();
  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Worth-It-News-Diagnostic/1.0"
    }
  });

  const elapsedMs = Date.now() - started;
  const text = await response.text();

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      elapsedMs,
      error: text.slice(0, 1000)
    };
  }

  const articles = Array.isArray(data?.articles)
    ? data.articles
    : [];

  return {
    ok: true,
    status: response.status,
    elapsedMs,
    ...summarizeArticles(articles)
  };
}

export async function onRequestGet() {
  const started = Date.now();
  const results = {};

  for (const [category, query] of Object.entries(CATEGORIES)) {
    try {
      results[category] = await fetchGdelt(query);
    } catch (error) {
      results[category] = {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const successful = Object.values(results).filter(result => result.ok).length;
  const totalArticles = Object.values(results).reduce(
    (sum, result) => sum + (result.returned || 0),
    0
  );

  return new Response(
    JSON.stringify({
      ok: successful > 0,
      diagnostic: "gdelt-news-test",
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      categories: results,
      summary: {
        categoriesTested: Object.keys(CATEGORIES).length,
        categoriesSuccessful: successful,
        totalArticles
      }
    }, null, 2),
    {
      status: successful > 0 ? 200 : 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
