-- PR #194 follow-up: Premium Lite pricing/rewards and user-controlled history visibility.
-- The ledger remains intact for auditing; hidden_at only removes a row from the account's personal history.
begin;

alter table private.worth_it_calc_transactions
    add column if not exists hidden_at timestamptz;

create index if not exists worth_it_calc_transactions_visible_history_idx
    on private.worth_it_calc_transactions(user_id,created_at desc,id desc)
    where hidden_at is null;

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
    v_wip_reward integer := 0;
    v_wip_added integer := 0;
    v_stale_refund integer := 0;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    if v_owner then
        return jsonb_build_object(
            'ok', true, 'balance', null, 'balance_milli', null,
            'unlimited_balance', true, 'is_owner', true,
            'premium_plan', 'owner', 'premium_expires_at', null,
            'daily_reward', 0, 'reward_claimed_today', true,
            'wip_balance', null, 'wip_balance_milli', null,
            'daily_wip_reward', 0, 'wip_reward_claimed_today', true
        );
    end if;

    insert into private.worth_it_calc_wallets(user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    select * into v_wallet
    from private.worth_it_calc_wallets
    where user_id = v_user_id
    for update;

    -- Recover abandoned reservations after 30 minutes if a request was terminated
    -- before its explicit settle/refund callback could run.
    with stale as (
        update private.worth_it_calc_transactions
        set status = 'refunded'
        where user_id = v_user_id
          and status = 'reserved'
          and created_at < now() - interval '30 minutes'
        returning amount_milli
    )
    select coalesce(sum(greatest(0, -amount_milli)), 0)::integer
    into v_stale_refund
    from stale;

    if v_stale_refund > 0 then
        update private.worth_it_calc_wallets
        set balance_milli = balance_milli + v_stale_refund,
            updated_at = now()
        where user_id = v_user_id
        returning * into v_wallet;

        insert into private.worth_it_calc_transactions(
            user_id, kind, amount_milli, balance_after_milli,
            status, description, metadata
        ) values (
            v_user_id, 'refund', v_stale_refund, v_wallet.balance_milli,
            'completed', 'Automatic refund for an abandoned operation',
            jsonb_build_object('stale_after_minutes', 30)
        );
    end if;

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
            when 'premium_lite' then 1500
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

    -- WIP remains one point per UTC day for every signed-in subscription tier.
    if v_wallet.last_wip_reward_on is distinct from v_today then
        v_wip_reward := 1000;
        v_wip_added := v_wip_reward;

        update private.worth_it_calc_wallets
        set wip_balance_milli = wip_balance_milli + v_wip_added,
            last_wip_reward_on = v_today,
            updated_at = now()
        where user_id = v_user_id
        returning * into v_wallet;

        insert into private.worth_it_calc_transactions(
            user_id, kind, currency, amount_milli, balance_after_milli,
            status, description, metadata
        ) values (
            v_user_id, 'daily_reward', 'WIP', v_wip_added, v_wallet.wip_balance_milli,
            'completed', 'Daily WIP activity reward',
            jsonb_build_object('nominal_reward_milli', v_wip_reward, 'stacking', true)
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'balance', round(v_wallet.balance_milli::numeric / 1000, 3),
        'balance_milli', v_wallet.balance_milli,
        'wip_balance', round(v_wallet.wip_balance_milli::numeric / 1000, 3),
        'wip_balance_milli', v_wallet.wip_balance_milli,
        'unlimited_balance', false,
        'is_owner', false,
        'premium_plan', v_wallet.premium_plan,
        'premium_expires_at', v_wallet.premium_expires_at,
        'daily_reward', round(v_reward::numeric / 1000, 3),
        'daily_wip_reward', round(v_wip_reward::numeric / 1000, 3),
        'daily_cap', null,
        'reward_claimed_today', v_wallet.last_daily_reward_on = v_today,
        'wip_reward_claimed_today', v_wallet.last_wip_reward_on = v_today
    );
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
    v_cost integer := 50000;
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

    -- Claim today's WIP before checking eligibility so today's reward is available.
    perform public.calc_wallet_summary();

    insert into private.worth_it_calc_wallets(user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    select * into v_wallet
    from private.worth_it_calc_wallets
    where user_id = v_user_id
    for update;

    -- Do not allow WIP conversion to a Lite subscription while any subscription is active.
    if v_wallet.premium_plan in ('premium','premium_lite')
       and v_wallet.premium_expires_at > now() then
        return jsonb_build_object(
            'ok', false, 'code', 'ACTIVE_SUBSCRIPTION',
            'premium_plan', v_wallet.premium_plan,
            'premium_expires_at', v_wallet.premium_expires_at
        );
    end if;

    if v_wallet.wip_balance_milli < v_cost then
        return jsonb_build_object(
            'ok', false, 'code', 'INSUFFICIENT_WIP',
            'required', 50,
            'wip_balance', round(v_wallet.wip_balance_milli::numeric / 1000, 3),
            'wip_balance_milli', v_wallet.wip_balance_milli
        );
    end if;

    v_expiry := greatest(
        coalesce(v_wallet.premium_expires_at, now()),
        now()
    ) + interval '15 days';

    update private.worth_it_calc_wallets
    set wip_balance_milli = wip_balance_milli - v_cost,
        premium_plan = 'premium_lite',
        premium_expires_at = v_expiry,
        updated_at = now()
    where user_id = v_user_id
    returning * into v_wallet;

    insert into private.worth_it_calc_transactions(
        user_id, kind, currency, amount_milli, balance_after_milli, status,
        request_id, description, metadata
    ) values (
        v_user_id, 'premium_lite_purchase', 'WIP', -v_cost, v_wallet.wip_balance_milli,
        'completed', p_request_id, 'Premium Lite subscription (15 days)',
        jsonb_build_object('premium_expires_at', v_expiry)
    );

    return jsonb_build_object(
        'ok', true, 'premium_plan', v_wallet.premium_plan,
        'premium_expires_at', v_wallet.premium_expires_at,
        'balance', round(v_wallet.balance_milli::numeric / 1000, 3),
        'balance_milli', v_wallet.balance_milli,
        'wip_balance', round(v_wallet.wip_balance_milli::numeric / 1000, 3),
        'wip_balance_milli', v_wallet.wip_balance_milli
    );
end;
$$;

create or replace function public.calc_wallet_history(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
    v_result jsonb;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', t.id,
                'created_at', t.created_at,
                'kind', t.kind,
                'currency', t.currency,
                'amount', t.amount_milli::numeric / 1000,
                'balance_after', t.balance_after_milli::numeric / 1000,
                'status', t.status,
                'description', t.description
            )
            order by t.created_at desc, t.id desc
        ),
        '[]'::jsonb
    )
    into v_result
    from (
        select id, created_at, kind, currency, amount_milli,
               balance_after_milli, status, description
        from private.worth_it_calc_transactions
        where user_id = v_user_id
          and hidden_at is null
        order by created_at desc, id desc
        limit v_limit
    ) as t;

    return v_result;
end;
$$;

create or replace function public.calc_wallet_hide_transaction(p_transaction_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_hidden_id bigint;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_transaction_id is null or p_transaction_id <= 0 then
        raise exception 'A valid transaction ID is required.' using errcode = '22023';
    end if;

    update private.worth_it_calc_transactions
       set hidden_at = now()
     where id = p_transaction_id
       and user_id = v_user_id
       and hidden_at is null
    returning id into v_hidden_id;

    if v_hidden_id is null then
        return jsonb_build_object('ok',false,'code','TRANSACTION_NOT_FOUND');
    end if;
    return jsonb_build_object('ok',true,'hidden',true);
end;
$$;

revoke all on function public.calc_wallet_history(integer) from public,anon;
grant execute on function public.calc_wallet_history(integer) to authenticated;
revoke all on function public.calc_wallet_hide_transaction(bigint) from public,anon;
grant execute on function public.calc_wallet_hide_transaction(bigint) to authenticated;

commit;
