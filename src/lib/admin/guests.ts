import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { writeAuditEntry, type AuditContext } from '@/lib/admin/audit-log';
import { toAdminGuest, type AdminGuest } from '@/lib/admin/projections';
import type {
  CreateGuestInput,
  GuestListQuery,
  ModerateGuestInput,
  UpdateGuestInput,
} from '@/lib/admin/schemas';
import { AUDIT_ACTION, GUEST_SOURCE } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';
import { GUEST_ORDER } from '@/lib/rsvp/parties';
import { isUuid } from '@/lib/rsvp/policy';

function guestNotFound(): RsvpError {
  return new RsvpError(404, 'guest_not_found', 'Guest not found');
}

async function loadGuest(tx: Prisma.TransactionClient, guestId: string) {
  if (!isUuid(guestId)) {
    throw guestNotFound();
  }

  const guest = await tx.guest.findFirst({ where: { id: guestId, deletedAt: null } });

  if (!guest) {
    throw guestNotFound();
  }

  return guest;
}

export async function listGuests(
  client: PrismaClient,
  filter: GuestListQuery,
): Promise<AdminGuest[]> {
  const guests = await client.guest.findMany({
    where: {
      deletedAt: null,
      party: { deletedAt: null },
      ...(filter.flagged === undefined ? {} : { flaggedForReview: filter.flagged }),
    },
    orderBy: GUEST_ORDER,
  });

  return guests.map(toAdminGuest);
}

export async function getGuest(client: PrismaClient, guestId: string): Promise<AdminGuest> {
  return toAdminGuest(await loadGuest(client, guestId));
}

export async function createGuest(
  client: PrismaClient,
  audit: AuditContext,
  input: CreateGuestInput,
): Promise<AdminGuest> {
  return client.$transaction(async (tx) => {
    if (!isUuid(input.partyId)) {
      throw new RsvpError(404, 'party_not_found', 'Party not found');
    }

    const party = await tx.party.findFirst({ where: { id: input.partyId, deletedAt: null } });

    if (!party) {
      throw new RsvpError(404, 'party_not_found', 'Party not found');
    }

    const created = await tx.guest.create({
      data: {
        partyId: input.partyId,
        firstName: input.firstName,
        lastName: input.lastName,
        rsvpStatus: input.rsvpStatus,
        songRequest: input.songRequest,
        source: GUEST_SOURCE.admin,
      },
    });

    const guest = toAdminGuest(created);

    await writeAuditEntry(tx, audit, {
      partyId: created.partyId,
      guestId: created.id,
      action: AUDIT_ACTION.guestCreated,
      after: guest,
    });

    return guest;
  });
}

export async function updateGuest(
  client: PrismaClient,
  audit: AuditContext,
  guestId: string,
  input: UpdateGuestInput,
): Promise<AdminGuest> {
  return client.$transaction(async (tx) => {
    const existing = await loadGuest(tx, guestId);
    const updated = await tx.guest.update({ where: { id: guestId }, data: input });

    await writeAuditEntry(tx, audit, {
      partyId: existing.partyId,
      guestId,
      action: AUDIT_ACTION.guestUpdated,
      before: toAdminGuest(existing),
      after: toAdminGuest(updated),
    });

    return toAdminGuest(updated);
  });
}

/**
 * Marks a guest deleted. As with parties, a hard delete is blocked whenever
 * change-log rows reference the guest: that foreign key is `onDelete: NoAction`.
 */
export async function softDeleteGuest(
  client: PrismaClient,
  audit: AuditContext,
  guestId: string,
): Promise<AdminGuest> {
  return client.$transaction(async (tx) => {
    const existing = await loadGuest(tx, guestId);

    await tx.guest.update({ where: { id: guestId }, data: { deletedAt: new Date() } });

    const guest = toAdminGuest(existing);

    await writeAuditEntry(tx, audit, {
      partyId: existing.partyId,
      guestId,
      action: AUDIT_ACTION.guestDeleted,
      before: guest,
    });

    return guest;
  });
}

/**
 * Resolves a flagged guest-added plus-one. Approving clears the flag but leaves
 * `source` alone: provenance is a historical fact, and keeping it means an
 * approved guest still counts against the party's add-guest cap.
 */
export async function moderateGuest(
  client: PrismaClient,
  audit: AuditContext,
  guestId: string,
  input: ModerateGuestInput,
): Promise<AdminGuest> {
  return client.$transaction(async (tx) => {
    const existing = await loadGuest(tx, guestId);

    if (!existing.flaggedForReview) {
      throw new RsvpError(409, 'guest_not_flagged', 'This guest is not awaiting moderation');
    }

    const data =
      input.action === 'approve' ? { flaggedForReview: false } : { deletedAt: new Date() };
    const updated = await tx.guest.update({ where: { id: guestId }, data });

    await writeAuditEntry(tx, audit, {
      partyId: existing.partyId,
      guestId,
      action: AUDIT_ACTION.guestModerated,
      before: toAdminGuest(existing),
      after: {
        decision: input.action,
        guest: input.action === 'approve' ? toAdminGuest(updated) : null,
      },
    });

    return toAdminGuest(updated);
  });
}
