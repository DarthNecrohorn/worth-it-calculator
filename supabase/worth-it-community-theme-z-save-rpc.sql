-- Save Custom Themes through one authenticated, atomic upsert.
-- SECURITY INVOKER keeps the existing per-user RLS policies in force while the
-- private entitlement helper rechecks Premium access at the database boundary.
begin;

create or replace function public.save_worth_it_custom_theme(p_theme jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_name text;
    v_primary text;
    v_secondary text;
    v_hover text;
    v_header text;
    v_config jsonb;
    v_saved public.worth_it_user_themes%rowtype;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    if p_theme is null or pg_catalog.jsonb_typeof(p_theme) is distinct from 'object' then
        raise exception 'A Custom Theme object is required' using errcode = '22023';
    end if;

    if not private.worth_it_can_save_custom_theme() then
        raise exception 'Premium Lite or Premium access is required to save a Custom Theme' using errcode = '42501';
    end if;

    v_name := pg_catalog.left(pg_catalog.btrim(coalesce(p_theme ->> 'name', 'My theme')), 24);
    v_primary := pg_catalog.upper(coalesce(p_theme ->> 'primary', ''));
    v_secondary := pg_catalog.upper(coalesce(p_theme ->> 'secondary', ''));
    v_hover := pg_catalog.upper(coalesce(p_theme ->> 'hover', ''));
    v_header := pg_catalog.upper(coalesce(p_theme ->> 'header', ''));
    v_config := p_theme - 'name' - 'primary' - 'secondary' - 'hover' - 'header';

    if v_name = '' then
        raise exception 'Theme name cannot be empty' using errcode = '22023';
    end if;
    if v_primary !~ '^#[0-9A-F]{6}$'
       or v_secondary !~ '^#[0-9A-F]{6}$'
       or v_hover !~ '^#[0-9A-F]{6}$'
       or v_header !~ '^#[0-9A-F]{6}$'
       or pg_catalog.jsonb_typeof(v_config) is distinct from 'object' then
        raise exception 'Custom Theme contains invalid colours or settings' using errcode = '22023';
    end if;

    insert into public.worth_it_user_themes(
        user_id, theme_name, primary_color, secondary_color, hover_color,
        header_color, theme_config, updated_at
    ) values (
        v_user_id, v_name, v_primary, v_secondary, v_hover,
        v_header, v_config, pg_catalog.now()
    )
    on conflict (user_id) do update set
        theme_name = excluded.theme_name,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        hover_color = excluded.hover_color,
        header_color = excluded.header_color,
        theme_config = excluded.theme_config,
        updated_at = excluded.updated_at
    returning * into v_saved;

    return pg_catalog.jsonb_build_object(
        'user_id', v_saved.user_id,
        'theme_name', v_saved.theme_name,
        'primary_color', v_saved.primary_color,
        'secondary_color', v_saved.secondary_color,
        'hover_color', v_saved.hover_color,
        'header_color', v_saved.header_color,
        'theme_config', v_saved.theme_config,
        'updated_at', v_saved.updated_at
    );
end;
$$;

revoke all on function public.save_worth_it_custom_theme(jsonb) from public, anon;
grant execute on function public.save_worth_it_custom_theme(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
