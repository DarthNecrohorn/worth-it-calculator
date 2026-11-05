(function(){
"use strict";
const $ = id => document.getElementById(id);
const sb = () => window.supabaseClient || null;
const FAVOURITES_KEY = "worthItCalculatorFavorites:v1:";
const THEME_KEY = "worthItCustomTheme:v1:";
const DEFAULT_THEME = {
 name:"Worth It",
 primary:"#7C5CFF",secondary:"#38BDF8",hover:"#8B5CF6",header:"#0B1120",
 background:"#070B14",surface:"#11192A",surfaceAlt:"#151F33",
 text:"#F8FAFC",heading:"#FFFFFF",muted:"#94A3B8",link:"#A99BFF",border:"#334155",
 fontFamily:"inter",headingStyle:"modern",bodyStyle:"standard",
 fontSize:"default",headingScale:"balanced",lineHeight:"normal",
 corners:"soft",buttonStyle:"gradient",cardStyle:"glass",
 buttonAnimation:"none",hoverEffect:"none",shadowIntensity:"none",borderThickness:"normal",focusAppearance:"standard"
};
const THEME_COLOR_FIELDS = Object.freeze([
 ["worthItThemePrimary","primary"],["worthItThemeSecondary","secondary"],
 ["worthItThemeHover","hover"],["worthItThemeHeader","header"],
 ["worthItThemeBackground","background"],["worthItThemeSurface","surface"],
 ["worthItThemeSurfaceAlt","surfaceAlt"],["worthItThemeText","text"],
 ["worthItThemeHeading","heading"],["worthItThemeMuted","muted"],
 ["worthItThemeLink","link"],["worthItThemeBorder","border"]
]);
const THEME_SELECT_FIELDS = Object.freeze([
 ["worthItThemeFontFamily","fontFamily",["inter","system","arial","georgia","mono"]],
 ["worthItThemeHeadingStyle","headingStyle",["modern","bold","editorial","technical"]],
 ["worthItThemeBodyStyle","bodyStyle",["standard","comfortable","compact"]],
 ["worthItThemeFontSize","fontSize",["small","default","large"]],
 ["worthItThemeHeadingScale","headingScale",["compact","balanced","large"]],
 ["worthItThemeLineHeight","lineHeight",["tight","normal","relaxed"]],
 ["worthItThemeCorners","corners",["soft","rounded","sharp"]],
 ["worthItThemeButtonStyle","buttonStyle",["gradient","solid","outline"]],
 ["worthItThemeCardStyle","cardStyle",["glass","solid","flat"]],
 ["worthItThemeButtonAnimation","buttonAnimation",["none","subtle","smooth"]],
 ["worthItThemeHoverEffect","hoverEffect",["none","lift","glow"]],
 ["worthItThemeShadowIntensity","shadowIntensity",["none","soft","strong"]],
 ["worthItThemeBorderThickness","borderThickness",["thin","normal","thick"]],
 ["worthItThemeFocusAppearance","focusAppearance",["subtle","standard","prominent"]]
]);
const PREVIEW_REPORTS_KEY = "worthItPreviewReports:v1";
const THEME_RECENT_KEY="worthItThemeRecentColours:v1";
let activeThemePreviewView="website";
let lastActiveThemeColorId="worthItThemePrimary";

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
let themeExpiryTimer = null;
let themeReturnRefreshAt = 0;
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
 const cleaned={
  name:String(theme.name||DEFAULT_THEME.name).trim().slice(0,24)||DEFAULT_THEME.name
 };
 THEME_COLOR_FIELDS.forEach(([,key])=>{
  cleaned[key]=validHex(theme[key])?String(theme[key]).toUpperCase():DEFAULT_THEME[key];
 });
 THEME_SELECT_FIELDS.forEach(([,key,allowed])=>{
  cleaned[key]=allowed.includes(String(theme[key]||""))?String(theme[key]):DEFAULT_THEME[key];
 });
 return cleaned;
}
function themeConfig(theme){
 const clean=cleanTheme(theme);
 const config={};
 THEME_COLOR_FIELDS.slice(4).forEach(([,key])=>{config[key]=clean[key];});
 THEME_SELECT_FIELDS.forEach(([,key])=>{config[key]=clean[key];});
 return config;
}
function readThemeFromForm(){
 const value={name:$("worthItThemeName")?.value||DEFAULT_THEME.name};
 THEME_COLOR_FIELDS.forEach(([id,key])=>{value[key]=$(id)?.value||DEFAULT_THEME[key];});
 THEME_SELECT_FIELDS.forEach(([id,key])=>{value[key]=$(id)?.value||DEFAULT_THEME[key];});
 return cleanTheme(value);
}
function setThemeFormValues(theme){
 THEME_COLOR_FIELDS.forEach(([id,key])=>{const node=$(id);if(node)node.value=theme[key];});
 THEME_SELECT_FIELDS.forEach(([id,key])=>{const node=$(id);if(node)node.value=theme[key];});
 const name=$("worthItThemeName");if(name)name.value=theme.name;
}
function accessibleThemeText(color,surfaces){
 const clean=validHex(color)?color.toUpperCase():"#FFFFFF";
 const backgrounds=(Array.isArray(surfaces)?surfaces:[]).filter(validHex);
 if(!backgrounds.length||backgrounds.every(background=>contrastRatio(clean,background)>=4.5))return clean;
 const candidates=["#FFFFFF","#08111F"];
 return candidates.sort((a,b)=>{
  const score=value=>Math.min(...backgrounds.map(background=>contrastRatio(value,background)));
  return score(b)-score(a);
 })[0];
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
 return Object.keys(DEFAULT_THEME).some(key=>key!=="name"&&theme[key]!==DEFAULT_THEME[key]);
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
 const save=$("worthItThemeSaveButton"),reset=$("worthItThemeResetButton"),previewLabel=$("worthItThemePreviewLabel");
 if(save)save.textContent=themeEntitled?"Save my theme":"Unlock to save →";
 if(previewLabel)previewLabel.textContent=themeEntitled?"Live preview · Save to keep it active":"Free live preview · Save with Premium";
 if(reset)reset.textContent=themeEntitled?"Restore default theme":"Reset preview theme";
 THEME_COLOR_FIELDS.forEach(([id])=>{const node=$(id);if(node)node.disabled=false;});
 THEME_SELECT_FIELDS.forEach(([id])=>{const node=$(id);if(node)node.disabled=false;});
 ["worthItThemeName","worthItThemeResetButton"].forEach(id=>{const node=$(id);if(node)node.disabled=false;});
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

const THEME_PRESETS=[
 {id:"midnight",name:"Midnight",theme:{primary:"#8B5CF6",secondary:"#38BDF8",hover:"#A78BFA",header:"#11152B",background:"#080B18",surface:"#141A31",surfaceAlt:"#1C2542",border:"#394365",text:"#F8FAFC",heading:"#FFFFFF",muted:"#AAB4D0",link:"#B9A7FF",fontFamily:"inter",headingStyle:"modern",bodyStyle:"comfortable"}},
 {id:"minimal",name:"Minimal",theme:{primary:"#3157D5",secondary:"#0EA5A4",hover:"#5275E7",header:"#FFFFFF",background:"#F4F6FA",surface:"#FFFFFF",surfaceAlt:"#E9EEF5",border:"#D5DDE8",text:"#263244",heading:"#111827",muted:"#59677A",link:"#3157D5",fontFamily:"system",buttonStyle:"solid",cardStyle:"solid"}},
 {id:"emerald",name:"Emerald",theme:{primary:"#10B981",secondary:"#A3E635",hover:"#34D399",header:"#082A25",background:"#061B19",surface:"#0D2B27",surfaceAlt:"#123A33",border:"#285A4F",text:"#E6FFF5",heading:"#F0FFF8",muted:"#A6C9BC",link:"#6EE7B7",headingStyle:"bold"}},
 {id:"sunset",name:"Sunset",theme:{primary:"#F97316",secondary:"#EC4899",hover:"#FB923C",header:"#351426",background:"#1D1020",surface:"#311B30",surfaceAlt:"#45213A",border:"#75405C",text:"#FFF4F1",heading:"#FFFFFF",muted:"#D7B8C6",link:"#FDA4AF",fontFamily:"arial"}},
 {id:"ocean",name:"Ocean",theme:{primary:"#0EA5E9",secondary:"#14B8A6",hover:"#38BDF8",header:"#08283B",background:"#061724",surface:"#0C293B",surfaceAlt:"#12384C",border:"#28566B",text:"#E9F8FF",heading:"#FFFFFF",muted:"#A6C8D8",link:"#7DD3FC",fontFamily:"system"}},
 {id:"rose",name:"Rose",theme:{primary:"#E879A8",secondary:"#A78BFA",hover:"#F0A0C2",header:"#2B1728",background:"#180F1B",surface:"#2B1B2C",surfaceAlt:"#39243D",border:"#62405F",text:"#FFF3FA",heading:"#FFFFFF",muted:"#D3B3CA",link:"#F5A8CE",fontFamily:"georgia",headingStyle:"editorial"}}
];
function renderThemePreview(){
 const node=$("worthItThemePreview");if(!node)return;
 const views={
  website:'<span class="worth-it-theme-preview-eyebrow">PERSONAL WORKSPACE</span><h4>Make Worth It yours</h4><p>Your website can have its own colours, typography and personality. <a href="#" tabindex="-1" aria-disabled="true">Explore your options</a></p><div class="worth-it-theme-preview-controls"><span class="worth-it-theme-preview-input">Search Worth It…</span><button class="worth-it-theme-preview-primary" disabled>Explore</button><button class="worth-it-theme-preview-secondary" disabled>Settings</button></div>',
  calculator:'<span class="worth-it-theme-preview-eyebrow">CALCULATOR</span><h4>EV vs Gas</h4><p>Compare electric and gasoline vehicles over five years.</p><div class="worth-it-theme-preview-metrics"><span><small>Electric vehicle</small><strong>$35,000</strong></span><span><small>Annual distance</small><strong>12,000 km</strong></span></div><button class="worth-it-theme-preview-primary" disabled>Calculate</button>',
  shop:'<span class="worth-it-theme-preview-eyebrow">WEB SHOP</span><h4>Premium Lite</h4><p>Unlock extra Worth It features.</p><div class="worth-it-theme-preview-metrics"><span><small>Duration</small><strong>15 days</strong></span><span><small>Price</small><strong>40 WIP</strong></span></div><button class="worth-it-theme-preview-primary" disabled>View plan</button>',
  chat:'<span class="worth-it-theme-preview-eyebrow">AI CHAT</span><h4>Conversation</h4><div class="worth-it-theme-chat-bubble">Hello! How can I help?</div><div class="worth-it-theme-chat-bubble is-user">Compare these options.</div><button class="worth-it-theme-preview-primary" disabled>Send</button>',
  cards:'<span class="worth-it-theme-preview-eyebrow">CONTENT CARDS</span><h4>Example panel</h4><p>This shows your card surface, corners, borders and shadow.</p><div class="worth-it-theme-preview-footer"><span>Account status</span><strong>Active</strong></div>',
  forms:'<span class="worth-it-theme-preview-eyebrow">FORM ELEMENTS</span><h4>Example form</h4><p>Inputs, focus and buttons follow your selected design.</p><div class="worth-it-theme-preview-input">Your name</div><div class="worth-it-theme-preview-input">Email address</div><button class="worth-it-theme-preview-primary" disabled>Submit</button>'
 };
 const view=views[activeThemePreviewView]?activeThemePreviewView:"website";
 node.dataset.previewView=view;
 node.innerHTML='<div class="worth-it-theme-preview-nav"><span class="worth-it-theme-preview-brand"><span class="worth-it-theme-preview-mark">✓</span> Worth It</span><span class="worth-it-theme-preview-chip">LIVE '+view.toUpperCase()+' PREVIEW</span></div><div class="worth-it-theme-preview-card">'+views[view]+'</div>';
 document.querySelectorAll("[data-theme-preview-view]").forEach(button=>{const active=button.dataset.themePreviewView===view;button.setAttribute("aria-pressed",String(active));button.classList.toggle("is-active",active);});
}
function renderThemeContrastAudit(theme){
 const host=$("worthItThemeContrastAudit");if(!host)return;
 const checks=[["Main text","text","background"],["Headings","heading","surface"],["Secondary text","muted","surface"],["Links","link","surface"]];
 host.innerHTML=checks.map(([label,fg,bg])=>{const ratio=contrastRatio(theme[fg],theme[bg]);const pass=ratio>=4.5;return '<div class="worth-it-theme-contrast-row"><span><strong>'+label+'</strong><small>'+ratio.toFixed(2)+':1 · WCAG AA 4.5:1</small></span><span class="worth-it-theme-contrast-status '+(pass?"is-pass":"is-fallback")+'">'+(pass?"AA pass":"Auto fallback")+'</span></div>';}).join("");
}
function recentThemeColours(){try{const values=JSON.parse(readLocal(THEME_RECENT_KEY)||"[]");return Array.isArray(values)?values.filter(validHex).slice(0,10):[];}catch(_){return [];}}
function rememberRecentThemeColour(value){if(!validHex(value))return;const colour=String(value).toUpperCase();writeLocal(THEME_RECENT_KEY,JSON.stringify([colour,...recentThemeColours().filter(item=>item!==colour)].slice(0,10)));renderRecentThemeColours();}
function renderRecentThemeColours(){
 const host=$("worthItThemeRecentColours");if(!host)return;host.replaceChildren();const values=recentThemeColours();
 if(!values.length){const empty=document.createElement("span");empty.className="worth-it-theme-recent-empty";empty.textContent="Your recently used colours will appear here.";host.appendChild(empty);return;}
 values.forEach(value=>{const button=document.createElement("button");button.type="button";button.className="worth-it-theme-recent-swatch";button.style.backgroundColor=value;button.title=value;button.setAttribute("aria-label","Use recent colour "+value);button.addEventListener("click",()=>{const input=$(lastActiveThemeColorId)||$("worthItThemePrimary");if(!input)return;input.value=value;const hex=$(input.id+"Hex");if(hex)hex.value=value;applyTheme(readThemeFromForm());themePreviewActive=true;});host.appendChild(button);});
}
function updateThemeDesigner(theme){
 const clean=cleanTheme(theme);
 THEME_COLOR_FIELDS.forEach(([id,key])=>{const input=$(id),hex=$(id+"Hex"),rgb=$(id+"Rgb");if(input&&hex&&document.activeElement!==hex)hex.value=clean[key];if(rgb)rgb.textContent="RGB "+hexRgb(clean[key]).join(", ");});
 renderRecentThemeColours();renderThemeContrastAudit(clean);renderThemePreview();
 document.querySelectorAll("[data-theme-preset]").forEach(button=>{const preset=THEME_PRESETS.find(item=>item.id===button.dataset.themePreset);const active=Boolean(preset)&&Object.entries(preset.theme).every(([key,value])=>clean[key]===value);button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));});
}
function decorateThemeColourFields(preview){
 THEME_COLOR_FIELDS.forEach(([id,key])=>{
  const input=$(id);if(!input||input.dataset.themeColourEnhanced==="true")return;input.dataset.themeColourEnhanced="true";
  const label=input.closest("label"),row=document.createElement("span");row.className="worth-it-theme-hex-row";
  const hex=document.createElement("input");hex.type="text";hex.id=id+"Hex";hex.className="worth-it-theme-hex-input";hex.value=input.value.toUpperCase();hex.maxLength=7;hex.autocomplete="off";hex.spellcheck=false;hex.placeholder="#RRGGBB";hex.setAttribute("aria-label",(label?.textContent?.trim().split("\n")[0]||key)+" HEX colour");
  const copy=document.createElement("button");copy.type="button";copy.className="worth-it-theme-small-action";copy.textContent="Copy";
  copy.addEventListener("click",async event=>{event.preventDefault();event.stopPropagation();try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(input.value.toUpperCase());else{hex.focus();hex.select();if(!document.execCommand("copy"))throw new Error("Clipboard unavailable");}toast("Copied "+input.value.toUpperCase());}catch(_){hex.focus();hex.select();toast("Select and copy the HEX value manually.");}});
  const reset=document.createElement("button");reset.type="button";reset.className="worth-it-theme-small-action";reset.textContent="Reset";reset.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();input.value=DEFAULT_THEME[key];hex.value=input.value;applyTheme(readThemeFromForm());themePreviewActive=true;});
  row.append(hex,copy,reset);input.insertAdjacentElement("afterend",row);
  const rgb=document.createElement("small");rgb.id=id+"Rgb";rgb.className="worth-it-theme-rgb";row.insertAdjacentElement("afterend",rgb);
  const activate=()=>{lastActiveThemeColorId=id;};input.addEventListener("focus",activate);hex.addEventListener("focus",activate);
  hex.addEventListener("input",()=>{const valid=validHex(hex.value);hex.setAttribute("aria-invalid",String(!valid));if(!valid)return;input.value=hex.value.toUpperCase();rememberRecentThemeColour(input.value);preview();});
  hex.addEventListener("blur",()=>{if(!validHex(hex.value))hex.value=input.value.toUpperCase();});
 });renderRecentThemeColours();
}
function applyThemePreset(id){const preset=THEME_PRESETS.find(item=>item.id===id);if(!preset)return;const theme=cleanTheme({...DEFAULT_THEME,...preset.theme,name:preset.name});setThemeFormValues(theme);applyTheme(theme);themePreviewActive=true;setThemeStatus(preset.name+" preset applied. You can still customize every setting before saving.",false);}
function resetThemeGroup(group){
 const current=readThemeFromForm();
 const groups={colours:THEME_COLOR_FIELDS.map(([,key])=>key),typography:["fontFamily","headingStyle","bodyStyle","fontSize","headingScale","lineHeight"],effects:["corners","buttonStyle","cardStyle","buttonAnimation","hoverEffect","shadowIntensity","borderThickness","focusAppearance"]};
 (groups[group]||[]).forEach(key=>{current[key]=DEFAULT_THEME[key];});
 const next=cleanTheme(current);setThemeFormValues(next);applyTheme(next);themePreviewActive=true;
 setThemeStatus(group==="colours"?"Website colours restored to their Worth It defaults.":group==="typography"?"Typography settings restored to their defaults.":"Interaction and shape settings restored to their defaults.",false);
}
function undoThemeChanges(){const theme=themeEntitled?cleanTheme(savedTheme):DEFAULT_THEME;setThemeFormValues(theme);applyTheme(theme);themePreviewActive=false;setThemeStatus("Unsaved theme changes were discarded. "+(themeEntitled?"Your saved theme is active again.":"The default Worth It preview has been restored."),false);}
function applyTheme(value){
 const selectedTheme=cleanTheme(value);
 activeTheme=selectedTheme;
 const root=document.documentElement;
 // Public profile pages own their full-width banner and avatar styling.
 // Keep the saved palette in memory, but expose only the standard palette on profiles.
 const isolated=root.classList.contains("worth-it-profile-theme-isolated");
 const theme=isolated?DEFAULT_THEME:selectedTheme;
 if(isCustomTheme(theme)){
  const surfaces=[theme.background,theme.surface];
  const bodyFont={
   inter:'"Inter",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',
   system:'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
   arial:'Arial,Helvetica,sans-serif',
   georgia:'Georgia,"Times New Roman",serif',
   mono:'"SFMono-Regular",Consolas,"Liberation Mono",monospace'
  }[theme.fontFamily];
  const headingStyles={
   modern:{family:bodyFont,weight:"800",spacing:"-.025em",transform:"none"},
   bold:{family:bodyFont,weight:"950",spacing:"-.045em",transform:"none"},
   editorial:{family:'Georgia,"Times New Roman",serif',weight:"700",spacing:"-.015em",transform:"none"},
   technical:{family:'"SFMono-Regular",Consolas,"Liberation Mono",monospace',weight:"800",spacing:".035em",transform:"uppercase"}
  }[theme.headingStyle];
  const bodyStyles={
   standard:{line:"1.55",spacing:"normal"},
   comfortable:{line:"1.72",spacing:".01em"},
   compact:{line:"1.42",spacing:"-.005em"}
  }[theme.bodyStyle];
  const radii={
   soft:{card:"16px",control:"10px"},
   rounded:{card:"26px",control:"16px"},
   sharp:{card:"7px",control:"5px"}
  }[theme.corners];
  const cardAlpha=theme.cardStyle==="glass"?"82%":theme.cardStyle==="flat"?"68%":"100%";
  root.style.setProperty("--bg",theme.background);
  root.style.setProperty("--bg2",theme.background);
  root.style.setProperty("--card-solid",theme.surface);
  root.style.setProperty("--card2",theme.surfaceAlt);
  root.style.setProperty("--card","color-mix(in srgb,"+theme.surface+" "+cardAlpha+",transparent)");
  root.style.setProperty("--surface-soft","color-mix(in srgb,"+theme.surfaceAlt+" 74%,transparent)");
  root.style.setProperty("--border",theme.border);
  root.style.setProperty("--text",accessibleThemeText(theme.text,surfaces));
  root.style.setProperty("--muted",accessibleThemeText(theme.muted,surfaces));
  root.style.setProperty("--muted2",accessibleThemeText(theme.muted,surfaces));
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
  root.style.setProperty("--worth-it-theme-heading-color",accessibleThemeText(theme.heading,surfaces));
  root.style.setProperty("--worth-it-theme-link-color",accessibleThemeText(theme.link,surfaces));
  root.style.setProperty("--worth-it-theme-font-family",bodyFont);
  root.style.setProperty("--worth-it-theme-heading-font-family",headingStyles.family);
  root.style.setProperty("--worth-it-theme-heading-weight",headingStyles.weight);
  root.style.setProperty("--worth-it-theme-heading-letter-spacing",headingStyles.spacing);
  root.style.setProperty("--worth-it-theme-heading-transform",headingStyles.transform);
  root.style.setProperty("--worth-it-theme-body-line-height",bodyStyles.line);
  root.style.setProperty("--worth-it-theme-body-letter-spacing",bodyStyles.spacing);
  const fontSizes={small:"0.94rem",default:"1rem",large:"1.08rem"};
  const headingScales={compact:"0.94",balanced:"1",large:"1.16"};
  const lineHeights={tight:"1.35",normal:bodyStyles.line,relaxed:"1.82"};
  root.style.setProperty("--worth-it-theme-font-size",fontSizes[theme.fontSize]);
  root.style.setProperty("--worth-it-theme-heading-scale",headingScales[theme.headingScale]);
  root.style.setProperty("--worth-it-theme-body-line-height",lineHeights[theme.lineHeight]);
  root.dataset.worthItButtonAnimation=theme.buttonAnimation;
  root.dataset.worthItHoverEffect=theme.hoverEffect;
  root.dataset.worthItShadowIntensity=theme.shadowIntensity;
  root.dataset.worthItBorderThickness=theme.borderThickness;
  root.dataset.worthItFocusAppearance=theme.focusAppearance;
  root.style.setProperty("--radius",radii.card);
  root.style.setProperty("--worth-it-theme-control-radius",radii.control);
  root.dataset.worthItCustomTheme=theme.name||"Custom";
  root.dataset.worthItButtonStyle=theme.buttonStyle;
  root.dataset.worthItCardStyle=theme.cardStyle;
  root.dataset.worthItCorners=theme.corners;
 }else{
  [
   "--bg","--bg2","--card","--card-solid","--card2","--border","--text","--muted","--muted2",
   "--primary","--primary2","--worth-it-hover-glow","--worth-it-theme-gradient",
   "--worth-it-header-background","--worth-it-header-foreground","--worth-it-hover-foreground",
   "--worth-it-gradient-foreground","--worth-it-primary-readable","--worth-it-secondary-readable",
   "--worth-it-theme-heading-color","--worth-it-theme-link-color","--worth-it-theme-font-family",
   "--worth-it-theme-heading-font-family","--worth-it-theme-heading-weight","--worth-it-theme-heading-letter-spacing",
   "--worth-it-theme-heading-transform","--worth-it-theme-body-line-height","--worth-it-theme-body-letter-spacing",
   "--worth-it-theme-font-size","--worth-it-theme-heading-scale",
   "--worth-it-theme-control-radius","--surface-soft"
  ].forEach(property=>root.style.removeProperty(property));
  root.style.removeProperty("--radius");
  root.removeAttribute("data-worth-it-custom-theme");
  delete root.dataset.worthItButtonStyle;delete root.dataset.worthItCardStyle;delete root.dataset.worthItCorners;
  delete root.dataset.worthItButtonAnimation;delete root.dataset.worthItHoverEffect;
  delete root.dataset.worthItShadowIntensity;delete root.dataset.worthItBorderThickness;delete root.dataset.worthItFocusAppearance;
 }
 setThemeFormValues(selectedTheme);
 const preview=$("worthItThemePreview");
 if(preview)preview.classList.toggle("is-custom",isCustomTheme(selectedTheme));
 updateThemeDesigner(selectedTheme);
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
async function clearThemeAfterExpiry(userId,request){
 savedTheme=DEFAULT_THEME;
 removeLocal(scopedKey(THEME_KEY,userId));
 themeRemoteAvailable=userId?null:false;
 if(userId&&themeRemoteAvailable!==false){
  try{
   const result=await sb().from("worth_it_user_themes").delete().eq("user_id",userId);
   if(result.error)throw result.error;
   themeRemoteAvailable=true;
  }catch(error){
   if(isMissingCommunitySchema(error))themeRemoteAvailable=false;
   else console.warn("Expired Custom Theme could not be removed from the account:",error);
  }
 }
 if(request!==themeRequest||themeUserId!==userId)return false;
 return true;
}
function scheduleThemeExpiry(wallet,userId){
 if(themeExpiryTimer){window.clearTimeout(themeExpiryTimer);themeExpiryTimer=null;}
 if(!wallet||wallet.is_owner===true||!userId)return;
 const expiry=Date.parse(wallet.premium_expires_at||"");
 if(!Number.isFinite(expiry))return;
 const maxDelay=2147480000;
 const delay=Math.max(250,Math.min(maxDelay,expiry-Date.now()+750));
 themeExpiryTimer=window.setTimeout(()=>{
  if(themeUserId!==userId)return;
  if(Date.now()<expiry){scheduleThemeExpiry(wallet,userId);return;}
  void loadThemeForSession();
 },delay);
}
async function loadThemeForSession(){
 const request=++themeRequest;let session=null,wallet=null,sessionResolved=false,walletResolved=false;
 const livePreview=themePreviewActive&&themeSettingsOpen?activeTheme:null;
 try{
  const result=await sb()?.auth?.getSession?.();
  if(result?.error)throw result.error;
  session=result?.data?.session||null;sessionResolved=true;
 }catch(error){console.warn("Could not verify the Worth It session for Custom Themes:",error);}
 if(request!==themeRequest)return;
 const userId=session?.user?.id||"";
 themeUserId=userId;
 if(themeExpiryTimer){window.clearTimeout(themeExpiryTimer);themeExpiryTimer=null;}
 if(!sessionResolved){
  themeEntitled=false;themeEntitlementResolved=false;updateThemeAccessUI();
  applyTheme(livePreview||DEFAULT_THEME);
  setThemeStatus("Your account status could not be verified. No saved theme was deleted; try again when your connection is restored.",true);
  return;
 }
 if(!userId){
  themeRemoteAvailable=false;themeEntitled=false;themeEntitlementResolved=true;savedTheme=DEFAULT_THEME;
  updateThemeAccessUI();applyTheme(livePreview||DEFAULT_THEME);
  setThemeStatus("You can preview all Custom Theme options here. Sign in with Premium Lite or Premium to save a theme.",false);
  return;
 }
 themeRemoteAvailable=null;
 try{
  wallet=await window.refreshWorthItCalcWallet?.()||null;
  walletResolved=Boolean(wallet&&wallet.ok===true&&!wallet.is_guest);
 }catch(error){console.warn("Could not verify Premium access for Custom Themes:",error);}
 if(request!==themeRequest||themeUserId!==userId)return;
 if(!walletResolved){
  themeEntitled=false;themeEntitlementResolved=false;updateThemeAccessUI();
  applyTheme(livePreview||DEFAULT_THEME);
  setThemeStatus("Your subscription could not be verified. You can still preview colours, but no saved theme has been changed. Please retry when the account service is available.",true);
  return;
 }
 themeEntitled=hasPremiumThemeAccess(wallet);
 themeEntitlementResolved=true;
 updateThemeAccessUI();
 if(!themeEntitled){
  const hadSavedTheme=Boolean(readLocal(scopedKey(THEME_KEY,userId)));
  await clearThemeAfterExpiry(userId,request);
  if(request!==themeRequest||themeUserId!==userId)return;
  applyTheme(livePreview||DEFAULT_THEME);
  setThemeStatus(hadSavedTheme
   ?"Your Premium subscription is no longer active. Your saved Custom Theme was reset to the default. You can continue trying colours for free."
   :"Try every colour below. Your preview lasts while Settings is open; saving and keeping it active across Worth It is a Premium Lite and Premium benefit.",false);
  return;
 }
 scheduleThemeExpiry(wallet,userId);
 try{
  const raw=readLocal(scopedKey(THEME_KEY,userId));
  savedTheme=raw?cleanTheme(JSON.parse(raw)):DEFAULT_THEME;
  applyTheme(livePreview||savedTheme);
 }catch(_){savedTheme=DEFAULT_THEME;applyTheme(livePreview||DEFAULT_THEME);}
 try{
  const result=await sb().from("worth_it_user_themes")
   .select("theme_name,primary_color,secondary_color,hover_color,header_color,theme_config")
   .eq("user_id",userId).maybeSingle();
  if(request!==themeRequest||themeUserId!==userId)return;
  if(result.error)throw result.error;
  if(result.data){
   const config=result.data.theme_config&&typeof result.data.theme_config==="object"?result.data.theme_config:{};
   savedTheme=cleanTheme({
    name:result.data.theme_name,primary:result.data.primary_color,secondary:result.data.secondary_color,
    hover:result.data.hover_color,header:result.data.header_color,...config
   });
   writeLocal(scopedKey(THEME_KEY,userId),JSON.stringify(savedTheme));
   applyTheme(livePreview||savedTheme);
  }else{
   savedTheme=DEFAULT_THEME;removeLocal(scopedKey(THEME_KEY,userId));
   applyTheme(livePreview||DEFAULT_THEME);
  }
  themeRemoteAvailable=true;
 }catch(error){
  if(isMissingCommunitySchema(error)){
   themeRemoteAvailable=false;
   setThemeStatus("Preview-only: your saved Premium theme is stored on this device and will sync after the theme design migration is installed.",false);
  }else{console.warn("Worth It custom theme could not be synchronised:",error);}
 }
}
async function saveCustomTheme(){
 if(!themeSettingsOpen){setThemeStatus("Open Settings → Appearance & Accessibility to save a Custom Theme.",true);return;}
 if(!themeEntitlementResolved||!themeEntitled){
  setThemeStatus("You can try every colour and style for free. Saving your complete theme and keeping it active across Worth It requires Premium Lite or Premium.",true);
  window.openWorthItThemeUpgrade?.();
  return;
 }
 const theme=readThemeFromForm();
 if(!isCustomTheme(theme)){setThemeStatus("Choose at least one setting that differs from the default Worth It theme before saving.",true);return;}
 if(!themeUserId){setThemeStatus("Sign in with your Premium account to save and sync your custom theme.",true);return;}
 const button=$("worthItThemeSaveButton");if(button)button.disabled=true;
 try{
  if(themeRemoteAvailable===false){
   savedTheme=theme;writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(theme));
   themePreviewActive=false;applyTheme(theme);
   setThemeStatus("Your custom theme is saved on this device. Account sync will activate after the theme design migration is installed.",false);
   return;
  }
  const result=await sb().from("worth_it_user_themes").upsert({
   user_id:themeUserId,theme_name:theme.name,
   primary_color:theme.primary,secondary_color:theme.secondary,hover_color:theme.hover,header_color:theme.header,
   theme_config:themeConfig(theme),updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(result.error)throw result.error;
  savedTheme=theme;writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(theme));
  themePreviewActive=false;applyTheme(theme);
  setThemeStatus("Your complete custom theme is saved and will stay active across Worth It.",false);
 }catch(error){
  if(isMissingCommunitySchema(error)){
   themeRemoteAvailable=false;savedTheme=theme;writeLocal(scopedKey(THEME_KEY,themeUserId),JSON.stringify(theme));
   themePreviewActive=false;applyTheme(theme);
   setThemeStatus("Your custom theme is saved on this device. Account sync will activate after the theme design migration is installed.",false);
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
 $("worthItThemeUndoButton")?.addEventListener("click",undoThemeChanges);
 $("worthItThemeRandomPalette")?.addEventListener("click",()=>{
  const activeId=document.querySelector("[data-theme-preset].is-active")?.dataset.themePreset;
  const choices=THEME_PRESETS.filter(item=>item.id!==activeId),next=choices[Math.floor(Math.random()*choices.length)];
  if(next)applyThemePreset(next.id);
 });
 $("worthItThemePresetGrid")?.addEventListener("click",event=>{const button=event.target.closest("[data-theme-preset]");if(button)applyThemePreset(button.dataset.themePreset);});
 $("worthItThemePreviewSwitcher")?.addEventListener("click",event=>{const button=event.target.closest("[data-theme-preview-view]");if(!button)return;activeThemePreviewView=button.dataset.themePreviewView||"website";renderThemePreview();});
 document.querySelectorAll("[data-theme-reset-group]").forEach(button=>button.addEventListener("click",()=>resetThemeGroup(button.dataset.themeResetGroup)));
 const previewThemeFromForm=()=>{
  if(!themeSettingsOpen){setThemeStatus("Open Settings → Appearance & Accessibility to preview Custom Themes.",false);return;}
  const theme=readThemeFromForm();
  applyTheme(theme);themePreviewActive=true;
  setThemeStatus(themeEntitled
   ?"Live preview. Save your complete theme to keep all colours and styles active across Worth It; leaving without saving restores your saved design."
   :"Free live preview. Try colours, fonts, heading styles, buttons and corners. Your preview resets when you leave Settings; Premium Lite and Premium members can save it.",false);
 };
 decorateThemeColourFields(previewThemeFromForm);
 THEME_COLOR_FIELDS.forEach(([id])=>{
  const input=$(id);
  input?.addEventListener("input",previewThemeFromForm);
  input?.addEventListener("change",()=>{rememberRecentThemeColour(input.value);previewThemeFromForm();});
 });
 THEME_SELECT_FIELDS.forEach(([id])=>{
  $(id)?.addEventListener("change",previewThemeFromForm);
 });
 $("worthItThemeName")?.addEventListener("input",previewThemeFromForm);
 $("worthItProfileReportButton")?.addEventListener("click",openProfileReport);
 const settingsPage=$("settingsPage");
 if(settingsPage&&typeof MutationObserver==="function"){
  const settingsObserver=new MutationObserver(()=>{
   const visible=settingsPage.style.display!=="none"&&getComputedStyle(settingsPage).display!=="none";
   if(!visible&&themeSettingsOpen)window.setWorthItCustomThemeSettingsOpen(false);
  });
  settingsObserver.observe(settingsPage,{attributes:true,attributeFilter:["style","hidden"]});
 }
 window.addEventListener("worthitsettingspanelchange",event=>{if(event.detail?.open===false){const page=$("settingsPage");if(!page||page.style.display==="none")window.setWorthItCustomThemeSettingsOpen(false);}});
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
 const refreshThemeOnReturn=()=>{
  if(document.hidden)return;
  const now=Date.now();
  if(now-themeReturnRefreshAt<5000)return;
  themeReturnRefreshAt=now;
  void loadThemeForSession();
 };
 window.addEventListener("focus",refreshThemeOnReturn);
 window.addEventListener("pageshow",refreshThemeOnReturn);
 document.addEventListener("visibilitychange",refreshThemeOnReturn);
 if(sb()?.auth?.onAuthStateChange)sb().auth.onAuthStateChange(()=>{
  setTimeout(()=>{void loadFavouritesForSession();void loadThemeForSession();scheduleReportButtonUpdate();},0);
 });
}
window.refreshWorthItCommunityFeatures=function(){void loadFavouritesForSession();void loadThemeForSession();scheduleReportButtonUpdate();};
window.refreshWorthItCustomTheme=loadThemeForSession;
window.resetWorthItCustomTheme=resetCustomTheme;
window.isWorthItCustomThemeActive=()=>Boolean(document.documentElement?.hasAttribute("data-worth-it-custom-theme"));
window.openWorthItThemeUpgrade=async function(){
 let session=null;try{session=(await sb()?.auth?.getSession?.())?.data?.session||null;}catch(_){}
 if(!session){if(typeof window.openAuthModal==="function")window.openAuthModal("signup");else toast("Sign in to explore Premium subscriptions.");return;}
 if(typeof window.openWebShop==="function")window.openWebShop("subscriptions");
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();