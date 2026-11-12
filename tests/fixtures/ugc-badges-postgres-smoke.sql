-- Smoke tests for account ownership, publication, discovery, favorites and badges.
\set ON_ERROR_STOP on
begin;

-- Backfill must credit historical completed paid uses exactly once:
-- two uses at 0.30 CALC each produce 0.30 CALC for the calculator creator.
do $creator_earnings_backfill$
declare
    v_balance integer;
    v_earned integer;
    v_records integer;
begin
    select balance_milli into v_balance
      from private.worth_it_calc_wallets
     where user_id='77777777-7777-4777-8777-777777777771';
    select coalesce(sum(e.earned_milli),0),count(*)::integer
      into v_earned,v_records
      from private.worth_it_ugc_creator_earnings e
      join private.worth_it_calc_transactions t
        on t.id=e.source_transaction_id
     where t.request_id in (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
     );
    if v_balance<>300 or v_earned<>300 or v_records<>2 then
        raise exception 'Historical 0.60 CALC spend should backfill exactly 0.30 CALC to the creator: balance %, earned %, records %.',
            v_balance,v_earned,v_records;
    end if;
end
$creator_earnings_backfill$;

-- Keep the public ID contract deterministic across repeated disposable smoke runs.
select setval('private.worth_it_user_calculator_number_seq'::regclass,51,false);

-- The migration must retain one earliest record for this account/calculator pair.
do $legacy_views$
declare
    v_count integer;
    v_first_view timestamptz;
begin
    select count(*)::integer,min(created_at)
      into v_count,v_first_view
      from private.worth_it_calculator_views
     where calculator_id='99999999-9999-4999-8999-999999999999'::uuid
       and viewer_user_id='88888888-8888-4888-8888-888888888888'::uuid;
    if v_count<>1 then
        raise exception 'Legacy daily views must be consolidated to one account-level row; found %.',v_count;
    end if;
    if v_first_view is distinct from timestamptz '2026-10-01 12:00:00+00' then
        raise exception 'The earliest historical view must be preserved, found %.',v_first_view;
    end if;
end
$legacy_views$;


insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','creator@example.test',now()),
 ('22222222-2222-4222-8222-222222222222','viewer@example.test',now()),
 ('33333333-3333-4333-8333-333333333333','premium@example.test',now()),
 ('44444444-4444-4444-8444-444444444444','lite@example.test',now()),
 ('55555555-5555-4555-8555-555555555555','pedjasebez3545@gmail.com',now()),
 ('66666666-6666-4666-8666-666666666666','unconfirmed@example.test',null),
 ('a7777777-7777-4777-8777-777777777777','ugc-billing-free@example.test',now()),
 ('a8888888-8888-4888-8888-888888888889','ugc-billing-lite@example.test',now()),
 ('a9999999-9999-4999-8999-999999999998','ugc-billing-premium@example.test',now());

insert into public.worth_it_profiles(user_id,worth_it_id,username,display_name,created_at) values
 ('11111111-1111-4111-8111-111111111111',101,'creator','Calculator Creator',now()-interval '13 months'),
 ('22222222-2222-4222-8222-222222222222',102,'viewer','Calculator Viewer',now()-interval '2 weeks'),
 ('33333333-3333-4333-8333-333333333333',103,'premium','Premium Member',now()-interval '1 month'),
 ('44444444-4444-4444-8444-444444444444',104,'lite','Premium Lite Member',now()-interval '3 months'),
 ('55555555-5555-4555-8555-555555555555',105,'owner','Worth It Owner',now()-interval '6 years'),
 ('66666666-6666-4666-8666-666666666666',106,'unconfirmed','Unconfirmed Member',now()-interval '1 month');

insert into public.worth_it_user_preferences(user_id,profile_visibility) values
 ('11111111-1111-4111-8111-111111111111','public'),
 ('22222222-2222-4222-8222-222222222222','public'),
 ('33333333-3333-4333-8333-333333333333','public'),
 ('44444444-4444-4444-8444-444444444444','public'),
 ('55555555-5555-4555-8555-555555555555','public');

insert into private.worth_it_calc_wallets(user_id,premium_plan,premium_expires_at,balance_milli) values
 ('33333333-3333-4333-8333-333333333333','premium',now()+interval '30 days',20000),
 ('44444444-4444-4444-8444-444444444444','premium_lite',now()+interval '30 days',20000),
 ('a7777777-7777-4777-8777-777777777777','free',null,10000),
 ('a8888888-8888-4888-8888-888888888889','premium_lite',now()+interval '30 days',3000),
 ('a9999999-9999-4999-8999-999999999998','premium',now()+interval '30 days',20000)
on conflict(user_id) do update set
 premium_plan=excluded.premium_plan,
 premium_expires_at=excluded.premium_expires_at,
 balance_milli=excluded.balance_milli;

-- AI Maker generations follow the same Free / Premium Lite / Premium daily
-- tiers as new calculator creation, with an additional shared 100/day cap.
do $maker_generation_tier_quotas$
declare
    v_request uuid;
    q jsonb;
    v_global_used integer;
    i integer;
    v_today date := (now() at time zone 'UTC')::date;
begin
    -- Free: one successful generation; second generation is blocked.
    perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
    q:=public.get_worth_it_ugc_maker_generation_quota();
    if q->>'plan'<>'free' or (q->>'daily_limit')::integer<>1 then
        raise exception 'Free AI generation quota must be one: %',q;
    end if;
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_maker_generation_v2(v_request);
    if (q->>'ok')::boolean is distinct from true or (q->>'daily_limit')::integer<>1 then
        raise exception 'Free account could not reserve its one generation: %',q;
    end if;
    perform public.settle_worth_it_ugc_maker_generation_v2(v_request);
    q:=public.reserve_worth_it_ugc_maker_generation_v2(gen_random_uuid());
    if q->>'code'<>'DAILY_LIMIT' then
        raise exception 'Free account generated more than one calculator in a UTC day: %',q;
    end if;

    -- Premium Lite: two successful generations. Refunds restore both counters.
    perform set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
    q:=public.get_worth_it_ugc_maker_generation_quota();
    if q->>'plan'<>'premium_lite' or (q->>'daily_limit')::integer<>2 then
        raise exception 'Premium Lite AI generation quota must be two: %',q;
    end if;
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_maker_generation_v2(v_request);
    if (q->>'ok')::boolean is distinct from true then
        raise exception 'Premium Lite first generation reservation failed: %',q;
    end if;
    q:=public.refund_worth_it_ugc_maker_generation_v2(v_request);
    if (q->>'refunded')::boolean is distinct from true then
        raise exception 'Failed Premium Lite generation did not refund its daily slots: %',q;
    end if;
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_maker_generation_v2(v_request);
    if (q->>'ok')::boolean is distinct from true then
        raise exception 'Premium Lite generation slot was not restored after a refund: %',q;
    end if;
    perform public.settle_worth_it_ugc_maker_generation_v2(v_request);
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_maker_generation_v2(v_request);
    if (q->>'ok')::boolean is distinct from true then
        raise exception 'Premium Lite second generation reservation failed: %',q;
    end if;
    perform public.settle_worth_it_ugc_maker_generation_v2(v_request);
    q:=public.reserve_worth_it_ugc_maker_generation_v2(gen_random_uuid());
    if q->>'code'<>'DAILY_LIMIT' then
        raise exception 'Premium Lite account generated more than two calculators in a UTC day: %',q;
    end if;

    -- Premium: three successful generations; fourth is blocked.
    perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
    q:=public.get_worth_it_ugc_maker_generation_quota();
    if q->>'plan'<>'premium' or (q->>'daily_limit')::integer<>3 then
        raise exception 'Premium AI generation quota must be three: %',q;
    end if;
    for i in 1..3 loop
        v_request:=gen_random_uuid();
        q:=public.reserve_worth_it_ugc_maker_generation_v2(v_request);
        if (q->>'ok')::boolean is distinct from true then
            raise exception 'Premium generation % reservation failed: %',i,q;
        end if;
        perform public.settle_worth_it_ugc_maker_generation_v2(v_request);
    end loop;
    q:=public.reserve_worth_it_ugc_maker_generation_v2(gen_random_uuid());
    if q->>'code'<>'DAILY_LIMIT' then
        raise exception 'Premium account generated more than three calculators in a UTC day: %',q;
    end if;

    select requests_used into v_global_used
      from private.worth_it_ugc_maker_global_daily_usage
     where usage_date=v_today;
    if v_global_used<>6 then
        raise exception 'Refunds and tier quotas should leave exactly six shared generations, got %.',v_global_used;
    end if;

    perform set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
    q:=public.get_worth_it_ugc_maker_generation_quota();
    if (q->>'requests_used')::integer<>2 or (q->>'remaining')::integer<>0
       or (q->>'global_requests_used')::integer<>6 or (q->>'global_remaining')::integer<>94 then
        raise exception 'AI Maker quota status must show per-tier and shared counts: %',q;
    end if;

    -- Simulate the shared ceiling and verify an otherwise eligible owner account
    -- cannot bypass it. The failed reservation must not remain counted.
    update private.worth_it_ugc_maker_global_daily_usage
       set requests_used=100,updated_at=now()
     where usage_date=v_today;
    perform set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_maker_generation_v2(v_request);
    if q->>'code'<>'GLOBAL_DAILY_LIMIT' or (q->>'global_daily_limit')::integer<>100 then
        raise exception 'The shared 100-generation daily limit was not enforced: %',q;
    end if;
    if exists(select 1 from private.worth_it_ugc_maker_generation_reservations where request_id=v_request) then
        raise exception 'A globally blocked AI generation left a reservation behind.';
    end if;

    -- Restore the actual simulated daily count so the remaining smoke tests
    -- can verify authenticated reservation/refund behavior independently.
    update private.worth_it_ugc_maker_global_daily_usage
       set requests_used=v_global_used,updated_at=now()
     where usage_date=v_today;
