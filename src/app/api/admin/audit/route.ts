import { queryAuditLog } from '@/lib/admin/audit';
import { handleAdminRequest } from '@/lib/admin/route';
import { auditQuerySchema } from '@/lib/admin/schemas';
import { invalidRequest } from '@/lib/rsvp/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleAdminRequest(request, async ({ client }) => {
    const { searchParams } = new URL(request.url);
    const parsed = auditQuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!parsed.success) {
      throw invalidRequest(parsed.error);
    }

    return queryAuditLog(client, parsed.data);
  });
}
