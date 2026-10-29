/* Worth It Chat: global, friend and group conversations. */
(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const GLOBAL_CHAT_ID = null;
const GLOBAL_TITLE = "Global Chat";
let chatUser = null;
let chatAuthResolutionComplete = Boolean(window.worthItAuthStateResolved);
let chatFriends = [];
let chatConversations = [];
let activeConversationId = GLOBAL_CHAT_ID;
let activeConversationType = "global";
let activeConversationTitle = GLOBAL_TITLE;
let activeConversationPerson = null;
let activeConversationInviteToken = "";
let activeGroupInviteToken = "";
let activeGroupInvitePreview = null;
let chatReturnPath = "/";
let lastOpenedConversation = null;
const worthItChatMessageCache = new Map();
let chatLastForegroundRefreshAt = 0;
let profileReturnConversation = null;
let chatRouteVersion = 0;
let chatRouteAccessDenied = false;
let chatMessages = [];
let chatOpen = false;
let chatLoading = false;
let chatMessageRequestVersion = 0;
let chatSending = false;
let chatLastSentAt = 0;
let chatCooldownTimer = null;
let chatStatusTimer = null;
let chatPollTimer = null;
let chatRefreshToken = 0;
let chatRealtimeChannel = null;
let chatRealtimeTopic = "";
let chatRealtimeSubscribed = false;
let chatRealtimeGeneration = 0;
let chatRealtimeRefreshTimer = null;
let chatRealtimeRetryTimer = null;
let chatLastMessagePollAt = 0;
let chatLastSidebarRefreshAt = 0;
let chatTypingStopTimer = null;
let chatTypingStartTimer = null;
let chatTypingBroadcastTimer = null;
let chatTypingReadyToPublish = false;
const chatTypingBroadcastUsers = new Map();
const chatTypingBroadcastExpiryTimers = new Map();
const CHAT_TYPING_START_DELAY_MS = 1000;
const CHAT_TYPING_BROADCAST_REFRESH_MS = 900;
const CHAT_TYPING_BROADCAST_TTL_MS = 2300;
let chatTypingActive = false;
let chatOwnProfile = null;
let chatOwnProfileLoadedForUser = null;
let chatOwnProfilePromise = null;
const WORTH_IT_GLOBAL_CHAT_REALTIME_ID = "00000000-0000-4000-8000-000000000001";
const WORTH_IT_CHAT_FULLSCREEN_PREFERENCE_KEY = "worth-it-chat-fullscreen-preference-v1";
const WORTH_IT_CHAT_LAST_CONVERSATION_KEY = "worth-it-chat-last-conversation-v1";
let pendingMediaFile = null;
let pendingMediaUrl = "";
let pendingMediaType = "";
let pendingReplyQuote = null;
const worthItChatDrafts = new Map();
let activeChatDraftKey = "";
let pendingFilePickerTarget = null;
let chatNotificationPreferences = Object.create(null);
let chatNotificationPreferencesLoadedForUser = null;
let globalNotificationPreferences = { friend_requests: true, follows: true, private_messages: true, group_chats: true, account_activity: true };
let globalNotificationPreferencesLoadedForUser = null;
const selectedGroupFriendIds = new Set();
let groupCreateInProgress = false;
let activeWorthItChatConversationMenuTrigger = null;
const sb = () => window.supabaseClient || null;
const escapeText = (value) => String(value == null ? "" : value);
function currentBrowserLocation() {
    return window.location.pathname + window.location.search + window.location.hash;
}
function isChatRoutePath(path) {
    return /^\/chat(?:\/|$)/.test(path || window.location.pathname);
}
function parseWorthItChatRoute() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path === "/chat" || path === "/chat/global") return {type:"global"};
    let match = path.match(/^\/chat\/direct\/([1-9][0-9]{0,18})$/);
    if (match) return {type:"direct", worthItId:Number(match[1])};
    match = path.match(/^\/chat\/group\/([0-9a-fA-F]{64})$/);
    if (match) return {type:"group", token:match[1].toLowerCase()};
    return isChatRoutePath(path) ? {type:"invalid"} : null;
}
function worthItChatRouteMatchesActiveConversation(route) {
    if (!route || !chatOpen || chatRouteAccessDenied) return false;
    if (route.type === "global") return activeConversationType === "global";
    if (route.type === "direct") {
        return activeConversationType === "direct" &&
            Boolean(activeConversationId) &&
            String(activeConversationPerson?.worth_it_id || "") === String(route.worthItId);
    }
    if (route.type === "group") {
        return activeConversationType === "group" &&
            Boolean(activeConversationId) &&
            String(activeConversationInviteToken || "").toLowerCase() === route.token;
    }
    return false;
}
function clearLastWorthItChatConversation() {
    lastOpenedConversation = null;
    try { window.sessionStorage.removeItem(WORTH_IT_CHAT_LAST_CONVERSATION_KEY); } catch (_) {}
}
function getLastWorthItChatConversation() {
    if (!chatUser?.id) return null;
    let saved = lastOpenedConversation;
    if (!saved || String(saved.userId || "") !== String(chatUser.id)) {
        try {
            const raw = window.sessionStorage.getItem(WORTH_IT_CHAT_LAST_CONVERSATION_KEY);
            saved = raw ? JSON.parse(raw) : null;
        } catch (_) {
            saved = null;
        }
    }
    if (!saved || String(saved.userId || "") !== String(chatUser.id) ||
        !["global", "direct", "group"].includes(saved.type)) {
        if (saved && String(saved.userId || "") !== String(chatUser.id)) clearLastWorthItChatConversation();
        return null;
    }
    lastOpenedConversation = saved;
    return saved;
}
function rememberLastWorthItChatConversation() {
    if (!chatUser?.id) return;
    const person = activeConversationPerson;
    const saved = {
        userId: String(chatUser.id),
        type: activeConversationType || "global",
        id: activeConversationId || null,
        title: activeConversationTitle || GLOBAL_TITLE,
        inviteToken: String(activeConversationInviteToken || ""),
        person: person ? {
            worth_it_id: person.worth_it_id ?? null,
            display_name: String(person.display_name || ""),
            username: String(person.username || "")
        } : null
    };
    lastOpenedConversation = saved;
    try { window.sessionStorage.setItem(WORTH_IT_CHAT_LAST_CONVERSATION_KEY, JSON.stringify(saved)); } catch (_) {}
}
function worthItChatMessageCacheKey(userId = chatUser?.id, type = activeConversationType, id = activeConversationId) {
    if (!userId) return "";
    const conversationId = type === "global" ? "global" : String(id || "");
    return conversationId ? String(userId) + "|" + String(type || "global") + "|" + conversationId : "";
}
function cacheWorthItChatMessages(key, rows) {
    if (!key) return;
    worthItChatMessageCache.delete(key);
    worthItChatMessageCache.set(key, Array.isArray(rows) ? rows.slice() : []);
    while (worthItChatMessageCache.size > 12) {
        worthItChatMessageCache.delete(worthItChatMessageCache.keys().next().value);
    }
}
function setChatBrowserPath(path, replace) {
    const target = path || "/";
    if (currentBrowserLocation() === target) return;
    window.history[replace ? "replaceState" : "pushState"]({worthItChat:true}, "", target);
}
function syncChatUrlForConversation(type, id, person, inviteToken) {
    let path = "/chat";
    if (type === "direct" && Number.isSafeInteger(Number(person?.worth_it_id)) && Number(person.worth_it_id) > 0) {
        path = "/chat/direct/" + String(person.worth_it_id);
    } else if (type === "group") {
        const token = String(inviteToken || chatConversations.find(item => item.id === id)?.invite_token || "");
        if (/^[0-9a-f]{64}$/.test(token)) path = "/chat/group/" + token;
    }
    const alreadyOnChatRoute = isChatRoutePath(window.location.pathname);
    if (!alreadyOnChatRoute) chatReturnPath = currentBrowserLocation() || "/";
    // Keep a single chat history entry while still changing the URL for each conversation.
    setChatBrowserPath(path, alreadyOnChatRoute);
}
function setStatus(message, isError) {
    const node = $("worthItChatStatus");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", Boolean(message && isError));
}
function showTemporaryChatWarning(message, duration) {
    const node = $("worthItChatStatus");
    if (!node) return;
    if (chatStatusTimer) window.clearTimeout(chatStatusTimer);
    setStatus(message, true);
    chatStatusTimer = window.setTimeout(() => {
        if (node.textContent === message) setStatus("", false);
        chatStatusTimer = null;
    }, Math.max(1500, Number(duration) || 4500));
}
function setGroupStatus(message, isError) {
    const node = $("worthItChatGroupStatus");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", Boolean(message && isError));
}
function getWorthItChatFullscreenPreference() {
    try {
        const preference = window.sessionStorage.getItem(WORTH_IT_CHAT_FULLSCREEN_PREFERENCE_KEY);
        if (preference === "compact") return false;
        if (preference === "fullscreen") return true;
    } catch (_) {
        // Session storage is optional; use the default route behavior when unavailable.
    }
    return null;
}
function setWorthItChatFullscreenPreference(isFullscreen) {
    try {
        window.sessionStorage.setItem(WORTH_IT_CHAT_FULLSCREEN_PREFERENCE_KEY, isFullscreen ? "fullscreen" : "compact");
    } catch (_) {
        // The animation still works when session storage is unavailable.
    }
}
function setWorthItChatFullscreen(enabled, options) {
    const overlay = $("worthItChatOverlay");
    const windowNode = $("worthItChatWindow");
    const button = $("worthItChatFullscreenBtn");
    if (!overlay || !windowNode) return false;

    const isFullscreen = Boolean(enabled);
    overlay.classList.toggle("is-fullscreen", isFullscreen);
    windowNode.classList.toggle("is-fullscreen", isFullscreen);

    if (options?.persist !== false) setWorthItChatFullscreenPreference(isFullscreen);

    if (button) {
        button.setAttribute("aria-pressed", String(isFullscreen));
        button.setAttribute("aria-label", isFullscreen ? "Exit fullscreen chat" : "Expand chat");
        button.title = isFullscreen ? "Exit fullscreen" : "Expand chat";
    }
    return isFullscreen;
}
window.toggleWorthItChatFullscreen = function (event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const overlay = $("worthItChatOverlay");
    if (!overlay || overlay.hidden) return;

    setWorthItChatFullscreen(!overlay.classList.contains("is-fullscreen"));
};
function updateWorthItChatVisualViewport() {
    const overlay = $("worthItChatOverlay");
    const viewport = window.visualViewport;
    const isPhone = window.matchMedia("(max-width: 540px)").matches;
    if (!overlay || !viewport || !isPhone || !chatOpen) {
        if (overlay) {
            overlay.classList.remove("is-visual-viewport-adjusted");
            overlay.style.removeProperty("--worthit-chat-visible-height");
            overlay.style.removeProperty("--worthit-chat-visible-top");
        }
        return;
    }
    // visualViewport.height excludes the on-screen keyboard on mobile browsers.
    overlay.style.setProperty("--worthit-chat-visible-height", Math.max(220, Math.round(viewport.height)) + "px");
    overlay.style.setProperty("--worthit-chat-visible-top", Math.max(0, Math.round(viewport.offsetTop || 0)) + "px");
    overlay.classList.add("is-visual-viewport-adjusted");
}
function showChatOverlay(open, options) {
    const overlay = $("worthItChatOverlay");
    const button = $("worthItChatNavBtn");
    if (!overlay) return;
    const shouldOpen = Boolean(open);
    if (!shouldOpen && chatOpen && !options?.skipRouteSync && isChatRoutePath()) {
        // Closing the chat should not make Back reopen it as a duplicate history entry.
        setChatBrowserPath(chatReturnPath || "/", true);
    }
    if (!shouldOpen && overlay.contains(document.activeElement)) {
        // Move focus before hiding the overlay so no focused control is aria-hidden.
        if (button && !button.hidden && typeof button.focus === "function") {
            button.focus({ preventScroll: true });
        } else {
            document.activeElement?.blur?.();
        }
    }
    chatOpen = shouldOpen;
    overlay.hidden = !chatOpen;
    overlay.setAttribute("aria-hidden", String(!chatOpen));
    button?.setAttribute("aria-expanded", String(chatOpen));
    updateWorthItChatVisualViewport();
    if (chatOpen) {
        document.body.classList.add("worth-it-chat-open");
        // On phones, open the conversation immediately; the list remains one tap away.
        $("worthItChatWindow")?.classList.remove("is-mobile-sidebar");
    } else {
        document.body.classList.remove("worth-it-chat-open");
        $("worthItChatWindow")?.classList.remove("is-mobile-sidebar");
        setWorthItChatFullscreen(false, {persist:false});
        closeWorthItGroupChatDialog();
        closeWorthItGroupInviteDialog();
        if (chatPollTimer) window.clearInterval(chatPollTimer);
        chatPollTimer = null;
        stopWorthItChatRealtimeChannel();
    }
}
function setAuthState(user) {
    chatAuthResolutionComplete = true;
    const previousUserId = chatUser?.id || null;
    const nextUserId = user?.id || null;
    if (previousUserId !== nextUserId) {
        stopWorthItChatRealtimeChannel();
        chatOwnProfile = null;
        chatOwnProfileLoadedForUser = null;
        chatOwnProfilePromise = null;
        worthItChatMessageCache.clear();
        if (previousUserId) clearLastWorthItChatConversation();
    }
    chatUser = user || null;
    if (previousUserId !== (chatUser?.id || null)) clearWorthItChatDrafts();
    if (!chatUser || previousUserId !== chatUser.id) {
        chatMessageRequestVersion += 1;
        chatLoading = false;
        chatNotificationPreferences = Object.create(null);
        chatNotificationPreferencesLoadedForUser = null;
        globalNotificationPreferences = { friend_requests: true, follows: true, private_messages: true, group_chats: true, account_activity: true };
        globalNotificationPreferencesLoadedForUser = null;
    }
    const wrap = $("worthItChatNavWrap");
    if (wrap) wrap.hidden = !chatUser;
    if (!chatUser) {
        chatRefreshToken++;
        chatFriends = [];
        chatConversations = [];
        chatMessages = [];
        pendingMediaFile = null;
        pendingMediaUrl = "";
        pendingMediaType = "";
        pendingReplyQuote = null;
        renderWorthItChatReplyPreview();
        setPendingMedia(null, "", "");
        if (parseWorthItChatRoute()) showChatOverlay(true, {skipRouteSync:true});
        else showChatOverlay(false, {skipRouteSync:true});
        renderFriends();
        renderConversations();
        globalNotificationPreferences = { friend_requests: true, follows: true, private_messages: true, group_chats: true, account_activity: true };
        globalNotificationPreferencesLoadedForUser = null;
        renderMessages();
        updateUnreadBadge();
        updateChatHeaderShareButton();
        if (parseWorthItChatRoute()) routeWorthItChatFromLocation();
    } else {
        updateChatHeaderShareButton();
        const route = parseWorthItChatRoute();
        if (route && !worthItChatRouteMatchesActiveConversation(route)) {
            // A token refresh or return to the browser window must not reopen the
            // same private/group route: activateConversation clears the visible rows.
            routeWorthItChatFromLocation();
        } else if (!route && previousUserId !== nextUserId) {
            refreshWorthItChatData();
        }
    }
}
function initials(person) {
    const name = escapeText(person?.display_name || person?.username || "?").trim();
    return name.split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "?";
}
function makeAvatar(person, extraClass) {
    const avatar = document.createElement("span");
    avatar.className = "worth-it-chat-person-avatar" + (extraClass ? " " + extraClass : "");
    if (person?.avatar_url) {
        const img = document.createElement("img"); img.src = String(person.avatar_url); img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
        img.onerror = () => { img.remove(); avatar.insertBefore(document.createTextNode(initials(person)), avatar.querySelector(".worth-it-presence-indicator")); };
        avatar.appendChild(img);
    } else avatar.textContent = initials(person);
    if (typeof window.renderWorthItPresenceIndicator === "function") window.renderWorthItPresenceIndicator(avatar, person);
    return avatar;
}
function setHeader(title, subtitle, person) {
    const titleNode = $("worthItChatTitle");
    const directPersonId = Number(person?.worth_it_id);
    const hasDirectProfile = activeConversationType === "direct" && Number.isSafeInteger(directPersonId) && directPersonId > 0;
    if (titleNode) {
        if (hasDirectProfile) titleNode.replaceChildren(makeChatProfileLink(person, "worth-it-chat-header-profile-link", title || GLOBAL_TITLE));
        else titleNode.textContent = title || GLOBAL_TITLE;
    }
    $("worthItChatSubtitle").textContent = subtitle || "";
    const host = $("worthItChatHeaderAvatar");
    if (!host) return;
    host.replaceChildren();
    if (person?.avatar_url) {
        const img = document.createElement("img");
        img.src = String(person.avatar_url); img.alt = ""; img.referrerPolicy = "no-referrer";
        img.onerror = () => { img.remove(); host.insertBefore(document.createTextNode(initials(person)), host.querySelector(".worth-it-presence-indicator")); };
        host.appendChild(img);
    } else host.textContent = activeConversationType === "global" ? "🌐" : (activeConversationType === "group" ? "👥" : initials(person || {display_name:title}));
    if (hasDirectProfile) {
        host.setAttribute("role", "link"); host.setAttribute("tabindex", "0");
        host.setAttribute("aria-label", "View " + (person.display_name || person.username || "Worth It member") + "'s profile");
        host.title = "View profile";
        host.onclick = event => openWorthItChatProfile(directPersonId, event);
        host.onkeydown = event => { if (event.key === "Enter" || event.key === " ") openWorthItChatProfile(directPersonId, event); };
        host.classList.add("is-profile-link");
        if (typeof window.renderWorthItPresenceIndicator === "function") window.renderWorthItPresenceIndicator(host, person);
    } else {
        host.removeAttribute("role"); host.removeAttribute("tabindex"); host.removeAttribute("aria-label"); host.removeAttribute("title");
        host.onclick = null; host.onkeydown = null; host.classList.remove("is-profile-link");
    }
    window.dispatchEvent(new CustomEvent("worthitchatcontextchange", {
        detail: typeof window.getWorthItChatEnhancementContext === "function" ? window.getWorthItChatEnhancementContext() : null
    }));
}
function niceTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}
function niceDay(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleDateString([], {month:"short", day:"numeric"});
}
function rpcError(error) {
    const message = String(error?.message || error?.details || "");
    if (/get_worth_it_group_invite_preview|accept_worth_it_group_invite|invite_token/i.test(message) && /does not exist|schema cache|could not find|column .* does not exist/i.test(message)) {
        return "Group invitation links are not set up yet. Run supabase/worth-it-chat-invitation-links.sql in Supabase, then refresh.";
    }
    if (/get_worth_it_chat_notification_preferences|set_worth_it_chat_notifications/i.test(message) && /does not exist|schema cache|could not find/i.test(message)) {
        return "Chat notification settings are not set up yet. Run supabase/worth-it-chat-notifications-and-member-limit.sql in Supabase, then refresh.";
    }
    if (/leave_worth_it_group_chat|delete_worth_it_group_chat/i.test(message) && /does not exist|schema cache|could not find|function .* does not exist/i.test(message)) {
        return "Group management is not set up yet. Run supabase/worth-it-presence-and-read-receipts.sql in Supabase, then refresh.";
    }
    if (/get_worth_it_chat|open_worth_it_friend_chat|send_worth_it_chat_message|worth_it_chat_/i.test(message) && /does not exist|schema cache|could not find/i.test(message)) {
        return "Chat setup is not complete. Run supabase/worth-it-chat.sql in Supabase, then refresh.";
    }
    return message || "Something went wrong. Please try again.";
}

function closeWorthItChatConversationContextMenu() {
    document.getElementById("worthItChatConversationContextMenu")?.remove();
    activeWorthItChatConversationMenuTrigger?.setAttribute("aria-expanded", "false");
    activeWorthItChatConversationMenuTrigger = null;
}
function showWorthItChatConversationContextMenu(conversation, x, y, trigger) {
    closeWorthItChatConversationContextMenu();
    if (trigger) {
        activeWorthItChatConversationMenuTrigger = trigger;
        trigger.setAttribute("aria-expanded", "true");
    }
    if (!chatUser) return;
    const menu = document.createElement("div");
    menu.id = "worthItChatConversationContextMenu";
    menu.className = "worth-it-chat-context-menu";
    menu.setAttribute("role", "menu");
    const addItem = (label, handler, options) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "worth-it-chat-context-menu-item" + (options?.danger ? " is-danger" : "");
        button.textContent = label;
        button.setAttribute("role", "menuitem");
        if (options?.disabled) button.disabled = true;
        button.addEventListener("click", async () => {
            closeWorthItChatConversationContextMenu();
            await handler();
        });
        menu.appendChild(button);
    };
    addItem("Open chat", async () => {
        if (conversation.type === "global") await activateConversation(null, "global", GLOBAL_TITLE, null);
        else if (conversation.type === "group") await openWorthItSavedConversation(conversation);
        else if (conversation.person?.worth_it_id) await openWorthItFriendChat(conversation.person.worth_it_id);
    });
    const chatKey = chatNotificationKeyForConversation(conversation);
    addItem(chatNotificationsEnabled(chatKey) ? "Mute notifications" : "Turn on notifications",
        async () => toggleWorthItChatNotifications(chatKey, null));
    if (conversation.type !== "global" && conversation.id) {
        addItem(conversation.is_pinned ? "Unpin conversation" : "Pin conversation", async () => {
            try {
                const nextPinned = !Boolean(conversation.is_pinned);
                const result = await sb().rpc("set_worth_it_chat_conversation_pinned", {
                    p_conversation_id: conversation.id,
                    p_is_pinned: nextPinned
                });
                if (result.error) throw result.error;
                if (!result.data?.success) {
                    const errors = {
                        CHAT_NOT_FOUND: "This conversation no longer exists.",
                        NOT_A_CHAT_MEMBER: "You are no longer a member of this conversation.",
                        GLOBAL_CHAT_PIN_NOT_SUPPORTED: "Global Chat stays at the top of the sidebar."
                    };
                    throw new Error(errors[result.data?.code] || result.data?.code || "Could not update the pinned state.");
                }
                await refreshWorthItChatData();
                setStatus(nextPinned ? "Conversation pinned to the top of its sidebar list." : "Conversation unpinned.", false);
            } catch (error) {
                setStatus(rpcError(error), true);
            }
        });
    }
    addItem("Delete this conversation history", async () => {
        if (!window.confirm("Delete this conversation history for you only? Other members will keep their messages. New messages will still appear.")) return;
        try {
            const result = await sb().rpc("clear_worth_it_chat_history", {
                p_conversation_id: conversation.type === "global" ? null : conversation.id
            });
            if (result.error) throw result.error;
            if (!result.data?.success) {
                const errors = {
                    CHAT_NOT_FOUND: "This conversation no longer exists.",
                    NOT_A_CHAT_MEMBER: "You are no longer a member of this conversation."
                };
                throw new Error(errors[result.data?.code] || result.data?.code || "Could not clear conversation history.");
            }
            // Do not let an already-started poll repopulate this user's cleared history.
            chatMessageRequestVersion += 1;
            chatLoading = false;
            await refreshWorthItChatData();
            if ((conversation.type === "global" && activeConversationType === "global") ||
                (conversation.id && String(activeConversationId) === String(conversation.id))) {
                await loadWorthItChatMessages(false, true);
            }
            setStatus("Conversation history was cleared for you. Other members' history is unchanged.", false);
        } catch (error) {
            setStatus(rpcError(error), true);
        }
    }, {danger:true, disabled:conversation.type !== "global" && !conversation.id});
    if (conversation.type === "group") {
        addItem("Group options", async () => openWorthItGroupManageDialog(conversation.id));
    }
    document.body.appendChild(menu);
    const margin = 8;
    const left = Math.max(margin, Math.min(Number(x) || margin, window.innerWidth - menu.offsetWidth - margin));
    const top = Math.max(margin, Math.min(Number(y) || margin, window.innerHeight - menu.offsetHeight - margin));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
}
function attachWorthItChatConversationContextHandlers(target, conversation) {
    if (!target) return;
    target.addEventListener("contextmenu", event => {
        event.preventDefault();
        event.stopPropagation();
        showWorthItChatConversationContextMenu(conversation, event.clientX, event.clientY);
    });
    let pressTimer = null;
    let startX = 0;
    let startY = 0;
    let longPressed = false;
    target.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" || event.button !== 0) return;
        startX = event.clientX;
        startY = event.clientY;
        longPressed = false;
        if (pressTimer) window.clearTimeout(pressTimer);
        pressTimer = window.setTimeout(() => {
            longPressed = true;
            showWorthItChatConversationContextMenu(conversation, startX, startY);
        }, 540);
    }, {passive:true});
    target.addEventListener("pointermove", event => {
        if (Math.abs(event.clientX - startX) > 12 || Math.abs(event.clientY - startY) > 12) {
            if (pressTimer) window.clearTimeout(pressTimer);
            pressTimer = null;
        }
    }, {passive:true});
    const cancelPress = () => {
        if (pressTimer) window.clearTimeout(pressTimer);
        pressTimer = null;
    };
    target.addEventListener("pointerup", cancelPress, {passive:true});
    target.addEventListener("pointercancel", cancelPress, {passive:true});
    target.addEventListener("click", event => {
        if (!longPressed) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        longPressed = false;
    }, true);
}
document.addEventListener("click", event => {
    if (!event.target.closest(".worth-it-chat-message-actions")) closeWorthItChatMessageMenus();
    if (!event.target.closest("#worthItChatConversationContextMenu")) closeWorthItChatConversationContextMenu();
});
document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const messageMenuOpen = Array.from(document.querySelectorAll(".worth-it-chat-message-menu")).some(menu => !menu.hidden);
    const conversationMenuOpen = Boolean(document.getElementById("worthItChatConversationContextMenu"));
    if (!messageMenuOpen && !conversationMenuOpen) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeWorthItChatMessageMenus();
    closeWorthItChatConversationContextMenu();
});
if ($("worthItGlobalChatBtn")) {
    attachWorthItChatConversationContextHandlers($("worthItGlobalChatBtn"), {
        type: "global", id: null, title: GLOBAL_TITLE
    });
}

function getWorthItChatSidebarSearchQuery() {
    return String($("worthItChatSidebarSearch")?.value || "").trim().toLocaleLowerCase();
}
function worthItChatSidebarSearchMatches(query, values) {
    if (!query) return true;
    return (Array.isArray(values) ? values : [values]).some(value =>
        String(value ?? "").toLocaleLowerCase().includes(query)
    );
}
function findWorthItDirectConversationForFriend(friend) {
    return chatConversations.find(conversation =>
        conversation.type === "direct" &&
        Array.isArray(conversation.members) &&
        conversation.members.some(member => String(member.worth_it_id) === String(friend.worth_it_id))
    ) || null;
}
function getWorthItChatConversationSearchFields(conversation) {
    const members = Array.isArray(conversation?.members) ? conversation.members : [];
    return [
        conversation?.title, conversation?.name, conversation?.id,
        ...members.flatMap(member => [member.display_name, member.username, member.worth_it_id])
    ];
}

