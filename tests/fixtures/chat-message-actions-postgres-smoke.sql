do $test$
declare
  result jsonb;
  found_message jsonb;
  cleared_at_value timestamptz;
  new_message_id bigint;
  group_id uuid := '20000000-0000-4000-8000-000000000001'::uuid;
begin
  perform set_config('app.test_user_id','10000000-0000-4000-8000-000000000001',true);
  result := public.delete_worth_it_chat_message(1);
  if result->>'success' <> 'true' then raise exception 'Owner deletion failed: %', result; end if;
  if exists(select 1 from public.worth_it_chat_messages where id=1 and (body <> '' or media_url is not null or media_type is not null or deleted_at is null)) then
    raise exception 'Deleted message content/media was not cleared';
  end if;

  result := public.set_worth_it_chat_conversation_pinned(group_id,true);
  if result->>'success' <> 'true' or result->>'is_pinned' <> 'true' then
    raise exception 'Pinning a conversation failed: %', result;
  end if;
  result := public.get_worth_it_chat_conversations();
  if not exists(select 1 from jsonb_array_elements(result) conversation
      where conversation->>'id'=group_id::text and conversation->>'is_pinned'='true') then
    raise exception 'Pinned state was not returned for the requesting user.';
  end if;
  result := public.set_worth_it_chat_conversation_pinned('00000000-0000-4000-8000-000000000001'::uuid,true);
  if result->>'code' <> 'GLOBAL_CHAT_PIN_NOT_SUPPORTED' then
    raise exception 'Global Chat should remain fixed at the top rather than use personal pinning: %', result;
  end if;

  result := public.get_worth_it_chat_messages(group_id,100);
  select item into found_message from jsonb_array_elements(result) item where item->>'id'='1';
  if found_message is null or found_message->>'is_deleted' <> 'true' or found_message->>'body' <> '' or found_message->>'display_name' <> 'Alice' then
    raise exception 'Other participants do not receive the expected public deletion tombstone: %', found_message;
  end if;

  perform set_config('app.test_user_id','10000000-0000-4000-8000-000000000002',true);
  result := public.delete_worth_it_chat_message(1);
  if result->>'code' <> 'NOT_MESSAGE_OWNER' then
    raise exception 'A non-owner was allowed to delete someone else''s message: %', result;
  end if;

  result := public.get_worth_it_chat_conversations();
  if exists(select 1 from jsonb_array_elements(result) conversation
      where conversation->>'id'=group_id::text and conversation->>'is_pinned'='true') then
    raise exception 'Alice''s personal pin leaked to Bob.';
  end if;
  result := public.set_worth_it_chat_conversation_pinned(group_id,true);
  if result->>'success' <> 'true' then raise exception 'Bob could not pin their own sidebar conversation: %', result; end if;
  result := public.get_worth_it_chat_conversations();
  if not exists(select 1 from jsonb_array_elements(result) conversation
      where conversation->>'id'=group_id::text and conversation->>'is_pinned'='true') then
    raise exception 'Bob''s pinned state did not appear in Bob''s conversation list.';
  end if;
  result := public.set_worth_it_chat_conversation_pinned(group_id,false);
  if result->>'success' <> 'true' then raise exception 'Bob could not unpin their conversation: %', result; end if;
  result := public.get_worth_it_chat_conversations();
  if exists(select 1 from jsonb_array_elements(result) conversation
      where conversation->>'id'=group_id::text and conversation->>'is_pinned'='true') then
    raise exception 'Unpin did not clear Bob''s personal pin.';
  end if;

  result := public.hide_worth_it_chat_message(3);
  if result->>'success' <> 'true' then raise exception 'Per-user hide failed: %', result; end if;
  result := public.get_worth_it_chat_messages(group_id,100);
  select item into found_message from jsonb_array_elements(result) item where item->>'id'='3';
  if found_message is null or found_message->>'is_hidden_by_me' <> 'true' or found_message->>'body' <> '' or found_message->>'deleted_by_display_name' <> 'Bob' then
    raise exception 'Hiding user did not receive the private placeholder: %', found_message;
  end if;
  result := public.get_worth_it_chat_conversations();
  if exists(select 1 from jsonb_array_elements(result) conversation
     where conversation->>'id'=group_id::text
       and conversation->'last_message'->>'body'='Message hidden only by Bob') then
    raise exception 'Conversation preview leaked a message hidden by this user.';
  end if;

  perform set_config('app.test_user_id','10000000-0000-4000-8000-000000000001',true);
  result := public.get_worth_it_chat_messages(group_id,100);
  select item into found_message from jsonb_array_elements(result) item where item->>'id'='3';
  if found_message is null or found_message->>'body' <> 'Message hidden only by Bob' or found_message->>'is_hidden_by_me' <> 'false' then
    raise exception 'A private hide incorrectly affected another user: %', found_message;
  end if;

  result := public.clear_worth_it_chat_history(group_id);
  if result->>'success' <> 'true' then raise exception 'Personal history clear failed: %', result; end if;
  cleared_at_value := (result->>'cleared_at')::timestamptz;
  result := public.get_worth_it_chat_messages(group_id,100);
  if jsonb_array_length(result) <> 0 then
    raise exception 'Messages before the personal history cutoff remain visible: %', result;
  end if;

  insert into public.worth_it_chat_messages(conversation_id,sender_user_id,body,created_at)
  values (group_id,'10000000-0000-4000-8000-000000000002','Message sent after history clear',
    cleared_at_value + interval '1 second')
  returning id into strict new_message_id;
  result := public.get_worth_it_chat_messages(group_id,100);
  if jsonb_array_length(result) <> 1 or result->0->>'body' <> 'Message sent after history clear' then
    raise exception 'A new message did not appear after clearing old history: %', result;
  end if;

  perform set_config('app.test_user_id','10000000-0000-4000-8000-000000000002',true);
  result := public.get_worth_it_chat_messages(group_id,100);
  if not exists(select 1 from jsonb_array_elements(result) item where item->>'id'='1' and item->>'is_deleted'='true') then
    raise exception 'Clearing one user''s history changed what another member sees.';
  end if;

  perform set_config('app.test_user_id','10000000-0000-4000-8000-000000000001',true);
  result := public.get_worth_it_chat_conversations();
  if exists(
    select 1 from jsonb_array_elements(result) conversation
    where conversation->>'id'=group_id::text
      and conversation->'last_message'->>'body'='Message hidden only by Bob'
  ) then
    raise exception 'Conversation preview leaked a message hidden by this user.';
  end if;
end;
$test$;
select 'PASS: message deletion, private hiding, per-user history clear and RPC privacy checks' as result;
