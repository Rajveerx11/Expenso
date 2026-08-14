-- Settlement confirmation hardening and auditable allocation. Depends on the
-- Expenso v1 foundation introduced by issue #1.

alter table public.expense_splits
add column settled_amount numeric(12, 2) not null default 0
check (settled_amount >= 0 and settled_amount <= owed_amount);

update public.expense_splits
set settled_amount = owed_amount
where is_settled;

-- Serialize every mutation that can change a pair balance with proposal and
-- confirmation RPCs. The trigger also covers the foundation expense RPCs.
create or replace function private.lock_settlement_balance_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    affected_group_id uuid;
begin
    affected_group_id := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
    perform pg_advisory_xact_lock(hashtextextended(affected_group_id::text, 1));
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

create trigger lock_group_expense_settlement_balance
before insert or update or delete on public.group_expenses
for each row execute function private.lock_settlement_balance_mutation();

revoke all on function private.lock_settlement_balance_mutation() from public;

-- Backfill prior confirmed settlement history oldest-first. An inconsistent
-- deployment fails loudly instead of silently exposing paid splits as unpaid.
do $$
declare
    historical_settlement public.settlements%rowtype;
    historical_split record;
    remaining_amount numeric(12, 2);
    applied_amount numeric(12, 2);
begin
    for historical_settlement in
        select * from public.settlements
        where status = 'confirmed'
        order by coalesce(confirmed_at, created_at), created_at, id
    loop
        remaining_amount := historical_settlement.amount;
        for historical_split in
            select es.id, es.owed_amount, es.settled_amount
            from public.expense_splits es
            join public.group_expenses ge on ge.id = es.expense_id
            where ge.group_id = historical_settlement.group_id
              and ge.paid_by = historical_settlement.receiver_id
              and es.user_id = historical_settlement.payer_id
              and es.settled_amount < es.owed_amount
            order by ge.expense_date, ge.created_at, es.id
            for update of es
        loop
            exit when remaining_amount <= 0;
            applied_amount := least(
                remaining_amount,
                historical_split.owed_amount - historical_split.settled_amount
            );
            update public.expense_splits
            set settled_amount = settled_amount + applied_amount,
                is_settled = settled_amount + applied_amount >= owed_amount,
                settled_at = case
                    when settled_amount + applied_amount >= owed_amount then coalesce(historical_settlement.confirmed_at, historical_settlement.created_at)
                    else null
                end
            where id = historical_split.id;
            remaining_amount := remaining_amount - applied_amount;
        end loop;
        if remaining_amount >= 0.01 then
            raise exception 'Cannot backfill confirmed settlement %; repair inconsistent history first', historical_settlement.id;
        end if;
    end loop;
end;
$$;

create or replace function public.create_settlement(
    group_id_param uuid,
    receiver_id_param uuid,
    amount_param numeric,
    transaction_ref_param text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    amount_rounded numeric(12, 2) := round(amount_param, 2);
    current_balance numeric;
    settlement_id_value uuid;
begin
    if caller_id is null or receiver_id_param = caller_id or amount_rounded <= 0
       or not private.is_group_member(group_id_param, caller_id)
       or not private.is_group_member(group_id_param, receiver_id_param) then
        raise exception 'Invalid settlement participants or amount' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1));
    select balance into current_balance
    from public.get_group_balances(group_id_param)
    where user_id = receiver_id_param;
    if current_balance is null or current_balance >= 0 or amount_rounded > -current_balance then
        raise exception 'Settlement exceeds the outstanding debt' using errcode = '22023';
    end if;
    if exists (
        select 1 from public.settlements
        where group_id = group_id_param and payer_id = caller_id
          and receiver_id = receiver_id_param and status = 'pending_confirmation'
    ) then
        raise exception 'A settlement for this balance is already pending';
    end if;

    insert into public.settlements(group_id, payer_id, receiver_id, amount, transaction_ref)
    values (group_id_param, caller_id, receiver_id_param, amount_rounded, nullif(trim(transaction_ref_param), ''))
    returning id into settlement_id_value;
    insert into public.payment_confirmations(settlement_id, sender_id, receiver_id, amount)
    values (settlement_id_value, caller_id, receiver_id_param, amount_rounded);
    return settlement_id_value;
