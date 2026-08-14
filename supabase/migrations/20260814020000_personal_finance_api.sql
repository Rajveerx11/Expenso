-- Atomic personal-finance commands and read models for the web API.

create index if not exists personal_expenses_user_feed_idx
    on public.personal_expenses(user_id, expense_date desc, created_at desc, id desc);

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'personal_expenses_category_allowed'
          and conrelid = 'public.personal_expenses'::regclass
    ) then
        alter table public.personal_expenses
            add constraint personal_expenses_category_allowed
            check (category in (
                'Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health',
                'Education', 'Travel', 'Groceries', 'Rent', 'Salary', 'Freelance', 'Other'
            )) not valid;
    end if;
end;
$$;

-- Every code path that changes the ledger already calls this function. Taking
-- the user-scoped transaction lock before its fresh READ COMMITTED aggregate
-- prevents distinct concurrent creates/updates/deletes from losing a total.
create or replace function private.recalculate_profile_balance(user_id_param uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
    balance_value numeric(12, 2);
    income_value numeric(12, 2);
begin
    perform pg_advisory_xact_lock(hashtextextended(
        'expenso:personal-ledger:' || user_id_param::text,
        0
    ));
    select
        coalesce(sum(amount) filter (where type = 'income'), 0),
        coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into income_value, balance_value
    from public.personal_expenses
    where user_id = user_id_param;

    update public.profiles
    set total_income = income_value, total_balance = balance_value
    where id = user_id_param;
    return balance_value;
end;
$$;

revoke all on function private.recalculate_profile_balance(uuid) from public, anon, authenticated;

create or replace function private.lock_personal_insert_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare affected_user uuid;
begin
    for affected_user in
        select distinct user_id from new_personal_rows order by user_id
    loop
        perform pg_advisory_xact_lock(hashtextextended(
            'expenso:personal-ledger:' || affected_user::text,
            0
        ));
    end loop;
    return null;
end;
$$;

create or replace function private.lock_personal_update_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare affected_user uuid;
begin
    for affected_user in
        select user_id
        from (
            select user_id from old_personal_rows
            union
            select user_id from new_personal_rows
        ) affected
        order by user_id
    loop
        perform pg_advisory_xact_lock(hashtextextended(
            'expenso:personal-ledger:' || affected_user::text,
            0
        ));
    end loop;
    return null;
end;
$$;

create or replace function private.lock_personal_delete_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare affected_user uuid;
begin
    for affected_user in
        select distinct user_id from old_personal_rows order by user_id
    loop
        perform pg_advisory_xact_lock(hashtextextended(
            'expenso:personal-ledger:' || affected_user::text,
            0
        ));
    end loop;
    return null;
end;
$$;

drop trigger if exists personal_expenses_lock_insert_batch on public.personal_expenses;
create trigger personal_expenses_lock_insert_batch
after insert on public.personal_expenses
referencing new table as new_personal_rows
for each statement execute function private.lock_personal_insert_batch();

drop trigger if exists personal_expenses_lock_update_batch on public.personal_expenses;
create trigger personal_expenses_lock_update_batch
after update on public.personal_expenses
referencing old table as old_personal_rows new table as new_personal_rows
for each statement execute function private.lock_personal_update_batch();

drop trigger if exists personal_expenses_lock_delete_batch on public.personal_expenses;
create trigger personal_expenses_lock_delete_batch
after delete on public.personal_expenses
referencing old table as old_personal_rows
for each statement execute function private.lock_personal_delete_batch();

revoke all on function private.lock_personal_insert_batch() from public, anon, authenticated;
revoke all on function private.lock_personal_update_batch() from public, anon, authenticated;
revoke all on function private.lock_personal_delete_batch() from public, anon, authenticated;

-- Authenticated clients may read their RLS-filtered ledger. All writes must go
-- through reviewed security-definer commands so aggregate updates cannot be bypassed.
revoke insert, update, delete on public.personal_expenses from authenticated;
grant select on public.personal_expenses to authenticated;

create table if not exists private.api_idempotency_keys (
    user_id uuid not null references public.profiles(id) on delete cascade,
    scope text not null,
    idempotency_key text not null,
    request_hash text not null,
    response jsonb not null,
    status_code integer not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '24 hours',
    primary key (user_id, scope, idempotency_key),
    check (char_length(scope) between 1 and 100),
    check (char_length(idempotency_key) between 16 and 128),
    check (request_hash ~ '^[0-9a-f]{64}$'),
    check (jsonb_typeof(response) = 'object'),
    check (status_code between 200 and 599)
);

create index if not exists api_idempotency_keys_expiry_idx
    on private.api_idempotency_keys(expires_at);

revoke all on private.api_idempotency_keys from public, anon, authenticated;

create or replace function public.create_personal_expense(
    title_param text,
    amount_param numeric,
    category_param text,
    type_param text,
    note_param text,
    expense_date_param date,
    idempotency_key_param text,
    request_hash_param text
)
returns table(
    transaction_id uuid,
    transaction_title text,
    transaction_amount numeric,
    transaction_category text,
    transaction_type text,
    transaction_note text,
    transaction_source_group_expense_id uuid,
    transaction_expense_date date,
    transaction_created_at timestamptz,
    transaction_updated_at timestamptz,
    replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    stored_record private.api_idempotency_keys%rowtype;
    created_record public.personal_expenses%rowtype;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if idempotency_key_param is null
       or char_length(idempotency_key_param) not between 16 and 128 then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
    end if;
    if request_hash_param !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid request hash' using errcode = '22023';
    end if;
    if title_param is null or char_length(trim(title_param)) not between 1 and 120
       or category_param not in (
            'Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health',
            'Education', 'Travel', 'Groceries', 'Rent', 'Salary', 'Freelance', 'Other'
       )
       or type_param not in ('income', 'expense')
       or amount_param is null or amount_param <= 0 or amount_param <> round(amount_param, 2)
       or note_param is not null and char_length(note_param) > 500
       or expense_date_param is null then
        raise exception 'Invalid personal expense input' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
        caller_id::text || ':personal-expense:create:' || idempotency_key_param,
        0
    ));
    delete from private.api_idempotency_keys
    where expires_at <= now();

    select * into stored_record
    from private.api_idempotency_keys
    where user_id = caller_id
      and scope = 'personal-expense:create'
      and idempotency_key = idempotency_key_param;
    if found then
        if stored_record.request_hash <> request_hash_param then
            raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
        end if;
        transaction_id := (stored_record.response ->> 'id')::uuid;
        transaction_title := stored_record.response ->> 'title';
        transaction_amount := (stored_record.response ->> 'amount')::numeric;
        transaction_category := stored_record.response ->> 'category';
        transaction_type := stored_record.response ->> 'type';
        transaction_note := stored_record.response ->> 'note';
        transaction_source_group_expense_id := (stored_record.response ->> 'source_group_expense_id')::uuid;
        transaction_expense_date := (stored_record.response ->> 'expense_date')::date;
        transaction_created_at := (stored_record.response ->> 'created_at')::timestamptz;
        transaction_updated_at := (stored_record.response ->> 'updated_at')::timestamptz;
        replayed := true;
        return next;
        return;
    end if;

    insert into public.personal_expenses(
        user_id, title, amount, category, type, note, expense_date
    ) values (
        caller_id,
        trim(title_param),
        amount_param,
        trim(category_param),
        type_param,
        nullif(trim(note_param), ''),
        expense_date_param
    ) returning * into created_record;

    perform private.recalculate_profile_balance(caller_id);
    insert into private.api_idempotency_keys(
        user_id, scope, idempotency_key, request_hash, response, status_code
    ) values (
        caller_id,
        'personal-expense:create',
        idempotency_key_param,
        request_hash_param,
        to_jsonb(created_record) - 'user_id',
        201
    );

    transaction_id := created_record.id;
    transaction_title := created_record.title;
    transaction_amount := created_record.amount;
    transaction_category := created_record.category;
    transaction_type := created_record.type;
    transaction_note := created_record.note;
    transaction_source_group_expense_id := created_record.source_group_expense_id;
    transaction_expense_date := created_record.expense_date;
    transaction_created_at := created_record.created_at;
    transaction_updated_at := created_record.updated_at;
    replayed := false;
    return next;
