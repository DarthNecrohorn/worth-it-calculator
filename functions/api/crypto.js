/* WORTH IT — CRYPTO CURRENCIES API */
const CMC_BASE = "https://pro-api.coinmarketcap.com";
const MARKET_UPDATE_INTERVAL_TEXT = "about every 10 minutes";
const MARKET_CACHE_SECONDS = 600;
const IMAGE_CACHE_SECONDS = 604800;
const DETAIL_METADATA_CACHE_SECONDS = 86400;
const DETAIL_PERFORMANCE_CACHE_SECONDS = 1800;
const GLOBAL_CACHE_SECONDS = 3600;
const FX_CACHE_SECONDS = 3600;
const USD_FIAT_ID = 2781;

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120, s-maxage=120" }, headers || {})
  });
}

function norm(v) {
  return String(v || "").toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function allowedLicense(meta) {
  const text = [meta && meta.LicenseShortName && meta.LicenseShortName.value, meta && meta.License && meta.License.value, meta && meta.UsageTerms && meta.UsageTerms.value].filter(Boolean).join(" ").toLowerCase();
  if (!text || /non[- ]commercial|\\bnc\\b|no commercial|no derivatives|\\bnd\\b/.test(text)) return false;
  return /cc0|cc zero|public domain|cc by|cc by-sa|creative commons attribution/.test(text);
}

function imageMatches(title, name, symbol) {
  const t = norm(title), n = norm(name), s = norm(symbol);
  if (!t || !n) return false;
  if (t.indexOf(n) >= 0) return true;
  if (s.length >= 2 && (" " + t + " ").indexOf(" " + s + " ") >= 0) return true;
  const words = n.split(" ").filter(function(x){ return x.length >= 3; });
  return words.length > 1 && words.filter(function(x){ return t.indexOf(x) >= 0; }).length >= 2;
}

async function cachedFetch(request, seconds) {
  const cache = caches.default;
  const old = await cache.match(request);
  if (old) return old;
  const response = await fetch(request);
  if (response.ok) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "public, max-age=" + seconds + ", s-maxage=" + seconds);
    const cached = new Response(response.body, { status: response.status, headers: headers });
    await cache.put(request, cached.clone());
    return cached;
  }
  return response;
}

function parseCmcBody(body, httpStatus) {
  let data;

  try {
    data = JSON.parse(body);
  } catch(e) {
    return {
      ok:false,
      status:502,
      error:"Invalid CoinMarketCap response."
    };
  }

  const status = data && data.status;
  const errorCode =
    status && status.error_code != null
      ? String(status.error_code)
      : "0";

  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      ok:false,
      status:httpStatus,
      error:"CoinMarketCap request failed.",
      details:
        status && status.error_message
          ? String(status.error_message)
          : body.slice(0,400)
    };
  }

  /*
   * CMC can return an HTTP 200 response with a non-zero structured
   * error code. Treat that as a failed upstream request so the
   * keyless fallback can still be attempted.
   */
  if (errorCode !== "0") {
    return {
      ok:false,
      status:502,
      error:"CoinMarketCap request failed.",
      details:
        status && status.error_message
          ? String(status.error_message)
          : "CoinMarketCap error code " + errorCode + "."
    };
  }

  return {
    ok:true,
    data:data
  };
}

async function cmc(path, env, cacheSeconds = MARKET_CACHE_SECONDS) {
  const key = env && env.COINMARKETCAP_API_KEY;

  if (key) {
    const request = new Request(CMC_BASE + path, {
      headers:{
        "X-CMC_PRO_API_KEY":key,
        "Accept":"application/json"
      }
    });

    const response = await cachedFetch(request, cacheSeconds);
    const body = await response.text();
    const parsed = parseCmcBody(body, response.status);

    if (parsed.ok) {
      return parsed;
    }

    /*
     * If the configured Pro key is unavailable, expired, rate-limited,
     * not authorized for an endpoint, or otherwise rejected, fall
     * through to CMC's public API instead of taking Crypto offline.
     */
    console.warn(
      "CoinMarketCap keyed request failed; trying public API:",
      parsed.status,
      parsed.details || parsed.error || ""
    );
  }

  const publicRequest = new Request(
    CMC_BASE + "/public-api" + path,
    {
      headers:{
        "Accept":"application/json"
      }
    }
  );

  const publicResponse =
    await cachedFetch(
      publicRequest,
      cacheSeconds
    );

  const publicBody =
    await publicResponse.text();

  return parseCmcBody(
    publicBody,
    publicResponse.status
  );
}

