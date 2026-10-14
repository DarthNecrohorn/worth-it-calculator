-- Worth It public profiles and sequential Worth It IDs.
-- Run once in Supabase Dashboard -> SQL Editor.
-- pedjasebez3545@gmail.com is assigned Worth It ID 1. Existing other users are backfilled from 2.
-- Every future auth.users insert gets the next ID. Deleted IDs are not reused.
create sequence if not exists public.worth_it_id_seq start with 2 increment by 1 minvalue 1 no cycle;

create table if not exists public.worth_it_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    worth_it_id bigint not null unique,
    username text,
    display_name text not null default 'Worth It member',
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint worth_it_profiles_id_positive check (worth_it_id > 0)
);
create index if not exists worth_it_profiles_username_idx on public.worth_it_profiles(lower(username)) where username is not null;
alter table public.worth_it_profiles enable row level security;
drop policy if exists "Users can view own Worth It profile" on public.worth_it_profiles;
create policy "Users can view own Worth It profile" on public.worth_it_profiles for select to authenticated using (auth.uid() = user_id);

-- Follow relationships are directional. A friend is counted when the relationship is mutual.
create table if not exists public.worth_it_follows (
    follower_user_id uuid not null references auth.users(id) on delete cascade,
    followed_user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (follower_user_id, followed_user_id),
    constraint worth_it_follows_not_self check (follower_user_id <> followed_user_id)
);
create index if not exists worth_it_follows_followed_idx on public.worth_it_follows(followed_user_id,follower_user_id);
alter table public.worth_it_follows enable row level security;
drop policy if exists "Users can view their own follow relationships" on public.worth_it_follows;
create policy "Users can view their own follow relationships" on public.worth_it_follows for select to authenticated using (auth.uid() = follower_user_id or auth.uid() = followed_user_id);
drop policy if exists "Users can follow from their own account" on public.worth_it_follows;
create policy "Users can follow from their own account" on public.worth_it_follows for insert to authenticated with check (auth.uid() = follower_user_id and follower_user_id <> followed_user_id);
drop policy if exists "Users can unfollow from their own account" on public.worth_it_follows;
create policy "Users can unfollow from their own account" on public.worth_it_follows for delete to authenticated using (auth.uid() = follower_user_id);

insert into public.worth_it_profiles(user_id,worth_it_id,username,display_name,avatar_url,created_at,updated_at)
select
    u.id,
    case when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 1 else nextval('public.worth_it_id_seq') end,
    nullif(trim(u.raw_user_meta_data->>'username'),''),
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),nullif(trim(u.raw_user_meta_data->>'username'),''),nullif(split_part(coalesce(u.email,''),'@',1),''),'Worth It member'),
    coalesce(nullif(trim(u.raw_user_meta_data->>'avatar_url'),''),nullif(trim(u.raw_user_meta_data->>'picture'),'')),
    coalesce(u.created_at,now()),now()
from auth.users as u
order by case when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 0 else 1 end,u.created_at nulls first,u.id
on conflict(user_id) do update set
    username=coalesce(excluded.username,public.worth_it_profiles.username),
    display_name=coalesce(excluded.display_name,public.worth_it_profiles.display_name),
    avatar_url=coalesce(excluded.avatar_url,public.worth_it_profiles.avatar_url),
    updated_at=now();

select setval('public.worth_it_id_seq',greatest(coalesce((select max(worth_it_id) from public.worth_it_profiles),1),1),true);

create or replace function public.sync_worth_it_profile_from_auth_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
    desired_username text;
    desired_display_name text;
    desired_avatar_url text;
begin
    desired_username:=nullif(trim(new.raw_user_meta_data->>'username'),'');
    desired_display_name:=coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),nullif(trim(new.raw_user_meta_data->>'name'),''),desired_username,nullif(split_part(coalesce(new.email,''),'@',1),''),'Worth It member');
    desired_avatar_url:=coalesce(nullif(trim(new.raw_user_meta_data->>'avatar_url'),''),nullif(trim(new.raw_user_meta_data->>'picture'),''));

    if tg_op='UPDATE' then
        update public.worth_it_profiles
        set username=coalesce(desired_username,username),display_name=coalesce(desired_display_name,display_name),avatar_url=coalesce(desired_avatar_url,avatar_url),updated_at=now()
        where user_id=new.id;
        if found then return new; end if;
    end if;

    insert into public.worth_it_profiles(user_id,worth_it_id,username,display_name,avatar_url,created_at,updated_at)
    values(new.id,case when lower(coalesce(new.email,''))='pedjasebez3545@gmail.com' then 1 else nextval('public.worth_it_id_seq') end,desired_username,desired_display_name,desired_avatar_url,coalesce(new.created_at,now()),now())
    on conflict(user_id) do update set
        username=coalesce(excluded.username,public.worth_it_profiles.username),
        display_name=coalesce(excluded.display_name,public.worth_it_profiles.display_name),
        avatar_url=coalesce(excluded.avatar_url,public.worth_it_profiles.avatar_url),
        updated_at=now();
    return new;
end;
$$;
drop trigger if exists on_auth_user_worth_it_profile on auth.users;
create trigger on_auth_user_worth_it_profile after insert or update of raw_user_meta_data,email on auth.users for each row execute function public.sync_worth_it_profile_from_auth_user();

create or replace view public.worth_it_public_profiles as
select worth_it_id,username,coalesce(display_name,username,'Worth It member') as display_name,avatar_url,created_at
from public.worth_it_profiles;
grant select on public.worth_it_public_profiles to anon,authenticated;
grant select on public.worth_it_profiles to authenticated;

create or replace function public.get_worth_it_profile_stats(target_worth_it_id bigint)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare
    target_user_id uuid;
    friends_count bigint:=0;
    followers_count bigint:=0;
    following_count bigint:=0;
begin
    select user_id into target_user_id from public.worth_it_profiles where worth_it_id=target_worth_it_id;
    if target_user_id is null then return jsonb_build_object('friends',0,'followers',0,'following',0); end if;

    select count(*) into following_count from public.worth_it_follows where follower_user_id=target_user_id;
    select count(*) into followers_count from public.worth_it_follows where followed_user_id=target_user_id;
    select count(*) into friends_count
    from public.worth_it_follows as outgoing
    where outgoing.follower_user_id=target_user_id
      and exists(select 1 from public.worth_it_follows as incoming where incoming.follower_user_id=outgoing.followed_user_id and incoming.followed_user_id=target_user_id);

    return jsonb_build_object('friends',friends_count,'followers',followers_count,'following',following_count);
end;
$$;
revoke all on function public.get_worth_it_profile_stats(bigint) from public;
grant execute on function public.get_worth_it_profile_stats(bigint) to anon,authenticated;
