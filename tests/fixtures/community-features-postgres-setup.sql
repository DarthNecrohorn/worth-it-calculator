\set ON_ERROR_STOP on
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end
$roles$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function auth.jwt()
returns jsonb language sql stable
as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function auth.jwt() to authenticated;

create table if not exists public.worth_it_user_reports (
  id bigint generated always as identity primary key,
  reporter_user_id uuid not null,
  reported_user_id uuid not null,
  reporter_worth_it_id bigint,
  reported_worth_it_id bigint not null,
  reported_username text not null,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.worth_it_user_reports enable row level security;
drop policy if exists "Only Worth It admin can read user reports" on public.worth_it_user_reports;
create policy "Only Worth It admin can read user reports"
on public.worth_it_user_reports for select to authenticated
using (lower(coalesce(auth.jwt()->>'email',''))='pedjasebez3545@gmail.com');
grant select on public.worth_it_user_reports to authenticated;

insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-8000-000000000001','owner@example.test',now()),
('00000000-0000-4000-8000-000000000002','member@example.test',now())
on conflict(id) do nothing;
insert into public.worth_it_user_reports(reporter_user_id,reported_user_id,reported_worth_it_id,reported_username,reason)
values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',1,'owner','spam');
