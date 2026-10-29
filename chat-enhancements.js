/* Worth It Chat enhancements: searchable history, voice notes, mobile reply gestures and friend-only WebRTC calls. */
(function () {
"use strict";
const $ = id => document.getElementById(id);
const GLOBAL_CHAT_ID = "00000000-0000-4000-8000-000000000001";
const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const CALL_TICK_MS = 1400;
const INCOMING_TICK_MS = 5000;
const $client = () => window.supabaseClient || null;
let currentContext = null;
let searchSequence = 0;
let searchTimer = null;
let searchResults = [];
let incomingPollBusy = false;
let incomingCall = null;
let activeCall = null;
let callPollTimer = null;
let incomingCallTimer = null;
let callPeer = null;
let localStream = null;
let remoteStream = null;
let lastRemoteSignalId = 0;
let remoteCandidatesPending = [];
let queuedCandidates = [];
let answerApplied = false;
let audioMuted = false;
let cameraDisabled = false;
let audioRecorder = null;
let audioRecorderStream = null;
let audioChunks = [];
let audioRecordingStartedAt = 0;
let audioLimitTimer = null;
let audioRecordStatusTimer = null;

function context() {
    return typeof window.getWorthItChatEnhancementContext === "function"
        ? window.getWorthItChatEnhancementContext() : null;
}
function rpc(name, args) {
    const client = $client();
    if (!client || typeof client.rpc !== "function") throw new Error("Sign in to use Worth It Chat.");
    return client.rpc(name, args);
}
function status(message, isError) {
    const node = $("worthItChatStatus");
    if (node) {
        node.textContent = message || "";
        node.classList.toggle("is-error", Boolean(message && isError));
    }
}
window.worthItChatPlayVoiceMessage = playPrivateVoiceMessage;

function updateEnhancementContext(next) {
    currentContext = next || context();
    const direct = Boolean(currentContext?.userId && currentContext?.conversationType === "direct"
        && currentContext?.isFriend && currentContext?.conversationId);
    ["worthItChatAudioCallBtn", "worthItChatVideoCallBtn"].forEach(id => {
        const button = $(id);
        if (button) button.hidden = !direct;
    });
    const searchButton = $("worthItChatMessageSearchBtn");
    if (searchButton) searchButton.hidden = !currentContext?.userId || !currentContext?.conversationType;
    const panel = $("worthItChatSearchPanel");
    if (panel && panel.dataset.conversationKey !== String(currentContext?.conversationId || GLOBAL_CHAT_ID)) {
        panel.dataset.conversationKey = String(currentContext?.conversationId || GLOBAL_CHAT_ID);
        clearSearchResults();
    }
}
window.addEventListener("worthitchatcontextchange", event => updateEnhancementContext(event?.detail || context()));

function clearSearchResults() {
    const list = $("worthItChatSearchResults");
    const statusNode = $("worthItChatSearchStatus");
    if (list) { list.replaceChildren(); list.hidden = true; }
    if (statusNode) { statusNode.textContent = ""; statusNode.hidden = true; }
    searchResults = [];
    searchSequence++;
}
function toggleSearch(open) {
    const panel = $("worthItChatSearchPanel");
    const button = $("worthItChatMessageSearchBtn");
    if (!panel) return;
    const show = typeof open === "boolean" ? open : panel.hidden;
    panel.hidden = !show;
    button?.setAttribute("aria-expanded", String(show));
    if (show) {
        const input = $("worthItChatMessageSearchInput");
        if (input) { input.value = ""; input.focus(); }
        clearSearchResults();
    } else clearSearchResults();
}
function renderSearchResults(rows, query) {
    const list = $("worthItChatSearchResults");
    const statusNode = $("worthItChatSearchStatus");
    if (!list || !statusNode) return;
    list.replaceChildren();
    searchResults = rows;
    statusNode.hidden = false;
    list.hidden = !rows.length;
    if (!rows.length) {
        statusNode.textContent = 'No messages begin with "' + query + '".';
        return;
    }
    statusNode.textContent = rows.length + (rows.length === 100 ? "+ matches" : rows.length === 1 ? " match" : " matches") + ' beginning with "' + query + '".';
    for (const message of rows) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "worth-it-chat-search-result";
        const title = document.createElement("span");
        title.className = "worth-it-chat-search-result-author";
        title.textContent = (message.display_name || message.username || "Worth It member") + " · " + new Date(message.created_at).toLocaleString();
        const body = document.createElement("span");
        body.className = "worth-it-chat-search-result-body";
        body.textContent = message.body || (message.media_type === "audio" ? "🎙 Voice message" : message.media_type ? "Shared " + message.media_type : "Message");
        button.append(title, body);
        button.addEventListener("click", () => {
            const ctx = context();
            if (!ctx || String(ctx.conversationId || GLOBAL_CHAT_ID) !== String(currentContext?.conversationId || GLOBAL_CHAT_ID)) return;
            if (typeof window.worthItChatShowSearchResult === "function") window.worthItChatShowSearchResult(message);
            toggleSearch(false);
        });
        list.appendChild(button);
    }
}
async function runMessageSearch() {
    const input = $("worthItChatMessageSearchInput");
    const statusNode = $("worthItChatSearchStatus");
    const list = $("worthItChatSearchResults");
    const query = String(input?.value || "").trim();
    if (!statusNode || !list) return;
    const request = ++searchSequence;
    const ctx = context();
    if (!ctx?.userId) { statusNode.hidden = false; statusNode.textContent = "Sign in to search messages."; list.hidden = true; return; }
    if (query.length < 2) {
        list.replaceChildren();
        list.hidden = true;
        statusNode.textContent = query ? "Type at least 2 characters to search this conversation." : "";
        statusNode.hidden = !query;
        return;
    }
    statusNode.hidden = false;
    statusNode.textContent = "Searching this conversation…";
    list.replaceChildren();
    list.hidden = true;
    try {
        const result = await rpc("search_worth_it_chat_messages", {
            p_conversation_id: ctx.conversationId || GLOBAL_CHAT_ID,
            p_query: query,
            p_limit: 100
        });
        if (request !== searchSequence) return;
        if (result.error) throw result.error;
        if (result.data && !Array.isArray(result.data) && result.data.success === false) {
            throw new Error(result.data.code || "Message search is unavailable.");
        }
        renderSearchResults(Array.isArray(result.data) ? result.data : [], query);
    } catch (error) {
        if (request !== searchSequence) return;
        list.hidden = true;
        statusNode.hidden = false;
        statusNode.textContent = error?.message || "Could not search this conversation.";
    }
}
function scheduleMessageSearch() {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { void runMessageSearch(); }, 260);
}

