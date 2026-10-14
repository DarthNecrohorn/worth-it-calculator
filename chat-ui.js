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
let chatRouteVersion = 0;
let chatRouteAccessDenied = false;
let chatMessages = [];
let chatOpen = false;
let chatLoading = false;
let chatSending = false;
let chatLastSentAt = 0;
let chatCooldownTimer = null;
let chatStatusTimer = null;
let chatPollTimer = null;
let chatRefreshToken = 0;
let pendingMediaFile = null;
let pendingMediaUrl = "";
let pendingMediaType = "";
let chatNotificationPreferences = Object.create(null);
let chatNotificationPreferencesLoadedForUser = null;
const selectedGroupFriendIds = new Set();
let groupCreateInProgress = false;
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
        closeWorthItGroupChatDialog();
        closeWorthItGroupInviteDialog();
        if (chatPollTimer) window.clearInterval(chatPollTimer);
        chatPollTimer = null;
    }
}
function setAuthState(user) {
    const previousUserId = chatUser?.id || null;
    chatUser = user || null;
    if (!chatUser || previousUserId !== chatUser.id) {
        chatNotificationPreferences = Object.create(null);
        chatNotificationPreferencesLoadedForUser = null;
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
    $("worthItChatTitle").textContent = title || GLOBAL_TITLE;
    $("worthItChatSubtitle").textContent = subtitle || "";
    const host = $("worthItChatHeaderAvatar");
    if (!host) return;
    host.replaceChildren();
    if (person?.avatar_url) {
        const img = document.createElement("img");
        img.src = String(person.avatar_url);
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        img.onerror = () => { img.remove(); host.insertBefore(document.createTextNode(initials(person)), host.querySelector(".worth-it-presence-indicator")); };
        host.appendChild(img);
    } else host.textContent = activeConversationType === "global" ? "🌐" : (activeConversationType === "group" ? "👥" : initials(person || {display_name:title}));
    if (activeConversationType === "direct" && typeof window.renderWorthItPresenceIndicator === "function") window.renderWorthItPresenceIndicator(host, person);
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
    if (/get_worth_it_chat|open_worth_it_friend_chat|send_worth_it_chat_message|worth_it_chat_/i.test(message) && /does not exist|schema cache|could not find/i.test(message)) {
        return "Chat setup is not complete. Run supabase/worth-it-chat.sql in Supabase, then refresh.";
    }
    return message || "Something went wrong. Please try again.";
}
function renderFriends() {
    const host = $("worthItChatFriends");
    if (!host) return;
    host.replaceChildren();
    if (!chatUser) {
        const p = document.createElement("p"); p.className = "worth-it-chat-muted"; p.textContent = "Sign in to see your friends."; host.appendChild(p); return;
    }
    if (!chatFriends.length) {
        const p = document.createElement("p"); p.className = "worth-it-chat-muted"; p.textContent = "Your friends will appear here. Add friends from their profiles."; host.appendChild(p); return;
    }
    chatFriends.forEach(friend => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "worth-it-chat-person-btn" + (activeConversationType === "direct" && String(activeConversationPerson?.worth_it_id) === String(friend.worth_it_id) ? " is-active" : "");
        row.title = "Chat with " + (friend.display_name || friend.username || "friend");
        row.appendChild(makeAvatar(friend));
        const info = document.createElement("span"); info.className = "worth-it-chat-person-info";
        const name = document.createElement("strong"); name.textContent = friend.display_name || friend.username || "Worth It member";
        const username = document.createElement("small"); username.textContent = friend.username ? "@" + friend.username : "Friend";
        const presence = document.createElement("small"); presence.className = "worth-it-chat-person-presence"; presence.dataset.worthItPresenceId = String(friend.worth_it_id); presence.textContent = window.getWorthItPresenceInfo ? window.getWorthItPresenceInfo(friend).label : "";
        info.append(name, username, presence); row.appendChild(info);

        const directConversation = chatConversations.find(conversation =>
            conversation.type === "direct" &&
            Array.isArray(conversation.members) &&
            conversation.members.some(member => String(member.worth_it_id) === String(friend.worth_it_id))
        );
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
        host.appendChild(row);
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
    host.replaceChildren();
    if (!chatUser) return;
    // Keep this list focused on group conversations; direct chats are opened from Your Friends.
    const visibleConversations = chatConversations.filter(conversation => conversation.type === "group");
    if (!visibleConversations.length) {
        const p = document.createElement("p"); p.className = "worth-it-chat-muted"; p.textContent = "Your group chats will appear here."; host.appendChild(p); return;
    }
    visibleConversations.forEach(conversation => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "worth-it-chat-person-btn" + (activeConversationId === conversation.id ? " is-active" : "");
        const icon = document.createElement("span"); icon.className = "worth-it-chat-person-avatar"; icon.textContent = "👥"; row.appendChild(icon);
        const info = document.createElement("span"); info.className = "worth-it-chat-person-info";
        const name = document.createElement("strong"); name.textContent = conversationLabel(conversation);
        const last = document.createElement("small");
        last.textContent = conversation.last_message?.body || (conversation.last_message?.media_type ? "📷 Media" : "Start a conversation");
        info.append(name, last); row.appendChild(info);
        const notificationKey = chatNotificationKeyForConversation(conversation);
        const unread = chatNotificationsEnabled(notificationKey) ? Number(conversation.unread_count || 0) : 0;
        if (unread > 0) { const count = document.createElement("span"); count.className = "worth-it-chat-person-count"; count.textContent = unread > 99 ? "99+" : String(unread); row.appendChild(count); }
        row.addEventListener("click", () => openWorthItSavedConversation(conversation));
        host.appendChild(row);
    });
}
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
function chatNotificationsEnabled(chatKey) {
    return !chatKey || chatNotificationPreferences[chatKey] !== false;
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
    const enabled = chatNotificationsEnabled(chatKey);
    const labelText = enabled ? "Turn off notifications" : "Turn on notifications";
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
    const requests = [
        client.rpc("get_worth_it_chat_friends"),
        client.rpc("get_worth_it_chat_conversations")
    ];
    if (shouldLoadNotificationPreferences) requests.push(client.rpc("get_worth_it_chat_notification_preferences"));
    const results = await Promise.allSettled(requests);
    if (token !== chatRefreshToken || chatUser?.id !== userId) return;
    const friendsResult = results[0];
    const chatsResult = results[1];
    const notificationPrefsResult = shouldLoadNotificationPreferences ? results[2] : null;
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
    if (activeConversationType === "direct" && activeConversationPerson?.worth_it_id) { const freshPerson = chatFriends.find(item => String(item.worth_it_id) === String(activeConversationPerson.worth_it_id)); if (freshPerson) { activeConversationPerson = {...activeConversationPerson, ...freshPerson}; setHeader(activeConversationTitle, (window.getWorthItPresenceInfo ? window.getWorthItPresenceInfo(activeConversationPerson).label : "Private conversation with your friend"), activeConversationPerson); } }
    renderFriends(); renderConversations(); updateChatHeaderNotificationButton(); updateUnreadBadge();
    if ($("worthItChatGroupDialog") && !$("worthItChatGroupDialog").hidden) renderGroupFriendChoices();
}
function renderLinkedText(host, value) {
    const text = escapeText(value);
    const regex = /https?:\/\/[^\s<>"']+/gi;
    let last = 0, match;
    while ((match = regex.exec(text))) {
        if (match.index > last) host.appendChild(document.createTextNode(text.slice(last, match.index)));
        let urlText = match[0];
        let trailing = "";
        while (/[),.!?;:]$/.test(urlText)) { trailing = urlText.slice(-1) + trailing; urlText = urlText.slice(0, -1); }
        try {
            const url = new URL(urlText);
            if (url.protocol === "http:" || url.protocol === "https:") {
                const a = document.createElement("a"); a.className = "worth-it-chat-link"; a.href = url.href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = urlText; host.appendChild(a);
            } else host.appendChild(document.createTextNode(urlText));
        } catch (_) { host.appendChild(document.createTextNode(urlText)); }
        if (trailing) host.appendChild(document.createTextNode(trailing));
        last = regex.lastIndex;
    }
    if (last < text.length) host.appendChild(document.createTextNode(text.slice(last)));
}
function renderMessages(scrollToBottom) {
    const host = $("worthItChatMessages");
    if (!host) return;
    host.replaceChildren();
    if (!chatUser) {
        const empty = document.createElement("div"); empty.className = "worth-it-chat-empty";
        const icon = document.createElement("span"); icon.textContent = "✦";
        const title = document.createElement("strong"); title.textContent = "Sign in to use chat";
        const p = document.createElement("p"); p.textContent = "Messages, friend chats and Global Chat are available to Worth It members.";
        const signIn = document.createElement("button");
        signIn.type = "button";
        signIn.className = "worth-it-chat-signin-btn";
        signIn.textContent = "Sign in / Create account";
        signIn.addEventListener("click", () => { if (typeof window.handleAuthButton === "function") window.handleAuthButton(); });
        empty.append(icon,title,p,signIn); host.appendChild(empty); return;
    }
    if (!chatMessages.length) {
        const empty = document.createElement("div"); empty.className = "worth-it-chat-empty";
        const icon = document.createElement("span"); icon.textContent = activeConversationType === "global" ? "🌐" : "✦";
        const title = document.createElement("strong"); title.textContent = activeConversationType === "global" ? "Say hello to the community" : "Start the conversation";
        const p = document.createElement("p"); p.textContent = activeConversationType === "global" ? "Be welcoming, keep it respectful, and enjoy the chat." : "Send the first message to get things going.";
        empty.append(icon,title,p); host.appendChild(empty); return;
    }
    chatMessages.forEach(message => {
        const mine = message.sender_user_id === chatUser.id;
        const row = document.createElement("article");
        row.className = "worth-it-chat-message" + (mine ? " is-mine" : "");
        row.appendChild(makeAvatar(message));
        const stack = document.createElement("div"); stack.className = "worth-it-chat-message-stack";
        if (!mine && activeConversationType !== "direct") {
            const name = document.createElement("span"); name.className = "worth-it-chat-message-name"; name.textContent = message.display_name || message.username || "Worth It member"; stack.appendChild(name);
        }
        const bubble = document.createElement("div"); bubble.className = "worth-it-chat-bubble";
        if (message.body) renderLinkedText(bubble, message.body);
        if (message.media_url && (message.media_type === "image" || message.media_type === "gif")) {
            const img = document.createElement("img"); img.className = "worth-it-chat-media"; img.src = message.media_url; img.alt = message.media_type === "gif" ? "Shared GIF" : "Shared image"; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
            img.addEventListener("error", () => { const fallback = document.createElement("a"); fallback.className = "worth-it-chat-link"; fallback.href = message.media_url; fallback.target = "_blank"; fallback.rel = "noopener noreferrer"; fallback.textContent = "Open attached media"; img.replaceWith(fallback); });
            bubble.appendChild(img);
        }
        stack.appendChild(bubble);
        if (message.filtered_reason) {
            const reason = document.createElement("p"); reason.className = "worth-it-chat-filter-reason"; reason.textContent = "Filtered: " + message.filtered_reason; stack.appendChild(reason);
        }
        const time = document.createElement("time"); time.className = "worth-it-chat-message-time"; time.dateTime = escapeText(message.created_at); time.textContent = niceDay(message.created_at) + " · " + niceTime(message.created_at); stack.appendChild(time);
        if (mine && activeConversationType === "direct") { const receipt = document.createElement("span"); receipt.className = "worth-it-chat-message-receipt " + (message.is_seen ? "is-seen" : "is-sent"); receipt.textContent = message.is_seen ? "✓✓ Seen" : "✓ Sent"; receipt.title = message.is_seen ? "Your friend has seen this message" : "Sent · waiting to be seen"; stack.appendChild(receipt); }
        row.appendChild(stack); host.appendChild(row);
    });
    if (scrollToBottom) host.scrollTop = host.scrollHeight;
}
async function loadWorthItChatMessages(scrollToBottom) {
    const client = sb();
    if (!client || !chatUser || chatLoading || chatRouteAccessDenied) return;
    chatLoading = true;
    const conversationId = activeConversationId;
    const conversationType = activeConversationType;
    const result = await client.rpc("get_worth_it_chat_messages", {
        p_conversation_id: conversationId,
        p_limit: 100
    });
    chatLoading = false;
    if (chatRouteAccessDenied) return;
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
    await loadWorthItChatMessages(true);
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
function startWorthItChatPolling() {
    if (!chatUser) return;
    if (chatPollTimer) window.clearInterval(chatPollTimer);
    chatPollTimer = window.setInterval(() => {
        if (chatOpen && chatUser) {
            loadWorthItChatMessages(false);
            refreshWorthItChatData();
        }
    }, 5000);
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
function setPendingMedia(file, url, type) {
    pendingMediaFile = file || null;
    pendingMediaUrl = url || "";
    pendingMediaType = type || "";
    const host = $("worthItChatAttachmentPreview");
    if (!host) return;
    host.replaceChildren();
    host.hidden = !pendingMediaFile;
    if (!pendingMediaFile) return;
    const img = document.createElement("img");
    img.src = pendingMediaUrl;
    img.alt = "Attachment preview";
    const name = document.createElement("span"); name.textContent = pendingMediaFile.name;
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove attachment");
    remove.addEventListener("click", () => setPendingMedia(null, "", ""));
    host.append(img, name, remove);
}
async function uploadPendingMedia() {
    if (!pendingMediaFile) return {url:"",type:""};
    const file = pendingMediaFile;
    if (file.size > 8 * 1024 * 1024) throw new Error("Images and GIFs must be 8 MB or smaller.");
    const allowed = {"image/png":"image","image/jpeg":"image","image/webp":"image","image/gif":"gif"};
    const type = allowed[file.type];
    if (!type) throw new Error("Choose a PNG, JPG, WEBP or GIF image.");
    const client = sb();
    const extension = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g,"") || "png";
    const path = chatUser.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2,9) + "." + extension;
    const result = await client.storage.from("worth-it-chat-media").upload(path, file, {contentType:file.type, upsert:false, cacheControl:"3600"});
    if (result.error) throw new Error(result.error.message || "Could not upload this image.");
    const publicResult = client.storage.from("worth-it-chat-media").getPublicUrl(result.data.path);
    return {url:publicResult.data?.publicUrl || "",type};
}
async function sendWorthItChatMessage() {
    if (!chatUser || chatSending) return;
    const input = $("worthItChatInput");
    const body = String(input?.value || "");
    if (body.length > 500) { setStatus("Messages are limited to 500 characters.", true); return; }
    if (!body.trim() && !pendingMediaFile) { setStatus("Write a message or attach an image/GIF first.", true); return; }
    const remaining = 2000 - (Date.now() - chatLastSentAt);
    if (remaining > 0) { setStatus("Please wait " + (remaining / 1000).toFixed(1) + " seconds before sending another message.", true); return; }
    chatSending = true;
    const button = $("worthItChatSendBtn");
    if (button) { button.disabled = true; button.textContent = "Sending…"; }
    setStatus("", false);
    try {
        let media = {url:"",type:""};
        if (pendingMediaFile) {
            setStatus("Uploading image…", false);
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
        setPendingMedia(null, "", "");
        updateCharacterCount();
        await loadWorthItChatMessages(true);
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
    const route = parseWorthItChatRoute();
    const routeVersion = ++chatRouteVersion;
    if (!route) {
        closeWorthItGroupInviteDialog();
        if (chatOpen) showChatOverlay(false, {skipRouteSync:true});
        return;
    }
    if (!chatReturnPath || isChatRoutePath(chatReturnPath)) chatReturnPath = "/";
    showChatOverlay(true, {skipRouteSync:true});
    if (route.type === "invalid") {
        closeWorthItGroupInviteDialog();
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
function setupChatUI() {
    $("worthItChatInput")?.addEventListener("input", function () {
        updateCharacterCount();
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 140) + "px";
    });
    $("worthItChatInput")?.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault(); sendWorthItChatMessage();
        }
    });
    $("worthItChatFileInput")?.addEventListener("change", function () {
        const file = this.files?.[0];
        this.value = "";
        if (!file) return;
        const objectUrl = URL.createObjectURL(file);
        setPendingMedia(file, objectUrl, file.type === "image/gif" ? "gif" : "image");
        setStatus("",false);
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
        if (event.target === this) showChatOverlay(false);
    });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && chatOpen) {
            if ($("worthItChatInviteDialog") && !$("worthItChatInviteDialog").hidden) window.dismissWorthItGroupInvite();
            else if ($("worthItChatGroupDialog") && !$("worthItChatGroupDialog").hidden) closeWorthItGroupChatDialog();
            else showChatOverlay(false);
        }
    });
    updateCharacterCount();
    updateGroupSelectionUI();
    updateChatHeaderNotificationButton();
}
setupChatUI();
window.addEventListener("popstate", () => { routeWorthItChatFromLocation(); });
routeWorthItChatFromLocation();
if (sb()?.auth) {
    sb().auth.getSession().then(({data}) => setAuthState(data?.session?.user || null)).catch(() => setAuthState(null));
    sb().auth.onAuthStateChange((_event, session) => setAuthState(session?.user || null));
}
})();
