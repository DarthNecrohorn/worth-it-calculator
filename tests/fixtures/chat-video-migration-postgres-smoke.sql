\set ON_ERROR_STOP on
do $test$
declare
  bucket storage.buckets%rowtype;
  function_definition text;
  constraint_definition text;
begin
  select * into strict bucket from storage.buckets where id='worth-it-chat-media';
  if bucket.public is distinct from true then raise exception 'Bucket public-read setting changed'; end if;
  if bucket.file_size_limit <> 52428800 then raise exception 'Expected 50 MiB bucket limit'; end if;
  if not ('video/mp4'=any(bucket.allowed_mime_types)) or not ('video/webm'=any(bucket.allowed_mime_types)) then
    raise exception 'MP4/WebM MIME types were not enabled';
  end if;
  if not ('image/gif'=any(bucket.allowed_mime_types)) or not ('image/jpeg'=any(bucket.allowed_mime_types)) then
    raise exception 'Existing image/GIF MIME types were not preserved';
  end if;
  select pg_get_functiondef('public.send_worth_it_chat_message(text,uuid,text,text)'::regprocedure) into function_definition;
  if position('media_kind not in (''image'',''gif'',''video'')' in function_definition)=0 then
    raise exception 'RPC media allow-list was not updated';
  end if;
  select pg_get_constraintdef(oid) into constraint_definition
    from pg_constraint where conrelid='public.worth_it_chat_messages'::regclass
      and conname='worth_it_chat_messages_media_type_check';
  if constraint_definition is null or position('video' in constraint_definition)=0 then
    raise exception 'Message media_type constraint was not updated';
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='Worth It chat media upload own' and cmd='INSERT') then
    raise exception 'Expected direct-upload blocking policy was not recreated';
  end if;
end;
$test$;
select 'PASS: video migration updated bucket, table constraint, RPC allow-list, and upload policy' as result;
