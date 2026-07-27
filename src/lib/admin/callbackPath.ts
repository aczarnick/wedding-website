const ADMIN_ROOT = '/admin';
const PATH_ONLY_BASE = 'http://callback.invalid';

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_ROOT || pathname.startsWith(`${ADMIN_ROOT}/`);
}

/**
 * Resolves the `callbackUrl` a sign-in redirect carries into a safe destination.
 *
 * `src/proxy.ts` writes the *absolute* request URL into that parameter, so the
 * value is attacker-controllable via a crafted `/signin?callbackUrl=` link.
 * Only the path is ever returned, and only when it addresses the admin console
 * this page guards; anything else falls back to the dashboard.
 */
export function resolveAdminCallbackPath(raw: string | undefined): string {
  if (!raw || raw.startsWith('//')) {
    return ADMIN_ROOT;
  }

  let url: URL;

  try {
    url = new URL(raw, PATH_ONLY_BASE);
  } catch {
    return ADMIN_ROOT;
  }

  return isAdminPath(url.pathname) ? `${url.pathname}${url.search}` : ADMIN_ROOT;
}
