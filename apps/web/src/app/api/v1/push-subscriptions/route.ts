import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { upsertWebPushSubscription } from '@/server/notifications/notification-service';
import { webPushSubscriptionSchema } from '@/shared/api/contracts';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    return ok(await upsertWebPushSubscription(client, await parseJson(request, webPushSubscriptionSchema)), requestId, { status: 201 });
  } catch (error) { return handleRouteError(error, requestId); }
}
