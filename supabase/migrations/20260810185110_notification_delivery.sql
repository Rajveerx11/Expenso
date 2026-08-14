-- Persistent notification inbox, secure FCM token lifecycle, and event outbox.
-- Depends on the v1 foundation migration from issue #1.

alter table public.user_fcm_tokens
    add column installation_id text;

update public.user_fcm_tokens
set installation_id = id::text
where installation_id is null;

alter table public.user_fcm_tokens
    alter column installation_id set not null;

create unique index user_fcm_tokens_user_installation_idx
    on public.user_fcm_tokens(user_id, installation_id);

create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid not null references public.profiles(id) on delete cascade,
    type text not null check (
        type in (
            'expense_added',
            'member_added',
            'settlement_request',
            'settlement_confirmed',
            'settlement_rejected'
        )
    ),
    title text not null check (char_length(trim(title)) between 1 and 120),
    message text not null check (char_length(trim(message)) between 1 and 500),
    group_id uuid references public.groups(id) on delete set null,
    related_id uuid,
    event_key text not null check (char_length(event_key) between 1 and 200),
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    read_at timestamptz,
    delivery_started_at timestamptz,
    delivered_at timestamptz,
    delivery_attempt_count integer not null default 0 check (delivery_attempt_count >= 0),
    next_delivery_at timestamptz not null default now(),
    last_delivery_error text,
    created_at timestamptz not null default now(),
    unique (recipient_id, event_key)
);

create index notifications_recipient_created_idx
    on public.notifications(recipient_id, created_at desc);
create index notifications_delivery_pending_idx
    on public.notifications(next_delivery_at)
    where delivered_at is null;

