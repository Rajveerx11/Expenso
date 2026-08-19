import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { assertMutationRequest, contentSecurityPolicy, getRequestOrigin, safeRelativePath } from './security';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rspuqbcgjqezimwwpbzl.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://expenso.example';
  process.env.APP_ALLOWED_ORIGINS = 'https://preview.expenso.example';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function mutation(options: { origin?: string; cookie?: string; token?: string; fetchSite?: string } = {}) {
  const headers = new Headers();
  if (options.origin) headers.set('origin', options.origin);
  if (options.cookie) headers.set('cookie', options.cookie);
  if (options.token) headers.set('x-csrf-token', options.token);
  if (options.fetchSite) headers.set('sec-fetch-site', options.fetchSite);
  return new Request('https://expenso.example/api/v1/me', { method: 'PATCH', headers });
}

describe('mutation boundary', () => {
  it('accepts same-origin requests with matching double-submit tokens', () => {
    expect(() => assertMutationRequest(mutation({
      origin: 'https://expenso.example',
      cookie: 'expenso.csrf=secret-token',
      token: 'secret-token',
      fetchSite: 'same-origin',
    }))).not.toThrow();
  });

  it('binds Origin to the public Host header when the framework request URL is internal', () => {
    process.env.APP_ALLOWED_ORIGINS = 'http://127.0.0.1:3100';
    const request = new Request('http://localhost:3000/api/v1/me', {
      method: 'PATCH',
      headers: {
        host: '127.0.0.1:3100',
        origin: 'http://127.0.0.1:3100',
        cookie: 'expenso.csrf=secret-token',
        'x-csrf-token': 'secret-token',
        'sec-fetch-site': 'same-origin',
      },
    });
    expect(() => assertMutationRequest(request)).not.toThrow();
  });

  it('does not trust a forwarded host that disagrees with the public Host header', () => {
    const request = new Request('https://internal.example/api/v1/me', {
      method: 'PATCH',
      headers: {
        host: 'internal.example',
        'x-forwarded-host': 'preview.expenso.example',
        origin: 'https://preview.expenso.example',
        cookie: 'expenso.csrf=secret-token',
        'x-csrf-token': 'secret-token',
      },
    });
    expect(() => assertMutationRequest(request)).toThrowError(AppError);
  });

  it.each([
    mutation({ cookie: 'expenso.csrf=secret-token', token: 'secret-token' }),
    mutation({ origin: 'https://evil.example', cookie: 'expenso.csrf=secret-token', token: 'secret-token' }),
    new Request('https://expenso.example/api/v1/me', {
      method: 'PATCH',
      headers: {
        origin: 'https://preview.expenso.example',
        cookie: 'expenso.csrf=secret-token',
        'x-csrf-token': 'secret-token',
      },
    }),
    mutation({ origin: 'https://expenso.example', cookie: 'expenso.csrf=one', token: 'two' }),
    mutation({ origin: 'https://expenso.example', cookie: 'expenso.csrf=secret-token', token: 'secret-token', fetchSite: 'cross-site' }),
  ])('rejects missing, cross-origin, or invalid CSRF requests', (request) => {
    expect(() => assertMutationRequest(request)).toThrowError(AppError);
  });
});

describe('safe redirects', () => {
  it('keeps local paths and rejects protocol-relative or backslash paths', () => {
    expect(safeRelativePath('/groups/123?tab=balances')).toBe('/groups/123?tab=balances');
    expect(safeRelativePath('//evil.example')).toBe('/dashboard');
    expect(safeRelativePath('/\\evil.example')).toBe('/dashboard');
    expect(safeRelativePath('/\nevil.example')).toBe('/dashboard');
    expect(safeRelativePath('/\t/evil.example')).toBe('/dashboard');
    expect(safeRelativePath('/%0D/evil.example')).toBe('/dashboard');
    expect(safeRelativePath('https://evil.example')).toBe('/dashboard');
  });

  it('determines the public request origin matching allowed origins or falls back to configured siteUrl', () => {
    const originReq = new Request('https://expenso.example/api/v1/auth/signup', {
      headers: { origin: 'https://preview.expenso.example' },
    });
    expect(getRequestOrigin(originReq)).toBe('https://preview.expenso.example');

    const hostReq = new Request('http://localhost:3000/auth/callback', {
      headers: {
        'x-forwarded-host': 'preview.expenso.example',
        'x-forwarded-proto': 'https',
      },
    });
    expect(getRequestOrigin(hostReq)).toBe('https://preview.expenso.example');

    const unknownReq = new Request('https://expenso.example/api/v1/auth/signup', {
      headers: { origin: 'https://evil.example' },
    });
    expect(getRequestOrigin(unknownReq)).toBe('https://expenso.example');
  });
});

describe('content security policy', () => {
  it('allows self, unsafe-inline, and unsafe-eval for Next.js and scripts without cross-origin leaks', () => {
    const policy = contentSecurityPolicy();
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain('connect-src \'self\' https://rspuqbcgjqezimwwpbzl.supabase.co wss://rspuqbcgjqezimwwpbzl.supabase.co');
    expect(policy).not.toContain('https://*.supabase.co');
    expect(policy).not.toContain('wss://*.supabase.co');
    expect(policy).not.toContain('https://attacker.supabase.co');
    expect(policy).toContain('img-src \'self\' data: blob: https://rspuqbcgjqezimwwpbzl.supabase.co https://lh3.googleusercontent.com');
    expect(policy).not.toContain('https://*.googleusercontent.com');
  });
});
