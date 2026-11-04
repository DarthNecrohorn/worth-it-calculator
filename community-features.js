(function(){
"use strict";
const $ = id => document.getElementById(id);
const sb = () => window.supabaseClient || null;
const FAVOURITES_KEY = "worthItCalculatorFavorites:v1:";
const THEME_KEY = "worthItCustomTheme:v1:";
const DEFAULT_THEME = {name:"Worth It",primary:"#7C5CFF",secondary:"#38BDF8",hover:"#8B5CF6",header:"#0B1120"};
const PREVIEW_REPORTS_KEY = "worthItPreviewReports:v1";
const currentHost = String(window.location.hostname || "").toLowerCase();
const COMMUNITY_PREVIEW_MODE = currentHost.endsWith(".worth-it-calculator.pages.dev") && currentHost !== "worth-it-calculator.pages.dev";
window.worthItCommunityPreviewMode = COMMUNITY_PREVIEW_MODE;

let favourites = new Set();
let favouritesUserId = "";
let favouritesRequest = 0;
let favouritesOnly = false;
let themeUserId = "";
let themeRequest = 0;
let themeRemoteAvailable = null;
let themeEntitled = false;
let themeEntitlementResolved = false;
let activeTheme = DEFAULT_THEME;
let favouritesRemoteAvailable = null;
let favouritesLocalNoticeShown = false;
let reportVisibilityTimer = null;
let reportVisibilitySequence = 0;

function toast(message){ if(typeof window.showToast === "function") window.showToast(String(message || "")); }
function readLocal(key){ try{return localStorage.getItem(key);}catch(_){return null;} }
function writeLocal(key,value){ try{localStorage.setItem(key,value);}catch(_){} }
function removeLocal(key){ try{localStorage.removeItem(key);}catch(_){} }
function scopedKey(prefix,userId){return prefix+(userId||"guest");}
function validHex(value){return /^#[0-9a-f]{6}$/i.test(String(value||""));}

function isMissingCommunitySchema(error){
 const code=String(error?.code||"");
 const message=String(error?.message||error?.details||"").toLowerCase();
 return ["42P01","42703","PGRST202","PGRST204","PGRST205"].includes(code) ||
  /schema cache|could not find the table|could not find the function|does not exist|unknown column/.test(message);
}
function cleanTheme(value){
 const theme=value&&typeof value==="object"?value:{};
 return {
  name:String(theme.name||DEFAULT_THEME.name).trim().slice(0,24)||DEFAULT_THEME.name,
  primary:validHex(theme.primary)?theme.primary.toUpperCase():DEFAULT_THEME.primary,
  secondary:validHex(theme.secondary)?theme.secondary.toUpperCase():DEFAULT_THEME.secondary,
  hover:validHex(theme.hover)?theme.hover.toUpperCase():DEFAULT_THEME.hover,
  header:validHex(theme.header)?theme.header.toUpperCase():DEFAULT_THEME.header
 };
}
function hexRgb(hex){
 const clean=String(hex||"").replace("#","");
 if(!/^[0-9a-f]{6}$/i.test(clean))return [11,17,32];
 return [parseInt(clean.slice(0,2),16),parseInt(clean.slice(2,4),16),parseInt(clean.slice(4,6),16)];
}
function relativeLuminance(hex){
 const channels=hexRgb(hex).map(value=>{const c=value/255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);});
 return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];
}
function contrastRatio(a,b){
 const x=relativeLuminance(a),y=relativeLuminance(b);
 return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
function contrastForeground(hex){
 return contrastRatio(hex,"#FFFFFF")>=contrastRatio(hex,"#08111F")?"#FFFFFF":"#08111F";
}
function mixWithWhite(hex,amount){
 const rgb=hexRgb(hex).map(value=>Math.round(value+(255-value)*amount));
 return "#"+rgb.map(value=>value.toString(16).padStart(2,"0")).join("").toUpperCase();
}
function readableAccent(hex){
 for(let amount=0;amount<=1;amount+=0.05){
  const candidate=mixWithWhite(hex,amount);
  if(contrastRatio(candidate,"#070B14")>=4.5)return candidate;
 }
 return "#FFFFFF";
}
function gradientForeground(primary,secondary){
 const whiteScore=Math.min(contrastRatio("#FFFFFF",primary),contrastRatio("#FFFFFF",secondary));
 const dark="#08111F";
 const darkScore=Math.min(contrastRatio(dark,primary),contrastRatio(dark,secondary));
 return whiteScore>=darkScore?"#FFFFFF":dark;
}
function isCustomTheme(value){
 const theme=cleanTheme(value);
 return theme.primary!==DEFAULT_THEME.primary || theme.secondary!==DEFAULT_THEME.secondary || theme.hover!==DEFAULT_THEME.hover || theme.header!==DEFAULT_THEME.header;
}
function hasPremiumThemeAccess(wallet){
 if(!wallet)return false;
 if(wallet.is_owner===true)return true;
 const plan=String(wallet.premium_plan||"");
 const expiry=Date.parse(wallet.premium_expires_at||"");
 return ["premium","premium_lite"].includes(plan)&&Number.isFinite(expiry)&&expiry>Date.now();
}
function updateThemeAccessUI(){
 const editor=$("worthItThemeEditor"),locked=$("worthItThemeLocked");
 if(editor)editor.hidden=!themeEntitled;
 if(locked)locked.hidden=themeEntitled;
 ["worthItThemeSaveButton","worthItThemeResetButton","worthItThemePrimary","worthItThemeSecondary","worthItThemeHover","worthItThemeHeader","worthItThemeName"].forEach(id=>{
  const node=$(id);if(node)node.disabled=!themeEntitled;
 });
 if(!themeEntitled&&document.documentElement?.hasAttribute("data-worth-it-custom-theme"))applyTheme(DEFAULT_THEME);
}
function updateAppearanceModeControls(){
 const root=document.documentElement;
 const custom=Boolean(root?.hasAttribute("data-worth-it-custom-theme"));
 const currentTheme=root?.dataset?.theme==="light"?"light":"dark";
 ["themeDarkBtn","themeLightBtn","settingsPageThemeDarkBtn","settingsPageThemeLightBtn"].forEach(id=>{
  const button=$(id);if(!button)return;
  const buttonTheme=id.toLowerCase().includes("light")?"light":"dark";
  button.disabled=custom;
  button.setAttribute("aria-disabled",String(custom));
  button.classList.toggle("active",!custom&&buttonTheme===currentTheme);
  button.title=custom?"Custom appearance is active. Reset settings before returning to Dark or Light.":"Choose the standard "+(buttonTheme==="dark"?"Dark":"Light")+" appearance.";
 });
}
function applyTheme(value){
 const selectedTheme=cleanTheme(value);
 activeTheme=selectedTheme;
 const root=document.documentElement;
 // Public profile pages own their full-width banner and avatar styling. Keep the
 // saved palette in memory, but expose only the standard site palette on profiles.
 const theme=root.classList.contains("worth-it-profile-theme-isolated")?DEFAULT_THEME:selectedTheme;
 if(isCustomTheme(theme)){
  root.style.setProperty("--primary",theme.primary);
  root.style.setProperty("--primary2",theme.secondary);
  root.style.setProperty("--worth-it-hover-glow",theme.hover);
  root.style.setProperty("--worth-it-theme-gradient","linear-gradient(120deg,"+theme.primary+","+theme.secondary+")");
  root.style.setProperty("--worth-it-header-background",theme.header);
  root.style.setProperty("--worth-it-header-foreground",contrastForeground(theme.header));
  root.style.setProperty("--worth-it-hover-foreground",contrastForeground(theme.hover));
  root.style.setProperty("--worth-it-gradient-foreground",gradientForeground(theme.primary,theme.secondary));
  root.style.setProperty("--worth-it-primary-readable",readableAccent(theme.primary));
  root.style.setProperty("--worth-it-secondary-readable",readableAccent(theme.secondary));
  root.dataset.worthItCustomTheme=theme.name||"Custom";
 }else{
  ["--primary","--primary2","--worth-it-hover-glow","--worth-it-theme-gradient","--worth-it-header-background","--worth-it-header-foreground","--worth-it-hover-foreground","--worth-it-gradient-foreground","--worth-it-primary-readable","--worth-it-secondary-readable"].forEach(property=>root.style.removeProperty(property));
  root.removeAttribute("data-worth-it-custom-theme");
 }
 const primary=$("worthItThemePrimary"),secondary=$("worthItThemeSecondary"),hover=$("worthItThemeHover"),header=$("worthItThemeHeader"),name=$("worthItThemeName");
 if(primary)primary.value=selectedTheme.primary;
 if(secondary)secondary.value=selectedTheme.secondary;
 if(hover)hover.value=selectedTheme.hover;
 if(header)header.value=selectedTheme.header;
 if(name)name.value=selectedTheme.name;
 const preview=$("worthItThemePreview");
 if(preview){
  preview.style.background=isCustomTheme(selectedTheme)
   ?"linear-gradient(120deg,"+selectedTheme.primary+","+selectedTheme.secondary+")"
   :"linear-gradient(120deg,#7c5cff,#38bdf8)";
  preview.style.setProperty("--preview-hover",selectedTheme.hover);
  preview.style.setProperty("--preview-header",selectedTheme.header);
  preview.style.setProperty("--preview-header-foreground",contrastForeground(selectedTheme.header));
  preview.classList.toggle("is-custom",isCustomTheme(selectedTheme));
 }
 updateAppearanceModeControls();
 return selectedTheme;
}
window.setWorthItProfileThemeIsolation=function(isolated){
 const root=document.documentElement;
 if(!root)return;
 root.classList.toggle("worth-it-profile-theme-isolated",Boolean(isolated));
 applyTheme(activeTheme);
};
function setThemeStatus(message,isError){
 const node=$("worthItThemeStatus");if(!node)return;
 node.textContent=String(message||"");
 node.classList.toggle("is-error",Boolean(isError));
}
async function loadThemeForSession(){
 const request=++themeRequest;let session=null,wallet=null;
 try{const result=await sb()?.auth?.getSession?.();if(result?.error)throw result.error;session=result?.data?.session||null;}catch(_){}
 const userId=session?.user?.id||"";themeUserId=userId;themeRemoteAvailable=userId?null:false;
 try{wallet=await window.refreshWorthItCalcWallet?.()||null;}catch(error){console.warn("Could not verify Premium access for Custom Themes:",error);}
 if(request!==themeRequest||themeUserId!==userId)return;
 themeEntitled=hasPremiumThemeAccess(wallet);
 themeEntitlementResolved=true;
 updateThemeAccessUI();
 if(!themeEntitled){
  applyTheme(DEFAULT_THEME);
  setThemeStatus("Custom Themes are available only to active Premium Lite and Premium members. Your saved palette is kept for when your subscription is active again.",false);
  return;
 }
 try{const raw=readLocal(scopedKey(THEME_KEY,userId));applyTheme(raw?cleanTheme(JSON.parse(raw)):DEFAULT_THEME);}
 catch(_){applyTheme(DEFAULT_THEME);}
 if(!userId)return;
 try{
  const result=await sb().from("worth_it_user_themes").select("theme_name,primary_color,secondary_color,hover_color,header_color").eq("user_id",userId).maybeSingle();
  if(request!==themeRequest||themeUserId!==userId)return;
  if(result.error)throw result.error;
  if(result.data){
   const theme=cleanTheme({name:result.data.theme_name,primary:result.data.primary_color,secondary:result.data.secondary_color,hover:result.data.hover_color,header:result.data.header_color});
   writeLocal(scopedKey(THEME_KEY,userId),JSON.stringify(theme));applyTheme(theme);
  }else{
   removeLocal(scopedKey(THEME_KEY,userId));
   applyTheme(DEFAULT_THEME);
  }
 }catch(error){if(isMissingCommunitySchema(error)){themeRemoteAvailable=false;setThemeStatus("Preview-only: your custom theme is saved on this device and will sync after the community migration is installed.",false);}else{console.warn("Worth It custom theme could not be synchronised:",error);}}
}
async function saveCustomTheme(){
 if(!themeEntitlementResolved||!themeEntitled){setThemeStatus("Custom Themes require an active Premium Lite or Premium subscription.",true);return;}
 const rawPrimary=$("worthItThemePrimary")?.value||"",rawSecondary=$("worthItThemeSecondary")?.value||"",rawHover=$("worthItThemeHover")?.value||"",rawHeader=$("worthItThemeHeader")?.value||"";
 if(!validHex(rawPrimary)||!validHex(rawSecondary)||!validHex(rawHover)||!validHex(rawHeader)){setThemeStatus("Choose valid colours before saving.",true);return;}
 const theme=cleanTheme({name:$("worthItThemeName")?.value,primary:rawPrimary,secondary:rawSecondary,hover:rawHover,header:rawHeader});
 if(!isCustomTheme(theme)){setThemeStatus("Choose at least one colour that differs from the default palette before saving a custom theme.",true);return;}
 applyTheme(theme);writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(theme));
 if(!themeUserId){setThemeStatus("Sign in to save and sync your Premium custom theme.",true);return;}
 if(themeRemoteAvailable===false){setThemeStatus("Preview-only: your theme is saved locally for this account. Database sync will activate after the community migration is installed.",false);return;}
 const button=$("worthItThemeSaveButton");if(button)button.disabled=true;
 try{
  const result=await sb().from("worth_it_user_themes").upsert({
   user_id:themeUserId,theme_name:theme.name,primary_color:theme.primary,secondary_color:theme.secondary,hover_color:theme.hover,header_color:theme.header,updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(result.error)throw result.error;
  setThemeStatus("Your custom theme is saved to your Worth It account.",false);
 }catch(error){
  if(isMissingCommunitySchema(error)){themeRemoteAvailable=false;setThemeStatus("Preview-only: your theme is saved locally for this account. Database sync will activate after the community migration is installed.",false);}
  else{setThemeStatus("The theme is active on this device, but account sync failed.",true);console.error("Could not save Worth It custom theme:",error);}
 }finally{if(button)button.disabled=false;}
}
async function resetCustomTheme(){
 applyTheme(DEFAULT_THEME);
 removeLocal(scopedKey(THEME_KEY,themeUserId));
 if(!themeUserId){setThemeStatus("Default Worth It colours restored on this device.",false);return true;}
 if(themeRemoteAvailable===false){setThemeStatus("Preview-only: default colours restored for this account on this device.",false);return true;}
 try{
  const result=await sb().from("worth_it_user_themes").delete().eq("user_id",themeUserId);
  if(result.error)throw result.error;
  setThemeStatus("Default Worth It colours restored on this account.",false);
  return true;
 }catch(error){
  if(isMissingCommunitySchema(error)){
   themeRemoteAvailable=false;
   setThemeStatus("Preview-only: default colours restored for this account on this device.",false);
   return true;
  }
  setThemeStatus("Default colours are active on this device, but the saved account theme could not be reset. Check your connection and try again.",true);
  console.error("Could not reset Worth It custom theme:",error);
  return false;
 }
}

// UGC cards must opt in explicitly. Built-in calculators do not get social actions.
function ugcCalculatorId(card){
 if(!(card instanceof Element) || card.dataset.calculatorOrigin!=="ugc")return "";
 const id=String(card.dataset.ugcId||"").trim().toLowerCase();
 return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(id)?id:"";
}
function isUGCCalculatorCard(card){return Boolean(ugcCalculatorId(card));}
window.isWorthItUGCCalculatorCard=isUGCCalculatorCard;
window.canInteractWithWorthItUGCCalculator=function(card,action){
 const allowed=["favorite","like","dislike","report"];
 if(!allowed.includes(String(action||"").toLowerCase()))return false;
 if(!isUGCCalculatorCard(card)){toast("This action is available only for user-created calculators.");return false;}
 if(!favouritesUserId){toast("Sign in to interact with user-created calculators.");return false;}
 return true;
};
function calculatorKey(card){
 const id=ugcCalculatorId(card);
 return id?"ugc:"+id:"";
}
function saveLocalFavourites(){
 const onlyUGC=Array.from(favourites).filter(key=>/^ugc:[a-z0-9][a-z0-9_-]{0,62}$/i.test(String(key)));
 favourites=new Set(onlyUGC);
 writeLocal(scopedKey(FAVOURITES_KEY,favouritesUserId),JSON.stringify(onlyUGC));
}
function updateFavouriteButton(button,key){
 const active=favourites.has(key);
 button.classList.toggle("is-favourite",active);
 let icon=button.querySelector(".calc-favorite-icon");
 if(!icon){icon=document.createElement("span");icon.className="calc-favorite-icon";button.replaceChildren(icon);}
 icon.textContent=active?"★":"☆";
 button.setAttribute("aria-pressed",active?"true":"false");
 button.setAttribute("aria-label",active?"Remove from favourites":"Add to favourites");
 button.title=active?"Remove from favourites":"Add to favourites";
}
function decorateCard(card){
 const existing=card.querySelector(".calc-favorite-toggle");
 if(!favouritesUserId||!isUGCCalculatorCard(card)){
  existing?.remove();
  return;
 }
 const key=calculatorKey(card);
 if(!key||existing)return;
 const button=document.createElement("button");
 button.type="button";button.className="calc-favorite-toggle";
 button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();void toggleFavourite(key,button);});
 updateFavouriteButton(button,key);card.appendChild(button);
}
function updateFavouritesToggle(){
 const button=$("favoriteCalculatorsToggle");if(!button)return;
 const hasUGC=Array.from(document.querySelectorAll("#calculatorGrid .calc-card, #ugcCalculatorGrid .calc-card")).some(isUGCCalculatorCard);
 button.hidden=!favouritesUserId||!hasUGC;
 if(button.hidden&&favouritesOnly){
  favouritesOnly=false;
  const baseFilter=window.applyCalculatorFilters?.__worthItFavouriteOriginal;
  if(typeof baseFilter==="function")baseFilter();
 }
 button.classList.toggle("active",favouritesOnly);
 button.setAttribute("aria-pressed",favouritesOnly?"true":"false");
 button.textContent=favouritesOnly?"★ Showing favourites":"☆ Favourites";
}
function refreshFavouriteFilter(){
 const grids=[$("calculatorGrid"),$("ugcCalculatorGrid")].filter(Boolean);if(!grids.length)return;updateFavouritesToggle();
 grids.forEach(grid=>{
  grid.querySelectorAll(".calc-card").forEach(card=>{
   const key=calculatorKey(card),button=card.querySelector(".calc-favorite-toggle");
   if(button&&key)updateFavouriteButton(button,key);
   if(favouritesOnly)card.style.display=key&&favourites.has(key)?"":"none";
    else if(grid.id==="ugcCalculatorGrid")card.style.display="";
  });
  if(favouritesOnly){
   const visible=Array.from(grid.querySelectorAll(".calc-card")).some(card=>card.style.display!=="none");
   grid.querySelector(".ugc-favourites-empty")?.remove();
   if(!visible&&grid.id==="ugcCalculatorGrid"){const empty=document.createElement("p");empty.className="calc-empty ugc-favourites-empty";empty.textContent="You have no favourite community calculators yet. Tap the star on a calculator to save it here.";grid.appendChild(empty);}
  }else{grid.querySelector(".ugc-favourites-empty")?.remove();}
 });
}
function decorateCards(root){
 (root||document).querySelectorAll?.("#calculatorGrid .calc-card, #ugcCalculatorGrid .calc-card")?.forEach(decorateCard);
 refreshFavouriteFilter();
}
function installFavouriteFilter(){
 const original=window.applyCalculatorFilters;
 if(typeof original==="function"&&!original.__worthItFavouriteFilter){
  const wrapped=function(){original.apply(this,arguments);refreshFavouriteFilter();};
  wrapped.__worthItFavouriteFilter=true;
  wrapped.__worthItFavouriteOriginal=original;
  window.applyCalculatorFilters=wrapped;
 }
 $("favoriteCalculatorsToggle")?.addEventListener("click",()=>{
  favouritesOnly=!favouritesOnly;
  if(typeof window.applyCalculatorFilters==="function")window.applyCalculatorFilters();else refreshFavouriteFilter();
 });
}
async function loadFavouritesForSession(){
 const request=++favouritesRequest;let session=null;
 try{const result=await sb()?.auth?.getSession?.();if(result?.error)throw result.error;session=result?.data?.session||null;}catch(_){}
 const userId=session?.user?.id||"";if(userId!==favouritesUserId)favouritesLocalNoticeShown=false;favouritesUserId=userId;favouritesRemoteAvailable=userId?null:false;
 if(userId){
  try{
   const raw=readLocal(scopedKey(FAVOURITES_KEY,userId));
   const saved=raw?JSON.parse(raw):[];
   favourites=new Set(Array.isArray(saved)?saved.filter(key=>/^ugc:[a-z0-9][a-z0-9_-]{0,62}$/i.test(String(key))):[]);
  }catch(_){favourites=new Set();}
 }else{
  favourites=new Set();
 }
 if(userId){
  try{
   const result=await sb().from("worth_it_calculator_favorites").select("calculator_key").eq("user_id",userId).like("calculator_key","ugc:%");
   if(result.error)throw result.error;
   if(request!==favouritesRequest||userId!==favouritesUserId)return;
   favouritesRemoteAvailable=true;favourites=new Set((result.data||[]).map(row=>String(row.calculator_key)).filter(key=>/^ugc:[a-z0-9][a-z0-9_-]{0,62}$/i.test(key)));saveLocalFavourites();
  }catch(error){if(isMissingCommunitySchema(error)){favouritesRemoteAvailable=false;saveLocalFavourites();}else{console.warn("Worth It favourite calculators could not be synchronised:",error);}}
 }
 decorateCards();
}
async function toggleFavourite(key,button){
 const card=button?.closest(".calc-card");
 if(!favouritesUserId){toast("Sign in to save a user-created calculator.");return;}
 if(!isUGCCalculatorCard(card)||calculatorKey(card)!==key||!/^ugc:[a-z0-9][a-z0-9_-]{0,62}$/i.test(key)){
  toast("Only user-created calculators can be added to favourites.");return;
 }
 const had=favourites.has(key);if(had)favourites.delete(key);else favourites.add(key);
 updateFavouriteButton(button,key);saveLocalFavourites();refreshFavouriteFilter();
 if(favouritesRemoteAvailable===false){if(!favouritesLocalNoticeShown){toast("Preview-only: favourites are saved locally for this account until the community database migration is installed.");favouritesLocalNoticeShown=true;}return;}
 button.disabled=true;
 try{
  const query=sb().from("worth_it_calculator_favorites");
  const result=had?await query.delete().eq("user_id",favouritesUserId).eq("calculator_key",key):await query.insert({user_id:favouritesUserId,calculator_key:key});
  if(result.error)throw result.error;
  favouritesRemoteAvailable=true;
 }catch(error){
  if(isMissingCommunitySchema(error)){favouritesRemoteAvailable=false;if(!favouritesLocalNoticeShown){toast("Preview-only: favourites are saved locally for this account until the community database migration is installed.");favouritesLocalNoticeShown=true;}return;}
  if(had)favourites.add(key);else favourites.delete(key);
  saveLocalFavourites();updateFavouriteButton(button,key);refreshFavouriteFilter();
  toast("Could not sync this favourite. Apply the community features SQL migration first.");
  console.error("Favourite calculator update failed:",error);
 }finally{button.disabled=false;}
}


function getPreviewReports(){
 if(!COMMUNITY_PREVIEW_MODE)return [];
 try{
  const rows=JSON.parse(readLocal(PREVIEW_REPORTS_KEY)||"[]");
  return Array.isArray(rows)?rows.filter(row=>row&&row.preview_local===true):[];
 }catch(_){return [];}
}
function savePreviewReports(rows){
 if(!COMMUNITY_PREVIEW_MODE)return false;
 try{writeLocal(PREVIEW_REPORTS_KEY,JSON.stringify(rows));return true;}catch(_){return false;}
}
window.getWorthItPreviewReports = getPreviewReports;
window.moderateWorthItPreviewReport = async function(reportId,status,note){
 if(!COMMUNITY_PREVIEW_MODE)return {success:false};
 const allowed=["open","reviewing","resolved","dismissed"];
 const id=Number(reportId);
 if(!Number.isSafeInteger(id)||id>=0||!allowed.includes(String(status)))return {success:false};
 const reports=getPreviewReports();
 const index=reports.findIndex(row=>Number(row.id)===id);
 if(index<0)return {success:false};
 let session=null;
 try{const result=await sb()?.auth?.getSession?.();if(result?.error)throw result.error;session=result?.data?.session||null;}catch(_){}
 if(!session?.user?.id||String(session.user.email||"").trim().toLowerCase()!=="pedjasebez3545@gmail.com")return {success:false};
 reports[index]={...reports[index],status:String(status),admin_note:String(note||"").slice(0,1000),reviewed_by:session.user.id,reviewed_at:new Date().toISOString()};
 return savePreviewReports(reports)?{success:true,report:reports[index]}:{success:false};
};
function submitPreviewReport(targetId,reason,details,session){
 const reports=getPreviewReports();
 const now=new Date();
 const today=now.toISOString().slice(0,10);
 const reporterId=String(session?.user?.id||"");
 if(!reporterId)throw new Error("Sign in before reporting a profile.");
 const todays=reports.filter(row=>row.reporter_user_id===reporterId&&String(row.created_at||"").slice(0,10)===today);
 if(todays.some(row=>Number(row.reported_worth_it_id)===Number(targetId)))throw new Error("You have already reported this user today.");
 if(todays.length>=5)throw new Error("Daily report limit reached. You can submit up to five reports per day.");
 const id=-(Date.now()*1000+Math.floor(Math.random()*1000));
 const username=String($("worthItProfileUsername")?.textContent||"").replace(/^@/,"").trim();
 const displayName=String($("worthItProfileName")?.textContent||"Worth It member").trim();
 const item={
  id,preview_local:true,reporter_user_id:reporterId,reporter_worth_it_id:null,
  reported_user_id:null,reported_worth_it_id:Number(targetId),
  reported_username:username||displayName,reported_display_name:displayName,
  reporter_label:"Preview test account",reason:String(reason),details:String(details||"").slice(0,1000),
  status:"open",admin_note:"",reviewed_by:null,reviewed_at:null,created_at:now.toISOString()
 };
 reports.push(item);
 if(!savePreviewReports(reports))throw new Error("The preview report could not be saved in this browser.");
 return item;
}

function profileTargetId(){
 const href=$("worthItProfileLink")?.getAttribute("href")||"";
 const match=href.match(/\/profile\/([1-9][0-9]*)/);return match?Number(match[1]):0;
}
function updateReportButton(){
 const button=$("worthItProfileReportButton");if(!button)return;
 const section=$("profileSection"),ownEdit=$("worthItProfileDisplayNameEdit"),targetId=profileTargetId();
 if(!section||section.style.display==="none"||!targetId||ownEdit?.hidden===false){button.hidden=true;return;}
 const sequence=++reportVisibilitySequence;
 const pending=sb()?.auth?.getSession?.();
 if(!pending){button.hidden=true;return;}
 pending.then(result=>{
  if(sequence!==reportVisibilitySequence)return;
  const session=result?.data?.session;button.hidden=!session?.user?.id||!session?.access_token;
 }).catch(()=>{button.hidden=true;});
}
function scheduleReportButtonUpdate(){
 if(reportVisibilityTimer!==null)clearTimeout(reportVisibilityTimer);
 reportVisibilityTimer=setTimeout(()=>{reportVisibilityTimer=null;updateReportButton();},150);
}
function reportDialog(){
 let overlay=$("worthItReportOverlay");if(overlay)return overlay;
 overlay=document.createElement("div");overlay.id="worthItReportOverlay";overlay.className="worth-it-report-overlay";overlay.hidden=true;
 overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-labelledby","worthItReportTitle");
 overlay.innerHTML='<form class="worth-it-report-card" id="worthItReportForm"><div class="worth-it-report-head"><div><span>WORTH IT COMMUNITY</span><h2 id="worthItReportTitle">Report this profile</h2><p>Tell us what happened. Reports are reviewed privately.</p></div><button type="button" class="worth-it-report-close" id="worthItReportClose" aria-label="Close report form">×</button></div><label for="worthItReportReason">Reason</label><select id="worthItReportReason" required><option value="harassment">Harassment</option><option value="spam">Spam</option><option value="hate">Hate or extremist content</option><option value="impersonation">Impersonation</option><option value="inappropriate_profile">Inappropriate profile</option><option value="other">Other</option></select><label for="worthItReportDetails">Additional details <span>(optional)</span></label><textarea id="worthItReportDetails" rows="4" maxlength="1000" placeholder="Describe the issue. Do not include passwords or payment details."></textarea><p class="worth-it-report-status" id="worthItReportStatus" role="status" aria-live="polite"></p><div class="worth-it-report-actions"><button type="button" class="worth-it-report-cancel" id="worthItReportCancel">Cancel</button><button type="submit" class="worth-it-report-submit" id="worthItReportSubmit">Send report</button></div></form>';
 document.body.appendChild(overlay);
 const close=()=>{overlay.hidden=true;};
 $("worthItReportClose")?.addEventListener("click",close);
 $("worthItReportCancel")?.addEventListener("click",close);
 overlay.addEventListener("click",event=>{if(event.target===overlay)close();});
 $("worthItReportForm")?.addEventListener("submit",submitProfileReport);
 return overlay;
}
function showReportStatus(message,isError){
 const node=$("worthItReportStatus");if(!node)return;
 node.textContent=String(message||"");node.classList.toggle("is-error",Boolean(isError));
}
async function openProfileReport(){
 const targetId=profileTargetId();if(!targetId||$("worthItProfileReportButton")?.hidden)return;
 try{
  const result=await sb().auth.getSession();if(result.error)throw result.error;
  const session=result.data?.session;if(!session?.user?.id)throw new Error("Sign in before reporting a profile.");
  if(!session.user.email_confirmed_at&&!session.user.confirmed_at)throw new Error("Confirm your email before reporting users.");
  const overlay=reportDialog();$("worthItReportDetails").value="";$("worthItReportReason").value="harassment";
  showReportStatus("",false);overlay.hidden=false;$("worthItReportReason")?.focus();
 }catch(error){toast(error?.message||"Could not open the report form.");}
}
async function submitProfileReport(event){
 event.preventDefault();const targetId=profileTargetId(),reason=$("worthItReportReason")?.value||"",details=$("worthItReportDetails")?.value||"";
 const button=$("worthItReportSubmit");if(!targetId||!button||button.disabled)return;
 button.disabled=true;showReportStatus("Sending your report…",false);
 try{
  if(COMMUNITY_PREVIEW_MODE){
   const auth=await sb().auth.getSession();
   if(auth.error)throw auth.error;
   const session=auth.data?.session;
   if(!session?.user?.id)throw new Error("Sign in before reporting a profile.");
   if(!session.user.email_confirmed_at&&!session.user.confirmed_at)throw new Error("Confirm your email before reporting users.");
   submitPreviewReport(targetId,reason,details,session);
   showReportStatus("Preview test report saved locally. It has not been sent to the live database.",false);
   toast("Preview test report saved locally.");
  }else{
   const result=await sb().rpc("submit_worth_it_user_report",{p_target_worth_it_id:targetId,p_reason:reason,p_details:details});
   if(result.error)throw result.error;
   const payload=Array.isArray(result.data)?result.data[0]:result.data;
   if(!payload?.success)throw new Error(payload?.error||"The report could not be submitted.");
   showReportStatus("Thank you. Your report was submitted privately.",false);toast("Your profile report was submitted.");
  }
  setTimeout(()=>{const overlay=$("worthItReportOverlay");if(overlay)overlay.hidden=true;},1000);
 }catch(error){showReportStatus(error?.message||"The report could not be submitted. Please try again.",true);}
 finally{button.disabled=false;}
}
function init(){
 installFavouriteFilter();
 $("worthItThemeSaveButton")?.addEventListener("click",saveCustomTheme);
 $("worthItThemeResetButton")?.addEventListener("click",resetCustomTheme);
 ["worthItThemePrimary","worthItThemeSecondary","worthItThemeHover","worthItThemeHeader","worthItThemeName"].forEach(id=>{
  $(id)?.addEventListener("input",()=>{
   if(!themeEntitled){updateThemeAccessUI();return;}
   applyTheme({name:$("worthItThemeName")?.value,primary:$("worthItThemePrimary")?.value,secondary:$("worthItThemeSecondary")?.value,hover:$("worthItThemeHover")?.value,header:$("worthItThemeHeader")?.value});
   setThemeStatus("Live preview only — save your custom palette to keep it. Text adjusts for contrast, and button hover uses your selected colour.",false);
  });
 });
 $("worthItProfileReportButton")?.addEventListener("click",openProfileReport);
 const profileCard=$("worthItProfileCard"),profileSection=$("profileSection"),profileLink=$("worthItProfileLink"),ownEdit=$("worthItProfileDisplayNameEdit");
 if(typeof MutationObserver==="function"){
  const observer=new MutationObserver(scheduleReportButtonUpdate);
  if(profileCard)observer.observe(profileCard,{subtree:true,childList:true});
  if(profileSection)observer.observe(profileSection,{attributes:true,attributeFilter:["style"]});
  if(profileLink)observer.observe(profileLink,{attributes:true,attributeFilter:["href"]});
  if(ownEdit)observer.observe(ownEdit,{attributes:true,attributeFilter:["hidden"]});
 }
 decorateCards();
 [$("calculatorGrid"),$("ugcCalculatorGrid")].filter(Boolean).forEach(grid=>{
  if(typeof MutationObserver==="function")new MutationObserver(records=>{
   if(records.some(record=>record.addedNodes.length))decorateCards(grid);
  }).observe(grid,{childList:true});
 });
 void loadFavouritesForSession();void loadThemeForSession();
 if(sb()?.auth?.onAuthStateChange)sb().auth.onAuthStateChange(()=>{
  setTimeout(()=>{void loadFavouritesForSession();void loadThemeForSession();scheduleReportButtonUpdate();},0);
 });
}
window.refreshWorthItCommunityFeatures=function(){void loadFavouritesForSession();void loadThemeForSession();scheduleReportButtonUpdate();};
window.resetWorthItCustomTheme=resetCustomTheme;
window.isWorthItCustomThemeActive=()=>Boolean(document.documentElement?.hasAttribute("data-worth-it-custom-theme"));
window.openWorthItThemeUpgrade=async function(){
 let session=null;try{session=(await sb()?.auth?.getSession?.())?.data?.session||null;}catch(_){}
 if(!session){if(typeof window.openAuthModal==="function")window.openAuthModal("signup");else toast("Sign in to explore Premium subscriptions.");return;}
 if(typeof window.openWebShop==="function")window.openWebShop("subscriptions");
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();