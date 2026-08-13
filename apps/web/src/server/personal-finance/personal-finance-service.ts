import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Analytics, DashboardData, PersonalTransaction } from '@/lib/types';
import { AppError, mapDataError } from '@/server/http/errors';
import { getProfile } from '@/server/profile/profile-service';

const EXPENSE_SELECT = 'id,title,amount,category,type,note,source_group_expense_id,expense_date,created_at,updated_at';

interface PersonalExpenseRow {
  id: string;
  title: string;
  amount: string | number;
  category: string;
  type: 'income' | 'expense';
  note: string | null;
  source_group_expense_id: string | null;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalTransactionInput {
  title: string;
  amount: string;
  category: string;
  type: 'income' | 'expense';
  note?: string | null;
  expenseDate: string;
}

const cursorSchema = z.strictObject({
  v: z.literal(1),
  expenseDate: z.iso.date(),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

function money(value: string | number | null | undefined): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  return parsed.toFixed(2);
}

export function toPersonalTransaction(row: PersonalExpenseRow): PersonalTransaction {
  return {
    id: row.id,
    title: row.title,
    amount: money(row.amount),
    category: row.category,
    type: row.type,
    note: row.note,
    sourceGroupExpenseId: row.source_group_expense_id,
    editable: row.source_group_expense_id === null,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPersonalError(error: { code?: string; message?: string } | null): AppError {
  if (error?.message?.includes('LINKED_TRANSACTION_READ_ONLY')) {
    return new AppError({ code: 'LINKED_TRANSACTION_READ_ONLY', status: 409, cause: error });
  }
  if (error?.message?.includes('IDEMPOTENCY_KEY_REUSED')) {
    return new AppError({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409, cause: error });
  }
  if (error?.message?.includes('IDEMPOTENCY_KEY_REQUIRED')) {
    return new AppError({ code: 'IDEMPOTENCY_KEY_REQUIRED', status: 428, cause: error });
  }
  return mapDataError(error);
}

function requestHash(input: PersonalTransactionInput): string {
  return createHash('sha256').update(JSON.stringify({
    title: input.title,
    amount: input.amount,
    category: input.category,
    type: input.type,
    note: input.note ?? null,
    expenseDate: input.expenseDate,
  })).digest('hex');
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = cursorSchema.safeParse(value);
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

function encodeCursor(row: PersonalTransaction): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    expenseDate: row.expenseDate,
    createdAt: row.createdAt,
    id: row.id,
  })).toString('base64url');
}

export async function getPersonalTransaction(
  client: SupabaseClient,
  expenseId: string,
): Promise<PersonalTransaction> {
  const { data, error } = await client.from('personal_expenses').select(EXPENSE_SELECT).eq('id', expenseId).maybeSingle();
  if (error) throw mapDataError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  return toPersonalTransaction(data as PersonalExpenseRow);
}

export async function listPersonalTransactions(
  client: SupabaseClient,
  query: { month: string; type: 'all' | 'income' | 'expense'; cursor?: string; limit: number },
): Promise<{ transactions: PersonalTransaction[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor);
  const { data, error } = await client.rpc('list_personal_expenses', {
    month_start_param: `${query.month}-01`,
    type_param: query.type,
    cursor_date_param: cursor?.expenseDate ?? null,
    cursor_created_at_param: cursor?.createdAt ?? null,
    cursor_id_param: cursor?.id ?? null,
    limit_param: query.limit,
  });
  if (error) throw mapPersonalError(error);
  const transactions = ((data ?? []) as PersonalExpenseRow[]).map(toPersonalTransaction);
  const hasMore = transactions.length > query.limit;
  if (hasMore) transactions.pop();
  return {
    transactions,
    nextCursor: hasMore && transactions.length > 0 ? encodeCursor(transactions.at(-1)!) : null,
  };
}

export async function createPersonalTransaction(
  client: SupabaseClient,
  input: PersonalTransactionInput,
  idempotencyKey: string,
): Promise<{ transaction: PersonalTransaction; replayed: boolean }> {
  const { data, error } = await client.rpc('create_personal_expense', {
    title_param: input.title,
    amount_param: input.amount,
    category_param: input.category,
    type_param: input.type,
    note_param: input.note ?? null,
    expense_date_param: input.expenseDate,
    idempotency_key_param: idempotencyKey,
    request_hash_param: requestHash(input),
  });
  if (error) throw mapPersonalError(error);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.transaction_id) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  return {
    transaction: toPersonalTransaction({
      id: result.transaction_id,
      title: result.transaction_title,
      amount: result.transaction_amount,
      category: result.transaction_category,
      type: result.transaction_type,
      note: result.transaction_note,
      source_group_expense_id: result.transaction_source_group_expense_id,
      expense_date: result.transaction_expense_date,
      created_at: result.transaction_created_at,
      updated_at: result.transaction_updated_at,
    } as PersonalExpenseRow),
    replayed: result.replayed === true,
  };
}

