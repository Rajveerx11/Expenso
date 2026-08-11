begin;
select plan(16);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'payer@test.local', '', now(), '{"full_name":"Payer"}', now(), now()),
    ('11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member@test.local', '', now(), '{"full_name":"Member"}', now(), now()),
    ('11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'outsider@test.local', '', now(), '{"full_name":"Outsider"}', now(), now());
insert into public.groups(id, name, created_by)
values ('21000000-0000-0000-0000-000000000001', 'Expense test', '11000000-0000-0000-0000-000000000001');
insert into public.group_members(group_id, user_id, role)
values
    ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'admin'),
    ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'editor');

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-0000-0000-000000000001';
select lives_ok(
    $$select public.create_group_expense(
        '21000000-0000-0000-0000-000000000001',
        '11000000-0000-0000-0000-000000000001',
        'Dinner', 1.00, 'Food', 'equal', null, current_date,
        '[{"user_id":"11000000-0000-0000-0000-000000000001","owed_amount":0.50},{"user_id":"11000000-0000-0000-0000-000000000002","owed_amount":0.50}]'::jsonb
    )$$,
    'atomic expense creation succeeds'
);
reset role;

select is((select count(*) from public.group_expenses), 1::bigint, 'one expense is stored');
select is((select count(*) from public.expense_splits), 2::bigint, 'all splits are stored');
select is((select sum(owed_amount) from public.expense_splits), 1.00::numeric, 'stored splits reconcile exactly');
select is(
    (select count(*) from public.personal_expenses where source_group_expense_id is not null),
    2::bigint,
    'participant shares are mirrored'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-0000-0000-000000000001';
select throws_ok(
    $$select public.create_group_expense(
        '21000000-0000-0000-0000-000000000001',
        '11000000-0000-0000-0000-000000000001',
        'Invalid', 1.00, 'Food', 'exact', null, current_date,
        '[{"user_id":"11000000-0000-0000-0000-000000000001","owed_amount":0.99}]'::jsonb
    )$$,
    '22023',
    'Split amounts must equal the expense total',
    'invalid split total rolls back'
);
reset role;
select is((select count(*) from public.group_expenses), 1::bigint, 'failed transaction stores no partial expense');

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-0000-0000-000000000003';
select throws_ok(
    $$select public.create_group_expense(
        '21000000-0000-0000-0000-000000000001',
        '11000000-0000-0000-0000-000000000003',
        'Unauthorized', 1.00, 'Food', 'exact', null, current_date,
        '[{"user_id":"11000000-0000-0000-0000-000000000003","owed_amount":1.00}]'::jsonb
    )$$,
    '42501',
    'Group membership required',
    'non-member creation is rejected'
);

set local "request.jwt.claim.sub" = '11000000-0000-0000-0000-000000000002';
select throws_ok(
    $$select public.delete_group_expense((select id from public.group_expenses limit 1))$$,
    '42501',
    'Only the payer or an admin can delete this expense',
    'unauthorized deletion is rejected'
);

set local "request.jwt.claim.sub" = '11000000-0000-0000-0000-000000000001';
select is(
    (select balance from public.get_group_balances('21000000-0000-0000-0000-000000000001')
     where user_id = '11000000-0000-0000-0000-000000000002'),
    0.50::numeric,
    'caller-relative balance is accurate'
);
select is(
    public.delete_group_expense((select id from public.group_expenses limit 1)),
    true,
    'authorized atomic delete succeeds'
);
reset role;

select is((select count(*) from public.group_expenses), 0::bigint, 'expense is reversed');
select is((select count(*) from public.expense_splits), 0::bigint, 'splits are reversed');
select is(
    (select count(*) from public.personal_expenses where source_group_expense_id is not null),
    0::bigint,
    'personal mirrors are reversed'
);
select is(
    (select count(*) from public.profiles
     where id in ('11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002')
       and total_balance <> 0),
    0::bigint,
    'affected profile totals are recalculated'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-0000-0000-000000000001';
select is(
    public.delete_group_expense('31000000-0000-0000-0000-000000000099'),
    false,
    'missing expense returns false'
);
reset role;

select * from finish();
rollback;
