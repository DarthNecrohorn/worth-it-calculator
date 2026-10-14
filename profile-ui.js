/* Worth It profiles: account summary, shareable profile section, and public profile URLs. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const BASE_URL="https://worth-it-calculator.pages.dev";
let currentUser=null,currentOwnProfile=null,currentOwnProfileRequest=null,activeProfileRequest=0,currentProfileLink="",currentDisplayedProfileId=0,currentDisplayedProfileIsOwn=false,avatarOperationInProgress=false,assetLimitTimers={avatar:null,banner:null};
const client=()=>window.supabaseClient||null;
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
window.hideWorthItProfileSection=function(){const n=$("profileSection");if(n)n.style.display="none";};
function fallbackAvatar(name){const n=document.createElement("div");n.className="worth-it-profile-avatar-fallback";n.textContent=String(name||"W").trim().charAt(0).toUpperCase()||"W";return n;}
function safeAvatarUrl(url){return typeof url==="string"&&/^https?:\/\//i.test(url)?url:"";}
function renderAvatar(url,name){const host=$("worthItProfileAvatar");if(!host)return;host.replaceChildren();const safe=safeAvatarUrl(url);if(!safe){host.appendChild(fallbackAvatar(name));return;}const img=document.createElement("img");img.className="worth-it-profile-avatar";img.alt="";img.referrerPolicy="no-referrer";img.src=safe;img.addEventListener("error",()=>host.replaceChildren(fallbackAvatar(name)),{once:true});host.appendChild(img);}
function renderBanner(url){const cover=$("worthItProfileCover"),image=$("worthItProfileBannerImage");if(!cover||!image)return;const safe=safeAvatarUrl(url);if(!safe){image.removeAttribute("src");image.hidden=true;cover.classList.remove("has-banner");return;}image.onerror=()=>{image.hidden=true;cover.classList.remove("has-banner");image.removeAttribute("src");};image.src=safe;image.hidden=false;cover.classList.add("has-banner");}
function renderSmallAvatar(host,url,name,imageClass,fallbackClass){if(!host)return;host.replaceChildren();const safe=safeAvatarUrl(url);if(!safe){const fallback=document.createElement("div");fallback.className=fallbackClass;fallback.textContent=String(name||"W").trim().charAt(0).toUpperCase()||"W";host.appendChild(fallback);return;}const img=document.createElement("img");img.className=imageClass;img.alt="";img.referrerPolicy="no-referrer";img.src=safe;img.addEventListener("error",()=>{host.replaceChildren();const fallback=document.createElement("div");fallback.className=fallbackClass;fallback.textContent=String(name||"W").trim().charAt(0).toUpperCase()||"W";host.appendChild(fallback);},{once:true});host.appendChild(img);}
function syncHeaderAvatar(profile){const name=profile?.display_name||profile?.username||currentUser?.user_metadata?.full_name||currentUser?.email?.split("@")[0]||"Worth It";renderSmallAvatar($("profileNavIcon"),profile?.avatar_url,name,"auth-avatar","auth-avatar-fallback");renderSmallAvatar($("accountHeadAvatar"),profile?.avatar_url,name,"account-head-avatar","account-head-fallback");}
function normalizeStats(data){let d=Array.isArray(data)?data[0]:data;d=d&&typeof d==="object"?d:{};return{friends:Number(d.friends)||0,followers:Number(d.followers)||0,following:Number(d.following)||0};}
async function getStats(id){const sb=client();if(!sb||!Number.isSafeInteger(Number(id)))throw new Error("Stats unavailable");const r=await sb.rpc("get_worth_it_profile_stats",{target_worth_it_id:Number(id)});if(r.error)throw r.error;return normalizeStats(r.data);}
async function getOwnProfileRow(user,force){
 if(!user?.id)return null;
 if(!force&&currentOwnProfile?.userId===user.id)return currentOwnProfile.profile;
 if(!force&&currentOwnProfileRequest?.userId===user.id)return currentOwnProfileRequest.promise;
 const sb=client();if(!sb)throw new Error("Auth not ready");
 const promise=(async()=>{const r=await sb.from("worth_it_profiles").select("worth_it_id,username,display_name,avatar_url,banner_url,created_at").eq("user_id",user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error("Worth It ID has not been assigned");currentOwnProfile={userId:user.id,profile:r.data};syncHeaderAvatar(r.data);return r.data;})();
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
 const id=Number(p.worth_it_id),name=String(p.display_name||p.username||"Worth It member"),username=String(p.username||""),link=BASE_URL+"/profile/"+id;currentProfileLink=link;
 renderAvatar(p.avatar_url,name);renderBanner(p.banner_url,name);setText("worthItProfileName",name);setText("worthItProfileUsername",username?"@"+username:"Worth It member");setText("worthItProfileId","#"+id);
 setCount("worthItProfileFriends",s.friends);setCount("worthItProfileFollowers",s.followers);setCount("worthItProfileFollowing",s.following);
 const email=$("worthItProfileEmail");if(email){email.textContent=isOwn&&currentUser?.email?currentUser.email:"";email.hidden=!(isOwn&&currentUser?.email);}
 const linkNode=$("worthItProfileLink");if(linkNode){linkNode.href=link;linkNode.textContent=link;}setText("worthItProfileLinkLabel",isOwn?"YOUR PROFILE LINK":"PROFILE LINK");
 const member=$("worthItProfileMemberSince");if(member){const date=p.created_at?new Date(p.created_at):null;if(date&&!Number.isNaN(date.getTime())){const parts=new Intl.DateTimeFormat("en-GB",{day:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);const part=type=>parts.find(x=>x.type===type)?.value||"";const month=new Intl.DateTimeFormat("en-US",{month:"short"}).format(date);member.textContent="Joined "+part("day")+" "+month+", "+part("year")+" "+part("hour")+":"+part("minute");}else{member.textContent="";}}
 hideAllAssetLimitNotices();
 currentDisplayedProfileId=id;currentDisplayedProfileIsOwn=Boolean(isOwn);
 const avatarControls=$("worthItProfileAvatarControls");if(avatarControls)avatarControls.hidden=!isOwn;
 const bannerControls=$("worthItProfileBannerControls");if(bannerControls)bannerControls.hidden=!isOwn;
 const removePhoto=$("worthItProfileAvatarRemove");if(removePhoto)removePhoto.hidden=!isOwn||!safeAvatarUrl(p.avatar_url);
 const removeBanner=$("worthItProfileBannerRemove");if(removeBanner)removeBanner.hidden=!isOwn||!safeAvatarUrl(p.banner_url);
 setAssetControlsBusy(false);setStatus("",false);
}
function renderError(message){
 currentDisplayedProfileId=0;currentDisplayedProfileIsOwn=false;const avatarControls=$("worthItProfileAvatarControls");if(avatarControls)avatarControls.hidden=true;
 renderAvatar("","W");setText("worthItProfileName","Profile unavailable");setText("worthItProfileUsername","");setText("worthItProfileId","—");
 ["worthItProfileFriends","worthItProfileFollowers","worthItProfileFollowing"].forEach(id=>setText(id,"—"));
 const email=$("worthItProfileEmail");if(email){email.textContent="";email.hidden=true;}
 setText("worthItProfileLink","Profile link unavailable");if($("worthItProfileLink"))$("worthItProfileLink").removeAttribute("href");currentProfileLink="";setText("worthItProfileMemberSince","");setStatus(message,true);
}
window.openWorthItProfile=async function(idValue,options){
 const id=Number(idValue);if(!Number.isSafeInteger(id)||id<1){showProfileSection();renderError("This profile link is invalid.");return;}
 showProfileSection();currentDisplayedProfileId=id;currentDisplayedProfileIsOwn=false;const avatarControls=$("worthItProfileAvatarControls");if(avatarControls)avatarControls.hidden=true;setStatus("Loading profile…",false);setText("worthItProfileName","Loading profile…");setText("worthItProfileId","#"+id);["worthItProfileFriends","worthItProfileFollowers","worthItProfileFollowing"].forEach(x=>setText(x,"…"));
 const requestId=++activeProfileRequest;
 try{
  const sb=client();if(!sb)throw new Error("Supabase not ready");
  const [publicResult,user]=await Promise.all([sb.from("worth_it_public_profiles").select("worth_it_id,username,display_name,avatar_url,banner_url,created_at").eq("worth_it_id",id).maybeSingle(),getCurrentUser().catch(()=>null)]);
  if(requestId!==activeProfileRequest)return;if(publicResult.error)throw publicResult.error;if(!publicResult.data){renderError("This Worth It profile could not be found.");return;}
  currentUser=user||null;let own=null;if(currentUser){try{own=await getOwnProfileRow(currentUser,false);}catch(_){own=null;}}
  const isOwn=Number(own?.worth_it_id)===id;const stats=await getStats(id);if(requestId!==activeProfileRequest)return;renderProfile(publicResult.data,stats,isOwn);
 }catch(e){if(requestId!==activeProfileRequest)return;console.error("Worth It profile load failed.",e);renderError("The profile database is not ready or could not be reached. Run supabase/worth-it-profiles.sql in Supabase, then refresh this page.");}
};

function hideAssetLimitNotice(target){
 if(assetLimitTimers[target]!==null){clearInterval(assetLimitTimers[target]);assetLimitTimers[target]=null;}
 const node=$(target==="banner"?"worthItProfileBannerLimit":"worthItProfileAvatarLimit");if(node){node.hidden=true;node.textContent="";}
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
 setAssetControlsBusy(true,target);
 try{
  const detectedFormat=await detectProfileImageFormat(file);
  const declaredGif=String(file.type||"").toLowerCase()==="image/gif"||/\\.gif$/i.test(String(file.name||""));
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
  else{hideAssetLimitNotice(target);setStatus(error?.message||"The profile image couldn't be uploaded. Please try another image.",true);}
 }finally{setAssetControlsBusy(false);if(input)input.value="";}
}
async function removeProfileAsset(target){
 if(!currentDisplayedProfileIsOwn||avatarOperationInProgress)return;
 if(!window.confirm(target==="banner"?"Remove your current profile banner?":"Remove your current profile picture?"))return;
 setAssetControlsBusy(true,target);setStatus("Removing your "+(target==="banner"?"profile banner":"profile picture")+"…",false);
 try{const data=await sendAssetAction("remove",target);await finishAssetAction(data);}
 catch(error){
  if(error?.code==="AVATAR_DAILY_LIMIT"||error?.code==="BANNER_DAILY_LIMIT"){setStatus("",false);showAssetLimitNotice(target,error.remainingMs);}
  else{hideAssetLimitNotice(target);setStatus(error?.message||"The profile image couldn't be removed.",true);}
 }finally{setAssetControlsBusy(false);}
}
window.removeWorthItProfilePhoto=function(){return removeProfileAsset("avatar");};
window.removeWorthItProfileBanner=function(){return removeProfileAsset("banner");};

window.copyWorthItProfileLink=async function(){
 const link=currentProfileLink||$("worthItProfileLink")?.href||"";if(!link){if(typeof window.showToast==="function")window.showToast("Profile link is not available.");return;}
 try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);else{const t=document.createElement("textarea");t.value=link;t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();const copied=document.execCommand("copy");t.remove();if(!copied)throw new Error("copy failed");}if(typeof window.showToast==="function")window.showToast("Profile link copied!");}
 catch(_){if(typeof window.showToast==="function")window.showToast("Could not copy the link. Select and copy it manually.");}
};
if(client()?.auth){client().auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;currentOwnProfile=null;currentOwnProfileRequest=null;if(!currentUser)setPanelUnavailable();});client().auth.getSession().then(({data})=>{currentUser=data?.session?.user||null;if(currentUser)refreshAccountPanelCounts(false);}).catch(()=>{});}
if($("worthItProfileAvatarInput"))$("worthItProfileAvatarInput").addEventListener("change",event=>handleAssetInputChange(event,"avatar"));
if($("worthItProfileBannerInput"))$("worthItProfileBannerInput").addEventListener("change",event=>handleAssetInputChange(event,"banner"));
})();
