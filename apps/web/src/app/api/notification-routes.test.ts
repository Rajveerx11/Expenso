import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(), list: vi.fn(), read: vi.fn(), readAll: vi.fn(), upsert: vi.fn(), disable: vi.fn(),
}));
vi.mock('@/server/auth/session', () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock('@/server/notifications/notification-service', () => ({
  listNotifications: mocks.list, markNotificationRead: mocks.read, markAllNotificationsRead: mocks.readAll,
  upsertWebPushSubscription: mocks.upsert, disableWebPushSubscription: mocks.disable,
}));

import { GET as list } from './v1/notifications/route';
import { POST as read } from './v1/notifications/[notificationId]/read/route';
import { POST as readAll } from './v1/notifications/read-all/route';
import { POST as subscribe } from './v1/push-subscriptions/route';
import { DELETE as disable } from './v1/push-subscriptions/[subscriptionId]/route';

const notificationId = '00000000-0000-4000-8000-000000000001';
const subscriptionId = '00000000-0000-4000-8000-000000000002';
const notificationContext = { params: Promise.resolve({ notificationId }) };
const subscriptionContext = { params: Promise.resolve({ subscriptionId }) };

function mutation(path: string, method: 'POST' | 'DELETE', body?: unknown) {
  return new Request(`https://expenso.example${path}`, {
    method,
    headers: {
      origin: 'https://expenso.example', 'sec-fetch-site': 'same-origin',
      cookie: 'expenso.csrf=notification-route-token', 'x-csrf-token': 'notification-route-token',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const pushBody = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/browser-token', expirationTime: null,
  keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(22) }, userAgent: 'Browser',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rspuqbcgjqezimwwpbzl.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://expenso.example';
  mocks.requireApiUser.mockResolvedValue({ client: {}, userId: notificationId });
  mocks.list.mockResolvedValue({ notifications: [], nextCursor: null });
  mocks.readAll.mockResolvedValue(2);
  mocks.upsert.mockResolvedValue({ id: subscriptionId });
});

describe('notification and push routes', () => {
  it('lists, reads, reads all, subscribes, and disables', async () => {
    expect((await list(new Request('https://expenso.example/api/v1/notifications'))).status).toBe(200);
    expect((await read(mutation(`/api/v1/notifications/${notificationId}/read`, 'POST'), notificationContext)).status).toBe(200);
    expect((await readAll(mutation('/api/v1/notifications/read-all', 'POST'))).status).toBe(200);
    expect((await subscribe(mutation('/api/v1/push-subscriptions', 'POST', pushBody))).status).toBe(201);
    expect((await disable(mutation(`/api/v1/push-subscriptions/${subscriptionId}`, 'DELETE'), subscriptionContext)).status).toBe(200);
  });

  it('rejects forged owner, unsafe endpoint, nonempty read body, and cross-origin mutation', async () => {
    expect((await subscribe(mutation('/api/v1/push-subscriptions', 'POST', { ...pushBody, userId: notificationId }))).status).toBe(422);
    expect((await subscribe(mutation('/api/v1/push-subscriptions', 'POST', { ...pushBody, endpoint: 'https://127.0.0.1/push' }))).status).toBe(422);
    expect((await read(mutation(`/api/v1/notifications/${notificationId}/read`, 'POST', {}), notificationContext)).status).toBe(422);
    const evil = mutation('/api/v1/notifications/read-all', 'POST');
    evil.headers.set('origin', 'https://evil.example');
    expect((await readAll(evil)).status).toBe(403);
  });

  it('requires verified session on all routes', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    const responses = await Promise.all([
      list(new Request('https://expenso.example/api/v1/notifications')),
      read(mutation(`/api/v1/notifications/${notificationId}/read`, 'POST'), notificationContext),
      readAll(mutation('/api/v1/notifications/read-all', 'POST')),
      subscribe(mutation('/api/v1/push-subscriptions', 'POST', pushBody)),
      disable(mutation(`/api/v1/push-subscriptions/${subscriptionId}`, 'DELETE'), subscriptionContext),
    ]);
    expect(responses.every((response) => response.status === 401)).toBe(true);
  });

  it('preserves stable capacity and dependency errors', async () => {
    mocks.upsert.mockRejectedValueOnce(new AppError({ code: 'RATE_LIMITED', status: 429 }));
    expect((await subscribe(mutation('/api/v1/push-subscriptions', 'POST', pushBody))).status).toBe(429);
    mocks.list.mockRejectedValueOnce(new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true }));
    expect((await list(new Request('https://expenso.example/api/v1/notifications'))).status).toBe(503);
  });
});
