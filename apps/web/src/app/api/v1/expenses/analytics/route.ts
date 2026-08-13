import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, requestIdFor } from '@/server/http/response';
import { monthSchema } from '@/shared/api/contracts';
import { getPersonalAnalytics } from '@/server/personal-finance/personal-finance-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const { client } = await requireApiUser();
    const month = monthSchema.parse(new URL(request.url).searchParams.get('month'));
    return ok(await getPersonalAnalytics(client, month), requestId, { isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
