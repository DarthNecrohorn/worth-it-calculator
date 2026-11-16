-- End-to-end V2 save/publish smoke test against a disposable PostgreSQL database.
-- Run after the UGC migrations, V2 validator and V2 persistence capability migration.
begin;

insert into auth.users(id,email,email_confirmed_at)
values ('77777777-7777-4777-8777-777777777777','v2-owner@example.test',now())
on conflict(id) do update set email='v2-owner@example.test',email_confirmed_at=now();

insert into auth.users(id,email,email_confirmed_at)
values ('22222222-2222-4222-8222-222222222222','v2-member@example.test',now())
on conflict(id) do update set email='v2-member@example.test',email_confirmed_at=now();

insert into public.worth_it_profiles(user_id,worth_it_id,username,display_name)
values ('77777777-7777-4777-8777-777777777777',777777,'v2_owner','Typed V2 Owner')
on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name;

select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);

do $v2_persistence_smoke$
declare
    v_capabilities jsonb;
    v_spec jsonb := '{
      "schemaVersion":2,
      "engineVersion":2,
      "subcategories":["general-comparison"],
      "assumptions":["All monetary values are entered by the calculator owner or member.","Dates are calendar dates without timezone conversion."],
      "inputs":[
        {"key":"amount","label":"Amount","type":"number","min":0,"max":1000,"default":12,"step":1,"unit":"EUR","control":"number"},
        {"key":"enabled","label":"Enabled","type":"boolean","default":true,"control":"toggle"},
        {"key":"plan","label":"Plan","type":"enum","default":"pro","control":"select","choices":[{"label":"Basic","value":"basic"},{"label":"Pro","value":"pro"}]},
        {"key":"start_date","label":"Start date","type":"date","default":"2026-01-31","control":"date"},
        {"key":"offset_days","label":"Offset days","type":"number","min":0,"max":365,"default":7,"step":1,"unit":"days","control":"number"}
      ],
      "groups":[],
      "results":[
        {"key":"eligible_amount","label":"Eligible amount","expression":"if(and(enabled,eq(plan,\"pro\")),amount,0)","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"The amount is included only when enabled for the Pro plan."},
        {"key":"date_span","label":"Calendar date span","expression":"date_diff_days(start_date,add_days(start_date,offset_days))","format":"unit","currency":"EUR","unit":"days","prefix":"","suffix":"","explanation":"A calendar-only date span."}
      ],
      "scenarios":[{"label":"Basic plan disabled","values":{"enabled":false,"plan":"basic","amount":0,"start_date":"2024-01-31"}}]
    }'::jsonb;
    v_id uuid;
    v_saved jsonb;
    v_published jsonb;
    v_detail jsonb;
    v_updated jsonb;
    v_blocked boolean := false;
    v_member_detail jsonb;
    v_runtime jsonb;
