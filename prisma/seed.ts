import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { RSVP_STATUS, GUEST_SOURCE } from '../src/lib/enums';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaMssql(connectionString) });

async function main() {
  await prisma.auditEntry.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.party.deleteMany();
  await prisma.settings.deleteMany();

  await prisma.settings.create({
    data: {
      id: 1,
      rsvpDeadline: new Date('2026-09-10T00:00:00Z'),
      defaultAddGuestCap: 5,
    },
  });

  await prisma.party.create({
    data: {
      displayName: 'The Smith Family',
      guests: {
        create: [
          { firstName: 'John', lastName: 'Smith', rsvpStatus: RSVP_STATUS.attending, source: GUEST_SOURCE.admin },
          { firstName: 'Jane', lastName: 'Smith', rsvpStatus: RSVP_STATUS.attending, source: GUEST_SOURCE.admin, songRequest: 'September — Earth, Wind & Fire' },
        ],
      },
    },
  });

  await prisma.party.create({
    data: {
      displayName: 'Alex Rivera & Guest',
      message: 'So excited to celebrate with you!',
      guests: {
        create: [
          { firstName: 'Alex', lastName: 'Rivera', rsvpStatus: RSVP_STATUS.attending, source: GUEST_SOURCE.admin },
          { firstName: 'Sam', lastName: 'Rivera', rsvpStatus: RSVP_STATUS.pending, source: GUEST_SOURCE.guestAdded, flaggedForReview: true },
        ],
      },
    },
  });

  await prisma.party.create({
    data: {
      displayName: 'The Chen Family',
      guests: {
        create: [
          { firstName: 'Wei', lastName: 'Chen', rsvpStatus: RSVP_STATUS.declined, source: GUEST_SOURCE.admin },
        ],
      },
    },
  });

  console.log('Seed complete: 3 parties, 5 guests, 1 settings row.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
