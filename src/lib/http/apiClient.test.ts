import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, requestJson } from './apiClient';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stubFetch = (response: Response | Promise<Response>) => {
  const spy = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', spy);
  return spy;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('passes the url and init straight through and returns the decoded body', async () => {
    const spy = stubFetch(jsonResponse(200, { ok: true }));

    await expect(requestJson('/api/thing', { method: 'DELETE' })).resolves.toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('/api/thing', { method: 'DELETE' });
  });

  it('carries the server code, message and extra details on a failure', async () => {
    stubFetch(
      jsonResponse(403, {
        error: 'RSVPs are closed.',
        code: 'rsvp_closed',
        deadline: '2026-09-10T00:00:00.000Z',
      }),
    );

    const error = await requestJson('/api/thing').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'rsvp_closed',
      message: 'RSVPs are closed.',
      details: { deadline: '2026-09-10T00:00:00.000Z' },
    });
  });

  it('yields empty details when the body carries only error and code', async () => {
    stubFetch(jsonResponse(404, { error: 'Party not found', code: 'party_not_found' }));

    const error = await requestJson('/api/thing').catch((caught: unknown) => caught);

    expect((error as ApiError).details).toEqual({});
  });

  it('falls back to unknown_error when the failure body is not JSON', async () => {
    stubFetch(new Response('<html>gateway blew up</html>', { status: 500 }));

    const error = await requestJson('/api/thing').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 500, code: 'unknown_error' });
    expect((error as ApiError).message).toBe('Something went wrong. Please try again.');
  });

  it('reports an unreachable server as a network_error without a status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const error = await requestJson('/api/thing').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 0, code: 'network_error' });
  });

  it('rejects a 2xx body that is not a JSON object', async () => {
    stubFetch(new Response('null', { status: 200 }));

    await expect(requestJson('/api/thing')).rejects.toMatchObject({ code: 'unknown_error' });
  });
});