begin
    v_capabilities:=public.get_worth_it_ugc_schema_capabilities();
    if v_capabilities->>'v2_persistence' is distinct from 'true'
       or v_capabilities->>'v2_server_runtime' is distinct from 'true'
       or not (v_capabilities->'supported_schema_versions' @> '[2]'::jsonb) then
        raise exception 'The database must advertise V2 persistence after its migration: %',v_capabilities;
    end if;

    -- The preserved V1 validator remains available through the version dispatcher.
    perform private.worth_it_validate_ugc_spec('{
      "inputs":[{"key":"amount","label":"Amount","min":0,"max":100,"default":10,"step":1,"unit":""}],
      "results":[{"label":"Double amount","expression":"amount*2","format":"number"}]
    }'::jsonb);

    v_saved:=public.save_worth_it_ugc_calculator(
        null,
        'Typed V2 persistence smoke test',
        'Save and publish a typed V2 calculator using strict values and formulas.',
        'other',
        v_spec,
        'manual',
        null
    );
    v_id:=(v_saved->>'id')::uuid;
    if v_id is null or v_saved->>'success'<>'true' then
        raise exception 'A valid typed V2 calculator could not be saved: %',v_saved;
    end if;

    if not exists(
        select 1 from private.worth_it_user_calculators c
         where c.id=v_id
           and c.spec->>'schemaVersion'='2'
           and c.spec->>'engineVersion'='2'
           and jsonb_typeof(c.spec->'assumptions')='array'
           and not (c.spec ? 'subcategories')
    ) then
        raise exception 'The stored V2 schema or authoring metadata was not preserved correctly.';
    end if;

    v_published:=public.publish_worth_it_ugc_calculator(v_id,'public');
    if v_published->>'success'<>'true' or v_published->>'visibility'<>'public' then
        raise exception 'A validated typed V2 calculator could not be published: %',v_published;
    end if;

    v_detail:=public.get_worth_it_ugc_calculator(v_id);
    if v_detail->>'is_owner'<>'true'
       or v_detail->'spec'->>'schemaVersion'<>'2'
       or v_detail->'spec'->>'engineVersion'<>'2'
       or jsonb_array_length(v_detail->'spec'->'assumptions')<>2
       or (v_detail->>'require_test_before_reaction')::boolean is distinct from true then
        raise exception 'The persisted V2 calculator could not be read back with its typed schema and assumptions: %',v_detail;
    end if;

    if not ((v_detail->'spec'->'results'->0) ? 'expression') then
        raise exception 'The calculator owner must retain access to the original V2 formulas.';
    end if;

    -- Public non-owners keep typed inputs and output metadata but do not receive V2 formulas.
    perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
    v_member_detail:=public.get_worth_it_ugc_calculator(v_id);
    if v_member_detail->>'is_owner'<>'false'
       or v_member_detail->'spec'->>'schemaVersion'<>'2'
       or ((v_member_detail->'spec'->'results'->0) ? 'expression') then
        raise exception 'The public V2 detail RPC must redact formulas from non-owners: %',v_member_detail;
    end if;

    -- The private runtime lookup retains the real formula only for the verified public member.
    v_runtime:=public.get_worth_it_ugc_runtime_spec(v_id,'22222222-2222-4222-8222-222222222222');
    if v_runtime->'spec'->>'schemaVersion'<>'2'
       or v_runtime->'spec'->'results'->0->>'expression'<>'if(and(enabled,eq(plan,"pro")),amount,0)' then
        raise exception 'The server-only V2 runtime lookup did not return the stored formula.';
    end if;
    perform set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);

    -- Owner edits remain possible and still pass through the independent V2 validator.
    v_updated:=jsonb_set(v_spec,'{inputs,0,default}','15'::jsonb);
    perform public.save_worth_it_ugc_calculator(
        v_id,
        'Typed V2 persistence smoke test',
        'Save and publish a typed V2 calculator using strict values and formulas.',
        'other',
        v_updated,
        'manual',
        null
    );
    if (select (spec->'inputs'->0->>'default')::numeric
          from private.worth_it_user_calculators where id=v_id)<>15 then
        raise exception 'A valid owner edit did not update the typed V2 definition.';
    end if;

    -- A number/boolean formula type error must reject an update and leave the
    -- previously saved definition intact.
    v_blocked:=false;
    begin
        perform public.save_worth_it_ugc_calculator(
            v_id,
            'Typed V2 persistence smoke test',
            'Save and publish a typed V2 calculator using strict values and formulas.',
            'other',
            jsonb_set(v_updated,'{results,0,expression}',to_jsonb('amount * enabled'::text)),
            'manual',
            null
        );
    exception when sqlstate '22023' then
        v_blocked:=true;
    end;
    if not v_blocked then
        raise exception 'The database accepted a V2 formula that multiplies a number by a boolean.';
    end if;
    if (select (spec->'inputs'->0->>'default')::numeric
          from private.worth_it_user_calculators where id=v_id)<>15 then
        raise exception 'A rejected V2 update changed the saved calculator.';
    end if;

    -- An authenticated non-owner cannot replace or publish another member's V2 calculator.
    perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
    v_blocked:=false;
    begin
        perform public.save_worth_it_ugc_calculator(
            v_id,
            'Hijacked V2 calculator',
            'An unauthorized owner edit must be rejected by the database.',
            'other',
            v_updated,
            'manual',
            null
        );
    exception when insufficient_privilege then
        v_blocked:=true;
    end;
    if not v_blocked then
        raise exception 'A non-owner unexpectedly edited a persisted V2 calculator.';
    end if;
    v_blocked:=false;
    begin
        perform public.publish_worth_it_ugc_calculator(v_id,'public');
        raise exception 'A non-owner unexpectedly republished a V2 calculator.';
    exception when insufficient_privilege then
        v_blocked:=true;
    end;
    if not v_blocked then
        raise exception 'V2 publication ownership was not enforced.';
    end if;

    if has_function_privilege('anon','public.get_worth_it_ugc_schema_capabilities()','EXECUTE')
       or not has_function_privilege('authenticated','public.get_worth_it_ugc_schema_capabilities()','EXECUTE')
       or has_function_privilege('anon','private.worth_it_validate_ugc_v2_spec(jsonb)','EXECUTE')
       or has_function_privilege('authenticated','private.worth_it_validate_ugc_v2_spec(jsonb)','EXECUTE')
       or has_function_privilege('service_role','private.worth_it_validate_ugc_v2_spec(jsonb)','EXECUTE')
       or has_function_privilege('anon','private.worth_it_validate_ugc_spec(jsonb)','EXECUTE')
       or has_function_privilege('authenticated','private.worth_it_validate_ugc_spec(jsonb)','EXECUTE')
       or has_function_privilege('service_role','private.worth_it_validate_ugc_spec(jsonb)','EXECUTE')
       or has_function_privilege('anon','public.get_worth_it_ugc_runtime_spec(uuid,uuid)','EXECUTE')
       or has_function_privilege('authenticated','public.get_worth_it_ugc_runtime_spec(uuid,uuid)','EXECUTE')
       or not has_function_privilege('service_role','public.get_worth_it_ugc_runtime_spec(uuid,uuid)','EXECUTE') then
        raise exception 'V2 persistence capability or private validator privileges are not correctly restricted.';
    end if;
end
$v2_persistence_smoke$;

rollback;
