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


-- Keep exactly one equipped badge per account. Preserve the most recently equipped
-- badge if an older database already contains multiple selections.
alter table private.worth_it_profile_badge_equips
    add column if not exists entitlement_expires_at timestamptz;

update private.worth_it_profile_badge_equips e
   set entitlement_expires_at=w.premium_expires_at
  from private.worth_it_calc_wallets w
 where w.user_id=e.user_id
   and e.badge_key in ('premium','premium_lite');

with ranked_equips as (
    select ctid,
           row_number() over (
               partition by user_id
               order by equipped_at desc,badge_key asc
           ) as row_number
      from private.worth_it_profile_badge_equips
)
delete from private.worth_it_profile_badge_equips e
 using ranked_equips r
 where e.ctid=r.ctid and r.row_number>1;

create unique index if not exists worth_it_profile_badge_equips_one_per_user_idx
    on private.worth_it_profile_badge_equips(user_id);

-- Keep a temporary badge selected only for the same uninterrupted subscription.
-- A same-tier renewal before expiry extends the equipped entitlement; a lapse,
-- tier change, or purchase after expiry removes it and requires a fresh equip.
create or replace function private.sync_worth_it_profile_premium_badge_entitlement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
    if tg_op='UPDATE'
       and old.premium_plan=new.premium_plan
       and old.premium_plan in ('premium','premium_lite')
       and old.premium_expires_at>now()
       and new.premium_expires_at>now() then
        update private.worth_it_profile_badge_equips
           set entitlement_expires_at=new.premium_expires_at
         where user_id=new.user_id
           and badge_key=new.premium_plan;
    else
        delete from private.worth_it_profile_badge_equips
         where user_id=new.user_id
           and badge_key in ('premium','premium_lite');
    end if;
    return new;
end;
$$;

revoke all on function private.sync_worth_it_profile_premium_badge_entitlement()
    from public,anon,authenticated,service_role;

drop trigger if exists worth_it_sync_profile_premium_badge_entitlement
    on private.worth_it_calc_wallets;
create trigger worth_it_sync_profile_premium_badge_entitlement
    after insert or update of premium_plan,premium_expires_at
    on private.worth_it_calc_wallets
    for each row
    execute function private.sync_worth_it_profile_premium_badge_entitlement();

