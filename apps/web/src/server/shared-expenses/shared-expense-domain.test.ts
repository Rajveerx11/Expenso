import { describe, expect, it } from 'vitest';
import { groupExpenseCreateSchema } from '@/shared/api/contracts';
import {
  computeGroupSplits,
  databaseSplitInputs,
} from './shared-expense-domain';

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
];
const base = {
  paidBy: ids[0], title: 'Dinner', totalAmount: '100.00', category: 'Food' as const,
  note: null, expenseDate: '2026-08-14',
};

describe('shared expense split domain', () => {
  it('allocates indivisible equal cents by sorted UUID and ignores browser previews', () => {
    const input = groupExpenseCreateSchema.parse({
      ...base,
      splitType: 'equal',
      splits: [
        { userId: ids[2], owedAmount: '1.00' },
        { userId: ids[0], owedAmount: '98.00' },
        { userId: ids[1], owedAmount: '1.00' },
      ],
    });
    expect(computeGroupSplits(input)).toEqual([
      { userId: ids[0], owedAmount: '33.34' },
      { userId: ids[1], owedAmount: '33.33' },
      { userId: ids[2], owedAmount: '33.33' },
    ]);
    expect(databaseSplitInputs(input)).toEqual(ids.map((user_id) => ({ user_id })));
  });

  it('validates exact totals and percentage totals', () => {
    const exact = groupExpenseCreateSchema.parse({
      ...base,
      splitType: 'exact',
      splits: [{ userId: ids[0], owedAmount: '60' }, { userId: ids[1], owedAmount: '40' }],
    });
    expect(computeGroupSplits(exact).map((split) => split.owedAmount)).toEqual(['60.00', '40.00']);
    const badExact = groupExpenseCreateSchema.parse({
      ...base,
      splitType: 'exact',
      splits: [{ userId: ids[0], owedAmount: '99.99' }],
    });
    expect(() => computeGroupSplits(badExact)).toThrow('Some request fields are invalid.');

    const badPercentage = groupExpenseCreateSchema.parse({
      ...base,
      splitType: 'percentage',
      splits: [{ userId: ids[0], percentage: '50' }, { userId: ids[1], percentage: '49.9999' }],
    });
    expect(() => computeGroupSplits(badPercentage)).toThrow('Some request fields are invalid.');
  });

  it('uses largest remainder for percentage cents with deterministic ties', () => {
    const input = groupExpenseCreateSchema.parse({
      ...base,
      totalAmount: '0.01',
      splitType: 'percentage',
      splits: [{ userId: ids[1], percentage: '50' }, { userId: ids[0], percentage: '50' }],
    });
    expect(computeGroupSplits(input)).toEqual([
      { userId: ids[0], owedAmount: '0.01' },
      { userId: ids[1], owedAmount: '0.00' },
    ]);
  });

});
