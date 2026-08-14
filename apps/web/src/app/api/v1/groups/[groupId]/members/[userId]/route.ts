import { uuidSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { removeMember } from '@/server/groups/group-service';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ groupId: string; userId: string }> }

export async function DELETE(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const params = await context.params;
    const groupId = uuidSchema.parse(params.groupId);
    const userId = uuidSchema.parse(params.userId);
    await removeMember(client, groupId, userId);
    return ok({ removed: true, groupId, userId }, requestId, { isPrivate: true });
  } catch (error) { return handleRouteError(error, requestId); }
}
