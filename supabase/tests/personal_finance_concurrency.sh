#!/usr/bin/env bash
set -euo pipefail

database_url="${1:?database URL is required}"

wait_for_advisory_lock() {
  local application_name="$1"
  local lock_count
  for _ in {1..100}; do
    lock_count=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
      "select count(*) from pg_locks locks join pg_stat_activity activity using (pid) where locks.locktype='advisory' and locks.granted and activity.application_name='$application_name' and activity.wait_event='PgSleep'")
    if (( lock_count > 0 )); then
      return 0
    fi
    sleep 0.05
  done
  echo "writer $application_name never acquired its advisory lock" >&2
  return 1
}

cleanup() {
  psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
drop function if exists public.issue3_concurrent_personal_create(text, numeric, text, text, numeric);
drop function if exists public.issue3_concurrent_group_create(uuid, text, jsonb, numeric);
drop function if exists public.issue4_remove_member_hold(uuid, uuid, numeric);
drop function if exists public.issue4_add_member(uuid, text, text);
drop function if exists public.issue4_update_as_removed_admin(uuid);
delete from public.group_expenses where group_id in (
  '24000000-0000-0000-0000-000000000097',
  '24000000-0000-0000-0000-000000000098',
  '24000000-0000-0000-0000-000000000096'
);
delete from public.group_members where group_id in (
  '24000000-0000-0000-0000-000000000097',
  '24000000-0000-0000-0000-000000000098',
  '24000000-0000-0000-0000-000000000096'
);
delete from public.groups where id in (
  '24000000-0000-0000-0000-000000000097',
  '24000000-0000-0000-0000-000000000098',
  '24000000-0000-0000-0000-000000000096'
);
delete from auth.users where id in (
  '14000000-0000-0000-0000-000000000097',
  '14000000-0000-0000-0000-000000000098',
  '14000000-0000-0000-0000-000000000099'
);
SQL
}
trap cleanup EXIT

psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
delete from auth.users where id in (
  '14000000-0000-0000-0000-000000000097',
  '14000000-0000-0000-0000-000000000098',
  '14000000-0000-0000-0000-000000000099'
);
insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('14000000-0000-0000-0000-000000000097', 'authenticated', 'authenticated', 'group-lock-a@test.local', '', now(), '{"full_name":"Group Lock A"}', now(), now()),
  ('14000000-0000-0000-0000-000000000098', 'authenticated', 'authenticated', 'group-lock-b@test.local', '', now(), '{"full_name":"Group Lock B"}', now(), now()),
  ('14000000-0000-0000-0000-000000000099', 'authenticated', 'authenticated', 'ledger-concurrency@test.local', '', now(), '{"full_name":"Concurrent Ledger"}', now(), now());

insert into public.groups(id, name, created_by)
values
  ('24000000-0000-0000-0000-000000000096', 'Concurrent membership', '14000000-0000-0000-0000-000000000097'),
  ('24000000-0000-0000-0000-000000000097', 'Concurrent group A', '14000000-0000-0000-0000-000000000097'),
  ('24000000-0000-0000-0000-000000000098', 'Concurrent group B', '14000000-0000-0000-0000-000000000097');
insert into public.group_members(group_id, user_id, role)
values
  ('24000000-0000-0000-0000-000000000096', '14000000-0000-0000-0000-000000000097', 'admin'),
  ('24000000-0000-0000-0000-000000000096', '14000000-0000-0000-0000-000000000098', 'editor'),
  ('24000000-0000-0000-0000-000000000097', '14000000-0000-0000-0000-000000000097', 'admin'),
  ('24000000-0000-0000-0000-000000000097', '14000000-0000-0000-0000-000000000098', 'editor'),
  ('24000000-0000-0000-0000-000000000098', '14000000-0000-0000-0000-000000000097', 'admin'),
  ('24000000-0000-0000-0000-000000000098', '14000000-0000-0000-0000-000000000098', 'editor');

create or replace function public.issue3_concurrent_personal_create(
  title_param text,
  amount_param numeric,
  idempotency_key_param text,
  request_hash_param text,
  hold_seconds_param numeric
)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000099', true);
  perform * from public.create_personal_expense(
    title_param, amount_param, 'Salary', 'income', null, '2026-08-14',
    idempotency_key_param, request_hash_param
  );
  perform pg_sleep(hold_seconds_param);
  return 'created';
end;
$$;

create or replace function public.issue3_concurrent_group_create(
  group_id_param uuid,
  title_param text,
  splits_param jsonb,
  hold_seconds_param numeric
)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000097', true);
  perform public.create_group_expense(
    group_id_param,
    '14000000-0000-0000-0000-000000000097',
    title_param,
    2.00,
    'Other',
    'exact',
    null,
    '2026-08-14',
    splits_param
  );
  perform pg_sleep(hold_seconds_param);
  return 'created';
end;
$$;

create or replace function public.issue4_remove_member_hold(
  group_id_param uuid,
  member_id_param uuid,
  hold_seconds_param numeric
)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000097', true);
  perform public.remove_group_member_safely(group_id_param, member_id_param);
  perform pg_sleep(hold_seconds_param);
  return 'removed';
end;
$$;

