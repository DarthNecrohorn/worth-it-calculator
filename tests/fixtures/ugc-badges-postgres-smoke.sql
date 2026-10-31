-- Smoke tests for account ownership, publication, discovery, favorites and badges.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','creator@example.test',now()),
 ('22222222-2222-4222-8222-222222222222','viewer@example.test',now()),
 ('33333333-3333-4333-8333-333333333333','premium@example.test',now()),
 ('44444444-4444-4444-8444-444444444444','lite@example.test',now()),
 ('55555555-5555-4555-8555-555555555555','pedjasebez3545@gmail.com',now()),
 ('66666666-6666-4666-8666-666666666666','unconfirmed@example.test',null);

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

insert into private.worth_it_calc_wallets(user_id,premium_plan,premium_expires_at) values
 ('33333333-3333-4333-8333-333333333333','premium',now()+interval '30 days'),
 ('44444444-4444-4444-8444-444444444444','premium_lite',now()+interval '30 days');

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

select (public.publish_worth_it_ugc_calculator(:'calculator_id'::uuid)->>'status') as publish_status \gset

-- Free accounts receive one successful new calculator per UTC day.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $free_quota$
declare q jsonb; blocked boolean:=false;
begin
    q:=public.get_worth_it_ugc_creation_quota();
    if (q->>'daily_limit')::integer<>1 or (q->>'creations_used')::integer<>1 or (q->>'remaining')::integer<>0 then
        raise exception 'Free daily creation allowance is incorrect: %',q;
    end if;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Free second draft','','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when program_limit_exceeded then blocked:=true;
    end;
    if not blocked then raise exception 'Free account created more than one calculator in a UTC day.'; end if;
end
$free_quota$;

-- Upgrade the fixture creator to Premium, verify the next sequential ID, and then test the lifetime cap.
insert into private.worth_it_calc_wallets(user_id,premium_plan,premium_expires_at)
values ('11111111-1111-4111-8111-111111111111','premium',now()+interval '30 days')
on conflict(user_id) do update set premium_plan='premium',premium_expires_at=excluded.premium_expires_at;
select (public.save_worth_it_ugc_calculator(
 null,'Second savings calculator','','money',
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
begin
    v_detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_calculator_id')::uuid);
    if (v_detail->>'is_owner')::boolean is distinct from true then
        raise exception 'The calculator owner cannot open their own published calculator.';
    end if;
    v_mine:=public.get_worth_it_my_ugc_calculators('');
    if jsonb_array_length(v_mine)<>1 then
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
begin
    v_detail:=public.get_worth_it_ugc_calculator(current_setting('test.ugc_calculator_id')::uuid);
    if (v_detail->>'is_owner')::boolean is distinct from false then
        raise exception 'A different member was incorrectly treated as the calculator owner.';
    end if;
    v_catalog:=public.get_worth_it_ugc_catalog('latest','12y','',20,0);
    if jsonb_array_length(v_catalog)<1 then
        raise exception 'Published UGC calculator is missing from the latest catalogue.';
    end if;
    v_reaction:=public.set_worth_it_ugc_reaction(current_setting('test.ugc_calculator_id')::uuid,'like');
    if v_reaction->>'reaction' is distinct from 'like' then
        raise exception 'The like reaction was not stored.';
    end if;
    v_view:=public.record_worth_it_ugc_view(current_setting('test.ugc_calculator_id')::uuid);
    if (v_view->>'success')::boolean is distinct from true then
        raise exception 'The calculator view could not be recorded.';
    end if;
end
$viewer_check$;

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
declare result jsonb;
begin
    result:=public.get_worth_it_profile_favorite_calculators(102);
    if jsonb_array_length(result)<>1 then raise exception 'The owner profile did not return the expected favourite.'; end if;
end
$test$;

-- Non-owners cannot edit another member's calculator.
do $test$
begin
    begin
        perform public.save_worth_it_ugc_calculator(
            current_setting('test.ugc_id',true)::uuid,'Hijacked title','','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
        raise exception 'Non-owner edit unexpectedly succeeded.';
    exception when insufficient_privilege then
        null;
    end;
end
$test$;

-- The ten-calculator lifetime cap includes drafts; daily limits reset independently by UTC date.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $test$
declare i integer; failed boolean:=false; today_utc date:=(now() at time zone 'utc')::date;
begin
    for i in 1..8 loop
        if i in (1,4,7) then
            update private.worth_it_ugc_creation_daily_usage
               set usage_date=today_utc-i,updated_at=now()
             where user_id='11111111-1111-4111-8111-111111111111'
               and usage_date=today_utc;
        end if;
        perform public.save_worth_it_ugc_calculator(
            null,'Creator draft '||i,'','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    end loop;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Eleventh calculator','','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when program_limit_exceeded then failed:=true;
    end;
    if not failed then raise exception 'The ten-calculator lifetime cap was not enforced.'; end if;
end
$test$;

-- Premium allows three and Premium Lite allows two successful new calculators per UTC day.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $premium_quota$
declare q jsonb; i integer; blocked boolean:=false;
begin
    q:=public.get_worth_it_ugc_creation_quota();
    if (q->>'daily_limit')::integer<>3 then raise exception 'Premium quota must be three per day: %',q; end if;
    for i in 1..3 loop
        perform public.save_worth_it_ugc_calculator(
            null,'Premium draft '||i,'','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    end loop;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Premium fourth draft','','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when program_limit_exceeded then blocked:=true;
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
            null,'Premium Lite draft '||i,'','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    end loop;
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Premium Lite third draft','','money',
            '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":10,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb
        );
    exception when program_limit_exceeded then blocked:=true;
    end;
    if not blocked then raise exception 'Premium Lite created more than two calculators in a UTC day.'; end if;
end
$lite_quota$;

-- AI Maker quota is enforced atomically per confirmed user and UTC day.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $quota_test$
declare
    i integer;
    result jsonb;
begin
    for i in 1..10 loop
        result:=public.reserve_worth_it_ugc_maker_generation();
        if (result->>'ok')::boolean is distinct from true then
            raise exception 'AI Maker quota rejected a request before the daily limit.';
        end if;
    end loop;
    result:=public.reserve_worth_it_ugc_maker_generation();
    if (result->>'ok')::boolean is distinct from false
       or result->>'code' is distinct from 'DAILY_LIMIT'
       or (result->>'requests_used')::integer<>10 then
        raise exception 'AI Maker daily limit did not stop the eleventh generation.';
    end if;
end
$quota_test$;

-- Unconfirmed accounts cannot create or publish.
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',false);
do $test$
declare failed boolean:=false;
begin
    begin
        perform public.save_worth_it_ugc_calculator(
            null,'Unconfirmed draft','','money',
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

-- Deleting an owned calculator also removes its unlinked text-keyed favourites.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $test$
declare
    v_id uuid:=current_setting('test.ugc_calculator_id')::uuid;
    v_result jsonb;
begin
    if not exists(select 1 from public.worth_it_calculator_favorites where calculator_key='ugc:'||v_id::text) then
        raise exception 'Expected viewer favourite does not exist before creator deletion.';
    end if;
    v_result:=public.delete_worth_it_ugc_calculator(v_id);
    if (v_result->>'success')::boolean is distinct from true then
        raise exception 'Creator could not delete their own calculator.';
    end if;
    if exists(select 1 from public.worth_it_calculator_favorites where calculator_key='ugc:'||v_id::text) then
        raise exception 'Deleting a calculator left orphan favourite rows.';
    end if;
end
$test$;

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

rollback;
