import { getParty, softDeleteParty, updateParty } from '@/lib/admin/parties';
import { handleAdminRequest, parseJsonBody } from '@/lib/admin/route';
import { updatePartySchema } from '@/lib/admin/schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleAdminRequest(request, async ({ client }) => {
    const { id } = await context.params;

    return getParty(client, id);
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return handleAdminRequest(request, async ({ client, actorEmail, ipAddress }) => {
    const { id } = await context.params;
    const input = await parseJsonBody(request, updatePartySchema);

    return updateParty(client, { actorEmail, ipAddress }, id, input);
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handleAdminRequest(request, async ({ client, actorEmail, ipAddress }) => {
    const { id } = await context.params;

    return softDeleteParty(client, { actorEmail, ipAddress }, id);
  });
}
