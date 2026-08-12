begin;
select plan(10);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'creator-groups@test.local', '', now(), '{"full_name":"Creator"}', now(), now()),
    ('12000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member-groups@test.local', '', now(), '{"full_name":"Member"}', now(), now()),
    ('12000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'outsider-groups@test.local', '', now(), '{"full_name":"Outsider"}', now(), now());

set local role authenticated;
set local "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000001';
select lives_ok(
    $$select public.create_group_with_admin('Trip', 'Summer trip')$$,
    'group and creator membership are created atomically'
);
select lives_ok(
    $$select public.create_group_with_admin('Home', null)$$,
    'multiple groups can be created for one user'
);
reset role;

select is((select count(*) from public.groups where created_by = '12000000-0000-0000-0000-000000000001'), 2::bigint, 'both groups are stored');
select is(
    (select count(*) from public.group_members where user_id = '12000000-0000-0000-0000-000000000001' and role = 'admin'),
    2::bigint,
    'creator is admin of both groups'
);

insert into public.groups(id, name, created_by)
values ('22000000-0000-0000-0000-000000000003', 'Legacy orphan', '12000000-0000-0000-0000-000000000001');
select private.repair_group_creator_memberships();
select is(
    (select count(*) from public.group_members
     where group_id = '22000000-0000-0000-0000-000000000003'
       and user_id = '12000000-0000-0000-0000-000000000001'
       and role = 'admin'),
    1::bigint,
    'repair restores one administrator membership for an orphan group'
);
select private.repair_group_creator_memberships();
select is(
    (select count(*) from public.group_members
     where group_id = '22000000-0000-0000-0000-000000000003'
       and user_id = '12000000-0000-0000-0000-000000000001'),
    1::bigint,
    'rerunning repair does not duplicate creator membership'
);

insert into public.group_members(group_id, user_id, role)
select id, '12000000-0000-0000-0000-000000000002', 'editor'
from public.groups
where created_by = '12000000-0000-0000-0000-000000000001'
  and id <> '22000000-0000-0000-0000-000000000003';

set local role authenticated;
set local "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000001';
select is((select count(*) from public.list_user_groups()), 3::bigint, 'creator sees every group once');

set local "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000002';
select is((select count(*) from public.list_user_groups()), 2::bigint, 'member sees every joined group once');

set local "request.jwt.claim.sub" = '12000000-0000-0000-0000-000000000003';
select is((select count(*) from public.list_user_groups()), 0::bigint, 'non-member sees no groups');
reset role;

select ok(
    not has_function_privilege('anon', 'public.list_user_groups()', 'execute'),
    'anonymous role cannot execute group listing'
);

select * from finish();
rollback;
