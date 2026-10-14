-- Worth It social connections: explicit friend requests, mutual friendships and follow controls.
-- Run once in Supabase Dashboard -> SQL Editor AFTER supabase/worth-it-profiles.sql and supabase/profile-avatars.sql.
-- This migration adds new social features without changing existing profile IDs, avatars, banners or follow data.

create table if not exists public.worth_it_friends (
    user_low_id uuid not null references auth.users(id) on delete cascade,
    user_high_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint worth_it_friends_pair_order check (user_low_id < user_high_id),
    primary key (user_low_id, user_high_id)
);

create table if not exists public.worth_it_friend_requests (
    id uuid primary key default gen_random_uuid(),
    user_low_id uuid not null references auth.users(id) on delete cascade,
    user_high_id uuid not null references auth.users(id) on delete cascade,
    requester_user_id uuid not null references auth.users(id) on delete cascade,
    recipient_user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint worth_it_friend_requests_pair_order check (user_low_id < user_high_id),
    constraint worth_it_friend_requests_direction check (
        requester_user_id <> recipient_user_id
        and ((requester_user_id = user_low_id and recipient_user_id = user_high_id)
          or (requester_user_id = user_high_id and recipient_user_id = user_low_id))
    ),
    constraint worth_it_friend_requests_pair_unique unique (user_low_id, user_high_id)
);

create index if not exists worth_it_friends_high_idx on public.worth_it_friends(user_high_id, user_low_id);
create index if not exists worth_it_friend_requests_recipient_pending_idx
    on public.worth_it_friend_requests(recipient_user_id, created_at desc)
    where status = 'pending';

alter table public.worth_it_friends enable row level security;
alter table public.worth_it_friend_requests enable row level security;
-- Social data is accessed only through the security-definer functions below.
revoke all on public.worth_it_friends from anon, authenticated;
revoke all on public.worth_it_friend_requests from anon, authenticated;