export async function updatePersonalTransaction(
  client: SupabaseClient,
  expenseId: string,
  patch: Partial<PersonalTransactionInput>,
): Promise<PersonalTransaction> {
  const dbPatch: Record<string, string | null> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.amount !== undefined) dbPatch.amount = patch.amount;
  if (patch.category !== undefined) dbPatch.category = patch.category;
  if (patch.type !== undefined) dbPatch.type = patch.type;
  if (patch.note !== undefined) dbPatch.note = patch.note;
  if (patch.expenseDate !== undefined) dbPatch.expense_date = patch.expenseDate;
  const { data, error } = await client.rpc('update_personal_expense', {
    expense_id_param: expenseId,
    patch_param: dbPatch,
  });
  if (error) throw mapPersonalError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
  return getPersonalTransaction(client, expenseId);
}

export async function deletePersonalTransaction(client: SupabaseClient, expenseId: string): Promise<void> {
  const { data, error } = await client.rpc('delete_personal_expense', { expense_id_param: expenseId });
  if (error) throw mapPersonalError(error);
  if (!data) throw new AppError({ code: 'NOT_FOUND', status: 404 });
}

export async function getPersonalAnalytics(
  client: SupabaseClient,
  month: string,
): Promise<Analytics> {
  const { data, error } = await client.rpc('get_personal_expense_analytics', { month_start_param: `${month}-01` });
  if (error || !data) throw mapPersonalError(error);
  const value = data as Record<string, unknown>;
  const categories = Array.isArray(value.categoryBreakdown) ? value.categoryBreakdown : [];
  return {
    month,
    monthlyIncome: money(value.monthlyIncome as string | number),
    monthlyExpenses: money(value.monthlyExpenses as string | number),
    monthlyNet: money(value.monthlyNet as string | number),
    lifetimeIncome: money(value.lifetimeIncome as string | number),
    lifetimeExpenses: money(value.lifetimeExpenses as string | number),
    lifetimeNet: money(value.lifetimeNet as string | number),
    categoryBreakdown: categories.map((entry) => {
      const category = entry as Record<string, unknown>;
      return {
        category: String(category.category),
        amount: money(category.amount as string | number),
        percentage: Number(category.percentage),
      };
    }),
  };
}

export async function getDashboard(
  client: SupabaseClient,
  userId: string,
  month: string,
): Promise<DashboardData> {
  const [profile, summaryResult, recent] = await Promise.all([
    getProfile(client, userId),
    client.rpc('get_dashboard_summary', { month_start_param: `${month}-01` }),
    listPersonalTransactions(client, { month, type: 'all', limit: 5 }),
  ]);
  if (summaryResult.error) throw mapPersonalError(summaryResult.error);
  const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
  if (!summary) throw new AppError({ code: 'INTERNAL_ERROR', status: 500 });
  return {
    profile,
    month,
    monthlyIncome: money(summary.monthly_income),
    monthlyExpenses: money(summary.monthly_expenses),
    monthlyNet: money(summary.monthly_net),
    totalYouOwe: money(summary.total_you_owe),
    totalOwedToYou: money(summary.total_owed_to_you),
    pendingConfirmationCount: Number(summary.pending_confirmation_count),
    unreadNotificationCount: Number(summary.unread_notification_count),
    recentTransactions: recent.transactions,
  };
}
