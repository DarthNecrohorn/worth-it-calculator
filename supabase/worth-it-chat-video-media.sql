-- Enable MP4 and WebM in the existing chat-media bucket.
-- The upload endpoint remains the only permitted insert path and enforces
-- Free-tier limits: images 15 MB, GIFs 20 MB, videos 50 MB.
-- Keep existing image/GIF MIME types and public-read behavior unchanged.
update storage.buckets
set public = true,
    file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif',
      'video/mp4','video/webm'
    ]
where id = 'worth-it-chat-media';

-- The live database schema currently restricts media_type to image/gif.
-- Extend the check without changing existing rows or message permissions.
alter table public.worth_it_chat_messages
  drop constraint if exists worth_it_chat_messages_media_type_check;
alter table public.worth_it_chat_messages
  add constraint worth_it_chat_messages_media_type_check
  check (media_type is null or media_type in ('image', 'gif', 'video'));

-- The SECURITY DEFINER RPC independently validates media_kind. Preserve its
-- full current implementation and replace only that allow-list condition,
-- failing the migration rather than silently leaving video sends blocked.
do $migration$
declare
  current_definition text;
  updated_definition text;
  old_condition text := 'media_kind not in (''image'',''gif'')';
  new_condition text := 'media_kind not in (''image'',''gif'',''video'')';
begin
  current_definition := pg_get_functiondef(
    'public.send_worth_it_chat_message(text,uuid,text,text)'::regprocedure
  );
  if position(old_condition in current_definition) = 0 then
    raise exception 'Expected media_type allow-list was not found in send_worth_it_chat_message; review the function before migrating.';
  end if;
  updated_definition := replace(current_definition, old_condition, new_condition);
  execute updated_definition;
end
$migration$;

-- Do not grant direct authenticated uploads: /api/chat-media verifies the
-- session, file signature and per-type size before using the service key.
drop policy if exists "Worth It chat media upload own" on storage.objects;
create policy "Worth It chat media upload own" on storage.objects
for insert to authenticated with check (false);
