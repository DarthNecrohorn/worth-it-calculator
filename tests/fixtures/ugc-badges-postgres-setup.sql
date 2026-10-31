-- Minimal Supabase-compatible fixture for the UGC calculators and badge migration.
do $roles$
begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end
$roles$;

create schema auth;
create table auth.users (
    id uuid primary key,
    email text not null unique,
    email_confirmed_at timestamptz
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$function$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to public;

create schema private;
create table private.worth_it_calc_wallets (
    user_id uuid primary key references auth.users(id) on delete cascade,
    premium_plan text not null default 'free',
    premium_expires_at timestamptz
);
alter table private.worth_it_calc_wallets enable row level security;
revoke all on private.worth_it_calc_wallets from public,anon,authenticated;

create table public.worth_it_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    worth_it_id bigint not null unique,
    username text,
    display_name text not null,
    avatar_url text,
    created_at timestamptz not null default now()
);
alter table public.worth_it_profiles enable row level security;
revoke all on public.worth_it_profiles from public,anon,authenticated;

create table public.worth_it_user_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    profile_visibility text not null default 'public'
);
create table public.worth_it_friends (
    user_low_id uuid not null references auth.users(id) on delete cascade,
    user_high_id uuid not null references auth.users(id) on delete cascade,
    primary key(user_low_id,user_high_id)
);
