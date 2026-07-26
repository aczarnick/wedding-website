import { getPrismaClient } from '@/lib/prisma';
import { errorResponse } from '@/lib/rsvp/errors';
import { getPartyDetail, requireRsvpOpen } from '@/lib/rsvp/parties';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const client = getPrismaClient();
    const deadline = await requireRsvpOpen(client);

    return Response.json(await getPartyDetail(client, id, deadline));
  } catch (error) {
    return errorResponse(error);
  }
}
