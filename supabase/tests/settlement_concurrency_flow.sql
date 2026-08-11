create extension if not exists dblink;

select plan(4);

delete from public.settlements where group_id = '20000000-0000-0000-0000-000000000010';
delete from public.expense_splits where expense_id in (
    select id from public.group_expenses where group_id = '20000000-0000-0000-0000-000000000010'
);
delete from public.group_expenses where group_id = '20000000-0000-0000-0000-000000000010';
delete from public.group_members where group_id = '20000000-0000-0000-0000-000000000010';
delete from public.groups where id = '20000000-0000-0000-0000-000000000010';
delete from auth.users where id in (
    '10000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000011'
);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('10000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'concurrent-payer@test.local', '', now(), '{"full_name":"Concurrent payer"}', now(), now()),
    ('10000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'concurrent-receiver@test.local', '', now(), '{"full_name":"Concurrent receiver"}', now(), now());
insert into public.groups(id, name, created_by)
values ('20000000-0000-0000-0000-000000000010', 'Concurrent settlement test', '10000000-0000-0000-0000-000000000011');
insert into public.group_members(group_id, user_id, role)
values
    ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'editor'),
    ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000011', 'admin');
insert into public.group_expenses(id, group_id, paid_by, title, total_amount, category, split_type, expense_date)
values ('30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000011', 'Original debt', 10, 'Other', 'exact', current_date);
insert into public.expense_splits(expense_id, user_id, owed_amount)
values ('30000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 10);

do $$
begin
    perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000010', false);
    perform public.create_settlement(
        '20000000-0000-0000-0000-000000000010',
        '10000000-0000-0000-0000-000000000011',
        10,
        'concurrent-settlement'
    );
end;
$$;

create or replace function public.issue6_wait_for_expense_lock()
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    attempt integer;
begin
    for attempt in 1..100 loop
        if exists (
            select 1
            from pg_catalog.pg_locks as locks
            join pg_catalog.pg_stat_activity as activity on activity.pid = locks.pid
            where activity.application_name = 'issue6_expense_session'
              and locks.locktype = 'advisory'
              and locks.granted
        ) then
            return true;
        end if;
        perform pg_catalog.pg_sleep(0.02);
    end loop;
    return false;
end;
$$;

create or replace function public.issue6_confirm_result(settlement_id_param uuid)
returns text
language plpgsql
set search_path = ''
as $$
begin
    perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000011', true);
    perform public.confirm_settlement(
        settlement_id_param,
        '10000000-0000-0000-0000-000000000011'
    );
    return 'confirmed';
exception when others then
    return sqlstate || ':' || sqlerrm;
end;
$$;

do $$
declare
    connection_string text := format(
        'dbname=%L application_name=%L',
        current_database(),
        'issue6_expense_session'
    );
begin
    perform dblink_connect('issue6_expense', connection_string);
    perform dblink_connect(
        'issue6_confirm',
        format('dbname=%L application_name=%L', current_database(), 'issue6_confirm_session')
    );
    perform dblink_send_query(
        'issue6_expense',
        $query$
            with configured as materialized (
                select set_config(
                    'request.jwt.claim.sub',
                    '10000000-0000-0000-0000-000000000010',
                    true
                )
            ), mutated as materialized (
                select public.create_group_expense(
                    '20000000-0000-0000-0000-000000000010',
                    '10000000-0000-0000-0000-000000000010',
                    'Concurrent reciprocal expense',
                    10,
                    'Other',
                    'exact',
                    null,
                    current_date,
                    '[{"user_id":"10000000-0000-0000-0000-000000000011","owed_amount":10}]'::jsonb
                )
                from configured
            )
            select 'expense_committed'::text
            from mutated, lateral (select pg_sleep(1.5)) as held
        $query$
    );
end;
$$;

select ok(
    public.issue6_wait_for_expense_lock(),
    'expense mutation holds the shared group advisory lock'
);

do $$
declare
    pending_settlement_id uuid;
begin
    select id into pending_settlement_id
    from public.settlements
    where group_id = '20000000-0000-0000-0000-000000000010'
      and status = 'pending_confirmation';

    perform dblink_send_query(
        'issue6_confirm',
        format('select public.issue6_confirm_result(%L::uuid)', pending_settlement_id)
    );
    perform pg_sleep(0.2);
end;
$$;

select is(
    dblink_is_busy('issue6_confirm'),
    1,
    'confirmation blocks while the expense transaction owns the group lock'
);
select is(
    (select result from dblink_get_result('issue6_expense') as completed(result text)),
    'expense_committed',
    'the balance-changing expense commits before confirmation resumes'
);
select is(
    (select result from dblink_get_result('issue6_confirm') as completed(result text)),
    '22023:Outstanding balance changed; reject and create a new settlement',
    'confirmation resumes after the lock and observes the committed balance change'
);

do $$
begin
    perform dblink_disconnect('issue6_expense');
    perform dblink_disconnect('issue6_confirm');
end;
$$;

drop function public.issue6_confirm_result(uuid);
drop function public.issue6_wait_for_expense_lock();
delete from public.settlements where group_id = '20000000-0000-0000-0000-000000000010';
delete from public.expense_splits where expense_id in (
    select id from public.group_expenses where group_id = '20000000-0000-0000-0000-000000000010'
);
delete from public.group_expenses where group_id = '20000000-0000-0000-0000-000000000010';
delete from public.group_members where group_id = '20000000-0000-0000-0000-000000000010';
delete from public.groups where id = '20000000-0000-0000-0000-000000000010';
delete from auth.users where id in (
    '10000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000011'
);

select * from finish();
