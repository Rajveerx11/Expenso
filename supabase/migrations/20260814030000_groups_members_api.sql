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
