/* Worth It profiles: account summary, shareable profile section, and public profile URLs. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const BASE_URL="https://worth-it-calculator.pages.dev";
let currentUser=null,currentOwnProfile=null,currentOwnProfileRequest=null,activeProfileRequest=0,currentProfileLink="",currentDisplayedProfileId=0,currentDisplayedProfileIsOwn=false,avatarOperationInProgress=false,assetLimitTimers={avatar:null,banner:null},currentSocialContext=null,activeSocialRefresh=0,activeConnectionsRequest=0,socialActionInProgress=false,profileDescriptionStatusRequest=0,profileDescriptionSaving=false,profileDescriptionStatusReady=false,profileDescriptionSavedValue="",profileDescriptionNextSaveAt=0,profileDescriptionCooldownTimer=null;
const client=()=>window.supabaseClient||null;
const PRESENCE_ONLINE_WINDOW_MS=150000;
let presenceHeartbeatTimer=null,presenceDisplayTimer=null,presenceLastHeartbeatAt=0,presenceHeartbeatBusy=false,presenceDisplayBusy=false;
const presenceLastSeenById=new Map();
function getWorthItPresenceInfo(person){
 const ownWorthItId=currentOwnProfile?.profile?.worth_it_id;
 if(currentUser?.id&&ownWorthItId!=null&&person?.worth_it_id!=null&&String(person.worth_it_id)===String(ownWorthItId)){
  return{online:true,label:"Online now",lastSeenAt:person?.last_seen_at||new Date().toISOString()};
 }
 const cached=person?.worth_it_id!=null?presenceLastSeenById.get(String(person.worth_it_id)):null;
 const raw=person?.last_seen_at||person?.lastSeenAt||cached||null,stamp=raw?new Date(raw).getTime():NaN,delta=Number.isFinite(stamp)?Date.now()-stamp:Infinity;
 if(Number.isFinite(stamp)&&delta>=-60000&&delta<=PRESENCE_ONLINE_WINDOW_MS)return{online:true,label:"Online now",lastSeenAt:raw};
 if(!Number.isFinite(stamp))return{online:false,label:"Offline · last seen unavailable",lastSeenAt:null};
 const minutes=Math.max(1,Math.floor(Math.max(0,delta)/60000));let relative;
 if(minutes<60)relative=minutes+" "+(minutes===1?"minute":"minutes");
 else if(minutes<1440){const hours=Math.floor(minutes/60),rest=minutes%60;relative=hours+" "+(hours===1?"hour":"hours")+(rest>=10?" "+rest+" min":"");}
 else{const days=Math.floor(minutes/1440);relative=days+" "+(days===1?"day":"days");}
 return{online:false,label:"Last seen "+relative+" ago",lastSeenAt:raw};
}
function updateWorthItPresenceNode(node,lastSeenAt){
 if(!node)return;const info=getWorthItPresenceInfo({worth_it_id:node.dataset.worthItPresenceId,last_seen_at:lastSeenAt||null});
 node.classList.toggle("is-online",info.online);node.classList.toggle("is-offline",!info.online);node.dataset.lastSeenAt=lastSeenAt||"";
 const presenceLabel=info.online?"Online":"Offline";
 if(node.classList.contains("worth-it-presence-indicator")){node.dataset.presenceStatus=presenceLabel;node.title=presenceLabel;node.setAttribute("aria-label",presenceLabel);const tooltip=node._worthItPresenceTooltip||node.querySelector(".worth-it-presence-tooltip");if(tooltip)tooltip.textContent=presenceLabel;}
 else{node.title=info.label;node.setAttribute("aria-label",info.label);}
 if(node.classList.contains("worth-it-profile-presence-text")){const dot=node.querySelector(".worth-it-presence-status-dot"),label=node.querySelector(".worth-it-presence-label");if(dot){dot.classList.toggle("is-online",info.online);dot.classList.toggle("is-offline",!info.online);}if(label)label.textContent=info.label;}
 if(node.classList.contains("worth-it-person-presence-label")||node.classList.contains("worth-it-chat-person-presence")||node.classList.contains("worth-it-user-search-presence"))node.textContent=info.label;
}
function appendWorthItPresenceIndicator(host,person){
 if(!host||!person||person.worth_it_id==null)return;host.classList.add("worth-it-presence-host");host.querySelectorAll(":scope > .worth-it-presence-indicator").forEach(node=>node.remove());
 const marker=document.createElement("span");marker.className="worth-it-presence-indicator";marker.dataset.worthItPresenceId=String(person.worth_it_id);marker.dataset.lastSeenAt=person.last_seen_at||"";marker.setAttribute("role","button");marker.setAttribute("tabindex","0");
 const tooltip=document.createElement("span");tooltip.className="worth-it-presence-tooltip";tooltip.setAttribute("aria-hidden","true");tooltip.textContent=person.last_seen_at?getWorthItPresenceInfo(person).online?"Online":"Offline":"Offline";marker._worthItPresenceTooltip=tooltip;marker.appendChild(tooltip);
 const hideTooltip=()=>{tooltip.classList.remove("is-visible","is-portal","is-below");tooltip.setAttribute("aria-hidden","true");tooltip.remove();marker.classList.remove("is-tooltip-open");};
 const showTooltip=()=>{
  document.querySelectorAll(".worth-it-presence-tooltip.is-portal").forEach(other=>{if(other!==tooltip){other.classList.remove("is-visible","is-portal","is-below");other.setAttribute("aria-hidden","true");other.remove();}});
  tooltip.classList.add("is-portal");document.body.appendChild(tooltip);
  const rect=marker.getBoundingClientRect(),height=tooltip.getBoundingClientRect().height||22;
  const below=rect.top<height+14,center=Math.max(58,Math.min(window.innerWidth-58,rect.left+rect.width/2));
  tooltip.classList.toggle("is-below",below);tooltip.style.left=center+"px";tooltip.style.top=(below?rect.bottom+7:rect.top-7)+"px";
  tooltip.classList.add("is-visible");tooltip.setAttribute("aria-hidden","false");
 };
 marker.addEventListener("mouseenter",showTooltip);
 marker.addEventListener("mouseleave",hideTooltip);
 marker.addEventListener("focus",showTooltip);
 marker.addEventListener("blur",hideTooltip);
 marker.addEventListener("pointerdown",event=>{if(event.pointerType!=="touch")return;event.stopPropagation();event.preventDefault();if(tooltip.classList.contains("is-visible"))hideTooltip();else{showTooltip();marker.classList.add("is-tooltip-open");}});
 marker.addEventListener("click",event=>{event.stopPropagation();event.preventDefault();});
 marker.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.stopPropagation();event.preventDefault();if(tooltip.classList.contains("is-visible"))hideTooltip();else{showTooltip();marker.classList.add("is-tooltip-open");}}else if(event.key==="Escape")hideTooltip();});
 updateWorthItPresenceNode(marker,person.last_seen_at);host.appendChild(marker);
}
function renderWorthItProfilePresence(person){
 const host=$("worthItProfilePresence");if(!host)return;host.replaceChildren();host.className="worth-it-profile-presence-text";host.dataset.worthItPresenceId=String(person?.worth_it_id||"");
 const dot=document.createElement("span");dot.className="worth-it-presence-status-dot";dot.setAttribute("aria-hidden","true");const label=document.createElement("span");label.className="worth-it-presence-label";host.append(dot,label);updateWorthItPresenceNode(host,person?.last_seen_at);host.hidden=false;
}
async function refreshWorthItPresenceDisplay(){
 if(presenceDisplayBusy||document.visibilityState==="hidden")return;const sb=client();if(!sb)return;
 const nodes=Array.from(document.querySelectorAll("[data-worth-it-presence-id]")),ids=Array.from(new Set(nodes.map(node=>Number(node.dataset.worthItPresenceId)).filter(id=>Number.isSafeInteger(id)&&id>0))).slice(0,200);
 if(!ids.length)return;presenceDisplayBusy=true;
 try{const result=await sb.from("worth_it_public_profiles").select("worth_it_id,last_seen_at").in("worth_it_id",ids);if(result.error||!Array.isArray(result.data))return;
  const timestamps=new Map(result.data.map(row=>[String(row.worth_it_id),row.last_seen_at||null]));timestamps.forEach((value,key)=>presenceLastSeenById.set(key,value));
  nodes.forEach(node=>{const id=String(node.dataset.worthItPresenceId||"");if(timestamps.has(id))updateWorthItPresenceNode(node,timestamps.get(id));});
 }catch(_){}finally{presenceDisplayBusy=false;}
}
async function touchWorthItPresence(force){
 if(!currentUser?.id||!client()||document.visibilityState==="hidden"||presenceHeartbeatBusy)return;if(!force&&Date.now()-presenceLastHeartbeatAt<55000)return;
 presenceHeartbeatBusy=true;presenceLastHeartbeatAt=Date.now();try{const result=await client().rpc("touch_worth_it_presence");if(result.error)presenceLastHeartbeatAt=0;}catch(_){presenceLastHeartbeatAt=0;}finally{presenceHeartbeatBusy=false;}
}
function startWorthItPresenceTimers(){if(presenceHeartbeatTimer===null)presenceHeartbeatTimer=window.setInterval(()=>touchWorthItPresence(false),60000);if(presenceDisplayTimer===null)presenceDisplayTimer=window.setInterval(()=>refreshWorthItPresenceDisplay(),30000);}
window.getWorthItPresenceInfo=getWorthItPresenceInfo;window.renderWorthItPresenceIndicator=appendWorthItPresenceIndicator;window.refreshWorthItPresenceDisplay=refreshWorthItPresenceDisplay;
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){touchWorthItPresence(true);refreshWorthItPresenceDisplay();}});
window.addEventListener("focus",()=>touchWorthItPresence(true),{passive:true});startWorthItPresenceTimers();
function setText(id,value){const n=$(id);if(n)n.textContent=value==null?"":String(value);}
function setCount(id,value){const n=$(id);if(!n)return;const v=Number(value);n.textContent=Number.isFinite(v)&&v>=0?Math.trunc(v).toLocaleString():"—";}
function setStatus(msg,isError){const n=$("worthItProfileStatus");if(!n)return;n.textContent=msg||"";n.hidden=!msg;n.classList.toggle("is-error",Boolean(msg&&isError));}
function showProfileSection(){
 if(typeof window.hideCarsNavigationUi==="function")window.hideCarsNavigationUi();
 if(typeof window.hideWaterLevelsSection==="function")window.hideWaterLevelsSection();
 if(typeof window.hideShipTrackingSection==="function")window.hideShipTrackingSection();
 ["homePage","carsSection","weatherSection","newsSection","discountsSection","shopSection","marketsSection","moneySection","cryptoSection","waterLevelsSection","shipTrackingSection","settingsPanel"].forEach(id=>{const n=$(id);if(n)n.style.display="none";});
 document.querySelectorAll(".app").forEach(n=>{n.classList.remove("active");n.style.display="none";});
 $("accountPanel")?.classList.remove("open");$("accountPanel")?.setAttribute("aria-hidden","true");$("accountPageOverlay")?.classList.remove("open");
 const section=$("profileSection");if(section)section.style.display="block";
 const nav=$("navLinks");if(nav&&typeof window.closeNavMenuUnlessPreserved==="function")window.closeNavMenuUnlessPreserved(nav);else if(typeof window.closeMoreMenu==="function")window.closeMoreMenu();
 document.documentElement.classList.remove("settings-open");document.documentElement.style.overflowY="auto";document.body.style.overflowY="auto";window.scrollTo({top:0,behavior:"auto"});
}
window.hideWorthItProfileSection=function(){const n=$("profileSection");if(n)n.style.display="none";clearProfileBannerBackdrop(false);};
function fallbackAvatar(name){const n=document.createElement("div");n.className="worth-it-profile-avatar-fallback";n.textContent=String(name||"W").trim().charAt(0).toUpperCase()||"W";return n;}
function safeAvatarUrl(url){return typeof url==="string"&&/^https?:\/\//i.test(url)?url:"";}
function renderAvatar(url,name,person){const host=$("worthItProfileAvatar");if(!host)return;host.replaceChildren();const safe=safeAvatarUrl(url);if(!safe)host.appendChild(fallbackAvatar(name));else{const img=document.createElement("img");img.className="worth-it-profile-avatar";img.alt="";img.referrerPolicy="no-referrer";img.src=safe;img.addEventListener("error",()=>{host.replaceChildren(fallbackAvatar(name));appendWorthItPresenceIndicator(host,person);},{once:true});host.appendChild(img);}appendWorthItPresenceIndicator(host,person);}
function syncProfileBannerBackdropPosition(){
 if(!document.documentElement.classList.contains("profile-banner-active"))return;
 const nav=document.querySelector(".nav");
 const bottom=nav?nav.getBoundingClientRect().bottom:0;
 document.documentElement.style.setProperty("--profile-banner-top",Math.max(0,Math.round(bottom))+"px");
}
function clearProfileBannerBackdrop(removeSource){
 const section=$("profileSection"),cover=$("worthItProfileCover"),card=cover?.closest(".worth-it-profile-card"),image=$("worthItProfileBannerImage");
 document.documentElement.classList.remove("profile-banner-active");
 if(image){image.onerror=null;image.hidden=true;if(removeSource)image.removeAttribute("src");}
 section?.classList.remove("has-banner");cover?.classList.remove("has-banner");card?.classList.remove("has-banner");
}
function renderBanner(url){
 const section=$("profileSection"),cover=$("worthItProfileCover"),image=$("worthItProfileBannerImage"),card=cover?.closest(".worth-it-profile-card");
 if(!section||!cover||!image||!card)return;
 const safe=safeAvatarUrl(url);
 if(!safe){clearProfileBannerBackdrop(true);return;}
 if(image.parentElement!==document.body)document.body.prepend(image);
 image.classList.add("profile-banner-backdrop");
 image.onerror=()=>{clearProfileBannerBackdrop(true);image.onerror=null;};
 image.src=safe;image.hidden=false;
 section.classList.add("has-banner");cover.classList.add("has-banner");
 syncProfileBannerBackdropPosition();
 document.documentElement.classList.add("profile-banner-active");
}
function renderSmallAvatar(host,url,name,imageClass,fallbackClass,person){if(!host)return;host.replaceChildren();const fallback=()=>{const node=document.createElement("div");node.className=fallbackClass;node.textContent=String(name||"W").trim().charAt(0).toUpperCase()||"W";host.appendChild(node);};const safe=safeAvatarUrl(url);if(!safe)fallback();else{const img=document.createElement("img");img.className=imageClass;img.alt="";img.referrerPolicy="no-referrer";img.src=safe;img.addEventListener("error",()=>{host.replaceChildren();fallback();appendWorthItPresenceIndicator(host,person);},{once:true});host.appendChild(img);}appendWorthItPresenceIndicator(host,person);}
function renderAccountPanelBanner(url){
 const panel=$("accountPanel"),image=$("accountPanelBannerImage");
 if(!panel||!image)return;
 const safe=safeAvatarUrl(url);
 if(!safe){image.onerror=null;image.removeAttribute("src");image.hidden=true;panel.classList.remove("has-banner");return;}
 image.onerror=()=>{image.hidden=true;panel.classList.remove("has-banner");image.removeAttribute("src");image.onerror=null;};
 image.src=safe;image.hidden=false;panel.classList.add("has-banner");
}
function syncHeaderAvatar(profile){const name=profile?.display_name||profile?.username||currentUser?.user_metadata?.full_name||currentUser?.email?.split("@")[0]||"Worth It",person={...profile,worth_it_id:profile?.worth_it_id,last_seen_at:profile?.last_seen_at};renderSmallAvatar($("profileNavIcon"),profile?.avatar_url,name,"auth-avatar","auth-avatar-fallback",person);renderSmallAvatar($("accountHeadAvatar"),profile?.avatar_url,name,"account-head-avatar","account-head-fallback",person);const accountName=$("accountName");if(accountName)accountName.textContent=name;renderAccountPanelBanner(profile?.banner_url);}
function normalizeStats(data){let d=Array.isArray(data)?data[0]:data;d=d&&typeof d==="object"?d:{};return{friends:Number(d.friends)||0,followers:Number(d.followers)||0,following:Number(d.following)||0};}
async function getStats(id){const sb=client();if(!sb||!Number.isSafeInteger(Number(id)))throw new Error("Stats unavailable");const r=await sb.rpc("get_worth_it_profile_stats",{target_worth_it_id:Number(id)});if(r.error)throw r.error;return normalizeStats(r.data);}
async function getOwnProfileRow(user,force){
 if(!user?.id)return null;
 if(!force&&currentOwnProfile?.userId===user.id)return currentOwnProfile.profile;
 if(!force&&currentOwnProfileRequest?.userId===user.id)return currentOwnProfileRequest.promise;
 const sb=client();if(!sb)throw new Error("Auth not ready");
 const promise=(async()=>{const r=await sb.from("worth_it_profiles").select("worth_it_id,username,display_name,avatar_url,banner_url,created_at").eq("user_id",user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error("Worth It ID has not been assigned");currentUser=user;currentOwnProfile={userId:user.id,profile:r.data};syncHeaderAvatar(r.data);touchWorthItPresence(true);return r.data;})();
 currentOwnProfileRequest={userId:user.id,promise};
 try{return await promise;}finally{if(currentOwnProfileRequest?.promise===promise)currentOwnProfileRequest=null;}
}
async function getCurrentUser(){const sb=client();if(!sb?.auth)return null;const r=await sb.auth.getUser();if(r.error)throw r.error;currentUser=r.data?.user||null;return currentUser;}
function setPanelLoading(){["accountPanelFriends","accountPanelFollowers","accountPanelFollowing"].forEach(id=>setText(id,"…"));}
function setPanelUnavailable(){["accountPanelFriends","accountPanelFollowers","accountPanelFollowing"].forEach(id=>setText(id,"—"));}
async function refreshAccountPanelCounts(force){
 if(!client()?.auth)return;
 try{const user=currentUser||await getCurrentUser();if(!user){setPanelUnavailable();return;}const p=await getOwnProfileRow(user,Boolean(force));const s=await getStats(p.worth_it_id);setCount("accountPanelFriends",s.friends);setCount("accountPanelFollowers",s.followers);setCount("accountPanelFollowing",s.following);}
 catch(e){setPanelUnavailable();console.warn("Worth It profile summary is unavailable until the profile SQL setup is applied.",e);}
}
function closeAccountDropdown(){const n=$("accountPanel");if(n){n.classList.remove("open");n.setAttribute("aria-hidden","true");}}
async function openOwnProfile(){
 try{const user=await getCurrentUser();if(!user){if(typeof window.showToast==="function")window.showToast("Please sign in first.");return;}const p=await getOwnProfileRow(user,true);window.openWorthItProfile(p.worth_it_id);}
 catch(e){console.error("Could not open Worth It profile.",e);if(typeof window.showToast==="function")window.showToast("Profile setup is not finished yet. Run the Worth It profile SQL setup in Supabase and try again.");}
}
const oldOpenInfo=window.openAccountInfo;
window.openAccountInfo=function(section){if(!section||section==="profile"){closeAccountDropdown();return openOwnProfile();}if(typeof oldOpenInfo==="function")return oldOpenInfo.apply(this,arguments);};
const oldToggle=window.toggleAccountPanel;
window.toggleAccountPanel=function(event){const result=typeof oldToggle==="function"?oldToggle.apply(this,arguments):undefined;if($("accountPanel")?.classList.contains("open")){setPanelLoading();refreshAccountPanelCounts(true);}return result;};
function renderProfile(p,s,isOwn){
 const profileSection=$("profileSection");if(profileSection)profileSection.classList.toggle("signed-out-profile-view",!currentUser);
 const id=Number(p.worth_it_id),name=String(p.display_name||p.username||"Worth It member"),username=String(p.username||""),link=BASE_URL+"/profile/"+id;currentProfileLink=link;
 renderAvatar(p.avatar_url,name,p);renderWorthItProfilePresence(p);renderBanner(p.banner_url,name);setText("worthItProfileName",name);setText("worthItProfileUsername",username?"@"+username:"Worth It member");
 const displayNameEdit=$("worthItProfileDisplayNameEdit");if(displayNameEdit)displayNameEdit.hidden=!isOwn;
 if(!isOwn)closeWorthItDisplayNameEditor();
 setCount("worthItProfileFriends",s.friends);setCount("worthItProfileFollowers",s.followers);setCount("worthItProfileFollowing",s.following);setFriendMood(s.friends);
 const email=$("worthItProfileEmail");if(email){email.textContent=isOwn&&currentUser?.email?currentUser.email:"";email.hidden=!(isOwn&&currentUser?.email);}
 const linkNode=$("worthItProfileLink");if(linkNode){linkNode.href=link;linkNode.textContent=link;}setText("worthItProfileLinkLabel",isOwn?"YOUR PROFILE LINK":"THIS USER'S PROFILE");
 const member=$("worthItProfileMemberSince");if(member){const date=p.created_at?new Date(p.created_at):null;if(date&&!Number.isNaN(date.getTime())){const parts=new Intl.DateTimeFormat("en-GB",{day:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);const part=type=>parts.find(x=>x.type===type)?.value||"";const month=new Intl.DateTimeFormat("en-US",{month:"short"}).format(date);member.textContent="Joined "+part("day")+" "+month+", "+part("year")+" "+part("hour")+":"+part("minute");}else{member.textContent="";}}
 hideAllAssetLimitNotices();
 currentDisplayedProfileId=id;currentDisplayedProfileIsOwn=Boolean(isOwn);
 renderProfileDescription(p.description,id,Boolean(isOwn));
 const avatarControls=$("worthItProfileAvatarControls");if(avatarControls)avatarControls.hidden=!isOwn;
 const bannerControls=$("worthItProfileBannerControls");if(bannerControls)bannerControls.hidden=!isOwn;
 const removePhoto=$("worthItProfileAvatarRemove");if(removePhoto)removePhoto.hidden=!isOwn||!safeAvatarUrl(p.avatar_url);
 const removeBanner=$("worthItProfileBannerRemove");if(removeBanner)removeBanner.hidden=!isOwn||!safeAvatarUrl(p.banner_url);
 setAssetControlsBusy(false);setStatus("",false);refreshProfileSocial(id,Boolean(isOwn));
}



function setProfileDescriptionStatus(message,isError){
 const node=$("worthItProfileDescriptionStatus");if(!node)return;
 node.textContent=String(message||"");node.classList.toggle("is-error",Boolean(isError));
}
function clearProfileDescriptionTimer(){if(profileDescriptionCooldownTimer!==null){clearInterval(profileDescriptionCooldownTimer);profileDescriptionCooldownTimer=null;}}
function formatProfileDescriptionRemaining(ms){
 const total=Math.max(0,Math.ceil(Number(ms||0)/1000)),minutes=Math.floor(total/60),seconds=total%60;
 return minutes+"m "+String(seconds).padStart(2,"0")+"s";
}
function profileDescriptionDeadlineFromResponse(data,requestStartedAt){
 const remaining=Number(data?.remaining_ms);
 if(Number.isFinite(remaining)&&remaining>=0)return Date.now()+Math.max(0,remaining-Math.max(0,Date.now()-requestStartedAt));
 const timestamp=Date.parse(data?.next_save_at||"");
 return Number.isFinite(timestamp)?timestamp:0;
}
function updateProfileDescriptionSaveButton(){
 const input=$("worthItProfileDescriptionInput"),button=$("worthItProfileDescriptionSave");if(!input||!button)return;
 const changed=String(input.value||"").trim()!==profileDescriptionSavedValue,remaining=Math.max(0,profileDescriptionNextSaveAt-Date.now());
 button.disabled=profileDescriptionSaving||!profileDescriptionStatusReady||!changed||remaining>0;
 const count=$("worthItProfileDescriptionCharacterCount");if(count)count.textContent=Array.from(String(input.value||"")).length+"/500";
}
function startProfileDescriptionCooldownTimer(){
 clearProfileDescriptionTimer();
 const tick=function(){
  const remaining=profileDescriptionNextSaveAt-Date.now();updateProfileDescriptionSaveButton();
  if(remaining>0){setProfileDescriptionStatus("You can save another description in "+formatProfileDescriptionRemaining(remaining)+".",false);return;}
  clearProfileDescriptionTimer();profileDescriptionNextSaveAt=0;updateProfileDescriptionSaveButton();
  setProfileDescriptionStatus("You can now save a new description.",false);
 };
 tick();if(profileDescriptionNextSaveAt>Date.now())profileDescriptionCooldownTimer=setInterval(tick,1000);
}
function resetProfileDescriptionPanel(){
 profileDescriptionStatusRequest++;clearProfileDescriptionTimer();profileDescriptionSaving=false;profileDescriptionStatusReady=false;
 profileDescriptionSavedValue="";profileDescriptionNextSaveAt=0;
 const editor=$("worthItProfileDescriptionEditor"),display=$("worthItProfileDescriptionText"),empty=$("worthItProfileDescriptionEmpty"),input=$("worthItProfileDescriptionInput");
 if(editor)editor.hidden=true;if(display){display.textContent="";display.hidden=true;}if(empty)empty.hidden=true;if(input)input.value="";
 updateProfileDescriptionSaveButton();
}
async function loadProfileDescriptionStatus(profileId,fallbackDescription){
 const requestId=++profileDescriptionStatusRequest;clearProfileDescriptionTimer();
 try{
  const sb=client();if(!sb?.auth)throw new Error("Please sign in again to edit your profile description.");
  const sessionResult=await sb.auth.getSession(),token=sessionResult?.data?.session?.access_token||"";
  if(!token)throw new Error("Your login session has expired. Please sign in again.");
  const requestStartedAt=Date.now();
  const response=await fetch("/api/profile-description",{method:"GET",headers:{"Authorization":"Bearer "+token,"Accept":"application/json"}});
  let data=null;try{data=await response.json();}catch(_){}
  if(requestId!==profileDescriptionStatusRequest||currentDisplayedProfileId!==Number(profileId)||!currentDisplayedProfileIsOwn)return;
  if(!response.ok||!data?.success){
   profileDescriptionStatusReady=false;updateProfileDescriptionSaveButton();
   setProfileDescriptionStatus(data?.code==="PROFILE_DESCRIPTION_SETUP_REQUIRED"?"Description saving needs a one-time database setup. Run supabase/profile-description.sql in the Supabase SQL Editor.":data?.error||"Could not check the description save limit. Please refresh and try again.",true);
   return;
  }
  const saved=String(data.description==null?(fallbackDescription||""):data.description).trim();
  profileDescriptionSavedValue=saved;const input=$("worthItProfileDescriptionInput");if(input)input.value=saved;
  const display=$("worthItProfileDescriptionText");if(display)display.textContent=saved;
  const empty=$("worthItProfileDescriptionEmpty");if(empty)empty.hidden=true;
  profileDescriptionNextSaveAt=profileDescriptionDeadlineFromResponse(data,requestStartedAt);if(profileDescriptionNextSaveAt<=Date.now())profileDescriptionNextSaveAt=0;
  profileDescriptionStatusReady=true;updateProfileDescriptionSaveButton();
  if(profileDescriptionNextSaveAt>Date.now())startProfileDescriptionCooldownTimer();
  else setProfileDescriptionStatus("Write what you'd like others to know about you. You can save a new description once every 10 minutes.",false);
 }catch(error){
  if(requestId!==profileDescriptionStatusRequest||currentDisplayedProfileId!==Number(profileId)||!currentDisplayedProfileIsOwn)return;
  profileDescriptionStatusReady=false;updateProfileDescriptionSaveButton();
  setProfileDescriptionStatus(error?.message||"Could not check the description save limit.",true);
 }
}
function renderProfileDescription(value,profileId,isOwn){
 clearProfileDescriptionTimer();const saved=String(value||"").trim();
 const editor=$("worthItProfileDescriptionEditor"),display=$("worthItProfileDescriptionText"),empty=$("worthItProfileDescriptionEmpty"),input=$("worthItProfileDescriptionInput");
 if(editor)editor.hidden=!isOwn;if(display){display.textContent=saved;display.hidden=Boolean(isOwn)||!saved;}if(empty)empty.hidden=Boolean(isOwn)||Boolean(saved);
 profileDescriptionSaving=false;profileDescriptionStatusReady=false;profileDescriptionNextSaveAt=0;profileDescriptionSavedValue=saved;if(input)input.value=saved;
 updateProfileDescriptionSaveButton();
 if(isOwn){setProfileDescriptionStatus("Checking when you can next save...",false);loadProfileDescriptionStatus(profileId,saved);}
 else{profileDescriptionStatusRequest++;}
}
window.saveWorthItProfileDescription=async function(){
 const input=$("worthItProfileDescriptionInput");if(!input||profileDescriptionSaving)return;
 const description=String(input.value||"").trim();
 if(Array.from(description).length>500){setProfileDescriptionStatus("Your description can contain up to 500 characters.",true);return;}
 if(!profileDescriptionStatusReady){setProfileDescriptionStatus("The description save limit is not ready yet. Please try again in a moment.",true);return;}
 if(Date.now()<profileDescriptionNextSaveAt){startProfileDescriptionCooldownTimer();return;}
 if(description===profileDescriptionSavedValue){setProfileDescriptionStatus("There are no changes to save.",false);updateProfileDescriptionSaveButton();return;}
 const sb=client();if(!sb?.auth){setProfileDescriptionStatus("Please sign in to save your description.",true);return;}
 profileDescriptionSaving=true;updateProfileDescriptionSaveButton();setProfileDescriptionStatus("Saving your description...",false);
 try{
  const sessionResult=await sb.auth.getSession(),token=sessionResult?.data?.session?.access_token||"";
  if(!token)throw new Error("Your login session has expired. Please sign in again.");
  const requestStartedAt=Date.now();
  const response=await fetch("/api/profile-description",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token,"Accept":"application/json"},body:JSON.stringify({description:description})});
  let data=null;try{data=await response.json();}catch(_){}
  if(!response.ok||!data?.success){
   if(data?.code==="PROFILE_DESCRIPTION_COOLDOWN"){
    profileDescriptionNextSaveAt=profileDescriptionDeadlineFromResponse(data,requestStartedAt);if(profileDescriptionNextSaveAt<=Date.now())profileDescriptionNextSaveAt=Date.now()+Math.max(0,Number(data.remaining_ms)||0);
    profileDescriptionStatusReady=true;startProfileDescriptionCooldownTimer();
   }else{
    if(data?.code==="PROFILE_DESCRIPTION_SETUP_REQUIRED")profileDescriptionStatusReady=false;
    setProfileDescriptionStatus(data?.error||"Could not save your description. Please try again.",true);
   }
   return;
  }
  profileDescriptionSavedValue=String(data.description==null?description:data.description).trim();input.value=profileDescriptionSavedValue;
  const display=$("worthItProfileDescriptionText");if(display)display.textContent=profileDescriptionSavedValue;
  profileDescriptionNextSaveAt=profileDescriptionDeadlineFromResponse(data,requestStartedAt);if(profileDescriptionNextSaveAt<=Date.now())profileDescriptionNextSaveAt=0;
  profileDescriptionStatusReady=true;updateProfileDescriptionSaveButton();
  if(profileDescriptionNextSaveAt>Date.now())startProfileDescriptionCooldownTimer();else setProfileDescriptionStatus("Description saved.",false);
 }catch(error){setProfileDescriptionStatus(error?.message||"Could not save your description. Please try again.",true);}
 finally{profileDescriptionSaving=false;updateProfileDescriptionSaveButton();}
};

const FRIEND_MOOD_THRESHOLDS = [
 { count: 100, emoji: "🤯" },
 { count: 70, emoji: "😂🤣" },
 { count: 50, emoji: "😂" },
 { count: 20, emoji: "😀" },
 { count: 10, emoji: "😁" },
 { count: 5, emoji: "🙂" },
 { count: 3, emoji: "😐" },
 { count: 1, emoji: "😔" },
 { count: 0, emoji: "😭" }
];
function friendMoodForCount(value) {
 const count = Math.max(0, Number(value) || 0);
 return FRIEND_MOOD_THRESHOLDS.find(item => count >= item.count)?.emoji || "😭";
}
function setFriendMood(value) {
 const count = Math.max(0, Number(value) || 0);
 setText("worthItProfileFriendsMood", friendMoodForCount(count));
 setText("worthItProfileFriendsPreviewCount", "(" + count.toLocaleString() + ")");
}
function normalizeRpcObject(value) {
 if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === "object" && !Array.isArray(value[0])) return value[0];
 return value;
}
function profilePersonLink(person, compact) {
  const id=Number(person?.worth_it_id),name=String(person?.display_name||person?.username||"Worth It member"),username=String(person?.username||"");
  const link=document.createElement("a");link.href=Number.isSafeInteger(id)&&id>0?"/profile/"+id:"#";
  link.className=compact?"worth-it-profile-friend-chip":"worth-it-profile-connection-card";link.setAttribute("role","listitem");link.title=username?name+" (@"+username+")":name;
  const avatar=document.createElement("span");avatar.className=compact?"worth-it-profile-friend-avatar":"worth-it-profile-connection-avatar";const url=safeAvatarUrl(person?.avatar_url);
  if(url){const image=document.createElement("img");image.src=url;image.alt="";image.loading="lazy";image.referrerPolicy="no-referrer";image.addEventListener("error",()=>{avatar.replaceChildren();avatar.textContent=name.trim().charAt(0).toUpperCase()||"W";appendWorthItPresenceIndicator(avatar,person);},{once:true});avatar.appendChild(image);}
  else avatar.textContent=name.trim().charAt(0).toUpperCase()||"W";
  appendWorthItPresenceIndicator(avatar,person);
  if(compact){const label=document.createElement("span");label.className="worth-it-profile-friend-chip-name";label.textContent=username?"@"+username:name;link.append(avatar,label);}
  else{const text=document.createElement("span");text.className="worth-it-profile-connection-text";const display=document.createElement("strong");display.textContent=name;const handle=document.createElement("small");handle.textContent=username?"@"+username:"Worth It member";const presence=document.createElement("small");presence.className="worth-it-person-presence-label";presence.dataset.worthItPresenceId=String(id);presence.textContent=getWorthItPresenceInfo(person).label;text.append(display,handle,presence);link.append(avatar,text);}
  return link;
}
function renderFriendsStrip(rows) {
 const host = $("worthItProfileFriendsStrip"), preview = $("worthItProfileFriendsPreview");
 if (!host) return;
 host.replaceChildren();
 if (!Array.isArray(rows)) rows = [];
 if (!rows.length) {
  const empty = document.createElement("span"); empty.className = "worth-it-profile-friends-empty"; empty.textContent = "No friends yet.";
  host.appendChild(empty); if (preview) preview.hidden = false; return;
 }
 rows.slice(0, 100).forEach(person => host.appendChild(profilePersonLink(person, true)));
 if (preview) preview.hidden = false;
}
function setSocialControlsBusy(busy) {
 socialActionInProgress = Boolean(busy);
 ["worthItProfileFriendAction", "worthItProfileFollowAction", "worthItProfileFriendSecondary"].forEach(id => {
  const button = $(id); if (button) button.disabled = socialActionInProgress || button.dataset.stateDisabled === "true";
 });
}
function renderSocialActionButtons(context, isOwn) {
 const host = $("worthItProfileSocialActions");
 const friend = $("worthItProfileFriendAction");
 const follow = $("worthItProfileFollowAction");
 const secondary = $("worthItProfileFriendSecondary");
 const hint = $("worthItProfileSocialHint");
 if (!host || !friend || !follow || !secondary) return;
 currentSocialContext = context || null;
 if (isOwn || !context || context.success !== true) { host.hidden = true; return; }
 host.hidden = false;
 host.classList.toggle("is-logged-out", !currentUser);
 [friend, follow, secondary].forEach(button => { button.disabled = false; });
 secondary.hidden = true; secondary.dataset.action = "";
 friend.dataset.stateDisabled = "false"; follow.dataset.stateDisabled = "false";
 if (!currentUser) {
  friend.textContent = "Sign in to add friend"; follow.textContent = "Sign in to follow";
  if (hint) { hint.textContent = ""; hint.hidden = true; }
  return;
 }
 if (context.are_friends) {
  friend.textContent = "Unfriend";
 } else if (context.incoming_request_pending) {
  friend.textContent = "Accept request";
  secondary.hidden = false; secondary.textContent = "Decline"; secondary.dataset.action = "decline";
 } else if (context.outgoing_request_pending) {
  friend.textContent = "Request sent"; friend.dataset.stateDisabled = "true";
  secondary.hidden = false; secondary.textContent = "Cancel request"; secondary.dataset.action = "cancel";
 } else {
  friend.textContent = "Add friend";
 }
 follow.textContent = context.is_following ? "Following ✓" : "Follow";
 if (hint) {
  const messages = [];
  if (context.follows_you) messages.push("Follows you");
  if (context.are_friends) messages.push("You are friends");
  hint.textContent = messages.join(" · "); hint.hidden = messages.length === 0;
 }
 setSocialControlsBusy(socialActionInProgress);
}
async function refreshProfileSocial(targetId, isOwn) {
 const refreshId = ++activeSocialRefresh;
 const sb = client();
 const preview = $("worthItProfileFriendsPreview");
 const actionHost = $("worthItProfileSocialActions");
 if (actionHost) actionHost.hidden = true;
 if (!sb || !Number.isSafeInteger(Number(targetId)) || Number(targetId) < 1) {
  if (preview) preview.hidden = true;
  const pending = $("worthItProfilePendingRequests"); if (pending) pending.hidden = true;
  return;
 }
 try {
  const [contextResult, connectionsResult] = await Promise.all([
   sb.rpc("get_worth_it_profile_social_context", { target_worth_it_id: Number(targetId) }),
   sb.rpc("get_worth_it_profile_connections", { target_worth_it_id: Number(targetId), connection_type: "friends" })
  ]);
  if (refreshId !== activeSocialRefresh || Number(targetId) !== currentDisplayedProfileId) return;
  const context = normalizeRpcObject(contextResult.data);
  if (!contextResult.error && context?.success === true) renderSocialActionButtons(context, Boolean(isOwn));
  else { if (actionHost) actionHost.hidden = true; currentSocialContext = null; }
  const connectionData = normalizeRpcObject(connectionsResult.data);
  if (!connectionsResult.error && connectionData?.success === true && Array.isArray(connectionData.connections)) {
   renderFriendsStrip(connectionData.connections);
  } else if (preview) preview.hidden = true;
 } catch (_) {
  if (refreshId === activeSocialRefresh && preview) preview.hidden = true;
  if (actionHost) actionHost.hidden = true;
 }
 await refreshPendingFriendRequests(Boolean(isOwn), targetId, refreshId);
}
async function refreshPendingFriendRequests(isOwn, targetId, refreshId) {
 const section = $("worthItProfilePendingRequests"), host = $("worthItProfilePendingRequestsList"), sb = client();
 if (!section || !host) return;
 if (!isOwn || !currentUser || !sb) { section.hidden = true; host.replaceChildren(); return; }
 try {
  const result = await sb.rpc("get_worth_it_pending_friend_requests");
  if (result.error) throw result.error;
  if (refreshId !== activeSocialRefresh || Number(targetId) !== currentDisplayedProfileId) return;
  const rows = Array.isArray(result.data) ? result.data : [];
  host.replaceChildren();
  if (!rows.length) { section.hidden = true; return; }
  section.hidden = false;
  rows.forEach(request => {
   const row = document.createElement("div"); row.className = "worth-it-profile-pending-item";
   const person = profilePersonLink(request, false);
   const actions = document.createElement("div"); actions.className = "worth-it-profile-pending-actions";
   const accept = document.createElement("button"); accept.type = "button"; accept.className = "worth-it-profile-social-button primary"; accept.textContent = "Accept";
   const decline = document.createElement("button"); decline.type = "button"; decline.className = "worth-it-profile-social-button quiet"; decline.textContent = "Decline";
   accept.addEventListener("click", () => window.performWorthItPendingRequestAction(request.request_id, true));
   decline.addEventListener("click", () => window.performWorthItPendingRequestAction(request.request_id, false));
   actions.append(accept, decline); row.append(person, actions); host.appendChild(row);
  });
 } catch (_) { section.hidden = true; host.replaceChildren(); }
}

/* Header notification inbox: friend requests and unfriend events. */
let worthItNotificationRequests=[],worthItSocialNotifications=[],worthItNotificationRequestsError=false,worthItSocialNotificationsError=false,worthItNotificationRefreshId=0,worthItNotificationTab="requests",worthItNotificationRefreshTimer=null;
function setWorthItNotificationAuthState(user){
 const wrap=$("worthItNotificationWrap"),panel=$("worthItNotificationPanel"),button=$("worthItNotificationBell");
 if(!wrap)return;
 wrap.hidden=!Boolean(user);
 if(!user){
  worthItNotificationRefreshId++;worthItNotificationRequests=[];worthItSocialNotifications=[];
  if(panel){panel.hidden=true;panel.setAttribute("aria-hidden","true");}
  if(button)button.setAttribute("aria-expanded","false");
  updateWorthItNotificationBadge();
 }else if(worthItNotificationRefreshTimer===null){
  worthItNotificationRefreshTimer=window.setInterval(()=>{
   if(currentUser&&!$("worthItNotificationPanel")?.hidden)return;
   if(currentUser)refreshWorthItNotifications(false);
  },60000);
 }
}
function updateWorthItNotificationBadge(){
 const badge=$("worthItNotificationBadge"),button=$("worthItNotificationBell"),requestsCount=$("worthItNotificationRequestsCount"),otherCount=$("worthItNotificationOtherCount");
 const pending=worthItNotificationRequestsError?0:worthItNotificationRequests.length;
 const unread=worthItSocialNotificationsError?0:worthItSocialNotifications.filter(item=>!item.read_at).length;
 const total=pending+unread;
 if(badge){badge.textContent=total>99?"99+":String(total);badge.hidden=total===0;}
 if(button){button.setAttribute("aria-label",total?"Notifications, "+total+" unread or pending":"Notifications");button.title=total?"Notifications ("+total+")":"Notifications";}
 if(requestsCount){requestsCount.textContent=pending>99?"99+":String(pending);requestsCount.hidden=pending===0;}
 if(otherCount){otherCount.textContent=unread>99?"99+":String(unread);otherCount.hidden=unread===0;}
}
function setWorthItNotificationTab(tab){
 if(!["requests","other"].includes(tab))return;
 worthItNotificationTab=tab;
 document.querySelectorAll("[data-notification-tab]").forEach(button=>{
  const active=button.getAttribute("data-notification-tab")===tab;
  button.classList.toggle("active",active);button.setAttribute("aria-selected",active?"true":"false");
 });
 document.querySelectorAll("[data-notification-view]").forEach(view=>{view.hidden=view.getAttribute("data-notification-view")!==tab;});
}
window.showWorthItNotificationTab=function(tab){setWorthItNotificationTab(tab);if(tab==="other"&&currentUser)refreshWorthItNotifications(true);};
function createWorthItNotificationPerson(person){
 const anchor=document.createElement("a"),id=Number(person?.worth_it_id);anchor.className="worth-it-notification-person";anchor.href=Number.isSafeInteger(id)&&id>0?"/profile/"+id:"#";
 const avatar=document.createElement("span");avatar.className="worth-it-notification-avatar";const name=String(person?.display_name||person?.username||"Worth It member"),avatarUrl=safeAvatarUrl(person?.avatar_url);
 if(avatarUrl){const image=document.createElement("img");image.src=avatarUrl;image.alt="";image.loading="lazy";image.referrerPolicy="no-referrer";image.addEventListener("error",()=>{avatar.replaceChildren();avatar.textContent=name.trim().charAt(0).toUpperCase()||"W";appendWorthItPresenceIndicator(avatar,person);},{once:true});avatar.appendChild(image);}
 else avatar.textContent=name.trim().charAt(0).toUpperCase()||"W";
 appendWorthItPresenceIndicator(avatar,person);
 const text=document.createElement("span");text.className="worth-it-notification-person-text";const strong=document.createElement("strong");strong.textContent=name;const username=document.createElement("small");username.textContent=person?.username?"@"+String(person.username):"Worth It member";text.append(strong,username);anchor.append(avatar,text);return anchor;
}
function renderWorthItNotificationRequests(){
 const host=$("worthItNotificationRequestsList");if(!host)return;host.replaceChildren();
 if(worthItNotificationRequestsError){const message=document.createElement("p");message.className="worth-it-notification-empty is-error";message.textContent="Friend requests could not be loaded. Check that supabase/worth-it-social.sql has been run in Supabase.";host.appendChild(message);return;}
 if(!worthItNotificationRequests.length){const message=document.createElement("p");message.className="worth-it-notification-empty";message.textContent="No new friend requests.";host.appendChild(message);return;}
 worthItNotificationRequests.forEach(request=>{
  const row=document.createElement("div");row.className="worth-it-notification-item worth-it-notification-request";
  const person=createWorthItNotificationPerson(request);
  const actions=document.createElement("div");actions.className="worth-it-notification-actions";
  const accept=document.createElement("button");accept.type="button";accept.className="worth-it-notification-action primary";accept.textContent="Accept";
  const decline=document.createElement("button");decline.type="button";decline.className="worth-it-notification-action";decline.textContent="Decline";
  const handle=async acceptRequest=>{
   accept.disabled=true;decline.disabled=true;
   try{
    await callSocialRpc("respond_worth_it_friend_request",{p_request_id:request.request_id,p_accept:Boolean(acceptRequest)});
    if(typeof window.showToast==="function")window.showToast(acceptRequest?"Friend request accepted.":"Friend request declined.");
    await refreshWorthItNotifications(false);
    if(currentDisplayedProfileIsOwn&&currentDisplayedProfileId)await refreshPendingFriendRequests(true,currentDisplayedProfileId,activeSocialRefresh);
   }catch(error){
    if(typeof window.showToast==="function")window.showToast(error?.message||"Could not update friend request.");
    accept.disabled=false;decline.disabled=false;
   }
  };
  accept.addEventListener("click",()=>handle(true));decline.addEventListener("click",()=>handle(false));
  actions.append(accept,decline);row.append(person,actions);host.appendChild(row);
 });
}
function formatWorthItNotificationDate(value){
 const date=new Date(value);if(Number.isNaN(date.getTime()))return "";
 try{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(date);}catch(_){return date.toLocaleString();}
}
function renderWorthItOtherNotifications(){
 const host=$("worthItNotificationOtherList");if(!host)return;host.replaceChildren();
 if(worthItSocialNotificationsError){const message=document.createElement("p");message.className="worth-it-notification-empty is-error";message.textContent="Other notifications need the one-time setup in supabase/worth-it-notifications.sql. Run that SQL file in Supabase, then refresh.";host.appendChild(message);return;}
 if(!worthItSocialNotifications.length){const message=document.createElement("p");message.className="worth-it-notification-empty";message.textContent="No other notifications yet.";host.appendChild(message);return;}
 worthItSocialNotifications.forEach(notification=>{
  const row=document.createElement("div");row.className="worth-it-notification-item worth-it-notification-event"+(notification.read_at?"":" is-unread");
  const person=createWorthItNotificationPerson(notification);
  const body=document.createElement("div");body.className="worth-it-notification-event-body";
  const title=document.createElement("p");title.className="worth-it-notification-event-title";
  const name=String(notification.display_name||notification.username||"A Worth It member");
  title.append(document.createTextNode(name+" unfriended you."));
  const reason=String(notification.reason||"").trim();
  if(reason){const explanation=document.createElement("p");explanation.className="worth-it-notification-reason";explanation.textContent="Reason: "+reason;body.append(title,explanation);}
  else body.appendChild(title);
  const date=document.createElement("time");date.className="worth-it-notification-date";date.dateTime=String(notification.created_at||"");date.textContent=formatWorthItNotificationDate(notification.created_at);
  body.appendChild(date);row.append(person,body);host.appendChild(row);
 });
}
async function refreshWorthItNotifications(markRead){
 const sb=client(),userId=currentUser?.id;if(!sb?.auth||!userId)return;
 const requestId=++worthItNotificationRefreshId;
 const [requestsResult,notificationsResult]=await Promise.allSettled([
  sb.rpc("get_worth_it_pending_friend_requests"),
  sb.rpc("get_worth_it_social_notifications")
 ]);
 if(requestId!==worthItNotificationRefreshId||currentUser?.id!==userId)return;
 worthItNotificationRequestsError=requestsResult.status!=="fulfilled"||Boolean(requestsResult.value?.error);
 worthItSocialNotificationsError=notificationsResult.status!=="fulfilled"||Boolean(notificationsResult.value?.error);
 worthItNotificationRequests=worthItNotificationRequestsError?[]:(Array.isArray(requestsResult.value.data)?requestsResult.value.data:[]);
 worthItSocialNotifications=worthItSocialNotificationsError?[]:(Array.isArray(notificationsResult.value.data)?notificationsResult.value.data:[]);
 if(markRead&&!worthItSocialNotificationsError&&worthItSocialNotifications.some(item=>!item.read_at)){
  const marked=await sb.rpc("mark_worth_it_social_notifications_read");
  if(requestId!==worthItNotificationRefreshId||currentUser?.id!==userId)return;
  if(!marked.error){const now=new Date().toISOString();worthItSocialNotifications=worthItSocialNotifications.map(item=>item.read_at?item:{...item,read_at:now});}
 }
 updateWorthItNotificationBadge();renderWorthItNotificationRequests();renderWorthItOtherNotifications();
}
function closeWorthItNotifications(){
 const panel=$("worthItNotificationPanel"),button=$("worthItNotificationBell");
 if(panel){panel.hidden=true;panel.setAttribute("aria-hidden","true");}
 if(button)button.setAttribute("aria-expanded","false");
}
window.toggleWorthItNotifications=async function(event){
 event?.stopPropagation?.();
 const panel=$("worthItNotificationPanel"),button=$("worthItNotificationBell");
 if(!panel||!currentUser){if(!currentUser)promptSignInForSocial();return;}
 if(!panel.hidden){closeWorthItNotifications();return;}
 closeAccountDropdown();panel.hidden=false;panel.setAttribute("aria-hidden","false");if(button)button.setAttribute("aria-expanded","true");
 setWorthItNotificationTab(worthItNotificationTab);
 const requestsHost=$("worthItNotificationRequestsList"),otherHost=$("worthItNotificationOtherList");
 if(requestsHost){requestsHost.replaceChildren();const loading=document.createElement("p");loading.className="worth-it-notification-empty";loading.textContent="Loading friend requests…";requestsHost.appendChild(loading);}
 if(otherHost){otherHost.replaceChildren();const loading=document.createElement("p");loading.className="worth-it-notification-empty";loading.textContent="Loading notifications…";otherHost.appendChild(loading);}
 await refreshWorthItNotifications(worthItNotificationTab==="other");
};
let worthItUnfriendReasonResolver=null;
function finishWorthItUnfriendDialog(value){
 const overlay=$("worthItUnfriendDialog"),resolver=worthItUnfriendReasonResolver;
 worthItUnfriendReasonResolver=null;if(overlay)overlay.hidden=true;
 if(typeof resolver==="function")resolver(value);
}
function ensureWorthItUnfriendDialog(){
 let overlay=$("worthItUnfriendDialog");if(overlay)return overlay;
 overlay=document.createElement("div");overlay.id="worthItUnfriendDialog";overlay.className="worth-it-unfriend-overlay";overlay.hidden=true;
 overlay.innerHTML='<div class="worth-it-unfriend-dialog" role="dialog" aria-modal="true" aria-labelledby="worthItUnfriendTitle"><button type="button" class="worth-it-unfriend-close" data-unfriend-cancel aria-label="Cancel unfriend">✕</button><h2 id="worthItUnfriendTitle">Unfriend this user?</h2><p class="worth-it-unfriend-intro">You can optionally explain why. Your message will appear in this person’s notifications.</p><form id="worthItUnfriendForm"><label for="worthItUnfriendReason">Reason (optional)</label><textarea id="worthItUnfriendReason" maxlength="500" rows="4" placeholder="Write a reason, or leave this blank…"></textarea><div class="worth-it-unfriend-char-count" id="worthItUnfriendCharCount">0 / 500</div><div class="worth-it-unfriend-actions"><button type="button" class="worth-it-unfriend-cancel" data-unfriend-cancel>Cancel</button><button type="submit" class="worth-it-unfriend-confirm">Unfriend</button></div></form></div>';
 document.body.appendChild(overlay);
 overlay.addEventListener("click",event=>{if(event.target===overlay)finishWorthItUnfriendDialog(null);});
 overlay.querySelectorAll("[data-unfriend-cancel]").forEach(button=>button.addEventListener("click",()=>finishWorthItUnfriendDialog(null)));
 const form=$("worthItUnfriendForm"),input=$("worthItUnfriendReason"),count=$("worthItUnfriendCharCount");
 if(input)input.addEventListener("input",()=>{if(count)count.textContent=Array.from(input.value).length+" / 500";});
 if(form)form.addEventListener("submit",event=>{event.preventDefault();finishWorthItUnfriendDialog(String(input?.value||"").trim());});
 return overlay;
}
function requestWorthItUnfriendReason(targetId){
 const overlay=ensureWorthItUnfriendDialog(),input=$("worthItUnfriendReason"),title=$("worthItUnfriendTitle");
 if(worthItUnfriendReasonResolver)finishWorthItUnfriendDialog(null);
 if(input){input.value="";input.maxLength=500;}
 const count=$("worthItUnfriendCharCount");if(count)count.textContent="0 / 500";
 const name=String($("worthItProfileName")?.textContent||"this user").trim()||"this user";
 if(title)title.textContent="Unfriend "+name+"?";
 overlay.hidden=false;
 return new Promise(resolve=>{worthItUnfriendReasonResolver=resolve;input?.focus();});
}
document.addEventListener("click",event=>{const wrap=$("worthItNotificationWrap");if(wrap&&!wrap.contains(event.target))closeWorthItNotifications();});
document.addEventListener("keydown",event=>{
 if(event.key==="Escape"){closeWorthItNotifications();if(!$("worthItUnfriendDialog")?.hidden)finishWorthItUnfriendDialog(null);}
});

