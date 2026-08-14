import { requireApiUser } from '@/server/auth/session';
import { AppError } from '@/server/http/errors';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { confirmSettlement } from '@/server/settlements/settlement-service';
import { uuidSchema } from '@/shared/api/contracts';
import { scheduleNotificationDelivery } from '@/server/notifications/delivery';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ groupId: string; settlementId: string }> }

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    if ((await request.text()).trim()) throw new AppError({ code: 'VALIDATION_ERROR', status: 422 });
    const params = await context.params;
    const settlement = await confirmSettlement(client, uuidSchema.parse(params.groupId), uuidSchema.parse(params.settlementId));
    scheduleNotificationDelivery();
    return ok(settlement, requestId);
  } catch (error) { return handleRouteError(error, requestId); }
}
