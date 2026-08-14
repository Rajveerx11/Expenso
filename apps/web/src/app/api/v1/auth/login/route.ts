import { loginSchema } from '@/shared/api/contracts';
import { mapAuthError } from '@/server/http/errors';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { createClient } from '@/server/supabase/server';
import { enforceAuthRateLimit } from '@/server/auth/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const input = await parseJson(request, loginSchema);
    const client = await createClient();
    await enforceAuthRateLimit(client, 'login', input.email, request);
    const { data, error } = await client.auth.signInWithPassword(input);
    if (error || !data.user) {
      throw mapAuthError(error, 'login');
    }
    return ok({ userId: data.user.id }, requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
