import { getGuest, softDeleteGuest, updateGuest } from '@/lib/admin/guests';
import { handleAdminRequest, parseJsonBody } from '@/lib/admin/route';
import { updateGuestSchema } from '@/lib/admin/schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleAdminRequest(request, async ({ client }) => {
    const { id } = await context.params;

    return getGuest(client, id);
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return handleAdminRequest(request, async ({ client, actorEmail, ipAddress }) => {
    const { id } = await context.params;
    const input = await parseJsonBody(request, updateGuestSchema);

    return updateGuest(client, { actorEmail, ipAddress }, id, input);
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handleAdminRequest(request, async ({ client, actorEmail, ipAddress }) => {
    const { id } = await context.params;

    return softDeleteGuest(client, { actorEmail, ipAddress }, id);
  });
}
