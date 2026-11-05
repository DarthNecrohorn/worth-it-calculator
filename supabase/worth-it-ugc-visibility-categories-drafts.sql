begin;

alter table private.worth_it_user_calculators
    add column if not exists visibility text;
alter table private.worth_it_user_calculators
    add column if not exists subcategories text[];

-- Preserve the old public behaviour for existing published calculators.
-- Unpublished drafts remain owner-only.
update private.worth_it_user_calculators
   set visibility=case when status='published' then 'public' else 'private' end
 where visibility is null;
update private.worth_it_user_calculators
   set subcategories=case category
     when 'cars' then array['car-ownership']::text[]
     when 'money' then array['budgeting']::text[]
     when 'technology' then array['tech-comparison']::text[]
     when 'home' then array['household-budget']::text[]
     else array['general-comparison']::text[]
   end
 where subcategories is null or cardinality(subcategories)=0;

alter table private.worth_it_user_calculators
    alter column visibility set default 'private',
    alter column visibility set not null,
    alter column subcategories set default array['general-comparison']::text[],
    alter column subcategories set not null;

do $constraints$
begin
    if not exists(select 1 from pg_constraint where conname='worth_it_ugc_visibility_check') then
        alter table private.worth_it_user_calculators
            add constraint worth_it_ugc_visibility_check check (visibility in ('public','private'));
    end if;
    if not exists(select 1 from pg_constraint where conname='worth_it_ugc_subcategories_count_check') then
        alter table private.worth_it_user_calculators
            add constraint worth_it_ugc_subcategories_count_check check (cardinality(subcategories) between 1 and 3);
    end if;
end
$constraints$;

create index if not exists worth_it_user_calculators_visibility_catalog_idx
    on private.worth_it_user_calculators(status,visibility,published_at desc);
create index if not exists worth_it_user_calculators_subcategories_idx
    on private.worth_it_user_calculators using gin(subcategories);

create or replace function private.worth_it_validate_ugc_categories(p_category text,p_subcategories text[])
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
    v_allowed text[];
    v_values text[] := coalesce(p_subcategories,array[]::text[]);
begin
    v_allowed := case p_category
        when 'cars' then array['car-ownership','ev-ownership','fuel-costs','vehicle-financing','car-insurance','car-maintenance','depreciation-resale','vehicle-comparison']::text[]
        when 'money' then array['budgeting','saving','investing','loans-debt','mortgages','taxes','income-salary','retirement']::text[]
        when 'technology' then array['smartphones','computers','gaming','software-subscriptions','internet-connectivity','consumer-electronics','tech-comparison']::text[]
        when 'home' then array['utilities-energy','rent-housing','home-buying','renovation-repairs','home-appliances','home-maintenance','household-budget']::text[]
        when 'other' then array['travel','education-career','health-fitness','food-groceries','business','lifestyle','general-comparison']::text[]
        else array[]::text[]
    end;
    if cardinality(v_values) not between 1 and 3
       or cardinality(array(select distinct value from unnest(v_values) as items(value)))<>cardinality(v_values)
       or not (v_values <@ v_allowed) then
        raise exception 'The AI-selected subcategories do not match the primary category.' using errcode='22023';
    end if;
end;
$$;

