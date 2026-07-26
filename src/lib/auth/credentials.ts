import { isAdminEmail } from '@/lib/auth/allowlist';
import { verifyPassword } from '@/lib/auth/scrypt';

/**
 * Verifies a submitted email and password against the configured admin account.
 * Returns false for an unknown email, a wrong password, or unusable
 * configuration — the caller cannot distinguish the cases.
 */
export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const emailMatches = isAdminEmail(email);
  const passwordMatches = await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH ?? '');

  return emailMatches && passwordMatches;
}
