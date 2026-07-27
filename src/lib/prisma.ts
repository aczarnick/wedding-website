import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let cachedClient: PrismaClient | undefined;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  return new PrismaClient({
    adapter: new PrismaMssql(connectionString),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

/**
 * Returns the shared Prisma client, creating it on first use.
 * The connection string is read here rather than at module scope so that
 * `next build` and `docker build`, which run without secrets, can import
 * modules that depend on the database.
 */
export function getPrismaClient(): PrismaClient {
  cachedClient ??= globalForPrisma.prisma ?? createClient();

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = cachedClient;
  }

  return cachedClient;
}
