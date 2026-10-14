-- Worth It display-name editor with a server-enforced seven-day cooldown.
-- Run once in Supabase Dashboard -> SQL Editor before using the new editor.

alter table public.worth_it_profiles
    add column if not exists display_name_changed_at timestamptz;

-- Preserve an existing profile display name when auth metadata is refreshed; new profiles seed it from auth metadata.
create or replace function public.sync_worth_it_profile_from_auth_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
    desired_username text;
    desired_display_name text;
    desired_avatar_url text;
begin
    desired_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
    desired_display_name := coalesce(
        nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(new.raw_user_meta_data->>'name'), ''),
        desired_username,
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Worth It member'
    );
    desired_avatar_url := coalesce(
        nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
        nullif(trim(new.raw_user_meta_data->>'picture'), '')
    );

    if tg_op = 'UPDATE' then
        update public.worth_it_profiles as profile
        set username = coalesce(desired_username, profile.username),
            display_name = profile.display_name,
            avatar_url = case
                when profile.avatar_is_custom then profile.avatar_url
                else coalesce(desired_avatar_url, profile.avatar_url)
            end,
            updated_at = now()
        where profile.user_id = new.id;
        if found then return new; end if;
    end if;

    insert into public.worth_it_profiles(
        user_id, worth_it_id, username, display_name, avatar_url, created_at, updated_at
    )
    values (
        new.id,
        case when lower(coalesce(new.email, '')) = 'pedjasebez3545@gmail.com'
            then 1 else nextval('public.worth_it_id_seq') end,
        desired_username, desired_display_name, desired_avatar_url, coalesce(new.created_at, now()), now()
    )
    on conflict (user_id) do update set
        username = coalesce(excluded.username, public.worth_it_profiles.username),
        display_name = public.worth_it_profiles.display_name,
        avatar_url = case
            when public.worth_it_profiles.avatar_is_custom then public.worth_it_profiles.avatar_url
            else coalesce(excluded.avatar_url, public.worth_it_profiles.avatar_url)
        end,
        updated_at = now();

    return new;
end;
$$;

-- Run cooldown checks and the write atomically under a row lock.
create or replace function public.update_worth_it_display_name(
    p_user_id uuid,
    p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_name text;
    v_moderated_name text;
    v_current public.worth_it_profiles%rowtype;
    v_now timestamptz;
    v_next timestamptz;
    v_remaining_ms bigint;
begin
    v_name := btrim(coalesce(p_display_name, ''));

    if char_length(v_name) < 3
       or char_length(v_name) > 20
       or v_name !~ '^[A-Za-z0-9]+(_[A-Za-z0-9]+)?$' then
        return jsonb_build_object(
            'success', false,
            'code', 'INVALID_DISPLAY_NAME',
            'error', 'Display name must be 3–20 characters using only letters, numbers, and at most one underscore between them. Spaces and other symbols are not allowed.'
        );
    end if;

    v_moderated_name := translate(lower(replace(v_name, '_', '')), '01345789', 'oieastbg');

    if v_moderated_name ~ '(fuck|shit|bitch|cunt|dick|cock|pussy|whore|slut|bastard|asshole|arsehole|motherfucker|bullshit|dumbass|jackass|nigger|nigga|faggot|retard|retarded|pedo|pedophile|porn|xxx|blowjob|handjob|jizz|rape|rapist|nazi|hitler|kkk)' then
        return jsonb_build_object(
            'success', false,
            'code', 'INVALID_DISPLAY_NAME',
            'error', 'This display name contains language that is not allowed on Worth It.'
        );
    end if;

    if v_moderated_name ~ '^(admin|administrator|moderator|mod|staff|support|official|security|owner|root|worthit)([0-9]+)?$' then
        return jsonb_build_object(
            'success', false,
            'code', 'INVALID_DISPLAY_NAME',
            'error', 'This display name is reserved and cannot be used.'
        );
    end if;

    if length(regexp_replace(v_name, '[^0-9]', '', 'g')) >= 7 then
        return jsonb_build_object(
            'success', false,
            'code', 'INVALID_DISPLAY_NAME',
            'error', 'Display names cannot contain phone numbers or other long numeric identifiers.'
        );
    end if;

    select * into v_current
    from public.worth_it_profiles
    where user_id = p_user_id
    for update;

    if not found then
        return jsonb_build_object(
            'success', false,
            'code', 'PROFILE_NOT_FOUND',
            'error', 'Your Worth It profile could not be found.'
        );
    end if;

    v_now := clock_timestamp();

    if v_current.display_name is not distinct from v_name then
        v_next := case
            when v_current.display_name_changed_at is not null
                 and v_current.display_name_changed_at + interval '7 days' > v_now
            then v_current.display_name_changed_at + interval '7 days'
            else null
        end;
        v_remaining_ms := case when v_next is null then 0
            else greatest(0, ceil(extract(epoch from (v_next - v_now)) * 1000)::bigint) end;
        return jsonb_build_object(
            'success', true,
            'unchanged', true,
            'display_name', v_current.display_name,
            'can_change', v_next is null,
            'next_change_at', v_next,
            'remaining_ms', v_remaining_ms
        );
    end if;

    if v_current.display_name_changed_at is not null then
        v_next := v_current.display_name_changed_at + interval '7 days';
        if v_next > v_now then
            v_remaining_ms := greatest(0, ceil(extract(epoch from (v_next - v_now)) * 1000)::bigint);
            return jsonb_build_object(
                'success', false,
                'code', 'DISPLAY_NAME_COOLDOWN',
                'error', 'You can change your display name only once every 7 days.',
                'next_change_at', v_next,
                'remaining_ms', v_remaining_ms
            );
        end if;
    end if;

    update public.worth_it_profiles
    set display_name = v_name,
        display_name_changed_at = v_now,
        updated_at = v_now
    where user_id = p_user_id;

    return jsonb_build_object(
        'success', true,
        'unchanged', false,
        'display_name', v_name,
        'changed_at', v_now,
        'next_change_at', v_now + interval '7 days',
        'remaining_ms', 604800000
    );
end;
$$;

revoke all on function public.update_worth_it_display_name(uuid, text) from public, anon, authenticated;
grant execute on function public.update_worth_it_display_name(uuid, text) to service_role;
