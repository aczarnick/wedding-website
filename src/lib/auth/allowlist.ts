const ALLOWLIST_SEPARATOR = ',';

function parseAllowlist(): string[] {
  return (process.env.ADMIN_EMAIL ?? '')
    .split(ALLOWLIST_SEPARATOR)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Reports whether an address is authorized for admin access.
 * `ADMIN_EMAIL` is treated as a comma-separated allowlist — one entry today.
 * An unset or empty value denies everyone.
 */
export function isAdminEmail(email: string): boolean {
  const candidate = email.trim().toLowerCase();

  if (candidate.length === 0) {
    return false;
  }

  return parseAllowlist().includes(candidate);
}
