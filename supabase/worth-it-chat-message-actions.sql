-- Worth It chat message actions.
-- Message deletion is represented by a tombstone for everyone; hides and
-- conversation-history clears are private to the acting user.
begin;

alter table public.worth_it_chat_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid
    references auth.users(id) on delete set null;

create table if not exists public.worth_it_chat_message_hides (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id bigint not null references public.worth_it_chat_messages(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists worth_it_chat_message_hides_message_idx
  on public.worth_it_chat_message_hides(message_id, user_id);

create table if not exists public.worth_it_chat_history_clears (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.worth_it_chat_conversations(id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

-- Persistent per-user pin state for private/group conversations. It never
-- changes membership or the underlying conversation and is private by design.
create table if not exists public.worth_it_chat_conversation_pins (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.worth_it_chat_conversations(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
create index if not exists worth_it_chat_conversation_pins_order_idx
  on public.worth_it_chat_conversation_pins(user_id, pinned_at);

alter table public.worth_it_chat_message_hides enable row level security;
alter table public.worth_it_chat_history_clears enable row level security;
alter table public.worth_it_chat_conversation_pins enable row level security;
revoke all on public.worth_it_chat_message_hides from public, anon, authenticated;
revoke all on public.worth_it_chat_history_clears from public, anon, authenticated;
revoke all on public.worth_it_chat_conversation_pins from public, anon, authenticated;


create or replace function public.set_worth_it_chat_conversation_pinned(
  p_conversation_id uuid,
  p_is_pinned boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_type text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_conversation_id is null or p_is_pinned is null then
    return jsonb_build_object('success', false, 'code', 'INVALID_PIN_REQUEST');
  end if;

  select conversation_type into target_type
    from public.worth_it_chat_conversations
   where id = p_conversation_id;
  if target_type is null then
    return jsonb_build_object('success', false, 'code', 'CHAT_NOT_FOUND');
  end if;
  if target_type = 'global' then
    return jsonb_build_object('success', false, 'code', 'GLOBAL_CHAT_PIN_NOT_SUPPORTED');
  end if;
  if not exists (
    select 1 from public.worth_it_chat_members
     where conversation_id = p_conversation_id and user_id = actor_id
  ) then
    return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
  end if;

  if p_is_pinned then
    insert into public.worth_it_chat_conversation_pins(user_id, conversation_id, pinned_at)
    values (actor_id, p_conversation_id, now())
    on conflict (user_id, conversation_id)
    do update set pinned_at = excluded.pinned_at;
  else
    delete from public.worth_it_chat_conversation_pins
     where user_id = actor_id and conversation_id = p_conversation_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'conversation_id', p_conversation_id,
    'is_pinned', p_is_pinned
  );
end;
$function$;

create or replace function public.delete_worth_it_chat_message(p_message_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  message_sender uuid;
  target_conversation uuid;
  target_type text;
  existing_deleted_at timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if p_message_id is null or p_message_id < 1 then
    return jsonb_build_object('success', false, 'code', 'INVALID_MESSAGE');
  end if;

  select m.sender_user_id, m.conversation_id, c.conversation_type, m.deleted_at
    into message_sender, target_conversation, target_type, existing_deleted_at
    from public.worth_it_chat_messages m
    join public.worth_it_chat_conversations c on c.id = m.conversation_id
   where m.id = p_message_id
   for update of m;

  if not found then
    return jsonb_build_object('success', false, 'code', 'MESSAGE_NOT_FOUND');
  end if;
  if message_sender is distinct from actor_id then
    return jsonb_build_object('success', false, 'code', 'NOT_MESSAGE_OWNER');
  end if;
  if target_type <> 'global' and not exists (
    select 1 from public.worth_it_chat_members
     where conversation_id = target_conversation and user_id = actor_id
  ) then
    return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
  end if;
  if existing_deleted_at is not null then
    return jsonb_build_object('success', true, 'already_deleted', true);
  end if;

  -- Purge the original text and public media URL, while retaining the small
  -- tombstone row so other participants can see that a message was deleted.
  update public.worth_it_chat_messages
     set body = '',
         media_url = null,
         media_type = null,
         filtered_reason = null,
         deleted_at = now(),
         deleted_by_user_id = actor_id
   where id = p_message_id;

  return jsonb_build_object('success', true, 'deleted', true, 'message_id', p_message_id);
end;
$function$;

create or replace function public.hide_worth_it_chat_message(p_message_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_conversation uuid;
  target_type text;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if p_message_id is null or p_message_id < 1 then
    return jsonb_build_object('success', false, 'code', 'INVALID_MESSAGE');
  end if;

  select m.conversation_id, c.conversation_type
    into target_conversation, target_type
    from public.worth_it_chat_messages m
    join public.worth_it_chat_conversations c on c.id = m.conversation_id
   where m.id = p_message_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'MESSAGE_NOT_FOUND');
  end if;
  if target_type <> 'global' and not exists (
    select 1 from public.worth_it_chat_members
     where conversation_id = target_conversation and user_id = actor_id
  ) then
    return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
  end if;

  insert into public.worth_it_chat_message_hides(user_id, message_id)
  values (actor_id, p_message_id)
  on conflict (user_id, message_id) do nothing;

  return jsonb_build_object('success', true, 'hidden', true, 'message_id', p_message_id);
end;
$function$;

create or replace function public.clear_worth_it_chat_history(p_conversation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid := coalesce(p_conversation_id, '00000000-0000-4000-8000-000000000001'::uuid);
  target_type text;
  cleared_at_value timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select c.conversation_type into target_type
    from public.worth_it_chat_conversations c
   where c.id = target_id;

  if target_type is null then
    return jsonb_build_object('success', false, 'code', 'CHAT_NOT_FOUND');
  end if;
  if target_type <> 'global' and not exists (
    select 1 from public.worth_it_chat_members
     where conversation_id = target_id and user_id = actor_id
  ) then
    return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
  end if;

  cleared_at_value := now();
  insert into public.worth_it_chat_history_clears(user_id, conversation_id, cleared_at)
  values (actor_id, target_id, cleared_at_value)
  on conflict (user_id, conversation_id)
  do update set cleared_at = excluded.cleared_at;

  -- The clear is personal, but it should also mark existing messages as read
  -- for this user so the unread badge does not immediately return.
  insert into public.worth_it_chat_members(conversation_id, user_id, last_read_at)
  values (target_id, actor_id, cleared_at_value)
  on conflict (conversation_id, user_id)
  do update set last_read_at = excluded.last_read_at;

  return jsonb_build_object('success', true, 'cleared_at', cleared_at_value);
end;
$function$;

-- Keep the existing RPC behavior and authorization logic, only adding private
-- hidden-message metadata and per-user history cutoffs to the existing query.
do $migration$
declare
  current_definition text;
  updated_definition text;
  old_message_fields text := $old$
            'id', m.id, 'body', m.body, 'media_url', m.media_url, 'media_type', m.media_type,
            'filtered_reason', m.filtered_reason, 'created_at', m.created_at, 'sender_user_id', m.sender_user_id,
$old$;
  new_message_fields text := $new$
            'id', m.id,
            'body', case when m.deleted_at is not null or hidden.message_id is not null then '' else m.body end,
            'media_url', case when m.deleted_at is not null or hidden.message_id is not null then null else m.media_url end,
            'media_type', case when m.deleted_at is not null or hidden.message_id is not null then null else m.media_type end,
            'is_deleted', m.deleted_at is not null,
            'is_hidden_by_me', hidden.message_id is not null,
            'deleted_by_display_name', case
                when hidden.message_id is not null then coalesce(actor_profile.display_name, actor_profile.username, 'Worth It member')
                when m.deleted_by_user_id is not null then coalesce(deleted_by_profile.display_name, deleted_by_profile.username, 'Worth It member')
                else null
            end,
            'filtered_reason', case when m.deleted_at is not null or hidden.message_id is not null then null else m.filtered_reason end,
            'created_at', m.created_at, 'sender_user_id', m.sender_user_id,
$new$;
  old_joins text := $old$
        left join public.worth_it_user_preferences prefs on prefs.user_id = p.user_id
        where m.conversation_id = target_id
$old$;
  new_joins text := $new$
        left join public.worth_it_user_preferences prefs on prefs.user_id = p.user_id
        left join public.worth_it_chat_message_hides hidden
          on hidden.message_id = m.id and hidden.user_id = actor_id
        left join public.worth_it_profiles actor_profile on actor_profile.user_id = actor_id
        left join public.worth_it_profiles deleted_by_profile on deleted_by_profile.user_id = m.deleted_by_user_id
        where m.conversation_id = target_id
          and m.created_at > coalesce((
              select hc.cleared_at from public.worth_it_chat_history_clears hc
               where hc.user_id = actor_id and hc.conversation_id = target_id
          ), '-infinity'::timestamptz)
$new$;
  old_pin_fields text := $old$
'id', c.id,
        'type', c.conversation_type,
$new$;
  new_pin_fields text := $new$
'id', c.id,
        'type', c.conversation_type,
        'is_pinned', exists (
            select 1 from public.worth_it_chat_conversation_pins pins
             where pins.user_id = actor_id and pins.conversation_id = c.id
        ),
$new$;
  old_preview_filter text := $old$
            where m.conversation_id = c.id
            order by m.id desc
            limit 1
$old$;
  new_preview_filter text := $new$
            where m.conversation_id = c.id
              and m.created_at > coalesce((
                  select hc.cleared_at from public.worth_it_chat_history_clears hc
                   where hc.user_id = actor_id and hc.conversation_id = c.id
              ), '-infinity'::timestamptz)
              and not exists (
                  select 1 from public.worth_it_chat_message_hides hidden_preview
                   where hidden_preview.message_id = m.id and hidden_preview.user_id = actor_id
              )
            order by m.id desc
            limit 1
$new$;
begin
  current_definition := pg_get_functiondef('public.get_worth_it_chat_messages(uuid,integer)'::regprocedure);
  if position(old_message_fields in current_definition) = 0 then
    raise exception 'Expected message JSON fields were not found in get_worth_it_chat_messages; review the function before migrating.';
  end if;
  if position(old_joins in current_definition) = 0 then
    raise exception 'Expected message joins were not found in get_worth_it_chat_messages; review the function before migrating.';
  end if;
  updated_definition := replace(current_definition, old_message_fields, new_message_fields);
  updated_definition := replace(updated_definition, old_joins, new_joins);
  execute updated_definition;

  current_definition := pg_get_functiondef('public.get_worth_it_chat_conversations()'::regprocedure);
  if position(old_pin_fields in current_definition) = 0 then
    raise exception 'Expected conversation JSON fields were not found in get_worth_it_chat_conversations; review the function before migrating.';
  end if;
  updated_definition := replace(current_definition, old_pin_fields, new_pin_fields);
  if position(old_preview_filter in updated_definition) = 0 then
    raise exception 'Expected last-message preview query was not found in get_worth_it_chat_conversations; review the function before migrating.';
  end if;
  updated_definition := replace(updated_definition, old_preview_filter, new_preview_filter);
  if position('''body'', m.body,' in updated_definition) = 0 then
    raise exception 'Expected last-message preview body was not found in get_worth_it_chat_conversations; review the function before migrating.';
  end if;
  updated_definition := replace(updated_definition, '''body'', m.body,', '''body'', case when m.deleted_at is not null then ''has deleted a message'' else m.body end,');
  execute updated_definition;
end
$migration$;

revoke all on function public.set_worth_it_chat_conversation_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_worth_it_chat_conversation_pinned(uuid, boolean) to authenticated;
revoke all on function public.delete_worth_it_chat_message(bigint) from public, anon;
revoke all on function public.hide_worth_it_chat_message(bigint) from public, anon;
revoke all on function public.clear_worth_it_chat_history(uuid) from public, anon;
grant execute on function public.delete_worth_it_chat_message(bigint) to authenticated;
grant execute on function public.hide_worth_it_chat_message(bigint) to authenticated;
grant execute on function public.clear_worth_it_chat_history(uuid) to authenticated;

commit;
