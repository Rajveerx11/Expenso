#!/usr/bin/env bash
set -euo pipefail

database_url="${1:?database URL is required}"
background_pids=()

wait_for_trigger_sleep() {
  local application_name="$1"
  local sleeping
  for _ in {1..100}; do
    sleeping=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
      "select count(*) from pg_stat_activity where application_name='$application_name' and wait_event='PgSleep'")
    if (( sleeping > 0 )); then return 0; fi
    sleep 0.05
  done
  echo "writer $application_name never reached the subscription trigger" >&2
  return 1
}

cleanup() {
  for pid in "${background_pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
drop trigger if exists a_issue6_hold_subscription on public.web_push_subscriptions;
drop function if exists public.issue6_hold_web_push_subscription();
drop function if exists public.issue6_disable_web_push_subscription();
delete from public.web_push_notification_deliveries where subscription_id = '24000000-0000-4000-8000-000000000001';
delete from public.notifications where recipient_id = '14000000-0000-4000-8000-000000000001';
delete from public.web_push_subscriptions where id = '24000000-0000-4000-8000-000000000001';
delete from auth.users where id = '14000000-0000-4000-8000-000000000001';
SQL
}
trap cleanup EXIT

psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at
)
values (
  '14000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'web-push-concurrency@test.local', '', now(), '{"full_name":"Push Concurrency"}', now(), now()
);

insert into public.web_push_subscriptions(id, user_id, endpoint, p256dh, auth, user_agent)
values (
  '24000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  'https://fcm.googleapis.com/fcm/send/issue6-concurrency',
  repeat('A', 43), repeat('B', 16), 'issue6-concurrency'
);

create or replace function public.issue6_hold_web_push_subscription()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('application_name', true) in ('issue6_push_invalid_a', 'issue6_push_disable_a')
     and new.id = '24000000-0000-4000-8000-000000000001'::uuid then
    perform pg_catalog.pg_sleep(1.5);
  end if;
  return new;
end;
$$;

create trigger a_issue6_hold_subscription
before update on public.web_push_subscriptions
for each row execute function public.issue6_hold_web_push_subscription();

create or replace function public.issue6_disable_web_push_subscription()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
  return public.disable_web_push_subscription('24000000-0000-4000-8000-000000000001');
end;
$$;

insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values
  ('34000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', 'expense_added', 'First', 'First', 'issue6-push-concurrency-1', '/notifications'),
  ('34000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000001', 'expense_added', 'Second', 'Second', 'issue6-push-concurrency-2', '/notifications');

do $$
declare claimed_count integer;
begin
  select count(*) into claimed_count
  from public.claim_web_push_deliveries(
    10, '44000000-0000-4000-8000-000000000001', 60, null
  );
  if claimed_count <> 2 then
    raise exception 'expected two initial delivery claims, got %', claimed_count;
  end if;
end;
$$;
SQL

PGAPPNAME=issue6_push_invalid_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "set statement_timeout='10s'; select public.complete_web_push_delivery((select id from public.web_push_notification_deliveries where notification_id='34000000-0000-4000-8000-000000000001'), '44000000-0000-4000-8000-000000000001', 'invalid', 'HTTP_410', 'gone', null)" >/dev/null &
invalid_a_pid=$!
background_pids+=("$invalid_a_pid")
wait_for_trigger_sleep issue6_push_invalid_a

invalid_b_result=$(PGAPPNAME=issue6_push_invalid_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "set statement_timeout='10s'; select public.complete_web_push_delivery((select id from public.web_push_notification_deliveries where notification_id='34000000-0000-4000-8000-000000000002'), '44000000-0000-4000-8000-000000000001', 'invalid', 'HTTP_410', 'gone', null)")
if ! wait "$invalid_a_pid"; then
  echo "first concurrent invalid completion failed" >&2
  exit 1
fi
background_pids=()
if [[ "$invalid_b_result" != "f" ]]; then
  echo "second invalid completion should observe terminal invalid state: $invalid_b_result" >&2
  exit 1
fi

invalid_state=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) filter (where status='invalid')::text || '|' || count(*) filter (where lease_token is not null)::text || '|' || ((select disabled_at is not null from public.web_push_subscriptions where id='24000000-0000-4000-8000-000000000001'))::text from public.web_push_notification_deliveries where notification_id in ('34000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002')")
if [[ "$invalid_state" != "2|0|true" ]]; then
  echo "concurrent invalid completions left inconsistent state: $invalid_state" >&2
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update public.web_push_subscriptions
set disabled_at = null
where id = '24000000-0000-4000-8000-000000000001';

insert into public.notifications(id, recipient_id, type, title, message, event_key, href)
values (
  '34000000-0000-4000-8000-000000000003',
  '14000000-0000-4000-8000-000000000001',
  'expense_added', 'Third', 'Third', 'issue6-push-concurrency-3', '/notifications'
);

do $$
declare claimed_count integer;
begin
  select count(*) into claimed_count
  from public.claim_web_push_deliveries(
    10,
    '44000000-0000-4000-8000-000000000002',
    60,
    '34000000-0000-4000-8000-000000000003'
  );
  if claimed_count <> 1 then
    raise exception 'expected one targeted delivery claim, got %', claimed_count;
  end if;
end;
$$;
SQL

PGAPPNAME=issue6_push_disable_a psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "set statement_timeout='10s'; select public.issue6_disable_web_push_subscription()" >/dev/null &
disable_a_pid=$!
background_pids+=("$disable_a_pid")
wait_for_trigger_sleep issue6_push_disable_a

completion_result=$(PGAPPNAME=issue6_push_complete_b psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "set statement_timeout='10s'; select public.complete_web_push_delivery((select id from public.web_push_notification_deliveries where notification_id='34000000-0000-4000-8000-000000000003'), '44000000-0000-4000-8000-000000000002', 'sent', null, null, null)")
if ! wait "$disable_a_pid"; then
  echo "concurrent subscription disable failed" >&2
  exit 1
fi
background_pids=()
if [[ "$completion_result" != "f" ]]; then
  echo "completion should observe delivery invalidated by disable: $completion_result" >&2
  exit 1
fi

disable_state=$(psql "$database_url" -v ON_ERROR_STOP=1 -Atqc \
  "select status || '|' || (lease_token is null)::text || '|' || ((select disabled_at is not null from public.web_push_subscriptions where id='24000000-0000-4000-8000-000000000001'))::text from public.web_push_notification_deliveries where notification_id='34000000-0000-4000-8000-000000000003'")
if [[ "$disable_state" != "invalid|true|true" ]]; then
  echo "disable/completion race left inconsistent state: $disable_state" >&2
  exit 1
fi

echo "Web Push concurrency checks passed"