end
$maker_generation_tier_quotas$;


select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select (public.save_worth_it_ugc_calculator(
 null,'Monthly savings growth','Estimate savings with monthly deposits.','money',
 '{"inputs":[{"key":"starting_amount","label":"Starting savings","min":0,"max":1000000,"default":1000,"step":1,"unit":"EUR"},{"key":"monthly_deposit","label":"Monthly deposit","min":0,"max":100000,"default":300,"step":1,"unit":"EUR"},{"key":"years","label":"Years","min":1,"max":80,"default":5,"step":1,"unit":"years"}],"results":[{"label":"Total deposits","expression":"starting_amount + monthly_deposit * 12 * years","format":"currency","currency":"EUR"}]}'::jsonb
)->>'id') as calculator_id \gset

select set_config('test.ugc_id', :'calculator_id', false);
do $number_check$
declare v_number bigint;
begin
    select calculator_number into v_number
      from private.worth_it_user_calculators
     where id=current_setting('test.ugc_id')::uuid;
    if v_number<>51 then raise exception 'The first user calculator must receive public number 51, got %.',v_number; end if;
end
$number_check$;

insert into public.worth_it_follows(follower_user_id,followed_user_id)
values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111')
on conflict do nothing;

select (public.publish_worth_it_ugc_calculator(:'calculator_id'::uuid,'public')->>'status') as publish_status \gset

-- Free accounts receive one successful new calculator per UTC day.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $free_quota$
declare q jsonb; blocked boolean:=false;
begin
    -- Editing an existing calculator must not consume another daily creation.
    perform public.save_worth_it_ugc_calculator(
        current_setting('test.ugc_id')::uuid,
        'Monthly savings growth',
        'Updated description.',
        'money',
        '{"inputs":[{"key":"starting_amount","label":"Starting savings","min":0,"max":1000000,"default":1000,"step":1,"unit":"EUR"},{"key":"monthly_deposit","label":"Monthly deposit","min":0,"max":100000,"default":300,"step":1,"unit":"EUR"},{"key":"years","label":"Years","min":1,"max":80,"default":5,"step":1,"unit":"years"}],"results":[{"label":"Total deposits","expression":"starting_amount + monthly_deposit * 12 * years","format":"currency","currency":"EUR"}]}'::jsonb
    );
    q:=public.get_worth_it_ugc_creation_quota();
    if (q->>'daily_limit')::integer<>1 or (q->>'creations_used')::integer<>1 or (q->>'remaining')::integer<>0 then
        raise exception 'Free daily creation allowance is incorrect: %',q;
    end if;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Free second draft','A concise description for this calculator.','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when sqlstate '54000' then blocked:=true;
    end;
    if not blocked then raise exception 'Free account created more than one calculator in a UTC day.'; end if;
end
$free_quota$;

-- Upgrade the fixture creator to Premium, verify the next sequential ID, and then test the lifetime cap.
insert into private.worth_it_calc_wallets(user_id,premium_plan,premium_expires_at)
values ('11111111-1111-4111-8111-111111111111','premium',now()+interval '30 days')
on conflict(user_id) do update set premium_plan='premium',premium_expires_at=excluded.premium_expires_at;
select (public.save_worth_it_ugc_calculator(
 null,'Second savings calculator','A concise description for this calculator.','money',
 '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
)->>'calculator_number') as second_calculator_number \gset
select set_config('test.ugc_second_number', :'second_calculator_number', false);
do $number_check$
begin
    if current_setting('test.ugc_second_number')::bigint<>52 then raise exception 'Calculator numbers must be sequential from 51.'; end if;
end
$number_check$;
select set_config('test.ugc_calculator_id', :'calculator_id', false);
do $owner_check$
declare
    v_detail jsonb;
    v_mine jsonb;
    v_view jsonb;
begin
    v_detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_calculator_id')::uuid);
    if (v_detail->>'is_owner')::boolean is distinct from true then
        raise exception 'The calculator owner cannot open their own published calculator.';
    end if;
    if (v_detail->>'require_test_before_reaction')::boolean is distinct from true then
        raise exception 'The calculator owner must see the default-enabled rating setting.';
    end if;
    v_view:=public.record_worth_it_ugc_view(current_setting('test.ugc_calculator_id')::uuid);
    if (v_view->>'counted')::boolean is distinct from false then
        raise exception 'The calculator owner must not count as a view.';
    end if;
    v_mine:=public.get_worth_it_my_ugc_calculators('');
    if jsonb_array_length(v_mine)<>2 then
        raise exception 'The owner cannot list their saved calculator.';
    end if;
end
$owner_check$;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $viewer_check$
declare
    v_detail jsonb;
    v_catalog jsonb;
    v_reaction jsonb;
    v_view jsonb;
    v_views integer;
    v_settle jsonb;
    v_request_id uuid := gen_random_uuid();
    v_extra_request_one uuid := gen_random_uuid();
    v_extra_request_two uuid := gen_random_uuid();
    v_max_price_request uuid := gen_random_uuid();
    v_source_transaction_id bigint;
    v_creator_balance integer;
    v_creator_earned integer;
    v_creator_earning_records integer;
    v_price_policy jsonb;
    v_price_milli integer;
    v_price_limit_blocked boolean := false;
    v_use_count integer;
    v_blocked boolean := false;
