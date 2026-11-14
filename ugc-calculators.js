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
const currencyMetadata=globalThis.WorthItCalculatorCurrencyData;
if(!currencyMetadata?.currencies||!currencyMetadata?.historicalCurrencies){
 throw new Error("The shared Worth It currency metadata could not be loaded.");
}
const CURRENCIES=currencyMetadata.currencies;
const HISTORICAL_CURRENCIES=currencyMetadata.historicalCurrencies;
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
let state={userId:"",session:null,blueprintImportActive:false,creationSource:"ai",manualMode:"quick",aiOperationId:"",sort:"latest",period:"12y",category:"all",search:"",pages:{},lastPage:1,totalPages:1,totalCount:0,catalog:[],myCalculators:[],activeId:"",activeCalculator:null,detailRequest:0,catalogRequest:0,creatorRequest:0,creatorPeriod:"7d",topCreatorSort:"overall",risingCreatorSort:"growth",communityMemberSort:"followers",creatorData:null,discoverySearch:"",aiDraft:null,regionalDefaults:null,makerLocale:"",editingId:null,editingVisibility:"",editingStatus:"draft",exploreView:"basic",exploreBusy:false,basicScrollTop:0,communityScrollTop:0,discoveryScrollTop:0,descriptionStatusRequest:0,descriptionStatusTimer:null,v2PersistenceAvailable:false,v2CapabilitiesChecked:false,v2CapabilitiesRequest:0};
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
function updateV2PersistenceControls(){
 if(Number(state.aiDraft?.spec?.schemaVersion)!==2)return;
 const enabled=state.v2PersistenceAvailable===true;
 const save=$("ugcMakerSave"),publish=$("ugcMakerPublish");
 if(save)save.disabled=!enabled;
 if(publish)publish.disabled=!enabled;
 const note=$("ugcMakerV2PersistenceNote");
 if(note)note.textContent=enabled
  ?"V2 save and publish are enabled in this database. The PostgreSQL validator and server calculation runtime are both available."
  :"V2 remains local-only in this database. Save and Publish stay disabled until both the V2 persistence and server runtime migrations are installed.";
}
async function refreshUGCSchemaCapabilities(){
 const request=++state.v2CapabilitiesRequest;
 state.v2PersistenceAvailable=false;
 state.v2CapabilitiesChecked=false;
 if(!state.userId||!sb()){
  state.v2CapabilitiesChecked=true;
  updateV2PersistenceControls();
  return false;
 }
 try{
  const response=await sb().rpc("get_worth_it_ugc_schema_capabilities");
  if(response.error)throw response.error;
  if(request!==state.v2CapabilitiesRequest)return state.v2PersistenceAvailable;
  const payload=normalizeObject(response.data);
  const versions=Array.isArray(payload?.supported_schema_versions)?payload.supported_schema_versions:[];
  state.v2PersistenceAvailable=payload?.v2_persistence===true&&payload?.v2_server_runtime===true&&versions.includes(2);
 }catch(error){
  if(request===state.v2CapabilitiesRequest){
   state.v2PersistenceAvailable=false;
   console.info("Typed V2 persistence is not available in this database yet.",error?.message||error);
  }
 }finally{
  if(request===state.v2CapabilitiesRequest){
   state.v2CapabilitiesChecked=true;
   updateV2PersistenceControls();
  }
 }
 return state.v2PersistenceAvailable;
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
const calculatorEngine=window.WorthItCalculatorEngine?.create?.({
 currencies:CURRENCIES,
 historicalCurrencies:HISTORICAL_CURRENCIES
});
if(!calculatorEngine)throw new Error("The shared Worth It calculator engine could not be loaded.");
const {
 compileExpression,formulaGroupFieldReferences,evaluate,groupMapForSpec,defaultGroupValues,
 unitDescriptor,constantFormulaValue,analyseFormulaUnit,unitVectorKey,ensureResultCurrency,
 validateFormulaResultUnit,evaluateFormulaResults,validateMakerSpec,sameUnitDescriptor,combineUnitDescriptors,
 resolveCalculatorVersions,validateVersionedSpec,normalizeTypedValue,createDefaultTypedValues,
 createDefaultTypedGroupValues,normalizeTypedGroupValues,evaluateV2TypedResults
}=calculatorEngine;

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
function appendV2RuntimeGroupControls(host,group){
 const section=document.createElement("fieldset");section.className="ugc-dynamic-group";section.dataset.ugcGroupKey=group.key;
 section.appendChild(text("legend","",group.label||group.key));
 section.appendChild(text("p","ugc-dynamic-group-note","Add or remove "+String(group.itemLabel||"item").toLowerCase()+" rows. Each row is included in the group formulas."));
 const rowsHost=document.createElement("div");rowsHost.className="ugc-dynamic-group-rows";
 const min=Math.max(1,Number(group.minItems)||1),max=Math.max(min,Math.min(20,Number(group.maxItems)||20));
 const notify=()=>rowsHost.dispatchEvent(new Event("input",{bubbles:true}));
 let add=null;
 const refresh=()=>{
  Array.from(rowsHost.children).forEach(row=>{
   const remove=row.querySelector("button");if(remove)remove.disabled=rowsHost.children.length<=min;
  });
  if(add)add.disabled=rowsHost.children.length>=max;
 };
 const addRow=(values={})=>{
  if(rowsHost.children.length>=max)return;
  const row=document.createElement("div");row.className="ugc-dynamic-group-row";row.dataset.ugcGroupRow="";
  const fields=document.createElement("div");fields.className="ugc-dynamic-group-fields";
  (group.fields||[]).forEach(field=>{
   const label=document.createElement("label");label.textContent=field.label||field.key;
   const value=Object.prototype.hasOwnProperty.call(values,field.key)?values[field.key]:typedDefaultForField(field);
   const control=createTypedEditorControl(field,value);control.name=field.key;control.required=true;control.dataset.ugcGroupField=field.key;
   control.addEventListener("input",notify);control.addEventListener("change",notify);
   label.appendChild(control);if(field.unit)label.appendChild(text("small","",field.unit));
   fields.appendChild(label);
  });
  const remove=button("Remove "+String(group.itemLabel||"item").toLowerCase(),"ugc-manual-remove",()=>{
   if(rowsHost.children.length<=min)return;
   row.remove();refresh();notify();
  });
  row.append(fields,remove);rowsHost.appendChild(row);refresh();
 };
 for(let i=0;i<min;i++)addRow({});
 add=button("＋ Add "+String(group.itemLabel||"item").toLowerCase(),"ugc-action-secondary",()=>addRow({}));
 section.append(rowsHost,add);refresh();host.appendChild(section);return section;
}
function collectV2RuntimeValues(root,spec){
 const values={},rawGroups={};
 (spec.inputs||[]).forEach(field=>{
  const control=root?.querySelector?.('[name="'+CSS.escape(field.key)+'"]');
  if(!control)throw new Error("The "+String(field.label||field.key)+" input is unavailable.");
  const normalized=normalizeTypedValue(field,typedEditorValue(field,control));
  control.setAttribute("aria-invalid",String(normalized.valid!==true));
  if(!normalized.valid)throw new Error(String(field.label||field.key)+": "+normalized.error);
  values[field.key]=normalized.value;
 });
 (spec.groups||[]).forEach(group=>{
  const section=root?.querySelector?.('[data-ugc-group-key="'+CSS.escape(group.key)+'"]');
  rawGroups[group.key]=Array.from(section?.querySelectorAll("[data-ugc-group-row]")||[]).map(row=>{
   const raw={};
   (group.fields||[]).forEach(field=>{
    const control=row.querySelector('[data-ugc-group-field="'+CSS.escape(field.key)+'"]');
    if(!control)throw new Error("The "+String(field.label||field.key)+" field is unavailable.");
    raw[field.key]=typedEditorValue(field,control);
   });
   return raw;
  });
 });
 const normalizedGroups=normalizeTypedGroupValues(spec,rawGroups);
 if(normalizedGroups.valid!==true)throw new Error((normalizedGroups.errors||[]).slice(0,3).join(" "));
 return {values,groups:normalizedGroups.groups};
}
function executableV2Spec(spec){
 const executable={...spec};
 delete executable.assumptions;delete executable.subcategories;
 return executable;
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
function simplifyFormulaConstants(ast){
 if(!ast||typeof ast!=="object")return ast;
 if(ast.type==="unary"){
  const value=simplifyFormulaConstants(ast.value);
  const constant=constantFormulaValue({type:"unary",op:ast.op,value});
  return constant!==null&&Number.isFinite(constant)?{type:"number",value:constant}:{...ast,value};
 }
 if(ast.type==="binary"){
  const left=simplifyFormulaConstants(ast.left),right=simplifyFormulaConstants(ast.right);
  const l=constantFormulaValue(left),r=constantFormulaValue(right);
  if(l!==null&&r!==null){
   let value=null;
   if(ast.op==="+")value=l+r;
   else if(ast.op==="-")value=l-r;
   else if(ast.op==="*")value=l*r;
   else if(ast.op==="/"&&r!==0)value=l/r;
   else if(ast.op==="^")value=Math.pow(l,r);
   if(value!==null&&Number.isFinite(value))return{type:"number",value};
  }
  if(ast.op==="*"&&l===1)return right;
  if(ast.op==="*"&&r===1)return left;
  if(ast.op==="*"&&l===0&&right.type==="variable")return{type:"number",value:0};
  if(ast.op==="*"&&r===0&&left.type==="variable")return{type:"number",value:0};
  if(ast.op==="/"&&r===1)return left;
  if(ast.op==="+"&&l===0)return right;
  if(ast.op==="+"&&r===0)return left;
  if(ast.op==="-"&&r===0)return left;
  if(ast.op==="-"&&l===0)return{type:"unary",op:"-",value:right};
  return{...ast,left,right};
 }
 if(ast.type==="call")return{...ast,args:ast.args.map(simplifyFormulaConstants)};
 return ast;
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
 if(/\b(?:database|db)\s+writes?\b|\bwrites?\b/.test(text))return "write";
 if(/\b(?:database|db)\s+reads?\b|\breads?\b/.test(text))return "read";
 if(/\b(?:edge(?:\s+function)?\s+requests?|function requests?|requests?)\b/.test(text))return "request";
 if(/\b(?:prompts?|invocations?)\b/.test(text))return "request";
 if(/\btokens?\b/.test(text))return "token";
 if(/\b(?:api\s+)?calls?\b/.test(text))return "call";
 if(/\bdevices?\b/.test(text))return "device";
 if(/\b(?:bulbs?|lamps?)\b/.test(text))return "items";
 if(/\bsessions?\b/.test(text))return "session";
 if(/\b(?:monthly\s+active\s+)?users?\b|\bpeople\b|\bpersons?\b/.test(text))return "user";
 // Generic sellable/countable quantities are dimensional values too.
 // Recognize common English and Serbian Latin labels.
 if(/\b(?:cups?|mugs?|units?|items?|products?|pieces?|skus?)\b|\b(?:jedinic\p{L}*|proizvod\p{L}*|artikl\p{L}*|komad\p{L}*|stavk\p{L}*)\b/u.test(text))return "items";
 return "";
}
function blueprintStripRatePeriod(value){
 return String(value||"").replace(/\s+per\s+(?:month|months|year|years|week|weeks|day|days|hour|hours|minute|minutes|second|seconds)$/i,"").trim()
  .replace(/^\d+(?:\.\d+)?\s*(?:k|m|thousand|million)?\s+/i,"").trim();
}
function blueprintPerCountDenominator(label){
 const normalized=String(label||"").toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
 const english=normalized.match(/\bper\s+(?:each\s+)?(.+)$/);
 const serbian=normalized.match(/\bpo\s+(.+)$/u);
 const match=english||serbian;
 if(match)return blueprintCountAtomFromText(blueprintStripRatePeriod(match[1]));
 if(/\b(?:unit|item|product|piece)\s+(?:price|cost|rate)\b/.test(normalized))return "items";
 return "";
}
function blueprintIsPerCountPriceLabel(label){
 const normalized=String(label||"").toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
 const denominator=blueprintPerCountDenominator(normalized);
 const hasMoneyMeaning=/\b(?:price|cost|rate|fee|expense|revenue|cena|trošak|trosak|naknada|prihod|zarada|iznos)\b/u.test(normalized);
 return Boolean(denominator&&hasMoneyMeaning);
}
function blueprintCountUnitFromLabel(label){
 const normalized=String(label||"").toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
 // Do not misclassify a price-per-count input as a quantity rate.
 if(blueprintIsPerCountPriceLabel(normalized))return "";
 const english=normalized.match(/^(.+?)\s+per\s+(.+)$/);
 if(english){
  const numerator=blueprintCountAtomFromText(english[1]);
  const denominator=blueprintPerCountDenominator(normalized);
  if(numerator&&denominator)return numerator+"/"+denominator;
  if(denominator)return denominator;
 }
 const serbianPerMatch=normalized.match(/\bpo\s+(.+)$/u);
 if(serbianPerMatch){
  const denominator=blueprintCountAtomFromText(blueprintStripRatePeriod(serbianPerMatch[1]));
  if(denominator)return denominator;
 }
 return blueprintCountAtomFromText(normalized);
}
function canonicalBlueprintUnitLabel(value){
 let unit=String(value||"").trim();
 unit=unit.replace(/\s+per\s+/gi,"/").replace(/\s*\/\s*/g,"/");
 const aliases=[
  [/^watts?$/i,"W"],[/^kilowatts?$/i,"kW"],[/^watt[- ]hours?$/i,"Wh"],
  [/^kilowatt[- ]hours?$/i,"kWh"],[/^megawatt[- ]hours?$/i,"MWh"],
  [/^hours?$/i,"hours"],[/^days?$/i,"days"],[/^weeks?$/i,"weeks"],[/^months?$/i,"months"],[/^years?$/i,"years"]
 ];
 for(const [pattern,replacement] of aliases){if(pattern.test(unit)){unit=replacement;break;}}
 return unit;
}
function inferBlueprintCountFieldUnit(item,label,notes){
 const rawCurrent=String(item.unit||"").trim();
 const current=canonicalBlueprintUnitLabel(rawCurrent);
 if(current!==rawCurrent){
  item.unit=current;
  notes.push(label+": normalized the unit label to "+current+" so its dimensions can be checked.");
 }
 const normalizedLabel=String(label||"").toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
 const denominator=blueprintPerCountDenominator(normalizedLabel);
 // A caffeine field keyed in milligrams and explicitly measured per cup is a
 // mass-per-serving rate, not a dimensionless number or a cup count.
 if(!current&&/\bcaffeine\b/.test(normalizedLabel)&&/_mg$/i.test(String(item.key||""))&&denominator){
  item.unit="mg/"+denominator;
  notes.push(label+": inferred mg/"+denominator+" from its caffeine key and per-cup label.");
  return;
 }
 const currencyMatch=/^([A-Z]{3})$/.exec(current);
 const ratePlaceholder=/^([A-Z]{3})\s*\/\s*(?:items?|units?)$/i.exec(current);
 const currencyCode=currencyMatch?.[1]||ratePlaceholder?.[1]||"";
 const rateDenominator=blueprintPerCountDenominator(label);
 const supportedCurrency=CURRENCIES.some(([code])=>code===currencyCode);
 if(currencyCode&&supportedCurrency&&rateDenominator&&blueprintIsPerCountPriceLabel(label)){
  const inferredRate=currencyCode+"/"+rateDenominator;
  if(current!==inferredRate){
   item.unit=inferredRate;
   notes.push(label+": inferred "+inferredRate+" because this monetary input is explicitly a price or cost per "+rateDenominator+".");
  }
  return;
 }
 const timeMatch=normalizedLabel.match(/\b(hours?|hrs?|minutes?|seconds?|days?|weeks?|months?|years?)\b/);
 const dailyUsePerItem=/\b(?:daily|per day)\b/.test(normalizedLabel)&&/\b(?:usage|use|operation)\b/.test(normalizedLabel)&&/\b(?:bulb|lamp|device|item)\b/.test(normalizedLabel);
 if(!current&&(timeMatch&&!denominator||dailyUsePerItem)){
  const timeUnit=(!timeMatch?"hours":({hrs:"hours",hr:"hours",hour:"hours",hours:"hours",minute:"minutes",minutes:"minutes",second:"seconds",seconds:"seconds",day:"days",days:"days",week:"weeks",weeks:"weeks",month:"months",months:"months",year:"years",years:"years"})[timeMatch[1]]||timeMatch[1]);
  item.unit=timeUnit;
  notes.push(label+": inferred the explicit time unit "+timeUnit+" from its label.");
  return;
 }
 if(current==="W"&&!current.includes("/")&&/\b(?:bulb|lamp)\b/.test(normalizedLabel)&&/\b(?:wattage|power)\b/.test(normalizedLabel)){
  item.unit="W/items";
  notes.push(label+": inferred W/items because the wattage is specified per bulb.");
  return;
 }
 if(current&&denominator&&!currencyCode&&!current.includes("/")){
  const base=unitDescriptor(current);
  const dimensions=Object.keys(base.vector||{});
  const hasSingleBaseDimension=dimensions.length===1&&!dimensions[0].startsWith("currency:")&&dimensions[0]!=="count"&&Math.abs(base.vector[dimensions[0]]-1)<1e-9&&!base.opaque;
  if(hasSingleBaseDimension){
   const inferredRate=current+"/"+denominator;
   item.unit=inferredRate;
   notes.push(label+": refined the unit to "+inferredRate+" because the label specifies a per-"+denominator+" quantity.");
   return;
  }
 }
 const inferred=blueprintCountUnitFromLabel(label);
 const countPlaceholder=/^(?:items?|units?)$/i.test(current);
 if(!current&&inferred){
  item.unit=inferred;
  notes.push(label+": inferred the explicit count/rate unit "+inferred+" from its label.");
 }else if(countPlaceholder&&inferred&&inferred!==current){
  item.unit=inferred;
  notes.push(label+": replaced the generic "+current+" unit with "+inferred+" based on its label.");
 }else if(ratePlaceholder&&inferred&&!inferred.includes("/")){
  item.unit=ratePlaceholder[1]+"/"+inferred;
  notes.push(label+": refined the generic per-item price unit to "+item.unit+" based on its label.");
 }
}
function inferBlueprintCountInputUnits(inputs,groups,notes){
 (Array.isArray(inputs)?inputs:[]).forEach(input=>inferBlueprintCountFieldUnit(input,String(input.label||input.key||""),notes));
 (Array.isArray(groups)?groups:[]).forEach(group=>(Array.isArray(group.fields)?group.fields:[]).forEach(field=>
  inferBlueprintCountFieldUnit(field,String(field.label||field.key||""),notes)
 ));
}
function inferBlueprintSelectRateUnits(inputs,scenarios,notes){
 (Array.isArray(inputs)?inputs:[]).forEach(input=>{
  if(input.control!=="select"||!Array.isArray(input.choices)||input.choices.length<2)return;
  const parsed=input.choices.map(choice=>{
   const match=String(choice.label||"").match(/\b(\d+(?:\.\d+)?)\s*(GB|TB|MB)\s*\/\s*(hours?|hrs?)\b/i);
   return match?{oldValue:choice.value,newValue:Number(match[1]),unit:match[2].toUpperCase()+"/hour"}:null;
  });
  if(parsed.some(item=>!item)||new Set(parsed.map(item=>item.unit)).size!==1
   ||new Set(parsed.map(item=>item.newValue)).size!==parsed.length
   ||parsed.every(item=>item.oldValue===item.newValue))return;
  const remap=new Map(parsed.map(item=>[item.oldValue,item.newValue]));
  const oldDefault=input.default;
  input.choices=input.choices.map((choice,index)=>({...choice,value:parsed[index].newValue}));
  const values=parsed.map(item=>item.newValue);
  input.min=Math.min(...values);
  input.max=Math.max(...values);
  input.default=remap.has(oldDefault)?remap.get(oldDefault):values[0];
  const precision=Math.max(...values.map(value=>{
   const text=String(value);return(text.split(".")[1]||"").length;
  }));
  input.step=Math.pow(10,-Math.min(8,precision));
  input.unit=parsed[0].unit;
  (Array.isArray(scenarios)?scenarios:[]).forEach(scenario=>{
   if(!scenario?.values||!Object.prototype.hasOwnProperty.call(scenario.values,input.key))return;
   const oldValue=scenario.values[input.key];
   if(remap.has(oldValue))scenario.values[input.key]=remap.get(oldValue);
  });
  notes.push(input.label+": used the explicit data rates in the dropdown labels ("+parsed.map(item=>item.newValue+" "+item.unit).join(", ")+") instead of the ordinal choice values.");
 });
}
function unitRatioLabel(numerator,denominator){
 const ratio=combineUnitDescriptors(numerator,denominator,-1),positive=[],negative=[];
 for(const [dimension,exponent] of Object.entries(ratio.vector||{})){
  if(!Number.isInteger(exponent)||Math.abs(exponent)>2)return "";
  const symbol=ratio.symbols?.[dimension]||({data:"GB",time:"hour",count:"items",length:"km",mass:"kg",volume:"L",energy:"kWh",power:"W"})[dimension]||"";
  if(!symbol)return "";
  const target=exponent>0?positive:negative;
  for(let i=0;i<Math.abs(exponent);i++)target.push(symbol);
 }
 if(!positive.length||!negative.length)return "";
 return positive.join("*")+"/"+negative.join("*");
}
function materializeDimensionalRateConstants(ast,result,formulaUnits,groups,inputs,usedKeys){
 if(result?.format!=="unit"||!result.unit||inputs.length>=24)return{ast,inputs:[],changed:false};
 const expected=unitDescriptor(result.unit),candidates=[];
 const visit=node=>{
  if(!node||typeof node!=="object")return;
  if(node.type==="binary"&&node.op==="*"){
   const leftConstant=constantFormulaValue(node.left),rightConstant=constantFormulaValue(node.right);
   if((leftConstant!==null)!==(rightConstant!==null)){
    const rate=leftConstant!==null?leftConstant:rightConstant;
    const quantity=leftConstant!==null?node.right:node.left;
    if(rate>0&&!Number.isInteger(rate)){
     try{
      const quantityUnit=analyseFormulaUnit(quantity,formulaUnits,groups);
      const rateUnit=unitRatioLabel(expected,quantityUnit);
      if(rateUnit&&sameUnitDescriptor(unitDescriptor(rateUnit),combineUnitDescriptors(expected,quantityUnit,-1))){
       candidates.push({node,constantNode:leftConstant!==null?node.left:node.right,quantity,rate,rateUnit});
      }
     }catch(_){}
    }
   }
   visit(node.left);visit(node.right);
  }else if(node.type==="unary")visit(node.value);
  else if(node.type==="call")(node.args||[]).forEach(visit);
 };
 visit(ast);
 // Only materialize when exactly one decimal coefficient can account for the
 // result's missing physical dimension. Ambiguous formulas stay editable for review.
 if(candidates.length!==1)return{ast,inputs:[],changed:false};
 const candidate=candidates[0],localKeys=new Set(usedKeys);
 const slug=candidate.rateUnit.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
 const baseKey=("estimated_"+slug).slice(0,32);
 let key=baseKey,index=2;
 while(localKeys.has(key)){
  const suffix="_"+index++;
  key=baseKey.slice(0,32-suffix.length)+suffix;
 }
 const textValue=String(candidate.rate),precision=Math.min(8,(textValue.split(".")[1]||"").length);
 const step=Math.pow(10,-precision);
 const max=Number((Math.max(candidate.rate*10,candidate.rate+step)).toPrecision(12));
 const rateInput={key,label:"Estimated "+candidate.rateUnit.replace("/"," per ").replace(/_/g," "),control:"number",min:0,max,default:candidate.rate,step,unit:candidate.rateUnit};
 const replacement={type:"variable",name:key};
 const replace=node=>{
  if(node===candidate.constantNode)return replacement;
  if(!node||typeof node!=="object")return node;
  if(node.type==="binary")return{...node,left:replace(node.left),right:replace(node.right)};
  if(node.type==="unary")return{...node,value:replace(node.value)};
  if(node.type==="call")return{...node,args:node.args.map(replace)};
  return node;
 };
 const repaired=replace(ast),allInputs=[...inputs,rateInput];
 try{
  const actual=analyseFormulaUnit(repaired,[...formulaUnits,rateInput],groups);
  if(!sameUnitDescriptor(actual,expected))return{ast,inputs:[],changed:false};
 }catch(_){return{ast,inputs:[],changed:false};}
 const expression=formulaAstToText(repaired);
 if(expression.length>500)return{ast,inputs:[],changed:false};
 return{ast:repaired,inputs:[rateInput],changed:true,expression};
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

function formulaNodeContainsVariable(node,key){
 if(!node||typeof node!=="object")return false;
 if(node.type==="variable")return node.name===key;
 if(node.type==="binary")return formulaNodeContainsVariable(node.left,key)||formulaNodeContainsVariable(node.right,key);
 if(node.type==="unary")return formulaNodeContainsVariable(node.value,key);
 if(node.type==="call")return node.args.some(argument=>formulaNodeContainsVariable(argument,key));
 return false;
}
function isYearToMonthlyPaymentCount(node,key){
 if(!node||node.type!=="binary"||node.op!=="*")return false;
 return(node.left?.type==="variable"&&node.left.name===key&&constantFormulaValue(node.right)===12)
  ||(node.right?.type==="variable"&&node.right.name===key&&constantFormulaValue(node.left)===12);
}
function formulaContainsYearToMonthlyPower(ast,key){
 if(!ast||typeof ast!=="object")return false;
 if(ast.type==="call"&&ast.name==="pow"&&ast.args?.length===2
  &&formulaNodeContainsVariable(ast.args[1],key)&&isYearToMonthlyPaymentCount(ast.args[1],key))return true;
 if(ast.type==="binary")return formulaContainsYearToMonthlyPower(ast.left,key)||formulaContainsYearToMonthlyPower(ast.right,key);
 if(ast.type==="unary")return formulaContainsYearToMonthlyPower(ast.value,key);
 if(ast.type==="call")return ast.args.some(argument=>formulaContainsYearToMonthlyPower(argument,key));
 return false;
}
function normalizeMortgageTermExponentUnits(inputs,results,groups,notes){
 const keys=new Set([
  ...(Array.isArray(inputs)?inputs:[]).map(input=>input.key),
  ...(Array.isArray(results)?results:[]).map(result=>result.key).filter(Boolean)
 ]);
 const groupMap=groupMapForSpec({groups});
 (Array.isArray(inputs)?inputs:[]).forEach(input=>{
  if(!/year/i.test(String(input.unit||""))||!/(?:mortgage|loan).*(?:term|duration)|(?:term|duration).*(?:mortgage|loan)/i.test(String(input.label||input.key||"")))return;
  const formulas=(Array.isArray(results)?results:[]).map(result=>{
   try{return compileExpression(String(result.expression||""),keys,groupMap);}catch(_){return null;}
  });
  if(!formulas.some(ast=>formulaContainsYearToMonthlyPower(ast,input.key)))return;
  input.unit="";
  notes.push(String(input.label||input.key)+": treated the entered year value as a dimensionless year count because the mortgage formula explicitly multiplies it by 12 to calculate monthly payment periods.");
 });
}

function guardedPositiveVariable(condition){
 if(!condition||condition.type!=="call"||condition.args?.length!==2)return null;
 const variable=condition.args[0],threshold=constantFormulaValue(condition.args[1]);
 if(variable?.type!=="variable"||threshold===null)return null;
 if(condition.name==="gt"&&threshold===0)return variable.name;
 if(condition.name==="gte"&&threshold>=1)return variable.name;
 return null;
}
function directDivisionNumerator(node,denominatorKey){
 if(!node||node.type!=="binary"||node.op!=="/"||node.right?.type!=="variable"||node.right.name!==denominatorKey)return null;
 return node.left;
}
function repairGuardedPerEntityFallbacks(ast,inputs,formulaUnits,groups,notes,label){
 if(!ast||typeof ast!=="object")return ast;
 if(ast.type==="binary")return{...ast,left:repairGuardedPerEntityFallbacks(ast.left,inputs,formulaUnits,groups,notes,label),right:repairGuardedPerEntityFallbacks(ast.right,inputs,formulaUnits,groups,notes,label)};
 if(ast.type==="unary")return{...ast,value:repairGuardedPerEntityFallbacks(ast.value,inputs,formulaUnits,groups,notes,label)};
 if(ast.type!=="call")return ast;
 const args=ast.args.map(argument=>repairGuardedPerEntityFallbacks(argument,inputs,formulaUnits,groups,notes,label));
 const repaired={...ast,args};
 if(ast.name!=="if"||args.length!==3)return repaired;
 const denominatorKey=guardedPositiveVariable(args[0]);
 if(!denominatorKey)return repaired;
 const input=inputs.find(item=>item.key===denominatorKey);
 if(!input||Number(input.min)<0)return repaired;
 const numerator=directDivisionNumerator(args[1],denominatorKey);
 if(!numerator||formulaAstToText(args[2])!==formulaAstToText(numerator))return repaired;
 let quotientUnit,fallbackUnit;
 try{
  quotientUnit=analyseFormulaUnit(args[1],formulaUnits,groups);
  fallbackUnit=analyseFormulaUnit(args[2],formulaUnits,groups);
 }catch(_){return repaired;}
 if(sameUnitDescriptor(quotientUnit,fallbackUnit))return repaired;
 args[2]={type:"number",value:0};
 notes.push(label+": changed the zero-denominator fallback to 0 so a guarded per-entity calculation keeps its correct compound unit.");
 return repaired;
}

function repairBlueprintLightingZoneUsage(spec,notes){
 const groups=Array.isArray(spec?.groups)?spec.groups:[];
 const results=Array.isArray(spec?.results)?spec.results:[];
 const group=groups.find(item=>{
  const text=String(item.key||"")+" "+String(item.label||"");
  return /\b(?:room|lighting|light)\b/i.test(text)
   &&Array.isArray(item.fields)
   &&item.fields.some(field=>/\b(?:bulbs?|lamps?)\b/i.test(String(field.key||"")+" "+String(field.label||"")))
   &&item.fields.some(field=>/\b(?:dimming|brightness)\b/i.test(String(field.key||"")+" "+String(field.label||"")));
 });
 if(!group)return;
 const bulb=group.fields.find(field=>/\b(?:bulbs?|lamps?)\b/i.test(String(field.key||"")+" "+String(field.label||"")));
 const dimming=group.fields.find(field=>/\b(?:dimming|brightness)\b/i.test(String(field.key||"")+" "+String(field.label||"")));
 if(!bulb||!dimming)return;
 const isPercent=/[%]|percent|percentage/i.test(String(dimming.label||""))||Number(dimming.max)===100;
 if(!isPercent)return;
 const result=results.find(item=>
  /\bled\b/i.test(String(item.key||"")+" "+String(item.label||""))
  &&/\b(?:energy|consumption|kwh)\b/i.test(String(item.key||"")+" "+String(item.label||""))
 );
 if(!result||String(result.expression||"").includes(group.key+"."+dimming.key))return;
 const refs=group.key+"."+bulb.key;
 const dim=group.key+"."+dimming.key;
 const expression="("+String(result.expression||"")+") * if(gt(sum("+refs+"),0),sum("+refs+" * "+dim+") / sum("+refs+") / 100,1)";
 if(expression.length>500)return;
 result.expression=expression;
 const assumptions=Array.isArray(spec.assumptions)?spec.assumptions:(spec.assumptions=[]);
 const assumption="Room-zone dimming levels are weighted by the number of bulbs in each zone and applied to active LED energy use; standby energy is calculated separately.";
 if(!assumptions.includes(assumption))assumptions.push(assumption);
 notes.push(result.label+": incorporated the bulb-count-weighted room-zone dimming level into LED energy consumption.");
}

function repairMakerBlueprintSpec(sourceSpec){
 const spec=JSON.parse(JSON.stringify(sourceSpec||{})),notes=[];
 const inputs=Array.isArray(spec.inputs)?spec.inputs:[];
 const groups=Array.isArray(spec.groups)?spec.groups:[];
 const results=Array.isArray(spec.results)?spec.results:[];
 inferBlueprintCountInputUnits(inputs,groups,notes);
 repairBlueprintLightingZoneUsage(spec,notes);
 inferBlueprintSelectRateUnits(inputs,Array.isArray(spec.scenarios)?spec.scenarios:[],notes);
 normalizeMortgageTermExponentUnits(inputs,results,groups,notes);
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
  const simplified=simplifyFormulaConstants(ast);
  const simplifiedText=formulaAstToText(simplified);
  if(simplifiedText!==result.expression&&simplifiedText.length<=500){
   result.expression=simplifiedText;
   expression=simplifiedText;
   ast=simplified;
   notes.push(label+": simplified exact numeric identity operations without changing the formula's mathematical result.");
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
  const compatibleIf=repairGuardedPerEntityFallbacks(ast,inputs,formulaUnits,groups,notes,label);
  const compatibleIfText=formulaAstToText(compatibleIf);
  if(compatibleIfText!==result.expression&&compatibleIfText.length<=500){
   result.expression=compatibleIfText;
   expression=compatibleIfText;
   ast=compatibleIf;
  }
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
      // Every what-if scenario must inherit the generated rate input's
      // default unless it already defines an explicit value for that key.
      (Array.isArray(spec.scenarios)?spec.scenarios:[]).forEach(scenario=>{
       if(!scenario.values||typeof scenario.values!=="object"||Array.isArray(scenario.values))scenario.values={};
       if(!Object.prototype.hasOwnProperty.call(scenario.values,input.key))scenario.values[input.key]=input.default;
      });
      notes.push(label+": converted an implicit numeric cost coefficient into the editable input "+input.label+" ("+input.unit+").");
     });
     ast=materialized.ast;
     expression=materialized.expression;
     result.expression=expression;
    }
   }
  }
  if(result.format==="unit"){
   const materialized=materializeDimensionalRateConstants(ast,result,formulaUnits,groups,inputs,usedVariableKeys);
   if(materialized.changed){
    materialized.inputs.forEach(input=>{
     inputs.push(input);
     formulaUnits.push(input);
     availableKeys.add(input.key);
     usedVariableKeys.add(input.key);
     (Array.isArray(spec.scenarios)?spec.scenarios:[]).forEach(scenario=>{
      if(!scenario.values||typeof scenario.values!=="object"||Array.isArray(scenario.values))scenario.values={};
      if(!Object.prototype.hasOwnProperty.call(scenario.values,input.key))scenario.values[input.key]=input.default;
     });
     notes.push(label+": converted an implicit physical-rate coefficient into the editable input "+input.label+" ("+input.unit+").");
    });
    ast=materialized.ast;
    expression=materialized.expression;
    result.expression=expression;
   }
  }
  let outputUnit;
  try{outputUnit=analyseFormulaUnit(ast,formulaUnits,groups);}
  catch(_){
   if(result.key)availableKeys.add(result.key);
   return;
  }
  const vector=Object.entries(outputUnit.vector||{});
  let unitLabel=unitLabelFromDescriptor(outputUnit);
  if(vector.length===1&&vector[0][0]==="data"&&Math.abs(Number(vector[0][1])-1)<1e-9){
   if(/\b(?:terabytes?|tb)\b/i.test(label))unitLabel="TB";
   else if(/\b(?:gigabytes?|gb)\b/i.test(label))unitLabel="GB";
  }
  if(vector.length===1&&vector[0][0]==="count"&&Math.abs(Number(vector[0][1])-1)<1e-9){
   const semanticCountUnit=blueprintCountUnitFromLabel(label);
   if(semanticCountUnit&&!semanticCountUnit.includes("/")&&sameUnitDescriptor(outputUnit,unitDescriptor(semanticCountUnit)))unitLabel=semanticCountUnit;
  }
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
 const validation=validateManualDraftSpec(spec),currencyWarnings=Number(spec.schemaVersion)===2?[]:makerCurrencyWarnings(spec),notes=[];
 if(validation.errors.length){
  const summary=validation.errors.slice(0,5).join(" ");
  notes.push(state.blueprintImportActive
   ?"Quick Fix draft: "+validation.errors.length+" check(s) still need attention. Edit the affected formulas, units or input ranges below; Save and Publish remain blocked until all checks pass. "+summary
   :"Validation needs attention: "+summary);
 }else if(state.blueprintImportActive){
  notes.push("Quick Fix checks now pass. The calculator is still an editable draft; review assumptions and test values before saving or publishing.");
 }else{
  notes.push(Number(spec.schemaVersion)===2
   ?"Typed V2 schema and default formulas pass the local validator. This experimental draft cannot be saved or published yet."
   :"Input ranges and formulas pass the default and boundary checks. Each currency remains editable; mismatched currencies are not automatically converted.");
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
 if(Number(spec.schemaVersion)===2){
  if(Array.isArray(spec.assumptions)&&spec.assumptions.length){
   const assumptions=text("p","ugc-maker-schema-summary","Assumptions: "+spec.assumptions.join(" "));
   assumptions.classList.add("ugc-v2-detail-assumptions");host.appendChild(assumptions);
  }
  spec.inputs.forEach(input=>{
   const wrap=text("label","ugc-input-field",input.label||input.key);
   const control=createTypedEditorControl(input,typedDefaultForField(input));
   control.name=input.key;control.required=true;
   wrap.appendChild(control);
   if(input.unit)wrap.appendChild(text("small","",input.unit));
   host.appendChild(wrap);
  });
  (Array.isArray(spec.groups)?spec.groups:[]).forEach(group=>appendV2RuntimeGroupControls(host,group));
  const priceLabel=formatCalcPrice(Math.min(500,Math.max(100,Number(calculator.usage_price_milli)||100)));
  host.appendChild(button("Calculate · "+priceLabel+" CALC","ugc-action-primary ugc-calculate-button",()=>runCalculation(calculator)));
  return;
 }
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
 const spec=calculator.spec||{},typedV2=Number(spec.schemaVersion)===2;
 const inputs=spec.inputs||[],values={};
 let groupValues;
 try{
  if(typedV2){
   const collected=collectV2RuntimeValues(form,spec);
   Object.assign(values,collected.values);groupValues=collected.groups;
  }else{
   for(const item of inputs){
    const control=form.querySelector('[name="'+CSS.escape(item.key)+'"]');
    const value=control?.type==="checkbox"?(control.checked?1:0):Number(control?.value);
    if(!Number.isFinite(value)||value<Number(item.min)||value>Number(item.max)){
     detailStatus("Enter a valid value for "+item.label+".",true);control?.focus();return;
    }
    values[item.key]=value;
   }
   groupValues=collectDynamicGroupValues(form,spec);
  }
 }catch(error){detailStatus(error?.message||"Check the calculator inputs and repeated rows.",true);return;}
 const button=form.querySelector(".ugc-calculate-button");if(button)button.disabled=true;
 detailStatus("Calculating…");

 if(typedV2){
  try{
   let session=state.session;
   if(!session?.access_token)session=await getSession();
   if(!session?.access_token)throw new Error("Sign in to calculate.");
   const response=await fetch("/api/ugc-calculator-run",{
    method:"POST",
    headers:{
     "Content-Type":"application/json",
     "Authorization":"Bearer "+session.access_token,
     "Accept":"application/json"
    },
    body:JSON.stringify({calculator_id:calculator.id,values,groups:groupValues}),
    cache:"no-store"
   });
   const payload=await response.json().catch(()=>null);
   if(!response.ok||payload?.success!==true)throw new Error(String(payload?.error||"The server could not complete this calculation."));
   const displayRows=items=>(Array.isArray(items)?items:[]).map(result=>{
    const definition=(spec.results||[]).find(item=>String(item.key||"")===String(result.key||""))||{};
    return{
     label:String(result.label||definition.label||"Result"),
     value:formatResult(definition,result.value),
     explanation:String(result.explanation||definition.explanation||"")
    };
   });
   const results=displayRows(payload.results);
   const scenarioComparisons=(Array.isArray(payload.scenario_comparisons)?payload.scenario_comparisons:[]).map(scenario=>({
    label:String(scenario.label||"Alternative"),
    results:displayRows(scenario.results)
   }));
   clearReactionNote();
   renderCalculationResults(results,scenarioComparisons);
   const chargedMilli=Math.min(500,Math.max(100,Number(payload.usage_price_milli)||Number(calculator.usage_price_milli)||100));
   detailStatus("Calculation complete. "+formatCalcPrice(chargedMilli)+" CALC was charged.",false);
   await refreshCalcWallet();
  }catch(error){
   detailStatus(error?.message||"Could not calculate. Please try again.",true);
  }finally{if(button)button.disabled=false;}
  return;
 }

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
  const results=evaluateFormulaResults(spec,values,groupValues).map(item=>({label:item.label,value:formatResult(item.item||{},item.value),explanation:String(item.explanation||"")}));
  const scenarioComparisons=(Array.isArray(spec.scenarios)?spec.scenarios:[]).map(scenario=>{
   const scenarioValues={...values,...(scenario.values||{})};
   const scenarioResults=evaluateFormulaResults(spec,scenarioValues,groupValues).map(item=>({label:item.label,value:formatResult(item.item||{},item.value),explanation:String(item.explanation||"")}));
   return{label:String(scenario.label||"Alternative"),results:scenarioResults};
  });
  const settle=await sb().rpc("calc_wallet_settle",{p_request_id:requestId});
  if(settle.error||!settle.data?.ok)throw new Error("The calculation finished, but its CALC transaction could not be confirmed.");
  reserved=false;
  if(state.activeCalculator&&String(state.activeCalculator.id)===String(calculator.id))clearReactionNote();
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
 if(Number(calculator.spec?.schemaVersion)===2){await editCalculatorManually(id);return;}
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
 if(Number(state.aiDraft?.spec?.schemaVersion)===2){renderMakerV2TestPanel(preserveValues);return;}
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
 if(Number(state.aiDraft?.spec?.schemaVersion)===2){updateMakerV2TestResults(panel);return;}
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
 "smart-led-lighting":{
  title:"Smart Home LED Lighting Energy & Cost Calculator",
  description:"Compare monthly energy use and electricity costs for smart LED bulbs versus traditional bulbs, including standby power, room-zone dimming and estimated annual savings.",
  category:"home",
  subcategories:["lighting","energy","savings"],
  assumptions:[
   "All monetary calculations are denominated in EUR.",
   "A standard billing month consists of 30 days and electricity tariffs remain constant.",
   "Room-zone dimming levels are weighted by bulb count and applied to active LED energy use; standby energy is calculated separately."
  ],
  inputs:[
   {key:"active_bulbs",label:"Number of Smart Bulbs Installed",min:1,max:50,default:10,step:1,unit:"items"},
   {key:"daily_usage_hours",label:"Average Daily Usage per Bulb",min:1,max:12,default:4,step:0.5,unit:"hours"},
   {key:"led_wattage",label:"Smart LED Bulb Wattage",min:3,max:25,default:9,step:1,unit:"W/items"},
   {key:"replaced_wattage",label:"Replaced Traditional Bulb Wattage",min:25,max:150,default:60,step:5,unit:"W/items"},
   {key:"electricity_tariff",label:"Electricity Price per kWh",min:0.05,max:0.5,default:0.2,step:0.01,unit:"EUR/kWh"},
   {key:"include_smart_standby",label:"Include Smart Standby Power Draw",control:"toggle",min:0,max:1,default:1,step:1,unit:""},
   {key:"standby_wattage",label:"Standby Power per Bulb",min:0.1,max:2,default:0.5,step:0.1,unit:"W/items"}
  ],
  groups:[{key:"room_zones",label:"Room Lighting Zones",itemLabel:"Zone",minItems:1,maxItems:5,fields:[
   {key:"zone_bulbs",label:"Bulbs in Zone",min:1,max:10,default:2,step:1,unit:"items"},
   {key:"dimming_factor",label:"Average Dimming Level (%)",min:20,max:100,default:80,step:10,unit:""}
  ]}],
  results:[
   {key:"monthly_led_kwh",label:"Monthly Smart LED Energy Consumption",expression:"(active_bulbs * led_wattage * daily_usage_hours * 30 * if(gt(sum(room_zones.zone_bulbs),0),sum(room_zones.zone_bulbs * room_zones.dimming_factor) / sum(room_zones.zone_bulbs) / 100,1)) / 1000",format:"unit",unit:"kWh",explanation:"Monthly energy used by LED bulbs after applying the bulb-count-weighted dimming level across room zones."},
   {key:"monthly_traditional_kwh",label:"Monthly Traditional Lighting Energy (Baseline)",expression:"(active_bulbs * replaced_wattage * daily_usage_hours * 30) / 1000",format:"unit",unit:"kWh",explanation:"Estimated monthly energy use if the same number of bulbs were traditional incandescent bulbs at full rated power."},
   {key:"monthly_standby_kwh",label:"Monthly Smart Standby Energy Draw",expression:"if(eq(include_smart_standby,1),(active_bulbs * standby_wattage * (24-daily_usage_hours) * 30) / 1000,0)",format:"unit",unit:"kWh",explanation:"Additional monthly energy used while connected smart bulbs remain in standby mode."},
   {key:"total_monthly_kwh",label:"Total Monthly Smart Lighting Energy",expression:"monthly_led_kwh + monthly_standby_kwh",format:"unit",unit:"kWh",explanation:"Combined monthly LED operating and standby energy use."},
   {key:"monthly_lighting_cost",label:"Monthly Smart Lighting Cost",expression:"total_monthly_kwh * electricity_tariff",format:"currency",currency:"EUR",explanation:"Estimated monthly electricity cost for LED lighting and any included standby draw."},
   {key:"annual_monetary_savings",label:"Annual Savings vs Traditional Bulbs",expression:"(monthly_traditional_kwh-total_monthly_kwh) * 12 * electricity_tariff",format:"currency",currency:"EUR",explanation:"Estimated annual cost difference between the traditional-bulb baseline and smart LED lighting, including standby consumption."}
  ],
  scenarios:[
   {label:"Small Apartment Setup",values:{active_bulbs:6,daily_usage_hours:3,led_wattage:9,replaced_wattage:60,electricity_tariff:0.18,include_smart_standby:1,standby_wattage:0.5}},
   {label:"Large Family Home",values:{active_bulbs:25,daily_usage_hours:5,led_wattage:10,replaced_wattage:75,electricity_tariff:0.25,include_smart_standby:1,standby_wattage:0.5}}
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
const RANDOM_MANUAL_TEMPLATE_KEYS=["simple-cost","monthly-cost","compare-costs","unit-price-compare","discount-price","electricity-cost","smart-led-lighting","heating-compare","water-cost","flooring-materials","fuel-cost","car-ownership-cost","travel-budget","savings-total","hourly-pay","simple-interest","profit-margin","break-even"];
function pickRandomManualTemplateKey(){
 const available=RANDOM_MANUAL_TEMPLATE_KEYS.filter(key=>MANUAL_TEMPLATES[key]);
 return available[Math.floor(Math.random()*available.length)]||"simple-cost";
}
function isRandomCalculatorRequest(value){
 const normalized=String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 return /\brandom\b|\bnasumic\w*\b|\bsurprise me\b|\bpick (?:any|a) calculator\b|\bchoose (?:any|a) calculator\b|\bany random calculator\b|\bdaj neki random\b/.test(normalized);
}
function inferManualTemplateKey(request,definition){
 if(isRandomCalculatorRequest(request))return "random";
 if(!String(request||"").trim()&&!definition?.title&&!definition?.spec)return "random";
 const spec=definition?.spec||{};
 const textParts=[
  String(request||""),String(definition?.title||""),String(definition?.description||""),
  String(definition?.category||""),
  ...(Array.isArray(spec.inputs)?spec.inputs.flatMap(item=>[item.label,item.key]):[]),
  ...(Array.isArray(spec.groups)?spec.groups.flatMap(group=>[group.label,group.key,...(group.fields||[]).flatMap(field=>[field.label,field.key])]):[]),
  ...(Array.isArray(spec.results)?spec.results.flatMap(item=>[item.label,item.key,item.explanation,item.expression]):[])
 ];
 const text=textParts.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 const rules=[
  ["smart-led-lighting",/\b(?:smart led|led lighting|lighting zones?|dimming|incandescent bulbs?|smart bulbs?)\b/],
  ["electricity-cost",/\b(?:electricity|electric|energy bill|power consumption|kilowatt hours?|kwh|electric tariff)\b/],
  ["heating-compare",/\b(?:heating|pellets?|firewood|boiler)\b/],
  ["water-cost",/\b(?:water bill|water usage|water consumption|cubic metres?|m3)\b/],
  ["flooring-materials",/\b(?:flooring|floor area|tiles?|laminate|floor materials)\b/],
  ["fuel-cost",/\b(?:fuel|petrol|diesel|gasoline|fuel consumption|litres? per 100)\b/],
  ["car-ownership-cost",/\b(?:car ownership|vehicle ownership|car insurance|vehicle maintenance|ownership cost)\b/],
  ["travel-budget",/\b(?:trip budget|travel budget|holiday budget|vacation budget|travellers?)\b/],
  ["simple-interest",/\b(?:simple interest|principal amount|interest earned)\b/],
  ["profit-margin",/\b(?:profit margin|business profit|gross revenue|net profit|units sold)\b/],
  ["break-even",/\b(?:break[ -]?even|contribution margin)\b/],
  ["savings-total",/\b(?:savings goal|saving contributions|monthly deposit|starting savings)\b/],
  ["discount-price",/\b(?:discount|sale price|percentage off)\b/],
  ["unit-price-compare",/\b(?:price per unit|unit price|package comparison|compare package)\b/],
  ["monthly-cost",/\b(?:recurring cost|monthly cost|weekly cost|yearly cost)\b/],
  ["compare-costs",/\b(?:compare two costs|cost comparison|option a|option b)\b/]
 ];
 for(const [key,pattern] of rules)if(pattern.test(text))return key;
 if(/\b(?:cost|expense|price|total|budget)\b/.test(text))return "simple-cost";
 return "advanced";
}
function createManualDraft(templateKey){
 const selectedKey=templateKey==="random"?pickRandomManualTemplateKey():templateKey;
 const template=MANUAL_TEMPLATES[selectedKey]||MANUAL_TEMPLATES["simple-cost"];
 return {title:template.title,description:template.description,category:template.category,
  spec:{subcategories:JSON.parse(JSON.stringify(template.subcategories||[])),assumptions:JSON.parse(JSON.stringify(template.assumptions||[])),
   inputs:JSON.parse(JSON.stringify(template.inputs)),results:JSON.parse(JSON.stringify(template.results)).map((result,index)=>({...result,key:result.key||"result_"+(index+1)})),
   groups:JSON.parse(JSON.stringify(template.groups||[])),scenarios:JSON.parse(JSON.stringify(template.scenarios||[]))}};
}
function setMakerModeUI(){
 const manual=state.creationSource==="manual";
 const manualControls=$("ugcManualControls"),aiWrap=$("ugcMakerAiPromptWrap"),aiButton=$("ugcMakerGenerate");
 const aiSchemaWrap=$("ugcMakerTargetSchemaVersionWrap"),aiSchemaSelect=$("ugcMakerTargetSchemaVersion");
 if(aiSchemaWrap)aiSchemaWrap.hidden=manual||Boolean(state.editingId);
 if(aiSchemaSelect){aiSchemaSelect.disabled=Boolean(state.editingId);if(state.editingId)aiSchemaSelect.value="1";}

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
 const templateWrap=$("ugcManualTemplateWrap");
 if(templateWrap)templateWrap.hidden=!manual||Boolean(state.editingId)||state.manualMode!=="template";
 const modeSelect=$("ugcManualMode");
 if(modeSelect&&manual)modeSelect.value=state.manualMode||"quick";
}
function loadManualTemplate(templateKey){
 const selectedKey=templateKey==="random"?pickRandomManualTemplateKey():templateKey;
 state.blueprintImportActive=false;
 state.creationSource="manual";state.aiOperationId="";
 state.manualTemplateKey=selectedKey;
 state.aiDraft=createManualDraft(selectedKey);
 const modeSelect=$("ugcManualMode");if(modeSelect)modeSelect.value=state.manualMode||"quick";
 const templateSelect=$("ugcManualTemplate");if(templateSelect&&templateSelect.value!==selectedKey)templateSelect.value=selectedKey;
 setMakerModeUI();renderMakerPreview(state.aiDraft);
 makerStatus(templateKey==="random"
  ?"Random calculator draft ready: "+state.aiDraft.title+". Its title, description, inputs and formulas are matched to the selected topic. Edit and test it locally before saving."
  :"Manual calculator draft ready. Edit the inputs, formulas, units and currency, then test it locally before saving.");
}
function changeManualMode(mode){
 state.manualMode=["quick","template","advanced","random"].includes(mode)?mode:"quick";
 const modeSelect=$("ugcManualMode");if(modeSelect)modeSelect.value=state.manualMode;
 const templateKey=state.manualMode==="quick"?"simple-cost"
  :state.manualMode==="advanced"?"advanced"
  :state.manualMode==="random"?"random"
  :String($("ugcManualTemplate")?.value||"simple-cost");
 loadManualTemplate(templateKey);
}
async function copyBlueprintPrompt(){
 const statusNode=$("ugcBlueprintImportStatus");
 const targetVersion=Number($("ugcBlueprintTargetVersion")?.value||1);
 const prompt=window.WorthItBlueprintImport?.buildPrompt?.(targetVersion);
 if(!prompt){if(statusNode)statusNode.textContent="Blueprint instructions are unavailable. Reload Manual Builder.";return;}
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(prompt);
  else{
   const temporary=document.createElement("textarea");temporary.value=prompt;temporary.setAttribute("readonly","");
   temporary.style.position="fixed";temporary.style.opacity="0";document.body.appendChild(temporary);
   temporary.select();const copied=document.execCommand("copy");temporary.remove();
   if(!copied)throw new Error("Clipboard access is unavailable in this browser.");
  }
  if(statusNode)statusNode.textContent="Version "+targetVersion+" blueprint instructions copied. Paste them into an external AI assistant; Worth It will not contact an AI service.";
 }catch(error){
  if(statusNode)statusNode.textContent=error?.message||"Could not copy the instructions. You can select and copy them manually.";
 }
}
function applyAdaptiveManualFallback(originalRequest,sourceDefinition,reason,statusNode){
 const intentKey=inferManualTemplateKey(originalRequest,sourceDefinition||{});
 const randomIntent=intentKey==="random";
 const selectedTemplateKey=randomIntent?pickRandomManualTemplateKey():intentKey;
 const mode=randomIntent?"random":selectedTemplateKey==="simple-cost"?"quick":selectedTemplateKey==="advanced"?"advanced":"template";
 state.creationSource="manual";
 state.aiOperationId="";
 state.manualMode=mode;
 state.manualTemplateKey=selectedTemplateKey;
 state.regionalDefaults=null;
 state.makerLocale="auto";
 state.blueprintImportActive=false;
 state.aiDraft=createManualDraft(selectedTemplateKey);
 if(selectedTemplateKey==="advanced"&&sourceDefinition?.title){
  const requestedTitle=String(sourceDefinition.title).trim().slice(0,70);
  if(requestedTitle.length>=3)state.aiDraft.title=requestedTitle;
  state.aiDraft.description="Safe starter structure for "+state.aiDraft.title+". The imported formula model could not be reconstructed reliably; add the required inputs, units and formulas, then test them before saving or publishing.";
  const sourceCategory=String(sourceDefinition.category||"other");
  if(["cars","money","technology","home","other"].includes(sourceCategory))state.aiDraft.category=sourceCategory;
  const sourceSubcategories=sourceDefinition.spec?.subcategories||sourceDefinition.subcategories;
  if(Array.isArray(sourceSubcategories))state.aiDraft.spec.subcategories=sourceSubcategories.slice(0,12);
 }
 const modeSelect=$("ugcManualMode");
 if(modeSelect)modeSelect.value=mode;
 const templateSelect=$("ugcManualTemplate");
 if(templateSelect)templateSelect.value=selectedTemplateKey;
 setMakerModeUI();
 renderMakerPreview(state.aiDraft);
 const topic=state.aiDraft.title;
 const detail=randomIntent
  ?"The request was random, so Creator selected the Random calculator mode and picked a tested calculator template."
  :"The imported blueprint could not pass the shared checks, so Creator selected the closest supported Manual Builder template for the request.";
 const message=detail+" Selected: "+topic+". The draft is editable and locally testable; nothing was saved, published, sent to an AI service or charged.";
 makerStatus(message);
 if(statusNode)statusNode.textContent="Adaptive fallback complete. "+message+(reason?" Original blueprint issue: "+String(reason).slice(0,260):"");
 $("ugcMakerPreview")?.scrollIntoView?.({behavior:"smooth",block:"start"});
 return {mode,selectedTemplateKey,randomIntent,title:topic};
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
  const originalRequest=String($("ugcBlueprintOriginalRequest")?.value||"").trim();
  const importer=window.WorthItBlueprintImport;
  let definition=null,importError=null;
  try{
   if(!importer?.parseBlueprint)throw new Error("Blueprint import is unavailable. Reload Manual Builder.");
   definition=importer.parseBlueprint(raw,validateManualDraftSpec,originalRequest);
  }catch(error){importError=error;}
  let importNotes=[];
  let validationIssueCount=0;
  let validationSummary="";
  if(definition){
   importNotes=Array.isArray(definition.importNotes)?definition.importNotes.slice(0,6):[];
   validationIssueCount=Number(definition.importValidationIssueCount)||0;
   const typedV2=Number(definition.spec?.schemaVersion)===2;
   const sharedValidation=validateManualDraftSpec(definition.spec);
   const sharedErrors=Array.isArray(sharedValidation?.errors)?sharedValidation.errors:[];
   validationIssueCount=Math.max(validationIssueCount,sharedErrors.length);
   validationSummary=sharedErrors.slice(0,4).join(" ");
   delete definition.importNotes;
   delete definition.importValidationIssues;
   delete definition.importValidationIssueCount;
  }
  if(state.aiDraft&&!window.confirm("Continue with this import? It will replace the current unsaved Manual Builder draft, but nothing will be saved or published.")){
   if(statusNode)statusNode.textContent="Import cancelled. Your current draft was left unchanged.";
   makerStatus("Blueprint import cancelled. Your current draft was left unchanged.");
   return;
  }
  state.regionalDefaults=null;
  state.makerLocale="auto";
  if(!definition||(validationIssueCount>0&&!typedV2)){
   const reason=importError?.message||(validationSummary||validationIssueCount+" validation item(s) remained after Quick Fix.");
   const fallback=applyAdaptiveManualFallback(originalRequest,definition,reason,statusNode);
   const adjustmentText=importNotes.length?" Quick Fix notes: "+importNotes.join(" "):"";
   const summary=reason?" Original blueprint review: "+String(reason).slice(0,300):"";
   const finalMessage="Quick Fix used the adaptive fallback. "+(fallback.randomIntent?"Random calculator mode is selected. ":"The closest supported Manual Builder template is selected. ")+fallback.title+" is ready to edit and test. Nothing was saved or published."+adjustmentText+summary;
   makerStatus(finalMessage);
   if(statusNode)statusNode.textContent=finalMessage;
  }else{
   state.creationSource="manual";
   state.aiOperationId="";
   state.manualMode="advanced";
   state.manualTemplateKey="";
   state.blueprintImportActive=true;
   state.aiDraft=definition;
   const mode=$("ugcManualMode");if(mode)mode.value="advanced";
   const templateWrap=$("ugcManualTemplateWrap");if(templateWrap)templateWrap.hidden=true;
   setMakerModeUI();
   renderMakerPreview(state.aiDraft);
   const adjustmentText=importNotes.length?" Quick Fix notes: "+importNotes.join(" "):"";
   const completionMessage=typedV2
    ?(validationIssueCount>0
      ?"Typed V2 blueprint imported as an editable local draft, but "+validationIssueCount+" validation item(s) still need review. "+validationSummary
      :"Typed V2 blueprint passed the schema, formula, unit and default-value checks.")
      +" Review and test it locally. V2 Save and Publish remain disabled; nothing was saved, published, sent to an AI service or charged."
    :"Quick Fix complete. The blueprint passed the formula, unit and boundary checks. Review and test it locally; nothing was saved, published, sent to an AI service or charged.";
   makerStatus(completionMessage+adjustmentText);
   if(statusNode)statusNode.textContent=completionMessage+adjustmentText;
   $("ugcMakerPreview")?.scrollIntoView?.({behavior:"smooth",block:"start"});
  }
 }catch(error){
  const detail=error?.message||"The adaptive calculator could not be prepared.";
  if(statusNode)statusNode.textContent=detail;
  makerStatus("Creator could not complete the adaptive fallback: "+String(detail)+". Your existing local draft was left unchanged.","error");
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

function cloneCalculatorData(value){
 return JSON.parse(JSON.stringify(value??{}));
}
function convertManualDraftToV2(definition){
 const next=cloneCalculatorData(definition);
 const spec=next.spec||{};
 spec.schemaVersion=2;spec.engineVersion=2;
 spec.inputs=(Array.isArray(spec.inputs)?spec.inputs:[]).map(item=>{
  const control=String(item.control||"number");
  if(control==="toggle"){
   const converted={key:item.key,label:item.label,type:"boolean",default:Number(item.default)>=0.5,control:"toggle"};
   return converted;
  }
  return{
   key:item.key,label:item.label,type:"number",
   min:Number(item.min),max:Number(item.max),default:Number(item.default),step:Number(item.step)||1,
   unit:String(item.unit||""),control:["number","slider","select"].includes(control)?control:"number",
   ...(control==="select"&&Array.isArray(item.choices)?{choices:cloneCalculatorData(item.choices)}:{})
  };
 });
 spec.groups=(Array.isArray(spec.groups)?spec.groups:[]).map(group=>({
  key:group.key,label:group.label,itemLabel:group.itemLabel||"Item",
  minItems:Number(group.minItems)||1,maxItems:Number(group.maxItems)||10,
  fields:(Array.isArray(group.fields)?group.fields:[]).map(field=>({
   key:field.key,label:field.label,type:"number",
   min:Number(field.min),max:Number(field.max),default:Number(field.default),step:Number(field.step)||1,
   unit:String(field.unit||"")
  }))
 }));
 spec.scenarios=(Array.isArray(spec.scenarios)?spec.scenarios:[]).map(scenario=>{
  const values={};
  spec.inputs.forEach(input=>{
   const previous=scenario.values?.[input.key];
   values[input.key]=input.type==="boolean"?Boolean(previous):Number(previous??input.default);
  });
  return{label:scenario.label,values};
 });
 next.spec=spec;
 return next;
}
function changeManualSchemaVersion(definition,version){
 if(!definition?.spec)return;
 if(Number(version)===2){
  if(Number(definition.spec.schemaVersion)===2)return;
  if(state.editingId){makerStatus("Saved calculators remain on V1 until the V2 save and publish paths are complete.","error");return;}
  state.aiDraft=convertManualDraftToV2(definition);
  makerStatus("Typed V2 draft created. Boolean controls were converted to strict true/false values; review the formulas and test the draft locally. Saving and publishing are not enabled.","generating");
  renderMakerPreview(state.aiDraft);
  return;
 }
 if(Number(definition.spec.schemaVersion)===2){
  makerStatus("A typed V2 draft cannot be downgraded automatically because enum and date values would be lost. Start a separate V1 draft to use the current save flow.","error");
  renderMakerPreview(definition);
 }
}
function validateManualDraftSpec(spec){
 if(Number(spec?.schemaVersion)!==2)return validateMakerSpec(spec);
 const errors=[];
 const engineSpec=cloneCalculatorData(spec);
 // These are Manual Builder presentation metadata, not executable schema fields.
 delete engineSpec.assumptions;delete engineSpec.subcategories;
 let validation;
 try{validation=validateVersionedSpec(engineSpec);}catch(error){return{errors:[String(error?.message||"V2 validation failed.")]};}
 if(!Array.isArray(validation?.errors))return{errors:["The V2 validator returned an invalid response."]};
 errors.push(...validation.errors.map(String));
 if(errors.length)return{errors};
 try{
  const inputs=createDefaultTypedValues(engineSpec),groups=createDefaultTypedGroupValues(engineSpec);
  if(inputs?.valid!==true)errors.push(...(Array.isArray(inputs?.errors)?inputs.errors.map(String):["V2 input defaults are invalid."]));
  if(groups?.valid!==true)errors.push(...(Array.isArray(groups?.errors)?groups.errors.map(String):["V2 dynamic-group defaults are invalid."]));
  if(!errors.length)evaluateV2TypedResults(engineSpec,inputs.values,groups.groups);
 }catch(error){errors.push(String(error?.message||"The V2 default-value test failed."));}
 return{errors};
}
validateManualDraftSpec.repairBlueprintSpec=validateMakerSpec.repairBlueprintSpec;
function renderManualSchemaVersionControl(host,definition){
 const label=document.createElement("label");label.className="ugc-maker-schema-version-field";
 label.appendChild(text("span","","Calculator schema"));
 const select=document.createElement("select");select.id="ugcManualSchemaVersion";
 [["1","Version 1 · current"],["2","Version 2 · typed draft (experimental)"]].forEach(([value,title])=>{
  const option=document.createElement("option");option.value=value;option.textContent=title;select.appendChild(option);
 });
 const current=Number(definition.spec?.schemaVersion)===2?2:1;
 select.value=String(current);select.disabled=Boolean(state.editingId);
 select.addEventListener("change",()=>changeManualSchemaVersion(definition,select.value));
 label.appendChild(select);host.appendChild(label);
 if(current===2)host.appendChild(text("p","ugc-maker-schema-summary","Typed V2 supports number, boolean, enum and date values. Preview and testing run locally; saving and publishing remain disabled until all server and database paths support V2."));
}
function createTypedEditorControl(field,value){
 let control;
 if(field.type==="boolean"){
  control=document.createElement("input");control.type="checkbox";control.checked=Boolean(value);
 }else if(field.type==="enum"){
  control=document.createElement("select");
  (Array.isArray(field.choices)?field.choices:[]).forEach(choice=>{
   const option=document.createElement("option");option.value=String(choice.value);option.textContent=String(choice.label);control.appendChild(option);
  });
  control.value=String(value??field.default??"");
 }else if(field.type==="date"){
  control=document.createElement("input");control.type="date";control.value=String(value??field.default??"");
  if(field.minDate)control.min=String(field.minDate);
  if(field.maxDate)control.max=String(field.maxDate);
 }else if(field.control==="select"&&Array.isArray(field.choices)&&field.choices.length>=2){
  control=document.createElement("select");
  field.choices.forEach(choice=>{
   const option=document.createElement("option");option.value=String(choice.value);option.textContent=String(choice.label);control.appendChild(option);
  });
  control.value=String(value??field.default??"");
 }else{
  control=document.createElement("input");control.type=field.control==="slider"?"range":"number";
  if(field.min!==undefined)control.min=String(field.min);
  if(field.max!==undefined)control.max=String(field.max);
  control.step=String(field.step||"any");control.value=String(value??field.default??"");
 }
 return control;
}
function typedEditorValue(field,control){
 if(field.type==="boolean")return control.checked===true;
 if(field.type==="enum"||field.type==="date")return String(control.value||"");
 const value=Number(control.value);
 return Number.isFinite(value)?value:NaN;
}
function typedDefaultForField(field){
 if(field.type==="boolean")return Boolean(field.default);
 if(field.type==="enum"||field.type==="date")return String(field.default??"");
 return Number(field.default);
}
function parseTypedChoices(raw,type){
 const lines=String(raw||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const choices=[];
 for(const line of lines){
  const at=line.lastIndexOf("=");
  if(at<1)return{valid:false,choices:[],error:"Use one choice per line in the format Label = value."};
  const label=line.slice(0,at).trim(),valueText=line.slice(at+1).trim();
  if(!label||label.length>50)return{valid:false,choices:[],error:"Choice labels must contain 1–50 characters."};
  const value=type==="enum"?valueText:Number(valueText);
  if(type==="enum"&&(!valueText||valueText.length>64))return{valid:false,choices:[],error:"Enum values must contain 1–64 characters."};
  if(type==="number"&&(!valueText||!Number.isFinite(value)||Math.abs(value)>1000000000000))return{valid:false,choices:[],error:"Numeric choices must contain finite numeric values."};
  choices.push({label,value});
 }
 if(choices.length<2||choices.length>12)return{valid:false,choices:[],error:"Add between 2 and 12 choices."};
 if(new Set(choices.map(choice=>choice.label.toLowerCase())).size!==choices.length)return{valid:false,choices:[],error:"Choice labels must be unique."};
 if(new Set(choices.map(choice=>String(choice.value))).size!==choices.length)return{valid:false,choices:[],error:"Choice values must be unique."};
 return{valid:true,choices,error:""};
}
function updateV2IdentifierReferences(spec,oldKey,newKey,scope){
 if(oldKey===newKey)return;
 const expressionPattern=new RegExp("\\b"+oldKey+"\\b","g");
 (Array.isArray(spec.results)?spec.results:[]).forEach(result=>{result.expression=String(result.expression||"").replace(expressionPattern,newKey);});
 if(scope==="input"){
  (Array.isArray(spec.scenarios)?spec.scenarios:[]).forEach(scenario=>{
   if(Object.prototype.hasOwnProperty.call(scenario.values||{},oldKey)){scenario.values[newKey]=scenario.values[oldKey];delete scenario.values[oldKey];}
  });
 }
}
function renderManualV2InputEditor(host,definition){
 const spec=definition.spec,section=document.createElement("section");
 section.className="ugc-maker-v2-input-editor";
 section.appendChild(text("h3","ugc-maker-schema-heading","Typed calculator inputs"));
 section.appendChild(text("p","ugc-maker-schema-summary","Choose a strict value type for every input. Boolean values are true/false, enum values must match a declared option, and dates use calendar dates without time zones. Up to 24 fixed inputs."));
 spec.inputs.forEach((item,index)=>{
  const card=document.createElement("fieldset");card.className="ugc-maker-schema-group";
  card.appendChild(text("legend","","Input "+(index+1)));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addText=(name,value,onChange,max=60)=>{
   const label=document.createElement("label");label.textContent=name;
   const input=document.createElement("input");input.type="text";input.maxLength=max;input.value=String(value??"");
   input.addEventListener("input",()=>{onChange(input.value);refreshMakerTestIfOpen();refreshMakerValidationNote();});
   label.appendChild(input);grid.appendChild(label);return input;
  };
  const oldKey=String(item.key||"");
  const keyInput=addText("Variable key",oldKey,()=>{},32);keyInput.pattern="[a-z][a-z0-9_]{0,31}";
  keyInput.addEventListener("change",()=>{
   const next=String(keyInput.value||"").trim();
   const collision=spec.inputs.some((other,i)=>i!==index&&other.key===next)
    ||spec.results.some(result=>result.key===next)
    ||spec.groups.some(group=>group.key===next||(group.fields||[]).some(field=>field.key===next));
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(next)||collision){keyInput.value=item.key;makerStatus("Input keys must be unique lowercase identifiers.","error");return;}
   updateV2IdentifierReferences(spec,oldKey,next,"input");item.key=next;renderMakerPreview(definition);
  });
  addText("Input label",item.label,value=>{item.label=String(value).slice(0,60);});
  const typeLabel=document.createElement("label");typeLabel.appendChild(text("span","","Value type"));
  const typeSelect=document.createElement("select");
  [["number","Number"],["boolean","Boolean (on/off)"],["enum","Enum (fixed options)"],["date","Date"]].forEach(([value,label])=>{
   const option=document.createElement("option");option.value=value;option.textContent=label;typeSelect.appendChild(option);
  });
  typeSelect.value=item.type||"number";
  typeSelect.addEventListener("change",()=>{
   const nextType=typeSelect.value,key=item.key,label=item.label;
   let replacement;
   if(nextType==="boolean")replacement={key,label,type:"boolean",default:false,control:"toggle"};
   else if(nextType==="enum")replacement={key,label,type:"enum",default:"option_1",control:"select",choices:[{label:"Option 1",value:"option_1"},{label:"Option 2",value:"option_2"}]};
   else if(nextType==="date")replacement={key,label,type:"date",default:"2026-01-01",control:"date"};
   else replacement={key,label,type:"number",min:0,max:100,default:0,step:1,unit:"",control:"number"};
   Object.keys(item).forEach(property=>delete item[property]);Object.assign(item,replacement);
   renderMakerPreview(definition);
  });
  typeLabel.appendChild(typeSelect);grid.appendChild(typeLabel);
  if(item.type==="number"){
   const addNumber=(name,value,onChange,step="any")=>{
    const label=document.createElement("label");label.textContent=name;
    const input=document.createElement("input");input.type="number";input.step=step;input.value=String(value??"");
    input.addEventListener("input",()=>{if(input.value!==""&&Number.isFinite(Number(input.value)))onChange(Number(input.value));refreshMakerTestIfOpen();refreshMakerValidationNote();});
    label.appendChild(input);grid.appendChild(label);
   };
   addNumber("Default",item.default,value=>{item.default=value;});
   addNumber("Minimum",item.min,value=>{item.min=value;});
   addNumber("Maximum",item.max,value=>{item.max=value;});
   addNumber("Step",item.step,value=>{item.step=value;});
   addText("Unit",item.unit||"",value=>{item.unit=String(value).slice(0,16);},16);
   const controlLabel=document.createElement("label");controlLabel.appendChild(text("span","","Control"));
   const control=document.createElement("select");
   [["number","Number field"],["slider","Slider"],["select","Numeric dropdown"]].forEach(([value,label])=>{
    const option=document.createElement("option");option.value=value;option.textContent=label;control.appendChild(option);
   });
   control.value=["number","slider","select"].includes(item.control)?item.control:"number";
   control.addEventListener("change",()=>{item.control=control.value;if(control.value!=="select")delete item.choices;else if(!Array.isArray(item.choices)||item.choices.length<2)item.choices=[{label:"Lower",value:Number(item.min)},{label:"Upper",value:Number(item.max)}];renderMakerPreview(definition);});
   controlLabel.appendChild(control);grid.appendChild(controlLabel);
   if(item.control==="select"){
    const choices=document.createElement("label");choices.className="ugc-maker-choice-editor";choices.appendChild(text("span","","Numeric options · Label = number"));
    const textarea=document.createElement("textarea");textarea.rows=4;textarea.value=(item.choices||[]).map(choice=>choice.label+" = "+choice.value).join("\n");
    textarea.addEventListener("change",()=>{const parsed=parseTypedChoices(textarea.value,"number");if(!parsed.valid){makerStatus(parsed.error,"error");return;}
     item.choices=parsed.choices;const values=parsed.choices.map(choice=>choice.value);item.min=Math.min(...values);item.max=Math.max(...values);
     if(!values.includes(Number(item.default)))item.default=values[0];renderMakerPreview(definition);
    });
    choices.appendChild(textarea);grid.appendChild(choices);
   }
  }else if(item.type==="boolean"){
   const label=document.createElement("label");label.className="ugc-maker-v2-boolean-default";
   const input=document.createElement("input");input.type="checkbox";input.checked=item.default===true;
   input.addEventListener("change",()=>{item.default=input.checked;refreshMakerTestIfOpen();refreshMakerValidationNote();});
   label.append(input,text("span","","Default enabled"));grid.appendChild(label);
  }else if(item.type==="enum"){
   const choices=document.createElement("label");choices.className="ugc-maker-choice-editor";choices.appendChild(text("span","","Enum options · Label = value"));
   const textarea=document.createElement("textarea");textarea.rows=4;textarea.value=(item.choices||[]).map(choice=>choice.label+" = "+choice.value).join("\n");
   textarea.addEventListener("change",()=>{const parsed=parseTypedChoices(textarea.value,"enum");if(!parsed.valid){makerStatus(parsed.error,"error");return;}
    item.choices=parsed.choices;if(!parsed.choices.some(choice=>choice.value===item.default))item.default=parsed.choices[0].value;renderMakerPreview(definition);
   });
   choices.appendChild(textarea);grid.appendChild(choices);
   addText("Default enum value",item.default,value=>{item.default=value;});
  }else{
   const date=document.createElement("label");date.textContent="Default date";
   const input=document.createElement("input");input.type="date";input.value=String(item.default||"2026-01-01");
   input.addEventListener("change",()=>{item.default=input.value;refreshMakerTestIfOpen();refreshMakerValidationNote();});
   date.appendChild(input);grid.appendChild(date);
   const minDate=document.createElement("label");minDate.textContent="Minimum date (optional)";
   const min=document.createElement("input");min.type="date";min.value=String(item.minDate||"");
   min.addEventListener("change",()=>{if(min.value)item.minDate=min.value;else delete item.minDate;refreshMakerValidationNote();});
   minDate.appendChild(min);grid.appendChild(minDate);
   const maxDate=document.createElement("label");maxDate.textContent="Maximum date (optional)";
   const max=document.createElement("input");max.type="date";max.value=String(item.maxDate||"");
   max.addEventListener("change",()=>{if(max.value)item.maxDate=max.value;else delete item.maxDate;refreshMakerValidationNote();});
   maxDate.appendChild(max);grid.appendChild(maxDate);
  }
  const remove=button("Remove input","ugc-manual-remove",()=>{if(spec.inputs.length<=1)return;
   const key=item.key;spec.inputs.splice(index,1);(spec.scenarios||[]).forEach(scenario=>{if(scenario.values)delete scenario.values[key];});renderMakerPreview(definition);
  });
  remove.disabled=spec.inputs.length<=1;grid.appendChild(remove);
  card.appendChild(grid);section.appendChild(card);
 });
 const add=button("＋ Add typed input","ugc-action-secondary",()=>{
  if(spec.inputs.length>=24)return;
  let n=1,key="input_"+n;while(spec.inputs.some(item=>item.key===key)||spec.results.some(result=>result.key===key))key="input_"+(++n);
  const item={key,label:"New input",type:"number",min:0,max:100,default:0,step:1,unit:"",control:"number"};
  spec.inputs.push(item);(spec.scenarios||[]).forEach(scenario=>{scenario.values= scenario.values||{};scenario.values[key]=item.default;});renderMakerPreview(definition);
 });
 add.disabled=spec.inputs.length>=24;section.appendChild(add);host.appendChild(section);
}
function renderManualV2GroupEditor(host,definition){
 const spec=definition.spec,section=document.createElement("section");section.className="ugc-maker-v2-groups";
 section.appendChild(text("h3","ugc-maker-schema-heading","Typed dynamic groups"));
 section.appendChild(text("p","ugc-maker-schema-summary","Repeated rows may contain number, boolean, enum or date fields. Formulas can aggregate numeric fields and use typed row values in sum_if/count_if conditions. Up to 4 groups, 20 rows and 6 fields per group."));
 spec.groups.forEach((group,index)=>{
  const card=document.createElement("fieldset");card.className="ugc-maker-schema-group ugc-maker-dynamic-group-editor";
  card.appendChild(text("legend","","Group "+(index+1)));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addText=(name,value,onChange,max=60)=>{const label=document.createElement("label");label.textContent=name;const input=document.createElement("input");input.type="text";input.maxLength=max;input.value=String(value??"");input.addEventListener("input",()=>{onChange(input.value);refreshMakerValidationNote();refreshMakerTestIfOpen();});label.appendChild(input);grid.appendChild(label);return input;};
  const oldKey=group.key;const key=addText("Group key",group.key,()=>{},32);key.pattern="[a-z][a-z0-9_]{0,31}";
  key.addEventListener("change",()=>{const next=key.value.trim();
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(next)||spec.groups.some((other,i)=>i!==index&&other.key===next)||spec.inputs.some(item=>item.key===next)||spec.results.some(item=>item.key===next)){key.value=group.key;makerStatus("Group keys must be unique lowercase identifiers.","error");return;}
   if(next!==oldKey){spec.results.forEach(result=>{result.expression=String(result.expression||"").replace(new RegExp("\\b"+oldKey+"\\.","g"),next+".");});group.key=next;renderMakerPreview(definition);}
  });
  addText("Group label",group.label,value=>{group.label=value.slice(0,60);});
  addText("Row label",group.itemLabel||"Item",value=>{group.itemLabel=value.slice(0,40);},40);
  [["Minimum rows","minItems",1],["Maximum rows","maxItems",20]].forEach(([label,key,maximum])=>{
   const wrapper=document.createElement("label");wrapper.textContent=label;const input=document.createElement("input");input.type="number";input.min=key==="minItems"?"1":String(group.minItems||1);input.max="20";input.step="1";input.value=String(group[key]??(key==="minItems"?1:10));
   input.addEventListener("input",()=>{if(Number.isInteger(Number(input.value)))group[key]=Number(input.value);refreshMakerValidationNote();});wrapper.appendChild(input);grid.appendChild(wrapper);
  });
  card.appendChild(grid);
  group.fields.forEach((field,fieldIndex)=>{
   const fieldCard=document.createElement("fieldset");fieldCard.className="ugc-maker-dynamic-field-editor";
   fieldCard.appendChild(text("legend","","Field "+(fieldIndex+1)));
   const fieldGrid=document.createElement("div");fieldGrid.className="ugc-maker-input-grid";
   const addFieldText=(name,value,onChange,max=60)=>{const label=document.createElement("label");label.textContent=name;const input=document.createElement("input");input.type="text";input.maxLength=max;input.value=String(value??"");input.addEventListener("input",()=>{onChange(input.value);refreshMakerValidationNote();refreshMakerTestIfOpen();});label.appendChild(input);fieldGrid.appendChild(label);return input;};
   const oldFieldKey=field.key;const fieldKey=addFieldText("Field key",field.key,()=>{},32);fieldKey.pattern="[a-z][a-z0-9_]{0,31}";
   fieldKey.addEventListener("change",()=>{const next=fieldKey.value.trim();
    const collision=group.fields.some((other,i)=>i!==fieldIndex&&other.key===next)||spec.inputs.some(item=>item.key===next)||spec.results.some(item=>item.key===next)||spec.groups.some((other,i)=>i!==index&&other.key===next);
    if(!/^[a-z][a-z0-9_]{0,31}$/.test(next)||collision){fieldKey.value=field.key;makerStatus("Dynamic field keys must be unique lowercase identifiers.","error");return;}
    if(next!==oldFieldKey){const pattern=new RegExp("\\b"+group.key+"\\."+oldFieldKey+"\\b","g");spec.results.forEach(result=>{result.expression=String(result.expression||"").replace(pattern,group.key+"."+next);});field.key=next;renderMakerPreview(definition);}
   });
   addFieldText("Field label",field.label,value=>{field.label=value.slice(0,60);});
   const typeLabel=document.createElement("label");typeLabel.appendChild(text("span","","Field type"));const type=document.createElement("select");
   [["number","Number"],["boolean","Boolean"],["enum","Enum"],["date","Date"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;type.appendChild(option);});
   type.value=field.type||"number";
   type.addEventListener("change",()=>{const key=field.key,label=field.label,next=type.value;let replacement;
    if(next==="boolean")replacement={key,label,type:"boolean",default:false};
    else if(next==="enum")replacement={key,label,type:"enum",default:"option_1",choices:[{label:"Option 1",value:"option_1"},{label:"Option 2",value:"option_2"}]};
    else if(next==="date")replacement={key,label,type:"date",default:"2026-01-01"};
    else replacement={key,label,type:"number",min:0,max:100,default:0,step:1,unit:""};
    Object.keys(field).forEach(property=>delete field[property]);Object.assign(field,replacement);renderMakerPreview(definition);
   });
   typeLabel.appendChild(type);fieldGrid.appendChild(typeLabel);
   if(field.type==="number"){
    [["Default","default"],["Minimum","min"],["Maximum","max"],["Step","step"]].forEach(([label,key])=>{const wrapper=document.createElement("label");wrapper.textContent=label;const input=document.createElement("input");input.type="number";input.step="any";input.value=String(field[key]??0);input.addEventListener("input",()=>{if(input.value!==""&&Number.isFinite(Number(input.value)))field[key]=Number(input.value);refreshMakerValidationNote();refreshMakerTestIfOpen();});wrapper.appendChild(input);fieldGrid.appendChild(wrapper);});
    addFieldText("Unit",field.unit||"",value=>{field.unit=value.slice(0,16);},16);
   }else if(field.type==="boolean"){
    const wrapper=document.createElement("label"),input=document.createElement("input");input.type="checkbox";input.checked=field.default===true;input.addEventListener("change",()=>{field.default=input.checked;refreshMakerValidationNote();});wrapper.append(input,text("span","","Default enabled"));fieldGrid.appendChild(wrapper);
   }else if(field.type==="enum"){
    const wrapper=document.createElement("label");wrapper.appendChild(text("span","","Enum options · Label = value"));const textarea=document.createElement("textarea");textarea.rows=3;textarea.value=(field.choices||[]).map(choice=>choice.label+" = "+choice.value).join("\n");
    textarea.addEventListener("change",()=>{const parsed=parseTypedChoices(textarea.value,"enum");if(!parsed.valid){makerStatus(parsed.error,"error");return;}field.choices=parsed.choices;if(!parsed.choices.some(choice=>choice.value===field.default))field.default=parsed.choices[0].value;renderMakerPreview(definition);});
    wrapper.appendChild(textarea);fieldGrid.appendChild(wrapper);addFieldText("Default enum value",field.default,value=>{field.default=value;});
   }else{
    const wrapper=document.createElement("label");wrapper.textContent="Default date";const input=document.createElement("input");input.type="date";input.value=field.default||"2026-01-01";input.addEventListener("change",()=>{field.default=input.value;refreshMakerValidationNote();refreshMakerTestIfOpen();});wrapper.appendChild(input);fieldGrid.appendChild(wrapper);
    [["Minimum date","minDate"],["Maximum date","maxDate"]].forEach(([label,key])=>{const w=document.createElement("label");w.textContent=label;const d=document.createElement("input");d.type="date";d.value=field[key]||"";d.addEventListener("change",()=>{if(d.value)field[key]=d.value;else delete field[key];refreshMakerValidationNote();});w.appendChild(d);fieldGrid.appendChild(w);});
   }
   const remove=button("Remove field","ugc-manual-remove",()=>{if(group.fields.length<=1)return;group.fields.splice(fieldIndex,1);renderMakerPreview(definition);});remove.disabled=group.fields.length<=1;fieldGrid.appendChild(remove);
   fieldCard.appendChild(fieldGrid);card.appendChild(fieldCard);
  });
  const addField=button("＋ Add field","ugc-action-secondary",()=>{if(group.fields.length>=6)return;let n=1,key="field_"+n;while(group.fields.some(field=>field.key===key))key="field_"+(++n);group.fields.push({key,label:"New field",type:"number",min:0,max:100,default:0,step:1,unit:""});renderMakerPreview(definition);});
  addField.disabled=group.fields.length>=6;card.appendChild(addField);
  card.appendChild(button("Remove group","ugc-manual-remove",()=>{spec.groups.splice(index,1);renderMakerPreview(definition);}));
  section.appendChild(card);
 });
 const addGroup=button("＋ Add typed group","ugc-action-secondary",()=>{if(spec.groups.length>=4)return;let n=1,key="items_"+n;while(spec.groups.some(group=>group.key===key))key="items_"+(++n);spec.groups.push({key,label:"Items",itemLabel:"Item",minItems:1,maxItems:10,fields:[{key:"amount",label:"Amount",type:"number",min:0,max:100,default:0,step:1,unit:""}]});renderMakerPreview(definition);});
 addGroup.disabled=spec.groups.length>=4;section.appendChild(addGroup);host.appendChild(section);
}
function renderManualV2ScenarioEditor(host,definition){
 const spec=definition.spec,section=document.createElement("section");section.className="ugc-maker-v2-scenarios";
 section.appendChild(text("h3","ugc-maker-schema-heading","Typed what-if scenarios"));
 section.appendChild(text("p","ugc-maker-schema-summary","Scenarios override fixed typed inputs and recompute every numeric result. Up to three alternatives."));
 spec.scenarios.forEach((scenario,index)=>{
  if(!scenario.values||typeof scenario.values!=="object")scenario.values={};
  const card=document.createElement("fieldset");card.className="ugc-maker-scenario-editor";card.appendChild(text("legend","","Scenario "+(index+1)));
  const name=document.createElement("input");name.type="text";name.maxLength=50;name.value=String(scenario.label||"Alternative "+(index+1));
  const nameLabel=document.createElement("label");nameLabel.textContent="Scenario name";name.addEventListener("input",()=>{scenario.label=name.value.slice(0,50);refreshMakerValidationNote();});nameLabel.appendChild(name);card.appendChild(nameLabel);
  const grid=document.createElement("div");grid.className="ugc-maker-scenario-grid";
  spec.inputs.forEach(input=>{
   if(!Object.prototype.hasOwnProperty.call(scenario.values,input.key))scenario.values[input.key]=typedDefaultForField(input);
   const label=document.createElement("label");label.appendChild(text("span","",input.label||input.key));
   const control=createTypedEditorControl(input,scenario.values[input.key]);control.addEventListener("change",()=>{scenario.values[input.key]=typedEditorValue(input,control);refreshMakerTestIfOpen();refreshMakerValidationNote();});
   control.addEventListener("input",()=>{scenario.values[input.key]=typedEditorValue(input,control);refreshMakerTestIfOpen();});
   label.appendChild(control);grid.appendChild(label);
  });
  card.appendChild(grid);card.appendChild(button("Remove scenario","ugc-manual-remove",()=>{spec.scenarios.splice(index,1);renderMakerPreview(definition);}));
  section.appendChild(card);
 });
 const add=button("＋ Add scenario","ugc-action-secondary",()=>{
  if(spec.scenarios.length>=3)return;
  spec.scenarios.push({label:"Alternative "+(spec.scenarios.length+1),values:Object.fromEntries(spec.inputs.map(input=>[input.key,typedDefaultForField(input)]))});
  renderMakerPreview(definition);
 });
 add.disabled=spec.scenarios.length>=3;section.appendChild(add);host.appendChild(section);
}
function renderManualV2ResultEditor(host,definition){
 const spec=definition.spec,section=document.createElement("section");section.className="ugc-maker-v2-results";
 section.appendChild(text("h3","ugc-maker-schema-heading","Numeric calculator results"));
 section.appendChild(text("p","ugc-maker-schema-summary","Final results must be finite numbers. Boolean, enum and date values can be used in conditions and intermediate formulas, but are not direct result display types."));
 spec.results.forEach((item,index)=>{
  if(!item.key)item.key="result_"+(index+1);
  const card=document.createElement("fieldset");card.className="ugc-maker-schema-group";card.appendChild(text("legend","","Result "+(index+1)));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addText=(name,value,onChange,max=280)=>{const label=document.createElement("label");label.textContent=name;const input=document.createElement("input");input.type="text";input.maxLength=max;input.value=String(value??"");input.addEventListener("input",()=>{onChange(input.value);refreshMakerTestIfOpen();refreshMakerValidationNote();});label.appendChild(input);grid.appendChild(label);return input;};
  const oldKey=item.key,key=addText("Result variable key",oldKey,()=>{},32);key.pattern="[a-z][a-z0-9_]{0,31}";
  key.addEventListener("change",()=>{const next=key.value.trim(),collision=spec.inputs.some(input=>input.key===next)||spec.groups.some(group=>group.key===next||(group.fields||[]).some(field=>field.key===next))||spec.results.some((other,i)=>i!==index&&other.key===next);
   if(!/^[a-z][a-z0-9_]{0,31}$/.test(next)||collision){key.value=item.key;makerStatus("Result keys must be unique lowercase identifiers.","error");return;}
   if(next!==oldKey){const pattern=new RegExp("\\b"+oldKey+"\\b","g");spec.results.forEach((result,i)=>{if(i>index)result.expression=String(result.expression||"").replace(pattern,next);});item.key=next;renderMakerPreview(definition);}
  });
  addText("Result label",item.label,value=>{item.label=value.slice(0,70);},70);
  const formula=document.createElement("label");formula.appendChild(text("span","","Typed formula"));
  const expression=document.createElement("textarea");expression.rows=3;expression.maxLength=500;expression.value=String(item.expression||"");expression.placeholder='Example: if(and(include_tax, eq(plan, "pro")), base_cost * 0.2, 0)';
  expression.addEventListener("input",()=>{item.expression=expression.value;refreshMakerTestIfOpen();refreshMakerValidationNote();});
  formula.appendChild(expression);formula.appendChild(createV2FormulaHelp(expression));grid.appendChild(formula);
  const explanation=document.createElement("label");explanation.appendChild(text("span","","What does this result mean?"));
  const detail=document.createElement("textarea");detail.rows=2;detail.maxLength=280;detail.value=String(item.explanation||"");detail.addEventListener("input",()=>{item.explanation=detail.value;});
  explanation.appendChild(detail);grid.appendChild(explanation);
  const formatLabel=document.createElement("label");formatLabel.textContent="Display format";const format=document.createElement("select");
  [["number","Number"],["currency","Currency"],["percent","Percent"],["unit","Number with unit"]].forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;format.appendChild(option);});
  format.value=item.format||"number";format.addEventListener("change",()=>{item.format=format.value;refreshMakerTestIfOpen();refreshMakerValidationNote();});formatLabel.appendChild(format);grid.appendChild(formatLabel);
  addText("Currency",item.currency||"EUR",value=>{item.currency=value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,3);},3);
  addText("Result unit",item.unit||"",value=>{item.unit=value.slice(0,20);},20);
  addText("Prefix",item.prefix||"",value=>{item.prefix=value.slice(0,12);},12);
  addText("Suffix",item.suffix||"",value=>{item.suffix=value.slice(0,16);},16);
  const actions=document.createElement("div");actions.className="ugc-maker-result-actions";
  actions.appendChild(button("Move up","ugc-manual-remove",()=>{if(index>0){[spec.results[index-1],spec.results[index]]=[spec.results[index],spec.results[index-1]];renderMakerPreview(definition);}}));
  actions.appendChild(button("Move down","ugc-manual-remove",()=>{if(index<spec.results.length-1){[spec.results[index+1],spec.results[index]]=[spec.results[index],spec.results[index+1]];renderMakerPreview(definition);}}));
  const remove=button("Remove result","ugc-manual-remove",()=>{if(spec.results.length<=1)return;spec.results.splice(index,1);renderMakerPreview(definition);});remove.disabled=spec.results.length<=1;actions.appendChild(remove);
  grid.appendChild(actions);card.appendChild(grid);section.appendChild(card);
 });
 const add=button("＋ Add result","ugc-action-secondary",()=>{if(spec.results.length>=20)return;let n=spec.results.length+1,key="result_"+n;while(spec.results.some(item=>item.key===key))key="result_"+(++n);spec.results.push({key,label:"New result",expression:String(spec.inputs[0]?.key||"1"),format:"number",explanation:""});renderMakerPreview(definition);});
 add.disabled=spec.results.length>=20;section.appendChild(add);host.appendChild(section);
}
function appendV2TestGroup(panel,group){
 const section=document.createElement("fieldset");section.className="ugc-dynamic-group";section.dataset.ugcV2GroupKey=group.key;section.appendChild(text("legend","",group.label||group.key));
 const rows=document.createElement("div");rows.className="ugc-dynamic-group-rows";
 const min=Math.max(1,Number(group.minItems)||1),max=Math.max(min,Math.min(20,Number(group.maxItems)||20));
 const notify=()=>updateMakerV2TestResults(panel);
 const refresh=()=>{Array.from(rows.children).forEach(row=>{const remove=row.querySelector("button");if(remove)remove.disabled=rows.children.length<=min;});add.disabled=rows.children.length>=max;};
 const addRow=(values={})=>{
  if(rows.children.length>=max)return;
  const row=document.createElement("div");row.className="ugc-dynamic-group-row";row.dataset.ugcV2GroupRow="";
  const fields=document.createElement("div");fields.className="ugc-dynamic-group-fields";
  group.fields.forEach(field=>{
   const label=document.createElement("label");label.textContent=field.label||field.key;
   const control=createTypedEditorControl(field,values[field.key]??typedDefaultForField(field));
   control.dataset.ugcV2GroupField=field.key;
   control.addEventListener("input",notify);control.addEventListener("change",notify);
   label.appendChild(control);fields.appendChild(label);
  });
  const remove=button("Remove "+String(group.itemLabel||"item").toLowerCase(),"ugc-manual-remove",()=>{if(rows.children.length<=min)return;row.remove();refresh();notify();});
  row.append(fields,remove);rows.appendChild(row);refresh();
 };
 for(let i=0;i<min;i++)addRow({});
 const add=button("＋ Add "+String(group.itemLabel||"item").toLowerCase(),"ugc-action-secondary",()=>{if(rows.children.length<max)addRow({});});
 section.append(rows,add);refresh();panel.appendChild(section);return section;
}
function renderMakerV2TestPanel(preserveValues){
 const panel=$("ugcMakerTestPanel"),spec=state.aiDraft?.spec;
 if(!panel||!Array.isArray(spec?.inputs)||!Array.isArray(spec?.results))return;
 const previous=new Map();
 if(preserveValues)panel.querySelectorAll("[data-ugc-maker-test-key]").forEach(control=>{previous.set(control.dataset.ugcMakerTestKey,typedEditorValue(spec.inputs.find(item=>item.key===control.dataset.ugcMakerTestKey)||{},control));});
 panel.replaceChildren();
 const heading=document.createElement("div");heading.className="ugc-maker-test-head";
 const intro=document.createElement("div");intro.append(text("h4","","Try typed V2 calculator"),text("p","","Change number, boolean, enum and date inputs. Formulas run locally in this browser; no request or CALC charge is made."));
 const reset=button("Reset values","ugc-maker-test-reset",()=>renderMakerV2TestPanel(false));heading.append(intro,reset);panel.appendChild(heading);
 const inputGrid=document.createElement("div");inputGrid.className="ugc-maker-test-inputs";
 spec.inputs.forEach(item=>{
  const label=document.createElement("label");label.className="ugc-maker-test-input";label.appendChild(text("span","",item.label||item.key));
  const control=createTypedEditorControl(item,previous.has(item.key)?previous.get(item.key):typedDefaultForField(item));
  control.dataset.ugcMakerTestKey=item.key;control.addEventListener("input",()=>updateMakerV2TestResults(panel));control.addEventListener("change",()=>updateMakerV2TestResults(panel));
  label.appendChild(control);if(item.unit)label.appendChild(text("small","",item.unit));inputGrid.appendChild(label);
 });
 panel.appendChild(inputGrid);
 (spec.groups||[]).forEach(group=>appendV2TestGroup(panel,group));
 panel.appendChild(text("h4","ugc-maker-test-results-heading","Live results"));
 const results=document.createElement("div");results.className="ugc-maker-test-results-grid";results.setAttribute("aria-live","polite");panel.appendChild(results);
 const status=text("p","ugc-maker-test-status","");status.setAttribute("role","status");status.setAttribute("aria-live","polite");panel.appendChild(status);
 panel.appendChild(text("p","ugc-maker-test-note","Free local test · No CALC is charged, no AI request is sent, and nothing is saved. V2 save/publish remains disabled."));
 updateMakerV2TestResults(panel);
}
function updateMakerV2TestResults(panel){
 const spec=state.aiDraft?.spec;if(!panel||Number(spec?.schemaVersion)!==2)return;
 const rawValues={};let invalidControl=null;
 panel.querySelectorAll("[data-ugc-maker-test-key]").forEach(control=>{
  const field=spec.inputs.find(item=>item.key===control.dataset.ugcMakerTestKey);
  if(!field)return;
  const value=typedEditorValue(field,control),normalized=normalizeTypedValue(field,value);
  if(!normalized.valid){control.setAttribute("aria-invalid","true");if(!invalidControl)invalidControl=control;}
  else{control.setAttribute("aria-invalid","false");rawValues[field.key]=normalized.value;}
 });
 const output=panel.querySelector(".ugc-maker-test-results-grid"),status=panel.querySelector(".ugc-maker-test-status");
 if(!output||!status)return;output.replaceChildren();
 if(invalidControl){status.textContent="Enter valid typed values within the allowed bounds and choices.";return;}
 const rawGroups={};
 (spec.groups||[]).forEach(group=>{
  const section=panel.querySelector('[data-ugc-v2-group-key="'+CSS.escape(group.key)+'"]');
  rawGroups[group.key]=Array.from(section?.querySelectorAll("[data-ugc-v2-group-row]")||[]).map(row=>{
   const value={};
   group.fields.forEach(field=>{
    const control=row.querySelector('[data-ugc-v2-group-field="'+CSS.escape(field.key)+'"]');
    value[field.key]=control?typedEditorValue(field,control):typedDefaultForField(field);
   });
   return value;
  });
 });
 const normalizedGroups=normalizeTypedGroupValues(spec,rawGroups);
 if(normalizedGroups.valid!==true){status.textContent=normalizedGroups.errors.slice(0,3).join(" ");return;}
 let formulaErrors=0;
 const render=(host,values,compact)=>{
  host.replaceChildren();
  try{
   evaluateV2TypedResults(spec,values,normalizedGroups.groups).results.forEach(result=>{
    const card=document.createElement(compact?"div":"article");card.className=compact?"ugc-maker-scenario-result":"ugc-maker-test-result";
    card.append(text("span","",result.label||"Result"),text(compact?"b":"strong","",formatResult(result.item||{},result.value,state.makerLocale==="auto"?"":(state.makerLocale||state.regionalDefaults?.locale||""))));
    if(!compact&&result.explanation)card.appendChild(text("small","ugc-result-explanation",result.explanation));host.appendChild(card);
   });
  }catch(error){formulaErrors++;const card=text(compact?"div":"article",compact?"ugc-maker-scenario-result is-error":"ugc-maker-test-result is-error","");card.append(text("span","","Calculation error"),text(compact?"b":"strong","","Cannot calculate"),text("small","",error?.message||"Check the formula."));host.appendChild(card);}
 };
 render(output,rawValues,false);
 panel.querySelector(".ugc-maker-scenario-comparisons")?.remove();
 if(spec.scenarios?.length){
  const section=document.createElement("section");section.className="ugc-maker-scenario-comparisons";section.appendChild(text("h4","ugc-maker-test-results-heading","Compare scenarios"));
  [{label:"Current test values",values:rawValues},...spec.scenarios.map(item=>({label:item.label,values:{...rawValues,...item.values}}))].forEach(scenario=>{
   const group=document.createElement("article");group.className="ugc-maker-scenario-result-group";group.appendChild(text("strong","",scenario.label||"Alternative"));
   const grid=document.createElement("div");grid.className="ugc-maker-scenario-result-grid";render(grid,scenario.values,true);group.appendChild(grid);section.appendChild(group);
  });
  panel.insertBefore(section,status);
 }
 const validation=validateManualDraftSpec(spec);
 status.textContent=formulaErrors?"One or more formulas could not be evaluated. Check the highlighted results."
  :validation.errors.length?"Local calculation ran, but validation needs attention: "+validation.errors.slice(0,2).join(" ")
  :"Typed values, formulas, unit compatibility and default boundaries passed local checks.";
}
function createV2FormulaHelp(textarea){
 const details=document.createElement("details");details.className="ugc-v2-formula-help";
 details.appendChild(text("summary","","Formula autocomplete & function reference"));
 const list=document.createElement("div");list.className="ugc-v2-formula-suggestions";
 const functions=calculatorEngine.getV2FunctionHelp();
 functions.forEach(item=>{
  const entry=document.createElement("div");entry.className="ugc-v2-formula-suggestion";
  const insert=button(item.name+"()","ugc-v2-formula-insert",()=>{
   const start=Number.isInteger(textarea.selectionStart)?textarea.selectionStart:textarea.value.length;
   const end=Number.isInteger(textarea.selectionEnd)?textarea.selectionEnd:start;
   const snippet=item.name+"(";
   const value=textarea.value;
   textarea.value=value.slice(0,start)+snippet+value.slice(end);
   const caret=start+snippet.length;
   textarea.focus();textarea.setSelectionRange(caret,caret);
   textarea.dispatchEvent(new Event("input",{bubbles:true}));
  });
  insert.title=item.signature+" — "+item.description;
  const meta=text("span","ugc-v2-formula-signature",item.signature);
  const description=text("span","ugc-v2-formula-description",item.description);
  entry.append(insert,meta,description);list.appendChild(entry);
 });
 details.appendChild(list);
 const note=text("p","ugc-v2-formula-note","Select a function to insert its name at the cursor, then complete the arguments. Function help is shared with the V2 engine registry.");
 details.appendChild(note);
 return details;
}
function renderManualV2Preview(host,definition){
 const spec=definition.spec;
 host.appendChild(text("h3","ugc-maker-schema-heading","Typed V2 definition"));
 host.appendChild(text("p","ugc-maker-schema-summary","Typed V2 supports number, boolean, enum and date values, typed repeated groups, conditional formulas and what-if scenarios. The connected database is checked separately before V2 Save or Publish can be enabled."));
 const persistenceNote=text("p","ugc-maker-schema-summary",state.v2PersistenceAvailable
  ?"V2 save and publish are enabled in this database. The independent PostgreSQL validator checks every save and publish operation."
  :"V2 remains local-only in this database. Save and Publish stay disabled until the V2 persistence migration is installed.");
 persistenceNote.id="ugcMakerV2PersistenceNote";host.appendChild(persistenceNote);
 renderManualV2InputEditor(host,definition);
 renderManualV2GroupEditor(host,definition);
 renderManualV2ScenarioEditor(host,definition);
 renderManualV2ResultEditor(host,definition);
 const testPanel=document.createElement("section");testPanel.id="ugcMakerTestPanel";testPanel.className="ugc-maker-test-panel";testPanel.hidden=true;
 const toggle=button("▶ Test typed V2 calculator","ugc-maker-test-toggle",()=>{
  testPanel.hidden=!testPanel.hidden;toggle.setAttribute("aria-expanded",String(!testPanel.hidden));toggle.textContent=testPanel.hidden?"▶ Test typed V2 calculator":"▾ Hide test";
  if(!testPanel.hidden)renderMakerV2TestPanel(false);
 });
 toggle.setAttribute("aria-expanded","false");host.append(toggle,testPanel);
 host.appendChild(text("p","ugc-maker-schema-summary","Allowed V2 formulas include strict boolean logic, typed enum/date comparisons, calendar functions, same-group statistical aggregation, financial functions and dimensional numeric formulas. Use Formula autocomplete for signatures and examples. Arbitrary JavaScript is never executed."));
 refreshMakerValidationNote();
 updateV2PersistenceControls();
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
 const typedV2=Number(definition.spec?.schemaVersion)===2;
 if(manual||typedV2){
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
  renderManualSchemaVersionControl(host,definition);
 }else{
  const selected=document.createElement("div");selected.className="ugc-maker-ai-categories";
  selected.appendChild(text("strong","","AI-selected categories"));
  getCategoryLabels({category:definition.category,subcategories:definition.spec?.subcategories||definition.subcategories||[]}).forEach(label=>selected.appendChild(text("span","ugc-subcategory-chip",label)));
  host.appendChild(selected);
 }
 const summary=text("p","ugc-maker-schema-summary",manual||typedV2
  ?(definition.spec?.inputs?.length||0)+" / 24 fixed inputs · "+(definition.spec?.groups?.length||0)+" / 4 dynamic groups · "+(definition.spec?.results?.length||0)+" / 20 results · typed value, formula and dimensional checks"
  :(definition.spec?.inputs?.length||0)+" / 16 inputs · "+(definition.spec?.results?.length||0)+" / 10 results · restricted formula language");
 host.appendChild(summary);
 if(state.editingId&&!manual)host.appendChild(text("p","ugc-maker-schema-summary","This is an AI improvement of your existing calculator. Its title, category, purpose and description are locked."));
 if(typedV2){renderManualV2Preview(host,definition);return;}
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
  formulaInput.parentElement?.appendChild(createV2FormulaHelp(formulaInput));
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
  const targetSchemaVersion=state.editingId?1:Number($("ugcMakerTargetSchemaVersion")?.value||1);
  const payload=state.editingId?{mode:"refine",calculator_id:state.editingId,prompt}:{mode:"create",prompt,schema_version:targetSchemaVersion};
  const response=await fetch("/api/ugc-maker",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+state.session.access_token,"Accept":"application/json"},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.success)throw new Error(data?.error||"The AI calculator maker is unavailable.");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(data.operation_id||""))){
   throw new Error("The AI operation could not be verified. No calculator draft was accepted.");
  }
  const returnedSchemaVersion=Number(data.calculator?.spec?.schemaVersion||1);
  if(returnedSchemaVersion!==targetSchemaVersion)throw new Error("The AI returned a calculator schema that does not match the selected version. No draft was accepted.");
  state.aiOperationId=String(data.operation_id);
  state.aiDraft=data.calculator;
  state.regionalDefaults=data.regionalDefaults||null;
  state.makerLocale=state.regionalDefaults?.locale||"auto";
  renderMakerPreview(state.aiDraft);
  makerStatus(targetSchemaVersion===2
   ?"Typed V2 AI generation passed server schema, formula, unit and default-value validation. The AI operation used the normal CALC charge and daily allowance. Review assumptions and test locally; "+(state.v2PersistenceAvailable?"V2 saving and publishing are enabled by this database.":"V2 Save and Publish remain disabled until the connected database advertises V2 persistence.")
   :state.editingId?"AI improvement generated. Review the improved inputs and formulas, then save the update.":"Preview generated. Review the title, description and formulas before saving.");
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
 const typedV2=Number(state.aiDraft?.spec?.schemaVersion)===2;
 if(!state.aiDraft||!requireAccount()||!verifyConfirmed())return;
 if(typedV2&&state.v2PersistenceAvailable!==true){
  if(!await refreshUGCSchemaCapabilities()){
   makerStatus("Typed V2 is still local-only in the connected database. Its V2 persistence migration has not been detected, so nothing was saved or published.","error");
   return;
  }
 }
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
 const validation=typedV2?validateManualDraftSpec(specToSave):validateMakerSpec(specToSave);
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
 state.creationSource="manual";state.aiOperationId="";state.manualMode="quick";state.manualTemplateKey="simple-cost";
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
  if(state.userId){void loadCatalog();void loadCreatorLeaderboards();void refreshUGCSchemaCapabilities();}
  else{
   state.v2PersistenceAvailable=false;state.v2CapabilitiesChecked=true;state.v2CapabilitiesRequest++;
   updateV2PersistenceControls();
   state.catalog=[];renderCatalog([]);status("Sign in to browse, create and use community calculators.");state.creatorRequest++;state.creatorData=null;renderCreatorLeaderboards(null,"Sign in to discover creators and other community members.");
  }
 });
 if(state.userId)await Promise.all([loadCatalog(),loadCreatorLeaderboards(),refreshUGCSchemaCapabilities()]);else{status("Sign in to browse, create and use community calculators.");renderCreatorLeaderboards(null,"Sign in to discover creators and other community members.");}
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