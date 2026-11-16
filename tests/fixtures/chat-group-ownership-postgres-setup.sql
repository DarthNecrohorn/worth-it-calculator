-- Minimal isolated baseline for the group ownership and membership-limit migration.
-- Disposable PostgreSQL only; never run against production.
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end
$roles$;

create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.worth_it_profiles (
  user_id uuid primary key references auth.users(id),
  worth_it_id bigint unique not null,
  username text,
  display_name text
);
create table public.worth_it_friends (
  user_low_id uuid not null,
  user_high_id uuid not null,
  primary key (user_low_id,user_high_id)
);
create table public.worth_it_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null,
  title text,
  created_by uuid references auth.users(id),
  invite_token text unique,
  created_at timestamptz not null default now()
);
create table public.worth_it_chat_members (
  conversation_id uuid not null references public.worth_it_chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id,user_id)
);

insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),
 ('00000000-0000-4000-8000-000000000004'),
 ('00000000-0000-4000-8000-000000000005'),
 ('00000000-0000-4000-8000-000000000006'),
 ('00000000-0000-4000-8000-000000000007'),
 ('00000000-0000-4000-8000-000000000008'),
 ('00000000-0000-4000-8000-000000000009'),
 ('00000000-0000-4000-8000-000000000010');
insert into public.worth_it_profiles(user_id,worth_it_id,username,display_name) values
 ('00000000-0000-4000-8000-000000000001',1,'user1','User 1'),
 ('00000000-0000-4000-8000-000000000002',2,'user2','User 2'),
 ('00000000-0000-4000-8000-000000000003',3,'user3','User 3'),
 ('00000000-0000-4000-8000-000000000004',4,'user4','User 4'),
 ('00000000-0000-4000-8000-000000000005',5,'user5','User 5'),
 ('00000000-0000-4000-8000-000000000006',6,'user6','User 6'),
 ('00000000-0000-4000-8000-000000000007',7,'user7','User 7'),
 ('00000000-0000-4000-8000-000000000008',8,'user8','User 8'),
 ('00000000-0000-4000-8000-000000000009',9,'user9','User 9'),
 ('00000000-0000-4000-8000-000000000010',10,'user10','User 10');
insert into public.worth_it_friends(user_low_id,user_high_id) values
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003'),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004'),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000005'),
 ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000007'),
 ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000008'),
 ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000006'),
 ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000010');

-- Legacy group with deliberately non-owner-first join timestamps. Migration must
-- place the current Owner first and preserve the remaining members' join order.
insert into public.worth_it_chat_conversations(id,conversation_type,title,created_by,invite_token)
values ('10000000-0000-4000-8000-000000000001','group','Legacy order',
        '00000000-0000-4000-8000-000000000002',repeat('a',64));
insert into public.worth_it_chat_members(conversation_id,user_id,joined_at) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','2026-01-03'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','2026-01-02');