function parsePrivateAudioReference(marker) {
    const match = String(marker || "").match(/^worthit-audio:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+)$/i);
    return match ? { conversationId: match[1], path: match[2] } : null;
}
async function loadPrivateVoiceUrl(marker) {
    const ref = parsePrivateAudioReference(marker);
    if (!ref) throw new Error("This voice message reference is invalid.");
    const ctx = context();
    if (!ctx?.userId) throw new Error("Sign in again to play this voice message.");
    if (String(ctx.conversationId || GLOBAL_CHAT_ID) !== ref.conversationId) throw new Error("Open the conversation containing this voice message first.");
    const auth = await $client().auth.getSession();
    const token = auth?.data?.session?.access_token;
    if (!token || auth?.data?.session?.user?.id !== ctx.userId) throw new Error("Your session has expired. Sign in again.");
    const params = new URLSearchParams({ conversation_id: ref.conversationId, path: ref.path });
    const response = await fetch("/api/chat-audio?" + params.toString(), {
        headers: { Authorization: "Bearer " + token },
        credentials: "same-origin",
        cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.error || "Could not open this voice message.");
    return payload.url;
}
async function playPrivateVoiceMessage(button, audio, marker) {
    if (button.disabled) return;
    if (audio.src) {
        audio.hidden = false;
        try { await audio.play(); } catch (_) {}
        return;
    }
    button.disabled = true;
    button.textContent = "Loading voice message…";
    try {
        audio.src = await loadPrivateVoiceUrl(marker);
        audio.hidden = false;
        button.hidden = true;
        await audio.play().catch(() => {});
    } catch (error) {
        button.disabled = false;
        button.textContent = "▶ Try voice message again";
        status(error?.message || "Could not play this voice message.", true);
    }
}

async function getAuthToken() {
    const client = $client();
    if (!client) throw new Error("Sign in to use calls.");
    const result = await client.auth.getSession();
    const token = result?.data?.session?.access_token;
    const ctx = context();
    if (result?.error || !token || result?.data?.session?.user?.id !== ctx?.userId) {
        throw new Error("Your session has expired. Sign in again.");
    }
    return token;
}
function showCallOverlay(show) {
    const overlay = $("worthItChatCallOverlay");
    if (overlay) {
        overlay.hidden = !show;
        overlay.setAttribute("aria-hidden", String(!show));
    }
}
function setCallStatus(title, detail) {
    const titleNode = $("worthItChatCallTitle");
    const statusNode = $("worthItChatCallStatus");
    if (titleNode) titleNode.textContent = title || "Worth It Call";
    if (statusNode) statusNode.textContent = detail || "";
}
function setCallMode(type) {
    const overlay = $("worthItChatCallOverlay");
    overlay?.classList.toggle("is-video-call", type === "video");
    const remoteVideo = $("worthItChatRemoteVideo");
    const localVideo = $("worthItChatLocalVideo");
    const audioOnly = type !== "video";
    if (remoteVideo) remoteVideo.hidden = audioOnly;
    if (localVideo) localVideo.hidden = audioOnly;
    const toggleCamera = $("worthItChatCallCameraBtn");
    if (toggleCamera) toggleCamera.hidden = audioOnly;
}
function openCallWindow(title, detail, type) {
    setCallStatus(title, detail);
    setCallMode(type);
    showCallOverlay(true);
}
function showIncomingCall(call) {
    incomingCall = call;
    openCallWindow((call.caller_name || "Worth It friend") + " is calling", call.call_type === "video" ? "Incoming video call" : "Incoming voice call", call.call_type);
    $("worthItChatCallAcceptBtn").hidden = false;
    $("worthItChatCallRejectBtn").hidden = false;
    $("worthItChatCallEndBtn").hidden = true;
    $("worthItChatCallMuteBtn").hidden = true;
    $("worthItChatCallCameraBtn").hidden = true;
}
function setLiveCallControls(isIncoming) {
    $("worthItChatCallAcceptBtn").hidden = true;
    $("worthItChatCallRejectBtn").hidden = true;
    $("worthItChatCallEndBtn").hidden = false;
    $("worthItChatCallMuteBtn").hidden = false;
    $("worthItChatCallCameraBtn").hidden = activeCall?.type !== "video";
    if (!isIncoming) $("worthItChatCallMuteBtn").hidden = false;
}
function stopCallMedia() {
    if (callPollTimer) window.clearInterval(callPollTimer);
    callPollTimer = null;
    if (callPeer) {
        try { callPeer.onicecandidate = null; callPeer.ontrack = null; callPeer.close(); } catch (_) {}
    }
    callPeer = null;
    for (const stream of [localStream, remoteStream]) {
        try { stream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
    }
    localStream = null;
    remoteStream = null;
    queuedCandidates = [];
    remoteCandidatesPending = [];
    answerApplied = false;
    lastRemoteSignalId = 0;
    audioMuted = false;
    cameraDisabled = false;
    const remoteVideo = $("worthItChatRemoteVideo");
    const localVideo = $("worthItChatLocalVideo");
    const remoteAudio = $("worthItChatRemoteAudio");
    if (remoteVideo) { remoteVideo.srcObject = null; remoteVideo.hidden = true; }
    if (localVideo) { localVideo.srcObject = null; localVideo.hidden = true; }
    if (remoteAudio) remoteAudio.srcObject = null;
    const mute = $("worthItChatCallMuteBtn");
    if (mute) { mute.textContent = "🎙 Mute"; mute.setAttribute("aria-pressed", "false"); }
    const camera = $("worthItChatCallCameraBtn");
    if (camera) { camera.textContent = "📷 Camera off"; camera.setAttribute("aria-pressed", "false"); }
}
function endLocalCall(message) {
    stopCallMedia();
    activeCall = null;
    incomingCall = null;
    setCallStatus("Call ended", message || "");
    setLiveCallControls(false);
    $("worthItChatCallAcceptBtn").hidden = true;
    $("worthItChatCallRejectBtn").hidden = true;
    $("worthItChatCallEndBtn").hidden = true;
    $("worthItChatCallMuteBtn").hidden = true;
    $("worthItChatCallCameraBtn").hidden = true;
    if (incomingCallTimer) window.clearTimeout(incomingCallTimer);
    incomingCallTimer = window.setTimeout(() => showCallOverlay(false), 1800);
}
async function closeCallOnServer(action) {
    const callId = activeCall?.id || incomingCall?.id;
    if (!callId) return;
    try { await rpc("respond_worth_it_chat_call", { p_call_id: callId, p_action: action, p_answer: null }); }
    catch (_) {}
}
function bindPeerToStream(stream) {
    localStream = stream;
    if (activeCall?.type === "video" && $("worthItChatLocalVideo")) {
        $("worthItChatLocalVideo").srcObject = stream;
        $("worthItChatLocalVideo").muted = true;
        $("worthItChatLocalVideo").playsInline = true;
        $("worthItChatLocalVideo").hidden = false;
        void $("worthItChatLocalVideo").play().catch(() => {});
    }
}
function makePeerConnection() {
    callPeer = new RTCPeerConnection(RTC_CONFIG);
    if (localStream) localStream.getTracks().forEach(track => callPeer.addTrack(track, localStream));
    callPeer.onicecandidate = event => {
        if (!event.candidate) return;
        const candidate = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
        if (!activeCall?.id) queuedCandidates.push(candidate);
        else void sendCallCandidate(candidate);
    };
    callPeer.ontrack = event => {
        remoteStream = event.streams?.[0] || remoteStream || new MediaStream();
        if (!event.streams?.[0]) remoteStream.addTrack(event.track);
        if (activeCall?.type === "video") {
            const video = $("worthItChatRemoteVideo");
            if (video) {
                video.srcObject = remoteStream;
                video.hidden = false;
                video.playsInline = true;
                void video.play().catch(() => {});
            }
        } else {
            const audio = $("worthItChatRemoteAudio");
            if (audio) {
                audio.srcObject = remoteStream;
                void audio.play().catch(() => {});
            }
        }
        setCallStatus(activeCall?.peerName || "Connected", "Connected securely through your browser. Use End call to finish.");
    };
    callPeer.onconnectionstatechange = () => {
        if (!callPeer) return;
        if (["failed", "disconnected"].includes(callPeer.connectionState)) {
            setCallStatus(activeCall?.peerName || "Worth It Call", "Connection is unstable. Trying to reconnect…");
        } else if (callPeer.connectionState === "connected") {
            setCallStatus(activeCall?.peerName || "Connected", activeCall?.type === "video" ? "Video call connected" : "Voice call connected");
        }
    };
}
async function sendCallCandidate(candidate) {
    if (!activeCall?.id) { queuedCandidates.push(candidate); return; }
    const result = await rpc("send_worth_it_chat_call_signal", {
        p_call_id: activeCall.id, p_signal_type: "candidate", p_payload: candidate
    });
    if (result.error || result.data?.success === false) {
        console.warn("Worth It call ICE candidate could not be sent.", result.error || result.data?.code);
    }
}
async function flushQueuedCandidates() {
    const candidates = queuedCandidates.splice(0);
    for (const candidate of candidates) await sendCallCandidate(candidate);
}
async function applyRemoteCandidates(signals) {
    for (const signal of signals || []) {
        const id = Number(signal.id);
        if (Number.isFinite(id)) lastRemoteSignalId = Math.max(lastRemoteSignalId, id);
        if (signal.signal_type !== "candidate" || !signal.payload) continue;
        if (!callPeer?.remoteDescription) remoteCandidatesPending.push(signal.payload);
        else {
            try { await callPeer.addIceCandidate(new RTCIceCandidate(signal.payload)); }
            catch (error) { console.warn("Worth It call candidate was ignored.", error); }
        }
    }
}
async function flushRemoteCandidates() {
    if (!callPeer?.remoteDescription || !remoteCandidatesPending.length) return;
    const candidates = remoteCandidatesPending.splice(0);
    for (const candidate of candidates) {
        try { await callPeer.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (error) { console.warn("Worth It queued ICE candidate was ignored.", error); }
    }
}
function startCallPolling() {
    if (callPollTimer) window.clearInterval(callPollTimer);
    callPollTimer = window.setInterval(() => { void pollCallState(); }, CALL_TICK_MS);
}
async function pollCallState() {
    if (!activeCall?.id) return;
    const call = activeCall;
    try {
        const result = await rpc("get_worth_it_chat_call_state", {
            p_call_id: call.id, p_after_signal_id: lastRemoteSignalId
        });
        if (result.error) throw result.error;
        const state = result.data;
        if (!state?.success) {
            endLocalCall(state?.code === "FRIENDS_ONLY" ? "Calls are available only while you are friends." : "This call is no longer available.");
            return;
        }
        if (call.role === "caller" && state.status === "accepted" && state.answer && !answerApplied) {
            await callPeer.setRemoteDescription(new RTCSessionDescription(state.answer));
            answerApplied = true;
            await flushRemoteCandidates();
            setCallStatus(call.peerName, "Connecting…");
        }
        await applyRemoteCandidates(state.signals);
        if (["rejected", "ended", "missed", "failed"].includes(state.status)) {
            endLocalCall(state.status === "rejected" ? "The call was declined." : state.status === "missed" ? "No answer." : "The call has ended.");
        }
    } catch (error) {
        console.warn("Worth It call polling failed.", error);
    }
}
async function startCall(type) {
    const ctx = context();
    if (!ctx?.userId || ctx.conversationType !== "direct" || !ctx.isFriend || !ctx.conversationId) {
        status("Calls are available only in a private chat with an accepted friend.", true);
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        status("This browser does not support voice/video calls. Try an up-to-date browser over HTTPS.", true);
        return;
    }
    if (activeCall || incomingCall) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
        bindPeerToStream(localStream);
        activeCall = { id: null, role: "caller", type, conversationId: ctx.conversationId, peerName: ctx.title || "Worth It friend" };
        makePeerConnection();
        const offer = await callPeer.createOffer();
        await callPeer.setLocalDescription(offer);
        openCallWindow("Calling " + (ctx.title || "your friend") + "…", type === "video" ? "Starting video call…" : "Starting voice call…", type);
        setLiveCallControls(false);
        const result = await rpc("start_worth_it_chat_call", {
            p_conversation_id: ctx.conversationId, p_call_type: type,
            p_offer: callPeer.localDescription.toJSON ? callPeer.localDescription.toJSON() : callPeer.localDescription
        });
        if (result.error) throw result.error;
        if (!result.data?.success || !result.data.call_id) {
            throw new Error(result.data?.code === "CALL_ALREADY_ACTIVE" ? "One of you is already in a call." :
                result.data?.code === "FRIENDS_ONLY" ? "Calls are available only while you are friends." :
                "Could not start this call.");
        }
        activeCall.id = result.data.call_id;
        setCallStatus("Calling " + (ctx.title || "your friend") + "…", "Waiting for them to answer.");
        await flushQueuedCandidates();
        startCallPolling();
    } catch (error) {
        if (activeCall?.id) await closeCallOnServer("end");
        stopCallMedia();
        activeCall = null;
        incomingCall = null;
        showCallOverlay(false);
        status(error?.message || "Could not start the call. Check microphone/camera permissions and try again.", true);
    }
}
async function acceptCall() {
    if (!incomingCall || activeCall) return;
    const call = incomingCall;
    const type = call.call_type;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        setCallStatus("Calls are not supported", "Use an up-to-date browser with microphone/camera permissions over HTTPS.");
        return;
    }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
        activeCall = {
            id: call.id, role: "callee", type, conversationId: call.conversation_id,
            peerName: call.caller_name || "Worth It friend"
        };
        incomingCall = null;
        bindPeerToStream(localStream);
        makePeerConnection();
        await callPeer.setRemoteDescription(new RTCSessionDescription(call.offer));
        await flushRemoteCandidates();
        const answer = await callPeer.createAnswer();
        await callPeer.setLocalDescription(answer);
        const accepted = await rpc("respond_worth_it_chat_call", {
            p_call_id: call.id, p_action: "accept",
            p_answer: callPeer.localDescription.toJSON ? callPeer.localDescription.toJSON() : callPeer.localDescription
        });
        if (accepted.error || !accepted.data?.success) throw accepted.error || new Error(accepted.data?.code || "Could not accept the call.");
        setLiveCallControls(true);
        setCallStatus(activeCall.peerName, "Connecting…");
        await flushQueuedCandidates();
        startCallPolling();
    } catch (error) {
        await closeCallOnServer("reject");
        stopCallMedia();
        activeCall = null;
        incomingCall = null;
        setCallStatus("Could not join the call", error?.message || "Check browser permissions and try again.");
        $("worthItChatCallAcceptBtn").hidden = true;
        $("worthItChatCallRejectBtn").hidden = true;
        $("worthItChatCallEndBtn").hidden = false;
        $("worthItChatCallMuteBtn").hidden = true;
        $("worthItChatCallCameraBtn").hidden = true;
    }
}
async function rejectCall() {
    if (incomingCall?.id) {
        try { await rpc("respond_worth_it_chat_call", { p_call_id: incomingCall.id, p_action: "reject", p_answer: null }); }
        catch (_) {}
    }
    endLocalCall("You declined the call.");
}
async function endCall() {
    await closeCallOnServer("end");
    endLocalCall("Call ended.");
}
async function pollIncomingCall() {
    // Poll while the tab is visible; visibilitychange checks again on return.
    if (document.hidden || incomingPollBusy || activeCall || !context()?.userId) return;
    incomingPollBusy = true;
    try {
        const result = await rpc("get_worth_it_incoming_chat_call", {});
        if (result.error || !result.data?.success) return;
        const call = result.data.call;
        if (!call) {
            if (incomingCall && !activeCall) {
                incomingCall = null;
                showCallOverlay(false);
            }
            return;
        }
        if (String(call.caller_user_id) === String(context()?.userId)) return;
        if (incomingCall?.id === call.id || activeCall?.id === call.id) return;
        showIncomingCall(call);
    } catch (error) {
        // Calls are optional when the migration is not installed; keep chat usable.
        if (!window.__worthItCallSetupWarningShown) {
            window.__worthItCallSetupWarningShown = true;
            console.info("Worth It calls will be available after the chat-call SQL update is applied.", error);
        }
    } finally {
        incomingPollBusy = false;
    }
}
function toggleMicrophone() {
    if (!localStream) return;
    audioMuted = !audioMuted;
    localStream.getAudioTracks().forEach(track => { track.enabled = !audioMuted; });
    const button = $("worthItChatCallMuteBtn");
    if (button) { button.textContent = audioMuted ? "🔇 Unmute" : "🎙 Mute"; button.setAttribute("aria-pressed", String(audioMuted)); }
}
function toggleCamera() {
    if (!localStream) return;
    cameraDisabled = !cameraDisabled;
    localStream.getVideoTracks().forEach(track => { track.enabled = !cameraDisabled; });
    const button = $("worthItChatCallCameraBtn");
    if (button) { button.textContent = cameraDisabled ? "📷 Camera on" : "📷 Camera off"; button.setAttribute("aria-pressed", String(cameraDisabled)); }
}
function recordingExtension(mime) {
    const type = String(mime || "").split(";")[0].toLowerCase();
    return type === "audio/ogg" ? "ogg" : type === "audio/mp4" ? "m4a" :
        type === "audio/mpeg" ? "mp3" : type === "audio/wav" || type === "audio/x-wav" ? "wav" : "webm";
}
function setVoiceButtonRecording(recording) {
    const button = $("worthItChatVoiceBtn");
    if (!button) return;
    button.classList.toggle("is-recording", recording);
    button.setAttribute("aria-label", recording ? "Stop voice recording" : "Record a voice message");
    button.setAttribute("aria-pressed", String(recording));
    button.title = recording ? "Stop recording (maximum 2 minutes)" : "Record a voice message";
}
async function startVoiceRecording() {
    const ctx = context();
    if (!ctx?.userId) { status("Sign in to send voice messages.", true); return; }
    if (!ctx?.conversationType) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        status("Voice recording is not supported by this browser.", true); return;
    }
    if (audioRecorder) { stopVoiceRecording(); return; }
    try {
        audioRecorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = ["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4","audio/webm","audio/ogg"]
            .find(type => MediaRecorder.isTypeSupported?.(type));
        audioRecorder = mime ? new MediaRecorder(audioRecorderStream, { mimeType: mime }) : new MediaRecorder(audioRecorderStream);
        audioChunks = [];
        audioRecorder.ondataavailable = event => { if (event.data?.size) audioChunks.push(event.data); };
        audioRecorder.onerror = () => {
            stopVoiceRecordingResources();
            status("Voice recording stopped because the browser reported an error.", true);
        };
        audioRecorder.onstop = () => {
            const recorder = audioRecorder;
            const blob = new Blob(audioChunks, { type: recorder?.mimeType || mime || "audio/webm" });
            stopVoiceRecordingResources();
            if (!blob.size) { status("The recording was empty. Please try again.", true); return; }
            if (blob.size > 10 * 1024 * 1024) { status("Voice messages must be 10 MB or smaller.", true); return; }
            const file = new File([blob], "voice-message-" + Date.now() + "." + recordingExtension(blob.type), { type: blob.type });
            if (typeof window.worthItChatAttachRecordedAudio === "function") {
                window.worthItChatAttachRecordedAudio(file);
                status("Voice message ready. Preview it, then press Send to share it.", false);
            }
        };
        audioRecorder.start(1000);
        audioRecordingStartedAt = Date.now();
        setVoiceButtonRecording(true);
        status("Recording voice message… Tap the microphone again to stop (max 2 minutes).", false);
        audioLimitTimer = window.setTimeout(() => stopVoiceRecording(), 120000);
    } catch (error) {
        stopVoiceRecordingResources();
        status(error?.name === "NotAllowedError" ? "Allow microphone access in your browser to record a voice message." :
            "Could not start recording. Check microphone permissions and try again.", true);
    }
}
function stopVoiceRecording() {
    if (audioLimitTimer) window.clearTimeout(audioLimitTimer);
    audioLimitTimer = null;
    if (audioRecorder && audioRecorder.state !== "inactive") {
        try { audioRecorder.stop(); } catch (_) { stopVoiceRecordingResources(); }
    } else stopVoiceRecordingResources();
}
function stopVoiceRecordingResources() {
    setVoiceButtonRecording(false);
    try { audioRecorderStream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
    audioRecorderStream = null;
    audioRecorder = null;
    audioChunks = [];
    audioRecordingStartedAt = 0;
    if (audioLimitTimer) window.clearTimeout(audioLimitTimer);
    audioLimitTimer = null;
    if (audioRecordStatusTimer) window.clearInterval(audioRecordStatusTimer);
    audioRecordStatusTimer = null;
}
function setupSwipeReply() {
    const host = $("worthItChatMessages");
    if (!host) return;
    let start = null;
    host.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" || event.button !== 0) { start = null; return; }
        const row = event.target.closest?.(".worth-it-chat-message[data-message-id]");
        if (!row || event.target.closest("button,a,input,textarea,audio,video")) { start = null; return; }
        start = { x: event.clientX, y: event.clientY, id: row.dataset.messageId, row, moved: false };
    }, { passive: true });
    host.addEventListener("pointermove", event => {
        if (!start || event.pointerType === "mouse") return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.25) {
            start.moved = true;
            start.row.style.setProperty("--worth-it-chat-swipe-x", Math.max(-72, Math.min(72, dx)) + "px");
            start.row.classList.add("is-swipe-tracking");
        }
    }, { passive: true });
    const finish = event => {
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        const message = start.moved && Math.abs(dx) >= 72 && Math.abs(dx) > Math.abs(dy) * 1.35
            ? start.id : "";
        start.row.style.removeProperty("--worth-it-chat-swipe-x");
        start.row.classList.remove("is-swipe-tracking");
        start = null;
        if (message && typeof window.worthItChatQuoteById === "function") {
            window.worthItChatQuoteById(message);
            const input = $("worthItChatInput");
            input?.focus({ preventScroll: true });
        }
    };
    host.addEventListener("pointerup", finish, { passive: true });
    host.addEventListener("pointercancel", event => {
        if (start?.row) {
            start.row.style.removeProperty("--worth-it-chat-swipe-x");
            start.row.classList.remove("is-swipe-tracking");
        }
        start = null;
    }, { passive: true });
}
function setupAudioSearchAndCalls() {
    $("worthItChatMessageSearchBtn")?.addEventListener("click", () => toggleSearch());
    $("worthItChatSearchCloseBtn")?.addEventListener("click", () => toggleSearch(false));
    $("worthItChatMessageSearchInput")?.addEventListener("input", scheduleMessageSearch);
    $("worthItChatMessageSearchForm")?.addEventListener("submit", event => { event.preventDefault(); if (searchTimer) window.clearTimeout(searchTimer); void runMessageSearch(); });
    $("worthItChatAudioCallBtn")?.addEventListener("click", () => void startCall("audio"));
    $("worthItChatVideoCallBtn")?.addEventListener("click", () => void startCall("video"));
    $("worthItChatCallAcceptBtn")?.addEventListener("click", () => void acceptCall());
    $("worthItChatCallRejectBtn")?.addEventListener("click", () => void rejectCall());
    $("worthItChatCallEndBtn")?.addEventListener("click", () => void endCall());
    $("worthItChatCallMuteBtn")?.addEventListener("click", toggleMicrophone);
    $("worthItChatCallCameraBtn")?.addEventListener("click", toggleCamera);
    $("worthItChatVoiceBtn")?.addEventListener("click", () => void startVoiceRecording());
    $("worthItChatVoiceCancelBtn")?.addEventListener("click", () => stopVoiceRecording());
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void pollIncomingCall();
    });
    updateEnhancementContext();
    setupSwipeReply();
    if (incomingCallTimer) window.clearInterval(incomingCallTimer);
    incomingCallTimer = window.setInterval(() => { void pollIncomingCall(); }, INCOMING_TICK_MS);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupAudioSearchAndCalls, { once: true });
else setupAudioSearchAndCalls();
})();
