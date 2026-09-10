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

function escapeAIHtml(text){
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderAIMarkdown(text){
    if(!text){
        return "";
    }

    let source = String(text)
        .replace(/\\\*\*/g, "**")
        .replace(/\\\*/g, "*")
        .replace(/\\\|/g, "|")
        .replace(/\\_/g, "_");

    const lines = source.split(/\r?\n/);
    const output = [];

    let inList = false;
    let listType = "";

    function closeList(){
        if(!inList) return;

        output.push(
            listType === "ol"
                ? "</ol>"
                : "</ul>"
        );

        inList = false;
        listType = "";
    }

    function formatInline(value){
        let html = escapeAIHtml(value);

        html = html.replace(
            /`([^`]+)`/g,
            "<code>$1</code>"
        );

        html = html.replace(
            /\*\*([^*]+)\*\*/g,
            "<strong>$1</strong>"
        );

        html = html.replace(
            /\*([^*]+)\*/g,
            "<em>$1</em>"
        );

        html = html.replace(
            /__([^_]+)__/g,
            "<strong>$1</strong>"
        );

        return html;
    }

    function isTableSeparator(line){
        return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line);
    }

    function parseTableRow(line){
    let value = String(line).trim();

    if(value.startsWith("|")){
        value = value.slice(1);
    }

    if(value.endsWith("|")){
        value = value.slice(0, -1);
    }

    return value
        .split("|")
        .map(cell => cell.trim());
}

    for(let i = 0; i < lines.length; i++){

        const line = lines[i];

        /* TABLE */

        if(
            line.includes("|") &&
            i + 1 < lines.length &&
            isTableSeparator(lines[i + 1])
        ){
            closeList();

            const headers = parseTableRow(line);
            i++;

            const rows = [];

            while(
                i + 1 < lines.length &&
                lines[i + 1].includes("|") &&
                !isTableSeparator(lines[i + 1])
            ){
                i++;

                const row = parseTableRow(lines[i]);

                if(row.length){
                    rows.push(row);
                }
            }

            output.push(
                '<div class="ai-chat-table-wrap">' +
                '<table class="ai-chat-table">' +
                '<thead><tr>' +
                headers
                    .slice(0, 3)
                    .map(
                        cell =>
                            `<th>${formatInline(cell)}</th>`
                    )
                    .join("") +
                "</tr></thead>" +
                "<tbody>" +
                rows
                    .slice(0, 5)
                    .map(row => {

                        const cells = headers
                            .slice(0, 3)
                            .map(
                                (_, index) =>
                                    row[index] || ""
                            );

                        return (
                            "<tr>" +
                            cells
                                .map(
                                    cell =>
                                        `<td>${formatInline(cell)}</td>`
                                )
                                .join("") +
                            "</tr>"
                        );
                    })
                    .join("") +
                "</tbody>" +
                "</table>" +
                "</div>"
            );

            continue;
        }

        /* BULLET LIST */

        const bulletMatch =
            line.match(/^\s*[-*]\s+(.+)$/);

        if(bulletMatch){

            if(!inList || listType !== "ul"){
                closeList();
                output.push("<ul>");
                inList = true;
                listType = "ul";
            }

            output.push(
                `<li>${formatInline(bulletMatch[1])}</li>`
            );

            continue;
        }

        /* NUMBERED LIST */

        const numberMatch =
            line.match(/^\s*\d+\.\s+(.+)$/);

        if(numberMatch){

            if(!inList || listType !== "ol"){
                closeList();
                output.push("<ol>");
                inList = true;
                listType = "ol";
            }

            output.push(
                `<li>${formatInline(numberMatch[1])}</li>`
            );

            continue;
        }

        closeList();

        /* HEADINGS */

        const headingMatch =
            line.match(/^\s*#{1,3}\s+(.+)$/);

        if(headingMatch){
            output.push(
                `<div class="ai-chat-heading">${formatInline(headingMatch[1])}</div>`
            );

            continue;
        }

        /* EMPTY LINE */

        if(!line.trim()){
            output.push("<div class=\"ai-chat-spacer\"></div>");
            continue;
        }

        /* NORMAL TEXT */

        output.push(
            `<div class="ai-chat-line">${formatInline(line)}</div>`
        );
    }

    closeList();

    return output.join("");
}

function addAIChatMessage(role, content, meta = ""){
    const messages = $("aiChatMessages");

    if(!messages) return;

    $("aiChatEmpty")?.remove();

    const wrapper = document.createElement("div");
    wrapper.className = `ai-chat-message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "ai-chat-bubble";
    bubble.innerHTML = renderAIMarkdown(content);

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

    return {
        wrapper,
        bubble,
        metaEl
    };
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

    let assistantMessage = null;
    let streamedAnswer = "";
    let provider = "";

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

        if(!response.ok){
            const result =
                await response
                    .json()
                    .catch(() => ({}));

            throw new Error(
                result?.error ||
                `AI request failed (${response.status}).`
            );
        }

        if(!response.body){
            throw new Error(
                "AI streaming is not available."
            );
        }

        const reader =
            response.body.getReader();

        const decoder =
            new TextDecoder();

        let buffer = "";

        while(true){
            const { value, done } =
                await reader.read();

            if(done) break;

            buffer += decoder.decode(
                value,
                {
                    stream: true
                }
            );

            const events =
                buffer.split("\n\n");

            buffer =
                events.pop() || "";

            for(const event of events){
                const lines =
                    event.split("\n");

                for(const line of lines){
                    if(!line.startsWith("data:")){
                        continue;
                    }

                    const rawData =
                        line.slice(5).trim();

                    if(!rawData){
                        continue;
                    }

                    let data;

                    try{
                        data =
                            JSON.parse(rawData);
                    }catch(error){
                        continue;
                    }

                    if(data.type === "start"){
                        setAIChatStatus(
                            "Worth It AI is thinking…"
                        );

                        continue;
                    }

                    if(data.type === "chunk"){
                        const chunk =
                            typeof data.text === "string"
                                ? data.text
                                : "";

                        if(!chunk){
                            continue;
                        }

                        provider =
                            data.provider || provider;

                        streamedAnswer += chunk;

                        if(!assistantMessage){
                            const providerLabel =
                                provider === "groq"
                                    ? "Worth It AI · backup"
                                    : provider === "gemini"
                                        ? "Worth It AI · Gemini"
                                        : "Worth It AI";

                            assistantMessage =
                                addAIChatMessage(
                                    "assistant",
                                    "",
                                    providerLabel
                                );
                        }

                        assistantMessage.bubble.innerHTML =
                            renderAIMarkdown(streamedAnswer);

                        const messages =
                            $("aiChatMessages");

                        if(messages){
                            messages.scrollTop =
                                messages.scrollHeight;
                        }

                        setAIChatStatus("");
                    }

                    if(data.type === "done"){
                        provider =
                            data.provider ||
                            provider;
                    }

                    if(data.type === "error"){
                        throw new Error(
                            data.error ||
                            "Could not reach Worth It AI. Please try again."
                        );
                    }
                }
            }
        }

        buffer += decoder.decode();

        if(!streamedAnswer.trim()){
            throw new Error(
                "The AI returned an empty response."
            );
        }

        if(assistantMessage){
            const providerLabel =
                provider === "groq"
                    ? "Worth It AI · backup"
                    : provider === "gemini"
                        ? "Worth It AI · Gemini"
                        : "Worth It AI";

            assistantMessage.metaEl.textContent =
                providerLabel;
        }

        aiChatHistory.push({
            role: "assistant",
            content: streamedAnswer
        });

        setAIChatStatus("");

    }catch(error){

        console.error(
            "Worth It AI error:",
            error
        );

        aiChatHistory = previousHistory;

        if(assistantMessage){
            assistantMessage.wrapper.remove();
        }

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
