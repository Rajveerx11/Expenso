import { describe, expect, it, vi } from 'vitest';
import { buildPersonalExpenseInput } from '@/features/personal-expenses/domain';
import { buildSharedExpenseInput, type SharedExpenseDraft } from '@/features/shared-expenses/domain';
import { createSubmissionKeyManager } from './submission-key';

const memberA = '00000000-0000-4000-8000-000000000001';
const memberB = '00000000-0000-4000-8000-000000000002';

describe('expense submission idempotency', () => {
  it('derives both create-page keys from the submitted body', () => {
    const pages = [
      'src/app/(dashboard)/expenses/new/page.tsx',
      'src/app/(dashboard)/groups/[groupId]/expenses/new/page.tsx',
    ].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'));

    for (const source of pages) {
      expect(source).toContain('keyManager.current.forSubmission(input)');
      expect(source).not.toContain('idempotencyKey.current');
    }
  });

  it('reuses a personal-expense key after a lost response and rotates after an edit', () => {
    const factory = vi.fn().mockReturnValueOnce('personal-1').mockReturnValueOnce('personal-2');
    const manager = createSubmissionKeyManager(factory);
    const original = buildPersonalExpenseInput({
      type: 'expense', amount: '001.2', title: ' Dinner ', category: 'Food',
      expenseDate: '2026-08-14', note: ' team ',
    });

    expect(original).toMatchObject({ amount: '1.20', title: 'Dinner', note: 'team' });
    expect(manager.forSubmission(original)).toBe('personal-1');
    expect(manager.forSubmission({ ...original })).toBe('personal-1');
    expect(manager.forSubmission({ ...original, amount: '2.00' })).toBe('personal-2');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('reuses a group-expense key after a lost response and rotates after an edit', () => {
    const factory = vi.fn().mockReturnValueOnce('group-1').mockReturnValueOnce('group-2');
    const manager = createSubmissionKeyManager(factory);
    const draft: SharedExpenseDraft = {
      paidBy: memberA,
      title: 'Dinner',
      totalAmount: '100',
      category: 'Food',
      expenseDate: '2026-08-14',
      note: '',
      splitType: 'equal',
      memberIds: [memberA, memberB],
      selectedMemberIds: [memberA, memberB],
      exactAmounts: {},
      percentages: {},
    };
    const original = buildSharedExpenseInput(draft);
    const edited = buildSharedExpenseInput({ ...draft, title: 'Lunch' });
    if (!original.input || !edited.input) throw new Error('Expected valid expense inputs.');

    expect(manager.forSubmission(original.input)).toBe('group-1');
    expect(manager.forSubmission({ ...original.input })).toBe('group-1');
    expect(manager.forSubmission(edited.input)).toBe('group-2');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('ignores object property order but preserves array order like canonical backend JSON', () => {
    const factory = vi.fn().mockReturnValueOnce('key-1').mockReturnValueOnce('key-2');
    const manager = createSubmissionKeyManager(factory);

    expect(manager.forSubmission({ amount: '10.00', splits: [{ userId: memberA }, { userId: memberB }] })).toBe('key-1');
    expect(manager.forSubmission({ splits: [{ userId: memberA }, { userId: memberB }], amount: '10.00' })).toBe('key-1');
    expect(manager.forSubmission({ amount: '10.00', splits: [{ userId: memberB }, { userId: memberA }] })).toBe('key-2');
  });
});
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
