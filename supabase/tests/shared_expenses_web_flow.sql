begin;
select plan(46);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'shared-admin@test.local', '', now(), '{"full_name":"Shared Admin"}', now(), now()),
    ('11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'shared-member@test.local', '', now(), '{"full_name":"Shared Member"}', now(), now()),
    ('11000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'shared-third@test.local', '', now(), '{"full_name":"Shared Third"}', now(), now()),
    ('11000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'shared-outsider@test.local', '', now(), '{"full_name":"Shared Outsider"}', now(), now());

update public.profiles set upi_id = 'admin@upi'
where id = '11000000-0000-4000-8000-000000000001';
insert into public.groups(id, name, created_by)
values ('21000000-0000-4000-8000-000000000001', 'Shared expense test', '11000000-0000-4000-8000-000000000001');
insert into public.group_members(group_id, user_id, role)
values
    ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'admin'),
    ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'editor'),
    ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003', 'editor');

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000001';
select lives_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Equal dinner', 100.00, 'Food', 'equal', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000003"},{"user_id":"11000000-0000-4000-8000-000000000001"},{"user_id":"11000000-0000-4000-8000-000000000002"}]'::jsonb,
        'shared-equal-0001'
    )$$,
    'equal expense is created atomically'
);
reset role;

select is((select count(*) from public.group_expenses), 1::bigint, 'one equal expense is stored');
select is((select count(*) from public.expense_splits), 3::bigint, 'one split per selected member is stored');
select is((select sum(owed_amount) from public.expense_splits), 100.00::numeric, 'equal splits reconcile exactly');
select is(
    (select owed_amount from public.expense_splits where user_id = '11000000-0000-4000-8000-000000000001'),
    33.34::numeric,
    'equal remainder goes to the lowest sorted UUID'
);
select is((select count(*) from public.personal_expenses where source_group_expense_id is not null), 3::bigint, 'positive shares create personal mirrors');
select is((select count(*) from public.notifications where type = 'expense_added'), 2::bigint, 'expense notifications are enqueued once per other member');
select is(
    (select count(*) from public.profiles
     where id in ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003')
       and total_balance < 0),
    3::bigint,
    'all affected profile aggregates are refreshed'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000001';
select is(
    (select replayed from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Equal dinner', 100.00, 'Food', 'equal', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000003"},{"user_id":"11000000-0000-4000-8000-000000000001"},{"user_id":"11000000-0000-4000-8000-000000000002"}]'::jsonb,
        'shared-equal-0001'
    )),
    true,
    'same key and body replays the stored response'
);
reset role;
select is((select count(*) from public.group_expenses), 1::bigint, 'replay creates no duplicate expense');

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000001';
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Changed body', 100.00, 'Food', 'equal', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001"}]'::jsonb,
        'shared-equal-0001'
    )$$,
    '22023',
    'IDEMPOTENCY_KEY_REUSED',
    'same key with a different body conflicts'
);
select lives_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Exact snack', 1.00, 'Food', 'exact', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001","value":"0.40"},{"user_id":"11000000-0000-4000-8000-000000000002","value":"0.60"}]'::jsonb,
        'shared-exact-0001'
    )$$,
    'exact expense succeeds'
);
select is(
    (select sum(es.owed_amount) from public.expense_splits es join public.group_expenses ge on ge.id = es.expense_id where ge.title = 'Exact snack'),
    1.00::numeric,
    'exact shares reconcile'
);
select lives_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Percentage cent', 0.01, 'Other', 'percentage', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000002","value":"50.0000"},{"user_id":"11000000-0000-4000-8000-000000000001","value":"50.0000"}]'::jsonb,
        'shared-percent-001'
    )$$,
    'percentage expense succeeds'
);
select is(
    (select es.owed_amount from public.expense_splits es join public.group_expenses ge on ge.id = es.expense_id
     where ge.title = 'Percentage cent' and es.user_id = '11000000-0000-4000-8000-000000000001'),
    0.01::numeric,
    'percentage remainder uses sorted UUID tie-breaker'
);
select is(
    (select es.owed_amount from public.expense_splits es join public.group_expenses ge on ge.id = es.expense_id
     where ge.title = 'Percentage cent' and es.user_id = '11000000-0000-4000-8000-000000000002'),
    0.00::numeric,
    'percentage allocation preserves zero-cent rounded share'
);
select is(
    (select es.is_settled from public.expense_splits es join public.group_expenses ge on ge.id = es.expense_id
     where ge.title = 'Percentage cent' and es.user_id = '11000000-0000-4000-8000-000000000002'),
    true,
    'zero-cent rounded share starts settled'
);
select isnt(
    (select es.settled_at from public.expense_splits es join public.group_expenses ge on ge.id = es.expense_id
     where ge.title = 'Percentage cent' and es.user_id = '11000000-0000-4000-8000-000000000002'),
    null::timestamptz,
    'zero-cent rounded share records settlement time'
);
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Duplicate', 1.00, 'Other', 'equal', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001"},{"user_id":"11000000-0000-4000-8000-000000000001"}]'::jsonb,
        'shared-duplicate01'
    )$$,
    '22023',
    'Duplicate split members are not allowed',
    'duplicate members are rejected'
);
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Missing exact value', 1.00, 'Other', 'exact', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001"}]'::jsonb,
        'shared-exact-missing'
    )$$,
    '22023',
    'Exact splits require positive money values',
    'exact split requires a string value'
);
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Missing percentage', 1.00, 'Other', 'percentage', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001"}]'::jsonb,
        'shared-percent-miss'
    )$$,
    '22023',
    'Percentage splits require values greater than 0 and at most 100',
    'percentage split requires a string value'
);
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Null category', 1.00, null, 'equal', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001"}]'::jsonb,
        'shared-null-category'
    )$$,
    '22023', 'Invalid group expense input', 'SQL-null category is rejected predictably'
);
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Null mode', 1.00, 'Other', null, null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001"}]'::jsonb,
        'shared-null-mode000'
    )$$,
    '22023', 'Invalid group expense input', 'SQL-null split type is rejected predictably'
);
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Null splits', 1.00, 'Other', 'equal', null, current_date,
        null::jsonb,
        'shared-null-splits0'
    )$$,
    '22023', 'Invalid group expense input', 'SQL-null splits are rejected predictably'
);
reset role;
select is((select count(*) from public.group_expenses), 3::bigint, 'failed split validation leaves no partial expense');

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000004';
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Outsider', 1.00, 'Other', 'equal', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001"}]'::jsonb,
        'shared-outsider001'
    )$$,
    '42501',
    'Group membership required',
    'non-member cannot create an expense'
);
select throws_ok(
    $$select public.get_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        (select id from public.group_expenses where title = 'Equal dinner')
    )$$,
    '42501',
    'Group membership required',
    'non-member cannot read expense detail'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000002';
