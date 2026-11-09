-- Seed legacy daily view rows before the lifetime-unique migration is applied.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,email_confirmed_at) values
 ('77777777-7777-4777-8777-777777777777','legacy-view-owner@example.test',now()),
 ('88888888-8888-4888-8888-888888888888','legacy-viewer@example.test',now());

insert into public.worth_it_profiles(user_id,worth_it_id,username,display_name) values
 ('77777777-7777-4777-8777-777777777777',907,'legacyviewowner','Legacy View Owner'),
 ('88888888-8888-4888-8888-888888888888',908,'legacyviewviewer','Legacy View Viewer');

insert into private.worth_it_user_calculators(
    id,calculator_number,owner_user_id,title,description,category,spec,status,created_at,updated_at,published_at
) values (
    '99999999-9999-4999-8999-999999999999',
    999,
    '77777777-7777-4777-8777-777777777777',
    'Legacy view migration test',
    '',
    'other',
    '{"inputs":[{"key":"amount","label":"Amount","min":0,"max":100,"default":1}],"results":[{"label":"Amount","expression":"amount"}]}'::jsonb,
    'published',
    timestamptz '2026-10-01 00:00:00+00',
    timestamptz '2026-10-01 00:00:00+00',
    timestamptz '2026-10-01 00:00:00+00'
);

insert into private.worth_it_calculator_views(calculator_id,viewer_user_id,viewed_on,created_at) values
 ('99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888',date '2026-10-01',timestamptz '2026-10-01 12:00:00+00'),
 ('99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888',date '2026-10-02',timestamptz '2026-10-02 12:00:00+00'),
 ('99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888',date '2026-10-03',timestamptz '2026-10-03 12:00:00+00');

commit;
