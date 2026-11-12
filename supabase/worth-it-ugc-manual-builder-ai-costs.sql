-- Separate manual UGC saves from AI quotas, enforce paid AI operations,
-- and remove the obsolete lifetime limit. Apply only after reviewing the
-- UGC staging schema and disposable PostgreSQL smoke tests.
begin;

create table if not exists private.worth_it_ugc_manual_daily_usage (
    user_id uuid not null references auth.users(id) on delete cascade,
    usage_date date not null,
    creations_used smallint not null check (creations_used between 1 and 3),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, usage_date)
);
create index if not exists worth_it_ugc_manual_daily_usage_date_idx
    on private.worth_it_ugc_manual_daily_usage(usage_date, user_id);
alter table private.worth_it_ugc_manual_daily_usage enable row level security;
revoke all on private.worth_it_ugc_manual_daily_usage from public, anon, authenticated;

-- Manual saves have their own 1/2/3 daily allowance. AI generations use the
-- independent maker-generation ledger and never consume this manual allowance.
create or replace function public.get_worth_it_ugc_creation_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_plan text;
    v_limit integer;
    v_used integer := 0;
    v_today date := (now() at time zone 'utc')::date;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select case
             when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 'premium'
             when w.premium_plan='premium' and w.premium_expires_at>now() then 'premium'
             when w.premium_plan='premium_lite' and w.premium_expires_at>now() then 'premium_lite'
             else 'free'
           end
      into v_plan
      from auth.users u
      left join private.worth_it_calc_wallets w on w.user_id=u.id
     where u.id=v_user_id and u.email_confirmed_at is not null;
    if not found then raise exception 'Verify your email before creating community calculators.' using errcode='42501'; end if;

    v_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;
    select creations_used into v_used
      from private.worth_it_ugc_manual_daily_usage
     where user_id=v_user_id and usage_date=v_today;
    v_used := coalesce(v_used,0);
    return jsonb_build_object(
        'success',true,'plan',v_plan,'usage_date',v_today,
        'daily_limit',v_limit,'creations_used',v_used,
        'remaining',greatest(0,v_limit-v_used),
        'quota_type','manual_non_ai_saves'
    );
end;
$$;

-- Bind each successful AI operation to at most one saved calculator. This prevents
-- callers from claiming "ai" as the source and bypassing the manual save quota.
create table if not exists private.worth_it_ugc_ai_saved_operations (
    request_id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    calculator_id uuid not null references private.worth_it_user_calculators(id) on delete cascade,
    operation text not null check (operation in ('generation','improvement')),
    definition_hash text not null,
    created_at timestamptz not null default now()
);
alter table private.worth_it_ugc_ai_saved_operations
    add column if not exists definition_hash text;
create index if not exists worth_it_ugc_ai_saved_operations_user_idx
    on private.worth_it_ugc_ai_saved_operations(user_id,created_at desc);
alter table private.worth_it_ugc_ai_saved_operations enable row level security;
revoke all on private.worth_it_ugc_ai_saved_operations from public,anon,authenticated;

