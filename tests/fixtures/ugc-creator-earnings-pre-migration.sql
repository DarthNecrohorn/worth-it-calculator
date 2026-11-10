-- Seed two completed paid UGC uses before the creator-earnings migration.
-- Together they represent 0.60 CALC spent and should backfill 0.30 CALC to the creator.
\set ON_ERROR_STOP on

insert into private.worth_it_user_calculators(
    id, calculator_number, owner_user_id, title, description, category,
    spec, status, visibility, published_at, usage_price_milli
) values (
    '77777777-7777-4777-8777-777777777777',
    99999,
    '11111111-1111-4111-8111-111111111111',
    'Creator earnings historical fixture',
    'A published fixture for historical earnings backfill.',
    'money',
    '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":100,"default":10}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb,
    'published',
    'public',
    now(),
    300
)
on conflict (id) do nothing;

insert into private.worth_it_calc_transactions(
    user_id, kind, currency, amount_milli, balance_after_milli,
    status, request_id, description, metadata
) values
(
    '22222222-2222-4222-8222-222222222222',
    'calculator_spend',
    'CALC',
    -300,
    700,
    'completed',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Historical community calculator use A',
    jsonb_build_object('reason','calculator','ugc_calculator_id','77777777-7777-4777-8777-777777777777','usage_price_milli',300)
),
(
    '22222222-2222-4222-8222-222222222222',
    'calculator_spend',
    'CALC',
    -300,
    400,
    'completed',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'Historical community calculator use B',
    jsonb_build_object('reason','calculator','ugc_calculator_id','77777777-7777-4777-8777-777777777777','usage_price_milli',300)
)
on conflict (user_id, request_id) do nothing;
