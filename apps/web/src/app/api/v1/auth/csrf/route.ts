import type { NextRequest } from 'next/server';
import { createCsrfToken, CSRF_COOKIE_NAME, setCsrfCookie } from '@/server/http/security';
import { ok, requestIdFor } from '@/server/http/response';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const requestId = requestIdFor(request);
  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const csrfToken = existing ?? createCsrfToken();
  const response = ok({ csrfToken }, requestId, { isPrivate: true });
  if (!existing) setCsrfCookie(response, csrfToken);
  return response;
}
