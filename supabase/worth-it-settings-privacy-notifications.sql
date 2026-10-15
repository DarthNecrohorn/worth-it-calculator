-- Worth It account Settings: persistent privacy and in-app notification preferences.
-- Add this migration to the existing Supabase project only after reviewing it.
-- This file is intentionally not executed automatically by Cloudflare Pages.
begin;

create table if not exists public.worth_it_user_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    profile_visibility text not null default 'public'
        check (profile_visibility in ('public', 'friends', 'private')),
    profile_discoverable boolean not null default true,
    show_online_status boolean not null default true,
    show_connections boolean not null default true,
    notify_friend_requests boolean not null default true,
    notify_follows boolean not null default true,
    notify_private_messages boolean not null default true,
    notify_group_chats boolean not null default true,
    notify_account_activity boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.worth_it_user_preferences enable row level security;
revoke all on public.worth_it_user_preferences from public, anon, authenticated;

create or replace function public.get_worth_it_user_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    prefs public.worth_it_user_preferences%rowtype;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    select * into prefs
    from public.worth_it_user_preferences
    where user_id = actor_id;

    return jsonb_build_object(
        'success', true,
        'privacy', jsonb_build_object(
            'profile_visibility', coalesce(prefs.profile_visibility, 'public'),
            'profile_discoverable', coalesce(prefs.profile_discoverable, true),
            'show_online_status', coalesce(prefs.show_online_status, true),
            'show_connections', coalesce(prefs.show_connections, true)
        ),
        'notifications', jsonb_build_object(
            'friend_requests', coalesce(prefs.notify_friend_requests, true),
            'follows', coalesce(prefs.notify_follows, true),
            'private_messages', coalesce(prefs.notify_private_messages, true),
            'group_chats', coalesce(prefs.notify_group_chats, true),
            'account_activity', coalesce(prefs.notify_account_activity, true)
        )
    );
end;
$$;

