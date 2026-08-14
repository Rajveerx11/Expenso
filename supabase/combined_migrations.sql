-- EXPENSO COMBINED MIGRATIONS

-- MIGRATION: 20260810174703_expenso_v1_foundation.sql
-- Expenso v1 database contract.
-- Client access is intentionally limited to the authenticated role and every
-- exposed table is protected by row-level security.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text not null check (char_length(trim(full_name)) between 1 and 100),
    avatar_url text,
    upi_id text,
    total_income numeric(12, 2) not null default 0,
    total_balance numeric(12, 2) not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.groups (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) between 1 and 100),
    description text check (description is null or char_length(description) <= 500),
    image_url text,
    created_by uuid not null references public.profiles(id),
    default_currency text not null default 'INR' check (char_length(default_currency) = 3),
    simplified_debts boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.group_members (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete restrict,
    role text not null default 'editor' check (role in ('admin', 'editor')),
    joined_at timestamptz not null default now(),
    unique (group_id, user_id)
);

create table public.group_expenses (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    paid_by uuid not null references public.profiles(id) on delete restrict,
    title text not null check (char_length(trim(title)) between 1 and 120),
    total_amount numeric(12, 2) not null check (total_amount > 0),
    category text not null check (char_length(trim(category)) between 1 and 50),
    split_type text not null check (split_type in ('equal', 'exact', 'percentage', 'shares')),
    note text check (note is null or char_length(note) <= 500),
    expense_date date not null default current_date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.expense_splits (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.group_expenses(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete restrict,
    owed_amount numeric(12, 2) not null check (owed_amount >= 0),
    is_settled boolean not null default false,
    settled_at timestamptz,
    unique (expense_id, user_id),
    check ((is_settled and settled_at is not null) or (not is_settled and settled_at is null))
);

create table public.personal_expenses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    title text not null check (char_length(trim(title)) between 1 and 120),
    amount numeric(12, 2) not null check (amount > 0),
    category text not null check (char_length(trim(category)) between 1 and 50),
    type text not null check (type in ('income', 'expense')),
    note text check (note is null or char_length(note) <= 500),
    source_group_expense_id uuid references public.group_expenses(id) on delete cascade,
    expense_date date not null default current_date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, source_group_expense_id)
);

create table public.settlements (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    payer_id uuid not null references public.profiles(id) on delete restrict,
    receiver_id uuid not null references public.profiles(id) on delete restrict,
    amount numeric(12, 2) not null check (amount > 0),
    status text not null default 'pending_confirmation'
        check (status in ('pending_confirmation', 'confirmed', 'rejected')),
    transaction_ref text,
    confirmation_token uuid not null default gen_random_uuid(),
    created_at timestamptz not null default now(),
    confirmed_at timestamptz,
    check (payer_id <> receiver_id),
    check ((status = 'confirmed' and confirmed_at is not null) or status <> 'confirmed')
);

create unique index settlements_one_pending_pair_idx
    on public.settlements(group_id, payer_id, receiver_id)
    where status = 'pending_confirmation';

create table public.payment_confirmations (
    id uuid primary key default gen_random_uuid(),
    settlement_id uuid not null unique references public.settlements(id) on delete cascade,
    sender_id uuid not null references public.profiles(id) on delete restrict,
    receiver_id uuid not null references public.profiles(id) on delete restrict,
    amount numeric(12, 2) not null check (amount > 0),
    status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
    message text check (message is null or char_length(message) <= 500),
    created_at timestamptz not null default now(),
    responded_at timestamptz
);

create table public.user_fcm_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    fcm_token text not null unique,
    device_info text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index personal_expenses_user_date_idx on public.personal_expenses(user_id, expense_date desc);
