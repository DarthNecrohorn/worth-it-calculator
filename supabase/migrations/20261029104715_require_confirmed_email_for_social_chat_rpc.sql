-- Ensure an authenticated account without a confirmed email has no member-level
-- chat/friend/notification privileges, even when calling Supabase RPCs directly.
-- Public profile-context functions are intentionally left available to guests.
do $migration$
declare
    target record;
    updated_definition text;
    found_count integer := 0;
    guard_body constant text := trim(leading E'\n' from $guard$
    IF NOT EXISTS (
        SELECT 1
          FROM auth.users AS verified_user
         WHERE verified_user.id = auth.uid()
           AND verified_user.email_confirmed_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Email confirmation required'
            USING ERRCODE = '42501';
    END IF;

$guard$);
begin
    for target in
        select p.oid, p.proname, pg_get_functiondef(p.oid) as definition
          from pg_proc as p
          join pg_namespace as n on n.oid = p.pronamespace
          join pg_language as language on language.oid = p.prolang
         where n.nspname = 'public'
           and language.lanname = 'plpgsql'
           and p.prosecdef
           and has_function_privilege('authenticated', p.oid, 'EXECUTE')
           and p.proname = any (array[
               'cancel_worth_it_friend_request',
               'clear_worth_it_chat_history',
               'create_worth_it_group_chat',
               'delete_worth_it_chat_message',
               'delete_worth_it_group_chat',
               'dismiss_worth_it_notification',
               'get_worth_it_chat_conversations',
               'get_worth_it_chat_friends',
               'get_worth_it_chat_messages',
               'get_worth_it_chat_notification_preferences',
               'get_worth_it_pending_friend_request_notifications',
               'get_worth_it_pending_friend_requests',
               'get_worth_it_social_notifications',
               'hide_worth_it_chat_message',
               'leave_worth_it_group_chat',
               'mark_worth_it_social_notifications_read',
               'open_worth_it_friend_chat',
               'respond_worth_it_friend_request',
               'send_worth_it_friend_request',
               'set_worth_it_chat_conversation_pinned',
               'set_worth_it_chat_notifications',
               'unfriend_worth_it_user_with_reason',
               'worth_it_chat_realtime_topic_authorized'
           ])
    loop
        found_count := found_count + 1;

        -- Make the migration safely repeatable; an earlier run may already have
        -- put this check into the stored function definition.
        if position('email_confirmed_at' in lower(target.definition)) > 0 then
            continue;
        end if;

        updated_definition := regexp_replace(
            target.definition,
            E'(\r?\n[[:space:]]*begin\r?\n)',
            E'\\1' || guard_body,
            'i'
        );

        if updated_definition = target.definition
           or position('email_confirmed_at' in lower(updated_definition)) = 0 then
            raise exception 'Could not add the email-confirmation guard to public.%', target.proname;
        end if;

        execute updated_definition;
    end loop;

    if found_count <> 23 then
        raise exception 'Expected 23 protected chat/social RPCs, found %', found_count;
    end if;
end;
$migration$;
