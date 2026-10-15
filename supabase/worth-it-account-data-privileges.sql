-- Follow-up hardening for the already-applied Settings migration.
-- Keep the profile table read-only for API users and ensure the server-only
-- account-data endpoint has the least required access for export and cleanup.
-- This migration is idempotent and does not modify or delete application data.

begin;

-- The project's pre-existing default privileges gave API roles extra table-level
-- operations on worth_it_profiles. Clear those privileges, then re-grant only the
-- profile-card columns intentionally available through RLS.
revoke all privileges on table public.worth_it_profiles from public, anon, authenticated;

-- Remove unused column-level REFERENCES grants left by earlier default privileges.
do $$
declare
    column_item record;
begin
    for column_item in
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'worth_it_profiles'
    loop
        execute format(
            'revoke references (%I) on table public.worth_it_profiles from public, anon, authenticated',
            column_item.column_name
        );
    end loop;
end;
$$;

grant select (
    worth_it_id,
    username,
    display_name,
    avatar_url,
    created_at,
    banner_url,
    description
) on table public.worth_it_profiles to anon, authenticated;

-- The view is the supported public profile surface. Remove stale inherited
-- non-read privileges so its ACL stays intentionally SELECT-only.
revoke all privileges on table public.worth_it_public_profiles from public, anon, authenticated;
grant select on table public.worth_it_public_profiles to anon, authenticated;

-- The Cloudflare Pages /api/user-data handler verifies the user's Auth token,
-- uses the server-only service key, and filters exports to the verified user ID.
-- These SELECT grants are only for the tables read by that endpoint; they do not
-- grant any additional access to anon or authenticated users.
grant select on table
    public.worth_it_follows,
    public.worth_it_friends,
    public.worth_it_friend_requests,
    public.worth_it_social_notifications,
    public.worth_it_notification_dismissals,
    public.worth_it_chat_conversations,
    public.worth_it_chat_members,
    public.worth_it_chat_messages,
    public.worth_it_chat_notification_preferences
to service_role;

-- Feedback rows are captured before Auth deletion because user_id is set to NULL
-- by its FK. The server then deletes only the captured numeric IDs.
grant select, delete on table public.feedback to service_role;

commit;
