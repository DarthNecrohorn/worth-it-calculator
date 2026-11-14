begin;

-- Expose only the signed-in caller's transaction history. The function accepts
-- no user identifier, and the private ledger remains inaccessible directly.
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
        order by created_at desc, id desc
        limit v_limit
    ) as t;

    return v_result;
end;
$$;

revoke all on function public.calc_wallet_history(integer) from public, anon;
grant execute on function public.calc_wallet_history(integer) to authenticated;

commit;
