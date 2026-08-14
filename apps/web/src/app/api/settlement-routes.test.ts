import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(), list: vi.fn(), get: vi.fn(), create: vi.fn(), confirm: vi.fn(), reject: vi.fn(),
}));
vi.mock('@/server/auth/session', () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock('@/server/settlements/settlement-service', () => ({
  listSettlements: mocks.list, getSettlement: mocks.get, createSettlement: mocks.create,
  confirmSettlement: mocks.confirm, rejectSettlement: mocks.reject,
}));

import { GET as list, POST as create } from './v1/groups/[groupId]/settlements/route';
import { GET as get } from './v1/groups/[groupId]/settlements/[settlementId]/route';
import { POST as confirm } from './v1/groups/[groupId]/settlements/[settlementId]/confirm/route';
import { POST as reject } from './v1/groups/[groupId]/settlements/[settlementId]/reject/route';

const groupId = '00000000-0000-4000-8000-000000000001';
const settlementId = '00000000-0000-4000-8000-000000000002';
const receiverId = '00000000-0000-4000-8000-000000000003';
const groupContext = { params: Promise.resolve({ groupId }) };
const detailContext = { params: Promise.resolve({ groupId, settlementId }) };
const settlement = { id: settlementId, groupId };

function mutation(path: string, body?: unknown, key?: string): Request {
  return new Request(`https://expenso.example${path}`, {
    method: 'POST',
    headers: {
      origin: 'https://expenso.example', 'sec-fetch-site': 'same-origin',
      cookie: 'expenso.csrf=settlement-route-token', 'x-csrf-token': 'settlement-route-token',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rspuqbcgjqezimwwpbzl.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://expenso.example';
  mocks.requireApiUser.mockResolvedValue({ client: {}, userId: receiverId });
  mocks.list.mockResolvedValue({ settlements: [], nextCursor: null });
  mocks.get.mockResolvedValue(settlement);
  mocks.create.mockResolvedValue({ settlement, replayed: false });
  mocks.confirm.mockResolvedValue({ ...settlement, status: 'confirmed' });
  mocks.reject.mockResolvedValue({ ...settlement, status: 'rejected' });
});

describe('settlement routes', () => {
  it('lists, creates, reads, confirms, and rejects', async () => {
    expect((await list(new Request(`https://expenso.example/api/v1/groups/${groupId}/settlements`), groupContext)).status).toBe(200);
    expect((await create(mutation(`/api/v1/groups/${groupId}/settlements`, {
      receiverId, amount: '5.00', transactionRef: null,
    }, 'settlement-create-0001'), groupContext)).status).toBe(201);
    expect((await get(new Request(`https://expenso.example/api/v1/groups/${groupId}/settlements/${settlementId}`), detailContext)).status).toBe(200);
    expect((await confirm(mutation(`/api/v1/groups/${groupId}/settlements/${settlementId}/confirm`), detailContext)).status).toBe(200);
    expect((await reject(mutation(`/api/v1/groups/${groupId}/settlements/${settlementId}/reject`), detailContext)).status).toBe(200);
  });

  it('requires idempotency, strict input, empty action bodies, and CSRF', async () => {
    expect((await create(mutation(`/api/v1/groups/${groupId}/settlements`, { receiverId, amount: '5.00' }), groupContext)).status).toBe(428);
    expect((await create(mutation(`/api/v1/groups/${groupId}/settlements`, {
      receiverId, amount: '5.00', payerId: receiverId,
    }, 'settlement-create-0001'), groupContext)).status).toBe(422);
    expect((await confirm(mutation(`/api/v1/groups/${groupId}/settlements/${settlementId}/confirm`, {}), detailContext)).status).toBe(422);
    const evil = mutation(`/api/v1/groups/${groupId}/settlements/${settlementId}/reject`);
    evil.headers.set('origin', 'https://evil.example');
    expect((await reject(evil, detailContext)).status).toBe(403);
  });

  it('requires a verified session on every route', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    const responses = await Promise.all([
      list(new Request(`https://expenso.example/api/v1/groups/${groupId}/settlements`), groupContext),
      create(mutation(`/api/v1/groups/${groupId}/settlements`, { receiverId, amount: '5.00' }, 'settlement-create-0001'), groupContext),
      get(new Request(`https://expenso.example/api/v1/groups/${groupId}/settlements/${settlementId}`), detailContext),
      confirm(mutation(`/api/v1/groups/${groupId}/settlements/${settlementId}/confirm`), detailContext),
      reject(mutation(`/api/v1/groups/${groupId}/settlements/${settlementId}/reject`), detailContext),
    ]);
    expect(responses.every((response) => response.status === 401)).toBe(true);
  });

  it('preserves changed-balance conflicts and dependency failures', async () => {
    mocks.confirm.mockRejectedValueOnce(new AppError({ code: 'SETTLEMENT_CHANGED', status: 409 }));
    expect((await confirm(mutation(`/api/v1/groups/${groupId}/settlements/${settlementId}/confirm`), detailContext)).status).toBe(409);
    mocks.list.mockRejectedValueOnce(new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true }));
    expect((await list(new Request(`https://expenso.example/api/v1/groups/${groupId}/settlements`), groupContext)).status).toBe(503);
  });
});
