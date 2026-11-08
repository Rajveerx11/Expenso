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
drop function if exists public.issue6_create_settlement_hold(numeric);
drop function if exists public.issue6_confirm_settlement_hold(numeric);
drop function if exists public.issue6_reject_settlement_result();
drop function if exists public.issue6_expense_change_hold(numeric);
drop function if exists public.issue6_confirm_changed_result();
delete from public.notification_deliveries where notification_id in (
  select id from public.notifications where group_id in (
    '23000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002'
  )
);
delete from public.notifications where group_id in (
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000002'
);
delete from public.settlements where group_id in (
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000002'
);
delete from public.group_expenses where group_id in (
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000002'
);
delete from public.group_members where group_id in (
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000002'
);
delete from public.groups where id in (
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000002'
);
delete from auth.users where id in (
  '13000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000002'
);
SQL
}
trap cleanup EXIT

psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at
)
values
  ('13000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'settlement-concurrent-payer@test.local', '', now(), '{"full_name":"Concurrent Payer"}', now(), now()),
  ('13000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'settlement-concurrent-receiver@test.local', '', now(), '{"full_name":"Concurrent Receiver"}', now(), now());

insert into public.groups(id, name, created_by)
values
  ('23000000-0000-4000-8000-000000000001', 'Settlement replay race', '13000000-0000-4000-8000-000000000002'),
  ('23000000-0000-4000-8000-000000000002', 'Settlement balance race', '13000000-0000-4000-8000-000000000002');
insert into public.group_members(group_id, user_id, role)
values
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'editor'),
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002', 'admin'),
  ('23000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000001', 'editor'),
  ('23000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', 'admin');

insert into public.group_expenses(
  id, group_id, paid_by, title, total_amount, category, split_type, expense_date
)
values
  ('33000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002', 'Replay debt', 100.00, 'Other', 'exact', current_date),
  ('33000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', 'Changing debt', 10.00, 'Other', 'exact', current_date);
insert into public.expense_splits(expense_id, user_id, owed_amount)
values
  ('33000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 100.00),
  ('33000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000001', 10.00);

create or replace function public.issue6_create_settlement_hold(hold_seconds_param numeric)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  replay_value boolean;
begin
  perform set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
  select replayed into replay_value
  from public.create_group_settlement_web(
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000002',
    40.00,
    'concurrent-replay',
    'settlement-concurrent-replay'
  );
  perform pg_sleep(hold_seconds_param);
  return replay_value;
end;
$$;

create or replace function public.issue6_confirm_settlement_hold(hold_seconds_param numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  response_value jsonb;
begin
  perform set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
  select public.confirm_group_settlement_web(
    '23000000-0000-4000-8000-000000000001',
    (
      select id from public.settlements
      where group_id = '23000000-0000-4000-8000-000000000001'
        and transaction_ref = 'concurrent-replay'
    )
  ) into response_value;
  perform pg_sleep(hold_seconds_param);
  return response_value ->> 'status';
end;
$$;

create or replace function public.issue6_reject_settlement_result()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  response_value jsonb;
begin
  perform set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
  select public.reject_group_settlement_web(
    '23000000-0000-4000-8000-000000000001',
    (
      select id from public.settlements
      where group_id = '23000000-0000-4000-8000-000000000001'
        and transaction_ref = 'concurrent-replay'
    )
  ) into response_value;
  return response_value ->> 'status';
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
  perform * from public.create_group_settlement_web(
    '23000000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000002',
    10.00,
    'balance-change',
    'settlement-balance-change'
  );
end;
$$;

create or replace function public.issue6_expense_change_hold(hold_seconds_param numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
  perform * from public.create_group_expense_web(
    '23000000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000001',
    'Concurrent reciprocal expense',
    10.00,
    'Other',
    'exact',
    null,
    current_date,
    '[{"user_id":"13000000-0000-4000-8000-000000000002","value":"10.00"}]'::jsonb,
    'issue6-balance-expense'
  );
  perform pg_sleep(hold_seconds_param);
  return 'expense-created';
end;
$$;

create or replace function public.issue6_confirm_changed_result()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
  perform public.confirm_group_settlement_web(
    '23000000-0000-4000-8000-000000000002',
    (
      select id from public.settlements
      where group_id = '23000000-0000-4000-8000-000000000002'
        and transaction_ref = 'balance-change'
    )
  );
  return 'confirmed';
exception when sqlstate '22023' then
  return sqlstate || ':' || sqlerrm;
end;
$$;
SQL

PGAPPNAME=issue6_replay_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue6_create_settlement_hold(1.5)" >/dev/null &
replay_a=$!
wait_for_advisory_lock issue6_replay_a
replay_start=$(now_millis)
replay_result=$(PGAPPNAME=issue6_replay_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue6_create_settlement_hold(0)")
replay_elapsed=$(($(now_millis) - replay_start))
wait "$replay_a"
if (( replay_elapsed < 1000 )); then
  echo "concurrent settlement replay did not wait for creating transaction" >&2
  exit 1
fi
if [[ "$replay_result" != "t" ]]; then
  echo "concurrent settlement duplicate did not replay: $replay_result" >&2
  exit 1
fi
replay_counts=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select (select count(*) from public.settlements where group_id='23000000-0000-4000-8000-000000000001')::text || '|' || (select count(*) from public.payment_confirmations where settlement_id in (select id from public.settlements where group_id='23000000-0000-4000-8000-000000000001'))::text || '|' || (select count(*) from public.notifications where group_id='23000000-0000-4000-8000-000000000001' and type='settlement_request')::text || '|' || (select count(*) from private.api_idempotency_keys where user_id='13000000-0000-4000-8000-000000000001' and scope='settlement:create' and idempotency_key='settlement-concurrent-replay')::text")
if [[ "$replay_counts" != "1|1|1|1" ]]; then
  echo "concurrent settlement replay created duplicates: $replay_counts" >&2
  exit 1
fi

PGAPPNAME=issue6_confirm_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue6_confirm_settlement_hold(1.5)" >/dev/null &
confirm_a=$!
wait_for_advisory_lock issue6_confirm_a
reject_start=$(now_millis)
reject_result=$(PGAPPNAME=issue6_reject_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue6_reject_settlement_result()")
reject_elapsed=$(($(now_millis) - reject_start))
wait "$confirm_a"
if (( reject_elapsed < 1000 )); then
  echo "concurrent reject did not serialize behind confirmation" >&2
  exit 1
fi
if [[ "$reject_result" != "confirmed" ]]; then
  echo "concurrent opposite action changed terminal result: $reject_result" >&2
  exit 1
fi
terminal_state=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select (select status from public.settlements where group_id='23000000-0000-4000-8000-000000000001') || '|' || (select settled_amount::text from public.expense_splits where expense_id='33000000-0000-4000-8000-000000000001') || '|' || (select count(*) from public.notifications where group_id='23000000-0000-4000-8000-000000000001' and type='settlement_confirmed')::text")
if [[ "$terminal_state" != "confirmed|40.00|1" ]]; then
  echo "confirm/reject race produced inconsistent state: $terminal_state" >&2
  exit 1
fi

PGAPPNAME=issue6_expense_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue6_expense_change_hold(1.5)" >/dev/null &
expense_a=$!
wait_for_advisory_lock issue6_expense_a
changed_start=$(now_millis)
changed_result=$(PGAPPNAME=issue6_changed_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue6_confirm_changed_result()")
changed_elapsed=$(($(now_millis) - changed_start))
wait "$expense_a"
if (( changed_elapsed < 1000 )); then
  echo "settlement confirmation did not wait for balance mutation" >&2
  exit 1
fi
if [[ "$changed_result" != "22023:SETTLEMENT_CHANGED" ]]; then
  echo "confirmation missed committed balance change: $changed_result" >&2
  exit 1
fi
changed_state=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select (select status from public.settlements where group_id='23000000-0000-4000-8000-000000000002') || '|' || (select settled_amount::text from public.expense_splits where expense_id='33000000-0000-4000-8000-000000000002')")
if [[ "$changed_state" != "pending_confirmation|0.00" ]]; then
  echo "changed-balance confirmation mutated settlement: $changed_state" >&2
  exit 1
fi

echo "settlement concurrency checks passed"
