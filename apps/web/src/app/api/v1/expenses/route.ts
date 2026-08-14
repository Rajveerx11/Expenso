import { AppError } from '@/server/http/errors';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import {
  personalTransactionCreateSchema,
  personalTransactionListQuerySchema,
} from '@/shared/api/contracts';
import {
  createPersonalTransaction,
  listPersonalTransactions,
} from '@/server/personal-finance/personal-finance-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const url = new URL(request.url);
    const query = personalTransactionListQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await listPersonalTransactions(client, query);
    return ok(result.transactions, requestId, { isPrivate: true, nextCursor: result.nextCursor });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}

export async function POST(request: Request) {
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
    const input = await parseJson(request, personalTransactionCreateSchema);
    const result = await createPersonalTransaction(client, input, idempotencyKey);
    return ok(result, requestId, { status: 201, isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
