-- Worth It Community Chat: make image/GIF/video objects private without changing
-- the stable media URLs already stored in worth_it_chat_messages.
-- Apply after worth-it-chat-media-limits.sql, worth-it-chat-video-media.sql,
-- worth-it-chat-enhancements.sql, worth-it-chat-message-actions.sql and
-- worth-it-chat-message-delete-constraint.sql.
begin;

do $bucket$
begin
  if not exists (select 1 from storage.buckets where id = 'worth-it-chat-media') then
    raise exception 'The worth-it-chat-media bucket does not exist. Apply the existing chat media migrations first.';
  end if;
end
$bucket$;

-- A private bucket still uses storage.objects RLS for reads. Remove the old
-- public SELECT policy before changing the bucket visibility; otherwise that
-- policy could continue granting anonymous downloads from this bucket.
drop policy if exists "Worth It chat media read" on storage.objects;

update storage.buckets
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif',
      'video/mp4','video/webm'
    ]
where id = 'worth-it-chat-media';

-- Direct object reads remain unavailable. The Edge API creates signed URLs only
-- after the caller is verified as a current member of the exact conversation.
create or replace function public.can_access_worth_it_chat_media_object(
  p_conversation_id uuid,
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
  expected_suffix text;
begin
  if actor_id is null or p_conversation_id is null or p_object_path is null
     or p_object_path !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,254}$'
     or p_object_path ~ '(^|/)\.\.(/|$)' then
    return false;
  end if;

  owner_id := split_part(p_object_path, '/', 1)::uuid;
  expected_suffix := '/storage/v1/object/public/worth-it-chat-media/' || p_object_path;

  if not public.can_access_worth_it_chat_media(p_conversation_id) then
    return false;
  end if;

  -- Tie the object to a live message from its actual uploader in this exact
  -- conversation. This blocks URL/path replay across other private conversations.
  return exists (
    select 1
      from public.worth_it_chat_messages m
     where m.conversation_id = p_conversation_id
       and m.sender_user_id = owner_id
       and m.media_type in ('image','gif','video')
       and m.media_url is not null
       and right(m.media_url, char_length(expected_suffix)) = expected_suffix
       and m.deleted_at is null
  );
end;
$$;

create or replace function public.can_delete_worth_it_chat_media_object(
  p_conversation_id uuid,
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
  expected_suffix text;
begin
  if actor_id is null or p_conversation_id is null or p_object_path is null
     or p_object_path !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,254}$'
     or p_object_path ~ '(^|/)\.\.(/|$)' then
    return false;
  end if;

  owner_id := split_part(p_object_path, '/', 1)::uuid;
  if actor_id <> owner_id then
    return false;
  end if;

  expected_suffix := '/storage/v1/object/public/worth-it-chat-media/' || p_object_path;
  if not public.can_access_worth_it_chat_media(p_conversation_id) then
    return false;
  end if;

  -- A deleted message remains as a tombstone; allow its owner to finish storage
  -- cleanup, but never allow deleting another member's attachment.
  return exists (
    select 1
      from public.worth_it_chat_messages m
     where m.conversation_id = p_conversation_id
       and m.sender_user_id = owner_id
       and m.media_type in ('image','gif','video')
       and m.media_url is not null
       and right(m.media_url, char_length(expected_suffix)) = expected_suffix
  );
end;
$$;

revoke all on function public.can_access_worth_it_chat_media_object(uuid,text) from public, anon;
revoke all on function public.can_delete_worth_it_chat_media_object(uuid,text) from public, anon;
grant execute on function public.can_access_worth_it_chat_media_object(uuid,text) to authenticated;
grant execute on function public.can_delete_worth_it_chat_media_object(uuid,text) to authenticated;


-- Audio object references are opaque message references, not just member-owned
-- filenames. Tie every signed URL to the exact live message, conversation and
-- uploader so a path cannot be replayed across different chats.
create or replace function public.can_access_worth_it_chat_audio_object(
  p_conversation_id uuid,
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
  expected_reference text;
begin
  if actor_id is null
     or p_conversation_id is null
     or p_object_path is null
     or p_object_path !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,254}

