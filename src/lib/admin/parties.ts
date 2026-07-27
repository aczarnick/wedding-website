import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { writeAuditEntry, type AuditContext } from '@/lib/admin/audit-log';
import { toAdminParty, toPartyFields, type AdminParty } from '@/lib/admin/projections';
import type { CreatePartyInput, UpdatePartyInput } from '@/lib/admin/schemas';
import { AUDIT_ACTION, GUEST_SOURCE } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';
import { GUEST_ORDER } from '@/lib/rsvp/parties';
import { isPartyId } from '@/lib/rsvp/policy';

const ACTIVE_GUESTS = { where: { deletedAt: null }, orderBy: GUEST_ORDER } as const;

function partyNotFound(): RsvpError {
  return new RsvpError(404, 'party_not_found', 'Party not found');
}

async function loadParty(tx: Prisma.TransactionClient, partyId: string) {
  if (!isPartyId(partyId)) {
    throw partyNotFound();
  }

  const party = await tx.party.findFirst({
    where: { id: partyId, deletedAt: null },
    include: { guests: ACTIVE_GUESTS },
  });

  if (!party) {
    throw partyNotFound();
  }

  return party;
}

export async function listParties(client: PrismaClient): Promise<AdminParty[]> {
  const parties = await client.party.findMany({
    where: { deletedAt: null },
    include: { guests: ACTIVE_GUESTS },
    orderBy: { displayName: 'asc' },
  });

  return parties.map((party) => toAdminParty(party, party.guests));
}

export async function getParty(client: PrismaClient, partyId: string): Promise<AdminParty> {
  const party = await loadParty(client, partyId);

  return toAdminParty(party, party.guests);
}

export async function createParty(
  client: PrismaClient,
  audit: AuditContext,
  input: CreatePartyInput,
): Promise<AdminParty> {
  return client.$transaction(async (tx) => {
    const settings = await tx.settings.findUnique({ where: { id: 1 } });

    if (!settings) {
      throw new RsvpError(500, 'settings_missing', 'RSVP settings are not configured');
    }

    const created = await tx.party.create({
      data: {
        displayName: input.displayName,
        message: input.message,
        addGuestCap: input.addGuestCap ?? settings.defaultAddGuestCap,
        guests: {
          create: input.guests.map((guest) => ({
            firstName: guest.firstName,
            lastName: guest.lastName,
            rsvpStatus: guest.rsvpStatus,
            songRequest: guest.songRequest,
            source: GUEST_SOURCE.admin,
          })),
        },
      },
      include: { guests: ACTIVE_GUESTS },
    });

    const party = toAdminParty(created, created.guests);

    await writeAuditEntry(tx, audit, {
      partyId: created.id,
      action: AUDIT_ACTION.partyCreated,
      after: party,
    });

    return party;
  });
}

export async function updateParty(
  client: PrismaClient,
  audit: AuditContext,
  partyId: string,
  input: UpdatePartyInput,
): Promise<AdminParty> {
  return client.$transaction(async (tx) => {
    const existing = await loadParty(tx, partyId);

    const updated = await tx.party.update({
      where: { id: partyId },
      data: input,
      include: { guests: ACTIVE_GUESTS },
    });

    await writeAuditEntry(tx, audit, {
      partyId,
      action: AUDIT_ACTION.partyUpdated,
      before: toPartyFields(existing),
      after: toPartyFields(updated),
    });

    return toAdminParty(updated, updated.guests);
  });
}

/**
 * Marks a party and its guests deleted. A hard delete is impossible while the
 * party has change-log history: `AuditEntry.partyId` is non-nullable with no
 * cascade, so the delete would raise a foreign-key violation.
 */
export async function softDeleteParty(
  client: PrismaClient,
  audit: AuditContext,
  partyId: string,
): Promise<AdminParty> {
  return client.$transaction(async (tx) => {
    const existing = await loadParty(tx, partyId);
    const deletedAt = new Date();

    await tx.guest.updateMany({ where: { partyId, deletedAt: null }, data: { deletedAt } });
    await tx.party.update({ where: { id: partyId }, data: { deletedAt } });

    const party = toAdminParty(existing, existing.guests);

    await writeAuditEntry(tx, audit, {
      partyId,
      action: AUDIT_ACTION.partyDeleted,
      before: party,
    });

    return party;
  });
}
