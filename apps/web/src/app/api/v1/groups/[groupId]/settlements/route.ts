import { AppError } from '@/server/http/errors';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { settlementCreateSchema, settlementListQuerySchema, uuidSchema } from '@/shared/api/contracts';
import { createSettlement, listSettlements } from '@/server/settlements/settlement-service';
import { scheduleNotificationDelivery } from '@/server/notifications/delivery';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ groupId: string }> }
const groupIdFor = async (context: Context) => uuidSchema.parse((await context.params).groupId);

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const query = settlementListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await listSettlements(client, await groupIdFor(context), query);
    return ok(result.settlements, requestId, { nextCursor: result.nextCursor });
  } catch (error) { return handleRouteError(error, requestId); }
}

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new AppError({ code: 'IDEMPOTENCY_KEY_REQUIRED', status: 428 });
    }
    const result = await createSettlement(
      client, await groupIdFor(context), await parseJson(request, settlementCreateSchema), idempotencyKey,
    );
    scheduleNotificationDelivery();
    return ok(result, requestId, { status: 201 });
  } catch (error) { return handleRouteError(error, requestId); }
}
