import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { queryAuditLog } from '@/lib/admin/audit';
import { updateGuest } from '@/lib/admin/guests';
import { updateParty } from '@/lib/admin/parties';
import { AUDIT_ACTION, RSVP_STATUS } from '@/lib/enums';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('admin audit log', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });
  const audit = { actorEmail: 'admin@example.com', ipAddress: '203.0.113.7' };

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function generateEntries() {
    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Smith Family' },
      include: { guests: true },
    });

    await updateParty(prisma, audit, party.id, { addGuestCap: 4 });
    await updateGuest(prisma, audit, party.guests[0].id, { rsvpStatus: RSVP_STATUS.declined });

    return party;
  }

  it('returns an empty log for freshly seeded data', async () => {
    expect(await queryAuditLog(prisma, { limit: 100, offset: 0 })).toEqual({
      entries: [],
      total: 0,
    });
  });

  it('returns entries newest first with parsed snapshots', async () => {
    await generateEntries();

    const { entries, total } = await queryAuditLog(prisma, { limit: 100, offset: 0 });

    expect(total).toBe(2);
    expect(entries[0].action).toBe(AUDIT_ACTION.guestUpdated);
    expect(entries[0].actorEmail).toBe('admin@example.com');
    expect(entries[0].ipAddress).toBe('203.0.113.7');
    expect((entries[0].after as { rsvpStatus: string }).rsvpStatus).toBe(RSVP_STATUS.declined);
  });

  it('filters by action', async () => {
    await generateEntries();

    const { entries, total } = await queryAuditLog(prisma, {
      action: AUDIT_ACTION.partyUpdated,
      limit: 100,
      offset: 0,
    });

    expect(total).toBe(1);
    expect(entries[0].action).toBe(AUDIT_ACTION.partyUpdated);
  });

  it('filters by party', async () => {
    const party = await generateEntries();

    const { total } = await queryAuditLog(prisma, { partyId: party.id, limit: 100, offset: 0 });

    expect(total).toBe(2);
  });

  it('paginates without changing the total', async () => {
    await generateEntries();

    const { entries, total } = await queryAuditLog(prisma, { limit: 1, offset: 1 });

    expect(entries).toHaveLength(1);
    expect(total).toBe(2);
    expect(entries[0].action).toBe(AUDIT_ACTION.partyUpdated);
  });

  it('surfaces corrupt snapshots as raw strings without failing the whole query', async () => {
    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Smith Family' },
    });

    const corruptRawText = 'not valid JSON at all';
    await prisma.auditEntry.create({
      data: {
        partyId: party.id,
        action: AUDIT_ACTION.partyUpdated,
        actorType: 'admin',
        before: JSON.stringify({ addGuestCap: 5 }),
        after: corruptRawText,
      },
    });

    const { entries, total } = await queryAuditLog(prisma, { limit: 100, offset: 0 });

    expect(total).toBe(1);
    expect(entries[0].after).toBe(corruptRawText);
    expect(entries[0].before).toEqual({ addGuestCap: 5 });
  });
});
