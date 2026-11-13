-- Independent PostgreSQL-side validation for Worth It Calculator schema/engine v2.
-- This validator is intentionally private and is NOT wired into save/publish yet.
-- The existing version gate continues to reject V2 persistence.
begin;

create or replace function private.worth_it_v2_assert_keys(p_object jsonb,p_allowed text[],p_label text)
returns void language plpgsql immutable set search_path=pg_catalog as $$
declare v_key text;
begin
 if coalesce(jsonb_typeof(p_object),'')<>'object' then raise exception '% must be an object.',p_label using errcode='22023'; end if;
 select key into v_key from jsonb_object_keys(p_object) as keys(key) where not(key=any(p_allowed)) limit 1;
 if found then raise exception '% contains an unsupported property: %.',p_label,v_key using errcode='22023'; end if;
end;
$$;

create or replace function private.worth_it_v2_merge_refs(p_left jsonb,p_right jsonb)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(to_jsonb(ref) order by ref),'[]'::jsonb)
 from (select distinct value #>> '{}' ref from jsonb_array_elements(coalesce(p_left,'[]'::jsonb)||coalesce(p_right,'[]'::jsonb)) where jsonb_typeof(value)='string') refs
$$;

create or replace function private.worth_it_v2_unit_vector(p_unit text)
returns jsonb language plpgsql immutable set search_path=pg_catalog as $$
declare v_raw text:=btrim(coalesce(p_unit,'')); v_key text:=lower(regexp_replace(btrim(coalesce(p_unit,'')),'\s+',' ','g')); v_dimension text;
begin
 if v_raw='' or v_raw='1' or v_key='%' or v_key in ('period','periods','occurrences','times') then return '{}'::jsonb; end if;
 if v_raw ~ '^[A-Z]{3}$' then return jsonb_build_object('currency:'||lower(v_raw),1); end if;
 v_dimension:=case
  when v_key in ('day','days','week','weeks','month','months','year','years','hour','hours','hr','hrs','h','minute','minutes','second','seconds','s') then 'time'
  when v_key in ('km','kilometres','kilometers','mile','miles','m','cm','mm') then 'length'
  when v_key in ('m²','m2','ft²') then 'area'
  when v_key in ('l','litres','liters','m³','m3','ml') then 'volume'
  when v_key in ('kg','kilograms','g','grams','tonnes') then 'mass'
  when v_key in ('b','kb','mb','gb','tb','pb') then 'data'
  when v_key in ('kwh','mwh','mj','wh') then 'energy'
  when v_key in ('w','kw') then 'power'
  when v_key in ('token','tokens') then 'token'
  when v_key in ('item','items','unit','units','pack','packs','person','people','user','users','vehicle','vehicles','car','cars','request','requests','read','reads','write','writes','call','calls','device','devices') then 'count'
  else null end;
 if v_dimension is not null then return jsonb_build_object(v_dimension,1); end if;
 if v_key in ('km/h','m/s','l/100 km','kwh/day','kwh/month','m²/pack') then
  return case v_key when 'km/h' then '{"length":1,"time":-1}'::jsonb when 'm/s' then '{"length":1,"time":-1}'::jsonb
   when 'l/100 km' then '{"volume":1,"length":-1}'::jsonb when 'kwh/day' then '{"energy":1,"time":-1}'::jsonb
   when 'kwh/month' then '{"energy":1,"time":-1}'::jsonb else '{"area":1,"count":-1}'::jsonb end;
 end if;
 if v_key in ('eur/kwh','usd/kwh','rsd/kwh','eur/l','usd/l','rsd/l','eur/kg','eur/m²','eur/m2','eur/m³','eur/m3','eur/hour','usd/hour','eur/month','eur/day','eur/person/day','usd/person/day','eur/unit','eur/item','eur/pack','usd/unit','usd/item','rsd/unit') then
  return case v_key when 'eur/kwh' then '{"currency:eur":1,"energy":-1}'::jsonb when 'usd/kwh' then '{"currency:usd":1,"energy":-1}'::jsonb
   when 'rsd/kwh' then '{"currency:rsd":1,"energy":-1}'::jsonb when 'eur/l' then '{"currency:eur":1,"volume":-1}'::jsonb
   when 'usd/l' then '{"currency:usd":1,"volume":-1}'::jsonb when 'rsd/l' then '{"currency:rsd":1,"volume":-1}'::jsonb
   when 'eur/kg' then '{"currency:eur":1,"mass":-1}'::jsonb when 'eur/m²' then '{"currency:eur":1,"area":-1}'::jsonb
   when 'eur/m2' then '{"currency:eur":1,"area":-1}'::jsonb when 'eur/m³' then '{"currency:eur":1,"volume":-1}'::jsonb
   when 'eur/m3' then '{"currency:eur":1,"volume":-1}'::jsonb when 'eur/hour' then '{"currency:eur":1,"time":-1}'::jsonb
   when 'usd/hour' then '{"currency:usd":1,"time":-1}'::jsonb when 'eur/month' then '{"currency:eur":1,"time":-1}'::jsonb
   when 'eur/day' then '{"currency:eur":1,"time":-1}'::jsonb when 'eur/person/day' then '{"currency:eur":1,"count":-1,"time":-1}'::jsonb
   when 'usd/person/day' then '{"currency:usd":1,"count":-1,"time":-1}'::jsonb when 'eur/unit' then '{"currency:eur":1,"count":-1}'::jsonb
   when 'eur/item' then '{"currency:eur":1,"count":-1}'::jsonb when 'eur/pack' then '{"currency:eur":1,"count":-1}'::jsonb
   when 'usd/unit' then '{"currency:usd":1,"count":-1}'::jsonb else '{"currency:rsd":1,"count":-1}'::jsonb end;
 end if;
 return jsonb_build_object('unit:'||v_key,1);
end;
$$;

create or replace function private.worth_it_v2_unit_combine(p_left jsonb,p_right jsonb,p_sign integer)
returns jsonb language plpgsql immutable set search_path=pg_catalog as $$
declare v_out jsonb:='{}'::jsonb; v_key text; v_value numeric; v_keys text[];
begin
 select coalesce(array_agg(distinct key),'{}'::text[]) into v_keys from
 (select jsonb_object_keys(coalesce(p_left,'{}'::jsonb)) key union all select jsonb_object_keys(coalesce(p_right,'{}'::jsonb)) key) all_keys;
 foreach v_key in array v_keys loop
  v_value:=coalesce((p_left->>v_key)::numeric,0)+p_sign*coalesce((p_right->>v_key)::numeric,0);
  if abs(v_value)>0.0000000001 then v_out:=jsonb_set(v_out,array[v_key],to_jsonb(v_value),true); end if;
 end loop;
 return v_out;
end;
$$;

create or replace function private.worth_it_v2_is_iso_date(p_value text)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
begin
 if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or substring(p_value,1,4)='0000' then return false; end if;
 return to_char(p_value::date,'YYYY-MM-DD')=p_value;
exception when others then return false;
end;
$$;

create or replace function private.worth_it_v2_enum_values(p_choices jsonb)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(choice.value->'value' order by choice.ordinality),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_choices,'[]'::jsonb)) with ordinality as choice(value,ordinality)
$$;

