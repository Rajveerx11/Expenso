begin;
select no_plan();

insert into auth.users(
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at
) values
    ('10000000-0000-0000-0000-000000000050', 'authenticated', 'authenticated', 'push-one@test.local', '', now(), '{"full_name":"Push One"}', now(), now()),
    ('10000000-0000-0000-0000-000000000051', 'authenticated', 'authenticated', 'push-two@test.local', '', now(), '{"full_name":"Push Two"}', now(), now()),
    ('10000000-0000-0000-0000-000000000052', 'authenticated', 'authenticated', 'push-three@test.local', '', now(), '{"full_name":"Push Three"}', now(), now());

insert into public.groups(id, name, created_by)
values ('20000000-0000-0000-0000-000000000050', 'Web Push test', '10000000-0000-0000-0000-000000000050');
insert into public.group_members(group_id, user_id, role)
values
    ('20000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000050', 'admin'),
    ('20000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000051', 'editor');

-- Remove setup-trigger notifications so every assertion below owns its queue.
delete from public.notifications
where recipient_id in (
    '10000000-0000-0000-0000-000000000050',
    '10000000-0000-0000-0000-000000000051',
    '10000000-0000-0000-0000-000000000052'
);

select has_table('public', 'web_push_subscriptions', 'browser subscriptions use a dedicated table');
select has_table('public', 'web_push_notification_deliveries', 'browser delivery attempts use a dedicated table');
select has_table('public', 'user_fcm_tokens', 'legacy FCM tokens remain intact');
select has_table('public', 'notification_deliveries', 'legacy FCM deliveries remain intact');
select has_column('public', 'notifications', 'href', 'inbox rows carry an authoritative browser path');

select throws_like(
    $$insert into public.notifications(
        id, recipient_id, type, title, message, event_key, href
      ) values (
        '30000000-0000-0000-0000-000000000050',
        '10000000-0000-0000-0000-000000000050',
        'expense_added', 'Unsafe', 'Unsafe path', 'unsafe:path', 'https://evil.test/'
      )$$,
    '%notifications_href_safe%',
    'absolute notification URLs are rejected'
);

select lives_ok(
    $$select private.enqueue_notification(
        '10000000-0000-0000-0000-000000000050',
        'settlement_request',
        'Settlement request',
        'Confirm the payment.',
        '20000000-0000-0000-0000-000000000050',
        '40000000-0000-0000-0000-000000000050',
        'web-push:settlement-path',
        '{}'::jsonb
    )$$,
    'legacy event producers still enqueue notifications'
);
select is(
    (select href from public.notifications where event_key = 'web-push:settlement-path'),
    '/groups/20000000-0000-0000-0000-000000000050/settlements/40000000-0000-0000-0000-000000000050',
    'settlement events receive a strict detail path'
);
select lives_ok(
    $$select private.enqueue_notification(
        '10000000-0000-0000-0000-000000000050',
        'settlement_request',
        'Duplicate ignored',
        'Duplicate ignored.',
        '20000000-0000-0000-0000-000000000050',
        '40000000-0000-0000-0000-000000000050',
        'web-push:settlement-path',
        '{}'::jsonb
    )$$,
    'event-key replay remains harmless'
);
select is(
    (select count(*) from public.notifications where event_key = 'web-push:settlement-path'),
    1::bigint,
    'event keys still deduplicate the canonical inbox'
);

delete from public.notifications
where recipient_id in (
    '10000000-0000-0000-0000-000000000050',
    '10000000-0000-0000-0000-000000000051'
);
insert into public.notifications(
    id, recipient_id, type, title, message, event_key, href, created_at
) values
    ('30000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000050', 'expense_added', 'Old', 'Old', 'cursor:old', '/notifications', '2026-08-14T01:00:00Z'),
    ('30000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000050', 'expense_added', 'Middle', 'Middle', 'cursor:middle', '/notifications', '2026-08-14T02:00:00Z'),
    ('30000000-0000-0000-0000-000000000053', '10000000-0000-0000-0000-000000000050', 'expense_added', 'New', 'New', 'cursor:new', '/notifications', '2026-08-14T03:00:00Z'),
    ('30000000-0000-0000-0000-000000000054', '10000000-0000-0000-0000-000000000051', 'expense_added', 'Other', 'Other', 'cursor:other', '/notifications', '2026-08-14T04:00:00Z');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
