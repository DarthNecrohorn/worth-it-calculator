-- Install access-test RPC stubs only after chat message-actions migrations have run.
-- These preserve the production guard fragments that the private-media migration hardens.
\set ON_ERROR_STOP on

create or replace function public.get_worth_it_chat_messages(
  p_conversation_id uuid default null::uuid,
  p_limit integer default 100
) returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid := coalesce(p_conversation_id, '00000000-0000-4000-8000-000000000001'::uuid);
  target_type text;
begin
  select conversation_type into target_type
    from public.worth_it_chat_conversations where id = target_id;
  if target_type is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members
        where conversation_id = target_id and user_id = actor_id
    ) then
        return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
    end if;
  return '[]'::jsonb;
end;
$function$;

create or replace function public.get_worth_it_chat_conversations()
returns jsonb language plpgsql stable security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if not exists (
    select 1 from auth.users verified_user
    where verified_user.id = actor_id and verified_user.email_confirmed_at is not null
  ) then raise exception 'Email confirmation required' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'type',c.conversation_type)), '[]'::jsonb)
    into result
    from public.worth_it_chat_conversations c
    left join public.worth_it_chat_members mine
      on mine.conversation_id = c.id and mine.user_id = actor_id
    where (c.conversation_type in ('direct', 'group') and mine.user_id = actor_id)
       or c.conversation_type = 'global';
  return result;
end;
$function$;

create or replace function public.send_worth_it_chat_message(
  p_body text default '',
  p_conversation_id uuid default null,
  p_media_url text default null,
  p_media_type text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid := coalesce(p_conversation_id, '00000000-0000-4000-8000-000000000001'::uuid);
  target_type text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select conversation_type into target_type
    from public.worth_it_chat_conversations where id=target_id;
  if target_type is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
    ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;

    if target_type='direct' and not exists (
        select 1 from public.worth_it_chat_members a
        join public.worth_it_chat_members b on b.conversation_id=a.conversation_id and b.user_id<>a.user_id
        join public.worth_it_friends f on
            (f.user_low_id=a.user_id and f.user_high_id=b.user_id) or
            (f.user_low_id=b.user_id and f.user_high_id=a.user_id)
        where a.conversation_id=target_id and a.user_id=actor_id
    ) then return jsonb_build_object('success',false,'code','FRIENDS_ONLY'); end if;
  return jsonb_build_object('success',true);
end;
$function$;

create or replace function public.worth_it_chat_realtime_topic_authorized(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid;
begin
  if not exists (
    select 1 from auth.users verified_user
    where verified_user.id = actor_id and verified_user.email_confirmed_at is not null
  ) then raise exception 'Email confirmation required' using errcode = '42501'; end if;
  if actor_id is null or p_topic is null then return false; end if;
  if p_topic = 'worthit-chat:00000000-0000-4000-8000-000000000001' then return true; end if;
  if p_topic !~ '^worthit-chat:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  target_id := substring(p_topic from length('worthit-chat:') + 1)::uuid;
  return exists (
        select 1
          from public.worth_it_chat_members as member
         where member.conversation_id = target_id
           and member.user_id = actor_id
    );
end;
$function$;


-- Test doubles for the already-deployed voice object RPCs; the private-media
-- migration replaces these with exact message/conversation ownership checks.
create or replace function public.can_access_worth_it_chat_audio_object(
  p_conversation_id uuid, p_object_path text
) returns boolean language plpgsql stable security definer set search_path = public
as $
declare
  owner_id uuid := split_part(p_object_path,'/',1)::uuid;
begin
  return auth.uid() is not null
    and public.can_access_worth_it_chat_media(p_conversation_id)
    and exists (
      select 1 from public.worth_it_chat_members
       where conversation_id=p_conversation_id and user_id=owner_id
    );
end;
$;

create or replace function public.can_delete_worth_it_chat_audio_object(
  p_conversation_id uuid, p_object_path text
) returns boolean language sql stable security definer set search_path = public
as $ select auth.uid() is not null
  and p_object_path ~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+
  p_conversation_id uuid, p_query text, p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid := p_conversation_id;
  kind text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select conversation_type into kind from public.worth_it_chat_conversations where id=target_id;
  if kind is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
  if kind <> 'global' and not exists (
    select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
  ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;
  if kind = 'direct' and not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
  return '[]'::jsonb;
end;
$function$;
)
  and public.can_access_worth_it_chat_audio_object(p_conversation_id,p_object_path);
$;

create or replace function public.search_worth_it_chat_messages(
  p_conversation_id uuid, p_query text, p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid := p_conversation_id;
  kind text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select conversation_type into kind from public.worth_it_chat_conversations where id=target_id;
  if kind is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
  if kind <> 'global' and not exists (
    select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
  ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;
  if kind = 'direct' and not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
  return '[]'::jsonb;
end;
$function$;
