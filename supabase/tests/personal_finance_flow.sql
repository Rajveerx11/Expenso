begin;
select plan(13);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ledger-owner@test.local', '', now(), '{"full_name":"Ledger Owner"}', now(), now()),
    ('14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ledger-other@test.local', '', now(), '{"full_name":"Ledger Other"}', now(), now());

set local role authenticated;
set local "request.jwt.claim.sub" = '14000000-0000-0000-0000-000000000001';

select ok(
    (select transaction_id is not null and not replayed from public.create_personal_expense(
        'Salary', 5000.00, 'Salary', 'income', null, '2026-08-01',
        'personal-create-key-0001', repeat('a', 64)
    )),
    'manual transaction is created atomically'
);
select ok(
    (select replayed from public.create_personal_expense(
        'Salary', 5000.00, 'Salary', 'income', null, '2026-08-01',
        'personal-create-key-0001', repeat('a', 64)
    )),
    'same idempotency request is replayed'
);
select is(
    (select count(*) from public.personal_expenses where title = 'Salary'),
    1::bigint,
    'idempotent replay does not duplicate the transaction'
);
select throws_ok(
    $$select * from public.create_personal_expense(
        'Different', 1.00, 'Other', 'expense', null, '2026-08-01',
        'personal-create-key-0001', repeat('b', 64)
    )$$,
    '22023', 'IDEMPOTENCY_KEY_REUSED',
    'an idempotency key cannot be reused for a different request'
);
select is(
    (select total_income from public.profiles where id = '14000000-0000-0000-0000-000000000001'),
    5000.00::numeric,
    'profile income aggregate updates in the create transaction'
);
select throws_ok(
    $$insert into public.personal_expenses(user_id, title, amount, category, type, expense_date)
      values ('14000000-0000-0000-0000-000000000001', 'Bypass', 1.00, 'Other', 'expense', '2026-08-01')$$,
    '42501',
    'permission denied for table personal_expenses',
    'authenticated users cannot bypass atomic mutation RPCs with direct DML'
);
select throws_ok(
    $$select * from public.create_personal_expense(
        'Unsupported', 1.00, 'Unsupported category', 'expense', null, '2026-08-01',
        'personal-create-key-0002', repeat('c', 64)
    )$$,
    '22023',
    'Invalid personal expense input',
    'direct RPC calls cannot persist unsupported categories'
);

do $$
begin
    perform set_config(
        'test.personal_expense_id',
        (select id::text from public.personal_expenses where title = 'Salary'),
        true
    );
end;
$$;

set local "request.jwt.claim.sub" = '14000000-0000-0000-0000-000000000002';
select is(
    (select count(*) from public.personal_expenses),
    0::bigint,
    'another user cannot list the owner ledger'
);
select is(
    public.update_personal_expense(
        current_setting('test.personal_expense_id')::uuid,
        '{"amount":"1.00"}'::jsonb
    ),
    null::uuid,
    'cross-user mutation returns a safe absence'
);

reset role;
insert into public.groups(id, name, created_by)
values ('24000000-0000-0000-0000-000000000001', 'Ledger link', '14000000-0000-0000-0000-000000000001');
insert into public.group_members(group_id, user_id, role)
values ('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'admin');
insert into public.group_expenses(id, group_id, paid_by, title, total_amount, category, split_type, expense_date)
values ('34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'Linked', 25.00, 'Food', 'equal', '2026-08-02');
insert into public.personal_expenses(user_id, title, amount, category, type, source_group_expense_id, expense_date)
values ('14000000-0000-0000-0000-000000000001', 'Linked', 25.00, 'Food', 'expense', '34000000-0000-0000-0000-000000000001', '2026-08-02');

set local role authenticated;
set local "request.jwt.claim.sub" = '14000000-0000-0000-0000-000000000001';
select throws_ok(
    $$select public.update_personal_expense(
        (select id from public.personal_expenses where title = 'Linked'),
        '{"amount":"10.00"}'::jsonb
    )$$,
    '22023', 'LINKED_TRANSACTION_READ_ONLY',
    'linked group transactions cannot be edited personally'
);
select throws_ok(
    $$select public.delete_personal_expense(
        (select id from public.personal_expenses where title = 'Linked')
    )$$,
    '22023', 'LINKED_TRANSACTION_READ_ONLY',
    'linked group transactions cannot be deleted personally'
);
select is(
    (public.get_personal_expense_analytics('2026-08-01') ->> 'monthlyNet')::numeric,
    4975.00::numeric,
    'analytics include income and linked spending'
);
select is(
    (select count(*) from public.list_personal_expenses('2026-08-01', 'all', null, null, null, 30)),
    2::bigint,
    'monthly feed returns manual and linked transactions'
);

select * from finish();
rollback;
