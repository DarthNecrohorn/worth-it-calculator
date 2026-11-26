create extension if not exists pgcrypto;
do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists private;

create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table public.worth_it_profiles (
    user_id uuid primary key,
    worth_it_id bigint not null unique,
    username text,
    display_name text not null default 'Worth It member',
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    avatar_is_custom boolean not null default false
);

create table private.worth_it_user_calculators (
    id uuid primary key default gen_random_uuid(),
    calculator_number bigint not null unique default nextval('private.worth_it_user_calculator_number_seq'::regclass),
    owner_user_id uuid not null,
    title text not null
);
create sequence private.worth_it_user_calculator_number_seq;

insert into public.worth_it_profiles(user_id,worth_it_id,username,display_name,avatar_url,avatar_is_custom)
values
('00000000-0000-0000-0000-000000000001',1,'admin','Admin','https://example.test/admin.png',true),
('00000000-0000-0000-0000-000000000002',2,'user2','User 2',null,false),
('00000000-0000-0000-0000-000000000003',3,'user3','User 3',null,false),
('00000000-0000-0000-0000-000000000005',5,'user5','User 5','https://example.test/custom.png',true);

insert into auth.users(id,email,raw_user_meta_data)
values('00000000-0000-0000-0000-000000000005','user5@example.test','{"username":"user5"}');

insert into private.worth_it_user_calculators(id,calculator_number,owner_user_id,title)
values
('10000000-0000-0000-0000-000000000051',51,'00000000-0000-0000-0000-000000000005','Existing UGC 51'),
('10000000-0000-0000-0000-000000000052',52,'00000000-0000-0000-0000-000000000005','Existing UGC 52');

create function public.sync_worth_it_profile_from_auth_user()
returns trigger language plpgsql as $$ begin return new; end $$;

create trigger on_auth_user_worth_it_profile
after insert or update of raw_user_meta_data, email on auth.users
for each row execute function public.sync_worth_it_profile_from_auth_user();
