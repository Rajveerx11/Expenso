import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { disableWebPushSubscription } from '@/server/notifications/notification-service';
import { uuidSchema } from '@/shared/api/contracts';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ subscriptionId: string }> }
export async function DELETE(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const subscriptionId = uuidSchema.parse((await context.params).subscriptionId);
    await disableWebPushSubscription(client, subscriptionId);
    return ok({ disabled: true, subscriptionId }, requestId);
  } catch (error) { return handleRouteError(error, requestId); }
}