-- Public profile counts. Friend counts come from accepted explicit friendships;
-- followers and following continue to use the existing directional follow table.
create or replace function public.get_worth_it_profile_stats(target_worth_it_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    target_user_id uuid;
    friends_count bigint := 0;
    followers_count bigint := 0;
    following_count bigint := 0;
begin
    select user_id into target_user_id
    from public.worth_it_profiles
    where worth_it_id = target_worth_it_id;

    if target_user_id is null then
        return jsonb_build_object('friends', 0, 'followers', 0, 'following', 0);
    end if;

    select count(*) into following_count
    from public.worth_it_follows
    where follower_user_id = target_user_id;

    select count(*) into followers_count
    from public.worth_it_follows
    where followed_user_id = target_user_id;

    select count(*) into friends_count
    from public.worth_it_friends
    where user_low_id = target_user_id or user_high_id = target_user_id;

    return jsonb_build_object(
        'friends', friends_count,
        'followers', followers_count,
        'following', following_count
    );
end;
$$;

-- Return relationship state from the authenticated viewer's perspective.
-- It never exposes another user's email or raw auth user record.
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

    if target_user_id is null then
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
$$;

-- A public, privacy-safe list used by the profile's friends / followers / following pages.
create or replace function public.get_worth_it_profile_connections(
    target_worth_it_id bigint,
    connection_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    target_user_id uuid;
    connections jsonb := '[]'::jsonb;
begin
    if connection_type is null or connection_type not in ('friends', 'followers', 'following') then
        return jsonb_build_object('success', false, 'code', 'INVALID_CONNECTION_TYPE');
    end if;

    select user_id into target_user_id
    from public.worth_it_profiles
    where worth_it_id = target_worth_it_id;

    if target_user_id is null then
        return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND');
    end if;

    if connection_type = 'friends' then
        select coalesce(jsonb_agg(jsonb_build_object(
            'worth_it_id', p.worth_it_id,
            'username', p.username,
            'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
            'avatar_url', p.avatar_url
        ) order by lower(coalesce(p.display_name, p.username, ''))), '[]'::jsonb)
        into connections
        from public.worth_it_friends f
        join public.worth_it_profiles p
          on p.user_id = case when f.user_low_id = target_user_id then f.user_high_id else f.user_low_id end
        where f.user_low_id = target_user_id or f.user_high_id = target_user_id;
    elsif connection_type = 'following' then
        select coalesce(jsonb_agg(jsonb_build_object(
            'worth_it_id', p.worth_it_id,
            'username', p.username,
            'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
            'avatar_url', p.avatar_url
        ) order by lower(coalesce(p.display_name, p.username, ''))), '[]'::jsonb)
        into connections
        from public.worth_it_follows f
        join public.worth_it_profiles p on p.user_id = f.followed_user_id
        where f.follower_user_id = target_user_id;
    else
        select coalesce(jsonb_agg(jsonb_build_object(
            'worth_it_id', p.worth_it_id,
            'username', p.username,
            'display_name', coalesce(p.display_name, p.username, 'Worth It member'),
            'avatar_url', p.avatar_url
        ) order by lower(coalesce(p.display_name, p.username, ''))), '[]'::jsonb)
        into connections
        from public.worth_it_follows f
        join public.worth_it_profiles p on p.user_id = f.follower_user_id
        where f.followed_user_id = target_user_id;
    end if;

    return jsonb_build_object('success', true, 'connections', connections);
end;
$$;

-- Return incoming pending requests only to the signed-in recipient.
create or replace function public.get_worth_it_pending_friend_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    requests jsonb;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

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
    where r.recipient_user_id = actor_id and r.status = 'pending';

    return requests;
end;
$$;

create or replace function public.follow_worth_it_user(target_worth_it_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor_id uuid := auth.uid(); target_user_id uuid;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select user_id into target_user_id from public.worth_it_profiles where worth_it_id = target_worth_it_id;
    if target_user_id is null then return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND'); end if;
    if target_user_id = actor_id then return jsonb_build_object('success', false, 'code', 'CANNOT_FOLLOW_SELF'); end if;
    insert into public.worth_it_follows(follower_user_id, followed_user_id)
    values(actor_id, target_user_id)
    on conflict (follower_user_id, followed_user_id) do nothing;
    return jsonb_build_object('success', true, 'is_following', true);
end;
$$;

create or replace function public.unfollow_worth_it_user(target_worth_it_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor_id uuid := auth.uid(); target_user_id uuid;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select user_id into target_user_id from public.worth_it_profiles where worth_it_id = target_worth_it_id;
    if target_user_id is null then return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND'); end if;
    if target_user_id = actor_id then return jsonb_build_object('success', false, 'code', 'CANNOT_UNFOLLOW_SELF'); end if;
    delete from public.worth_it_follows where follower_user_id = actor_id and followed_user_id = target_user_id;
    return jsonb_build_object('success', true, 'is_following', false);
end;
$$;

create or replace function public.send_worth_it_friend_request(target_worth_it_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    target_user_id uuid;
    low_id uuid;
    high_id uuid;
    existing public.worth_it_friend_requests%rowtype;
    new_request_id uuid;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select user_id into target_user_id from public.worth_it_profiles where worth_it_id = target_worth_it_id;
    if target_user_id is null then return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND'); end if;
    if target_user_id = actor_id then return jsonb_build_object('success', false, 'code', 'CANNOT_FRIEND_SELF'); end if;
    if exists (select 1 from public.worth_it_friends f where
       (f.user_low_id = actor_id and f.user_high_id = target_user_id) or
       (f.user_low_id = target_user_id and f.user_high_id = actor_id)) then
        return jsonb_build_object('success', false, 'code', 'ALREADY_FRIENDS');
    end if;

    low_id := least(actor_id, target_user_id);
    high_id := greatest(actor_id, target_user_id);

    select * into existing from public.worth_it_friend_requests
    where user_low_id = low_id and user_high_id = high_id
    for update;

    if found then
        if existing.status = 'pending' then
            return jsonb_build_object('success', false,
                'code', case when existing.requester_user_id = actor_id then 'REQUEST_ALREADY_SENT' else 'INCOMING_REQUEST_EXISTS' end,
                'request_id', existing.id);
        end if;
        update public.worth_it_friend_requests
        set requester_user_id = actor_id, recipient_user_id = target_user_id,
            status = 'pending', created_at = now(), updated_at = now()
        where id = existing.id;
        return jsonb_build_object('success', true, 'request_id', existing.id, 'status', 'pending');
    end if;

    begin
        insert into public.worth_it_friend_requests(user_low_id, user_high_id, requester_user_id, recipient_user_id)
        values(low_id, high_id, actor_id, target_user_id)
        returning id into new_request_id;
    exception when unique_violation then
        return jsonb_build_object('success', false, 'code', 'REQUEST_RACE');
    end;

    return jsonb_build_object('success', true, 'request_id', new_request_id, 'status', 'pending');
end;
$;

create or replace function public.respond_worth_it_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor_id uuid := auth.uid(); request_row public.worth_it_friend_requests%rowtype;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select * into request_row from public.worth_it_friend_requests where id = p_request_id for update;
    if not found or request_row.recipient_user_id <> actor_id or request_row.status <> 'pending' then
        return jsonb_build_object('success', false, 'code', 'REQUEST_NOT_AVAILABLE');
    end if;

    if p_accept then
        insert into public.worth_it_friends(user_low_id, user_high_id)
        values(request_row.user_low_id, request_row.user_high_id)
        on conflict (user_low_id, user_high_id) do nothing;
        update public.worth_it_friend_requests set status = 'accepted', updated_at = now() where id = request_row.id;
        return jsonb_build_object('success', true, 'status', 'accepted');
    end if;

    update public.worth_it_friend_requests set status = 'declined', updated_at = now() where id = request_row.id;
    return jsonb_build_object('success', true, 'status', 'declined');
end;
$$;

create or replace function public.cancel_worth_it_friend_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor_id uuid := auth.uid(); request_row public.worth_it_friend_requests%rowtype;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select * into request_row from public.worth_it_friend_requests where id = p_request_id for update;
    if not found or request_row.requester_user_id <> actor_id or request_row.status <> 'pending' then
        return jsonb_build_object('success', false, 'code', 'REQUEST_NOT_AVAILABLE');
    end if;
    update public.worth_it_friend_requests set status = 'cancelled', updated_at = now() where id = request_row.id;
    return jsonb_build_object('success', true, 'status', 'cancelled');
end;
$$;

create or replace function public.unfriend_worth_it_user(target_worth_it_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor_id uuid := auth.uid(); target_user_id uuid; low_id uuid; high_id uuid;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select user_id into target_user_id from public.worth_it_profiles where worth_it_id = target_worth_it_id;
    if target_user_id is null then return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND'); end if;
    if target_user_id = actor_id then return jsonb_build_object('success', false, 'code', 'CANNOT_UNFRIEND_SELF'); end if;
    low_id := least(actor_id, target_user_id); high_id := greatest(actor_id, target_user_id);
    delete from public.worth_it_friends where user_low_id = low_id and user_high_id = high_id;
    update public.worth_it_friend_requests
    set status = 'cancelled', updated_at = now()
    where user_low_id = low_id and user_high_id = high_id and status = 'accepted';
    return jsonb_build_object('success', true, 'are_friends', false);
end;
$$;

revoke all on function public.get_worth_it_profile_stats(bigint) from public;
revoke all on function public.get_worth_it_profile_social_context(bigint) from public;
revoke all on function public.get_worth_it_profile_connections(bigint, text) from public;
revoke all on function public.get_worth_it_pending_friend_requests() from public;
revoke all on function public.follow_worth_it_user(bigint) from public, anon;
revoke all on function public.unfollow_worth_it_user(bigint) from public, anon;
revoke all on function public.send_worth_it_friend_request(bigint) from public, anon;
revoke all on function public.respond_worth_it_friend_request(uuid, boolean) from public, anon;
revoke all on function public.cancel_worth_it_friend_request(uuid) from public, anon;
revoke all on function public.unfriend_worth_it_user(bigint) from public, anon;

grant execute on function public.get_worth_it_profile_stats(bigint) to anon, authenticated;
grant execute on function public.get_worth_it_profile_social_context(bigint) to anon, authenticated;
grant execute on function public.get_worth_it_profile_connections(bigint, text) to anon, authenticated;
grant execute on function public.get_worth_it_pending_friend_requests() to authenticated;
grant execute on function public.follow_worth_it_user(bigint) to authenticated;
grant execute on function public.unfollow_worth_it_user(bigint) to authenticated;
grant execute on function public.send_worth_it_friend_request(bigint) to authenticated;
grant execute on function public.respond_worth_it_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_worth_it_friend_request(uuid) to authenticated;
grant execute on function public.unfriend_worth_it_user(bigint) to authenticated;
