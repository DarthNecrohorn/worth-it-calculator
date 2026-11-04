-- PR #194: separate hover-border/glow colour for account custom themes.
begin;
alter table public.worth_it_user_themes
    add column if not exists hover_color text not null default '#8B5CF6';
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname='worth_it_user_themes_hover_color_check'
          and conrelid='public.worth_it_user_themes'::regclass
    ) then
        alter table public.worth_it_user_themes
            add constraint worth_it_user_themes_hover_color_check
            check (hover_color ~ '^#[0-9A-Fa-f]{6}$');
    end if;
end
$$;
commit;