select is(
    (select count(*) from public.list_notifications_web(null, null, 2)),
    3::bigint,
    'notification page returns one lookahead row'
);
select is(
    (select id from public.list_notifications_web(null, null, 2) limit 1),
    '30000000-0000-0000-0000-000000000053'::uuid,
    'notification list sorts newest first'
);
select is(
    (select id from public.list_notifications_web(
        '2026-08-14T02:00:00Z',
        '30000000-0000-0000-0000-000000000052',
        2
    ) limit 1),
    '30000000-0000-0000-0000-000000000051'::uuid,
    'notification keyset cursor resumes without duplicates'
);
select is(
    public.mark_notification_read_web('30000000-0000-0000-0000-000000000053'),
    true,
    'recipient marks one notification read'
);
select is(
    public.mark_notification_read_web('30000000-0000-0000-0000-000000000053'),
    true,
    'mark-one replay is idempotent'
);
select is(
    public.mark_notification_read_web('30000000-0000-0000-0000-000000000054'),
    false,
    'recipient cannot mark another inbox row read'
);
select is(public.mark_all_notifications_read_web(), 2, 'mark-all updates only unread owned rows');
select is(
    (select count(*) from public.list_notifications_web(null, null, 50) where not is_read),
    0::bigint,
    'owned inbox is fully read'
);

set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000051';
select is(
    (select count(*) from public.list_notifications_web(null, null, 50)),
    1::bigint,
    'notification RPC derives recipient from session identity'
);
reset role;

select ok(
    not has_table_privilege('authenticated', 'public.web_push_subscriptions', 'select'),
    'authenticated role cannot read subscription endpoint or key material directly'
);
select ok(
    not has_table_privilege('authenticated', 'public.web_push_notification_deliveries', 'select'),
    'authenticated role cannot read delivery internals directly'
);
select ok(
    not has_function_privilege(
        'authenticated',
        'public.claim_web_push_deliveries(integer,uuid,integer,uuid)',
        'execute'
    ),
    'authenticated role cannot claim worker jobs'
);
select ok(
    has_function_privilege(
        'service_role',
        'public.claim_web_push_deliveries(integer,uuid,integer,uuid)',
        'execute'
    ),
    'service role can claim worker jobs'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
select lives_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://fcm.googleapis.com/fcm/send/browser-one',
        repeat('A', 87), repeat('B', 22), now() + interval '30 days', 'Test Browser One'
    )$$,
    'authenticated user registers a browser subscription'
);
select ok(
    (
        select not (
            to_jsonb(registration) ?| array['endpoint', 'p256dh', 'auth', 'user_id']
        )
        from public.upsert_web_push_subscription(
            'https://fcm.googleapis.com/fcm/send/browser-one',
            repeat('C', 87), repeat('D', 22), now() + interval '30 days', 'Rotated Browser One'
        ) registration
    ),
    'subscription RPC returns only safe metadata'
);
reset role;
select is(
    (select count(*) from public.web_push_subscriptions where endpoint like '%browser-one'),
    1::bigint,
    'same-user endpoint rotation does not duplicate subscriptions'
);
select is(
    (select p256dh from public.web_push_subscriptions where endpoint like '%browser-one'),
    repeat('C', 87),
    'same-user rotation replaces Web Push key material'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
select throws_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://fcm.googleapis.com/fcm/send/expired',
        repeat('E', 87), repeat('F', 22), now() - interval '1 second', null
    )$$,
    '22023',
    'Invalid Web Push subscription',
    'already-expired subscription registration is rejected'
);
select throws_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://127.0.0.1/internal-push-target',
        repeat('E', 87), repeat('F', 22), now() + interval '30 days', null
    )$$,
    '22023',
    'Invalid Web Push subscription',
    'direct RPC rejects a loopback Web Push endpoint'
);
select throws_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://attacker.example/web-push-target',
        repeat('E', 87), repeat('F', 22), now() + interval '30 days', null
    )$$,
    '22023',
    'Invalid Web Push subscription',
    'direct RPC rejects an unsupported attacker-controlled endpoint'
);
reset role;

