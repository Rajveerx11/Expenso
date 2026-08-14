import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExpenseSplit, GroupBalance, GroupExpense } from '@/lib/types';
import { AppError, mapDataError } from '@/server/http/errors';
import {
  computeGroupSplits,
  databaseSplitInputs,
  type GroupExpenseCreateInput,
} from '@/server/shared-expenses/shared-expense-domain';

interface GroupExpenseRow {
  id: string;
  group_id: string;
  paid_by: string;
  paid_by_name: string;
  title: string;
  total_amount: string | number;
  category: string;
  split_type: 'equal' | 'exact' | 'percentage' | 'shares';
  note: string | null;
  expense_date: string;
  created_at: string;
  updated_at: string;
  can_delete: boolean;
}

interface BalanceRow {
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  user_upi_id: string | null;
  balance: string | number;
  direction: 'owes_you' | 'you_owe' | 'settled';
}

export interface GroupExpenseDetail {
  expense: GroupExpense;
  splits: ExpenseSplit[];
}

const cursorSchema = z.strictObject({
  v: z.literal(1),
  expenseDate: z.iso.date(),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

function money(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  return parsed.toFixed(2);
}

function toGroupExpense(row: GroupExpenseRow): GroupExpense {
  return {
    id: row.id,
    groupId: row.group_id,
    paidBy: row.paid_by,
    paidByName: row.paid_by_name,
    title: row.title,
    totalAmount: money(row.total_amount),
    category: row.category,
    splitType: row.split_type,
    note: row.note,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canDelete: row.can_delete,
  };
}

function normalizeDetail(value: unknown): GroupExpenseDetail {
  const root = value as Record<string, unknown> | null;
  const expense = root?.expense as Record<string, unknown> | null;
  const splits = root?.splits;
  if (!expense || !Array.isArray(splits)) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  const splitType = String(expense.splitType);
  if (!['equal', 'exact', 'percentage', 'shares'].includes(splitType)) {
    throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  }
  return {
    expense: {
      id: String(expense.id),
      groupId: String(expense.groupId),
      paidBy: String(expense.paidBy),
      paidByName: String(expense.paidByName),
      title: String(expense.title),
      totalAmount: money(expense.totalAmount),
      category: String(expense.category),
      splitType: splitType as GroupExpense['splitType'],
      note: expense.note === null ? null : String(expense.note),
      expenseDate: String(expense.expenseDate),
      createdAt: String(expense.createdAt),
      updatedAt: String(expense.updatedAt),
      canDelete: expense.canDelete === true,
    },
    splits: splits.map((item) => {
      const split = item as Record<string, unknown>;
      return {
        id: String(split.id),
        expenseId: String(split.expenseId),
        userId: String(split.userId),
        userName: String(split.userName),
        owedAmount: money(split.owedAmount),
        settledAmount: money(split.settledAmount),
        isSettled: split.isSettled === true,
        settledAt: split.settledAt === null ? null : String(split.settledAt),
      };
    }),
  };
}

function mapSharedExpenseError(error: { code?: string; message?: string } | null): AppError {
  const message = error?.message ?? '';
  if (message.includes('IDEMPOTENCY_KEY_REUSED')) {
    return new AppError({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409, cause: error });
  }
  if (message.includes('IDEMPOTENCY_KEY_REQUIRED')) {
    return new AppError({ code: 'IDEMPOTENCY_KEY_REQUIRED', status: 428, cause: error });
  }
  if (message.includes('SETTLED_EXPENSE_IMMUTABLE')) {
    return new AppError({ code: 'SETTLED_EXPENSE_IMMUTABLE', status: 409, cause: error });
  }
  if (message.includes('pending settlements')) {
    return new AppError({ code: 'PENDING_SETTLEMENT_EXISTS', status: 409, cause: error });
  }
  return mapDataError(error, 'DEPENDENCY_UNAVAILABLE');
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    if (!parsed.success) throw new Error('invalid');
    return parsed.data;
  } catch {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      status: 422,
      fieldErrors: { cursor: ['Cursor is invalid or expired.'] },
    });
  }
}

function encodeCursor(expense: GroupExpense): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    expenseDate: expense.expenseDate,
    createdAt: expense.createdAt,
    id: expense.id,
  })).toString('base64url');
}

export async function listGroupExpenses(
  client: SupabaseClient,
  groupId: string,
  query: { cursor?: string; limit: number },
): Promise<{ expenses: GroupExpense[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor);
  const { data, error } = await client.rpc('list_group_expenses_web', {
    group_id_param: groupId,
    cursor_expense_date_param: cursor?.expenseDate ?? null,
    cursor_created_at_param: cursor?.createdAt ?? null,
    cursor_id_param: cursor?.id ?? null,
    limit_param: query.limit,
  });
  if (error) throw mapSharedExpenseError(error);
  const expenses = ((data ?? []) as GroupExpenseRow[]).map(toGroupExpense);
  const hasMore = expenses.length > query.limit;
  if (hasMore) expenses.pop();
  return {
    expenses,
    nextCursor: hasMore && expenses.length > 0 ? encodeCursor(expenses.at(-1)!) : null,
  };
}

export async function getGroupExpense(
  client: SupabaseClient,
  groupId: string,
  expenseId: string,
): Promise<GroupExpenseDetail> {
  const { data, error } = await client.rpc('get_group_expense_web', {
    group_id_param: groupId,
    expense_id_param: expenseId,
  });
  if (error) throw mapSharedExpenseError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  return normalizeDetail(data);
}

export async function createGroupExpense(
  client: SupabaseClient,
  groupId: string,
  input: GroupExpenseCreateInput,
  idempotencyKey: string,
): Promise<GroupExpenseDetail & { replayed: boolean }> {
  // Application and database independently recompute the allocation. The
  // browser's preview amounts are never authoritative.
  computeGroupSplits(input);
  const { data, error } = await client.rpc('create_group_expense_web', {
    group_id_param: groupId,
    paid_by_param: input.paidBy,
    title_param: input.title,
    total_amount_param: input.totalAmount,
    category_param: input.category,
    split_type_param: input.splitType,
    note_param: input.note ?? null,
    expense_date_param: input.expenseDate,
    splits_param: databaseSplitInputs(input),
    idempotency_key_param: idempotencyKey,
  });
  if (error) throw mapSharedExpenseError(error);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.response) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  return { ...normalizeDetail(result.response), replayed: result.replayed === true };
}

export async function deleteGroupExpense(
  client: SupabaseClient,
  groupId: string,
  expenseId: string,
): Promise<void> {
  const { data, error } = await client.rpc('delete_group_expense_web', {
    group_id_param: groupId,
    expense_id_param: expenseId,
  });
  if (error) throw mapSharedExpenseError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
}

export async function listGroupBalances(client: SupabaseClient, groupId: string): Promise<GroupBalance[]> {
  const { data, error } = await client.rpc('list_group_balances_web', { group_id_param: groupId });
  if (error) throw mapSharedExpenseError(error);
  return ((data ?? []) as BalanceRow[]).map((row) => ({
    userId: row.user_id,
    userName: row.user_name,
    userAvatarUrl: row.user_avatar_url,
    userUpiId: row.user_upi_id,
    balance: money(row.balance),
    direction: row.direction,
  }));
}
