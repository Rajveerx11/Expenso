import 'server-only';
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRateLimitSalt, getRateLimitSecret } from '@/server/config/env';
import { AppError } from '@/server/http/errors';

export type AuthRateLimitAction = 'login' | 'signup';

interface LocalRateLimitEntry {
  hitCount: number;
  windowStartedAt: number;
}

const LOCAL_RATE_LIMITS = new Map<string, LocalRateLimitEntry>();
const LOCAL_RATE_LIMIT_MAX_KEYS = 10_000;
const RATE_LIMITS: Record<AuthRateLimitAction, { hitLimit: number; windowMs: number }> = {
  login: { hitLimit: 10, windowMs: 15 * 60 * 1_000 },
  signup: { hitLimit: 5, windowMs: 60 * 60 * 1_000 },
};

function isMissingRateLimitRpc(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'PGRST202';
}

function isRateLimitRpcConfigurationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42501';
}

function enforceLocalAuthRateLimit(action: AuthRateLimitAction, keyHash: string, now = Date.now()): void {
  const { hitLimit, windowMs } = RATE_LIMITS[action];
  const key = `${action}:${keyHash}`;
  const current = LOCAL_RATE_LIMITS.get(key);
  const startsNewWindow = !current || current.windowStartedAt <= now - windowMs;
  const windowStartedAt = startsNewWindow
    ? now
    : current.windowStartedAt;
  const hitCount = startsNewWindow ? 1 : current.hitCount + 1;

  if (!current && LOCAL_RATE_LIMITS.size >= LOCAL_RATE_LIMIT_MAX_KEYS) {
    for (const [candidateKey, entry] of LOCAL_RATE_LIMITS) {
      const candidateAction = candidateKey.slice(0, candidateKey.indexOf(':')) as AuthRateLimitAction;
      if (entry.windowStartedAt <= now - RATE_LIMITS[candidateAction].windowMs) {
        LOCAL_RATE_LIMITS.delete(candidateKey);
      }
    }
    if (LOCAL_RATE_LIMITS.size >= LOCAL_RATE_LIMIT_MAX_KEYS) {
      throw new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true });
    }
  }
  LOCAL_RATE_LIMITS.set(key, { hitCount, windowStartedAt });
  if (hitCount > hitLimit) {
    throw new AppError({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAt + windowMs - now) / 1_000)),
    });
  }
}

function requestAddress(request: Request): string {
  const forwarded = request.headers.get('x-vercel-forwarded-for')
    ?? request.headers.get('x-forwarded-for')
    ?? request.headers.get('x-real-ip');
  return forwarded?.split(',', 1)[0].trim() || 'unknown';
}

export function rateLimitFingerprint(request: Request, identity: string): string {
  return createHmac('sha256', getRateLimitSalt())
    .update(`${requestAddress(request)}\n${identity.trim().toLowerCase()}`)
    .digest('hex');
}

export async function enforceAuthRateLimit(
  client: SupabaseClient,
  action: AuthRateLimitAction,
  identity: string,
  request: Request,
): Promise<void> {
  const keyHash = rateLimitFingerprint(request, identity);
  const { data, error } = await client.rpc('check_auth_rate_limit', {
    action_param: action,
    key_hash_param: keyHash,
    secret_param: getRateLimitSecret(),
  });
  if (error) {
    if (isRateLimitRpcConfigurationError(error)) {
      // A stale or missing Vault value must not take all authentication offline.
      // Supabase Auth still applies its provider limits; this bounded fallback adds
      // per-process protection until RATE_LIMIT_SECRET and Vault are synchronized.
      console.error(JSON.stringify({
        level: 'error',
        code: 'AUTH_RATE_LIMIT_CONFIGURATION_MISMATCH',
        action,
      }));
      enforceLocalAuthRateLimit(action, keyHash);
      return;
    }
    if (process.env.NODE_ENV !== 'production' && isMissingRateLimitRpc(error)) {
      enforceLocalAuthRateLimit(action, keyHash);
      return;
    }
    throw new AppError({
      code: 'DEPENDENCY_UNAVAILABLE',
      status: 503,
      retryable: true,
      cause: error,
    });
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || result.allowed !== true) {
    throw new AppError({
      code: 'RATE_LIMITED',
      status: 429,
      retryable: true,
      retryAfterSeconds: Number(result?.retry_after_seconds ?? 60),
    });
  }
}
