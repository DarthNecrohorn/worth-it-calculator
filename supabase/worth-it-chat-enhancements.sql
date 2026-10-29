-- Worth It Chat enhancements: private voice notes, message search and friend-only audio/video calls.
-- Apply once in the Supabase SQL editor after the existing Worth It chat/media scripts.
begin;

-- Voice notes live in a separate PRIVATE bucket. The existing public image/video bucket
-- is deliberately left unchanged.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worth-it-chat-audio',
  'worth-it-chat-audio',
  false,
  10485760,
  array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'];

-- Re-grant no table privileges here: upload, signed URL creation and deletion use the
-- service key only, after the user JWT and chat membership are validated by the API.

alter table public.worth_it_chat_messages
  drop constraint if exists worth_it_chat_messages_media_type_check;
alter table public.worth_it_chat_messages
  add constraint worth_it_chat_messages_media_type_check
  check (media_type is null or media_type in ('image','gif','video','audio'));

-- Extend the current message RPC without replacing unrelated moderation, cooldown,
-- duplicate prevention, history and receipt logic.
do $migration$
declare
  current_definition text;
  updated_definition text;
  old_with_video text := 'media_kind not in (''image'',''gif'',''video'')';
  old_without_video text := 'media_kind not in (''image'',''gif'')';
  new_condition text := 'media_kind not in (''image'',''gif'',''video'',''audio'')';
begin
  current_definition := replace(
    pg_get_functiondef('public.send_worth_it_chat_message(text,uuid,text,text)'::regprocedure),
    E'\r', ''
  );
  if position(new_condition in current_definition) > 0 then
    updated_definition := current_definition;
  elsif position(old_with_video in current_definition) > 0 then
    updated_definition := replace(current_definition, old_with_video, new_condition);
  elsif position(old_without_video in current_definition) > 0 then
    updated_definition := replace(current_definition, old_without_video, new_condition);
  else
    raise exception 'Could not safely extend send_worth_it_chat_message media types. Review the live function before retrying.';
  end if;

  -- Audio identifiers are opaque references into the private bucket and must be tied
  -- to this conversation and to the authenticated sender. Keep public media URL rules.
  if position('worthit-audio:' in updated_definition) = 0 then
    updated_definition := replace(
      updated_definition,
      $old$
    if p_media_url is not null and (
        p_media_url !~ '^https://[^[:space:]]+$'
        or p_media_url !~ '^https://[^/]+/storage/v1/object/public/worth-it-chat-media/'
    ) then return jsonb_build_object('success',false,'code','INVALID_MEDIA_URL'); end if;
$old$,
      $new$
    if p_media_url is not null and media_kind = 'audio' then
        if p_media_url !~ ('^worthit-audio:' || target_id::text || ':' || actor_id::text || '/[A-Za-z0-9._/-]+$')
           or p_media_url ~ '(^|/)\.\.(/|$)'
        then return jsonb_build_object('success',false,'code','INVALID_MEDIA_URL'); end if;
    elsif p_media_url is not null and (
        p_media_url !~ '^https://[^[:space:]]+$'
        or p_media_url !~ '^https://[^/]+/storage/v1/object/public/worth-it-chat-media/'
    ) then return jsonb_build_object('success',false,'code','INVALID_MEDIA_URL'); end if;
$new$
    );
    if position('worthit-audio:' in updated_definition) = 0 then
      raise exception 'Could not safely add private audio URL validation to send_worth_it_chat_message.';
    end if;
  end if;
  execute updated_definition;
end
$migration$;