-- Enforce one consistent access contract for every chat entry point:
-- confirmed email + global access, group membership, or a current friendship
-- in a two-person direct conversation.
do $chat_access$
declare
  current_definition text;
  updated_definition text;

  old_verified_guard text := '  if actor_id is null or p_conversation_id is null then return false; end if;';
  new_verified_guard text := $new$
  if actor_id is null or p_conversation_id is null then return false; end if;
  if not exists (
    select 1
      from auth.users verified_user
     where verified_user.id = actor_id
       and verified_user.email_confirmed_at is not null
  ) then return false; end if;
$new$;

  old_message_guard text := $old$
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members
        where conversation_id = target_id and user_id = actor_id
    ) then
        return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
    end if;
$old$;
  new_message_guard text := $new$
    if not public.can_access_worth_it_chat_media(target_id) then
        return jsonb_build_object(
            'success', false,
            'code', case when target_type = 'direct' then 'FRIENDS_ONLY' else 'NOT_A_CHAT_MEMBER' end
        );
    end if;
$new$;

  old_send_guard text := $old$
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
$old$;
  new_send_guard text := $new$
    if not public.can_access_worth_it_chat_media(target_id) then
        if target_type = 'direct' then
            return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
        end if;
        return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER');
    end if;
$new$;

  old_conversation_filter text := $old$
    where (c.conversation_type in ('direct', 'group') and mine.user_id = actor_id)
       or c.conversation_type = 'global';
$old$;
  new_conversation_filter text := $new$
    where (
        (c.conversation_type = 'group' and mine.user_id = actor_id)
        or (
            c.conversation_type = 'direct'
            and mine.user_id = actor_id
            and public.can_access_worth_it_chat_media(c.id)
        )
        or c.conversation_type = 'global'
    );
$new$;

  old_realtime_guard text := $old$
  return exists (
        select 1
          from public.worth_it_chat_members as member
         where member.conversation_id = target_id
           and member.user_id = actor_id
    );
$old$;
  new_realtime_guard text := $new$
  return public.can_access_worth_it_chat_media(target_id);
$new$;

  old_search_guard text := $old$
  if kind <> 'global' and not exists (
    select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
  ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;
  if kind = 'direct' and not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
$old$;
  new_search_guard text := $new$
  if not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object(
      'success',false,
      'code',case when kind = 'direct' then 'FRIENDS_ONLY' else 'NOT_A_CHAT_MEMBER' end
    );
  end if;
$new$;
begin
  current_definition := replace(
    pg_get_functiondef('public.can_access_worth_it_chat_media(uuid)'::regprocedure),
    E'\r', ''
  );
  if position(new_verified_guard in current_definition) = 0 then
    if position(old_verified_guard in current_definition) = 0 then
      raise exception 'Could not locate the current chat-media access guard.';
    end if;
    updated_definition := replace(current_definition, old_verified_guard, new_verified_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.get_worth_it_chat_messages(uuid,integer)'::regprocedure),
    E'\r', ''
  );
  if position(new_message_guard in current_definition) = 0 then
    if position(old_message_guard in current_definition) = 0 then
      raise exception 'Could not safely harden get_worth_it_chat_messages.';
    end if;
    updated_definition := replace(current_definition, old_message_guard, new_message_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.send_worth_it_chat_message(text,uuid,text,text)'::regprocedure),
    E'\r', ''
  );
  if position(new_send_guard in current_definition) = 0 then
    if position(old_send_guard in current_definition) = 0 then
      raise exception 'Could not safely harden send_worth_it_chat_message.';
    end if;
    updated_definition := replace(current_definition, old_send_guard, new_send_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.get_worth_it_chat_conversations()'::regprocedure),
    E'\r', ''
  );
  if position(new_conversation_filter in current_definition) = 0 then
    if position(old_conversation_filter in current_definition) = 0 then
      raise exception 'Could not safely harden get_worth_it_chat_conversations.';
    end if;
    updated_definition := replace(current_definition, old_conversation_filter, new_conversation_filter);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.worth_it_chat_realtime_topic_authorized(text)'::regprocedure),
    E'\r', ''
  );
  if position(new_realtime_guard in current_definition) = 0 then
    if position(old_realtime_guard in current_definition) = 0 then
      raise exception 'Could not safely harden worth_it_chat_realtime_topic_authorized.';
    end if;
    updated_definition := replace(current_definition, old_realtime_guard, new_realtime_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.search_worth_it_chat_messages(uuid,text,integer)'::regprocedure),
    E'\r', ''
  );
  if position(new_search_guard in current_definition) = 0 then
    if position(old_search_guard in current_definition) = 0 then
      raise exception 'Could not safely harden search_worth_it_chat_messages.';
    end if;
    updated_definition := replace(current_definition, old_search_guard, new_search_guard);
    execute updated_definition;
  end if;
