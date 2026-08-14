import { uuidSchema, personalTransactionPatchSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import {
  deletePersonalTransaction,
  getPersonalTransaction,
  updatePersonalTransaction,
} from '@/server/personal-finance/personal-finance-service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ expenseId: string }>;
}

async function expenseIdFor(context: RouteContext): Promise<string> {
  return uuidSchema.parse((await context.params).expenseId);
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    return ok(await getPersonalTransaction(client, await expenseIdFor(context)), requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const expenseId = await expenseIdFor(context);
    const patch = await parseJson(request, personalTransactionPatchSchema);
    return ok(await updatePersonalTransaction(client, expenseId, patch), requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const expenseId = await expenseIdFor(context);
    await deletePersonalTransaction(client, expenseId);
    return ok({ deleted: true, expenseId }, requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
