-- Add an owner-only calculator title editor with a database-enforced 10-minute cooldown.
begin;

alter table private.worth_it_user_calculators
    add column if not exists title_changed_at timestamptz;

alter table private.worth_it_user_calculators
    drop constraint if exists worth_it_user_calculators_title_check;
alter table private.worth_it_user_calculators
    add constraint worth_it_user_calculators_title_check
    check (char_length(btrim(title)) between 3 and 75);

create or replace function private.worth_it_guard_ugc_calculator_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
    v_now timestamptz := clock_timestamp();
begin
    if new.category is distinct from old.category then
        raise exception 'A saved community calculator primary category cannot be changed after creation.'
            using errcode = '22023';
    end if;

    if new.title is distinct from old.title then
        if char_length(btrim(coalesce(new.title,''))) not between 3 and 75 then
            raise exception 'A community calculator title must contain 3 to 75 characters.'
                using errcode = '22023';
        end if;
        if old.title_changed_at is not null
           and old.title_changed_at + interval '10 minutes' > v_now then
            raise exception 'A community calculator title can be changed once every 10 minutes.'
                using errcode = '55000';
        end if;
        new.title_changed_at := v_now;
    end if;

    if new.description is distinct from old.description then
        if old.description_changed_at is not null
           and old.description_changed_at + interval '10 minutes' > v_now then
            raise exception 'A community calculator description can be changed once every 10 minutes.'
                using errcode = '55000';
        end if;
        new.description_changed_at := v_now;
    end if;
    return new;
end;
$$;

create or replace function public.get_worth_it_ugc_title_status(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_title text;
    v_changed_at timestamptz;
    v_next timestamptz;
    v_now timestamptz := clock_timestamp();
    v_remaining_ms bigint;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;

    select c.title,c.title_changed_at
      into v_title,v_changed_at
      from private.worth_it_user_calculators c
     where c.id=p_id and c.owner_user_id=v_user_id;
    if not found then
        raise exception 'Calculator not found or not owned by you.' using errcode = '42501';
    end if;

    v_next := case when v_changed_at is not null and v_changed_at + interval '10 minutes' > v_now
                   then v_changed_at + interval '10 minutes' else null end;
    v_remaining_ms := case when v_next is null then 0
        else greatest(0,ceil(extract(epoch from (v_next-v_now))*1000)::bigint) end;
    return jsonb_build_object(
        'success',true,'title',coalesce(v_title,''),'can_save',v_next is null,
        'changed_at',v_changed_at,'next_save_at',v_next,'remaining_ms',v_remaining_ms,
        'cooldown_seconds',600
    );
end;
$$;

create or replace function public.update_worth_it_ugc_calculator_title(
    p_id uuid,
    p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    v_user_id uuid := auth.uid();
    v_row private.worth_it_user_calculators%rowtype;
    v_title text := btrim(coalesce(p_title,''));
    v_now timestamptz := clock_timestamp();
    v_next timestamptz;
    v_remaining_ms bigint;
begin
    if v_user_id is null then
        raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if char_length(v_title) not between 3 and 75 then
        raise exception 'A calculator title must contain 3 to 75 characters.' using errcode = '22023';
    end if;
    if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then
        raise exception 'Verify your email before changing a community calculator title.' using errcode = '42501';
    end if;

    select * into v_row
      from private.worth_it_user_calculators
     where id=p_id and owner_user_id=v_user_id
     for update;
    if not found then
        raise exception 'Calculator not found or not owned by you.' using errcode = '42501';
    end if;

    if v_row.title is not distinct from v_title then
        v_next := case when v_row.title_changed_at is not null
                            and v_row.title_changed_at + interval '10 minutes' > v_now
                       then v_row.title_changed_at + interval '10 minutes' else null end;
        v_remaining_ms := case when v_next is null then 0
            else greatest(0,ceil(extract(epoch from (v_next-v_now))*1000)::bigint) end;
        return jsonb_build_object('success',true,'unchanged',true,'title',v_row.title,
            'can_save',v_next is null,'next_save_at',v_next,'remaining_ms',v_remaining_ms);
    end if;

    v_next := case when v_row.title_changed_at is not null
                        then v_row.title_changed_at + interval '10 minutes' else null end;
    if v_next is not null and v_next>v_now then
        v_remaining_ms := greatest(0,ceil(extract(epoch from (v_next-v_now))*1000)::bigint);
        return jsonb_build_object('success',false,'code','TITLE_COOLDOWN',
            'error','You can change this calculator title once every 10 minutes.',
            'can_save',false,'next_save_at',v_next,'remaining_ms',v_remaining_ms);
    end if;

    update private.worth_it_user_calculators
       set title=v_title,updated_at=v_now
     where id=p_id and owner_user_id=v_user_id;
    return jsonb_build_object('success',true,'unchanged',false,'title',v_title,
        'can_save',false,'next_save_at',v_now+interval '10 minutes','remaining_ms',600000);
end;
$$;

revoke all on function public.get_worth_it_ugc_title_status(uuid) from public,anon;
revoke all on function public.update_worth_it_ugc_calculator_title(uuid,text) from public,anon;
revoke execute on function private.worth_it_guard_ugc_calculator_update()
    from public,anon,authenticated,service_role;

grant execute on function public.get_worth_it_ugc_title_status(uuid) to authenticated;
grant execute on function public.update_worth_it_ugc_calculator_title(uuid,text) to authenticated;

commit;
