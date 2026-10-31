\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.email','member@example.test',true);

insert into public.worth_it_calculator_favorites(user_id,calculator_key)
values ('00000000-0000-4000-8000-000000000002','cars');
do $test$
begin
  if (select count(*) from public.worth_it_calculator_favorites) <> 1 then
    raise exception 'A user could not read their own favourite.';
  end if;
  begin
    perform public.admin_update_worth_it_user_report(1,'resolved','unauthorised attempt');
    raise exception 'A non-admin was allowed to moderate a report.';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;

insert into public.worth_it_user_themes(user_id,theme_name,primary_color,secondary_color)
values('00000000-0000-4000-8000-000000000002','Ocean','#176B87','#64CCC5')
on conflict(user_id) do update set theme_name=excluded.theme_name,
  primary_color=excluded.primary_color,secondary_color=excluded.secondary_color;
do $test$
begin
  if not exists(select 1 from public.worth_it_user_themes where user_id='00000000-0000-4000-8000-000000000002' and primary_color='#176B87') then
    raise exception 'The account theme was not saved.';
  end if;
end
$test$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','pedjasebez3545@gmail.com',true);
select public.admin_update_worth_it_user_report(1,'reviewing','Checked by owner.');
do $test$
begin
  if not exists(select 1 from public.worth_it_user_reports where id=1 and status='reviewing' and admin_note='Checked by owner.' and reviewed_by='00000000-0000-4000-8000-000000000001') then
    raise exception 'Admin report moderation did not save the status and audit fields.';
  end if;
end
$test$;
rollback;
