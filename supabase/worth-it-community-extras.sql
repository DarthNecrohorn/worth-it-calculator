-- Worth It community extras: personal calculator favourites, custom accent themes,
-- and administrator-only moderation for existing user reports. Safe to re-run.
begin;

alter table public.worth_it_user_reports
  add column if not exists admin_note text not null default '',
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.worth_it_user_reports enable row level security;

create or replace function public.admin_update_worth_it_user_report(
  p_report_id bigint,
  p_status text,
  p_admin_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  cleaned_status text := lower(trim(coalesce(p_status,'')));
  cleaned_note text := left(trim(coalesce(p_admin_note,'')),1000);
begin
  if actor_id is null
     or lower(coalesce(auth.jwt()->>'email','')) <> 'pedjasebez3545@gmail.com' then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_report_id is null or p_report_id < 1 then
    raise exception 'Invalid report.' using errcode = '22023';
  end if;
  if cleaned_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'Choose a valid report status.' using errcode = '22023';
  end if;

  update public.worth_it_user_reports
     set status = cleaned_status,
         admin_note = cleaned_note,
         reviewed_by = actor_id,
         reviewed_at = now()
   where id = p_report_id;

  if not found then
    return jsonb_build_object('success',false,'code','REPORT_NOT_FOUND');
  end if;
  return jsonb_build_object('success',true,'report_id',p_report_id,'status',cleaned_status);
end;
$function$;

revoke all on function public.admin_update_worth_it_user_report(bigint,text,text) from public, anon;
grant execute on function public.admin_update_worth_it_user_report(bigint,text,text) to authenticated;

create table if not exists public.worth_it_calculator_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  calculator_key text not null
    check (calculator_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  created_at timestamptz not null default now(),
  primary key (user_id,calculator_key)
);
create index if not exists worth_it_calculator_favorites_created_idx
  on public.worth_it_calculator_favorites(user_id,created_at desc);

alter table public.worth_it_calculator_favorites enable row level security;
revoke all on public.worth_it_calculator_favorites from public, anon, authenticated;
grant select,insert,delete on public.worth_it_calculator_favorites to authenticated;

drop policy if exists "Users can view their own calculator favourites" on public.worth_it_calculator_favorites;
create policy "Users can view their own calculator favourites"
  on public.worth_it_calculator_favorites for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can save their own calculator favourites" on public.worth_it_calculator_favorites;
create policy "Users can save their own calculator favourites"
  on public.worth_it_calculator_favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can remove their own calculator favourites" on public.worth_it_calculator_favorites;
create policy "Users can remove their own calculator favourites"
  on public.worth_it_calculator_favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.worth_it_user_themes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_name text not null default 'My theme'
    check (char_length(btrim(theme_name)) between 1 and 24),
  primary_color text not null default '#7C5CFF'
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#38BDF8'
    check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.worth_it_user_themes enable row level security;
revoke all on public.worth_it_user_themes from public, anon, authenticated;
grant select,insert,update,delete on public.worth_it_user_themes to authenticated;

drop policy if exists "Users can view their own custom theme" on public.worth_it_user_themes;
create policy "Users can view their own custom theme"
  on public.worth_it_user_themes for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own custom theme" on public.worth_it_user_themes;
create policy "Users can create their own custom theme"
  on public.worth_it_user_themes for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own custom theme" on public.worth_it_user_themes;
create policy "Users can update their own custom theme"
  on public.worth_it_user_themes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own custom theme" on public.worth_it_user_themes;
create policy "Users can delete their own custom theme"
  on public.worth_it_user_themes for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
