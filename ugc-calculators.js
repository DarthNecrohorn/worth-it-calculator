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
 ["AFN","Afghani",2],
 ["EUR","Euro",2],
 ["ALL","Lek",2],
 ["DZD","Algerian Dinar",2],
 ["USD","US Dollar",2],
 ["AOA","Kwanza",2],
 ["XCD","East Caribbean Dollar",2],
 ["XAD","Arab Accounting Dinar",2],
 ["ARS","Argentine Peso",2],
 ["AMD","Armenian Dram",2],
 ["AWG","Aruban Florin",2],
 ["AUD","Australian Dollar",2],
 ["AZN","Azerbaijan Manat",2],
 ["BSD","Bahamian Dollar",2],
 ["BHD","Bahraini Dinar",3],
 ["BDT","Taka",2],
 ["BBD","Barbados Dollar",2],
 ["BYN","Belarusian Ruble",2],
 ["BZD","Belize Dollar",2],
 ["XOF","CFA Franc BCEAO",0],
 ["BMD","Bermudian Dollar",2],
 ["INR","Indian Rupee",2],
 ["BTN","Ngultrum",2],
 ["BOB","Boliviano",2],
 ["BOV","Mvdol",2],
 ["BAM","Convertible Mark",2],
 ["BWP","Pula",2],
 ["NOK","Norwegian Krone",2],
 ["BRL","Brazilian Real",2],
 ["BND","Brunei Dollar",2],
 ["BIF","Burundi Franc",0],
 ["CVE","Cabo Verde Escudo",2],
 ["KHR","Riel",2],
 ["XAF","CFA Franc BEAC",0],
 ["CAD","Canadian Dollar",2],
 ["KYD","Cayman Islands Dollar",2],
 ["CLP","Chilean Peso",0],
 ["CLF","Unidad de Fomento",4],
 ["CNY","Yuan Renminbi",2],
 ["COP","Colombian Peso",2],
 ["COU","Unidad de Valor Real",2],
 ["KMF","Comorian Franc",0],
 ["CDF","Congolese Franc",2],
 ["NZD","New Zealand Dollar",2],
 ["CRC","Costa Rican Colon",2],
 ["CUP","Cuban Peso",2],
 ["XCG","Caribbean Guilder",2],
 ["CZK","Czech Koruna",2],
 ["DKK","Danish Krone",2],
 ["DJF","Djibouti Franc",0],
 ["DOP","Dominican Peso",2],
 ["EGP","Egyptian Pound",2],
 ["SVC","El Salvador Colon",2],
 ["ERN","Nakfa",2],
 ["SZL","Lilangeni",2],
 ["ETB","Ethiopian Birr",2],
 ["FKP","Falkland Islands Pound",2],
 ["FJD","Fiji Dollar",2],
 ["XPF","CFP Franc",0],
 ["GMD","Dalasi",2],
 ["GEL","Lari",2],
 ["GHS","Ghana Cedi",2],
 ["GIP","Gibraltar Pound",2],
 ["GTQ","Quetzal",2],
 ["GBP","Pound Sterling",2],
 ["GNF","Guinean Franc",0],
 ["GYD","Guyana Dollar",2],
 ["HTG","Gourde",2],
 ["HNL","Lempira",2],
 ["HKD","Hong Kong Dollar",2],
 ["HUF","Forint",2],
 ["ISK","Iceland Krona",0],
 ["IDR","Rupiah",2],
 ["XDR","SDR (Special Drawing Right)",null],
 ["IRR","Iranian Rial",2],
 ["IQD","Iraqi Dinar",3],
 ["ILS","New Israeli Sheqel",2],
 ["JMD","Jamaican Dollar",2],
 ["JPY","Yen",0],
 ["JOD","Jordanian Dinar",3],
 ["KZT","Tenge",2],
 ["KES","Kenyan Shilling",2],
 ["KPW","North Korean Won",2],
 ["KRW","Won",0],
 ["KWD","Kuwaiti Dinar",3],
 ["KGS","Som",2],
 ["LAK","Lao Kip",2],
 ["LBP","Lebanese Pound",2],
 ["LSL","Loti",2],
 ["ZAR","Rand",2],
 ["LRD","Liberian Dollar",2],
 ["LYD","Libyan Dinar",3],
 ["CHF","Swiss Franc",2],
 ["MOP","Pataca",2],
 ["MKD","Denar",2],
 ["MGA","Malagasy Ariary",2],
 ["MWK","Malawi Kwacha",2],
 ["MYR","Malaysian Ringgit",2],
 ["MVR","Rufiyaa",2],
 ["MRU","Ouguiya",2],
 ["MUR","Mauritius Rupee",2],
 ["XUA","ADB Unit of Account",null],
 ["MXN","Mexican Peso",2],
 ["MXV","Mexican Unidad de Inversion (UDI)",2],
 ["MDL","Moldovan Leu",2],
 ["MNT","Tugrik",2],
 ["MAD","Moroccan Dirham",2],
 ["MZN","Mozambique Metical",2],
 ["MMK","Kyat",2],
 ["NAD","Namibia Dollar",2],
 ["NPR","Nepalese Rupee",2],
 ["NIO","Cordoba Oro",2],
 ["NGN","Naira",2],
 ["OMR","Rial Omani",3],
 ["PKR","Pakistan Rupee",2],
 ["PAB","Balboa",2],
 ["PGK","Kina",2],
 ["PYG","Guarani",0],
 ["PEN","Sol",2],
 ["PHP","Philippine Peso",2],
 ["PLN","Zloty",2],
 ["QAR","Qatari Rial",2],
 ["RON","Romanian Leu",2],
 ["RUB","Russian Ruble",2],
 ["RWF","Rwanda Franc",0],
 ["SHP","Saint Helena Pound",2],
 ["WST","Tala",2],
 ["STN","Dobra",2],
 ["SAR","Saudi Riyal",2],
 ["RSD","Serbian Dinar",2],
 ["SCR","Seychelles Rupee",2],
 ["SLE","Leone",2],
 ["SGD","Singapore Dollar",2],
 ["XSU","Sucre",null],
 ["SBD","Solomon Islands Dollar",2],
 ["SOS","Somali Shilling",2],
 ["SSP","South Sudanese Pound",2],
 ["LKR","Sri Lanka Rupee",2],
 ["SDG","Sudanese Pound",2],
 ["SRD","Surinam Dollar",2],
 ["SEK","Swedish Krona",2],
 ["CHE","WIR Euro",2],
 ["CHW","WIR Franc",2],
 ["SYP","Syrian Pound",2],
 ["TWD","New Taiwan Dollar",2],
 ["TJS","Somoni",2],
 ["TZS","Tanzanian Shilling",2],
 ["THB","Baht",2],
 ["TOP","Pa’anga",2],
 ["TTD","Trinidad and Tobago Dollar",2],
 ["TND","Tunisian Dinar",3],
 ["TRY","Turkish Lira",2],
 ["TMT","Turkmenistan New Manat",2],
 ["UGX","Uganda Shilling",0],
 ["UAH","Hryvnia",2],
 ["AED","UAE Dirham",2],
 ["USN","US Dollar (Next day)",2],
 ["UYU","Peso Uruguayo",2],
 ["UYI","Uruguay Peso en Unidades Indexadas (UI)",0],
 ["UYW","Unidad Previsional",4],
 ["UZS","Uzbekistan Sum",2],
 ["VUV","Vatu",0],
 ["VES","Bolívar Soberano",2],
 ["VED","Bolívar Soberano",2],
 ["VND","Dong",0],
 ["YER","Yemeni Rial",2],
 ["ZMW","Zambian Kwacha",2],
 ["ZWG","Zimbabwe Gold",2],
 ["XBA","Bond Markets Unit European Composite Unit (EURCO)",null],
 ["XBB","Bond Markets Unit European Monetary Unit (E.M.U.-6)",null],
 ["XBC","Bond Markets Unit European Unit of Account 9 (E.U.A.-9)",null],
 ["XBD","Bond Markets Unit European Unit of Account 17 (E.U.A.-17)",null],
 ["XTS","Codes specifically reserved for testing purposes",null],
 ["XXX","The codes assigned for transactions where no currency is involved",null],
 ["XAU","Gold",null],
 ["XPD","Palladium",null],
 ["XPT","Platinum",null],
 ["XAG","Silver",null]
];
// Historical ISO codes kept available for legacy and historical calculations.
// Bulgaria switched from BGN to EUR on 2026-01-01; BGN is not in the current SIX List One.
const HISTORICAL_CURRENCIES=[["BGN","Bulgarian lev (historical; Bulgaria adopted EUR on 2026-01-01)",2]];
function isSupportedCurrencyCode(code){
 const normalized=String(code||"").trim().toUpperCase();
 return CURRENCIES.some(([currencyCode])=>currencyCode===normalized)
  ||HISTORICAL_CURRENCIES.some(([currencyCode])=>currencyCode===normalized);
}
const UNIT_OPTIONS=[
 ["","No unit"],
 ...CURRENCIES.map(([code,name])=>[code,code+" — "+name]),
 ...HISTORICAL_CURRENCIES.map(([code,name])=>[code,code+" — "+name]),
 ["%","Percent"],["months","Months"],["years","Years"],["days","Days"],["weeks","Weeks"],
 ["hours","Hours"],["minutes","Minutes"],["km","Kilometres"],["miles","Miles"],["kWh","Kilowatt-hours"],
 ["W","Watts"],["kW","Kilowatts"],["L","Litres"],["kg","Kilograms"],["m²","Square metres"],
 ["items","Items"],["units","Units"],["seconds","Seconds"],["m","Metres"],["cm","Centimetres"],["mm","Millimetres"],
 ["m³","Cubic metres"],["mL","Millilitres"],["g","Grams"],["tonnes","Tonnes"],["MWh","Megawatt-hours"],["MJ","Megajoules"],
 ["°C","Degrees Celsius"],["°F","Degrees Fahrenheit"],["L/100 km","Litres per 100 km"],
 ["EUR/kWh","EUR per kWh"],["USD/kWh","USD per kWh"],["RSD/kWh","RSD per kWh"],
 ["EUR/L","EUR per litre"],["EUR/kg","EUR per kilogram"],["EUR/m³","EUR per cubic metre"],
 ["EUR/hour","EUR per hour"],["EUR/month","EUR per month"],["EUR/day","EUR per day"],["km/h","Kilometres per hour"],
 ["m/s","Metres per second"],["g/L","Grams per litre"],["kg/m³","Kilograms per cubic metre"],["kWh/day","Kilowatt-hours per day"],
 ["EUR/m²","EUR per square metre"],["EUR/units","EUR per unit"],["USD/L","USD per litre"],["RSD/L","RSD per litre"]
];
function getCategoryLabels(item){
 const main=CATEGORY_LABELS[item?.category]||"Other";
 const keys=Array.isArray(item?.subcategories)?item.subcategories:(Array.isArray(item?.spec?.subcategories)?item.spec.subcategories:[]);
 const extras=keys.map(key=>CATEGORY_LABELS[key]).filter(Boolean);
 return [main,...extras.filter(label=>label!==main)];
}
let state={userId:"",session:null,blueprintImportActive:false,creationSource:"ai",manualMode:"quick",aiOperationId:"",sort:"latest",period:"12y",category:"all",search:"",pages:{},lastPage:1,totalPages:1,totalCount:0,catalog:[],myCalculators:[],activeId:"",activeCalculator:null,detailRequest:0,catalogRequest:0,creatorRequest:0,creatorPeriod:"7d",topCreatorSort:"overall",risingCreatorSort:"growth",communityMemberSort:"followers",creatorData:null,discoverySearch:"",aiDraft:null,regionalDefaults:null,makerLocale:"",editingId:null,editingVisibility:"",editingStatus:"draft",exploreView:"basic",exploreBusy:false,basicScrollTop:0,communityScrollTop:0,discoveryScrollTop:0,descriptionStatusRequest:0,descriptionStatusTimer:null};
let pendingExploreTransitionFinish=null;
const toast=message=>{if(typeof window.showToast==="function")window.showToast(String(message||""));};
const text=(tag,className,value)=>{const node=document.createElement(tag);if(className)node.className=className;node.textContent=String(value==null?"":value);return node;};
const button=(label,className,handler)=>{const node=text("button",className,label);node.type="button";node.addEventListener("click",handler);return node;};
function status(message,isError){const node=$("ugcCatalogStatus");if(node){node.textContent=String(message||"");node.classList.toggle("is-error",Boolean(isError));}}
function detailStatus(message,isError){const node=$("ugcDetailStatus");if(node){node.textContent=String(message||"");node.classList.toggle("is-error",Boolean(isError));}}
function makerStatus(message,variant="info"){
 const node=$("ugcMakerStatus");if(!node)return;
 node.textContent=String(message||"");
 node.classList.toggle("is-error",variant==="error");
 node.classList.toggle("is-generating",variant==="generating");
}
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
async function toggleCreatorFollow(item,control){
 const targetId=Number(item?.worth_it_id);
 if(!Number.isSafeInteger(targetId)||targetId<1||item?.is_self||control?.disabled)return;
 if(!state.userId){
  toast("Sign in to follow community members.");
  if(typeof window.openAuthModal==="function")window.openAuthModal("signin");
  return;
 }
 const wasFollowing=Boolean(item.is_following);
 control.disabled=true;
 control.textContent=wasFollowing?"Unfollowing…":"Following…";
 try{
  const response=await sb().rpc(wasFollowing?"unfollow_worth_it_user":"follow_worth_it_user",{target_worth_it_id:targetId});
  if(response.error)throw response.error;
  const result=normalizeObject(response.data);
  if(result?.success===false)throw new Error(result.message||result.error||"The follow action could not be completed.");
  const member=state.creatorData?.community_members?.find(row=>Number(row.worth_it_id)===targetId);
  if(member){
   member.is_following=!wasFollowing;
   member.followers=Math.max(0,(Number(member.followers)||0)+(wasFollowing?-1:1));
  }
  renderCreatorLeaderboards(state.creatorData);
  await loadCreatorLeaderboards();
  toast(wasFollowing?"You unfollowed this member.":"You are now following this member.");
 }catch(error){
  control.disabled=false;
  control.textContent=wasFollowing?"Following ✓":"Follow";
  toast(error?.message||"Could not update this follow. Please try again.");
 }
}
function renderCreatorBoard(hostId,rows,kind,emptyMessage){
 const host=$(hostId);if(!host)return;
 host.replaceChildren();
 if(!Array.isArray(rows)||!rows.length){
  host.appendChild(text("p","ugc-creator-list-status",emptyMessage||"No matching members were found for this period yet."));
  return;
 }
 const query=String(state.discoverySearch||"").trim().toLocaleLowerCase();
 const filteredRows=rows.map((item,index)=>({item,index})).filter(({item})=>{
  if(!query)return true;
  const username=String(item.username||"").replace(/^@+/,"");
  const searchable=[item.display_name,username,"@"+username,item.worth_it_id,"#"+item.worth_it_id].join(" ").toLocaleLowerCase();
  return searchable.includes(query);
 });
 if(!filteredRows.length){
  host.appendChild(text("p","ugc-creator-list-status","No creators or members match your search."));
  return;
 }
 filteredRows.forEach(({item,index})=>{
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
  if(kind==="members"&&!item.is_self){
   row.classList.add("ugc-creator-row-with-follow");
   const follow=button(item.is_following?"Following ✓":"Follow","ugc-creator-follow-button",()=>{void toggleCreatorFollow(item,follow);});
   follow.setAttribute("aria-pressed",String(Boolean(item.is_following)));
   follow.setAttribute("aria-label",(item.is_following?"Unfollow ":"Follow ")+String(item.display_name||item.username||"member"));
   row.appendChild(follow);
  }
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
 const limit=120;
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
  const normalizedCardTitle=String(item.title||"").trim().toLowerCase().replace(/\s+/g," ");
  if(normalizedCardTitle==="subscription savings calculator")card.classList.add("ugc-card-subscription-savings");
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
  const source=String(item.creation_source||"");
  if(source==="manual"||source==="ai"){
   const originTag=text("span","ugc-origin-tag "+(source==="manual"?"is-manual":"is-ai-made"),source==="manual"?"MANUAL":"AI MADE");
   originTag.title=source==="manual"?"Created manually without AI.":"Originally created with Worth It AI.";
   originTag.setAttribute("aria-label",source==="manual"?"Created manually without AI":"Originally created with Worth It AI");
   head.appendChild(originTag);
  }
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
    button("Edit manually","ugc-action-secondary",()=>editCalculatorManually(item.id)),
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
   actions.append(button("Edit manually","ugc-action-secondary",()=>editCalculatorManually(item.id)),button("Improve with AI","ugc-action-secondary",()=>editCalculator(item.id)),label,button("Publish","ugc-action-primary",()=>publishCalculator(item.id,select.value)));
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
function compileExpression(source,keys,groups){
 const input=String(source||"");let at=0;
 const groupDefinitions=groups instanceof Map?groups:new Map();
 const fail=()=>{throw new Error("This calculator contains an invalid formula.");};
 const ws=()=>{while(at<input.length&&/\s/.test(input[at]))at++;};
 const take=value=>{ws();if(input.slice(at,at+value.length)===value){at+=value.length;return true;}return false;};
 const identifier=()=>{ws();const m=input.slice(at).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(!m)return null;at+=m[0].length;return m[0];};
 const functions=new Set(["min","max","abs","round","floor","ceil","sqrt","pow","clamp","avg","sum","count","mod","trunc","sign","hypot","log","ln","exp","sin","cos","tan","asin","acos","atan","if","gt","gte","lt","lte","eq","neq","and","or","not"]);
 function primary(){
  ws();
  if(take("(")){const node=add();if(!take(")"))fail();return node;}
  const m=input.slice(at).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
  if(m){at+=m[0].length;const value=Number(m[0]);if(!Number.isFinite(value))fail();return{type:"number",value};}
  const name=identifier();if(!name)fail();
  if(take(".")){
   const field=identifier();
   if(!field||!groupDefinitions.get(name)?.has(field))fail();
   return{type:"groupField",group:name,field};
  }
  if(take("(")){
   if(!functions.has(name))fail();
   const args=[];if(!take(")")){do{args.push(add());}while(take(","));if(!take(")"))fail();}
   const valid=name==="min"||name==="max"||name==="avg"?args.length>=1&&args.length<=12
    :name==="sum"||name==="count"?args.length===1
    :name==="pow"||name==="mod"||name==="gt"||name==="gte"||name==="lt"||name==="lte"||name==="eq"||name==="neq"?args.length===2
    :name==="if"||name==="clamp"?args.length===3
    :name==="and"||name==="or"?args.length>=2&&args.length<=12
    :name==="hypot"?args.length>=2&&args.length<=8
    :name==="round"||name==="log"?args.length>=1&&args.length<=2
    :args.length===1;
   if(!valid)fail();return{type:"call",name,args};
  }
  if(groupDefinitions.has(name))return{type:"group",name};
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
function evaluate(ast,values,groupValues){
 const groups=groupValues&&typeof groupValues==="object"?groupValues:{};
 let n;
 if(ast.type==="number")return ast.value;
 if(ast.type==="variable")return Number(values[ast.name]);
 if(ast.type==="group")return Array.isArray(groups[ast.name])?groups[ast.name]:[];
 if(ast.type==="groupField"){
  const rows=Array.isArray(groups[ast.group])?groups[ast.group]:[];
  return rows.map(row=>Number(row?.[ast.field]??0));
 }
 if(ast.type==="unary"){const v=evaluate(ast.value,values,groups);return ast.op==="-"?-v:v;}
 if(ast.type==="binary"){
  const a=evaluate(ast.left,values,groups),b=evaluate(ast.right,values,groups);
  if(ast.op==="+")n=a+b;else if(ast.op==="-")n=a-b;else if(ast.op==="*")n=a*b;else if(ast.op==="/"){if(b===0)throw new Error("A formula divides by zero. Change your inputs.");n=a/b;}else n=Math.pow(a,b);
 }else if(ast.name==="if"){
  const condition=evaluate(ast.args[0],values,groups);
  n=evaluate(ast.args[condition!==0?1:2],values,groups);
 }else{
  const a=ast.args.map(x=>evaluate(x,values,groups));
  if(ast.name==="sum"){if(!Array.isArray(a[0]))throw new Error("sum() requires a dynamic group field, e.g. sum(expenses.amount).");n=a[0].reduce((total,value)=>total+value,0);}
  else if(ast.name==="count"){if(!Array.isArray(a[0]))throw new Error("count() requires a dynamic group, e.g. count(expenses).");n=a[0].length;}
  else if(ast.name==="min")n=a.length===1&&Array.isArray(a[0])?Math.min(...a[0]):Math.min(...a);
  else if(ast.name==="max")n=a.length===1&&Array.isArray(a[0])?Math.max(...a[0]):Math.max(...a);
  else if(ast.name==="avg")n=a.length===1&&Array.isArray(a[0])?(a[0].length?a[0].reduce((sum,value)=>sum+value,0)/a[0].length:0):a.reduce((sum,value)=>sum+value,0)/a.length;
  else if(ast.name==="abs")n=Math.abs(a[0]);
  else if(ast.name==="round")n=a.length===1?Math.round(a[0]):Number(a[0].toFixed(Math.max(0,Math.min(8,Math.floor(a[1])))));
  else if(ast.name==="floor")n=Math.floor(a[0]);
  else if(ast.name==="ceil")n=Math.ceil(a[0]);
  else if(ast.name==="trunc")n=Math.trunc(a[0]);
  else if(ast.name==="sign")n=Math.sign(a[0]);
  else if(ast.name==="clamp"){if(a[1]>a[2])throw new Error("Clamp minimum cannot be greater than its maximum.");n=Math.min(a[2],Math.max(a[1],a[0]));}
  else if(ast.name==="gt")n=a[0]>a[1]?1:0;
  else if(ast.name==="gte")n=a[0]>=a[1]?1:0;
  else if(ast.name==="lt")n=a[0]<a[1]?1:0;
  else if(ast.name==="lte")n=a[0]<=a[1]?1:0;
  else if(ast.name==="eq")n=a[0]===a[1]?1:0;
  else if(ast.name==="neq")n=a[0]!==a[1]?1:0;
  else if(ast.name==="and")n=a.every(value=>value!==0)?1:0;
  else if(ast.name==="or")n=a.some(value=>value!==0)?1:0;
  else if(ast.name==="not")n=a[0]===0?1:0;
  else if(ast.name==="mod"){if(a[1]===0)throw new Error("A formula cannot calculate a remainder by zero.");n=a[0]%a[1];}
  else if(ast.name==="hypot")n=Math.hypot(...a);
  else if(ast.name==="sqrt"){if(a[0]<0)throw new Error("Square root is invalid for these values.");n=Math.sqrt(a[0]);}
  else if(ast.name==="pow")n=Math.pow(a[0],a[1]);
  else if(ast.name==="log")n=a.length===1?Math.log10(a[0]):Math.log(a[0])/Math.log(a[1]);
  else if(ast.name==="ln")n=Math.log(a[0]);
  else if(ast.name==="exp")n=Math.exp(a[0]);
  else if(ast.name==="sin")n=Math.sin(a[0]);
  else if(ast.name==="cos")n=Math.cos(a[0]);
  else if(ast.name==="tan")n=Math.tan(a[0]);
  else if(ast.name==="asin")n=Math.asin(a[0]);
  else if(ast.name==="acos")n=Math.acos(a[0]);
  else n=Math.atan(a[0]);
 }
 if(!Number.isFinite(n))throw new Error("The calculator produced an invalid result for these input values.");
 return n;
}
function groupMapForSpec(spec){
 const groups=Array.isArray(spec?.groups)?spec.groups:[];
 return new Map(groups.map(group=>[String(group.key||""),new Set((Array.isArray(group.fields)?group.fields:[]).map(field=>String(field.key||"")))]));
}
function defaultGroupValues(groups){
 const values={};
 (Array.isArray(groups)?groups:[]).forEach(group=>{
  const minItems=Math.max(1,Math.min(20,Number(group.minItems)||1));
  values[group.key]=Array.from({length:minItems},()=>Object.fromEntries((group.fields||[]).map(field=>[field.key,Number(field.default)||0])));
 });
 return values;
}
function unitDescriptor(unit){
 const raw=String(unit||"").trim();
 const key=raw.toLowerCase().replace(/\s+/g," ");
 const descriptor=(exact,vector,opaque,symbols={})=>({exact,vector,opaque,symbols});
 const canonicalTimeUnit=value=>({
  days:"day",day:"day",weeks:"week",week:"week",months:"month",month:"month",
  years:"year",year:"year",hours:"hour",hour:"hour",hrs:"hour",hr:"hour",h:"hour",
  minutes:"minute",minute:"minute",seconds:"second",second:"second"
 })[String(value||"").trim().toLowerCase()]||String(value||"").trim();
 if(!raw)return descriptor("",{},false,{});
 if(raw==="1")return descriptor(raw,{},false,{});
 if(/^[A-Z]{3}$/.test(raw))return descriptor(raw,{["currency:"+raw]:1},false,{["currency:"+raw]:raw});
 const rateMatch=raw.match(/^([A-Z]{3})\s*\/\s*(.+)$/);
 if(rateMatch){
  const denominator=rateMatch[2].trim().toLowerCase();
  const dimension=({
   kwh:"energy",mwh:"energy",mj:"energy",l:"volume",litre:"volume",liter:"volume",
   kg:"mass",g:"mass","m³":"volume",m3:"volume","m²":"area",m2:"area",
   hour:"time",hours:"time",hr:"time",hrs:"time",h:"time",day:"time",days:"time",
   week:"time",weeks:"time",month:"time",months:"time",year:"time",years:"time",
   minute:"time",minutes:"time",second:"time",seconds:"time",
   unit:"count",units:"count",item:"count",items:"count",pack:"count",packs:"count",
   person:"count",people:"count",km:"length",mile:"length",miles:"length",m:"length"
  })[denominator];
  if(dimension)return descriptor(raw,{["currency:"+rateMatch[1]]:1,[dimension]:-1},false,{["currency:"+rateMatch[1]]:rateMatch[1],[dimension]:rateMatch[2].trim()});
 }
 const known={
  "%":{},"%/year":{time:-1},"%/month":{time:-1},"%/day":{time:-1},
  months:{time:1},month:{time:1},years:{time:1},year:{time:1},days:{time:1},day:{time:1},weeks:{time:1},week:{time:1},hours:{time:1},hour:{time:1},minutes:{time:1},minute:{time:1},seconds:{time:1},second:{time:1},hr:{time:1},hrs:{time:1},h:{time:1},s:{time:1},
  km:{length:1},kilometres:{length:1},kilometers:{length:1},miles:{length:1},mile:{length:1},m:{length:1},cm:{length:1},mm:{length:1},
  "m²":{area:1},"m2":{area:1},"ft²":{area:1},
  l:{volume:1},litres:{volume:1},liters:{volume:1},"m³":{volume:1},"m3":{volume:1},ml:{volume:1},
  kg:{mass:1},kilograms:{mass:1},g:{mass:1},grams:{mass:1},tonnes:{mass:1},
  kwh:{energy:1},mwh:{energy:1},mj:{energy:1},w:{power:1},kw:{power:1},
  "l/100 km":{volume:1,length:-1},"km/h":{length:1,time:-1},"m/s":{length:1,time:-1},
  "m²/pack":{area:1,count:-1},"kwh/day":{energy:1,time:-1},"kwh/month":{energy:1,time:-1},
  "eur/kwh":{"currency:EUR":1,energy:-1},"usd/kwh":{"currency:USD":1,energy:-1},"rsd/kwh":{"currency:RSD":1,energy:-1},
  "eur/l":{"currency:EUR":1,volume:-1},"usd/l":{"currency:USD":1,volume:-1},"rsd/l":{"currency:RSD":1,volume:-1},
  "eur/kg":{"currency:EUR":1,mass:-1},"eur/m²":{"currency:EUR":1,area:-1},"eur/m2":{"currency:EUR":1,area:-1},
  "eur/m³":{"currency:EUR":1,volume:-1},"eur/m3":{"currency:EUR":1,volume:-1},
  "eur/hour":{"currency:EUR":1,time:-1},"usd/hour":{"currency:USD":1,time:-1},
  "eur/month":{"currency:EUR":1,time:-1},"eur/day":{"currency:EUR":1,time:-1},
  "eur/person/day":{"currency:EUR":1,count:-1,time:-1},"usd/person/day":{"currency:USD":1,count:-1,time:-1},
  "eur/unit":{"currency:EUR":1,count:-1},"eur/item":{"currency:EUR":1,count:-1},"eur/pack":{"currency:EUR":1,count:-1},
  "usd/unit":{"currency:USD":1,count:-1},"usd/item":{"currency:USD":1,count:-1},"rsd/unit":{"currency:RSD":1,count:-1}
 };
 const knownSymbols={
  months:{time:"month"},month:{time:"month"},years:{time:"year"},year:{time:"year"},
  days:{time:"day"},day:{time:"day"},weeks:{time:"week"},week:{time:"week"},
  hours:{time:"hour"},hour:{time:"hour"},minutes:{time:"minute"},minute:{time:"minute"},
  seconds:{time:"second"},second:{time:"second"},hr:{time:"hour"},hrs:{time:"hour"},h:{time:"hour"},s:{time:"second"},
  km:{length:"km"},kilometres:{length:"kilometres"},kilometers:{length:"kilometers"},
  miles:{length:"miles"},mile:{length:"mile"},m:{length:"m"},cm:{length:"cm"},mm:{length:"mm"},
  "m²":{area:"m²"},"m2":{area:"m2"},"ft²":{area:"ft²"},
  l:{volume:"L"},litres:{volume:"litres"},liters:{volume:"liters"},
  "m³":{volume:"m³"},"m3":{volume:"m3"},ml:{volume:"mL"},
  kg:{mass:"kg"},kilograms:{mass:"kilograms"},g:{mass:"g"},grams:{mass:"grams"},tonnes:{mass:"tonnes"},
  kwh:{energy:"kWh"},mwh:{energy:"MWh"},mj:{energy:"MJ"},w:{power:"W"},kw:{power:"kW"},
  "l/100 km":{volume:"L",length:"km"},"km/h":{length:"km",time:"hour"},"m/s":{length:"m",time:"second"},
  "m²/pack":{area:"m²",count:"pack"},"kwh/day":{energy:"kWh",time:"day"},"kwh/month":{energy:"kWh",time:"month"}
 };
 if(Object.prototype.hasOwnProperty.call(known,key)){
  const vector=known[key],symbols={...(knownSymbols[key]||{})};
  Object.keys(vector).forEach(dimension=>{
   if(dimension.startsWith("currency:"))symbols[dimension]=dimension.slice(9);
   else if(!symbols[dimension])symbols[dimension]=({time:"days",length:"km",area:"m²",volume:"L",mass:"kg",energy:"kWh",power:"W",count:"items"})[dimension]||dimension;
  });
  return descriptor(raw,vector,false,symbols);
 }
 if(["items","item","units","unit","people","person","packs","pack","users","user","vehicles","vehicle","cars","car"].includes(key)){
  return descriptor(raw,{count:1},false,{count:raw});
 }
 if(["period","periods","occurrences","times"].includes(key))return descriptor(raw,{},false,{});
 // Compose simple products and quotients dimensionally. Unknown atoms remain distinct
 // opaque dimensions, so GB/hour can be checked without inventing a GB-to-MB conversion.
 if(/[*/]/.test(raw)){
  const compact=raw.replace(/\s*([*/])\s*/g,"$1");
  const parts=compact.split(/([*/])/);
  if(parts.length>=3&&parts.length%2===1){
   let vector={},symbols={},opaque=false,operation=1,valid=true;
   for(let index=0;index<parts.length;index++){
    if(index%2===1){operation=parts[index]==="/" ? -1 : 1;continue;}
    const match=parts[index].match(/^([A-Za-zµμ%°][A-Za-z0-9_µμ%°²³-]*|1)(?:\^(-?[1-4]))?$/);
    if(!match){valid=false;break;}
    const power=Number(match[2]||1)*operation;
    const base=unitDescriptor(match[1]);
    opaque=opaque||base.opaque;
    Object.entries(base.vector).forEach(([dimension,exponent])=>{
     vector[dimension]=(vector[dimension]||0)+exponent*power;
     if(Math.abs(vector[dimension])<1e-10){delete vector[dimension];delete symbols[dimension];}
     else if(base.symbols?.[dimension])symbols[dimension]=base.symbols[dimension];
    });
   }
   if(valid)return descriptor(raw,vector,opaque,symbols);
  }
 }
 if(["period","periods","occurrences","times"].includes(key))return descriptor(raw,{},false,{});
 return descriptor(raw,{["unit:"+key]:1},true,{["unit:"+key]:raw});
}
function combineUnitDescriptors(left,right,sign){
 const vector={...left.vector},symbols={...(left.symbols||{})};
 Object.entries(right.vector).forEach(([key,value])=>{
  vector[key]=(vector[key]||0)+value*sign;
  if(Math.abs(vector[key])<1e-10){delete vector[key];delete symbols[key];}
  else if(!symbols[key]&&right.symbols?.[key])symbols[key]=right.symbols[key];
 });
 return{exact:"",vector,opaque:left.opaque||right.opaque,symbols};
}
function sameUnitDescriptor(left,right){
 const sameDimensions=unitVectorKey(left)===unitVectorKey(right)&&left.opaque===right.opaque;
 if(!sameDimensions)return false;
 if(left.exact===right.exact)return true;
 // A formula-derived descriptor has no explicit display spelling. It may safely
 // match a selected unit only when the complete dimension vector is identical.
 if(!left.exact||!right.exact)return true;
 const vector=Object.entries(left.vector);
 const isSingleCurrency=vector.length===1&&vector[0][0].startsWith("currency:")&&Math.abs(vector[0][1]-1)<1e-9;
 return isSingleCurrency;
}
function constantFormulaValue(ast){
 if(ast.type==="number")return ast.value;
 if(ast.type==="unary"){const value=constantFormulaValue(ast.value);return value===null?null:ast.op==="-"?-value:value;}
 return null;
}
function analyseFormulaUnit(ast,inputs,groups){
 const definitions=Array.isArray(groups)?groups:[];
 if(ast.type==="number")return unitDescriptor("");
 if(ast.type==="variable"){
  const input=inputs.find(item=>item.key===ast.name);
  if(!input)throw new Error("Unknown input or earlier result in formula.");
  return input.unitDescriptor||unitDescriptor(input.unit);
 }
 if(ast.type==="group")return unitDescriptor("");
 if(ast.type==="groupField"){
  const group=definitions.find(item=>item.key===ast.group);
  const field=group?.fields?.find(item=>item.key===ast.field);
  if(!field)throw new Error("Unknown dynamic group field in formula.");
  return unitDescriptor(field.unit);
 }
 if(ast.type==="unary")return analyseFormulaUnit(ast.value,inputs,groups);
 const compatibleUnits=(units,nodes,message)=>{
  const dimensionedIndex=units.findIndex(item=>Object.keys(item.vector).length>0);
  const target=units[dimensionedIndex>=0?dimensionedIndex:0]||unitDescriptor("");
  const valid=units.every((item,index)=>sameUnitDescriptor(item,target)||
   (constantFormulaValue(nodes[index])!==null&&Object.keys(item.vector).length===0));
  if(!valid)throw new Error(message);
  return target;
 };
 if(ast.type==="binary"){
  const left=analyseFormulaUnit(ast.left,inputs,groups),right=analyseFormulaUnit(ast.right,inputs,groups);
  if(ast.op==="+"||ast.op==="-"){
   return compatibleUnits([left,right],[ast.left,ast.right],"Addition and subtraction require matching units. Numeric constants inherit the other value's unit.");
  }
  if(ast.op==="*")return combineUnitDescriptors(left,right,1);
  if(ast.op==="/")return combineUnitDescriptors(left,right,-1);
  const power=constantFormulaValue(ast.right);
  if(power===null&&!Object.keys(left.vector).length)return unitDescriptor("");
  if(power===null)throw new Error("A dimensional value must use a fixed numeric power.");
  const vector={};Object.entries(left.vector).forEach(([key,value])=>{const result=value*power;if(Math.abs(result)>1e-10)vector[key]=result;});
  return{exact:"",vector,opaque:left.opaque,symbols:{...(left.symbols||{})}};
 }
 const args=ast.args.map(arg=>analyseFormulaUnit(arg,inputs,groups));
 const sameArgs=()=>compatibleUnits(args,ast.args,ast.name+"() requires arguments with matching units. Numeric constants inherit the other argument's unit.");
 const dimensionless=()=>{if(Object.keys(args[0].vector).length)throw new Error(ast.name+"() requires a dimensionless condition.");return unitDescriptor("");};
 if(ast.name==="if"){
  dimensionless();
  return compatibleUnits(args.slice(1),ast.args.slice(1),"if() branches must return matching units. Numeric constants inherit the other branch's unit.");
 }
 if(["gt","gte","lt","lte","eq","neq"].includes(ast.name)){
  compatibleUnits(args,ast.args,ast.name+"() compares values with different units. Numeric thresholds inherit the compared input's unit.");
  return unitDescriptor("");
 }
 if(["and","or","not"].includes(ast.name)){
  args.forEach(item=>{if(Object.keys(item.vector).length)throw new Error(ast.name+"() requires dimensionless conditions.");});
  return unitDescriptor("");
 }
 if(ast.name==="count"){
  if(ast.args[0]?.type!=="group")throw new Error("count() requires a dynamic group, e.g. count(expenses).");
  return unitDescriptor("");
 }
 if(ast.name==="sum"&&ast.args[0]?.type!=="groupField")throw new Error("sum() requires a dynamic group field, e.g. sum(expenses.amount).");
 if(["sum","min","max","avg","hypot","mod","clamp"].includes(ast.name))return sameArgs();
 if(["abs","round","floor","ceil","trunc"].includes(ast.name))return args[0];
 if(ast.name==="sign")return unitDescriptor("");
 if(ast.name==="sqrt"){
  const vector={};Object.entries(args[0].vector).forEach(([key,value])=>{if(Math.abs(value/2-Math.round(value/2))>1e-9)throw new Error("Square root requires even unit powers.");if(value/2)vector[key]=value/2;});
  return{exact:"",vector,opaque:args[0].opaque,symbols:{...(args[0].symbols||{})}};
 }
 if(ast.name==="pow"){
  const power=constantFormulaValue(ast.args[1]);
  if(power===null)throw new Error("Power exponent must be a fixed numeric value.");
  const vector={};Object.entries(args[0].vector).forEach(([key,value])=>{if(value*power)vector[key]=value*power;});
  return{exact:"",vector,opaque:args[0].opaque,symbols:{...(args[0].symbols||{})}};
 }
 if(["log","ln","exp","sin","cos","tan","asin","acos","atan"].includes(ast.name)){
  if(Object.keys(args[0].vector).length)throw new Error(ast.name+"() requires a dimensionless input.");
  return unitDescriptor("");
 }
 return unitDescriptor("");
}
function unitVectorKey(unit){
 return Object.entries(unit.vector).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>key+"^"+Number(value.toFixed(6))).join("*");
}
function ensureResultCurrency(result,fallback="EUR"){
 if(!result||result.format!=="currency")return "";
 const current=String(result.currency||"").trim().toUpperCase();
 const isSupported=code=>CURRENCIES.some(([candidate])=>candidate===code)
  ||(typeof HISTORICAL_CURRENCIES!=="undefined"&&HISTORICAL_CURRENCIES.some(([candidate])=>candidate===code));
 if(current){result.currency=current;return current;}
 const preferred=String(fallback||"").trim().toUpperCase();
 result.currency=isSupported(preferred)?preferred:"EUR";
 return result.currency;
}
function validateFormulaResultUnit(result,unit){
 const format=String(result.format||"number");
 if(format==="unit"){
  const expected=unitDescriptor(result.unit);
  if(unitVectorKey(expected)!==unitVectorKey(unit)||expected.opaque!==unit.opaque){
   throw new Error("The formula's dimensions do not match the selected result unit. Check the input units and formula.");
  }
 }else if(format==="currency"){
  const expected=ensureResultCurrency(result);
  const actual=Object.keys(unit.vector);
  if(actual.length!==1||actual[0]!=="currency:"+expected||Math.abs(unit.vector[actual[0]]-1)>1e-9){
   throw new Error("The formula's units do not match the selected "+expected+" result currency. Check the input units and conversion assumptions.");
  }
 }else if(format==="percent"&&Object.keys(unit.vector).length){
  throw new Error("A percent result must be dimensionless. Divide by the relevant base value and multiply by 100.");
 }
}
function evaluateFormulaResults(spec,baseValues,groupValues){
 const inputs=Array.isArray(spec?.inputs)?spec.inputs:[];
 const definitions=Array.isArray(spec?.results)?spec.results:[];
 const groups=Array.isArray(spec?.groups)?spec.groups:[];
 const groupMap=groupMapForSpec(spec);
 const values={...(baseValues||{})};
 const availableKeys=new Set(inputs.map(item=>item.key));
 const unitInputs=inputs.slice();
 const results=[];
 definitions.forEach((item,index)=>{
  const ast=compileExpression(item.expression,availableKeys,groupMap);
  const outputUnit=analyseFormulaUnit(ast,unitInputs,groups);
  validateFormulaResultUnit(item,outputUnit);
  const value=evaluate(ast,values,groupValues||defaultGroupValues(groups));
  if(!Number.isFinite(value))throw new Error("Result "+(index+1)+" must produce one finite number. Use sum(), avg(), min() or max() to aggregate a dynamic group field.");
  results.push({item,label:item.label,value,explanation:String(item.explanation||""),key:String(item.key||"")});
  const resultKey=String(item.key||"").trim();
  if(resultKey){
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(resultKey)||availableKeys.has(resultKey)||groupMap.has(resultKey))throw new Error("Result "+(index+1)+" has an invalid or duplicate variable key.");
   availableKeys.add(resultKey);
   values[resultKey]=value;
   unitInputs.push({key:resultKey,unitDescriptor:outputUnit});
  }
 });
 return results;
}
function collectDynamicGroupValues(root,spec){
 const values={};
 (Array.isArray(spec?.groups)?spec.groups:[]).forEach(group=>{
  const groupHost=root?.querySelector?.('[data-ugc-group-key="'+CSS.escape(group.key)+'"]');
  const rows=groupHost?Array.from(groupHost.querySelectorAll("[data-ugc-group-row]")):[];
  values[group.key]=rows.map(row=>{
   const item={};
   (group.fields||[]).forEach(field=>{
    const control=row.querySelector('[data-ugc-group-field="'+CSS.escape(field.key)+'"]');
    const value=Number(control?.value);
    if(!control||control.value===""||!Number.isFinite(value)||value<Number(field.min)||value>Number(field.max)||!control.validity.valid){
     throw new Error("Enter a valid "+field.label+" value in every "+group.itemLabel.toLowerCase()+".");
    }
    item[field.key]=value;
   });
   return item;
  });
  if(values[group.key].length<Number(group.minItems||1)||values[group.key].length>Number(group.maxItems||20)){
   throw new Error(group.label+" needs between "+group.minItems+" and "+group.maxItems+" items.");
  }
 });
 return values;
}
function appendDynamicGroupControls(host,group,initialRows){
 const section=document.createElement("fieldset");section.className="ugc-dynamic-group";
 section.dataset.ugcGroupKey=group.key;
 section.appendChild(text("legend","",group.label||group.key));
 const note=text("p","ugc-dynamic-group-note","Add or remove "+String(group.itemLabel||"item").toLowerCase()+" rows. Each row is included in the group formulas.");
 section.appendChild(note);
 const rowsHost=document.createElement("div");rowsHost.className="ugc-dynamic-group-rows";
 const minItems=Math.max(1,Number(group.minItems)||1),maxItems=Math.max(minItems,Math.min(20,Number(group.maxItems)||20));
 const notify=()=>{rowsHost.dispatchEvent(new Event("input",{bubbles:true}));};
 let add=null;
 const addRow=(rowValues)=>{
  if(rowsHost.children.length>=maxItems)return;
  const row=document.createElement("div");row.className="ugc-dynamic-group-row";row.dataset.ugcGroupRow="";
  const fields=document.createElement("div");fields.className="ugc-dynamic-group-fields";
  (group.fields||[]).forEach(field=>{
   const label=document.createElement("label");label.textContent=field.label||field.key;
   const input=document.createElement("input");input.type="number";input.min=String(field.min);input.max=String(field.max);input.step=String(field.step||"any");input.value=String(rowValues?.[field.key]??field.default??0);input.required=true;input.dataset.ugcGroupField=field.key;
   label.appendChild(input);if(field.unit)label.appendChild(text("small","",field.unit));
   input.addEventListener("input",notify);fields.appendChild(label);
  });
  const actions=document.createElement("div");actions.className="ugc-dynamic-group-row-actions";
  const remove=button("Remove "+String(group.itemLabel||"item").toLowerCase(),"ugc-manual-remove",()=>{
   if(rowsHost.children.length<=minItems)return;
   row.remove();refreshButtons();notify();
  });
  actions.appendChild(remove);row.append(fields,actions);rowsHost.appendChild(row);refreshButtons();
 };
 const refreshButtons=()=>{
  Array.from(rowsHost.children).forEach(row=>{
   const remove=row.querySelector("button");if(remove)remove.disabled=rowsHost.children.length<=minItems;
  });
  if(add)add.disabled=rowsHost.children.length>=maxItems;
 };
 const rows=Array.isArray(initialRows)&&initialRows.length?initialRows:defaultGroupValues([group])[group.key];
 rows.slice(0,maxItems).forEach(addRow);
 add=button("＋ Add "+String(group.itemLabel||"item").toLowerCase(),"ugc-action-secondary",()=>{
  if(rowsHost.children.length>=maxItems)return;
  addRow(Object.fromEntries((group.fields||[]).map(field=>[field.key,Number(field.default)||0])));notify();
 });
 section.append(rowsHost,add);refreshButtons();host.appendChild(section);
 return section;
}
function validateMakerSpec(spec){
 const errors=[];
 if(!Array.isArray(spec?.inputs)||!spec.inputs.length)errors.push("Add at least one input.");
 if(!Array.isArray(spec?.results)||!spec.results.length)errors.push("Add at least one result.");
 const inputs=Array.isArray(spec?.inputs)?spec.inputs:[],values={};
 const results=Array.isArray(spec?.results)?spec.results:[];
 const groups=Array.isArray(spec?.groups)?spec.groups:[];
 if(inputs.length>24)errors.push("A calculator can contain up to 24 fixed inputs.");
 if(results.length>20)errors.push("A calculator can contain up to 20 results.");
 if(groups.length>4)errors.push("A calculator can contain up to 4 dynamic input groups.");
 inputs.forEach(item=>{
  const label=String(item.label||item.key||"input"),min=Number(item.min),max=Number(item.max),value=Number(item.default),step=Number(item.step);
  if(!/^[a-z][a-z0-9_]{0,31}$/.test(String(item.key||"")))errors.push(label+": variable keys must start with a lowercase letter and use only letters, numbers and underscores.");
  if(![min,max,value,step].every(Number.isFinite)||min>value||value>max||max<min||step<=0){errors.push(label+": check its minimum, maximum, default and step.");return;}
  const textValue=(label+" "+item.key).toLowerCase();
  if(/\b(?:commut(?:e|ing)|work|working|business)\s+days?\b|\bdays?_per_week\b/.test(textValue)&&(min<1||!Number.isInteger(value)||!Number.isInteger(step)||step<1)){
   errors.push(label+": use positive whole days and a step of at least 1.");
  }
  const stepPosition=(value-min)/step;
  if(!Number.isFinite(stepPosition)||Math.abs(stepPosition-Math.round(stepPosition))>1e-7)errors.push(label+": the default value does not match its step.");
  const maxStepPosition=(max-min)/step;
  if(max>min&&(!Number.isFinite(maxStepPosition)||Math.abs(maxStepPosition-Math.round(maxStepPosition))>1e-7))errors.push(label+": the maximum value does not match its step.");
  values[item.key]=value;
 });
 const fixedKeys=new Set(inputs.map(item=>item.key));
 const groupKeys=new Set(),groupFieldKeys=new Set(),groupFieldNames=new Set();
 groups.forEach((group,index)=>{
  const label=String(group.label||group.key||"Group "+(index+1));
  const minItems=Number(group.minItems??1),maxItems=Number(group.maxItems??10);
  if(!/^[a-z][a-z0-9_]{0,31}$/.test(String(group.key||""))||fixedKeys.has(group.key)||groupKeys.has(group.key)||groupFieldNames.has(group.key)){
   errors.push(label+": use a unique lowercase variable key for this group.");
  }
  groupKeys.add(group.key);
  if(label.length<2||label.length>60||String(group.itemLabel||"Item").trim().length<1||String(group.itemLabel||"Item").length>40||!Number.isInteger(minItems)||!Number.isInteger(maxItems)||minItems<1||maxItems<minItems||maxItems>20){
   errors.push(label+": use 1–20 rows and a valid group and item label.");
  }
  if(!Array.isArray(group.fields)||group.fields.length<1||group.fields.length>6)errors.push(label+": each group needs 1–6 numeric fields.");
  (Array.isArray(group.fields)?group.fields:[]).forEach(field=>{
   const fieldLabel=String(field.label||field.key||"Field");
   const min=Number(field.min),max=Number(field.max),value=Number(field.default),step=Number(field.step);
   const composite=String(group.key)+"."+String(field.key);
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(String(field.key||""))||!fieldLabel.trim()||fieldLabel.length>60||groupFieldKeys.has(composite)||groupFieldNames.has(field.key)||fixedKeys.has(field.key)||groupKeys.has(field.key)){
    errors.push(fieldLabel+": use a unique lowercase key within its dynamic group.");
   }
   groupFieldKeys.add(composite);groupFieldNames.add(field.key);
   if(![min,max,value,step].every(Number.isFinite)||min>value||value>max||max<min||step<=0||String(field.unit||"").length>16){
    errors.push(fieldLabel+": check the minimum, maximum, default, step and unit.");
   }
  });
 });
 const groupMap=groupMapForSpec(spec);
 const groupSamples=defaultGroupValues(groups);
 const scenarios=[{...values}];
 const definedScenarios=Array.isArray(spec?.scenarios)?spec.scenarios:[];
 if(definedScenarios.length>3)errors.push("A calculator can contain up to 3 comparison scenarios.");
 const scenarioLabels=new Set();
 definedScenarios.forEach((scenario,index)=>{
  const label=String(scenario?.label||"").trim();
  if(label.length<2||label.length>50)errors.push("Scenario "+(index+1)+": use a name of 2 to 50 characters.");
  const normalized=label.toLowerCase();
  if(normalized&&scenarioLabels.has(normalized))errors.push("Scenario names must be unique.");
  scenarioLabels.add(normalized);
  const scenarioValues={...values};
  if(!scenario?.values||typeof scenario.values!=="object"||Array.isArray(scenario.values)){errors.push("Scenario "+(index+1)+" has invalid input values.");return;}
  Object.entries(scenario.values).forEach(([key,raw])=>{
   const input=inputs.find(item=>item.key===key),value=Number(raw);
   if(!input||!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max)){
    errors.push("Scenario "+(index+1)+": "+key+" must be a valid value within its input range.");return;
   }
   if(input.control==="toggle"&&![0,1].includes(value)){errors.push("Scenario "+(index+1)+": toggle "+key+" must be 0 or 1.");return;}
   if(input.control==="select"&&Array.isArray(input.choices)&&!input.choices.some(choice=>Number(choice.value)===value)){
    errors.push("Scenario "+(index+1)+": "+key+" must match one of its dropdown choices.");return;
   }
   scenarioValues[key]=value;
  });
  scenarios.push(scenarioValues);
 });
 if(inputs.length){
  scenarios.push(Object.fromEntries(inputs.map(item=>[item.key,Number(item.min)])));
  scenarios.push(Object.fromEntries(inputs.map(item=>[item.key,Number(item.max)])));
  inputs.forEach(item=>{
   const low={...values};low[item.key]=Number(item.min);scenarios.push(low);
   const high={...values};high[item.key]=Number(item.max);scenarios.push(high);
  });
  if(inputs.length<=12){
   for(let left=0;left<inputs.length;left++){
    for(let right=left+1;right<inputs.length;right++){
     for(const leftValue of [Number(inputs[left].min),Number(inputs[left].max)]){
      for(const rightValue of [Number(inputs[right].min),Number(inputs[right].max)]){
       const pair={...values};pair[inputs[left].key]=leftValue;pair[inputs[right].key]=rightValue;scenarios.push(pair);
      }
     }
    }
   }
  }
 }
 const availableKeys=new Set(inputs.map(item=>item.key));
 const formulaUnits=inputs.slice();
 const resultKeys=new Set();
 results.forEach((item,index)=>{
  const resultKey=String(item.key||"").trim();
  if(resultKey){
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(resultKey)||availableKeys.has(resultKey)||resultKeys.has(resultKey)||groupKeys.has(resultKey)||groupFieldNames.has(resultKey)){
    errors.push((item.label||"Result "+(index+1))+": result variable keys must be unique lowercase names.");
   }
  }
  const currencyCode=item.format==="currency"?ensureResultCurrency(item):String(item.currency||"").trim().toUpperCase();
  const supportedCurrency=CURRENCIES.some(([code])=>code===currencyCode)
   ||(typeof HISTORICAL_CURRENCIES!=="undefined"&&HISTORICAL_CURRENCIES.some(([code])=>code===currencyCode));
  if(item.format==="currency"&&!supportedCurrency)errors.push((item.label||"A currency result")+": choose a supported ISO 4217 currency code.");
  if(item.format==="unit"&&(!String(item.unit||"").trim()||String(item.unit||"").length>20))errors.push((item.label||"A result")+": select or enter a result unit of up to 20 characters.");
  if(String(item.explanation||"").length>280)errors.push((item.label||"A result")+": its explanation must be 280 characters or fewer.");
  try{
   const ast=compileExpression(item.expression,availableKeys,groupMap);
   const outputUnit=analyseFormulaUnit(ast,formulaUnits,groups);
   validateFormulaResultUnit(item,outputUnit);
   if(resultKey){
    availableKeys.add(resultKey);resultKeys.add(resultKey);
    formulaUnits.push({key:resultKey,unitDescriptor:outputUnit});
   }
  }catch(error){errors.push((item.label||"A result")+" formula: "+String(error?.message||"could not be validated."));}
 });
 scenarios.forEach(sample=>{
  try{evaluateFormulaResults(spec,sample,groupSamples);}
  catch(error){errors.push("Calculator result chain: "+String(error?.message||"could not be validated."));}
 });
 return {errors:[...new Set(errors)]};
}

