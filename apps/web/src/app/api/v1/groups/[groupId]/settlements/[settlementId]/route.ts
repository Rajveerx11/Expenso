import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { uuidSchema } from '@/shared/api/contracts';
import { getSettlement } from '@/server/settlements/settlement-service';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ groupId: string; settlementId: string }> }

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const params = await context.params;
    return ok(await getSettlement(client, uuidSchema.parse(params.groupId), uuidSchema.parse(params.settlementId)), requestId);
  } catch (error) { return handleRouteError(error, requestId); }
}
