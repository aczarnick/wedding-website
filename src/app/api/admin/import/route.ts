import { requireAdminSession } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/prisma';
import { importParties } from '@/lib/rsvp/admin/import';
import { clientIpAddress } from '@/lib/rsvp/clientIp';
import { MAX_IMPORT_BYTES } from '@/lib/rsvp/csvSchemas';
import { csvTooLarge, errorResponse } from '@/lib/rsvp/errors';

export const dynamic = 'force-dynamic';

function tooLarge() {
  return csvTooLarge(`The file exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MB limit`);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAdminSession();

    if (!session.authorized) {
      return session.response;
    }

    const declaredLength = Number(request.headers.get('content-length') ?? '0');

    if (declaredLength > MAX_IMPORT_BYTES) {
      throw tooLarge();
    }

    const text = await request.text();

    // The declared length may be absent or wrong, so the decoded body is
    // re-checked against the same limit.
    if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
      throw tooLarge();
    }

    const summary = await importParties(
      getPrismaClient(),
      text,
      session.email,
      clientIpAddress(request),
    );

    return Response.json(summary, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
