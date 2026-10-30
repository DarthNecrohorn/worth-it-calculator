-- CALC wallet, daily reward, reserve/settle/refund, subscription and access smoke tests.
\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"free@example.test"}',false);

do $$
declare
    v jsonb;
    v_request uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    v_refund uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
    v := public.calc_wallet_summary();
    if (v->>'balance')::numeric <> 1 then
        raise exception 'Free daily reward should be 1 CALC, got %', v->>'balance';
    end if;

    v := public.calc_wallet_summary();
    if (v->>'balance')::numeric <> 1 then
        raise exception 'Daily reward was not idempotent, got %', v->>'balance';
    end if;

    v := public.calc_wallet_reserve(v_request,'calculator');
    if v->>'ok' <> 'true' then raise exception 'Could not reserve calculator CALC: %', v; end if;

    v := public.calc_wallet_reserve(v_request,'calculator');
    if v->>'duplicate' <> 'true' then raise exception 'Request reservation was not idempotent: %', v; end if;

    v := public.calc_wallet_settle(v_request);
    if v->>'status' <> 'completed' then raise exception 'Calculator CALC charge did not settle: %', v; end if;

    v := public.calc_wallet_reserve(v_refund,'ai_chat');
    if v->>'ok' <> 'true' then raise exception 'Could not reserve AI CALC: %', v; end if;

    v := public.calc_wallet_refund(v_refund);
    if v->>'status' <> 'refunded' then raise exception 'Failed AI attempt was not refunded: %', v; end if;

    update private.worth_it_calc_wallets
       set balance_milli = 100000,
           last_daily_reward_on = (now() at time zone 'UTC')::date,
           premium_plan = 'free',
           premium_expires_at = null
     where user_id = auth.uid();

    v := public.calc_buy_premium_lite('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    if v->>'ok' <> 'true' or v->>'premium_plan' <> 'premium_lite'
       or (v->>'balance')::numeric <> 25 then
        raise exception 'Premium Lite should cost 75 CALC and activate 15 days: %', v;
    end if;

    v := public.calc_chat_media_limits();
    if v->>'tier' <> 'premium_lite'
       or (v->>'image_bytes')::integer <> 10485760
       or (v->>'gif_bytes')::integer <> 15728640
       or (v->>'video_bytes')::integer <> 31457280 then
        raise exception 'Premium Lite upload limits are incorrect: %', v;
    end if;

    if public.calc_profile_badge(101) <> 'premium_lite' then
        raise exception 'Premium Lite profile badge is not returned.';
    end if;

    update private.worth_it_calc_wallets
       set last_daily_reward_on = ((now() at time zone 'UTC')::date - 1)
     where user_id = auth.uid();
    v := public.calc_wallet_summary();
    if (v->>'daily_reward')::numeric <> 2 then
        raise exception 'Premium Lite daily reward should be 2 CALC: %', v;
    end if;

    begin
        perform public.calc_admin_overview();
        raise exception 'Regular users must not be able to read the Admin economy overview.';
    exception when insufficient_privilege then
        null;
    end;

    if has_table_privilege('authenticated','private.worth_it_calc_wallets','SELECT')
       or has_table_privilege('authenticated','private.worth_it_calc_wallets','UPDATE')
       or has_table_privilege('authenticated','private.worth_it_calc_transactions','SELECT') then
        raise exception 'Authenticated role must not access private CALC tables directly.';
    end if;
    if has_function_privilege('anon','public.calc_wallet_summary()','EXECUTE') then
        raise exception 'Anonymous users must not execute the CALC wallet summary.';
    end if;
    if not has_function_privilege('authenticated','public.calc_wallet_summary()','EXECUTE') then
        raise exception 'Authenticated users must be able to read their own CALC summary.';
    end if;
end
$$;

-- Full Premium reward, limits and owner access are tested with independent identities.
insert into auth.users(id,email) values
    ('33333333-3333-4333-8333-333333333333','premium@example.test')
on conflict(id) do update set email = excluded.email;
insert into public.worth_it_profiles(user_id,worth_it_id,username) values
    ('33333333-3333-4333-8333-333333333333',303,'premium_member')
on conflict(user_id) do update set worth_it_id = excluded.worth_it_id, username = excluded.username;
insert into private.worth_it_calc_wallets(user_id,balance_milli,premium_plan,premium_expires_at,last_daily_reward_on)
values ('33333333-3333-4333-8333-333333333333',1000,'premium',now()+interval '30 days',(now() at time zone 'UTC')::date - 1)
on conflict(user_id) do update set balance_milli=excluded.balance_milli,premium_plan='premium',premium_expires_at=excluded.premium_expires_at,last_daily_reward_on=excluded.last_daily_reward_on;

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","email":"premium@example.test"}',false);
do $$
declare v jsonb;
begin
    v := public.calc_wallet_summary();
    if (v->>'daily_reward')::numeric <> 3 then raise exception 'Premium daily reward should be 3 CALC: %',v; end if;
    v := public.calc_chat_media_limits();
    if v->>'tier' <> 'premium' or (v->>'image_bytes')::integer <> 26214400
       or (v->>'gif_bytes')::integer <> 36700160 or (v->>'video_bytes')::integer <> 52428800 then
       raise exception 'Premium upload limits are incorrect: %',v;
    end if;
    if public.calc_profile_badge(303) <> 'premium' then raise exception 'Premium badge is missing.'; end if;
end
$$;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"pedjasebez3545@gmail.com"}',false);
do $$
declare v jsonb;
begin
    v := public.calc_wallet_summary();
    if v->>'is_owner' <> 'true' or v->>'unlimited_balance' <> 'true' or v->>'premium_plan' <> 'owner' then
        raise exception 'Owner must have permanent unlimited Premium: %',v;
    end if;
    v := public.calc_chat_media_limits();
    if v->>'tier' <> 'owner' then raise exception 'Owner media limits should use Premium tier: %',v; end if;
    if public.calc_profile_badge(202) <> 'owner' then raise exception 'Owner badge is missing.'; end if;
    v := public.calc_admin_overview();
    if (v->>'wallet_count')::integer < 2 then raise exception 'Owner economy overview should include all wallets: %',v; end if;
    v := public.calc_buy_premium_lite('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    if v->>'is_owner' <> 'true' then raise exception 'Owner should not need to buy Premium Lite: %',v; end if;
end
$$;

select 'CALC economy smoke tests passed' as result;