create or replace function private.worth_it_ugc_category_matches(p_category text,p_subcategories text[],p_filter text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
    select p_filter='all'
        or p_filter=p_category
        or p_filter=any(coalesce(p_subcategories,array[]::text[]));
$$;

revoke all on function private.worth_it_validate_ugc_categories(text,text[]) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_ugc_category_matches(text,text[],text) from public,anon,authenticated,service_role;

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
    v_plan text;
    v_daily_limit integer;
    v_creations_used integer;
    v_today date := (now() at time zone 'utc')::date;
    v_title text := btrim(coalesce(p_title,''));
    v_description text := btrim(coalesce(p_description,''));
    v_category text := lower(btrim(coalesce(p_category,'')));
    v_subcategories text[] := array[]::text[];
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
    if jsonb_typeof(p_spec->'subcategories')='array' then
        select coalesce(array_agg(value),array[]::text[])
          into v_subcategories
          from jsonb_array_elements_text(p_spec->'subcategories') as items(value);
    else
        v_subcategories := case v_category
            when 'cars' then array['car-ownership']::text[]
            when 'money' then array['budgeting']::text[]
            when 'technology' then array['tech-comparison']::text[]
            when 'home' then array['household-budget']::text[]
            else array['general-comparison']::text[]
        end;
    end if;
    perform private.worth_it_validate_ugc_categories(v_category,v_subcategories);
    perform private.worth_it_validate_ugc_spec(p_spec - 'subcategories');

    if p_id is null then
        -- The user-row lock serializes total-slot and daily-quota checks for concurrent requests.
        perform 1 from auth.users where id=v_user_id for update;
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

        insert into private.worth_it_user_calculators(owner_user_id,title,description,category,subcategories,spec)
        values(v_user_id,v_title,v_description,v_category,v_subcategories,p_spec - 'subcategories')
        returning id,calculator_number into v_id,v_calculator_number;
    else
        update private.worth_it_user_calculators
           set title=v_title,description=v_description,category=v_category,spec=p_spec - 'subcategories',updated_at=now()
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

drop function if exists public.publish_worth_it_ugc_calculator(uuid);
create or replace function public.publish_worth_it_ugc_calculator(p_id uuid,p_visibility text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_row private.worth_it_user_calculators%rowtype;
    v_visibility text := lower(btrim(coalesce(p_visibility,'private')));
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if v_visibility not in ('public','private') then
        raise exception 'Choose Public or Private visibility.' using errcode='22023';
    end if;
    if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then
        raise exception 'Verify your email before publishing community calculators.' using errcode='42501';
    end if;
    select * into v_row
      from private.worth_it_user_calculators
     where id=p_id and owner_user_id=v_user_id
     for update;
    if not found then raise exception 'Calculator not found or not owned by you.' using errcode='42501'; end if;
    perform private.worth_it_validate_ugc_spec(v_row.spec);
    update private.worth_it_user_calculators
       set status='published',
           visibility=v_visibility,
           published_at=coalesce(published_at,now()),
           updated_at=now()
     where id=p_id;
    return jsonb_build_object('success',true,'id',p_id,'status','published','visibility',v_visibility);
end;
$$;

create or replace function public.set_worth_it_ugc_visibility(p_id uuid,p_visibility text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_visibility text := lower(btrim(coalesce(p_visibility,'')));
    v_updated integer;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if v_visibility not in ('public','private') then
        raise exception 'Choose Public or Private visibility.' using errcode='22023';
    end if;
    if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then
        raise exception 'Verify your email before changing calculator visibility.' using errcode='42501';
    end if;
    update private.worth_it_user_calculators
       set visibility=v_visibility,updated_at=now()
     where id=p_id and owner_user_id=v_user_id and status='published';
    get diagnostics v_updated=row_count;
    if v_updated=0 then raise exception 'Published calculator not found or not owned by you.' using errcode='42501'; end if;
    return jsonb_build_object('success',true,'id',p_id,'visibility',v_visibility);
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
    if not exists(select 1 from private.worth_it_user_calculators where id=p_id and status='published' and visibility='public' and owner_user_id<>v_user_id) then
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
    if not exists(select 1 from private.worth_it_user_calculators where id=p_id and status='published' and visibility='public' and owner_user_id<>v_user_id) then
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
        'id',c.id,'calculator_number',c.calculator_number,'title',c.title,'description',c.description,'category',c.category,'subcategories',c.subcategories,'visibility',c.visibility,'spec',c.spec,
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
    where c.id=p_id and (c.owner_user_id=v_user_id or (c.status='published' and c.visibility='public'));
    if v_result is null then raise exception 'Calculator not found.' using errcode='P0002'; end if;
    return v_result;
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
        'id',c.id,'calculator_number',c.calculator_number,'title',c.title,'description',c.description,'category',c.category,'subcategories',c.subcategories,'visibility',c.visibility,
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
        'id',c.id,'calculator_number',c.calculator_number,'title',c.title,'description',c.description,'category',c.category,'subcategories',c.subcategories,
        'owner_worth_it_id',p.worth_it_id,'owner_display_name',p.display_name,
        'owner_username',p.username,'favorites',(select count(*) from public.worth_it_calculator_favorites x where x.calculator_key='ugc:'||c.id::text)
    ) order by f.created_at desc),'[]'::jsonb)
      into v_result
      from public.worth_it_calculator_favorites f
      join private.worth_it_user_calculators c on f.calculator_key='ugc:'||c.id::text and c.status='published' and c.visibility='public'
      join public.worth_it_profiles p on p.user_id=c.owner_user_id
     where f.user_id=v_user_id and f.calculator_key like 'ugc:%';
    return coalesce(v_result,'[]'::jsonb);
end;
$$;

