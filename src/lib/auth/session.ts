import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';

export type AdminSessionResult =
  | { authorized: true; email: string }
  | { authorized: false; response: Response };

function deny(status: number, message: string): AdminSessionResult {
  return {
    authorized: false,
    response: Response.json({ error: message }, { status }),
  };
}

/**
 * Resolves the current admin session for use in route handlers.
 * Returns 401 when unauthenticated and 403 when the authenticated address is
 * no longer allowlisted, so revoking an admin takes effect on the next request
 * rather than at token expiry.
 */
export async function requireAdminSession(): Promise<AdminSessionResult> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return deny(401, 'Authentication required');
  }

  if (!isAdminEmail(email)) {
    return deny(403, 'Not authorized');
  }

  return { authorized: true, email };
}
