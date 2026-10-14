-- Worth It profile avatars: server-moderated public images only.
-- Run once in Supabase Dashboard -> SQL Editor after the profile system migration.
-- Do not add direct client upload policies for the worth-it-avatars storage bucket.

alter table public.worth_it_profiles
    add column if not exists avatar_is_custom boolean not null default false;
alter table public.worth_it_profiles
    add column if not exists avatar_last_attempt_at timestamptz;
alter table public.worth_it_profiles
    add column if not exists avatar_changed_at timestamptz;
alter table public.worth_it_profiles
    add column if not exists banner_url text;
alter table public.worth_it_profiles
    add column if not exists banner_last_attempt_at timestamptz;
alter table public.worth_it_profiles
    add column if not exists banner_changed_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worth-it-avatars', 'worth-it-avatars', true, 8388608, array['image/webp','image/gif'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
            display_name = coalesce(desired_display_name, profile.display_name),
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
        display_name = coalesce(excluded.display_name, public.worth_it_profiles.display_name),
        avatar_url = case
            when public.worth_it_profiles.avatar_is_custom then public.worth_it_profiles.avatar_url
            else coalesce(excluded.avatar_url, public.worth_it_profiles.avatar_url)
        end,
        updated_at = now();

    return new;
end;
$$;

drop trigger if exists on_auth_user_worth_it_profile on auth.users;
create trigger on_auth_user_worth_it_profile
after insert or update of raw_user_meta_data, email on auth.users
for each row execute function public.sync_worth_it_profile_from_auth_user();

-- Add the banner URL at the end of the existing public view so existing column order stays stable.
create or replace view public.worth_it_public_profiles as
select worth_it_id,username,coalesce(display_name,username,'Worth It member') as display_name,avatar_url,created_at,banner_url
from public.worth_it_profiles;
grant select on public.worth_it_public_profiles to anon,authenticated;

