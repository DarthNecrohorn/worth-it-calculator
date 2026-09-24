-- Worth It username uniqueness
-- Run this once in Supabase SQL Editor.
-- This keeps the username in auth.users metadata as the app currently does,
-- while adding a database-level unique reservation.

create table if not exists public.usernames (
    username text primary key,
    username_lower text generated always as (lower(username)) stored,
    user_id uuid not null unique references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint usernames_format
        check (
            username ~ '^(?=.*[A-Za-z0-9])[A-Za-z0-9_]{3,20}$'
        )
);

create unique index if not exists usernames_username_lower_key
    on public.usernames (username_lower);

alter table public.usernames enable row level security;

drop policy if exists "Public can check username availability" on public.usernames;
create policy "Public can check username availability"
    on public.usernames
    for select
    to anon, authenticated
    using (true);

create or replace function public.reserve_worth_it_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    desired_username text;
begin
    desired_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

    if desired_username is null then
        return new;
    end if;

    if desired_username !~ '^(?=.*[A-Za-z0-9])[A-Za-z0-9_]{3,20}$' then
        raise exception 'Invalid username';
    end if;

    insert into public.usernames (username, user_id)
    values (desired_username, new.id);

    return new;
exception
    when unique_violation then
        raise exception 'Username is already taken';
end;
$$;

drop trigger if exists on_auth_user_username_reservation on auth.users;

create trigger on_auth_user_username_reservation
after insert on auth.users
for each row
execute function public.reserve_worth_it_username();

-- Backfill usernames for accounts that already exist.
-- If this reports duplicate usernames, resolve those duplicates first
-- before relying on the unique reservation table.
insert into public.usernames (username, user_id)
select
    raw_user_meta_data ->> 'username',
    id
from auth.users
where coalesce(raw_user_meta_data ->> 'username', '') ~ '^(?=.*[A-Za-z0-9])[A-Za-z0-9_]{3,20}$'
on conflict (username_lower) do nothing;
