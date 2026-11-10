-- Keep the owner-controlled rating policy private to the calculator owner.
-- The public detail endpoint intentionally omits both the policy value and usage marker for other members.
begin;

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
        'spec', c.spec,
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
    ) ||
    case when c.owner_user_id = v_user_id then
        jsonb_build_object('require_test_before_reaction', c.require_test_before_reaction)
    else
        '{}'::jsonb
    end
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

commit;
