\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.email','member@example.test',true);

insert into public.worth_it_calculator_favorites(user_id,calculator_key)
values ('00000000-0000-4000-8000-000000000002','ugc:demo-calc');
do $test$
begin
  if (select count(*) from public.worth_it_calculator_favorites) <> 1 then
    raise exception 'A user could not read their own favourite.';
  end if;
  begin
    insert into public.worth_it_calculator_favorites(user_id,calculator_key)
    values ('00000000-0000-4000-8000-000000000002','cars');
    raise exception 'An ordinary built-in calculator was allowed into the favourites table.';
  exception when check_violation then
    null;
  end;
  begin
    perform public.admin_update_worth_it_user_report(1,'resolved','unauthorised attempt');
    raise exception 'A non-admin was allowed to moderate a report.';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;

insert into public.worth_it_user_themes(user_id,theme_name,primary_color,secondary_color,hover_color,header_color,theme_config)
values(
 '00000000-0000-4000-8000-000000000002','Ocean','#176B87','#64CCC5','#FF8C42','#18243A',
 '{"background":"#101827","surface":"#19283B","surfaceAlt":"#22344A","text":"#F5F7FF","heading":"#FFFFFF","muted":"#B8C5D8","link":"#8BE9FD","border":"#486078","fontFamily":"georgia","headingStyle":"editorial","bodyStyle":"comfortable","corners":"rounded","buttonStyle":"outline","cardStyle":"solid"}'::jsonb
)
on conflict(user_id) do update set theme_name=excluded.theme_name,
  primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,
  hover_color=excluded.hover_color,header_color=excluded.header_color,
  theme_config=excluded.theme_config;
do $test$
begin
  if not exists(
    select 1 from public.worth_it_user_themes
     where user_id='00000000-0000-4000-8000-000000000002'
       and primary_color='#176B87' and secondary_color='#64CCC5' and hover_color='#FF8C42'
       and header_color='#18243A'
       and theme_config->>'background'='#101827'
       and theme_config->>'fontFamily'='georgia'
       and theme_config->>'headingStyle'='editorial'
       and theme_config->>'buttonStyle'='outline'
  ) then
    raise exception 'The account theme colours and extended design tokens were not saved.';
  end if;
  begin
    update public.worth_it_user_themes set hover_color='not-a-colour'
     where user_id='00000000-0000-4000-8000-000000000002';
    raise exception 'The custom theme accepted an invalid hover colour.';
  exception when check_violation then
    null;
  end;
  begin
    update public.worth_it_user_themes set header_color='not-a-colour'
     where user_id='00000000-0000-4000-8000-000000000002';
    raise exception 'The custom theme accepted an invalid header-controls background colour.';
  exception when check_violation then
    null;
  end;
  begin
    update public.worth_it_user_themes set theme_config='[]'::jsonb
     where user_id='00000000-0000-4000-8000-000000000002';
    raise exception 'The custom theme accepted a non-object design token configuration.';
  exception when check_violation then
    null;
  end;
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