function renderFriends() {
    const host = $("worthItChatFriends");
    if (!host) return;
    const sidebarQuery = getWorthItChatSidebarSearchQuery();
    const pinnedFriendIds = new Set();
    for (const conversation of chatConversations) {
        if (conversation.type !== "direct" || !conversation.is_pinned) continue;
        for (const member of Array.isArray(conversation.members) ? conversation.members : []) {
            if (member?.worth_it_id != null) pinnedFriendIds.add(String(member.worth_it_id));
        }
    }
    const friendsForSidebar = chatFriends
        .filter(friend => worthItChatSidebarSearchMatches(sidebarQuery, [
            friend.display_name, friend.username, friend.worth_it_id
        ]))
        .sort((left, right) =>
            Number(pinnedFriendIds.has(String(right.worth_it_id))) - Number(pinnedFriendIds.has(String(left.worth_it_id)))
        );
    // Polling runs every five seconds. Only rebuild this list when its visible state changes.
    // last_seen_at is intentionally excluded: profile-ui.js updates presence indicators in place.
    const renderKey = JSON.stringify({
        userId: chatUser?.id || null,
        sidebarQuery,
        activeConversationType,
        activePersonId: activeConversationPerson?.worth_it_id ?? null,
        friends: friendsForSidebar.map(friend => [
            friend.worth_it_id, friend.username || "", friend.display_name || "", friend.avatar_url || "",
            pinnedFriendIds.has(String(friend.worth_it_id))
        ]),
        directUnread: chatConversations.filter(conversation => conversation.type === "direct").map(conversation => [
            conversation.id, Number(conversation.unread_count || 0),
            (Array.isArray(conversation.members) ? conversation.members : []).map(member => member.worth_it_id)
        ]),
        notificationPreferences: chatNotificationPreferences
    });
    if (host.dataset.worthItChatRenderKey === renderKey) return;
    host.dataset.worthItChatRenderKey = renderKey;
    host.replaceChildren();
    if (!chatUser) {
        const p = document.createElement("p"); p.className = "worth-it-chat-muted"; p.textContent = "Sign in to see your friends."; host.appendChild(p); return;
    }
    if (!chatFriends.length) {
        const p = document.createElement("p");
        p.className = "worth-it-chat-muted";
        p.textContent = "Your friends will appear here. Add friends from their profiles.";
        host.appendChild(p);
        return;
    }
    if (!friendsForSidebar.length) {
        const p = document.createElement("p");
        p.className = "worth-it-chat-muted worth-it-chat-no-results";
        p.textContent = "No private chats match your search.";
        host.appendChild(p);
        return;
    }
    friendsForSidebar.forEach(friend => {
        const directConversation = findWorthItDirectConversationForFriend(friend);
        const contextConversation = {
            type: "direct",
            id: directConversation?.id || null,
            title: friend.display_name || friend.username || "Friend chat",
            members: [friend],
            person: friend,
            is_pinned: Boolean(directConversation?.is_pinned)
        };
        const item = document.createElement("div");
        item.className = "worth-it-chat-conversation-item worth-it-chat-private-item";
        const row = document.createElement("button");
        row.type = "button";
        row.className = "worth-it-chat-person-btn worth-it-chat-conversation-open" + (activeConversationType === "direct" && String(activeConversationPerson?.worth_it_id) === String(friend.worth_it_id) ? " is-active" : "");
        row.title = "Chat with " + (friend.display_name || friend.username || "friend");
        row.appendChild(makeAvatar(friend));
        const info = document.createElement("span"); info.className = "worth-it-chat-person-info";
        const name = document.createElement("strong"); name.textContent = friend.display_name || friend.username || "Worth It member";
        if (pinnedFriendIds.has(String(friend.worth_it_id))) {
            const pin = document.createElement("span");
            pin.className = "worth-it-chat-pin-indicator";
            pin.textContent = "📌";
            pin.setAttribute("aria-label", "Pinned conversation");
            name.appendChild(pin);
        }
        const username = document.createElement("small"); username.textContent = friend.username ? "@" + friend.username : "Friend";
        const presence = document.createElement("small"); presence.className = "worth-it-chat-person-presence"; presence.dataset.worthItPresenceId = String(friend.worth_it_id); presence.textContent = window.getWorthItPresenceInfo ? window.getWorthItPresenceInfo(friend).label : "";
        info.append(name, username, presence); row.appendChild(info);

        const friendKey = chatNotificationKeyForFriend(friend);
        const unread = chatNotificationsEnabled(friendKey) ? Number(directConversation?.unread_count || 0) : 0;
        if (unread > 0) {
            const count = document.createElement("span");
            count.className = "worth-it-chat-person-count";
            count.textContent = unread > 99 ? "99+" : String(unread);
            count.setAttribute("aria-label", unread + " unread messages");
            row.appendChild(count);
        }
        row.addEventListener("click", () => openWorthItFriendChat(friend.worth_it_id));
        item.appendChild(row);
        const actions = document.createElement("button");
        actions.type = "button";
        actions.className = "worth-it-chat-group-actions-btn worth-it-chat-private-actions-btn";
        actions.textContent = "⋯";
        actions.title = "Conversation options for " + (friend.display_name || friend.username || "friend");
        actions.setAttribute("aria-label", "Conversation options for " + (friend.display_name || friend.username || "friend"));
        actions.setAttribute("aria-haspopup", "menu");
        actions.setAttribute("aria-expanded", "false");
        actions.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const rect = actions.getBoundingClientRect();
            showWorthItChatConversationContextMenu(contextConversation, rect.left, rect.bottom, actions);
        });
        item.appendChild(actions);
        attachWorthItChatConversationContextHandlers(item, contextConversation);
        host.appendChild(item);
    });
}

function conversationLabel(conversation) {
    if (conversation.type === "group") return conversation.title || "Group chat";
    const members = Array.isArray(conversation.members) ? conversation.members : [];
    const person = members[0];
    return person?.display_name || person?.username || "Friend chat";
}
function renderConversations() {
    const host = $("worthItChatConversations");
    if (!host) return;
    const sidebarQuery = getWorthItChatSidebarSearchQuery();
    const visibleConversations = chatConversations
        .filter(conversation => conversation.type === "group" &&
            worthItChatSidebarSearchMatches(sidebarQuery, getWorthItChatConversationSearchFields(conversation)))
        .sort((left, right) => Number(Boolean(right.is_pinned)) - Number(Boolean(left.is_pinned)));
    const renderKey = JSON.stringify({
        userId: chatUser?.id || null,
        sidebarQuery,
        activeConversationType,
        activeConversationId,
        notificationPreferences: chatNotificationPreferences,
        conversations: visibleConversations.map(conversation => ({
            id: conversation.id,
            type: conversation.type,
            is_pinned: Boolean(conversation.is_pinned),
            title: conversation.title,
            created_by: conversation.created_by,
            is_creator: conversation.is_creator,
            unread_count: Number(conversation.unread_count || 0),
            last_message: conversation.last_message || null,
            members: conversation.members || [],
            invite_token: conversation.invite_token || ""
        }))
    });
    if (host.dataset.worthItChatRenderKey === renderKey) return;
    host.dataset.worthItChatRenderKey = renderKey;
    host.replaceChildren();
    if (!chatUser) return;
    if (!visibleConversations.length) {
        const p = document.createElement("p");
        p.className = "worth-it-chat-muted";
        p.textContent = sidebarQuery ? "No group chats match your search." : "Your group chats will appear here.";
        host.appendChild(p);
        return;
    }
    visibleConversations.forEach(conversation => {
        const item = document.createElement("div");
        item.className = "worth-it-chat-conversation-item";
        const row = document.createElement("button");
        row.type = "button";
        row.className = "worth-it-chat-person-btn worth-it-chat-conversation-open" + (activeConversationId === conversation.id ? " is-active" : "");
        row.title = "Open " + conversationLabel(conversation);
        const icon = document.createElement("span");
        icon.className = "worth-it-chat-person-avatar";
        icon.textContent = "👥";
        row.appendChild(icon);
        const info = document.createElement("span");
        info.className = "worth-it-chat-person-info";
        const name = document.createElement("strong");
        name.textContent = conversationLabel(conversation);
        if (conversation.is_pinned) {
            const pin = document.createElement("span");
            pin.className = "worth-it-chat-pin-indicator";
            pin.textContent = "📌";
            pin.setAttribute("aria-label", "Pinned conversation");
            name.appendChild(pin);
        }
        const last = document.createElement("small");
        const lastMessage = conversation.last_message;
        const preview = lastMessage?.body || (lastMessage?.media_type ? "📷 Media" : "Start a conversation");
        last.textContent = lastMessage?.display_name ? lastMessage.display_name + ": " + preview : preview;
        info.append(name, last);
        row.appendChild(info);
        const notificationKey = chatNotificationKeyForConversation(conversation);
        const unread = chatNotificationsEnabled(notificationKey) ? Number(conversation.unread_count || 0) : 0;
        if (unread > 0) {
            const count = document.createElement("span");
            count.className = "worth-it-chat-person-count";
            count.textContent = unread > 99 ? "99+" : String(unread);
            count.setAttribute("aria-label", unread + " unread messages");
            row.appendChild(count);
        }
        row.addEventListener("click", () => openWorthItSavedConversation(conversation));
        attachWorthItChatConversationContextHandlers(item, conversation);
        item.appendChild(row);
        const actions = document.createElement("button");
        actions.type = "button";
        actions.className = "worth-it-chat-group-actions-btn";
        actions.textContent = "⋯";
        actions.title = "Group options for " + conversationLabel(conversation);
        actions.setAttribute("aria-label", "Group options for " + conversationLabel(conversation));
        actions.setAttribute("aria-haspopup", "menu");
        actions.setAttribute("aria-expanded", "false");
        actions.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const rect = actions.getBoundingClientRect();
            showWorthItChatConversationContextMenu(conversation, rect.left, rect.bottom, actions);
        });
        item.appendChild(actions);
        host.appendChild(item);
    });
}

function openWorthItGroupManageDialog(conversationId) {
    const conversation = chatConversations.find(item => item.id === conversationId && item.type === "group");
    const dialog = $("worthItChatGroupManageDialog");
    if (!conversation || !dialog) return;
    const title = $("worthItChatGroupManageTitle");
    const copy = $("worthItChatGroupManageCopy");
    const remove = $("worthItChatGroupDeleteBtn");
    const status = $("worthItChatGroupManageStatus");
    if (title) title.textContent = conversationLabel(conversation);
    if (copy) copy.textContent = conversation.is_creator
        ? "Leave the group and hand ownership to another member, or permanently delete the group and all its messages for everyone."
        : "Leave this group to remove it from your chat list. You can join again only if someone shares a valid group invitation with you.";
    if (remove) remove.hidden = conversation.is_creator !== true;
    if (status) { status.textContent = ""; status.classList.remove("is-error"); }
    dialog.dataset.conversationId = String(conversation.id);
    if (dialog.parentElement !== document.body) document.body.appendChild(dialog);
    dialog.hidden = false;
    dialog.setAttribute("aria-hidden", "false");
    $("worthItChatGroupLeaveBtn")?.focus();
}
function closeWorthItGroupManageDialog() {
    const dialog = $("worthItChatGroupManageDialog");
    if (dialog) { dialog.hidden = true; dialog.setAttribute("aria-hidden", "true"); }
}
async function performWorthItGroupAction(action) {
    const dialog = $("worthItChatGroupManageDialog");
    const conversationId = String(dialog?.dataset.conversationId || "");
    const conversation = chatConversations.find(item => String(item.id) === conversationId && item.type === "group");
    const status = $("worthItChatGroupManageStatus");
    const button = $(action === "delete" ? "worthItChatGroupDeleteBtn" : "worthItChatGroupLeaveBtn");
    if (!chatUser || !conversation || !button || button.disabled) return;
    if (action === "delete" && conversation.is_creator !== true) {
        if (status) { status.textContent = "Only the group creator can permanently delete this group."; status.classList.add("is-error"); }
        return;
    }
    const groupName = conversationLabel(conversation);
    const confirmed = action === "delete"
        ? window.confirm("Permanently delete “" + groupName + "” for everyone? All group messages and its invitation link will be deleted and cannot be recovered.")
        : window.confirm("Leave “" + groupName + "”? It will disappear from your group list. You may need a new invitation to join again.");
    if (!confirmed) return;
    const priorText = button.textContent;
    button.disabled = true;
    button.textContent = action === "delete" ? "Deleting…" : "Leaving…";
    if (status) { status.textContent = ""; status.classList.remove("is-error"); }
    try {
        const rpcName = action === "delete" ? "delete_worth_it_group_chat" : "leave_worth_it_group_chat";
        const result = await sb().rpc(rpcName, {p_conversation_id:conversation.id});
        if (result.error) throw result.error;
        if (!result.data?.success) {
            const codes = {
                NOT_GROUP_CREATOR: "Only the group creator can delete this group.",
                NOT_A_GROUP_MEMBER: "You are no longer a member of this group.",
                GROUP_NOT_FOUND: "This group no longer exists."
            };
            throw new Error(codes[result.data?.code] || result.data?.code || "The group action could not be completed.");
        }
        const wasActive = activeConversationType === "group" && String(activeConversationId) === conversationId;
        closeWorthItGroupManageDialog();
        await refreshWorthItChatData();
        if (wasActive) await activateConversation(null, "global", GLOBAL_TITLE, null);
        const message = action === "delete" ? "Group permanently deleted." : (result.data.owner_transferred ? "You left the group. Ownership was transferred to another member." : "You left the group.");
        if (chatOpen) setStatus(message, false);
        else if (typeof window.showToast === "function") window.showToast(message);
    } catch (error) {
        if (status) { status.textContent = rpcError(error); status.classList.add("is-error"); }
    } finally {
        if (button.isConnected) { button.disabled = false; button.textContent = priorText; }
    }
}
window.openWorthItGroupManageDialog = openWorthItGroupManageDialog;
window.closeWorthItGroupManageDialog = closeWorthItGroupManageDialog;
window.performWorthItGroupAction = performWorthItGroupAction;
function chatNotificationKeyForFriend(friend) {
    if (friend?.worth_it_id == null) return "";
    return "direct:" + String(friend.worth_it_id);
}
function chatNotificationKeyForConversation(conversation) {
    if (!conversation) return "";
    if (conversation.type === "global") return "global";
    if (conversation.type === "group" && conversation.id) return "group:" + String(conversation.id);
    const member = Array.isArray(conversation.members) ? conversation.members[0] : null;
    return member?.worth_it_id == null ? "" : "direct:" + String(member.worth_it_id);
}
function chatNotificationCategoryEnabled(chatKey) {
    if (chatKey === "global" || String(chatKey || "").startsWith("group:")) return globalNotificationPreferences.group_chats !== false;
    if (String(chatKey || "").startsWith("direct:")) return globalNotificationPreferences.private_messages !== false;
    return true;
}
function chatNotificationsEnabled(chatKey) {
    return !chatKey || (chatNotificationCategoryEnabled(chatKey) && chatNotificationPreferences[chatKey] !== false);
}
function getActiveChatNotificationKey() {
    if (activeConversationType === "global") return "global";
    if (activeConversationType === "group" && activeConversationId) return "group:" + String(activeConversationId);
    if (activeConversationType === "direct") {
        const personId = activeConversationPerson?.worth_it_id ??
            chatConversations.find(conversation => conversation.id === activeConversationId)?.members?.[0]?.worth_it_id;
        if (personId != null) return "direct:" + String(personId);
    }
    return "";
}
function updateChatHeaderNotificationButton() {
    const button = $("worthItChatHeaderNotifications");
    if (!button) return;
    const chatKey = getActiveChatNotificationKey();
    const available = Boolean(chatUser && chatKey);
    button.hidden = !available;
    button.dataset.chatKey = chatKey;
    const categoryEnabled = chatNotificationCategoryEnabled(chatKey);
    const enabled = chatNotificationsEnabled(chatKey);
    const labelText = !categoryEnabled ? "Enable this in Settings" : enabled ? "Turn off notifications" : "Turn on notifications";
    button.disabled = !categoryEnabled;
    button.classList.toggle("is-enabled", enabled);
    button.classList.toggle("is-muted", !enabled);
    button.title = labelText;
    button.setAttribute("aria-label", labelText);
    button.setAttribute("aria-pressed", String(!enabled));
    const icon = button.querySelector(".worth-it-chat-notification-icon");
    const label = button.querySelector(".worth-it-chat-notification-label");
    if (icon) icon.textContent = enabled ? "🔔" : "🔕";
    if (label) label.textContent = labelText;
}
function updateChatHeaderShareButton() {
    const button = $("worthItChatShareInviteBtn");
    if (!button) return;
    const available = Boolean(chatUser && activeConversationType === "group" && /^[0-9a-f]{64}$/.test(activeConversationInviteToken));
    button.hidden = !available;
    button.title = "Copy group invite link";
    button.setAttribute("aria-label", "Copy group invite link");
}
async function toggleWorthItChatNotifications(chatKey, button) {
    if (!chatUser || !chatKey || button?.disabled) return;
    if (!chatNotificationCategoryEnabled(chatKey)) {
        setStatus("Turn this notification category back on from Settings → Notifications first.", true);
        return;
    }
    const client = sb();
    if (!client) return;
    const nextEnabled = !chatNotificationsEnabled(chatKey);
    if (button) button.disabled = true;
    try {
        const result = await client.rpc("set_worth_it_chat_notifications", {
            p_chat_key: chatKey,
            p_enabled: nextEnabled
        });
        if (result.error) throw result.error;
        if (!result.data?.success) throw new Error(result.data?.code || "Could not update notification settings.");
        chatNotificationPreferences = Object.assign(Object.create(null), chatNotificationPreferences, {
            [chatKey]: nextEnabled
        });
        renderFriends();
        renderConversations();
        updateChatHeaderNotificationButton();
        updateUnreadBadge();
    } catch (error) {
        setStatus(rpcError(error), true);
    } finally {
        if (button?.isConnected) button.disabled = false;
    }
}

function updateGlobalChatUnreadBadge() {
    const badge = $("worthItGlobalChatUnreadCount");
    if (!badge) return;
    const globalConversation = chatConversations.find(item => item.type === "global");
    const count = chatNotificationsEnabled("global") ? Number(globalConversation?.unread_count || 0) : 0;
    badge.hidden = count < 1;
    badge.textContent = count > 99 ? "99+" : String(count);
}
function updateUnreadBadge() {
    const badge = $("worthItChatNavBadge");
    updateGlobalChatUnreadBadge();
    if (!badge) return;
    const total = chatConversations.reduce((sum, item) => {
        const key = chatNotificationKeyForConversation(item);
        return sum + (chatNotificationsEnabled(key) ? Number(item.unread_count || 0) : 0);
    }, 0);
    badge.hidden = total < 1;
    badge.textContent = total > 99 ? "99+" : String(total);
}
async function refreshWorthItChatData() {
    const client = sb();
    if (!chatUser || !client) return;
    const userId = chatUser.id;
    const token = ++chatRefreshToken;
    const shouldLoadNotificationPreferences = chatNotificationPreferencesLoadedForUser !== userId;
    const shouldLoadGlobalPreferences = globalNotificationPreferencesLoadedForUser !== userId;
    const requests = [
        client.rpc("get_worth_it_chat_friends"),
        client.rpc("get_worth_it_chat_conversations")
    ];
    if (shouldLoadNotificationPreferences) requests.push(client.rpc("get_worth_it_chat_notification_preferences"));
    if (shouldLoadGlobalPreferences) requests.push(client.rpc("get_worth_it_user_preferences"));
    const results = await Promise.allSettled(requests);
    if (token !== chatRefreshToken || chatUser?.id !== userId) return;
    const friendsResult = results[0];
    const chatsResult = results[1];
    const notificationPrefsResult = shouldLoadNotificationPreferences ? results[2] : null;
    const globalPrefsResult = shouldLoadGlobalPreferences ? results[shouldLoadNotificationPreferences ? 3 : 2] : null;
    if (friendsResult.status === "fulfilled" && !friendsResult.value.error) {
        chatFriends = Array.isArray(friendsResult.value.data) ? friendsResult.value.data : [];
    } else {
        chatFriends = [];
        if (chatOpen) setStatus(rpcError(friendsResult.status === "rejected" ? friendsResult.reason : friendsResult.value.error), true);
    }
    if (chatsResult.status === "fulfilled" && !chatsResult.value.error) {
        chatConversations = Array.isArray(chatsResult.value.data) ? chatsResult.value.data : [];
    } else {
        chatConversations = [];
        if (chatOpen) setStatus(rpcError(chatsResult.status === "rejected" ? chatsResult.reason : chatsResult.value.error), true);
    }
    // Until the settings migration is installed, preserve the default (all enabled) behavior.
    if (shouldLoadNotificationPreferences) {
        if (notificationPrefsResult?.status === "fulfilled" && !notificationPrefsResult.value.error &&
            notificationPrefsResult.value.data && typeof notificationPrefsResult.value.data === "object" &&
            !Array.isArray(notificationPrefsResult.value.data)) {
            chatNotificationPreferences = Object.assign(Object.create(null), notificationPrefsResult.value.data);
        }
        // Preferences are fetched once per signed-in user, not on every 5-second message refresh.
        chatNotificationPreferencesLoadedForUser = userId;
    }
    if (shouldLoadGlobalPreferences) {
        const data = globalPrefsResult?.status === "fulfilled" && !globalPrefsResult.value.error ? globalPrefsResult.value.data : null;
        if (data && data.success !== false && data.notifications && typeof data.notifications === "object" && !Array.isArray(data.notifications)) {
            globalNotificationPreferences = Object.assign({ friend_requests: true, follows: true, private_messages: true, group_chats: true, account_activity: true }, data.notifications);
            window.worthItUserPreferences = data;
            window.worthItUserPreferencesUserId = userId;
        } else if (window.worthItUserPreferencesUserId === userId && window.worthItUserPreferences?.notifications) {
            globalNotificationPreferences = Object.assign({ friend_requests: true, follows: true, private_messages: true, group_chats: true, account_activity: true }, window.worthItUserPreferences.notifications);
        }
        // If the optional settings migration is not installed, keep the current default behavior.
        globalNotificationPreferencesLoadedForUser = userId;
    }
    if (activeConversationType === "direct" && activeConversationPerson?.worth_it_id) { const freshPerson = chatFriends.find(item => String(item.worth_it_id) === String(activeConversationPerson.worth_it_id)); if (freshPerson) { activeConversationPerson = {...activeConversationPerson, ...freshPerson}; setHeader(activeConversationTitle, (window.getWorthItPresenceInfo ? window.getWorthItPresenceInfo(activeConversationPerson).label : "Private conversation with your friend"), activeConversationPerson); } }
    renderFriends(); renderConversations(); updateChatHeaderNotificationButton(); updateUnreadBadge();
    if ($("worthItChatGroupDialog") && !$("worthItChatGroupDialog").hidden) renderGroupFriendChoices();
}
// The sidebar's inline Refresh control needs a public callback. Keep the
// data loader private for internal callers, and also refresh the active messages
// when the user explicitly asks to refresh the chat.
window.refreshWorthItChatData = async function () {
    if (!chatUser) {
        setStatus("Sign in to refresh your chats.", true);
        return;
    }
    const overlay = $("worthItChatOverlay");
    const windowNode = $("worthItChatWindow");
    const wasFullscreen = Boolean(
        overlay?.classList.contains("is-fullscreen") ||
        windowNode?.classList.contains("is-fullscreen")
    );
    await refreshWorthItChatData();
    if (chatUser) await loadWorthItChatMessages(false, true);

    // Refresh is a data action, not a layout action. Restore the exact panel size
    // in case asynchronous conversation updates changed route/layout state.
    if (chatOpen && overlay && !overlay.hidden && windowNode) {
        setWorthItChatFullscreen(wasFullscreen, {persist:false});
    }
};
function appendWorthItChatTextWithFlags(host, value) {
    const parts = String(value || "").split(/([\u{1F1E6}-\u{1F1FF}]{2})/u);
    for (const part of parts) {
        if (!part) continue;
        const flagCode = getWorthItChatFlagCode(part);
        if (!flagCode) {
            host.appendChild(document.createTextNode(part));
            continue;
        }
        const flag = document.createElement("img");
        flag.className = "worth-it-chat-message-flag";
        flag.src = "https://flagcdn.com/" + flagCode + ".svg";
        flag.alt = part;
        flag.title = part;
        flag.loading = "lazy";
        flag.decoding = "async";
        flag.referrerPolicy = "no-referrer";
        flag.addEventListener("error", () => {
            flag.replaceWith(document.createTextNode(part));
        }, { once: true });
        host.appendChild(flag);
    }
}
function renderWorthItChatComposerPreview() {
    const input = $("worthItChatInput");
    const preview = $("worthItChatInputPreview");
    if (!input || !preview) return;
    preview.replaceChildren();
    const value = String(input.value || "");
    const showCaret = document.activeElement === input
        && Number.isInteger(input.selectionStart)
        && input.selectionStart === input.selectionEnd;
    let caretPosition = showCaret ? input.selectionStart : -1;

    // Emoji can be several UTF-16 code units (including ZWJ sequences such as 🏳️‍⚧️).
    // Keep the visual caret after a complete grapheme, without changing the actual input text
    // or consuming a user-typed trailing space.
    if (caretPosition >= 0) {
        if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            for (const segment of segmenter.segment(value)) {
                const start = segment.index;
                const end = start + segment.segment.length;
                if (caretPosition > start && caretPosition < end) {
                    caretPosition = end;
                    break;
                }
            }
        } else {
            const graphemePattern = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|🏳️‍⚧️|🏳️‍🌈)/gu;
            let match;
            while ((match = graphemePattern.exec(value))) {
                const start = match.index;
                const end = start + match[0].length;
                if (caretPosition > start && caretPosition < end) {
                    caretPosition = end;
                    break;
                }
            }
        }
    }

    const appendCaret = () => {
        if (caretPosition < 0) return;
        const caret = document.createElement("span");
        caret.className = "worth-it-chat-composer-caret";
        caret.setAttribute("aria-hidden", "true");
        preview.appendChild(caret);
    };

    if (!value) {
        preview.classList.add("is-empty");
        appendCaret();
        preview.appendChild(document.createTextNode(input.placeholder || ""));
    } else {
        preview.classList.remove("is-empty");
        if (caretPosition < 0) {
            appendWorthItChatTextWithFlags(preview, value);
        } else {
            appendWorthItChatTextWithFlags(preview, value.slice(0, caretPosition));
            appendCaret();
            appendWorthItChatTextWithFlags(preview, value.slice(caretPosition));
        }
    }
    preview.scrollTop = input.scrollTop;
    preview.scrollLeft = input.scrollLeft;
}
function renderLinkedText(host, value) {
    const text = escapeText(value);
    const regex = /https?:\/\/[^\s<>"']+/gi;
    let last = 0, match;
    while ((match = regex.exec(text))) {
        if (match.index > last) appendWorthItChatTextWithFlags(host, text.slice(last, match.index));
        let urlText = match[0];
        let trailing = "";
        while (/[),.!?;:]$/.test(urlText)) { trailing = urlText.slice(-1) + trailing; urlText = urlText.slice(0, -1); }
        try {
            const url = new URL(urlText);
            if (url.protocol === "http:" || url.protocol === "https:") {
                const a = document.createElement("a"); a.className = "worth-it-chat-link"; a.href = url.href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = urlText; host.appendChild(a);
            } else appendWorthItChatTextWithFlags(host, urlText);
        } catch (_) { appendWorthItChatTextWithFlags(host, urlText); }
        if (trailing) appendWorthItChatTextWithFlags(host, trailing);
        last = regex.lastIndex;
    }
    if (last < text.length) appendWorthItChatTextWithFlags(host, text.slice(last));
}
function openWorthItChatProfile(worthItId, event) {
    event?.preventDefault?.(); event?.stopPropagation?.();
    const id = Number(worthItId);
    if (!Number.isSafeInteger(id) || id < 1) return;
    // Keep the current chat URL in browser history. Opening a profile should
    // add the profile route after this chat so browser Back returns here.
    profileReturnConversation = {
        path: currentBrowserLocation(),
        type: activeConversationType,
        id: activeConversationId,
        title: activeConversationTitle,
        person: activeConversationPerson,
        inviteToken: activeConversationInviteToken
    };
    showChatOverlay(false, {skipRouteSync:true});
    if (typeof window.openWorthItProfile === "function") window.openWorthItProfile(id);
    else window.location.href = "/profile/" + id;
}
function makeChatProfileLink(person, className, labelOrNode) {
    const id = Number(person?.worth_it_id), valid = Number.isSafeInteger(id) && id > 0;
    const link = document.createElement(valid ? "a" : "span");
    link.className = className || "";
    if (valid) {
        link.href = "/profile/" + id;
        link.title = "View " + (person?.display_name || person?.username || "Worth It member") + "'s profile";
        link.setAttribute("aria-label", link.title);
        link.addEventListener("click", event => openWorthItChatProfile(id, event));
    }
    if (labelOrNode instanceof Node) link.appendChild(labelOrNode);
    else link.textContent = String(labelOrNode || person?.display_name || person?.username || "Worth It member");
    return link;
}
function chatMessageRenderSignature(message) {
    // Include rendered fields, but exclude presence timestamps: those update the avatar indicator
    // in place and must not cause the whole message row to be rebuilt.
    return JSON.stringify([
        chatUser?.id || null,
        message.id ?? null,
        message.body ?? "",
        message.media_url ?? "",
        message.media_type ?? "",
        message.filtered_reason ?? "",
        message.created_at ?? "",
        message.sender_user_id ?? "",
        message.worth_it_id ?? "",
        message.username ?? "",
        message.display_name ?? "",
        message.avatar_url ?? "",
        message.is_seen === true,
        Boolean(message.is_deleted),
        Boolean(message.is_hidden_by_me),
        message.deleted_by_display_name || ""
    ]);
}

