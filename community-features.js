(function(){
"use strict";
const $ = id => document.getElementById(id);
const sb = () => window.supabaseClient || null;
const FAVOURITES_KEY = "worthItCalculatorFavorites:v1:";
const THEME_KEY = "worthItCustomTheme:v1:";
const DEFAULT_THEME = {name:"Worth It",primary:"#7C5CFF",secondary:"#38BDF8"};
let favourites = new Set();
let favouritesUserId = "";
let favouritesRequest = 0;
let favouritesOnly = false;
let themeUserId = "";
let themeRequest = 0;
let reportVisibilityTimer = null;
let reportVisibilitySequence = 0;

function toast(message){ if(typeof window.showToast === "function") window.showToast(String(message || "")); }
function readLocal(key){ try{return localStorage.getItem(key);}catch(_){return null;} }
function writeLocal(key,value){ try{localStorage.setItem(key,value);}catch(_){} }
function removeLocal(key){ try{localStorage.removeItem(key);}catch(_){} }
function scopedKey(prefix,userId){return prefix+(userId||"guest");}
function validHex(value){return /^#[0-9a-f]{6}$/i.test(String(value||""));}
function cleanTheme(value){
 const theme=value&&typeof value==="object"?value:{};
 return {
  name:String(theme.name||DEFAULT_THEME.name).trim().slice(0,24)||DEFAULT_THEME.name,
  primary:validHex(theme.primary)?theme.primary.toUpperCase():DEFAULT_THEME.primary,
  secondary:validHex(theme.secondary)?theme.secondary.toUpperCase():DEFAULT_THEME.secondary
 };
}
function applyTheme(value){
 const theme=cleanTheme(value);
 document.documentElement.style.setProperty("--primary",theme.primary);
 document.documentElement.style.setProperty("--primary2",theme.secondary);
 document.documentElement.dataset.worthItCustomTheme=theme.name;
 const primary=$("worthItThemePrimary"),secondary=$("worthItThemeSecondary"),name=$("worthItThemeName");
 if(primary)primary.value=theme.primary;
 if(secondary)secondary.value=theme.secondary;
 if(name)name.value=theme.name;
 const preview=$("worthItThemePreview");
 if(preview)preview.style.background="linear-gradient(110deg,"+theme.primary+","+theme.secondary+")";
 return theme;
}
function setThemeStatus(message,isError){
 const node=$("worthItThemeStatus");if(!node)return;
 node.textContent=String(message||"");
 node.classList.toggle("is-error",Boolean(isError));
}
async function loadThemeForSession(){
 const request=++themeRequest;let session=null;
 try{const result=await sb()?.auth?.getSession?.();if(result?.error)throw result.error;session=result?.data?.session||null;}catch(_){}
 const userId=session?.user?.id||"";themeUserId=userId;
 try{const raw=readLocal(scopedKey(THEME_KEY,userId));applyTheme(raw?cleanTheme(JSON.parse(raw)):DEFAULT_THEME);}
 catch(_){applyTheme(DEFAULT_THEME);}
 if(!userId)return;
 try{
  const result=await sb().from("worth_it_user_themes").select("theme_name,primary_color,secondary_color").eq("user_id",userId).maybeSingle();
  if(request!==themeRequest||themeUserId!==userId)return;
  if(result.error)throw result.error;
  if(result.data){
   const theme=cleanTheme({name:result.data.theme_name,primary:result.data.primary_color,secondary:result.data.secondary_color});
   writeLocal(scopedKey(THEME_KEY,userId),JSON.stringify(theme));applyTheme(theme);
  }
 }catch(error){console.warn("Worth It custom theme could not be synchronised:",error);}
}
async function saveCustomTheme(){
 const rawPrimary=$("worthItThemePrimary")?.value||"",rawSecondary=$("worthItThemeSecondary")?.value||"";
 if(!validHex(rawPrimary)||!validHex(rawSecondary)){setThemeStatus("Choose valid colours before saving.",true);return;}
 const theme=cleanTheme({name:$("worthItThemeName")?.value,primary:rawPrimary,secondary:rawSecondary});
 applyTheme(theme);writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(theme));
 if(!themeUserId){setThemeStatus("Theme saved on this device. Sign in to sync it to your Worth It account.",false);return;}
 const button=$("worthItThemeSaveButton");if(button)button.disabled=true;
 try{
  const result=await sb().from("worth_it_user_themes").upsert({
   user_id:themeUserId,theme_name:theme.name,primary_color:theme.primary,secondary_color:theme.secondary,updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(result.error)throw result.error;
  setThemeStatus("Your custom theme is saved to your Worth It account.",false);
 }catch(error){
  setThemeStatus("The theme is active on this device, but account sync failed. Apply the community features SQL migration before syncing.",true);
  console.error("Could not save Worth It custom theme:",error);
 }finally{if(button)button.disabled=false;}
}
async function resetCustomTheme(){
 applyTheme(DEFAULT_THEME);writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(DEFAULT_THEME));
 if(!themeUserId){setThemeStatus("Default Worth It colours restored on this device.",false);return;}
 try{
  const result=await sb().from("worth_it_user_themes").delete().eq("user_id",themeUserId);
  if(result.error)throw result.error;
  removeLocal(scopedKey(THEME_KEY,themeUserId));setThemeStatus("Default Worth It colours restored on this account.",false);
 }catch(error){setThemeStatus("Default colours are active here, but the saved account theme could not be reset.",true);console.error("Could not reset Worth It custom theme:",error);}
}

function calculatorKey(card){
 if(!card)return "";
 if(card.dataset.calculatorKey)return card.dataset.calculatorKey;
 const raw=card.querySelector(".open-calc")?.getAttribute("onclick")||"";
 const match=raw.match(/openCalculator\(['"]([a-z0-9_-]+)['"]\)/i);
 if(!match)return "";
 card.dataset.calculatorKey=match[1].toLowerCase();return card.dataset.calculatorKey;
}
function saveLocalFavourites(){writeLocal(scopedKey(FAVOURITES_KEY,favouritesUserId),JSON.stringify(Array.from(favourites)));}
function updateFavouriteButton(button,key){
 const active=favourites.has(key);
 button.classList.toggle("is-favourite",active);
 button.textContent=active?"★":"☆";
 button.setAttribute("aria-pressed",active?"true":"false");
 button.setAttribute("aria-label",active?"Remove from favourites":"Add to favourites");
 button.title=active?"Remove from favourites":"Add to favourites";
}
function decorateCard(card){
 const key=calculatorKey(card);if(!key||card.querySelector(".calc-favorite-toggle"))return;
 const button=document.createElement("button");
 button.type="button";button.className="calc-favorite-toggle";
 button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();void toggleFavourite(key,button);});
 updateFavouriteButton(button,key);card.appendChild(button);
}
function updateFavouritesToggle(){
 const button=$("favoriteCalculatorsToggle");if(!button)return;
 button.classList.toggle("active",favouritesOnly);
 button.setAttribute("aria-pressed",favouritesOnly?"true":"false");
 button.textContent=favouritesOnly?"★ Showing favourites":"☆ Favourites";
}
function refreshFavouriteFilter(){
 const grid=$("calculatorGrid");if(!grid)return;updateFavouritesToggle();
 grid.querySelectorAll(".calc-card").forEach(card=>{
  const key=calculatorKey(card),button=card.querySelector(".calc-favorite-toggle");
  if(button&&key)updateFavouriteButton(button,key);
  if(favouritesOnly&&key&&!favourites.has(key))card.style.display="none";
 });
 if(favouritesOnly){
  const visible=Array.from(grid.querySelectorAll(".calc-card")).some(card=>card.style.display!=="none");
  grid.querySelector(".calc-empty")?.remove();
  if(!visible){const empty=document.createElement("div");empty.className="calc-empty";empty.textContent="You have no favourite calculators yet. Tap the star on a calculator to save it here.";grid.appendChild(empty);}
 }
}
function decorateCards(root){
 (root||document).querySelectorAll?.("#calculatorGrid .calc-card")?.forEach(decorateCard);
 refreshFavouriteFilter();
}
function installFavouriteFilter(){
 const original=window.applyCalculatorFilters;
 if(typeof original==="function"&&!original.__worthItFavouriteFilter){
  const wrapped=function(){original.apply(this,arguments);refreshFavouriteFilter();};
  wrapped.__worthItFavouriteFilter=true;window.applyCalculatorFilters=wrapped;
 }
 $("favoriteCalculatorsToggle")?.addEventListener("click",()=>{
  favouritesOnly=!favouritesOnly;
  if(typeof window.applyCalculatorFilters==="function")window.applyCalculatorFilters();else refreshFavouriteFilter();
 });
}
async function loadFavouritesForSession(){
 const request=++favouritesRequest;let session=null;
 try{const result=await sb()?.auth?.getSession?.();if(result?.error)throw result.error;session=result?.data?.session||null;}catch(_){}
 const userId=session?.user?.id||"";favouritesUserId=userId;
 try{
  const raw=readLocal(scopedKey(FAVOURITES_KEY,userId));
  const saved=raw?JSON.parse(raw):[];
  favourites=new Set(Array.isArray(saved)?saved.filter(key=>/^[a-z][a-z0-9_-]{0,63}$/i.test(String(key))):[]);
 }catch(_){favourites=new Set();}
 if(userId){
  try{
   const result=await sb().from("worth_it_calculator_favorites").select("calculator_key").eq("user_id",userId);
   if(result.error)throw result.error;
   if(request!==favouritesRequest||userId!==favouritesUserId)return;
   favourites=new Set((result.data||[]).map(row=>String(row.calculator_key)));saveLocalFavourites();
  }catch(error){console.warn("Worth It favourite calculators could not be synchronised:",error);}
 }
 decorateCards();
}
async function toggleFavourite(key,button){
 const had=favourites.has(key);if(had)favourites.delete(key);else favourites.add(key);
 updateFavouriteButton(button,key);saveLocalFavourites();refreshFavouriteFilter();
 if(!favouritesUserId)return;
 button.disabled=true;
 try{
  const query=sb().from("worth_it_calculator_favorites");
  const result=had?await query.delete().eq("user_id",favouritesUserId).eq("calculator_key",key):await query.insert({user_id:favouritesUserId,calculator_key:key});
  if(result.error)throw result.error;
 }catch(error){
  if(had)favourites.add(key);else favourites.delete(key);
  saveLocalFavourites();updateFavouriteButton(button,key);refreshFavouriteFilter();
  toast("Could not sync this favourite. Apply the community features SQL migration first.");
  console.error("Favourite calculator update failed:",error);
 }finally{button.disabled=false;}
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
  const result=await sb().rpc("submit_worth_it_user_report",{p_target_worth_it_id:targetId,p_reason:reason,p_details:details});
  if(result.error)throw result.error;
  const payload=Array.isArray(result.data)?result.data[0]:result.data;
  if(!payload?.success)throw new Error(payload?.error||"The report could not be submitted.");
  showReportStatus("Thank you. Your report was submitted privately.",false);toast("Your profile report was submitted.");
  setTimeout(()=>{const overlay=$("worthItReportOverlay");if(overlay)overlay.hidden=true;},800);
 }catch(error){showReportStatus(error?.message||"The report could not be submitted. Please try again.",true);}
 finally{button.disabled=false;}
}
function init(){
 installFavouriteFilter();
 $("worthItThemeSaveButton")?.addEventListener("click",saveCustomTheme);
 $("worthItThemeResetButton")?.addEventListener("click",resetCustomTheme);
 ["worthItThemePrimary","worthItThemeSecondary","worthItThemeName"].forEach(id=>{
  $(id)?.addEventListener("input",()=>{
   applyTheme({name:$("worthItThemeName")?.value,primary:$("worthItThemePrimary")?.value,secondary:$("worthItThemeSecondary")?.value});
   setThemeStatus("Preview only — save your theme to keep it.",false);
  });
 });
 $("worthItProfileReportButton")?.addEventListener("click",openProfileReport);
 const profileCard=$("worthItProfileCard");
 if(profileCard&&typeof MutationObserver==="function")new MutationObserver(scheduleReportButtonUpdate).observe(profileCard,{subtree:true,childList:true,attributes:true,attributeFilter:["href"]});
 decorateCards();
 const grid=$("calculatorGrid");
 if(grid&&typeof MutationObserver==="function")new MutationObserver(records=>{
  if(records.some(record=>record.addedNodes.length))decorateCards(grid);
 }).observe(grid,{childList:true});
 void loadFavouritesForSession();void loadThemeForSession();
 if(sb()?.auth?.onAuthStateChange)sb().auth.onAuthStateChange(()=>{
  setTimeout(()=>{void loadFavouritesForSession();void loadThemeForSession();scheduleReportButtonUpdate();},0);
 });
}
window.refreshWorthItCommunityFeatures=function(){void loadFavouritesForSession();void loadThemeForSession();scheduleReportButtonUpdate();};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();