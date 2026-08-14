begin;
select no_plan();

insert into auth.users(
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at
)
values
    ('12000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'settlement-payer@test.local', '', now(), '{"full_name":"Settlement Payer"}', now(), now()),
    ('12000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'settlement-receiver@test.local', '', now(), '{"full_name":"Settlement Receiver"}', now(), now()),
    ('12000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'settlement-member@test.local', '', now(), '{"full_name":"Settlement Member"}', now(), now()),
    ('12000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'settlement-outsider@test.local', '', now(), '{"full_name":"Settlement Outsider"}', now(), now());

insert into public.groups(id, name, created_by)
values (
    '22000000-0000-4000-8000-000000000001',
    'Settlement web test',
    '12000000-0000-4000-8000-000000000002'
);
insert into public.group_members(group_id, user_id, role)
values
    ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'editor'),
    ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'admin'),
    ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003', 'editor');

insert into public.group_expenses(
    id, group_id, paid_by, title, total_amount, category, split_type,
    expense_date, created_at
)
values
    (
        '32000000-0000-4000-8000-000000000001',
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000002',
        'Old debt', 70.00, 'Other', 'exact', '2026-08-01', '2026-08-01T10:00:00Z'
    ),
    (
        '32000000-0000-4000-8000-000000000002',
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000002',
        'New debt', 50.00, 'Other', 'exact', '2026-08-02', '2026-08-02T10:00:00Z'
    );
insert into public.expense_splits(expense_id, user_id, owed_amount)
values
    ('32000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 70.00),
    ('32000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001', 50.00);

create temporary table issue6_settlement_results(
    label text primary key,
    settlement_id uuid not null,
    response jsonb not null,
    replayed boolean
);
grant select, insert, update on issue6_settlement_results to authenticated;

select is(
    has_table_privilege('authenticated', 'public.settlements', 'select'),
    false,
    'authenticated clients cannot select confirmation tokens from settlements'
);
select is(
    has_table_privilege('authenticated', 'public.payment_confirmations', 'select'),
    false,
    'authenticated clients cannot read raw confirmation audit rows'
);
select is(
    has_function_privilege(
        'authenticated',
        'public.create_settlement(uuid,uuid,numeric,text)',
        'execute'
    ),
    false,
    'legacy settlement creation RPC is revoked'
);
select is(
    has_function_privilege(
        'authenticated',
        'public.confirm_settlement(uuid,uuid)',
        'execute'
    ),
    false,
    'legacy caller-id confirmation RPC is revoked'
);
select is(
    has_function_privilege(
        'authenticated',
        'public.reject_settlement(uuid)',
        'execute'
    ),
    false,
    'legacy rejection RPC is revoked'
);
select ok(
    has_function_privilege(
        'authenticated',
        'public.create_group_settlement_web(uuid,uuid,numeric,text,text)',
        'execute'
    ),
    'authenticated clients can execute settlement web creation'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '12000000-0000-4000-8000-000000000001';

select throws_ok(
    $$select * from public.create_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000002',
        1.001, null, 'settlement-invalid-precision'
    )$$,
    '22023',
    'Invalid settlement input',
    'amount precision beyond cents is rejected instead of rounded'
);
select throws_ok(
    $$select * from public.create_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000002',
        120.01, null, 'settlement-overpay-0001'
    )$$,
    '22023',
    'SETTLEMENT_EXCEEDS_BALANCE',
    'settlement cannot exceed latest pair balance'
);
select throws_ok(
    $$select * from public.create_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000004',
        1.00, null, 'settlement-outsider-001'
    )$$,
    '22023',
    'Invalid settlement participants or amount',
    'settlement receiver must still be a group member'
);
select throws_ok(
    $$select * from public.create_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000002',
        1.00, repeat('x', 201), 'settlement-long-ref-001'
    )$$,
    '22023',
    'Invalid settlement input',
    'transaction reference is bounded'
);
select throws_ok(
    $$select * from public.create_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000002',
        1.00, null, null
    )$$,
    '22023',
    'IDEMPOTENCY_KEY_REQUIRED',
    'settlement creation requires a durable idempotency key'
);

