-- Require a verified email before joining a Worth It group via an invite link.
-- The invite preview remains publicly shareable; joining changes membership and
-- therefore requires the same verified-account gate as the rest of Community Chat.

begin;

create or replace function public.accept_worth_it_group_invite(p_invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
      from public.worth_it_chat_conversations as c
     where c.conversation_type = 'group'
       and c.invite_token = lower(p_invite_token)
     for update;

    if target_id is null then
        return jsonb_build_object('success', false, 'code', 'INVITE_NOT_FOUND');
    end if;

    if exists (
        select 1
          from public.worth_it_chat_members
         where conversation_id = target_id
           and user_id = actor_id
    ) then
        return jsonb_build_object(
            'success', true,
            'already_member', true,
            'conversation_id', target_id,
            'title', target_title,
            'invite_token', lower(p_invite_token)
        );
    end if;

    select count(*)::integer
      into member_count
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
$function$;

revoke all on function public.accept_worth_it_group_invite(text) from public, anon;
grant execute on function public.accept_worth_it_group_invite(text) to authenticated;

notify pgrst, 'reload schema';

commit;