select is(
    jsonb_array_length((public.get_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        (select id from public.group_expenses where title = 'Equal dinner')
    ) -> 'splits')),
    3,
    'member reads narrow expense detail with every split'
);
select is(
    (select can_delete from public.list_group_expenses_web('21000000-0000-4000-8000-000000000001', null, null, null, 30)
     where title = 'Percentage cent'),
    false,
    'unrelated editor cannot delete expense'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000001';
select is(
    (select balance from public.list_group_balances_web('21000000-0000-4000-8000-000000000001')
     where user_id = '11000000-0000-4000-8000-000000000002'),
    33.93::numeric,
    'pairwise balance includes every shared expense'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000002';
select is(
    (select user_upi_id from public.list_group_balances_web('21000000-0000-4000-8000-000000000001')
     where user_id = '11000000-0000-4000-8000-000000000001'),
    'admin@upi',
    'UPI is disclosed only for a member the caller owes'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000004';
select throws_ok(
    $$select * from public.list_group_balances_web('21000000-0000-4000-8000-000000000001')$$,
    '42501',
    'Group membership required',
    'non-member cannot read balances'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000002';
select throws_ok(
    $$select public.delete_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        (select id from public.group_expenses where title = 'Equal dinner')
    )$$,
    '42501',
    'Only the payer or a group administrator can delete this expense',
    'editor who is not payer cannot delete'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000001';
select is(
    public.delete_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        (select id from public.group_expenses where title = 'Exact snack')
    ),
    true,
    'payer deletes an unsettled expense atomically'
);
reset role;
select is((select count(*) from public.group_expenses where title = 'Exact snack'), 0::bigint, 'deleted expense is removed');
select is((select count(*) from public.personal_expenses where source_group_expense_id is not null), 4::bigint, 'only deleted expense mirrors are reversed');
select is((select count(*) from public.notifications where type = 'expense_added'), 4::bigint, 'deleted expense notifications are reversed');

update public.expense_splits
set settled_amount = 1.00
where expense_id = (select id from public.group_expenses where title = 'Equal dinner')
  and user_id = '11000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000001';
select is(
    (public.get_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        (select id from public.group_expenses where title = 'Equal dinner')
    ) -> 'expense' ->> 'canDelete')::boolean,
    false,
    'settled expense detail hides delete affordance'
);
select throws_ok(
    $$select public.delete_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        (select id from public.group_expenses where title = 'Equal dinner')
    )$$,
    '22023',
    'SETTLED_EXPENSE_IMMUTABLE',
    'settled shares preserve expense history'
);
reset role;

insert into public.settlements(group_id, payer_id, receiver_id, amount, status)
values (
    '21000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000001',
    0.01,
    'pending_confirmation'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000001';
select is(
    (select can_delete from public.list_group_expenses_web(
        '21000000-0000-4000-8000-000000000001', null, null, null, 30
     ) where title = 'Percentage cent'),
    false,
    'pending settlement hides group expense delete affordances'
);
select throws_ok(
    $$select public.delete_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        (select id from public.group_expenses where title = 'Percentage cent')
    )$$,
    'P0001',
    'Resolve pending settlements before deleting this expense',
    'pending settlement prevents balance-changing deletion'
);
reset role;

select is(
    has_function_privilege('authenticated', 'public.create_group_expense(uuid,uuid,text,numeric,text,text,text,date,jsonb)', 'execute'),
    false,
    'legacy browser-computed create RPC is revoked'
);
select is(
    has_function_privilege('authenticated', 'public.delete_group_expense(uuid)', 'execute'),
    false,
    'legacy unbound delete RPC is revoked'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '11000000-0000-4000-8000-000000000001';
select throws_ok(
    $$select public.delete_group_expense_web(
        '21000000-0000-4000-8000-000000000099',
        (select id from public.group_expenses where title = 'Percentage cent')
    )$$,
    '42501',
    'Group membership required',
    'route-bound group mismatch grants no delete authority'
);
select throws_ok(
    $$select * from public.create_group_expense_web(
        '21000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000001',
        'Shares blocked', 1.00, 'Other', 'shares', null, current_date,
        '[{"user_id":"11000000-0000-4000-8000-000000000001","value":"1"}]'::jsonb,
        'shared-shares-0001'
    )$$,
    '22023',
    'Invalid group expense input',
    'web command does not expose legacy shares mode'
);
reset role;

select is((select count(*) from private.api_idempotency_keys where scope = 'group-expense:create'), 3::bigint, 'one durable key exists per successful create');

select * from finish();
rollback;
