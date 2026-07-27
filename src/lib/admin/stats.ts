import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { RSVP_STATUS, type RsvpStatus } from '@/lib/enums';

/**
 * A guest counts towards the dashboard only while both it and its party are
 * live. `softDeleteParty` already cascades `deletedAt` to its guests, but the
 * CSV export filters both levels too, and doing the same here keeps the totals
 * honest if a row ever escapes that cascade.
 */
const LIVE_GUEST = { deletedAt: null, party: { deletedAt: null } } satisfies Prisma.GuestWhereInput;

/** Guest-list totals shown on the admin dashboard. */
export interface SummaryStats {
  parties: number;
  invited: number;
  attending: number;
  declined: number;
  pending: number;
  flagged: number;
}

/** Spelled out rather than derived from `RSVP_STATUS` so a new status fails the build here. */
function emptyStatusCounts(): Record<RsvpStatus, number> {
  return { pending: 0, attending: 0, declined: 0 };
}

export async function getSummaryStats(client: PrismaClient): Promise<SummaryStats> {
  const [parties, byStatus, flagged] = await client.$transaction([
    client.party.count({ where: { deletedAt: null } }),
    client.guest.groupBy({
      by: ['rsvpStatus'],
      _count: { _all: true },
      where: LIVE_GUEST,
    }),
    client.guest.count({ where: { ...LIVE_GUEST, flaggedForReview: true } }),
  ]);

  const counts = emptyStatusCounts();

  for (const group of byStatus) {
    if (Object.hasOwn(counts, group.rsvpStatus)) {
      counts[group.rsvpStatus as RsvpStatus] = group._count._all;
    }
  }

  return {
    parties,
    invited: Object.values(counts).reduce((total, count) => total + count, 0),
    attending: counts[RSVP_STATUS.attending],
    declined: counts[RSVP_STATUS.declined],
    pending: counts[RSVP_STATUS.pending],
    flagged,
  };
}
