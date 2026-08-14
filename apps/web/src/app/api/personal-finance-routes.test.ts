import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), delete: vi.fn(), get: vi.fn(), analytics: vi.fn(),
  dashboard: vi.fn(), list: vi.fn(), requireApiUser: vi.fn(), update: vi.fn(),
}));

vi.mock('@/server/auth/session', () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock('@/server/personal-finance/personal-finance-service', () => ({
  createPersonalTransaction: mocks.create,
  deletePersonalTransaction: mocks.delete,
  getPersonalTransaction: mocks.get,
  getPersonalAnalytics: mocks.analytics,
  getDashboard: mocks.dashboard,
  listPersonalTransactions: mocks.list,
  updatePersonalTransaction: mocks.update,
}));

import { GET as listGet, POST as createPost } from './v1/expenses/route';
import { GET as detailGet, PATCH as detailPatch, DELETE as detailDelete } from './v1/expenses/[expenseId]/route';
import { GET as analyticsGet } from './v1/expenses/analytics/route';
import { GET as dashboardGet } from './v1/dashboard/route';

const expenseId = '00000000-0000-4000-8000-000000000111';
const userId = '00000000-0000-4000-8000-000000000001';
const transaction = {
  id: expenseId, title: 'Lunch', amount: '12.50', category: 'Food', type: 'expense', note: null,
  sourceGroupExpenseId: null, editable: true, expenseDate: '2026-08-14',
  createdAt: '2026-08-14T10:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z',
};
const context = { params: Promise.resolve({ expenseId }) };

function mutation(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, extra?: HeadersInit): Request {
  return new Request(`https://expenso.example${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      origin: 'https://expenso.example', 'sec-fetch-site': 'same-origin',
      cookie: 'expenso.csrf=personal-route-token', 'x-csrf-token': 'personal-route-token', ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function code(response: Response): Promise<string | undefined> {
  return (await response.json()).error?.code;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rspuqbcgjqezimwwpbzl.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://expenso.example';
  mocks.requireApiUser.mockResolvedValue({ client: {}, userId, email: 'demo@example.com' });
  mocks.list.mockResolvedValue({ transactions: [transaction], nextCursor: 'next-cursor' });
  mocks.get.mockResolvedValue(transaction);
  mocks.create.mockResolvedValue({ transaction, replayed: false });
  mocks.update.mockResolvedValue(transaction);
  mocks.delete.mockResolvedValue(undefined);
  mocks.analytics.mockResolvedValue({ month: '2026-08' });
  mocks.dashboard.mockResolvedValue({ month: '2026-08' });
});

describe('personal finance routes', () => {
  it('lists a validated month with cursor metadata', async () => {
    const response = await listGet(new Request('https://expenso.example/api/v1/expenses?month=2026-08&type=expense&limit=20'));
    expect(response.status).toBe(200);
    expect((await response.json()).meta.nextCursor).toBe('next-cursor');
    expect(mocks.list).toHaveBeenCalledWith({}, { month: '2026-08', type: 'expense', limit: 20 });
  });

  it('rejects invalid list and analytics months', async () => {
    expect((await listGet(new Request('https://expenso.example/api/v1/expenses?month=2026-13'))).status).toBe(422);
    expect((await analyticsGet(new Request('https://expenso.example/api/v1/expenses/analytics?month=bad'))).status).toBe(422);
  });

  it('requires an idempotency key and creates a normalized transaction', async () => {
    const body = { title: ' Lunch ', amount: '12.5', category: 'Food', type: 'expense', expenseDate: '2026-08-14' };
    let response = await createPost(mutation('/api/v1/expenses', 'POST', body));
    expect(response.status).toBe(428);
    expect(await code(response)).toBe('IDEMPOTENCY_KEY_REQUIRED');
    response = await createPost(mutation('/api/v1/expenses', 'POST', body, { 'idempotency-key': 'personal-create-001' }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({}, expect.objectContaining({ title: 'Lunch', amount: '12.50' }), 'personal-create-001');
  });

  it('blocks cross-origin create before domain code', async () => {
    const request = mutation('/api/v1/expenses', 'POST', {
      title: 'Lunch', amount: '12.50', category: 'Food', type: 'expense', expenseDate: '2026-08-14',
    }, { origin: 'https://evil.example', 'idempotency-key': 'personal-create-001' });
    expect((await createPost(request)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('gets, updates, and deletes one authorized item', async () => {
    expect((await detailGet(new Request(`https://expenso.example/api/v1/expenses/${expenseId}`), context)).status).toBe(200);
    expect((await detailPatch(mutation(`/api/v1/expenses/${expenseId}`, 'PATCH', { amount: '20' }), context)).status).toBe(200);
    const deleted = await detailDelete(mutation(`/api/v1/expenses/${expenseId}`, 'DELETE'), context);
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).data).toEqual({ deleted: true, expenseId });
  });

  it('returns stable safe errors for hidden and linked transactions', async () => {
    mocks.get.mockRejectedValueOnce(new AppError({ code: 'NOT_FOUND', status: 404 }));
    expect(await code(await detailGet(new Request(`https://expenso.example/api/v1/expenses/${expenseId}`), context))).toBe('NOT_FOUND');
    mocks.update.mockRejectedValueOnce(new AppError({ code: 'LINKED_TRANSACTION_READ_ONLY', status: 409 }));
    expect(await code(await detailPatch(mutation(`/api/v1/expenses/${expenseId}`, 'PATCH', { amount: '20.00' }), context)))
      .toBe('LINKED_TRANSACTION_READ_ONLY');
  });

  it('returns analytics and dashboard read models', async () => {
    expect((await analyticsGet(new Request('https://expenso.example/api/v1/expenses/analytics?month=2026-08'))).status).toBe(200);
    expect((await dashboardGet(new Request('https://expenso.example/api/v1/dashboard?month=2026-08'))).status).toBe(200);
    expect(mocks.dashboard).toHaveBeenCalledWith({}, userId, '2026-08');
  });

  it('requires a verified session for every route and mutation', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    const responses = await Promise.all([
      listGet(new Request('https://expenso.example/api/v1/expenses?month=2026-08')),
      analyticsGet(new Request('https://expenso.example/api/v1/expenses/analytics?month=2026-08')),
      dashboardGet(new Request('https://expenso.example/api/v1/dashboard?month=2026-08')),
      detailGet(new Request(`https://expenso.example/api/v1/expenses/${expenseId}`), context),
      createPost(mutation('/api/v1/expenses', 'POST', {}, { 'idempotency-key': 'personal-create-001' })),
      detailPatch(mutation(`/api/v1/expenses/${expenseId}`, 'PATCH', {}), context),
      detailDelete(mutation(`/api/v1/expenses/${expenseId}`, 'DELETE'), context),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401, 401]);
  });
});
