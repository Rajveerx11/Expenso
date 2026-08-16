-- Keep the marker versioned and last so application readiness proves that the
-- complete schema and privilege-hardening chain reached this project.
drop function if exists public.expenso_backend_ready();

create or replace function public.expenso_backend_ready_20260815012000()
returns boolean
language sql
immutable
set search_path = ''
as $$
    select true;
$$;

revoke all on function public.expenso_backend_ready_20260815012000()
from public, anon, authenticated;
grant execute on function public.expenso_backend_ready_20260815012000()
to anon, authenticated, service_role;
