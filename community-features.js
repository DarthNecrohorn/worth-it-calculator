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
let savedTheme = DEFAULT_THEME;
let themeSettingsOpen = false;
let themePreviewActive = false;
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
 const editor=$("worthItThemeEditor"),locked=$("worthItThemeLocked"),miniPromo=$("settingsCustomThemePromo");
 if(editor)editor.hidden=false;
 if(locked)locked.hidden=themeEntitled;
 if(miniPromo)miniPromo.hidden=themeEntitled;
 const save=$("worthItThemeSaveButton"),reset=$("worthItThemeResetButton");
 if(save)save.textContent=themeEntitled?"Save my theme":"Unlock to save →";
 if(reset)reset.textContent=themeEntitled?"Restore default colours":"Reset preview colours";
 ["worthItThemePrimary","worthItThemeSecondary","worthItThemeHover","worthItThemeHeader","worthItThemeName","worthItThemeResetButton"].forEach(id=>{
  const node=$(id);if(node)node.disabled=false;
 });
 if(save)save.disabled=false;
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
 savedTheme=DEFAULT_THEME;
 updateThemeAccessUI();
 if(!themeEntitled){
  applyTheme(DEFAULT_THEME);
  setThemeStatus("Try every colour below. Your preview lasts while Settings is open; saving and keeping it active across Worth It is a Premium Lite and Premium benefit.",false);
  return;
 }
 try{
  const raw=readLocal(scopedKey(THEME_KEY,userId));
  savedTheme=raw?cleanTheme(JSON.parse(raw)):DEFAULT_THEME;
  applyTheme(savedTheme);
 }catch(_){savedTheme=DEFAULT_THEME;applyTheme(DEFAULT_THEME);}
 if(!userId)return;
 try{
  const result=await sb().from("worth_it_user_themes").select("theme_name,primary_color,secondary_color,hover_color,header_color").eq("user_id",userId).maybeSingle();
  if(request!==themeRequest||themeUserId!==userId)return;
  if(result.error)throw result.error;
  if(result.data){
   savedTheme=cleanTheme({name:result.data.theme_name,primary:result.data.primary_color,secondary:result.data.secondary_color,hover:result.data.hover_color,header:result.data.header_color});
   writeLocal(scopedKey(THEME_KEY,userId),JSON.stringify(savedTheme));applyTheme(savedTheme);
  }else{
   savedTheme=DEFAULT_THEME;
   removeLocal(scopedKey(THEME_KEY,userId));
   applyTheme(DEFAULT_THEME);
  }
 }catch(error){
  if(isMissingCommunitySchema(error)){themeRemoteAvailable=false;setThemeStatus("Preview-only: your saved Premium theme is stored on this device and will sync after the community migration is installed.",false);}
  else{console.warn("Worth It custom theme could not be synchronised:",error);}
 }
}
async function saveCustomTheme(){
 if(!themeSettingsOpen){setThemeStatus("Open Settings → Appearance & Accessibility to save a Custom Theme.",true);return;}
 if(!themeEntitlementResolved||!themeEntitled){
  setThemeStatus("You can try every colour for free. Saving your theme and keeping it active across Worth It requires Premium Lite or Premium.",true);
  window.openWorthItThemeUpgrade?.();
  return;
 }
 const rawPrimary=$("worthItThemePrimary")?.value||"",rawSecondary=$("worthItThemeSecondary")?.value||"",rawHover=$("worthItThemeHover")?.value||"",rawHeader=$("worthItThemeHeader")?.value||"";
 if(!validHex(rawPrimary)||!validHex(rawSecondary)||!validHex(rawHover)||!validHex(rawHeader)){setThemeStatus("Choose valid colours before saving.",true);return;}
 const theme=cleanTheme({name:$("worthItThemeName")?.value,primary:rawPrimary,secondary:rawSecondary,hover:rawHover,header:rawHeader});
 if(!isCustomTheme(theme)){setThemeStatus("Choose at least one colour that differs from the default palette before saving a custom theme.",true);return;}
 if(!themeUserId){setThemeStatus("Sign in with your Premium account to save and sync your custom theme.",true);return;}
 const button=$("worthItThemeSaveButton");if(button)button.disabled=true;
 try{
  if(themeRemoteAvailable===false){
   savedTheme=theme;writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(theme));
   themePreviewActive=false;applyTheme(theme);
   setThemeStatus("Your custom theme is saved on this device. Account sync will activate after the community migration is installed.",false);
   return;
  }
  const result=await sb().from("worth_it_user_themes").upsert({
   user_id:themeUserId,theme_name:theme.name,primary_color:theme.primary,secondary_color:theme.secondary,hover_color:theme.hover,header_color:theme.header,updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(result.error)throw result.error;
  savedTheme=theme;writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(theme));
  themePreviewActive=false;applyTheme(theme);
  setThemeStatus("Your custom theme is saved and will stay active across Worth It.",false);
 }catch(error){
  if(isMissingCommunitySchema(error)){
   themeRemoteAvailable=false;savedTheme=theme;writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(theme));
   themePreviewActive=false;applyTheme(theme);
   setThemeStatus("Your custom theme is saved on this device. Account sync will activate after the community migration is installed.",false);
  }else{
   themePreviewActive=true;applyTheme(theme);
   setThemeStatus("The preview is active, but your theme could not be saved to your account. Please try again.",true);
   console.error("Could not save Worth It custom theme:",error);
  }
 }finally{if(button)button.disabled=false;}
}
async function resetCustomTheme(){
 if(!themeSettingsOpen){setThemeStatus("Open Settings → Appearance & Accessibility to change Custom Themes.",true);return false;}
 if(!themeEntitlementResolved||!themeEntitled){
  themePreviewActive=false;applyTheme(DEFAULT_THEME);
  setThemeStatus("Preview reset to the default Worth It colours. You can try another combination; nothing is saved.",false);
  return true;
 }
 applyTheme(DEFAULT_THEME);themePreviewActive=true;
 if(!themeUserId){setThemeStatus("Sign in with your Premium account to reset the saved theme.",true);return false;}
 if(themeRemoteAvailable===false){
  removeLocal(scopedKey(THEME_KEY,themeUserId));savedTheme=DEFAULT_THEME;themePreviewActive=false;applyTheme(DEFAULT_THEME);
  setThemeStatus("Default colours restored on this device.",false);return true;
 }
 try{
  const result=await sb().from("worth_it_user_themes").delete().eq("user_id",themeUserId);
  if(result.error)throw result.error;
  removeLocal(scopedKey(THEME_KEY,themeUserId));savedTheme=DEFAULT_THEME;themePreviewActive=false;applyTheme(DEFAULT_THEME);
  setThemeStatus("Default Worth It colours restored on your account.",false);
  return true;
 }catch(error){
  if(isMissingCommunitySchema(error)){
   themeRemoteAvailable=false;removeLocal(scopedKey(THEME_KEY,themeUserId));savedTheme=DEFAULT_THEME;themePreviewActive=false;applyTheme(DEFAULT_THEME);
   setThemeStatus("Default colours restored on this device.",false);return true;
  }
  setThemeStatus("The default colours are previewed, but the saved account theme could not be reset. Check your connection and try again.",true);
  console.error("Could not reset Worth It custom theme:",error);
  return false;
 }
}
window.setWorthItCustomThemeSettingsOpen=function(isOpen){
 themeSettingsOpen=Boolean(isOpen);
 if(themeSettingsOpen)return true;
 if(themePreviewActive){
  themePreviewActive=false;
  applyTheme(savedTheme);
  setThemeStatus(themeEntitled?"Your saved theme is active again.":"Preview ended. Upgrade to Premium Lite or Premium to save your theme across Worth It.",false);
  return true;
 }
 return false;
};
function init(){
 installFavouriteFilter();
 $("worthItThemeSaveButton")?.addEventListener("click",saveCustomTheme);
 $("worthItThemeResetButton")?.addEventListener("click",resetCustomTheme);
 ["worthItThemePrimary","worthItThemeSecondary","worthItThemeHover","worthItThemeHeader","worthItThemeName"].forEach(id=>{
  $(id)?.addEventListener("input",()=>{
   if(!themeSettingsOpen){setThemeStatus("Open Settings → Appearance & Accessibility to preview Custom Themes.",false);return;}
   applyTheme({name:$("worthItThemeName")?.value,primary:$("worthItThemePrimary")?.value,secondary:$("worthItThemeSecondary")?.value,hover:$("worthItThemeHover")?.value,header:$("worthItThemeHeader")?.value});
   themePreviewActive=true;
   setThemeStatus(themeEntitled
    ?"Live preview. Save your theme to keep it active across Worth It; leaving without saving restores your saved colours."
    :"Free live preview. Your colours reset when you leave Settings. Premium Lite and Premium members can save and keep their theme across Worth It.",false);
  });
 });
 $("worthItProfileReportButton")?.addEventListener("click",openProfileReport);
 const settingsPage=$("settingsPage");
 if(settingsPage&&typeof MutationObserver==="function"){
  const settingsObserver=new MutationObserver(()=>{
   const visible=settingsPage.style.display!=="none"&&getComputedStyle(settingsPage).display!=="none";
   if(!visible&&themeSettingsOpen)window.setWorthItCustomThemeSettingsOpen(false);
  });
  settingsObserver.observe(settingsPage,{attributes:true,attributeFilter:["style","hidden"]});
 }
 window.addEventListener("worthitsettingspanelchange",event=>{if(event.detail?.open===false)window.setWorthItCustomThemeSettingsOpen(false);});
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