function socialErrorMessage(result) {
 const code = String(result?.code || "");
 if (code === "ALREADY_FRIENDS") return "You are already friends with this user.";
 if (code === "REQUEST_ALREADY_SENT") return "You have already sent this friend request.";
 if (code === "INCOMING_REQUEST_EXISTS") return "This user has already sent you a friend request. Accept or decline it on their profile.";
 if (code === "REQUEST_NOT_AVAILABLE") return "This friend request is no longer available.";
 if (code === "PROFILE_NOT_FOUND") return "This profile could not be found.";
 if (code === "CANNOT_FRIEND_SELF") return "You cannot send yourself a friend request.";
 if (code === "FRIEND_LIMIT_SELF_REACHED") return "You already have 100 friends. Remove a friend before sending or accepting another friend request.";
 if (code === "FRIEND_LIMIT_TARGET_REACHED") return "This user already has 100 friends and cannot accept more friend requests.";
 if (code === "FRIEND_LIMIT_RECIPIENT_REACHED") return "You already have 100 friends. Remove a friend before accepting another request.";
 if (code === "FRIEND_LIMIT_REQUESTER_REACHED") return "The person who sent this request already has 100 friends and cannot accept another friend request.";
 return String(result?.error || "The social action could not be completed. Please try again.");
}
async function callSocialRpc(name, args) {
 const sb = client();
 if (!sb) throw new Error("Profile service is unavailable.");
 const result = await sb.rpc(name, args || {});
 if (result.error) throw result.error;
 const data = normalizeRpcObject(result.data);
 if (data && data.success === false) throw new Error(socialErrorMessage(data));
 return data;
}
function promptSignInForSocial() {
 if (typeof window.openAuthModal === "function") window.openAuthModal("signin");
 else if (typeof window.handleAuthButton === "function") window.handleAuthButton();
 else if (typeof window.showToast === "function") window.showToast("Please sign in to use friends and follows.");
}
window.performWorthItSocialAction = async function(action) {
 const targetId = Number(currentDisplayedProfileId);
 if (!Number.isSafeInteger(targetId) || targetId < 1 || currentDisplayedProfileIsOwn || socialActionInProgress) return;
 try {
  if (!currentUser) currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) { promptSignInForSocial(); return; }
  const context = currentSocialContext || {};
  setSocialControlsBusy(true);
  if (action === "follow") {
   if (context.is_following) await callSocialRpc("unfollow_worth_it_user", { target_worth_it_id: targetId });
   else await callSocialRpc("follow_worth_it_user", { target_worth_it_id: targetId });
  } else if (action === "secondary") {
   const secondary = $("worthItProfileFriendSecondary");
   if (secondary?.dataset.action === "decline" && context.incoming_request_id) {
    await callSocialRpc("respond_worth_it_friend_request", { p_request_id: context.incoming_request_id, p_accept: false });
   } else if (secondary?.dataset.action === "cancel" && context.outgoing_request_id) {
    await callSocialRpc("cancel_worth_it_friend_request", { p_request_id: context.outgoing_request_id });
   } else return;
  } else if (action === "friend") {
   if (context.are_friends) {
    const reason = await requestWorthItUnfriendReason(targetId);
    if (reason === null) return;
    await callSocialRpc("unfriend_worth_it_user_with_reason", { target_worth_it_id: targetId, p_reason: reason });
   } else if (context.incoming_request_pending && context.incoming_request_id) {
    await callSocialRpc("respond_worth_it_friend_request", { p_request_id: context.incoming_request_id, p_accept: true });
   } else if (context.outgoing_request_pending) {
    return;
   } else {
    await callSocialRpc("send_worth_it_friend_request", { target_worth_it_id: targetId });
   }
  }
  await window.openWorthItProfile(targetId, { refresh: true });
  if (typeof window.showToast === "function") window.showToast(action === "follow" ? (context.is_following ? "You unfollowed this user." : "You are now following this user.") : "Your friend connection was updated.");
 } catch (error) {
  if (typeof window.showToast === "function") window.showToast(error?.message || "The social action could not be completed.");
  else console.warn("Worth It social action failed.", error);
 } finally {
  setSocialControlsBusy(false);
 }
};
window.performWorthItPendingRequestAction = async function(requestId, accept) {
 if (!currentUser || !requestId) { promptSignInForSocial(); return; }
 try {
  const data = await callSocialRpc("respond_worth_it_friend_request", { p_request_id: requestId, p_accept: Boolean(accept) });
  if (data?.success === false) throw new Error(socialErrorMessage(data));
  await window.openWorthItProfile(currentDisplayedProfileId, { refresh: true });
  if (typeof window.showToast === "function") window.showToast(accept ? "Friend request accepted." : "Friend request declined.");
 } catch (error) {
  if (typeof window.showToast === "function") window.showToast(error?.message || "Could not update friend request.");
 }
};
window.openWorthItProfileConnectionsForCurrent = function(category) {
 const id = Number(currentDisplayedProfileId);
 if (Number.isSafeInteger(id) && id > 0) return window.openWorthItProfileConnections(id, category);
};
window.openWorthItProfileConnectionsBack = function() {
 const id = Number(currentDisplayedProfileId);
 if (Number.isSafeInteger(id) && id > 0) return window.openWorthItProfile(id);
};
window.openWorthItProfileConnections = async function(idValue, categoryValue, options) {
 const id = Number(idValue);
 const category = String(categoryValue || "").toLowerCase();
 const validCategories = ["friends", "followers", "following"];
 if (!Number.isSafeInteger(id) || id < 1 || !validCategories.includes(category)) return;
 const profileCard = $("worthItProfileCard"), page = $("worthItProfileConnectionsPage");
 if (!page || !profileCard) return;
 showProfileSection(); profileCard.hidden = true; page.hidden = false;
 currentDisplayedProfileId = id; currentDisplayedProfileIsOwn = false; currentSocialContext = null;
 const requestId = ++activeConnectionsRequest;
 const status = $("worthItProfileConnectionsStatus"), list = $("worthItProfileConnectionsList");
 if (status) { status.hidden = false; status.textContent = "Loading " + category + "…"; status.classList.remove("is-error"); }
 if (list) list.replaceChildren();
 const sb = client();
 if (!sb) { if (status) { status.textContent = "The profile service is not ready."; status.classList.add("is-error"); } return; }
 try {
  const [profileResult, user] = await Promise.all([
   sb.from("worth_it_public_profiles").select("worth_it_id,username,display_name,avatar_url,banner_url,created_at").eq("worth_it_id", id).maybeSingle(),
   getCurrentUser().catch(() => null)
  ]);
  if (requestId !== activeConnectionsRequest) return;
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) throw new Error("This Worth It profile could not be found.");
  currentUser = user || null;
  const profile = profileResult.data;
  renderBanner(profile.banner_url);
  const name = String(profile.display_name || profile.username || "Worth It member");
  const username = String(profile.username || "");
  const titleLabels = { friends: "Friends", followers: "Followers", following: "Following" };
  setText("worthItProfileConnectionsTitle", titleLabels[category] + " of " + name);
  setText("worthItProfileConnectionsSubtitle", username ? "@" + username : name);
  document.querySelectorAll("[data-connection-tab]").forEach(tab => {
   const active = tab.getAttribute("data-connection-tab") === category;
   tab.classList.toggle("active", active);
   if (active) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  });
  const connectionsResult = await sb.rpc("get_worth_it_profile_connections", {
   target_worth_it_id: id, connection_type: category
  });
  if (requestId !== activeConnectionsRequest) return;
  if (connectionsResult.error) throw connectionsResult.error;
  const result = normalizeRpcObject(connectionsResult.data);
  if (!result || result.success !== true || !Array.isArray(result.connections)) {
   throw new Error("The connections list could not be loaded. Check the profile social database setup.");
  }
  list.replaceChildren();
  if (!result.connections.length) {
   if (status) status.textContent = category === "friends" ? "No friends yet." : "This list is empty for now.";
   return;
  }
  result.connections.forEach(person => list.appendChild(profilePersonLink(person, false)));
  if (status) status.hidden = true;
 } catch (error) {
  if (requestId !== activeConnectionsRequest) return;
  if (status) {
   status.hidden = false;
   status.textContent = /could not be found/i.test(String(error?.message || "")) ? error.message : "This list could not be loaded. Make sure supabase/worth-it-social.sql has been run in Supabase.";
   status.classList.add("is-error");
  }
 }
};