begin
    v_detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_calculator_id')::uuid);
    if (v_detail->>'is_owner')::boolean is distinct from false then
        raise exception 'A different member was incorrectly treated as the calculator owner.';
    end if;
    v_catalog:=public.get_worth_it_ugc_catalog_page('latest','12y','','all',1);
    if jsonb_array_length(v_catalog->'items')<1 then
        raise exception 'Published UGC calculator is missing from the latest catalogue.';
    end if;

    if v_detail ? 'require_test_before_reaction' or v_detail ? 'has_used' then
        raise exception 'Non-owners must not receive the owner rating setting or usage marker.';
    end if;

    begin
        perform public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'like');
    exception when insufficient_privilege then
        v_blocked:=true;
    end;
    if not v_blocked then
        raise exception 'An untested member bypassed the default one-use-before-rating requirement.';
    end if;

    v_blocked:=false;
    begin
        perform public.set_worth_it_ugc_reaction_policy(current_setting('test.ugc_calculator_id')::uuid,false);
    exception when insufficient_privilege then
        v_blocked:=true;
    end;
    if not v_blocked then
        raise exception 'A non-owner changed the calculator rating policy.';
    end if;

    insert into private.worth_it_calc_transactions(
        user_id,kind,currency,amount_milli,balance_after_milli,status,
        request_id,description,metadata
    ) values (
        '22222222-2222-4222-8222-222222222222',
        'calculator_spend','CALC',-100,900,'reserved',v_request_id,
        'Community calculator use',
        jsonb_build_object('reason','calculator','ugc_calculator_id',current_setting('test.ugc_calculator_id'))
    );
    v_settle:=public.calc_wallet_settle(v_request_id);
    if (v_settle->>'ok')::boolean is distinct from true
       or v_settle->>'status' is distinct from 'completed' then
        raise exception 'A successful calculator reservation did not settle: %',v_settle;
    end if;

    -- The 0.10 CALC minimum applies to a 0.10 CALC use (not 0.05).
    select id into v_source_transaction_id
      from private.worth_it_calc_transactions
     where user_id='22222222-2222-4222-8222-222222222222'
       and request_id=v_request_id;
    select coalesce(sum(earned_milli),0),count(*)::integer
      into v_creator_earned,v_creator_earning_records
      from private.worth_it_ugc_creator_earnings
     where source_transaction_id=v_source_transaction_id;
    select balance_milli into v_creator_balance
      from private.worth_it_calc_wallets
     where user_id='11111111-1111-4111-8111-111111111111';
    if v_creator_earned<>100 or v_creator_earning_records<>1 or v_creator_balance<>100 then
        raise exception 'A 0.10 CALC use must credit exactly 0.10 once; earned %, records %, creator balance %.',
            v_creator_earned,v_creator_earning_records,v_creator_balance;
    end if;

    select count(*)::integer into v_use_count
      from private.worth_it_calculator_uses
     where calculator_id=current_setting('test.ugc_calculator_id')::uuid
       and user_id='22222222-2222-4222-8222-222222222222';
    if v_use_count<>1 then
        raise exception 'A completed calculator use was not recorded exactly once; found %.',v_use_count;
    end if;
    v_settle:=public.calc_wallet_settle(v_request_id);
    select count(*)::integer into v_use_count
      from private.worth_it_calculator_uses
     where calculator_id=current_setting('test.ugc_calculator_id')::uuid
       and user_id='22222222-2222-4222-8222-222222222222';
    if (v_settle->>'ok')::boolean is distinct from true or v_use_count<>1 then
        raise exception 'Retrying a settled calculation must not duplicate the use record.';
    end if;
    select balance_milli into v_creator_balance
      from private.worth_it_calc_wallets
     where user_id='11111111-1111-4111-8111-111111111111';
    select count(*)::integer into v_creator_earning_records
      from private.worth_it_ugc_creator_earnings
     where source_transaction_id=v_source_transaction_id;
    if v_creator_balance<>100 or v_creator_earning_records<>1 then
        raise exception 'Repeating settlement duplicated the creator payout.';
    end if;

    -- A 0.30 CALC price produces a 0.15 CALC creator share.
    insert into private.worth_it_calc_transactions(
        user_id,kind,currency,amount_milli,balance_after_milli,status,
        request_id,description,metadata
    ) values
    (
        '22222222-2222-4222-8222-222222222222','calculator_spend','CALC',-300,600,'reserved',
        v_extra_request_one,'Community calculator use at 0.30 CALC',
        jsonb_build_object('reason','calculator','ugc_calculator_id',current_setting('test.ugc_calculator_id'))
    ),
    (
        '22222222-2222-4222-8222-222222222222','calculator_spend','CALC',-300,300,'reserved',
        v_extra_request_two,'Community calculator use at 0.30 CALC',
        jsonb_build_object('reason','calculator','ugc_calculator_id',current_setting('test.ugc_calculator_id'))
    );
    perform public.calc_wallet_settle(v_extra_request_one);
    perform public.calc_wallet_settle(v_extra_request_two);
    select coalesce(sum(e.earned_milli),0),count(*)::integer
      into v_creator_earned,v_creator_earning_records
      from private.worth_it_ugc_creator_earnings e
      join private.worth_it_calc_transactions t
        on t.id=e.source_transaction_id
     where t.request_id in (v_extra_request_one,v_extra_request_two);
    select balance_milli into v_creator_balance
      from private.worth_it_calc_wallets
     where user_id='11111111-1111-4111-8111-111111111111';
    if v_creator_earned<>300 or v_creator_earning_records<>2 or v_creator_balance<>400 then
        raise exception 'Two 0.30 CALC uses must credit a total of 0.30 CALC once; earned %, records %, creator balance %.',
            v_creator_earned,v_creator_earning_records,v_creator_balance;
    end if;

    -- The owner may set the maximum supported price of 0.50 CALC.
    -- A 0.50 CALC completed use must then credit 0.25 CALC to the owner.
    perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
    v_price_policy:=public.set_worth_it_ugc_usage_price(
        current_setting('test.ugc_calculator_id')::uuid,500
    );
    if (v_price_policy->>'success')::boolean is distinct from true
       or (v_price_policy->>'usage_price_milli')::integer<>500 then
        raise exception 'The owner could not set the maximum usage price of 0.50 CALC: %',v_price_policy;
    end if;

    v_price_limit_blocked:=false;
    begin
        perform public.set_worth_it_ugc_usage_price(
            current_setting('test.ugc_calculator_id')::uuid,510
        );
    exception when invalid_parameter_value then
        v_price_limit_blocked:=true;
    end;
    if not v_price_limit_blocked then
        raise exception 'The owner usage-price RPC accepted a price above the 0.50 CALC maximum.';
    end if;
    select usage_price_milli into v_price_milli
      from private.worth_it_user_calculators
     where id=current_setting('test.ugc_calculator_id')::uuid;
    if v_price_milli<>500 then
        raise exception 'The maximum usage price must remain 0.50 CALC after rejecting 0.51.';
    end if;

    perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
    insert into private.worth_it_calc_transactions(
        user_id,kind,currency,amount_milli,balance_after_milli,status,
        request_id,description,metadata
    ) values (
        '22222222-2222-4222-8222-222222222222',
        'calculator_spend','CALC',-500,0,'reserved',v_max_price_request,
        'Community calculator use at the maximum 0.50 CALC price',
        jsonb_build_object('reason','calculator','ugc_calculator_id',current_setting('test.ugc_calculator_id'))
    );
    v_settle:=public.calc_wallet_settle(v_max_price_request);
    if (v_settle->>'creator_earning_milli')::integer is distinct from 250 then
        raise exception 'A 0.50 CALC maximum-price use must pay its creator exactly 0.25 CALC: %',v_settle;
    end if;
    select id into v_source_transaction_id
      from private.worth_it_calc_transactions
     where user_id='22222222-2222-4222-8222-222222222222'
       and request_id=v_max_price_request;
    select coalesce(sum(earned_milli),0),count(*)::integer
      into v_creator_earned,v_creator_earning_records
      from private.worth_it_ugc_creator_earnings
     where source_transaction_id=v_source_transaction_id;
    select balance_milli into v_creator_balance
      from private.worth_it_calc_wallets
     where user_id='11111111-1111-4111-8111-111111111111';
    if v_creator_earned<>250 or v_creator_earning_records<>1 or v_creator_balance<>650 then
        raise exception 'A maximum 0.50 CALC use must credit exactly 0.25 once; earned %, records %, creator balance %.',
            v_creator_earned,v_creator_earning_records,v_creator_balance;
    end if;
    perform public.calc_wallet_settle(v_max_price_request);
    select balance_milli into v_creator_balance
      from private.worth_it_calc_wallets
     where user_id='11111111-1111-4111-8111-111111111111';
    select count(*)::integer into v_creator_earning_records
      from private.worth_it_ugc_creator_earnings
     where source_transaction_id=v_source_transaction_id;
    if v_creator_balance<>650 or v_creator_earning_records<>1 then
        raise exception 'Retrying the maximum-price settlement must not duplicate its 0.25 CALC reward.';
    end if;

    v_detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_calculator_id')::uuid);
    if v_detail ? 'has_used' or v_detail ? 'require_test_before_reaction' then
        raise exception 'Use records and owner policy must remain private to the member/owner.';
    end if;

    v_reaction:=public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'like');
    if v_reaction->>'reaction' is distinct from 'like' then
        raise exception 'The like reaction was not stored.';
    end if;
    v_reaction:=public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'dislike');
    if v_reaction->>'reaction' is distinct from 'dislike' then
        raise exception 'Switching from like to dislike did not update the existing reaction.';
    end if;
    v_detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_calculator_id')::uuid);
    if (v_detail->>'likes')::integer<>0 or (v_detail->>'dislikes')::integer<>1
       or v_detail->>'my_reaction'<>'dislike' then
        raise exception 'Reaction totals did not update after switching to dislike.';
    end if;
    v_reaction:=public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'dislike');
    if v_reaction->>'reaction' is not null then
        raise exception 'A repeated dislike removes the current reaction.';
    end if;
    v_reaction:=public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'like');
    if v_reaction->>'reaction' is distinct from 'like' then
        raise exception 'The viewer could not restore the like reaction.';
    end if;

    v_view:=public.record_worth_it_ugc_view(current_setting('test.ugc_calculator_id')::uuid);
    if (v_view->>'success')::boolean is distinct from true
       or (v_view->>'counted')::boolean is distinct from true then
        raise exception 'The first calculator view could not be recorded.';
    end if;
    update private.worth_it_calculator_views
       set viewed_on=current_date-1
     where calculator_id=current_setting('test.ugc_calculator_id')::uuid
       and viewer_user_id='22222222-2222-4222-8222-222222222222';
    v_view:=public.record_worth_it_ugc_view(current_setting('test.ugc_calculator_id')::uuid);
    if (v_view->>'counted')::boolean is distinct from false then
        raise exception 'A repeat visit by the same account must not increase lifetime views.';
    end if;
    select count(*)::integer into v_views
      from private.worth_it_calculator_views
     where calculator_id=current_setting('test.ugc_calculator_id')::uuid
       and viewer_user_id='22222222-2222-4222-8222-222222222222';
    if v_views<>1 then
        raise exception 'One account must have only one lifetime view row per calculator, found %.',v_views;
    end if;
end
$viewer_check$;

-- The calculator creator cannot earn from their own use.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $creator_self_use$
declare
    v_request uuid := gen_random_uuid();
    v_before integer;
    v_after integer;
    v_earning_count integer;
begin
    select balance_milli into v_before from private.worth_it_calc_wallets
     where user_id='11111111-1111-4111-8111-111111111111';
    insert into private.worth_it_calc_transactions(
        user_id,kind,currency,amount_milli,balance_after_milli,status,
        request_id,description,metadata
    ) values (
        '11111111-1111-4111-8111-111111111111','calculator_spend','CALC',-300,0,'reserved',
        v_request,'Creator self-use',
        jsonb_build_object('reason','calculator','ugc_calculator_id',current_setting('test.ugc_calculator_id'))
    );
    perform public.calc_wallet_settle(v_request);
    select balance_milli into v_after from private.worth_it_calc_wallets
     where user_id='11111111-1111-4111-8111-111111111111';
    select count(*)::integer into v_earning_count
      from private.worth_it_ugc_creator_earnings e
      join private.worth_it_calc_transactions t on t.id=e.source_transaction_id
     where t.request_id=v_request;
    if v_before<>v_after or v_earning_count<>0 then
        raise exception 'Creators must not earn from their own calculator use.';
    end if;
end
$creator_self_use$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);

-- Creator and non-creator leaderboards respect periods and public-profile visibility.
do $creator_leaderboards$
declare
    v_rankings jsonb;
    v_creator jsonb;
    v_member jsonb;
    v_period text;
