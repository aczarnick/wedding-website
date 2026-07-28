import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchParty, searchParties, submitRsvp } from './client';
import type { PartyDetail, SubmitRsvpBody } from '@/lib/rsvp/types';

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

const PARTY: PartyDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'The Smith Family',
  message: null,
  addGuestCap: 5,
  addedGuestsRemaining: 5,
  rsvpDeadline: '2026-09-10T00:00:00.000Z',
  guests: [],
};

const SUBMIT_BODY: SubmitRsvpBody = { message: null, guests: [], newGuests: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchParties', () => {
  it('URL-encodes the query and unwraps the parties array', async () => {
    const spy = stubFetch(jsonResponse(200, { parties: [{ id: 'a', displayName: 'A', guestFirstNames: ['Al'] }] }));

    const result = await searchParties('mary jo van der berg');

    expect(spy).toHaveBeenCalledWith('/api/parties/search?q=mary%20jo%20van%20der%20berg', undefined);
    expect(result).toEqual([{ id: 'a', displayName: 'A', guestFirstNames: ['Al'] }]);
  });

  it('returns an empty array when nothing matches', async () => {
    stubFetch(jsonResponse(200, { parties: [] }));

    await expect(searchParties('no body')).resolves.toEqual([]);
  });
});

describe('fetchParty', () => {
  it('requests the party by id', async () => {
    const spy = stubFetch(jsonResponse(200, PARTY));

    await expect(fetchParty(PARTY.id)).resolves.toEqual(PARTY);
    expect(spy).toHaveBeenCalledWith(`/api/parties/${PARTY.id}`, undefined);
  });
});

describe('submitRsvp', () => {
  it('PATCHes the body as JSON', async () => {
    const spy = stubFetch(jsonResponse(200, PARTY));

    await expect(submitRsvp(PARTY.id, SUBMIT_BODY)).resolves.toEqual(PARTY);
    expect(spy).toHaveBeenCalledWith(`/api/parties/${PARTY.id}/rsvp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SUBMIT_BODY),
    });
  });
});
