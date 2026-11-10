create table private.worth_it_calc_wallets (
    user_id uuid primary key references auth.users(id) on delete cascade,
    balance_milli integer not null default 0 check (balance_milli >= 0),
    premium_plan text not null default 'free',
    premium_expires_at timestamptz,
    updated_at timestamptz not null default now()
);