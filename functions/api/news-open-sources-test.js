export async function onRequestGet() {
  const started = Date.now();

  const urls = {
    openNewswire: "https://feed.opennewswire.org/",
    stormNews: "https://stormnews.org/feed.json",
    wikinews: "https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&namespace=0&count=30&hourcount=168"
  };

  function clean(value) {
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

  function domain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function ageHours(value) {
    if (!value) return null;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return null;
    return Number(((Date.now() - time) / 3600000).toFixed(2));
  }

  async function get(url) {
    const start = Date.now();
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Worth-It-News-Diagnostic/1.0" }
      });
      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        ms: Date.now() - start,
        type: response.headers.get("content-type") || "",
        bytes: body.length,
        body
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        ms: Date.now() - start,
        type: "",
        bytes: 0,
        body: "",
        error: String(error)
      };
    }
  }

  function summarize(items) {
    const valid = items.filter(item => item.title);
    const ages = valid.map(item => item.ageHours).filter(age => age !== null && age >= 0);
    const titles = new Set();
    let duplicateCount = 0;

    for (const item of valid) {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (key && titles.has(key)) duplicateCount++;
      if (key) titles.add(key);
    }

    return {
      count: valid.length,
      uniqueDomains: new Set(valid.map(item => item.domain).filter(Boolean)).size,
      fresh6h: ages.filter(age => age <= 6).length,
      fresh24h: ages.filter(age => age <= 24).length,
      fresh48h: ages.filter(age => age <= 48).length,
      fresh96h: ages.filter(age => age <= 96).length,
      newestAgeHours: ages.length ? Math.min(...ages) : null,
      oldestAgeHours: ages.length ? Math.max(...ages) : null,
      duplicateTitles: duplicateCount
    };
  }

  function parseAtom(xml) {
    const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
    return entries.map(entry => {
      const title = clean((entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ["", ""])[1]);
      const date = (entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || ["", ""])[1]
        || (entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || ["", ""])[1];
      const link = (entry.match(/<link[^>]+href=["']([^"']+)["']/i) || ["", ""])[1];
      const description = clean(
        (entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || ["", ""])[1]
        || (entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i) || ["", ""])[1]
      );
      return {
        title,
        date,
        ageHours: ageHours(date),
        link,
        domain: domain(link),
        description
      };
    }).filter(item => item.title);
  }

  function parseStorm(text) {
    try {
      const json = JSON.parse(text);
      const items = Array.isArray(json.items) ? json.items : (Array.isArray(json.articles) ? json.articles : []);
      return items.map(item => {
        const date = item.date_published || item.published || item.pubDate || item.date || "";
        const link = item.url || item.external_url || item.link || "";
        return {
          title: clean(item.title || item.name || ""),
          date,
          ageHours: ageHours(date),
          link,
          domain: domain(link),
          description: clean(item.content_text || item.description || item.summary || item.excerpt || ""),
          tags: Array.isArray(item.tags) ? item.tags : []
        };
      }).filter(item => item.title);
    } catch {
      return [];
    }
  }

  const open = await get(urls.openNewswire);
  const storm = await get(urls.stormNews);
  const wiki = await get(urls.wikinews);

  const openLicenseMatches = [...open.body.matchAll(/CC BY(?:-[A-Z]+)?|Attribution\+|Public Domain/gi)]
    .map(match => match[0]);

  function parseOpenNewswire(html) {
    const items = [];
    const seen = new Set();

    // Open Newswire is a Next.js page rather than an <article>-tag feed.
    // The rendered page contains internal /article/<id> links, often twice
    // (desktop + mobile). Extract those links directly and deduplicate them.
    const linkRe = /<a\b[^>]*href=["']([^"']*\/article\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    for (const match of html.matchAll(linkRe)) {
      const rawLink = match[1] || "";
      const title = clean(match[2] || "");
      if (!title || title.length < 10) continue;

      const link = rawLink.startsWith("http")
        ? rawLink
        : new URL(rawLink, urls.openNewswire).href;

      const key = link + "|" + title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // License badges and source metadata are rendered close to the article
      // link. Inspect a bounded neighborhood instead of assuming a fixed tag.
      const matchIndex = match.index || 0;
      const startIndex = Math.max(0, matchIndex - 2500);
      const endIndex = Math.min(html.length, matchIndex + match[0].length + 2500);
      const neighborhood = html.slice(startIndex, endIndex);

      const license = (
        neighborhood.match(
          /CC BY(?:-[A-Z]+)?|Attribution\+|Public Domain|public domain/gi
        ) || []
      )[0] || "";

      items.push({
        title,
        link,
        domain: domain(link),
        license
      });
    }

    return items;
  }

  const openItems = parseOpenNewswire(open.body);
  const stormItems = parseStorm(storm.body);
  const wikiItems = wiki.ok ? parseAtom(wiki.body) : [];

  const result = {
    readOnly: true,
    productionNewsSystemTouched: false,
    generatedAt: new Date().toISOString(),
    totalElapsedMs: Date.now() - started,

    openNewswire: {
      request: {
        status: open.status,
        ok: open.ok,
        ms: open.ms,
        contentType: open.type,
        bytes: open.bytes
      },
      summary: summarize(openItems),
      licenseTagsDetected: [...new Set(openLicenseMatches)],
      licenseTagCounts: openLicenseMatches.reduce((out, value) => {
        out[value] = (out[value] || 0) + 1;
        return out;
      }, {}),
      sample: openItems.slice(0, 30),
      licensingNote: "Open Newswire indicates that republication conditions can vary by source/article."
    },

    stormNews: {
      request: {
        status: storm.status,
        ok: storm.ok,
        ms: storm.ms,
        contentType: storm.type,
        bytes: storm.bytes
      },
      summary: summarize(stormItems),
      sample: stormItems.slice(0, 30),
      licensingNote: "Storm News publicly states its feeds are CC BY 4.0; this diagnostic checks whether license metadata is also present in the feed."
    },

    wikinews: {
      request: {
        status: wiki.status,
        ok: wiki.ok,
        ms: wiki.ms,
        contentType: wiki.type,
        bytes: wiki.bytes
      },
      summary: summarize(wikiItems),
      sample: wikiItems.slice(0, 30),
      licensingNote: "English Wikinews states that material published after December 16, 2024 is CC BY 4.0 unless otherwise specified."
    }
  };

  result.combined = {
    totalArticles: openItems.length + stormItems.length + wikiItems.length,
    totalFresh24h:
      summarize(openItems).fresh24h +
      summarize(stormItems).fresh24h +
      summarize(wikiItems).fresh24h
  };

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
