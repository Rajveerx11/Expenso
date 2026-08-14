import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { uuidSchema } from '@/shared/api/contracts';
import { listGroupBalances } from '@/server/shared-expenses/shared-expense-service';

export const dynamic = 'force-dynamic';

interface Context { params: Promise<{ groupId: string }> }

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const groupId = uuidSchema.parse((await context.params).groupId);
    return ok(await listGroupBalances(client, groupId), requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
