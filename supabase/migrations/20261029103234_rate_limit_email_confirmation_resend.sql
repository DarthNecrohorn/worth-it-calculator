-- Keep an authoritative 24-hour cooldown for email confirmation resends per Auth user.
-- The private table cannot be read or written by browser roles. Only the server-side
-- Pages Function uses the two narrowly scoped RPCs with the service key.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.worth_it_email_confirmation_resend_limits (
    user_id uuid primary key references auth.users(id) on delete cascade,
    claimed_at timestamptz not null
);
alter table private.worth_it_email_confirmation_resend_limits enable row level security;
revoke all on table private.worth_it_email_confirmation_resend_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.worth_it_email_confirmation_resend_limits to service_role;

create or replace function public.claim_worth_it_email_confirmation_resend(p_user_id uuid)
returns table (is_allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_claimed_at timestamptz;
    v_remaining integer;
begin
    if p_user_id is null or not exists (
        select 1
        from auth.users as u
        where u.id = p_user_id
          and u.email is not null
          and u.email_confirmed_at is null
    ) then
        return query select false, 0;
        return;
    end if;

    insert into private.worth_it_email_confirmation_resend_limits as existing_claim (user_id, claimed_at)
    values (p_user_id, v_now)
    on conflict (user_id) do update
       set claimed_at = excluded.claimed_at
     where existing_claim.claimed_at <= v_now - interval '24 hours'
    returning claimed_at into v_claimed_at;

    if found then
        return query select true, 0;
        return;
    end if;

    select greatest(
        1,
        ceil(extract(epoch from (existing_claim.claimed_at + interval '24 hours' - v_now)))::integer
    )
      into v_remaining
      from private.worth_it_email_confirmation_resend_limits as existing_claim
     where existing_claim.user_id = p_user_id;

    return query select false, coalesce(v_remaining, 86400);
end;
$function$;

create or replace function public.release_worth_it_email_confirmation_resend(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
    delete from private.worth_it_email_confirmation_resend_limits
     where user_id = p_user_id
       and claimed_at >= pg_catalog.clock_timestamp() - interval '24 hours';
$function$;

revoke all on function public.claim_worth_it_email_confirmation_resend(uuid) from public, anon, authenticated;
revoke all on function public.release_worth_it_email_confirmation_resend(uuid) from public, anon, authenticated;
grant execute on function public.claim_worth_it_email_confirmation_resend(uuid) to service_role;
grant execute on function public.release_worth_it_email_confirmation_resend(uuid) to service_role;
