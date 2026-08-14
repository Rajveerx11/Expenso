import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260814010000_web_backend_foundation.sql'),
  'utf8',
).toLowerCase();

describe('web foundation migration', () => {
  it('keeps profile validation and avatar policies in the reviewed migration', () => {
    expect(migration).toContain('profiles_upi_id_format');
    expect(migration).toContain('profiles_avatar_url_length');
    expect(migration).toContain('create policy avatars_insert_own');
    expect(migration).toContain("bucket_id = 'avatars'");
    expect(migration).toContain('(select auth.uid())');
    expect(migration).toContain('create policy profiles_select_own');
    expect(migration).toContain('get_group_member_directory');
    expect(migration).not.toContain('create policy profiles_select_related');
  });

  it('uses explicit authenticated grants and never grants profile access to anon', () => {
    expect(migration).toContain('grant select on public.profiles to authenticated');
    expect(migration).not.toMatch(/grant[^;]+public\.profiles[^;]+to anon/);
    expect(migration).not.toContain('service_role');
  });

  it('keeps durable pre-auth rate limiting private and narrowly callable', () => {
    expect(migration).toContain('create table if not exists private.auth_rate_limits');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('check_auth_rate_limit');
    expect(migration).toContain('expenso_auth_rate_limit_secret');
    expect(migration).toContain('vault.decrypted_secrets');
    expect(migration).toContain("updated_at < now() - interval '2 hours'");
    expect(migration).toContain('>= 100000');
    expect(migration).toContain('to anon, authenticated');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
  });
});
