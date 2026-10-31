-- Worth It UGC calculators, social discovery, profile favourites and equipable badges.
-- This migration belongs to PR #194. It is intentionally NOT applied to Production here.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create sequence if not exists private.worth_it_user_calculator_number_seq
    start with 51 increment by 1 minvalue 51;

create table if not exists private.worth_it_user_calculators (
    id uuid primary key default gen_random_uuid(),
    calculator_number bigint not null default nextval('private.worth_it_user_calculator_number_seq'),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    title text not null check (char_length(btrim(title)) between 3 and 70),
    description text not null default '' check (char_length(description) <= 500),
    category text not null check (category in ('cars','money','technology','home','other')),
    spec jsonb not null,
    status text not null default 'draft' check (status in ('draft','published')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    published_at timestamptz
);

-- Backfill safely if this migration is reapplied to an environment with existing UGC rows.
alter table private.worth_it_user_calculators
    add column if not exists calculator_number bigint;
do $calculator_number_backfill$
declare v_max bigint;
begin
    select max(calculator_number) into v_max
      from private.worth_it_user_calculators
     where calculator_number is not null;
    perform setval(
        'private.worth_it_user_calculator_number_seq'::regclass,
        greatest(51,coalesce(v_max,51)),
        v_max is not null
    );
    update private.worth_it_user_calculators
       set calculator_number=nextval('private.worth_it_user_calculator_number_seq')
     where calculator_number is null;
    select max(calculator_number) into v_max from private.worth_it_user_calculators;
    perform setval(
        'private.worth_it_user_calculator_number_seq'::regclass,
        greatest(51,coalesce(v_max,51)),
        v_max is not null
    );
end
$calculator_number_backfill$;
alter table private.worth_it_user_calculators
    alter column calculator_number set default nextval('private.worth_it_user_calculator_number_seq'),
    alter column calculator_number set not null;
create unique index if not exists worth_it_user_calculators_number_uidx
    on private.worth_it_user_calculators(calculator_number);
create index if not exists worth_it_user_calculators_owner_idx
    on private.worth_it_user_calculators(owner_user_id, updated_at desc);
create index if not exists worth_it_user_calculators_catalog_idx
    on private.worth_it_user_calculators(status, published_at desc);

alter table private.worth_it_user_calculators enable row level security;
revoke all on private.worth_it_user_calculators from public, anon, authenticated;

create table if not exists private.worth_it_calculator_reactions (
    calculator_id uuid not null references private.worth_it_user_calculators(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    reaction text not null check (reaction in ('like','dislike')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (calculator_id,user_id)
);
create index if not exists worth_it_calculator_reactions_rank_idx
    on private.worth_it_calculator_reactions(calculator_id,reaction,created_at desc);
alter table private.worth_it_calculator_reactions enable row level security;
revoke all on private.worth_it_calculator_reactions from public, anon, authenticated;

create table if not exists private.worth_it_calculator_views (
    calculator_id uuid not null references private.worth_it_user_calculators(id) on delete cascade,
    viewer_user_id uuid not null references auth.users(id) on delete cascade,
    viewed_on date not null default current_date,
    created_at timestamptz not null default now(),
    primary key (calculator_id,viewer_user_id,viewed_on)
);
create index if not exists worth_it_calculator_views_rank_idx
    on private.worth_it_calculator_views(calculator_id,created_at desc);
alter table private.worth_it_calculator_views enable row level security;
revoke all on private.worth_it_calculator_views from public, anon, authenticated;

create table if not exists private.worth_it_profile_badge_equips (
    user_id uuid not null references auth.users(id) on delete cascade,
    badge_key text not null check (badge_key in (
        'owner','premium','premium_lite',
        'member_1m','member_3m','member_6m','member_12m',
        'member_2y','member_3y','member_4y','member_5y'
    )),
    equipped_at timestamptz not null default now(),
    primary key (user_id,badge_key)
);
alter table private.worth_it_profile_badge_equips enable row level security;
revoke all on private.worth_it_profile_badge_equips from public, anon, authenticated;

create table if not exists private.worth_it_ugc_maker_daily_usage (
    user_id uuid not null references auth.users(id) on delete cascade,
    usage_date date not null,
    requests_used smallint not null check (requests_used between 1 and 10),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id,usage_date)
);
alter table private.worth_it_ugc_maker_daily_usage enable row level security;
revoke all on private.worth_it_ugc_maker_daily_usage from public, anon, authenticated;

create table if not exists private.worth_it_ugc_creation_daily_usage (
    user_id uuid not null references auth.users(id) on delete cascade,
    usage_date date not null,
    creations_used smallint not null check (creations_used between 1 and 3),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key(user_id,usage_date)
);
alter table private.worth_it_ugc_creation_daily_usage enable row level security;
revoke all on private.worth_it_ugc_creation_daily_usage from public, anon, authenticated;

create or replace function private.worth_it_validate_ugc_spec(p_spec jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
    v_input jsonb;
    v_result jsonb;
    v_key text;
    v_expression text;
    v_token text;
    v_match text[];
    v_allowed text[] := array[]::text[];
    v_depth integer;
    v_i integer;
    v_char text;
begin
    if coalesce(jsonb_typeof(p_spec),'') <> 'object'
       or coalesce(jsonb_typeof(p_spec->'inputs'),'') <> 'array'
       or coalesce(jsonb_typeof(p_spec->'results'),'') <> 'array'
       or jsonb_array_length(p_spec->'inputs') not between 1 and 12
       or jsonb_array_length(p_spec->'results') not between 1 and 6
       or octet_length(p_spec::text) > 16000 then
        raise exception 'Invalid calculator definition.' using errcode = '22023';
    end if;

    for v_input in select value from jsonb_array_elements(p_spec->'inputs') loop
        v_key := coalesce(v_input->>'key','');
        if v_key !~ '^[a-z][a-z0-9_]{0,31}$'
           or coalesce(v_input->>'label','') = ''
           or char_length(v_input->>'label') > 60
           or coalesce(jsonb_typeof(v_input->'min'),'') <> 'number'
           or coalesce(jsonb_typeof(v_input->'max'),'') <> 'number'
           or coalesce(jsonb_typeof(v_input->'default'),'') <> 'number'
           or (v_input->>'min')::numeric > (v_input->>'default')::numeric
           or (v_input->>'default')::numeric > (v_input->>'max')::numeric
           or (v_input->>'max')::numeric - (v_input->>'min')::numeric > 1000000000000 then
            raise exception 'Invalid calculator input definition.' using errcode = '22023';
        end if;
        if v_key = any(v_allowed) then
            raise exception 'Duplicate calculator input key.' using errcode = '22023';
        end if;
        v_allowed := array_append(v_allowed,v_key);
    end loop;

    for v_result in select value from jsonb_array_elements(p_spec->'results') loop
        v_expression := coalesce(v_result->>'expression','');
        if coalesce(v_result->>'label','') = ''
           or char_length(v_result->>'label') > 70
           or char_length(v_expression) < 1
           or char_length(v_expression) > 260
           or v_expression !~ '^[A-Za-z0-9_+*/^().,[:space:]-]+$'
           or v_expression ~ '[A-Za-z0-9_]\.[A-Za-z_]' then
            raise exception 'Invalid calculator result definition.' using errcode = '22023';
        end if;

        v_depth := 0;
        for v_i in 1..char_length(v_expression) loop
            v_char := substr(v_expression,v_i,1);
            if v_char = '(' then v_depth := v_depth + 1; end if;
            if v_char = ')' then
                v_depth := v_depth - 1;
                if v_depth < 0 then raise exception 'Unbalanced calculator formula.' using errcode = '22023'; end if;
            end if;
        end loop;
        if v_depth <> 0 then raise exception 'Unbalanced calculator formula.' using errcode = '22023'; end if;

        for v_match in select regexp_matches(v_expression,'[A-Za-z_][A-Za-z0-9_]*','g') loop
            v_token := v_match[1];
            if not (v_token = any(v_allowed))
               and v_token not in ('min','max','abs','round','floor','ceil','sqrt','pow','pi','e') then
                raise exception 'Formula contains an unsupported variable or function.' using errcode = '22023';
            end if;
        end loop;
    end loop;
end;
$$;

create or replace function private.worth_it_badge_is_earned(p_user_id uuid,p_badge_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_email text;
    v_created_at timestamptz;
    v_plan text;
    v_expires_at timestamptz;
begin
    select lower(coalesce(u.email,'')),p.created_at,w.premium_plan,w.premium_expires_at
      into v_email,v_created_at,v_plan,v_expires_at
      from auth.users u
      join public.worth_it_profiles p on p.user_id=u.id
      left join private.worth_it_calc_wallets w on w.user_id=u.id
     where u.id=p_user_id;
    if not found then return false; end if;

    if p_badge_key='owner' then return v_email='pedjasebez3545@gmail.com'; end if;
    if p_badge_key='premium' then return v_plan='premium' and v_expires_at>now(); end if;
    if p_badge_key='premium_lite' then return v_plan='premium_lite' and v_expires_at>now(); end if;

    return case p_badge_key
        when 'member_1m' then v_created_at <= now()-interval '1 month'
        when 'member_3m' then v_created_at <= now()-interval '3 months'
        when 'member_6m' then v_created_at <= now()-interval '6 months'
        when 'member_12m' then v_created_at <= now()-interval '12 months'
        when 'member_2y' then v_created_at <= now()-interval '2 years'
        when 'member_3y' then v_created_at <= now()-interval '3 years'
        when 'member_4y' then v_created_at <= now()-interval '4 years'
        when 'member_5y' then v_created_at <= now()-interval '5 years'
        else false
    end;
end;
$$;

create or replace function public.reserve_worth_it_ugc_maker_generation()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_used smallint;
    v_today date := (now() at time zone 'UTC')::date;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode='28000';
    end if;
    if not exists(
        select 1 from auth.users
         where id=v_user_id and email_confirmed_at is not null
    ) then
        raise exception 'Verify your email before using the AI calculator maker.' using errcode='42501';
    end if;

    insert into private.worth_it_ugc_maker_daily_usage(user_id,usage_date,requests_used)
    values(v_user_id,v_today,1)
    on conflict(user_id,usage_date) do update
       set requests_used=private.worth_it_ugc_maker_daily_usage.requests_used+1,
           updated_at=now()
     where private.worth_it_ugc_maker_daily_usage.requests_used<10
    returning requests_used into v_used;

    if v_used is null then
        return jsonb_build_object(
            'ok',false,'code','DAILY_LIMIT','daily_limit',10,'requests_used',10,
            'usage_date',v_today
        );
    end if;
    return jsonb_build_object(
        'ok',true,'requests_used',v_used,'daily_limit',10,'usage_date',v_today
    );
end;
$$;

create or replace function public.get_worth_it_ugc_creation_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_plan text;
    v_limit integer;
    v_used integer := 0;
    v_today date := (now() at time zone 'utc')::date;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select lower(coalesce(u.email,'')),
           case
             when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 'premium'
             when w.premium_plan='premium' and w.premium_expires_at>now() then 'premium'
             when w.premium_plan='premium_lite' and w.premium_expires_at>now() then 'premium_lite'
             else 'free'
           end
      into v_email,v_plan
      from auth.users u
      left join private.worth_it_calc_wallets w on w.user_id=u.id
     where u.id=v_user_id and u.email_confirmed_at is not null;
    if not found then raise exception 'Verify your email before creating community calculators.' using errcode='42501'; end if;

    v_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;
    select creations_used into v_used
      from private.worth_it_ugc_creation_daily_usage
     where user_id=v_user_id and usage_date=v_today;

    v_used := coalesce(v_used,0);
    return jsonb_build_object(
        'success',true,'plan',v_plan,'usage_date',v_today,
        'daily_limit',v_limit,'creations_used',v_used,
        'remaining',greatest(0,v_limit-v_used)
    );
end;
$$;

create or replace function public.save_worth_it_ugc_calculator(
    p_id uuid,
    p_title text,
    p_description text,
    p_category text,
    p_spec jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_id uuid;
    v_calculator_number bigint;
    v_count integer;
    v_plan text;
    v_daily_limit integer;
    v_creations_used integer;
    v_today date := (now() at time zone 'utc')::date;
    v_title text := btrim(coalesce(p_title,''));
    v_description text := btrim(coalesce(p_description,''));
    v_category text := lower(btrim(coalesce(p_category,'')));
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then
        raise exception 'Verify your email before creating community calculators.' using errcode='42501';
    end if;
    if char_length(v_title) not between 3 and 70
       or char_length(v_description)>500
       or v_category not in ('cars','money','technology','home','other') then
        raise exception 'Invalid calculator details.' using errcode='22023';
    end if;
    perform private.worth_it_validate_ugc_spec(p_spec);

    if p_id is null then
        -- The user-row lock serializes total-slot and daily-quota checks for concurrent requests.
        perform 1 from auth.users where id=v_user_id for update;
        select count(*) into v_count
          from private.worth_it_user_calculators
         where owner_user_id=v_user_id;
        if v_count>=10 then
            raise exception 'You can create up to 10 community calculators.' using errcode='54000';
        end if;

        select case
                 when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 'premium'
                 when w.premium_plan='premium' and w.premium_expires_at>now() then 'premium'
                 when w.premium_plan='premium_lite' and w.premium_expires_at>now() then 'premium_lite'
                 else 'free'
               end
          into v_plan
          from auth.users u
          left join private.worth_it_calc_wallets w on w.user_id=u.id
         where u.id=v_user_id;
        v_daily_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;

        insert into private.worth_it_ugc_creation_daily_usage(user_id,usage_date,creations_used)
        values(v_user_id,v_today,1)
        on conflict(user_id,usage_date) do update
           set creations_used=private.worth_it_ugc_creation_daily_usage.creations_used+1,
               updated_at=now()
         where private.worth_it_ugc_creation_daily_usage.creations_used<v_daily_limit
        returning creations_used into v_creations_used;
        if v_creations_used is null then
            raise exception 'Daily calculator creation limit reached (% per UTC day).',v_daily_limit
                using errcode='54000';
        end if;

        insert into private.worth_it_user_calculators(owner_user_id,title,description,category,spec)
        values(v_user_id,v_title,v_description,v_category,p_spec)
        returning id,calculator_number into v_id,v_calculator_number;
    else
        update private.worth_it_user_calculators
           set title=v_title,description=v_description,category=v_category,spec=p_spec,updated_at=now()
         where id=p_id and owner_user_id=v_user_id
        returning id,calculator_number into v_id,v_calculator_number;
        if v_id is null then raise exception 'Calculator not found or not owned by you.' using errcode='42501'; end if;
    end if;

    return jsonb_build_object(
        'success',true,'id',v_id,'calculator_number',v_calculator_number,
        'daily_limit',v_daily_limit,'creations_used',v_creations_used,
        'remaining',case when v_daily_limit is null then null else greatest(0,v_daily_limit-v_creations_used) end
    );
end;
$$;

create or replace function public.publish_worth_it_ugc_calculator(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_row private.worth_it_user_calculators%rowtype;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then
        raise exception 'Verify your email before publishing community calculators.' using errcode='42501';
    end if;
    select * into v_row from private.worth_it_user_calculators where id=p_id and owner_user_id=v_user_id for update;
    if not found then raise exception 'Calculator not found or not owned by you.' using errcode='42501'; end if;
    perform private.worth_it_validate_ugc_spec(v_row.spec);
    update private.worth_it_user_calculators
       set status='published',published_at=coalesce(published_at,now()),updated_at=now()
     where id=p_id;
    return jsonb_build_object('success',true,'id',p_id,'status','published');
end;
$$;

create or replace function public.delete_worth_it_ugc_calculator(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid := auth.uid(); v_deleted integer;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    -- Verify ownership before removing any social data for this calculator.
    if not exists(
        select 1 from private.worth_it_user_calculators
         where id=p_id and owner_user_id=v_user_id
    ) then
        raise exception 'Calculator not found or not owned by you.' using errcode='42501';
    end if;
    delete from public.worth_it_calculator_favorites
     where calculator_key='ugc:'||p_id::text;
    delete from private.worth_it_user_calculators where id=p_id and owner_user_id=v_user_id;
    get diagnostics v_deleted=row_count;
    if v_deleted=0 then raise exception 'Calculator not found or not owned by you.' using errcode='42501'; end if;
    return jsonb_build_object('success',true,'id',p_id);
end;
$$;

create or replace function public.get_worth_it_ugc_catalog(
    p_sort text default 'latest',
    p_period text default '12y',
    p_search text default '',
    p_limit integer default 30,
    p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_sort text := lower(coalesce(p_sort,'latest'));
    v_period text := lower(coalesce(p_period,'12y'));
    v_cutoff timestamptz;
    v_search text := left(btrim(coalesce(p_search,'')),80);
    v_limit integer := least(50,greatest(1,coalesce(p_limit,30)));
    v_offset integer := least(10000,greatest(0,coalesce(p_offset,0)));
    v_result jsonb;
begin
    if v_user_id is null then raise exception 'Sign in required to browse community calculators.' using errcode='28000'; end if;
    if v_sort not in ('latest','popular','liked','favorited','disliked') then v_sort:='latest'; end if;
    v_cutoff := case v_period
        when 'today' then date_trunc('day',now())
        when '7d' then now()-interval '7 days'
        when '14d' then now()-interval '14 days'
        when '1m' then now()-interval '1 month'
        when '3m' then now()-interval '3 months'
        when '6m' then now()-interval '6 months'
        when '12m' then now()-interval '12 months'
        when '3y' then now()-interval '3 years'
        when '6y' then now()-interval '6 years'
        else now()-interval '12 years'
    end;

    with ranked as (
        select c.id,c.calculator_number,c.title,c.description,c.category,c.status,c.owner_user_id,c.spec,
               c.created_at,c.updated_at,c.published_at,
               p.worth_it_id,p.username,p.display_name,p.avatar_url,
               (select count(*)::integer from private.worth_it_calculator_views v
                 where v.calculator_id=c.id and v.created_at>=v_cutoff) as views,
               (select count(*)::integer from private.worth_it_calculator_reactions r
                 where r.calculator_id=c.id and r.reaction='like' and r.created_at>=v_cutoff) as likes,
               (select count(*)::integer from private.worth_it_calculator_reactions r
                 where r.calculator_id=c.id and r.reaction='dislike' and r.created_at>=v_cutoff) as dislikes,
               (select count(*)::integer from public.worth_it_calculator_favorites f
                 where f.calculator_key='ugc:'||c.id::text and f.created_at>=v_cutoff) as favorites,
               exists(select 1 from public.worth_it_calculator_favorites f
                 where f.user_id=v_user_id and f.calculator_key='ugc:'||c.id::text) as is_favorite,
               (select r.reaction from private.worth_it_calculator_reactions r
                 where r.calculator_id=c.id and r.user_id=v_user_id) as my_reaction
          from private.worth_it_user_calculators c
          join public.worth_it_profiles p on p.user_id=c.owner_user_id
         where c.status='published'
           and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
           and (v_sort<>'latest' or c.published_at>=v_cutoff)
    ), page as (
        select * from ranked
         order by
           case when v_sort='popular' then views end desc,
           case when v_sort='liked' then likes end desc,
           case when v_sort='favorited' then favorites end desc,
           case when v_sort='disliked' then dislikes end desc,
           published_at desc
         limit v_limit offset v_offset
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'calculator_number',calculator_number,'title',title,'description',description,'category',category,'spec',spec,
        'created_at',created_at,'updated_at',updated_at,'published_at',published_at,
        'owner_worth_it_id',worth_it_id,'owner_username',username,'owner_display_name',display_name,
        'owner_avatar_url',avatar_url,'views',views,'likes',likes,'dislikes',dislikes,
        'favorites',favorites,'is_favorite',is_favorite,'my_reaction',my_reaction
    ) order by published_at desc),'[]'::jsonb)
      into v_result from page;
    return v_result;
end;
$$;

create or replace function public.get_worth_it_ugc_calculator(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid:=auth.uid(); v_result jsonb;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select jsonb_build_object(
        'id',c.id,'calculator_number',c.calculator_number,'title',c.title,'description',c.description,'category',c.category,'spec',c.spec,
        'status',c.status,'is_owner',(c.owner_user_id=v_user_id),'owner_worth_it_id',p.worth_it_id,
        'owner_username',p.username,'owner_display_name',p.display_name,'owner_avatar_url',p.avatar_url,
        'created_at',c.created_at,'published_at',c.published_at,
        'views',(select count(*) from private.worth_it_calculator_views v where v.calculator_id=c.id),
        'likes',(select count(*) from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='like'),
        'dislikes',(select count(*) from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='dislike'),
        'favorites',(select count(*) from public.worth_it_calculator_favorites f where f.calculator_key='ugc:'||c.id::text),
        'is_favorite',exists(select 1 from public.worth_it_calculator_favorites f where f.user_id=v_user_id and f.calculator_key='ugc:'||c.id::text),
        'my_reaction',(select r.reaction from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.user_id=v_user_id)
    ) into v_result
    from private.worth_it_user_calculators c
    join public.worth_it_profiles p on p.user_id=c.owner_user_id
    where c.id=p_id and (c.status='published' or c.owner_user_id=v_user_id);
    if v_result is null then raise exception 'Calculator not found.' using errcode='P0002'; end if;
    return v_result;
end;
$$;

create or replace function public.record_worth_it_ugc_view(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid:=auth.uid();
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if not exists(select 1 from private.worth_it_user_calculators where id=p_id and status='published' and owner_user_id<>v_user_id) then
        return jsonb_build_object('success',false,'counted',false);
    end if;
    insert into private.worth_it_calculator_views(calculator_id,viewer_user_id,viewed_on)
    values(p_id,v_user_id,current_date)
    on conflict do nothing;
    return jsonb_build_object('success',true,'counted',found);
end;
$$;

create or replace function public.set_worth_it_ugc_reaction(p_id uuid,p_reaction text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid:=auth.uid(); v_old text;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if p_reaction not in ('like','dislike') then raise exception 'Invalid reaction.' using errcode='22023'; end if;
    if not exists(select 1 from private.worth_it_user_calculators where id=p_id and status='published' and owner_user_id<>v_user_id) then
        raise exception 'Calculator not found or cannot be rated by its owner.' using errcode='42501';
    end if;
    select reaction into v_old from private.worth_it_calculator_reactions where calculator_id=p_id and user_id=v_user_id;
    if v_old=p_reaction then
        delete from private.worth_it_calculator_reactions where calculator_id=p_id and user_id=v_user_id;
        return jsonb_build_object('success',true,'reaction',null);
    end if;
    insert into private.worth_it_calculator_reactions(calculator_id,user_id,reaction)
    values(p_id,v_user_id,p_reaction)
    on conflict(calculator_id,user_id) do update set reaction=excluded.reaction,created_at=now(),updated_at=now();
    return jsonb_build_object('success',true,'reaction',p_reaction);
end;
$$;

create or replace function public.get_worth_it_my_ugc_calculators(p_search text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid:=auth.uid(); v_search text:=left(btrim(coalesce(p_search,'')),80); v_result jsonb;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,'calculator_number',c.calculator_number,'title',c.title,'description',c.description,'category',c.category,
        'spec',c.spec,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at,
        'published_at',c.published_at,
        'views',(select count(*) from private.worth_it_calculator_views v where v.calculator_id=c.id),
        'likes',(select count(*) from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='like'),
        'dislikes',(select count(*) from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='dislike'),
        'favorites',(select count(*) from public.worth_it_calculator_favorites f where f.calculator_key='ugc:'||c.id::text)
    ) order by c.updated_at desc),'[]'::jsonb)
      into v_result
      from private.worth_it_user_calculators c
     where c.owner_user_id=v_user_id
       and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%');
    return coalesce(v_result,'[]'::jsonb);
end;
$$;

create or replace function public.get_worth_it_profile_favorite_calculators(p_worth_it_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid; v_visibility text; v_result jsonb;
begin
    if auth.uid() is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select user_id into v_user_id from public.worth_it_profiles where worth_it_id=p_worth_it_id;
    if v_user_id is null then return '[]'::jsonb; end if;
    if v_user_id<>auth.uid() then
        select profile_visibility into v_visibility from public.worth_it_user_preferences where user_id=v_user_id;
        if coalesce(v_visibility,'public')='private' then return '[]'::jsonb; end if;
        if v_visibility='friends' and not exists(
            select 1 from public.worth_it_friends f
             where (f.user_low_id=auth.uid() and f.user_high_id=v_user_id)
                or (f.user_high_id=auth.uid() and f.user_low_id=v_user_id)
        ) then return '[]'::jsonb; end if;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,'calculator_number',c.calculator_number,'title',c.title,'description',c.description,'category',c.category,
        'owner_worth_it_id',p.worth_it_id,'owner_display_name',p.display_name,
        'owner_username',p.username,'favorites',(select count(*) from public.worth_it_calculator_favorites x where x.calculator_key='ugc:'||c.id::text)
    ) order by f.created_at desc),'[]'::jsonb)
      into v_result
      from public.worth_it_calculator_favorites f
      join private.worth_it_user_calculators c on f.calculator_key='ugc:'||c.id::text and c.status='published'
      join public.worth_it_profiles p on p.user_id=c.owner_user_id
     where f.user_id=v_user_id and f.calculator_key like 'ugc:%';
    return coalesce(v_result,'[]'::jsonb);
end;
$$;

create or replace function public.get_worth_it_profile_badges(p_worth_it_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid;
    v_self boolean;
    v_result jsonb;
begin
    if auth.uid() is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select user_id into v_user_id from public.worth_it_profiles where worth_it_id=p_worth_it_id;
    if v_user_id is null then return jsonb_build_object('badges','[]'::jsonb); end if;
    v_self := v_user_id=auth.uid();

    with badge_defs(badge_key,label,icon,description) as (
        values
          ('owner','OWNER','◆','Worth It site owner'),
          ('premium','PREMIUM','✧','Active Premium member'),
          ('premium_lite','PREMIUM LITE','✦','Active Premium Lite member'),
          ('member_1m','1 MONTH','◈','Member for at least one month'),
          ('member_3m','3 MONTHS','✦','Member for at least three months'),
          ('member_6m','6 MONTHS','✧','Member for at least six months'),
          ('member_12m','1 YEAR','★','Member for at least one year'),
          ('member_2y','2 YEARS','✺','Member for at least two years'),
          ('member_3y','3 YEARS','❖','Member for at least three years'),
          ('member_4y','4 YEARS','✪','Member for at least four years'),
          ('member_5y','5 YEARS','♛','Member for at least five years')
    ), rows as (
        select d.*,
               private.worth_it_badge_is_earned(v_user_id,d.badge_key) as earned,
               exists(select 1 from private.worth_it_profile_badge_equips e where e.user_id=v_user_id and e.badge_key=d.badge_key) as equipped
          from badge_defs d
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'key',badge_key,'label',label,'icon',icon,'description',description,
        'earned',earned,'equipped',equipped
    ) order by case badge_key when 'owner' then 0 when 'premium' then 1 when 'premium_lite' then 2 else 3 end, badge_key),'[]'::jsonb)
      into v_result
      from rows
     where earned and (v_self or equipped);
    return jsonb_build_object('badges',coalesce(v_result,'[]'::jsonb),'is_own_profile',v_self);
end;
$$;

create or replace function public.set_worth_it_profile_badge_equipped(p_badge_key text,p_equipped boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid:=auth.uid();
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if p_badge_key not in (
        'owner','premium','premium_lite','member_1m','member_3m','member_6m','member_12m',
        'member_2y','member_3y','member_4y','member_5y'
    ) then raise exception 'Unknown badge.' using errcode='22023'; end if;
    if p_equipped then
        if not private.worth_it_badge_is_earned(v_user_id,p_badge_key) then
            raise exception 'This badge has not been unlocked for your account.' using errcode='42501';
        end if;
        insert into private.worth_it_profile_badge_equips(user_id,badge_key)
        values(v_user_id,p_badge_key) on conflict do nothing;
    else
        delete from private.worth_it_profile_badge_equips where user_id=v_user_id and badge_key=p_badge_key;
    end if;
    return jsonb_build_object('success',true,'badge_key',p_badge_key,'equipped',p_equipped);
end;
$$;

-- The favourites table is intentionally account-owned and is only exposed to signed-in members.
create table if not exists public.worth_it_calculator_favorites (
    user_id uuid not null references auth.users(id) on delete cascade,
    calculator_key text not null check (calculator_key ~ '^ugc:[a-z0-9][a-z0-9_-]{0,62}$'),
    created_at timestamptz not null default now(),
    primary key(user_id,calculator_key)
);
alter table public.worth_it_calculator_favorites enable row level security;
revoke all on public.worth_it_calculator_favorites from public,anon,authenticated;
grant select,insert,delete on public.worth_it_calculator_favorites to authenticated;
drop policy if exists "Users can view their own calculator favourites" on public.worth_it_calculator_favorites;
create policy "Users can view their own calculator favourites"
    on public.worth_it_calculator_favorites for select to authenticated
    using ((select auth.uid())=user_id);
drop policy if exists "Users can save their own calculator favourites" on public.worth_it_calculator_favorites;
create policy "Users can save their own calculator favourites"
    on public.worth_it_calculator_favorites for insert to authenticated
    with check ((select auth.uid())=user_id);
drop policy if exists "Users can remove their own calculator favourites" on public.worth_it_calculator_favorites;
create policy "Users can remove their own calculator favourites"
    on public.worth_it_calculator_favorites for delete to authenticated
    using ((select auth.uid())=user_id);

revoke all on function public.reserve_worth_it_ugc_maker_generation() from public,anon;
revoke all on function public.get_worth_it_ugc_creation_quota() from public,anon;
revoke all on function public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb) from public,anon;
revoke all on function public.publish_worth_it_ugc_calculator(uuid) from public,anon;
revoke all on function public.delete_worth_it_ugc_calculator(uuid) from public,anon;
revoke all on function public.get_worth_it_ugc_catalog(text,text,text,integer,integer) from public,anon;
revoke all on function public.get_worth_it_ugc_calculator(uuid) from public,anon;
revoke all on function public.record_worth_it_ugc_view(uuid) from public,anon;
revoke all on function public.set_worth_it_ugc_reaction(uuid,text) from public,anon;
revoke all on function public.get_worth_it_my_ugc_calculators(text) from public,anon;
revoke all on function public.get_worth_it_profile_favorite_calculators(bigint) from public,anon;
revoke all on function public.get_worth_it_profile_badges(bigint) from public,anon;
revoke all on function public.set_worth_it_profile_badge_equipped(text,boolean) from public,anon;

grant execute on function public.reserve_worth_it_ugc_maker_generation() to authenticated;
grant execute on function public.get_worth_it_ugc_creation_quota() to authenticated;
grant execute on function public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.publish_worth_it_ugc_calculator(uuid) to authenticated;
grant execute on function public.delete_worth_it_ugc_calculator(uuid) to authenticated;
grant execute on function public.get_worth_it_ugc_catalog(text,text,text,integer,integer) to authenticated;
grant execute on function public.get_worth_it_ugc_calculator(uuid) to authenticated;
grant execute on function public.record_worth_it_ugc_view(uuid) to authenticated;
grant execute on function public.set_worth_it_ugc_reaction(uuid,text) to authenticated;
grant execute on function public.get_worth_it_my_ugc_calculators(text) to authenticated;
grant execute on function public.get_worth_it_profile_favorite_calculators(bigint) to authenticated;
grant execute on function public.get_worth_it_profile_badges(bigint) to authenticated;
grant execute on function public.set_worth_it_profile_badge_equipped(text,boolean) to authenticated;

commit;
