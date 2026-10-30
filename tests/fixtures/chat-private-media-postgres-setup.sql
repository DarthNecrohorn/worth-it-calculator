-- Isolated PostgreSQL fixture for the private Community Chat media migration.
-- This reuses the existing message-actions baseline; it never touches production.
\set ON_ERROR_STOP on
\ir chat-message-actions-postgres-setup.sql

create table public.worth_it_friends (
  user_low_id uuid not null references auth.users(id),
  user_high_id uuid not null references auth.users(id),
  primary key (user_low_id, user_high_id),
  check (user_low_id < user_high_id)
);

insert into public.worth_it_chat_conversations(id,conversation_type,title,created_by)
values ('30000000-0000-4000-8000-000000000001','direct',null,null);
insert into public.worth_it_chat_members(conversation_id,user_id) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'worth-it-chat-media',
  'worth-it-chat-media',
  true,
  52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
);

-- Reproduce the production public-read policy so the migration test proves it
-- is removed when the bucket becomes private.
create table storage.objects (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  name text not null
);
alter table storage.objects enable row level security;
create policy "Worth It chat media read" on storage.objects
for select to public
using (bucket_id = 'worth-it-chat-media');

-- Mirrors the membership check already deployed by chat enhancements; this
-- fixture deliberately covers group-membership decisions for the media RPC.
create or replace function public.can_access_worth_it_chat_media(p_conversation_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  kind text;
begin
  if actor_id is null or p_conversation_id is null then return false; end if;
  select conversation_type into kind
    from public.worth_it_chat_conversations where id = p_conversation_id;
  if kind = 'global' then return true; end if;
  if kind = 'group' then
    return exists (
      select 1 from public.worth_it_chat_members
       where conversation_id = p_conversation_id and user_id = actor_id
    );
  end if;
  if kind = 'direct' then
    return exists (
      select 1
        from public.worth_it_chat_members mine
        join public.worth_it_chat_members peer
          on peer.conversation_id = mine.conversation_id and peer.user_id <> mine.user_id
        join public.worth_it_friends friends
          on (friends.user_low_id = mine.user_id and friends.user_high_id = peer.user_id)
          or (friends.user_low_id = peer.user_id and friends.user_high_id = mine.user_id)
       where mine.conversation_id = p_conversation_id
         and mine.user_id = actor_id
         and (select count(*) from public.worth_it_chat_members all_members
               where all_members.conversation_id = p_conversation_id) = 2
    );
  end if;
  return false;
end;
$$;

insert into auth.users(id,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000003', now());
