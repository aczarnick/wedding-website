import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import {
  createGuest,
  getGuest,
  listGuests,
  moderateGuest,
  softDeleteGuest,
  updateGuest,
} from '@/lib/admin/guests';
import { AUDIT_ACTION, GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import { getPartyDetail } from '@/lib/rsvp/parties';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('admin guest services', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });
  const audit = { actorEmail: 'admin@example.com', ipAddress: null };
  const deadline = new Date('2026-08-01T00:00:00Z');

  function flaggedGuest() {
    return prisma.guest.findFirstOrThrow({ where: { flaggedForReview: true } });
  }

  function smithGuest() {
    return prisma.guest.findFirstOrThrow({ where: { firstName: 'John', lastName: 'Smith' } });
  }

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('listGuests', () => {
    it('returns every seeded guest', async () => {
      expect(await listGuests(prisma, {})).toHaveLength(5);
    });

    it('narrows to the moderation queue', async () => {
      const flagged = await listGuests(prisma, { flagged: true });

      expect(flagged).toHaveLength(1);
      expect(flagged[0].firstName).toBe('Sam');
    });

    it('excludes flagged guests when asked for unflagged ones', async () => {
      expect(await listGuests(prisma, { flagged: false })).toHaveLength(4);
    });
  });

  describe('createGuest', () => {
    it('creates an admin-sourced guest and audits it', async () => {
      const party = await prisma.party.findFirstOrThrow({
        where: { displayName: 'The Chen Family' },
      });

      const guest = await createGuest(prisma, audit, {
        partyId: party.id,
        firstName: 'Mei',
        lastName: 'Chen',
        rsvpStatus: RSVP_STATUS.pending,
        songRequest: null,
      });

      expect(guest.source).toBe(GUEST_SOURCE.admin);
      expect(guest.flaggedForReview).toBe(false);

      const entry = await prisma.auditEntry.findFirstOrThrow({
        where: { guestId: guest.id, action: AUDIT_ACTION.guestCreated },
      });
      expect(entry.actorEmail).toBe('admin@example.com');
    });

    it('rejects an unknown party', async () => {
      await expect(
        createGuest(prisma, audit, {
          partyId: '11111111-1111-4111-8111-111111111111',
          firstName: 'Nobody',
          lastName: 'Here',
          rsvpStatus: RSVP_STATUS.pending,
          songRequest: null,
        }),
      ).rejects.toMatchObject({ code: 'party_not_found' });
    });
  });

  describe('updateGuest', () => {
    it('lets an admin RSVP on a guest behalf and records the change', async () => {
      const guest = await smithGuest();

      const updated = await updateGuest(prisma, audit, guest.id, {
        rsvpStatus: RSVP_STATUS.declined,
      });

      expect(updated.rsvpStatus).toBe(RSVP_STATUS.declined);

      const entry = await prisma.auditEntry.findFirstOrThrow({
        where: { guestId: guest.id, action: AUDIT_ACTION.guestUpdated },
      });
      expect(JSON.parse(entry.before!).rsvpStatus).toBe(RSVP_STATUS.attending);
      expect(JSON.parse(entry.after!).rsvpStatus).toBe(RSVP_STATUS.declined);
    });

    it('rejects an unknown guest', async () => {
      await expect(
        updateGuest(prisma, audit, '11111111-1111-4111-8111-111111111111', {
          rsvpStatus: RSVP_STATUS.declined,
        }),
      ).rejects.toMatchObject({ status: 404, code: 'guest_not_found' });
    });
  });

  describe('softDeleteGuest', () => {
    it('hides the guest from admin and guest reads alike', async () => {
      const guest = await smithGuest();

      await softDeleteGuest(prisma, audit, guest.id);

      expect(await listGuests(prisma, {})).toHaveLength(4);
      const detail = await getPartyDetail(prisma, guest.partyId, deadline);
      expect(detail.guests.map((each) => each.id)).not.toContain(guest.id);
    });

    it('keeps the guest audit history intact', async () => {
      const guest = await smithGuest();

      await softDeleteGuest(prisma, audit, guest.id);

      const entry = await prisma.auditEntry.findFirstOrThrow({
        where: { guestId: guest.id, action: AUDIT_ACTION.guestDeleted },
      });
      expect(JSON.parse(entry.before!).firstName).toBe('John');
    });

    it('rejects deleting an already-deleted guest', async () => {
      const guest = await smithGuest();
      await softDeleteGuest(prisma, audit, guest.id);

      await expect(softDeleteGuest(prisma, audit, guest.id)).rejects.toMatchObject({
        code: 'guest_not_found',
      });
    });
  });

  describe('moderateGuest', () => {
    it('approve clears the flag without changing provenance', async () => {
      const guest = await flaggedGuest();

      const moderated = await moderateGuest(prisma, audit, guest.id, { action: 'approve' });

      expect(moderated.flaggedForReview).toBe(false);
      expect(moderated.source).toBe(GUEST_SOURCE.guestAdded);
    });

    it('approve leaves the guest counting against the add-guest cap', async () => {
      const guest = await flaggedGuest();

      await moderateGuest(prisma, audit, guest.id, { action: 'approve' });

      const detail = await getPartyDetail(prisma, guest.partyId, deadline);
      const party = await prisma.party.findFirstOrThrow({ where: { id: guest.partyId } });
      expect(detail.addedGuestsRemaining).toBe(party.addGuestCap - 1);
    });

    it('remove soft-deletes the guest', async () => {
      const guest = await flaggedGuest();

      await moderateGuest(prisma, audit, guest.id, { action: 'remove' });

      await expect(getGuest(prisma, guest.id)).rejects.toMatchObject({ code: 'guest_not_found' });
    });

    it('records the moderation decision in the change log', async () => {
      const guest = await flaggedGuest();

      await moderateGuest(prisma, audit, guest.id, { action: 'approve' });

      const entry = await prisma.auditEntry.findFirstOrThrow({
        where: { guestId: guest.id, action: AUDIT_ACTION.guestModerated },
      });
      expect(JSON.parse(entry.after!).flaggedForReview).toBe(false);
    });

    it('rejects moderating a guest that was never flagged', async () => {
      const guest = await smithGuest();

      await expect(
        moderateGuest(prisma, audit, guest.id, { action: 'approve' }),
      ).rejects.toMatchObject({ status: 409, code: 'guest_not_flagged' });
    });
  });
});
