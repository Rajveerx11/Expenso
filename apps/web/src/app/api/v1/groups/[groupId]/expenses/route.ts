import { AppError } from '@/server/http/errors';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import {
  groupExpenseCreateSchema,
  groupExpenseListQuerySchema,
  uuidSchema,
} from '@/shared/api/contracts';
import {
  createGroupExpense,
  listGroupExpenses,
} from '@/server/shared-expenses/shared-expense-service';
import { scheduleNotificationDelivery } from '@/server/notifications/delivery';

export const dynamic = 'force-dynamic';

interface Context { params: Promise<{ groupId: string }> }
const idFor = async (context: Context) => uuidSchema.parse((await context.params).groupId);

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const query = groupExpenseListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await listGroupExpenses(client, await idFor(context), query);
    return ok(result.expenses, requestId, { isPrivate: true, nextCursor: result.nextCursor });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new AppError({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        status: 428,
        fieldErrors: { _form: ['A valid Idempotency-Key header is required.'] },
      });
    }
    const result = await createGroupExpense(
      client,
      await idFor(context),
      await parseJson(request, groupExpenseCreateSchema),
      idempotencyKey,
    );
    scheduleNotificationDelivery();
    return ok(result, requestId, { status: 201, isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
