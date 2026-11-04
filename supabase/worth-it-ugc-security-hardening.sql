-- PR #194: close default PUBLIC EXECUTE on UGC implementation helpers.
-- Public RPCs and trigger execution continue through their existing SECURITY DEFINER owners.
begin;

revoke execute on function private.worth_it_badge_is_earned(uuid,text)
    from public, anon, authenticated, service_role;
revoke execute on function private.worth_it_guard_ugc_calculator_update()
    from public, anon, authenticated, service_role;
revoke execute on function private.worth_it_validate_ugc_spec(jsonb)
    from public, anon, authenticated, service_role;

-- PostgreSQL's schema-specific default ACL cannot revoke the global PUBLIC EXECUTE grant.
-- Keep every new private helper's EXECUTE privilege explicitly revoked in its own migration.
commit;
