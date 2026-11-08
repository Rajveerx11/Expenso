import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn() }));
vi.mock('@/server/auth/session', () => ({ requireApiUser: mocks.requireApiUser }));

import { GET } from './v1/push-subscriptions/vapid-public-key/route';

const originalPublicKey = process.env.VAPID_PUBLIC_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = 'A'.repeat(87);
  mocks.requireApiUser.mockResolvedValue({
    client: {},
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'demo@example.com',
  });
});

afterEach(() => {
  if (originalPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY = originalPublicKey;
});

describe('browser VAPID public-key route', () => {
  it('returns only the public key to an authenticated user without caching', async () => {
    const response = await GET(new Request('https://expenso.example/api/v1/push-subscriptions/vapid-public-key'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ data: { publicKey: 'A'.repeat(87) } });
  });

  it('does not expose configuration before session verification', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    mocks.requireApiUser.mockRejectedValue(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    const response = await GET(new Request('https://expenso.example/api/v1/push-subscriptions/vapid-public-key'));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
  });

  it('fails closed when the public key is malformed', async () => {
    process.env.VAPID_PUBLIC_KEY = 'unsafe';
    const response = await GET(new Request('https://expenso.example/api/v1/push-subscriptions/vapid-public-key'));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('DEPENDENCY_UNAVAILABLE');
  });
});
