/* Worth It Chat: global, friend and group conversations. */
(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const GLOBAL_CHAT_ID = null;
const GLOBAL_TITLE = "Global Chat";
let chatUser = null;
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
let chatTypingActive = false;
let chatOwnProfile = null;
let chatOwnProfileLoadedForUser = null;
let chatOwnProfilePromise = null;
const WORTH_IT_GLOBAL_CHAT_REALTIME_ID = "00000000-0000-4000-8000-000000000001";
const WORTH_IT_CHAT_FULLSCREEN_PREFERENCE_KEY = "worth-it-chat-fullscreen-preference-v1";
let pendingMediaFile = null;
let pendingMediaUrl = "";
let pendingMediaType = "";
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
function showChatOverlay(open, options) {
    const overlay = $("worthItChatOverlay");
    const button = $("worthItChatNavBtn");
    if (!overlay) return;
    const shouldOpen = Boolean(open);
    if (!shouldOpen && chatOpen && !options?.skipRouteSync && isChatRoutePath()) {
        // Closing the chat should not make Back reopen it as a duplicate history entry.
        setChatBrowserPath(chatReturnPath || "/", true);
    }
    chatOpen = shouldOpen;
    overlay.hidden = !chatOpen;
    overlay.setAttribute("aria-hidden", String(!chatOpen));
    button?.setAttribute("aria-expanded", String(chatOpen));
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
    const previousUserId = chatUser?.id || null;
    const nextUserId = user?.id || null;
    if (previousUserId !== nextUserId) {
        stopWorthItChatRealtimeChannel();
        chatOwnProfile = null;
        chatOwnProfileLoadedForUser = null;
        chatOwnProfilePromise = null;
    }
    chatUser = user || null;
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
        if (parseWorthItChatRoute()) routeWorthItChatFromLocation();
        else refreshWorthItChatData();
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
    await refreshWorthItChatData();
    if (chatUser) await loadWorthItChatMessages(false, true);
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
function quoteWorthItChatMessage(message) {
    const input = $("worthItChatInput");
    if (!input) return;
    const author = String(message.display_name || message.username || "Worth It member").replace(/[\r\n]/g, " ");
    const raw = String(message.body || (message.media_type ? "[Shared " + message.media_type + "]" : ""));
    if (!raw) {
        setStatus("This message has no text to quote.", true);
        return;
    }
    const compact = raw.replace(/\s+/g, " ").trim();
    const quote = "> " + author + ": " + compact.slice(0, 160) + (compact.length > 160 ? "…" : "") + "\n\n";
    const joined = (input.value ? input.value.replace(/\s+$/, "") + "\n\n" : "") + quote;
    if (joined.length > 500) {
        setStatus("There is not enough room to quote this message. Shorten your draft first.", true);
        return;
    }
    input.value = joined;
    input.dispatchEvent(new Event("input", {bubbles:true}));
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
    updateCharacterCount();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    setStatus("Quote added to your draft. You can edit it before sending.", false);
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
        if (action === "delete" && message.media_url) {
            const objectPath = getOwnedWorthItChatMediaObjectPath(message.media_url, chatUser.id, sb());
            if (!objectPath) {
                // Don't delete an object unless it is verified to belong to this user,
                // but make the remaining public URL risk visible to the sender.
                attachmentCleanupFailed = true;
            } else {
                try {
                    const {error: storageError} = await sb().storage.from("worth-it-chat-media").remove([objectPath]);
                    if (storageError) attachmentCleanupFailed = true;
                } catch (_) {
                    attachmentCleanupFailed = true;
                }
            }
        }
        await refreshWorthItChatData();
        await loadWorthItChatMessages(false, true);
        if (attachmentCleanupFailed) {
            setStatus("Message deleted, but its uploaded attachment could not be removed from storage. The chat message is hidden; the file may still be accessible by its direct URL.", true);
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

function createWorthItChatMessageRow(message) {
    const mine = message.sender_user_id === chatUser.id;
    const signature = chatMessageRenderSignature(message);
    const row = document.createElement("article");
    row.className = "worth-it-chat-message" + (mine ? " is-mine" : "");
    row.dataset.messageId = String(message.id ?? "");
    row.dataset.worthItMessageSignature = signature;
    row.appendChild(makeChatProfileLink(message, "worth-it-chat-message-avatar-link", makeAvatar(message)));
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
        if (message.body) renderLinkedText(bubble, message.body);
        if (message.media_url && ["image", "gif", "video"].includes(message.media_type)) {
            if (message.media_type === "video") {
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

function renderMessages(scrollToBottom) {
    const host = $("worthItChatMessages");
    if (!host) return;
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
    activeConversationId = id || null;
    activeConversationType = type || "global";
    chatRouteAccessDenied = false;
    activeConversationTitle = title || GLOBAL_TITLE;
    activeConversationPerson = person || null;
    activeConversationInviteToken = String(inviteToken || chatConversations.find(item => item.id === activeConversationId)?.invite_token || "");
    syncChatUrlForConversation(activeConversationType, activeConversationId, activeConversationPerson, activeConversationInviteToken);
    if (window.matchMedia("(max-width: 540px)").matches) $("worthItChatWindow")?.classList.remove("is-mobile-sidebar");
    document.querySelectorAll(".worth-it-chat-side-item").forEach(node => node.classList.toggle("is-active", node.id === "worthItGlobalChatBtn" && activeConversationType === "global"));
    renderFriends(); renderConversations();
    const subtitle = activeConversationType === "global" ? "A shared space for the Worth It community" : activeConversationType === "group" ? "Group conversation · " + (chatConversations.find(c => c.id === id)?.members?.length || 2) + " members" : (window.getWorthItPresenceInfo ? window.getWorthItPresenceInfo(activeConversationPerson).label : "Private conversation with your friend");
    setHeader(activeConversationTitle, subtitle, activeConversationPerson);
    updateChatHeaderNotificationButton();
    updateChatHeaderShareButton();
    setStatus("", false);
    chatMessages = [];
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
                const name = String(entry.display_name || entry.username || "A member").trim().slice(0, 80);
                people.set(String(entry.user_id), name || "A member");
            }
        });
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
async function publishWorthItChatTyping(typing, channel = chatRealtimeChannel) {
    const user = chatUser;
    if (!channel || !user || !chatRealtimeSubscribed) return;
    if (typing && (activeConversationType === "global" || !chatOpen || channel !== chatRealtimeChannel)) return;
    const profile = chatOwnProfile;
    if (!chatUser || chatUser.id !== user.id || !chatRealtimeSubscribed || channel !== chatRealtimeChannel) return;
    if (typing && activeConversationType === "global") return;

    // Publish immediately using session metadata. The profile RPC can be slow on
    // a cold session, so enrich the displayed identity in the background instead
    // of delaying the first typing event until that request finishes.
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
    chatTypingStopTimer = null;
    const wasTyping = chatTypingActive;
    chatTypingActive = false;
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
        void publishWorthItChatTyping(true, chatRealtimeChannel);
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
                if (chatTypingActive) void publishWorthItChatTyping(true, channel);
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
    setChatBrowserPath("/chat", false);
    showChatOverlay(true, {skipRouteSync:true});
    setWorthItChatFullscreen(false);
    await routeWorthItChatFromLocation();
    $("worthItChatInput")?.focus();
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
function setPendingMedia(file, url, type) {
    if (pendingMediaObjectUrl) {
        URL.revokeObjectURL(pendingMediaObjectUrl);
        pendingMediaObjectUrl = "";
    }
    pendingMediaFile = file || null;
    pendingMediaUrl = url || "";
    pendingMediaType = type || "";
    const host = $("worthItChatAttachmentPreview");
    if (!host) return;
    host.replaceChildren();
    host.hidden = !pendingMediaFile;
    if (!pendingMediaFile) return;
    if (pendingMediaUrl.startsWith("blob:")) pendingMediaObjectUrl = pendingMediaUrl;
    let preview;
    if (type === "video") {
        preview = document.createElement("video");
        preview.src = pendingMediaUrl;
        preview.muted = true;
        preview.playsInline = true;
        preview.controls = true;
        preview.className = "worth-it-chat-video-preview";
    } else {
        preview = document.createElement("img");
        preview.src = pendingMediaUrl;
        preview.alt = "Attachment preview";
        preview.className = "worth-it-chat-image-preview";
    }
    const name = document.createElement("span"); name.textContent = pendingMediaFile.name;
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove attachment");
    remove.addEventListener("click", () => setPendingMedia(null, "", ""));
    host.append(preview, name, remove);
}
async function validateChatMediaSignature(file, expectedMime) {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const starts = (...bytes) => bytes.every((byte, index) => header[index] === byte);
    let actualMime = "";
    if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) actualMime = "image/png";
    else if (starts(0xff, 0xd8, 0xff)) actualMime = "image/jpeg";
    else if (starts(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || starts(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)) actualMime = "image/gif";
    else if (header.length >= 12 && starts(0x52, 0x49, 0x46, 0x46) && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) actualMime = "image/webp";
    else if (header.length >= 12 && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) actualMime = "video/mp4";
    else if (starts(0x1a, 0x45, 0xdf, 0xa3)) actualMime = "video/webm";
    if (!actualMime || actualMime !== expectedMime) {
        throw new Error("The file contents do not match the selected media type.");
    }
    return actualMime;
}
async function uploadPendingMedia() {
    if (!pendingMediaFile) return {url:"",type:""};
    const file = pendingMediaFile;
    if (!file.size) throw new Error("This media file is empty.");
    const allowed = {"image/png":"image","image/jpeg":"image","image/webp":"image","image/gif":"gif","video/mp4":"video","video/webm":"video"};
    const type = allowed[file.type];
    if (!type) throw new Error("Choose a PNG, JPG, WEBP, GIF, MP4 or WebM file.");
    const maxBytes = type === "gif" ? 20 * 1024 * 1024 : type === "video" ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error(type === "gif" ? "GIFs must be 20 MB or smaller." : type === "video" ? "Videos must be 50 MB or smaller." : "Images must be 15 MB or smaller.");
    await validateChatMediaSignature(file, file.type);
    const client = sb();
    if (!client || !chatUser?.id) throw new Error("Sign in again before uploading media.");
    const sessionResult = await client.auth.getSession();
    const token = sessionResult?.data?.session?.access_token || "";
    const sessionUserId = sessionResult?.data?.session?.user?.id || "";
    if (sessionResult?.error || !token || sessionUserId !== chatUser.id) {
        throw new Error("Your session has expired. Sign in again before uploading media.");
    }
    const form = new FormData();
    form.append("file", file, file.name || (type === "gif" ? "image.gif" : "image"));
    const response = await fetch("/api/chat-media", {
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
    const input = $("worthItChatInput");
    const body = String(input?.value || "");
    if (body.length > 500) { setStatus("Messages are limited to 500 characters.", true); return; }
    if (!body.trim() && !pendingMediaFile) { setStatus("Write a message or attach an image, GIF or video first.", true); return; }
    const remaining = 2000 - (Date.now() - chatLastSentAt);
    if (remaining > 0) { setStatus("Please wait " + (remaining / 1000).toFixed(1) + " seconds before sending another message.", true); return; }
    chatSending = true;
    const button = $("worthItChatSendBtn");
    if (button) { button.disabled = true; button.textContent = "Sending…"; }
    setStatus("", false);
    try {
        let media = {url:"",type:""};
        if (pendingMediaFile) {
            setStatus(pendingMediaType === "video" ? "Uploading video…" : "Uploading media…", false);
            media = await uploadPendingMedia();
        }
        const result = await sb().rpc("send_worth_it_chat_message", {
            p_body: body,
            p_conversation_id: activeConversationId,
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
        if (input) { input.value = ""; input.style.height = "auto"; }
        stopWorthItChatTyping();
        setPendingMedia(null, "", "");
        updateCharacterCount();
        await loadWorthItChatMessages(true, true);
        await refreshWorthItChatData();
        setStatus(result.data.filtered ? "Your message was sent with filtered content. Read the red note below it to see why." : "", false);
    } catch (error) {
        setStatus(error?.message || "Message could not be sent.", true);
    } finally {
        chatSending = false;
        if (button) { button.disabled = false; button.innerHTML = 'Send <span>➤</span>'; }
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
        await refreshWorthItChatData();
        if (routeVersion !== chatRouteVersion) return;
        if (previous.type === "global") {
            await activateConversation(null, "global", GLOBAL_TITLE, null);
            return;
        }
        if (previous.type === "direct") {
            const person = chatFriends.find(item => Number(item.worth_it_id) === Number(previous.person?.worth_it_id));
            if (person) await activateConversation(null, "direct", person.display_name || person.username || previous.title, person);
            else { await activateConversation(null, "global", GLOBAL_TITLE, null); }
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
        renderMessages();
        return;
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
    { id: "food", label: "Food", icon: "🍕" },
    { id: "activities", label: "Activities", icon: "⚽" },
    { id: "travel", label: "Travel", icon: "🚀" },
    { id: "objects", label: "Objects", icon: "💡" },
    { id: "symbols", label: "Symbols", icon: "❤️" },
    { id: "flags", label: "Flags", icon: "🏳️" }
];

const WORTH_IT_CHAT_EMOJI_OPTIONS = [];
let worthItChatEmojiCategory = "faces";
let worthItChatGifCategory = "all";
let worthItChatGifSearchSequence = 0;

function closeWorthItChatPickers() {
    const menu = $("worthItChatPlusMenu");
    const emojiPicker = $("worthItChatEmojiPicker");
    const gifPicker = $("worthItChatGifPicker");
    const plus = $("worthItChatPlusBtn");
    if (menu) menu.hidden = true;
    if (emojiPicker) emojiPicker.hidden = true;
    if (gifPicker) gifPicker.hidden = true;
    if (plus) plus.setAttribute("aria-expanded", "false");
}

function openWorthItChatPlusMenu() {
    const menu = $("worthItChatPlusMenu");
    const plus = $("worthItChatPlusBtn");
    if (!menu || !plus) return;
    const shouldOpen = menu.hidden;
    closeWorthItChatPickers();
    menu.hidden = !shouldOpen;
    plus.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
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
    "🦄": "unicorn fantasy", "🐸": "frog animal", "🌸": "cherry blossom flower",
    "🍀": "four leaf clover luck", "🇷🇸": "Serbia flag", "🇺🇸": "United States America flag",
    "🇬🇧": "United Kingdom Britain flag", "🇯🇵": "Japan flag", "🇪🇺": "European Union flag", "🏳️‍🌈": "rainbow pride LGBTQ LGBT flag", "🏳️‍⚧️": "transgender trans pride flag", "🏴": "black flag", "🏳️": "white flag", "🏁": "checkered racing flag", "🚩": "red triangular flag", "🇨🇦": "Canada flag", "🇦🇺": "Australia flag", "🇳🇿": "New Zealand flag", "🇭🇷": "Croatia flag", "🇧🇦": "Bosnia Herzegovina flag", "🇲🇪": "Montenegro flag", "🇲🇰": "North Macedonia flag", "🇦🇱": "Albania flag", "🇸🇮": "Slovenia flag", "🇩🇪": "Germany flag", "🇫🇷": "France flag", "🇮🇹": "Italy flag", "🇪🇸": "Spain flag", "🇵🇹": "Portugal flag", "🇧🇷": "Brazil flag", "🇮🇳": "India flag", "🇿🇦": "South Africa flag", "🇲🇽": "Mexico flag", "🇨🇳": "China flag", "🇰🇷": "South Korea flag"
};

function addWorthItChatEmojiGroup(category, symbols) {
    const categoryLabel = WORTH_IT_CHAT_EMOJI_CATEGORIES.find(item => item.id === category)?.label || category;
    for (const emoji of String(symbols || "").trim().split(/\s+/).filter(Boolean)) {
        WORTH_IT_CHAT_EMOJI_OPTIONS.push({
            emoji,
            category,
            keywords: ((WORTH_IT_CHAT_EMOJI_KEYWORDS[emoji] || "") + " " + categoryLabel).toLowerCase()
        });
    }
}

addWorthItChatEmojiGroup("faces", "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 😝 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🫡 🤫 🫠 🫥 😶 🫤 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵‍💫 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 💀 ☠️ 👻 👽 🤖 💩 👹 👺 💋 💌");
addWorthItChatEmojiGroup("people", "👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦 👶 🧒 👦 👧 🧑 👨 👩 🧔 🧑‍🦰 🧑‍🦱 🧑‍🦳 🧑‍🦲 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 💃 🕺 🧘 🛀 🛌 🧍 🧎 🚶 🏃 🧑‍💻 🧑‍🎨 🧑‍🍳 🧑‍🚀 🧑‍🔬 🧑‍🏫 🧑‍⚕️ 🧑‍🚒 🧑‍✈️ 🧑‍🌾");
addWorthItChatEmojiGroup("animals", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🕷️ 🕸️ 🦂 🦟 🦗 🪳 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🦈 🐊 🦭 🦦 🦥 🦫 🦡 🐘 🦣 🦏 🦛 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🦮 🐩 🐈 🐈‍⬛ 🪶 🐓 🦃 🦤 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦔 🐿️ 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍁 🍂 🍃 🌾 🪴 🌵 🌹 🥀 🌺 🌻 🌼 🌷");
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
    textarea.focus();
    closeWorthItChatPickers();
}

const WORTH_IT_CHAT_GIF_LIBRARY = [
    { id: "laughing-smile", title: "Laughing smile", keywords: "laughing laugh funny smile joy", type: "gif", offset: 0, length: 684 },
    { id: "party-confetti", title: "Party confetti", keywords: "party celebration celebrate birthday fun", type: "gif", offset: 684, length: 619 },
    { id: "rocket-launch", title: "Rocket launch", keywords: "rocket launch space go success", type: "gif", offset: 1303, length: 570 },
    { id: "sparkle-burst", title: "Sparkle burst", keywords: "sparkle magic shine glitter star", type: "sticker", offset: 1873, length: 638 },
    { id: "heart-pulse", title: "Heart pulse", keywords: "heart love affection romance like", type: "sticker", offset: 2511, length: 643 },
    { id: "cat-blink", title: "Cat blink", keywords: "cat kitten animal cute pet", type: "sticker", offset: 3154, length: 619 }
];
const WORTH_IT_CHAT_GIF_BUNDLE_PATH = "/assets/worth-it-chat-gifs/library.base64.txt";
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
                cache: "force-cache",
                headers: { "Accept": "text/plain" }
            });
            if (!response.ok) throw new Error("The Worth It animation library could not be loaded.");
            const encoded = (await response.text()).replace(/\s+/g, "");
            if (!encoded || encoded.length > 1024 * 1024) {
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
    let previewUrl = worthItChatGifObjectUrls.get(item.id);
    if (!previewUrl) {
        previewUrl = URL.createObjectURL(blob);
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
        }).catch(() => {
            if (button.isConnected) {
                image.alt = item.title + " preview unavailable";
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
    try {
        const asset = await getWorthItChatGifAsset(item);
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
    closeWorthItChatPickers();
    const panel = $("worthItChatEmojiPicker");
    if (!panel) return;
    panel.hidden = false;
    renderWorthItChatEmojiCategories();
    renderWorthItChatEmojiGrid($("worthItChatEmojiSearch")?.value || "");
    $("worthItChatEmojiSearch")?.focus();
}

function openWorthItChatGifPicker() {
    closeWorthItChatPickers();
    const panel = $("worthItChatGifPicker");
    if (!panel) return;
    panel.hidden = false;
    worthItChatGifCategory = "all";
    const search = $("worthItChatGifSearch");
    if (search) search.value = "";
    renderWorthItChatGifCategories();
    loadWorthItChatGifResults("");
}

function setupChatUI() {
    $("worthItChatInput")?.addEventListener("input", function () {
        updateCharacterCount();
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 140) + "px";
        renderWorthItChatComposerPreview();
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
    $("worthItChatInput")?.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault(); sendWorthItChatMessage();
        }
    });

    $("worthItChatPlusBtn")?.addEventListener("click", event => {
        event.preventDefault();
        openWorthItChatPlusMenu();
    });
    $("worthItChatUploadAction")?.addEventListener("click", () => {
        closeWorthItChatPickers();
        $("worthItChatFileInput")?.click();
    });
    $("worthItChatEmojiAction")?.addEventListener("click", openWorthItChatEmojiPicker);
    $("worthItChatGifAction")?.addEventListener("click", openWorthItChatGifPicker);
    $("worthItChatEmojiClose")?.addEventListener("click", closeWorthItChatPickers);
    $("worthItChatGifClose")?.addEventListener("click", closeWorthItChatPickers);
    $("worthItChatEmojiSearch")?.addEventListener("input", event => renderWorthItChatEmojiGrid(event.currentTarget.value));
    $("worthItChatGifSearchForm")?.addEventListener("submit", event => {
        event.preventDefault();
        loadWorthItChatGifResults($("worthItChatGifSearch")?.value || "");
    });
    $("worthItChatGifSearch")?.addEventListener("input", event => {
        loadWorthItChatGifResults(event.currentTarget.value);
    });
    document.addEventListener("click", event => {
        const dock = $("worthItChatPickerDock");
        const emojiPicker = $("worthItChatEmojiPicker");
        const gifPicker = $("worthItChatGifPicker");
        const eventPath = typeof event.composedPath === "function" ? event.composedPath() : [];
        const wasInside = node => Boolean(node && (node.contains(event.target) || eventPath.includes(node)));
        if (!wasInside(dock) && !wasInside(emojiPicker) && !wasInside(gifPicker)) closeWorthItChatPickers();
    });
    $("worthItChatFileInput")?.addEventListener("change", function () {
        const file = this.files?.[0];
        this.value = "";
        if (!file) return;
        const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"];
        if (!allowed.includes(file.type)) {
            setPendingMedia(null, "", "");
            setStatus("Choose a PNG, JPG, WEBP, GIF, MP4 or WebM file.", true);
            return;
        }
        const isGif = file.type === "image/gif";
        const isVideo = file.type.startsWith("video/");
        const maxBytes = isGif ? 20 * 1024 * 1024 : isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
        const maxLabel = isGif ? "20 MB" : isVideo ? "50 MB" : "15 MB";
        if (!file.size || file.size > maxBytes) {
            setPendingMedia(null, "", "");
            setStatus("Choose a non-empty " + (isGif ? "GIF" : isVideo ? "video" : "image") + " that is " + maxLabel + " or smaller.", true);
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setPendingMedia(file, objectUrl, isGif ? "gif" : isVideo ? "video" : "image");
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
            const emojiPicker = $("worthItChatEmojiPicker");
            const gifPicker = $("worthItChatGifPicker");
            const plusMenu = $("worthItChatPlusMenu");
            if ((emojiPicker && !emojiPicker.hidden) || (gifPicker && !gifPicker.hidden) || (plusMenu && !plusMenu.hidden)) {
                closeWorthItChatPickers();
                $("worthItChatPlusBtn")?.focus();
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
    });
}
setupChatUI();
window.addEventListener("worthitnotificationpreferenceschange", event => {
    const next = event?.detail;
    if (next && typeof next === "object" && !Array.isArray(next)) {
        globalNotificationPreferences = Object.assign({ friend_requests: true, follows: true, private_messages: true, group_chats: true, account_activity: true }, next);
        renderFriends(); renderConversations(); updateChatHeaderNotificationButton(); updateUnreadBadge();
    }
});
window.addEventListener("popstate", () => { routeWorthItChatFromLocation(); });
routeWorthItChatFromLocation();
if (sb()?.auth) {
    sb().auth.getSession().then(({data}) => setAuthState(data?.session?.user || null)).catch(() => setAuthState(null));
    sb().auth.onAuthStateChange((_event, session) => setAuthState(session?.user || null));
}
})();