create or replace function public.can_access_worth_it_chat_media(p_conversation_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  kind text;
begin
  if actor_id is null or p_conversation_id is null then return false; end if;
  select conversation_type into kind
    from public.worth_it_chat_conversations where id = p_conversation_id;
  if kind = 'global' then return true; end if;
  if kind = 'group' then
    return exists (
      select 1 from public.worth_it_chat_members
       where conversation_id = p_conversation_id and user_id = actor_id
    );
  end if;
  if kind = 'direct' then
    return exists (
      select 1
        from public.worth_it_chat_members mine
        join public.worth_it_chat_members peer
          on peer.conversation_id = mine.conversation_id and peer.user_id <> mine.user_id
        join public.worth_it_friends friends
          on (friends.user_low_id = mine.user_id and friends.user_high_id = peer.user_id)
          or (friends.user_low_id = peer.user_id and friends.user_high_id = mine.user_id)
       where mine.conversation_id = p_conversation_id
         and mine.user_id = actor_id
         and (select count(*) from public.worth_it_chat_members all_members
               where all_members.conversation_id = p_conversation_id) = 2
    );
  end if;
  return false;
end;
$$;

create or replace function public.can_access_worth_it_chat_audio_object(
  p_conversation_id uuid,
  p_object_path text
)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  kind text;
  owner_id uuid;
begin
  if actor_id is null or p_conversation_id is null or p_object_path is null
     or p_object_path !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9._-]+$' then
    return false;
  end if;
  owner_id := split_part(p_object_path, '/', 1)::uuid;
  if not public.can_access_worth_it_chat_media(p_conversation_id) then return false; end if;
  select conversation_type into kind
    from public.worth_it_chat_conversations where id = p_conversation_id;
  if kind = 'global' then
    return exists (select 1 from public.worth_it_profiles where user_id = owner_id);
  end if;
  return exists (
    select 1 from public.worth_it_chat_members
     where conversation_id = p_conversation_id and user_id = owner_id
  );
end;
$$;

create or replace function public.can_delete_worth_it_chat_audio_object(
  p_conversation_id uuid,
  p_object_path text
)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and p_object_path ~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$')
     and public.can_access_worth_it_chat_audio_object(p_conversation_id, p_object_path);
$$;

create table if not exists public.worth_it_chat_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.worth_it_chat_conversations(id) on delete cascade,
  caller_user_id uuid not null references auth.users(id) on delete cascade,
  callee_user_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','rejected','ended','missed','failed')),
  offer jsonb not null,
  answer jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint worth_it_chat_calls_distinct_users check (caller_user_id <> callee_user_id)
);
create index if not exists worth_it_chat_calls_callee_pending_idx
  on public.worth_it_chat_calls(callee_user_id, created_at desc) where status = 'ringing';
create unique index if not exists worth_it_chat_calls_one_active_per_conversation_idx
  on public.worth_it_chat_calls(conversation_id) where status in ('ringing','accepted');
create unique index if not exists worth_it_chat_calls_one_active_per_callee_idx
  on public.worth_it_chat_calls(callee_user_id) where status in ('ringing','accepted');

