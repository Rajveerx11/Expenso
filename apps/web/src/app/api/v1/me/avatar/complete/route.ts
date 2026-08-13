import { avatarCompleteSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { completeAvatarUpload } from '@/server/profile/profile-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client, userId } = await requireApiUser();
    const input = await parseJson(request, avatarCompleteSchema);
    return ok(await completeAvatarUpload(client, userId, input.path), requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
