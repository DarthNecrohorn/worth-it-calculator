-- PR #194: owner-editable UGC calculation prices (0.10–0.50 CALC).
-- The selected price is stored server-side and cannot be overridden by the browser.

alter table private.worth_it_user_calculators
    add column if not exists usage_price_milli integer not null default 100;

do $$
begin
    if not exists (
        select 1
          from pg_constraint
         where conname = 'worth_it_user_calculators_usage_price_milli_check'
           and conrelid = 'private.worth_it_user_calculators'::regclass
    ) then
        alter table private.worth_it_user_calculators
            add constraint worth_it_user_calculators_usage_price_milli_check
            check (usage_price_milli between 100 and 500 and usage_price_milli % 10 = 0);
    end if;
end;
$$;

create or replace function public.set_worth_it_ugc_usage_price(
    p_id uuid,
    p_price_milli integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_price_milli is null or p_price_milli < 100 or p_price_milli > 500 or p_price_milli % 10 <> 0 then
        raise exception 'Choose a usage price from 0.10 to 0.50 CALC in 0.01 increments.'
            using errcode = '22023';
    end if;
    if not exists (
        select 1 from auth.users
         where id = v_user_id and email_confirmed_at is not null
    ) then
        raise exception 'Verify your email before changing calculator pricing.'
            using errcode = '42501';
    end if;

    update private.worth_it_user_calculators
       set usage_price_milli = p_price_milli,
           updated_at = now()
     where id = p_id
       and owner_user_id = v_user_id;

    if not found then
        raise exception 'Calculator not found or not owned by you.'
            using errcode = '42501';
    end if;

    return jsonb_build_object(
        'success', true,
        'id', p_id,
        'usage_price_milli', p_price_milli
    );
end;
$$;

revoke all on function public.set_worth_it_ugc_usage_price(uuid, integer) from public, anon;
grant execute on function public.set_worth_it_ugc_usage_price(uuid, integer) to authenticated;

create or replace function public.get_worth_it_ugc_calculator(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_result jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;

    select jsonb_build_object(
        'id', c.id,
        'calculator_number', c.calculator_number,
        'title', c.title,
        'description', c.description,
        'category', c.category,
        'subcategories', c.subcategories,
        'visibility', c.visibility,
        'spec', c.spec,
        'usage_price_milli', c.usage_price_milli,
        'status', c.status,
        'is_owner', (c.owner_user_id = v_user_id),
        'owner_worth_it_id', p.worth_it_id,
        'owner_username', p.username,
        'owner_display_name', p.display_name,
        'owner_avatar_url', p.avatar_url,
        'created_at', c.created_at,
        'published_at', c.published_at,
        'views', (select count(*) from private.worth_it_calculator_views v where v.calculator_id = c.id),
        'likes', (select count(*) from private.worth_it_calculator_reactions r where r.calculator_id = c.id and r.reaction = 'like'),
        'dislikes', (select count(*) from private.worth_it_calculator_reactions r where r.calculator_id = c.id and r.reaction = 'dislike'),
        'favorites', (select count(*) from public.worth_it_calculator_favorites f where f.calculator_key = 'ugc:' || c.id::text),
        'is_favorite', exists (
            select 1 from public.worth_it_calculator_favorites f
             where f.user_id = v_user_id and f.calculator_key = 'ugc:' || c.id::text
        ),
        'my_reaction', (
            select r.reaction from private.worth_it_calculator_reactions r
             where r.calculator_id = c.id and r.user_id = v_user_id
        )
    )
      into v_result
      from private.worth_it_user_calculators c
      join public.worth_it_profiles p on p.user_id = c.owner_user_id
     where c.id = p_id
       and (c.owner_user_id = v_user_id or (c.status = 'published' and c.visibility = 'public'));

    if v_result is null then
        raise exception 'Calculator not found.' using errcode = 'P0002';
    end if;
    return v_result;
end;
$$;

-- Keep legacy two-argument callers working through the new NULL default.
drop function if exists public.calc_wallet_reserve(uuid, text);

create function public.calc_wallet_reserve(
    p_request_id uuid,
    p_reason text,
    p_calculator_id uuid default null
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
    if p_reason is null or p_reason not in ('calculator','ai_chat') then
        raise exception 'Unsupported CALC spend reason';
    end if;
    if p_calculator_id is not null and p_reason <> 'calculator' then
        raise exception 'A calculator ID can only be supplied for a calculator charge.';
    end if;

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

    if p_calculator_id is not null then
        select c.usage_price_milli
          into v_amount
          from private.worth_it_user_calculators c
         where c.id = p_calculator_id
           and (c.owner_user_id = v_user_id or (c.status = 'published' and c.visibility = 'public'));
        if not found then
            raise exception 'Calculator not found or not available to this account.' using errcode = '42501';
        end if;
    end if;

    -- Claim today's reward exactly once before the first spend of the day.
    if not v_owner then
        perform public.calc_wallet_summary();

        -- Recheck the idempotency key after the wallet lock is held.
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
            'required', round(v_amount::numeric / 1000, 3),
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
        v_user_id, v_kind,
        case when v_owner then 0 else -v_amount end,
        v_wallet.balance_milli,
        'reserved', p_request_id,
        case when p_reason = 'calculator'
             then 'Community calculator use'
             else 'Successful AI reply reservation' end,
        jsonb_build_object(
            'reason', p_reason,
            'owner_exempt', v_owner,
            'ugc_calculator_id', p_calculator_id,
            'usage_price_milli', v_amount
        )
    );

    return jsonb_build_object(
        'ok', true,
        'reserved', true,
        'unlimited_balance', v_owner,
        'usage_price_milli', v_amount,
        'balance_milli', case when v_owner then null else v_wallet.balance_milli end
    );
end;
$$;

revoke all on function public.calc_wallet_reserve(uuid, text, uuid) from public, anon;
grant execute on function public.calc_wallet_reserve(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
