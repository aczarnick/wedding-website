import { handleAdminRequest, parseJsonBody } from '@/lib/admin/route';
import { updateSettingsSchema } from '@/lib/admin/schemas';
import { getSettings, updateSettings } from '@/lib/admin/settings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(request, ({ client }) => getSettings(client));
}

export async function PATCH(request: Request): Promise<Response> {
  return handleAdminRequest(request, async ({ client, actorEmail, ipAddress }) =>
    updateSettings(
      client,
      { actorEmail, ipAddress },
      await parseJsonBody(request, updateSettingsSchema),
    ),
  );
}
