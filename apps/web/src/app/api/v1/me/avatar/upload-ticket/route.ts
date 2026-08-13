import { avatarTicketSchema } from '@/shared/api/contracts';
import { requireApiUser } from '@/server/auth/session';
import { handleRouteError, ok, parseJson, requestIdFor } from '@/server/http/response';
import { assertMutationRequest } from '@/server/http/security';
import { createAvatarUploadTicket } from '@/server/profile/profile-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    assertMutationRequest(request);
    const { client, userId } = await requireApiUser();
    const input = await parseJson(request, avatarTicketSchema);
    const ticket = await createAvatarUploadTicket(client, userId, input);
    return ok(ticket, requestId, { status: 201, isPrivate: true });
  } catch (error) {
    return handleRouteError(error, requestId);
  }
}
