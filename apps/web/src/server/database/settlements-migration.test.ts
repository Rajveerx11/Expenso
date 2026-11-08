import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260814050000_settlements_web_api.sql'),
  'utf8',
).toLowerCase();

describe('settlement database contract', () => {
  it('derives identity and the idempotency digest inside the database', () => {
    expect(migration).toContain('caller_id uuid := (select auth.uid())');
    expect(migration).toContain('computed_request_hash := encode(extensions.digest(');
    expect(migration).not.toContain('request_hash_param');
    expect(migration).toContain("scope = 'settlement:create'");
    expect(migration).toContain('idempotency_key_reused');
  });

  it('uses the global group lock order and rechecks the balance snapshot', () => {
    const create = migration.indexOf('create or replace function public.create_group_settlement_web(');
    const membershipLock = migration.indexOf("pg_advisory_xact_lock(hashtextextended(group_id_param::text, 0))", create);
    const membershipCheck = migration.indexOf('private.is_group_member(group_id_param, caller_id)', membershipLock);
    const balanceLock = migration.indexOf("pg_advisory_xact_lock(hashtextextended(group_id_param::text, 1))", membershipCheck);
    expect(membershipLock).toBeGreaterThan(create);
    expect(membershipCheck).toBeGreaterThan(membershipLock);
    expect(balanceLock).toBeGreaterThan(membershipCheck);
    expect(migration).toContain('current_outstanding <> settlement_record.outstanding_amount_at_creation');
    expect(migration).toContain("raise exception 'settlement_changed'");
  });

  it('keeps confirmation receiver-only, terminal, and oldest-first', () => {
    expect(migration).toContain("if settlement_record.receiver_id <> caller_id then");
    expect(migration).toContain("if settlement_record.status <> 'pending_confirmation' then");
    expect(migration).toContain('order by expenses.expense_date, expenses.created_at, splits.id');
    expect(migration).toContain("set status = 'confirmed', confirmed_at = now()");
    expect(migration).toContain("set status = 'rejected'");
  });

  it('removes raw confirmation secrets and legacy mutation RPCs from browser roles', () => {
    expect(migration).toContain('revoke select on public.settlements from anon, authenticated');
    expect(migration).toContain('revoke select on public.payment_confirmations from anon, authenticated');
    expect(migration).toContain('revoke all on function public.create_settlement(uuid, uuid, numeric, text)');
    expect(migration).toContain('revoke all on function public.confirm_settlement(uuid, uuid)');
    expect(migration).toContain('revoke all on function public.reject_settlement(uuid)');
  });
});
