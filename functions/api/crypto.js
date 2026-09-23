/* WORTH IT — CRYPTO CURRENCIES API */
const CMC_BASE = "https://pro-api.coinmarketcap.com/v1";
const MARKET_CACHE_SECONDS = 120;
const IMAGE_CACHE_SECONDS = 604800;

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

async function cmc(path, env) {
  const key = env && env.COINMARKETCAP_API_KEY;
  if (!key) return { ok:false, status:503, error:"COINMARKETCAP_API_KEY is not configured." };
  const request = new Request(CMC_BASE + path, { headers:{ "X-CMC_PRO_API_KEY":key, "Accept":"application/json" } });
  const response = await cachedFetch(request, MARKET_CACHE_SECONDS);
  const body = await response.text();
  if (!response.ok) return { ok:false, status:response.status, error:"CoinMarketCap request failed.", details:body.slice(0,400) };
  try { return { ok:true, data:JSON.parse(body) }; } catch(e) { return { ok:false, status:502, error:"Invalid CoinMarketCap response." }; }
}

function coin(item) {
  const q = item && item.quote && item.quote.USD || {};
  const text = norm((item.name || "") + " " + (item.symbol || ""));
  return {
    id:item.id, name:item.name, symbol:item.symbol, slug:item.slug, rank:Number(item.cmc_rank)||null,
    price:Number(q.price)||null, marketCap:Number(q.market_cap)||null, volume24h:Number(q.volume_24h)||null,
    change24h:Number(q.percent_change_24h)||null, circulatingSupply:Number(item.circulating_supply)||null,
    maxSupply:Number(item.max_supply)||null,
    stablecoin:/tether|usd coin|usdc|usdt|dai|trueusd|first digital usd|paypal usd|usde|usdd|frax|pax dollar|gemini dollar|binance usd/.test(text)
  };
}

async function market(env) {
  const list = await cmc("/cryptocurrency/listings/latest?start=1&limit=100&convert=USD", env);
  if (!list.ok) return json({error:list.error, details:list.details || null}, list.status, {"cache-control":"no-store"});
  const global = await cmc("/global-metrics/quotes/latest?convert=USD", env);
  const gd = global.ok ? global.data && global.data.data : null;
  return json({
    updatedAt:new Date().toISOString(),
    source:{name:"CoinMarketCap", url:"https://coinmarketcap.com/api/"},
    global:gd ? { totalMarketCap:Number(gd.quote && gd.quote.USD && gd.quote.USD.total_market_cap)||null, totalVolume24h:Number(gd.quote && gd.quote.USD && gd.quote.USD.total_volume_24h)||null, btcDominance:Number(gd.btc_dominance)||null, ethDominance:Number(gd.eth_dominance)||null, activeCryptocurrencies:Number(gd.active_cryptocurrencies)||null, activeMarkets:Number(gd.active_market_pairs)||null } : null,
    coins:Array.isArray(list.data && list.data.data) ? list.data.data.map(coin) : []
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
    if (url.searchParams.get("action") === "image") return await image(url);
    if (!url.searchParams.get("action") || url.searchParams.get("action") === "market") return await market(env);
    return json({error:"Unknown action.", availableActions:["market","image"]},400);
  } catch (e) {
    console.error("Crypto API error:", e);
    return json({error:"Crypto service temporarily unavailable."},502,{"cache-control":"no-store"});
  }
}