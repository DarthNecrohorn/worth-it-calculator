\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create schema storage;
create table storage.buckets (
  id text primary key,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
insert into storage.buckets(id, public, file_size_limit, allowed_mime_types)
values ('worth-it-chat-media', true, 20971520,
  array['image/jpeg','image/png','image/webp','image/gif']);

create table storage.objects (id bigint generated always as identity, name text);
alter table storage.objects enable row level security;

create table public.worth_it_chat_messages (
  id bigint generated always as identity primary key,
  media_type text constraint worth_it_chat_messages_media_type_check
    check (media_type is null or media_type = any (array['image','gif']))
);

create function public.send_worth_it_chat_message(
  p_body text default ''::text,
  p_conversation_id uuid default null::uuid,
  p_media_url text default null::text,
  p_media_type text default null::text
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  media_kind text := nullif(p_media_type,'');
begin
  if media_kind is not null and media_kind not in ('image','gif') then
    return jsonb_build_object('success',false,'code','INVALID_MEDIA_TYPE');
  end if;
  return jsonb_build_object('success',true);
end;
$function$;