function closeWorthItChatMessageMenus(except) {
    document.querySelectorAll(".worth-it-chat-message-menu").forEach(menu => {
        if (menu !== except) {
            menu.hidden = true;
            menu.closest(".worth-it-chat-message-more")?.querySelector("button[aria-expanded]")?.setAttribute("aria-expanded", "false");
        }
    });
}
function makeWorthItChatMessageActionButton(label, glyph, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className || "worth-it-chat-message-action-btn";
    if (label === "Copy message") {
        button.classList.add("worth-it-chat-copy-action");
        button.innerHTML = '<svg class="worth-it-chat-copy-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8.5" y="8.5" width="11" height="12" rx="2"></rect><path d="M15.5 8.5V6a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2H8.5"></path></svg>';
    } else {
        button.textContent = glyph;
    }
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", onClick);
    return button;
}
async function copyWorthItChatMessage(message) {
    const value = String(message.body || message.media_url || "");
    if (!value) {
        setStatus("There is no message text or attachment link to copy.", true);
        return;
    }
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
        } else {
            const input = document.createElement("textarea");
            input.value = value;
            input.setAttribute("readonly", "");
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.appendChild(input);
            input.select();
            const copied = document.execCommand("copy");
            input.remove();
            if (!copied) throw new Error("Clipboard access is unavailable.");
        }
        setStatus("Message copied.", false);
    } catch (_) {
        setStatus("Could not copy the message. Check your browser's clipboard permission.", true);
    }
}
function renderWorthItChatReplyPreview() {
    const host = $("worthItChatReplyPreview");
    const authorNode = $("worthItChatReplyAuthor");
    const textNode = $("worthItChatReplyText");
    if (!host || !authorNode || !textNode) return;
    const quote = pendingReplyQuote;
    host.hidden = !quote;
    if (!quote) {
        authorNode.textContent = "";
        textNode.textContent = "";
        return;
    }
    authorNode.textContent = "Replying to " + quote.author;
    textNode.textContent = quote.text;
}
function clearWorthItChatReplyQuote() {
    pendingReplyQuote = null;
    renderWorthItChatReplyPreview();
    updateWorthItChatComposerAction();
    saveActiveWorthItChatDraft();
}
function quoteWorthItChatMessage(message) {
    const input = $("worthItChatInput");
    if (!input) return;
    const author = String(message.display_name || message.username || "Worth It member").replace(/[\r\n]/g, " ").slice(0, 80);
    const raw = String(message.body || (message.media_type === "audio" ? "🎙 Voice message" : message.media_type ? "[Shared " + message.media_type + "]" : ""));
    if (!raw.trim()) {
        setStatus("This message cannot be replied to.", true);
        return;
    }
    const compact = raw.replace(/\s+/g, " ").trim();
    pendingReplyQuote = { author, text: compact.slice(0, 160) + (compact.length > 160 ? "…" : "") };
    renderWorthItChatReplyPreview();
    updateWorthItChatComposerAction();
    saveActiveWorthItChatDraft();
    input.focus({preventScroll:true});
    setStatus("Replying to " + author + ". Write your reply below.", false);
}
function getOwnedWorthItChatMediaObjectPath(mediaUrl, userId, client) {
    if (!mediaUrl || !userId || !client?.supabaseUrl) return "";
    try {
        const media = new URL(String(mediaUrl));
        const configured = new URL(String(client.supabaseUrl));
        if (media.protocol !== "https:" || media.origin !== configured.origin) return "";
        const prefix = "/storage/v1/object/public/worth-it-chat-media/";
        if (!media.pathname.startsWith(prefix)) return "";
        const encodedPath = media.pathname.slice(prefix.length);
        const objectPath = encodedPath.split("/").map(part => decodeURIComponent(part)).join("/");
        const segments = objectPath.split("/");
        if (segments.length < 2 || segments[0] !== String(userId) || segments.some(part => !part || part === "." || part === "..")) return "";
        return objectPath;
    } catch (_) {
        return "";
    }
}


const WORTH_IT_CHAT_DELETE_CONFIRM_SKIP_PREFIX = "worth-it-chat-delete-confirm-skip-v1:";
function shouldSkipWorthItChatDeleteConfirmation(userId) {
    if (!userId) return false;
    try {
        return window.localStorage.getItem(WORTH_IT_CHAT_DELETE_CONFIRM_SKIP_PREFIX + String(userId)) === "1";
    } catch (_) {
        return false;
    }
}
function rememberWorthItChatDeleteConfirmationPreference(userId) {
    if (!userId) return;
    try {
        window.localStorage.setItem(WORTH_IT_CHAT_DELETE_CONFIRM_SKIP_PREFIX + String(userId), "1");
    } catch (_) {
        // If storage is unavailable, keep asking next time rather than silently changing policy.
    }
}
function confirmWorthItChatMessageDelete(userId) {
    if (shouldSkipWorthItChatDeleteConfirmation(userId)) return Promise.resolve(true);
    return new Promise(resolve => {
        if (document.getElementById("worthItChatDeleteConfirmDialog")) {
            resolve(false);
            return;
        }
        const previousFocus = document.activeElement;
        const overlay = document.createElement("div");
        overlay.id = "worthItChatDeleteConfirmDialog";
        overlay.className = "worth-it-chat-delete-confirm-dialog";
        overlay.setAttribute("role", "presentation");
        // Keep destructive-action confirmation above the chat overlay and page chrome.
        // The message menu action must be visible immediately; closing chat is unrelated.
        overlay.style.position = "fixed";
        overlay.style.inset = "0";
        overlay.style.zIndex = "2147483647";
        overlay.style.display = "grid";

        const card = document.createElement("section");
        card.className = "worth-it-chat-delete-confirm-card";
        card.setAttribute("role", "alertdialog");
        card.setAttribute("aria-modal", "true");
        card.setAttribute("aria-labelledby", "worthItChatDeleteConfirmTitle");
        card.setAttribute("aria-describedby", "worthItChatDeleteConfirmDescription");
        card.tabIndex = -1;

        const kicker = document.createElement("span");
        kicker.className = "worth-it-chat-delete-confirm-kicker";
        kicker.textContent = "WORTH IT · MESSAGE ACTION";
        const title = document.createElement("h2");
        title.id = "worthItChatDeleteConfirmTitle";
        title.textContent = "Delete message for everyone?";
        const description = document.createElement("p");
        description.id = "worthItChatDeleteConfirmDescription";
        description.textContent = "The text and attachment link will be removed, and this cannot be undone.";

        const preferenceLabel = document.createElement("label");
        preferenceLabel.className = "worth-it-chat-delete-confirm-preference";
        const preference = document.createElement("input");
        preference.type = "checkbox";
        preference.id = "worthItChatDeleteConfirmSkip";
        const preferenceText = document.createElement("span");
        preferenceText.textContent = "Don't show this again";
        preferenceLabel.append(preference, preferenceText);

        const actions = document.createElement("div");
        actions.className = "worth-it-chat-delete-confirm-actions";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "worth-it-chat-delete-confirm-cancel";
        cancelButton.textContent = "Cancel";
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "worth-it-chat-delete-confirm-delete";
        deleteButton.textContent = "Delete message";
        actions.append(cancelButton, deleteButton);
        card.append(kicker, title, description, preferenceLabel, actions);
        overlay.appendChild(card);

        let finished = false;
        const finish = confirmed => {
            if (finished) return;
            finished = true;
            if (confirmed && preference.checked) {
                rememberWorthItChatDeleteConfirmationPreference(userId);
            }
            overlay.remove();
            if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
                previousFocus.focus();
            }
            resolve(Boolean(confirmed));
        };
        overlay.addEventListener("click", event => {
            if (event.target === overlay) finish(false);
        });
        overlay.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finish(false);
                return;
            }
            if (event.key !== "Tab") return;
            const focusable = Array.from(overlay.querySelectorAll('input[type="checkbox"], button'))
                .filter(node => !node.disabled);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        });
        cancelButton.addEventListener("click", () => finish(false));
        deleteButton.addEventListener("click", () => finish(true));
        document.body.appendChild(overlay);
        cancelButton.focus();
    });
}

async function runWorthItChatMessageAction(action, message) {
    if (!chatUser || !message?.id || !sb()) return;
    const actionUserId = chatUser.id;
    if (action === "delete" && message.sender_user_id !== actionUserId) {
        setStatus("You can only delete your own messages for everyone.", true);
        return;
    }
    if (action === "delete" && !(await confirmWorthItChatMessageDelete(actionUserId))) return;
    // The custom confirmation is asynchronous, unlike window.confirm. Never continue
    // a destructive action if the signed-in account changed while it was open.
    if (!chatUser || chatUser.id !== actionUserId || !sb()) return;
    if (action === "delete" && message.sender_user_id !== chatUser.id) {
        setStatus("You can only delete your own messages for everyone.", true);
        return;
    }
    setStatus(action === "delete" ? "Deleting message for everyone…" : "Hiding message for you…", false);
    try {
        const rpcName = action === "delete" ? "delete_worth_it_chat_message" : "hide_worth_it_chat_message";
        const result = await sb().rpc(rpcName, {p_message_id: Number(message.id)});
        if (result.error) throw result.error;
        if (!result.data?.success) {
            const errors = {
                NOT_MESSAGE_OWNER: "You can only delete your own messages for everyone.",
                NOT_A_CHAT_MEMBER: "You are no longer a member of this conversation.",
                MESSAGE_NOT_FOUND: "This message no longer exists.",
                INVALID_MESSAGE: "This message cannot be changed."
            };
            throw new Error(errors[result.data?.code] || result.data?.code || "Could not update this message.");
        }
        // Invalidate any poll that began before the destructive RPC completed.
        // Its response must never restore the original message after the action succeeds.
        chatMessageRequestVersion += 1;
        chatLoading = false;
        const latest = chatMessages.find(item => String(item.id) === String(message.id));
        const deletedAttachmentUrl = message.media_url;
        const deletedAttachmentType = message.media_type;
        if (latest) {
            latest.body = "";
            latest.media_url = null;
            latest.media_type = null;
            latest.filtered_reason = null;
            if (action === "delete") {
                latest.is_deleted = true;
                latest.is_hidden_by_me = false;
                latest.deleted_by_display_name = latest.display_name || latest.username || "Worth It member";
            } else {
                latest.is_hidden_by_me = true;
                latest.deleted_by_display_name = chatUser.display_name || chatUser.username || "You";
            }
        }
        // Update this screen immediately; storage cleanup can finish afterwards.
        renderMessages(false);
        let attachmentCleanupFailed = false;
        if (action === "delete" && deletedAttachmentUrl) {
            if (deletedAttachmentType === "audio") {
                const audioRef = String(deletedAttachmentUrl).match(/^worthit-audio:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+)$/i);
                try {
                    const session = await sb().auth.getSession();
                    const token = session?.data?.session?.access_token || "";
                    if (!audioRef || !token) throw new Error("Could not verify the stored voice file.");
                    const query = new URLSearchParams({conversation_id: audioRef[1], path: audioRef[2]});
                    const response = await fetch("/api/chat-audio?" + query.toString(), {
                        method: "DELETE", headers: {Authorization: "Bearer " + token},
                        credentials: "same-origin", cache: "no-store"
                    });
                    if (!response.ok) attachmentCleanupFailed = true;
                } catch (_) { attachmentCleanupFailed = true; }
            } else {
                const objectPath = getOwnedWorthItChatMediaObjectPath(deletedAttachmentUrl, chatUser.id, sb());
                if (!objectPath) {
                    // Never delete an object unless its ownership can be verified.
                    attachmentCleanupFailed = true;
                } else {
                    try {
                        const {error: storageError} = await sb().storage.from("worth-it-chat-media").remove([objectPath]);
                        if (storageError) attachmentCleanupFailed = true;
                    } catch (_) { attachmentCleanupFailed = true; }
                }
            }
        }
        await refreshWorthItChatData();
        await loadWorthItChatMessages(false, true);
        if (attachmentCleanupFailed) {
            setStatus(deletedAttachmentType === "audio"
                ? "Message deleted, but its private voice file could not be removed from storage."
                : "Message deleted, but its uploaded attachment could not be removed from storage. The chat message is hidden; the file may still be accessible by its direct URL.", true);
        } else {
            setStatus(action === "delete" ? "Message deleted for everyone." : "Message hidden for you. Other members can still see it.", false);
        }
    } catch (error) {
        setStatus(rpcError(error), true);
    }
}
function createWorthItChatMessageActions(message, mine) {
    const toolbar = document.createElement("div");
    toolbar.className = "worth-it-chat-message-actions";
    toolbar.setAttribute("aria-label", "Message actions");
    toolbar.appendChild(makeWorthItChatMessageActionButton(
        "Copy message", "▢", "worth-it-chat-message-action-btn",
        () => copyWorthItChatMessage(message)
    ));
    toolbar.appendChild(makeWorthItChatMessageActionButton(
        "Quote in reply", "↩", "worth-it-chat-message-action-btn",
        () => quoteWorthItChatMessage(message)
    ));
    const moreWrap = document.createElement("div");
    moreWrap.className = "worth-it-chat-message-more";
    const moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "worth-it-chat-message-action-btn worth-it-chat-message-more-btn";
    moreButton.textContent = "⋯";
    moreButton.title = "More message options";
    moreButton.setAttribute("aria-label", "More message options");
    moreButton.setAttribute("aria-haspopup", "menu");
    moreButton.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "worth-it-chat-message-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    const addMenuItem = (label, onClick, danger) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "worth-it-chat-message-menu-item" + (danger ? " is-danger" : "");
        item.setAttribute("role", "menuitem");
        item.textContent = label;
        item.addEventListener("click", async () => {
            closeWorthItChatMessageMenus();
            menu.hidden = true;
            moreButton.setAttribute("aria-expanded", "false");
            try {
                await onClick();
            } catch (error) {
                setStatus(rpcError(error), true);
            }
        });
        menu.appendChild(item);
    };
    addMenuItem("Copy message", () => copyWorthItChatMessage(message), false);
    addMenuItem("Quote in reply", () => quoteWorthItChatMessage(message), false);
    addMenuItem("Hide message for me", () => runWorthItChatMessageAction("hide", message), false);
    if (mine) addMenuItem("Delete message for everyone", () => runWorthItChatMessageAction("delete", message), true);
    moreButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const shouldOpen = menu.hidden;
        closeWorthItChatMessageMenus(menu);
        menu.hidden = !shouldOpen;
        moreButton.setAttribute("aria-expanded", String(shouldOpen));
    });
    moreWrap.append(moreButton, menu);
    toolbar.appendChild(moreWrap);
    return toolbar;
}

function makeWorthItChatMessageAvatar(message) {
    const avatar = makeAvatar(message);
    const indicator = avatar.querySelector(":scope > .worth-it-presence-indicator");
    if (indicator) {
        // Keep the status button as a sibling of the profile link: the two
        // controls must have independent click and keyboard targets.
        indicator.remove();
        avatar.classList.remove("worth-it-presence-host");
    }
    const wrapper = document.createElement("span");
    wrapper.className = "worth-it-chat-message-avatar-wrap worth-it-presence-host";
    const profileLink = makeChatProfileLink(
        message,
        "worth-it-chat-message-avatar-link",
        avatar
    );
    wrapper.appendChild(profileLink);
    if (indicator) wrapper.appendChild(indicator);
    return wrapper;
}

function createWorthItChatMessageRow(message) {
    const mine = message.sender_user_id === chatUser.id;
    const signature = chatMessageRenderSignature(message);
    const row = document.createElement("article");
    row.className = "worth-it-chat-message" + (mine ? " is-mine" : "");
    row.dataset.messageId = String(message.id ?? "");
    row.dataset.worthItMessageSignature = signature;
    row.appendChild(makeWorthItChatMessageAvatar(message));
    const stack = document.createElement("div");
    stack.className = "worth-it-chat-message-stack";
    const name = makeChatProfileLink(message, "worth-it-chat-message-name", message.display_name || message.username || "Worth It member");
    if (!message.is_deleted && !message.is_hidden_by_me) stack.appendChild(name);

    if (message.is_deleted || message.is_hidden_by_me) {
        row.classList.add("is-tombstone");
        const note = document.createElement("p");
        note.className = "worth-it-chat-message-system-note";
        note.textContent = message.is_deleted
            ? "The message has been deleted by " + (message.deleted_by_display_name || message.display_name || message.username || "a member") + "."
            : "This message has been hidden by you (only you can see this).";
        stack.appendChild(note);
    } else {
        const bubble = document.createElement("div");
        bubble.className = "worth-it-chat-bubble";
        let visibleBody = String(message.body || "");
        const replySeparator = visibleBody.indexOf("\n\n");
        if (replySeparator > 0 && visibleBody.startsWith("> ")) {
            const quoteLine = visibleBody.slice(2, visibleBody.indexOf("\n"));
            const quoteColon = quoteLine.indexOf(": ");
            if (quoteColon > 0) {
                const quoteBlock = document.createElement("div");
                quoteBlock.className = "worth-it-chat-message-reply-quote";
                const quoteAuthor = document.createElement("strong");
                quoteAuthor.textContent = quoteLine.slice(0, quoteColon);
                const quoteText = document.createElement("span");
                quoteText.textContent = quoteLine.slice(quoteColon + 2);
                quoteBlock.append(quoteAuthor, quoteText);
                bubble.appendChild(quoteBlock);
                visibleBody = visibleBody.slice(replySeparator + 2);
            }
        }
        if (visibleBody) renderLinkedText(bubble, visibleBody);
        if (message.media_url && ["image", "gif", "video", "audio"].includes(message.media_type)) {
            if (message.media_type === "audio") {
                const audioButton = document.createElement("button");
                audioButton.type = "button";
                audioButton.className = "worth-it-chat-audio-play";
                audioButton.textContent = "▶ Play voice message";
                const audio = document.createElement("audio");
                audio.className = "worth-it-chat-audio";
                audio.controls = true;
                audio.preload = "none";
                audio.hidden = true;
                audio.setAttribute("aria-label", "Voice message playback");
                audioButton.addEventListener("click", () => {
                    if (typeof window.worthItChatPlayVoiceMessage === "function") void window.worthItChatPlayVoiceMessage(audioButton, audio, message.media_url);
                    else setStatus("Voice messages are loading. Please try again.", true);
                });
                // Signed voice URLs expire intentionally. Request a fresh URL on replay.
                audio.addEventListener("ended", () => {
                    audio.pause();
                    audio.removeAttribute("src");
                    audio.load();
                    audio.hidden = true;
                    audioButton.hidden = false;
                    audioButton.disabled = false;
                    audioButton.textContent = "▶ Play voice message";
                });
                audio.addEventListener("error", () => {
                    if (audio.hidden) return;
                    audio.removeAttribute("src");
                    audio.load();
                    audio.hidden = true;
                    audioButton.hidden = false;
                    audioButton.disabled = false;
                    audioButton.textContent = "▶ Try voice message again";
                });
                bubble.append(audioButton, audio);
            } else if (message.media_type === "video") {
                const video = document.createElement("video");
                video.className = "worth-it-chat-media worth-it-chat-video";
                video.src = message.media_url;
                video.controls = true;
                video.preload = "metadata";
                video.playsInline = true;
                video.setAttribute("aria-label", "Shared video");
                video.addEventListener("error", () => {
                    const fallback = document.createElement("a");
                    fallback.className = "worth-it-chat-link";
                    fallback.href = message.media_url;
                    fallback.target = "_blank";
                    fallback.rel = "noopener noreferrer";
                    fallback.textContent = "Open attached video";
                    video.replaceWith(fallback);
                });
                bubble.appendChild(video);
            } else {
                const img = document.createElement("img");
                img.className = "worth-it-chat-media";
                img.src = message.media_url;
                img.alt = message.media_type === "gif" ? "Shared GIF" : "Shared image";
                img.loading = "lazy";
                img.referrerPolicy = "no-referrer";
                img.tabIndex = 0;
                img.setAttribute("role", "button");
                img.setAttribute("aria-label", "Open image full screen");
                img.addEventListener("click", () => openWorthItChatImageLightbox(message.media_url, img.alt));
                img.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openWorthItChatImageLightbox(message.media_url, img.alt);
                    }
                });
                img.addEventListener("error", () => {
                    const fallback = document.createElement("a");
                    fallback.className = "worth-it-chat-link";
                    fallback.href = message.media_url;
                    fallback.target = "_blank";
                    fallback.rel = "noopener noreferrer";
                    fallback.textContent = "Open attached media";
                    img.replaceWith(fallback);
                });
                bubble.appendChild(img);
            }
        }
        stack.appendChild(bubble);
        if (message.filtered_reason) {
            const reason = document.createElement("p");
            reason.className = "worth-it-chat-filter-reason";
            reason.textContent = "Filtered: " + message.filtered_reason;
            stack.appendChild(reason);
        }
    }

    const time = document.createElement("time");
    time.className = "worth-it-chat-message-time";
    time.dateTime = escapeText(message.created_at);
    time.textContent = niceDay(message.created_at) + " · " + niceTime(message.created_at);
    stack.appendChild(time);
    if (!message.is_deleted && !message.is_hidden_by_me) {
        if (mine && activeConversationType === "direct") {
            const receipt = document.createElement("span");
            receipt.className = "worth-it-chat-message-receipt " + (message.is_seen ? "is-seen" : "is-sent");
            receipt.textContent = message.is_seen ? "✓✓ Seen" : "✓ Sent";
            receipt.title = message.is_seen ? "Your friend has seen this message" : "Sent · waiting to be seen";
            stack.appendChild(receipt);
        }
        stack.appendChild(createWorthItChatMessageActions(message, mine));
    }
    row.appendChild(stack);
    return row;
}

function updateWorthItChatTravelPresentButton() {
    const host = $("worthItChatMessages");
    const button = $("worthItChatTravelPresentBtn");
    if (!host || !button) return;

    const distanceFromBottom = host.scrollHeight - host.scrollTop - host.clientHeight;
    const searchPanel = $("worthItChatSearchPanel");
    const isMessageSearchOpen = Boolean(searchPanel && !searchPanel.hidden);
    const shouldShow = Boolean(
        !isMessageSearchOpen &&
        chatOpen &&
        chatUser &&
        chatMessages.length &&
        host.scrollHeight > host.clientHeight + 80 &&
        distanceFromBottom > 80
    );
    const wasHidden = button.hidden;

    const main = button.closest(".worth-it-chat-main");
    const composer = main?.querySelector(".worth-it-chat-compose-wrap");
    const mainRect = main?.getBoundingClientRect();
    const composerRect = composer?.getBoundingClientRect();
    if (mainRect && composerRect && Number.isFinite(mainRect.bottom) && Number.isFinite(composerRect.top)) {
        // Anchor the button just above the composer, including when the mobile keyboard resizes the viewport.
        button.style.bottom = Math.max(64, mainRect.bottom - composerRect.top + 12) + "px";
    }

    button.hidden = !shouldShow;
    if (!shouldShow) {
        button.classList.remove("is-entering");
        return;
    }
    if (wasHidden) {
        button.classList.remove("is-entering");
        void button.offsetWidth;
        button.classList.add("is-entering");
        window.setTimeout(() => button.classList.remove("is-entering"), 280);
    }
}

