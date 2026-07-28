import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createGuest,
  createParty,
  deleteGuest,
  deleteParty,
  fetchFlaggedGuests,
  fetchParties,
  moderateGuest,
  updateGuest,
  updateParty,
} from './client';
import type { GuestFields, NewPartyBody } from './client';

const PARTY_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_ID = '22222222-2222-4222-8222-222222222222';

const GUEST_FIELDS: GuestFields = {
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'attending',
  songRequest: null,
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stubFetch = (body: unknown, status = 200) => {
  const spy = vi.fn(() => Promise.resolve(jsonResponse(status, body)));
  vi.stubGlobal('fetch', spy);
  return spy;
};

const jsonInit = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchParties', () => {
  it('unwraps the parties array', async () => {
    const spy = stubFetch({ parties: [{ id: PARTY_ID }] });

    await expect(fetchParties()).resolves.toEqual([{ id: PARTY_ID }]);
    expect(spy).toHaveBeenCalledWith('/api/admin/parties', undefined);
  });
});

describe('fetchFlaggedGuests', () => {
  it('requests only flagged guests and unwraps them', async () => {
    const spy = stubFetch({ guests: [{ id: GUEST_ID }] });

    await expect(fetchFlaggedGuests()).resolves.toEqual([{ id: GUEST_ID }]);
    expect(spy).toHaveBeenCalledWith('/api/admin/guests?flagged=true', undefined);
  });
});

describe('party writes', () => {
  it('POSTs a new party with its guests', async () => {
    const input: NewPartyBody = {
      displayName: 'The Smith Family',
      message: null,
      addGuestCap: 2,
      guests: [GUEST_FIELDS],
    };
    const spy = stubFetch({ id: PARTY_ID }, 201);

    await createParty(input);

    expect(spy).toHaveBeenCalledWith('/api/admin/parties', jsonInit('POST', input));
  });

  it('PATCHes party fields by id', async () => {
    const spy = stubFetch({ id: PARTY_ID });

    await updateParty(PARTY_ID, { displayName: 'Renamed', message: 'Hi', addGuestCap: 3 });

    expect(spy).toHaveBeenCalledWith(
      `/api/admin/parties/${PARTY_ID}`,
      jsonInit('PATCH', { displayName: 'Renamed', message: 'Hi', addGuestCap: 3 }),
    );
  });

  it('DELETEs a party without a body', async () => {
    const spy = stubFetch({ id: PARTY_ID });

    await deleteParty(PARTY_ID);

    expect(spy).toHaveBeenCalledWith(`/api/admin/parties/${PARTY_ID}`, { method: 'DELETE' });
  });
});

describe('guest writes', () => {
  it('POSTs a new guest with its party id', async () => {
    const spy = stubFetch({ id: GUEST_ID }, 201);

    await createGuest({ ...GUEST_FIELDS, partyId: PARTY_ID });

    expect(spy).toHaveBeenCalledWith(
      '/api/admin/guests',
      jsonInit('POST', { ...GUEST_FIELDS, partyId: PARTY_ID }),
    );
  });

  it('PATCHes guest fields, carrying the RSVP status an admin set', async () => {
    const spy = stubFetch({ id: GUEST_ID });

    await updateGuest(GUEST_ID, { ...GUEST_FIELDS, rsvpStatus: 'declined' });

    expect(spy).toHaveBeenCalledWith(
      `/api/admin/guests/${GUEST_ID}`,
      jsonInit('PATCH', { ...GUEST_FIELDS, rsvpStatus: 'declined' }),
    );
  });

  it('DELETEs a guest without a body', async () => {
    const spy = stubFetch({ id: GUEST_ID });

    await deleteGuest(GUEST_ID);

    expect(spy).toHaveBeenCalledWith(`/api/admin/guests/${GUEST_ID}`, { method: 'DELETE' });
  });

  it('POSTs a moderation decision as an action object', async () => {
    const spy = stubFetch({ id: GUEST_ID });

    await moderateGuest(GUEST_ID, 'approve');

    expect(spy).toHaveBeenCalledWith(
      `/api/admin/guests/${GUEST_ID}/moderate`,
      jsonInit('POST', { action: 'approve' }),
    );
  });
});

describe('failures', () => {
  it('surfaces the API error code', async () => {
    stubFetch({ error: 'This guest is not awaiting moderation', code: 'guest_not_flagged' }, 409);

    await expect(moderateGuest(GUEST_ID, 'remove')).rejects.toMatchObject({
      status: 409,
      code: 'guest_not_flagged',
    });
  });
});
