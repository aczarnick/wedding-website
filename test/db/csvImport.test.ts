import 'dotenv/config';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, type Prisma } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { ACTOR_TYPE, AUDIT_ACTION, GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';
import { RsvpError } from '@/lib/rsvp/errors';
import { importParties } from '@/lib/rsvp/admin/import';
import { seedDatabase } from '../../prisma/seed-data';

const databaseUrl = process.env.DATABASE_URL;
const HEADER = 'partyDisplayName,firstName,lastName,message,addGuestCap';
const ACTOR = 'admin@example.com';

/** Lets one `party.create` through, then rejects every call after it. */
function failAfterFirstCreate(party: Prisma.TransactionClient['party']): Prisma.TransactionClient['party'] {
  let creates = 0;

  return new Proxy(party, {
    get(target, property, receiver) {
      if (property !== 'create') {
        return Reflect.get(target, property, receiver);
      }

      return (...args: Parameters<typeof target.create>) => {
        creates += 1;
        return creates >= 2
          ? Promise.reject(new Error('simulated failure on the second party.create'))
          : Reflect.apply(target.create, target, args);
      };
    },
  });
}

/**
 * Wraps a real Prisma client so the transaction handed to `importParties`
 * fails partway through, on the second `party.create`. Proves the
 * all-or-nothing guarantee holds after writes are already underway, not just
 * when validation rejects before `$transaction` opens.
 */
function withSecondPartyCreateFailing(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== '$transaction') {
        return Reflect.get(target, property, receiver);
      }

      return (callback: (tx: Prisma.TransactionClient) => unknown, options?: unknown) =>
        Reflect.apply(target.$transaction, target, [
          (tx: Prisma.TransactionClient) => {
            // Wrapped once per transaction attempt: the `party.create` counter must
            // persist across every `tx.party` access within the same run, not reset
            // each time the property is read.
            const wrappedParty = failAfterFirstCreate(tx.party);

            return callback(
              new Proxy(tx, {
                get(txTarget, txProperty, txReceiver) {
                  return txProperty === 'party'
                    ? wrappedParty
                    : Reflect.get(txTarget, txProperty, txReceiver);
                },
              }),
            );
          },
          options,
        ]);
    },
  }) as PrismaClient;
}

