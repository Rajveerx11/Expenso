import { AppError } from '@/server/http/errors';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { markNotificationRead } from '@/server/notifications/notification-service';
import { uuidSchema } from '@/shared/api/contracts';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ notificationId: string }> }
export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    if ((await request.text()).trim()) throw new AppError({ code: 'VALIDATION_ERROR', status: 422 });
    const notificationId = uuidSchema.parse((await context.params).notificationId);
    await markNotificationRead(client, notificationId);
    return ok({ read: true, notificationId }, requestId);
  } catch (error) { return handleRouteError(error, requestId); }
}
