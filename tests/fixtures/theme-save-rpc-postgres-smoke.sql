-- Exercise the authenticated Custom Theme save RPC in disposable PostgreSQL.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"email":"pedjasebez3545@gmail.com"}',true);

select public.save_worth_it_custom_theme(
  '{"name":"Palette A","primary":"#112233","secondary":"#223344","hover":"#334455","header":"#445566","background":"#010203","fontFamily":"inter"}'::jsonb
);
select public.save_worth_it_custom_theme(
  '{"name":"Palette B","primary":"#AABBCC","secondary":"#BBCCDD","hover":"#CCDDEE","header":"#DDEEFF","background":"#0A0B0C","fontFamily":"georgia"}'::jsonb
);

do $$
declare
    v_theme public.worth_it_user_themes%rowtype;
begin
    select * into v_theme
    from public.worth_it_user_themes
    where user_id = '22222222-2222-4222-8222-222222222222';

    if v_theme.theme_name <> 'Palette B'
       or v_theme.primary_color <> '#AABBCC'
       or v_theme.secondary_color <> '#BBCCDD'
       or v_theme.hover_color <> '#CCDDEE'
       or v_theme.header_color <> '#DDEEFF'
       or v_theme.theme_config ->> 'background' <> '#0A0B0C'
       or v_theme.theme_config ->> 'fontFamily' <> 'georgia' then
        raise exception 'The second Custom Theme save did not replace the first complete theme.';
    end if;
end;
$$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"email":"free@example.test"}',true);

do $$
begin
    begin
        perform public.save_worth_it_custom_theme(
          '{"name":"Free Theme","primary":"#112233","secondary":"#223344","hover":"#334455","header":"#445566","background":"#010203"}'::jsonb
        );
        raise exception 'A free account unexpectedly saved a Custom Theme.';
    exception
        when insufficient_privilege then
            null;
    end;
end;
$$;

rollback;
