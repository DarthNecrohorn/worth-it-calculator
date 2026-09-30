-- Worth It Shop account cache
-- Run once in Supabase SQL Editor.
--
-- The Shop backend uses the Supabase service role key server-side.
-- No direct client policy is granted; account snapshots are private.

create table if not exists public.shop_account_cache (
    user_id uuid primary key references auth.users(id) on delete cascade,
    products jsonb not null default '[]'::jsonb,
    saved_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index if not exists shop_account_cache_expires_at_idx
    on public.shop_account_cache (expires_at);

alter table public.shop_account_cache enable row level security;

drop policy if exists "Users cannot access Shop account cache directly"
    on public.shop_account_cache;
