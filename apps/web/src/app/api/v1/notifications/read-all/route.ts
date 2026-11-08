import { AppError } from '@/server/http/errors';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { markAllNotificationsRead } from '@/server/notifications/notification-service';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    if ((await request.text()).trim()) throw new AppError({ code: 'VALIDATION_ERROR', status: 422 });
    return ok({ read: true, updatedCount: await markAllNotificationsRead(client) }, requestId);
  } catch (error) { return handleRouteError(error, requestId); }
}
