do $smoke$
declare
  bucket storage.buckets%rowtype;
  definition text;
  result jsonb;
  call_id uuid;
  constraint_definition text;
  search_result jsonb;
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

  -- Exercise the real call RPC chain, including current friendship enforcement.
  insert into auth.users(id) values
    ('00000000-0000-4000-8000-000000000010'),
    ('00000000-0000-4000-8000-000000000011'),
    ('00000000-0000-4000-8000-000000000012')
    on conflict (id) do nothing;
  insert into public.worth_it_profiles(user_id, worth_it_id, username, display_name) values
    ('00000000-0000-4000-8000-000000000010', 810, 'callfriend1', 'Call Friend One'),
    ('00000000-0000-4000-8000-000000000011', 811, 'callfriend2', 'Call Friend Two'),
    ('00000000-0000-4000-8000-000000000012', 812, 'notfriend', 'Not a Friend')
    on conflict (user_id) do nothing;
  insert into public.worth_it_friends(user_low_id,user_high_id)
    values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011')
    on conflict do nothing;
  insert into public.worth_it_chat_conversations(id,conversation_type,title)
  values
    ('00000000-0000-4000-8000-000000000100','direct','Friends'),
    ('00000000-0000-4000-8000-000000000101','direct','Not friends')
    on conflict (id) do nothing;
  insert into public.worth_it_chat_members(conversation_id,user_id) values
    ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010'),
    ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011'),
    ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000010'),
    ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000012')
    on conflict do nothing;

  insert into public.worth_it_chat_messages(conversation_id,sender_user_id,body) values
    ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010','Hi there, friend'),
    ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011','hi   there again'),
    ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011','Oh, hi there in the middle');

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',true);
  search_result := public.search_worth_it_chat_messages(
    '00000000-0000-4000-8000-000000000100','hi there',100);
  if jsonb_array_length(search_result) <> 2 then
    raise exception 'Prefix search should return exactly 2 matching messages, got: %', search_result;
  end if;
  if exists (
    select 1 from jsonb_array_elements(search_result) item
    where lower(regexp_replace(ltrim(item->>'body'), '[[:space:]]+', ' ', 'g')) not like 'hi there%'
  ) then
    raise exception 'Search returned a message which does not start with the requested phrase: %', search_result;
  end if;
  result := public.start_worth_it_chat_call(
    '00000000-0000-4000-8000-000000000100','audio','{"type":"offer","sdp":"test-offer"}'::jsonb);
  if result->>'success' is distinct from 'true' or result->>'call_id' is null then
    raise exception 'A friend-only audio call should start successfully: %', result;
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
  result := public.get_worth_it_incoming_chat_call();
  if result#>>'{call,id}' is distinct from (result->'call'->>'id') or result#>>'{call,caller_user_id}' is distinct from '00000000-0000-4000-8000-000000000010' then
    raise exception 'The call should appear only to the intended friend: %', result;
  end if;
  call_id := (result#>>'{call,id}')::uuid;
  result := public.respond_worth_it_chat_call(call_id,'accept','{"type":"answer","sdp":"test-answer"}'::jsonb);
  if result->>'success' is distinct from 'true' then
    raise exception 'The intended friend should be able to accept the call: %', result;
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',true);
  result := public.get_worth_it_chat_call_state(call_id,0);
  if result->>'status' is distinct from 'accepted' or result->'answer'->>'type' is distinct from 'answer' then
    raise exception 'The caller should see the accepted call and answer: %', result;
  end if;
  result := public.respond_worth_it_chat_call(call_id,'end',null);
  if result->>'success' is distinct from 'true' or result->>'status' is distinct from 'ended' then
    raise exception 'Either call participant should be able to end the call: %', result;
  end if;

  -- A direct conversation with no accepted friendship must never start a call.
  result := public.start_worth_it_chat_call(
    '00000000-0000-4000-8000-000000000101','video','{"type":"offer","sdp":"test-offer"}'::jsonb);
  if result->>'success' is distinct from 'false' or result->>'code' is distinct from 'FRIENDS_ONLY' then
    raise exception 'A video call between non-friends must be refused: %', result;
  end if;

  definition := pg_get_functiondef('public.search_worth_it_chat_messages(uuid,text,integer)'::regprocedure);
  if position('worth_it_chat_message_hides' in definition) = 0 or position('worth_it_chat_history_clears' in definition) = 0 then
    raise exception 'Message search is missing hide/history restrictions';
  end if;
  raise notice 'Chat-enhancements migration smoke checks passed.';
end
$smoke$;
