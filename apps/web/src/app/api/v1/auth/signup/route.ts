import { signUpSchema } from '@/shared/api/contracts';
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
    const input = await parseJson(request, signUpSchema);
    const client = await createClient();
    await enforceAuthRateLimit(client, 'signup', input.email, request);
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName } },
    });
    if (error || !data.user) {
      throw mapAuthError(error, 'signup');
    }

    return ok({
      userId: data.user.id,
      emailConfirmationRequired: !data.session,
    }, requestId, { status: 201, isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
