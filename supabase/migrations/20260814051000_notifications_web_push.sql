-- Persistent browser Web Push subscriptions and leased delivery queue.
-- Legacy Firebase token and delivery tables/functions remain untouched.

alter table public.notifications
    add column if not exists href text;

update public.notifications
set href = case
    when group_id is null then '/notifications'
    when type in ('settlement_request', 'settlement_confirmed', 'settlement_rejected')
         and related_id is not null
        then '/groups/' || group_id::text || '/settlements/' || related_id::text
    else '/groups/' || group_id::text
end
where href is null;

alter table public.notifications
    alter column href set not null;

alter table public.notifications
    drop constraint if exists notifications_href_safe;
alter table public.notifications
    add constraint notifications_href_safe check (
        href = '/notifications'
        or href ~ '^/groups/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or href ~ '^/groups/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/settlements/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    );

create index if not exists notifications_recipient_cursor_idx
    on public.notifications(recipient_id, created_at desc, id desc);

-- Preserve the legacy trigger call signature while making every new inbox row
-- carry an authoritative, same-origin browser destination.
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
declare
    href_value text;
begin
    href_value := case
        when group_id_param is null then '/notifications'
        when type_param in ('settlement_request', 'settlement_confirmed', 'settlement_rejected')
             and related_id_param is not null
            then '/groups/' || group_id_param::text || '/settlements/' || related_id_param::text
        else '/groups/' || group_id_param::text
    end;

    insert into public.notifications(
        recipient_id,
        type,
        title,
        message,
        group_id,
        related_id,
        event_key,
        payload,
        href
    ) values (
        recipient_id_param,
        type_param,
        title_param,
        message_param,
        group_id_param,
        related_id_param,
        event_key_param,
        coalesce(payload_param, '{}'::jsonb),
        href_value
    )
    on conflict (recipient_id, event_key) do nothing;
end;
$$;

create table public.web_push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    expiration_time timestamptz,
    user_agent text,
    disabled_at timestamptz,
    last_success_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (char_length(endpoint) between 20 and 2048),
    constraint web_push_subscriptions_endpoint_supported check (
        endpoint ~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+notify[.]windows[.]com)(:443)?(/[^[:space:]]*)?$'
    ),
    check (char_length(p256dh) between 43 and 256 and p256dh ~ '^[A-Za-z0-9_-]+$'),
    check (char_length(auth) between 16 and 128 and auth ~ '^[A-Za-z0-9_-]+$'),
    check (user_agent is null or char_length(user_agent) between 1 and 300)
);

create index web_push_subscriptions_user_active_idx
    on public.web_push_subscriptions(user_id, created_at desc)
    where disabled_at is null;