create or replace function public.issue4_add_member(
  group_id_param uuid,
  email_param text,
  secret_param text
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000097', true);
  return public.add_group_member_by_email(group_id_param, email_param, secret_param);
end;
$$;

create or replace function public.issue4_update_as_removed_admin(group_id_param uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000098', true);
  perform public.update_group_settings(group_id_param, '{"name":"Removed admin mutation"}'::jsonb);
  return 'updated';
exception when sqlstate '42501' then
  return '42501';
end;
$$;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'expenso_auth_rate_limit_secret') then
    perform vault.create_secret(
      'local-test-rate-limit-secret-1234567890',
      'expenso_auth_rate_limit_secret'
    );
  end if;
end;
$$;
SQL

PGAPPNAME=issue3_personal_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue3_concurrent_personal_create('Concurrent income A',100.00,'concurrent-create-key-a',repeat('d',64),1.5)" >/dev/null &
personal_a=$!
wait_for_advisory_lock issue3_personal_a
personal_start=$(date +%s%3N)
PGAPPNAME=issue3_personal_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue3_concurrent_personal_create('Concurrent income B',200.00,'concurrent-create-key-b',repeat('e',64),0)" >/dev/null &
personal_b=$!
wait "$personal_b"
personal_elapsed=$(($(date +%s%3N) - personal_start))
wait "$personal_a"
if (( personal_elapsed < 1000 )); then
  echo "second personal recalculation did not wait for the user ledger lock" >&2
  exit 1
fi
personal_result=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select total_income::text || '|' || (select count(*) from public.personal_expenses where user_id=profiles.id) from public.profiles where id='14000000-0000-0000-0000-000000000099'")
if [[ "$personal_result" != "300.00|2" ]]; then
  echo "concurrent personal aggregate mismatch: $personal_result" >&2
  exit 1
fi

PGAPPNAME=issue3_group_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue3_concurrent_group_create('24000000-0000-0000-0000-000000000097','Opposing order A','[{\"user_id\":\"14000000-0000-0000-0000-000000000097\",\"owed_amount\":1},{\"user_id\":\"14000000-0000-0000-0000-000000000098\",\"owed_amount\":1}]'::jsonb,1.5)" >/dev/null &
group_a=$!
wait_for_advisory_lock issue3_group_a
group_start=$(date +%s%3N)
PGAPPNAME=issue3_group_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue3_concurrent_group_create('24000000-0000-0000-0000-000000000098','Opposing order B','[{\"user_id\":\"14000000-0000-0000-0000-000000000098\",\"owed_amount\":1},{\"user_id\":\"14000000-0000-0000-0000-000000000097\",\"owed_amount\":1}]'::jsonb,0)" >/dev/null &
group_b=$!
wait "$group_b"
group_elapsed=$(($(date +%s%3N) - group_start))
wait "$group_a"
if (( group_elapsed < 1000 )); then
  echo "opposing-order group mutation did not wait for sorted batch locks" >&2
  exit 1
fi
group_result=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select string_agg(total_balance::text,',' order by id) || '|' || (select count(*) from public.personal_expenses where user_id in ('14000000-0000-0000-0000-000000000097','14000000-0000-0000-0000-000000000098')) from public.profiles where id in ('14000000-0000-0000-0000-000000000097','14000000-0000-0000-0000-000000000098')")
if [[ "$group_result" != "-2.00,-2.00|4" ]]; then
  echo "opposing-order group aggregate mismatch: $group_result" >&2
  exit 1
fi

PGAPPNAME=issue4_remove_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue4_remove_member_hold('24000000-0000-0000-0000-000000000096','14000000-0000-0000-0000-000000000098',1.5)" >/dev/null &
remove_a=$!
wait_for_advisory_lock issue4_remove_a
membership_start=$(date +%s%3N)
PGAPPNAME=issue4_add_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue4_add_member('24000000-0000-0000-0000-000000000096','group-lock-b@test.local','local-test-rate-limit-secret-1234567890')" >/dev/null &
add_b=$!
wait "$add_b"
membership_elapsed=$(($(date +%s%3N) - membership_start))
wait "$remove_a"
if (( membership_elapsed < 1000 )); then
  echo "concurrent membership add did not wait for serialized removal" >&2
  exit 1
fi
membership_result=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from public.group_members where group_id='24000000-0000-0000-0000-000000000096' and user_id='14000000-0000-0000-0000-000000000098'")
if [[ "$membership_result" != "1" ]]; then
  echo "serialized remove/add produced wrong membership result: $membership_result" >&2
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "update public.group_members set role='admin' where group_id='24000000-0000-0000-0000-000000000096' and user_id='14000000-0000-0000-0000-000000000098'" >/dev/null
PGAPPNAME=issue4_remove_admin_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue4_remove_member_hold('24000000-0000-0000-0000-000000000096','14000000-0000-0000-0000-000000000098',1.5)" >/dev/null &
remove_admin_a=$!
wait_for_advisory_lock issue4_remove_admin_a
removed_admin_start=$(date +%s%3N)
removed_admin_result=$(PGAPPNAME=issue4_removed_admin_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue4_update_as_removed_admin('24000000-0000-0000-0000-000000000096')")
removed_admin_elapsed=$(($(date +%s%3N) - removed_admin_start))
wait "$remove_admin_a"
if (( removed_admin_elapsed < 1000 )); then
  echo "waiting removed admin did not block behind membership revocation" >&2
  exit 1
fi
if [[ "$removed_admin_result" != "42501" ]]; then
  echo "removed admin retained mutation authority: $removed_admin_result" >&2
  exit 1
fi
group_name=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select name from public.groups where id='24000000-0000-0000-0000-000000000096'")
if [[ "$group_name" != "Concurrent membership" ]]; then
  echo "removed admin changed group after revocation: $group_name" >&2
  exit 1
fi

echo "personal finance and membership concurrency checks passed"
