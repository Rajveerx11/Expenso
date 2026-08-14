import type { GroupExpenseInput } from '@/lib/api/client';
import { formatMoney } from '@/lib/utils';

export interface SharedExpenseDraft {
  paidBy: string;
  title: string;
  totalAmount: string;
  category: string;
  expenseDate: string;
  note: string;
  splitType: 'equal' | 'exact' | 'percentage';
  memberIds: string[];
  selectedMemberIds: string[];
  exactAmounts: Record<string, string>;
  percentages: Record<string, string>;
}

export type SharedExpenseInputResult =
  | { input: GroupExpenseInput; error: null; field: null }
  | { input: null; error: string; field: 'title' | 'totalAmount' | 'splits' };

export function positiveMoneyCents(value: string): number | null {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function buildSharedExpenseInput(draft: SharedExpenseDraft): SharedExpenseInputResult {
  const totalCents = positiveMoneyCents(draft.totalAmount);
  if (!totalCents) return { input: null, error: 'Enter a valid amount greater than zero.', field: 'totalAmount' };
  if (!draft.title.trim()) return { input: null, error: 'Title is required.', field: 'title' };
  const base = {
    paidBy: draft.paidBy,
    title: draft.title.trim(),
    totalAmount: (totalCents / 100).toFixed(2),
    category: draft.category,
    expenseDate: draft.expenseDate,
    note: draft.note.trim() || null,
  };

  if (draft.splitType === 'equal') {
    if (draft.selectedMemberIds.length === 0) return { input: null, error: 'Select at least one person for the split.', field: 'splits' };
    return { input: { ...base, splitType: 'equal', splits: draft.selectedMemberIds.map((userId) => ({ userId })) }, error: null, field: null };
  }

  if (draft.splitType === 'exact') {
    const splits = draft.memberIds.flatMap((userId) => {
      const cents = positiveMoneyCents(draft.exactAmounts[userId] ?? '');
      return cents ? [{ userId, owedAmount: (cents / 100).toFixed(2) }] : [];
    });
    const splitCents = splits.reduce((sum, split) => sum + (positiveMoneyCents(split.owedAmount) ?? 0), 0);
    if (splits.length === 0 || splitCents !== totalCents) {
      return { input: null, error: `Exact shares must total ${formatMoney(draft.totalAmount)}.`, field: 'splits' };
    }
    return { input: { ...base, splitType: 'exact', splits }, error: null, field: null };
  }

  const splits = draft.memberIds.flatMap((userId) => {
    const raw = draft.percentages[userId]?.trim() ?? '';
    if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(raw) || Number(raw) <= 0) return [];
    return [{ userId, percentage: Number(raw).toFixed(4) }];
  });
  const totalPercentage = splits.reduce((sum, split) => sum + Math.round(Number(split.percentage) * 10_000), 0);
  if (splits.length === 0 || totalPercentage !== 1_000_000) {
    return { input: null, error: 'Percentage shares must total exactly 100%.', field: 'splits' };
  }
  return { input: { ...base, splitType: 'percentage', splits }, error: null, field: null };
}