function unitLabelFromDescriptor(unit){
 const defaults={time:"days",length:"km",area:"m²",volume:"L",mass:"kg",energy:"kWh",power:"W",count:"items"};
 const numerator=[],denominator=[];
 for(const [dimension,rawPower] of Object.entries(unit?.vector||{})){
  const power=Number(rawPower);
  if(!Number.isFinite(power)||Math.abs(power-Math.round(power))>1e-9||Math.abs(power)>4)return "";
  let symbol=unit.symbols?.[dimension]||"";
  if(dimension.startsWith("currency:"))symbol=dimension.slice(9);
  else if(dimension.startsWith("unit:"))symbol=symbol||dimension.slice(5);
  else symbol=symbol||defaults[dimension]||"";
  if(!/^[A-Za-zµμ%°][A-Za-z0-9_µμ%°²³-]*$/.test(symbol))return "";
  const count=Math.abs(Math.round(power));
  const factor=count===1?symbol:symbol+"^"+count;
  (power>0?numerator:denominator).push(factor);
 }
 if(!numerator.length&&!denominator.length)return "";
 const label=(numerator.length?numerator.join("*"):"1")+(denominator.length?"/"+denominator.join("*"):"");
 return label.length<=20?label:"";
}
function formulaAstToText(ast){
 if(ast.type==="number")return String(ast.value);
 if(ast.type==="variable")return ast.name;
 if(ast.type==="group")return ast.name;
 if(ast.type==="groupField")return ast.group+"."+ast.field;
 if(ast.type==="unary")return ast.op+"("+formulaAstToText(ast.value)+")";
 if(ast.type==="binary")return "("+formulaAstToText(ast.left)+ast.op+formulaAstToText(ast.right)+")";
 if(ast.type==="call")return ast.name+"("+ast.args.map(formulaAstToText).join(",")+")";
 throw new Error("Unsupported formula node.");
}
function guardFormulaDivisions(ast,denominatorMayBeZero){
 const mayBeZero=typeof denominatorMayBeZero==="function"?denominatorMayBeZero:()=>true;
 if(ast.type==="binary"){
  const left=guardFormulaDivisions(ast.left,denominatorMayBeZero),right=guardFormulaDivisions(ast.right,denominatorMayBeZero);
  const division={type:"binary",op:ast.op,left,right};
  if(ast.op!=="/"||constantFormulaValue(right)!==null||!mayBeZero(right))return division;
  return{type:"call",name:"if",args:[
   {type:"call",name:"neq",args:[right,{type:"number",value:0}]},
   division,
   {type:"number",value:0}
  ]};
 }
 if(ast.type==="unary")return{...ast,value:guardFormulaDivisions(ast.value,denominatorMayBeZero)};
 if(ast.type==="call"){
  const args=ast.args.map(arg=>guardFormulaDivisions(arg,denominatorMayBeZero));
  if(ast.name!=="mod"||constantFormulaValue(args[1])!==null||!mayBeZero(args[1]))return{...ast,args};
  return{type:"call",name:"if",args:[
   {type:"call",name:"neq",args:[args[1],{type:"number",value:0}]},
   {type:"call",name:"mod",args},
   {type:"number",value:0}
  ]};
 }
 return ast;
}

