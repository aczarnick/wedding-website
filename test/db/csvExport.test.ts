import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { RSVP_STATUS } from '@/lib/enums';
import { loadExportRecords } from '@/lib/rsvp/admin/export';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('loadExportRecords', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns one record per guest', async () => {
    const records = await loadExportRecords(prisma);

    expect(records).toHaveLength(await prisma.guest.count());
  });

  it('orders by party display name then guest creation', async () => {
    const records = await loadExportRecords(prisma);
    const names = records.map((record) => record.partyDisplayName);

    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
  });

  it('carries party fields onto every guest row', async () => {
    const records = await loadExportRecords(prisma);
    const smiths = records.filter((record) => record.partyDisplayName === 'The Smith Family');

    expect(smiths.length).toBeGreaterThan(1);
    expect(new Set(smiths.map((record) => record.partyId)).size).toBe(1);
    expect(new Set(smiths.map((record) => record.addGuestCap)).size).toBe(1);
  });

  it('reflects live RSVP state', async () => {
    const guest = await prisma.guest.findFirstOrThrow();
    await prisma.guest.update({
      where: { id: guest.id },
      data: { rsvpStatus: RSVP_STATUS.attending, songRequest: 'Sweet Caroline' },
    });

    const records = await loadExportRecords(prisma);
    const updated = records.find((record) => record.guestId === guest.id);

    expect(updated).toMatchObject({
      rsvpStatus: RSVP_STATUS.attending,
      songRequest: 'Sweet Caroline',
    });
  });

  it('omits a soft-deleted guest', async () => {
    const guest = await prisma.guest.findFirstOrThrow();
    await prisma.guest.update({ where: { id: guest.id }, data: { deletedAt: new Date() } });

    const records = await loadExportRecords(prisma);

    expect(records.find((record) => record.guestId === guest.id)).toBeUndefined();
  });

  it('omits every guest of a soft-deleted party', async () => {
    const party = await prisma.party.findFirstOrThrow({ include: { guests: true } });
    await prisma.party.update({ where: { id: party.id }, data: { deletedAt: new Date() } });

    const records = await loadExportRecords(prisma);

    expect(records.filter((record) => record.partyId === party.id)).toEqual([]);
  });
});
