import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getPrismaClient', () => {
  it('imports without throwing when DATABASE_URL is unset', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(import('@/lib/prisma')).resolves.toHaveProperty('getPrismaClient');
  });

  it('throws when called without DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getPrismaClient } = await import('@/lib/prisma');

    expect(() => getPrismaClient()).toThrow('DATABASE_URL is not set');
  });
});
