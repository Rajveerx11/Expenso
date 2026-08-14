import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(), listExpenses: vi.fn(), createExpense: vi.fn(),
  getExpense: vi.fn(), deleteExpense: vi.fn(), listBalances: vi.fn(),
}));
vi.mock('@/server/auth/session', () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock('@/server/shared-expenses/shared-expense-service', () => ({
  listGroupExpenses: mocks.listExpenses,
  createGroupExpense: mocks.createExpense,
  getGroupExpense: mocks.getExpense,
  deleteGroupExpense: mocks.deleteExpense,
  listGroupBalances: mocks.listBalances,
}));

import { GET as expensesGet, POST as expensesPost } from './v1/groups/[groupId]/expenses/route';
import { GET as expenseGet, DELETE as expenseDelete } from './v1/groups/[groupId]/expenses/[expenseId]/route';
import { GET as balancesGet } from './v1/groups/[groupId]/balances/route';

const groupId = '00000000-0000-4000-8000-000000000010';
const expenseId = '00000000-0000-4000-8000-000000000020';
const userId = '00000000-0000-4000-8000-000000000001';
const groupContext = { params: Promise.resolve({ groupId }) };
const expenseContext = { params: Promise.resolve({ groupId, expenseId }) };

function mutation(path: string, method: 'POST' | 'DELETE', body?: unknown, extra?: HeadersInit): Request {
  return new Request(`https://expenso.example${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      origin: 'https://expenso.example',
      'sec-fetch-site': 'same-origin',
      cookie: 'expenso.csrf=shared-route-token',
      'x-csrf-token': 'shared-route-token',
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const body = {
  paidBy: userId,
  title: 'Dinner',
  totalAmount: '100.00',
  category: 'Food',
  splitType: 'equal',
  expenseDate: '2026-08-14',
  splits: [{ userId }],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rspuqbcgjqezimwwpbzl.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://expenso.example';
  mocks.requireApiUser.mockResolvedValue({ client: {}, userId, email: 'demo@example.com' });
  mocks.listExpenses.mockResolvedValue({ expenses: [], nextCursor: null });
  mocks.createExpense.mockResolvedValue({ expense: { id: expenseId }, splits: [], replayed: false });
  mocks.getExpense.mockResolvedValue({ expense: { id: expenseId }, splits: [] });
  mocks.listBalances.mockResolvedValue([]);
});

describe('shared expense routes', () => {
  it('lists, creates, reads, deletes, and returns balances', async () => {
    expect((await expensesGet(new Request(`https://expenso.example/api/v1/groups/${groupId}/expenses?limit=10`), groupContext)).status).toBe(200);
    const created = await expensesPost(mutation(
      `/api/v1/groups/${groupId}/expenses`, 'POST', body, { 'idempotency-key': 'shared-create-0001' },
    ), groupContext);
    expect(created.status).toBe(201);
    expect(mocks.createExpense).toHaveBeenCalledWith({}, groupId, expect.objectContaining({ totalAmount: '100.00' }), 'shared-create-0001');
    expect((await expenseGet(new Request(`https://expenso.example/api/v1/groups/${groupId}/expenses/${expenseId}`), expenseContext)).status).toBe(200);
    expect((await balancesGet(new Request(`https://expenso.example/api/v1/groups/${groupId}/balances`), groupContext)).status).toBe(200);
    expect((await expenseDelete(mutation(`/api/v1/groups/${groupId}/expenses/${expenseId}`, 'DELETE'), expenseContext)).status).toBe(200);
  });

  it('requires idempotency, exact schema, and same-origin CSRF', async () => {
    expect((await expensesPost(mutation(`/api/v1/groups/${groupId}/expenses`, 'POST', body), groupContext)).status).toBe(428);
    expect((await expensesPost(mutation(
      `/api/v1/groups/${groupId}/expenses`, 'POST', { ...body, trustedAmount: '1.00' },
      { 'idempotency-key': 'shared-create-0001' },
    ), groupContext)).status).toBe(422);
    const crossOrigin = await expensesPost(mutation(
      `/api/v1/groups/${groupId}/expenses`, 'POST', body,
      { origin: 'https://evil.example', 'idempotency-key': 'shared-create-0001' },
    ), groupContext);
    expect(crossOrigin.status).toBe(403);
    expect(mocks.createExpense).not.toHaveBeenCalled();
  });

  it('requires verified session on every route', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    const responses = await Promise.all([
      expensesGet(new Request(`https://expenso.example/api/v1/groups/${groupId}/expenses`), groupContext),
      expensesPost(mutation(`/api/v1/groups/${groupId}/expenses`, 'POST', body, { 'idempotency-key': 'shared-create-0001' }), groupContext),
      expenseGet(new Request(`https://expenso.example/api/v1/groups/${groupId}/expenses/${expenseId}`), expenseContext),
      expenseDelete(mutation(`/api/v1/groups/${groupId}/expenses/${expenseId}`, 'DELETE'), expenseContext),
      balancesGet(new Request(`https://expenso.example/api/v1/groups/${groupId}/balances`), groupContext),
    ]);
    expect(responses.every((response) => response.status === 401)).toBe(true);
  });
});
