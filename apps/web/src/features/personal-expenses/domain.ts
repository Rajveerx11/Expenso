import type { PersonalTransactionInput } from '@/lib/api/client';

interface PersonalExpenseDraft {
  type: PersonalTransactionInput['type'];
  amount: string;
  title: string;
  category: string;
  expenseDate: string;
  note: string;
}

function canonicalMoney(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(trimmed)) return trimmed;
  const [whole, fraction = ''] = trimmed.split('.');
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (cents <= BigInt(0) || cents > BigInt('999999999999')) return trimmed;
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, '0')}`;
}

export function buildPersonalExpenseInput(draft: PersonalExpenseDraft): PersonalTransactionInput {
  return {
    type: draft.type,
    amount: canonicalMoney(draft.amount),
    title: draft.title.trim(),
    category: draft.category,
    expenseDate: draft.expenseDate,
    note: draft.note.trim() || null,
  };
}
