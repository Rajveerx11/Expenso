import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createPersonalTransaction,
  listPersonalTransactions,
  toPersonalTransaction,
  updatePersonalTransaction,
} from './personal-finance-service';

const expenseId = '00000000-0000-4000-8000-000000000111';
const row = {
  id: expenseId,
  title: 'Lunch',
  amount: '12.5',
  category: 'Food',
  type: 'expense' as const,
  note: null,
  source_group_expense_id: null,
  expense_date: '2026-08-14',
  created_at: '2026-08-14T10:00:00.000Z',
  updated_at: '2026-08-14T10:00:00.000Z',
};

function readClient(rpc: ReturnType<typeof vi.fn>, readRow = row): SupabaseClient {
  return {
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: readRow, error: null }) })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe('personal finance service', () => {
  it('maps decimal values and canonical editability without leaking user ids', () => {
    expect(toPersonalTransaction({ ...row, source_group_expense_id: expenseId })).toMatchObject({
      amount: '12.50', editable: false, sourceGroupExpenseId: expenseId,
    });
  });

  it('pages with an opaque stable cursor and rejects a malformed cursor', async () => {
    const second = { ...row, id: '00000000-0000-4000-8000-000000000112', title: 'Bus' };
    const overflow = { ...row, id: '00000000-0000-4000-8000-000000000113', title: 'Shop' };
    const rpc = vi.fn().mockResolvedValue({ data: [row, second, overflow], error: null });
    const firstPage = await listPersonalTransactions(readClient(rpc), {
      month: '2026-08', type: 'all', limit: 2,
    });
    expect(firstPage.transactions).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    await listPersonalTransactions(readClient(rpc), {
      month: '2026-08', type: 'all', limit: 2, cursor: firstPage.nextCursor!,
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({
      cursor_id_param: second.id, cursor_date_param: second.expense_date,
    });
    await expect(listPersonalTransactions(readClient(rpc), {
      month: '2026-08', type: 'all', limit: 2, cursor: 'not-json',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
  });

  it('creates through the atomic idempotent RPC and returns the authoritative row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      transaction_id: expenseId,
      transaction_title: row.title,
      transaction_amount: row.amount,
      transaction_category: row.category,
      transaction_type: row.type,
      transaction_note: row.note,
      transaction_source_group_expense_id: row.source_group_expense_id,
      transaction_expense_date: row.expense_date,
      transaction_created_at: row.created_at,
      transaction_updated_at: row.updated_at,
      replayed: false,
    }], error: null });
    const result = await createPersonalTransaction(readClient(rpc), {
      title: 'Lunch', amount: '12.50', category: 'Food', type: 'expense', expenseDate: '2026-08-14',
    }, 'personal-create-001');
    expect(result.transaction.id).toBe(expenseId);
    expect(result.replayed).toBe(false);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      idempotency_key_param: 'personal-create-001',
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('request_hash_param');
  });

  it('maps linked transaction edits to the stable read-only error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null, error: { code: '22023', message: 'LINKED_TRANSACTION_READ_ONLY' },
    });
    await expect(updatePersonalTransaction(readClient(rpc), expenseId, { amount: '10.00' }))
      .rejects.toMatchObject({ code: 'LINKED_TRANSACTION_READ_ONLY', status: 409 });
  });
});
