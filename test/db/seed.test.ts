import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { RSVP_STATUS, GUEST_SOURCE } from '@/lib/enums';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('seeded database', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('has parties with nested guests', async () => {
    const parties = await prisma.party.findMany({ include: { guests: true } });
    expect(parties.length).toBeGreaterThan(0);
    expect(parties.some((party) => party.guests.length > 0)).toBe(true);
  });

  it('stores only known enum values for guests', async () => {
    const guests = await prisma.guest.findMany();
    const statuses = Object.values(RSVP_STATUS) as string[];
    const sources = Object.values(GUEST_SOURCE) as string[];
    for (const guest of guests) {
      expect(statuses).toContain(guest.rsvpStatus);
      expect(sources).toContain(guest.source);
    }
  });

  it('has exactly one singleton settings row', async () => {
    const settings = await prisma.settings.findMany();
    expect(settings).toHaveLength(1);
    expect(settings[0].id).toBe(1);
  });
});
