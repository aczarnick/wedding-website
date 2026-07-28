import { describe, it, expect } from 'vitest';
import { ALL_STATUSES, filterParties, summarizeGuests } from './partyList';
import type { AdminGuest, AdminParty } from '@/lib/admin/projections';

const guest = (overrides: Partial<AdminGuest>): AdminGuest => ({
  id: 'guest-id',
  partyId: 'party-id',
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: 'pending',
  songRequest: null,
  source: 'admin',
  flaggedForReview: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const party = (displayName: string, guests: AdminGuest[]): AdminParty => ({
  id: `party-${displayName}`,
  displayName,
  message: null,
  addGuestCap: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  guests,
});

const SMITHS = party('The Smith Family', [
  guest({ id: 'a', firstName: 'John', lastName: 'Smith', rsvpStatus: 'attending' }),
  guest({ id: 'b', firstName: 'Jane', lastName: 'Smith', rsvpStatus: 'pending' }),
]);

const RIVERAS = party('Alex Rivera & Guest', [
  guest({ id: 'c', firstName: 'Alex', lastName: 'Rivera', rsvpStatus: 'attending' }),
  guest({
    id: 'd',
    firstName: 'Sam',
    lastName: 'Rivera',
    rsvpStatus: 'pending',
    source: 'guest_added',
    flaggedForReview: true,
  }),
]);

const CHENS = party('The Chen Family', [
  guest({ id: 'e', firstName: 'Wei', lastName: 'Chen', rsvpStatus: 'declined' }),
]);

const ALL = [SMITHS, RIVERAS, CHENS];
const NO_FILTER = { query: '', status: ALL_STATUSES };

describe('summarizeGuests', () => {
  it('counts the total, each RSVP status and the flagged guests', () => {
    expect(summarizeGuests(RIVERAS.guests)).toEqual({
      total: 2,
      attending: 1,
      declined: 0,
      pending: 1,
      flagged: 1,
    });
  });

  it('returns zeroes for a party with no guests', () => {
    expect(summarizeGuests([])).toEqual({
      total: 0,
      attending: 0,
      declined: 0,
      pending: 0,
      flagged: 0,
    });
  });
});

describe('filterParties', () => {
  it('returns every party when nothing is filtered', () => {
    expect(filterParties(ALL, NO_FILTER)).toEqual(ALL);
  });

  it('matches the party display name case-insensitively', () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: 'cHeN' })).toEqual([CHENS]);
  });

  it("matches a guest's name even when the party name does not contain it", () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: 'wei' })).toEqual([CHENS]);
  });

  it('matches across a full name spanning the first/last boundary', () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: 'jane smith' })).toEqual([SMITHS]);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: '   rivera  ' })).toEqual([RIVERAS]);
  });

  it('returns nothing when no party or guest matches', () => {
    expect(filterParties(ALL, { ...NO_FILTER, query: 'nobody' })).toEqual([]);
  });

  it('keeps parties having at least one guest with the selected status', () => {
    expect(filterParties(ALL, { ...NO_FILTER, status: 'declined' })).toEqual([CHENS]);
    expect(filterParties(ALL, { ...NO_FILTER, status: 'attending' })).toEqual([SMITHS, RIVERAS]);
  });

  it('applies the query and the status together', () => {
    expect(filterParties(ALL, { query: 'family', status: 'declined' })).toEqual([CHENS]);
  });

  it('excludes a guestless party from every status filter', () => {
    const empty = party('Nobody Yet', []);

    expect(filterParties([empty], { ...NO_FILTER, status: 'pending' })).toEqual([]);
    expect(filterParties([empty], NO_FILTER)).toEqual([empty]);
  });
});
