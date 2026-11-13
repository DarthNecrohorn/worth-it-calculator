-- Smoke tests for the version-aware calculator persistence gate.
-- Run after the V1 gate, V2 database validator and V2 persistence migration in disposable PostgreSQL.
do $version_gate_smoke$
declare
    v_legacy_v1 jsonb := '{
      "inputs":[
        {"key":"amount","label":"Amount","min":0,"max":100,"default":10,"step":1,"unit":"","control":"number"}
      ],
      "results":[
        {"label":"Double amount","expression":"amount*2","format":"number"}
      ]
    }'::jsonb;
    v_valid_v2 jsonb := '{
      "schemaVersion":2,"engineVersion":2,
      "inputs":[{"key":"amount","label":"Amount","type":"number","min":0,"max":100,"default":10,"step":1,"unit":"","control":"number"}],
      "groups":[],
      "results":[{"key":"double_amount","label":"Double amount","expression":"amount*2","format":"number","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Twice the amount."}],
      "scenarios":[]
    }'::jsonb;
    v_invalid_specs jsonb[];
    v_candidate jsonb;
begin
    -- Legacy definitions without version metadata must continue to pass.
    perform private.worth_it_validate_ugc_spec(v_legacy_v1);

    -- Existing explicit V1 and legacy version:1 definitions must also pass.
    perform private.worth_it_validate_ugc_spec(
        v_legacy_v1 || '{"schemaVersion":1,"engineVersion":1}'::jsonb
    );
    perform private.worth_it_validate_ugc_spec(
        v_legacy_v1 || '{"version":1}'::jsonb
    );

    -- A strict V2 definition is accepted only after the private V2 validator is installed.
    perform private.worth_it_validate_ugc_spec(v_valid_v2);

    -- V1-shaped data relabelled as V2 and malformed/mixed versions remain rejected.
    v_invalid_specs := array[
        v_legacy_v1 || '{"schemaVersion":2,"engineVersion":2}'::jsonb,
        v_valid_v2 || '{"version":1}'::jsonb,
        v_legacy_v1 || '{"schemaVersion":1}'::jsonb,
        v_legacy_v1 || '{"schemaVersion":1,"engineVersion":2}'::jsonb,
        v_legacy_v1 || '{"schemaVersion":1.5,"engineVersion":1}'::jsonb,
        v_legacy_v1 || '{"schemaVersion":3,"engineVersion":3}'::jsonb,
        v_legacy_v1 || '{"version":2}'::jsonb,
        v_legacy_v1 || '{"version":"not-a-version"}'::jsonb
    ];

    foreach v_candidate in array v_invalid_specs loop
        begin
            perform private.worth_it_validate_ugc_spec(v_candidate);
            raise exception 'The database version gate accepted an unsupported calculator version.'
                using errcode = 'P0001';
        exception when sqlstate '22023' then
            null;
        end;
    end loop;

    if has_function_privilege('anon','private.worth_it_validate_ugc_spec_v1(jsonb)','EXECUTE')
       or has_function_privilege('authenticated','private.worth_it_validate_ugc_spec_v1(jsonb)','EXECUTE')
       or has_function_privilege('service_role','private.worth_it_validate_ugc_spec_v1(jsonb)','EXECUTE')
       or has_function_privilege('anon','private.worth_it_validate_ugc_spec(jsonb)','EXECUTE')
       or has_function_privilege('authenticated','private.worth_it_validate_ugc_spec(jsonb)','EXECUTE')
       or has_function_privilege('service_role','private.worth_it_validate_ugc_spec(jsonb)','EXECUTE') then
        raise exception 'The private UGC version-gate functions have unexpected API-role execution grants.';
    end if;
end
$version_gate_smoke$;