create table public.notification_deliveries (
    id uuid primary key default gen_random_uuid(),
    notification_id uuid not null references public.notifications(id) on delete cascade,
    token_id uuid references public.user_fcm_tokens(id) on delete set null,
    status text not null default 'pending' check (status in ('pending', 'sent', 'invalid')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    next_attempt_at timestamptz not null default now(),
    last_error text,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    unique (notification_id, token_id),
    check ((status = 'sent' and sent_at is not null) or status <> 'sent')
);

create index notification_deliveries_pending_idx
    on public.notification_deliveries(next_attempt_at)
    where status = 'pending';

alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (recipient_id = auth.uid());

grant select on public.notifications to authenticated;
grant select, update on public.notifications to service_role;
grant select, insert, update, delete on public.notification_deliveries to service_role;
revoke all on public.user_fcm_tokens from authenticated;
grant select, delete on public.user_fcm_tokens to service_role;

create or replace function public.register_push_token(
    token_param text,
    installation_id_param text,
    device_info_param text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := auth.uid();
    token_id uuid;
    normalized_token text := trim(token_param);
    normalized_installation_id text := trim(installation_id_param);
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if char_length(normalized_token) not between 20 and 4096 then
        raise exception 'Invalid push token' using errcode = '22023';
    end if;
    if char_length(normalized_installation_id) not between 8 and 128 then
        raise exception 'Invalid installation identifier' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(normalized_token, 7));
    perform pg_advisory_xact_lock(
        hashtextextended(caller_id::text || ':' || normalized_installation_id, 8)
    );

    delete from public.user_fcm_tokens
    where fcm_token = normalized_token
       or (user_id = caller_id and installation_id = normalized_installation_id);

    insert into public.user_fcm_tokens(user_id, fcm_token, installation_id, device_info)
    values (
        caller_id,
        normalized_token,
        normalized_installation_id,
        nullif(left(trim(device_info_param), 200), '')
    )
    returning id into token_id;

    return token_id;
end;
$$;

create or replace function public.unregister_push_token(installation_id_param text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    affected_rows integer;
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    delete from public.user_fcm_tokens
    where user_id = auth.uid()
      and installation_id = trim(installation_id_param);
    get diagnostics affected_rows = row_count;
    return affected_rows > 0;
end;
$$;

create or replace function public.mark_notifications_read(notification_id_param uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    affected_rows integer;
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    update public.notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = auth.uid()
      and read_at is null
      and (notification_id_param is null or id = notification_id_param);
    get diagnostics affected_rows = row_count;
    return affected_rows;
end;
$$;

create or replace function public.claim_notification_delivery(notification_id_param uuid)
returns setof public.notifications
language sql
security definer
set search_path = ''
as $$
    update public.notifications
    set delivery_started_at = now()
    where id = notification_id_param
      and delivered_at is null
      and next_delivery_at <= now()
      and (
          delivery_started_at is null
          or delivery_started_at < now() - interval '5 minutes'
      )
    returning *;
$$;

create or replace function private.invalidate_removed_push_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.notification_deliveries
    set status = 'invalid',
        last_error = 'Push token removed',
        next_attempt_at = now()
    where token_id = old.id
      and status = 'pending';
    return old;
end;
$$;

create trigger invalidate_removed_push_token
before delete on public.user_fcm_tokens
for each row execute function private.invalidate_removed_push_token();

create or replace function private.enqueue_notification(
    recipient_id_param uuid,
    type_param text,
    title_param text,
    message_param text,
    group_id_param uuid,
    related_id_param uuid,
    event_key_param text,
    payload_param jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.notifications(
        recipient_id,
        type,
        title,
        message,
        group_id,
        related_id,
        event_key,
        payload
    ) values (
        recipient_id_param,
        type_param,
        title_param,
        message_param,
        group_id_param,
        related_id_param,
        event_key_param,
        coalesce(payload_param, '{}'::jsonb)
    )
    on conflict (recipient_id, event_key) do nothing;
end;
$$;

create or replace function private.notify_group_expense_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    member_record record;
    group_name text;
begin
    select name into group_name from public.groups where id = new.group_id;
    for member_record in
        select user_id
        from public.group_members
        where group_id = new.group_id and user_id <> new.paid_by
    loop
        perform private.enqueue_notification(
            member_record.user_id,
            'expense_added',
            'New expense in ' || group_name,
            format('%s added for "%s"', to_char(new.total_amount, 'FM999999990.00'), new.title),
            new.group_id,
            new.id,
            'expense:' || new.id::text,
            jsonb_build_object('group_id', new.group_id, 'expense_id', new.id)
        );
    end loop;
    return new;
end;
$$;

create or replace function private.notify_group_member_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    group_record record;
begin
    select name, created_by into group_record
    from public.groups
    where id = new.group_id;

    if new.user_id <> group_record.created_by then
        perform private.enqueue_notification(
            new.user_id,
            'member_added',
            'Added to ' || group_record.name,
            'You are now a member of this expense group.',
            new.group_id,
            new.id,
            'member:' || new.id::text,
            jsonb_build_object('group_id', new.group_id, 'membership_id', new.id)
        );
    end if;
    return new;
end;
$$;

create or replace function private.notify_settlement_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    payer_name text;
begin
    select full_name into payer_name from public.profiles where id = new.payer_id;
    perform private.enqueue_notification(
        new.receiver_id,
        'settlement_request',
        'Settlement request',
        format('%s says they paid %s.', payer_name, to_char(new.amount, 'FM999999990.00')),
        new.group_id,
        new.id,
        'settlement-request:' || new.id::text,
        jsonb_build_object('group_id', new.group_id, 'settlement_id', new.id)
    );
    return new;
end;
$$;

create or replace function private.notify_settlement_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if old.status = 'pending_confirmation'
       and new.status in ('confirmed', 'rejected')
    then
        perform private.enqueue_notification(
            new.payer_id,
            case when new.status = 'confirmed' then 'settlement_confirmed' else 'settlement_rejected' end,
            case when new.status = 'confirmed' then 'Payment confirmed' else 'Payment rejected' end,
            format(
                'Your settlement of %s was %s.',
                to_char(new.amount, 'FM999999990.00'),
                new.status
            ),
            new.group_id,
            new.id,
            'settlement-result:' || new.id::text || ':' || new.status,
            jsonb_build_object('group_id', new.group_id, 'settlement_id', new.id, 'status', new.status)
        );
    end if;
    return new;
end;
$$;

create trigger notify_group_expense_created
after insert on public.group_expenses
for each row execute function private.notify_group_expense_created();

create trigger notify_group_member_added
after insert on public.group_members
for each row execute function private.notify_group_member_added();

create trigger notify_settlement_requested
after insert on public.settlements
for each row execute function private.notify_settlement_requested();

create trigger notify_settlement_result
after update of status on public.settlements
for each row execute function private.notify_settlement_result();

revoke all on function public.register_push_token(text, text, text) from public;
revoke all on function public.unregister_push_token(text) from public;
revoke all on function public.mark_notifications_read(uuid) from public;
revoke all on function public.claim_notification_delivery(uuid) from public;
revoke all on function private.invalidate_removed_push_token() from public;
revoke all on function private.enqueue_notification(uuid, text, text, text, uuid, uuid, text, jsonb) from public;
revoke all on function private.notify_group_expense_created() from public;
revoke all on function private.notify_group_member_added() from public;
revoke all on function private.notify_settlement_requested() from public;
revoke all on function private.notify_settlement_result() from public;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
grant execute on function public.claim_notification_delivery(uuid) to service_role;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications'
    ) then
        alter publication supabase_realtime add table public.notifications;
    end if;
exception
    when undefined_object then null;
end;
$$;
