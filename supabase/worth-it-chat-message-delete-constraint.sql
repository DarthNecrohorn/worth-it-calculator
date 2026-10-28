begin;

-- Deleted messages intentionally clear their body and attachment metadata.
-- Keep the normal non-empty rule for all live messages while allowing a
-- tombstone row to satisfy the constraint after deleted_at is set.
set local lock_timeout = '5s';

alter table public.worth_it_chat_messages
  drop constraint if exists worth_it_chat_message_not_empty,
  add constraint worth_it_chat_message_not_empty
    check (
      char_length(btrim(body)) > 0
      or media_url is not null
      or deleted_at is not null
    );

commit;