select lives_ok(
    $$insert into issue6_settlement_results(label, settlement_id, response, replayed)
      select
          'first',
          (response ->> 'id')::uuid,
          response,
          replayed
      from public.create_group_settlement_web(
          '22000000-0000-4000-8000-000000000001',
          '12000000-0000-4000-8000-000000000002',
          60.00,
          'first-payment',
          'settlement-first-0001'
      )$$,
    'valid partial settlement is created atomically'
);
select is(
    (select replayed from issue6_settlement_results where label = 'first'),
    false,
    'first settlement request is not marked as replayed'
);
select is(
    (select response ->> 'payerId' from issue6_settlement_results where label = 'first'),
    '12000000-0000-4000-8000-000000000001',
    'payer identity is derived from auth.uid()'
);
select is(
    (select response ->> 'amount' from issue6_settlement_results where label = 'first'),
    '60.00',
    'money response is serialized with exactly two decimals'
);
select is(
    (select response ? 'confirmationToken' from issue6_settlement_results where label = 'first'),
    false,
    'curated response contains no confirmation token'
);

select lives_ok(
    $$insert into issue6_settlement_results(label, settlement_id, response, replayed)
      select
          'first-replay',
          (response ->> 'id')::uuid,
          response,
          replayed
      from public.create_group_settlement_web(
          '22000000-0000-4000-8000-000000000001',
          '12000000-0000-4000-8000-000000000002',
          60.00,
          'first-payment',
          'settlement-first-0001'
      )$$,
    'same key and canonical body replays stored settlement'
);
select is(
    (select replayed from issue6_settlement_results where label = 'first-replay'),
    true,
    'identical retry is marked as replayed'
);
select is(
    (select settlement_id from issue6_settlement_results where label = 'first-replay'),
    (select settlement_id from issue6_settlement_results where label = 'first'),
    'replay returns original settlement id'
);
select throws_ok(
    $$select * from public.create_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000002',
        59.00, 'first-payment', 'settlement-first-0001'
    )$$,
    '22023',
    'IDEMPOTENCY_KEY_REUSED',
    'same key with a changed body is rejected'
);
select throws_ok(
    $$select * from public.create_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        '12000000-0000-4000-8000-000000000002',
        1.00, null, 'settlement-duplicate-001'
    )$$,
    '22023',
    'PENDING_SETTLEMENT_EXISTS',
    'one pending settlement per directional pair is enforced'
);
select is(
    (select count(*) from public.list_group_settlements_web(
        '22000000-0000-4000-8000-000000000001', null, null, 30
    )),
    1::bigint,
    'payer lists only involved group settlements'
);
select is(
    (select can_respond from public.list_group_settlements_web(
        '22000000-0000-4000-8000-000000000001', null, null, 30
    )),
    false,
    'payer cannot respond to own claim'
);
select is(
    public.get_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'first')
    ) ->> 'id',
    (select settlement_id::text from issue6_settlement_results where label = 'first'),
    'involved payer reads curated settlement detail'
);
select is(
    public.get_group_settlement_web(
        '22000000-0000-4000-8000-000000000099',
        (select settlement_id from issue6_settlement_results where label = 'first')
    ),
    null::jsonb,
    'route-bound group mismatch hides settlement detail'
);
select throws_ok(
    $$select public.confirm_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'first')
    )$$,
    '42501',
    'Only the receiver can respond to this settlement',
    'payer cannot confirm own settlement claim'
);

set local "request.jwt.claim.sub" = '12000000-0000-4000-8000-000000000004';
select is(
    public.get_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'first')
    ),
    null::jsonb,
    'non-involved user cannot read settlement detail'
);
select is(
    (select count(*) from public.list_group_settlements_web(
        '22000000-0000-4000-8000-000000000001', null, null, 30
    )),
    0::bigint,
    'non-involved user sees no settlement history'
);

