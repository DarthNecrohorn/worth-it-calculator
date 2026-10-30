-- Isolated PostgreSQL fixture for the private Community Chat media migration.
-- This reuses the existing message-actions baseline; it never touches production.
\set ON_ERROR_STOP on
\ir chat-message-actions-postgres-setup.sql

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
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.worth_it_chat_conversations c
     where c.id = p_conversation_id
       and (
         c.conversation_type = 'global'
         or exists (
           select 1 from public.worth_it_chat_members m
            where m.conversation_id = c.id and m.user_id = auth.uid()
         )
       )
  );
$$;
