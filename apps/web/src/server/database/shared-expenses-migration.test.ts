import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260814040000_shared_expenses_api.sql'),
  'utf8',
).toLowerCase();

describe('shared expenses database contract', () => {
  it('recomputes all supported split modes in integer cents', () => {
    expect(migration).toContain("split_type_param not in ('equal', 'exact', 'percentage')");
    expect(migration).toContain('or splits_param is null');
    expect(migration).toContain('total_cents / participant_count');
    expect(migration).toContain('remainder_units desc, user_id');
    expect(migration).toContain("percentage splits must total exactly 100");
    expect(migration).toContain("jsonb_typeof(item -> 'value') is distinct from 'string'");
    expect(migration).toContain('computed splits do not equal the expense total');
  });

  it('checks membership after locks and serializes balance changes', () => {
    const membershipLock = migration.indexOf('perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0))');
    const membershipCheck = migration.indexOf('if not private.is_group_member(group_id_param, caller_id)', membershipLock);
    const balanceLock = migration.indexOf('perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1))', membershipCheck);
    expect(membershipLock).toBeGreaterThan(0);
    expect(membershipCheck).toBeGreaterThan(membershipLock);
    expect(balanceLock).toBeGreaterThan(membershipCheck);
    const settlementFunction = migration.indexOf('create or replace function public.create_settlement(');
    const settlementMembershipLock = migration.indexOf(
      'perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0))',
      settlementFunction,
    );
    const settlementMembershipCheck = migration.indexOf(
      'if not private.is_group_member(group_id_param, caller_id)',
      settlementMembershipLock,
    );
    const settlementBalanceLock = migration.indexOf(
      'perform pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1))',
      settlementMembershipCheck,
    );
    expect(settlementMembershipLock).toBeGreaterThan(settlementFunction);
    expect(settlementMembershipCheck).toBeGreaterThan(settlementMembershipLock);
    expect(settlementBalanceLock).toBeGreaterThan(settlementMembershipCheck);
  });

  it('stores replay responses privately and revokes browser-trusted legacy RPCs', () => {
    expect(migration).toContain("scope = 'group-expense:create'");
    expect(migration).toContain('stored_record.request_hash <> computed_request_hash');
    expect(migration).toContain('computed_request_hash := encode(extensions.digest(');
    expect(migration).not.toContain('request_hash_param');
    expect(migration).toContain('revoke execute on function public.create_group_expense');
    expect(migration).toContain('revoke execute on function public.delete_group_expense');
  });

  it('returns narrow detail and balance models', () => {
    expect(migration).toContain('get_group_expense_web');
    expect(migration).toContain('list_group_balances_web');
    expect(migration).toContain("case when balances.balance < 0 then profiles.upi_id else null end");
    expect(migration).not.toContain('profiles.total_income');
    expect(migration).not.toContain('profiles.total_balance');
  });
});
