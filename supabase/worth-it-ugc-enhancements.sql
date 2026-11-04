-- PR #194 follow-up: owner-only favourites, description cooldown and AI refinement quotas.
-- Apply only to the dedicated PR #194 Staging database. Do not apply to Production in this rollout.
begin;

alter table private.worth_it_user_calculators
    add column if not exists description_changed_at timestamptz;

create or replace function private.worth_it_guard_ugc_calculator_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
    v_now timestamptz := clock_timestamp();
begin
    if new.title is distinct from old.title or new.category is distinct from old.category then
        raise exception 'A saved community calculator cannot be changed into a different calculator. Its title and category are fixed after creation.'
            using errcode = '22023';
    end if;

    if new.description is distinct from old.description then
        if old.description_changed_at is not null
           and old.description_changed_at + interval '10 minutes' > v_now then
            raise exception 'A community calculator description can be changed once every 10 minutes.'
                using errcode = '55000';
        end if;
        new.description_changed_at := v_now;
    end if;
    return new;
end;
$$;

drop trigger if exists worth_it_ugc_guard_calculator_update on private.worth_it_user_calculators;
create trigger worth_it_ugc_guard_calculator_update
before update on private.worth_it_user_calculators
for each row execute function private.worth_it_guard_ugc_calculator_update();

