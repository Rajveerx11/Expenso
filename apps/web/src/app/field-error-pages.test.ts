import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('server field-error form wiring', () => {
  it('maps personal expense errors, including its wrapped amount control', () => {
    const source = page('src/app/(dashboard)/expenses/new/page.tsx');

    expect(source).toContain("fieldErrorFor(fieldErrors, 'amount')");
    expect(source).toContain('messageId="personal-expense-amount" error={amountError}');
    expect(source).toContain('aria-invalid={Boolean(amountError)}');
    expect(source).toContain("aria-describedby={amountError ? 'personal-expense-amount-error' : undefined}");
    expect(source).toContain('<FormField label="Title" error={titleError}');
    expect(source).toContain('<FormField label="Note" error={noteError}>');
    expect(source).toContain('setError(messageForError(requestError))');
    expect(source).toContain('focusFirstInvalidField(formRef.current)');
  });

  it('maps multi-field group expense errors and the wrapped total amount', () => {
    const source = page('src/app/(dashboard)/groups/[groupId]/expenses/new/page.tsx');

    expect(source).toContain("fieldErrorFor(fieldErrors, 'totalAmount', 'amount')");
    expect(source).toContain('messageId="group-expense-amount" error={amountError}');
    expect(source).toContain("aria-describedby={amountError ? 'group-expense-amount-error' : undefined}");
    expect(source).toContain('<FormField label="Paid By" error={paidByError}>');
    expect(source).toContain('<FormField label="Split Type" error={splitTypeError}>');
    expect(source).toContain('<FormField label="Split Details" error={splitsError}>');
    expect(source).toContain('setFieldErrors({ [result.field]: [result.error] })');
    expect(source).toContain('setError(messageForError(requestError))');
    expect(source).toContain('focusFirstInvalidField(formRef.current)');
  });

  it('maps profile name and UPI errors while retaining the global summary', () => {
    const source = page('src/app/(dashboard)/profile/edit/page.tsx');

    expect(source).toContain("fieldErrorFor(fieldErrors, 'fullName')");
    expect(source).toContain("fieldErrorFor(fieldErrors, 'upiId')");
    expect(source).toContain('<FormField label="Full Name" error={fullNameError}');
    expect(source).toContain('<FormField label="UPI ID" error={upiIdError}');
    expect(source).toContain('setError(messageForError(requestError))');
    expect(source).toContain('focusFirstInvalidField(formRef.current)');
  });
});