let displayNameInitialValue="",displayNameCanChange=false,displayNameSaving=false,displayNameRequestId=0;
const DISPLAY_NAME_MIN_LENGTH=3,DISPLAY_NAME_MAX_LENGTH=20;
const DISPLAY_NAME_PATTERN=/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?$/;
const DISPLAY_NAME_BANNED_STEMS=[
 "fuck","shit","bitch","cunt","dick","cock","pussy","whore","slut",
 "bastard","asshole","arsehole","motherfucker","bullshit","dumbass",
 "jackass","nigger","nigga","faggot","retard","retarded","pedo",
 "pedophile","porn","xxx","blowjob","handjob","jizz","rape","rapist",
 "nazi","hitler","kkk"
];
const RESERVED_DISPLAY_NAME_PREFIXES=["admin","administrator","moderator","mod","staff","support","official","security","owner","root","worthit"];
function normalizeDisplayNameForModeration(value){return String(value||"").toLowerCase().replace(/_/g,"").replace(/[01345789]/g,character=>({"0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","8":"b","9":"g"}[character]||character));}
function validateDisplayName(value){
 const name=String(value||"").trim(),length=Array.from(name).length;
 if(length<DISPLAY_NAME_MIN_LENGTH||length>DISPLAY_NAME_MAX_LENGTH||!DISPLAY_NAME_PATTERN.test(name))return{valid:false,reason:"Use 3–20 letters or numbers, with at most one underscore between them. No spaces or other symbols."};
 const normalized=normalizeDisplayNameForModeration(name);
 if(DISPLAY_NAME_BANNED_STEMS.some(term=>normalized.includes(term)))return{valid:false,reason:"This display name contains language that isn't allowed on Worth It."};
 if(RESERVED_DISPLAY_NAME_PREFIXES.some(prefix=>normalized===prefix||(normalized.startsWith(prefix)&&/^[0-9]+$/.test(normalized.slice(prefix.length)))))return{valid:false,reason:"This display name is reserved and cannot be used."};
 if((name.match(/[0-9]/g)||[]).length>=7)return{valid:false,reason:"Display names cannot contain phone numbers or other long numeric identifiers."};
 return{valid:true,reason:""};
}
function displayNameIsValid(value){return validateDisplayName(value).valid;}
function setDisplayNameStatus(message,isError){
 const n=$("worthItDisplayNameStatus");if(!n)return;
 n.textContent=message||"";n.classList.toggle("is-error",Boolean(isError));
}
function refreshDisplayNameSaveButton(){
 const button=$("worthItDisplayNameSave"),input=$("worthItDisplayNameInput");
 if(!button||!input)return;
 const next=String(input.value||"").trim();
 button.disabled=displayNameSaving||!displayNameCanChange||!displayNameIsValid(next)||next===displayNameInitialValue;
}
function closeWorthItDisplayNameEditor(){
 const overlay=$("worthItDisplayNameOverlay");
 if(!overlay)return;
 overlay.hidden=true;overlay.setAttribute("aria-hidden","true");
 displayNameRequestId++;displayNameCanChange=false;
 const button=$("worthItDisplayNameSave");if(button)button.disabled=true;
 displayNameSaving=false;
}
window.closeWorthItDisplayNameEditor=closeWorthItDisplayNameEditor;
async function getDisplayNameToken(){
 const sb=client();if(!sb?.auth)throw new Error("Please sign in to change your display name.");
 const sessionResult=await sb.auth.getSession(),token=sessionResult.data?.session?.access_token;
 if(sessionResult.error||!token)throw new Error("Your login session has expired. Please sign in again.");
 return token;
}
async function fetchDisplayNameStatus(){
 const token=await getDisplayNameToken();
 const response=await fetch("/api/profile-display-name",{headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},cache:"no-store"});
 let data={};try{data=await response.json();}catch(_){}
 if(!response.ok||!data.success)throw new Error(data.error||"Could not load display-name settings.");
 return data;
}
window.openWorthItDisplayNameEditor=async function(){
 if(!currentDisplayedProfileIsOwn||!currentUser||!currentDisplayedProfileId)return;
 const overlay=$("worthItDisplayNameOverlay"),input=$("worthItDisplayNameInput"),save=$("worthItDisplayNameSave");
 if(!overlay||!input||!save)return;
 const requestId=++displayNameRequestId;
 displayNameInitialValue=String($("worthItProfileName")?.textContent||"").trim();
 input.value=displayNameInitialValue;displayNameCanChange=false;displayNameSaving=false;
 overlay.hidden=false;overlay.setAttribute("aria-hidden","false");
 setDisplayNameStatus("Checking your 7-day change limit…",false);save.disabled=true;
 try{input.focus();input.setSelectionRange(0,input.value.length);}catch(_){}
 try{
  const status=await fetchDisplayNameStatus();
  if(requestId!==displayNameRequestId||overlay.hidden||!currentDisplayedProfileIsOwn)return;
  displayNameInitialValue=String(status.display_name||displayNameInitialValue).trim();
  input.value=displayNameInitialValue;
  displayNameCanChange=Boolean(status.can_change);
  if(displayNameCanChange){
   setDisplayNameStatus("Your display name is available to change. You can change it again after 7 days.",false);
  }else{
   const next=status.next_change_at?new Date(status.next_change_at):null;
   const when=next&&!Number.isNaN(next.getTime())?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(next):"the end of the 7-day limit";
   setDisplayNameStatus("You've already changed your display name recently. You can change it again on "+when+".",false);
  }
  refreshDisplayNameSaveButton();
 }catch(error){
  if(requestId!==displayNameRequestId||overlay.hidden)return;
  displayNameCanChange=false;setDisplayNameStatus(error?.message||"Could not load display-name settings.",true);refreshDisplayNameSaveButton();
 }
};
window.saveWorthItDisplayName=async function(){
 if(!currentDisplayedProfileIsOwn||!currentUser||!displayNameCanChange||displayNameSaving)return;
 const input=$("worthItDisplayNameInput"),save=$("worthItDisplayNameSave");
 const name=String(input?.value||"").trim();
 const validation=validateDisplayName(name);if(!validation.valid){setDisplayNameStatus(validation.reason,true);return;}
 if(name===displayNameInitialValue){setDisplayNameStatus("Your display name hasn't changed.",false);return;}
 displayNameSaving=true;if(save)save.disabled=true;
 setDisplayNameStatus("Saving your display name…",false);
 try{
  const token=await getDisplayNameToken();
  const response=await fetch("/api/profile-display-name",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({display_name:name})});
  let data={};try{data=await response.json();}catch(_){}
  if(!response.ok||!data.success){
   if(data.code==="DISPLAY_NAME_COOLDOWN"&&data.next_change_at){
    const next=new Date(data.next_change_at),when=!Number.isNaN(next.getTime())?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(next):"after 7 days";
    displayNameCanChange=false;setDisplayNameStatus("You've already changed your display name recently. You can change it again on "+when+".",false);
   }else setDisplayNameStatus(data.error||"Could not save your display name.",true);
   return;
  }
  const id=currentDisplayedProfileId;
  currentOwnProfile=null;currentOwnProfileRequest=null;
  closeWorthItDisplayNameEditor();
  if(id)await window.openWorthItProfile(id);
  if(typeof window.showToast==="function")window.showToast(data.unchanged?"Your display name is unchanged.":"Display name updated successfully.");
 }catch(error){
  setDisplayNameStatus(error?.message||"Could not save your display name.",true);
 }finally{
  displayNameSaving=false;
  if($("worthItDisplayNameOverlay")&&!$("worthItDisplayNameOverlay").hidden)refreshDisplayNameSaveButton();
 }
};
document.addEventListener("click",event=>{
 const overlay=$("worthItDisplayNameOverlay");
 if(overlay&&!overlay.hidden&&event.target===overlay)closeWorthItDisplayNameEditor();
});
document.addEventListener("keydown",event=>{
 if(event.key==="Escape"&&!$("worthItDisplayNameOverlay")?.hidden)closeWorthItDisplayNameEditor();
});
if($("worthItDisplayNameInput"))$("worthItDisplayNameInput").addEventListener("input",()=>{
 refreshDisplayNameSaveButton();
 if(!displayNameCanChange)return;
 const next=String($("worthItDisplayNameInput").value||"").trim();
 if(!next||next===displayNameInitialValue){setDisplayNameStatus("",false);return;}
 const validation=validateDisplayName(next);
 setDisplayNameStatus(validation.valid?"This display name meets the format rules.":validation.reason,!validation.valid);
});


