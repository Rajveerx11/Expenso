import { getCronSecret } from '@/server/config/env';
import { drainWebPushDeliveries, secretMatches, unauthorizedInternalRequest } from '@/server/notifications/delivery';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    if (!secretMatches(request.headers.get('authorization'), getCronSecret())) throw unauthorizedInternalRequest();
    return ok(await drainWebPushDeliveries(25), requestId, { isPrivate: false });
  } catch (error) { return handleRouteError(error, requestId); }
}
