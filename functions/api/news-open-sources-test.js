export async function onRequestGet(context) {
  const startedAt = Date.now();

  const sources = {
    openNewswire: "https://feed.opennewswire.org/",
    stormNews: "https://stormnews.org/feed.json",
    wikinews: "https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&notcategories=No%20publish%7CArchived%7CAutoArchived%7Cdisputed&namespace=0&count=30&hourcount=168&ordermethod=categoryadd&stablepages=only"
  };

  const results = {};

  function ageHours(value) {
    if (!value) return null;
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return null;
    return Number(((Date.now() - t) / 3600000).toFixed(2));
  }

  function stripHtml(value) {
    return String(value || "")
      .replace(/<!\[CDATA\[/g, "")
      .replace(/\]\]>/g, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function domainOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = String(item.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchSource(name, url) {
    const start = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Worth-It-News-Diagnostic/1.0"
        },
        cf: {
          cacheTtl: 0,
          cacheEverything: false
        }
      });

      const body = await response.text();

      return {
        name,
        url,
        ok: response.ok,
        status: response.status,
        elapsedMs: Date.now() - start,
        contentType: response.headers.get("content-type") || "",
        bytes: body.length,
        body
      };
    } catch (error) {
      return {
        name,
        url,
        ok: false,
        status: 0,
        elapsedMs: Date.now() - start,
        contentType: "",
        bytes: 0,
        body: "",
        error: String(error)
      };
    }
  }

  function parseAtom(xml) {
    const items = [];
    const matches = xml.match(/<entry[\\s\\S]*?<\\/entry>/gi) || [];

    for (const entry of matches) {
      const title = stripHtml((entry.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i) || [,""])[1]);
      const published =
        (entry.match(/<published[^>]*>([\\s\\S]*?)<\\/published>/i) || [,""])[1] ||
        (entry.match(/<updated[^>]*>([\\s\\S]*?)<\\/updated>/i) || [,""])[1];

      const linkMatch = entry.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
      const link = linkMatch ? linkMatch[1] : "";

      const summary =
        (entry.match(/<summary[^>]*>([\\s\\S]*?)<\\/summary>/i) || [,""])[1] ||
        (entry.match(/<content[^>]*>([\\s\\S]*?)<\\/content>/i) || [,""])[1];

      items.push({
        title,
        date: published,
        ageHours: ageHours(published),
        link,
        domain: domainOf(link),
        description: stripHtml(summary)
      });
    }

    return items;
  }

  function parseStorm(json) {
    const raw = Array.isArray(json?.items)
      ? json.items
      : Array.isArray(json?.articles)
        ? json.articles
        : [];

    return raw.map(item => ({
      title: stripHtml(item.title || item.name || ""),
      date: item.date_published || item.published || item.pubDate || item.date || "",
      ageHours: ageHours(item.date_published || item.published || item.pubDate || item.date || ""),
      link: item.url || item.external_url || item.link || "",
      domain: domainOf(item.url || item.external_url || item.link || ""),
      description: stripHtml(item.content_text || item.description || item.summary || item.excerpt || ""),
      author: item.author?.name || item.author || "",
      tags: Array.isArray(item.tags) ? item.tags : []
    }));
  }

  function summarize(items) {
    const valid = items.filter(x => x.title);
    const domains = new Set(valid.map(x => x.domain).filter(Boolean));
    const fresh6 = valid.filter(x => x.ageHours !== null && x.ageHours >= 0 && x.ageHours <= 6).length;
    const fresh24 = valid.filter(x => x.ageHours !== null && x.ageHours >= 0 && x.ageHours <= 24).length;
    const fresh48 = valid.filter(x => x.ageHours !== null && x.ageHours >= 0 && x.ageHours <= 48).length;
    const fresh96 = valid.filter(x => x.ageHours !== null && x.ageHours >= 0 && x.ageHours <= 96).length;

    return {
      count: valid.length,
      uniqueDomains: domains.size,
      fresh6h: fresh6,
      fresh24h: fresh24,
      fresh48h: fresh48,
      fresh96h: fresh96,
      newest: valid
        .filter(x => x.ageHours !== null)
        .sort((a, b) => a.ageHours - b.ageHours)[0] || null,
      oldest: valid
        .filter(x => x.ageHours !== null)
        .sort((a, b) => b.ageHours - a.ageHours)[0] || null,
      duplicateTitleGroups: valid.length - dedupe(valid).length
    };
  }

  // 1) Open Newswire
  const openRaw = await fetchSource("Open Newswire", sources.openNewswire);
  const openBody = openRaw.body;

  const openItems = [];
  const openBlocks = openBody.match(/<article[\\s\\S]*?<\\/article>/gi) || [];

  for (const block of openBlocks) {
    const title =
      stripHtml((block.match(/<h[1-6][^>]*>([\\s\\S]*?)<\\/h[1-6]>/i) || [,""])[1]) ||
      stripHtml((block.match(/<a[^>]+>([\\s\\S]{15,250})<\\/a>/i) || [,""])[1]);

    const href = (block.match(/<a[^>]+href=["']([^"']+)["']/i) || [,""])[1];

    const licenseText =
      stripHtml(
        (block.match(/(CC BY(?:-[A-Z]+)?|Attribution\\+|Public Domain)[\\s\\S]{0,150}/i) || [,""])[1]
      );

    if (title) {
      openItems.push({
        title,
        link: href,
        domain: domainOf(href),
        license: licenseText || "",
        date: "",
        ageHours: null,
        description: stripHtml(block).slice(0, 500)
      });
    }
  }

  // Fallback: Open Newswire currently exposes article cards directly in HTML.
  // Capture license tags and article titles even if the exact HTML structure changes.
  const licenseMatches = [...openBody.matchAll(/(?:CC BY(?:-[A-Z]+)?|Attribution\\+|Public Domain)/gi)]
    .map(m => m[0]);

  results.openNewswire = {
    request: {
      url: sources.openNewswire,
      status: openRaw.status,
      ok: openRaw.ok,
      elapsedMs: openRaw.elapsedMs,
      contentType: openRaw.contentType,
      bytes: openRaw.bytes
    },
    summary: summarize(openItems),
    licenseTagsDetected: [...new Set(licenseMatches)],
    licenseTagCounts: licenseMatches.reduce((acc, x) => {
      acc[x] = (acc[x] || 0) + 1;
      return acc;
    }, {}),
    sample: dedupe(openItems).slice(0, 40).map(x => ({
      title: x.title,
      link: x.link,
      domain: x.domain,
      license: x.license,
      ageHours: x.ageHours
    })),
    note: "Open Newswire is an RSS aggregator; its own site says republication conditions can vary by source/article, so individual license/source terms must be respected."
  };

  // 2) Storm News
  const stormRaw = await fetchSource("Storm News", sources.stormNews);
  let stormItems = [];

  try {
    stormItems = parseStorm(JSON.parse(stormRaw.body));
  } catch {}

  results.stormNews = {
    request: {
      url: sources.stormNews,
      status: stormRaw.status,
      ok: stormRaw.ok,
      elapsedMs: stormRaw.elapsedMs,
      contentType: stormRaw.contentType,
      bytes: stormRaw.bytes
    },
    summary: summarize(stormItems),
    licenseFieldsDetected: stormItems
      .flatMap(x => [x.license, x.rights, x.copyright])
      .filter(Boolean),
    sample: stormItems.slice(0, 40),
    externalLicenseCheck: {
      publishedSiteClaim: "Storm News states its feeds/APIs are free and CC BY 4.0.",
      source: "https://stormnews.org/feeds"
    }
  };

  // 3) Wikinews
  const wikiRaw = await fetchSource("Wikinews", sources.wikinews);
  const wikiItems = wikiRaw.ok ? parseAtom(wikiRaw.body) : [];

  results.wikinews = {
    request: {
      url: sources.wikinews,
      status: wikiRaw.status,
      ok: wikiRaw.ok,
      elapsedMs: wikiRaw.elapsedMs,
      contentType: wikiRaw.contentType,
      bytes: wikiRaw.bytes
    },
    summary: summarize(wikiItems),
    sample: wikiItems.slice(0, 40),
    license: {
      currentEnglishWikinews: "CC BY 4.0 for material published after December 16, 2024, unless otherwise specified.",
      source: "https://en.wikinews.org/wiki/Wikinews:Copyright"
    }
  };

  const all = [
    ...openItems.map(x => ({ ...x, source: "Open Newswire" })),
    ...stormItems.map(x => ({ ...x, source: "Storm News" })),
    ...wikiItems.map(x => ({ ...x, source: "Wikinews" }))
  ];

  const fresh24 = all.filter(x => x.ageHours !== null && x.ageHours >= 0 && x.ageHours <= 24);

  results.combined = {
    totalArticles: all.length,
    totalFresh24h: fresh24.length,
    bySource: {
      openNewswire: results.openNewswire.summary,
      stormNews: results.stormNews.summary,
      wikinews: results.wikinews.summary
    }
  };

  results.meta = {
    generatedAt: new Date().toISOString(),
    totalElapsedMs: Date.now() - startedAt,
    readOnly: true,
    productionNewsSystemTouched: false
  };

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
