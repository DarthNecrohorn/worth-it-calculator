do $smoke$
declare
  bucket storage.buckets%rowtype;
  definition text;
  constraint_definition text;
begin
  select * into bucket from storage.buckets where id='worth-it-chat-audio';
  if not found or bucket.public is distinct from false or bucket.file_size_limit <> 10485760 then
    raise exception 'Private voice bucket is missing, public, or has the wrong size limit';
  end if;
  if not ('audio/webm' = any(bucket.allowed_mime_types)) or not ('audio/ogg' = any(bucket.allowed_mime_types)) then
    raise exception 'Private voice bucket has an incomplete MIME allow-list';
  end if;

  definition := pg_get_functiondef('public.send_worth_it_chat_message(text,uuid,text,text)'::regprocedure);
  if position('media_kind not in (''image'',''gif'',''video'',''audio'')' in definition) = 0 then
    raise exception 'Existing send_worth_it_chat_message RPC was not safely extended for audio';
  end if;
  if position('worthit-audio:' in definition) = 0 or position('can_access' in definition) > 0 then
    raise exception 'Existing message RPC does not validate the private audio marker';
  end if;

  select pg_get_constraintdef(oid) into constraint_definition
    from pg_constraint where conrelid='public.worth_it_chat_messages'::regclass
      and conname='worth_it_chat_messages_media_type_check';
  if position('audio' in constraint_definition) = 0 then
    raise exception 'Audio media_type was not added to the message constraint';
  end if;

  if has_function_privilege('anon','public.start_worth_it_chat_call(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Anonymous role can start chat calls';
  end if;
  if has_function_privilege('anon','public.send_worth_it_chat_call_signal(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Anonymous role can send chat call signals';
  end if;
  if not has_function_privilege('authenticated','public.start_worth_it_chat_call(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Authenticated role cannot call the start-call RPC';
  end if;

  definition := pg_get_functiondef('public.can_access_worth_it_chat_media(uuid)'::regprocedure);
  if position('worth_it_friends' in definition) = 0 or position('conversation_type' in definition) = 0 then
    raise exception 'Chat media access RPC is missing friend/conversation checks';
  end if;
  definition := pg_get_functiondef('public.search_worth_it_chat_messages(uuid,text,integer)'::regprocedure);
  if position('worth_it_chat_message_hides' in definition) = 0 or position('worth_it_chat_history_clears' in definition) = 0 then
    raise exception 'Message search is missing hide/history restrictions';
  end if;
  raise notice 'Chat-enhancements migration smoke checks passed.';
end
$smoke$;
