import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { getSummaryStats } from '@/lib/admin/stats';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('getSummaryStats', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });

  function chenParty() {
    return prisma.party.findFirstOrThrow({ where: { displayName: 'The Chen Family' } });
  }

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('counts the seeded parties and guests by status', async () => {
    const stats = await getSummaryStats(prisma);

    expect(stats).toEqual({
      parties: 3,
      invited: 5,
      attending: 3,
      declined: 1,
      pending: 1,
      flagged: 1,
    });
  });

  it('always reports invited as the sum of the three statuses', async () => {
    const stats = await getSummaryStats(prisma);

    expect(stats.invited).toBe(stats.attending + stats.declined + stats.pending);
  });

  it('excludes a soft-deleted guest', async () => {
    const wei = await prisma.guest.findFirstOrThrow({ where: { lastName: 'Chen' } });

    await prisma.guest.update({ where: { id: wei.id }, data: { deletedAt: new Date() } });
    const stats = await getSummaryStats(prisma);

    expect(stats.declined).toBe(0);
    expect(stats.invited).toBe(4);
    expect(stats.parties).toBe(3);
  });

  it('excludes the guests of a soft-deleted party', async () => {
    const party = await chenParty();

    await prisma.party.update({ where: { id: party.id }, data: { deletedAt: new Date() } });
    const stats = await getSummaryStats(prisma);

    expect(stats.parties).toBe(2);
    expect(stats.declined).toBe(0);
    expect(stats.invited).toBe(4);
  });

  it('stops counting a flagged guest once it is approved', async () => {
    const sam = await prisma.guest.findFirstOrThrow({ where: { flaggedForReview: true } });

    await prisma.guest.update({ where: { id: sam.id }, data: { flaggedForReview: false } });
    const stats = await getSummaryStats(prisma);

    expect(stats.flagged).toBe(0);
    expect(stats.pending).toBe(1);
  });

  it('returns zeros for an empty guest list', async () => {
    await prisma.auditEntry.deleteMany();
    await prisma.guest.deleteMany();
    await prisma.party.deleteMany();

    const stats = await getSummaryStats(prisma);

    expect(stats).toEqual({
      parties: 0,
      invited: 0,
      attending: 0,
      declined: 0,
      pending: 0,
      flagged: 0,
    });
  });
});
