import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), '../../supabase/migrations/20260814030000_groups_members_api.sql'), 'utf8').toLowerCase();

describe('groups database contract', () => {
  it('revokes direct mutations and exposes session-derived commands', () => {
    expect(migration).toContain('revoke insert, update, delete on public.groups from authenticated');
    expect(migration).toContain('revoke insert, update, delete on public.group_members from authenticated');
    expect(migration).toContain('caller_id uuid := (select auth.uid())');
    expect(migration).not.toContain('service_role');
    expect(migration).toContain('check_group_member_lookup_rate_limit');
    expect(migration).toContain('expenso_auth_rate_limit_secret');
    expect(migration).toContain('perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0))');
  });

  it('validates direct RPC JSON types before PostgreSQL casts', () => {
    expect(migration).toContain("jsonb_typeof(patch_param -> 'name') <> 'string'");
    expect(migration).toContain("jsonb_typeof(patch_param -> 'simplified_debts') <> 'boolean'");
  });

  it('uses narrow member/group read models without financial profile fields', () => {
    expect(migration).toContain('list_group_summaries');
    expect(migration).toContain('list_group_members');
    expect(migration).toContain('upi_id is not null');
    expect(migration).not.toContain('profiles.total_income');
    expect(migration).not.toContain('profiles.total_balance');
  });

  it('hardens group image paths to admin-owned folders', () => {
    expect(migration).toContain("bucket_id = 'group-images'");
    expect(migration).toContain("/cover-[0-9a-f-]{36}");
    expect(migration).toContain('private.is_group_admin((storage.foldername(name))[1]::uuid');
  });
});
