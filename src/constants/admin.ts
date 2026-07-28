import type { AuditAction } from '@/lib/enums';

export interface AdminNavLink {
  label: string;
  href: string;
}

/**
 * Drives the admin console navigation, ordered the way the console is worked:
 * the overview, then the guest list and the queue it feeds, then the bulk data
 * tools, the change log, and the settings behind them.
 */
export const ADMIN_NAV_LINKS: readonly AdminNavLink[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Parties', href: '/admin/parties' },
  { label: 'Moderation', href: '/admin/moderation' },
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
