import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceAuthRateLimit, rateLimitFingerprint } from './rate-limit';
import { AppError, mapAuthError } from '@/server/http/errors';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.RATE_LIMIT_SALT = '12345678901234567890123456789012';
  process.env.RATE_LIMIT_SECRET = 'abcdefghijklmnopqrstuvwxyz123456';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('auth rate limiting', () => {
  it('creates a stable opaque fingerprint without retaining the raw identity', () => {
    const request = new Request('https://expenso.example/api/v1/auth/login', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.10' },
    });
    const fingerprint = rateLimitFingerprint(request, 'Demo@Example.com');
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).not.toContain('demo@example.com');
    expect(rateLimitFingerprint(request, 'demo@example.com')).toBe(fingerprint);
  });

  it('returns a stable retryable 429 with Retry-After data', async () => {
    const rpcCalls: unknown[][] = [];
    const client = {
      rpc: async (...args: unknown[]) => {
        rpcCalls.push(args);
        return { data: [{ allowed: false, retry_after_seconds: 90 }], error: null };
      },
    } as unknown as SupabaseClient;
    await expect(enforceAuthRateLimit(
      client,
      'login',
      'demo@example.com',
      new Request('https://expenso.example/api/v1/auth/login'),
    )).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 90,
    } satisfies Partial<AppError>);
    expect(rpcCalls[0][1]).toMatchObject({
      secret_param: 'abcdefghijklmnopqrstuvwxyz123456',
    });
  });

  it('keeps auth available with a bounded fallback when the Vault secret is mismatched', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = {
      rpc: async () => ({ data: null, error: { code: '42501', message: 'Rate limit authorization failed' } }),
    } as unknown as SupabaseClient;
    const request = new Request('https://expenso.example/api/v1/auth/signup', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.12' },
    });
    const identity = `mismatched-vault-${crypto.randomUUID()}@example.com`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(enforceAuthRateLimit(client, 'signup', identity, request)).resolves.toBeUndefined();
    }
    await expect(enforceAuthRateLimit(client, 'signup', identity, request)).rejects.toMatchObject({
      code: 'RATE_LIMITED', status: 429, retryable: true, retryAfterSeconds: 3600,
    } satisfies Partial<AppError>);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('AUTH_RATE_LIMIT_CONFIGURATION_MISMATCH'));
  });

  it('uses a bounded local throttle when the RPC is absent outside production', async () => {
    const client = {
      rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Function not found' } }),
    } as unknown as SupabaseClient;
    const request = new Request('https://expenso.example/api/v1/auth/login', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.11' },
    });
    const identity = `missing-rpc-${crypto.randomUUID()}@example.com`;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(enforceAuthRateLimit(client, 'login', identity, request)).resolves.toBeUndefined();
    }
    await expect(enforceAuthRateLimit(client, 'login', identity, request)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
      retryAfterSeconds: 900,
    } satisfies Partial<AppError>);
  });

  it('keeps production fail-closed when the RPC is absent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const client = {
      rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Function not found' } }),
    } as unknown as SupabaseClient;

    try {
      await expect(enforceAuthRateLimit(
        client,
        'login',
        'production@example.com',
        new Request('https://expenso.example/api/v1/auth/login'),
      )).rejects.toMatchObject({
        code: 'DEPENDENCY_UNAVAILABLE',
        status: 503,
        retryable: true,
      } satisfies Partial<AppError>);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('Supabase Auth error mapping', () => {
  it('distinguishes invalid credentials, throttling, and outages', () => {
    expect(mapAuthError({ status: 400 } as never, 'login')).toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
    expect(mapAuthError({ status: 429 } as never, 'login')).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    expect(mapAuthError({ status: 503 } as never, 'signup')).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', status: 503 });
  });
});
