import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const requireAdminSession = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  requireAdminSession: () => requireAdminSession(),
}));

vi.mock('@/lib/prisma', () => ({
  getPrismaClient: () => ({}),
}));

const { handleAdminRequest, parseJsonBody } = await import('@/lib/admin/route');
const { RsvpError } = await import('@/lib/rsvp/errors');

function jsonRequest(body: unknown): Request {
  return new Request('https://example.test/api/admin/parties', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('handleAdminRequest', () => {
  beforeEach(() => {
    requireAdminSession.mockReset();
  });

  it('returns the denial response without running the handler', async () => {
    const handler = vi.fn();
    requireAdminSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Authentication required' }, { status: 401 }),
    });

    const response = await handleAdminRequest(jsonRequest({}), handler);

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes the actor email and client address to the handler', async () => {
    requireAdminSession.mockResolvedValue({ authorized: true, email: 'admin@example.com' });
    const request = new Request('https://example.test/api/admin/parties', {
      headers: { 'cf-connecting-ip': '203.0.113.7' },
    });

    const response = await handleAdminRequest(request, async (context) => ({
      actorEmail: context.actorEmail,
      ipAddress: context.ipAddress,
    }));

    expect(await response.json()).toEqual({
      actorEmail: 'admin@example.com',
      ipAddress: '203.0.113.7',
    });
  });

  it('applies the requested success status', async () => {
    requireAdminSession.mockResolvedValue({ authorized: true, email: 'admin@example.com' });

    const response = await handleAdminRequest(jsonRequest({}), async () => ({ ok: true }), {
      status: 201,
    });

    expect(response.status).toBe(201);
  });

  it('renders an RsvpError through the shared envelope', async () => {
    requireAdminSession.mockResolvedValue({ authorized: true, email: 'admin@example.com' });

    const response = await handleAdminRequest(jsonRequest({}), async () => {
      throw new RsvpError(404, 'guest_not_found', 'Guest not found');
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Guest not found', code: 'guest_not_found' });
  });

  it('lets an unexpected failure escape rather than masking it as a 4xx', async () => {
    requireAdminSession.mockResolvedValue({ authorized: true, email: 'admin@example.com' });

    await expect(
      handleAdminRequest(jsonRequest({}), async () => {
        throw new Error('database is down');
      }),
    ).rejects.toThrow('database is down');
  });
});

describe('parseJsonBody', () => {
  const schema = z.object({ displayName: z.string() });

  it('returns the parsed body', async () => {
    expect(await parseJsonBody(jsonRequest({ displayName: 'Smith' }), schema)).toEqual({
      displayName: 'Smith',
    });
  });

  it('rejects a malformed body as a 400 rather than a 500', async () => {
    await expect(parseJsonBody(jsonRequest('{not json'), schema)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });

  it('rejects a schema violation as a 400', async () => {
    await expect(parseJsonBody(jsonRequest({ displayName: 42 }), schema)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });
});
