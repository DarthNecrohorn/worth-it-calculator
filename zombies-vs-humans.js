(() => {
"use strict";

const $ = id => document.getElementById(id);
const TABLE = "worth_it_zvh_game_saves";
const STORAGE_PREFIX = "worthItZvhSave:v1:";
const ROUTE = "/zombiesvshumans";
const EGG_ID = "zvhDiscoveryEgg";
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
    {id:"skin",name:"Survivor uniforms",desc:"Unlock a new visual survivor outfit",icon:"🎖️",base:115},
    {id:"ammo",name:"Starting ammunition",desc:"+12 ammo at the start of every Human run",icon:"📦",base:105}
  ]
};
const defaults = {
  unlocked:false,coins:100,
  maps:{zombie:["city"],human:["safehouse"]},
  selected:{zombie:"city",human:"safehouse"},
  upgrades:{zombie:{health:0,damage:0,horde:0,speed:0,elite:0,mutation:0},human:{health:0,damage:0,fire:0,squad:0,skin:0,ammo:0}},
  bestWave:{zombie:0,human:0},totalInfested:0,totalKills:0,
  settings:{effects:true,shake:false,mobile:true,keys:{follow:"q",attack:"e",smash:"r",special:"2"}}
};
let profile = clone(defaults);
let userId = "";
let dataApiAvailable = null;
let profileReady = false;
let selectedMode = "zombie";
let run = null;
let animationFrame = 0;
let lastFrame = 0;
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
    mobile:value.settings?.mobile!==false,
    keys:{follow:String(value.settings?.keys?.follow||"q").toLowerCase(),attack:String(value.settings?.keys?.attack||"e").toLowerCase(),smash:String(value.settings?.keys?.smash||"r").toLowerCase(),special:String(value.settings?.keys?.special||"2").toLowerCase()}
  };
  const validKeys=["q","e","r","t","f","g","z","x","c","v","1","2","3","4","5"],names=["follow","attack","smash","special"],used=new Set();
  names.forEach((name,index)=>{let key=result.settings.keys[name];if(!validKeys.includes(key)||used.has(key))key=["q","e","r","2"][index];while(used.has(key))key=validKeys.find(item=>!used.has(item))||"2";result.settings.keys[name]=key;used.add(key);});
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
  const discovery=$(EGG_ID);
  if(discovery)discovery.hidden=visible;
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
  // The discovery button is anchored in the hero badge and shown until unlocked.
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
function unlockGame(){
  if(profile.unlocked)return;
  profile.unlocked=true;
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
  const options=["q","e","r","t","f","g","z","x","c","v","1","2","3","4","5"];
  [["follow","zvhKeyFollow"],["attack","zvhKeyAttack"],["smash","zvhKeySmash"],["special","zvhKeySpecial"]].forEach(([name,id])=>{const select=$(id);if(!select)return;select.innerHTML="";options.forEach(key=>{const option=document.createElement("option");option.value=key;option.textContent=key.toUpperCase();select.appendChild(option);});select.value=settings.keys?.[name]||({follow:"q",attack:"e",smash:"r",special:"2"}[name]);});
  applyMobileControlVisibility();
}
function applyMobileControlVisibility(){
  const show=profile.settings.mobile!==false&&window.matchMedia("(max-width: 600px)").matches;
  const joystickNode=$("zvhJoystick"),actions=$("zvhMobileActions");
  if(joystickNode)joystickNode.style.display=show?"grid":"none";
  if(actions)actions.style.display=show?"grid":"none";
  const follow=$("zvhTouchFollow"),smash=$("zvhTouchSmash"),attack=$("zvhTouchAttack");
  const zombie=run?.mode==="zombie";
  if(follow)follow.hidden=!zombie;if(smash)smash.hidden=!zombie;
  if(attack)attack.textContent=zombie?"ATTACK":"SHOOT";
}

function updatePcKeyGuide(){
  const node=$("zvhPcKeyGuide");if(!node)return;
  const keys=profile.settings.keys||{follow:"q",attack:"e",smash:"r",special:"2"};
  const key=value=>String(value||"").toUpperCase();
  const item=(label,value)=>'<span><b>'+label+'</b><kbd>'+key(value)+'</kbd></span>';
  if(run?.mode==="human"){
    node.innerHTML='<span><b>MOVE</b><kbd>W A S D</kbd><small>or arrow keys</small></span><span><b>SHOOT</b><kbd>CLICK / SPACE / '+key(keys.attack)+'</kbd></span>'+item("SPECIAL · GRENADE",keys.special);
  }else{
    node.innerHTML='<span><b>MOVE</b><kbd>W A S D</kbd><small>or arrow keys</small></span>'+item("HORDE · FOLLOW",keys.follow)+item("HORDE · ATTACK",keys.attack)+item("HORDE · GUARD",keys.smash)+item("SPECIAL",keys.special)+'<span><b>INFECT</b><kbd>MOUSE CLICK</kbd></span>';
  }
}

function entity(team,type,x,y,extra){
  const e={id:nextEntityId++,team,type,x,y,hp:50,maxHp:50,speed:55,radius:13,damage:8,attackCd:0,shotCd:0,abilityCd:0,fireRange:230,wander:Math.random()*Math.PI*2,order:"follow",angle:0,dead:false};
  return Object.assign(e,extra||{});
}
function mapConfig(){
  return maps[run.mode].find(item=>item.id===run.mapId)||maps[run.mode][0];
}
function initHouses(){
  const points=[
    {x:860,y:500,open:true,ammo:true,roof:"#59645f"},
    {x:345,y:190,open:false,ammo:true,roof:"#66564d"},
    {x:1420,y:185,open:false,ammo:false,roof:"#78816d"},
    {x:330,y:930,open:true,ammo:false,roof:"#8b755f"},
    {x:1390,y:930,open:false,ammo:true,roof:"#6d7778"},
    {x:1480,y:575,open:false,ammo:false,roof:"#8c6f5d"},
    {x:570,y:620,open:true,ammo:false,roof:"#787d69"}
  ];
  return points.map((p,index)=>({id:index+1,x:p.x,y:p.y,w:150,h:118,doorOpen:Boolean(p.open),doorHp:0,doorMaxHp:84,roofTone:p.roof,ammo:p.ammo?{x:p.x+104,y:p.y+72,amount:18,collected:false}:null}));
}
function pointInsideHouse(house,x,y,padding){
  const inset=padding||10;
  return x>house.x+inset&&x<house.x+house.w-inset&&y>house.y+inset&&y<house.y+house.h-inset;
}
function houseMovementAllowed(actor,nx,ny){
  if(!run?.houses?.length)return true;
  for(const house of run.houses){
    const wasInside=pointInsideHouse(house,actor.x,actor.y,8),willBeInside=pointInsideHouse(house,nx,ny,8),doorX=house.x+house.w/2;
    if(!wasInside&&willBeInside){
      if(!(house.doorOpen&&Math.abs(nx-doorX)<25&&actor.y>=house.y+house.h-13&&ny<house.y+house.h-5))return false;
    }else if(wasInside&&!willBeInside){
      if(!(house.doorOpen&&Math.abs(actor.x-doorX)<27&&ny>=house.y+house.h-9))return false;
    }
  }
  return true;
}
function attackNearbyObject(damage){
  const p=run.player;
  const door=(run.houses||[]).filter(h=>!h.doorOpen).sort((a,b)=>Math.hypot(p.x-a.x-a.w/2,p.y-a.y-a.h-5)-Math.hypot(p.x-b.x-b.w/2,p.y-b.y-b.h-5))[0];
  if(door){
    const x=door.x+door.w/2,y=door.y+door.h+5;
    if(Math.hypot(p.x-x,p.y-y)<72){
      door.doorHp=Math.max(0,(door.doorHp||door.doorMaxHp)-damage*.82);
      if(door.doorHp<=0){door.doorOpen=true;spawnParticles(x,y,"#d9b27c",profile.settings.effects?18:5);showStageMessage("DOOR BROKEN · HOUSE OPEN",950);}
      else showStageMessage("LOCKED DOOR · "+Math.ceil(door.doorHp)+" HP",500);
      return true;
    }
  }
  const prop=nearest(run.props,p.x,p.y,76,item=>!item.dead);
  if(prop){prop.hp-=damage;if(prop.hp<=0)destroyProp(prop);else showStageMessage("OBJECT DAMAGED",350);return true;}
  return false;
}
function collectHouseAmmo(){
  if(!run||run.mode!=="human")return;
  run.houses.forEach(h=>{
    const stash=h.ammo;if(!stash||stash.collected)return;
    if(pointInsideHouse(h,run.player.x,run.player.y,8)&&Math.hypot(run.player.x-stash.x,run.player.y-stash.y)<38){
      stash.collected=true;const old=run.ammo;run.ammo=Math.min(run.maxAmmo,run.ammo+stash.amount);
      showStageMessage(run.ammo>old?"AMMO FOUND · +"+(run.ammo-old):"AMMO FOUND · POCKETS FULL",950);
    }
  });
}

