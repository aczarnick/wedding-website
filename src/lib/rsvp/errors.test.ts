import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RsvpError, errorResponse, invalidRequest } from '@/lib/rsvp/errors';

describe('errorResponse', () => {
  it('renders an RsvpError as its status and code', async () => {
    const response = errorResponse(new RsvpError(404, 'party_not_found', 'Party not found'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Party not found',
      code: 'party_not_found',
    });
  });

  it('merges details into the body', async () => {
    const response = errorResponse(
      new RsvpError(403, 'rsvp_closed', 'RSVPs are closed', {
        deadline: '2026-09-10T00:00:00.000Z',
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: 'RSVPs are closed',
      code: 'rsvp_closed',
      deadline: '2026-09-10T00:00:00.000Z',
    });
  });

  it('rethrows anything that is not an RsvpError so it surfaces as a 500', () => {
    const unexpected = new Error('connection reset');

    expect(() => errorResponse(unexpected)).toThrow(unexpected);
  });
});

describe('invalidRequest', () => {
  it('builds a 400 carrying the first field message', async () => {
    const schema = z.object({ name: z.string().min(3, 'Too short') });
    const parsed = schema.safeParse({ name: 'a' });
    if (parsed.success) throw new Error('expected a parse failure');

    const error = invalidRequest(parsed.error);

    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_request');
    expect(error.message).toBe('Too short');
  });
});
