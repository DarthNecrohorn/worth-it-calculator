-- Track which authenticated participant explicitly ended a call.
-- Preserve existing call RPCs by patching only exact, validated fragments.
begin;

alter table public.worth_it_chat_calls
  add column if not exists ended_by_user_id uuid references auth.users(id) on delete set null;

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
    'answer',call_row.answer,'signals',signals,
    'ended_by_user_id',call_row.ended_by_user_id,
    'ended_by_name',(select coalesce(p.display_name,p.username,'Worth It member')
      from public.worth_it_profiles p where p.user_id=call_row.ended_by_user_id)
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
    update public.worth_it_chat_calls set status='ended',ended_by_user_id=actor_id,ended_at=now(),updated_at=now()
     where id=p_call_id;
    return jsonb_build_object('success',true,'status','ended');
  end if;
  return jsonb_build_object('success',false,'code','INVALID_CALL_ACTION');
end;
$$;

revoke all on function public.get_worth_it_chat_call_state(uuid,bigint) from public, anon;
revoke all on function public.respond_worth_it_chat_call(uuid,text,jsonb) from public, anon;
grant execute on function public.get_worth_it_chat_call_state(uuid,bigint) to authenticated;
grant execute on function public.respond_worth_it_chat_call(uuid,text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
