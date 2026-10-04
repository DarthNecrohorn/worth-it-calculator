const API_BASE = "https://api.thenewsapi.com/v1/news/top";

const CATEGORIES = {
  world: "world",
  technology: "technology",
  business: "business",
  science: "science",
  sports: "sports",
  travel: "travel",
  entertainment: "entertainment",
  health: "health",
  environment: "environment"
};

function articleAgeHours(publishedAt) {
  const timestamp = Date.parse(publishedAt || "");
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / 3600000);
}

function normalizeArticle(article) {
  return {
    title: String(article?.title || "").trim(),
    url: String(article?.url || "").trim(),
    source: String(article?.source || "").trim(),
    publishedAt: String(article?.published_at || "").trim(),
    hoursOld: articleAgeHours(article?.published_at)
  };
}

async function fetchCategory(apiKey, category) {
  const url = new URL(API_BASE);
  url.searchParams.set("api_token", apiKey);
  url.searchParams.set("locale", "us");
  url.searchParams.set("language", "en");
  url.searchParams.set("categories", category);
  url.searchParams.set("limit", "3");

  const started = Date.now();
  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" }
  });

  const elapsedMs = Date.now() - started;
  const body = await response.text();

  let data = null;
  try {
    data = JSON.parse(body);
  } catch {}

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      elapsedMs,
      error: body.slice(0, 1000)
    };
  }

  const articles = Array.isArray(data?.data)
    ? data.data.map(normalizeArticle)
    : [];

  const uniqueTitles = new Set(
    articles.map(a => a.title.toLowerCase()).filter(Boolean)
  );

  const uniqueSources = new Set(
    articles.map(a => a.source.toLowerCase()).filter(Boolean)
  );

  return {
    ok: true,
    status: response.status,
    elapsedMs,
    returned: articles.length,
    fresh6h: articles.filter(a => a.hoursOld !== null && a.hoursOld <= 6).length,
    fresh24h: articles.filter(a => a.hoursOld !== null && a.hoursOld <= 24).length,
    uniqueSources: uniqueSources.size,
    duplicateTitles: articles.length - uniqueTitles.size,
    articles
  };
}

export async function onRequestGet(context) {
  const apiKey = context.env.THE_NEWS_API_KEY;

  if (!apiKey) {
    return Response.json({
      ok: false,
      diagnostic: "the-news-api-test",
      error: "THE_NEWS_API_KEY is not configured."
    }, { status: 500 });
  }

  const started = Date.now();
  const results = {};

  for (const [category, apiCategory] of Object.entries(CATEGORIES)) {
    try {
      results[category] = await fetchCategory(apiKey, apiCategory);
    } catch (error) {
      results[category] = {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const successful = Object.values(results).filter(r => r.ok).length;
  const totalArticles = Object.values(results).reduce(
    (sum, r) => sum + (r.returned || 0), 0
  );

  return Response.json({
    ok: successful > 0,
    diagnostic: "the-news-api-test",
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    categories: results,
    summary: {
      categoriesTested: Object.keys(CATEGORIES).length,
      categoriesSuccessful: successful,
      totalArticles,
      maxPossibleArticles: Object.keys(CATEGORIES).length * 3
    }
  }, {
    status: successful > 0 ? 200 : 502,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
