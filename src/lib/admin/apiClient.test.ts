import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminRequestError, adminFetch } from './apiClient';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adminFetch', () => {
  it('returns the parsed body on an OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { id: 'party-1', displayName: 'The Smiths' })),
    );

    const result = await adminFetch<{ id: string; displayName: string }>('/api/admin/parties/party-1');

    expect(result).toEqual({ id: 'party-1', displayName: 'The Smiths' });
  });

  it('throws AdminRequestError with status, code, message, and details on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: 'Import rejected: 2 invalid rows',
          code: 'invalid_csv',
          rowErrors: [{ line: 3, reason: 'missing displayName' }],
          partiesCreated: 0,
        }),
      ),
    );

    await expect(adminFetch('/api/admin/import', { method: 'POST' })).rejects.toMatchObject({
      name: 'AdminRequestError',
      message: 'Import rejected: 2 invalid rows',
      status: 400,
      code: 'invalid_csv',
      details: {
        rowErrors: [{ line: 3, reason: 'missing displayName' }],
        partiesCreated: 0,
      },
    });
  });

  it('does not duplicate error and code into details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { error: 'Party not found', code: 'party_not_found' })),
    );

    try {
      await adminFetch('/api/admin/parties/missing');
      expect.unreachable('adminFetch should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AdminRequestError);
      expect((error as AdminRequestError).details).toEqual({});
    }
  });

  it('throws AdminRequestError with the correct status when the error body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );

    await expect(adminFetch('/api/admin/parties')).rejects.toMatchObject({
      name: 'AdminRequestError',
      status: 502,
    });
  });

  it('propagates a rejected fetch as-is rather than wrapping it', async () => {
    const networkError = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

    await expect(adminFetch('/api/admin/parties')).rejects.toBe(networkError);
  });
});
