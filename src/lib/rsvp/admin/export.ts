import type { PrismaClient } from '@/generated/prisma/client';
import type { ExportRecord } from '@/lib/rsvp/csvExport';
import { GUEST_ORDER } from '@/lib/rsvp/parties';

/**
 * Flattens every party and its guests into one row per guest, carrying the
 * party-level fields onto each row so the export mirrors the import shape.
 */
export async function loadExportRecords(client: PrismaClient): Promise<ExportRecord[]> {
  const parties = await client.party.findMany({
    orderBy: { displayName: 'asc' },
    include: { guests: { orderBy: GUEST_ORDER } },
  });

  return parties.flatMap((party) =>
    party.guests.map((guest) => ({
      partyDisplayName: party.displayName,
      firstName: guest.firstName,
      lastName: guest.lastName,
      message: party.message,
      addGuestCap: party.addGuestCap,
      rsvpStatus: guest.rsvpStatus,
      songRequest: guest.songRequest,
      source: guest.source,
      flaggedForReview: guest.flaggedForReview,
      partyId: party.id,
      guestId: guest.id,
    })),
  );
}
