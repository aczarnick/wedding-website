import { getPrismaClient } from '@/lib/prisma';
import { errorResponse, invalidRequest } from '@/lib/rsvp/errors';
import { requireRsvpOpen, searchParties } from '@/lib/rsvp/parties';
import { searchQuerySchema } from '@/lib/rsvp/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams.get('q') ?? '';
    const parsed = searchQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw invalidRequest(parsed.error);
    }

    const client = getPrismaClient();
    await requireRsvpOpen(client);

    return Response.json({ parties: await searchParties(client, parsed.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
