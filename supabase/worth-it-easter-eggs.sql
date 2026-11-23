-- Easter Eggs: private account preference, durable discoveries, and safe public collection.
-- Apply manually in Supabase SQL Editor after review. Never run automatically.
begin;

create table if not exists public.worth_it_easter_egg_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.worth_it_easter_egg_discoveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  egg_key text not null check (egg_key ~ '^[a-z0-9_]{2,48}$'),
  discovered_at timestamptz not null default now(),
  primary key (user_id, egg_key)
);
alter table public.worth_it_easter_egg_preferences enable row level security;
alter table public.worth_it_easter_egg_discoveries enable row level security;
revoke all on public.worth_it_easter_egg_preferences from public, anon, authenticated;
revoke all on public.worth_it_easter_egg_discoveries from public, anon, authenticated;

create or replace function public.get_worth_it_easter_egg_state()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare actor uuid:=auth.uid(); is_enabled boolean:=true; found_keys jsonb;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 select enabled into is_enabled from public.worth_it_easter_egg_preferences where user_id=actor;
 select coalesce(jsonb_agg(egg_key order by discovered_at), '[]'::jsonb) into found_keys
 from public.worth_it_easter_egg_discoveries where user_id=actor;
 return jsonb_build_object('success',true,'enabled',coalesce(is_enabled,true),'discoveries',found_keys);
end $$;

create or replace function public.set_worth_it_easter_eggs_enabled(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if p_enabled is null then raise exception 'A boolean preference is required'; end if;
 insert into public.worth_it_easter_egg_preferences(user_id,enabled,updated_at)
 values(actor,p_enabled,now())
 on conflict(user_id) do update set enabled=excluded.enabled,updated_at=now();
 return jsonb_build_object('success',true,'enabled',p_enabled);
end $$;

create or replace function public.discover_worth_it_easter_egg(p_egg_key text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare actor uuid:=auth.uid(); is_enabled boolean:=true; inserted integer:=0;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if p_egg_key is null or p_egg_key !~ '^[a-z0-9_]{2,48}$' then
   raise exception 'Invalid Easter Egg identifier';
 end if;
 select enabled into is_enabled from public.worth_it_easter_egg_preferences where user_id=actor;
 if not coalesce(is_enabled,true) then
   return jsonb_build_object('success',false,'reason','disabled');
 end if;
 insert into public.worth_it_easter_egg_discoveries(user_id,egg_key)
 values(actor,p_egg_key) on conflict do nothing;
 get diagnostics inserted = row_count;
 return jsonb_build_object('success',true,'discovered',inserted=1);
end $$;

create or replace function public.get_worth_it_profile_easter_eggs(p_worth_it_id bigint)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare target_user uuid; found_keys jsonb;
begin
 if p_worth_it_id is null then raise exception 'Profile ID required'; end if;
 select user_id into target_user from public.worth_it_profiles where worth_it_id=p_worth_it_id;
 if target_user is null then return jsonb_build_object('success',false,'discoveries','[]'::jsonb); end if;
 if not worth_it_private.can_view_worth_it_profile(target_user) then
   return jsonb_build_object('success',false,'discoveries','[]'::jsonb);
 end if;
 select coalesce(jsonb_agg(egg_key order by discovered_at), '[]'::jsonb) into found_keys
 from public.worth_it_easter_egg_discoveries where user_id=target_user;
 return jsonb_build_object('success',true,'discoveries',found_keys);
end $$;

revoke all on function public.get_worth_it_easter_egg_state() from public,anon;
revoke all on function public.set_worth_it_easter_eggs_enabled(boolean) from public,anon;
revoke all on function public.discover_worth_it_easter_egg(text) from public,anon;
revoke all on function public.get_worth_it_profile_easter_eggs(bigint) from public;
grant execute on function public.get_worth_it_easter_egg_state() to authenticated;
grant execute on function public.set_worth_it_easter_eggs_enabled(boolean) to authenticated;
grant execute on function public.discover_worth_it_easter_egg(text) to authenticated;
grant execute on function public.get_worth_it_profile_easter_eggs(bigint) to anon,authenticated;
commit;
