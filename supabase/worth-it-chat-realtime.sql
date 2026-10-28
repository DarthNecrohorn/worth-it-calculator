begin;

set local lock_timeout = '5s';

-- Realtime topics are scoped to existing server-enforced chat membership.
-- The single global-chat topic is available to any signed-in member.
create or replace function public.worth_it_chat_realtime_topic_authorized(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    actor_id uuid := auth.uid();
    target_id uuid;
begin
    if actor_id is null or p_topic is null then
        return false;
    end if;

    if p_topic = 'worthit-chat:00000000-0000-4000-8000-000000000001' then
        return true;
    end if;

    if p_topic !~ '^worthit-chat:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        return false;
    end if;

    target_id := substring(p_topic from length('worthit-chat:') + 1)::uuid;

    return exists (
        select 1
          from public.worth_it_chat_members as member
         where member.conversation_id = target_id
           and member.user_id = actor_id
    );
exception
    when others then
        return false;
end;
$function$;

revoke all on function public.worth_it_chat_realtime_topic_authorized(text) from public, anon;
grant execute on function public.worth_it_chat_realtime_topic_authorized(text) to authenticated;

-- Keep Broadcast and Presence on the same authorization rules.
drop policy if exists "Worth It chat realtime members can receive" on realtime.messages;
create policy "Worth It chat realtime members can receive"
    on realtime.messages
    for select
    to authenticated
    using (
        extension in ('broadcast', 'presence')
        and (select public.worth_it_chat_realtime_topic_authorized((select realtime.topic())))
    );

drop policy if exists "Worth It chat realtime members can send" on realtime.messages;
create policy "Worth It chat realtime members can send"
    on realtime.messages
    for insert
    to authenticated
    with check (
        extension in ('broadcast', 'presence')
        and (select public.worth_it_chat_realtime_topic_authorized((select realtime.topic())))
    );

-- Broadcast only IDs after a message row changes. Clients re-read messages
-- through get_worth_it_chat_messages(), preserving existing access and hide rules.
create or replace function public.broadcast_worth_it_chat_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    target_conversation_id uuid;
    target_message_id bigint;
begin
    if TG_OP = 'DELETE' then
        target_conversation_id := OLD.conversation_id;
        target_message_id := OLD.id;
    else
        target_conversation_id := NEW.conversation_id;
        target_message_id := NEW.id;
    end if;

    perform realtime.send(
        jsonb_build_object(
            'conversation_id', target_conversation_id::text,
            'message_id', target_message_id,
            'operation', TG_OP
        ),
        'message_changed',
        'worthit-chat:' || target_conversation_id::text,
        true
    );

    return null;
end;
$function$;

revoke all on function public.broadcast_worth_it_chat_message_change() from public, anon, authenticated;

drop trigger if exists worth_it_chat_messages_realtime_broadcast on public.worth_it_chat_messages;
create trigger worth_it_chat_messages_realtime_broadcast
    after insert or update or delete
    on public.worth_it_chat_messages
    for each row
    execute function public.broadcast_worth_it_chat_message_change();

commit;