function getQuote(item, symbol) {
  const quote =
    item &&
    item.quote;

  if (Array.isArray(quote)) {
    return (
      quote.find(
        entry =>
          String(entry && entry.symbol || "").toUpperCase() ===
          String(symbol || "").toUpperCase()
      ) ||
      quote[0] ||
      {}
    );
  }

  return quote && quote[symbol] || quote || {};
}

function coin(item, usdToEurRate) {
  const q = getQuote(item, "USD");
  const usdPrice = Number(q.price);
  const eurPrice =
    Number.isFinite(usdPrice) &&
    Number.isFinite(usdToEurRate) &&
    usdToEurRate > 0
      ? usdPrice * usdToEurRate
      : null;
  const text = norm((item.name || "") + " " + (item.symbol || ""));

  return {
    id:item.id,
    name:item.name,
    symbol:item.symbol,
    slug:item.slug,
    rank:Number(item.cmc_rank)||null,
    price:Number.isFinite(usdPrice) ? usdPrice : null,
    priceEUR:eurPrice,
    marketCap:Number(q.market_cap)||null,
    volume24h:Number(q.volume_24h)||null,
    change24h:Number(q.percent_change_24h)||null,
    circulatingSupply:Number(item.circulating_supply)||null,
    maxSupply:Number(item.max_supply)||null,
    stablecoin:/tether|usd coin|usdc|usdt|dai|trueusd|first digital usd|paypal usd|usde|usdd|frax|pax dollar|gemini dollar|binance usd/.test(text)
  };
}

async function getUsdToEurRate(env) {
  const result = await cmc(
    "/v2/tools/price-conversion?amount=1&id=" +
      USD_FIAT_ID +
      "&convert=EUR",
    env,
    FX_CACHE_SECONDS
  );

  if (!result.ok) {
    console.warn(
      "CoinMarketCap USD→EUR conversion failed:",
      result.status,
      result.details || result.error || ""
    );
    return null;
  }

  const data = result.data && result.data.data;
  const quote = data && data.quote;

  let eur = null;

  if (Array.isArray(quote)) {
    eur =
      quote.find(
        entry =>
          String(entry && entry.symbol || "").toUpperCase() === "EUR"
      ) || null;
  } else if (quote && quote.EUR) {
    eur = quote.EUR;
  }

  const rate =
    eur && typeof eur === "object"
      ? Number(eur.price)
      : Number(eur);

  return Number.isFinite(rate) && rate > 0
    ? rate
    : null;
}

async function market(env) {
  /*
   * Use one conversion only on the main listings request.
   * CMC Basic currently allows one currency conversion per call.
   * EUR prices are derived from a separately cached USD→EUR rate.
   */
  const list =
    await cmc(
      "/v3/cryptocurrency/listings/latest?start=1&limit=500&convert=USD",
      env
    );

  if (!list.ok) {
    return json(
      {
        error:list.error,
        details:list.details || null
      },
      list.status,
      {"cache-control":"no-store"}
    );
  }

  const [usdToEurRate, global] =
    await Promise.all([
      getUsdToEurRate(env),
      cmc(
        "/v1/global-metrics/quotes/latest?convert=USD",
        env,
        GLOBAL_CACHE_SECONDS
      )
    ]);

  const gd =
    global.ok
      ? global.data && global.data.data
      : null;

  const listStatus =
    list.data && list.data.status;

  return json({
    updatedAt:
      listStatus && listStatus.timestamp
        ? listStatus.timestamp
        : new Date().toISOString(),

    source:{
      name:"CoinMarketCap",
      url:"https://coinmarketcap.com/api/"
    },

    global:
      gd
        ? {
            totalMarketCap:
              Number(
                gd.quote &&
                gd.quote.USD &&
                gd.quote.USD.total_market_cap
              ) || null,

            totalVolume24h:
              Number(
                gd.quote &&
                gd.quote.USD &&
                gd.quote.USD.total_volume_24h
              ) || null,

            btcDominance:
              Number(gd.btc_dominance) || null,

            ethDominance:
              Number(gd.eth_dominance) || null,

            activeCryptocurrencies:
              Number(gd.active_cryptocurrencies) || null,

            activeMarkets:
              Number(gd.active_market_pairs) || null
          }
        : null,

    coins:
      Array.isArray(
        list.data && list.data.data
      )
        ? list.data.data.map(item => coin(item, usdToEurRate))
        : []
  });
}

