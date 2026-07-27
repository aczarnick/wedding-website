import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { RSVP_STATUS } from '@/lib/enums';
import { importParties } from '@/lib/rsvp/admin/import';
import { loadExportRecords } from '@/lib/rsvp/admin/export';
import { toExportCsv } from '@/lib/rsvp/csvExport';
import { parseImportCsv } from '@/lib/rsvp/csvImport';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

const SAMPLE_CSV = [
  'partyDisplayName,firstName,lastName,message,addGuestCap',
  'The Brown Family,Ada,Brown,"So happy for you, both!",3',
  'The Brown Family,Bob,Brown,,',
  'Cleo Nguyễn,Cleo,Nguyễn,,1',
  '',
].join('\n');

describe.skipIf(!databaseUrl)('CSV round trip', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exports what was imported', async () => {
    const summary = await importParties(prisma, SAMPLE_CSV, 'admin@example.com', null);

    expect(summary).toEqual({ partiesCreated: 2, guestsCreated: 3 });

    const records = await loadExportRecords(prisma);
    const browns = records.filter((record) => record.partyDisplayName === 'The Brown Family');

    expect(browns).toHaveLength(2);
    expect(browns[0]).toMatchObject({
      message: 'So happy for you, both!',
      addGuestCap: 3,
      rsvpStatus: RSVP_STATUS.pending,
    });
    expect(records.some((record) => record.firstName === 'Cleo')).toBe(true);
  });

  it('produces an export that the import parser can read back', async () => {
    await importParties(prisma, SAMPLE_CSV, 'admin@example.com', null);

    const csv = toExportCsv(await loadExportRecords(prisma));
    const reparsed = parseImportCsv(csv);

    expect(reparsed.ok).toBe(true);
  });

  it('reflects a submitted RSVP in the export', async () => {
    await importParties(prisma, SAMPLE_CSV, 'admin@example.com', null);

    const ada = await prisma.guest.findFirstOrThrow({ where: { firstName: 'Ada' } });
    await prisma.guest.update({
      where: { id: ada.id },
      data: { rsvpStatus: RSVP_STATUS.attending, songRequest: 'Sweet Caroline' },
    });

    const records = await loadExportRecords(prisma);

    expect(records.find((record) => record.guestId === ada.id)).toMatchObject({
      rsvpStatus: RSVP_STATUS.attending,
      songRequest: 'Sweet Caroline',
    });
  });

  it('leaves the database untouched when a later row is malformed', async () => {
    const partiesBefore = await prisma.party.count();
    const guestsBefore = await prisma.guest.count();

    await expect(
      importParties(
        prisma,
        `${SAMPLE_CSV}The Green Family,,Green,,\n`,
        'admin@example.com',
        null,
      ),
    ).rejects.toMatchObject({ code: 'invalid_csv' });

    expect(await prisma.party.count()).toBe(partiesBefore);
    expect(await prisma.guest.count()).toBe(guestsBefore);
  });
});
