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
