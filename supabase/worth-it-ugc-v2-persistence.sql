-- Enable the V2 typed PostgreSQL validator for persisted calculator drafts.
-- V1 is still validated by its preserved implementation. This migration also
-- exposes a capability probe so Preview/browser code can keep V2 persistence
-- disabled until this exact database migration has been installed.
begin;

do $v2_persistence_prerequisites$
begin
    if to_regprocedure('private.worth_it_validate_ugc_spec_v1(jsonb)') is null then
        raise exception 'The preserved V1 UGC validator is missing; refusing to change the persistence gate.';
    end if;
    if to_regprocedure('private.worth_it_validate_ugc_v2_spec(jsonb)') is null then
        raise exception 'The independent V2 PostgreSQL validator is missing; refusing to enable V2 persistence.';
    end if;
end
$v2_persistence_prerequisites$;

create or replace function private.worth_it_validate_ugc_spec(p_spec jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
    v_has_schema boolean := coalesce(p_spec ? 'schemaVersion',false);
    v_has_engine boolean := coalesce(p_spec ? 'engineVersion',false);
    v_schema_version numeric;
    v_engine_version numeric;
    v_legacy_version numeric;
    v_assumption jsonb;
    v_assumption_text text;
    v_assumption_chars integer := 0;
begin
    if coalesce(jsonb_typeof(p_spec),'') <> 'object' then
        raise exception 'Calculator definition must be a JSON object.'
            using errcode = '22023';
    end if;

    if p_spec ? 'version' then
        if jsonb_typeof(p_spec->'version') not in ('number','string') then
            raise exception 'Legacy calculator version must resolve to version 1.'
                using errcode = '22023';
        end if;
        begin
            v_legacy_version := (p_spec->>'version')::numeric;
        exception when others then
            raise exception 'Legacy calculator version must resolve to version 1.'
                using errcode = '22023';
        end;
        if v_legacy_version <> 1 then
            raise exception 'Legacy calculator version must resolve to version 1.'
                using errcode = '22023';
        end if;
    end if;

    if v_has_schema <> v_has_engine then
        raise exception 'A versioned calculator must declare both schemaVersion and engineVersion.'
            using errcode = '22023';
    end if;

    if v_has_schema then
        if jsonb_typeof(p_spec->'schemaVersion') <> 'number'
           or jsonb_typeof(p_spec->'engineVersion') <> 'number' then
            raise exception 'Calculator schemaVersion and engineVersion must be integer JSON numbers.'
                using errcode = '22023';
        end if;
        v_schema_version := (p_spec->>'schemaVersion')::numeric;
        v_engine_version := (p_spec->>'engineVersion')::numeric;
        if v_schema_version <> trunc(v_schema_version)
           or v_engine_version <> trunc(v_engine_version) then
            raise exception 'Calculator schemaVersion and engineVersion must be integers.'
                using errcode = '22023';
        end if;

        if v_schema_version = 1 and v_engine_version = 1 then
            perform private.worth_it_validate_ugc_spec_v1(p_spec);
            return;
        end if;

        if v_schema_version = 2 and v_engine_version = 2 then
            if p_spec ? 'version' then
                raise exception 'V2 definitions must not mix legacy version metadata with schemaVersion/engineVersion.'
                    using errcode = '22023';
            end if;
            if p_spec ? 'assumptions' then
                if coalesce(jsonb_typeof(p_spec->'assumptions'),'') <> 'array'
                   or jsonb_array_length(p_spec->'assumptions') > 50 then
                    raise exception 'V2 assumptions must be an array of at most 50 strings.'
                        using errcode = '22023';
                end if;
                for v_assumption in select value from jsonb_array_elements(p_spec->'assumptions') loop
                    if jsonb_typeof(v_assumption) <> 'string' then
                        raise exception 'Every V2 assumption must be a string.'
                            using errcode = '22023';
                    end if;
                    v_assumption_text := v_assumption #>> '{}';
                    if char_length(btrim(v_assumption_text)) not between 1 and 5000 then
                        raise exception 'V2 assumptions must contain 1–5,000 characters each.'
                            using errcode = '22023';
                    end if;
                    v_assumption_chars := v_assumption_chars + char_length(v_assumption_text);
                    if v_assumption_chars > 5000 then
                        raise exception 'V2 assumptions can contain up to 5,000 characters in total.'
                            using errcode = '22023';
                    end if;
                end loop;
            end if;

            -- These are trusted, non-executable authoring metadata. Category tags
            -- are independently validated by the save RPC; assumptions are bounded
            -- above. The V2 engine receives only the strict executable schema.
            perform private.worth_it_validate_ugc_v2_spec(p_spec - 'subcategories' - 'assumptions');
            return;
        end if;

        raise exception 'Only matching calculator schema/engine pairs 1/1 or 2/2 can be saved or published.'
            using errcode = '22023';
    end if;

    -- Preserve legacy definitions, including the optional legacy version: 1 field.
    perform private.worth_it_validate_ugc_spec_v1(p_spec);
end;
$$;

revoke all on function private.worth_it_validate_ugc_spec(jsonb)
    from public, anon, authenticated, service_role;
grant execute on function private.worth_it_validate_ugc_spec(jsonb) to postgres;

-- This function is intentionally read-only and requires an authenticated caller.
-- Older databases do not have it, so the browser treats a missing function as
-- V2 persistence unavailable instead of optimistically enabling Save/Publish.
create or replace function public.get_worth_it_ugc_schema_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, auth
as $$
    select case
        when auth.uid() is null then
            jsonb_build_object('supported_schema_versions',jsonb_build_array(1),'v2_persistence',false)
        else
            jsonb_build_object('supported_schema_versions',jsonb_build_array(1,2),'v2_persistence',true)
    end;
$$;

revoke all on function public.get_worth_it_ugc_schema_capabilities() from public, anon, service_role;
grant execute on function public.get_worth_it_ugc_schema_capabilities() to authenticated;

comment on function public.get_worth_it_ugc_schema_capabilities() is
    'Returns calculator schema support for the authenticated session. V2 is true only after the V2 persistence migration is installed.';

commit;
