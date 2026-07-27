import { getPrismaClient } from '@/lib/prisma';
import { clientIpAddress } from '@/lib/rsvp/clientIp';
import { errorResponse, invalidRequest } from '@/lib/rsvp/errors';
import { submitRsvp } from '@/lib/rsvp/parties';
import { submitRsvpSchema } from '@/lib/rsvp/schemas';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const parsed = submitRsvpSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw invalidRequest(parsed.error);
    }

    const detail = await submitRsvp(getPrismaClient(), id, parsed.data, clientIpAddress(request));

    return Response.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
