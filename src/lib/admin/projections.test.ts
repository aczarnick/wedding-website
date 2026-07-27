import { describe, expect, it } from 'vitest';
import { toAdminGuest, toAdminParty, toPartyFields } from '@/lib/admin/projections';
import { GUEST_SOURCE, RSVP_STATUS } from '@/lib/enums';

const createdAt = new Date('2026-01-01T00:00:00Z');
const updatedAt = new Date('2026-02-01T00:00:00Z');

const guestRow = {
  id: 'guest-1',
  partyId: 'party-1',
  firstName: 'John',
  lastName: 'Smith',
  rsvpStatus: RSVP_STATUS.attending,
  songRequest: null,
  source: GUEST_SOURCE.admin,
  flaggedForReview: false,
  createdAt,
  updatedAt,
};

const partyRow = {
  id: 'party-1',
  displayName: 'The Smith Family',
  message: 'See you there',
  addGuestCap: 5,
  createdAt,
  updatedAt,
};

describe('toAdminGuest', () => {
  it('serializes timestamps as ISO strings', () => {
    expect(toAdminGuest(guestRow)).toEqual({
      ...guestRow,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('keeps the moderation flag that the guest API hides', () => {
    expect(toAdminGuest({ ...guestRow, flaggedForReview: true }).flaggedForReview).toBe(true);
  });
});

describe('toAdminParty', () => {
  it('nests the projected guests', () => {
    const party = toAdminParty(partyRow, [guestRow]);

    expect(party.guests).toEqual([toAdminGuest(guestRow)]);
    expect(party.displayName).toBe('The Smith Family');
  });
});

describe('toPartyFields', () => {
  it('reduces a party to the fields the change log records', () => {
    expect(toPartyFields(partyRow)).toEqual({
      displayName: 'The Smith Family',
      message: 'See you there',
      addGuestCap: 5,
    });
  });
});