create or replace function private.worth_it_v2_compatible_unit(p_nodes jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,private as $$
declare v_node jsonb; v_target jsonb:='{}'::jsonb; v_has_target boolean:=false; v_vector jsonb;
begin
 for v_node in select value from jsonb_array_elements(coalesce(p_nodes,'[]'::jsonb)) loop
  v_vector:=coalesce(v_node->'unit_vector','{}'::jsonb);
  if v_vector<>'{}'::jsonb then
   if not v_has_target then v_target:=v_vector;v_has_target:=true;
   elsif v_target<>v_vector then raise exception 'Formula values use incompatible units.' using errcode='22023'; end if;
  end if;
 end loop;
 if v_has_target then
  for v_node in select value from jsonb_array_elements(coalesce(p_nodes,'[]'::jsonb)) loop
   v_vector:=coalesce(v_node->'unit_vector','{}'::jsonb);
   if v_vector='{}'::jsonb and coalesce((v_node->>'is_constant')::boolean,false) is not true then
    raise exception 'Formula values use incompatible units.' using errcode='22023';
   end if;
  end loop;
  return v_target;
 end if;
 return '{}'::jsonb;
end;
$$;

create or replace function private.worth_it_v2_infer_call(p_name text,p_args jsonb,p_groups jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,private as $$
declare
 v_count integer:=jsonb_array_length(coalesce(p_args,'[]'::jsonb)); v_a jsonb;v_b jsonb;v_c jsonb;
 v_refs jsonb:='[]'::jsonb;v_node jsonb;v_units jsonb:='[]'::jsonb;v_unit jsonb:='{}'::jsonb;
 v_exponent numeric;v_value text;
begin
 v_a:=p_args->0;v_b:=p_args->1;v_c:=p_args->2;
 if p_name not in ('min','max','abs','round','floor','ceil','sqrt','pow','clamp','avg','sum','count','mod','trunc','sign','hypot','log','ln','exp','sin','cos','tan','asin','acos','atan','if','gt','gte','lt','lte','eq','neq','and','or','not','sum_if','count_if','date_diff_days','add_days','add_months','days_in_month','calendar_year','calendar_month','weekday') then
  raise exception 'Unsupported calculator formula function: %.',p_name using errcode='22023';
 end if;
 if (p_name in ('min','max','avg') and v_count not between 1 and 12)
  or (p_name='hypot' and v_count not between 2 and 8)
  or (p_name in ('round','log') and v_count not between 1 and 2)
  or (p_name in ('and','or') and v_count not between 2 and 12)
  or (p_name in ('if','clamp') and v_count<>3)
  or (p_name in ('pow','mod','gt','gte','lt','lte','eq','neq','sum_if','date_diff_days','add_days','add_months') and v_count<>2)
  or (p_name in ('sum','count','count_if','not','abs','floor','ceil','sqrt','trunc','sign','ln','exp','sin','cos','tan','asin','acos','atan','days_in_month','calendar_year','calendar_month','weekday') and v_count<>1) then
  raise exception '%() has an invalid number of arguments.',p_name using errcode='22023';
 end if;
 for v_node in select value from jsonb_array_elements(p_args) loop
  v_refs:=private.worth_it_v2_merge_refs(v_refs,coalesce(v_node->'group_refs','[]'::jsonb));
 end loop;

 if p_name='if' then
  if v_a->>'kind'<>'boolean' then raise exception 'if() condition must be boolean.' using errcode='22023'; end if;
  if v_b->>'kind'<>v_c->>'kind' or v_b->>'kind' not in ('number','boolean','enum','date') then raise exception 'if() branches must return the same supported value type.' using errcode='22023'; end if;
  if v_b->>'kind'='number' then v_unit:=private.worth_it_v2_compatible_unit(jsonb_build_array(v_b,v_c));
  elsif v_b->>'kind'='enum' and private.worth_it_v2_enum_values(v_b->'choices')<>private.worth_it_v2_enum_values(v_c->'choices') then
   raise exception 'if() enum branches must use the same choices.' using errcode='22023';
  end if;
  return jsonb_build_object('kind',v_b->>'kind','unit',coalesce(v_b->>'unit',''),'unit_vector',coalesce(v_b->'unit_vector','{}'::jsonb),
   'choices',coalesce(v_b->'choices','[]'::jsonb),'group_refs',v_refs,'is_constant',false);
 end if;

 if p_name in ('eq','neq','gt','gte','lt','lte') then
  if v_a->>'kind'='number' and v_b->>'kind'='number' then perform private.worth_it_v2_compatible_unit(jsonb_build_array(v_a,v_b));
  elsif v_a->>'kind'='date' and v_b->>'kind'='string' and private.worth_it_v2_is_iso_date(v_b->>'value') then null;
  elsif v_b->>'kind'='date' and v_a->>'kind'='string' and private.worth_it_v2_is_iso_date(v_a->>'value') then null;
  elsif v_a->>'kind'='enum' and v_b->>'kind'='string' then
   if not exists(select 1 from jsonb_array_elements(v_a->'choices') c(value) where c.value->>'value'=v_b->>'value') then raise exception '%() string literal does not match a declared enum choice.',p_name using errcode='22023'; end if;
  elsif v_b->>'kind'='enum' and v_a->>'kind'='string' then
   if not exists(select 1 from jsonb_array_elements(v_b->'choices') c(value) where c.value->>'value'=v_a->>'value') then raise exception '%() string literal does not match a declared enum choice.',p_name using errcode='22023'; end if;
  elsif v_a->>'kind'<>v_b->>'kind' or v_a->>'kind' not in ('boolean','enum','date') then
   raise exception '%() requires values of the same supported type.',p_name using errcode='22023';
  elsif v_a->>'kind'='enum' and private.worth_it_v2_enum_values(v_a->'choices')<>private.worth_it_v2_enum_values(v_b->'choices') then
   raise exception '%() requires the same enum choices.',p_name using errcode='22023';
  end if;
  if p_name in ('gt','gte','lt','lte')
    and v_a->>'kind' not in ('number','date')
    and not(v_a->>'kind'='date' and v_b->>'kind'='string' and private.worth_it_v2_is_iso_date(v_b->>'value'))
    and not(v_b->>'kind'='date' and v_a->>'kind'='string' and private.worth_it_v2_is_iso_date(v_a->>'value')) then
   raise exception '%() supports only compatible numbers or calendar dates.',p_name using errcode='22023';
  end if;
  return jsonb_build_object('kind','boolean','unit_vector','{}'::jsonb,'unit','','group_refs',v_refs,'is_constant',false);
 end if;

 if p_name in ('and','or','not') then
  for v_node in select value from jsonb_array_elements(p_args) loop
   if v_node->>'kind'<>'boolean' then raise exception '%() accepts only boolean conditions.',p_name using errcode='22023'; end if;
  end loop;
  return jsonb_build_object('kind','boolean','unit_vector','{}'::jsonb,'unit','','group_refs',v_refs,'is_constant',false);
 end if;

 if p_name='date_diff_days' then
  if v_a->>'kind' not in ('date','string') or v_b->>'kind' not in ('date','string')
   or (v_a->>'kind'='string' and not private.worth_it_v2_is_iso_date(v_a->>'value'))
   or (v_b->>'kind'='string' and not private.worth_it_v2_is_iso_date(v_b->>'value')) then
   raise exception 'date_diff_days() requires two calendar dates.' using errcode='22023';
  end if;
  return jsonb_build_object('kind','number','unit','days','unit_vector','{"time":1}'::jsonb,'group_refs',v_refs,'is_constant',false);
 end if;
 if p_name in ('add_days','add_months') then
  if v_a->>'kind'<>'date' or v_b->>'kind'<>'number' then raise exception '%() requires a date and a numeric whole-number offset.',p_name using errcode='22023'; end if;
  if coalesce((v_b->>'is_constant')::boolean,false) then
   v_exponent:=(v_b->>'value')::numeric;
   if v_exponent<>trunc(v_exponent) then raise exception '%() offset constants must be whole numbers.',p_name using errcode='22023'; end if;
  elsif not(v_b->>'unit'=any(case when p_name='add_days' then array['day','days'] else array['month','months'] end)) then
   raise exception '%() offset input must use %.',p_name,case when p_name='add_days' then 'day/days' else 'month/months' end using errcode='22023';
  end if;
  return jsonb_build_object('kind','date','unit','','unit_vector','{}'::jsonb,'group_refs',v_refs,'is_constant',false);
 end if;
 if p_name='days_in_month' then
  if v_a->>'kind'<>'date' then raise exception 'days_in_month() requires a calendar date.' using errcode='22023'; end if;
  return jsonb_build_object('kind','number','unit','days','unit_vector','{"time":1}'::jsonb,'group_refs',v_refs,'is_constant',false);
 end if;
 if p_name in ('calendar_year','calendar_month','weekday') then
  if v_a->>'kind'<>'date' then raise exception '%() requires a calendar date.',p_name using errcode='22023'; end if;
  return jsonb_build_object('kind','number','unit','','unit_vector','{}'::jsonb,'group_refs',v_refs,'is_constant',false);
 end if;
 if p_name='count' then
  if v_a->>'kind'<>'group' then raise exception 'count() requires a dynamic group name.' using errcode='22023'; end if;
  return jsonb_build_object('kind','number','unit','','unit_vector','{}'::jsonb,'group_refs','[]'::jsonb,'is_constant',false);
 end if;
 if p_name='count_if' then
  if v_a->>'kind'<>'boolean' or jsonb_array_length(coalesce(v_a->'group_refs','[]'::jsonb))<>1 then
   raise exception 'count_if() must use a boolean predicate referencing exactly one dynamic group.' using errcode='22023';
  end if;
  return jsonb_build_object('kind','number','unit','','unit_vector','{}'::jsonb,'group_refs','[]'::jsonb,'is_constant',false);
 end if;
 if p_name in ('sum','sum_if') then
  if v_a->>'kind'<>'number' or jsonb_array_length(coalesce(v_a->'group_refs','[]'::jsonb))<>1 then
   raise exception '%() must aggregate a numeric expression from exactly one dynamic group.',p_name using errcode='22023';
  end if;
  if p_name='sum_if' and (v_b->>'kind'<>'boolean' or jsonb_array_length(coalesce(v_b->'group_refs','[]'::jsonb))<>1
      or (v_a->'group_refs'->>0)<>(v_b->'group_refs'->>0)) then
   raise exception 'sum_if() value and predicate must refer to fields from the same dynamic group.' using errcode='22023';
  end if;
  return jsonb_build_object('kind','number','unit',coalesce(v_a->>'unit',''),'unit_vector',coalesce(v_a->'unit_vector','{}'::jsonb),'group_refs','[]'::jsonb,'is_constant',false);
 end if;
 if p_name in ('min','max','avg') and v_count=1 and jsonb_array_length(coalesce(v_a->'group_refs','[]'::jsonb))>0 then
  if v_a->>'kind'<>'number' or jsonb_array_length(v_a->'group_refs')<>1 then raise exception '%() must aggregate one numeric expression from one dynamic group.',p_name using errcode='22023'; end if;
  return jsonb_build_object('kind','number','unit',coalesce(v_a->>'unit',''),'unit_vector',coalesce(v_a->'unit_vector','{}'::jsonb),'group_refs','[]'::jsonb,'is_constant',false);
 end if;

 for v_node in select value from jsonb_array_elements(p_args) loop
  if v_node->>'kind'<>'number' then raise exception '%() accepts only numeric arguments.',p_name using errcode='22023'; end if;
  v_units:=v_units||jsonb_build_array(v_node);
 end loop;
 if p_name in ('min','max','avg','hypot','mod','clamp') then v_unit:=private.worth_it_v2_compatible_unit(v_units);
 elsif p_name in ('abs','round','floor','ceil','trunc') then
  v_unit:=coalesce(v_a->'unit_vector','{}'::jsonb);
  if p_name='round' and v_count=2 and coalesce(v_b->'unit_vector','{}'::jsonb)<>'{}'::jsonb then raise exception 'round() precision must be dimensionless.' using errcode='22023'; end if;
 elsif p_name='sqrt' then
  for v_value in select key from jsonb_object_keys(coalesce(v_a->'unit_vector','{}'::jsonb)) as keys(key) loop
   if mod((v_a->'unit_vector'->>v_value)::numeric,2)<>0 then raise exception 'sqrt() requires even unit powers.' using errcode='22023'; end if;
   v_unit:=jsonb_set(v_unit,array[v_value],to_jsonb(((v_a->'unit_vector'->>v_value)::numeric)/2),true);
  end loop;
 elsif p_name='pow' then
  if coalesce((v_b->>'is_constant')::boolean,false) then v_exponent:=(v_b->>'value')::numeric;
  elsif coalesce(v_a->'unit_vector','{}'::jsonb)<>'{}'::jsonb then raise exception 'A dimensional value must use a fixed numeric power.' using errcode='22023';
  else v_exponent:=0; end if;
  if v_exponent<>0 then
   for v_value in select key from jsonb_object_keys(coalesce(v_a->'unit_vector','{}'::jsonb)) as keys(key) loop
    v_unit:=jsonb_set(v_unit,array[v_value],to_jsonb(((v_a->'unit_vector'->>v_value)::numeric)*v_exponent),true);
   end loop;
  end if;
 elsif p_name in ('log','ln','exp','sin','cos','tan','asin','acos','atan') then
  if coalesce(v_a->'unit_vector','{}'::jsonb)<>'{}'::jsonb or (v_count=2 and coalesce(v_b->'unit_vector','{}'::jsonb)<>'{}'::jsonb) then
   raise exception '%() requires dimensionless input.',p_name using errcode='22023';
  end if;
  v_unit:='{}'::jsonb;
 elsif p_name='sign' then v_unit:='{}'::jsonb;
 end if;
 return jsonb_build_object('kind','number','unit','','unit_vector',v_unit,'group_refs',v_refs,'is_constant',false);
end;
$$;

create or replace function private.worth_it_v2_parse_expression(
 p_source text,p_position integer,p_min_precedence integer,p_symbols jsonb,p_groups jsonb,p_depth integer
)
returns jsonb language plpgsql immutable set search_path=pg_catalog,private as $$
declare
 v_pos integer:=greatest(1,p_position);v_start integer;v_rest text;v_match text[];v_ident text;v_field text;
 v_string_json text;v_string_value text;v_escape boolean;v_char text;v_look text;
 v_node jsonb;v_right jsonb;v_parsed jsonb;v_args jsonb:='[]'::jsonb;v_group jsonb;v_definition jsonb;
 v_unit jsonb;v_refs jsonb;v_operator text;v_precedence integer;v_right_min integer;v_value numeric;
begin
 if p_depth>32 then raise exception 'A v2 formula exceeds the 32-level nesting limit.' using errcode='22023'; end if;
 while v_pos<=char_length(p_source) and substr(p_source,v_pos,1)~'^[[:space:]]$' loop v_pos:=v_pos+1; end loop;
 if v_pos>char_length(p_source) then raise exception 'Formula ends before an expression is complete.' using errcode='22023'; end if;
 v_char:=substr(p_source,v_pos,1);
 if v_char in ('+','-') then
  v_parsed:=private.worth_it_v2_parse_expression(p_source,v_pos+1,3,p_symbols,p_groups,p_depth+1);v_node:=v_parsed->'node';
  if v_node->>'kind'<>'number' then raise exception 'Unary numeric operators require a number.' using errcode='22023'; end if;
  if coalesce((v_node->>'is_constant')::boolean,false) then
   v_value:=(v_node->>'value')::numeric;if v_char='-' then v_value:=-v_value;end if;
   v_node:=jsonb_set(v_node,'{value}',to_jsonb(v_value),true);
  end if;
  v_pos:=(v_parsed->>'position')::integer;
 elsif v_char='(' then
  v_parsed:=private.worth_it_v2_parse_expression(p_source,v_pos+1,0,p_symbols,p_groups,p_depth+1);v_node:=v_parsed->'node';v_pos:=(v_parsed->>'position')::integer;
  while v_pos<=char_length(p_source) and substr(p_source,v_pos,1)~'^[[:space:]]$' loop v_pos:=v_pos+1;end loop;
  if substr(p_source,v_pos,1)<>')' then raise exception 'Unbalanced calculator formula parentheses.' using errcode='22023';end if;v_pos:=v_pos+1;
 elsif v_char='"' then
  v_start:=v_pos;v_pos:=v_pos+1;v_escape:=false;
  while v_pos<=char_length(p_source) loop
   v_char:=substr(p_source,v_pos,1);
   if v_escape then v_escape:=false;
   elsif v_char='\' then v_escape:=true;
   elsif v_char='"' then exit;end if;
   v_pos:=v_pos+1;
  end loop;
  if v_pos>char_length(p_source) then raise exception 'Unterminated string literal in formula.' using errcode='22023';end if;
  v_string_json:=substr(p_source,v_start,v_pos-v_start+1);
  begin v_string_value:=v_string_json::jsonb #>> '{}';
  exception when others then raise exception 'Invalid string literal in formula.' using errcode='22023';end;
  if char_length(v_string_value)>64 then raise exception 'Formula string literals are limited to 64 characters.' using errcode='22023';end if;
  v_node:=jsonb_build_object('kind','string','value',v_string_value,'unit','','unit_vector','{}'::jsonb,'group_refs','[]'::jsonb,'is_constant',true);v_pos:=v_pos+1;
 elsif v_char~'^[0-9.]$' then
  v_rest:=substr(p_source,v_pos);v_match:=regexp_match(v_rest,'^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?');
  if v_match is null then raise exception 'Invalid numeric token in formula.' using errcode='22023';end if;
  v_value:=v_match[1]::numeric;if abs(v_value)>1e100 then raise exception 'Formula numeric constants exceed the supported magnitude.' using errcode='22023';end if;
  v_node:=jsonb_build_object('kind','number','value',v_value,'unit','','unit_vector','{}'::jsonb,'group_refs','[]'::jsonb,'is_constant',true);
  v_pos:=v_pos+char_length(v_match[1]);
 elsif v_char~'^[A-Za-z_]$' then
  v_rest:=substr(p_source,v_pos);v_match:=regexp_match(v_rest,'^[A-Za-z_][A-Za-z0-9_]*');
  v_ident:=v_match[1];v_pos:=v_pos+char_length(v_ident);
  while v_pos<=char_length(p_source) and substr(p_source,v_pos,1)~'^[[:space:]]$' loop v_pos:=v_pos+1;end loop;
  v_look:=substr(p_source,v_pos,1);
  if v_look='.' then
   v_pos:=v_pos+1;v_rest:=substr(p_source,v_pos);v_match:=regexp_match(v_rest,'^[A-Za-z_][A-Za-z0-9_]*');
   if v_match is null then raise exception 'Invalid dynamic-group field reference.' using errcode='22023';end if;
   v_field:=v_match[1];v_pos:=v_pos+char_length(v_field);v_group:=p_groups->v_ident;
   if v_group is null then raise exception 'Unknown dynamic group: %.',v_ident using errcode='22023';end if;
   select value into v_definition from jsonb_array_elements(v_group->'fields') as fields(value) where value->>'key'=v_field limit 1;
   if v_definition is null then raise exception 'Unknown dynamic group field: %.%.',v_ident,v_field using errcode='22023';end if;
   v_node:=jsonb_build_object('kind',v_definition->>'type','unit',coalesce(v_definition->>'unit',''),
    'unit_vector',case when v_definition->>'type'='number' then private.worth_it_v2_unit_vector(v_definition->>'unit') else '{}'::jsonb end,
    'choices',coalesce(v_definition->'choices','[]'::jsonb),'group_refs',jsonb_build_array(v_ident),'is_constant',false);
  elsif v_look='(' then
   v_pos:=v_pos+1;v_args:='[]'::jsonb;
   while v_pos<=char_length(p_source) and substr(p_source,v_pos,1)~'^[[:space:]]$' loop v_pos:=v_pos+1;end loop;
   if substr(p_source,v_pos,1)=')' then v_pos:=v_pos+1;
   else
    loop
     v_parsed:=private.worth_it_v2_parse_expression(p_source,v_pos,0,p_symbols,p_groups,p_depth+1);
     v_args:=v_args||jsonb_build_array(v_parsed->'node');v_pos:=(v_parsed->>'position')::integer;
     while v_pos<=char_length(p_source) and substr(p_source,v_pos,1)~'^[[:space:]]$' loop v_pos:=v_pos+1;end loop;
     if substr(p_source,v_pos,1)=',' then v_pos:=v_pos+1;
     elsif substr(p_source,v_pos,1)=')' then v_pos:=v_pos+1;exit;
     else raise exception 'Invalid function argument separator in formula.' using errcode='22023';end if;
    end loop;
   end if;
   v_node:=private.worth_it_v2_infer_call(v_ident,v_args,p_groups);
  elsif v_ident in ('true','false') then
   v_node:=jsonb_build_object('kind','boolean','value',(v_ident='true'),'unit','','unit_vector','{}'::jsonb,'group_refs','[]'::jsonb,'is_constant',true);
  elsif v_ident in ('pi','e') then
   v_node:=jsonb_build_object('kind','number','value',case when v_ident='pi' then 3.14159265358979323846 else 2.71828182845904523536 end,'unit','','unit_vector','{}'::jsonb,'group_refs','[]'::jsonb,'is_constant',true);
  elsif p_groups ? v_ident then
   v_node:=jsonb_build_object('kind','group','group',v_ident,'unit','','unit_vector','{}'::jsonb,'group_refs','[]'::jsonb,'is_constant',false);
  elsif p_symbols ? v_ident then
   v_definition:=p_symbols->v_ident;
   v_node:=jsonb_build_object('kind',v_definition->>'kind','unit',coalesce(v_definition->>'unit',''),
    'unit_vector',coalesce(v_definition->'unit_vector','{}'::jsonb),'choices',coalesce(v_definition->'choices','[]'::jsonb),'group_refs','[]'::jsonb,'is_constant',false);
  else raise exception 'Unknown v2 input or earlier result: %.',v_ident using errcode='22023';
  end if;
 else raise exception 'This v2 formula contains unsupported syntax.' using errcode='22023';
 end if;

 loop
  while v_pos<=char_length(p_source) and substr(p_source,v_pos,1)~'^[[:space:]]$' loop v_pos:=v_pos+1;end loop;
  v_operator:=substr(p_source,v_pos,1);
  v_precedence:=case when v_operator in ('+','-') then 1 when v_operator in ('*','/') then 2 when v_operator='^' then 4 else 0 end;
  exit when v_precedence=0 or v_precedence<p_min_precedence;
  v_right_min:=case when v_operator='^' then v_precedence else v_precedence+1 end;
  v_parsed:=private.worth_it_v2_parse_expression(p_source,v_pos+1,v_right_min,p_symbols,p_groups,p_depth+1);v_right:=v_parsed->'node';
  if v_node->>'kind'<>'number' or v_right->>'kind'<>'number' then raise exception 'Arithmetic operators require numeric values; boolean, enum and date values are not numbers.' using errcode='22023';end if;
  v_refs:=private.worth_it_v2_merge_refs(coalesce(v_node->'group_refs','[]'::jsonb),coalesce(v_right->'group_refs','[]'::jsonb));
  if v_operator in ('+','-') then v_unit:=private.worth_it_v2_compatible_unit(jsonb_build_array(v_node,v_right));
  elsif v_operator='*' then v_unit:=private.worth_it_v2_unit_combine(v_node->'unit_vector',v_right->'unit_vector',1);
  elsif v_operator='/' then v_unit:=private.worth_it_v2_unit_combine(v_node->'unit_vector',v_right->'unit_vector',-1);
  else
   if coalesce((v_right->>'is_constant')::boolean,false) then
    v_value:=(v_right->>'value')::numeric;v_unit:='{}'::jsonb;
    for v_field in select key from jsonb_object_keys(coalesce(v_node->'unit_vector','{}'::jsonb)) as keys(key) loop
     v_unit:=jsonb_set(v_unit,array[v_field],to_jsonb(((v_node->'unit_vector'->>v_field)::numeric)*v_value),true);
    end loop;
   elsif coalesce(v_node->'unit_vector','{}'::jsonb)='{}'::jsonb then v_unit:='{}'::jsonb;
   else raise exception 'A dimensional value must use a fixed numeric power.' using errcode='22023';
   end if;
  end if;
  v_node:=jsonb_build_object('kind','number','unit',case when v_operator in ('+','-') then coalesce(v_node->>'unit',v_right->>'unit','') else '' end,
   'unit_vector',v_unit,'group_refs',v_refs,'is_constant',false);
  v_pos:=(v_parsed->>'position')::integer;
 end loop;
 return jsonb_build_object('node',v_node,'position',v_pos);
end;
$$;

create or replace function private.worth_it_validate_ugc_v2_spec(p_spec jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog,private as $$
declare
 v_supported_currency_codes constant text[]:=array['AFN','EUR','ALL','DZD','USD','AOA','XCD','XAD','ARS','AMD','AWG','AUD','AZN','BSD','BHD','BDT','BBD','BYN','BZD','XOF','BMD','INR','BTN','BOB','BOV','BAM','BWP','NOK','BRL','BND','BIF','CVE','KHR','XAF','CAD','KYD','CLP','CLF','CNY','COP','COU','KMF','CDF','NZD','CRC','CUP','XCG','CZK','DKK','DJF','DOP','EGP','SVC','ERN','SZL','ETB','FKP','FJD','XPF','GMD','GEL','GHS','GIP','GTQ','GBP','GNF','GYD','HTG','HNL','HKD','HUF','ISK','IDR','XDR','IRR','IQD','ILS','JMD','JPY','JOD','KZT','KES','KPW','KRW','KWD','KGS','LAK','LBP','LSL','ZAR','LRD','LYD','CHF','MOP','MKD','MGA','MWK','MYR','MVR','MRU','MUR','XUA','MXN','MXV','MDL','MNT','MAD','MZN','MMK','NAD','NPR','NIO','NGN','OMR','PKR','PAB','PGK','PYG','PEN','PHP','PLN','QAR','RON','RUB','RWF','SHP','WST','STN','SAR','RSD','SCR','SLE','SGD','XSU','SBD','SOS','SSP','LKR','SDG','SRD','SEK','CHE','CHW','SYP','TWD','TJS','TZS','THB','TOP','TTD','TND','TRY','TMT','UGX','UAH','AED','USN','UYU','UYI','UYW','UZS','VUV','VES','VED','VND','YER','ZMW','ZWG','XBA','XBB','XBC','XBD','XTS','XXX','XAU','XPD','XPT','XAG','BGN']::text[];
 v_input jsonb;v_group jsonb;v_field jsonb;v_result jsonb;v_choice jsonb;v_scenario jsonb;v_override record;
 v_symbol jsonb;v_symbols jsonb:='{}'::jsonb;v_groups jsonb:='{}'::jsonb;v_key text;v_label text;v_type text;v_control text;v_format text;v_unit text;v_value text;v_currency text;
 v_min numeric;v_max numeric;v_default numeric;v_step numeric;v_choice_num numeric;v_labels text[];v_choice_values jsonb;v_expression text;v_parse jsonb;v_node jsonb;v_token_count integer;v_position integer;v_seen_default boolean;
 v_scenario_labels text[];v_all_keys text[]:=array[]::text[];
begin
 if coalesce(jsonb_typeof(p_spec),'')<>'object' then raise exception 'V2 calculator definition must be an object.' using errcode='22023';end if;
 perform private.worth_it_v2_assert_keys(p_spec,array['schemaVersion','engineVersion','inputs','groups','results','scenarios'],'V2 calculator definition');
 if coalesce(jsonb_typeof(p_spec->'schemaVersion'),'')<>'number' or coalesce(jsonb_typeof(p_spec->'engineVersion'),'')<>'number'
    or (p_spec->>'schemaVersion')::numeric<>2 or (p_spec->>'engineVersion')::numeric<>2 then raise exception 'V2 definitions must declare schemaVersion 2 and engineVersion 2.' using errcode='22023';end if;
 if octet_length(p_spec::text)>32000 then raise exception 'V2 calculator definition exceeds 32,000 bytes.' using errcode='22023';end if;
 if coalesce(jsonb_typeof(p_spec->'inputs'),'')<>'array' or jsonb_array_length(p_spec->'inputs') not between 1 and 24 then raise exception 'A v2 calculator needs 1–24 fixed inputs.' using errcode='22023';end if;
 if coalesce(jsonb_typeof(p_spec->'groups'),'')<>'array' or jsonb_array_length(p_spec->'groups')>4 then raise exception 'A v2 calculator can define up to four dynamic groups.' using errcode='22023';end if;
 if coalesce(jsonb_typeof(p_spec->'results'),'')<>'array' or jsonb_array_length(p_spec->'results') not between 1 and 20 then raise exception 'A v2 calculator needs 1–20 results.' using errcode='22023';end if;
 if coalesce(jsonb_typeof(p_spec->'scenarios'),'')<>'array' or jsonb_array_length(p_spec->'scenarios')>3 then raise exception 'A v2 calculator can define up to three scenarios.' using errcode='22023';end if;

 for v_input in select value from jsonb_array_elements(p_spec->'inputs') loop
  perform private.worth_it_v2_assert_keys(v_input,array['key','label','type','min','max','default','step','unit','control','choices','minDate','maxDate'],'V2 input');
  v_key:=coalesce(v_input->>'key','');v_label:=coalesce(v_input->>'label','');v_type:=coalesce(v_input->>'type','');v_control:=coalesce(v_input->>'control','');
  if v_key !~ '^[a-z][a-z0-9_]{0,31}$' or v_key=any(v_all_keys) then raise exception 'V2 input keys must be unique lowercase identifiers.' using errcode='22023';end if;
  v_all_keys:=array_append(v_all_keys,v_key);
  if coalesce(jsonb_typeof(v_input->'label'),'')<>'string' or v_label='' or char_length(v_label)>60 then raise exception 'V2 input labels must contain 1–60 characters.' using errcode='22023';end if;
  if v_type not in ('number','boolean','enum','date') then raise exception 'V2 input type must be number, boolean, enum or date.' using errcode='22023';end if;
  if v_type='number' then
   if coalesce(jsonb_typeof(v_input->'min'),'')<>'number' or coalesce(jsonb_typeof(v_input->'max'),'')<>'number'
     or coalesce(jsonb_typeof(v_input->'default'),'')<>'number' or coalesce(jsonb_typeof(v_input->'step'),'')<>'number'
     or coalesce(jsonb_typeof(v_input->'unit'),'')<>'string' then raise exception 'Numeric inputs require JSON number bounds/default/step and a string unit.' using errcode='22023';end if;
   v_min:=(v_input->>'min')::numeric;v_max:=(v_input->>'max')::numeric;v_default:=(v_input->>'default')::numeric;v_step:=(v_input->>'step')::numeric;v_unit:=v_input->>'unit';
   if v_min>v_default or v_default>v_max or v_max-v_min>1000000000000 or v_step<=0
    or abs((v_default-v_min)/v_step-round((v_default-v_min)/v_step))>0.0000001
    or (v_max>v_min and abs((v_max-v_min)/v_step-round((v_max-v_min)/v_step))>0.0000001) or char_length(v_unit)>16 then
    raise exception 'Numeric input minimum, maximum, default, step or unit is invalid.' using errcode='22023';
   end if;
   if v_control not in ('number','slider','select') then raise exception 'Numeric inputs must use number, slider or select controls.' using errcode='22023';end if;
   if v_control='select' then
    if coalesce(jsonb_typeof(v_input->'choices'),'')<>'array' or jsonb_array_length(v_input->'choices') not between 2 and 12 then raise exception 'Numeric select inputs need 2–12 choices.' using errcode='22023';end if;
    v_labels:=array[]::text[];v_choice_values:='[]'::jsonb;v_seen_default:=false;
    for v_choice in select value from jsonb_array_elements(v_input->'choices') loop
     perform private.worth_it_v2_assert_keys(v_choice,array['label','value'],'Numeric choice');
     if coalesce(jsonb_typeof(v_choice->'label'),'')<>'string' or coalesce(jsonb_typeof(v_choice->'value'),'')<>'number'
      or char_length(btrim(v_choice->>'label')) not between 1 and 50 or abs((v_choice->>'value')::numeric)>1000000000000 then
      raise exception 'Numeric select choices require a short label and finite numeric value.' using errcode='22023';end if;
     if lower(btrim(v_choice->>'label'))=any(v_labels) then raise exception 'Numeric select labels must be unique.' using errcode='22023';end if;
     if exists(select 1 from jsonb_array_elements_text(v_choice_values) as vals(value) where vals.value::numeric=(v_choice->>'value')::numeric) then raise exception 'Numeric select values must be unique.' using errcode='22023';end if;
     v_labels:=array_append(v_labels,lower(btrim(v_choice->>'label')));v_choice_values:=v_choice_values||jsonb_build_array(v_choice->'value');
     v_choice_num:=(v_choice->>'value')::numeric;
     if v_choice_num<v_min or v_choice_num>v_max or abs((v_choice_num-v_min)/v_step-round((v_choice_num-v_min)/v_step))>0.0000001 then raise exception 'Numeric select choices must be inside the input range and match its step.' using errcode='22023';end if;
     if v_choice_num=v_default then v_seen_default:=true;end if;
    end loop;
    if not v_seen_default then raise exception 'Numeric select choices must include the default.' using errcode='22023';end if;
   elsif v_input ? 'choices' and v_input->'choices'<>'[]'::jsonb then raise exception 'Choices are only supported on select inputs.' using errcode='22023';
   end if;
   v_symbol:=jsonb_build_object('kind','number','unit',v_unit,'unit_vector',private.worth_it_v2_unit_vector(v_unit),'choices','[]'::jsonb);
  elsif v_type='boolean' then
   if coalesce(jsonb_typeof(v_input->'default'),'')<>'boolean' or v_control<>'toggle'
    or v_input ? 'min' or v_input ? 'max' or v_input ? 'step' or v_input ? 'choices' or v_input ? 'minDate' or v_input ? 'maxDate'
    or (v_input ? 'unit' and (coalesce(jsonb_typeof(v_input->'unit'),'')<>'string' or v_input->>'unit'<>'') ) then
    raise exception 'Boolean inputs need a true/false default and toggle control only.' using errcode='22023';end if;
   v_symbol:=jsonb_build_object('kind','boolean','unit','','unit_vector','{}'::jsonb,'choices','[]'::jsonb);
  elsif v_type='enum' then
   if coalesce(jsonb_typeof(v_input->'default'),'')<>'string' or length(btrim(v_input->>'default'))=0 or v_control<>'select'
    or v_input ? 'min' or v_input ? 'max' or v_input ? 'step' or v_input ? 'minDate' or v_input ? 'maxDate'
    or (v_input ? 'unit' and (coalesce(jsonb_typeof(v_input->'unit'),'')<>'string' or v_input->>'unit'<>'') ) then
    raise exception 'Enum inputs need a string default and select control only.' using errcode='22023';end if;
   if coalesce(jsonb_typeof(v_input->'choices'),'')<>'array' or jsonb_array_length(v_input->'choices') not between 2 and 12 then raise exception 'Enum inputs need 2–12 string choices.' using errcode='22023';end if;
   v_labels:=array[]::text[];v_choice_values:='[]'::jsonb;v_seen_default:=false;
   for v_choice in select value from jsonb_array_elements(v_input->'choices') loop
    perform private.worth_it_v2_assert_keys(v_choice,array['label','value'],'Enum choice');
    if coalesce(jsonb_typeof(v_choice->'label'),'')<>'string' or coalesce(jsonb_typeof(v_choice->'value'),'')<>'string'
     or char_length(btrim(v_choice->>'label')) not between 1 and 50 or char_length(v_choice->>'value') not between 1 and 64 then
     raise exception 'Enum choices require a short label and non-empty string value.' using errcode='22023';end if;
    if lower(btrim(v_choice->>'label'))=any(v_labels) or exists(select 1 from jsonb_array_elements(v_choice_values) x(value) where x.value=v_choice->'value') then raise exception 'Enum choice labels and values must be unique.' using errcode='22023';end if;
    v_labels:=array_append(v_labels,lower(btrim(v_choice->>'label')));v_choice_values:=v_choice_values||jsonb_build_array(v_choice->'value');
    if v_choice->>'value'=v_input->>'default' then v_seen_default:=true;end if;
   end loop;
   if not v_seen_default then raise exception 'Enum choices must include the default.' using errcode='22023';end if;
   v_symbol:=jsonb_build_object('kind','enum','unit','','unit_vector','{}'::jsonb,'choices',v_input->'choices');
  else
   if coalesce(jsonb_typeof(v_input->'default'),'')<>'string' or not private.worth_it_v2_is_iso_date(v_input->>'default') or v_control<>'date'
    or (v_input ? 'min' and (coalesce(jsonb_typeof(v_input->'min'),'')<>'string' or v_input->>'min'<>''))
    or (v_input ? 'max' and (coalesce(jsonb_typeof(v_input->'max'),'')<>'string' or v_input->>'max'<>''))
    or (v_input ? 'step' and (coalesce(jsonb_typeof(v_input->'step'),'')<>'string' or v_input->>'step'<>''))
    or (v_input ? 'choices' and (coalesce(jsonb_typeof(v_input->'choices'),'')<>'string' or v_input->>'choices'<>''))
    or (v_input ? 'unit' and (coalesce(jsonb_typeof(v_input->'unit'),'')<>'string' or v_input->>'unit'<>'') ) then
    raise exception 'Date inputs need a valid YYYY-MM-DD default and date control only.' using errcode='22023';end if;
   if v_input ? 'minDate' and (coalesce(jsonb_typeof(v_input->'minDate'),'')<>'string' or not private.worth_it_v2_is_iso_date(v_input->>'minDate')) then raise exception 'Minimum date must be a real YYYY-MM-DD date.' using errcode='22023';end if;
   if v_input ? 'maxDate' and (coalesce(jsonb_typeof(v_input->'maxDate'),'')<>'string' or not private.worth_it_v2_is_iso_date(v_input->>'maxDate')) then raise exception 'Maximum date must be a real YYYY-MM-DD date.' using errcode='22023';end if;
   if v_input ? 'minDate' and v_input ? 'maxDate' and v_input->>'minDate'>v_input->>'maxDate' then raise exception 'Minimum date cannot be later than maximum date.' using errcode='22023';end if;
   if v_input ? 'minDate' and v_input->>'default'<v_input->>'minDate' then raise exception 'Default date is before its minimum.' using errcode='22023';end if;
   if v_input ? 'maxDate' and v_input->>'default'>v_input->>'maxDate' then raise exception 'Default date is after its maximum.' using errcode='22023';end if;
   v_symbol:=jsonb_build_object('kind','date','unit','','unit_vector','{}'::jsonb,'choices','[]'::jsonb);
  end if;
  v_symbols:=jsonb_set(v_symbols,array[v_key],v_symbol,true);
 end loop;

 for v_group in select value from jsonb_array_elements(p_spec->'groups') loop
  perform private.worth_it_v2_assert_keys(v_group,array['key','label','itemLabel','minItems','maxItems','fields'],'V2 dynamic group');
  v_key:=coalesce(v_group->>'key','');v_label:=coalesce(v_group->>'label','');
  if v_key !~ '^[a-z][a-z0-9_]{0,31}$' or v_key=any(v_all_keys) then raise exception 'V2 group keys must be unique lowercase identifiers.' using errcode='22023';end if;
  v_all_keys:=array_append(v_all_keys,v_key);
  if coalesce(jsonb_typeof(v_group->'label'),'')<>'string' or coalesce(jsonb_typeof(v_group->'itemLabel'),'')<>'string'
   or char_length(v_label) not between 1 and 60 or char_length(v_group->>'itemLabel') not between 1 and 40
   or coalesce(jsonb_typeof(v_group->'minItems'),'')<>'number' or coalesce(jsonb_typeof(v_group->'maxItems'),'')<>'number'
   or (v_group->>'minItems')::numeric<>trunc((v_group->>'minItems')::numeric) or (v_group->>'maxItems')::numeric<>trunc((v_group->>'maxItems')::numeric)
   or (v_group->>'minItems')::integer<1 or (v_group->>'maxItems')::integer>20 or (v_group->>'maxItems')::integer<(v_group->>'minItems')::integer
   or coalesce(jsonb_typeof(v_group->'fields'),'')<>'array' or jsonb_array_length(v_group->'fields') not between 1 and 6 then
   raise exception 'V2 dynamic groups need labels, 1–20 rows and 1–6 fields.' using errcode='22023';end if;
  for v_field in select value from jsonb_array_elements(v_group->'fields') loop
   perform private.worth_it_v2_assert_keys(v_field,array['key','label','type','min','max','default','step','unit','choices','minDate','maxDate'],'V2 group field');
   v_key:=coalesce(v_field->>'key','');v_label:=coalesce(v_field->>'label','');v_type:=coalesce(v_field->>'type','');
   if v_key !~ '^[a-z][a-z0-9_]{0,31}$' or v_key=any(v_all_keys) then raise exception 'V2 group field keys must be unique lowercase identifiers.' using errcode='22023';end if;
   v_all_keys:=array_append(v_all_keys,v_key);
   if coalesce(jsonb_typeof(v_field->'label'),'')<>'string' or char_length(v_label) not between 1 and 60 or v_type not in ('number','boolean','enum','date') then raise exception 'V2 group fields need a label and supported type.' using errcode='22023';end if;
   if v_type='number' then
    if coalesce(jsonb_typeof(v_field->'min'),'')<>'number' or coalesce(jsonb_typeof(v_field->'max'),'')<>'number'
     or coalesce(jsonb_typeof(v_field->'default'),'')<>'number' or coalesce(jsonb_typeof(v_field->'step'),'')<>'number' or coalesce(jsonb_typeof(v_field->'unit'),'')<>'string' then
     raise exception 'Numeric group fields require numeric bounds/default/step and a unit.' using errcode='22023';end if;
    v_min:=(v_field->>'min')::numeric;v_max:=(v_field->>'max')::numeric;v_default:=(v_field->>'default')::numeric;v_step:=(v_field->>'step')::numeric;v_unit:=v_field->>'unit';
    if v_min>v_default or v_default>v_max or v_max-v_min>1000000000000 or v_step<=0
     or abs((v_default-v_min)/v_step-round((v_default-v_min)/v_step))>0.0000001
     or (v_max>v_min and abs((v_max-v_min)/v_step-round((v_max-v_min)/v_step))>0.0000001) or char_length(v_unit)>16 then
     raise exception 'Numeric group field minimum, maximum, default, step or unit is invalid.' using errcode='22023';end if;
    if v_field ? 'choices' and v_field->'choices'<>'[]'::jsonb then raise exception 'Dynamic numeric fields do not support choices.' using errcode='22023';end if;
   elsif v_type='boolean' then
    if coalesce(jsonb_typeof(v_field->'default'),'')<>'boolean' or (v_field ? 'unit' and v_field->>'unit'<>'')
     or v_field ? 'min' or v_field ? 'max' or v_field ? 'step' or v_field ? 'choices' or v_field ? 'minDate' or v_field ? 'maxDate' then
     raise exception 'Boolean group fields need a boolean default and no ranges, choices or dates.' using errcode='22023';end if;
   elsif v_type='enum' then
    if coalesce(jsonb_typeof(v_field->'default'),'')<>'string' or length(btrim(v_field->>'default'))=0
     or (v_field ? 'unit' and v_field->>'unit'<>'') or v_field ? 'min' or v_field ? 'max' or v_field ? 'step' or v_field ? 'minDate' or v_field ? 'maxDate'
     or coalesce(jsonb_typeof(v_field->'choices'),'')<>'array' or jsonb_array_length(v_field->'choices') not between 2 and 12 then
     raise exception 'Enum group fields need a string default and 2–12 choices.' using errcode='22023';end if;
    v_labels:=array[]::text[];v_choice_values:='[]'::jsonb;v_seen_default:=false;
    for v_choice in select value from jsonb_array_elements(v_field->'choices') loop
     perform private.worth_it_v2_assert_keys(v_choice,array['label','value'],'Enum group choice');
     if coalesce(jsonb_typeof(v_choice->'label'),'')<>'string' or coalesce(jsonb_typeof(v_choice->'value'),'')<>'string'
      or char_length(btrim(v_choice->>'label')) not between 1 and 50 or char_length(v_choice->>'value') not between 1 and 64 then
      raise exception 'Enum group choices need valid string labels and values.' using errcode='22023';end if;
     if lower(btrim(v_choice->>'label'))=any(v_labels) or exists(select 1 from jsonb_array_elements(v_choice_values) x(value) where x.value=v_choice->'value') then raise exception 'Enum group choice labels and values must be unique.' using errcode='22023';end if;
     v_labels:=array_append(v_labels,lower(btrim(v_choice->>'label')));v_choice_values:=v_choice_values||jsonb_build_array(v_choice->'value');
     if v_choice->>'value'=v_field->>'default' then v_seen_default:=true;end if;
    end loop;
    if not v_seen_default then raise exception 'Enum group choices must include the default.' using errcode='22023';end if;
   else
    if coalesce(jsonb_typeof(v_field->'default'),'')<>'string' or not private.worth_it_v2_is_iso_date(v_field->>'default')
     or (v_field ? 'unit' and v_field->>'unit'<>'') or v_field ? 'min' or v_field ? 'max' or v_field ? 'step' or v_field ? 'choices' then
     raise exception 'Date group fields need a valid calendar date default and no numeric range.' using errcode='22023';end if;
    if v_field ? 'minDate' and (coalesce(jsonb_typeof(v_field->'minDate'),'')<>'string' or not private.worth_it_v2_is_iso_date(v_field->>'minDate')) then raise exception 'Date group minimum must be a real calendar date.' using errcode='22023';end if;
    if v_field ? 'maxDate' and (coalesce(jsonb_typeof(v_field->'maxDate'),'')<>'string' or not private.worth_it_v2_is_iso_date(v_field->>'maxDate')) then raise exception 'Date group maximum must be a real calendar date.' using errcode='22023';end if;
    if v_field ? 'minDate' and v_field ? 'maxDate' and v_field->>'minDate'>v_field->>'maxDate' then raise exception 'Date group minimum cannot be later than its maximum.' using errcode='22023';end if;
    if v_field ? 'minDate' and v_field->>'default'<v_field->>'minDate' then raise exception 'Date group default is before its minimum.' using errcode='22023';end if;
    if v_field ? 'maxDate' and v_field->>'default'>v_field->>'maxDate' then raise exception 'Date group default is after its maximum.' using errcode='22023';end if;
   end if;
  end loop;
  v_groups:=jsonb_set(v_groups,array[v_group->>'key'],jsonb_build_object('fields',v_group->'fields'),true);
 end loop;

 v_scenario_labels:=array[]::text[];
 for v_scenario in select value from jsonb_array_elements(p_spec->'scenarios') loop
  perform private.worth_it_v2_assert_keys(v_scenario,array['label','values'],'V2 scenario');
  if coalesce(jsonb_typeof(v_scenario->'label'),'')<>'string' or char_length(btrim(v_scenario->>'label')) not between 2 and 50
   or coalesce(jsonb_typeof(v_scenario->'values'),'')<>'object' or v_scenario->'values'='{}'::jsonb then
   raise exception 'Each V2 scenario needs a name and at least one typed input override.' using errcode='22023';end if;
  if lower(btrim(v_scenario->>'label'))=any(v_scenario_labels) then raise exception 'V2 scenario names must be unique.' using errcode='22023';end if;
  v_scenario_labels:=array_append(v_scenario_labels,lower(btrim(v_scenario->>'label')));
  for v_override in select key,value from jsonb_each(v_scenario->'values') loop
   select item.value into v_input from jsonb_array_elements(p_spec->'inputs') as item(value) where item.value->>'key'=v_override.key limit 1;
   if v_input is null then raise exception 'Scenario references an unknown input: %.',v_override.key using errcode='22023';end if;
   v_type:=v_input->>'type';
   if v_type='number' then
    if jsonb_typeof(v_override.value)<>'number' then raise exception 'Scenario numeric overrides must be JSON numbers.' using errcode='22023';end if;
    v_value:=v_override.value #>> '{}';
    if v_value::numeric<(v_input->>'min')::numeric or v_value::numeric>(v_input->>'max')::numeric
     or abs((v_value::numeric-(v_input->>'min')::numeric)/(v_input->>'step')::numeric-round((v_value::numeric-(v_input->>'min')::numeric)/(v_input->>'step')::numeric))>0.0000001 then
     raise exception 'Scenario numeric override is outside its input range or step.' using errcode='22023';end if;
    if v_input->>'control'='select' and not exists(select 1 from jsonb_array_elements(v_input->'choices') c(value) where c.value->'value'=v_override.value) then raise exception 'Scenario numeric select override must match one of its choices.' using errcode='22023';end if;
   elsif v_type='boolean' then
    if jsonb_typeof(v_override.value)<>'boolean' then raise exception 'Scenario boolean overrides must be JSON booleans.' using errcode='22023';end if;
   elsif v_type='enum' then
    if jsonb_typeof(v_override.value)<>'string' or not exists(select 1 from jsonb_array_elements(v_input->'choices') c(value) where c.value->'value'=v_override.value) then raise exception 'Scenario enum override must match one of its declared choices.' using errcode='22023';end if;
   else
    if jsonb_typeof(v_override.value)<>'string' or not private.worth_it_v2_is_iso_date(v_override.value #>> '{}')
     or (v_input ? 'minDate' and v_override.value #>> '{}' < v_input->>'minDate')
     or (v_input ? 'maxDate' and v_override.value #>> '{}' > v_input->>'maxDate') then
     raise exception 'Scenario date override must be a valid date inside the input bounds.' using errcode='22023';end if;
   end if;
  end loop;
 end loop;

 for v_result in select value from jsonb_array_elements(p_spec->'results') loop
  perform private.worth_it_v2_assert_keys(v_result,array['key','label','expression','format','currency','unit','prefix','suffix','explanation'],'V2 result');
  v_label:=coalesce(v_result->>'label','');v_expression:=coalesce(v_result->>'expression','');v_format:=coalesce(v_result->>'format','number');
  if coalesce(jsonb_typeof(v_result->'label'),'')<>'string' or v_label='' or char_length(v_label)>70
   or coalesce(jsonb_typeof(v_result->'expression'),'')<>'string' or v_expression='' or char_length(v_expression)>500
   or v_format not in ('number','currency','percent','unit') then
   raise exception 'V2 result label, formula or output format is invalid.' using errcode='22023';end if;
  if v_result ? 'key' then
   v_key:=v_result->>'key';
   if v_key !~ '^[a-z][a-z0-9_]{0,31}$' or v_key=any(v_all_keys) then raise exception 'V2 result keys must be unique lowercase identifiers.' using errcode='22023';end if;
   v_all_keys:=array_append(v_all_keys,v_key);
  end if;
  if v_result ? 'explanation' and (coalesce(jsonb_typeof(v_result->'explanation'),'')<>'string' or char_length(v_result->>'explanation')>280) then raise exception 'V2 result explanations must be plain text of up to 280 characters.' using errcode='22023';end if;
  if v_format='unit' and (coalesce(jsonb_typeof(v_result->'unit'),'')<>'string' or char_length(v_result->>'unit') not between 1 and 20) then raise exception 'Unit-formatted results need a unit of up to 20 characters.' using errcode='22023';end if;
  if v_format='currency' then
   v_currency:=upper(coalesce(v_result->>'currency',''));
   if not(v_currency=any(v_supported_currency_codes)) then raise exception 'Currency-formatted results need a supported ISO currency code.' using errcode='22023';end if;
  end if;
  if (v_result ? 'prefix' and (coalesce(jsonb_typeof(v_result->'prefix'),'')<>'string' or char_length(v_result->>'prefix')>12))
   or (v_result ? 'suffix' and (coalesce(jsonb_typeof(v_result->'suffix'),'')<>'string' or char_length(v_result->>'suffix')>16)) then
   raise exception 'V2 result prefix or suffix is invalid.' using errcode='22023';end if;

  select count(*) into v_token_count from regexp_matches(v_expression,'"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|[()+*/^.,-]','g');
  if v_token_count>256 then raise exception 'A v2 formula exceeds the 256-token safety limit.' using errcode='22023';end if;
  v_parse:=private.worth_it_v2_parse_expression(v_expression,1,0,v_symbols,v_groups,0);
  v_position:=(v_parse->>'position')::integer;
  while v_position<=char_length(v_expression) and substr(v_expression,v_position,1)~'^[[:space:]]$' loop v_position:=v_position+1;end loop;
  if v_position<=char_length(v_expression) then raise exception 'V2 formula contains trailing or unsupported syntax.' using errcode='22023';end if;
  v_node:=v_parse->'node';
  if v_node->>'kind'<>'number' then raise exception 'V2 result formulas must return a number.' using errcode='22023';end if;
  if jsonb_array_length(coalesce(v_node->'group_refs','[]'::jsonb))>0 then raise exception 'Dynamic group fields must be aggregated before returning a result.' using errcode='22023';end if;
  if v_format='currency' and coalesce(v_node->'unit_vector','{}'::jsonb)<>jsonb_build_object('currency:'||lower(v_currency),1) then raise exception 'Formula units do not match the selected result currency.' using errcode='22023';
  elsif v_format='percent' and coalesce(v_node->'unit_vector','{}'::jsonb)<>'{}'::jsonb then raise exception 'Percent results must be dimensionless.' using errcode='22023';
  elsif v_format='unit' and private.worth_it_v2_unit_vector(v_result->>'unit')<>coalesce(v_node->'unit_vector','{}'::jsonb) then raise exception 'Formula dimensions do not match the selected result unit.' using errcode='22023';end if;
  if v_result ? 'key' then
   v_symbol:=jsonb_build_object('kind','number','unit',case when v_format='currency' then v_currency when v_format='unit' then v_result->>'unit' else '' end,
    'unit_vector',coalesce(v_node->'unit_vector','{}'::jsonb),'choices','[]'::jsonb);
   v_symbols:=jsonb_set(v_symbols,array[v_result->>'key'],v_symbol,true);
  end if;
 end loop;
end;
$$;

revoke all on function private.worth_it_v2_assert_keys(jsonb,text[],text) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_v2_merge_refs(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_v2_unit_vector(text) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_v2_unit_combine(jsonb,jsonb,integer) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_v2_is_iso_date(text) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_v2_enum_values(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_v2_compatible_unit(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_v2_infer_call(text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_v2_parse_expression(text,integer,integer,jsonb,jsonb,integer) from public,anon,authenticated,service_role;
revoke all on function private.worth_it_validate_ugc_v2_spec(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worth_it_v2_assert_keys(jsonb,text[],text) to postgres;
grant execute on function private.worth_it_v2_merge_refs(jsonb,jsonb) to postgres;
grant execute on function private.worth_it_v2_unit_vector(text) to postgres;
grant execute on function private.worth_it_v2_unit_combine(jsonb,jsonb,integer) to postgres;
grant execute on function private.worth_it_v2_is_iso_date(text) to postgres;
grant execute on function private.worth_it_v2_enum_values(jsonb) to postgres;
grant execute on function private.worth_it_v2_compatible_unit(jsonb) to postgres;
grant execute on function private.worth_it_v2_infer_call(text,jsonb,jsonb) to postgres;
grant execute on function private.worth_it_v2_parse_expression(text,integer,integer,jsonb,jsonb,integer) to postgres;
grant execute on function private.worth_it_validate_ugc_v2_spec(jsonb) to postgres;

commit;
