-- Worth It: enforce a maximum of 100 accepted friends per user.
-- Run once in Supabase Dashboard -> SQL Editor AFTER supabase/worth-it-social.sql.
-- Followers and following are stored separately in worth_it_follows and remain unlimited.
-- All friend-creating RPCs use per-user transaction locks before counting/inserting,
-- preventing two concurrent accepts from taking a user above the 100-friend cap.

create or replace function public.send_worth_it_friend_request(target_worth_it_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    target_user_id uuid;
    lock_user_id uuid;
    low_id uuid;
    high_id uuid;
    actor_friend_count bigint := 0;
    target_friend_count bigint := 0;
    existing public.worth_it_friend_requests%rowtype;
    existing_found boolean := false;
    new_request_id uuid;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    select user_id into target_user_id
    from public.worth_it_profiles
    where worth_it_id = target_worth_it_id;

    if target_user_id is null then
        return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND');
    end if;
    if target_user_id = actor_id then
        return jsonb_build_object('success', false, 'code', 'CANNOT_FRIEND_SELF');
    end if;

    low_id := least(actor_id, target_user_id);
    high_id := greatest(actor_id, target_user_id);

    select * into existing
    from public.worth_it_friend_requests
    where user_low_id = low_id and user_high_id = high_id
    for update;
    existing_found := found;

    if existing_found and existing.status = 'pending' then
        return jsonb_build_object(
            'success', false,
            'code', case when existing.requester_user_id = actor_id
                then 'REQUEST_ALREADY_SENT' else 'INCOMING_REQUEST_EXISTS' end,
            'request_id', existing.id
        );
    end if;

    -- Lock both users in a stable order so concurrent friend accepts/sends
    -- for either user cannot race past the friend limit.
    for lock_user_id in
        select distinct u.user_id
        from unnest(array[actor_id, target_user_id]) as u(user_id)
        order by u.user_id
    loop
        perform pg_advisory_xact_lock(hashtextextended(lock_user_id::text, 0));
    end loop;

    if exists (
        select 1 from public.worth_it_friends f
        where (f.user_low_id = actor_id and f.user_high_id = target_user_id)
           or (f.user_low_id = target_user_id and f.user_high_id = actor_id)
    ) then
        return jsonb_build_object('success', false, 'code', 'ALREADY_FRIENDS');
    end if;

    select count(*) into actor_friend_count
    from public.worth_it_friends
    where user_low_id = actor_id or user_high_id = actor_id;

    if actor_friend_count >= 100 then
        return jsonb_build_object(
            'success', false, 'code', 'FRIEND_LIMIT_SELF_REACHED',
            'limit', 100, 'friend_count', actor_friend_count
        );
    end if;

    select count(*) into target_friend_count
    from public.worth_it_friends
    where user_low_id = target_user_id or user_high_id = target_user_id;

    if target_friend_count >= 100 then
        return jsonb_build_object(
            'success', false, 'code', 'FRIEND_LIMIT_TARGET_REACHED',
            'limit', 100, 'friend_count', target_friend_count
        );
    end if;

    if existing_found then
        update public.worth_it_friend_requests
        set requester_user_id = actor_id, recipient_user_id = target_user_id,
            status = 'pending', created_at = now(), updated_at = now()
        where id = existing.id;
        return jsonb_build_object('success', true, 'request_id', existing.id, 'status', 'pending');
    end if;

    begin
        insert into public.worth_it_friend_requests(
            user_low_id, user_high_id, requester_user_id, recipient_user_id
        ) values (
            low_id, high_id, actor_id, target_user_id
        )
        returning id into new_request_id;
    exception when unique_violation then
        return jsonb_build_object('success', false, 'code', 'REQUEST_RACE');
    end;

    return jsonb_build_object('success', true, 'request_id', new_request_id, 'status', 'pending');
end;
$$;

create or replace function public.respond_worth_it_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    request_row public.worth_it_friend_requests%rowtype;
    lock_user_id uuid;
    recipient_friend_count bigint := 0;
    requester_friend_count bigint := 0;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    select * into request_row
    from public.worth_it_friend_requests
    where id = p_request_id
    for update;

    if not found or request_row.recipient_user_id <> actor_id or request_row.status <> 'pending' then
        return jsonb_build_object('success', false, 'code', 'REQUEST_NOT_AVAILABLE');
    end if;

    if p_accept then
        -- Use the same per-user locks as the send RPC, in stable UUID order.
        for lock_user_id in
            select distinct u.user_id
            from unnest(array[request_row.requester_user_id, request_row.recipient_user_id]) as u(user_id)
            order by u.user_id
        loop
            perform pg_advisory_xact_lock(hashtextextended(lock_user_id::text, 0));
        end loop;

        -- Preserve idempotency if a relationship already exists.
        if exists (
            select 1 from public.worth_it_friends f
            where f.user_low_id = request_row.user_low_id
              and f.user_high_id = request_row.user_high_id
        ) then
            update public.worth_it_friend_requests
            set status = 'accepted', updated_at = now()
            where id = request_row.id;
            return jsonb_build_object('success', true, 'status', 'accepted');
        end if;

        select count(*) into recipient_friend_count
        from public.worth_it_friends
        where user_low_id = request_row.recipient_user_id
           or user_high_id = request_row.recipient_user_id;

        if recipient_friend_count >= 100 then
            return jsonb_build_object(
                'success', false, 'code', 'FRIEND_LIMIT_RECIPIENT_REACHED',
                'limit', 100, 'friend_count', recipient_friend_count
            );
        end if;

        select count(*) into requester_friend_count
        from public.worth_it_friends
        where user_low_id = request_row.requester_user_id
           or user_high_id = request_row.requester_user_id;

        if requester_friend_count >= 100 then
            return jsonb_build_object(
                'success', false, 'code', 'FRIEND_LIMIT_REQUESTER_REACHED',
                'limit', 100, 'friend_count', requester_friend_count
            );
        end if;

        insert into public.worth_it_friends(user_low_id, user_high_id)
        values(request_row.user_low_id, request_row.user_high_id)
        on conflict (user_low_id, user_high_id) do nothing;

        update public.worth_it_friend_requests
        set status = 'accepted', updated_at = now()
        where id = request_row.id;
        return jsonb_build_object('success', true, 'status', 'accepted');
    end if;

    update public.worth_it_friend_requests
    set status = 'declined', updated_at = now()
    where id = request_row.id;
    return jsonb_build_object('success', true, 'status', 'declined');
end;
$$;

revoke all on function public.send_worth_it_friend_request(bigint) from public, anon;
revoke all on function public.respond_worth_it_friend_request(uuid, boolean) from public, anon;
grant execute on function public.send_worth_it_friend_request(bigint) to authenticated;
grant execute on function public.respond_worth_it_friend_request(uuid, boolean) to authenticated;
