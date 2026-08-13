begin;
select plan(25);

do $$ begin
  perform vault.create_secret(
    'local-test-rate-limit-secret-1234567890',
    'expenso_auth_rate_limit_secret'
  );
end $$;

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('15000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'group-admin@test.local', '', now(), '{"full_name":"Group Admin"}', now(), now()),
  ('15000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'group-member@test.local', '', now(), '{"full_name":"Group Member"}', now(), now()),
  ('15000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'group-outsider@test.local', '', now(), '{"full_name":"Group Outsider"}', now(), now());

set local role authenticated;
set local "request.jwt.claim.sub" = '15000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select public.create_group_with_admin('Web group', '  Test group  ')$$,
  'creator can create group and admin membership atomically'
);
do $$ begin
  perform set_config('test.web_group_id', (select id::text from public.groups where name = 'Web group'), true);
end $$;
select is(
  (select role from public.group_members where group_id = current_setting('test.web_group_id')::uuid and user_id = '15000000-0000-0000-0000-000000000001'),
  'admin', 'creator is admin'
);
select is(
  public.add_group_member_by_email(
    current_setting('test.web_group_id')::uuid,
    ' GROUP-MEMBER@TEST.LOCAL ',
    'local-test-rate-limit-secret-1234567890'
  ),
  '15000000-0000-0000-0000-000000000002'::uuid,
  'exact normalized email adds registered member'
);
select throws_ok(
  $$select public.add_group_member_by_email(
      current_setting('test.web_group_id')::uuid,
      'group-member@test.local',
      'local-test-rate-limit-secret-1234567890'
  )$$,
  'P0001', 'This user is already a group member', 'duplicate member is precise'
);
select throws_ok(
  $$select public.add_group_member_by_email(
      current_setting('test.web_group_id')::uuid,
      'missing@test.local',
      'local-test-rate-limit-secret-1234567890'
  )$$,
  'P0001', 'No registered Expenso user has that email', 'unknown exact email is precise'
);
select is(
  (select count(*) from public.list_group_members(current_setting('test.web_group_id')::uuid)),
  2::bigint, 'member directory returns full current membership'
);
select is(
  (select member_count from public.get_group_summary(current_setting('test.web_group_id')::uuid)),
  2::bigint, 'group summary contains member count'
);
select throws_ok(
  $$select public.add_group_member_by_email(
      current_setting('test.web_group_id')::uuid,
      'group-outsider@test.local',
      'public-does-not-know-server-secret'
  )$$,
  '42501', 'Member lookup authorization failed',
  'direct member lookup is unavailable without server secret'
);

set local "request.jwt.claim.sub" = '15000000-0000-0000-0000-000000000003';
select is(
  (select count(*) from public.get_group_summary(current_setting('test.web_group_id')::uuid)),
  0::bigint, 'outsider sees safe absence for group detail'
);
select throws_ok(
  $$select * from public.list_group_members(current_setting('test.web_group_id')::uuid)$$,
  '42501', 'Group membership required', 'outsider cannot enumerate members'
);
select throws_ok(
  $$insert into public.groups(name, created_by) values ('Bypass', '15000000-0000-0000-0000-000000000003')$$,
  '42501', 'permission denied for table groups', 'authenticated user cannot bypass group RPC with direct DML'
);

set local "request.jwt.claim.sub" = '15000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select public.update_group_settings(current_setting('test.web_group_id')::uuid, '{"name":"Hijack"}'::jsonb)$$,
  '42501', 'Group administrator permission required', 'editor cannot edit group settings'
);
select throws_ok(
  $$select public.add_group_member_by_email(
      current_setting('test.web_group_id')::uuid,
      'group-outsider@test.local',
      'local-test-rate-limit-secret-1234567890'
  )$$,
  '42501', 'Group administrator permission required', 'editor cannot add members'
);
select throws_ok(
  $$select public.remove_group_member_safely(
      current_setting('test.web_group_id')::uuid,
      '15000000-0000-0000-0000-000000000001'
  )$$,
  '42501', 'Group administrator permission required', 'editor cannot remove members'
);
select throws_ok(
  $$select public.attach_group_image(
      current_setting('test.web_group_id')::uuid,
      current_setting('test.web_group_id') || '/cover-00000000-0000-4000-8000-000000000001.webp',
      'https://storage.test/group.webp'
  )$$,
  '42501', 'Group administrator permission required', 'editor cannot attach group images'
);

set local "request.jwt.claim.sub" = '15000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.remove_group_member_safely(
      current_setting('test.web_group_id')::uuid,
      '15000000-0000-0000-0000-000000000001'
  )$$,
  'P0001', 'Transfer administration before leaving this group',
  'admin cannot remove self and lose sole administration'
);
select throws_ok(
  $$select public.update_group_settings(
      current_setting('test.web_group_id')::uuid,
      '{"name":123}'::jsonb
  )$$,
  '22023', 'Invalid group patch', 'direct RPC rejects non-string name values'
);

select lives_ok(
  $$select public.create_group_expense(
      current_setting('test.web_group_id')::uuid,
      '15000000-0000-0000-0000-000000000001',
      'Debt guard', 10.00, 'Other', 'exact', null, '2026-08-14',
      '[{"user_id":"15000000-0000-0000-0000-000000000002","owed_amount":10}]'::jsonb
  )$$,
  'fixture shared expense is created'
);
select throws_ok(
  $$select public.remove_group_member_safely(
      current_setting('test.web_group_id')::uuid,
      '15000000-0000-0000-0000-000000000002'
  )$$,
  'P0001', 'Settle this member''s balances before removing them',
  'unresolved debt blocks member removal'
);
select is(
  (select count(*) from public.group_members where group_id = current_setting('test.web_group_id')::uuid and user_id = '15000000-0000-0000-0000-000000000002'),
  1::bigint, 'failed debt removal leaves membership unchanged'
);

reset role;
insert into public.settlements(group_id, payer_id, receiver_id, amount, status)
values (
  current_setting('test.web_group_id')::uuid,
  '15000000-0000-0000-0000-000000000002',
  '15000000-0000-0000-0000-000000000001',
  1.00,
  'pending_confirmation'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '15000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.delete_group_safely(current_setting('test.web_group_id')::uuid)$$,
  'P0001', 'Resolve pending settlements before deleting this group',
  'pending settlement blocks group deletion'
);
reset role;
update public.settlements set status = 'rejected' where group_id = current_setting('test.web_group_id')::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = '15000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.delete_group_safely(current_setting('test.web_group_id')::uuid)$$,
  'P0001', 'Groups with financial history are retained for audit and cannot be deleted',
  'financial history blocks group deletion'
);

select lives_ok(
  $$select public.create_group_with_admin('Delete me', null)$$,
  'history-free deletion fixture created'
);
select is(
  public.delete_group_safely((select id from public.groups where name = 'Delete me')),
  true, 'history-free group deletion succeeds'
);

do $$
declare result record;
begin
  for i in 1..20 loop
    select * into result from public.check_group_member_lookup_rate_limit(
      'local-test-rate-limit-secret-1234567890'
    );
  end loop;
end $$;
select is(
  (select allowed from public.check_group_member_lookup_rate_limit(
    'local-test-rate-limit-secret-1234567890'
  )),
  false,
  'durable member lookup limiter rejects the twenty-first lookup'
);

select * from finish();
rollback;
