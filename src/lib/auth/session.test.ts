import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth }));

import { requireAdminSession } from '@/lib/auth/session';

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  auth.mockReset();
});

describe('requireAdminSession', () => {
  it('authorizes a session whose email is allowlisted', async () => {
    auth.mockResolvedValue({ user: { email: 'admin@example.com' } });

    const result = await requireAdminSession();

    expect(result).toEqual({ authorized: true, email: 'admin@example.com' });
  });

  it('returns 401 when there is no session', async () => {
    auth.mockResolvedValue(null);

    const result = await requireAdminSession();

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.response.status).toBe(401);
  });

  it('returns 401 when the session carries no email', async () => {
    auth.mockResolvedValue({ user: {} });

    const result = await requireAdminSession();

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.response.status).toBe(401);
  });

  it('returns 403 when the session email is no longer allowlisted', async () => {
    auth.mockResolvedValue({ user: { email: 'removed@example.com' } });

    const result = await requireAdminSession();

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.response.status).toBe(403);
  });

  it('does not echo the rejected address back to the client', async () => {
    auth.mockResolvedValue({ user: { email: 'removed@example.com' } });

    const result = await requireAdminSession();

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    await expect(result.response.text()).resolves.not.toContain('removed@example.com');
  });
});
