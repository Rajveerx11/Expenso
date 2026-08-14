#!/usr/bin/env bash
set -euo pipefail

database_url="${1:?database URL is required}"

now_millis() {
  psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
    "select floor(extract(epoch from clock_timestamp()) * 1000)::bigint"
}

wait_for_advisory_lock() {
  local application_name="$1"
  local lock_count
  for _ in {1..100}; do
    lock_count=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
      "select count(*) from pg_locks locks join pg_stat_activity activity using (pid) where locks.locktype='advisory' and locks.granted and activity.application_name='$application_name' and activity.wait_event='PgSleep'")
    if (( lock_count > 0 )); then return 0; fi
    sleep 0.05
  done
  echo "writer $application_name never acquired its advisory lock" >&2
  return 1
}

cleanup() {
  psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
drop function if exists public.issue5_concurrent_create(numeric);
drop function if exists public.issue5_expense_balance_hold(numeric);
drop function if exists public.issue5_settlement_during_expense();
drop function if exists public.issue5_remove_member_hold(numeric);
drop function if exists public.issue5_create_as_removed_member();
delete from public.payment_confirmations where settlement_id in (
  select id from public.settlements where group_id in (
    '25000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000002'
  )
);
delete from public.settlements where group_id in (
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000002'
);
delete from public.group_expenses where group_id in (
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000002'
);
delete from public.group_members where group_id in (
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000002'
);
delete from public.groups where id in (
  '25000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000002'
);
delete from auth.users where id in (
  '15000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000002'
);
SQL
}
trap cleanup EXIT

psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('15000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'issue5-admin@test.local', '', now(), '{"full_name":"Issue 5 Admin"}', now(), now()),
  ('15000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'issue5-member@test.local', '', now(), '{"full_name":"Issue 5 Member"}', now(), now());
insert into public.groups(id, name, created_by)
values
  ('25000000-0000-4000-8000-000000000001', 'Concurrent replay', '15000000-0000-4000-8000-000000000001'),
  ('25000000-0000-4000-8000-000000000002', 'Concurrent revocation', '15000000-0000-4000-8000-000000000001');
insert into public.group_members(group_id, user_id, role)
values
  ('25000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'admin'),
  ('25000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002', 'editor'),
  ('25000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000001', 'admin'),
  ('25000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000002', 'editor');

create or replace function public.issue5_concurrent_create(hold_seconds_param numeric)
returns boolean language plpgsql security definer set search_path = '' as $$
declare replay_value boolean;
begin
  perform set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
  select replayed into replay_value from public.create_group_expense_web(
    '25000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000001',
    'Concurrent replay',
    1.00,
    'Other',
    'equal',
    null,
    '2026-08-14',
    '[{"user_id":"15000000-0000-4000-8000-000000000001"},{"user_id":"15000000-0000-4000-8000-000000000002"}]'::jsonb,
    'issue5-replay-key01'
  );
  perform pg_sleep(hold_seconds_param);
  return replay_value;
end;
$$;

create or replace function public.issue5_remove_member_hold(hold_seconds_param numeric)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
  perform public.remove_group_member_safely(
    '25000000-0000-4000-8000-000000000002',
    '15000000-0000-4000-8000-000000000002'
  );
  perform pg_sleep(hold_seconds_param);
  return 'removed';
end;
$$;

create or replace function public.issue5_expense_balance_hold(hold_seconds_param numeric)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
  perform * from public.create_group_expense_web(
    '25000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000001',
    'Concurrent settlement balance',
    1.00,
    'Other',
    'equal',
    null,
    '2026-08-14',
    '[{"user_id":"15000000-0000-4000-8000-000000000001"},{"user_id":"15000000-0000-4000-8000-000000000002"}]'::jsonb,
    'issue5-balance-key01'
  );
  perform pg_sleep(hold_seconds_param);
  return 'created';
end;
$$;

create or replace function public.issue5_settlement_during_expense()
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
  return public.create_settlement(
    '25000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000001',
    0.25,
    'issue5-concurrent-settlement'
  );
end;
$$;

create or replace function public.issue5_create_as_removed_member()
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
  perform * from public.create_group_expense_web(
    '25000000-0000-4000-8000-000000000002',
    '15000000-0000-4000-8000-000000000001',
    'Revoked writer',
    1.00,
    'Other',
    'equal',
    null,
    '2026-08-14',
    '[{"user_id":"15000000-0000-4000-8000-000000000001"}]'::jsonb,
    'issue5-revoked-key1'
  );
  return 'created';
exception when sqlstate '42501' then
  return '42501';
end;
$$;
SQL

PGAPPNAME=issue5_replay_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue5_concurrent_create(1.5)" >/dev/null &
replay_a=$!
wait_for_advisory_lock issue5_replay_a
replay_start=$(now_millis)
replay_result=$(PGAPPNAME=issue5_replay_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue5_concurrent_create(0)")
replay_elapsed=$(($(now_millis) - replay_start))
wait "$replay_a"
if (( replay_elapsed < 1000 )); then
  echo "concurrent replay did not wait for the creating transaction" >&2
  exit 1
fi
if [[ "$replay_result" != "t" ]]; then
  echo "concurrent duplicate did not return stored replay: $replay_result" >&2
  exit 1
fi
replay_count=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select (select count(*) from public.group_expenses where group_id='25000000-0000-4000-8000-000000000001')::text || '|' || (select count(*) from private.api_idempotency_keys where user_id='15000000-0000-4000-8000-000000000001' and scope='group-expense:create')::text")
if [[ "$replay_count" != "1|1" ]]; then
  echo "concurrent replay created duplicates: $replay_count" >&2
  exit 1
fi

PGAPPNAME=issue5_expense_balance_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue5_expense_balance_hold(1.5)" >/dev/null &
expense_balance_a=$!
wait_for_advisory_lock issue5_expense_balance_a
settlement_start=$(now_millis)
settlement_id=$(PGAPPNAME=issue5_settlement_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue5_settlement_during_expense()")
settlement_elapsed=$(($(now_millis) - settlement_start))
wait "$expense_balance_a"
if (( settlement_elapsed < 1000 )); then
  echo "settlement proposal did not serialize behind shared expense mutation" >&2
  exit 1
fi
if [[ ! "$settlement_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "serialized settlement proposal failed: $settlement_id" >&2
  exit 1
fi
settlement_count=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from public.settlements where id='$settlement_id'::uuid and status='pending_confirmation'")
if [[ "$settlement_count" != "1" ]]; then
  echo "serialized settlement was not stored: $settlement_count" >&2
  exit 1
fi

PGAPPNAME=issue5_remove_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue5_remove_member_hold(1.5)" >/dev/null &
remove_a=$!
wait_for_advisory_lock issue5_remove_a
revoked_start=$(now_millis)
revoked_result=$(PGAPPNAME=issue5_removed_writer_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue5_create_as_removed_member()")
revoked_elapsed=$(($(now_millis) - revoked_start))
wait "$remove_a"
if (( revoked_elapsed < 1000 )); then
  echo "removed writer did not wait for membership revocation" >&2
  exit 1
fi
if [[ "$revoked_result" != "42501" ]]; then
  echo "removed writer retained expense authority: $revoked_result" >&2
  exit 1
fi
revoked_count=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from public.group_expenses where group_id='25000000-0000-4000-8000-000000000002'")
if [[ "$revoked_count" != "0" ]]; then
  echo "removed writer created an expense after revocation" >&2
  exit 1
fi

echo "shared expense concurrency checks passed"