create or replace function public.get_worth_it_ugc_description_status(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_changed_at timestamptz;
    v_title text;
    v_description text;
    v_next timestamptz;
    v_now timestamptz := clock_timestamp();
    v_remaining_ms bigint;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
    select c.title,c.description,c.description_changed_at
      into v_title,v_description,v_changed_at
      from private.worth_it_user_calculators c
     where c.id=p_id and c.owner_user_id=v_user_id;
    if not found then raise exception 'Calculator not found or not owned by you.' using errcode = '42501'; end if;

    v_next := case when v_changed_at is not null and v_changed_at + interval '10 minutes' > v_now
                   then v_changed_at + interval '10 minutes' else null end;
    v_remaining_ms := case when v_next is null then 0
        else greatest(0,ceil(extract(epoch from (v_next-v_now))*1000)::bigint) end;
    return jsonb_build_object(
        'success',true,'description',coalesce(v_description,''),'can_save',v_next is null,
        'changed_at',v_changed_at,'next_save_at',v_next,'remaining_ms',v_remaining_ms,
        'cooldown_seconds',600
    );
end;
$$;

create or replace function public.update_worth_it_ugc_calculator_description(
    p_id uuid,
    p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_row private.worth_it_user_calculators%rowtype;
    v_description text := btrim(coalesce(p_description,''));
    v_now timestamptz := clock_timestamp();
    v_next timestamptz;
    v_remaining_ms bigint;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
    if char_length(v_description)>500 then
        raise exception 'Description can contain up to 500 characters.' using errcode = '22023';
    end if;
    if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then
        raise exception 'Verify your email before changing a community calculator description.' using errcode = '42501';
    end if;

    select * into v_row
      from private.worth_it_user_calculators
     where id=p_id and owner_user_id=v_user_id
     for update;
    if not found then raise exception 'Calculator not found or not owned by you.' using errcode = '42501'; end if;

    if v_row.description is not distinct from v_description then
        v_next := case when v_row.description_changed_at is not null and v_row.description_changed_at + interval '10 minutes' > v_now
                       then v_row.description_changed_at + interval '10 minutes' else null end;
        v_remaining_ms := case when v_next is null then 0
            else greatest(0,ceil(extract(epoch from (v_next-v_now))*1000)::bigint) end;
        return jsonb_build_object('success',true,'unchanged',true,'description',v_row.description,
            'can_save',v_next is null,'next_save_at',v_next,'remaining_ms',v_remaining_ms);
    end if;

    v_next := case when v_row.description_changed_at is not null
                         then v_row.description_changed_at + interval '10 minutes' else null end;
    if v_next is not null and v_next>v_now then
        v_remaining_ms := greatest(0,ceil(extract(epoch from (v_next-v_now))*1000)::bigint);
        return jsonb_build_object('success',false,'code','DESCRIPTION_COOLDOWN',
            'error','You can change this calculator description once every 10 minutes.',
            'can_save',false,'next_save_at',v_next,'remaining_ms',v_remaining_ms);
    end if;

    update private.worth_it_user_calculators
       set description=v_description,updated_at=v_now
     where id=p_id and owner_user_id=v_user_id;
    return jsonb_build_object('success',true,'unchanged',false,'description',v_description,
        'can_save',false,'next_save_at',v_now+interval '10 minutes','remaining_ms',600000);
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
        'category',c.category,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at,
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
        on f.calculator_key='ugc:'||c.id::text and c.status='published'
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

create or replace function public.get_worth_it_ugc_ai_edit_quota()
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
    if v_user_id is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
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
    if not found then raise exception 'Verify your email before improving a community calculator.' using errcode = '42501'; end if;

    v_limit := case v_plan when 'premium' then 4 when 'premium_lite' then 3 else 2 end;
    select edits_used into v_used
      from private.worth_it_ugc_ai_edit_daily_usage
     where user_id=v_user_id and usage_date=v_today;
    v_used := coalesce(v_used,0);
    return jsonb_build_object('success',true,'plan',v_plan,'usage_date',v_today,
        'daily_limit',v_limit,'edits_used',v_used,'remaining',greatest(0,v_limit-v_used));
end;
$$;

create or replace function public.reserve_worth_it_ugc_ai_edit(p_id uuid,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_plan text;
    v_limit integer;
    v_used integer;
    v_today date := (now() at time zone 'utc')::date;
    v_reserved uuid;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
    if p_request_id is null then raise exception 'A request ID is required.' using errcode = '22023'; end if;

    perform 1 from auth.users where id=v_user_id and email_confirmed_at is not null for update;
    if not found then raise exception 'Verify your email before improving a community calculator.' using errcode = '42501'; end if;
    if not exists(select 1 from private.worth_it_user_calculators where id=p_id and owner_user_id=v_user_id) then
        raise exception 'Calculator not found or not owned by you.' using errcode = '42501';
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
    v_limit := case v_plan when 'premium' then 4 when 'premium_lite' then 3 else 2 end;

    insert into private.worth_it_ugc_ai_edit_requests(request_id,user_id,calculator_id,usage_date,status)
    values(p_request_id,v_user_id,p_id,v_today,'reserved')
    on conflict(request_id) do nothing
    returning request_id into v_reserved;
    if v_reserved is null then
        return jsonb_build_object('ok',false,'code','DUPLICATE_REQUEST');
    end if;

    insert into private.worth_it_ugc_ai_edit_daily_usage(user_id,usage_date,edits_used)
    values(v_user_id,v_today,1)
    on conflict(user_id,usage_date) do update
       set edits_used=private.worth_it_ugc_ai_edit_daily_usage.edits_used+1,updated_at=now()
     where private.worth_it_ugc_ai_edit_daily_usage.edits_used<v_limit
    returning edits_used into v_used;

    if v_used is null then
        delete from private.worth_it_ugc_ai_edit_requests where request_id=p_request_id and user_id=v_user_id and status='reserved';
        select edits_used into v_used from private.worth_it_ugc_ai_edit_daily_usage
         where user_id=v_user_id and usage_date=v_today;
        return jsonb_build_object('ok',false,'code','DAILY_LIMIT','daily_limit',v_limit,
            'edits_used',coalesce(v_used,0),'remaining',0);
    end if;

    return jsonb_build_object('ok',true,'request_id',p_request_id,'daily_limit',v_limit,
        'edits_used',v_used,'remaining',greatest(0,v_limit-v_used));
end;
$$;

create or replace function public.settle_worth_it_ugc_ai_edit(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_status text;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
    select status into v_status from private.worth_it_ugc_ai_edit_requests
     where request_id=p_request_id and user_id=v_user_id for update;
    if not found then return jsonb_build_object('ok',false,'code','REQUEST_NOT_FOUND'); end if;
    if v_status='completed' then return jsonb_build_object('ok',true,'already_settled',true); end if;
    if v_status='refunded' then return jsonb_build_object('ok',false,'code','REQUEST_REFUNDED'); end if;
    update private.worth_it_ugc_ai_edit_requests set status='completed',updated_at=now()
     where request_id=p_request_id and user_id=v_user_id and status='reserved';
    return jsonb_build_object('ok',true,'already_settled',false);
end;
$$;

create or replace function public.refund_worth_it_ugc_ai_edit(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_usage_date date;
    v_status text;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
    update private.worth_it_ugc_ai_edit_requests
       set status='refunded',updated_at=now()
     where request_id=p_request_id and user_id=v_user_id and status='reserved'
    returning usage_date into v_usage_date;

    if v_usage_date is null then
        select status into v_status from private.worth_it_ugc_ai_edit_requests
         where request_id=p_request_id and user_id=v_user_id;
        return jsonb_build_object('ok',v_status='refunded','already_refunded',v_status='refunded');
    end if;

    update private.worth_it_ugc_ai_edit_daily_usage
       set edits_used=greatest(0,edits_used-1),updated_at=now()
     where user_id=v_user_id and usage_date=v_usage_date;
    return jsonb_build_object('ok',true,'refunded',true);
end;
$$;

revoke all on function public.get_worth_it_ugc_description_status(uuid) from public,anon;
revoke all on function public.update_worth_it_ugc_calculator_description(uuid,text) from public,anon;
revoke all on function public.get_worth_it_my_favorite_ugc_calculators(text) from public,anon;
revoke all on function public.get_worth_it_ugc_ai_edit_quota() from public,anon;
revoke all on function public.reserve_worth_it_ugc_ai_edit(uuid,uuid) from public,anon;
revoke all on function public.settle_worth_it_ugc_ai_edit(uuid) from public,anon;
revoke all on function public.refund_worth_it_ugc_ai_edit(uuid) from public,anon;

grant execute on function public.get_worth_it_ugc_description_status(uuid) to authenticated;
grant execute on function public.update_worth_it_ugc_calculator_description(uuid,text) to authenticated;
grant execute on function public.get_worth_it_my_favorite_ugc_calculators(text) to authenticated;
grant execute on function public.get_worth_it_ugc_ai_edit_quota() to authenticated;
grant execute on function public.reserve_worth_it_ugc_ai_edit(uuid,uuid) to authenticated;
grant execute on function public.settle_worth_it_ugc_ai_edit(uuid) to authenticated;
grant execute on function public.refund_worth_it_ugc_ai_edit(uuid) to authenticated;

commit;