if($("worthItProfileDescriptionInput"))$("worthItProfileDescriptionInput").addEventListener("input",function(){
 updateProfileDescriptionSaveButton();if(!profileDescriptionStatusReady)return;
 const remaining=Math.max(0,profileDescriptionNextSaveAt-Date.now());
 if(remaining>0)setProfileDescriptionStatus("You can save another description in "+formatProfileDescriptionRemaining(remaining)+".",false);
 else if(String(this.value||"").trim()===profileDescriptionSavedValue)setProfileDescriptionStatus("There are no changes to save.",false);
 else setProfileDescriptionStatus("Ready to save.",false);
});
function hideProfileAssetControls(){const avatarControls=$("worthItProfileAvatarControls"),bannerControls=$("worthItProfileBannerControls");if(avatarControls)avatarControls.hidden=true;if(bannerControls)bannerControls.hidden=true;}
function renderError(message){
 const profileCard=$("worthItProfileCard"),connectionsPage=$("worthItProfileConnectionsPage");if(profileCard)profileCard.hidden=false;if(connectionsPage)connectionsPage.hidden=true;
 currentDisplayedProfileId=0;currentDisplayedProfileIsOwn=false;resetProfileDescriptionPanel();hideProfileAssetControls();clearProfileBannerBackdrop(true);const displayNameEdit=$("worthItProfileDisplayNameEdit");if(displayNameEdit)displayNameEdit.hidden=true;closeWorthItDisplayNameEditor();
 renderAvatar("","W");setText("worthItProfileName","Profile unavailable");setText("worthItProfileUsername","");
 ["worthItProfileFriends","worthItProfileFollowers","worthItProfileFollowing"].forEach(id=>setText(id,"—"));
 const email=$("worthItProfileEmail");if(email){email.textContent="";email.hidden=true;}
 setText("worthItProfileLink","Profile link unavailable");if($("worthItProfileLink"))$("worthItProfileLink").removeAttribute("href");currentProfileLink="";setText("worthItProfileMemberSince","");setStatus(message,true);
}
window.openWorthItProfile=async function(idValue,options){
 const id=Number(idValue);if(!Number.isSafeInteger(id)||id<1){showProfileSection();renderError("This profile link is invalid.");return;}
 showProfileSection();const profileCard=$("worthItProfileCard"),connectionsPage=$("worthItProfileConnectionsPage");if(profileCard)profileCard.hidden=false;if(connectionsPage)connectionsPage.hidden=true;activeConnectionsRequest++;currentSocialContext=null;currentDisplayedProfileId=id;currentDisplayedProfileIsOwn=false;resetProfileDescriptionPanel();hideProfileAssetControls();const displayNameEdit=$("worthItProfileDisplayNameEdit");if(displayNameEdit)displayNameEdit.hidden=true;closeWorthItDisplayNameEditor();setStatus("Loading profile…",false);setText("worthItProfileName","Loading profile…");["worthItProfileFriends","worthItProfileFollowers","worthItProfileFollowing"].forEach(x=>setText(x,"…"));
 const requestId=++activeProfileRequest;
 try{
  const sb=client();if(!sb)throw new Error("Supabase not ready");
  const [publicResult,user,descriptionResult]=await Promise.all([sb.from("worth_it_public_profiles").select("worth_it_id,username,display_name,avatar_url,banner_url,created_at").eq("worth_it_id",id).maybeSingle(),getCurrentUser().catch(()=>null),Promise.resolve(sb.from("worth_it_public_profiles").select("description").eq("worth_it_id",id).maybeSingle()).catch(()=>({data:null,error:true}))]);
  if(requestId!==activeProfileRequest)return;if(publicResult.error)throw publicResult.error;if(!publicResult.data){renderError("This Worth It profile could not be found.");return;}
  publicResult.data.description=descriptionResult&&!descriptionResult.error?String(descriptionResult.data?.description||""):"";
   currentUser=user||null;let own=null;if(currentUser){try{own=await getOwnProfileRow(currentUser,false);}catch(_){own=null;}}
  const isOwn=Number(own?.worth_it_id)===id;const stats=await getStats(id);if(requestId!==activeProfileRequest)return;renderProfile(publicResult.data,stats,isOwn);
 }catch(e){if(requestId!==activeProfileRequest)return;console.error("Worth It profile load failed.",e);renderError("The profile database is not ready or could not be reached. Run supabase/worth-it-profiles.sql in Supabase, then refresh this page.");}
};

