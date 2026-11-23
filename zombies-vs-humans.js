(() => {
"use strict";

const $ = id => document.getElementById(id);
const TABLE = "worth_it_zvh_game_saves";
const STORAGE_PREFIX = "worthItZvhSave:v1:";
const ROUTE = "/zombiesvshumans";
const IS_PAGES_PREVIEW = /\.worth-it-calculator\.pages\.dev$/i.test(String(window.location.hostname||"")) &&
  String(window.location.hostname||"").toLowerCase() !== "worth-it-calculator.pages.dev";
function nextEggDelay(initial){
  if(IS_PAGES_PREVIEW)return initial?3500+Math.random()*2500:6500+Math.random()*5500;
  return initial?25000+Math.random()*40000:45000+Math.random()*85000;
}
const EGG_CLASS = "zvh-discovery-egg";
const maps = {
  zombie: [
    {id:"city",name:"Downtown Outbreak",icon:"🏙️",cost:0,desc:"Wide streets, parked cars and panicked civilians.",palette:["#35463d","#5b6660","#23332d"]},
    {id:"mall",name:"Shopping Mall",icon:"🛍️",cost:160,desc:"Tight corridors, crowds and breakable shop fixtures.",palette:["#46464b","#707078","#30333b"]},
    {id:"industrial",name:"Industrial Zone",icon:"🏭",cost:290,desc:"Warehouses, loading bays and heavy machinery.",palette:["#4d4639","#6d6049","#292e2e"]}
  ],
  human: [
    {id:"safehouse",name:"Last Safehouse",icon:"🏚️",cost:0,desc:"Defend the block around the last survivor shelter.",palette:["#3a4650","#68737a","#26313a"]},
    {id:"military",name:"Military Outpost",icon:"🪖",cost:190,desc:"A fortified perimeter with tougher incoming hordes.",palette:["#41483c","#69735c","#28352d"]},
    {id:"metro",name:"Underground Station",icon:"🚇",cost:320,desc:"Narrow platforms, dark tunnels and close encounters.",palette:["#42434f","#6b6872","#292a38"]}
  ]
};
const upgradeCatalog = {
  zombie: [
    {id:"health",name:"Undead resilience",desc:"+25 starting health per level",icon:"🛡️",base:75},
    {id:"damage",name:"Infection strength",desc:"Deal more damage when infecting or fighting",icon:"🦷",base:90},
    {id:"horde",name:"Horde capacity",desc:"More loyal zombies can follow you",icon:"🧟",base:130},
    {id:"speed",name:"Predator sprint",desc:"Move faster when hunting",icon:"💨",base:110},
    {id:"elite",name:"Elite horde strain",desc:"Your loyal zombies start tougher and hit harder",icon:"🧟‍♀️",base:165},
    {id:"mutation",name:"Mutant starting form",desc:"Begin each run as a stronger zombie",icon:"🧬",base:210}
  ],
  human: [
    {id:"health",name:"Field medical training",desc:"+25 starting health per level",icon:"🩹",base:75},
    {id:"damage",name:"Weapon damage",desc:"Deal more damage per shot",icon:"🎯",base:95},
    {id:"fire",name:"Rapid fire training",desc:"Shorter time between shots",icon:"⚡",base:125},
    {id:"squad",name:"Squad leadership",desc:"Recruit more survivor companions",icon:"🪖",base:160},
    {id:"skin",name:"Survivor uniforms",desc:"Unlock a new visual survivor outfit",icon:"🎖️",base:115}
  ]
};
const defaults = {
  unlocked:false,coins:100,
  maps:{zombie:["city"],human:["safehouse"]},
  selected:{zombie:"city",human:"safehouse"},
  upgrades:{zombie:{health:0,damage:0,horde:0,speed:0,elite:0,mutation:0},human:{health:0,damage:0,fire:0,squad:0,skin:0}},
  bestWave:{zombie:0,human:0},totalInfested:0,totalKills:0,
  settings:{effects:true,shake:false,mobile:true}
};
let profile = clone(defaults);
let userId = "";
let dataApiAvailable = null;
let profileReady = false;
let selectedMode = "zombie";
let run = null;
let animationFrame = 0;
let lastFrame = 0;
let eggTimer = 0;
let activeEgg = null;
let pointerAim = null;
let joystick = {active:false,x:0,y:0,pointerId:null};
let keys = new Set();
let nextEntityId = 1;
let resizeObserver = null;

function clone(value){return JSON.parse(JSON.stringify(value));}
function validMode(value){return value==="human"?"human":"zombie";}
function scopedKey(id){return STORAGE_PREFIX+(id||"guest");}
function toast(message){if(typeof window.showToast==="function")window.showToast(message);}
function isMissingTable(error){
  const code=String(error?.code||"");
  const message=String(error?.message||"").toLowerCase();
  return code==="42P01"||code==="PGRST205"||code==="PGRST202"||/relation .* does not exist|could not find the table|schema cache/.test(message);
}
function normaliseProfile(raw){
  const result=clone(defaults), value=raw&&typeof raw==="object"?raw:{};
  result.unlocked=Boolean(value.unlocked);
  result.coins=value&&Object.prototype.hasOwnProperty.call(value,"coins")?Math.max(0,Math.min(10000000,Math.floor(Number(value.coins)||0))):defaults.coins;
  ["zombie","human"].forEach(mode=>{
    const valid=maps[mode].map(item=>item.id);
    const saved=Array.isArray(value.maps?.[mode])?value.maps[mode]:[];
    result.maps[mode]=Array.from(new Set([...(mode==="zombie"?["city"]:["safehouse"]),...saved.filter(id=>valid.includes(id))]));
    const selected=value.selected?.[mode];
    result.selected[mode]=result.maps[mode].includes(selected)?selected:(mode==="zombie"?"city":"safehouse");
    Object.keys(result.upgrades[mode]).forEach(key=>{
      result.upgrades[mode][key]=Math.max(0,Math.min(10,Math.floor(Number(value.upgrades?.[mode]?.[key])||0)));
    });
    result.bestWave[mode]=Math.max(0,Math.floor(Number(value.bestWave?.[mode])||0));
  });
  result.totalInfested=Math.max(0,Math.floor(Number(value.totalInfested)||0));
  result.totalKills=Math.max(0,Math.floor(Number(value.totalKills)||0));
  result.settings={
    effects:value.settings?.effects!==false,
    shake:Boolean(value.settings?.shake),
    mobile:value.settings?.mobile!==false
  };
  return result;
}
function mergeProfiles(left,right){
  const a=normaliseProfile(left),b=normaliseProfile(right),merged=normaliseProfile(a);
  merged.unlocked=a.unlocked||b.unlocked;
  merged.coins=Math.max(a.coins,b.coins);
  ["zombie","human"].forEach(mode=>{
    merged.maps[mode]=Array.from(new Set([...a.maps[mode],...b.maps[mode]]));
    merged.selected[mode]=merged.maps[mode].includes(b.selected[mode])?b.selected[mode]:a.selected[mode];
    Object.keys(merged.upgrades[mode]).forEach(key=>{merged.upgrades[mode][key]=Math.max(a.upgrades[mode][key],b.upgrades[mode][key]);});
    merged.bestWave[mode]=Math.max(a.bestWave[mode],b.bestWave[mode]);
  });
  merged.totalInfested=Math.max(a.totalInfested,b.totalInfested);
  merged.totalKills=Math.max(a.totalKills,b.totalKills);
  merged.settings=b.settings||a.settings;
  return normaliseProfile(merged);
}
function readLocal(id){
  try{return normaliseProfile(JSON.parse(localStorage.getItem(scopedKey(id))||"null"));}catch(_){return clone(defaults);}
}
function writeLocal(id){
  try{localStorage.setItem(scopedKey(id),JSON.stringify(profile));}catch(_){}
}
function updateSaveNote(message){
  const node=$("zvhSaveNote");
  if(node)node.textContent=message;
}
function updateMenuUnlock(){
  const visible=profile.unlocked;
  ["zvhNavEntry","zvhMoreMenuEntry"].forEach(id=>{
    const node=$(id);
    if(node)node.hidden=!visible;
  });
}
function updateWallet(){
  ["zvhCoinBalance","zvhHudCoins"].forEach(id=>{const node=$(id);if(node)node.textContent=String(profile.coins+(run?.earned||0));});
}
function saveCloud(){
  if(!userId||dataApiAvailable===false)return Promise.resolve(false);
  const client=window.supabaseClient;
  if(!client?.from)return Promise.resolve(false);
  const payload={
    user_id:userId,
    unlocked:profile.unlocked,
    game_data:{
      coins:profile.coins,maps:profile.maps,selected:profile.selected,
      upgrades:profile.upgrades,bestWave:profile.bestWave,
      totalInfested:profile.totalInfested,totalKills:profile.totalKills,
      settings:profile.settings
    },
    updated_at:new Date().toISOString()
  };
  return client.from(TABLE).upsert(payload,{onConflict:"user_id"}).then(({error})=>{
    if(error){
      if(isMissingTable(error)){dataApiAvailable=false;updateSaveNote("This Preview is using local saves until the game-save database migration is installed.");}
      else{console.warn("ZVH cloud save unavailable:",error.message);updateSaveNote("Saved on this device. Cloud sync will retry when available.");}
      return false;
    }
    dataApiAvailable=true;
    updateSaveNote("Game progress synced to your Worth It account.");
    return true;
  }).catch(error=>{console.warn("ZVH cloud save failed:",error);return false;});
}
let savePending=false;
function persist(){
  writeLocal(userId);
  updateMenuUnlock();
  updateWallet();
  if(userId){
    if(savePending)return;
    savePending=true;
    window.setTimeout(()=>{savePending=false;void saveCloud();},650);
  }
}
async function loadProfileForSession(session){
  const previousUser=userId;
  userId=session?.user?.id||"";
  const local=readLocal(userId);
  let remote=null;
  const client=window.supabaseClient;
  if(userId&&client?.from&&dataApiAvailable!==false){
    try{
      const result=await client.from(TABLE).select("unlocked,game_data").eq("user_id",userId).maybeSingle();
      if(result.error){
        if(isMissingTable(result.error)){
          dataApiAvailable=false;
          updateSaveNote("This Preview is using local saves until the game-save database migration is installed.");
        }else{
          console.warn("ZVH cloud load unavailable:",result.error.message);
          updateSaveNote("Using this device's saved game progress while cloud sync reconnects.");
        }
      }else{
        dataApiAvailable=true;
        if(result.data)remote={...(result.data.game_data||{}),unlocked:Boolean(result.data.unlocked)};
      }
    }catch(error){console.warn("ZVH save load failed:",error);}
  }
  profile=mergeProfiles(local,remote||defaults);
  if(userId){profile=mergeProfiles(profile,readLocal("guest"));}
  if(!userId&&previousUser){
    writeLocal(previousUser);
  }
  if(!userId){
    const guest=readLocal("guest");
    profile=mergeProfiles(profile,guest);
  }
  profileReady=true;
  updateMenuUnlock();
  updateWallet();
  renderLobby();
  syncSettingsForm();
  if(profile.unlocked){window.clearTimeout(eggTimer);if(activeEgg){activeEgg.remove();activeEgg=null;}}
  else scheduleEgg(nextEggDelay(true));
  if(profile.unlocked&&window.location.pathname.replace(/\/$/,"")===ROUTE){
    showGame({fromUrl:true});
  }else if(!profile.unlocked&&window.location.pathname.replace(/\/$/,"")===ROUTE){
    window.history.replaceState({worthItZvhHome:true},"","/");
    toast("Find the hidden zombie to unlock this secret game.");
    if(typeof window.showHome==="function")window.showHome();
  }
  if(profile.unlocked&&activeEgg){activeEgg.remove();activeEgg=null;}
  return profile;
}

function currentClientSession(){
  return window.supabaseClient?.auth?.getSession?.().then(result=>result?.data?.session||null).catch(()=>null)||Promise.resolve(null);
}
function isModalOpen(){
  return Array.from(document.querySelectorAll('[aria-modal="true"],.worth-it-overlay.open,.modal.open')).some(node=>{
    if(node.hidden||node.getAttribute("aria-hidden")==="true")return false;
    const style=window.getComputedStyle?window.getComputedStyle(node):null;
    return !style||style.display!=="none"&&style.visibility!=="hidden";
  });
}
function scheduleEgg(delay){
  if(profile.unlocked||activeEgg)return;
  window.clearTimeout(eggTimer);eggTimer=0;
  if(document.visibilityState==="hidden")return;
  eggTimer=window.setTimeout(()=>{
    eggTimer=0;
    if(profile.unlocked||activeEgg)return;
    const gameSection=$("zvhGameSection");
    const gameVisible=Boolean(gameSection&&window.getComputedStyle&&window.getComputedStyle(gameSection).display!=="none");
    if(document.visibilityState==="hidden"||isModalOpen()||$("navLinks")?.classList.contains("open")||gameVisible){
      scheduleEgg(IS_PAGES_PREVIEW?1800+Math.random()*2200:18000);
      return;
    }
    revealEgg();
  },delay);
}
function revealEgg(){
  if(profile.unlocked||activeEgg)return;
  const button=document.createElement("button");
  button.type="button";button.className=EGG_CLASS;button.textContent="🧟";
  button.setAttribute("aria-label","A hidden zombie has appeared. Click to unlock Zombies vs Humans.");
  const width=Math.max(320,window.innerWidth),height=Math.max(420,window.innerHeight);
  const left=18+Math.random()*Math.max(10,width-90);
  const top=90+Math.random()*Math.max(10,height-240);
  button.style.left=Math.min(width-74,left)+"px";
  button.style.top=Math.min(height-110,top)+"px";
  button.style.zIndex="2147483000";
  button.addEventListener("click",unlockGame,{once:true});
  document.body.appendChild(button);
  activeEgg=button;
  window.setTimeout(()=>{
    if(activeEgg===button){button.remove();activeEgg=null;scheduleEgg(nextEggDelay(false));}
  },IS_PAGES_PREVIEW?18000:10500);
}
function unlockGame(){
  if(profile.unlocked)return;
  profile.unlocked=true;
  if(activeEgg){activeEgg.remove();activeEgg=null;}
  window.clearTimeout(eggTimer);
  persist();
  toast("Secret unlocked! Zombies vs Humans is now available in the hamburger menu.");
  updateMenuUnlock();
  window.setTimeout(()=>showGame({fromUrl:false}),650);
}
function openFromMenu(){
  if(typeof window.closeMoreMenu==="function")window.closeMoreMenu();
  showGame({fromUrl:false});
}
function showGame(options){
  options=options||{};
  if(!profile.unlocked){toast("The secret game is still locked. Find the hidden zombie first.");return false;}
  const section=$("zvhGameSection");
  if(!section)return false;
  const hideIds=["homePage","weatherSection","newsSection","discountsSection","marketsSection","moneySection","cryptoSection","carsSection","settingsPanel","settingsPage","shopSection","shipTrackingSection","waterLevelsSection","profileSection"];
  hideIds.forEach(id=>{const node=$(id);if(node)node.style.display="none";});
  document.querySelectorAll(".app").forEach(node=>{node.classList.remove("active");node.style.display="none";});
  section.style.display="block";section.classList.add("active");
  const nav=$("navLinks");if(nav){nav.classList.remove("open");nav.setAttribute("aria-hidden","true");}
  document.documentElement.classList.remove("settings-open");
  document.documentElement.style.overflowY="auto";document.body.style.overflowY="auto";
  if(!options.fromUrl&&window.location.pathname.replace(/\/$/,"")!==ROUTE){
    window.history.pushState({worthItZvhRoute:true},"",ROUTE);
  }
  renderLobby();
  if(typeof window.initZvhCanvas==="function")window.initZvhCanvas();
  window.scrollTo({top:0,behavior:"auto"});
  return true;
}
function goHome(){
  if(window.location.pathname.replace(/\/$/,"")===ROUTE)window.history.replaceState({worthItZvhHome:true},"","/");
  stopLoop();
  if(typeof window.showHome==="function")window.showHome();
  else{$("zvhGameSection").style.display="none";$("homePage").style.display="block";}
}
window.openZombiesVsHumans=showGame;
window.openZombiesVsHumansFromMenu=openFromMenu;
window.addEventListener("popstate",()=>{
  if(window.location.pathname.replace(/\/$/,"")===ROUTE){
    if(profile.unlocked)showGame({fromUrl:true});
  }else if($("zvhGameSection")?.style.display!=="none"){
    stopLoop();
    if(typeof window.showHome==="function")window.showHome();
  }
});

function renderLobby(){
  if(!$("zvhLobby"))return;
  updateWallet();
  $("zvhBestWave").textContent=String(Math.max(profile.bestWave.zombie,profile.bestWave.human)||"—");
  $("zvhTotalInfested").textContent=String(profile.totalInfested);
  $("zvhTotalKills").textContent=String(profile.totalKills);
  document.querySelectorAll("[data-zvh-mode]").forEach(button=>button.classList.toggle("is-selected",button.dataset.zvhMode===selectedMode));
  $("zvhMapModeLabel").textContent=selectedMode==="zombie"?"Zombie territories":"Human safe zones";
  renderMaps();
  renderShop();
  const start=$("zvhStartRun");
  if(start)start.textContent="▶ Start "+(selectedMode==="zombie"?"Zombie":"Human")+" Run";
}
function renderMaps(){
  const target=$("zvhMapGrid");if(!target)return;
  target.innerHTML="";
  const selected=profile.selected[selectedMode];
  maps[selectedMode].forEach(item=>{
    const unlocked=profile.maps[selectedMode].includes(item.id);
    const button=document.createElement("button");
    button.type="button";
    button.className="zvh-map-card"+(selected===item.id?" is-selected":"")+(unlocked?"":" is-locked");
    button.innerHTML='<span class="zvh-map-art">'+item.icon+'</span><span><strong>'+item.name+'</strong><small>'+item.desc+'</small><em>'+(unlocked?(selected===item.id?"SELECTED":"AVAILABLE"):"🔒 "+item.cost+" coins")+'</em></span>';
    button.addEventListener("click",()=>{
      if(!unlocked){
        if(profile.coins<item.cost){toast("You need "+item.cost+" game coins to unlock this map.");return;}
        profile.coins-=item.cost;profile.maps[selectedMode].push(item.id);profile.selected[selectedMode]=item.id;
        persist();renderLobby();toast(item.name+" unlocked!");
        return;
      }
      profile.selected[selectedMode]=item.id;persist();renderMaps();
    });
    target.appendChild(button);
  });
}
function renderShop(){
  const target=$("zvhShopGrid");if(!target)return;
  target.innerHTML="";
  upgradeCatalog[selectedMode].forEach(item=>{
    const level=profile.upgrades[selectedMode][item.id]||0;
    const cost=item.base*(level+1);
    const card=document.createElement("div");card.className="zvh-shop-item";
    const copy=document.createElement("span");
    copy.innerHTML="<strong>"+item.icon+" "+item.name+" · Lv "+level+"</strong><small>"+item.desc+"</small>";
    const buy=document.createElement("button");buy.type="button";buy.textContent=cost+" 🪙";buy.disabled=profile.coins<cost||level>=10;
    buy.addEventListener("click",()=>{
      if(level>=10||profile.coins<cost)return;
      profile.coins-=cost;profile.upgrades[selectedMode][item.id]=level+1;
      persist();renderLobby();toast(item.name+" upgraded to level "+(level+1)+".");
    });
    card.append(copy,buy);target.appendChild(card);
  });
}
function syncSettingsForm(){
  const settings=profile.settings||defaults.settings;
  if($("zvhGoreToggle"))$("zvhGoreToggle").checked=Boolean(settings.effects);
  if($("zvhShakeToggle"))$("zvhShakeToggle").checked=Boolean(settings.shake);
  if($("zvhMobileToggle"))$("zvhMobileToggle").checked=settings.mobile!==false;
  applyMobileControlVisibility();
}
function applyMobileControlVisibility(){
  const show=profile.settings.mobile!==false&&window.matchMedia("(max-width: 600px)").matches;
  const joystickNode=$("zvhJoystick"),actions=$("zvhMobileActions");
  if(joystickNode)joystickNode.style.display=show?"grid":"none";
  if(actions)actions.style.display=show?"grid":"none";
}

function entity(team,type,x,y,extra){
  const e={id:nextEntityId++,team,type,x,y,hp:50,maxHp:50,speed:55,radius:13,damage:8,attackCd:0,shotCd:0,fireRange:230,wander:Math.random()*Math.PI*2,order:"follow",angle:0,dead:false};
  return Object.assign(e,extra||{});
}
function mapConfig(){
  return maps[run.mode].find(item=>item.id===run.mapId)||maps[run.mode][0];
}
function initProps(){
  const list=[],map=run.mapId;
  for(let i=0;i<54;i++){
    const x=100+Math.random()*(run.worldW-200),y=100+Math.random()*(run.worldH-200);
    let type=["car","bench","bin","crate","lamp"][i%5];
    if(map==="mall")type=["stall","bench","bin","crate","shop"][i%5];
    if(map==="industrial")type=["crate","barrel","forklift","lamp","pallet"][i%5];
    if(map==="military")type=["barrier","crate","truck","lamp","barrel"][i%5];
    if(map==="metro")type=["bench","ticket","bin","crate","pillar"][i%5];
    list.push({id:nextEntityId++,x,y,type,hp:type==="car"||type==="truck"||type==="forklift"?90:45,maxHp:type==="car"||type==="truck"||type==="forklift"?90:45,radius:type==="car"||type==="truck"||type==="forklift"?28:19,dead:false});
  }
  return list;
}
function startRun(){
  stopLoop();
  const mode=selectedMode,mapId=profile.selected[mode];
  const up=profile.upgrades[mode];
  run={
    mode,mapId,worldW:1900,worldH:1320,elapsed:0,wave:1,nextSpawn:2.5,
    player:entity("player",mode,950,660,{hp:mode==="zombie"?145+up.health*25+up.mutation*35:125+up.health*25,maxHp:mode==="zombie"?145+up.health*25+up.mutation*35:125+up.health*25,speed:mode==="zombie"?176+up.speed*12:195,damage:mode==="zombie"?36+up.damage*16+up.mutation*4:24+up.damage*12,radius:17,attackCd:0,specialCd:0}),
    friends:[],enemies:[],bullets:[],particles:[],props:[],earned:0,infested:0,kills:0,propCount:0,paused:false,finished:false,enemyCounter:0,spawnedBossWave:0
  };
  run.props=initProps();
  if(mode==="zombie"){
    const count=Math.min(2+up.horde,8+up.horde*2);
    for(let i=0;i<count;i++)run.friends.push(entity("friend","zombie",930-i*25,680+(i%2)*24,{hp:68+up.elite*22,maxHp:68+up.elite*22,speed:112,damage:12+up.damage*2+up.elite*3,radius:13}));
    $("zvhZombieCommands").hidden=false;$("zvhHumanCommands").hidden=true;
    $("zvhControlHint").textContent="WASD / arrows to move · E or ATTACK to infect · command your horde";
  }else{
    $("zvhZombieCommands").hidden=true;$("zvhHumanCommands").hidden=false;
    $("zvhControlHint").textContent="WASD / arrows to move · click / SPACE to shoot · recruit survivor allies";
  }
  for(let i=0;i<6;i++)spawnEnemy();
  $("zvhLobby").hidden=true;$("zvhGameView").hidden=false;$("zvhRunResult").hidden=true;
  $("zvhHudMode").textContent=mode==="zombie"?"ZOMBIE":"HUMAN";
  $("zvhHudWave").textContent="1";$("zvhHudHealth").textContent=String(Math.round(run.player.hp));
  $("zvhHealthFill").style.width="100%";$("zvhStageMessage").hidden=true;
  $("zvhSquadCount").textContent=run.friends.length+" / "+(4+up.squad);
  $("zvhHireAlly").disabled=false;
  updateWallet();resizeCanvas();lastFrame=performance.now();animationFrame=requestAnimationFrame(gameFrame);
}
function spawnAtEdge(){
  const a=Math.random()*Math.PI*2,r=520+Math.random()*180;
  return {x:Math.max(55,Math.min(run.worldW-55,run.player.x+Math.cos(a)*r)),y:Math.max(55,Math.min(run.worldH-55,run.player.y+Math.sin(a)*r))};
}
function spawnEnemy(){
  if(!run||run.finished)return;
  const p=spawnAtEdge();
  if(run.mode==="zombie"){
    const wave=run.wave;let type="civilian";
    const roll=Math.random();
    if(wave>=8&&roll<.025)type="heli";
    else if(wave>=6&&roll<.075)type="tank";
    else if(wave>=3&&roll<.28)type="soldier";
    else if(wave>=2&&roll<.48)type="police";
    const specs={
      civilian:{hp:34+wave*2,speed:73,damage:5,radius:12,fireRange:0},
      police:{hp:66+wave*4,speed:76,damage:8+wave, radius:14,fireRange:255,shotCd:1.3},
      soldier:{hp:96+wave*5,speed:71,damage:12+wave, radius:15,fireRange:340,shotCd:1.05},
      tank:{hp:390+wave*20,speed:34,damage:24+wave*2,radius:31,fireRange:490,shotCd:2.7},
      heli:{hp:260+wave*14,speed:94,damage:18+wave, radius:26,fireRange:440,shotCd:1.8}
    };
    run.enemies.push(entity("enemy",type,p.x,p.y,specs[type]));
  }else{
    const wave=run.wave;let type="walker",roll=Math.random();
    if(wave>=6&&roll<.07)type="boss";
    else if(wave>=5&&roll<.2)type="armored";
    else if(wave>=3&&roll<.42)type="brute";
    else if(wave>=2&&roll<.65)type="runner";
    const specs={
      walker:{hp:54+wave*4,speed:72+wave*1.3,damage:8+wave,radius:14},
      runner:{hp:42+wave*3,speed:142+wave*1.4,damage:9+wave,radius:12},
      brute:{hp:160+wave*10,speed:48+wave*.7,damage:22+wave*1.5,radius:21},
      armored:{hp:225+wave*12,speed:57+wave*.6,damage:18+wave*1.3,radius:19},
      boss:{hp:650+wave*34,speed:55+wave*.5,damage:32+wave*2,radius:32}
    };
    run.enemies.push(entity("enemy",type,p.x,p.y,specs[type]));
  }
}
function nearest(list,x,y,range,filter){
  let best=null,bestD=range*range;
  for(const item of list){if(item.dead)continue;if(filter&&!filter(item))continue;const dx=item.x-x,dy=item.y-y,d=dx*dx+dy*dy;if(d<bestD){bestD=d;best=item;}}
  return best;
}
function nearestTargetForFriend(friend){
  return nearest(run.enemies,friend.x,friend.y,friend.order==="attack"?620:friend.type==="zombie"?85:360);
}
function steerAroundProps(actor,dx,dy){
  let ax=dx,ay=dy;
  for(const p of run.props){
    if(p.dead)continue;const x=actor.x-p.x,y=actor.y-p.y,d=Math.hypot(x,y),min=actor.radius+p.radius+7;
    if(d>0&&d<min){const push=(min-d)/min;ax+=x/d*push*2.2;ay+=y/d*push*2.2;}
  }
  const len=Math.hypot(ax,ay)||1;return {x:ax/len,y:ay/len};
}
function moveActor(actor,dx,dy,dt){
  const vector=steerAroundProps(actor,dx,dy);
  actor.x=Math.max(30,Math.min(run.worldW-30,actor.x+vector.x*actor.speed*dt));
  actor.y=Math.max(30,Math.min(run.worldH-30,actor.y+vector.y*actor.speed*dt));
}
function fireBullet(source,target,damage,speed,team){
  const dx=target.x-source.x,dy=target.y-source.y,len=Math.hypot(dx,dy)||1;
  run.bullets.push({x:source.x,y:source.y,vx:dx/len*speed,vy:dy/len*speed,damage,team,life:1.6,radius:team==="friendly"?4:5});
}
function chooseThreat(x,y,enemyTeam){
  const options=[run.player,...run.friends].filter(a=>!a.dead);
  let target=null,best=Infinity;
  for(const item of options){const d=Math.hypot(item.x-x,item.y-y);if(d<best){best=d;target=item;}}
  return target||run.player;
}
function damageActor(actor,amount){
  if(!actor||actor.dead)return;
  actor.hp-=amount;
  if(actor===run.player&&profile.settings.shake)run.shake=Math.min(7,(run.shake||0)+2.5);
  if(actor.hp<=0){
    actor.dead=true;
    if(actor.team==="enemy"){
      run.kills++;
      addEarned(actor.type==="boss"?55:actor.type==="tank"||actor.type==="heli"?35:14);
    }else if(actor.team==="friend"){
      run.friends=run.friends.filter(item=>item!==actor);
    }
    spawnParticles(actor.x,actor.y,actor.team==="enemy"?"#b7f28a":"#8d88ff",profile.settings.effects?12:4);
  }
}
function convertHuman(target,source){
  if(!target||target.dead)return;
  target.dead=true;run.enemies=run.enemies.filter(item=>item!==target);
  run.infested++;
  const limit=8+(profile.upgrades.zombie.horde||0)*2;
  if(run.friends.length<limit){
    run.friends.push(entity("friend","zombie",target.x,target.y,{hp:70,maxHp:70,speed:114,damage:14+profile.upgrades.zombie.damage*2,radius:13}));
  }
  addEarned(target.type==="soldier"||target.type==="police"?26:18);
  spawnParticles(target.x,target.y,"#8fdd85",profile.settings.effects?16:4);
}
function infectAttack(){
  if(!run||run.paused||run.finished||run.mode!=="zombie"||run.player.attackCd>0)return;
  run.player.attackCd=.48;
  const target=nearest(run.enemies,run.player.x,run.player.y,88);
  if(target){
    target.hp-=run.player.damage;
    target.flash=.12;
    if(target.hp<=0){
      if(target.type==="civilian"||target.type==="police")convertHuman(target,run.player);
      else{target.dead=true;run.enemies=run.enemies.filter(item=>item!==target);run.kills++;addEarned(target.type==="tank"||target.type==="heli"?35:18);}
    }
    return;
  }
  if(run.order==="smash"||run.friends.some(f=>f.order==="smash")){
    const prop=nearest(run.props,run.player.x,run.player.y,100,p=>!p.dead);
    if(prop){prop.hp-=run.player.damage*.75;if(prop.hp<=0)destroyProp(prop);}
  }
}
function shootAttack(){
  if(!run||run.paused||run.finished||run.mode!=="human"||run.player.attackCd>0)return;
  run.player.attackCd=Math.max(.12,.52-profile.upgrades.human.fire*.055);
  let target=null;
  if(pointerAim){
    target=nearest(run.enemies,pointerAim.x,pointerAim.y,110,item=>true);
    if(target&&Math.hypot(target.x-pointerAim.x,target.y-pointerAim.y)>110)target=null;
  }
  if(!target)target=nearest(run.enemies,run.player.x,run.player.y,590);
  if(target){
    const damage=run.player.damage;
    fireBullet(run.player,target,damage,560,"friendly");
    run.player.angle=Math.atan2(target.y-run.player.y,target.x-run.player.x);
  }else if(pointerAim){
    const t={x:pointerAim.x,y:pointerAim.y};
    fireBullet(run.player,t,run.player.damage,560,"friendly");
  }
}
function specialAttack(){
  if(!run||run.paused||run.finished||run.player.specialCd>0)return;
  run.player.specialCd=15;
  const radius=run.mode==="zombie"?190:170;
  if(run.mode==="zombie"){
    const victims=run.enemies.filter(e=>!e.dead&&Math.hypot(e.x-run.player.x,e.y-run.player.y)<radius);
    victims.forEach(target=>{
      target.hp-=run.player.damage*1.1;
      if(target.hp<=0){if(target.type==="civilian"||target.type==="police")convertHuman(target,run.player);else damageActor(target,9999);}
    });
    spawnParticles(run.player.x,run.player.y,"#8ae38e",profile.settings.effects?30:8);
  }else{
    run.enemies.forEach(target=>{if(!target.dead&&Math.hypot(target.x-run.player.x,target.y-run.player.y)<radius)damageActor(target,run.player.damage*2.1);});
    spawnParticles(run.player.x,run.player.y,"#8c9fff",profile.settings.effects?28:6);
  }
  showStageMessage(run.mode==="zombie"?"INFECTION PULSE":"FRAG GRENADE",750);
}
function spawnParticles(x,y,color,count){
  if(!run)return;
  for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*150;run.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.42,max:.8,color,r:2+Math.random()*4});}
}
function destroyProp(prop){
  if(prop.dead)return;prop.dead=true;run.propCount++;addEarned(5);
  spawnParticles(prop.x,prop.y,"#d7bb83",profile.settings.effects?15:4);
}
function addEarned(amount){
  run.earned+=amount;updateWallet();
}
function updateAI(dt){
  const player=run.player;
  run.friends.forEach(friend=>{
    if(friend.dead)return;
    friend.attackCd=Math.max(0,friend.attackCd-dt);
    const target=nearestTargetForFriend(friend);
    if(friend.type==="zombie"){
      if(friend.order==="smash"){
        const prop=nearest(run.props,friend.x,friend.y,430,p=>!p.dead);
        if(prop){
          const d=Math.hypot(prop.x-friend.x,prop.y-friend.y);
          if(d>friend.radius+prop.radius+4){moveActor(friend,(prop.x-friend.x)/d,(prop.y-friend.y)/d,dt);}
          else if(friend.attackCd<=0){friend.attackCd=.65;prop.hp-=friend.damage;if(prop.hp<=0)destroyProp(prop);}
        }else{
          const d=Math.hypot(player.x-friend.x,player.y-friend.y);
          if(d>65)moveActor(friend,(player.x-friend.x)/d,(player.y-friend.y)/d,dt);
        }
      }else if(friend.order==="attack"&&target){
        const d=Math.hypot(target.x-friend.x,target.y-friend.y);
        if(d>friend.radius+target.radius+7)moveActor(friend,(target.x-friend.x)/d,(target.y-friend.y)/d,dt);
        else if(friend.attackCd<=0){friend.attackCd=.72;target.hp-=friend.damage;if(target.hp<=0){if(target.type==="civilian"||target.type==="police")convertHuman(target,friend);else damageActor(target,9999);}}
      }else{
        const d=Math.hypot(player.x-friend.x,player.y-friend.y),slot=(friend.id%5);
        if(d>70+slot*10)moveActor(friend,(player.x-friend.x)/d,(player.y-friend.y)/d,dt);
        else if(target&&Math.hypot(target.x-friend.x,target.y-friend.y)<58&&friend.attackCd<=0){friend.attackCd=.8;target.hp-=friend.damage;if(target.hp<=0)convertHuman(target,friend);}
      }
    }else{
      const d=Math.hypot(player.x-friend.x,player.y-friend.y);
      if(d>85)moveActor(friend,(player.x-friend.x)/d,(player.y-friend.y)/d,dt);
      if(target&&Math.hypot(target.x-friend.x,target.y-friend.y)<390&&friend.attackCd<=0){
        friend.attackCd=.8;fireBullet(friend,target,12+profile.upgrades.human.damage*3,470,"friendly");
      }
    }
  });

  run.enemies.forEach(enemy=>{
    if(enemy.dead)return;
    enemy.attackCd=Math.max(0,enemy.attackCd-dt);
    enemy.shotCd=Math.max(0,enemy.shotCd-dt);
    if(run.mode==="zombie"){
      const threat=chooseThreat(enemy.x,enemy.y,"zombie");
      const dx=threat.x-enemy.x,dy=threat.y-enemy.y,d=Math.hypot(dx,dy)||1;
      if(enemy.type==="civilian"){
        if(d<310)moveActor(enemy,-dx/d,-dy/d,dt);
        else{enemy.wander+=dt*.5;moveActor(enemy,Math.cos(enemy.wander)*.3,Math.sin(enemy.wander)*.3,dt);}
        if(d<enemy.radius+threat.radius+12&&enemy.attackCd<=0){enemy.attackCd=1.2;damageActor(threat,enemy.damage);}
      }else if(enemy.type==="tank"||enemy.type==="heli"||enemy.type==="soldier"||enemy.type==="police"){
        const preferred=enemy.type==="tank"?390:enemy.type==="heli"?350:enemy.fireRange*.72;
        if(d>preferred+35)moveActor(enemy,dx/d,dy/d,dt);
        else if(d<preferred-90&&enemy.type!=="tank")moveActor(enemy,-dx/d,-dy/d,dt);
        if(d<enemy.fireRange&&enemy.shotCd<=0){
          enemy.shotCd=enemy.type==="tank"?2.6:enemy.type==="heli"?1.55:enemy.type==="soldier"?1.0:1.25;
          fireBullet(enemy,threat,enemy.damage,enemy.type==="tank"?290:enemy.type==="heli"?340:390,"enemy");
        }
        if(d<enemy.radius+threat.radius+10&&enemy.attackCd<=0){enemy.attackCd=1.1;damageActor(threat,enemy.damage);}
      }
    }else{
      const threat=chooseThreat(enemy.x,enemy.y,"human"),dx=threat.x-enemy.x,dy=threat.y-enemy.y,d=Math.hypot(dx,dy)||1;
      const range=enemy.radius+threat.radius+5;
      if(d>range)moveActor(enemy,dx/d,dy/d,dt);
      if(d<=range+5&&enemy.attackCd<=0){
        enemy.attackCd=enemy.type==="boss"?.75:enemy.type==="runner"?.55:1.05;
        damageActor(threat,enemy.damage);
      }
    }
  });
}
function updateBullets(dt){
  for(let i=run.bullets.length-1;i>=0;i--){
    const b=run.bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    let hit=null;
    if(b.team==="friendly"){
      hit=nearest(run.enemies,b.x,b.y,17);
      if(hit)damageActor(hit,b.damage);
    }else{
      const candidates=[run.player,...run.friends];
      hit=nearest(candidates,b.x,b.y,19,item=>!item.dead);
      if(hit)damageActor(hit,b.damage);
    }
    if(hit||b.life<=0||b.x<0||b.y<0||b.x>run.worldW||b.y>run.worldH)run.bullets.splice(i,1);
  }
  run.enemies=run.enemies.filter(e=>!e.dead);
  run.friends=run.friends.filter(e=>!e.dead);
}
function updatePlayer(dt){
  const p=run.player;p.attackCd=Math.max(0,p.attackCd-dt);p.specialCd=Math.max(0,p.specialCd-dt);
  let dx=(keys.has("d")||keys.has("arrowright")?1:0)-(keys.has("a")||keys.has("arrowleft")?1:0)+joystick.x;
  let dy=(keys.has("s")||keys.has("arrowdown")?1:0)-(keys.has("w")||keys.has("arrowup")?1:0)+joystick.y;
  const len=Math.hypot(dx,dy);
  if(len>1){dx/=len;dy/=len;}
  if(len>.08)moveActor(p,dx,dy,dt);
  if(run.mode==="zombie"&&(keys.has("e")||keys.has(" "))&&p.attackCd<=0)infectAttack();
  if(run.mode==="human"&&keys.has(" ")&&p.attackCd<=0)shootAttack();
}
function updateWave(dt){
  const next=Math.floor(run.elapsed/28)+1;
  if(next>run.wave){
    run.wave=next;showStageMessage("WAVE "+run.wave+" — "+(run.mode==="zombie"?"MILITARY RESPONSE ESCALATING":"THE HORDE IS EVOLVING"),1700);
    if(run.mode==="human"&&run.wave%5===0)spawnBossOnce();
    if(run.mode==="zombie"&&run.wave>=6&&run.wave%3===0)spawnEnemy();
  }
  run.nextSpawn-=dt;
  if(run.nextSpawn<=0){
    const count=Math.min(1+Math.floor(run.wave/3),4);
    for(let i=0;i<count;i++)spawnEnemy();
    run.nextSpawn=Math.max(1.2,4.6-run.wave*.18);
  }
}
function spawnBossOnce(){
  if(run.spawnedBossWave===run.wave)return;
  run.spawnedBossWave=run.wave;
  const p=spawnAtEdge();
  run.enemies.push(entity("enemy","boss",p.x,p.y,{hp:700+run.wave*40,maxHp:700+run.wave*40,speed:54,damage:34+run.wave*2,radius:34}));
}
function update(dt){
  run.elapsed+=dt;
  updatePlayer(dt);
  updateAI(dt);
  updateBullets(dt);
  updateWave(dt);
  run.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;});
  run.particles=run.particles.filter(p=>p.life>0);
  if(run.elapsed>0&&Math.floor(run.elapsed/30)>Math.floor((run.elapsed-dt)/30))addEarned(10);
  if(run.player.hp<=0||run.player.dead)finishRun(false);
}
function resizeCanvas(){
  const canvas=$("zvhCanvas");if(!canvas)return;
  const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const ratio=Math.min(window.devicePixelRatio||1,2);
  const width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  if(run)drawGame();
}
function drawProp(ctx,p){
  ctx.save();ctx.translate(p.x,p.y);
  const dim=p.radius;
  if(p.type==="car"||p.type==="truck"||p.type==="forklift"){
    ctx.fillStyle=p.type==="truck"?"#77899a":"#687783";ctx.fillRect(-dim,-dim*.55,dim*2,dim*1.1);
    ctx.fillStyle="#1b2733";ctx.fillRect(-dim*.55,-dim*.42,dim*1.1,dim*.84);
    ctx.fillStyle="#c0c9d1";ctx.fillRect(-dim*.7,-dim*.64,dim*.3,dim*.13);
  }else if(p.type==="barrier"||p.type==="crate"||p.type==="pallet"||p.type==="barrel"){
    ctx.fillStyle=p.type==="barrel"?"#9b713d":"#8a7656";ctx.fillRect(-dim*.7,-dim*.65,dim*1.4,dim*1.3);
    ctx.strokeStyle="rgba(20,25,30,.45)";ctx.lineWidth=2;ctx.strokeRect(-dim*.7,-dim*.65,dim*1.4,dim*1.3);
  }else{
    ctx.fillStyle="#7b8068";ctx.beginPath();ctx.arc(0,0,dim*.68,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#2e3e39";ctx.fillRect(-2,-dim,4,dim*2);
  }
  if(p.hp<p.maxHp){
    ctx.fillStyle="#111827";ctx.fillRect(-dim,-dim-8,dim*2,3);
    ctx.fillStyle="#dfb36f";ctx.fillRect(-dim,-dim-8,dim*2*(p.hp/p.maxHp),3);
  }
  ctx.restore();
}
function drawActor(ctx,e,isPlayer){
  ctx.save();ctx.translate(e.x,e.y);
  if(e.type==="tank"){
    ctx.rotate(e.angle||0);ctx.fillStyle="#56674b";ctx.fillRect(-29,-22,58,44);ctx.fillStyle="#27372b";ctx.fillRect(-20,-14,40,28);ctx.fillStyle="#9baf77";ctx.fillRect(0,-5,40,10);
  }else if(e.type==="heli"){
    ctx.fillStyle="#657a70";ctx.beginPath();ctx.ellipse(0,0,28,16,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#d4dce0";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-36,-21);ctx.lineTo(36,-21);ctx.moveTo(0,-21);ctx.lineTo(0,21);ctx.stroke();
  }else{
    const human=e.type==="civilian"||e.type==="police"||e.type==="soldier"||e.type==="ally"||e.team==="player"&&run.mode==="human";
    let color=human?"#4b93c1":"#7fae67";
    if(e.type==="police")color="#4e78ce";if(e.type==="soldier"||e.type==="ally")color="#81916b";
    if(e.type==="runner")color="#86ad66";if(e.type==="brute")color="#697e54";if(e.type==="armored")color="#69717a";if(e.type==="boss")color="#9a6a87";
    if(run.mode==="human"&&profile.upgrades.human.skin>0&&(e.team==="player"||e.type==="ally"))color=["#4b93c1","#9173c9","#c18e56","#4f9b91"][profile.upgrades.human.skin%4];
    ctx.fillStyle="rgba(4,9,15,.32)";ctx.beginPath();ctx.ellipse(0,10,e.radius*1.25,e.radius*.62,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,e.radius,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=human?"#c4a58d":"#b8e69b";ctx.beginPath();ctx.arc(0,-e.radius*.25,e.radius*.42,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#18222c";ctx.beginPath();ctx.arc(-e.radius*.18,-e.radius*.28,2.1,0,Math.PI*2);ctx.arc(e.radius*.18,-e.radius*.28,2.1,0,Math.PI*2);ctx.fill();
    if(isPlayer){ctx.strokeStyle="#e3d8ff";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.radius+6,0,Math.PI*2);ctx.stroke();}
    if(e.team==="friend"||e.team==="player"){ctx.fillStyle="#b4ef93";ctx.fillRect(-6,e.radius+6,12,3);}
  }
  if(e.team!=="player"&&e.type!=="civilian"&&e.hp<e.maxHp){
    ctx.fillStyle="#141a22";ctx.fillRect(-e.radius,-e.radius-9,e.radius*2,4);
    ctx.fillStyle=e.team==="friend"?"#89d68c":"#e48e78";ctx.fillRect(-e.radius,-e.radius-9,e.radius*2*Math.max(0,e.hp/e.maxHp),4);
  }
  ctx.restore();
}
function drawGame(){
  const canvas=$("zvhCanvas");if(!canvas||!run)return;
  const ctx=canvas.getContext("2d");if(!ctx)return;
  const dpr=Math.min(window.devicePixelRatio||1,2),w=canvas.width/dpr,h=canvas.height/dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const map=mapConfig(),palette=map.palette;
  ctx.fillStyle=palette[0];ctx.fillRect(0,0,w,h);
  const cameraX=run.player.x, cameraY=run.player.y;
  ctx.save();const shakeX=run.shake?(Math.random()-.5)*run.shake:0,shakeY=run.shake?(Math.random()-.5)*run.shake:0;ctx.translate(w/2-cameraX+shakeX,h/2-cameraY+shakeY);
  const left=cameraX-w/2-70,top=cameraY-h/2-70;
  ctx.fillStyle=palette[1];
  for(let x=Math.floor(left/220)*220;x<left+w+260;x+=220)for(let y=Math.floor(top/220)*220;y<top+h+260;y+=220){
    ctx.fillStyle=((Math.floor(x/220)+Math.floor(y/220))%2===0)?"rgba(16,26,28,.16)":"rgba(220,220,210,.025)";
    ctx.fillRect(x+8,y+8,204,204);
  }
  ctx.strokeStyle="rgba(235,238,228,.08)";ctx.lineWidth=2;ctx.setLineDash([18,18]);
  for(let x=0;x<run.worldW;x+=440){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,run.worldH);ctx.stroke();}
  for(let y=0;y<run.worldH;y+=440){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(run.worldW,y);ctx.stroke();}
  ctx.setLineDash([]);
  ctx.strokeStyle="rgba(225,229,212,.13)";ctx.lineWidth=7;ctx.strokeRect(0,0,run.worldW,run.worldH);
  run.props.forEach(p=>{if(!p.dead)drawProp(ctx,p);});
  run.bullets.forEach(b=>{ctx.fillStyle=b.team==="friendly"?"#a6d7ff":"#ffcb7d";ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.fill();});
  run.enemies.forEach(e=>{if(!e.dead)drawActor(ctx,e,false);});
  run.friends.forEach(e=>{if(!e.dead)drawActor(ctx,e,false);});
  drawActor(ctx,run.player,true);
  run.particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/.8);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});
  ctx.restore();
  if(run.shake&&run.shake>0){run.shake=Math.max(0,run.shake-.6);}
}
function updateHud(){
  if(!run)return;
  const p=run.player;
  $("zvhHudWave").textContent=String(run.wave);
  $("zvhHudTime").textContent=formatTime(run.elapsed);
  $("zvhHudHealth").textContent=String(Math.max(0,Math.ceil(p.hp)));
  $("zvhHealthFill").style.width=Math.max(0,Math.min(100,p.hp/p.maxHp*100))+"%";
  $("zvhHudCoins").textContent=String(profile.coins+run.earned);
  $("zvhSquadCount").textContent=run.friends.length+" / "+(4+profile.upgrades.human.squad);
  $("zvhHireAlly").disabled=run.friends.length>=4+profile.upgrades.human.squad||profile.coins<90;
}
function formatTime(seconds){
  const total=Math.floor(seconds);return String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");
}
function showStageMessage(text,duration){
  const node=$("zvhStageMessage");if(!node)return;
  node.textContent=text;node.hidden=false;
  window.clearTimeout(node._hideTimer);node._hideTimer=window.setTimeout(()=>{node.hidden=true;},duration||900);
}
function gameFrame(now){
  if(!run||run.finished){animationFrame=0;return;}
  const dt=Math.min(.04,Math.max(0,(now-lastFrame)/1000||0));lastFrame=now;
  if(!run.paused)update(dt);
  drawGame();updateHud();
  if(run&&!run.finished)animationFrame=requestAnimationFrame(gameFrame);
}
function stopLoop(){
  if(animationFrame)cancelAnimationFrame(animationFrame);
  animationFrame=0;
  if(run)run.paused=true;
}
function finishRun(victory){
  if(!run||run.finished)return;
  run.finished=true;run.paused=true;
  const payout=run.earned+Math.floor(run.elapsed/15);
  profile.coins+=payout;
  profile.bestWave[run.mode]=Math.max(profile.bestWave[run.mode],run.wave);
  if(run.mode==="zombie")profile.totalInfested+=run.infested;
  else profile.totalKills+=run.kills;
  persist();renderLobby();
  $("zvhResultTitle").textContent=victory?"Run complete":"You were overrun";
  $("zvhResultSummary").textContent="Survived "+formatTime(run.elapsed)+" · Wave "+run.wave+" · "+run.infested+" infected · "+run.kills+" eliminated · "+payout+" coins earned.";
  $("zvhRunResult").hidden=false;
  showStageMessage(victory?"RUN COMPLETE":"YOU WERE OVERWHELMED",1200);
  cancelAnimationFrame(animationFrame);animationFrame=0;
}
function hireAlly(){
  if(!run||run.mode!=="human"||run.finished)return;
  const limit=4+profile.upgrades.human.squad;
  if(run.friends.length>=limit||profile.coins<90){toast(run.friends.length>=limit?"Your squad is full.":"You need 90 game coins to hire a survivor.");return;}
  profile.coins-=90;
  run.friends.push(entity("friend","ally",run.player.x-25,run.player.y+25,{hp:92,maxHp:92,speed:126,damage:14+profile.upgrades.human.damage*3,radius:14,fireRange:390}));
  persist();updateHud();toast("Survivor hired. They will follow and cover you until this run ends.");
}
function setOrder(order){
  if(!run||run.mode!=="zombie")return;
  run.friends.forEach(friend=>{if(friend.type==="zombie")friend.order=order;});
  document.querySelectorAll("[data-zvh-order]").forEach(button=>button.classList.toggle("is-active",button.dataset.zvhOrder===order));
  showStageMessage(order==="follow"?"HORDE: FOLLOW":"HORDE: "+order.toUpperCase(),650);
}
function togglePause(){
  if(!run||run.finished)return;
  run.paused=!run.paused;
  $("zvhPauseButton").textContent=run.paused?"▶ Resume":"Ⅱ Pause";
  showStageMessage(run.paused?"PAUSED":"",run.paused?999999:350);
  if(!run.paused&&animationFrame===0){lastFrame=performance.now();animationFrame=requestAnimationFrame(gameFrame);}
}
function endRun(){
  if(!run||run.finished)return;
  finishRun(true);
  $("zvhRunResult").hidden=true;
  $("zvhGameView").hidden=true;$("zvhLobby").hidden=false;renderLobby();
}
function backToLobby(){
  if(run&&!run.finished)finishRun(true);
  $("zvhRunResult").hidden=true;$("zvhGameView").hidden=true;$("zvhLobby").hidden=false;renderLobby();
}
function openSettings(){
  syncSettingsForm();$("zvhSettingsOverlay").hidden=false;
}
function closeSettings(){$("zvhSettingsOverlay").hidden=true;}
function bindSettings(){
  $("zvhGoreToggle")?.addEventListener("change",event=>{profile.settings.effects=Boolean(event.target.checked);persist();});
  $("zvhShakeToggle")?.addEventListener("change",event=>{profile.settings.shake=Boolean(event.target.checked);persist();});
  $("zvhMobileToggle")?.addEventListener("change",event=>{profile.settings.mobile=Boolean(event.target.checked);persist();applyMobileControlVisibility();});
  $("zvhSettingsOpen")?.addEventListener("click",openSettings);
  $("zvhSettingsClose")?.addEventListener("click",closeSettings);
  $("zvhSettingsOverlay")?.addEventListener("click",event=>{if(event.target===$("zvhSettingsOverlay"))closeSettings();});
}
function bindJoystick(){
  const pad=$("zvhJoystick"),knob=$("zvhJoystickKnob");
  if(!pad||!knob)return;
  const move=event=>{
    if(!joystick.active||event.pointerId!==joystick.pointerId)return;
    const rect=pad.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    const max=rect.width*.34,dx=event.clientX-cx,dy=event.clientY-cy,len=Math.hypot(dx,dy),scale=len>max?max/len:1;
    const x=dx*scale,y=dy*scale;
    joystick.x=x/max;joystick.y=y/max;
    knob.style.transform="translate("+x+"px,"+y+"px)";
  };
  pad.addEventListener("pointerdown",event=>{
    joystick.active=true;joystick.pointerId=event.pointerId;
    pad.setPointerCapture?.(event.pointerId);move(event);event.preventDefault();
  });
  pad.addEventListener("pointermove",move);
  const release=event=>{
    if(!joystick.active||event.pointerId!==joystick.pointerId)return;
    joystick.active=false;joystick.x=0;joystick.y=0;joystick.pointerId=null;knob.style.transform="translate(0,0)";
  };
  pad.addEventListener("pointerup",release);pad.addEventListener("pointercancel",release);pad.addEventListener("lostpointercapture",release);
}
function bindInput(){
  document.addEventListener("keydown",event=>{
    const key=String(event.key||"").toLowerCase();
    if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," ","e"].includes(key)&&$("zvhGameView")&&!$("zvhGameView").hidden){
      keys.add(key);if(key.startsWith("arrow")||key===" ")event.preventDefault();
      if(key===" "&&run?.mode==="human")shootAttack();
      if(key==="e"&&run?.mode==="zombie")infectAttack();
    }
    if(key==="escape"&&run&&!run.finished)togglePause();
  });
  document.addEventListener("keyup",event=>keys.delete(String(event.key||"").toLowerCase()));
  window.addEventListener("blur",()=>{keys.clear();joystick.active=false;joystick.x=0;joystick.y=0;});
  $("zvhCanvas")?.addEventListener("pointermove",event=>{
    if(!run)return;const rect=$("zvhCanvas").getBoundingClientRect();
    pointerAim={x:run.player.x+(event.clientX-rect.left-rect.width/2),y:run.player.y+(event.clientY-rect.top-rect.height/2)};
  });
  $("zvhCanvas")?.addEventListener("pointerdown",event=>{
    if(!run||event.pointerType==="touch")return;
    if(run.mode==="human")shootAttack();else infectAttack();
  });
  $("zvhTouchAttack")?.addEventListener("pointerdown",event=>{event.preventDefault();if(run?.mode==="human")shootAttack();else infectAttack();});
  $("zvhTouchSpecial")?.addEventListener("pointerdown",event=>{event.preventDefault();specialAttack();});
  $("zvhCanvas")?.addEventListener("contextmenu",event=>event.preventDefault());
  bindJoystick();
}
function bindUI(){
  document.querySelectorAll("[data-zvh-mode]").forEach(button=>button.addEventListener("click",()=>{
    selectedMode=validMode(button.dataset.zvhMode);
    renderLobby();
  }));
  document.querySelectorAll("[data-zvh-order]").forEach(button=>button.addEventListener("click",()=>setOrder(button.dataset.zvhOrder)));
  $("zvhStartRun")?.addEventListener("click",startRun);
  $("zvhBackButton")?.addEventListener("click",goHome);
  $("zvhPauseButton")?.addEventListener("click",togglePause);
  $("zvhEndRun")?.addEventListener("click",endRun);
  $("zvhHireAlly")?.addEventListener("click",hireAlly);
  $("zvhRetryRun")?.addEventListener("click",startRun);
  $("zvhReturnLobby")?.addEventListener("click",backToLobby);
  bindSettings();bindInput();
  window.addEventListener("resize",()=>{applyMobileControlVisibility();resizeCanvas();});
}
function init(){
  bindUI();
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&!profile.unlocked&&!activeEgg&&!eggTimer){
      scheduleEgg(nextEggDelay(false));
    }
  });
  if(IS_PAGES_PREVIEW&&!readLocal("guest").unlocked)scheduleEgg(nextEggDelay(true));
  void currentClientSession().then(session=>loadProfileForSession(session));
  if(window.supabaseClient?.auth?.onAuthStateChange){
    window.supabaseClient.auth.onAuthStateChange((_event,session)=>{
      window.setTimeout(()=>{void loadProfileForSession(session);},0);
    });
  }

}
window.initZvhCanvas=resizeCanvas;
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();