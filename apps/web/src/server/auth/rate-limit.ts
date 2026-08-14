import 'server-only';
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRateLimitSalt, getRateLimitSecret } from '@/server/config/env';
import { AppError } from '@/server/http/errors';

export type AuthRateLimitAction = 'login' | 'signup' | 'google';

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
  const { data, error } = await client.rpc('check_auth_rate_limit', {
    action_param: action,
    key_hash_param: rateLimitFingerprint(request, identity),
    secret_param: getRateLimitSecret(),
  });
  if (error) {
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