insert into public.web_push_subscriptions(
    user_id, endpoint, p256dh, auth, expiration_time, user_agent, disabled_at
) values
    (
        '10000000-0000-0000-0000-000000000052',
        'https://stale-disabled.notify.windows.com/w/disabled',
        repeat('E', 87), repeat('F', 22), null, 'Stale disabled', now()
    ),
    (
        '10000000-0000-0000-0000-000000000052',
        'https://stale-expired.notify.windows.com/w/expired',
        repeat('E', 87), repeat('F', 22), now() - interval '1 day', 'Stale expired', null
    );
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000052';
do $$
declare
    endpoint_number integer;
begin
    for endpoint_number in 1..10 loop
        perform public.upsert_web_push_subscription(
            format('https://push-%s.notify.windows.com/w/%s', endpoint_number, endpoint_number),
            repeat('G', 87), repeat('H', 22), now() + interval '30 days', 'Capacity Browser'
        );
    end loop;
end;
$$;
select throws_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://push-11.notify.windows.com/w/11',
        repeat('G', 87), repeat('H', 22), now() + interval '30 days', 'Capacity Browser'
    )$$,
    'P0001',
    'WEB_PUSH_SUBSCRIPTION_LIMIT',
    'eleventh unique active endpoint fails with a stable capacity marker'
);
reset role;
select is(
    (
        select count(*)
        from public.web_push_subscriptions
        where user_id = '10000000-0000-0000-0000-000000000052'
          and disabled_at is null
          and (expiration_time is null or expiration_time > now())
    ),
    10::bigint,
    'capacity rejection leaves exactly ten active subscriptions'
);
select is(
    (
        select count(*)
        from public.web_push_subscriptions
        where user_id = '10000000-0000-0000-0000-000000000052'
          and endpoint like '%stale-%'
    ),
    0::bigint,
    'upsert prunes caller-owned disabled and expired subscriptions'
);

insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values (
    '30000000-0000-0000-0000-000000000060',
    '10000000-0000-0000-0000-000000000050',
    'expense_added', 'Transfer', 'Transfer safety', 'transfer:old-owner', '/notifications'
);
select is(
    (
        select count(*)
        from public.web_push_notification_deliveries deliveries
        where deliveries.notification_id = '30000000-0000-0000-0000-000000000060'::uuid
    ),
    1::bigint,
    'notification insert seeds one delivery per active owned subscription'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000051';
select lives_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://fcm.googleapis.com/fcm/send/browser-one',
        repeat('G', 87), repeat('H', 22), now() + interval '30 days', 'Transferred Browser'
    )$$,
    'unleased endpoint transfers atomically to the current browser user'
);
reset role;
select is(
    (select user_id from public.web_push_subscriptions where endpoint like '%browser-one'),
    '10000000-0000-0000-0000-000000000051'::uuid,
    'transferred endpoint has one current owner'
);
select is(
    (
        select status from public.web_push_notification_deliveries
        where notification_id = '30000000-0000-0000-0000-000000000060'
    ),
    'invalid',
    'endpoint transfer terminates old-recipient pending delivery'
);

insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values (
    '30000000-0000-0000-0000-000000000061',
    '10000000-0000-0000-0000-000000000051',
    'expense_added', 'Busy', 'Busy transfer', 'transfer:leased', '/notifications'
);
select is(
    (select count(*) from public.claim_web_push_deliveries(
        1, '50000000-0000-0000-0000-000000000061', 120
    )),
    1::bigint,
    'worker claims a due delivery with a lease'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
select throws_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://fcm.googleapis.com/fcm/send/browser-one',
        repeat('I', 87), repeat('J', 22), now() + interval '30 days', 'Unsafe transfer attempt'
    )$$,
    '40001',
    'WEB_PUSH_ENDPOINT_BUSY',
    'cross-user endpoint transfer fails while an old-recipient send lease is active'
);
reset role;
select is(
    public.complete_web_push_delivery(
        (select id from public.web_push_notification_deliveries
         where notification_id = '30000000-0000-0000-0000-000000000061'),
        '50000000-0000-0000-0000-000000000061',
        'failed', 'TEST_TERMINAL', null, null
    ),
    true,
    'worker can terminate the leased transfer-safety fixture'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
select lives_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://fcm.googleapis.com/fcm/send/browser-one',
        repeat('I', 87), repeat('J', 22), now() + interval '30 days', 'Safe transfer'
    )$$,
    'endpoint transfer succeeds after the old delivery lease is terminal'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
select lives_ok(
    $$select * from public.upsert_web_push_subscription(
        'https://updates.push.services.mozilla.com/wpush/v2/browser-two',
        repeat('K', 87), repeat('L', 22), now() + interval '30 days', 'Browser Two'
    )$$,
    'second browser subscription registers'
);
reset role;

insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values (
    '30000000-0000-0000-0000-000000000062',
    '10000000-0000-0000-0000-000000000050',
    'expense_added', 'Disable', 'Disable test', 'disable:test', '/notifications'
);
do $$
begin
    perform set_config(
        'test.browser_two_id',
        (select id::text from public.web_push_subscriptions where endpoint like '%browser-two'),
        true
    );
end;
$$;
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000051';
select is(
    public.disable_web_push_subscription(
        current_setting('test.browser_two_id')::uuid
    ),
    false,
    'another user cannot disable a browser subscription'
);
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
select is(
    public.disable_web_push_subscription(
        current_setting('test.browser_two_id')::uuid
    ),
    true,
    'owner disables their browser subscription'
);
reset role;
select is(
    (
        select status
        from public.web_push_notification_deliveries deliveries
        join public.web_push_subscriptions subscriptions on subscriptions.id = deliveries.subscription_id
        where deliveries.notification_id = '30000000-0000-0000-0000-000000000062'
          and subscriptions.endpoint like '%browser-two'
    ),
    'invalid',
    'disabling a subscription terminates its pending deliveries'
);

-- Disable the transfer fixture so subsequent claims contain exactly one row.
do $$
begin
    perform set_config(
        'test.browser_one_id',
        (select id::text from public.web_push_subscriptions where endpoint like '%browser-one'),
        true
    );
end;
$$;
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
do $$
begin
    perform public.disable_web_push_subscription(
        current_setting('test.browser_one_id')::uuid
    );
    perform public.upsert_web_push_subscription(
        'https://web.push.apple.com/browser-three',
        repeat('M', 87), repeat('N', 22), now() + interval '30 days', 'Browser Three'
    );
end;
$$;
reset role;

insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values (
    '30000000-0000-0000-0000-000000000063',
    '10000000-0000-0000-0000-000000000050',
    'settlement_confirmed', 'Delivery', 'Delivery test', 'delivery:retry', '/notifications'
);
select is(
    (select count(*) from public.claim_web_push_deliveries(
        10, '50000000-0000-0000-0000-000000000063', 120
    )),
    1::bigint,
    'worker claims active recipient-matched delivery'
);
select is(
    (select count(*) from public.claim_web_push_deliveries(
        10, '50000000-0000-0000-0000-000000000064', 120
    )),
    0::bigint,
    'active lease prevents duplicate worker claim'
);
select is(
    public.complete_web_push_delivery(
        (select id from public.web_push_notification_deliveries
         where notification_id = '30000000-0000-0000-0000-000000000063'),
        '50000000-0000-0000-0000-000000000064',
        'sent', null, null, null
    ),
    false,
    'stale lease token cannot complete a delivery'
);
select is(
    public.complete_web_push_delivery(
        (select id from public.web_push_notification_deliveries
         where notification_id = '30000000-0000-0000-0000-000000000063'),
        '50000000-0000-0000-0000-000000000063',
        'retry', 'HTTP_503', 'Push service unavailable', 60
    ),
    true,
    'transient failure schedules a bounded retry'
);
select ok(
    (
        select status = 'pending'
           and attempt_count = 1
           and lease_token is null
           and next_attempt_at > now()
        from public.web_push_notification_deliveries
        where notification_id = '30000000-0000-0000-0000-000000000063'
    ),
    'retry preserves subscription and clears delivery lease'
);

update public.web_push_notification_deliveries
set next_attempt_at = now()
where notification_id = '30000000-0000-0000-0000-000000000063';
select is(
    (select count(*) from public.claim_web_push_deliveries(
        1, '50000000-0000-0000-0000-000000000065', 120
    )),
    1::bigint,
    'due retry can be reclaimed'
);
select is(
    public.complete_web_push_delivery(
        (select id from public.web_push_notification_deliveries
         where notification_id = '30000000-0000-0000-0000-000000000063'),
        '50000000-0000-0000-0000-000000000065',
        'sent', null, null, null
    ),
    true,
    'valid leased delivery completes as sent'
);
select ok(
    (
        select deliveries.status = 'sent'
           and deliveries.sent_at is not null
           and subscriptions.last_success_at is not null
        from public.web_push_notification_deliveries deliveries
        join public.web_push_subscriptions subscriptions on subscriptions.id = deliveries.subscription_id
        where deliveries.notification_id = '30000000-0000-0000-0000-000000000063'
    ),
    'sent completion records delivery and subscription success timestamps'
);

do $$
begin
    perform set_config(
        'test.browser_three_id',
        (select id::text from public.web_push_subscriptions where endpoint like '%browser-three'),
        true
    );
end;
$$;
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
do $$
begin
    perform public.disable_web_push_subscription(
        current_setting('test.browser_three_id')::uuid
    );
    perform public.upsert_web_push_subscription(
        'https://fcm.googleapis.com/fcm/send/browser-four',
        repeat('O', 87), repeat('P', 22), now() + interval '30 days', 'Browser Four'
    );
end;
$$;
reset role;
insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values
    ('30000000-0000-0000-0000-000000000064', '10000000-0000-0000-0000-000000000050', 'expense_added', 'Invalid one', 'Invalid one', 'invalid:one', '/notifications'),
    ('30000000-0000-0000-0000-000000000065', '10000000-0000-0000-0000-000000000050', 'expense_added', 'Invalid two', 'Invalid two', 'invalid:two', '/notifications');
