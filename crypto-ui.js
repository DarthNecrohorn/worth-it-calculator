/* WORTH IT — CRYPTO CURRENCIES UI */
(() => {
  "use strict";
  const state={loaded:false,loading:false,coins:[],global:null,filter:"popular",search:"",sort:"rank",queue:[],active:0,max:3,showAll:false};
  const CACHE_KEY="worthit.crypto.market.v1";
  const BROWSER_FRESH_MS=5*60*1000;
  const BROWSER_STALE_MS=30*60*1000;
  const DETAIL_BROWSER_CACHE="worthit.crypto.detail.v1.";
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  function money(v){const n=Number(v);if(!Number.isFinite(n))return "—";const a=Math.abs(n),d=a>=1e12?1e12:a>=1e9?1e9:a>=1e6?1e6:a>=1e3?1e3:1,s=a>=1e12?"T":a>=1e9?"B":a>=1e6?"M":a>=1e3?"K":"";return "$"+(n/d).toFixed(s?1:2)+s;}
  function price(v){const n=Number(v);if(!Number.isFinite(n))return "—";if(n>=1000)return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n);if(n>=1)return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:4}).format(n);return "$"+n.toLocaleString("en-US",{maximumFractionDigits:10});}
  function pct(v){const n=Number(v);return Number.isFinite(n)?(n>=0?"+":"")+n.toFixed(2)+"%":"—";}
  function filtered(){let a=state.coins.slice();if(state.filter==="gainers")a=a.filter(x=>Number(x.change24h)>0);if(state.filter==="losers")a=a.filter(x=>Number(x.change24h)<0);if(state.filter==="stablecoins")a=a.filter(x=>x.stablecoin);if(state.search){const q=state.search.toLowerCase();a=a.filter(x=>String(x.name).toLowerCase().includes(q)||String(x.symbol).toLowerCase().includes(q));}const key=state.sort;if(key==="gainers")return a.sort((x,y)=>(y.change24h||-Infinity)-(x.change24h||-Infinity));if(key==="losers")return a.sort((x,y)=>(x.change24h||Infinity)-(y.change24h||Infinity));if(key==="volume")return a.sort((x,y)=>(y.volume24h||0)-(x.volume24h||0));if(key==="marketCap")return a.sort((x,y)=>(y.marketCap||0)-(x.marketCap||0));return a.sort((x,y)=>(x.rank||Infinity)-(y.rank||Infinity));}
  function renderGlobal(){const h=$("cryptoGlobalStats"),g=state.global||{};if(!h)return;h.innerHTML=[["Market Cap",money(g.totalMarketCap)],["24h Volume",money(g.totalVolume24h)],["BTC Dominance",Number.isFinite(g.btcDominance)?g.btcDominance.toFixed(2)+"%":"—"],["ETH Dominance",Number.isFinite(g.ethDominance)?g.ethDominance.toFixed(2)+"%":"—"],["Active Coins",Number(g.activeCryptocurrencies||0).toLocaleString("en-US")]].map(x=>"<div class=\"crypto-stat-card\"><span>"+esc(x[0])+"</span><strong>"+esc(x[1])+"</strong></div>").join("");}
  function renderFilters(){const h=$("cryptoFilters");if(!h)return;h.querySelectorAll("button[data-crypto-filter]").forEach(b=>b.classList.toggle("active",b.dataset.cryptoFilter===state.filter));}
  function formatSupply(v){
    const n=Number(v);
    if(!Number.isFinite(n))return "—";
    return n.toLocaleString("en-US",{maximumFractionDigits:2});
  }

  function detailFormatDate(v){
    if(!v)return "—";
    const d=new Date(v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});
  }

  function renderPerformance(performance){
    const holder=$("cryptoPerformanceChart");
    if(!holder)return;
    const keys=["1h","24h","7d","30d","90d","365d"];
    const valid=keys.map(k=>({key:k,item:performance&&performance[k]})).filter(x=>x.item&&Number.isFinite(Number(x.item.percentChange)));
    if(!valid.length){
      holder.innerHTML='<div class="crypto-detail-no-chart">Performance history is not available for this cryptocurrency.</div>';
      return;
    }
    const max=Math.max(1,...valid.map(x=>Math.abs(Number(x.item.percentChange))));
    holder.innerHTML=valid.map(x=>{
      const value=Number(x.item.percentChange);
      const width=Math.min(100,Math.max(3,Math.abs(value)/max*100));
      const cls=value>=0?"positive":"negative";
      return '<div class="crypto-performance-row"><span>'+esc(x.key)+'</span><div class="crypto-performance-track"><i class="'+cls+'" style="width:'+width+'%"></i></div><strong class="'+cls+'">'+esc(pct(value))+'</strong></div>';
    }).join("");
  }

  function applyDetail(detail,coin){
    const overlay=$("cryptoDetailOverlay");
    if(!overlay)return;
    const md=detail&&detail.metadata||{};
    $("cryptoDetailTitle").textContent=md.name||coin.name;
    $("cryptoDetailSymbol").textContent=md.symbol||coin.symbol;
    $("cryptoDetailRank").textContent=coin.rank?"Rank #"+coin.rank:"";
    $("cryptoDetailPrice").textContent=price(coin.price);

    const change=$("cryptoDetailChange");
    change.textContent=pct(coin.change24h);
    change.className="crypto-detail-change "+(Number(coin.change24h)>=0?"positive":"negative");

    $("cryptoDetailImage").innerHTML='<span>🪙</span>';
    const metrics=[
      ["Market Cap",money(coin.marketCap)],
      ["24h Volume",money(coin.volume24h)],
      ["Circulating Supply",formatSupply(coin.circulatingSupply)],
      ["Max Supply",formatSupply(coin.maxSupply)]
    ];
    $("cryptoDetailMetrics").innerHTML=metrics.map(x=>'<div><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join("");

    $("cryptoDetailDescription").innerHTML=md.description
      ? '<strong>About</strong><p>'+esc(md.description)+'</p>'
      : '<strong>About</strong><p>No description is available for this cryptocurrency.</p>';

    const links=[
      md.website?'<a href="'+esc(md.website)+'" target="_blank" rel="noopener noreferrer">Official website →</a>':"",
      md.whitepaper?'<a href="'+esc(md.whitepaper)+'" target="_blank" rel="noopener noreferrer">Whitepaper →</a>':"",
      md.explorer?'<a href="'+esc(md.explorer)+'" target="_blank" rel="noopener noreferrer">Explorer →</a>':""
    ].filter(Boolean);
    $("cryptoDetailLinks").innerHTML=links.join("");

    $("cryptoDetailTags").innerHTML=Array.isArray(md.tags)&&md.tags.length
      ? '<strong>Tags</strong>'+md.tags.map(t=>'<span>'+esc(t)+'</span>').join("")
      : "";

    renderPerformance(detail&&detail.performance);
    $("cryptoDetailSource").textContent="Market data and metadata by CoinMarketCap. Detail data is cached.";
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
  }

  async function openDetail(coin){
    const overlay=$("cryptoDetailOverlay");
    if(!overlay)return;
    const key=DETAIL_BROWSER_CACHE+coin.id;

    try{
      const raw=localStorage.getItem(key);
      if(raw){
        const cached=JSON.parse(raw);
        if(cached&&cached.savedAt&&Date.now()-Number(cached.savedAt)<24*60*60*1000){
          applyDetail(cached.data,coin);
          return;
        }
      }
    }catch(e){}

    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
    $("cryptoDetailTitle").textContent=coin.name;
    $("cryptoDetailSymbol").textContent=coin.symbol;
    $("cryptoDetailRank").textContent=coin.rank?"Rank #"+coin.rank:"";
    $("cryptoDetailPrice").textContent=price(coin.price);
    $("cryptoDetailChange").textContent=pct(coin.change24h);
    $("cryptoDetailMetrics").innerHTML='<div class="crypto-detail-loading">Loading additional information…</div>';
    $("cryptoDetailDescription").innerHTML="";
    $("cryptoDetailLinks").innerHTML="";
    $("cryptoDetailTags").innerHTML="";
    $("cryptoPerformanceChart").innerHTML='<div class="crypto-detail-loading">Loading performance…</div>';

    try{
      const response=await fetch("/api/crypto?action=detail&id="+encodeURIComponent(coin.id),{cache:"force-cache"});
      if(!response.ok)throw new Error("Detail request failed");
      const detail=await response.json();
      try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data:detail}));}catch(e){}
      applyDetail(detail,coin);
    }catch(e){
      console.error("Crypto detail load failed",e);
      $("cryptoDetailDescription").innerHTML='<strong>Additional information is temporarily unavailable.</strong><p>The current market data is still available.</p>';
      renderPerformance(null);
    }
  }

  function closeDetail(){
    const overlay=$("cryptoDetailOverlay");
    if(!overlay)return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
  }

  function render(){
    const g=$("cryptoGrid"),c=$("cryptoResultsCount"),a=filtered();
    const v=a.slice(0,state.showAll?500:20);
    const oldPager=$("cryptoPager");
    if(oldPager)oldPager.remove();

    if(c)c.textContent=state.search
      ?"Showing "+v.length+" of "+a.length+" results"
      :"Showing "+v.length+" of "+a.length;

    if(!g)return;

    if(!v.length){
      g.innerHTML="<div class=\"crypto-empty\"><strong>No cryptocurrencies found</strong><span>Try another search or filter.</span></div>";
      return;
    }

    g.innerHTML=v.map((x,i)=>"<article class=\"crypto-card\" tabindex=\"0\" role=\"button\" data-crypto-id=\""+x.id+"\" aria-label=\"Open cryptocurrency details\"><div class=\"crypto-card-top\"><div class=\"crypto-image-wrap\"><div class=\"crypto-image-placeholder\">🪙</div><img class=\"crypto-image\" loading=\"lazy\" decoding=\"async\" aria-hidden=\"true\" alt=\"\" data-image-index=\""+i+"\" data-coin-name=\""+esc(x.name)+"\" data-coin-symbol=\""+esc(x.symbol)+"\"></div><div class=\"crypto-card-name\"><strong>"+esc(x.name)+"</strong><span>"+esc(x.symbol)+" · #"+esc(x.rank||"—")+"</span></div></div><div class=\"crypto-price-row\"><strong>"+esc(price(x.price))+"</strong><span class=\"crypto-change "+(Number(x.change24h)>=0?"positive":"negative")+"\">"+esc(pct(x.change24h))+"</span></div><div class=\"crypto-metrics\"><div><span>Market Cap</span><strong>"+esc(money(x.marketCap))+"</strong></div><div><span>24h Volume</span><strong>"+esc(money(x.volume24h))+"</strong></div></div></article>").join("");

    observeImages();
    g.querySelectorAll(".crypto-card").forEach(card=>{
      const coin=state.coins.find(x=>String(x.id)===String(card.dataset.cryptoId));
      if(!coin)return;
      card.addEventListener("click",()=>openDetail(coin));
      card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetail(coin);}});
    });

    if(a.length>20){
      const pager=document.createElement("div");
      pager.id="cryptoPager";
      pager.className="crypto-pager";
      pager.innerHTML="<button type=\"button\" class=\"crypto-show-btn\">"+(state.showAll?"Show Less":"Show All ("+a.length+")")+" <span>→</span></button>";
      pager.querySelector("button").addEventListener("click",()=>{
        state.showAll=!state.showAll;
        render();
      });
      g.after(pager);
    }
  }
  async function loadImage(img){try{const r=await fetch("/api/crypto?action=image&name="+encodeURIComponent(img.dataset.coinName)+"&symbol="+encodeURIComponent(img.dataset.coinSymbol),{cache:"force-cache"});if(!r.ok)return;const d=await r.json();if(d.image&&d.image.url){img.src=d.image.url;img.alt=img.dataset.coinName+" logo";img.onload=()=>img.classList.add("loaded");}}catch(e){console.warn("Crypto image load failed",e);}}
  function runQueue(){while(state.active<state.max&&state.queue.length){const img=state.queue.shift();if(!img||img.dataset.queued==="1")continue;img.dataset.queued="1";state.active++;loadImage(img).finally(()=>{state.active--;runQueue();});}}
  function observeImages(){state.queue=[];const imgs=[...document.querySelectorAll("#cryptoGrid .crypto-image")];if(!imgs.length)return;if(!("IntersectionObserver"in window)){state.queue=imgs;runQueue();return;}const o=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){o.unobserve(e.target);if(e.target.dataset.queued!=="1")state.queue.push(e.target);}});runQueue();},{rootMargin:"500px 0px"});imgs.forEach(i=>o.observe(i));}
  function readBrowserCache(allowStale){
    try{
      const raw=localStorage.getItem(CACHE_KEY);
      if(!raw)return null;
      const cached=JSON.parse(raw);
      if(!cached||!cached.savedAt||!cached.data)return null;
      const age=Date.now()-Number(cached.savedAt);
      const limit=allowStale?BROWSER_STALE_MS:BROWSER_FRESH_MS;
      if(age<0||age>limit)return null;
      return {data:cached.data,age:age};
    }catch(e){return null;}
  }

  function applyData(data){
    state.coins=Array.isArray(data&&data.coins)?data.coins:[];
    state.global=data&&data.global||null;
    state.loaded=true;
    renderGlobal();
    renderFilters();
    render();
  }

  function saveBrowserCache(data){
    try{
      localStorage.setItem(CACHE_KEY,JSON.stringify({
        savedAt:Date.now(),
        data:data
      }));
    }catch(e){}
  }

  async function fetchFresh(){
    const r=await fetch("/api/crypto?action=market",{cache:"no-store"});
    if(!r.ok)throw new Error("Crypto API request failed");
    const d=await r.json();
    saveBrowserCache(d);
    applyData(d);
    return d;
  }

  async function load(force){
    if(state.loading)return;

    if(!force){
      const fresh=readBrowserCache(false);
      if(fresh){
        applyData(fresh.data);
        return;
      }

      const stale=readBrowserCache(true);
      if(stale){
        applyData(stale.data);
        fetchFresh().catch(e=>console.warn("Crypto background refresh failed",e));
        return;
      }
    }

    state.loading=true;
    const g=$("cryptoGrid");
    if(g&&!state.loaded){
      g.innerHTML="<div class=\"crypto-loading\"><span>🪙</span><strong>Loading cryptocurrencies…</strong></div>";
    }

    try{
      await fetchFresh();
    }catch(e){
      console.error(e);

      const fallback=readBrowserCache(true);
      if(fallback){
        applyData(fallback.data);
        return;
      }

      if(g)g.innerHTML="<div class=\"crypto-empty\"><strong>Crypto data is temporarily unavailable.</strong><span>Please try again later.</span></div>";
    }finally{
      state.loading=false;
    }
  }

  function bind(){
    $("cryptoDetailClose")?.addEventListener("click",closeDetail);
    $("cryptoDetailOverlay")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeDetail();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail();});
const s=$("cryptoSection");if(!s||s.dataset.cryptoBound==="1")return;s.dataset.cryptoBound="1";$("cryptoFilters")?.addEventListener("click",e=>{const b=e.target.closest("button[data-crypto-filter]");if(!b)return;state.filter=b.dataset.cryptoFilter;state.sort=state.filter==="gainers"?"gainers":state.filter==="losers"?"losers":state.filter==="volume"?"volume":state.filter==="marketCap"?"marketCap":"rank";renderFilters();render();});$("cryptoSearch")?.addEventListener("input",e=>{state.search=e.target.value.trim();render();});$("cryptoRefresh")?.addEventListener("click",()=>{state.loaded=false;load(true);});}
  window.initCryptoUI=()=>{bind();if(!state.loaded)load();else{renderGlobal();renderFilters();render();}};
})();