create table if not exists public.worth_it_chat_call_signals (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.worth_it_chat_calls(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type = 'candidate'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint worth_it_chat_call_signal_size check (octet_length(payload::text) <= 12000)
);
create index if not exists worth_it_chat_call_signals_call_idx
  on public.worth_it_chat_call_signals(call_id, id);
create index if not exists worth_it_chat_calls_caller_active_idx
  on public.worth_it_chat_calls(caller_user_id)
  where status in ('ringing','accepted');

alter table public.worth_it_chat_calls enable row level security;
alter table public.worth_it_chat_call_signals enable row level security;
revoke all on public.worth_it_chat_calls from public, anon, authenticated;
revoke all on public.worth_it_chat_call_signals from public, anon, authenticated;

create or replace function public.start_worth_it_chat_call(
  p_conversation_id uuid,
  p_call_type text,
  p_offer jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  peer_id uuid;
  kind text;
  new_call_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if coalesce(p_call_type,'') not in ('audio','video') or jsonb_typeof(p_offer) <> 'object'
     or octet_length(p_offer::text) > 200000 then
    return jsonb_build_object('success',false,'code','INVALID_CALL_OFFER');
  end if;
  select conversation_type into kind from public.worth_it_chat_conversations
   where id = p_conversation_id;
  if kind <> 'direct' or (select count(*) from public.worth_it_chat_members where conversation_id = p_conversation_id) <> 2
     or not exists (select 1 from public.worth_it_chat_members where conversation_id = p_conversation_id and user_id = actor_id)
     or not public.can_access_worth_it_chat_media(p_conversation_id) then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
  select user_id into peer_id from public.worth_it_chat_members
   where conversation_id = p_conversation_id and user_id <> actor_id;
  if peer_id is null or peer_id = actor_id then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;

  -- Lock both users in stable order to prevent concurrent calls across separate chats.
  perform pg_advisory_xact_lock(hashtextextended('worth-it-user-call:' || least(actor_id::text, peer_id::text), 0));
  perform pg_advisory_xact_lock(hashtextextended('worth-it-user-call:' || greatest(actor_id::text, peer_id::text), 0));

  update public.worth_it_chat_calls
     set status = 'missed', ended_at = now(), updated_at = now()
   where status = 'ringing' and created_at < now() - interval '45 seconds'
     and (caller_user_id in (actor_id,peer_id) or callee_user_id in (actor_id,peer_id));
  update public.worth_it_chat_calls
     set status = 'ended', ended_at = now(), updated_at = now()
   where status = 'accepted' and updated_at < now() - interval '3 hours'
     and (caller_user_id in (actor_id,peer_id) or callee_user_id in (actor_id,peer_id));
  if exists (select 1 from public.worth_it_chat_calls
      where status in ('ringing','accepted')
        and (conversation_id = p_conversation_id or caller_user_id in (actor_id,peer_id)
             or callee_user_id in (actor_id,peer_id))) then
    return jsonb_build_object('success',false,'code','CALL_ALREADY_ACTIVE');
  end if;
  insert into public.worth_it_chat_calls(conversation_id,caller_user_id,callee_user_id,call_type,offer)
  values(p_conversation_id,actor_id,peer_id,p_call_type,p_offer)
  returning id into new_call_id;
  return jsonb_build_object('success',true,'call_id',new_call_id,'status','ringing');
exception when unique_violation then
  return jsonb_build_object('success',false,'code','CALL_ALREADY_ACTIVE');
end;
$$;

create or replace function public.get_worth_it_incoming_chat_call()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  update public.worth_it_chat_calls
     set status = 'missed', ended_at = now(), updated_at = now()
   where status = 'ringing' and created_at < now() - interval '45 seconds'
     and (caller_user_id = actor_id or callee_user_id = actor_id);
  update public.worth_it_chat_calls
     set status = 'ended', ended_at = now(), updated_at = now()
   where status = 'accepted' and updated_at < now() - interval '3 hours'
     and (caller_user_id = actor_id or callee_user_id = actor_id);
  select jsonb_build_object(
    'success', true,
    'call', jsonb_build_object(
      'id', c.id,
      'conversation_id', c.conversation_id,
      'caller_user_id', c.caller_user_id,
      'caller_worth_it_id', p.worth_it_id,
      'caller_name', coalesce(p.display_name, p.username, 'Worth It member'),
      'caller_avatar_url', p.avatar_url,
      'call_type', c.call_type,
      'status', c.status,
      'offer', c.offer,
      'created_at', c.created_at
    )
  ) into result
  from public.worth_it_chat_calls c
  join public.worth_it_chat_members mine on mine.conversation_id = c.conversation_id and mine.user_id = actor_id
  join public.worth_it_chat_members peer on peer.conversation_id = c.conversation_id and peer.user_id = c.caller_user_id
  join public.worth_it_profiles p on p.user_id = c.caller_user_id
  where c.callee_user_id = actor_id and c.status = 'ringing'
    and c.created_at >= now() - interval '45 seconds'
    and public.can_access_worth_it_chat_media(c.conversation_id)
  order by c.created_at desc limit 1;
  return coalesce(result, jsonb_build_object('success',true,'call',null));
end;
$$;

create or replace function public.get_worth_it_chat_call_state(
  p_call_id uuid,
  p_after_signal_id bigint default 0
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  call_row public.worth_it_chat_calls%rowtype;
  signals jsonb;
  last_signal_id bigint := greatest(0, coalesce(p_after_signal_id,0));
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select * into call_row from public.worth_it_chat_calls where id = p_call_id;
  if not found or actor_id not in (call_row.caller_user_id, call_row.callee_user_id) then
    return jsonb_build_object('success',false,'code','CALL_NOT_FOUND');
  end if;
  if not public.can_access_worth_it_chat_media(call_row.conversation_id) then
    update public.worth_it_chat_calls set status='ended',ended_at=now(),updated_at=now()
     where id=p_call_id and status in ('ringing','accepted');
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
  if call_row.status = 'ringing' and call_row.created_at < now() - interval '45 seconds' then
    update public.worth_it_chat_calls set status='missed',ended_at=now(),updated_at=now()
     where id=p_call_id and status='ringing';
    call_row.status := 'missed';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'signal_type',s.signal_type,'payload',s.payload,'sender_user_id',s.sender_user_id
    ) order by s.id), '[]'::jsonb)
    into signals
    from public.worth_it_chat_call_signals s
   where s.call_id = p_call_id and s.sender_user_id <> actor_id and s.id > last_signal_id;
  return jsonb_build_object(
    'success',true,'id',call_row.id,'conversation_id',call_row.conversation_id,
    'caller_user_id',call_row.caller_user_id,'callee_user_id',call_row.callee_user_id,
    'call_type',call_row.call_type,'status',call_row.status,'offer',call_row.offer,
    'answer',call_row.answer,'signals',signals
  );
