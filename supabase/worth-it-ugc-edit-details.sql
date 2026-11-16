-- Allow owners to rename saved community calculators while keeping the
-- primary category immutable and enforcing the existing description cooldown.
begin;

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

    if new.title is distinct from old.title
       and char_length(btrim(coalesce(new.title,''))) not between 3 and 70 then
        raise exception 'A community calculator title must contain 3 to 70 characters.'
            using errcode = '22023';
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

commit;
