import { groupMemberAddSchema, uuidSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { addMember, listMembers } from '@/server/groups/group-service';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ groupId: string }> }
const idFor = async (context: Context) => uuidSchema.parse((await context.params).groupId);

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    return ok(await listMembers(client, await idFor(context)), requestId, { isPrivate: true });
  } catch (error) { return handleRouteError(error, requestId); }
}

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const { email } = await parseJson(request, groupMemberAddSchema);
    return ok(await addMember(client, await idFor(context), email), requestId, { status: 201, isPrivate: true });
  } catch (error) { return handleRouteError(error, requestId); }
}
