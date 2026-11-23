-- Private per-account save data for the Zombies vs Humans easter egg game.
-- This migration is intentionally isolated from CALC, WIP, profiles and calculator data.

begin;

create table if not exists public.worth_it_zvh_game_saves (
    user_id uuid primary key references auth.users(id) on delete cascade,
    unlocked boolean not null default false,
    game_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint worth_it_zvh_game_saves_data_is_object
        check (jsonb_typeof(game_data) = 'object'),
    constraint worth_it_zvh_game_saves_data_size
        check (pg_column_size(game_data) <= 16384)
);

alter table public.worth_it_zvh_game_saves enable row level security;

revoke all privileges on table public.worth_it_zvh_game_saves from public, anon, authenticated;
grant select, insert, update on table public.worth_it_zvh_game_saves to authenticated;

drop policy if exists "Players can read their own Zombies vs Humans save" on public.worth_it_zvh_game_saves;
create policy "Players can read their own Zombies vs Humans save"
    on public.worth_it_zvh_game_saves
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Players can create their own Zombies vs Humans save" on public.worth_it_zvh_game_saves;
create policy "Players can create their own Zombies vs Humans save"
    on public.worth_it_zvh_game_saves
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update their own Zombies vs Humans save" on public.worth_it_zvh_game_saves;
create policy "Players can update their own Zombies vs Humans save"
    on public.worth_it_zvh_game_saves
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

commit;
