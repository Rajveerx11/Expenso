begin;
select plan(21);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('10000000-0000-0000-0000-000000000020', 'authenticated', 'authenticated', 'notify-admin@test.local', '', now(), '{"full_name":"Notify admin"}', now(), now()),
    ('10000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'notify-member@test.local', '', now(), '{"full_name":"Notify member"}', now(), now());
insert into public.groups(id, name, created_by)
values ('20000000-0000-0000-0000-000000000020', 'Notification test', '10000000-0000-0000-0000-000000000020');
insert into public.group_members(group_id, user_id, role)
values ('20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000020', 'admin');
insert into public.group_members(group_id, user_id, role)
values ('20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000021', 'editor');

select is(
    (select count(*) from public.notifications where recipient_id = '10000000-0000-0000-0000-000000000021' and type = 'member_added'),
    1::bigint,
    'member addition creates one inbox event'
);

insert into public.group_expenses(id, group_id, paid_by, title, total_amount, category, split_type, expense_date)
values ('30000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000020', 'Shared lunch', 25, 'Food', 'equal', current_date);
select is(
    (select count(*) from public.notifications where recipient_id = '10000000-0000-0000-0000-000000000021' and type = 'expense_added'),
    1::bigint,
    'expense creates one event for another member'
);

insert into public.settlements(id, group_id, payer_id, receiver_id, amount, transaction_ref)
values ('40000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000021', 10, 'notify-settlement');
select is(
    (select count(*) from public.notifications where recipient_id = '10000000-0000-0000-0000-000000000021' and type = 'settlement_request'),
    1::bigint,
    'settlement request notifies the receiver'
);
update public.settlements
set status = 'confirmed', confirmed_at = now()
where id = '40000000-0000-0000-0000-000000000020';
select is(
    (select count(*) from public.notifications where recipient_id = '10000000-0000-0000-0000-000000000020' and type = 'settlement_confirmed'),
    1::bigint,
    'settlement result notifies the payer'
);

select lives_ok(
    $$select private.enqueue_notification(
        '10000000-0000-0000-0000-000000000021', 'expense_added', 'Duplicate test', 'First delivery',
        '20000000-0000-0000-0000-000000000020', null, 'duplicate:event', '{}'::jsonb
    )$$,
    'first event-key insertion succeeds'
);
select lives_ok(
    $$select private.enqueue_notification(
        '10000000-0000-0000-0000-000000000021', 'expense_added', 'Duplicate test', 'Second delivery',
        '20000000-0000-0000-0000-000000000020', null, 'duplicate:event', '{}'::jsonb
    )$$,
    'duplicate event-key insertion is harmless'
);
select is(
    (select count(*) from public.notifications where recipient_id = '10000000-0000-0000-0000-000000000021' and event_key = 'duplicate:event'),
    1::bigint,
    'event keys deduplicate persistent notifications'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000021';
select throws_ok(
    $$insert into public.notifications(recipient_id, type, title, message, event_key)
      values ('10000000-0000-0000-0000-000000000021', 'expense_added', 'Forged', 'Forged', 'forged')$$,
    '42501',
    'permission denied for table notifications',
    'clients cannot forge inbox records'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000020';
select is((select count(*) from public.notifications), 1::bigint, 'RLS exposes only admin recipient events');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000021';
select is((select count(*) from public.notifications), 4::bigint, 'RLS exposes only member recipient events');

select lives_ok(
    $$select public.register_push_token(
        'first-notification-token-000000000001', 'installation-00000001', 'Test device'
    )$$,
    'device token registers through authenticated RPC'
);
select lives_ok(
    $$select public.register_push_token(
        'rotated-notification-token-000000001', 'installation-00000001', 'Test device'
    )$$,
    'token rotation replaces the installation registration'
);
reset role;
select is(
    (select count(*) from public.user_fcm_tokens where user_id = '10000000-0000-0000-0000-000000000021'),
    1::bigint,
    'one installation keeps one token after rotation'
);
select is(
    (select fcm_token from public.user_fcm_tokens where user_id = '10000000-0000-0000-0000-000000000021'),
    'rotated-notification-token-000000001',
    'rotated token is the active token'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000021';
select is(
    public.mark_notifications_read(
        (select id from public.notifications where type = 'member_added' limit 1)
    ),
    1,
    'recipient marks one notification read'
);
select ok(
    (select read_at is not null from public.notifications where type = 'member_added' limit 1),
    'read timestamp is persisted'
);
reset role;

set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000020';
select is(
    public.mark_notifications_read(
        (select id from public.notifications where recipient_id = '10000000-0000-0000-0000-000000000021' and type = 'expense_added' limit 1)
    ),
    0,
    'another user cannot mark recipient events read'
);

insert into public.notification_deliveries(notification_id, token_id)
select notifications.id, tokens.id
from public.notifications as notifications
cross join public.user_fcm_tokens as tokens
where notifications.recipient_id = '10000000-0000-0000-0000-000000000021'
  and notifications.type = 'member_added'
  and tokens.user_id = '10000000-0000-0000-0000-000000000021';

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000021';
select is(public.unregister_push_token('installation-00000001'), true, 'sign-out removes this installation token');
reset role;
select is(
    (select count(*) from public.user_fcm_tokens where user_id = '10000000-0000-0000-0000-000000000021'),
    0::bigint,
    'no token remains for the unregistered installation'
);
select is(
    (select status from public.notification_deliveries limit 1),
    'invalid',
    'removing a token makes its pending delivery terminal'
);

update public.notifications
set next_delivery_at = now() + interval '1 hour'
where event_key = 'duplicate:event';
select is(
    (
        select count(*)
        from public.claim_notification_delivery(
            (select id from public.notifications where event_key = 'duplicate:event')
        )
    ),
    0::bigint,
    'delivery claims cannot bypass retry backoff'
);

select * from finish();
rollback;
