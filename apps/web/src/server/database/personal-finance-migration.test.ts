import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260814020000_personal_finance_api.sql'),
  'utf8',
).toLowerCase();
const hardeningMigration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260814024541_personal_idempotency_hardening.sql'),
  'utf8',
).toLowerCase();

describe('personal finance database contract', () => {
  it('keeps mutations atomic with aggregate recalculation and linked-row protection', () => {
    expect(migration).toContain('create_personal_expense');
    expect(migration).toContain('update_personal_expense');
    expect(migration).toContain('delete_personal_expense');
    expect(migration).toContain('private.recalculate_profile_balance(caller_id)');
    expect(migration).toContain("'expenso:personal-ledger:' || user_id_param::text");
    expect(migration).toContain('referencing new table as new_personal_rows');
    expect(migration).toContain('select distinct user_id from new_personal_rows order by user_id');
    expect(migration).toContain('select distinct user_id from old_personal_rows order by user_id');
    expect(migration.match(/linked_transaction_read_only/g)).toHaveLength(2);
  });

  it('keeps idempotency data private and detects mismatched replays', () => {
    expect(migration).toContain('private.api_idempotency_keys');
    expect(migration).toContain('idempotency_key_reused');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('revoke all on private.api_idempotency_keys from public, anon, authenticated');
    expect(hardeningMigration).toContain("computed_request_hash := encode(extensions.digest(");
    expect(hardeningMigration).toContain('constraint personal_expenses_amount_finite');
    expect(hardeningMigration).toContain(
      'revoke all on function public.create_personal_expense(text, numeric, text, text, text, date, text, text)',
    );
    expect(hardeningMigration).toContain(
      'grant execute on function public.create_personal_expense(text, numeric, text, text, text, date, text)',
    );
  });

  it('uses session ownership and deterministic keyset ordering', () => {
    expect(migration).toContain('caller_id uuid := (select auth.uid())');
    expect(migration).toContain('(pe.expense_date, pe.created_at, pe.id)');
    expect(migration).toContain('order by pe.expense_date desc, pe.created_at desc, pe.id desc');
    expect(migration).not.toContain('service_role');
  });

  it('prevents direct mutation bypass and constrains canonical categories', () => {
    expect(migration).toContain('revoke insert, update, delete on public.personal_expenses from authenticated');
    expect(migration).toContain('personal_expenses_category_allowed');
    expect(migration).toContain("'food', 'transport', 'shopping', 'entertainment'");
  });
});
