/* DOM helper is declared before Supabase auth initialization. */
window.$ = window.$ || (id => document.getElementById(id));

/* =========================================================
SUPABASE AUTH
========================================================= */
const SUPABASE_URL = "https://diutcnylnubljvpezhmq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_W9769alA1ckSllKvue4U2Q_TdXpWnjp";

const $ = id => document.getElementById(id);

const supabaseClient = window.supabase.createClient(
SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEY,
{
auth: {
persistSession: true,
autoRefreshToken: true,
detectSessionInUrl: true
}
}
);

let currentAuthUser = null;

function getUserDisplayName(user){
return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "User";
}

function getUserAvatar(user){
return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
}

function makeAvatarMarkup(user, className="auth-avatar"){
const avatar = getUserAvatar(user);
if(avatar){
return `<img class="${className}" src="${avatar.replaceAll('"','&quot;')}" alt="" referrerpolicy="no-referrer">`;
}

const initial = getUserDisplayName(user).charAt(0).toUpperCase();
const fallbackClass = className.includes("account-head")
    ? "account-head-fallback"
    : "auth-avatar-fallback";

return `<div class="${fallbackClass}">${initial}</div>`;

}

function closeAccountPanel(){
const panel = $("accountPanel");
if(!panel) return;

panel.classList.remove("open");
panel.setAttribute("aria-hidden","true");

}

function toggleAccountPanel(){
if(!currentAuthUser) return;

const panel = $("accountPanel");
if(!panel) return;

const open = panel.classList.toggle("open");
panel.setAttribute("aria-hidden", String(!open));

}

function updateAuthUI(user){
currentAuthUser = user || null;

const btn = $("authBtn");
const icon = $("authIcon");
const label = $("authLabel");
const profileBtn = $("profileNavBtn");
const profileIcon = $("profileNavIcon");
const panel = $("accountPanel");
const signOutBtn = $("signOutNavBtn");

if(!btn || !icon || !label || !profileBtn || !profileIcon || !signOutBtn) return;

if(user){
    btn.style.display = "none";

    profileBtn.style.display = "inline-flex";
    profileBtn.title = `Open profile for ${getUserDisplayName(user)}`;
    profileBtn.setAttribute(
        "aria-label",
        `Open profile for ${getUserDisplayName(user)}`
    );

    profileIcon.innerHTML = makeAvatarMarkup(user,"auth-avatar");

    if($("accountHeadAvatar")){
        $("accountHeadAvatar").innerHTML =
            makeAvatarMarkup(user,"account-head-avatar");
    }

    if($("accountName")){
        $("accountName").textContent = getUserDisplayName(user);
    }

    if($("accountEmail")){
        $("accountEmail").textContent = user.email || "";
    }

    if(panel){
        panel.style.display = "";
        closeAccountPanel();
    }

    signOutBtn.style.display = "inline-flex";

}else{
    btn.style.display = "inline-flex";
    btn.onclick = handleAuthButton;
    btn.title = "Sign in with Google";

    icon.textContent = "🔐";
    label.textContent = "Sign in";

    profileBtn.style.display = "none";
    profileIcon.innerHTML = "👤";

    closeAccountPanel();

    signOutBtn.style.display = "none";

    if($("accountHeadAvatar")){
        $("accountHeadAvatar").innerHTML = "";
    }

    if($("accountName")){
        $("accountName").textContent = "Account";
    }

    if($("accountEmail")){
        $("accountEmail").textContent = "";
    }
}

}

async function handleAuthButton(){
if(currentAuthUser){
toggleAccountPanel();
return;
}

const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
        redirectTo: `${window.location.origin}/`
    }
});

if(error){
    console.error("Supabase Google sign-in error:", error);
    showToast("Could not start Google sign-in.");
}

}

async function signOutUser(){
const { error } = await supabaseClient.auth.signOut();

if(error){
    console.error("Supabase sign-out error:", error);
    showToast("Could not sign out.");
    return;
}

closeAccountPanel();
showToast("Signed out.");

}

function closeAccountPage(){
$("accountPageOverlay")?.classList.remove("open");
}

function renderAccountPageAvatar(user){
if(!user) return;

const holder = $("accountPageAvatar");
if(!holder) return;

const avatar = getUserAvatar(user);

if(avatar){
    holder.innerHTML =
        `<img class="account-page-avatar" src="${avatar.replaceAll('"','&quot;')}" alt="" referrerpolicy="no-referrer">`;
}else{
    holder.innerHTML =
        `<div class="account-page-avatar-fallback">${getUserDisplayName(user).charAt(0).toUpperCase()}</div>`;
}

}

function openAccountInfo(section="profile"){
closeAccountPanel();

if(!currentAuthUser){
    showToast("Please sign in first.");
    return;
}

const overlay = $("accountPageOverlay");
const title = $("accountPageTitle");
const email = $("accountPageEmail");
const content = $("accountPageContent");

if(!overlay || !title || !email || !content) return;

renderAccountPageAvatar(currentAuthUser);

email.textContent = currentAuthUser.email || "";

$("accountPageFriends").textContent = "0";
$("accountPageFollowers").textContent = "0";
$("accountPageFollowing").textContent = "0";

const name = getUserDisplayName(currentAuthUser);

if(section === "profile"){
    title.textContent = name;
    content.innerHTML =
        `<strong>👤 Your profile</strong><br><span>Welcome to your Worth It profile. Your account is connected and ready for the social features.</span>`;

}else if(section === "friends"){
    title.textContent = "Friends";
    content.innerHTML =
        `<strong>🤝 No friends yet</strong><br><span>Your friends list is empty. Friends will appear here once you add people.</span>`;

}else if(section === "followers"){
    title.textContent = "Followers";
    content.innerHTML =
        `<strong>👥 No followers yet</strong><br><span>People who follow your profile will appear here.</span>`;

}else if(section === "following"){
    title.textContent = "Following";
    content.innerHTML =
        `<strong>➕ Not following anyone yet</strong><br><span>Profiles you follow will appear here.</span>`;

}else{
    title.textContent = name;
    content.innerHTML =
        `<strong>👤 Your profile</strong><br><span>Your profile is ready.</span>`;
}

overlay.classList.add("open");

}

window.closeAccountPage = closeAccountPage;
window.handleAuthButton = handleAuthButton;
window.signOutUser = signOutUser;
window.openAccountInfo = openAccountInfo;

supabaseClient.auth.onAuthStateChange((event, session)=>{
updateAuthUI(session?.user || null);
});

(async function initializeSupabaseAuth(){
const { data, error } = await supabaseClient.auth.getSession();

if(error){
    console.error("Supabase session error:", error);
    return;
}

updateAuthUI(data.session?.user || null);

})();

document.addEventListener("click", (event)=>{
const wrap = $("authWrap");

if(wrap && !wrap.contains(event.target)){
    closeAccountPanel();
}

});

$("accountPageOverlay")?.addEventListener("click", (event)=>{
if(event.target === event.currentTarget){
closeAccountPage();
}
});

document.addEventListener("keydown", (event)=>{
if(event.key === "Escape"){
closeAccountPage();
}
});
