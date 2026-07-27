import { requireAdminSession } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/prisma';
import { loadExportRecords } from '@/lib/rsvp/admin/export';
import { toExportCsv } from '@/lib/rsvp/csvExport';
import { errorResponse } from '@/lib/rsvp/errors';

export const dynamic = 'force-dynamic';

function exportFilename(now: Date): string {
  return `rsvps-${now.toISOString().slice(0, 10)}.csv`;
}

export async function GET(): Promise<Response> {
  try {
    const session = await requireAdminSession();

    if (!session.authorized) {
      return session.response;
    }

    const csv = toExportCsv(await loadExportRecords(getPrismaClient()));

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename(new Date())}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
