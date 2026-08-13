import { groupPatchSchema, uuidSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { deleteGroup, getGroup, updateGroup } from '@/server/groups/group-service';

export const dynamic = 'force-dynamic';

interface Context { params: Promise<{ groupId: string }> }
const idFor = async (context: Context) => uuidSchema.parse((await context.params).groupId);

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    return ok(await getGroup(client, await idFor(context)), requestId, { isPrivate: true });
  } catch (error) { return handleRouteError(error, requestId); }
}

export async function PATCH(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    return ok(await updateGroup(client, await idFor(context), await parseJson(request, groupPatchSchema)), requestId, { isPrivate: true });
  } catch (error) { return handleRouteError(error, requestId); }
}

export async function DELETE(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const groupId = await idFor(context);
    await deleteGroup(client, groupId);
    return ok({ deleted: true, groupId }, requestId, { isPrivate: true });
  } catch (error) { return handleRouteError(error, requestId); }
}
