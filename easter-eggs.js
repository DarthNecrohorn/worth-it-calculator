/* Worth It Easter Eggs — lightweight, account-only discovery layer. */
(function(){
 "use strict";
 const CATALOG=[
  ["ufo_encounter","UFO Encounter","🛸","Rare"],["secret_visitor","Secret Visitor","👤","Epic"],
  ["shooting_star","Shooting Star","🌠","Common"],["lost_astronaut","Lost Astronaut","👨‍🚀","Rare"],
  ["mystery_box","Mystery Box","🎁","Common"],["worth_it_glitch","Worth It Glitch","🌀","Rare"],
  ["secret_portal","Secret Portal","🌀","Epic"],["golden_key","The Golden Key","🗝️","Legendary"],
  ["random_fact","Random Fact","💡","Common"],["daily_mystery","Daily Mystery","🔮","Rare"],
  ["fortune_cookie","Digital Fortune Cookie","🥠","Common"],["worth_it_robot","Worth It Robot","🤖","Common"],
  ["tiny_creature","Tiny Creature","🐾","Common"],["random_button","The Random Button","🎲","Rare"],
  ["lucky_coin","Lucky Coin","🪙","Rare"],["unexpected_cat","Unexpected Cat","🐈","Common"],
  ["golden_ufo","Golden UFO","🌟","Mythic"],["alien_message","Alien Message","👽","Epic"],
  ["404_visitor","The 404 Visitor","👾","Rare"],["time_traveler","Time Traveler","⏳","Legendary"],
  ["secret_worth_it_message","Secret Worth It Message","✦","Epic"],["cosmic_event","Cosmic Event","🌌","Mythic"]
 ].map(([id,name,icon,rarity])=>({id,name,icon,rarity}));
 const MESSAGES={
  ufo_encounter:["Unidentified flying object spotted. It seems impressed by your choices.","The UFO paused, scanned Worth It, and gave a tiny thumbs-up.","Pilot report: curiosity levels are unusually high."],
  secret_visitor:["Someone left a tiny hello from the other side of the screen.","A mysterious visitor stopped by. They said to keep this place curious.","You weren't expecting company. Neither were they."],
  shooting_star:["A tiny reminder: even small wins count.","Make a wish. Keep moving.","Somewhere, a star just crossed your path."],
  lost_astronaut:["Houston, we found a curious explorer.","An astronaut drifted by and asked if this is the way to the future.","Space log: one small step for a user, one giant leap for curiosity."],
  mystery_box:["Something good may be closer than you think.","Curiosity is its own reward.","The box is empty. Just kidding — it contained this message."],
  worth_it_glitch:["Reality briefly skipped a frame. Everything is fine. Probably.","W̷o̷r̷t̷h̷ ̷I̷t̷?̷ The glitch says yes.","A harmless glitch in the matrix. Carry on."],
  secret_portal:["A portal opened for a moment. It smelled faintly of possibility.","You found a shortcut to absolutely nowhere. Still a great discovery.","The portal is closed again. It says thanks for visiting."],
  golden_key:["A golden key appeared. It unlocks no doors… yet.","Some secrets are better discovered than explained.","You found a key. The mystery is what it opens."],
  random_fact:["Octopuses have three hearts. Worth thinking about.","A day on Venus is longer than its year.","Bananas are berries, but strawberries aren't. Botany is strange."],
  daily_mystery:["Today's mystery: what tiny thing will make you smile?","A riddle for today: what gets bigger the more you take away? A hole.","The answer can wait. Enjoy the question."],
  fortune_cookie:["The next good idea may arrive when you least expect it.","Your future self says: keep going.","A pleasant surprise is closer than it looks."],
  worth_it_robot:["Beep boop. Your curiosity has been detected.","System note: you are doing better than you think.","Robot wisdom #07: remember to take breaks, human."],
  tiny_creature:["A tiny visitor wishes you a lovely day.","Psst… keep exploring.","The tiny creature has left a microscopic high-five."],
  random_button:["The random button has selected… this exact moment.","You pressed absolutely nothing. Excellent timing.","Randomness says hello. It refuses to elaborate."],
  lucky_coin:["A lucky coin rolled by. Heads: good vibes. Tails: also good vibes.","Fortune favours the curious. Apparently.","You found a coin. It is worth exactly one smile."],
  unexpected_cat:["Meow. This was not on the roadmap.","The cat has reviewed your choices. Purr approved.","A cat appeared, judged the layout, and vanished."],
  golden_ufo:["A golden UFO? That's not in the usual flight path.","Legend says the golden visitor appears only to the very curious.","A rare cosmic guest has acknowledged your existence."],
  alien_message:["Greetings, Earthling. Your curiosity is impressive.","We come in peace. And excellent UI.","Our sensors detected a high concentration of curiosity here."],
  "404_visitor":["404: ordinary day not found.","A visitor from the unknown says hello.","The page you seek is not here. But this little secret is."],
  time_traveler:["A traveller from tomorrow says: this moment mattered.","Future you left a note: keep being curious.","Temporal scan complete. Your present is looking good."],
  secret_worth_it_message:["Some things are worth discovering.","You found a little moment of wonder.","Worth It has a secret. You just became part of it."],
  cosmic_event:["A tiny cosmic event just happened. No telescope required.","The stars aligned for a moment. You noticed.","Cosmic update: the universe remains wonderfully weird."]
 };
 let state={loaded:false,enabled:true,discoveries:new Set()},timer=null,lastEvent=0,sessionUser="";
 const $=id=>document.getElementById(id);
 const client=()=>window.supabaseClient;
 const signedIn=async()=>{const c=client();if(!c?.auth)return null;try{const r=await c.auth.getSession();return r?.data?.session?.user||null;}catch(_){return null;}};
 function active(){return !document.hidden&&document.visibilityState!=="hidden";}
 function toast(egg,message){
  let host=$("worthItEasterEggToast");
  if(!host){host=document.createElement("aside");host.id="worthItEasterEggToast";host.className="worth-it-easter-toast";host.setAttribute("role","status");host.setAttribute("aria-live","polite");document.body.appendChild(host);}
  host.replaceChildren();
  const icon=document.createElement("span");icon.className="worth-it-easter-toast-icon";icon.textContent=egg.icon;
  const copy=document.createElement("span");copy.className="worth-it-easter-toast-copy";
  const title=document.createElement("strong");title.textContent=egg.name;
  const body=document.createElement("small");body.textContent=message;
  const rarity=document.createElement("em");rarity.textContent=egg.rarity;
  copy.append(title,body,rarity);host.append(icon,copy);host.hidden=false;host.classList.remove("is-visible");
  requestAnimationFrame(()=>host.classList.add("is-visible"));
  window.setTimeout(()=>{host.classList.remove("is-visible");window.setTimeout(()=>{host.hidden=true;},220);},5200);
 }
 function chooseEgg(){
  const undiscovered=CATALOG.filter(x=>!state.discoveries.has(x.id));if(!undiscovered.length)return null;
  const weights={Common:62,Rare:25,Epic:9,Legendary:3,Mythic:1};
  const pool=undiscovered.flatMap(x=>Array(weights[x.rarity]||1).fill(x));
  return pool[Math.floor(Math.random()*pool.length)]||undiscovered[0];
 }
 async function record(egg){
  const c=client();if(!c?.rpc)return false;
  const r=await c.rpc("discover_worth_it_easter_egg",{p_egg_key:egg.id});
  if(r.error)throw r.error;
  if(r.data?.success===false)return false;
  state.discoveries.add(egg.id);window.dispatchEvent(new CustomEvent("worthiteastereggdiscovered",{detail:{id:egg.id}}));return r.data?.discovered===true;
 }
 async function encounter(){
  if(!state.loaded||!state.enabled||!active()||!await signedIn())return;
  const egg=chooseEgg();if(!egg)return;
  try{
   const fresh=await record(egg);if(!fresh)return;
   const choices=MESSAGES[egg.id]||["A little secret has found its way to you.","You noticed something unusual. Nice catch."];
   toast(egg,choices[Math.floor(Math.random()*choices.length)]);
  }catch(error){console.warn("Easter Egg encounter was skipped:",error);}
 }
 async function load(){
  const user=await signedIn();if(!user){stop();state={loaded:false,enabled:true,discoveries:new Set()};return;}
  if(sessionUser&&sessionUser!==user.id)state={loaded:false,enabled:true,discoveries:new Set()};
  sessionUser=user.id;
  try{
   const r=await client().rpc("get_worth_it_easter_egg_state");if(r.error)throw r.error;
   state.enabled=r.data?.enabled!==false;state.discoveries=new Set(Array.isArray(r.data?.discoveries)?r.data.discoveries:[]);state.loaded=true;
   if(state.enabled)start();else stop();
  }catch(error){state.loaded=false;stop();console.warn("Easter Eggs require the reviewed database migration:",error);}
 }
 function start(){stop();if(!lastEvent)lastEvent=Date.now();timer=window.setInterval(()=>{if(active()&&Date.now()-lastEvent>20*60*1000){lastEvent=Date.now();void encounter();}},60*1000);}
 function stop(){if(timer!==null)window.clearInterval(timer);timer=null;const host=$("worthItEasterEggToast");if(host)host.hidden=true;}
 async function saveEnabled(enabled){
  const c=client();if(!c?.rpc)throw new Error("Sign in to save this setting.");
  const r=await c.rpc("set_worth_it_easter_eggs_enabled",{p_enabled:Boolean(enabled)});if(r.error)throw r.error;
  state.enabled=Boolean(enabled);if(state.enabled)start();else stop();
  window.dispatchEvent(new CustomEvent("worthiteastereggpreferenceschange",{detail:{enabled:state.enabled}}));
 }
 async function renderProfile(worthItId){
  const section=$("worthItProfileEasterEggs"),host=$("worthItProfileEasterEggGrid"),count=$("worthItProfileEasterEggCount");
  if(!section||!host)return;
  section.hidden=true;host.replaceChildren();
  try{
   const r=await client().rpc("get_worth_it_profile_easter_eggs",{p_worth_it_id:Number(worthItId)});
   if(r.error)throw r.error;
   const found=new Set(Array.isArray(r.data?.discoveries)?r.data.discoveries:[]);
   CATALOG.forEach(egg=>{
    const isFound=found.has(egg.id),card=document.createElement("div");card.className="worth-it-easter-egg-card "+(isFound?"is-discovered":"is-unknown");
    const symbol=document.createElement("span");symbol.className="worth-it-easter-egg-symbol";symbol.setAttribute("aria-hidden","true");symbol.textContent=isFound?egg.icon:"👤";
    const title=document.createElement("strong");title.className="worth-it-easter-egg-name";title.textContent=isFound?egg.name:"Undiscovered";
    const rarity=document.createElement("small");rarity.className="worth-it-easter-egg-rarity";rarity.textContent=egg.rarity;
    card.append(symbol,title,rarity);host.appendChild(card);
   });
   if(count)count.textContent=found.size+"/22 discovered";
   section.hidden=false;
  }catch(error){console.warn("Public Easter Egg collection is unavailable:",error);}
 }
 window.WorthItEasterEggs={load,saveEnabled,renderProfile,catalog:CATALOG};
 document.addEventListener("visibilitychange",()=>{if(document.hidden)stop();else if(state.loaded&&state.enabled)start();});
 window.addEventListener("pageshow",()=>void load());
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void load(),{once:true});else void load();
 window.addEventListener("worthitauthstatechange",()=>void load());
 const auth=client()?.auth;
 if(auth?.onAuthStateChange){
  auth.onAuthStateChange((event,session)=>{
   if(event==="SIGNED_IN"||event==="SIGNED_OUT"||event==="INITIAL_SESSION"){
    window.setTimeout(()=>void load(),0);
   }
  });
 }
})();
