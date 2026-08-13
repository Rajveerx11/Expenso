create extension if not exists dblink;

select plan(6);

delete from auth.users where id = '14000000-0000-0000-0000-000000000099';
insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values (
    '14000000-0000-0000-0000-000000000099',
    'authenticated',
    'authenticated',
    'ledger-concurrency@test.local',
    '',
    now(),
    '{"full_name":"Concurrent Ledger"}',
    now(),
    now()
);

create or replace function public.issue3_concurrent_personal_create(
    title_param text,
    amount_param numeric,
    idempotency_key_param text,
    request_hash_param text,
    hold_seconds_param numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000099', true);
    perform * from public.create_personal_expense(
        title_param,
        amount_param,
        'Salary',
        'income',
        null,
        '2026-08-14',
        idempotency_key_param,
        request_hash_param
    );
    perform pg_sleep(hold_seconds_param);
    return 'created';
end;
$$;

do $$
declare connection_string text := format(
    'host=127.0.0.1 port=5432 dbname=%I user=postgres password=postgres',
    current_database()
);
begin
    perform dblink_connect('issue3_writer_a', connection_string);
    perform dblink_connect('issue3_writer_b', connection_string);
    perform dblink_send_query(
        'issue3_writer_a',
        $query$select public.issue3_concurrent_personal_create(
            'Concurrent income A', 100.00, 'concurrent-create-key-a', repeat('d', 64), 1.5
        )$query$
    );
    perform pg_sleep(0.2);
    perform dblink_send_query(
        'issue3_writer_b',
        $query$select public.issue3_concurrent_personal_create(
            'Concurrent income B', 200.00, 'concurrent-create-key-b', repeat('e', 64), 0
        )$query$
    );
    perform pg_sleep(0.2);
end;
$$;

select is(
    dblink_is_busy('issue3_writer_b'),
    1,
    'second recalculation waits on the same user-scoped ledger lock'
);

do $$
begin
    perform * from dblink_get_result('issue3_writer_a') as completed(result text);
    perform * from dblink_get_result('issue3_writer_b') as completed(result text);
end;
$$;

select is(
    (select total_income from public.profiles where id = '14000000-0000-0000-0000-000000000099'),
    300.00::numeric,
    'concurrent distinct writes preserve the final income aggregate'
);
select is(
    (select count(*) from public.personal_expenses where user_id = '14000000-0000-0000-0000-000000000099'),
    2::bigint,
    'both concurrent transactions commit exactly once'
);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
    ('14000000-0000-0000-0000-000000000097', 'authenticated', 'authenticated', 'group-lock-a@test.local', '', now(), '{"full_name":"Group Lock A"}', now(), now()),
    ('14000000-0000-0000-0000-000000000098', 'authenticated', 'authenticated', 'group-lock-b@test.local', '', now(), '{"full_name":"Group Lock B"}', now(), now());
insert into public.groups(id, name, created_by)
values
    ('24000000-0000-0000-0000-000000000097', 'Concurrent group A', '14000000-0000-0000-0000-000000000097'),
    ('24000000-0000-0000-0000-000000000098', 'Concurrent group B', '14000000-0000-0000-0000-000000000097');
insert into public.group_members(group_id, user_id, role)
values
    ('24000000-0000-0000-0000-000000000097', '14000000-0000-0000-0000-000000000097', 'admin'),
    ('24000000-0000-0000-0000-000000000097', '14000000-0000-0000-0000-000000000098', 'editor'),
    ('24000000-0000-0000-0000-000000000098', '14000000-0000-0000-0000-000000000097', 'admin'),
    ('24000000-0000-0000-0000-000000000098', '14000000-0000-0000-0000-000000000098', 'editor');

create or replace function public.issue3_concurrent_group_create(
    group_id_param uuid,
    title_param text,
    splits_param jsonb,
    hold_seconds_param numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000097', true);
    perform public.create_group_expense(
        group_id_param,
        '14000000-0000-0000-0000-000000000097',
        title_param,
        2.00,
        'Other',
        'exact',
        null,
        '2026-08-14',
        splits_param
    );
    perform pg_sleep(hold_seconds_param);
    return 'created';
end;
$$;

do $$
begin
    perform dblink_send_query(
        'issue3_writer_a',
        $query$select public.issue3_concurrent_group_create(
            '24000000-0000-0000-0000-000000000097',
            'Opposing order A',
            '[{"user_id":"14000000-0000-0000-0000-000000000097","owed_amount":1},{"user_id":"14000000-0000-0000-0000-000000000098","owed_amount":1}]'::jsonb,
            1.5
        )$query$
    );
    perform pg_sleep(0.2);
    perform dblink_send_query(
        'issue3_writer_b',
        $query$select public.issue3_concurrent_group_create(
            '24000000-0000-0000-0000-000000000098',
            'Opposing order B',
            '[{"user_id":"14000000-0000-0000-0000-000000000098","owed_amount":1},{"user_id":"14000000-0000-0000-0000-000000000097","owed_amount":1}]'::jsonb,
            0
        )$query$
    );
    perform pg_sleep(0.2);
end;
$$;

select is(
    dblink_is_busy('issue3_writer_b'),
    1,
    'opposing-order group mutation waits without owning a reversed user lock'
);

do $$
begin
    perform * from dblink_get_result('issue3_writer_a') as completed(result text);
    perform * from dblink_get_result('issue3_writer_b') as completed(result text);
end;
$$;

select is(
    (select array_agg(total_balance order by id) from public.profiles where id in (
        '14000000-0000-0000-0000-000000000097',
        '14000000-0000-0000-0000-000000000098'
    )),
    array[-2.00::numeric, -2.00::numeric],
    'opposing-order group writes finish with correct aggregates for both users'
);
select is(
    (select count(*) from public.personal_expenses where user_id in (
        '14000000-0000-0000-0000-000000000097',
        '14000000-0000-0000-0000-000000000098'
    )),
    4::bigint,
    'both opposing-order group expenses commit without deadlock'
);

do $$
begin
    perform dblink_disconnect('issue3_writer_a');
    perform dblink_disconnect('issue3_writer_b');
end;
$$;
drop function public.issue3_concurrent_personal_create(text, numeric, text, text, numeric);
drop function public.issue3_concurrent_group_create(uuid, text, jsonb, numeric);
delete from auth.users where id = '14000000-0000-0000-0000-000000000099';
delete from public.group_expenses where group_id in (
    '24000000-0000-0000-0000-000000000097',
    '24000000-0000-0000-0000-000000000098'
);
delete from public.group_members where group_id in (
    '24000000-0000-0000-0000-000000000097',
    '24000000-0000-0000-0000-000000000098'
);
delete from public.groups where id in (
    '24000000-0000-0000-0000-000000000097',
    '24000000-0000-0000-0000-000000000098'
);
delete from auth.users where id in (
    '14000000-0000-0000-0000-000000000097',
    '14000000-0000-0000-0000-000000000098'
);

select * from finish();
