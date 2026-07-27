import { createParty, listParties } from '@/lib/admin/parties';
import { handleAdminRequest, parseJsonBody } from '@/lib/admin/route';
import { createPartySchema } from '@/lib/admin/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(request, async ({ client }) => ({
    parties: await listParties(client),
  }));
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminRequest(
    request,
    async ({ client, actorEmail, ipAddress }) =>
      createParty(client, { actorEmail, ipAddress }, await parseJsonBody(request, createPartySchema)),
    { status: 201 },
  );
}
