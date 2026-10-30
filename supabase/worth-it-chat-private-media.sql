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
