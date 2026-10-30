-- Smoke-test private media permissions, deletion tombstones and URL hiding.
do $smoke$
declare
  owner_id uuid := '10000000-0000-4000-8000-000000000001';
  other_member_id uuid := '10000000-0000-4000-8000-000000000002';
  outsider_id uuid := '10000000-0000-4000-8000-000000000003';
  conversation_id uuid := '20000000-0000-4000-8000-000000000001';
  message_id bigint;
  message_row public.worth_it_chat_messages%rowtype;
  bucket storage.buckets%rowtype;
  result jsonb;
  message_list jsonb;
  object_path text;
  stable_url text;
  audio_message_id bigint;
  audio_object_path text;
  audio_reference text;
  direct_conversation_id uuid := '30000000-0000-4000-8000-000000000001';
  topic text;
  send_definition text;
  realtime_definition text;
begin
  select * into bucket from storage.buckets where id = 'worth-it-chat-media';
  if not found or bucket.public is distinct from false then
    raise exception 'The chat media bucket is still publicly readable.';
  end if;
  if not ('image/jpeg' = any(bucket.allowed_mime_types))
     or not ('video/mp4' = any(bucket.allowed_mime_types)) then
    raise exception 'The private chat media bucket MIME allow-list is incomplete.';
  end if;
  if exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Worth It chat media read'
  ) then
    raise exception 'The old public chat-media read policy still exists.';
  end if;
  if not has_function_privilege('authenticated','public.can_access_worth_it_chat_media_object(uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.can_delete_worth_it_chat_media_object(uuid,text)','EXECUTE') then
    raise exception 'Authenticated users cannot call the guarded media access RPCs.';
  end if;
  if not has_function_privilege('authenticated','public.can_access_worth_it_chat_audio_object(uuid,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.can_delete_worth_it_chat_audio_object(uuid,text)','EXECUTE') then
    raise exception 'Authenticated users cannot call the guarded audio access RPCs.';
  end if;
  if has_function_privilege('anon','public.can_access_worth_it_chat_audio_object(uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.can_delete_worth_it_chat_audio_object(uuid,text)','EXECUTE') then
    raise exception 'Anonymous users can call private audio access RPCs.';
  end if;

  send_definition := pg_get_functiondef('public.send_worth_it_chat_message(text,uuid,text,text)'::regprocedure);
  if position('if not public.can_access_worth_it_chat_media(target_id) then' in send_definition) = 0 then
    raise exception 'The shared chat access predicate was not installed in the send RPC.';
  end if;
  if position('if target_type=''direct'' and not exists (' in send_definition) = 0 then
    raise exception 'The existing direct-friendship guard was not preserved in the send RPC.';
  end if;
  realtime_definition := pg_get_functiondef('public.worth_it_chat_realtime_topic_authorized(text)'::regprocedure);
  if position('return public.can_access_worth_it_chat_media(target_id);' in realtime_definition) = 0 then
    raise exception 'The Realtime subscription RPC does not use the shared chat access predicate.';
  end if;
  if position('email_confirmed_at' in realtime_definition) = 0 then
    raise exception 'The Realtime email-verification guard was not preserved.';
  end if;
  if has_function_privilege('anon','public.can_access_worth_it_chat_media_object(uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.can_delete_worth_it_chat_media_object(uuid,text)','EXECUTE') then
    raise exception 'Anonymous users can call private media access RPCs.';
  end if;

  insert into auth.users(id) values (outsider_id) on conflict do nothing;
  object_path := owner_id::text || '/1790000000000-ab12cd.png';
  stable_url := 'https://project.supabase.co/storage/v1/object/public/worth-it-chat-media/' || object_path;
  insert into public.worth_it_chat_messages(conversation_id,sender_user_id,body,media_url,media_type)
  values (conversation_id,owner_id,'private attachment',stable_url,'image')
  returning id into message_id;

  perform set_config('app.test_user_id', owner_id::text, true);
  if not public.can_access_worth_it_chat_media_object(conversation_id,object_path) then
    raise exception 'The owning group member cannot view their attachment.';
  end if;
  if not public.can_delete_worth_it_chat_media_object(conversation_id,object_path) then
    raise exception 'The attachment owner cannot delete their own attachment.';
  end if;

  perform set_config('app.test_user_id', other_member_id::text, true);
  if not public.can_access_worth_it_chat_media_object(conversation_id,object_path) then
    raise exception 'Another conversation member cannot view the shared attachment.';
  end if;
  if public.can_delete_worth_it_chat_media_object(conversation_id,object_path) then
    raise exception 'Another member can delete someone else''s attachment.';
  end if;

  perform set_config('app.test_user_id', outsider_id::text, true);
  if public.can_access_worth_it_chat_media_object(conversation_id,object_path) then
    raise exception 'A non-member can view a private group attachment.';
  end if;


  -- Voice objects require an exact message reference in the exact conversation.
  audio_object_path := owner_id::text || '/1790000000001-voice-test.webm';
  audio_reference := 'worthit-audio:' || conversation_id::text || ':' || audio_object_path;
  insert into public.worth_it_chat_messages(conversation_id,sender_user_id,body,media_url,media_type)
  values (conversation_id,owner_id,'voice test',audio_reference,'audio') returning id into audio_message_id;
  perform set_config('app.test_user_id',owner_id::text,true);
  if not public.can_access_worth_it_chat_audio_object(conversation_id,audio_object_path)
     or not public.can_delete_worth_it_chat_audio_object(conversation_id,audio_object_path) then
    raise exception 'The audio owner cannot access or delete their own voice message.';
  end if;
  if public.can_access_worth_it_chat_audio_object(direct_conversation_id,audio_object_path) then
    raise exception 'An audio object was replayed against a different conversation.';
  end if;
  perform set_config('app.test_user_id',other_member_id::text,true);
  if not public.can_access_worth_it_chat_audio_object(conversation_id,audio_object_path) then
    raise exception 'Another member cannot access the shared voice message.';
  end if;
  if public.can_delete_worth_it_chat_audio_object(conversation_id,audio_object_path) then
    raise exception 'Another member can delete someone else''s voice message.';
  end if;
  perform set_config('app.test_user_id',outsider_id::text,true);
  if public.can_access_worth_it_chat_audio_object(conversation_id,audio_object_path) then
    raise exception 'A non-member can access a private voice message.';
  end if;
  perform set_config('app.test_user_id',owner_id::text,true);
  result := public.delete_worth_it_chat_message(audio_message_id);
  if result->>'success' is distinct from 'true' then
    raise exception 'The owner could not delete their voice message: %',result;
  end if;
  if public.can_access_worth_it_chat_audio_object(conversation_id,audio_object_path) then
    raise exception 'A deleted voice message remains readable.';
  end if;
  if not public.can_delete_worth_it_chat_audio_object(conversation_id,audio_object_path) then
    raise exception 'The owner cannot clean up the deleted voice message object.';
  end if;

  -- Group Chat: only members may read, send or subscribe.
  perform set_config('app.test_user_id', outsider_id::text, true);
  result := public.get_worth_it_chat_messages(conversation_id,100);
  if result->>'code' is distinct from 'NOT_A_CHAT_MEMBER' then
    raise exception 'A non-member read the Group Chat: %', result;
  end if;
  result := public.send_worth_it_chat_message('outsider attempt',conversation_id,null,null);
  if result->>'code' is distinct from 'NOT_A_CHAT_MEMBER' then
    raise exception 'A non-member sent to the Group Chat: %', result;
  end if;
  topic := 'worthit-chat:' || conversation_id::text;
  if public.worth_it_chat_realtime_topic_authorized(topic) then
    raise exception 'A non-member subscribed to Group Chat Realtime.';
  end if;
  result := public.get_worth_it_chat_conversations();
  if result::text like '%' || conversation_id::text || '%' then
    raise exception 'A non-member saw the Group Chat in their conversation list.';
  end if;

  -- Direct chat membership alone is insufficient: current friendship is required.
  perform set_config('app.test_user_id', owner_id::text, true);
  result := public.get_worth_it_chat_messages(direct_conversation_id,100);
  if result->>'code' is distinct from 'FRIENDS_ONLY' then
    raise exception 'A former friend read the Private Chat: %', result;
  end if;
  result := public.send_worth_it_chat_message('former friend attempt',direct_conversation_id,null,null);
  if result->>'code' is distinct from 'FRIENDS_ONLY' then
    raise exception 'A former friend sent to the Private Chat: %', result;
  end if;

  result := public.search_worth_it_chat_messages(direct_conversation_id,'hello',20);
  if result->>'code' is distinct from 'FRIENDS_ONLY' then
    raise exception 'A former friend searched the Private Chat: %', result;
  end if;
  topic := 'worthit-chat:' || direct_conversation_id::text;
  if public.worth_it_chat_realtime_topic_authorized(topic) then
    raise exception 'A former friend subscribed to Private Chat Realtime.';
  end if;
  result := public.get_worth_it_chat_conversations();
  if result::text like '%' || direct_conversation_id::text || '%' then
    raise exception 'A former friend still sees the Private Chat in their list.';
  end if;

  -- Re-establishing friendship restores direct-chat access for both participants.
  insert into public.worth_it_friends(user_low_id,user_high_id)
  values (least(owner_id,other_member_id), greatest(owner_id,other_member_id))
  on conflict do nothing;
  result := public.get_worth_it_chat_messages(direct_conversation_id,100);
  if jsonb_typeof(result) is distinct from 'array' then
    raise exception 'A current friend cannot read the Private Chat: %', result;
  end if;
  result := public.send_worth_it_chat_message('friend access restored',direct_conversation_id,null,null);
  if result->>'success' is distinct from 'true' then
    raise exception 'A current friend cannot send to the Private Chat: %', result;
  end if;

  result := public.search_worth_it_chat_messages(direct_conversation_id,'hello',20);
  if jsonb_typeof(result) is distinct from 'array' then
    raise exception 'A current friend cannot search the Private Chat: %', result;
  end if;
  if not public.worth_it_chat_realtime_topic_authorized(topic) then
    raise exception 'A current friend cannot subscribe to Private Chat Realtime.';
  end if;
  result := public.get_worth_it_chat_conversations();
  if result::text not like '%' || direct_conversation_id::text || '%' then
    raise exception 'A current friend cannot see their Private Chat in the list.';
  end if;

  -- Global Chat is available to confirmed authenticated users.
  result := public.get_worth_it_chat_messages('00000000-0000-4000-8000-000000000001',100);
  if result->>'code' is not null then
    raise exception 'A confirmed account cannot read Global Chat: %', result;
  end if;
  result := public.send_worth_it_chat_message('global access check','00000000-0000-4000-8000-000000000001',null,null);
  if result->>'success' is distinct from 'true' then
    raise exception 'A confirmed account cannot send to Global Chat: %', result;
  end if;
  if not public.worth_it_chat_realtime_topic_authorized('worthit-chat:00000000-0000-4000-8000-000000000001') then
    raise exception 'A confirmed account cannot subscribe to Global Chat Realtime.';
  end if;

  -- Unverified users cannot obtain any chat access, including Global Chat media.
  perform set_config('app.test_user_id', outsider_id::text, true);
  update auth.users set email_confirmed_at = null where id = outsider_id;
  if public.can_access_worth_it_chat_media('00000000-0000-4000-8000-000000000001') then
    raise exception 'An unverified account obtained Global Chat access.';
  end if;
  if public.can_access_worth_it_chat_media(conversation_id) then
    raise exception 'An unverified account obtained Group Chat access.';
  end if;

  begin
    perform public.worth_it_chat_realtime_topic_authorized('worthit-chat:00000000-0000-4000-8000-000000000001');
    raise exception 'An unverified account subscribed to Global Chat Realtime.';
  exception when insufficient_privilege then
    null;
  end;

  perform set_config('app.test_user_id', owner_id::text, true);
  result := public.delete_worth_it_chat_message(message_id);
  if result->>'success' is distinct from 'true' then
    raise exception 'The message owner could not delete their own message: %', result;
  end if;
  select * into message_row from public.worth_it_chat_messages where id = message_id;
  if message_row.deleted_at is null or message_row.body <> ''
     or message_row.media_url is distinct from stable_url
     or message_row.media_type is distinct from 'image' then
    raise exception 'The deleted message did not retain its private attachment tombstone reference.';
  end if;
  if public.can_access_worth_it_chat_media_object(conversation_id,object_path) then
    raise exception 'Deleted media is still available for viewing.';
  end if;
  if not public.can_delete_worth_it_chat_media_object(conversation_id,object_path) then
    raise exception 'The owner cannot complete storage cleanup after message deletion.';
  end if;

  message_list := public.get_worth_it_chat_messages(conversation_id,100);
  if exists (
    select 1
      from jsonb_array_elements(message_list) item
     where item->>'id' = message_id::text
       and (item->>'media_url') is not null
  ) then
    raise exception 'The chat read RPC exposed the retained tombstone media URL.';
  end if;
end
$smoke$;
