import { AppError } from '@/server/http/errors';
import { fail, handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { getRuntimeConfig } from '@/server/config/env';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const { supabaseUrl, supabasePublishableKey } = getRuntimeConfig();
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabasePublishableKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return fail(new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true }), requestId);
    }
    return ok({ status: 'ready' as const }, requestId, { isPrivate: false });
  } catch (error) {
    if (error instanceof AppError && error.code === 'DEPENDENCY_UNAVAILABLE') {
      return handleRouteError(error, requestId);
    }
    return fail(
      new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true, cause: error }),
      requestId,
    );
  }
}