create index personal_expenses_user_type_idx on public.personal_expenses(user_id, type);
create index group_members_user_idx on public.group_members(user_id);
create index group_expenses_group_date_idx on public.group_expenses(group_id, expense_date desc);
create index expense_splits_user_idx on public.expense_splits(user_id);
create index settlements_group_idx on public.settlements(group_id, created_at desc);
create index settlements_receiver_status_idx on public.settlements(receiver_id, status);
create index payment_confirmations_receiver_status_idx on public.payment_confirmations(receiver_id, status);
create index user_fcm_tokens_user_idx on public.user_fcm_tokens(user_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger groups_set_updated_at before update on public.groups
for each row execute function private.set_updated_at();
create trigger group_expenses_set_updated_at before update on public.group_expenses
for each row execute function private.set_updated_at();
create trigger personal_expenses_set_updated_at before update on public.personal_expenses
for each row execute function private.set_updated_at();
create trigger user_fcm_tokens_set_updated_at before update on public.user_fcm_tokens
for each row execute function private.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles(id, email, full_name, avatar_url)
    values (
        new.id,
        coalesce(new.email, new.id::text || '@unknown.invalid'),
        coalesce(
            nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
            split_part(coalesce(new.email, new.id::text), '@', 1)
        ),
        new.raw_user_meta_data ->> 'avatar_url'
    )
    on conflict (id) do update set
        email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
    return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

create or replace function private.is_group_member(group_id_param uuid, user_id_param uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.group_members
        where group_id = group_id_param and user_id = user_id_param
    );
$$;

create or replace function private.is_group_admin(group_id_param uuid, user_id_param uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.group_members
        where group_id = group_id_param and user_id = user_id_param and role = 'admin'
    );
$$;

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

revoke all on function private.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function private.is_group_member(uuid, uuid) from public;
revoke all on function private.is_group_admin(uuid, uuid) from public;
revoke all on function private.recalculate_profile_balance(uuid) from public;
grant execute on function private.is_group_member(uuid, uuid) to authenticated;
grant execute on function private.is_group_admin(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.personal_expenses enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;
alter table public.payment_confirmations enable row level security;
alter table public.user_fcm_tokens enable row level security;

create policy profiles_select_related on public.profiles for select to authenticated
using (
    id = (select auth.uid()) or exists (
        select 1 from public.group_members mine
        join public.group_members theirs on theirs.group_id = mine.group_id
        where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
);
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy personal_expenses_select_own on public.personal_expenses for select to authenticated
using (user_id = (select auth.uid()));
create policy personal_expenses_insert_own on public.personal_expenses for insert to authenticated
with check (user_id = (select auth.uid()) and source_group_expense_id is null);
create policy personal_expenses_update_own on public.personal_expenses for update to authenticated
using (user_id = (select auth.uid()) and source_group_expense_id is null)
with check (user_id = (select auth.uid()) and source_group_expense_id is null);
create policy personal_expenses_delete_own on public.personal_expenses for delete to authenticated
using (user_id = (select auth.uid()) and source_group_expense_id is null);

create policy groups_select_member on public.groups for select to authenticated
using (created_by = (select auth.uid()) or private.is_group_member(id));
create policy groups_insert_own on public.groups for insert to authenticated
with check (created_by = (select auth.uid()));
create policy groups_update_admin on public.groups for update to authenticated
using (private.is_group_admin(id)) with check (private.is_group_admin(id));

create policy group_members_select_member on public.group_members for select to authenticated
using (private.is_group_member(group_id));
create policy group_members_insert_admin on public.group_members for insert to authenticated
with check (
    private.is_group_admin(group_id) or
    (user_id = (select auth.uid()) and exists (
        select 1 from public.groups
        where id = group_id and created_by = (select auth.uid())
    ))
);
create policy group_members_update_admin on public.group_members for update to authenticated
using (private.is_group_admin(group_id)) with check (private.is_group_admin(group_id));

create policy group_expenses_select_member on public.group_expenses for select to authenticated
using (private.is_group_member(group_id));
create policy group_expenses_insert_payer on public.group_expenses for insert to authenticated
with check (paid_by = (select auth.uid()) and private.is_group_member(group_id));
create policy group_expenses_update_owner_or_admin on public.group_expenses for update to authenticated
using (paid_by = (select auth.uid()) or private.is_group_admin(group_id))
with check (paid_by = (select auth.uid()) or private.is_group_admin(group_id));

create policy expense_splits_select_member on public.expense_splits for select to authenticated
using (exists (
    select 1 from public.group_expenses
    where id = expense_id and private.is_group_member(group_id)
));

create policy settlements_select_involved on public.settlements for select to authenticated
using (payer_id = (select auth.uid()) or receiver_id = (select auth.uid()));
create policy confirmations_select_involved on public.payment_confirmations for select to authenticated
using (sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));

create policy fcm_tokens_select_own on public.user_fcm_tokens for select to authenticated
using (user_id = (select auth.uid()));
create policy fcm_tokens_insert_own on public.user_fcm_tokens for insert to authenticated
with check (user_id = (select auth.uid()));
create policy fcm_tokens_update_own on public.user_fcm_tokens for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy fcm_tokens_delete_own on public.user_fcm_tokens for delete to authenticated
using (user_id = (select auth.uid()));

grant select on public.profiles to authenticated;
grant update(full_name, avatar_url, upi_id, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.personal_expenses to authenticated;
grant select, insert on public.groups to authenticated;
grant update(name, description, image_url, default_currency, simplified_debts, updated_at) on public.groups to authenticated;
grant select, insert on public.group_members to authenticated;
grant update(role) on public.group_members to authenticated;
grant select on public.group_expenses to authenticated;
grant select on public.expense_splits to authenticated;
grant select on public.settlements to authenticated;
grant select on public.payment_confirmations to authenticated;
grant select, insert, update, delete on public.user_fcm_tokens to authenticated;

create or replace function public.recalculate_balance(user_id_param uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
begin
    if user_id_param is distinct from (select auth.uid()) then
        raise exception 'Cannot recalculate another user''s balance' using errcode = '42501';
    end if;
    return private.recalculate_profile_balance(user_id_param);
end;
$$;

create or replace function public.get_group_balances(group_id_param uuid)
returns table(user_id uuid, balance numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
begin
    if caller_id is null or not private.is_group_member(group_id_param, caller_id) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;

    return query
    with other_members as (
        select gm.user_id
        from public.group_members gm
        where gm.group_id = group_id_param and gm.user_id <> caller_id
    ), expense_credit as (
        select es.user_id, sum(es.owed_amount) amount
        from public.group_expenses ge
        join public.expense_splits es on es.expense_id = ge.id
        where ge.group_id = group_id_param and ge.paid_by = caller_id and es.user_id <> caller_id
        group by es.user_id
    ), expense_debit as (
        select ge.paid_by user_id, sum(es.owed_amount) amount
        from public.group_expenses ge
        join public.expense_splits es on es.expense_id = ge.id
        where ge.group_id = group_id_param and es.user_id = caller_id and ge.paid_by <> caller_id
        group by ge.paid_by
    ), received as (
        select s.payer_id user_id, sum(s.amount) amount
        from public.settlements s
        where s.group_id = group_id_param and s.receiver_id = caller_id and s.status = 'confirmed'
        group by s.payer_id
    ), paid as (
        select s.receiver_id user_id, sum(s.amount) amount
        from public.settlements s
        where s.group_id = group_id_param and s.payer_id = caller_id and s.status = 'confirmed'
        group by s.receiver_id
    )
    select om.user_id,
        round(coalesce(ec.amount, 0) - coalesce(ed.amount, 0) - coalesce(r.amount, 0) + coalesce(p.amount, 0), 2)
    from other_members om
    left join expense_credit ec using (user_id)
    left join expense_debit ed using (user_id)
    left join received r using (user_id)
    left join paid p using (user_id)
    order by om.user_id;
end;
$$;

create or replace function public.create_group_expense(
    group_id_param uuid,
    paid_by_param uuid,
    title_param text,
    total_amount_param numeric,
    category_param text,
    split_type_param text,
    note_param text,
    expense_date_param date,
    splits_param jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    expense_id_value uuid;
    split_count integer;
    split_sum numeric;
    total_rounded numeric := round(total_amount_param, 2);
    affected_user uuid;
begin
    if caller_id is null or not private.is_group_member(group_id_param, caller_id) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;
    if not private.is_group_member(group_id_param, paid_by_param) then
        raise exception 'Payer must be a group member' using errcode = '22023';
    end if;
    if total_amount_param <= 0 or jsonb_typeof(splits_param) <> 'array' then
        raise exception 'A positive total and split array are required' using errcode = '22023';
    end if;
    if split_type_param not in ('equal', 'exact', 'percentage', 'shares') then
        raise exception 'Unsupported split type' using errcode = '22023';
    end if;

    select count(*), coalesce(sum(round((item ->> 'owed_amount')::numeric, 2)), 0)
    into split_count, split_sum
    from jsonb_array_elements(splits_param) as items(item);

    if split_count = 0 or split_sum <> total_rounded then
        raise exception 'Split amounts must equal the expense total' using errcode = '22023';
    end if;
    if split_count <> (
        select count(distinct (item ->> 'user_id')::uuid)
        from jsonb_array_elements(splits_param) as items(item)
    ) then
        raise exception 'Duplicate split members are not allowed' using errcode = '22023';
    end if;
    if exists (
        select 1 from jsonb_array_elements(splits_param) as items(item)
        where (item ->> 'owed_amount')::numeric < 0
           or not private.is_group_member(group_id_param, (item ->> 'user_id')::uuid)
    ) then
        raise exception 'Every split must reference a group member and a non-negative amount' using errcode = '22023';
    end if;

    insert into public.group_expenses(group_id, paid_by, title, total_amount, category, split_type, note, expense_date)
    values (group_id_param, paid_by_param, trim(title_param), total_rounded, trim(category_param), split_type_param, nullif(trim(note_param), ''), expense_date_param)
    returning id into expense_id_value;

    insert into public.expense_splits(expense_id, user_id, owed_amount)
    select expense_id_value, (item ->> 'user_id')::uuid, round((item ->> 'owed_amount')::numeric, 2)
    from jsonb_array_elements(splits_param) as items(item);

    insert into public.personal_expenses(user_id, title, amount, category, type, note, source_group_expense_id, expense_date)
    select (item ->> 'user_id')::uuid, trim(title_param), round((item ->> 'owed_amount')::numeric, 2),
        trim(category_param), 'expense', nullif(trim(note_param), ''), expense_id_value, expense_date_param
    from jsonb_array_elements(splits_param) as items(item)
    where (item ->> 'owed_amount')::numeric > 0;

    for affected_user in
        select distinct (item ->> 'user_id')::uuid
        from jsonb_array_elements(splits_param) as items(item)
    loop
        perform private.recalculate_profile_balance(affected_user);
    end loop;
    return expense_id_value;
end;
$$;

create or replace function public.delete_group_expense(expense_id_param uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    expense_record public.group_expenses%rowtype;
    affected_users uuid[];
    affected_user uuid;
begin
    select * into expense_record from public.group_expenses where id = expense_id_param for update;
    if not found then return false; end if;
    if expense_record.paid_by <> (select auth.uid()) and not private.is_group_admin(expense_record.group_id) then
        raise exception 'Only the payer or an admin can delete this expense' using errcode = '42501';
    end if;
    select array_agg(user_id) into affected_users from public.expense_splits where expense_id = expense_id_param;
    delete from public.group_expenses where id = expense_id_param;
    foreach affected_user in array coalesce(affected_users, array[]::uuid[]) loop
        perform private.recalculate_profile_balance(affected_user);
    end loop;
    return true;
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
    current_balance numeric;
    settlement_id_value uuid;
begin
    if caller_id is null or receiver_id_param = caller_id or amount_param <= 0
       or not private.is_group_member(group_id_param, caller_id)
       or not private.is_group_member(group_id_param, receiver_id_param) then
        raise exception 'Invalid settlement participants or amount' using errcode = '22023';
    end if;
    select balance into current_balance
    from public.get_group_balances(group_id_param)
    where user_id = receiver_id_param;
    if current_balance is null or current_balance >= 0 or amount_param > -current_balance then
        raise exception 'Settlement exceeds the outstanding debt' using errcode = '22023';
    end if;

    insert into public.settlements(group_id, payer_id, receiver_id, amount, transaction_ref)
    values (group_id_param, caller_id, receiver_id_param, round(amount_param, 2), nullif(trim(transaction_ref_param), ''))
    returning id into settlement_id_value;
    insert into public.payment_confirmations(settlement_id, sender_id, receiver_id, amount)
    values (settlement_id_value, caller_id, receiver_id_param, round(amount_param, 2));
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
begin
    select * into settlement_record from public.settlements where id = settlement_id_param for update;
    if not found then return false; end if;
    if user_id_param is distinct from (select auth.uid())
       or settlement_record.receiver_id <> user_id_param then
        raise exception 'Only the receiver can confirm this settlement' using errcode = '42501';
    end if;
    if settlement_record.status = 'confirmed' then return true; end if;
    if settlement_record.status <> 'pending_confirmation' then
        raise exception 'Settlement is no longer pending' using errcode = '22023';
    end if;
    update public.settlements set status = 'confirmed', confirmed_at = now() where id = settlement_id_param;
    update public.payment_confirmations set status = 'confirmed', responded_at = now()
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
    select * into settlement_record from public.settlements where id = settlement_id_param for update;
    if not found then return false; end if;
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

revoke all on function public.recalculate_balance(uuid) from public;
revoke all on function public.get_group_balances(uuid) from public;
revoke all on function public.create_group_expense(uuid, uuid, text, numeric, text, text, text, date, jsonb) from public;
revoke all on function public.delete_group_expense(uuid) from public;
revoke all on function public.create_settlement(uuid, uuid, numeric, text) from public;
revoke all on function public.confirm_settlement(uuid, uuid) from public;
revoke all on function public.reject_settlement(uuid) from public;
grant execute on function public.recalculate_balance(uuid) to authenticated;
grant execute on function public.get_group_balances(uuid) to authenticated;
grant execute on function public.create_group_expense(uuid, uuid, text, numeric, text, text, text, date, jsonb) to authenticated;
grant execute on function public.delete_group_expense(uuid) to authenticated;
grant execute on function public.create_settlement(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.confirm_settlement(uuid, uuid) to authenticated;
grant execute on function public.reject_settlement(uuid) to authenticated;

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlements'
    ) then
        alter publication supabase_realtime add table public.settlements;
    end if;
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_confirmations'
    ) then
        alter publication supabase_realtime add table public.payment_confirmations;
    end if;
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
    ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
    ('group-images', 'group-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

create policy group_images_select_member on storage.objects for select to authenticated
using (
    bucket_id = 'group-images' and
    private.is_group_member(split_part(name, '.', 1)::uuid)
);
create policy group_images_insert_admin on storage.objects for insert to authenticated
with check (
    bucket_id = 'group-images' and
    private.is_group_admin(split_part(name, '.', 1)::uuid)
);
create policy group_images_update_admin on storage.objects for update to authenticated
using (bucket_id = 'group-images' and private.is_group_admin(split_part(name, '.', 1)::uuid))
with check (bucket_id = 'group-images' and private.is_group_admin(split_part(name, '.', 1)::uuid));
create policy group_images_delete_admin on storage.objects for delete to authenticated
using (bucket_id = 'group-images' and private.is_group_admin(split_part(name, '.', 1)::uuid));


-- MIGRATION: 20260810182003_safe_group_management.sql
-- Safe, atomic group-administration operations. This migration depends on the
-- Expenso v1 foundation migration introduced by issue #1.

create or replace function private.member_has_unresolved_debt(
    group_id_param uuid,
    member_id_param uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    with peers as (
        select user_id
        from public.group_members
        where group_id = group_id_param and user_id <> member_id_param
    ), pair_balances as (
        select peers.user_id,
            coalesce((
                select sum(es.owed_amount)
                from public.group_expenses ge
                join public.expense_splits es on es.expense_id = ge.id
                where ge.group_id = group_id_param
                  and ge.paid_by = member_id_param
                  and es.user_id = peers.user_id
            ), 0)
            - coalesce((
                select sum(es.owed_amount)
                from public.group_expenses ge
                join public.expense_splits es on es.expense_id = ge.id
                where ge.group_id = group_id_param
                  and ge.paid_by = peers.user_id
                  and es.user_id = member_id_param
            ), 0)
            - coalesce((
                select sum(s.amount)
                from public.settlements s
                where s.group_id = group_id_param
                  and s.payer_id = peers.user_id
                  and s.receiver_id = member_id_param
                  and s.status = 'confirmed'
            ), 0)
            + coalesce((
                select sum(s.amount)
                from public.settlements s
                where s.group_id = group_id_param
                  and s.payer_id = member_id_param
                  and s.receiver_id = peers.user_id
                  and s.status = 'confirmed'
            ), 0) as balance
        from peers
    )
    select exists (select 1 from pair_balances where abs(balance) >= 0.01)
        or exists (
            select 1 from public.settlements
            where group_id = group_id_param
              and status = 'pending_confirmation'
              and (payer_id = member_id_param or receiver_id = member_id_param)
        );
$$;

create or replace function private.validate_group_expense_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform pg_advisory_xact_lock(hashtextextended(new.group_id::text, 0));
    if not private.is_group_member(new.group_id, new.paid_by) then
        raise exception 'Payer must still be a group member' using errcode = '22023';
    end if;
    return new;
end;
$$;

create or replace function private.validate_expense_split_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    expense_group_id uuid;
begin
    select group_id into expense_group_id
    from public.group_expenses where id = new.expense_id;
    perform pg_advisory_xact_lock(hashtextextended(expense_group_id::text, 0));
    if not private.is_group_member(expense_group_id, new.user_id) then
        raise exception 'Split user must still be a group member' using errcode = '22023';
    end if;
    return new;
end;
$$;

create or replace function private.validate_settlement_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform pg_advisory_xact_lock(hashtextextended(new.group_id::text, 0));
    if not private.is_group_member(new.group_id, new.payer_id)
       or not private.is_group_member(new.group_id, new.receiver_id) then
        raise exception 'Settlement participants must still be group members' using errcode = '22023';
    end if;
    return new;
end;
$$;

create trigger validate_group_expense_membership
before insert or update of group_id, paid_by on public.group_expenses
for each row execute function private.validate_group_expense_membership();

create trigger validate_expense_split_membership
before insert or update of expense_id, user_id on public.expense_splits
for each row execute function private.validate_expense_split_membership();

create trigger validate_settlement_membership
before insert or update of group_id, payer_id, receiver_id on public.settlements
for each row execute function private.validate_settlement_membership();

create or replace function public.create_group_with_admin(
    name_param text,
    description_param text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    new_group_id uuid;
begin
    if caller_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if char_length(trim(name_param)) not between 1 and 100 then
        raise exception 'Group name must contain 1 to 100 characters';
    end if;

    insert into public.groups(name, description, created_by)
    values (trim(name_param), nullif(trim(description_param), ''), caller_id)
    returning id into new_group_id;

    insert into public.group_members(group_id, user_id, role)
    values (new_group_id, caller_id, 'admin');
    return new_group_id;
end;
$$;

create or replace function public.add_group_member_by_email(
    group_id_param uuid,
    email_param text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    member_id uuid;
    inserted_count integer;
begin
    if caller_id is null or not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;

    select id into member_id
    from public.profiles
    where lower(email) = lower(trim(email_param));
    if member_id is null then
        raise exception 'No registered Expenso user has that email';
    end if;

    insert into public.group_members(group_id, user_id, role)
    values (group_id_param, member_id, 'editor')
    on conflict (group_id, user_id) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 0 then
        raise exception 'This user is already a group member';
    end if;
    return member_id;
end;
$$;

create or replace function public.remove_group_member_safely(
    group_id_param uuid,
    member_id_param uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    target_role text;
    admin_count integer;
begin
    if caller_id is null or not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    if member_id_param = caller_id then
        raise exception 'Transfer administration before leaving this group';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));

    select role into target_role
    from public.group_members
    where group_id = group_id_param and user_id = member_id_param;
    if target_role is null then return true; end if;

    if target_role = 'admin' then
        select count(*) into admin_count
        from public.group_members
        where group_id = group_id_param and role = 'admin';
        if admin_count <= 1 then
            raise exception 'The sole administrator cannot be removed';
        end if;
    end if;

    if private.member_has_unresolved_debt(group_id_param, member_id_param) then
        raise exception 'Settle this member''s balances before removing them';
    end if;

    delete from public.group_members
    where group_id = group_id_param and user_id = member_id_param;
    return true;
end;
$$;

create or replace function public.delete_group_safely(group_id_param uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
begin
    if caller_id is null or not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if exists (
        select 1 from public.settlements
        where group_id = group_id_param and status = 'pending_confirmation'
    ) then
        raise exception 'Resolve pending settlements before deleting this group';
    end if;
    if exists (select 1 from public.group_expenses where group_id = group_id_param)
       or exists (select 1 from public.settlements where group_id = group_id_param) then
        raise exception 'Groups with financial history are retained for audit and cannot be deleted';
    end if;

    delete from public.groups where id = group_id_param;
    return true;
end;
$$;

create or replace function public.can_delete_group_safely(group_id_param uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
begin
    if caller_id is null or not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if exists (
        select 1 from public.settlements
        where group_id = group_id_param and status = 'pending_confirmation'
    ) then
        raise exception 'Resolve pending settlements before deleting this group';
    end if;
    if exists (select 1 from public.group_expenses where group_id = group_id_param)
       or exists (select 1 from public.settlements where group_id = group_id_param) then
        raise exception 'Groups with financial history are retained for audit and cannot be deleted';
    end if;
    return true;
end;
$$;

-- Role changes are not exposed until an atomic admin-transfer RPC exists.
-- This makes the at-least-one-admin invariant impossible to bypass directly.
revoke update(role) on public.group_members from authenticated;

revoke all on function private.member_has_unresolved_debt(uuid, uuid) from public;
revoke all on function private.validate_group_expense_membership() from public;
revoke all on function private.validate_expense_split_membership() from public;
revoke all on function private.validate_settlement_membership() from public;
revoke all on function public.create_group_with_admin(text, text) from public;
revoke all on function public.add_group_member_by_email(uuid, text) from public;
revoke all on function public.remove_group_member_safely(uuid, uuid) from public;
revoke all on function public.delete_group_safely(uuid) from public;
revoke all on function public.can_delete_group_safely(uuid) from public;
grant execute on function public.create_group_with_admin(text, text) to authenticated;
grant execute on function public.add_group_member_by_email(uuid, text) to authenticated;
grant execute on function public.remove_group_member_safely(uuid, uuid) to authenticated;
grant execute on function public.delete_group_safely(uuid) to authenticated;
grant execute on function public.can_delete_group_safely(uuid) to authenticated;


-- MIGRATION: 20260810183832_settlement_confirmation_allocation.sql
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


-- MIGRATION: 20260810185110_notification_delivery.sql
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


-- MIGRATION: 20260812072009_profile_persistence.sql
-- Avatar upsert performs SELECT + UPDATE after the initial insert. Keep object
-- metadata private to the owning authenticated user's folder.
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects for select to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);


-- MIGRATION: 20260812082339_centralized_group_listing.sql
-- Repair groups created before creation became atomic. Every group creator must
-- also be an administrator member so membership is the sole listing authority.
create or replace function private.repair_group_creator_memberships()
returns void
language sql
security invoker
set search_path = ''
as $$
    insert into public.group_members(group_id, user_id, role)
    select groups.id, groups.created_by, 'admin'
    from public.groups as groups
    on conflict (group_id, user_id) do update
    set role = excluded.role;
$$;

select private.repair_group_creator_memberships();
revoke all on function private.repair_group_creator_memberships() from public;

create or replace function public.list_user_groups()
returns setof public.groups
language sql
stable
security invoker
set search_path = ''
as $$
    select distinct groups.*
    from public.groups as groups
    join public.group_members as memberships
      on memberships.group_id = groups.id
    where memberships.user_id = (select auth.uid())
    order by groups.updated_at desc, groups.id;
$$;

revoke all on function public.list_user_groups() from public;
grant execute on function public.list_user_groups() to authenticated;


-- MIGRATION: 20260814010000_web_backend_foundation.sql
-- Web backend foundation hardening.
-- Existing schema remains the source of truth; this migration adds constraints
-- and narrows avatar mutation paths for the direct signed-upload workflow.

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_upi_id_format'
          and conrelid = 'public.profiles'::regclass
    ) then
        alter table public.profiles
            add constraint profiles_upi_id_format
            check (
                upi_id is null
                or (
                    char_length(upi_id) between 3 and 256
                    and upi_id = trim(upi_id)
                    and upi_id ~ '^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$'
                )
            ) not valid;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_avatar_url_length'
          and conrelid = 'public.profiles'::regclass
    ) then
        alter table public.profiles
            add constraint profiles_avatar_url_length
            check (avatar_url is null or char_length(avatar_url) <= 2048) not valid;
    end if;
end;
$$;

alter table public.profiles validate constraint profiles_upi_id_format;
alter table public.profiles validate constraint profiles_avatar_url_length;

drop policy if exists profiles_select_related on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = (select auth.uid()));

create or replace function public.get_group_member_directory(group_id_param uuid)
returns table(
    user_id uuid,
    full_name text,
    email text,
    avatar_url text,
    upi_id_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if not private.is_group_member(group_id_param, (select auth.uid())) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;

    return query
    select
        profiles.id,
        profiles.full_name,
        profiles.email,
        profiles.avatar_url,
        profiles.upi_id is not null
    from public.group_members
    join public.profiles on profiles.id = group_members.user_id
    where group_members.group_id = group_id_param
    order by profiles.full_name, profiles.id;
end;
$$;

revoke all on function public.get_group_member_directory(uuid) from public;
grant execute on function public.get_group_member_directory(uuid) to authenticated;

drop policy if exists avatars_select_own on storage.objects;
drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

create policy avatars_select_own on storage.objects
for select to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_insert_own on storage.objects
for insert to authenticated
with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/avatar-[0-9a-f-]{36}\.(jpg|png|webp)$')
);

create policy avatars_update_own on storage.objects
for update to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/avatar-[0-9a-f-]{36}\.(jpg|png|webp)$')
);

create policy avatars_delete_own on storage.objects
for delete to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Data API grants are explicit because new tables are not automatically
-- exposed by current Supabase projects.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update(full_name, avatar_url, upi_id) on public.profiles to authenticated;

create table if not exists private.auth_rate_limits (
    action text not null,
    key_hash text not null,
    window_started_at timestamptz not null default now(),
    hit_count integer not null default 1 check (hit_count > 0),
    updated_at timestamptz not null default now(),
    primary key (action, key_hash),
    check (action in ('login', 'signup', 'google')),
    check (key_hash ~ '^[0-9a-f]{64}$')
);

revoke all on private.auth_rate_limits from public, anon, authenticated;

create or replace function public.check_auth_rate_limit(
    action_param text,
    key_hash_param text,
    secret_param text
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    window_length interval;
    hit_limit integer;
    current_row private.auth_rate_limits%rowtype;
    configured_secret text;
begin
    case action_param
        when 'login' then window_length := interval '15 minutes'; hit_limit := 10;
        when 'signup' then window_length := interval '1 hour'; hit_limit := 5;
        when 'google' then window_length := interval '15 minutes'; hit_limit := 20;
        else raise exception 'Unsupported rate-limit action' using errcode = '22023';
    end case;

    if key_hash_param !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid rate-limit key' using errcode = '22023';
    end if;

    select decrypted_secret
    into configured_secret
    from vault.decrypted_secrets
    where name = 'expenso_auth_rate_limit_secret'
    order by created_at desc
    limit 1;

    if configured_secret is null
       or secret_param is null
       or char_length(secret_param) < 32
       or secret_param <> configured_secret then
        raise exception 'Rate limit authorization failed' using errcode = '42501';
    end if;

    -- Expired fingerprints never accumulate indefinitely. A hard cardinality
    -- ceiling contains damage if the server-side secret is ever compromised.
    delete from private.auth_rate_limits
    where updated_at < now() - interval '2 hours';

    if not exists (
        select 1 from private.auth_rate_limits
        where action = action_param and key_hash = key_hash_param
    ) then
        perform pg_advisory_xact_lock(hashtextextended('expenso:auth-rate-limit:cardinality', 0));
        if (select count(*) from private.auth_rate_limits) >= 100000 then
            allowed := false;
            retry_after_seconds := 300;
            return next;
            return;
        end if;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(action_param || ':' || key_hash_param, 0));

    insert into private.auth_rate_limits(action, key_hash, window_started_at, hit_count, updated_at)
    values (action_param, key_hash_param, now(), 1, now())
    on conflict (action, key_hash) do update
    set
        window_started_at = case
            when private.auth_rate_limits.window_started_at <= now() - window_length then now()
            else private.auth_rate_limits.window_started_at
        end,
        hit_count = case
            when private.auth_rate_limits.window_started_at <= now() - window_length then 1
            else private.auth_rate_limits.hit_count + 1
        end,
        updated_at = now()
    returning * into current_row;

    allowed := current_row.hit_count <= hit_limit;
    retry_after_seconds := case
        when allowed then 0
        else greatest(
            1,
            ceil(extract(epoch from (current_row.window_started_at + window_length - now())))::integer
        )
    end;
    return next;
end;
$$;

revoke all on function public.check_auth_rate_limit(text, text, text) from public;
grant execute on function public.check_auth_rate_limit(text, text, text) to anon, authenticated;


-- MIGRATION: 20260814020000_personal_finance_api.sql
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


-- MIGRATION: 20260814024541_personal_idempotency_hardening.sql
-- Personal create idempotency must be derived from authoritative, normalized
-- inputs. The former eight-argument RPC accepted a caller-selected digest,
-- allowing the same key/payload relationship to be misrepresented.
alter table public.personal_expenses
    add constraint personal_expenses_amount_finite
    check (amount <> 'NaN'::numeric);

create or replace function public.create_personal_expense(
    title_param text,
    amount_param numeric,
    category_param text,
    type_param text,
    note_param text,
    expense_date_param date,
    idempotency_key_param text
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
    computed_request_hash text;
begin
    computed_request_hash := encode(extensions.digest(
        jsonb_build_object(
            'title', trim(title_param),
            'amount', to_char(amount_param, 'FM9999999990.00'),
            'category', category_param,
            'type', type_param,
            'note', nullif(trim(note_param), ''),
            'expense_date', expense_date_param
        )::text,
        'sha256'
    ), 'hex');

    return query
    select *
    from public.create_personal_expense(
        title_param,
        amount_param,
        category_param,
        type_param,
        note_param,
        expense_date_param,
        idempotency_key_param,
        computed_request_hash
    );
end;
$$;

revoke all on function public.create_personal_expense(text, numeric, text, text, text, date, text, text)
    from public, anon, authenticated;
revoke all on function public.create_personal_expense(text, numeric, text, text, text, date, text)
    from public, anon, authenticated;
grant execute on function public.create_personal_expense(text, numeric, text, text, text, date, text)
    to authenticated;


-- MIGRATION: 20260814030000_groups_members_api.sql
-- Group/member read models and write commands for the same-origin web API.

create index if not exists groups_created_feed_idx on public.groups(created_at desc, id desc);
create index if not exists group_members_group_joined_idx on public.group_members(group_id, joined_at, id);

revoke insert, update, delete on public.groups from authenticated;
revoke insert, update, delete on public.group_members from authenticated;
grant select on public.groups, public.group_members to authenticated;

create table if not exists private.member_lookup_rate_limits (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    window_started_at timestamptz not null default now(),
    hit_count integer not null default 1 check (hit_count > 0),
    updated_at timestamptz not null default now()
);
revoke all on private.member_lookup_rate_limits from public, anon, authenticated;

create or replace function public.check_group_member_lookup_rate_limit(secret_param text)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    configured_secret text;
    limiter private.member_lookup_rate_limits%rowtype;
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    select decrypted_secret into configured_secret
    from vault.decrypted_secrets
    where name = 'expenso_auth_rate_limit_secret'
    order by created_at desc limit 1;
    if configured_secret is null or secret_param is null or char_length(secret_param) < 32
       or secret_param <> configured_secret then
        raise exception 'Member lookup authorization failed' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('expenso:member-lookup:' || caller_id::text, 0));
    insert into private.member_lookup_rate_limits(user_id, window_started_at, hit_count, updated_at)
    values (caller_id, now(), 1, now())
    on conflict (user_id) do update
    set window_started_at = case
            when private.member_lookup_rate_limits.window_started_at <= now() - interval '1 hour' then now()
            else private.member_lookup_rate_limits.window_started_at
        end,
        hit_count = case
            when private.member_lookup_rate_limits.window_started_at <= now() - interval '1 hour' then 1
            else private.member_lookup_rate_limits.hit_count + 1
        end,
        updated_at = now()
    returning * into limiter;
    allowed := limiter.hit_count <= 20;
    retry_after_seconds := case when allowed then 0 else greatest(
        1,
        ceil(extract(epoch from (limiter.window_started_at + interval '1 hour' - now())))::integer
    ) end;
    return next;
end;
$$;

create or replace function public.create_group_with_admin(
    name_param text,
    description_param text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    new_group_id uuid;
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if name_param is null or char_length(trim(name_param)) not between 1 and 100
       or description_param is not null and char_length(description_param) > 500 then
        raise exception 'Invalid group input' using errcode = '22023';
    end if;
    insert into public.groups(name, description, created_by)
    values (trim(name_param), nullif(trim(description_param), ''), caller_id)
    returning id into new_group_id;
    insert into public.group_members(group_id, user_id, role)
    values (new_group_id, caller_id, 'admin');
    return new_group_id;
end;
$$;

create or replace function public.list_group_summaries(
    cursor_created_at_param timestamptz default null,
    cursor_id_param uuid default null,
    limit_param integer default 30
)
returns table(
    id uuid,
    name text,
    description text,
    image_url text,
    created_by uuid,
    default_currency text,
    simplified_debts boolean,
    created_at timestamptz,
    updated_at timestamptz,
    member_count bigint,
    current_user_balance numeric,
    current_user_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if limit_param not between 1 and 100
       or ((cursor_created_at_param is null) <> (cursor_id_param is null)) then
        raise exception 'Invalid group query' using errcode = '22023';
    end if;
    return query
    select
        groups.id,
        groups.name,
        groups.description,
        groups.image_url,
        groups.created_by,
        groups.default_currency,
        groups.simplified_debts,
        groups.created_at,
        groups.updated_at,
        (select count(*) from public.group_members all_members where all_members.group_id = groups.id),
        coalesce((select sum(balances.balance) from public.get_group_balances(groups.id) balances), 0),
        memberships.role
    from public.group_members memberships
    join public.groups groups on groups.id = memberships.group_id
    where memberships.user_id = caller_id
      and (cursor_created_at_param is null or (groups.created_at, groups.id) < (cursor_created_at_param, cursor_id_param))
    order by groups.created_at desc, groups.id desc
    limit limit_param + 1;
end;
$$;

create or replace function public.get_group_summary(group_id_param uuid)
returns table(
    id uuid,
    name text,
    description text,
    image_url text,
    created_by uuid,
    default_currency text,
    simplified_debts boolean,
    created_at timestamptz,
    updated_at timestamptz,
    member_count bigint,
    current_user_balance numeric,
    current_user_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    return query
    select
        groups.id,
        groups.name,
        groups.description,
        groups.image_url,
        groups.created_by,
        groups.default_currency,
        groups.simplified_debts,
        groups.created_at,
        groups.updated_at,
        (select count(*) from public.group_members all_members where all_members.group_id = groups.id),
        coalesce((select sum(balances.balance) from public.get_group_balances(groups.id) balances), 0),
        memberships.role
    from public.group_members memberships
    join public.groups groups on groups.id = memberships.group_id
    where memberships.user_id = caller_id and groups.id = group_id_param;
end;
$$;

create or replace function public.list_group_members(group_id_param uuid)
returns table(
    membership_id uuid,
    user_id uuid,
    role text,
    joined_at timestamptz,
    full_name text,
    email text,
    avatar_url text,
    upi_id_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null or not private.is_group_member(group_id_param, (select auth.uid())) then
        raise exception 'Group membership required' using errcode = '42501';
    end if;
    return query
    select
        members.id,
        members.user_id,
        members.role,
        members.joined_at,
        profiles.full_name,
        profiles.email,
        profiles.avatar_url,
        profiles.upi_id is not null
    from public.group_members members
    join public.profiles profiles on profiles.id = members.user_id
    where members.group_id = group_id_param
    order by case members.role when 'admin' then 0 else 1 end, profiles.full_name, members.id;
end;
$$;

revoke execute on function public.add_group_member_by_email(uuid, text) from authenticated;

create or replace function public.add_group_member_by_email(
    group_id_param uuid,
    email_param text,
    secret_param text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    member_id uuid;
    inserted_count integer;
    configured_secret text;
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    select decrypted_secret into configured_secret
    from vault.decrypted_secrets
    where name = 'expenso_auth_rate_limit_secret'
    order by created_at desc limit 1;
    if configured_secret is null or secret_param is null or char_length(secret_param) < 32
       or secret_param <> configured_secret then
        raise exception 'Member lookup authorization failed' using errcode = '42501';
    end if;

    select id into member_id from public.profiles where lower(email) = lower(trim(email_param));
    if member_id is null then raise exception 'No registered Expenso user has that email'; end if;
    insert into public.group_members(group_id, user_id, role)
    values (group_id_param, member_id, 'editor')
    on conflict (group_id, user_id) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 0 then raise exception 'This user is already a group member'; end if;
    return member_id;
end;
$$;

create or replace function public.update_group_settings(group_id_param uuid, patch_param jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    current_record public.groups%rowtype;
    next_name text;
    next_description text;
    next_simplified boolean;
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    if patch_param is null or jsonb_typeof(patch_param) <> 'object' or patch_param = '{}'::jsonb
       or patch_param - array['name', 'description', 'simplified_debts'] <> '{}'::jsonb then
        raise exception 'Invalid group patch' using errcode = '22023';
    end if;
    if patch_param ? 'name' and jsonb_typeof(patch_param -> 'name') <> 'string'
       or patch_param ? 'description' and jsonb_typeof(patch_param -> 'description') not in ('string', 'null')
       or patch_param ? 'simplified_debts' and jsonb_typeof(patch_param -> 'simplified_debts') <> 'boolean' then
        raise exception 'Invalid group patch' using errcode = '22023';
    end if;
    select * into current_record from public.groups where id = group_id_param for update;
    if not found then return null; end if;
    next_name := case when patch_param ? 'name' then patch_param ->> 'name' else current_record.name end;
    next_description := case when patch_param ? 'description' then patch_param ->> 'description' else current_record.description end;
    next_simplified := case when patch_param ? 'simplified_debts' then (patch_param ->> 'simplified_debts')::boolean else current_record.simplified_debts end;
    if next_name is null or char_length(trim(next_name)) not between 1 and 100
       or next_description is not null and char_length(next_description) > 500 then
        raise exception 'Invalid group patch' using errcode = '22023';
    end if;
    update public.groups
    set name = trim(next_name),
        description = nullif(trim(next_description), ''),
        simplified_debts = next_simplified
    where id = group_id_param;
    return group_id_param;
end;
$$;

create or replace function public.remove_group_member_safely(group_id_param uuid, member_id_param uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    caller_id uuid := (select auth.uid());
    target_role text;
    admin_count integer;
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    if member_id_param = caller_id then
        raise exception 'Transfer administration before leaving this group';
    end if;
    select role into target_role from public.group_members
    where group_id = group_id_param and user_id = member_id_param;
    if target_role is null then return true; end if;
    if target_role = 'admin' then
        select count(*) into admin_count from public.group_members
        where group_id = group_id_param and role = 'admin';
        if admin_count <= 1 then raise exception 'The sole administrator cannot be removed'; end if;
    end if;
    if private.member_has_unresolved_debt(group_id_param, member_id_param) then
        raise exception 'Settle this member''s balances before removing them';
    end if;
    delete from public.group_members where group_id = group_id_param and user_id = member_id_param;
    return true;
end;
$$;

create or replace function public.delete_group_safely(group_id_param uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    if exists (select 1 from public.settlements where group_id = group_id_param and status = 'pending_confirmation') then
        raise exception 'Resolve pending settlements before deleting this group';
    end if;
    if exists (select 1 from public.group_expenses where group_id = group_id_param)
       or exists (select 1 from public.settlements where group_id = group_id_param) then
        raise exception 'Groups with financial history are retained for audit and cannot be deleted';
    end if;
    delete from public.groups where id = group_id_param;
    return true;
end;
$$;

create or replace function public.can_delete_group_safely(group_id_param uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
    if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_admin(group_id_param, caller_id) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    if exists (select 1 from public.settlements where group_id = group_id_param and status = 'pending_confirmation') then
        raise exception 'Resolve pending settlements before deleting this group';
    end if;
    if exists (select 1 from public.group_expenses where group_id = group_id_param)
       or exists (select 1 from public.settlements where group_id = group_id_param) then
        raise exception 'Groups with financial history are retained for audit and cannot be deleted';
    end if;
    return true;
end;
$$;

create or replace function public.attach_group_image(
    group_id_param uuid,
    path_param text,
    public_url_param text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0));
    if not private.is_group_admin(group_id_param, (select auth.uid())) then
        raise exception 'Group administrator permission required' using errcode = '42501';
    end if;
    if path_param !~ ('^' || group_id_param::text || '/cover-[0-9a-f-]{36}\.(jpg|png|webp)$')
       or public_url_param is null or char_length(public_url_param) > 2048 then
        raise exception 'Invalid group image' using errcode = '22023';
    end if;
    update public.groups set image_url = public_url_param where id = group_id_param;
    if not found then return null; end if;
    return group_id_param;
end;
$$;

drop policy if exists group_images_select_member on storage.objects;
drop policy if exists group_images_insert_admin on storage.objects;
drop policy if exists group_images_update_admin on storage.objects;
drop policy if exists group_images_delete_admin on storage.objects;

create policy group_images_select_member on storage.objects for select to authenticated
using (
    bucket_id = 'group-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.is_group_member((storage.foldername(name))[1]::uuid, (select auth.uid()))
);
create policy group_images_insert_admin on storage.objects for insert to authenticated
with check (
    bucket_id = 'group-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.is_group_admin((storage.foldername(name))[1]::uuid, (select auth.uid()))
    and name ~ ('^' || (storage.foldername(name))[1] || '/cover-[0-9a-f-]{36}\.(jpg|png|webp)$')
);
create policy group_images_update_admin on storage.objects for update to authenticated
using (
    bucket_id = 'group-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.is_group_admin((storage.foldername(name))[1]::uuid, (select auth.uid()))
)
with check (
    bucket_id = 'group-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.is_group_admin((storage.foldername(name))[1]::uuid, (select auth.uid()))
);
create policy group_images_delete_admin on storage.objects for delete to authenticated
using (
    bucket_id = 'group-images'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and private.is_group_admin((storage.foldername(name))[1]::uuid, (select auth.uid()))
);

revoke all on function public.list_group_summaries(timestamptz, uuid, integer) from public;
revoke all on function public.get_group_summary(uuid) from public;
revoke all on function public.list_group_members(uuid) from public;
revoke all on function public.update_group_settings(uuid, jsonb) from public;
revoke all on function public.attach_group_image(uuid, text, text) from public;
revoke all on function public.add_group_member_by_email(uuid, text, text) from public;
revoke all on function public.check_group_member_lookup_rate_limit(text) from public;
grant execute on function public.list_group_summaries(timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_group_summary(uuid) to authenticated;
grant execute on function public.list_group_members(uuid) to authenticated;
grant execute on function public.update_group_settings(uuid, jsonb) to authenticated;
grant execute on function public.attach_group_image(uuid, text, text) to authenticated;
grant execute on function public.add_group_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.check_group_member_lookup_rate_limit(text) to authenticated;


-- MIGRATION: 20260814040000_shared_expenses_api.sql
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


-- MIGRATION: 20260814050000_settlements_web_api.sql
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


-- MIGRATION: 20260814051000_notifications_web_push.sql
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


-- RATE LIMIT VAULT SECRET
select vault.create_secret('whzdIYsZg75VtmOeVLIs5cBf1ASPou79', 'expenso_auth_rate_limit_secret');
