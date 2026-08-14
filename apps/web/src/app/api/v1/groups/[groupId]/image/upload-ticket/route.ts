import { groupImageTicketSchema, uuidSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { createGroupImageTicket } from '@/server/groups/group-service';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ groupId: string }> }

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const groupId = uuidSchema.parse((await context.params).groupId);
    const input = await parseJson(request, groupImageTicketSchema);
    return ok(await createGroupImageTicket(client, groupId, input), requestId, { status: 201, isPrivate: true });
  } catch (error) { return handleRouteError(error, requestId); }
}