end
$chat_access$;


-- Group invite links remain previewable by their unguessable token, but joining
-- a group requires the same confirmed-email state as all other chat actions.
do $chat_group_invite_access$
declare
  current_definition text;
  updated_definition text;
  old_guard text := $old$
    if actor_id is null then
        raise exception 'Authentication required';
    end if;
$old$;
  new_guard text := $new$
    if actor_id is null then
        raise exception 'Authentication required';
    end if;
    if not exists (
        select 1
          from auth.users verified_user
         where verified_user.id = actor_id
           and verified_user.email_confirmed_at is not null
    ) then
        raise exception 'Email confirmation required'
            using errcode = '42501';
    end if;
$new$;
begin
  current_definition := replace(
    pg_get_functiondef('public.accept_worth_it_group_invite(text)'::regprocedure),
    E'\r', ''
  );
  if position('email_confirmed_at is not null' in current_definition) = 0 then
    if position(old_guard in current_definition) = 0 then
      raise exception 'Could not safely add the confirmed-email guard to accept_worth_it_group_invite.';
    end if;
    updated_definition := replace(current_definition, old_guard, new_guard);
    execute updated_definition;
  end if;
end
$chat_group_invite_access$;


-- The existing message-deletion RPC clears media_url immediately. Keep the stored
-- URL and media_type on the internal tombstone row so the owner's API DELETE can
-- still prove which object belongs to that message. Chat read RPCs already return
-- null media fields for deleted messages, so the URL is never shown in the UI.
do $migration$
declare
  current_definition text;
  updated_definition text;
  old_assignment text := E'         media_url = null,\n         media_type = null,\n';
begin
  current_definition := replace(
    pg_get_functiondef('public.delete_worth_it_chat_message(bigint)'::regprocedure),
    E'\r', ''
  );

  if position(old_assignment in current_definition) > 0 then
    updated_definition := replace(current_definition, old_assignment, '');
    updated_definition := replace(
      updated_definition,
      '-- Purge the original text and public media URL, while retaining the small',
      '-- Purge the original text while retaining the private media reference in the small'
    );
  elsif position('media_url = null' in current_definition) = 0
        and position('media_type = null' in current_definition) = 0 then
    -- Already migrated: leave the current function untouched.
    updated_definition := current_definition;
  else
    raise exception 'Could not safely preserve deleted chat media references. Review delete_worth_it_chat_message before applying this migration.';
  end if;

  execute updated_definition;
end
$migration$;

notify pgrst, 'reload schema';
commit;

     or p_object_path ~ '(^|/)\.\.(/|$)' then
    return false;
  end if;

  owner_id := split_part(p_object_path, '/', 1)::uuid;
  expected_reference := 'worthit-audio:' || p_conversation_id::text || ':' || p_object_path;

  if not public.can_access_worth_it_chat_media(p_conversation_id) then
    return false;
  end if;

  return exists (
    select 1
      from public.worth_it_chat_messages m
     where m.conversation_id = p_conversation_id
       and m.sender_user_id = owner_id
       and m.media_type = 'audio'
       and m.media_url = expected_reference
       and m.deleted_at is null
  );
end;
$;

create or replace function public.can_delete_worth_it_chat_audio_object(
  p_conversation_id uuid,
  p_object_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
  expected_reference text;
begin
  if actor_id is null
     or p_conversation_id is null
     or p_object_path is null
     or p_object_path !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,254}

-- Enforce one consistent access contract for every chat entry point:
-- confirmed email + global access, group membership, or a current friendship
-- in a two-person direct conversation.
do $chat_access$
declare
  current_definition text;
  updated_definition text;

  old_verified_guard text := '  if actor_id is null or p_conversation_id is null then return false; end if;';
  new_verified_guard text := $new$
  if actor_id is null or p_conversation_id is null then return false; end if;
  if not exists (
    select 1
      from auth.users verified_user
     where verified_user.id = actor_id
       and verified_user.email_confirmed_at is not null
  ) then return false; end if;
