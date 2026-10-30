-- Isolated PostgreSQL fixture for the private Community Chat media migration.
-- This reuses the existing message-actions baseline; it never touches production.
\set ON_ERROR_STOP on
\ir chat-message-actions-postgres-setup.sql

alter table auth.users add column email_confirmed_at timestamptz;
update auth.users set email_confirmed_at = now();
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

-- Override the inherited test doubles with the exact production guard fragments
-- that the migration updates. The tests exercise the resulting authorization paths.
create or replace function public.get_worth_it_chat_messages(
  p_conversation_id uuid default null::uuid,
  p_limit integer default 100
) returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid := coalesce(p_conversation_id, '00000000-0000-4000-8000-000000000001'::uuid);
  target_type text;
begin
  select conversation_type into target_type
    from public.worth_it_chat_conversations where id = target_id;
  if target_type is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members
        where conversation_id = target_id and user_id = actor_id
    ) then
        return jsonb_build_object('success', false, 'code', 'NOT_A_CHAT_MEMBER');
    end if;
  return '[]'::jsonb;
end;
$function$;

create or replace function public.get_worth_it_chat_conversations()
returns jsonb language plpgsql stable security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'type',c.conversation_type)), '[]'::jsonb)
    into result
    from public.worth_it_chat_conversations c
    left join public.worth_it_chat_members mine
      on mine.conversation_id = c.id and mine.user_id = actor_id
    where (c.conversation_type in ('direct', 'group') and mine.user_id = actor_id)
       or c.conversation_type = 'global';
  return result;
end;
$function$;

create or replace function public.send_worth_it_chat_message(
  p_body text default '',
  p_conversation_id uuid default null,
  p_media_url text default null,
  p_media_type text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid := coalesce(p_conversation_id, '00000000-0000-4000-8000-000000000001'::uuid);
  target_type text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select conversation_type into target_type
    from public.worth_it_chat_conversations where id=target_id;
  if target_type is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
    ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;

    if target_type='direct' and not exists (
        select 1 from public.worth_it_chat_members a
        join public.worth_it_chat_members b on b.conversation_id=a.conversation_id and b.user_id<>a.user_id
        join public.worth_it_friends f on
            (f.user_low_id=a.user_id and f.user_high_id=b.user_id) or
            (f.user_low_id=b.user_id and f.user_high_id=a.user_id)
        where a.conversation_id=target_id and a.user_id=actor_id
    ) then return jsonb_build_object('success',false,'code','FRIENDS_ONLY'); end if;
  return jsonb_build_object('success',true);
end;
$function$;

create or replace function public.worth_it_chat_realtime_topic_authorized(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid;
begin
  if not exists (
    select 1 from auth.users verified_user
    where verified_user.id = actor_id and verified_user.email_confirmed_at is not null
  ) then raise exception 'Email confirmation required' using errcode = '42501'; end if;
  if actor_id is null or p_topic is null then return false; end if;
  if p_topic = 'worthit-chat:00000000-0000-4000-8000-000000000001' then return true; end if;
  if p_topic !~ '^worthit-chat:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  target_id := substring(p_topic from length('worthit-chat:') + 1)::uuid;
  return exists (
        select 1
          from public.worth_it_chat_members as member
         where member.conversation_id = target_id
           and member.user_id = actor_id
    );
end;
$function$;

create or replace function public.search_worth_it_chat_messages(
  p_conversation_id uuid, p_query text, p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path = public
as $function$
declare
  actor_id uuid := auth.uid();
  target_id uuid := p_conversation_id;
  kind text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select conversation_type into kind from public.worth_it_chat_conversations where id=target_id;
  if kind is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
  if kind <> 'global' and not exists (
    select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
  ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;
  if kind = 'direct' and not public.can_access_worth_it_chat_media(target_id) then
    return jsonb_build_object('success',false,'code','FRIENDS_ONLY');
  end if;
  return '[]'::jsonb;
end;
$function$;

insert into auth.users(id,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000003', now());
