-- Private, profile-safe creator leaderboards for public community calculators.
-- The selected period affects activity and growth metrics; current followers remain lifetime totals.
begin;

create index if not exists worth_it_follows_followed_created_idx
    on public.worth_it_follows(followed_user_id,created_at desc);

create index if not exists worth_it_calculator_favorites_key_created_idx
    on public.worth_it_calculator_favorites(calculator_key,created_at desc);

create or replace function public.get_worth_it_creator_leaderboards(
    p_period text default '7d',
    p_top_sort text default 'overall',
    p_rising_sort text default 'growth',
    p_member_sort text default 'followers'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_period text := lower(coalesce(p_period,'7d'));
    v_top_sort text := lower(coalesce(p_top_sort,'overall'));
    v_rising_sort text := lower(coalesce(p_rising_sort,'growth'));
    v_member_sort text := lower(coalesce(p_member_sort,'followers'));
    v_cutoff timestamptz;
    v_result jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode='28000';
    end if;

    if v_period not in ('7d','30d','6m','12m','3y','5y','10y') then
        v_period:='7d';
    end if;
    if v_top_sort not in ('overall','followers','likes','favorites','views','engagement') then
        v_top_sort:='overall';
    end if;
    if v_rising_sort not in ('growth','engagement','new','breakout','consistent') then
        v_rising_sort:='growth';
    end if;

    if v_member_sort not in ('followers','growth','new','following','connected') then
        v_member_sort:='followers';
    end if;

    v_cutoff:=case v_period
        when '7d' then now()-interval '7 days'
        when '30d' then now()-interval '30 days'
        when '6m' then now()-interval '6 months'
        when '12m' then now()-interval '12 months'
        when '3y' then now()-interval '3 years'
        when '5y' then now()-interval '5 years'
        when '10y' then now()-interval '10 years'
    end;

    with public_calculators as (
        select c.id,c.owner_user_id,coalesce(c.published_at,c.created_at) as published_at
          from private.worth_it_user_calculators c
         where c.status='published'
           and c.visibility='public'
    ),
    visible_creators as (
        select p.user_id,p.worth_it_id,p.username,p.display_name,p.avatar_url,
               count(c.id)::integer as public_calculators,
               min(c.published_at) as first_publication_at
          from public.worth_it_profiles p
          join public_calculators c on c.owner_user_id=p.user_id
          left join public.worth_it_user_preferences pref on pref.user_id=p.user_id
         where coalesce(pref.profile_visibility,'public')='public'
         group by p.user_id,p.worth_it_id,p.username,p.display_name,p.avatar_url
    ),
    follower_stats as (
        select f.followed_user_id as user_id,
               count(*)::integer as current_followers,
               count(*) filter(where f.created_at>=v_cutoff)::integer as period_followers
          from public.worth_it_follows f
         group by f.followed_user_id
    ),
    reaction_stats as (
        select c.owner_user_id as user_id,
               count(*) filter(where r.reaction='like')::integer as total_likes,
               count(*) filter(where r.reaction='like' and r.created_at>=v_cutoff)::integer as period_likes,
               count(*) filter(where r.reaction='dislike')::integer as total_dislikes,
               count(*) filter(where r.reaction='dislike' and r.created_at>=v_cutoff)::integer as period_dislikes
          from public_calculators c
          join private.worth_it_calculator_reactions r on r.calculator_id=c.id
         group by c.owner_user_id
    ),
    favorite_stats as (
        select c.owner_user_id as user_id,
               count(*)::integer as total_favorites,
               count(*) filter(where f.created_at>=v_cutoff)::integer as period_favorites
          from public_calculators c
          join public.worth_it_calculator_favorites f
            on f.calculator_key='ugc:'||c.id::text
         group by c.owner_user_id
    ),
    view_stats as (
        select c.owner_user_id as user_id,
               count(*)::integer as total_views,
               count(*) filter(where v.created_at>=v_cutoff)::integer as period_views
          from public_calculators c
          join private.worth_it_calculator_views v on v.calculator_id=c.id
         group by c.owner_user_id
    ),
    following_stats as (
        select f.follower_user_id as user_id,count(*)::integer as current_following
          from public.worth_it_follows f
         group by f.follower_user_id
    ),
    member_rows as (
        select p.user_id,p.worth_it_id,p.username,p.display_name,p.avatar_url,p.created_at,
               coalesce(f.current_followers,0) as current_followers,
               coalesce(f.period_followers,0) as period_followers,
               coalesce(g.current_following,0) as current_following
          from public.worth_it_profiles p
          left join public.worth_it_user_preferences pref on pref.user_id=p.user_id
          left join follower_stats f on f.user_id=p.user_id
          left join following_stats g on g.user_id=p.user_id
         where coalesce(pref.profile_visibility,'public')='public'
           and not exists(select 1 from public_calculators c where c.owner_user_id=p.user_id)
    ),
    activity_events as (
        select c.owner_user_id as user_id,c.published_at as occurred_at
          from public_calculators c
         where c.published_at>=v_cutoff
        union all
        select f.followed_user_id,f.created_at
          from public.worth_it_follows f
         where f.created_at>=v_cutoff
        union all
        select c.owner_user_id,r.created_at
          from public_calculators c
          join private.worth_it_calculator_reactions r on r.calculator_id=c.id
         where r.created_at>=v_cutoff
        union all
        select c.owner_user_id,f.created_at
          from public_calculators c
          join public.worth_it_calculator_favorites f
            on f.calculator_key='ugc:'||c.id::text
         where f.created_at>=v_cutoff
        union all
        select c.owner_user_id,v.created_at
          from public_calculators c
          join private.worth_it_calculator_views v on v.calculator_id=c.id
         where v.created_at>=v_cutoff
    ),
    activity_stats as (
        select e.user_id,count(distinct date_trunc('week',e.occurred_at))::integer as active_weeks
          from activity_events e
         group by e.user_id
    ),
    metrics as (
        select c.user_id,c.worth_it_id,c.username,c.display_name,c.avatar_url,
               c.public_calculators,c.first_publication_at,
               coalesce(f.current_followers,0) as current_followers,
               coalesce(f.period_followers,0) as period_followers,
               coalesce(r.total_likes,0) as total_likes,
               coalesce(r.period_likes,0) as period_likes,
               coalesce(r.total_dislikes,0) as total_dislikes,
               coalesce(r.period_dislikes,0) as period_dislikes,
               case when coalesce(r.period_likes,0)+coalesce(r.period_dislikes,0)>0
                    then coalesce(r.period_likes,0)::numeric/
                         (coalesce(r.period_likes,0)+coalesce(r.period_dislikes,0))
                    else 0.5::numeric end as reaction_quality,
               coalesce(fav.total_favorites,0) as total_favorites,
               coalesce(fav.period_favorites,0) as period_favorites,
               coalesce(v.total_views,0) as total_views,
               coalesce(v.period_views,0) as period_views,
               coalesce(a.active_weeks,0) as active_weeks,
               coalesce(r.period_likes,0)+coalesce(fav.period_favorites,0)
                   +coalesce(v.period_views,0)+coalesce(f.period_followers,0) as period_engagement,
               case when coalesce(v.period_views,0)>0
                    then round(100.0*(coalesce(r.period_likes,0)+coalesce(fav.period_favorites,0))
                                    /v.period_views,1)
                    else 0::numeric end as engagement_rate
          from visible_creators c
          left join follower_stats f on f.user_id=c.user_id
          left join reaction_stats r on r.user_id=c.user_id
          left join favorite_stats fav on fav.user_id=c.user_id
          left join view_stats v on v.user_id=c.user_id
          left join activity_stats a on a.user_id=c.user_id
    ),
    ranked as (
        select m.*,
               (
                 percent_rank() over(order by current_followers)*0.25
                 +percent_rank() over(order by period_likes)*0.20
                 +percent_rank() over(order by period_favorites)*0.15
                 +percent_rank() over(order by period_views)*0.15
                 +percent_rank() over(order by period_followers)*0.10
                 +percent_rank() over(order by engagement_rate)*0.10
                 +percent_rank() over(order by reaction_quality)*0.05
               ) as overall_score,
               (
                 percent_rank() over(order by period_followers)*0.55
                 +percent_rank() over(order by period_engagement)*0.45
               ) as breakout_score
          from metrics m
    ),
    top_rows as (
        select * from ranked
         order by
           case when v_top_sort='overall' then overall_score end desc,
           case when v_top_sort='followers' then current_followers end desc,
           case when v_top_sort='likes' then period_likes end desc,
           case when v_top_sort='favorites' then period_favorites end desc,
           case when v_top_sort='views' then period_views end desc,
           case when v_top_sort='engagement' then engagement_rate end desc,
           period_engagement desc,current_followers desc,worth_it_id
         limit 100
    ),
    member_top_rows as (
        select * from member_rows
         where v_member_sort<>'new' or created_at>=v_cutoff
         order by
           case when v_member_sort='followers' then current_followers end desc,
           case when v_member_sort='growth' then period_followers end desc,
           case when v_member_sort='new' then extract(epoch from created_at) end desc,
           case when v_member_sort='following' then current_following end desc,
           case when v_member_sort='connected' then current_followers+current_following end desc,
           current_followers desc,period_followers desc,created_at desc,worth_it_id
         limit 100
    ),
    rising_rows as (
        select * from ranked
         where case when v_rising_sort='new'
                    then first_publication_at>=v_cutoff
                    else period_followers>0 or period_engagement>0 end
         order by
           case when v_rising_sort='growth' then period_followers end desc,
           case when v_rising_sort='engagement' then period_engagement end desc,
           case when v_rising_sort='breakout' then breakout_score end desc,
           case when v_rising_sort='consistent' then active_weeks end desc,
           case when v_rising_sort='new' then extract(epoch from first_publication_at) end desc,
           period_engagement desc,period_followers desc,current_followers desc,worth_it_id
         limit 100
    )
    select jsonb_build_object(
        'period',v_period,
        'top_sort',v_top_sort,
        'rising_sort',v_rising_sort,
        'member_sort',v_member_sort,
        'top_creators',coalesce((
            select jsonb_agg(jsonb_build_object(
                'worth_it_id',worth_it_id,'username',username,'display_name',display_name,'avatar_url',avatar_url,
                'public_calculators',public_calculators,'first_publication_at',first_publication_at,
                'followers',current_followers,'period_followers',period_followers,
                'likes',period_likes,'total_likes',total_likes,
                'dislikes',period_dislikes,'total_dislikes',total_dislikes,'reaction_quality',reaction_quality,
                'favorites',period_favorites,'total_favorites',total_favorites,
                'views',period_views,'total_views',total_views,
                'engagement',period_engagement,'engagement_rate',engagement_rate,
                'active_weeks',active_weeks,'overall_score',round(overall_score::numeric,4)
            ) order by
                case when v_top_sort='overall' then overall_score end desc,
                case when v_top_sort='followers' then current_followers end desc,
                case when v_top_sort='likes' then period_likes end desc,
                case when v_top_sort='favorites' then period_favorites end desc,
                case when v_top_sort='views' then period_views end desc,
                case when v_top_sort='engagement' then engagement_rate end desc,
                period_engagement desc,current_followers desc,worth_it_id)
              from top_rows
        ),'[]'::jsonb),
        'community_members',coalesce((
            select jsonb_agg(jsonb_build_object(
                'worth_it_id',worth_it_id,'username',username,'display_name',display_name,'avatar_url',avatar_url,
                'created_at',created_at,'followers',current_followers,'period_followers',period_followers,
                'following',current_following,'connections',current_followers+current_following
            ) order by
                case when v_member_sort='followers' then current_followers end desc,
                case when v_member_sort='growth' then period_followers end desc,
                case when v_member_sort='new' then extract(epoch from created_at) end desc,
                case when v_member_sort='following' then current_following end desc,
                case when v_member_sort='connected' then current_followers+current_following end desc,
                current_followers desc,period_followers desc,created_at desc,worth_it_id)
              from member_top_rows
        ),'[]'::jsonb),
        'rising_creators',coalesce((
            select jsonb_agg(jsonb_build_object(
                'worth_it_id',worth_it_id,'username',username,'display_name',display_name,'avatar_url',avatar_url,
                'public_calculators',public_calculators,'first_publication_at',first_publication_at,
                'followers',current_followers,'period_followers',period_followers,
                'likes',period_likes,'favorites',period_favorites,'views',period_views,
                'engagement',period_engagement,'engagement_rate',engagement_rate,
                'active_weeks',active_weeks,'breakout_score',round(breakout_score::numeric,4)
            ) order by
                case when v_rising_sort='growth' then period_followers end desc,
                case when v_rising_sort='engagement' then period_engagement end desc,
                case when v_rising_sort='breakout' then breakout_score end desc,
                case when v_rising_sort='consistent' then active_weeks end desc,
                case when v_rising_sort='new' then extract(epoch from first_publication_at) end desc,
                period_engagement desc,period_followers desc,current_followers desc,worth_it_id)
              from rising_rows
        ),'[]'::jsonb)
    ) into v_result;

    return v_result;
end;
$$;

revoke all on function public.get_worth_it_creator_leaderboards(text,text,text,text) from public,anon;
grant execute on function public.get_worth_it_creator_leaderboards(text,text,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
