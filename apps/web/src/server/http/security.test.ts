import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { assertMutationRequest, contentSecurityPolicy, safeRelativePath } from './security';

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
    expect(safeRelativePath('https://evil.example')).toBe('/dashboard');
  });
});

describe('content security policy', () => {
  it('uses a per-request script nonce without unsafe inline scripts', () => {
    const policy = contentSecurityPolicy('testnonce');
    expect(policy).toContain("script-src 'self' 'nonce-testnonce' 'strict-dynamic'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
