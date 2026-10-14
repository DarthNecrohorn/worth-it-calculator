-- Worth It Chat: per-chat notification preferences and a 30-member group limit.
-- Run this migration once in the Supabase SQL Editor for the existing project.
begin;

create table if not exists public.worth_it_chat_notification_preferences (
    user_id uuid not null references auth.users(id) on delete cascade,
    chat_key text not null,
    notifications_enabled boolean not null default true,
    updated_at timestamptz not null default now(),
    primary key (user_id, chat_key),
    constraint worth_it_chat_notification_key_valid check (
        chat_key = 'global'
        or chat_key ~ '^direct:[1-9][0-9]*$'
        or chat_key ~ '^group:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    )
);

revoke all on public.worth_it_chat_notification_preferences from public, anon, authenticated;

create or replace function public.get_worth_it_chat_notification_preferences()
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
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    select coalesce(jsonb_object_agg(chat_key, notifications_enabled), '{}'::jsonb)
      into result
      from public.worth_it_chat_notification_preferences
     where user_id = actor_id;

    return result;
end;
$$;

create or replace function public.get_worth_it_chat_conversations()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare actor_id uuid := auth.uid(); result jsonb;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.conversation_type, 'title', c.title,
        'created_at', c.created_at,
        'members', case
            when c.conversation_type = 'global' then '[]'::jsonb
            else (
                select coalesce(jsonb_agg(jsonb_build_object(
                    'worth_it_id', p.worth_it_id, 'username', p.username,
                    'display_name', coalesce(p.display_name,p.username,'Worth It member'),
                    'avatar_url', p.avatar_url
                ) order by lower(coalesce(p.display_name,p.username,''))), '[]'::jsonb)
                from public.worth_it_chat_members cm
                join public.worth_it_profiles p on p.user_id = cm.user_id
                where cm.conversation_id = c.id and cm.user_id <> actor_id
            )
        end,
        'last_message', (
            select jsonb_build_object('body', m.body, 'created_at', m.created_at,
                'sender_user_id', m.sender_user_id, 'media_type', m.media_type)
            from public.worth_it_chat_messages m
            where m.conversation_id = c.id
            order by m.id desc limit 1
        ),
        'unread_count', (
            select count(*)
            from public.worth_it_chat_messages m
            left join public.worth_it_chat_members mine
                on mine.conversation_id = c.id and mine.user_id = actor_id
            where m.conversation_id = c.id
              and m.sender_user_id <> actor_id
              and (
                (c.conversation_type <> 'global'
                    and (mine.last_read_at is null or m.created_at > mine.last_read_at))
                or
                (c.conversation_type = 'global'
                    and mine.last_read_at is not null
                    and m.created_at > mine.last_read_at)
              )
        )
    ) order by coalesce(
        (select max(m2.created_at) from public.worth_it_chat_messages m2 where m2.conversation_id = c.id),
        c.created_at
    ) desc), '[]'::jsonb)
    into result
    from public.worth_it_chat_conversations c
    left join public.worth_it_chat_members mine
        on mine.conversation_id = c.id and mine.user_id = actor_id
    where (c.conversation_type in ('direct','group') and mine.user_id = actor_id)
       or c.conversation_type = 'global';

    return result;
end; $$;

revoke all on function public.get_worth_it_chat_conversations() from public, anon;
grant execute on function public.get_worth_it_chat_conversations() to authenticated;

