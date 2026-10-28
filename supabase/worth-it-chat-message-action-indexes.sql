-- Cover newly added foreign keys so account deletion and conversation deletion
-- do not need to scan the full chat message/state tables.
begin;

create index if not exists worth_it_chat_history_clears_conversation_id_idx
  on public.worth_it_chat_history_clears(conversation_id);

create index if not exists worth_it_chat_conversation_pins_conversation_id_idx
  on public.worth_it_chat_conversation_pins(conversation_id);

create index if not exists worth_it_chat_messages_deleted_by_user_id_idx
  on public.worth_it_chat_messages(deleted_by_user_id);

commit;
