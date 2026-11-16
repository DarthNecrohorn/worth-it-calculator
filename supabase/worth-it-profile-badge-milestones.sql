-- Profile badge milestones: account age and calculator creation achievements.
-- Owners can see locked badges and equip only badges they have earned.
begin;

alter table private.worth_it_profile_badge_equips
    drop constraint if exists worth_it_profile_badge_equips_badge_key_check;
alter table private.worth_it_profile_badge_equips
    add constraint worth_it_profile_badge_equips_badge_key_check
    check (badge_key in (
        'owner','premium','premium_lite',
        'calculator_5','calculator_10',
        'member_1m','member_6m','member_12m',
        'member_2y','member_3y','member_5y','member_10y',
        -- Retain previously issued keys so existing equipped badges remain valid.
        'member_3m','member_4y'
    ));

create or replace function private.worth_it_badge_is_earned(p_user_id uuid,p_badge_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_email text;
    v_created_at timestamptz;
    v_plan text;
    v_expires_at timestamptz;
    v_calculator_count integer;
begin
    select lower(coalesce(u.email,'')),p.created_at,w.premium_plan,w.premium_expires_at
      into v_email,v_created_at,v_plan,v_expires_at
      from auth.users u
      join public.worth_it_profiles p on p.user_id=u.id
      left join private.worth_it_calc_wallets w on w.user_id=u.id
     where u.id=p_user_id;
    if not found then return false; end if;

    if p_badge_key='owner' then return v_email='pedjasebez3545@gmail.com'; end if;
    if p_badge_key='premium' then return v_plan='premium' and v_expires_at>now(); end if;
    if p_badge_key='premium_lite' then return v_plan='premium_lite' and v_expires_at>now(); end if;

    if p_badge_key in ('calculator_5','calculator_10') then
        select count(*)::integer into v_calculator_count
          from private.worth_it_user_calculators
         where owner_user_id=p_user_id;
        return case p_badge_key
            when 'calculator_5' then v_calculator_count>=5
            when 'calculator_10' then v_calculator_count>=10
            else false
        end;
    end if;

    return case p_badge_key
        when 'member_1m' then v_created_at <= now()-interval '1 month'
        when 'member_3m' then v_created_at <= now()-interval '3 months'
        when 'member_6m' then v_created_at <= now()-interval '6 months'
        when 'member_12m' then v_created_at <= now()-interval '12 months'
        when 'member_2y' then v_created_at <= now()-interval '2 years'
        when 'member_3y' then v_created_at <= now()-interval '3 years'
        when 'member_4y' then v_created_at <= now()-interval '4 years'
        when 'member_5y' then v_created_at <= now()-interval '5 years'
        when 'member_10y' then v_created_at <= now()-interval '10 years'
        else false
    end;
end;
$$;

create or replace function public.get_worth_it_profile_badges(p_worth_it_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid;
    v_self boolean;
    v_result jsonb;
begin
    if auth.uid() is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select user_id into v_user_id
      from public.worth_it_profiles
     where worth_it_id=p_worth_it_id;
    if v_user_id is null then return jsonb_build_object('badges','[]'::jsonb); end if;
    v_self := v_user_id=auth.uid();

    with badge_defs(badge_key,label,icon,description,sort_order) as (
        values
          ('owner','OWNER','◆','Reserved for the Worth It site owner. Permanent owner-only badge.',0),
          ('premium','PREMIUM','✧','Unlocked while an active Premium membership is in effect.',1),
          ('premium_lite','PREMIUM LITE','✦','Unlocked while an active Premium Lite membership is in effect.',2),
          ('calculator_5','5 CALCULATORS','▦','Create and save 5 community calculators. Drafts count.',3),
          ('calculator_10','10 CALCULATORS','▤','Create and save 10 community calculators. Drafts count.',4),
          ('member_1m','1 MONTH','◈','Reach 1 month as a Worth It member.',10),
          ('member_6m','6 MONTHS','✧','Reach 6 months as a Worth It member.',11),
          ('member_12m','1 YEAR','★','Reach 1 year as a Worth It member.',12),
          ('member_2y','2 YEARS','✺','Reach 2 years as a Worth It member.',13),
          ('member_3y','3 YEARS','❖','Reach 3 years as a Worth It member.',14),
          ('member_5y','5 YEARS','♛','Reach 5 years as a Worth It member.',15),
          ('member_10y','10 YEARS','✪','Reach 10 years as a Worth It member.',16)
    ), rows as (
        select d.*,
               private.worth_it_badge_is_earned(v_user_id,d.badge_key) as earned,
               exists(
                   select 1 from private.worth_it_profile_badge_equips e
                    where e.user_id=v_user_id and e.badge_key=d.badge_key
               ) as equipped
          from badge_defs d
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'key',badge_key,'label',label,'icon',icon,'description',description,
        'earned',earned,'equipped',equipped
    ) order by sort_order),'[]'::jsonb)
      into v_result
      from rows
     where v_self or (earned and equipped);

    return jsonb_build_object('badges',coalesce(v_result,'[]'::jsonb),'is_own_profile',v_self);
end;
$$;

create or replace function public.set_worth_it_profile_badge_equipped(p_badge_key text,p_equipped boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid:=auth.uid();
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if p_badge_key not in (
        'owner','premium','premium_lite','calculator_5','calculator_10',
        'member_1m','member_6m','member_12m','member_2y','member_3y','member_5y','member_10y'
    ) then raise exception 'Unknown badge.' using errcode='22023'; end if;
    if p_equipped then
        if not private.worth_it_badge_is_earned(v_user_id,p_badge_key) then
            raise exception 'This badge has not been unlocked for your account.' using errcode='42501';
        end if;
        insert into private.worth_it_profile_badge_equips(user_id,badge_key)
        values(v_user_id,p_badge_key) on conflict do nothing;
    else
        delete from private.worth_it_profile_badge_equips
         where user_id=v_user_id and badge_key=p_badge_key;
    end if;
    return jsonb_build_object('success',true,'badge_key',p_badge_key,'equipped',p_equipped);
end;
$$;

revoke all on function private.worth_it_badge_is_earned(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_worth_it_profile_badges(bigint) from public,anon;
revoke all on function public.set_worth_it_profile_badge_equipped(text,boolean) from public,anon;
grant execute on function public.get_worth_it_profile_badges(bigint) to authenticated;
grant execute on function public.set_worth_it_profile_badge_equipped(text,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
