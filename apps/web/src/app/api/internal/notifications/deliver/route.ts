import { z } from 'zod';
import { getDatabaseWebhookSecret } from '@/server/config/env';
import { drainWebPushDeliveries, secretMatches, unauthorizedInternalRequest } from '@/server/notifications/delivery';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';

const compactWebhookSchema = z.strictObject({ notificationId: z.uuid() });
const supabaseInsertWebhookSchema = z.strictObject({
  type: z.literal('INSERT'),
  table: z.literal('notifications'),
  schema: z.literal('public'),
  record: z.object({ id: z.uuid() }).passthrough(),
  old_record: z.unknown().optional(),
});
const webhookSchema = z.union([compactWebhookSchema, supabaseInsertWebhookSchema]);
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    if (!secretMatches(request.headers.get('authorization'), getDatabaseWebhookSecret())) throw unauthorizedInternalRequest();
    const payload = await parseJson(request, webhookSchema);
    const notificationId = 'notificationId' in payload ? payload.notificationId : payload.record.id;
    return ok(await drainWebPushDeliveries(25, notificationId), requestId, { isPrivate: false });
  } catch (error) { return handleRouteError(error, requestId); }
}
