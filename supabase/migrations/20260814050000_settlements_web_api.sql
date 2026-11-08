-- Browser settlement API. Keeps settlement state changes inside one database
-- transaction, derives every actor from auth.uid(), and exposes no confirmation
-- secret through the Data API.

create or replace function private.get_pair_balance(
    group_id_param uuid,
    perspective_user_id_param uuid,
    other_user_id_param uuid
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
    select round(
        coalesce((
            select sum(splits.owed_amount)
            from public.group_expenses expenses
            join public.expense_splits splits on splits.expense_id = expenses.id
            where expenses.group_id = group_id_param
              and expenses.paid_by = perspective_user_id_param
              and splits.user_id = other_user_id_param
        ), 0)
        - coalesce((
            select sum(splits.owed_amount)
            from public.group_expenses expenses
            join public.expense_splits splits on splits.expense_id = expenses.id
            where expenses.group_id = group_id_param
              and expenses.paid_by = other_user_id_param
              and splits.user_id = perspective_user_id_param
        ), 0)
        - coalesce((
            select sum(settlements.amount)
            from public.settlements
            where settlements.group_id = group_id_param
              and settlements.payer_id = other_user_id_param
              and settlements.receiver_id = perspective_user_id_param
              and settlements.status = 'confirmed'
        ), 0)
        + coalesce((
            select sum(settlements.amount)
            from public.settlements
            where settlements.group_id = group_id_param
              and settlements.payer_id = perspective_user_id_param
              and settlements.receiver_id = other_user_id_param
              and settlements.status = 'confirmed'
        ), 0),
        2
    );
$$;

revoke all on function private.get_pair_balance(uuid, uuid, uuid)
from public, anon, authenticated;

alter table public.settlements
    add column outstanding_amount_at_creation numeric(12, 2);

-- Historical terminal records do not use the snapshot. Existing pending rows
-- receive the current balance, which safely forces a changed-balance rejection
-- when their claim already exceeds it.
update public.settlements settlements
set outstanding_amount_at_creation = case
    when settlements.status = 'pending_confirmation' then greatest(
        0,
        -private.get_pair_balance(
            settlements.group_id,
            settlements.payer_id,
            settlements.receiver_id
        )
    )
    else settlements.amount
end;

alter table public.settlements
    alter column outstanding_amount_at_creation set default 0,
    alter column outstanding_amount_at_creation set not null,
    add constraint settlements_outstanding_snapshot_check
        check (outstanding_amount_at_creation >= 0),
    add constraint settlements_confirmed_timestamp_state_check
        check ((status = 'confirmed') = (confirmed_at is not null)),
    add constraint settlements_transaction_ref_length_check
        check (transaction_ref is null or char_length(transaction_ref) <= 200) not valid;

-- Normalize old audit timestamps before enforcing the terminal-state invariant.
insert into public.payment_confirmations(
    settlement_id,
    sender_id,
    receiver_id,
    amount,
    status,
    responded_at
)
select
    settlements.id,
    settlements.payer_id,
    settlements.receiver_id,
    settlements.amount,
    case settlements.status
        when 'pending_confirmation' then 'pending'
        else settlements.status
    end,
    case
        when settlements.status = 'pending_confirmation' then null
        else coalesce(settlements.confirmed_at, settlements.created_at)
    end
from public.settlements settlements
where not exists (
    select 1
    from public.payment_confirmations confirmations
    where confirmations.settlement_id = settlements.id
);

update public.payment_confirmations confirmations
set status = case settlements.status
        when 'pending_confirmation' then 'pending'
        else settlements.status
    end,
    responded_at = case
        when settlements.status = 'pending_confirmation' then null
        else coalesce(
            confirmations.responded_at,
            settlements.confirmed_at,
            settlements.created_at
        )
    end
from public.settlements settlements
where settlements.id = confirmations.settlement_id;

alter table public.payment_confirmations
    add constraint payment_confirmations_response_state_check
        check ((status = 'pending') = (responded_at is null));

create index settlements_payer_group_created_idx
    on public.settlements(payer_id, group_id, created_at desc, id desc);
create index settlements_receiver_group_created_idx
    on public.settlements(receiver_id, group_id, created_at desc, id desc);

create or replace function private.settlement_web_json(
    settlement_id_param uuid,
    caller_id_param uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'id', settlements.id,
        'groupId', settlements.group_id,
        'payerId', settlements.payer_id,
        'payerName', payer.full_name,
        'receiverId', settlements.receiver_id,
        'receiverName', receiver.full_name,
        'amount', to_char(settlements.amount, 'FM9999999990.00'),
        'status', settlements.status,
        'transactionRef', settlements.transaction_ref,
        'createdAt', settlements.created_at,
        'confirmedAt', settlements.confirmed_at,
        'canRespond',
            settlements.status = 'pending_confirmation'
            and settlements.receiver_id = caller_id_param
    )
    from public.settlements settlements
    join public.profiles payer on payer.id = settlements.payer_id
    join public.profiles receiver on receiver.id = settlements.receiver_id
    where settlements.id = settlement_id_param;
$$;

revoke all on function private.settlement_web_json(uuid, uuid)
from public, anon, authenticated;

create or replace function public.list_group_settlements_web(
    group_id_param uuid,
    cursor_created_at_param timestamptz default null,
    cursor_id_param uuid default null,
    limit_param integer default 30
)
returns table(
    id uuid,
    group_id uuid,
    payer_id uuid,
    payer_name text,
    receiver_id uuid,
    receiver_name text,
    amount numeric,
    status text,
    transaction_ref text,
    created_at timestamptz,
    confirmed_at timestamptz,
    can_respond boolean
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
    if group_id_param is null
       or limit_param is null or limit_param not between 1 and 100
       or ((cursor_created_at_param is null) <> (cursor_id_param is null)) then
        raise exception 'Invalid settlement list input' using errcode = '22023';
    end if;

    return query
    with involved as (
        select settlements.*
        from public.settlements
        where settlements.payer_id = caller_id
          and settlements.group_id = group_id_param
          and (
              cursor_created_at_param is null
              or (settlements.created_at, settlements.id)
                 < (cursor_created_at_param, cursor_id_param)
          )
        union all
        select settlements.*
        from public.settlements
        where settlements.receiver_id = caller_id
          and settlements.group_id = group_id_param
          and (
              cursor_created_at_param is null
              or (settlements.created_at, settlements.id)
                 < (cursor_created_at_param, cursor_id_param)
          )
    )
    select
        involved.id,
        involved.group_id,
        involved.payer_id,
        payer.full_name,
        involved.receiver_id,
        receiver.full_name,
        involved.amount,
        involved.status,
        involved.transaction_ref,
        involved.created_at,
        involved.confirmed_at,
        involved.status = 'pending_confirmation' and involved.receiver_id = caller_id
    from involved
    join public.profiles payer on payer.id = involved.payer_id
    join public.profiles receiver on receiver.id = involved.receiver_id
    order by involved.created_at desc, involved.id desc
    limit limit_param + 1;
end;
$$;

create or replace function public.get_group_settlement_web(
    group_id_param uuid,
    settlement_id_param uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    response_value jsonb;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    select private.settlement_web_json(settlements.id, caller_id)
    into response_value
    from public.settlements
    where settlements.group_id = group_id_param
      and settlements.id = settlement_id_param
      and caller_id in (settlements.payer_id, settlements.receiver_id);

    return response_value;
end;
$$;

create or replace function public.create_group_settlement_web(
    group_id_param uuid,
    receiver_id_param uuid,
    amount_param numeric,
    transaction_ref_param text,
    idempotency_key_param text
)
returns table(response jsonb, replayed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    normalized_transaction_ref text := nullif(trim(transaction_ref_param), '');
    computed_request_hash text;
    stored_record private.api_idempotency_keys%rowtype;
    current_balance numeric;
    outstanding_amount numeric(12, 2);
    settlement_id_value uuid;
    response_value jsonb;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if group_id_param is null or receiver_id_param is null
       or receiver_id_param = caller_id
       or amount_param is null or amount_param <= 0
       or amount_param > 9999999999.99
       or amount_param <> round(amount_param, 2)
       or normalized_transaction_ref is not null
          and char_length(normalized_transaction_ref) > 200 then
        raise exception 'Invalid settlement input' using errcode = '22023';
    end if;
    if idempotency_key_param is null
       or idempotency_key_param !~ '^[A-Za-z0-9._:-]{16,128}$' then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
    end if;

    computed_request_hash := encode(extensions.digest(
        jsonb_build_object(
            'group_id', group_id_param,
            'receiver_id', receiver_id_param,
            'amount', to_char(amount_param, 'FM9999999990.00'),
            'transaction_ref', normalized_transaction_ref
        )::text,
        'sha256'
    ), 'hex');

    -- Global group mutation order: membership lock, membership validation,
    -- balance lock, then request-specific idempotency lock.
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_member(group_id_param, caller_id)
       or not private.is_group_member(group_id_param, receiver_id_param) then
        raise exception 'Invalid settlement participants or amount' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1));
    perform pg_advisory_xact_lock(hashtextextended(
        caller_id::text || ':settlement:create:' || idempotency_key_param,
        0
    ));

    delete from private.api_idempotency_keys where expires_at <= now();
    select * into stored_record
    from private.api_idempotency_keys
    where user_id = caller_id
      and scope = 'settlement:create'
      and idempotency_key = idempotency_key_param;
    if found then
        if stored_record.request_hash <> computed_request_hash then
            raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
        end if;
        response := stored_record.response;
        replayed := true;
        return next;
        return;
    end if;

    current_balance := private.get_pair_balance(
        group_id_param,
        caller_id,
        receiver_id_param
    );
    outstanding_amount := -current_balance;
    if current_balance is null or current_balance >= 0
       or amount_param > outstanding_amount then
        raise exception 'SETTLEMENT_EXCEEDS_BALANCE' using errcode = '22023';
    end if;
    if exists (
        select 1
        from public.settlements
        where group_id = group_id_param
          and payer_id = caller_id
          and receiver_id = receiver_id_param
          and status = 'pending_confirmation'
    ) then
        raise exception 'PENDING_SETTLEMENT_EXISTS' using errcode = '22023';
    end if;

    insert into public.settlements(
        group_id,
        payer_id,
        receiver_id,
        amount,
        transaction_ref,
        outstanding_amount_at_creation
    ) values (
        group_id_param,
        caller_id,
        receiver_id_param,
        amount_param,
        normalized_transaction_ref,
        outstanding_amount
    ) returning id into settlement_id_value;

    insert into public.payment_confirmations(
        settlement_id,
        sender_id,
        receiver_id,
        amount
    ) values (
        settlement_id_value,
        caller_id,
        receiver_id_param,
        amount_param
    );

    response_value := private.settlement_web_json(settlement_id_value, caller_id);
    insert into private.api_idempotency_keys(
        user_id,
        scope,
        idempotency_key,
        request_hash,
        response,
        status_code
    ) values (
        caller_id,
        'settlement:create',
        idempotency_key_param,
        computed_request_hash,
        response_value,
        201
    );

    response := response_value;
    replayed := false;
    return next;
end;
$$;

create or replace function public.confirm_group_settlement_web(
    group_id_param uuid,
    settlement_id_param uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    settlement_record public.settlements%rowtype;
    split_record record;
    current_outstanding numeric(12, 2);
    remaining_amount numeric(12, 2);
    applied_amount numeric(12, 2);
    affected_rows integer;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    select * into settlement_record
    from public.settlements
    where id = settlement_id_param and group_id = group_id_param;
    if not found then return null; end if;

    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1));
    select * into settlement_record
    from public.settlements
    where id = settlement_id_param and group_id = group_id_param
    for update;
    if not found then return null; end if;

    if settlement_record.receiver_id <> caller_id then
        raise exception 'Only the receiver can respond to this settlement' using errcode = '42501';
    end if;
    if settlement_record.status <> 'pending_confirmation' then
        return private.settlement_web_json(settlement_record.id, caller_id);
    end if;

    current_outstanding := -private.get_pair_balance(
        settlement_record.group_id,
        settlement_record.payer_id,
        settlement_record.receiver_id
    );
    if current_outstanding <> settlement_record.outstanding_amount_at_creation
       or current_outstanding < settlement_record.amount then
        raise exception 'SETTLEMENT_CHANGED' using errcode = '22023';
    end if;

    remaining_amount := settlement_record.amount;
    for split_record in
        select splits.id, splits.owed_amount, splits.settled_amount
        from public.expense_splits splits
        join public.group_expenses expenses on expenses.id = splits.expense_id
        where expenses.group_id = settlement_record.group_id
          and expenses.paid_by = settlement_record.receiver_id
          and splits.user_id = settlement_record.payer_id
          and splits.settled_amount < splits.owed_amount
        order by expenses.expense_date, expenses.created_at, splits.id
        for update of splits
    loop
        exit when remaining_amount <= 0;
        applied_amount := least(
            remaining_amount,
            split_record.owed_amount - split_record.settled_amount
        );
        update public.expense_splits
        set settled_amount = settled_amount + applied_amount,
            is_settled = settled_amount + applied_amount >= owed_amount,
            settled_at = case
                when settled_amount + applied_amount >= owed_amount then now()
                else null
            end
        where id = split_record.id;
        remaining_amount := remaining_amount - applied_amount;
    end loop;
    if remaining_amount >= 0.01 then
        raise exception 'SETTLEMENT_CHANGED' using errcode = '22023';
    end if;

    update public.settlements
    set status = 'confirmed', confirmed_at = now()
    where id = settlement_record.id;
    update public.payment_confirmations
    set status = 'confirmed', responded_at = now()
    where settlement_id = settlement_record.id and status = 'pending';
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
        raise exception 'Settlement confirmation audit is inconsistent';
    end if;

    return private.settlement_web_json(settlement_record.id, caller_id);
end;
$$;

create or replace function public.reject_group_settlement_web(
    group_id_param uuid,
    settlement_id_param uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    settlement_record public.settlements%rowtype;
    affected_rows integer;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    select * into settlement_record
    from public.settlements
    where id = settlement_id_param and group_id = group_id_param;
    if not found then return null; end if;

    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1));
    select * into settlement_record
    from public.settlements
    where id = settlement_id_param and group_id = group_id_param
    for update;
    if not found then return null; end if;

    if settlement_record.receiver_id <> caller_id then
        raise exception 'Only the receiver can respond to this settlement' using errcode = '42501';
    end if;
    if settlement_record.status <> 'pending_confirmation' then
        return private.settlement_web_json(settlement_record.id, caller_id);
    end if;

    update public.settlements
    set status = 'rejected'
    where id = settlement_record.id;
    update public.payment_confirmations
    set status = 'rejected', responded_at = now()
    where settlement_id = settlement_record.id and status = 'pending';
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
        raise exception 'Settlement confirmation audit is inconsistent';
    end if;

    return private.settlement_web_json(settlement_record.id, caller_id);
end;
$$;

-- Settlement tables contain internal audit data and a confirmation token.
-- Browser reads are limited to curated RPC projections.
revoke select on public.settlements from anon, authenticated;
revoke select on public.payment_confirmations from anon, authenticated;

revoke all on function public.create_settlement(uuid, uuid, numeric, text)
from public, anon, authenticated;
revoke all on function public.confirm_settlement(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.reject_settlement(uuid)
from public, anon, authenticated;

revoke all on function public.list_group_settlements_web(uuid, timestamptz, uuid, integer)
from public, anon, authenticated;
revoke all on function public.get_group_settlement_web(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.create_group_settlement_web(uuid, uuid, numeric, text, text)
from public, anon, authenticated;
revoke all on function public.confirm_group_settlement_web(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.reject_group_settlement_web(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.list_group_settlements_web(uuid, timestamptz, uuid, integer)
to authenticated;
grant execute on function public.get_group_settlement_web(uuid, uuid)
to authenticated;
grant execute on function public.create_group_settlement_web(uuid, uuid, numeric, text, text)
to authenticated;
grant execute on function public.confirm_group_settlement_web(uuid, uuid)
to authenticated;
grant execute on function public.reject_group_settlement_web(uuid, uuid)
to authenticated;