$new$;

  old_message_guard text := $old$
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members
        where conversation_id = target_id and user_id = actor_id
    ) then
        return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
    end if;
$old$;
  new_message_guard text := $new$
    if not public.can_access_worth_it_chat_media(target_id) then
        return jsonb_build_object(
            'success', false,
            'code', case when target_type = 'direct' then 'FRIENDS_ONLY' else 'NOT_A_CHAT_MEMBER' end
        );
    end if;
$new$;

  old_send_guard text := $old$
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
$old$;
  new_send_guard text := $new$
    if not public.can_access_worth_it_chat_media(target_id) then
        if target_type = 'direct' then
            return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
        end if;
        return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER');
    end if;
$new$;

  old_conversation_filter text := $old$
    where (c.conversation_type in ('direct', 'group') and mine.user_id = actor_id)
       or c.conversation_type = 'global';
$old$;
  new_conversation_filter text := $new$
    where (
        (c.conversation_type = 'group' and mine.user_id = actor_id)
        or (
            c.conversation_type = 'direct'
            and mine.user_id = actor_id
            and public.can_access_worth_it_chat_media(c.id)
        )
        or c.conversation_type = 'global'
    );
$new$;

  old_realtime_guard text := $old$
  return exists (
        select 1
          from public.worth_it_chat_members as member
         where member.conversation_id = target_id
           and member.user_id = actor_id
    );
$old$;
  new_realtime_guard text := $new$
  return public.can_access_worth_it_chat_media(target_id);
$new$;

  old_search_guard text := $old$
  if kind <> 'global' and not exists (
    select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
  ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;
  if kind = 'direct' and not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
$old$;
  new_search_guard text := $new$
  if not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object(
      'success',false,
      'code',case when kind = 'direct' then 'FRIENDS_ONLY' else 'NOT_A_CHAT_MEMBER' end
    );
  end if;
$new$;
begin
  current_definition := replace(
    pg_get_functiondef('public.can_access_worth_it_chat_media(uuid)'::regprocedure),
    E'\r', ''
  );
  if position(new_verified_guard in current_definition) = 0 then
    if position(old_verified_guard in current_definition) = 0 then
      raise exception 'Could not locate the current chat-media access guard.';
    end if;
    updated_definition := replace(current_definition, old_verified_guard, new_verified_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.get_worth_it_chat_messages(uuid,integer)'::regprocedure),
    E'\r', ''
  );
  if position(new_message_guard in current_definition) = 0 then
    if position(old_message_guard in current_definition) = 0 then
      raise exception 'Could not safely harden get_worth_it_chat_messages.';
    end if;
    updated_definition := replace(current_definition, old_message_guard, new_message_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.send_worth_it_chat_message(text,uuid,text,text)'::regprocedure),
    E'\r', ''
  );
  if position(new_send_guard in current_definition) = 0 then
    if position(old_send_guard in current_definition) = 0 then
      raise exception 'Could not safely harden send_worth_it_chat_message.';
    end if;
    updated_definition := replace(current_definition, old_send_guard, new_send_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.get_worth_it_chat_conversations()'::regprocedure),
    E'\r', ''
  );
  if position(new_conversation_filter in current_definition) = 0 then
    if position(old_conversation_filter in current_definition) = 0 then
      raise exception 'Could not safely harden get_worth_it_chat_conversations.';
    end if;
    updated_definition := replace(current_definition, old_conversation_filter, new_conversation_filter);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.worth_it_chat_realtime_topic_authorized(text)'::regprocedure),
    E'\r', ''
  );
  if position(new_realtime_guard in current_definition) = 0 then
    if position(old_realtime_guard in current_definition) = 0 then
      raise exception 'Could not safely harden worth_it_chat_realtime_topic_authorized.';
    end if;
    updated_definition := replace(current_definition, old_realtime_guard, new_realtime_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.search_worth_it_chat_messages(uuid,text,integer)'::regprocedure),
    E'\r', ''
  );
  if position(new_search_guard in current_definition) = 0 then
    if position(old_search_guard in current_definition) = 0 then
      raise exception 'Could not safely harden search_worth_it_chat_messages.';
    end if;
    updated_definition := replace(current_definition, old_search_guard, new_search_guard);
    execute updated_definition;
  end if;
end
$chat_access$;


