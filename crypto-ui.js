/* WORTH IT — CRYPTO CURRENCIES UI */
(() => {
  "use strict";
  const state={loaded:false,loading:false,coins:[],global:null,filter:"popular",search:"",sort:"rank",queue:[],active:0,max:3,showAll:false,chartPeriod:"MAX",detailCoin:null,history:null};
  const CACHE_KEY="worthit.crypto.market.v1";
  const BROWSER_FRESH_MS=5*60*1000;
  const BROWSER_STALE_MS=30*60*1000;
  const DETAIL_BROWSER_CACHE="worthit.crypto.detail.v1.";
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  function money(v){const n=Number(v);if(!Number.isFinite(n))return "—";const a=Math.abs(n),d=a>=1e12?1e12:a>=1e9?1e9:a>=1e6?1e6:a>=1e3?1e3:1,s=a>=1e12?"T":a>=1e9?"B":a>=1e6?"M":a>=1e3?"K":"";return "$"+(n/d).toFixed(s?1:2)+s;}
  function price(v){const n=Number(v);if(!Number.isFinite(n))return "—";if(n>=1000)return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n);if(n>=1)return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:4}).format(n);return "$"+n.toLocaleString("en-US",{maximumFractionDigits:10});}
  function priceEUR(v){const n=Number(v);if(!Number.isFinite(n))return "—";return new Intl.NumberFormat("en-US",{style:"currency",currency:"EUR",maximumFractionDigits:n>=1000?2:n>=1?4:10}).format(n);}
  function formatUpdatedAt(v){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString("en-GB",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}
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

  const SPEIRSY_SYMBOLS=new Set(["BTC","ETH","SOL","BNB","XRP","TRX","DOGE","ZEC","ADA","BCH"]);

  function historyUrl(coin){
    const symbol=String(coin&&coin.symbol||"").toUpperCase();
    return SPEIRSY_SYMBOLS.has(symbol)
      ? "/data/crypto-history/"+symbol+"USDT.json"
      : null;
  }

  function historyCacheKey(coin){
    return "worthit.crypto.history.v1."+String(coin.id);
  }

  function historyFromCache(coin){
    try{
      const raw=localStorage.getItem(historyCacheKey(coin));
      if(!raw)return null;
      const cached=JSON.parse(raw);
      if(!cached||!cached.savedAt||!cached.data)return null;
      if(Date.now()-Number(cached.savedAt)>24*60*60*1000)return null;
      return cached.data;
    }catch(e){return null;}
  }

  function saveHistoryCache(coin,data){
    try{
      localStorage.setItem(historyCacheKey(coin),JSON.stringify({
        savedAt:Date.now(),
        data:data
      }));
    }catch(e){}
  }

  function downsample(rows,maxPoints){
    if(rows.length<=maxPoints)return rows;
    const result=[];
    const step=(rows.length-1)/(maxPoints-1);
    for(let i=0;i<maxPoints;i++){
      result.push(rows[Math.round(i*step)]);
    }
    return result;
  }

  function historyRowsForPeriod(data,period){
    if(!data)return [];
    const now=Math.max(
      Number(data.daily&&data.daily.length?data.daily[data.daily.length-1].t:0),
      Number(data.hourly&&data.hourly.length?data.hourly[data.hourly.length-1].t:0)
    );
    const day=24*60*60*1000;
    let rows=[];
    if(period==="1D"){
      const source=Array.isArray(data.hourly)?data.hourly:[];
      rows=source.filter(x=>Number(x.t)>=now-day);
    }else if(period==="7D"){
      const source=Array.isArray(data.hourly)?data.hourly:[];
      rows=source.filter(x=>Number(x.t)>=now-day*7);
    }else if(period==="1M"){
      rows=(data.daily||[]).filter(x=>Number(x.t)>=now-day*31);
    }else if(period==="3M"){
      rows=(data.daily||[]).filter(x=>Number(x.t)>=now-day*93);
    }else if(period==="1Y"){
      rows=(data.daily||[]).filter(x=>Number(x.t)>=now-day*366);
    }else{
      rows=Array.isArray(data.daily)?data.daily:[];
    }
    if(rows.length<2 && Array.isArray(data.daily)){
      rows=data.daily.slice(-Math.min(30,data.daily.length));
    }
    return downsample(rows,360);
  }

  function chartDate(ts,period){
    const date=new Date(Number(ts));
    if(period==="1D"||period==="7D"){
      return date.toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
    }
    return date.toLocaleDateString("en-US",{month:"short",year:"numeric"});
  }

  function renderSpeirsyChart(data,period){
    const holder=$("cryptoPerformanceChart");
    if(!holder)return;
    const rows=historyRowsForPeriod(data,period);
    if(rows.length<2){
      holder.innerHTML='<div class="crypto-detail-no-chart">Historical price data is not available yet for this cryptocurrency.</div>';
      return;
    }

    const prices=rows.map(x=>Number(x.c)).filter(Number.isFinite);
    if(prices.length<2)return;
    let min=Math.min(...prices),max=Math.max(...prices);
    if(min===max){min*=0.999;max*=1.001;}
    const W=760,H=300,L=52,R=18,T=20,B=36;
    const iw=W-L-R,ih=H-T-B;
    const xAt=i=>L+(i/(rows.length-1))*iw;
    const yAt=v=>T+(1-(v-min)/(max-min))*ih;
    const points=rows.map((row,i)=>xAt(i).toFixed(2)+","+yAt(Number(row.c)).toFixed(2)).join(" ");
    const area=points+" "+xAt(rows.length-1).toFixed(2)+","+(H-B)+" "+xAt(0).toFixed(2)+","+(H-B);

    const first=Number(rows[0].c),last=Number(rows[rows.length-1].c);
    const change=first?((last-first)/first)*100:0;

    const labels=[0,Math.floor((rows.length-1)/2),rows.length-1];
    const yLabels=[0,.5,1].map(r=>min+(max-min)*(1-r));
    const grid=yLabels.map(v=>'<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yAt(v)+'" y2="'+yAt(v)+'" class="crypto-chart-grid"></line>').join("");
    const xLabels=labels.map(i=>'<text x="'+xAt(i)+'" y="'+(H-11)+'" class="crypto-chart-label" text-anchor="middle">'+esc(chartDate(rows[i].t,period))+'</text>').join("");
    const yTicks=yLabels.map(v=>'<text x="'+(L-8)+'" y="'+(yAt(v)+4)+'" class="crypto-chart-label" text-anchor="end">'+esc(price(v))+'</text>').join("");
    const circles=rows.length<=120?rows.map((row,i)=>'<circle cx="'+xAt(i)+'" cy="'+yAt(Number(row.c))+'" r="2.2" class="crypto-chart-point"><title>'+esc(chartDate(row.t,period)+" · "+price(row.c))+'</title></circle>').join(""):"";

    holder.innerHTML=
      '<div class="crypto-chart-summary"><span>'+esc(period)+' price history</span><strong class="'+(change>=0?"positive":"negative")+'">'+esc(pct(change))+'</strong></div>'+
      '<svg class="crypto-history-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="'+esc(period+" price history")+'">'+
        grid+yTicks+
        '<polygon points="'+area+'" class="crypto-chart-area"></polygon>'+
        '<polyline points="'+points+'" class="crypto-chart-line"></polyline>'+
        circles+xLabels+
      '</svg>'+
      '<div class="crypto-chart-range"><span>'+esc(chartDate(rows[0].t,period))+'</span><span>'+esc(chartDate(rows[rows.length-1].t,period))+'</span></div>';
  }

  async function loadSpeirsyHistory(coin,performance){
    const holder=$("cryptoPerformanceChart");
    if(!holder)return;
    state.detailCoin=coin;
    state.history=null;
    const url=historyUrl(coin);

    if(!url){
      renderPerformance(performance);
      return;
    }

    const cached=historyFromCache(coin);
    if(cached){
      state.history=cached;
      renderSpeirsyChart(cached,state.chartPeriod);
      return;
    }

    holder.innerHTML='<div class="crypto-detail-loading">Loading historical price data…</div>';

    try{
      const response=await fetch(url,{cache:"force-cache"});
      if(!response.ok)throw new Error("Speirsy history request failed");
      const data=await response.json();
      if(!data||(!Array.isArray(data.daily)&&!Array.isArray(data.hourly)))throw new Error("Invalid Speirsy dataset");
      saveHistoryCache(coin,data);
      state.history=data;
      renderSpeirsyChart(data,state.chartPeriod);
    }catch(e){
      console.warn("Speirsy history unavailable",e);
      renderPerformance(performance);
    }
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
    $("cryptoDetailPrice").innerHTML=esc(price(coin.price))+" <span class=\"crypto-detail-eur-price\">≈ "+esc(priceEUR(coin.priceEUR))+"</span>";

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

    loadSpeirsyHistory(coin,detail&&detail.performance);
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

  function positionCryptoFloatingShowLess(button,anchor){
    if(!button || !anchor)return;

    const anchorRect=anchor.getBoundingClientRect();
    const buttonRect=button.getBoundingClientRect();
    const scale=
      Number(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--ui-scale")
      )||1;
    const gap=12;

    let left=(anchorRect.right+gap)/scale;
    const maxLeft=
      (window.innerWidth-buttonRect.width-gap)/scale;

    if(left>maxLeft)left=maxLeft;
    left=Math.max(8/scale,left);

    button.style.setProperty("left",left+"px","important");
    button.style.setProperty("right","auto","important");
  }

  function syncFloatingShowLess(){
    const a=filtered();
    let button=$("cryptoFloatingShowLess");

    if(!state.showAll || a.length<=20){
      if(button)button.remove();
      return;
    }

    if(!button){
      button=document.createElement("button");
      button.type="button";
      button.id="cryptoFloatingShowLess";
      button.className="crypto-floating-show-less";
      button.innerHTML='Show Less <span>↑</span>';
      button.addEventListener("click",()=>{
        state.showAll=false;
        render();
        const section=$("cryptoSection");
        if(section){
          window.requestAnimationFrame(()=>{
            section.scrollIntoView({behavior:"smooth",block:"start"});
          });
        }
      });
      document.body.appendChild(button);
    }

    const shouldShow=window.scrollY>180;
    if(shouldShow){
      positionCryptoFloatingShowLess(
        button,
        $("cryptoGrid") || $("cryptoSection")
      );
    }
    button.classList.toggle("visible",shouldShow);
  }

  function render(){
    const g=$("cryptoGrid"),c=$("cryptoResultsCount"),a=filtered();
    const v=a.slice(0,state.showAll?500:20);
    const oldPager=$("cryptoPager");
    if(oldPager)oldPager.remove();

    if(c)c.textContent=state.search
      ?"Showing "+v.length+" of "+a.length+" results"
      :"Showing "+v.length+" of "+a.length;

    syncFloatingShowLess();

    if(!g)return;

    if(!v.length){
      g.innerHTML="<div class=\"crypto-empty\"><strong>No cryptocurrencies found</strong><span>Try another search or filter.</span></div>";
      return;
    }

    g.innerHTML=v.map((x,i)=>"<article class=\"crypto-card\" tabindex=\"0\" role=\"button\" data-crypto-id=\""+x.id+"\" aria-label=\"Open cryptocurrency details\"><div class=\"crypto-card-top\"><div class=\"crypto-image-wrap\"><div class=\"crypto-image-placeholder\">🪙</div><img class=\"crypto-image\" loading=\"lazy\" decoding=\"async\" aria-hidden=\"true\" alt=\"\" data-image-index=\""+i+"\" data-coin-name=\""+esc(x.name)+"\" data-coin-symbol=\""+esc(x.symbol)+"\"></div><div class=\"crypto-card-name\"><strong>"+esc(x.name)+"</strong><span>"+esc(x.symbol)+" · #"+esc(x.rank||"—")+"</span></div></div><div class=\"crypto-fiat-prices\"><div class=\"crypto-fiat-row crypto-eur-row\"><strong>≈ "+esc(priceEUR(x.priceEUR))+"</strong></div><div class=\"crypto-fiat-row crypto-usd-row\"><strong>"+esc(price(x.price))+"</strong><span class=\"crypto-change \"+(Number(x.change24h)>=0?\"positive\":\"negative\")+"\">"+esc(pct(x.change24h))+"</span></div></div><div class=\"crypto-metrics\"><div><span>Market Cap</span><strong>"+esc(money(x.marketCap))+"</strong></div><div><span>24h Volume</span><strong>"+esc(money(x.volume24h))+"</strong></div></div></article>").join("");

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
    state.updatedAt=data&&data.updatedAt||null;
    const updateEl=$("cryptoLastUpdated");
    if(updateEl) updateEl.textContent="Last updated: "+formatUpdatedAt(state.updatedAt)+" · Updates about every 10 minutes";
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
    if(!window.__worthitCryptoScrollBound){
      window.__worthitCryptoScrollBound=true;
      window.addEventListener("scroll",syncFloatingShowLess,{passive:true});
      window.addEventListener("resize",syncFloatingShowLess,{passive:true});
      window.addEventListener("worthitsettingschange",syncFloatingShowLess);
    }
    $("cryptoChartControls")?.addEventListener("click",e=>{
      const button=e.target.closest("button[data-crypto-period]");
      if(!button)return;
      state.chartPeriod=button.dataset.cryptoPeriod;
      $("cryptoChartControls").querySelectorAll("button[data-crypto-period]").forEach(b=>{
        b.classList.toggle("active",b===button);
      });
      if(state.history){
        renderSpeirsyChart(state.history,state.chartPeriod);
      }else if(state.detailCoin){
        renderPerformance(null);
      }
    });

    document.addEventListener("click",e=>{if(e.target.closest(".nav,.more-menu"))closeDetail();},true);

    $("cryptoDetailClose")?.addEventListener("click",closeDetail);
    $("cryptoDetailOverlay")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeDetail();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail();});
const s=$("cryptoSection");if(!s||s.dataset.cryptoBound==="1")return;s.dataset.cryptoBound="1";$("cryptoFilters")?.addEventListener("click",e=>{const b=e.target.closest("button[data-crypto-filter]");if(!b)return;state.filter=b.dataset.cryptoFilter;state.sort=state.filter==="gainers"?"gainers":state.filter==="losers"?"losers":state.filter==="volume"?"volume":state.filter==="marketCap"?"marketCap":"rank";renderFilters();render();});$("cryptoSearch")?.addEventListener("input",e=>{state.search=e.target.value.trim();render();});$("cryptoRefresh")?.addEventListener("click",()=>{state.loaded=false;load(true);});}
  window.initCryptoUI=()=>{bind();if(!state.loaded)load();else{renderGlobal();renderFilters();render();}};
})();