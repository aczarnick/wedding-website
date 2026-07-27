import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { ACTOR_TYPE, AUDIT_ACTION, GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import { parseImportCsv, type ImportParty } from '@/lib/rsvp/csvImport';
import { MAX_IMPORT_ROWS } from '@/lib/rsvp/csvSchemas';
import { RsvpError, csvTooLarge, invalidCsv, type RowError } from '@/lib/rsvp/errors';
import { GUEST_ORDER } from '@/lib/rsvp/parties';
import { toPartySnapshot } from '@/lib/rsvp/policy';

const TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

export interface ImportSummary {
  partiesCreated: number;
  guestsCreated: number;
}

/**
 * Only queries settings when some party actually needs the default — a file
 * where every row specifies `addGuestCap` must not fail with `settings_missing`
 * for a value it never uses.
 */
async function loadDefaultAddGuestCap(
  client: PrismaClient,
  parties: readonly ImportParty[],
): Promise<number | null> {
  if (!parties.some((party) => party.addGuestCap === null)) {
    return null;
  }

  const settings = await client.settings.findUnique({ where: { id: 1 } });

  if (!settings) {
    throw new RsvpError(500, 'settings_missing', 'RSVP settings are not configured');
  }

  return settings.defaultAddGuestCap;
}

/**
 * Finds parties whose display name is already taken by a **live** party.
 * Comparison is case-insensitive by virtue of the database collation, so
 * results are keyed back to the file by lowercased name rather than by exact
 * spelling. A soft-deleted party does not reserve its name: it is invisible to
 * every other read, so blocking a re-import on it would be a collision the
 * admin cannot see or clear.
 */
async function findCollisions(
  client: PrismaClient,
  parties: readonly ImportParty[],
): Promise<RowError[]> {
  const existing = await client.party.findMany({
    where: {
      deletedAt: null,
      displayName: { in: parties.map((party) => party.displayName) },
    },
    select: { displayName: true },
  });

  const taken = new Set(existing.map((party) => party.displayName.toLowerCase()));

  return parties
    .filter((party) => taken.has(party.key))
    .map((party) => ({
      line: party.line,
      reason: `Party "${party.displayName}" already exists`,
    }));
}

/**
 * Resolves null to the loaded default. Throws rather than silently falling
 * back to a bogus value if the default was never loaded — which would only
 * happen if the "does any party need it" check above disagreed with this one.
 */
function resolveAddGuestCap(addGuestCap: number | null, defaultAddGuestCap: number | null): number {
  if (addGuestCap !== null) {
    return addGuestCap;
  }

  if (defaultAddGuestCap === null) {
    throw new Error('addGuestCap default was not loaded but a party requires it');
  }

  return defaultAddGuestCap;
}

async function createParty(
  tx: Prisma.TransactionClient,
  party: ImportParty,
  defaultAddGuestCap: number | null,
  actorEmail: string,
  ipAddress: string | null,
): Promise<number> {
  const created = await tx.party.create({
    data: {
      displayName: party.displayName,
      message: party.message,
      addGuestCap: resolveAddGuestCap(party.addGuestCap, defaultAddGuestCap),
      guests: {
        create: party.guests.map((guest) => ({
          firstName: guest.firstName,
          lastName: guest.lastName,
          rsvpStatus: RSVP_STATUS.pending,
          source: GUEST_SOURCE.admin,
          flaggedForReview: false,
        })),
      },
    },
    include: { guests: { orderBy: GUEST_ORDER } },
  });

  await tx.auditEntry.create({
    data: {
      partyId: created.id,
      action: AUDIT_ACTION.import,
      actorType: ACTOR_TYPE.admin,
      actorEmail,
      after: JSON.stringify(toPartySnapshot(created.message, created.guests)),
      ipAddress,
    },
  });

  return created.guests.length;
}

/**
 * Creates every party in the file, or none of them. Import never updates or
 * deletes: a display name that already exists is reported as a row error, so a
 * party that has already responded can never be overwritten by a re-import.
 */
export async function importParties(
  client: PrismaClient,
  text: string,
  actorEmail: string,
  ipAddress: string | null,
): Promise<ImportSummary> {
  const parsed = parseImportCsv(text);

  if (parsed.recordCount > MAX_IMPORT_ROWS) {
    throw csvTooLarge(
      `The file has ${parsed.recordCount} data rows; the limit is ${MAX_IMPORT_ROWS}`,
    );
  }

  if (!parsed.ok) {
    throw invalidCsv(parsed.rowErrors);
  }

  const defaultAddGuestCap = await loadDefaultAddGuestCap(client, parsed.parties);
  const collisions = await findCollisions(client, parsed.parties);

  if (collisions.length > 0) {
    throw invalidCsv(collisions);
  }

  return client.$transaction(async (tx) => {
    let guestsCreated = 0;

    for (const party of parsed.parties) {
      guestsCreated += await createParty(tx, party, defaultAddGuestCap, actorEmail, ipAddress);
    }

    return { partiesCreated: parsed.parties.length, guestsCreated };
  }, TRANSACTION_OPTIONS);
}
