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