function closeWorthItChatImageLightbox() {
    const overlay = document.getElementById("worthItChatImageLightbox");
    if (!overlay) return;
    overlay.remove();
    document.removeEventListener("keydown", handleWorthItChatLightboxKeydown, true);
    document.body.classList.remove("worth-it-chat-image-lightbox-open");
}
function handleWorthItChatLightboxKeydown(event) {
    if (event.key === "Escape") {
        event.preventDefault();
        closeWorthItChatImageLightbox();
    }
}
function openWorthItChatImageLightbox(src, alt) {
    if (!src) return;
    closeWorthItChatImageLightbox();
    const overlay = document.createElement("div");
    overlay.id = "worthItChatImageLightbox";
    overlay.className = "worth-it-chat-image-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Full-screen image viewer");
    const image = document.createElement("img");
    image.className = "worth-it-chat-image-lightbox-image";
    image.src = src;
    image.alt = alt || "Shared image";
    image.draggable = false;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "worth-it-chat-image-lightbox-close";
    close.setAttribute("aria-label", "Close image viewer");
    close.title = "Close";
    close.textContent = "×";
    close.addEventListener("click", closeWorthItChatImageLightbox);
    overlay.addEventListener("click", event => {
        if (event.target === overlay) closeWorthItChatImageLightbox();
    });
    overlay.append(image, close);
    document.body.appendChild(overlay);
    document.body.classList.add("worth-it-chat-image-lightbox-open");
    document.addEventListener("keydown", handleWorthItChatLightboxKeydown, true);
    close.focus({ preventScroll: true });
}
function renderMessages(scrollToBottom) {
    const host = $("worthItChatMessages");
    host?.removeAttribute("aria-busy");
    if (!host) return;
    if (!chatUser && !chatAuthResolutionComplete) {
        // Supabase is still restoring the persisted session. Keep the existing
        // welcome/loading content instead of briefly showing a false sign-in prompt.
        host.setAttribute("aria-busy", "true");
        updateWorthItChatTravelPresentButton();
        return;
    }
    host.removeAttribute("aria-busy");
    if (!chatUser) {
        if (host.dataset.worthItChatEmptyKey !== "signed-out" ||
            !host.firstElementChild?.classList.contains("worth-it-chat-empty")) {
            host.replaceChildren();
            host.dataset.worthItChatEmptyKey = "signed-out";
            const empty = document.createElement("div"); empty.className = "worth-it-chat-empty";
            const icon = document.createElement("span"); icon.textContent = "✦";
            const title = document.createElement("strong"); title.textContent = "Sign in to use chat";
            const p = document.createElement("p"); p.textContent = "Messages, friend chats and Global Chat are available to Worth It members.";
            const signIn = document.createElement("button");
            signIn.type = "button";
            signIn.className = "worth-it-chat-signin-btn";
            signIn.textContent = "Sign in / Create account";
            signIn.addEventListener("click", () => { if (typeof window.handleAuthButton === "function") window.handleAuthButton(); });
            empty.append(icon,title,p,signIn); host.appendChild(empty);
        }
        updateWorthItChatTravelPresentButton();
        return;
    }
    if (!chatMessages.length) {
        const emptyKey = "empty:" + activeConversationType + ":" + String(activeConversationId || "");
        if (host.dataset.worthItChatEmptyKey !== emptyKey ||
            !host.firstElementChild?.classList.contains("worth-it-chat-empty")) {
            host.replaceChildren();
            host.dataset.worthItChatEmptyKey = emptyKey;
            const empty = document.createElement("div"); empty.className = "worth-it-chat-empty";
            const icon = document.createElement("span"); icon.textContent = activeConversationType === "global" ? "🌐" : "✦";
            const title = document.createElement("strong"); title.textContent = activeConversationType === "global" ? "Say hello to the community" : "Start the conversation";
            const p = document.createElement("p"); p.textContent = activeConversationType === "global" ? "Be welcoming, keep it respectful, and enjoy the chat." : "Send the first message to get things going.";
            empty.append(icon,title,p); host.appendChild(empty);
        }
        updateWorthItChatTravelPresentButton();
        return;
    }
    delete host.dataset.worthItChatEmptyKey;

    const existingRows = new Map(Array.from(host.querySelectorAll(":scope > article.worth-it-chat-message[data-message-id]"))
        .map(row => [row.dataset.messageId, row]));
    const nextRows = [];
    for (const message of chatMessages) {
        const id = String(message.id ?? "");
        const signature = chatMessageRenderSignature(message);
        const previous = existingRows.get(id);
        let row;
        if (previous && previous.dataset.worthItMessageSignature === signature) {
            row = previous;
            existingRows.delete(id);
        } else {
            row = createWorthItChatMessageRow(message);
            if (previous) {
                previous.replaceWith(row);
                existingRows.delete(id);
            }
        }
        nextRows.push(row);
    }
    existingRows.forEach(row => row.remove());
    const nextSet = new Set(nextRows);
    Array.from(host.children).forEach(child => { if (!nextSet.has(child)) child.remove(); });
    nextRows.forEach((row, index) => {
        const current = host.children[index] || null;
        if (current !== row) host.insertBefore(row, current);
    });
    if (scrollToBottom) host.scrollTop = host.scrollHeight;
    updateWorthItChatTravelPresentButton();
}

async function loadWorthItChatMessages(scrollToBottom, force = false) {
    const client = sb();
    if (!client || !chatUser || (chatLoading && !force) || chatRouteAccessDenied) return;
    chatLoading = true;
    const requestVersion = ++chatMessageRequestVersion;
    const requestUserId = chatUser.id;
    const conversationId = activeConversationId;
    const conversationType = activeConversationType;
    let result;
    try {
        result = await client.rpc("get_worth_it_chat_messages", {
            p_conversation_id: conversationId,
            p_limit: 100
        });
    } catch (error) {
        if (requestVersion !== chatMessageRequestVersion) return;
        chatLoading = false;
        setStatus(rpcError(error), true);
        return;
    }
    if (requestVersion !== chatMessageRequestVersion) return;
    chatLoading = false;
    if (!chatUser || chatUser.id !== requestUserId || chatRouteAccessDenied) return;
    if (conversationId !== activeConversationId || conversationType !== activeConversationType) return;
    if (result.error) { setStatus(rpcError(result.error), true); return; }
    if (result.data && !Array.isArray(result.data) && result.data.success === false) { setStatus(result.data.code || "This conversation is unavailable.", true); return; }
    const rows = Array.isArray(result.data) ? result.data : [];
    cacheWorthItChatMessages(worthItChatMessageCacheKey(requestUserId, conversationType, conversationId), rows);
    const previousLastId = chatMessages.length ? chatMessages[chatMessages.length - 1].id : null;
    const newLastId = rows.length ? rows[rows.length - 1].id : null;
    chatMessages = rows;
    renderMessages(Boolean(scrollToBottom || (previousLastId !== newLastId && $("worthItChatMessages") && $("worthItChatMessages").scrollHeight - $("worthItChatMessages").scrollTop - $("worthItChatMessages").clientHeight < 550)));
    const readConversation = activeConversationType === "global"
        ? chatConversations.find(item => item.type === "global")
        : chatConversations.find(item => item.id === activeConversationId);
    if (readConversation) readConversation.unread_count = 0;
    updateUnreadBadge();
    renderFriends();
    renderConversations();
}
async function activateConversation(id, type, title, person, inviteToken) {
    const nextType = type || "global";
    const nextId = id || null;
    const currentKey = worthItChatMessageCacheKey();
    if (currentKey && chatMessages.length) cacheWorthItChatMessages(currentKey, chatMessages);
    const sameConversation = activeConversationType === nextType &&
        String(activeConversationId || "") === String(nextId || "");
    const nextKey = worthItChatMessageCacheKey(chatUser?.id, nextType, nextId);

    // Save the composer and visible messages before changing any active IDs.
    saveActiveWorthItChatDraft();
    closeWorthItChatPickers();
    activeConversationId = nextId;
    activeConversationType = nextType;
    chatRouteAccessDenied = false;
    activeConversationTitle = title || GLOBAL_TITLE;
    activeConversationPerson = person || null;
    activeConversationInviteToken = String(inviteToken || chatConversations.find(item => item.id === activeConversationId)?.invite_token || "");
    if (!sameConversation) {
        chatMessages = worthItChatMessageCache.has(nextKey)
            ? worthItChatMessageCache.get(nextKey).slice()
            : [];
    }
    rememberLastWorthItChatConversation();
    restoreWorthItChatDraft(worthItChatDraftKey());
    syncChatUrlForConversation(activeConversationType, activeConversationId, activeConversationPerson, activeConversationInviteToken);
    if (window.matchMedia("(max-width: 540px)").matches) $("worthItChatWindow")?.classList.remove("is-mobile-sidebar");
    document.querySelectorAll(".worth-it-chat-side-item").forEach(node => node.classList.toggle("is-active", node.id === "worthItGlobalChatBtn" && activeConversationType === "global"));
    renderFriends(); renderConversations();
    const subtitle = activeConversationType === "global" ? "A shared space for the Worth It community" : activeConversationType === "group" ? "Group conversation · " + (chatConversations.find(c => c.id === id)?.members?.length || 2) + " members" : (window.getWorthItPresenceInfo ? window.getWorthItPresenceInfo(activeConversationPerson).label : "Private conversation with your friend");
    setHeader(activeConversationTitle, subtitle, activeConversationPerson);
    updateChatHeaderNotificationButton();
    updateChatHeaderShareButton();
    setStatus("", false);
    renderMessages();
    await syncWorthItChatRealtimeChannel();
    await loadWorthItChatMessages(true, true);
}
window.showWorthItChatSidebar = function () { if (window.matchMedia("(max-width: 540px)").matches) $("worthItChatWindow")?.classList.add("is-mobile-sidebar"); };
window.openWorthItGlobalChat = async function () {
    if (!chatUser) { renderMessages(); return; }
    await activateConversation(null, "global", GLOBAL_TITLE, null);
};
window.openWorthItFriendChat = async function (worthItId) {
    if (!chatUser) return;
    const friend = chatFriends.find(item => Number(item.worth_it_id) === Number(worthItId));
    if (!friend) { setStatus("Only your current friends can start a private chat.", true); return; }
    setStatus("Opening conversation…", false);
    const result = await sb().rpc("open_worth_it_friend_chat", {target_worth_it_id: Number(worthItId)});
    if (result.error) { setStatus(rpcError(result.error), true); return; }
    if (!result.data?.success || !result.data?.conversation_id) {
        setStatus(result.data?.code === "FRIENDS_ONLY" ? "You must be friends to start a private chat." : "Could not open this conversation.", true);
        return;
    }
    await refreshWorthItChatData();
    await activateConversation(result.data.conversation_id, "direct", friend.display_name || friend.username || "Friend chat", friend);
};
async function openWorthItSavedConversation(conversation) {
    const members = Array.isArray(conversation.members) ? conversation.members : [];
    await activateConversation(conversation.id, conversation.type, conversationLabel(conversation), members[0] || null, conversation.invite_token || "");
}

function currentWorthItChatRealtimeConversationId() {
    if (activeConversationType === "global") return WORTH_IT_GLOBAL_CHAT_REALTIME_ID;
    const id = String(activeConversationId || "");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
}
async function getWorthItChatOwnProfile() {
    const userId = chatUser?.id;
    if (!userId || !sb()) return null;
    if (chatOwnProfileLoadedForUser === userId) return chatOwnProfile;
    if (chatOwnProfilePromise?.userId === userId) return chatOwnProfilePromise.promise;
    const client = sb();
    const promise = (async () => {
        let profile = null;
        try {
            const result = await client.rpc("get_worth_it_own_profile");
            if (!result.error && result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
                profile = result.data;
            }
        } catch (_) {
            // Typing indicators are optional. Fall back to the session metadata.
        }
        if (chatUser?.id === userId) {
            chatOwnProfile = profile;
            chatOwnProfileLoadedForUser = userId;
        }
        return chatUser?.id === userId ? profile : null;
    })();
    chatOwnProfilePromise = {userId, promise};
    try {
        return await promise;
    } finally {
        if (chatOwnProfilePromise?.promise === promise) chatOwnProfilePromise = null;
    }
}
function worthItChatTypingIdentity(profile, user) {
    const metadata = user?.user_metadata || {};
    return {
        display_name: String(profile?.display_name || metadata.display_name || metadata.full_name || metadata.username || "Worth It member").trim().slice(0, 80),
        username: String(profile?.username || metadata.username || "").trim().slice(0, 40)
    };
}
function hideWorthItChatTyping() {
    const node = $("worthItChatTyping");
    if (node) {
        node.hidden = true;
        node.dataset.typingMessage = "";
        node.replaceChildren();
    }
}
function clearWorthItChatTypingBroadcastState() {
    chatTypingBroadcastExpiryTimers.forEach(timer => window.clearTimeout(timer));
    chatTypingBroadcastExpiryTimers.clear();
    chatTypingBroadcastUsers.clear();
}
function renderWorthItChatTyping(channel = chatRealtimeChannel) {
    const node = $("worthItChatTyping");
    if (!node) return;
    if (!channel || channel !== chatRealtimeChannel || activeConversationType === "global" || !chatOpen || !chatUser) {
        hideWorthItChatTyping();
        return;
    }
    let presence = {};
    try {
        presence = channel.presenceState() || {};
    } catch (_) {
        hideWorthItChatTyping();
        return;
    }
    const currentUserId = chatUser.id;
    const people = new Map();
    Object.values(presence).forEach(entries => {
        (Array.isArray(entries) ? entries : [entries]).forEach(entry => {
            if (!entry || entry.typing !== true || !entry.user_id || String(entry.user_id) === String(currentUserId)) return;
            if (!people.has(String(entry.user_id))) {
                const userId = String(entry.user_id);
                const broadcastState = chatTypingBroadcastUsers.get(userId);
                if (broadcastState?.channel === channel && broadcastState.typing === false) return;
                const name = String(entry.display_name || entry.username || "A member").trim().slice(0, 80);
                people.set(userId, name || "A member");
            }
        });
    });
    // Broadcast events provide a low-latency path; Presence remains the fallback.
    chatTypingBroadcastUsers.forEach((entry, userId) => {
        if (entry.channel !== channel || entry.typing !== true || userId === String(currentUserId)) return;
        if (!people.has(userId)) people.set(userId, entry.display_name || "A member");
    });
    const names = Array.from(people.values());
    let message = "";
    if (names.length === 1) message = names[0] + " is typing…";
    else if (names.length === 2) message = names[0] + " and " + names[1] + " are typing…";
    else if (names.length === 3) message = names.join(", ") + " are typing…";
    else if (names.length > 3) message = names.slice(0, 3).join(", ") + " and more are typing…";
    node.hidden = !message;
    if (node.dataset.typingMessage === message) return;
    node.dataset.typingMessage = message;
    node.replaceChildren();
    if (!message) return;

    const dots = document.createElement("span");
    dots.className = "worth-it-chat-typing-dots";
    dots.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 3; index += 1) {
        const dot = document.createElement("span");
        dot.className = "worth-it-chat-typing-dot";
        dot.style.setProperty("--typing-dot-index", String(index));
        dots.appendChild(dot);
    }
    const label = document.createElement("span");
    label.className = "worth-it-chat-typing-label";
    label.textContent = message;
    node.append(dots, label);
}
function handleWorthItChatTypingBroadcast(channel, event) {
    if (channel !== chatRealtimeChannel || !chatOpen || activeConversationType === "global" || !chatUser) return;
    const payload = event?.payload || {};
    const userId = String(payload.user_id || "");
    if (!userId || userId === String(chatUser.id)) return;

    const oldTimer = chatTypingBroadcastExpiryTimers.get(userId);
    if (oldTimer) window.clearTimeout(oldTimer);
    const typing = payload.typing === true;
    const name = String(payload.display_name || payload.username || "A member").trim().slice(0, 80) || "A member";
    chatTypingBroadcastUsers.set(userId, { display_name: name, typing, channel });

    const timer = window.setTimeout(() => {
        const current = chatTypingBroadcastUsers.get(userId);
        if (current?.channel === channel && current.typing === typing) {
            chatTypingBroadcastUsers.delete(userId);
        }
        chatTypingBroadcastExpiryTimers.delete(userId);
        if (channel === chatRealtimeChannel) renderWorthItChatTyping(channel);
    }, typing ? CHAT_TYPING_BROADCAST_TTL_MS : 2500);
    chatTypingBroadcastExpiryTimers.set(userId, timer);
    renderWorthItChatTyping(channel);
}
async function sendWorthItChatTypingBroadcast(typing, channel = chatRealtimeChannel, user = chatUser) {
    if (!channel || !user || channel !== chatRealtimeChannel || !chatRealtimeSubscribed) return;
    if (typing && (!chatTypingActive || !chatTypingReadyToPublish || !chatOpen || activeConversationType === "global")) return;
    const identity = worthItChatTypingIdentity(chatOwnProfile, user);
    try {
        await channel.send({
            type: "broadcast",
            event: "typing",
            payload: {
                user_id: user.id,
                display_name: identity.display_name,
                username: identity.username,
                typing: Boolean(typing)
            }
        });
    } catch (_) {
        // Presence remains the fallback if the fast broadcast path is unavailable.
    }
}
function startWorthItChatTypingBroadcastPulse(channel) {
    if (chatTypingBroadcastTimer || !channel) return;
    chatTypingBroadcastTimer = window.setInterval(() => {
        if (!chatTypingActive || !chatTypingReadyToPublish || !chatRealtimeSubscribed ||
            channel !== chatRealtimeChannel || !chatOpen || activeConversationType === "global") return;
        void sendWorthItChatTypingBroadcast(true, channel, chatUser);
    }, CHAT_TYPING_BROADCAST_REFRESH_MS);
}
async function publishWorthItChatTyping(typing, channel = chatRealtimeChannel) {
    const user = chatUser;
    if (!channel || !user || !chatRealtimeSubscribed) return;
    if (typing && (!chatTypingActive || !chatTypingReadyToPublish ||
        activeConversationType === "global" || !chatOpen || channel !== chatRealtimeChannel)) return;
    const profile = chatOwnProfile;
    if (!chatUser || chatUser.id !== user.id || !chatRealtimeSubscribed || channel !== chatRealtimeChannel) return;
    if (typing && activeConversationType === "global") return;

    // The first signal is intentionally delayed by about a second; identity loading
    // never adds extra latency because session metadata is published while the RPC runs.
    if (typing && !profile && chatOwnProfileLoadedForUser !== user.id) {
        void getWorthItChatOwnProfile().then(refreshedProfile => {
            if (
                refreshedProfile &&
                chatTypingActive &&
                chatUser?.id === user.id &&
                chatRealtimeSubscribed &&
                channel === chatRealtimeChannel &&
                activeConversationType !== "global"
            ) {
                void publishWorthItChatTyping(true, channel);
            }
        }).catch(() => {});
    }

    const identity = worthItChatTypingIdentity(profile, user);
    if (typing) {
        void sendWorthItChatTypingBroadcast(true, channel, user);
        startWorthItChatTypingBroadcastPulse(channel);
    } else {
        void sendWorthItChatTypingBroadcast(false, channel, user);
    }
    try {
        await channel.track({
            user_id: user.id,
            display_name: identity.display_name,
            username: identity.username,
            typing: Boolean(typing)
        });
    } catch (_) {
        // If Presence is temporarily unavailable, message sending and receiving still work.
    }
}
function stopWorthItChatTyping(publish = true) {
    if (chatTypingStopTimer) window.clearTimeout(chatTypingStopTimer);
    if (chatTypingStartTimer) window.clearTimeout(chatTypingStartTimer);
    if (chatTypingBroadcastTimer) window.clearInterval(chatTypingBroadcastTimer);
    chatTypingStopTimer = null;
    chatTypingStartTimer = null;
    chatTypingBroadcastTimer = null;
    const wasTyping = chatTypingActive && chatTypingReadyToPublish;
    chatTypingActive = false;
    chatTypingReadyToPublish = false;
    if (publish && wasTyping) void publishWorthItChatTyping(false, chatRealtimeChannel);
}
function handleWorthItChatTypingInput() {
    const input = $("worthItChatInput");
    if (!chatUser || !chatOpen || activeConversationType === "global" || !chatRealtimeChannel ||
        !String(input?.value || "").trim()) {
        stopWorthItChatTyping();
        return;
    }
    if (!chatTypingActive) {
        chatTypingActive = true;
        chatTypingReadyToPublish = false;
        chatTypingStartTimer = window.setTimeout(() => {
            chatTypingStartTimer = null;
            if (!chatTypingActive || !chatOpen || activeConversationType === "global" ||
                !String($("worthItChatInput")?.value || "").trim()) {
                stopWorthItChatTyping();
                return;
            }
            chatTypingReadyToPublish = true;
            if (chatRealtimeSubscribed) void publishWorthItChatTyping(true, chatRealtimeChannel);
        }, CHAT_TYPING_START_DELAY_MS);
    }
    if (chatTypingStopTimer) window.clearTimeout(chatTypingStopTimer);
    chatTypingStopTimer = window.setTimeout(() => stopWorthItChatTyping(true), 1800);
}
function stopWorthItChatRealtimeChannel() {
    const oldChannel = chatRealtimeChannel;
    const client = sb();
    chatRealtimeGeneration += 1;
    chatRealtimeChannel = null;
    chatRealtimeTopic = "";
    chatRealtimeSubscribed = false;
    stopWorthItChatTyping(false);
    clearWorthItChatTypingBroadcastState();
    if (chatRealtimeRefreshTimer) window.clearTimeout(chatRealtimeRefreshTimer);
    chatRealtimeRefreshTimer = null;
    if (chatRealtimeRetryTimer) window.clearTimeout(chatRealtimeRetryTimer);
    chatRealtimeRetryTimer = null;
    hideWorthItChatTyping();
    if (oldChannel && client) {
        try {
            const removal = client.removeChannel(oldChannel);
            if (removal && typeof removal.catch === "function") removal.catch(() => {});
        } catch (_) {
            // The fallback poll continues to work if a channel cannot be detached.
        }
    }
}
async function syncWorthItChatRealtimeChannel() {
    const client = sb();
    const userId = chatUser?.id;
    const conversationId = currentWorthItChatRealtimeConversationId();
    if (!client || !userId || !chatOpen || chatRouteAccessDenied || !conversationId) {
        stopWorthItChatRealtimeChannel();
        return;
    }
    const topic = "worthit-chat:" + conversationId;
    if (chatRealtimeChannel && chatRealtimeTopic === topic) return;
    stopWorthItChatRealtimeChannel();
    const generation = chatRealtimeGeneration;
    let channel;
    try {
        channel = client.channel(topic, {
            config: {
                private: true,
                presence: {key: String(userId)}
            }
        });
        chatRealtimeChannel = channel;
        chatRealtimeTopic = topic;
        chatRealtimeSubscribed = false;
        channel.on("broadcast", {event: "typing"}, event => handleWorthItChatTypingBroadcast(channel, event));
        channel.on("broadcast", {event: "message_changed"}, event => {
            if (channel !== chatRealtimeChannel || !chatOpen || !chatUser) return;
            const payload = event?.payload || event || {};
            const currentId = currentWorthItChatRealtimeConversationId();
            if (!currentId || String(payload.conversation_id || "") !== currentId) return;
            if (chatRealtimeRefreshTimer) window.clearTimeout(chatRealtimeRefreshTimer);
            chatRealtimeRefreshTimer = window.setTimeout(() => {
                chatRealtimeRefreshTimer = null;
                if (channel === chatRealtimeChannel && chatOpen && chatUser) {
                    void loadWorthItChatMessages(false, true);
                }
            }, 50);
        });
        if (activeConversationType !== "global") {
            channel.on("presence", {event: "sync"}, () => renderWorthItChatTyping(channel));
            channel.on("presence", {event: "join"}, () => renderWorthItChatTyping(channel));
            channel.on("presence", {event: "leave"}, () => renderWorthItChatTyping(channel));
        }
        channel.subscribe(status => {
            if (channel !== chatRealtimeChannel || generation !== chatRealtimeGeneration) return;
            if (status === "SUBSCRIBED") {
                chatRealtimeSubscribed = true;
                if (chatRealtimeRetryTimer) window.clearTimeout(chatRealtimeRetryTimer);
                chatRealtimeRetryTimer = null;
                startWorthItChatPolling();
                if (chatTypingActive && chatTypingReadyToPublish) void publishWorthItChatTyping(true, channel);
                renderWorthItChatTyping(channel);
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                chatRealtimeSubscribed = false;
                startWorthItChatPolling();
                hideWorthItChatTyping();
                if (!chatRealtimeRetryTimer) {
                    chatRealtimeRetryTimer = window.setTimeout(() => {
                        chatRealtimeRetryTimer = null;
                        if (channel !== chatRealtimeChannel || !chatOpen || !chatUser) return;
                        stopWorthItChatRealtimeChannel();
                        void syncWorthItChatRealtimeChannel();
                    }, 2200);
                }
            }
        });
    } catch (error) {
        if (channel && channel === chatRealtimeChannel) stopWorthItChatRealtimeChannel();
        chatRealtimeSubscribed = false;
        startWorthItChatPolling();
        console.warn("Worth It chat live updates could not connect; fallback refresh remains enabled.", error);
    }
}

async function restoreLastWorthItChatConversation(saved) {
    if (!chatUser?.id || !saved || String(saved.userId || "") !== String(chatUser.id)) {
        await routeWorthItChatFromLocation();
        return;
    }
    if (saved.type === "global") {
        await activateConversation(null, "global", GLOBAL_TITLE, null);
        return;
    }
    if (saved.type === "direct") {
        let friend = chatFriends.find(item => String(item.worth_it_id) === String(saved.person?.worth_it_id || ""));
        if (!friend) {
            await refreshWorthItChatData();
            friend = chatFriends.find(item => String(item.worth_it_id) === String(saved.person?.worth_it_id || ""));
        }
        if (friend && saved.id) {
            await activateConversation(saved.id, "direct", friend.display_name || friend.username || saved.title || "Friend chat", friend);
            return;
        }
        await activateConversation(null, "global", GLOBAL_TITLE, null);
        setStatus("Your previous private chat is no longer available.", true);
        return;
    }
    if (saved.type === "group") {
        let group = chatConversations.find(item => String(item.id) === String(saved.id || "") && item.type === "group");
        if (!group) {
            await refreshWorthItChatData();
            group = chatConversations.find(item => String(item.id) === String(saved.id || "") && item.type === "group");
        }
        if (group) {
            await activateConversation(group.id, "group", group.title || saved.title || "Group chat",
                (Array.isArray(group.members) ? group.members[0] : null) || null, group.invite_token || saved.inviteToken || "");
            return;
        }
        await activateConversation(null, "global", GLOBAL_TITLE, null);
        setStatus("Your previous group chat is no longer available.", true);
        return;
    }
    await routeWorthItChatFromLocation();
}

function refreshWorthItChatOnForeground() {
    if (document.hidden || !chatOpen || !chatUser) return;
    const now = Date.now();
    // visibilitychange, focus and pageshow can fire together. Refresh only once
    // per short foreground transition, without rebuilding the current conversation.
    if (now - chatLastForegroundRefreshAt < 1200) return;
    chatLastForegroundRefreshAt = now;
    chatLastMessagePollAt = now;
    void syncWorthItChatRealtimeChannel();
    void loadWorthItChatMessages(false, true);
}

