import { groupImageCompleteSchema, uuidSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { completeGroupImage } from '@/server/groups/group-service';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ groupId: string }> }

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const groupId = uuidSchema.parse((await context.params).groupId);
    const { path } = await parseJson(request, groupImageCompleteSchema);
    return ok(await completeGroupImage(client, groupId, path), requestId, { isPrivate: true });
  } catch (error) { return handleRouteError(error, requestId); }
}
