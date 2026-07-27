import type { ZodType } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { requireAdminSession } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/prisma';
import { clientIpAddress } from '@/lib/rsvp/clientIp';
import { errorResponse, invalidRequest, RsvpError } from '@/lib/rsvp/errors';

export interface AdminContext {
  client: PrismaClient;
  actorEmail: string;
  ipAddress: string | null;
}

/**
 * Runs an admin route handler behind the session check, supplying the database
 * client and the request metadata every audited mutation needs. The session is
 * resolved here rather than per route so a handler cannot omit it, and because
 * the resolved address is what the change log attributes the write to.
 */
export async function handleAdminRequest(
  request: Request,
  handler: (context: AdminContext) => Promise<unknown>,
  options: { status?: number } = {},
): Promise<Response> {
  const session = await requireAdminSession();

  if (!session.authorized) {
    return session.response;
  }

  try {
    const body = await handler({
      client: getPrismaClient(),
      actorEmail: session.email,
      ipAddress: clientIpAddress(request),
    });

    return Response.json(body, { status: options.status ?? 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Reads and validates a JSON request body, failing as a 400 either way. */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new RsvpError(400, 'invalid_request', 'Request body must be valid JSON');
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw invalidRequest(parsed.error);
  }

  return parsed.data;
}
