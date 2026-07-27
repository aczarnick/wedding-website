import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { AUDIT_ACTION, GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';
import { getPartyDetail, requireRsvpOpen, searchParties, submitRsvp } from '@/lib/rsvp/parties';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('guest API services', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });
  const beforeDeadline = new Date('2026-08-01T00:00:00Z');
  const afterDeadline = new Date('2026-10-01T00:00:00Z');

  function smithParty() {
    return prisma.party.findFirstOrThrow({
      where: { displayName: 'The Smith Family' },
      include: { guests: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
  }

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('searchParties', () => {
    it('finds a party by exact full name', async () => {
      const results = await searchParties(prisma, 'John Smith');

      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe('The Smith Family');
      expect(results[0].guestFirstNames).toContain('John');
    });

    it('matches case-insensitively via the database collation', async () => {
      const results = await searchParties(prisma, 'jOhN sMiTh');

      expect(results).toHaveLength(1);
    });

    it('returns nothing for a partial name', async () => {
      expect(await searchParties(prisma, 'Joh Smith')).toEqual([]);
    });

    it('returns nothing for an unknown name', async () => {
      expect(await searchParties(prisma, 'Nobody Here')).toEqual([]);
    });
  });

  describe('getPartyDetail', () => {
    it('returns guests without the moderation flag', async () => {
      const party = await smithParty();

      const detail = await getPartyDetail(prisma, party.id, beforeDeadline);

      expect(detail.guests.length).toBe(party.guests.length);
      expect(detail.guests[0]).not.toHaveProperty('flaggedForReview');
    });

    it('rejects a malformed id as not found rather than erroring', async () => {
      await expect(getPartyDetail(prisma, 'not-a-uuid', beforeDeadline)).rejects.toMatchObject({
        status: 404,
        code: 'party_not_found',
      });
    });

    it('rejects an unknown id as not found', async () => {
      await expect(
        getPartyDetail(prisma, '3f9a1b2c-4d5e-4f60-8a1b-2c3d4e5f6071', beforeDeadline),
      ).rejects.toBeInstanceOf(RsvpError);
    });
  });

  describe('requireRsvpOpen', () => {
    it('returns the deadline while the window is open', async () => {
      await expect(requireRsvpOpen(prisma, beforeDeadline)).resolves.toBeInstanceOf(Date);
    });

    it('throws 403 once the deadline has passed', async () => {
      await expect(requireRsvpOpen(prisma, afterDeadline)).rejects.toMatchObject({
        status: 403,
        code: 'rsvp_closed',
      });
    });

    it('throws 500 when the settings row is missing', async () => {
      await prisma.settings.deleteMany();

      await expect(requireRsvpOpen(prisma, beforeDeadline)).rejects.toMatchObject({
        status: 500,
        code: 'settings_missing',
      });
    });
  });

  describe('submitRsvp', () => {
    it('applies statuses, songs, message and added guests in one call', async () => {
      const party = await smithParty();

      const detail = await submitRsvp(
        prisma,
        party.id,
        {
          message: 'See you there',
          guests: party.guests.map((guest) => ({
            id: guest.id,
            rsvpStatus: RSVP_STATUS.declined,
            songRequest: 'Dancing Queen',
          })),
          newGuests: [
            {
              firstName: 'Sam',
              lastName: 'Rivera',
              rsvpStatus: RSVP_STATUS.attending,
              songRequest: null,
            },
          ],
        },
        '203.0.113.7',
        beforeDeadline,
      );

      expect(detail.message).toBe('See you there');
      expect(detail.guests).toHaveLength(party.guests.length + 1);

      const added = detail.guests.find((guest) => guest.firstName === 'Sam');
      expect(added?.source).toBe(GUEST_SOURCE.guestAdded);

      const persisted = await prisma.guest.findFirstOrThrow({ where: { firstName: 'Sam' } });
      expect(persisted.flaggedForReview).toBe(true);
    });

    it('writes one submit entry plus one entry per added guest', async () => {
      const party = await smithParty();

      await submitRsvp(
        prisma,
        party.id,
        {
          message: null,
          guests: party.guests.map((guest) => ({
            id: guest.id,
            rsvpStatus: RSVP_STATUS.attending,
            songRequest: null,
          })),
          newGuests: [
            {
              firstName: 'Sam',
              lastName: 'Rivera',
              rsvpStatus: RSVP_STATUS.attending,
              songRequest: null,
            },
          ],
        },
        '203.0.113.7',
        beforeDeadline,
      );

      const entries = await prisma.auditEntry.findMany({ where: { partyId: party.id } });

      expect(entries.filter((entry) => entry.action === AUDIT_ACTION.rsvpSubmitted)).toHaveLength(1);
      expect(entries.filter((entry) => entry.action === AUDIT_ACTION.guestAdded)).toHaveLength(1);
      expect(entries.every((entry) => entry.ipAddress === '203.0.113.7')).toBe(true);
    });

    it('rejects a submission whose guest set is stale', async () => {
      const party = await smithParty();

      await expect(
        submitRsvp(
          prisma,
          party.id,
          {
            message: null,
            guests: [
              {
                id: party.guests[0].id,
                rsvpStatus: RSVP_STATUS.attending,
                songRequest: null,
              },
            ],
            newGuests: [],
          },
          null,
          beforeDeadline,
        ),
      ).rejects.toMatchObject({ status: 409, code: 'party_changed' });
    });

    it('rolls back entirely when the add-guest cap is exceeded', async () => {
      const party = await smithParty();
      await prisma.party.update({ where: { id: party.id }, data: { addGuestCap: 1 } });

      await expect(
        submitRsvp(
          prisma,
          party.id,
          {
            message: 'should not persist',
            guests: party.guests.map((guest) => ({
              id: guest.id,
              rsvpStatus: RSVP_STATUS.declined,
              songRequest: null,
            })),
            newGuests: [
              {
                firstName: 'Sam',
                lastName: 'Rivera',
                rsvpStatus: RSVP_STATUS.attending,
                songRequest: null,
              },
              {
                firstName: 'Robin',
                lastName: 'Rivera',
                rsvpStatus: RSVP_STATUS.attending,
                songRequest: null,
              },
            ],
          },
          null,
          beforeDeadline,
        ),
      ).rejects.toMatchObject({ status: 409, code: 'add_guest_cap_exceeded' });

      const untouched = await prisma.party.findUniqueOrThrow({ where: { id: party.id } });
      expect(untouched.message).toBe(party.message);
      expect(await prisma.guest.count({ where: { partyId: party.id } })).toBe(party.guests.length);
      expect(await prisma.auditEntry.count({ where: { partyId: party.id } })).toBe(0);
    });

    it('refuses to write once the deadline has passed', async () => {
      const party = await smithParty();

      await expect(
        submitRsvp(
          prisma,
          party.id,
          {
            message: null,
            guests: party.guests.map((guest) => ({
              id: guest.id,
              rsvpStatus: RSVP_STATUS.attending,
              songRequest: null,
            })),
            newGuests: [],
          },
          null,
          afterDeadline,
        ),
      ).rejects.toMatchObject({ status: 403, code: 'rsvp_closed' });
    });
  });

  describe('soft delete', () => {
    it('hides a soft-deleted guest from the party detail', async () => {
      const party = await smithParty();
      const removed = party.guests[0];
      await prisma.guest.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

      const detail = await getPartyDetail(prisma, party.id, beforeDeadline);

      expect(detail.guests.map((guest) => guest.id)).not.toContain(removed.id);
    });

    it('hides a soft-deleted party from search', async () => {
      const party = await smithParty();
      await prisma.party.update({ where: { id: party.id }, data: { deletedAt: new Date() } });

      expect(await searchParties(prisma, 'John Smith')).toEqual([]);
    });

    it('treats a soft-deleted party as missing when reading detail', async () => {
      const party = await smithParty();
      await prisma.party.update({ where: { id: party.id }, data: { deletedAt: new Date() } });

      await expect(getPartyDetail(prisma, party.id, beforeDeadline)).rejects.toMatchObject({
        code: 'party_not_found',
      });
    });

    it('rejects an RSVP submission for a soft-deleted party', async () => {
      const party = await smithParty();
      await prisma.party.update({ where: { id: party.id }, data: { deletedAt: new Date() } });

      await expect(
        submitRsvp(
          prisma,
          party.id,
          {
            message: null,
            guests: party.guests.map((guest) => ({
              id: guest.id,
              rsvpStatus: RSVP_STATUS.attending,
              songRequest: null,
            })),
            newGuests: [],
          },
          null,
          beforeDeadline,
        ),
      ).rejects.toMatchObject({ code: 'party_not_found' });
    });
  });
});
