import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn((handler) => handler));

vi.mock('@/auth', () => ({ auth }));

import { proxy } from '@/proxy';

type StubRequest = {
  auth: { user: { email: string } } | null;
  nextUrl: URL;
};

function requestFor(pathname: string, email: string | null): StubRequest {
  return {
    auth: email === null ? null : { user: { email } },
    nextUrl: new URL(pathname, 'http://localhost:3000'),
  };
}

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy', () => {
  it('allows an allowlisted signed-in user through to an admin page', async () => {
    const request = requestFor('/admin', 'admin@example.com');

    const response = await proxy(request as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('allows an allowlisted signed-in user through to an admin API route', async () => {
    const request = requestFor('/api/admin/parties', 'admin@example.com');

    const response = await proxy(request as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects an unauthenticated page request to sign-in with a callbackUrl', async () => {
    const request = requestFor('/admin', null);

    const response = await proxy(request as never);

    expect([307, 308]).toContain(response.status);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/api/auth/signin');
    expect(location.searchParams.get('callbackUrl')).toBe('http://localhost:3000/admin');
  });

  it('returns 401 (not a redirect) for an unauthenticated admin API request', async () => {
    const request = requestFor('/api/admin/parties', null);

    const response = await proxy(request as never);

    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
    const body = await response.json();
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('redirects a page request when the session email was removed from the allowlist', async () => {
    const request = requestFor('/admin', 'removed@example.com');

    const response = await proxy(request as never);

    expect([307, 308]).toContain(response.status);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/api/auth/signin');
  });

  it('returns 401 for an admin API request when the session email was removed from the allowlist', async () => {
    const request = requestFor('/api/admin/parties', 'removed@example.com');

    const response = await proxy(request as never);

    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not echo the rejected email address back in the 401 body', async () => {
    const request = requestFor('/api/admin/parties', 'removed@example.com');

    const response = await proxy(request as never);

    await expect(response.text()).resolves.not.toContain('removed@example.com');
  });
});
