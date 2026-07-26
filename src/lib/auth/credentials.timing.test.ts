import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/scrypt', () => ({
  verifyPassword: vi.fn().mockResolvedValue(false),
}));

import { verifyAdminCredentials } from '@/lib/auth/credentials';
import { verifyPassword } from '@/lib/auth/scrypt';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('verifyAdminCredentials timing', () => {
  it('still performs the password check when the submitted email is not the configured admin', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'scrypt:16384:8:1:c2FsdA==:a2V5');

    await verifyAdminCredentials('intruder@example.com', 'anything');

    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledWith('anything', 'scrypt:16384:8:1:c2FsdA==:a2V5');
  });
});
