import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyAdminCredentials } from '@/lib/auth/credentials';
import { hashPassword, verifyPassword } from '@/lib/auth/scrypt';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function configureAdmin(email: string, password: string) {
  vi.stubEnv('ADMIN_EMAIL', email);
  vi.stubEnv('ADMIN_PASSWORD_HASH', await hashPassword(password));
}

describe('hashPassword', () => {
  it('produces a self-describing scrypt string', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.split('$')).toHaveLength(6);
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('salts each hash so identical passwords differ', async () => {
    const first = await hashPassword('same password');
    const second = await hashPassword('same password');
    expect(first).not.toBe(second);
  });
});

describe('verifyPassword', () => {
  it('accepts the password that produced the hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects a malformed hash without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(verifyPassword('anything', 'not-a-valid-hash')).resolves.toBe(false);
  });
});

describe('verifyAdminCredentials', () => {
  it('accepts the configured email and password', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('admin@example.com', 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('matches the configured email case-insensitively', async () => {
    await configureAdmin('Admin@Example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('admin@example.com', 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('admin@example.com', 'wrong password'),
    ).resolves.toBe(false);
  });

  it('rejects an unknown email', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('intruder@example.com', 'correct horse battery staple'),
    ).resolves.toBe(false);
  });

  it('rejects when no admin is configured', async () => {
    vi.stubEnv('ADMIN_EMAIL', '');
    vi.stubEnv('ADMIN_PASSWORD_HASH', '');
    await expect(verifyAdminCredentials('admin@example.com', 'anything')).resolves.toBe(false);
  });

  it('rejects an address that is not the configured admin even with a valid hash', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(
      verifyAdminCredentials('someone-else@example.com', 'correct horse battery staple'),
    ).resolves.toBe(false);
  });

  it('rejects a malformed stored hash without throwing', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'not-a-valid-hash');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(verifyAdminCredentials('admin@example.com', 'anything')).resolves.toBe(false);
  });

  it('rejects a hash naming an unsupported algorithm', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'bcrypt$16384$8$1$c2FsdA==$a2V5');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(verifyAdminCredentials('admin@example.com', 'anything')).resolves.toBe(false);
  });

  it('rejects an empty password', async () => {
    await configureAdmin('admin@example.com', 'correct horse battery staple');
    await expect(verifyAdminCredentials('admin@example.com', '')).resolves.toBe(false);
  });
});