-- Use an explicit source and request proof. "ai" cannot be self-declared:
-- new AI saves need a settled maker generation; AI edits need a settled edit
-- reservation for the exact calculator. Manual saves use their separate ledger.
drop function if exists public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb);
drop function if exists public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb,text);
create or replace function public.save_worth_it_ugc_calculator(
    p_id uuid,
    p_title text,
    p_description text,
    p_category text,
    p_spec jsonb,
    p_source text,
    p_ai_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_id uuid;
    v_calculator_number bigint;
    v_plan text;
    v_daily_limit integer;
    v_creations_used integer;
    v_today date := (now() at time zone 'utc')::date;
    v_title text := btrim(coalesce(p_title,''));
    v_description text := btrim(coalesce(p_description,''));
    v_category text := lower(btrim(coalesce(p_category,'')));
    v_subcategories text[] := array[]::text[];
    v_source text := lower(btrim(coalesce(p_source,'manual')));
    v_reservation_status text;
    v_billing_status text;
    v_billing_operation text;
    v_definition_hash text := md5(jsonb_build_object(
        'title',btrim(coalesce(p_title,'')),
        'description',btrim(coalesce(p_description,'')),
        'category',lower(btrim(coalesce(p_category,''))),
        'spec',p_spec
    )::text);
    v_saved_operation private.worth_it_ugc_ai_saved_operations%rowtype;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then
        raise exception 'Verify your email before creating community calculators.' using errcode='42501';
    end if;
    if v_source not in ('manual','ai') then
        raise exception 'Calculator source must be manual or ai.' using errcode='22023';
    end if;
    if (v_source='manual' and p_ai_request_id is not null)
       or (v_source='ai' and p_ai_request_id is null) then
        raise exception 'The calculator source proof is invalid.' using errcode='22023';
    end if;
    if char_length(v_title) not between 3 and 70
       or char_length(v_description)>500
       or (p_id is null and char_length(v_description)<24)
       or v_category not in ('cars','money','technology','home','other') then
        raise exception 'Invalid calculator details.' using errcode='22023';
    end if;
    if jsonb_typeof(p_spec->'subcategories')='array' then
        select coalesce(array_agg(value),array[]::text[])
          into v_subcategories
          from jsonb_array_elements_text(p_spec->'subcategories') as items(value);
    else
        v_subcategories := case v_category
            when 'cars' then array['car-ownership']::text[]
            when 'money' then array['budgeting']::text[]
            when 'technology' then array['tech-comparison']::text[]
            when 'home' then array['household-budget']::text[]
            else array['general-comparison']::text[]
        end;
    end if;
    perform private.worth_it_validate_ugc_categories(v_category,v_subcategories);
    perform private.worth_it_validate_ugc_spec(p_spec - 'subcategories');

    if p_id is null then
        -- Lock the account row to serialize concurrent manual-save reservations
        -- and plan reads against simultaneous subscription changes.
        perform 1 from auth.users where id=v_user_id for update;
        select case
                 when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 'premium'
                 when w.premium_plan='premium' and w.premium_expires_at>now() then 'premium'
                 when w.premium_plan='premium_lite' and w.premium_expires_at>now() then 'premium_lite'
                 else 'free'
               end
          into v_plan
          from auth.users u
          left join private.worth_it_calc_wallets w on w.user_id=u.id
         where u.id=v_user_id;
        v_daily_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;

        if v_source='manual' then
            insert into private.worth_it_ugc_manual_daily_usage(user_id,usage_date,creations_used)
            values(v_user_id,v_today,1)
            on conflict(user_id,usage_date) do update
               set creations_used=private.worth_it_ugc_manual_daily_usage.creations_used+1,
                   updated_at=now()
             where private.worth_it_ugc_manual_daily_usage.creations_used<v_daily_limit
            returning creations_used into v_creations_used;
            if v_creations_used is null then
                raise exception 'Daily manual calculator save limit reached (% per UTC day).',v_daily_limit
                    using errcode='54000';
            end if;
        else
            -- A new AI-created calculator must be backed by a settled and
            -- authenticated generation reservation, not merely a client flag.
            select status into v_reservation_status
              from private.worth_it_ugc_maker_generation_reservations
             where request_id=p_ai_request_id and user_id=v_user_id
             for update;
            if not found or v_reservation_status<>'consumed' then
                raise exception 'A completed AI generation reservation is required.' using errcode='42501';
            end if;

            -- The reservation alone is not proof of payment: a client could
            -- otherwise call the legacy quota RPCs directly. Require the
            -- matching completed CALC ledger entry, including zero-price owner
            -- exemptions, before accepting an AI-generated definition.
            select status,metadata->>'operation'
              into v_billing_status,v_billing_operation
              from private.worth_it_calc_transactions
             where user_id=v_user_id and request_id=p_ai_request_id
               and kind='ugc_ai_spend' and currency='CALC'
             for update;
            if not found or v_billing_status<>'completed' or v_billing_operation<>'generation' then
                raise exception 'A completed CALC AI-generation transaction is required.' using errcode='42501';
            end if;

            -- Idempotent retry: if the first save committed but its HTTP
            -- response was lost, return that same saved calculator.
            select * into v_saved_operation
              from private.worth_it_ugc_ai_saved_operations
             where request_id=p_ai_request_id
             for update;
            if found then
                if v_saved_operation.user_id<>v_user_id
                   or v_saved_operation.operation<>'generation'
                   or v_saved_operation.definition_hash is distinct from v_definition_hash then
                    raise exception 'This AI generation was already used for another calculator definition.' using errcode='42501';
                end if;
                select id,calculator_number into v_id,v_calculator_number
                  from private.worth_it_user_calculators
                 where id=v_saved_operation.calculator_id and owner_user_id=v_user_id;
                if v_id is null then raise exception 'The calculator attached to this AI generation no longer exists.'; end if;
                select creations_used into v_creations_used
                  from private.worth_it_ugc_manual_daily_usage
                 where user_id=v_user_id and usage_date=v_today;
                return jsonb_build_object('success',true,'id',v_id,'calculator_number',v_calculator_number,
                    'source','ai','daily_limit',v_daily_limit,'creations_used',coalesce(v_creations_used,0),
                    'remaining',greatest(0,v_daily_limit-coalesce(v_creations_used,0)),'already_saved',true);
            end if;

            select creations_used into v_creations_used
              from private.worth_it_ugc_manual_daily_usage
             where user_id=v_user_id and usage_date=v_today;
            v_creations_used := coalesce(v_creations_used,0);
        end if;

        insert into private.worth_it_user_calculators(owner_user_id,title,description,category,subcategories,spec)
        values(v_user_id,v_title,v_description,v_category,v_subcategories,p_spec - 'subcategories')
        returning id,calculator_number into v_id,v_calculator_number;

        if v_source='ai' then
            insert into private.worth_it_ugc_ai_saved_operations(request_id,user_id,calculator_id,operation,definition_hash)
            values(p_ai_request_id,v_user_id,v_id,'generation',v_definition_hash);
        end if;
    else
        if v_source='ai' then
            -- AI improvements are valid only for a completed improvement
            -- reservation that names this exact calculator and owner.
            select status into v_reservation_status
              from private.worth_it_ugc_ai_edit_requests
             where request_id=p_ai_request_id
               and user_id=v_user_id
               and calculator_id=p_id
             for update;
            if not found or v_reservation_status<>'completed' then
                raise exception 'A completed AI improvement reservation for this calculator is required.' using errcode='42501';
            end if;
            select status,metadata->>'operation'
              into v_billing_status,v_billing_operation
              from private.worth_it_calc_transactions
             where user_id=v_user_id and request_id=p_ai_request_id
               and kind='ugc_ai_spend' and currency='CALC'
             for update;
            if not found or v_billing_status<>'completed' or v_billing_operation<>'improvement' then
                raise exception 'A completed CALC AI-improvement transaction is required.' using errcode='42501';
            end if;
            select * into v_saved_operation
              from private.worth_it_ugc_ai_saved_operations
             where request_id=p_ai_request_id
             for update;
            if found then
                if v_saved_operation.user_id<>v_user_id
                   or v_saved_operation.calculator_id<>p_id
                   or v_saved_operation.operation<>'improvement'
                   or v_saved_operation.definition_hash is distinct from v_definition_hash then
                    raise exception 'This AI improvement was already used for another calculator definition.' using errcode='42501';
                end if;
                select id,calculator_number into v_id,v_calculator_number
                  from private.worth_it_user_calculators
                 where id=p_id and owner_user_id=v_user_id;
                if v_id is null then raise exception 'Calculator not found or not owned by you.' using errcode='42501'; end if;
                return jsonb_build_object('success',true,'id',v_id,'calculator_number',v_calculator_number,
                    'source','ai','already_saved',true);
            end if;
        end if;

        update private.worth_it_user_calculators
           set title=v_title,description=v_description,category=v_category,
               subcategories=v_subcategories,spec=p_spec - 'subcategories',updated_at=now()
         where id=p_id and owner_user_id=v_user_id
        returning id,calculator_number into v_id,v_calculator_number;
        if v_id is null then raise exception 'Calculator not found or not owned by you.' using errcode='42501'; end if;

        if v_source='ai' and v_saved_operation.request_id is null then
            insert into private.worth_it_ugc_ai_saved_operations(request_id,user_id,calculator_id,operation,definition_hash)
            values(p_ai_request_id,v_user_id,v_id,'improvement',v_definition_hash);
        end if;

        select case
                 when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 'premium'
                 when w.premium_plan='premium' and w.premium_expires_at>now() then 'premium'
                 when w.premium_plan='premium_lite' and w.premium_expires_at>now() then 'premium_lite'
                 else 'free'
               end
          into v_plan
          from auth.users u left join private.worth_it_calc_wallets w on w.user_id=u.id
         where u.id=v_user_id;
        v_daily_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;
        select creations_used into v_creations_used
          from private.worth_it_ugc_manual_daily_usage
         where user_id=v_user_id and usage_date=v_today;
        v_creations_used := coalesce(v_creations_used,0);
    end if;

    return jsonb_build_object(
        'success',true,'id',v_id,'calculator_number',v_calculator_number,
        'source',v_source,'daily_limit',v_daily_limit,
        'creations_used',coalesce(v_creations_used,0),
        'remaining',greatest(0,coalesce(v_daily_limit,0)-coalesce(v_creations_used,0))
    );
end;
$$;

-- Backwards compatibility is intentionally manual-only. A caller cannot claim
-- AI provenance through the old five-argument RPC.
create or replace function public.save_worth_it_ugc_calculator(
    p_id uuid,p_title text,p_description text,p_category text,p_spec jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, auth
as $$
    select public.save_worth_it_ugc_calculator(
        p_id,p_title,p_description,p_category,p_spec,'manual',null::uuid
    );
$$;

-- Correct the separate AI-improvement quota to Free 1 / Lite 2 / Premium 3.
create or replace function public.get_worth_it_ugc_ai_edit_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_plan text;
    v_limit integer;
    v_used integer := 0;
    v_today date := (now() at time zone 'utc')::date;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    select case
             when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 'premium'
             when w.premium_plan='premium' and w.premium_expires_at>now() then 'premium'
             when w.premium_plan='premium_lite' and w.premium_expires_at>now() then 'premium_lite'
             else 'free'
           end
      into v_plan
      from auth.users u left join private.worth_it_calc_wallets w on w.user_id=u.id
     where u.id=v_user_id and u.email_confirmed_at is not null;
    if not found then raise exception 'Verify your email before improving a community calculator.' using errcode='42501'; end if;
    v_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;
    select edits_used into v_used
      from private.worth_it_ugc_ai_edit_daily_usage
     where user_id=v_user_id and usage_date=v_today;
    v_used := coalesce(v_used,0);
    return jsonb_build_object('success',true,'plan',v_plan,'usage_date',v_today,
        'daily_limit',v_limit,'edits_used',v_used,'remaining',greatest(0,v_limit-v_used));
end;
$$;

create or replace function public.reserve_worth_it_ugc_ai_edit(p_id uuid,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_plan text;
    v_limit integer;
    v_used integer;
    v_today date := (now() at time zone 'utc')::date;
    v_reserved uuid;
begin
    if v_user_id is null then raise exception 'Sign in required.' using errcode='28000'; end if;
    if p_request_id is null then raise exception 'A request ID is required.' using errcode='22023'; end if;
    perform 1 from auth.users where id=v_user_id and email_confirmed_at is not null for update;
    if not found then raise exception 'Verify your email before improving a community calculator.' using errcode='42501'; end if;
    if not exists(select 1 from private.worth_it_user_calculators where id=p_id and owner_user_id=v_user_id) then
        raise exception 'Calculator not found or not owned by you.' using errcode='42501';
    end if;
    select case
             when lower(coalesce(u.email,''))='pedjasebez3545@gmail.com' then 'premium'
             when w.premium_plan='premium' and w.premium_expires_at>now() then 'premium'
             when w.premium_plan='premium_lite' and w.premium_expires_at>now() then 'premium_lite'
             else 'free'
           end
      into v_plan from auth.users u
      left join private.worth_it_calc_wallets w on w.user_id=u.id
     where u.id=v_user_id;
    v_limit := case v_plan when 'premium' then 3 when 'premium_lite' then 2 else 1 end;

    insert into private.worth_it_ugc_ai_edit_requests(request_id,user_id,calculator_id,usage_date,status)
    values(p_request_id,v_user_id,p_id,v_today,'reserved')
    on conflict(request_id) do nothing
    returning request_id into v_reserved;
    if v_reserved is null then return jsonb_build_object('ok',false,'code','DUPLICATE_REQUEST'); end if;

    insert into private.worth_it_ugc_ai_edit_daily_usage(user_id,usage_date,edits_used)
    values(v_user_id,v_today,1)
    on conflict(user_id,usage_date) do update
       set edits_used=private.worth_it_ugc_ai_edit_daily_usage.edits_used+1,updated_at=now()
     where private.worth_it_ugc_ai_edit_daily_usage.edits_used<v_limit
    returning edits_used into v_used;
    if v_used is null then
        delete from private.worth_it_ugc_ai_edit_requests
         where request_id=p_request_id and user_id=v_user_id and status='reserved';
        select edits_used into v_used from private.worth_it_ugc_ai_edit_daily_usage
         where user_id=v_user_id and usage_date=v_today;
        return jsonb_build_object('ok',false,'code','DAILY_LIMIT','daily_limit',v_limit,
            'edits_used',coalesce(v_used,0),'remaining',0);
    end if;
    return jsonb_build_object('ok',true,'request_id',p_request_id,'daily_limit',v_limit,
        'edits_used',v_used,'remaining',greatest(0,v_limit-v_used));
end;
$$;

-- A dedicated transaction kind keeps AI UGC charges distinguishable in history.
alter table private.worth_it_calc_transactions
    drop constraint if exists worth_it_calc_transactions_kind_check;
alter table private.worth_it_calc_transactions
    add constraint worth_it_calc_transactions_kind_check
    check (kind in (
        'daily_reward','calculator_spend','ai_chat_spend','ugc_ai_spend',
        'premium_lite_purchase','refund','manual_adjustment','calc_pack_purchase',
        'ugc_creator_earning'
    ));

create or replace function public.reserve_worth_it_ugc_ai_calc(p_request_id uuid,p_operation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_owner boolean := lower(coalesce(auth.jwt()->>'email',''))='pedjasebez3545@gmail.com';
    v_email text;
    v_plan text;
    v_amount integer;
    v_wallet private.worth_it_calc_wallets%rowtype;
    v_existing private.worth_it_calc_transactions%rowtype;
begin
    if v_user_id is null then raise exception 'Authentication required.' using errcode='28000'; end if;
    if p_request_id is null then raise exception 'Request ID is required.' using errcode='22023'; end if;
    if p_operation not in ('generation','improvement') then raise exception 'Unsupported UGC AI operation.' using errcode='22023'; end if;
    select lower(coalesce(email,'')) into v_email from auth.users
     where id=v_user_id and email_confirmed_at is not null;
    if not found then raise exception 'Verify your email before using Worth It AI.' using errcode='42501'; end if;

    select * into v_existing from private.worth_it_calc_transactions
     where user_id=v_user_id and request_id=p_request_id;
    if found then
        return jsonb_build_object(
            'ok',v_existing.kind='ugc_ai_spend' and v_existing.status in ('reserved','completed'),
            'duplicate',true,'status',v_existing.status,
            'required_milli',greatest(0,-v_existing.amount_milli),
            'balance_milli',v_existing.balance_after_milli
        );
    end if;

    if not v_owner then perform public.calc_wallet_summary(); end if;
    insert into private.worth_it_calc_wallets(user_id)
    values(v_user_id) on conflict(user_id) do nothing;
    select * into v_wallet from private.worth_it_calc_wallets
     where user_id=v_user_id for update;

    if not v_owner and v_wallet.premium_plan<>'free'
       and (v_wallet.premium_expires_at is null or v_wallet.premium_expires_at<=now()) then
        update private.worth_it_calc_wallets
           set premium_plan='free',premium_expires_at=null,updated_at=now()
         where user_id=v_user_id returning * into v_wallet;
    end if;
    v_plan := case
        when v_owner then 'premium'
        when v_wallet.premium_plan='premium' and v_wallet.premium_expires_at>now() then 'premium'
        when v_wallet.premium_plan='premium_lite' and v_wallet.premium_expires_at>now() then 'premium_lite'
        else 'free'
    end;
    v_amount := case v_plan when 'premium' then 6000 when 'premium_lite' then 4000 else 2000 end;

    if not v_owner and v_wallet.balance_milli<v_amount then
        return jsonb_build_object('ok',false,'code','INSUFFICIENT_CALC',
            'plan',v_plan,'required_milli',v_amount,'required',v_amount::numeric/1000,
            'balance_milli',v_wallet.balance_milli,'balance',v_wallet.balance_milli::numeric/1000);
    end if;

    if not v_owner then
        update private.worth_it_calc_wallets
           set balance_milli=balance_milli-v_amount,updated_at=now()
         where user_id=v_user_id returning * into v_wallet;
    end if;
    insert into private.worth_it_calc_transactions(
        user_id,kind,amount_milli,balance_after_milli,status,request_id,description,metadata
    ) values (
        v_user_id,'ugc_ai_spend',case when v_owner then 0 else -v_amount end,
        v_wallet.balance_milli,'reserved',p_request_id,
        case p_operation when 'generation' then 'AI UGC calculator generation' else 'AI UGC calculator improvement' end,
        jsonb_build_object('operation',p_operation,'plan',v_plan,'price_milli',case when v_owner then 0 else v_amount end,'owner_exempt',v_owner)
    );
    return jsonb_build_object('ok',true,'plan',v_plan,'price_milli',case when v_owner then 0 else v_amount end,
        'price',case when v_owner then 0 else v_amount::numeric/1000 end,
        'balance_milli',v_wallet.balance_milli,'owner_exempt',v_owner);
end;
$$;

-- Reserve quota + CALC in one database transaction; insufficient balance
-- automatically returns the reserved daily AI slot.
create or replace function public.reserve_worth_it_ugc_ai_operation(
    p_request_id uuid,p_mode text,p_calculator_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_quota jsonb;
    v_charge jsonb;
begin
    if p_mode='create' then
        v_quota := public.reserve_worth_it_ugc_maker_generation_v2(p_request_id);
    elsif p_mode='refine' and p_calculator_id is not null then
        v_quota := public.reserve_worth_it_ugc_ai_edit(p_calculator_id,p_request_id);
    else
        raise exception 'Invalid UGC AI operation mode.' using errcode='22023';
    end if;
    if coalesce((v_quota->>'ok')::boolean,false) is not true then return v_quota; end if;

    v_charge := public.reserve_worth_it_ugc_ai_calc(
        p_request_id,case p_mode when 'create' then 'generation' else 'improvement' end
    );
    if coalesce((v_charge->>'ok')::boolean,false) is not true then
        if p_mode='create' then
            perform public.refund_worth_it_ugc_maker_generation_v2(p_request_id);
        else
            perform public.refund_worth_it_ugc_ai_edit(p_request_id);
        end if;
        return v_charge;
    end if;
    return jsonb_build_object('ok',true,'mode',p_mode,'quota',v_quota,
        'plan',v_charge->>'plan','price_milli',coalesce((v_charge->>'price_milli')::integer,0),
        'price',coalesce((v_charge->>'price')::numeric,0),'owner_exempt',coalesce((v_charge->>'owner_exempt')::boolean,false));
end;
$$;

-- Finalize the CALC transaction and AI slot atomically.
create or replace function public.settle_worth_it_ugc_ai_operation(p_request_id uuid,p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_quota jsonb;
    v_wallet jsonb;
begin
    if p_mode='create' then
        v_quota := public.settle_worth_it_ugc_maker_generation_v2(p_request_id);
    elsif p_mode='refine' then
        v_quota := public.settle_worth_it_ugc_ai_edit(p_request_id);
    else raise exception 'Invalid UGC AI operation mode.' using errcode='22023';
    end if;
    if coalesce((v_quota->>'ok')::boolean,false) is not true then
        raise exception 'The UGC AI daily allowance could not be finalized.' using errcode='P0001';
    end if;
    v_wallet := public.calc_wallet_settle(p_request_id);
    if coalesce((v_wallet->>'ok')::boolean,false) is not true then
        raise exception 'The UGC AI CALC transaction could not be finalized.' using errcode='P0001';
    end if;
    return jsonb_build_object('ok',true,'mode',p_mode,'quota',v_quota,'wallet',v_wallet);
end;
$$;

-- Refund both the AI quota and the CALC reservation after provider, validation,
-- or safety failure. Repeated calls are idempotent through the underlying ledgers.
create or replace function public.refund_worth_it_ugc_ai_operation(p_request_id uuid,p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_quota jsonb;
    v_wallet jsonb;
begin
    if p_mode='create' then
        v_quota := public.refund_worth_it_ugc_maker_generation_v2(p_request_id);
    elsif p_mode='refine' then
        v_quota := public.refund_worth_it_ugc_ai_edit(p_request_id);
    else raise exception 'Invalid UGC AI operation mode.' using errcode='22023';
    end if;
    if coalesce((v_quota->>'ok')::boolean,false) is not true then
        return jsonb_build_object('ok',false,'code','AI_QUOTA_REFUND_FAILED','quota',v_quota);
    end if;
    v_wallet := public.calc_wallet_refund(p_request_id);
    if coalesce((v_wallet->>'ok')::boolean,false) is not true then
        raise exception 'The UGC AI CALC reservation could not be refunded.' using errcode='P0001';
    end if;
    return jsonb_build_object('ok',true,'mode',p_mode,'quota',v_quota,'wallet',v_wallet);
end;
$$;

revoke all on function public.get_worth_it_ugc_creation_quota() from public,anon;
revoke all on function public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb,text,uuid) from public,anon;
revoke all on function public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb) from public,anon;
revoke all on function public.get_worth_it_ugc_ai_edit_quota() from public,anon;
revoke all on function public.reserve_worth_it_ugc_ai_edit(uuid,uuid) from public,anon;
revoke all on function public.reserve_worth_it_ugc_ai_calc(uuid,text) from public,anon;
revoke all on function public.reserve_worth_it_ugc_ai_operation(uuid,text,uuid) from public,anon;
revoke all on function public.settle_worth_it_ugc_ai_operation(uuid,text) from public,anon;
revoke all on function public.refund_worth_it_ugc_ai_operation(uuid,text) from public,anon;

grant execute on function public.get_worth_it_ugc_creation_quota() to authenticated;
grant execute on function public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb,text,uuid) to authenticated;
grant execute on function public.save_worth_it_ugc_calculator(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.get_worth_it_ugc_ai_edit_quota() to authenticated;
grant execute on function public.reserve_worth_it_ugc_ai_edit(uuid,uuid) to authenticated;
grant execute on function public.reserve_worth_it_ugc_ai_calc(uuid,text) to authenticated;
grant execute on function public.reserve_worth_it_ugc_ai_operation(uuid,text,uuid) to authenticated;
grant execute on function public.settle_worth_it_ugc_ai_operation(uuid,text) to authenticated;
grant execute on function public.refund_worth_it_ugc_ai_operation(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