async function detail(url, env) {
  const id = url.searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) return json({error:"Invalid cryptocurrency id."},400);

  const metadataUrl =
    "https://pro-api.coinmarketcap.com/public-api/v2/cryptocurrency/info?id=" +
    encodeURIComponent(id) + "&aux=description,urls,date_added,tags,category";
  const metadataResponse = await cachedFetch(
    new Request(metadataUrl),
    DETAIL_METADATA_CACHE_SECONDS
  );

  let metadataPayload = null;
  if (metadataResponse.ok) {
    try { metadataPayload = await metadataResponse.json(); } catch (e) {}
  }

  const performance = await cmc(
    "/v2/cryptocurrency/price-performance-stats/latest?id=" +
    encodeURIComponent(id) +
    "&time_period=1h,24h,7d,30d,90d,365d",
    env,
    DETAIL_PERFORMANCE_CACHE_SECONDS
  );

  const raw = metadataPayload && metadataPayload.data;
  const meta = raw && (raw[id] || Object.values(raw)[0]) || {};

  let performanceData = null;
  if (performance.ok) {
    const p = performance.data && performance.data.data;
    performanceData = p && (p[id] || Object.values(p)[0]) || null;
  }

  const periods = performanceData && performanceData.periods;
  const usd = periods && periods.USD ? periods.USD : {};

  const normalizePeriod = name => {
    const q = usd[name] && usd[name].quote && usd[name].quote.USD;
    if (!q) return null;
    return {
      open: Number(q.open) || null,
      high: Number(q.high) || null,
      low: Number(q.low) || null,
      close: Number(q.close) || null,
      percentChange: Number(q.percent_change) || null,
      priceChange: Number(q.price_change) || null
    };
  };

  return json({
    id:Number(id),
    metadata:{
      name:meta.name || null,
      symbol:meta.symbol || null,
      category:meta.category || null,
      description:meta.description || null,
      dateAdded:meta.date_added || null,
      tags:Array.isArray(meta.tags) ? meta.tags.slice(0,12) : [],
      website:Array.isArray(meta.urls && meta.urls.website) ? meta.urls.website[0] || null : null,
      whitepaper:Array.isArray(meta.urls && meta.urls.technical_doc) ? meta.urls.technical_doc[0] || null : null,
      explorer:Array.isArray(meta.urls && meta.urls.explorer) ? meta.urls.explorer[0] || null : null
    },
    performance:{
      "1h":normalizePeriod("1h"),
      "24h":normalizePeriod("24h"),
      "7d":normalizePeriod("7d"),
      "30d":normalizePeriod("30d"),
      "90d":normalizePeriod("90d"),
      "365d":normalizePeriod("365d")
    },
    source:{
      metadata:"CoinMarketCap keyless public metadata",
      performance:"CoinMarketCap API"
    }
  },200,{
    "cache-control":"public, max-age=" + DETAIL_PERFORMANCE_CACHE_SECONDS + ", s-maxage=" + DETAIL_PERFORMANCE_CACHE_SECONDS
  });
}

async function image(url) {
  const name = url.searchParams.get("name");
  const symbol = url.searchParams.get("symbol") || "";
  if (!name || name.length > 80) return json({image:null}, 400);
  const api = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=" + encodeURIComponent("\"" + name + "\" cryptocurrency logo") + "&prop=imageinfo&iiprop=url%7Cextmetadata";
  const response = await cachedFetch(new Request(api), IMAGE_CACHE_SECONDS);
  if (!response.ok) return json({image:null});
  let payload; try { payload = await response.json(); } catch(e) { return json({image:null}); }
  const pages = Object.values(payload && payload.query && payload.query.pages || {});
  for (const page of pages) {
    const info = page && page.imageinfo && page.imageinfo[0];
    const meta = info && info.extmetadata || {};
    if (info && info.url && imageMatches(page.title, name, symbol) && allowedLicense(meta)) {
      return json({image:{url:info.thumburl || info.url, title:page.title, license:meta.LicenseShortName && meta.LicenseShortName.value || "", source:"Wikimedia Commons", sourceUrl:"https://commons.wikimedia.org/"}}, 200, {"cache-control":"public, max-age=604800, s-maxage=604800"});
    }
  }
  return json({image:null}, 200, {"cache-control":"public, max-age=604800, s-maxage=604800"});
}

export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("action") === "detail") return await detail(url, env);
    if (url.searchParams.get("action") === "image") return await image(url);
    if (!url.searchParams.get("action") || url.searchParams.get("action") === "market") return await market(env);
    return json({error:"Unknown action.", availableActions:["market","detail","image"]},400);
  } catch (e) {
    console.error("Crypto API error:", e);
    return json({error:"Crypto service temporarily unavailable."},502,{"cache-control":"no-store"});
  }
}