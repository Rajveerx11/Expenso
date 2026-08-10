begin;
select plan(16);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'payer@test.local', '', now(), '{"full_name":"Payer"}', now(), now()),
    ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'receiver@test.local', '', now(), '{"full_name":"Receiver"}', now(), now());
insert into public.groups(id, name, created_by)
values ('20000000-0000-0000-0000-000000000001', 'Settlement test', '10000000-0000-0000-0000-000000000002');
insert into public.group_members(group_id, user_id, role)
values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'editor'),
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin');
insert into public.group_expenses(id, group_id, paid_by, title, total_amount, category, split_type, expense_date)
values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Dinner', 10, 'Food', 'exact', current_date);
insert into public.expense_splits(expense_id, user_id, owed_amount)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 10);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';
select throws_ok(
    $$select public.create_settlement(
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002', 10.01, null
    )$$,
    '22023',
    'Settlement exceeds the outstanding debt',
    'overpayment is rejected'
);
select lives_ok(
    $$select public.create_settlement(
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002', 4, 'partial-payment'
    )$$,
    'partial settlement proposal succeeds'
);
select throws_ok(
    $$select public.create_settlement(
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002', 1, null
    )$$,
    'P0001',
    'A settlement for this balance is already pending',
    'duplicate pending proposal is rejected'
);
select throws_ok(
    $$select public.confirm_settlement(
        (select id from public.settlements where status = 'pending_confirmation'),
        '10000000-0000-0000-0000-000000000001'
    )$$,
    '42501',
    'Only the receiver can confirm this settlement',
    'payer cannot confirm own proposal'
);

set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000002';
select lives_ok(
    $$select public.confirm_settlement(
        (select id from public.settlements where status = 'pending_confirmation'),
        '10000000-0000-0000-0000-000000000002'
    )$$,
    'receiver confirms proposal'
);
select lives_ok(
    $$select public.confirm_settlement(
        (select id from public.settlements where status = 'confirmed'),
        '10000000-0000-0000-0000-000000000002'
    )$$,
    'confirmation retry is idempotent'
);
reset role;
select is((select settled_amount from public.expense_splits limit 1), 4.00::numeric, 'partial amount is allocated');
select is((select is_settled from public.expense_splits limit 1), false, 'partial allocation leaves split open');
select is((select count(*) from public.settlements where status = 'confirmed'), 1::bigint, 'retry creates no duplicate confirmation');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000001';
select is(
    (select balance from public.get_group_balances('20000000-0000-0000-0000-000000000001')
     where user_id = '10000000-0000-0000-0000-000000000002'),
    -6.00::numeric,
    'partial confirmation reduces outstanding balance'
);
select lives_ok(
    $$select public.create_settlement(
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002', 6, null
    )$$,
    'remaining balance can be proposed'
);
select lives_ok(
    $$select public.create_group_expense(
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'Reciprocal expense', 6, 'Other', 'exact', null, current_date,
        '[{"user_id":"10000000-0000-0000-0000-000000000002","owed_amount":6}]'::jsonb
    )$$,
    'concurrent balance mutation path uses serialized expense RPC'
);

set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000002';
select throws_ok(
    $$select public.confirm_settlement(
        (select id from public.settlements where status = 'pending_confirmation'),
        '10000000-0000-0000-0000-000000000002'
    )$$,
    '22023',
    'Outstanding balance changed; reject and create a new settlement',
    'stale proposal cannot overpay changed balance'
);
select lives_ok(
    $$select public.reject_settlement(
        (select id from public.settlements where status = 'pending_confirmation')
    )$$,
    'receiver rejects stale proposal'
);
reset role;
select is((select settled_amount from public.expense_splits where expense_id = '30000000-0000-0000-0000-000000000001'), 4.00::numeric, 'rejection leaves allocation unchanged');
select is((select count(*) from public.settlements where status = 'rejected'), 1::bigint, 'rejection records terminal state');

select * from finish();
rollback;
