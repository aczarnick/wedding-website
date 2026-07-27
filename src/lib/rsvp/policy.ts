import { GUEST_SOURCE } from '@/lib/enums';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NameCandidate {
  firstName: string;
  lastName: string;
}

export interface GuestSetDiff {
  matches: boolean;
  missing: string[];
  unknown: string[];
  duplicated: string[];
}

export interface AddGuestAllowance {
  cap: number;
  used: number;
  remaining: number;
  allowed: boolean;
}

export interface SnapshotGuest {
  id: string;
  firstName: string;
  lastName: string;
  rsvpStatus: string;
  songRequest: string | null;
}

export interface PartySnapshot {
  message: string | null;
  guests: SnapshotGuest[];
}

/** Trims a name and collapses runs of internal whitespace to single spaces. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Splits a full name at every internal space, yielding each possible
 * first-name/last-name pairing. Multi-part surnames resolve without the caller
 * having to guess where the surname begins.
 */
export function nameSplitCandidates(query: string): NameCandidate[] {
  const tokens = normalizeName(query).split(' ').filter(Boolean);

  if (tokens.length < 2) {
    return [];
  }

  return tokens.slice(1).map((_, index) => ({
    firstName: tokens.slice(0, index + 1).join(' '),
    lastName: tokens.slice(index + 1).join(' '),
  }));
}

/** True while `now` is strictly before the deadline. */
export function isRsvpOpen(deadline: Date, now: Date): boolean {
  return now.getTime() < deadline.getTime();
}

/** True when the value is a canonical UUID, the shape of every party and guest id. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Compares the guest ids a submission declares against the ids the party
 * actually owns. A submission must name every current guest exactly once.
 */
export function diffGuestIds(
  existingIds: readonly string[],
  submittedIds: readonly string[],
): GuestSetDiff {
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  const unknown: string[] = [];

  for (const id of submittedIds) {
    if (seen.has(id)) {
      duplicated.add(id);
      continue;
    }

    seen.add(id);

    if (!existing.has(id)) {
      unknown.push(id);
    }
  }

  const missing = existingIds.filter((id) => !seen.has(id));

  return {
    matches: missing.length === 0 && unknown.length === 0 && duplicated.size === 0,
    missing,
    unknown,
    duplicated: [...duplicated],
  };
}

/** Counts the guests a party added itself, the only ones the cap governs. */
export function countAddedGuests(guests: readonly { source: string }[]): number {
  return guests.filter((guest) => guest.source === GUEST_SOURCE.guestAdded).length;
}

/**
 * Resolves how many guests a party may still add. `remaining` clamps at zero:
 * an admin can lower a cap below a party's current additions, which blocks
 * further additions rather than producing a negative allowance.
 */
export function checkAddGuestAllowance(
  cap: number,
  existingAddedCount: number,
  requestedCount: number,
): AddGuestAllowance {
  const remaining = Math.max(0, cap - existingAddedCount);

  return { cap, used: existingAddedCount, remaining, allowed: requestedCount <= remaining };
}

/**
 * Reduces a party to the fields the change log records, ordered by guest id so
 * a before/after pair diffs cleanly.
 */
export function toPartySnapshot(
  message: string | null,
  guests: readonly SnapshotGuest[],
): PartySnapshot {
  return {
    message,
    guests: [...guests]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, firstName, lastName, rsvpStatus, songRequest }) => ({
        id,
        firstName,
        lastName,
        rsvpStatus,
        songRequest,
      })),
  };
}
