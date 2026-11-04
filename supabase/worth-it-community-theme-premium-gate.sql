-- Enforce Premium-only Custom Theme persistence at the database boundary.
-- Apply after calc-economy.sql and after worth_it_user_themes exists.
begin;

create schema if not exists private;

create or replace function private.worth_it_can_save_custom_theme()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select (select auth.uid()) is not null
       and (
           lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'pedjasebez3545@gmail.com'
           or exists (
               select 1
               from private.worth_it_calc_wallets as wallet
               where wallet.user_id = (select auth.uid())
                 and wallet.premium_plan in ('premium_lite', 'premium')
                 and wallet.premium_expires_at > pg_catalog.now()
           )
       );
$$;

-- The helper is intentionally in the non-exposed private schema. It only
-- reports whether the current caller may save a theme and accepts no user ID.
revoke all on function private.worth_it_can_save_custom_theme() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.worth_it_can_save_custom_theme() to authenticated;

drop policy if exists "Users can create their own custom theme"
    on public.worth_it_user_themes;
create policy "Users can create their own custom theme"
    on public.worth_it_user_themes
    for insert
    to authenticated
    with check (
        (select auth.uid()) = user_id
        and (select private.worth_it_can_save_custom_theme())
    );

drop policy if exists "Users can update their own custom theme"
    on public.worth_it_user_themes;
create policy "Users can update their own custom theme"
    on public.worth_it_user_themes
    for update
    to authenticated
    using (
        (select auth.uid()) = user_id
        and (select private.worth_it_can_save_custom_theme())
    )
    with check (
        (select auth.uid()) = user_id
        and (select private.worth_it_can_save_custom_theme())
    );

commit;
