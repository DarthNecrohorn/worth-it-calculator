-- Refund AI Maker generation reservations when a calculator draft cannot be generated.
-- Applied to Worth It PR194 Staging only; production is unchanged.

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

alter table private.worth_it_ugc_maker_generation_reservations enable row level security;
revoke all on private.worth_it_ugc_maker_generation_reservations from public, anon, authenticated;

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
                'daily_limit', 10, 'usage_date', v_existing_date
            );
        end if;

        select requests_used into v_used
          from private.worth_it_ugc_maker_daily_usage
         where user_id = v_user_id and usage_date = v_existing_date;

        return jsonb_build_object(
            'ok', true, 'requests_used', coalesce(v_used, 0),
            'daily_limit', 10, 'usage_date', v_existing_date,
            'already_reserved', true
        );
    end if;

    insert into private.worth_it_ugc_maker_daily_usage(user_id, usage_date, requests_used)
    values (v_user_id, v_today, 1)
    on conflict (user_id, usage_date) do update
       set requests_used = private.worth_it_ugc_maker_daily_usage.requests_used + 1,
           updated_at = now()
     where private.worth_it_ugc_maker_daily_usage.requests_used < 10
    returning requests_used into v_used;

    if v_used is null then
        delete from private.worth_it_ugc_maker_generation_reservations
         where request_id = p_request_id and user_id = v_user_id;

        return jsonb_build_object(
            'ok', false, 'code', 'DAILY_LIMIT', 'daily_limit', 10,
            'requests_used', 10, 'usage_date', v_today
        );
    end if;

    return jsonb_build_object(
        'ok', true, 'requests_used', v_used,
        'daily_limit', 10, 'usage_date', v_today
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

    update private.worth_it_ugc_maker_generation_reservations
       set status = 'refunded', updated_at = now()
     where request_id = p_request_id and user_id = v_user_id;

    return jsonb_build_object(
        'ok', true, 'refunded', true, 'requests_used', v_remaining,
        'daily_limit', 10, 'usage_date', v_usage_date
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

revoke all on function public.reserve_worth_it_ugc_maker_generation_v2(uuid) from public, anon;
revoke all on function public.refund_worth_it_ugc_maker_generation_v2(uuid) from public, anon;
revoke all on function public.settle_worth_it_ugc_maker_generation_v2(uuid) from public, anon;

grant execute on function public.reserve_worth_it_ugc_maker_generation_v2(uuid) to authenticated;
grant execute on function public.refund_worth_it_ugc_maker_generation_v2(uuid) to authenticated;
grant execute on function public.settle_worth_it_ugc_maker_generation_v2(uuid) to authenticated;
