import { isAdminEmail } from '@/lib/auth/allowlist';
import { verifyPassword } from '@/lib/auth/scrypt';

/**
 * Verifies a submitted email and password against the configured admin account.
 * Returns false for an unknown email, a wrong password, or unusable
 * configuration — the caller cannot distinguish the cases.
 */
export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  if (!isAdminEmail(email)) {
    return false;
  }

  return verifyPassword(password, process.env.ADMIN_PASSWORD_HASH ?? '');
}