end;
$$;

create or replace function public.confirm_settlement(settlement_id_param uuid, user_id_param uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    settlement_record public.settlements%rowtype;
    split_record record;
    current_balance numeric;
    remaining_amount numeric(12, 2);
    applied_amount numeric(12, 2);
begin
    select * into settlement_record
    from public.settlements where id = settlement_id_param;
    if not found then return false; end if;

    perform pg_advisory_xact_lock(hashtextextended(settlement_record.group_id::text, 1));
    select * into settlement_record
    from public.settlements where id = settlement_id_param for update;

    if user_id_param is distinct from (select auth.uid())
       or settlement_record.receiver_id <> user_id_param then
        raise exception 'Only the receiver can confirm this settlement' using errcode = '42501';
    end if;
    if settlement_record.status = 'confirmed' then return true; end if;
    if settlement_record.status <> 'pending_confirmation' then
        raise exception 'Settlement is no longer pending' using errcode = '22023';
    end if;

    -- Authenticated caller is the receiver here, so the payer row must show a
    -- positive amount still owed to the caller at confirmation time.
    select balance into current_balance
    from public.get_group_balances(settlement_record.group_id)
    where user_id = settlement_record.payer_id;
    if current_balance is null or current_balance <= 0
       or settlement_record.amount > current_balance then
        raise exception 'Outstanding balance changed; reject and create a new settlement' using errcode = '22023';
    end if;

    remaining_amount := settlement_record.amount;
    for split_record in
        select es.id, es.owed_amount, es.settled_amount
        from public.expense_splits es
        join public.group_expenses ge on ge.id = es.expense_id
        where ge.group_id = settlement_record.group_id
          and ge.paid_by = settlement_record.receiver_id
          and es.user_id = settlement_record.payer_id
          and es.settled_amount < es.owed_amount
        order by ge.expense_date, ge.created_at, es.id
        for update of es
    loop
        exit when remaining_amount <= 0;
        applied_amount := least(remaining_amount, split_record.owed_amount - split_record.settled_amount);
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
        raise exception 'Settlement could not be allocated to outstanding splits';
    end if;

    update public.settlements
    set status = 'confirmed', confirmed_at = now()
    where id = settlement_id_param;
    update public.payment_confirmations
    set status = 'confirmed', responded_at = now()
    where settlement_id = settlement_id_param and status = 'pending';
    return true;
end;
$$;

create or replace function public.reject_settlement(settlement_id_param uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    settlement_record public.settlements%rowtype;
begin
    select * into settlement_record
    from public.settlements where id = settlement_id_param;
    if not found then return false; end if;
    perform pg_advisory_xact_lock(hashtextextended(settlement_record.group_id::text, 1));
    select * into settlement_record
    from public.settlements where id = settlement_id_param for update;

    if settlement_record.receiver_id <> (select auth.uid()) then
        raise exception 'Only the receiver can reject this settlement' using errcode = '42501';
    end if;
    if settlement_record.status = 'rejected' then return true; end if;
    if settlement_record.status <> 'pending_confirmation' then
        raise exception 'Settlement is no longer pending' using errcode = '22023';
    end if;
    update public.settlements set status = 'rejected' where id = settlement_id_param;
    update public.payment_confirmations set status = 'rejected', responded_at = now()
    where settlement_id = settlement_id_param and status = 'pending';
    return true;
end;
$$;

revoke all on function public.create_settlement(uuid, uuid, numeric, text) from public;
revoke all on function public.confirm_settlement(uuid, uuid) from public;
revoke all on function public.reject_settlement(uuid) from public;
grant execute on function public.create_settlement(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.confirm_settlement(uuid, uuid) to authenticated;
grant execute on function public.reject_settlement(uuid) to authenticated;
