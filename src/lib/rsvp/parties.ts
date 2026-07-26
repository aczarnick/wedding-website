import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { RsvpError } from '@/lib/rsvp/errors';
import {
  checkAddGuestAllowance,
  countAddedGuests,
  isPartyId,
  isRsvpOpen,
  nameSplitCandidates,
} from '@/lib/rsvp/policy';

export const GUEST_ORDER: Prisma.GuestOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

export interface PartySearchResult {
  id: string;
  displayName: string;
  guestFirstNames: string[];
}

export interface PartyDetailGuest {
  id: string;
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
  source: string;
}

export interface PartyDetail {
  id: string;
  displayName: string;
  message: string | null;
  addGuestCap: number;
  addedGuestsRemaining: number;
  rsvpDeadline: string;
  guests: PartyDetailGuest[];
}

/**
 * Asserts the RSVP window is open and returns the deadline.
 * A missing settings row is a misconfiguration, not an open window, so it
 * fails loudly rather than defaulting either way.
 */
export async function requireRsvpOpen(client: PrismaClient, now: Date = new Date()): Promise<Date> {
  const settings = await client.settings.findUnique({ where: { id: 1 } });

  if (!settings) {
    throw new RsvpError(500, 'settings_missing', 'RSVP settings are not configured');
  }

  if (!isRsvpOpen(settings.rsvpDeadline, now)) {
    throw new RsvpError(403, 'rsvp_closed', 'RSVPs are closed', {
      deadline: settings.rsvpDeadline.toISOString(),
    });
  }

  return settings.rsvpDeadline;
}

/**
 * Finds parties containing a guest whose full name matches the query exactly.
 * Matching is case-insensitive by virtue of the SQL Server collation; Prisma's
 * `mode: 'insensitive'` is unsupported on this provider.
 */
export async function searchParties(
  client: PrismaClient,
  query: string,
): Promise<PartySearchResult[]> {
  const candidates = nameSplitCandidates(query);

  if (candidates.length === 0) {
    return [];
  }

  const parties = await client.party.findMany({
    where: { guests: { some: { OR: [...candidates] } } },
    include: { guests: { select: { firstName: true }, orderBy: GUEST_ORDER } },
    orderBy: { displayName: 'asc' },
  });

  return parties.map((party) => ({
    id: party.id,
    displayName: party.displayName,
    guestFirstNames: party.guests.map((guest) => guest.firstName),
  }));
}

/** Loads a party and its guests, omitting the admin-only moderation flag. */
export async function getPartyDetail(
  client: PrismaClient,
  partyId: string,
  deadline: Date,
): Promise<PartyDetail> {
  if (!isPartyId(partyId)) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  const party = await client.party.findUnique({
    where: { id: partyId },
    include: { guests: { orderBy: GUEST_ORDER } },
  });

  if (!party) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  const allowance = checkAddGuestAllowance(party.addGuestCap, countAddedGuests(party.guests), 0);

  return {
    id: party.id,
    displayName: party.displayName,
    message: party.message,
    addGuestCap: party.addGuestCap,
    addedGuestsRemaining: allowance.remaining,
    rsvpDeadline: deadline.toISOString(),
    guests: party.guests.map((guest) => ({
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      rsvpStatus: guest.rsvpStatus,
      songRequest: guest.songRequest,
      source: guest.source,
    })),
  };
}