function hideAssetLimitNotice(target){
 if(assetLimitTimers[target]!==null){clearInterval(assetLimitTimers[target]);assetLimitTimers[target]=null;}
 const node=$(target==="banner"?"worthItProfileBannerLimit":"worthItProfileAvatarLimit");if(node){node.hidden=true;node.textContent="";}
}
function showAssetErrorNotice(target,message){
 const node=$(target==="banner"?"worthItProfileBannerLimit":"worthItProfileAvatarLimit");if(!node)return;
 hideAssetLimitNotice(target);
 node.textContent=String(message||"The profile image could not be changed.");
 node.hidden=false;
}
function showAssetLimitNotice(target,remainingMs){
 const node=$(target==="banner"?"worthItProfileBannerLimit":"worthItProfileAvatarLimit");if(!node)return;
 hideAssetLimitNotice(target);
 const endAt=Date.now()+Math.max(0,Number(remainingMs)||0);
 const assetLabel=target==="banner"?"profile banner":"profile picture";
 const update=()=>{
  const left=endAt-Date.now();
  if(left<=0){hideAssetLimitNotice(target);return;}
  const totalMinutes=Math.max(1,Math.ceil(left/60000));
  const hours=Math.floor(totalMinutes/60),minutes=totalMinutes%60;
  const hoursText=hours+" "+(hours===1?"hour":"hours");
  const minutesText=minutes+" "+(minutes===1?"minute":"minutes");
  node.textContent="You can change your "+assetLabel+" only once every 24 hours. Try again in "+hoursText+" and "+minutesText+".";
  node.hidden=false;
 };
 update();
 if(endAt>Date.now())assetLimitTimers[target]=setInterval(update,15000);
}
function hideAllAssetLimitNotices(){hideAssetLimitNotice("avatar");hideAssetLimitNotice("banner");}
function setAssetControlsBusy(busy,target){
 avatarOperationInProgress=Boolean(busy);
 const avatarChange=$("worthItProfileAvatarChange"),bannerChange=$("worthItProfileBannerChange");
 const avatarRemove=$("worthItProfileAvatarRemove"),bannerRemove=$("worthItProfileBannerRemove");
 if(avatarChange){avatarChange.disabled=avatarOperationInProgress;avatarChange.textContent=avatarOperationInProgress&&target==="avatar"?"Checking image…":"Change photo";}
 if(bannerChange){bannerChange.disabled=avatarOperationInProgress;bannerChange.textContent=avatarOperationInProgress&&target==="banner"?"Checking banner…":"Change banner";}
 [avatarRemove,bannerRemove].forEach(button=>{if(button)button.disabled=avatarOperationInProgress;});
 ["worthItProfileAvatarInput","worthItProfileBannerInput"].forEach(id=>{const input=$(id);if(input)input.disabled=avatarOperationInProgress;});
}
window.triggerWorthItAvatarUpload=function(){triggerWorthItAssetUpload("avatar");};
window.triggerWorthItBannerUpload=function(){triggerWorthItAssetUpload("banner");};
function triggerWorthItAssetUpload(target){if(!currentDisplayedProfileIsOwn||avatarOperationInProgress)return;const input=$(target==="banner"?"worthItProfileBannerInput":"worthItProfileAvatarInput");if(input)input.click();}
async function detectProfileImageFormat(file){
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 if(bytes.length>=6&&["GIF87a","GIF89a"].includes(String.fromCharCode(...bytes.subarray(0,6))))return"gif";
 if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return"png";
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return"jpeg";
 if(bytes.length>=12&&bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46&&bytes[8]===0x57&&bytes[9]===0x45&&bytes[10]===0x42&&bytes[11]===0x50)return"webp";
 return"";
}
function profileImageFormatName(format){
 return format==="webp"?"WebP":format==="png"?"PNG":format==="jpeg"?"JPEG":format==="gif"?"GIF":"unknown";
}
async function encodeProfileImage(file,target,format){
 if(format==="gif")return{blob:file,mimeType:"image/gif"};
 const bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
 try{
  const presets=target==="banner"?[{width:1200,height:400},{width:960,height:320},{width:720,height:240}]:[{width:512,height:512},{width:384,height:384},{width:256,height:256}];
  for(const preset of presets){
   const canvas=document.createElement("canvas");canvas.width=preset.width;canvas.height=preset.height;
   const context=canvas.getContext("2d",{alpha:false});if(!context)throw new Error("Your browser couldn't prepare this image.");
   const scale=Math.max(preset.width/bitmap.width,preset.height/bitmap.height),drawWidth=bitmap.width*scale,drawHeight=bitmap.height*scale;
   context.drawImage(bitmap,(preset.width-drawWidth)/2,(preset.height-drawHeight)/2,drawWidth,drawHeight);
   for(const quality of [0.86,0.72,0.58]){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
    if(blob&&blob.type==="image/webp"&&blob.size<=512*1024)return{blob,mimeType:"image/webp",moderationSheets:[]};
   }
  }
 }finally{if(typeof bitmap.close==="function")bitmap.close();}
 throw new Error("This image couldn't be converted to a small WebP file. Please try another image.");
}
async function sendAssetAction(action,target,payload){
 const sb=client();if(!sb?.auth)throw new Error("Sign in to change your profile picture.");
 const sessionResult=await sb.auth.getSession(),token=sessionResult.data?.session?.access_token;
 if(sessionResult.error||!token)throw new Error("Your login session has expired. Please sign in again.");
 const headers={"Authorization":"Bearer "+token,"X-Worth-It-Asset":target};
 let body;
 if(action==="upload"&&payload.mimeType==="image/gif"){
  body=new FormData();body.append("file",payload.blob,"animation.gif");
 }else if(action==="upload"){
  headers["Content-Type"]="image/webp";body=payload.blob;
 }else{
  headers["Content-Type"]="application/json";body=JSON.stringify({action:action,target:target});
 }
 const response=await fetch("/api/profile-avatar",{method:"POST",headers,body});
 let data={};try{data=await response.json();}catch(_){}
 if(!response.ok||!data.success){const error=new Error(data.error||"The profile asset could not be changed.");error.code=data.code||"";error.remainingMs=Number(data.remaining_ms)||0;error.retryAt=data.retry_at||"";throw error;}
 return data;
}
async function finishAssetAction(data){
 const user=await getCurrentUser();if(user)await getOwnProfileRow(user,true);
 const id=currentDisplayedProfileId||Number(currentOwnProfile?.profile?.worth_it_id)||0;
 if(id)await window.openWorthItProfile(id);
 if(typeof window.showToast==="function")window.showToast(data.message||"Profile updated.");
}
async function handleAssetInputChange(event,target){
 const input=event?.target||$(target==="banner"?"worthItProfileBannerInput":"worthItProfileAvatarInput"),file=input?.files?.[0];if(!file)return;
 if(!currentDisplayedProfileIsOwn){if(input)input.value="";return;}
 setAssetControlsBusy(true,target);hideAssetLimitNotice(target);setStatus("",false);
 try{
  const detectedFormat=await detectProfileImageFormat(file);
  const declaredGif=String(file.type||"").toLowerCase()==="image/gif"||/\.gif$/i.test(String(file.name||""));
  if(declaredGif&&detectedFormat!=="gif"){
   const actual=detectedFormat?profileImageFormatName(detectedFormat):"unknown";
   throw new Error(detectedFormat
    ?"This file contains "+actual+" data, not GIF data. It may be a still preview from a website. Download the original animated GIF and try again."
    :"This file is labeled or named as a GIF, but its contents are not a valid GIF. Download the original animated GIF rather than a preview or renamed image.");
  }
  if(!detectedFormat)throw new Error("The file contents do not match a supported JPG, PNG, WebP or GIF image. Please download the original image and try again.");
  if(file.size>8*1024*1024)throw new Error("Choose an image smaller than 8 MB.");
  setStatus("Preparing your "+(target==="banner"?"banner":"profile picture")+" for a safety check…",false);
  const prepared=await encodeProfileImage(file,target,detectedFormat);
  setStatus("Checking "+(target==="banner"?"the banner":"the profile picture")+" for nudity, hate symbols and extremist content…",false);
  const data=await sendAssetAction("upload",target,prepared);
  setStatus("Image approved. Updating your profile…",false);
  await finishAssetAction(data);
 }catch(error){
  if(error?.code==="AVATAR_DAILY_LIMIT"||error?.code==="BANNER_DAILY_LIMIT"){setStatus("",false);showAssetLimitNotice(target,error.remainingMs);}
  else{hideAssetLimitNotice(target);setStatus("",false);showAssetErrorNotice(target,error?.message||"The profile image could not be uploaded. Please try another image.");}
 }finally{setAssetControlsBusy(false);if(input)input.value="";}
}
async function removeProfileAsset(target){
 if(!currentDisplayedProfileIsOwn||avatarOperationInProgress)return;
 if(!window.confirm(target==="banner"?"Remove your current profile banner?":"Remove your current profile picture?"))return;
 setAssetControlsBusy(true,target);hideAssetLimitNotice(target);setStatus("Removing your "+(target==="banner"?"profile banner":"profile picture")+"…",false);
 try{const data=await sendAssetAction("remove",target);await finishAssetAction(data);}
 catch(error){
  if(error?.code==="AVATAR_DAILY_LIMIT"||error?.code==="BANNER_DAILY_LIMIT"){setStatus("",false);showAssetLimitNotice(target,error.remainingMs);}
  else{hideAssetLimitNotice(target);setStatus("",false);showAssetErrorNotice(target,error?.message||"The profile image could not be removed.");}
 }finally{setAssetControlsBusy(false);}
}
window.removeWorthItProfilePhoto=function(){return removeProfileAsset("avatar");};
window.removeWorthItProfileBanner=function(){return removeProfileAsset("banner");};