create or replace function public.get_worth_it_my_favorite_ugc_calculators(p_search text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_search text := left(btrim(coalesce(p_search,'')),80);
    v_result jsonb;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode = '28000'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,'calculator_number',c.calculator_number,'title',c.title,'description',c.description,
        'category',c.category,'subcategories',c.subcategories,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at,
        'published_at',c.published_at,'owner_worth_it_id',p.worth_it_id,
        'owner_display_name',p.display_name,'owner_username',p.username,
        'views',(select count(*) from private.worth_it_calculator_views v where v.calculator_id=c.id),
        'likes',(select count(*) from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='like'),
        'dislikes',(select count(*) from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='dislike'),
        'favorites',(select count(*) from public.worth_it_calculator_favorites f2 where f2.calculator_key='ugc:'||c.id::text)
    ) order by f.created_at desc),'[]'::jsonb)
      into v_result
      from public.worth_it_calculator_favorites f
      join private.worth_it_user_calculators c
        on f.calculator_key='ugc:'||c.id::text and c.status='published' and c.visibility='public'
      join public.worth_it_profiles p on p.user_id=c.owner_user_id
     where f.user_id=v_user_id
       and f.calculator_key like 'ugc:%'
       and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%');

    return coalesce(v_result,'[]'::jsonb);
end;
$$;

create table if not exists private.worth_it_ugc_ai_edit_daily_usage (
    user_id uuid not null references auth.users(id) on delete cascade,
    usage_date date not null,
    edits_used smallint not null check (edits_used between 1 and 4),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id,usage_date)
);
alter table private.worth_it_ugc_ai_edit_daily_usage enable row level security;
revoke all on private.worth_it_ugc_ai_edit_daily_usage from public,anon,authenticated;

