import { createGuest, listGuests } from '@/lib/admin/guests';
import { handleAdminRequest, parseJsonBody } from '@/lib/admin/route';
import { createGuestSchema, guestListQuerySchema } from '@/lib/admin/schemas';
import { invalidRequest } from '@/lib/rsvp/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(request, async ({ client }) => {
    const { searchParams } = new URL(request.url);
    const parsed = guestListQuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!parsed.success) {
      throw invalidRequest(parsed.error);
    }

    return { guests: await listGuests(client, parsed.data) };
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(
    request,
    async ({ client, actorEmail, ipAddress }) =>
      createGuest(client, { actorEmail, ipAddress }, await parseJsonBody(request, createGuestSchema)),
    { status: 201 },
  );
}