window.copyWorthItProfileLink=async function(){
 const link=currentProfileLink||$("worthItProfileLink")?.href||"";if(!link){if(typeof window.showToast==="function")window.showToast("Profile link is not available.");return;}
 try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);else{const t=document.createElement("textarea");t.value=link;t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();const copied=document.execCommand("copy");t.remove();if(!copied)throw new Error("copy failed");}if(typeof window.showToast==="function")window.showToast("Profile link copied!");}
 catch(_){if(typeof window.showToast==="function")window.showToast("Could not copy the link. Select and copy it manually.");}
};
window.addEventListener("resize",syncProfileBannerBackdropPosition,{passive:true});
if(client()?.auth){client().auth.onAuthStateChange((_event,session)=>{
 const nextUser=session?.user||null,previousUserId=currentUser?.id||"",nextUserId=nextUser?.id||"",profileToRefresh=currentDisplayedProfileId,connectionsPage=$("worthItProfileConnectionsPage"),connectionTab=document.querySelector("[data-connection-tab].active")?.getAttribute("data-connection-tab");
 currentUser=nextUser;currentOwnProfile=null;currentOwnProfileRequest=null;
 if(nextUser&&(previousUserId!==nextUserId||_event==="SIGNED_IN")){presenceLastHeartbeatAt=0;touchWorthItPresence(true);}else if(!nextUser)presenceLastHeartbeatAt=0;
 setWorthItNotificationAuthState(nextUser);
 if(nextUser&&(previousUserId!==nextUserId||_event==="SIGNED_IN"))refreshWorthItNotifications(false);
 if(previousUserId!==nextUserId){
  currentDisplayedProfileIsOwn=false;hideProfileAssetControls();closeWorthItDisplayNameEditor();const displayNameEdit=$("worthItProfileDisplayNameEdit");if(displayNameEdit)displayNameEdit.hidden=true;
  const email=$("worthItProfileEmail");if(email){email.textContent="";email.hidden=true;}
  const linkLabel=$("worthItProfileLinkLabel");if(linkLabel)linkLabel.textContent=profileToRefresh?"THIS USER'S PROFILE":"PROFILE LINK";
  if(profileToRefresh)setTimeout(()=>{if(currentDisplayedProfileId===profileToRefresh){if(connectionsPage&&!connectionsPage.hidden&&["friends","followers","following"].includes(connectionTab))window.openWorthItProfileConnections(profileToRefresh,connectionTab);else window.openWorthItProfile(profileToRefresh);}},0);
 }
 if(!currentUser)setPanelUnavailable();
});client().auth.getSession().then(({data})=>{currentUser=data?.session?.user||null;if(currentUser){refreshAccountPanelCounts(false);setWorthItNotificationAuthState(currentUser);refreshWorthItNotifications(false);presenceLastHeartbeatAt=0;touchWorthItPresence(true);}else setWorthItNotificationAuthState(null);}).catch(()=>{});}
if($("worthItProfileAvatarInput"))$("worthItProfileAvatarInput").addEventListener("change",event=>handleAssetInputChange(event,"avatar"));
if($("worthItProfileBannerInput"))$("worthItProfileBannerInput").addEventListener("change",event=>handleAssetInputChange(event,"banner"));
})();
