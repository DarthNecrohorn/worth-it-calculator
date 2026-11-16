-- PR #194: credit UGC calculator creators for successful, paid member uses.
-- Creators receive 50% of each paid use, with a 0.10 CALC minimum per use.
-- Historical completed paid UGC uses are backfilled exactly once.
begin;

alter table private.worth_it_calc_transactions
    drop constraint if exists worth_it_calc_transactions_kind_check;
alter table private.worth_it_calc_transactions
    add constraint worth_it_calc_transactions_kind_check
    check (kind in (
        'daily_reward',
        'calculator_spend',
        'ai_chat_spend',
        'premium_lite_purchase',
        'refund',
        'manual_adjustment',
        'calc_pack_purchase',
        'ugc_creator_earning'
    ));

create table if not exists private.worth_it_ugc_creator_earnings (
    source_transaction_id bigint primary key
        references private.worth_it_calc_transactions(id) on delete cascade,
    creator_user_id uuid not null
        references auth.users(id) on delete cascade,
    calculator_id uuid not null,
    charged_milli integer not null check (charged_milli > 0),
    earned_milli integer not null check (earned_milli >= 100 and earned_milli <= charged_milli),
    created_at timestamptz not null default now()
);
create index if not exists worth_it_ugc_creator_earnings_creator_idx
    on private.worth_it_ugc_creator_earnings(creator_user_id, created_at desc);
alter table private.worth_it_ugc_creator_earnings enable row level security;
revoke all on private.worth_it_ugc_creator_earnings from public, anon, authenticated, service_role;

-- Internal-only, idempotent transfer helper. The source ledger transaction is
-- the authority for who paid and how much was actually charged.
create or replace function private.worth_it_record_ugc_creator_earning(
    p_source_transaction_id bigint,
    p_calculator_id uuid
)
returns integer
language plpgsql
set search_path = pg_catalog, private
as $$
declare
    v_payer_user_id uuid;
    v_source_request_id uuid;
    v_creator_user_id uuid;
    v_charged_milli integer;
    v_earned_milli integer;
    v_new_balance_milli integer;
    v_recorded_milli integer;
begin
    if p_source_transaction_id is null or p_calculator_id is null then
        return 0;
    end if;

    select t.user_id, t.request_id, greatest(0, -t.amount_milli)
      into v_payer_user_id, v_source_request_id, v_charged_milli
      from private.worth_it_calc_transactions t
     where t.id = p_source_transaction_id
       and t.kind = 'calculator_spend'
       and t.status = 'completed'
       and t.currency = 'CALC'
       and t.amount_milli < 0;

    if not found or coalesce(v_charged_milli, 0) <= 0 then
        return 0;
    end if;

    select c.owner_user_id
      into v_creator_user_id
      from private.worth_it_user_calculators c
     where c.id = p_calculator_id;

    if not found or v_creator_user_id is null or v_creator_user_id = v_payer_user_id then
        return 0;
    end if;

    -- Prices are recorded in milli-CALC. The creator receives half of a paid
    -- use, but never less than 100 milli-CALC (0.10 CALC) for a valid use.
    v_earned_milli := greatest(100, v_charged_milli / 2);

    insert into private.worth_it_ugc_creator_earnings(
        source_transaction_id, creator_user_id, calculator_id,
        charged_milli, earned_milli
    ) values (
        p_source_transaction_id, v_creator_user_id, p_calculator_id,
        v_charged_milli, v_earned_milli
    )
    on conflict (source_transaction_id) do nothing
    returning earned_milli into v_recorded_milli;

    if not found then
        return 0;
    end if;

    insert into private.worth_it_calc_wallets as wallet(user_id, balance_milli)
    values (v_creator_user_id, v_earned_milli)
    on conflict (user_id) do update
       set balance_milli = wallet.balance_milli + excluded.balance_milli,
           updated_at = now()
    returning balance_milli into v_new_balance_milli;

    insert into private.worth_it_calc_transactions(
        user_id, kind, currency, amount_milli, balance_after_milli,
        status, request_id, description, metadata
    ) values (
        v_creator_user_id,
        'ugc_creator_earning',
        'CALC',
        v_earned_milli,
        v_new_balance_milli,
        'completed',
        null,
        'Earnings from a community calculator',
        jsonb_build_object(
            'source_transaction_id', p_source_transaction_id,
            'source_request_id', v_source_request_id,
            'ugc_calculator_id', p_calculator_id,
            'charged_milli', v_charged_milli,
            'creator_share_percent', 50,
            'minimum_earning_applied', v_earned_milli > (v_charged_milli / 2)
        )
    );

    return v_earned_milli;
