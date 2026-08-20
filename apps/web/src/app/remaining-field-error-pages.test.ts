import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('remaining mutation field-error wiring', () => {
  it.each([
    ['signup', 'src/app/(auth)/signup/page.tsx'],
    ['onboarding', 'src/app/onboarding/page.tsx'],
    ['personal edit', 'src/app/(dashboard)/expenses/[expenseId]/page.tsx'],
    ['group create', 'src/app/(dashboard)/groups/new/page.tsx'],
    ['group settings', 'src/app/(dashboard)/groups/[groupId]/settings/page.tsx'],
    ['add member', 'src/app/(dashboard)/groups/[groupId]/page.tsx'],
    ['settlement submission', 'src/app/(dashboard)/groups/[groupId]/settle/[receiverId]/page.tsx'],
  ])('%s maps API fields and focuses the first invalid control', (_label, path) => {
    const page = source(path);
    expect(page).toContain('fieldErrorsFor(');
    expect(page).toContain('fieldErrorFor(');
    expect(page).toContain('focusFirstInvalidField(');
    expect(page).toMatch(/aria-invalid|error=\{Boolean\(/);
  });

  it('links manually rendered member and settlement errors to their controls', () => {
    const member = source('src/app/(dashboard)/groups/[groupId]/page.tsx');
    const settlement = source('src/app/(dashboard)/groups/[groupId]/settle/[receiverId]/page.tsx');

    expect(member).toContain("aria-describedby={memberEmailError ? 'new-member-email-error' : undefined}");
    expect(member).toContain("id={memberEmailError ? 'new-member-email-error' : undefined}");
    expect(settlement).toContain("fieldErrorFor(serverErrors, 'amount')");
    expect(settlement).toContain("fieldErrorFor(serverErrors, 'transactionRef')");
    expect(settlement).toContain("setStep('input')");
  });

  it('creates a claim only after explicit UPI completion acknowledgement', () => {
    const settlement = source('src/app/(dashboard)/groups/[groupId]/settle/[receiverId]/page.tsx');

    expect(settlement).toContain('async function confirmUpiCompletion()');
    expect(settlement).toContain('await submitClaim(true)');
    expect(settlement).toContain('must confirm receipt before balances change');
  });
});
