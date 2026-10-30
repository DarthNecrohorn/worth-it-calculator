-- Worth It Chat: secure, random group invite links.
-- Run once in the Supabase SQL Editor AFTER worth-it-chat.sql and
-- worth-it-chat-notifications-and-member-limit.sql.
begin;

alter table public.worth_it_chat_conversations
    add column if not exists invite_token text;

-- Existing groups receive private, unpredictable links without changing their UUIDs.
update public.worth_it_chat_conversations
   set invite_token = lower(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
 where conversation_type = 'group' and invite_token is null;

create unique index if not exists worth_it_chat_group_invite_token_idx
    on public.worth_it_chat_conversations(invite_token)
    where invite_token is not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conname = 'worth_it_chat_group_invite_token_format'
           and conrelid = 'public.worth_it_chat_conversations'::regclass
    ) then
        alter table public.worth_it_chat_conversations
            add constraint worth_it_chat_group_invite_token_format
            check (
                (conversation_type = 'group' and invite_token is not null
                    and invite_token ~ '^[0-9a-f]{64}$')
                or
                (conversation_type <> 'group' and invite_token is null)
            ) not valid;
    end if;
end;
$$;

alter table public.worth_it_chat_conversations
    validate constraint worth_it_chat_group_invite_token_format;

create or replace function public.get_worth_it_chat_conversations()
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

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'type', c.conversation_type,
        'title', c.title,
        'created_at', c.created_at,
        'invite_token', case when c.conversation_type = 'group' then c.invite_token else null end,
        'members', case
            when c.conversation_type = 'global' then '[]'::jsonb
            else (
                select coalesce(jsonb_agg(jsonb_build_object(
                    'worth_it_id', p.worth_it_id,
                    'username', p.username,
                    'display_name', coalesce(p.display_name,p.username,'Worth It member'),
                    'avatar_url', p.avatar_url
                ) order by lower(coalesce(p.display_name,p.username,''))), '[]'::jsonb)
                from public.worth_it_chat_members cm
                join public.worth_it_profiles p on p.user_id = cm.user_id
                where cm.conversation_id = c.id and cm.user_id <> actor_id
            )
        end,
        'last_message', (
            select jsonb_build_object(
                'body', m.body, 'created_at', m.created_at,
                'sender_user_id', m.sender_user_id, 'media_type', m.media_type
            )
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
end;
$$;

create or replace function public.create_worth_it_group_chat(
    p_title text,
    p_member_worth_it_ids bigint[]
)
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
    generated_invite_token text := lower(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    if clean_title is null or char_length(clean_title) > 60 then
        return jsonb_build_object('success', false, 'code', 'INVALID_GROUP_TITLE');
    end if;

    requested_count := coalesce(cardinality(p_member_worth_it_ids), 0);
    if requested_count < 2 or requested_count > 29 then
        return jsonb_build_object('success', false, 'code', 'INVALID_GROUP_SIZE', 'max_members', 30);
    end if;

    insert into public.worth_it_chat_conversations(conversation_type, title, created_by, invite_token)
    values ('group', clean_title, actor_id, generated_invite_token)
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

    return jsonb_build_object(
        'success', true,
        'conversation_id', conversation,
        'invite_token', generated_invite_token
    );
end;
$$;

-- A shareable token reveals only the group name and member count before sign-in/join.
create or replace function public.get_worth_it_group_invite_preview(p_invite_token text)
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
    if p_invite_token is null or lower(p_invite_token) !~ '^[0-9a-f]{64}$' then
        return jsonb_build_object('success', false, 'code', 'INVITE_NOT_FOUND');
    end if;

    select jsonb_build_object(
        'success', true,
        'conversation_id', c.id,
        'title', c.title,
        'member_count', count(m.user_id)::integer,
        'is_member', coalesce(bool_or(m.user_id = actor_id), false),
        'is_full', count(m.user_id) >= 30
    )
    into result
    from public.worth_it_chat_conversations c
    left join public.worth_it_chat_members m on m.conversation_id = c.id
    where c.conversation_type = 'group'
      and c.invite_token = lower(p_invite_token)
    group by c.id;

    return coalesce(result, jsonb_build_object('success', false, 'code', 'INVITE_NOT_FOUND'));
end;
$$;

create or replace function public.accept_worth_it_group_invite(p_invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    target_id uuid;
    target_title text;
    member_count integer;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    if not exists (
        select 1
          from auth.users as verified_user
         where verified_user.id = actor_id
           and verified_user.email_confirmed_at is not null
    ) then
        raise exception 'Email confirmation required'
            using errcode = '42501';
    end if;

    if p_invite_token is null or lower(p_invite_token) !~ '^[0-9a-f]{64}$' then
        return jsonb_build_object('success', false, 'code', 'INVITE_NOT_FOUND');
    end if;

    select c.id, c.title
      into target_id, target_title
      from public.worth_it_chat_conversations c
     where c.conversation_type = 'group'
       and c.invite_token = lower(p_invite_token)
     for update;

    if target_id is null then
        return jsonb_build_object('success', false, 'code', 'INVITE_NOT_FOUND');
    end if;

    if exists (
        select 1 from public.worth_it_chat_members
         where conversation_id = target_id and user_id = actor_id
    ) then
        return jsonb_build_object(
            'success', true, 'already_member', true,
            'conversation_id', target_id, 'title', target_title,
            'invite_token', lower(p_invite_token)
        );
    end if;

    select count(*)::integer into member_count
      from public.worth_it_chat_members
     where conversation_id = target_id;

    if member_count >= 30 then
        return jsonb_build_object('success', false, 'code', 'GROUP_FULL', 'max_members', 30);
    end if;

    insert into public.worth_it_chat_members(conversation_id, user_id)
    values (target_id, actor_id)
    on conflict (conversation_id, user_id) do nothing;

    return jsonb_build_object(
        'success', true,
        'already_member', false,
        'conversation_id', target_id,
        'title', target_title,
        'invite_token', lower(p_invite_token)
    );
end;
$$;

revoke all on function public.get_worth_it_chat_conversations() from public, anon;
revoke all on function public.create_worth_it_group_chat(text, bigint[]) from public, anon;
revoke all on function public.get_worth_it_group_invite_preview(text) from public;
revoke all on function public.accept_worth_it_group_invite(text) from public, anon;

grant execute on function public.get_worth_it_chat_conversations() to authenticated;
grant execute on function public.create_worth_it_group_chat(text, bigint[]) to authenticated;
grant execute on function public.get_worth_it_group_invite_preview(text) to anon, authenticated;
grant execute on function public.accept_worth_it_group_invite(text) to authenticated;

commit;