function initProps(){
  const list=[],map=run.mapId;
  for(let i=0;i<54;i++){
    let x=100+Math.random()*(run.worldW-200),y=100+Math.random()*(run.worldH-200),attempts=0;
    while(run.houses?.some(h=>x>h.x-18&&x<h.x+h.w+18&&y>h.y-18&&y<h.y+h.h+18)&&attempts++<20){x=100+Math.random()*(run.worldW-200);y=100+Math.random()*(run.worldH-200);}
    let type=["car","bench","bin","crate","lamp"][i%5];
    if(map==="mall")type=["stall","bench","bin","crate","shop"][i%5];
    if(map==="industrial")type=["crate","barrel","forklift","lamp","pallet"][i%5];
    if(map==="military")type=["barrier","crate","truck","lamp","barrel"][i%5];
    if(map==="metro")type=["bench","ticket","bin","crate","pillar"][i%5];
    const vehicle=type==="car"||type==="truck"||type==="forklift";
    list.push({id:nextEntityId++,x,y,type,hp:vehicle?90:45,maxHp:vehicle?90:45,radius:vehicle?28:19,dead:false,burning:vehicle&&Math.random()<.22,scorch:vehicle&&Math.random()<.34,heading:Math.random()*Math.PI*2});
  }
  return list;
}
function startRun(){
  stopLoop();
  const mode=selectedMode,mapId=profile.selected[mode];
  const up=profile.upgrades[mode];
  run={
    mode,mapId,worldW:1900,worldH:1320,elapsed:0,wave:1,nextSpawn:mode==="zombie"?5.8:2.5,
    player:entity("player",mode,950,660,{hp:mode==="zombie"?240+up.health*28+up.mutation*35:125+up.health*25,maxHp:mode==="zombie"?240+up.health*28+up.mutation*35:125+up.health*25,speed:mode==="zombie"?176+up.speed*12:195,damage:mode==="zombie"?36+up.damage*16+up.mutation*4:24+up.damage*12,radius:17,attackCd:0,specialCd:0}),
    friends:[],enemies:[],bullets:[],particles:[],props:[],houses:[],earned:0,infested:0,kills:0,propCount:0,ammo:mode==="human"?30+up.ammo*12:0,maxAmmo:mode==="human"?30+up.ammo*12:0,paused:false,finished:false,enemyCounter:0,spawnedBossWave:0
  };
  run.houses=initHouses();
  run.props=initProps();
  if(mode==="zombie"){
    const count=Math.min(3+up.horde,9+up.horde*2);
    for(let i=0;i<count;i++)run.friends.push(entity("friend","zombie",930-i*25,680+(i%2)*24,{hp:68+up.elite*22,maxHp:68+up.elite*22,speed:112,damage:12+up.damage*2+up.elite*3,radius:13}));
    $("zvhZombieCommands").hidden=false;$("zvhHumanCommands").hidden=true;
    $("zvhControlHint").textContent="WASD / arrows to move · E or ATTACK to infect · command your horde";
  }else{
    $("zvhZombieCommands").hidden=true;$("zvhHumanCommands").hidden=false;
    $("zvhControlHint").textContent="WASD / arrows to move · click / SPACE to shoot · recruit survivor allies";
  }
  updatePcKeyGuide();
  for(let i=0;i<6;i++)spawnEnemy();
  $("zvhLobby").hidden=true;$("zvhGameView").hidden=false;$("zvhRunResult").hidden=true;
  applyMobileControlVisibility();
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
    const abilityCd=type==="walker"?2.6:type==="runner"?3.8:type==="brute"?4.8:type==="armored"?1.4:7.5;
    run.enemies.push(entity("enemy",type,p.x,p.y,{...specs[type],abilityCd}));
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
  actor.vx=vector.x*actor.speed;actor.vy=vector.y*actor.speed;
  if(Math.hypot(vector.x,vector.y)>.08)actor.facingAngle=Math.atan2(vector.y,vector.x)+Math.PI/2;
  const nx=Math.max(30,Math.min(run.worldW-30,actor.x+vector.x*actor.speed*dt));
  const ny=Math.max(30,Math.min(run.worldH-30,actor.y+vector.y*actor.speed*dt));
  if(houseMovementAllowed(actor,nx,ny)){actor.x=nx;actor.y=ny;}else{actor.vx=0;actor.vy=0;}
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
  if(actor===run.player&&run.mode==="zombie")amount*=.42;
  if(actor.team==="enemy"&&actor.type==="armored"&&run.mode==="human"&&run.elapsed<(actor.armorUntil||0))amount*=.35;
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
  if(attackNearbyObject(run.player.damage)){run.player.attackCd=.48;return;}
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
}
function shootAttack(){
  if(!run||run.paused||run.finished||run.mode!=="human"||run.player.attackCd>0)return;
  if(attackNearbyObject(run.player.damage)){run.player.attackCd=.42;return;}
  if(run.ammo<=0){showStageMessage("OUT OF AMMO · SEARCH HOUSE INTERIORS",1100);run.player.attackCd=.3;return;}
  run.ammo=Math.max(0,run.ammo-1);
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
    run.player.facingAngle=run.player.angle+Math.PI/2;
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
    if((profile.upgrades.zombie.mutation||0)===0){
      run.friends.filter(friend=>friend.type==="zombie"&&!friend.dead).forEach(friend=>{friend.rallyUntil=run.elapsed+3.5;});
      spawnParticles(run.player.x,run.player.y,"#8ae38e",profile.settings.effects?16:5);
      showStageMessage("WEAK HOWL · HORDE RALLY",750);
      return;
    }
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
  if(prop.burning){
    const radius=prop.type==="truck"?138:108,baseDamage=prop.type==="truck"?36:27;
    [run.player,...run.friends,...run.enemies].filter(actor=>!actor.dead).forEach(actor=>{
      const distance=Math.hypot(actor.x-prop.x,actor.y-prop.y);
      if(distance<radius)damageActor(actor,Math.max(5,baseDamage*(1-distance/radius*.45)));
    });
    spawnParticles(prop.x,prop.y,"#ff8b3d",profile.settings.effects?34:8);
    spawnParticles(prop.x,prop.y,"#5c6264",profile.settings.effects?18:4);
    if(profile.settings.shake)run.shake=Math.max(run.shake||0,4);
    showStageMessage("BURNING VEHICLE · EXPLOSION",850);
  }
}
function addEarned(amount){
  run.earned+=amount;updateWallet();
}
function updateAI(dt){
  const player=run.player;
  run.friends.forEach(friend=>{
    if(friend.dead)return;
    friend.attackCd=Math.max(0,friend.attackCd-dt);
    if(friend.type==="zombie"){
      friend.baseSpeed=friend.baseSpeed||friend.speed;
      friend.baseDamage=friend.baseDamage||friend.damage;
      const rallied=(friend.rallyUntil||0)>run.elapsed;
      friend.speed=friend.baseSpeed*(rallied?1.18:1);
      friend.damage=friend.baseDamage+(rallied?2:0);
    }
    const target=nearestTargetForFriend(friend);
    if(friend.type==="zombie"){
      if(friend.order==="guard"){
        const d=Math.hypot(player.x-friend.x,player.y-friend.y);
        if(d>82)moveActor(friend,(player.x-friend.x)/d,(player.y-friend.y)/d,dt);
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
    enemy.abilityCd=Math.max(0,(enemy.abilityCd||0)-dt);
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
      enemy.lungeTime=Math.max(0,(enemy.lungeTime||0)-dt);
      const previousWindup=enemy.slamWindup||0;
      if(previousWindup>0){
        enemy.slamWindup=Math.max(0,previousWindup-dt);
        if(enemy.slamWindup===0){
          const radius=enemy.type==="boss"?148:116;
          [run.player,...run.friends].filter(actor=>!actor.dead&&Math.hypot(actor.x-enemy.x,actor.y-enemy.y)<radius)
            .forEach(actor=>damageActor(actor,enemy.damage*(enemy.type==="boss"?1.45:1.3)));
          spawnParticles(enemy.x,enemy.y,"#e58a52",profile.settings.effects?24:6);
          showStageMessage(enemy.type==="boss"?"MUTANT OVERLORD · SHOCKWAVE":"BRUTE · GROUND SLAM",800);
        }
        return;
      }
      if(enemy.type==="brute"&&d<150&&enemy.abilityCd<=0){
        enemy.slamWindup=.62;enemy.abilityCd=6.8;
        showStageMessage("BRUTE WINDING UP · DODGE!",650);
        return;
      }
      if(enemy.type==="armored"&&enemy.abilityCd<=0){
        enemy.armorUntil=run.elapsed+2.6;enemy.abilityCd=8.2;
        spawnParticles(enemy.x,enemy.y,"#a9c7db",profile.settings.effects?12:3);
      }
      if(enemy.type==="boss"&&d<560&&enemy.abilityCd<=0){
        enemy.abilityCd=13;
        for(let i=0;i<2;i++){
          const angle=(i/2)*Math.PI*2+Math.random()*.7;
          const x=Math.max(45,Math.min(run.worldW-45,enemy.x+Math.cos(angle)*54));
          const y=Math.max(45,Math.min(run.worldH-45,enemy.y+Math.sin(angle)*54));
          const hp=58+run.wave*4;
          run.enemies.push(entity("enemy","walker",x,y,{hp,maxHp:hp,speed:84+run.wave,damage:10+run.wave,radius:13,abilityCd:3.2}));
        }
        spawnParticles(enemy.x,enemy.y,"#b96b80",profile.settings.effects?20:5);
        showStageMessage("MUTANT OVERLORD · SUMMONING",900);
      }
      if((enemy.type==="walker"||enemy.type==="runner")&&d>range&&d<330&&enemy.abilityCd<=0){
        enemy.lungeTime=enemy.type==="runner"?.95:.55;
        enemy.abilityCd=enemy.type==="runner"?5.3:6.6;
        spawnParticles(enemy.x,enemy.y,enemy.type==="runner"?"#a9dd70":"#92b77c",profile.settings.effects?8:2);
      }
      if(d>range){
        const baseSpeed=enemy.speed;
        if(enemy.lungeTime>0)enemy.speed=baseSpeed*(enemy.type==="runner"?2.05:1.55);
        moveActor(enemy,dx/d,dy/d,dt);
        enemy.speed=baseSpeed;
      }
      if(d<=range+5&&enemy.attackCd<=0){
        enemy.attackCd=enemy.type==="boss"?.75:enemy.type==="runner"?.55:1.05;
        const biteDamage=enemy.type==="walker"&&enemy.lungeTime>0?enemy.damage*1.35:enemy.damage;
        damageActor(threat,biteDamage);
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
  const waveSeconds=run.mode==="zombie"?36:28;
  const next=Math.floor(run.elapsed/waveSeconds)+1;
  if(next>run.wave){
    run.wave=next;showStageMessage("WAVE "+run.wave+" — "+(run.mode==="zombie"?"MILITARY RESPONSE ESCALATING":"THE HORDE IS EVOLVING"),1700);
    if(run.mode==="human"&&run.wave%5===0)spawnBossOnce();
    if(run.mode==="zombie"&&run.wave>=6&&run.wave%3===0)spawnEnemy();
  }
  run.nextSpawn-=dt;
  if(run.nextSpawn<=0){
    const count=Math.min(1+Math.floor(run.wave/3),4);
    for(let i=0;i<count;i++)spawnEnemy();
    run.nextSpawn=run.mode==="zombie"?Math.max(3.8,6.8-run.wave*.12):Math.max(1.2,4.6-run.wave*.18);
  }
}
function spawnBossOnce(){
  if(run.spawnedBossWave===run.wave)return;
  run.spawnedBossWave=run.wave;
  const p=spawnAtEdge();
  run.enemies.push(entity("enemy","boss",p.x,p.y,{hp:700+run.wave*40,maxHp:700+run.wave*40,speed:54,damage:34+run.wave*2,radius:34,abilityCd:7.5}));
}
function update(dt){
  run.elapsed+=dt;
  [run.player,...run.friends,...run.enemies].forEach(a=>{a.vx=0;a.vy=0;});
  if(run.mode==="zombie"&&run.player.hp>0)run.player.hp=Math.min(run.player.maxHp,run.player.hp+3.8*dt);
  updatePlayer(dt);
  updateAI(dt);
  collectHouseAmmo();
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
  const r=p.radius,phase=performance.now()*.002+p.id;
  ctx.fillStyle="rgba(0,0,0,.3)";ctx.beginPath();ctx.ellipse(3,6,r*1.18,r*.72,0,0,Math.PI*2);ctx.fill();
  if(p.type==="car"||p.type==="truck"||p.type==="forklift"){
    ctx.rotate(p.heading||0);
    // Wheels and lower chassis.
    ctx.fillStyle="#11191e";ctx.fillRect(-r*.94,-r*.67,r*1.88,r*1.34);
    ctx.fillStyle=p.type==="truck"?"#758994":p.type==="forklift"?"#bd944f":"#526f7b";
    ctx.fillRect(-r,-r*.55,r*2,r*1.1);
    // Bonnet, windshield, cabin and rear glass.
    ctx.fillStyle="#394d55";ctx.fillRect(-r*.55,-r*.43,r*1.1,r*.86);
    ctx.fillStyle="#9bbdc4";ctx.fillRect(-r*.46,-r*.35,r*.92,r*.27);
    ctx.fillStyle="#425b64";ctx.fillRect(-r*.46,r*.08,r*.92,r*.25);
    ctx.strokeStyle="rgba(222,239,237,.45)";ctx.lineWidth=1.5;ctx.strokeRect(-r*.55,-r*.43,r*1.1,r*.86);
    // Headlights / tail lamps / tyres.
    ctx.fillStyle="#f2d69b";ctx.fillRect(-r*.93,-r*.42,r*.12,r*.17);ctx.fillRect(r*.81,-r*.42,r*.12,r*.17);
    ctx.fillStyle="#a94f42";ctx.fillRect(-r*.93,r*.25,r*.12,r*.17);ctx.fillRect(r*.81,r*.25,r*.12,r*.17);
    ctx.fillStyle="#10171c";ctx.fillRect(-r*.76,-r*.7,r*.36,r*.19);ctx.fillRect(r*.4,-r*.7,r*.36,r*.19);
    ctx.fillRect(-r*.76,r*.51,r*.36,r*.19);ctx.fillRect(r*.4,r*.51,r*.36,r*.19);
    ctx.fillStyle="rgba(234,241,235,.18)";ctx.fillRect(-r*.84,-r*.51,r*1.68,r*.06);
    // Optional fire damage and drifting smoke.
    if(p.scorch){ctx.fillStyle="rgba(8,12,14,.64)";ctx.beginPath();ctx.ellipse(0,0,r*1.18,r*.75,0,0,Math.PI*2);ctx.fill();}
    if(p.burning){
      for(let n=0;n<3;n++){ctx.globalAlpha=.17+n*.045;ctx.fillStyle=n%2?"#777a75":"#3b4141";ctx.beginPath();ctx.arc(Math.sin(phase+n)*r*.22,-r*(.86+n*.47),r*(.17+n*.055),0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;
      const flame=.8+Math.sin(phase*8)*.18;
      ctx.fillStyle="rgba(255,98,31,.84)";ctx.beginPath();ctx.ellipse(0,-r*.65,r*.29,r*.54*flame,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#ffd46c";ctx.beginPath();ctx.ellipse(0,-r*.65,r*.12,r*.31*flame,0,0,Math.PI*2);ctx.fill();
    }
  }else if(p.type==="bench"){
    ctx.fillStyle="#333c40";ctx.fillRect(-r,-r*.38,r*2,r*.77);
    ctx.fillStyle="#9b7651";for(let k=0;k<4;k++)ctx.fillRect(-r*.88,-r*.33+k*r*.21,r*1.76,r*.12);
    ctx.fillStyle="#282f32";ctx.fillRect(-r*.72,r*.36,r*.12,r*.43);ctx.fillRect(r*.6,r*.36,r*.12,r*.43);
    ctx.strokeStyle="rgba(235,213,173,.52)";ctx.lineWidth=1.5;ctx.strokeRect(-r*.88,-r*.33,r*1.76,r*.75);
  }else if(p.type==="bin"||p.type==="barrel"){
    ctx.fillStyle=p.type==="barrel"?"#955c3a":"#4e666b";
    ctx.beginPath();ctx.ellipse(0,0,r*.69,r*.78,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(230,236,226,.24)";ctx.beginPath();ctx.ellipse(-r*.1,-r*.3,r*.46,r*.2,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#27363a";ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,0,r*.68,r*.77,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#202d32";ctx.fillRect(-r*.46,-r*.62,r*.92,r*.16);
    if(p.type==="barrel"){
      ctx.strokeStyle="#c2a06b";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r*.54,-r*.15);ctx.lineTo(r*.54,-r*.15);ctx.moveTo(-r*.54,r*.3);ctx.lineTo(r*.54,r*.3);ctx.stroke();
    }
  }else if(p.type==="crate"||p.type==="pallet"||p.type==="barrier"||p.type==="shop"||p.type==="stall"){
    ctx.fillStyle=p.type==="barrier"?"#a18d5c":p.type==="shop"||p.type==="stall"?"#687f7a":"#876c4d";
    ctx.fillRect(-r*.72,-r*.72,r*1.44,r*1.44);
    ctx.strokeStyle="rgba(28,32,29,.72)";ctx.lineWidth=2;ctx.strokeRect(-r*.72,-r*.72,r*1.44,r*1.44);
    ctx.strokeStyle="rgba(231,208,163,.55)";ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(-r*.58,-r*.58);ctx.lineTo(r*.58,r*.58);ctx.moveTo(r*.58,-r*.58);ctx.lineTo(-r*.58,r*.58);ctx.stroke();
    if(p.type==="barrier"){ctx.fillStyle="#d0b06a";ctx.fillRect(-r*.72,-r*.16,r*1.44,r*.3);ctx.strokeStyle="#252d2c";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-r*.65,-r*.14);ctx.lineTo(-r*.4,r*.14);ctx.moveTo(0,-r*.14);ctx.lineTo(r*.25,r*.14);ctx.stroke();}
  }else{
    ctx.fillStyle="#4d5a53";ctx.beginPath();ctx.arc(0,0,r*.68,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#d0bb89";ctx.beginPath();ctx.arc(0,0,r*.38,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#263437";ctx.fillRect(-2,-r,r*.14,r*2);
    if(p.type==="lamp"){ctx.fillStyle="rgba(255,226,145,.3)";ctx.beginPath();ctx.arc(0,0,r*1.7,0,Math.PI*2);ctx.fill();}
  }
  if(p.hp<p.maxHp){
    ctx.fillStyle="#171e21";ctx.fillRect(-r,-r-8,r*2,4);
    ctx.fillStyle="#d9a26d";ctx.fillRect(-r,-r-8,r*2*Math.max(0,p.hp/p.maxHp),4);
  }
  ctx.restore();
}
function drawActor(ctx,e,isPlayer){
  ctx.save();ctx.translate(e.x,e.y);
  const velocity=Math.hypot(e.vx||0,e.vy||0);
  const facing=velocity>5?Math.atan2(e.vy,e.vx)+Math.PI/2:(e.facingAngle||0);
  if(e.type!=="tank"&&e.type!=="heli")ctx.rotate(facing);
  const moving=velocity>5;
  const phase=performance.now()*.014+(e.id||0)*.61;
  const stride=moving?Math.sin(phase)*Math.min(1,velocity/78):0;
  const bob=moving?Math.abs(Math.sin(phase*2))*1.25:0;
  const zombie=e.type==="zombie"||(run.mode==="human"&&e.team==="enemy");
  const runner=e.type==="runner";
  const human=!zombie&&(e.type==="civilian"||e.type==="police"||e.type==="soldier"||e.type==="ally"||(isPlayer&&run.mode==="human"));
  const armed=e.type==="police"||e.type==="soldier"||e.type==="ally"||(isPlayer&&run.mode==="human");
  const scale=e.type==="boss"?1.38:e.type==="brute"?1.18:e.type==="armored"?1.12:1;
  const r=e.radius*scale,skin=human?"#c79f82":e.type==="runner"?"#a9d878":"#b7d58f";
  let coat=human?"#4b7890":"#668451";
  if(e.type==="police")coat="#334f8a";
  if(e.type==="soldier"||e.type==="ally")coat="#677a54";
  if(e.type==="runner")coat="#71934b";
  if(e.type==="brute")coat="#455b3d";
  if(e.type==="armored")coat="#59626a";
  if(e.type==="boss")coat="#79485d";
  if(run.mode==="human"&&profile.upgrades.human.skin>0&&(e.team==="player"||e.type==="ally"))coat=["#4b7890","#8060a4","#b0794c","#438477"][profile.upgrades.human.skin%4];
  if(e.type==="tank"){
    ctx.rotate(e.angle||0);
    ctx.fillStyle="#18251f";ctx.fillRect(-31,-24,62,48);
    ctx.fillStyle="#596d4f";ctx.fillRect(-26,-20,52,40);
    ctx.fillStyle="#303c32";ctx.fillRect(-16,-14,32,28);
    ctx.fillStyle="#97a77c";ctx.fillRect(0,-5,41,10);
    ctx.fillStyle="#a9b48d";ctx.fillRect(-22,-18,8,36);ctx.fillRect(14,-18,8,36);
  }else if(e.type==="heli"){
    ctx.fillStyle="rgba(0,0,0,.26)";ctx.beginPath();ctx.ellipse(0,8,33,20,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#405b52";ctx.beginPath();ctx.ellipse(0,0,28,16,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#9bb5b2";ctx.beginPath();ctx.ellipse(7,-2,12,9,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#c9d5cc";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-36,-22);ctx.lineTo(36,-22);ctx.moveTo(0,-22);ctx.lineTo(0,22);ctx.moveTo(23,0);ctx.lineTo(38,8);ctx.stroke();
  }else{
    ctx.fillStyle="rgba(4,8,11,.34)";ctx.beginPath();ctx.ellipse(0,r*.53,r*.95,r*.43,0,0,Math.PI*2);ctx.fill();
    // Humans and fast infected show a full stride; ordinary zombies have no visible legs.
    if(human||runner){
      const legY=r*.34,legDrop=r*.83;
      ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=human?"#273b48":"#40523b";ctx.lineWidth=Math.max(4,r*.29);
      ctx.beginPath();
      ctx.moveTo(-r*.28,legY);ctx.lineTo(-r*.35+stride*r*.42,legDrop+bob);
      ctx.moveTo(r*.28,legY);ctx.lineTo(r*.35-stride*r*.42,legDrop-bob);
      ctx.stroke();
      ctx.strokeStyle=human?"#a88b72":"#8da96b";ctx.lineWidth=Math.max(3,r*.13);ctx.beginPath();
      ctx.moveTo(-r*.35+stride*r*.42,legDrop+bob);ctx.lineTo(-r*.54+stride*r*.52,legDrop+bob+3);
      ctx.moveTo(r*.35-stride*r*.42,legDrop-bob);ctx.lineTo(r*.54-stride*r*.52,legDrop-bob+3);ctx.stroke();
      ctx.fillStyle=human?"#1e2931":"#394236";
      ctx.fillRect(-r*.68+stride*r*.42,legDrop+bob+1,r*.38,5);
      ctx.fillRect(r*.3-stride*r*.42,legDrop-bob+1,r*.38,5);
    }
    ctx.lineCap="round";ctx.lineJoin="round";
    if(zombie){
      // Zombies hold their arms forward; only a subtle movement sway is animated.
      const reach=moving?stride*r*.11:0;
      ctx.strokeStyle="#657b50";ctx.lineWidth=Math.max(5,r*.28);ctx.beginPath();
      ctx.moveTo(-r*.53,-r*.06);ctx.lineTo(-r*.66-reach,-r*.7);ctx.lineTo(-r*.48-reach,-r*1.1);
      ctx.moveTo(r*.53,-r*.06);ctx.lineTo(r*.66+reach,-r*.7);ctx.lineTo(r*.48+reach,-r*1.1);ctx.stroke();
      ctx.fillStyle="#a9cc84";ctx.beginPath();
      ctx.arc(-r*.48-reach,-r*1.12,r*.16,0,Math.PI*2);ctx.arc(r*.48+reach,-r*1.12,r*.16,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#e0e8ba";ctx.lineWidth=1.5;ctx.beginPath();
      for(let k=0;k<3;k++){ctx.moveTo(-r*.6+k*r*.1,-r*1.16);ctx.lineTo(-r*.64+k*r*.1,-r*1.31);ctx.moveTo(r*.4+k*r*.1,-r*1.16);ctx.lineTo(r*.44+k*r*.1,-r*1.31);}ctx.stroke();
    }else{
      // Human arms swing opposite the legs, and remain still while idle.
      ctx.strokeStyle=human?"#c79f82":"#a9d3a0";ctx.lineWidth=Math.max(4,r*.22);ctx.beginPath();
      ctx.moveTo(-r*.52,-r*.05);ctx.lineTo(-r*.82-stride*r*.38,-r*.01+stride*r*.18);
      ctx.moveTo(r*.52,-r*.05);ctx.lineTo(r*.82+stride*r*.38,-r*.01-stride*r*.18);ctx.stroke();
      ctx.fillStyle=skin;ctx.beginPath();
      ctx.arc(-r*.82-stride*r*.38,-r*.01+stride*r*.18,r*.14,0,Math.PI*2);
      ctx.arc(r*.82+stride*r*.38,-r*.01-stride*r*.18,r*.14,0,Math.PI*2);ctx.fill();
    }
    // Layered clothing and vest.
    ctx.fillStyle=coat;ctx.beginPath();ctx.ellipse(0,bob,r*.65,r*.83,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="rgba(12,20,22,.62)";ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle="rgba(235,236,206,.12)";ctx.beginPath();ctx.ellipse(-r*.2,-r*.1,r*.17,r*.45,-.12,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=human?"#344c58":"#3f4d39";ctx.fillRect(-r*.45,-r*.2,r*.9,r*.22);
    ctx.fillStyle="rgba(236,215,163,.4)";ctx.fillRect(-r*.36,-r*.46,r*.16,r*.18);ctx.fillRect(r*.19,-r*.46,r*.16,r*.18);
    if(human){ctx.fillStyle="#26383c";ctx.fillRect(-r*.49,r*.1,r*.28,r*.28);ctx.fillRect(r*.21,r*.1,r*.28,r*.28);ctx.fillStyle="#c4b18b";ctx.fillRect(-r*.4,r*.16,r*.11,r*.1);}
    else{ctx.fillStyle="#b0d88b";ctx.fillRect(-r*.34,r*.06,r*.18,r*.14);ctx.fillStyle="#754d43";ctx.fillRect(r*.14,r*.19,r*.2,r*.11);}
    // Head, face and hair / infected eyes.
    ctx.fillStyle=skin;ctx.beginPath();ctx.arc(0,-r*.66-bob,r*.39,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=zombie?"#4a6643":"#a87f68";ctx.beginPath();ctx.arc(-r*.36,-r*.66-bob,r*.1,0,Math.PI*2);ctx.arc(r*.36,-r*.66-bob,r*.1,0,Math.PI*2);ctx.fill();
    if(zombie){
      ctx.fillStyle="#d9e68b";ctx.beginPath();ctx.arc(-r*.15,-r*.72-bob,r*.075,0,Math.PI*2);ctx.arc(r*.15,-r*.72-bob,r*.075,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#532f2c";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r*.17,-r*.47-bob);ctx.lineTo(r*.17,-r*.45-bob);ctx.stroke();
      ctx.fillStyle="#d7d5b2";ctx.fillRect(-r*.16,-r*.43-bob,r*.07,3);ctx.fillRect(r*.07,-r*.43-bob,r*.07,3);
    }else{
      ctx.fillStyle="#26313a";ctx.beginPath();ctx.arc(-r*.13,-r*.7-bob,r*.045,0,Math.PI*2);ctx.arc(r*.13,-r*.7-bob,r*.045,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=coat;ctx.beginPath();ctx.arc(0,-r*.9-bob,r*.42,Math.PI,Math.PI*2);ctx.fill();
    }
    if(armed){
      // Human player and armed NPCs hold a visible rifle.
      ctx.save();ctx.translate(r*.25,-r*.2);ctx.rotate(-.08);
      ctx.fillStyle="#202b2d";ctx.fillRect(-r*.02,-r*.95,r*.14,r*1.18);
      ctx.fillStyle="#687a73";ctx.fillRect(-r*.08,-r*.94,r*.24,r*.18);
      ctx.fillStyle="#a4b4a9";ctx.fillRect(-r*.035,-r*1.18,r*.06,r*.25);
      ctx.fillStyle="#493d32";ctx.fillRect(-r*.16,-r*.12,r*.35,r*.28);
      ctx.fillStyle="#8c9a91";ctx.fillRect(-r*.06,-r*.65,r*.11,r*.4);ctx.restore();
    }
    if(isPlayer){ctx.strokeStyle="#e5dcff";ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(0,0,r*.9,r*1.14,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#d5e9a7";ctx.beginPath();ctx.arc(0,r*1.25,2.5,0,Math.PI*2);ctx.fill();}
    if(e.team==="friend"||e.team==="player"){ctx.fillStyle="#b4ef93";ctx.fillRect(-6,r*1.25,12,3);}
  }
  if(e.team!=="player"&&e.type!=="civilian"&&e.hp<e.maxHp){
    ctx.fillStyle="#141a22";ctx.fillRect(-r,-r-10,r*2,4);
    ctx.fillStyle=e.team==="friend"?"#89d68c":"#e48e78";ctx.fillRect(-r,-r-10,r*2*Math.max(0,e.hp/e.maxHp),4);
  }
  if(run.mode==="human"&&e.team==="enemy"){
    const labels={walker:"WALKER",runner:"FAST RUNNER",brute:"BRUTE",armored:"ARMORED",boss:"MUTANT BOSS"};
    if(e.type==="armored"&&run.elapsed<(e.armorUntil||0)){ctx.strokeStyle="rgba(165,211,238,.9)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r+8,0,Math.PI*2);ctx.stroke();}
    if(e.type==="brute"&&e.slamWindup>0){ctx.strokeStyle="rgba(255,145,80,.9)";ctx.lineWidth=3;ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc(0,0,r+10+(0.62-e.slamWindup)*80,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(e.type==="boss"){ctx.strokeStyle="rgba(196,91,117,.68)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r+9+Math.sin(performance.now()*.006)*3,0,Math.PI*2);ctx.stroke();}
    ctx.font="bold 8px sans-serif";ctx.textAlign="center";ctx.fillStyle="#f4e6c8";ctx.fillText(labels[e.type]||"INFECTED",0,-r-18);
  }
  ctx.restore();
}
function drawMapDetails(ctx){
  const id=run.mapId;
  const label=(text,x,y,color)=>{
    ctx.save();ctx.font="bold 11px sans-serif";ctx.textAlign="left";ctx.fillStyle="rgba(7,13,16,.58)";ctx.fillRect(x-7,y-14,Math.max(112,text.length*7)+14,22);
    ctx.fillStyle=color||"rgba(229,219,194,.68)";ctx.fillText(text,x,y);ctx.restore();
  };
  const shrub=(x,y,r)=>{
    ctx.save();ctx.fillStyle="rgba(7,13,12,.22)";ctx.beginPath();ctx.ellipse(x+3,y+4,r*1.1,r*.75,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#455e47";ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="rgba(169,190,126,.34)";ctx.beginPath();ctx.arc(x-r*.22,y-r*.25,r*.48,0,Math.PI*2);ctx.fill();ctx.restore();
  };
  const hazard=(x,y,w)=>{
    ctx.save();ctx.fillStyle="#d1a64f";ctx.fillRect(x,y,w,8);ctx.strokeStyle="#272d30";ctx.lineWidth=3;
    for(let sx=x+4;sx<x+w;sx+=18){ctx.beginPath();ctx.moveTo(sx,y+8);ctx.lineTo(sx+9,y);ctx.stroke();}
    ctx.restore();
  };
  if(id==="city"){
    // Residential street scene: lawns, footpaths, zebra crossings and roadside planting.
    for(let x=70;x<run.worldW;x+=620){
      ctx.fillStyle="rgba(89,116,85,.25)";ctx.fillRect(x,90,82,220);ctx.fillRect(x+230,700,66,200);
      for(let y=125;y<285;y+=48)shrub(x+39,y,12);
    }
    for(let y=210;y<run.worldH;y+=570){
      ctx.fillStyle="rgba(190,181,151,.16)";ctx.fillRect(90,y,170,22);ctx.fillRect(1120,y+105,200,18);
      ctx.fillStyle="rgba(235,235,218,.48)";
      for(let n=-3;n<=3;n++){ctx.fillRect(390+n*15-3,y-61,7,23);ctx.fillRect(390+n*15-3,y+38,7,23);}
      ctx.fillStyle="rgba(239,177,84,.42)";ctx.fillRect(387,y-8,6,16);
    }
    label("RESIDENTIAL BOULEVARD",95,355);
    label("ABANDONED NEIGHBOURHOOD",1050,1010);
  }else if(id==="mall"){
    // Open-air shopping district car park, not a multi-storey mall block.
    ctx.fillStyle="rgba(206,217,220,.08)";ctx.fillRect(0,360,run.worldW,590);
    ctx.strokeStyle="rgba(235,224,192,.31)";ctx.lineWidth=3;
    for(let x=70;x<run.worldW;x+=115){
      ctx.beginPath();ctx.moveTo(x,390);ctx.lineTo(x,920);ctx.stroke();
    }
    for(let y=390;y<930;y+=92){
      ctx.beginPath();ctx.moveTo(45,y);ctx.lineTo(run.worldW-45,y);ctx.stroke();
    }
    ctx.setLineDash([18,12]);ctx.strokeStyle="rgba(219,190,121,.42)";
    for(let x=0;x<run.worldW;x+=300){ctx.beginPath();ctx.moveTo(x,660);ctx.lineTo(x+185,660);ctx.stroke();}
    ctx.setLineDash([]);
    ctx.fillStyle="rgba(105,139,111,.25)";ctx.fillRect(850,410,180,500);
    for(let y=455;y<880;y+=82){shrub(875,y,10);shrub(1005,y,10);}
    label("OPEN-AIR MARKET PARKING",95,335);
    label("DELIVERY / PICKUP AREA",1180,990);
  }else if(id==="industrial"){
    // Gravel yard markings, loading-zone paint and oil stains around roadside props.
    ctx.fillStyle="rgba(36,44,43,.2)";ctx.fillRect(0,0,run.worldW,run.worldH);
    ctx.strokeStyle="rgba(205,183,128,.28)";ctx.lineWidth=4;ctx.setLineDash([28,16]);
    for(let x=250;x<run.worldW;x+=530){ctx.beginPath();ctx.moveTo(x,60);ctx.lineTo(x,run.worldH-60);ctx.stroke();}
    ctx.setLineDash([]);
    for(let x=130;x<run.worldW;x+=420)for(let y=150;y<run.worldH;y+=390){
      ctx.fillStyle="rgba(17,22,23,.2)";ctx.beginPath();ctx.ellipse(x,y,42,20,Math.sin(x+y)*.4,0,Math.PI*2);ctx.fill();
    }
    for(let x=470;x<run.worldW-180;x+=530){hazard(x,335,125);hazard(x,930,125);}
    ctx.fillStyle="rgba(143,151,122,.18)";ctx.fillRect(460,420,90,340);ctx.fillRect(1000,420,90,340);
    label("INDUSTRIAL SERVICE ROAD",90,355);
    label("LOADING / STORAGE YARD",1190,990);
  }else if(id==="safehouse"){
    // A defensive residential perimeter built from low sandbags and portable barriers.
    ctx.fillStyle="rgba(15,25,29,.2)";ctx.fillRect(620,385,660,540);
    ctx.strokeStyle="#9a9a77";ctx.lineWidth=7;ctx.setLineDash([20,9]);ctx.strokeRect(640,405,620,500);ctx.setLineDash([]);
    for(let x=690;x<1200;x+=58){
      ctx.fillStyle="#a9a28a";ctx.beginPath();ctx.ellipse(x,425,21,11,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(x,885,21,11,0,0,Math.PI*2);ctx.fill();
    }
    for(let y=485;y<860;y+=58){
      ctx.fillStyle="#a9a28a";ctx.beginPath();ctx.ellipse(665,y,11,21,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(1235,y,11,21,0,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle="rgba(114,178,142,.1)";ctx.fillRect(680,440,540,435);
    label("SAFEHOUSE PERIMETER",705,960);
    label("SANDBAG DEFENCE LINE",90,350);
  }else if(id==="military"){
    // Ground-level military barricades, sandbag firing positions and a painted landing zone.
    ctx.fillStyle="rgba(15,24,19,.24)";ctx.fillRect(560,390,780,570);
    ctx.strokeStyle="#78866e";ctx.lineWidth=9;ctx.setLineDash([24,8]);ctx.strokeRect(580,410,740,530);ctx.setLineDash([]);
    [[605,435],[1260,435],[605,890],[1260,890]].forEach(([x,y])=>{
      ctx.fillStyle="#59664e";ctx.fillRect(x,y,62,62);ctx.fillStyle="#202b27";ctx.fillRect(x+12,y+12,38,38);ctx.fillStyle="#c6b66b";ctx.fillRect(x+28,y-12,7,30);
    });
    [[760,500],[1010,500],[760,755],[1010,755]].forEach(([x,y],i)=>{
      ctx.fillStyle=i%2?"#6a7660":"#626e58";ctx.beginPath();ctx.moveTo(x,y+58);ctx.lineTo(x+90,y+58);ctx.lineTo(x+70,y);ctx.lineTo(x+20,y);ctx.closePath();ctx.fill();
      ctx.strokeStyle="#b6bb9b";ctx.lineWidth=3;ctx.stroke();
    });
    ctx.beginPath();ctx.arc(1190,790,76,0,Math.PI*2);ctx.strokeStyle="#c2c9bd";ctx.lineWidth=5;ctx.stroke();
    ctx.beginPath();ctx.arc(1190,790,48,0,Math.PI*2);ctx.stroke();ctx.moveTo(1114,790);ctx.lineTo(1266,790);ctx.moveTo(1190,714);ctx.lineTo(1190,866);ctx.stroke();
    label("LANDING ZONE",1127,888);
    for(let x=680;x<1320;x+=100)hazard(x,965,84);
    label("MILITARY ROADBLOCK",80,355);
  }else if(id==="metro"){
    // An open-air station forecourt with painted platform lanes; all building silhouettes remain houses.
    ctx.fillStyle="#353c46";ctx.fillRect(0,515,run.worldW,290);
    ctx.fillStyle="#626973";ctx.fillRect(0,535,run.worldW,250);
    ctx.fillStyle="#252a31";ctx.fillRect(0,465,run.worldW,70);ctx.fillRect(0,805,run.worldW,70);
    for(const y of [482,510,820,848]){
      ctx.fillStyle="#a9adb0";ctx.fillRect(0,y,run.worldW,5);
      ctx.fillStyle="#6e747a";for(let x=0;x<run.worldW;x+=62)ctx.fillRect(x,y-9,12,24);
    }
    ctx.fillStyle="#e5c36f";ctx.fillRect(0,553,run.worldW,7);ctx.fillRect(0,760,run.worldW,7);
    for(let x=70;x<run.worldW;x+=190){
      ctx.fillStyle="#40464f";ctx.fillRect(x,570,34,178);ctx.fillStyle="#87909a";ctx.fillRect(x+5,575,7,168);
      ctx.fillStyle="rgba(229,195,111,.5)";ctx.fillRect(x+40,570,4,178);
    }
    label("UNDERGROUND SERVICE ROAD",80,430);
    label("PLATFORM / PEDESTRIAN LANE",740,900);
  }
}

function drawHouses(ctx){
  (run.houses||[]).forEach(house=>{
    const inside=pointInsideHouse(house,run.player.x,run.player.y,8);
    const x=house.x,y=house.y,w=house.w,h=house.h,doorX=x+w/2;
    const roofAlpha=inside?.12:1;
    ctx.save();
    // Exterior wall and soft shadow.
    ctx.fillStyle="rgba(0,0,0,.3)";ctx.fillRect(x+8,y+10,w,h);
    ctx.fillStyle="#b7a486";ctx.fillRect(x+5,y+5,w-10,h-10);
    ctx.fillStyle="#826e5c";ctx.fillRect(x+11,y+11,w-22,h-22);
    // Interior floor, furniture and floorboard detail.
    ctx.fillStyle="#b6a184";ctx.fillRect(x+17,y+17,w-34,h-34);
    ctx.save();ctx.beginPath();ctx.rect(x+17,y+17,w-34,h-34);ctx.clip();
    ctx.fillStyle="rgba(64,47,35,.12)";
    for(let yy=y+22;yy<y+h-20;yy+=10)ctx.fillRect(x+18,yy,w-36,1);
    // Rug / bed
    ctx.fillStyle="#65756a";ctx.fillRect(x+44,y+37,58,38);
    ctx.strokeStyle="#d0b68c";ctx.lineWidth=3;ctx.strokeRect(x+44,y+37,58,38);
    ctx.fillStyle="#c9b79a";ctx.fillRect(x+48,y+41,50,29);
    // Table / cabinets
    ctx.fillStyle="#5d5045";ctx.fillRect(x+104,y+30,25,13);ctx.fillRect(x+108,y+26,17,5);
    ctx.fillStyle="#756451";ctx.fillRect(x+28,y+87,42,15);
    ctx.fillStyle="#c2a77f";ctx.fillRect(x+29,y+83,40,6);
    // Ammunition crate placed on the floor, visible only through the translucent roof.
    if(run.mode==="human"&&house.ammo&&!house.ammo.collected){
      ctx.fillStyle="#252f30";ctx.fillRect(house.ammo.x-10,house.ammo.y-8,20,16);
      ctx.fillStyle="#b99a4d";ctx.fillRect(house.ammo.x-8,house.ammo.y-6,16,12);
      ctx.fillStyle="#f2d77d";ctx.fillRect(house.ammo.x-4,house.ammo.y-4,8,8);
      ctx.fillStyle="#f5e6b4";ctx.font="bold 8px sans-serif";ctx.textAlign="center";
      ctx.fillText("AMMO",house.ammo.x,house.ammo.y+19);
    }
    ctx.restore();
    // Tiled single-storey pitched roof and ridge.
    ctx.globalAlpha=roofAlpha;
    ctx.fillStyle=house.roofTone;ctx.beginPath();
    ctx.moveTo(x+3,y+18);ctx.lineTo(x+w/2,y-8);ctx.lineTo(x+w-3,y+18);
    ctx.lineTo(x+w-3,y+h-5);ctx.lineTo(x+3,y+h-5);ctx.closePath();ctx.fill();
    ctx.strokeStyle="rgba(231,217,190,.3)";ctx.lineWidth=2;ctx.stroke();
    ctx.strokeStyle="rgba(22,29,29,.32)";ctx.lineWidth=1;
    for(let row=0;row<5;row++){
      const yy=y+25+row*17;
      ctx.beginPath();ctx.moveTo(x+10,yy);ctx.lineTo(x+w-10,yy);ctx.stroke();
      for(let col=0;col<4;col++){
        const xx=x+12+col*34+(row%2)*16;
        if(xx<x+w-13){ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+13,yy+8);ctx.stroke();}
      }
    }
    ctx.strokeStyle="rgba(232,214,181,.55)";ctx.lineWidth=4;ctx.beginPath();
    ctx.moveTo(x+9,y+18);ctx.lineTo(x+w/2,y-4);ctx.lineTo(x+w-9,y+18);ctx.stroke();
    ctx.fillStyle="#51483d";ctx.fillRect(x+w-31,y+18,18,20);
    // Windows.
    ctx.fillStyle="#8a7660";ctx.fillRect(x+18,y+37,23,18);ctx.fillRect(x+w-41,y+37,23,18);
    ctx.fillStyle="#91b5b2";ctx.fillRect(x+21,y+40,17,12);ctx.fillRect(x+w-38,y+40,17,12);
    ctx.strokeStyle="#d4c7aa";ctx.lineWidth=3;ctx.strokeRect(x+18,y+37,23,18);ctx.strokeRect(x+w-41,y+37,23,18);
    ctx.globalAlpha=1;
    // Front door and damage indicator.
    if(house.doorOpen){
      ctx.fillStyle="#202722";ctx.fillRect(doorX-14,y+h-13,28,13);
      ctx.strokeStyle="#c3a77c";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(doorX-17,y+h-13);ctx.lineTo(doorX+17,y+h-13);ctx.stroke();
    }else{
      ctx.fillStyle="#49382e";ctx.fillRect(doorX-13,y+h-20,26,20);
      ctx.strokeStyle="#c7a77a";ctx.lineWidth=2;ctx.strokeRect(doorX-13,y+h-20,26,20);
      ctx.fillStyle="#e3bd6e";ctx.beginPath();ctx.arc(doorX+7,y+h-10,2,0,Math.PI*2);ctx.fill();
      const hp=house.doorHp||house.doorMaxHp;
      ctx.fillStyle="#1b2021";ctx.fillRect(doorX-17,y+h+4,34,4);
      ctx.fillStyle="#d69a65";ctx.fillRect(doorX-17,y+h+4,34*(hp/house.doorMaxHp),4);
    }
    ctx.restore();
  });
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
  if(run.mapId!=="mall"&&run.mapId!=="metro"){
  // Broad asphalt avenues, sidewalks and dashed lane markings give the city a readable street grid.
  for(let x=390;x<run.worldW;x+=620){ctx.fillStyle="#242d32";ctx.fillRect(x-82,0,164,run.worldH);ctx.fillStyle="#41484a";ctx.fillRect(x-89,0,7,run.worldH);ctx.fillRect(x+82,0,7,run.worldH);ctx.strokeStyle="rgba(235,208,130,.48)";ctx.lineWidth=3;ctx.setLineDash([24,22]);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,run.worldH);ctx.stroke();ctx.setLineDash([]);}
  for(let y=330;y<run.worldH;y+=570){ctx.fillStyle="#242d32";ctx.fillRect(0,y-68,run.worldW,136);ctx.fillStyle="#41484a";ctx.fillRect(0,y-75,run.worldW,7);ctx.fillRect(0,y+68,run.worldW,7);ctx.strokeStyle="rgba(235,208,130,.42)";ctx.lineWidth=3;ctx.setLineDash([24,22]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(run.worldW,y);ctx.stroke();ctx.setLineDash([]);}
  ctx.strokeStyle="rgba(235,238,228,.08)";ctx.lineWidth=2;ctx.setLineDash([18,18]);
  for(let x=0;x<run.worldW;x+=440){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,run.worldH);ctx.stroke();}
  for(let y=0;y<run.worldH;y+=440){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(run.worldW,y);ctx.stroke();}
  ctx.setLineDash([]);
  }
  drawMapDetails(ctx);
  drawHouses(ctx);
  ctx.strokeStyle="rgba(225,229,212,.13)";ctx.lineWidth=7;ctx.strokeRect(0,0,run.worldW,run.worldH);
  run.props.forEach(p=>{if(!p.dead)drawProp(ctx,p);});
  run.bullets.forEach(b=>{ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy||0,b.vx||0));ctx.shadowBlur=12;ctx.shadowColor=b.team==="friendly"?"#7fd4ff":"#ff9c57";ctx.fillStyle=b.team==="friendly"?"#d9f5ff":"#ffe1a1";ctx.beginPath();ctx.ellipse(0,0,b.radius*2.6,b.radius*.72,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=b.team==="friendly"?"#5cbcff":"#ff713f";ctx.beginPath();ctx.arc(-b.radius*1.5,0,b.radius*.65,0,Math.PI*2);ctx.fill();ctx.restore();});
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
  const ammoPanel=$("zvhHudAmmoPanel");if(ammoPanel)ammoPanel.hidden=run.mode!=="human";
  const ammoNode=$("zvhHudAmmo");if(ammoNode)ammoNode.textContent=String(run.ammo);
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
  const node=$("zvhStageMessage");if(!node||!text)return;
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
  [["follow","zvhKeyFollow"],["attack","zvhKeyAttack"],["smash","zvhKeySmash"],["special","zvhKeySpecial"]].forEach(([name,id])=>{$(id)?.addEventListener("change",event=>{const candidate=String(event.target.value||"").toLowerCase();const duplicate=Object.keys(profile.settings.keys).find(other=>other!==name&&profile.settings.keys[other]===candidate);if(duplicate){event.target.value=profile.settings.keys[name];toast("That key is already assigned to "+duplicate.toUpperCase()+". Choose a different key.");return;}profile.settings.keys[name]=candidate;persist();syncSettingsForm();updatePcKeyGuide();});});
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
    if($("zvhGameView")&&!$("zvhGameView").hidden&&run&&!run.paused&&!run.finished){
      if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(key)){keys.add(key);if(key.startsWith("arrow")||key===" ")event.preventDefault();if(key===" "&&run.mode==="human")shootAttack();}
      const bindings=profile.settings.keys||{follow:"q",attack:"e",smash:"r",special:"2"};
      if(key===bindings.follow&&run.mode==="zombie"){setOrder("follow");event.preventDefault();}
      if(key===bindings.attack){if(run.mode==="zombie"){setOrder("attack");infectAttack();}else shootAttack();event.preventDefault();}
      if(key===bindings.smash&&run.mode==="zombie"){setOrder("guard");event.preventDefault();}
      if(key===bindings.special){specialAttack();event.preventDefault();}
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
  $("zvhTouchAttack")?.addEventListener("pointerdown",event=>{event.preventDefault();if(run?.mode==="human")shootAttack();else{setOrder("attack");infectAttack();}});
  $("zvhTouchFollow")?.addEventListener("pointerdown",event=>{event.preventDefault();setOrder("follow");});
  $("zvhTouchSmash")?.addEventListener("pointerdown",event=>{event.preventDefault();setOrder("guard");});
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
  $(EGG_ID)?.addEventListener("click",unlockGame);
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
  // Wait for auth/profile hydration before showing or hiding the permanent hero discovery button.
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