function startWorthItChatPolling() {
    if (!chatUser) return;
    if (chatPollTimer) window.clearInterval(chatPollTimer);
    chatLastMessagePollAt = Date.now();
    chatLastSidebarRefreshAt = Date.now();
    // Broadcast delivers messages immediately. If Realtime disconnects, poll quickly;
    // while connected, retain a five-second safety refresh for transient missed events.
    chatPollTimer = window.setInterval(() => {
        if (!chatOpen || !chatUser) return;
        const now = Date.now();
        if (!chatRealtimeSubscribed || now - chatLastMessagePollAt >= 5000) {
            chatLastMessagePollAt = now;
            void loadWorthItChatMessages(false);
        }
        if (now - chatLastSidebarRefreshAt >= 5000) {
            chatLastSidebarRefreshAt = now;
            void refreshWorthItChatData();
        }
    }, 1000);
}
window.toggleWorthItChat = async function (event) {
    event?.stopPropagation?.();
    if (chatOpen) {
        showChatOverlay(false);
        return;
    }
    if (!chatUser) {
        if (typeof window.handleAuthButton === "function") window.handleAuthButton();
        return;
    }
    if (!isChatRoutePath()) chatReturnPath = currentBrowserLocation() || "/";
    const lastConversation = getLastWorthItChatConversation();
    setChatBrowserPath("/chat", false);
    showChatOverlay(true, {skipRouteSync:true});
    setWorthItChatFullscreen(false);
    if (lastConversation) await restoreLastWorthItChatConversation(lastConversation);
    else await routeWorthItChatFromLocation();
    // Opening the mobile chat must not summon the on-screen keyboard automatically.
    if (!window.matchMedia("(max-width: 540px)").matches) {
        $("worthItChatInput")?.focus({ preventScroll: true });
    }
};
window.shareWorthItGroupInvite = async function () {
    const token = activeConversationInviteToken;
    if (!chatUser || activeConversationType !== "group" || !/^[0-9a-f]{64}$/.test(token)) return;
    const inviteUrl = window.location.origin + "/chat/group/" + token;
    try {
        await navigator.clipboard.writeText(inviteUrl);
        setStatus("Group invite link copied. Share it with the people you'd like to invite.", false);
    } catch (_) {
        window.prompt("Copy this group invite link:", inviteUrl);
    }
};
function updateCharacterCount() {
    const input = $("worthItChatInput");
    const count = $("worthItChatCharCount");
    if (count && input) count.textContent = String(input.value.length);
}
let pendingMediaObjectUrl = "";
function worthItChatDraftKey(userId = chatUser?.id, type = activeConversationType, id = activeConversationId) {
    if (!userId) return "";
    const conversationId = type === "global" ? WORTH_IT_GLOBAL_CHAT_REALTIME_ID : String(id || "");
    return conversationId ? String(userId) + "|" + String(type || "global") + "|" + conversationId : "";
}
function worthItChatDraftUrlUsedElsewhere(url, exceptKey = "") {
    if (!url || !String(url).startsWith("blob:")) return false;
    for (const [key, draft] of worthItChatDrafts) {
        if (key !== exceptKey && draft?.mediaUrl === url) return true;
    }
    return false;
}
function releaseWorthItChatDraftUrl(url, exceptKey = "") {
    if (!url || !String(url).startsWith("blob:")) return;
    if (!worthItChatDraftUrlUsedElsewhere(url, exceptKey) && pendingMediaObjectUrl !== url) {
        try { URL.revokeObjectURL(url); } catch (_) {}
    }
}
function updateWorthItChatComposerAction() {
    const input = $("worthItChatInput");
    const sendButton = $("worthItChatSendBtn");
    const voiceButton = $("worthItChatVoiceBtn");
    if (!input || !sendButton || !voiceButton) return;
    // Keep Send available for text, attachments and reply quotes; otherwise the
    // voice-recording control occupies the final action slot.
    const showSend = Boolean(String(input.value || "").trim() || pendingMediaFile || pendingReplyQuote);
    sendButton.hidden = !showSend;
    voiceButton.hidden = showSend;
}
function saveActiveWorthItChatDraft() {
    const key = worthItChatDraftKey();
    if (!key || !chatUser) return;
    activeChatDraftKey = key;
    const input = $("worthItChatInput");
    const draft = {
        text: String(input?.value || ""),
        mediaFile: pendingMediaFile || null,
        mediaUrl: pendingMediaUrl || "",
        mediaType: pendingMediaType || "",
        replyQuote: pendingReplyQuote ? { author: pendingReplyQuote.author, text: pendingReplyQuote.text } : null,
        selectionStart: Number.isInteger(input?.selectionStart) ? input.selectionStart : String(input?.value || "").length,
        selectionEnd: Number.isInteger(input?.selectionEnd) ? input.selectionEnd : String(input?.value || "").length
    };
    const previous = worthItChatDrafts.get(key);
    if (previous?.mediaUrl && previous.mediaUrl !== draft.mediaUrl) releaseWorthItChatDraftUrl(previous.mediaUrl, key);
    if (draft.text || draft.mediaFile || draft.replyQuote) worthItChatDrafts.set(key, draft);
    else worthItChatDrafts.delete(key);
}
function restoreWorthItChatDraft(key) {
    activeChatDraftKey = key || "";
    const draft = key ? worthItChatDrafts.get(key) : null;
    const input = $("worthItChatInput");
    if (input) {
        input.value = draft?.text || "";
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 140) + "px";
        if (Number.isInteger(draft?.selectionStart) && Number.isInteger(draft?.selectionEnd)) {
            try { input.setSelectionRange(draft.selectionStart, draft.selectionEnd); } catch (_) {}
        }
    }
    pendingReplyQuote = draft?.replyQuote ? { author: draft.replyQuote.author, text: draft.replyQuote.text } : null;
    setPendingMedia(draft?.mediaFile || null, draft?.mediaUrl || "", draft?.mediaType || "");
    renderWorthItChatReplyPreview();
    updateCharacterCount();
    renderWorthItChatComposerPreview();
}
function clearWorthItChatDrafts() {
    const urls = new Set();
    for (const draft of worthItChatDrafts.values()) if (draft?.mediaUrl?.startsWith("blob:")) urls.add(draft.mediaUrl);
    if (pendingMediaObjectUrl?.startsWith("blob:")) urls.add(pendingMediaObjectUrl);
    worthItChatDrafts.clear();
    activeChatDraftKey = "";
    pendingFilePickerTarget = null;
    for (const url of urls) { try { URL.revokeObjectURL(url); } catch (_) {} }
    pendingMediaObjectUrl = "";
    pendingMediaFile = null;
    pendingMediaUrl = "";
    pendingMediaType = "";
    pendingReplyQuote = null;
    const input = $("worthItChatInput");
    if (input) { input.value = ""; input.style.height = "auto"; }
    const host = $("worthItChatAttachmentPreview");
    if (host) { host.replaceChildren(); host.hidden = true; }
    renderWorthItChatReplyPreview();
    updateCharacterCount();
    renderWorthItChatComposerPreview();
    updateWorthItChatComposerAction();
}
function setPendingMedia(file, url, type) {
    const nextUrl = url || "";
    const oldUrl = pendingMediaObjectUrl;
    if (oldUrl && oldUrl !== nextUrl && !worthItChatDraftUrlUsedElsewhere(oldUrl, activeChatDraftKey)) {
        try { URL.revokeObjectURL(oldUrl); } catch (_) {}
    }
    pendingMediaFile = file || null;
    pendingMediaUrl = nextUrl;
    pendingMediaType = type || "";
    pendingMediaObjectUrl = nextUrl.startsWith("blob:") ? nextUrl : "";
    updateWorthItChatComposerAction();
    const host = $("worthItChatAttachmentPreview");
    if (!host) { saveActiveWorthItChatDraft(); return; }
    host.replaceChildren();
    host.hidden = !pendingMediaFile;
    if (!pendingMediaFile) { saveActiveWorthItChatDraft(); return; }
    let preview;
    if (type === "video") {
        preview = document.createElement("video");
        preview.src = pendingMediaUrl;
        preview.muted = true;
        preview.playsInline = true;
        preview.controls = true;
        preview.className = "worth-it-chat-video-preview";
    } else if (type === "audio") {
        preview = document.createElement("audio");
        preview.src = pendingMediaUrl;
        preview.controls = true;
        preview.preload = "metadata";
        preview.className = "worth-it-chat-audio-preview";
    } else {
        preview = document.createElement("img");
        preview.src = pendingMediaUrl;
        preview.alt = "Attachment preview";
        preview.className = "worth-it-chat-image-preview";
    }
    const name = document.createElement("span"); name.textContent = pendingMediaFile.name || "Voice message";
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove attachment");
    remove.addEventListener("click", () => setPendingMedia(null, "", ""));
    host.append(preview, name, remove);
    saveActiveWorthItChatDraft();
}
async function validateChatMediaSignature(file, expectedMime) {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const starts = (...bytes) => bytes.every((byte, index) => header[index] === byte);
    const expected = String(expectedMime || "").split(";")[0].toLowerCase();
    let actualMime = "";
    if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) actualMime = "image/png";
    else if (starts(0xff, 0xd8, 0xff)) actualMime = "image/jpeg";
    else if (starts(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || starts(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)) actualMime = "image/gif";
    else if (header.length >= 12 && starts(0x52, 0x49, 0x46, 0x46) && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) actualMime = "image/webp";
    else if (header.length >= 12 && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) actualMime = expected === "audio/mp4" ? "audio/mp4" : "video/mp4";
    else if (starts(0x1a, 0x45, 0xdf, 0xa3)) actualMime = expected === "audio/webm" ? "audio/webm" : "video/webm";
    else if (starts(0x4f, 0x67, 0x67, 0x53) && expected === "audio/ogg") actualMime = "audio/ogg";
    else if ((starts(0x49, 0x44, 0x33) || (header.length > 1 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) && expected === "audio/mpeg") actualMime = "audio/mpeg";
    else if (header.length >= 12 && starts(0x52, 0x49, 0x46, 0x46) && header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45 && ["audio/wav", "audio/x-wav"].includes(expected)) actualMime = expected;
    if (!actualMime || actualMime !== expected) throw new Error("The file contents do not match the selected media type.");
    return actualMime;
}
async function uploadPendingMedia(file = pendingMediaFile, conversationId = activeConversationId, userId = chatUser?.id) {
    if (!file) return {url:"",type:""};
    if (!file.size) throw new Error("This media file is empty.");
    const mime = String(file.type || "").split(";")[0].toLowerCase();
    const allowed = {"image/png":"image","image/jpeg":"image","image/webp":"image","image/gif":"gif","video/mp4":"video","video/webm":"video","audio/webm":"audio","audio/ogg":"audio","audio/mp4":"audio","audio/mpeg":"audio","audio/wav":"audio","audio/x-wav":"audio"};
    const type = allowed[mime];
    if (!type) throw new Error("Choose a supported image, GIF, video or recorded voice message.");
    const maxBytes = type === "audio" ? 10 * 1024 * 1024 : type === "gif" ? 20 * 1024 * 1024 : type === "video" ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error(type === "audio" ? "Voice messages must be 10 MB or smaller." : type === "gif" ? "GIFs must be 20 MB or smaller." : type === "video" ? "Videos must be 50 MB or smaller." : "Images must be 15 MB or smaller.");
    await validateChatMediaSignature(file, mime);
    const client = sb();
    if (!client || !userId) throw new Error("Sign in again before uploading media.");
    const sessionResult = await client.auth.getSession();
    const token = sessionResult?.data?.session?.access_token || "";
    const sessionUserId = sessionResult?.data?.session?.user?.id || "";
    if (sessionResult?.error || !token || sessionUserId !== userId) {
        throw new Error("Your session has expired. Sign in again before uploading media.");
    }
    const form = new FormData();
    form.append("file", file, file.name || (type === "audio" ? "voice-message" : type === "gif" ? "image.gif" : "image"));
    if (type === "audio") form.append("conversation_id", conversationId || WORTH_IT_GLOBAL_CHAT_REALTIME_ID);
    const response = await fetch(type === "audio" ? "/api/chat-audio" : "/api/chat-media", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token },
        body: form,
        credentials: "same-origin",
        cache: "no-store"
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || !payload.url || payload.type !== type) {
        throw new Error(payload.error || "Could not upload this image. Please try again.");
    }
    return {url:payload.url,type};
}
async function sendWorthItChatMessage() {
    if (!chatUser || chatSending) return;
    saveActiveWorthItChatDraft();
    const sendUserId = chatUser.id;
    const sendConversationType = activeConversationType;
    const sendConversationId = activeConversationId;
    const sendDraftKey = worthItChatDraftKey(sendUserId, sendConversationType, sendConversationId);
    const input = $("worthItChatInput");
    const draftBody = String(input?.value || "");
    const draftMediaFile = pendingMediaFile || null;
    const draftMediaUrl = pendingMediaUrl || "";
    const draftMediaType = pendingMediaType || "";
    const draftReplyQuote = pendingReplyQuote ? { author: pendingReplyQuote.author, text: pendingReplyQuote.text } : null;
    const replyPrefix = draftReplyQuote ? "> " + draftReplyQuote.author + ": " + draftReplyQuote.text + "\n\n" : "";
    const body = replyPrefix + draftBody;
    if (body.length > 500) { setStatus("Messages, including the quoted reply, are limited to 500 characters. Shorten your draft or reply quote.", true); return; }
    if (!draftBody.trim() && !draftMediaFile) { setStatus(draftReplyQuote ? "Write a reply before sending." : "Write a message or attach media first.", true); return; }
    const remaining = 2000 - (Date.now() - chatLastSentAt);
    if (remaining > 0) { setStatus("Please wait " + (remaining / 1000).toFixed(1) + " seconds before sending another message.", true); return; }
    chatSending = true;
    const button = $("worthItChatSendBtn");
    if (button) { button.disabled = true; button.textContent = "Sending…"; }
    setStatus("", false);
    try {
        let media = {url:"",type:""};
        if (draftMediaFile) {
            if (worthItChatDraftKey() === sendDraftKey) setStatus(draftMediaType === "video" ? "Uploading video…" : "Uploading media…", false);
            media = await uploadPendingMedia(draftMediaFile, sendConversationId || WORTH_IT_GLOBAL_CHAT_REALTIME_ID, sendUserId);
        }
        const result = await sb().rpc("send_worth_it_chat_message", {
            p_body: body,
            p_conversation_id: sendConversationType === "global" ? null : sendConversationId,
            p_media_url: media.url || null,
            p_media_type: media.type || null
        });
        if (result.error) throw new Error(rpcError(result.error));
        if (!result.data?.success) {
            if (result.data?.code === "CHAT_COOLDOWN") {
                const wait = Math.max(0.1, Number(result.data.retry_after_ms || 2000) / 1000);
                setStatus("Please wait " + wait.toFixed(1) + " seconds before sending another message.", true);
            } else if (result.data?.code === "SPAM_DUPLICATE") {
                showTemporaryChatWarning("Message blocked — please don't repeat the same message in Global Chat.");
            } else if (result.data?.code === "SPAM_PROMOTION") {
                showTemporaryChatWarning("Message blocked — unsolicited self-promotion isn't allowed in Global Chat.");
            } else if (result.data?.code === "MESSAGE_TOO_LONG") setStatus("Messages are limited to 500 characters.", true);
            else if (result.data?.code === "FRIENDS_ONLY") setStatus("Private chats are only available between friends.", true);
            else setStatus(result.data?.code || "Message could not be sent.", true);
            return;
        }
        chatLastSentAt = Date.now();
        const storedDraft = worthItChatDrafts.get(sendDraftKey);
        const storedStillMatchesSentDraft = Boolean(storedDraft
            && storedDraft.text === draftBody
            && storedDraft.mediaFile === draftMediaFile
            && storedDraft.mediaUrl === draftMediaUrl
            && storedDraft.mediaType === draftMediaType
            && JSON.stringify(storedDraft.replyQuote || null) === JSON.stringify(draftReplyQuote || null));
        if (storedStillMatchesSentDraft) {
            if (storedDraft.mediaUrl) releaseWorthItChatDraftUrl(storedDraft.mediaUrl, sendDraftKey);
            worthItChatDrafts.delete(sendDraftKey);
        }
        if (worthItChatDraftKey() === sendDraftKey && chatUser?.id === sendUserId) {
            if (input) { input.value = ""; input.style.height = "auto"; }
            clearWorthItChatReplyQuote();
            setPendingMedia(null, "", "");
            updateCharacterCount();
            saveActiveWorthItChatDraft();
            renderWorthItChatComposerPreview();
            await loadWorthItChatMessages(true, true);
            setStatus(result.data.filtered ? "Your message was sent with filtered content. Read the red note below it to see why." : "", false);
        }
        stopWorthItChatTyping();
        await refreshWorthItChatData();
    } catch (error) {
        if (worthItChatDraftKey() === sendDraftKey) setStatus(error?.message || "Message could not be sent.", true);
    } finally {
        chatSending = false;
        if (button) { button.disabled = false; button.innerHTML = 'Send <span>➤</span>'; }
        updateWorthItChatComposerAction();
    }
}
window.sendWorthItChatMessage = sendWorthItChatMessage;
window.openWorthItGroupChatDialog = function () {
    if (!chatUser) return;
    $("worthItChatGroupName").value = "";
    if ($("worthItChatGroupSearch")) $("worthItChatGroupSearch").value = "";
    selectedGroupFriendIds.clear();
    groupCreateInProgress = false;
    renderGroupFriendChoices();
    setGroupStatus("", false);
    updateGroupSelectionUI();
    const dialog = $("worthItChatGroupDialog");
    // Keep the fixed group-dialog backdrop attached to the document viewport, not any transformed chat container.
    if (dialog && dialog.parentElement !== document.body) document.body.appendChild(dialog);
    dialog.hidden = false; dialog.setAttribute("aria-hidden","false");
};
window.closeWorthItGroupChatDialog = function () {
    const dialog = $("worthItChatGroupDialog");
    if (dialog) { dialog.hidden = true; dialog.setAttribute("aria-hidden","true"); }
};
function updateGroupSelectionUI() {
    const countNode = $("worthItChatGroupSelectionCount");
    const helpNode = $("worthItChatGroupSelectionHelp");
    const title = String($("worthItChatGroupName")?.value || "").trim();
    const count = selectedGroupFriendIds.size;
    const validCount = count >= 2 && count <= 29;
    const validTitle = Boolean(title) && title.length <= 60;

    if (countNode) {
        countNode.textContent = count + (count === 1 ? " friend selected" : " friends selected");
        countNode.classList.toggle("is-ready", validCount);
        countNode.classList.toggle("is-over-limit", count > 29);
    }
    if (helpNode) {
        let message = "";
        if (count > 29) message = "Maximum 30 members including you. Remove a selection to continue.";
        else if (count < 2) message = "Choose " + (2 - count) + " more friend" + (2 - count === 1 ? "" : "s") + " to continue.";
        else if (!validTitle) message = "Add a group name to continue.";
        else message = "Everything is ready — create your group.";
        helpNode.textContent = message;
    }

    const submit = $("worthItChatGroupForm")?.querySelector('button[type="submit"]');
    if (submit) submit.disabled = groupCreateInProgress || !validTitle || !validCount;
}
function renderGroupFriendChoices() {
    const host = $("worthItChatGroupFriends");
    if (!host) return;
    host.replaceChildren();
    if (!chatFriends.length) {
        const p = document.createElement("p");
        p.className = "worth-it-chat-muted";
        p.textContent = "Add at least two friends before creating a group.";
        host.appendChild(p);
        updateGroupSelectionUI();
        return;
    }

    const search = String($("worthItChatGroupSearch")?.value || "").trim().toLocaleLowerCase();
    let visibleCount = 0;
    chatFriends.forEach(friend => {
        const usernameText = String(friend.username || "");
        const displayNameText = String(friend.display_name || "");
        const matches = !search || usernameText.toLocaleLowerCase().includes(search) || displayNameText.toLocaleLowerCase().includes(search);
        if (matches) visibleCount++;

        const friendId = String(friend.worth_it_id);
        const label = document.createElement("label");
        label.className = "worth-it-chat-group-friend-option";
        label.hidden = !matches;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = friendId;
        checkbox.checked = selectedGroupFriendIds.has(friendId);

        const details = document.createElement("span");
        details.className = "worth-it-chat-group-friend-details";
        const name = document.createElement("strong");
        name.textContent = friend.display_name || friend.username || "Worth It member";
        details.appendChild(name);
        if (friend.username) {
            const username = document.createElement("small");
            username.textContent = "@" + String(friend.username).replace(/^@/, "");
            details.appendChild(username);
        }

        label.classList.toggle("is-selected", checkbox.checked);
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedGroupFriendIds.add(friendId);
            else selectedGroupFriendIds.delete(friendId);
            label.classList.toggle("is-selected", checkbox.checked);
            setGroupStatus("", false);
            updateGroupSelectionUI();
        });

        label.append(checkbox, makeAvatar(friend, "worth-it-chat-group-avatar"), details);
        host.appendChild(label);
    });

    const empty = document.createElement("p");
    empty.className = "worth-it-chat-group-no-results";
    empty.textContent = "No friends match that name.";
    empty.hidden = visibleCount > 0;
    host.appendChild(empty);
    updateGroupSelectionUI();
}

async function createWorthItGroupChat(event) {
    event.preventDefault();
    if (!chatUser || groupCreateInProgress) return;
    const title = String($("worthItChatGroupName")?.value || "").trim();
    const ids = Array.from(selectedGroupFriendIds).map(Number).filter(Number.isSafeInteger);
    if (!title || title.length > 60) { setGroupStatus("Enter a group name up to 60 characters.", true); updateGroupSelectionUI(); return; }
    if (ids.length < 2) { setGroupStatus("Choose at least two friends for the group.", true); updateGroupSelectionUI(); return; }
    if (ids.length > 29) { setGroupStatus("A group can include up to 30 members including you.", true); updateGroupSelectionUI(); return; }

    const form = $("worthItChatGroupForm");
    const submit = form?.querySelector('button[type="submit"]');
    groupCreateInProgress = true;
    if (submit) submit.innerHTML = "Creating…";
    updateGroupSelectionUI();

    try {
        const result = await sb().rpc("create_worth_it_group_chat", {p_title:title,p_member_worth_it_ids:ids});
        if (result.error) throw result.error;
        if (!result.data?.success) throw new Error(result.data?.code || "Could not create group chat.");
        closeWorthItGroupChatDialog();
        await refreshWorthItChatData();
        const conversation = chatConversations.find(item => item.id === result.data.conversation_id);
        if (conversation) await openWorthItSavedConversation(conversation);
        else await activateConversation(result.data.conversation_id,"group",title,null,result.data.invite_token || "");
        setStatus("Group chat created.",false);
    } catch (error) {
        setGroupStatus(rpcError(error),true);
    } finally {
        groupCreateInProgress = false;
        if (submit) submit.innerHTML = "Create group <span>➤</span>";
        updateGroupSelectionUI();
    }
}

