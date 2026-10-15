-- Runtime smoke/regression checks against the disposable PostgreSQL database from CI.
DO $$
DECLARE
    actor_id CONSTANT uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private_id CONSTANT uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    friend_id CONSTANT uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    prefs jsonb;
    result jsonb;
    direct_conversation jsonb;
    item jsonb;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', actor_id::text, false);

    -- Preferences must default safely and only expose the actor's own settings.
    prefs := public.get_worth_it_user_preferences();
    IF prefs->'privacy'->>'profile_visibility' <> 'public' THEN
        RAISE EXCEPTION 'Expected public profile visibility by default';
    END IF;
    IF coalesce((prefs->'notifications'->>'friend_requests')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Expected friend-request notifications enabled by default';
    END IF;

    result := public.save_worth_it_user_preferences(
        '{"profile_visibility":"public","profile_discoverable":true,"show_online_status":true,"show_connections":true}'::jsonb,
        '{"friend_requests":false,"follows":false,"private_messages":false,"group_chats":false,"account_activity":false}'::jsonb
    );
    IF result->>'success' = 'false' THEN
        RAISE EXCEPTION 'Saving valid preferences failed: %', result;
    END IF;
    IF public.save_worth_it_user_preferences(
        '{"profile_visibility":"everything","profile_discoverable":true,"show_online_status":true,"show_connections":true}'::jsonb,
        '{"friend_requests":true,"follows":true,"private_messages":true,"group_chats":true,"account_activity":true}'::jsonb
    )->>'code' <> 'INVALID_PROFILE_VISIBILITY' THEN
        RAISE EXCEPTION 'Invalid visibility value was not rejected';
    END IF;

    -- A private target must not leak into the public view or permit social actions
    -- just because a caller knows the numeric Worth It ID.
    INSERT INTO public.worth_it_user_preferences(
        user_id,profile_visibility,profile_discoverable,show_online_status,show_connections
    ) VALUES (private_id,'private',true,true,false)
    ON CONFLICT (user_id) DO UPDATE SET
        profile_visibility=excluded.profile_visibility,
        profile_discoverable=excluded.profile_discoverable,
        show_online_status=excluded.show_online_status,
        show_connections=excluded.show_connections;

    IF EXISTS (SELECT 1 FROM public.worth_it_public_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'Private profile was visible to a non-owner';
    END IF;
    IF public.follow_worth_it_user(102)->>'code' <> 'PROFILE_NOT_FOUND' THEN
        RAISE EXCEPTION 'Following a hidden profile was not blocked';
    END IF;
    IF public.send_worth_it_friend_request(102)->>'code' <> 'PROFILE_NOT_FOUND' THEN
        RAISE EXCEPTION 'Friend request to a hidden profile was not blocked';
    END IF;
    IF public.get_worth_it_profile_connections(102,'friends')->>'code' <> 'PROFILE_NOT_FOUND' THEN
        RAISE EXCEPTION 'Connections of a hidden profile were not blocked';
    END IF;

    -- Friends-only must also stay hidden until an accepted friendship exists.
    UPDATE public.worth_it_user_preferences
       SET profile_visibility='friends'
     WHERE user_id=private_id;
    IF EXISTS (SELECT 1 FROM public.worth_it_public_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'Friends-only profile was visible to a non-friend';
    END IF;
    INSERT INTO public.worth_it_friends(user_low_id,user_high_id)
    VALUES (actor_id,private_id);

    IF NOT EXISTS (SELECT 1 FROM public.worth_it_public_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'Friends-only profile should be visible to an accepted friend';
    END IF;
    result := public.get_worth_it_profile_stats(102);
    IF result->>'hidden' <> 'true' OR result->>'friends' <> 'null' THEN
        RAISE EXCEPTION 'Connection totals should be hidden from another user: %', result;
    END IF;

    -- The owner must still see their own connection totals and list while hidden
    -- from everyone else.
    PERFORM set_config('request.jwt.claim.sub', private_id::text, false);
    result := public.get_worth_it_profile_stats(102);
    IF result->>'hidden' <> 'false' OR result->>'friends' <> '1' THEN
        RAISE EXCEPTION 'Profile owner lost access to own stats: %', result;
    END IF;
    result := public.get_worth_it_profile_connections(102,'friends');
    IF result->>'hidden' <> 'false'
       OR jsonb_array_length(result->'connections') <> 1
       OR result->'connections'->0->>'worth_it_id' <> '101' THEN
        RAISE EXCEPTION 'Profile owner lost access to own connection list: %', result;
    END IF;

    -- Hit all connection query branches; invalid categories must be rejected.
    PERFORM public.get_worth_it_profile_connections(102,'followers');
    PERFORM public.get_worth_it_profile_connections(102,'following');
    IF public.get_worth_it_profile_connections(102,'bogus')->>'code' <> 'INVALID_CONNECTION_TYPE' THEN
        RAISE EXCEPTION 'Invalid connection type was not rejected';
    END IF;

    -- Remove the temporary friendship before verifying the hidden-profile path.
    DELETE FROM public.worth_it_friends
    WHERE user_low_id=actor_id AND user_high_id=private_id;
    UPDATE public.worth_it_user_preferences
       SET profile_visibility='private'
     WHERE user_id=private_id;

    -- Return to actor context and check social state/search without exposing hidden
    -- profiles to someone who is not allowed to view them.
    PERFORM set_config('request.jwt.claim.sub', actor_id::text, false);
    IF public.get_worth_it_profile_social_context(102)->>'code' <> 'PROFILE_NOT_FOUND' THEN
        RAISE EXCEPTION 'Social context exposed a private profile';
    END IF;
    PERFORM public.search_worth_it_public_profiles('actor',20);
    IF public.search_worth_it_public_profiles('privateuser',20) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Search returned a profile that the caller cannot view';
    END IF;

    -- Notification preference gates and feed queries should work at runtime.
    result := public.get_worth_it_pending_friend_request_notifications();
    IF result <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Disabled friend-request notifications should return an empty feed';
    END IF;
    UPDATE public.worth_it_user_preferences
       SET notify_friend_requests=true, notify_follows=true, notify_account_activity=true
     WHERE user_id=actor_id;
    result := public.get_worth_it_pending_friend_request_notifications();
    IF jsonb_array_length(result) <> 1 THEN
        RAISE EXCEPTION 'Expected one pending friend-request notification, got %', result;
    END IF;
    INSERT INTO public.worth_it_social_notifications(recipient_user_id,actor_user_id,notification_type)
    VALUES (actor_id,friend_id,'follow');
    result := public.get_worth_it_social_notifications();
    IF jsonb_array_length(result) <> 1 OR result->0->>'type' <> 'follow' THEN
        RAISE EXCEPTION 'Follow notification was not returned: %', result;
    END IF;
    UPDATE public.worth_it_user_preferences SET notify_follows=false WHERE user_id=actor_id;
    IF public.get_worth_it_social_notifications() <> '[]'::jsonb THEN
        RAISE EXCEPTION 'Disabled follow notifications should be hidden';
    END IF;
    UPDATE public.worth_it_user_preferences SET notify_follows=true WHERE user_id=actor_id;

    -- Chat views must retain membership and read-receipt behavior while masking
    -- a friend's online/last-seen timestamp when that friend opts out.
    INSERT INTO public.worth_it_user_preferences(
        user_id,profile_visibility,profile_discoverable,show_online_status,show_connections
    ) VALUES (friend_id,'public',true,false,true)
    ON CONFLICT (user_id) DO UPDATE SET
        profile_visibility=excluded.profile_visibility,
        profile_discoverable=excluded.profile_discoverable,
        show_online_status=excluded.show_online_status,
        show_connections=excluded.show_connections;

    result := public.get_worth_it_chat_friends();
    SELECT value INTO item
    FROM jsonb_array_elements(result) value
    WHERE value->>'worth_it_id'='103';
    IF item IS NULL OR item->>'show_online_status' <> 'false' OR item->'last_seen_at' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'Chat friend list leaked hidden presence: %', result;
    END IF;

    result := public.get_worth_it_chat_conversations();
    SELECT value INTO direct_conversation
    FROM jsonb_array_elements(result) value
    WHERE value->>'type'='direct';
    IF direct_conversation IS NULL
       OR direct_conversation->'members'->0->>'show_online_status' <> 'false'
       OR direct_conversation->'members'->0->'last_seen_at' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'Conversation member list leaked hidden presence: %', result;
    END IF;

    result := public.get_worth_it_chat_messages(
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,100
    );
    IF jsonb_array_length(result) <> 1
       OR result->0->>'show_online_status' <> 'false'
       OR result->0->'last_seen_at' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'Chat messages leaked hidden presence: %', result;
    END IF;

    -- After making the target profile public again and removing the test friendship,
    -- social writes should take the normal visible-profile path.
    DELETE FROM public.worth_it_friends
    WHERE user_low_id=actor_id AND user_high_id=private_id;
    UPDATE public.worth_it_user_preferences SET profile_visibility='public' WHERE user_id=private_id;
    UPDATE public.worth_it_friend_requests
       SET status='declined'
     WHERE user_low_id=actor_id AND user_high_id=private_id;
    result := public.send_worth_it_friend_request(102);
    IF result->>'success' <> 'true' OR result->>'status' <> 'pending' THEN
        RAISE EXCEPTION 'Friend request to public profile failed: %', result;
    END IF;
    result := public.follow_worth_it_user(102);
    IF result->>'success' <> 'true' OR result->>'is_following' <> 'true' THEN
        RAISE EXCEPTION 'Following a public profile failed: %', result;
    END IF;

    -- Own-profile reads stay available via a narrow authenticated function.
    result := public.get_worth_it_own_profile();
    IF result->>'worth_it_id' <> '101' OR result->>'username' <> 'actor' THEN
        RAISE EXCEPTION 'own-profile RPC returned the wrong account: %', result;
    END IF;
    IF has_function_privilege('anon','public.get_worth_it_own_profile()','EXECUTE') THEN
        RAISE EXCEPTION 'anon unexpectedly has access to the own-profile RPC';
    END IF;
    IF NOT has_function_privilege('authenticated','public.get_worth_it_own_profile()','EXECUTE') THEN
        RAISE EXCEPTION 'authenticated is missing the own-profile RPC';
    END IF;

    -- Function permissions and column grants must not expose internal profile fields.
    IF has_function_privilege('anon','public.save_worth_it_user_preferences(jsonb,jsonb)','EXECUTE') THEN
        RAISE EXCEPTION 'anon unexpectedly has execute access to preference writes';
    END IF;
    IF NOT has_function_privilege('authenticated','public.save_worth_it_user_preferences(jsonb,jsonb)','EXECUTE') THEN
        RAISE EXCEPTION 'authenticated is missing execute access to preference writes';
    END IF;
    IF has_column_privilege('anon','public.worth_it_profiles','user_id','SELECT')
       OR has_column_privilege('authenticated','public.worth_it_profiles','user_id','SELECT') THEN
        RAISE EXCEPTION 'browser roles unexpectedly have SELECT on profile user_id';
    END IF;
    IF has_column_privilege('anon','public.worth_it_profiles','last_seen_at','SELECT')
       OR has_column_privilege('authenticated','public.worth_it_profiles','last_seen_at','SELECT') THEN
        RAISE EXCEPTION 'browser roles unexpectedly have SELECT on raw last_seen_at';
    END IF;
    IF NOT has_column_privilege('anon','public.worth_it_profiles','worth_it_id','SELECT') THEN
        RAISE EXCEPTION 'anon is missing the allowed public-profile columns';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        CROSS JOIN LATERAL unnest(c.reloptions) AS opts(value)
        WHERE c.oid = 'public.worth_it_public_profiles'::regclass
          AND opts.value = 'security_invoker=true'
    ) THEN
        RAISE EXCEPTION 'public profile view is not configured with security_invoker=true';
    END IF;

    IF to_regprocedure('public.can_view_worth_it_profile(uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'profile visibility helper is still exposed in the public RPC schema';
    END IF;
    IF to_regprocedure('worth_it_private.can_view_worth_it_profile(uuid)') IS NULL THEN
        RAISE EXCEPTION 'internal profile visibility helper is missing';
    END IF;
    IF NOT has_function_privilege('anon','worth_it_private.can_view_worth_it_profile(uuid)','EXECUTE')
       OR NOT has_function_privilege('authenticated','worth_it_private.can_view_worth_it_profile(uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'browser roles are missing the internal helper privilege required by RLS';
    END IF;
END;
$$;


-- Exercise the public profile surface as the actual database roles, not just as
-- the postgres owner running the assertions above.
UPDATE public.worth_it_user_preferences
   SET profile_visibility='private'
 WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE anon;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.worth_it_public_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'anon role can see a private profile in the public view';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.worth_it_public_profiles WHERE worth_it_id=101) THEN
        RAISE EXCEPTION 'anon role cannot see a public profile';
    END IF;
    IF public.search_worth_it_public_profiles('privateuser',20) <> '[]'::jsonb THEN
        RAISE EXCEPTION 'anon RPC search bypassed profile visibility';
    END IF;
    BEGIN
        PERFORM public.get_worth_it_user_preferences();
        RAISE EXCEPTION 'anon unexpectedly read personal preferences';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    IF EXISTS (SELECT worth_it_id FROM public.worth_it_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'anon read a private profile directly from the base table';
    END IF;
    IF NOT EXISTS (SELECT worth_it_id FROM public.worth_it_profiles WHERE worth_it_id=101) THEN
        RAISE EXCEPTION 'anon cannot read an allowed public profile column';
    END IF;
    BEGIN
        PERFORM user_id FROM public.worth_it_profiles;
        RAISE EXCEPTION 'anon unexpectedly read internal profile user IDs';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    BEGIN
        PERFORM last_seen_at FROM public.worth_it_profiles;
        RAISE EXCEPTION 'anon unexpectedly read unmasked last-seen timestamps';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;
RESET ROLE;

-- A signed-in accepted friend may see a friends-only profile through the view,
-- but still cannot read another person's base profile row or preference table.
UPDATE public.worth_it_user_preferences
   SET profile_visibility='friends'
 WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
INSERT INTO public.worth_it_friends(user_low_id,user_high_id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SET ROLE authenticated;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.worth_it_public_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'accepted friend cannot see friends-only profile via view';
    END IF;
    IF NOT EXISTS (SELECT worth_it_id FROM public.worth_it_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'accepted friend cannot read the allowed profile column through RLS';
    END IF;
    BEGIN
        PERFORM user_id FROM public.worth_it_profiles;
        RAISE EXCEPTION 'authenticated role unexpectedly read internal profile user IDs';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    BEGIN
        PERFORM last_seen_at FROM public.worth_it_profiles;
        RAISE EXCEPTION 'authenticated role unexpectedly read unmasked last-seen timestamps';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    BEGIN
        PERFORM 1 FROM public.worth_it_user_preferences;
        RAISE EXCEPTION 'authenticated role unexpectedly read the preference table directly';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;
RESET ROLE;

-- Removing friendship and switching the profile to private must hide it from
-- both the invoker view and direct column-limited table reads.
UPDATE public.worth_it_user_preferences
   SET profile_visibility='private'
 WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DELETE FROM public.worth_it_friends
 WHERE user_low_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
   AND user_high_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT worth_it_id FROM public.worth_it_public_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'private profile remains visible in the invoker view after friendship removal';
    END IF;
    IF EXISTS (SELECT worth_it_id FROM public.worth_it_profiles WHERE worth_it_id=102) THEN
        RAISE EXCEPTION 'private profile remains visible through the base table after friendship removal';
    END IF;
END;
$$;
RESET ROLE;
