begin;
select plan(7);

do $$
begin
    perform vault.create_secret(
        'local-test-rate-limit-secret-1234567890',
        'expenso_auth_rate_limit_secret'
    );
end;
$$;

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-profile@test.local', '', now(), '{"full_name":"Owner"}', now(), now()),
    ('13000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member-profile@test.local', '', now(), '{"full_name":"Member"}', now(), now());

update public.profiles
set total_income = 9000, total_balance = 4500, upi_id = 'owner@test'
where id = '13000000-0000-0000-0000-000000000001';

insert into public.groups(id, name, created_by)
values ('23000000-0000-0000-0000-000000000001', 'Profile privacy', '13000000-0000-0000-0000-000000000001');
insert into public.group_members(group_id, user_id, role)
values
    ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'admin'),
    ('23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'editor');

set local role authenticated;
set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000002';
select is(
    (select count(*) from public.profiles where id = '13000000-0000-0000-0000-000000000001'),
    0::bigint,
    'related member cannot select the owner profile row or financial aggregates'
);
select is(
    (select count(*) from public.get_group_member_directory('23000000-0000-0000-0000-000000000001')),
    2::bigint,
    'related member can use the narrow member directory'
);
select is(
    (select count(*) from public.get_group_member_directory('23000000-0000-0000-0000-000000000001') where upi_id_available),
    1::bigint,
    'directory exposes only UPI availability'
);

set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000001';
select is(
    (select total_income from public.profiles where id = '13000000-0000-0000-0000-000000000001'),
    9000.00::numeric,
    'owner can select own income aggregate'
);

set local "request.jwt.claim.sub" = '13000000-0000-0000-0000-000000000002';
select throws_ok(
    $$select * from public.get_group_member_directory('23000000-0000-0000-0000-000000000099')$$,
    '42501',
    'Group membership required',
    'directory rejects non-members'
);
reset role;

set local role anon;
select throws_ok(
    $$select * from public.check_auth_rate_limit(
        'login',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'wrong-public-secret-123456789012345'
    )$$,
    '42501',
    'Rate limit authorization failed',
    'direct anonymous callers cannot write arbitrary limiter keys'
);
reset role;
select is(
    (select count(*) from private.auth_rate_limits),
    0::bigint,
    'rejected anonymous limiter call creates no persistent row'
);

select * from finish();
rollback;