create table public.web_push_notification_deliveries (
    id uuid primary key default gen_random_uuid(),
    notification_id uuid not null references public.notifications(id) on delete cascade,
    subscription_id uuid references public.web_push_subscriptions(id) on delete set null,
    status text not null default 'pending'
        check (status in ('pending', 'sent', 'invalid', 'failed')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    next_attempt_at timestamptz not null default now(),
    lease_token uuid,
    lease_expires_at timestamptz,
    last_error_code text,
    last_error text,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (notification_id, subscription_id),
    check ((lease_token is null) = (lease_expires_at is null)),
    check (last_error_code is null or char_length(last_error_code) between 1 and 100),
    check (last_error is null or char_length(last_error) between 1 and 500),
    check ((status = 'sent' and sent_at is not null) or (status <> 'sent' and sent_at is null)),
    check (status = 'pending' or (lease_token is null and lease_expires_at is null))
);

create index web_push_deliveries_due_idx
    on public.web_push_notification_deliveries(next_attempt_at, created_at, id)
    where status = 'pending';
create index web_push_deliveries_subscription_pending_idx
    on public.web_push_notification_deliveries(subscription_id, lease_expires_at)
    where status = 'pending';

alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_notification_deliveries enable row level security;

revoke all on public.web_push_subscriptions from public, anon, authenticated;
revoke all on public.web_push_notification_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to service_role;
grant select, insert, update, delete on public.web_push_notification_deliveries to service_role;

create trigger web_push_subscriptions_set_updated_at
before update on public.web_push_subscriptions
for each row execute function private.set_updated_at();

create trigger web_push_deliveries_set_updated_at
before update on public.web_push_notification_deliveries
for each row execute function private.set_updated_at();

create or replace function private.seed_web_push_notification_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.web_push_notification_deliveries(notification_id, subscription_id)
    select new.id, subscriptions.id
    from public.web_push_subscriptions subscriptions
    where subscriptions.user_id = new.recipient_id
      and subscriptions.disabled_at is null
      and (subscriptions.expiration_time is null or subscriptions.expiration_time > now())
    on conflict (notification_id, subscription_id) do nothing;
    return new;
end;
$$;

create trigger seed_web_push_notification_deliveries
after insert on public.notifications
for each row execute function private.seed_web_push_notification_deliveries();

create or replace function private.invalidate_web_push_subscription_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    invalid_reason text;
begin
    if tg_op = 'DELETE' then
        invalid_reason := 'SUBSCRIPTION_REMOVED';
    elsif old.user_id is distinct from new.user_id then
        invalid_reason := 'SUBSCRIPTION_OWNER_CHANGED';
    elsif old.disabled_at is null and new.disabled_at is not null then
        invalid_reason := 'SUBSCRIPTION_DISABLED';
    elsif new.expiration_time is not null
          and new.expiration_time <= now()
          and (old.expiration_time is null or old.expiration_time > now()) then
        invalid_reason := 'SUBSCRIPTION_EXPIRED';
    else
        if tg_op = 'DELETE' then
            return old;
        end if;
        return new;
    end if;

    update public.web_push_notification_deliveries
    set status = 'invalid',
        lease_token = null,
        lease_expires_at = null,
        last_error_code = invalid_reason,
        last_error = null
    where subscription_id = old.id
      and status = 'pending';

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

create trigger invalidate_web_push_subscription_deliveries
before delete or update of user_id, disabled_at, expiration_time
on public.web_push_subscriptions
for each row execute function private.invalidate_web_push_subscription_deliveries();

create or replace function public.list_notifications_web(
    cursor_created_at_param timestamptz default null,
    cursor_id_param uuid default null,
    limit_param integer default 50
)
returns table(
    id uuid,
    type text,
    title text,
    message text,
    group_id uuid,
    related_id uuid,
    href text,
    is_read boolean,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if limit_param is null
       or limit_param not between 1 and 100
       or ((cursor_created_at_param is null) <> (cursor_id_param is null)) then
        raise exception 'Invalid notification query' using errcode = '22023';
    end if;

    return query
    select
        notifications.id,
        notifications.type,
        notifications.title,
        notifications.message,
        notifications.group_id,
        notifications.related_id,
        notifications.href,
        notifications.read_at is not null,
        notifications.created_at
    from public.notifications notifications
    where notifications.recipient_id = caller_id
      and (
          cursor_created_at_param is null
          or (notifications.created_at, notifications.id)
             < (cursor_created_at_param, cursor_id_param)
      )
    order by notifications.created_at desc, notifications.id desc
    limit limit_param + 1;
end;
$$;

create or replace function public.mark_notification_read_web(notification_id_param uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    owned_notification boolean;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if notification_id_param is null then
        raise exception 'Invalid notification identifier' using errcode = '22023';
    end if;

    update public.notifications
    set read_at = coalesce(read_at, now())
    where id = notification_id_param
      and recipient_id = caller_id
    returning true into owned_notification;

    return coalesce(owned_notification, false);
end;
$$;

create or replace function public.mark_all_notifications_read_web()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    affected_rows integer;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    update public.notifications
    set read_at = now()
    where recipient_id = caller_id
      and read_at is null;
    get diagnostics affected_rows = row_count;
    return affected_rows;
end;
$$;

create or replace function public.upsert_web_push_subscription(
    endpoint_param text,
    p256dh_param text,
    auth_param text,
    expiration_time_param timestamptz default null,
    user_agent_param text default null
)
returns table(
    id uuid,
    expiration_time timestamptz,
    user_agent text,
    created_at timestamptz,
    last_success_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    normalized_endpoint text := trim(endpoint_param);
    normalized_p256dh text := trim(p256dh_param);
    normalized_auth text := trim(auth_param);
    normalized_user_agent text := nullif(trim(user_agent_param), '');
    existing_subscription public.web_push_subscriptions%rowtype;
    saved_subscription public.web_push_subscriptions%rowtype;
    active_subscription_count integer;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if normalized_endpoint is null
       or normalized_p256dh is null
       or normalized_auth is null
       or char_length(normalized_endpoint) not between 20 and 2048
       or normalized_endpoint !~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+notify[.]windows[.]com)(:443)?(/[^[:space:]]*)?$'
       or char_length(normalized_p256dh) not between 43 and 256
       or normalized_p256dh !~ '^[A-Za-z0-9_-]+$'
       or char_length(normalized_auth) not between 16 and 128
       or normalized_auth !~ '^[A-Za-z0-9_-]+$'
       or normalized_user_agent is not null and char_length(normalized_user_agent) > 300
       or expiration_time_param is not null and expiration_time_param <= now() then
        raise exception 'Invalid Web Push subscription' using errcode = '22023';
    end if;

    -- Serialize each user's active-count check so concurrent endpoint inserts
    -- cannot bypass the browser/device amplification ceiling.
    perform pg_advisory_xact_lock(
        hashtextextended('web-push-user:' || caller_id::text, 11)
    );
    perform pg_advisory_xact_lock(hashtextextended(normalized_endpoint, 12));

    delete from public.web_push_subscriptions subscriptions
    where subscriptions.user_id = caller_id
      and (
          subscriptions.disabled_at is not null
          or subscriptions.expiration_time <= now()
      );

    select subscriptions.* into existing_subscription
    from public.web_push_subscriptions subscriptions
    where subscriptions.endpoint = normalized_endpoint
    for update;

    if found then
        if existing_subscription.user_id <> caller_id then
            if exists (
                select 1
                from public.web_push_notification_deliveries deliveries
                where deliveries.subscription_id = existing_subscription.id
                  and deliveries.status = 'pending'
                  and deliveries.lease_expires_at > now()
            ) then
                raise exception 'WEB_PUSH_ENDPOINT_BUSY' using errcode = '40001';
            end if;

            select count(*) into active_subscription_count
            from public.web_push_subscriptions subscriptions
            where subscriptions.user_id = caller_id
              and subscriptions.disabled_at is null
              and (subscriptions.expiration_time is null or subscriptions.expiration_time > now());
            if active_subscription_count >= 10 then
                raise exception 'WEB_PUSH_SUBSCRIPTION_LIMIT' using errcode = 'P0001';
            end if;

            update public.web_push_notification_deliveries
            set status = 'invalid',
                lease_token = null,
                lease_expires_at = null,
                last_error_code = 'SUBSCRIPTION_OWNER_CHANGED',
                last_error = null
            where subscription_id = existing_subscription.id
              and status = 'pending';
        end if;

        update public.web_push_subscriptions subscriptions
        set user_id = caller_id,
            p256dh = normalized_p256dh,
            auth = normalized_auth,
            expiration_time = expiration_time_param,
            user_agent = normalized_user_agent,
            disabled_at = null
        where subscriptions.id = existing_subscription.id
        returning subscriptions.* into saved_subscription;
    else
        select count(*) into active_subscription_count
        from public.web_push_subscriptions subscriptions
        where subscriptions.user_id = caller_id
          and subscriptions.disabled_at is null
          and (subscriptions.expiration_time is null or subscriptions.expiration_time > now());
        if active_subscription_count >= 10 then
            raise exception 'WEB_PUSH_SUBSCRIPTION_LIMIT' using errcode = 'P0001';
        end if;

        insert into public.web_push_subscriptions(
            user_id, endpoint, p256dh, auth, expiration_time, user_agent
        ) values (
            caller_id,
            normalized_endpoint,
            normalized_p256dh,
            normalized_auth,
            expiration_time_param,
            normalized_user_agent
        )
        returning * into saved_subscription;
    end if;

    id := saved_subscription.id;
    expiration_time := saved_subscription.expiration_time;
    user_agent := saved_subscription.user_agent;
    created_at := saved_subscription.created_at;
    last_success_at := saved_subscription.last_success_at;
    return next;
end;
$$;

create or replace function public.disable_web_push_subscription(subscription_id_param uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    owned_subscription boolean;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if subscription_id_param is null then
        raise exception 'Invalid Web Push subscription identifier' using errcode = '22023';
    end if;

    update public.web_push_subscriptions
    set disabled_at = coalesce(disabled_at, now())
    where id = subscription_id_param
      and user_id = caller_id
    returning true into owned_subscription;

    return coalesce(owned_subscription, false);
end;
$$;

create or replace function public.claim_web_push_deliveries(
    limit_param integer,
    lease_token_param uuid,
    lease_seconds_param integer,
    notification_id_param uuid default null
)
returns table(
    delivery_id uuid,
    notification_id uuid,
    endpoint text,
    p256dh text,
    auth text,
    type text,
    title text,
    message text,
    href text,
    created_at timestamptz,
    attempt_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    if lease_token_param is null
       or limit_param is null
       or lease_seconds_param is null
       or limit_param not between 1 and 100
       or lease_seconds_param not between 30 and 300 then
        raise exception 'Invalid Web Push delivery claim' using errcode = '22023';
    end if;

    update public.web_push_notification_deliveries deliveries
    set status = 'invalid',
        lease_token = null,
        lease_expires_at = null,
        last_error_code = 'SUBSCRIPTION_REMOVED',
        last_error = null
    where deliveries.status = 'pending'
      and (deliveries.lease_expires_at is null or deliveries.lease_expires_at <= now())
      and not exists (
          select 1
          from public.web_push_subscriptions subscriptions
          where subscriptions.id = deliveries.subscription_id
      );

    update public.web_push_notification_deliveries deliveries
    set status = 'invalid',
        lease_token = null,
        lease_expires_at = null,
        last_error_code = 'SUBSCRIPTION_DISABLED',
        last_error = null
    from public.web_push_subscriptions subscriptions
    where subscriptions.id = deliveries.subscription_id
      and deliveries.status = 'pending'
      and (deliveries.lease_expires_at is null or deliveries.lease_expires_at <= now())
      and subscriptions.disabled_at is not null;

    update public.web_push_notification_deliveries deliveries
    set status = 'invalid',
        lease_token = null,
        lease_expires_at = null,
        last_error_code = 'SUBSCRIPTION_EXPIRED',
        last_error = null
    from public.web_push_subscriptions subscriptions
    where subscriptions.id = deliveries.subscription_id
      and deliveries.status = 'pending'
      and (deliveries.lease_expires_at is null or deliveries.lease_expires_at <= now())
      and subscriptions.disabled_at is null
      and subscriptions.expiration_time is not null
      and subscriptions.expiration_time <= now();

    update public.web_push_notification_deliveries deliveries
    set status = 'invalid',
        lease_token = null,
        lease_expires_at = null,
        last_error_code = 'SUBSCRIPTION_OWNER_CHANGED',
        last_error = null
    from public.notifications notifications,
         public.web_push_subscriptions subscriptions
    where notifications.id = deliveries.notification_id
      and subscriptions.id = deliveries.subscription_id
      and deliveries.status = 'pending'
      and (deliveries.lease_expires_at is null or deliveries.lease_expires_at <= now())
      and subscriptions.disabled_at is null
      and (subscriptions.expiration_time is null or subscriptions.expiration_time > now())
      and subscriptions.user_id <> notifications.recipient_id;

    -- Count an attempt when work is leased, not when completion arrives. A
    -- timed-out worker may already have sent the push and never call complete;
    -- reclaiming that lease must still consume the retry budget.
    update public.web_push_notification_deliveries deliveries
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        last_error_code = 'PUSH_RETRY_EXHAUSTED',
        last_error = null
    where deliveries.status = 'pending'
      and deliveries.attempt_count >= 8
      and (deliveries.lease_expires_at is null or deliveries.lease_expires_at <= now());

    return query
    with candidates as (
        select deliveries.id
        from public.web_push_notification_deliveries deliveries
        join public.notifications notifications
          on notifications.id = deliveries.notification_id
        join public.web_push_subscriptions subscriptions
          on subscriptions.id = deliveries.subscription_id
         and subscriptions.user_id = notifications.recipient_id
        where deliveries.status = 'pending'
          and (notification_id_param is null or deliveries.notification_id = notification_id_param)
          and deliveries.attempt_count < 8
          and deliveries.next_attempt_at <= now()
          and (deliveries.lease_expires_at is null or deliveries.lease_expires_at <= now())
          and subscriptions.disabled_at is null
          and (subscriptions.expiration_time is null or subscriptions.expiration_time > now())
        order by deliveries.next_attempt_at, deliveries.created_at, deliveries.id
        -- Subscription first, then delivery update below. Every lifecycle
        -- path uses this order, preventing disable/410 completion deadlocks.
        for update of subscriptions skip locked
        limit limit_param
    ), claimed as (
        update public.web_push_notification_deliveries deliveries
        set attempt_count = deliveries.attempt_count + 1,
            lease_token = lease_token_param,
            lease_expires_at = now() + make_interval(secs => lease_seconds_param)
        from candidates
        where deliveries.id = candidates.id
        returning deliveries.*
    )
    select
        claimed.id,
        notifications.id,
        subscriptions.endpoint,
        subscriptions.p256dh,
        subscriptions.auth,
        notifications.type,
        notifications.title,
        notifications.message,
        notifications.href,
        notifications.created_at,
        claimed.attempt_count
    from claimed
    join public.notifications notifications
      on notifications.id = claimed.notification_id
    join public.web_push_subscriptions subscriptions
      on subscriptions.id = claimed.subscription_id
     and subscriptions.user_id = notifications.recipient_id
    order by claimed.next_attempt_at, claimed.created_at, claimed.id;
end;
$$;

create or replace function public.complete_web_push_delivery(
    delivery_id_param uuid,
    lease_token_param uuid,
    outcome_param text,
    error_code_param text,
    error_param text,
    retry_after_seconds_param integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    delivery_record public.web_push_notification_deliveries%rowtype;
    subscription_id_value uuid;
    recipient_id_value uuid;
    subscription_user_id uuid;
begin
    if delivery_id_param is null or lease_token_param is null or outcome_param is null
       or outcome_param not in ('sent', 'invalid', 'retry', 'failed')
       or (error_code_param is not null and char_length(trim(error_code_param)) not between 1 and 100)
       or (error_param is not null and char_length(trim(error_param)) not between 1 and 500)
       or (outcome_param = 'retry'
           and (retry_after_seconds_param is null or retry_after_seconds_param not between 1 and 86400))
       or (outcome_param <> 'retry' and retry_after_seconds_param is not null) then
        raise exception 'Invalid Web Push delivery completion' using errcode = '22023';
    end if;

    select deliveries.subscription_id
    into subscription_id_value
    from public.web_push_notification_deliveries deliveries
    where deliveries.id = delivery_id_param;
    if not found then return false; end if;

    -- Lifecycle order is subscription, then delivery. Disable, ownership
    -- transfer, claims, and completion all follow this order.
    if subscription_id_value is not null then
        select subscriptions.user_id
        into subscription_user_id
        from public.web_push_subscriptions subscriptions
        where subscriptions.id = subscription_id_value
        for update;
    end if;

    select deliveries.* into delivery_record
    from public.web_push_notification_deliveries deliveries
    where deliveries.id = delivery_id_param
    for update;

    if not found
       or delivery_record.status <> 'pending'
       or delivery_record.lease_token is distinct from lease_token_param then
        return false;
    end if;

    select notifications.recipient_id
    into recipient_id_value
    from public.notifications notifications
    where notifications.id = delivery_record.notification_id;

    if subscription_user_id is null or subscription_user_id <> recipient_id_value then
        update public.web_push_notification_deliveries
        set status = 'invalid',
            lease_token = null,
            lease_expires_at = null,
            last_error_code = 'SUBSCRIPTION_OWNER_CHANGED',
            last_error = null
        where id = delivery_id_param;
        return false;
    end if;

    if outcome_param = 'sent' then
        update public.web_push_notification_deliveries
        set status = 'sent',
            lease_token = null,
            lease_expires_at = null,
            last_error_code = null,
            last_error = null,
            sent_at = now()
        where id = delivery_id_param;
        update public.web_push_subscriptions
        set last_success_at = now()
        where id = delivery_record.subscription_id
          and user_id = recipient_id_value;
    elsif outcome_param = 'invalid' then
        update public.web_push_notification_deliveries
        set status = 'invalid',
            lease_token = null,
            lease_expires_at = null,
            last_error_code = coalesce(nullif(trim(error_code_param), ''), 'SUBSCRIPTION_INVALID'),
            last_error = nullif(trim(error_param), '')
        where id = delivery_id_param;
        update public.web_push_subscriptions
        set disabled_at = coalesce(disabled_at, now())
        where id = delivery_record.subscription_id
          and user_id = recipient_id_value;
    elsif outcome_param = 'retry' then
        update public.web_push_notification_deliveries
        set next_attempt_at = now() + make_interval(secs => retry_after_seconds_param),
            lease_token = null,
            lease_expires_at = null,
            last_error_code = coalesce(nullif(trim(error_code_param), ''), 'TRANSIENT_PUSH_FAILURE'),
            last_error = nullif(trim(error_param), '')
        where id = delivery_id_param;
    else
        update public.web_push_notification_deliveries
        set status = 'failed',
            lease_token = null,
            lease_expires_at = null,
            last_error_code = coalesce(nullif(trim(error_code_param), ''), 'PUSH_RETRY_EXHAUSTED'),
            last_error = nullif(trim(error_param), '')
        where id = delivery_id_param;
    end if;

    return true;
end;
$$;

revoke all on function private.seed_web_push_notification_deliveries() from public, anon, authenticated;
revoke all on function private.invalidate_web_push_subscription_deliveries() from public, anon, authenticated;
revoke all on function private.enqueue_notification(uuid, text, text, text, uuid, uuid, text, jsonb) from public, anon, authenticated;

revoke all on function public.list_notifications_web(timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_notification_read_web(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read_web() from public, anon, authenticated;
revoke all on function public.upsert_web_push_subscription(text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.disable_web_push_subscription(uuid) from public, anon, authenticated;
revoke all on function public.claim_web_push_deliveries(integer, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_web_push_delivery(uuid, uuid, text, text, text, integer) from public, anon, authenticated;

grant execute on function public.list_notifications_web(timestamptz, uuid, integer) to authenticated;
grant execute on function public.mark_notification_read_web(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read_web() to authenticated;
grant execute on function public.upsert_web_push_subscription(text, text, text, timestamptz, text) to authenticated;
grant execute on function public.disable_web_push_subscription(uuid) to authenticated;
grant execute on function public.claim_web_push_deliveries(integer, uuid, integer, uuid) to service_role;
grant execute on function public.complete_web_push_delivery(uuid, uuid, text, text, text, integer) to service_role;