-- The existing message-deletion RPC clears media_url immediately. Keep the stored
-- URL and media_type on the internal tombstone row so the owner's API DELETE can
-- still prove which object belongs to that message. Chat read RPCs already return
-- null media fields for deleted messages, so the URL is never shown in the UI.
do $migration$
declare
  current_definition text;
  updated_definition text;
  old_assignment text := E'         media_url = null,\n         media_type = null,\n';
begin
  current_definition := replace(
    pg_get_functiondef('public.delete_worth_it_chat_message(bigint)'::regprocedure),
    E'\r', ''
  );

  if position(old_assignment in current_definition) > 0 then
    updated_definition := replace(current_definition, old_assignment, '');
    updated_definition := replace(
      updated_definition,
      '-- Purge the original text and public media URL, while retaining the small',
      '-- Purge the original text while retaining the private media reference in the small'
    );
  elsif position('media_url = null' in current_definition) = 0
        and position('media_type = null' in current_definition) = 0 then
    -- Already migrated: leave the current function untouched.
    updated_definition := current_definition;
  else
    raise exception 'Could not safely preserve deleted chat media references. Review delete_worth_it_chat_message before applying this migration.';
  end if;

  execute updated_definition;
end
$migration$;

notify pgrst, 'reload schema';
commit;

     or p_object_path ~ '(^|/)\.\.(/|$)' then
    return false;
  end if;

  owner_id := split_part(p_object_path, '/', 1)::uuid;
  if actor_id <> owner_id then
    return false;
  end if;

  expected_reference := 'worthit-audio:' || p_conversation_id::text || ':' || p_object_path;
  if not public.can_access_worth_it_chat_media(p_conversation_id) then
    return false;
  end if;

  -- Keep delete access for the uploader's tombstoned message so Storage cleanup
  -- can finish after a message is deleted, without allowing cross-chat replay.
  return exists (
    select 1
      from public.worth_it_chat_messages m
     where m.conversation_id = p_conversation_id
       and m.sender_user_id = owner_id
       and m.media_type = 'audio'
       and m.media_url = expected_reference
  );
end;
$;

revoke all on function public.can_access_worth_it_chat_audio_object(uuid,text) from public, anon;
revoke all on function public.can_delete_worth_it_chat_audio_object(uuid,text) from public, anon;
grant execute on function public.can_access_worth_it_chat_audio_object(uuid,text) to authenticated;
grant execute on function public.can_delete_worth_it_chat_audio_object(uuid,text) to authenticated;



-- Enforce one consistent access contract for every chat entry point:
-- confirmed email + global access, group membership, or a current friendship
-- in a two-person direct conversation.
do $chat_access$
declare
  current_definition text;
  updated_definition text;

  old_verified_guard text := '  if actor_id is null or p_conversation_id is null then return false; end if;';
  new_verified_guard text := $new$
  if actor_id is null or p_conversation_id is null then return false; end if;
  if not exists (
    select 1
      from auth.users verified_user
     where verified_user.id = actor_id
       and verified_user.email_confirmed_at is not null
  ) then return false; end if;
$new$;

  old_message_guard text := $old$
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members
        where conversation_id = target_id and user_id = actor_id
    ) then
        return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
    end if;
$old$;
  new_message_guard text := $new$
    if not public.can_access_worth_it_chat_media(target_id) then
        return jsonb_build_object(
            'success', false,
            'code', case when target_type = 'direct' then 'FRIENDS_ONLY' else 'NOT_A_CHAT_MEMBER' end
        );
    end if;
$new$;

  old_send_guard text := $old$
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
$old$;
  new_send_guard text := $new$
    if not public.can_access_worth_it_chat_media(target_id) then
        if target_type = 'direct' then
            return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
        end if;
        return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER');
    end if;
$new$;

  old_conversation_filter text := $old$
    where (c.conversation_type in ('direct', 'group') and mine.user_id = actor_id)
       or c.conversation_type = 'global';
$old$;
  new_conversation_filter text := $new$
    where (
        (c.conversation_type = 'group' and mine.user_id = actor_id)
        or (
            c.conversation_type = 'direct'
            and mine.user_id = actor_id
            and public.can_access_worth_it_chat_media(c.id)
        )
        or c.conversation_type = 'global'
    );
$new$;

  old_realtime_guard text := $old$
  return exists (
        select 1
          from public.worth_it_chat_members as member
         where member.conversation_id = target_id
           and member.user_id = actor_id
    );
