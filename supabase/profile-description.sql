-- Worth It public profile descriptions with a database-enforced 10-minute save limit.
-- Run once in Supabase Dashboard -> SQL Editor after the Worth It profile and avatar setup.

alter table public.worth_it_profiles
    add column if not exists description text not null default '',
    add column if not exists description_changed_at timestamptz;

-- Keep all current public profile fields and append the description for anonymous and signed-in visitors.
create or replace view public.worth_it_public_profiles as
select
    worth_it_id,
    username,
    coalesce(display_name, username, 'Worth It member') as display_name,
    avatar_url,
    created_at,
    banner_url,
    description
from public.worth_it_profiles;

grant select on public.worth_it_public_profiles to anon, authenticated;

-- A locked row makes the cooldown atomic even if two save requests arrive together.
create or replace function public.update_worth_it_profile_description(
    p_user_id uuid,
    p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_description text;
    v_profile public.worth_it_profiles%rowtype;
    v_now timestamptz;
    v_next timestamptz;
    v_remaining_ms bigint;
begin
    v_description := btrim(coalesce(p_description, ''));

    if char_length(v_description) > 500 then
        return jsonb_build_object('success', false, 'code', 'INVALID_DESCRIPTION', 'error', 'Your description can contain up to 500 characters.');
    end if;

    select * into v_profile from public.worth_it_profiles where user_id = p_user_id for update;

    if not found then
        return jsonb_build_object('success', false, 'code', 'PROFILE_NOT_FOUND', 'error', 'Your Worth It profile could not be found.');
    end if;

    v_now := clock_timestamp();

    if v_profile.description is not distinct from v_description then
        v_next := case when v_profile.description_changed_at is not null and v_profile.description_changed_at + interval '10 minutes' > v_now
            then v_profile.description_changed_at + interval '10 minutes' else null end;
        v_remaining_ms := case when v_next is null then 0
            else greatest(0, ceil(extract(epoch from (v_next - v_now)) * 1000)::bigint) end;
        return jsonb_build_object(
            'success', true, 'unchanged', true, 'description', coalesce(v_profile.description, ''),
            'changed_at', v_profile.description_changed_at, 'can_save', v_next is null,
            'next_save_at', v_next, 'remaining_ms', v_remaining_ms
        );
    end if;

    if v_profile.description_changed_at is not null then
        v_next := v_profile.description_changed_at + interval '10 minutes';
        if v_next > v_now then
            v_remaining_ms := greatest(0, ceil(extract(epoch from (v_next - v_now)) * 1000)::bigint);
            return jsonb_build_object(
                'success', false, 'code', 'PROFILE_DESCRIPTION_COOLDOWN',
                'error', 'You can save a new profile description only once every 10 minutes.',
                'description', coalesce(v_profile.description, ''), 'changed_at', v_profile.description_changed_at,
                'can_save', false, 'next_save_at', v_next, 'remaining_ms', v_remaining_ms
            );
        end if;
    end if;

    update public.worth_it_profiles
    set description = v_description, description_changed_at = v_now, updated_at = v_now
    where user_id = p_user_id;

    return jsonb_build_object(
        'success', true, 'unchanged', false, 'description', v_description, 'changed_at', v_now,
        'can_save', false, 'next_save_at', v_now + interval '10 minutes', 'remaining_ms', 600000
    );
end;
$$;

revoke all on function public.update_worth_it_profile_description(uuid, text) from public, anon, authenticated;
grant execute on function public.update_worth_it_profile_description(uuid, text) to service_role;
