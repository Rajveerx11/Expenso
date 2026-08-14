import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { groupExpenseCreateSchema } from '@/shared/api/contracts';
import {
  createGroupExpense,
  deleteGroupExpense,
  listGroupBalances,
  listGroupExpenses,
} from './shared-expense-service';

const groupId = '00000000-0000-4000-8000-000000000010';
const payerId = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000000002';
const expenseId = '00000000-0000-4000-8000-000000000020';

const expense = {
  id: expenseId, groupId, paidBy: payerId, paidByName: 'Payer', title: 'Dinner',
  totalAmount: 100, category: 'Food', splitType: 'percentage', note: null,
  expenseDate: '2026-08-14', createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z', canDelete: true,
};
const splits = [{
  id: '00000000-0000-4000-8000-000000000030', expenseId, userId: payerId,
  userName: 'Payer', owedAmount: 50, settledAmount: 0, isSettled: false, settledAt: null,
}];

describe('shared expense service', () => {
  it('lists keyset-paged expenses and balances with money strings', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{
        id: expenseId, group_id: groupId, paid_by: payerId, paid_by_name: 'Payer',
        title: 'Dinner', total_amount: 100, category: 'Food', split_type: 'equal', note: null,
        expense_date: '2026-08-14', created_at: '2026-08-14T00:00:00Z',
        updated_at: '2026-08-14T00:00:00Z', can_delete: true,
      }], error: null })
      .mockResolvedValueOnce({ data: [{
        user_id: memberId, user_name: 'Member', user_avatar_url: null,
        user_upi_id: 'member@upi', balance: -50, direction: 'you_owe',
      }], error: null });
    const client = { rpc } as unknown as SupabaseClient;
    expect((await listGroupExpenses(client, groupId, { limit: 30 })).expenses[0].totalAmount).toBe('100.00');
    expect(await listGroupBalances(client, groupId)).toEqual([{
      userId: memberId, userName: 'Member', userAvatarUrl: null,
      userUpiId: 'member@upi', balance: '-50.00', direction: 'you_owe',
    }]);
  });

  it('sends percentage weights and returns authoritative splits', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ response: { expense, splits }, replayed: false }], error: null,
    });
    const input = groupExpenseCreateSchema.parse({
      paidBy: payerId,
      title: 'Dinner',
      totalAmount: '100.00',
      category: 'Food',
      splitType: 'percentage',
      expenseDate: '2026-08-14',
      splits: [
        { userId: memberId, percentage: '50' },
        { userId: payerId, percentage: '50' },
      ],
    });
    const result = await createGroupExpense(
      { rpc } as unknown as SupabaseClient,
      groupId,
      input,
      'shared-create-0001',
    );
    expect(result.expense.totalAmount).toBe('100.00');
    expect(result.splits[0].owedAmount).toBe('50.00');
    expect(rpc).toHaveBeenCalledWith('create_group_expense_web', expect.objectContaining({
      splits_param: [
        { user_id: payerId, value: '50.0000' },
        { user_id: memberId, value: '50.0000' },
      ],
    }));
  });

  it('maps replay and settled-delete conflicts to stable errors', async () => {
    const replayConflict = { rpc: vi.fn().mockResolvedValue({
      data: null, error: { code: '22023', message: 'IDEMPOTENCY_KEY_REUSED' },
    }) } as unknown as SupabaseClient;
    const input = groupExpenseCreateSchema.parse({
      paidBy: payerId, title: 'Dinner', totalAmount: '1.00', category: 'Food',
      splitType: 'equal', expenseDate: '2026-08-14', splits: [{ userId: payerId }],
    });
    await expect(createGroupExpense(replayConflict, groupId, input, 'shared-create-0001'))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });

    const settled = { rpc: vi.fn().mockResolvedValue({
      data: null, error: { code: '22023', message: 'SETTLED_EXPENSE_IMMUTABLE' },
    }) } as unknown as SupabaseClient;
    await expect(deleteGroupExpense(settled, groupId, expenseId))
      .rejects.toMatchObject({ code: 'SETTLED_EXPENSE_IMMUTABLE', status: 409 });
  });
});
