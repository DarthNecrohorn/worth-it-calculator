-- Refund unsuccessful AI Maker generations and enforce shared + tier-based daily quotas.
-- This migration belongs to PR #194. Apply only in an approved UGC staging environment.

create table if not exists private.worth_it_ugc_maker_generation_reservations (
    request_id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    usage_date date not null,
    status text not null default 'reserved'
        check (status in ('reserved', 'refunded', 'consumed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists worth_it_ugc_maker_generation_reservations_user_date_idx
    on private.worth_it_ugc_maker_generation_reservations(user_id, usage_date);

create table if not exists private.worth_it_ugc_maker_global_daily_usage (
    usage_date date primary key,
    requests_used integer not null check (requests_used >= 1),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Backfill generations already reserved or successfully completed before this
-- shared counter was introduced. GREATEST keeps this migration repeatable.
insert into private.worth_it_ugc_maker_global_daily_usage(usage_date, requests_used)
select usage_date, count(*)::integer
  from private.worth_it_ugc_maker_generation_reservations
 where status in ('reserved','consumed')
 group by usage_date
on conflict (usage_date) do update
   set requests_used = greatest(
           private.worth_it_ugc_maker_global_daily_usage.requests_used,
           excluded.requests_used
       ),
       updated_at = now();

alter table private.worth_it_ugc_maker_generation_reservations enable row level security;
alter table private.worth_it_ugc_maker_global_daily_usage enable row level security;
revoke all on private.worth_it_ugc_maker_generation_reservations from public, anon, authenticated;
revoke all on private.worth_it_ugc_maker_global_daily_usage from public, anon, authenticated;

create or replace function public.get_worth_it_ugc_maker_generation_quota()
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
    v_global_used integer := 0;
    v_today date := (now() at time zone 'UTC')::date;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;

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

    if not found then
        raise exception 'Verify your email before using the AI calculator maker.' using errcode = '42501';
    end if;

    v_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;

    select requests_used into v_used
      from private.worth_it_ugc_maker_daily_usage
     where user_id=v_user_id and usage_date=v_today;
    select requests_used into v_global_used
      from private.worth_it_ugc_maker_global_daily_usage
     where usage_date=v_today;

    v_used := coalesce(v_used,0);
    v_global_used := coalesce(v_global_used,0);

    return jsonb_build_object(
        'success',true,
        'plan',v_plan,
        'usage_date',v_today,
        'daily_limit',v_limit,
        'requests_used',v_used,
        'remaining',greatest(0,v_limit-v_used),
        'global_daily_limit',100,
        'global_requests_used',v_global_used,
        'global_remaining',greatest(0,100-v_global_used)
    );
end;
$$;

create or replace function public.reserve_worth_it_ugc_maker_generation_v2(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_today date := (now() at time zone 'UTC')::date;
    v_used smallint;
    v_limit integer;
    v_plan text;
    v_global_used integer;
    v_existing_user_id uuid;
    v_existing_date date;
    v_existing_status text;
    v_inserted_request_id uuid;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_request_id is null then
        raise exception 'A generation request ID is required.' using errcode = '22023';
    end if;
    if not exists (
        select 1 from auth.users
         where id = v_user_id and email_confirmed_at is not null
    ) then
        raise exception 'Verify your email before using the AI calculator maker.' using errcode = '42501';
    end if;

    -- Serialize plan and per-account quota checks, including simultaneous requests.
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
    v_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;

    insert into private.worth_it_ugc_maker_generation_reservations(
        request_id, user_id, usage_date, status
    )
    values (p_request_id, v_user_id, v_today, 'reserved')
    on conflict (request_id) do nothing
    returning request_id into v_inserted_request_id;

    if v_inserted_request_id is null then
        select user_id, usage_date, status
          into v_existing_user_id, v_existing_date, v_existing_status
          from private.worth_it_ugc_maker_generation_reservations
         where request_id = p_request_id
         for update;

        if not found or v_existing_user_id is distinct from v_user_id then
            raise exception 'The generation reservation does not belong to this account.'
                using errcode = '42501';
        end if;
        if v_existing_status = 'refunded' then
            return jsonb_build_object(
                'ok', false, 'code', 'RESERVATION_REFUNDED',
                'daily_limit', v_limit, 'global_daily_limit', 100, 'usage_date', v_existing_date
            );
        end if;

        select requests_used into v_used
          from private.worth_it_ugc_maker_daily_usage
         where user_id = v_user_id and usage_date = v_existing_date;
        select requests_used into v_global_used
          from private.worth_it_ugc_maker_global_daily_usage
         where usage_date = v_existing_date;

        return jsonb_build_object(
            'ok', true,
            'requests_used', coalesce(v_used, 0),
            'daily_limit', v_limit,
            'global_requests_used', coalesce(v_global_used, 0),
            'global_daily_limit', 100,
            'usage_date', v_existing_date,
            'already_reserved', true
        );
    end if;

    insert into private.worth_it_ugc_maker_daily_usage(user_id, usage_date, requests_used)
    values (v_user_id, v_today, 1)
    on conflict (user_id, usage_date) do update
       set requests_used = private.worth_it_ugc_maker_daily_usage.requests_used + 1,
           updated_at = now()
     where private.worth_it_ugc_maker_daily_usage.requests_used < v_limit
    returning requests_used into v_used;

    if v_used is null then
        delete from private.worth_it_ugc_maker_generation_reservations
         where request_id = p_request_id and user_id = v_user_id;

        return jsonb_build_object(
            'ok', false, 'code', 'DAILY_LIMIT',
            'daily_limit', v_limit, 'requests_used', v_limit,
            'global_daily_limit', 100, 'usage_date', v_today
        );
    end if;

    -- This upsert is the shared atomic gate. It counts reserved + successful
    -- requests; failures decrement it in the refund function below.
    insert into private.worth_it_ugc_maker_global_daily_usage(usage_date, requests_used)
    values (v_today, 1)
    on conflict (usage_date) do update
       set requests_used = private.worth_it_ugc_maker_global_daily_usage.requests_used + 1,
           updated_at = now()
     where private.worth_it_ugc_maker_global_daily_usage.requests_used < 100
    returning requests_used into v_global_used;

    if v_global_used is null then
        update private.worth_it_ugc_maker_daily_usage
           set requests_used=requests_used-1, updated_at=now()
         where user_id=v_user_id and usage_date=v_today and requests_used>1;
        if not found then
            delete from private.worth_it_ugc_maker_daily_usage
             where user_id=v_user_id and usage_date=v_today and requests_used=1;
        end if;

        delete from private.worth_it_ugc_maker_generation_reservations
         where request_id=p_request_id and user_id=v_user_id;

        select requests_used into v_global_used
          from private.worth_it_ugc_maker_global_daily_usage
         where usage_date=v_today;

        return jsonb_build_object(
            'ok', false, 'code', 'GLOBAL_DAILY_LIMIT',
            'daily_limit', v_limit,
            'global_daily_limit', 100,
            'global_requests_used', coalesce(v_global_used,100),
            'usage_date', v_today
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'requests_used', v_used,
        'daily_limit', v_limit,
        'global_requests_used', v_global_used,
        'global_daily_limit', 100,
        'usage_date', v_today
    );
end;
$$;

create or replace function public.refund_worth_it_ugc_maker_generation_v2(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_usage_date date;
    v_status text;
    v_remaining smallint;
    v_global_remaining integer;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_request_id is null then
        raise exception 'A generation request ID is required.' using errcode = '22023';
    end if;

    select usage_date, status
      into v_usage_date, v_status
      from private.worth_it_ugc_maker_generation_reservations
     where request_id = p_request_id and user_id = v_user_id
     for update;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND');
    end if;
    if v_status = 'refunded' then
        return jsonb_build_object(
            'ok', true, 'refunded', false, 'already_refunded', true,
            'usage_date', v_usage_date
        );
    end if;
    if v_status = 'consumed' then
        return jsonb_build_object('ok', false, 'code', 'RESERVATION_ALREADY_CONSUMED');
    end if;

    update private.worth_it_ugc_maker_daily_usage
       set requests_used = requests_used - 1,
           updated_at = now()
     where user_id = v_user_id
       and usage_date = v_usage_date
       and requests_used > 1
    returning requests_used into v_remaining;

    if v_remaining is null then
        delete from private.worth_it_ugc_maker_daily_usage
         where user_id = v_user_id
           and usage_date = v_usage_date
           and requests_used = 1
        returning 0 into v_remaining;
    end if;

    if v_remaining is null then
        raise exception 'The Maker daily counter is inconsistent with its reservation.';
    end if;

    update private.worth_it_ugc_maker_global_daily_usage
       set requests_used=requests_used-1,updated_at=now()
     where usage_date=v_usage_date and requests_used>1
    returning requests_used into v_global_remaining;

    if v_global_remaining is null then
        delete from private.worth_it_ugc_maker_global_daily_usage
         where usage_date=v_usage_date and requests_used=1
        returning 0 into v_global_remaining;
    end if;

    if v_global_remaining is null then
        raise exception 'The global Maker daily counter is inconsistent with its reservation.';
    end if;

    update private.worth_it_ugc_maker_generation_reservations
       set status = 'refunded', updated_at = now()
     where request_id = p_request_id and user_id = v_user_id;

    return jsonb_build_object(
        'ok', true, 'refunded', true,
        'requests_used', v_remaining,
        'global_requests_used', v_global_remaining,
        'global_daily_limit', 100,
        'usage_date', v_usage_date
    );
end;
$$;

create or replace function public.settle_worth_it_ugc_maker_generation_v2(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_status text;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_request_id is null then
        raise exception 'A generation request ID is required.' using errcode = '22023';
    end if;

    select status into v_status
      from private.worth_it_ugc_maker_generation_reservations
     where request_id = p_request_id and user_id = v_user_id
     for update;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND');
    end if;
    if v_status = 'refunded' then
        return jsonb_build_object('ok', false, 'code', 'RESERVATION_ALREADY_REFUNDED');
    end if;
    if v_status = 'consumed' then
        return jsonb_build_object('ok', true, 'already_settled', true);
    end if;

    update private.worth_it_ugc_maker_generation_reservations
       set status = 'consumed', updated_at = now()
     where request_id = p_request_id and user_id = v_user_id;

    return jsonb_build_object('ok', true, 'settled', true);
end;
$$;

-- The legacy no-ID function remains safe for direct RPC callers. Route it
-- through the same tier and site-wide reservations so it cannot bypass either.
create or replace function public.reserve_worth_it_ugc_maker_generation()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_request_id uuid := gen_random_uuid();
    v_result jsonb;
begin
    v_result := public.reserve_worth_it_ugc_maker_generation_v2(v_request_id);
    if coalesce((v_result->>'ok')::boolean,false) then
        perform public.settle_worth_it_ugc_maker_generation_v2(v_request_id);
    end if;
    return v_result;
end;
$$;

revoke all on function public.get_worth_it_ugc_maker_generation_quota() from public, anon;
revoke all on function public.reserve_worth_it_ugc_maker_generation() from public, anon;
revoke all on function public.reserve_worth_it_ugc_maker_generation_v2(uuid) from public, anon;
revoke all on function public.refund_worth_it_ugc_maker_generation_v2(uuid) from public, anon;
revoke all on function public.settle_worth_it_ugc_maker_generation_v2(uuid) from public, anon;

grant execute on function public.get_worth_it_ugc_maker_generation_quota() to authenticated;
grant execute on function public.reserve_worth_it_ugc_maker_generation() to authenticated;
grant execute on function public.reserve_worth_it_ugc_maker_generation_v2(uuid) to authenticated;
grant execute on function public.refund_worth_it_ugc_maker_generation_v2(uuid) to authenticated;
grant execute on function public.settle_worth_it_ugc_maker_generation_v2(uuid) to authenticated;