function closeWorthItGroupInviteDialog() {
    const dialog = $("worthItChatInviteDialog");
    if (dialog) { dialog.hidden = true; dialog.setAttribute("aria-hidden", "true"); }
}
function showWorthItGroupInviteDialog(preview, token) {
    const dialog = $("worthItChatInviteDialog");
    const title = $("worthItChatInviteTitle");
    const copy = $("worthItChatInviteCopy");
    const status = $("worthItChatInviteStatus");
    const accept = $("worthItChatInviteAcceptBtn");
    const kicker = $("worthItChatInviteKicker");
    activeGroupInvitePreview = preview || {success:false,code:"INVITE_NOT_FOUND"};
    activeGroupInviteToken = token || "";
    if (title) title.textContent = activeGroupInvitePreview.success ? "You have been invited" : "Invitation unavailable";
    if (copy) {
        if (!activeGroupInvitePreview.success) copy.textContent = "This group invitation link is invalid or no longer available.";
        else if (!chatUser) copy.textContent = "You have been invited to join “" + (activeGroupInvitePreview.title || "this group") + "”. Sign in or create a Worth It account, then confirm that you'd like to join.";
        else if (activeGroupInvitePreview.is_full && !activeGroupInvitePreview.is_member) copy.textContent = "You have been invited to join “" + (activeGroupInvitePreview.title || "this group") + "”, but it has reached the 30-member limit.";
        else copy.textContent = "You have been invited to join “" + (activeGroupInvitePreview.title || "this group") + "”. Do you want to join?";
    }
    if (kicker) kicker.textContent = activeGroupInvitePreview.success ? "✦ WORTH IT COMMUNITY" : "✦ GROUP INVITATION";
    if (status) status.textContent = "";
    if (accept) {
        accept.disabled = !activeGroupInvitePreview.success || (activeGroupInvitePreview.is_full && !activeGroupInvitePreview.is_member);
        accept.textContent = !activeGroupInvitePreview.success ? "Invitation unavailable" : !chatUser ? "Sign in to continue" : "Join group";
    }
    if (dialog) {
        if (dialog.parentElement !== document.body) document.body.appendChild(dialog);
        dialog.hidden = false;
        dialog.setAttribute("aria-hidden", "false");
    }
}
async function handleWorthItGroupInviteRoute(token, routeVersion) {
    activeGroupInviteToken = token;
    const client = sb();
    if (!client) {
        showWorthItGroupInviteDialog({success:false,code:"CHAT_UNAVAILABLE"}, token);
        return;
    }
    let result;
    try {
        result = await client.rpc("get_worth_it_group_invite_preview", {p_invite_token:token});
    } catch (error) {
        if (routeVersion !== chatRouteVersion) return;
        showWorthItGroupInviteDialog({success:false,code:"INVITE_NOT_FOUND"}, token);
        const status = $("worthItChatInviteStatus");
        if (status) status.textContent = rpcError(error);
        return;
    }
    if (routeVersion !== chatRouteVersion) return;
    if (result.error || !result.data?.success) {
        showWorthItGroupInviteDialog({success:false,code:result.data?.code || "INVITE_NOT_FOUND"}, token);
        if (result.error) {
            const status = $("worthItChatInviteStatus");
            if (status) status.textContent = rpcError(result.error);
        }
        return;
    }
    activeGroupInvitePreview = result.data;
    if (chatUser) {
        await refreshWorthItChatData();
        if (routeVersion !== chatRouteVersion) return;
        if (activeGroupInvitePreview.is_member) {
            const conversation = chatConversations.find(item => item.id === activeGroupInvitePreview.conversation_id);
            if (conversation) {
                closeWorthItGroupInviteDialog();
                startWorthItChatPolling();
                await openWorthItSavedConversation(conversation);
                return;
            }
            showWorthItGroupInviteDialog({success:false,code:"CHAT_NOT_FOUND"}, token);
            const status = $("worthItChatInviteStatus");
            if (status) status.textContent = "You're a member of this group, but the chat could not be loaded. Please refresh and try again.";
            return;
        }
    }
    showWorthItGroupInviteDialog(activeGroupInvitePreview, token);
}
window.acceptWorthItGroupInvite = async function () {
    const button = $("worthItChatInviteAcceptBtn");
    const status = $("worthItChatInviteStatus");
    if (!activeGroupInviteToken) return;
    if (!chatUser) {
        if (status) status.textContent = "Sign in or create a Worth It account to accept this invitation.";
        if (typeof window.handleAuthButton === "function") window.handleAuthButton();
        return;
    }
    if (button) { button.disabled = true; button.textContent = "Joining…"; }
    if (status) status.textContent = "";
    try {
        const result = await sb().rpc("accept_worth_it_group_invite", {p_invite_token:activeGroupInviteToken});
        if (result.error) throw result.error;
        if (!result.data?.success) {
            if (result.data?.code === "GROUP_FULL") {
                activeGroupInvitePreview = Object.assign({}, activeGroupInvitePreview, {is_full:true});
                showWorthItGroupInviteDialog(activeGroupInvitePreview, activeGroupInviteToken);
            } else {
                if (status) status.textContent = result.data?.code === "INVITE_NOT_FOUND" ? "This invite link is invalid or has expired." : (result.data?.code || "Could not join this group.");
                if (button) { button.disabled = false; button.textContent = "Join group"; }
            }
            return;
        }
        const token = activeGroupInviteToken;
        closeWorthItGroupInviteDialog();
        startWorthItChatPolling();
        await refreshWorthItChatData();
        const conversation = chatConversations.find(item => item.id === result.data.conversation_id);
        if (conversation) await openWorthItSavedConversation(conversation);
        else await activateConversation(result.data.conversation_id, "group", result.data.title || "Group chat", null, token);
        setStatus("You joined the group chat.", false);
    } catch (error) {
        if (status) status.textContent = rpcError(error);
        if (button) { button.disabled = false; button.textContent = "Join group"; }
    }
};
window.dismissWorthItGroupInvite = async function () {
    closeWorthItGroupInviteDialog();
    activeGroupInvitePreview = null;
    activeGroupInviteToken = "";
    setChatBrowserPath("/chat", true);
    await routeWorthItChatFromLocation();
};
async function routeWorthItChatFromLocation() {
    const wasChatAlreadyOpen = chatOpen;
    const route = parseWorthItChatRoute();
    const routeVersion = ++chatRouteVersion;
    if (!route) {
        closeWorthItGroupInviteDialog();
        if (chatOpen) showChatOverlay(false, {skipRouteSync:true});
        else stopWorthItChatRealtimeChannel();
        return;
    }
    // Browser Back from a profile restores the originating chat route. Hide the
    // profile section before reopening the chat overlay so it cannot sit behind it.
    if (typeof window.hideWorthItProfileSection === "function") window.hideWorthItProfileSection();
    if (!chatReturnPath || isChatRoutePath(chatReturnPath)) chatReturnPath = "/";
    showChatOverlay(true, {skipRouteSync:true});
    // A direct chat URL opens fullscreen by default. Preserve an explicit
    // compact/fullscreen choice across reloads within this tab, so refreshing
    // a header-opened compact panel does not unexpectedly expand it.
    if (!wasChatAlreadyOpen) {
        const preference = getWorthItChatFullscreenPreference();
        setWorthItChatFullscreen(preference === false ? false : true, {persist:false});
    }
    // Restore the exact conversation that was open before the profile was
    // visited. This also avoids treating an active group URL as a fresh invite.
    if (profileReturnConversation && currentBrowserLocation() === profileReturnConversation.path) {
        const previous = profileReturnConversation;
        profileReturnConversation = null;
        if (!chatUser) { renderMessages(); return; }
        startWorthItChatPolling();
        await refreshWorthItChatData();
        if (routeVersion !== chatRouteVersion) return;
        if (previous.type === "global") {
            await activateConversation(null, "global", GLOBAL_TITLE, null);
            return;
        }
        if (previous.type === "direct") {
            const person = chatFriends.find(item => Number(item.worth_it_id) === Number(previous.person?.worth_it_id))
                || previous.person || null;
            if (previous.id) {
                // The stored id is the database conversation id, not the friend's Worth It ID.
                // Keeping it prevents the header from appearing correct while the messages load
                // for a null conversation.
                await activateConversation(previous.id, "direct", person?.display_name || person?.username || previous.title, person, previous.inviteToken);
                return;
            }
            if (person && Number.isSafeInteger(Number(person.worth_it_id))) {
                const reopened = await sb().rpc("open_worth_it_friend_chat", {target_worth_it_id: Number(person.worth_it_id)});
                if (!reopened.error && reopened.data?.success && reopened.data?.conversation_id) {
                    await activateConversation(reopened.data.conversation_id, "direct", person.display_name || person.username || previous.title, person, previous.inviteToken);
                    return;
                }
                setStatus(rpcError(reopened.error || new Error("Could not restore this conversation.")), true);
            }
            await activateConversation(null, "global", GLOBAL_TITLE, null);
            return;
        }
        if (previous.type === "group") {
            const group = chatConversations.find(item => String(item.id) === String(previous.id));
            if (group) await activateConversation(group.id, "group", group.title || previous.title, null, group.invite_token || previous.inviteToken);
            else { await activateConversation(null, "global", GLOBAL_TITLE, null); }
            return;
        }
    }
    if (route.type === "invalid") {
        closeWorthItGroupInviteDialog();
        stopWorthItChatRealtimeChannel();
        chatRouteAccessDenied = true;
        activeConversationId = null;
        activeConversationType = "global";
        activeConversationTitle = GLOBAL_TITLE;
        activeConversationPerson = null;
        activeConversationInviteToken = "";
        setHeader(GLOBAL_TITLE, "A shared space for the Worth It community", null);
        updateChatHeaderNotificationButton();
        updateChatHeaderShareButton();
        chatMessages = [];
        renderMessages();
        setStatus("This chat link is invalid.", true);
        return;
    }
    if (route.type === "group") {
        chatRouteAccessDenied = true;
        activeConversationId = null;
        activeConversationType = "global";
        activeConversationTitle = GLOBAL_TITLE;
        activeConversationPerson = null;
        activeConversationInviteToken = "";
        setHeader(GLOBAL_TITLE, "A shared space for the Worth It community", null);
        updateChatHeaderNotificationButton();
        updateChatHeaderShareButton();
        chatMessages = [];
        renderMessages();
        stopWorthItChatRealtimeChannel();
        if (chatPollTimer) { window.clearInterval(chatPollTimer); chatPollTimer = null; }
        await handleWorthItGroupInviteRoute(route.token, routeVersion);
        return;
    }
    closeWorthItGroupInviteDialog();
    if (!chatUser) {
        // Do not flash the default Global Chat while the saved auth session is
        // still resolving for a direct/group deep link.
        if (!chatAuthResolutionComplete) {
            const host = $("worthItChatMessages");
            if (host) {
                host.replaceChildren();
                host.setAttribute("aria-busy", "true");
            }
            return;
        }
        renderMessages();
        return;
    }
    const routeHost = $("worthItChatMessages");
    if (route.type === "direct") {
        // Switch the visible header/surface to a neutral loading state before
        // fetching friends, so a deep-link refresh never briefly shows Global Chat.
        activeConversationType = "direct";
        activeConversationId = null;
        activeConversationTitle = "Private chat";
        activeConversationPerson = chatFriends.find(item => Number(item.worth_it_id) === route.worthItId) || null;
        activeConversationInviteToken = "";
        chatMessages = [];
        setHeader("Private chat", "Restoring conversation…", activeConversationPerson);
        updateChatHeaderNotificationButton();
        updateChatHeaderShareButton();
        document.querySelectorAll(".worth-it-chat-side-item").forEach(node => node.classList.remove("is-active"));
        if (routeHost) {
            routeHost.replaceChildren();
            routeHost.setAttribute("aria-busy", "true");
        }
    } else {
        routeHost?.removeAttribute("aria-busy");
    }
    startWorthItChatPolling();
    await refreshWorthItChatData();
    if (routeVersion !== chatRouteVersion) return;
    if (route.type === "global") {
        await activateConversation(null, "global", GLOBAL_TITLE, null);
        return;
    }
    const friend = chatFriends.find(item => Number(item.worth_it_id) === route.worthItId);
    if (!friend) {
        chatRouteAccessDenied = true;
        activeConversationId = null;
        activeConversationType = "direct";
        activeConversationTitle = "Private chat";
        activeConversationPerson = null;
        activeConversationInviteToken = "";
        setHeader("Private chat", "Private conversations are only available between friends", null);
        updateChatHeaderNotificationButton();
        updateChatHeaderShareButton();
        setStatus("This private chat is only available to you and a Worth It friend.", true);
        chatMessages = [];
        renderMessages();
        return;
    }
    await window.openWorthItFriendChat(route.worthItId);
}

const WORTH_IT_CHAT_EMOJI_CATEGORIES = [
    { id: "all", label: "All", icon: "✨" },
    { id: "faces", label: "Smileys", icon: "😀" },
    { id: "people", label: "People", icon: "👋" },
    { id: "animals", label: "Animals", icon: "🐱" },
    { id: "plants", label: "Plants", icon: "🪴" },
    { id: "food", label: "Food", icon: "🍕" },
    { id: "activities", label: "Activities", icon: "⚽" },
    { id: "travel", label: "Travel", icon: "🚀" },
    { id: "objects", label: "Objects", icon: "💡" },
    { id: "symbols", label: "Symbols", icon: "❤️" },
    { id: "flags", label: "Flags", icon: "🏳️" }
];

const WORTH_IT_CHAT_EMOJI_OPTIONS = [];
let worthItChatEmojiCategory = "faces";
let worthItChatGifCategory = "gif";
let worthItChatMediaTab = "gif";
let worthItChatGifSearchSequence = 0;

function closeWorthItChatPickers() {
    const picker = $("worthItChatMediaPicker");
    const emojiPicker = $("worthItChatEmojiPicker");
    const gifPicker = $("worthItChatGifPicker");
    if (picker) picker.hidden = true;
    if (emojiPicker) emojiPicker.hidden = true;
    if (gifPicker) gifPicker.hidden = true;
    for (const id of ["worthItChatGifAction", "worthItChatStickerAction", "worthItChatEmojiAction"]) {
        $(id)?.setAttribute("aria-expanded", "false");
    }
}

function openWorthItChatFilePicker() {
    closeWorthItChatPickers();
    // Pin the native picker result to the conversation where the + button was tapped.
    pendingFilePickerTarget = { key: worthItChatDraftKey(), userId: chatUser?.id || null };
    $("worthItChatFileInput")?.click();
}

function showWorthItChatMediaTab(tab, resetSearch = false) {
    if (!["gif", "sticker", "emoji"].includes(tab)) return;
    const picker = $("worthItChatMediaPicker");
    const gifPanel = $("worthItChatGifPicker");
    const emojiPanel = $("worthItChatEmojiPicker");
    if (!picker || !gifPanel || !emojiPanel) return;
    const wasHidden = picker.hidden;
    picker.hidden = false;
    worthItChatMediaTab = tab;
    gifPanel.hidden = tab === "emoji";
    emojiPanel.hidden = tab !== "emoji";

    document.querySelectorAll("[data-worth-it-chat-media-tab]").forEach(button => {
        const active = button.dataset.worthItChatMediaTab === tab;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
        button.tabIndex = active ? 0 : -1;
    });
    for (const [id, actionTab] of [
        ["worthItChatGifAction", "gif"],
        ["worthItChatStickerAction", "sticker"],
        ["worthItChatEmojiAction", "emoji"]
    ]) {
        $(id)?.setAttribute("aria-expanded", actionTab === tab ? "true" : "false");
    }

    if (tab === "emoji") {
        const search = $("worthItChatEmojiSearch");
        if (search && (resetSearch || wasHidden)) search.value = "";
        renderWorthItChatEmojiCategories();
        renderWorthItChatEmojiGrid(search?.value || "");
        return;
    }

    worthItChatGifCategory = tab;
    const search = $("worthItChatGifSearch");
    if (search) {
        if (resetSearch || wasHidden) search.value = "";
        search.placeholder = tab === "sticker" ? "Search stickers…" : "Search GIFs…";
        search.setAttribute("aria-label", tab === "sticker" ? "Search stickers" : "Search GIFs");
    }
    loadWorthItChatGifResults(search?.value || "");
}


const WORTH_IT_CHAT_EMOJI_KEYWORDS = {
    "😀": "grinning smile happy face", "😃": "big smile happy", "😄": "grinning laugh",
    "😁": "beam smile", "😆": "laughing squint", "😅": "nervous sweat laugh",
    "😂": "tears joy laughing cry funny", "🤣": "rofl rolling floor laugh funny",
    "🥲": "smiling tear emotional", "😊": "blush smile happy", "😍": "heart eyes love",
    "🥰": "hearts love affection", "😘": "kiss love", "😎": "cool sunglasses",
    "🤔": "thinking wonder question", "🥺": "pleading puppy eyes sad", "😭": "crying tears sad",
    "😡": "angry mad rage", "🤯": "mind blown shocked", "🥳": "party birthday celebrate",
    "😴": "sleep tired sleep", "🤗": "hug comfort", "🤩": "star struck excited",
    "🙈": "monkey shy see no evil", "💀": "skull dead funny", "❤️": "red heart love",
    "🧡": "orange heart love", "💛": "yellow heart love", "💚": "green heart love",
    "💙": "blue heart love", "💜": "purple heart love", "🖤": "black heart love",
    "🤍": "white heart love", "🩷": "pink heart love", "🩵": "light blue heart love",
    "💔": "broken heart sad", "💖": "sparkling heart love", "💕": "two hearts love",
    "🔥": "fire hot lit", "✨": "sparkles magic shine", "👍": "thumbs up like yes",
    "👎": "thumbs down dislike no", "🙏": "please thanks pray", "👏": "clap applause",
    "🎉": "party popper celebration birthday", "🎊": "confetti celebration", "☕": "coffee drink",
    "🍕": "pizza food", "🍔": "burger food", "🍟": "fries food", "🍓": "strawberry fruit",
    "🍰": "cake dessert birthday", "🚀": "rocket space launch", "💎": "diamond gem",
    "🎮": "video game gaming", "🎵": "music note", "⚽": "soccer football",
    "🌈": "rainbow colorful", "☀️": "sun sunny weather", "🐱": "cat kitten pet",
    "🐶": "dog puppy pet", "🦊": "fox animal", "🐼": "panda animal",
    "🦄": "unicorn fantasy", "🐸": "frog animal", "🌸": "cherry blossom flower plant", "🌱": "seedling sprout plant grow", "🌿": "herb leaf plant green", "☘️": "shamrock plant clover", "🍀": "four leaf clover plant luck", "🌵": "cactus desert plant", "🌴": "palm tree tropical plant", "🌳": "deciduous tree plant", "🌲": "evergreen pine tree plant", "🎄": "christmas tree plant", "🪴": "potted plant houseplant", "🎍": "pine decoration plant", "🎋": "bamboo plant", "🌾": "sheaf rice grass plant", "🍃": "leaf wind plant", "🍂": "fallen leaf autumn plant", "🍁": "maple leaf plant", "🌷": "tulip flower plant", "🌹": "rose flower plant", "🥀": "wilted flower plant", "🌺": "hibiscus flower plant", "🌻": "sunflower plant", "🌼": "blossom flower plant", "🪷": "lotus flower plant", "🪻": "hyacinth flower plant", "💐": "bouquet flowers plant", "🪹": "empty nest nature tree", "🪺": "nest eggs nature tree",
    "🇷🇸": "Serbia flag", "🇺🇸": "United States America flag",
    "🇬🇧": "United Kingdom Britain flag", "🇯🇵": "Japan flag", "🇪🇺": "European Union flag", "🏳️‍🌈": "rainbow pride LGBTQ LGBT flag", "🏳️‍⚧️": "transgender trans pride flag", "🏴": "black flag", "🏳️": "white flag", "🏁": "checkered racing flag", "🚩": "red triangular flag", "🇨🇦": "Canada flag", "🇦🇺": "Australia flag", "🇳🇿": "New Zealand flag", "🇭🇷": "Croatia flag", "🇧🇦": "Bosnia Herzegovina flag", "🇲🇪": "Montenegro flag", "🇲🇰": "North Macedonia flag", "🇦🇱": "Albania flag", "🇸🇮": "Slovenia flag", "🇩🇪": "Germany flag", "🇫🇷": "France flag", "🇮🇹": "Italy flag", "🇪🇸": "Spain flag", "🇵🇹": "Portugal flag", "🇧🇷": "Brazil flag", "🇮🇳": "India flag", "🇿🇦": "South Africa flag", "🇲🇽": "Mexico flag", "🇨🇳": "China flag", "🇰🇷": "South Korea flag"
};

function addWorthItChatEmojiGroup(category, symbols) {
    const categoryLabel = WORTH_IT_CHAT_EMOJI_CATEGORIES.find(item => item.id === category)?.label || category;
    const seenInCategory = new Set(WORTH_IT_CHAT_EMOJI_OPTIONS.filter(item => item.category === category).map(item => item.emoji));
    for (const emoji of String(symbols || "").trim().split(/\s+/).filter(Boolean)) {
        if (seenInCategory.has(emoji)) continue;
        seenInCategory.add(emoji);
        WORTH_IT_CHAT_EMOJI_OPTIONS.push({
            emoji,
            category,
            keywords: ((WORTH_IT_CHAT_EMOJI_KEYWORDS[emoji] || "") + " " + categoryLabel).toLowerCase()
        });
    }
}

addWorthItChatEmojiGroup("faces", "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 😝 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🫡 🤫 🫠 🫥 😶 🫤 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵‍💫 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 💀 ☠️ 👻 👽 🤖 💩 👹 👺 💋 💌");
addWorthItChatEmojiGroup("people", "👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦 👶 🧒 👦 👧 🧑 👨 👩 🧔 🧑‍🦰 🧑‍🦱 🧑‍🦳 🧑‍🦲 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 💃 🕺 🧘 🛀 🛌 🧍 🧎 🚶 🏃 🧑‍💻 🧑‍🎨 🧑‍🍳 🧑‍🚀 🧑‍🔬 🧑‍🏫 🧑‍⚕️ 🧑‍🚒 🧑‍✈️ 🧑‍🌾");
addWorthItChatEmojiGroup("animals", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🕷️ 🕸️ 🦂 🦟 🦗 🪳 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🦈 🐊 🦭 🦦 🦥 🦫 🦡 🐘 🦣 🦏 🦛 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🦮 🐩 🐈 🐈‍⬛ 🪶 🐓 🦃 🦤 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦔 🐿️");
addWorthItChatEmojiGroup("plants", "🌱 🌿 ☘️ 🍀 🌵 🌴 🌳 🌲 🎄 🪴 🎍 🎋 🌾 🍃 🍂 🍁 🌷 🌹 🥀 🌺 🌻 🌼 🌸 🪷 🪻 💐 🪵 🪨 🪸 🪹 🪺 🌰 🍄 🍄‍🟫 💮 🏵️ 🪻 🌱 🌿 🍀 🪴 🌳 🌲 🌴 🌵 🌻 🌹 🌷 🌸 🪷 🪺 🪹 🪾 🫛 🪻 🪴 🌺 🌼 🪷 🪸 🪨 🪵 🪴 🪻 🌾 🍄‍🟫");
addWorthItChatEmojiGroup("food", "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🫒 🥑 🍆 🥔 🥕 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🍄 🥜 🫘 🌰 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🥚 🍳 🥘 🍲 🥣 🥗 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🫖 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🧊");
addWorthItChatEmojiGroup("activities", "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚴 🚵 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎟️ 🎫 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🪈 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩 🎪 🎠 🎡 🎢 🎤 🎧");
addWorthItChatEmojiGroup("travel", "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🛺 🚲 🛴 🛹 🚏 🛣️ 🛤️ 🛢️ ⛽ 🛞 🚨 🚥 🚦 🛑 🚧 ⚓ 🛟 ⛵ 🛶 🚤 🛳️ ⛴️ 🛥️ 🚢 ✈️ 🛩️ 🛫 🛬 🪂 💺 🚁 🚟 🚠 🚡 🛰️ 🚀 🛸 🌍 🌎 🌏 🌐 🗺️ 🧭 🏔️ ⛰️ 🌋 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🏞️ 🏟️ 🏛️ 🏗️ 🧱 🪨 🪵 🛖 🏘️ 🏚️ 🏠 🏡 🏢 🏣 🏤 🏥 🏦 🏨 🏩 🏪 🏫 🏬 🏭 🏯 🏰 💒 🗼 🗽 ⛪ 🕌 🛕 🕍 🛐 ⛩️ 🕋 ⛲ ⛺ 🌁 🌃 🌄 🌅 🌆 🌇 🌉 ♨️");
addWorthItChatEmojiGroup("objects", "📱 📲 ☎️ 📞 📟 📠 🔋 🪫 🔌 💻 🖥️ 🖨️ ⌨️ 🖱️ 🖲️ 💽 💾 💿 📀 🧮 🎥 🎞️ 📽️ 📺 📷 📸 📹 📼 🔍 🔎 🕯️ 💡 🔦 🏮 🪔 📔 📕 📖 📗 📘 📙 📚 📓 📒 📃 📜 📄 📰 🗞️ 📑 🔖 🏷️ 💰 🪙 💴 💵 💶 💷 💸 💳 🧾 ✉️ 📧 📨 📩 📤 📥 📦 📫 📪 📬 📭 📮 🗳️ ✏️ ✒️ 🖋️ 🖊️ 🖌️ 🖍️ 📝 💼 📁 📂 🗂️ 📅 📆 🗒️ 🗓️ 📇 📈 📉 📊 📋 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗄️ 🗑️ 🔒 🔓 🔏 🔐 🔑 🗝️ 🔨 🪓 ⛏️ ⚒️ 🛠️ 🗡️ ⚔️ 💣 🪚 🔧 🪛 🔩 ⚙️ 🗜️ ⚖️ 🦯 🔗 ⛓️ 🪝 🧰 🧲 🪜 🎁 📣 🔔 🧸 🪄 🪅 🪩 🪞 🧴 🧵 🧶 🪡 🧷 🪢 🧼 🪥 🧽 🧹 🪣 🧺 🧻 🚽 🚿 🛁");
addWorthItChatEmojiGroup("symbols", "❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 🩷 🩵 🩶 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ ☑️ ✔️ ❎ ➕ ➖ ➗ ✖️ 🟰 ➰ ➿ 〰️ 💱 💲 ⚕️ ♾️ 🔚 🔙 🔛 🔝 🔜 ⬆️ ↗️ ➡️ ↘️ ⬇️ ↙️ ⬅️ ↖️ ↕️ ↔️ 🔄 🔃 🔁 🔂 🔀 🔼 🔽 ⏫ ⏬ ⬛ ⬜ ◼️ ◻️ 🔺 🔻 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟫 🔳 🔲 ▪️ ▫️ ◾ ◽ 🔶 🔷 🔸 🔹 💠 🔘 🌟 ⭐ ✨ 💫 ☄️ 🎇 🎆 🧨 🎈 🎉 🎊 🎀 🎁 🔥");
addWorthItChatEmojiGroup("flags", "🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🇪🇺 🇽🇰 🇦🇨 🇦🇩 🇦🇪 🇦🇫 🇦🇬 🇦🇮 🇦🇱 🇦🇲 🇦🇴 🇦🇶 🇦🇷 🇦🇸 🇦🇹 🇦🇺 🇦🇼 🇦🇽 🇦🇿 🇧🇦 🇧🇧 🇧🇩 🇧🇪 🇧🇫 🇧🇬 🇧🇭 🇧🇮 🇧🇯 🇧🇱 🇧🇲 🇧🇳 🇧🇴 🇧🇶 🇧🇷 🇧🇸 🇧🇹 🇧🇻 🇧🇼 🇧🇾 🇧🇿 🇨🇦 🇨🇨 🇨🇩 🇨🇫 🇨🇬 🇨🇭 🇨🇮 🇨🇰 🇨🇱 🇨🇲 🇨🇳 🇨🇴 🇨🇷 🇨🇺 🇨🇻 🇨🇼 🇨🇽 🇨🇾 🇨🇿 🇩🇪 🇩🇯 🇩🇰 🇩🇲 🇩🇴 🇩🇿 🇪🇨 🇪🇪 🇪🇬 🇪🇭 🇪🇷 🇪🇸 🇪🇹 🇫🇮 🇫🇯 🇫🇰 🇫🇲 🇫🇴 🇫🇷 🇬🇦 🇬🇧 🇬🇩 🇬🇪 🇬🇫 🇬🇬 🇬🇭 🇬🇮 🇬🇱 🇬🇲 🇬🇳 🇬🇵 🇬🇶 🇬🇷 🇬🇸 🇬🇹 🇬🇺 🇬🇼 🇬🇾 🇭🇰 🇭🇲 🇭🇳 🇭🇷 🇭🇹 🇭🇺 🇮🇩 🇮🇪 🇮🇱 🇮🇲 🇮🇳 🇮🇴 🇮🇶 🇮🇷 🇮🇸 🇮🇹 🇯🇪 🇯🇲 🇯🇴 🇯🇵 🇰🇪 🇰🇬 🇰🇭 🇰🇮 🇰🇲 🇰🇳 🇰🇵 🇰🇷 🇰🇼 🇰🇾 🇰🇿 🇱🇦 🇱🇧 🇱🇨 🇱🇮 🇱🇰 🇱🇷 🇱🇸 🇱🇹 🇱🇺 🇱🇻 🇱🇾 🇲🇦 🇲🇨 🇲🇩 🇲🇪 🇲🇫 🇲🇬 🇲🇭 🇲🇰 🇲🇱 🇲🇲 🇲🇳 🇲🇴 🇲🇵 🇲🇶 🇲🇷 🇲🇸 🇲🇹 🇲🇺 🇲🇻 🇲🇼 🇲🇽 🇲🇾 🇲🇿 🇳🇦 🇳🇨 🇳🇪 🇳🇫 🇳🇬 🇳🇮 🇳🇱 🇳🇴 🇳🇵 🇳🇷 🇳🇺 🇳🇿 🇴🇲 🇵🇦 🇵🇪 🇵🇫 🇵🇬 🇵🇭 🇵🇰 🇵🇱 🇵🇲 🇵🇳 🇵🇷 🇵🇸 🇵🇹 🇵🇼 🇵🇾 🇶🇦 🇷🇪 🇷🇴 🇷🇸 🇷🇺 🇷🇼 🇸🇦 🇸🇧 🇸🇨 🇸🇩 🇸🇪 🇸🇬 🇸🇭 🇸🇮 🇸🇯 🇸🇰 🇸🇱 🇸🇲 🇸🇳 🇸🇴 🇸🇷 🇸🇸 🇸🇹 🇸🇻 🇸🇽 🇸🇾 🇸🇿 🇹🇨 🇹🇩 🇹🇫 🇹🇬 🇹🇭 🇹🇯 🇹🇰 🇹🇱 🇹🇲 🇹🇳 🇹🇴 🇹🇷 🇹🇹 🇹🇻 🇹🇼 🇹🇿 🇺🇦 🇺🇬 🇺🇲 🇺🇸 🇺🇾 🇺🇿 🇻🇦 🇻🇨 🇻🇪 🇻🇬 🇻🇮 🇻🇳 🇻🇺 🇼🇫 🇼🇸 🇾🇪 🇾🇹 🇿🇦 🇿🇲 🇿🇼");

function renderWorthItChatEmojiCategories() {
    const container = $("worthItChatEmojiCategories");
    if (!container) return;
    container.replaceChildren();
    for (const category of WORTH_IT_CHAT_EMOJI_CATEGORIES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "worth-it-chat-category-btn" + (worthItChatEmojiCategory === category.id ? " is-active" : "");
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", worthItChatEmojiCategory === category.id ? "true" : "false");
        button.setAttribute("aria-label", category.label);
        button.title = category.label;
        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = category.icon;
        const label = document.createElement("span");
        label.textContent = category.label;
        button.append(icon, label);
        button.addEventListener("click", event => {
            event.preventDefault();
            worthItChatEmojiCategory = category.id;
            renderWorthItChatEmojiCategories();
            renderWorthItChatEmojiGrid($("worthItChatEmojiSearch")?.value || "");
        });
        container.appendChild(button);
    }
}

function getWorthItChatFlagCode(emoji) {
    const points = Array.from(String(emoji || ""), character => character.codePointAt(0));
    if (points.length !== 2 || points.some(point => point < 0x1F1E6 || point > 0x1F1FF)) return "";
    return points.map(point => String.fromCharCode(point - 0x1F1E6 + 97)).join("");
}

function renderWorthItChatEmojiGrid(search = "") {
    const grid = $("worthItChatEmojiGrid");
    if (!grid) return;
    const query = String(search || "").trim().toLowerCase();
    grid.replaceChildren();
    const matches = WORTH_IT_CHAT_EMOJI_OPTIONS.filter(item => {
        const categoryMatches = !!query || worthItChatEmojiCategory === "all" || item.category === worthItChatEmojiCategory;
        return categoryMatches && (!query || item.emoji.includes(query) || item.keywords.includes(query));
    });
    if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "worth-it-chat-picker-empty";
        empty.textContent = "No matching emoji. Try another search.";
        grid.appendChild(empty);
        return;
    }
    for (const item of matches) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "worth-it-chat-emoji-option";
        const flagCode = item.category === "flags" ? getWorthItChatFlagCode(item.emoji) : "";
        if (flagCode) {
            const flagImage = document.createElement("img");
            flagImage.className = "worth-it-chat-emoji-flag";
            flagImage.src = "https://flagcdn.com/" + flagCode + ".svg";
            flagImage.alt = "";
            flagImage.loading = "lazy";
            flagImage.decoding = "async";
            flagImage.referrerPolicy = "no-referrer";
            flagImage.addEventListener("error", () => {
                flagImage.replaceWith(document.createTextNode(item.emoji));
            }, { once: true });
            button.appendChild(flagImage);
        } else {
            button.textContent = item.emoji;
        }
        button.title = item.keywords;
        button.setAttribute("aria-label", item.emoji + " " + item.keywords);
        button.addEventListener("click", () => insertWorthItChatEmoji(item.emoji));
        grid.appendChild(button);
    }
}

