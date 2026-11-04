/* Worth It UGC calculators: AI-generated declarative formulas, catalogue, profiles and billing. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const sb=()=>window.supabaseClient||null;
const MAX_CALCULATORS=10;
const PERIODS=[
 {value:"today",label:"Today"},{value:"7d",label:"Last 7 days"},{value:"14d",label:"Last 14 days"},
 {value:"1m",label:"Last month"},{value:"3m",label:"Last 3 months"},{value:"6m",label:"Last 6 months"},
 {value:"12m",label:"Last 12 months"},{value:"3y",label:"Last 3 years"},{value:"6y",label:"Last 6 years"},
 {value:"12y",label:"Last 12 years"}
];
const SORTS=["latest","popular","liked","favorited","disliked","mine"];
let state={userId:"",session:null,sort:"latest",period:"12y",search:"",catalog:[],myCalculators:[],activeId:"",activeCalculator:null,detailRequest:0,catalogRequest:0,aiDraft:null,editingId:null};
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
 if(node)node.textContent=state.sort==="mine"?"My Calculators":
  ({latest:"Latest calculators",popular:"Most popular",liked:"Most liked",favorited:"Most favorited",disliked:"Most disliked"}[state.sort]||"Community calculators");
}
function renderCatalog(rows){
 const host=$("ugcCalculatorGrid");if(!host)return;
 host.replaceChildren();
 if(!Array.isArray(rows)||!rows.length){host.appendChild(text("p","ugc-empty",state.sort==="mine"?"You have not created any calculators yet.":"No community calculators match this filter yet."));return;}
 rows.forEach(item=>{
  const card=document.createElement("article");
  card.className="calc-card ugc-calculator-card";
  card.dataset.calculatorOrigin="ugc";
  card.dataset.ugcId=String(item.id||"");
  const head=document.createElement("div");head.className="ugc-card-head";
  const publicNumber=Number(item.calculator_number);
  if(Number.isSafeInteger(publicNumber)&&publicNumber>=51)head.appendChild(text("span","ugc-number","#"+publicNumber));
  head.appendChild(text("span","ugc-category",String(item.category||"other").replace(/^\w/,c=>c.toUpperCase())));
  if(state.sort==="mine")head.appendChild(text("span","ugc-state",item.status==="published"?"Published":"Draft"));
  card.appendChild(head);
  card.appendChild(text("h3","ugc-card-title",item.title||"Untitled calculator"));
  card.appendChild(text("p","ugc-card-description",item.description||"No description provided."));
  const owner=text("a","ugc-card-owner",item.owner_display_name||item.owner_username||"Worth It member");
  if(item.owner_worth_it_id)owner.href="/profile/"+item.owner_worth_it_id;else owner.href="#";
  owner.addEventListener("click",event=>{if(!item.owner_worth_it_id)event.preventDefault();});
  card.appendChild(owner);
  if(state.sort==="mine"){
   const actions=document.createElement("div");actions.className="ugc-card-actions";
   actions.append(
    button("Edit","ugc-action-secondary",()=>editCalculator(item.id)),
    ...(item.status==="published"?[]:[button("Publish","ugc-action-primary",()=>publishCalculator(item.id))]),
    button("Delete","ugc-action-danger",()=>deleteCalculator(item.id))
   );
   card.appendChild(actions);
  }else{
   const stats=document.createElement("div");stats.className="ugc-card-stats";
   stats.append(text("span","", "◉ "+Number(item.views||0)),text("span","","♥ "+Number(item.likes||0)),text("span","","★ "+Number(item.favorites||0)),text("span","","▼ "+Number(item.dislikes||0)));
   card.appendChild(stats);
   const actions=document.createElement("div");actions.className="ugc-card-actions";
   actions.append(
    button("♡ Like","ugc-action-secondary",()=>react(item.id,"like")),
    button("♧ Dislike","ugc-action-secondary",()=>react(item.id,"dislike")),
    button("Open calculator →","ugc-action-primary",()=>window.openWorthItUGCCalculator(item.id))
   );
   card.appendChild(actions);
  }
  host.appendChild(card);
 });
 window.refreshWorthItCommunityFeatures?.();
}
async function loadCatalog(){
 if(!state.userId){status("Sign in to browse community-created calculators.");renderCatalog([]);return;}
 const request=++state.catalogRequest;
 status("Loading community calculators…");
 updateCatalogHeading();
 try{
  if(state.sort==="mine"){
   const result=await sb().rpc("get_worth_it_my_ugc_calculators",{p_search:state.search});
   if(result.error)throw result.error;
   if(request!==state.catalogRequest)return;
   state.myCalculators=Array.isArray(result.data)?result.data:[];
   renderCatalog(state.myCalculators);
   status(state.myCalculators.length+" of "+MAX_CALCULATORS+" personal calculator slots used.");
   return;
  }
  const result=await sb().rpc("get_worth_it_ugc_catalog",{
   p_sort:state.sort,p_period:state.period,p_search:state.search,p_limit:40,p_offset:0
  });
  if(result.error)throw result.error;
  if(request!==state.catalogRequest)return;
  state.catalog=Array.isArray(result.data)?result.data:[];
  renderCatalog(state.catalog);
  status(state.catalog.length+" community calculator"+(state.catalog.length===1?"":"s")+" found.");
 }catch(error){
  if(request!==state.catalogRequest)return;
  renderCatalog([]);
  const message=String(error?.message||error?.details||"");
  if(/get_worth_it_ugc_catalog|get_worth_it_my_ugc_calculators|schema cache|does not exist|could not find/i.test(message)){
   status("The UGC database migration is not installed in this Preview environment yet.",true);
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
 host.appendChild(button("Calculate · 0.1 CALC","ugc-action-primary ugc-calculate-button",()=>runCalculation(calculator)));
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
  const reserve=await sb().rpc("calc_wallet_reserve",{p_request_id:requestId,p_reason:"calculator"});
  if(reserve.error)throw reserve.error;
  if(!reserve.data?.ok){
   if(reserve.data?.code==="INSUFFICIENT_CALC")throw new Error("Not enough CALC. Visit Web Shop or collect your daily reward.");
   throw new Error("Could not reserve CALC for this calculation.");
  }
  reserved=true;
  const results=(calculator.spec.results||[]).map(item=>{
   const ast=compileExpression(item.expression,new Set(inputs.map(input=>input.key)));
   return {label:item.label,value:formatResult(item,evaluate(ast,values))};
  });
  const settle=await sb().rpc("calc_wallet_settle",{p_request_id:requestId});
  if(settle.error||!settle.data?.ok)throw new Error("The calculation finished, but its CALC transaction could not be confirmed.");
  reserved=false;
  renderCalculationResults(results);
  detailStatus("Calculation complete. 0.1 CALC was charged.",false);
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
function detailShow(calculator,fromUrl){
 state.activeCalculator=calculator;state.activeId=String(calculator.id);
 const title=$("ugcDetailTitle"),description=$("ugcDetailDescription"),owner=$("ugcDetailOwner"),stats=$("ugcDetailStats");
 const kicker=$("ugcDetailKicker"),publicNumber=Number(calculator.calculator_number);
 if(kicker)kicker.textContent=Number.isSafeInteger(publicNumber)&&publicNumber>=51?"WORTH IT COMMUNITY · CALCULATOR #"+publicNumber:"WORTH IT COMMUNITY";
 if(title)title.textContent=calculator.title||"Community calculator";
 if(description)description.textContent=calculator.description||"No description provided.";
 if(owner){
  owner.textContent=calculator.owner_display_name||calculator.owner_username||"Worth It member";
  owner.href=calculator.owner_worth_it_id?"/profile/"+calculator.owner_worth_it_id:"#";
 }
 if(stats)stats.textContent="♥ "+Number(calculator.likes||0)+" likes · ★ "+Number(calculator.favorites||0)+" favourites · ◉ "+Number(calculator.views||0)+" views";
 $("ugcDetailEditDescription")?.classList.toggle("hidden",calculator.is_owner!==true);
 const editor=$("ugcDetailDescriptionEditor");
 if(editor){editor.hidden=calculator.is_owner!==true;$("ugcDetailDescriptionInput").value=calculator.description||"";}
 const badges=$("ugcDetailOwnerBadges");if(badges)badges.replaceChildren();
 renderCalculatorForm(calculator);
 $("ugcDetailResults")?.replaceChildren();
 detailStatus("Enter your values and calculate when ready.");
 const section=$("ugcDetailSection");if(section)section.hidden=false;
 const home=$("homePage");if(home)home.style.display="none";
 window.scrollTo({top:0,behavior:"auto"});
 window.recordWorthItUgcView?.(calculator.id);
}
async function openDetail(id,options){
 if(!requireAccount())return;
 const request=++state.detailRequest;
 detailStatus("Loading calculator…");
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
 const section=$("ugcDetailSection");if(section)section.hidden=true;
 const home=$("homePage");if(home)home.style.display="block";
 if(window.location.pathname.startsWith("/calculator/ugc/"))window.history.pushState({worthItRoute:true},"","/calculators");
};
async function react(id,reaction){
 if(!requireAccount())return;
 try{
  const result=await sb().rpc("set_worth_it_ugc_reaction",{p_id:id,p_reaction:reaction});
  if(result.error)throw result.error;
  await loadCatalog();
  if(state.activeId===String(id))await openDetail(id,{fromUrl:true});
 }catch(error){toast(error?.message||"Could not save your reaction.");}
}
async function saveDescription(){
 const calculator=state.activeCalculator;if(!calculator||calculator.is_owner!==true)return;
 const description=String($("ugcDetailDescriptionInput")?.value||"").trim();
 if(description.length>500){detailStatus("Description can contain up to 500 characters.",true);return;}
 try{
  const result=await sb().rpc("save_worth_it_ugc_calculator",{
   p_id:calculator.id,p_title:calculator.title,p_description:description,p_category:calculator.category,p_spec:calculator.spec
  });
  if(result.error)throw result.error;
  calculator.description=description;
  if($("ugcDetailDescription"))$("ugcDetailDescription").textContent=description||"No description provided.";
  detailStatus("Your calculator description was saved.");
  await loadCatalog();
 }catch(error){detailStatus(error?.message||"Could not save the calculator description.",true);}
}
async function editCalculator(id){
 if(!requireAccount()||!verifyConfirmed())return;
 const result=await sb().rpc("get_worth_it_ugc_calculator",{p_id:id});
 if(result.error){status("Could not load this calculator for editing.",true);return;}
 const calculator=normalizeObject(result.data);
 if(!calculator||calculator.is_owner!==true){status("You can edit only your own calculators.",true);return;}
 state.editingId=id;
 openMaker();
 const modal=$("ugcMakerModal");
 modal.querySelector("[name=prompt]").value="";
 $("ugcMakerTitle").value=calculator.title;
 $("ugcMakerDescription").value=calculator.description||"";
 $("ugcMakerCategory").value=calculator.category;
 state.aiDraft={title:calculator.title,description:calculator.description||"",category:calculator.category,spec:calculator.spec};
 renderMakerPreview(state.aiDraft);
 $("ugcMakerStatus").textContent="Editing your saved calculator.";
}
async function publishCalculator(id){
 if(!requireAccount()||!verifyConfirmed())return;
 if(!window.confirm("Publish this calculator to the Worth It Community?"))return;
 try{
  const result=await sb().rpc("publish_worth_it_ugc_calculator",{p_id:id});
  if(result.error)throw result.error;
  toast("Your calculator is now published.");
  await loadCatalog();
 }catch(error){status(error?.message||"Could not publish this calculator.",true);}
}
async function deleteCalculator(id){
 if(!requireAccount())return;
 if(!window.confirm("Delete this calculator permanently?"))return;
 try{
  const result=await sb().rpc("delete_worth_it_ugc_calculator",{p_id:id});
  if(result.error)throw result.error;
  toast("Calculator deleted.");
  await loadCatalog();
 }catch(error){status(error?.message||"Could not delete this calculator.",true);}
}
function openMaker(){
 if(!requireAccount()||!verifyConfirmed())return;
 const modal=$("ugcMakerModal");if(!modal)return;
 modal.hidden=false;modal.setAttribute("aria-hidden","false");
 document.body.classList.add("ugc-maker-open");
 void refreshCreationQuota();
 $("ugcMakerPrompt")?.focus();
}
function closeMaker(){
 const modal=$("ugcMakerModal");if(modal){modal.hidden=true;modal.setAttribute("aria-hidden","true");}
 document.body.classList.remove("ugc-maker-open");
}
function renderMakerPreview(definition){
 const host=$("ugcMakerPreview");if(!host)return;
 host.replaceChildren();
 if(!definition){host.hidden=true;return;}
 host.hidden=false;
 const fields=document.createElement("div");fields.className="ugc-maker-edit-grid";
 const title=document.createElement("label");title.textContent="Calculator title";
 const titleInput=document.createElement("input");titleInput.id="ugcMakerTitle";titleInput.maxLength=70;titleInput.value=definition.title||"";title.appendChild(titleInput);
 const category=document.createElement("label");category.textContent="Category";
 const select=document.createElement("select");select.id="ugcMakerCategory";
 [["cars","Cars"],["money","Money"],["technology","Technology"],["home","Home"],["other","Other"]].forEach(([v,l])=>{const opt=document.createElement("option");opt.value=v;opt.textContent=l;select.appendChild(opt);});
 select.value=definition.category||"other";category.appendChild(select);
 const desc=document.createElement("label");desc.textContent="Description (optional)";
 const descInput=document.createElement("textarea");descInput.id="ugcMakerDescription";descInput.maxLength=500;descInput.rows=3;descInput.value=definition.description||"";desc.appendChild(descInput);
 fields.append(title,category,desc);host.appendChild(fields);
 const summary=text("p","ugc-maker-schema-summary",(definition.spec?.inputs?.length||0)+" inputs · "+(definition.spec?.results?.length||0)+" results · formulas use a restricted arithmetic language");
 host.appendChild(summary);
 host.appendChild(text("h3","ugc-maker-schema-heading","Calculator inputs"));
 (definition.spec?.inputs||[]).forEach((item,index)=>{
  const group=document.createElement("fieldset");group.className="ugc-maker-schema-group";
  group.appendChild(text("legend","","Input "+(index+1)+" · "+item.key));
  const grid=document.createElement("div");grid.className="ugc-maker-input-grid";
  const addInput=(labelText,type,value,onChange)=>{
   const label=document.createElement("label");label.textContent=labelText;
   const input=document.createElement("input");input.type=type;input.value=String(value??"");
   if(type==="number")input.step="any";
   input.addEventListener("input",()=>onChange(input.value));
   label.appendChild(input);grid.appendChild(label);
  };
  addInput("Label","text",item.label,value=>{item.label=String(value).trim().slice(0,60);});
  addInput("Default value","number",item.default,value=>{if(value!==""&&Number.isFinite(Number(value)))item.default=Number(value);});
  addInput("Minimum","number",item.min,value=>{if(value!==""&&Number.isFinite(Number(value)))item.min=Number(value);});
  addInput("Maximum","number",item.max,value=>{if(value!==""&&Number.isFinite(Number(value)))item.max=Number(value);});
  addInput("Step","number",item.step||1,value=>{if(value!==""&&Number.isFinite(Number(value)))item.step=Number(value);});
  addInput("Unit (optional)","text",item.unit||"",value=>{item.unit=String(value).trim().slice(0,16);});
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
   input.addEventListener("input",()=>onChange(input.value));
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
  formatSelect.addEventListener("change",()=>{item.format=formatSelect.value;});
  formatLabel.appendChild(formatSelect);grid.appendChild(formatLabel);
  addInput("Currency (ISO code)","text",item.currency||"EUR",value=>{item.currency=String(value).toUpperCase().slice(0,3);});
  group.appendChild(grid);host.appendChild(group);
 });
 host.appendChild(text("p","ugc-maker-schema-summary","Allowed formulas: +, −, ×, ÷, powers, parentheses and min, max, abs, round, floor, ceil, sqrt, pow. Arbitrary JavaScript is never run."));
 const saveButton=$("ugcMakerSave"),publishButton=$("ugcMakerPublish");
 if(saveButton)saveButton.disabled=false;
 if(publishButton)publishButton.disabled=false;
}
async function generateWithAI(){
 if(!requireAccount()||!verifyConfirmed())return;
 const prompt=String($("ugcMakerPrompt")?.value||"").trim();
 if(prompt.length<10||prompt.length>900){$("ugcMakerStatus").textContent="Describe your calculator in 10 to 900 characters.";return;}
 const button=$("ugcMakerGenerate");button.disabled=true;
 $("ugcMakerStatus").textContent="Worth It AI is designing your calculator…";
 $("ugcMakerPreview").hidden=true;state.aiDraft=null;
 try{
  const response=await fetch("/api/ugc-maker",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+state.session.access_token,"Accept":"application/json"},body:JSON.stringify({prompt})});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.success)throw new Error(data?.error||"The AI calculator maker is unavailable.");
  state.aiDraft=data.calculator;
  renderMakerPreview(state.aiDraft);
  $("ugcMakerStatus").textContent="Preview generated. Review the title, description and formulas before saving.";
 }catch(error){$("ugcMakerStatus").textContent=error?.message||"Could not generate a calculator.";state.aiDraft=null;}
 finally{button.disabled=false;}
}
async function saveMakerDraft(publish){
 if(!state.aiDraft||!requireAccount()||!verifyConfirmed())return;
 const title=String($("ugcMakerTitle")?.value||"").trim();
 const description=String($("ugcMakerDescription")?.value||"").trim();
 const category=String($("ugcMakerCategory")?.value||"other");
 if(title.length<3){$("ugcMakerStatus").textContent="Enter a title with at least 3 characters.";return;}
 const save=$("ugcMakerSave");if(save)save.disabled=true;
 const publishButton=$("ugcMakerPublish");if(publishButton)publishButton.disabled=true;
 try{
  const saved=await sb().rpc("save_worth_it_ugc_calculator",{
   p_id:state.editingId||null,p_title:title,p_description:description,p_category:category,p_spec:state.aiDraft.spec
  });
  if(saved.error)throw saved.error;
  const payload=normalizeObject(saved.data),id=payload?.id;
  if(!id)throw new Error("The calculator draft could not be saved.");
  if(publish){
   const result=await sb().rpc("publish_worth_it_ugc_calculator",{p_id:id});
   if(result.error)throw result.error;
  }
  state.editingId=null;closeMaker();setActiveSort("mine");await loadCatalog();
  const publicNumber=Number(payload?.calculator_number);
  const numberLabel=Number.isSafeInteger(publicNumber)&&publicNumber>=51?" #"+publicNumber:"";
  toast(publish?"Your calculator"+numberLabel+" has been published.":"Your calculator"+numberLabel+" draft has been saved.");
 }catch(error){$("ugcMakerStatus").textContent=error?.message||"Could not save the calculator."; }
 finally{if(save)save.disabled=false;if(publishButton)publishButton.disabled=false;}
}
async function init(){
 try{await getSession();}catch(_){state.session=null;state.userId="";}
 const section=$("ugcCommunitySection");if(section)section.hidden=!state.userId;
 const navActions=$("ugcNavigationActions");if(navActions)navActions.hidden=!state.userId;
 $("ugcCatalogJumpButton")?.addEventListener("click",()=>{if(section){section.scrollIntoView({behavior:"smooth",block:"start"});}});
 $("ugcMakerJumpButton")?.addEventListener("click",()=>{if(section){section.scrollIntoView({behavior:"smooth",block:"start"});window.setTimeout(()=>$("ugcCreateButton")?.click(),180);}});
 document.querySelectorAll("[data-ugc-sort]").forEach(node=>node.addEventListener("click",()=>{setActiveSort(node.dataset.ugcSort);void loadCatalog();}));
 $("ugcPeriodFilter")?.addEventListener("change",event=>{state.period=event.target.value;void loadCatalog();});
 $("ugcSearch")?.addEventListener("input",event=>{state.search=String(event.target.value||"").trim();clearTimeout(init.searchTimer);init.searchTimer=setTimeout(()=>void loadCatalog(),220);});
 $("ugcCreateButton")?.addEventListener("click",()=>{state.editingId=null;state.aiDraft=null;openMaker();$("ugcMakerPrompt").value="";$("ugcMakerPreview").hidden=true;$("ugcMakerStatus").textContent="Describe what you want to calculate.";});
 $("ugcMakerClose")?.addEventListener("click",closeMaker);
 $("ugcMakerOverlay")?.addEventListener("click",event=>{if(event.target.id==="ugcMakerOverlay")closeMaker();});
 $("ugcMakerGenerate")?.addEventListener("click",generateWithAI);
 $("ugcMakerSave")?.addEventListener("click",()=>saveMakerDraft(false));
 $("ugcMakerPublish")?.addEventListener("click",()=>saveMakerDraft(true));
 $("ugcDetailBack")?.addEventListener("click",()=>window.closeWorthItUGCCalculator());
 $("ugcDetailSaveDescription")?.addEventListener("click",saveDescription);
 $("ugcDetailLike")?.addEventListener("click",()=>state.activeId&&react(state.activeId,"like"));
 $("ugcDetailDislike")?.addEventListener("click",()=>state.activeId&&react(state.activeId,"dislike"));
 if(sb()?.auth?.onAuthStateChange)sb().auth.onAuthStateChange(async()=>{
  try{await getSession();}catch(_){state.userId="";state.session=null;}
  const gallery=$("ugcCommunitySection");if(gallery)gallery.hidden=!state.userId;
  const navActions=$("ugcNavigationActions");if(navActions)navActions.hidden=!state.userId;
  state.catalogRequest++;
  if(state.userId)void loadCatalog();else{state.catalog=[];renderCatalog([]);status("Sign in to browse, create and use community calculators.");}
 });
 if(state.userId)await loadCatalog();else status("Sign in to browse, create and use community calculators.");
}
window.loadWorthItUGCCatalog=loadCatalog;
window.recordWorthItUgcView=async id=>{if(!state.userId)return;try{await sb().rpc("record_worth_it_ugc_view",{p_id:id});}catch(_){}};
window.openWorthItUGCCalculatorFromRoute=id=>openDetail(id,{fromUrl:true});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void init(),{once:true});else void init();
})();