function blueprintCountAtomFromText(value){
 const text=String(value||"").toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
 if(/\b(?:database|db)\s+reads?\b|\breads?\b/.test(text))return "read";
 if(/\b(?:edge(?:\s+function)?\s+requests?|function requests?|requests?)\b/.test(text))return "request";
 if(/\bsessions?\b/.test(text))return "session";
 if(/\b(?:monthly\s+active\s+)?users?\b/.test(text))return "user";
 return "";
}
function inferBlueprintCountInputUnits(inputs,notes){
 inputs.forEach(input=>{
  if(String(input.unit||"").trim())return;
  const label=String(input.label||input.key||"");
  const normalized=label.toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
  let inferred="";
  const perMatch=normalized.match(/\b(.+?)\s+per\s+(.+?)\b/);
  if(perMatch){
   const numerator=blueprintCountAtomFromText(perMatch[1]);
   const denominator=blueprintCountAtomFromText(perMatch[2]);
   if(numerator&&denominator)inferred=numerator+"/"+denominator;
  }else{
   inferred=blueprintCountAtomFromText(normalized);
  }
  if(inferred){
   input.unit=inferred;
   notes.push(label+": inferred the explicit count/rate unit "+inferred+" from its label.");
  }
 });
}
function materializeCurrencyRateConstants(ast,result,currency,formulaUnits,groups,inputs,usedKeys){
 const pending=[],localKeys=new Set(usedKeys);
 const makeRateInput=(quantityNode,rate)=>{
  if(!(Number.isFinite(rate)&&rate>0)||inputs.length+pending.length>=24)return null;
  let quantityUnit;
  try{quantityUnit=analyseFormulaUnit(quantityNode,formulaUnits,groups);}catch(_){return null;}
  const dimensions=Object.entries(quantityUnit.vector||{});
  if(!dimensions.length||!dimensions.every(([dimension])=>dimension==="count"||dimension.startsWith("unit:")))return null;
  const quantityLabel=unitLabelFromDescriptor(quantityUnit);
  if(!quantityLabel||!/^([A-Za-zµμ%°][A-Za-z0-9_µμ%°²³-]*)$/.test(quantityLabel))return null;
  const unit=currency+"/"+quantityLabel;
  if(unit.length>16)return null;
  const slug=quantityLabel.toLowerCase().replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"");
  const baseKey=("cost_per_"+slug).slice(0,32);
  let key=baseKey,suffix=2;
  while(localKeys.has(key)){
   const ending="_"+suffix++;
   key=baseKey.slice(0,32-ending.length)+ending;
  }
  const mantissa=String(rate).toLowerCase().split("e")[0];
  const exponent=Number(String(rate).toLowerCase().split("e")[1]||0);
  const decimals=Math.max(0,(mantissa.split(".")[1]||"").length-exponent);
  let step=Math.pow(10,-Math.min(8,decimals));
  if(!(step>0)||Math.abs(rate/step-Math.round(rate/step))>1e-7)step=rate;
  const max=Number((Math.max(1,Math.ceil(rate*100/step-1e-9))*step).toPrecision(12));
  const label="Cost per "+quantityLabel.replace(/[_-]+/g," ");
  const input={key,label,control:"number",min:0,max,default:rate,step,unit};
  pending.push(input);
  localKeys.add(key);
  return{type:"variable",name:key};
 };
 const visit=node=>{
  if(!node||typeof node!=="object")return node;
  if(node.type==="binary"&&(node.op==="+"||node.op==="-")){
   return{...node,left:visit(node.left),right:visit(node.right)};
  }
  if(node.type==="binary"&&node.op==="*"){
   const leftConstant=constantFormulaValue(node.left),rightConstant=constantFormulaValue(node.right);
   if((leftConstant!==null)!==(rightConstant!==null)){
    const rate=leftConstant!==null?leftConstant:rightConstant;
    const quantity=leftConstant!==null?node.right:node.left;
    const rateVariable=makeRateInput(quantity,rate);
    if(rateVariable){
     const replacement={type:"binary",op:"*",left:quantity,right:rateVariable};
     return replacement;
    }
   }
   return{...node,left:visit(node.left),right:visit(node.right)};
  }
  if(node.type==="unary")return{...node,value:visit(node.value)};
  if(node.type==="call")return{...node,args:node.args.map(visit)};
  return node;
 };
 const repaired=visit(ast);
 if(!pending.length)return{ast,inputs:[],changed:false};
 const expression=formulaAstToText(repaired);
 if(expression.length>500)return{ast,inputs:[],changed:false};
 return{ast:repaired,inputs:pending,changed:true,expression};
}

