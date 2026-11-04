-- PR #194: server-side 30-item UGC pagination with category-aware page state.
begin;

create or replace function public.get_worth_it_ugc_catalog_page(
    p_sort text default 'latest',
    p_period text default '12y',
    p_search text default '',
    p_category text default 'all',
    p_page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_sort text := lower(coalesce(p_sort,'latest'));
    v_period text := lower(coalesce(p_period,'12y'));
    v_category text := lower(coalesce(p_category,'all'));
    v_search text := left(btrim(coalesce(p_search,'')),80);
    v_cutoff timestamptz;
    v_page integer := greatest(1,least(10000,coalesce(p_page,1)));
    v_page_size integer := 30;
    v_total integer := 0;
    v_total_pages integer := 1;
    v_offset integer;
    v_items jsonb := '[]'::jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign in required to browse community calculators.' using errcode='28000';
    end if;

    if v_sort not in ('latest','popular','liked','favorited','disliked','mine','my-favorites') then
        v_sort := 'latest';
    end if;
    if v_category not in ('all','cars','money','technology','home','other') then
        v_category := 'all';
    end if;

    v_cutoff := case v_period
        when 'today' then date_trunc('day',now())
        when '7d' then now()-interval '7 days'
        when '14d' then now()-interval '14 days'
        when '1m' then now()-interval '1 month'
        when '3m' then now()-interval '3 months'
        when '6m' then now()-interval '6 months'
        when '12m' then now()-interval '12 months'
        when '3y' then now()-interval '3 years'
        when '6y' then now()-interval '6 years'
        else now()-interval '12 years'
    end;

    if v_sort='mine' then
        select count(*)::integer into v_total
          from private.worth_it_user_calculators c
         where c.owner_user_id=v_user_id
           and (v_category='all' or c.category=v_category)
           and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%');

        v_total_pages := greatest(1,ceil(v_total::numeric/v_page_size)::integer);
        v_page := least(v_page,v_total_pages);
        v_offset := (v_page-1)*v_page_size;

        select coalesce(jsonb_agg(jsonb_build_object(
            'id',q.id,'calculator_number',q.calculator_number,'title',q.title,'description',q.description,
            'category',q.category,'status',q.status,'spec',q.spec,'created_at',q.created_at,
            'updated_at',q.updated_at,'published_at',q.published_at,
            'owner_worth_it_id',q.worth_it_id,'owner_username',q.username,
            'owner_display_name',q.display_name,'owner_avatar_url',q.avatar_url,
            'views',q.views,'likes',q.likes,'dislikes',q.dislikes,'favorites',q.favorites,
            'is_owner',true,'is_favorite',false,'my_reaction',null
        ) order by q.updated_at desc,q.id),'[]'::jsonb)
          into v_items
          from (
            select c.*,p.worth_it_id,p.username,p.display_name,p.avatar_url,
                (select count(*)::integer from private.worth_it_calculator_views v where v.calculator_id=c.id) as views,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='like') as likes,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='dislike') as dislikes,
                (select count(*)::integer from public.worth_it_calculator_favorites f where f.calculator_key='ugc:'||c.id::text) as favorites
              from private.worth_it_user_calculators c
              join public.worth_it_profiles p on p.user_id=c.owner_user_id
             where c.owner_user_id=v_user_id
               and (v_category='all' or c.category=v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
             order by c.updated_at desc,c.id
             limit v_page_size offset v_offset
          ) q;

    elsif v_sort='my-favorites' then
        select count(*)::integer into v_total
          from public.worth_it_calculator_favorites f
          join private.worth_it_user_calculators c
            on f.calculator_key='ugc:'||c.id::text and c.status='published'
         where f.user_id=v_user_id
           and (v_category='all' or c.category=v_category)
           and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%');

        v_total_pages := greatest(1,ceil(v_total::numeric/v_page_size)::integer);
        v_page := least(v_page,v_total_pages);
        v_offset := (v_page-1)*v_page_size;

        select coalesce(jsonb_agg(jsonb_build_object(
            'id',q.id,'calculator_number',q.calculator_number,'title',q.title,'description',q.description,
            'category',q.category,'status',q.status,'spec',q.spec,'created_at',q.created_at,
            'updated_at',q.updated_at,'published_at',q.published_at,
            'owner_worth_it_id',q.worth_it_id,'owner_username',q.username,
            'owner_display_name',q.display_name,'owner_avatar_url',q.avatar_url,
            'views',q.views,'likes',q.likes,'dislikes',q.dislikes,'favorites',q.favorites,
            'is_owner',(q.owner_user_id=v_user_id),'is_favorite',true,'my_reaction',q.my_reaction
        ) order by q.favourited_at desc,q.id),'[]'::jsonb)
          into v_items
          from (
            select c.*,p.worth_it_id,p.username,p.display_name,p.avatar_url,f.created_at as favourited_at,
                (select count(*)::integer from private.worth_it_calculator_views v where v.calculator_id=c.id) as views,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='like') as likes,
                (select count(*)::integer from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.reaction='dislike') as dislikes,
                (select count(*)::integer from public.worth_it_calculator_favorites f2 where f2.calculator_key='ugc:'||c.id::text) as favorites,
                (select r.reaction from private.worth_it_calculator_reactions r where r.calculator_id=c.id and r.user_id=v_user_id) as my_reaction
              from public.worth_it_calculator_favorites f
              join private.worth_it_user_calculators c
                on f.calculator_key='ugc:'||c.id::text and c.status='published'
              join public.worth_it_profiles p on p.user_id=c.owner_user_id
             where f.user_id=v_user_id
               and (v_category='all' or c.category=v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
             order by f.created_at desc,c.id
             limit v_page_size offset v_offset
          ) q;

    else
        with ranked as (
            select c.id,c.calculator_number,c.title,c.description,c.category,c.status,c.spec,c.owner_user_id,
                   c.created_at,c.updated_at,c.published_at,
                   p.worth_it_id,p.username,p.display_name,p.avatar_url,
                   (select count(*)::integer from private.worth_it_calculator_views v
                     where v.calculator_id=c.id and v.created_at>=v_cutoff) as views,
                   (select count(*)::integer from private.worth_it_calculator_reactions r
                     where r.calculator_id=c.id and r.reaction='like' and r.created_at>=v_cutoff) as likes,
                   (select count(*)::integer from private.worth_it_calculator_reactions r
                     where r.calculator_id=c.id and r.reaction='dislike' and r.created_at>=v_cutoff) as dislikes,
                   (select count(*)::integer from public.worth_it_calculator_favorites f
                     where f.calculator_key='ugc:'||c.id::text and f.created_at>=v_cutoff) as favorites,
                   exists(select 1 from public.worth_it_calculator_favorites f
                     where f.user_id=v_user_id and f.calculator_key='ugc:'||c.id::text) as is_favorite,
                   (select r.reaction from private.worth_it_calculator_reactions r
                     where r.calculator_id=c.id and r.user_id=v_user_id) as my_reaction
              from private.worth_it_user_calculators c
              join public.worth_it_profiles p on p.user_id=c.owner_user_id
             where c.status='published'
               and (v_category='all' or c.category=v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
               and (v_sort<>'latest' or c.published_at>=v_cutoff)
        )
        select count(*)::integer into v_total from ranked;

        v_total_pages := greatest(1,ceil(v_total::numeric/v_page_size)::integer);
        v_page := least(v_page,v_total_pages);
        v_offset := (v_page-1)*v_page_size;

        with ranked as (
            select c.id,c.calculator_number,c.title,c.description,c.category,c.status,c.spec,c.owner_user_id,
                   c.created_at,c.updated_at,c.published_at,
                   p.worth_it_id,p.username,p.display_name,p.avatar_url,
                   (select count(*)::integer from private.worth_it_calculator_views v
                     where v.calculator_id=c.id and v.created_at>=v_cutoff) as views,
                   (select count(*)::integer from private.worth_it_calculator_reactions r
                     where r.calculator_id=c.id and r.reaction='like' and r.created_at>=v_cutoff) as likes,
                   (select count(*)::integer from private.worth_it_calculator_reactions r
                     where r.calculator_id=c.id and r.reaction='dislike' and r.created_at>=v_cutoff) as dislikes,
                   (select count(*)::integer from public.worth_it_calculator_favorites f
                     where f.calculator_key='ugc:'||c.id::text and f.created_at>=v_cutoff) as favorites,
                   exists(select 1 from public.worth_it_calculator_favorites f
                     where f.user_id=v_user_id and f.calculator_key='ugc:'||c.id::text) as is_favorite,
                   (select r.reaction from private.worth_it_calculator_reactions r
                     where r.calculator_id=c.id and r.user_id=v_user_id) as my_reaction
              from private.worth_it_user_calculators c
              join public.worth_it_profiles p on p.user_id=c.owner_user_id
             where c.status='published'
               and (v_category='all' or c.category=v_category)
               and (v_search='' or c.title ilike '%'||v_search||'%' or c.description ilike '%'||v_search||'%')
               and (v_sort<>'latest' or c.published_at>=v_cutoff)
        ), page_rows as (
            select * from ranked
             order by
               case when v_sort='popular' then views end desc,
               case when v_sort='liked' then likes end desc,
               case when v_sort='favorited' then favorites end desc,
               case when v_sort='disliked' then dislikes end desc,
               published_at desc,id
             limit v_page_size offset v_offset
        )
        select coalesce(jsonb_agg(jsonb_build_object(
            'id',id,'calculator_number',calculator_number,'title',title,'description',description,
            'category',category,'status',status,'spec',spec,'created_at',created_at,'updated_at',updated_at,
            'published_at',published_at,'owner_worth_it_id',worth_it_id,'owner_username',username,
            'owner_display_name',display_name,'owner_avatar_url',avatar_url,
            'views',views,'likes',likes,'dislikes',dislikes,'favorites',favorites,
            'is_owner',(owner_user_id=v_user_id),'is_favorite',is_favorite,'my_reaction',my_reaction
        ) order by
            case when v_sort='popular' then views end desc,
            case when v_sort='liked' then likes end desc,
            case when v_sort='favorited' then favorites end desc,
            case when v_sort='disliked' then dislikes end desc,
            published_at desc,id),'[]'::jsonb)
          into v_items from page_rows;
    end if;

    return jsonb_build_object(
        'items',coalesce(v_items,'[]'::jsonb),
        'total_count',v_total,
        'page',v_page,
        'page_size',v_page_size,
        'total_pages',v_total_pages,
        'category',v_category,
        'sort',v_sort
    );
end;
$$;

revoke all on function public.get_worth_it_ugc_catalog_page(text,text,text,text,integer) from public,anon;
grant execute on function public.get_worth_it_ugc_catalog_page(text,text,text,text,integer) to authenticated;

commit;
