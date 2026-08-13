#!/usr/bin/env bash
set -euo pipefail

database_url="${1:?database URL is required}"

cleanup() {
  psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
drop function if exists public.issue3_concurrent_personal_create(text, numeric, text, text, numeric);
drop function if exists public.issue3_concurrent_group_create(uuid, text, jsonb, numeric);
delete from public.group_expenses where group_id in (
  '24000000-0000-0000-0000-000000000097',
  '24000000-0000-0000-0000-000000000098'
);
delete from public.group_members where group_id in (
  '24000000-0000-0000-0000-000000000097',
  '24000000-0000-0000-0000-000000000098'
);
delete from public.groups where id in (
  '24000000-0000-0000-0000-000000000097',
  '24000000-0000-0000-0000-000000000098'
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
  ('24000000-0000-0000-0000-000000000097', 'Concurrent group A', '14000000-0000-0000-0000-000000000097'),
  ('24000000-0000-0000-0000-000000000098', 'Concurrent group B', '14000000-0000-0000-0000-000000000097');
insert into public.group_members(group_id, user_id, role)
values
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
SQL

psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue3_concurrent_personal_create('Concurrent income A',100.00,'concurrent-create-key-a',repeat('d',64),1.5)" >/dev/null &
personal_a=$!
sleep 0.2
personal_start=$(date +%s%3N)
psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue3_concurrent_personal_create('Concurrent income B',200.00,'concurrent-create-key-b',repeat('e',64),0)" >/dev/null &
personal_b=$!
wait "$personal_a"
wait "$personal_b"
personal_elapsed=$(($(date +%s%3N) - personal_start))
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

psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue3_concurrent_group_create('24000000-0000-0000-0000-000000000097','Opposing order A','[{\"user_id\":\"14000000-0000-0000-0000-000000000097\",\"owed_amount\":1},{\"user_id\":\"14000000-0000-0000-0000-000000000098\",\"owed_amount\":1}]'::jsonb,1.5)" >/dev/null &
group_a=$!
sleep 0.2
group_start=$(date +%s%3N)
psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select public.issue3_concurrent_group_create('24000000-0000-0000-0000-000000000098','Opposing order B','[{\"user_id\":\"14000000-0000-0000-0000-000000000098\",\"owed_amount\":1},{\"user_id\":\"14000000-0000-0000-0000-000000000097\",\"owed_amount\":1}]'::jsonb,0)" >/dev/null &
group_b=$!
wait "$group_a"
wait "$group_b"
group_elapsed=$(($(date +%s%3N) - group_start))
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

echo "personal finance concurrency checks passed"
