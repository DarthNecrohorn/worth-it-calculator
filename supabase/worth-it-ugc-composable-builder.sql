-- Extensible composable UGC calculator schema: chained result keys and bounded dynamic input groups.
-- Apply only after the existing UGC/community migrations have been reviewed in an isolated database.
begin;

create or replace function private.worth_it_validate_ugc_spec(p_spec jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
    v_supported_currency_codes constant text[] := array['AFN','EUR','ALL','DZD','USD','AOA','XCD','XAD','ARS','AMD','AWG','AUD','AZN','BSD','BHD','BDT','BBD','BYN','BZD','XOF','BMD','INR','BTN','BOB','BOV','BAM','BWP','NOK','BRL','BND','BIF','CVE','KHR','XAF','CAD','KYD','CLP','CLF','CNY','COP','COU','KMF','CDF','NZD','CRC','CUP','XCG','CZK','DKK','DJF','DOP','EGP','SVC','ERN','SZL','ETB','FKP','FJD','XPF','GMD','GEL','GHS','GIP','GTQ','GBP','GNF','GYD','HTG','HNL','HKD','HUF','ISK','IDR','XDR','IRR','IQD','ILS','JMD','JPY','JOD','KZT','KES','KPW','KRW','KWD','KGS','LAK','LBP','LSL','ZAR','LRD','LYD','CHF','MOP','MKD','MGA','MWK','MYR','MVR','MRU','MUR','XUA','MXN','MXV','MDL','MNT','MAD','MZN','MMK','NAD','NPR','NIO','NGN','OMR','PKR','PAB','PGK','PYG','PEN','PHP','PLN','QAR','RON','RUB','RWF','SHP','WST','STN','SAR','RSD','SCR','SLE','SGD','XSU','SBD','SOS','SSP','LKR','SDG','SRD','SEK','CHE','CHW','SYP','TWD','TJS','TZS','THB','TOP','TTD','TND','TRY','TMT','UGX','UAH','AED','USN','UYU','UYI','UYW','UZS','VUV','VES','VED','VND','YER','ZMW','ZWG','XBA','XBB','XBC','XBD','XTS','XXX','XAU','XPD','XPT','XAG','BGN']::text[];
    v_input jsonb;
    v_group jsonb;
    v_field jsonb;
    v_result jsonb;
    v_result_key text;
    v_choice jsonb;
    v_choice_count integer;
    v_scenario jsonb;
    v_override record;
    v_input_definition jsonb;
    v_scenario_label text;
    v_scenario_value numeric;
    v_key text;
    v_expression text;
    v_token text;
    v_match text[];
    v_allowed text[] := array[]::text[];
    v_depth integer;
    v_i integer;
    v_char text;
begin
    if coalesce(jsonb_typeof(p_spec),'') <> 'object'
       or coalesce(jsonb_typeof(p_spec->'inputs'),'') <> 'array'
       or coalesce(jsonb_typeof(p_spec->'results'),'') <> 'array'
       or jsonb_array_length(p_spec->'inputs') not between 1 and 24
       or jsonb_array_length(p_spec->'results') not between 1 and 20
       or octet_length(p_spec::text) > 32000 then
        raise exception 'Invalid calculator definition.' using errcode = '22023';
    end if;

    for v_input in select value from jsonb_array_elements(p_spec->'inputs') loop
        v_key := coalesce(v_input->>'key','');
        if v_key !~ '^[a-z][a-z0-9_]{0,31}$'
           or coalesce(v_input->>'label','') = ''
           or char_length(v_input->>'label') > 60
           or coalesce(jsonb_typeof(v_input->'min'),'') <> 'number'
           or coalesce(jsonb_typeof(v_input->'max'),'') <> 'number'
           or coalesce(jsonb_typeof(v_input->'default'),'') <> 'number'
           or (v_input->>'min')::numeric > (v_input->>'default')::numeric
           or (v_input->>'default')::numeric > (v_input->>'max')::numeric
           or (v_input->>'max')::numeric - (v_input->>'min')::numeric > 1000000000000 then
            raise exception 'Invalid calculator input definition.' using errcode = '22023';
        end if;
        if v_key = any(v_allowed) then
            raise exception 'Duplicate calculator input key.' using errcode = '22023';
        end if;
        v_allowed := array_append(v_allowed,v_key);

        if v_input ? 'control' and v_input->>'control' not in ('number','slider','select','toggle') then
            raise exception 'Unsupported calculator input control.' using errcode = '22023';
        end if;
        if coalesce(v_input->>'control','number')='toggle'
           and ((v_input->>'min')::numeric<>0 or (v_input->>'max')::numeric<>1
                or coalesce((v_input->>'step')::numeric,0)<>1
                or (v_input->>'default')::numeric not in (0,1)) then
            raise exception 'Toggle inputs must use 0/1 values and a step of 1.' using errcode = '22023';
        end if;
        if coalesce(v_input->>'control','number')='select' then
            if coalesce(jsonb_typeof(v_input->'choices'),'')<>'array'
               or jsonb_array_length(v_input->'choices') not between 2 and 12 then
                raise exception 'Dropdown inputs require 2 to 12 choices.' using errcode = '22023';
            end if;
            select count(*) into v_choice_count
              from jsonb_array_elements(v_input->'choices') as choice(value)
             where coalesce(jsonb_typeof(choice.value->'label'),'')='string'
               and char_length(btrim(choice.value->>'label')) between 1 and 50
               and coalesce(jsonb_typeof(choice.value->'value'),'')='number'
               and abs((choice.value->>'value')::numeric)<=1000000000000;
            if v_choice_count<>jsonb_array_length(v_input->'choices') then
                raise exception 'A dropdown choice has an invalid label or numeric value.' using errcode = '22023';
            end if;
            if (select count(distinct (choice.value->>'value')::numeric)
                  from jsonb_array_elements(v_input->'choices') as choice(value))<>v_choice_count
               or (select count(distinct lower(btrim(choice.value->>'label')))
                     from jsonb_array_elements(v_input->'choices') as choice(value))<>v_choice_count
               or not exists(select 1 from jsonb_array_elements(v_input->'choices') as choice(value)
                              where (choice.value->>'value')::numeric=(v_input->>'default')::numeric) then
                raise exception 'Dropdown choices must have unique labels and values and include the default.' using errcode = '22023';
            end if;
        end if;
    end loop;


    -- Dynamic groups are definitions only; visitor-entered rows are bounded
    -- at runtime and are never persisted as part of the calculator definition.
    if p_spec ? 'groups' then
        if coalesce(jsonb_typeof(p_spec->'groups'),'') <> 'array'
           or jsonb_array_length(p_spec->'groups') > 4 then
            raise exception 'A calculator can define up to four dynamic input groups.' using errcode = '22023';
        end if;
        for v_group in select value from jsonb_array_elements(p_spec->'groups') loop
            v_key := coalesce(v_group->>'key','');
            if v_key !~ '^[a-z][a-z0-9_]{0,31}$'
               or v_key = any(v_allowed)
               or coalesce(v_group->>'label','') = ''
               or char_length(v_group->>'label') > 60
               or coalesce(v_group->>'itemLabel','Item') = ''
               or char_length(coalesce(v_group->>'itemLabel','Item')) > 40
               or coalesce(jsonb_typeof(v_group->'minItems'),'number') <> 'number'
               or coalesce(jsonb_typeof(v_group->'maxItems'),'number') <> 'number'
               or coalesce((v_group->>'minItems')::numeric,1) <> trunc(coalesce((v_group->>'minItems')::numeric,1))
               or coalesce((v_group->>'maxItems')::numeric,10) <> trunc(coalesce((v_group->>'maxItems')::numeric,10))
               or coalesce((v_group->>'minItems')::integer,1) < 1
               or coalesce((v_group->>'maxItems')::integer,10) < coalesce((v_group->>'minItems')::integer,1)
               or coalesce((v_group->>'maxItems')::integer,10) > 20
               or coalesce(jsonb_typeof(v_group->'fields'),'') <> 'array'
               or jsonb_array_length(v_group->'fields') not between 1 and 6 then
                raise exception 'Invalid dynamic input group definition.' using errcode = '22023';
            end if;
            v_allowed := array_append(v_allowed,v_key);
            for v_field in select value from jsonb_array_elements(v_group->'fields') loop
                v_key := coalesce(v_field->>'key','');
                if v_key !~ '^[a-z][a-z0-9_]{0,31}$'
                   or v_key = any(v_allowed)
                   or coalesce(v_field->>'label','') = ''
                   or char_length(v_field->>'label') > 60
                   or coalesce(jsonb_typeof(v_field->'min'),'') <> 'number'
                   or coalesce(jsonb_typeof(v_field->'max'),'') <> 'number'
                   or coalesce(jsonb_typeof(v_field->'default'),'') <> 'number'
                   or coalesce(jsonb_typeof(v_field->'step'),'') <> 'number'
                   or (v_field->>'min')::numeric > (v_field->>'default')::numeric
                   or (v_field->>'default')::numeric > (v_field->>'max')::numeric
                   or (v_field->>'step')::numeric <= 0
                   or (v_field->>'max')::numeric - (v_field->>'min')::numeric > 1000000000000
                   or char_length(coalesce(v_field->>'unit','')) > 16 then
                    raise exception 'Invalid dynamic input group field.' using errcode = '22023';
                end if;
                v_allowed := array_append(v_allowed,v_key);
            end loop;
        end loop;
    end if;

    for v_result in select value from jsonb_array_elements(p_spec->'results') loop
        v_expression := coalesce(v_result->>'expression','');
        v_result_key := btrim(coalesce(v_result->>'key',''));
        if v_result_key <> '' and (v_result_key !~ '^[a-z][a-z0-9_]{0,31}$' or v_result_key = any(v_allowed)) then
            raise exception 'Result variable keys must be unique lowercase names and cannot reuse input or group keys.' using errcode = '22023';
        end if;
        if (v_result ? 'explanation'
            and (coalesce(jsonb_typeof(v_result->'explanation'),'') <> 'string'
                 or char_length(v_result->>'explanation') > 280)) then
            raise exception 'Invalid result explanation. Use up to 280 plain-text characters.' using errcode = '22023';
        end if;
        if coalesce(v_result->>'label','') = ''
           or char_length(v_result->>'label') > 70
           or coalesce(v_result->>'format','number') not in ('number','currency','percent','unit')
           or (coalesce(v_result->>'format','number')='currency'
               and not (upper(coalesce(v_result->>'currency','')) = any(v_supported_currency_codes)))
           or (coalesce(v_result->>'format','number')='unit'
               and (coalesce(v_result->>'unit','')='' or char_length(v_result->>'unit')>20))
           or char_length(v_expression) > 500
           or v_expression !~ '^[A-Za-z0-9_+*/^().,[:space:]-]+$' then
            raise exception 'Invalid calculator result definition.' using errcode = '22023';
        end if;

        -- Dotted references are only valid for declared dynamic group fields.
        for v_match in select regexp_matches(v_expression,'([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)','g') loop
            if not exists(
                select 1
                  from jsonb_array_elements(coalesce(p_spec->'groups','[]'::jsonb)) as groups(value)
                  cross join jsonb_array_elements(groups.value->'fields') as fields(value)
                 where groups.value->>'key'=v_match[1]
                   and fields.value->>'key'=v_match[2]
            ) then
                raise exception 'Formula references an unknown dynamic group field.' using errcode = '22023';
            end if;
        end loop;

        v_depth := 0;
        for v_i in 1..char_length(v_expression) loop
            v_char := substr(v_expression,v_i,1);
            if v_char = '(' then v_depth := v_depth + 1; end if;
            if v_char = ')' then
                v_depth := v_depth - 1;
                if v_depth < 0 then raise exception 'Unbalanced calculator formula.' using errcode = '22023'; end if;
            end if;
        end loop;
        if v_depth <> 0 then raise exception 'Unbalanced calculator formula.' using errcode = '22023'; end if;

        for v_match in select regexp_matches(v_expression,'[A-Za-z_][A-Za-z0-9_]*','g') loop
            v_token := v_match[1];
            if not (v_token = any(v_allowed))
               and v_token not in ('min','max','abs','round','floor','ceil','sqrt','pow','clamp','avg','mod','trunc','sign','hypot','log','ln','exp','sin','cos','tan','asin','acos','atan','if','gt','gte','lt','lte','eq','neq','and','or','not','sum','count','pi','e') then
                raise exception 'Formula contains an unsupported variable or function.' using errcode = '22023';
            end if;
        end loop;
        if v_result_key <> '' then v_allowed := array_append(v_allowed,v_result_key); end if;
    end loop;

    -- Optional comparison scenarios contain numeric overrides for known inputs.
    -- The original input defaults remain the baseline; each scenario can change
    -- only values that are already part of the calculator definition.
    if p_spec ? 'scenarios' then
        if coalesce(jsonb_typeof(p_spec->'scenarios'),'') <> 'array'
           or jsonb_array_length(p_spec->'scenarios') > 3 then
            raise exception 'A calculator can define up to three comparison scenarios.' using errcode = '22023';
        end if;

        for v_scenario in select value from jsonb_array_elements(p_spec->'scenarios') loop
            v_scenario_label := btrim(coalesce(v_scenario->>'label',''));
            if char_length(v_scenario_label) not between 2 and 50
               or coalesce(jsonb_typeof(v_scenario->'values'),'') <> 'object'
               or (v_scenario->'values') = '{}'::jsonb then
                raise exception 'Each comparison scenario needs a unique name and at least one input value.' using errcode = '22023';
            end if;

            for v_override in select key,value from jsonb_each(v_scenario->'values') loop
                select value into v_input_definition
                  from jsonb_array_elements(p_spec->'inputs') as inputs(value)
                 where value->>'key'=v_override.key
                 limit 1;
                if not found
                   or coalesce(jsonb_typeof(v_override.value),'') <> 'number' then
                    raise exception 'A comparison scenario references an unknown input or non-numeric value.' using errcode = '22023';
                end if;

                v_scenario_value := (v_override.value #>> '{}')::numeric;
                if v_scenario_value < (v_input_definition->>'min')::numeric
                   or v_scenario_value > (v_input_definition->>'max')::numeric then
                    raise exception 'A comparison scenario value is outside its input range.' using errcode = '22023';
                end if;
                if coalesce(v_input_definition->>'control','number')='toggle'
                   and v_scenario_value not in (0,1) then
                    raise exception 'A comparison scenario toggle must be 0 or 1.' using errcode = '22023';
                end if;
                if coalesce(v_input_definition->>'control','number')='select'
                   and not exists(
                       select 1 from jsonb_array_elements(v_input_definition->'choices') as options(value)
                        where (options.value->>'value')::numeric=v_scenario_value
                   ) then
                    raise exception 'A comparison scenario value must match one of its dropdown choices.' using errcode = '22023';
                end if;
            end loop;
        end loop;

        if exists(
            select 1
              from jsonb_array_elements(p_spec->'scenarios') with ordinality as first_scenario(value,position)
              join jsonb_array_elements(p_spec->'scenarios') with ordinality as second_scenario(value,position)
                on first_scenario.position<second_scenario.position
             where lower(btrim(coalesce(first_scenario.value->>'label','')))=lower(btrim(coalesce(second_scenario.value->>'label','')))
        ) then
            raise exception 'Comparison scenario names must be unique.' using errcode = '22023';
        end if;
    end if;
end;
$$;

commit;
