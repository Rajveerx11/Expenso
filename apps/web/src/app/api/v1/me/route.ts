import { profilePatchSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { getProfile, updateProfile } from '@/server/profile/profile-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const { client, userId } = await requireApiUser();
    return ok(await getProfile(client, userId), requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client, userId } = await requireApiUser();
    const input = await parseJson(request, profilePatchSchema);
    return ok(await updateProfile(client, userId, input), requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
