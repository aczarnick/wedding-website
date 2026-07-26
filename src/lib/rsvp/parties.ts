import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { ACTOR_TYPE, AUDIT_ACTION, GUEST_SOURCE } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';
import {
  checkAddGuestAllowance,
  countAddedGuests,
  diffGuestIds,
  isPartyId,
  isRsvpOpen,
  nameSplitCandidates,
  toPartySnapshot,
} from '@/lib/rsvp/policy';
import type { SubmitRsvpInput } from '@/lib/rsvp/schemas';

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
  if (!isPartyId(partyId)) {
    throw new RsvpError(404, 'party_not_found', 'Party not found');
  }

  const deadline = await requireRsvpOpen(client, now);

  return client.$transaction(async (tx) => {
    const party = await tx.party.findUnique({
      where: { id: partyId },
      include: { guests: { orderBy: GUEST_ORDER } },
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

    const addedGuestIds: string[] = [];

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

      addedGuestIds.push(created.id);
    }

    const guestsAfter = await tx.guest.findMany({ where: { partyId }, orderBy: GUEST_ORDER });
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

    for (const guestId of addedGuestIds) {
      const added = guestsAfter.find((guest) => guest.id === guestId);

      await tx.auditEntry.create({
        data: {
          partyId,
          guestId,
          action: AUDIT_ACTION.guestAdded,
          actorType: ACTOR_TYPE.guest,
          after: JSON.stringify(
            added
              ? {
                  id: added.id,
                  firstName: added.firstName,
                  lastName: added.lastName,
                  rsvpStatus: added.rsvpStatus,
                  songRequest: added.songRequest,
                }
              : { id: guestId },
          ),
          ipAddress,
        },
      });
    }

    const updatedAllowance = checkAddGuestAllowance(
      party.addGuestCap,
      countAddedGuests(guestsAfter),
      0,
    );

    return {
      id: party.id,
      displayName: party.displayName,
      message: input.message,
      addGuestCap: party.addGuestCap,
      addedGuestsRemaining: updatedAllowance.remaining,
      rsvpDeadline: deadline.toISOString(),
      guests: guestsAfter.map((guest) => ({
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        rsvpStatus: guest.rsvpStatus,
        songRequest: guest.songRequest,
        source: guest.source,
      })),
    };
  });
}
