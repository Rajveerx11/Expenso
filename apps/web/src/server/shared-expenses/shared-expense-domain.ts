import 'server-only';
import type { z } from 'zod';
import type { groupExpenseCreateSchema } from '@/shared/api/contracts';
import { AppError } from '@/server/http/errors';

export type GroupExpenseCreateInput = z.infer<typeof groupExpenseCreateSchema>;

export interface ComputedSplit {
  userId: string;
  owedAmount: string;
}

function moneyToCents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}

function centsToMoney(value: bigint): string {
  return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, '0')}`;
}

function percentageUnits(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(10_000) + BigInt(fraction.padEnd(4, '0'));
}

function invalidSplits(message: string): never {
  throw new AppError({
    code: 'VALIDATION_ERROR',
    status: 422,
    fieldErrors: { splits: [message] },
  });
}

export function computeGroupSplits(input: GroupExpenseCreateInput): ComputedSplit[] {
  if (new Set(input.splits.map((split) => split.userId)).size !== input.splits.length) {
    invalidSplits('Each member can appear only once.');
  }
  const totalCents = moneyToCents(input.totalAmount);

  if (input.splitType === 'equal') {
    const sorted = [...input.splits].sort((left, right) => left.userId.localeCompare(right.userId));
    const count = BigInt(sorted.length);
    const base = totalCents / count;
    const remainder = totalCents % count;
    return sorted.map((split, index) => ({
      userId: split.userId,
      owedAmount: centsToMoney(base + (BigInt(index) < remainder ? BigInt(1) : BigInt(0))),
    }));
  }

  if (input.splitType === 'exact') {
    const sorted = [...input.splits].sort((left, right) => left.userId.localeCompare(right.userId));
    const computed = sorted.map((split) => ({
      userId: split.userId,
      owedAmount: centsToMoney(moneyToCents(split.owedAmount)),
    }));
    if (computed.reduce((sum, split) => sum + moneyToCents(split.owedAmount), BigInt(0)) !== totalCents) {
      invalidSplits('Exact splits must equal the expense total.');
    }
    return computed;
  }

  const sorted = [...input.splits].sort((left, right) => left.userId.localeCompare(right.userId));
  const weighted = sorted.map((split) => ({
    userId: split.userId,
    units: percentageUnits(split.percentage),
  }));
  if (weighted.reduce((sum, split) => sum + split.units, BigInt(0)) !== BigInt(1_000_000)) {
    invalidSplits('Percentages must total exactly 100.0000.');
  }
  const raw = weighted.map((split) => {
    const numerator = totalCents * split.units;
    return {
      userId: split.userId,
      cents: numerator / BigInt(1_000_000),
      remainder: numerator % BigInt(1_000_000),
    };
  });
  let remaining = totalCents - raw.reduce((sum, split) => sum + split.cents, BigInt(0));
  const remainderOrder = [...raw].sort((left, right) => {
    if (left.remainder === right.remainder) return left.userId.localeCompare(right.userId);
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (const split of remainderOrder) {
    if (remaining === BigInt(0)) break;
    split.cents += BigInt(1);
    remaining -= BigInt(1);
  }
  return raw
    .sort((left, right) => left.userId.localeCompare(right.userId))
    .map((split) => ({ userId: split.userId, owedAmount: centsToMoney(split.cents) }));
}

export function databaseSplitInputs(input: GroupExpenseCreateInput) {
  let values: Array<{ user_id: string; value?: string }>;
  if (input.splitType === 'exact') {
    values = input.splits.map((split) => ({ user_id: split.userId, value: split.owedAmount }));
  } else if (input.splitType === 'percentage') {
    values = input.splits.map((split) => ({ user_id: split.userId, value: split.percentage }));
  } else {
    values = input.splits.map((split) => ({ user_id: split.userId }));
  }
  return values.sort((left, right) => left.user_id.localeCompare(right.user_id));
}
