-- Database-side V2 schema/formula validation smoke tests.
-- Run in a disposable PostgreSQL database after worth-it-ugc-v2-database-validator.sql.
do $v2_database_validator_smoke$
declare
 v_valid jsonb := '{
  "schemaVersion":2,"engineVersion":2,
  "inputs":[
   {"key":"base_cost","label":"Base cost","type":"number","min":0,"max":1000,"default":100,"step":1,"unit":"EUR","control":"number"},
   {"key":"include_tax","label":"Include tax","type":"boolean","default":true,"control":"toggle"},
   {"key":"plan","label":"Plan","type":"enum","default":"pro","control":"select","choices":[{"label":"Basic","value":"basic"},{"label":"Pro","value":"pro"}]},
   {"key":"start_date","label":"Start date","type":"date","default":"2026-01-31","control":"date"},
   {"key":"days_ahead","label":"Days ahead","type":"number","min":0,"max":30,"default":7,"step":1,"unit":"days","control":"number"},
   {"key":"interest_rate","label":"Interest rate","type":"number","min":0,"max":1,"default":0.05,"step":0.01,"unit":"","control":"number"},
   {"key":"periods","label":"Periods","type":"number","min":1,"max":120,"default":12,"step":1,"unit":"","control":"number"}
  ],
  "groups":[
   {"key":"expenses","label":"Expenses","itemLabel":"Expense","minItems":1,"maxItems":5,"fields":[
    {"key":"amount","label":"Amount","type":"number","min":0,"max":1000,"default":20,"step":1,"unit":"EUR"},
    {"key":"taxable","label":"Taxable","type":"boolean","default":true},
    {"key":"kind","label":"Kind","type":"enum","default":"fixed","choices":[{"label":"Fixed","value":"fixed"},{"label":"Variable","value":"variable"}]},
    {"key":"due_date","label":"Due date","type":"date","default":"2026-02-15"},
    {"key":"weight","label":"Weight","type":"number","min":0,"max":100,"default":1,"step":1,"unit":""},
    {"key":"score","label":"Score","type":"number","min":0,"max":100,"default":10,"step":1,"unit":""}
   ]}
  ],
  "results":[
   {"key":"eligible_expenses","label":"Eligible expenses","expression":"sum_if(expenses.amount,and(expenses.taxable,eq(expenses.kind,\"fixed\")))","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Taxable fixed expenses."},
   {"key":"eligible_count","label":"Eligible expense count","expression":"count_if(and(expenses.taxable,eq(expenses.kind,\"fixed\")))","format":"number","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Count qualifying rows."},
   {"key":"tax_amount","label":"Tax amount","expression":"if(and(include_tax,eq(plan,\"pro\")),base_cost*0.2,0)","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Tax is conditional."},
   {"key":"final_total","label":"Final total","expression":"base_cost+eligible_expenses+tax_amount","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Base, eligible expenses and tax."},
   {"key":"days_to_next_month","label":"Days to next month","expression":"date_diff_days(start_date,add_months(start_date,1))","format":"unit","currency":"EUR","unit":"days","prefix":"","suffix":"","explanation":"Calendar month span."},
   {"key":"days_ahead_span","label":"Days ahead span","expression":"date_diff_days(start_date,add_days(start_date,days_ahead))","format":"unit","currency":"EUR","unit":"days","prefix":"","suffix":"","explanation":"Typed date offset."},
   {"key":"pro_selected","label":"Pro selected","expression":"if(eq(plan,\"pro\"),1,0)","format":"number","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Enum equality."},
   {"key":"date_gate","label":"Due after date","expression":"count_if(gt(expenses.due_date,\"2026-02-15\"))","format":"number","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Calendar-date predicate."}
   ,{"key":"median_amount","label":"Median amount","expression":"median(expenses.amount)","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Median over one group."}
   ,{"key":"variance_score","label":"Score variance","expression":"variance(expenses.score)","format":"number","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Population variance."}
   ,{"key":"stddev_score","label":"Score deviation","expression":"stddev(expenses.score)","format":"number","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Population standard deviation."}
   ,{"key":"p75_amount","label":"75th percentile","expression":"percentile(expenses.amount,75)","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Interpolated percentile."}
   ,{"key":"weighted_amount","label":"Weighted amount","expression":"weighted_avg(expenses.amount,expenses.weight)","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Weighted average over one group."}
   ,{"key":"future_value","label":"Future value","expression":"compound_interest(base_cost,interest_rate,periods)","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Compound interest."}
   ,{"key":"present_value","label":"Present value","expression":"present_value(base_cost,interest_rate,periods)","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Discounted value."}
   ,{"key":"loan_payment","label":"Loan payment","expression":"loan_payment(base_cost,interest_rate,periods)","format":"currency","currency":"EUR","unit":"","prefix":"","suffix":"","explanation":"Periodic payment."}
  ],
  "scenarios":[{"label":"Basic plan","values":{"plan":"basic","include_tax":false,"start_date":"2024-01-31","base_cost":80}}]
 }'::jsonb;
 v_invalid jsonb;v_formula text;
 v_bad_formulas text[]:=array[
  'base_cost+include_tax','and(include_tax,plan)','if(include_tax,base_cost,plan)',
  'if(eq(plan,"enterprise"),1,0)','date_diff_days(start_date,12)','add_days(start_date,1.5)',
  'unknown_variable+1','sum_if(expenses.amount,eq(other_expenses.amount,1))','expenses.amount','pg_sleep(1)','base_cost + ('
 ];
