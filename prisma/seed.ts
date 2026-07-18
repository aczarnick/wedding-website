import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { seedDatabase } from './seed-data';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const prisma = new PrismaClient({ adapter: new PrismaMssql(connectionString) });
  try {
    await seedDatabase(prisma);
    console.log('Seed complete: 3 parties, 5 guests, 1 settings row.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