create or replace function public.get_worth_it_profile_badges(p_worth_it_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid;
    v_self boolean;
    v_wallet_plan text;
    v_expires_at timestamptz;
    v_result jsonb;
begin
    if auth.uid() is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select user_id into v_user_id
      from public.worth_it_profiles
     where worth_it_id=p_worth_it_id;
    if v_user_id is null then return jsonb_build_object('badges','[]'::jsonb,'is_own_profile',false); end if;
    v_self := v_user_id=auth.uid();

    select premium_plan,premium_expires_at
      into v_wallet_plan,v_expires_at
      from private.worth_it_calc_wallets
     where user_id=v_user_id;

    -- Expired or superseded subscription badges must not silently reappear
    -- after a later purchase. The wallet trigger preserves valid pre-expiry renewals.
    delete from private.worth_it_profile_badge_equips e
     where e.user_id=v_user_id
       and e.badge_key in ('premium','premium_lite')
       and (
           not private.worth_it_badge_is_earned(v_user_id,e.badge_key)
           or e.entitlement_expires_at is distinct from v_expires_at
           or e.badge_key is distinct from v_wallet_plan
       );

    with badge_defs(badge_key,label,icon,description,how_to_get,badge_type,duration,sort_order) as (
        values
          ('owner','OWNER','◆','Reserved for the Worth It site owner.','Reserved for the Worth It site owner.','Permanent','Permanent once unlocked.',0),
          ('premium','PREMIUM','✧','Active Premium member.','Purchase an active Premium subscription in the Web Shop.','Temporary','Until the current Premium subscription expires.',1),
          ('premium_lite','PREMIUM LITE','✦','Active Premium Lite member.','Purchase Premium Lite in the Web Shop. Each purchase lasts 15 days.','Temporary','15 days per purchase.',2),
          ('calculator_5','5 CALCULATORS','▦','Created at least five community calculators.','Create and save 5 community calculators. Drafts count.','Permanent','Permanent once unlocked.',3),
          ('calculator_10','10 CALCULATORS','▤','Created at least ten community calculators.','Create and save 10 community calculators. Drafts count.','Permanent','Permanent once unlocked.',4),
          ('member_1m','1 MONTH','◈','Worth It member for at least one month.','Reach one month as a Worth It member.','Permanent','Permanent once unlocked.',10),
          ('member_6m','6 MONTHS','✧','Worth It member for at least six months.','Reach six months as a Worth It member.','Permanent','Permanent once unlocked.',11),
          ('member_12m','1 YEAR','★','Worth It member for at least one year.','Reach one year as a Worth It member.','Permanent','Permanent once unlocked.',12),
          ('member_2y','2 YEARS','✺','Worth It member for at least two years.','Reach two years as a Worth It member.','Permanent','Permanent once unlocked.',13),
          ('member_3y','3 YEARS','❖','Worth It member for at least three years.','Reach three years as a Worth It member.','Permanent','Permanent once unlocked.',14),
          ('member_5y','5 YEARS','♛','Worth It member for at least five years.','Reach five years as a Worth It member.','Permanent','Permanent once unlocked.',15),
          ('member_10y','10 YEARS','✪','Worth It member for at least ten years.','Reach ten years as a Worth It member.','Permanent','Permanent once unlocked.',16)
    ), rows as (
        select d.*,
               private.worth_it_badge_is_earned(v_user_id,d.badge_key) as earned,
               case
                   when d.badge_key='premium' and v_wallet_plan='premium' then v_expires_at
                   when d.badge_key='premium_lite' and v_wallet_plan='premium_lite' then v_expires_at
                   else null
               end as expires_at,
               (
                   private.worth_it_badge_is_earned(v_user_id,d.badge_key)
                   and exists(
                       select 1 from private.worth_it_profile_badge_equips e
                        where e.user_id=v_user_id and e.badge_key=d.badge_key
                   )
               ) as equipped
          from badge_defs d
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'key',badge_key,
        'label',label,
        'icon',icon,
        'description',description,
        'how_to_get',how_to_get,
        'type',badge_type,
        'duration',duration,
        'expires_at',expires_at,
        'earned',earned,
        'equipped',equipped
    ) order by sort_order),'[]'::jsonb)
      into v_result
      from rows;

    return jsonb_build_object('badges',coalesce(v_result,'[]'::jsonb),'is_own_profile',v_self);
end;
$$;

create or replace function public.set_worth_it_profile_badge_equipped(p_badge_key text,p_equipped boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid:=auth.uid();
    v_expires_at timestamptz;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if p_equipped is null then raise exception 'Choose whether to equip or unequip this badge.' using errcode='22023'; end if;
    if p_badge_key not in (
        'owner','premium','premium_lite','calculator_5','calculator_10',
        'member_1m','member_6m','member_12m','member_2y','member_3y','member_5y','member_10y'
    ) then raise exception 'Unknown badge.' using errcode='22023'; end if;

    -- Serialize simultaneous equip requests for this account; the unique index
    -- remains the database-level guarantee that only one selection can survive.
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));

    if p_equipped then
        if not private.worth_it_badge_is_earned(v_user_id,p_badge_key) then
            raise exception 'This badge has not been unlocked for your account.' using errcode='42501';
        end if;

        if p_badge_key in ('premium','premium_lite') then
            select premium_expires_at into v_expires_at
              from private.worth_it_calc_wallets
             where user_id=v_user_id and premium_plan=p_badge_key
               and premium_expires_at>now();
            if v_expires_at is null then
                raise exception 'An active subscription is required to equip this badge.' using errcode='42501';
            end if;
        end if;

        delete from private.worth_it_profile_badge_equips
         where user_id=v_user_id;

        insert into private.worth_it_profile_badge_equips(user_id,badge_key,entitlement_expires_at)
        values(
            v_user_id,
            p_badge_key,
            case when p_badge_key in ('premium','premium_lite') then v_expires_at else null end
        );
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
