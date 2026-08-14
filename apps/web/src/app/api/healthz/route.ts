import { ok, requestIdFor } from '@/server/http/response';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const requestId = requestIdFor(request);
  return ok({ status: 'ok' as const }, requestId, { isPrivate: false });
}
