/* Worth It UGC calculators: AI-generated declarative formulas, catalogue, profiles and billing. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const sb=()=>window.supabaseClient||null;
const PERIODS=[
 {value:"today",label:"Today"},{value:"7d",label:"Last 7 days"},{value:"14d",label:"Last 14 days"},
 {value:"1m",label:"Last month"},{value:"3m",label:"Last 3 months"},{value:"6m",label:"Last 6 months"},
 {value:"12m",label:"Last 12 months"},{value:"3y",label:"Last 3 years"},{value:"6y",label:"Last 6 years"},
 {value:"12y",label:"Last 12 years"}
];
const SORTS=["latest","popular","liked","favorited","disliked","mine","my-drafts","my-favorites"];
const CATEGORY_LABELS={"cars":"Cars","car-ownership":"Car ownership","ev-ownership":"Electric vehicles","fuel-costs":"Fuel costs","vehicle-financing":"Car financing","car-insurance":"Insurance","car-maintenance":"Maintenance & repairs","depreciation-resale":"Depreciation & resale","vehicle-comparison":"Vehicle comparisons","money":"Money","budgeting":"Budgeting","saving":"Saving","investing":"Investing","loans-debt":"Loans & debt","mortgages":"Mortgages","taxes":"Taxes","income-salary":"Income & salary","retirement":"Retirement","technology":"Technology","smartphones":"Smartphones","computers":"Computers","gaming":"Gaming","software-subscriptions":"Software & subscriptions","internet-connectivity":"Internet & connectivity","consumer-electronics":"Consumer electronics","tech-comparison":"Technology comparisons","home":"Home Costs","utilities-energy":"Utilities & energy","rent-housing":"Rent & housing","home-buying":"Home buying","renovation-repairs":"Renovations & repairs","home-appliances":"Home appliances","home-maintenance":"Home maintenance","household-budget":"Household budget","other":"Other","travel":"Travel","education-career":"Education & career","health-fitness":"Health & fitness","food-groceries":"Food & groceries","business":"Business","lifestyle":"Lifestyle","general-comparison":"General comparisons"};
const CURRENCIES=[
 ["EUR","Euro"],["USD","US dollar"],["GBP","Pound sterling"],["RSD","Serbian dinar"],["CHF","Swiss franc"],
 ["CAD","Canadian dollar"],["AUD","Australian dollar"],["NZD","New Zealand dollar"],["JPY","Japanese yen"],
 ["CNY","Chinese yuan"],["INR","Indian rupee"],["PLN","Polish zloty"],["CZK","Czech koruna"],["HUF","Hungarian forint"],
 ["SEK","Swedish krona"],["NOK","Norwegian krone"],["DKK","Danish krone"],["BGN","Bulgarian lev"],["RON","Romanian leu"],
 ["TRY","Turkish lira"],["BRL","Brazilian real"],["MXN","Mexican peso"],["ZAR","South African rand"],["SGD","Singapore dollar"],
 ["HKD","Hong Kong dollar"],["KRW","South Korean won"],["AED","UAE dirham"],["SAR","Saudi riyal"],["UAH","Ukrainian hryvnia"],
 ["ILS","Israeli new shekel"],["THB","Thai baht"],["IDR","Indonesian rupiah"],["MYR","Malaysian ringgit"],["PHP","Philippine peso"],
 ["VND","Vietnamese dong"],["ISK","Icelandic krona"],["QAR","Qatari riyal"],["KWD","Kuwaiti dinar"],["JOD","Jordanian dinar"],
 ["EGP","Egyptian pound"],["PKR","Pakistani rupee"],["BDT","Bangladeshi taka"],["NGN","Nigerian naira"],["KES","Kenyan shilling"]
];
const UNIT_OPTIONS=[
 ["","No unit"],
 ...CURRENCIES.map(([code,name])=>[code,code+" — "+name]),
 ["%","Percent"],["months","Months"],["years","Years"],["days","Days"],["weeks","Weeks"],
 ["hours","Hours"],["minutes","Minutes"],["km","Kilometres"],["miles","Miles"],["kWh","Kilowatt-hours"],
 ["W","Watts"],["kW","Kilowatts"],["L","Litres"],["kg","Kilograms"],["m²","Square metres"],
 ["items","Items"],["units","Units"]
];
function getCategoryLabels(item){
 const main=CATEGORY_LABELS[item?.category]||"Other";
 const keys=Array.isArray(item?.subcategories)?item.subcategories:(Array.isArray(item?.spec?.subcategories)?item.spec.subcategories:[]);
 const extras=keys.map(key=>CATEGORY_LABELS[key]).filter(Boolean);
 return [main,...extras.filter(label=>label!==main)];
}
let state={userId:"",session:null,sort:"latest",period:"12y",category:"all",search:"",pages:{},lastPage:1,totalPages:1,totalCount:0,catalog:[],myCalculators:[],activeId:"",activeCalculator:null,detailRequest:0,catalogRequest:0,creatorRequest:0,creatorPeriod:"7d",topCreatorSort:"overall",risingCreatorSort:"growth",communityMemberSort:"followers",creatorData:null,aiDraft:null,editingId:null,editingVisibility:"",editingStatus:"draft",exploreView:"basic",exploreBusy:false,basicScrollTop:0,communityScrollTop:0,descriptionStatusRequest:0,descriptionStatusTimer:null};
let pendingExploreTransitionFinish=null;
const toast=message=>{if(typeof window.showToast==="function")window.showToast(String(message||""));};
const text=(tag,className,value)=>{const node=document.createElement(tag);if(className)node.className=className;node.textContent=String(value==null?"":value);return node;};
const button=(label,className,handler)=>{const node=text("button",className,label);node.type="button";node.addEventListener("click",handler);return node;};
function status(message,isError){const node=$("ugcCatalogStatus");if(node){node.textContent=String(message||"");node.classList.toggle("is-error",Boolean(isError));}}
function detailStatus(message,isError){const node=$("ugcDetailStatus");if(node){node.textContent=String(message||"");node.classList.toggle("is-error",Boolean(isError));}}
function normalizeObject(value){return Array.isArray(value)&&value.length===1&&value[0]&&typeof value[0]==="object"?value[0]:value;}
async function getSession(){
 const result=await sb()?.auth?.getSession?.();
 if(result?.error)throw result.error;
 state.session=result?.data?.session||null;
 state.userId=state.session?.user?.id||"";
 return state.session;
}
function requireAccount(){
 if(state.userId)return true;
 toast("Sign in to use community calculators.");
 if(typeof window.openAuthModal==="function")window.openAuthModal("signup");
 return false;
}
function verifyConfirmed(){
 if(!state.session?.user?.email_confirmed_at&&!state.session?.user?.confirmed_at){
  toast("Verify your email before creating or publishing community calculators.");
  return false;
 }
 return true;
}
function setActiveSort(sort){
 state.sort=SORTS.includes(sort)?sort:"latest";
 document.querySelectorAll("[data-ugc-sort]").forEach(node=>{
  const active=node.dataset.ugcSort===state.sort;
  node.classList.toggle("active",active);
  node.setAttribute("aria-pressed",String(active));
 });
}
function updateCatalogHeading(){
 const node=$("ugcCatalogHeading");
 if(node)node.textContent=state.sort==="mine"?"My Calculators":state.sort==="my-drafts"?"My Drafts":state.sort==="my-favorites"?"My Favourites":
  ({latest:"Latest calculators",popular:"Most popular",liked:"Most liked",favorited:"Most favorited",disliked:"Most disliked"}[state.sort]||"Community calculators");
}
const CREATOR_PERIODS=["7d","30d","6m","12m","3y","5y","10y"];
const TOP_CREATOR_SORTS=["overall","followers","likes","favorites","views","engagement"];
const RISING_CREATOR_SORTS=["growth","engagement","new","breakout","consistent"];
const COMMUNITY_MEMBER_SORTS=["followers","growth","new","following","connected"];
function compactCount(value){
 const amount=Math.max(0,Number(value)||0);
 return new Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(amount);
}
function creatorMetric(item,kind){
 if(kind==="top"){
  switch(state.topCreatorSort){
   case "followers":return compactCount(item.followers)+" followers";
   case "likes":return compactCount(item.likes)+" likes";
   case "favorites":return compactCount(item.favorites)+" favourites";
   case "views":return compactCount(item.views)+" views";
   case "engagement":return Number(item.engagement_rate||0).toFixed(1)+"% engagement";
   default:return "Top overall";
  }
 }
 if(kind==="rising"){
  switch(state.risingCreatorSort){
   case "engagement":return compactCount(item.engagement)+" engagement";
   case "new":return "Published "+(item.first_publication_at?new Date(item.first_publication_at).toLocaleDateString():"recently");
   case "breakout":return Math.round((Number(item.breakout_score)||0)*100)+" breakout";
   case "consistent":return compactCount(item.active_weeks)+" active weeks";
   default:return "+"+compactCount(item.period_followers)+" followers";
  }
 }
 switch(state.communityMemberSort){
  case "growth":return "+"+compactCount(item.period_followers)+" followers";
  case "new":return "Joined "+(item.created_at?new Date(item.created_at).toLocaleDateString():"recently");
  case "following":return compactCount(item.following)+" following";
  case "connected":return compactCount(item.connections)+" connections";
  default:return compactCount(item.followers)+" followers";
 }
}
function creatorSubstats(item,kind){
 if(kind==="members"){
  return compactCount(item.followers)+" followers · "+compactCount(item.following)+" following";
 }
 return compactCount(item.followers)+" followers · "+compactCount(item.public_calculators)+" public calculators";
}
function renderCreatorBoard(hostId,rows,kind,emptyMessage){
 const host=$(hostId);if(!host)return;
 host.replaceChildren();
 if(!Array.isArray(rows)||!rows.length){
  host.appendChild(text("p","ugc-creator-list-status",emptyMessage||"No matching members were found for this period yet."));
  return;
 }
 rows.forEach((item,index)=>{
  const row=document.createElement("article");row.className="ugc-creator-row";
  row.appendChild(text("span","ugc-creator-rank",String(index+1)));
  const profile=document.createElement("a");
  profile.className="ugc-creator-profile-link";
  profile.href="/profile/"+encodeURIComponent(String(item.worth_it_id||""));
  profile.setAttribute("aria-label","Open "+String(item.display_name||item.username||"member")+"'s profile");
  const avatarUrl=String(item.avatar_url||"").trim();
  if(/^https:\/\//i.test(avatarUrl)){
   const avatar=document.createElement("img");
   avatar.className="ugc-creator-avatar";avatar.src=avatarUrl;avatar.alt="";avatar.loading="lazy";avatar.referrerPolicy="no-referrer";
   avatar.addEventListener("error",()=>{const fallback=text("span","ugc-creator-avatar-fallback",String(item.display_name||item.username||"?").trim().charAt(0).toUpperCase()||"?");if(avatar.isConnected)avatar.replaceWith(fallback);},{once:true});
   profile.appendChild(avatar);
  }else{
   profile.appendChild(text("span","ugc-creator-avatar-fallback",String(item.display_name||item.username||"?").trim().charAt(0).toUpperCase()||"?"));
  }
  const identity=document.createElement("span");identity.className="ugc-creator-identity";
  identity.appendChild(text("span","ugc-creator-name",item.display_name||item.username||"Worth It member"));
  identity.appendChild(text("span","ugc-creator-username",item.username?"@"+String(item.username).replace(/^@+/,""):"Worth It member"));
  profile.appendChild(identity);
  profile.appendChild(text("span","ugc-creator-metric",creatorMetric(item,kind)));
  row.appendChild(profile);
  row.appendChild(text("span","ugc-creator-substats",creatorSubstats(item,kind)));
  host.appendChild(row);
 });
}
function renderCreatorLeaderboards(payload,errorMessage){
 const data=payload&&typeof payload==="object"?payload:{};
 renderCreatorBoard("ugcTopCreatorsList",data.top_creators,"top",errorMessage||"No public calculator creators have been ranked for this period yet.");
 renderCreatorBoard("ugcRisingCreatorsList",data.rising_creators,"rising",errorMessage||"No rising creators match this period yet.");
 renderCreatorBoard("ugcCommunityMembersList",data.community_members,"members",errorMessage||"No other public members match this period yet.");
}
async function loadCreatorLeaderboards(){
 if(!state.userId){
  renderCreatorLeaderboards(null,"Sign in to discover creators and other community members.");
  return;
 }
 const request=++state.creatorRequest;
 renderCreatorLeaderboards(null,"Loading community rankings…");
 try{
  const result=await sb().rpc("get_worth_it_creator_leaderboards",{
   p_period:state.creatorPeriod,
   p_top_sort:state.topCreatorSort,
   p_rising_sort:state.risingCreatorSort,
   p_member_sort:state.communityMemberSort
  });
  if(result.error)throw result.error;
  if(request!==state.creatorRequest)return;
  const payload=normalizeObject(result.data);
  if(!payload||!Array.isArray(payload.top_creators)||!Array.isArray(payload.rising_creators)||!Array.isArray(payload.community_members)){
   throw new Error("Creator leaderboard response was incomplete.");
  }
  state.creatorData=payload;
  renderCreatorLeaderboards(payload);
 }catch(error){
  if(request!==state.creatorRequest)return;
  state.creatorData=null;
  const message=String(error?.message||error?.details||"");
  const unavailable=/get_worth_it_creator_leaderboards|schema cache|does not exist|could not find/i.test(message)
   ?"Creator rankings are not available until the creator leaderboard migration is installed in this Preview database."
   :"Could not load creator rankings. Please try again.";
  renderCreatorLeaderboards(null,unavailable);
  console.warn("Creator leaderboard load failed:",error);
 }
}
function cardDescriptionPreview(description){
 const full=String(description||"").trim().replace(/\s+/g," ");
 if(!full)return "No description provided.";
 const limit=150;
 if(full.length<=limit)return full;
 return full.slice(0,limit).trimEnd().replace(/[.!?…]+$/,"")+"...";
}
function renderCatalog(rows){
 const host=$("ugcCalculatorGrid");if(!host)return;
 host.replaceChildren();
 if(!Array.isArray(rows)||!rows.length){
  const empty=state.sort==="mine"?"You have no published community calculators yet.":state.sort==="my-drafts"?"You have no saved drafts yet.":state.sort==="my-favorites"?"You have not favourited any public community calculators yet.":"No community calculators match this filter yet.";
  host.appendChild(text("p","ugc-empty",empty));return;
 }
 rows.forEach(item=>{
  const card=document.createElement("article");card.className="calc-card ugc-calculator-card";
  card.dataset.calculatorOrigin="ugc";card.dataset.ugcId=String(item.id||"");
  const head=document.createElement("div");head.className="ugc-card-head";
  const publicNumber=Number(item.calculator_number);
  if(Number.isSafeInteger(publicNumber)&&publicNumber>=51)head.appendChild(text("span","ugc-number","#"+publicNumber));
  head.appendChild(text("span","ugc-category",CATEGORY_LABELS[item.category]||"Other"));
  const mainCategory=CATEGORY_LABELS[item.category]||"Other";
  getCategoryLabels(item).filter(label=>label!==mainCategory).slice(0,3).forEach(label=>{
   head.appendChild(text("span","ugc-subcategory-chip",label));
  });
  if(state.sort==="mine")head.appendChild(text("span","ugc-state",item.visibility==="public"?"Public":"Private"));
  if(state.sort==="my-drafts")head.appendChild(text("span","ugc-state","Draft"));
  card.appendChild(head);
  card.appendChild(text("h3","ugc-card-title",item.title||"Untitled calculator"));
  const fullDescription=String(item.description||"").trim();
  const descriptionNode=text("p","ugc-card-description",cardDescriptionPreview(fullDescription));
  if(fullDescription)descriptionNode.title=fullDescription;
  card.appendChild(descriptionNode);
  card.appendChild(text("p","ugc-card-more","Open calculator to see all the info →"));
  const ownerUsername=String(item.owner_username||"").trim().replace(/^@+/,"");
  const ownerLabel=ownerUsername?"Made by @"+ownerUsername:"Made by Worth It member";
  const owner=text("a","ugc-card-owner",ownerLabel);
  owner.setAttribute("aria-label",ownerLabel);
  if(item.owner_worth_it_id)owner.href="/profile/"+item.owner_worth_it_id;else owner.href="#";
  owner.addEventListener("click",event=>{if(!item.owner_worth_it_id)event.preventDefault();});
  const byline=document.createElement("div");byline.className="ugc-card-byline";
  byline.appendChild(owner);
  if(state.sort==="mine"){
   card.appendChild(byline);
   const actions=document.createElement("div");actions.className="ugc-card-actions";
   actions.append(
    button("Open calculator →","ugc-action-primary",()=>window.openWorthItUGCCalculator(item.id)),
    button("Improve with AI","ugc-action-secondary",()=>editCalculator(item.id)),
    button(item.visibility==="public"?"Make private":"Make public","ugc-action-secondary",()=>setCalculatorVisibility(item.id,item.visibility==="public"?"private":"public"))
   );
   card.appendChild(actions);
  }else if(state.sort==="my-drafts"){
   card.appendChild(byline);
   const actions=document.createElement("div");actions.className="ugc-card-actions";
   const label=text("label","ugc-publish-visibility-label","Publish as");
   const select=document.createElement("select");select.className="ugc-publish-visibility";select.setAttribute("aria-label","Visibility when publishing this draft");
   [["private","Private — only you can see it"],["public","Public — anyone can discover it"]].forEach(([value,title])=>{const option=document.createElement("option");option.value=value;option.textContent=title;select.appendChild(option);});
   label.appendChild(select);
   actions.append(button("Improve with AI","ugc-action-secondary",()=>editCalculator(item.id)),label,button("Publish","ugc-action-primary",()=>publishCalculator(item.id,select.value)));
   card.appendChild(actions);
  }else{
   const stats=document.createElement("div");stats.className="ugc-card-stats";
   stats.append(statItem("👁",Number(item.views||0),"Views"),statItem("👍",Number(item.likes||0),"Likes"),statItem("★",Number(item.favorites||0),"Favourites"),statItem("👎",Number(item.dislikes||0),"Dislikes"));
   byline.appendChild(stats);
   card.appendChild(byline);
   const actions=document.createElement("div");actions.className="ugc-card-actions";
   actions.append(button("Open calculator →","ugc-action-primary",()=>window.openWorthItUGCCalculator(item.id)));
   card.appendChild(actions);
  }
  host.appendChild(card);
 });
 window.refreshWorthItCommunityFeatures?.();
}
function catalogPageKey(){
 return [state.sort,state.category,state.period,state.search.toLocaleLowerCase()].join("|");
}
function currentCatalogPage(){
 const remembered=state.pages[catalogPageKey()];
 return Math.max(1,Math.trunc(Number(remembered||state.lastPage||1)));
}
function renderPagination(payload){
 const nav=$("ugcPagination"),prev=$("ugcPagePrevious"),next=$("ugcPageNext");
 const pageNumber=$("ugcPageNumber"),pageTotal=$("ugcPageTotal"),input=$("ugcPageInput");
 const summary=$("ugcPaginationStatus");
 if(!nav)return;
 const total=Number(payload?.total_count)||0;
 const pages=Math.max(1,Number(payload?.total_pages)||1);
 const page=Math.min(pages,Math.max(1,Number(payload?.page)||1));
 state.totalPages=pages;state.totalCount=total;state.pages[catalogPageKey()]=page;state.lastPage=page;
 nav.hidden=total===0;
 if(pageNumber)pageNumber.textContent=String(page);
 if(pageTotal)pageTotal.textContent=pages>100?"100+":String(pages);
 if(input){input.value=String(page);input.max=String(pages);input.min="1";input.disabled=false;input.removeAttribute("aria-invalid");}
 if(prev)prev.disabled=page<=1;
 if(next)next.disabled=page>=pages;
 if(summary){
  const first=total?((page-1)*30+1):0, last=Math.min(total,page*30);
  summary.textContent=total?("Showing "+first+"–"+last+" of "+total+" community calculators · 30 per page. This is not a 30-calculator total limit — use the page controls to browse more."):"";
 }
}
function goToCatalogPage(value){
 const raw=String(value??"").trim();
 const requested=Number(raw);
 const input=$("ugcPageInput");
 if(!raw||!Number.isSafeInteger(requested)||requested<1){
  const message="Enter a whole page number from 1 to "+state.totalPages+".";
  if(input)input.setAttribute("aria-invalid","true");
  status(message,true);
  const summary=$("ugcPaginationStatus");if(summary)summary.textContent=message;
  return;
 }
 if(requested>state.totalPages){
  const message="Only "+state.totalPages+" page"+(state.totalPages===1?" is":"s are")+" available right now. More pages will appear when enough community calculators have been published.";
  if(input)input.setAttribute("aria-invalid","true");
  status(message,true);
  const summary=$("ugcPaginationStatus");if(summary)summary.textContent=message;
  return;
 }
 if(input)input.removeAttribute("aria-invalid");
 state.pages[catalogPageKey()]=requested;
 state.lastPage=requested;
 void loadCatalog();
}
async function loadCatalog(){
 if(!state.userId){status("Sign in to browse community-created calculators.");renderCatalog([]);renderPagination({total_count:0,total_pages:1,page:1});return;}
 const request=++state.catalogRequest;
 status("Loading community calculators…");
 updateCatalogHeading();
 try{
  const result=await sb().rpc("get_worth_it_ugc_catalog_page",{
   p_sort:state.sort,
   p_period:state.period,
   p_search:state.search,
   p_category:state.category,
   p_page:currentCatalogPage()
  });
  if(result.error)throw result.error;
  if(request!==state.catalogRequest)return;
  const payload=normalizeObject(result.data);
  const rows=Array.isArray(payload?.items)?payload.items:[];
  state.catalog=rows;
  if(state.sort==="mine")state.myCalculators=rows;
  renderCatalog(rows);
  renderPagination(payload||{});
  const total=Number(payload?.total_count)||0;
  const page=Number(payload?.page)||1;
  const pages=Number(payload?.total_pages)||1;
  if(state.sort==="mine"){
   status(total+" published calculator"+(total===1?"":"s")+" in your account · public and private calculators are shown here.");
  }else if(state.sort==="my-drafts"){
   status(total+" saved draft"+(total===1?"":"s")+" · drafts are visible only to you and are not part of public discovery.");
  }else if(state.sort==="my-favorites"){
   status(total+" private favourite community calculator"+(total===1?"":"s")+" · page "+page+" of "+pages+". Only you can see this list.");
  }else{
   status(total+" community calculator"+(total===1?"":"s")+" found · page "+page+" of "+pages+".");
  }
 }catch(error){
  if(request!==state.catalogRequest)return;
  renderCatalog([]);
  renderPagination({total_count:0,total_pages:1,page:1});
  const message=String(error?.message||error?.details||"");
  if(/get_worth_it_ugc_catalog_page|schema cache|does not exist|could not find/i.test(message)){
   status("The UGC pagination migration is not installed in this Preview environment yet.",true);
  }else{status("Could not load community calculators. Please try again.",true);}
  console.warn("UGC catalogue load failed:",error);
 }
}
function compileExpression(source,keys){
 const input=String(source||"");let at=0;
 const fail=()=>{throw new Error("This calculator contains an invalid formula.");};
 const ws=()=>{while(at<input.length&&/\s/.test(input[at]))at++;};
 const take=value=>{ws();if(input.slice(at,at+value.length)===value){at+=value.length;return true;}return false;};
 const identifier=()=>{ws();const m=input.slice(at).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(!m)return null;at+=m[0].length;return m[0];};
 function primary(){
  ws();
  if(take("(")){const node=add();if(!take(")"))fail();return node;}
  const m=input.slice(at).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
  if(m){at+=m[0].length;const value=Number(m[0]);if(!Number.isFinite(value))fail();return{type:"number",value};}
  const name=identifier();if(!name)fail();
  if(take("(")){
   if(!["min","max","abs","round","floor","ceil","sqrt","pow"].includes(name))fail();
   const args=[];if(!take(")")){do{args.push(add());}while(take(","));if(!take(")"))fail();}
   const valid=name==="min"||name==="max"?args.length>=1:name==="pow"?args.length===2:name==="round"?args.length>=1&&args.length<=2:args.length===1;
   if(!valid)fail();return{type:"call",name,args};
  }
  if(name==="pi")return{type:"number",value:Math.PI};
  if(name==="e")return{type:"number",value:Math.E};
  if(!keys.has(name))fail();return{type:"variable",name};
 }
 function unary(){if(take("+"))return{type:"unary",op:"+",value:unary()};if(take("-"))return{type:"unary",op:"-",value:unary()};return power();}
 function power(){let node=primary();if(take("^"))node={type:"binary",op:"^",left:node,right:unary()};return node;}
 function multiply(){let node=unary();while(true){if(take("*"))node={type:"binary",op:"*",left:node,right:unary()};else if(take("/"))node={type:"binary",op:"/",left:node,right:unary()};else return node;}}
 function add(){let node=multiply();while(true){if(take("+"))node={type:"binary",op:"+",left:node,right:multiply()};else if(take("-"))node={type:"binary",op:"-",left:node,right:multiply()};else return node;}}
 const ast=add();ws();if(at!==input.length)fail();return ast;
}
function evaluate(ast,values){
 let n;
 if(ast.type==="number")return ast.value;
 if(ast.type==="variable")return Number(values[ast.name]);
 if(ast.type==="unary"){const v=evaluate(ast.value,values);return ast.op==="-"?-v:v;}
 if(ast.type==="binary"){
  const a=evaluate(ast.left,values),b=evaluate(ast.right,values);
  if(ast.op==="+")n=a+b;else if(ast.op==="-")n=a-b;else if(ast.op==="*")n=a*b;else if(ast.op==="/"){if(b===0)throw new Error("A formula divides by zero. Change your inputs.");n=a/b;}else n=Math.pow(a,b);
 }else{
  const a=ast.args.map(x=>evaluate(x,values));
  if(ast.name==="min")n=Math.min(...a);else if(ast.name==="max")n=Math.max(...a);else if(ast.name==="abs")n=Math.abs(a[0]);else if(ast.name==="round")n=a.length===1?Math.round(a[0]):Number(a[0].toFixed(Math.max(0,Math.min(8,Math.floor(a[1])))));else if(ast.name==="floor")n=Math.floor(a[0]);else if(ast.name==="ceil")n=Math.ceil(a[0]);else if(ast.name==="sqrt"){if(a[0]<0)throw new Error("Square root is invalid for these values.");n=Math.sqrt(a[0]);}else n=Math.pow(a[0],a[1]);
 }
 if(!Number.isFinite(n))throw new Error("The calculator produced an invalid result. Check your inputs.");return n;
}
function formatResult(item,value){
 const prefix=String(item.prefix||""),suffix=String(item.suffix||"");
 if(item.format==="currency"){
  try{return prefix+new Intl.NumberFormat(undefined,{style:"currency",currency:item.currency||"EUR",maximumFractionDigits:2}).format(value)+suffix;}
  catch(_){}
 }
 if(item.format==="percent")return prefix+new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value)+"%"+suffix;
 return prefix+new Intl.NumberFormat(undefined,{maximumFractionDigits:4}).format(value)+suffix;
}
async function refreshAiEditQuota(){
 const host=$("ugcMakerEditQuotaStatus");
 if(!host||!state.userId)return;
 host.textContent="Checking today's AI improvement allowance…";
 try{
  const result=await sb().rpc("get_worth_it_ugc_ai_edit_quota");
  if(result.error)throw result.error;
  const quota=normalizeObject(result.data);
  const limit=Number(quota?.daily_limit),used=Number(quota?.edits_used),remaining=Number(quota?.remaining);
  if(!Number.isInteger(limit)||!Number.isInteger(used)||!Number.isInteger(remaining)||limit<2||used<0||remaining<0)throw new Error("The AI edit quota response was incomplete.");
  host.textContent="AI improvements today: "+used+"/"+limit+" used · "+remaining+" remaining. Free 2 / Premium Lite 3 / Premium 4. Resets at 00:00 UTC.";
 }catch(error){
  host.textContent="Today's AI improvement allowance could not be loaded. The server still checks your tier and limit before each AI edit.";
  console.warn("UGC AI edit quota could not be loaded:",error);
 }
}
async function refreshCreationQuota(){
 const host=$("ugcMakerQuotaStatus");
 if(!host||!state.userId)return;
 host.textContent="Checking today's calculator creation allowance…";
 try{
  const result=await sb().rpc("get_worth_it_ugc_creation_quota");
  if(result.error)throw result.error;
  const quota=normalizeObject(result.data);
  const limit=Number(quota?.daily_limit),used=Number(quota?.creations_used),remaining=Number(quota?.remaining);
  if(!Number.isInteger(limit)||!Number.isInteger(used)||!Number.isInteger(remaining)||limit<1||used<0||remaining<0){
   throw new Error("The account creation allowance response was incomplete.");
  }
  host.textContent="Daily new calculators: "+used+"/"+limit+" used · "+remaining+" remaining. Resets at 00:00 UTC.";
 }catch(error){
  host.textContent="Today's allowance could not be loaded. The server still checks your account limit securely when you save.";
  console.warn("UGC creation quota could not be loaded:",error);
 }
}
function formatCalcPrice(usagePriceMilli){
 const amount=(Number(usagePriceMilli)||100)/1000;
 return String(Number(amount.toFixed(3)));
}
function renderCalculatorForm(calculator){
 const host=$("ugcDetailCalculatorForm");if(!host)return;
 host.replaceChildren();
 const spec=calculator.spec||{};
 if(!Array.isArray(spec.inputs)||!Array.isArray(spec.results)){detailStatus("This calculator definition is unavailable.",true);return;}
 spec.inputs.forEach(input=>{
  const wrap=text("label","ugc-input-field",input.label||input.key);
  const control=document.createElement("input");control.type="number";control.name=input.key;control.required=true;
  control.min=String(input.min);control.max=String(input.max);control.step=String(input.step||"any");control.value=String(input.default);
  wrap.appendChild(control);
  if(input.unit)wrap.appendChild(text("small","",input.unit));
  host.appendChild(wrap);
 });
 const usagePriceMilli=Math.min(500,Math.max(100,Number(calculator.usage_price_milli)||100));
 const priceLabel=formatCalcPrice(usagePriceMilli);
 host.appendChild(button("Calculate · "+priceLabel+" CALC","ugc-action-primary ugc-calculate-button",()=>runCalculation(calculator)));
}
async function runCalculation(calculator){
 if(!requireAccount())return;
 const form=$("ugcDetailCalculatorForm");if(!form)return;
 const inputs=calculator.spec.inputs||[],values={};
 for(const item of inputs){
  const control=form.querySelector('[name="'+CSS.escape(item.key)+'"]');
  const value=Number(control?.value);
  if(!Number.isFinite(value)||value<Number(item.min)||value>Number(item.max)){
   detailStatus("Enter a valid value for "+item.label+".",true);control?.focus();return;
  }
  values[item.key]=value;
 }
 const button=form.querySelector(".ugc-calculate-button");if(button)button.disabled=true;
 detailStatus("Calculating…");
 const requestId=crypto.randomUUID();
 let reserved=false;
 try{
  const usagePriceMilli=Math.min(500,Math.max(100,Number(calculator.usage_price_milli)||100));
  let priceLabel=formatCalcPrice(usagePriceMilli);
  const reserve=await sb().rpc("calc_wallet_reserve",{p_request_id:requestId,p_reason:"calculator",p_calculator_id:calculator.id});
  if(reserve.error)throw reserve.error;
  if(!reserve.data?.ok){
   const requiredMilli=Number(reserve.data?.required)*1000;
   const requiredLabel=Number.isFinite(requiredMilli)&&requiredMilli>0?formatCalcPrice(requiredMilli):priceLabel;
   if(reserve.data?.code==="INSUFFICIENT_CALC")throw new Error("Not enough CALC. This calculation costs "+requiredLabel+" CALC. Visit Web Shop or collect your daily reward.");
   throw new Error("Could not reserve CALC for this calculation.");
  }
  priceLabel=formatCalcPrice(Number(reserve.data.usage_price_milli)||usagePriceMilli);
  reserved=true;
  const results=(calculator.spec.results||[]).map(item=>{
   const ast=compileExpression(item.expression,new Set(inputs.map(input=>input.key)));
   return {label:item.label,value:formatResult(item,evaluate(ast,values))};
  });
  const settle=await sb().rpc("calc_wallet_settle",{p_request_id:requestId});
  if(settle.error||!settle.data?.ok)throw new Error("The calculation finished, but its CALC transaction could not be confirmed.");
  reserved=false;
  renderCalculationResults(results);
  detailStatus("Calculation complete. "+priceLabel+" CALC was charged.",false);
  await refreshCalcWallet();
 }catch(error){
  if(reserved)await sb().rpc("calc_wallet_refund",{p_request_id:requestId}).catch(()=>{});
  detailStatus(error?.message||"Could not calculate. Please try again.",true);
 }finally{if(button)button.disabled=false;}
}
function renderCalculationResults(results){
 const host=$("ugcDetailResults");if(!host)return;
 host.replaceChildren();
 const section=text("section","ugc-results-panel");
 section.appendChild(text("h3","","Your results"));
 const grid=document.createElement("div");grid.className="ugc-results-grid";
 results.forEach(result=>{
  const card=document.createElement("div");card.className="ugc-result-card";
  card.append(text("span","",result.label),text("strong","",result.value));
  grid.appendChild(card);
 });
 section.appendChild(grid);host.replaceChildren(section);
}
async function refreshCalcWallet(){
 if(typeof window.refreshWorthItCalcWallet==="function")return window.refreshWorthItCalcWallet();
 try{await sb().rpc("calc_wallet_summary");}catch(_){}
}
function statItem(icon,value,label){
 const count=Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
 const node=text("span","ugc-stat-item","");
 node.title=label+": "+count;
 node.setAttribute("aria-label",label+": "+count);
 node.append(text("span","ugc-stat-icon",icon),text("span","ugc-stat-count",count));
 return node;
}
function renderDetailStats(calculator){
 const stats=$("ugcDetailStats");if(!stats)return;
 stats.replaceChildren(
  statItem("👁",calculator.views,"Views"),
  statItem("👍",calculator.likes,"Likes"),
  statItem("★",calculator.favorites,"Favourites"),
  statItem("👎",calculator.dislikes,"Dislikes")
 );
}
function detailShow(calculator,fromUrl){
 state.activeCalculator=calculator;state.activeId=String(calculator.id);
 const title=$("ugcDetailTitle"),description=$("ugcDetailDescription"),owner=$("ugcDetailOwner");
 const kicker=$("ugcDetailKicker"),publicNumber=Number(calculator.calculator_number);
 if(kicker)kicker.textContent=Number.isSafeInteger(publicNumber)&&publicNumber>=51?"WORTH IT COMMUNITY · CALCULATOR #"+publicNumber:"WORTH IT COMMUNITY";
 if(title)title.textContent=calculator.title||"Community calculator";
 const categoryHost=$("ugcDetailCategories");
 if(categoryHost){categoryHost.replaceChildren();getCategoryLabels(calculator).forEach(label=>categoryHost.appendChild(text("span","ugc-subcategory-chip",label)));}
 if(description)description.textContent=calculator.description||"No description provided.";
 if(owner){
  const ownerUsername=String(calculator.owner_username||"").trim().replace(/^@+/,"");
  owner.textContent=ownerUsername?"Made by @"+ownerUsername:"Made by Worth It member";
  owner.href=calculator.owner_worth_it_id?"/profile/"+calculator.owner_worth_it_id:"#";
 }
 renderDetailStats(calculator);
 $("ugcDetailEditDescription")?.classList.toggle("hidden",calculator.is_owner!==true);
 const editor=$("ugcDetailDescriptionEditor");
 if(editor){editor.hidden=calculator.is_owner!==true;$("ugcDetailDescriptionInput").value=calculator.description||"";}
 const priceEditor=$("ugcDetailPriceEditor");
 const usagePriceMilli=Math.min(500,Math.max(100,Number(calculator.usage_price_milli)||100));
 const priceInput=$("ugcDetailUsagePrice");
 if(priceEditor)priceEditor.hidden=calculator.is_owner!==true;
 if(priceInput)priceInput.value=(usagePriceMilli/1000).toFixed(2);
 const priceDisplay=$("ugcDetailUsagePriceDisplay");
 if(priceDisplay)priceDisplay.textContent="Cost per calculation: "+formatCalcPrice(usagePriceMilli)+" CALC.";
 const favoriteButton=$("ugcDetailFavorite");
 if(favoriteButton)window.bindWorthItUGCFavoriteButton?.(calculator.id,favoriteButton,calculator.is_favorite===true,active=>{
  const previous=calculator.is_favorite===true;
  if(previous!==active){calculator.favorites=Math.max(0,Number(calculator.favorites||0)+(active?1:-1));calculator.is_favorite=active;renderDetailStats(calculator);}
 });
 const isPublicCalculator=calculator.visibility==="public";
 const isOwner=calculator.is_owner===true;
 const canReact=!isOwner&&isPublicCalculator&&Boolean(state.userId);
 const reactionNote=$("ugcDetailReactionNote");
 if(reactionNote){
  reactionNote.hidden=!isPublicCalculator||!isOwner;
  reactionNote.textContent=isOwner
   ?"You created this calculator, so you cannot like or dislike it. Other members can rate it."
   :"";
 }
 const likeButton=$("ugcDetailLike"),dislikeButton=$("ugcDetailDislike");
 if(likeButton){
  likeButton.hidden=!isPublicCalculator;
  likeButton.disabled=!canReact;
  likeButton.setAttribute("aria-disabled",String(!canReact));
  likeButton.title=canReact?"":isOwner?"Creators cannot rate their own calculators.":"This calculator cannot be rated by this account.";
  likeButton.textContent=calculator.my_reaction==="like"?"👍 Liked":"👍 Like";
  likeButton.classList.toggle("is-active",calculator.my_reaction==="like");
  likeButton.setAttribute("aria-pressed",String(calculator.my_reaction==="like"));
 }
 if(dislikeButton){
  dislikeButton.hidden=!isPublicCalculator;
  dislikeButton.disabled=!canReact;
  dislikeButton.setAttribute("aria-disabled",String(!canReact));
  dislikeButton.title=canReact?"":isOwner?"Creators cannot rate their own calculators.":"This calculator cannot be rated by this account.";
  dislikeButton.textContent=calculator.my_reaction==="dislike"?"👎 Disliked":"👎 Dislike";
  dislikeButton.classList.toggle("is-active",calculator.my_reaction==="dislike");
  dislikeButton.setAttribute("aria-pressed",String(calculator.my_reaction==="dislike"));
 }
 const badges=$("ugcDetailOwnerBadges");if(badges)badges.replaceChildren();
 renderCalculatorForm(calculator);
 $("ugcDetailResults")?.replaceChildren();
 detailStatus("Enter your values and calculate when ready.");
 if(calculator.is_owner===true)void refreshDescriptionStatus(calculator.id);
 const section=$("ugcDetailSection");if(section)section.hidden=false;
 const home=$("homePage");if(home)home.style.display="none";
 window.scrollTo({top:0,behavior:"auto"});
 window.recordWorthItUgcView?.(calculator.id);
}
async function openDetail(id,options){
 if(!requireAccount())return;
 const request=++state.detailRequest;
 detailStatus("Loading calculator…");
 const title=$("ugcDetailTitle"),description=$("ugcDetailDescription"),owner=$("ugcDetailOwner");
 if(title)title.textContent="Community calculator";
 if(description)description.textContent="";
 if(owner){owner.textContent="Created by a Worth It member";owner.href="#";}
 $("ugcDetailCategories")?.replaceChildren();
 $("ugcDetailStats")?.replaceChildren();
 $("ugcDetailOwnerBadges")?.replaceChildren();
 $("ugcDetailPriceEditor")?.setAttribute("hidden","");
 $("ugcDetailLike")?.setAttribute("hidden","");
 $("ugcDetailDislike")?.setAttribute("hidden","");
 $("ugcDetailReactionNote")?.setAttribute("hidden","");
 $("ugcDetailCalculatorForm")?.replaceChildren();
 $("ugcDetailResults")?.replaceChildren();
 $("ugcDetailEditDescription")?.classList.add("hidden");
 $("ugcDetailDescriptionEditor")?.setAttribute("hidden","");
 const section=$("ugcDetailSection");if(section)section.hidden=false;
 const home=$("homePage");if(home)home.style.display="none";
 try{
  const result=await sb().rpc("get_worth_it_ugc_calculator",{p_id:id});
  if(result.error)throw result.error;
  if(request!==state.detailRequest)return;
  const calculator=normalizeObject(result.data);
  if(!calculator?.id)throw new Error("This calculator could not be found.");
  detailShow(calculator,options?.fromUrl===true);
 }catch(error){
  if(request!==state.detailRequest)return;
  detailStatus(/get_worth_it_ugc_calculator|schema cache|does not exist/i.test(String(error?.message||""))?
   "The UGC database migration is not installed in this Preview environment yet.":"This calculator could not be opened.",true);
 }
}
window.openWorthItUGCCalculator=function(id,options){
 const clean=String(id||"").toLowerCase();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(clean)){
  toast("Invalid community calculator link.");return;
 }
 if(!options?.fromUrl&&typeof window.WORTH_IT_SET_ROUTE==="function")window.WORTH_IT_SET_ROUTE("/calculator/ugc/"+clean);
 void openDetail(clean,options);
};
window.closeWorthItUGCCalculator=function(){
 state.detailRequest++;state.activeCalculator=null;state.activeId="";
 if(state.descriptionStatusTimer){clearInterval(state.descriptionStatusTimer);state.descriptionStatusTimer=null;}
 state.descriptionStatusRequest++;
 const section=$("ugcDetailSection");if(section)section.hidden=true;
 if(window.location.pathname.startsWith("/calculator/ugc/")&&typeof window.backFromWorthItRoute==="function"){
  window.backFromWorthItRoute("/calculators");
  return;
 }
 const home=$("homePage");if(home)home.style.display="block";
};
async function react(id,reaction){
 if(!requireAccount())return;
 const reactionButtons=[$("ugcDetailLike"),$("ugcDetailDislike")].filter(Boolean);
 if(reactionButtons.some(button=>button.disabled))return;
 reactionButtons.forEach(button=>{button.disabled=true;});
 try{
  const result=await sb().rpc("set_worth_it_ugc_reaction",{p_id:id,p_reaction:reaction});
  if(result.error)throw result.error;
  const saved=normalizeObject(result.data);
  if(saved?.success===false)throw new Error(saved.error||"Could not save your reaction.");
  const active=state.activeCalculator;
  const nextReaction=saved?.reaction==="like"||saved?.reaction==="dislike"?saved.reaction:null;
  if(active&&String(active.id)===String(id)&&active.my_reaction!==nextReaction){
   const previousReaction=active.my_reaction||null;
   active.likes=Math.max(0,Number(active.likes)||0)+(nextReaction==="like"?1:0)-(previousReaction==="like"?1:0);
   active.dislikes=Math.max(0,Number(active.dislikes)||0)+(nextReaction==="dislike"?1:0)-(previousReaction==="dislike"?1:0);
   active.my_reaction=nextReaction;
   renderDetailStats(active);
  }
  await Promise.all([loadCatalog(),loadCreatorLeaderboards()]);
  if(state.activeId===String(id))await openDetail(id,{fromUrl:true});
 }catch(error){toast(error?.message||"Could not save your reaction.");}
 finally{
  const active=state.activeCalculator;
  const canReact=Boolean(active&&String(active.id)===String(state.activeId)&&active.is_owner!==true&&active.visibility==="public"&&state.userId);
  reactionButtons.forEach(button=>{if(button.isConnected)button.disabled=!canReact;});
 }
}
async function saveUsagePrice(){
 const calculator=state.activeCalculator;
 if(!calculator||calculator.is_owner!==true||!requireAccount())return;
 const input=$("ugcDetailUsagePrice"),buttonNode=$("ugcDetailSaveUsagePrice"),statusNode=$("ugcDetailUsagePriceStatus");
 const value=Number(input?.value);
 const priceMilli=Math.round(value*1000);
 if(!Number.isFinite(value)||value<0.1||value>0.5||!Number.isInteger(priceMilli)||priceMilli%10!==0){
  if(statusNode)statusNode.textContent="Choose a price from 0.10 to 0.50 CALC in 0.01 increments.";
  return;
 }
 if(buttonNode)buttonNode.disabled=true;
 if(statusNode)statusNode.textContent="Saving usage price…";
 try{
  const result=await sb().rpc("set_worth_it_ugc_usage_price",{p_id:calculator.id,p_price_milli:priceMilli});
  if(result.error)throw result.error;
  const saved=normalizeObject(result.data);
  if(saved?.success!==true)throw new Error(saved?.error||"The usage price was not confirmed.");
  calculator.usage_price_milli=Number(saved.usage_price_milli)||priceMilli;
  renderCalculatorForm(calculator);
  const display=$("ugcDetailUsagePriceDisplay");
  if(display)display.textContent="Cost per calculation: "+formatCalcPrice(calculator.usage_price_milli)+" CALC.";
  if(statusNode)statusNode.textContent="Usage price saved: "+formatCalcPrice(calculator.usage_price_milli)+" CALC per calculation.";
 }catch(error){
  if(statusNode)statusNode.textContent=error?.message||"Could not save the usage price.";
 }finally{if(buttonNode)buttonNode.disabled=false;}
}
async function refreshDescriptionStatus(id){
 const request=++state.descriptionStatusRequest;
 const host=$("ugcDetailDescriptionCooldown"),button=$("ugcDetailSaveDescription");
 if(!host||!button||!id)return;
 if(state.descriptionStatusTimer){clearInterval(state.descriptionStatusTimer);state.descriptionStatusTimer=null;}
 try{
  const result=await sb().rpc("get_worth_it_ugc_description_status",{p_id:id});
  if(result.error)throw result.error;
  if(request!==state.descriptionStatusRequest||String(state.activeId)!==String(id))return;
  const data=normalizeObject(result.data);
  if(!data?.success)throw new Error(data?.error||"Description cooldown is unavailable.");
  const endAt=data.next_save_at?new Date(data.next_save_at).getTime():0;
  const update=()=>{
   const remaining=Math.max(0,endAt-Date.now());
   button.disabled=remaining>0;
   if(remaining<=0){
    host.textContent="You can change this description once every 10 minutes.";
    if(state.descriptionStatusTimer){clearInterval(state.descriptionStatusTimer);state.descriptionStatusTimer=null;}
   }else{
    const seconds=Math.ceil(remaining/1000);
    host.textContent="Description change available in "+Math.floor(seconds/60)+"m "+String(seconds%60).padStart(2,"0")+"s. You can update it once every 10 minutes.";
   }
  };
  update();
  if(endAt>Date.now())state.descriptionStatusTimer=setInterval(update,1000);
 }catch(error){
  if(request!==state.descriptionStatusRequest)return;
  button.disabled=false;
  host.textContent=error?.message||"Description cooldown could not be checked. The server will verify the 10-minute limit when you save.";
 }
}
async function saveDescription(){
 const calculator=state.activeCalculator;if(!calculator||calculator.is_owner!==true)return;
 const description=String($("ugcDetailDescriptionInput")?.value||"").trim();
 if(description.length>500){detailStatus("Description can contain up to 500 characters.",true);return;}
 const button=$("ugcDetailSaveDescription");if(button)button.disabled=true;
 try{
  const result=await sb().rpc("update_worth_it_ugc_calculator_description",{p_id:calculator.id,p_description:description});
  if(result.error)throw result.error;
  const data=normalizeObject(result.data);
  if(!data?.success)throw new Error(data?.error||"Could not save the calculator description.");
  calculator.description=description;
  if($("ugcDetailDescription"))$("ugcDetailDescription").textContent=description||"No description provided.";
  detailStatus(data.unchanged?"Your calculator description is unchanged.":"Your calculator description was saved.");
  await Promise.all([loadCatalog(),refreshDescriptionStatus(calculator.id)]);
 }catch(error){
  detailStatus(error?.message||"Could not save the calculator description.",true);
  if(button)button.disabled=false;
  await refreshDescriptionStatus(calculator.id);
 }
}
async function editCalculator(id){
 if(!requireAccount()||!verifyConfirmed())return;
 const result=await sb().rpc("get_worth_it_ugc_calculator",{p_id:id});
 if(result.error){status("Could not load this calculator for editing.",true);return;}
 const calculator=normalizeObject(result.data);
 if(!calculator||calculator.is_owner!==true){status("You can edit only your own calculators.",true);return;}
 state.editingId=id;state.editingVisibility=calculator.visibility||"private";state.editingStatus=calculator.status||"draft";
 openMaker();
 const modal=$("ugcMakerModal");
 modal.querySelector("[name=prompt]").value="";
 $("ugcMakerPrompt").placeholder="Describe how Worth It AI should improve this existing calculator (for example: make the cost assumptions more precise or improve the formulas). Its subject and purpose cannot be changed.";
 $("ugcMakerTitle").value=calculator.title;
 $("ugcMakerDescription").value=calculator.description||"";
 state.aiDraft={title:calculator.title,description:calculator.description||"",category:calculator.category,subcategories:calculator.subcategories||[],spec:calculator.spec};
 renderMakerPreview(state.aiDraft);
 $("ugcMakerGenerate").textContent="✦ Improve with AI";
 $("ugcMakerTitleHeading").textContent="Improve your calculator with AI";
 $("ugcMakerStatus").textContent="Your calculator's subject, title, category and description stay fixed. Ask AI to improve its inputs and formulas.";
}
async function publishCalculator(id,visibility){
 if(!requireAccount()||!verifyConfirmed())return;
 const target=visibility==="public"?"public":"private";
 if(!window.confirm(target==="public"?"Publish this calculator publicly so other members can discover it?":"Publish this calculator privately so only you can see it?"))return;
 try{
  const result=await sb().rpc("publish_worth_it_ugc_calculator",{p_id:id,p_visibility:target});
  if(result.error)throw result.error;
  toast(target==="public"?"Your calculator is now public.":"Your calculator is published privately.");
  setActiveSort("mine");await loadCatalog();
 }catch(error){status(error?.message||"Could not publish this calculator.",true);}
}
async function setCalculatorVisibility(id,visibility){
 if(!requireAccount()||!verifyConfirmed())return;
 const target=visibility==="public"?"public":"private";
 const card=Array.from(document.querySelectorAll(".ugc-calculator-card")).find(node=>node.dataset.ugcId===String(id));
 const action=card?.querySelector(".ugc-card-actions button:last-child");
 if(action)action.disabled=true;
 try{
  const result=await sb().rpc("set_worth_it_ugc_visibility",{p_id:id,p_visibility:target});
  if(result.error)throw result.error;
  const payload=normalizeObject(result.data);
  if(payload?.success!==true||payload.visibility!==target)throw new Error("The calculator visibility change was not confirmed.");
  toast(target==="public"?"Your calculator is now public and discoverable.":"Your calculator is now private.");
  await loadCatalog();
 }catch(error){
  status(error?.message||"Could not change calculator visibility.",true);
  if(action)action.disabled=false;
 }
}
function openMaker(){
 if(!requireAccount()||!verifyConfirmed())return;
 const modal=$("ugcMakerModal");if(!modal)return;
 modal.hidden=false;modal.setAttribute("aria-hidden","false");
 document.body.classList.add("ugc-maker-open");
 if(state.editingId)void refreshAiEditQuota();
 else void refreshCreationQuota();
 const editQuota=$("ugcMakerEditQuotaStatus"),createQuota=$("ugcMakerQuotaStatus");
 if(editQuota)editQuota.hidden=!state.editingId;
 if(createQuota)createQuota.hidden=Boolean(state.editingId);
 const visibilityWrap=$("ugcMakerVisibilityWrap");
 if(visibilityWrap)visibilityWrap.hidden=Boolean(state.editingId);
 $("ugcMakerGenerate").textContent=state.editingId?"✦ Improve with AI":"✦ Generate calculator";
 $("ugcMakerTitleHeading").textContent=state.editingId?"Improve your calculator with AI":"Create a calculator with AI";
 $("ugcMakerPrompt")?.focus();
}
function closeMaker(){
 const modal=$("ugcMakerModal");if(modal){modal.hidden=true;modal.setAttribute("aria-hidden","true");}
 document.body.classList.remove("ugc-maker-open");
}
function refreshMakerTestIfOpen(){
 const panel=$("ugcMakerTestPanel");
 if(panel&&!panel.hidden)renderMakerTestPanel(true);
}
function renderMakerTestPanel(preserveValues){
 const panel=$("ugcMakerTestPanel"),spec=state.aiDraft?.spec;
 if(!panel||!Array.isArray(spec?.inputs)||!Array.isArray(spec?.results))return;
 const previous=new Map();
 if(preserveValues){
  panel.querySelectorAll("[data-ugc-maker-test-key]").forEach(control=>{
   if(control.value!==""&&Number.isFinite(control.valueAsNumber))previous.set(control.dataset.ugcMakerTestKey,control.valueAsNumber);
  });
 }
 panel.replaceChildren();
 const heading=document.createElement("div");heading.className="ugc-maker-test-head";
 const intro=document.createElement("div");
 intro.append(text("h4","","Try your calculator"),text("p","","Change the sample values below. Results recalculate instantly using the same restricted formulas as the saved calculator."));
 const reset=button("Reset values","ugc-maker-test-reset",()=>renderMakerTestPanel(false));
 reset.setAttribute("aria-label","Reset test values to the calculator defaults");
 heading.append(intro,reset);panel.appendChild(heading);
 const inputGrid=document.createElement("div");inputGrid.className="ugc-maker-test-inputs";
 spec.inputs.forEach(item=>{
  const label=document.createElement("label");label.className="ugc-maker-test-input";
  label.appendChild(text("span","",item.label||item.key));
  const control=document.createElement("input");control.type="number";control.name=item.key;control.required=true;
  if(item.min!==undefined)control.min=String(item.min);
  if(item.max!==undefined)control.max=String(item.max);
  control.step=String(item.step||"any");
  control.dataset.ugcMakerTestKey=String(item.key);
  const previousValue=previous.get(item.key);
  const candidate=Number.isFinite(previousValue)?previousValue:Number(item.default);
  control.value=String(Number.isFinite(candidate)?candidate:"");
  control.addEventListener("input",()=>updateMakerTestResults(panel));
  label.appendChild(control);
  if(item.unit)label.appendChild(text("small","",item.unit));
  inputGrid.appendChild(label);
 });
 panel.appendChild(inputGrid);
 panel.appendChild(text("h4","ugc-maker-test-results-heading","Live results"));
 const results=document.createElement("div");results.className="ugc-maker-test-results-grid";results.setAttribute("aria-live","polite");
 panel.appendChild(results);
 const statusNode=text("p","ugc-maker-test-status","");
 statusNode.setAttribute("role","status");statusNode.setAttribute("aria-live","polite");
 panel.appendChild(statusNode);
 panel.appendChild(text("p","ugc-maker-test-note","Free local test · No CALC is charged, no AI request is sent, and nothing is saved."));
 updateMakerTestResults(panel);
}
function updateMakerTestResults(panel){
 const spec=state.aiDraft?.spec;
 if(!panel||!Array.isArray(spec?.inputs)||!Array.isArray(spec?.results))return;
 const controls=Array.from(panel.querySelectorAll("[data-ugc-maker-test-key]")),values={};
 let invalidControl=null;
 controls.forEach(control=>{
  const valid=control.value!==""&&Number.isFinite(control.valueAsNumber)&&control.validity.valid;
  control.setAttribute("aria-invalid",String(!valid));
  if(!valid&&!invalidControl)invalidControl=control;
  if(valid)values[control.dataset.ugcMakerTestKey]=control.valueAsNumber;
 });
 const output=panel.querySelector(".ugc-maker-test-results-grid"),statusNode=panel.querySelector(".ugc-maker-test-status");
 if(!output||!statusNode)return;
 output.replaceChildren();
 if(invalidControl){
  statusNode.textContent="Enter a valid value within the allowed minimum, maximum and step for every input.";
  return;
 }
 const keys=new Set(spec.inputs.map(item=>item.key));
 let formulaErrors=0;
 spec.results.forEach((item,index)=>{
  const card=document.createElement("article");card.className="ugc-maker-test-result";
  card.appendChild(text("span","",item.label||"Result "+(index+1)));
  try{
   const ast=compileExpression(item.expression,keys);
   const value=evaluate(ast,values);
   card.appendChild(text("strong","",formatResult(item,value)));
  }catch(error){
   formulaErrors++;
   card.classList.add("is-error");
   card.appendChild(text("strong","","Cannot calculate"));
   card.appendChild(text("small","",error?.message||"Check this formula."));
  }
  output.appendChild(card);
 });
 statusNode.textContent=formulaErrors
  ?" "+formulaErrors+" result formula"+(formulaErrors===1?" needs":"s need")+" attention. Check the highlighted result"+(formulaErrors===1?".":"s.")
  :"Results are updating automatically as you change the sample values.";
}
function renderMakerPreview(definition){
 const host=$("ugcMakerPreview");if(!host)return;
 host.replaceChildren();
 if(!definition){host.hidden=true;return;}
 host.hidden=false;
 const fields=document.createElement("div");fields.className="ugc-maker-edit-grid";
 const title=document.createElement("label");title.textContent="Calculator title";
 const titleInput=document.createElement("input");titleInput.id="ugcMakerTitle";titleInput.maxLength=70;titleInput.value=definition.title||"";titleInput.disabled=Boolean(state.editingId);title.appendChild(titleInput);
 const desc=document.createElement("label");desc.textContent="Description (optional)";
 const descInput=document.createElement("textarea");descInput.id="ugcMakerDescription";descInput.maxLength=500;descInput.rows=3;descInput.value=definition.description||"";descInput.disabled=Boolean(state.editingId);desc.appendChild(descInput);
 fields.append(title,desc);host.appendChild(fields);
 const selected=document.createElement("div");selected.className="ugc-maker-ai-categories";
 selected.appendChild(text("strong","","AI-selected categories"));
 getCategoryLabels({category:definition.category,subcategories:definition.spec?.subcategories||definition.subcategories||[]}).forEach(label=>selected.appendChild(text("span","ugc-subcategory-chip",label)));
 host.appendChild(selected);
 const summary=text("p","ugc-maker-schema-summary",(definition.spec?.inputs?.length||0)+" inputs · "+(definition.spec?.results?.length||0)+" results · formulas use a restricted arithmetic language");
 host.appendChild(summary);
 if(state.editingId)host.appendChild(text("p","ugc-maker-schema-summary","This is an improvement of your existing calculator. Its title, category, purpose and description are locked; AI can refine the calculation fields and formulas."));
 host.appendChild(text("h3","ugc-maker-schema-heading","Calculator inputs"));
 (definition.spec?.inputs||[]).forEach((item,index)=>{
  const group=document.createElement("fieldset");group.className="ugc-maker-schema-group";
  group.appendChild(text("legend","","Input "+(index+1)+" · "+item.key));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addInput=(labelText,type,value,onChange)=>{
   const label=document.createElement("label");label.textContent=labelText;
   const input=document.createElement("input");input.type=type;input.value=String(value??"");
   if(type==="number")input.step="any";
   input.addEventListener("input",()=>{onChange(input.value);refreshMakerTestIfOpen();});
   label.appendChild(input);grid.appendChild(label);
  };
  addInput("Label","text",item.label,value=>{item.label=String(value).trim().slice(0,60);});
  addInput("Default value","number",item.default,value=>{if(value!==""&&Number.isFinite(Number(value)))item.default=Number(value);});
  addInput("Minimum","number",item.min,value=>{if(value!==""&&Number.isFinite(Number(value)))item.min=Number(value);});
  addInput("Maximum","number",item.max,value=>{if(value!==""&&Number.isFinite(Number(value)))item.max=Number(value);});
  addInput("Step","number",item.step||1,value=>{if(value!==""&&Number.isFinite(Number(value)))item.step=Number(value);});

  const unitLabel=document.createElement("label");unitLabel.className="ugc-maker-unit-field";unitLabel.appendChild(text("span","","Unit or currency"));
  const unitSelect=document.createElement("select");unitSelect.setAttribute("aria-label","Unit or currency for "+(item.label||item.key));
  UNIT_OPTIONS.forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;unitSelect.appendChild(option);});
  const customUnitOption=document.createElement("option");customUnitOption.value="__custom__";customUnitOption.textContent="Other custom unit…";unitSelect.appendChild(customUnitOption);
  const currentUnit=String(item.unit||"");
  const isKnownUnit=UNIT_OPTIONS.some(([value])=>value===currentUnit);
  unitSelect.value=isKnownUnit?currentUnit:"__custom__";
  const customUnit=document.createElement("input");customUnit.type="text";customUnit.maxLength=16;customUnit.placeholder="Custom unit (max 16 characters)";customUnit.value=isKnownUnit?"":currentUnit;customUnit.hidden=isKnownUnit;
  customUnit.addEventListener("input",()=>{item.unit=String(customUnit.value).trim().slice(0,16);refreshMakerTestIfOpen();});
  unitSelect.addEventListener("change",()=>{
   const custom=unitSelect.value==="__custom__";
   customUnit.hidden=!custom;
   if(custom){customUnit.focus();item.unit=String(customUnit.value).trim().slice(0,16);}
   else{item.unit=unitSelect.value;customUnit.value="";}
   refreshMakerTestIfOpen();
  });
  unitLabel.append(unitSelect,customUnit);grid.appendChild(unitLabel);
  group.appendChild(grid);host.appendChild(group);
 });
 host.appendChild(text("h3","ugc-maker-schema-heading","Calculator results"));
 (definition.spec?.results||[]).forEach((item,index)=>{
  const group=document.createElement("fieldset");group.className="ugc-maker-schema-group";
  group.appendChild(text("legend","","Result "+(index+1)));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addInput=(labelText,type,value,onChange)=>{
   const label=document.createElement("label");label.textContent=labelText;
   const input=document.createElement(type==="textarea"?"textarea":"input");
   if(type!=="textarea")input.type=type;
   input.value=String(value??"");
   input.addEventListener("input",()=>{onChange(input.value);refreshMakerTestIfOpen();});
   label.appendChild(input);grid.appendChild(label);
  };
  addInput("Result label","text",item.label,value=>{item.label=String(value).trim().slice(0,70);});
  addInput("Formula","textarea",item.expression,value=>{item.expression=String(value).trim().slice(0,260);});
  const formatLabel=document.createElement("label");formatLabel.textContent="Display format";
  const formatSelect=document.createElement("select");
  [["number","Number"],["currency","Currency"],["percent","Percent"]].forEach(([value,label])=>{
   const option=document.createElement("option");option.value=value;option.textContent=label;formatSelect.appendChild(option);
  });
  formatSelect.value=item.format||"number";
  formatLabel.appendChild(formatSelect);grid.appendChild(formatLabel);

  const currencyLabel=document.createElement("label");currencyLabel.className="ugc-maker-currency-field";currencyLabel.appendChild(text("span","","Result currency"));
  const currencySelect=document.createElement("select");currencySelect.setAttribute("aria-label","Currency for "+(item.label||"this result"));
  CURRENCIES.forEach(([code,name])=>{const option=document.createElement("option");option.value=code;option.textContent=code+" — "+name;currencySelect.appendChild(option);});
  const customCurrencyOption=document.createElement("option");customCurrencyOption.value="__custom__";customCurrencyOption.textContent="Other ISO 4217 currency…";currencySelect.appendChild(customCurrencyOption);
  const currentCurrency=String(item.currency||"EUR").toUpperCase();
  const isKnownCurrency=CURRENCIES.some(([code])=>code===currentCurrency);
  currencySelect.value=isKnownCurrency?currentCurrency:"__custom__";
  const customCurrency=document.createElement("input");customCurrency.type="text";customCurrency.maxLength=3;customCurrency.inputMode="text";customCurrency.autocomplete="off";customCurrency.spellcheck=false;customCurrency.placeholder="ISO code, e.g. RSD";customCurrency.value=isKnownCurrency?"":currentCurrency;customCurrency.hidden=isKnownCurrency;
  customCurrency.addEventListener("input",()=>{
   item.currency=String(customCurrency.value).toUpperCase().replace(/[^A-Z]/g,"").slice(0,3);
   refreshMakerTestIfOpen();
  });
  currencySelect.addEventListener("change",()=>{
   const custom=currencySelect.value==="__custom__";
   customCurrency.hidden=!custom;
   if(custom){customCurrency.focus();item.currency=String(customCurrency.value).toUpperCase().replace(/[^A-Z]/g,"").slice(0,3);}
   else{item.currency=currencySelect.value;customCurrency.value="";}
   refreshMakerTestIfOpen();
  });
  const syncCurrencyEnabled=()=>{
   const enabled=formatSelect.value==="currency";
   currencySelect.disabled=!enabled;customCurrency.disabled=!enabled;
   currencyLabel.classList.toggle("is-disabled",!enabled);
  };
  formatSelect.addEventListener("change",()=>{item.format=formatSelect.value;syncCurrencyEnabled();refreshMakerTestIfOpen();});
  currencyLabel.append(currencySelect,customCurrency);grid.appendChild(currencyLabel);
  syncCurrencyEnabled();
  group.appendChild(grid);host.appendChild(group);
 });
 const currencyNote=text("p","ugc-maker-schema-summary","Each result can use a different currency. Selecting a currency changes how the value is displayed; it does not convert amounts or fetch exchange rates. For currency conversion, include the exchange rate as an explicit calculator input.");
 host.appendChild(currencyNote);
 const testPanel=document.createElement("section");testPanel.id="ugcMakerTestPanel";testPanel.className="ugc-maker-test-panel";testPanel.hidden=true;
 const testToggle=button("▶ Test calculator","ugc-maker-test-toggle",()=>{
  testPanel.hidden=!testPanel.hidden;
  testToggle.setAttribute("aria-expanded",String(!testPanel.hidden));
  testToggle.textContent=testPanel.hidden?"▶ Test calculator":"▾ Hide test";
  if(!testPanel.hidden)renderMakerTestPanel(false);
 });
 testToggle.setAttribute("aria-expanded","false");
 host.append(testToggle,testPanel);
 host.appendChild(text("p","ugc-maker-schema-summary","Allowed formulas: +, −, ×, ÷, powers, parentheses and min, max, abs, round, floor, ceil, sqrt, pow. Arbitrary JavaScript is never run."));
 const saveButton=$("ugcMakerSave"),publishButton=$("ugcMakerPublish");
 if(saveButton)saveButton.disabled=false;
 if(publishButton)publishButton.disabled=false;
}
async function generateWithAI(){
 if(!requireAccount()||!verifyConfirmed())return;
 const prompt=String($("ugcMakerPrompt")?.value||"").trim();
 if(prompt.length<10||prompt.length>900){$("ugcMakerStatus").textContent="Describe the requested changes in 10 to 900 characters.";return;}
 const button=$("ugcMakerGenerate");button.disabled=true;
 $("ugcMakerStatus").textContent=state.editingId?"Worth It AI is improving your existing calculator…":"Worth It AI is designing your calculator…";
 $("ugcMakerPreview").hidden=true;
 try{
  const payload=state.editingId?{mode:"refine",calculator_id:state.editingId,prompt}:{mode:"create",prompt};
  const response=await fetch("/api/ugc-maker",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+state.session.access_token,"Accept":"application/json"},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.success)throw new Error(data?.error||"The AI calculator maker is unavailable.");
  state.aiDraft=data.calculator;
  renderMakerPreview(state.aiDraft);
  $("ugcMakerStatus").textContent=state.editingId?"AI improvement generated. Review the improved inputs and formulas, then save the update.":"Preview generated. Review the title, description and formulas before saving.";
 }catch(error){$("ugcMakerStatus").textContent=error?.message||"Could not generate a calculator.";}
 finally{button.disabled=false;}
}
async function saveMakerDraft(publish){
 if(!state.aiDraft||!requireAccount()||!verifyConfirmed())return;
 const title=String($("ugcMakerTitle")?.value||"").trim();
 const description=state.editingId?String(state.aiDraft.description||""):String($("ugcMakerDescription")?.value||"").trim();
 const category=String(state.aiDraft.category||"other");
 const visibility=state.editingId?(state.editingVisibility||"private"):(String($("ugcMakerVisibility")?.value||"private")==="public"?"public":"private");
 const previousStatus=state.editingStatus||"draft";
 if(title.length<3){$("ugcMakerStatus").textContent="Enter a title with at least 3 characters.";return;}
 const invalidCurrency=(state.aiDraft.spec?.results||[]).find(item=>item.format==="currency"&&!/^[A-Z]{3}$/.test(String(item.currency||"").trim().toUpperCase()));
 if(invalidCurrency){$("ugcMakerStatus").textContent="Enter a valid three-letter ISO 4217 currency code for every currency-formatted result.";return;}
 const save=$("ugcMakerSave");if(save)save.disabled=true;
 const publishButton=$("ugcMakerPublish");if(publishButton)publishButton.disabled=true;
 let savedIdAfterWrite="";
 try{
  const saved=await sb().rpc("save_worth_it_ugc_calculator",{
   p_id:state.editingId||null,p_title:title,p_description:description,p_category:category,p_spec:state.aiDraft.spec
  });
  if(saved.error)throw saved.error;
  const payload=normalizeObject(saved.data),id=payload?.id;
  if(!id)throw new Error("The calculator draft could not be saved.");
  savedIdAfterWrite=id;
  // Keep the ID before publishing. A retry updates this saved draft instead
  // of creating a duplicate or consuming another daily creation slot.
  if(!state.editingId){
   state.editingId=id;
   state.editingVisibility=visibility;
   state.editingStatus="draft";
   $("ugcMakerGenerate").textContent="✦ Improve with AI";
   $("ugcMakerTitleHeading").textContent="Improve your calculator with AI";
   const visibilityWrap=$("ugcMakerVisibilityWrap");if(visibilityWrap)visibilityWrap.hidden=true;
   const createQuota=$("ugcMakerQuotaStatus"),editQuota=$("ugcMakerEditQuotaStatus");
   if(createQuota)createQuota.hidden=true;
   if(editQuota)editQuota.hidden=false;
   void refreshAiEditQuota();
  }
  if(publish){
   const result=await sb().rpc("publish_worth_it_ugc_calculator",{p_id:id,p_visibility:visibility});
   if(result.error)throw result.error;
   const publication=normalizeObject(result.data);
   if(publication?.success!==true||publication.visibility!==visibility)throw new Error("The calculator was saved, but publication was not confirmed.");
  }
  state.editingId=null;state.editingVisibility="";state.editingStatus="draft";closeMaker();$("ugcMakerGenerate").textContent="✦ Generate calculator";$("ugcMakerTitleHeading").textContent="Create a calculator with AI";$("ugcMakerPrompt").placeholder="Example: Create a calculator that compares the total cost of owning two cars over five years, including purchase price, fuel, insurance and maintenance.";setActiveSort(publish||previousStatus==="published"?"mine":"my-drafts");await loadCatalog();
  const publicNumber=Number(payload?.calculator_number);
  const numberLabel=Number.isSafeInteger(publicNumber)&&publicNumber>=51?" #"+publicNumber:"";
  toast(publish?"Your calculator"+numberLabel+" has been published.":"Your calculator"+numberLabel+" draft has been saved.");
 }catch(error){
  const detail=error?.message||"Could not save the calculator.";
  $("ugcMakerStatus").textContent=savedIdAfterWrite
   ?"Your draft is saved. Publishing could not be completed: "+detail+" You can retry without creating another calculator."
   :detail;
 }
 finally{if(save)save.disabled=false;if(publishButton)publishButton.disabled=false;}
}
function setExploreInitialView(view){
 const stage=$("calculatorExploreStage"),basic=$("calculators"),community=$("ugcCommunitySection");
 if(!stage||!basic||!community)return;
 if(pendingExploreTransitionFinish)pendingExploreTransitionFinish();
 const target=view==="community"&&state.userId?"community":"basic";
 state.exploreView=target;state.exploreBusy=false;stage.dataset.activeView=target;stage.dataset.transitioning="false";
 basic.hidden=target!=="basic";community.hidden=target!=="community";
 basic.inert=target!=="basic";community.inert=target!=="community";
 [basic,community].forEach(panel=>{
  panel.style.removeProperty("transform");
  panel.style.removeProperty("transition");
  panel.style.removeProperty("z-index");
 });
}
function reconcileExplorePanels(){
 const stage=$("calculatorExploreStage"),basic=$("calculators"),community=$("ugcCommunitySection");
 if(!stage||!basic||!community)return;
 if(state.exploreBusy&&pendingExploreTransitionFinish){
  pendingExploreTransitionFinish();
  return;
 }
 const active=state.exploreView==="community"&&state.userId?"community":"basic";
 state.exploreView=active;state.exploreBusy=false;
 stage.dataset.activeView=active;stage.dataset.transitioning="false";
 basic.hidden=active!=="basic";community.hidden=active!=="community";
 basic.inert=active!=="basic";community.inert=active!=="community";
 [basic,community].forEach(panel=>{
  panel.style.removeProperty("transform");
  panel.style.removeProperty("transition");
  panel.style.removeProperty("z-index");
 });
 stage.querySelectorAll("#ugcNavigationActions button,#ugcBackToBasicButton").forEach(button=>{button.disabled=false;});
}
function switchCalculatorExploreView(target){
 const next=target==="community"?"community":"basic";
 const stage=$("calculatorExploreStage"),basic=$("calculators"),community=$("ugcCommunitySection");
 if(!stage||!basic||!community)return Promise.resolve(false);
 if(state.exploreBusy)return Promise.resolve(false);
 if(next===state.exploreView)return Promise.resolve(true);
 if(next==="community"&&!state.userId){
  toast("Sign in to browse and create community calculators.");
  if(typeof window.openAuthModal==="function")window.openAuthModal("signup");
  return Promise.resolve(false);
 }
 const from=state.exploreView==="community"?community:basic;
 const to=next==="community"?community:basic;
 const direction=next==="community"?1:-1;
 if(from===basic)state.basicScrollTop=from.scrollTop;else state.communityScrollTop=from.scrollTop;
 state.exploreBusy=true;stage.dataset.transitioning="true";
 stage.querySelectorAll("#ugcNavigationActions button,#ugcBackToBasicButton").forEach(button=>{button.disabled=true;});
 to.hidden=false;to.inert=false;from.inert=true;
 to.style.transition="none";to.style.transform="translateX("+(direction*100)+"%)";to.style.zIndex="2";
 from.style.transition="none";from.style.transform="translateX(0)";from.style.zIndex="1";
 void to.offsetWidth;
 const reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 const duration=reduced?0:380;
 to.style.transition=from.style.transition="transform "+duration+"ms cubic-bezier(.22,.75,.22,1)";
 return new Promise(resolve=>{
  let finished=false,fallbackTimer=null,onEnd=null;
  const finish=()=>{
   if(finished)return;
   finished=true;
   if(fallbackTimer!==null){window.clearTimeout(fallbackTimer);fallbackTimer=null;}
   if(onEnd){from.removeEventListener("transitionend",onEnd);onEnd=null;}
   if(pendingExploreTransitionFinish===finish)pendingExploreTransitionFinish=null;
   from.hidden=true;from.inert=true;
   to.hidden=false;to.inert=false;
   from.style.removeProperty("transform");from.style.removeProperty("transition");from.style.removeProperty("z-index");
   to.style.removeProperty("transform");to.style.removeProperty("transition");to.style.removeProperty("z-index");
   to.scrollTop=next==="community"?state.communityScrollTop:state.basicScrollTop;
   state.exploreView=next;state.exploreBusy=false;stage.dataset.activeView=next;stage.dataset.transitioning="false";
   stage.querySelectorAll("#ugcNavigationActions button,#ugcBackToBasicButton").forEach(button=>{button.disabled=false;});
   resolve(true);
  };
  pendingExploreTransitionFinish=finish;
  if(duration===0){finish();return;}
  onEnd=event=>{
   if(event.target===from&&event.propertyName==="transform")finish();
  };
  from.addEventListener("transitionend",onEnd);
  requestAnimationFrame(()=>{
   from.style.transform="translateX("+(-direction*100)+"%)";
   to.style.transform="translateX(0)";
  });
  fallbackTimer=window.setTimeout(finish,duration+160);
 });
}
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="hidden"){
  if(pendingExploreTransitionFinish)pendingExploreTransitionFinish();
  return;
 }
 reconcileExplorePanels();
});
window.addEventListener("pageshow",reconcileExplorePanels);
window.addEventListener("focus",reconcileExplorePanels);
function openNewCalculatorMaker(){
 state.editingId=null;state.editingVisibility="";state.editingStatus="draft";state.aiDraft=null;openMaker();
 $("ugcMakerVisibility").value="private";
 $("ugcMakerPrompt").placeholder="Example: Create a calculator that compares the total cost of owning two cars over five years, including purchase price, fuel, insurance and maintenance.";
 $("ugcMakerPrompt").value="";$("ugcMakerPreview").hidden=true;$("ugcMakerVisibility").value="private";
 $("ugcMakerGenerate").textContent="✦ Generate calculator";
 $("ugcMakerTitleHeading").textContent="Create a calculator with AI";
 $("ugcMakerStatus").textContent="Describe what you want to calculate.";
}
async function init(){
 try{await getSession();}catch(_){state.session=null;state.userId="";}
 setExploreInitialView(window.location.pathname.startsWith("/calculator/ugc/")?"community":"basic");
 const navActions=$("ugcNavigationActions");if(navActions)navActions.hidden=!state.userId;
 $("ugcCatalogJumpButton")?.addEventListener("click",()=>{void switchCalculatorExploreView("community");});
 $("ugcMakerJumpButton")?.addEventListener("click",()=>{void switchCalculatorExploreView("community").then(openNewCalculatorMaker);});
 $("ugcBackToBasicButton")?.addEventListener("click",()=>{void switchCalculatorExploreView("basic");});
 document.querySelectorAll("[data-ugc-sort]").forEach(node=>node.addEventListener("click",()=>{setActiveSort(node.dataset.ugcSort);void loadCatalog();}));
 $("ugcPeriodFilter")?.addEventListener("change",event=>{state.period=event.target.value;void loadCatalog();});
 $("ugcCreatorPeriodFilter")?.addEventListener("change",event=>{const value=String(event.target.value||"7d");state.creatorPeriod=CREATOR_PERIODS.includes(value)?value:"7d";void loadCreatorLeaderboards();});
 $("ugcTopCreatorSort")?.addEventListener("change",event=>{const value=String(event.target.value||"overall");state.topCreatorSort=TOP_CREATOR_SORTS.includes(value)?value:"overall";void loadCreatorLeaderboards();});
 $("ugcRisingCreatorSort")?.addEventListener("change",event=>{const value=String(event.target.value||"growth");state.risingCreatorSort=RISING_CREATOR_SORTS.includes(value)?value:"growth";void loadCreatorLeaderboards();});
 $("ugcCommunityMemberSort")?.addEventListener("change",event=>{const value=String(event.target.value||"followers");state.communityMemberSort=COMMUNITY_MEMBER_SORTS.includes(value)?value:"followers";void loadCreatorLeaderboards();});
 $("ugcCategoryFilter")?.addEventListener("change",event=>{state.category=String(event.target.value||"all");void loadCatalog();});
 $("ugcPagePrevious")?.addEventListener("click",()=>goToCatalogPage(currentCatalogPage()-1));
 $("ugcPageNext")?.addEventListener("click",()=>goToCatalogPage(currentCatalogPage()+1));
 $("ugcPageInput")?.addEventListener("change",event=>goToCatalogPage(event.target.value));
 $("ugcPageInput")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();goToCatalogPage(event.target.value);}});
 $("ugcSearch")?.addEventListener("input",event=>{state.search=String(event.target.value||"").trim();clearTimeout(init.searchTimer);init.searchTimer=setTimeout(()=>void loadCatalog(),220);});
 $("ugcCreateButton")?.addEventListener("click",openNewCalculatorMaker);
 $("ugcMakerClose")?.addEventListener("click",closeMaker);
 $("ugcMakerGenerate")?.addEventListener("click",generateWithAI);
 $("ugcMakerSave")?.addEventListener("click",()=>saveMakerDraft(false));
 $("ugcMakerPublish")?.addEventListener("click",()=>saveMakerDraft(true));
 $("ugcDetailBack")?.addEventListener("click",()=>window.closeWorthItUGCCalculator());
 $("ugcDetailSaveDescription")?.addEventListener("click",saveDescription);
 $("ugcDetailSaveUsagePrice")?.addEventListener("click",saveUsagePrice);
 $("ugcDetailLike")?.addEventListener("click",()=>state.activeId&&react(state.activeId,"like"));
 $("ugcDetailDislike")?.addEventListener("click",()=>state.activeId&&react(state.activeId,"dislike"));
 if(sb()?.auth?.onAuthStateChange)sb().auth.onAuthStateChange((event,session)=>{
  const previousUserId=state.userId;
  // Use the session supplied by the auth event; never await getSession() while
  // Supabase is dispatching an auth callback.
  state.session=session||null;
  state.userId=state.session?.user?.id||"";
  const accountChanged=previousUserId!==state.userId;
  if(!state.userId||accountChanged){
   setExploreInitialView("basic");
   state.pages={};state.lastPage=1;
   state.sort="latest";setActiveSort("latest");
  }
  const gallery=$("ugcCommunitySection"),navActions=$("ugcNavigationActions");
  const communityActive=Boolean(state.userId && state.exploreView==="community");
  if(gallery)gallery.hidden=!communityActive;
  if(navActions)navActions.hidden=!state.userId;
  state.catalogRequest++;
  if(state.userId){void loadCatalog();void loadCreatorLeaderboards();}
  else{state.catalog=[];renderCatalog([]);status("Sign in to browse, create and use community calculators.");state.creatorRequest++;state.creatorData=null;renderCreatorLeaderboards(null,"Sign in to discover creators and other community members.");}
 });
 if(state.userId)await Promise.all([loadCatalog(),loadCreatorLeaderboards()]);else{status("Sign in to browse, create and use community calculators.");renderCreatorLeaderboards(null,"Sign in to discover creators and other community members.");}
}
window.loadWorthItUGCCatalog=loadCatalog;
window.recordWorthItUgcView=async id=>{
 if(!state.userId)return null;
 try{
  const result=await sb().rpc("record_worth_it_ugc_view",{p_id:id});
  if(result.error)throw result.error;
  const recorded=normalizeObject(result.data);
  if(recorded?.success===true&&recorded.counted===true){
   if(state.activeCalculator&&String(state.activeCalculator.id)===String(id)){
    state.activeCalculator.views=Math.max(0,Number(state.activeCalculator.views)||0)+1;
    renderDetailStats(state.activeCalculator);
   }
   await Promise.all([loadCatalog(),loadCreatorLeaderboards()]);
  }
  return recorded;
 }catch(error){
  console.warn("UGC view recording failed:",error);
  return null;
 }
};
window.openWorthItUGCCalculatorFromRoute=id=>openDetail(id,{fromUrl:true});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void init(),{once:true});else void init();
})();