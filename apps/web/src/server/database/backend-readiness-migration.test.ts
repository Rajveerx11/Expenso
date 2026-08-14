import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backfillMigration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260815010000_backend_readiness_and_profile_backfill.sql'),
  'utf8',
).toLowerCase();
const readinessMigration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260815012000_finalize_backend_readiness.sql'),
  'utf8',
).toLowerCase();

describe('backend readiness migration', () => {
  it('repairs existing Auth users in an earlier migration', () => {
    expect(backfillMigration).toContain('insert into public.profiles');
    expect(backfillMigration).toContain('from auth.users as auth_user');
    expect(backfillMigration).toContain('on conflict do nothing');
    expect(backfillMigration).not.toContain('expenso_backend_ready');
  });

  it('installs a versioned readiness marker only in the final migration', () => {
    expect(readinessMigration).toContain('returns boolean');
    expect(readinessMigration).toContain('select true;');
    expect(readinessMigration).toContain('public.expenso_backend_ready_20260815012000()');
    expect(readinessMigration).toContain(
      'grant execute on function public.expenso_backend_ready_20260815012000()',
    );
    expect(readinessMigration).toContain('to anon, authenticated, service_role');
  });
});
