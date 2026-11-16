-- Count each signed-in account once per public UGC calculator for its lifetime.
-- Existing daily records are consolidated by retaining the earliest view for each pair.
begin;

lock table private.worth_it_calculator_views in access exclusive mode;

with ranked_views as (
    select ctid,
           row_number() over (
               partition by calculator_id,viewer_user_id
               order by created_at asc,viewed_on asc,ctid asc
           ) as duplicate_number
      from private.worth_it_calculator_views
)
delete from private.worth_it_calculator_views v
 using ranked_views r
 where v.ctid=r.ctid
   and r.duplicate_number>1;

do $primary_key$
declare
    v_constraint_name text;
begin
    select conname
      into v_constraint_name
      from pg_constraint
     where conrelid='private.worth_it_calculator_views'::regclass
       and contype='p'
     limit 1;

    if v_constraint_name is not null then
        execute format(
            'alter table private.worth_it_calculator_views drop constraint %I',
            v_constraint_name
        );
    end if;
end
$primary_key$;

alter table private.worth_it_calculator_views
    add constraint worth_it_calculator_views_pkey
    primary key (calculator_id,viewer_user_id);

create or replace function public.record_worth_it_ugc_view(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid:=auth.uid();
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode='28000';
    end if;

    if not exists(
        select 1
          from private.worth_it_user_calculators
         where id=p_id
           and status='published'
           and visibility='public'
           and owner_user_id<>v_user_id
    ) then
        return jsonb_build_object('success',false,'counted',false);
    end if;

    insert into private.worth_it_calculator_views(calculator_id,viewer_user_id)
    values(p_id,v_user_id)
    on conflict (calculator_id,viewer_user_id) do nothing;

    return jsonb_build_object('success',true,'counted',found);
end;
$$;

comment on table private.worth_it_calculator_views is
    'One lifetime view record per signed-in viewer and published community calculator.';

notify pgrst, 'reload schema';
commit;
