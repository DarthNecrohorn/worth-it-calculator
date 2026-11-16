-- Return complete public UGC calculator card data for profile favourites.
-- Keeps the profile visibility gate and only exposes published, public calculators.
create or replace function public.get_worth_it_profile_favorite_calculators(p_worth_it_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid;
    v_visibility text;
    v_result jsonb;
begin
    if auth.uid() is null then
        raise exception 'Sign in required.' using errcode='28000';
    end if;

    select user_id
      into v_user_id
      from public.worth_it_profiles
     where worth_it_id=p_worth_it_id;

    if v_user_id is null then
        return '[]'::jsonb;
    end if;

    if v_user_id<>auth.uid() then
        select profile_visibility
          into v_visibility
          from public.worth_it_user_preferences
         where user_id=v_user_id;

        if coalesce(v_visibility,'public')='private' then
            return '[]'::jsonb;
        end if;

        if v_visibility='friends' and not exists(
            select 1
              from public.worth_it_friends f
             where (f.user_low_id=auth.uid() and f.user_high_id=v_user_id)
                or (f.user_high_id=auth.uid() and f.user_low_id=v_user_id)
        ) then
            return '[]'::jsonb;
        end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,
        'calculator_number',c.calculator_number,
        'title',c.title,
        'description',c.description,
        'category',c.category,
        'subcategories',to_jsonb(c.subcategories),
        'owner_worth_it_id',p.worth_it_id,
        'owner_display_name',p.display_name,
        'owner_username',p.username,
        'views',(
            select count(*)
              from private.worth_it_calculator_views v
             where v.calculator_id=c.id
        ),
        'likes',(
            select count(*)
              from private.worth_it_calculator_reactions r
             where r.calculator_id=c.id and r.reaction='like'
        ),
        'favorites',(
            select count(*)
              from public.worth_it_calculator_favorites f2
             where f2.calculator_key='ugc:'||c.id::text
        ),
        'dislikes',(
            select count(*)
              from private.worth_it_calculator_reactions r
             where r.calculator_id=c.id and r.reaction='dislike'
        )
    ) order by f.created_at desc),'[]'::jsonb)
      into v_result
      from public.worth_it_calculator_favorites f
      join private.worth_it_user_calculators c
        on f.calculator_key='ugc:'||c.id::text
       and c.status='published'
       and c.visibility='public'
      join public.worth_it_profiles p
        on p.user_id=c.owner_user_id
     where f.user_id=v_user_id
       and f.calculator_key like 'ugc:%';

    return coalesce(v_result,'[]'::jsonb);
end;
$$;

revoke all on function public.get_worth_it_profile_favorite_calculators(bigint) from public,anon;
grant execute on function public.get_worth_it_profile_favorite_calculators(bigint) to authenticated;