create or replace function public.save_worth_it_user_preferences(
    p_privacy jsonb,
    p_notifications jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    visibility text;
    discoverable boolean;
    online_status boolean;
    show_connections_value boolean;
    friend_requests boolean;
    follows boolean;
    private_messages boolean;
    group_chats boolean;
    account_activity boolean;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;
    if p_privacy is null or jsonb_typeof(p_privacy) <> 'object'
       or p_notifications is null or jsonb_typeof(p_notifications) <> 'object' then
        return jsonb_build_object('success', false, 'code', 'INVALID_PREFERENCES',
            'error', 'The settings payload is invalid.');
    end if;

    visibility := coalesce(p_privacy->>'profile_visibility', '');
    if visibility not in ('public', 'friends', 'private') then
        return jsonb_build_object('success', false, 'code', 'INVALID_PROFILE_VISIBILITY',
            'error', 'Choose a valid profile visibility option.');
    end if;

    if jsonb_typeof(p_privacy->'profile_discoverable') is distinct from 'boolean'
       or jsonb_typeof(p_privacy->'show_online_status') is distinct from 'boolean'
       or jsonb_typeof(p_privacy->'show_connections') is distinct from 'boolean'
       or jsonb_typeof(p_notifications->'friend_requests') is distinct from 'boolean'
       or jsonb_typeof(p_notifications->'follows') is distinct from 'boolean'
       or jsonb_typeof(p_notifications->'private_messages') is distinct from 'boolean'
       or jsonb_typeof(p_notifications->'group_chats') is distinct from 'boolean'
       or jsonb_typeof(p_notifications->'account_activity') is distinct from 'boolean' then
        return jsonb_build_object('success', false, 'code', 'INVALID_PREFERENCES',
            'error', 'One or more settings have an invalid value.');
    end if;

    discoverable := (p_privacy->>'profile_discoverable')::boolean;
    online_status := (p_privacy->>'show_online_status')::boolean;
    show_connections_value := (p_privacy->>'show_connections')::boolean;
    friend_requests := (p_notifications->>'friend_requests')::boolean;
    follows := (p_notifications->>'follows')::boolean;
    private_messages := (p_notifications->>'private_messages')::boolean;
    group_chats := (p_notifications->>'group_chats')::boolean;
    account_activity := (p_notifications->>'account_activity')::boolean;

    insert into public.worth_it_user_preferences (
        user_id, profile_visibility, profile_discoverable, show_online_status, show_connections,
        notify_friend_requests, notify_follows, notify_private_messages, notify_group_chats,
        notify_account_activity, updated_at
    ) values (
        actor_id, visibility, discoverable, online_status, show_connections_value,
        friend_requests, follows, private_messages, group_chats, account_activity, now()
    )
    on conflict (user_id) do update set
        profile_visibility = excluded.profile_visibility,
        profile_discoverable = excluded.profile_discoverable,
        show_online_status = excluded.show_online_status,
        show_connections = excluded.show_connections,
        notify_friend_requests = excluded.notify_friend_requests,
        notify_follows = excluded.notify_follows,
        notify_private_messages = excluded.notify_private_messages,
        notify_group_chats = excluded.notify_group_chats,
        notify_account_activity = excluded.notify_account_activity,
        updated_at = now();

    return public.get_worth_it_user_preferences();
end;
$$;

-- This check is used by the public profile view and its privacy-sensitive RPCs.
create or replace function public.can_view_worth_it_profile(target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    visibility text;
begin
    if target_user_id is null then return false; end if;
    if actor_id = target_user_id then return true; end if;

    select coalesce(p.profile_visibility, 'public') into visibility
    from public.worth_it_profiles wp
    left join public.worth_it_user_preferences p on p.user_id = wp.user_id
    where wp.user_id = target_user_id;

    if not found then return false; end if;
    if visibility = 'public' then return true; end if;
    if visibility <> 'friends' or actor_id is null then return false; end if;

    return exists (
        select 1 from public.worth_it_friends f
        where (f.user_low_id = actor_id and f.user_high_id = target_user_id)
           or (f.user_low_id = target_user_id and f.user_high_id = actor_id)
    );
end;
$$;

revoke all on function public.get_worth_it_user_preferences() from public, anon;
revoke all on function public.save_worth_it_user_preferences(jsonb, jsonb) from public, anon;
revoke all on function public.can_view_worth_it_profile(uuid) from public;
grant execute on function public.get_worth_it_user_preferences() to authenticated;
grant execute on function public.save_worth_it_user_preferences(jsonb, jsonb) to authenticated;
grant execute on function public.can_view_worth_it_profile(uuid) to anon, authenticated;

-- Preserve the current public-profile columns in their existing order and append
-- only the online-status flag required by the profile UI.
create or replace view public.worth_it_public_profiles as
select
    wp.worth_it_id,
    wp.username,
    coalesce(wp.display_name, wp.username, 'Worth It member') as display_name,
    wp.avatar_url,
    wp.created_at,
    wp.banner_url,
    wp.description,
    case when coalesce(p.show_online_status, true) then wp.last_seen_at else null end as last_seen_at,
    coalesce(p.show_online_status, true) as show_online_status
from public.worth_it_profiles wp
left join public.worth_it_user_preferences p on p.user_id = wp.user_id
where public.can_view_worth_it_profile(wp.user_id);

grant select on public.worth_it_public_profiles to anon, authenticated;

create or replace function public.search_worth_it_public_profiles(p_query text, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    clean_query text := lower(btrim(regexp_replace(coalesce(p_query, ''), '^@', '')));
    result jsonb;
begin
    if clean_query = '' or char_length(clean_query) > 50 then return '[]'::jsonb; end if;
    if clean_query !~ '^[0-9]+$' and char_length(clean_query) < 2 then return '[]'::jsonb; end if;

    select coalesce(jsonb_agg(to_jsonb(matches)), '[]'::jsonb) into result
    from (
        select p.worth_it_id, p.username, p.display_name, p.avatar_url, p.created_at,
               p.last_seen_at, p.show_online_status
        from public.worth_it_public_profiles p
        join public.worth_it_profiles base on base.worth_it_id = p.worth_it_id
        left join public.worth_it_user_preferences prefs on prefs.user_id = base.user_id
        where coalesce(prefs.profile_discoverable, true)
          and (
              (clean_query ~ '^[0-9]+$' and p.worth_it_id::text = clean_query)
              or (clean_query !~ '^[0-9]+$' and position(clean_query in lower(coalesce(p.username, ''))) > 0)
          )
        order by case when lower(coalesce(p.username, '')) = clean_query then 0
                      when position(clean_query in lower(coalesce(p.username, ''))) = 1 then 1 else 2 end,
                 lower(coalesce(p.username, p.display_name, ''))
        limit greatest(1, least(coalesce(p_limit, 20), 20))
    ) as matches;
    return result;
end;
$$;
revoke all on function public.search_worth_it_public_profiles(text, integer) from public;
grant execute on function public.search_worth_it_public_profiles(text, integer) to anon, authenticated;

create or replace function public.get_worth_it_profile_stats(target_worth_it_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    target_user_id uuid;
    can_show_connections boolean := true;
    friends_count bigint := 0;
    followers_count bigint := 0;
    following_count bigint := 0;
begin
    select user_id into target_user_id
    from public.worth_it_profiles where worth_it_id = target_worth_it_id;

    if target_user_id is null or not public.can_view_worth_it_profile(target_user_id) then
        return jsonb_build_object('friends', 0, 'followers', 0, 'following', 0, 'hidden', true);
    end if;

    select coalesce(show_connections, true) into can_show_connections
    from public.worth_it_user_preferences where user_id = target_user_id;
    can_show_connections := coalesce(can_show_connections, true);
    if not can_show_connections then
        return jsonb_build_object('friends', null, 'followers', null, 'following', null, 'hidden', true);
    end if;

    select count(*) into following_count from public.worth_it_follows where follower_user_id = target_user_id;
    select count(*) into followers_count from public.worth_it_follows where followed_user_id = target_user_id;
    select count(*) into friends_count from public.worth_it_friends where user_low_id = target_user_id or user_high_id = target_user_id;

    return jsonb_build_object('friends', friends_count, 'followers', followers_count, 'following', following_count, 'hidden', false);
end;
$$;

create or replace function public.get_worth_it_profile_connections(target_worth_it_id bigint, connection_type text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    target_user_id uuid;
    can_show_connections boolean := true;
    connections jsonb := '[]'::jsonb;
begin
    if connection_type is null or connection_type not in ('friends', 'followers', 'following') then
        return jsonb_build_object('success', false, 'code', 'INVALID_CONNECTION_TYPE');
    end if;

    select user_id into target_user_id from public.worth_it_profiles where worth_it_id = target_worth_it_id;
    if target_user_id is null or not public.can_view_worth_it_profile(target_user_id) then
        return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND');
    end if;

    select coalesce(show_connections, true) into can_show_connections
    from public.worth_it_user_preferences where user_id = target_user_id;
    can_show_connections := coalesce(can_show_connections, true);
    if not can_show_connections then
        return jsonb_build_object('success', true, 'connections', '[]'::jsonb, 'hidden', true);
    end if;

    if connection_type = 'friends' then
        select coalesce(jsonb_agg(jsonb_build_object(
            'worth_it_id', p.worth_it_id, 'username', p.username,
            'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
            'avatar_url', p.avatar_url,
            'last_seen_at', case when coalesce(prefs.show_online_status, true) then p.last_seen_at else null end,
            'show_online_status', coalesce(prefs.show_online_status, true)
        ) order by lower(coalesce(p.display_name, p.username, ''))), '[]'::jsonb)
        into connections
        from public.worth_it_friends f
        join public.worth_it_profiles p
          on p.user_id = case when f.user_low_id = target_user_id then f.user_high_id else f.user_low_id end
        left join public.worth_it_user_preferences prefs on prefs.user_id = p.user_id
        where (f.user_low_id = target_user_id or f.user_high_id = target_user_id)
          and public.can_view_worth_it_profile(p.user_id);
    elsif connection_type = 'following' then
        select coalesce(jsonb_agg(jsonb_build_object(
            'worth_it_id', p.worth_it_id, 'username', p.username,
            'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
            'avatar_url', p.avatar_url,
            'last_seen_at', case when coalesce(prefs.show_online_status, true) then p.last_seen_at else null end,
            'show_online_status', coalesce(prefs.show_online_status, true)
        ) order by lower(coalesce(p.display_name, p.username, ''))), '[]'::jsonb)
        into connections
        from public.worth_it_follows f
        join public.worth_it_profiles p on p.user_id = f.followed_user_id
        left join public.worth_it_user_preferences prefs on prefs.user_id = p.user_id
        where f.follower_user_id = target_user_id
          and public.can_view_worth_it_profile(p.user_id);
    else
        select coalesce(jsonb_agg(jsonb_build_object(
            'worth_it_id', p.worth_it_id, 'username', p.username,
            'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
            'avatar_url', p.avatar_url,
            'last_seen_at', case when coalesce(prefs.show_online_status, true) then p.last_seen_at else null end,
            'show_online_status', coalesce(prefs.show_online_status, true)
        ) order by lower(coalesce(p.display_name, p.username, ''))), '[]'::jsonb)
        into connections
        from public.worth_it_follows f
        join public.worth_it_profiles p on p.user_id = f.follower_user_id
        left join public.worth_it_user_preferences prefs on prefs.user_id = p.user_id
        where f.followed_user_id = target_user_id
          and public.can_view_worth_it_profile(p.user_id);
    end if;

    return jsonb_build_object('success', true, 'connections', connections, 'hidden', false);
end;
$$;

-- Do not expose relationship/request state for profiles the caller cannot view.
create or replace function public.get_worth_it_profile_social_context(target_worth_it_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    target_user_id uuid;
    actor_id uuid := auth.uid();
    outgoing_id uuid;
    outgoing_status text;
    incoming_id uuid;
    incoming_status text;
    are_friends boolean := false;
    is_following boolean := false;
    follows_you boolean := false;
begin
    select user_id into target_user_id
    from public.worth_it_profiles
    where worth_it_id = target_worth_it_id;

    if target_user_id is null or not public.can_view_worth_it_profile(target_user_id) then
        return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND');
    end if;

    if actor_id is null then
        return jsonb_build_object(
            'success', true, 'is_self', false, 'is_following', false,
            'follows_you', false, 'are_friends', false,
            'outgoing_request_id', null, 'outgoing_request_pending', false,
            'incoming_request_id', null, 'incoming_request_pending', false
        );
    end if;

    select exists (
        select 1 from public.worth_it_friends f
        where (f.user_low_id = actor_id and f.user_high_id = target_user_id)
           or (f.user_low_id = target_user_id and f.user_high_id = actor_id)
    ) into are_friends;

    select exists (
        select 1 from public.worth_it_follows f
        where f.follower_user_id = actor_id and f.followed_user_id = target_user_id
    ) into is_following;

    select exists (
        select 1 from public.worth_it_follows f
        where f.follower_user_id = target_user_id and f.followed_user_id = actor_id
    ) into follows_you;

    select r.id, r.status into outgoing_id, outgoing_status
    from public.worth_it_friend_requests r
    where r.requester_user_id = actor_id and r.recipient_user_id = target_user_id;

    select r.id, r.status into incoming_id, incoming_status
    from public.worth_it_friend_requests r
    where r.requester_user_id = target_user_id and r.recipient_user_id = actor_id;

    return jsonb_build_object(
        'success', true,
        'is_self', actor_id = target_user_id,
        'is_following', is_following,
        'follows_you', follows_you,
        'are_friends', are_friends,
        'outgoing_request_id', outgoing_id,
        'outgoing_request_pending', coalesce(outgoing_status = 'pending', false),
        'incoming_request_id', incoming_id,
        'incoming_request_pending', coalesce(incoming_status = 'pending', false)
    );
end;
$;

revoke all on function public.get_worth_it_profile_social_context(bigint) from public;
grant execute on function public.get_worth_it_profile_social_context(bigint) to anon, authenticated;

-- Notification preferences control the existing in-app notification feed.
-- Account-security email messages remain project-level Supabase settings.
do $$
declare item record;
begin
    for item in
        select conname from pg_constraint
        where conrelid = 'public.worth_it_social_notifications'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%notification_type%'
    loop
        execute format('alter table public.worth_it_social_notifications drop constraint %I', item.conname);
    end loop;
end;
$$;

alter table public.worth_it_social_notifications
    add constraint worth_it_social_notifications_notification_type_check
    check (notification_type in ('unfriended', 'follow'));

create or replace function public.follow_worth_it_user(target_worth_it_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    target_user_id uuid;
    inserted_count integer := 0;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;

    select user_id into target_user_id
    from public.worth_it_profiles where worth_it_id = target_worth_it_id;
    if target_user_id is null then return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND'); end if;
    if target_user_id = actor_id then return jsonb_build_object('success', false, 'code', 'CANNOT_FOLLOW_SELF'); end if;

    insert into public.worth_it_follows(follower_user_id, followed_user_id)
    values (actor_id, target_user_id)
    on conflict (follower_user_id, followed_user_id) do nothing;
    get diagnostics inserted_count = row_count;

    if inserted_count > 0 and not exists (
        select 1 from public.worth_it_user_preferences
        where user_id = target_user_id and notify_follows = false
    ) then
        insert into public.worth_it_social_notifications(recipient_user_id, actor_user_id, notification_type)
        values (target_user_id, actor_id, 'follow');
    end if;

    return jsonb_build_object('success', true, 'is_following', true, 'notification_created', inserted_count > 0);
end;
$$;

create or replace function public.get_worth_it_pending_friend_request_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    requests jsonb;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;

    if exists (
        select 1 from public.worth_it_user_preferences
        where user_id = actor_id and notify_friend_requests = false
    ) then
        return '[]'::jsonb;
    end if;

    delete from public.worth_it_notification_dismissals
    where user_id = actor_id and dismissed_at <= statement_timestamp() - interval '24 hours';

    select coalesce(jsonb_agg(jsonb_build_object(
        'request_id', r.id,
        'requested_at', r.created_at,
        'worth_it_id', p.worth_it_id,
        'username', p.username,
        'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
        'avatar_url', p.avatar_url
    ) order by r.created_at desc), '[]'::jsonb)
    into requests
    from public.worth_it_friend_requests r
    join public.worth_it_profiles p on p.user_id = r.requester_user_id
    where r.recipient_user_id = actor_id
      and r.status = 'pending'
      and r.created_at > statement_timestamp() - interval '24 hours'
      and not exists (
          select 1 from public.worth_it_notification_dismissals d
          where d.user_id = actor_id
            and d.notification_kind = 'friend_request'
            and d.notification_id = r.id::text
      );

    return requests;
end;
$$;

create or replace function public.get_worth_it_social_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    result jsonb;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;

    delete from public.worth_it_social_notifications
    where recipient_user_id = actor_id and created_at <= statement_timestamp() - interval '24 hours';
    delete from public.worth_it_notification_dismissals
    where user_id = actor_id and dismissed_at <= statement_timestamp() - interval '24 hours';

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'type', n.notification_type, 'reason', n.reason,
        'created_at', n.created_at, 'read_at', n.read_at,
        'worth_it_id', p.worth_it_id, 'username', p.username,
        'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
        'avatar_url', p.avatar_url
    ) order by n.created_at desc), '[]'::jsonb)
    into result
    from public.worth_it_social_notifications n
    left join public.worth_it_profiles p on p.user_id = n.actor_user_id
    left join public.worth_it_user_preferences prefs on prefs.user_id = actor_id
    where n.recipient_user_id = actor_id
      and n.created_at > statement_timestamp() - interval '24 hours'
      and (
          (n.notification_type = 'follow' and coalesce(prefs.notify_follows, true))
          or (n.notification_type = 'unfriended' and coalesce(prefs.notify_account_activity, true))
      );

    return result;
end;
$$;

-- Keep direct-chat presence private when a user disables online status.
create or replace function public.get_worth_it_chat_friends()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    result jsonb;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'worth_it_id', p.worth_it_id,
        'username', p.username,
        'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
        'avatar_url', p.avatar_url,
        'last_seen_at', case when coalesce(prefs.show_online_status, true) then p.last_seen_at else null end,
        'show_online_status', coalesce(prefs.show_online_status, true)
    ) order by lower(coalesce(p.display_name, p.username, ''))), '[]'::jsonb)
    into result
    from public.worth_it_friends f
    join public.worth_it_profiles p
      on p.user_id = case when f.user_low_id = actor_id then f.user_high_id else f.user_low_id end
    left join public.worth_it_user_preferences prefs on prefs.user_id = p.user_id
    where f.user_low_id = actor_id or f.user_high_id = actor_id;

    return result;
end;
$$;
revoke all on function public.get_worth_it_chat_friends() from public, anon;
grant execute on function public.get_worth_it_chat_friends() to authenticated;

create or replace function public.get_worth_it_chat_messages(
    p_conversation_id uuid default null,
    p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    target_id uuid := coalesce(p_conversation_id, '00000000-0000-4000-8000-000000000001'::uuid);
    target_type text;
    result jsonb;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;

    select conversation_type into target_type
    from public.worth_it_chat_conversations where id = target_id;
    if target_type is null then return jsonb_build_object('success', false, 'code', 'CHAT_NOT_FOUND'); end if;
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members
        where conversation_id = target_id and user_id = actor_id
    ) then
        return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
    end if;

    select coalesce(jsonb_agg(row_data order by message_id), '[]'::jsonb) into result
    from (
        select m.id as message_id, jsonb_build_object(
            'id', m.id, 'body', m.body, 'media_url', m.media_url, 'media_type', m.media_type,
            'filtered_reason', m.filtered_reason, 'created_at', m.created_at, 'sender_user_id', m.sender_user_id,
            'worth_it_id', p.worth_it_id, 'username', p.username,
            'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
            'avatar_url', p.avatar_url,
            'last_seen_at', case when coalesce(prefs.show_online_status, true) then p.last_seen_at else null end,
            'show_online_status', coalesce(prefs.show_online_status, true),
            'is_seen', case when target_type = 'direct' and m.sender_user_id = actor_id then exists (
                select 1 from public.worth_it_chat_members recipient
                where recipient.conversation_id = target_id and recipient.user_id <> actor_id
                  and recipient.last_read_at >= m.created_at
            ) else false end
        ) as row_data
        from public.worth_it_chat_messages m
        join public.worth_it_profiles p on p.user_id = m.sender_user_id
        left join public.worth_it_user_preferences prefs on prefs.user_id = p.user_id
        where m.conversation_id = target_id
        order by m.id desc
        limit greatest(1, least(coalesce(p_limit, 100), 100))
    ) q;

    insert into public.worth_it_chat_members(conversation_id, user_id, last_read_at)
    values (target_id, actor_id, now())
    on conflict (conversation_id, user_id)
    do update set last_read_at = excluded.last_read_at;

    return result;
end;
$$;
revoke all on function public.get_worth_it_chat_messages(uuid, integer) from public, anon;
grant execute on function public.get_worth_it_chat_messages(uuid, integer) to authenticated;

commit;
