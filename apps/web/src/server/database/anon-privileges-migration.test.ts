import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260815011000_harden_anon_schema_privileges.sql'),
  'utf8',
).toLowerCase();

describe('anonymous schema privilege hardening', () => {
  it('removes direct anon grants from Expenso functions and tables', () => {
    expect(migration).toContain("namespace.nspname = 'public'");
    expect(migration).toContain('revoke execute on function %s from anon');
    expect(migration).toContain('revoke all privileges on table');
    expect(migration).toContain('public.personal_expenses');
    expect(migration).toContain('public.web_push_subscriptions');
  });

  it('restores only the secret-protected pre-auth RPC grant', () => {
    const anonGrants = migration.match(/grant execute on function[^;]+to anon;/g) ?? [];

    expect(anonGrants).toHaveLength(1);
    expect(migration).toContain('public.check_auth_rate_limit(text, text, text) to anon');
  });
});