create table if not exists private.worth_it_ugc_ai_edit_requests (
    request_id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    calculator_id uuid not null references private.worth_it_user_calculators(id) on delete cascade,
    usage_date date not null,
    status text not null default 'reserved' check (status in ('reserved','completed','refunded')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists worth_it_ugc_ai_edit_requests_user_idx
    on private.worth_it_ugc_ai_edit_requests(user_id,usage_date,status);
alter table private.worth_it_ugc_ai_edit_requests enable row level security;
revoke all on private.worth_it_ugc_ai_edit_requests from public,anon,authenticated;

create or replace function public.get_worth_it_ugc_catalog_page(
    p_sort text default 'latest',
    p_period text default '12y',
    p_search text default '',
    p_category text default 'all',
    p_page integer default 1
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
    v_category text := lower(coalesce(p_category,'all'));
    v_search text := left(btrim(coalesce(p_search,'')),80);
    v_cutoff timestamptz;
    v_page integer := greatest(1,least(10000,coalesce(p_page,1)));
    v_page_size integer := 30;
    v_total integer := 0;
    v_total_pages integer := 1;
    v_offset integer;
    v_items jsonb := '[]'::jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign in required to browse community calculators.' using errcode='28000';
    end if;

    if v_sort not in ('latest','popular','liked','favorited','disliked','mine','my-drafts','my-favorites') then
        v_sort := 'latest';
    end if;
    if v_category not in ('all','cars','money','technology','home','other',
          'car-ownership','ev-ownership','fuel-costs','vehicle-financing','car-insurance','car-maintenance','depreciation-resale','vehicle-comparison',
          'budgeting','saving','investing','loans-debt','mortgages','taxes','income-salary','retirement',
          'smartphones','computers','gaming','software-subscriptions','internet-connectivity','consumer-electronics','tech-comparison',
          'utilities-energy','rent-housing','home-buying','renovation-repairs','home-appliances','home-maintenance','household-budget',
          'travel','education-career','health-fitness','food-groceries','business','lifestyle','general-comparison') then
        v_category := 'all';
    end if;

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

    if v_sort='mine' then
        select count(*)::integer into v_total
          from private.worth_it_user_calculators c
         where c.owner_user_id=v_user_id
           and c.status='published'
           and private.worth_it_ugc_category_matches(c.category,c.subcategories,v_category)
           and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%');

        v_total_pages := greatest(1,ceil(v_total::numeric/v_page_size)::integer);
        v_page := least(v_page,v_total_pages);
        v_offset := (v_page-1)*v_page_size;

        select coalesce(jsonb_agg(jsonb_build_object(
            'id',q.id,'calculator_number',q.calculator_number,'title',q.title,'description',q.description,
            'category',q.category,'subcategories',q.subcategories,'visibility',q.visibility,'status',q.status,'spec',q.spec,'created_at',q.created_at,
            'updated_at',q.updated_at,'published_at',q.published_at,
            'owner_worth_it_id',q.worth_it_id,'owner_username',q.username,
            'owner_display_name',q.display_name,'owner_avatar_url',q.avatar_url,
            'views',q.views,'likes',q.likes,'dislikes',q.dislikes,'favorites',q.favorites,
            'is_owner',true,'is_favorite',false,'my_reaction',null
        ) order by q.updated_at desc,q.id),'[]'::jsonb)
          into v_items
          from (
            select c.*,p.worth_it_id,p.username,p.display_name,p.avatar_url,
                (select count(*)::integer from private.worth_it_calculator_views v where v.calculator_id=c.id) as views,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='like') as likes,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='dislike') as dislikes,
                (select count(*)::integer from public.worth_it_calculator_favorites f where f.calculator_key='ugc:'||c.id::text) as favorites
              from private.worth_it_user_calculators c
              join public.worth_it_profiles p on p.user_id=c.owner_user_id
             where c.owner_user_id=v_user_id
               and private.worth_it_ugc_category_matches(c.category,c.subcategories,v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
             order by c.updated_at desc,c.id
             limit v_page_size offset v_offset
          ) q;

        elsif v_sort='my-drafts' then
        select count(*)::integer into v_total
          from private.worth_it_user_calculators c
         where c.owner_user_id=v_user_id
           and c.status='draft'
           and private.worth_it_ugc_category_matches(c.category,c.subcategories,v_category)
           and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%');

        v_total_pages := greatest(1,ceil(v_total::numeric/v_page_size)::integer);
        v_page := least(v_page,v_total_pages);
        v_offset := (v_page-1)*v_page_size;

        select coalesce(jsonb_agg(jsonb_build_object(
            'id',q.id,'calculator_number',q.calculator_number,'title',q.title,'description',q.description,
            'category',q.category,'subcategories',q.subcategories,'visibility',q.visibility,'status',q.status,'spec',q.spec,'created_at',q.created_at,
            'updated_at',q.updated_at,'published_at',q.published_at,
            'owner_worth_it_id',q.worth_it_id,'owner_username',q.username,
            'owner_display_name',q.display_name,'owner_avatar_url',q.avatar_url,
            'views',q.views,'likes',q.likes,'dislikes',q.dislikes,'favorites',q.favorites,
            'is_owner',true,'is_favorite',false,'my_reaction',null
        ) order by q.updated_at desc,q.id),'[]'::jsonb)
          into v_items
          from (
            select c.*,p.worth_it_id,p.username,p.display_name,p.avatar_url,
                (select count(*)::integer from private.worth_it_calculator_views v where v.calculator_id=c.id) as views,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='like') as likes,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='dislike') as dislikes,
                (select count(*)::integer from public.worth_it_calculator_favorites f where f.calculator_key='ugc:'||c.id::text) as favorites
              from private.worth_it_user_calculators c
              join public.worth_it_profiles p on p.user_id=c.owner_user_id
             where c.owner_user_id=v_user_id
               and private.worth_it_ugc_category_matches(c.category,c.subcategories,v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
             order by c.updated_at desc,c.id
             limit v_page_size offset v_offset
          ) q;

    
    elsif v_sort='my-favorites' then
        select count(*)::integer into v_total
          from public.worth_it_calculator_favorites f
          join private.worth_it_user_calculators c
            on f.calculator_key='ugc:'||c.id::text and c.status='published' and c.visibility='public'
         where f.user_id=v_user_id
           and private.worth_it_ugc_category_matches(c.category,c.subcategories,v_category)
           and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%');

        v_total_pages := greatest(1,ceil(v_total::numeric/v_page_size)::integer);
        v_page := least(v_page,v_total_pages);
        v_offset := (v_page-1)*v_page_size;

        select coalesce(jsonb_agg(jsonb_build_object(
            'id',q.id,'calculator_number',q.calculator_number,'title',q.title,'description',q.description,
            'category',q.category,'subcategories',q.subcategories,'visibility',q.visibility,'status',q.status,'spec',q.spec,'created_at',q.created_at,
            'updated_at',q.updated_at,'published_at',q.published_at,
            'owner_worth_it_id',q.worth_it_id,'owner_username',q.username,
            'owner_display_name',q.display_name,'owner_avatar_url',q.avatar_url,
            'views',q.views,'likes',q.likes,'dislikes',q.dislikes,'favorites',q.favorites,
            'is_owner',(q.owner_user_id=v_user_id),'is_favorite',true,'my_reaction',q.my_reaction
        ) order by q.favourited_at desc,q.id),'[]'::jsonb)
          into v_items
          from (
            select c.*,p.worth_it_id,p.username,p.display_name,p.avatar_url,f.created_at as favourited_at,
                (select count(*)::integer from private.worth_it_calculator_views v where v.calculator_id=c.id) as views,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='like') as likes,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='dislike') as dislikes,
                (select count(*)::integer from public.worth_it_calculator_favorites f2 where f2.calculator_key='ugc:'||c.id::text) as favorites,
                (select r.reaction from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.user_id=v_user_id) as my_reaction
              from public.worth_it_calculator_favorites f
              join private.worth_it_user_calculators c
                on f.calculator_key='ugc:'||c.id::text and c.status='published' and c.visibility='public'
              join public.worth_it_profiles p on p.user_id=c.owner_user_id
             where f.user_id=v_user_id
               and private.worth_it_ugc_category_matches(c.category,c.subcategories,v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
             order by f.created_at desc,c.id
             limit v_page_size offset v_offset
          ) q;

    
    else
        with ranked as (
            select c.id,c.calculator_number,c.title,c.description,c.category,c.subcategories,c.visibility,c.status,c.spec,c.owner_user_id,
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
             where c.status='published' and c.visibility='public'
               and private.worth_it_ugc_category_matches(c.category,c.subcategories,v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
               and (v_sort<>'latest' or c.published_at>=v_cutoff)
        )
        select count(*)::integer into v_total from ranked;

        v_total_pages := greatest(1,ceil(v_total::numeric/v_page_size)::integer);
        v_page := least(v_page,v_total_pages);
        v_offset := (v_page-1)*v_page_size;

        with ranked as (
            select c.id,c.calculator_number,c.title,c.description,c.category,c.subcategories,c.visibility,c.status,c.spec,c.owner_user_id,
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
             where c.status='published' and c.visibility='public'
               and private.worth_it_ugc_category_matches(c.category,c.subcategories,v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
               and (v_sort<>'latest' or c.published_at>=v_cutoff)
        ), page_rows as (
            select * from ranked
             order by
               case when v_sort='popular' then views end desc,
               case when v_sort='liked' then likes end desc,
               case when v_sort='favorited' then favorites end desc,
               case when v_sort='disliked' then dislikes end desc,
               published_at desc,id
             limit v_page_size offset v_offset
        )
        select coalesce(jsonb_agg(jsonb_build_object(
            'id',id,'calculator_number',calculator_number,'title',title,'description',description,
            'category',category,'subcategories',subcategories,'visibility',visibility,'status',status,'spec',spec,'created_at',created_at,'updated_at',updated_at,
            'published_at',published_at,'owner_worth_it_id',worth_it_id,'owner_username',username,
            'owner_display_name',display_name,'owner_avatar_url',avatar_url,
            'views',views,'likes',likes,'dislikes',dislikes,'favorites',favorites,
            'is_owner',(owner_user_id=v_user_id),'is_favorite',is_favorite,'my_reaction',my_reaction
        ) order by
            case when v_sort='popular' then views end desc,
            case when v_sort='liked' then likes end desc,
            case when v_sort='favorited' then favorites end desc,
            case when v_sort='disliked' then dislikes end desc,
            published_at desc,id),'[]'::jsonb)
          into v_items from page_rows;
    end if;

    return jsonb_build_object(
        'items',coalesce(v_items,'[]'::jsonb),
        'total_count',v_total,
        'page',v_page,
        'page_size',v_page_size,
        'total_pages',v_total_pages,
        'category',v_category,
        'sort',v_sort
    );
end;
$$;

revoke all on function public.get_worth_it_ugc_catalog_page(text,text,text,text,integer) from public,anon;
grant execute on function public.get_worth_it_ugc_catalog_page(text,text,text,text,integer) to authenticated;

commit;

revoke all on function public.get_worth_it_ugc_catalog(text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.delete_worth_it_ugc_calculator(uuid) from public,anon,authenticated;
revoke all on function public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb) to authenticated;
revoke all on function public.publish_worth_it_ugc_calculator(uuid,text) from public,anon;
grant execute on function public.publish_worth_it_ugc_calculator(uuid,text) to authenticated;
revoke all on function public.set_worth_it_ugc_visibility(uuid,text) from public,anon;
grant execute on function public.set_worth_it_ugc_visibility(uuid,text) to authenticated;
revoke all on function public.get_worth_it_ugc_catalog_page(text,text,text,text,integer) from public,anon;
grant execute on function public.get_worth_it_ugc_catalog_page(text,text,text,text,integer) to authenticated;

commit;
