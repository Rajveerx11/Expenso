-- Repair projects where Auth users existed before the Expenso schema was deployed.
insert into public.profiles(id, email, full_name, avatar_url)
select
    auth_user.id,
    coalesce(auth_user.email, auth_user.id::text || '@unknown.invalid'),
    left(
        coalesce(
            nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
            nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
            split_part(coalesce(auth_user.email, auth_user.id::text), '@', 1)
        ),
        100
    ),
    case
        when char_length(auth_user.raw_user_meta_data ->> 'avatar_url') <= 2048
            then auth_user.raw_user_meta_data ->> 'avatar_url'
        else null
    end
from auth.users as auth_user
on conflict do nothing;
