export interface AdminNavLink {
  label: string;
  href: string;
}

/**
 * Drives the admin console navigation. Issues #69 (party/guest management) and
 * #70 (import/export, change log, settings) append their routes here.
 */
export const ADMIN_NAV_LINKS: readonly AdminNavLink[] = [{ label: 'Dashboard', href: '/admin' }];
