-- Version gate for persisted community calculators.
-- Preserve the existing V1 validator byte-for-byte, but route all existing
-- save/publish RPC calls through a wrapper that rejects unsupported versions.
-- V2 remains blocked from persistence until SQL validation and runtime routes
-- are independently implemented and tested.
begin;

do $rename_v1_validator$
begin
    if to_regprocedure('private.worth_it_validate_ugc_spec_v1(jsonb)') is null then
        if to_regprocedure('private.worth_it_validate_ugc_spec(jsonb)') is null then
            raise exception 'The existing UGC calculator validator is missing; refusing to install the version gate.';
        end if;
        alter function private.worth_it_validate_ugc_spec(jsonb)
            rename to worth_it_validate_ugc_spec_v1;
    end if;
end
$rename_v1_validator$;

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
        if v_schema_version <> 1 or v_engine_version <> 1 then
            raise exception 'Only calculator schema 1 / engine 1 can currently be saved or published. V2 persistence is not enabled.'
                using errcode = '22023';
        end if;
    end if;

    perform private.worth_it_validate_ugc_spec_v1(p_spec);
end;
$$;

-- The raw V1 implementation must not be callable around this gate by API roles.
revoke all on function private.worth_it_validate_ugc_spec_v1(jsonb)
    from public, anon, authenticated, service_role;
grant execute on function private.worth_it_validate_ugc_spec_v1(jsonb) to postgres;

-- The wrapper is an internal implementation detail called by existing
-- SECURITY DEFINER save/publish RPCs, never a public RPC itself.
revoke all on function private.worth_it_validate_ugc_spec(jsonb)
    from public, anon, authenticated, service_role;
grant execute on function private.worth_it_validate_ugc_spec(jsonb) to postgres;

commit;
