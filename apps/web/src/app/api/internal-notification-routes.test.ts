import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const mocks = vi.hoisted(() => ({ drain: vi.fn() }));
vi.mock('@/server/notifications/delivery', async () => {
  const actual = await vi.importActual<typeof import('@/server/notifications/delivery')>('@/server/notifications/delivery');
  return { ...actual, drainWebPushDeliveries: mocks.drain };
});
import { GET as drain } from './internal/notifications/drain/route';
import { POST as deliver } from './internal/notifications/deliver/route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'cron-secret-value-at-least-32-characters';
  process.env.DATABASE_WEBHOOK_SECRET = 'webhook-secret-value-at-least-32-chars';
  mocks.drain.mockResolvedValue({ claimed: 0, sent: 0, invalid: 0, retried: 0, failed: 0 });
});

describe('internal notification delivery routes', () => {
  it('fails closed when configuration is missing and rejects wrong credentials', async () => {
    delete process.env.CRON_SECRET;
    expect((await drain(new Request('https://expenso.example/api/internal/notifications/drain'))).status).toBe(503);
    process.env.CRON_SECRET = 'cron-secret-value-at-least-32-characters';
    expect((await drain(new Request('https://expenso.example/api/internal/notifications/drain', {
      headers: { authorization: 'Bearer wrong' },
    }))).status).toBe(401);
  });

  it('drains a bounded batch with correct cron secret', async () => {
    const response = await drain(new Request('https://expenso.example/api/internal/notifications/drain', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    expect(response.status).toBe(200);
    expect(mocks.drain).toHaveBeenCalledWith(25);
  });

  it('accepts compact and official Supabase INSERT webhook envelopes', async () => {
    const base = { method: 'POST', headers: {
      authorization: `Bearer ${process.env.DATABASE_WEBHOOK_SECRET}`, 'content-type': 'application/json',
    } };
    const notificationId = '00000000-0000-4000-8000-000000000001';
    expect((await deliver(new Request('https://expenso.example/api/internal/notifications/deliver', {
      ...base, body: JSON.stringify({ notificationId }),
    }))).status).toBe(200);
    expect(mocks.drain).toHaveBeenLastCalledWith(25, notificationId);
    expect((await deliver(new Request('https://expenso.example/api/internal/notifications/deliver', {
      ...base,
      body: JSON.stringify({
        type: 'INSERT', table: 'notifications', schema: 'public',
        record: { id: notificationId, endpoint: 'ignored-authoritative-field' }, old_record: null,
      }),
    }))).status).toBe(200);
    expect(mocks.drain).toHaveBeenLastCalledWith(25, notificationId);
    expect((await deliver(new Request('https://expenso.example/api/internal/notifications/deliver', {
      ...base, body: JSON.stringify({ notificationId, endpoint: 'forged' }),
    }))).status).toBe(422);
    expect((await deliver(new Request('https://expenso.example/api/internal/notifications/deliver', {
      ...base,
      body: JSON.stringify({ type: 'UPDATE', table: 'notifications', schema: 'public', record: { id: notificationId } }),
    }))).status).toBe(422);
  });

  it('returns retryable dependency failure without exposing worker details', async () => {
    mocks.drain.mockRejectedValueOnce(new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true }));
    const response = await drain(new Request('https://expenso.example/api/internal/notifications/drain', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', retryable: true });
    expect(JSON.stringify(body)).not.toContain(process.env.CRON_SECRET);
  });
});