function repairMakerBlueprintSpec(sourceSpec){
 const spec=JSON.parse(JSON.stringify(sourceSpec||{})),notes=[];
 const inputs=Array.isArray(spec.inputs)?spec.inputs:[];
 const groups=Array.isArray(spec.groups)?spec.groups:[];
 const results=Array.isArray(spec.results)?spec.results:[];
 inferBlueprintCountInputUnits(inputs,notes);
 const groupMap=groupMapForSpec(spec);
 const resultKeySet=new Set(results.map(item=>String(item?.key||"")).filter(Boolean));
 const knownFormulaFunctions=new Set(["min","max","abs","round","floor","ceil","sqrt","pow","clamp","avg","sum","count","mod","trunc","sign","hypot","log","ln","exp","sin","cos","tan","asin","acos","atan","if","gt","gte","lt","lte","eq","neq","and","or","not","pi","e"]);
 const dependencies=new Map();
 results.forEach(item=>{
  const expression=String(item?.expression||"");
  const refs=new Set((expression.match(/[A-Za-z_][A-Za-z0-9_]*/g)||[]).filter(name=>resultKeySet.has(name)&&!knownFormulaFunctions.has(name.toLowerCase())));
  if(item?.key)dependencies.set(item.key,refs);
 });
 if(dependencies.size===results.length&&results.length>1){
  const remaining=results.slice(),ordered=[],resolved=new Set();
  while(remaining.length){
   const index=remaining.findIndex(item=>[...(dependencies.get(item.key)||[])].every(key=>resolved.has(key)));
   if(index<0)break;
   const [next]=remaining.splice(index,1);ordered.push(next);if(next.key)resolved.add(next.key);
  }
  if(ordered.length===results.length&&ordered.some((item,index)=>item!==results[index])){
   spec.results=ordered;
   notes.push("Reordered result definitions so formula dependencies are evaluated before the results that use them.");
  }
 }
 const availableKeys=new Set(inputs.map(item=>item.key));
 const formulaUnits=inputs.slice();
 const usedVariableKeys=new Set([...inputs.map(item=>item.key),...groups.map(item=>item.key),...groups.flatMap(item=>(item.fields||[]).map(field=>field.key)),...results.map(item=>item.key).filter(Boolean)]);
 const orderedResults=Array.isArray(spec.results)?spec.results:results;
 orderedResults.forEach((result,index)=>{
  const label=String(result?.label||("Result "+(index+1)));
  let expression=String(result?.expression||"");
  const normalizedExpression=expression.replace(/[×·]/g,"*").replace(/÷/g,"/").replace(/[−–—]/g,"-")
   .replace(/[A-Za-z_][A-Za-z0-9_]*/g,token=>knownFormulaFunctions.has(token.toLowerCase())?token.toLowerCase():token);
  if(normalizedExpression!==expression&&normalizedExpression.length<=500){
   result.expression=normalizedExpression;
   expression=normalizedExpression;
   notes.push(label+": normalized common mathematical symbols and formula-function casing without changing variable names.");
  }
  let ast;
  try{ast=compileExpression(expression,availableKeys,groupMap);}
  catch(_){
   // A malformed or unresolved formula cannot be safely invented. Keep it for
   // the final validator to explain rather than replacing it with a guess.
   if(result.key)availableKeys.add(result.key);
   return;
  }
  const denominatorMayBeZero=node=>{
   if(constantFormulaValue(node)!==null)return false;
   if(node?.type==="variable"){
    const input=inputs.find(item=>item.key===node.name);
    if(input)return Number(input.min)<=0&&Number(input.max)>=0;
    return true; // Earlier results have no statically proven range.
   }
   if(node?.type==="groupField"){
    const group=groups.find(item=>item.key===node.group);
    const field=group?.fields?.find(item=>item.key===node.field);
    return !field||Number(field.min)<=0&&Number(field.max)>=0;
   }
   if(node?.type==="unary")return denominatorMayBeZero(node.value);
   return true; // Composite expressions may cross zero unless proven constant.
  };
  const guarded=guardFormulaDivisions(ast,denominatorMayBeZero);
  const guardedText=formulaAstToText(guarded);
  if(guardedText!==result.expression&&guardedText.length<=500){
   result.expression=guardedText;
   notes.push(label+": added zero-denominator guards to division or remainder operations; a zero denominator now produces 0 instead of an invalid result.");
   ast=guarded;
  }
  if(result.format==="currency"){
   const currency=ensureResultCurrency(result);
   const supported=CURRENCIES.some(([code])=>code===currency);
   if(supported){
    const materialized=materializeCurrencyRateConstants(ast,result,currency,formulaUnits,groups,inputs,usedVariableKeys);
    if(materialized.changed){
     materialized.inputs.forEach(input=>{
      inputs.push(input);
      formulaUnits.push(input);
      availableKeys.add(input.key);
      usedVariableKeys.add(input.key);
      notes.push(label+": converted an implicit numeric cost coefficient into the editable input "+input.label+" ("+input.unit+").");
     });
     ast=materialized.ast;
     expression=materialized.expression;
     result.expression=expression;
    }
   }
  }
  let outputUnit;
  try{outputUnit=analyseFormulaUnit(ast,formulaUnits,groups);}
  catch(_){
   if(result.key)availableKeys.add(result.key);
   return;
  }
  const vector=Object.entries(outputUnit.vector||{});
  const unitLabel=unitLabelFromDescriptor(outputUnit);
  const singleCurrency=vector.length===1&&vector[0][0].startsWith("currency:")&&Math.abs(Number(vector[0][1])-1)<1e-9;
  const outputCurrency=singleCurrency?vector[0][0].slice(9):"";
  const dimensionless=vector.length===0;
  const candidate={...result};
  let changed=false;
  if(candidate.format==="percent"){
   // A dimensioned formula cannot safely be reinterpreted as a percentage.
  }else if(dimensionless&&candidate.format==="unit"){
   candidate.format="number";delete candidate.unit;delete candidate.currency;changed=true;
  }else if(singleCurrency&&outputCurrency&&CURRENCIES.some(([code])=>code===outputCurrency)
   &&(candidate.format!=="currency"||String(candidate.currency||"").toUpperCase()!==outputCurrency)){
   candidate.format="currency";candidate.currency=outputCurrency;delete candidate.unit;changed=true;
  }else if(!dimensionless&&!singleCurrency&&unitLabel
   &&(candidate.format!=="unit"||String(candidate.unit||"")!==unitLabel)){
   candidate.format="unit";candidate.unit=unitLabel;delete candidate.currency;changed=true;
  }else if(!dimensionless&&singleCurrency&&candidate.format==="unit"&&unitLabel){
   candidate.format="currency";candidate.currency=outputCurrency;delete candidate.unit;changed=true;
  }else if(candidate.format==="currency"&&!singleCurrency){
   if(unitLabel){
    candidate.format="unit";candidate.unit=unitLabel;delete candidate.currency;changed=true;
   }
  }else if(candidate.format==="unit"&&singleCurrency&&outputCurrency&&CURRENCIES.some(([code])=>code===outputCurrency)){
   candidate.format="currency";candidate.currency=outputCurrency;delete candidate.unit;changed=true;
  }
  if(changed){
   let valid=true;
   try{
    if(candidate.format==="currency"||candidate.format==="unit")validateFormulaResultUnit(candidate,outputUnit);
    else if(candidate.format==="percent"&&dimensionless){}
    else if(candidate.format==="number"&&!dimensionless)valid=false;
   }catch(_){valid=false;}
   if(valid){
    Object.keys(result).forEach(key=>delete result[key]);
    Object.assign(result,candidate);
    notes.push(label+": corrected its result display format/unit to match the formula's calculated dimensions ("+(result.format==="currency"?result.currency:result.format==="unit"?result.unit:result.format==="percent"?"percent":"unitless")+").");
   }
  }
  if(result.key){
   availableKeys.add(result.key);
   formulaUnits.push({key:result.key,unitDescriptor:outputUnit});
  }
 });
 return{spec,notes};
}
validateMakerSpec.repairBlueprintSpec=repairMakerBlueprintSpec;

