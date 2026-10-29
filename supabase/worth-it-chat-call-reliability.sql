-- Track which authenticated participant explicitly ended a call.
-- Preserve existing call RPCs by patching only exact, validated fragments.
begin;

alter table public.worth_it_chat_calls
  add column if not exists ended_by_user_id uuid references auth.users(id) on delete set null;

do $migration$
declare
  respond_definition text;
  state_definition text;
  old_end_update text := $old$update public.worth_it_chat_calls set status='ended',ended_at=now(),updated_at=now()
      where id=p_call_id;$old$;
  new_end_update text := $new$update public.worth_it_chat_calls set status='ended',ended_by_user_id=actor_id,ended_at=now(),updated_at=now()
      where id=p_call_id;$new$;
  old_state_fields text := $oldstate$'answer',call_row.answer,'signals',signals$oldstate$;
  new_state_fields text := $newstate$'answer',call_row.answer,'signals',signals,
     'ended_by_user_id',call_row.ended_by_user_id,
     'ended_by_name',(select coalesce(p.display_name,p.username,'Worth It member')
       from public.worth_it_profiles p where p.user_id=call_row.ended_by_user_id)$newstate$;
begin
  respond_definition := pg_get_functiondef('public.respond_worth_it_chat_call(uuid,text,jsonb)'::regprocedure);
  if position(new_end_update in respond_definition) = 0 then
    if position(old_end_update in respond_definition) = 0 then
      raise exception 'Could not safely add ended-by attribution to respond_worth_it_chat_call.';
    end if;
    respond_definition := replace(respond_definition, old_end_update, new_end_update);
    execute respond_definition;
  end if;

  state_definition := pg_get_functiondef('public.get_worth_it_chat_call_state(uuid,bigint)'::regprocedure);
  if position(new_state_fields in state_definition) = 0 then
    if position(old_state_fields in state_definition) = 0 then
      raise exception 'Could not safely add ended-by display name to get_worth_it_chat_call_state.';
    end if;
    state_definition := replace(state_definition, old_state_fields, new_state_fields);
    execute state_definition;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
commit;
