-- PR #194: close default PUBLIC EXECUTE on UGC implementation helpers.
-- Public RPCs and trigger execution continue through their existing SECURITY DEFINER owners.
begin;

revoke execute on function private.worth_it_badge_is_earned(uuid,text)
    from public, anon, authenticated, service_role;
revoke execute on function private.worth_it_guard_ugc_calculator_update()
    from public, anon, authenticated, service_role;
revoke execute on function private.worth_it_validate_ugc_spec(jsonb)
    from public, anon, authenticated, service_role;

-- Keep future private helper functions closed by default when created as postgres.
alter default privileges for role postgres in schema private
    revoke execute on functions from public, anon, authenticated, service_role;

commit;
