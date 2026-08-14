-- Shared-expense commands and read models for the same-origin web API.

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (recipient_id = (select auth.uid()));

create index if not exists group_expenses_feed_idx
    on public.group_expenses(group_id, expense_date desc, created_at desc, id desc);
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'group_expenses_category_allowed'
          and conrelid = 'public.group_expenses'::regclass
    ) then
        alter table public.group_expenses
            add constraint group_expenses_category_allowed
            check (category in (
                'Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health',
                'Education', 'Travel', 'Groceries', 'Rent', 'Salary', 'Freelance', 'Other'
            )) not valid;
    end if;
end;
$$;

create or replace function public.list_group_expenses_web(
    group_id_param uuid,
    cursor_expense_date_param date default null,
    cursor_created_at_param timestamptz default null,
    cursor_id_param uuid default null,
    limit_param integer default 30
)
returns table(
    id uuid,
    group_id uuid,
    paid_by uuid,
    paid_by_name text,
    title text,
    total_amount numeric,
    category text,
    split_type text,
    note text,
    expense_date date,
    created_at timestamptz,
    updated_at timestamptz,
    can_delete boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
    if caller_id is null or not private.is_group_member(group_id_param, caller_id) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;
    if limit_param not between 1 and 100
       or (cursor_expense_date_param is null) <> (cursor_created_at_param is null)
       or (cursor_created_at_param is null) <> (cursor_id_param is null) then
        raise exception 'Invalid group expense query' using errcode = '22023';
    end if;

    return query
    select
        expenses.id,
        expenses.group_id,
        expenses.paid_by,
        payer.full_name,
        expenses.title,
        expenses.total_amount,
        expenses.category,
        expenses.split_type,
        expenses.note,
        expenses.expense_date,
        expenses.created_at,
        expenses.updated_at,
        (expenses.paid_by = caller_id or private.is_group_admin(group_id_param, caller_id))
        and not exists (
            select 1 from public.expense_splits settled_splits
            where settled_splits.expense_id = expenses.id and settled_splits.settled_amount > 0
        )
        and not exists (
            select 1 from public.settlements pending_settlements
            where pending_settlements.group_id = group_id_param
              and pending_settlements.status = 'pending_confirmation'
        )
    from public.group_expenses expenses
    join public.profiles payer on payer.id = expenses.paid_by
    where expenses.group_id = group_id_param
      and (
        cursor_expense_date_param is null
        or (expenses.expense_date, expenses.created_at, expenses.id)
           < (cursor_expense_date_param, cursor_created_at_param, cursor_id_param)
      )
    order by expenses.expense_date desc, expenses.created_at desc, expenses.id desc
    limit limit_param + 1;
end;
$$;

create or replace function public.get_group_expense_web(
    group_id_param uuid,
    expense_id_param uuid
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
    if caller_id is null or not private.is_group_member(group_id_param, caller_id) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'expense', jsonb_build_object(
            'id', expenses.id,
            'groupId', expenses.group_id,
            'paidBy', expenses.paid_by,
            'paidByName', payer.full_name,
            'title', expenses.title,
            'totalAmount', expenses.total_amount,
            'category', expenses.category,
            'splitType', expenses.split_type,
            'note', expenses.note,
            'expenseDate', expenses.expense_date,
            'createdAt', expenses.created_at,
            'updatedAt', expenses.updated_at,
            'canDelete',
                (expenses.paid_by = caller_id or private.is_group_admin(group_id_param, caller_id))
                and not exists (
                    select 1 from public.expense_splits settled_splits
                    where settled_splits.expense_id = expenses.id and settled_splits.settled_amount > 0
                )
                and not exists (
                    select 1 from public.settlements pending_settlements
                    where pending_settlements.group_id = group_id_param
                      and pending_settlements.status = 'pending_confirmation'
                )
        ),
        'splits', (
            select coalesce(jsonb_agg(jsonb_build_object(
                'id', splits.id,
                'expenseId', splits.expense_id,
                'userId', splits.user_id,
                'userName', members.full_name,
                'owedAmount', splits.owed_amount,
                'settledAmount', splits.settled_amount,
                'isSettled', splits.is_settled,
                'settledAt', splits.settled_at
            ) order by members.full_name, splits.user_id), '[]'::jsonb)
            from public.expense_splits splits
            join public.profiles members on members.id = splits.user_id
            where splits.expense_id = expenses.id
        )
    ) into response_value
    from public.group_expenses expenses
    join public.profiles payer on payer.id = expenses.paid_by
    where expenses.id = expense_id_param and expenses.group_id = group_id_param;

    return response_value;
end;
$$;

create or replace function public.list_group_balances_web(group_id_param uuid)
returns table(
    user_id uuid,
    user_name text,
    user_avatar_url text,
    user_upi_id text,
    balance numeric,
    direction text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
    if caller_id is null or not private.is_group_member(group_id_param, caller_id) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;
    return query
    select
        balances.user_id,
        profiles.full_name,
        profiles.avatar_url,
        case when balances.balance < 0 then profiles.upi_id else null end,
        balances.balance,
        case
            when balances.balance > 0 then 'owes_you'
            when balances.balance < 0 then 'you_owe'
            else 'settled'
        end
    from public.get_group_balances(group_id_param) balances
    join public.profiles profiles on profiles.id = balances.user_id
    order by abs(balances.balance) desc, profiles.full_name, balances.user_id;
end;
$$;

create or replace function public.create_group_expense_web(
    group_id_param uuid,
    paid_by_param uuid,
    title_param text,
    total_amount_param numeric,
    category_param text,
    split_type_param text,
    note_param text,
    expense_date_param date,
    splits_param jsonb,
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
    stored_record private.api_idempotency_keys%rowtype;
    expense_record public.group_expenses%rowtype;
    response_value jsonb;
    computed_splits jsonb;
    participant_count integer;
    total_cents bigint;
    value_sum numeric;
    affected_user uuid;
    canonical_splits jsonb;
    computed_request_hash text;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if idempotency_key_param is null
       or idempotency_key_param !~ '^[A-Za-z0-9._:-]{16,128}$' then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
    end if;
    if group_id_param is null
       or paid_by_param is null
       or title_param is null or char_length(trim(title_param)) not between 1 and 120
       or total_amount_param is null or total_amount_param <= 0
       or total_amount_param > 9999999999.99
       or total_amount_param <> round(total_amount_param, 2)
       or category_param is null
       or category_param not in (
            'Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health',
            'Education', 'Travel', 'Groceries', 'Rent', 'Salary', 'Freelance', 'Other'
       )
       or split_type_param is null
       or split_type_param not in ('equal', 'exact', 'percentage')
       or note_param is not null and char_length(note_param) > 500
       or expense_date_param is null
       or splits_param is null
       or jsonb_typeof(splits_param) <> 'array'
       or jsonb_array_length(splits_param) not between 1 and 500 then
        raise exception 'Invalid group expense input' using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(splits_param) entries(item)
        where jsonb_typeof(item) <> 'object'
           or item - array['user_id', 'value'] <> '{}'::jsonb
           or jsonb_typeof(item -> 'user_id') <> 'string'
           or item ->> 'user_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
        raise exception 'Invalid split member input' using errcode = '22023';
    end if;

    select count(*), count(distinct (item ->> 'user_id')::uuid)
    into participant_count, value_sum
    from jsonb_array_elements(splits_param) entries(item);
    if participant_count <> value_sum then
        raise exception 'Duplicate split members are not allowed' using errcode = '22023';
    end if;

    if split_type_param = 'exact' and exists (
        select 1 from jsonb_array_elements(splits_param) entries(item)
        where jsonb_typeof(item -> 'value') is distinct from 'string'
           or item ->> 'value' !~ '^\d{1,10}(\.\d{1,2})?$'
           or (item ->> 'value')::numeric <= 0
    ) then
        raise exception 'Exact splits require positive money values' using errcode = '22023';
    elsif split_type_param = 'percentage' and exists (
        select 1 from jsonb_array_elements(splits_param) entries(item)
        where jsonb_typeof(item -> 'value') is distinct from 'string'
           or item ->> 'value' !~ '^\d{1,3}(\.\d{1,4})?$'
           or (item ->> 'value')::numeric <= 0
           or (item ->> 'value')::numeric > 100
    ) then
        raise exception 'Percentage splits require values greater than 0 and at most 100' using errcode = '22023';
    end if;

    select jsonb_agg(
        case
            when split_type_param = 'equal' then
                jsonb_build_object('user_id', (item ->> 'user_id')::uuid)
            when split_type_param = 'exact' then
                jsonb_build_object(
                    'user_id', (item ->> 'user_id')::uuid,
                    'value', to_char((item ->> 'value')::numeric, 'FM9999999990.00')
                )
            else
                jsonb_build_object(
                    'user_id', (item ->> 'user_id')::uuid,
                    'value', to_char((item ->> 'value')::numeric, 'FM990.0000')
                )
        end
        order by (item ->> 'user_id')::uuid
    ) into canonical_splits
    from jsonb_array_elements(splits_param) entries(item);
    computed_request_hash := encode(extensions.digest(
        jsonb_build_object(
            'group_id', group_id_param,
            'paid_by', paid_by_param,
            'title', trim(title_param),
            'total_amount', to_char(total_amount_param, 'FM9999999990.00'),
            'category', category_param,
            'split_type', split_type_param,
            'note', nullif(trim(note_param), ''),
            'expense_date', expense_date_param,
            'splits', canonical_splits
        )::text,
        'sha256'
    ), 'hex');

    -- Membership mutations and expense creation share this lock. Authorization
    -- is deliberately checked only after acquisition so a waiting removed user
    -- cannot resume and write as a former member.
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_member(group_id_param, caller_id) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;
    if not private.is_group_member(group_id_param, paid_by_param) then
        raise exception 'Payer must be a group member' using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(splits_param) entries(item)
        where not private.is_group_member(group_id_param, (item ->> 'user_id')::uuid)
    ) then
        raise exception 'Every split must reference a current group member' using errcode = '22023';
    end if;

    -- This lock serializes balance-changing expenses with settlement proposal
    -- and confirmation. Lock order is always membership (seed 0), balance (1).
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1));
    perform pg_advisory_xact_lock(hashtextextended(
        caller_id::text || ':group-expense:create:' || idempotency_key_param,
        0
    ));
    delete from private.api_idempotency_keys where expires_at <= now();
    select * into stored_record
    from private.api_idempotency_keys
    where user_id = caller_id
      and scope = 'group-expense:create'
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

    total_cents := (total_amount_param * 100)::bigint;
    if split_type_param = 'equal' then
        with members as (
            select (item ->> 'user_id')::uuid user_id,
                   row_number() over (order by (item ->> 'user_id')::uuid) allocation_order
            from jsonb_array_elements(splits_param) entries(item)
        )
        select jsonb_agg(jsonb_build_object(
            'user_id', user_id,
            'owed_amount', (
                total_cents / participant_count
                + case when allocation_order <= total_cents % participant_count then 1 else 0 end
            )::numeric / 100
        ) order by user_id)
        into computed_splits
        from members;
    elsif split_type_param = 'exact' then
        select sum((item ->> 'value')::numeric)
        into value_sum
        from jsonb_array_elements(splits_param) entries(item);
        if value_sum <> total_amount_param then
            raise exception 'Exact splits must equal the expense total' using errcode = '22023';
        end if;
        select jsonb_agg(jsonb_build_object(
            'user_id', (item ->> 'user_id')::uuid,
            'owed_amount', (item ->> 'value')::numeric
        ) order by (item ->> 'user_id')::uuid)
        into computed_splits
        from jsonb_array_elements(splits_param) entries(item);
    else
        select sum((item ->> 'value')::numeric)
        into value_sum
        from jsonb_array_elements(splits_param) entries(item);
        if value_sum <> 100.0000 then
            raise exception 'Percentage splits must total exactly 100' using errcode = '22023';
        end if;

        with weights as (
            select
                (item ->> 'user_id')::uuid user_id,
                ((item ->> 'value')::numeric * 10000)::bigint percentage_units
            from jsonb_array_elements(splits_param) entries(item)
        ), raw_allocations as (
            select
                user_id,
                total_cents * percentage_units / 1000000 base_cents,
                total_cents * percentage_units % 1000000 remainder_units
            from weights
        ), ranked as (
            select *, row_number() over (order by remainder_units desc, user_id) remainder_rank
            from raw_allocations
        ), allocated as (
            select
                user_id,
                base_cents + case
                    when remainder_rank <= total_cents - sum(base_cents) over () then 1
                    else 0
                end owed_cents
            from ranked
        )
        select jsonb_agg(jsonb_build_object(
            'user_id', user_id,
            'owed_amount', owed_cents::numeric / 100
        ) order by user_id)
        into computed_splits
        from allocated;
    end if;

    if (select sum((item ->> 'owed_amount')::numeric)
        from jsonb_array_elements(computed_splits) entries(item)) <> total_amount_param then
        raise exception 'Computed splits do not equal the expense total' using errcode = '22023';
    end if;

    insert into public.group_expenses(
        group_id, paid_by, title, total_amount, category, split_type, note, expense_date
    ) values (
        group_id_param,
        paid_by_param,
        trim(title_param),
        total_amount_param,
        trim(category_param),
        split_type_param,
        nullif(trim(note_param), ''),
        expense_date_param
    ) returning * into expense_record;

    insert into public.expense_splits(
        expense_id, user_id, owed_amount, is_settled, settled_at
    )
    select
        expense_record.id,
        (item ->> 'user_id')::uuid,
        (item ->> 'owed_amount')::numeric,
        (item ->> 'owed_amount')::numeric = 0,
        case when (item ->> 'owed_amount')::numeric = 0 then expense_record.created_at else null end
    from jsonb_array_elements(computed_splits) entries(item);

    insert into public.personal_expenses(
        user_id, title, amount, category, type, note, source_group_expense_id, expense_date
    )
    select
        (item ->> 'user_id')::uuid,
        expense_record.title,
        (item ->> 'owed_amount')::numeric,
        expense_record.category,
        'expense',
        expense_record.note,
        expense_record.id,
        expense_record.expense_date
    from jsonb_array_elements(computed_splits) entries(item)
    where (item ->> 'owed_amount')::numeric > 0;

    for affected_user in
        select (item ->> 'user_id')::uuid
        from jsonb_array_elements(computed_splits) entries(item)
        order by (item ->> 'user_id')::uuid
    loop
        perform private.recalculate_profile_balance(affected_user);
    end loop;

    select public.get_group_expense_web(group_id_param, expense_record.id)
    into response_value;
    insert into private.api_idempotency_keys(
        user_id, scope, idempotency_key, request_hash, response, status_code
    ) values (
        caller_id,
        'group-expense:create',
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

create or replace function public.delete_group_expense_web(
    group_id_param uuid,
    expense_id_param uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    expense_record public.group_expenses%rowtype;
    affected_users uuid[];
    affected_user uuid;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1));
    if not private.is_group_member(group_id_param, caller_id) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;
    select * into expense_record
    from public.group_expenses
    where id = expense_id_param and group_id = group_id_param
    for update;
    if not found then return false; end if;
    if expense_record.paid_by <> caller_id
       and not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Only the payer or a group administrator can delete this expense' using errcode = '42501';
    end if;
    if exists (
        select 1 from public.expense_splits
        where expense_id = expense_id_param and settled_amount > 0
    ) then
        raise exception 'SETTLED_EXPENSE_IMMUTABLE' using errcode = '22023';
    end if;
    if exists (
        select 1 from public.settlements
        where group_id = group_id_param and status = 'pending_confirmation'
    ) then
        raise exception 'Resolve pending settlements before deleting this expense';
    end if;

    select array_agg(user_id order by user_id)
    into affected_users
    from public.expense_splits
    where expense_id = expense_id_param;
    foreach affected_user in array coalesce(affected_users, array[]::uuid[]) loop
        -- Locks are also acquired by the linked-ledger statement trigger. This
        -- explicit sorted loop preserves ordering before aggregate refresh.
        perform pg_advisory_xact_lock(hashtextextended(
            'expenso:personal-ledger:' || affected_user::text,
            0
        ));
    end loop;
    delete from public.notifications
    where type = 'expense_added' and related_id = expense_id_param;
    delete from public.group_expenses where id = expense_id_param;
    foreach affected_user in array coalesce(affected_users, array[]::uuid[]) loop
        perform private.recalculate_profile_balance(affected_user);
    end loop;
    return true;