create or replace function public.set_worth_it_chat_notifications(
    p_chat_key text,
    p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    target_worth_it_id bigint;
    target_user_id uuid;
    target_conversation_id uuid;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    if p_chat_key is null or p_enabled is null then
        return jsonb_build_object('success', false, 'code', 'INVALID_NOTIFICATION_SETTING');
    end if;

    if p_chat_key = 'global' then
        null;
    elsif p_chat_key ~ '^direct:[1-9][0-9]*$' then
        begin
            target_worth_it_id := substring(p_chat_key from 8)::bigint;
        exception when others then
            return jsonb_build_object('success', false, 'code', 'INVALID_CHAT');
        end;

        select p.user_id
          into target_user_id
          from public.worth_it_profiles p
         where p.worth_it_id = target_worth_it_id;

        if target_user_id is null or target_user_id = actor_id or not exists (
            select 1
              from public.worth_it_friends f
             where (f.user_low_id = actor_id and f.user_high_id = target_user_id)
                or (f.user_low_id = target_user_id and f.user_high_id = actor_id)
        ) then
            return jsonb_build_object('success', false, 'code', 'FRIENDS_ONLY');
        end if;
    elsif p_chat_key ~ '^group:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        begin
            target_conversation_id := substring(p_chat_key from 7)::uuid;
        exception when others then
            return jsonb_build_object('success', false, 'code', 'INVALID_CHAT');
        end;

        if not exists (
            select 1
              from public.worth_it_chat_conversations c
              join public.worth_it_chat_members m on m.conversation_id = c.id
             where c.id = target_conversation_id
               and c.conversation_type = 'group'
               and m.user_id = actor_id
        ) then
            return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
        end if;
    else
        return jsonb_build_object('success', false, 'code', 'INVALID_CHAT');
    end if;

    insert into public.worth_it_chat_notification_preferences
        (user_id, chat_key, notifications_enabled, updated_at)
    values (actor_id, p_chat_key, p_enabled, now())
    on conflict (user_id, chat_key)
    do update set notifications_enabled = excluded.notifications_enabled,
                  updated_at = now();

    return jsonb_build_object(
        'success', true,
        'chat_key', p_chat_key,
        'notifications_enabled', p_enabled
    );
end;
$$;

create or replace function public.create_worth_it_group_chat(p_title text, p_member_worth_it_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_id uuid := auth.uid();
    conversation uuid;
    member_id bigint;
    member_user uuid;
    clean_title text := nullif(btrim(coalesce(p_title, '')), '');
    requested_count integer := 0;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    if clean_title is null or char_length(clean_title) > 60 then
        return jsonb_build_object('success', false, 'code', 'INVALID_GROUP_TITLE');
    end if;

    requested_count := coalesce(cardinality(p_member_worth_it_ids), 0);

    -- The creator is also a member: 29 invited friends + creator = 30 total.
    if requested_count < 2 or requested_count > 29 then
        return jsonb_build_object('success', false, 'code', 'INVALID_GROUP_SIZE', 'max_members', 30);
    end if;

    insert into public.worth_it_chat_conversations(conversation_type, title, created_by)
    values ('group', clean_title, actor_id)
    returning id into conversation;

    insert into public.worth_it_chat_members(conversation_id, user_id)
    values (conversation, actor_id);

    foreach member_id in array p_member_worth_it_ids loop
        select user_id into member_user
          from public.worth_it_profiles
         where worth_it_id = member_id;

        if member_user is null or member_user = actor_id then
            raise exception 'Invalid group participant';
        end if;

        if not exists (
            select 1
              from public.worth_it_friends
             where (user_low_id = actor_id and user_high_id = member_user)
                or (user_low_id = member_user and user_high_id = actor_id)
        ) then
            raise exception 'Group participants must be your friends';
        end if;

        insert into public.worth_it_chat_members(conversation_id, user_id)
        values (conversation, member_user)
        on conflict do nothing;
    end loop;

    if (select count(*) from public.worth_it_chat_members where conversation_id = conversation) < 3 then
        raise exception 'Choose at least two friends for a group chat';
    end if;

    if (select count(*) from public.worth_it_chat_members where conversation_id = conversation) > 30 then
        raise exception 'A group chat can have no more than 30 members';
    end if;

    return jsonb_build_object('success', true, 'conversation_id', conversation);
end;
$$;

revoke all on function public.get_worth_it_chat_notification_preferences() from public, anon;
revoke all on function public.set_worth_it_chat_notifications(text, boolean) from public, anon;
revoke all on function public.create_worth_it_group_chat(text, bigint[]) from public, anon;

grant execute on function public.get_worth_it_chat_notification_preferences() to authenticated;
grant execute on function public.set_worth_it_chat_notifications(text, boolean) to authenticated;
grant execute on function public.create_worth_it_group_chat(text, bigint[]) to authenticated;

commit;