function insertWorthItChatEmoji(emoji) {
    const textarea = $("worthItChatInput");
    if (!textarea) return;
    const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
    const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
    if ((textarea.value.length - (end - start) + emoji.length) > 500) {
        setStatus("Messages are limited to 500 characters.", true);
        return;
    }
    textarea.setRangeText(emoji, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus({ preventScroll: true });
    // Keep the emoji picker open so multiple emoji can be selected in sequence.
}

const WORTH_IT_CHAT_GIF_LIBRARY = [
    { id: "laughing-smile", title: "Laughing smile", keywords: "laughing laugh funny smile joy", type: "gif", offset: 0, length: 16552 },
    { id: "party-confetti", title: "Party confetti", keywords: "party celebration celebrate birthday fun", type: "gif", offset: 16552, length: 23122 },
    { id: "rocket-launch", title: "Rocket launch", keywords: "rocket launch space go success", type: "gif", offset: 39674, length: 20434 },
    { id: "happy-dance", title: "Happy dance", keywords: "happy dance smile joy excited move", type: "gif", offset: 60108, length: 23878 },
    { id: "thinking-face", title: "Thinking face", keywords: "thinking wonder hmm idea question", type: "gif", offset: 83986, length: 16706 },
    { id: "thumbs-up", title: "Thumbs up", keywords: "like approval good yes great", type: "gif", offset: 100692, length: 18919 },
    { id: "wow-burst", title: "Wow burst", keywords: "wow amazed surprise shock burst", type: "gif", offset: 119611, length: 28718 },
    { id: "sleepy-cloud", title: "Sleepy cloud", keywords: "sleep sleepy tired goodnight rest", type: "gif", offset: 148329, length: 16055 },
    { id: "rainbow-wave", title: "Rainbow wave", keywords: "rainbow wave hello colorful pride", type: "gif", offset: 164384, length: 20769 },
    { id: "fireworks-show", title: "Fireworks show", keywords: "fireworks celebration night stars", type: "gif", offset: 185153, length: 26295 },
    { id: "coffee-break", title: "Coffee break", keywords: "coffee cup cozy break morning", type: "gif", offset: 211448, length: 22197 },
    { id: "celebration-stars", title: "Celebration stars", keywords: "celebration success shine sparkle", type: "gif", offset: 233645, length: 22322 },
    { id: "sparkle-burst", title: "Sparkle burst", keywords: "sparkle magic shine glitter star", type: "sticker", offset: 255967, length: 4262 },
    { id: "heart-pulse", title: "Heart pulse", keywords: "heart love affection romance like", type: "sticker", offset: 260229, length: 4882 },
    { id: "cat-blink", title: "Cat blink", keywords: "cat kitten animal cute pet", type: "sticker", offset: 265111, length: 8885 },
    { id: "cute-dog", title: "Cute dog", keywords: "dog puppy pet cute animal", type: "sticker", offset: 273996, length: 8909 },
    { id: "plant-sprout", title: "Plant sprout", keywords: "plant sprout seedling green nature grow", type: "sticker", offset: 282905, length: 7629 },
    { id: "sunflower", title: "Sunflower", keywords: "sunflower flower plant sunny garden", type: "sticker", offset: 290534, length: 12752 },
    { id: "coffee-cup", title: "Coffee cup", keywords: "coffee latte mug drink cozy", type: "sticker", offset: 303286, length: 4255 },
    { id: "star-eyes", title: "Star eyes", keywords: "star eyes excited happy amazed", type: "sticker", offset: 307541, length: 8586 },
    { id: "hug-heart", title: "Hug heart", keywords: "hug heart love caring comfort friends", type: "sticker", offset: 316127, length: 7100 },
    { id: "party-hat", title: "Party hat", keywords: "party hat birthday celebration", type: "sticker", offset: 323227, length: 4024 },
    { id: "little-ghost", title: "Little ghost", keywords: "ghost boo spooky cute halloween", type: "sticker", offset: 327251, length: 12742 },
    { id: "rainbow-heart", title: "Rainbow heart", keywords: "rainbow heart love colorful pride", type: "sticker", offset: 339993, length: 11632 },
    { id: "worth-it-check-pulse", title: "Worth It check pulse", keywords: "worth it approved verified check success confirmed", type: "gif", offset: 351625, length: 3815 },
    { id: "deal-sealed", title: "Deal sealed", keywords: "deal agreement stamp approved locked in", type: "gif", offset: 355440, length: 3820 },
    { id: "budget-bounce", title: "Budget bounce", keywords: "budget money bounce savings planning", type: "gif", offset: 359260, length: 2824 },
    { id: "price-drop-signal", title: "Price drop signal", keywords: "price drop discount lower value tag", type: "gif", offset: 362084, length: 2966 },
    { id: "profit-bloom", title: "Profit bloom", keywords: "profit growth bloom finances gain", type: "gif", offset: 365050, length: 3691 },
    { id: "savings-jar-shake", title: "Savings jar shake", keywords: "savings jar money piggy bank coin", type: "gif", offset: 368741, length: 3306 },
    { id: "coin-orbit", title: "Coin orbit", keywords: "coin money orbit value funds", type: "gif", offset: 372047, length: 3878 },
    { id: "golden-reveal", title: "Golden reveal", keywords: "gold treasure gem reveal shine", type: "gif", offset: 375925, length: 3592 },
    { id: "climbing-numbers", title: "Climbing numbers", keywords: "numbers stairs growth rising progress", type: "gif", offset: 379517, length: 3572 },
    { id: "rebound-trend", title: "Rebound trend", keywords: "rebound downward trend chart recovery", type: "gif", offset: 383089, length: 3775 },
    { id: "value-meter", title: "Value meter", keywords: "value measure gauge worth score", type: "gif", offset: 386864, length: 3090 },
    { id: "target-locked", title: "Target locked", keywords: "target aim accuracy goal focus", type: "gif", offset: 389954, length: 3963 },
    { id: "goal-trophy", title: "Goal trophy", keywords: "goal trophy achievement win award", type: "gif", offset: 393917, length: 3587 },
    { id: "checklist-complete", title: "Checklist complete", keywords: "checklist tasks done finished tick", type: "gif", offset: 397504, length: 3663 },
    { id: "progress-boost", title: "Progress boost", keywords: "progress completion status bar", type: "gif", offset: 401167, length: 2575 },
    { id: "crown-moment", title: "Crown moment", keywords: "crown royal top quality winner", type: "gif", offset: 403742, length: 3681 },
    { id: "medal-earned", title: "Medal earned", keywords: "medal award merit achievement", type: "gif", offset: 407423, length: 3303 },
    { id: "badge-unlocked", title: "Badge unlocked", keywords: "badge unlock achievement token", type: "gif", offset: 410726, length: 3317 },
    { id: "idea-ignition", title: "Idea ignition", keywords: "idea light bulb inspiration bright", type: "gif", offset: 414043, length: 2744 },
    { id: "brainwave-pop", title: "Brainwave pop", keywords: "brainwave thinking clever idea mind", type: "gif", offset: 416787, length: 2751 },
    { id: "puzzle-solved", title: "Puzzle solved", keywords: "puzzle solved solution fit", type: "gif", offset: 419538, length: 2980 },
    { id: "found-it", title: "Found it", keywords: "magnifier search discovered found item", type: "gif", offset: 422518, length: 2695 },
    { id: "plan-unfolding", title: "Plan unfolding", keywords: "plan map folds strategy route", type: "gif", offset: 425213, length: 4189 },
    { id: "bookmark-flip", title: "Bookmark flip", keywords: "bookmark mark saved read later", type: "gif", offset: 429402, length: 3183 },
    { id: "open-book-moment", title: "Open book moment", keywords: "book learning knowledge open page", type: "gif", offset: 432585, length: 3525 },
    { id: "note-in-motion", title: "Note in motion", keywords: "note pencil writing draw idea", type: "gif", offset: 436110, length: 3080 },
    { id: "calendar-flip", title: "Calendar flip", keywords: "calendar date schedule month", type: "gif", offset: 439190, length: 3745 },
    { id: "clockwork-tick", title: "Clockwork tick", keywords: "clock tick time punctuality", type: "gif", offset: 442935, length: 2963 },
    { id: "alarm-snooze-dance", title: "Alarm snooze dance", keywords: "alarm wake up timer morning", type: "gif", offset: 445898, length: 3487 },
    { id: "battery-recharge", title: "Battery recharge", keywords: "battery energy recharge full power", type: "gif", offset: 449385, length: 3692 },
    { id: "power-surge", title: "Power surge", keywords: "power electricity lightning energy", type: "gif", offset: 453077, length: 2972 },
    { id: "wifi-connected", title: "Wi-Fi connected", keywords: "wifi connected network online", type: "gif", offset: 456049, length: 2763 },
    { id: "full-bars", title: "Full bars", keywords: "signal bars reception strong network", type: "gif", offset: 458812, length: 3402 },
    { id: "device-sync", title: "Device sync", keywords: "devices sync transfer connected", type: "gif", offset: 462214, length: 2856 },
    { id: "laptop-startup", title: "Laptop startup", keywords: "laptop computer startup boot", type: "gif", offset: 465070, length: 3449 },
    { id: "phone-ring", title: "Phone ring", keywords: "phone smartphone calling ring", type: "gif", offset: 468519, length: 3423 },
    { id: "monitor-glow", title: "Monitor glow", keywords: "monitor screen desktop computer glow", type: "gif", offset: 471942, length: 3301 },
    { id: "headphones-groove", title: "Headphones groove", keywords: "headphones sound music groove listen", type: "gif", offset: 475243, length: 3019 },
    { id: "gamepad-combo", title: "Gamepad combo", keywords: "gamepad gaming combo controller", type: "gif", offset: 478262, length: 2955 },
    { id: "camera-snap", title: "Camera snap", keywords: "camera photo snap picture", type: "gif", offset: 481217, length: 3727 },
    { id: "speaker-pulse", title: "Speaker pulse", keywords: "speaker audio sound volume music", type: "gif", offset: 484944, length: 3081 },
    { id: "keyboard-tap", title: "Keyboard tap", keywords: "keyboard typing keys input", type: "gif", offset: 488025, length: 3422 },
    { id: "gear-in-motion", title: "Gear in motion", keywords: "gear cog mechanism rotate engineering", type: "gif", offset: 491447, length: 3290 },
    { id: "smartwatch-ping", title: "Smartwatch ping", keywords: "smartwatch wearable notification wrist", type: "gif", offset: 494737, length: 3927 },
    { id: "electric-drive", title: "Electric drive", keywords: "car electric vehicle charge transport", type: "gif", offset: 498664, length: 3328 },
    { id: "tire-spin", title: "Tire spin", keywords: "tire wheel rotation auto travel", type: "gif", offset: 501992, length: 3845 },
    { id: "road-trip-ready", title: "Road trip ready", keywords: "road trip route car travel", type: "gif", offset: 505837, length: 3328 },
    { id: "speed-gauge", title: "Speed gauge", keywords: "speedometer speed gauge measure", type: "gif", offset: 509165, length: 2986 },
    { id: "fuel-saver", title: "Fuel saver", keywords: "fuel pump efficient economy vehicle", type: "gif", offset: 512151, length: 3512 },
    { id: "home-sweet-home", title: "Home sweet home", keywords: "home house comfort living", type: "gif", offset: 515663, length: 3772 },
    { id: "key-to-home", title: "Key to home", keywords: "key home unlock house entry", type: "gif", offset: 519435, length: 2598 },
    { id: "moving-day", title: "Moving day", keywords: "moving box relocation delivery", type: "gif", offset: 522033, length: 3763 },
    { id: "bamboo-breeze", title: "Bamboo breeze", keywords: "bamboo plant leaves breeze nature", type: "gif", offset: 525796, length: 3014 },
    { id: "bonsai-balance", title: "Bonsai balance", keywords: "bonsai tree balance patience garden", type: "gif", offset: 528810, length: 3078 },
    { id: "orchid-opening", title: "Orchid opening", keywords: "orchid flower opening bloom botanical", type: "gif", offset: 531888, length: 3195 },
    { id: "sunrise-spark", title: "Sunrise spark", keywords: "sun sunrise rays morning bright", type: "gif", offset: 535083, length: 2711 },
    { id: "moonlit-drift", title: "Moonlit drift", keywords: "moon crescent night drift calm", type: "gif", offset: 537794, length: 2423 },
    { id: "weatherproof-umbrella", title: "Weatherproof umbrella", keywords: "umbrella rain weather protection", type: "gif", offset: 540217, length: 2979 },
    { id: "rain-meter", title: "Rain meter", keywords: "rain drops forecast weather", type: "gif", offset: 543196, length: 2760 },
    { id: "snowfall-swirl", title: "Snowfall swirl", keywords: "snowflake snow winter crystal", type: "gif", offset: 545956, length: 2570 },
    { id: "wind-tunnel", title: "Wind tunnel", keywords: "wind breeze airflow swirl", type: "gif", offset: 548526, length: 2594 },
    { id: "compass-quest", title: "Compass quest", keywords: "compass navigation direction journey", type: "gif", offset: 551120, length: 3500 },
    { id: "route-mapper", title: "Route mapper", keywords: "route map navigation destination", type: "gif", offset: 554620, length: 4147 },
    { id: "train-departure", title: "Train departure", keywords: "train railway station journey", type: "gif", offset: 558767, length: 3345 },
    { id: "bicycle-roll", title: "Bicycle roll", keywords: "bicycle bike cycling wheel ride", type: "gif", offset: 562112, length: 3199 },
    { id: "airplane-glide", title: "Airplane glide", keywords: "airplane flight travel sky", type: "gif", offset: 565311, length: 3141 },
    { id: "sailboat-drift", title: "Sailboat drift", keywords: "sailboat sailing sea boat", type: "gif", offset: 568452, length: 3010 },
    { id: "satellite-orbit", title: "Satellite orbit", keywords: "satellite space orbit communication", type: "gif", offset: 571462, length: 3329 },
    { id: "planetary-spin", title: "Planetary spin", keywords: "planet space orbit ring astronomy", type: "gif", offset: 574791, length: 2413 },
    { id: "meteor-dash", title: "Meteor dash", keywords: "meteor shooting star space streak", type: "gif", offset: 577204, length: 2754 },
    { id: "lighthouse-signal", title: "Lighthouse signal", keywords: "lighthouse coast beacon guide", type: "gif", offset: 579958, length: 3414 },
    { id: "bridge-builder", title: "Bridge builder", keywords: "bridge construction connection build", type: "gif", offset: 583372, length: 2921 },
    { id: "handshake-spark", title: "Handshake spark", keywords: "handshake deal agreement partnership", type: "gif", offset: 586293, length: 3148 },
    { id: "teamwork-high-five", title: "Teamwork high five", keywords: "teamwork high five together celebrate", type: "gif", offset: 589441, length: 3417 },
    { id: "teamwork-hands", title: "Teamwork hands", keywords: "hands collaboration help united", type: "gif", offset: 592858, length: 3134 },
    { id: "finish-line-crossed", title: "Finish line crossed", keywords: "finish line race goal completed", type: "gif", offset: 595992, length: 3096 },
    { id: "victory-pennant", title: "Victory pennant", keywords: "victory flag pennant success", type: "gif", offset: 599088, length: 2816 },
    { id: "delivery-arrives", title: "Delivery arrives", keywords: "delivery box parcel arrived courier", type: "gif", offset: 601904, length: 3809 },
    { id: "shopping-win", title: "Shopping win", keywords: "shopping bag good purchase store", type: "gif", offset: 605713, length: 3618 },
    { id: "tag-it-right", title: "Tag it right", keywords: "tag label price mark item", type: "gif", offset: 609331, length: 2963 },
    { id: "package-unbox", title: "Package unbox", keywords: "package parcel box open delivery", type: "gif", offset: 612294, length: 3805 },
    { id: "gift-wrap-wow", title: "Gift wrap wow", keywords: "gift wrapped present ribbon surprise", type: "gif", offset: 616099, length: 3649 },
    { id: "cake-slice-celebration", title: "Cake slice celebration", keywords: "cake dessert slice candle treat", type: "gif", offset: 619748, length: 3416 },
    { id: "taco-tuesday", title: "Taco Tuesday", keywords: "taco food dinner snack", type: "gif", offset: 623164, length: 3512 },
    { id: "pizza-slice-spin", title: "Pizza slice spin", keywords: "pizza slice cheese dinner food", type: "gif", offset: 626676, length: 3538 },
    { id: "donut-loop", title: "Donut loop", keywords: "donut doughnut pastry sweet treat", type: "gif", offset: 630214, length: 3410 },
    { id: "boba-bubble-pop", title: "Boba bubble pop", keywords: "boba bubble tea tapioca drink", type: "gif", offset: 633624, length: 3449 },
    { id: "smart-purchase-seal", title: "Smart purchase seal", keywords: "smart purchase verified seal worth it", type: "gif", offset: 637073, length: 3822 },
    { id: "golden-ok", title: "Golden OK", keywords: "golden ok approved badge check seal", type: "sticker", offset: 640895, length: 3453 },
    { id: "lucky-ticket", title: "Lucky ticket", keywords: "ticket lucky entry prize pass", type: "sticker", offset: 644348, length: 2515 },
    { id: "blue-ribbon-buddy", title: "Blue ribbon buddy", keywords: "blue ribbon quality award badge", type: "sticker", offset: 646863, length: 2770 },
    { id: "lucky-coin", title: "Lucky coin", keywords: "lucky coin gold fortune money", type: "sticker", offset: 649633, length: 3436 },
    { id: "diamond-doodle", title: "Diamond doodle", keywords: "diamond gem crystal luxury sparkle", type: "sticker", offset: 653069, length: 3171 },
    { id: "tiny-crown", title: "Tiny crown", keywords: "tiny crown royal mini king queen", type: "sticker", offset: 656240, length: 3208 },
    { id: "shield-buddy", title: "Shield buddy", keywords: "shield protection safe trust guard", type: "sticker", offset: 659448, length: 3433 },
    { id: "compass-pal", title: "Compass pal", keywords: "compass guide direction travel", type: "sticker", offset: 662881, length: 3134 },
    { id: "mini-trophy", title: "Mini trophy", keywords: "mini trophy prize winner award", type: "sticker", offset: 666015, length: 3166 },
    { id: "crystal-ball", title: "Crystal ball", keywords: "crystal ball fortune magic future", type: "sticker", offset: 669181, length: 3175 },
    { id: "magic-wand", title: "Magic wand", keywords: "magic wand wizard spell sparkle", type: "sticker", offset: 672356, length: 2788 },
    { id: "potion-pop", title: "Potion pop", keywords: "potion bottle magic liquid fantasy", type: "sticker", offset: 675144, length: 3133 },
    { id: "robot-buddy", title: "Robot buddy", keywords: "robot friend bot cute metal", type: "sticker", offset: 678277, length: 2987 },
    { id: "panda-pal", title: "Panda pal", keywords: "panda bear bamboo animal cute", type: "sticker", offset: 681264, length: 3411 },
    { id: "fox-scout", title: "Fox scout", keywords: "fox animal orange clever forest", type: "sticker", offset: 684675, length: 3580 },
    { id: "penguin-puff", title: "Penguin puff", keywords: "penguin bird icy cute waddle", type: "sticker", offset: 688255, length: 3292 },
    { id: "wise-owl", title: "Wise owl", keywords: "owl bird wisdom night feathers", type: "sticker", offset: 691547, length: 3244 },
    { id: "frog-champion", title: "Frog champion", keywords: "frog amphibian green pond cute", type: "sticker", offset: 694791, length: 3053 },
    { id: "bee-buzz", title: "Bee buzz", keywords: "bee insect honey wings buzz", type: "sticker", offset: 697844, length: 3891 },
    { id: "butterfly-bloom", title: "Butterfly bloom", keywords: "butterfly wings flower nature", type: "sticker", offset: 701735, length: 3478 },
    { id: "tiny-turtle", title: "Tiny turtle", keywords: "turtle tortoise shell ocean slow", type: "sticker", offset: 705213, length: 3322 },
    { id: "whale-wink", title: "Whale wink", keywords: "whale sea ocean marine cute", type: "sticker", offset: 708535, length: 3491 },
    { id: "orbit-octopus", title: "Orbit octopus", keywords: "octopus tentacles sea eight arms", type: "sticker", offset: 712026, length: 2817 },
    { id: "jellyfish-glow", title: "Jellyfish glow", keywords: "jellyfish underwater bell tentacles", type: "sticker", offset: 714843, length: 3118 },
    { id: "seahorse-swish", title: "Seahorse swish", keywords: "seahorse marine ocean pony fish", type: "sticker", offset: 717961, length: 2762 },
    { id: "crab-captain", title: "Crab captain", keywords: "crab sea claws sideways ocean", type: "sticker", offset: 720723, length: 2784 },
    { id: "koi-splash", title: "Koi splash", keywords: "koi fish pond japanese water", type: "sticker", offset: 723507, length: 3286 },
    { id: "happy-axolotl", title: "Happy axolotl", keywords: "axolotl salamander gills smile cute", type: "sticker", offset: 726793, length: 3004 },
    { id: "dino-grin", title: "Dino grin", keywords: "dinosaur dino prehistoric tiny roar", type: "sticker", offset: 729797, length: 3538 },
    { id: "hedgehog-hug", title: "Hedgehog hug", keywords: "hedgehog spines small animal", type: "sticker", offset: 733335, length: 3591 },
    { id: "raccoon-bandit", title: "Raccoon bandit", keywords: "raccoon masked animal paws night", type: "sticker", offset: 736926, length: 3266 },
    { id: "koala-cuddle", title: "Koala cuddle", keywords: "koala eucalyptus bear cute", type: "sticker", offset: 740192, length: 3534 },
    { id: "capybara-chill", title: "Capybara chill", keywords: "capybara calm rodent animal relax", type: "sticker", offset: 743726, length: 3035 },
    { id: "rabbit-hop", title: "Rabbit hop", keywords: "rabbit bunny ears hop meadow", type: "sticker", offset: 746761, length: 3867 },
    { id: "batty-buddy", title: "Batty buddy", keywords: "bat wings night flying mammal", type: "sticker", offset: 750628, length: 2845 },
    { id: "moon-moth", title: "Moon moth", keywords: "moth wings moon night insect", type: "sticker", offset: 753473, length: 3176 },
    { id: "peacock-proud", title: "Peacock proud", keywords: "peacock feathers bird fan proud", type: "sticker", offset: 756649, length: 3506 },
    { id: "fancy-flamingo", title: "Fancy flamingo", keywords: "flamingo pink bird long legs", type: "sticker", offset: 760155, length: 2951 },
    { id: "parrot-pal", title: "Parrot pal", keywords: "parrot tropical bird beak feathers", type: "sticker", offset: 763106, length: 2827 },
    { id: "snail-mail", title: "Snail mail", keywords: "snail shell slow cute mail", type: "sticker", offset: 765933, length: 3192 },
    { id: "lucky-ladybug", title: "Lucky ladybug", keywords: "ladybug beetle red spots luck", type: "sticker", offset: 769125, length: 3392 },
    { id: "magic-mushroom", title: "Magic mushroom", keywords: "mushroom toadstool forest fantasy", type: "sticker", offset: 772517, length: 2994 },
    { id: "clover-charm", title: "Clover charm", keywords: "clover four leaf luck green", type: "sticker", offset: 775511, length: 2835 },
    { id: "cool-cactus", title: "Cool cactus", keywords: "cactus desert succulent spines", type: "sticker", offset: 778346, length: 3087 },
    { id: "monstera-mate", title: "Monstera mate", keywords: "monstera tropical leaf plant", type: "sticker", offset: 781433, length: 2778 },
    { id: "fern-friend", title: "Fern friend", keywords: "fern frond green plant nature", type: "sticker", offset: 784211, length: 2744 },
    { id: "orchid-aura", title: "Orchid aura", keywords: "orchid flower petals bloom purple", type: "sticker", offset: 786955, length: 2913 },
    { id: "acorn-pal", title: "Acorn pal", keywords: "acorn oak nut fall autumn", type: "sticker", offset: 789868, length: 2696 },
    { id: "pinecone-pal", title: "Pinecone pal", keywords: "pinecone evergreen forest cone", type: "sticker", offset: 792564, length: 2668 },
    { id: "seashell-shine", title: "Seashell shine", keywords: "seashell beach ocean spiral shell", type: "sticker", offset: 795232, length: 2768 },
    { id: "coral-crown", title: "Coral crown", keywords: "coral reef branching ocean", type: "sticker", offset: 798000, length: 2358 },
    { id: "starfish-smile", title: "Starfish smile", keywords: "starfish sea star marine ocean", type: "sticker", offset: 800358, length: 2754 },
    { id: "mini-mountain", title: "Mini mountain", keywords: "mountain peak summit outdoors", type: "sticker", offset: 803112, length: 2996 },
    { id: "tiny-volcano", title: "Tiny volcano", keywords: "volcano lava eruption earth", type: "sticker", offset: 806108, length: 3039 },
    { id: "puddle-pal", title: "Puddle pal", keywords: "puddle water splash rain droplet", type: "sticker", offset: 809147, length: 2786 },
    { id: "snowflake-sweet", title: "Snowflake sweet", keywords: "snowflake winter ice crystal", type: "sticker", offset: 811933, length: 2379 },
    { id: "sunbeam-smile", title: "Sunbeam smile", keywords: "sunbeam sun sunny bright smile", type: "sticker", offset: 814312, length: 2527 },
    { id: "moon-mood", title: "Moon mood", keywords: "crescent moon night calm sleepy", type: "sticker", offset: 816839, length: 2236 },
    { id: "cloud-comet", title: "Cloud comet", keywords: "cloud weather fluffy sky comet", type: "sticker", offset: 819075, length: 2402 },
    { id: "tiny-tornado", title: "Tiny tornado", keywords: "tornado whirlwind twister wind", type: "sticker", offset: 821477, length: 2408 },
    { id: "firefly-glow", title: "Firefly glow", keywords: "firefly insect glowing night light", type: "sticker", offset: 823885, length: 2400 },
    { id: "lightning-bug", title: "Lightning bug", keywords: "lightning bug firefly electric sparkle", type: "sticker", offset: 826285, length: 2680 },
    { id: "snow-globe-dream", title: "Snow globe dream", keywords: "snow globe winter flakes glass", type: "sticker", offset: 828965, length: 3162 },
    { id: "hourglass-hurry", title: "Hourglass hurry", keywords: "hourglass time sand timer", type: "sticker", offset: 832127, length: 2598 },
    { id: "pocket-tv", title: "Pocket TV", keywords: "tv television screen tiny retro", type: "sticker", offset: 834725, length: 2957 },
    { id: "notebook-nudge", title: "Notebook nudge", keywords: "notebook journal paper study", type: "sticker", offset: 837682, length: 3251 },
    { id: "paper-plane-pal", title: "Paper plane pal", keywords: "paper airplane folded note travel", type: "sticker", offset: 840933, length: 2873 },
    { id: "camera-heart", title: "Camera heart", keywords: "camera photo heart memory", type: "sticker", offset: 843806, length: 3441 },
    { id: "headphone-happy", title: "Headphone happy", keywords: "headphones music listen joyful", type: "sticker", offset: 847247, length: 2684 },
    { id: "game-controller-grin", title: "Game controller grin", keywords: "game controller console video game", type: "sticker", offset: 849931, length: 3403 },
    { id: "smartphone-smile", title: "Smartphone smile", keywords: "smartphone phone screen app", type: "sticker", offset: 853334, length: 3060 },
    { id: "laptop-pal", title: "Laptop pal", keywords: "laptop computer tech friend", type: "sticker", offset: 856394, length: 3158 },
    { id: "battery-buddy", title: "Battery buddy", keywords: "battery power charge energy", type: "sticker", offset: 859552, length: 3297 },
    { id: "wi-fi-wizard", title: "Wi-Fi wizard", keywords: "wifi wizard wireless network", type: "sticker", offset: 862849, length: 2584 },
    { id: "keychain-star", title: "Keychain star", keywords: "keychain keys star accessory", type: "sticker", offset: 865433, length: 3394 },
    { id: "backpack-buddy", title: "Backpack buddy", keywords: "backpack bag school hiking", type: "sticker", offset: 868827, length: 3280 },
    { id: "suitcase-scout", title: "Suitcase scout", keywords: "suitcase luggage travel vacation", type: "sticker", offset: 872107, length: 3049 },
    { id: "shopping-tote", title: "Shopping tote", keywords: "shopping tote reusable bag market", type: "sticker", offset: 875156, length: 3289 },
    { id: "ramen-bowl", title: "Ramen bowl", keywords: "ramen noodles soup bowl food", type: "sticker", offset: 878445, length: 2873 },
    { id: "sushi-spark", title: "Sushi spark", keywords: "sushi rice fish japanese food", type: "sticker", offset: 881318, length: 2572 },
    { id: "dumpling-delight", title: "Dumpling delight", keywords: "dumpling bao gyoza steamed food", type: "sticker", offset: 883890, length: 2802 },
    { id: "strawberry-sweet", title: "Strawberry sweet", keywords: "strawberry fruit red seeds", type: "sticker", offset: 886692, length: 3017 },
    { id: "avocado-ace", title: "Avocado ace", keywords: "avocado fruit green pit healthy", type: "sticker", offset: 889709, length: 3106 },
    { id: "pineapple-crown", title: "Pineapple crown", keywords: "pineapple tropical fruit spiky top", type: "sticker", offset: 892815, length: 3263 },
    { id: "watermelon-wink", title: "Watermelon wink", keywords: "watermelon fruit green rind pink", type: "sticker", offset: 896078, length: 2825 },
    { id: "cherry-duo", title: "Cherry duo", keywords: "cherries fruit twin red stems", type: "sticker", offset: 898903, length: 2562 },
    { id: "boba-buddy", title: "Boba buddy", keywords: "boba milk tea pearls drink cute", type: "sticker", offset: 901465, length: 3090 },
    { id: "croissant-cozy", title: "Croissant cozy", keywords: "croissant pastry bakery breakfast", type: "sticker", offset: 904555, length: 3311 }
];
const WORTH_IT_CHAT_GIF_BUNDLE_PATH = "/assets/worth-it-chat-gifs/library.base64.txt?v=worthit-original-animation-library-200-20261029a";
let worthItChatGifBundlePromise = null;
const worthItChatGifObjectUrls = new Map();

function isWorthItChatLocalGifItem(item) {
    if (!item || !["gif", "sticker"].includes(item.type)) return false;
    return WORTH_IT_CHAT_GIF_LIBRARY.some(entry =>
        entry.id === item.id &&
        entry.type === item.type &&
        entry.offset === item.offset &&
        entry.length === item.length
    );
}

async function getWorthItChatGifAsset(item) {
    if (!isWorthItChatLocalGifItem(item)) {
        throw new Error("Choose an animation from the Worth It library.");
    }
    if (!worthItChatGifBundlePromise) {
        worthItChatGifBundlePromise = (async () => {
            const response = await fetch(WORTH_IT_CHAT_GIF_BUNDLE_PATH, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Accept": "text/plain" }
            });
            if (!response.ok) throw new Error("Animation library request failed (" + response.status + ").");
            const encoded = (await response.text()).replace(/\s+/g, "");
            if (!encoded || encoded.length > 32 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
                throw new Error("The Worth It animation library is invalid.");
            }
            let binary;
            try { binary = atob(encoded); }
            catch (_) { throw new Error("The Worth It animation library could not be decoded."); }
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            return bytes;
        })().catch(error => {
            worthItChatGifBundlePromise = null;
            throw error;
        });
    }
    const bytes = await worthItChatGifBundlePromise;
    const start = item.offset;
    const end = start + item.length;
    if (start < 0 || item.length < 7 || end > bytes.length) {
        throw new Error("That animation is not available in the Worth It library.");
    }
    const slice = bytes.slice(start, end);
    const signature = String.fromCharCode(...slice.slice(0, 6));
    if (signature !== "GIF87a" && signature !== "GIF89a") {
        throw new Error("That animation did not pass file validation.");
    }
    const blob = new Blob([slice], { type: "image/gif" });
    // Self-contained data URLs avoid deployment CSP rules rejecting blob: image previews.
    let previewUrl = worthItChatGifObjectUrls.get(item.id);
    if (!previewUrl) {
        let binaryChunk = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < slice.length; i += chunkSize) {
            binaryChunk += String.fromCharCode(...slice.subarray(i, i + chunkSize));
        }
        previewUrl = "data:image/gif;base64," + btoa(binaryChunk);
        worthItChatGifObjectUrls.set(item.id, previewUrl);
    }
    return { blob, previewUrl };
}

