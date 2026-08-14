import { describe, expect, it } from 'vitest';
import { buildSharedExpenseInput, positiveMoneyCents, type SharedExpenseDraft } from './domain';

const memberA = '00000000-0000-4000-8000-000000000001';
const memberB = '00000000-0000-4000-8000-000000000002';

function draft(patch: Partial<SharedExpenseDraft> = {}): SharedExpenseDraft {
  return {
    paidBy: memberA,
    title: 'Dinner',
    totalAmount: '100.00',
    category: 'Food',
    expenseDate: '2026-08-14',
    note: '',
    splitType: 'equal',
    memberIds: [memberA, memberB],
    selectedMemberIds: [memberA, memberB],
    exactAmounts: {},
    percentages: {},
    ...patch,
  };
}

describe('shared expense draft', () => {
  it('parses money exactly in cents and rejects exponent, zero, and excess precision', () => {
    expect(positiveMoneyCents('0001.2')).toBe(120);
    expect(positiveMoneyCents('0')).toBeNull();
    expect(positiveMoneyCents('1e2')).toBeNull();
    expect(positiveMoneyCents('1.001')).toBeNull();
  });

  it('requires at least one equal-share member', () => {
    expect(buildSharedExpenseInput(draft({ selectedMemberIds: [] }))).toMatchObject({ input: null, error: expect.stringContaining('at least one'), field: 'splits' });
  });

  it('targets invalid amount errors at totalAmount', () => {
    expect(buildSharedExpenseInput(draft({ totalAmount: 'not-money' }))).toEqual({
      input: null,
      error: 'Enter a valid amount greater than zero.',
      field: 'totalAmount',
    });
  });

  it('targets whitespace-only title errors at title', () => {
    expect(buildSharedExpenseInput(draft({ title: '   ' }))).toEqual({
      input: null,
      error: 'Title is required.',
      field: 'title',
    });
  });

  it('accepts exact shares only when cents total matches', () => {
    expect(buildSharedExpenseInput(draft({
      splitType: 'exact', exactAmounts: { [memberA]: '33.33', [memberB]: '66.67' },
    }))).toMatchObject({ input: { splitType: 'exact', totalAmount: '100.00' }, error: null });
    expect(buildSharedExpenseInput(draft({
      splitType: 'exact', exactAmounts: { [memberA]: '33.33', [memberB]: '66.66' },
    }))).toMatchObject({ input: null, error: expect.stringContaining('must total') });
  });

  it('requires positive percentage shares totaling exactly 100.0000', () => {
    expect(buildSharedExpenseInput(draft({
      splitType: 'percentage', percentages: { [memberA]: '33.3333', [memberB]: '66.6667' },
    }))).toMatchObject({ input: { splitType: 'percentage' }, error: null });
    expect(buildSharedExpenseInput(draft({
      splitType: 'percentage', percentages: { [memberA]: '0', [memberB]: '100.0001' },
    }))).toMatchObject({ input: null, error: expect.stringContaining('exactly 100%') });
  });
});
