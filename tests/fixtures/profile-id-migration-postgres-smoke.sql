do $$
begin
    if (select worth_it_id from public.worth_it_profiles where user_id='00000000-0000-0000-0000-000000000005') <> 4 then
        raise exception 'Existing profile ID 5 was not reassigned to 4.';
    end if;
    if not (select avatar_is_custom from public.worth_it_profiles where user_id='00000000-0000-0000-0000-000000000005') then
        raise exception 'Custom avatar flag was not preserved.';
    end if;
    if (select avatar_url from public.worth_it_profiles where user_id='00000000-0000-0000-0000-000000000005') <> 'https://example.test/custom.png' then
        raise exception 'Custom avatar URL was not preserved.';
    end if;
    if exists (select 1 from public.worth_it_profiles where worth_it_id=5) then
        raise exception 'ID 5 should be free after the repair.';
    end if;
end $$;

-- A rolled-back registration must not consume the next public ID.
begin;
insert into auth.users(id,email,raw_user_meta_data)
values('00000000-0000-0000-0000-000000000006','rolledback@example.test','{"username":"rolledback"}');
rollback;

insert into auth.users(id,email,raw_user_meta_data)
values('00000000-0000-0000-0000-000000000007','new5@example.test','{"username":"new5"}');

do $$
begin
    if (select worth_it_id from public.worth_it_profiles where user_id='00000000-0000-0000-0000-000000000007') <> 5 then
        raise exception 'Next committed account did not receive ID 5 after rollback.';
    end if;
end $$;

-- A rolled-back UGC insert must not consume the next visible calculator number.
begin;
insert into private.worth_it_user_calculators(owner_user_id,title)
values('00000000-0000-0000-0000-000000000007','Rollback test');
rollback;

insert into private.worth_it_user_calculators(owner_user_id,title)
values('00000000-0000-0000-0000-000000000007','Committed test');

do $$
begin
    if (select calculator_number from private.worth_it_user_calculators where title='Committed test') <> 53 then
        raise exception 'Next committed UGC calculator did not receive number 53.';
    end if;
end $$;