end;
$$;

-- Settlement proposal and expense mutation must acquire group locks in one
-- global order. The legacy proposal acquired balance seed 1 before its INSERT
-- membership trigger acquired seed 0, which could deadlock with an expense
-- holding seed 0 and waiting on seed 1.
create or replace function public.create_settlement(
    group_id_param uuid,
    receiver_id_param uuid,
    amount_param numeric,
    transaction_ref_param text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    amount_rounded numeric(12, 2) := round(amount_param, 2);
    current_balance numeric;
    settlement_id_value uuid;
begin
    if caller_id is null or receiver_id_param = caller_id or amount_rounded <= 0 then
        raise exception 'Invalid settlement participants or amount' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_member(group_id_param, caller_id)
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

-- The web commands supersede foundation RPCs that accepted browser-computed
-- split amounts or omitted route-bound group IDs.
revoke execute on function public.create_group_expense(uuid, uuid, text, numeric, text, text, text, date, jsonb) from authenticated;
revoke execute on function public.delete_group_expense(uuid) from authenticated;

revoke all on function public.list_group_expenses_web(uuid, date, timestamptz, uuid, integer) from public;
revoke all on function public.get_group_expense_web(uuid, uuid) from public;
revoke all on function public.list_group_balances_web(uuid) from public;
revoke all on function public.create_group_expense_web(uuid, uuid, text, numeric, text, text, text, date, jsonb, text) from public;
revoke all on function public.delete_group_expense_web(uuid, uuid) from public;
grant execute on function public.list_group_expenses_web(uuid, date, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_group_expense_web(uuid, uuid) to authenticated;
grant execute on function public.list_group_balances_web(uuid) to authenticated;
grant execute on function public.create_group_expense_web(uuid, uuid, text, numeric, text, text, text, date, jsonb, text) to authenticated;
grant execute on function public.delete_group_expense_web(uuid, uuid) to authenticated;
