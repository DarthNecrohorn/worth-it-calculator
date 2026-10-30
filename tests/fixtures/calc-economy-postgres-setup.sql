-- Disposable PostgreSQL fixture for the CALC economy migration.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to authenticated, anon, service_role;

create table if not exists auth.users (
    id uuid primary key,
    email text not null unique
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

grant execute on function auth.uid() to public;
grant execute on function auth.jwt() to public;

create table if not exists public.worth_it_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    worth_it_id bigint not null unique,
    username text not null unique
);

insert into auth.users(id,email) values
    ('11111111-1111-4111-8111-111111111111','free@example.test'),
    ('22222222-2222-4222-8222-222222222222','owner@example.test')
on conflict(id) do update set email = excluded.email;

insert into public.worth_it_profiles(user_id,worth_it_id,username) values
    ('11111111-1111-4111-8111-111111111111',101,'free_member'),
    ('22222222-2222-4222-8222-222222222222',202,'owner_member')
on conflict(user_id) do update set worth_it_id = excluded.worth_it_id, username = excluded.username;
