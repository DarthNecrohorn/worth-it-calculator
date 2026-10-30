-- CALC Economy: server-authoritative wallets, immutable transaction history and subscriptions.
-- Apply only after reviewing this migration and the dedicated PostgreSQL smoke tests.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create table if not exists private.worth_it_calc_wallets (
    user_id uuid primary key references auth.users(id) on delete cascade,
    balance_milli integer not null default 0 check (balance_milli >= 0),
    premium_plan text not null default 'free'
        check (premium_plan in ('free','premium_lite','premium')),
    premium_expires_at timestamptz,
    last_daily_reward_on date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists private.worth_it_calc_transactions (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null check (kind in (
        'daily_reward','calculator_spend','ai_chat_spend',
        'premium_lite_purchase','refund','manual_adjustment','calc_pack_purchase'
    )),
    amount_milli integer not null,
    balance_after_milli integer not null check (balance_after_milli >= 0),
    status text not null default 'completed'
        check (status in ('reserved','completed','refunded','failed')),
    request_id uuid,
    description text not null default '',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create unique index if not exists worth_it_calc_transactions_request_uidx
    on private.worth_it_calc_transactions(user_id, request_id)
    where request_id is not null;
create index if not exists worth_it_calc_transactions_user_created_idx
    on private.worth_it_calc_transactions(user_id, created_at desc);
create index if not exists worth_it_calc_wallets_premium_idx
    on private.worth_it_calc_wallets(premium_plan, premium_expires_at);

alter table private.worth_it_calc_wallets enable row level security;
alter table private.worth_it_calc_transactions enable row level security;
revoke all on private.worth_it_calc_wallets from public, anon, authenticated;
revoke all on private.worth_it_calc_transactions from public, anon, authenticated;
grant all on private.worth_it_calc_wallets to postgres, service_role;
grant all on private.worth_it_calc_transactions to postgres, service_role;
grant usage, select on sequence private.worth_it_calc_transactions_id_seq to postgres, service_role;

create or replace function public.calc_wallet_summary()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_owner boolean := lower(coalesce(auth.jwt() ->> 'email', '')) = 'pedjasebez3545@gmail.com';
    v_wallet private.worth_it_calc_wallets%rowtype;
    v_today date := (now() at time zone 'UTC')::date;
    v_reward integer := 0;
    v_added integer := 0;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    if v_owner then
        return jsonb_build_object(
            'ok', true, 'balance', null, 'balance_milli', null,
            'unlimited_balance', true, 'is_owner', true,
            'premium_plan', 'owner', 'premium_expires_at', null,
            'daily_reward', 0, 'reward_claimed_today', true
        );
    end if;

    insert into private.worth_it_calc_wallets(user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    select * into v_wallet
    from private.worth_it_calc_wallets
    where user_id = v_user_id
    for update;

    if v_wallet.premium_plan <> 'free'
       and (v_wallet.premium_expires_at is null or v_wallet.premium_expires_at <= now()) then
        update private.worth_it_calc_wallets
        set premium_plan = 'free',
            premium_expires_at = null,
            updated_at = now()
        where user_id = v_user_id
        returning * into v_wallet;
    end if;

    if v_wallet.last_daily_reward_on is distinct from v_today then
        v_reward := case v_wallet.premium_plan
            when 'premium_lite' then 2000
            when 'premium' then 3000
            else 1000
        end;
        v_added := v_reward;

        update private.worth_it_calc_wallets
        set balance_milli = balance_milli + v_added,
            last_daily_reward_on = v_today,
            updated_at = now()
        where user_id = v_user_id
        returning * into v_wallet;

        if v_added > 0 then
            insert into private.worth_it_calc_transactions(
                user_id, kind, amount_milli, balance_after_milli,
                status, description, metadata
            ) values (
                v_user_id, 'daily_reward', v_added, v_wallet.balance_milli,
                'completed', 'Daily CALC reward',
                jsonb_build_object('nominal_reward_milli', v_reward, 'stacking', true)
            );
        end if;
    end if;

    return jsonb_build_object(
        'ok', true,
        'balance', round(v_wallet.balance_milli::numeric / 1000, 3),
        'balance_milli', v_wallet.balance_milli,
        'unlimited_balance', false,
        'is_owner', false,
        'premium_plan', v_wallet.premium_plan,
        'premium_expires_at', v_wallet.premium_expires_at,
        'daily_reward', round(v_reward::numeric / 1000, 3),
        'daily_cap', null,
        'reward_claimed_today', v_wallet.last_daily_reward_on = v_today
    );
end;
$$;

create or replace function public.calc_wallet_reserve(
    p_request_id uuid,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_wallet private.worth_it_calc_wallets%rowtype;
    v_existing private.worth_it_calc_transactions%rowtype;
    v_amount integer := 100;
    v_kind text;
    v_owner boolean := lower(coalesce(auth.jwt() ->> 'email', '')) = 'pedjasebez3545@gmail.com';
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;
    if p_request_id is null then raise exception 'Request ID is required'; end if;
    if p_reason is null or p_reason not in ('calculator','ai_chat') then raise exception 'Unsupported CALC spend reason'; end if;
    v_kind := case p_reason when 'calculator' then 'calculator_spend' else 'ai_chat_spend' end;

    select * into v_existing
    from private.worth_it_calc_transactions
    where user_id = v_user_id and request_id = p_request_id;

    if found then
        return jsonb_build_object(
            'ok', v_existing.status in ('reserved','completed'),
            'duplicate', true,
            'status', v_existing.status,
            'balance_milli', v_existing.balance_after_milli
        );
    end if;

    -- Claim today's reward exactly once before the first spend of the day.
    if not v_owner then
        perform public.calc_wallet_summary();
    end if;

    insert into private.worth_it_calc_wallets(user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    select * into v_wallet
    from private.worth_it_calc_wallets
    where user_id = v_user_id
    for update;

    if not v_owner and v_wallet.premium_plan <> 'free'
       and (v_wallet.premium_expires_at is null or v_wallet.premium_expires_at <= now()) then
        update private.worth_it_calc_wallets
        set premium_plan = 'free', premium_expires_at = null, updated_at = now()
        where user_id = v_user_id
        returning * into v_wallet;
    end if;

    if not v_owner and v_wallet.balance_milli < v_amount then
        return jsonb_build_object(
            'ok', false,
            'code', 'INSUFFICIENT_CALC',
            'required', 0.1,
            'balance', round(v_wallet.balance_milli::numeric / 1000, 3),
            'balance_milli', v_wallet.balance_milli
        );
    end if;

    if not v_owner then
        update private.worth_it_calc_wallets
        set balance_milli = balance_milli - v_amount, updated_at = now()
        where user_id = v_user_id
        returning * into v_wallet;
    end if;

    insert into private.worth_it_calc_transactions(
        user_id, kind, amount_milli, balance_after_milli, status,
        request_id, description, metadata
    ) values (
        v_user_id, v_kind, case when v_owner then 0 else -v_amount end,
        case when v_owner then v_wallet.balance_milli else v_wallet.balance_milli end,
        'reserved', p_request_id,
        case p_reason when 'calculator' then 'Calculator use' else 'Successful AI reply reservation' end,
        jsonb_build_object('reason', p_reason, 'owner_exempt', v_owner)
    );

    return jsonb_build_object(
        'ok', true,
        'reserved', true,
        'unlimited_balance', v_owner,
        'balance_milli', case when v_owner then null else v_wallet.balance_milli end
    );
end;
$$;

create or replace function public.calc_wallet_settle(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_tx private.worth_it_calc_transactions%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
    update private.worth_it_calc_transactions
    set status = 'completed'
    where user_id = v_user_id and request_id = p_request_id and status = 'reserved'
    returning * into v_tx;

    if not found then
        select * into v_tx from private.worth_it_calc_transactions
        where user_id = v_user_id and request_id = p_request_id;
        if not found then return jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); end if;
        return jsonb_build_object('ok', v_tx.status = 'completed', 'status', v_tx.status);
    end if;
    return jsonb_build_object('ok', true, 'status', 'completed', 'balance_milli', v_tx.balance_after_milli);
end;
$$;

create or replace function public.calc_wallet_refund(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_tx private.worth_it_calc_transactions%rowtype;
    v_wallet private.worth_it_calc_wallets%rowtype;
    v_refund integer;
begin
    if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;

    select * into v_tx
    from private.worth_it_calc_transactions
    where user_id = v_user_id and request_id = p_request_id
    for update;

    if not found then return jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); end if;
    if v_tx.status = 'refunded' then return jsonb_build_object('ok', true, 'duplicate', true, 'status', 'refunded'); end if;
    if v_tx.status <> 'reserved' then return jsonb_build_object('ok', false, 'code', 'RESERVATION_ALREADY_SETTLED'); end if;

    update private.worth_it_calc_transactions
    set status = 'refunded'
    where id = v_tx.id;

    v_refund := greatest(0, -v_tx.amount_milli);
    if v_refund > 0 then
        update private.worth_it_calc_wallets
        set balance_milli = balance_milli + v_refund, updated_at = now()
        where user_id = v_user_id
        returning * into v_wallet;

        insert into private.worth_it_calc_transactions(
            user_id, kind, amount_milli, balance_after_milli, status,
            description, metadata
        ) values (
            v_user_id, 'refund', v_refund, v_wallet.balance_milli, 'completed',
            'Refund for an unsuccessful operation',
            jsonb_build_object('original_transaction_id', v_tx.id, 'original_request_id', p_request_id)
        );
    end if;

    return jsonb_build_object('ok', true, 'status', 'refunded', 'balance_milli', v_wallet.balance_milli);
end;
$$;

create or replace function public.calc_buy_premium_lite(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_wallet private.worth_it_calc_wallets%rowtype;
    v_existing private.worth_it_calc_transactions%rowtype;
    v_cost integer := 75000;
    v_expiry timestamptz;
begin
    if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
    if p_request_id is null then raise exception 'Request ID is required'; end if;
    if v_email = 'pedjasebez3545@gmail.com' then
        return jsonb_build_object('ok', true, 'is_owner', true, 'premium_plan', 'owner', 'unlimited_balance', true);
    end if;

    select * into v_existing from private.worth_it_calc_transactions
    where user_id = v_user_id and request_id = p_request_id;
    if found then
        return jsonb_build_object('ok', v_existing.status = 'completed', 'duplicate', true, 'status', v_existing.status);
    end if;

    insert into private.worth_it_calc_wallets(user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    select * into v_wallet
    from private.worth_it_calc_wallets
    where user_id = v_user_id
    for update;

    if v_wallet.premium_plan = 'premium'
       and v_wallet.premium_expires_at > now() then
        return jsonb_build_object('ok', false, 'code', 'ALREADY_PREMIUM');
    end if;
    if v_wallet.balance_milli < v_cost then
        return jsonb_build_object(
            'ok', false, 'code', 'INSUFFICIENT_CALC',
            'required', 75,
            'balance', round(v_wallet.balance_milli::numeric / 1000, 3)
        );
    end if;

    v_expiry := greatest(
        coalesce(v_wallet.premium_expires_at, now()),
        now()
    ) + interval '15 days';

    update private.worth_it_calc_wallets
    set balance_milli = balance_milli - v_cost,
        premium_plan = 'premium_lite',
        premium_expires_at = v_expiry,
        updated_at = now()
    where user_id = v_user_id
    returning * into v_wallet;

    insert into private.worth_it_calc_transactions(
        user_id, kind, amount_milli, balance_after_milli, status,
        request_id, description, metadata
    ) values (
        v_user_id, 'premium_lite_purchase', -v_cost, v_wallet.balance_milli,
        'completed', p_request_id, 'Premium Lite subscription (15 days)',
        jsonb_build_object('premium_expires_at', v_expiry)
    );

    return jsonb_build_object(
        'ok', true, 'premium_plan', v_wallet.premium_plan,
        'premium_expires_at', v_wallet.premium_expires_at,
        'balance', round(v_wallet.balance_milli::numeric / 1000, 3),
        'balance_milli', v_wallet.balance_milli
    );
end;
$$;

create or replace function public.calc_chat_media_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
    v_wallet private.worth_it_calc_wallets%rowtype;
    v_plan text := 'free';
begin
    if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
    if v_email = 'pedjasebez3545@gmail.com' then v_plan := 'owner';
    else
        select * into v_wallet from private.worth_it_calc_wallets where user_id = v_user_id;
        if found and v_wallet.premium_plan <> 'free' and v_wallet.premium_expires_at > now() then
            v_plan := v_wallet.premium_plan;
        end if;
    end if;

    return case v_plan
        when 'premium' then jsonb_build_object('tier','premium','image_bytes',26214400,'gif_bytes',36700160,'video_bytes',52428800)
        when 'owner' then jsonb_build_object('tier','owner','image_bytes',26214400,'gif_bytes',36700160,'video_bytes',52428800)
        when 'premium_lite' then jsonb_build_object('tier','premium_lite','image_bytes',10485760,'gif_bytes',15728640,'video_bytes',31457280)
        else jsonb_build_object('tier','free','image_bytes',5242880,'gif_bytes',8388608,'video_bytes',15728640)
    end;
end;
$$;

create or replace function public.calc_profile_badge(p_worth_it_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_badge text;
begin
    select case
        when lower(coalesce(u.email,'')) = 'pedjasebez3545@gmail.com' then 'owner'
        when w.premium_plan = 'premium'
             and w.premium_expires_at > now() then 'premium'
        when w.premium_plan = 'premium_lite'
             and w.premium_expires_at > now() then 'premium_lite'
        else null
    end
    into v_badge
    from public.worth_it_profiles p
    join auth.users u on u.id = p.user_id
    left join private.worth_it_calc_wallets w on w.user_id = p.user_id
    where p.worth_it_id = p_worth_it_id;

    return v_badge;
end;
$$;

create or replace function public.calc_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
    v_result jsonb;
begin
    if auth.uid() is null or v_email <> 'pedjasebez3545@gmail.com' then
        raise exception 'Administrator authorization required' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'wallet_count', (select count(*) from private.worth_it_calc_wallets),
        'active_premium_lite', (
            select count(*) from private.worth_it_calc_wallets
            where premium_plan='premium_lite' and premium_expires_at > now()
        ),
        'active_premium', (
            select count(*) from private.worth_it_calc_wallets
            where premium_plan='premium' and premium_expires_at > now()
        ),
        'calc_balance_total', (
            select coalesce(sum(balance_milli),0)::numeric / 1000
            from private.worth_it_calc_wallets
        ),
        'transactions', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', t.id, 'created_at', t.created_at, 'kind', t.kind,
                'amount', t.amount_milli::numeric / 1000,
                'balance_after', t.balance_after_milli::numeric / 1000,
                'status', t.status, 'description', t.description,
                'username', p.username, 'email', u.email
            ) order by t.created_at desc)
            from (
                select * from private.worth_it_calc_transactions
                order by created_at desc limit 100
            ) t
            left join auth.users u on u.id = t.user_id
            left join public.worth_it_profiles p on p.user_id = t.user_id
        ), '[]'::jsonb)
    ) into v_result;

    return v_result;
end;
$$;

revoke all on function public.calc_wallet_summary() from public, anon;
revoke all on function public.calc_wallet_reserve(uuid,text) from public, anon;
revoke all on function public.calc_wallet_settle(uuid) from public, anon;
revoke all on function public.calc_wallet_refund(uuid) from public, anon;
revoke all on function public.calc_buy_premium_lite(uuid) from public, anon;
revoke all on function public.calc_chat_media_limits() from public, anon;
revoke all on function public.calc_profile_badge(bigint) from public, anon;
revoke all on function public.calc_admin_overview() from public, anon;

grant execute on function public.calc_wallet_summary() to authenticated;
grant execute on function public.calc_wallet_reserve(uuid,text) to authenticated;
grant execute on function public.calc_wallet_settle(uuid) to authenticated;
grant execute on function public.calc_wallet_refund(uuid) to authenticated;
grant execute on function public.calc_buy_premium_lite(uuid) to authenticated;
grant execute on function public.calc_chat_media_limits() to authenticated;
grant execute on function public.calc_profile_badge(bigint) to authenticated;
grant execute on function public.calc_admin_overview() to authenticated;

commit;
