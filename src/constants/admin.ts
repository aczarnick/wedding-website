import type { AuditAction } from '@/lib/enums';

export interface AdminNavLink {
  label: string;
  href: string;
}

/**
 * Drives the admin console navigation. Issue #69 (party/guest management)
 * appends its routes here.
 */
export const ADMIN_NAV_LINKS: readonly AdminNavLink[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Data', href: '/admin/data' },
  { label: 'Changes', href: '/admin/changes' },
  { label: 'Settings', href: '/admin/settings' },
];

/** Human-readable label for each `AuditAction`, keyed exhaustively so a new action fails to compile. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  party_created: 'Party created',
  party_updated: 'Party updated',
  party_deleted: 'Party deleted',
  guest_created: 'Guest created',
  guest_updated: 'Guest updated',
  guest_deleted: 'Guest deleted',
  rsvp_submitted: 'RSVP submitted',
  guest_added: 'Guest added',
  guest_moderated: 'Guest moderated',
  settings_updated: 'Settings updated',
  import: 'Import',
};
