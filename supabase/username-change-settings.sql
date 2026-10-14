-- Worth It account settings: secure username changes with a 14-day cooldown.
-- Run this in Supabase Dashboard -> SQL Editor.
-- Account changes require an email-confirmed Supabase user and are executed atomically by this RPC.

alter table public.usernames
    add column if not exists username_changed_at timestamptz;

create or replace function public.update_worth_it_username(
    p_user_id uuid,
    p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_username text := btrim(coalesce(p_username, ''));
    v_moderated text;
    v_auth_user auth.users%rowtype;
    v_reserved public.usernames%rowtype;
    v_now timestamptz := clock_timestamp();
    v_next timestamptz;
    v_remaining_ms bigint;
begin
    if p_user_id is null then
        return jsonb_build_object('success', false, 'code', 'INVALID_REQUEST', 'error', 'Invalid account.');
    end if;

    if char_length(v_username) < 3
       or char_length(v_username) > 20
       or v_username !~ '^[A-Za-z0-9]+(_[A-Za-z0-9]+)?$' then
        return jsonb_build_object(
            'success', false, 'code', 'INVALID_USERNAME',
            'error', 'Username must be 3–20 characters using English letters and numbers, with at most one underscore.'
        );
    end if;

    v_moderated := translate(lower(replace(v_username, '_', '')), '01345789', 'oieastbg');
    if v_moderated ~ '(fuck|shit|bitch|cunt|dick|cock|pussy|whore|slut|bastard|asshole|arsehole|motherfucker|bullshit|dumbass|jackass|nigger|nigga|faggot|retard|retarded|pedo|pedophile|porn|xxx|blowjob|handjob|jizz|rape|rapist|nazi|hitler|kkk)' then
        return jsonb_build_object('success', false, 'code', 'INVALID_USERNAME', 'error', 'This username contains language that is not allowed on Worth It.');
    end if;
    if v_moderated ~ '^(admin|administrator|moderator|mod|staff|support|official|security|owner|root|worthit)([0-9]+)?$' then
        return jsonb_build_object('success', false, 'code', 'INVALID_USERNAME', 'error', 'This username is reserved and cannot be used.');
    end if;
    if length(regexp_replace(v_username, '[^0-9]', '', 'g')) >= 7 then
        return jsonb_build_object('success', false, 'code', 'INVALID_USERNAME', 'error', 'Usernames cannot contain long numeric identifiers.');
    end if;

    select * into v_auth_user
    from auth.users
    where id = p_user_id
    for update;

    if not found then
        return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND', 'error', 'The account could not be found.');
    end if;

    if v_auth_user.email_confirmed_at is null then
        return jsonb_build_object('success', false, 'code', 'EMAIL_VERIFICATION_REQUIRED', 'error', 'Verify your email address before changing your username.');
    end if;

    if coalesce(v_auth_user.raw_user_meta_data ->> 'username', '') = v_username then
        return jsonb_build_object('success', true, 'unchanged', true, 'username', v_username);
    end if;

    select * into v_reserved
    from public.usernames
    where user_id = p_user_id
    for update;

    if found and v_reserved.username_changed_at is not null then
        v_next := v_reserved.username_changed_at + interval '14 days';
        if v_next > v_now then
            v_remaining_ms := greatest(0, ceil(extract(epoch from (v_next - v_now)) * 1000)::bigint);
            return jsonb_build_object(
                'success', false, 'code', 'USERNAME_COOLDOWN',
                'error', 'You can change your username only once every 14 days.',
                'next_change_at', v_next, 'remaining_ms', v_remaining_ms
            );
        end if;
    end if;

    if found then
        update public.usernames
        set username = v_username, username_changed_at = v_now
        where user_id = p_user_id;
    else
        insert into public.usernames(username, user_id, username_changed_at)
        values (v_username, p_user_id, v_now);
    end if;

    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', v_username),
        updated_at = v_now
    where id = p_user_id;

    return jsonb_build_object(
        'success', true, 'unchanged', false, 'username', v_username,
        'changed_at', v_now, 'next_change_at', v_now + interval '14 days',
        'remaining_ms', 1209600000
    );
exception
    when unique_violation then
        return jsonb_build_object(
            'success', false, 'code', 'USERNAME_TAKEN',
            'error', 'This username is already taken.'
        );
end;
$$;

revoke all on function public.update_worth_it_username(uuid, text) from public, anon, authenticated;
grant execute on function public.update_worth_it_username(uuid, text) to service_role;
