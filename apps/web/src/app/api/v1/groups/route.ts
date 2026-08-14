import { groupCreateSchema, groupListQuerySchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { createGroup, listGroups } from '@/server/groups/group-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const query = groupListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await listGroups(client, query);
    return ok(result.groups, requestId, { nextCursor: result.nextCursor, isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const input = await parseJson(request, groupCreateSchema);
    return ok(await createGroup(client, input), requestId, { status: 201, isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