begin
    v_rankings:=public.get_worth_it_creator_leaderboards('30d','followers','growth','followers');
    if v_rankings->>'period'<>'30d' then
        raise exception 'Creator leaderboard did not preserve the selected period: %',v_rankings;
    end if;
    if jsonb_array_length(v_rankings->'top_creators')<1
       or jsonb_array_length(v_rankings->'rising_creators')<1 then
        raise exception 'The public calculator creator is missing from creator rankings: %',v_rankings;
    end if;
    v_creator:=v_rankings->'top_creators'->0;
    if v_creator->>'username'<>'creator'
       or (v_creator->>'followers')::integer<>1
       or (v_creator->>'period_followers')::integer<>1
       or (v_creator->>'public_calculators')::integer<>1
       or (v_creator->>'likes')::integer<>1
       or (v_creator->>'views')::integer<>1 then
        raise exception 'Top Creators did not rank followers, period activity and public calculators correctly: %',v_creator;
    end if;
    if not exists(
        select 1
          from jsonb_array_elements(v_rankings->'community_members') as member(item)
         where item->>'username'='viewer'
    ) then
        raise exception 'A public member without a published public calculator was not shown separately: %',v_rankings->'community_members';
    end if;

    v_rankings:=public.get_worth_it_creator_leaderboards('7d','followers','growth','new');
    if exists(
        select 1
          from jsonb_array_elements(v_rankings->'community_members') as member(item)
         where item->>'username'='viewer'
    ) then
        raise exception 'New Members must only include accounts created in the selected period.';
    end if;

    foreach v_period in array array['7d','30d','6m','12m','3y','5y','10y'] loop
        v_rankings:=public.get_worth_it_creator_leaderboards(v_period,'overall','breakout','connected');
        if v_rankings->>'period'<>v_period then
            raise exception 'Unsupported creator leaderboard period % was not retained.',v_period;
        end if;
        if jsonb_typeof(v_rankings->'top_creators')<>'array'
           or jsonb_typeof(v_rankings->'rising_creators')<>'array'
           or jsonb_typeof(v_rankings->'community_members')<>'array' then
            raise exception 'Creator leaderboard returned an invalid collection for period %.',v_period;
        end if;
    end loop;
end
$creator_leaderboards$;

-- The owner can turn the requirement off, allowing an account with no completed
-- calculator use to rate immediately; turning it back on protects new reactions.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $owner_rating_policy$
declare
    result jsonb;
    detail jsonb;
begin
    result:=public.set_worth_it_ugc_reaction_policy(current_setting('test.ugc_calculator_id')::uuid,false);
    if (result->>'success')::boolean is distinct from true
       or (result->>'require_test_before_reaction')::boolean is distinct from false then
        raise exception 'The owner could not disable the rating usage requirement: %',result;
    end if;
    detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_calculator_id')::uuid);
    if (detail->>'require_test_before_reaction')::boolean is distinct from false then
        raise exception 'The calculator owner must see their saved disabled setting.';
    end if;
end
$owner_rating_policy$;

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $untested_rating$
declare
    detail jsonb;
    reaction jsonb;
begin
    detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_calculator_id')::uuid);
    if detail ? 'has_used' or detail ? 'require_test_before_reaction' then
        raise exception 'The disabled owner rating setting must remain private to non-owners.';
    end if;
    reaction:=public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'like');
    if reaction->>'reaction' is distinct from 'like' then
        raise exception 'A member could not rate without a prior use after the owner disabled the policy.';
    end if;
end
$untested_rating$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_ugc_reaction_policy(current_setting('test.ugc_calculator_id')::uuid,true);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $reenabled_rating$
declare
    blocked boolean:=false;
    reaction jsonb;
begin
    begin
        perform public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'dislike');
    exception when insufficient_privilege then
        blocked:=true;
    end;
    if not blocked then
        raise exception 'Re-enabling the policy did not block an untested reaction change.';
    end if;
    reaction:=public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'like');
    if reaction->>'reaction' is not null then
        raise exception 'Removing an existing reaction should remain possible after the policy is enabled.';
    end if;
end
$reenabled_rating$;

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $second_viewer$
declare
    v_view jsonb;
    v_views integer;
begin
    v_view:=public.record_worth_it_ugc_view(current_setting('test.ugc_calculator_id')::uuid);
    if (v_view->>'counted')::boolean is distinct from true then
        raise exception 'A different account must add a separate unique view.';
    end if;
    v_view:=public.record_worth_it_ugc_view(current_setting('test.ugc_calculator_id')::uuid);
    if (v_view->>'counted')::boolean is distinct from false then
        raise exception 'The second account must also count only once.';
    end if;
    select count(*)::integer into v_views from private.worth_it_calculator_views
     where calculator_id=current_setting('test.ugc_calculator_id')::uuid;
    if v_views<>2 then
        raise exception 'Two different accounts must count as exactly two lifetime views, found %.',v_views;
    end if;
end
$second_viewer$;

-- Favourites are insertable only for the authenticated user's own row.
select set_config('test.ugc_id', :'calculator_id', false);
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
insert into public.worth_it_calculator_favorites(user_id,calculator_key)
values ('22222222-2222-4222-8222-222222222222','ugc:'||:'calculator_id');
do $test$
begin
    begin
        insert into public.worth_it_calculator_favorites(user_id,calculator_key)
        values ('11111111-1111-4111-8111-111111111111','ugc:'||current_setting('test.ugc_id',true));
        raise exception 'Cross-account favourite insert unexpectedly succeeded.';
    exception when insufficient_privilege then
        null;
    end;
end
$test$;
reset role;

select set_config('test.ugc_id', :'calculator_id', false);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $test$
declare
    result jsonb;
    item jsonb;
begin
    result:=public.get_worth_it_profile_favorite_calculators(102);
    if jsonb_array_length(result)<>1 then
        raise exception 'The owner profile did not return the expected favourite.';
    end if;
    item:=result->0;
    if (item->>'calculator_number')::bigint<>51
       or item->>'category'<>'money'
       or item->>'owner_username'<>'creator'
       or not (item->'subcategories' @> '["budgeting"]'::jsonb) then
        raise exception 'The profile favourite card is missing its number, tags, or creator: %',item;
    end if;
    if (item->>'views')::integer<>2
       or (item->>'likes')::integer<>1
       or (item->>'favorites')::integer<>1
       or (item->>'dislikes')::integer<>0 then
        raise exception 'The profile favourite card statistics are incomplete: %',item;
    end if;
end
$test$;

