-- Cover newly added foreign keys so account deletion and conversation deletion
-- do not need to scan the full chat message/state tables.
begin;

create index if not exists worth_it_chat_history_clears_conversation_id_idx
  on public.worth_it_chat_history_clears(conversation_id);

create index if not exists worth_it_chat_conversation_pins_conversation_id_idx
  on public.worth_it_chat_conversation_pins(conversation_id);

create index if not exists worth_it_chat_messages_deleted_by_user_id_idx
  on public.worth_it_chat_messages(deleted_by_user_id);

-- These tables are intentionally RPC-only. An explicit deny policy is defense
-- in depth in case a future privilege change accidentally grants direct access.
drop policy if exists "No direct client access to chat message hides" on public.worth_it_chat_message_hides;
create policy "No direct client access to chat message hides"
  on public.worth_it_chat_message_hides for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "No direct client access to chat history clears" on public.worth_it_chat_history_clears;
create policy "No direct client access to chat history clears"
  on public.worth_it_chat_history_clears for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "No direct client access to chat conversation pins" on public.worth_it_chat_conversation_pins;
create policy "No direct client access to chat conversation pins"
  on public.worth_it_chat_conversation_pins for all to anon, authenticated
  using (false) with check (false);

commit;
