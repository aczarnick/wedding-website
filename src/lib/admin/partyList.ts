import type { AdminGuest, AdminParty } from '@/lib/admin/projections';
import { RSVP_STATUS } from '@/lib/enums';

/** Sentinel for "any RSVP status", distinct from the three real statuses. */
export const ALL_STATUSES = 'all';

export interface GuestTally {
  total: number;
  attending: number;
  declined: number;
  pending: number;
  flagged: number;
}

export interface PartyFilter {
  query: string;
  status: string;
}

export function summarizeGuests(guests: readonly AdminGuest[]): GuestTally {
  return guests.reduce<GuestTally>(
    (tally, guest) => ({
      total: tally.total + 1,
      attending: tally.attending + (guest.rsvpStatus === RSVP_STATUS.attending ? 1 : 0),
      declined: tally.declined + (guest.rsvpStatus === RSVP_STATUS.declined ? 1 : 0),
      pending: tally.pending + (guest.rsvpStatus === RSVP_STATUS.pending ? 1 : 0),
      flagged: tally.flagged + (guest.flaggedForReview ? 1 : 0),
    }),
    { total: 0, attending: 0, declined: 0, pending: 0, flagged: 0 },
  );
}

const matchesQuery = (party: AdminParty, needle: string): boolean =>
  party.displayName.toLowerCase().includes(needle) ||
  party.guests.some((guest) =>
    `${guest.firstName} ${guest.lastName}`.toLowerCase().includes(needle),
  );

const matchesStatus = (party: AdminParty, status: string): boolean =>
  status === ALL_STATUSES || party.guests.some((guest) => guest.rsvpStatus === status);

/**
 * Narrows the list to the admin's search text and status filter. The search
 * spans guest names as well as the party's display name, because an admin
 * looking someone up knows the guest, not the label on the invitation.
 */
export function filterParties(
  parties: readonly AdminParty[],
  filter: PartyFilter,
): AdminParty[] {
  const needle = filter.query.trim().toLowerCase();

  return parties.filter(
    (party) =>
      (needle.length === 0 || matchesQuery(party, needle)) && matchesStatus(party, filter.status),
  );
}