-- Non-owners cannot edit another member's calculator.
do $test$
begin
    begin
        perform public.save_worth_it_ugc_calculator(
            current_setting('test.ugc_id',true)::uuid,'Hijacked title','A concise description for this calculator.','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
        raise exception 'Non-owner edit unexpectedly succeeded.';
    exception when insufficient_privilege then
        null;
    end;
end
$test$;

-- There is no lifetime cap. Save more than ten calculators across UTC days while each day stays within the tier quota.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $unlimited_ugc$
declare i integer; today_utc date:=(now() at time zone 'utc')::date; total_count integer;
begin
    for i in 1..12 loop
        update private.worth_it_ugc_manual_daily_usage
           set usage_date=today_utc-i,updated_at=now()
         where user_id='11111111-1111-4111-8111-111111111111'
           and usage_date=today_utc;
        perform public.save_worth_it_ugc_calculator(
            null,'Unlimited saved calculator '||i,'A concise description for this calculator.','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    end loop;
    select count(*)::integer into total_count from private.worth_it_user_calculators
     where owner_user_id='11111111-1111-4111-8111-111111111111';
    if total_count<=10 then raise exception 'The account should be able to save more than ten calculators; saved %.',total_count; end if;
end
$unlimited_ugc$;

-- Premium allows three and Premium Lite allows two successful new calculators per UTC day.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $premium_quota$
declare q jsonb; i integer; blocked boolean:=false;
begin
    q:=public.get_worth_it_ugc_creation_quota();
    if (q->>'daily_limit')::integer<>3 then raise exception 'Premium quota must be three per day: %',q; end if;
    for i in 1..3 loop
        perform public.save_worth_it_ugc_calculator(
            null,'Premium draft '||i,'A concise description for this calculator.','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    end loop;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Premium fourth draft','A concise description for this calculator.','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when sqlstate '54000' then blocked:=true;
    end;
    if not blocked then raise exception 'Premium created more than three calculators in a UTC day.'; end if;
end
$premium_quota$;

select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $lite_quota$
declare q jsonb; i integer; blocked boolean:=false;
begin
    q:=public.get_worth_it_ugc_creation_quota();
    if (q->>'daily_limit')::integer<>2 then raise exception 'Premium Lite quota must be two per day: %',q; end if;
    for i in 1..2 loop
        perform public.save_worth_it_ugc_calculator(
            null,'Premium Lite draft '||i,'A concise description for this calculator.','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    end loop;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Premium Lite third draft','A concise description for this calculator.','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when sqlstate '54000' then blocked:=true;
    end;
    if not blocked then raise exception 'Premium Lite created more than two calculators in a UTC day.'; end if;
end
$lite_quota$;

-- Tier-specific and shared AI Maker quota behavior is tested above, including
-- Free 1 / Premium Lite 2 / Premium 3 and refund restoration.
-- The old fixed ten-generations-per-user smoke test was removed.
 
-- Unconfirmed accounts cannot create or publish.
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',false);
do $test$
declare failed boolean:=false;
begin
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Unconfirmed draft','A concise description for this calculator.','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when insufficient_privilege then
        failed:=true;
    end;
    if not failed then raise exception 'Unconfirmed account unexpectedly created a calculator.'; end if;
    failed:=false;
    begin
        perform public.reserve_worth_it_ugc_maker_generation();
    exception when insufficient_privilege then
        failed:=true;
    end;
    if not failed then raise exception 'Unconfirmed account unexpectedly used the AI Maker.'; end if;
end
$test$;

-- Premium tiers and membership periods unlock only the matching server-issued badges.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.set_worth_it_profile_badge_equipped('premium',true);
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
select public.set_worth_it_profile_badge_equipped('premium_lite',true);
select public.set_worth_it_profile_badge_equipped('member_3m',true);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_profile_badge_equipped('member_12m',true);

-- Only the configured owner account can equip the OWNER badge.
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
select public.set_worth_it_profile_badge_equipped('owner',true);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $test$
declare result jsonb; failed boolean:=false;
begin
    result:=public.get_worth_it_profile_badges(103);
    if not exists(select 1 from jsonb_array_elements(result->'badges') b where b->>'key'='premium' and (b->>'equipped')::boolean) then
        raise exception 'PREMIUM badge was not equipped.';
    end if;
    result:=public.get_worth_it_profile_badges(104);
    if not exists(select 1 from jsonb_array_elements(result->'badges') b where b->>'key'='premium_lite' and (b->>'equipped')::boolean) then
        raise exception 'PREMIUM LITE badge was not equipped.';
    end if;
    result:=public.get_worth_it_profile_badges(105);
    if not exists(select 1 from jsonb_array_elements(result->'badges') b where b->>'key'='owner' and (b->>'equipped')::boolean) then
        raise exception 'OWNER badge was not visible on the owner profile.';
    end if;
    result:=public.get_worth_it_profile_badges(101);
    if not exists(select 1 from jsonb_array_elements(result->'badges') b where b->>'key'='member_12m' and (b->>'equipped')::boolean) then
        raise exception 'Membership tenure badge was not equipped.';
    end if;
end
$test$;

-- An ordinary user cannot equip or forge the OWNER badge.
do $test$
declare failed boolean:=false;
begin
    begin
        perform public.set_worth_it_profile_badge_equipped('owner',true);
    exception when insufficient_privilege then
        failed:=true;
    end;
    if not failed then raise exception 'An ordinary account equipped the OWNER badge.'; end if;
end
$test$;

-- Unequip persists and the public badge list no longer advertises it.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_profile_badge_equipped('member_12m',false);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $test$
declare result jsonb;
begin
    result:=public.get_worth_it_profile_badges(101);
    if exists(select 1 from jsonb_array_elements(result->'badges') b where b->>'key'='member_12m') then
        raise exception 'Unequipped badge remained on the public profile.';
    end if;
end
$test$;

-- Private profiles never reveal their favourites to another member.
update public.worth_it_user_preferences set profile_visibility='private'
 where user_id='22222222-2222-4222-8222-222222222222';
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $test$
begin
    if jsonb_array_length(public.get_worth_it_profile_favorite_calculators(102))<>0 then
        raise exception 'A private profile exposed its favourite calculators.';
    end if;
end
$test$;

-- The new enhancement migration exposes a private favourites tab (owner-scoped only).
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $private_favourites$
declare result jsonb;
begin
    result:=public.get_worth_it_my_favorite_ugc_calculators('');
    if jsonb_array_length(result)<>1 then
        raise exception 'The viewer must see only the single UGC calculator they personally favourited: %',result;
    end if;
end
$private_favourites$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $private_favourites$
declare result jsonb;
begin
    result:=public.get_worth_it_my_favorite_ugc_calculators('');
    if jsonb_array_length(result)<>0 then
        raise exception 'The creator must not see another member''s private favourites.';
    end if;
end
$private_favourites$;

-- The calculator description is independently changeable once every 10 minutes.
do $description_cooldown$
declare
    v_id uuid:=current_setting('test.ugc_calculator_id')::uuid;
    result jsonb;
begin
    result:=public.get_worth_it_ugc_description_status(v_id);
    if (result->>'can_save')::boolean is distinct from false then
        raise exception 'A recent description edit did not activate its cooldown: %',result;
    end if;
    result:=public.update_worth_it_ugc_calculator_description(v_id,'An update too soon.');
    if (result->>'success')::boolean is distinct from false
       or result->>'code' is distinct from 'DESCRIPTION_COOLDOWN' then
        raise exception 'A second description change was not blocked: %',result;
    end if;

    update private.worth_it_user_calculators
       set description_changed_at=now()-interval '11 minutes'
     where id=v_id;
    result:=public.update_worth_it_ugc_calculator_description(v_id,'A description update after cooldown.');
    if (result->>'success')::boolean is distinct from true
       or (result->>'unchanged')::boolean is distinct from false then
        raise exception 'A description update after the cooldown was not accepted: %',result;
    end if;
    result:=public.update_worth_it_ugc_calculator_description(v_id,'A second update too soon.');
    if (result->>'success')::boolean is distinct from false
       or result->>'code' is distinct from 'DESCRIPTION_COOLDOWN' then
        raise exception 'The description cooldown was not restarted after a successful change: %',result;
    end if;
end
$description_cooldown$;

-- Even an owner cannot repurpose a saved calculator by changing its title or category.
do $identity_lock$
declare v_id uuid:=current_setting('test.ugc_calculator_id')::uuid; blocked boolean:=false;
begin
    begin
        perform public.save_worth_it_ugc_calculator(
            v_id,'A completely different calculator','A description update after cooldown.','cars',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when sqlstate '22023' then blocked:=true;
    end;
    if not blocked then raise exception 'An owner repurposed a saved UGC calculator by changing its identity.'; end if;
end
$identity_lock$;

-- Free: two AI improvements per UTC day, then a hard server-side limit.
delete from private.worth_it_calc_wallets where user_id='11111111-1111-4111-8111-111111111111';
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $free_ai_edit_quota$
declare q jsonb; result jsonb; i integer; calculator_id uuid;
begin
    select id into calculator_id from private.worth_it_user_calculators
     where owner_user_id='11111111-1111-4111-8111-111111111111' order by created_at limit 1;
    q:=public.get_worth_it_ugc_ai_edit_quota();
    if (q->>'daily_limit')::integer<>2 then raise exception 'Free AI edit limit must be 2: %',q; end if;
    for i in 1..2 loop
        result:=public.reserve_worth_it_ugc_ai_edit(calculator_id,gen_random_uuid());
        if (result->>'ok')::boolean is distinct from true then raise exception 'Free AI edit % was rejected: %',i,result; end if;
        perform public.settle_worth_it_ugc_ai_edit((result->>'request_id')::uuid);
    end loop;
    result:=public.reserve_worth_it_ugc_ai_edit(calculator_id,gen_random_uuid());
    if (result->>'ok')::boolean is distinct from false or result->>'code' is distinct from 'DAILY_LIMIT' then
        raise exception 'Free account could exceed two AI improvements per UTC day: %',result;
    end if;
end
$free_ai_edit_quota$;

-- Premium Lite: three AI improvements per UTC day.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $lite_ai_edit_quota$
declare q jsonb; result jsonb; i integer; calculator_id uuid;
begin
    select id into calculator_id from private.worth_it_user_calculators
     where owner_user_id='44444444-4444-4444-8444-444444444444' order by created_at limit 1;
    q:=public.get_worth_it_ugc_ai_edit_quota();
    if (q->>'daily_limit')::integer<>3 then raise exception 'Premium Lite AI edit limit must be 3: %',q; end if;
    for i in 1..3 loop
        result:=public.reserve_worth_it_ugc_ai_edit(calculator_id,gen_random_uuid());
        if (result->>'ok')::boolean is distinct from true then raise exception 'Premium Lite AI edit % was rejected: %',i,result; end if;
        perform public.settle_worth_it_ugc_ai_edit((result->>'request_id')::uuid);
    end loop;
    result:=public.reserve_worth_it_ugc_ai_edit(calculator_id,gen_random_uuid());
    if (result->>'ok')::boolean is distinct from false or result->>'code' is distinct from 'DAILY_LIMIT' then
        raise exception 'Premium Lite account could exceed three AI improvements per UTC day: %',result;
    end if;
end
$lite_ai_edit_quota$;

-- Premium: four AI improvements per UTC day.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $premium_ai_edit_quota$
declare q jsonb; result jsonb; i integer; calculator_id uuid;
begin
    select id into calculator_id from private.worth_it_user_calculators
     where owner_user_id='33333333-3333-4333-8333-333333333333' order by created_at limit 1;
    q:=public.get_worth_it_ugc_ai_edit_quota();
    if (q->>'daily_limit')::integer<>4 then raise exception 'Premium AI edit limit must be 4: %',q; end if;
    for i in 1..4 loop
        result:=public.reserve_worth_it_ugc_ai_edit(calculator_id,gen_random_uuid());
        if (result->>'ok')::boolean is distinct from true then raise exception 'Premium AI edit % was rejected: %',i,result; end if;
        perform public.settle_worth_it_ugc_ai_edit((result->>'request_id')::uuid);
    end loop;
    result:=public.reserve_worth_it_ugc_ai_edit(calculator_id,gen_random_uuid());
    if (result->>'ok')::boolean is distinct from false or result->>'code' is distinct from 'DAILY_LIMIT' then
        raise exception 'Premium account could exceed four AI improvements per UTC day: %',result;
    end if;
end
$premium_ai_edit_quota$;

-- Failed AI requests refund both the reservation and the corresponding daily allowance.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $ai_edit_refund$
declare calculator_id uuid; request_id uuid:=gen_random_uuid(); result jsonb; q jsonb;
begin
    update private.worth_it_ugc_ai_edit_daily_usage
       set usage_date=(now() at time zone 'utc')::date-1
     where user_id='11111111-1111-4111-8111-111111111111';
    select id into calculator_id from private.worth_it_user_calculators
     where owner_user_id='11111111-1111-4111-8111-111111111111' order by created_at limit 1;
    result:=public.reserve_worth_it_ugc_ai_edit(calculator_id,request_id);
    if (result->>'ok')::boolean is distinct from true then raise exception 'The fresh-day AI edit reservation failed: %',result; end if;
    result:=public.refund_worth_it_ugc_ai_edit(request_id);
    if (result->>'ok')::boolean is distinct from true then raise exception 'The failed AI edit could not be refunded: %',result; end if;
    q:=public.get_worth_it_ugc_ai_edit_quota();
    if (q->>'edits_used')::integer<>0 or (q->>'remaining')::integer<>2 then
        raise exception 'A refunded AI improvement still consumed the daily allowance: %',q;
    end if;
end
$ai_edit_refund$;

-- The new owner-only RPCs are unavailable to anonymous users but callable by authenticated owners.
do $enhancement_privileges$
begin
    if has_function_privilege('anon','public.get_worth_it_my_favorite_ugc_calculators(text)','execute') then
        raise exception 'Anonymous users can call the private favourites RPC.';
    end if;
    if has_function_privilege('anon','public.update_worth_it_ugc_calculator_description(uuid,text)','execute') then
        raise exception 'Anonymous users can change a community calculator description.';
    end if;
    if not has_function_privilege('authenticated','public.reserve_worth_it_ugc_ai_edit(uuid,uuid)','execute') then
        raise exception 'Authenticated owners cannot reserve a secured AI improvement.';
    end if;
end
$enhancement_privileges$;

-- Drafts and private published calculators are kept out of public discovery.
-- Restore a Premium test plan after the earlier Free quota checks so this section
-- can create two extra fixtures without weakening the daily quota assertions.
insert into private.worth_it_calc_wallets(user_id,premium_plan,premium_expires_at)
values ('11111111-1111-4111-8111-111111111111','premium',now()+interval '30 days')
on conflict(user_id) do update set premium_plan='premium',premium_expires_at=excluded.premium_expires_at;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select (public.save_worth_it_ugc_calculator(
 null,'Private visibility fixture','A concise description for this calculator.','money',
 '{"subcategories":["saving","budgeting"],"inputs":[{"key":"amount","label":"Amount","min":0,"max":100,"default":10}],"results":[{"label":"Total","expression":"amount"}]}'::jsonb
)->>'id') as private_calculator_id \gset
select set_config('test.ugc_private_id', :'private_calculator_id', false);
select public.publish_worth_it_ugc_calculator(:'private_calculator_id'::uuid,'private');
select (public.save_worth_it_ugc_calculator(
 null,'Unpublished draft fixture','','cars',
 '{"inputs":[{"key":"distance","label":"Distance","min":0,"max":1000,"default":100}],"results":[{"label":"Distance","expression":"distance"}]}'::jsonb
)->>'id') as draft_calculator_id \gset
select set_config('test.ugc_draft_id', :'draft_calculator_id', false);

do $owner_lists$
declare my_items jsonb; drafts jsonb; private_detail jsonb;
begin
    my_items:=public.get_worth_it_ugc_catalog_page('mine','12y','','all',1);
    drafts:=public.get_worth_it_ugc_catalog_page('my-drafts','12y','','all',1);
    if not exists(select 1 from jsonb_array_elements(my_items->'items') x where x->>'id'=current_setting('test.ugc_private_id')) then
        raise exception 'Owner My Calculators list did not include their private published calculator.';
    end if;
    if exists(select 1 from jsonb_array_elements(my_items->'items') x where x->>'id'=current_setting('test.ugc_draft_id')) then
        raise exception 'A draft leaked into My Calculators.';
    end if;
    if not exists(select 1 from jsonb_array_elements(drafts->'items') x where x->>'id'=current_setting('test.ugc_draft_id')) then
        raise exception 'My Drafts did not include the saved draft.';
    end if;
    private_detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_private_id')::uuid);
    if private_detail->>'visibility'<>'private' then raise exception 'Private visibility was not saved.'; end if;
    if jsonb_array_length(private_detail->'subcategories')<>2 then raise exception 'AI-assigned categories were not persisted.'; end if;
end
$owner_lists$;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $private_access$
declare blocked boolean:=false; page jsonb; view_result jsonb;
begin
    begin
        perform public.get_worth_it_ugc_calculator(current_setting('test.ugc_private_id')::uuid);
    exception when no_data_found then blocked:=true;
    end;
    if not blocked then raise exception 'A non-owner opened a private calculator by direct ID.'; end if;
    page:=public.get_worth_it_ugc_catalog_page('latest','12y','','all',1);
    if exists(select 1 from jsonb_array_elements(page->'items') x where x->>'id'=current_setting('test.ugc_private_id')) then
        raise exception 'A private calculator leaked into public discovery.';
    end if;
    view_result:=public.record_worth_it_ugc_view(current_setting('test.ugc_private_id')::uuid);
    if coalesce((view_result->>'counted')::boolean,false) then raise exception 'A private calculator view was counted.'; end if;
    begin
        perform public.set_worth_it_ugc_reaction(current_setting('test.ugc_private_id')::uuid,'like');
        raise exception 'A viewer reacted to a private calculator.';
    exception when insufficient_privilege then null;
    end;
end
$private_access$;

-- Only the owner can switch visibility; public visibility allows a direct calculator open.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_ugc_visibility(current_setting('test.ugc_private_id')::uuid,'public');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $public_access$
declare item jsonb;
begin
    item:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_private_id')::uuid);
    if item->>'visibility'<>'public' then raise exception 'Public visibility was not applied.'; end if;
end
$public_access$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_ugc_visibility(current_setting('test.ugc_private_id')::uuid,'private');


-- A current follower receives the public calculator publication.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $ugc_publish_notifications$
declare notices jsonb;
begin
    notices:=public.get_worth_it_social_notifications();
    if not exists(
        select 1 from jsonb_array_elements(notices) n
         where n->>'type'='ugc_published'
           and n->>'ugc_calculator_id'=current_setting('test.ugc_id')
           and n->>'calculator_title'='Monthly savings growth'
           and n->>'calculator_number'='51'
    ) then raise exception 'A follower did not receive the new public UGC calculator notification: %',notices; end if;
end
$ugc_publish_notifications$;

-- A transition to Private removes the associated notification.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_ugc_visibility(current_setting('test.ugc_id')::uuid,'private');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $ugc_private_clears_notification$
declare notices jsonb;
begin
    notices:=public.get_worth_it_social_notifications();
    if exists(select 1 from jsonb_array_elements(notices) n where n->>'type'='ugc_published' and n->>'ugc_calculator_id'=current_setting('test.ugc_id')) then
        raise exception 'Changing a published calculator to Private did not remove its notification.';
    end if;
end
$ugc_private_clears_notification$;

-- Re-publishing publicly while still followed creates a new notification.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_ugc_visibility(current_setting('test.ugc_id')::uuid,'public');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $ugc_republish_notifies$
declare notices jsonb;
begin
    notices:=public.get_worth_it_social_notifications();
    if not exists(select 1 from jsonb_array_elements(notices) n where n->>'type'='ugc_published' and n->>'ugc_calculator_id'=current_setting('test.ugc_id')) then
        raise exception 'Re-publishing a public UGC calculator did not notify an active follower.';
    end if;
end
$ugc_republish_notifies$;

-- A member who does not follow the creator receives no UGC publication notification.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $ugc_non_follower_notifications$
declare notices jsonb;
begin
    notices:=public.get_worth_it_social_notifications();
    if exists(select 1 from jsonb_array_elements(notices) n where n->>'type'='ugc_published') then
        raise exception 'A user who does not follow the creator received a UGC publication notification.';
    end if;
end
$ugc_non_follower_notifications$;

-- Unfollowing removes existing notices and prevents notices for later public releases.
delete from public.worth_it_follows
 where follower_user_id='22222222-2222-4222-8222-222222222222'
   and followed_user_id='11111111-1111-4111-8111-111111111111';
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $ugc_unfollow_clears_notifications$
declare notices jsonb;
begin
    notices:=public.get_worth_it_social_notifications();
    if exists(select 1 from jsonb_array_elements(notices) n where n->>'type'='ugc_published') then
        raise exception 'Unfollowing did not remove prior UGC publication notifications.';
    end if;
end
$ugc_unfollow_clears_notifications$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_ugc_visibility(current_setting('test.ugc_private_id')::uuid,'public');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $ugc_unfollow_future_notifications$
declare notices jsonb;
begin
    notices:=public.get_worth_it_social_notifications();
    if exists(select 1 from jsonb_array_elements(notices) n where n->>'type'='ugc_published' and n->>'ugc_calculator_id'=current_setting('test.ugc_private_id')) then
        raise exception 'A former follower received a later public UGC publication.';
    end if;
end
$ugc_unfollow_future_notifications$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.set_worth_it_ugc_visibility(current_setting('test.ugc_private_id')::uuid,'private');

do $delete_disabled$
begin
    if has_function_privilege('authenticated','public.delete_worth_it_ugc_calculator(uuid)','execute') then
        raise exception 'The removed Delete action is still executable by authenticated users.';
    end if;
end
$delete_disabled$;


-- Private data tables and privileged RPCs are not available to anon/authenticated directly.
do $test$
begin
    if has_table_privilege('authenticated','private.worth_it_user_calculators','select') then
        raise exception 'Authenticated users can query private UGC rows directly.';
    end if;
    if has_table_privilege('authenticated','private.worth_it_ugc_maker_daily_usage','select') then
        raise exception 'Authenticated users can query private AI Maker usage rows directly.';
    end if;
    if has_function_privilege('anon','public.reserve_worth_it_ugc_maker_generation()','execute') then
        raise exception 'Anonymous users can reserve AI Maker generations.';
    end if;
    if not has_function_privilege('authenticated','public.reserve_worth_it_ugc_maker_generation()','execute') then
        raise exception 'Authenticated users cannot reserve a secured AI Maker generation.';
    end if;
    if has_function_privilege('anon','public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb)','execute') then
        raise exception 'Anonymous users can execute UGC creation.';
    end if;
    if not has_function_privilege('authenticated','public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb)','execute') then
        raise exception 'Authenticated users cannot execute the secured UGC RPC.';
    end if;
end
$test$;


-- Private UGC helper routines must not be directly executable by API roles.
do $ugc_private_helper_privileges$
declare
    v_role text;
    v_function text;
begin
    foreach v_function in array array[
        'private.worth_it_badge_is_earned(uuid,text)',
        'private.worth_it_guard_ugc_calculator_update()',
        'private.worth_it_validate_ugc_spec(jsonb)'
    ] loop
        foreach v_role in array array['anon','authenticated','service_role'] loop
            if has_function_privilege(v_role,v_function,'execute') then
                raise exception '% can execute internal UGC helper %.',v_role,v_function;
            end if;
        end loop;
    end loop;
    if has_schema_privilege('anon','private','usage')
       or has_schema_privilege('authenticated','private','usage') then
        raise exception 'An API role can use the private schema.';
    end if;
end
$ugc_private_helper_privileges$;



-- The paginated catalogue always returns at most 30 items and preserves category filtering.
insert into private.worth_it_user_calculators(
    owner_user_id,title,description,category,spec,status,visibility,published_at
)
select
    '33333333-3333-4333-8333-333333333333'::uuid,
    'Pagination fixture calculator '||g,
    'Disposable row used to verify thirty-item community pages.',
    case when g%2=0 then 'money' else 'cars' end,
    '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":100,"default":10}],"results":[{"label":"Total","expression":"amount"}]}'::jsonb,
    'published',
    'public',
    now()-make_interval(secs=>g)
from generate_series(1,31) g;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $ugc_pagination$
declare
    first_page jsonb;
    second_page jsonb;
    cars_page jsonb;
    count_first integer;
    count_second integer;
begin
    first_page:=public.get_worth_it_ugc_catalog_page('latest','12y','','all',1);
    second_page:=public.get_worth_it_ugc_catalog_page('latest','12y','','all',2);
    count_first:=jsonb_array_length(first_page->'items');
    count_second:=jsonb_array_length(second_page->'items');

    if (first_page->>'page_size')::integer<>30 or count_first<>30 then
        raise exception 'The first UGC page must contain exactly 30 items: %',first_page;
    end if;
    if (second_page->>'page')::integer<>2 or count_second<1 or count_second>30 then
        raise exception 'Page two must return the remaining UGC items: %',second_page;
    end if;
    if (first_page->>'total_count')::integer<31 or (first_page->>'total_pages')::integer<2 then
        raise exception 'UGC pagination total counts are incomplete: %',first_page;
    end if;

    cars_page:=public.get_worth_it_ugc_catalog_page('latest','12y','','cars',1);
    if cars_page->>'category'<>'cars' or
       exists(select 1 from jsonb_array_elements(cars_page->'items') item where item->>'category'<>'cars') then
        raise exception 'UGC category filtering leaked calculators from another category: %',cars_page;
    end if;

    if (public.get_worth_it_ugc_catalog_page('mine','12y','','all',1)->>'page_size')::integer<>30
       or (public.get_worth_it_ugc_catalog_page('my-favorites','12y','','all',1)->>'page_size')::integer<>30 then
        raise exception 'Personal UGC catalogue views must use the same 30-item page size.';
    end if;
end
$ugc_pagination$;


-- Maker generation reservations are request-bound, refundable once, and owner-only.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $maker_generation_refunds$
declare
    v_failed_request uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10';
    v_success_request uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11';
    v_reserved jsonb;
    v_duplicate jsonb;
    v_refunded jsonb;
    v_refunded_again jsonb;
    v_cross_account jsonb;
    v_settled jsonb;
    v_rejected_refund jsonb;
    v_used smallint;
begin
    v_reserved := public.reserve_worth_it_ugc_maker_generation_v2(v_failed_request);
    if v_reserved->>'ok' <> 'true' or (v_reserved->>'requests_used')::integer <> 1 then
        raise exception 'A new Maker generation should reserve exactly one daily attempt: %',v_reserved;
    end if;

    v_duplicate := public.reserve_worth_it_ugc_maker_generation_v2(v_failed_request);
    if v_duplicate->>'ok' <> 'true'
       or v_duplicate->>'already_reserved' <> 'true'
       or (v_duplicate->>'requests_used')::integer <> 1 then
        raise exception 'Repeating a reservation ID must not increment the Maker counter twice: %',v_duplicate;
    end if;

    perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
    v_cross_account := public.refund_worth_it_ugc_maker_generation_v2(v_failed_request);
    if v_cross_account->>'ok' <> 'false' or v_cross_account->>'code' <> 'RESERVATION_NOT_FOUND' then
        raise exception 'One account must not refund another account Maker reservation: %',v_cross_account;
    end if;

    perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
    v_refunded := public.refund_worth_it_ugc_maker_generation_v2(v_failed_request);
    if v_refunded->>'ok' <> 'true' or v_refunded->>'refunded' <> 'true'
       or (v_refunded->>'requests_used')::integer <> 0 then
        raise exception 'A failed Maker generation must restore exactly one attempt: %',v_refunded;
    end if;

    v_refunded_again := public.refund_worth_it_ugc_maker_generation_v2(v_failed_request);
    if v_refunded_again->>'ok' <> 'true' or v_refunded_again->>'already_refunded' <> 'true' then
        raise exception 'A Maker generation refund must be idempotent: %',v_refunded_again;
    end if;

    v_reserved := public.reserve_worth_it_ugc_maker_generation_v2(v_success_request);
    if v_reserved->>'ok' <> 'true' or (v_reserved->>'requests_used')::integer <> 1 then
        raise exception 'A new successful generation should reserve one attempt: %',v_reserved;
    end if;
    v_settled := public.settle_worth_it_ugc_maker_generation_v2(v_success_request);
    if v_settled->>'ok' <> 'true' then
        raise exception 'A successful Maker generation should settle: %',v_settled;
    end if;
    v_rejected_refund := public.refund_worth_it_ugc_maker_generation_v2(v_success_request);
    if v_rejected_refund->>'ok' <> 'false'
       or v_rejected_refund->>'code' <> 'RESERVATION_ALREADY_CONSUMED' then
        raise exception 'A completed Maker generation must not be refundable: %',v_rejected_refund;
    end if;

    select requests_used into v_used
      from private.worth_it_ugc_maker_daily_usage
     where user_id='11111111-1111-4111-8111-111111111111'
       and usage_date=(now() at time zone 'UTC')::date;
    if v_used is distinct from 1 then
        raise exception 'Only the successful Maker generation should remain counted, got %.',v_used;
    end if;

    if has_table_privilege('anon','private.worth_it_ugc_maker_generation_reservations','select')
       or has_table_privilege('authenticated','private.worth_it_ugc_maker_generation_reservations','select')
       or has_function_privilege('anon','public.refund_worth_it_ugc_maker_generation_v2(uuid)','execute')
       or not has_function_privilege('authenticated','public.refund_worth_it_ugc_maker_generation_v2(uuid)','execute') then
        raise exception 'Maker reservation storage or RPC privileges are not restricted correctly.';
    end if;
end
$maker_generation_refunds$;


-- UGC AI billing and manual Builder isolation. These tests run only against
-- the disposable PostgreSQL fixture; no live Supabase wallet is touched.
do $ugc_manual_ai_billing$
declare
    v_free uuid := 'a7777777-7777-4777-8777-777777777777';
    v_lite uuid := 'a8888888-8888-4888-8888-888888888889';
    v_premium uuid := 'a9999999-9999-4999-8999-999999999998';
    v_owner uuid := '55555555-5555-4555-8555-555555555555';
    v_request uuid;
    v_calculator uuid;
    v_spec jsonb := '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":100,"default":10,"step":1}],"results":[{"label":"Total amount","expression":"amount"}]}'::jsonb;
    v_description text := 'A clear description for this calculator and its assumptions.';
    q jsonb;
    v_balance integer;
    v_used integer;
    v_count integer;
    v_before integer;
    v_owner_status text;
    blocked boolean := false;
begin
    -- Free: AI generation costs 2 CALC and does not use the manual-save slot.
    perform set_config('request.jwt.claim.sub',v_free::text,true);
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_ai_operation(v_request,'create',null);
    if (q->>'ok')::boolean is distinct from true or (q->>'price_milli')::integer<>2000 then
        raise exception 'Free AI generation should reserve 2 CALC: %',q;
    end if;
    select balance_milli into v_balance from private.worth_it_calc_wallets where user_id=v_free;
    if v_balance<>8000 then raise exception 'Free AI generation must deduct exactly 2 CALC; got %.',v_balance; end if;
    q:=public.settle_worth_it_ugc_ai_operation(v_request,'create');
    if (q->>'ok')::boolean is distinct from true then raise exception 'Free AI generation could not settle: %',q; end if;

    q:=public.get_worth_it_ugc_creation_quota();
    if (q->>'creations_used')::integer<>0 or (q->>'remaining')::integer<>1 then
        raise exception 'AI generation must not consume the manual save quota: %',q;
    end if;

    q:=public.save_worth_it_ugc_calculator(
        null,'Free AI calculator',v_description,'money',v_spec,'ai',v_request
    );
    v_calculator:=(q->>'id')::uuid;
    if v_calculator is null then raise exception 'A paid, settled AI generation could not be saved: %',q; end if;

    -- An identical retry returns the original calculator; changed content cannot
    -- reuse the same paid operation ID.
    q:=public.save_worth_it_ugc_calculator(
        null,'Free AI calculator',v_description,'money',v_spec,'ai',v_request
    );
    if (q->>'already_saved')::boolean is distinct from true or (q->>'id')::uuid<>v_calculator then
        raise exception 'AI save retries should be idempotent: %',q;
    end if;
    blocked:=false;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Changed AI title',v_description,'money',v_spec,'ai',v_request
        );
    exception when insufficient_privilege then blocked:=true;
    end;
    if not blocked then raise exception 'One AI operation was reused to create a different calculator definition.'; end if;

    -- A client cannot claim AI provenance without both a settled quota and a
    -- matching, completed CALC transaction.
    blocked:=false;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Forged AI calculator',v_description,'money',v_spec,'ai',gen_random_uuid()
        );
    exception when insufficient_privilege then blocked:=true;
    end;
    if not blocked then raise exception 'A forged AI save without a paid operation was accepted.'; end if;

    -- The same Free account may still make its one manual save today.
    q:=public.save_worth_it_ugc_calculator(
        null,'Free manual calculator',v_description,'money',v_spec,'manual',null
    );
    if coalesce((q->>'remaining')::integer,-1)<>0 then
        raise exception 'The Free manual save quota should be used only by a manual save: %',q;
    end if;
    select creations_used into v_used from private.worth_it_ugc_manual_daily_usage
     where user_id=v_free and usage_date=(now() at time zone 'UTC')::date;
    if v_used<>1 then raise exception 'Free manual save counter should be one after the manual save; got %.',v_used; end if;
    blocked:=false;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Free manual second calculator',v_description,'money',v_spec,'manual',null
        );
    exception when sqlstate '54000' then blocked:=true;
    end;
    if not blocked then raise exception 'Free account exceeded its one manual calculator save per UTC day.'; end if;

    -- Premium Lite: insufficient funds restore its AI generation slot and
    -- create no charge transaction; a later failed provider request refunds
    -- both the 4-CALC reservation and the daily AI slot.
    perform set_config('request.jwt.claim.sub',v_lite::text,true);
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_ai_operation(v_request,'create',null);
    if q->>'code'<>'INSUFFICIENT_CALC' or (q->>'required_milli')::integer<>4000 then
        raise exception 'Premium Lite must require 4 CALC: %',q;
    end if;
    q:=public.get_worth_it_ugc_maker_generation_quota();
    if (q->>'requests_used')::integer<>0 then
        raise exception 'An insufficient CALC balance must restore the Premium Lite AI generation slot: %',q;
    end if;
    if exists(select 1 from private.worth_it_calc_transactions where user_id=v_lite and request_id=v_request) then
        raise exception 'An insufficient balance must not create a CALC transaction.';
    end if;

    update private.worth_it_calc_wallets set balance_milli=12000 where user_id=v_lite;
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_ai_operation(v_request,'create',null);
    if (q->>'price_milli')::integer<>4000 then raise exception 'Premium Lite AI generation must cost 4 CALC: %',q; end if;
    q:=public.refund_worth_it_ugc_ai_operation(v_request,'create');
    if (q->>'ok')::boolean is distinct from true then raise exception 'Failed Premium Lite AI generation was not refunded: %',q; end if;
    q:=public.refund_worth_it_ugc_ai_operation(v_request,'create');
    if (q->>'ok')::boolean is distinct from true then raise exception 'Repeated AI refund should be idempotent: %',q; end if;
    select balance_milli into v_balance from private.worth_it_calc_wallets where user_id=v_lite;
    if v_balance<>12000 then raise exception 'Failed AI generation did not restore all 4 CALC; balance %.',v_balance; end if;
    q:=public.get_worth_it_ugc_maker_generation_quota();
    if (q->>'requests_used')::integer<>0 then raise exception 'Failed AI generation must restore the daily slot: %',q; end if;

    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_ai_operation(v_request,'create',null);
    if (q->>'ok')::boolean is distinct from true or (q->>'price_milli')::integer<>4000 then
        raise exception 'Premium Lite should be able to reuse a refunded slot: %',q;
    end if;
    q:=public.settle_worth_it_ugc_ai_operation(v_request,'create');
    if (q->>'ok')::boolean is distinct from true then raise exception 'Premium Lite AI generation could not settle: %',q; end if;
    q:=public.save_worth_it_ugc_calculator(
        null,'Premium Lite AI calculator',v_description,'money',v_spec,'ai',v_request
    );
    if (q->>'success')::boolean is distinct from true then raise exception 'Premium Lite paid AI save was rejected: %',q; end if;
    q:=public.get_worth_it_ugc_creation_quota();
    if (q->>'creations_used')::integer<>0 then raise exception 'Premium Lite AI save must not consume manual quota: %',q; end if;

    -- Premium: manual save and AI improvement are separate. AI improvement
    -- costs 6 CALC and does not consume the manual save allowance.
    perform set_config('request.jwt.claim.sub',v_premium::text,true);
    q:=public.save_worth_it_ugc_calculator(
        null,'Premium manual calculator',v_description,'money',v_spec,'manual',null
    );
    v_calculator:=(q->>'id')::uuid;
    if v_calculator is null then raise exception 'Premium manual calculator could not be saved: %',q; end if;
    q:=public.get_worth_it_ugc_ai_edit_quota();
    if (q->>'daily_limit')::integer<>3 then raise exception 'Premium AI improvement allowance should be three: %',q; end if;
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_ai_operation(v_request,'refine',v_calculator);
    if (q->>'ok')::boolean is distinct from true or (q->>'price_milli')::integer<>6000 then
        raise exception 'Premium AI improvement should cost 6 CALC: %',q;
    end if;
    q:=public.settle_worth_it_ugc_ai_operation(v_request,'refine');
    if (q->>'ok')::boolean is distinct from true then raise exception 'Premium AI improvement could not settle: %',q; end if;
    q:=public.save_worth_it_ugc_calculator(
        v_calculator,'Premium AI-improved calculator',v_description,'money',v_spec,'ai',v_request
    );
    if (q->>'success')::boolean is distinct from true then raise exception 'A paid AI improvement could not be saved: %',q; end if;
    q:=public.get_worth_it_ugc_creation_quota();
    if (q->>'creations_used')::integer<>1 then raise exception 'AI improvement must not consume the manual save quota: %',q; end if;
    q:=public.get_worth_it_ugc_ai_edit_quota();
    if (q->>'edits_used')::integer<>1 then raise exception 'Premium AI improvement should consume exactly one edit slot: %',q; end if;

    -- Owner operations remain exempt from CALC while the AI daily quota still
    -- records their successful use.
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    v_request:=gen_random_uuid();
    q:=public.reserve_worth_it_ugc_ai_operation(v_request,'create',null);
    if (q->>'ok')::boolean is distinct from true or coalesce((q->>'price_milli')::integer,-1)<>0
       or coalesce((q->>'owner_exempt')::boolean,false) is not true then
        raise exception 'Owner AI generation must be CALC-exempt: %',q;
    end if;
    q:=public.settle_worth_it_ugc_ai_operation(v_request,'create');
    if (q->>'ok')::boolean is distinct from true then raise exception 'Owner AI generation could not settle: %',q; end if;
    select amount_milli,status into v_before,v_owner_status
      from private.worth_it_calc_transactions
     where user_id=v_owner and request_id=v_request and kind='ugc_ai_spend';
    if v_before<>0 or v_owner_status<>'completed' then
        raise exception 'Owner AI generation must be recorded as a completed zero-CALC transaction.';
    end if;
end
$ugc_manual_ai_billing$;

rollback;
