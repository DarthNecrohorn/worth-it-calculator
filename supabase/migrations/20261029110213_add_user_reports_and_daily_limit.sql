-- User reports: authenticated, confirmed users may file up to five reports per UTC day.
-- The database enforces the limit atomically; clients cannot bypass it.
create table if not exists public.worth_it_user_reports (
    id bigint generated always as identity primary key,
    reporter_user_id uuid not null references auth.users(id) on delete cascade,
    reported_user_id uuid not null references auth.users(id) on delete cascade,
    reporter_worth_it_id bigint,
    reported_worth_it_id bigint not null,
    reported_username text not null,
    reason text not null check (reason in ('harassment','spam','hate','impersonation','inappropriate_profile','other')),
    details text not null default '' check (char_length(details) <= 1000),
    status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
    created_at timestamptz not null default now(),
    constraint worth_it_user_reports_no_self_report check (reporter_user_id <> reported_user_id)
);

create index if not exists worth_it_user_reports_created_at_idx
    on public.worth_it_user_reports (created_at desc);
create index if not exists worth_it_user_reports_reporter_day_idx
    on public.worth_it_user_reports (reporter_user_id, created_at desc);
create index if not exists worth_it_user_reports_status_created_idx
    on public.worth_it_user_reports (status, created_at desc);

alter table public.worth_it_user_reports enable row level security;
revoke all on public.worth_it_user_reports from anon, authenticated;
grant select on public.worth_it_user_reports to authenticated;

drop policy if exists "Only Worth It admin can read user reports" on public.worth_it_user_reports;
create policy "Only Worth It admin can read user reports"
    on public.worth_it_user_reports for select to authenticated
    using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'pedjasebez3545@gmail.com');

create or replace function public.submit_worth_it_user_report(
    p_target_worth_it_id bigint,
    p_reason text,
    p_details text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
    reporter_id uuid := auth.uid();
    reporter_profile_id bigint;
    target_user_id uuid;
    target_username text;
    report_count integer;
    cleaned_reason text := lower(trim(coalesce(p_reason, '')));
    cleaned_details text := left(trim(coalesce(p_details, '')), 1000);
begin
    if reporter_id is null then
        raise exception 'Sign in to report a user.' using errcode = '42501';
    end if;

    if not exists (
        select 1 from auth.users u
        where u.id = reporter_id and u.email_confirmed_at is not null
    ) then
        raise exception 'Confirm your email before reporting users.' using errcode = '42501';
    end if;

    if p_target_worth_it_id is null or p_target_worth_it_id < 1 then
        raise exception 'Invalid profile.' using errcode = '22023';
    end if;

    if cleaned_reason not in ('harassment','spam','hate','impersonation','inappropriate_profile','other') then
        raise exception 'Choose a valid report reason.' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(reporter_id::text, 0));

    select p.user_id, p.username
      into target_user_id, target_username
      from public.worth_it_profiles p
     where p.worth_it_id = p_target_worth_it_id;

    if target_user_id is null then
        raise exception 'This profile could not be found.' using errcode = 'P0002';
    end if;
    if target_user_id = reporter_id then
        raise exception 'You cannot report your own profile.' using errcode = '22023';
    end if;

    if exists (
        select 1 from public.worth_it_user_reports r
         where r.reporter_user_id = reporter_id
           and r.reported_user_id = target_user_id
           and (r.created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date
    ) then
        raise exception 'You have already reported this user today.' using errcode = '23505';
    end if;

    select count(*) into report_count
      from public.worth_it_user_reports r
     where r.reporter_user_id = reporter_id
       and (r.created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date;

    if report_count >= 5 then
        raise exception 'Daily report limit reached. You can submit up to five reports per day.' using errcode = 'P0001';
    end if;

    select p.worth_it_id into reporter_profile_id
      from public.worth_it_profiles p where p.user_id = reporter_id;

    insert into public.worth_it_user_reports (
        reporter_user_id, reported_user_id, reporter_worth_it_id,
        reported_worth_it_id, reported_username, reason, details
    ) values (
        reporter_id, target_user_id, reporter_profile_id,
        p_target_worth_it_id, coalesce(nullif(target_username, ''), 'Unknown user'),
        cleaned_reason, cleaned_details
    );

    return jsonb_build_object('success', true, 'reports_remaining', greatest(0, 4 - report_count));
end;
$function$;

revoke all on function public.submit_worth_it_user_report(bigint, text, text) from public, anon;
grant execute on function public.submit_worth_it_user_report(bigint, text, text) to authenticated;
