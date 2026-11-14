begin;

-- V2 formulas are evaluated only by the server. The public detail RPC keeps
-- returning the typed schema and presentation metadata, but redacts formula
-- expressions for non-owners. V1 detail responses remain byte-for-byte shaped
-- as before, and owners retain formulas for editing their own calculators.
create or replace function public.get_worth_it_ugc_calculator(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_result jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;

    select jsonb_build_object(
        'id', c.id,
        'calculator_number', c.calculator_number,
        'title', c.title,
        'description', c.description,
        'category', c.category,
        'subcategories', c.subcategories,
        'visibility', c.visibility,
        'spec', case
            when c.owner_user_id = v_user_id
              or c.spec->>'schemaVersion' is distinct from '2'
              or c.spec->>'engineVersion' is distinct from '2'
                then c.spec
            else jsonb_set(
                c.spec,
                '{results}',
                (
                    select coalesce(
                        jsonb_agg(result_item - 'expression' order by result_row.ordinality),
                        '[]'::jsonb
                    )
                    from jsonb_array_elements(c.spec->'results')
                         with ordinality as result_row(result_item, ordinality)
                ),
                true
            )
        end,
        'usage_price_milli', c.usage_price_milli,
        'status', c.status,
        'is_owner', (c.owner_user_id = v_user_id),
        'owner_worth_it_id', p.worth_it_id,
        'owner_username', p.username,
        'owner_display_name', p.display_name,
        'owner_avatar_url', p.avatar_url,
        'created_at', c.created_at,
        'published_at', c.published_at,
        'views', (select count(*) from private.worth_it_calculator_views v where v.calculator_id = c.id),
        'likes', (select count(*) from private.worth_it_calculator_reactions r where r.calculator_id = c.id and r.reaction = 'like'),
        'dislikes', (select count(*) from private.worth_it_calculator_reactions r where r.calculator_id = c.id and r.reaction = 'dislike'),
        'favorites', (select count(*) from public.worth_it_calculator_favorites f where f.calculator_key = 'ugc:' || c.id::text),
        'is_favorite', exists (
            select 1 from public.worth_it_calculator_favorites f
             where f.user_id = v_user_id and f.calculator_key = 'ugc:' || c.id::text
        ),
        'my_reaction', (
            select r.reaction from private.worth_it_calculator_reactions r
             where r.calculator_id = c.id and r.user_id = v_user_id
        )
    )
      into v_result
      from private.worth_it_user_calculators c
      join public.worth_it_profiles p on p.user_id = c.owner_user_id
     where c.id = p_id
       and (c.owner_user_id = v_user_id or (c.status = 'published' and c.visibility = 'public'));

    if v_result is null then
        raise exception 'Calculator not found.' using errcode = 'P0002';
    end if;
    return v_result;
end;
$$;

-- Only the server runtime endpoint uses this function, with a user ID that it
-- has independently verified against Supabase Auth. A caller cannot invoke it
-- with anon/authenticated credentials or retrieve a private calculator by ID.
create or replace function public.get_worth_it_ugc_runtime_spec(
    p_id uuid,
    p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_spec jsonb;
    v_usage_price_milli integer;
begin
    if p_id is null or p_user_id is null
       or not exists (select 1 from auth.users u where u.id = p_user_id) then
        raise exception 'Authenticated calculator access is required.' using errcode = '28000';
    end if;

    select c.spec, c.usage_price_milli
      into v_spec, v_usage_price_milli
      from private.worth_it_user_calculators c
     where c.id = p_id
       and (c.owner_user_id = p_user_id or (c.status = 'published' and c.visibility = 'public'));

    if v_spec is null then
        raise exception 'Calculator not found or not available to this account.' using errcode = 'P0002';
    end if;

    if v_spec->>'schemaVersion' is distinct from '2'
       or v_spec->>'engineVersion' is distinct from '2' then
        raise exception 'Server runtime is available only for exact V2 typed calculators.' using errcode = '22023';
    end if;

    return jsonb_build_object(
        'spec', v_spec,
        'usage_price_milli', v_usage_price_milli
    );
end;
$$;

revoke all on function public.get_worth_it_ugc_runtime_spec(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.get_worth_it_ugc_runtime_spec(uuid, uuid)
    to service_role;

comment on function public.get_worth_it_ugc_runtime_spec(uuid, uuid) is
    'Server-only V2 runtime lookup. The API must verify the user JWT before passing p_user_id; formulas are never returned by the public member detail RPC to non-owners.';

notify pgrst, 'reload schema';

commit;
