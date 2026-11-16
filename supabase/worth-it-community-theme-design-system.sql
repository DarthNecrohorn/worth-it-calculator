-- PR #194: persist the extended Custom Theme design tokens.
begin;

alter table public.worth_it_user_themes
    add column if not exists theme_config jsonb not null default '{}'::jsonb;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname='worth_it_user_themes_theme_config_check'
          and conrelid='public.worth_it_user_themes'::regclass
    ) then
        alter table public.worth_it_user_themes
            add constraint worth_it_user_themes_theme_config_check
            check (jsonb_typeof(theme_config) = 'object');
    end if;
end
$$;

commit;