set local "request.jwt.claim.sub" = '12000000-0000-4000-8000-000000000002';
select is(
    public.get_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'first')
    ) ->> 'canRespond',
    'true',
    'pending receiver detail enables response actions'
);
select lives_ok(
    $$update issue6_settlement_results
      set response = public.confirm_group_settlement_web(
          '22000000-0000-4000-8000-000000000001', settlement_id
      )
      where label = 'first'$$,
    'receiver confirms pending settlement'
);
select is(
    (select response ->> 'status' from issue6_settlement_results where label = 'first'),
    'confirmed',
    'confirmation returns terminal state'
);
select is(
    public.confirm_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'first')
    ) ->> 'status',
    'confirmed',
    'duplicate confirmation is idempotent'
);
select is(
    public.reject_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'first')
    ) ->> 'status',
    'confirmed',
    'opposite terminal action returns current state without mutation'
);
reset role;

select is(
    (select settled_amount from public.expense_splits
     where expense_id = '32000000-0000-4000-8000-000000000001'),
    60.00::numeric,
    'confirmation allocates against oldest split first'
);
select is(
    (select settled_amount from public.expense_splits
     where expense_id = '32000000-0000-4000-8000-000000000002'),
    0.00::numeric,
    'newer split remains untouched while older debt is available'
);
select is(
    (select status from public.payment_confirmations
     where settlement_id = (select settlement_id from issue6_settlement_results where label = 'first')),
    'confirmed',
    'confirmation audit reaches confirmed state atomically'
);
select isnt(
    (select responded_at from public.payment_confirmations
     where settlement_id = (select settlement_id from issue6_settlement_results where label = 'first')),
    null::timestamptz,
    'confirmed audit has server response timestamp'
);
select is(
    (select count(*) from public.notifications
     where type = 'settlement_request'
       and related_id = (select settlement_id from issue6_settlement_results where label = 'first')),
    1::bigint,
    'retries enqueue one persistent settlement request notification'
);
select is(
    (select count(*) from public.notifications
     where type = 'settlement_confirmed'
       and related_id = (select settlement_id from issue6_settlement_results where label = 'first')),
    1::bigint,
    'terminal retry enqueues one confirmation notification'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '12000000-0000-4000-8000-000000000001';
select is(
    (select balance from public.get_group_balances(
        '22000000-0000-4000-8000-000000000001'
    ) where user_id = '12000000-0000-4000-8000-000000000002'),
    -60.00::numeric,
    'confirmed payment reduces pair balance without changing expense history'
);
select lives_ok(
    $$insert into issue6_settlement_results(label, settlement_id, response, replayed)
      select 'stale', (response ->> 'id')::uuid, response, replayed
      from public.create_group_settlement_web(
          '22000000-0000-4000-8000-000000000001',
          '12000000-0000-4000-8000-000000000002',
          30.00, 'stale-payment', 'settlement-stale-0001'
      )$$,
    'second partial settlement captures current outstanding snapshot'
);
reset role;

insert into public.group_expenses(
    id, group_id, paid_by, title, total_amount, category, split_type,
    expense_date, created_at
)
values (
    '32000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000002',
    'Balance changed', 10.00, 'Other', 'exact', '2026-08-03', '2026-08-03T10:00:00Z'
);
insert into public.expense_splits(expense_id, user_id, owed_amount)
values (
    '32000000-0000-4000-8000-000000000003',
    '12000000-0000-4000-8000-000000000001',
    10.00
);

set local role authenticated;
set local "request.jwt.claim.sub" = '12000000-0000-4000-8000-000000000002';
select throws_ok(
    $$select public.confirm_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'stale')
    )$$,
    '22023',
    'SETTLEMENT_CHANGED',
    'any pair balance change invalidates pending snapshot'
);
select is(
    public.reject_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'stale')
    ) ->> 'status',
    'rejected',
    'receiver can reject stale settlement'
);
select is(
    public.reject_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'stale')
    ) ->> 'status',
    'rejected',
    'duplicate rejection is idempotent'
);
select is(
    public.confirm_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'stale')
    ) ->> 'status',
    'rejected',
    'confirming a rejected settlement returns existing terminal state'
);
reset role;

