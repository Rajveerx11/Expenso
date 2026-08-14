import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { uuidSchema } from '@/shared/api/contracts';
import {
  deleteGroupExpense,
  getGroupExpense,
} from '@/server/shared-expenses/shared-expense-service';

export const dynamic = 'force-dynamic';

interface Context { params: Promise<{ groupId: string; expenseId: string }> }

async function idsFor(context: Context) {
  const params = await context.params;
  return { groupId: uuidSchema.parse(params.groupId), expenseId: uuidSchema.parse(params.expenseId) };
}

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const { groupId, expenseId } = await idsFor(context);
    return ok(await getGroupExpense(client, groupId, expenseId), requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}

export async function DELETE(request: Request, context: Context) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client } = await requireApiUser();
    const { groupId, expenseId } = await idsFor(context);
    await deleteGroupExpense(client, groupId, expenseId);
    return ok({ deleted: true, expenseId }, requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
