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
