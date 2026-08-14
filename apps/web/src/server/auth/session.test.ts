import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const createClientMock = vi.fn();
vi.mock('@/server/supabase/server', () => ({ createClient: createClientMock }));

describe('verified API session', () => {
  beforeEach(() => createClientMock.mockReset());

  it('fails closed without verified claims', async () => {
    createClientMock.mockResolvedValue({
      auth: { getClaims: vi.fn().mockResolvedValue({ data: null, error: null }) },
    });
    const { requireApiUser } = await import('./session');
    await expect(requireApiUser()).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 } satisfies Partial<AppError>);
  });

  it('accepts a verified UUID subject and never derives identity from input', async () => {
    const client = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: '00000000-0000-4000-8000-000000000001', email: 'demo@example.com' } },
          error: null,
        }),
      },
    };
    createClientMock.mockResolvedValue(client);
    const { requireApiUser } = await import('./session');
    await expect(requireApiUser()).resolves.toEqual({
      client,
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'demo@example.com',
    });
  });
});
