import { oauthSchema } from '@/shared/api/contracts';
import { mapAuthError } from '@/server/http/errors';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest, safeRelativePath } from '@/server/http/security';
import { getRuntimeConfig } from '@/server/config/env';
import { createClient } from '@/server/supabase/server';
import { enforceAuthRateLimit } from '@/server/auth/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const input = await parseJson(request, oauthSchema);
    const next = safeRelativePath(input.next ?? null);
    const { siteUrl } = getRuntimeConfig();
    const redirectTo = new URL('/auth/callback', siteUrl);
    redirectTo.searchParams.set('next', next);

    const client = await createClient();
    await enforceAuthRateLimit(client, 'google', 'google-oauth', request);
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      throw mapAuthError(error, 'oauth');
    }
    return ok({ url: data.url }, requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
