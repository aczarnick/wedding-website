import { describe, expect, it } from 'vitest';
import { clientIpAddress } from '@/lib/rsvp/clientIp';

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/parties/search', { headers });
}

describe('clientIpAddress', () => {
  it('prefers the Cloudflare header', () => {
    const request = requestWithHeaders({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
    });

    expect(clientIpAddress(request)).toBe('203.0.113.7');
  });

  it('falls back to the first forwarded-for entry', () => {
    const request = requestWithHeaders({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' });

    expect(clientIpAddress(request)).toBe('198.51.100.1');
  });

  it('returns null when neither header is present', () => {
    expect(clientIpAddress(requestWithHeaders({}))).toBe(null);
  });

  it('returns null for a blank forwarded-for header', () => {
    expect(clientIpAddress(requestWithHeaders({ 'x-forwarded-for': '  ' }))).toBe(null);
  });
});
