import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { getSettings, updateSettings } from '@/lib/admin/settings';
import { AUDIT_ACTION } from '@/lib/enums';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('admin settings services', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });
  const audit = { actorEmail: 'admin@example.com', ipAddress: null };

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reads the seeded singleton', async () => {
    expect(await getSettings(prisma)).toEqual({
      rsvpDeadline: '2026-09-10T00:00:00.000Z',
      defaultAddGuestCap: 5,
    });
  });

  it('moves the deadline and audits the change', async () => {
    const updated = await updateSettings(prisma, audit, {
      rsvpDeadline: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(updated.rsvpDeadline).toBe('2026-10-01T00:00:00.000Z');
    expect(updated.defaultAddGuestCap).toBe(5);
  });

  it('records before and after on a party-less audit row', async () => {
    await updateSettings(prisma, audit, { defaultAddGuestCap: 8 });

    const entry = await prisma.auditEntry.findFirstOrThrow({
      where: { action: AUDIT_ACTION.settingsUpdated },
    });
    expect(JSON.parse(entry.before!).defaultAddGuestCap).toBe(5);
    expect(JSON.parse(entry.after!).defaultAddGuestCap).toBe(8);
    expect(entry.actorEmail).toBe('admin@example.com');
    expect(entry.partyId).toBeNull();
    expect(entry.guestId).toBeNull();
  });

  it('does not retro-apply the default cap to existing parties', async () => {
    await updateSettings(prisma, audit, { defaultAddGuestCap: 8 });

    const parties = await prisma.party.findMany();
    expect(parties.every((party) => party.addGuestCap === 5)).toBe(true);
  });
});