select is(
    (select status from public.payment_confirmations
     where settlement_id = (select settlement_id from issue6_settlement_results where label = 'stale')),
    'rejected',
    'rejection audit reaches rejected state atomically'
);
select is(
    (select sum(settled_amount) from public.expense_splits
     where expense_id in (
         '32000000-0000-4000-8000-000000000001',
         '32000000-0000-4000-8000-000000000002',
         '32000000-0000-4000-8000-000000000003'
     )),
    60.00::numeric,
    'stale confirmation and rejection allocate no money'
);
select is(
    (select count(*) from public.notifications
     where type = 'settlement_rejected'
       and related_id = (select settlement_id from issue6_settlement_results where label = 'stale')),
    1::bigint,
    'rejection retries enqueue one persistent result notification'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '12000000-0000-4000-8000-000000000001';
select lives_ok(
    $$insert into issue6_settlement_results(label, settlement_id, response, replayed)
      select 'third', (response ->> 'id')::uuid, response, replayed
      from public.create_group_settlement_web(
          '22000000-0000-4000-8000-000000000001',
          '12000000-0000-4000-8000-000000000002',
          10.00, 'third-payment', 'settlement-third-0001'
      )$$,
    'new settlement can be proposed after rejection'
);
set local "request.jwt.claim.sub" = '12000000-0000-4000-8000-000000000002';
select is(
    public.confirm_group_settlement_web(
        '22000000-0000-4000-8000-000000000001',
        (select settlement_id from issue6_settlement_results where label = 'third')
    ) ->> 'status',
    'confirmed',
    'receiver confirms replacement settlement'
);
reset role;

select is(
    (select settled_amount from public.expense_splits
     where expense_id = '32000000-0000-4000-8000-000000000001'),
    70.00::numeric,
    'replacement confirmation finishes oldest split before newer splits'
);
select is(
    (select settled_amount from public.expense_splits
     where expense_id = '32000000-0000-4000-8000-000000000002'),
    0.00::numeric,
    'oldest-first allocation remains deterministic across confirmations'
);

update public.settlements
set created_at = case transaction_ref
    when 'first-payment' then '2026-08-10T10:00:00Z'::timestamptz
    when 'stale-payment' then '2026-08-10T11:00:00Z'::timestamptz
    when 'third-payment' then '2026-08-10T12:00:00Z'::timestamptz
    else created_at
end
where group_id = '22000000-0000-4000-8000-000000000001';

set local role authenticated;
set local "request.jwt.claim.sub" = '12000000-0000-4000-8000-000000000001';
select is(
    (select count(*) from public.list_group_settlements_web(
        '22000000-0000-4000-8000-000000000001', null, null, 1
    )),
    2::bigint,
    'list RPC returns limit plus one row for next-cursor detection'
);
select is(
    (select transaction_ref from public.list_group_settlements_web(
        '22000000-0000-4000-8000-000000000001', null, null, 1
    ) limit 1),
    'third-payment',
    'settlement history sorts newest first with stable tie-breaker'
);
select is(
    (select transaction_ref from public.list_group_settlements_web(
        '22000000-0000-4000-8000-000000000001',
        '2026-08-10T12:00:00Z',
        (select settlement_id from issue6_settlement_results where label = 'third'),
        1
    ) limit 1),
    'stale-payment',
    'keyset cursor continues without duplicating previous row'
);
reset role;

select * from finish();
rollback;
