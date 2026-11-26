-- Repair the most recent Worth It profile number and allocate future IDs
-- transactionally so rolled-back registrations do not consume numbers.
-- Review and apply to the intended database only after a verified backup.

begin;

create table if not exists private.worth_it_id_allocator (
    singleton boolean primary key default true check (singleton),
    last_id bigint not null check (last_id >= 1)
);

alter table private.worth_it_id_allocator enable row level security;
revoke all on table private.worth_it_id_allocator from public, anon, authenticated;

do $$
begin
    if exists (select 1 from public.worth_it_profiles where worth_it_id = 4) then
        raise exception 'Worth It ID 4 is already assigned; refusing to renumber accounts.';
    end if;

    if not exists (select 1 from public.worth_it_profiles where worth_it_id = 5) then
        raise exception 'Worth It ID 5 was not found; refusing to guess which account should be renumbered.';
    end if;

    update public.worth_it_profiles
       set worth_it_id = 4,
           updated_at = now()
     where worth_it_id = 5;
end;
$$;

insert into private.worth_it_id_allocator(singleton, last_id)
select true, greatest(coalesce(max(worth_it_id), 1), 1)
  from public.worth_it_profiles
on conflict (singleton) do update
set last_id = greatest(
    private.worth_it_id_allocator.last_id,
    excluded.last_id
);

create or replace function public.sync_worth_it_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    desired_username text;
    desired_display_name text;
    desired_avatar_url text;
    allocated_worth_it_id bigint;
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
        update public.worth_it_profiles
           set username = coalesce(desired_username, username),
               display_name = coalesce(desired_display_name, display_name),
               avatar_url = coalesce(desired_avatar_url, avatar_url),
               updated_at = now()
         where user_id = new.id;
        if found then
            return new;
        end if;
    end if;

    if lower(coalesce(new.email, '')) = 'pedjasebez3545@gmail.com' then
        allocated_worth_it_id := 1;
    else
        -- Updating this single allocator row serializes concurrent signups.
        -- Because the increment is transactional, a rolled-back signup does
        -- not burn an ID. Deleted accounts are not silently renumbered.
        update private.worth_it_id_allocator
           set last_id = last_id + 1
         where singleton = true
         returning last_id into allocated_worth_it_id;

        if allocated_worth_it_id is null then
            raise exception 'Worth It ID allocator is not initialized.';
        end if;
    end if;

    insert into public.worth_it_profiles(
        user_id, worth_it_id, username, display_name, avatar_url, created_at, updated_at
    )
    values(
        new.id, allocated_worth_it_id, desired_username, desired_display_name,
        desired_avatar_url, coalesce(new.created_at, now()), now()
    )
    on conflict (user_id) do update
       set username = coalesce(excluded.username, public.worth_it_profiles.username),
           display_name = coalesce(excluded.display_name, public.worth_it_profiles.display_name),
           avatar_url = coalesce(excluded.avatar_url, public.worth_it_profiles.avatar_url),
           updated_at = now();

    return new;
end;
$$;

revoke all on function public.sync_worth_it_profile_from_auth_user() from public, anon, authenticated;


-- UGC public numbers use the same transactional allocation strategy.
-- Built-in calculator numbers 1-50 remain reserved.
create table if not exists private.worth_it_ugc_number_allocator (
    singleton boolean primary key default true check (singleton),
    last_number bigint not null check (last_number >= 50)
);

alter table private.worth_it_ugc_number_allocator enable row level security;
revoke all on table private.worth_it_ugc_number_allocator from public, anon, authenticated;

insert into private.worth_it_ugc_number_allocator(singleton, last_number)
select true, greatest(50, coalesce(max(calculator_number), 50))
  from private.worth_it_user_calculators
on conflict (singleton) do update
set last_number = greatest(
    private.worth_it_ugc_number_allocator.last_number,
    excluded.last_number
);

create or replace function private.assign_worth_it_ugc_calculator_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $
declare
    allocated_number bigint;
begin
    update private.worth_it_ugc_number_allocator
       set last_number = last_number + 1
     where singleton = true
     returning last_number into allocated_number;

    if allocated_number is null then
        raise exception 'Worth It UGC number allocator is not initialized.';
    end if;

    new.calculator_number := allocated_number;
    return new;
end;
$;

revoke all on function private.assign_worth_it_ugc_calculator_number() from public, anon, authenticated;
alter table private.worth_it_user_calculators
    alter column calculator_number drop default;

drop trigger if exists assign_worth_it_ugc_calculator_number
    on private.worth_it_user_calculators;
create trigger assign_worth_it_ugc_calculator_number
before insert on private.worth_it_user_calculators
for each row execute function private.assign_worth_it_ugc_calculator_number();


commit;