select is(
    (select count(*) from public.claim_web_push_deliveries(
        1, '50000000-0000-0000-0000-000000000066', 120
    )),
    1::bigint,
    'invalid-subscription fixture claims one delivery'
);
select is(
    public.complete_web_push_delivery(
        (select id from public.web_push_notification_deliveries
         where lease_token = '50000000-0000-0000-0000-000000000066'),
        '50000000-0000-0000-0000-000000000066',
        'invalid', 'HTTP_410', 'Push subscription expired', null
    ),
    true,
    'permanent push response completes as invalid'
);
select ok(
    (select disabled_at is not null from public.web_push_subscriptions where endpoint like '%browser-four'),
    'invalid completion disables the subscription'
);
select is(
    (
        select count(*)
        from public.web_push_notification_deliveries deliveries
        join public.web_push_subscriptions subscriptions on subscriptions.id = deliveries.subscription_id
        where subscriptions.endpoint like '%browser-four'
          and deliveries.status = 'invalid'
    ),
    2::bigint,
    'invalid subscription makes every pending delivery terminal'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
do $$
begin
    perform public.upsert_web_push_subscription(
        'https://updates.push.services.mozilla.com/wpush/v2/browser-five',
        repeat('Q', 87), repeat('R', 22), now() + interval '30 days', 'Browser Five'
    );
end;
$$;
reset role;
insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values (
    '30000000-0000-0000-0000-000000000066',
    '10000000-0000-0000-0000-000000000050',
    'expense_added', 'Expired', 'Expired', 'expired:test', '/notifications'
);
update public.web_push_subscriptions
set expiration_time = now() - interval '1 second'
where endpoint like '%browser-five';
select is(
    (
        select status
        from public.web_push_notification_deliveries deliveries
        join public.web_push_subscriptions subscriptions on subscriptions.id = deliveries.subscription_id
        where subscriptions.endpoint like '%browser-five'
          and deliveries.notification_id = '30000000-0000-0000-0000-000000000066'
    ),
    'invalid',
    'subscription expiry makes pending delivery terminal'
);

-- A corrupted recipient/subscription pairing is cleaned, never returned to a worker.
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000050';
do $$
begin
    perform public.upsert_web_push_subscription(
        'https://updates.push.services.mozilla.com/wpush/v2/browser-six',
        repeat('S', 87), repeat('T', 22), now() + interval '30 days', 'Browser Six'
    );
end;
$$;
reset role;
insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values (
    '30000000-0000-0000-0000-000000000067',
    '10000000-0000-0000-0000-000000000051',
    'expense_added', 'Mismatch', 'Mismatch', 'mismatch:test', '/notifications'
);
insert into public.web_push_notification_deliveries(notification_id, subscription_id)
select
    '30000000-0000-0000-0000-000000000067',
    id
from public.web_push_subscriptions
where endpoint like '%browser-six';
select is(
    (select count(*) from public.claim_web_push_deliveries(
        100, '50000000-0000-0000-0000-000000000067', 120
    )),
    0::bigint,
    'worker never receives recipient-owner mismatch'
);
select is(
    (
        select status from public.web_push_notification_deliveries
        where notification_id = '30000000-0000-0000-0000-000000000067'
    ),
    'invalid',
    'recipient-owner mismatch is made terminal'
);

-- A worker can die after the provider accepts a push but before completion.
-- Lease acquisition therefore consumes the attempt budget by itself.
insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values (
    '30000000-0000-0000-0000-000000000068',
    '10000000-0000-0000-0000-000000000050',
    'expense_added', 'Crash budget', 'Crash budget', 'crash:budget', '/notifications'
);
update public.web_push_notification_deliveries
set attempt_count = 7, next_attempt_at = now()
where notification_id = '30000000-0000-0000-0000-000000000068';
select is(
    (select attempt_count from public.claim_web_push_deliveries(
        1, '50000000-0000-0000-0000-000000000068', 120
    )),
    8,
    'eighth lease reports the final one-based attempt number'
);
update public.web_push_notification_deliveries
set lease_expires_at = now() - interval '1 second'
where notification_id = '30000000-0000-0000-0000-000000000068';
select is(
    (select count(*) from public.claim_web_push_deliveries(
        1, '50000000-0000-0000-0000-000000000069', 120
    )),
    0::bigint,
    'expired final lease is never reclaimed for a ninth send'
);
select is(
    (
        select status || '|' || attempt_count::text
        from public.web_push_notification_deliveries
        where notification_id = '30000000-0000-0000-0000-000000000068'
    ),
    'failed|8',
    'crashed final attempt becomes terminal without completion callback'
);

select * from finish();
rollback;
