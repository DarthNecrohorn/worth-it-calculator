-- Smoke tests for the Easter Eggs migration. Runs only in disposable CI PostgreSQL.
begin;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set local role authenticated;
do $$
declare state jsonb; outcome jsonb; public_state jsonb;
begin
 state := public.get_worth_it_easter_egg_state();
 if state->>'enabled' <> 'true' then raise exception 'Easter Eggs must default to enabled'; end if;
 if jsonb_array_length(state->'discoveries') <> 0 then raise exception 'New account should start with an empty collection'; end if;

 outcome := public.discover_worth_it_easter_egg('shooting_star');
 if outcome->>'success' <> 'true' or outcome->>'discovered' <> 'true' then
   raise exception 'First discovery was not recorded: %', outcome;
 end if;
 outcome := public.discover_worth_it_easter_egg('shooting_star');
 if outcome->>'discovered' <> 'false' then
   raise exception 'Duplicate discovery must not be counted twice: %', outcome;
 end if;

 perform public.set_worth_it_easter_eggs_enabled(false);
 outcome := public.discover_worth_it_easter_egg('mystery_box');
 if outcome->>'success' <> 'false' or outcome->>'reason' <> 'disabled' then
   raise exception 'Disabled setting must block new discoveries: %', outcome;
 end if;
 state := public.get_worth_it_easter_egg_state();
 if state->>'enabled' <> 'false' or jsonb_array_length(state->'discoveries') <> 1 then
   raise exception 'Turning Easter Eggs off must preserve existing discoveries: %', state;
 end if;

 perform public.set_worth_it_easter_eggs_enabled(true);
 public_state := public.get_worth_it_profile_easter_eggs(101);
 if public_state->>'success' <> 'true'
    or not (public_state->'discoveries' ? 'shooting_star')
    or jsonb_array_length(public_state->'discoveries') <> 1 then
   raise exception 'Authenticated profile collection did not return the saved discovery: %', public_state;
 end if;
end
$$;
reset role;
rollback;