function makerCurrencyWarnings(spec){
 const knownCurrencies=new Set(CURRENCIES.map(([code])=>code));
 const inputCurrencies=(spec?.inputs||[]).map(item=>String(item.unit||"").trim().toUpperCase()).filter(unit=>knownCurrencies.has(unit));
 const outputCurrencies=(spec?.results||[]).filter(item=>item.format==="currency").map(item=>String(item.currency||"").trim().toUpperCase()).filter(code=>knownCurrencies.has(code));
 const allInputs=[...new Set(inputCurrencies)],allOutputs=[...new Set(outputCurrencies)];
 if(!allInputs.length||!allOutputs.length)return [];
 const warnings=[];
 allInputs.forEach(input=>allOutputs.forEach(output=>{if(input!==output)warnings.push(input+" input → "+output+" result");}));
 return [...new Set(warnings)];
}
function refreshMakerValidationNote(){
 const host=$("ugcMakerPreview"),spec=state.aiDraft?.spec;
 if(!host||!spec)return;
 host.querySelector("#ugcMakerValidationNote")?.remove();
 const validation=validateMakerSpec(spec),currencyWarnings=makerCurrencyWarnings(spec),notes=[];
 if(validation.errors.length){
  const summary=validation.errors.slice(0,5).join(" ");
  notes.push(state.blueprintImportActive
   ?"Quick Fix draft: "+validation.errors.length+" check(s) still need attention. Edit the affected formulas, units or input ranges below; Save and Publish remain blocked until all checks pass. "+summary
   :"Validation needs attention: "+summary);
 }else if(state.blueprintImportActive){
  notes.push("Quick Fix checks now pass. The calculator is still an editable draft; review assumptions and test values before saving or publishing.");
 }else{
  notes.push("Input ranges and formulas pass the default and boundary checks. Each currency remains editable; mismatched currencies are not automatically converted.");
 }
 if(currencyWarnings.length)notes.push("Currency consistency warning ("+currencyWarnings.join(", ")+"). Currency selectors only change display; they do not convert amounts. Add an explicit exchange-rate input and use it in the formula when conversion is intended.");

 const note=text("p",state.blueprintImportActive?"ugc-maker-schema-summary ugc-maker-quick-fix-note":"ugc-maker-schema-summary",notes.join(" "));
 note.id="ugcMakerValidationNote";note.setAttribute("role","status");
 const testToggle=host.querySelector(".ugc-maker-test-toggle");
 if(testToggle)testToggle.insertAdjacentElement("beforebegin",note);else host.appendChild(note);
}
function formatResult(item,value,locale){
 const prefix=String(item.prefix||""),suffix=String(item.suffix||"");
 const format=(options)=>{try{return new Intl.NumberFormat(locale||undefined,options).format(value);}catch(_){return new Intl.NumberFormat(undefined,options).format(value);}};
 if(item.format==="currency"){
  const currency=String(item.currency||"USD").toUpperCase();
  const currencyMeta=[...CURRENCIES,...HISTORICAL_CURRENCIES].find(entry=>entry[0]===currency);
  const minorUnits=currencyMeta?.[2];
  if(Number.isInteger(minorUnits)&&minorUnits>=0&&minorUnits<=4){
   try{return prefix+format({style:"currency",currency,minimumFractionDigits:minorUnits,maximumFractionDigits:minorUnits})+suffix;}catch(_){}
  }
  // ISO codes marked with no minor unit do not define a settlement precision.
  // Keep up to four displayed decimals and show the code explicitly.
  return prefix+format({maximumFractionDigits:4})+" "+currency+suffix;
 }
 if(item.format==="percent")return prefix+format({maximumFractionDigits:2})+"%"+suffix;
 if(item.format==="unit")return prefix+format({maximumFractionDigits:4})+(item.unit?" "+String(item.unit):"")+suffix;
 return prefix+format({maximumFractionDigits:4})+suffix;
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
  if(!Number.isInteger(limit)||!Number.isInteger(used)||!Number.isInteger(remaining)||limit<1||used<0||remaining<0)throw new Error("The AI edit quota response was incomplete.");
  host.textContent="AI improvements today: "+used+"/"+limit+" used · "+remaining+" remaining. Free 1 / Premium Lite 2 / Premium 3. Resets at 00:00 UTC.";
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
  host.textContent="Manual (non-AI) calculator saves today: "+used+"/"+limit+" used · "+remaining+" remaining. Resets at 00:00 UTC.";
 }catch(error){
  host.textContent="Today's save/publish allowance could not be loaded. The server still checks your account limit securely when you save.";
  console.warn("UGC creation quota could not be loaded:",error);
 }
}
async function refreshMakerGenerationQuota(){
 const host=$("ugcMakerGenerationQuotaStatus");
 if(!host||!state.userId)return;
 host.textContent="Checking today's AI generation allowance…";
 try{
  const result=await sb().rpc("get_worth_it_ugc_maker_generation_quota");
  if(result.error)throw result.error;
  const quota=normalizeObject(result.data);
  const limit=Number(quota?.daily_limit),used=Number(quota?.requests_used),remaining=Number(quota?.remaining);
  if(!Number.isInteger(limit)||!Number.isInteger(used)||!Number.isInteger(remaining)||limit<1||used<0||remaining<0){
   throw new Error("The AI generation allowance response was incomplete.");
  }
  host.textContent="AI generations today: "+used+"/"+limit+" used · "+remaining+" remaining. Resets at 00:00 UTC.";
 }catch(error){
  host.textContent="Today's AI generation allowance could not be loaded. The server still checks your plan and internal capacity before every request.";
  console.warn("UGC Maker generation quota could not be loaded:",error);
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
  const controlType=input.control||"number";
  let control;
  if(controlType==="select"&&Array.isArray(input.choices)&&input.choices.length>=2){
   control=document.createElement("select");
   input.choices.forEach(choice=>{const option=document.createElement("option");option.value=String(choice.value);option.textContent=String(choice.label);control.appendChild(option);});
   control.value=String(input.default);
  }else if(controlType==="toggle"){
   const row=document.createElement("span");row.className="ugc-input-toggle-row";
   control=document.createElement("input");control.type="checkbox";control.checked=Number(input.default)>=0.5;control.value="1";
   const stateLabel=text("small","",control.checked?"Enabled":"Disabled");
   row.append(control,stateLabel);wrap.appendChild(row);
   control.addEventListener("change",()=>{stateLabel.textContent=control.checked?"Enabled":"Disabled";});
  }else{
   control=document.createElement("input");control.type=controlType==="slider"?"range":"number";
   control.min=String(input.min);control.max=String(input.max);control.step=String(input.step||"any");control.value=String(input.default);
  }
  control.name=input.key;control.required=controlType!=="toggle";
  wrap.appendChild(control);
  if(input.unit)wrap.appendChild(text("small","",input.unit));
  host.appendChild(wrap);
 });
 (Array.isArray(spec.groups)?spec.groups:[]).forEach(group=>appendDynamicGroupControls(host,group));
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
  const value=control?.type==="checkbox"?(control.checked?1:0):Number(control?.value);
  if(!Number.isFinite(value)||value<Number(item.min)||value>Number(item.max)){
   detailStatus("Enter a valid value for "+item.label+".",true);control?.focus();return;
  }
  values[item.key]=value;
 }
 let groupValues;
 try{groupValues=collectDynamicGroupValues(form,calculator.spec);}
 catch(error){detailStatus(error?.message||"Check the repeated input rows.",true);return;}
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
  const results=evaluateFormulaResults(calculator.spec,values,groupValues).map(item=>({label:item.label,value:formatResult(item.item||{},item.value),explanation:String(item.explanation||"")}));
  const scenarioComparisons=(Array.isArray(calculator.spec.scenarios)?calculator.spec.scenarios:[]).map(scenario=>{
   const scenarioValues={...values,...(scenario.values||{})};
   const scenarioResults=evaluateFormulaResults(calculator.spec,scenarioValues,groupValues).map(item=>({label:item.label,value:formatResult(item.item||{},item.value),explanation:String(item.explanation||"")}));
   return{label:String(scenario.label||"Alternative"),results:scenarioResults};
  });
  const settle=await sb().rpc("calc_wallet_settle",{p_request_id:requestId});
  if(settle.error||!settle.data?.ok)throw new Error("The calculation finished, but its CALC transaction could not be confirmed.");
  reserved=false;
  // calc_wallet_settle records successful public UGC use atomically with the
  // completed CALC transaction. Clear any previous rating gate message.
  if(state.activeCalculator&&String(state.activeCalculator.id)===String(calculator.id)){
   clearReactionNote();
  }
  renderCalculationResults(results,scenarioComparisons);
  detailStatus("Calculation complete. "+priceLabel+" CALC was charged.",false);
  await refreshCalcWallet();
 }catch(error){
  if(reserved)await sb().rpc("calc_wallet_refund",{p_request_id:requestId}).catch(()=>{});
  detailStatus(error?.message||"Could not calculate. Please try again.",true);
 }finally{if(button)button.disabled=false;}
}
function renderCalculationResults(results,scenarioComparisons){
 const host=$("ugcDetailResults");if(!host)return;
 host.replaceChildren();
 const section=text("section","ugc-results-panel");
 section.appendChild(text("h3","","Your results"));
 const grid=document.createElement("div");grid.className="ugc-results-grid";
 results.forEach(result=>{
  const card=document.createElement("div");card.className="ugc-result-card";
  card.append(text("span","",result.label),text("strong","",result.value));
  if(result.explanation)card.appendChild(text("small","ugc-result-explanation",result.explanation));
  grid.appendChild(card);
 });
 section.appendChild(grid);
 if(Array.isArray(scenarioComparisons)&&scenarioComparisons.length){
  const comparison=document.createElement("section");comparison.className="ugc-scenario-public-results";
  comparison.appendChild(text("h3","","Scenario comparison"));
  comparison.appendChild(text("p","ugc-scenario-public-note","The scenarios below use the alternative input values saved by the creator. Your main results above use the values you entered."));
  scenarioComparisons.forEach(scenario=>{
   const group=document.createElement("article");group.className="ugc-scenario-public-group";
   group.appendChild(text("h4","",scenario.label));
   const scenarioGrid=document.createElement("div");scenarioGrid.className="ugc-results-grid";
   scenario.results.forEach(result=>{
    const card=document.createElement("div");card.className="ugc-result-card";
    card.append(text("span","",result.label),text("strong","",result.value));
    if(result.explanation)card.appendChild(text("small","ugc-result-explanation",result.explanation));
    scenarioGrid.appendChild(card);
   });
   group.appendChild(scenarioGrid);comparison.appendChild(group);
  });
  section.appendChild(comparison);
 }
 host.replaceChildren(section);
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
function showReactionNote(message){
 const note=$("ugcDetailReactionNote");
 if(!note)return;
 note.textContent=message;
 note.classList.add("is-warning");
 note.hidden=false;
}
function clearReactionNote(){
 const note=$("ugcDetailReactionNote");
 if(!note)return;
 note.hidden=true;
 note.textContent="";
 note.classList.remove("is-warning");
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
  reactionNote.classList.remove("is-warning");
  reactionNote.textContent=isOwner
   ?"You created this calculator, so you cannot like or dislike it. Other members can rate it."
   :"";
 }
 const policy=$("ugcDetailReactionPolicy");
 if(policy)policy.hidden=!isOwner;
 const policyInput=$("ugcDetailRequireTestBeforeReaction");
 if(policyInput){policyInput.checked=calculator.require_test_before_reaction!==false;policyInput.disabled=false;}
 const policyStatus=$("ugcDetailReactionPolicyStatus");
 if(policyStatus)policyStatus.textContent="";
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
 // The server is authoritative; the policy value is intentionally never
 // sent to non-owners in get_worth_it_ugc_calculator.
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
  clearReactionNote();
  await Promise.all([loadCatalog(),loadCreatorLeaderboards()]);
  if(state.activeId===String(id))await openDetail(id,{fromUrl:true});
 }catch(error){
  const message=String(error?.message||"");
  if(/must complete one calculation before you can like or dislike/i.test(message))showReactionNote(message);
  else toast(message||"Could not save your reaction.");
 }finally{
  const active=state.activeCalculator;
  const canReact=Boolean(active&&String(active.id)===String(state.activeId)&&active.is_owner!==true&&active.visibility==="public"&&state.userId);
  reactionButtons.forEach(button=>{if(button.isConnected)button.disabled=!canReact;});
 }
}
async function saveReactionPolicy(){
 const calculator=state.activeCalculator;
 const input=$("ugcDetailRequireTestBeforeReaction");
 const statusNode=$("ugcDetailReactionPolicyStatus");
 if(!calculator||calculator.is_owner!==true||!input||!requireAccount())return;
 const previous=calculator.require_test_before_reaction!==false;
 const next=input.checked===true;
 input.disabled=true;
 if(statusNode)statusNode.textContent="Saving setting…";
 try{
  const result=await sb().rpc("set_worth_it_ugc_reaction_policy",{
   p_id:calculator.id,
   p_require_test:next
  });
  if(result.error)throw result.error;
  const saved=normalizeObject(result.data);
  if(saved?.success!==true)throw new Error(saved?.error||"The rating setting was not confirmed.");
  calculator.require_test_before_reaction=saved.require_test_before_reaction!==false;
  input.checked=calculator.require_test_before_reaction;
  if(statusNode)statusNode.textContent=calculator.require_test_before_reaction
   ?"Saved. Members must complete one calculation before rating."
   :"Saved. Members can rate without trying the calculator first.";
 }catch(error){
  input.checked=previous;
  if(statusNode)statusNode.textContent=error?.message||"Could not save the rating setting.";
 }finally{
  if(input.isConnected){input.disabled=false;input.checked=calculator.require_test_before_reaction!==false;}
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
 state.creationSource="ai";state.aiOperationId="";
 state.editingId=id;state.editingVisibility=calculator.visibility||"private";state.editingStatus=calculator.status||"draft";
 openMaker();
 const modal=$("ugcMakerModal");
 modal.querySelector("[name=prompt]").value="";
 $("ugcMakerPrompt").placeholder="Describe how Worth It AI should improve this existing calculator (for example: make the cost assumptions more precise or improve the formulas). Its subject and purpose cannot be changed.";
 state.aiDraft={title:calculator.title,description:calculator.description||"",category:calculator.category,subcategories:calculator.subcategories||[],spec:calculator.spec};
 renderMakerPreview(state.aiDraft);setMakerModeUI();
 makerStatus("Your calculator's subject, title, category and description stay fixed. Ask AI to improve its inputs and formulas.");
}
async function editCalculatorManually(id){
 if(!requireAccount()||!verifyConfirmed())return;
 const result=await sb().rpc("get_worth_it_ugc_calculator",{p_id:id});
 if(result.error){status("Could not load this calculator for manual editing.",true);return;}
 const calculator=normalizeObject(result.data);
 if(!calculator||calculator.is_owner!==true){status("You can edit only your own calculators.",true);return;}
 state.creationSource="manual";state.aiOperationId="";
 state.editingId=id;state.editingVisibility=calculator.visibility||"private";state.editingStatus=calculator.status||"draft";
 state.manualMode="advanced";
 openMaker();
 const mode=$("ugcManualMode");if(mode)mode.value="advanced";
 const templateWrap=$("ugcManualTemplateWrap");if(templateWrap)templateWrap.hidden=true;
 state.aiDraft={title:calculator.title,description:calculator.description||"",category:calculator.category,subcategories:calculator.subcategories||[],spec:JSON.parse(JSON.stringify(calculator.spec||{}))};
 renderMakerPreview(state.aiDraft);setMakerModeUI();
 makerStatus("Edit the calculator directly. Manual edits do not use AI, cost CALC or consume a new-calculator save allowance.");
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
 const manual=state.creationSource==="manual",editing=Boolean(state.editingId);
 if(editing&&!manual)void refreshAiEditQuota();
 if(!editing)void refreshCreationQuota();
 if(!manual&&!editing)void refreshMakerGenerationQuota();
 const editQuota=$("ugcMakerEditQuotaStatus"),createQuota=$("ugcMakerQuotaStatus");
 const generationQuota=$("ugcMakerGenerationQuotaStatus");
 if(editQuota)editQuota.hidden=!(editing&&!manual);
 if(createQuota)createQuota.hidden=editing;
 if(generationQuota)generationQuota.hidden=manual||editing;
 const visibilityWrap=$("ugcMakerVisibilityWrap");
 if(visibilityWrap)visibilityWrap.hidden=editing;
 setMakerModeUI();
 if(!editing)makerStatus(manual?"Choose a builder mode and customize your calculator.":"Describe your calculator in at least 10 characters.");
 if(!manual)$("ugcMakerPrompt")?.focus();
}
function closeMaker(){
 const modal=$("ugcMakerModal");if(modal){modal.hidden=true;modal.setAttribute("aria-hidden","true");}
 document.body.classList.remove("ugc-maker-open");
}
function refreshMakerTestIfOpen(){
 const panel=$("ugcMakerTestPanel");
 if(panel&&!panel.hidden)renderMakerTestPanel(true);
 refreshMakerValidationNote();
}
function numericControlValue(control){
 if(!control)return NaN;
 if(control.type==="checkbox")return control.checked?1:0;
 const value=Number(control.value);
 return Number.isFinite(value)?value:NaN;
}
function renderMakerTestPanel(preserveValues){
 const panel=$("ugcMakerTestPanel"),spec=state.aiDraft?.spec;
 if(!panel||!Array.isArray(spec?.inputs)||!Array.isArray(spec?.results))return;
 const previous=new Map();
 if(preserveValues){
  panel.querySelectorAll("[data-ugc-maker-test-key]").forEach(control=>{
   const value=numericControlValue(control);if(Number.isFinite(value))previous.set(control.dataset.ugcMakerTestKey,value);
  });
 }
 panel.replaceChildren();
 const heading=document.createElement("div");heading.className="ugc-maker-test-head";
 const intro=document.createElement("div");
 intro.append(text("h4","","Try your calculator"),text("p","","Change the sample values below. Results recalculate instantly using the same restricted formulas as the saved calculator."));
 const reset=button("Reset values","ugc-maker-test-reset",()=>renderMakerTestPanel(false));
 reset.setAttribute("aria-label","Reset test values to the calculator defaults");
 heading.append(intro,reset);panel.appendChild(heading);
 const localeLabel=document.createElement("label");localeLabel.className="ugc-maker-test-locale";
 localeLabel.appendChild(text("span","","Number format"));
 const localeSelect=document.createElement("select");localeSelect.setAttribute("aria-label","Number formatting locale");
 const localeOptions=[["auto","Use browser settings"],["en-US","English (United States)"],["en-GB","English (United Kingdom)"],["de-DE","German (Germany)"],["fr-FR","French (France)"],["es-ES","Spanish (Spain)"],["pt-BR","Portuguese (Brazil)"],["sr-Latn-RS","Serbian (Latin)"],["ja-JP","Japanese (Japan)"]];
 const selectedLocale=state.makerLocale||state.regionalDefaults?.locale||"auto";
 localeOptions.forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;localeSelect.appendChild(option);});
 if(selectedLocale!=="auto"&&!localeOptions.some(([value])=>value===selectedLocale)){const option=document.createElement("option");option.value=selectedLocale;option.textContent="Detected regional format ("+selectedLocale+")";localeSelect.appendChild(option);}
 localeSelect.value=selectedLocale;
 localeSelect.addEventListener("change",()=>{state.makerLocale=localeSelect.value;updateMakerTestResults(panel);});
 localeLabel.appendChild(localeSelect);panel.appendChild(localeLabel);
 const inputGrid=document.createElement("div");inputGrid.className="ugc-maker-test-inputs";
 spec.inputs.forEach(item=>{
  const label=document.createElement("label");label.className="ugc-maker-test-input";
  label.appendChild(text("span","",item.label||item.key));
  const controlType=item.control||"number";
  const previousValue=previous.get(item.key);
  const candidate=Number.isFinite(previousValue)?previousValue:Number(item.default);
  let control;
  if(controlType==="select"&&Array.isArray(item.choices)&&item.choices.length>=2){
   control=document.createElement("select");
   item.choices.forEach(choice=>{const option=document.createElement("option");option.value=String(choice.value);option.textContent=String(choice.label);control.appendChild(option);});
   control.value=String(item.choices.some(choice=>Number(choice.value)===candidate)?candidate:item.default);
  }else if(controlType==="toggle"){
   control=document.createElement("input");control.type="checkbox";control.checked=candidate>=0.5;
  }else{
   control=document.createElement("input");control.type=controlType==="slider"?"range":"number";
   if(item.min!==undefined)control.min=String(item.min);
   if(item.max!==undefined)control.max=String(item.max);
   control.step=String(item.step||"any");
   control.value=String(Number.isFinite(candidate)?candidate:"");
  }
  control.name=item.key;control.required=controlType!=="toggle";control.dataset.ugcMakerTestKey=String(item.key);
  control.addEventListener("input",()=>updateMakerTestResults(panel));
  label.appendChild(control);
  if(item.unit)label.appendChild(text("small","",item.unit));
  inputGrid.appendChild(label);
 });
 panel.appendChild(inputGrid);
 (Array.isArray(spec.groups)?spec.groups:[]).forEach(group=>{
  const groupSection=appendDynamicGroupControls(panel,group);
  groupSection.addEventListener("input",()=>updateMakerTestResults(panel));
 });
 panel.appendChild(text("h4","ugc-maker-test-results-heading","Live results"));
 const results=document.createElement("div");results.className="ugc-maker-test-results-grid";results.setAttribute("aria-live","polite");
 panel.appendChild(results);
 const statusNode=text("p","ugc-maker-test-status","");
 statusNode.setAttribute("role","status");statusNode.setAttribute("aria-live","polite");
 panel.appendChild(statusNode);
 panel.appendChild(text("p","ugc-maker-test-note","Free local test · No CALC is charged, no AI request is sent, and nothing is saved. Changing the number format only affects this preview."));
 updateMakerTestResults(panel);
}
function updateMakerTestResults(panel){
 const spec=state.aiDraft?.spec;
 if(!panel||!Array.isArray(spec?.inputs)||!Array.isArray(spec?.results))return;
 const controls=Array.from(panel.querySelectorAll("[data-ugc-maker-test-key]")),values={};
 let invalidControl=null;
 controls.forEach(control=>{
  const isToggle=control.type==="checkbox";
  const numericValue=numericControlValue(control);
  const valid=isToggle||(control.value!==""&&Number.isFinite(numericValue)&&control.validity.valid);
  control.setAttribute("aria-invalid",String(!valid));
  if(!valid&&!invalidControl)invalidControl=control;
  if(valid)values[control.dataset.ugcMakerTestKey]=numericValue;
 });
 const output=panel.querySelector(".ugc-maker-test-results-grid"),statusNode=panel.querySelector(".ugc-maker-test-status");
 if(!output||!statusNode)return;
 output.replaceChildren();
 if(invalidControl){statusNode.textContent="Enter a valid value within the allowed minimum, maximum and step for every input.";return;}
 let groupValues;
 try{groupValues=collectDynamicGroupValues(panel,spec);}
 catch(error){statusNode.textContent=error?.message||"Check the dynamic group values.";return;}
 let formulaErrors=0;
 const renderResults=(host,scenarioValues,compact)=>{
  host.replaceChildren();
  try{
   evaluateFormulaResults(spec,scenarioValues,groupValues).forEach(item=>{
    const card=document.createElement(compact?"div":"article");
    card.className=compact?"ugc-maker-scenario-result":"ugc-maker-test-result";
    card.appendChild(text("span","",item.label||"Result"));
    card.appendChild(text(compact?"b":"strong","",formatResult(item.item||{},item.value,state.makerLocale==="auto"?"":(state.makerLocale||state.regionalDefaults?.locale||""))));
    if(!compact&&item.explanation)card.appendChild(text("small","ugc-result-explanation",item.explanation));
    host.appendChild(card);
   });
  }catch(error){
   formulaErrors++;
   const card=text(compact?"div":"article",compact?"ugc-maker-scenario-result is-error":"ugc-maker-test-result is-error","");
   card.append(text("span","", "Calculation error"),text(compact?"b":"strong","", "Cannot calculate"),text("small","",error?.message||"Check the formula."));
   host.appendChild(card);
  }
 };
 renderResults(output,values,false);
 const configuredScenarios=Array.isArray(spec.scenarios)?spec.scenarios:[];
 panel.querySelector(".ugc-maker-scenario-comparisons")?.remove();
 if(configuredScenarios.length){
  const section=document.createElement("section");section.className="ugc-maker-scenario-comparisons";
  section.appendChild(text("h4","ugc-maker-test-results-heading","Compare scenarios"));
  const groups=[{label:"Current test values",values},...configuredScenarios.map(scenario=>({...scenario,values:{...values,...scenario.values}}))];
  groups.forEach((scenario,scenarioIndex)=>{
   const group=document.createElement("article");group.className="ugc-maker-scenario-result-group";
   group.appendChild(text("strong","",scenario.label||"Alternative "+scenarioIndex));
   const grid=document.createElement("div");grid.className="ugc-maker-scenario-result-grid";
   renderResults(grid,scenario.values,true);group.appendChild(grid);section.appendChild(group);
  });
  const statusAnchor=panel.querySelector(".ugc-maker-test-status");
  if(statusAnchor)panel.insertBefore(section,statusAnchor);else panel.appendChild(section);
 }
 const validation=validateMakerSpec(spec);
 statusNode.textContent=formulaErrors
  ?" "+formulaErrors+" result formula"+(formulaErrors===1?" needs":"s need")+" attention. Check the highlighted result"+(formulaErrors===1?".":"s.")
  :validation.errors.length
   ?"Live calculation works for these values, but validation needs attention: "+validation.errors.slice(0,2).join(" ")
   :"Results update automatically. Formula dependencies, unit compatibility and input boundaries were checked.";
}
const MANUAL_TEMPLATES={
 "simple-cost":{
  title:"Simple total cost calculator",
  description:"Estimate the total cost from a quantity and a price per unit. Change the quantity, unit price and currency to match your own situation.",
  category:"other",
  inputs:[
   {key:"quantity",label:"Quantity",min:0,max:1000000,default:1,step:1,unit:"units"},
   {key:"unit_price",label:"Price per unit",min:0,max:1000000,default:10,step:0.01,unit:"EUR/unit"}
  ],
  results:[{label:"Total cost",expression:"quantity * unit_price",format:"currency",currency:"EUR"}]
 },
 "monthly-cost":{
  title:"Monthly, weekly and yearly cost calculator",
  description:"Estimate a recurring cost over weekly and yearly periods. The weekly figure uses 12 months divided by 52 weeks, and the yearly figure assumes 12 equal monthly payments.",
  category:"money",
  inputs:[{key:"monthly_cost",label:"Monthly cost",min:0,max:100000000,default:100,step:0.01,unit:"EUR"}],
  results:[
   {label:"Monthly cost",expression:"monthly_cost",format:"currency",currency:"EUR"},
   {label:"Estimated weekly cost",expression:"monthly_cost * 12 / 52",format:"currency",currency:"EUR"},
   {label:"Yearly cost",expression:"monthly_cost * 12",format:"currency",currency:"EUR"}
  ]
 },
 "compare-costs":{
  title:"Compare two monthly costs",
  description:"Compare two recurring monthly costs and see their annual totals and difference. Both options must use the same currency and cover the same period.",
  category:"money",
  inputs:[
   {key:"option_a_monthly",label:"Option A monthly cost",min:0,max:100000000,default:100,step:0.01,unit:"EUR"},
   {key:"option_b_monthly",label:"Option B monthly cost",min:0,max:100000000,default:80,step:0.01,unit:"EUR"}
  ],
  results:[
   {label:"Option A yearly cost",expression:"option_a_monthly * 12",format:"currency",currency:"EUR"},
   {label:"Option B yearly cost",expression:"option_b_monthly * 12",format:"currency",currency:"EUR"},
   {label:"Monthly difference (A − B)",expression:"option_a_monthly - option_b_monthly",format:"currency",currency:"EUR"},
   {label:"Yearly difference (A − B)",expression:"(option_a_monthly - option_b_monthly) * 12",format:"currency",currency:"EUR"}
  ]
 },
 "electricity-cost":{
  title:"Electricity cost calculator",
  description:"Estimate the electricity bill from monthly energy consumption and the price per kilowatt-hour. This simple model uses one supplied unit price and does not estimate taxes, fixed fees or tariff bands unless you add them.",
  category:"home",
  inputs:[
   {key:"monthly_kwh",label:"Monthly electricity use",min:0,max:10000000,default:400,step:1,unit:"kWh"},
   {key:"price_per_kwh",label:"Price per kWh",min:0,max:100000,default:0.15,step:0.001,unit:"EUR/kWh"}
  ],
  results:[
   {label:"Estimated monthly electricity cost",expression:"monthly_kwh * price_per_kwh",format:"currency",currency:"EUR"},
   {label:"Estimated yearly electricity cost",expression:"monthly_kwh * price_per_kwh * 12",format:"currency",currency:"EUR"}
  ]
 },
 "fuel-cost":{
  title:"Vehicle fuel cost calculator",
  description:"Estimate fuel use and cost from monthly distance, vehicle consumption and the fuel price. The calculation assumes the entered fuel consumption remains constant across the selected distance.",
  category:"cars",
  inputs:[
   {key:"monthly_distance",label:"Distance driven per month",min:0,max:1000000,default:1000,step:1,unit:"km"},
   {key:"fuel_consumption",label:"Fuel consumption",min:0,max:1000,default:7,step:0.1,unit:"L/100 km"},
   {key:"fuel_price",label:"Fuel price",min:0,max:100000,default:1.6,step:0.001,unit:"EUR/L"}
  ],
  results:[
   {label:"Monthly fuel use",expression:"monthly_distance * fuel_consumption / 100",format:"number",suffix:" L"},
   {label:"Monthly fuel cost",expression:"monthly_distance * fuel_consumption / 100 * fuel_price",format:"currency",currency:"EUR"},
   {label:"Yearly fuel cost",expression:"monthly_distance * fuel_consumption / 100 * fuel_price * 12",format:"currency",currency:"EUR"}
  ]
 },
 "savings-total":{
  title:"Savings contributions calculator",
  description:"Estimate the amount saved from an initial balance and regular monthly contributions. This model does not include interest, investment returns, fees or inflation.",
  category:"money",
  inputs:[
   {key:"starting_savings",label:"Starting savings",min:0,max:100000000,default:0,step:0.01,unit:"EUR"},
   {key:"monthly_deposit",label:"Monthly contribution",min:0,max:10000000,default:100,step:0.01,unit:"EUR/month"},
   {key:"months",label:"Number of months",min:1,max:1200,default:12,step:1,unit:"months"}
  ],
  results:[
   {label:"Total contributions",expression:"monthly_deposit * months",format:"currency",currency:"EUR"},
   {label:"Estimated total savings",expression:"starting_savings + monthly_deposit * months",format:"currency",currency:"EUR"}
  ]
 },
 "unit-price-compare":{
  title:"Compare price per unit",
  description:"Compare two package prices using cost per matching unit. Enter both prices in the same currency and both quantities in the same unit (for example, items, grams or millilitres). The calculation does not adjust for quality, waste or product differences.",
  category:"money",
  inputs:[
   {key:"price_a",label:"Option A package price",min:0,max:100000000,default:12,step:0.01,unit:"EUR"},
   {key:"quantity_a",label:"Option A quantity",min:0.01,max:1000000,default:6,step:0.01,unit:"units"},
   {key:"price_b",label:"Option B package price",min:0,max:100000000,default:18,step:0.01,unit:"EUR"},
   {key:"quantity_b",label:"Option B quantity",min:0.01,max:1000000,default:10,step:0.01,unit:"units"}
  ],
  results:[
   {label:"Option A price per unit",expression:"price_a / quantity_a",format:"unit",unit:"EUR/unit"},
   {label:"Option B price per unit",expression:"price_b / quantity_b",format:"unit",unit:"EUR/unit"},
   {label:"Unit price difference (A − B)",expression:"price_a / quantity_a - price_b / quantity_b",format:"unit",unit:"EUR/unit"}
  ]
 },
 "discount-price":{
  title:"Discount and final price calculator",
  description:"Calculate the money saved and final price after a percentage discount. This estimate excludes taxes, delivery, coupons and additional fees unless they are included in the original price.",
  category:"money",
  inputs:[
   {key:"original_price",label:"Original price",min:0,max:100000000,default:100,step:0.01,unit:"EUR"},
   {key:"discount_percent",label:"Discount",min:0,max:100,default:15,step:0.1,unit:"%"}
  ],
  results:[
   {label:"Money saved",expression:"original_price * discount_percent / 100",format:"currency",currency:"EUR"},
   {label:"Final price",expression:"original_price * (1 - discount_percent / 100)",format:"currency",currency:"EUR"}
  ]
 },
 "heating-compare":{
  title:"Electricity vs pellet heating cost",
  description:"Compare monthly electricity and pellet spending and show their yearly difference. Enter both energy prices in the same currency. This compares spending only; it does not convert both fuels into equal useful heat or account for boiler, stove or heating-system efficiency.",
  category:"home",
  inputs:[
   {key:"electricity_kwh",label:"Monthly electricity use for heating",min:0,max:10000000,default:800,step:1,unit:"kWh"},
   {key:"electricity_price",label:"Electricity price per kWh",min:0,max:100000,default:0.15,step:0.001,unit:"EUR/kWh"},
   {key:"pellet_kg",label:"Monthly pellet use",min:0,max:10000000,default:500,step:1,unit:"kg"},
   {key:"pellet_price",label:"Pellet price per kg",min:0,max:100000,default:0.30,step:0.001,unit:"EUR/kg"}
  ],
  results:[
   {label:"Electricity heating per month",expression:"electricity_kwh * electricity_price",format:"currency",currency:"EUR"},
   {label:"Pellet heating per month",expression:"pellet_kg * pellet_price",format:"currency",currency:"EUR"},
   {label:"Electricity heating per year",expression:"electricity_kwh * electricity_price * 12",format:"currency",currency:"EUR"},
   {label:"Pellet heating per year",expression:"pellet_kg * pellet_price * 12",format:"currency",currency:"EUR"},
   {label:"Annual cost difference (electricity − pellets)",expression:"(electricity_kwh * electricity_price - pellet_kg * pellet_price) * 12",format:"currency",currency:"EUR"}
  ]
 },
 "water-cost":{
  title:"Water usage cost calculator",
  description:"Estimate a monthly and yearly water bill from consumption, a variable price per cubic metre and a fixed monthly fee. The estimate assumes constant monthly use and prices and excludes additional taxes or charges not entered.",
  category:"home",
  inputs:[
   {key:"monthly_water_m3",label:"Monthly water use",min:0,max:1000000,default:15,step:0.1,unit:"m³"},
   {key:"price_per_m3",label:"Price per cubic metre",min:0,max:100000,default:2.5,step:0.01,unit:"EUR/m³"},
   {key:"fixed_monthly_fee",label:"Fixed monthly fee",min:0,max:100000,default:5,step:0.01,unit:"EUR"}
  ],
  results:[
   {label:"Monthly usage charge",expression:"monthly_water_m3 * price_per_m3",format:"currency",currency:"EUR"},
   {label:"Estimated monthly bill",expression:"monthly_water_m3 * price_per_m3 + fixed_monthly_fee",format:"currency",currency:"EUR"},
   {label:"Estimated yearly bill",expression:"(monthly_water_m3 * price_per_m3 + fixed_monthly_fee) * 12",format:"currency",currency:"EUR"}
  ]
 },
 "flooring-materials":{
  title:"Flooring materials estimate",
  description:"Estimate the number of flooring packs and material cost for a measured area. Pack count is rounded up to a whole pack. Add a suitable cutting and waste allowance to the measured area before calculating; no waste allowance is added automatically.",
  category:"home",
  inputs:[
   {key:"area_m2",label:"Floor area",min:0,max:1000000,default:24,step:0.1,unit:"m²"},
   {key:"coverage_per_pack",label:"Coverage per pack",min:0.01,max:100000,default:2.2,step:0.01,unit:"m²/pack"},
   {key:"price_per_pack",label:"Price per pack",min:0,max:1000000,default:25,step:0.01,unit:"EUR/pack"}
  ],
  results:[
   {label:"Packs required",expression:"ceil(area_m2 / coverage_per_pack)",format:"number"},
   {label:"Total material cost",expression:"ceil(area_m2 / coverage_per_pack) * price_per_pack",format:"currency",currency:"EUR"},
   {label:"Purchased coverage",expression:"ceil(area_m2 / coverage_per_pack) * coverage_per_pack",format:"unit",unit:"m²"}
  ]
 },
 "car-ownership-cost":{
  title:"Monthly car ownership cost",
  description:"Estimate recurring car costs over a selected number of months using distance, fuel consumption, fuel price, insurance and maintenance. Purchase price, depreciation, financing, registration, taxes, parking and resale value are excluded unless you add them separately.",
  category:"cars",
  inputs:[
   {key:"monthly_distance",label:"Distance driven per month",min:0,max:1000000,default:1000,step:1,unit:"km"},
   {key:"fuel_consumption",label:"Fuel consumption",min:0,max:1000,default:7,step:0.1,unit:"L/100 km"},
   {key:"fuel_price",label:"Fuel price",min:0,max:100000,default:1.6,step:0.001,unit:"EUR/L"},
   {key:"monthly_insurance",label:"Monthly insurance",min:0,max:1000000,default:60,step:0.01,unit:"EUR"},
   {key:"monthly_maintenance",label:"Monthly maintenance allowance",min:0,max:1000000,default:35,step:0.01,unit:"EUR"},
   {key:"months",label:"Ownership period",min:1,max:1200,default:12,step:1,unit:"periods"}
  ],
  results:[
   {label:"Monthly fuel use",expression:"monthly_distance * fuel_consumption / 100",format:"number",suffix:" L"},
   {label:"Estimated monthly ownership cost",expression:"monthly_distance * fuel_consumption / 100 * fuel_price + monthly_insurance + monthly_maintenance",format:"currency",currency:"EUR"},
   {label:"Estimated cost over selected period",expression:"(monthly_distance * fuel_consumption / 100 * fuel_price + monthly_insurance + monthly_maintenance) * months",format:"currency",currency:"EUR"},
   {label:"Estimated yearly recurring cost",expression:"(monthly_distance * fuel_consumption / 100 * fuel_price + monthly_insurance + monthly_maintenance) * 12",format:"currency",currency:"EUR"}
  ]
 },
 "travel-budget":{
  title:"Trip budget calculator",
  description:"Estimate a trip budget from travellers, trip days, daily spending per person, total accommodation and transport costs. Daily spending should exclude accommodation and transport entered separately. Assumes equal daily spending for every traveller.",
  category:"other",
  inputs:[
   {key:"travellers",label:"Number of travellers",min:1,max:50,default:2,step:1,unit:"people"},
   {key:"days",label:"Trip duration",min:1,max:365,default:5,step:1,unit:"days"},
   {key:"daily_spend_per_person",label:"Daily spending per person",min:0,max:1000000,default:50,step:0.01,unit:"EUR/person/day"},
   {key:"accommodation_total",label:"Total accommodation cost",min:0,max:100000000,default:300,step:0.01,unit:"EUR"},
   {key:"transport_total",label:"Total transport cost",min:0,max:100000000,default:120,step:0.01,unit:"EUR"}
  ],
  results:[
   {label:"Daily spending for all travellers",expression:"daily_spend_per_person * travellers",format:"unit",unit:"EUR/day"},
   {label:"Estimated total trip budget",expression:"daily_spend_per_person * travellers * days + accommodation_total + transport_total",format:"currency",currency:"EUR"},
   {label:"Estimated cost per traveller",expression:"(daily_spend_per_person * travellers * days + accommodation_total + transport_total) / travellers",format:"unit",unit:"EUR/person"}
  ]
 },
 "hourly-pay":{
  title:"Hourly pay to yearly income",
  description:"Convert an hourly rate into estimated weekly, monthly and yearly gross income using working hours per week and working weeks per year. This is before tax, social contributions, unpaid leave, overtime, bonuses and other deductions.",
  category:"money",
  inputs:[
   {key:"hourly_rate",label:"Hourly pay",min:0,max:1000000,default:15,step:0.01,unit:"EUR/hour"},
   {key:"hours_per_week",label:"Working hours per week",min:0,max:168,default:40,step:0.5,unit:"hours"},
   {key:"weeks_per_year",label:"Working weeks per year",min:0,max:52,default:48,step:0.5,unit:"periods"}
  ],
  results:[
   {label:"Estimated weekly gross pay",expression:"hourly_rate * hours_per_week",format:"currency",currency:"EUR"},
   {label:"Estimated monthly gross pay",expression:"hourly_rate * hours_per_week * weeks_per_year / 12",format:"currency",currency:"EUR"},
   {label:"Estimated yearly gross pay",expression:"hourly_rate * hours_per_week * weeks_per_year",format:"currency",currency:"EUR"}
  ]
 },
 "simple-interest":{
  title:"Simple interest calculator",
  description:"Estimate simple interest on a principal amount using an annual interest rate and time in years. Interest is calculated on the original principal only; this is not compound interest and excludes taxes, fees and changing rates.",
  category:"money",
  inputs:[
   {key:"principal",label:"Principal amount",min:0,max:1000000000,default:1000,step:0.01,unit:"EUR"},
   {key:"annual_rate",label:"Annual interest rate",min:0,max:1000,default:5,step:0.01,unit:"%/year"},
   {key:"years",label:"Time",min:0,max:100,default:3,step:0.1,unit:"years"}
  ],
  results:[
   {label:"Interest earned",expression:"principal * annual_rate / 100 * years",format:"currency",currency:"EUR"},
   {label:"Principal plus simple interest",expression:"principal + principal * annual_rate / 100 * years",format:"currency",currency:"EUR"}
  ]
 },
 "profit-margin":{
  title:"Business profit and margin",
  description:"Estimate revenue, variable costs, fixed costs, net profit and profit margin for a period. Enter at least one unit sold and a positive selling price. This simplified model excludes tax, financing, depreciation and other costs not entered.",
  category:"money",
  inputs:[
   {key:"units_sold",label:"Units sold",min:1,max:100000000,default:100,step:1,unit:"units"},
   {key:"selling_price",label:"Selling price per unit",min:0.01,max:1000000,default:20,step:0.01,unit:"EUR/unit"},
   {key:"variable_cost",label:"Variable cost per unit",min:0,max:1000000,default:8,step:0.01,unit:"EUR/unit"},
   {key:"fixed_costs",label:"Fixed costs for this period",min:0,max:100000000,default:500,step:0.01,unit:"EUR"}
  ],
  results:[
   {label:"Revenue",expression:"units_sold * selling_price",format:"currency",currency:"EUR"},
   {label:"Total variable costs",expression:"units_sold * variable_cost",format:"currency",currency:"EUR"},
   {label:"Estimated net profit",expression:"units_sold * selling_price - units_sold * variable_cost - fixed_costs",format:"currency",currency:"EUR"},
   {label:"Profit margin",expression:"(units_sold * selling_price - units_sold * variable_cost - fixed_costs) / (units_sold * selling_price) * 100",format:"percent"}
  ]
 },
 "break-even":{
  title:"Break-even units calculator",
  description:"Estimate how many units are needed to cover fixed costs when each unit contributes a known amount toward those costs. Enter a positive contribution margin per unit (selling price minus variable cost). This model assumes constant costs and selling conditions.",
  category:"money",
  inputs:[
   {key:"fixed_costs",label:"Fixed costs",min:0,max:100000000,default:1000,step:0.01,unit:"EUR"},
   {key:"contribution_per_unit",label:"Contribution margin per unit",min:0.01,max:1000000,default:10,step:0.01,unit:"EUR/unit"}
  ],
  results:[
   {label:"Break-even units required",expression:"ceil(fixed_costs / contribution_per_unit)",format:"unit",unit:"units"},
   {label:"Contribution at break-even",expression:"ceil(fixed_costs / contribution_per_unit) * contribution_per_unit",format:"currency",currency:"EUR"}
  ]
 },
 "advanced":{
  title:"Custom formula calculator",
  description:"Build a custom calculator by defining numeric inputs and restricted arithmetic formulas. Explain the assumptions and units so other members can understand the result.",
  category:"other",
  inputs:[{key:"value",label:"Value",min:0,max:1000000,default:1,step:1,unit:""}],
  results:[{label:"Custom result",expression:"value",format:"number"}]
 }
};
function createManualDraft(templateKey){
 const template=MANUAL_TEMPLATES[templateKey]||MANUAL_TEMPLATES["simple-cost"];
 return {title:template.title,description:template.description,category:template.category,
  spec:{subcategories:[],inputs:JSON.parse(JSON.stringify(template.inputs)),results:JSON.parse(JSON.stringify(template.results)).map((result,index)=>({...result,key:result.key||"result_"+(index+1)})),groups:[]}};
}
function setMakerModeUI(){
 const manual=state.creationSource==="manual";
 const manualControls=$("ugcManualControls"),aiWrap=$("ugcMakerAiPromptWrap"),aiButton=$("ugcMakerGenerate");
 if(manualControls)manualControls.hidden=!manual;
 if(aiWrap)aiWrap.hidden=manual;
 if(aiButton)aiButton.textContent=state.editingId?"✦ Improve with AI":"✦ Generate calculator";
 const kicker=$("ugcMakerKicker"),heading=$("ugcMakerTitleHeading"),intro=$("ugcMakerIntro");
 if(kicker)kicker.textContent=manual?"WORTH IT MANUAL BUILDER":"WORTH IT AI";
 if(heading)heading.textContent=state.editingId?(manual?"Edit calculator manually":"Improve your calculator with AI"):(manual?"Create a calculator manually":"Create a calculator with AI");
 if(intro)intro.textContent=manual
  ?"Build a safe calculator with formulas, inputs and currencies. No AI request or CALC charge is used."
  :"Describe the decision or calculation. AI creates a safe, editable calculator draft.";
 const modeHelp=$("ugcManualModeHelp");
 if(modeHelp){
  modeHelp.hidden=!manual;
  modeHelp.querySelectorAll("[data-manual-mode-info]").forEach(card=>{
   const active=card.dataset.manualModeInfo===(state.manualMode||"quick");
   card.classList.toggle("is-active",active);
   card.setAttribute("aria-current",active?"true":"false");
  });
 }
 const costNote=$("ugcMakerBillingNotice");
 if(costNote)costNote.textContent="AI generation or improvement costs 2 CALC for Free, 4 CALC for Premium Lite and 6 CALC for Premium per successful operation. Failed operations are refunded.";
 const manualAiImprove=$("ugcManualAiImproveButton");
 if(manualAiImprove)manualAiImprove.hidden=!(manual&&Boolean(state.editingId));
 const blueprintImportPanel=$("ugcBlueprintImportPanel");
 if(blueprintImportPanel)blueprintImportPanel.hidden=!manual||Boolean(state.editingId);
}
function loadManualTemplate(templateKey){
 state.blueprintImportActive=false;
 state.creationSource="manual";state.aiOperationId="";state.aiDraft=createManualDraft(templateKey);
 state.manualMode=$("ugcManualMode")?.value||"quick";
 const templateSelect=$("ugcManualTemplate");if(templateSelect&&templateSelect.value!==templateKey)templateSelect.value=templateKey;
 const templateWrap=$("ugcManualTemplateWrap");if(templateWrap)templateWrap.hidden=state.manualMode!=="template";
 setMakerModeUI();renderMakerPreview(state.aiDraft);
 makerStatus("Manual calculator draft ready. Edit the inputs, formulas, units and currency, then test it locally before saving.");
}
function changeManualMode(mode){
 state.manualMode=["quick","template","advanced"].includes(mode)?mode:"quick";
 const modeSelect=$("ugcManualMode");if(modeSelect)modeSelect.value=state.manualMode;
 const templateKey=state.manualMode==="quick"?"simple-cost":state.manualMode==="advanced"?"advanced":String($("ugcManualTemplate")?.value||"simple-cost");
 loadManualTemplate(templateKey);
}
async function copyBlueprintPrompt(){
 const statusNode=$("ugcBlueprintImportStatus");
 const prompt=window.WorthItBlueprintImport?.buildPrompt?.();
 if(!prompt){if(statusNode)statusNode.textContent="Blueprint instructions are unavailable. Reload Manual Builder.";return;}
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(prompt);
  else{
   const temporary=document.createElement("textarea");temporary.value=prompt;temporary.setAttribute("readonly","");
   temporary.style.position="fixed";temporary.style.opacity="0";document.body.appendChild(temporary);
   temporary.select();const copied=document.execCommand("copy");temporary.remove();
   if(!copied)throw new Error("Clipboard access is unavailable in this browser.");
  }
  if(statusNode)statusNode.textContent="Instructions copied. Paste them into an external AI assistant; Worth It will not contact an AI service.";
 }catch(error){
  if(statusNode)statusNode.textContent=error?.message||"Could not copy the instructions. You can select and copy them manually.";
 }
}
async function importManualBlueprint(){
 const statusNode=$("ugcBlueprintImportStatus");
 const textarea=$("ugcBlueprintImportJson");
 const importButton=$("ugcBlueprintImportButton");
 const raw=String(textarea?.value||"");
 if(state.editingId){makerStatus("Open a new Manual Builder draft to import a blueprint. Existing saved calculators are not replaced by import.","error");return;}
 const originalButtonText=importButton?.textContent||"Import into Manual Builder";
 if(importButton){importButton.disabled=true;importButton.textContent="Working on a quick fix…";}
 if(statusNode)statusNode.textContent="Working on a quick fix…";
 makerStatus("Working on a quick fix…","generating");
 await new Promise(resolve=>setTimeout(resolve,40));
 try{
  const importer=window.WorthItBlueprintImport;
  if(!importer?.parseBlueprint)throw new Error("Blueprint import is unavailable. Reload Manual Builder.");
  const originalRequest=String($("ugcBlueprintOriginalRequest")?.value||"").trim();
  const definition=importer.parseBlueprint(raw,validateMakerSpec,originalRequest);
  const importNotes=Array.isArray(definition.importNotes)?definition.importNotes.slice(0,6):[];
  const validationIssueCount=Number(definition.importValidationIssueCount)||0;
  delete definition.importNotes;
  delete definition.importValidationIssues;
  delete definition.importValidationIssueCount;
  if(state.aiDraft&&!window.confirm("Import this blueprint and replace the current unsaved calculator draft? The current local draft will be replaced, but nothing will be saved or published.")){
   if(statusNode)statusNode.textContent="Import cancelled. Your current draft was left unchanged.";
   makerStatus("Blueprint import cancelled. Your current draft was left unchanged.");
   return;
  }
  state.creationSource="manual";
  state.aiOperationId="";
  state.manualMode="advanced";
  state.regionalDefaults=null;
  state.makerLocale="auto";
  state.blueprintImportActive=true;
  state.aiDraft=definition;
  const mode=$("ugcManualMode");if(mode)mode.value="advanced";
  const templateWrap=$("ugcManualTemplateWrap");if(templateWrap)templateWrap.hidden=true;
  setMakerModeUI();
  renderMakerPreview(state.aiDraft);
  const adjustmentText=importNotes.length?" Quick Fix notes: "+importNotes.join(" "):"";
  if(validationIssueCount){
   makerStatus("Quick Fix prepared an editable draft. "+validationIssueCount+" item(s) still need your review; edit the formulas, units or input ranges below. Save and Publish remain blocked until the shared checks pass."+adjustmentText);
   if(statusNode)statusNode.textContent="Draft ready for editing. "+validationIssueCount+" validation item(s) need review before saving or publishing."+adjustmentText;
  }else{
   makerStatus("Quick Fix complete. The blueprint passed the formula, unit and boundary checks. Review and test it locally; nothing was saved, published, sent to an AI service or charged."+adjustmentText);
   if(statusNode)statusNode.textContent="Quick Fix complete. Your editable calculator draft is ready; nothing was saved or published."+adjustmentText;
  }
  $("ugcMakerPreview")?.scrollIntoView?.({behavior:"smooth",block:"start"});
 }catch(error){
  const detail=error?.message||"The blueprint could not be imported.";
  if(statusNode)statusNode.textContent=detail;
  makerStatus("Import could not be prepared: "+String(detail)+" Your current draft was left unchanged.","error");
 }finally{
  if(importButton){importButton.disabled=false;importButton.textContent=originalButtonText;}
 }
}
function renderManualGroupEditor(host,definition){
 const groups=definition.spec.groups||(definition.spec.groups=[]);
 const section=document.createElement("section");section.className="ugc-maker-dynamic-groups";
 section.appendChild(text("h3","ugc-maker-schema-heading","Dynamic input groups"));
 section.appendChild(text("p","ugc-maker-schema-summary","Let calculator users add or remove repeated rows, such as household expenses, materials, products or employees. Use sum(group_key.field_key), avg(group_key.field_key), min(group_key.field_key), max(group_key.field_key) or count(group_key) in formulas. Up to 4 groups, 20 rows per group and 6 fields per row."));
 groups.forEach((group,index)=>{
  if(!Array.isArray(group.fields))group.fields=[];
  const card=document.createElement("fieldset");card.className="ugc-maker-schema-group ugc-maker-dynamic-group-editor";
  card.appendChild(text("legend","","Group "+(index+1)));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addText=(labelText,value,onChange,maxLength)=>{
   const label=document.createElement("label");label.textContent=labelText;
   const input=document.createElement("input");input.type="text";input.maxLength=maxLength||60;input.value=String(value??"");
   input.addEventListener("input",()=>{onChange(input.value);refreshMakerValidationNote();refreshMakerTestIfOpen();});
   label.appendChild(input);grid.appendChild(label);return input;
  };
  const addNumber=(labelText,value,onChange)=>{
   const label=document.createElement("label");label.textContent=labelText;
   const input=document.createElement("input");input.type="number";input.step="1";input.min="1";input.max="20";input.value=String(value);
   input.addEventListener("input",()=>{if(input.value!==""&&Number.isInteger(Number(input.value)))onChange(Number(input.value));refreshMakerValidationNote();});
   label.appendChild(input);grid.appendChild(label);return input;
  };
  const oldGroupKey=String(group.key||"");
  const keyInput=addText("Group variable key",oldGroupKey,value=>{group.key=String(value).trim();},32);
  keyInput.pattern="[a-z][a-z0-9_]{0,31}";
  keyInput.addEventListener("change",()=>{
   const next=String(keyInput.value||"").trim();
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(next)||groups.some((other,i)=>i!==index&&other.key===next)||definition.spec.inputs.some(input=>input.key===next)){
    group.key=oldGroupKey;keyInput.value=oldGroupKey;makerStatus("Group keys must be unique lowercase names.","error");return;
   }
   if(next!==oldGroupKey){
    const pattern=new RegExp("\\b"+oldGroupKey+"\\.","g");
    definition.spec.results.forEach(result=>{result.expression=String(result.expression||"").replace(pattern,next+".");});
    group.key=next;renderMakerPreview(definition);
   }
  });
  addText("Group label",group.label,value=>{group.label=String(value).trim().slice(0,60);});
  addText("Row label (singular)",group.itemLabel||"Item",value=>{group.itemLabel=String(value).trim().slice(0,40);},40);
  addNumber("Minimum rows",group.minItems??1,value=>{group.minItems=value;});
  addNumber("Maximum rows",group.maxItems??10,value=>{group.maxItems=value;});
  card.appendChild(grid);
  card.appendChild(text("h4","ugc-maker-schema-heading","Fields in each row"));
  group.fields.forEach((field,fieldIndex)=>{
   const fieldCard=document.createElement("div");fieldCard.className="ugc-maker-dynamic-field-editor";
   const fieldGrid=document.createElement("div");fieldGrid.className="ugc-maker-input-grid";
   const oldFieldKey=String(field.key||"");
   const addFieldInput=(labelText,value,onChange,type="text")=>{
    const label=document.createElement("label");label.textContent=labelText;
    const input=document.createElement("input");input.type=type;input.value=String(value??"");if(type==="number")input.step="any";
    input.addEventListener("input",()=>{if(type!=="number"||input.value==="")return;const n=Number(input.value);if(Number.isFinite(n))onChange(n);refreshMakerValidationNote();refreshMakerTestIfOpen();});
    if(type==="text")input.addEventListener("input",()=>{onChange(String(input.value).trim().slice(0,60));refreshMakerValidationNote();refreshMakerTestIfOpen();});
    label.appendChild(input);fieldGrid.appendChild(label);return input;
   };
   const fieldKeyInput=addFieldInput("Field key",oldFieldKey,value=>{field.key=value;});
   fieldKeyInput.maxLength=32;fieldKeyInput.pattern="[a-z][a-z0-9_]{0,31}";
   fieldKeyInput.addEventListener("change",()=>{
    const next=String(fieldKeyInput.value||"").trim();
    if(!/^[a-z][a-z0-9_]{0,31}$/.test(next)||group.fields.some((other,i)=>i!==fieldIndex&&other.key===next)){
     field.key=oldFieldKey;fieldKeyInput.value=oldFieldKey;makerStatus("Field keys must be unique lowercase names inside their group.","error");return;
    }
    if(next!==oldFieldKey){
     const pattern=new RegExp("\\b"+group.key+"\\."+oldFieldKey+"\\b","g");
     definition.spec.results.forEach(result=>{result.expression=String(result.expression||"").replace(pattern,group.key+"."+next);});
     field.key=next;renderMakerPreview(definition);
    }
   });
   addFieldInput("Field label",field.label,value=>{field.label=value;});
   addFieldInput("Default",field.default,value=>{field.default=value;},"number");
   addFieldInput("Minimum",field.min,value=>{field.min=value;},"number");
   addFieldInput("Maximum",field.max,value=>{field.max=value;},"number");
   addFieldInput("Step",field.step,value=>{field.step=value;},"number");
   addFieldInput("Unit (optional)",field.unit||"",value=>{field.unit=value;},"text");
   fieldCard.appendChild(fieldGrid);
   const removeField=button("Remove field","ugc-manual-remove",()=>{group.fields.splice(fieldIndex,1);renderMakerPreview(definition);});
   removeField.disabled=group.fields.length<=1;fieldCard.appendChild(removeField);card.appendChild(fieldCard);
  });
  const addField=button("＋ Add field","ugc-action-secondary",()=>{
   if(group.fields.length>=6){makerStatus("A dynamic group can contain up to 6 fields per row.","error");return;}
   let n=1,key="";do{key="field_"+n++;}while(group.fields.some(field=>field.key===key));
   group.fields.push({key,label:"New field",min:0,max:1000000,default:0,step:1,unit:""});renderMakerPreview(definition);
  });
  addField.disabled=group.fields.length>=6;card.appendChild(addField);
  const removeGroup=button("Remove group","ugc-manual-remove",()=>{groups.splice(index,1);renderMakerPreview(definition);});
  card.appendChild(removeGroup);section.appendChild(card);
 });
 const addGroup=button("＋ Add dynamic group","ugc-action-secondary",()=>{
  if(groups.length>=4){makerStatus("A calculator can contain up to 4 dynamic input groups.","error");return;}
  let n=1,key="";do{key="items_"+n++;}while(groups.some(group=>group.key===key)||definition.spec.inputs.some(input=>input.key===key));
  groups.push({key,label:"Items",itemLabel:"Item",minItems:1,maxItems:10,fields:[{key:"amount",label:"Amount",min:0,max:1000000,default:0,step:1,unit:""}]});
  renderMakerPreview(definition);
 });
 addGroup.disabled=groups.length>=4;section.appendChild(addGroup);host.appendChild(section);
}
function renderManualScenarioEditor(host,definition){
 const spec=definition?.spec;if(!host||!spec)return;
 if(!Array.isArray(spec.scenarios))spec.scenarios=[];
 const section=document.createElement("section");section.className="ugc-maker-scenarios";
 section.appendChild(text("h3","ugc-maker-schema-heading","What-if scenarios"));
 section.appendChild(text("p","ugc-maker-schema-summary","Add up to 3 alternative scenarios. Each scenario stores its own input values; all formulas are recalculated so users can compare outcomes side by side."));
 spec.scenarios.forEach((scenario,index)=>{
  if(!scenario.values||typeof scenario.values!=="object")scenario.values={};
  const card=document.createElement("fieldset");card.className="ugc-maker-scenario-editor";
  card.appendChild(text("legend","","Scenario "+(index+1)));
  const nameLabel=document.createElement("label");nameLabel.appendChild(text("span","","Scenario name"));
  const name=document.createElement("input");name.type="text";name.maxLength=50;name.value=String(scenario.label||"Alternative "+(index+1));
  name.addEventListener("input",()=>{scenario.label=String(name.value).trim().slice(0,50);refreshMakerTestIfOpen();});
  nameLabel.appendChild(name);card.appendChild(nameLabel);
  const grid=document.createElement("div");grid.className="ugc-maker-scenario-grid";
  spec.inputs.forEach(input=>{
   if(!Object.prototype.hasOwnProperty.call(scenario.values,input.key))scenario.values[input.key]=Number(input.default);
   const label=document.createElement("label");label.appendChild(text("span","",input.label||input.key));
   const current=Number(scenario.values[input.key]);
   let control;
   if((input.control||"number")==="select"&&Array.isArray(input.choices)&&input.choices.length>=2){
    control=document.createElement("select");
    input.choices.forEach(choice=>{const option=document.createElement("option");option.value=String(choice.value);option.textContent=String(choice.label);control.appendChild(option);});
    control.value=String(input.choices.some(choice=>Number(choice.value)===current)?current:input.default);
   }else if(input.control==="toggle"){
    control=document.createElement("input");control.type="checkbox";control.checked=current>=0.5;
   }else{
    control=document.createElement("input");control.type="number";control.min=String(input.min);control.max=String(input.max);control.step=String(input.step||"any");control.value=String(Number.isFinite(current)?current:input.default);
   }
   control.addEventListener("change",()=>{
    const value=control.type==="checkbox"?(control.checked?1:0):Number(control.value);
    if(Number.isFinite(value))scenario.values[input.key]=value;
    refreshMakerTestIfOpen();refreshMakerValidationNote();
   });
   label.appendChild(control);
   if(input.unit)label.appendChild(text("small","",input.unit));
   grid.appendChild(label);
  });
  card.appendChild(grid);
  card.appendChild(button("Remove scenario","ugc-manual-remove",()=>{spec.scenarios.splice(index,1);renderMakerPreview(definition);}));
  section.appendChild(card);
 });
 const add=button("＋ Add scenario","ugc-action-secondary",()=>{
  if(spec.scenarios.length>=3){makerStatus("A calculator can contain up to 3 comparison scenarios.","error");return;}
  let n=1,key="";do{key="scenario_"+n++;}while(spec.scenarios.some(item=>item.key===key));
  spec.scenarios.push({key,label:"Alternative "+(spec.scenarios.length+1),values:Object.fromEntries(spec.inputs.map(input=>[input.key,Number(input.default)]))});
  renderMakerPreview(definition);
 });
 add.disabled=spec.scenarios.length>=3;section.appendChild(add);host.appendChild(section);
}
function renderMakerPreview(definition){
 const host=$("ugcMakerPreview");if(!host)return;
 host.replaceChildren();if(!definition){host.hidden=true;return;}host.hidden=false;
 const manual=state.creationSource==="manual";
 (definition.spec?.results||[]).forEach(item=>{
  if(item.format==="currency")ensureResultCurrency(item,state.regionalDefaults?.currency||"EUR");
 });
 if(state.regionalDefaults){
  const regionNote=text("p","ugc-maker-schema-summary","Regional suggestion: "+state.regionalDefaults.currency+" · number format "+state.regionalDefaults.locale+". This is only a starting point; you can change every input unit and result currency below. Currency selection never performs conversion.");
  regionNote.id="ugcMakerRegionalDefaults";host.appendChild(regionNote);
 }
 const fields=document.createElement("div");fields.className="ugc-maker-edit-grid";
 const existing=Boolean(state.editingId);
 const title=document.createElement("label");title.textContent="Calculator title";
 const titleInput=document.createElement("input");titleInput.id="ugcMakerTitle";titleInput.maxLength=70;titleInput.value=definition.title||"";titleInput.disabled=existing;title.appendChild(titleInput);
 const desc=document.createElement("label");desc.textContent="Description";
 const descInput=document.createElement("textarea");descInput.id="ugcMakerDescription";descInput.maxLength=500;descInput.rows=3;descInput.value=definition.description||"";descInput.disabled=existing;desc.appendChild(descInput);
 fields.append(title,desc);host.appendChild(fields);
 if(existing&&manual){
  host.appendChild(text("p","ugc-maker-schema-summary","A saved calculator's title and primary category stay fixed. To update its description, use the description editor on the calculator detail page; its 10-minute cooldown still applies."));
 }
 const descriptionHelp=text("p","ugc-maker-schema-summary",manual
  ?"Explain what the calculator measures, which assumptions it uses and what the results mean. 24–500 characters."
  :"Write a short explanation of what the calculator measures and its key assumptions. 24–500 characters. The AI follows the language of your prompt; you can edit this description before saving.");
 descriptionHelp.id="ugcMakerDescriptionHelp";host.appendChild(descriptionHelp);
 if(manual){
  const assumptionsLabel=document.createElement("label");assumptionsLabel.textContent="Assumptions (optional, up to 5,000 characters)";
  const assumptionsInput=document.createElement("textarea");assumptionsInput.id="ugcMakerAssumptions";assumptionsInput.maxLength=5000;assumptionsInput.rows=5;
  assumptionsInput.value=(Array.isArray(definition.spec?.assumptions)?definition.spec.assumptions:[]).join("\n");
  assumptionsInput.placeholder="Add one assumption per line. These remain separate from the short calculator description.";
  assumptionsInput.addEventListener("input",()=>{definition.spec.assumptions=assumptionsInput.value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);refreshMakerValidationNote();});
  assumptionsLabel.appendChild(assumptionsInput);host.appendChild(assumptionsLabel);
 }
 if(manual){
  const categoryLabel=document.createElement("label");categoryLabel.className="ugc-maker-category-field";categoryLabel.appendChild(text("span","","Primary category"));
  const categorySelect=document.createElement("select");categorySelect.id="ugcManualCategory";
  [["cars","Cars"],["money","Money"],["technology","Technology"],["home","Home"],["other","Other"]].forEach(([value,label])=>{
   const option=document.createElement("option");option.value=value;option.textContent=label;categorySelect.appendChild(option);
  });
  categorySelect.value=definition.category||"other";categorySelect.disabled=Boolean(state.editingId);
  categorySelect.addEventListener("change",()=>{definition.category=categorySelect.value;definition.spec.subcategories=[];});
  categoryLabel.appendChild(categorySelect);host.appendChild(categoryLabel);
  host.appendChild(text("p","ugc-maker-schema-summary","Manual Builder does not use AI, does not charge CALC and does not consume an AI daily allowance. Only a new saved manual calculator uses the separate 1/2/3 daily save allowance."));
 }else{
  const selected=document.createElement("div");selected.className="ugc-maker-ai-categories";
  selected.appendChild(text("strong","","AI-selected categories"));
  getCategoryLabels({category:definition.category,subcategories:definition.spec?.subcategories||definition.subcategories||[]}).forEach(label=>selected.appendChild(text("span","ugc-subcategory-chip",label)));
  host.appendChild(selected);
 }
 const summary=text("p","ugc-maker-schema-summary",manual
  ?(definition.spec?.inputs?.length||0)+" / 24 fixed inputs · "+(definition.spec?.groups?.length||0)+" / 4 dynamic groups · "+(definition.spec?.results?.length||0)+" / 20 results · dimensional unit checks and a restricted formula language"
  :(definition.spec?.inputs?.length||0)+" / 16 inputs · "+(definition.spec?.results?.length||0)+" / 10 results · restricted formula language");
 host.appendChild(summary);
 if(state.editingId&&!manual)host.appendChild(text("p","ugc-maker-schema-summary","This is an AI improvement of your existing calculator. Its title, category, purpose and description are locked."));
 host.appendChild(text("h3","ugc-maker-schema-heading","Calculator inputs"));
 (definition.spec?.inputs||[]).forEach((item,index)=>{
  const group=document.createElement("fieldset");group.className="ugc-maker-schema-group";
  group.appendChild(text("legend","","Input "+(index+1)+" · "+item.key));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addInput=(labelText,type,value,onChange)=>{
   const label=document.createElement("label");label.textContent=labelText;
   const input=document.createElement("input");input.type=type;input.value=String(value??"");if(type==="number")input.step="any";
   input.addEventListener("input",()=>{onChange(input.value);refreshMakerTestIfOpen();refreshMakerValidationNote();});
   label.appendChild(input);grid.appendChild(label);return input;
  };
  if(manual){
   const keyInput=addInput("Variable key","text",item.key,()=>{});keyInput.maxLength=32;keyInput.pattern="[a-z][a-z0-9_]{0,31}";
   keyInput.addEventListener("change",()=>{
    const oldKey=String(item.key||"");const nextKey=String(keyInput.value||"").trim();
    if(!/^[a-z][a-z0-9_]{0,31}$/.test(nextKey)||definition.spec.inputs.some((other,i)=>i!==index&&other.key===nextKey)){
     keyInput.value=oldKey;makerStatus("Variable keys must be unique and start with a lowercase letter. Use letters, numbers and underscores.","error");return;
    }
    if(oldKey!==nextKey){
     const pattern=new RegExp("\\b"+oldKey+"\\b","g");
     definition.spec.results.forEach(result=>{result.expression=String(result.expression||"").replace(pattern,nextKey);});
     (definition.spec.scenarios||[]).forEach(scenario=>{if(Object.prototype.hasOwnProperty.call(scenario.values||{},oldKey)){scenario.values[nextKey]=scenario.values[oldKey];delete scenario.values[oldKey];}});
     item.key=nextKey;renderMakerPreview(definition);
    }
   });
  }
  addInput("Label","text",item.label,value=>{item.label=String(value).trim().slice(0,60);});
  const controlTypeLabel=document.createElement("label");controlTypeLabel.className="ugc-maker-control-type";
  controlTypeLabel.appendChild(text("span","","Input control"));
  const controlType=document.createElement("select");
  [["number","Number field"],["slider","Slider"],["select","Dropdown choices"],["toggle","On / off toggle"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;controlType.appendChild(option);});
  controlType.value=["number","slider","select","toggle"].includes(item.control)?item.control:"number";
  controlType.addEventListener("change",()=>{
   item.control=controlType.value;
   if(item.control==="toggle"){item.min=0;item.max=1;item.step=1;item.default=Number(item.default)>=0.5?1:0;}
   if(item.control==="select"&&(!Array.isArray(item.choices)||item.choices.length<2)){
    const unique=[...new Set([Number(item.min),Number(item.default),Number(item.max)].filter(Number.isFinite))];
    if(unique.length<2){makerStatus("Set a different minimum and maximum before creating dropdown choices.","error");item.control="number";controlType.value="number";return;}
    item.choices=unique.map((value,index)=>({label:index===0?"Lower option":index===unique.length-1?"Higher option":"Default option",value}));
   }
   renderMakerPreview(definition);
  });
  controlTypeLabel.appendChild(controlType);grid.appendChild(controlTypeLabel);
  if((item.control||"number")==="select"){
   const choicesLabel=document.createElement("label");choicesLabel.className="ugc-maker-choice-editor";
   choicesLabel.appendChild(text("span","","Dropdown choices · one label = numeric value per line"));
   const choicesInput=document.createElement("textarea");choicesInput.rows=4;choicesInput.maxLength=1200;
   choicesInput.value=(item.choices||[]).map(choice=>String(choice.label)+" = "+String(choice.value)).join("\\n");
   choicesInput.placeholder="Basic = 0\\nStandard = 15\\nPremium = 30";
   choicesInput.addEventListener("change",()=>{
    const parsed=choicesInput.value.split(/\\r?\\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
     const at=line.lastIndexOf("=");if(at<1)return null;
     const label=line.slice(0,at).trim(),raw=line.slice(at+1).trim(),value=Number(raw);
     if(!label||label.length>50||!Number.isFinite(value)||Math.abs(value)>1000000000000||!/^[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?$/i.test(raw))return null;
     return{label,value};
    });
    if(parsed.length<2||parsed.length>12||parsed.some(choice=>!choice)||new Set(parsed.map(choice=>choice.value)).size!==parsed.length||new Set(parsed.map(choice=>choice.label.toLowerCase())).size!==parsed.length){
     makerStatus("Add 2–12 choices with unique labels and numeric values (label = value).","error");return;
    }
    const scaled=parsed.map(choice=>Math.round(choice.value*1000000)),differences=[];
    for(let i=1;i<scaled.length;i++)differences.push(Math.abs(scaled[i]-scaled[0]));
    const gcd=(a,b)=>b?gcd(b,a%b):a,stepScaled=differences.reduce((a,b)=>gcd(a,b),0)||1;
    item.choices=parsed;item.min=Math.min(...parsed.map(choice=>choice.value));item.max=Math.max(...parsed.map(choice=>choice.value));
    item.default=parsed.some(choice=>choice.value===Number(item.default))?Number(item.default):parsed[0].value;
    item.step=stepScaled/1000000;renderMakerPreview(definition);
   });
   choicesLabel.appendChild(choicesInput);grid.appendChild(choicesLabel);
  }
  if((item.control||"number")==="toggle"){item.min=0;item.max=1;item.step=1;item.default=Number(item.default)>=0.5?1:0;}
  addInput("Default value","number",item.default,value=>{if(value!==""&&Number.isFinite(Number(value)))item.default=Number(value);});
  addInput("Minimum","number",item.min,value=>{if(value!==""&&Number.isFinite(Number(value)))item.min=Number(value);});
  addInput("Maximum","number",item.max,value=>{if(value!==""&&Number.isFinite(Number(value)))item.max=Number(value);});
  addInput("Step","number",item.step||1,value=>{if(value!==""&&Number.isFinite(Number(value)))item.step=Number(value);});
  const unitLabel=document.createElement("label");unitLabel.className="ugc-maker-unit-field";unitLabel.appendChild(text("span","","Unit or currency"));
  const unitSelect=document.createElement("select");unitSelect.setAttribute("aria-label","Unit or currency for "+(item.label||item.key));
  UNIT_OPTIONS.forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;unitSelect.appendChild(option);});
  const customUnitOption=document.createElement("option");customUnitOption.value="__custom__";customUnitOption.textContent="Other custom unit…";unitSelect.appendChild(customUnitOption);
  const currentUnit=String(item.unit||"");const isKnownUnit=UNIT_OPTIONS.some(([value])=>value===currentUnit);
  unitSelect.value=isKnownUnit?currentUnit:"__custom__";
  const customUnit=document.createElement("input");customUnit.type="text";customUnit.maxLength=16;customUnit.placeholder="Custom unit (max 16 characters)";customUnit.value=isKnownUnit?"":currentUnit;customUnit.hidden=isKnownUnit;
  customUnit.addEventListener("input",()=>{item.unit=String(customUnit.value).trim().slice(0,16);refreshMakerTestIfOpen();refreshMakerValidationNote();});
  unitSelect.addEventListener("change",()=>{
   const custom=unitSelect.value==="__custom__";customUnit.hidden=!custom;
   if(custom){customUnit.focus();item.unit=String(customUnit.value).trim().slice(0,16);}else{item.unit=unitSelect.value;customUnit.value="";}
   refreshMakerTestIfOpen();refreshMakerValidationNote();
  });
  unitLabel.append(unitSelect,customUnit);grid.appendChild(unitLabel);
  if(manual){
   const remove=button("Remove input","ugc-manual-remove",()=>{if(definition.spec.inputs.length<=1)return;const removedKey=definition.spec.inputs[index]?.key;definition.spec.inputs.splice(index,1);(definition.spec.scenarios||[]).forEach(scenario=>{if(scenario.values)delete scenario.values[removedKey];});renderMakerPreview(definition);});
   remove.disabled=definition.spec.inputs.length<=1;grid.appendChild(remove);
  }
  group.appendChild(grid);host.appendChild(group);
 });
 if(manual){
  const addInputButton=button("＋ Add input","ugc-action-secondary",()=>{
   if(definition.spec.inputs.length>=24){makerStatus("A calculator can contain up to 24 fixed inputs.","error");return;}
   let index=1,key="";do{key="input_"+index++;}while(definition.spec.inputs.some(item=>item.key===key));
   const addedInput={key,label:"New input",min:0,max:1000000,default:0,step:1,unit:""};
   definition.spec.inputs.push(addedInput);
   (definition.spec.scenarios||[]).forEach(scenario=>{scenario.values= scenario.values||{};scenario.values[key]=addedInput.default;});
   renderMakerPreview(definition);
  });
  addInputButton.disabled=definition.spec.inputs.length>=24;host.appendChild(addInputButton);
 }
 if(manual){renderManualGroupEditor(host,definition);renderManualScenarioEditor(host,definition);}
 host.appendChild(text("h3","ugc-maker-schema-heading","Calculator results"));
 (definition.spec?.results||[]).forEach((item,index)=>{
  const group=document.createElement("fieldset");group.className="ugc-maker-schema-group";group.appendChild(text("legend","","Result "+(index+1)));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addInput=(labelText,type,value,onChange)=>{
   const label=document.createElement("label");label.textContent=labelText;
   const input=document.createElement(type==="textarea"?"textarea":"input");if(type!=="textarea")input.type=type;input.value=String(value??"");
   input.addEventListener("input",()=>{onChange(input.value);refreshMakerTestIfOpen();refreshMakerValidationNote();});
   label.appendChild(input);grid.appendChild(label);return input;
  };
  if(manual&&!item.key)item.key="result_"+(index+1);
  const originalResultKey=String(item.key||"");
  const resultKeyInput=addInput("Result variable key","text",originalResultKey,()=>{});
  resultKeyInput.maxLength=32;resultKeyInput.pattern="[a-z][a-z0-9_]{0,31}";resultKeyInput.required=true;resultKeyInput.hidden=!manual;
  resultKeyInput.addEventListener("change",()=>{
   const oldKey=String(item.key||""),nextKey=String(resultKeyInput.value||"").trim();
   const collision=definition.spec.inputs.some(input=>input.key===nextKey)
    ||definition.spec.results.some((other,otherIndex)=>otherIndex!==index&&other.key===nextKey)
    ||(definition.spec.groups||[]).some(group=>group.key===nextKey||(group.fields||[]).some(field=>field.key===nextKey));
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(nextKey)||collision){
    resultKeyInput.value=oldKey||originalResultKey;
    makerStatus("Result variable keys must be unique lowercase names and cannot reuse an input or dynamic group key.","error");return;
   }
   if(oldKey!==nextKey){
    const pattern=new RegExp("\\b"+oldKey+"\\b","g");
    definition.spec.results.forEach((later,laterIndex)=>{
     if(laterIndex>index)later.expression=String(later.expression||"").replace(pattern,nextKey);
    });
    item.key=nextKey;renderMakerPreview(definition);
   }
  });
  addInput("Result label","text",item.label,value=>{item.label=String(value).trim().slice(0,70);});
  const formulaInput=addInput("Formula","textarea",item.expression,value=>{item.expression=String(value).trim().slice(0,500);});
  formulaInput.placeholder="Use input keys and earlier result keys; e.g. subtotal * tax_rate / 100 or sum(expenses.amount).";
  const explanationLabel=document.createElement("label");explanationLabel.className="ugc-maker-result-explanation";
  explanationLabel.appendChild(text("span","","What does this result mean?"));
  const explanation=document.createElement("textarea");explanation.rows=2;explanation.maxLength=280;explanation.value=String(item.explanation||"");
  explanation.placeholder="Explain the formula in plain language, including what is included or excluded.";
  explanation.addEventListener("input",()=>{item.explanation=String(explanation.value).slice(0,280);refreshMakerTestIfOpen();});
  explanationLabel.appendChild(explanation);grid.appendChild(explanationLabel);
  const formatLabel=document.createElement("label");formatLabel.textContent="Display format";
  const formatSelect=document.createElement("select");
  [["number","Number"],["currency","Currency"],["percent","Percent"],["unit","Number with unit"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;formatSelect.appendChild(option);});
  formatSelect.value=item.format||"number";
  const currencyLabel=document.createElement("label");currencyLabel.className="ugc-maker-currency-field";currencyLabel.appendChild(text("span","",item.format==="unit"?"Result unit":"Result currency"));
  const currencySelect=document.createElement("select");currencySelect.setAttribute("aria-label","Currency for "+(item.label||"this result"));
  CURRENCIES.forEach(([code,name])=>{const option=document.createElement("option");option.value=code;option.textContent=code+" — "+name;currencySelect.appendChild(option);});
  const customCurrencyOption=document.createElement("option");customCurrencyOption.value="__custom__";customCurrencyOption.textContent="Other ISO 4217 currency…";currencySelect.appendChild(customCurrencyOption);
  const currentCurrency=String(item.currency||"EUR").toUpperCase();const isKnownCurrency=CURRENCIES.some(([code])=>code===currentCurrency);
  currencySelect.value=isKnownCurrency?currentCurrency:"__custom__";
  const customCurrency=document.createElement("input");customCurrency.type="text";customCurrency.maxLength=3;customCurrency.inputMode="text";customCurrency.autocomplete="off";customCurrency.spellcheck=false;customCurrency.placeholder="ISO code, e.g. RSD";customCurrency.value=isKnownCurrency?"":currentCurrency;customCurrency.hidden=isKnownCurrency;
  customCurrency.addEventListener("input",()=>{item.currency=String(customCurrency.value).toUpperCase().replace(/[^A-Z]/g,"").slice(0,3);refreshMakerTestIfOpen();refreshMakerValidationNote();});
  currencySelect.addEventListener("change",()=>{
   const custom=currencySelect.value==="__custom__";customCurrency.hidden=!custom;
   if(custom){customCurrency.focus();item.currency=String(customCurrency.value).toUpperCase().replace(/[^A-Z]/g,"").slice(0,3);}else{item.currency=currencySelect.value;customCurrency.value="";}
   refreshMakerTestIfOpen();refreshMakerValidationNote();
  });
  const syncCurrencyEnabled=()=>{
   const currencyEnabled=formatSelect.value==="currency",unitEnabled=formatSelect.value==="unit";
   currencySelect.hidden=!currencyEnabled;customCurrency.hidden=!currencyEnabled||currencySelect.value!=="__custom__";
   currencyLabel.querySelector("span").textContent=unitEnabled?"Result unit":"Result currency";
   currencySelect.disabled=!currencyEnabled;customCurrency.disabled=!currencyEnabled;
   unitResult.hidden=!unitEnabled;unitResult.disabled=!unitEnabled;
   currencyLabel.classList.toggle("is-disabled",!currencyEnabled&&!unitEnabled);
  };
  formatSelect.addEventListener("change",()=>{item.format=formatSelect.value;syncCurrencyEnabled();refreshMakerTestIfOpen();refreshMakerValidationNote();});
  formatLabel.appendChild(formatSelect);grid.appendChild(formatLabel);
  const unitResult=document.createElement("input");unitResult.type="text";unitResult.maxLength=20;unitResult.placeholder="e.g. kWh, kg, km/h";unitResult.value=String(item.unit||"");unitResult.setAttribute("aria-label","Unit for "+(item.label||"this result"));
  unitResult.addEventListener("input",()=>{item.unit=String(unitResult.value).trim().slice(0,20);refreshMakerTestIfOpen();refreshMakerValidationNote();});
  currencyLabel.append(currencySelect,customCurrency,unitResult);grid.appendChild(currencyLabel);syncCurrencyEnabled();
  if(manual){
   const moveUp=button("Move result up","ugc-manual-remove",()=>{if(index>0){[definition.spec.results[index-1],definition.spec.results[index]]=[definition.spec.results[index],definition.spec.results[index-1]];renderMakerPreview(definition);}});moveUp.disabled=index===0;grid.appendChild(moveUp);
   const moveDown=button("Move result down","ugc-manual-remove",()=>{if(index<definition.spec.results.length-1){[definition.spec.results[index+1],definition.spec.results[index]]=[definition.spec.results[index],definition.spec.results[index+1]];renderMakerPreview(definition);}});moveDown.disabled=index===definition.spec.results.length-1;grid.appendChild(moveDown);
   const remove=button("Remove result","ugc-manual-remove",()=>{if(definition.spec.results.length<=1)return;definition.spec.results.splice(index,1);renderMakerPreview(definition);});
   remove.disabled=definition.spec.results.length<=1;grid.appendChild(remove);
  }
  group.appendChild(grid);host.appendChild(group);
 });
 if(manual){
  const addResultButton=button("＋ Add result","ugc-action-secondary",()=>{
   if(definition.spec.results.length>=20){makerStatus("A calculator can contain up to 20 results.","error");return;}
   const firstInput=definition.spec.inputs[0];let n=definition.spec.results.length+1,key="result_"+n;while(definition.spec.results.some(item=>item.key===key))key="result_"+(++n);
   definition.spec.results.push({key,label:"New result",expression:String(firstInput?.key||"1"),format:"number"});renderMakerPreview(definition);
  });
  addResultButton.disabled=definition.spec.results.length>=20;host.appendChild(addResultButton);
 }
 host.appendChild(text("p","ugc-maker-schema-summary","Each result can use a different currency. Results are evaluated from top to bottom. Give a result a variable key to use it in later formulas; move results to change their order. Dynamic group formulas: sum(group.field), avg(group.field), min(group.field), max(group.field), and count(group). Currencies are never automatically converted."));
 const testPanel=document.createElement("section");testPanel.id="ugcMakerTestPanel";testPanel.className="ugc-maker-test-panel";testPanel.hidden=true;
 const testToggle=button("▶ Test calculator","ugc-maker-test-toggle",()=>{
  testPanel.hidden=!testPanel.hidden;testToggle.setAttribute("aria-expanded",String(!testPanel.hidden));testToggle.textContent=testPanel.hidden?"▶ Test calculator":"▾ Hide test";
  if(!testPanel.hidden)renderMakerTestPanel(false);
 });
 testToggle.setAttribute("aria-expanded","false");host.append(testToggle,testPanel);
 host.appendChild(text("p","ugc-maker-schema-summary","Allowed formulas: arithmetic, powers, parentheses, min, max, avg, abs, round, floor, ceil, trunc, sign, sqrt, pow, clamp, mod, hypot, log, ln, exp, sin, cos, tan, if, gt, gte, lt, lte, eq, neq, and, or and not. Conditional functions return safe numeric results; arbitrary JavaScript is never run."));
 refreshMakerValidationNote();
 const saveButton=$("ugcMakerSave"),publishButton=$("ugcMakerPublish");
 if(saveButton)saveButton.disabled=false;if(publishButton)publishButton.disabled=false;
}
async function generateWithAI(){
 if(!requireAccount()||!verifyConfirmed())return;
 state.blueprintImportActive=false;
 state.creationSource="ai";state.aiOperationId="";setMakerModeUI();
 const prompt=String($("ugcMakerPrompt")?.value||"").trim();
 if(prompt.length<10||prompt.length>1000){makerStatus("Describe the requested changes in 10 to 1000 characters.","error");return;}
 const button=$("ugcMakerGenerate");button.disabled=true;
 makerStatus(state.editingId?"Worth It AI is improving your existing calculator…":"Worth It AI is designing your calculator…","generating");
 $("ugcMakerPreview").hidden=true;
 try{
  const payload=state.editingId?{mode:"refine",calculator_id:state.editingId,prompt}:{mode:"create",prompt};
  const response=await fetch("/api/ugc-maker",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+state.session.access_token,"Accept":"application/json"},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.success)throw new Error(data?.error||"The AI calculator maker is unavailable.");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(data.operation_id||""))){
   throw new Error("The AI operation could not be verified. No calculator draft was accepted.");
  }
  state.aiOperationId=String(data.operation_id);
  state.aiDraft=data.calculator;
  state.regionalDefaults=data.regionalDefaults||null;
  state.makerLocale=state.regionalDefaults?.locale||"auto";
  renderMakerPreview(state.aiDraft);
  makerStatus(state.editingId?"AI improvement generated. Review the improved inputs and formulas, then save the update.":"Preview generated. Review the title, description and formulas before saving.");
 }catch(error){makerStatus(error?.message||"Could not generate a calculator.","error");}
 finally{
  button.disabled=false;
  if(!state.editingId){
   void refreshCreationQuota();
   void refreshMakerGenerationQuota();
  }
 }
}
function describeResultFormula(item,inputs){
 const expression=String(item?.expression||"").trim();
 const used=(Array.isArray(inputs)?inputs:[]).filter(input=>new RegExp("(^|[^A-Za-z0-9_])"+String(input.key||"")+"($|[^A-Za-z0-9_])").test(expression));
 const names=used.map(input=>String(input.label||input.key)).filter(Boolean);
 const source=names.length?"Uses "+names.join(", ")+". ":"";
 return (source+"Formula: "+expression+".").slice(0,280);
}
async function saveMakerDraft(publish){
 if(!state.aiDraft||!requireAccount()||!verifyConfirmed())return;
 const title=String($("ugcMakerTitle")?.value||"").trim();
 const description=state.editingId&&state.creationSource!=="manual"?String(state.aiDraft.description||""):String($("ugcMakerDescription")?.value||"").trim();
 const category=String(state.aiDraft.category||"other");
 const visibility=state.editingId?(state.editingVisibility||"private"):(String($("ugcMakerVisibility")?.value||"private")==="public"?"public":"private");
 const previousStatus=state.editingStatus||"draft";
 if(title.length<3){makerStatus("Enter a title with at least 3 characters.","error");return;}
 if(!state.editingId&&(description.length<24||description.length>500)){
  makerStatus("The description must contain 24 to 500 characters and explain what the calculator measures and its main assumptions.","error");return;
 }
 const specToSave={...state.aiDraft.spec};
 if(state.creationSource==="manual"){
  const assumptionsText=String($("ugcMakerAssumptions")?.value||"");
  if(assumptionsText.length>5000){makerStatus("Assumptions can contain up to 5,000 characters.","error");return;}
  specToSave.assumptions=assumptionsText.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);
 }
 specToSave.results=(Array.isArray(specToSave.results)?specToSave.results:[]).map(item=>{
  const normalized={
   ...item,
   explanation:String(item.explanation||"").trim()||describeResultFormula(item,specToSave.inputs)
  };
  if(normalized.format==="currency")ensureResultCurrency(normalized,state.regionalDefaults?.currency||"EUR");
  return normalized;
 });
 const validation=validateMakerSpec(specToSave);
 if(validation.errors.length){makerStatus("Please fix the calculator validation issues before saving: "+validation.errors.slice(0,3).join(" "),"error");return;}
 if(!Array.isArray(specToSave.subcategories)&&Array.isArray(state.aiDraft.subcategories)){
  specToSave.subcategories=[...state.aiDraft.subcategories];
 }
 const invalidCurrency=(specToSave.results||[]).find(item=>item.format==="currency"&&!/^[A-Z]{3}$/.test(String(item.currency||"").trim().toUpperCase()));
 if(invalidCurrency){makerStatus("Enter a valid three-letter ISO 4217 currency code for every currency-formatted result.","error");return;}
 const save=$("ugcMakerSave");if(save)save.disabled=true;
 const publishButton=$("ugcMakerPublish");if(publishButton)publishButton.disabled=true;
 let savedIdAfterWrite="";
 try{
  if(state.creationSource==="ai"&&!state.aiOperationId)throw new Error("Run a successful AI generation or improvement before saving this AI draft.");
  const saved=await sb().rpc("save_worth_it_ugc_calculator",{
   p_id:state.editingId||null,p_title:title,p_description:description,p_category:category,p_spec:specToSave,
   p_source:state.creationSource==="manual"?"manual":"ai",
   p_ai_request_id:state.creationSource==="manual"?null:state.aiOperationId
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
   const createQuota=$("ugcMakerQuotaStatus"),editQuota=$("ugcMakerEditQuotaStatus"),generationQuota=$("ugcMakerGenerationQuotaStatus");
   if(createQuota)createQuota.hidden=true;
   if(generationQuota)generationQuota.hidden=true;
   if(editQuota)editQuota.hidden=true;
   // Once the AI draft is first saved, future changes are ordinary manual
   // edits. The generation has already consumed its AI slot and CALC charge.
   if(state.creationSource==="ai"){
    state.creationSource="manual";state.aiOperationId="";state.manualMode="advanced";
    const mode=$("ugcManualMode");if(mode)mode.value="advanced";
    const templateWrap=$("ugcManualTemplateWrap");if(templateWrap)templateWrap.hidden=true;
    renderMakerPreview(state.aiDraft);
   }
   setMakerModeUI();
   void refreshCreationQuota();
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
  makerStatus(savedIdAfterWrite
   ?"Your draft is saved. Publishing could not be completed: "+detail+" You can retry without creating another calculator."
   :detail,"error");
 }
 finally{if(save)save.disabled=false;if(publishButton)publishButton.disabled=false;}
}
const EXPLORE_VIEWS=["basic","community","discovery"];
function explorePanel(view){
 return $(view==="basic"?"calculators":view==="community"?"ugcCommunitySection":"ugcCommunityDiscoverySection");
}
function exploreScrollKey(view){
 return view==="basic"?"basicScrollTop":view==="community"?"communityScrollTop":"discoveryScrollTop";
}
function setExploreInitialView(view){
 const stage=$("calculatorExploreStage");
 if(!stage)return;
 if(pendingExploreTransitionFinish)pendingExploreTransitionFinish();
 const target=state.userId&&EXPLORE_VIEWS.includes(view)&&view!=="basic"?view:"basic";
 state.exploreView=target;state.exploreBusy=false;
 stage.dataset.activeView=target;stage.dataset.transitioning="false";
 EXPLORE_VIEWS.forEach(name=>{
  const panel=explorePanel(name);if(!panel)return;
  panel.hidden=name!==target;panel.inert=name!==target;
  panel.style.removeProperty("transform");
  panel.style.removeProperty("transition");
  panel.style.removeProperty("z-index");
 });
}
function reconcileExplorePanels(){
 const stage=$("calculatorExploreStage");
 if(!stage)return;
 if(state.exploreBusy&&pendingExploreTransitionFinish){
  pendingExploreTransitionFinish();
  return;
 }
 const active=state.userId&&EXPLORE_VIEWS.includes(state.exploreView)?state.exploreView:"basic";
 state.exploreView=active;state.exploreBusy=false;
 stage.dataset.activeView=active;stage.dataset.transitioning="false";
 EXPLORE_VIEWS.forEach(name=>{
  const panel=explorePanel(name);if(!panel)return;
  panel.hidden=name!==active;panel.inert=name!==active;
  panel.style.removeProperty("transform");
  panel.style.removeProperty("transition");
  panel.style.removeProperty("z-index");
 });
 stage.querySelectorAll("#ugcNavigationActions button,#ugcBackToBasicButton,#ugcOpenDiscoveryButton,#ugcBackToUgcButton").forEach(button=>{button.disabled=false;});
}
function switchCalculatorExploreView(target){
 const next=EXPLORE_VIEWS.includes(target)?target:"basic";
 const stage=$("calculatorExploreStage");
 if(!stage||EXPLORE_VIEWS.some(name=>!explorePanel(name)))return Promise.resolve(false);
 if(state.exploreBusy)return Promise.resolve(false);
 if(next===state.exploreView)return Promise.resolve(true);
 if(next!=="basic"&&!state.userId){
  toast("Sign in to browse and create community calculators.");
  if(typeof window.openAuthModal==="function")window.openAuthModal("signup");
  return Promise.resolve(false);
 }
 const fromView=state.exploreView;
 const from=explorePanel(fromView),to=explorePanel(next);
 if(!from||!to)return Promise.resolve(false);
 const direction=EXPLORE_VIEWS.indexOf(next)>EXPLORE_VIEWS.indexOf(fromView)?1:-1;
 state[exploreScrollKey(fromView)]=from.scrollTop;
 state.exploreBusy=true;stage.dataset.transitioning="true";
 stage.querySelectorAll("#ugcNavigationActions button,#ugcBackToBasicButton,#ugcOpenDiscoveryButton,#ugcBackToUgcButton").forEach(button=>{button.disabled=true;});
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
   to.scrollTop=state[exploreScrollKey(next)]||0;
   state.exploreView=next;state.exploreBusy=false;stage.dataset.activeView=next;stage.dataset.transitioning="false";
   stage.querySelectorAll("#ugcNavigationActions button,#ugcBackToBasicButton,#ugcOpenDiscoveryButton,#ugcBackToUgcButton").forEach(button=>{button.disabled=false;});
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
 refreshCreatorDiscoveryWhenVisible();
});
window.addEventListener("pageshow",reconcileExplorePanels);
function creatorDiscoveryIsVisible(){
 const panel=$("ugcCommunityDiscoverySection");
 return Boolean(state.userId&&state.exploreView==="discovery"&&panel&&!panel.hidden&&document.visibilityState==="visible"&&panel.getClientRects().length);
}
function refreshCreatorDiscoveryWhenVisible(){
 if(creatorDiscoveryIsVisible())void loadCreatorLeaderboards();
}
window.addEventListener("focus",()=>{reconcileExplorePanels();refreshCreatorDiscoveryWhenVisible();});
window.addEventListener("popstate",()=>window.setTimeout(refreshCreatorDiscoveryWhenVisible,0));
window.setInterval(refreshCreatorDiscoveryWhenVisible,60000);
function openNewCalculatorMaker(){
 state.creationSource="ai";state.aiOperationId="";state.manualMode="quick";
 state.editingId=null;state.editingVisibility="";state.editingStatus="draft";state.aiDraft=null;state.regionalDefaults=null;state.makerLocale="auto";openMaker();
 $("ugcMakerVisibility").value="private";
 $("ugcMakerPrompt").placeholder="Example: Create a calculator that compares the total cost of owning two cars over five years, including purchase price, fuel, insurance and maintenance.";
 $("ugcMakerPrompt").value="";$("ugcMakerPreview").hidden=true;$("ugcMakerVisibility").value="private";
 $("ugcMakerGenerate").textContent="✦ Generate calculator";
 $("ugcMakerTitleHeading").textContent="Create a calculator with AI";
 makerStatus("Describe what you want to calculate.");
}
function openManualCalculatorMaker(){
 state.creationSource="manual";state.aiOperationId="";state.manualMode="quick";
 state.editingId=null;state.editingVisibility="";state.editingStatus="draft";
 state.aiDraft=null;state.regionalDefaults=null;state.makerLocale="auto";
 const mode=$("ugcManualMode");if(mode)mode.value="quick";
 const template=$("ugcManualTemplate");if(template)template.value="simple-cost";
 $("ugcMakerVisibility").value="private";
 openMaker();
 $("ugcMakerPrompt").value="";
 $("ugcMakerPreview").hidden=false;
 loadManualTemplate("simple-cost");
}
function switchManualDraftToAI(){
 if(!state.editingId||!state.aiDraft||!requireAccount()||!verifyConfirmed())return;
 state.creationSource="ai";state.aiOperationId="";setMakerModeUI();
 void refreshAiEditQuota();
 const editQuota=$("ugcMakerEditQuotaStatus");if(editQuota)editQuota.hidden=false;
 $("ugcMakerPrompt").value="";
 $("ugcMakerPrompt").placeholder="Describe how Worth It AI should improve this existing calculator. Its subject and purpose cannot be changed.";
 makerStatus("Ask AI to improve the formulas or calculation detail. This uses your AI improvement allowance and costs 2/4/6 CALC for your active membership.");
 $("ugcMakerPrompt")?.focus();
}
async function init(){
 try{await getSession();}catch(_){state.session=null;state.userId="";}
 setExploreInitialView(window.location.pathname.startsWith("/calculator/ugc/")?"community":"basic");
 const navActions=$("ugcNavigationActions");if(navActions)navActions.hidden=!state.userId;
 $("ugcCatalogJumpButton")?.addEventListener("click",()=>{void switchCalculatorExploreView("community");});
 $("ugcBackToBasicButton")?.addEventListener("click",()=>{void switchCalculatorExploreView("basic");});
 $("ugcOpenDiscoveryButton")?.addEventListener("click",()=>{void switchCalculatorExploreView("discovery");});
 $("ugcBackToUgcButton")?.addEventListener("click",()=>{void switchCalculatorExploreView("community");});
 document.querySelectorAll("[data-ugc-sort]").forEach(node=>node.addEventListener("click",()=>{setActiveSort(node.dataset.ugcSort);void loadCatalog();}));
 $("ugcPeriodFilter")?.addEventListener("change",event=>{state.period=event.target.value;void loadCatalog();});
 $("ugcCreatorPeriodFilter")?.addEventListener("change",event=>{const value=String(event.target.value||"7d");state.creatorPeriod=CREATOR_PERIODS.includes(value)?value:"7d";void loadCreatorLeaderboards();});
 $("ugcTopCreatorSort")?.addEventListener("change",event=>{const value=String(event.target.value||"overall");state.topCreatorSort=TOP_CREATOR_SORTS.includes(value)?value:"overall";void loadCreatorLeaderboards();});
 $("ugcRisingCreatorSort")?.addEventListener("change",event=>{const value=String(event.target.value||"growth");state.risingCreatorSort=RISING_CREATOR_SORTS.includes(value)?value:"growth";void loadCreatorLeaderboards();});
 $("ugcCommunityMemberSort")?.addEventListener("change",event=>{const value=String(event.target.value||"followers");state.communityMemberSort=COMMUNITY_MEMBER_SORTS.includes(value)?value:"followers";void loadCreatorLeaderboards();});
 $("ugcDiscoverySearch")?.addEventListener("input",event=>{state.discoverySearch=String(event.target.value||"").trim();if(state.creatorData)renderCreatorLeaderboards(state.creatorData);});
 $("ugcCategoryFilter")?.addEventListener("change",event=>{state.category=String(event.target.value||"all");void loadCatalog();});
 $("ugcPagePrevious")?.addEventListener("click",()=>goToCatalogPage(currentCatalogPage()-1));
 $("ugcPageNext")?.addEventListener("click",()=>goToCatalogPage(currentCatalogPage()+1));
 $("ugcPageInput")?.addEventListener("change",event=>goToCatalogPage(event.target.value));
 $("ugcPageInput")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();goToCatalogPage(event.target.value);}});
 $("ugcSearch")?.addEventListener("input",event=>{state.search=String(event.target.value||"").trim();clearTimeout(init.searchTimer);init.searchTimer=setTimeout(()=>void loadCatalog(),220);});
 $("ugcCreateButton")?.addEventListener("click",openNewCalculatorMaker);
 $("ugcCreateManualButton")?.addEventListener("click",openManualCalculatorMaker);
 $("ugcManualMode")?.addEventListener("change",event=>changeManualMode(event.target.value));
 $("ugcManualTemplate")?.addEventListener("change",event=>loadManualTemplate(event.target.value));
 $("ugcManualAiImproveButton")?.addEventListener("click",switchManualDraftToAI);
 $("ugcBlueprintCopyPrompt")?.addEventListener("click",()=>void copyBlueprintPrompt());
 $("ugcBlueprintImportButton")?.addEventListener("click",importManualBlueprint);
 $("ugcMakerClose")?.addEventListener("click",closeMaker);
 $("ugcMakerGenerate")?.addEventListener("click",generateWithAI);
 $("ugcMakerSave")?.addEventListener("click",()=>saveMakerDraft(false));
 $("ugcMakerPublish")?.addEventListener("click",()=>saveMakerDraft(true));
 $("ugcDetailBack")?.addEventListener("click",()=>window.closeWorthItUGCCalculator());
 $("ugcDetailSaveDescription")?.addEventListener("click",saveDescription);
 $("ugcDetailSaveUsagePrice")?.addEventListener("click",saveUsagePrice);
 $("ugcDetailLike")?.addEventListener("click",()=>state.activeId&&react(state.activeId,"like"));
 $("ugcDetailDislike")?.addEventListener("click",()=>state.activeId&&react(state.activeId,"dislike"));
 $("ugcDetailRequireTestBeforeReaction")?.addEventListener("change",()=>void saveReactionPolicy());
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
  reconcileExplorePanels();
  const navActions=$("ugcNavigationActions");
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