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
