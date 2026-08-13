import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const mocks = vi.hoisted(() => ({
  completeAvatarUpload: vi.fn(),
  createAvatarUploadTicket: vi.fn(),
  createClient: vi.fn(),
  enforceAuthRateLimit: vi.fn(),
  getProfile: vi.fn(),
  requireApiUser: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('@/server/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/server/auth/session', () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock('@/server/auth/rate-limit', () => ({ enforceAuthRateLimit: mocks.enforceAuthRateLimit }));
vi.mock('@/server/profile/profile-service', () => ({
  completeAvatarUpload: mocks.completeAvatarUpload,
  createAvatarUploadTicket: mocks.createAvatarUploadTicket,
  getProfile: mocks.getProfile,
  updateProfile: mocks.updateProfile,
}));

import { GET as healthGet } from './healthz/route';
import { GET as readyGet } from './readyz/route';
import { GET as csrfGet } from './v1/auth/csrf/route';
import { POST as loginPost } from './v1/auth/login/route';
import { POST as signupPost } from './v1/auth/signup/route';
import { POST as googlePost } from './v1/auth/google/route';
import { POST as logoutPost } from './v1/auth/logout/route';
import { GET as meGet, PATCH as mePatch } from './v1/me/route';
import { POST as avatarTicketPost } from './v1/me/avatar/upload-ticket/route';
import { POST as avatarCompletePost } from './v1/me/avatar/complete/route';
import { GET as callbackGet } from '../auth/callback/route';

const userId = '00000000-0000-4000-8000-000000000001';
const profile = {
  id: userId,
  email: 'demo@example.com',
  fullName: 'Demo User',
  avatarUrl: null,
  upiId: null,
  totalIncome: '0.00',
  totalBalance: '0.00',
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z',
};

function mutation(path: string, body: unknown, origin = 'https://expenso.example'): Request {
  return new Request(`https://expenso.example${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'sec-fetch-site': 'same-origin',
      cookie: 'expenso.csrf=route-test-token',
      'x-csrf-token': 'route-test-token',
    },
    body: JSON.stringify(body),
  });
}

async function errorCode(response: Response): Promise<string | undefined> {
  return (await response.json()).error?.code;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rspuqbcgjqezimwwpbzl.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://expenso.example';
  process.env.RATE_LIMIT_SALT = '12345678901234567890123456789012';
  mocks.enforceAuthRateLimit.mockResolvedValue(undefined);
});

describe('health routes', () => {
  it('returns liveness without private caching', async () => {
    const response = healthGet(new Request('https://expenso.example/api/healthz'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.json()).data.status).toBe('ok');
  });

  it('returns ready only when Supabase Auth responds and maps outage to 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 })));
    expect((await readyGet(new Request('https://expenso.example/api/readyz'))).status).toBe(200);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')));
    const unavailable = await readyGet(new Request('https://expenso.example/api/readyz'));
    expect(unavailable.status).toBe(503);
    expect(await errorCode(unavailable)).toBe('DEPENDENCY_UNAVAILABLE');
  });
});

describe('auth routes', () => {
  it('issues one double-submit CSRF token in body and cookie', async () => {
    const response = csrfGet(new NextRequest('https://expenso.example/api/v1/auth/csrf'));
    const token = (await response.json()).data.csrfToken;
    expect(response.cookies.get('expenso.csrf')?.value).toBe(token);
  });

  it('logs in after schema, origin, CSRF, and durable throttle checks', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { signInWithPassword } });
    const response = await loginPost(mutation('/api/v1/auth/login', {
      email: 'demo@example.com', password: 'correct-horse',
    }));
    expect(response.status).toBe(200);
    expect(mocks.enforceAuthRateLimit).toHaveBeenCalledOnce();
    expect(signInWithPassword).toHaveBeenCalledOnce();
  });

  it('rejects malformed and cross-origin login before provider use', async () => {
    let response = await loginPost(mutation('/api/v1/auth/login', { email: 'invalid', password: '' }));
    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe('VALIDATION_ERROR');
    response = await loginPost(mutation('/api/v1/auth/login', {
      email: 'demo@example.com', password: 'correct-horse',
    }, 'https://preview.expenso.example'));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('FORBIDDEN');
  });

  it('maps login provider throttling without claiming bad credentials', async () => {
    mocks.createClient.mockResolvedValue({
      auth: { signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: { status: 429 } }) },
    });
    const response = await loginPost(mutation('/api/v1/auth/login', {
      email: 'demo@example.com', password: 'correct-horse',
    }));
    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe('RATE_LIMITED');
  });

  it('maps limiter Vault misconfiguration to retryable dependency failure', async () => {
    mocks.enforceAuthRateLimit.mockRejectedValueOnce(new AppError({
      code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true,
    }));
    const response = await loginPost(mutation('/api/v1/auth/login', {
      email: 'demo@example.com', password: 'correct-horse',
    }));
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('creates signup and Google OAuth provider requests with allowlisted callback', async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: { id: userId }, session: null }, error: null });
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { url: 'https://accounts.google.test/' }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { signUp, signInWithOAuth } });
    const signup = await signupPost(mutation('/api/v1/auth/signup', {
      fullName: 'Demo User', email: 'demo@example.com', password: 'correct-horse',
    }));
    expect(signup.status).toBe(201);
    const oauth = await googlePost(mutation('/api/v1/auth/google', { next: '//evil.example' }));
    expect(oauth.status).toBe(200);
    expect(signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe('https://expenso.example/auth/callback?next=%2Fdashboard');
  });

  it('maps signup and OAuth provider outages to retryable 503 errors', async () => {
    mocks.createClient.mockResolvedValueOnce({
      auth: { signUp: vi.fn().mockResolvedValue({ data: { user: null }, error: { status: 503 } }) },
    });
    const signupResponse = await signupPost(mutation('/api/v1/auth/signup', {
      fullName: 'Demo User', email: 'demo@example.com', password: 'correct-horse',
    }));
    expect(signupResponse.status).toBe(503);
    expect(await errorCode(signupResponse)).toBe('DEPENDENCY_UNAVAILABLE');

    mocks.createClient.mockResolvedValueOnce({
      auth: { signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: null }, error: { status: 503 } }) },
    });
    const oauthResponse = await googlePost(mutation('/api/v1/auth/google', {}));
    expect(oauthResponse.status).toBe(503);
    expect(await errorCode(oauthResponse)).toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('requires verified claims for logout', async () => {
    mocks.requireApiUser.mockRejectedValueOnce(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    const denied = await logoutPost(mutation('/api/v1/auth/logout', {}));
    expect(denied.status).toBe(401);
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.requireApiUser.mockResolvedValueOnce({ client: { auth: { signOut } }, userId, email: profile.email });
    expect((await logoutPost(mutation('/api/v1/auth/logout', {}))).status).toBe(200);
  });

  it('completes OAuth only with an exchangeable code and safe next path', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ auth: { exchangeCodeForSession } });
    const response = await callbackGet(new NextRequest('https://expenso.example/auth/callback?code=abc&next=%2Fprofile'));
    expect(response.headers.get('location')).toBe('https://expenso.example/profile');
    const failed = await callbackGet(new NextRequest('https://expenso.example/auth/callback?next=//evil.example'));
    expect(failed.headers.get('location')).toBe('https://expenso.example/login?error=oauth_failed');
  });
});

describe('profile routes', () => {
  it('rejects unauthenticated /me and returns the session-derived profile', async () => {
    mocks.requireApiUser.mockRejectedValueOnce(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    expect((await meGet(new Request('https://expenso.example/api/v1/me'))).status).toBe(401);
    mocks.requireApiUser.mockResolvedValueOnce({ client: {}, userId, email: profile.email });
    mocks.getProfile.mockResolvedValueOnce(profile);
    const response = await meGet(new Request('https://expenso.example/api/v1/me'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.id).toBe(userId);
  });

  it('validates and updates only the verified current profile', async () => {
    mocks.requireApiUser.mockResolvedValue({ client: {}, userId, email: profile.email });
    let response = await mePatch(mutation('/api/v1/me', { email: 'change@example.com' }));
    expect(response.status).toBe(422);
    mocks.updateProfile.mockResolvedValueOnce({ ...profile, fullName: 'Updated User' });
    response = await mePatch(mutation('/api/v1/me', { fullName: 'Updated User' }));
    expect(response.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith({}, userId, { fullName: 'Updated User' });
  });

  it('routes avatar ticket and completion through session-scoped services', async () => {
    mocks.requireApiUser.mockResolvedValue({ client: {}, userId, email: profile.email });
    mocks.createAvatarUploadTicket.mockResolvedValueOnce({ bucket: 'avatars', path: `${userId}/avatar-id.webp` });
    expect((await avatarTicketPost(mutation('/api/v1/me/avatar/upload-ticket', {
      contentType: 'image/webp', sizeBytes: 1024,
    }))).status).toBe(201);
    mocks.completeAvatarUpload.mockResolvedValueOnce({ ...profile, avatarUrl: 'https://storage.test/avatar.webp' });
    expect((await avatarCompletePost(mutation('/api/v1/me/avatar/complete', {
      path: `${userId}/avatar-00000000-0000-4000-8000-000000000002.webp`,
    }))).status).toBe(200);
  });

  it('fails closed on every protected profile mutation without claims', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    expect((await mePatch(mutation('/api/v1/me', { fullName: 'Blocked' }))).status).toBe(401);
    expect((await avatarTicketPost(mutation('/api/v1/me/avatar/upload-ticket', {
      contentType: 'image/png', sizeBytes: 1024,
    }))).status).toBe(401);
    expect((await avatarCompletePost(mutation('/api/v1/me/avatar/complete', {
      path: `${userId}/avatar-00000000-0000-4000-8000-000000000002.png`,
    }))).status).toBe(401);
  });
});
