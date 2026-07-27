import { moderateGuest } from '@/lib/admin/guests';
import { handleAdminRequest, parseJsonBody } from '@/lib/admin/route';
import { moderateGuestSchema } from '@/lib/admin/schemas';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleAdminRequest(request, async ({ client, actorEmail, ipAddress }) => {
    const { id } = await context.params;
    const input = await parseJsonBody(request, moderateGuestSchema);

    return moderateGuest(client, { actorEmail, ipAddress }, id, input);
  });
}
