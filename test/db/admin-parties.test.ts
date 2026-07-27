import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import {
  createParty,
  getParty,
  listParties,
  softDeleteParty,
  updateParty,
} from '@/lib/admin/parties';
import { AUDIT_ACTION, GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import { getPartyDetail } from '@/lib/rsvp/parties';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('admin party services', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });
  const audit = { actorEmail: 'admin@example.com', ipAddress: '203.0.113.7' };
  const deadline = new Date('2026-08-01T00:00:00Z');

  function smithParty() {
    return prisma.party.findFirstOrThrow({ where: { displayName: 'The Smith Family' } });
  }

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('listParties', () => {
    it('returns every seeded party with its guests', async () => {
      const parties = await listParties(prisma);

      expect(parties).toHaveLength(3);
      expect(parties.map((party) => party.displayName)).toEqual([
        'Alex Rivera & Guest',
        'The Chen Family',
        'The Smith Family',
      ]);
      expect(parties.find((party) => party.displayName === 'The Smith Family')?.guests).toHaveLength(
        2,
      );
    });

    it('exposes the moderation flag the guest API hides', async () => {
      const parties = await listParties(prisma);
      const rivera = parties.find((party) => party.displayName === 'Alex Rivera & Guest');

      expect(rivera?.guests.some((guest) => guest.flaggedForReview)).toBe(true);
    });
  });

  describe('createParty', () => {
    it('creates a party with nested guests and audits it', async () => {
      const party = await createParty(prisma, audit, {
        displayName: 'The Novak Family',
        message: null,
        addGuestCap: undefined,
        guests: [
          {
            firstName: 'Ada',
            lastName: 'Novak',
            rsvpStatus: RSVP_STATUS.pending,
            songRequest: null,
          },
        ],
      });

      expect(party.guests).toHaveLength(1);
      expect(party.guests[0].source).toBe(GUEST_SOURCE.admin);
      expect(party.guests[0].flaggedForReview).toBe(false);

      const entry = await prisma.auditEntry.findFirstOrThrow({ where: { partyId: party.id } });
      expect(entry.action).toBe(AUDIT_ACTION.partyCreated);
      expect(entry.actorType).toBe('admin');
      expect(entry.actorEmail).toBe('admin@example.com');
      expect(entry.ipAddress).toBe('203.0.113.7');
    });

    it('defaults the cap from settings when omitted', async () => {
      await prisma.settings.update({ where: { id: 1 }, data: { defaultAddGuestCap: 7 } });

      const party = await createParty(prisma, audit, {
        displayName: 'The Default Family',
        message: null,
        addGuestCap: undefined,
        guests: [],
      });

      expect(party.addGuestCap).toBe(7);
    });

    it('honors an explicit cap', async () => {
      const party = await createParty(prisma, audit, {
        displayName: 'The Capped Family',
        message: null,
        addGuestCap: 0,
        guests: [],
      });

      expect(party.addGuestCap).toBe(0);
    });
  });

  describe('updateParty', () => {
    it('applies the patch and records before and after', async () => {
      const existing = await smithParty();

      const updated = await updateParty(prisma, audit, existing.id, { addGuestCap: 2 });

      expect(updated.addGuestCap).toBe(2);
      expect(updated.displayName).toBe('The Smith Family');

      const entry = await prisma.auditEntry.findFirstOrThrow({
        where: { partyId: existing.id, action: AUDIT_ACTION.partyUpdated },
      });
      expect(JSON.parse(entry.before!)).toMatchObject({ addGuestCap: 5 });
      expect(JSON.parse(entry.after!)).toMatchObject({ addGuestCap: 2 });
    });

    it('rejects an unknown party', async () => {
      await expect(
        updateParty(prisma, audit, '11111111-1111-4111-8111-111111111111', { addGuestCap: 2 }),
      ).rejects.toMatchObject({ status: 404, code: 'party_not_found' });
    });

    it('rejects a malformed id without querying', async () => {
      await expect(updateParty(prisma, audit, 'not-a-uuid', { addGuestCap: 2 })).rejects.toMatchObject(
        { code: 'party_not_found' },
      );
    });
  });

  describe('softDeleteParty', () => {
    it('hides the party and its guests from every read', async () => {
      const existing = await smithParty();

      await softDeleteParty(prisma, audit, existing.id);

      expect(await listParties(prisma)).toHaveLength(2);
      await expect(getParty(prisma, existing.id)).rejects.toMatchObject({
        code: 'party_not_found',
      });
      await expect(getPartyDetail(prisma, existing.id, deadline)).rejects.toMatchObject({
        code: 'party_not_found',
      });
    });

    it('preserves the audit history that the FK would have blocked', async () => {
      const existing = await smithParty();

      await softDeleteParty(prisma, audit, existing.id);

      const entries = await prisma.auditEntry.findMany({ where: { partyId: existing.id } });
      expect(entries.some((entry) => entry.action === AUDIT_ACTION.partyDeleted)).toBe(true);
    });

    it('rejects deleting an already-deleted party', async () => {
      const existing = await smithParty();
      await softDeleteParty(prisma, audit, existing.id);

      await expect(softDeleteParty(prisma, audit, existing.id)).rejects.toMatchObject({
        code: 'party_not_found',
      });
    });
  });
});
