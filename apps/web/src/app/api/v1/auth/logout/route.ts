import { AppError } from '@/server/http/errors';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { requireApiUser } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true });
    return ok({ signedOut: true }, requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
