import { requireApiUser } from '@/server/auth/session';
import { getVapidPublicKey } from '@/server/config/env';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    await requireApiUser();
    return ok({ publicKey: getVapidPublicKey() }, requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
