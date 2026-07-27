import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { ACTOR_TYPE, AUDIT_ACTION, GUEST_SOURCE } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';
import {
  checkAddGuestAllowance,
  countAddedGuests,
  diffGuestIds,
  isUuid,
  isRsvpOpen,
  nameSplitCandidates,
  toPartySnapshot,
} from '@/lib/rsvp/policy';
import type { SnapshotGuest } from '@/lib/rsvp/policy';
import type { SubmitRsvpInput } from '@/lib/rsvp/schemas';
import type { PartyDetail, PartyDetailGuest, PartySearchResult } from '@/lib/rsvp/types';

export const GUEST_ORDER: Prisma.GuestOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

/**
 * Loads the singleton settings row, failing loudly if it is missing rather
 * than letting callers guess at a default. Accepts either the top-level
 * client or a transaction client so callers inside a `$transaction` can
 * share the same lookup.
 */
export async function requireSettings(client: Pick<PrismaClient, 'settings'>) {
  const settings = await client.settings.findUnique({ where: { id: 1 } });

  if (!settings) {
    throw new RsvpError(500, 'settings_missing', 'RSVP settings are not configured');
  }

  return settings;
}

/**
 * Asserts the RSVP window is open and returns the deadline.
 * A missing settings row is a misconfiguration, not an open window, so it
 * fails loudly rather than defaulting either way.
 */
export async function requireRsvpOpen(client: PrismaClient, now: Date = new Date()): Promise<Date> {
  const settings = await requireSettings(client);

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
    where: { deletedAt: null, guests: { some: { deletedAt: null, OR: [...candidates] } } },
    include: {
      guests: { where: { deletedAt: null }, select: { firstName: true }, orderBy: GUEST_ORDER },
    },
    orderBy: { displayName: 'asc' },
  });

  return parties.map((party) => ({
    id: party.id,
    displayName: party.displayName,
    guestFirstNames: party.guests.map((guest) => guest.firstName),
  }));
}

interface PartyRecord {
  id: string;
  displayName: string;
  addGuestCap: number;
}

interface GuestRecord extends PartyDetailGuest {
  flaggedForReview: boolean;
}

/**
 * Projects a party and its guests into the response shape, deriving the
 * remaining add-guest allowance and dropping the admin-only moderation flag.
 * Both read and submit return through here so the two can never drift.
 */
function toPartyDetail(
  party: PartyRecord,
  guests: readonly GuestRecord[],
  message: string | null,
  deadline: Date,
): PartyDetail {
  const allowance = checkAddGuestAllowance(party.addGuestCap, countAddedGuests(guests), 0);

  return {
    id: party.id,
    displayName: party.displayName,
    message,
    addGuestCap: party.addGuestCap,
    addedGuestsRemaining: allowance.remaining,
    rsvpDeadline: deadline.toISOString(),
    guests: guests.map((guest) => ({
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      rsvpStatus: guest.rsvpStatus,
      songRequest: guest.songRequest,
      source: guest.source,
    })),
  };
}

/** Loads a party and its guests, omitting the admin-only moderation flag. */
export async function getPartyDetail(
  client: PrismaClient,
  partyId: string,
  deadline: Date,
): Promise<PartyDetail> {
  if (!isUuid(partyId)) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  const party = await client.party.findFirst({
    where: { id: partyId, deletedAt: null },
    include: { guests: { where: { deletedAt: null }, orderBy: GUEST_ORDER } },
  });

  if (!party) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  return toPartyDetail(party, party.guests, party.message, deadline);
}

/**
 * Applies a party's full declarative RSVP state in one transaction: message,
 * per-guest status and song request, and any added guests, plus the audit
 * rows. Rejecting the submission for any reason leaves the database untouched.
 */
export async function submitRsvp(
  client: PrismaClient,
  partyId: string,
  input: SubmitRsvpInput,
  ipAddress: string | null,
  now: Date = new Date(),
): Promise<PartyDetail> {
  if (!isUuid(partyId)) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  const deadline = await requireRsvpOpen(client, now);

  return client.$transaction(async (tx) => {
    const party = await tx.party.findFirst({
      where: { id: partyId, deletedAt: null },
      include: { guests: { where: { deletedAt: null }, orderBy: GUEST_ORDER } },
    });

    if (!party) {
      throw new RsvpError(404, 'party_not_found', 'Party not found');
    }

    const guestDiff = diffGuestIds(
      party.guests.map((guest) => guest.id),
      input.guests.map((guest) => guest.id),
    );

    if (!guestDiff.matches) {
      throw new RsvpError(
        409,
        'party_changed',
        'This party has changed since you loaded it. Reload and try again.',
        {
          missing: guestDiff.missing,
          unknown: guestDiff.unknown,
          duplicated: guestDiff.duplicated,
        },
      );
    }

    const allowance = checkAddGuestAllowance(
      party.addGuestCap,
      countAddedGuests(party.guests),
      input.newGuests.length,
    );

    if (!allowance.allowed) {
      throw new RsvpError(
        409,
        'add_guest_cap_exceeded',
        `This party can add at most ${allowance.cap} guests.`,
        { cap: allowance.cap, remaining: allowance.remaining },
      );
    }

    const before = toPartySnapshot(party.message, party.guests);

    await tx.party.update({ where: { id: partyId }, data: { message: input.message } });

    for (const guest of input.guests) {
      await tx.guest.update({
        where: { id: guest.id },
        data: { rsvpStatus: guest.rsvpStatus, songRequest: guest.songRequest },
      });
    }

    const addedGuests: SnapshotGuest[] = [];

    for (const newGuest of input.newGuests) {
      const created = await tx.guest.create({
        data: {
          partyId,
          firstName: newGuest.firstName,
          lastName: newGuest.lastName,
          rsvpStatus: newGuest.rsvpStatus,
          songRequest: newGuest.songRequest,
          source: GUEST_SOURCE.guestAdded,
          flaggedForReview: true,
        },
      });

      addedGuests.push(created);
    }

    const guestsAfter = await tx.guest.findMany({
      where: { partyId, deletedAt: null },
      orderBy: GUEST_ORDER,
    });
    const after = toPartySnapshot(input.message, guestsAfter);

    await tx.auditEntry.create({
      data: {
        partyId,
        action: AUDIT_ACTION.rsvpSubmitted,
        actorType: ACTOR_TYPE.guest,
        before: JSON.stringify(before),
        after: JSON.stringify(after),
        ipAddress,
      },
    });

    for (const added of addedGuests) {
      await tx.auditEntry.create({
        data: {
          partyId,
          guestId: added.id,
          action: AUDIT_ACTION.guestAdded,
          actorType: ACTOR_TYPE.guest,
          after: JSON.stringify({
            id: added.id,
            firstName: added.firstName,
            lastName: added.lastName,
            rsvpStatus: added.rsvpStatus,
            songRequest: added.songRequest,
          }),
          ipAddress,
        },
      });
    }

    return toPartyDetail(party, guestsAfter, input.message, deadline);
  });
}