end;
$$;
revoke all on function private.worth_it_record_ugc_creator_earning(bigint, uuid)
    from public, anon, authenticated, service_role;

-- Recover earnings for earlier completed UGC payments that were not credited
-- before this correction. The unique source_transaction_id makes retries safe.
do $backfill_ugc_creator_earnings$
declare
    v_source record;
begin
    for v_source in
        select t.id as source_transaction_id, c.id as calculator_id
          from private.worth_it_calc_transactions t
          join private.worth_it_user_calculators c
            on c.id::text = t.metadata ->> 'ugc_calculator_id'
         where t.kind = 'calculator_spend'
           and t.status = 'completed'
           and t.currency = 'CALC'
           and t.amount_milli < 0
           and nullif(t.metadata ->> 'ugc_calculator_id', '') is not null
           and c.owner_user_id <> t.user_id
         order by t.id
    loop
        perform private.worth_it_record_ugc_creator_earning(
            v_source.source_transaction_id,
            v_source.calculator_id
        );
    end loop;
end;
$backfill_ugc_creator_earnings$;

-- A successful UGC use and the creator credit are committed atomically.
-- Repeated settlement calls cannot pay twice because only a reserved spend
-- transitions through this block, and the earning helper is independently
-- idempotent by source transaction ID.
create or replace function public.calc_wallet_settle(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_tx private.worth_it_calc_transactions%rowtype;
    v_calculator_id uuid;
    v_creator_user_id uuid;
    v_creator_earning_milli integer := 0;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    update private.worth_it_calc_transactions
       set status = 'completed'
     where user_id = v_user_id
       and request_id = p_request_id
       and status = 'reserved'
    returning * into v_tx;

    if not found then
        select * into v_tx
          from private.worth_it_calc_transactions
         where user_id = v_user_id
           and request_id = p_request_id;

        if not found then
            return jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND');
        end if;
        return jsonb_build_object('ok', v_tx.status = 'completed', 'status', v_tx.status);
    end if;

    if v_tx.kind = 'calculator_spend'
       and nullif(v_tx.metadata ->> 'ugc_calculator_id', '') is not null then
        v_calculator_id := (v_tx.metadata ->> 'ugc_calculator_id')::uuid;

        select c.owner_user_id
          into v_creator_user_id
          from private.worth_it_user_calculators c
         where c.id = v_calculator_id;

        if found and v_creator_user_id <> v_user_id then
            -- Preserve the successful-use marker for the owner-controlled
            -- Like/Dislike eligibility policy.
            insert into private.worth_it_calculator_uses(calculator_id, user_id)
            select c.id, v_user_id
              from private.worth_it_user_calculators c
             where c.id = v_calculator_id
               and c.status = 'published'
               and c.visibility = 'public'
               and c.owner_user_id <> v_user_id
            on conflict (calculator_id, user_id) do nothing;

            -- Zero-cost/exempt uses and self-uses do not generate earnings.
            v_creator_earning_milli :=
                private.worth_it_record_ugc_creator_earning(v_tx.id, v_calculator_id);
        end if;
    end if;

    return jsonb_build_object(
        'ok', true,
        'status', 'completed',
        'balance_milli', v_tx.balance_after_milli,
        'creator_earning_milli', v_creator_earning_milli
    );
end;
$$;

revoke all on function public.calc_wallet_settle(uuid) from public, anon;
grant execute on function public.calc_wallet_settle(uuid) to authenticated;

commit;