begin
 perform private.worth_it_validate_ugc_v2_spec(v_valid);
 v_invalid:=jsonb_set(v_valid,'{inputs,1,default}','1'::jsonb);
 begin perform private.worth_it_validate_ugc_v2_spec(v_invalid);raise exception 'Accepted numeric boolean default.' using errcode='P0001';
 exception when sqlstate '22023' then null;end;
 v_invalid:=jsonb_set(v_valid,'{inputs,3,default}','"2026-02-30"'::jsonb);
 begin perform private.worth_it_validate_ugc_v2_spec(v_invalid);raise exception 'Accepted impossible date.' using errcode='P0001';
 exception when sqlstate '22023' then null;end;
 v_invalid:=jsonb_set(v_valid,'{inputs,2,choices,1,value}','"basic"'::jsonb);
 begin perform private.worth_it_validate_ugc_v2_spec(v_invalid);raise exception 'Accepted duplicate enum value.' using errcode='P0001';
 exception when sqlstate '22023' then null;end;
 foreach v_formula in array v_bad_formulas loop
  v_invalid:=jsonb_set(v_valid,'{results,0,expression}',to_jsonb(v_formula));
  begin perform private.worth_it_validate_ugc_v2_spec(v_invalid);raise exception 'Accepted invalid formula: %',v_formula using errcode='P0001';
  exception when sqlstate '22023' then null;end;
 end loop;
 -- The version-aware persistence dispatcher now routes V2 to the independent
 -- database validator. Actual save/publish/ownership checks run in the separate
 -- ugc-v2-persistence-postgres-smoke.sql fixture.
 perform private.worth_it_validate_ugc_spec(v_valid);
 if has_function_privilege('anon','private.worth_it_validate_ugc_v2_spec(jsonb)','EXECUTE')
  or has_function_privilege('authenticated','private.worth_it_validate_ugc_v2_spec(jsonb)','EXECUTE')
  or has_function_privilege('service_role','private.worth_it_validate_ugc_v2_spec(jsonb)','EXECUTE')
  or has_function_privilege('anon','private.worth_it_v2_parse_expression(text,integer,integer,jsonb,jsonb,integer)','EXECUTE')
  or has_function_privilege('authenticated','private.worth_it_v2_parse_expression(text,integer,integer,jsonb,jsonb,integer)','EXECUTE')
  or has_function_privilege('service_role','private.worth_it_v2_parse_expression(text,integer,integer,jsonb,jsonb,integer)','EXECUTE') then
  raise exception 'V2 validator helpers have unexpected API-role execution grants.';
 end if;
end
$v2_database_validator_smoke$;

