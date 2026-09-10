/* =========================================================
   WORTH IT AI CHAT - FRONTEND
========================================================= */

let aiChatHistory = [];
let aiChatBusy = false;

function openAIChat(){
    const overlay = $("aiChatOverlay");

    if(!overlay) return;

    overlay.classList.add("open");
    updateAIChatView();

    setTimeout(() => {
        $("aiChatInput")?.focus();
    }, 50);
}

function closeAIChat(){
    $("aiChatOverlay")?.classList.remove("open");
}

function updateAIChatView(){
    const loginView = $("aiChatLoginView");
    const appView = $("aiChatAppView");

    if(!loginView || !appView) return;

    if(currentAuthUser){
        loginView.style.display = "none";
        appView.style.display = "flex";
    }else{
        loginView.style.display = "flex";
        appView.style.display = "none";
    }
}

async function signInForAIChat(){
    try{
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/`
            }
        });

        if(error){
            console.error(
                "AI Chat Google sign-in error:",
                error
            );

            showToast("Could not start Google sign-in.");
        }

    }catch(error){
        console.error(
            "AI Chat sign-in error:",
            error
        );

        showToast("Could not start Google sign-in.");
    }
}

function addAIChatMessage(role, content, meta = ""){
    const messages = $("aiChatMessages");

    if(!messages) return;

    $("aiChatEmpty")?.remove();

    const wrapper = document.createElement("div");
    wrapper.className = `ai-chat-message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "ai-chat-bubble";
    bubble.textContent = content;

    const metaEl = document.createElement("div");
    metaEl.className = "ai-chat-meta";
    metaEl.textContent =
        meta || (
            role === "user"
                ? "You"
                : "Worth It AI"
        );

    wrapper.appendChild(bubble);
    wrapper.appendChild(metaEl);

    messages.appendChild(wrapper);

    messages.scrollTop = messages.scrollHeight;
}

function setAIChatStatus(text = ""){
    const el = $("aiChatStatus");

    if(el){
        el.textContent = text;
    }
}

async function sendAIChatMessage(){
    if(aiChatBusy) return;

    if(!currentAuthUser){
        updateAIChatView();
        return;
    }

    const input = $("aiChatInput");
    const sendBtn = $("aiChatSendBtn");
    const text = (input?.value || "").trim();

    if(!text) return;

    if(text.length > 1200){
        showToast("Message is limited to 1200 characters.");
        return;
    }

    const previousHistory = aiChatHistory.slice();

    addAIChatMessage(
        "user",
        text,
        "You"
    );

    aiChatHistory.push({
        role: "user",
        content: text
    });

    if(input){
        input.value = "";
    }

    aiChatBusy = true;

    if(sendBtn){
        sendBtn.disabled = true;
    }

    setAIChatStatus(
        "Worth It AI is thinking…"
    );

    try{
        const {
            data,
            error
        } = await supabaseClient.auth.getSession();

        if(
            error ||
            !data?.session?.access_token
        ){
            throw new Error(
                "Your login session is unavailable. Please sign in again."
            );
        }

        const response = await fetch(
            "/api/ai-chat",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${data.session.access_token}`
                },

                body: JSON.stringify({
                    message: text,
                    history: previousHistory.slice(-8),
                    page: location.pathname
                })
            }
        );

        const result =
            await response
                .json()
                .catch(() => ({}));

        if(!response.ok){
            throw new Error(
                result?.error ||
                `AI request failed (${response.status}).`
            );
        }

        const answer =
            String(
                result?.answer || ""
            ).trim();

        if(!answer){
            throw new Error(
                "The AI returned an empty response."
            );
        }

        const providerLabel =
            result.provider === "grok"
                ? "Worth It AI · backup"
                : result.provider === "gemini"
                    ? "Worth It AI · Gemini"
                    : "Worth It AI";

        addAIChatMessage(
            "assistant",
            answer,
            providerLabel
        );

        aiChatHistory.push({
            role: "assistant",
            content: answer
        });

        setAIChatStatus("");

    }catch(error){

        console.error(
            "Worth It AI error:",
            error
        );

        aiChatHistory = previousHistory;

        addAIChatMessage(
            "assistant",
            error?.message ||
            "Could not reach Worth It AI. Please try again.",
            "Worth It AI"
        );

        setAIChatStatus("");

    }finally{

        aiChatBusy = false;

        if(sendBtn){
            sendBtn.disabled = false;
        }

        if(input){
            input.focus();
        }
    }
}

/* =========================================================
   AI CHAT EVENTS
========================================================= */

$("aiChatInput")?.addEventListener(
    "keydown",
    event => {

        if(
            event.key === "Enter" &&
            !event.shiftKey
        ){
            event.preventDefault();
            sendAIChatMessage();
        }
    }
);

$("aiChatOverlay")?.addEventListener(
    "click",
    event => {

        if(
            event.target ===
            event.currentTarget
        ){
            closeAIChat();
        }
    }
);

document.addEventListener(
    "keydown",
    event => {

        if(event.key === "Escape"){
            closeAIChat();
        }
    }
);

/* =========================================================
   KEEP AI CHAT SYNCED WITH AUTH
========================================================= */

const originalUpdateAuthUIForAI =
    window.updateAuthUI;

window.updateAuthUI = function(user){

    if(
        typeof originalUpdateAuthUIForAI ===
        "function"
    ){
        originalUpdateAuthUIForAI(user);
    }

    if(
        typeof updateAIChatView ===
        "function"
    ){
        updateAIChatView();
    }
};
