do $smoke$
declare
  result jsonb;
  call_id uuid;
  call_state jsonb;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',true);
  result := public.start_worth_it_chat_call(
    '00000000-0000-4000-8000-000000000100','video','{"type":"offer","sdp":"test-offer"}'::jsonb);
  if result->>'success' is distinct from 'true' or result->>'call_id' is null then
    raise exception 'A friend-only video call should start for ended-by attribution test: %', result;
  end if;
  call_id := (result->>'call_id')::uuid;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
  result := public.respond_worth_it_chat_call(
    call_id,'accept','{"type":"answer","sdp":"test-answer"}'::jsonb);
  if result->>'success' is distinct from 'true' then
    raise exception 'The intended friend should accept the attribution test call: %', result;
  end if;
  result := public.respond_worth_it_chat_call(call_id,'end',null);
  if result->>'success' is distinct from 'true' then
    raise exception 'The other participant should be able to end the call: %', result;
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',true);
  call_state := public.get_worth_it_chat_call_state(call_id,0);
  if call_state->>'status' is distinct from 'ended'
     or call_state->>'ended_by_user_id' is distinct from '00000000-0000-4000-8000-000000000011'
     or call_state->>'ended_by_name' is distinct from 'Call Friend Two' then
    raise exception 'The caller should receive the display name of the user who ended the call: %', call_state;
  end if;
  raise notice 'Call-end display-name attribution smoke checks passed.';
end
$smoke$;