-- Browser/SQL unit-registry parity cases. These are the vectors emitted by unitDescriptor().
do $v2_unit_registry_smoke$
declare
 v_case record;
 v_cases jsonb := '[
  ["",{}],["1",{}],["%",{}],["EUR",{"currency:eur":1}],["USD",{"currency:usd":1}],["RSD",{"currency:rsd":1}],
  ["%/year",{"time":-1}],["%/month",{"time":-1}],["%/day",{"time":-1}],
  ["day",{"time":1}],["days",{"time":1}],["week",{"time":1}],["weeks",{"time":1}],["month",{"time":1}],["months",{"time":1}],
  ["hour",{"time":1}],["hours",{"time":1}],["hr",{"time":1}],["hrs",{"time":1}],["h",{"time":1}],["minute",{"time":1}],["minutes",{"time":1}],["second",{"time":1}],["seconds",{"time":1}],["s",{"time":1}],
  ["km",{"length":1}],["kilometres",{"length":1}],["kilometers",{"length":1}],["mile",{"length":1}],["miles",{"length":1}],["m",{"length":1}],["cm",{"length":1}],["mm",{"length":1}],
  ["m²",{"area":1}],["m2",{"area":1}],["ft²",{"area":1}],["l",{"volume":1}],["litres",{"volume":1}],["liters",{"volume":1}],["m³",{"volume":1}],["m3",{"volume":1}],["ml",{"volume":1}],
  ["kg",{"mass":1}],["kilograms",{"mass":1}],["g",{"mass":1}],["grams",{"mass":1}],["tonnes",{"mass":1}],
  ["b",{"data":1}],["kb",{"data":1}],["mb",{"data":1}],["gb",{"data":1}],["tb",{"data":1}],["pb",{"data":1}],
  ["Wh",{"energy":1}],["kWh",{"energy":1}],["MWh",{"energy":1}],["MJ",{"energy":1}],["W",{"power":1}],["kW",{"power":1}],
  ["token",{"token":1}],["tokens",{"token":1}],["items",{"count":1}],["vehicles",{"count":1}],["period",{}],
  ["l/100 km",{"volume":1,"length":-1}],["km/h",{"length":1,"time":-1}],["m/s",{"length":1,"time":-1}],
  ["m²/pack",{"area":1,"count":-1}],["kWh/day",{"energy":1,"time":-1}],["kWh/month",{"energy":1,"time":-1}],
  ["EUR/kWh",{"currency:eur":1,"energy":-1}],["USD/l",{"currency:usd":1,"volume":-1}],["RSD/kg",{"currency:rsd":1,"mass":-1}],
  ["USD/hour",{"currency:usd":1,"time":-1}],["EUR/person/day",{"currency:eur":1,"count":-1,"time":-1}],["USD/token",{"currency:usd":1,"token":-1}],
  ["GB/hour",{"data":1,"time":-1}],["widgets/hour",{"unit:widgets":1,"time":-1}],["widgets",{"unit:widgets":1}]
 ]'::jsonb;
 v_actual jsonb;
 v_descriptor jsonb;
begin
 for v_case in select value from jsonb_array_elements(v_cases) loop
  v_actual:=private.worth_it_v2_unit_vector(v_case.value->>0);
  if v_actual<>v_case.value->1 then
   raise exception 'Unit vector mismatch for %: expected %, got %.',v_case.value->>0,v_case.value->1,v_actual;
  end if;
 end loop;
 v_descriptor:=private.worth_it_v2_unit_descriptor('kW*hour');
 if v_descriptor->'vector'<>'{"energy":1}'::jsonb or v_descriptor->'symbols'->>'energy'<>'kWh' then
  raise exception 'kW*hour did not normalize to kWh: %.',v_descriptor;
 end if;
 v_descriptor:=private.worth_it_v2_unit_descriptor('W*hours');
 if v_descriptor->'vector'<>'{"energy":1}'::jsonb or v_descriptor->'symbols'->>'energy'<>'Wh' then
  raise exception 'W*hours did not normalize to Wh: %.',v_descriptor;
 end if;
end
$v2_unit_registry_smoke$;

-- Derived unit algebra follows the same descriptor rules as the shared JS engine.
do $v2_derived_unit_formula_smoke$
declare
 v_unit_spec jsonb := '{
  "schemaVersion":2,"engineVersion":2,
  "inputs":[
   {"key":"power","label":"Power","type":"number","min":0,"max":20,"default":2,"step":1,"unit":"kW","control":"number"},
   {"key":"duration","label":"Duration","type":"number","min":0,"max":20,"default":3,"step":1,"unit":"hours","control":"number"},
   {"key":"storage","label":"Storage","type":"number","min":0,"max":100,"default":12,"step":1,"unit":"GB","control":"number"},
   {"key":"elapsed","label":"Elapsed","type":"number","min":1,"max":20,"default":2,"step":1,"unit":"hour","control":"number"},
   {"key":"distance","label":"Distance","type":"number","min":0,"max":100,"default":10,"step":1,"unit":"km","control":"number"},
   {"key":"widgets","label":"Widgets","type":"number","min":1,"max":20,"default":4,"step":1,"unit":"widgets","control":"number"}
  ],"groups":[],"results":[
   {"key":"energy","label":"Energy","expression":"power * duration","format":"unit","currency":"EUR","unit":"kWh","prefix":"","suffix":"","explanation":"Power multiplied by hours."},
   {"key":"storage_rate","label":"Storage rate","expression":"storage / elapsed","format":"unit","currency":"EUR","unit":"GB/hour","prefix":"","suffix":"","explanation":"Storage per elapsed hour."},
   {"key":"velocity","label":"Velocity","expression":"distance / elapsed","format":"unit","currency":"EUR","unit":"km/hour","prefix":"","suffix":"","explanation":"Distance per elapsed hour."},
   {"key":"widget_rate","label":"Widget rate","expression":"widgets / elapsed","format":"unit","currency":"EUR","unit":"widgets/hour","prefix":"","suffix":"","explanation":"Opaque widget unit per hour."}
  ],"scenarios":[]
 }'::jsonb;
begin
 perform private.worth_it_validate_ugc_v2_spec(v_unit_spec);
end
$v2_derived_unit_formula_smoke$;
