-- PR #194: persist the fourth custom theme colour for the surface behind header controls.
begin;
alter table public.worth_it_user_themes
    add column if not exists header_color text not null default '#0B1120';
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname='worth_it_user_themes_header_color_check'
          and conrelid='public.worth_it_user_themes'::regclass
    ) then
        alter table public.worth_it_user_themes
            add constraint worth_it_user_themes_header_color_check
            check (header_color ~ '^#[0-9A-Fa-f]{6}$');
    end if;
end
$$;
commit;