end;
$$;

create or replace function public.respond_worth_it_chat_call(
  p_call_id uuid,
  p_action text,
  p_answer jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  call_row public.worth_it_chat_calls%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select * into call_row from public.worth_it_chat_calls where id=p_call_id for update;
  if not found or actor_id not in (call_row.caller_user_id,call_row.callee_user_id) then
    return jsonb_build_object('success',false,'code','CALL_NOT_FOUND');
  end if;
  if not public.can_access_worth_it_chat_media(call_row.conversation_id) then
    update public.worth_it_chat_calls set status='ended',ended_at=now(),updated_at=now()
     where id=p_call_id and status in ('ringing','accepted');
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
  if p_action = 'accept' then
    if actor_id <> call_row.callee_user_id or call_row.status <> 'ringing'
       or call_row.created_at < now() - interval '45 seconds'
       or jsonb_typeof(p_answer) <> 'object' or octet_length(p_answer::text) > 200000 then
      return jsonb_build_object('success',false,'code','CALL_CANNOT_BE_ACCEPTED');
    end if;
    update public.worth_it_chat_calls set status='accepted',answer=p_answer,updated_at=now()
     where id=p_call_id;
    return jsonb_build_object('success',true,'status','accepted');
  elsif p_action = 'reject' then
    if actor_id <> call_row.callee_user_id or call_row.status <> 'ringing' then
      return jsonb_build_object('success',false,'code','CALL_CANNOT_BE_REJECTED');
    end if;
    update public.worth_it_chat_calls set status='rejected',ended_at=now(),updated_at=now()
     where id=p_call_id;
    return jsonb_build_object('success',true,'status','rejected');
  elsif p_action = 'end' then
    if call_row.status not in ('ringing','accepted') then
      return jsonb_build_object('success',true,'status',call_row.status);
    end if;
    update public.worth_it_chat_calls set status='ended',ended_at=now(),updated_at=now()
     where id=p_call_id;
    return jsonb_build_object('success',true,'status','ended');
  end if;
  return jsonb_build_object('success',false,'code','INVALID_CALL_ACTION');
end;
$$;

create or replace function public.send_worth_it_chat_call_signal(
  p_call_id uuid,
  p_signal_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  call_row public.worth_it_chat_calls%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_signal_type <> 'candidate' or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 12000 then
    return jsonb_build_object('success',false,'code','INVALID_CALL_SIGNAL');
  end if;
  select * into call_row from public.worth_it_chat_calls where id=p_call_id;
  if not found or actor_id not in (call_row.caller_user_id,call_row.callee_user_id)
     or call_row.status not in ('ringing','accepted') then
    return jsonb_build_object('success',false,'code','CALL_NOT_ACTIVE');
  end if;
  if not public.can_access_worth_it_chat_media(call_row.conversation_id) then
    update public.worth_it_chat_calls set status='ended',ended_at=now(),updated_at=now()
     where id=p_call_id and status in ('ringing','accepted');
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
  insert into public.worth_it_chat_call_signals(call_id,sender_user_id,signal_type,payload)
  values(p_call_id,actor_id,p_signal_type,p_payload);
  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.search_worth_it_chat_messages(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 100
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  target_id uuid := p_conversation_id;
  kind text;
  term text := btrim(coalesce(p_query, ''));
  normalized_term text := lower(btrim(regexp_replace(coalesce(p_query, ''), '[[:space:]]+', ' ', 'g')));
  result jsonb;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if target_id is null or char_length(term) < 2 or char_length(term) > 100 then
    return jsonb_build_object('success',false,'code','INVALID_SEARCH');
  end if;
  select conversation_type into kind from public.worth_it_chat_conversations where id=target_id;
  if kind is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
  if kind <> 'global' and not exists (
    select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
  ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;
  if kind = 'direct' and not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
  select coalesce(jsonb_agg(row_data order by message_id desc),'[]'::jsonb) into result
  from (
    select m.id as message_id, jsonb_build_object(
      'id',m.id,
      'body',case when m.deleted_at is not null or hidden.message_id is not null then '' else m.body end,
      'media_url',case when m.deleted_at is not null or hidden.message_id is not null then null else m.media_url end,
      'media_type',case when m.deleted_at is not null or hidden.message_id is not null then null else m.media_type end,
      'is_deleted',m.deleted_at is not null,
      'is_hidden_by_me',hidden.message_id is not null,
      'deleted_by_display_name',case
        when hidden.message_id is not null then coalesce(actor_profile.display_name,actor_profile.username,'Worth It member')
        when m.deleted_by_user_id is not null then coalesce(deleted_by_profile.display_name,deleted_by_profile.username,'Worth It member')
        else null end,
      'filtered_reason',case when m.deleted_at is not null or hidden.message_id is not null then null else m.filtered_reason end,
      'created_at',m.created_at,'sender_user_id',m.sender_user_id,
      'worth_it_id',p.worth_it_id,'username',p.username,
      'display_name',coalesce(p.display_name,p.username,'Worth It member'),'avatar_url',p.avatar_url
    ) as row_data
    from public.worth_it_chat_messages m
    join public.worth_it_profiles p on p.user_id=m.sender_user_id
    left join public.worth_it_chat_message_hides hidden on hidden.message_id=m.id and hidden.user_id=actor_id
    left join public.worth_it_profiles actor_profile on actor_profile.user_id=actor_id
    left join public.worth_it_profiles deleted_by_profile on deleted_by_profile.user_id=m.deleted_by_user_id
    where m.conversation_id=target_id
      and left(lower(regexp_replace(ltrim(m.body), '[[:space:]]+', ' ', 'g')), char_length(normalized_term)) = normalized_term
      and m.created_at > coalesce((select hc.cleared_at from public.worth_it_chat_history_clears hc
                                   where hc.user_id=actor_id and hc.conversation_id=target_id), '-infinity'::timestamptz)
      and hidden.message_id is null and m.deleted_at is null
    order by m.id desc limit greatest(1,least(coalesce(p_limit,100),100))
  ) matched;
  return result;
end;
$$;

-- Do not expose backing tables directly. All actions check auth.uid(), conversation membership,
-- and for direct calls/messages the current accepted friendship relationship.
revoke all on function public.can_access_worth_it_chat_media(uuid) from public, anon;
revoke all on function public.can_access_worth_it_chat_audio_object(uuid,text) from public, anon;
revoke all on function public.can_delete_worth_it_chat_audio_object(uuid,text) from public, anon;
revoke all on function public.search_worth_it_chat_messages(uuid,text,integer) from public, anon;
revoke all on function public.start_worth_it_chat_call(uuid,text,jsonb) from public, anon;
revoke all on function public.get_worth_it_incoming_chat_call() from public, anon;
revoke all on function public.get_worth_it_chat_call_state(uuid,bigint) from public, anon;
revoke all on function public.respond_worth_it_chat_call(uuid,text,jsonb) from public, anon;
revoke all on function public.send_worth_it_chat_call_signal(uuid,text,jsonb) from public, anon;
grant execute on function public.can_access_worth_it_chat_media(uuid) to authenticated;
grant execute on function public.can_access_worth_it_chat_audio_object(uuid,text) to authenticated;
grant execute on function public.can_delete_worth_it_chat_audio_object(uuid,text) to authenticated;
grant execute on function public.search_worth_it_chat_messages(uuid,text,integer) to authenticated;
grant execute on function public.start_worth_it_chat_call(uuid,text,jsonb) to authenticated;
grant execute on function public.get_worth_it_incoming_chat_call() to authenticated;
grant execute on function public.get_worth_it_chat_call_state(uuid,bigint) to authenticated;
grant execute on function public.respond_worth_it_chat_call(uuid,text,jsonb) to authenticated;
grant execute on function public.send_worth_it_chat_call_signal(uuid,text,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