end;
$$;

create or replace function public.update_personal_expense(
    expense_id_param uuid,
    patch_param jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    current_record public.personal_expenses%rowtype;
    next_title text;
    next_amount numeric;
    next_category text;
    next_type text;
    next_note text;
    next_date date;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if patch_param is null
       or jsonb_typeof(patch_param) <> 'object'
       or patch_param = '{}'::jsonb
       or patch_param - array['title', 'amount', 'category', 'type', 'note', 'expense_date'] <> '{}'::jsonb then
        raise exception 'Invalid personal expense patch' using errcode = '22023';
    end if;

    select * into current_record
    from public.personal_expenses
    where id = expense_id_param and user_id = caller_id
    for update;
    if not found then return null; end if;
    if current_record.source_group_expense_id is not null then
        raise exception 'LINKED_TRANSACTION_READ_ONLY' using errcode = '22023';
    end if;

    next_title := case when patch_param ? 'title' then patch_param ->> 'title' else current_record.title end;
    next_amount := case when patch_param ? 'amount' then (patch_param ->> 'amount')::numeric else current_record.amount end;
    next_category := case when patch_param ? 'category' then patch_param ->> 'category' else current_record.category end;
    next_type := case when patch_param ? 'type' then patch_param ->> 'type' else current_record.type end;
    next_note := case when patch_param ? 'note' then patch_param ->> 'note' else current_record.note end;
    next_date := case when patch_param ? 'expense_date' then (patch_param ->> 'expense_date')::date else current_record.expense_date end;

    if next_title is null or char_length(trim(next_title)) not between 1 and 120
       or next_category not in (
            'Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health',
            'Education', 'Travel', 'Groceries', 'Rent', 'Salary', 'Freelance', 'Other'
       )
       or next_type not in ('income', 'expense')
       or next_amount is null or next_amount <= 0 or next_amount <> round(next_amount, 2)
       or next_note is not null and char_length(next_note) > 500
       or next_date is null then
        raise exception 'Invalid personal expense patch' using errcode = '22023';
    end if;

    update public.personal_expenses
    set title = trim(next_title),
        amount = next_amount,
        category = trim(next_category),
        type = next_type,
        note = nullif(trim(next_note), ''),
        expense_date = next_date
    where id = current_record.id;
    perform private.recalculate_profile_balance(caller_id);
    return current_record.id;
end;
$$;

create or replace function public.delete_personal_expense(expense_id_param uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    current_record public.personal_expenses%rowtype;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    select * into current_record
    from public.personal_expenses
    where id = expense_id_param and user_id = caller_id
    for update;
    if not found then return null; end if;
    if current_record.source_group_expense_id is not null then
        raise exception 'LINKED_TRANSACTION_READ_ONLY' using errcode = '22023';
    end if;
    delete from public.personal_expenses where id = current_record.id;
    perform private.recalculate_profile_balance(caller_id);
    return current_record.id;
end;
$$;

create or replace function public.list_personal_expenses(
    month_start_param date,
    type_param text default 'all',
    cursor_date_param date default null,
    cursor_created_at_param timestamptz default null,
    cursor_id_param uuid default null,
    limit_param integer default 30
)
returns table(
    id uuid,
    title text,
    amount numeric,
    category text,
    type text,
    note text,
    source_group_expense_id uuid,
    expense_date date,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if month_start_param is null or month_start_param <> date_trunc('month', month_start_param)::date
       or type_param not in ('all', 'income', 'expense')
       or limit_param not between 1 and 100
       or ((cursor_date_param is null) <> (cursor_created_at_param is null))
       or ((cursor_date_param is null) <> (cursor_id_param is null)) then
        raise exception 'Invalid personal expense query' using errcode = '22023';
    end if;
    return query
    select pe.id, pe.title, pe.amount, pe.category, pe.type, pe.note,
           pe.source_group_expense_id, pe.expense_date, pe.created_at, pe.updated_at
    from public.personal_expenses pe
    where pe.user_id = caller_id
      and pe.expense_date >= month_start_param
      and pe.expense_date < (month_start_param + interval '1 month')::date
      and (type_param = 'all' or pe.type = type_param)
      and (cursor_date_param is null or (pe.expense_date, pe.created_at, pe.id)
          < (cursor_date_param, cursor_created_at_param, cursor_id_param))
    order by pe.expense_date desc, pe.created_at desc, pe.id desc
    limit limit_param + 1;
end;
$$;

create or replace function public.get_personal_expense_analytics(month_start_param date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    result jsonb;
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if month_start_param is null or month_start_param <> date_trunc('month', month_start_param)::date then
        raise exception 'Invalid analytics month' using errcode = '22023';
    end if;
    with totals as (
        select
            coalesce(sum(amount) filter (where type = 'income' and expense_date >= month_start_param and expense_date < (month_start_param + interval '1 month')::date), 0) monthly_income,
            coalesce(sum(amount) filter (where type = 'expense' and expense_date >= month_start_param and expense_date < (month_start_param + interval '1 month')::date), 0) monthly_expenses,
            coalesce(sum(amount) filter (where type = 'income'), 0) lifetime_income,
            coalesce(sum(amount) filter (where type = 'expense'), 0) lifetime_expenses
        from public.personal_expenses where user_id = caller_id
    ), categories as (
        select coalesce(jsonb_agg(jsonb_build_object(
            'category', category,
            'amount', amount,
            'percentage', percentage
        ) order by amount desc, category), '[]'::jsonb) value
        from (
            select
                category,
                round(sum(amount), 2) amount,
                round(100 * sum(amount) / nullif(sum(sum(amount)) over (), 0), 2) percentage
            from public.personal_expenses
            where user_id = caller_id and type = 'expense'
              and expense_date >= month_start_param
              and expense_date < (month_start_param + interval '1 month')::date
            group by category
        ) grouped
    )
    select jsonb_build_object(
        'monthlyIncome', round(monthly_income, 2),
        'monthlyExpenses', round(monthly_expenses, 2),
        'monthlyNet', round(monthly_income - monthly_expenses, 2),
        'lifetimeIncome', round(lifetime_income, 2),
        'lifetimeExpenses', round(lifetime_expenses, 2),
        'lifetimeNet', round(lifetime_income - lifetime_expenses, 2),
        'categoryBreakdown', categories.value
    ) into result from totals cross join categories;
    return result;
end;
$$;

create or replace function public.get_dashboard_summary(month_start_param date)
returns table(
    monthly_income numeric,
    monthly_expenses numeric,
    monthly_net numeric,
    total_you_owe numeric,
    total_owed_to_you numeric,
    pending_confirmation_count bigint,
    unread_notification_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if month_start_param is null or month_start_param <> date_trunc('month', month_start_param)::date then
        raise exception 'Invalid dashboard month' using errcode = '22023';
    end if;
    return query
    with month_totals as (
        select
            coalesce(sum(pe.amount) filter (where pe.type = 'income'), 0) income,
            coalesce(sum(pe.amount) filter (where pe.type = 'expense'), 0) expenses
        from public.personal_expenses pe
        where pe.user_id = caller_id
          and pe.expense_date >= month_start_param
          and pe.expense_date < (month_start_param + interval '1 month')::date
    ), pair_balances as (
        select balances.balance
        from public.group_members memberships
        cross join lateral public.get_group_balances(memberships.group_id) balances
        where memberships.user_id = caller_id
    )
    select
        round(month_totals.income, 2),
        round(month_totals.expenses, 2),
        round(month_totals.income - month_totals.expenses, 2),
        round(coalesce(sum(-pair_balances.balance) filter (where pair_balances.balance < 0), 0), 2),
        round(coalesce(sum(pair_balances.balance) filter (where pair_balances.balance > 0), 0), 2),
        (select count(*) from public.settlements s where s.receiver_id = caller_id and s.status = 'pending_confirmation'),
        (select count(*) from public.notifications n where n.recipient_id = caller_id and n.read_at is null)
    from month_totals left join pair_balances on true
    group by month_totals.income, month_totals.expenses;
end;
$$;

revoke all on function public.create_personal_expense(text, numeric, text, text, text, date, text, text) from public;
revoke all on function public.update_personal_expense(uuid, jsonb) from public;
revoke all on function public.delete_personal_expense(uuid) from public;
revoke all on function public.list_personal_expenses(date, text, date, timestamptz, uuid, integer) from public;
revoke all on function public.get_personal_expense_analytics(date) from public;
revoke all on function public.get_dashboard_summary(date) from public;

grant execute on function public.create_personal_expense(text, numeric, text, text, text, date, text, text) to authenticated;
grant execute on function public.update_personal_expense(uuid, jsonb) to authenticated;
grant execute on function public.delete_personal_expense(uuid) to authenticated;
grant execute on function public.list_personal_expenses(date, text, date, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_personal_expense_analytics(date) to authenticated;
grant execute on function public.get_dashboard_summary(date) to authenticated;
