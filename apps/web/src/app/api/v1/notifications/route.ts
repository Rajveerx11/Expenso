import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { listNotifications } from '@/server/notifications/notification-service';
import { notificationListQuerySchema } from '@/shared/api/contracts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const query = notificationListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await listNotifications(client, query);
    return ok(result.notifications, requestId, { nextCursor: result.nextCursor });
  } catch (error) { return handleRouteError(error, requestId); }
}
