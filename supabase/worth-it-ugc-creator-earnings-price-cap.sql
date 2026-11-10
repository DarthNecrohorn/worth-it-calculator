-- Keep creator earnings inside the owner's supported UGC price range.
-- A valid charge is 0.10–0.50 CALC in 0.01 increments.
-- This is defense in depth; calculator pricing is also validated by the owner RPC
-- and by the worth_it_user_calculators table constraint.
begin;

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

    if not found
       or v_charged_milli not between 100 and 500
       or (v_charged_milli % 10) <> 0 then
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

commit;
