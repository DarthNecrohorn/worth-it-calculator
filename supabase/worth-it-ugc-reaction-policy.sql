-- Owner-controlled UGC reaction policy.
-- A member may rate a public calculator after one successfully settled calculation,
-- unless its owner disables that requirement. Only the calculator owner can change it.
begin;

alter table private.worth_it_user_calculators
    add column if not exists require_test_before_reaction boolean not null default true;

create table if not exists private.worth_it_calculator_uses (
    calculator_id uuid not null references private.worth_it_user_calculators(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    first_used_at timestamptz not null default now(),
    primary key (calculator_id, user_id)
);
create index if not exists worth_it_calculator_uses_user_idx
    on private.worth_it_calculator_uses(user_id, first_used_at desc);
alter table private.worth_it_calculator_uses enable row level security;
revoke all on private.worth_it_calculator_uses from public, anon, authenticated;

-- Preserve eligibility for members who successfully used a public UGC calculator
-- before this policy was introduced. Failed/refunded reservations do not qualify.
insert into private.worth_it_calculator_uses(calculator_id, user_id)
select distinct c.id, t.user_id
  from private.worth_it_calc_transactions t
  join private.worth_it_user_calculators c
    on c.id::text = t.metadata ->> 'ugc_calculator_id'
 where t.kind = 'calculator_spend'
   and t.status = 'completed'
   and t.metadata ->> 'ugc_calculator_id' is not null
   and c.status = 'published'
   and c.visibility = 'public'
   and c.owner_user_id <> t.user_id
on conflict (calculator_id, user_id) do nothing;

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
        ),
        'require_test_before_reaction', c.require_test_before_reaction,
        'has_used', (c.owner_user_id = v_user_id) or exists (
            select 1 from private.worth_it_calculator_uses u
             where u.calculator_id = c.id and u.user_id = v_user_id
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

create or replace function public.set_worth_it_ugc_reaction_policy(
    p_id uuid,
    p_require_test boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_saved boolean;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_id is null or p_require_test is null then
        raise exception 'A calculator and rating policy are required.' using errcode = '22023';
    end if;

    update private.worth_it_user_calculators
       set require_test_before_reaction = p_require_test,
           updated_at = now()
     where id = p_id
       and owner_user_id = v_user_id
    returning require_test_before_reaction into v_saved;

    if not found then
        raise exception 'Only the calculator owner can change this setting.' using errcode = '42501';
    end if;

    return jsonb_build_object(
        'success', true,
        'require_test_before_reaction', v_saved
    );
end;
$$;

create or replace function public.set_worth_it_ugc_reaction(p_id uuid, p_reaction text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_old text;
    v_requires_test boolean;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_reaction is null or p_reaction not in ('like','dislike') then
        raise exception 'Invalid reaction.' using errcode = '22023';
    end if;

    select c.require_test_before_reaction
      into v_requires_test
      from private.worth_it_user_calculators c
     where c.id = p_id
       and c.status = 'published'
       and c.visibility = 'public'
       and c.owner_user_id <> v_user_id;

    if not found then
        raise exception 'Calculator not found or cannot be rated by its owner.' using errcode = '42501';
    end if;

    select reaction into v_old
      from private.worth_it_calculator_reactions
     where calculator_id = p_id and user_id = v_user_id;

    -- Removing an existing reaction is always allowed, even if the owner
    -- has since enabled the one-use requirement.
    if v_old = p_reaction then
        delete from private.worth_it_calculator_reactions
         where calculator_id = p_id and user_id = v_user_id;
        return jsonb_build_object('success', true, 'reaction', null);
    end if;

    if v_requires_test and not exists (
        select 1
          from private.worth_it_calculator_uses u
         where u.calculator_id = p_id
           and u.user_id = v_user_id
    ) then
        raise exception 'You must complete one calculation before you can like or dislike this calculator. The creator requires it.'
            using errcode = '42501';
    end if;

    insert into private.worth_it_calculator_reactions(calculator_id, user_id, reaction)
    values (p_id, v_user_id, p_reaction)
    on conflict (calculator_id, user_id)
    do update set reaction = excluded.reaction, created_at = now(), updated_at = now();

    return jsonb_build_object('success', true, 'reaction', p_reaction);
end;
$$;

-- A completed, non-refunded CALC reservation is the source of truth for a successful UGC use.
-- The transaction stores ugc_calculator_id when calc_wallet_reserve is called by the calculator.
create or replace function public.calc_wallet_settle(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_tx private.worth_it_calc_transactions%rowtype;
    v_calculator_id uuid;
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    update private.worth_it_calc_transactions
       set status = 'completed'
     where user_id = v_user_id
       and request_id = p_request_id
       and status = 'reserved'
    returning * into v_tx;

    if not found then
        select * into v_tx
          from private.worth_it_calc_transactions
         where user_id = v_user_id
           and request_id = p_request_id;

        if not found then
            return jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND');
        end if;
        return jsonb_build_object('ok', v_tx.status = 'completed', 'status', v_tx.status);
    end if;

    if v_tx.kind = 'calculator_spend'
       and nullif(v_tx.metadata ->> 'ugc_calculator_id', '') is not null then
        v_calculator_id := (v_tx.metadata ->> 'ugc_calculator_id')::uuid;

        insert into private.worth_it_calculator_uses(calculator_id, user_id)
        select c.id, v_user_id
          from private.worth_it_user_calculators c
         where c.id = v_calculator_id
           and c.status = 'published'
           and c.visibility = 'public'
           and c.owner_user_id <> v_user_id
        on conflict (calculator_id, user_id) do nothing;
    end if;

    return jsonb_build_object(
        'ok', true,
        'status', 'completed',
        'balance_milli', v_tx.balance_after_milli
    );
end;
$$;

revoke all on function public.set_worth_it_ugc_reaction_policy(uuid, boolean) from public, anon;
grant execute on function public.set_worth_it_ugc_reaction_policy(uuid, boolean) to authenticated;

commit;