$old$;
  new_realtime_guard text := $new$
  return public.can_access_worth_it_chat_media(target_id);
$new$;

  old_search_guard text := $old$
  if kind <> 'global' and not exists (
    select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
  ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;
  if kind = 'direct' and not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
$old$;
  new_search_guard text := $new$
  if not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object(
      'success',false,
      'code',case when kind = 'direct' then 'FRIENDS_ONLY' else 'NOT_A_CHAT_MEMBER' end
    );
  end if;
$new$;
begin
  current_definition := replace(
    pg_get_functiondef('public.can_access_worth_it_chat_media(uuid)'::regprocedure),
    E'\r', ''
  );
  if position(new_verified_guard in current_definition) = 0 then
    if position(old_verified_guard in current_definition) = 0 then
      raise exception 'Could not locate the current chat-media access guard.';
    end if;
    updated_definition := replace(current_definition, old_verified_guard, new_verified_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.get_worth_it_chat_messages(uuid,integer)'::regprocedure),
    E'\r', ''
  );
  if position(new_message_guard in current_definition) = 0 then
    if position(old_message_guard in current_definition) = 0 then
      raise exception 'Could not safely harden get_worth_it_chat_messages.';
    end if;
    updated_definition := replace(current_definition, old_message_guard, new_message_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.send_worth_it_chat_message(text,uuid,text,text)'::regprocedure),
    E'\r', ''
  );
  if position(new_send_guard in current_definition) = 0 then
    if position(old_send_guard in current_definition) = 0 then
      raise exception 'Could not safely harden send_worth_it_chat_message.';
    end if;
    updated_definition := replace(current_definition, old_send_guard, new_send_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.get_worth_it_chat_conversations()'::regprocedure),
    E'\r', ''
  );
  if position(new_conversation_filter in current_definition) = 0 then
    if position(old_conversation_filter in current_definition) = 0 then
      raise exception 'Could not safely harden get_worth_it_chat_conversations.';
    end if;
    updated_definition := replace(current_definition, old_conversation_filter, new_conversation_filter);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.worth_it_chat_realtime_topic_authorized(text)'::regprocedure),
    E'\r', ''
  );
  if position(new_realtime_guard in current_definition) = 0 then
    if position(old_realtime_guard in current_definition) = 0 then
      raise exception 'Could not safely harden worth_it_chat_realtime_topic_authorized.';
    end if;
    updated_definition := replace(current_definition, old_realtime_guard, new_realtime_guard);
    execute updated_definition;
  end if;

  current_definition := replace(
    pg_get_functiondef('public.search_worth_it_chat_messages(uuid,text,integer)'::regprocedure),
    E'\r', ''
  );
  if position(new_search_guard in current_definition) = 0 then
    if position(old_search_guard in current_definition) = 0 then
      raise exception 'Could not safely harden search_worth_it_chat_messages.';
    end if;
    updated_definition := replace(current_definition, old_search_guard, new_search_guard);
    execute updated_definition;
  end if;
end
$chat_access$;


-- The existing message-deletion RPC clears media_url immediately. Keep the stored
-- URL and media_type on the internal tombstone row so the owner's API DELETE can
-- still prove which object belongs to that message. Chat read RPCs already return
-- null media fields for deleted messages, so the URL is never shown in the UI.
do $migration$
declare
  current_definition text;
  updated_definition text;
  old_assignment text := E'         media_url = null,\n         media_type = null,\n';
begin
  current_definition := replace(
    pg_get_functiondef('public.delete_worth_it_chat_message(bigint)'::regprocedure),
    E'\r', ''
  );

  if position(old_assignment in current_definition) > 0 then
    updated_definition := replace(current_definition, old_assignment, '');
    updated_definition := replace(
      updated_definition,
      '-- Purge the original text and public media URL, while retaining the small',
      '-- Purge the original text while retaining the private media reference in the small'
    );
  elsif position('media_url = null' in current_definition) = 0
        and position('media_type = null' in current_definition) = 0 then
    -- Already migrated: leave the current function untouched.
    updated_definition := current_definition;
  else
    raise exception 'Could not safely preserve deleted chat media references. Review delete_worth_it_chat_message before applying this migration.';
  end if;

  execute updated_definition;
end
$migration$;

notify pgrst, 'reload schema';
commit;