describe.skipIf(!databaseUrl)('importParties', () => {
  const prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl!) });

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function importText(text: string) {
    return importParties(prisma, text, ACTOR, '203.0.113.7');
  }

  async function expectRsvpError(text: string): Promise<RsvpError> {
    try {
      await importText(text);
    } catch (error) {
      if (error instanceof RsvpError) return error;
      throw error;
    }
    throw new Error('expected the import to be rejected');
  }

  it('creates parties and guests', async () => {
    const summary = await importText(
      `${HEADER}\nThe Brown Family,Ada,Brown,Congrats!,3\nThe Brown Family,Bob,Brown,,\n`,
    );

    expect(summary).toEqual({ partiesCreated: 1, guestsCreated: 2 });

    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Brown Family' },
      include: { guests: true },
    });

    expect(party).toMatchObject({ message: 'Congrats!', addGuestCap: 3 });
    expect(party.guests).toHaveLength(2);
  });

  it('forces created guests into the server-side initial state', async () => {
    await importText(
      'partyDisplayName,firstName,lastName,rsvpStatus,source,flaggedForReview\n' +
        'The Brown Family,Ada,Brown,attending,guest_added,true\n',
    );

    const guest = await prisma.guest.findFirstOrThrow({ where: { firstName: 'Ada' } });

    expect(guest).toMatchObject({
      rsvpStatus: RSVP_STATUS.pending,
      source: GUEST_SOURCE.admin,
      flaggedForReview: false,
    });
  });

  it('inherits the settings default when addGuestCap is blank', async () => {
    await importText(`${HEADER}\nThe Brown Family,Ada,Brown,,\n`);

    const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Brown Family' },
    });

    expect(party.addGuestCap).toBe(settings.defaultAddGuestCap);
  });

  it('succeeds without settings when every row specifies addGuestCap', async () => {
    await prisma.settings.deleteMany();

    const summary = await importText(
      `${HEADER}\nThe Brown Family,Ada,Brown,,3\n`,
    );

    expect(summary).toEqual({ partiesCreated: 1, guestsCreated: 1 });

    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Brown Family' },
    });
    expect(party.addGuestCap).toBe(3);
  });

  it('still fails loudly when a blank addGuestCap needs a missing settings row', async () => {
    await prisma.settings.deleteMany();

    const error = await expectRsvpError(`${HEADER}\nThe Brown Family,Ada,Brown,,\n`);

    expect(error.status).toBe(500);
    expect(error.code).toBe('settings_missing');
  });

  it('writes one import audit entry per party with the actor email', async () => {
    await importText(`${HEADER}\nThe Brown Family,Ada,Brown,,\n`);

    const party = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Brown Family' },
    });
    const entries = await prisma.auditEntry.findMany({ where: { partyId: party.id } });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: AUDIT_ACTION.import,
      actorType: ACTOR_TYPE.admin,
      actorEmail: ACTOR,
      ipAddress: '203.0.113.7',
      before: null,
    });
    expect(JSON.parse(entries[0].after!).guests).toHaveLength(1);
  });

  it('writes nothing when any row is invalid', async () => {
    const before = await prisma.party.count();

    const error = await expectRsvpError(
      `${HEADER}\nThe Brown Family,Ada,Brown,,\nThe Green Family,,Green,,\n`,
    );

    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_csv');
    expect(await prisma.party.count()).toBe(before);
  });

  it('rejects a display name that already exists, case-insensitively', async () => {
    const error = await expectRsvpError(`${HEADER}\nthe smith family,Ada,Brown,,\n`);

    expect(error.code).toBe('invalid_csv');
    expect((error.details.rowErrors as { reason: string }[])[0].reason).toContain('already exists');
  });

  it('lets a soft-deleted display name be reused', async () => {
    const smiths = await prisma.party.findFirstOrThrow({
      where: { displayName: 'The Smith Family' },
    });
    await prisma.party.update({ where: { id: smiths.id }, data: { deletedAt: new Date() } });

    const summary = await importText(`${HEADER}\nThe Smith Family,Ada,Brown,,\n`);

    expect(summary).toEqual({ partiesCreated: 1, guestsCreated: 1 });

    const live = await prisma.party.findMany({
      where: { displayName: 'The Smith Family', deletedAt: null },
    });

    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(smiths.id);
  });

  it('writes nothing when one party of several collides', async () => {
    const before = await prisma.party.count();

    await expectRsvpError(
      `${HEADER}\nThe Brown Family,Ada,Brown,,\nThe Smith Family,Zed,Smith,,\n`,
    );

    expect(await prisma.party.count()).toBe(before);
  });

  it('rolls back every write when a later party fails mid-transaction', async () => {
    const partiesBefore = await prisma.party.count();
    const guestsBefore = await prisma.guest.count();
    expect(partiesBefore).toBe(3);
    expect(guestsBefore).toBe(5);

    const failingClient = withSecondPartyCreateFailing(prisma);

    await expect(
      importParties(
        failingClient,
        `${HEADER}\nThe Brown Family,Ada,Brown,,\nThe Green Family,Zed,Green,,\n`,
        ACTOR,
        '203.0.113.7',
      ),
    ).rejects.toThrow('simulated failure on the second party.create');

    expect(await prisma.party.count()).toBe(partiesBefore);
    expect(await prisma.guest.count()).toBe(guestsBefore);
  });

  it('rejects a file over the row limit', async () => {
    const rows = Array.from(
      { length: 2001 },
      (_, index) => `Party ${index},First${index},Last${index},,`,
    ).join('\n');

    const error = await expectRsvpError(`${HEADER}\n${rows}\n`);

    expect(error.status).toBe(413);
    expect(error.code).toBe('csv_too_large');
  });
});
