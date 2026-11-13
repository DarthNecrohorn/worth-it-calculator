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
   {"key":"days_ahead","label":"Days ahead","type":"number","min":0,"max":30,"default":7,"step":1,"unit":"days","control":"number"}
  ],
  "groups":[
   {"key":"expenses","label":"Expenses","itemLabel":"Expense","minItems":1,"maxItems":5,"fields":[
    {"key":"amount","label":"Amount","type":"number","min":0,"max":1000,"default":20,"step":1,"unit":"EUR"},
    {"key":"taxable","label":"Taxable","type":"boolean","default":true},
    {"key":"kind","label":"Kind","type":"enum","default":"fixed","choices":[{"label":"Fixed","value":"fixed"},{"label":"Variable","value":"variable"}]},
    {"key":"due_date","label":"Due date","type":"date","default":"2026-02-15"}
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
 begin perform private.worth_it_validate_ugc_spec(v_valid);raise exception 'Persistence gate unexpectedly accepted V2.' using errcode='P0001';
 exception when sqlstate '22023' then null;end;
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