function setWorthItChatGifStatus(message, isError = false) {
    const status = $("worthItChatGifStatus");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", !!isError);
}

function renderWorthItChatGifCategories() {
    const container = $("worthItChatGifCategoryTabs");
    if (!container) return;
    container.replaceChildren();
    const categories = [
        { id: "all", label: "All" },
        { id: "gif", label: "GIFs" },
        { id: "sticker", label: "Stickers" }
    ];
    for (const category of categories) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "worth-it-chat-media-tab" + (worthItChatGifCategory === category.id ? " is-active" : "");
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", worthItChatGifCategory === category.id ? "true" : "false");
        button.textContent = category.label;
        button.addEventListener("click", event => {
            event.preventDefault();
            worthItChatGifCategory = category.id;
            renderWorthItChatGifCategories();
            loadWorthItChatGifResults($("worthItChatGifSearch")?.value || "");
        });
        container.appendChild(button);
    }
}

function renderWorthItChatGifResults(items) {
    const grid = $("worthItChatGifGrid");
    if (!grid) return;
    grid.replaceChildren();
    const usable = (Array.isArray(items) ? items : []).filter(isWorthItChatLocalGifItem);
    if (!usable.length) {
        setWorthItChatGifStatus("No matching Worth It animations yet. Try another search or category.", false);
        return;
    }
    for (const item of usable) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "worth-it-chat-gif-option";
        button.setAttribute("aria-label", "Attach " + item.type + ": " + item.title);
        button.title = item.title;
        const image = document.createElement("img");
        image.alt = item.title;
        image.loading = "lazy";
        image.decoding = "async";
        image.dataset.animationId = item.id;
        button.appendChild(image);
        const label = document.createElement("span");
        label.className = "worth-it-chat-gif-option-label";
        label.textContent = item.title;
        button.appendChild(label);
        button.addEventListener("click", () => selectWorthItChatGif(item));
        grid.appendChild(button);
        getWorthItChatGifAsset(item).then(asset => {
            if (button.isConnected) image.src = asset.previewUrl;
        }).catch(error => {
            console.error("Worth It animation preview failed:", item.id, error);
            if (button.isConnected) {
                image.alt = item.title + " preview unavailable";
                button.title = item.title + ": " + (error && error.message ? error.message : "Preview unavailable");
                button.classList.add("is-unavailable");
            }
        });
    }
    setWorthItChatGifStatus(usable.length + (usable.length === 1 ? " original animation in the Worth It library." : " original animations in the Worth It library."), false);
}

function loadWorthItChatGifResults(query = "") {
    worthItChatGifSearchSequence += 1;
    const term = String(query || "").trim().slice(0, 80).toLowerCase();
    const matches = WORTH_IT_CHAT_GIF_LIBRARY.filter(item => {
        const categoryMatches = worthItChatGifCategory === "all" || item.type === worthItChatGifCategory;
        const searchMatches = !term || (item.title + " " + item.keywords + " " + item.type).toLowerCase().includes(term);
        return categoryMatches && searchMatches;
    });
    renderWorthItChatGifResults(matches);
}

async function selectWorthItChatGif(item) {
    if (!isWorthItChatLocalGifItem(item)) return;
    setWorthItChatGifStatus("Preparing " + item.type + "…", false);
    const targetDraftKey = worthItChatDraftKey();
    try {
        const asset = await getWorthItChatGifAsset(item);
        if (targetDraftKey !== worthItChatDraftKey()) return;
        if (!asset.blob.size || asset.blob.size > 20 * 1024 * 1024) {
            throw new Error("The selected animation must be a valid file of 20 MB or smaller.");
        }
        const file = new File([asset.blob], "worth-it-" + item.id + ".gif", { type: "image/gif" });
        await validateChatMediaSignature(file, "image/gif");
        const previewUrl = URL.createObjectURL(file);
        setPendingMedia(file, previewUrl, "gif");
        closeWorthItChatPickers();
        setStatus((item.type === "sticker" ? "Sticker" : "GIF") + " attached. Press Send to share it.", false);
        $("worthItChatInput")?.focus();
    } catch (error) {
        setWorthItChatGifStatus(error?.message || "Could not attach that animation. Please try another.", true);
    }
}

function openWorthItChatEmojiPicker() {
    showWorthItChatMediaTab("emoji", true);
}

function openWorthItChatGifPicker() {
    showWorthItChatMediaTab("gif", true);
}

function openWorthItChatStickerPicker() {
    showWorthItChatMediaTab("sticker", true);
}

function animateWorthItChatActionTap(button) {
    if (!button) return;
    if (button._worthItChatTapTimer) window.clearTimeout(button._worthItChatTapTimer);
    button.classList.remove("is-chat-action-tapped");
    void button.offsetWidth;
    button.classList.add("is-chat-action-tapped");
    button._worthItChatTapTimer = window.setTimeout(() => {
        button.classList.remove("is-chat-action-tapped");
        button._worthItChatTapTimer = null;
    }, 360);
}

function animateWorthItChatEmojiButton() {
    const button = $("worthItChatEmojiAction");
    if (!button) return;

    if (button._worthItChatEmojiTimer) window.clearTimeout(button._worthItChatEmojiTimer);
    button._worthItChatEmojiAnimationToken = (button._worthItChatEmojiAnimationToken || 0) + 1;
    const token = button._worthItChatEmojiAnimationToken;
    const frames = ["😎", "🤩", "🥳", "😄", "😀"];
    let index = 0;

    button.classList.remove("is-emoji-shuffling");
    void button.offsetWidth;
    button.classList.add("is-emoji-shuffling");

    const showNextFrame = () => {
        if (token !== button._worthItChatEmojiAnimationToken) return;
        button.textContent = frames[index++];
        if (index < frames.length) {
            button._worthItChatEmojiTimer = window.setTimeout(showNextFrame, 105);
        } else {
            button._worthItChatEmojiTimer = window.setTimeout(() => {
                if (token !== button._worthItChatEmojiAnimationToken) return;
                button.textContent = "😀";
                button.classList.remove("is-emoji-shuffling");
                button._worthItChatEmojiTimer = null;
            }, 140);
        }
    };
    showNextFrame();
}

function setupChatUI() {
    for (const id of ["worthItChatGifAction", "worthItChatStickerAction", "worthItChatEmojiAction", "worthItChatVoiceBtn"]) {
        const button = $(id);
        button?.addEventListener("click", () => animateWorthItChatActionTap(button));
    }
    $("worthItChatEmojiAction")?.addEventListener("mouseenter", animateWorthItChatEmojiButton);
    $("worthItChatEmojiAction")?.addEventListener("focus", animateWorthItChatEmojiButton);
    $("worthItChatEmojiAction")?.addEventListener("click", animateWorthItChatEmojiButton);

    $("worthItChatMessages")?.addEventListener("scroll", updateWorthItChatTravelPresentButton, {passive:true});
    $("worthItChatTravelPresentBtn")?.addEventListener("click", () => {
        const messages = $("worthItChatMessages");
        if (!messages) return;
        const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        messages.scrollTo({
            top: messages.scrollHeight,
            behavior: prefersReducedMotion ? "auto" : "smooth"
        });
        animateWorthItChatActionTap($("worthItChatTravelPresentBtn"));
    });

    window.visualViewport?.addEventListener("resize", updateWorthItChatVisualViewport);
    window.visualViewport?.addEventListener("scroll", updateWorthItChatVisualViewport);
    window.addEventListener("resize", updateWorthItChatVisualViewport);
    $("worthItChatInput")?.addEventListener("focus", updateWorthItChatVisualViewport);
    $("worthItChatInput")?.addEventListener("blur", updateWorthItChatVisualViewport);
    $("worthItChatInput")?.addEventListener("input", function () {
        updateCharacterCount();
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 140) + "px";
        renderWorthItChatComposerPreview();
        updateWorthItChatComposerAction();
        saveActiveWorthItChatDraft();
        handleWorthItChatTypingInput();
    });
    $("worthItChatInput")?.addEventListener("scroll", renderWorthItChatComposerPreview);
    $("worthItChatInput")?.addEventListener("focus", renderWorthItChatComposerPreview);
    $("worthItChatInput")?.addEventListener("blur", () => {
        renderWorthItChatComposerPreview();
        stopWorthItChatTyping();
    });
    $("worthItChatInput")?.addEventListener("click", renderWorthItChatComposerPreview);
    $("worthItChatInput")?.addEventListener("keyup", renderWorthItChatComposerPreview);
    $("worthItChatInput")?.addEventListener("select", renderWorthItChatComposerPreview);
    renderWorthItChatComposerPreview();
    updateWorthItChatComposerAction();
    $("worthItChatInput")?.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault(); sendWorthItChatMessage();
        }
    });

    $("worthItChatPlusBtn")?.addEventListener("click", event => {
        event.preventDefault();
        openWorthItChatFilePicker();
    });
    $("worthItChatGifAction")?.addEventListener("click", openWorthItChatGifPicker);
    $("worthItChatStickerAction")?.addEventListener("click", openWorthItChatStickerPicker);
    $("worthItChatEmojiAction")?.addEventListener("click", openWorthItChatEmojiPicker);
    $("worthItChatMediaClose")?.addEventListener("click", closeWorthItChatPickers);
    document.querySelectorAll("[data-worth-it-chat-media-tab]").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            showWorthItChatMediaTab(button.dataset.worthItChatMediaTab);
        });
    });
    $("worthItChatEmojiSearch")?.addEventListener("input", event => renderWorthItChatEmojiGrid(event.currentTarget.value));
    $("worthItChatGifSearchForm")?.addEventListener("submit", event => {
        event.preventDefault();
        loadWorthItChatGifResults($("worthItChatGifSearch")?.value || "");
    });
    $("worthItChatGifSearch")?.addEventListener("input", event => {
        loadWorthItChatGifResults(event.currentTarget.value);
    });
    $("worthItChatFileInput")?.addEventListener("change", function () {
        const file = this.files?.[0];
        this.value = "";
        const target = pendingFilePickerTarget;
        pendingFilePickerTarget = null;
        if (!file) return;
        if (!chatUser?.id || !target?.key || target.userId !== chatUser.id) {
            setStatus("Your account changed while the file picker was open. Please choose the file again.", true);
            return;
        }
        const targetIsActive = target.key === worthItChatDraftKey();
        const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"];
        if (!allowed.includes(file.type)) {
            if (targetIsActive) setPendingMedia(null, "", "");
            setStatus("Choose a PNG, JPG, WEBP, GIF, MP4 or WebM file.", true);
            return;
        }
        const isGif = file.type === "image/gif";
        const isVideo = file.type.startsWith("video/");
        const maxBytes = isGif ? 20 * 1024 * 1024 : isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
        const maxLabel = isGif ? "20 MB" : isVideo ? "50 MB" : "15 MB";
        if (!file.size || file.size > maxBytes) {
            if (targetIsActive) setPendingMedia(null, "", "");
            setStatus("Choose a non-empty " + (isGif ? "GIF" : isVideo ? "video" : "image") + " that is " + maxLabel + " or smaller.", true);
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        const type = isGif ? "gif" : isVideo ? "video" : "image";
        if (!targetIsActive) {
            const previous = worthItChatDrafts.get(target.key) || { text: "", mediaFile: null, mediaUrl: "", mediaType: "", replyQuote: null };
            if (previous.mediaUrl && previous.mediaUrl !== objectUrl) releaseWorthItChatDraftUrl(previous.mediaUrl, target.key);
            worthItChatDrafts.set(target.key, { ...previous, mediaFile: file, mediaUrl: objectUrl, mediaType: type });
            setStatus("The attachment was saved to the chat where you opened Upload. Return to that conversation to review and send it.", false);
            return;
        }
        setPendingMedia(file, objectUrl, type);
        setStatus("", false);
    });
    $("worthItChatSidebarSearch")?.addEventListener("input", () => {
        const search = $("worthItChatSidebarSearch");
        const clear = $("worthItChatSidebarSearchClear");
        if (clear) clear.hidden = !String(search?.value || "").length;
        renderFriends();
        renderConversations();
    });
    $("worthItChatSidebarSearchClear")?.addEventListener("click", () => {
        const search = $("worthItChatSidebarSearch");
        if (!search) return;
        search.value = "";
        search.dispatchEvent(new Event("input", {bubbles:true}));
        search.focus();
    });
    $("worthItChatReplyCloseBtn")?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        clearWorthItChatReplyQuote();
        // Removing a reply is not a request to open the on-screen keyboard.
    });
    $("worthItChatHeaderNotifications")?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        toggleWorthItChatNotifications(button.dataset.chatKey || getActiveChatNotificationKey(), button);
    });
    $("worthItChatShareInviteBtn")?.addEventListener("click", window.shareWorthItGroupInvite);
    $("worthItChatInviteAcceptBtn")?.addEventListener("click", window.acceptWorthItGroupInvite);
    $("worthItChatInviteCancelBtn")?.addEventListener("click", window.dismissWorthItGroupInvite);
    $("worthItChatGroupForm")?.addEventListener("submit", createWorthItGroupChat);
    $("worthItChatGroupSearch")?.addEventListener("input", renderGroupFriendChoices);
    $("worthItChatGroupName")?.addEventListener("input", () => { setGroupStatus("", false); updateGroupSelectionUI(); });
    $("worthItChatOverlay")?.addEventListener("click", function (event) {
        if (event.target !== this) return;
        // /chat is a real, shareable route. Clicking its backdrop must not eject
        // the user to Home or leave the profile/chat layers in a mixed state.
        if (isChatRoutePath()) return;
        showChatOverlay(false);
    });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && chatOpen) {
            const mediaPicker = $("worthItChatMediaPicker");
            if (mediaPicker && !mediaPicker.hidden) {
                closeWorthItChatPickers();
                $("worthItChatEmojiAction")?.focus();
                return;
            }
            if ($("worthItChatGroupManageDialog") && !$("worthItChatGroupManageDialog").hidden) closeWorthItGroupManageDialog();
            else if ($("worthItChatInviteDialog") && !$("worthItChatInviteDialog").hidden) window.dismissWorthItGroupInvite();
            else if ($("worthItChatGroupDialog") && !$("worthItChatGroupDialog").hidden) closeWorthItGroupChatDialog();
            else showChatOverlay(false);
        }
    });
    updateCharacterCount();
    updateGroupSelectionUI();
    updateChatHeaderNotificationButton();
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopWorthItChatTyping();
        else refreshWorthItChatOnForeground();
    });
    window.addEventListener("focus", refreshWorthItChatOnForeground);
    window.addEventListener("pageshow", refreshWorthItChatOnForeground);
}
window.getWorthItChatEnhancementContext = function () {
    const friendId = Number(activeConversationPerson?.worth_it_id);
    const isFriend = activeConversationType === "direct" && Number.isSafeInteger(friendId) && friendId > 0 &&
        chatFriends.some(friend => String(friend.worth_it_id) === String(friendId));
    return {
        userId: chatUser?.id || null,
        conversationId: activeConversationId || (activeConversationType === "global" ? "00000000-0000-4000-8000-000000000001" : null),
        conversationType: activeConversationType,
        friendId: isFriend ? friendId : null,
        isFriend,
        title: activeConversationTitle,
        isOpen: chatOpen
    };
};
window.worthItChatQuoteById = function (messageId) {
    const message = chatMessages.find(item => String(item.id) === String(messageId));
    if (message) quoteWorthItChatMessage(message);
};
window.worthItChatShowSearchResult = function (message) {
    const ctx = window.getWorthItChatEnhancementContext();
    if (!message || !ctx?.userId || String(ctx.conversationId) === "" ) return;
    const existing = chatMessages.find(item => String(item.id) === String(message.id));
    if (!existing) chatMessages = [...chatMessages, message].sort((a, b) => Number(a.id) - Number(b.id));
    renderMessages(false);
    window.setTimeout(() => {
        const row = $("worthItChatMessages")?.querySelector('[data-message-id="' + CSS.escape(String(message.id)) + '"]');
        if (!row) return;
        row.scrollIntoView({behavior: "smooth", block: "center"});
        row.classList.add("is-search-highlight");
        window.setTimeout(() => row.classList.remove("is-search-highlight"), 1800);
    }, 30);
};
window.worthItChatAttachRecordedAudio = function (file, targetContext = null) {
    if (!file || !(file instanceof File) || !String(file.type || "").startsWith("audio/") || !chatUser?.id) return;
    const target = targetContext && typeof targetContext === "object"
        ? targetContext
        : { userId: chatUser.id, conversationId: activeConversationId || WORTH_IT_GLOBAL_CHAT_REALTIME_ID, conversationType: activeConversationType };
    if (String(target.userId || "") !== String(chatUser.id)) return;
    if (target.conversationType === "direct" && !target.isFriend) {
        if (worthItChatDraftKey() === worthItChatDraftKey(target.userId, target.conversationType, target.conversationId)) {
            setStatus("Voice messages in private chat are available only between friends.", true);
        }
        return;
    }
    const targetKey = worthItChatDraftKey(target.userId, target.conversationType, target.conversationId);
    if (!targetKey) return;
    const previewUrl = URL.createObjectURL(file);
    if (targetKey === worthItChatDraftKey()) {
        setPendingMedia(file, previewUrl, "audio");
        return;
    }
    const previous = worthItChatDrafts.get(targetKey) || { text: "", mediaFile: null, mediaUrl: "", mediaType: "", replyQuote: null };
    if (previous.mediaUrl && previous.mediaUrl !== previewUrl) releaseWorthItChatDraftUrl(previous.mediaUrl, targetKey);
    worthItChatDrafts.set(targetKey, { ...previous, mediaFile: file, mediaUrl: previewUrl, mediaType: "audio" });
    setStatus("Your voice message was saved to the conversation where you recorded it. Return to that chat to preview and send it.", false);
};
setupChatUI();
window.addEventListener("worthitnotificationpreferenceschange", event => {
    const next = event?.detail;
    if (next && typeof next === "object" && !Array.isArray(next)) {
        globalNotificationPreferences = Object.assign({ friend_requests: true, follows: true, private_messages: true, group_chats: true, account_activity: true }, next);
        renderFriends(); renderConversations(); updateChatHeaderNotificationButton(); updateUnreadBadge();
    }
});
window.addEventListener("popstate", () => { routeWorthItChatFromLocation(); });

// Use the app's single authoritative initial-session promise. A second getSession()
// race can temporarily report null while the saved session is being restored.
if (window.worthItAuthStateResolved) {
    setAuthState(window.worthItCurrentAuthUser || null);
} else if (window.worthItAuthReady) {
    Promise.resolve(window.worthItAuthReady).then(() => {
        if (!chatAuthResolutionComplete) setAuthState(window.worthItCurrentAuthUser || null);
    }).catch(() => {
        if (!chatAuthResolutionComplete) setAuthState(null);
    });
}
routeWorthItChatFromLocation();
if (sb()?.auth) {
    sb().auth.onAuthStateChange((event, session) => {
        // Ignore a premature empty INITIAL_SESSION event until app.js has completed
        // its authoritative restoration of the persisted session.
        if (event === "INITIAL_SESSION" && !window.worthItAuthStateResolved) return;
        setAuthState(session?.user || null);
    });
}
})();
